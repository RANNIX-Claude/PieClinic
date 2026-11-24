-- 064 · V2 (app «podologia») · Base de personal: cargo, foto, «trabajando en» por día y movimientos de personal.
-- ADITIVA: no toca el enum rol_usuario, ni políticas, ni checks existentes. El rol de la base sigue siendo administrador|podologo|recepcion;
-- el CARGO (8 valores de la app) es un atributo más fino que vive en perfiles.cargo / empleados.cargo.
--   cargo        → rol de la base            sedes del perfil
--   direccion    → administrador             todas (sedes = '{}')
--   admin        → administrador             todas
--   gerente      → administrador             solo su sede (perfiles.sedes = [sede])
--   podologo     → podologo                  las sedes donde rota
--   recepcion    → recepcion
--   cajero       → recepcion
--   almacen      → recepcion  (empleados.puesto = 'apoyo')
--   asistente    → recepcion  (empleados.puesto = 'apoyo')
-- Depende de: 001, 040 (c_politicas), 050.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── cargo y foto ─────────────────────────────
alter table piefirme.perfiles  add column if not exists cargo text;
alter table piefirme.empleados add column if not exists cargo text;
alter table piefirme.empleados add column if not exists foto_path text;   -- ruta en el bucket pf-equipo: <organizacion_id>/fotos/<empleado_id>.jpg
do $$ begin
  alter table piefirme.perfiles add constraint perfiles_cargo_chk
    check (cargo is null or cargo in ('direccion', 'admin', 'gerente', 'almacen', 'cajero', 'recepcion', 'asistente', 'podologo'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.empleados add constraint empleados_cargo_chk
    check (cargo is null or cargo in ('direccion', 'admin', 'gerente', 'almacen', 'cajero', 'recepcion', 'asistente', 'podologo'));
exception when duplicate_object then null; end $$;
create index if not exists empleados_cargo_idx on piefirme.empleados (organizacion_id, cargo);

-- ───────────────────────────── «Trabajando en»: asignación por día ─────────────────────────────
create table piefirme.empleado_asignaciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  fecha            date not null,
  origen           text not null default 'programada' check (origen in ('programada', 'autoelegida', 'gerente', 'checador', 'sistema')),
  registrado_por   uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (empleado_id, fecha)
);
create index on piefirme.empleado_asignaciones (organizacion_id, sede_id, fecha);

-- ───────────────────────────── helpers de seguridad ─────────────────────────────
-- cargo efectivo de la sesión (si el perfil no tiene cargo, se deduce del rol)
create or replace function piefirme_app.cargo() returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(p.cargo, case p.rol when 'administrador' then 'admin' when 'podologo' then 'podologo' else 'recepcion' end)
    from piefirme.perfiles p where p.id = auth.uid() and p.activo
$$;

create or replace function piefirme_app.es_gerente() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select p.cargo = 'gerente' and p.rol = 'administrador' from piefirme.perfiles p where p.id = auth.uid() and p.activo), false)
$$;

-- fecha de hoy en la zona horaria de la clínica de la sesión
create or replace function piefirme_app.hoy() returns date
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select (now() at time zone coalesce((select o.zona_horaria from piefirme.organizaciones o where o.id = piefirme_app.org_id()), 'America/Mexico_City'))::date
$$;

-- sede donde trabaja HOY la sesión: la asignación del día; si no hay, la sede de contrato del empleado
create or replace function piefirme_app.sede_hoy() returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(
    (select a.sede_id from piefirme.empleado_asignaciones a where a.empleado_id = piefirme_app.empleado_id() and a.fecha = piefirme_app.hoy()),
    (select e.sede_id from piefirme.empleados e where e.id = piefirme_app.empleado_id()))
$$;

revoke all on function piefirme_app.cargo() from public, anon;
revoke all on function piefirme_app.es_gerente() from public, anon;
revoke all on function piefirme_app.hoy() from public, anon;
revoke all on function piefirme_app.sede_hoy() from public, anon;
grant execute on function piefirme_app.cargo(), piefirme_app.es_gerente(), piefirme_app.hoy(), piefirme_app.sede_hoy() to authenticated;

create or replace function piefirme_app.validar_asignacion() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from piefirme.empleados where id = new.empleado_id;
  if v_org is null then raise exception 'empleado inexistente'; end if;
  if new.organizacion_id is distinct from v_org then raise exception 'el empleado pertenece a otra clínica' using errcode = '42501'; end if;
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = v_org) then
    raise exception 'la sede pertenece a otra clínica' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_validar before insert or update on piefirme.empleado_asignaciones for each row execute function piefirme_app.validar_asignacion();

select piefirme_app.c_triggers('empleado_asignaciones', true);
select piefirme_app.c_politicas('empleado_asignaciones',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'],
  p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$(piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or empleado_id = piefirme_app.empleado_id()$c$,
  p_cond_ins => $c$(piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or (empleado_id = piefirme_app.empleado_id() and piefirme_app.puede_sede(sede_id))$c$,
  p_cond_upd => $c$(piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or (empleado_id = piefirme_app.empleado_id() and fecha >= piefirme_app.hoy() and piefirme_app.puede_sede(sede_id))$c$,
  p_cond_del => $c$piefirme_app.puede_sede(sede_id)$c$);

-- elegir (o cambiar) la sede donde se trabaja hoy; la persona solo puede hacerlo para sí misma (lo impone RLS)
create or replace function piefirme.elegir_sede_hoy(p_sede uuid) returns piefirme.empleado_asignaciones
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_emp uuid := piefirme_app.empleado_id(); v_row piefirme.empleado_asignaciones;
begin
  if v_emp is null then raise exception 'La sesión no está ligada a un empleado' using errcode = 'PF403'; end if;
  insert into piefirme.empleado_asignaciones (organizacion_id, empleado_id, sede_id, fecha, origen)
  values (piefirme_app.org_id(), v_emp, p_sede, piefirme_app.hoy(), 'autoelegida')
  on conflict (empleado_id, fecha) do update set sede_id = excluded.sede_id, origen = 'autoelegida', registrado_por = auth.uid()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function piefirme.elegir_sede_hoy(uuid) from public, anon;
grant execute on function piefirme.elegir_sede_hoy(uuid) to authenticated;

-- ───────────────────────────── movimientos de personal ─────────────────────────────
create table piefirme.empleado_movimientos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  tipo             text not null check (tipo in ('alta', 'baja', 'cambio_sede', 'cambio_puesto')),
  fecha            date not null default current_date,
  sede_origen_id   uuid references piefirme.sedes(id),
  sede_destino_id  uuid references piefirme.sedes(id),
  motivo           text,
  detalle          jsonb not null default '{}'::jsonb,       -- {puesto_anterior, puesto_nuevo, cargo_anterior, cargo_nuevo, …}
  registrado_por   uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index on piefirme.empleado_movimientos (organizacion_id, empleado_id, fecha desc);
create index on piefirme.empleado_movimientos (organizacion_id, tipo, fecha desc);

create or replace function piefirme_app.validar_movimiento() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from piefirme.empleados where id = new.empleado_id;
  if v_org is null then raise exception 'empleado inexistente'; end if;
  if new.organizacion_id is distinct from v_org then raise exception 'el empleado pertenece a otra clínica' using errcode = '42501'; end if;
  return new;
end $$;
create trigger t_validar before insert on piefirme.empleado_movimientos for each row execute function piefirme_app.validar_movimiento();
select piefirme_app.c_triggers('empleado_movimientos', true);
select piefirme_app.c_politicas('empleado_movimientos',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[], p_sede => 'no',
  p_cond_ver => $c$empleado_id = piefirme_app.empleado_id() or (piefirme_app.es_admin() and (sede_destino_id is null and sede_origen_id is null or piefirme_app.puede_sede(coalesce(sede_destino_id, sede_origen_id))))$c$,
  p_cond_ins => $c$sede_destino_id is null and sede_origen_id is null or piefirme_app.puede_sede(coalesce(sede_destino_id, sede_origen_id))$c$,
  p_cond_upd => $c$sede_destino_id is null and sede_origen_id is null or piefirme_app.puede_sede(coalesce(sede_destino_id, sede_origen_id))$c$);

-- alta / baja / cambio de sede o de puesto de un empleado → renglón automático de movimiento
create or replace function piefirme_app.registrar_movimiento_empleado() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into piefirme.empleado_movimientos (organizacion_id, empleado_id, tipo, fecha, sede_destino_id, motivo, detalle)
    values (new.organizacion_id, new.id, 'alta', coalesce(new.fecha_ingreso, current_date), new.sede_id, 'Alta del empleado',
            jsonb_build_object('puesto_nuevo', new.puesto, 'cargo_nuevo', new.cargo));
    return null;
  end if;
  if new.estado = 'baja' and old.estado is distinct from 'baja' then
    insert into piefirme.empleado_movimientos (organizacion_id, empleado_id, tipo, fecha, sede_origen_id, motivo)
    values (new.organizacion_id, new.id, 'baja', coalesce(new.fecha_baja, current_date), new.sede_id, new.motivo_baja);
  end if;
  if new.sede_id is distinct from old.sede_id then
    insert into piefirme.empleado_movimientos (organizacion_id, empleado_id, tipo, sede_origen_id, sede_destino_id, motivo)
    values (new.organizacion_id, new.id, 'cambio_sede', old.sede_id, new.sede_id, 'Cambio de sede de contrato');
  end if;
  if new.puesto is distinct from old.puesto then
    insert into piefirme.empleado_movimientos (organizacion_id, empleado_id, tipo, sede_origen_id, motivo, detalle)
    values (new.organizacion_id, new.id, 'cambio_puesto', new.sede_id, 'Cambio de puesto o cargo',
            jsonb_build_object('puesto_anterior', old.puesto, 'puesto_nuevo', new.puesto, 'cargo_anterior', old.cargo, 'cargo_nuevo', new.cargo));
  end if;
  return null;
end $$;
create trigger t_movimiento after insert or update of estado, sede_id, puesto on piefirme.empleados
  for each row execute function piefirme_app.registrar_movimiento_empleado();

-- ───────────────────────────── directorio mínimo del equipo (para roles no administradores) ─────────────────────────────
-- empleados completos (sueldo, RFC, CLABE…) solo los ve el administrador; el resto ve nombre, foto, cargo y dónde trabaja hoy.
create or replace function piefirme.equipo_directorio()
returns table (empleado_id uuid, perfil_id uuid, organizacion_id uuid, nombre_completo text, foto_path text, cargo text, puesto text,
               sede_base_id uuid, sede_hoy_id uuid, estado text)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select e.id, e.perfil_id, e.organizacion_id, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)), e.foto_path,
         coalesce(e.cargo, case e.puesto when 'podologo' then 'podologo' when 'recepcion' then 'recepcion' when 'administrador' then 'admin' else 'asistente' end),
         e.puesto, e.sede_id,
         coalesce((select a.sede_id from piefirme.empleado_asignaciones a where a.empleado_id = e.id and a.fecha = piefirme_app.hoy()), e.sede_id),
         e.estado
    from piefirme.empleados e
   where e.organizacion_id = piefirme_app.org_id() and e.estado <> 'baja'
$$;
revoke all on function piefirme.equipo_directorio() from public, anon;
grant execute on function piefirme.equipo_directorio() to authenticated;
