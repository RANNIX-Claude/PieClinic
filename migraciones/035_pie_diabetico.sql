-- 035 · A (Clínico) · Valoración de pie diabético: monofilamento por sitio, úlceras con puntaje SINBAD, Wagner, riesgo y revisión periódica.
-- Fuentes: DICCIONARIO E37-E39; MODELO_ESTADOS S08; REGLAS P-010 (riesgo/frecuencia como sugerencia apagada), P-011 (ITB «no evaluado» ≠ 0), P-012, P-052, P-146.
-- Nunca es diagnóstico: la categoría de riesgo y la frecuencia sugeridas están apagadas hasta que un podólogo asesor valide los criterios.
-- Depende de: 001, 010, 031, 033.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.valoraciones_pie_diabetico (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id             uuid not null references piefirme.pacientes(id),
  consulta_id             uuid references piefirme.consultas(id),
  sede_id                 uuid not null references piefirme.sedes(id),
  podologo_id             uuid not null references piefirme.perfiles(id),
  fecha                   date not null default current_date,
  estado                  text not null default 'borrador' check (estado in ('borrador', 'firmada')),
  -- copiado de antecedentes (E24)
  diabetes_tipo           text not null check (diabetes_tipo in ('tipo1', 'tipo2', 'prediabetes', 'gestacional', 'otra')),
  anios_evolucion         integer not null check (anios_evolucion between 0 and 90),
  hba1c                   numeric(4, 1) check (hba1c between 3 and 20),
  hba1c_fecha             date,
  tratamiento_diabetes    text,
  medico_tratante         text,
  ulcera_previa           boolean not null default false,
  amputacion_previa       boolean not null default false,
  tabaquismo              boolean not null default false,
  sintomas                text[] not null default '{}' check (sintomas <@ array['hormigueo', 'ardor', 'calambres', 'dolor_reposo', 'claudicacion', 'perdida_sensibilidad']),
  -- neurológico
  diapason_izq            text check (diapason_izq in ('presente', 'disminuida', 'ausente', 'no_evaluado')),
  diapason_der            text check (diapason_der in ('presente', 'disminuida', 'ausente', 'no_evaluado')),
  reflejo_aquileo_izq     text check (reflejo_aquileo_izq in ('presente', 'disminuido', 'ausente', 'no_evaluado')),
  reflejo_aquileo_der     text check (reflejo_aquileo_der in ('presente', 'disminuido', 'ausente', 'no_evaluado')),
  sensibilidad_termica    text check (sensibilidad_termica in ('normal', 'disminuida', 'ausente', 'no_evaluado')),
  sensibilidad_protectora text check (sensibilidad_protectora in ('intacta', 'ausente')),
  -- vascular
  pulso_pedio_izq         text check (pulso_pedio_izq in ('presente', 'disminuido', 'ausente', 'no_evaluado')),
  pulso_pedio_der         text check (pulso_pedio_der in ('presente', 'disminuido', 'ausente', 'no_evaluado')),
  pulso_tibial_izq        text check (pulso_tibial_izq in ('presente', 'disminuido', 'ausente', 'no_evaluado')),
  pulso_tibial_der        text check (pulso_tibial_der in ('presente', 'disminuido', 'ausente', 'no_evaluado')),
  llenado_capilar_izq_s   numeric(3, 1) check (llenado_capilar_izq_s > 0),
  llenado_capilar_der_s   numeric(3, 1) check (llenado_capilar_der_s > 0),
  temperatura_piel        text check (temperatura_piel in ('normal', 'fria', 'caliente')),
  coloracion              text check (coloracion in ('normal', 'palida', 'cianotica', 'eritematosa', 'rubor_dependiente')),
  edema                   text check (edema in ('no', 'leve', 'moderado', 'severo')),
  piel_atrofica_sin_vello boolean,
  itb_izq                 numeric(3, 2) check (itb_izq > 0),   -- NULL = «no evaluado»; jamás 0 (P-011)
  itb_der                 numeric(3, 2) check (itb_der > 0),
  deformidades            text[] not null default '{}' check (deformidades <@ array['hallux_valgus', 'garra', 'charcot', 'callosidad', 'fisura', 'maceracion', 'onicomicosis']),
  -- clasificaciones
  wagner                  smallint check (wagner between 0 and 5),
  infeccion_idsa          text check (infeccion_idsa in ('sin_infeccion', 'leve', 'moderada', 'grave')),
  perfusion_wifi          smallint check (perfusion_wifi between 0 and 3),
  riesgo_sugerido         smallint check (riesgo_sugerido between 0 and 3),     -- solo si los criterios están activos (P-010)
  riesgo_confirmado       smallint check (riesgo_confirmado between 0 and 3),   -- el podólogo confirma
  frecuencia_revision     text check (frecuencia_revision in ('cada_1_mes', 'cada_2_meses', 'cada_3_meses', 'cada_6_meses', 'anual')),
  proxima_revision        date,
  recordatorio_paciente   boolean not null default true,
  alerta_si_vence         boolean not null default true,
  generar_carta_referencia boolean not null default false,   -- angiología / endocrinología (documento en 039)
  indicar_calzado_plantilla boolean not null default false,
  educacion_plan          text,
  firma_id                uuid references piefirme.firmas(id),
  firmada_en              timestamptz,
  hash_contenido          text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (estado <> 'firmada' or (firma_id is not null and firmada_en is not null and sensibilidad_protectora is not null
                                 and frecuencia_revision is not null and proxima_revision is not null)),
  check (hba1c is null or hba1c_fecha is not null)
);
create index on piefirme.valoraciones_pie_diabetico (organizacion_id, paciente_id, fecha desc);
create index on piefirme.valoraciones_pie_diabetico (organizacion_id, sede_id, proxima_revision);

create table piefirme.monofilamento_sitios (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  valoracion_id    uuid not null references piefirme.valoraciones_pie_diabetico(id) on delete cascade,
  pie              text not null check (pie in ('D', 'I')),
  sitio            text not null check (sitio in ('dedo1', 'dedo3', 'dedo5', 'mt1', 'mt3', 'mt5', 'mediopie_medial', 'mediopie_lateral', 'talon', 'dorso')),
  siente           boolean not null,
  created_at       timestamptz not null default now(),
  unique (valoracion_id, pie, sitio)
);
create index on piefirme.monofilamento_sitios (organizacion_id, valoracion_id);

create table piefirme.ulceras_pie (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  valoracion_id    uuid not null references piefirme.valoraciones_pie_diabetico(id) on delete cascade,
  pie              text not null check (pie in ('D', 'I')),
  zona_codigo      text not null references piefirme.catalogo_zonas_pie(codigo),
  localizacion_texto text,                                   -- «cabeza MT 3 plantar»
  area_cm2         numeric(6, 2) not null check (area_cm2 >= 0),
  profundidad      text not null check (profundidad in ('piel', 'subcutaneo', 'musculo_tendon', 'hueso_articulacion')),
  -- SINBAD: Sitio, Isquemia, Neuropatía, infección Bacteriana, Área, Profundidad (0/1 cada uno); se derivan si no se capturan
  s                smallint check (s in (0, 1)),
  i                smallint check (i in (0, 1)),
  n                smallint check (n in (0, 1)),
  b                smallint check (b in (0, 1)),
  a                smallint check (a in (0, 1)),
  d                smallint check (d in (0, 1)),
  puntaje_sinbad   smallint generated always as (coalesce(s, 0) + coalesce(i, 0) + coalesce(n, 0) + coalesce(b, 0) + coalesce(a, 0) + coalesce(d, 0)) stored,
  created_at       timestamptz not null default now()
);
create index on piefirme.ulceras_pie (organizacion_id, valoracion_id);

-- ═════════════════════ reglas ═════════════════════
create or replace function piefirme_app.valoracion_pd_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_per record; v_activos boolean;
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then raise exception 'La valoración nace en borrador' using errcode = 'P0001'; end if;
    if not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'Paciente de otra clínica' using errcode = 'P0001';
    end if;
    if new.consulta_id is not null and not exists (select 1 from piefirme.consultas c where c.id = new.consulta_id and c.paciente_id = new.paciente_id) then
      raise exception 'La consulta no corresponde al paciente' using errcode = 'P0001';
    end if;
  else
    if old.estado = 'firmada' then raise exception 'La valoración firmada no se modifica; registre una nueva valoración' using errcode = 'P0001'; end if;
    if new.paciente_id <> old.paciente_id or new.podologo_id <> old.podologo_id then raise exception 'Paciente y podólogo no se cambian' using errcode = 'P0001'; end if;
  end if;
  -- P-010: la propuesta de riesgo solo existe con criterios validados y activados por la clínica
  select coalesce((o.parametros ->> 'pie_diabetico_criterios_activos')::boolean, false) into v_activos from piefirme.organizaciones o where o.id = new.organizacion_id;
  if not v_activos then new.riesgo_sugerido := null; end if;
  if new.estado = 'firmada' then
    select cedula into v_per from piefirme.perfiles where id = new.podologo_id;
    if nullif(btrim(coalesce(v_per.cedula, '')), '') is null then raise exception 'El podólogo necesita cédula profesional para firmar (P-146)' using errcode = 'P0001'; end if;
    new.firmada_en := case when auth.uid() is null and new.firmada_en is not null then new.firmada_en else now() end;
    new.hash_contenido := encode(sha256(convert_to((to_jsonb(new) - array['updated_at', 'hash_contenido'])::text, 'UTF8')), 'hex');
  end if;
  return new;
end $$;
create trigger t_valoracion_bi before insert or update on piefirme.valoraciones_pie_diabetico for each row execute function piefirme_app.valoracion_pd_bi();
create or replace function piefirme_app.valoracion_pd_bd() returns trigger language plpgsql as $$
begin
  if old.estado = 'firmada' then raise exception 'Una valoración firmada no se borra (P-127)' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger t_valoracion_bd before delete on piefirme.valoraciones_pie_diabetico for each row execute function piefirme_app.valoracion_pd_bd();

-- Hijos de la valoración: misma clínica y bloqueados tras la firma
create or replace function piefirme_app.hijo_valoracion_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_row jsonb; v_v record;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  select estado, organizacion_id into v_v from piefirme.valoraciones_pie_diabetico where id = (v_row ->> 'valoracion_id')::uuid;
  if v_v.organizacion_id is null then raise exception 'Valoración no encontrada' using errcode = 'P0001'; end if;
  if tg_op <> 'DELETE' and (v_row ->> 'organizacion_id')::uuid <> v_v.organizacion_id then raise exception 'Valoración de otra clínica' using errcode = 'P0001'; end if;
  if v_v.estado = 'firmada' then raise exception 'La valoración está firmada: sus detalles no se modifican' using errcode = 'P0001'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger t_hijo before insert or update or delete on piefirme.monofilamento_sitios for each row execute function piefirme_app.hijo_valoracion_bi();
create trigger t_hijo before insert or update or delete on piefirme.ulceras_pie for each row execute function piefirme_app.hijo_valoracion_bi();

-- SINBAD derivado de los datos capturados cuando el podólogo no lo fija a mano.
create or replace function piefirme_app.ulcera_sinbad_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v record; v_region text;
begin
  select * into v from piefirme.valoraciones_pie_diabetico where id = new.valoracion_id;
  select region into v_region from piefirme.catalogo_zonas_pie where codigo = new.zona_codigo;
  new.s := coalesce(new.s, case when v_region in ('mediopie', 'talon') then 1 else 0 end);
  new.a := coalesce(new.a, case when new.area_cm2 >= 1 then 1 else 0 end);
  new.d := coalesce(new.d, case when new.profundidad in ('musculo_tendon', 'hueso_articulacion') then 1 else 0 end);
  new.n := coalesce(new.n, case when v.sensibilidad_protectora = 'ausente' then 1 else 0 end);
  new.b := coalesce(new.b, case when v.infeccion_idsa in ('leve', 'moderada', 'grave') then 1 else 0 end);
  new.i := coalesce(new.i, case when (case when new.pie = 'D' then v.pulso_pedio_der else v.pulso_pedio_izq end) = 'ausente'
                                 and (case when new.pie = 'D' then v.pulso_tibial_der else v.pulso_tibial_izq end) = 'ausente' then 1 else 0 end);
  return new;
end $$;
create trigger t_ulcera_sinbad before insert or update on piefirme.ulceras_pie for each row execute function piefirme_app.ulcera_sinbad_bi();

-- ═════════════════════ RLS ═════════════════════
alter table piefirme.valoraciones_pie_diabetico enable row level security;
create policy valoraciones_pie_diabetico_sel on piefirme.valoraciones_pie_diabetico for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo'));
create policy valoraciones_pie_diabetico_ins on piefirme.valoraciones_pie_diabetico for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = 'podologo' and podologo_id = auth.uid() and piefirme_app.puede_sede(sede_id));
create policy valoraciones_pie_diabetico_upd on piefirme.valoraciones_pie_diabetico for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = 'podologo' and podologo_id = auth.uid() and estado = 'borrador')
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and podologo_id = auth.uid());
create policy valoraciones_pie_diabetico_del on piefirme.valoraciones_pie_diabetico for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = 'podologo' and podologo_id = auth.uid() and estado = 'borrador');
select piefirme_app.a_politicas('monofilamento_sitios', array['administrador', 'podologo'], array['podologo'], array['podologo']);
select piefirme_app.a_politicas('ulceras_pie', array['administrador', 'podologo'], array['podologo'], array['podologo']);

select piefirme_app.a_triggers('valoraciones_pie_diabetico');
select piefirme_app.a_triggers('monofilamento_sitios', false);
select piefirme_app.a_triggers('ulceras_pie');

-- ═════════════════════ vistas ═════════════════════
-- Resumen por pie: «3 de 10 sitios sin sensibilidad» (derivado)
create view piefirme.prp_monofilamento_resumen with (security_invoker = true) as
select m.valoracion_id, m.organizacion_id, m.pie, count(*) as sitios_evaluados, count(*) filter (where not m.siente) as sitios_sin_sensibilidad
  from piefirme.monofilamento_sitios m group by m.valoracion_id, m.organizacion_id, m.pie;

-- Última valoración firmada por paciente y estado de la revisión (alerta «revisión vencida hace N días», P-012/P-052)
create view piefirme.prp_pie_diabetico_revisiones with (security_invoker = true) as
select distinct on (v.paciente_id) v.id as valoracion_id, v.organizacion_id, v.paciente_id, v.sede_id, v.podologo_id, v.fecha,
       coalesce(v.riesgo_confirmado, v.riesgo_sugerido) as categoria_riesgo, v.frecuencia_revision, v.proxima_revision, v.alerta_si_vence,
       (v.proxima_revision < current_date) as revision_vencida,
       greatest(current_date - v.proxima_revision, 0) as dias_vencida
  from piefirme.valoraciones_pie_diabetico v
 where v.estado = 'firmada'
 order by v.paciente_id, v.fecha desc, v.firmada_en desc;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on all tables in schema piefirme from anon;
