-- 030 · A (Clínico) · Historia clínica: antecedentes (formato «Antecedentes personales» de Pie Clinic al 100 %), alergias,
-- medicamentos, expediente (contenedor 1:1 con versión y retención) y apertura de expediente con bitácora.
-- Fuentes: DICCIONARIO E24-E26, E29; docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md §2; REGLAS P-002, P-030, P-127, N-04, N-08.
-- Depende de: 001, 010 y servicios (B, 02x) por contrato.

-- Estado tri-valente: 'si' | 'no' | 'no_sabe'; NULL = no preguntado (el formato real distingue «no preguntado» de «no»).
set search_path = piefirme, piefirme_app, extensions;

do $$ begin
  create domain piefirme.tri_estado as text check (value in ('si', 'no', 'no_sabe'));
exception when duplicate_object then null; end $$;

-- FK diferida de 010: consentimiento por procedimiento ligado a un servicio del catálogo (B).
alter table piefirme.plantillas_documento
  add constraint plantillas_documento_servicio_fk foreign key (servicio_id) references piefirme.servicios(id) on delete set null;

-- ═════════════════════ E29 · expediente (1:1 con paciente) ═════════════════════
create table piefirme.expedientes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null unique references piefirme.pacientes(id) on delete cascade,
  estado           text not null default 'activo' check (estado in ('activo', 'resguardo', 'bloqueado_arco')),  -- «cancelación» ARCO = bloqueo, no borrado (P-141)
  version          integer not null default 1,       -- «versión del expediente» que lleva el PDF impreso
  ultima_atencion  date,
  conservar_hasta  date,                             -- ≥ 5 años desde la última atención (P-127, NOM-004)
  fecha_cierre     date,
  ultimo_acceso    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (estado <> 'resguardo' or fecha_cierre is not null)
);
create index on piefirme.expedientes (organizacion_id, estado);

-- ═════════════════════ E24 · antecedentes (ficha vigente 1:1; cada consulta guarda su instantánea, P-030) ═════════════════════
create table piefirme.antecedentes_paciente (
  paciente_id      uuid primary key references piefirme.pacientes(id) on delete cascade,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  -- Antecedentes personales patológicos («Tiene alguna enfermedad como:»)
  diabetes                 piefirme.tri_estado,
  diabetes_tipo            text check (diabetes_tipo in ('tipo1', 'tipo2', 'prediabetes', 'gestacional', 'otra')),
  diabetes_anios_evolucion integer check (diabetes_anios_evolucion between 0 and 90),
  hba1c                    numeric(4, 1) check (hba1c between 3 and 20),
  hba1c_fecha              date,
  diabetes_tratamiento     text,
  medico_tratante          text,
  medico_especialidad      text,
  hipertension             piefirme.tri_estado,
  alergicos                piefirme.tri_estado,
  alergicos_detalle        text,                       -- «¿a qué?»
  artritis                 piefirme.tri_estado,
  obesidad                 piefirme.tri_estado,
  traumaticos              piefirme.tri_estado,
  traumaticos_detalle      text,
  varices                  piefirme.tri_estado,
  otras_enfermedades       piefirme.tri_estado,
  otras_enfermedades_detalle text,                     -- «Otras (especifique)»
  toma_medicamentos        piefirme.tri_estado,
  medicamentos_texto       text,                       -- «¿Cuál?»; el detalle estructurado está en medicamentos_paciente
  ultima_glucosa_fecha     date,
  ultima_glucosa_texto     text,                       -- el papel admite fecha o texto libre
  -- Marcas clínicas extra de E24 (revisión rápida)
  insuficiencia_venosa     piefirme.tri_estado,
  insuficiencia_arterial   piefirme.tri_estado,
  neuropatia               piefirme.tri_estado,
  psoriasis                piefirme.tri_estado,
  inmunosupresion          piefirme.tri_estado,
  anticoagulacion          piefirme.tri_estado,
  ulcera_previa            piefirme.tri_estado,
  amputacion_previa        piefirme.tri_estado,
  embarazo                 piefirme.tri_estado,
  cirugia_previa_pie       text,
  -- Antecedentes heredo-familiares («Padece alguna enfermedad su:»)
  hf_padre                 text,
  hf_madre                 text,
  hf_hermanos              text,
  hf_esposo                text,
  hf_hijos                 text,
  -- Antecedentes personales no patológicos
  tabaquismo               piefirme.tri_estado,
  alcoholismo              piefirme.tri_estado,
  toxicomanias             piefirme.tri_estado,
  toxicomanias_detalle     text,
  tipo_calzado             text,
  numero_calzado           numeric(4, 1),
  deporte                  piefirme.tri_estado,
  deporte_detalle          text,
  calzado_actividad        text,                       -- «Cerrado 8 h/día; docente, de pie 6 h»
  -- Motivo y síntomas de la primera visita (formato 2, campos 37 y 38)
  motivo_consulta_inicial  text,
  sintomas_iniciales       text,
  notas                    text,
  version                  integer not null default 1,
  actualizado_por          uuid references piefirme.perfiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index on piefirme.antecedentes_paciente (organizacion_id);

-- E25 alergias estructuradas (alimentan la alerta P-012/P-032)
create table piefirme.alergias_paciente (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  sustancia        text not null,
  reaccion         text,
  anio             integer check (anio between 1900 and 2100),
  gravedad         text check (gravedad in ('leve', 'moderada', 'grave')),
  vigente          boolean not null default true,
  registrada_por   uuid references piefirme.perfiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.alergias_paciente (organizacion_id, paciente_id);

-- E26 medicamentos actuales
create table piefirme.medicamentos_paciente (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  nombre_dosis     text not null,                       -- «Metformina 850 mg c/12 h»
  anticoagulante   boolean not null default false,
  vigente          boolean not null default true,
  desde            date,
  registrado_por   uuid references piefirme.perfiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.medicamentos_paciente (organizacion_id, paciente_id);

-- ═════════════════════ triggers de integridad ═════════════════════

-- Sube la versión del expediente (marca del PDF impreso) — la llaman los triggers clínicos.
create or replace function piefirme_app.subir_version_expediente(p_paciente uuid) returns void
language sql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  update piefirme.expedientes set version = version + 1, updated_at = now() where paciente_id = p_paciente
$$;

-- Al crear un paciente nace su expediente y su ficha de antecedentes vacía.
create or replace function piefirme_app.paciente_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.expedientes (organizacion_id, paciente_id) values (new.organizacion_id, new.id) on conflict do nothing;
  insert into piefirme.antecedentes_paciente (paciente_id, organizacion_id, tipo_calzado, numero_calzado, deporte_detalle)
  values (new.id, new.organizacion_id, new.tipo_calzado, new.talla_calzado, new.deporte) on conflict do nothing;
  return null;
end $$;
create trigger t_paciente_ai after insert on piefirme.pacientes for each row execute function piefirme_app.paciente_ai();

-- Coherencia organización (los hijos deben apuntar a un paciente de su misma clínica) y versión.
create or replace function piefirme_app.hijo_paciente_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from piefirme.pacientes where id = new.paciente_id;
  if v_org is distinct from new.organizacion_id then
    raise exception 'El paciente no pertenece a la clínica' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.antecedentes_paciente for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.alergias_paciente for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.medicamentos_paciente for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.expedientes for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.paciente_datos_sensibles for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.contactos_emergencia for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.tutores for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.datos_fiscales_paciente for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.consentimientos for each row execute function piefirme_app.hijo_paciente_bi();

-- Antecedentes: versión + sincroniza el resumen que ve Recepción (pacientes.diabetes / alergias_resumen).
create or replace function piefirme_app.antecedentes_bu() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
  if new.diabetes = 'no' and new.diabetes_tipo is not null then new.diabetes_tipo := null; end if;
  return new;
end $$;
create trigger t_antecedentes_bu before update on piefirme.antecedentes_paciente for each row execute function piefirme_app.antecedentes_bu();

create or replace function piefirme_app.antecedentes_au() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.pacientes p set diabetes = case
        when new.diabetes = 'no' then 'no'
        when new.diabetes = 'si' then coalesce(case when new.diabetes_tipo in ('tipo1', 'tipo2', 'prediabetes') then new.diabetes_tipo end, 'no_sabe')
        when new.diabetes = 'no_sabe' then 'no_sabe' else p.diabetes end
   where p.id = new.paciente_id;
  perform piefirme_app.subir_version_expediente(new.paciente_id);
  return null;
end $$;
create trigger t_antecedentes_au after update on piefirme.antecedentes_paciente for each row execute function piefirme_app.antecedentes_au();

create or replace function piefirme_app.alergias_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pac uuid := coalesce(new.paciente_id, old.paciente_id);
begin
  update piefirme.pacientes p set alergias_resumen = (
      select string_agg(a.sustancia, ', ' order by a.sustancia) from piefirme.alergias_paciente a where a.paciente_id = v_pac and a.vigente)
   where p.id = v_pac;
  perform piefirme_app.subir_version_expediente(v_pac);
  return null;
end $$;
create trigger t_alergias_ai after insert or update or delete on piefirme.alergias_paciente for each row execute function piefirme_app.alergias_ai();

-- ═════════════════════ apertura del expediente con bitácora (P-002) ═════════════════════
-- Todo podólogo ve el expediente de cualquier paciente de su clínica; cada apertura queda en bitácora y, si la sede
-- del paciente no es la sede de trabajo del usuario, queda marcada para notificar al Administrador.
create or replace function piefirme.abrir_expediente(p_paciente uuid, p_sede_trabajo uuid default null)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pac record; v_otra boolean;
begin
  if piefirme_app.rol()::text not in ('administrador', 'podologo') then
    raise exception 'Sin permiso para abrir el expediente clínico' using errcode = '42501';
  end if;
  select id, numero_expediente, sede_registro_id, nombre, apellido_paterno into v_pac from piefirme.pacientes where id = p_paciente;
  if v_pac.id is null then raise exception 'Paciente no encontrado' using errcode = 'P0002'; end if;
  v_otra := p_sede_trabajo is not null and v_pac.sede_registro_id is distinct from p_sede_trabajo;
  perform piefirme.registrar_bitacora('ver', 'expedientes', p_paciente::text,
      jsonb_build_object('numero_expediente', v_pac.numero_expediente, 'sede_distinta', v_otra, 'notificar_administrador', v_otra), p_sede_trabajo);
  update piefirme.expedientes set ultimo_acceso = now() where paciente_id = p_paciente;
  return jsonb_build_object('paciente_id', v_pac.id, 'numero_expediente', v_pac.numero_expediente, 'sede_distinta', v_otra);
end $$;

-- ═════════════════════ RLS ═════════════════════
-- Datos clínicos: Podólogo y Administrador. Recepción ve la ficha del paciente (010) con alerta de alergias/diabetes, no el expediente (P-130).
select piefirme_app.a_politicas('expedientes', array['administrador', 'podologo'], array['administrador', 'podologo']);
select piefirme_app.a_politicas('antecedentes_paciente', array['administrador', 'podologo'], array['administrador', 'podologo']);
select piefirme_app.a_politicas('alergias_paciente', array['administrador', 'podologo'], array['administrador', 'podologo'], array['administrador', 'podologo']);
select piefirme_app.a_politicas('medicamentos_paciente', array['administrador', 'podologo'], array['administrador', 'podologo'], array['administrador', 'podologo']);

select piefirme_app.a_triggers('expedientes');
select piefirme_app.a_triggers('antecedentes_paciente');
select piefirme_app.a_triggers('alergias_paciente');
select piefirme_app.a_triggers('medicamentos_paciente');

-- Vista: resumen clínico del expediente (security invoker → solo Podólogo/Administrador ven filas)
create view piefirme.prp_expediente_resumen with (security_invoker = true) as
select e.id as expediente_id, e.organizacion_id, e.paciente_id, e.estado, e.version, e.ultima_atencion, e.conservar_hasta, e.ultimo_acceso,
       p.numero_expediente, btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '') || ' ' || coalesce(p.apellido_materno, '')) as nombre_completo,
       piefirme_app.edad(p.fecha_nacimiento) as edad, p.sede_registro_id,
       a.diabetes, a.diabetes_tipo, a.hba1c, a.hba1c_fecha, a.anticoagulacion, a.hipertension, a.ulcera_previa, a.amputacion_previa,
       (select count(*) from piefirme.alergias_paciente al where al.paciente_id = e.paciente_id and al.vigente) as alergias_vigentes,
       (select count(*) from piefirme.medicamentos_paciente m where m.paciente_id = e.paciente_id and m.vigente and m.anticoagulante) as anticoagulantes_vigentes
  from piefirme.expedientes e
  join piefirme.pacientes p on p.id = e.paciente_id
  left join piefirme.antecedentes_paciente a on a.paciente_id = e.paciente_id;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on function piefirme.abrir_expediente(uuid, uuid) from public, anon;
grant execute on function piefirme.abrir_expediente(uuid, uuid) to authenticated;
revoke all on all tables in schema piefirme from anon;
