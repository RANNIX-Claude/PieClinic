-- 051 · EQUIPO Y PLATAFORMA (D) · Checadas, asistencia consolidada, incidencias, vacaciones y reclutamiento.
-- Clona de IRP: rh_checadas + fn_consolidar_dia_asistencia, rh_asistencia, rh_tipos_incidencia, rh_incidencias,
--   rh_vacaciones_anio / rh_vacaciones_detalle + fn_recalcular_vacaciones_anio, TabReclutamiento, ImportChecadorModal.
-- Depende de: 001, 050 (empleados, horarios_laborales).
-- Reglas: P-105 (asistencia por importación del checador), P-110 (vacaciones 12 días 1.er año; qué incidencia descuenta, parámetros),
--   P-047 (vacaciones autorizadas bloquean agenda: vista prp_vacaciones_bloqueos para el dominio de agenda).
-- Parámetros leídos de organizaciones.parametros: rh.tolerancia_retardo_min (5), rh.retardo_umbral_min (10), vacaciones_dias_primer_anio (12).
-- Entidades: E124 Registro de asistencia, E126 Incidencia de RH, E127 Vacaciones, E128 Reclutamiento.

-- ───────────────────────────── tipos de incidencia (catálogo por clínica) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.tipos_incidencia_rh (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null,
  descripcion      text not null,
  descuenta        boolean not null default false,       -- ¿descuenta en nómina? (P-110: retardo no, permiso sin goce sí, incapacidad según ley)
  requiere_monto   boolean not null default false,
  orden            integer not null default 99,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create trigger t_upd before update on piefirme.tipos_incidencia_rh for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.tipos_incidencia_rh for each row execute function piefirme_app.auditar();

create or replace function piefirme_app.sembrar_rh(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.tipos_incidencia_rh (organizacion_id, clave, descripcion, descuenta, requiere_monto, orden) values
    (p_org, 'inasistencia',     'Inasistencia',      true,  false, 1),
    (p_org, 'retardo',          'Retardo',           false, false, 2),
    (p_org, 'permiso_sin_goce', 'Permiso sin goce',  true,  false, 3),
    (p_org, 'permiso_con_goce', 'Permiso con goce',  false, false, 4),
    (p_org, 'vacaciones',       'Vacaciones',        false, true,  5),
    (p_org, 'incapacidad',      'Incapacidad',       false, false, 6),
    (p_org, 'dia_festivo',      'Día festivo',       false, true,  7),
    (p_org, 'prima_vacacional', 'Prima vacacional',  false, true,  8)
  on conflict (organizacion_id, clave) do nothing;
end $$;

create or replace function piefirme_app.t_sembrar_rh() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin perform piefirme_app.sembrar_rh(new.id); return new; end $$;
create trigger t_sembrar_rh after insert on piefirme.organizaciones for each row execute function piefirme_app.t_sembrar_rh();
select piefirme_app.sembrar_rh(id) from piefirme.organizaciones;

-- ───────────────────────────── checadas (marcaje individual) ─────────────────────────────
create table piefirme.checadas (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id              uuid not null references piefirme.sedes(id),
  empleado_id          uuid references piefirme.empleados(id) on delete cascade,
  numero_empleado_ext  text,                                     -- número tal como viene del checador (marcajes sin empleado asignado)
  operacion            text not null check (operacion in ('entrada', 'salida')),
  fecha_hora           timestamptz not null,
  fecha                date not null,                            -- día local de la clínica (lo fija el trigger)
  origen               text not null default 'manual' check (origen in ('checador', 'app', 'importacion', 'manual')),
  importacion_id       uuid,                                     -- FK a importaciones se agrega en 054
  notas                text,
  created_at           timestamptz not null default now(),
  check (empleado_id is not null or numero_empleado_ext is not null)
);
-- idempotencia de la importación: cargar dos veces el mismo archivo no duplica
create unique index checadas_unica on piefirme.checadas (organizacion_id, empleado_id, fecha_hora, operacion);
create index on piefirme.checadas (organizacion_id, sede_id, fecha);
create index on piefirme.checadas (empleado_id, fecha);

create or replace function piefirme_app.checada_fecha_local() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_tz text;
begin
  select zona_horaria into v_tz from piefirme.organizaciones where id = new.organizacion_id;
  new.fecha := (new.fecha_hora at time zone coalesce(v_tz, 'America/Mexico_City'))::date;
  return new;
end $$;
create trigger t_fecha before insert or update of fecha_hora on piefirme.checadas for each row execute function piefirme_app.checada_fecha_local();

-- ───────────────────────────── asistencia (consolidación diaria) ─────────────────────────────
create table piefirme.asistencia (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid not null references piefirme.sedes(id),
  empleado_id         uuid not null references piefirme.empleados(id) on delete cascade,
  fecha               date not null,
  hora_entrada        timestamptz,
  hora_salida         timestamptz,
  minutos_trabajados  integer,
  minutos_retardo     integer not null default 0,
  estado              text not null check (estado in ('presente', 'retardo', 'falta', 'justificada', 'descanso', 'sin_entrada')),
  fuente              text not null default 'checadas' check (fuente in ('checadas', 'manual', 'importacion')),
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (empleado_id, fecha)
);
create index on piefirme.asistencia (organizacion_id, sede_id, fecha);
create trigger t_upd before update on piefirme.asistencia for each row execute function piefirme_app.tocar_updated_at();

-- primera entrada y última salida del día; retardo contra el horario del empleado (09:00 si no hay)
create or replace function piefirme_app.consolidar_asistencia() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_emp uuid; v_fecha date; v_org uuid; v_tz text; v_tol int; v_umb int;
  v_ent timestamptz; v_sal timestamptz; v_sede uuid; v_ref time; v_ret int := 0; v_min int; v_est text;
begin
  v_emp := coalesce(new.empleado_id, old.empleado_id);
  v_fecha := coalesce(new.fecha, old.fecha);
  v_org := coalesce(new.organizacion_id, old.organizacion_id);
  if v_emp is null then return null; end if;

  select zona_horaria,
         coalesce((parametros #>> '{rh,tolerancia_retardo_min}')::int, 5),
         coalesce((parametros #>> '{rh,retardo_umbral_min}')::int, 10)
    into v_tz, v_tol, v_umb from piefirme.organizaciones where id = v_org;
  v_tz := coalesce(v_tz, 'America/Mexico_City');

  select min(fecha_hora) filter (where operacion = 'entrada'),
         max(fecha_hora) filter (where operacion = 'salida'),
         (array_agg(sede_id order by fecha_hora))[1]
    into v_ent, v_sal, v_sede
    from piefirme.checadas where empleado_id = v_emp and fecha = v_fecha;

  if v_ent is null and v_sal is null then
    delete from piefirme.asistencia where empleado_id = v_emp and fecha = v_fecha and fuente = 'checadas';
    return null;
  end if;

  select h.entrada into v_ref from piefirme.horarios_laborales h
   where h.empleado_id = v_emp and h.activo and h.dia_semana = extract(isodow from v_fecha)::int
     and h.vigente_desde <= v_fecha and (h.vigente_hasta is null or h.vigente_hasta >= v_fecha)
   order by h.vigente_desde desc limit 1;
  v_ref := coalesce(v_ref, '09:00'::time);

  if v_ent is not null then
    v_ret := greatest(0, floor(extract(epoch from ((v_ent at time zone v_tz)::time - v_ref)) / 60)::int);
    if v_ret <= v_tol then v_ret := 0; end if;
  end if;
  if v_ent is not null and v_sal is not null and v_sal > v_ent then
    v_min := (extract(epoch from (v_sal - v_ent)) / 60)::int;
  end if;
  v_est := case when v_ent is null then 'sin_entrada' when v_ret > v_umb then 'retardo' else 'presente' end;
  v_sede := coalesce(v_sede, (select sede_id from piefirme.empleados where id = v_emp));

  insert into piefirme.asistencia (organizacion_id, sede_id, empleado_id, fecha, hora_entrada, hora_salida, minutos_trabajados, minutos_retardo, estado, fuente)
  values (v_org, v_sede, v_emp, v_fecha, v_ent, v_sal, v_min, v_ret, v_est, 'checadas')
  on conflict (empleado_id, fecha) do update set
    sede_id = excluded.sede_id, hora_entrada = excluded.hora_entrada, hora_salida = excluded.hora_salida,
    minutos_trabajados = excluded.minutos_trabajados, minutos_retardo = excluded.minutos_retardo,
    estado = excluded.estado, fuente = excluded.fuente
  where piefirme.asistencia.fuente <> 'manual';
  return null;
end $$;
create trigger t_consolida after insert or update or delete on piefirme.checadas for each row execute function piefirme_app.consolidar_asistencia();

-- ───────────────────────────── incidencias de RH ─────────────────────────────
create table piefirme.incidencias_rh (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  tipo_id          uuid not null references piefirme.tipos_incidencia_rh(id),
  fecha            date not null,
  fecha_fin        date,
  descuenta        boolean,                                -- si es null se toma del tipo (trigger)
  monto            numeric(14,2),
  motivo           text,
  estado           text not null default 'registrada' check (estado in ('registrada', 'aplicada', 'anulada')),
  registrada_por   uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha),
  unique (empleado_id, fecha, tipo_id)
);
create index on piefirme.incidencias_rh (organizacion_id, sede_id, fecha);

create or replace function piefirme_app.incidencia_defaults() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_desc boolean;
begin
  if not exists (select 1 from piefirme.tipos_incidencia_rh t where t.id = new.tipo_id and t.organizacion_id = new.organizacion_id) then
    raise exception 'Tipo de incidencia de otra clínica';
  end if;
  if new.fecha_fin is null then new.fecha_fin := new.fecha; end if;
  if new.descuenta is null then
    select descuenta into v_desc from piefirme.tipos_incidencia_rh where id = new.tipo_id;
    new.descuenta := coalesce(v_desc, false);
  end if;
  return new;
end $$;
create trigger t_defaults before insert or update on piefirme.incidencias_rh for each row execute function piefirme_app.incidencia_defaults();
create trigger t_upd before update on piefirme.incidencias_rh for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.incidencias_rh for each row execute function piefirme_app.auditar();

-- ───────────────────────────── vacaciones ─────────────────────────────
-- Días de ley por año de servicio: n=1 → parámetro (12); +2 por año hasta n=5; luego +2 cada 5 años. Validar con asesoría laboral (P-110).
create or replace function piefirme.vacaciones_dias_ley(p_anios_servicio integer, p_primer_anio integer default 12)
returns integer language sql immutable as $$
  select case when p_anios_servicio <= 1 then p_primer_anio
              when p_anios_servicio <= 5 then p_primer_anio + 2 * (p_anios_servicio - 1)
              else p_primer_anio + 8 + 2 * ceil((p_anios_servicio - 5) / 5.0)::int end
$$;

create table piefirme.vacaciones_anio (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  empleado_id       uuid not null references piefirme.empleados(id) on delete cascade,
  anio              integer not null,
  dias_derecho      numeric(5,1) not null default 12 check (dias_derecho >= 0),
  dias_tomados      numeric(5,1) not null default 0,
  dias_disponibles  numeric(5,1) generated always as (dias_derecho - dias_tomados) stored,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (empleado_id, anio)
);
create index on piefirme.vacaciones_anio (organizacion_id, anio);
create trigger t_upd before update on piefirme.vacaciones_anio for each row execute function piefirme_app.tocar_updated_at();

create table piefirme.vacaciones_detalle (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  anio             integer not null,
  fecha_inicio     date not null,
  fecha_fin        date not null,
  dias             numeric(5,1) not null check (dias > 0),
  monto            numeric(14,2),
  prima            numeric(14,2),
  estado           text not null default 'solicitada' check (estado in ('solicitada', 'autorizada', 'tomada', 'cancelada')),
  autorizada_por   uuid,
  notas            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);
create index on piefirme.vacaciones_detalle (organizacion_id, sede_id, fecha_inicio);
create index on piefirme.vacaciones_detalle (empleado_id, anio);
create trigger t_upd before update on piefirme.vacaciones_detalle for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.vacaciones_detalle for each row execute function piefirme_app.auditar();

-- los días tomados son la suma del detalle autorizado/tomado, nunca un número capturado aparte
create or replace function piefirme_app.recalcular_vacaciones_anio() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_emp uuid; v_anio int; v_org uuid; v_primer int; v_ing date;
begin
  v_emp := coalesce(new.empleado_id, old.empleado_id);
  v_anio := coalesce(new.anio, old.anio);
  v_org := coalesce(new.organizacion_id, old.organizacion_id);
  select coalesce((parametros ->> 'vacaciones_dias_primer_anio')::int, 12) into v_primer from piefirme.organizaciones where id = v_org;
  select fecha_ingreso into v_ing from piefirme.empleados where id = v_emp;
  insert into piefirme.vacaciones_anio (organizacion_id, empleado_id, anio, dias_derecho)
  values (v_org, v_emp, v_anio,
          piefirme.vacaciones_dias_ley(greatest(1, v_anio - coalesce(extract(year from v_ing)::int, v_anio - 1)), coalesce(v_primer, 12)))
  on conflict (empleado_id, anio) do nothing;
  update piefirme.vacaciones_anio a
     set dias_tomados = coalesce((select sum(d.dias) from piefirme.vacaciones_detalle d
                                   where d.empleado_id = v_emp and d.anio = v_anio and d.estado in ('autorizada', 'tomada')), 0)
   where a.empleado_id = v_emp and a.anio = v_anio;
  return null;
end $$;
create trigger t_recalcula after insert or update or delete on piefirme.vacaciones_detalle for each row execute function piefirme_app.recalcular_vacaciones_anio();

-- ───────────────────────────── reclutamiento (E128) ─────────────────────────────
create table piefirme.vacantes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  puesto           text not null check (puesto in ('podologo', 'recepcion', 'apoyo', 'administrador', 'otro')),
  titulo           text not null,
  descripcion      text,
  estado           text not null default 'abierta' check (estado in ('abierta', 'en_proceso', 'cubierta', 'cancelada')),
  fecha_apertura   date not null default current_date,
  fecha_cierre     date,
  responsable_id   uuid references piefirme.perfiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.vacantes (organizacion_id, sede_id, estado);
create trigger t_upd before update on piefirme.vacantes for each row execute function piefirme_app.tocar_updated_at();

create table piefirme.candidatos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  vacante_id       uuid not null references piefirme.vacantes(id) on delete cascade,
  nombre           text not null,
  email            text,
  telefono         text,
  etapa            text not null default 'recibido' check (etapa in ('recibido', 'entrevista', 'prueba', 'oferta', 'contratado', 'descartado')),
  cv_path          text,                                   -- bucket pf-documentos: <organizacion_id>/rh/candidatos/…
  notas            text,
  empleado_id      uuid references piefirme.empleados(id) on delete set null,   -- al contratar
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.candidatos (organizacion_id, vacante_id);
create trigger t_upd before update on piefirme.candidatos for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.candidatos for each row execute function piefirme_app.auditar();

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.tipos_incidencia_rh enable row level security;
alter table piefirme.checadas            enable row level security;
alter table piefirme.asistencia          enable row level security;
alter table piefirme.incidencias_rh      enable row level security;
alter table piefirme.vacaciones_anio     enable row level security;
alter table piefirme.vacaciones_detalle  enable row level security;
alter table piefirme.vacantes            enable row level security;
alter table piefirme.candidatos          enable row level security;

-- catálogo de tipos de incidencia: lo lee toda la clínica, lo edita Administración
create policy tinc_sel on piefirme.tipos_incidencia_rh for select to authenticated using (organizacion_id = piefirme_app.org_id());
create policy tinc_ins on piefirme.tipos_incidencia_rh for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy tinc_upd on piefirme.tipos_incidencia_rh for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy tinc_del on piefirme.tipos_incidencia_rh for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- checadas / asistencia: Admin por sede; cada quien ve lo suyo
create policy chk_sel on piefirme.checadas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or empleado_id = piefirme_app.empleado_id()));
create policy chk_ins on piefirme.checadas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy chk_upd on piefirme.checadas for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy chk_del on piefirme.checadas for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

create policy asi_sel on piefirme.asistencia for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or empleado_id = piefirme_app.empleado_id()));
create policy asi_ins on piefirme.asistencia for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy asi_upd on piefirme.asistencia for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy asi_del on piefirme.asistencia for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

create policy inc_sel on piefirme.incidencias_rh for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or empleado_id = piefirme_app.empleado_id()));
create policy inc_ins on piefirme.incidencias_rh for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy inc_upd on piefirme.incidencias_rh for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy inc_del on piefirme.incidencias_rh for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

create policy vac_sel on piefirme.vacaciones_anio for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id()));
create policy vac_ins on piefirme.vacaciones_anio for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy vac_upd on piefirme.vacaciones_anio for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin())
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy vac_del on piefirme.vacaciones_anio for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy vacd_sel on piefirme.vacaciones_detalle for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or empleado_id = piefirme_app.empleado_id()));
create policy vacd_ins on piefirme.vacaciones_detalle for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy vacd_upd on piefirme.vacaciones_detalle for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy vacd_del on piefirme.vacaciones_detalle for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

create policy vcn_sel on piefirme.vacantes for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id));
create policy vcn_ins on piefirme.vacantes for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy vcn_upd on piefirme.vacantes for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy vcn_del on piefirme.vacantes for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

create policy can_sel on piefirme.candidatos for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy can_ins on piefirme.candidatos for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy can_upd on piefirme.candidatos for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy can_del on piefirme.candidatos for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_checadas with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, c.empleado_id, c.operacion, c.fecha_hora, c.fecha, c.origen, c.notas,
       coalesce(e.numero_empleado, c.numero_empleado_ext) as numero_empleado,
       coalesce(trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)), '(sin empleado)') as nombre_completo
  from piefirme.checadas c
  left join piefirme.empleados e on e.id = c.empleado_id;

create or replace view piefirme.prp_asistencia with (security_invoker = true) as
select a.id, a.organizacion_id, a.sede_id, a.empleado_id, a.fecha, a.hora_entrada, a.hora_salida,
       a.minutos_trabajados, round(coalesce(a.minutos_trabajados, 0) / 60.0, 2) as horas,
       a.minutos_retardo, a.estado, a.fuente, a.notas,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo, e.puesto
  from piefirme.asistencia a
  join piefirme.empleados e on e.id = a.empleado_id;

-- reporte semanal (semana ISO: lunes a domingo)
create or replace view piefirme.prp_asistencia_semana with (security_invoker = true) as
select a.organizacion_id, a.sede_id, a.empleado_id,
       date_trunc('week', a.fecha)::date as semana_inicio,
       a.fecha, extract(isodow from a.fecha)::int as dia_semana,
       a.hora_entrada, a.hora_salida, a.estado, a.minutos_retardo
  from piefirme.asistencia a;

create or replace view piefirme.prp_asistencia_resumen_mes with (security_invoker = true) as
select a.organizacion_id, a.sede_id, a.empleado_id, date_trunc('month', a.fecha)::date as mes,
       count(*) filter (where a.estado in ('presente', 'retardo', 'justificada')) as dias_asistidos,
       count(*) filter (where a.estado = 'retardo') as retardos,
       coalesce(sum(a.minutos_retardo), 0) as minutos_retardo,
       round(coalesce(sum(a.minutos_trabajados), 0) / 60.0, 1) as horas_trabajadas
  from piefirme.asistencia a
 group by 1, 2, 3, 4;

create or replace view piefirme.prp_tipos_incidencia with (security_invoker = true) as
select id, organizacion_id, clave, descripcion, descuenta, requiere_monto, orden, activo
  from piefirme.tipos_incidencia_rh where activo;

create or replace view piefirme.prp_incidencias_rh with (security_invoker = true) as
select i.id, i.organizacion_id, i.sede_id, i.empleado_id, i.tipo_id, t.clave as tipo_clave, t.descripcion as tipo,
       i.fecha, i.fecha_fin, (i.fecha_fin - i.fecha + 1) as dias, i.descuenta, i.monto, i.motivo, i.estado,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.incidencias_rh i
  join piefirme.tipos_incidencia_rh t on t.id = i.tipo_id
  join piefirme.empleados e on e.id = i.empleado_id;

create or replace view piefirme.prp_vacaciones_anio with (security_invoker = true) as
select a.id, a.organizacion_id, a.empleado_id, a.anio, a.dias_derecho, a.dias_tomados, a.dias_disponibles, a.notas,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.vacaciones_anio a
  join piefirme.empleados e on e.id = a.empleado_id;

create or replace view piefirme.prp_vacaciones_detalle with (security_invoker = true) as
select d.id, d.organizacion_id, d.sede_id, d.empleado_id, d.anio, d.fecha_inicio, d.fecha_fin, d.dias, d.monto, d.prima, d.estado, d.notas,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.vacaciones_detalle d
  join piefirme.empleados e on e.id = d.empleado_id;

-- Para el dominio de agenda (P-047): vacaciones autorizadas/tomadas del personal con sesión (podólogos) = bloqueo de agenda
create or replace view piefirme.prp_vacaciones_bloqueos with (security_invoker = true) as
select d.id, d.organizacion_id, d.sede_id, e.perfil_id as podologo_id, d.empleado_id, d.fecha_inicio, d.fecha_fin, d.estado
  from piefirme.vacaciones_detalle d
  join piefirme.empleados e on e.id = d.empleado_id
 where d.estado in ('autorizada', 'tomada') and e.perfil_id is not null;

create or replace view piefirme.prp_vacantes with (security_invoker = true) as
select v.id, v.organizacion_id, v.sede_id, v.puesto, v.titulo, v.descripcion, v.estado, v.fecha_apertura, v.fecha_cierre,
       (select count(*) from piefirme.candidatos c where c.vacante_id = v.id) as candidatos,
       (select count(*) from piefirme.candidatos c where c.vacante_id = v.id and c.etapa not in ('contratado', 'descartado')) as candidatos_activos
  from piefirme.vacantes v;

-- ───────────────────────────── RPC: importar checadas del reloj (IRP ImportChecadorModal) ─────────────────────────────
-- p_filas: [{"numero_empleado":"E001","fecha_hora":"2026-10-05T08:52:00-06:00","operacion":"entrada"}, …]
-- Marcajes sin empleado conocido se guardan con numero_empleado_ext para asignarlos después. Reimportar el mismo archivo no duplica.
create or replace function piefirme.rh_importar_checadas(p_sede uuid, p_filas jsonb, p_importacion uuid default null)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); r jsonb; v_emp uuid; v_ins int := 0; v_sin int := 0; v_dup int := 0; n int;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración puede importar checadas'; end if;
  if not exists (select 1 from piefirme.sedes where id = p_sede and organizacion_id = v_org) or not piefirme_app.puede_sede(p_sede) then
    raise exception 'Sede no permitida';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    select id into v_emp from piefirme.empleados where organizacion_id = v_org and numero_empleado = r ->> 'numero_empleado';
    if v_emp is null then v_sin := v_sin + 1; end if;
    insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, numero_empleado_ext, operacion, fecha_hora, origen, importacion_id)
    values (v_org, p_sede, v_emp, r ->> 'numero_empleado', lower(r ->> 'operacion'), (r ->> 'fecha_hora')::timestamptz, 'importacion', p_importacion)
    on conflict (organizacion_id, empleado_id, fecha_hora, operacion) do nothing;
    get diagnostics n = row_count;
    if n = 1 then v_ins := v_ins + 1; else v_dup := v_dup + 1; end if;
  end loop;
  perform piefirme.registrar_bitacora('importar', 'checadas', p_importacion::text, jsonb_build_object('insertadas', v_ins, 'sin_empleado', v_sin, 'repetidas', v_dup), p_sede);
  return jsonb_build_object('insertadas', v_ins, 'sin_empleado', v_sin, 'repetidas', v_dup);
end $$;

-- Genera (si no existe) el renglón de vacaciones del año con los días de ley según antigüedad
create or replace function piefirme.vacaciones_generar_anio(p_empleado uuid, p_anio integer)
returns piefirme.vacaciones_anio language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_emp piefirme.empleados; v_primer int; v_row piefirme.vacaciones_anio;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  select * into v_emp from piefirme.empleados where id = p_empleado and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'Empleado no encontrado'; end if;
  select coalesce((parametros ->> 'vacaciones_dias_primer_anio')::int, 12) into v_primer from piefirme.organizaciones where id = v_emp.organizacion_id;
  insert into piefirme.vacaciones_anio (organizacion_id, empleado_id, anio, dias_derecho)
  values (v_emp.organizacion_id, p_empleado, p_anio,
          piefirme.vacaciones_dias_ley(greatest(1, p_anio - coalesce(extract(year from v_emp.fecha_ingreso)::int, p_anio - 1)), coalesce(v_primer, 12)))
  on conflict (empleado_id, anio) do update set updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

revoke all on function piefirme.rh_importar_checadas(uuid, jsonb, uuid) from public, anon;
revoke all on function piefirme.vacaciones_generar_anio(uuid, integer) from public, anon;
grant execute on function piefirme.rh_importar_checadas(uuid, jsonb, uuid) to authenticated;
grant execute on function piefirme.vacaciones_generar_anio(uuid, integer) to authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.sembrar_rh(uuid), piefirme_app.t_sembrar_rh(), piefirme_app.checada_fecha_local(), piefirme_app.consolidar_asistencia(),
  piefirme_app.incidencia_defaults(), piefirme_app.recalcular_vacaciones_anio() from authenticated;
