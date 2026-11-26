-- 170 · Análisis de inventario (BI): una fila por producto × sede con costo, precios de venta, proveedor y estado.
-- Solo lectura. security_invoker: hereda el RLS por organización y sede de inventario_sede / productos / precios / proveedores.
-- Fechas en UTC de la organización vía piefirme_app.hoy_org; dinero en numeric (nunca float).
create or replace view piefirme.prp_inventario_analisis with (security_invoker = true) as
select
  i.id,
  i.organizacion_id,
  i.sede_id,
  s.nombre                                  as sede_nombre,
  i.producto_id,
  p.sku,
  p.nombre,
  p.categoria,
  p.departamento_id,
  d.nombre                                  as departamento,
  p.marca,
  p.tipo,
  p.estado                                  as estado_producto,
  i.existencia,
  i.minimo,
  i.maximo,
  p.costo_promedio,
  round(i.existencia * p.costo_promedio, 2) as valor_costo,
  pl.precio                                 as precio_lista,
  ps.precio                                 as precio_sede,
  p.precio_web,
  coalesce(ps.precio, pl.precio)            as precio_venta,
  round(i.existencia * coalesce(ps.precio, pl.precio, 0), 2) as valor_venta,
  pv.proveedor_id,
  pr.nombre                                 as proveedor_nombre,
  pv.ultimo_costo                           as proveedor_ultimo_costo,
  (select min(l.caducidad) from piefirme.lotes_producto l
    where l.sede_id = i.sede_id and l.producto_id = i.producto_id and l.existencia > 0
      and l.caducidad is not null and l.estado <> 'bloqueado') as proxima_caducidad,
  exists (select 1 from piefirme.lotes_producto l
    where l.sede_id = i.sede_id and l.producto_id = i.producto_id and l.existencia > 0 and l.caducidad is not null
      and l.estado <> 'bloqueado'
      and l.caducidad <= current_date + (piefirme_app.c_param(i.organizacion_id, 'dias_caducidad_proxima', 90::numeric))::integer) as caduca_pronto
from piefirme.inventario_sede i
join piefirme.sedes s     on s.id = i.sede_id
join piefirme.productos p on p.id = i.producto_id
left join piefirme.departamentos d on d.id = p.departamento_id
left join lateral (
  select x.precio::numeric as precio from piefirme.precios x
  where x.item_tipo = 'producto' and x.producto_id = p.id and x.sede_id is null
    and x.vigente_desde <= piefirme_app.hoy_org(i.organizacion_id)
    and (x.vigente_hasta is null or x.vigente_hasta >= piefirme_app.hoy_org(i.organizacion_id))
  order by x.vigente_desde desc limit 1) pl on true
left join lateral (
  select x.precio::numeric as precio from piefirme.precios x
  where x.item_tipo = 'producto' and x.producto_id = p.id and x.sede_id = i.sede_id
    and x.vigente_desde <= piefirme_app.hoy_org(i.organizacion_id)
    and (x.vigente_hasta is null or x.vigente_hasta >= piefirme_app.hoy_org(i.organizacion_id))
  order by x.vigente_desde desc limit 1) ps on true
left join lateral (
  select q.proveedor_id, q.ultimo_costo from piefirme.proveedor_productos q
  where q.producto_id = p.id
  order by q.ultima_compra desc nulls last, q.created_at desc limit 1) pv on true
left join piefirme.proveedores pr on pr.id = pv.proveedor_id;

comment on view piefirme.prp_inventario_analisis is 'Análisis de inventario: producto × sede con valor al costo y a precio de venta (sede o lista), proveedor de la última compra y caducidad. Solo lectura.';
grant select on piefirme.prp_inventario_analisis to authenticated;
