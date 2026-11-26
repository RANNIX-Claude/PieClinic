-- 270 · Costos solo para administrador y supervisor (capacidad inventario.ver_costos del front)
-- El dueño pidió: la recepcionista consulta el inventario y ve solo el PRECIO DE LISTA, nunca el costo.
-- El front ya oculta costos, pero PostgREST los devolvía igual: aquí se hacen NULL en las vistas prp_* de lectura
-- cuando el usuario no es administrador ni supervisor. security_invoker se conserva (RLS del invocador intacto).
-- LIMITACIÓN conocida: las tablas base (productos.costo_promedio, historico_costos, proveedor_productos, movimientos_inventario,
-- oc_lineas, ordenes_compra, traspaso_lineas) siguen legibles para recepción por su RLS de fila; ocultar columnas ahí exige
-- columnas con GRANT por columna o vistas SECURITY DEFINER y reescribir triggers/RPC (ver docs). Esta migración cubre lo que consume el front.
-- Sesiones sin auth.uid() (service_role, scripts, DW) ven todo: ve_costos() devuelve true.

create or replace function piefirme_app.ve_costos() returns boolean
language sql stable security definer
set search_path = piefirme, piefirme_app, extensions, pg_temp
as $$
  select auth.uid() is null
      or coalesce((select p.rol::text in ('administrador','supervisor') from piefirme.perfiles p where p.id = auth.uid() and p.activo), false)
$$;
revoke all on function piefirme_app.ve_costos() from public, anon;
grant execute on function piefirme_app.ve_costos() to authenticated, service_role;

create or replace view piefirme.prp_inventario with (security_invoker = true) as
SELECT i.id,
    i.organizacion_id,
    i.sede_id,
    s.nombre AS sede_nombre,
    i.producto_id,
    i.existencia,
    i.minimo,
    i.maximo,
    i.ubicacion,
    i.ultimo_conteo,
    (CASE WHEN piefirme_app.ve_costos() THEN pr.costo_promedio END)::numeric(14,2) AS costo_promedio,
    CASE WHEN piefirme_app.ve_costos() THEN round((i.existencia * pr.costo_promedio), 2) END AS valor,
    ( SELECT min(l.caducidad) AS min
           FROM piefirme.lotes_producto l
          WHERE ((l.sede_id = i.sede_id) AND (l.producto_id = i.producto_id) AND (l.existencia > (0)::numeric) AND (l.caducidad IS NOT NULL) AND (l.estado <> 'bloqueado'::text))) AS proxima_caducidad,
    (i.existencia < (0)::numeric) AS existencia_negativa,
        CASE
            WHEN (i.existencia <= (0)::numeric) THEN 'sin_existencia'::text
            WHEN (i.existencia < i.minimo) THEN 'bajo_minimo'::text
            WHEN ((i.existencia = i.minimo) AND (i.minimo > (0)::numeric)) THEN 'en_el_minimo'::text
            WHEN (EXISTS ( SELECT 1
               FROM piefirme.lotes_producto l
              WHERE ((l.sede_id = i.sede_id) AND (l.producto_id = i.producto_id) AND (l.existencia > (0)::numeric) AND (l.caducidad IS NOT NULL) AND (l.caducidad <= (CURRENT_DATE + (piefirme_app.c_param(i.organizacion_id, 'dias_caducidad_proxima'::text, (90)::numeric))::integer))))) THEN 'caduca_pronto'::text
            ELSE 'ok'::text
        END AS estado,
        CASE
            WHEN ((i.maximo IS NOT NULL) AND (i.existencia < i.maximo)) THEN (i.maximo - i.existencia)
            ELSE NULL::numeric
        END AS sugerido_comprar
   FROM ((piefirme.inventario_sede i
     JOIN piefirme.sedes s ON ((s.id = i.sede_id)))
     JOIN piefirme.productos pr ON ((pr.id = i.producto_id)));

create or replace view piefirme.prp_productos with (security_invoker = true) as
SELECT p.id,
    p.organizacion_id,
    p.sku,
    p.codigo_barras,
    p.nombre,
    p.categoria,
    p.marca,
    p.presentacion,
    p.tipo,
    (CASE WHEN piefirme_app.ve_costos() THEN p.costo_promedio END)::numeric(14,2) AS costo_promedio,
    p.iva_tipo,
    p.maneja_lote,
    p.maneja_caducidad,
    p.precio_por_sede,
    p.visible_portal,
    p.clave_sat,
    p.unidad_sat,
    p.renglon_edr,
    p.estado,
    p.sintetico,
    p.created_at,
    p.updated_at,
    pv.precio AS precio_lista,
    CASE WHEN piefirme_app.ve_costos() THEN CASE
            WHEN (COALESCE(pv.precio, (0)::numeric) > (0)::numeric) THEN round(((((pv.precio /
            CASE
                WHEN (p.iva_tipo = '16'::text) THEN 1.16
                ELSE (1)::numeric
            END) - p.costo_promedio) / (pv.precio /
            CASE
                WHEN (p.iva_tipo = '16'::text) THEN 1.16
                ELSE (1)::numeric
            END)) * (100)::numeric), 2)
            ELSE NULL::numeric
        END END AS margen_pct,
    p.imagen_path,
    p.descripcion_web,
    p.precio_web,
    p.clave_alterna,
    p.departamento_id,
    p.unidad_compra,
    p.unidad_venta,
    p.factor,
    (CASE WHEN piefirme_app.ve_costos() THEN p.margen_objetivo_pct END)::numeric(7,2) AS margen_objetivo_pct,
    p.regla_precio_compra,
    p.origen,
    p.precio_sugerido,
    p.costo_estimado,
    p.minimo_sicar,
    p.maximo_sicar,
    p.folio
   FROM (piefirme.productos p
     LEFT JOIN ( SELECT DISTINCT ON (pr.producto_id) pr.producto_id,
            (pr.precio)::numeric AS precio
           FROM piefirme.precios pr
          WHERE ((pr.item_tipo = 'producto'::text) AND (pr.sede_id IS NULL) AND (pr.producto_id IS NOT NULL) AND (pr.vigente_desde <= ( SELECT piefirme_app.hoy_org(piefirme_app.org_id()) AS hoy_org)) AND ((pr.vigente_hasta IS NULL) OR (pr.vigente_hasta >= ( SELECT piefirme_app.hoy_org(piefirme_app.org_id()) AS hoy_org))))
          ORDER BY pr.producto_id, pr.vigente_desde DESC) pv ON ((pv.producto_id = p.id)));

create or replace view piefirme.prp_inventario_analisis with (security_invoker = true) as
SELECT i.id,
    i.organizacion_id,
    i.sede_id,
    s.nombre AS sede_nombre,
    i.producto_id,
    p.sku,
    p.nombre,
    p.categoria,
    p.departamento_id,
    d.nombre AS departamento,
    p.marca,
    p.tipo,
    p.estado AS estado_producto,
    i.existencia,
    i.minimo,
    i.maximo,
    (CASE WHEN piefirme_app.ve_costos() THEN p.costo_promedio END)::numeric(14,2) AS costo_promedio,
    CASE WHEN piefirme_app.ve_costos() THEN round((i.existencia * p.costo_promedio), 2) END AS valor_costo,
    pl.precio AS precio_lista,
    ps.precio AS precio_sede,
    p.precio_web,
    COALESCE(ps.precio, pl.precio) AS precio_venta,
    round((i.existencia * COALESCE(ps.precio, pl.precio, (0)::numeric)), 2) AS valor_venta,
    pv.proveedor_id,
    pr.nombre AS proveedor_nombre,
    (CASE WHEN piefirme_app.ve_costos() THEN pv.ultimo_costo END)::numeric(14,4) AS proveedor_ultimo_costo,
    ( SELECT min(l.caducidad) AS min
           FROM piefirme.lotes_producto l
          WHERE ((l.sede_id = i.sede_id) AND (l.producto_id = i.producto_id) AND (l.existencia > (0)::numeric) AND (l.caducidad IS NOT NULL) AND (l.estado <> 'bloqueado'::text))) AS proxima_caducidad,
    (EXISTS ( SELECT 1
           FROM piefirme.lotes_producto l
          WHERE ((l.sede_id = i.sede_id) AND (l.producto_id = i.producto_id) AND (l.existencia > (0)::numeric) AND (l.caducidad IS NOT NULL) AND (l.estado <> 'bloqueado'::text) AND (l.caducidad <= (CURRENT_DATE + (piefirme_app.c_param(i.organizacion_id, 'dias_caducidad_proxima'::text, (90)::numeric))::integer))))) AS caduca_pronto
   FROM (((((((piefirme.inventario_sede i
     JOIN piefirme.sedes s ON ((s.id = i.sede_id)))
     JOIN piefirme.productos p ON ((p.id = i.producto_id)))
     LEFT JOIN piefirme.departamentos d ON ((d.id = p.departamento_id)))
     LEFT JOIN LATERAL ( SELECT (x.precio)::numeric AS precio
           FROM piefirme.precios x
          WHERE ((x.item_tipo = 'producto'::text) AND (x.producto_id = p.id) AND (x.sede_id IS NULL) AND (x.vigente_desde <= piefirme_app.hoy_org(i.organizacion_id)) AND ((x.vigente_hasta IS NULL) OR (x.vigente_hasta >= piefirme_app.hoy_org(i.organizacion_id))))
          ORDER BY x.vigente_desde DESC
         LIMIT 1) pl ON (true))
     LEFT JOIN LATERAL ( SELECT (x.precio)::numeric AS precio
           FROM piefirme.precios x
          WHERE ((x.item_tipo = 'producto'::text) AND (x.producto_id = p.id) AND (x.sede_id = i.sede_id) AND (x.vigente_desde <= piefirme_app.hoy_org(i.organizacion_id)) AND ((x.vigente_hasta IS NULL) OR (x.vigente_hasta >= piefirme_app.hoy_org(i.organizacion_id))))
          ORDER BY x.vigente_desde DESC
         LIMIT 1) ps ON (true))
     LEFT JOIN LATERAL ( SELECT q.proveedor_id,
            q.ultimo_costo
           FROM piefirme.proveedor_productos q
          WHERE (q.producto_id = p.id)
          ORDER BY q.ultima_compra DESC NULLS LAST, q.created_at DESC
         LIMIT 1) pv ON (true))
     LEFT JOIN piefirme.proveedores pr ON ((pr.id = pv.proveedor_id)));

create or replace view piefirme.prp_kardex with (security_invoker = true) as
SELECT m.id,
    m.organizacion_id,
    m.sede_id,
    s.nombre AS sede_nombre,
    m.producto_id,
    m.lote_id,
    m.tipo,
    m.cantidad,
    (CASE WHEN piefirme_app.ve_costos() THEN m.costo_unitario END)::numeric(14,4) AS costo_unitario,
    (CASE WHEN piefirme_app.ve_costos() THEN m.costo_total END)::numeric(14,2) AS costo_total,
    m.referencia_tipo,
    m.referencia_id,
    m.referencia_folio,
    m.nota,
    m.usuario_id,
    m.fecha
   FROM (piefirme.movimientos_inventario m
     JOIN piefirme.sedes s ON ((s.id = m.sede_id)));

create or replace view piefirme.prp_mermas with (security_invoker = true) as
SELECT m.id,
    m.organizacion_id,
    m.sede_id,
    s.nombre AS sede_nombre,
    m.folio,
    m.producto_id,
    m.lote_id,
    m.cantidad,
    m.motivo,
    m.tipo,
    m.es_reclamacion,
    m.estado,
    m.registrado_por,
    m.autorizado_por,
    m.autorizado_en,
    m.created_at,
    CASE WHEN piefirme_app.ve_costos() THEN round((m.cantidad * pr.costo_promedio), 2) END AS valor_estimado,
    m.traspaso_id,
    t.folio AS traspaso_folio
   FROM (((piefirme.mermas m
     JOIN piefirme.sedes s ON ((s.id = m.sede_id)))
     JOIN piefirme.productos pr ON ((pr.id = m.producto_id)))
     LEFT JOIN piefirme.traspasos t ON ((t.id = m.traspaso_id)));

create or replace view piefirme.prp_traspaso_lineas with (security_invoker = true) as
SELECT l.id,
    l.organizacion_id,
    l.traspaso_id,
    l.producto_id,
    l.lote_id,
    l.cantidad_enviada,
    l.cantidad_recibida,
    l.diferencia,
    l.motivo_diferencia,
    CASE WHEN piefirme_app.ve_costos() THEN COALESCE(l.costo_unitario, pr.costo_promedio) END AS costo_unitario,
    CASE WHEN piefirme_app.ve_costos() THEN round((l.cantidad_enviada * COALESCE(l.costo_unitario, pr.costo_promedio)), 2) END AS valor,
    ( SELECT i.existencia
           FROM (piefirme.inventario_sede i
             JOIN piefirme.traspasos t ON ((t.id = l.traspaso_id)))
          WHERE ((i.sede_id = t.sede_origen_id) AND (i.producto_id = l.producto_id))) AS existencia_origen,
    ( SELECT i.existencia
           FROM (piefirme.inventario_sede i
             JOIN piefirme.traspasos t ON ((t.id = l.traspaso_id)))
          WHERE ((i.sede_id = t.sede_destino_id) AND (i.producto_id = l.producto_id))) AS existencia_destino,
    ( SELECT i.minimo
           FROM (piefirme.inventario_sede i
             JOIN piefirme.traspasos t ON ((t.id = l.traspaso_id)))
          WHERE ((i.sede_id = t.sede_destino_id) AND (i.producto_id = l.producto_id))) AS minimo_destino
   FROM (piefirme.traspaso_lineas l
     JOIN piefirme.productos pr ON ((pr.id = l.producto_id)));

create or replace view piefirme.prp_traspasos with (security_invoker = true) as
SELECT t.id,
    t.organizacion_id,
    t.folio,
    t.estado,
    t.sede_origen_id,
    so.nombre AS sede_origen,
    t.sede_destino_id,
    sd.nombre AS sede_destino,
    t.fecha_envio,
    t.fecha_estimada,
    t.solicito_id,
    t.responsable_envio_id,
    t.transporte,
    t.comentarios,
    t.partidas,
    t.unidades,
    (CASE WHEN piefirme_app.ve_costos() THEN t.valor_total END)::numeric(14,2) AS valor_total,
    t.enviado_en,
    t.recibido_en,
    t.recibio_por,
    t.cancelado_motivo,
    t.created_at,
    ( SELECT count(*) AS count
           FROM piefirme.traspaso_lineas l
          WHERE ((l.traspaso_id = t.id) AND (COALESCE(l.cantidad_recibida, l.cantidad_enviada) < l.cantidad_enviada))) AS partidas_con_diferencia
   FROM ((piefirme.traspasos t
     JOIN piefirme.sedes so ON ((so.id = t.sede_origen_id)))
     JOIN piefirme.sedes sd ON ((sd.id = t.sede_destino_id)));

create or replace view piefirme.prp_oc_lineas with (security_invoker = true) as
SELECT id,
    organizacion_id,
    oc_id,
    producto_id,
    descripcion,
    cantidad,
    (CASE WHEN piefirme_app.ve_costos() THEN costo_unitario END)::numeric(14,4) AS costo_unitario,
    (CASE WHEN piefirme_app.ve_costos() THEN descuento_pct END)::numeric(5,2) AS descuento_pct,
    iva_pct,
    (CASE WHEN piefirme_app.ve_costos() THEN base_neta END)::numeric(14,2) AS base_neta,
    (CASE WHEN piefirme_app.ve_costos() THEN iva_monto END)::numeric(14,2) AS iva_monto,
    (CASE WHEN piefirme_app.ve_costos() THEN importe END)::numeric(14,2) AS importe,
    cantidad_recibida,
    (cantidad - cantidad_recibida) AS pendiente,
    (CASE WHEN piefirme_app.ve_costos() THEN ultimo_costo END)::numeric(14,4) AS ultimo_costo,
    CASE WHEN piefirme_app.ve_costos() THEN CASE
            WHEN ((ultimo_costo IS NOT NULL) AND (ultimo_costo > (0)::numeric)) THEN round((((costo_unitario - ultimo_costo) / ultimo_costo) * (100)::numeric), 2)
            ELSE NULL::numeric
        END END AS variacion_pct
   FROM piefirme.oc_lineas l;

create or replace view piefirme.prp_ordenes_compra with (security_invoker = true) as
SELECT o.id,
    o.organizacion_id,
    o.folio,
    o.sede_id,
    s.nombre AS sede_nombre,
    o.proveedor_id,
    p.nombre AS proveedor_nombre,
    o.fecha,
    o.entrega_esperada,
    o.condiciones_pago,
    o.dias_credito,
    o.moneda,
    o.solicita_id,
    o.referencia_cotizacion,
    o.cotizacion_url,
    o.notas,
    (CASE WHEN piefirme_app.ve_costos() THEN o.subtotal END)::numeric(14,2) AS subtotal,
    (CASE WHEN piefirme_app.ve_costos() THEN o.descuento END)::numeric(14,2) AS descuento,
    (CASE WHEN piefirme_app.ve_costos() THEN o.iva END)::numeric(14,2) AS iva,
    (CASE WHEN piefirme_app.ve_costos() THEN o.total END)::numeric(14,2) AS total,
    o.estado,
    o.estado_pago,
    o.requiere_autorizacion,
    o.autorizada_por,
    o.autorizada_en,
    o.enviada_en,
    o.created_at,
    (o.requiere_autorizacion AND (o.autorizada_por IS NULL) AND (o.estado = 'borrador'::text)) AS pendiente_autorizacion,
    ( SELECT count(*) AS count
           FROM piefirme.oc_lineas l
          WHERE (l.oc_id = o.id)) AS partidas,
    ( SELECT COALESCE(sum((l.cantidad - l.cantidad_recibida)), (0)::numeric) AS "coalesce"
           FROM piefirme.oc_lineas l
          WHERE (l.oc_id = o.id)) AS unidades_pendientes
   FROM ((piefirme.ordenes_compra o
     JOIN piefirme.sedes s ON ((s.id = o.sede_id)))
     JOIN piefirme.proveedores p ON ((p.id = o.proveedor_id)));

create or replace view piefirme.prp_recepciones with (security_invoker = true) as
SELECT r.id,
    r.organizacion_id,
    r.folio,
    r.oc_id,
    o.folio AS oc_folio,
    r.sede_id,
    r.fecha,
    r.recibio_id,
    r.estado,
    r.factura_numero,
    (CASE WHEN piefirme_app.ve_costos() THEN r.factura_importe END)::numeric(14,2) AS factura_importe,
    r.factura_url,
    r.factura_vencimiento,
    r.cfdi_uuid,
    r.cuenta_por_pagar_id,
    r.nota,
    o.proveedor_id,
    ( SELECT count(*) AS count
           FROM piefirme.recepcion_lineas l
          WHERE (l.recepcion_id = r.id)) AS partidas
   FROM (piefirme.recepciones r
     JOIN piefirme.ordenes_compra o ON ((o.id = r.oc_id)));

create or replace view piefirme.prp_compras_proveedor with (security_invoker = true) as
SELECT x.organizacion_id,
    x.proveedor_id,
    x.proveedor_nombre,
    x.sede_id,
    x.mes,
    x.num_ordenes,
    CASE WHEN piefirme_app.ve_costos() THEN x.total_ordenado END AS total_ordenado,
    CASE WHEN piefirme_app.ve_costos() THEN x.total_recibido END AS total_recibido,
    CASE WHEN piefirme_app.ve_costos() THEN COALESCE(pg.pagado, (0)::numeric) END AS total_pagado
   FROM (( SELECT o.organizacion_id,
            o.proveedor_id,
            p.nombre AS proveedor_nombre,
            o.sede_id,
            (date_trunc('month'::text, (o.fecha)::timestamp with time zone))::date AS mes,
            count(*) AS num_ordenes,
            sum(o.total) AS total_ordenado,
            sum(o.total) FILTER (WHERE (o.estado = ANY (ARRAY['recibida'::text, 'recibida_parcial'::text]))) AS total_recibido
           FROM (piefirme.ordenes_compra o
             JOIN piefirme.proveedores p ON ((p.id = o.proveedor_id)))
          WHERE (o.estado <> 'cancelada'::text)
          GROUP BY o.organizacion_id, o.proveedor_id, p.nombre, o.sede_id, (date_trunc('month'::text, (o.fecha)::timestamp with time zone))) x
     LEFT JOIN ( SELECT c.proveedor_id,
            c.sede_id,
            (date_trunc('month'::text, (c.fecha_emision)::timestamp with time zone))::date AS mes,
            sum(c.pagado) AS pagado
           FROM piefirme.cuentas_por_pagar c
          GROUP BY c.proveedor_id, c.sede_id, (date_trunc('month'::text, (c.fecha_emision)::timestamp with time zone))) pg ON (((pg.proveedor_id = x.proveedor_id) AND (pg.sede_id = x.sede_id) AND (pg.mes = x.mes))));

