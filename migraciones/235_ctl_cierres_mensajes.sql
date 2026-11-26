-- 235 · Control y Auditoría · ETAPA 4 · ajuste de redacción: la alerta de kits sin ticket muestra cantidades sin ceros sobrantes («2 servicio(s) sin cobro», no «2.00»).
-- Redefine ctl_cierre_cerrar (mismo contrato que en 232; solo cambia el formato del mensaje de la alerta) y ctl_cierre_foto (233): una venta cobrada en el MISMO instante
-- que la foto de apertura cuenta como anterior a ella (<=), para que el límite sea inclusivo.
set search_path = piefirme, piefirme_app, extensions;

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
                format('%s: se usaron %s kits y se cobraron %s servicios (%s tickets): %s servicio(s) sin cobro. Cierre %s.', v_suc, trim_scale(v_cal), trim_scale(v_esp), coalesce(v_det ->> 'tickets_de_servicio', '0'), trim_scale(v_dif), c.folio), 'caso', v_caso);
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

revoke all on function piefirme.ctl_cierre_cerrar(uuid, boolean, numeric, timestamptz) from public, anon;
grant execute on function piefirme.ctl_cierre_cerrar(uuid, boolean, numeric, timestamptz) to authenticated;

create or replace function piefirme.ctl_cierre_foto(p_evidencia_id uuid, p_cierre uuid, p_punto uuid, p_ruta text, p_hash text, p_bytes integer default null, p_ancho integer default null,
                                                   p_alto integer default null, p_toma_fija uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cierre; p piefirme.ctl_punto_control; cap piefirme.ctl_cierre_captura; v_cap uuid; v_res jsonb; v_id uuid;
        v_es_toma boolean; v_tz text; v_ini timestamptz; v_suc text;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'cierre no encontrado' using errcode = 'PF404'; end if;
  if c.usuario_cierra <> auth.uid() then raise exception 'solo quien abrió el cierre captura en él' using errcode = 'PF403'; end if;
  if c.estado <> 'en_captura' then raise exception 'el cierre ya está % y no admite fotos', c.estado using errcode = 'PF409'; end if;
  if not exists (select 1 from jsonb_array_elements(c.version_checklist) e where (e ->> 'punto_id')::uuid = p_punto) then raise exception 'ese punto no pertenece a este cierre' using errcode = 'PF422'; end if;
  select * into p from piefirme.ctl_punto_control where id = p_punto;
  if p.tipo_captura not in ('solo_foto', 'numero_y_foto') then raise exception 'este punto no pide foto' using errcode = 'PF422'; end if;
  v_es_toma := coalesce((p.parametros ->> 'toma_fija')::boolean, false);
  if v_es_toma then
    if p_toma_fija is null or not exists (select 1 from piefirme_app.ctl_tomas_aplicables(v_org, c.sucursal_id, c.tipo) t where t.id = p_toma_fija) then
      raise exception 'indique una toma fija activa de esta sucursal que aplique a este cierre' using errcode = 'PF422';
    end if;
  elsif p_toma_fija is not null then raise exception 'este punto no es de tomas fijas' using errcode = 'PF422';
  end if;
  select * into cap from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p.id and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id);
  if cap.id is null then
    if p.tipo_captura = 'numero_y_foto' then raise exception 'capture primero el valor de «%» y luego su foto', p.nombre using errcode = 'PF422'; end if;
    perform piefirme_app.ctl_rpc_on();
    insert into piefirme.ctl_cierre_captura (organizacion_id, sucursal_id, cierre_id, punto_control_id, valor_capturado, hora_cliente)
    values (v_org, c.sucursal_id, c.id, p.id, null, p_hora_cliente) returning id into v_cap;
  else
    v_cap := cap.id;
  end if;
  v_res := piefirme.ctl_evidencia_registrar(p_evidencia_id, c.sucursal_id, 'cierre_captura', v_cap, p_ruta, p_hash, p_bytes, p_ancho, p_alto, p_hora_cliente, p_toma_fija);
  v_id := (v_res ->> 'id')::uuid;
  if p_toma_fija is not null and not coalesce((v_res ->> 'duplicada')::boolean, false) then
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_toma_fija set evidencia_referencia_id = v_id where id = p_toma_fija;   -- la guía fantasma de la próxima toma
    -- apertura fotografiada después de la primera venta del día
    if c.tipo = 'apertura' and not exists (select 1 from piefirme.ctl_alerta a where a.tipo = 'apertura_tardia' and a.referencia_id = c.id) then
      select coalesce(o.zona_horaria, 'America/Mexico_City') into v_tz from piefirme.organizaciones o where o.id = v_org;
      v_ini := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
      if exists (select 1 from piefirme.ventas v where v.organizacion_id = v_org and v.sede_id = c.sucursal_id and v.cobrada_en >= v_ini and v.cobrada_en <= now()) then
        select s.nombre into v_suc from piefirme.sedes s where s.id = c.sucursal_id;
        insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
        values (v_org, c.sucursal_id, 'apertura_tardia', 'alta', array['dueno', 'supervisor'],
                format('%s: la foto de apertura (%s) se tomó después de la primera venta del día.', v_suc, c.folio), 'cierre', c.id);
      end if;
    end if;
  end if;
  return v_res || jsonb_build_object('captura_id', v_cap);
end $$;

revoke all on function piefirme.ctl_cierre_foto(uuid, uuid, uuid, text, text, integer, integer, integer, uuid, timestamptz) from public, anon;
grant execute on function piefirme.ctl_cierre_foto(uuid, uuid, uuid, text, text, integer, integer, integer, uuid, timestamptz) to authenticated;
