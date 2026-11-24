-- 037 · A (Clínico) · Videoconsulta (sala, liga de un solo uso, sin grabación por defecto), dictado por voz con IA (sin llave real),
-- alertas clínicas «apoyo, no diagnóstico» y registro de que el podólogo las vio.
-- Fuentes: DICCIONARIO E48-E50; MODELO_ESTADOS S06, S07; REGLAS P-012, P-014, P-015, P-016, P-017, P-018, P-032, P-147.
-- Depende de: 001, 010, 031, 034, 035, citas (B 023) y helpers portal de B 024 (app.limite_tasa, app.hash_token, app.token_nuevo, app.ip_cliente).

-- ═════════════════════ E48-E49 dictado por voz ═════════════════════
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.dictados (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id         uuid not null references piefirme.consultas(id) on delete cascade,
  usuario_id          uuid not null references piefirme.perfiles(id) default auth.uid(),
  seccion             text not null check (seccion in ('nota_evolucion', 'descripcion_procedimiento', 'hallazgos')),
  idioma              text not null default 'es-MX',
  consentimiento_id   uuid not null references piefirme.consentimientos(id),    -- P-015: consentimiento específico, firmado y vigente
  estado              text not null default 'en_curso' check (estado in ('en_curso', 'pausado', 'transcrito', 'aceptado', 'editado', 'descartado')),
  duracion_seg        integer check (duracion_seg >= 0),
  audio_path          text,                                                   -- 'pf-expedientes'; se borra al confirmar (P-014)
  audio_borrar_antes  timestamptz not null default (now() + interval '24 hours'),
  audio_eliminado_en  timestamptz,
  transcripcion       text,                                                   -- editable por el podólogo
  transcripcion_final text,
  adaptador_ia        text not null default 'no_configurado',                 -- sin llave real todavía (REGLAS «Lo que NO se puede inventar»)
  iniciado_en         timestamptz not null default now(),
  terminado_en        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on piefirme.dictados (organizacion_id, consulta_id);
create index on piefirme.dictados (audio_borrar_antes) where audio_path is not null and audio_eliminado_en is null;
alter table piefirme.consultas add constraint consultas_dictado_fk foreign key (dictado_id) references piefirme.dictados(id) on delete set null;

create table piefirme.dictado_propuestas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  dictado_id       uuid not null references piefirme.dictados(id) on delete cascade,
  campo            text not null check (campo in ('motivo_consulta', 'procedimiento', 'hallazgo', 'medicamento', 'proxima_cita')),   -- el diagnóstico NUNCA se propone
  valor            text not null,
  confianza        numeric(4, 3) check (confianza between 0 and 1),
  decision         text not null default 'pendiente' check (decision in ('pendiente', 'aceptada', 'rechazada')),
  created_at       timestamptz not null default now()
);
create index on piefirme.dictado_propuestas (organizacion_id, dictado_id);

create or replace function piefirme_app.dictado_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_c record; v_k record;
begin
  select estado, organizacion_id, paciente_id into v_c from piefirme.consultas where id = new.consulta_id;
  if v_c.organizacion_id is distinct from new.organizacion_id then raise exception 'Consulta de otra clínica' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    if v_c.estado = 'cerrada' then raise exception 'La consulta está cerrada' using errcode = 'P0001'; end if;
    select tipo, estado, aceptado, paciente_id into v_k from piefirme.consentimientos where id = new.consentimiento_id;
    if v_k.tipo is distinct from 'dictado_ia' or v_k.estado <> 'firmado' or not v_k.aceptado or v_k.paciente_id <> v_c.paciente_id then
      raise exception 'Sin consentimiento de dictado/IA firmado y vigente del paciente (P-015)' using errcode = 'P0001';
    end if;
  else
    if old.estado in ('aceptado', 'editado', 'descartado') and new.estado <> old.estado then raise exception 'El dictado ya está resuelto' using errcode = 'P0001'; end if;
    if new.estado in ('aceptado', 'editado', 'descartado') and old.estado not in ('aceptado', 'editado', 'descartado') then
      new.terminado_en := now();
      if new.estado = 'aceptado' then new.transcripcion_final := coalesce(new.transcripcion_final, new.transcripcion); end if;
      if new.estado = 'editado' and new.transcripcion_final is null then raise exception 'Indique el texto final editado' using errcode = 'P0001'; end if;
      -- P-014: el audio se borra al confirmar la transcripción; se conserva solo el texto aceptado
      if new.audio_path is not null then new.audio_borrar_antes := now(); end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_dictado_bi before insert or update on piefirme.dictados for each row execute function piefirme_app.dictado_bi();
create trigger t_no_borrar before delete on piefirme.dictados for each row execute function piefirme_app.a_no_borrar();

-- Devuelve las rutas de audio vencidas para que el trabajo programado las borre de Storage; las desvincula aquí (máx. 24 h sin confirmar).
create or replace function piefirme.purgar_audios_dictado() returns table (dictado_id uuid, audio_path text)
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if piefirme_app.rol()::text not in ('administrador', 'podologo') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return query
    with v as (select d.id, d.audio_path from piefirme.dictados d
                where d.organizacion_id = piefirme_app.org_id() and d.audio_path is not null and d.audio_eliminado_en is null and d.audio_borrar_antes <= now() for update),
         u as (update piefirme.dictados d set audio_path = null, audio_eliminado_en = now() from v where d.id = v.id returning d.id)
    select v.id, v.audio_path from v join u on u.id = v.id;
end $$;

-- ═════════════════════ E50 videoconsulta ═════════════════════
create table piefirme.salas_videoconsulta (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references piefirme.organizaciones(id) on delete cascade,
  cita_id                 uuid not null unique references piefirme.citas(id),
  consulta_id             uuid references piefirme.consultas(id),
  paciente_id             uuid not null references piefirme.pacientes(id),
  podologo_id             uuid not null references piefirme.perfiles(id),
  sede_id                 uuid not null references piefirme.sedes(id),
  identificador           text not null unique,                               -- «CITA-20261027-031»
  token_hash              text not null,                                      -- liga de un solo uso por cita (el token solo se entrega al crearla)
  inicio_programado       timestamptz not null,
  fin_programado          timestamptz not null,
  entrada_minutos_antes   integer not null default 10 check (entrada_minutos_antes between 0 and 60),   -- P-018
  tope_minutos            integer not null default 60 check (tope_minutos between 15 and 240),           -- P-016
  proveedor_video         text not null default 'no_configurado',
  estado                  text not null default 'programada' check (estado in ('programada', 'en_sala_espera', 'en_consulta', 'finalizada', 'liga_vencida')),
  paciente_conectado_en   timestamptz,
  calidad_conexion        text check (calidad_conexion in ('buena', 'regular', 'mala')),
  consentimiento_id       uuid references piefirme.consentimientos(id),         -- telemedicina firmado
  pagado_en_linea         boolean not null default false,                     -- avisa al podólogo, no bloquea (P-018)
  grabacion_autorizada    boolean not null default false,                     -- no se graba por defecto (P-016)
  grabacion_path          text,
  grabacion_conservar_hasta date,                                             -- 30 días
  iniciada_en             timestamptz,
  finalizada_en           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (fin_programado > inicio_programado),
  check (extract(epoch from (fin_programado - inicio_programado)) / 60 <= tope_minutos),
  check (grabacion_path is null or (grabacion_autorizada and grabacion_conservar_hasta is not null))
);
create index on piefirme.salas_videoconsulta (organizacion_id, sede_id, inicio_programado);
create index on piefirme.salas_videoconsulta (token_hash);

create table piefirme.sala_eventos (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sala_id          uuid not null references piefirme.salas_videoconsulta(id) on delete cascade,
  tipo             text not null check (tipo in ('conexion_paciente', 'desconexion', 'entrada_podologo', 'captura_imagen', 'foto_solicitada', 'foto_recibida', 'pantalla_compartida', 'finalizada')),
  detalle          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index on piefirme.sala_eventos (organizacion_id, sala_id);

create or replace function piefirme_app.sala_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_cita record; v_activa boolean;
begin
  if tg_op = 'INSERT' then
    -- P-147: la función existe pero queda apagada en producción hasta que un abogado revise el consentimiento
    select coalesce((o.parametros ->> 'telemedicina_activa')::boolean, false) into v_activa from piefirme.organizaciones o where o.id = new.organizacion_id;
    if not v_activa then raise exception 'La telemedicina no está activada para esta clínica (P-147)' using errcode = 'P0001'; end if;
    select organizacion_id, paciente_id, tipo_atencion, inicio, fin into v_cita from piefirme.citas where id = new.cita_id;
    if v_cita.organizacion_id is distinct from new.organizacion_id or v_cita.paciente_id <> new.paciente_id then
      raise exception 'La cita no corresponde al paciente o a la clínica' using errcode = 'P0001';
    end if;
    if v_cita.tipo_atencion <> 'videoconsulta' then raise exception 'La cita no es de videoconsulta' using errcode = 'P0001'; end if;
    new.estado := 'programada';
    return new;
  end if;
  if new.token_hash <> old.token_hash or new.cita_id <> old.cita_id or new.paciente_id <> old.paciente_id then
    raise exception 'La liga y la cita de la sala no se cambian' using errcode = 'P0001';
  end if;
  if new.estado <> old.estado then
    if not ((old.estado = 'programada' and new.estado in ('en_sala_espera', 'liga_vencida'))
         or (old.estado = 'en_sala_espera' and new.estado in ('en_consulta', 'liga_vencida'))
         or (old.estado = 'en_consulta' and new.estado = 'finalizada')) then
      raise exception 'Transición de sala no válida: % → %', old.estado, new.estado using errcode = 'P0001';
    end if;
    if new.estado = 'en_consulta' then new.iniciada_en := now(); end if;
    if new.estado = 'finalizada' then new.finalizada_en := now(); end if;
  end if;
  if new.grabacion_autorizada and not old.grabacion_autorizada and new.grabacion_conservar_hasta is null then
    new.grabacion_conservar_hasta := current_date + 30;
  end if;
  return new;
end $$;
create trigger t_sala_bi before insert or update on piefirme.salas_videoconsulta for each row execute function piefirme_app.sala_bi();

-- Crea la sala y devuelve la liga UNA sola vez (se guarda solo el hash).
create or replace function piefirme.crear_sala_videoconsulta(p_cita uuid, p_consulta uuid default null) returns jsonb
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c record; v_tok text := piefirme_app.token_nuevo(); v_id uuid; v_ident text;
begin
  if piefirme_app.rol()::text not in ('administrador', 'podologo', 'recepcion') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into c from piefirme.citas where id = p_cita;
  if c.id is null then raise exception 'Cita no encontrada' using errcode = 'P0002'; end if;
  v_ident := 'CITA-' || to_char(c.inicio, 'YYYYMMDD') || '-' || substr(replace(c.id::text, '-', ''), 1, 6);
  insert into piefirme.salas_videoconsulta (organizacion_id, cita_id, consulta_id, paciente_id, podologo_id, sede_id, identificador, token_hash, inicio_programado, fin_programado,
                                          entrada_minutos_antes, tope_minutos)
  values (c.organizacion_id, c.id, p_consulta, c.paciente_id, c.podologo_id, c.sede_id, v_ident, piefirme_app.hash_token(v_tok), c.inicio, c.fin,
          coalesce(piefirme_app.param_num(c.organizacion_id, 'videoconsulta_entrada_min', 10)::int, 10), coalesce(piefirme_app.param_num(c.organizacion_id, 'videoconsulta_tope_min', 60)::int, 60))
  returning id into v_id;
  return jsonb_build_object('sala_id', v_id, 'identificador', v_ident, 'token', v_tok);
end $$;

-- Portal (anon, sin cuenta): solo ven lo mínimo de SU sala con el token; límite de tasa por IP.
create or replace function piefirme.portal_sala_estado(p_token text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s record; v_est text; v_puede boolean;
begin
  select sv.*, pf.nombre as podologo_nombre, o.nombre as clinica
    into s from piefirme.salas_videoconsulta sv join piefirme.perfiles pf on pf.id = sv.podologo_id join piefirme.organizaciones o on o.id = sv.organizacion_id
   where sv.token_hash = piefirme_app.hash_token(p_token);
  if s.id is null then raise exception 'sala no disponible' using errcode = 'PF404'; end if;
  perform piefirme_app.limite_tasa(s.organizacion_id, piefirme_app.ip_cliente(), 'sala_estado', 120, interval '1 hour');
  v_est := case when s.estado in ('programada', 'en_sala_espera') and now() > s.fin_programado then 'liga_vencida'
                when s.estado = 'programada' and now() < s.inicio_programado - make_interval(mins => s.entrada_minutos_antes) then 'aun_no_es_hora'
                else s.estado end;
  v_puede := v_est in ('programada', 'en_sala_espera', 'en_consulta');
  return jsonb_build_object('estado', v_est, 'inicio', s.inicio_programado, 'puede_entrar', v_puede, 'podologo', s.podologo_nombre, 'clinica', s.clinica,
                            'consentimiento_firmado', s.consentimiento_id is not null, 'identificador', s.identificador);
end $$;

-- El paciente acepta el consentimiento de telemedicina (firma tecleada) y pasa a la sala de espera.
create or replace function piefirme.portal_sala_entrar(p_token text, p_nombre_firma text, p_acepta boolean) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s record; v_pl record; v_firma uuid; v_cons uuid;
begin
  select * into s from piefirme.salas_videoconsulta where token_hash = piefirme_app.hash_token(p_token);
  if s.id is null then raise exception 'sala no disponible' using errcode = 'PF404'; end if;
  perform piefirme_app.limite_tasa(s.organizacion_id, piefirme_app.ip_cliente(), 'sala_entrar', 30, interval '1 hour');
  if now() > s.fin_programado or s.estado in ('finalizada', 'liga_vencida') then
    update piefirme.salas_videoconsulta set estado = 'liga_vencida' where id = s.id and estado in ('programada', 'en_sala_espera');
    return jsonb_build_object('estado', 'liga_vencida', 'puede_entrar', false);
  end if;
  if now() < s.inicio_programado - make_interval(mins => s.entrada_minutos_antes) then
    return jsonb_build_object('estado', 'aun_no_es_hora', 'puede_entrar', false);
  end if;
  if s.consentimiento_id is null then
    if not coalesce(p_acepta, false) or length(btrim(coalesce(p_nombre_firma, ''))) < 5 then
      return jsonb_build_object('estado', s.estado, 'puede_entrar', false, 'requiere_consentimiento', true);   -- sin consentimiento firmado no se entra (P-018)
    end if;
    select id, version, contenido_hash into v_pl from piefirme.plantillas_documento
     where organizacion_id = s.organizacion_id and tipo = 'consentimiento_telemedicina' and estado = 'activa' limit 1;
    insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, nombre_tecleado, documento_tipo, documento_version, documento_hash, ip, dispositivo, canal)
    values (s.organizacion_id, 'paciente', s.paciente_id, left(btrim(p_nombre_firma), 200), left(btrim(p_nombre_firma), 200), 'consentimiento', v_pl.version::text, v_pl.contenido_hash,
            piefirme_app.ip_cliente(), piefirme_app.agente_cliente(), 'sala_videoconsulta') returning id into v_firma;
    insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, plantilla_id, plantilla_version, aceptado, firma_id, canal, estado, ip, dispositivo, cita_id)
    values (s.organizacion_id, s.paciente_id, 'telemedicina', v_pl.id, v_pl.version, true, v_firma, 'sala_videoconsulta', 'firmado', piefirme_app.ip_cliente(), piefirme_app.agente_cliente(), s.cita_id)
    returning id into v_cons;
    update piefirme.salas_videoconsulta set consentimiento_id = v_cons where id = s.id;
  end if;
  update piefirme.salas_videoconsulta set estado = 'en_sala_espera', paciente_conectado_en = coalesce(paciente_conectado_en, now())
   where id = s.id and estado = 'programada';
  insert into piefirme.sala_eventos (organizacion_id, sala_id, tipo) values (s.organizacion_id, s.id, 'conexion_paciente');
  return jsonb_build_object('estado', 'en_sala_espera', 'puede_entrar', true, 'identificador', s.identificador);
end $$;

-- ═════════════════════ alertas clínicas ═════════════════════
create table piefirme.alertas_clinicas_vistas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id),
  consulta_id      uuid references piefirme.consultas(id),
  tipo             text not null,
  detalle          text,
  usuario_id       uuid not null references piefirme.perfiles(id) default auth.uid(),
  visto_en         timestamptz not null default now()
);
create index on piefirme.alertas_clinicas_vistas (organizacion_id, paciente_id);
create trigger t_inmutable before update or delete on piefirme.alertas_clinicas_vistas for each row execute function piefirme_app.a_inmutable();

-- Alertas derivadas de datos capturados (P-012). Solo apoyo: nunca bloquean (P-032).
create view piefirme.prp_alertas_paciente with (security_invoker = true) as
select a.organizacion_id, a.paciente_id, 'alergia'::text as tipo, 'alta'::text as severidad,
       'Alergia: ' || a.sustancia || coalesce(' (' || a.reaccion || ')', '') as mensaje, 'apoyo, no diagnóstico'::text as nota
  from piefirme.alergias_paciente a where a.vigente
union all
select an.organizacion_id, an.paciente_id, 'diabetes', 'media', 'Paciente con diabetes' || coalesce(' ' || an.diabetes_tipo, ''), 'apoyo, no diagnóstico'
  from piefirme.antecedentes_paciente an where an.diabetes = 'si'
union all
select m.organizacion_id, m.paciente_id, 'anticoagulante', 'alta', 'Anticoagulante: ' || m.nombre_dosis, 'apoyo, no diagnóstico'
  from piefirme.medicamentos_paciente m where m.vigente and m.anticoagulante
union all
select r.organizacion_id, r.paciente_id, 'revision_vencida', 'media', 'Revisión de pie diabético vencida hace ' || r.dias_vencida || ' días', 'apoyo, no diagnóstico'
  from piefirme.prp_pie_diabetico_revisiones r where r.revision_vencida and r.alerta_si_vence
union all
select p.organizacion_id, p.paciente_id, 'plan_pendiente', 'media', 'Plan «' || p.nombre || '» con sesiones sin cita', 'apoyo, no diagnóstico'
  from piefirme.prp_planes_progreso p
 where p.estado = 'en_curso' and p.sesiones_realizadas < p.sesiones_total
   and not exists (select 1 from piefirme.sesiones_plan s where s.plan_id = p.plan_id and s.estado = 'agendada' and s.fecha_propuesta >= current_date)
union all
select pa.organizacion_id, pa.id, 'aviso_pendiente', 'media', 'Aviso de privacidad sin firmar', 'apoyo, no diagnóstico'
  from piefirme.pacientes pa
 where pa.estado <> 'fusionado' and not exists (select 1 from piefirme.consentimientos c where c.paciente_id = pa.id and c.tipo = 'aviso_privacidad' and c.estado = 'firmado')
union all
select pa.organizacion_id, pa.id, 'menor_sin_tutor', 'alta', 'Menor de 18 años sin tutor registrado', 'apoyo, no diagnóstico'
  from piefirme.pacientes pa
 where coalesce(piefirme_app.edad(pa.fecha_nacimiento) < 18, false) and not exists (select 1 from piefirme.tutores t where t.paciente_id = pa.id and t.vigente);

-- ═════════════════════ RLS ═════════════════════
select piefirme_app.a_politicas('dictados', array['administrador', 'podologo'], array['podologo']);
select piefirme_app.a_politicas('dictado_propuestas', array['administrador', 'podologo'], array['podologo'], array['podologo']);
select piefirme_app.a_politicas('salas_videoconsulta', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo'], array[]::text[], true);
select piefirme_app.a_politicas('sala_eventos', array['administrador', 'podologo'], array['administrador', 'podologo']);
alter table piefirme.alertas_clinicas_vistas enable row level security;
create policy alertas_clinicas_vistas_sel on piefirme.alertas_clinicas_vistas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'podologo'));
create policy alertas_clinicas_vistas_ins on piefirme.alertas_clinicas_vistas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text = 'podologo' and usuario_id = auth.uid());

select piefirme_app.a_triggers('dictados');
select piefirme_app.a_triggers('dictado_propuestas', false);
select piefirme_app.a_triggers('salas_videoconsulta');
select piefirme_app.a_triggers('alertas_clinicas_vistas', false);

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
-- Las funciones app.* de B que usa el portal conservan su propio régimen (se reaplican aquí para no dejarlas sin permiso a authenticated).
revoke all on function piefirme.purgar_audios_dictado() from public, anon;
grant execute on function piefirme.purgar_audios_dictado() to authenticated;
revoke all on function piefirme.crear_sala_videoconsulta(uuid, uuid) from public, anon;
grant execute on function piefirme.crear_sala_videoconsulta(uuid, uuid) to authenticated;
revoke all on function piefirme.portal_sala_estado(text), piefirme.portal_sala_entrar(text, text, boolean) from public;
grant execute on function piefirme.portal_sala_estado(text), piefirme.portal_sala_entrar(text, text, boolean) to anon, authenticated;
revoke all on all tables in schema piefirme from anon;
