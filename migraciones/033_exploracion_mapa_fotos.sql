-- 033 · A (Clínico) · Exploración física (5 siluetas de miembro inferior + tipos), mapa del pie en 4 vistas (dorsal/plantar × D/I),
-- fotos clínicas con política de retiro (nunca se borran) y documentos adjuntos del expediente.
-- Fuentes: DICCIONARIO E33, E34, E44, E45; docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md (§0.4, §0.6, §2 #39-40, §3); REGLAS P-007, P-008, P-009, N-02, N-05, CD-19.
-- Depende de: 001, 010, 031.

set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.a_no_borrar() returns trigger language plpgsql as $$
begin
  raise exception 'Nada clínico se borra: marque el registro como retirado con motivo (%)', tg_table_name using errcode = 'P0001';
end $$;

-- ═════════════════════ catálogo de zonas del pie (global, solo lectura) ═════════════════════
create table piefirme.catalogo_zonas_pie (
  codigo   text primary key,
  nombre   text not null,
  region   text not null check (region in ('dedo', 'una', 'antepie', 'mediopie', 'talon', 'dorso', 'tobillo')),
  dedo     smallint check (dedo between 1 and 5),
  vistas   text[] not null default array['dorsal', 'plantar'],
  orden    integer not null default 0
);
alter table piefirme.catalogo_zonas_pie enable row level security;
create policy catalogo_zonas_pie_sel on piefirme.catalogo_zonas_pie for select to authenticated using (piefirme_app.org_id() is not null);

insert into piefirme.catalogo_zonas_pie (codigo, nombre, region, dedo, vistas, orden) values
 ('dedo1', '1.er dedo (hallux)', 'dedo', 1, array['dorsal', 'plantar'], 10), ('dedo2', '2.º dedo', 'dedo', 2, array['dorsal', 'plantar'], 11),
 ('dedo3', '3.er dedo', 'dedo', 3, array['dorsal', 'plantar'], 12), ('dedo4', '4.º dedo', 'dedo', 4, array['dorsal', 'plantar'], 13),
 ('dedo5', '5.º dedo', 'dedo', 5, array['dorsal', 'plantar'], 14),
 ('una1', 'Uña 1.er dedo', 'una', 1, array['dorsal'], 20), ('una2', 'Uña 2.º dedo', 'una', 2, array['dorsal'], 21),
 ('una3', 'Uña 3.er dedo', 'una', 3, array['dorsal'], 22), ('una4', 'Uña 4.º dedo', 'una', 4, array['dorsal'], 23),
 ('una5', 'Uña 5.º dedo', 'una', 5, array['dorsal'], 24),
 ('antepie_plantar', 'Antepié plantar (cabezas metatarsianas)', 'antepie', null, array['plantar'], 30),
 ('mt1', 'Cabeza MT 1', 'antepie', null, array['plantar'], 31), ('mt2', 'Cabeza MT 2', 'antepie', null, array['plantar'], 32),
 ('mt3', 'Cabeza MT 3', 'antepie', null, array['plantar'], 33), ('mt4', 'Cabeza MT 4', 'antepie', null, array['plantar'], 34),
 ('mt5', 'Cabeza MT 5', 'antepie', null, array['plantar'], 35),
 ('antepie_dorsal', 'Antepié dorsal', 'antepie', null, array['dorsal'], 36),
 ('mediopie_medial', 'Medio pie medial (arco)', 'mediopie', null, array['dorsal', 'plantar'], 40),
 ('mediopie_lateral', 'Medio pie lateral', 'mediopie', null, array['dorsal', 'plantar'], 41),
 ('talon', 'Talón', 'talon', null, array['plantar'], 50), ('talon_posterior', 'Talón posterior', 'talon', null, array['dorsal', 'plantar'], 51),
 ('dorso_pie', 'Dorso del pie', 'dorso', null, array['dorsal'], 60), ('tobillo', 'Tobillo', 'tobillo', null, array['dorsal'], 70),
 ('interdigital', 'Espacio interdigital', 'dedo', null, array['dorsal', 'plantar'], 80)
on conflict (codigo) do nothing;

-- ═════════════════════ E34 exploración ═════════════════════
-- Las 5 siluetas del formato real, por pierna, y los campos entrevistos en el reverso (N-02: «por validar con el formato completo»).
create table piefirme.exploracion_miembro_inferior (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  pierna           text not null check (pierna in ('D', 'I')),
  siluetas         text[] not null default '{}' check (siluetas <@ array['genu_valgum', 'genu_varum', 'normal', 'genu_recurvatum', 'genu_flexum']),
  rotacion         text check (rotacion in ('interna', 'externa', 'neutra')),
  talalgias        boolean,
  tipo_pie         text check (tipo_pie in ('normal', 'varo', 'valgo', 'plano', 'cavo')),
  huella_plantar   text,
  notas            text,
  por_validar      boolean not null default true,        -- rotación/talalgias/tipo de pie/huella: campos del reverso aún no confirmados
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (consulta_id, pierna)
);
create index on piefirme.exploracion_miembro_inferior (organizacion_id, consulta_id);
create trigger t_hijo before insert or update or delete on piefirme.exploracion_miembro_inferior for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

create table piefirme.exploraciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  tipo             text not null check (tipo in ('dermatologica', 'ungueal', 'ortopedica', 'vascular', 'neurologica')),
  pie              text check (pie in ('D', 'I')),
  dedo             smallint check (dedo between 1 and 5),   -- exploración ungueal: por uña
  datos            jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  -- ungueal: forma, grosor_mm, color, patron_onicomicosis, pliegues, dolor_presion_0_10, signos_infeccion
  -- dermatologica: hidratacion, hiperqueratosis, helomas, fisuras, maceracion, tina, verrugas, hiperhidrosis
  -- ortopedica: arco, hallux_valgus, dedos_garra, retropie, marcha, huella
  -- vascular: pulso_pedio, pulso_tibial, temperatura, llenado_capilar_s, edema, itb (null = no evaluado, nunca 0)
  -- neurologica: monofilamento, diapason, reflejos, termica_dolor
  resumen          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (tipo <> 'ungueal' or (pie is not null and dedo is not null)),
  check (not (datos ? 'itb') or (datos ->> 'itb') is null or (datos ->> 'itb')::numeric > 0)    -- P-011: ITB «no evaluado» jamás es 0
);
create index on piefirme.exploraciones (organizacion_id, consulta_id, tipo);
create trigger t_hijo before insert or update or delete on piefirme.exploraciones for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

-- ═════════════════════ E33 mapa del pie: 4 vistas (dorsal/plantar × D/I) ═════════════════════
create table piefirme.hallazgos_pie (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id) on delete cascade,
  numero           integer not null check (numero > 0),      -- consecutivo en el mapa de la consulta
  pie              text not null check (pie in ('D', 'I')),
  vista            text not null check (vista in ('dorsal', 'plantar')),
  zona_codigo      text not null references piefirme.catalogo_zonas_pie(codigo),
  tipo_hallazgo    text not null check (tipo_hallazgo in (
                     'callosidad', 'helomas', 'hiperqueratosis', 'onicomicosis', 'una_encarnada', 'onicocriptosis', 'papiloma_plantar',
                     'pie_de_atleta', 'micosis', 'fisura', 'lesion', 'ulcera', 'maceracion', 'deformidad', 'dolor', 'otro')),
  marca            text not null default 'lesion' check (marca in ('ungueal', 'lesion')),   -- amarillo = uña afectada, rojo = lesión
  descripcion      text,                                      -- «Hiperqueratosis 1.5 cm»
  medida_cm        numeric(5, 1) check (medida_cm >= 0),
  gravedad         text check (gravedad in ('leve', 'moderada', 'grave')),
  x                numeric(5, 4) check (x between 0 and 1),   -- coordenadas normalizadas sobre la imagen
  y                numeric(5, 4) check (y between 0 and 1),
  foto_id          uuid,                                      -- FK a fotos_clinicas más abajo
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (consulta_id, numero),
  check ((x is null) = (y is null))
);
create index on piefirme.hallazgos_pie (organizacion_id, consulta_id);
create trigger t_hijo before insert or update or delete on piefirme.hallazgos_pie for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

create or replace function piefirme_app.hallazgo_zona_bi() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from piefirme.catalogo_zonas_pie z where z.codigo = new.zona_codigo and new.vista = any(z.vistas)) then
    raise exception 'La zona % no existe en la vista %', new.zona_codigo, new.vista using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_hallazgo_zona before insert or update of zona_codigo, vista on piefirme.hallazgos_pie for each row execute function piefirme_app.hallazgo_zona_bi();

-- ═════════════════════ E44 fotos clínicas ═════════════════════
create table piefirme.fotos_clinicas (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id        uuid not null references piefirme.pacientes(id),
  consulta_id        uuid not null references piefirme.consultas(id),
  sede_id            uuid not null references piefirme.sedes(id),
  archivo_path       text not null,                           -- 'pf-fotos-clinicas': <organizacion_id>/<paciente_id>/<id>.jpg (URL firmada)
  mime               text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  tamano_bytes       integer not null check (tamano_bytes > 0 and tamano_bytes <= 10485760),   -- 10 MB por foto (P-007)
  ancho_px           integer check (ancho_px > 0),
  alto_px            integer check (alto_px > 0),
  hash_sha256        text,
  pie                text check (pie in ('D', 'I')),
  vista              text check (vista in ('dorsal', 'plantar', 'medial', 'lateral', 'posterior')),
  zona_codigo        text references piefirme.catalogo_zonas_pie(codigo),
  momento            text not null check (momento in ('antes', 'despues_inmediato', 'despues', 'seguimiento')),
  nivel_autorizacion text not null default 'clinico' check (nivel_autorizacion in ('clinico', 'docencia')),
  difuminada         boolean not null default false,            -- docencia/difusión: rostro e identificadores difuminados (P-009)
  origen             text not null default 'clinica' check (origen in ('clinica', 'paciente')),
  comentario         text,
  anotaciones        jsonb not null default '[]'::jsonb check (jsonb_typeof(anotaciones) = 'array'),
  tomada_en          timestamptz not null default now(),
  subida_por         uuid references piefirme.perfiles(id) default auth.uid(),
  confirmo_excedente boolean not null default false,            -- la 11.ª foto de una sesión requiere confirmar (límite blando)
  retirada           boolean not null default false,
  retirada_motivo    text,
  retirada_por       uuid references piefirme.perfiles(id),
  retirada_en        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (greatest(coalesce(ancho_px, 0), coalesce(alto_px, 0)) <= 2048),           -- comprimida a ≤ 2048 px de lado largo
  check (not retirada or (retirada_motivo is not null and retirada_por is not null and retirada_en is not null)),
  check (nivel_autorizacion <> 'docencia' or difuminada)
);
create index on piefirme.fotos_clinicas (organizacion_id, paciente_id, tomada_en desc);
create index on piefirme.fotos_clinicas (organizacion_id, consulta_id);
alter table piefirme.hallazgos_pie add constraint hallazgos_pie_foto_fk foreign key (foto_id) references piefirme.fotos_clinicas(id) on delete set null;

create or replace function piefirme_app.foto_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_c record; v_n integer; v_limite integer;
begin
  if tg_op = 'INSERT' then
    select paciente_id, organizacion_id, sede_id into v_c from piefirme.consultas where id = new.consulta_id;
    if v_c.organizacion_id is distinct from new.organizacion_id or v_c.paciente_id <> new.paciente_id then
      raise exception 'La consulta no corresponde al paciente' using errcode = 'P0001';
    end if;
    new.sede_id := coalesce(new.sede_id, v_c.sede_id);
    if split_part(new.archivo_path, '/', 1) <> new.organizacion_id::text then
      raise exception 'La ruta del archivo debe iniciar con el id de la clínica' using errcode = 'P0001';
    end if;
    -- autorización vigente al subir (CD-19)
    if not exists (select 1 from piefirme.consentimientos c where c.paciente_id = new.paciente_id and c.tipo = 'fotos_clinicas' and c.estado = 'firmado' and c.aceptado) then
      raise exception 'El paciente no tiene autorización vigente de fotografías clínicas' using errcode = 'P0001';
    end if;
    if new.nivel_autorizacion = 'docencia'
       and not exists (select 1 from piefirme.consentimientos c where c.paciente_id = new.paciente_id and c.tipo = 'fotos_docencia' and c.estado = 'firmado' and c.aceptado) then
      raise exception 'Sin autorización escrita vigente para docencia o difusión (P-009)' using errcode = 'P0001';
    end if;
    select coalesce((o.parametros ->> 'fotos_max_por_sesion')::int, 10) into v_limite from piefirme.organizaciones o where o.id = new.organizacion_id;
    select count(*) into v_n from piefirme.fotos_clinicas f where f.consulta_id = new.consulta_id and not f.retirada;
    if v_n >= v_limite and not new.confirmo_excedente then
      raise exception 'Ya hay % fotos en la sesión: confirme para agregar otra (límite blando, P-007)', v_n using errcode = 'P0001';
    end if;
    new.retirada := false; new.retirada_motivo := null; new.retirada_por := null; new.retirada_en := null;
  else
    -- Solo se edita comentario/anotaciones/vínculos; el archivo y su evidencia no cambian.
    if new.archivo_path <> old.archivo_path or new.hash_sha256 is distinct from old.hash_sha256 or new.paciente_id <> old.paciente_id
       or new.consulta_id <> old.consulta_id or new.organizacion_id <> old.organizacion_id or new.tomada_en <> old.tomada_en then
      raise exception 'El archivo de una foto clínica no se reemplaza ni se reasigna' using errcode = 'P0001';
    end if;
    if new.retirada and not old.retirada then
      if length(btrim(coalesce(new.retirada_motivo, ''))) < 3 then raise exception 'El motivo de retiro es obligatorio (P-008)' using errcode = 'P0001'; end if;
      new.retirada_por := coalesce(auth.uid(), new.retirada_por);
      new.retirada_en := now();
    elsif old.retirada and not new.retirada and not piefirme_app.es_admin() then
      raise exception 'Solo Administración reactiva una foto retirada' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger t_foto_bi before insert or update on piefirme.fotos_clinicas for each row execute function piefirme_app.foto_bi();
create trigger t_no_borrar before delete on piefirme.fotos_clinicas for each row execute function piefirme_app.a_no_borrar();

-- ═════════════════════ E45 documentos adjuntos (incluye papel firmado escaneado, N-05) ═════════════════════
create table piefirme.documentos_adjuntos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id),
  consulta_id      uuid references piefirme.consultas(id),
  consentimiento_id uuid references piefirme.consentimientos(id),
  tipo             text not null check (tipo in ('consentimiento_escaneado', 'historia_papel', 'estudio', 'referencia', 'receta_externa', 'constancia_fiscal', 'otro')),
  nombre           text not null,
  archivo_path     text not null,                             -- 'pf-expedientes': <organizacion_id>/<paciente_id>/…
  mime             text,
  tamano_bytes     integer check (tamano_bytes > 0),
  fecha_documento  date,
  subido_por       uuid references piefirme.perfiles(id) default auth.uid(),
  retirado         boolean not null default false,
  retirado_motivo  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (not retirado or retirado_motivo is not null),
  check (split_part(archivo_path, '/', 1) = organizacion_id::text)
);
create index on piefirme.documentos_adjuntos (organizacion_id, paciente_id);
create trigger t_no_borrar before delete on piefirme.documentos_adjuntos for each row execute function piefirme_app.a_no_borrar();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.documentos_adjuntos for each row execute function piefirme_app.hijo_paciente_bi();
create trigger t_org_pac before insert or update of paciente_id, organizacion_id on piefirme.fotos_clinicas for each row execute function piefirme_app.hijo_paciente_bi();

-- ═════════════════════ RLS ═════════════════════
select piefirme_app.a_politicas('exploracion_miembro_inferior', array['administrador', 'podologo'], array['podologo'], array['podologo']);
select piefirme_app.a_politicas('exploraciones', array['administrador', 'podologo'], array['podologo'], array['podologo']);
select piefirme_app.a_politicas('hallazgos_pie', array['administrador', 'podologo'], array['podologo'], array['podologo']);

-- fotos: nunca DELETE. Podólogo sube y retira; solo Administración ve las retiradas; Recepción no accede (P-130).
alter table piefirme.fotos_clinicas enable row level security;
create policy fotos_clinicas_sel on piefirme.fotos_clinicas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.rol()::text = 'administrador' or (piefirme_app.rol()::text = 'podologo' and not retirada)));
create policy fotos_clinicas_ins on piefirme.fotos_clinicas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = 'podologo' and piefirme_app.puede_sede(sede_id));
create policy fotos_clinicas_upd on piefirme.fotos_clinicas for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo'))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'podologo'));

-- documentos: Podólogo/Administrador todo; Recepción solo adjunta y ve el papel firmado escaneado.
alter table piefirme.documentos_adjuntos enable row level security;
create policy documentos_adjuntos_sel on piefirme.documentos_adjuntos for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.rol()::text in ('administrador', 'podologo') or (piefirme_app.rol()::text = 'recepcion' and tipo in ('consentimiento_escaneado', 'constancia_fiscal') and not retirado)));
create policy documentos_adjuntos_ins on piefirme.documentos_adjuntos for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()
              and (piefirme_app.rol()::text in ('administrador', 'podologo') or (piefirme_app.rol()::text = 'recepcion' and tipo in ('consentimiento_escaneado', 'constancia_fiscal'))));
create policy documentos_adjuntos_upd on piefirme.documentos_adjuntos for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo'))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'podologo'));

select piefirme_app.a_triggers('exploracion_miembro_inferior');
select piefirme_app.a_triggers('exploraciones');
select piefirme_app.a_triggers('hallazgos_pie');
select piefirme_app.a_triggers('fotos_clinicas');
select piefirme_app.a_triggers('documentos_adjuntos');

-- ═════════════════════ vistas ═════════════════════
-- Hallazgos del mapa a lo largo del tiempo (comparar entre visitas)
create view piefirme.prp_hallazgos_pie with (security_invoker = true) as
select h.id, h.organizacion_id, c.paciente_id, h.consulta_id, c.folio, c.fecha_hora, c.estado as estado_consulta,
       h.numero, h.pie, h.vista, h.zona_codigo, z.nombre as zona, h.tipo_hallazgo, h.marca, h.descripcion, h.medida_cm, h.gravedad, h.x, h.y, h.foto_id
  from piefirme.hallazgos_pie h
  join piefirme.consultas c on c.id = h.consulta_id
  join piefirme.catalogo_zonas_pie z on z.codigo = h.zona_codigo;

-- Fotos visibles (las de docencia solo mientras la autorización siga vigente, P-009)
create view piefirme.prp_fotos_clinicas with (security_invoker = true) as
select f.id, f.organizacion_id, f.paciente_id, f.consulta_id, f.sede_id, f.archivo_path, f.pie, f.vista, f.zona_codigo, f.momento,
       f.nivel_autorizacion, f.origen, f.comentario, f.tomada_en, f.retirada,
       (f.nivel_autorizacion = 'clinico' or exists (
          select 1 from piefirme.consentimientos c where c.paciente_id = f.paciente_id and c.tipo = 'fotos_docencia' and c.estado = 'firmado' and c.aceptado)) as autorizacion_vigente
  from piefirme.fotos_clinicas f;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on all tables in schema piefirme from anon;
