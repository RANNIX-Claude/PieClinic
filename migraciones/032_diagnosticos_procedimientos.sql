-- 032 · A (Clínico) · Catálogo CIE-10 (global, solo lectura), favoritos por clínica, catálogo de procedimientos y de medicamentos,
-- diagnósticos de la consulta (lista corta del formato real + CIE-10 opcional), procedimientos realizados, indicaciones/receta y consumos.
-- Fuentes: DICCIONARIO E35, E36, E40, E41, E42; REGLAS P-031 (diagnóstico = lista corta; CIE-10 opcional), P-079, P-145.
-- Depende de: 001, 010, 031, productos/servicios (B).

-- ═════════════════════ CIE-10 global (P-128: catálogo de referencia de RANNIX, solo lectura) ═════════════════════
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.cie10_catalogo (
  codigo       text primary key,
  descripcion  text not null,
  grupo        text not null default 'podologia',
  activo       boolean not null default true
);
alter table piefirme.cie10_catalogo enable row level security;
-- Lectura para cualquier usuario con sesión de una clínica; sin políticas de escritura (solo service_role).
create policy cie10_catalogo_sel on piefirme.cie10_catalogo for select to authenticated using (piefirme_app.org_id() is not null);

-- Subconjunto frecuente en podología (referencia; el catálogo oficial completo se carga por service_role).
insert into piefirme.cie10_catalogo (codigo, descripcion, grupo) values
 ('L60.0', 'Uña encarnada', 'ungueal'), ('L60.1', 'Onicólisis', 'ungueal'), ('L60.2', 'Onicogrifosis', 'ungueal'),
 ('L60.3', 'Distrofia de las uñas', 'ungueal'), ('L60.8', 'Otros trastornos de las uñas', 'ungueal'), ('L60.9', 'Trastorno de las uñas, no especificado', 'ungueal'),
 ('L03.0', 'Celulitis de dedos de la mano y del pie (paroniquia)', 'infeccion'), ('L08.9', 'Infección local de la piel y del tejido subcutáneo, no especificada', 'infeccion'),
 ('L02.4', 'Absceso cutáneo, forúnculo y ántrax de miembro', 'infeccion'),
 ('L84', 'Callos y callosidades', 'dermatologico'), ('L85.1', 'Queratosis adquirida (queratodermia) palmar y plantar', 'dermatologico'),
 ('L85.9', 'Engrosamiento epidérmico, no especificado (hiperqueratosis)', 'dermatologico'), ('L74.5', 'Hiperhidrosis focal', 'dermatologico'),
 ('L97', 'Úlcera de miembro inferior, no clasificada en otra parte', 'dermatologico'), ('L98.4', 'Úlcera crónica de la piel, no clasificada en otra parte', 'dermatologico'),
 ('L40.9', 'Psoriasis, no especificada', 'dermatologico'), ('L30.9', 'Dermatitis, no especificada', 'dermatologico'),
 ('B35.1', 'Tiña de las uñas (onicomicosis)', 'micosis'), ('B35.3', 'Tiña del pie (pie de atleta)', 'micosis'),
 ('B35.9', 'Dermatofitosis, no especificada', 'micosis'), ('B36.9', 'Micosis superficial, no especificada', 'micosis'),
 ('B07.0', 'Verruga plantar (papiloma plantar)', 'viral'), ('B07.8', 'Otras verrugas víricas', 'viral'), ('B07.9', 'Verruga vírica, no especificada', 'viral'),
 ('E10.4', 'Diabetes mellitus tipo 1 con complicaciones neurológicas', 'diabetes'), ('E10.5', 'Diabetes mellitus tipo 1 con complicaciones circulatorias periféricas', 'diabetes'),
 ('E10.9', 'Diabetes mellitus tipo 1 sin complicaciones', 'diabetes'),
 ('E11.4', 'Diabetes mellitus tipo 2 con complicaciones neurológicas', 'diabetes'), ('E11.5', 'Diabetes mellitus tipo 2 con complicaciones circulatorias periféricas', 'diabetes'),
 ('E11.6', 'Diabetes mellitus tipo 2 con otras complicaciones especificadas', 'diabetes'), ('E11.9', 'Diabetes mellitus tipo 2 sin complicaciones', 'diabetes'),
 ('G62.9', 'Polineuropatía, no especificada', 'neurologico'), ('G63.2', 'Polineuropatía diabética', 'neurologico'),
 ('I73.9', 'Enfermedad vascular periférica, no especificada', 'vascular'), ('I70.2', 'Aterosclerosis de las arterias de las extremidades', 'vascular'),
 ('I83.0', 'Várices de miembros inferiores con úlcera', 'vascular'), ('I83.9', 'Várices de miembros inferiores sin úlcera ni inflamación', 'vascular'),
 ('M20.1', 'Hallux valgus (adquirido)', 'ortopedico'), ('M20.2', 'Hallux rigidus', 'ortopedico'), ('M20.3', 'Otras deformidades del dedo gordo del pie', 'ortopedico'),
 ('M20.4', 'Otro(s) dedo(s) del pie en martillo (adquirido)', 'ortopedico'), ('M20.5', 'Otras deformidades de los dedos del pie (adquiridas)', 'ortopedico'),
 ('M21.4', 'Pie plano (adquirido)', 'ortopedico'), ('M21.5', 'Pie zambo y pie cavo adquiridos', 'ortopedico'),
 ('M21.6', 'Otras deformidades adquiridas del pie y del tobillo', 'ortopedico'), ('M21.7', 'Longitud desigual de los miembros (adquirida)', 'ortopedico'),
 ('M72.2', 'Fibromatosis de la fascia plantar (fascitis plantar)', 'ortopedico'), ('M77.3', 'Espolón calcáneo', 'ortopedico'),
 ('M77.4', 'Metatarsalgia', 'ortopedico'), ('M77.5', 'Otras entesopatías del pie', 'ortopedico'), ('M79.67', 'Dolor en el pie y los dedos del pie', 'ortopedico'),
 ('M25.57', 'Dolor en articulación del tobillo y del pie', 'ortopedico'), ('M10.9', 'Gota, no especificada', 'ortopedico'),
 ('Q66.0', 'Pie equinovaro congénito', 'ortopedico'), ('Q66.5', 'Pie plano congénito', 'ortopedico'), ('Q66.7', 'Pie cavo congénito', 'ortopedico'),
 ('R22.4', 'Tumefacción, masa o prominencia localizada en miembro(s) inferior(es)', 'sintoma'), ('Z51.8', 'Otra atención médica especificada (curación/seguimiento)', 'seguimiento')
on conflict (codigo) do nothing;

create table piefirme.cie10_favoritos (
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo           text not null references piefirme.cie10_catalogo(codigo),
  orden            integer not null default 0,
  created_at       timestamptz not null default now(),
  primary key (organizacion_id, codigo)
);

-- E41 procedimientos propios de la clínica
create table piefirme.catalogo_procedimientos (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo                   text not null,
  nombre                   text not null,
  descripcion              text,
  servicio_id              uuid references piefirme.servicios(id) on delete set null,
  requiere_consentimiento  boolean not null default false,   -- P-019: consentimiento en consulta, por procedimiento
  anestesia_tipica         text check (anestesia_tipica in ('no_aplico', 'topica', 'infiltrativa', 'otra')),
  duracion_min             integer check (duracion_min > 0),
  activo                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organizacion_id, codigo)
);
create index on piefirme.catalogo_procedimientos (organizacion_id, activo);

-- P-145: catálogo de medicamentos configurable por la clínica (RANNIX no restringe ni valida)
create table piefirme.catalogo_medicamentos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  nombre           text not null,
  presentacion     text,
  via_habitual     text,
  advertencia      text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, nombre, presentacion)
);

-- E36 diagnóstico de la consulta: lista corta del formato real; CIE-10 opcional (P-031)
create table piefirme.diagnosticos_consulta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  tipo             text not null default 'principal' check (tipo in ('principal', 'secundario')),
  categoria        text check (categoria in ('onicomicosis', 'papiloma_plantar', 'pie_atleta', 'micosis', 'hiperqueratosis', 'otros')),
  texto_otros      text,                                   -- «otros»: texto libre
  cie10_codigo     text references piefirme.cie10_catalogo(codigo),
  notas            text,
  created_at       timestamptz not null default now(),
  check (categoria is not null or cie10_codigo is not null),
  check (categoria is distinct from 'otros' or length(btrim(coalesce(texto_otros, ''))) > 0)
);
create index on piefirme.diagnosticos_consulta (organizacion_id, consulta_id);
create index on piefirme.diagnosticos_consulta (organizacion_id, categoria);
create unique index diagnostico_un_principal on piefirme.diagnosticos_consulta (consulta_id) where tipo = 'principal';
create trigger t_hijo before insert or update or delete on piefirme.diagnosticos_consulta for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

-- Procedimientos realizados
create table piefirme.procedimientos_consulta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  procedimiento_id uuid not null references piefirme.catalogo_procedimientos(id),
  es_principal     boolean not null default false,
  anestesia        text check (anestesia in ('no_aplico', 'topica', 'infiltrativa', 'otra')),
  descripcion      text,
  consentimiento_id uuid references piefirme.consentimientos(id),   -- consentimiento informado del procedimiento
  created_at       timestamptz not null default now()
);
create index on piefirme.procedimientos_consulta (organizacion_id, consulta_id);
create unique index procedimiento_un_principal on piefirme.procedimientos_consulta (consulta_id) where es_principal;
create trigger t_hijo before insert or update or delete on piefirme.procedimientos_consulta for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

-- E40 indicaciones / receta
create table piefirme.indicaciones_consulta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  tipo             text not null check (tipo in ('medicamento', 'no_farmacologica')),
  medicamento_id   uuid references piefirme.catalogo_medicamentos(id),
  medicamento      text,
  dosis            text,
  via              text,
  frecuencia       text,
  duracion         text,
  indicacion       text,                                  -- «Calzado abierto 1 semana»
  es_receta        boolean not null default false,
  medio_entrega    text not null default 'pendiente' check (medio_entrega in ('pendiente', 'impresa', 'enviada')),
  entregada_en     timestamptz,
  created_at       timestamptz not null default now(),
  check (tipo <> 'medicamento' or medicamento is not null or medicamento_id is not null),
  check (tipo <> 'no_farmacologica' or length(btrim(coalesce(indicacion, ''))) > 0)
);
create index on piefirme.indicaciones_consulta (organizacion_id, consulta_id);
create trigger t_hijo before insert or update or delete on piefirme.indicaciones_consulta for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

-- E42 consumo de producto/material (alimenta venta e inventario de la sede, P-079). Se captura hasta que el cobro lo consume: sin bloqueo por cierre.
create table piefirme.consumos_consulta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  producto_id      uuid not null references piefirme.productos(id),
  lote_id          uuid,                                  -- lote de inventario (C); sin FK
  lote_texto       text,
  caducidad        date,
  cantidad         numeric(10, 3) not null check (cantidad > 0),
  cobrar           boolean not null default false,
  venta_id         uuid references piefirme.ventas(id),     -- venta donde se cobró (B)
  notas            text,
  registrado_por   uuid references piefirme.perfiles(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.consumos_consulta (organizacion_id, consulta_id);
create index on piefirme.consumos_consulta (organizacion_id, producto_id);
create trigger t_hijo before insert or update on piefirme.consumos_consulta for each row execute function piefirme_app.hijo_consulta_bi('libre');

-- ═════════════════════ RLS ═════════════════════
select piefirme_app.a_politicas('catalogo_procedimientos', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador']);
select piefirme_app.a_politicas('catalogo_medicamentos', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador']);
select piefirme_app.a_politicas('cie10_favoritos', array['administrador', 'podologo'], array['administrador', 'podologo'], array['administrador', 'podologo']);
select piefirme_app.a_politicas('diagnosticos_consulta', array['administrador', 'podologo'], array['podologo'], array['podologo']);
select piefirme_app.a_politicas('procedimientos_consulta', array['administrador', 'podologo'], array['podologo'], array['podologo']);
select piefirme_app.a_politicas('indicaciones_consulta', array['administrador', 'podologo'], array['podologo'], array['podologo']);
-- consumos: el podólogo los captura; Recepción los ve para cobrar (no hay dato clínico en esta tabla)
select piefirme_app.a_politicas('consumos_consulta', array['administrador', 'podologo', 'recepcion'], array['podologo', 'administrador'], array['podologo'], true);

select piefirme_app.a_triggers('catalogo_procedimientos');
select piefirme_app.a_triggers('catalogo_medicamentos', false);
select piefirme_app.a_triggers('diagnosticos_consulta');
select piefirme_app.a_triggers('procedimientos_consulta');
select piefirme_app.a_triggers('indicaciones_consulta');
select piefirme_app.a_triggers('consumos_consulta');

-- Diagnósticos más frecuentes por clínica (vista de apoyo a favoritos)
create view piefirme.prp_diagnosticos_frecuentes with (security_invoker = true) as
select d.organizacion_id, coalesce(d.categoria, d.cie10_codigo) as diagnostico, d.cie10_codigo, count(*) as veces,
       count(distinct c.paciente_id) as pacientes, max(c.fecha_hora) as ultima_vez
  from piefirme.diagnosticos_consulta d join piefirme.consultas c on c.id = d.consulta_id
 where c.estado = 'cerrada'
 group by d.organizacion_id, coalesce(d.categoria, d.cie10_codigo), d.cie10_codigo;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on all tables in schema piefirme from anon;
