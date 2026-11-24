-- 072 · V2 · Storage: buckets PRIVADOS nuevos y sus políticas (mismo patrón pf_stg_*: el primer segmento de la ruta es el id de la clínica; URL firmada).
--   bucket          contenido                                                        lee                          escribe
--   pf-equipo       fotos de personal (fotos/), imágenes del feed, adjuntos          toda la clínica              toda la clínica (fotos/ solo administrador)
--   pf-catalogo     imágenes de producto (catálogo y tienda)                         toda la clínica              Administrador
--   pf-acervo       documentos del acervo y recursos de lecciones                    toda la clínica              Administrador
--   pf-auditorias   fotos de evidencia de auditorías de inventario                   Administrador, Recepción     Administrador, Recepción
-- Borrar: solo Administrador. Suspendida/baja: solo lectura (org_activa() en escritura). Nada para anon ni para otras clínicas.
-- Depende de: 001, 058, 064.
set search_path = piefirme, piefirme_app, extensions;

insert into storage.buckets (id, name, public) values
  ('pf-equipo', 'pf-equipo', false), ('pf-catalogo', 'pf-catalogo', false), ('pf-acervo', 'pf-acervo', false), ('pf-auditorias', 'pf-auditorias', false)
on conflict (id) do update set public = false;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] where id = 'pf-equipo';
    update storage.buckets set file_size_limit = 5242880,  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'pf-catalogo';
    update storage.buckets set file_size_limit = 26214400, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'] where id = 'pf-acervo';
    update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'] where id = 'pf-auditorias';
  end if;
end $$;

-- ───────────── pf-equipo: fotos de personal, imágenes del feed y adjuntos de mensajes/correo (fotos/ solo administrador escribe) ─────────────
drop policy if exists pf_stg_equ_sel on storage.objects; drop policy if exists pf_stg_equ_ins on storage.objects;
drop policy if exists pf_stg_equ_upd on storage.objects; drop policy if exists pf_stg_equ_del on storage.objects;
create policy pf_stg_equ_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-equipo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_id() is not null);
create policy pf_stg_equ_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-equipo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and (coalesce((storage.foldername(name))[2], '') <> 'fotos' or piefirme_app.es_admin()));
create policy pf_stg_equ_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-equipo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and (coalesce((storage.foldername(name))[2], '') <> 'fotos' or piefirme_app.es_admin()))
  with check (bucket_id = 'pf-equipo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and (coalesce((storage.foldername(name))[2], '') <> 'fotos' or piefirme_app.es_admin()));
create policy pf_stg_equ_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-equipo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────── pf-catalogo: imágenes de producto para el catálogo y la tienda ─────────────
drop policy if exists pf_stg_cat_sel on storage.objects; drop policy if exists pf_stg_cat_ins on storage.objects;
drop policy if exists pf_stg_cat_upd on storage.objects; drop policy if exists pf_stg_cat_del on storage.objects;
create policy pf_stg_cat_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-catalogo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text);
create policy pf_stg_cat_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-catalogo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
create policy pf_stg_cat_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-catalogo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.es_admin())
  with check (bucket_id = 'pf-catalogo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
create policy pf_stg_cat_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-catalogo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────── pf-acervo: documentos del acervo y recursos de lecciones (foto/documento) ─────────────
drop policy if exists pf_stg_acv_sel on storage.objects; drop policy if exists pf_stg_acv_ins on storage.objects;
drop policy if exists pf_stg_acv_upd on storage.objects; drop policy if exists pf_stg_acv_del on storage.objects;
create policy pf_stg_acv_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-acervo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text);
create policy pf_stg_acv_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-acervo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
create policy pf_stg_acv_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-acervo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.es_admin())
  with check (bucket_id = 'pf-acervo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
create policy pf_stg_acv_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-acervo' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────── pf-auditorias: fotos de evidencia de auditorías de inventario ─────────────
drop policy if exists pf_stg_aud_sel on storage.objects; drop policy if exists pf_stg_aud_ins on storage.objects;
drop policy if exists pf_stg_aud_upd on storage.objects; drop policy if exists pf_stg_aud_del on storage.objects;
create policy pf_stg_aud_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-auditorias' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy pf_stg_aud_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-auditorias' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy pf_stg_aud_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-auditorias' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'recepcion'))
  with check (bucket_id = 'pf-auditorias' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy pf_stg_aud_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-auditorias' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
