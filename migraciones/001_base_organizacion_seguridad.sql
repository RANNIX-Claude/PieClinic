-- 001 · Base multi-clínica: organización, sedes, cabinas, perfiles, roles, funciones de seguridad y bitácora.
-- Toda tabla de negocio lleva organizacion_id y RLS por clínica desde el día uno (REGLAS_NEGOCIO.md, DICCIONARIO_DATOS.md E01-E05).
-- BASE COMPARTIDA: Pie Firme vive en su propio esquema dentro del proyecto Supabase BITDATA (otro sistema usa comercio_cdmx).
--   piefirme      → tablas, vistas y RPC de la aplicación (se expone en PostgREST; el cliente usa db.schema = 'piefirme')
--   piefirme_app  → helpers de seguridad (no se expone por la API; solo los ejecutan authenticated y service_role)
-- Esta migración NO toca public, auth ni storage fuera de lo propio de Pie Firme (buckets pf-*, políticas pf_stg_*).
-- No se usan extensiones (gen_random_uuid es nativo de PostgreSQL 13+).

create schema if not exists piefirme;
create schema if not exists piefirme_app;

-- Supabase da permisos por defecto solo al esquema public; en un esquema propio hay que darlos explícitamente.
revoke all on schema piefirme from public;
grant usage on schema piefirme to anon, authenticated, service_role;   -- anon solo para ejecutar las RPC portal_* (ninguna tabla es legible por anon)
revoke all on schema piefirme_app from public, anon;
grant usage on schema piefirme_app to authenticated, service_role;
alter default privileges in schema piefirme grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema piefirme grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema piefirme grant execute on functions to authenticated, service_role;
alter default privileges in schema piefirme_app grant execute on functions to authenticated, service_role;

set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── tipos ─────────────────────────────
do $$ begin
  create type piefirme.rol_usuario as enum ('administrador', 'podologo', 'recepcion');
exception when duplicate_object then null; end $$;

-- ───────────────────────────── organización (clínica cliente del SaaS) ─────────────────────────────
create table piefirme.organizaciones (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  razon_social      text,
  rfc               text,
  regimen_fiscal    text,
  codigo_postal     text,
  logo_url          text,
  zona_horaria      text not null default 'America/Mexico_City',
  plan              text not null default 'por_podologo' check (plan in ('por_podologo', 'por_clinica')),
  estado            text not null default 'prueba' check (estado in ('prueba', 'activa', 'suspendida', 'baja')),
  prueba_hasta      date,
  parametros        jsonb not null default '{}'::jsonb,   -- reglas configurables (cancelación, anticipo, descuentos…)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table piefirme.sedes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null,
  nombre           text not null,
  direccion        text,
  telefono         text,
  horario          jsonb not null default '{}'::jsonb,
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index on piefirme.sedes (organizacion_id);

create table piefirme.cabinas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  nombre           text not null,
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (sede_id, nombre)
);
create index on piefirme.cabinas (organizacion_id, sede_id);

-- ───────────────────────────── perfiles (usuarios con sesión) ─────────────────────────────
create table piefirme.perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  rol              piefirme.rol_usuario not null,
  nombre           text not null,
  apellidos        text,
  email            text,
  telefono         text,
  cedula           text,                              -- cédula profesional (podólogos)
  sedes            uuid[] not null default '{}',      -- vacío = todas las sedes de la clínica
  activo           boolean not null default true,
  ultimo_acceso    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.perfiles (organizacion_id, rol);

-- Personal de RANNIX (superadministrador): sin organización; solo lectura de la plataforma desde la función servidor.
create table piefirme.rannix_staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  created_at  timestamptz not null default now()
);

-- ───────────────────────────── funciones de seguridad (esquema app) ─────────────────────────────
create or replace function piefirme_app.org_id() returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select organizacion_id from piefirme.perfiles where id = auth.uid() and activo
$$;

create or replace function piefirme_app.rol() returns piefirme.rol_usuario
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select rol from piefirme.perfiles where id = auth.uid() and activo
$$;

create or replace function piefirme_app.es_admin() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select rol = 'administrador' from piefirme.perfiles where id = auth.uid() and activo), false)
$$;

create or replace function piefirme_app.es_rannix() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.rannix_staff where user_id = auth.uid())
$$;

-- ¿el usuario puede operar en esta sede? (sedes vacío = todas)
create or replace function piefirme_app.puede_sede(p_sede uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select cardinality(sedes) = 0 or p_sede = any(sedes) from piefirme.perfiles where id = auth.uid() and activo), false)
$$;

-- ¿la clínica está operativa? (suspendida/baja solo lectura: REGLAS_NEGOCIO)
create or replace function piefirme_app.org_activa() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select o.estado in ('prueba', 'activa') from piefirme.organizaciones o where o.id = piefirme_app.org_id()), false)
$$;

-- updated_at automático
create or replace function piefirme_app.tocar_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ───────────────────────────── bitácora general (accesos y cambios) ─────────────────────────────
create table piefirme.bitacora (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  usuario_id       uuid,
  sede_id          uuid,
  accion           text not null,                 -- insertar | actualizar | borrar | ver | imprimir | exportar | iniciar_sesion
  entidad          text not null,
  entidad_id       text,
  detalle          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index on piefirme.bitacora (organizacion_id, created_at desc);
create index on piefirme.bitacora (organizacion_id, entidad, entidad_id);

-- Trigger genérico: registra insert/update/delete de la tabla donde se cuelgue.
create or replace function piefirme_app.auditar() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_id text;
begin
  v_org := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'organizacion_id')::uuid, piefirme_app.org_id());
  v_id  := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id');
  if v_org is not null then
    insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
    values (v_org, auth.uid(),
            case tg_op when 'INSERT' then 'insertar' when 'UPDATE' then 'actualizar' else 'borrar' end,
            tg_table_name, v_id,
            case tg_op when 'INSERT' then jsonb_build_object('nuevo', to_jsonb(new))
                       when 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
                       else jsonb_build_object('antes', to_jsonb(old)) end);
  end if;
  return coalesce(new, old);
end $$;

-- Registro explícito de lecturas/impresiones desde la app (RPC)
create or replace function piefirme.registrar_bitacora(p_accion text, p_entidad text, p_entidad_id text, p_detalle jsonb default '{}'::jsonb, p_sede uuid default null)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
  values (piefirme_app.org_id(), auth.uid(), p_sede, p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb));
end $$;

-- ───────────────────────────── triggers updated_at ─────────────────────────────
create trigger t_upd before update on piefirme.organizaciones for each row execute function piefirme_app.tocar_updated_at();
create trigger t_upd before update on piefirme.sedes          for each row execute function piefirme_app.tocar_updated_at();
create trigger t_upd before update on piefirme.perfiles       for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.organizaciones enable row level security;
alter table piefirme.sedes          enable row level security;
alter table piefirme.cabinas        enable row level security;
alter table piefirme.perfiles       enable row level security;
alter table piefirme.rannix_staff   enable row level security;
alter table piefirme.bitacora       enable row level security;

create policy org_sel on piefirme.organizaciones for select to authenticated using (id = piefirme_app.org_id());
create policy org_upd on piefirme.organizaciones for update to authenticated using (id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (id = piefirme_app.org_id() and piefirme_app.es_admin());

create policy sedes_sel on piefirme.sedes for select to authenticated using (organizacion_id = piefirme_app.org_id());
create policy sedes_ins on piefirme.sedes for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy sedes_upd on piefirme.sedes for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id());
create policy sedes_del on piefirme.sedes for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());

create policy cab_sel on piefirme.cabinas for select to authenticated using (organizacion_id = piefirme_app.org_id());
create policy cab_ins on piefirme.cabinas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy cab_upd on piefirme.cabinas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id());
create policy cab_del on piefirme.cabinas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());

-- Cada usuario ve su propio perfil y el administrador ve los de su clínica. Altas/bajas de usuarios: función servidor (service_role).
create policy perf_sel on piefirme.perfiles for select to authenticated using (id = auth.uid() or (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) or organizacion_id = piefirme_app.org_id());
create policy perf_upd on piefirme.perfiles for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id());

-- rannix_staff: sin políticas para authenticated (solo service_role).

create policy bit_sel on piefirme.bitacora for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy bit_ins on piefirme.bitacora for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid());

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke all on function piefirme.registrar_bitacora(text, text, text, jsonb, uuid) from public, anon;
grant execute on function piefirme.registrar_bitacora(text, text, text, jsonb, uuid) to authenticated;

revoke all on all tables in schema piefirme from anon;
