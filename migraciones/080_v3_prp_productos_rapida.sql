-- 080 · Implementación Pie Clinic · prp_productos sin una llamada por producto.
-- La 079 redujo las llamadas a precio_vigente() de cinco a una por producto y agregó un índice, pero con RLS el plan seguía recorriendo toda la
-- tabla de precios por cada producto (≈ 30 s con 2,880 productos, y el rol authenticated corta a los 8 s). Aquí el precio vigente de lista
-- (sede nula, la misma regla de precio_vigente) se calcula UNA sola vez para todo el catálogo con un DISTINCT ON y se une por producto.
-- Mismas columnas, mismo orden y mismos resultados. ADITIVA. Depende de 079.
set search_path = piefirme, piefirme_app, extensions;

create or replace view piefirme.prp_productos with (security_invoker = true) as
 select p.id, p.organizacion_id, p.sku, p.codigo_barras, p.nombre, p.categoria, p.marca, p.presentacion, p.tipo, p.costo_promedio, p.iva_tipo,
        p.maneja_lote, p.maneja_caducidad, p.precio_por_sede, p.visible_portal, p.clave_sat, p.unidad_sat, p.renglon_edr, p.estado, p.sintetico,
        p.created_at, p.updated_at,
        pv.precio as precio_lista,
        case when coalesce(pv.precio, 0::numeric) > 0::numeric
             then round((((pv.precio / case when p.iva_tipo = '16' then 1.16 else 1::numeric end) - p.costo_promedio)
                         / (pv.precio / case when p.iva_tipo = '16' then 1.16 else 1::numeric end)) * 100::numeric, 2)
             else null::numeric end as margen_pct,
        p.imagen_path, p.descripcion_web, p.precio_web, p.clave_alterna, p.departamento_id, p.unidad_compra, p.unidad_venta, p.factor,
        p.margen_objetivo_pct, p.regla_precio_compra, p.origen, p.precio_sugerido, p.costo_estimado, p.minimo_sicar, p.maximo_sicar, p.folio
   from piefirme.productos p
   left join (
     select distinct on (pr.producto_id) pr.producto_id, pr.precio::numeric as precio
       from piefirme.precios pr
      where pr.item_tipo = 'producto' and pr.sede_id is null and pr.producto_id is not null
        and pr.vigente_desde <= (select piefirme_app.hoy_org(piefirme_app.org_id()))
        and (pr.vigente_hasta is null or pr.vigente_hasta >= (select piefirme_app.hoy_org(piefirme_app.org_id())))
      order by pr.producto_id, pr.vigente_desde desc
   ) pv on pv.producto_id = p.id;
