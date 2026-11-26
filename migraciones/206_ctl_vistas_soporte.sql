-- 206 · Control y Auditoría · Etapa 0 · las vistas *_revision se filtran por la capacidad de la MATRIZ (ver_diferencias), no por ver_directo:
-- así la RPC de soporte (ctl_soporte_leer, con bitácora) puede leerlas, mientras que las TABLAS base siguen con RLS ver_directo
-- (el soporte no lee directo) y los roles de sucursal no reciben ni una fila (ni la vista ni la tabla).
-- Depende de: 201, 203.
set search_path = piefirme, piefirme_app, extensions;

create or replace view piefirme.ctl_partida_revision with (security_invoker = true) as
  select p.id, p.organizacion_id, p.sucursal_id, p.sesion_id, p.producto_id, p.codigo_escaneado, p.cantidad_fisica, p.precio_etiqueta,
         p.numero_serie, p.folio_sello, p.sello_intacto, p.nota, p.escaneado_en, p.corrige_a, p.creado_por as usuario_captura,
         c.saldo_sistema, c.diferencia_piezas, c.costo_unitario, c.diferencia_valor, c.precio_catalogo, c.diferencia_precio, c.clasificacion_precio,
         (select k.id from piefirme.ctl_caso k where k.organizacion_id = p.organizacion_id and k.origen_tipo = 'partida_conteo' and k.origen_id = p.id limit 1) as caso_id
    from piefirme.ctl_partida_conteo p
    join piefirme.ctl_partida_calculo c on c.partida_id = p.id
   where piefirme_app.ctl_puede('ver_diferencias');

create or replace view piefirme.ctl_sesion_revision with (security_invoker = true) as
  select s.id, s.organizacion_id, s.folio, s.sucursal_id, s.tipo, s.modo_lista, s.estado, s.solicitada_por, s.solicitada_en, s.limite_en, s.abierta_en,
         s.cerrada_en, s.usuario_captura, s.turno_id, s.total_partidas, r.partidas_con_diferencia, r.valor_diferencia,
         (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id and not l.reportado) as no_reportadas
    from piefirme.ctl_sesion_conteo s
    left join piefirme.ctl_sesion_resultado r on r.sesion_id = s.id
   where piefirme_app.ctl_puede('ver_diferencias');

create or replace view piefirme.ctl_cierre_revision with (security_invoker = true) as
  select c.id, c.organizacion_id, c.sucursal_id, c.cierre_id, c.punto_control_id, c.valor_capturado, c.capturado_en,
         k.valor_esperado, k.diferencia, k.dentro_tolerancia
    from piefirme.ctl_cierre_captura c
    join piefirme.ctl_cierre_calculo k on k.cierre_captura_id = c.id
   where piefirme_app.ctl_puede('ver_diferencias');
