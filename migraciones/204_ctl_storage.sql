-- 204 · Control y Auditoría · Etapa 0 · ALMACENAMIENTO DE FOTOS DE EVIDENCIA.
-- Bucket PRIVADO pf-auditoria (distinto de pf-auditorias, que es de las auditorías de inventario viejas): ruta <organizacion_id>/ctl/<sucursal_id>/<archivo>.
--   · Subir: quien captura (capturar) a su organización. SIN política de UPDATE ni DELETE ni upsert: una foto no se reemplaza ni se borra desde la app
--     (la purga por retención corre con la llave de servicio, según ctl_config.retencion_fotos_dias).
--   · Ver: dueño y supervisor (ver_directo). El soporte RANNIX NO ve fotos. URLs firmadas de vida corta (el cliente usa lib/auditoria/urlFirmadaAuditoria.js, máx. 5 min).
--   · No hay ruta de «subir desde galería» en la API: el registro (ctl_evidencia_registrar) exige un objeto recién subido (≤ 15 min) y hash único.
-- Depende de: 058 (patrón de buckets y políticas pf_stg_*), 200–203.
set search_path = piefirme, piefirme_app, extensions;

insert into storage.buckets (id, name, public) values ('pf-auditoria', 'pf-auditoria', false)
on conflict (id) do update set public = false;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets set file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'pf-auditoria';
  end if;
end $$;

drop policy if exists pf_stg_aud_sel on storage.objects; drop policy if exists pf_stg_aud_ins on storage.objects;
drop policy if exists pf_stg_aud_upd on storage.objects; drop policy if exists pf_stg_aud_del on storage.objects;

create policy pf_stg_aud_sel on storage.objects for select to authenticated
  using (bucket_id = 'pf-auditoria' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and (storage.foldername(name))[2] = 'ctl'
         and piefirme_app.ctl_puede('ver_directo'));
create policy pf_stg_aud_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'pf-auditoria' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and (storage.foldername(name))[2] = 'ctl'
              and piefirme_app.org_activa() and piefirme_app.ctl_puede('capturar'));
