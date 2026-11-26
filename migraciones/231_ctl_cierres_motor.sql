-- 231 · Control y Auditoría · ETAPA 4 · MOTOR DE RECORRIDO: abrir cierre (instantánea del checklist vigente), captura por punto con guardado parcial,
--       cálculo de esperados (fórmulas), cuadre de kits, y lectura del recorrido (a ciegas) y del detalle (revisión).
-- Reglas que esta migración hace cumplir EN EL SERVIDOR:
--   · Al abrir, el servidor resuelve los puntos activos de esa sucursal y tipo y devuelve la lista ordenada SIN esperado ni tolerancia.
--   · Cada captura lleva un id generado en el cliente (idempotente); corregir = fila nueva que referencia la anterior; nada se edita.
--   · Denominaciones: SIN campo de total. Si llega un total, se rechaza; el total es la suma del desglose y la calcula el servidor.
--   · El esperado jamás se devuelve a quien captura (ni antes ni después): vive en ctl_cierre_calculo / ctl_cierre_corte (solo ver_directo / ver_diferencias).
-- Depende de: 200–206, 230.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── alcance de un cierre (qué turnos y qué ventana cubre) ─────────────────────────────
create or replace function piefirme_app.ctl_alcance(c piefirme.ctl_cierre) returns table (turnos uuid[], desde timestamptz, hasta timestamptz)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_tz text; v_ini timestamptz;
begin
  select coalesce(o.zona_horaria, 'America/Mexico_City') into v_tz from piefirme.organizaciones o where o.id = c.organizacion_id;
  v_tz := coalesce(v_tz, 'America/Mexico_City');
  hasta := now();
  if c.tipo = 'turno' then
    turnos := case when c.turno_id is null then '{}'::uuid[] else array[c.turno_id] end;
    select t.apertura_en into desde from piefirme.turnos_caja t where t.id = c.turno_id;
    desde := coalesce(desde, c.abierto_en);
  elsif c.tipo = 'dia' then
    v_ini := date_trunc('day', c.abierto_en at time zone v_tz) at time zone v_tz;
    desde := v_ini;
    select coalesce(array_agg(t.id order by t.apertura_en), '{}'::uuid[]) into turnos from piefirme.turnos_caja t
     where t.organizacion_id = c.organizacion_id and t.sede_id = c.sucursal_id and t.apertura_en >= v_ini and t.apertura_en < v_ini + interval '1 day';
  elsif c.tipo = 'semanal' then
    desde := c.abierto_en - interval '7 days';
    select coalesce(array_agg(t.id order by t.apertura_en), '{}'::uuid[]) into turnos from piefirme.turnos_caja t
     where t.organizacion_id = c.organizacion_id and t.sede_id = c.sucursal_id and t.apertura_en >= desde;
  else
    turnos := '{}'::uuid[]; desde := c.abierto_en;
  end if;
  return next;
end $$;

-- Componentes del efectivo esperado de UN turno: igual que el corte de Caja (cerrar_turno): fondo + efectivo − retiros/gastos/devoluciones + depósitos − cancelaciones en efectivo.
create or replace function piefirme_app.ctl_efectivo_turno(p_turno uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t piefirme.turnos_caja%rowtype; v_ef numeric; v_can numeric; v_ret numeric;
begin
  select * into t from piefirme.turnos_caja where id = p_turno;
  if not found then return jsonb_build_object('fondo', 0, 'ventas_efectivo', 0, 'retiros', 0, 'cancelaciones_efectivo', 0); end if;
  select coalesce(sum(vp.monto) filter (where vp.metodo = 'efectivo'), 0) into v_ef from piefirme.pagos vp join piefirme.ventas v on v.id = vp.venta_id where v.turno_id = t.id;
  select coalesce(sum(vp.monto) filter (where vp.metodo = 'efectivo'), 0) into v_can from piefirme.pagos vp join piefirme.ventas v on v.id = vp.venta_id where v.cancelada_turno_id = t.id;
  select coalesce(sum(m.monto) filter (where m.tipo in ('retiro', 'gasto', 'devolucion')), 0) - coalesce(sum(m.monto) filter (where m.tipo = 'deposito'), 0)
    into v_ret from piefirme.movimientos_caja m where m.turno_id = t.id;
  return jsonb_build_object('fondo', t.fondo_inicial, 'ventas_efectivo', v_ef, 'retiros', v_ret, 'cancelaciones_efectivo', v_can);
end $$;

-- Tolerancia aplicable a un punto: efectivo y kits salen de ctl_config (versionada por sucursal, vigente HOY = al cerrar); el resto, del propio punto.
create or replace function piefirme_app.ctl_tolerancia_punto(p_org uuid, p_sucursal uuid, p piefirme.ctl_punto_control) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select case p.formula_esperado
    when 'efectivo_esperado' then (piefirme_app.ctl_config_en(p_org, 'tolerancia_efectivo', p_sucursal, now()) #>> '{}')::numeric
    when 'kits_usados'       then (piefirme_app.ctl_config_en(p_org, 'tolerancia_kits', p_sucursal, now()) #>> '{}')::numeric
    else p.tolerancia end
$$;

-- ───────────────────────────── cuadre de kits de servicio (F3.4) ─────────────────────────────
-- usados = existencia anterior + recibido − quedan  ·  esperado = servicios cobrados × consumo esperado del insumo (ctl_consumo_esperado).
-- Si el insumo no tiene consumo definido, cada servicio cobrado consume parametros.kits_por_servicio (1 por omisión).
-- Existencia anterior: lo que quedó en el cierre anterior de la sucursal para este mismo punto; si no hay, la existencia del sistema al inicio del periodo.
create or replace function piefirme_app.ctl_calc_kits(c piefirme.ctl_cierre, p piefirme.ctl_punto_control, p_quedan numeric) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a record; v_prod uuid := nullif(p.parametros ->> 'producto_id', '')::uuid; v_kps numeric := coalesce(nullif(p.parametros ->> 'kits_por_servicio', '')::numeric, 1);
        v_prev_valor numeric; v_prev_fin timestamptz; v_desde timestamptz; v_ant numeric; v_rec numeric; v_usados numeric; v_hay_cfg boolean; v_esp numeric; v_tick integer; v_origen text;
begin
  if v_prod is null then return jsonb_build_object('calculado', null, 'esperado', null, 'detalle', jsonb_build_object('sin_insumo', true)); end if;
  select * into a from piefirme_app.ctl_alcance(c);
  select cc.valor_capturado, ci.cerrado_en into v_prev_valor, v_prev_fin
    from piefirme.ctl_cierre_captura cc
    join piefirme.ctl_cierre ci on ci.id = cc.cierre_id
    join piefirme.ctl_punto_control pc on pc.id = cc.punto_control_id
   where ci.organizacion_id = c.organizacion_id and ci.sucursal_id = c.sucursal_id and ci.id <> c.id and ci.estado in ('cerrado', 'entrega_no_aceptada')
     and ci.cerrado_en is not null and ci.cerrado_en <= now() and pc.grupo_id = p.grupo_id and cc.valor_capturado is not null
     and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = cc.id)
   order by ci.cerrado_en desc, ci.folio_num desc limit 1;
  if v_prev_valor is not null then v_ant := v_prev_valor; v_desde := v_prev_fin; v_origen := 'cierre_anterior';
  else
    v_desde := a.desde; v_origen := 'saldo_del_sistema';
    select coalesce(i.existencia, 0) - coalesce((select sum(m.cantidad) from piefirme.movimientos_inventario m where m.organizacion_id = c.organizacion_id and m.sede_id = c.sucursal_id and m.producto_id = v_prod and m.fecha >= v_desde), 0)
      into v_ant from (select 1) x left join piefirme.inventario_sede i on i.sede_id = c.sucursal_id and i.producto_id = v_prod;
    v_ant := coalesce(v_ant, 0);
  end if;
  select coalesce(sum(m.cantidad), 0) into v_rec from piefirme.movimientos_inventario m
   where m.organizacion_id = c.organizacion_id and m.sede_id = c.sucursal_id and m.producto_id = v_prod and m.tipo in ('compra', 'traspaso_entrada', 'devolucion_cliente') and m.fecha >= v_desde;
  v_usados := v_ant + v_rec - p_quedan;
  v_hay_cfg := exists (select 1 from piefirme.ctl_consumo_esperado ce where ce.organizacion_id = c.organizacion_id and ce.insumo_producto_id = v_prod and ce.activo);
  select coalesce(sum(l.cantidad * case when v_hay_cfg then coalesce(ce.cantidad, 0) else v_kps end), 0), count(distinct v.id) filter (where (not v_hay_cfg) or ce.id is not null)
    into v_esp, v_tick
    from piefirme.ventas v
    join piefirme.venta_lineas l on l.venta_id = v.id and l.tipo = 'servicio'
    left join piefirme.ctl_consumo_esperado ce on ce.organizacion_id = v.organizacion_id and ce.servicio_id = l.servicio_id and ce.insumo_producto_id = v_prod and ce.activo
   where v.organizacion_id = c.organizacion_id and v.sede_id = c.sucursal_id and v.estado in ('cobrada', 'por_facturar', 'facturada')
     and (v.turno_id = any (a.turnos) or (cardinality(a.turnos) = 0 and v.cobrada_en >= a.desde and v.cobrada_en <= a.hasta));
  return jsonb_build_object('calculado', v_usados, 'esperado', v_esp,
    'detalle', jsonb_build_object('existencia_anterior', v_ant, 'origen_anterior', v_origen, 'recibido', v_rec, 'quedan', p_quedan, 'kits_usados', v_usados,
                                  'tickets_de_servicio', v_tick, 'kits_esperados', v_esp, 'servicios_sin_cobro', v_usados - v_esp, 'desde', v_desde));
end $$;

-- Esperado de un punto con fórmula. Devuelve {calculado, esperado, detalle}: «calculado» es lo capturado ya traducido por el servidor
-- (la suma del desglose, los kits usados…) y es lo que se compara con «esperado».
create or replace function piefirme_app.ctl_calcular_punto(c piefirme.ctl_cierre, p piefirme.ctl_punto_control, p_valor numeric) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a record; t uuid; e jsonb; v_n integer := 0; v_fondo numeric := 0; v_ef numeric := 0; v_ret numeric := 0; v_can numeric := 0; v_esp numeric; v_metodos text[];
begin
  if p.formula_esperado is null then return null; end if;
  select * into a from piefirme_app.ctl_alcance(c);
  if p.formula_esperado = 'efectivo_esperado' then
    if cardinality(a.turnos) = 0 then return jsonb_build_object('calculado', p_valor, 'esperado', null, 'detalle', jsonb_build_object('sin_turno', true)); end if;
    foreach t in array a.turnos loop
      e := piefirme_app.ctl_efectivo_turno(t);
      if v_n = 0 then v_fondo := (e ->> 'fondo')::numeric; end if;       -- el fondo es el del primer turno: el efectivo pasa de un turno al siguiente
      v_ef := v_ef + (e ->> 'ventas_efectivo')::numeric; v_ret := v_ret + (e ->> 'retiros')::numeric; v_can := v_can + (e ->> 'cancelaciones_efectivo')::numeric; v_n := v_n + 1;
    end loop;
    v_esp := v_fondo + v_ef - v_ret - v_can;
    return jsonb_build_object('calculado', p_valor, 'esperado', v_esp, 'detalle', jsonb_build_object('fondo_inicial', v_fondo, 'ventas_efectivo', v_ef, 'retiros', v_ret, 'cancelaciones_efectivo', v_can, 'turnos', v_n));
  elsif p.formula_esperado in ('tarjeta_esperada', 'transferencia_esperada') then
    v_metodos := case p.formula_esperado when 'tarjeta_esperada' then array['tarjeta', 'clip'] else array['transferencia'] end;
    select coalesce(sum(pg.monto), 0) into v_esp from piefirme.pagos pg join piefirme.ventas v on v.id = pg.venta_id
     where v.organizacion_id = c.organizacion_id and v.sede_id = c.sucursal_id and v.estado <> 'cancelada' and pg.metodo = any (v_metodos)
       and (v.turno_id = any (a.turnos) or (cardinality(a.turnos) = 0 and v.cobrada_en >= a.desde and v.cobrada_en <= a.hasta));
    return jsonb_build_object('calculado', p_valor, 'esperado', v_esp, 'detalle', jsonb_build_object('metodos', to_jsonb(v_metodos)));
  elsif p.formula_esperado = 'tickets_cobrados' then
    select count(*) into v_n from piefirme.ventas v
     where v.organizacion_id = c.organizacion_id and v.sede_id = c.sucursal_id and v.estado in ('cobrada', 'por_facturar', 'facturada')
       and (v.turno_id = any (a.turnos) or (cardinality(a.turnos) = 0 and v.cobrada_en >= a.desde and v.cobrada_en <= a.hasta));
    return jsonb_build_object('calculado', p_valor, 'esperado', v_n, 'detalle', '{}'::jsonb);
  elsif p.formula_esperado = 'kits_usados' then
    return piefirme_app.ctl_calc_kits(c, p, p_valor);
  end if;
  return null;
end $$;

-- ───────────────────────────── catálogo de denominaciones válidas (MXN) ─────────────────────────────
create or replace function piefirme_app.ctl_denominaciones_validas() returns numeric[] language sql immutable as
  $$ select array[1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5]::numeric[] $$;

-- Tomas fijas que aplican a un tipo de cierre en una sucursal (apertura/día/turno → cierre_apertura|ambos; semanal → semanal|ambos).
create or replace function piefirme_app.ctl_tomas_aplicables(p_org uuid, p_sucursal uuid, p_tipo text) returns setof piefirme.ctl_toma_fija
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select t.* from piefirme.ctl_toma_fija t
   where t.organizacion_id = p_org and t.sucursal_id = p_sucursal and t.activa
     and t.aplica = any (case when p_tipo = 'semanal' then array['semanal', 'ambos'] else array['cierre_apertura', 'ambos'] end)
   order by t.orden, t.nombre
$$;

-- ───────────────────────────── recorrido (lo que ve QUIEN CAPTURA: sin esperado, sin tolerancia, sin diferencia) ─────────────────────────────
create or replace function piefirme_app.ctl_recorrido(p_cierre uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.ctl_cierre; p piefirme.ctl_punto_control; cap piefirme.ctl_cierre_captura; v_puntos jsonb := '[]'::jsonb; v_den jsonb; v_fotos integer; v_tomas jsonb; v_completo boolean;
        v_falta text; v_req_foto boolean; v_hechos integer := 0; v_oblig integer := 0; v_oblig_h integer := 0; v_total integer := 0; v_pend_tomas integer; r record;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre;
  if not found then return null; end if;
  for r in select (e ->> 'punto_id')::uuid as pid from jsonb_array_elements(c.version_checklist) with ordinality as x(e, ord) order by ord loop
    select * into p from piefirme.ctl_punto_control where id = r.pid;
    select * into cap from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p.id and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id);
    v_den := null; v_fotos := 0; v_tomas := null; v_falta := null;
    if cap.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object('denominacion', d.denominacion, 'cantidad', d.cantidad) order by d.denominacion desc), '[]'::jsonb) into v_den
        from piefirme.ctl_denominacion d where d.cierre_captura_id = cap.id;
    end if;
    select count(*) into v_fotos from piefirme.ctl_evidencia e where e.tipo_origen = 'cierre_captura'
       and e.origen_id in (select k.id from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p.id);
    v_req_foto := p.tipo_captura in ('solo_foto', 'numero_y_foto');
    v_pend_tomas := 0;
    if coalesce((p.parametros ->> 'toma_fija')::boolean, false) then
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre,
               'foto', exists (select 1 from piefirme.ctl_evidencia e where e.toma_fija_id = t.id and e.tipo_origen = 'cierre_captura'
                                  and e.origen_id in (select k.id from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p.id))) order by t.orden, t.nombre), '[]'::jsonb)
        into v_tomas from piefirme_app.ctl_tomas_aplicables(c.organizacion_id, c.sucursal_id, c.tipo) t;
      select count(*) into v_pend_tomas from jsonb_array_elements(v_tomas) x where not (x ->> 'foto')::boolean;
    end if;
    v_completo := case p.tipo_captura
      when 'denominaciones' then cap.id is not null and jsonb_array_length(coalesce(v_den, '[]'::jsonb)) > 0
      when 'numero' then cap.valor_capturado is not null
      when 'conteo_piezas' then cap.valor_capturado is not null
      when 'numero_y_foto' then cap.valor_capturado is not null and v_fotos >= 1
      when 'solo_foto' then case when v_tomas is not null then v_pend_tomas = 0 else v_fotos >= 1 end
      else false end;
    v_falta := case when v_completo then null
      when p.tipo_captura = 'denominaciones' then 'Falta el desglose por denominación'
      when p.tipo_captura in ('numero', 'conteo_piezas') then 'Falta el valor'
      when p.tipo_captura = 'numero_y_foto' then case when cap.valor_capturado is null then 'Falta el valor' else 'Falta la foto' end
      else case when v_tomas is not null then 'Faltan fotos de tomas fijas' else 'Falta la foto' end end;
    v_total := v_total + 1; if v_completo then v_hechos := v_hechos + 1; end if;
    if p.obligatorio then v_oblig := v_oblig + 1; if v_completo then v_oblig_h := v_oblig_h + 1; end if; end if;
    v_puntos := v_puntos || jsonb_build_array(jsonb_build_object(
      'punto_id', p.id, 'grupo_id', p.grupo_id, 'version', p.version, 'nombre', p.nombre, 'tipo_captura', p.tipo_captura, 'obligatorio', p.obligatorio, 'orden', p.orden,
      'requiere_valor', p.tipo_captura in ('numero', 'conteo_piezas', 'numero_y_foto'), 'requiere_foto', v_req_foto, 'tomas', v_tomas,
      'captura', case when cap.id is null then null else jsonb_build_object('id', cap.id, 'valor', cap.valor_capturado, 'denominaciones', v_den) end,
      'fotos', v_fotos, 'completo', v_completo, 'falta', v_falta));
  end loop;
  return jsonb_build_object(
    'cierre', jsonb_build_object('id', c.id, 'folio', c.folio, 'tipo', c.tipo, 'estado', c.estado, 'sucursal_id', c.sucursal_id, 'turno_id', c.turno_id, 'abierto_en', c.abierto_en,
                                 'cerrado_en', c.cerrado_en, 'usuario_cierra', c.usuario_cierra),
    'puntos', v_puntos,
    'progreso', jsonb_build_object('hechos', v_hechos, 'total', v_total, 'obligatorios', v_oblig, 'obligatorios_hechos', v_oblig_h, 'puede_cerrar', v_oblig_h = v_oblig and c.estado = 'en_captura'));
end $$;

-- ───────────────────────────── RPC: abrir un cierre ─────────────────────────────
-- Idempotente por id del cliente; si ya hay un cierre en captura del mismo usuario, sucursal, tipo y turno se RETOMA (guardado parcial).
create or replace function piefirme.ctl_cierre_abrir(p_id uuid, p_sucursal uuid, p_tipo text, p_turno uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid := coalesce(p_id, gen_random_uuid()); v_turno uuid := p_turno; v_snap jsonb; c piefirme.ctl_cierre;
begin
  if p_tipo is null or p_tipo <> all (array['apertura', 'turno', 'dia', 'semanal']) then raise exception 'tipo de cierre no válido: %', p_tipo using errcode = 'PF422'; end if;
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  select * into c from piefirme.ctl_cierre where id = v_id and organizacion_id = v_org;
  if found then   -- reenvío idempotente
    if c.usuario_cierra <> auth.uid() and not piefirme_app.ctl_puede('ver_directo') then raise exception 'ese cierre es de otra persona' using errcode = 'PF403'; end if;
    return piefirme_app.ctl_recorrido(c.id) || jsonb_build_object('retomado', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ctl_cierre:' || v_org || ':' || p_sucursal || ':' || p_tipo || ':' || auth.uid(), 0));
  if v_turno is not null then
    if not exists (select 1 from piefirme.turnos_caja t where t.id = v_turno and t.organizacion_id = v_org and t.sede_id = p_sucursal) then raise exception 'el turno indicado no es de esta sucursal' using errcode = 'PF409'; end if;
  else
    select t.id into v_turno from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = p_sucursal and t.cajero_id = auth.uid() and t.estado = 'abierto' order by t.apertura_en desc limit 1;
    if v_turno is null and p_tipo = 'turno' then   -- también vale el turno que acaba de cerrar (se cierra Caja y luego se hace el cierre de control)
      select t.id into v_turno from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = p_sucursal and t.cajero_id = auth.uid() and t.cierre_en > now() - interval '12 hours' order by t.cierre_en desc limit 1;
    end if;
  end if;
  if p_tipo = 'turno' and v_turno is null then
    raise exception 'No hay un turno de caja abierto (ni cerrado hace poco) a su nombre en esta sucursal: el cierre de turno se liga al turno de caja.' using errcode = 'PF409';
  end if;
  select * into c from piefirme.ctl_cierre where organizacion_id = v_org and sucursal_id = p_sucursal and tipo = p_tipo and usuario_cierra = auth.uid() and estado = 'en_captura'
     and turno_id is not distinct from v_turno order by abierto_en desc limit 1;
  if found then return piefirme_app.ctl_recorrido(c.id) || jsonb_build_object('retomado', true); end if;

  select coalesce(jsonb_agg(jsonb_build_object('punto_id', p.id, 'grupo_id', p.grupo_id, 'version', p.version) order by p.orden, p.nombre), '[]'::jsonb) into v_snap
    from piefirme.ctl_punto_control p
   where p.organizacion_id = v_org and p.activo and p.vigente_hasta is null and (p.sucursales is null or p_sucursal = any (p.sucursales))
     and case p_tipo when 'apertura' then p.aplica_apertura when 'turno' then p.aplica_turno when 'dia' then p.aplica_dia else p.aplica_semanal end;
  if jsonb_array_length(v_snap) = 0 then
    raise exception 'No hay puntos de control activos para un cierre de tipo % en esta sucursal. El dueño los define en Configuración de auditoría.', p_tipo using errcode = 'PF422';
  end if;
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_cierre (id, organizacion_id, sucursal_id, tipo, turno_id, usuario_cierra, version_checklist, hora_cliente)
  values (v_id, v_org, p_sucursal, p_tipo, v_turno, auth.uid(), v_snap, p_hora_cliente);
  return piefirme_app.ctl_recorrido(v_id) || jsonb_build_object('retomado', false);
end $$;

-- ───────────────────────────── RPC: capturar un punto ─────────────────────────────
-- p_valor: número / piezas (no se acepta en denominaciones). p_denominaciones: [{denominacion, cantidad}] (el total lo calcula el servidor).
create or replace function piefirme.ctl_cierre_capturar(p_id uuid, p_cierre uuid, p_punto uuid, p_valor numeric default null, p_denominaciones jsonb default null,
                                                       p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid := coalesce(p_id, gen_random_uuid()); c piefirme.ctl_cierre; p piefirme.ctl_punto_control; v_prev uuid; v_total numeric := null;
        d jsonb; v_den numeric; v_cant numeric; v_vistas numeric[] := '{}';
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'cierre no encontrado' using errcode = 'PF404'; end if;
  if exists (select 1 from piefirme.ctl_cierre_captura k where k.id = v_id and k.organizacion_id = v_org) then   -- reenvío idempotente
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicada', true, 'punto_id', p_punto);
  end if;
  if c.usuario_cierra <> auth.uid() then raise exception 'solo quien abrió el cierre captura en él' using errcode = 'PF403'; end if;
  if c.estado <> 'en_captura' then raise exception 'el cierre ya está % y no admite capturas' , c.estado using errcode = 'PF409'; end if;
  if not exists (select 1 from jsonb_array_elements(c.version_checklist) e where (e ->> 'punto_id')::uuid = p_punto) then
    raise exception 'ese punto no pertenece a este cierre (el checklist se fijó al abrirlo)' using errcode = 'PF422';
  end if;
  select * into p from piefirme.ctl_punto_control where id = p_punto;

  if p.tipo_captura = 'denominaciones' then
    if p_valor is not null then raise exception 'En el desglose por denominación no existe un campo de total: el total es la suma de lo contado, billete por billete.' using errcode = 'PF422'; end if;
    if p_denominaciones is null or jsonb_typeof(p_denominaciones) <> 'array' or jsonb_array_length(p_denominaciones) = 0 then raise exception 'capture el desglose por denominación' using errcode = 'PF422'; end if;
    v_total := 0;
    for d in select * from jsonb_array_elements(p_denominaciones) loop
      v_den := (d ->> 'denominacion')::numeric; v_cant := (d ->> 'cantidad')::numeric;
      if v_den is null or v_den <> all (piefirme_app.ctl_denominaciones_validas()) then raise exception 'denominación no válida: %', d ->> 'denominacion' using errcode = 'PF422'; end if;
      if v_cant is null or v_cant < 0 or v_cant <> trunc(v_cant) or v_cant > 100000 then raise exception 'cantidad no válida para la denominación %', v_den using errcode = 'PF422'; end if;
      if v_den = any (v_vistas) then raise exception 'la denominación % viene repetida', v_den using errcode = 'PF422'; end if;
      v_vistas := v_vistas || v_den; v_total := v_total + v_den * v_cant;
    end loop;
  else
    if p_denominaciones is not null then raise exception 'este punto no lleva desglose por denominación' using errcode = 'PF422'; end if;
    if p.tipo_captura = 'solo_foto' then
      if p_valor is not null then raise exception 'este punto es solo evidencia (foto): no lleva valor' using errcode = 'PF422'; end if;
    else
      if p_valor is null or p_valor < 0 then raise exception 'capture un valor igual o mayor a 0' using errcode = 'PF422'; end if;
      v_total := p_valor;
    end if;
  end if;

  select k.id into v_prev from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p_punto and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id);
  insert into piefirme.ctl_cierre_captura (id, organizacion_id, sucursal_id, cierre_id, punto_control_id, valor_capturado, hora_cliente, corrige_a)
  values (v_id, v_org, c.sucursal_id, c.id, p_punto, v_total, p_hora_cliente, v_prev);
  if p.tipo_captura = 'denominaciones' then
    insert into piefirme.ctl_denominacion (organizacion_id, sucursal_id, cierre_captura_id, denominacion, cantidad)
    select v_org, c.sucursal_id, v_id, (e ->> 'denominacion')::numeric, (e ->> 'cantidad')::integer from jsonb_array_elements(p_denominaciones) e;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'punto_id', p_punto, 'corrige_a', v_prev) || case when p.tipo_captura = 'denominaciones' then jsonb_build_object('total', v_total) else '{}'::jsonb end;
end $$;

-- ───────────────────────────── RPC: leer el recorrido (retoma) ─────────────────────────────
create or replace function piefirme.ctl_cierre_recorrido(p_cierre uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cierre;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'cierre no encontrado' using errcode = 'PF404'; end if;
  if c.usuario_cierra <> auth.uid() and not piefirme_app.ctl_puede('ver_directo') then raise exception 'ese cierre es de otra persona' using errcode = 'PF403'; end if;
  return piefirme_app.ctl_recorrido(c.id);
end $$;

-- ───────────────────────────── RPC: detalle del cierre para revisión (dueño y supervisor) ─────────────────────────────
-- Se arma con la VERSIÓN DEL CHECKLIST con la que se abrió el cierre (criterio 22), no con la vigente hoy.
create or replace function piefirme.ctl_cierre_detalle(p_cierre uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); c piefirme.ctl_cierre; v_puntos jsonb; v_corte jsonb; v_casos jsonb; v_ent jsonb; v_tomas jsonb;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'cierre no encontrado' using errcode = 'PF404'; end if;
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros)
  values (v_org, auth.uid(), piefirme_app.ctl_rol(), 'cierre_detalle', jsonb_build_object('cierre_id', c.id, 'folio', c.folio));
  select coalesce(jsonb_agg(jsonb_build_object(
      'punto_id', p.id, 'grupo_id', p.grupo_id, 'version', p.version, 'vigente_hoy', p.vigente_hasta is null, 'nombre', p.nombre, 'tipo_captura', p.tipo_captura, 'obligatorio', p.obligatorio,
      'formula_esperado', p.formula_esperado, 'tolerancia', piefirme_app.ctl_tolerancia_punto(c.organizacion_id, c.sucursal_id, p),
      'captura', case when k.id is null then null else jsonb_build_object('id', k.id, 'valor', k.valor_capturado, 'capturado_en', k.capturado_en, 'correcciones', (select count(*) from piefirme.ctl_cierre_captura z where z.cierre_id = c.id and z.punto_control_id = p.id) - 1,
          'denominaciones', (select coalesce(jsonb_agg(jsonb_build_object('denominacion', d.denominacion, 'cantidad', d.cantidad) order by d.denominacion desc), '[]'::jsonb) from piefirme.ctl_denominacion d where d.cierre_captura_id = k.id),
          'valor_calculado', kc.valor_calculado, 'valor_esperado', kc.valor_esperado, 'diferencia', kc.diferencia, 'dentro_tolerancia', kc.dentro_tolerancia, 'detalle', kc.detalle) end,
      'evidencias', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'ruta', e.url_almacenamiento, 'hash', e.hash_sha256, 'capturado_en', e.capturado_en, 'toma_fija_id', e.toma_fija_id,
                        'toma', (select t.nombre from piefirme.ctl_toma_fija t where t.id = e.toma_fija_id)) order by e.seq), '[]'::jsonb)
                       from piefirme.ctl_evidencia e where e.tipo_origen = 'cierre_captura' and e.origen_id in (select z.id from piefirme.ctl_cierre_captura z where z.cierre_id = c.id and z.punto_control_id = p.id))
    ) order by ord), '[]'::jsonb) into v_puntos
    from jsonb_array_elements(c.version_checklist) with ordinality x(e, ord)
    join piefirme.ctl_punto_control p on p.id = (x.e ->> 'punto_id')::uuid
    left join lateral (select z.* from piefirme.ctl_cierre_captura z where z.cierre_id = c.id and z.punto_control_id = p.id and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = z.id)) k on true
    left join piefirme.ctl_cierre_calculo kc on kc.cierre_captura_id = k.id;
  select datos into v_corte from piefirme.ctl_cierre_corte where cierre_id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'folio', k.folio, 'tipo', k.tipo, 'estado', k.estado, 'valor', k.valor, 'cantidad', k.cantidad) order by k.folio), '[]'::jsonb) into v_casos
    from piefirme.ctl_caso k where k.organizacion_id = v_org and k.origen_tipo = 'cierre_captura' and k.origen_id in (select z.id from piefirme.ctl_cierre_captura z where z.cierre_id = c.id);
  select to_jsonb(e) into v_ent from piefirme.ctl_entrega e where e.cierre_id = c.id;
  return jsonb_build_object('cierre', to_jsonb(c) - 'version_checklist', 'version_checklist', c.version_checklist, 'puntos', v_puntos, 'corte', v_corte, 'casos', v_casos, 'entrega', v_ent,
    'usuario_cierra', (select trim(pf.nombre || ' ' || coalesce(pf.apellidos, '')) from piefirme.perfiles pf where pf.id = c.usuario_cierra),
    'usuario_recibe', (select trim(pf.nombre || ' ' || coalesce(pf.apellidos, '')) from piefirme.perfiles pf where pf.id = c.usuario_recibe),
    'sucursal', (select s.nombre from piefirme.sedes s where s.id = c.sucursal_id));
end $$;

-- Lista de cierres para revisión (dueño y supervisor), con los indicadores que importan.
create or replace function piefirme.ctl_cierres_listar(p_sucursal uuid default null, p_desde timestamptz default null, p_hasta timestamptz default null,
                                                      p_tipo text default null, p_estado text default null, p_limite integer default 100) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  return coalesce((select jsonb_agg(x order by (x ->> 'abierto_en') desc) from (
    select jsonb_build_object('id', c.id, 'folio', c.folio, 'sucursal_id', c.sucursal_id, 'sucursal', s.nombre, 'tipo', c.tipo, 'estado', c.estado, 'abierto_en', c.abierto_en, 'cerrado_en', c.cerrado_en,
             'aceptado_en', c.aceptado_en, 'turno_id', c.turno_id,
             'usuario_cierra', trim(pf.nombre || ' ' || coalesce(pf.apellidos, '')),
             'fuera_tolerancia', (select count(*) from piefirme.ctl_cierre_calculo k where k.cierre_id = c.id and k.dentro_tolerancia is false),
             'casos', (select count(*) from piefirme.ctl_caso z where z.organizacion_id = c.organizacion_id and z.origen_tipo = 'cierre_captura' and z.origen_id in (select y.id from piefirme.ctl_cierre_captura y where y.cierre_id = c.id))) as x
      from piefirme.ctl_cierre c
      join piefirme.sedes s on s.id = c.sucursal_id
      left join piefirme.perfiles pf on pf.id = c.usuario_cierra
     where c.organizacion_id = v_org and piefirme_app.puede_sede(c.sucursal_id)
       and (p_sucursal is null or c.sucursal_id = p_sucursal) and (p_desde is null or c.abierto_en >= p_desde) and (p_hasta is null or c.abierto_en <= p_hasta)
       and (p_tipo is null or c.tipo = p_tipo) and (p_estado is null or c.estado = p_estado)
     order by c.abierto_en desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) q), '[]'::jsonb);
end $$;

-- ───────────────────────────── privilegios de ejecución ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_alcance', 'ctl_efectivo_turno', 'ctl_tolerancia_punto', 'ctl_calc_kits', 'ctl_calcular_punto',
                  'ctl_denominaciones_validas', 'ctl_tomas_aplicables', 'ctl_recorrido', 'ctl_cierre_abrir', 'ctl_cierre_capturar', 'ctl_cierre_recorrido', 'ctl_cierre_detalle', 'ctl_cierres_listar') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
