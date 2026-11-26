-- 245 · Control y Auditoría · ETAPA 6 · F7.3 MOTOR DE ALERTAS.
-- Regla de diseño de la especificación: pocas alertas que importen. Cada alerta que nace en ctl_alerta (la crean los motores de las Etapas 2–4, las evaluaciones programadas
-- de aquí y, más adelante, la custodia y el punto de venta) se DESPACHA con un trigger:
--   1. se busca la regla vigente del evento (catálogo del sistema + reglas versionadas de la organización): canales, destinatarios, inmediata/solo resumen, activa;
--   2. se resuelven los destinatarios (dueño = administrador que no es soporte RANNIX; supervisor con acceso a la sucursal; «sucursal» = dispositivos de la sucursal);
--   3. TECHO DIARIO por destinatario (propio o, si no tiene, el parámetro alertas_techo_diario): mientras no se exceda, una fila «individual» por canal; al excederlo se
--      escribe UN aviso («se alcanzó el techo») y el resto se AGRUPA como «pendiente de resumen»; los eventos de resumen (p. ej. folio faltante) no cuentan para el techo;
--   4. el resumen diario (ctl_resumen_diario) arma un solo correo por persona con lo agrupado y lo que sigue sin atender.
-- Los envíos por Push/WhatsApp/correo son SIMULADOS: no hay llaves ni proveedor. Cada fila de ctl_alerta_envio es «lo que se habría enviado» (simulado = true);
-- el adaptador real, cuando exista, enviará y registrará una fila nueva con simulado = false (ver src/lib/adaptadores/alertasAuditoria.js).
-- HOY NO HAY PLANIFICADOR: las evaluaciones por hora (sin conteo de apertura, sin cierre, sin sincronizar), la detección de cancelaciones y piezas de alto valor y el
-- resumen diario se invocan a mano (scripts/auditoria-alertas-programadas.mjs, o el botón «Evaluar ahora» del dueño) o con la función de Netlify programada (comentada).
-- Depende de: 200–206, 210–213, 220–223, 230–235, 240, 241.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── regla efectiva de un evento ─────────────────────────────
create or replace function piefirme_app.ctl_alerta_regla_efectiva(p_org uuid, p_tipo text)
returns table (tipo text, nombre text, canales text[], destinatarios text[], inmediata boolean, activa boolean, severidad text, personalizada boolean)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select c.tipo, c.nombre, coalesce(r.canales, c.canales), coalesce(r.destinatarios, c.destinatarios), coalesce(r.inmediata, c.inmediata), coalesce(r.activa, true), c.severidad, r.id is not null
    from piefirme.ctl_alerta_catalogo c
    left join lateral (select x.* from piefirme.ctl_alerta_regla x where x.organizacion_id = p_org and x.tipo = c.tipo order by x.creado_en desc, x.id limit 1) r on true
   where c.tipo = p_tipo
$$;

-- ───────────────────────────── destinatarios de una alerta ─────────────────────────────
create or replace function piefirme_app.ctl_alerta_destinatarios(p_org uuid, p_sucursal uuid, p_roles text[])
returns table (usuario_id uuid, rol text, nombre text, email text, telefono text, techo integer, recibir boolean, sedes uuid[])
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select p.id, case p.rol::text when 'administrador' then 'dueno' when 'supervisor' then 'supervisor' else 'sucursal' end,
         coalesce(nullif(trim(p.nombre || ' ' || coalesce(p.apellidos, '')), ''), p.email), p.email, p.telefono, d.techo_diario, coalesce(d.recibir, true), p.sedes
    from piefirme.perfiles p
    left join lateral (select x.techo_diario, x.recibir from piefirme.ctl_alerta_destinatario x
                        where x.organizacion_id = p.organizacion_id and x.usuario_id = p.id order by x.creado_en desc, x.id limit 1) d on true
   where p.organizacion_id = p_org and p.activo and not exists (select 1 from piefirme.rannix_staff rs where rs.user_id = p.id)
     and (('dueno' = any (p_roles) and p.rol::text = 'administrador')
       or ('supervisor' = any (p_roles) and p.rol::text = 'supervisor' and (p_sucursal is null or cardinality(p.sedes) = 0 or p_sucursal = any (p.sedes)))
       or ('sucursal' = any (p_roles) and p.rol::text in ('recepcion', 'podologo') and p_sucursal is not null and (cardinality(p.sedes) = 0 or p_sucursal = any (p.sedes))))
$$;

create or replace function piefirme_app.ctl_envio_insertar(p_org uuid, p_alerta uuid, p_sucursal uuid, p_dest uuid, p_rol text, p_canal text, p_modo text,
                                                           p_asunto text, p_mensaje text, p_destino text, p_payload jsonb, p_fecha date) returns void
language sql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  insert into piefirme.ctl_alerta_envio (organizacion_id, alerta_id, sucursal_id, destinatario_id, rol_destinatario, canal, modo, asunto, mensaje, destino, payload, simulado, fecha_local)
  values (p_org, p_alerta, p_sucursal, p_dest, p_rol, p_canal, p_modo, p_asunto, p_mensaje, p_destino, coalesce(p_payload, '{}'::jsonb), true, p_fecha)
$$;

create or replace function piefirme_app.ctl_envio_destino(p_canal text, p_nombre text, p_email text, p_telefono text) returns text
language sql immutable as $$
  select case p_canal when 'push' then 'dispositivos de ' || coalesce(p_nombre, '(sin nombre)')
                      when 'whatsapp' then coalesce(nullif(p_telefono, ''), 'sin teléfono registrado')
                      else coalesce(nullif(p_email, ''), 'sin correo registrado') end
$$;

-- ───────────────────────────── despacho de una alerta (trigger y recuperación) ─────────────────────────────
create or replace function piefirme_app.ctl_alerta_despachar(p_alerta uuid) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a piefirme.ctl_alerta%rowtype; g record; d record; v_hoy date; v_techo integer; v_n integer; v_canal text; v_canales text[]; v_roles text[]; v_inm boolean; v_nombre text;
        v_filas integer := 0; v_asunto text; v_suc text; v_org uuid;
begin
  select * into a from piefirme.ctl_alerta where id = p_alerta;
  if not found then return 0; end if;
  if exists (select 1 from piefirme.ctl_alerta_envio e where e.alerta_id = a.id) then return 0; end if;   -- idempotente: una alerta se despacha una sola vez
  v_org := a.organizacion_id; v_hoy := piefirme_app.ctl_hoy(v_org);
  select * into g from piefirme_app.ctl_alerta_regla_efectiva(v_org, a.tipo);
  if found then
    if not g.activa then
      perform piefirme_app.ctl_envio_insertar(v_org, a.id, a.sucursal_id, null, null, null, 'regla_desactivada', g.nombre, a.mensaje, null, jsonb_build_object('tipo', a.tipo), v_hoy);
      return 0;
    end if;
    v_canales := g.canales; v_roles := g.destinatarios; v_inm := g.inmediata; v_nombre := g.nombre;
  else   -- evento que aún no está en el catálogo: se comporta como push inmediato a quienes indicó quien lo emitió
    v_canales := array['push']; v_roles := array(select x from unnest(a.destinatarios) x where x in ('dueno', 'supervisor', 'sucursal')); v_inm := true; v_nombre := a.tipo;
  end if;
  select s.nombre into v_suc from piefirme.sedes s where s.id = a.sucursal_id;
  v_asunto := v_nombre || coalesce(' · ' || v_suc, '');
  for d in select * from piefirme_app.ctl_alerta_destinatarios(v_org, a.sucursal_id, v_roles) loop
    continue when not d.recibir;
    if not v_inm then   -- solo resumen: no cuenta para el techo
      perform piefirme_app.ctl_envio_insertar(v_org, a.id, a.sucursal_id, d.usuario_id, d.rol, 'correo', 'pendiente_resumen', v_asunto, a.mensaje,
                                              piefirme_app.ctl_envio_destino('correo', d.nombre, d.email, d.telefono), jsonb_build_object('tipo', a.tipo, 'severidad', a.severidad), v_hoy);
      v_filas := v_filas + 1; continue;
    end if;
    v_techo := coalesce(d.techo, piefirme_app.ctl_cfg_num(v_org, 'alertas_techo_diario', a.sucursal_id)::integer);
    select count(distinct e.alerta_id) into v_n from piefirme.ctl_alerta_envio e
     where e.organizacion_id = v_org and e.destinatario_id = d.usuario_id and e.fecha_local = v_hoy and e.modo = 'individual';
    if v_n < v_techo then
      foreach v_canal in array v_canales loop
        perform piefirme_app.ctl_envio_insertar(v_org, a.id, a.sucursal_id, d.usuario_id, d.rol, v_canal, 'individual', v_asunto, a.mensaje,
                                                piefirme_app.ctl_envio_destino(v_canal, d.nombre, d.email, d.telefono), jsonb_build_object('tipo', a.tipo, 'severidad', a.severidad), v_hoy);
        v_filas := v_filas + 1;
      end loop;
    else   -- techo excedido: un solo aviso por persona y día; el resto se agrupa para el resumen
      if not exists (select 1 from piefirme.ctl_alerta_envio e where e.organizacion_id = v_org and e.destinatario_id = d.usuario_id and e.fecha_local = v_hoy and e.modo = 'aviso_techo') then
        perform piefirme_app.ctl_envio_insertar(v_org, a.id, a.sucursal_id, d.usuario_id, d.rol, v_canales[1], 'aviso_techo', 'Techo diario de alertas alcanzado',
                                                format('Ya se enviaron %s alertas hoy (techo diario). Las siguientes se agrupan en el resumen diario; también las verá en la bandeja de alertas.', v_techo),
                                                piefirme_app.ctl_envio_destino(v_canales[1], d.nombre, d.email, d.telefono), jsonb_build_object('techo', v_techo), v_hoy);
      end if;
      perform piefirme_app.ctl_envio_insertar(v_org, a.id, a.sucursal_id, d.usuario_id, d.rol, 'correo', 'pendiente_resumen', v_asunto, a.mensaje,
                                              piefirme_app.ctl_envio_destino('correo', d.nombre, d.email, d.telefono), jsonb_build_object('tipo', a.tipo, 'severidad', a.severidad, 'por_techo', true), v_hoy);
      v_filas := v_filas + 1;
    end if;
  end loop;
  if v_filas = 0 then
    perform piefirme_app.ctl_envio_insertar(v_org, a.id, a.sucursal_id, null, null, null, 'sin_destinatario', v_asunto, a.mensaje, null, jsonb_build_object('tipo', a.tipo, 'roles', v_roles), v_hoy);
  end if;
  return v_filas;
end $$;

-- Una falla del despacho NUNCA debe tumbar la operación que generó la alerta (un cierre, un conteo, un ajuste): se avisa y se sigue.
create or replace function piefirme_app.ctl_trg_alerta_despachar() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  begin
    perform piefirme_app.ctl_alerta_despachar(new.id);
  exception when others then
    raise warning 'ctl_alerta_despachar(%): %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists t_30_despachar on piefirme.ctl_alerta;
create trigger t_30_despachar after insert on piefirme.ctl_alerta for each row execute function piefirme_app.ctl_trg_alerta_despachar();

-- Despacha las alertas de las últimas 24 h que no tengan fila de envío (recuperación; idempotente).
create or replace function piefirme_app.ctl_alertas_despachar_pendientes(p_org uuid) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a record; v_n integer := 0;
begin
  for a in select x.id from piefirme.ctl_alerta x
            where x.organizacion_id = p_org and x.creado_en >= now() - interval '1 day' and not exists (select 1 from piefirme.ctl_alerta_envio e where e.alerta_id = x.id) order by x.creado_en loop
    perform piefirme_app.ctl_alerta_despachar(a.id); v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ───────────────────────────── crear una alerta desde cualquier motor (con severidad y destinatarios del catálogo y sin duplicar) ─────────────────────────────
-- Las etapas que aún no emiten (Etapa 1: cancelación autorizada; Etapa 7: sello roto, folio faltante) la llaman así. Con p_dedupe y referencia, el mismo hecho no genera dos alertas.
create or replace function piefirme_app.ctl_alerta_nueva(p_org uuid, p_sucursal uuid, p_tipo text, p_mensaje text, p_ref_tipo text default null, p_ref_id uuid default null,
                                                         p_severidad text default null, p_dedupe boolean default true) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.ctl_alerta_catalogo%rowtype; v_id uuid;
begin
  select * into c from piefirme.ctl_alerta_catalogo where tipo = p_tipo;
  if not found then raise exception 'evento de alerta desconocido: %', p_tipo using errcode = 'PF400'; end if;
  if p_dedupe and p_ref_id is not null then
    select a.id into v_id from piefirme.ctl_alerta a
     where a.organizacion_id = p_org and a.tipo = p_tipo and a.referencia_id = p_ref_id and a.referencia_tipo is not distinct from p_ref_tipo limit 1;
    if found then return v_id; end if;
  end if;
  insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
  values (p_org, p_sucursal, p_tipo, coalesce(p_severidad, c.severidad), c.destinatarios, p_mensaje, p_ref_tipo, p_ref_id) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── lecturas del origen para las evaluaciones (capa de desacoplamiento: todo lo del origen vive en funciones ctl_o_*) ─────────────────────────────
create or replace function piefirme_app.ctl_o_opero(p_org uuid, p_sucursal uuid, p_ini timestamptz, p_fin timestamptz) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.ventas v where v.organizacion_id = p_org and v.sede_id = p_sucursal and v.cobrada_en >= p_ini and v.cobrada_en < p_fin)
      or exists (select 1 from piefirme.turnos_caja t where t.organizacion_id = p_org and t.sede_id = p_sucursal and t.apertura_en >= p_ini and t.apertura_en < p_fin)
$$;

create or replace function piefirme_app.ctl_o_cancelaciones_desde(p_org uuid, p_desde timestamptz)
returns table (venta_id uuid, sucursal_id uuid, ticket text, total numeric, cancelada_en timestamptz, usuario_id uuid, motivo text)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select v.id, v.sede_id, v.folio, v.total, v.cancelada_en, v.cancelada_por, v.motivo_cancelacion
    from piefirme.ventas v where v.organizacion_id = p_org and v.estado = 'cancelada' and v.cancelada_en >= p_desde
$$;

create or replace function piefirme_app.ctl_o_ventas_alto_valor_desde(p_org uuid, p_desde timestamptz)
returns table (linea_id uuid, sucursal_id uuid, ticket text, producto text, cantidad numeric, importe numeric, cobrada_en timestamptz)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select l.id, v.sede_id, v.folio, coalesce(l.descripcion, pr.nombre), l.cantidad, l.importe, v.cobrada_en
    from piefirme.venta_lineas l
    join piefirme.ventas v on v.id = l.venta_id
    join piefirme.ctl_producto_atributo a on a.producto_id = l.producto_id and a.organizacion_id = v.organizacion_id and a.alto_valor
    left join piefirme.productos pr on pr.id = l.producto_id
   where v.organizacion_id = p_org and v.estado in ('cobrada', 'por_facturar', 'facturada') and v.cobrada_en >= p_desde
$$;

-- ───────────────────────────── evaluaciones programadas de una organización ─────────────────────────────
-- p_ahora permite probar con un reloj simulado. Cada hallazgo se emite UNA vez por día y sucursal (referencia «dia:AAAA-MM-DD»).
create or replace function piefirme_app.ctl_alertas_programadas_org(p_org uuid, p_ahora timestamptz default now(), p_ventana interval default interval '2 days') returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s record; c record; v_tz text := piefirme_app.ctl_zona(p_org); v_local timestamp := p_ahora at time zone v_tz; v_hoy date := v_local::date; v_hora integer := extract(hour from v_local)::integer;
        v_ini timestamptz := v_hoy::timestamp at time zone v_tz; v_fin timestamptz := (v_hoy + 1)::timestamp at time zone v_tz; v_h_ap integer; v_h_ci integer; v_hs integer;
        v_ref text := 'dia:' || v_hoy::text; v_ap integer := 0; v_ci integer := 0; v_sy integer := 0; v_ca integer := 0; v_av integer := 0; v_ult timestamptz; v_nuevas integer := 0; v_antes integer; v_id uuid; v_exist boolean;
begin
  for s in select x.id, x.nombre from piefirme.sedes x where x.organizacion_id = p_org and x.activa loop
    continue when not piefirme_app.ctl_sucursal_usa_modulo(p_org, s.id);   -- una sucursal que nunca usó el módulo no genera alertas de omisión
    v_h_ap := piefirme_app.ctl_cfg_num(p_org, 'alertas_hora_sin_apertura', s.id)::integer;
    v_h_ci := piefirme_app.ctl_cfg_num(p_org, 'alertas_hora_sin_cierre', s.id)::integer;
    v_hs := piefirme_app.ctl_cfg_num(p_org, 'salud_sync_horas', s.id)::integer;
    -- sin conteo de apertura (solo si la frecuencia configurada es «diario a la apertura»)
    if v_hora >= v_h_ap and (piefirme_app.ctl_config_en(p_org, 'frecuencia_conteo_completo', s.id, p_ahora) #>> '{}') = 'diario_apertura'
       and piefirme_app.ctl_o_opero(p_org, s.id, v_ini, v_fin)
       and not exists (select 1 from piefirme.ctl_sesion_conteo k where k.organizacion_id = p_org and k.sucursal_id = s.id and k.tipo = 'conteo_apertura'
                          and k.estado <> 'cancelada' and k.abierta_en >= v_ini and k.abierta_en < v_fin) then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'sin_conteo_apertura' and referencia_tipo = v_ref and referencia_id = s.id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.id, 'sin_conteo_apertura', format('%s: la sucursal ya operó hoy y no hay conteo de apertura (se esperaba antes de las %s:00).', s.nombre, v_h_ap), v_ref, s.id);
      if v_antes = 0 then v_ap := v_ap + 1; end if;
    end if;
    -- sin cierre
    if v_hora >= v_h_ci and piefirme_app.ctl_o_opero(p_org, s.id, v_ini, v_fin)
       and not exists (select 1 from piefirme.ctl_cierre k where k.organizacion_id = p_org and k.sucursal_id = s.id and k.tipo in ('turno', 'dia')
                          and k.estado in ('cerrado', 'entrega_no_aceptada') and k.cerrado_en >= v_ini and k.cerrado_en < v_fin) then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'sin_cierre' and referencia_tipo = v_ref and referencia_id = s.id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.id, 'sin_cierre', format('%s: la sucursal ya operó hoy y no hay cierre registrado (se esperaba antes de las %s:00).', s.nombre, v_h_ci), v_ref, s.id);
      if v_antes = 0 then v_ci := v_ci + 1; end if;
    end if;
    -- sin sincronizar (tablero de salud): va al resumen diario
    v_ult := piefirme_app.ctl_ultima_actividad(p_org, s.id);
    if v_ult is not null and v_ult < p_ahora - make_interval(hours => v_hs) then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'sin_sincronizar' and referencia_tipo = v_ref and referencia_id = s.id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.id, 'sin_sincronizar', format('%s: no ha enviado nada al módulo en %s horas (umbral: %s).', s.nombre, round(extract(epoch from (p_ahora - v_ult)) / 3600), v_hs), v_ref, s.id);
      if v_antes = 0 then v_sy := v_sy + 1; end if;
    end if;
  end loop;
  -- cancelaciones observadas en el origen (cuando la Etapa 1 emita «cancelación autorizada» se liga a ese evento)
  for c in select cc.*, sd.nombre as sucursal from piefirme_app.ctl_o_cancelaciones_desde(p_org, p_ahora - p_ventana) cc join piefirme.sedes sd on sd.id = cc.sucursal_id loop
    select exists (select 1 from piefirme.ctl_alerta a where a.organizacion_id = p_org and a.tipo = 'cancelacion_autorizada' and a.referencia_id = c.venta_id) into v_exist;
    perform piefirme_app.ctl_alerta_nueva(p_org, c.sucursal_id, 'cancelacion_autorizada',
              format('%s: se canceló el ticket %s por $%s%s.', c.sucursal, c.ticket, to_char(c.total, 'FM999,999,990.00'), coalesce(' · motivo: ' || nullif(btrim(c.motivo), ''), '')), 'venta', c.venta_id);
    if not v_exist then v_ca := v_ca + 1; end if;
  end loop;
  -- ventas de piezas de alto valor
  for c in select vv.*, sd.nombre as sucursal from piefirme_app.ctl_o_ventas_alto_valor_desde(p_org, p_ahora - p_ventana) vv join piefirme.sedes sd on sd.id = vv.sucursal_id loop
    select exists (select 1 from piefirme.ctl_alerta a where a.organizacion_id = p_org and a.tipo = 'venta_alto_valor' and a.referencia_id = c.linea_id) into v_exist;
    perform piefirme_app.ctl_alerta_nueva(p_org, c.sucursal_id, 'venta_alto_valor',
              format('%s: se vendió «%s» (ticket %s) a $%s.', c.sucursal, c.producto, c.ticket, to_char(c.importe, 'FM999,999,990.00')), 'venta_linea', c.linea_id);
    if not v_exist then v_av := v_av + 1; end if;
  end loop;
  v_nuevas := piefirme_app.ctl_alertas_despachar_pendientes(p_org);
  return jsonb_build_object('organizacion_id', p_org, 'ahora', p_ahora, 'hora_local', v_hora, 'sin_conteo_apertura', v_ap, 'sin_cierre', v_ci, 'sin_sincronizar', v_sy,
                            'cancelaciones', v_ca, 'ventas_alto_valor', v_av, 'despachadas_pendientes', v_nuevas);
end $$;

-- ───────────────────────────── resumen diario ─────────────────────────────
-- Un correo por persona: lo que quedó agrupado por el techo o por ser «solo resumen», más lo que sigue sin atender. Idempotente por persona y fecha.
create or replace function piefirme_app.ctl_resumen_diario(p_org uuid, p_fecha date default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_fecha date := coalesce(p_fecha, piefirme_app.ctl_hoy(p_org)); d record; v_items jsonb; v_pend integer; v_sin integer; v_tope boolean; v_msg text; v_nuevos integer := 0; v_omitidos integer := 0; v_ya integer := 0;
        v_det text; v_ins integer;
begin
  for d in select * from piefirme_app.ctl_alerta_destinatarios(p_org, null, array['dueno', 'supervisor']) where recibir loop
    select coalesce(jsonb_agg(jsonb_build_object('tipo', z.tipo, 'nombre', z.nombre, 'n', z.n) order by z.n desc, z.nombre), '[]'::jsonb), coalesce(sum(z.n), 0)::integer
      into v_items, v_pend
      from (select e.payload ->> 'tipo' as tipo, coalesce(c.nombre, e.payload ->> 'tipo') as nombre, count(*) as n
              from piefirme.ctl_alerta_envio e left join piefirme.ctl_alerta_catalogo c on c.tipo = e.payload ->> 'tipo'
             where e.organizacion_id = p_org and e.destinatario_id = d.usuario_id and e.fecha_local = v_fecha and e.modo = 'pendiente_resumen'
             group by e.payload ->> 'tipo', c.nombre) z;
    v_tope := exists (select 1 from piefirme.ctl_alerta_envio e where e.organizacion_id = p_org and e.destinatario_id = d.usuario_id and e.fecha_local = v_fecha and e.modo = 'aviso_techo');
    select count(*) into v_sin from piefirme.ctl_alerta a
     where a.organizacion_id = p_org and a.estado in ('nueva', 'vista') and (a.sucursal_id is null or cardinality(d.sedes) = 0 or a.sucursal_id = any (d.sedes));
    if v_pend = 0 and v_sin = 0 and not v_tope then v_omitidos := v_omitidos + 1; continue; end if;
    select string_agg(' • ' || (x ->> 'nombre') || ': ' || (x ->> 'n'), E'\n') into v_det from jsonb_array_elements(v_items) x;
    v_msg := format('Resumen diario de auditoría · %s', v_fecha)
             || case when v_tope then E'\nSe alcanzó el techo diario de alertas: lo demás llegó agrupado aquí.' else '' end
             || case when v_pend > 0 then E'\nAgrupadas hoy (' || v_pend || E'):\n' || v_det else E'\nNo hubo alertas agrupadas hoy.' end
             || E'\nSin atender en la bandeja: ' || v_sin || '.';
    insert into piefirme.ctl_alerta_envio (organizacion_id, alerta_id, sucursal_id, destinatario_id, rol_destinatario, canal, modo, asunto, mensaje, destino, payload, simulado, fecha_local)
    values (p_org, null, null, d.usuario_id, d.rol, 'correo', 'resumen_diario', 'Resumen diario de auditoría · ' || v_fecha, v_msg,
            piefirme_app.ctl_envio_destino('correo', d.nombre, d.email, d.telefono),
            jsonb_build_object('fecha', v_fecha, 'agrupadas', v_pend, 'por_tipo', v_items, 'sin_atender', v_sin, 'techo_alcanzado', v_tope), true, v_fecha)
    on conflict (organizacion_id, destinatario_id, fecha_local, canal) where modo = 'resumen_diario' do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then v_nuevos := v_nuevos + 1; else v_ya := v_ya + 1; end if;
  end loop;
  return jsonb_build_object('fecha', v_fecha, 'resumenes', v_nuevos, 'ya_generados', v_ya, 'sin_contenido', v_omitidos);
end $$;

-- ───────────────────────────── funciones para el planificador / script (solo service_role) ─────────────────────────────
create or replace function piefirme.ctl_alertas_programadas(p_org uuid default null, p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o record; v_res jsonb := '[]'::jsonb;
begin
  for o in select x.id from piefirme.organizaciones x where (p_org is null or x.id = p_org) and x.estado in ('prueba', 'activa') loop
    v_res := v_res || jsonb_build_array(piefirme_app.ctl_alertas_programadas_org(o.id, p_ahora));
  end loop;
  return jsonb_build_object('ok', true, 'organizaciones', v_res);
end $$;

create or replace function piefirme.ctl_resumen_diario_generar(p_org uuid default null, p_fecha date default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o record; v_res jsonb := '[]'::jsonb;
begin
  for o in select x.id from piefirme.organizaciones x where (p_org is null or x.id = p_org) and x.estado in ('prueba', 'activa') loop
    v_res := v_res || jsonb_build_array(jsonb_build_object('organizacion_id', o.id) || piefirme_app.ctl_resumen_diario(o.id, p_fecha));
  end loop;
  return jsonb_build_object('ok', true, 'organizaciones', v_res);
end $$;

-- ───────────────────────────── RPC de la app ─────────────────────────────
-- Bandeja. Filtros: estado (sin_atender | nueva | vista | atendida | todas; por omisión sin_atender) · tipo · sucursal · severidad · desde · hasta · limite (≤ 500) · offset.
-- Dueño y supervisor (sus sucursales) y soporte en solo lectura.
create or replace function piefirme.ctl_alertas_listar(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); f jsonb := coalesce(p_filtros, '{}'::jsonb); v_estado text := coalesce(nullif(f ->> 'estado', ''), 'sin_atender');
        v_tipo text := nullif(f ->> 'tipo', ''); v_suc uuid := nullif(f ->> 'sucursal', '')::uuid; v_sev text := nullif(f ->> 'severidad', '');
        v_desde date := nullif(f ->> 'desde', '')::date; v_hasta date := nullif(f ->> 'hasta', '')::date; v_tz text := piefirme_app.ctl_zona(piefirme_app.org_id());
        v_lim integer := least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 100), 1), 500); v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0); v_res jsonb;
begin
  if v_estado not in ('sin_atender', 'nueva', 'vista', 'atendida', 'todas') then raise exception 'Estado no válido: %', v_estado using errcode = 'PF422'; end if;
  if piefirme_app.ctl_rol() = 'soporte' then perform piefirme_app.ctl_log_consulta(v_org, 'soporte:alertas_listar', f); end if;
  with base as (
    select a.id, a.tipo, coalesce(c.nombre, a.tipo) as nombre, a.severidad, a.mensaje, a.estado, a.sucursal_id, sd.nombre as sucursal, a.creado_en, a.atendida_en,
           piefirme_app.ctl_nombre_usuario(a.atendida_por) as atendida_por, a.nota_atencion, a.referencia_tipo, a.referencia_id,
           (select count(*) from piefirme.ctl_alerta_envio e where e.alerta_id = a.id and e.modo = 'individual') as envios,
           (select count(*) from piefirme.ctl_alerta_envio e where e.alerta_id = a.id and e.modo = 'pendiente_resumen') as agrupados
      from piefirme.ctl_alerta a left join piefirme.ctl_alerta_catalogo c on c.tipo = a.tipo left join piefirme.sedes sd on sd.id = a.sucursal_id
     where a.organizacion_id = v_org and (a.sucursal_id is null or piefirme_app.puede_sede(a.sucursal_id))
       and (v_tipo is null or a.tipo = v_tipo) and (v_suc is null or a.sucursal_id = v_suc) and (v_sev is null or a.severidad = v_sev)
       and (v_desde is null or a.creado_en >= v_desde::timestamp at time zone v_tz) and (v_hasta is null or a.creado_en < (v_hasta + 1)::timestamp at time zone v_tz)
  ), sel as (
    select * from base b where case v_estado when 'todas' then true when 'sin_atender' then b.estado in ('nueva', 'vista') else b.estado = v_estado end
  )
  select jsonb_build_object(
    'alertas', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden_sev, x.creado_en desc) from (
        select s.*, case s.severidad when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end as orden_sev from sel s
         order by case s.severidad when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, s.creado_en desc offset v_off limit v_lim) x), '[]'::jsonb),
    'total', (select count(*) from sel),
    'resumen', jsonb_build_object('nueva', (select count(*) from base where estado = 'nueva'), 'vista', (select count(*) from base where estado = 'vista'),
                                  'atendida', (select count(*) from base where estado = 'atendida')),
    'tipos', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'nombre', t.nombre, 'n', t.n) order by t.n desc) from (select tipo, nombre, count(*) as n from base group by tipo, nombre) t), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;

-- Marcar vista / atendida (solo quien revisa: dueño y supervisor). Las ya atendidas no se tocan. Devuelve cuántas cambió.
create or replace function piefirme.ctl_alerta_atender(p_alertas uuid[], p_estado text default 'atendida', p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); v_n integer := 0; a record;
begin
  if p_estado not in ('vista', 'atendida') then raise exception 'Una alerta solo se marca vista o atendida.' using errcode = 'PF422'; end if;
  if p_alertas is null or cardinality(p_alertas) = 0 then raise exception 'Indique al menos una alerta.' using errcode = 'PF400'; end if;
  if cardinality(p_alertas) > 200 then raise exception 'Máximo 200 alertas por operación.' using errcode = 'PF422'; end if;
  perform piefirme_app.ctl_rpc_on();
  for a in select x.id, x.estado from piefirme.ctl_alerta x
            where x.id = any (p_alertas) and x.organizacion_id = v_org and (x.sucursal_id is null or piefirme_app.puede_sede(x.sucursal_id)) for update loop
    if a.estado = 'atendida' or (a.estado = 'vista' and p_estado = 'vista') then continue; end if;
    update piefirme.ctl_alerta set estado = p_estado, vista_en = coalesce(vista_en, now()),
           atendida_por = case when p_estado = 'atendida' then auth.uid() else atendida_por end, atendida_en = case when p_estado = 'atendida' then now() else atendida_en end,
           nota_atencion = case when p_estado = 'atendida' then nullif(btrim(left(p_nota, 500)), '') else nota_atencion end
     where id = a.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'cambiadas', v_n);
end $$;

-- Reglas: catálogo + regla vigente de la organización + cuántas alertas de cada tipo hubo en 30 días.
create or replace function piefirme.ctl_alertas_reglas() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias');
begin
  return jsonb_build_object(
    'eventos', coalesce((select jsonb_agg(to_jsonb(x) order by x.orden) from (
        select c.tipo, c.nombre, c.descripcion, c.fuente, c.emite, c.severidad, c.orden, c.canales as canales_omision, c.destinatarios as destinatarios_omision, c.inmediata as inmediata_omision,
               e.canales, e.destinatarios, e.inmediata, e.activa, e.personalizada,
               (select count(*) from piefirme.ctl_alerta a where a.organizacion_id = v_org and a.tipo = c.tipo and a.creado_en >= now() - interval '30 days') as ultimos_30_dias
          from piefirme.ctl_alerta_catalogo c cross join lateral piefirme_app.ctl_alerta_regla_efectiva(v_org, c.tipo) e) x), '[]'::jsonb),
    'techo_general', piefirme_app.ctl_cfg_num(v_org, 'alertas_techo_diario', null),
    'simulado', true,
    'aviso', 'Los envíos por Push, WhatsApp y correo están SIMULADOS: no hay proveedor configurado. Aquí se registra lo que se habría enviado.');
end $$;

create or replace function piefirme.ctl_alerta_regla_guardar(p_tipo text, p_canales text[], p_destinatarios text[], p_inmediata boolean, p_activa boolean default true, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); v_id uuid;
begin
  if not exists (select 1 from piefirme.ctl_alerta_catalogo c where c.tipo = p_tipo) then raise exception 'Evento de alerta desconocido: %', p_tipo using errcode = 'PF400'; end if;
  if p_canales is null or cardinality(p_canales) = 0 or not (p_canales <@ array['push', 'whatsapp', 'correo']) then raise exception 'Los canales válidos son push, whatsapp y correo (al menos uno).' using errcode = 'PF422'; end if;
  if p_destinatarios is null or cardinality(p_destinatarios) = 0 or not (p_destinatarios <@ array['dueno', 'supervisor', 'sucursal']) then raise exception 'Los destinatarios válidos son dueno, supervisor y sucursal (al menos uno).' using errcode = 'PF422'; end if;
  insert into piefirme.ctl_alerta_regla (organizacion_id, tipo, canales, destinatarios, inmediata, activa, motivo)
  values (v_org, p_tipo, p_canales, p_destinatarios, coalesce(p_inmediata, true), coalesce(p_activa, true), nullif(btrim(left(p_motivo, 300)), '')) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Destinatarios: quién recibe alertas, con su techo propio y cuántas ha recibido hoy.
create or replace function piefirme.ctl_alerta_destinatarios_listar() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); v_hoy date := piefirme_app.ctl_hoy(piefirme_app.org_id()); v_general numeric := piefirme_app.ctl_cfg_num(piefirme_app.org_id(), 'alertas_techo_diario', null);
begin
  return jsonb_build_object('techo_general', v_general, 'destinatarios', coalesce((select jsonb_agg(to_jsonb(x) order by x.rol, x.nombre) from (
    select d.usuario_id, d.nombre, d.rol, d.email, d.techo as techo_propio, coalesce(d.techo, v_general::integer) as techo_efectivo, d.recibir,
           (select count(distinct e.alerta_id) from piefirme.ctl_alerta_envio e where e.organizacion_id = v_org and e.destinatario_id = d.usuario_id and e.fecha_local = v_hoy and e.modo = 'individual') as enviadas_hoy,
           (select count(*) from piefirme.ctl_alerta_envio e where e.organizacion_id = v_org and e.destinatario_id = d.usuario_id and e.fecha_local = v_hoy and e.modo = 'pendiente_resumen') as agrupadas_hoy
      from piefirme_app.ctl_alerta_destinatarios(v_org, null, array['dueno', 'supervisor']) d) x), '[]'::jsonb));
end $$;

create or replace function piefirme.ctl_alerta_destinatario_guardar(p_usuario uuid, p_techo integer, p_recibir boolean default true, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); v_id uuid;
begin
  if not exists (select 1 from piefirme_app.ctl_alerta_destinatarios(v_org, null, array['dueno', 'supervisor']) d where d.usuario_id = p_usuario) then
    raise exception 'Esa persona no es dueño ni supervisor activo de la clínica.' using errcode = 'PF422';
  end if;
  if p_techo is not null and (p_techo < 1 or p_techo > 200) then raise exception 'El techo diario va de 1 a 200 alertas.' using errcode = 'PF422'; end if;
  insert into piefirme.ctl_alerta_destinatario (organizacion_id, usuario_id, techo_diario, recibir, motivo)
  values (v_org, p_usuario, p_techo, coalesce(p_recibir, true), nullif(btrim(left(p_motivo, 300)), '')) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Lo que se habría enviado. Filtros: modo · canal · destinatario · desde · hasta · limite (≤ 500) · offset.
create or replace function piefirme.ctl_alertas_envios_listar(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); f jsonb := coalesce(p_filtros, '{}'::jsonb); v_modo text := nullif(f ->> 'modo', ''); v_canal text := nullif(f ->> 'canal', '');
        v_dest uuid := nullif(f ->> 'destinatario', '')::uuid; v_desde date := nullif(f ->> 'desde', '')::date; v_hasta date := nullif(f ->> 'hasta', '')::date;
        v_lim integer := least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 100), 1), 500); v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0); v_res jsonb;
begin
  if piefirme_app.ctl_rol() = 'soporte' then perform piefirme_app.ctl_log_consulta(v_org, 'soporte:alertas_envios', f); end if;
  with sel as (
    select e.* from piefirme.ctl_alerta_envio e
     where e.organizacion_id = v_org and (e.sucursal_id is null or piefirme_app.puede_sede(e.sucursal_id)) and (v_modo is null or e.modo = v_modo) and (v_canal is null or e.canal = v_canal)
       and (v_dest is null or e.destinatario_id = v_dest) and (v_desde is null or e.fecha_local >= v_desde) and (v_hasta is null or e.fecha_local <= v_hasta)
  )
  select jsonb_build_object('total', (select count(*) from sel), 'simulado', true,
    'envios', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
        select s.id, s.alerta_id, s.modo, s.canal, s.asunto, s.mensaje, s.destino, s.simulado, s.fecha_local, s.creado_en, s.rol_destinatario, sd.nombre as sucursal,
               piefirme_app.ctl_nombre_usuario(s.destinatario_id) as destinatario
          from sel s left join piefirme.sedes sd on sd.id = s.sucursal_id order by s.creado_en desc offset v_off limit v_lim) x), '[]'::jsonb),
    'por_modo', coalesce((select jsonb_object_agg(m.modo, m.n) from (select modo, count(*) as n from sel group by modo) m), '{}'::jsonb))
    into v_res;
  return v_res;
end $$;

-- Botones del dueño (o del soporte) para operar hoy, que no hay planificador: evaluar ahora y generar el resumen del día.
create or replace function piefirme.ctl_alertas_evaluar_ahora() returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar');
begin
  return piefirme_app.ctl_alertas_programadas_org(v_org, now());
end $$;

create or replace function piefirme.ctl_resumen_diario_ahora(p_fecha date default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar');
begin
  return piefirme_app.ctl_resumen_diario(v_org, p_fecha);
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme_app' and p.proname in ('ctl_alerta_regla_efectiva', 'ctl_alerta_destinatarios', 'ctl_envio_insertar', 'ctl_envio_destino', 'ctl_alerta_despachar',
              'ctl_trg_alerta_despachar', 'ctl_alertas_despachar_pendientes', 'ctl_alerta_nueva', 'ctl_o_opero', 'ctl_o_cancelaciones_desde', 'ctl_o_ventas_alto_valor_desde',
              'ctl_alertas_programadas_org', 'ctl_resumen_diario') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_alertas_listar', 'ctl_alerta_atender', 'ctl_alertas_reglas', 'ctl_alerta_regla_guardar', 'ctl_alerta_destinatarios_listar',
              'ctl_alerta_destinatario_guardar', 'ctl_alertas_envios_listar', 'ctl_alertas_evaluar_ahora', 'ctl_resumen_diario_ahora') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_alertas_programadas', 'ctl_resumen_diario_generar') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
  end loop;
end $$;
