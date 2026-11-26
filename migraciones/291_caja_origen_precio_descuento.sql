-- 291 · Control y Auditoría · ETAPA 1 · (2/4) PRECIO NO EDITABLE Y DESCUENTOS CON CATÁLOGO CERRADO (F1.1 y F1.2).
--   · venta_linea_bi (026) se reemplaza completa, conservando TODA su lógica y añadiendo:
--       1. el precio de catálogo vigente al momento de la venta se CONGELA en la línea (precio_catalogo) para el reporte «ventas por debajo de catálogo»;
--       2. el precio de una línea de precio fijo YA NO se puede editar: debe ser el del catálogo (o el pactado en la cita). Siempre activo para sesiones de usuario
--          en línea; no aplica a la sincronización offline (el equipo pudo cobrar con la copia del catálogo) ni a scripts/semillas (sin sesión);
--       3. el precio ABIERTO (servicio «a valorar», «desde», por unidad, producto especial con características) sigue siendo cotizado por el cajero MIENTRAS el
--          parámetro precio_abierto_con_clave esté en 0 (por omisión). En 1 exige la autorización de un supervisor o del dueño (autorizacion_precio_id);
--       4. descuentos: si descuento_motivo_cerrado = 1, motivo del catálogo cerrado + tope sin clave de ctl_config (descuento_sin_clave_pct, 0 % por omisión,
--          máx. 15 %) en lugar del 10 % libre; sobre el tope, clave de supervisor. En todos los casos la línea guarda usuario, motivo, autorizador y monto.
--   · aplicar_descuento_global gana p_motivo_id (catálogo cerrado).
--   · v_ctl_ventas expone precio de catálogo al momento (servicios incluidos), autorizador del descuento y banderas; v_ctl_cancelaciones y ctl_o_cancelaciones
--     devuelven por fin el autorizador de la cancelación (antes null).
--   · RPC para la Caja: ctl_caja_parametros (lo que el cajero necesita saber, sin saldos) y ctl_autorizar_caja (clave de supervisor para descuento o precio).
-- Depende de: 026, 073, 202, 211, 290.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.devoluciones_venta add column if not exists autorizado_por uuid;       -- quien autorizó la devolución con su clave (módulo de control)
alter table piefirme.devoluciones_venta add column if not exists cancelacion_id uuid;       -- ctl_cancelacion que la autorizó

-- ───────────────────────────── venta_linea_bi (026 + F1.1/F1.2) ─────────────────────────────
create or replace function piefirme_app.venta_linea_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v piefirme.ventas%rowtype; sv piefirme.servicios%rowtype; pd piefirme.productos%rowtype;
  v_pct_ef numeric; v_max numeric; a piefirme.autorizaciones_admin%rowtype;
  v_cat numeric; v_item uuid; v_tipo_cat text; v_sesion boolean := auth.uid() is not null; v_off boolean; v_abierto boolean := false; v_cita numeric;
  v_cerrado boolean := false; m piefirme.ctl_motivo%rowtype; a_pre piefirme.autorizaciones_admin%rowtype; v_a_ok boolean := false;
begin
  select * into v from piefirme.ventas where id = new.venta_id;
  if not found or v.organizacion_id <> new.organizacion_id then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado not in ('por_cobrar', 'cuenta_abierta') then
    raise exception 'el ticket % ya no admite cambios', v.estado using errcode = 'PF409';
  end if;
  v_off := v.folio_offline is not null;
  new.sede_id := v.sede_id;
  -- ítem, precio congelado e IVA por concepto (P-056)
  if new.tipo = 'servicio' then
    select * into sv from piefirme.servicios where id = new.servicio_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'servicio inexistente' using errcode = 'PF404'; end if;
    new.descripcion := coalesce(new.descripcion, sv.nombre);
    new.iva_tipo := coalesce(new.iva_tipo, sv.iva_tipo);
    new.clave_sat := coalesce(new.clave_sat, sv.clave_sat); new.unidad_sat := coalesce(new.unidad_sat, sv.unidad_sat); new.renglon_edr := coalesce(new.renglon_edr, sv.renglon_edr);
    if tg_op = 'INSERT' and new.precio_unitario = 0 and new.tipo_precio = 'fijo' then
      if v.cita_id is not null then select precio_servicio into new.precio_unitario from piefirme.citas where id = v.cita_id and servicio_id = new.servicio_id;
      end if;
      if coalesce(new.precio_unitario, 0) = 0 and new.plan_adquirido_id is null then new.precio_unitario := coalesce(piefirme_app.precio_item(new.organizacion_id, 'servicio', sv.id, v.sede_id), 0); end if;
    end if;
    v_abierto := sv.tipo_precio <> 'fijo' or coalesce(sv.admite_caracteristicas, false);
  elsif new.tipo = 'producto' then
    select * into pd from piefirme.productos where id = new.producto_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'producto inexistente' using errcode = 'PF404'; end if;
    new.descripcion := coalesce(new.descripcion, pd.nombre);
    new.iva_tipo := coalesce(new.iva_tipo, pd.iva_tipo);
    new.clave_sat := coalesce(new.clave_sat, pd.clave_sat); new.unidad_sat := coalesce(new.unidad_sat, pd.unidad_sat); new.renglon_edr := coalesce(new.renglon_edr, pd.renglon_edr);
    if tg_op = 'INSERT' and new.precio_unitario = 0 and new.tipo_precio = 'fijo' then
      new.precio_unitario := coalesce(piefirme_app.precio_item(new.organizacion_id, 'producto', pd.id, v.sede_id), 0);
    end if;
  else
    new.descripcion := coalesce(new.descripcion, (select nombre from piefirme.ofertas where id = new.oferta_id));
    new.iva_tipo := coalesce(new.iva_tipo, 'exento');
    if tg_op = 'INSERT' and new.precio_unitario = 0 and new.tipo_precio = 'fijo' then
      new.precio_unitario := coalesce(piefirme_app.precio_item(new.organizacion_id, 'oferta', new.oferta_id, v.sede_id), 0);
    end if;
  end if;
  if new.plan_adquirido_id is not null then new.tipo_precio := 'saldo_plan'; new.precio_unitario := 0; end if;   -- las curaciones/sesiones de plan van a $0 (P-027)
  new.atendio_id := coalesce(new.atendio_id, v.podologo_id);

  -- ── F1.1 / F1.2 · precio de catálogo congelado y precio no editable ──
  if tg_op = 'INSERT' then
    v_item := coalesce(new.servicio_id, new.producto_id, new.oferta_id);
    v_tipo_cat := case new.tipo when 'servicio' then 'servicio' when 'producto' then 'producto' else 'oferta' end;
    v_cat := piefirme_app.ctl_precio_catalogo(new.organizacion_id, v_tipo_cat, v_item, v.sede_id, piefirme_app.ctl_fecha_venta(v.organizacion_id, v.offline_creada_en));
    new.precio_abierto := v_abierto;
    -- solo hay referencia de catálogo cuando el precio ES de catálogo (no saldo de plan, cortesía ni precio cotizado)
    new.precio_catalogo := case when new.tipo_precio = 'fijo' and new.plan_adquirido_id is null and not v_abierto then v_cat end;
    if v_sesion and not v_off and new.tipo_precio = 'fijo' and new.plan_adquirido_id is null then
      if v_abierto then
        if new.precio_unitario > 0 and not piefirme_app.es_admin() and coalesce(piefirme_app.ctl_cfg_num(new.organizacion_id, 'precio_abierto_con_clave', v.sede_id), 0) >= 1 then
          select * into a_pre from piefirme.autorizaciones_admin where id = new.autorizacion_precio_id;
          if not found or a_pre.organizacion_id <> new.organizacion_id or coalesce(a_pre.detalle ->> 'tipo_real', '') <> 'precio'
             or a_pre.vigente_hasta < now() or a_pre.solicitante_id <> auth.uid() then
            raise exception 'precio_abierto_requiere_clave: el precio cotizado de «%» necesita la clave de un supervisor o del dueño', coalesce(new.descripcion, 'este concepto') using errcode = 'PF403';
          end if;
        end if;
      elsif new.precio_unitario is distinct from coalesce(v_cat, 0) then
        select c.precio_servicio into v_cita from piefirme.citas c where c.id = v.cita_id and c.servicio_id = new.servicio_id;   -- el precio pactado al agendar vale como catálogo
        if v_cita is null or new.precio_unitario <> v_cita then
          raise exception 'precio_no_editable: el precio de «%» es el del catálogo vigente (%); el cajero no lo cambia', coalesce(new.descripcion, 'este concepto'), coalesce(v_cat, 0) using errcode = 'PF403';
        end if;
      end if;
    end if;
  end if;

  -- importes a 2 decimales, redondeo comercial (round de numeric); IVA sobre la base neta de la línea (P-057)
  new.importe_bruto := round(new.cantidad * new.precio_unitario, 2);
  new.descuento := least(new.importe_bruto, round(new.importe_bruto * new.descuento_pct / 100, 2) + new.descuento_monto);
  new.importe := new.importe_bruto - new.descuento;
  if new.iva_tipo = '16' then new.base_neta := round(new.importe / 1.16, 2); new.iva_monto := new.importe - new.base_neta;
  else new.base_neta := new.importe; new.iva_monto := 0; end if;

  -- descuentos (P-055 + F1.1): motivo obligatorio; sin clave hasta el tope (10 % libre, o el de ctl_config si el catálogo cerrado está activo); arriba, clave
  if new.descuento > 0 then
    if coalesce(btrim(new.descuento_motivo), '') = '' and new.descuento_motivo_id is null then raise exception 'todo descuento exige motivo' using errcode = 'PF400'; end if;
    if piefirme_app.rol() = 'podologo' then raise exception 'el podólogo no aplica descuentos' using errcode = 'PF403'; end if;
    v_pct_ef := case when new.importe_bruto > 0 then new.descuento / new.importe_bruto * 100 else 0 end;
    v_cerrado := v_sesion and not v_off and coalesce(piefirme_app.ctl_cfg_num(new.organizacion_id, 'descuento_motivo_cerrado', v.sede_id), 0) >= 1;
    if new.descuento_motivo_id is not null then
      select * into m from piefirme.ctl_motivo where id = new.descuento_motivo_id and organizacion_id = new.organizacion_id and tipo = 'descuento' and activo;
      if not found then raise exception 'el motivo de descuento no está en el catálogo vigente' using errcode = 'PF400'; end if;
      new.descuento_motivo := m.nombre;
    elsif v_cerrado then
      raise exception 'descuento_motivo_cerrado: elija el motivo del descuento de la lista (el texto libre ya no se acepta)' using errcode = 'PF400';
    end if;
    v_max := case when v_cerrado then piefirme_app.ctl_cfg_num(new.organizacion_id, 'descuento_sin_clave_pct', v.sede_id)
                  else piefirme_app.param_num(new.organizacion_id, 'descuento_recepcion_max_pct', 10) end;
    if new.autorizacion_descuento_id is not null then select * into a from piefirme.autorizaciones_admin where id = new.autorizacion_descuento_id; v_a_ok := found; end if;
    if v_sesion and not piefirme_app.es_admin() and v_pct_ef > v_max + 0.005 then
      if not v_a_ok or a.organizacion_id <> new.organizacion_id or a.tipo <> 'descuento' or a.vigente_hasta < now()
         or a.solicitante_id <> auth.uid() or coalesce(a.pct_max, 0) + 0.005 < v_pct_ef then
        raise exception 'descuento_requiere_pin: más de % %% exige autorización del administrador', v_max using errcode = 'PF403';
      end if;
    end if;
    -- quién aplicó el descuento y quién lo autorizó (null = quedó dentro del tope sin clave)
    new.descuento_usuario_id := coalesce(new.descuento_usuario_id, auth.uid(), v.cajero_id, v.created_by);
    new.descuento_autorizado_por := coalesce(new.descuento_autorizado_por, case when v_a_ok then a.autorizador_id end,
                                             case when v_sesion and piefirme_app.es_admin() then auth.uid() end);
  end if;
  -- P-073: la gift card no se combina con promociones
  if new.promocion_id is not null and exists (select 1 from piefirme.pagos p where p.venta_id = new.venta_id and p.metodo = 'gift_card') then
    raise exception 'las gift cards no se combinan con promociones' using errcode = 'PF409';
  end if;
  return new;
end $$;

-- ───────────────────────────── descuento global con motivo del catálogo ─────────────────────────────
drop function if exists piefirme.aplicar_descuento_global(uuid, text, numeric, text, uuid);
create or replace function piefirme.aplicar_descuento_global(p_venta uuid, p_tipo text, p_valor numeric, p_motivo text, p_autorizacion uuid default null, p_motivo_id uuid default null)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; l record; v_resto numeric; v_asig numeric; v_bruto numeric; v_n integer; v_i integer := 0; v_motivo text := p_motivo;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  if p_tipo not in ('pct', 'monto') or p_valor is null or p_valor < 0 then raise exception 'descuento inválido' using errcode = 'PF400'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found or v.estado not in ('por_cobrar', 'cuenta_abierta') then raise exception 'el ticket no admite descuentos' using errcode = 'PF409'; end if;
  if p_motivo_id is not null then
    select nombre into v_motivo from piefirme.ctl_motivo where id = p_motivo_id and organizacion_id = v.organizacion_id and tipo = 'descuento' and activo;
    if not found then raise exception 'el motivo de descuento no está en el catálogo vigente' using errcode = 'PF400'; end if;
  end if;
  select coalesce(sum(importe_bruto), 0), count(*) into v_bruto, v_n from piefirme.venta_lineas where venta_id = p_venta;
  if v_n = 0 or v_bruto = 0 then raise exception 'no hay importe sobre el cual descontar' using errcode = 'PF409'; end if;
  v_resto := case when p_tipo = 'monto' then least(p_valor, v_bruto) else 0 end;
  for l in select * from piefirme.venta_lineas where venta_id = p_venta order by orden, created_at loop
    v_i := v_i + 1;
    if p_tipo = 'pct' then
      update piefirme.venta_lineas set descuento_pct = p_valor, descuento_monto = 0, descuento_motivo = v_motivo, descuento_motivo_id = p_motivo_id, autorizacion_descuento_id = p_autorizacion where id = l.id;
    else
      v_asig := case when v_i = v_n then v_resto else least(v_resto, round(p_valor * l.importe_bruto / v_bruto, 2)) end;
      v_resto := v_resto - v_asig;
      update piefirme.venta_lineas set descuento_pct = 0, descuento_monto = v_asig, descuento_motivo = v_motivo, descuento_motivo_id = p_motivo_id, autorizacion_descuento_id = p_autorizacion where id = l.id;
    end if;
  end loop;
  update piefirme.ventas set descuento_global_tipo = p_tipo, descuento_global_valor = p_valor, descuento_motivo = v_motivo, autorizacion_descuento_id = p_autorizacion where id = p_venta;
end $$;
revoke all on function piefirme.aplicar_descuento_global(uuid, text, numeric, text, uuid, uuid) from public, anon;
grant execute on function piefirme.aplicar_descuento_global(uuid, text, numeric, text, uuid, uuid) to authenticated, service_role;

-- ───────────────────────────── vistas de lectura del origen (mismas columnas + las nuevas AL FINAL) ─────────────────────────────
create or replace view piefirme.v_ctl_ventas with (security_invoker = true) as
  select l.id as linea_id, v.id as venta_id, v.organizacion_id, v.folio as ticket, v.sede_id as sucursal_id, t.caja,
         coalesce(v.cajero_id, v.created_by) as usuario_id, coalesce(v.cobrada_en, v.created_at) as fecha_hora, v.estado, v.turno_id,
         (select string_agg(distinct pg.metodo, ',' order by pg.metodo) from piefirme.pagos pg where pg.venta_id = v.id) as forma_pago,
         l.tipo as tipo_linea, l.producto_id, l.servicio_id, l.descripcion, l.cantidad,
         l.precio_unitario as precio_cobrado, l.descuento as descuento_monto, l.descuento_pct,
         coalesce(l.descuento_motivo, v.descuento_motivo) as motivo_descuento,
         coalesce(l.descuento_autorizado_por, aa.autorizador_id) as autorizador, l.importe,
         coalesce(l.precio_catalogo, cat.precio) as precio_catalogo_al_momento,
         l.precio_abierto, l.descuento_motivo_id, l.descuento_usuario_id
    from piefirme.ventas v
    join piefirme.venta_lineas l on l.venta_id = v.id
    left join piefirme.turnos_caja t on t.id = v.turno_id
    left join piefirme.autorizaciones_admin aa on aa.id = coalesce(l.autorizacion_descuento_id, v.autorizacion_descuento_id)
    left join lateral (
      select x.precio from piefirme.precios x
       where l.precio_catalogo is null and l.producto_id is not null and x.producto_id = l.producto_id and x.organizacion_id = v.organizacion_id and x.item_tipo = 'producto'
         and x.vigente_desde <= coalesce(v.cobrada_en, v.created_at)::date and (x.vigente_hasta is null or x.vigente_hasta >= coalesce(v.cobrada_en, v.created_at)::date)
       order by (x.sede_id is null) desc, x.vigente_desde desc limit 1) cat on true
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(v.sede_id);

create or replace view piefirme.v_ctl_cancelaciones with (security_invoker = true) as
  select v.id as id, v.organizacion_id, 'cancelacion'::text as tipo, v.id as venta_id, v.folio as ticket_original, v.sede_id as sucursal_id,
         v.cancelada_en as fecha, v.cancelada_por as usuario_id, v.cancelacion_autorizada_por as autorizador, v.motivo_cancelacion as motivo,
         v.total as monto, null::boolean as reingresa_inventario
    from piefirme.ventas v
   where v.estado = 'cancelada' and piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(v.sede_id)
  union all
  select d.id, d.organizacion_id, 'devolucion', d.venta_id, v.folio, d.sede_id, d.created_at, d.created_by, coalesce(d.autorizado_por, aa.autorizador_id), d.motivo, d.monto, d.reingresa_inventario
    from piefirme.devoluciones_venta d
    join piefirme.ventas v on v.id = d.venta_id
    left join piefirme.movimientos_caja mc on mc.id = d.movimiento_caja_id
    left join piefirme.autorizaciones_admin aa on aa.id = mc.autorizacion_id
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(d.sede_id);

-- el motor de conteo lee las cancelaciones por esta función: ahora con autorizador
create or replace function piefirme_app.ctl_o_cancelaciones(p_org uuid, p_sede uuid, p_producto uuid, p_desde timestamptz)
returns table (tipo text, venta_id uuid, ticket text, usuario_id uuid, autorizador uuid, fecha timestamptz, motivo text, cantidad numeric)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select 'cancelacion'::text, v.id, v.folio, v.cancelada_por, v.cancelacion_autorizada_por, v.cancelada_en, v.motivo_cancelacion, sum(l.cantidad)
    from piefirme.ventas v join piefirme.venta_lineas l on l.venta_id = v.id
   where v.organizacion_id = p_org and v.sede_id = p_sede and v.estado = 'cancelada' and v.cancelada_en >= p_desde and l.producto_id = p_producto
   group by v.id, v.folio, v.cancelada_por, v.cancelacion_autorizada_por, v.cancelada_en, v.motivo_cancelacion
  union all
  select 'devolucion'::text, d.venta_id, v.folio, d.created_by, coalesce(d.autorizado_por, aa.autorizador_id), d.created_at, d.motivo, d.cantidad
    from piefirme.devoluciones_venta d
    join piefirme.venta_lineas l on l.id = d.venta_linea_id
    join piefirme.ventas v on v.id = d.venta_id
    left join piefirme.movimientos_caja mc on mc.id = d.movimiento_caja_id
    left join piefirme.autorizaciones_admin aa on aa.id = mc.autorizacion_id
   where d.organizacion_id = p_org and d.sede_id = p_sede and d.reingresa_inventario and d.created_at >= p_desde and l.producto_id = p_producto
  order by 6 desc
$$;
revoke all on function piefirme_app.ctl_o_cancelaciones(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

-- ───────────────────────────── RPC de la Caja (sin saldos ni diferencias) ─────────────────────────────
-- Lo que el cajero necesita: qué controles están activos en su sucursal, el catálogo cerrado de motivos y a quién pedirle la clave.
create or replace function piefirme.ctl_caja_parametros(p_sede uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  if not exists (select 1 from piefirme.sedes s where s.id = p_sede and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sede) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  return jsonb_build_object(
    'precio_abierto_con_clave', coalesce(piefirme_app.ctl_cfg_num(v_org, 'precio_abierto_con_clave', p_sede), 0) >= 1,
    'descuento_motivo_cerrado', coalesce(piefirme_app.ctl_cfg_num(v_org, 'descuento_motivo_cerrado', p_sede), 0) >= 1,
    'descuento_sin_clave_pct', piefirme_app.ctl_cfg_num(v_org, 'descuento_sin_clave_pct', p_sede),
    'cancelacion_con_bloqueo', coalesce(piefirme_app.ctl_cfg_num(v_org, 'cancelacion_con_bloqueo', p_sede), 0) >= 1,
    'cancelacion_espera_seg', piefirme_app.ctl_cfg_num(v_org, 'cancelacion_espera_seg', p_sede),
    'motivos_descuento', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'requiere_nota', m.requiere_nota) order by m.orden, m.nombre)
                                     from piefirme.ctl_motivo m where m.organizacion_id = v_org and m.tipo = 'descuento' and m.activo), '[]'::jsonb),
    'motivos_cancelacion', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'requiere_nota', m.requiere_nota) order by m.orden, m.nombre)
                                       from piefirme.ctl_motivo m where m.organizacion_id = v_org and m.tipo = 'cancelacion' and m.activo), '[]'::jsonb),
    'autorizadores', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', trim(p.nombre || ' ' || coalesce(p.apellidos, '')), 'rol', p.rol::text) order by p.rol::text desc, p.nombre)
                                 from piefirme.perfiles p
                                where p.organizacion_id = v_org and p.activo and p.rol::text in ('supervisor', 'administrador')
                                  and (cardinality(p.sedes) = 0 or p_sede = any (p.sedes))
                                  and not exists (select 1 from piefirme.rannix_staff rs where rs.user_id = p.id)), '[]'::jsonb));
end $$;

-- Clave de supervisor (o del dueño) para un descuento sobre el tope o para un precio cotizado. Devuelve { ok, id } o { ok:false, error, mensaje }; deja registro en bitácora.
create or replace function piefirme.ctl_autorizar_caja(p_tipo text, p_autorizador uuid, p_pin text, p_pct numeric, p_motivo text, p_sede uuid default null, p_detalle jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); k jsonb; v_id uuid; v_tope numeric;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'solo caja pide esta autorización' using errcode = 'PF403'; end if;
  if p_tipo not in ('descuento', 'precio') then raise exception 'tipo de autorización no válido' using errcode = 'PF400'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'el motivo es obligatorio' using errcode = 'PF400'; end if;
  if p_tipo = 'descuento' and (p_pct is null or p_pct <= 0 or p_pct > 100) then raise exception 'indique el porcentaje de descuento' using errcode = 'PF400'; end if;
  k := piefirme_app.ctl_verificar_clave(v_org, p_autorizador, p_pin);
  if not (k ->> 'ok')::boolean then return k; end if;
  if p_tipo = 'descuento' and k ->> 'rol' = 'supervisor' then
    -- el supervisor autoriza hasta el tope que fijaron los dueños (073); si no lo fijaron, activar el catálogo cerrado ya es la decisión: sin tope propio
    v_tope := coalesce(nullif(piefirme_app.param_num(v_org, 'supervisor_descuento_max_pct', 0), 0), 100);
    if p_pct > v_tope + 0.005 then
      return jsonb_build_object('ok', false, 'error', 'excede_tope_supervisor', 'mensaje', format('Un supervisor autoriza hasta %s %%; arriba requiere la clave del dueño.', v_tope));
    end if;
  end if;
  insert into piefirme.autorizaciones_admin (organizacion_id, tipo, solicitante_id, autorizador_id, pct_max, motivo, detalle)
  values (v_org, case p_tipo when 'descuento' then 'descuento' else 'otro' end, auth.uid(), p_autorizador, case when p_tipo = 'descuento' then p_pct end, btrim(p_motivo),
          coalesce(p_detalle, '{}'::jsonb) || jsonb_build_object('tipo_real', p_tipo, 'por', k ->> 'rol', 'sede_id', p_sede))
  returning id into v_id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), p_sede, 'insertar', 'autorizaciones_admin', v_id::text, jsonb_build_object('tipo', p_tipo, 'autorizador', p_autorizador, 'motivo', btrim(p_motivo), 'pct', p_pct));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ───────────────────────────── administración del catálogo de motivos (dueño y soporte configuran) ─────────────────────────────
create or replace function piefirme.ctl_motivo_guardar(p_id uuid, p_tipo text, p_nombre text, p_requiere_nota boolean default false, p_activo boolean default true, p_orden integer default null) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); v_id uuid;
begin
  if p_tipo not in ('descuento', 'cancelacion') then raise exception 'tipo de motivo no válido' using errcode = 'PF400'; end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'el motivo necesita un nombre' using errcode = 'PF400'; end if;
  perform piefirme_app.ctl_rpc_on();
  if p_id is null then
    insert into piefirme.ctl_motivo (organizacion_id, tipo, nombre, requiere_nota, activo, orden)
    values (v_org, p_tipo, btrim(p_nombre), coalesce(p_requiere_nota, false), coalesce(p_activo, true),
            coalesce(p_orden, (select coalesce(max(orden), 0) + 10 from piefirme.ctl_motivo where organizacion_id = v_org and tipo = p_tipo))) returning id into v_id;
  else
    update piefirme.ctl_motivo set nombre = btrim(p_nombre), requiere_nota = coalesce(p_requiere_nota, false), activo = coalesce(p_activo, true), orden = coalesce(p_orden, orden)
     where id = p_id and organizacion_id = v_org returning id into v_id;
    if v_id is null then raise exception 'motivo no encontrado' using errcode = 'PF404'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'ya existe un motivo con ese nombre' using errcode = 'PF409';
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_caja_parametros', 'ctl_autorizar_caja', 'ctl_motivo_guardar') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
