-- 111 · prp_ingresos expone el folio del ticket y de la cita de cada cobro.
-- Hallazgo del video de comisiones (lote D, VID-D1): la pantalla de Ingresos solo podía mostrar «Venta a3f9c2» (los 6 primeros caracteres del id), así que
-- Administración no podía relacionar un cobro con el ticket de caja que lo generó, ni buscarlo por folio aunque el buscador lo promete.
-- Se agregan al FINAL de la vista (no cambia el orden ni el significado de las columnas existentes) venta_folio y cita_folio. Depende de: la vista vigente prp_ingresos.
set search_path = piefirme, piefirme_app, extensions;

create or replace view piefirme.prp_ingresos with (security_invoker = true) as
 SELECT i.id,
    i.organizacion_id,
    i.sede_id,
    s.nombre AS sede_nombre,
    i.fecha_pago,
    i.forma_pago,
    i.importe,
    i.iva,
    i.importe - i.iva AS base_sin_iva,
        CASE
            WHEN i.es_reembolso THEN - i.importe
            ELSE i.importe
        END AS importe_neto,
    i.clasificacion,
    i.clasificacion_manual,
    i.renglon_id,
    i.venta_id,
    i.cita_id,
    i.pago_id,
    i.paciente_id,
    i.podologo_id,
    i.referencia,
    i.concepto,
    i.comprobante_url,
    i.comprobante_url IS NOT NULL AS tiene_comprobante,
    i.factura_id,
    i.cfdi_uuid,
    i.factura_id IS NOT NULL OR i.cfdi_uuid IS NOT NULL AS tiene_cfdi,
    i.estatus_validacion,
    i.estatus_validacion = ANY (ARRAY['validado'::text, 'validado_cfdi'::text]) AS comisionable,
    i.validado_por,
    i.validado_en,
    i.observacion,
    i.origen_registro,
    i.es_reembolso,
    i.ingreso_origen_id,
    i.lote_liquidacion_id,
    i.created_at,
    COALESCE(( SELECT sum(a.importe_aplicado) AS sum
           FROM piefirme.aplicaciones_cobro a
          WHERE a.ingreso_id = i.id), 0::numeric) AS aplicado,
    c.movimiento_id,
    mb.fecha AS movimiento_fecha,
    v.folio AS venta_folio,
    ci.folio AS cita_folio
   FROM piefirme.ingresos i
     JOIN piefirme.sedes s ON s.id = i.sede_id
     LEFT JOIN piefirme.conciliaciones c ON c.ingreso_id = i.id
     LEFT JOIN piefirme.movimientos_bancarios mb ON mb.id = c.movimiento_id
     LEFT JOIN piefirme.ventas v ON v.id = i.venta_id
     LEFT JOIN piefirme.citas ci ON ci.id = i.cita_id;
