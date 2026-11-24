-- 010 · A (Clínico) · Pacientes, tutores, datos fiscales del paciente, firmas, consentimientos, plantillas de documentos,
-- aviso de privacidad y folios de expediente por sede.
-- Fuentes: DICCIONARIO_DATOS E17, E19-E23, E27, E28; REGLAS P-003, P-005, P-006, P-019, P-066, P-129, P-133, P-139, P-140, P-142,
-- P-148, N-04, N-05, N-06, N-08; docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md (formato 1 y 2).
-- Depende de: 001. Las tablas de otros dominios (servicios, citas…) se referencian con uuid SIN llave foránea cuando su número es mayor.

-- ═════════════════════ helpers de dominio A (esquema app, no expuesto) ═════════════════════

-- Genera las 4 políticas (select/insert/update/delete) de una tabla por rol. p_sede=true exige piefirme_app.puede_sede(sede_id) al escribir.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.a_politicas(
  p_tabla text, p_leer text[], p_escribir text[], p_borrar text[] default '{}', p_sede boolean default false)
returns void language plpgsql as $$
declare
  t   text := quote_ident(p_tabla);
  rl  text := quote_literal(p_leer::text) || '::text[]';
  re  text := quote_literal(p_escribir::text) || '::text[]';
  rb  text := quote_literal(p_borrar::text) || '::text[]';
  sd  text := case when p_sede then ' and piefirme_app.puede_sede(sede_id)' else '' end;
begin
  execute format('alter table piefirme.%s enable row level security', t);
  execute format('drop policy if exists %I on piefirme.%s', p_tabla || '_sel', t);
  execute format('drop policy if exists %I on piefirme.%s', p_tabla || '_ins', t);
  execute format('drop policy if exists %I on piefirme.%s', p_tabla || '_upd', t);
  execute format('drop policy if exists %I on piefirme.%s', p_tabla || '_del', t);
  execute format('create policy %I on piefirme.%s for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = any(%s))',
                 p_tabla || '_sel', t, rl);
  if cardinality(p_escribir) > 0 then
    execute format('create policy %I on piefirme.%s for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = any(%s)%s)',
                   p_tabla || '_ins', t, re, sd);
    execute format('create policy %I on piefirme.%s for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = any(%s)) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = any(%s)%s)',
                   p_tabla || '_upd', t, re, re, sd);
  end if;
  if cardinality(p_borrar) > 0 then
    execute format('create policy %I on piefirme.%s for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = any(%s))',
                   p_tabla || '_del', t, rb);
  end if;
end $$;

-- updated_at + auditoría (piefirme_app.auditar) en una tabla.
create or replace function piefirme_app.a_triggers(p_tabla text, p_auditar boolean default true)
returns void language plpgsql as $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = p_tabla and column_name = 'updated_at') then
    execute format('drop trigger if exists t_upd on piefirme.%I', p_tabla);
    execute format('create trigger t_upd before update on piefirme.%I for each row execute function piefirme_app.tocar_updated_at()', p_tabla);
  end if;
  if p_auditar then
    execute format('drop trigger if exists t_aud on piefirme.%I', p_tabla);
    execute format('create trigger t_aud after insert or update or delete on piefirme.%I for each row execute function piefirme_app.auditar()', p_tabla);
  end if;
end $$;

-- Tablas de evidencia: nunca se actualizan ni se borran.
create or replace function piefirme_app.a_inmutable() returns trigger language plpgsql as $$
begin
  raise exception 'El registro de % es inmutable (evidencia): no se modifica ni se borra', tg_table_name using errcode = 'P0001';
end $$;

create or replace function piefirme_app.edad(p_nacimiento date, p_ref date default current_date) returns integer
language sql immutable as $$ select case when p_nacimiento is null then null else extract(year from age(p_ref, p_nacimiento))::int end $$;

-- ───────────── folios consecutivos por sede: {SEDE}-{TIPO}-{NNNNNN} (P-133; SEDE = 3 primeras letras de sedes.clave: CHA, CEN, GAL, PAT, SEN). Nunca se reutilizan ni reinician ─────────────
create table piefirme.secuencias_clinicas (
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  tipo             text not null check (tipo in ('EXP', 'CON', 'PLA', 'ORT', 'QJ', 'EST', 'DOC')),
  ultimo           bigint not null default 0,
  primary key (sede_id, tipo)
);
create index on piefirme.secuencias_clinicas (organizacion_id);
alter table piefirme.secuencias_clinicas enable row level security;
-- Sin políticas para authenticated: solo las funciones security definer incrementan el contador.
create policy secuencias_clinicas_sel on piefirme.secuencias_clinicas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());

create or replace function piefirme_app.siguiente_folio_clinico(p_sede uuid, p_tipo text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_clave text; v_n bigint; v_folio text;
begin
  select organizacion_id, clave into v_org, v_clave from piefirme.sedes where id = p_sede;
  if v_org is null then raise exception 'La sede % no existe', p_sede using errcode = 'P0001'; end if;
  loop
    insert into piefirme.secuencias_clinicas (organizacion_id, sede_id, tipo, ultimo) values (v_org, p_sede, p_tipo, 1)
    on conflict (sede_id, tipo) do update set ultimo = piefirme.secuencias_clinicas.ultimo + 1
    returning ultimo into v_n;
    v_folio := upper(left(v_clave, 3)) || '-' || p_tipo || '-' || lpad(v_n::text, 6, '0');
    -- N-08: si el número ya existe porque se conservó uno manual al migrar, se salta al siguiente libre
    exit when p_tipo <> 'EXP' or not exists (select 1 from piefirme.pacientes where organizacion_id = v_org and numero_expediente = v_folio);
  end loop;
  return v_folio;
end $$;

-- ═════════════════════ E17 · plantillas de documento (con versión) ═════════════════════
create table piefirme.plantillas_documento (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo           text not null,                   -- estable entre versiones, p. ej. 'consentimiento_procedimiento_ungueal'
  tipo             text not null check (tipo in (
                     'recordatorio_cita', 'confirmacion_reserva', 'aviso_privacidad', 'consentimiento_datos_salud',
                     'consentimiento_procedimiento', 'autorizacion_fotos', 'autorizacion_fotos_docencia',
                     'consentimiento_telemedicina', 'consentimiento_dictado_ia', 'consentimiento_grabacion',
                     'terminos_reserva', 'mensaje_campana',
                     'impreso_consentimiento', 'impreso_antecedentes', 'impreso_seguimiento', 'impreso_historia_completa',
                     'impreso_en_blanco', 'receta_indicaciones', 'carta_referencia', 'constancia')),
  nombre           text not null,
  version          integer not null default 1 check (version >= 1),
  estado           text not null default 'borrador' check (estado in ('borrador', 'activa', 'archivada')),
  vigente_desde    date,
  contenido        text not null default '',        -- admite variables {{nombre}}, {{liga_cita}}…
  variables        text[] not null default '{}',
  estructura       jsonb not null default '{}'::jsonb,  -- diseño del impreso: logo, secciones, casillas (mismo diseño del papel)
  forma_aceptacion text not null default 'firma_pantalla' check (forma_aceptacion in ('firma_pantalla', 'casilla', 'correo', 'ninguna')),
  servicio_id      uuid,                            -- consentimiento por procedimiento; FK a servicios en 030 (B es 02x)
  cambia_finalidades boolean not null default false, -- P-140: si es true, exige nueva firma
  base_rannix      boolean not null default false,  -- copiada de las plantillas base de RANNIX (P-027, N-06)
  pendiente_validacion_legal boolean not null default true,  -- P-139: textos finales los redacta un abogado
  contenido_hash   text,
  creada_por       uuid references piefirme.perfiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, codigo, version)
);
create index on piefirme.plantillas_documento (organizacion_id, tipo, estado);
create unique index plantillas_una_activa on piefirme.plantillas_documento (organizacion_id, codigo) where estado = 'activa';

create or replace function piefirme_app.plantilla_documento_bi() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.estado <> 'borrador'
     and (new.contenido is distinct from old.contenido or new.estructura is distinct from old.estructura or new.version <> old.version or new.codigo <> old.codigo) then
    raise exception 'Una plantilla activa o archivada no se edita: cree una nueva versión (P-139)' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.estado = 'archivada' and new.estado <> 'archivada' then
    raise exception 'Una plantilla archivada no se reactiva' using errcode = 'P0001';
  end if;
  new.contenido_hash := encode(sha256(convert_to(coalesce(new.contenido, '') || coalesce(new.estructura::text, ''), 'UTF8')), 'hex');
  if new.estado = 'activa' then
    new.vigente_desde := coalesce(new.vigente_desde, current_date);
    -- archiva la versión activa anterior del mismo código
    update piefirme.plantillas_documento set estado = 'archivada'
     where organizacion_id = new.organizacion_id and codigo = new.codigo and estado = 'activa' and id <> new.id;
  end if;
  return new;
end $$;
create trigger t_plantilla_bi before insert or update on piefirme.plantillas_documento
  for each row execute function piefirme_app.plantilla_documento_bi();

-- ═════════════════════ E19 · paciente (100 % del formato 2 de Pie Clinic) ═════════════════════
create table piefirme.pacientes (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  numero_expediente     text,                                  -- {SEDE}-EXP-{NNNNNN}; se conserva el vigente al migrar (N-08)
  numero_expediente_manual boolean not null default false,
  folio_anterior        text,
  sede_registro_id      uuid not null references piefirme.sedes(id),   -- «sede de registro» (casillas del formato)
  nombre                text not null,
  apellido_paterno      text,
  apellido_materno      text,
  sexo                  text check (sexo in ('mujer', 'hombre', 'otro')),
  fecha_nacimiento      date check (fecha_nacimiento <= current_date),
  curp                  text,
  estado_civil          text check (estado_civil in ('soltero', 'casado', 'union_libre', 'divorciado', 'viudo', 'separado', 'otro')),
  lugar_origen          text,
  ocupacion             text,
  telefono_celular      text,                                  -- WhatsApp; clave de aviso de duplicado (solo avisa)
  telefono_fijo         text,                                  -- «Teléfono / Móvil»: dos teléfonos en el formato
  email                 text,
  -- domicilio: calle, Mz, Lt, colonia (+ CP, municipio, estado)
  calle                 text,
  num_exterior          text,
  num_interior          text,
  manzana               text,
  lote                  text,
  colonia               text,
  municipio             text,
  codigo_postal         text,
  estado_domicilio      text,
  -- hábitos y calzado (resumen; el detalle clínico está en antecedentes_paciente)
  deporte               text,
  tipo_calzado          text,
  talla_calzado         numeric(4, 1),
  escala_calzado        text not null default 'MX',
  alergias_resumen      text,                                  -- alerta visible para Recepción (pre-registro)
  diabetes              text check (diabetes in ('no', 'tipo1', 'tipo2', 'prediabetes', 'no_sabe')),
  preferencia_contacto  text[] not null default '{}',
  horario_preferido     text,
  como_nos_conocio      text,
  referido_paciente_id  uuid references piefirme.pacientes(id),
  referido_texto        text,
  canal_origen          text,
  notas_administrativas text,
  facturar_automatico   boolean not null default false,
  estado                text not null default 'activo' check (estado in ('activo', 'inactivo', 'bloqueado', 'fusionado')),
  fusionado_en          uuid references piefirme.pacientes(id),
  origen_registro       text not null default 'recepcion' check (origen_registro in ('recepcion', 'portal', 'importacion')),
  alta_rapida           boolean not null default false,        -- P-003: nombre + celular; el resto se exige antes de la 1.ª consulta
  importado             boolean not null default false,
  lote_importacion_id   uuid,                                  -- lote de importación (D); sin FK
  homonimo_confirmado   boolean not null default false,        -- P-006: «No es la misma persona»
  acepta_recordatorios  boolean not null default true,         -- P-148: consentimientos separados
  acepta_promociones    boolean not null default false,
  creado_por            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organizacion_id, numero_expediente),
  check (alta_rapida or (apellido_paterno is not null and fecha_nacimiento is not null and telefono_celular is not null)),
  check (alta_rapida or telefono_celular is not null or origen_registro = 'importacion'),
  check (fusionado_en is null or estado = 'fusionado')
);
create index on piefirme.pacientes (organizacion_id, sede_registro_id);
create index on piefirme.pacientes (organizacion_id, telefono_celular);
create index on piefirme.pacientes (organizacion_id, lower(nombre), lower(coalesce(apellido_paterno, '')), fecha_nacimiento);
create index on piefirme.pacientes (organizacion_id, estado);

create or replace function piefirme_app.paciente_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dup uuid;
begin
  new.nombre := btrim(new.nombre);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.telefono_celular := nullif(regexp_replace(coalesce(new.telefono_celular, ''), '[^0-9+]', '', 'g'), '');
  new.telefono_fijo := nullif(regexp_replace(coalesce(new.telefono_fijo, ''), '[^0-9+]', '', 'g'), '');
  new.curp := nullif(upper(btrim(coalesce(new.curp, ''))), '');
  if new.sede_registro_id is not null and not exists (select 1 from piefirme.sedes s where s.id = new.sede_registro_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'La sede de registro no pertenece a la clínica' using errcode = 'P0001';
  end if;
  -- número de expediente: consecutivo por sede, o el número vigente capturado a mano (N-08)
  if tg_op = 'INSERT' then
    if new.numero_expediente is null or btrim(new.numero_expediente) = '' then
      new.numero_expediente := piefirme_app.siguiente_folio_clinico(new.sede_registro_id, 'EXP');
      new.numero_expediente_manual := false;
    else
      new.numero_expediente_manual := true;
    end if;
  elsif new.numero_expediente is distinct from old.numero_expediente and not piefirme_app.es_admin() and auth.uid() is not null then
    raise exception 'Solo el administrador cambia el número de expediente' using errcode = 'P0001';
  end if;
  -- P-006: coincidencia por nombre completo + fecha de nacimiento bloquea el alta (el teléfono compartido solo avisa)
  if new.fecha_nacimiento is not null and new.apellido_paterno is not null and new.estado <> 'fusionado' and not new.homonimo_confirmado
     and (tg_op = 'INSERT' or new.nombre is distinct from old.nombre or new.apellido_paterno is distinct from old.apellido_paterno
          or new.apellido_materno is distinct from old.apellido_materno or new.fecha_nacimiento is distinct from old.fecha_nacimiento) then
    select p.id into v_dup from piefirme.pacientes p
     where p.organizacion_id = new.organizacion_id and p.id <> new.id and p.estado <> 'fusionado'
       and lower(btrim(p.nombre)) = lower(new.nombre)
       and lower(btrim(coalesce(p.apellido_paterno, ''))) = lower(btrim(new.apellido_paterno))
       and lower(btrim(coalesce(p.apellido_materno, ''))) = lower(btrim(coalesce(new.apellido_materno, '')))
       and p.fecha_nacimiento = new.fecha_nacimiento
     limit 1;
    if v_dup is not null then
      raise exception 'posible_duplicado' using errcode = 'P0001', detail = v_dup::text,
        hint = 'Abra el expediente existente o confirme que no es la misma persona (homonimo_confirmado)';
    end if;
  end if;
  return new;
end $$;
create trigger t_paciente_bi before insert or update on piefirme.pacientes for each row execute function piefirme_app.paciente_bi();

-- Búsqueda de posibles duplicados para la pantalla de alta (security invoker: respeta RLS).
create or replace function piefirme.buscar_duplicados_paciente(
  p_nombre text, p_apellido_paterno text, p_apellido_materno text, p_fecha_nacimiento date, p_celular text default null)
returns table (id uuid, numero_expediente text, nombre_completo text, fecha_nacimiento date, motivo text)
language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select p.id, p.numero_expediente,
         btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '') || ' ' || coalesce(p.apellido_materno, '')),
         p.fecha_nacimiento,
         case when lower(btrim(p.nombre)) = lower(btrim(p_nombre))
               and lower(btrim(coalesce(p.apellido_paterno, ''))) = lower(btrim(coalesce(p_apellido_paterno, '')))
               and lower(btrim(coalesce(p.apellido_materno, ''))) = lower(btrim(coalesce(p_apellido_materno, '')))
               and p.fecha_nacimiento = p_fecha_nacimiento
              then 'bloquea' else 'avisa_telefono' end
    from piefirme.pacientes p
   where p.organizacion_id = piefirme_app.org_id() and p.estado <> 'fusionado'
     and ((lower(btrim(p.nombre)) = lower(btrim(p_nombre))
           and lower(btrim(coalesce(p.apellido_paterno, ''))) = lower(btrim(coalesce(p_apellido_paterno, '')))
           and lower(btrim(coalesce(p.apellido_materno, ''))) = lower(btrim(coalesce(p_apellido_materno, '')))
           and p.fecha_nacimiento = p_fecha_nacimiento)
          or (p_celular is not null and p.telefono_celular = regexp_replace(p_celular, '[^0-9+]', '', 'g')))
$$;

-- N-04: el VIH vive aparte; Recepción no lo ve (sin política para ese rol).
create table piefirme.paciente_datos_sensibles (
  paciente_id      uuid primary key references piefirme.pacientes(id) on delete cascade,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  vih              text check (vih in ('si', 'no', 'no_sabe')),
  vih_nota         text,
  actualizado_por  uuid references piefirme.perfiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.paciente_datos_sensibles (organizacion_id);

-- E20 contacto de emergencia
create table piefirme.contactos_emergencia (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  nombre           text not null,
  parentesco       text,
  telefono         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.contactos_emergencia (organizacion_id, paciente_id);

-- E28 · firma (evidencia P-142: imagen, fecha-hora, IP, dispositivo y huella del documento). Inmutable.
create table piefirme.firmas (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  firmante_tipo         text not null check (firmante_tipo in ('paciente', 'tutor', 'representante', 'podologo', 'administrador', 'recepcion')),
  firmante_paciente_id  uuid references piefirme.pacientes(id),
  firmante_usuario_id   uuid references piefirme.perfiles(id),
  nombre_firmante       text not null,
  cedula                text,                              -- cédula del firmante (podólogo)
  imagen_path           text,                              -- 'pf-expedientes': <organizacion_id>/firmas/<id>.png
  nombre_tecleado       text,                              -- firma tecleada (videoconsulta)
  documento_tipo        text not null,                     -- consentimiento | consulta | nota_aclaratoria | valoracion | orden_plantilla | entrega_plantilla …
  documento_id          uuid,
  documento_version     text,
  documento_hash        text,                              -- huella del documento firmado
  ip                    text,
  dispositivo           text,
  canal                 text check (canal in ('recepcion_pantalla', 'liga_celular', 'portal', 'sala_videoconsulta', 'papel_escaneado', 'podologo_pantalla')),
  motivo_representante  text,                              -- adulto que no puede firmar (P-005)
  firmado_en            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  check (imagen_path is not null or nombre_tecleado is not null),
  check (firmante_tipo <> 'representante' or motivo_representante is not null)
);
create index on piefirme.firmas (organizacion_id, documento_tipo, documento_id);
create index on piefirme.firmas (organizacion_id, firmante_paciente_id);
create trigger t_inmutable before update or delete on piefirme.firmas for each row execute function piefirme_app.a_inmutable();

-- E21 tutor o representante (P-005)
create table piefirme.tutores (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id           uuid not null references piefirme.pacientes(id) on delete cascade,
  tipo                  text not null default 'tutor_menor' check (tipo in ('tutor_menor', 'representante_adulto')),
  nombre_completo       text not null,
  parentesco            text not null,
  telefono              text,
  identificacion_tipo   text,
  identificacion_folio  text,
  motivo                text,                              -- obligatorio si es representante de un adulto
  firma_id              uuid references piefirme.firmas(id),
  vigente               boolean not null default true,     -- a los 18 años se pide nueva firma del propio paciente
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (tipo <> 'representante_adulto' or motivo is not null)
);
create index on piefirme.tutores (organizacion_id, paciente_id);

-- E22 etiquetas
create table piefirme.etiquetas_paciente (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  nombre           text not null,
  tipo             text not null default 'manual' check (tipo in ('manual', 'automatica')),
  color            text,
  created_at       timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
create table piefirme.paciente_etiquetas (
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  etiqueta_id      uuid not null references piefirme.etiquetas_paciente(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (paciente_id, etiqueta_id)
);
create index on piefirme.paciente_etiquetas (organizacion_id, etiqueta_id);

-- E23 datos fiscales del paciente (opcionales; el dueño pide registrarlos). Los de un CFDI timbrado se congelan en el comprobante (P-066).
create table piefirme.datos_fiscales_paciente (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  rfc              text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  razon_social     text not null,                          -- igual que la constancia de situación fiscal
  regimen_fiscal   text not null,                          -- clave SAT (601, 612, 626…)
  codigo_postal_fiscal text not null,
  uso_cfdi         text not null,                          -- clave SAT (G03, D01…)
  email_factura    text,
  constancia_path  text,                                   -- 'pf-documentos'
  predeterminado   boolean not null default false,         -- varios receptores por paciente permitidos (D-14)
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.datos_fiscales_paciente (organizacion_id, paciente_id);
create unique index datos_fiscales_un_predeterminado on piefirme.datos_fiscales_paciente (paciente_id) where predeterminado and activo;

-- E27 consentimiento / aceptación firmada (aviso de privacidad incluido)
create table piefirme.consentimientos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id        uuid not null references piefirme.pacientes(id) on delete cascade,
  tipo               text not null check (tipo in (
                       'aviso_privacidad', 'datos_salud', 'fotos_clinicas', 'fotos_docencia', 'comunicaciones_recordatorios',
                       'comunicaciones_promociones', 'procedimiento', 'telemedicina', 'grabacion_videoconsulta', 'dictado_ia', 'terminos_reserva')),
  plantilla_id       uuid references piefirme.plantillas_documento(id),
  plantilla_version  integer,                             -- P-139: se guarda la versión aceptada
  texto_hash         text,
  aceptado           boolean not null default true,       -- opcionales (docencia, recordatorios…) pueden quedar en «no»
  firma_id           uuid references piefirme.firmas(id),
  fecha_hora         timestamptz not null default now(),
  canal              text check (canal in ('recepcion_pantalla', 'liga_celular', 'portal', 'sala_videoconsulta', 'papel_escaneado')),
  dispositivo        text,
  ip                 text,
  consulta_id        uuid,                                -- FK a consultas en 031
  cita_id            uuid,                                -- cita de la que nace (B); sin FK
  documento_papel_path text,                              -- N-05: papel firmado escaneado ('pf-expedientes')
  estado             text not null default 'pendiente_firma' check (estado in ('pendiente_firma', 'firmado', 'revocado', 'reemplazado')),
  revocado_en        timestamptz,
  revocado_motivo    text,
  creado_por         uuid references piefirme.perfiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (estado <> 'firmado' or firma_id is not null or documento_papel_path is not null or canal = 'portal'),
  check (estado <> 'revocado' or (revocado_en is not null and revocado_motivo is not null))
);
create index on piefirme.consentimientos (organizacion_id, paciente_id, tipo, estado);
create index on piefirme.consentimientos (organizacion_id, consulta_id);

create or replace function piefirme_app.consentimiento_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pl record;
begin
  if new.plantilla_id is not null then
    select version, contenido_hash, organizacion_id into v_pl from piefirme.plantillas_documento where id = new.plantilla_id;
    if v_pl.organizacion_id is distinct from new.organizacion_id then raise exception 'Plantilla de otra clínica' using errcode = 'P0001'; end if;
    new.plantilla_version := coalesce(new.plantilla_version, v_pl.version);
    new.texto_hash := coalesce(new.texto_hash, v_pl.contenido_hash);
  end if;
  if tg_op = 'UPDATE' then
    if old.estado in ('revocado', 'reemplazado') and new.estado is distinct from old.estado then
      raise exception 'Un consentimiento % no cambia de estado', old.estado using errcode = 'P0001';
    end if;
    if old.estado = 'firmado' and (new.firma_id is distinct from old.firma_id or new.plantilla_version is distinct from old.plantilla_version
        or new.aceptado is distinct from old.aceptado or new.tipo is distinct from old.tipo) then
      raise exception 'La firma y la versión aceptada no se modifican (P-139, P-142)' using errcode = 'P0001';
    end if;
    if new.estado = 'revocado' and old.estado <> 'revocado' then
      new.revocado_en := coalesce(new.revocado_en, now());
    end if;
  end if;
  return new;
end $$;
create trigger t_consent_bi before insert or update on piefirme.consentimientos for each row execute function piefirme_app.consentimiento_bi();

-- Al firmarse una versión nueva del mismo tipo, la anterior queda «reemplazada» (se conserva la firma anterior, P-140).
create or replace function piefirme_app.consentimiento_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.estado = 'firmado' and new.tipo <> 'procedimiento' then
    update piefirme.consentimientos set estado = 'reemplazado'
     where paciente_id = new.paciente_id and tipo = new.tipo and estado = 'firmado' and id <> new.id;
  end if;
  return null;
end $$;
create trigger t_consent_ai after insert or update of estado on piefirme.consentimientos for each row execute function piefirme_app.consentimiento_ai();

-- Vigentes y si requieren nueva firma por cambio de finalidades (P-140).
create view piefirme.prp_consentimientos_vigentes with (security_invoker = true) as
select c.id, c.organizacion_id, c.paciente_id, c.tipo, c.aceptado, c.plantilla_id, c.plantilla_version, c.fecha_hora, c.canal, c.consulta_id,
       pl.version as version_activa,
       coalesce(pl.version > c.plantilla_version and exists (
         select 1 from piefirme.plantillas_documento p2
          where p2.organizacion_id = c.organizacion_id and p2.codigo = pl.codigo and p2.version > c.plantilla_version
            and p2.version <= pl.version and p2.cambia_finalidades), false) as requiere_nueva_firma
  from piefirme.consentimientos c
  left join piefirme.plantillas_documento pl on pl.organizacion_id = c.organizacion_id and pl.estado = 'activa'
       and pl.codigo = (select p0.codigo from piefirme.plantillas_documento p0 where p0.id = c.plantilla_id)
 where c.estado = 'firmado';

-- Fusión de expedientes duplicados (solo Administrador; se deshace dentro de 30 días, P-006). La RPC vive en 039.
create table piefirme.paciente_fusiones (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_origen_id    uuid not null references piefirme.pacientes(id),
  paciente_destino_id   uuid not null references piefirme.pacientes(id),
  motivo                text not null,
  detalle               jsonb not null default '{}'::jsonb,   -- {tabla: [ids movidos]}: permite deshacer
  realizada_por         uuid references piefirme.perfiles(id),
  realizada_en          timestamptz not null default now(),
  limite_deshacer       timestamptz not null default (now() + interval '30 days'),
  deshecha_en           timestamptz,
  deshecha_por          uuid references piefirme.perfiles(id),
  check (paciente_origen_id <> paciente_destino_id)
);
create index on piefirme.paciente_fusiones (organizacion_id, paciente_destino_id);

-- Vista de ficha con derivados (security invoker).
create view piefirme.prp_pacientes with (security_invoker = true) as
select p.*,
       btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '') || ' ' || coalesce(p.apellido_materno, '')) as nombre_completo,
       piefirme_app.edad(p.fecha_nacimiento) as edad,
       coalesce(piefirme_app.edad(p.fecha_nacimiento) < 18, false) as es_menor,
       exists (select 1 from piefirme.tutores t where t.paciente_id = p.id and t.vigente) as tiene_tutor,
       exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'aviso_privacidad' and c.estado = 'firmado') as aviso_privacidad_firmado,
       exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'datos_salud' and c.estado = 'firmado') as datos_salud_firmado,
       exists (select 1 from piefirme.datos_fiscales_paciente d where d.paciente_id = p.id and d.activo) as tiene_datos_fiscales,
       (not p.alta_rapida) as ficha_completa
  from piefirme.pacientes p;

-- ═════════════════════ RLS ═════════════════════
-- pacientes: ficha de toda la clínica visible a los tres roles (P-002, P-129); sin DELETE (nada se borra, P-127).
alter table piefirme.pacientes enable row level security;
create policy pacientes_sel on piefirme.pacientes for select to authenticated using (organizacion_id = piefirme_app.org_id());
create policy pacientes_ins on piefirme.pacientes for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_registro_id));
create policy pacientes_upd on piefirme.pacientes for update to authenticated
  using (organizacion_id = piefirme_app.org_id()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa());

select piefirme_app.a_politicas('paciente_datos_sensibles', array['administrador', 'podologo'], array['administrador', 'podologo']);
select piefirme_app.a_politicas('contactos_emergencia', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo', 'recepcion'], array['administrador', 'recepcion']);
select piefirme_app.a_politicas('tutores', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo', 'recepcion'], array['administrador']);
select piefirme_app.a_politicas('etiquetas_paciente', array['administrador', 'podologo', 'recepcion'], array['administrador', 'recepcion'], array['administrador']);
select piefirme_app.a_politicas('paciente_etiquetas', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo', 'recepcion'], array['administrador', 'recepcion']);
select piefirme_app.a_politicas('datos_fiscales_paciente', array['administrador', 'podologo', 'recepcion'], array['administrador', 'recepcion'], array['administrador']);
select piefirme_app.a_politicas('plantillas_documento', array['administrador', 'podologo', 'recepcion'], array['administrador'], array[]::text[]);
select piefirme_app.a_politicas('consentimientos', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo', 'recepcion']);
select piefirme_app.a_politicas('paciente_fusiones', array['administrador'], array[]::text[]);

-- firmas: se insertan y se leen; jamás se modifican (trigger t_inmutable + sin políticas upd/del).
alter table piefirme.firmas enable row level security;
create policy firmas_sel on piefirme.firmas for select to authenticated using (organizacion_id = piefirme_app.org_id());
create policy firmas_ins on piefirme.firmas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'podologo', 'recepcion'));

-- ═════════════════════ triggers updated_at + auditoría ═════════════════════
select piefirme_app.a_triggers('pacientes');
select piefirme_app.a_triggers('paciente_datos_sensibles');
select piefirme_app.a_triggers('contactos_emergencia', false);
select piefirme_app.a_triggers('tutores');
select piefirme_app.a_triggers('etiquetas_paciente', false);
select piefirme_app.a_triggers('paciente_etiquetas', false);
select piefirme_app.a_triggers('datos_fiscales_paciente');
select piefirme_app.a_triggers('plantillas_documento');
select piefirme_app.a_triggers('consentimientos');
select piefirme_app.a_triggers('firmas');
select piefirme_app.a_triggers('paciente_fusiones');

-- ═════════════════════ plantillas base de RANNIX (P-027, N-06): se copian a la clínica del administrador ═════════════════════
-- Textos base tomados del formato real de Pie Clinic; pendientes de validación de abogado (P-139).
create or replace function piefirme.copiar_plantillas_base() returns integer
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); n integer := 0;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el administrador copia las plantillas base' using errcode = '42501'; end if;
  insert into piefirme.plantillas_documento (organizacion_id, codigo, tipo, nombre, version, estado, contenido, variables, forma_aceptacion, base_rannix, creada_por)
  select v_org, x.codigo, x.tipo, x.nombre, 1, 'borrador', x.contenido, x.variables, x.forma, true, auth.uid()
    from (values
      ('aviso_privacidad', 'aviso_privacidad', 'Aviso de privacidad',
       'Aviso de privacidad integral de {{clinica}}. Tratamos sus datos personales y de salud para integrar su expediente clínico, agendar citas, cobrar y facturar. Puede ejercer sus derechos ARCO ante la clínica. [Texto final pendiente de redacción por abogado.]',
       array['clinica'], 'firma_pantalla'),
      ('consentimiento_datos_salud', 'consentimiento_datos_salud', 'Consentimiento para tratamiento de datos de salud',
       'Autorizo a {{clinica}} a tratar mis datos personales sensibles de salud para fines de diagnóstico y tratamiento podológico.',
       array['clinica'], 'firma_pantalla'),
      ('consentimiento_procedimiento_podologico', 'consentimiento_procedimiento', 'Consentimiento informado para tratamiento podológico',
       'Yo, {{paciente}}{{tutor}}, autorizo al podólogo {{podologo}} a llevar a cabo un tratamiento podológico en mis pies, que incluye: examen físico de los pies; tratamiento de callosidades, durezas y verrugas plantares; extracción de espícula en uña encarnada con curación diaria por 4 días consecutivos hasta lograr una adecuada cicatrización; información de cuidado e higiene; corrección de la marcha y postura ungueal; y recomendaciones de cuidado en casa. Se me dio oportunidad de preguntar; los resultados pueden variar; el tratamiento no está exento de riesgos; tengo derecho a una segunda opinión y a retirar mi consentimiento.',
       array['paciente', 'tutor', 'podologo'], 'firma_pantalla'),
      ('autorizacion_fotos_clinicas', 'autorizacion_fotos', 'Autorización de fotografías clínicas',
       'Autorizo que se tomen fotografías de mis pies para integrarlas únicamente a mi expediente clínico.', array[]::text[], 'firma_pantalla'),
      ('autorizacion_fotos_docencia', 'autorizacion_fotos_docencia', 'Autorización de fotografías para docencia o difusión',
       'Autorizo el uso de fotografías de mis pies con rostro e identificadores difuminados para docencia o difusión. Puedo revocar esta autorización.', array[]::text[], 'firma_pantalla'),
      ('consentimiento_telemedicina', 'consentimiento_telemedicina', 'Consentimiento de telemedicina',
       'Acepto recibir atención podológica a distancia por videoconsulta y entiendo sus limitaciones. [Pendiente de revisión legal; función apagada en producción hasta entonces.]', array[]::text[], 'firma_pantalla'),
      ('consentimiento_dictado_ia', 'consentimiento_dictado_ia', 'Consentimiento para dictado por voz con IA',
       'Autorizo que mi consulta sea dictada por el podólogo con apoyo de IA. El audio se elimina al confirmarse la transcripción.', array[]::text[], 'firma_pantalla'),
      ('terminos_reserva', 'terminos_reserva', 'Términos de reserva y cancelación',
       'Cancelaciones con al menos {{horas_cancelacion}} horas de aviso. Pasado ese plazo el anticipo no es reembolsable.', array['horas_cancelacion'], 'casilla'),
      ('impreso_consentimiento', 'impreso_consentimiento', 'Impreso: consentimiento informado', '', array[]::text[], 'ninguna'),
      ('impreso_antecedentes', 'impreso_antecedentes', 'Impreso: antecedentes personales', '', array[]::text[], 'ninguna'),
      ('impreso_seguimiento', 'impreso_seguimiento', 'Impreso: seguimiento clínico', '', array[]::text[], 'ninguna'),
      ('impreso_historia_completa', 'impreso_historia_completa', 'Impreso: historia clínica completa', '', array[]::text[], 'ninguna'),
      ('impreso_en_blanco', 'impreso_en_blanco', 'Impreso: formato en blanco', '', array[]::text[], 'ninguna'),
      ('receta_indicaciones', 'receta_indicaciones', 'Indicaciones y receta', '', array[]::text[], 'ninguna'),
      ('carta_referencia', 'carta_referencia', 'Carta de referencia', 'Se refiere al paciente {{paciente}} a {{especialidad}} por: {{motivo}}.', array['paciente', 'especialidad', 'motivo'], 'ninguna')
    ) as x(codigo, tipo, nombre, contenido, variables, forma)
   where not exists (select 1 from piefirme.plantillas_documento p where p.organizacion_id = v_org and p.codigo = x.codigo);
  get diagnostics n = row_count;
  return n;
end $$;

-- ═════════════════════ permisos ═════════════════════
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on function piefirme.buscar_duplicados_paciente(text, text, text, date, text) from public, anon;
grant execute on function piefirme.buscar_duplicados_paciente(text, text, text, date, text) to authenticated;
revoke all on function piefirme.copiar_plantillas_base() from public, anon;
grant execute on function piefirme.copiar_plantillas_base() to authenticated;
revoke all on all tables in schema piefirme from anon;
