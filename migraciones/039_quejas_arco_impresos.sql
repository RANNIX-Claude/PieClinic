-- 039 · A (Clínico) · Quejas e incidencias, solicitudes ARCO, documentos emitidos / impresos de la historia (consentimiento, antecedentes,
-- seguimiento, historia completa, en blanco) con bitácora y versión del expediente, y fusión de expedientes duplicados.
-- Fuentes: DICCIONARIO E46, E47, E67; MODELO_ESTADOS S26; REGLAS P-006, P-020, P-021, P-022, P-141, N-04, docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md §4.
-- Depende de: 001, 010, 030-038 (y tablas de B solo para la fusión, por nombre dinámico).

-- ═════════════════════ E67 queja / incidencia ═════════════════════
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.quejas (
  id                        uuid primary key default gen_random_uuid(),
  organizacion_id           uuid not null references piefirme.organizaciones(id) on delete cascade,
  folio                     text,                                   -- {SEDE}-QJ-{NNNNNN}
  sede_id                   uuid not null references piefirme.sedes(id),
  paciente_id               uuid references piefirme.pacientes(id),
  consulta_id               uuid references piefirme.consultas(id),   -- opcional; obligatoria en eventos adversos clínicos (P-021)
  podologo_id               uuid references piefirme.perfiles(id),    -- señalado: solo se le notifica (P-020)
  registrada_por            uuid not null references piefirme.perfiles(id) default auth.uid(),
  canal                     text not null check (canal in ('llamada', 'presencial', 'whatsapp', 'correo', 'portal', 'otro')),
  fecha_hora                timestamptz not null default now(),
  clase                     text not null default 'administrativa' check (clase in ('administrativa', 'evento_adverso_clinico')),
  tipo                      text not null check (tipo in ('dolor_posterior', 'tiempo_espera', 'cobro_incorrecto', 'evento_adverso_infeccion', 'trato_personal', 'instrumental_higiene', 'otro')),
  gravedad                  text not null check (gravedad in ('baja', 'media', 'alta')),
  descripcion               text not null check (length(btrim(descripcion)) >= 5),
  responsable_id            uuid references piefirme.perfiles(id),    -- responsable de seguimiento (Administración o responsable clínico)
  fecha_compromiso          date,
  resolucion                text,
  compensacion_tipo         text not null default 'ninguna' check (compensacion_tipo in ('ninguna', 'disculpa', 'consulta_sin_costo', 'reembolso', 'descuento')),
  compensacion_monto        numeric(14, 2) check (compensacion_monto >= 0),
  compensacion_propuesta_por uuid references piefirme.perfiles(id),
  compensacion_autorizada_por uuid references piefirme.perfiles(id), -- P-022: con costo, la autoriza Administración
  lote_esterilizacion_id    uuid references piefirme.lotes_esterilizacion(id),   -- queja de instrumental: lote revisado
  estado                    text not null default 'nueva' check (estado in ('nueva', 'en_revision', 'escalada', 'resuelta', 'cerrada')),
  encuesta_enviada_en       timestamptz,
  paciente_notificado_en    timestamptz,
  cerrada_en                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (clase <> 'evento_adverso_clinico' or consulta_id is not null),
  check (compensacion_tipo not in ('reembolso', 'descuento') or compensacion_monto is not null),
  check (estado not in ('resuelta', 'cerrada') or length(btrim(coalesce(resolucion, ''))) > 0),
  check (estado not in ('en_revision', 'escalada', 'resuelta', 'cerrada') or responsable_id is not null)
);
create index on piefirme.quejas (organizacion_id, sede_id, estado);
create index on piefirme.quejas (organizacion_id, responsable_id) where estado in ('nueva', 'en_revision', 'escalada');
create index on piefirme.quejas (organizacion_id, podologo_id);

create or replace function piefirme_app.queja_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_costo boolean;
begin
  if tg_op = 'INSERT' then
    new.folio := coalesce(new.folio, piefirme_app.siguiente_folio_clinico(new.sede_id, 'QJ'));
    new.estado := 'nueva';
    new.compensacion_autorizada_por := null;
    if new.paciente_id is not null and not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'Paciente de otra clínica' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.folio is distinct from old.folio or new.organizacion_id <> old.organizacion_id or new.registrada_por <> old.registrada_por then
    raise exception 'Folio y registro de la queja no se cambian' using errcode = 'P0001';
  end if;
  if old.estado = 'cerrada' then raise exception 'Una queja cerrada no se modifica' using errcode = 'P0001'; end if;
  if new.compensacion_autorizada_por is distinct from old.compensacion_autorizada_por then
    if auth.uid() is not null and not piefirme_app.es_admin() then raise exception 'Solo Administración autoriza compensaciones (P-022)' using errcode = '42501'; end if;
    new.compensacion_autorizada_por := case when new.compensacion_autorizada_por is not null then coalesce(auth.uid(), new.compensacion_autorizada_por) end;
  end if;
  v_costo := new.compensacion_tipo in ('consulta_sin_costo', 'reembolso', 'descuento');
  if new.estado <> old.estado then
    if not ((old.estado = 'nueva' and new.estado in ('en_revision', 'escalada'))
         or (old.estado = 'en_revision' and new.estado in ('escalada', 'resuelta'))
         or (old.estado = 'escalada' and new.estado = 'resuelta')
         or (old.estado = 'resuelta' and new.estado in ('cerrada', 'en_revision'))) then
      raise exception 'Transición de queja no válida: % → %', old.estado, new.estado using errcode = 'P0001';
    end if;
    if new.estado in ('resuelta', 'cerrada') and v_costo and new.compensacion_autorizada_por is null then
      raise exception 'La compensación con costo requiere autorización de Administración (P-022)' using errcode = 'P0001';
    end if;
    if new.estado = 'cerrada' then new.cerrada_en := now(); end if;
  end if;
  return new;
end $$;
create trigger t_queja_bi before insert or update on piefirme.quejas for each row execute function piefirme_app.queja_bi();
create trigger t_no_borrar before delete on piefirme.quejas for each row execute function piefirme_app.a_no_borrar();

-- ═════════════════════ E47 solicitudes ARCO ═════════════════════
create table piefirme.solicitudes_arco (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id),
  tipo             text not null check (tipo in ('acceso', 'rectificacion', 'cancelacion', 'oposicion')),
  estado           text not null default 'recibida' check (estado in ('recibida', 'en_proceso', 'atendida', 'rechazada')),
  fecha_recibida   date not null default current_date,
  fecha_limite     date,                                           -- 20 días naturales (P-141, parámetro arco_dias_naturales)
  detalle          text,
  resolucion       text,
  atendida_por     uuid references piefirme.perfiles(id),
  atendida_en      timestamptz,
  registrada_por   uuid references piefirme.perfiles(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (estado not in ('atendida', 'rechazada') or length(btrim(coalesce(resolucion, ''))) > 0)
);
create index on piefirme.solicitudes_arco (organizacion_id, estado, fecha_limite);

create or replace function piefirme_app.arco_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dias integer;
begin
  if tg_op = 'INSERT' then
    select coalesce((o.parametros ->> 'arco_dias_naturales')::int, 20) into v_dias from piefirme.organizaciones o where o.id = new.organizacion_id;
    new.fecha_limite := new.fecha_recibida + v_dias;
    new.estado := 'recibida';
  else
    if old.estado in ('atendida', 'rechazada') then raise exception 'La solicitud ya fue resuelta' using errcode = 'P0001'; end if;
    if new.estado in ('atendida', 'rechazada') then
      new.atendida_por := coalesce(auth.uid(), new.atendida_por);
      new.atendida_en := now();
      -- «cancelación» = bloqueo del expediente, no borrado, durante la conservación obligatoria
      if new.estado = 'atendida' and new.tipo = 'cancelacion' then
        update piefirme.expedientes set estado = 'bloqueado_arco' where paciente_id = new.paciente_id;
        update piefirme.pacientes set estado = 'bloqueado' where id = new.paciente_id;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_arco_bi before insert or update on piefirme.solicitudes_arco for each row execute function piefirme_app.arco_bi();
create trigger t_no_borrar before delete on piefirme.solicitudes_arco for each row execute function piefirme_app.a_no_borrar();

-- ═════════════════════ E46 documentos emitidos / impresos (evidencia de cada impresión) ═════════════════════
create table piefirme.documentos_emitidos (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  folio               text,                                         -- {SEDE}-DOC-{NNNNNN}
  tipo                text not null check (tipo in ('impreso_consentimiento', 'impreso_antecedentes', 'impreso_seguimiento', 'impreso_historia_completa',
                                                    'impreso_en_blanco', 'receta_indicaciones', 'carta_referencia', 'constancia', 'certificado')),
  paciente_id         uuid references piefirme.pacientes(id),
  consulta_id         uuid references piefirme.consultas(id),
  sede_id             uuid not null references piefirme.sedes(id),
  plantilla_id        uuid references piefirme.plantillas_documento(id),
  plantilla_version   integer,
  version_expediente  integer,                                      -- marca de versión del expediente en el PDF
  en_blanco           boolean not null default false,
  es_copia            boolean not null default false,               -- reimpresión: sale marcada «copia»
  incluye_sensibles   boolean not null default false,               -- VIH solo impreso por podólogo/administración (N-04)
  contenido_hash      text,
  pdf_path            text,                                         -- 'pf-documentos': <organizacion_id>/…
  emitido_por         uuid not null references piefirme.perfiles(id) default auth.uid(),
  emitido_en          timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (en_blanco or paciente_id is not null)
);
create index on piefirme.documentos_emitidos (organizacion_id, paciente_id, emitido_en desc);
create trigger t_inmutable before update or delete on piefirme.documentos_emitidos for each row execute function piefirme_app.a_inmutable();

-- Prepara los datos del impreso, registra la emisión (versión del expediente, copia) y deja bitácora «imprimir». Un solo llamado por impresión.
create or replace function piefirme.datos_impreso(
  p_tipo text, p_paciente uuid default null, p_sede uuid default null, p_incluir_sensibles boolean default false, p_consulta uuid default null)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.org_id(); v_rol text := piefirme_app.rol()::text; v_pl record; v_pac record; v_data jsonb := '{}'::jsonb; v_ver integer; v_sede uuid;
  v_doc uuid; v_folio text; v_copia boolean := false; v_clin jsonb; v_sens jsonb; v_sensibles boolean := false; v_en_blanco boolean := (p_tipo = 'impreso_en_blanco');
  v_seg jsonb; v_ant jsonb;
begin
  if p_tipo not in ('impreso_consentimiento', 'impreso_antecedentes', 'impreso_seguimiento', 'impreso_historia_completa', 'impreso_en_blanco') then
    raise exception 'Tipo de impreso no válido' using errcode = 'P0001';
  end if;
  if p_tipo in ('impreso_antecedentes', 'impreso_seguimiento', 'impreso_historia_completa') and v_rol not in ('administrador', 'podologo') then
    raise exception 'Solo Podólogo o Administración imprimen el expediente clínico' using errcode = '42501';
  end if;
  if not v_en_blanco and p_paciente is null then raise exception 'Indique el paciente' using errcode = 'P0001'; end if;
  select * into v_pl from piefirme.plantillas_documento where organizacion_id = v_org and codigo = p_tipo and estado = 'activa';
  if not v_en_blanco then
    select * into v_pac from piefirme.pacientes where id = p_paciente and organizacion_id = v_org;
    if v_pac.id is null then raise exception 'Paciente no encontrado' using errcode = 'P0002'; end if;
  end if;
  v_sede := coalesce(p_sede, v_pac.sede_registro_id);
  if v_sede is null then raise exception 'Indique la sede' using errcode = 'P0001'; end if;

  if not v_en_blanco then
    v_data := jsonb_build_object(
      'paciente', to_jsonb(v_pac) - 'notas_administrativas',
      'sede', (select jsonb_build_object('clave', s.clave, 'nombre', s.nombre) from piefirme.sedes s where s.id = v_pac.sede_registro_id),
      'edad', piefirme_app.edad(v_pac.fecha_nacimiento),
      'tutor', (select to_jsonb(t) - 'firma_id' from piefirme.tutores t where t.paciente_id = p_paciente and t.vigente order by t.created_at desc limit 1));
    if p_tipo in ('impreso_antecedentes', 'impreso_historia_completa') then
      select to_jsonb(a) into v_ant from piefirme.antecedentes_paciente a where a.paciente_id = p_paciente;
      v_data := v_data || jsonb_build_object('antecedentes', v_ant,
        'alergias', coalesce((select jsonb_agg(to_jsonb(al) order by al.sustancia) from piefirme.alergias_paciente al where al.paciente_id = p_paciente and al.vigente), '[]'::jsonb),
        'medicamentos', coalesce((select jsonb_agg(to_jsonb(m)) from piefirme.medicamentos_paciente m where m.paciente_id = p_paciente and m.vigente), '[]'::jsonb),
        'contactos_emergencia', coalesce((select jsonb_agg(to_jsonb(c)) from piefirme.contactos_emergencia c where c.paciente_id = p_paciente), '[]'::jsonb),
        'exploracion_miembro_inferior', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
            select x.* from piefirme.exploracion_miembro_inferior x join piefirme.consultas cc on cc.id = x.consulta_id where cc.paciente_id = p_paciente order by cc.fecha_hora desc limit 2) e), '[]'::jsonb));
      -- N-04: VIH solo si lo imprime un podólogo o Administración y se pide expresamente; cada lectura va a bitácora
      if p_incluir_sensibles and v_rol in ('administrador', 'podologo') then
        select to_jsonb(s) into v_sens from piefirme.paciente_datos_sensibles s where s.paciente_id = p_paciente;
        v_data := v_data || jsonb_build_object('datos_sensibles', v_sens);
        v_sensibles := true;
        perform piefirme.registrar_bitacora('ver', 'paciente_datos_sensibles', p_paciente::text, jsonb_build_object('motivo', 'impresión de historia'), v_sede);
      end if;
    end if;
    if p_tipo in ('impreso_seguimiento', 'impreso_historia_completa') then
      select coalesce(jsonb_agg(jsonb_build_object('fecha', s.fecha, 'atendio', s.atendio, 'servicio', s.servicio, 'observaciones', s.observaciones,
                                                    'tratamiento', s.tratamiento_texto, 'proxima_visita', s.proxima_visita, 'folio', s.folio) order by s.fecha_hora), '[]'::jsonb)
        into v_seg from piefirme.prp_seguimiento_clinico s where s.paciente_id = p_paciente;
      v_clin := jsonb_build_object('visitas', v_seg,
        'diagnosticos', coalesce((select jsonb_agg(jsonb_build_object('categoria', d.categoria, 'texto_otros', d.texto_otros, 'cie10', d.cie10_codigo, 'tipo', d.tipo, 'fecha', c.fecha_hora))
                                    from piefirme.diagnosticos_consulta d join piefirme.consultas c on c.id = d.consulta_id where c.paciente_id = p_paciente and c.estado = 'cerrada'), '[]'::jsonb),
        'mapa_pie', coalesce((select jsonb_agg(to_jsonb(h)) from piefirme.prp_hallazgos_pie h where h.paciente_id = p_paciente and h.estado_consulta = 'cerrada'), '[]'::jsonb));
      v_data := v_data || jsonb_build_object('seguimiento', v_clin);
    end if;
    if p_tipo = 'impreso_consentimiento' and p_consulta is not null then
      v_data := v_data || jsonb_build_object('podologo', (select jsonb_build_object('nombre', pf.nombre || ' ' || coalesce(pf.apellidos, ''), 'cedula', pf.cedula)
                                                           from piefirme.consultas c join piefirme.perfiles pf on pf.id = c.podologo_id where c.id = p_consulta));
    end if;
    select version into v_ver from piefirme.expedientes where paciente_id = p_paciente;      -- Recepción no lo lee: queda NULL en su impresión
    select exists (select 1 from piefirme.documentos_emitidos d where d.organizacion_id = v_org and d.paciente_id = p_paciente and d.tipo = p_tipo
                      and d.consulta_id is not distinct from p_consulta and not d.en_blanco) into v_copia;
  end if;

  v_folio := piefirme_app.siguiente_folio_clinico(v_sede, 'DOC');
  insert into piefirme.documentos_emitidos (organizacion_id, folio, tipo, paciente_id, consulta_id, sede_id, plantilla_id, plantilla_version, version_expediente, en_blanco, es_copia, incluye_sensibles, contenido_hash)
  values (v_org, v_folio, p_tipo, p_paciente, p_consulta, v_sede, v_pl.id, v_pl.version, v_ver, v_en_blanco, v_copia, v_sensibles,
          encode(sha256(convert_to(v_data::text, 'UTF8')), 'hex'))
  returning id into v_doc;
  perform piefirme.registrar_bitacora('imprimir', 'documentos_emitidos', v_doc::text,
      jsonb_build_object('tipo', p_tipo, 'paciente_id', p_paciente, 'folio', v_folio, 'es_copia', v_copia, 'version_expediente', v_ver, 'en_blanco', v_en_blanco), v_sede);
  return jsonb_build_object('documento_id', v_doc, 'folio', v_folio, 'es_copia', v_copia, 'version_expediente', v_ver, 'en_blanco', v_en_blanco,
    'plantilla', case when v_pl.id is null then null else jsonb_build_object('id', v_pl.id, 'version', v_pl.version, 'estructura', v_pl.estructura, 'contenido', v_pl.contenido) end,
    'clinica', (select jsonb_build_object('nombre', o.nombre, 'logo_url', o.logo_url) from piefirme.organizaciones o where o.id = v_org),
    'datos', v_data);
end $$;

-- ═════════════════════ fusión de expedientes duplicados (solo Administrador, deshacer 30 días) ═════════════════════
-- Lo clínico firmado es inmutable y NO se mueve: queda ligado al paciente origen (estado «fusionado») y se consulta con pacientes_fusionados().
create or replace function piefirme.pacientes_fusionados(p_destino uuid) returns setof uuid
language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select p_destino union select id from piefirme.pacientes where fusionado_en = p_destino and organizacion_id = piefirme_app.org_id()
$$;

create or replace function piefirme.fusionar_pacientes(p_origen uuid, p_destino uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_det jsonb := '{}'::jsonb; t text; v_ids uuid[]; v_id uuid; v_sql text;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el Administrador combina expedientes' using errcode = '42501'; end if;
  if p_origen = p_destino or length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Origen y destino deben diferir y el motivo es obligatorio' using errcode = 'P0001'; end if;
  if (select count(*) from piefirme.pacientes where id in (p_origen, p_destino) and organizacion_id = v_org and estado <> 'fusionado') <> 2 then
    raise exception 'Pacientes no encontrados o ya fusionados' using errcode = 'P0001';
  end if;
  foreach t in array array['citas', 'ventas', 'anticipos', 'planes_adquiridos', 'reservas_portal', 'lista_espera', 'datos_fiscales_paciente',
                           'contactos_emergencia', 'tutores', 'alergias_paciente', 'medicamentos_paciente', 'planes_tratamiento', 'ordenes_plantilla'] loop
    if to_regclass('piefirme.' || t) is not null
       and exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = t and column_name = 'paciente_id') then
      v_sql := format('with m as (update piefirme.%I set paciente_id = $1 where paciente_id = $2 and organizacion_id = $3 returning id) select coalesce(array_agg(id), ''{}'') from m', t);
      execute v_sql into v_ids using p_destino, p_origen, v_org;
      if cardinality(v_ids) > 0 then v_det := v_det || jsonb_build_object(t, to_jsonb(v_ids)); end if;
    end if;
  end loop;
  update piefirme.pacientes set estado = 'fusionado', fusionado_en = p_destino where id = p_origen;
  update piefirme.expedientes set estado = 'resguardo', fecha_cierre = current_date where paciente_id = p_origen;
  insert into piefirme.paciente_fusiones (organizacion_id, paciente_origen_id, paciente_destino_id, motivo, detalle, realizada_por)
  values (v_org, p_origen, p_destino, p_motivo, v_det, auth.uid()) returning id into v_id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), 'actualizar', 'paciente_fusiones', v_id::text, jsonb_build_object('origen', p_origen, 'destino', p_destino, 'motivo', p_motivo, 'movido', v_det));
  return v_id;
end $$;

create or replace function piefirme.deshacer_fusion(p_fusion uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f record; t text; v_ids jsonb;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el Administrador deshace una fusión' using errcode = '42501'; end if;
  select * into f from piefirme.paciente_fusiones where id = p_fusion and organizacion_id = piefirme_app.org_id();
  if f.id is null or f.deshecha_en is not null or now() > f.limite_deshacer then
    raise exception 'La fusión no existe, ya se deshizo o pasó el plazo de 30 días' using errcode = 'P0001';
  end if;
  for t, v_ids in select key, value from jsonb_each(f.detalle) loop
    execute format('update piefirme.%I set paciente_id = $1 where id = any(select jsonb_array_elements_text($2)::uuid) and paciente_id = $3', t)
      using f.paciente_origen_id, v_ids, f.paciente_destino_id;
  end loop;
  update piefirme.pacientes set estado = 'activo', fusionado_en = null where id = f.paciente_origen_id;
  update piefirme.expedientes set estado = 'activo', fecha_cierre = null where paciente_id = f.paciente_origen_id;
  update piefirme.paciente_fusiones set deshecha_en = now(), deshecha_por = auth.uid() where id = f.id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (f.organizacion_id, auth.uid(), 'actualizar', 'paciente_fusiones', f.id::text, jsonb_build_object('deshecha', true));
end $$;

-- ═════════════════════ RLS ═════════════════════
-- Quejas: Recepción registra (C V); resuelve Administración y el responsable clínico asignado; el podólogo señalado no las ve (solo es notificado).
alter table piefirme.quejas enable row level security;
create policy quejas_sel on piefirme.quejas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.rol()::text in ('administrador', 'recepcion') or (piefirme_app.rol()::text = 'podologo' and responsable_id = auth.uid())));
create policy quejas_ins on piefirme.quejas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'recepcion', 'podologo') and registrada_por = auth.uid() and piefirme_app.puede_sede(sede_id));
create policy quejas_upd on piefirme.quejas for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.rol()::text = 'administrador' or (piefirme_app.rol()::text = 'podologo' and responsable_id = auth.uid())))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa());

select piefirme_app.a_politicas('solicitudes_arco', array['administrador', 'recepcion'], array['administrador', 'recepcion']);
-- Recepción registra la solicitud pero solo Administración la atiende (trigger de rol no necesario: update limitado por política)
drop policy solicitudes_arco_upd on piefirme.solicitudes_arco;
create policy solicitudes_arco_upd on piefirme.solicitudes_arco for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa());

alter table piefirme.documentos_emitidos enable row level security;
create policy documentos_emitidos_sel on piefirme.documentos_emitidos for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.rol()::text in ('administrador', 'podologo') or emitido_por = auth.uid()));
create policy documentos_emitidos_ins on piefirme.documentos_emitidos for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and emitido_por = auth.uid() and piefirme_app.puede_sede(sede_id));

select piefirme_app.a_triggers('quejas');
select piefirme_app.a_triggers('solicitudes_arco');
select piefirme_app.a_triggers('documentos_emitidos', false);

-- ═════════════════════ vistas ═════════════════════
create view piefirme.prp_quejas_resumen with (security_invoker = true) as
select q.id, q.organizacion_id, q.folio, q.sede_id, q.paciente_id, q.podologo_id, q.responsable_id, q.clase, q.tipo, q.gravedad, q.estado, q.fecha_hora,
       q.fecha_compromiso, q.cerrada_en,
       (coalesce(q.cerrada_en::date, current_date) - q.fecha_hora::date) as dias_abiertos,
       (q.estado not in ('resuelta', 'cerrada') and (current_date - q.fecha_hora::date) > coalesce((select (o.parametros ->> 'queja_meta_dias')::int from piefirme.organizaciones o where o.id = q.organizacion_id), 3)) as fuera_de_meta
  from piefirme.quejas q;

create view piefirme.prp_arco_pendientes with (security_invoker = true) as
select s.id, s.organizacion_id, s.paciente_id, s.tipo, s.estado, s.fecha_recibida, s.fecha_limite, (s.fecha_limite - current_date) as dias_restantes, (s.fecha_limite < current_date) as vencida
  from piefirme.solicitudes_arco s where s.estado in ('recibida', 'en_proceso');

create view piefirme.prp_documentos_emitidos with (security_invoker = true) as
select d.id, d.organizacion_id, d.folio, d.tipo, d.paciente_id, d.consulta_id, d.sede_id, d.plantilla_version, d.version_expediente, d.en_blanco, d.es_copia,
       d.incluye_sensibles, d.emitido_por, d.emitido_en from piefirme.documentos_emitidos d;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on function piefirme.datos_impreso(text, uuid, uuid, boolean, uuid), piefirme.pacientes_fusionados(uuid),
  piefirme.fusionar_pacientes(uuid, uuid, text), piefirme.deshacer_fusion(uuid) from public, anon;
grant execute on function piefirme.datos_impreso(text, uuid, uuid, boolean, uuid), piefirme.pacientes_fusionados(uuid),
  piefirme.fusionar_pacientes(uuid, uuid, text), piefirme.deshacer_fusion(uuid) to authenticated;
revoke all on all tables in schema piefirme from anon;
