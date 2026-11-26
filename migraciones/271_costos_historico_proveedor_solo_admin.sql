-- 271 · Histórico de costos y precios de proveedor: solo administrador
-- Antes recepción podía leer historico_costos y proveedor_productos (ultimo_costo) directo por PostgREST. Ya no hay pantalla de recepción
-- que los use (la pestaña Costos/Proveedores de la ficha del producto y el directorio de proveedores son de dueños). Los triggers que
-- los escriben o leen (c_oc_linea_bi, c_recepcion_linea_ai) son SECURITY DEFINER, así que recibir mercancía sigue funcionando.
-- El supervisor no tenía política de lectura en estas tablas (se mantiene así; ve costos por las vistas prp_* de la migración 270).

drop policy if exists historico_costos_sel on piefirme.historico_costos;
create policy historico_costos_sel on piefirme.historico_costos for select
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = 'administrador');

drop policy if exists proveedor_productos_sel on piefirme.proveedor_productos;
create policy proveedor_productos_sel on piefirme.proveedor_productos for select
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = 'administrador');
