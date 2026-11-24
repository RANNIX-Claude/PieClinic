-- 055 · EQUIPO Y PLATAFORMA (D) · CRM: consentimientos de contacto, seguimiento, campañas de recontacto, encuestas y NPS.
-- Depende de: 001 y por contrato: pacientes(id), citas(id) [A, B]. plantilla_id y oferta_id son uuid sin FK en esta migración
--   (plantillas_documento nace en 057; la oferta comercial es del dominio B); 057 agrega la FK de la plantilla.
-- Reglas: P-148 (consentimientos SEPARADOS: recordatorios vs promociones/encuestas, con baja en cada mensaje), P-053 (campañas: solo Administración
--   crea y aprueba texto y descuento; solo se envía a quien tiene consentimiento comercial vigente), P-054 (encuesta 24 h después de una cita
--   atendida, máx. 1 por paciente cada 90 días, NPS 0-10, calificación <= 6 avisa a Administración SIN crear queja), P-052 (inactivo = 180 días),
--   MATRIZ_ROLES (CRM: Rec V C, Adm V C E aprueba, Pod V; Encuestas: Rec V, Adm V).
-- Entidades: E64 Campaña, E65 Destinatario, E66 Encuesta/NPS (+ seguimiento y consentimiento de contacto).

-- ───────────────────────────── consentimientos de contacto (historial inmutable) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.consentimientos_contacto (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  tipo             text not null check (tipo in ('recordatorios', 'comerciales', 'encuestas')),
  canal            text not null default 'todos' check (canal in ('todos', 'whatsapp', 'correo', 'sms')),
  otorgado         boolean not null,                      -- false = baja / revocación
  fuente           text not null default 'registro' check (fuente in ('registro', 'portal', 'liga_mensaje', 'solicitud_arco', 'importacion', 'manual')),
  version_texto    text,                                  -- versión del aviso aceptado
  registrado_por   uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index on piefirme.consentimientos_contacto (organizacion_id, paciente_id, tipo, created_at desc);

-- ¿el paciente acepta este tipo/canal? = último registro vigente (la baja posterior gana)
create or replace function piefirme_app.paciente_acepta(p_paciente uuid, p_tipo text, p_canal text default 'todos') returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select c.otorgado from piefirme.consentimientos_contacto c
                    where c.paciente_id = p_paciente and c.tipo = p_tipo and c.canal in (p_canal, 'todos')
                    order by c.created_at desc, c.id limit 1), false)
$$;

-- ───────────────────────────── seguimiento de pacientes (CRM) ─────────────────────────────
create table piefirme.seguimientos_paciente (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  motivo           text not null check (motivo in ('inactivo', 'revision_vencida', 'cumpleanos', 'post_consulta', 'plan_abandonado', 'queja', 'otro')),
  detalle          text,
  canal            text check (canal in ('whatsapp', 'correo', 'telefono', 'presencial', 'sms')),
  responsable_id   uuid references piefirme.perfiles(id) on delete set null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'contactado', 'agendado', 'sin_respuesta', 'descartado')),
  fecha_compromiso date,
  contactado_en    timestamptz,
  resultado        text,
  cita_id          uuid references piefirme.citas(id) on delete set null,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.seguimientos_paciente (organizacion_id, sede_id, estado);
create index on piefirme.seguimientos_paciente (paciente_id);
create trigger t_upd before update on piefirme.seguimientos_paciente for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── campañas de recontacto (E64) y destinatarios (E65) ─────────────────────────────
create table piefirme.campanas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  nombre           text not null,
  segmento         jsonb not null default '{}'::jsonb,        -- criterios, p. ej. {"inactivos_dias":180,"con_consentimiento":true}
  canal            text not null check (canal in ('whatsapp', 'correo', 'sms', 'whatsapp_correo')),
  plantilla_id     uuid,                                      -- FK a plantillas_documento en 057
  oferta_id        uuid,                                      -- oferta/promoción del dominio comercial (sin FK por contrato)
  mensaje          text,                                      -- con variables {{nombre}}, {{liga_cita}}
  programada_para  timestamptz,
  estado           text not null default 'borrador' check (estado in ('borrador', 'programada', 'enviada', 'cancelada')),
  creada_por       uuid default auth.uid(),
  aprobada_por     uuid,
  aprobada_en      timestamptz,
  enviados         integer not null default 0,
  respondieron     integer not null default 0,
  citas_generadas  integer not null default 0,
  ingreso_atribuido numeric(14,2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.campanas (organizacion_id, estado);

-- Recepción solo deja borradores; programar/aprobar es de Administración (P-053)
create or replace function piefirme_app.campana_reglas() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' and not piefirme_app.es_admin() then raise exception 'Solo Administración programa una campaña'; end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if old.estado in ('enviada', 'cancelada') then raise exception 'Campaña % sin más cambios', old.estado; end if;
    if new.estado = 'programada' then
      if not piefirme_app.es_admin() then raise exception 'Solo Administración aprueba texto y descuento (P-053)'; end if;
      if coalesce(trim(new.mensaje), '') = '' and new.plantilla_id is null then raise exception 'La campaña necesita mensaje o plantilla'; end if;
      if new.programada_para is null then raise exception 'Indique la fecha y hora de envío'; end if;
      if not exists (select 1 from piefirme.campana_destinatarios d where d.campana_id = new.id and not d.excluido_sin_consentimiento) then
        raise exception 'La campaña no tiene destinatarios con consentimiento';
      end if;
      new.aprobada_por := auth.uid(); new.aprobada_en := now();
    elsif new.estado = 'enviada' and auth.uid() is not null and not piefirme_app.es_admin() then
      raise exception 'El envío lo marca el sistema';
    end if;
  elsif old.estado <> 'borrador' and (new.mensaje is distinct from old.mensaje or new.oferta_id is distinct from old.oferta_id)
        and old.estado in ('programada') and not piefirme_app.es_admin() then
    raise exception 'Texto y oferta de una campaña programada solo los cambia Administración';
  end if;
  return new;
end $$;
create trigger t_reglas before insert or update on piefirme.campanas for each row execute function piefirme_app.campana_reglas();
create trigger t_upd before update on piefirme.campanas for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.campanas for each row execute function piefirme_app.auditar();

create table piefirme.campana_destinatarios (
  id                          uuid primary key default gen_random_uuid(),
  organizacion_id             uuid not null references piefirme.organizaciones(id) on delete cascade,
  campana_id                  uuid not null references piefirme.campanas(id) on delete cascade,
  paciente_id                 uuid not null references piefirme.pacientes(id) on delete cascade,
  excluido_sin_consentimiento boolean not null default false,
  estado                      text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'fallido', 'respondio', 'agendo')),
  enviado_en                  timestamptz,
  respondio_en                timestamptz,
  cita_id                     uuid references piefirme.citas(id) on delete set null,
  ingreso_atribuido           numeric(14,2) not null default 0,
  created_at                  timestamptz not null default now(),
  unique (campana_id, paciente_id)
);
create index on piefirme.campana_destinatarios (organizacion_id, campana_id);

-- exclusión automática por falta de consentimiento comercial vigente (P-053, P-148)
create or replace function piefirme_app.destinatario_consentimiento() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_canal text;
begin
  if not exists (select 1 from piefirme.campanas c where c.id = new.campana_id and c.organizacion_id = new.organizacion_id and c.estado = 'borrador') then
    raise exception 'Solo se agregan destinatarios a una campaña en borrador de esta clínica';
  end if;
  select case c.canal when 'whatsapp_correo' then 'todos' else c.canal end into v_canal from piefirme.campanas c where c.id = new.campana_id;
  new.excluido_sin_consentimiento := not piefirme_app.paciente_acepta(new.paciente_id, 'comerciales', v_canal);
  return new;
end $$;
create trigger t_consent before insert on piefirme.campana_destinatarios for each row execute function piefirme_app.destinatario_consentimiento();

-- contadores de resultados de la campaña
create or replace function piefirme_app.campana_resultados() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := coalesce(new.campana_id, old.campana_id);
begin
  update piefirme.campanas c set
    enviados = (select count(*) from piefirme.campana_destinatarios d where d.campana_id = v_id and d.estado in ('enviado', 'respondio', 'agendo')),
    respondieron = (select count(*) from piefirme.campana_destinatarios d where d.campana_id = v_id and d.estado in ('respondio', 'agendo')),
    citas_generadas = (select count(*) from piefirme.campana_destinatarios d where d.campana_id = v_id and d.cita_id is not null),
    ingreso_atribuido = (select coalesce(sum(d.ingreso_atribuido), 0) from piefirme.campana_destinatarios d where d.campana_id = v_id)
   where c.id = v_id;
  return null;
end $$;
create trigger t_result after insert or update or delete on piefirme.campana_destinatarios for each row execute function piefirme_app.campana_resultados();

-- agrega pacientes a una campaña en borrador; devuelve cuántos quedaron incluidos y cuántos excluidos por falta de consentimiento
create or replace function piefirme.campana_agregar_destinatarios(p_campana uuid, p_pacientes uuid[])
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p uuid; v_inc int := 0; v_exc int := 0; v_ex boolean;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') or not piefirme_app.org_activa() then raise exception 'Sin permiso'; end if;
  foreach p in array coalesce(p_pacientes, '{}') loop
    insert into piefirme.campana_destinatarios (organizacion_id, campana_id, paciente_id) values (piefirme_app.org_id(), p_campana, p)
    on conflict (campana_id, paciente_id) do nothing;
    select excluido_sin_consentimiento into v_ex from piefirme.campana_destinatarios where campana_id = p_campana and paciente_id = p;
    if v_ex then v_exc := v_exc + 1; else v_inc := v_inc + 1; end if;
  end loop;
  return jsonb_build_object('incluidos', v_inc, 'excluidos_sin_consentimiento', v_exc);
end $$;

-- ───────────────────────────── encuestas y NPS (E66) ─────────────────────────────
create table piefirme.encuestas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),
  tipo             text not null check (tipo in ('nps_post_visita', 'satisfaccion_queja')),
  paciente_id      uuid not null references piefirme.pacientes(id) on delete cascade,
  cita_id          uuid references piefirme.citas(id) on delete set null,
  consulta_id      uuid,                                 -- consulta de origen (dominio clínico; sin FK por contrato)
  queja_id         uuid,                                 -- queja de origen (satisfacción tras resolución)
  token_hash       text unique,                          -- sha256 de la liga individual enviada al paciente
  programada_para  timestamptz not null default (now() + interval '24 hours'),
  enviada_en       timestamptz,
  vence_en         timestamptz not null default (now() + interval '14 days'),
  respondida_en    timestamptz,
  calificacion     smallint,
  comentario       text,
  requiere_atencion boolean not null default false,      -- NPS <= umbral: avisa a Administración, no crea queja (P-054)
  atendida_por     uuid,
  atendida_en      timestamptz,
  created_at       timestamptz not null default now(),
  check ((tipo = 'nps_post_visita' and (calificacion is null or calificacion between 0 and 10))
      or (tipo = 'satisfaccion_queja' and (calificacion is null or calificacion between 1 and 5)))
);
create index on piefirme.encuestas (organizacion_id, sede_id, respondida_en);
create index on piefirme.encuestas (paciente_id, created_at desc);
create index on piefirme.encuestas (organizacion_id, requiere_atencion) where requiere_atencion and atendida_en is null;

-- 1 encuesta NPS por paciente cada 90 días y solo con consentimiento de encuestas; marca de atención al responder
create or replace function piefirme_app.encuesta_reglas() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dias int; v_max int;
begin
  select coalesce((parametros #>> '{encuesta,intervalo_dias}')::int, 90), coalesce((parametros #>> '{encuesta,nps_alerta_max}')::int, 6)
    into v_dias, v_max from piefirme.organizaciones where id = new.organizacion_id;
  if tg_op = 'INSERT' then
    if new.tipo = 'nps_post_visita' then
      if exists (select 1 from piefirme.encuestas e where e.paciente_id = new.paciente_id and e.tipo = 'nps_post_visita'
                    and e.created_at > now() - make_interval(days => v_dias)) then
        raise exception 'El paciente ya recibió una encuesta NPS en los últimos % días (P-054)', v_dias;
      end if;
      if not piefirme_app.paciente_acepta(new.paciente_id, 'encuestas', 'todos') then
        raise exception 'El paciente no tiene consentimiento vigente para encuestas';
      end if;
    end if;
    return new;
  end if;
  if new.calificacion is not null and old.calificacion is null then
    new.respondida_en := coalesce(new.respondida_en, now());
    new.requiere_atencion := (new.tipo = 'nps_post_visita' and new.calificacion <= v_max);
  end if;
  return new;
end $$;
create trigger t_reglas before insert or update on piefirme.encuestas for each row execute function piefirme_app.encuesta_reglas();

-- crea la encuesta y devuelve la liga (token en claro UNA sola vez; en la BD solo queda su hash)
create or replace function piefirme.encuesta_crear(p_tipo text, p_paciente uuid, p_cita uuid default null, p_queja uuid default null, p_consulta uuid default null, p_sede uuid default null)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); v_id uuid;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') or not piefirme_app.org_activa() then raise exception 'Sin permiso'; end if;
  insert into piefirme.encuestas (organizacion_id, sede_id, tipo, paciente_id, cita_id, queja_id, consulta_id, token_hash)
  values (piefirme_app.org_id(), p_sede, p_tipo, p_paciente, p_cita, p_queja, p_consulta, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_tok);
end $$;

-- portal público (única vía anónima): responde la encuesta con su liga de un solo uso; devuelve solo lo mínimo
create or replace function piefirme.portal_responder_encuesta(p_token text, p_calificacion integer, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare e piefirme.encuestas;
begin
  if p_token is null or length(p_token) < 40 then return jsonb_build_object('ok', false); end if;
  select * into e from piefirme.encuestas where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found or e.respondida_en is not null or e.vence_en < now() then return jsonb_build_object('ok', false); end if;
  if (e.tipo = 'nps_post_visita' and p_calificacion not between 0 and 10) or (e.tipo = 'satisfaccion_queja' and p_calificacion not between 1 and 5) then
    return jsonb_build_object('ok', false);
  end if;
  update piefirme.encuestas set calificacion = p_calificacion, comentario = left(p_comentario, 1000) where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.consentimientos_contacto enable row level security;
alter table piefirme.seguimientos_paciente    enable row level security;
alter table piefirme.campanas                 enable row level security;
alter table piefirme.campana_destinatarios    enable row level security;
alter table piefirme.encuestas                enable row level security;

-- consentimientos: historial inmutable (sin update/delete); lo capturan Recepción y Administración
create policy cons_sel on piefirme.consentimientos_contacto for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion', 'podologo'));
create policy cons_ins on piefirme.consentimientos_contacto for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));

create policy seg_sel on piefirme.seguimientos_paciente for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and ((piefirme_app.rol() in ('administrador', 'recepcion') and (sede_id is null or piefirme_app.puede_sede(sede_id))) or responsable_id = auth.uid() or creado_por = auth.uid()));
create policy seg_ins on piefirme.seguimientos_paciente for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion') and (sede_id is null or piefirme_app.puede_sede(sede_id)));
create policy seg_upd on piefirme.seguimientos_paciente for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion') and (sede_id is null or piefirme_app.puede_sede(sede_id)))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy seg_del on piefirme.seguimientos_paciente for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy cam_sel on piefirme.campanas for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy cam_ins on piefirme.campanas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy cam_upd on piefirme.campanas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion')) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy cam_del on piefirme.campanas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and estado in ('borrador', 'cancelada'));

create policy cdes_sel on piefirme.campana_destinatarios for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy cdes_ins on piefirme.campana_destinatarios for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy cdes_upd on piefirme.campana_destinatarios for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy cdes_del on piefirme.campana_destinatarios for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion') and piefirme_app.org_activa());

create policy enc_sel on piefirme.encuestas for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'recepcion') and (sede_id is null or piefirme_app.puede_sede(sede_id)));
create policy enc_ins on piefirme.encuestas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol() in ('administrador', 'recepcion'));
create policy enc_upd on piefirme.encuestas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
-- sin delete: las encuestas no se borran

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_consentimientos_contacto_vigentes with (security_invoker = true) as
select distinct on (c.paciente_id, c.tipo, c.canal)
       c.organizacion_id, c.paciente_id, c.tipo, c.canal, c.otorgado, c.fuente, c.version_texto, c.created_at as desde
  from piefirme.consentimientos_contacto c
 order by c.paciente_id, c.tipo, c.canal, c.created_at desc;

create or replace view piefirme.prp_seguimientos with (security_invoker = true) as
select s.id, s.organizacion_id, s.sede_id, s.paciente_id, s.motivo, s.detalle, s.canal, s.responsable_id, s.estado,
       s.fecha_compromiso, (s.estado = 'pendiente' and s.fecha_compromiso is not null and s.fecha_compromiso < current_date) as vencido,
       s.contactado_en, s.resultado, s.cita_id, s.created_at
  from piefirme.seguimientos_paciente s;

create or replace view piefirme.prp_campanas with (security_invoker = true) as
select c.id, c.organizacion_id, c.nombre, c.segmento, c.canal, c.plantilla_id, c.oferta_id, c.mensaje, c.programada_para, c.estado,
       c.aprobada_por, c.aprobada_en, c.enviados, c.respondieron, c.citas_generadas, c.ingreso_atribuido,
       (select count(*) from piefirme.campana_destinatarios d where d.campana_id = c.id) as destinatarios,
       (select count(*) from piefirme.campana_destinatarios d where d.campana_id = c.id and d.excluido_sin_consentimiento) as excluidos_sin_consentimiento
  from piefirme.campanas c;

create or replace view piefirme.prp_campana_destinatarios with (security_invoker = true) as
select d.id, d.organizacion_id, d.campana_id, d.paciente_id, d.excluido_sin_consentimiento, d.estado, d.enviado_en, d.respondio_en, d.cita_id, d.ingreso_atribuido
  from piefirme.campana_destinatarios d;

create or replace view piefirme.prp_encuestas with (security_invoker = true) as
select e.id, e.organizacion_id, e.sede_id, e.tipo, e.paciente_id, e.cita_id, e.consulta_id, e.queja_id, e.programada_para, e.enviada_en,
       e.vence_en, e.respondida_en, e.calificacion, e.comentario, e.requiere_atencion, e.atendida_por, e.atendida_en,
       (e.respondida_en is null and e.vence_en < now()) as vencida
  from piefirme.encuestas e;

-- NPS = % promotores (9-10) − % detractores (0-6) sobre encuestas respondidas
create or replace view piefirme.prp_nps_mensual with (security_invoker = true) as
select e.organizacion_id, e.sede_id, date_trunc('month', e.respondida_en)::date as mes,
       count(*) as respuestas,
       count(*) filter (where e.calificacion >= 9) as promotores,
       count(*) filter (where e.calificacion between 7 and 8) as pasivos,
       count(*) filter (where e.calificacion <= 6) as detractores,
       round(100.0 * (count(*) filter (where e.calificacion >= 9) - count(*) filter (where e.calificacion <= 6)) / nullif(count(*), 0), 1) as nps
  from piefirme.encuestas e
 where e.tipo = 'nps_post_visita' and e.respondida_en is not null
 group by 1, 2, 3;

create or replace view piefirme.prp_satisfaccion_quejas with (security_invoker = true) as
select e.organizacion_id, e.sede_id, date_trunc('month', e.respondida_en)::date as mes, count(*) as respuestas, round(avg(e.calificacion), 2) as promedio
  from piefirme.encuestas e
 where e.tipo = 'satisfaccion_queja' and e.respondida_en is not null
 group by 1, 2, 3;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.campana_agregar_destinatarios(uuid, uuid[]) from public, anon;
revoke all on function piefirme.encuesta_crear(text, uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function piefirme.portal_responder_encuesta(text, integer, text) from public;
grant execute on function piefirme.campana_agregar_destinatarios(uuid, uuid[]) to authenticated;
grant execute on function piefirme.encuesta_crear(text, uuid, uuid, uuid, uuid, uuid) to authenticated;
-- única función pública (portal): security definer, token de un solo uso, devuelve solo {ok}
grant execute on function piefirme.portal_responder_encuesta(text, integer, text) to anon, authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.campana_reglas(), piefirme_app.destinatario_consentimiento(), piefirme_app.campana_resultados(), piefirme_app.encuesta_reglas() from authenticated;
