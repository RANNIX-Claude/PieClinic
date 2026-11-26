-- 202 · Control y Auditoría · Etapa 0 · VISTAS DE LECTURA SOBRE EL ORIGEN (v_ctl_*).
-- Contrato de desacoplamiento: el módulo lee del punto de venta SOLO por estas vistas (solo lectura, security_invoker). Si mañana el origen
-- es otro sistema, se reimplementan estas ocho vistas y el módulo no cambia. Están sobre las tablas reales de Pie Firme.
-- Regla de captura a ciegas: las que traen saldo, costo, precio o esperado se filtran por ctl_puede('ver_directo'): un rol de
-- sucursal (recepcion, podologo) las consulta y recibe CERO filas (y ningún saldo).
-- Depende de: 200, 201.
set search_path = piefirme, piefirme_app, extensions;

-- Catálogo de productos: precio vigente y fecha del último cambio (base de la ventana de gracia), costo y banderas de control.
create or replace view piefirme.v_ctl_productos with (security_invoker = true) as
  select p.id, p.organizacion_id, p.codigo_barras, p.sku, p.nombre as descripcion, p.categoria, p.estado,
         pr.precio as precio_vigente, pr.vigente_desde as fecha_ultimo_cambio_precio,
         p.costo_promedio as costo,
         coalesce(a.requiere_serie, false) as requiere_serie, coalesce(a.requiere_sello, false) as requiere_sello,
         coalesce(a.alto_valor, false) as alto_valor, a.peso_caja_llena
    from piefirme.productos p
    left join lateral (
      select x.precio, x.vigente_desde from piefirme.precios x
       where x.producto_id = p.id and x.organizacion_id = p.organizacion_id and x.item_tipo = 'producto'
         and x.vigente_desde <= current_date and (x.vigente_hasta is null or x.vigente_hasta >= current_date)
       order by (x.sede_id is null) desc, x.vigente_desde desc limit 1) pr on true
    left join piefirme.ctl_producto_atributo a on a.producto_id = p.id and a.organizacion_id = p.organizacion_id
   where piefirme_app.ctl_puede('ver_directo');

-- Saldo de inventario por sucursal y producto.
create or replace view piefirme.v_ctl_saldos with (security_invoker = true) as
  select i.organizacion_id, i.producto_id, i.sede_id as sucursal_id, i.existencia as cantidad,
         (select max(m.fecha) from piefirme.movimientos_inventario m where m.sede_id = i.sede_id and m.producto_id = i.producto_id) as fecha_ultimo_movimiento
    from piefirme.inventario_sede i
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(i.sede_id);

-- Movimientos de inventario (contexto de una diferencia: distinguir robo de error de captura).
create or replace view piefirme.v_ctl_movimientos with (security_invoker = true) as
  select m.id, m.organizacion_id, m.tipo, m.producto_id, m.sede_id as sucursal_id, m.cantidad, m.costo_unitario, m.fecha,
         m.usuario_id, m.referencia_folio as documento, m.referencia_tipo
    from piefirme.movimientos_inventario m
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(m.sede_id);

-- Ventas y tickets: una fila por línea cobrada (para el reporte de ventas bajo catálogo, cuadre de efectivo y conteo de servicios).
create or replace view piefirme.v_ctl_ventas with (security_invoker = true) as
  select l.id as linea_id, v.id as venta_id, v.organizacion_id, v.folio as ticket, v.sede_id as sucursal_id, t.caja,
         coalesce(v.cajero_id, v.created_by) as usuario_id, coalesce(v.cobrada_en, v.created_at) as fecha_hora, v.estado, v.turno_id,
         (select string_agg(distinct pg.metodo, ',' order by pg.metodo) from piefirme.pagos pg where pg.venta_id = v.id) as forma_pago,
         l.tipo as tipo_linea, l.producto_id, l.servicio_id, l.descripcion, l.cantidad,
         l.precio_unitario as precio_cobrado, l.descuento as descuento_monto, l.descuento_pct,
         coalesce(l.descuento_motivo, v.descuento_motivo) as motivo_descuento,
         aa.autorizador_id as autorizador, l.importe,
         cat.precio as precio_catalogo_al_momento
    from piefirme.ventas v
    join piefirme.venta_lineas l on l.venta_id = v.id
    left join piefirme.turnos_caja t on t.id = v.turno_id
    left join piefirme.autorizaciones_admin aa on aa.id = coalesce(l.autorizacion_descuento_id, v.autorizacion_descuento_id)
    left join lateral (
      select x.precio from piefirme.precios x
       where l.producto_id is not null and x.producto_id = l.producto_id and x.organizacion_id = v.organizacion_id and x.item_tipo = 'producto'
         and x.vigente_desde <= coalesce(v.cobrada_en, v.created_at)::date and (x.vigente_hasta is null or x.vigente_hasta >= coalesce(v.cobrada_en, v.created_at)::date)
       order by (x.sede_id is null) desc, x.vigente_desde desc limit 1) cat on true
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(v.sede_id);

-- Cancelaciones y devoluciones.
create or replace view piefirme.v_ctl_cancelaciones with (security_invoker = true) as
  select v.id as id, v.organizacion_id, 'cancelacion'::text as tipo, v.id as venta_id, v.folio as ticket_original, v.sede_id as sucursal_id,
         v.cancelada_en as fecha, v.cancelada_por as usuario_id, null::uuid as autorizador, v.motivo_cancelacion as motivo,
         v.total as monto, null::boolean as reingresa_inventario
    from piefirme.ventas v
   where v.estado = 'cancelada' and piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(v.sede_id)
  union all
  select d.id, d.organizacion_id, 'devolucion', d.venta_id, v.folio, d.sede_id, d.created_at, d.created_by, mc.autorizacion_id, d.motivo, d.monto, d.reingresa_inventario
    from piefirme.devoluciones_venta d
    join piefirme.ventas v on v.id = d.venta_id
    left join piefirme.movimientos_caja mc on mc.id = d.movimiento_caja_id
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(d.sede_id);

-- Sucursales (sin datos sensibles).
create or replace view piefirme.v_ctl_sucursales with (security_invoker = true) as
  select s.id, s.organizacion_id, s.clave, s.nombre, s.activa
    from piefirme.sedes s
   where piefirme_app.ctl_rol() is not null;

-- Usuarios (sin correo ni teléfono).
create or replace view piefirme.v_ctl_usuarios with (security_invoker = true) as
  select p.id, p.organizacion_id, trim(p.nombre || ' ' || coalesce(p.apellidos, '')) as nombre, p.rol::text as rol_origen, p.sedes as sucursales, p.activo
    from piefirme.perfiles p
   where piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('ver_directo');

-- Turnos de caja (incluye lo que el sistema esperaba del efectivo: solo ver_diferencias).
create or replace view piefirme.v_ctl_turnos with (security_invoker = true) as
  select t.id, t.organizacion_id, t.sede_id as sucursal_id, t.caja, t.nombre_turno, t.cajero_id as usuario_id, t.apertura_en, t.cierre_en,
         t.estado, t.fondo_inicial, t.efectivo_esperado, t.efectivo_contado, t.diferencia
    from piefirme.turnos_caja t
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(t.sede_id);

do $$
declare v text;
begin
  foreach v in array array['v_ctl_productos', 'v_ctl_saldos', 'v_ctl_movimientos', 'v_ctl_ventas', 'v_ctl_cancelaciones', 'v_ctl_sucursales', 'v_ctl_usuarios', 'v_ctl_turnos'] loop
    execute format('revoke all on piefirme.%I from public, anon', v);
    execute format('grant select on piefirme.%I to authenticated', v);
  end loop;
end $$;
