-- 079 · Implementación Pie Clinic · Rendimiento del catálogo grande (2,880 productos).
-- Con el catálogo de SICAR cargado, Catálogo y precios, Caja e Inventario respondían «canceling statement due to statement timeout» (8 s del rol
-- authenticated): prp_productos llamaba a precio_vigente() cinco veces por producto y esa función no tenía índice por producto (comparaba
-- coalesce(servicio_id, producto_id, oferta_id) contra todo precios). Dos arreglos, sin cambiar columnas ni resultados:
--   1) un índice por (tipo, elemento, vigencia) que la función sí puede usar;
--   2) prp_productos calcula el precio vigente UNA vez por producto (LATERAL) en lugar de cinco.
-- ADITIVA. Depende de 020 y 077.
set search_path = piefirme, piefirme_app, extensions;

create index if not exists precios_item_vigencia_idx
  on piefirme.precios (item_tipo, (coalesce(servicio_id, producto_id, oferta_id)), vigente_desde desc);

create or replace view piefirme.prp_productos with (security_invoker = true) as
 select p.id, p.organizacion_id, p.sku, p.codigo_barras, p.nombre, p.categoria, p.marca, p.presentacion, p.tipo, p.costo_promedio, p.iva_tipo,
        p.maneja_lote, p.maneja_caducidad, p.precio_por_sede, p.visible_portal, p.clave_sat, p.unidad_sat, p.renglon_edr, p.estado, p.sintetico,
        p.created_at, p.updated_at,
        pv.pl as precio_lista,
        case when coalesce(pv.pl, 0::numeric) > 0::numeric
             then round((((pv.pl / case when p.iva_tipo = '16' then 1.16 else 1::numeric end) - p.costo_promedio)
                         / (pv.pl / case when p.iva_tipo = '16' then 1.16 else 1::numeric end)) * 100::numeric, 2)
             else null::numeric end as margen_pct,
        p.imagen_path, p.descripcion_web, p.precio_web, p.clave_alterna, p.departamento_id, p.unidad_compra, p.unidad_venta, p.factor,
        p.margen_objetivo_pct, p.regla_precio_compra, p.origen, p.precio_sugerido, p.costo_estimado, p.minimo_sicar, p.maximo_sicar, p.folio
   from piefirme.productos p
   left join lateral (select piefirme.precio_vigente('producto'::text, p.id, null::uuid) as pl) pv on true;
