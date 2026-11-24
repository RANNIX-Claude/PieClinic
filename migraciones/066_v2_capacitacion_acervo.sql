-- 066 · V2 · Capacitación (cursos, lecciones, avance, evaluaciones) y acervo de documentos.
-- Videos: se graban y se suben a YouTube («no listado»); aquí solo se guarda el ENLACE (video_url) y se reproduce incrustado.
-- Visibilidad: cada persona ve los cursos/documentos de su cargo (cargos vacío = todos) y de su sede (sede_id nulo = todas);
--   el administrador ve todo y es quien escribe. El avance es de cada persona (el administrador ve el de todos).
-- Depende de: 001, 040 (c_politicas, c_triggers, c_heredar_de_padre), 064 (cargo()).
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.cursos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),                 -- nulo = todas las sedes
  titulo           text not null,
  descripcion      text,
  categoria        text not null default 'general',
  cargos           text[] not null default '{}',                       -- cargos a quienes aplica; vacío = todos
  obligatorio      boolean not null default false,
  duracion_min     integer check (duracion_min is null or duracion_min >= 0),
  portada_path     text,
  orden            integer not null default 99,
  activo           boolean not null default true,
  sintetico        boolean not null default false,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (cargos <@ array['direccion', 'admin', 'gerente', 'almacen', 'cajero', 'recepcion', 'asistente', 'podologo']::text[])
);
create index on piefirme.cursos (organizacion_id, activo, orden);

create table piefirme.lecciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  curso_id         uuid not null references piefirme.cursos(id) on delete cascade,
  orden            integer not null default 1,
  titulo           text not null,
  tipo             text not null check (tipo in ('video', 'foto', 'documento', 'texto')),
  video_url        text check (video_url is null or video_url ~* '^https://(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)/'),
  video_pendiente  boolean not null default false,                     -- el video aún no se graba/sube: se muestra «próximamente»
  recurso_path     text,                                               -- foto o documento en el bucket pf-acervo
  contenido        text,                                               -- cuerpo de texto (lecciones tipo texto o resumen)
  duracion_min     integer check (duracion_min is null or duracion_min >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (curso_id, orden),
  check (tipo <> 'video' or video_url is not null or video_pendiente),
  check (tipo <> 'texto' or contenido is not null)
);
create index on piefirme.lecciones (organizacion_id, curso_id, orden);
create trigger t_a_padre before insert on piefirme.lecciones for each row execute function piefirme_app.c_heredar_de_padre('cursos', 'curso_id');

create table piefirme.curso_avance (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  perfil_id        uuid not null default auth.uid() references piefirme.perfiles(id) on delete cascade,
  curso_id         uuid not null references piefirme.cursos(id) on delete cascade,
  leccion_id       uuid not null references piefirme.lecciones(id) on delete cascade,
  completado_en    timestamptz not null default now(),
  unique (perfil_id, leccion_id)
);
create index on piefirme.curso_avance (organizacion_id, perfil_id, curso_id);
create trigger t_a_padre before insert on piefirme.curso_avance for each row execute function piefirme_app.c_heredar_de_padre('cursos', 'curso_id');

-- evaluaciones opcionales de un curso
create table piefirme.curso_evaluaciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  curso_id         uuid not null references piefirme.cursos(id) on delete cascade,
  orden            integer not null default 1,
  pregunta         text not null,
  opciones         jsonb not null,                                      -- ["A…", "B…", "C…"]
  correcta         integer not null check (correcta >= 0),              -- índice (base 0) de la opción correcta
  puntos           integer not null default 1 check (puntos > 0),
  created_at       timestamptz not null default now(),
  unique (curso_id, orden),
  check (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) >= 2 and correcta < jsonb_array_length(opciones))
);
create trigger t_a_padre before insert on piefirme.curso_evaluaciones for each row execute function piefirme_app.c_heredar_de_padre('cursos', 'curso_id');

create table piefirme.curso_resultados (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  perfil_id        uuid not null default auth.uid() references piefirme.perfiles(id) on delete cascade,
  curso_id         uuid not null references piefirme.cursos(id) on delete cascade,
  intento          integer not null default 1 check (intento > 0),
  calificacion     numeric(5,2) not null check (calificacion between 0 and 100),
  aprobado         boolean not null,
  respuestas       jsonb not null default '[]'::jsonb,
  realizado_en     timestamptz not null default now(),
  unique (perfil_id, curso_id, intento)
);
create index on piefirme.curso_resultados (organizacion_id, curso_id);
create trigger t_a_padre before insert on piefirme.curso_resultados for each row execute function piefirme_app.c_heredar_de_padre('cursos', 'curso_id');

-- acervo: manuales, formatos, políticas, enlaces y textos de consulta
create table piefirme.acervo_documentos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),                 -- nulo = todas
  titulo           text not null,
  tipo             text not null check (tipo in ('manual', 'formato', 'politica', 'procedimiento', 'guia', 'enlace', 'video', 'foto', 'texto')),
  url              text,
  storage_path     text,                                               -- bucket pf-acervo: <organizacion_id>/…
  contenido        text,                                               -- texto del documento cuando vive en el sistema
  categoria        text not null default 'general',
  etiquetas        text[] not null default '{}',
  cargos           text[] not null default '{}',                       -- vacío = todos
  version          text not null default '1.0',
  estado           text not null default 'vigente' check (estado in ('borrador', 'vigente', 'archivado')),
  sintetico        boolean not null default false,
  publicado_por    uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (url is not null or storage_path is not null or contenido is not null),
  check (storage_path is null or split_part(storage_path, '/', 1) = organizacion_id::text),
  check (cargos <@ array['direccion', 'admin', 'gerente', 'almacen', 'cajero', 'recepcion', 'asistente', 'podologo']::text[])
);
create index on piefirme.acervo_documentos (organizacion_id, estado, categoria);
create index on piefirme.acervo_documentos using gin (etiquetas);

select piefirme_app.c_triggers('cursos', true);
select piefirme_app.c_triggers('lecciones', true);
select piefirme_app.c_triggers('acervo_documentos', true);

-- políticas: lectura por cargo y sede; escritura solo administrador
select piefirme_app.c_politicas('cursos',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$piefirme_app.es_admin() or (activo and (cargos = '{}' or piefirme_app.cargo() = any(cargos)) and (sede_id is null or piefirme_app.puede_sede(sede_id)))$c$);
select piefirme_app.c_politicas('lecciones',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.cursos c where c.id = curso_id)$c$);
select piefirme_app.c_politicas('curso_evaluaciones',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.cursos c where c.id = curso_id)$c$);
select piefirme_app.c_politicas('curso_avance',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array[]::text[], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$perfil_id = auth.uid() or piefirme_app.es_admin()$c$,
  p_cond_ins => $c$perfil_id = auth.uid() and exists (select 1 from piefirme.lecciones l where l.id = leccion_id and l.curso_id = curso_avance.curso_id)$c$,
  p_cond_del => $c$perfil_id = auth.uid() or piefirme_app.es_admin()$c$);
select piefirme_app.c_politicas('curso_resultados',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array[]::text[], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$perfil_id = auth.uid() or piefirme_app.es_admin()$c$,
  p_cond_ins => $c$perfil_id = auth.uid()$c$);
select piefirme_app.c_politicas('acervo_documentos',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$piefirme_app.es_admin() or (estado = 'vigente' and (cargos = '{}' or piefirme_app.cargo() = any(cargos)) and (sede_id is null or piefirme_app.puede_sede(sede_id)))$c$);
