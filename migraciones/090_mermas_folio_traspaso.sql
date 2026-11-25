-- 090 · Mermas y reclamaciones: la vista prp_mermas expone el traspaso de origen (id y folio).
-- Hallazgo del video de QA «mermas y conteo» (H-INV-03): la reclamación por faltante de un traspaso se guardaba bien en `mermas` (traspaso_id)
-- pero la pantalla no decía de qué traspaso venía, y Administración no podía cruzarla con el traspaso GALERIAS-TRA-000002.
-- Solo agrega columnas al final de la vista (create or replace); no cambia datos ni permisos.
create or replace view piefirme.prp_mermas with (security_invoker = true) as
select m.id, m.organizacion_id, m.sede_id, s.nombre as sede_nombre, m.folio, m.producto_id, m.lote_id, m.cantidad, m.motivo, m.tipo, m.es_reclamacion,
       m.estado, m.registrado_por, m.autorizado_por, m.autorizado_en, m.created_at,
       round(m.cantidad * pr.costo_promedio, 2) as valor_estimado,
       m.traspaso_id, t.folio as traspaso_folio
  from piefirme.mermas m
  join piefirme.sedes s on s.id = m.sede_id
  join piefirme.productos pr on pr.id = m.producto_id
  left join piefirme.traspasos t on t.id = m.traspaso_id;
