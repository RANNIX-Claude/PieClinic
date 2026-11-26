-- 232 · Control y Auditoría · ETAPA 4 · CERRAR EL CIERRE (esperados, corte, casos) y ENTREGA DE TURNO CON DOBLE FIRMA.
-- Al cerrar, el servidor: exige los puntos obligatorios, calcula esperado/diferencia/dentro_tolerancia de cada punto con fórmula (ctl_cierre_calculo),
-- abre un caso por cada punto fuera de tolerancia (nace SIEMPRE de una captura), arma el corte (solo dueño y supervisor) y deja el cierre en
-- «cerrado» o, si es un cierre de turno con entrega, en «entrega_no_aceptada» hasta que quien recibe cuente y firme con su PIN (F3.3).
-- Quien captura recibe SOLO {ok, folio, estado}: ni esperado, ni diferencia, ni corte.
-- Regla «el entrante no puede vender hasta aceptar» (criterio 19): piefirme.ctl_puede_vender(sucursal) + trigger sobre ventas (bloquea el COBRO).
-- Regla «el fondo inicial del turno siguiente es el monto confirmado» : trigger sobre turnos_caja (pisa el fondo tecleado) y, si el turno ya estaba
-- abierto al aceptar, se corrige en ese momento.
-- Depende de: 200–206, 230, 231.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── PIN con bloqueo temporal (mismo criterio que ctl_pin_abrir_sesion) ─────────────────────────────
-- Devuelve {ok:false,...} en vez de lanzar para conservar el intento fallido (si se lanzara, la transacción lo deshace y el bloqueo nunca se activaría).
create or replace function piefirme_app.ctl_verificar_pin(p_org uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_desde bigint; v_fallos integer; v_ok boolean; v_ultimo timestamptz;
begin
  select coalesce(max(i.id), 0) into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'pin' and i.exito;
  select count(*), max(i.creado_en) into v_fallos, v_ultimo from piefirme.ctl_intento i
   where i.usuario_id = auth.uid() and i.tipo = 'pin' and not i.exito and i.id > v_desde and i.creado_en > now() - interval '15 minutes';
  if v_fallos >= 3 then
    raise exception 'PIN bloqueado por intentos fallidos; espere % minutos o use su contraseña', greatest(1, ceil(extract(epoch from (v_ultimo + interval '15 minutes' - now())) / 60))::integer using errcode = 'PF429';
  end if;
  if not exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'sin_pin', 'mensaje', 'Defina su PIN en «Mi PIN» antes de firmar.');
  end if;
  v_ok := coalesce(p_pin, '') ~ '^[0-9]{4,8}$' and exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = auth.uid() and pp.pin_hash = piefirme_app.hash_pin(pp.perfil_id, p_pin));
  insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values (p_org, auth.uid(), 'pin', v_ok);
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'pin_incorrecto', 'mensaje', 'PIN incorrecto.', 'intentos_restantes', greatest(0, 2 - v_fallos)); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Suma de un desglose [{denominacion, cantidad}] con las mismas validaciones que la captura de cierres.
create or replace function piefirme_app.ctl_suma_desglose(p_desglose jsonb) returns numeric
language plpgsql immutable set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare d jsonb; v_den numeric; v_cant numeric; v_vistas numeric[] := '{}'; v_total numeric := 0;
begin
  if p_desglose is null or jsonb_typeof(p_desglose) <> 'array' or jsonb_array_length(p_desglose) = 0 then raise exception 'capture el desglose por denominación' using errcode = 'PF422'; end if;
  for d in select * from jsonb_array_elements(p_desglose) loop
    v_den := (d ->> 'denominacion')::numeric; v_cant := (d ->> 'cantidad')::numeric;
    if v_den is null or v_den <> all (piefirme_app.ctl_denominaciones_validas()) then raise exception 'denominación no válida: %', d ->> 'denominacion' using errcode = 'PF422'; end if;
    if v_cant is null or v_cant < 0 or v_cant <> trunc(v_cant) or v_cant > 100000 then raise exception 'cantidad no válida para la denominación %', v_den using errcode = 'PF422'; end if;
    if v_den = any (v_vistas) then raise exception 'la denominación % viene repetida', v_den using errcode = 'PF422'; end if;
    v_vistas := v_vistas || v_den; v_total := v_total + v_den * v_cant;
  end loop;
  return v_total;
end $$;

-- ───────────────────────────── corte del cierre (solo dueño y supervisor) ─────────────────────────────
create or replace function piefirme_app.ctl_armar_corte(p_cierre uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.ctl_cierre; a record; v_f jsonb; v_tick integer; v_can_n integer; v_can_t numeric; v_cajon integer; v_bajo jsonb;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre;
  select * into a from piefirme_app.ctl_alcance(c);
  select coalesce(jsonb_object_agg(pc.formula_esperado, jsonb_build_object('punto', pc.nombre, 'capturado', k.valor_capturado, 'calculado', kc.valor_calculado, 'esperado', kc.valor_esperado,
            'diferencia', kc.diferencia, 'dentro_tolerancia', kc.dentro_tolerancia, 'detalle', kc.detalle)), '{}'::jsonb) into v_f
    from piefirme.ctl_cierre_captura k join piefirme.ctl_cierre_calculo kc on kc.cierre_captura_id = k.id join piefirme.ctl_punto_control pc on pc.id = k.punto_control_id
   where k.cierre_id = c.id;
  select count(*) into v_tick from piefirme.ventas v where v.organizacion_id = c.organizacion_id and v.sede_id = c.sucursal_id and v.estado in ('cobrada', 'por_facturar', 'facturada')
     and (v.turno_id = any (a.turnos) or (cardinality(a.turnos) = 0 and v.cobrada_en >= a.desde and v.cobrada_en <= a.hasta));
  select count(*), coalesce(sum(v.total), 0) into v_can_n, v_can_t from piefirme.ventas v where v.organizacion_id = c.organizacion_id and v.sede_id = c.sucursal_id and v.estado = 'cancelada'
     and (v.cancelada_turno_id = any (a.turnos) or (cardinality(a.turnos) = 0 and v.cancelada_en >= a.desde and v.cancelada_en <= a.hasta));
  -- aperturas de cajón sin venta: las emite el origen como evento (Etapa 1); hasta entonces el conteo es 0
  select count(*) into v_cajon from piefirme.ctl_eventos_entrada ev where ev.organizacion_id = c.organizacion_id and ev.evento = 'cajon_abierto_sin_venta'
     and ev.payload ->> 'sucursal_id' = c.sucursal_id::text and ev.creado_en >= a.desde and ev.creado_en <= a.hasta;
  -- ventas por debajo de catálogo: precio efectivamente cobrado por unidad contra el precio de catálogo vigente
  select jsonb_build_object('lineas', count(*), 'monto', coalesce(sum(q.dif), 0),
           'detalle', coalesce(jsonb_agg(jsonb_build_object('ticket', q.folio, 'concepto', q.descripcion, 'catalogo', q.catalogo, 'cobrado', q.cobrado, 'cantidad', q.cantidad, 'motivo', q.motivo) order by q.dif desc) filter (where q.rn <= 20), '[]'::jsonb))
    into v_bajo
    from (select v.folio, l.descripcion, l.cantidad, l.descuento_motivo as motivo, cat.precio as catalogo, round(l.importe / l.cantidad, 2) as cobrado,
                 round(cat.precio * l.cantidad - l.importe, 2) as dif, row_number() over (order by cat.precio * l.cantidad - l.importe desc) as rn
            from piefirme.ventas v
            join piefirme.venta_lineas l on l.venta_id = v.id and l.tipo in ('servicio', 'producto') and l.tipo_precio in ('fijo', 'incluido')
            cross join lateral (select piefirme_app.precio_item(v.organizacion_id, l.tipo, coalesce(l.servicio_id, l.producto_id), v.sede_id) as precio) cat
           where v.organizacion_id = c.organizacion_id and v.sede_id = c.sucursal_id and v.estado in ('cobrada', 'por_facturar', 'facturada')
             and (v.turno_id = any (a.turnos) or (cardinality(a.turnos) = 0 and v.cobrada_en >= a.desde and v.cobrada_en <= a.hasta))
             and cat.precio is not null and l.importe / l.cantidad < cat.precio - 0.005) q;
  return jsonb_build_object('tipo', c.tipo, 'turnos', cardinality(a.turnos), 'desde', a.desde,
    'efectivo', v_f -> 'efectivo_esperado', 'tarjeta', v_f -> 'tarjeta_esperada', 'transferencia', v_f -> 'transferencia_esperada', 'kits', v_f -> 'kits_usados', 'tickets_cobrados_formula', v_f -> 'tickets_cobrados',
    'tickets', v_tick, 'cancelaciones', jsonb_build_object('numero', v_can_n, 'monto', v_can_t), 'aperturas_cajon_sin_venta', v_cajon, 'ventas_bajo_catalogo', v_bajo);
end $$;

-- ───────────────────────────── RPC: cerrar el cierre ─────────────────────────────
create or replace function piefirme.ctl_cierre_cerrar(p_cierre uuid, p_con_entrega boolean default null, p_monto_confirmado numeric default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cierre; rec jsonb; v_falta text; p piefirme.ctl_punto_control; cap piefirme.ctl_cierre_captura; calc jsonb; r record;
        v_esp numeric; v_cal numeric; v_dif numeric; v_tol numeric; v_dentro boolean; v_fuera integer := 0; v_caso uuid; v_caso_folio text; v_tipo_caso text; v_con_ent boolean; v_desglose numeric;
        v_ent uuid; v_estado text; v_suc text; v_msg text; v_det jsonb; v_casos text[] := '{}';
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'cierre no encontrado' using errcode = 'PF404'; end if;
  if c.usuario_cierra <> auth.uid() then raise exception 'solo quien abrió el cierre puede cerrarlo' using errcode = 'PF403'; end if;
  if c.estado <> 'en_captura' then   -- reenvío idempotente
    return jsonb_build_object('ok', true, 'idempotente', true, 'folio', c.folio, 'estado', c.estado);
  end if;
  rec := piefirme_app.ctl_recorrido(c.id);
  select string_agg((x ->> 'nombre') || ' (' || coalesce(x ->> 'falta', 'incompleto') || ')', '; ') into v_falta
    from jsonb_array_elements(rec -> 'puntos') x where (x ->> 'obligatorio')::boolean and not (x ->> 'completo')::boolean;
  if v_falta is not null then raise exception 'No se puede cerrar: faltan puntos obligatorios — %', v_falta using errcode = 'PF422'; end if;
  v_con_ent := coalesce(p_con_entrega, c.tipo = 'turno');
  if v_con_ent and c.tipo <> 'turno' then raise exception 'la entrega con doble firma solo aplica a un cierre de turno' using errcode = 'PF422'; end if;
  select s.nombre into v_suc from piefirme.sedes s where s.id = c.sucursal_id;
  perform piefirme_app.ctl_rpc_on();

  -- 1 · esperados, diferencia y tolerancia; un caso por cada punto fuera de tolerancia
  for r in select (e ->> 'punto_id')::uuid as pid from jsonb_array_elements(c.version_checklist) with ordinality x(e, ord) order by ord loop
    select * into p from piefirme.ctl_punto_control where id = r.pid;
    continue when p.formula_esperado is null;
    select * into cap from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p.id and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id);
    continue when cap.id is null or cap.valor_capturado is null;
    calc := piefirme_app.ctl_calcular_punto(c, p, cap.valor_capturado);
    continue when calc is null;
    v_cal := (calc ->> 'calculado')::numeric; v_esp := (calc ->> 'esperado')::numeric;
    v_tol := piefirme_app.ctl_tolerancia_punto(c.organizacion_id, c.sucursal_id, p);
    v_dif := case when v_esp is null or v_cal is null then null else round(v_cal - v_esp, 2) end;
    v_dentro := case when v_dif is null then null else abs(v_dif) <= v_tol end;
    v_det := coalesce(calc -> 'detalle', '{}'::jsonb) || jsonb_build_object('tolerancia', v_tol, 'formula', p.formula_esperado);
    insert into piefirme.ctl_cierre_calculo (cierre_captura_id, organizacion_id, sucursal_id, cierre_id, valor_esperado, diferencia, dentro_tolerancia, valor_calculado, detalle)
    values (cap.id, v_org, c.sucursal_id, c.id, v_esp, v_dif, v_dentro, v_cal, v_det);
    if v_dentro is false then
      v_fuera := v_fuera + 1;
      v_tipo_caso := case p.formula_esperado when 'kits_usados' then 'diferencia_kits' else 'diferencia_efectivo' end;   -- tarjeta y transferencias comparten el tipo (contexto.formula las distingue)
      insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, cantidad, valor, usuario_captura, turno_saliente_id, contexto)
      values (v_org, c.sucursal_id, v_tipo_caso, 'cierre_captura', cap.id,
              case when p.formula_esperado in ('kits_usados', 'tickets_cobrados') then v_dif end,
              case when p.formula_esperado in ('efectivo_esperado', 'tarjeta_esperada', 'transferencia_esperada') then v_dif end,
              c.usuario_cierra, c.turno_id,
              jsonb_build_object('cierre_id', c.id, 'cierre_folio', c.folio, 'punto', p.nombre, 'formula', p.formula_esperado, 'capturado', cap.valor_capturado, 'calculado', v_cal, 'esperado', v_esp,
                                 'diferencia', v_dif, 'tolerancia', v_tol, 'detalle', v_det, 'insumo_producto_id', p.parametros ->> 'producto_id'))
      returning id, folio into v_caso, v_caso_folio;
      v_casos := v_casos || v_caso_folio;
      insert into piefirme.ctl_caso_bitacora (organizacion_id, sucursal_id, caso_id, usuario_id, tipo, texto, estado_nuevo)
      values (v_org, c.sucursal_id, v_caso, null, 'cambio_estado', 'Caso abierto automáticamente al cerrar ' || c.folio || ' (' || p.nombre || ' fuera de tolerancia).', 'abierta');
      if p.formula_esperado = 'kits_usados' and v_dif > 0 then   -- criterio 20: 12 kits y 10 tickets = dos servicios sin cobro, esa misma noche
        insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
        values (v_org, c.sucursal_id, 'kits_sin_ticket', 'alta', array['dueno'],
                format('%s: se usaron %s kits y se cobraron %s servicios (%s tickets): %s servicio(s) sin cobro. Cierre %s.', v_suc, v_cal, v_esp, coalesce(v_det ->> 'tickets_de_servicio', '0'), v_dif, c.folio), 'caso', v_caso);
      end if;
    end if;
  end loop;
  if v_fuera > 0 then
    insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
    values (v_org, c.sucursal_id, 'cierre_fuera_tolerancia', 'alta', array['dueno', 'supervisor'],
            format('%s: el cierre %s tiene %s punto(s) fuera de tolerancia. Casos: %s.', v_suc, c.folio, v_fuera, array_to_string(v_casos, ', ')), 'cierre', c.id);
  end if;

  -- 2 · corte (solo dueño y supervisor) y alertas del par cierre/apertura
  if c.tipo <> 'apertura' then
    insert into piefirme.ctl_cierre_corte (cierre_id, organizacion_id, sucursal_id, datos) values (c.id, v_org, c.sucursal_id, piefirme_app.ctl_armar_corte(c.id));
  end if;
  perform piefirme_app.ctl_alertas_tomas(c.id);

  -- 3 · entrega de turno con doble firma: quien entrega confirma el monto con su usuario
  if v_con_ent then
    select k.valor_capturado into v_desglose from piefirme.ctl_cierre_captura k join piefirme.ctl_punto_control pc on pc.id = k.punto_control_id
     where k.cierre_id = c.id and pc.tipo_captura = 'denominaciones' and pc.formula_esperado = 'efectivo_esperado' and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id) limit 1;
    if p_monto_confirmado is null or p_monto_confirmado < 0 then raise exception 'Confirme el monto de efectivo que entrega al turno siguiente' using errcode = 'PF422'; end if;
    if v_desglose is not null and p_monto_confirmado <> v_desglose then
      raise exception 'El monto que confirma (%) no coincide con el desglose que contó (%). Corrija el desglose o el monto.', p_monto_confirmado, v_desglose using errcode = 'PF422';
    end if;
    insert into piefirme.ctl_entrega (organizacion_id, sucursal_id, cierre_id, turno_saliente_id, usuario_entrega, monto_entregado)
    values (v_org, c.sucursal_id, c.id, c.turno_id, auth.uid(), p_monto_confirmado) returning id into v_ent;
    insert into piefirme.ctl_entrega_firma (organizacion_id, sucursal_id, entrega_id, lado, usuario_id, monto, desglose, hora_cliente)
    values (v_org, c.sucursal_id, v_ent, 'entrega', auth.uid(), p_monto_confirmado,
            (select jsonb_agg(jsonb_build_object('denominacion', d.denominacion, 'cantidad', d.cantidad) order by d.denominacion desc) from piefirme.ctl_denominacion d
              join piefirme.ctl_cierre_captura k on k.id = d.cierre_captura_id join piefirme.ctl_punto_control pc on pc.id = k.punto_control_id
             where k.cierre_id = c.id and pc.formula_esperado = 'efectivo_esperado' and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id)), p_hora_cliente);
    v_estado := 'entrega_no_aceptada';
  else
    v_estado := 'cerrado';
  end if;
  update piefirme.ctl_cierre set estado = v_estado, cerrado_en = now() where id = c.id;
  return jsonb_build_object('ok', true, 'folio', c.folio, 'estado', v_estado, 'entrega_id', v_ent);   -- NADA más: ni esperado, ni diferencia, ni corte
end $$;

-- ───────────────────────────── entrega: bloqueo de venta, lectura a ciegas y firma del que recibe ─────────────────────────────
create or replace function piefirme_app.ctl_entrega_bloqueante(p_org uuid, p_sucursal uuid) returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select e.id from piefirme.ctl_entrega e where e.organizacion_id = p_org and e.sucursal_id = p_sucursal and e.estado = 'pendiente' order by e.entregado_en limit 1
$$;

-- «¿Puede vender esta sucursal?» (criterio 19). Caja y la PWA la consultan; el cobro además está bloqueado por trigger (abajo).
-- Contrato: {puede: boolean, motivo, entrega_id, cierre_folio, entregado_en}. No incluye montos.
create or replace function piefirme.ctl_puede_vender(p_sucursal uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir(null); v_e uuid; e record;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) then raise exception 'sucursal no válida' using errcode = 'PF403'; end if;
  v_e := piefirme_app.ctl_entrega_bloqueante(v_org, p_sucursal);
  if v_e is null then return jsonb_build_object('puede', true); end if;
  select en.entregado_en, ci.folio into e from piefirme.ctl_entrega en join piefirme.ctl_cierre ci on ci.id = en.cierre_id where en.id = v_e;
  return jsonb_build_object('puede', false, 'entrega_id', v_e, 'cierre_folio', e.folio, 'entregado_en', e.entregado_en,
    'motivo', 'La entrega del turno anterior no se ha aceptado: cuente el efectivo y acéptela con su PIN (Auditoría → Cierres) antes de vender.');
end $$;

-- Entregas pendientes de la sucursal para quien va a recibir. SIN monto: quien recibe cuenta a ciegas.
create or replace function piefirme.ctl_entregas_pendientes(p_sucursal uuid default null) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'cierre_id', e.cierre_id, 'folio', ci.folio, 'sucursal_id', e.sucursal_id, 'sucursal', s.nombre,
            'entrega', trim(pf.nombre || ' ' || coalesce(pf.apellidos, '')), 'usuario_entrega', e.usuario_entrega, 'entregado_en', e.entregado_en,
            'horas', round(extract(epoch from (now() - e.entregado_en)) / 3600, 1), 'puede_aceptar', e.usuario_entrega <> auth.uid()) order by e.entregado_en)
     from piefirme.ctl_entrega e join piefirme.ctl_cierre ci on ci.id = e.cierre_id join piefirme.sedes s on s.id = e.sucursal_id left join piefirme.perfiles pf on pf.id = e.usuario_entrega
    where e.organizacion_id = v_org and e.estado = 'pendiente' and piefirme_app.puede_sede(e.sucursal_id) and (p_sucursal is null or e.sucursal_id = p_sucursal)), '[]'::jsonb);
end $$;

-- Quien recibe cuenta (desglose o monto), firma con su PIN y confirma. Cuadra → el fondo inicial del turno siguiente es ese monto.
-- No cuadra → se muestra la diferencia a ambos, se abre el caso diferencia_relevo con las dos firmas y se alerta al dueño y al supervisor.
create or replace function piefirme.ctl_entrega_aceptar(p_entrega uuid, p_pin text, p_monto_contado numeric default null, p_denominaciones jsonb default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); e piefirme.ctl_entrega%rowtype; v_pin jsonb; v_monto numeric; v_cuadra boolean; v_estado text; v_firma uuid; v_caso uuid; v_turno uuid; ci piefirme.ctl_cierre%rowtype; v_suc text; v_dif numeric;
begin
  select * into e from piefirme.ctl_entrega where id = p_entrega and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(e.sucursal_id) then raise exception 'entrega no encontrada' using errcode = 'PF404'; end if;
  if e.estado <> 'pendiente' then
    if e.usuario_recibe = auth.uid() and e.estado in ('aceptada', 'aceptada_con_diferencia') then   -- reenvío idempotente
      return jsonb_build_object('ok', true, 'idempotente', true, 'cuadra', e.estado = 'aceptada', 'fondo_inicial', e.fondo_inicial);
    end if;
    raise exception 'esta entrega ya está %', e.estado using errcode = 'PF409';
  end if;
  if e.usuario_entrega = auth.uid() then raise exception 'Quien entrega no puede aceptar su propia entrega: la recibe la persona del turno siguiente.' using errcode = 'PF403'; end if;
  if p_denominaciones is not null then
    v_monto := piefirme_app.ctl_suma_desglose(p_denominaciones);
    if p_monto_contado is not null and p_monto_contado <> v_monto then raise exception 'el monto no coincide con el desglose: el total es la suma de lo contado' using errcode = 'PF422'; end if;
  else
    v_monto := p_monto_contado;
  end if;
  if v_monto is null or v_monto < 0 then raise exception 'indique el efectivo que contó' using errcode = 'PF422'; end if;
  v_pin := piefirme_app.ctl_verificar_pin(v_org, p_pin);
  if not (v_pin ->> 'ok')::boolean then return v_pin; end if;

  perform piefirme_app.ctl_rpc_on();
  v_cuadra := v_monto = e.monto_entregado;
  v_estado := case when v_cuadra then 'aceptada' else 'aceptada_con_diferencia' end;
  insert into piefirme.ctl_entrega_firma (organizacion_id, sucursal_id, entrega_id, lado, usuario_id, monto, desglose, hora_cliente)
  values (v_org, e.sucursal_id, e.id, 'recibe', auth.uid(), v_monto, p_denominaciones, p_hora_cliente) returning id into v_firma;
  select * into ci from piefirme.ctl_cierre where id = e.cierre_id for update;
  v_dif := round(v_monto - e.monto_entregado, 2);
  if not v_cuadra then
    select s.nombre into v_suc from piefirme.sedes s where s.id = e.sucursal_id;
    insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, valor, usuario_captura, turno_saliente_id, contexto)
    values (v_org, e.sucursal_id, 'diferencia_relevo', 'entrega_firma', v_firma, v_dif, auth.uid(), e.turno_saliente_id,
            jsonb_build_object('cierre_id', ci.id, 'cierre_folio', ci.folio, 'entrega_id', e.id, 'monto_entregado', e.monto_entregado, 'monto_contado_por_quien_recibe', v_monto, 'diferencia', v_dif,
                               'firma_entrega', e.usuario_entrega, 'firma_recibe', auth.uid(), 'concepto', 'efectivo en la entrega de turno'))
    returning id into v_caso;
    insert into piefirme.ctl_caso_bitacora (organizacion_id, sucursal_id, caso_id, usuario_id, tipo, texto, estado_nuevo)
    values (v_org, e.sucursal_id, v_caso, null, 'cambio_estado', 'Caso abierto automáticamente: el efectivo contado al recibir no coincide con el entregado (' || ci.folio || ').', 'abierta');
    insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
    values (v_org, e.sucursal_id, 'diferencia_relevo', 'alta', array['dueno', 'supervisor'],
            format('%s: diferencia en la entrega de turno %s. Entregó %s, recibió %s (diferencia %s).', v_suc, ci.folio, e.monto_entregado, v_monto, v_dif), 'caso', v_caso);
  end if;
  -- el turno siguiente: si quien recibe ya abrió su turno, su fondo inicial pasa a ser el monto confirmado (nunca uno tecleado)
  select t.id into v_turno from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = e.sucursal_id and t.cajero_id = auth.uid() and t.estado = 'abierto' order by t.apertura_en desc limit 1;
  if v_turno is not null then update piefirme.turnos_caja set fondo_inicial = v_monto where id = v_turno; end if;
  update piefirme.ctl_entrega set estado = v_estado, usuario_recibe = auth.uid(), monto_recibido = v_monto, recibido_en = now(), fondo_inicial = v_monto, caso_id = v_caso, turno_entrante_id = v_turno where id = e.id;
  update piefirme.ctl_cierre set estado = 'cerrado', usuario_recibe = auth.uid(), aceptado_en = now() where id = ci.id;
  return jsonb_build_object('ok', true, 'cuadra', v_cuadra, 'fondo_inicial', v_monto, 'entrega_id', e.id) ||
         case when v_cuadra then '{}'::jsonb else jsonb_build_object('diferencia', v_dif, 'monto_entregado', e.monto_entregado, 'caso_id', v_caso,
              'mensaje', 'El efectivo contado no coincide con el entregado. Se abrió un caso y se avisó al dueño; el fondo del turno queda en lo que usted contó.') end;
end $$;

-- Liberación por supervisor o dueño (nadie queda bloqueado para siempre si el entrante no llega); queda registrada y alerta al dueño.
create or replace function piefirme.ctl_entrega_liberar(p_entrega uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); e piefirme.ctl_entrega%rowtype; v_suc text; v_folio text;
begin
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'indique el motivo de la liberación' using errcode = 'PF422'; end if;
  select * into e from piefirme.ctl_entrega where id = p_entrega and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(e.sucursal_id) then raise exception 'entrega no encontrada' using errcode = 'PF404'; end if;
  if e.estado <> 'pendiente' then raise exception 'esta entrega ya está %', e.estado using errcode = 'PF409'; end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_entrega set estado = 'liberada', liberada_por = auth.uid(), liberada_en = now(), motivo_liberacion = btrim(p_motivo) where id = e.id;
  select s.nombre into v_suc from piefirme.sedes s where s.id = e.sucursal_id; select folio into v_folio from piefirme.ctl_cierre where id = e.cierre_id;
  insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
  values (v_org, e.sucursal_id, 'entrega_liberada', 'media', array['dueno'], format('%s: la entrega %s se liberó sin aceptación. Motivo: %s', v_suc, v_folio, btrim(p_motivo)), 'cierre', e.cierre_id);
  return jsonb_build_object('ok', true, 'estado', 'liberada');
end $$;

-- ───────────────────────────── triggers sobre el origen (Caja) ─────────────────────────────
-- Bloqueo del COBRO mientras haya una entrega pendiente en la sucursal (criterio 19). Solo actúa con sesión de usuario y solo si el módulo creó una entrega:
-- sin entregas pendientes (es decir, mientras nadie use el cierre con doble firma) Caja se comporta exactamente igual que antes.
create or replace function piefirme_app.ctl_trg_venta_bloqueo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if auth.uid() is null then return new; end if;
  if piefirme_app.ctl_entrega_bloqueante(new.organizacion_id, new.sede_id) is not null then
    raise exception 'La entrega del turno anterior no se ha aceptado: cuente el efectivo y acéptela con su PIN (Auditoría → Cierres) antes de vender.' using errcode = 'PF409';
  end if;
  return new;
end $$;
drop trigger if exists t_ctl_bloqueo_entrega on piefirme.ventas;
create trigger t_ctl_bloqueo_entrega before update of estado on piefirme.ventas for each row
  when (new.estado in ('cobrada', 'por_facturar') and old.estado in ('por_cobrar', 'cuenta_abierta')) execute function piefirme_app.ctl_trg_venta_bloqueo();

-- El fondo inicial del turno es el monto que confirmó quien recibió (si aceptó antes de abrir su turno): lo que se teclee se ignora.
create or replace function piefirme_app.ctl_trg_turno_fondo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare e piefirme.ctl_entrega%rowtype;
begin
  if auth.uid() is null then return new; end if;
  select * into e from piefirme.ctl_entrega x where x.organizacion_id = new.organizacion_id and x.sucursal_id = new.sede_id and x.estado in ('aceptada', 'aceptada_con_diferencia')
     and x.turno_entrante_id is null and x.usuario_recibe = new.cajero_id and x.recibido_en > now() - interval '24 hours' order by x.recibido_en desc limit 1 for update skip locked;
  if found then
    new.fondo_inicial := e.fondo_inicial;
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_entrega set turno_entrante_id = new.id where id = e.id;
  end if;
  return new;
end $$;
drop trigger if exists t_ctl_fondo_entrega on piefirme.turnos_caja;
create trigger t_ctl_fondo_entrega before insert on piefirme.turnos_caja for each row execute function piefirme_app.ctl_trg_turno_fondo();

-- ───────────────────────────── privilegios de ejecución ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_verificar_pin', 'ctl_suma_desglose', 'ctl_armar_corte', 'ctl_cierre_cerrar', 'ctl_entrega_bloqueante', 'ctl_puede_vender',
                  'ctl_entregas_pendientes', 'ctl_entrega_aceptar', 'ctl_entrega_liberar', 'ctl_trg_venta_bloqueo', 'ctl_trg_turno_fondo') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
