-- 070 · V2 · Comunicación interna: mensajes (hilos), correo interno y feed de la clínica.
-- Privacidad: los hilos DIRECTOS solo los ven sus dos miembros (ni el administrador); grupos, sucursal y rol los ven sus miembros y el administrador.
-- El correo lo ven el remitente y los destinatarios (un borrador solo su autor). El feed es de toda la clínica, por alcance (todos o una sede).
-- Funciones definer con search_path fijo para evitar recursión de RLS entre hilos↔miembros y correos↔destinatarios.
-- Adjuntos: jsonb [{nombre, path, mime}] con archivos en el bucket pf-equipo (<organizacion_id>/…). Sin correo saliente real: es mensajería INTERNA.
-- Depende de: 001, 040, 064.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── mensajes ─────────────────────────────
create table piefirme.com_hilos (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  tipo                 text not null check (tipo in ('directo', 'grupo', 'sucursal', 'rol')),
  nombre               text,
  sede_id              uuid references piefirme.sedes(id),             -- hilos de sucursal
  cargo                text check (cargo is null or cargo in ('direccion', 'admin', 'gerente', 'almacen', 'cajero', 'recepcion', 'asistente', 'podologo')),   -- hilos de rol
  creado_por           uuid not null default auth.uid() references piefirme.perfiles(id),
  ultimo_mensaje_en    timestamptz,
  sintetico            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (tipo = 'directo' or nombre is not null)
);
create index on piefirme.com_hilos (organizacion_id, ultimo_mensaje_en desc);

create table piefirme.com_hilo_miembros (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  hilo_id          uuid not null references piefirme.com_hilos(id) on delete cascade,
  perfil_id        uuid not null references piefirme.perfiles(id) on delete cascade,
  rol_en_hilo      text not null default 'miembro' check (rol_en_hilo in ('miembro', 'admin')),
  silenciado       boolean not null default false,
  unido_en         timestamptz not null default now(),
  unique (hilo_id, perfil_id)
);
create index on piefirme.com_hilo_miembros (organizacion_id, perfil_id);

create table piefirme.com_mensajes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  hilo_id          uuid not null references piefirme.com_hilos(id) on delete cascade,
  autor_id         uuid not null default auth.uid() references piefirme.perfiles(id),
  texto            text not null check (length(texto) between 1 and 5000),
  adjuntos         jsonb not null default '[]'::jsonb,
  editado_en       timestamptz,
  created_at       timestamptz not null default now()
);
create index on piefirme.com_mensajes (hilo_id, created_at);
create index on piefirme.com_mensajes (organizacion_id, autor_id);

create table piefirme.com_mensaje_lecturas (
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  mensaje_id       uuid not null references piefirme.com_mensajes(id) on delete cascade,
  perfil_id        uuid not null default auth.uid() references piefirme.perfiles(id) on delete cascade,
  leido_en         timestamptz not null default now(),
  primary key (mensaje_id, perfil_id)
);
create index on piefirme.com_mensaje_lecturas (organizacion_id, perfil_id);

create or replace function piefirme_app.es_miembro_hilo(p_hilo uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.com_hilo_miembros m where m.hilo_id = p_hilo and m.perfil_id = auth.uid() and m.organizacion_id = piefirme_app.org_id())
$$;
create or replace function piefirme_app.puede_ver_hilo(p_hilo uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.com_hilos h
                  where h.id = p_hilo and h.organizacion_id = piefirme_app.org_id()
                    and (h.creado_por = auth.uid()
                         or exists (select 1 from piefirme.com_hilo_miembros m where m.hilo_id = h.id and m.perfil_id = auth.uid())
                         or (h.tipo <> 'directo' and piefirme_app.es_admin())))
$$;
create or replace function piefirme_app.es_creador_hilo(p_hilo uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.com_hilos h where h.id = p_hilo and h.organizacion_id = piefirme_app.org_id() and h.creado_por = auth.uid())
$$;

create trigger t_a_padre before insert on piefirme.com_hilo_miembros for each row execute function piefirme_app.c_heredar_de_padre('com_hilos', 'hilo_id');
create trigger t_a_padre before insert on piefirme.com_mensajes for each row execute function piefirme_app.c_heredar_de_padre('com_hilos', 'hilo_id');
create trigger t_a_padre before insert on piefirme.com_mensaje_lecturas for each row execute function piefirme_app.c_heredar_de_padre('com_mensajes', 'mensaje_id');

-- el último mensaje actualiza el hilo (para ordenar la bandeja)
create or replace function piefirme_app.com_mensaje_tocar_hilo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.com_hilos set ultimo_mensaje_en = new.created_at where id = new.hilo_id and (ultimo_mensaje_en is null or ultimo_mensaje_en < new.created_at);
  return null;
end $$;
create trigger t_tocar_hilo after insert on piefirme.com_mensajes for each row execute function piefirme_app.com_mensaje_tocar_hilo();

select piefirme_app.c_triggers('com_hilos', false);

select piefirme_app.c_politicas('com_hilos',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$piefirme_app.puede_ver_hilo(id)$c$,
  p_cond_ins => $c$creado_por = auth.uid() and (tipo in ('directo', 'grupo') or piefirme_app.es_admin())$c$,
  p_cond_upd => $c$creado_por = auth.uid() or (tipo <> 'directo' and piefirme_app.es_admin())$c$,
  p_cond_del => $c$creado_por = auth.uid() or (tipo <> 'directo' and piefirme_app.es_admin())$c$);
select piefirme_app.c_politicas('com_hilo_miembros',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$piefirme_app.puede_ver_hilo(hilo_id)$c$,
  p_cond_ins => $c$piefirme_app.es_creador_hilo(hilo_id) or (piefirme_app.es_admin() and exists (select 1 from piefirme.com_hilos h where h.id = hilo_id and h.tipo <> 'directo'))$c$,
  p_cond_upd => $c$perfil_id = auth.uid()$c$,
  p_cond_del => $c$perfil_id = auth.uid() or piefirme_app.es_creador_hilo(hilo_id)$c$);
select piefirme_app.c_politicas('com_mensajes',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$piefirme_app.puede_ver_hilo(hilo_id)$c$,
  p_cond_ins => $c$autor_id = auth.uid() and piefirme_app.es_miembro_hilo(hilo_id)$c$,
  p_cond_upd => $c$autor_id = auth.uid()$c$,
  p_cond_del => $c$autor_id = auth.uid() or (piefirme_app.es_admin() and exists (select 1 from piefirme.com_hilos h where h.id = hilo_id and h.tipo <> 'directo'))$c$);
select piefirme_app.c_politicas('com_mensaje_lecturas',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array[]::text[], p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.com_mensajes m where m.id = mensaje_id)$c$,
  p_cond_ins => $c$perfil_id = auth.uid() and exists (select 1 from piefirme.com_mensajes m where m.id = mensaje_id and piefirme_app.es_miembro_hilo(m.hilo_id))$c$,
  p_cond_upd => $c$perfil_id = auth.uid()$c$);

-- ───────────────────────────── correo interno ─────────────────────────────
create table piefirme.correos_internos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  de_perfil_id     uuid not null default auth.uid() references piefirme.perfiles(id),
  asunto           text not null check (length(asunto) between 1 and 300),
  cuerpo           text not null,
  adjuntos         jsonb not null default '[]'::jsonb,
  respuesta_a_id   uuid references piefirme.correos_internos(id) on delete set null,
  borrador         boolean not null default false,
  enviado_en       timestamptz,
  sintetico        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (borrador or enviado_en is not null)
);
create index on piefirme.correos_internos (organizacion_id, de_perfil_id, enviado_en desc);

create table piefirme.correo_destinatarios (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  correo_id        uuid not null references piefirme.correos_internos(id) on delete cascade,
  perfil_id        uuid not null references piefirme.perfiles(id) on delete cascade,
  tipo             text not null default 'para' check (tipo in ('para', 'cc')),
  leido_en         timestamptz,
  etiquetas        text[] not null default '{}',
  destacado        boolean not null default false,
  archivado        boolean not null default false,
  eliminado_en     timestamptz,
  unique (correo_id, perfil_id)
);
create index on piefirme.correo_destinatarios (organizacion_id, perfil_id, leido_en);

create or replace function piefirme_app.es_remitente(p_correo uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.correos_internos c where c.id = p_correo and c.organizacion_id = piefirme_app.org_id() and c.de_perfil_id = auth.uid())
$$;
create or replace function piefirme_app.es_destinatario(p_correo uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.correo_destinatarios d join piefirme.correos_internos c on c.id = d.correo_id
                  where d.correo_id = p_correo and d.perfil_id = auth.uid() and d.organizacion_id = piefirme_app.org_id() and not c.borrador)
$$;
create trigger t_a_padre before insert on piefirme.correo_destinatarios for each row execute function piefirme_app.c_heredar_de_padre('correos_internos', 'correo_id');

select piefirme_app.c_politicas('correos_internos',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$de_perfil_id = auth.uid() or piefirme_app.es_destinatario(id)$c$,
  p_cond_ins => $c$de_perfil_id = auth.uid()$c$,
  p_cond_upd => $c$de_perfil_id = auth.uid() and borrador$c$,
  p_cond_del => $c$de_perfil_id = auth.uid() and borrador$c$);
select piefirme_app.c_politicas('correo_destinatarios',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array[]::text[], p_sede => 'no',
  p_cond_ver => $c$(perfil_id = auth.uid() and piefirme_app.es_destinatario(correo_id)) or piefirme_app.es_remitente(correo_id)$c$,
  p_cond_ins => $c$piefirme_app.es_remitente(correo_id)$c$,
  p_cond_upd => $c$perfil_id = auth.uid() and piefirme_app.es_destinatario(correo_id)$c$);
select piefirme_app.c_triggers('correos_internos', false);

-- ───────────────────────────── feed de la clínica ─────────────────────────────
create table piefirme.feed_publicaciones (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  autor_id              uuid not null default auth.uid() references piefirme.perfiles(id),
  tipo                  text not null check (tipo in ('aviso', 'logro', 'reconocimiento', 'evento', 'foto')),
  titulo                text not null,
  texto                 text,
  imagen_path           text,                                           -- bucket pf-equipo
  fijado                boolean not null default false,
  alcance_sede_id       uuid references piefirme.sedes(id),            -- nulo = toda la clínica
  reconocido_perfil_id  uuid references piefirme.perfiles(id),         -- tipo reconocimiento
  evento_fecha          timestamptz,                                   -- tipo evento
  archivada             boolean not null default false,
  sintetico             boolean not null default false,
  publicada_en          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on piefirme.feed_publicaciones (organizacion_id, archivada, fijado desc, publicada_en desc);

create table piefirme.feed_reacciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  publicacion_id   uuid not null references piefirme.feed_publicaciones(id) on delete cascade,
  perfil_id        uuid not null default auth.uid() references piefirme.perfiles(id) on delete cascade,
  emoji            text not null check (length(emoji) between 1 and 8),
  created_at       timestamptz not null default now(),
  unique (publicacion_id, perfil_id, emoji)
);
create table piefirme.feed_comentarios (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  publicacion_id   uuid not null references piefirme.feed_publicaciones(id) on delete cascade,
  autor_id         uuid not null default auth.uid() references piefirme.perfiles(id),
  texto            text not null check (length(texto) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index on piefirme.feed_reacciones (publicacion_id);
create index on piefirme.feed_comentarios (publicacion_id, created_at);
create trigger t_a_padre before insert on piefirme.feed_reacciones for each row execute function piefirme_app.c_heredar_de_padre('feed_publicaciones', 'publicacion_id');
create trigger t_a_padre before insert on piefirme.feed_comentarios for each row execute function piefirme_app.c_heredar_de_padre('feed_publicaciones', 'publicacion_id');
select piefirme_app.c_triggers('feed_publicaciones', false);

select piefirme_app.c_politicas('feed_publicaciones',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array['administrador', 'podologo', 'recepcion'], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$alcance_sede_id is null or piefirme_app.puede_sede(alcance_sede_id) or piefirme_app.es_admin()$c$,
  p_cond_ins => $c$autor_id = auth.uid() and (tipo in ('foto', 'logro') or piefirme_app.es_admin())$c$,
  p_cond_upd => $c$autor_id = auth.uid() or piefirme_app.es_admin()$c$,
  p_cond_del => $c$autor_id = auth.uid() or piefirme_app.es_admin()$c$);
select piefirme_app.c_politicas('feed_reacciones',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array[]::text[], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.feed_publicaciones p where p.id = publicacion_id)$c$,
  p_cond_ins => $c$perfil_id = auth.uid() and exists (select 1 from piefirme.feed_publicaciones p where p.id = publicacion_id)$c$,
  p_cond_del => $c$perfil_id = auth.uid()$c$);
select piefirme_app.c_politicas('feed_comentarios',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'podologo', 'recepcion'], p_upd => array[]::text[], p_del => array['administrador', 'podologo', 'recepcion'], p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.feed_publicaciones p where p.id = publicacion_id)$c$,
  p_cond_ins => $c$autor_id = auth.uid() and exists (select 1 from piefirme.feed_publicaciones p where p.id = publicacion_id)$c$,
  p_cond_del => $c$autor_id = auth.uid() or piefirme_app.es_admin()$c$);

revoke all on function piefirme_app.es_miembro_hilo(uuid), piefirme_app.puede_ver_hilo(uuid), piefirme_app.es_creador_hilo(uuid),
                       piefirme_app.es_remitente(uuid), piefirme_app.es_destinatario(uuid) from public, anon;
