-- 323 · Pedidos especiales · corrige 322: CREATE OR REPLACE VIEW quitó security_invoker de prp_anticipos y prp_proveedores (el RLS del usuario debe aplicar).
alter view piefirme.prp_anticipos set (security_invoker = true);
alter view piefirme.prp_proveedores set (security_invoker = true);
notify pgrst, 'reload schema';
