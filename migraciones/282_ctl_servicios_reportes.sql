-- 282 · Control y Auditoría · ETAPA 8 (SERVICIOS) · REPORTES: atenciones sin cobro, cuadre de insumos por periodo, ocupación del puesto (fase posterior) y evaluación de alertas.
--   · Todo reporte es SOLO para dueño y supervisor (capacidad ver_directo): la sucursal NUNCA recibe saldos, diferencias ni resultados de cuadre (criterio 1 y D5).
--   · Cada consulta de un reporte queda en la bitácora de consultas (ctl_log_consulta). Agregan en la base, no en el navegador.
--   · Se presentan como INDICADORES PARA INVESTIGAR: el sistema no acusa a nadie (con aviso en la respuesta y marca de muestra pequeña).
--   · Cuadre de insumos: real = salidas de inventario del insumo (consumo de consulta, venta, merma, ajustes y conteos; NO traspasos ni devoluciones al proveedor)
--     contra teórico = servicios cobrados × ctl_consumo_esperado, por periodo (semana, mes o total) y sucursal, con la diferencia en piezas y valor al costo.
--   · Ocupación (posterior al piloto, SIN hardware): registro manual (fuente 'manual') y cruce diario ocupaciones ↔ tickets de servicio con duración mínima configurable.
-- Depende de: 241 (ctl_rango, ctl_sedes_filtro, ctl_log_consulta, ctl_zona), 245 (ctl_alerta_nueva), 280, 281.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── periodo local de una marca de tiempo ─────────────────────────────
create or replace function piefirme_app.ctl_periodo(p_ts timestamptz, p_tz text, p_agrupar text, p_desde date) returns date
language sql immutable as $$
  select case p_agrupar when 'mes' then date_trunc('month', p_ts at time zone p_tz)::date when 'semana' then date_trunc('week', p_ts at time zone p_tz)::date else p_desde end
$$;

-- ───────────────────────────── 1 · atenciones sin cobro (por sucursal y por persona) ─────────────────────────────
create or replace function piefirme.ctl_rep_atenciones_sin_cobro(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); f jsonb := coalesce(p_filtros, '{}'::jsonb); r record; v_sedes uuid[]; v_suc jsonb; v_per jsonb; v_det jsonb; v_res jsonb;
begin
  select * into r from piefirme_app.ctl_rango(v_org, f, 30);
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);
  perform piefirme_app.ctl_log_consulta(v_org, 'servicios_atenciones_sin_cobro', f);
  create temp table if not exists _ctl_at_tmp (id uuid, sucursal_id uuid, sucursal text, usuario_atiende uuid, atiende text, servicio text, paciente_ref text, inicio_en timestamptz, fin_en timestamptz,
                                              estado text, clase text, minutos integer, motivo text, autorizo text) on commit drop;
  truncate _ctl_at_tmp;
  insert into _ctl_at_tmp
  select a.id, a.sucursal_id, sd.nombre, a.usuario_atiende, coalesce(nullif(trim(pa.nombre || ' ' || coalesce(pa.apellidos, '')), ''), 'Sin asignar'), sv.nombre, a.paciente_ref, a.inicio_en, a.fin_en, a.estado,
         case when a.estado = 'cerrada_con_ticket' then 'con_ticket' when a.estado = 'cancelada' then 'cancelada'
              when a.inicio_en < now() - make_interval(mins => piefirme_app.ctl_cfg_num(v_org, 'atencion_sin_ticket_min', a.sucursal_id)::integer) then 'vencida' else 'en_curso' end,
         case when a.estado = 'abierta' then round(extract(epoch from (now() - a.inicio_en)) / 60.0)::integer end,
         a.motivo_cancelacion, nullif(trim(ps.nombre || ' ' || coalesce(ps.apellidos, '')), '')
    from piefirme.ctl_atencion a
    join piefirme.sedes sd on sd.id = a.sucursal_id
    left join piefirme.servicios sv on sv.id = a.servicio_id
    left join piefirme.perfiles pa on pa.id = a.usuario_atiende
    left join piefirme.perfiles ps on ps.id = a.autorizado_por
   where a.organizacion_id = v_org and a.sucursal_id = any (v_sedes) and a.inicio_en >= r.v_ini and a.inicio_en < r.v_fin;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.pct_sin_ticket desc, x.sucursal), '[]'::jsonb) into v_suc from (
    select sucursal_id, sucursal, count(*)::integer as atenciones, count(*) filter (where clase = 'con_ticket')::integer as con_ticket, count(*) filter (where clase = 'cancelada')::integer as canceladas,
           count(*) filter (where clase = 'vencida')::integer as abiertas_sin_ticket, count(*) filter (where clase = 'en_curso')::integer as en_curso,
           round(100.0 * count(*) filter (where clase in ('cancelada', 'vencida')) / nullif(count(*) filter (where clase <> 'en_curso'), 0), 1) as pct_sin_ticket,
           count(*) < 10 as muestra_pequena
      from _ctl_at_tmp group by sucursal_id, sucursal) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pct_sin_ticket desc nulls last, x.persona), '[]'::jsonb) into v_per from (
    select usuario_atiende as persona_id, atiende as persona, count(*)::integer as atenciones, count(*) filter (where clase = 'con_ticket')::integer as con_ticket, count(*) filter (where clase = 'cancelada')::integer as canceladas,
           count(*) filter (where clase = 'vencida')::integer as abiertas_sin_ticket, count(*) filter (where clase = 'en_curso')::integer as en_curso,
           round(100.0 * count(*) filter (where clase in ('cancelada', 'vencida')) / nullif(count(*) filter (where clase <> 'en_curso'), 0), 1) as pct_sin_ticket,
           count(*) < 10 as muestra_pequena
      from _ctl_at_tmp group by usuario_atiende, atiende) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio_en desc), '[]'::jsonb) into v_det from (
    select id, sucursal_id, sucursal, atiende, servicio, paciente_ref, inicio_en, fin_en, estado, clase, minutos, motivo, autorizo
      from _ctl_at_tmp where clase in ('vencida', 'cancelada') order by inicio_en desc limit 200) x;
  select jsonb_build_object('atenciones', count(*)::integer, 'con_ticket', count(*) filter (where clase = 'con_ticket')::integer, 'canceladas', count(*) filter (where clase = 'cancelada')::integer,
                            'abiertas_sin_ticket', count(*) filter (where clase = 'vencida')::integer, 'en_curso', count(*) filter (where clase = 'en_curso')::integer,
                            'pct_sin_ticket', round(100.0 * count(*) filter (where clase in ('cancelada', 'vencida')) / nullif(count(*) filter (where clase <> 'en_curso'), 0), 1))
    into v_res from _ctl_at_tmp;
  return jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta, 'resumen', v_res, 'por_sucursal', v_suc, 'por_persona', v_per, 'detalle', v_det,
    'aviso', 'Indicador para investigar, no una conclusión: una atención sin ticket puede ser un cobro pendiente, una consulta sin cargo o un olvido de captura. Con menos de 10 atenciones la muestra es pequeña.');
end $$;

-- ───────────────────────────── 2 · cuadre de insumos por periodo y sucursal ─────────────────────────────
create or replace function piefirme.ctl_rep_cuadre_insumos(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); f jsonb := coalesce(p_filtros, '{}'::jsonb); r record; v_sedes uuid[]; v_tz text := piefirme_app.ctl_zona(v_org);
        v_agr text := coalesce(nullif(f ->> 'agrupar', ''), 'semana'); v_ins uuid[]; v_incl boolean := coalesce((f ->> 'incluir_ajustes')::boolean, true);
        v_insumos jsonb; v_sk jsonb; v_resumen jsonb;
begin
  if v_agr not in ('semana', 'mes', 'total') then raise exception 'agrupar debe ser semana, mes o total' using errcode = 'PF422'; end if;
  select * into r from piefirme_app.ctl_rango(v_org, f, 30);
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);
  perform piefirme_app.ctl_log_consulta(v_org, 'servicios_cuadre_insumos', f);
  select array_agg(distinct ce.insumo_producto_id) into v_ins from piefirme.ctl_consumo_esperado ce where ce.organizacion_id = v_org and ce.activo;
  if v_ins is null then
    return jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta, 'agrupar', v_agr, 'insumos', '[]'::jsonb, 'servicios_kits', '[]'::jsonb,
      'resumen', jsonb_build_object('filas', 0, 'fuera_de_cuadre', 0, 'diferencia_valor', 0),
      'aviso', 'No hay consumo esperado definido: el dueño lo define por servicio en «Consumo de insumos» para que el cuadre pueda calcularse.');
  end if;

  create temp table if not exists _ctl_cu_ins (periodo date, sucursal_id uuid, producto_id uuid, servicios numeric, teorico numeric, real numeric, consumo_consulta numeric, venta numeric,
                                               merma numeric, ajustes numeric) on commit drop;
  create temp table if not exists _ctl_cu_sk (periodo date, sucursal_id uuid, tickets integer, servicios numeric) on commit drop;
  truncate _ctl_cu_ins; truncate _ctl_cu_sk;

  insert into _ctl_cu_sk
  select piefirme_app.ctl_periodo(o.cobrada_en, v_tz, v_agr, r.v_desde), o.sucursal_id, count(distinct o.venta_id)::integer, sum(o.unidades)
    from piefirme_app.ctl_o_servicios_cobrados(v_org, v_sedes, r.v_ini, r.v_fin) o group by 1, 2;

  insert into _ctl_cu_ins
  with teo as (
    select piefirme_app.ctl_periodo(o.cobrada_en, v_tz, v_agr, r.v_desde) as periodo, o.sucursal_id, ce.insumo_producto_id as producto_id, sum(o.unidades) as servicios, sum(o.unidades * ce.cantidad) as teorico
      from piefirme_app.ctl_o_servicios_cobrados(v_org, v_sedes, r.v_ini, r.v_fin) o
      join piefirme.ctl_consumo_esperado ce on ce.organizacion_id = v_org and ce.servicio_id = o.servicio_id and ce.activo
     group by 1, 2, 3),
  sal as (
    select piefirme_app.ctl_periodo(s.fecha, v_tz, v_agr, r.v_desde) as periodo, s.sucursal_id, s.producto_id,
           sum(s.cantidad) filter (where s.tipo = 'consumo_consulta') as consumo_consulta, sum(s.cantidad) filter (where s.tipo = 'venta') as venta,
           sum(s.cantidad) filter (where s.tipo = 'merma') as merma, sum(s.cantidad) filter (where s.tipo in ('ajuste', 'conteo')) as ajustes
      from piefirme_app.ctl_o_salidas_insumo(v_org, v_sedes, v_ins, r.v_ini, r.v_fin) s group by 1, 2, 3)
  select coalesce(t.periodo, s.periodo), coalesce(t.sucursal_id, s.sucursal_id), coalesce(t.producto_id, s.producto_id), coalesce(t.servicios, 0), coalesce(t.teorico, 0),
         coalesce(s.consumo_consulta, 0) + coalesce(s.venta, 0) + coalesce(s.merma, 0) + case when v_incl then coalesce(s.ajustes, 0) else 0 end,
         coalesce(s.consumo_consulta, 0), coalesce(s.venta, 0), coalesce(s.merma, 0), coalesce(s.ajustes, 0)
    from teo t full join sal s on s.periodo = t.periodo and s.sucursal_id = t.sucursal_id and s.producto_id = t.producto_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.periodo desc, x.sucursal, x.insumo), '[]'::jsonb) into v_insumos from (
    select c.periodo, c.sucursal_id, sd.nombre as sucursal, c.producto_id as insumo_id, pr.nombre as insumo, c.servicios as servicios_cobrados,
           c.teorico, c.real, c.real - c.teorico as diferencia_piezas, piefirme_app.ctl_o_costo_producto(v_org, c.producto_id) as costo_unitario,
           round((c.real - c.teorico) * piefirme_app.ctl_o_costo_producto(v_org, c.producto_id), 2) as diferencia_valor,
           case when c.teorico > 0 and c.servicios > 0 and c.real - c.teorico > 0 then round((c.real - c.teorico) / (c.teorico / c.servicios))::integer else 0 end as servicios_sin_cobro_est,
           case when abs(c.real - c.teorico) <= coalesce(piefirme_app.ctl_cfg_num(v_org, 'tolerancia_kits', c.sucursal_id), 0) then 'cuadra' when c.real > c.teorico then 'consumo_mayor' else 'consumo_menor' end as estado,
           jsonb_build_object('consumo_consulta', c.consumo_consulta, 'venta', c.venta, 'merma', c.merma, 'ajustes_y_conteos', c.ajustes) as salidas
      from _ctl_cu_ins c join piefirme.sedes sd on sd.id = c.sucursal_id join piefirme.productos pr on pr.id = c.producto_id) x;

  select coalesce(jsonb_agg(to_jsonb(y) order by y.periodo desc, y.sucursal), '[]'::jsonb) into v_sk from (
    select k.periodo, k.sucursal_id, sd.nombre as sucursal,
           coalesce(s.tickets, 0) as tickets_servicio, coalesce(s.servicios, 0) as servicios_cobrados,
           coalesce(i.esperadas, 0) as piezas_esperadas, coalesce(i.usadas, 0) as piezas_usadas, coalesce(i.sin_cobro, 0)::integer as servicios_sin_cobro_est,
           coalesce(a.total, 0)::integer as atenciones, coalesce(a.cerradas, 0)::integer as atenciones_con_ticket, coalesce(a.canceladas, 0)::integer as atenciones_canceladas, coalesce(a.abiertas, 0)::integer as atenciones_abiertas,
           coalesce(a.horas, '[]'::jsonb) as atenciones_sin_ticket
      from (select periodo, sucursal_id from _ctl_cu_sk union select periodo, sucursal_id from _ctl_cu_ins
            union select piefirme_app.ctl_periodo(at.inicio_en, v_tz, v_agr, r.v_desde), at.sucursal_id from piefirme.ctl_atencion at
                   where at.organizacion_id = v_org and at.sucursal_id = any (v_sedes) and at.inicio_en >= r.v_ini and at.inicio_en < r.v_fin) k
      join piefirme.sedes sd on sd.id = k.sucursal_id
      left join _ctl_cu_sk s on s.periodo = k.periodo and s.sucursal_id = k.sucursal_id
      left join lateral (select sum(c.teorico) as esperadas, sum(c.real) as usadas,
                                max(case when c.teorico > 0 and c.servicios > 0 and c.real - c.teorico > 0 then round((c.real - c.teorico) / (c.teorico / c.servicios)) else 0 end) as sin_cobro
                           from _ctl_cu_ins c where c.periodo = k.periodo and c.sucursal_id = k.sucursal_id) i on true
      left join lateral (select count(*) as total, count(*) filter (where at.estado = 'cerrada_con_ticket') as cerradas, count(*) filter (where at.estado = 'cancelada') as canceladas,
                                count(*) filter (where at.estado = 'abierta') as abiertas,
                                (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'inicio_en', z.inicio_en, 'estado', z.estado, 'servicio', zs.nombre, 'paciente_ref', z.paciente_ref) order by z.inicio_en), '[]'::jsonb)
                                   from piefirme.ctl_atencion z left join piefirme.servicios zs on zs.id = z.servicio_id
                                  where z.organizacion_id = v_org and z.sucursal_id = k.sucursal_id and z.estado in ('abierta', 'cancelada') and z.inicio_en >= r.v_ini and z.inicio_en < r.v_fin
                                    and piefirme_app.ctl_periodo(z.inicio_en, v_tz, v_agr, r.v_desde) = k.periodo) as horas
                           from piefirme.ctl_atencion at where at.organizacion_id = v_org and at.sucursal_id = k.sucursal_id and at.inicio_en >= r.v_ini and at.inicio_en < r.v_fin
                            and piefirme_app.ctl_periodo(at.inicio_en, v_tz, v_agr, r.v_desde) = k.periodo) a on true) y;

  select jsonb_build_object('filas', count(*)::integer, 'fuera_de_cuadre', count(*) filter (where e ->> 'estado' <> 'cuadra')::integer,
                            'diferencia_valor', coalesce(sum((e ->> 'diferencia_valor')::numeric), 0), 'servicios_sin_cobro_est', coalesce(sum((e ->> 'servicios_sin_cobro_est')::integer), 0))
    into v_resumen from jsonb_array_elements(v_insumos) e;
  return jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta, 'agrupar', v_agr, 'incluye_ajustes', v_incl, 'insumos', v_insumos, 'servicios_kits', v_sk, 'resumen', v_resumen,
    'aviso', 'Indicador para investigar: un consumo mayor al teórico puede ser un servicio sin cobro, merma no registrada, un consumo esperado mal definido o inventario ajustado; el desglose de salidas ayuda a distinguirlos. «Servicios sin cobro (est.)» divide la diferencia entre las piezas que consume un servicio.');
end $$;

-- ───────────────────────────── 3 · ocupación del puesto (FASE POSTERIOR AL PILOTO; sin hardware) ─────────────────────────────
create or replace function piefirme.ctl_ocupacion_registrar(p_id uuid, p_sucursal uuid, p_inicio timestamptz, p_fin timestamptz, p_puesto uuid default null, p_puesto_nombre text default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); o piefirme.ctl_ocupacion%rowtype; v_nom text := nullif(btrim(left(p_puesto_nombre, 60)), '');
begin
  if p_id is null then raise exception 'falta el identificador de la ocupación' using errcode = 'PF400'; end if;
  select * into o from piefirme.ctl_ocupacion where id = p_id and organizacion_id = v_org;
  if found then return jsonb_build_object('ok', true, 'idempotente', true, 'id', o.id, 'duracion_min', o.duracion_min); end if;
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org and s.activa) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  if p_inicio is null or p_fin is null or p_fin <= p_inicio then raise exception 'la ocupación necesita inicio y un fin posterior' using errcode = 'PF422'; end if;
  if p_fin > now() + interval '5 minutes' then raise exception 'la ocupación no puede terminar en el futuro (hora del servidor)' using errcode = 'PF422'; end if;
  if p_inicio < now() - interval '35 days' then raise exception 'solo se registran ocupaciones de los últimos 35 días' using errcode = 'PF422'; end if;
  if p_fin - p_inicio > interval '12 hours' then raise exception 'una ocupación no puede durar más de 12 horas' using errcode = 'PF422'; end if;
  if p_puesto is not null and not exists (select 1 from piefirme.cabinas c where c.id = p_puesto and c.organizacion_id = v_org and c.sede_id = p_sucursal) then
    raise exception 'el puesto no pertenece a esta sucursal' using errcode = 'PF422';
  end if;
  if exists (select 1 from piefirme.ctl_ocupacion x where x.organizacion_id = v_org and x.sucursal_id = p_sucursal and x.puesto_id is not distinct from p_puesto
                and x.puesto_nombre is not distinct from v_nom and x.fin_en is not null and tstzrange(x.inicio_en, x.fin_en) && tstzrange(p_inicio, p_fin)) then
    raise exception 'ese puesto ya tiene una ocupación registrada que se traslapa con este horario' using errcode = 'PF409';
  end if;
  insert into piefirme.ctl_ocupacion (id, organizacion_id, sucursal_id, puesto_id, puesto_nombre, inicio_en, fin_en, fuente, hora_cliente)
  values (p_id, v_org, p_sucursal, p_puesto, v_nom, p_inicio, p_fin, 'manual', p_hora_cliente) returning * into o;
  return jsonb_build_object('ok', true, 'idempotente', false, 'id', o.id, 'duracion_min', o.duracion_min);
end $$;

-- Cruce de un día local en una sucursal: cada ocupación (de duración ≥ mínimo) busca su ticket de servicio más cercano dentro de la ventana; las que quedan sin ticket son cobros faltantes.
create or replace function piefirme_app.ctl_ocupacion_cruce_dia(p_org uuid, p_sucursal uuid, p_dia date) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_tz text := piefirme_app.ctl_zona(p_org); v_ini timestamptz := p_dia::timestamp at time zone v_tz; v_fin timestamptz := (p_dia + 1)::timestamp at time zone v_tz;
        v_min numeric := piefirme_app.ctl_cfg_num(p_org, 'ocupacion_min_min', p_sucursal); v_win interval := make_interval(mins => piefirme_app.ctl_cfg_num(p_org, 'ocupacion_ventana_cobro_min', p_sucursal)::integer);
        o record; v_t uuid; v_usados uuid[] := '{}'; v_falt jsonb := '[]'::jsonb; v_validas integer := 0; v_ign integer := 0; v_abiertas integer; v_tickets integer; v_usados_dia integer := 0; v_cobr timestamptz;
begin
  select count(*) into v_abiertas from piefirme.ctl_ocupacion x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal and x.inicio_en >= v_ini and x.inicio_en < v_fin and x.fin_en is null;
  select count(distinct t.venta_id) into v_tickets from piefirme_app.ctl_o_servicios_cobrados(p_org, array[p_sucursal], v_ini, v_fin) t;
  for o in select x.* from piefirme.ctl_ocupacion x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal and x.inicio_en >= v_ini and x.inicio_en < v_fin and x.fin_en is not null order by x.inicio_en loop
    if o.duracion_min < v_min then v_ign := v_ign + 1; continue; end if;
    v_validas := v_validas + 1;
    select t.venta_id, t.cobrada_en into v_t, v_cobr from (select distinct on (s.venta_id) s.venta_id, s.cobrada_en from piefirme_app.ctl_o_servicios_cobrados(p_org, array[p_sucursal], o.inicio_en - v_win, o.fin_en + v_win) s) t
     where not (t.venta_id = any (v_usados)) order by abs(extract(epoch from (t.cobrada_en - o.fin_en))) limit 1;
    if v_t is null then
      v_falt := v_falt || jsonb_build_array(jsonb_build_object('ocupacion_id', o.id, 'inicio_en', o.inicio_en, 'fin_en', o.fin_en, 'duracion_min', o.duracion_min, 'puesto', o.puesto_nombre, 'puesto_id', o.puesto_id));
    else
      v_usados := v_usados || v_t;
      if v_cobr >= v_ini and v_cobr < v_fin then v_usados_dia := v_usados_dia + 1; end if;
    end if;
    v_t := null;
  end loop;
  return jsonb_build_object('fecha', p_dia, 'sucursal_id', p_sucursal, 'ocupaciones', v_validas, 'ocupaciones_menores_al_minimo', v_ign, 'ocupaciones_abiertas', v_abiertas,
                            'tickets_servicio', v_tickets, 'cobros_faltantes', jsonb_array_length(v_falt), 'tickets_sin_ocupacion', greatest(0, v_tickets - v_usados_dia), 'faltantes', v_falt,
                            'minimo_min', v_min, 'ventana_min', extract(epoch from v_win) / 60);
end $$;

create or replace function piefirme.ctl_ocupacion_cruce(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); f jsonb := coalesce(p_filtros, '{}'::jsonb); r record; v_sedes uuid[]; s record; d date; v_c jsonb; v_dias jsonb := '[]'::jsonb;
begin
  select * into r from piefirme_app.ctl_rango(v_org, f, 7);
  if r.v_hasta - r.v_desde > 61 then raise exception 'El cruce de ocupación abarca como máximo 62 días.' using errcode = 'PF422'; end if;
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);
  perform piefirme_app.ctl_log_consulta(v_org, 'servicios_ocupacion_cruce', f);
  for s in select x.id, x.nombre from piefirme.sedes x where x.id = any (v_sedes) order by x.nombre loop
    for d in select g::date from generate_series(r.v_desde, r.v_hasta, interval '1 day') g loop
      v_c := piefirme_app.ctl_ocupacion_cruce_dia(v_org, s.id, d);
      if (v_c ->> 'ocupaciones')::integer > 0 or (v_c ->> 'tickets_servicio')::integer > 0 or (v_c ->> 'ocupaciones_menores_al_minimo')::integer > 0 then
        v_dias := v_dias || jsonb_build_array(v_c || jsonb_build_object('sucursal', s.nombre));
      end if;
    end loop;
  end loop;
  return jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta, 'fase', 'posterior_al_piloto', 'dias', v_dias,
    'resumen', jsonb_build_object('ocupaciones', coalesce((select sum((e ->> 'ocupaciones')::integer) from jsonb_array_elements(v_dias) e), 0),
                                  'tickets_servicio', coalesce((select sum((e ->> 'tickets_servicio')::integer) from jsonb_array_elements(v_dias) e), 0),
                                  'cobros_faltantes', coalesce((select sum((e ->> 'cobros_faltantes')::integer) from jsonb_array_elements(v_dias) e), 0)),
    'aviso', 'Fase posterior al piloto: no hay sensor conectado; las ocupaciones se registran a mano (fuente «manual»). Indicador para investigar: una ocupación sin ticket puede ser una consulta sin cargo o un registro tardío.');
end $$;

-- ───────────────────────────── 4 · evaluación de alertas del módulo de servicios ─────────────────────────────
create or replace function piefirme_app.ctl_servicios_evaluar(p_org uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a record; s record; v_lig integer; v_nuevas integer := 0; v_antes integer; v_dia date := piefirme_app.ctl_hoy(p_org) - 1; v_c jsonb; v_oc integer := 0; v_ref text;
begin
  v_lig := piefirme_app.ctl_atencion_autoligar(p_org);
  for a in select x.id, x.sucursal_id, x.inicio_en, x.paciente_ref, sd.nombre as sucursal, sv.nombre as servicio from piefirme.ctl_atencion x
             join piefirme.sedes sd on sd.id = x.sucursal_id left join piefirme.servicios sv on sv.id = x.servicio_id
            where x.organizacion_id = p_org and x.estado = 'abierta'
              and x.inicio_en < now() - make_interval(mins => piefirme_app.ctl_cfg_num(p_org, 'atencion_sin_ticket_min', x.sucursal_id)::integer) loop
    select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'atencion_sin_ticket' and referencia_id = a.id;
    perform piefirme_app.ctl_alerta_nueva(p_org, a.sucursal_id, 'atencion_sin_ticket',
      format('%s: una atención de «%s» (ref. %s) lleva %s min abierta sin ticket. Conviene revisarla; puede ser un cobro pendiente o un olvido de captura.', a.sucursal, coalesce(a.servicio, 'servicio'), coalesce(a.paciente_ref, 's/ref'),
             round(extract(epoch from (now() - a.inicio_en)) / 60.0)::integer), 'ctl_atencion', a.id);
    if v_antes = 0 then v_nuevas := v_nuevas + 1; end if;
  end loop;
  -- ocupación de AYER (solo sucursales que registraron ocupaciones): fase posterior al piloto
  v_ref := 'ocupacion:' || v_dia::text;
  for s in select distinct x.sucursal_id, sd.nombre from piefirme.ctl_ocupacion x join piefirme.sedes sd on sd.id = x.sucursal_id
            where x.organizacion_id = p_org and x.inicio_en >= (v_dia::timestamp at time zone piefirme_app.ctl_zona(p_org)) and x.inicio_en < ((v_dia + 1)::timestamp at time zone piefirme_app.ctl_zona(p_org)) loop
    v_c := piefirme_app.ctl_ocupacion_cruce_dia(p_org, s.sucursal_id, v_dia);
    if (v_c ->> 'cobros_faltantes')::integer > 0 then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'ocupacion_sin_cobro' and referencia_tipo = v_ref and referencia_id = s.sucursal_id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.sucursal_id, 'ocupacion_sin_cobro',
        format('%s: el %s hubo %s ocupación(es) del puesto y %s ticket(s) de servicio; faltan %s cobro(s).', s.nombre, v_dia, v_c ->> 'ocupaciones', v_c ->> 'tickets_servicio', v_c ->> 'cobros_faltantes'), v_ref, s.sucursal_id);
      if v_antes = 0 then v_oc := v_oc + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('atenciones_ligadas', v_lig, 'alertas_atencion_nuevas', v_nuevas, 'alertas_ocupacion_nuevas', v_oc);
end $$;

create or replace function piefirme.ctl_servicios_evaluar_ahora() returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  return piefirme_app.ctl_servicios_evaluar(v_org);
end $$;

-- ───────────────────────────── privilegios de ejecución ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_rep_atenciones_sin_cobro', 'ctl_rep_cuadre_insumos', 'ctl_ocupacion_registrar', 'ctl_ocupacion_cruce',
                  'ctl_ocupacion_cruce_dia', 'ctl_servicios_evaluar', 'ctl_servicios_evaluar_ahora', 'ctl_periodo') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma);
    else execute format('revoke all on function %s from authenticated', f.firma); end if;
  end loop;
end $$;
