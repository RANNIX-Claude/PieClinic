-- 031 · A (Clínico) · Consultas / nota de evolución con firma inmutable, signos vitales, notas aclaratorias,
-- seguimiento clínico (formato 3 de Pie Clinic) y acceso restringido al dato de VIH.
-- Fuentes: DICCIONARIO E30-E32, E28; MODELO_ESTADOS S05; REGLAS P-001, P-004, P-005, P-025, P-030, P-045, P-127, P-136, P-142, P-146, N-04.
-- Depende de: 001, 010, 030, citas/servicios (B, 02x) por contrato.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.consultas (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references piefirme.organizaciones(id) on delete cascade,
  folio                   text,                                   -- {SEDE}-CON-{NNNNNN}; consecutivo sin reuso (P-133)
  paciente_id             uuid not null references piefirme.pacientes(id),
  sede_id                 uuid not null references piefirme.sedes(id),
  cabina_id               uuid references piefirme.cabinas(id),
  cita_id                 uuid references piefirme.citas(id),       -- puede no existir: llegada sin cita
  podologo_id             uuid not null references piefirme.perfiles(id),   -- quien atiende
  fecha_hora              timestamptz not null default now(),
  tipo_atencion           text not null default 'presencial' check (tipo_atencion in ('presencial', 'a_distancia', 'domicilio')),  -- modalidad, no estado (CD-05)
  servicio_id             uuid references piefirme.servicios(id),
  plan_id                 uuid,                                    -- FK a planes_tratamiento en 034
  motivo_consulta         text,
  padecimiento_actual     text,
  sintomas                text,
  antecedentes_snapshot   jsonb,                                   -- instantánea de antecedentes al abrir la consulta (P-030)
  anestesia               text check (anestesia in ('no_aplico', 'topica', 'infiltrativa', 'otra')),
  descripcion_procedimiento text,
  nota_evolucion          text,                                    -- NOM-004: evolución, hallazgos, diagnóstico, pronóstico, tratamiento
  nota_origen             text not null default 'tecleada' check (nota_origen in ('tecleada', 'dictado_ia')),
  dictado_id              uuid,                                    -- FK a dictados en 037
  tratamiento_texto       text,                                    -- formato 3: «Tratamiento (lo que adquirió)»
  observaciones_seguimiento text,                                  -- formato 3: columna «Observaciones»
  pronostico              text check (pronostico in ('bueno', 'reservado', 'malo')),
  proxima_visita          date,                                    -- formato 3: «Próx. visita»
  proxima_cita_tipo       text,
  proxima_cita_plazo_dias integer check (proxima_cita_plazo_dias between 0 and 730),
  cerrar_plan             boolean not null default false,
  limitaciones_distancia  text,                                    -- consulta a distancia: «no hay exploración táctil/vascular»
  observacion_video       text,
  estado                  text not null default 'borrador' check (estado in ('borrador', 'pendiente_firma', 'cerrada')),
  firma_aviso_pendiente   boolean not null default false,          -- P-004: atención de urgencia sin firma de aviso
  excepcion_autorizada_por uuid references piefirme.perfiles(id),   -- Administrador que autoriza cerrar sin aviso firmado
  excepcion_motivo        text,
  firma_podologo_id       uuid references piefirme.firmas(id),
  firma_paciente_id       uuid references piefirme.firmas(id),       -- recibo de indicaciones (si aplica)
  firmada_en              timestamptz,
  firmada_por             uuid references piefirme.perfiles(id),     -- «Atendió» = quien firma (P-025)
  cedula_firmante         text,
  hash_contenido          text,                                    -- huella de la nota al firmar (P-142)
  borrador_guardado_en    timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (estado <> 'cerrada' or (firmada_en is not null and firmada_por is not null and firma_podologo_id is not null and hash_contenido is not null)),
  check (excepcion_autorizada_por is null or excepcion_motivo is not null)
);
create index on piefirme.consultas (organizacion_id, paciente_id, fecha_hora desc);
create index on piefirme.consultas (organizacion_id, sede_id, fecha_hora desc);
create index on piefirme.consultas (organizacion_id, podologo_id, estado);
create index on piefirme.consultas (cita_id);
alter table piefirme.consentimientos add constraint consentimientos_consulta_fk foreign key (consulta_id) references piefirme.consultas(id);

-- ═════════════════════ reglas de la consulta ═════════════════════
create or replace function piefirme_app.consulta_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pac record; v_per record;
begin
  if tg_op = 'INSERT' then
    if new.estado = 'cerrada' then raise exception 'Una consulta nace en borrador; se cierra con firma' using errcode = 'P0001'; end if;
    select organizacion_id, sede_registro_id, alta_rapida into v_pac from piefirme.pacientes where id = new.paciente_id;
    if v_pac.organizacion_id is distinct from new.organizacion_id then raise exception 'Paciente de otra clínica' using errcode = 'P0001'; end if;
    select organizacion_id, rol into v_per from piefirme.perfiles where id = new.podologo_id;
    if v_per.organizacion_id is distinct from new.organizacion_id or v_per.rol <> 'podologo' then
      raise exception 'El responsable de la consulta debe ser un podólogo de la clínica' using errcode = 'P0001';
    end if;
    if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
      raise exception 'Sede de otra clínica' using errcode = 'P0001';
    end if;
    -- P-003: el alta rápida debe completarse antes de la primera consulta clínica
    if v_pac.alta_rapida then raise exception 'Complete la ficha del paciente antes de la consulta (alta rápida)' using errcode = 'P0001'; end if;
    new.folio := coalesce(new.folio, piefirme_app.siguiente_folio_clinico(new.sede_id, 'CON'));
    select to_jsonb(a) - 'organizacion_id' into new.antecedentes_snapshot from piefirme.antecedentes_paciente a where a.paciente_id = new.paciente_id;
    -- aviso de privacidad pendiente: se puede atender pero no cerrar (P-004)
    new.firma_aviso_pendiente := not exists (select 1 from piefirme.consentimientos c where c.paciente_id = new.paciente_id and c.tipo = 'aviso_privacidad' and c.estado = 'firmado');
    new.excepcion_autorizada_por := null; new.excepcion_motivo := null;
    return new;
  end if;

  -- UPDATE
  if old.estado = 'cerrada' then
    raise exception 'La nota firmada está bloqueada: solo admite nota aclaratoria (P-001)' using errcode = 'P0001';
  end if;
  if new.paciente_id <> old.paciente_id or new.sede_id <> old.sede_id or new.folio is distinct from old.folio
     or new.podologo_id <> old.podologo_id or new.organizacion_id <> old.organizacion_id then
    raise exception 'Paciente, sede, folio y podólogo no se cambian en una consulta' using errcode = 'P0001';
  end if;
  if (new.excepcion_autorizada_por is distinct from old.excepcion_autorizada_por or new.excepcion_motivo is distinct from old.excepcion_motivo)
     and coalesce(current_setting('app.rpc_excepcion', true), '') <> '1' then
    raise exception 'La excepción de aviso solo la autoriza el Administrador (use autorizar_excepcion_aviso)' using errcode = 'P0001';
  end if;
  if new.estado = 'borrador' and old.estado = 'pendiente_firma' then null;
  elsif new.estado <> old.estado and not ((old.estado = 'borrador' and new.estado in ('pendiente_firma', 'cerrada'))
                                          or (old.estado = 'pendiente_firma' and new.estado = 'cerrada')) then
    raise exception 'Transición de estado no válida: % → %', old.estado, new.estado using errcode = 'P0001';
  end if;

  if new.estado = 'cerrada' then
    select * into v_per from piefirme.perfiles where id = new.podologo_id;
    new.firmada_por := coalesce(auth.uid(), new.podologo_id);
    if new.firmada_por <> new.podologo_id then raise exception 'Solo el podólogo que atiende firma la nota' using errcode = 'P0001'; end if;
    if nullif(btrim(coalesce(v_per.cedula, '')), '') is null then
      raise exception 'El podólogo necesita cédula profesional registrada para firmar (P-146)' using errcode = 'P0001';
    end if;
    new.cedula_firmante := v_per.cedula;
    if new.firma_podologo_id is null then raise exception 'Falta la firma del podólogo' using errcode = 'P0001'; end if;
    if coalesce(btrim(new.motivo_consulta), '') = '' or coalesce(btrim(new.padecimiento_actual), '') = ''
       or coalesce(btrim(new.nota_evolucion), '') = '' or new.pronostico is null then
      raise exception 'Faltan motivo, padecimiento actual, nota de evolución o pronóstico' using errcode = 'P0001';
    end if;
    if not exists (select 1 from piefirme.diagnosticos_consulta d where d.consulta_id = new.id and d.tipo = 'principal') then
      raise exception 'Falta el diagnóstico principal' using errcode = 'P0001';
    end if;
    if exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and coalesce(piefirme_app.edad(p.fecha_nacimiento), 99) < 18)
       and not exists (select 1 from piefirme.tutores t where t.paciente_id = new.paciente_id and t.vigente) then
      raise exception 'Paciente menor de 18 años sin tutor registrado (P-005)' using errcode = 'P0001';
    end if;
    new.firma_aviso_pendiente := not exists (select 1 from piefirme.consentimientos c where c.paciente_id = new.paciente_id and c.tipo = 'aviso_privacidad' and c.estado = 'firmado');
    if new.firma_aviso_pendiente and new.excepcion_autorizada_por is null then
      raise exception 'Falta el aviso de privacidad firmado: el Administrador debe autorizar la excepción (P-004)' using errcode = 'P0001';
    end if;
    new.firmada_en := case when auth.uid() is null and new.firmada_en is not null then new.firmada_en else now() end;   -- solo service_role (importaciones/semillas) fija la fecha de firma
    new.hash_contenido := encode(sha256(convert_to((to_jsonb(new) - array['updated_at', 'hash_contenido', 'borrador_guardado_en'])::text, 'UTF8')), 'hex');
  end if;
  return new;
end $$;
create trigger t_consulta_bi before insert or update on piefirme.consultas for each row execute function piefirme_app.consulta_bi();

create or replace function piefirme_app.consulta_bd() returns trigger language plpgsql as $$
begin
  if old.estado <> 'borrador' then raise exception 'Solo se descartan consultas en borrador; nada clínico se borra (P-127)' using errcode = 'P0001'; end if;
  return old;
end $$;
create trigger t_consulta_bd before delete on piefirme.consultas for each row execute function piefirme_app.consulta_bd();

-- Efectos al cerrar: vigencia de conservación, versión de expediente, paciente reactivado.
create or replace function piefirme_app.consulta_au() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_anios integer;
begin
  if new.estado = 'cerrada' and old.estado <> 'cerrada' then
    select coalesce((o.parametros ->> 'retencion_anios')::int, 5) into v_anios from piefirme.organizaciones o where o.id = new.organizacion_id;
    update piefirme.expedientes set ultima_atencion = (new.firmada_en at time zone coalesce((select zona_horaria from piefirme.organizaciones where id = new.organizacion_id), 'America/Mexico_City'))::date,
           conservar_hasta = ((new.firmada_en at time zone coalesce((select zona_horaria from piefirme.organizaciones where id = new.organizacion_id), 'America/Mexico_City'))::date + make_interval(years => v_anios))::date,
           version = version + 1
     where paciente_id = new.paciente_id;
    update piefirme.pacientes set estado = 'activo' where id = new.paciente_id and estado = 'inactivo';
    -- P-045: la cita pasa a «Atendida» al firmarse la nota (B valida la transición); si no se puede, no bloquea la firma y queda en bitácora.
    if new.cita_id is not null then
      begin
        update piefirme.citas set estado = 'confirmada' where id = new.cita_id and estado = 'por_confirmar';
        update piefirme.citas set estado = 'atendida', atendio_id = new.firmada_por where id = new.cita_id and estado in ('confirmada', 'en_camino');
      exception when others then
        insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
        values (new.organizacion_id, auth.uid(), new.sede_id, 'actualizar', 'citas', new.cita_id::text,
                jsonb_build_object('cita_no_sincronizada', true, 'consulta_id', new.id, 'error', sqlerrm));
      end;
    end if;
  end if;
  return null;
end $$;
create trigger t_consulta_au after update on piefirme.consultas for each row execute function piefirme_app.consulta_au();

-- Guardia común de hijos clínicos: misma clínica y, si p_bloquear = 'bloquear', la consulta cerrada no admite cambios (P-001).
create or replace function piefirme_app.hijo_consulta_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_row jsonb; v_c uuid; v_estado text; v_org uuid;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_c := (v_row ->> 'consulta_id')::uuid;
  select estado, organizacion_id into v_estado, v_org from piefirme.consultas where id = v_c;
  if v_org is null then raise exception 'Consulta no encontrada' using errcode = 'P0001'; end if;
  if tg_op <> 'DELETE' and (v_row ->> 'organizacion_id')::uuid <> v_org then raise exception 'Consulta de otra clínica' using errcode = 'P0001'; end if;
  if v_estado = 'cerrada' and coalesce(tg_argv[0], 'bloquear') = 'bloquear' then
    raise exception 'La consulta está cerrada y firmada: el registro clínico no se modifica (P-001)' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- E31 signos vitales y somatometría (1 por consulta)
create table piefirme.signos_vitales (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null unique references piefirme.consultas(id) on delete cascade,
  peso_kg          numeric(5, 1) check (peso_kg between 1 and 500),
  talla_cm         numeric(5, 1) check (talla_cm between 30 and 260),
  imc              numeric(4, 1) generated always as (case when talla_cm > 0 and peso_kg is not null then round(peso_kg / ((talla_cm / 100) * (talla_cm / 100)), 1) end) stored,
  ta_sistolica     integer check (ta_sistolica between 40 and 300),
  ta_diastolica    integer check (ta_diastolica between 20 and 200),
  glucosa_capilar  integer check (glucosa_capilar between 10 and 900),   -- mg/dL
  frecuencia_cardiaca integer check (frecuencia_cardiaca between 20 and 300),
  temperatura_c    numeric(3, 1) check (temperatura_c between 30 and 45),
  dolor_0_10       integer check (dolor_0_10 between 0 and 10),
  talla_calzado    numeric(4, 1),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((ta_sistolica is null) = (ta_diastolica is null))
);
create index on piefirme.signos_vitales (organizacion_id);
create trigger t_hijo before insert or update or delete on piefirme.signos_vitales for each row execute function piefirme_app.hijo_consulta_bi('bloquear');

-- Nota aclaratoria sobre nota firmada: fecha, hora, autor y firma; la original siempre visible (P-001). Inmutable.
create table piefirme.notas_aclaratorias (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id      uuid not null references piefirme.consultas(id),
  texto            text not null check (length(btrim(texto)) >= 5),
  autor_id         uuid not null references piefirme.perfiles(id),
  firma_id         uuid not null references piefirme.firmas(id),
  fecha_hora       timestamptz not null default now(),
  hash_contenido   text,
  created_at       timestamptz not null default now()
);
create index on piefirme.notas_aclaratorias (organizacion_id, consulta_id, fecha_hora);

create or replace function piefirme_app.nota_aclaratoria_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_c record;
begin
  select estado, organizacion_id, podologo_id into v_c from piefirme.consultas where id = new.consulta_id;
  if v_c.organizacion_id is distinct from new.organizacion_id then raise exception 'Consulta de otra clínica' using errcode = 'P0001'; end if;
  if v_c.estado <> 'cerrada' then raise exception 'La nota aclaratoria solo aplica a una nota ya firmada; antes de firmar se edita libremente' using errcode = 'P0001'; end if;
  if v_c.podologo_id <> new.autor_id then raise exception 'Solo el podólogo autor agrega la nota aclaratoria' using errcode = 'P0001'; end if;
  new.hash_contenido := encode(sha256(convert_to(new.texto || new.consulta_id::text || new.autor_id::text || new.fecha_hora::text, 'UTF8')), 'hex');
  return new;
end $$;
create trigger t_nota_aclaratoria_bi before insert on piefirme.notas_aclaratorias for each row execute function piefirme_app.nota_aclaratoria_bi();
create trigger t_inmutable before update or delete on piefirme.notas_aclaratorias for each row execute function piefirme_app.a_inmutable();

-- ═════════════════════ RPC ═════════════════════
-- Firma y cierra la consulta (aplica todas las validaciones del trigger).
create or replace function piefirme.firmar_consulta(p_consulta uuid, p_firma uuid) returns text
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_folio text;
begin
  update piefirme.consultas set firma_podologo_id = p_firma, estado = 'cerrada'
   where id = p_consulta and podologo_id = auth.uid() and estado <> 'cerrada'
  returning folio into v_folio;
  if v_folio is null then raise exception 'No se pudo firmar: la consulta no existe, ya está cerrada o no es suya' using errcode = 'P0001'; end if;
  return v_folio;
end $$;

-- Excepción P-004: solo el Administrador autoriza cerrar una consulta sin aviso de privacidad firmado; queda en bitácora.
create or replace function piefirme.autorizar_excepcion_aviso(p_consulta uuid, p_motivo text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el Administrador autoriza la excepción' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'El motivo es obligatorio' using errcode = 'P0001'; end if;
  if not exists (select 1 from piefirme.consultas where id = p_consulta and organizacion_id = piefirme_app.org_id() and estado <> 'cerrada') then
    raise exception 'Consulta no encontrada o ya cerrada' using errcode = 'P0001';
  end if;
  perform set_config('app.rpc_excepcion', '1', true);
  update piefirme.consultas set excepcion_autorizada_por = auth.uid(), excepcion_motivo = p_motivo where id = p_consulta;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (piefirme_app.org_id(), auth.uid(), 'actualizar', 'consultas', p_consulta::text, jsonb_build_object('excepcion_aviso_privacidad', p_motivo));
end $$;

-- N-04: el dato de VIH solo se lee con registro; el podólogo tratante, o con motivo si es otro podólogo; Administración siempre.
create or replace function piefirme.ver_dato_sensible(p_paciente uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_tratante boolean; v_dato record;
begin
  if piefirme_app.rol()::text not in ('administrador', 'podologo') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  if not exists (select 1 from piefirme.pacientes where id = p_paciente and organizacion_id = piefirme_app.org_id()) then raise exception 'Paciente no encontrado' using errcode = 'P0002'; end if;
  v_tratante := exists (select 1 from piefirme.consultas c where c.paciente_id = p_paciente and c.podologo_id = auth.uid());
  if piefirme_app.rol()::text = 'podologo' and not v_tratante and length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Indique el motivo para consultar este dato (N-04)' using errcode = 'P0001';
  end if;
  select vih, vih_nota into v_dato from piefirme.paciente_datos_sensibles where paciente_id = p_paciente;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (piefirme_app.org_id(), auth.uid(), 'ver', 'paciente_datos_sensibles', p_paciente::text, jsonb_build_object('motivo', p_motivo, 'tratante', v_tratante));
  return jsonb_build_object('vih', v_dato.vih, 'vih_nota', v_dato.vih_nota);
end $$;

-- ═════════════════════ RLS ═════════════════════
alter table piefirme.consultas enable row level security;
create policy consultas_sel on piefirme.consultas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo'));
create policy consultas_ins on piefirme.consultas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = 'podologo' and podologo_id = auth.uid() and piefirme_app.puede_sede(sede_id));
create policy consultas_upd on piefirme.consultas for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = 'podologo' and podologo_id = auth.uid() and estado <> 'cerrada')
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and podologo_id = auth.uid());
create policy consultas_del on piefirme.consultas for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text = 'podologo' and podologo_id = auth.uid() and estado = 'borrador');

select piefirme_app.a_politicas('signos_vitales', array['administrador', 'podologo'], array['podologo']);

alter table piefirme.notas_aclaratorias enable row level security;
create policy notas_aclaratorias_sel on piefirme.notas_aclaratorias for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo'));
create policy notas_aclaratorias_ins on piefirme.notas_aclaratorias for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = 'podologo' and autor_id = auth.uid());

select piefirme_app.a_triggers('consultas');
select piefirme_app.a_triggers('signos_vitales');
select piefirme_app.a_triggers('notas_aclaratorias');

-- ═════════════════════ vistas ═════════════════════
-- Formato 3 «Seguimiento clínico»: Fecha · Atendió · Servicio · Observaciones · Próx. visita (una fila por consulta firmada).
create view piefirme.prp_seguimiento_clinico with (security_invoker = true) as
select c.id as consulta_id, c.organizacion_id, c.paciente_id, c.folio, c.sede_id,
       c.fecha_hora::date as fecha,
       c.fecha_hora,
       coalesce(pf.nombre || ' ' || coalesce(pf.apellidos, ''), '') as atendio,
       c.firmada_por,
       s.nombre as servicio,
       coalesce(c.observaciones_seguimiento, c.nota_evolucion) as observaciones,
       c.tratamiento_texto,
       c.proxima_visita,
       c.tipo_atencion,
       (select count(*) from piefirme.notas_aclaratorias n where n.consulta_id = c.id) as notas_aclaratorias
  from piefirme.consultas c
  left join piefirme.perfiles pf on pf.id = c.firmada_por
  left join piefirme.servicios s on s.id = c.servicio_id
 where c.estado = 'cerrada';

create view piefirme.prp_consultas_pendientes with (security_invoker = true) as
select c.id, c.organizacion_id, c.folio, c.paciente_id, c.sede_id, c.podologo_id, c.estado, c.fecha_hora, c.firma_aviso_pendiente,
       c.borrador_guardado_en, now() - c.fecha_hora as antiguedad
  from piefirme.consultas c
 where c.estado in ('borrador', 'pendiente_firma');

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on function piefirme.firmar_consulta(uuid, uuid) from public, anon;
grant execute on function piefirme.firmar_consulta(uuid, uuid) to authenticated;
revoke all on function piefirme.autorizar_excepcion_aviso(uuid, text) from public, anon;
grant execute on function piefirme.autorizar_excepcion_aviso(uuid, text) to authenticated;
revoke all on function piefirme.ver_dato_sensible(uuid, text) from public, anon;
grant execute on function piefirme.ver_dato_sensible(uuid, text) to authenticated;
revoke all on all tables in schema piefirme from anon;
