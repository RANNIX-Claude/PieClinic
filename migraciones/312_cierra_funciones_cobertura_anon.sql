-- 312 · Cierra a `anon` las funciones de la 310 (heredaron EXECUTE de PUBLIC). Las usa el RLS como `authenticated`.
set search_path = piefirme, piefirme_app, extensions;
revoke all on function piefirme_app.sede_cobertura_hoy() from public, anon;
revoke all on function piefirme_app.es_responsable(uuid) from public, anon;
revoke all on function piefirme_app.sedes_responsable_biu() from public, anon;
revoke all on function piefirme_app.cobertura_biud() from public, anon;
revoke all on function piefirme_app.checada_una_sede_biu() from public, anon;
revoke all on function piefirme_app.venta_cobertura_bi() from public, anon;
revoke all on function piefirme_app.puede_sede(uuid) from public, anon;
grant execute on function piefirme_app.sede_cobertura_hoy(), piefirme_app.es_responsable(uuid), piefirme_app.puede_sede(uuid) to authenticated;
notify pgrst, 'reload schema';
