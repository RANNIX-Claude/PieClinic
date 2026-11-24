-- 034 · A (Clínico) · Planes de tratamiento y sesiones (extracción de uña = extracción + 4 curaciones diarias consecutivas),
-- plantillas de plan por clínica (copia de las plantillas base de RANNIX) y detección de planes abandonados.
-- Fuentes: DICCIONARIO E55-E57; MODELO_ESTADOS S09; REGLAS P-026, P-027, P-028, P-029, P-052, N-03, CD-09, CA-12.
-- Depende de: 001, 010, 031, servicios/citas (B).

-- ═════════════════════ E56 plantilla de plan ═════════════════════
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.plantillas_plan (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo                 text not null,
  nombre                 text not null,
  descripcion            text,
  servicio_id            uuid references piefirme.servicios(id) on delete set null,    -- servicio base
  caducidad_meses        integer check (caducidad_meses between 1 and 60),            -- p. ej. 12 para láser (P-070)
  valido_otra_sede       boolean not null default true,
  base_rannix            boolean not null default false,                              -- copiada de las plantillas base (P-027)
  activa                 boolean not null default true,
  criterio_alta          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organizacion_id, codigo)
);
create index on piefirme.plantillas_plan (organizacion_id, activa);

create table piefirme.plantilla_plan_sesiones (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  plantilla_id        uuid not null references piefirme.plantillas_plan(id) on delete cascade,
  numero              integer not null check (numero >= 1),
  nombre              text not null,
  procedimiento       text,
  tipo                text not null default 'tratamiento' check (tipo in ('tratamiento', 'curacion', 'control')),
  intervalo_dias      integer not null default 0 check (intervalo_dias >= 0),        -- desde la sesión anterior
  ventana_min_dias    integer check (ventana_min_dias >= 0),                         -- ventana recomendada (P-029): solo marca «atrasada»
  ventana_max_dias    integer check (ventana_max_dias >= ventana_min_dias),
  duracion_min        integer not null default 30 check (duracion_min > 0),
  precio              numeric(14, 2) not null default 0 check (precio >= 0),          -- $0 = incluida (P-027)
  agenda_automatica   boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (plantilla_id, numero)
);
create index on piefirme.plantilla_plan_sesiones (organizacion_id, plantilla_id);

-- ═════════════════════ E55 plan de tratamiento ═════════════════════
create table piefirme.planes_tratamiento (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references piefirme.organizaciones(id) on delete cascade,
  folio                  text,                                                        -- {SEDE}-PLA-{NNNNNN}
  paciente_id            uuid not null references piefirme.pacientes(id),
  nombre                 text not null,
  plantilla_id           uuid references piefirme.plantillas_plan(id) on delete set null,
  podologo_id            uuid not null references piefirme.perfiles(id),
  sede_id                uuid not null references piefirme.sedes(id),
  cabina_id              uuid references piefirme.cabinas(id),
  servicio_id            uuid references piefirme.servicios(id),
  diagnostico_categoria  text check (diagnostico_categoria in ('onicomicosis', 'papiloma_plantar', 'pie_atleta', 'micosis', 'hiperqueratosis', 'otros')),
  cie10_codigo           text references piefirme.cie10_catalogo(codigo),
  consulta_origen_id     uuid references piefirme.consultas(id),
  fecha_inicio           date not null default current_date,
  intervalo_texto        text,
  duracion_total_texto   text,
  objetivo_alta          text,
  precio_plan            numeric(14, 2) not null default 0 check (precio_plan >= 0),
  promocion_id           uuid,                                                        -- promoción aplicada (B)
  anticipo_requerido     numeric(14, 2) not null default 0 check (anticipo_requerido >= 0),
  forma_cobro            text not null default 'todo_en_sesion_1' check (forma_cobro in ('todo_en_sesion_1', 'por_sesion', 'plan_adquirido')),
  plan_adquirido_id      uuid,                                                        -- plan comercial adquirido que lo respalda (B)
  generar_citas_auto     boolean not null default true,
  recordatorio_horas     integer not null default 24,
  avisar_recepcion_dias  integer not null default 3,
  bloquear_cabina        boolean not null default false,
  estado                 text not null default 'en_curso' check (estado in ('en_curso', 'pausado', 'abandonado', 'concluido')),
  motivo_estado          text,
  pausado_en             timestamptz,
  abandonado_en          timestamptz,
  concluido_en           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.planes_tratamiento (organizacion_id, paciente_id, estado);
create index on piefirme.planes_tratamiento (organizacion_id, sede_id, estado);
create index on piefirme.planes_tratamiento (organizacion_id, podologo_id, estado);

alter table piefirme.consultas add constraint consultas_plan_fk foreign key (plan_id) references piefirme.planes_tratamiento(id);

-- E57 sesión del plan
create table piefirme.sesiones_plan (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  plan_id             uuid not null references piefirme.planes_tratamiento(id) on delete cascade,
  numero              integer not null check (numero >= 0),                           -- 0/1 = procedimiento inicial; luego curaciones
  nombre              text not null,
  procedimiento       text,
  tipo                text not null default 'tratamiento' check (tipo in ('tratamiento', 'curacion', 'control')),
  fecha_propuesta     date,
  ventana_desde       date,
  ventana_hasta       date,
  podologo_id         uuid references piefirme.perfiles(id),
  cabina_id           uuid references piefirme.cabinas(id),
  duracion_min        integer not null default 30 check (duracion_min > 0),
  precio              numeric(14, 2) not null default 0 check (precio >= 0),
  estado              text not null default 'por_generar' check (estado in ('por_generar', 'agendada', 'realizada', 'falta', 'cancelada')),
  atrasada            boolean not null default false,
  reprogramaciones    integer not null default 0 check (reprogramaciones >= 0),
  cita_id             uuid references piefirme.citas(id),
  consulta_id         uuid references piefirme.consultas(id),
  realizada_en        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (plan_id, numero),
  check (estado <> 'realizada' or (consulta_id is not null and realizada_en is not null))
);
create index on piefirme.sesiones_plan (organizacion_id, plan_id, estado);
create index on piefirme.sesiones_plan (organizacion_id, fecha_propuesta);
alter table piefirme.consultas add column sesion_plan_id uuid references piefirme.sesiones_plan(id);
create index on piefirme.consultas (sesion_plan_id);

-- ═════════════════════ reglas ═════════════════════
create or replace function piefirme_app.plan_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'Paciente de otra clínica' using errcode = 'P0001';
    end if;
    new.folio := coalesce(new.folio, piefirme_app.siguiente_folio_clinico(new.sede_id, 'PLA'));
    new.estado := 'en_curso';
  else
    if new.paciente_id <> old.paciente_id or new.organizacion_id <> old.organizacion_id or new.folio is distinct from old.folio then
      raise exception 'Paciente y folio del plan no se cambian' using errcode = 'P0001';
    end if;
    if new.estado <> old.estado then
      if old.estado = 'concluido' then raise exception 'Un plan concluido no se reabre' using errcode = 'P0001'; end if;
      if old.estado = 'abandonado' and new.estado <> 'en_curso' then raise exception 'Un plan abandonado solo puede reactivarse' using errcode = 'P0001'; end if;
      if new.estado = 'pausado' then new.pausado_en := now(); end if;
      if new.estado = 'abandonado' then new.abandonado_en := now(); end if;
      if new.estado = 'concluido' then new.concluido_en := now(); end if;
      if new.estado = 'en_curso' then new.pausado_en := null; new.abandonado_en := null; end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_plan_bi before insert or update on piefirme.planes_tratamiento for each row execute function piefirme_app.plan_bi();

create or replace function piefirme_app.sesion_plan_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid;
begin
  select organizacion_id into v_org from piefirme.planes_tratamiento where id = new.plan_id;
  if v_org is distinct from new.organizacion_id then raise exception 'Plan de otra clínica' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' then
    if old.estado = 'realizada' and (new.estado <> 'realizada' or new.consulta_id is distinct from old.consulta_id) then
      raise exception 'Una sesión realizada no se revierte' using errcode = 'P0001';
    end if;
    if new.estado = 'agendada' and old.estado in ('agendada', 'falta') and new.fecha_propuesta is distinct from old.fecha_propuesta then
      new.reprogramaciones := old.reprogramaciones + 1;
    end if;
    -- P-029: fuera de ventana solo marca «atrasada»; nunca bloquea
    if new.ventana_hasta is not null and new.fecha_propuesta is not null and new.fecha_propuesta > new.ventana_hasta then new.atrasada := true; end if;
  end if;
  return new;
end $$;
create trigger t_sesion_plan_bi before insert or update on piefirme.sesiones_plan for each row execute function piefirme_app.sesion_plan_bi();

-- Cuando se cierra la consulta de una sesión: la sesión queda realizada y, si era la última (o se pidió cerrar), el plan concluye.
create or replace function piefirme_app.consulta_plan_au() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pend integer;
begin
  if new.estado = 'cerrada' and old.estado <> 'cerrada' and new.plan_id is not null then
    if new.sesion_plan_id is not null then
      update piefirme.sesiones_plan set estado = 'realizada', consulta_id = new.id, realizada_en = new.firmada_en
       where id = new.sesion_plan_id and plan_id = new.plan_id and estado <> 'realizada';
    end if;
    select count(*) into v_pend from piefirme.sesiones_plan where plan_id = new.plan_id and estado in ('por_generar', 'agendada', 'falta');
    if new.cerrar_plan or v_pend = 0 then
      update piefirme.planes_tratamiento set estado = 'concluido', motivo_estado = coalesce(motivo_estado, 'Cerrado al firmar la última consulta')
       where id = new.plan_id and estado in ('en_curso', 'pausado');
    end if;
  end if;
  return null;
end $$;
create trigger t_consulta_plan_au after update on piefirme.consultas for each row execute function piefirme_app.consulta_plan_au();

-- Día hábil siguiente de una sede: salta días cerrados (sedes.horario->'dias_cerrados', isodow 1-7) y festivos (organizaciones.parametros->'festivos').
create or replace function piefirme_app.dia_habil(p_sede uuid, p_fecha date) returns date
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare d date := p_fecha; i integer := 0; v_cerr jsonb; v_fest jsonb;
begin
  select s.horario -> 'dias_cerrados', o.parametros -> 'festivos' into v_cerr, v_fest
    from piefirme.sedes s join piefirme.organizaciones o on o.id = s.organizacion_id where s.id = p_sede;
  while i < 15 loop
    exit when not (coalesce(v_cerr, '[]'::jsonb) @> to_jsonb(extract(isodow from d)::int)
                   or coalesce(v_fest, '[]'::jsonb) ? d::text);
    d := d + 1; i := i + 1;
  end loop;
  return d;
end $$;

-- Genera las sesiones del plan desde su plantilla (P-028: extracción + 4 curaciones diarias; si no abre la sede pasa al siguiente día hábil y queda «atrasada»).
create or replace function piefirme.generar_sesiones_plan(p_plan uuid) returns integer
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_plan record; r record; v_fecha date; v_prev date; v_tent date; v_n integer := 0;
begin
  select * into v_plan from piefirme.planes_tratamiento where id = p_plan;
  if v_plan.id is null then raise exception 'Plan no encontrado' using errcode = 'P0002'; end if;
  if v_plan.plantilla_id is null then raise exception 'El plan no tiene plantilla de sesiones' using errcode = 'P0001'; end if;
  v_prev := v_plan.fecha_inicio;
  for r in select * from piefirme.plantilla_plan_sesiones where plantilla_id = v_plan.plantilla_id order by numero loop
    v_tent := v_prev + r.intervalo_dias;
    v_fecha := piefirme_app.dia_habil(v_plan.sede_id, v_tent);
    insert into piefirme.sesiones_plan (organizacion_id, plan_id, numero, nombre, procedimiento, tipo, fecha_propuesta, ventana_desde, ventana_hasta,
                                      podologo_id, cabina_id, duracion_min, precio, estado, atrasada)
    values (v_plan.organizacion_id, v_plan.id, r.numero, r.nombre, r.procedimiento, r.tipo, v_fecha,
            case when r.ventana_min_dias is not null then v_prev + r.ventana_min_dias end,
            case when r.ventana_max_dias is not null then v_prev + r.ventana_max_dias end,
            v_plan.podologo_id, v_plan.cabina_id, r.duracion_min, r.precio,
            case when r.numero = 1 or r.agenda_automatica then 'por_generar' else 'por_generar' end, v_fecha > v_tent)
    on conflict (plan_id, numero) do nothing;
    if found then v_n := v_n + 1; end if;
    v_prev := v_fecha;
  end loop;
  return v_n;
end $$;

-- Crea el plan (con sus sesiones) a partir de una plantilla en un solo paso.
create or replace function piefirme.crear_plan_desde_plantilla(
  p_paciente uuid, p_plantilla uuid, p_podologo uuid, p_sede uuid, p_fecha_inicio date default current_date,
  p_precio numeric default null, p_consulta_origen uuid default null) returns uuid
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pl record; v_id uuid; v_precio numeric(14, 2);
begin
  select * into v_pl from piefirme.plantillas_plan where id = p_plantilla and activa;
  if v_pl.id is null then raise exception 'Plantilla de plan no encontrada o inactiva' using errcode = 'P0002'; end if;
  v_precio := coalesce(p_precio, (select coalesce(sum(precio), 0) from piefirme.plantilla_plan_sesiones where plantilla_id = p_plantilla));
  insert into piefirme.planes_tratamiento (organizacion_id, paciente_id, nombre, plantilla_id, podologo_id, sede_id, servicio_id, fecha_inicio,
                                         objetivo_alta, precio_plan, consulta_origen_id)
  values (piefirme_app.org_id(), p_paciente, v_pl.nombre, p_plantilla, p_podologo, p_sede, v_pl.servicio_id, p_fecha_inicio, v_pl.criterio_alta, v_precio, p_consulta_origen)
  returning id into v_id;
  perform piefirme.generar_sesiones_plan(v_id);
  return v_id;
end $$;

-- P-026: plan «Abandonado» tras 30 días (parámetro dias_plan_abandonado) sin sesión realizada ni cita futura. Devuelve las citas a cancelar.
create or replace function piefirme.marcar_planes_abandonados() returns table (plan_id uuid, cita_id uuid)
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dias integer; r record;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion', 'podologo') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select coalesce((o.parametros ->> 'dias_plan_abandonado')::int, 30) into v_dias from piefirme.organizaciones o where o.id = piefirme_app.org_id();
  for r in
    select p.id from piefirme.planes_tratamiento p
     where p.organizacion_id = piefirme_app.org_id() and p.estado = 'en_curso'
       and exists (select 1 from piefirme.sesiones_plan s where s.plan_id = p.id and s.estado in ('por_generar', 'agendada', 'falta'))
       and not exists (select 1 from piefirme.sesiones_plan s where s.plan_id = p.id and s.estado = 'agendada' and s.fecha_propuesta >= current_date)
       and greatest(p.created_at, coalesce((select max(s.realizada_en) from piefirme.sesiones_plan s where s.plan_id = p.id), p.created_at)) < now() - make_interval(days => v_dias)
  loop
    update piefirme.planes_tratamiento set estado = 'abandonado', motivo_estado = format('Sin actividad en %s días', v_dias) where id = r.id;
    return query select s.plan_id, s.cita_id from piefirme.sesiones_plan s where s.plan_id = r.id and s.cita_id is not null and s.estado in ('agendada', 'por_generar');
    update piefirme.sesiones_plan set estado = 'cancelada' where piefirme.sesiones_plan.plan_id = r.id and estado in ('por_generar', 'agendada', 'falta');
  end loop;
end $$;

-- Plantillas base de RANNIX (P-027): se copian a la clínica y esta las edita; no afectan planes ya vendidos.
create or replace function piefirme.copiar_plantillas_plan_base() returns integer
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_id uuid; n integer := 0;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el administrador copia las plantillas base' using errcode = '42501'; end if;

  if not exists (select 1 from piefirme.plantillas_plan where organizacion_id = v_org and codigo = 'extraccion_una') then
    insert into piefirme.plantillas_plan (organizacion_id, codigo, nombre, descripcion, caducidad_meses, base_rannix, criterio_alta)
    values (v_org, 'extraccion_una', 'Extracción de uña + 4 curaciones diarias',
            'Extracción y curación diaria durante 4 días consecutivos hasta lograr una adecuada cicatrización (formato real de Pie Clinic).', null, true, 'Cicatrización adecuada')
    returning id into v_id;
    insert into piefirme.plantilla_plan_sesiones (organizacion_id, plantilla_id, numero, nombre, procedimiento, tipo, intervalo_dias, duracion_min, precio) values
      (v_org, v_id, 1, 'Extracción de uña, hemostasia y curación', 'Extracción total o parcial de uña', 'tratamiento', 0, 60, 0),
      (v_org, v_id, 2, 'Curación día 1', 'Curación y control post-extracción', 'curacion', 1, 15, 0),
      (v_org, v_id, 3, 'Curación día 2', 'Curación y control post-extracción', 'curacion', 1, 15, 0),
      (v_org, v_id, 4, 'Curación día 3', 'Curación y control post-extracción', 'curacion', 1, 15, 0),
      (v_org, v_id, 5, 'Curación día 4', 'Curación y control post-extracción', 'curacion', 1, 15, 0);
    n := n + 1;
  end if;

  if not exists (select 1 from piefirme.plantillas_plan where organizacion_id = v_org and codigo = 'una_encarnada') then
    insert into piefirme.plantillas_plan (organizacion_id, codigo, nombre, descripcion, base_rannix, criterio_alta)
    values (v_org, 'una_encarnada', 'Uña encarnada + curación de control', 'Espiculectomía con una curación a los 7-10 días.', true, 'Sin dolor ni inflamación') returning id into v_id;
    insert into piefirme.plantilla_plan_sesiones (organizacion_id, plantilla_id, numero, nombre, procedimiento, tipo, intervalo_dias, ventana_min_dias, ventana_max_dias, duracion_min, precio) values
      (v_org, v_id, 1, 'Espiculectomía', 'Retiro de espícula en uña encarnada', 'tratamiento', 0, null, null, 40, 0),
      (v_org, v_id, 2, 'Curación de control', 'Curación y control', 'curacion', 7, 7, 10, 15, 0);
    n := n + 1;
  end if;

  if not exists (select 1 from piefirme.plantillas_plan where organizacion_id = v_org and codigo = 'laser_onicomicosis') then
    insert into piefirme.plantillas_plan (organizacion_id, codigo, nombre, descripcion, caducidad_meses, base_rannix, criterio_alta)
    values (v_org, 'laser_onicomicosis', 'Láser para onicomicosis (6 sesiones)', 'Sesiones cada 30-35 días; la ventana es recomendación.', 12, true, 'Crecimiento de uña sana') returning id into v_id;
    insert into piefirme.plantilla_plan_sesiones (organizacion_id, plantilla_id, numero, nombre, procedimiento, tipo, intervalo_dias, ventana_min_dias, ventana_max_dias, duracion_min, precio)
    select v_org, v_id, g, 'Sesión láser ' || g, 'Láser antimicótico', 'tratamiento', case when g = 1 then 0 else 30 end, case when g = 1 then null else 30 end, case when g = 1 then null else 35 end, 30, 0
      from generate_series(1, 6) g;
    n := n + 1;
  end if;

  if not exists (select 1 from piefirme.plantillas_plan where organizacion_id = v_org and codigo = 'papiloma_plantar') then
    insert into piefirme.plantillas_plan (organizacion_id, codigo, nombre, descripcion, base_rannix, criterio_alta)
    values (v_org, 'papiloma_plantar', 'Papiloma plantar (3 sesiones)', 'Tratamiento por sesiones cada 14 días (a validar por podólogo asesor).', true, 'Resolución de la lesión') returning id into v_id;
    insert into piefirme.plantilla_plan_sesiones (organizacion_id, plantilla_id, numero, nombre, procedimiento, tipo, intervalo_dias, duracion_min, precio)
    select v_org, v_id, g, 'Sesión ' || g, 'Tratamiento de verruga plantar', 'tratamiento', case when g = 1 then 0 else 14 end, 30, 0 from generate_series(1, 3) g;
    n := n + 1;
  end if;
  return n;
end $$;

-- ═════════════════════ RLS ═════════════════════
select piefirme_app.a_politicas('plantillas_plan', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador']);
select piefirme_app.a_politicas('plantilla_plan_sesiones', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador']);
-- Recepción crea planes (V C) y agenda sus sesiones; edita el plan solo Podólogo/Administrador.
alter table piefirme.planes_tratamiento enable row level security;
create policy planes_tratamiento_sel on piefirme.planes_tratamiento for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo', 'recepcion'));
create policy planes_tratamiento_ins on piefirme.planes_tratamiento for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'podologo', 'recepcion') and piefirme_app.puede_sede(sede_id));
create policy planes_tratamiento_upd on piefirme.planes_tratamiento for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo') and piefirme_app.puede_sede(sede_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'podologo') and piefirme_app.puede_sede(sede_id));
select piefirme_app.a_politicas('sesiones_plan', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo', 'recepcion']);

select piefirme_app.a_triggers('plantillas_plan');
select piefirme_app.a_triggers('plantilla_plan_sesiones', false);
select piefirme_app.a_triggers('planes_tratamiento');
select piefirme_app.a_triggers('sesiones_plan');

-- Cumplimiento del plan: «1 de 5 · 0 faltas · 0 reprogramaciones»
create view piefirme.prp_planes_progreso with (security_invoker = true) as
select p.id as plan_id, p.organizacion_id, p.folio, p.paciente_id, p.nombre, p.sede_id, p.podologo_id, p.estado, p.fecha_inicio, p.precio_plan,
       count(s.*) filter (where s.estado <> 'cancelada') as sesiones_total,
       count(s.*) filter (where s.estado = 'realizada') as sesiones_realizadas,
       count(s.*) filter (where s.estado = 'falta') as faltas,
       coalesce(sum(s.reprogramaciones), 0)::int as reprogramaciones,
       count(s.*) filter (where s.atrasada and s.estado not in ('realizada', 'cancelada')) as sesiones_atrasadas,
       min(s.fecha_propuesta) filter (where s.estado in ('por_generar', 'agendada', 'falta')) as proxima_sesion,
       greatest(p.created_at, coalesce(max(s.realizada_en), p.created_at)) as ultima_actividad,
       (current_date - (greatest(p.created_at, coalesce(max(s.realizada_en), p.created_at)))::date) as dias_sin_actividad
  from piefirme.planes_tratamiento p
  left join piefirme.sesiones_plan s on s.plan_id = p.id
 group by p.id;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on function piefirme.generar_sesiones_plan(uuid) from public, anon;
grant execute on function piefirme.generar_sesiones_plan(uuid) to authenticated;
revoke all on function piefirme.crear_plan_desde_plantilla(uuid, uuid, uuid, uuid, date, numeric, uuid) from public, anon;
grant execute on function piefirme.crear_plan_desde_plantilla(uuid, uuid, uuid, uuid, date, numeric, uuid) to authenticated;
revoke all on function piefirme.marcar_planes_abandonados() from public, anon;
grant execute on function piefirme.marcar_planes_abandonados() to authenticated;
revoke all on function piefirme.copiar_plantillas_plan_base() from public, anon;
grant execute on function piefirme.copiar_plantillas_plan_base() to authenticated;
revoke all on all tables in schema piefirme from anon;
