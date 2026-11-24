-- 050 · EQUIPO Y PLATAFORMA (D) · Empleados, historial de sueldo, horarios laborales y expediente de empleado.
-- Clona de IRP: rh_empleados (+ datos completos, tipo de contratación, bono), rh_historial_sueldo, expediente de empleado.
-- Depende de: 001 (organizaciones, sedes, perfiles, helpers app.*, bitácora).
-- Reglas: P-103 (nómina u honorarios por persona), P-109 (nómina a la sede de contrato), MATRIZ_ROLES 4.5
--   (Admin V C E; Podólogo/Recepción solo lo suyo, ligado por perfil_id).
-- Entidades: E123 Empleado, E125 Horario laboral.

-- ───────────────────────────── empleados ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.empleados (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id              uuid not null references piefirme.sedes(id),             -- sede de contrato (P-109)
  sedes                uuid[] not null default '{}',                           -- sedes donde labora (vacío = solo la de contrato)
  perfil_id            uuid references piefirme.perfiles(id) on delete set null, -- solo si tiene sesión en el sistema
  numero_empleado      text not null,
  nombre               text not null,
  apellido_pat         text,
  apellido_mat         text,
  puesto               text not null check (puesto in ('podologo', 'recepcion', 'apoyo', 'administrador', 'otro')),
  esquema_contratacion text not null default 'nomina' check (esquema_contratacion in ('nomina', 'honorarios')),
  estado               text not null default 'activo' check (estado in ('activo', 'inactivo', 'baja')),
  fecha_ingreso        date,
  fecha_baja           date,
  motivo_baja          text,
  rfc                  text,
  curp                 text,
  nss                  text,
  fecha_nacimiento     date,
  email                text,
  telefono             text,
  telefono_fijo        text,
  domicilio            jsonb not null default '{}'::jsonb,            -- calle, numero_ext, numero_int, colonia, municipio, estado, codigo_postal, referencias
  contacto_emergencia  jsonb not null default '{}'::jsonb,            -- nombre, telefono, parentesco
  estado_civil         text,
  escolaridad          text,
  nacionalidad         text,
  lugar_nacimiento     text,
  banco                text,
  clabe                text check (clabe is null or clabe ~ '^[0-9]{18}$'),
  periodicidad_pago    text not null default 'quincenal' check (periodicidad_pago in ('semanal', 'quincenal', 'mensual')),
  salario_periodo      numeric(14,2) not null default 0 check (salario_periodo >= 0),
  bono_periodo         numeric(14,2) not null default 0 check (bono_periodo >= 0),
  tipo_jornada         text,
  supervisor           text,
  centro_trabajo       text,
  cedula               text,                                           -- cédula profesional (podólogos)
  notas                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organizacion_id, numero_empleado),
  check (estado <> 'baja' or fecha_baja is not null)
);
create index on piefirme.empleados (organizacion_id, sede_id, estado);
create unique index empleados_perfil_uq on piefirme.empleados (perfil_id) where perfil_id is not null;

-- el perfil ligado y la sede deben ser de la misma clínica
create or replace function piefirme_app.validar_empleado() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.perfil_id is not null and not exists (select 1 from piefirme.perfiles p where p.id = new.perfil_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'El perfil ligado al empleado pertenece a otra clínica';
  end if;
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'La sede de contrato pertenece a otra clínica';
  end if;
  return new;
end $$;
create trigger t_validar before insert or update on piefirme.empleados for each row execute function piefirme_app.validar_empleado();
create trigger t_upd before update on piefirme.empleados for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.empleados for each row execute function piefirme_app.auditar();

-- empleado ligado a la sesión actual
create or replace function piefirme_app.empleado_id() returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select id from piefirme.empleados where perfil_id = auth.uid() and organizacion_id = piefirme_app.org_id() limit 1
$$;

-- ───────────────────────────── historial de sueldo (IRP rh_historial_sueldo) ─────────────────────────────
create table piefirme.empleado_sueldo_historial (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  fecha_inicio     date not null default current_date,
  fecha_fin        date,                                   -- null = vigente
  sueldo_anterior  numeric(14,2),
  sueldo_nuevo     numeric(14,2) not null check (sueldo_nuevo >= 0),
  tipo             text not null default 'ajuste' check (tipo in ('alta', 'aumento', 'ajuste', 'reduccion')),
  motivo           text,
  registrado_por   uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);
create index on piefirme.empleado_sueldo_historial (organizacion_id, empleado_id, fecha_inicio desc);

-- alta y cambio de salario → renglón de historial; el periodo anterior se cierra el día previo
create or replace function piefirme_app.registrar_sueldo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.salario_periodo is distinct from old.salario_periodo then
    update piefirme.empleado_sueldo_historial
       set fecha_fin = current_date - 1
     where empleado_id = new.id and fecha_fin is null and fecha_inicio < current_date;
    insert into piefirme.empleado_sueldo_historial (organizacion_id, empleado_id, fecha_inicio, sueldo_anterior, sueldo_nuevo, tipo, motivo)
    values (new.organizacion_id, new.id, current_date,
            case when tg_op = 'UPDATE' then old.salario_periodo end, new.salario_periodo,
            case when tg_op = 'INSERT' then 'alta'
                 when new.salario_periodo > old.salario_periodo then 'aumento' else 'reduccion' end,
            case when tg_op = 'INSERT' then 'Alta del empleado' else 'Cambio de salario del periodo' end);
  end if;
  return null;
end $$;
create trigger t_sueldo after insert or update of salario_periodo on piefirme.empleados for each row execute function piefirme_app.registrar_sueldo();
create trigger t_aud after insert or update or delete on piefirme.empleado_sueldo_historial for each row execute function piefirme_app.auditar();

-- ───────────────────────────── horarios laborales (E125) ─────────────────────────────
create table piefirme.horarios_laborales (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  dia_semana       smallint not null check (dia_semana between 1 and 7),   -- 1 lunes … 7 domingo
  entrada          time not null,
  salida           time not null,
  descanso_min     integer not null default 0 check (descanso_min >= 0),
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  unique (empleado_id, dia_semana, vigente_desde)
);
create index on piefirme.horarios_laborales (organizacion_id, sede_id, empleado_id);
create trigger t_upd before update on piefirme.horarios_laborales for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── expediente: documentos del empleado ─────────────────────────────
-- Los archivos viven en el bucket privado "pf-documentos" con ruta <organizacion_id>/rh/empleados/<empleado_id>/<archivo>.
create table piefirme.empleado_documentos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,
  tipo             text not null check (tipo in ('contrato', 'ine', 'curp', 'rfc', 'nss', 'comprobante_domicilio', 'titulo_cedula', 'acta_nacimiento', 'carta_recomendacion', 'incapacidad', 'otro')),
  nombre           text not null,
  storage_path     text not null,
  mime             text,
  tamano_kb        integer,
  vence_el         date,
  subido_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = organizacion_id::text)
);
create index on piefirme.empleado_documentos (organizacion_id, empleado_id);
create trigger t_aud after insert or update or delete on piefirme.empleado_documentos for each row execute function piefirme_app.auditar();

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.empleados                 enable row level security;
alter table piefirme.empleado_sueldo_historial enable row level security;
alter table piefirme.horarios_laborales        enable row level security;
alter table piefirme.empleado_documentos       enable row level security;

create policy emp_sel on piefirme.empleados for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or perfil_id = auth.uid()));
create policy emp_ins on piefirme.empleados for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy emp_upd on piefirme.empleados for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy emp_del on piefirme.empleados for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy sue_sel on piefirme.empleado_sueldo_historial for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id()));
create policy sue_ins on piefirme.empleado_sueldo_historial for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy sue_upd on piefirme.empleado_sueldo_historial for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin())
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
-- sin delete: el historial de sueldo no se borra

create policy hor_sel on piefirme.horarios_laborales for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) or empleado_id = piefirme_app.empleado_id()));
create policy hor_ins on piefirme.horarios_laborales for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy hor_upd on piefirme.horarios_laborales for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy hor_del on piefirme.horarios_laborales for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

create policy edoc_sel on piefirme.empleado_documentos for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id()));
create policy edoc_ins on piefirme.empleado_documentos for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy edoc_upd on piefirme.empleado_documentos for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin())
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy edoc_del on piefirme.empleado_documentos for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_empleados with (security_invoker = true) as
select e.id, e.organizacion_id, e.sede_id, s.nombre as sede_nombre, e.sedes, e.perfil_id, e.numero_empleado,
       trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo,
       e.nombre, e.apellido_pat, e.apellido_mat, e.puesto, e.esquema_contratacion, e.estado,
       e.fecha_ingreso, e.fecha_baja, e.motivo_baja, e.rfc, e.curp, e.nss, e.fecha_nacimiento, e.email, e.telefono, e.telefono_fijo,
       e.domicilio, e.contacto_emergencia, e.estado_civil, e.escolaridad, e.nacionalidad, e.lugar_nacimiento,
       e.banco, e.clabe, e.periodicidad_pago, e.salario_periodo, e.bono_periodo, e.tipo_jornada, e.supervisor, e.centro_trabajo,
       e.cedula, e.notas,
       (e.perfil_id is not null) as tiene_sesion,
       case when e.fecha_ingreso is null then null else date_part('year', age(current_date, e.fecha_ingreso))::int end as antiguedad_anios,
       e.created_at, e.updated_at
  from piefirme.empleados e
  join piefirme.sedes s on s.id = e.sede_id;

create or replace view piefirme.prp_historico_sueldos with (security_invoker = true) as
select h.id, h.organizacion_id, h.empleado_id, h.fecha_inicio, h.fecha_fin, h.sueldo_nuevo as monto, h.sueldo_anterior,
       h.tipo, h.motivo, (h.fecha_fin is null) as vigente,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.empleado_sueldo_historial h
  join piefirme.empleados e on e.id = h.empleado_id;

create or replace view piefirme.prp_horarios_laborales with (security_invoker = true) as
select h.id, h.organizacion_id, h.sede_id, h.empleado_id, h.dia_semana, h.entrada, h.salida, h.descanso_min,
       h.vigente_desde, h.vigente_hasta, h.activo,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.horarios_laborales h
  join piefirme.empleados e on e.id = h.empleado_id;

create or replace view piefirme.prp_empleado_documentos with (security_invoker = true) as
select d.id, d.organizacion_id, d.empleado_id, d.tipo, d.nombre, d.storage_path, d.mime, d.tamano_kb, d.vence_el,
       (d.vence_el is not null and d.vence_el < current_date) as vencido, d.created_at
  from piefirme.empleado_documentos d;

-- medidor de expediente completo (IRP MedidorExpediente): datos y documentos clave presentes
create or replace view piefirme.prp_expediente_empleado with (security_invoker = true) as
select e.id as empleado_id, e.organizacion_id,
       (select count(*) from (values (e.rfc), (e.curp), (e.nss), (e.email), (e.telefono), (e.banco), (e.clabe), (e.fecha_ingreso::text), (e.fecha_nacimiento::text)) v(x) where x is not null and x <> '') as datos_presentes,
       9 as datos_total,
       (select count(distinct d.tipo) from piefirme.empleado_documentos d where d.empleado_id = e.id and d.tipo in ('contrato', 'ine', 'curp', 'rfc', 'nss', 'comprobante_domicilio')) as documentos_presentes,
       6 as documentos_total
  from piefirme.empleados e;

revoke all on function piefirme_app.empleado_id() from public, anon;
grant execute on function piefirme_app.empleado_id() to authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.validar_empleado(), piefirme_app.registrar_sueldo() from authenticated;
