-- 292 · Control y Auditoría · ETAPA 1 · (3/4) CANCELACIONES Y DEVOLUCIONES CON BLOQUEO (F1.3, criterio 3).
-- Flujo (cuando cancelacion_con_bloqueo = 1 en la sucursal; con 0 la Caja cancela como siempre):
--   1. Caja pide la cancelación (ctl_cancelacion_solicitar): queda PENDIENTE, el ticket sigue cobrado, la pieza NO vuelve al inventario y se emite el evento
--      cancelacion_solicitada (cola ctl_eventos_entrada). Espera: cancelacion_espera_seg (60 s).
--   2. El módulo exige, en un solo paso (ctl_cancelacion_resolver): escanear la pieza devuelta (si el código no es de una pieza del ticket se RECHAZA: sin pieza
--      presente no hay cancelación), foto EN VIVO de la pieza de regreso en el estante, clave de un supervisor o del dueño y motivo del catálogo cerrado.
--   3. Responde AUTORIZADA (se cancela el ticket por la ruta de siempre y la pieza vuelve al inventario; alerta inmediata al dueño) o RECHAZADA (la venta queda firme).
--   4. Si pasa la espera sin respuesta queda PENDIENTE_DE_VALIDACIÓN (la pieza sigue fuera del inventario) y se alerta. NUNCA se resuelve sola a favor de cancelar:
--      solo una persona con la pieza, la foto y la clave la puede autorizar después.
--   · Candado de servidor: con el parámetro encendido, cancelar_venta directo (o un UPDATE a «cancelada») de un ticket con piezas se rechaza si no viene de este flujo.
--   · Las devoluciones con reingreso de pieza siguen el mismo camino (ctl_devolucion_solicitar → ctl_cancelacion_resolver).
-- Depende de: 026, 131, 200–206, 245, 290, 291.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── piezas con inventario de un ticket (o de una línea) ─────────────────────────────
create or replace function piefirme_app.ctl_piezas_de_venta(p_venta uuid, p_linea uuid default null) returns jsonb
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', x.producto_id, 'nombre', x.nombre, 'cantidad', x.cantidad) order by x.nombre), '[]'::jsonb)
    from (select l.producto_id, p.nombre, sum(l.cantidad) as cantidad
            from piefirme.venta_lineas l join piefirme.productos p on p.id = l.producto_id
           where l.venta_id = p_venta and l.tipo = 'producto' and p.tipo = 'venta' and (p_linea is null or l.id = p_linea)   -- por encargo: sin inventario (P-087)
           group by l.producto_id, p.nombre) x
$$;

-- ¿Se puede cancelar este ticket? Se ensaya la cancelación de siempre dentro de un bloque que se deshace (CFDI vigente, gift cards usadas, turno cerrado…).
create or replace function piefirme_app.ctl_cancelacion_precheck(p_venta uuid) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_err text;
begin
  begin
    perform set_config('app.ctl_cancel_ok', 'on', true);
    perform piefirme.cancelar_venta(p_venta, 'verificación previa');
    raise exception 'ensayo terminado' using errcode = 'PFOK0';
  exception
    when sqlstate 'PFOK0' then v_err := null;
    when others then v_err := sqlerrm;
  end;
  perform set_config('app.ctl_cancel_ok', 'off', true);
  return v_err;
end $$;

-- bitácora de una solicitud (solo inserción)
create or replace function piefirme_app.ctl_canc_log(p_canc piefirme.ctl_cancelacion, p_tipo text, p_detalle jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  insert into piefirme.ctl_cancelacion_evento (organizacion_id, sucursal_id, cancelacion_id, tipo, detalle, usuario_id)
  values (p_canc.organizacion_id, p_canc.sucursal_id, p_canc.id, p_tipo, coalesce(p_detalle, '{}'::jsonb), auth.uid())
$$;

-- ───────────────────────────── vencimiento: pendiente → pendiente_de_validación (nunca a favor de cancelar) ─────────────────────────────
create or replace function piefirme_app.ctl_cancelacion_vencer(p_org uuid) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r piefirme.ctl_cancelacion; v_n integer := 0;
begin
  for r in select * from piefirme.ctl_cancelacion c where c.organizacion_id = p_org and c.estado = 'pendiente' and c.vence_en <= now() order by c.vence_en for update skip locked loop
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_cancelacion set estado = 'pendiente_de_validacion', vencida_en = now() where id = r.id;
    perform piefirme_app.ctl_canc_log(r, 'vencida', jsonb_build_object('espera_seg', r.espera_seg));
    perform piefirme_app.ctl_alerta_nueva(p_org, r.sucursal_id, 'cancelacion_pendiente_validacion',
      format('%s: la %s %s del ticket %s no se validó en %s s. La pieza NO volvió al inventario y la venta sigue firme hasta que se valide.',
             coalesce((select s.nombre from piefirme.sedes s where s.id = r.sucursal_id), 'Sucursal'), case r.tipo when 'devolucion' then 'devolución' else 'cancelación' end, r.folio, r.ticket, r.espera_seg),
      'cancelacion', r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ───────────────────────────── ¿este ticket exige el flujo con bloqueo? ─────────────────────────────
create or replace function piefirme.ctl_cancelacion_requiere(p_venta uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v piefirme.ventas%rowtype; v_piezas jsonb; v_activo boolean;
begin
  select * into v from piefirme.ventas where id = p_venta and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(v.sede_id) then raise exception 'ticket no encontrado' using errcode = 'PF404'; end if;
  v_activo := coalesce(piefirme_app.ctl_cfg_num(v_org, 'cancelacion_con_bloqueo', v.sede_id), 0) >= 1;
  v_piezas := piefirme_app.ctl_piezas_de_venta(p_venta);
  return jsonb_build_object('requiere', v_activo and v.estado in ('cobrada', 'por_facturar') and jsonb_array_length(v_piezas) > 0, 'activo', v_activo,
                            'piezas', jsonb_array_length(v_piezas),
                            'pendiente_id', (select c.id from piefirme.ctl_cancelacion c where c.organizacion_id = v_org and c.venta_id = p_venta and c.tipo = 'cancelacion' and c.estado in ('pendiente', 'pendiente_de_validacion') limit 1));
end $$;

-- ───────────────────────────── 1 · solicitar (la pieza NO vuelve) ─────────────────────────────
create or replace function piefirme.ctl_cancelacion_solicitar(p_venta uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v piefirme.ventas%rowtype; c piefirme.ctl_cancelacion; v_piezas jsonb; v_err text; v_espera integer;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso para cancelar' using errcode = 'PF403'; end if;
  select * into v from piefirme.ventas where id = p_venta and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(v.sede_id) then raise exception 'ticket no encontrado' using errcode = 'PF404'; end if;
  if v.estado not in ('cobrada', 'por_facturar') then
    return jsonb_build_object('ok', false, 'error', 'estado', 'mensaje', format('El ticket está %s: solo se valida la cancelación de tickets cobrados.', v.estado));
  end if;
  -- idempotente: una sola solicitud viva por ticket
  select * into c from piefirme.ctl_cancelacion x where x.organizacion_id = v_org and x.venta_id = p_venta and x.tipo = 'cancelacion' and x.estado in ('pendiente', 'pendiente_de_validacion');
  if found then
    return jsonb_build_object('ok', true, 'existente', true, 'id', c.id, 'folio', c.folio, 'estado', c.estado, 'vence_en', c.vence_en, 'espera_seg', c.espera_seg, 'productos', c.productos);
  end if;
  v_piezas := piefirme_app.ctl_piezas_de_venta(p_venta);
  if jsonb_array_length(v_piezas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'sin_piezas', 'mensaje', 'El ticket no tiene piezas de inventario: se cancela de forma directa.');
  end if;
  v_err := piefirme_app.ctl_cancelacion_precheck(p_venta);
  if v_err is not null then return jsonb_build_object('ok', false, 'error', 'no_cancelable', 'mensaje', v_err); end if;
  v_espera := piefirme_app.ctl_cfg_num(v_org, 'cancelacion_espera_seg', v.sede_id)::integer;
  insert into piefirme.ctl_cancelacion (organizacion_id, sucursal_id, tipo, venta_id, ticket, monto, productos, motivo_solicitud, solicitada_por, espera_seg, vence_en)
  values (v_org, v.sede_id, 'cancelacion', v.id, v.folio, v.total, v_piezas, nullif(btrim(p_motivo), ''), auth.uid(), v_espera, now() + make_interval(secs => v_espera))
  returning * into c;
  perform piefirme_app.ctl_canc_log(c, 'solicitada', jsonb_build_object('motivo', p_motivo, 'piezas', v_piezas));
  perform piefirme_app.ctl_emitir_evento(v_org, 'cancelacion_solicitada', c.id::text,
    jsonb_build_object('cancelacion_id', c.id, 'folio', c.folio, 'venta_id', v.id, 'ticket', v.folio, 'sucursal_id', v.sede_id, 'usuario_id', auth.uid(), 'monto', v.total,
                       'productos', v_piezas, 'vence_en', c.vence_en, 'espera_seg', v_espera));
  return jsonb_build_object('ok', true, 'id', c.id, 'folio', c.folio, 'estado', c.estado, 'vence_en', c.vence_en, 'espera_seg', v_espera, 'productos', v_piezas);
end $$;

-- Devolución parcial con reingreso de pieza: misma solicitud, misma validación.
create or replace function piefirme.ctl_devolucion_solicitar(p_linea uuid, p_cantidad numeric, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); l piefirme.venta_lineas%rowtype; v piefirme.ventas%rowtype; c piefirme.ctl_cancelacion; v_piezas jsonb; v_prev numeric; v_espera integer; v_monto numeric;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso para devolver' using errcode = 'PF403'; end if;
  select * into l from piefirme.venta_lineas where id = p_linea and organizacion_id = v_org;
  if not found then raise exception 'línea no encontrada' using errcode = 'PF404'; end if;
  select * into v from piefirme.ventas where id = l.venta_id for update;
  if not piefirme_app.puede_sede(v.sede_id) then raise exception 'ticket no encontrado' using errcode = 'PF404'; end if;
  if v.estado not in ('cobrada', 'por_facturar') then return jsonb_build_object('ok', false, 'error', 'estado', 'mensaje', 'Solo se devuelve sobre tickets cobrados sin factura vigente.'); end if;
  v_piezas := piefirme_app.ctl_piezas_de_venta(v.id, l.id);
  if jsonb_array_length(v_piezas) = 0 then return jsonb_build_object('ok', false, 'error', 'sin_piezas', 'mensaje', 'Esa línea no es una pieza de inventario.'); end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'indique cuántas piezas se devuelven' using errcode = 'PF400'; end if;
  select coalesce(sum(cantidad), 0) into v_prev from piefirme.devoluciones_venta where venta_linea_id = l.id;
  if v_prev + p_cantidad > l.cantidad then return jsonb_build_object('ok', false, 'error', 'excede', 'mensaje', 'Se devuelve más de lo vendido.'); end if;
  select * into c from piefirme.ctl_cancelacion x where x.organizacion_id = v_org and x.venta_linea_id = l.id and x.tipo = 'devolucion' and x.estado in ('pendiente', 'pendiente_de_validacion');
  if found then return jsonb_build_object('ok', true, 'existente', true, 'id', c.id, 'folio', c.folio, 'estado', c.estado, 'vence_en', c.vence_en, 'espera_seg', c.espera_seg, 'productos', c.productos); end if;
  v_piezas := jsonb_set(v_piezas, '{0,cantidad}', to_jsonb(p_cantidad));
  v_monto := round(l.importe * p_cantidad / l.cantidad, 2);
  v_espera := piefirme_app.ctl_cfg_num(v_org, 'cancelacion_espera_seg', v.sede_id)::integer;
  insert into piefirme.ctl_cancelacion (organizacion_id, sucursal_id, tipo, venta_id, ticket, venta_linea_id, cantidad, monto, productos, motivo_solicitud, solicitada_por, espera_seg, vence_en)
  values (v_org, v.sede_id, 'devolucion', v.id, v.folio, l.id, p_cantidad, v_monto, v_piezas, nullif(btrim(p_motivo), ''), auth.uid(), v_espera, now() + make_interval(secs => v_espera))
  returning * into c;
  perform piefirme_app.ctl_canc_log(c, 'solicitada', jsonb_build_object('motivo', p_motivo, 'piezas', v_piezas));
  perform piefirme_app.ctl_emitir_evento(v_org, 'devolucion_solicitada', c.id::text,
    jsonb_build_object('cancelacion_id', c.id, 'folio', c.folio, 'venta_id', v.id, 'ticket', v.folio, 'linea_id', l.id, 'sucursal_id', v.sede_id, 'usuario_id', auth.uid(), 'monto', v_monto,
                       'productos', v_piezas, 'vence_en', c.vence_en, 'espera_seg', v_espera));
  return jsonb_build_object('ok', true, 'id', c.id, 'folio', c.folio, 'estado', c.estado, 'vence_en', c.vence_en, 'espera_seg', v_espera, 'productos', v_piezas);
end $$;

-- ───────────────────────────── estado y pendientes (la Caja pregunta cada pocos segundos; esto también vence lo vencido) ─────────────────────────────
create or replace function piefirme.ctl_cancelacion_estado(p_id uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cancelacion;
begin
  perform piefirme_app.ctl_cancelacion_vencer(v_org);
  select * into c from piefirme.ctl_cancelacion where id = p_id and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'solicitud no encontrada' using errcode = 'PF404'; end if;
  return jsonb_build_object('id', c.id, 'folio', c.folio, 'tipo', c.tipo, 'estado', c.estado, 'ticket', c.ticket, 'vence_en', c.vence_en, 'espera_seg', c.espera_seg,
    'segundos_restantes', greatest(0, ceil(extract(epoch from (c.vence_en - now()))))::integer, 'productos', c.productos, 'intentos_rechazados', c.intentos_rechazados,
    'motivo_nombre', c.motivo_nombre, 'resuelta_en', c.resuelta_en, 'razon_rechazo', c.razon_rechazo);
end $$;

create or replace function piefirme.ctl_cancelaciones_pendientes(p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  perform piefirme_app.ctl_cancelacion_vencer(v_org);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'folio', c.folio, 'tipo', c.tipo, 'estado', c.estado, 'ticket', c.ticket, 'venta_id', c.venta_id, 'sucursal_id', c.sucursal_id,
                    'vence_en', c.vence_en, 'segundos_restantes', greatest(0, ceil(extract(epoch from (c.vence_en - now()))))::integer, 'productos', c.productos, 'solicitada_en', c.solicitada_en) order by c.solicitada_en)
                     from piefirme.ctl_cancelacion c
                    where c.organizacion_id = v_org and c.estado in ('pendiente', 'pendiente_de_validacion') and piefirme_app.puede_sede(c.sucursal_id)
                      and (p_sucursal is null or c.sucursal_id = p_sucursal)), '[]'::jsonb);
end $$;

-- ───────────────────────────── 2 · responder: pieza + foto + clave + motivo ─────────────────────────────
create or replace function piefirme.ctl_cancelacion_resolver(p_id uuid, p_codigos text[], p_motivo uuid, p_nota text, p_autorizador uuid, p_pin text,
                                                           p_evidencia_id uuid, p_ruta text, p_hash text, p_bytes integer default null, p_ancho integer default null,
                                                           p_alto integer default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cancelacion; m piefirme.ctl_motivo; k jsonb; r record;
        v_codigos text[]; v_sobran integer; v_faltan text[] := '{}'; v_n integer; v_tarde boolean; v_texto text; v_ev jsonb; v_dev uuid;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso para cancelar' using errcode = 'PF403'; end if;
  perform piefirme_app.ctl_cancelacion_vencer(v_org);
  select * into c from piefirme.ctl_cancelacion where id = p_id and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'solicitud no encontrada' using errcode = 'PF404'; end if;
  if c.estado = 'autorizada' then return jsonb_build_object('ok', true, 'idempotente', true, 'estado', c.estado, 'folio', c.folio); end if;
  if c.estado = 'rechazada' then return jsonb_build_object('ok', false, 'error', 'rechazada', 'mensaje', 'La solicitud ya fue rechazada: la venta quedó firme.'); end if;
  v_tarde := c.estado = 'pendiente_de_validacion';

  -- A · la pieza tiene que estar presente: cada código escaneado debe ser de una pieza del ticket y cada pieza debe escanearse (una vez por unidad)
  select coalesce(array_agg(lower(btrim(x))) filter (where btrim(coalesce(x, '')) <> ''), '{}') into v_codigos from unnest(coalesce(p_codigos, '{}')) x;
  if cardinality(v_codigos) = 0 then
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_cancelacion set intentos_rechazados = intentos_rechazados + 1 where id = c.id;
    perform piefirme_app.ctl_canc_log(c, 'pieza_no_escaneada', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'error', 'pieza_no_escaneada', 'mensaje', 'Sin la pieza presente no hay cancelación: escanee la pieza devuelta.');
  end if;
  select count(*) into v_sobran from unnest(v_codigos) kx
   where not exists (select 1 from jsonb_array_elements(c.productos) e join piefirme.productos p on p.id = (e ->> 'producto_id')::uuid
                      where kx in (lower(btrim(coalesce(p.codigo_barras, ''))), lower(btrim(coalesce(p.sku, ''))), lower(btrim(coalesce(p.clave_alterna, '')))) and kx <> '');
  for r in select (e ->> 'producto_id')::uuid as pid, e ->> 'nombre' as nombre, ceil((e ->> 'cantidad')::numeric)::integer as cant from jsonb_array_elements(c.productos) e loop
    select count(*) into v_n from unnest(v_codigos) kx
     where exists (select 1 from piefirme.productos p where p.id = r.pid and kx <> '' and kx in (lower(btrim(coalesce(p.codigo_barras, ''))), lower(btrim(coalesce(p.sku, ''))), lower(btrim(coalesce(p.clave_alterna, '')))));
    if v_n < r.cant then v_faltan := v_faltan || (r.nombre || case when r.cant > 1 then format(' (faltan %s de %s)', r.cant - v_n, r.cant) else '' end); end if;
  end loop;
  if v_sobran > 0 or cardinality(v_faltan) > 0 then
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_cancelacion set intentos_rechazados = intentos_rechazados + 1 where id = c.id;
    perform piefirme_app.ctl_canc_log(c, 'pieza_no_corresponde', jsonb_build_object('codigos', v_codigos, 'no_corresponden', v_sobran, 'faltan', v_faltan));
    if v_sobran > 0 then
      perform piefirme_app.ctl_alerta_nueva(v_org, c.sucursal_id, 'cancelacion_pieza_no_corresponde',
        format('%s: al validar la %s del ticket %s se escaneó un código que no corresponde a la pieza del ticket. La cancelación NO se autorizó y la pieza no volvió al inventario.',
               coalesce((select s.nombre from piefirme.sedes s where s.id = c.sucursal_id), 'Sucursal'), case c.tipo when 'devolucion' then 'devolución' else 'cancelación' end, c.ticket),
        'cancelacion', c.id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'pieza_no_corresponde',
      'mensaje', case when v_sobran > 0 then 'El código escaneado no corresponde a la pieza del ticket: sin la pieza presente no hay cancelación.'
                      else 'Falta escanear: ' || array_to_string(v_faltan, ', ') || '.' end);
  end if;

  -- B · motivo del catálogo cerrado
  select * into m from piefirme.ctl_motivo where id = p_motivo and organizacion_id = v_org and tipo = 'cancelacion' and activo;
  if not found then raise exception 'elija el motivo de la cancelación de la lista' using errcode = 'PF400'; end if;
  if m.requiere_nota and coalesce(btrim(p_nota), '') = '' then raise exception 'ese motivo exige una nota' using errcode = 'PF400'; end if;

  -- C · foto EN VIVO de la pieza de regreso en el estante (misma vía que los cierres: objeto reciente, hash, hora del servidor; no hay ruta de galería)
  if p_ruta is null or p_evidencia_id is null or p_hash is null then raise exception 'falta la foto en vivo de la pieza de regreso en el estante' using errcode = 'PF400'; end if;
  v_ev := piefirme.ctl_evidencia_registrar(p_evidencia_id, c.sucursal_id, 'cancelacion', c.id, p_ruta, p_hash, p_bytes, p_ancho, p_alto, p_hora_cliente, null);

  -- D · clave de supervisor (o del dueño). Un fallo NO lanza error: el intento y el bloqueo de 3 fallos deben quedar guardados.
  k := piefirme_app.ctl_verificar_clave(v_org, p_autorizador, p_pin);
  if not (k ->> 'ok')::boolean then
    perform piefirme_app.ctl_canc_log(c, 'clave_incorrecta', jsonb_build_object('error', k ->> 'error'));
    return k;
  end if;

  -- E · AUTORIZADA: el ticket se cancela por la ruta de siempre (el candado de servidor deja pasar solo esta) y la pieza vuelve al inventario
  perform set_config('app.ctl_cancel_ok', 'on', true);
  v_texto := m.nombre || coalesce(' · ' || nullif(btrim(p_nota), ''), '') || ' · ' || c.folio;
  if c.tipo = 'cancelacion' then
    perform piefirme.cancelar_venta(c.venta_id, v_texto);
    update piefirme.ventas set cancelacion_autorizada_por = p_autorizador, cancelacion_id = c.id where id = c.venta_id;
  else
    insert into piefirme.devoluciones_venta (organizacion_id, sede_id, venta_id, venta_linea_id, cantidad, monto, motivo, reingresa_inventario, autorizado_por, cancelacion_id)
    values (v_org, c.sucursal_id, c.venta_id, c.venta_linea_id, c.cantidad, c.monto, v_texto, true, p_autorizador, c.id) returning id into v_dev;
  end if;
  perform set_config('app.ctl_cancel_ok', 'off', true);
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_cancelacion set estado = 'autorizada', motivo_id = m.id, motivo_nombre = m.nombre, nota = nullif(btrim(p_nota), ''), autorizador_id = p_autorizador,
         resuelta_en = now(), resuelta_por = auth.uid(), resuelta_tarde = v_tarde, evidencia_id = p_evidencia_id, codigos_escaneados = v_codigos
   where id = c.id;
  perform piefirme_app.ctl_canc_log(c, case when v_tarde then 'autorizada_tarde' else 'autorizada' end,
                                    jsonb_build_object('autorizador', p_autorizador, 'motivo', m.nombre, 'evidencia_id', p_evidencia_id, 'codigos', v_codigos));
  -- alerta inmediata al dueño en CADA cancelación autorizada (F1.3); la devolución también es una pieza que vuelve
  perform piefirme_app.ctl_alerta_nueva(v_org, c.sucursal_id, 'cancelacion_autorizada',
    format('%s: se autorizó la %s del ticket %s por $%s · motivo: %s · cancela %s, autoriza %s%s.',
           coalesce((select s.nombre from piefirme.sedes s where s.id = c.sucursal_id), 'Sucursal'), case c.tipo when 'devolucion' then 'devolución' else 'cancelación' end, c.ticket,
           to_char(c.monto, 'FM999,999,990.00'), m.nombre, piefirme_app.ctl_nombre_usuario(auth.uid()), piefirme_app.ctl_nombre_usuario(p_autorizador),
           case when v_tarde then ' (autorizada después de vencer la espera)' else '' end),
    case c.tipo when 'devolucion' then 'devolucion' else 'venta' end, case c.tipo when 'devolucion' then v_dev else c.venta_id end);
  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', c.folio, 'tarde', v_tarde);
end $$;

-- ───────────────────────────── rechazar: la venta queda firme ─────────────────────────────
create or replace function piefirme.ctl_cancelacion_rechazar(p_id uuid, p_razon text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cancelacion;
begin
  select * into c from piefirme.ctl_cancelacion where id = p_id and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'solicitud no encontrada' using errcode = 'PF404'; end if;
  if c.estado = 'rechazada' then return jsonb_build_object('ok', true, 'idempotente', true, 'estado', c.estado); end if;
  if c.estado = 'autorizada' then return jsonb_build_object('ok', false, 'error', 'autorizada', 'mensaje', 'La cancelación ya se autorizó.'); end if;
  if not (c.solicitada_por = auth.uid() or piefirme_app.ctl_puede('ver_directo')) then raise exception 'solo quien la pidió o quien revisa la rechaza' using errcode = 'PF403'; end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_cancelacion set estado = 'rechazada', resuelta_en = now(), resuelta_por = auth.uid(), razon_rechazo = nullif(btrim(p_razon), '') where id = c.id;
  perform piefirme_app.ctl_canc_log(c, 'rechazada', jsonb_build_object('razon', p_razon));
  return jsonb_build_object('ok', true, 'estado', 'rechazada');
end $$;

-- ───────────────────────────── candado de servidor: sin el flujo, un ticket con piezas no se cancela ni se devuelve con reingreso ─────────────────────────────
create or replace function piefirme_app.ctl_trg_bloqueo_cancelacion() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.ctl_cancel_ok', true), '') <> 'on' and old.estado in ('cobrada', 'por_facturar')
     and coalesce(piefirme_app.ctl_cfg_num(new.organizacion_id, 'cancelacion_con_bloqueo', new.sede_id), 0) >= 1
     and jsonb_array_length(piefirme_app.ctl_piezas_de_venta(new.id)) > 0 then
    raise exception 'cancelacion_con_bloqueo: la cancelación de un ticket con piezas la valida el módulo (escanear la pieza, foto en vivo, clave de supervisor y motivo). Pídala desde «Tickets del día».' using errcode = 'PF409';
  end if;
  return new;
end $$;
drop trigger if exists t_ctl_bloqueo_cancelacion on piefirme.ventas;
create trigger t_ctl_bloqueo_cancelacion before update of estado on piefirme.ventas for each row
  when (new.estado = 'cancelada' and old.estado is distinct from 'cancelada') execute function piefirme_app.ctl_trg_bloqueo_cancelacion();

create or replace function piefirme_app.ctl_trg_bloqueo_devolucion() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if auth.uid() is not null and new.reingresa_inventario and coalesce(current_setting('app.ctl_cancel_ok', true), '') <> 'on'
     and coalesce(piefirme_app.ctl_cfg_num(new.organizacion_id, 'cancelacion_con_bloqueo', new.sede_id), 0) >= 1 then
    raise exception 'cancelacion_con_bloqueo: una devolución que regresa la pieza al inventario la valida el módulo (escanear la pieza, foto en vivo, clave de supervisor y motivo).' using errcode = 'PF409';
  end if;
  return new;
end $$;
drop trigger if exists t_ctl_bloqueo_devolucion on piefirme.devoluciones_venta;
create trigger t_ctl_bloqueo_devolucion before insert on piefirme.devoluciones_venta for each row execute function piefirme_app.ctl_trg_bloqueo_devolucion();

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_piezas_de_venta', 'ctl_cancelacion_precheck', 'ctl_canc_log', 'ctl_cancelacion_vencer', 'ctl_trg_bloqueo_cancelacion', 'ctl_trg_bloqueo_devolucion',
                  'ctl_cancelacion_requiere', 'ctl_cancelacion_solicitar', 'ctl_devolucion_solicitar', 'ctl_cancelacion_estado', 'ctl_cancelaciones_pendientes', 'ctl_cancelacion_resolver', 'ctl_cancelacion_rechazar') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
