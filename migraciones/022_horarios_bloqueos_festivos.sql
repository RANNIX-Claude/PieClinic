-- 022 · Agenda: horarios de atención (sede y podólogo), bloqueos (comida, vacaciones, capacitación…) y festivos.
-- Reglas: P-043, P-046, P-047. MATRIZ_ROLES 4.1: el podólogo edita su propio horario; Recepción ve; Administrador gestiona todo.
-- Dependencias: 001 (sedes, cabinas, perfiles), 020 (helpers).

-- ───────────────────────────── horarios de atención ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.horarios_atencion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  podologo_id      uuid references piefirme.perfiles(id) on delete cascade,   -- null = horario de la sede
  dia_semana       smallint not null check (dia_semana between 1 and 7),    -- ISO: 1 = lunes … 7 = domingo
  hora_inicio      time not null,
  hora_fin         time not null,
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (hora_fin > hora_inicio),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index on piefirme.horarios_atencion (organizacion_id, sede_id, podologo_id, dia_semana) where activo;

-- ───────────────────────────── bloqueos de agenda (E07) ─────────────────────────────
create table piefirme.bloqueos_agenda (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  ambito           text not null check (ambito in ('sede', 'podologo', 'cabina')),
  podologo_id      uuid references piefirme.perfiles(id) on delete cascade,
  cabina_id        uuid references piefirme.cabinas(id) on delete cascade,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  tipo             text not null default 'otro' check (tipo in ('comida', 'festivo', 'vacaciones', 'capacitacion', 'mantenimiento', 'otro')),
  motivo           text,
  estado           text not null default 'autorizado' check (estado in ('solicitado', 'autorizado', 'rechazado', 'cancelado')),
  solicitado_por   uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  autorizado_por   uuid references piefirme.perfiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (fin > inicio),
  check ((ambito = 'sede') or (ambito = 'podologo' and podologo_id is not null) or (ambito = 'cabina' and cabina_id is not null))
);
create index on piefirme.bloqueos_agenda (organizacion_id, sede_id, inicio, fin) where estado = 'autorizado';
create index on piefirme.bloqueos_agenda (organizacion_id, podologo_id, inicio) where estado = 'autorizado';

-- Quien no es administrador solo solicita vacaciones; autorizar/rechazar es del Administrador (P-047).
create or replace function piefirme_app.bloqueo_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if auth.uid() is null or piefirme_app.es_admin() then
    if new.estado = 'autorizado' and (tg_op = 'INSERT' or old.estado is distinct from 'autorizado') and new.autorizado_por is null then
      new.autorizado_por := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.estado := case when new.tipo = 'vacaciones' then 'solicitado' else 'autorizado' end;
    new.solicitado_por := auth.uid();
    if new.ambito = 'podologo' and new.podologo_id is distinct from auth.uid() and piefirme_app.rol() = 'podologo' then
      raise exception 'un podólogo solo bloquea su propia agenda' using errcode = 'PF403';
    end if;
  elsif new.estado is distinct from old.estado and new.estado not in ('cancelado') then
    raise exception 'solo el administrador autoriza o rechaza bloqueos' using errcode = 'PF403';
  end if;
  return new;
end $$;
create trigger t_bloqueo_bi before insert or update on piefirme.bloqueos_agenda for each row execute function piefirme_app.bloqueo_bi();

-- ───────────────────────────── festivos (por clínica o por sede) ─────────────────────────────
create table piefirme.festivos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id) on delete cascade,   -- null = todas las sedes
  fecha            date not null,
  nombre           text not null,
  abre             boolean not null default false,                       -- true = la sede abre ese día pese al festivo
  created_at       timestamptz not null default now()
);
create unique index festivos_unico on piefirme.festivos (organizacion_id, fecha, (coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)));

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.crear_politicas('horarios_atencion', null, array['administrador', 'podologo'], array['administrador', 'podologo'], 'si',
                           $c$ piefirme_app.rol() = 'administrador' or podologo_id = auth.uid() $c$);
select piefirme_app.crear_politicas('bloqueos_agenda', null, array['administrador', 'podologo'], array['administrador'], 'si',
                           $c$ piefirme_app.rol() = 'administrador' or podologo_id = auth.uid() $c$);
select piefirme_app.crear_politicas('festivos', null, array['administrador'], array['administrador'], 'nula');
select piefirme_app.b_triggers('horarios_atencion');
select piefirme_app.b_triggers('bloqueos_agenda');
select piefirme_app.b_triggers('festivos', false);

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_horarios_atencion with (security_invoker = true) as
select h.*, s.nombre as sede_nombre, p.nombre as podologo_nombre, p.apellidos as podologo_apellidos
  from piefirme.horarios_atencion h
  join piefirme.sedes s on s.id = h.sede_id
  left join piefirme.perfiles p on p.id = h.podologo_id;

create or replace view piefirme.prp_bloqueos_agenda with (security_invoker = true) as
select b.*, s.nombre as sede_nombre, p.nombre as podologo_nombre, c.nombre as cabina_nombre
  from piefirme.bloqueos_agenda b
  join piefirme.sedes s on s.id = b.sede_id
  left join piefirme.perfiles p on p.id = b.podologo_id
  left join piefirme.cabinas c on c.id = b.cabina_id;
