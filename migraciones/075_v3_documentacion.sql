-- 075 · Implementación Pie Clinic · Documentación dentro del sistema (Utilerías → Documentación).
-- Los documentos de trabajo de una clínica (minuta, plan de operación paralela, procesos y flujos, comparativos) viven en la base,
-- NO en archivos públicos ni en un servidor aparte: solo los lee el Administrador de esa clínica (y el Superadministrador que es
-- Administrador de ella) con sesión iniciada. Solo RANNIX los carga o actualiza.
-- ADITIVA: tabla, vista y funciones nuevas; no toca nada existente.
-- Depende de: 001, 062 (rannix_staff / es_rannix), 073.
set search_path = piefirme, piefirme_app, extensions;

create table if not exists piefirme.documentacion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null check (clave ~ '^[a-z0-9_\-]{2,80}$'),     -- identificador estable (p. ej. plan_operacion_paralela_diciembre)
  titulo           text not null check (length(btrim(titulo)) > 0),
  contenido        text not null,                                            -- Markdown
  orden            integer not null default 100,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index if not exists documentacion_org_idx on piefirme.documentacion (organizacion_id, orden);
alter table piefirme.documentacion enable row level security;
drop trigger if exists t_upd on piefirme.documentacion;
create trigger t_upd before update on piefirme.documentacion for each row execute function piefirme_app.tocar_updated_at();

-- Solo lectura para el Administrador de la clínica. Nadie escribe directo: solo la función de RANNIX.
drop policy if exists documentacion_sel on piefirme.documentacion;
create policy documentacion_sel on piefirme.documentacion for select to authenticated
  using ((organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) or piefirme_app.es_rannix());

create or replace view piefirme.prp_documentacion with (security_invoker = true) as
  select id, organizacion_id, clave, titulo, contenido, orden, updated_at from piefirme.documentacion;
grant select on piefirme.prp_documentacion to authenticated;

create or replace function piefirme.documentacion_guardar(p_org uuid, p_clave text, p_titulo text, p_contenido text, p_orden integer default 100)
returns uuid language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid;
begin
  if not piefirme_app.es_rannix() then raise exception 'solo RANNIX carga la documentación' using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.organizaciones where id = p_org) then raise exception 'clínica no encontrada' using errcode = 'PF404'; end if;
  insert into piefirme.documentacion (organizacion_id, clave, titulo, contenido, orden)
  values (p_org, p_clave, p_titulo, p_contenido, coalesce(p_orden, 100))
  on conflict (organizacion_id, clave) do update set titulo = excluded.titulo, contenido = excluded.contenido, orden = excluded.orden
  returning id into v_id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (p_org, auth.uid(), 'actualizar', 'documentacion', v_id::text, jsonb_build_object('clave', p_clave, 'titulo', p_titulo, 'caracteres', length(p_contenido)));
  return v_id;
end $$;

create or replace function piefirme.documentacion_borrar(p_org uuid, p_clave text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_rannix() then raise exception 'solo RANNIX borra documentación' using errcode = 'PF403'; end if;
  delete from piefirme.documentacion where organizacion_id = p_org and clave = p_clave;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (p_org, auth.uid(), 'borrar', 'documentacion', p_clave, jsonb_build_object('clave', p_clave));
end $$;

revoke all on function piefirme.documentacion_guardar(uuid, text, text, text, integer) from public, anon;
revoke all on function piefirme.documentacion_borrar(uuid, text) from public, anon;
grant execute on function piefirme.documentacion_guardar(uuid, text, text, text, integer), piefirme.documentacion_borrar(uuid, text) to authenticated, service_role;
