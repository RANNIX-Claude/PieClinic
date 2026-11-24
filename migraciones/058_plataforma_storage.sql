-- 058 · EQUIPO Y PLATAFORMA (D) · Buckets de storage PRIVADOS y políticas por organización.
-- Clona de IRP: storage_privado_urls_firmadas, storage_cerrar_buckets_publicos, ot-evidencias, expedientes/documentos policies, logos
--   (IRP tenía políticas abiertas "bucket_id = …" para todo autenticado; aquí TODAS filtran por organizacion_id).
-- Regla de ruta: <organizacion_id>/<área>/… ; el primer segmento SIEMPRE es el id de la clínica. Todo se lee con URL firmada (no hay URLs públicas).
-- Depende de: 001 (helpers). No hay política para anon ni para otras clínicas. Suspendida/baja: solo lectura (piefirme_app.org_activa() en escritura).
--
--   bucket          contenido                                             lee                          escribe
--   expedientes     PDFs/escaneos del expediente clínico, importados      Administrador, Podólogo      Administrador, Podólogo
--   fotos-clinicas  fotos de evolución (≤10 por sesión, ≤10 MB)           Administrador, Podólogo      Administrador, Podólogo
--   documentos      firmas, consentimientos, RH (<org>/rh/…), OT          todos (rh/ solo Administrador) Admin/Podólogo/Recepción (rh/ solo Admin)
--   comprobantes    tickets de gasto, comprobantes de pago, CFDI          Administrador, Recepción     Administrador, Recepción
--   importaciones   archivos de importación con IA                        Administrador                Administrador
--   logos           logo de la clínica                                    todos los de la clínica      Administrador

-- ───────────────────────────── buckets (privados) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

insert into storage.buckets (id, name, public) values
  ('pf-expedientes', 'pf-expedientes', false),
  ('pf-fotos-clinicas', 'pf-fotos-clinicas', false),
  ('pf-documentos', 'pf-documentos', false),
  ('pf-comprobantes', 'pf-comprobantes', false),
  ('pf-importaciones', 'pf-importaciones', false),
  ('pf-logos', 'pf-logos', false)
on conflict (id) do update set public = false;

-- límites de tamaño y tipos MIME (columnas de Supabase Storage; se aplican solo si existen en este motor)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets set file_size_limit = 10485760,  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'] where id = 'pf-fotos-clinicas';
    update storage.buckets set file_size_limit = 26214400,  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] where id = 'pf-expedientes';
    update storage.buckets set file_size_limit = 10485760,  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'] where id = 'pf-documentos';
    update storage.buckets set file_size_limit = 10485760,  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'] where id = 'pf-comprobantes';
    update storage.buckets set file_size_limit = 52428800,  allowed_mime_types = array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/pdf', 'image/jpeg', 'image/png', 'text/plain'] where id = 'pf-importaciones';
    update storage.buckets set file_size_limit = 2097152,   allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'] where id = 'pf-logos';
  end if;
end $$;

-- ───────────────────────────── limpieza idempotente ─────────────────────────────
drop policy if exists pf_stg_exp_sel on storage.objects;   drop policy if exists pf_stg_exp_ins on storage.objects;
drop policy if exists pf_stg_exp_upd on storage.objects;   drop policy if exists pf_stg_exp_del on storage.objects;
drop policy if exists pf_stg_fot_sel on storage.objects;   drop policy if exists pf_stg_fot_ins on storage.objects;
drop policy if exists pf_stg_fot_upd on storage.objects;   drop policy if exists pf_stg_fot_del on storage.objects;
drop policy if exists pf_stg_doc_sel on storage.objects;   drop policy if exists pf_stg_doc_ins on storage.objects;
drop policy if exists pf_stg_doc_upd on storage.objects;   drop policy if exists pf_stg_doc_del on storage.objects;
drop policy if exists pf_stg_com_sel on storage.objects;   drop policy if exists pf_stg_com_ins on storage.objects;
drop policy if exists pf_stg_com_upd on storage.objects;   drop policy if exists pf_stg_com_del on storage.objects;
drop policy if exists pf_stg_imp_sel on storage.objects;   drop policy if exists pf_stg_imp_ins on storage.objects;
drop policy if exists pf_stg_imp_upd on storage.objects;   drop policy if exists pf_stg_imp_del on storage.objects;
drop policy if exists pf_stg_log_sel on storage.objects;   drop policy if exists pf_stg_log_ins on storage.objects;
drop policy if exists pf_stg_log_upd on storage.objects;   drop policy if exists pf_stg_log_del on storage.objects;

-- ───────────────────────────── expedientes (clínico) ─────────────────────────────
create policy pf_stg_exp_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-expedientes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'podologo'));
create policy pf_stg_exp_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-expedientes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'podologo'));
create policy pf_stg_exp_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-expedientes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'podologo'))
  with check (bucket_id = 'pf-expedientes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa());
create policy pf_stg_exp_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-expedientes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────────────────────── fotos clínicas ─────────────────────────────
create policy pf_stg_fot_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-fotos-clinicas' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'podologo'));
create policy pf_stg_fot_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-fotos-clinicas' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'podologo'));
create policy pf_stg_fot_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-fotos-clinicas' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'podologo'))
  with check (bucket_id = 'pf-fotos-clinicas' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa());
create policy pf_stg_fot_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-fotos-clinicas' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────────────────────── documentos (consentimientos, firmas, OT; rh/ solo Administrador) ─────────────────────────────
create policy pf_stg_doc_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-documentos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text
         and (coalesce((storage.foldername(name))[2], '') <> 'rh' or piefirme_app.es_admin()
              or (coalesce((storage.foldername(name))[3], '') in ('recibos', 'empleados') and (storage.foldername(name))[4] = piefirme_app.empleado_id()::text)));
create policy pf_stg_doc_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-documentos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa()
              and (coalesce((storage.foldername(name))[2], '') <> 'rh' or piefirme_app.es_admin()));
create policy pf_stg_doc_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-documentos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and (coalesce((storage.foldername(name))[2], '') <> 'rh' or piefirme_app.es_admin()))
  with check (bucket_id = 'pf-documentos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and (coalesce((storage.foldername(name))[2], '') <> 'rh' or piefirme_app.es_admin()));
create policy pf_stg_doc_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-documentos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────────────────────── comprobantes (finanzas, pagos) ─────────────────────────────
create policy pf_stg_com_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-comprobantes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy pf_stg_com_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-comprobantes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy pf_stg_com_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-comprobantes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.rol() in ('administrador', 'recepcion'))
  with check (bucket_id = 'pf-comprobantes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa());
create policy pf_stg_com_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-comprobantes' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────────────────────── importaciones (solo Administrador, CA-08) ─────────────────────────────
create policy pf_stg_imp_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-importaciones' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.es_admin());
create policy pf_stg_imp_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-importaciones' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
create policy pf_stg_imp_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-importaciones' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.es_admin())
  with check (bucket_id = 'pf-importaciones' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa());
create policy pf_stg_imp_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-importaciones' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());

-- ───────────────────────────── logos (privado: se muestra con URL firmada) ─────────────────────────────
create policy pf_stg_log_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-logos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text);
create policy pf_stg_log_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-logos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
create policy pf_stg_log_upd on storage.objects for update to authenticated
  using (bucket_id = 'pf-logos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.es_admin())
  with check (bucket_id = 'pf-logos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa());
create policy pf_stg_log_del on storage.objects for delete to authenticated
  using (bucket_id = 'pf-logos' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and piefirme_app.org_activa() and piefirme_app.es_admin());
