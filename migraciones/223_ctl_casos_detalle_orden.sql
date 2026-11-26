-- 223 · Control y Auditoría · ETAPA 3 · ajuste tras las pruebas: orden de la bitácora en el detalle del caso.
-- Las entradas que escribe una misma RPC comparten la hora del servidor (now() de la transacción); para que la línea de tiempo se lea en el orden natural
-- (asignación, comentario, evidencia y luego el cambio de estado) se desempata por tipo y no por el uuid. Solo reemplaza ctl_caso_detalle (misma firma y privilegios).
-- Depende de: 222.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_caso_detalle(p_caso uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_dir boolean := piefirme_app.ctl_puede('ver_directo');
        v_sesion uuid; v_corte timestamptz; v_prev_p timestamptz; v_prev_m timestamptz; v_prev timestamptz; v_desde timestamptz; v_omision boolean := false;
        v_ids uuid[]; v_folios text[]; v_caso jsonb; v_bit jsonb; v_evid jsonb := '[]'::jsonb; v_llam jsonb; v_movs jsonb := '[]'::jsonb; v_ventas jsonb := '[]'::jsonb;
        v_canc jsonb := '[]'::jsonb; v_turnos jsonb := '[]'::jsonb; v_pers jsonb := '[]'::jsonb; v_hist jsonb; v_par jsonb := null; v_saldo numeric; v_yo_cap boolean; v_yo_inv boolean;
        v_canc_lig jsonb;
begin
  select * into k from piefirme.ctl_caso where id = p_caso and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(k.sucursal_id) then raise exception 'caso no encontrado' using errcode = 'PF404'; end if;
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros) values (v_org, auth.uid(), piefirme_app.ctl_rol(), 'caso_detalle', jsonb_build_object('caso_id', p_caso, 'folio', k.folio));

  -- par de sustitución de código
  if k.contexto #>> '{sustitucion,rol}' = 'faltante_caro' then
    select * into s from piefirme.ctl_caso where id = nullif(k.contexto #>> '{sustitucion,sobrante,caso_id}', '')::uuid and organizacion_id = v_org;
  elsif k.contexto #>> '{sustitucion,rol}' = 'sobrante_barato' then
    select * into s from piefirme.ctl_caso where id = nullif(k.contexto #>> '{sustitucion,caso_principal_id}', '')::uuid and organizacion_id = v_org;
  end if;
  if s.id is not null then
    v_par := jsonb_build_object('id', s.id, 'folio', s.folio, 'estado', s.estado, 'rol', case when k.contexto #>> '{sustitucion,rol}' = 'faltante_caro' then 'sobrante_barato' else 'faltante_caro' end,
                                'producto_id', s.producto_id, 'producto', (select p.nombre from piefirme.productos p where p.id = s.producto_id), 'cantidad', s.cantidad, 'valor', s.valor,
                                'movimiento_origen_id', s.movimiento_origen_id, 'relacion_costo', k.contexto #> '{sustitucion,relacion_costo}');
  end if;
  v_ids := array[k.id] || case when s.id is not null then array[s.id] else '{}'::uuid[] end;
  v_folios := array[k.folio] || case when s.id is not null then array[s.folio] else '{}'::text[] end;

  -- momento del conteo que originó el caso y conteo anterior del producto en la sucursal
  if k.origen_tipo = 'partida_conteo' then
    select p.sesion_id, p.escaneado_en into v_sesion, v_corte from piefirme.ctl_partida_conteo p where p.id = k.origen_id;
  elsif k.origen_tipo = 'lista_solicitada' then
    select l.sesion_id, coalesce(se.cerrada_en, se.abierta_en) into v_sesion, v_corte from piefirme.ctl_lista_solicitada l join piefirme.ctl_sesion_conteo se on se.id = l.sesion_id where l.id = k.origen_id;
  end if;
  v_corte := coalesce(v_corte, k.abierto_en);
  if k.producto_id is not null then
    select max(p.escaneado_en) into v_prev_p from piefirme.ctl_partida_conteo p
     where p.organizacion_id = v_org and p.sucursal_id = k.sucursal_id and p.producto_id = k.producto_id and p.escaneado_en < v_corte and p.sesion_id is distinct from v_sesion;
    select max(m.fecha) into v_prev_m from piefirme.v_ctl_movimientos m where m.sucursal_id = k.sucursal_id and m.producto_id = k.producto_id and m.tipo = 'conteo' and m.fecha < v_corte;
    v_prev := greatest(v_prev_p, v_prev_m);
    if v_prev is null then v_desde := v_corte - interval '30 days'; v_omision := true; else v_desde := v_prev; end if;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha desc), '[]'::jsonb) into v_movs from (
      select m.id, m.tipo, m.cantidad, m.costo_unitario, m.fecha, m.documento, m.referencia_tipo, m.usuario_id, piefirme_app.ctl_nombre_usuario(m.usuario_id) as usuario, (m.fecha > v_corte) as posterior_al_conteo
        from piefirme.v_ctl_movimientos m
       where m.sucursal_id = k.sucursal_id and m.producto_id = k.producto_id and m.fecha >= v_desde and m.tipo <> 'venta' order by m.fecha desc limit 300) t;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha_hora desc), '[]'::jsonb) into v_ventas from (
      select v.linea_id, v.venta_id, v.ticket, v.fecha_hora, v.estado, v.cantidad, v.precio_cobrado, v.descuento_monto, v.precio_catalogo_al_momento, v.usuario_id,
             piefirme_app.ctl_nombre_usuario(v.usuario_id) as usuario, v.turno_id, (v.fecha_hora > v_corte) as posterior_al_conteo
        from piefirme.v_ctl_ventas v
       where v.sucursal_id = k.sucursal_id and v.producto_id = k.producto_id and v.fecha_hora >= v_desde order by v.fecha_hora desc limit 300) t;
    v_canc_lig := coalesce(k.contexto -> 'cancelaciones', '[]'::jsonb);
    select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha desc), '[]'::jsonb) into v_canc from (
      select c.tipo, c.venta_id, c.ticket_original as ticket, c.fecha, c.usuario_id, piefirme_app.ctl_nombre_usuario(c.usuario_id) as usuario, c.autorizador,
             piefirme_app.ctl_nombre_usuario(c.autorizador) as autorizador_nombre, c.motivo, c.monto, c.reingresa_inventario,
             exists (select 1 from jsonb_array_elements(v_canc_lig) z where z ->> 'folio' = c.ticket_original) as ligada_al_caso, (c.fecha > v_corte) as posterior_al_conteo
        from piefirme.v_ctl_cancelaciones c
       where c.sucursal_id = k.sucursal_id and c.fecha >= v_desde
         and exists (select 1 from piefirme.venta_lineas l where l.venta_id = c.venta_id and l.producto_id = k.producto_id) order by c.fecha desc limit 100) t;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.apertura_en desc), '[]'::jsonb) into v_turnos from (
      select tu.id, tu.caja, tu.nombre_turno, tu.usuario_id, piefirme_app.ctl_nombre_usuario(tu.usuario_id) as usuario, tu.apertura_en, tu.cierre_en, tu.estado
        from piefirme.v_ctl_turnos tu where tu.sucursal_id = k.sucursal_id and coalesce(tu.cierre_en, now()) >= v_desde order by tu.apertura_en desc limit 40) t;
    select coalesce(jsonb_agg(jsonb_build_object('usuario_id', x.u, 'nombre', piefirme_app.ctl_nombre_usuario(x.u)) order by piefirme_app.ctl_nombre_usuario(x.u)), '[]'::jsonb) into v_pers from (
      select distinct (e ->> 'usuario_id')::uuid as u
        from (select * from jsonb_array_elements(v_movs) union all select * from jsonb_array_elements(v_ventas) union all select * from jsonb_array_elements(v_turnos)) q(e)
       where e ->> 'usuario_id' is not null) x;
    if v_dir then select coalesce(sum(i.existencia), 0) into v_saldo from piefirme.inventario_sede i where i.organizacion_id = v_org and i.sede_id = k.sucursal_id and i.producto_id = k.producto_id; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'tipo', b.tipo, 'texto', b.texto, 'estado_anterior', b.estado_anterior, 'estado_nuevo', b.estado_nuevo, 'creado_en', b.creado_en,
                                               'usuario_id', b.usuario_id, 'usuario', coalesce(piefirme_app.ctl_nombre_usuario(b.usuario_id), 'Sistema'), 'datos', b.datos, 'evidencia_id', b.evidencia_id,
                                               'caso_id', b.caso_id, 'folio', case when b.caso_id = k.id then k.folio else s.folio end)
                                   order by b.creado_en, case b.tipo when 'asignacion' then 0 when 'comentario' then 1 when 'evidencia' then 2 else 3 end, b.id), '[]'::jsonb)
    into v_bit from piefirme.ctl_caso_bitacora b where b.organizacion_id = v_org and b.caso_id = any (v_ids);
  select exists (select 1 from piefirme.ctl_caso_bitacora b where b.caso_id = any (v_ids) and b.usuario_id = auth.uid() and (b.tipo in ('comentario', 'evidencia', 'asignacion') or b.estado_nuevo = 'en_investigacion')) or k.asignado_a = auth.uid() into v_yo_inv;
  v_yo_cap := piefirme_app.ctl_caso_capturista(k) = auth.uid() or (s.id is not null and piefirme_app.ctl_caso_capturista(s) = auth.uid());
  if v_dir then
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'caso_id', e.origen_id, 'ruta', e.url_almacenamiento, 'hash_sha256', e.hash_sha256, 'bytes', e.bytes, 'ancho', e.ancho, 'alto', e.alto,
                                                 'capturado_en', e.capturado_en, 'usuario_id', e.usuario_id, 'usuario', piefirme_app.ctl_nombre_usuario(e.usuario_id)) order by e.capturado_en), '[]'::jsonb)
      into v_evid from piefirme.ctl_evidencia e where e.organizacion_id = v_org and e.tipo_origen = 'caso' and e.origen_id = any (v_ids);
  end if;
  select coalesce(jsonb_agg(to_jsonb(l) - 'organizacion_id' order by l.creado_en), '[]'::jsonb) into v_llam from piefirme.ctl_llamada_origen l where l.organizacion_id = v_org and l.folio_caso = any (v_folios);
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'folio', h.folio, 'estado', h.estado, 'abierto_en', h.abierto_en, 'cantidad', h.cantidad,
                                               'causa', (select c.nombre from piefirme.ctl_causa c where c.id = h.causa_id)) order by h.abierto_en desc), '[]'::jsonb)
    into v_hist from (select * from piefirme.ctl_caso h2 where h2.organizacion_id = v_org and h2.sucursal_id = k.sucursal_id and h2.producto_id = k.producto_id and k.producto_id is not null and h2.id <> k.id
                       order by h2.abierto_en desc limit 10) h;

  v_caso := to_jsonb(k) || jsonb_build_object(
      'sucursal', (select sd.nombre from piefirme.sedes sd where sd.id = k.sucursal_id),
      'producto', (select jsonb_build_object('id', p.id, 'descripcion', p.nombre, 'codigo_barras', p.codigo_barras, 'sku', p.sku, 'costo', p.costo_promedio) from piefirme.productos p where p.id = k.producto_id),
      'asignado', piefirme_app.ctl_nombre_usuario(k.asignado_a), 'capturista', piefirme_app.ctl_nombre_usuario(k.usuario_captura),
      'autorizador', piefirme_app.ctl_nombre_usuario(k.autorizado_por),
      'causa', (select c.nombre from piefirme.ctl_causa c where c.id = k.causa_id), 'causa_requiere_nota', (select c.requiere_nota from piefirme.ctl_causa c where c.id = k.causa_id),
      'antiguedad_dias', floor(extract(epoch from (coalesce(k.cerrado_en, now()) - k.abierto_en)) / 86400)::integer,
      'vencido', piefirme_app.ctl_caso_es_abierto(k.estado) and k.fecha_compromiso is not null and k.fecha_compromiso < piefirme_app.ctl_hoy(v_org));
  return jsonb_build_object(
    'caso', v_caso, 'par', v_par, 'bitacora', v_bit, 'evidencias', v_evid, 'llamadas_origen', v_llam, 'historial_producto', v_hist,
    'yo', jsonb_build_object('capture', coalesce(v_yo_cap, false), 'investigue', coalesce(v_yo_inv, false)),
    'contexto', jsonb_build_object(
      'corte', v_corte, 'conteo_anterior', v_prev, 'desde', v_desde, 'hasta', now(), 'ventana_por_omision', v_omision,
      'saldo_actual', v_saldo, 'movimientos', v_movs, 'ventas', v_ventas, 'cancelaciones', v_canc, 'turnos', v_turnos, 'personas', v_pers,
      'nota', 'Este contexto informa: acota ventana de tiempo y personas con acceso. No es una conclusión ni señala culpables; una entrada de mercancía, un traspaso o una cancelación sin registrar explican la mayoría de las diferencias.'));
end $$;
