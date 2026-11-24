-- 023 · Agenda: PIN y autorizaciones de Administrador, citas (estados, cabinas, sobrecupo, concurrencia), historial de estados,
-- lista de espera y reservas del portal (retención de horario). Las RPC del portal viven en 024.
-- Reglas: P-033, P-036..P-038, P-041..P-045, P-048, P-051, P-055 (PIN), P-071, P-098. Estados: MODELO_ESTADOS S01, S02, S04.
-- Dependencias: 001, 010 (pacientes), 020 (servicios, folios, parámetros), 021 (planes adquiridos), 022 (bloqueos).

-- ═════════════════ PIN de Administrador y autorizaciones (descuento > 10 %, sobrecupo, diferencia de corte) ═════════════════
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.pins_administrador (
  perfil_id         uuid primary key references piefirme.perfiles(id) on delete cascade,
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  pin_hash          text not null,
  updated_at        timestamptz not null default now()
);
alter table piefirme.pins_administrador enable row level security;   -- sin políticas: solo funciones security definer

create table piefirme.pin_intentos (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  solicitante_id   uuid not null,
  exito            boolean not null,
  created_at       timestamptz not null default now()
);
create index on piefirme.pin_intentos (solicitante_id, created_at desc);
alter table piefirme.pin_intentos enable row level security;          -- sin políticas

create table piefirme.autorizaciones_admin (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  tipo             text not null check (tipo in ('descuento', 'sobrecupo', 'diferencia_corte', 'cancelacion', 'otro')),
  solicitante_id   uuid not null references piefirme.perfiles(id),
  autorizador_id   uuid not null references piefirme.perfiles(id),
  pct_max          numeric(5,2),
  motivo           text not null check (length(btrim(motivo)) > 0),    -- todo descuento exige motivo (P-055)
  detalle          jsonb not null default '{}'::jsonb,
  vigente_hasta    timestamptz not null default now() + interval '10 minutes',
  created_at       timestamptz not null default now()
);
create index on piefirme.autorizaciones_admin (organizacion_id, tipo, created_at desc);

create or replace function piefirme_app.hash_pin(p_perfil uuid, p_pin text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_perfil::text || ':' || p_pin, 'UTF8')), 'hex') $$;

-- El Administrador define su PIN (4 a 8 dígitos).
create or replace function piefirme.definir_pin_administrador(p_pin text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'solo el administrador define su PIN' using errcode = 'PF403'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'el PIN debe tener de 4 a 8 dígitos' using errcode = 'PF400'; end if;
  insert into piefirme.pins_administrador (perfil_id, organizacion_id, pin_hash)
  values (auth.uid(), piefirme_app.org_id(), piefirme_app.hash_pin(auth.uid(), p_pin))
  on conflict (perfil_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (piefirme_app.org_id(), auth.uid(), 'actualizar', 'pins_administrador', auth.uid()::text, '{"cambio":"pin"}'::jsonb);
end $$;

-- Pide autorización: un Administrador se autoriza solo; los demás necesitan el PIN de un Administrador de su clínica.
-- 3 intentos fallidos en 15 min bloquean al solicitante (P-119). Devuelve el id de la autorización (vence en 10 min).
create or replace function piefirme.autorizar_con_pin(p_pin text, p_tipo text, p_motivo text, p_pct_max numeric default null, p_detalle jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_aut uuid; v_id uuid; v_fallos integer;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'el motivo es obligatorio' using errcode = 'PF400'; end if;
  if piefirme_app.es_admin() then
    v_aut := auth.uid();
  else
    select count(*) into v_fallos from piefirme.pin_intentos
     where solicitante_id = auth.uid() and not exito and created_at > now() - interval '15 minutes';
    if v_fallos >= 3 then raise exception 'bloqueado por intentos fallidos; espere 15 minutos' using errcode = 'PF429'; end if;
    select pa.perfil_id into v_aut from piefirme.pins_administrador pa
      join piefirme.perfiles pf on pf.id = pa.perfil_id and pf.activo and pf.rol = 'administrador'
     where pa.organizacion_id = v_org and p_pin is not null and pa.pin_hash = piefirme_app.hash_pin(pa.perfil_id, p_pin)
     limit 1;
    insert into piefirme.pin_intentos (organizacion_id, solicitante_id, exito) values (v_org, auth.uid(), v_aut is not null);
    if v_aut is null then raise exception 'PIN incorrecto' using errcode = 'PF403'; end if;
  end if;
  insert into piefirme.autorizaciones_admin (organizacion_id, tipo, solicitante_id, autorizador_id, pct_max, motivo, detalle)
  values (v_org, p_tipo, auth.uid(), v_aut, p_pct_max, p_motivo, coalesce(p_detalle, '{}'::jsonb))
  returning id into v_id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), 'insertar', 'autorizaciones_admin', v_id::text, jsonb_build_object('tipo', p_tipo, 'autorizador', v_aut, 'motivo', p_motivo));
  return v_id;
end $$;

-- ═════════════════ citas (E54) ═════════════════
create table piefirme.citas (
  id                         uuid primary key default gen_random_uuid(),
  organizacion_id            uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                    uuid not null references piefirme.sedes(id),
  folio                      text,                                  -- {SEDE}-CIT-{NNNNNN}
  paciente_id                uuid not null references piefirme.pacientes(id),
  servicio_id                uuid not null references piefirme.servicios(id),
  podologo_id                uuid not null references piefirme.perfiles(id),    -- asignado
  atendio_id                 uuid references piefirme.perfiles(id),             -- quien firma la nota (P-025)
  cabina_id                  uuid references piefirme.cabinas(id),
  inicio                     timestamptz not null,
  fin                        timestamptz not null,
  duracion_min               integer not null check (duracion_min > 0),
  tipo_atencion              text not null default 'presencial' check (tipo_atencion in ('presencial', 'domicilio', 'videoconsulta')),
  direccion_visita           text,
  zona_domicilio             text,
  viaticos                   numeric(14,2) check (viaticos is null or viaticos >= 0),
  traslado_antes_min         integer not null default 0 check (traslado_antes_min >= 0),     -- P-044: el traslado bloquea al podólogo
  traslado_despues_min       integer not null default 0 check (traslado_despues_min >= 0),
  ocupa_inicio               timestamptz,                                      -- rango ocupado = inicio − traslado … fin + traslado
  ocupa_fin                  timestamptz,
  sobrecupo                  boolean not null default false,
  sobrecupo_autorizacion_id  uuid references piefirme.autorizaciones_admin(id),
  seguimiento_garantia       boolean not null default false,                   -- cita de seguimiento / garantía sin costo
  primera_vez                boolean not null default false,
  notas                      text,
  motivo_consulta            text,
  precio_servicio            numeric(14,2) not null default 0 check (precio_servicio >= 0),   -- congelado al agendar (P-068)
  anticipo_requerido         numeric(14,2) not null default 0 check (anticipo_requerido >= 0),
  estado                     text not null default 'por_confirmar' check (estado in ('por_confirmar', 'confirmada', 'en_camino', 'no_asistio', 'cancelada', 'atendida')),
  origen                     text not null default 'presencial' check (origen in ('whatsapp', 'portal', 'llamada', 'presencial', 'referido')),
  sede_atribucion_id         uuid references piefirme.sedes(id),                 -- reserva por WhatsApp atribuida a sede (P-040)
  agendado_por               uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  plan_adquirido_id          uuid references piefirme.planes_adquiridos(id),     -- plan comercial que respalda la cita
  plan_tratamiento_id        uuid,                                             -- plan clínico (dominio A); referencia lógica
  sesion_plan_id             uuid,                                             -- sesión del plan clínico (dominio A)
  reserva_portal_id          uuid,                                             -- FK más abajo
  reprogramaciones           integer not null default 0 check (reprogramaciones >= 0),
  reprogramacion_excedida    boolean not null default false,                   -- < 48 h o más de 2 reprogramaciones
  motivo_cancelacion         text,
  cancelada_por              uuid references piefirme.perfiles(id) on delete set null,
  cancelada_en               timestamptz,
  cancelacion_fuera_de_plazo boolean,
  llegada_en                 timestamptz,
  inicio_atencion_en         timestamptz,
  fin_atencion_en            timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (fin > inicio),
  check (tipo_atencion <> 'domicilio' or direccion_visita is not null or estado in ('cancelada', 'no_asistio', 'atendida')),
  check (estado <> 'cancelada' or motivo_cancelacion is not null),
  check (cabina_id is null or tipo_atencion = 'presencial')
);
create index on piefirme.citas (organizacion_id, sede_id, inicio);
create index on piefirme.citas (organizacion_id, podologo_id, inicio) where estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida');
create index on piefirme.citas (organizacion_id, cabina_id, inicio) where cabina_id is not null and estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida');
create index on piefirme.citas (organizacion_id, paciente_id, inicio desc);
create index on piefirme.citas (organizacion_id, estado, inicio);

create table piefirme.cita_estados_historial (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  cita_id          uuid not null references piefirme.citas(id) on delete cascade,
  estado_anterior  text,
  estado_nuevo     text not null,
  usuario_id       uuid,
  motivo           text,
  created_at       timestamptz not null default now()
);
create index on piefirme.cita_estados_historial (organizacion_id, cita_id, created_at);

alter table piefirme.plan_sesiones_consumo add constraint plan_consumo_cita_fk foreign key (cita_id) references piefirme.citas(id) on delete cascade;

-- ─────────── precio de un servicio (definer: lo usan el portal y los triggers) ───────────
create or replace function piefirme_app.precio_servicio(p_org uuid, p_servicio uuid, p_sede uuid, p_fecha date default null) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select pr.precio from piefirme.precios pr
   where pr.organizacion_id = p_org and pr.item_tipo = 'servicio' and pr.servicio_id = p_servicio
     and (pr.sede_id = p_sede or pr.sede_id is null)
     and pr.vigente_desde <= coalesce(p_fecha, piefirme_app.hoy_org(p_org))
     and (pr.vigente_hasta is null or pr.vigente_hasta >= coalesce(p_fecha, piefirme_app.hoy_org(p_org)))
   order by (pr.sede_id is not null) desc, pr.vigente_desde desc
   limit 1
$$;

-- ─────────── ¿hay conflicto de agenda? (podólogo, cabina, retenciones del portal, bloqueos) ───────────
create or replace function piefirme_app.conflicto_agenda(
  p_org uuid, p_sede uuid, p_podologo uuid, p_cabina uuid, p_inicio timestamptz, p_fin timestamptz,
  p_traslado_antes integer default 0, p_traslado_despues integer default 0,
  p_excluir_cita uuid default null, p_excluir_reserva uuid default null)
returns text language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_margen interval := make_interval(mins => piefirme_app.param_num(p_org, 'margen_citas_min', 10)::int);
  v_ini timestamptz := p_inicio - make_interval(mins => coalesce(p_traslado_antes, 0));
  v_fin timestamptz := p_fin + make_interval(mins => coalesce(p_traslado_despues, 0));
begin
  if exists (select 1 from piefirme.bloqueos_agenda b
              where b.organizacion_id = p_org and b.sede_id = p_sede and b.estado = 'autorizado'
                and (b.ambito = 'sede' or (b.ambito = 'podologo' and b.podologo_id = p_podologo) or (b.ambito = 'cabina' and b.cabina_id = p_cabina))
                and b.inicio < v_fin and b.fin > v_ini) then
    return 'horario_bloqueado';
  end if;
  if exists (select 1 from piefirme.citas c
              where c.organizacion_id = p_org and c.podologo_id = p_podologo and c.id is distinct from p_excluir_cita
                and c.estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida')
                and c.ocupa_inicio < v_fin + v_margen and c.ocupa_fin + v_margen > v_ini) then
    return 'podologo_ocupado';
  end if;
  if p_cabina is not null and exists (select 1 from piefirme.citas c
              where c.organizacion_id = p_org and c.cabina_id = p_cabina and c.id is distinct from p_excluir_cita
                and c.estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida')
                and c.ocupa_inicio < v_fin + v_margen and c.ocupa_fin + v_margen > v_ini) then
    return 'cabina_ocupada';
  end if;
  if exists (select 1 from piefirme.reservas_portal r
              where r.organizacion_id = p_org and r.estado = 'retenido' and r.retenido_hasta > now()
                and r.id is distinct from p_excluir_reserva
                and (r.podologo_id = p_podologo or (p_cabina is not null and r.cabina_id = p_cabina))
                and r.inicio < v_fin + v_margen and r.fin + v_margen > v_ini) then
    return 'horario_retenido';
  end if;
  return null;
end $$;

-- ─────────── trigger principal de citas ───────────
create or replace function piefirme_app.cita_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_sv piefirme.servicios%rowtype; v_conf text; v_admin boolean := (auth.uid() is null or piefirme_app.es_admin());
  v_ok boolean; v_max int; v_dia date; v_n int; v_aut piefirme.autorizaciones_admin%rowtype;
  v_horas numeric; v_tz text;
begin
  v_tz := piefirme_app.zona_org(new.organizacion_id);
  -- coherencia de clínica
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id)
     or not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id)
     or not exists (select 1 from piefirme.perfiles f where f.id = new.podologo_id and f.organizacion_id = new.organizacion_id) then
    raise exception 'la cita mezcla datos de otra clínica' using errcode = 'PF403';
  end if;

  if tg_op = 'INSERT' then
    select * into v_sv from piefirme.servicios where id = new.servicio_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'servicio inexistente' using errcode = 'PF404'; end if;
    if v_sv.estado <> 'activo' and not v_admin then raise exception 'el servicio está pausado' using errcode = 'PF409'; end if;
    if new.folio is null then new.folio := piefirme_app.siguiente_folio_comercial(new.sede_id, 'CIT'); end if;
    if new.duracion_min is null then new.duracion_min := v_sv.duracion_min; end if;
    if new.fin is null then new.fin := new.inicio + make_interval(mins => new.duracion_min); end if;
    if new.precio_servicio = 0 and not new.seguimiento_garantia and not v_sv.es_curacion_incluida and v_sv.tipo_precio <> 'gratis' then
      new.precio_servicio := coalesce(piefirme_app.precio_servicio(new.organizacion_id, new.servicio_id, new.sede_id, (new.inicio at time zone v_tz)::date), 0);
    end if;
    if new.tipo_atencion = 'videoconsulta' and not v_sv.admite_videoconsulta then raise exception 'el servicio no admite videoconsulta' using errcode = 'PF409'; end if;
    if new.tipo_atencion = 'domicilio' and not v_sv.admite_domicilio then raise exception 'el servicio no admite visita a domicilio' using errcode = 'PF409'; end if;
    if auth.uid() is not null and new.estado not in ('por_confirmar', 'confirmada') then
      raise exception 'una cita nueva nace por confirmar o confirmada' using errcode = 'PF409';
    end if;
  else
    if old.estado in ('atendida', 'cancelada') and not v_admin then
      raise exception 'una cita % solo la corrige el administrador (P-051)', old.estado using errcode = 'PF403';
    end if;
  end if;

  -- rango ocupado (traslado de domicilio incluido, P-044)
  new.ocupa_inicio := new.inicio - make_interval(mins => new.traslado_antes_min);
  new.ocupa_fin    := new.fin + make_interval(mins => new.traslado_despues_min);

  -- transiciones de estado (S01)
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    v_ok := (old.estado = 'por_confirmar' and new.estado in ('confirmada', 'no_asistio', 'cancelada'))
         or (old.estado = 'confirmada'    and new.estado in ('en_camino', 'no_asistio', 'cancelada', 'atendida'))
         or (old.estado = 'en_camino'     and new.estado in ('no_asistio', 'atendida'))
         or (old.estado = 'no_asistio'    and new.estado = 'por_confirmar');
    if not v_ok and not v_admin then
      raise exception 'transición de cita no permitida: % → % (revertir es del administrador)', old.estado, new.estado using errcode = 'PF409';
    end if;
    if new.estado = 'en_camino' and new.tipo_atencion <> 'domicilio' then
      raise exception '«en camino» solo aplica a visitas a domicilio' using errcode = 'PF409';
    end if;
    if new.estado = 'no_asistio' and not v_admin
       and now() < old.inicio + make_interval(mins => piefirme_app.param_num(new.organizacion_id, 'tolerancia_no_asistio_min', 15)::int) then
      raise exception 'aún dentro de la tolerancia para marcar «No asistió»' using errcode = 'PF409';
    end if;
    if new.estado = 'cancelada' then
      if coalesce(btrim(new.motivo_cancelacion), '') = '' then raise exception 'la cancelación exige motivo (P-051)' using errcode = 'PF400'; end if;
      new.cancelada_en := now();
      new.cancelada_por := coalesce(new.cancelada_por, auth.uid());
      v_horas := piefirme_app.param_num(new.organizacion_id, 'cancelacion_horas_aviso', 48);
      new.cancelacion_fuera_de_plazo := (old.inicio - now()) < make_interval(hours => v_horas::int);   -- P-033: el mismo día = fuera de plazo
    elsif old.estado = 'cancelada' then
      new.motivo_cancelacion := null; new.cancelada_en := null; new.cancelada_por := null; new.cancelacion_fuera_de_plazo := null;
    end if;
    if new.estado = 'atendida' then
      new.fin_atencion_en := coalesce(new.fin_atencion_en, now());
      if new.atendio_id is null and piefirme_app.rol() = 'podologo' then new.atendio_id := auth.uid(); end if;
    end if;
    if new.estado = 'confirmada' and old.estado = 'por_confirmar' then null; end if;
  end if;

  -- reprogramación (P-038): cuenta cada cambio de horario o de podólogo en una cita activa
  if tg_op = 'UPDATE' and new.estado in ('por_confirmar', 'confirmada', 'en_camino')
     and (new.inicio is distinct from old.inicio or new.podologo_id is distinct from old.podologo_id) then
    new.reprogramaciones := old.reprogramaciones + 1;
    new.reprogramacion_excedida := new.reprogramacion_excedida
        or new.reprogramaciones > piefirme_app.param_num(new.organizacion_id, 'reprogramaciones_max', 2)
        or (old.inicio - now()) < make_interval(hours => piefirme_app.param_num(new.organizacion_id, 'cancelacion_horas_aviso', 48)::int);
  end if;

  -- conflicto de agenda (solo si la cita ocupa lugar y cambió algo relevante)
  if new.estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida')
     and (tg_op = 'INSERT' or old.estado in ('cancelada', 'no_asistio')
          or new.inicio is distinct from old.inicio or new.fin is distinct from old.fin
          or new.podologo_id is distinct from old.podologo_id or new.cabina_id is distinct from old.cabina_id
          or new.traslado_antes_min is distinct from old.traslado_antes_min or new.traslado_despues_min is distinct from old.traslado_despues_min) then
    v_conf := piefirme_app.conflicto_agenda(new.organizacion_id, new.sede_id, new.podologo_id, new.cabina_id, new.inicio, new.fin,
                                   new.traslado_antes_min, new.traslado_despues_min, new.id, new.reserva_portal_id);
    if v_conf = 'horario_bloqueado' then
      raise exception 'horario_bloqueado: el podólogo, la cabina o la sede tienen un bloqueo autorizado' using errcode = 'PF409';
    elsif v_conf is not null then
      -- P-037/P-042: sin empalme salvo sobrecupo autorizado por un Administrador, máx. 1 por podólogo y día
      if not new.sobrecupo then
        raise exception 'conflicto_agenda: %', v_conf using errcode = 'PF409';
      end if;
      if new.sobrecupo_autorizacion_id is null and piefirme_app.es_admin() then
        insert into piefirme.autorizaciones_admin (organizacion_id, tipo, solicitante_id, autorizador_id, motivo, detalle)
        values (new.organizacion_id, 'sobrecupo', auth.uid(), auth.uid(), 'Sobrecupo autorizado por administrador', jsonb_build_object('cita', new.id))
        returning id into new.sobrecupo_autorizacion_id;
      end if;
      if new.sobrecupo_autorizacion_id is null and auth.uid() is not null then
        raise exception 'sobrecupo_requiere_autorizacion del administrador' using errcode = 'PF403';
      end if;
      if new.sobrecupo_autorizacion_id is not null then
        select * into v_aut from piefirme.autorizaciones_admin where id = new.sobrecupo_autorizacion_id;
        if not found or v_aut.organizacion_id <> new.organizacion_id or v_aut.tipo <> 'sobrecupo' then
          raise exception 'autorización de sobrecupo inválida' using errcode = 'PF403';
        end if;
      end if;
      v_max := piefirme_app.param_num(new.organizacion_id, 'sobrecupo_max_por_dia', 1)::int;
      v_dia := (new.inicio at time zone v_tz)::date;
      select count(*) into v_n from piefirme.citas c
       where c.organizacion_id = new.organizacion_id and c.podologo_id = new.podologo_id and c.sobrecupo and c.id <> new.id
         and c.estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida') and (c.inicio at time zone v_tz)::date = v_dia;
      if v_n >= v_max then raise exception 'sobrecupo_agotado: máximo % por podólogo y día', v_max using errcode = 'PF409'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_cita_bi before insert or update on piefirme.citas for each row execute function piefirme_app.cita_bi();

-- Historial de estados + efectos de «Atendida» sobre el plan comercial (P-071)
create or replace function piefirme_app.cita_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pa piefirme.planes_adquiridos%rowtype;
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    insert into piefirme.cita_estados_historial (organizacion_id, cita_id, estado_anterior, estado_nuevo, usuario_id, motivo)
    values (new.organizacion_id, new.id, case when tg_op = 'UPDATE' then old.estado end, new.estado, auth.uid(), new.motivo_cancelacion);
  end if;
  if tg_op = 'UPDATE' and new.estado = 'atendida' and old.estado <> 'atendida' and new.plan_adquirido_id is not null then
    select * into v_pa from piefirme.planes_adquiridos where id = new.plan_adquirido_id;
    insert into piefirme.plan_sesiones_consumo (organizacion_id, plan_adquirido_id, cita_id, sede_id, podologo_id, valor)
    values (new.organizacion_id, new.plan_adquirido_id, new.id, new.sede_id, coalesce(new.atendio_id, new.podologo_id), v_pa.precio_sesion)
    on conflict (cita_id) do nothing;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'atendida' and new.estado <> 'atendida' and new.plan_adquirido_id is not null then
    -- el administrador revierte una cita atendida: la sesión vuelve al plan
    if exists (select 1 from piefirme.plan_sesiones_consumo where cita_id = new.id and not reversado) then
      update piefirme.plan_sesiones_consumo set reversado = true where cita_id = new.id;
      update piefirme.planes_adquiridos set sesiones_usadas = greatest(sesiones_usadas - 1, 0),
             estado = case when estado = 'consumido' then 'vigente' else estado end where id = new.plan_adquirido_id;
      delete from piefirme.plan_sesiones_consumo where cita_id = new.id;   -- libera la unicidad para una nueva atención
    end if;
  end if;
  return null;
end $$;
create trigger t_cita_ai after insert or update on piefirme.citas for each row execute function piefirme_app.cita_ai();

-- Citas afectadas por un bloqueo (P-047): para listarlas y reprogramarlas
create or replace function piefirme.citas_afectadas_por_bloqueo(p_bloqueo uuid)
returns table (cita_id uuid, folio text, paciente_id uuid, podologo_id uuid, inicio timestamptz, fin timestamptz, estado text)
language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select c.id, c.folio, c.paciente_id, c.podologo_id, c.inicio, c.fin, c.estado
    from piefirme.bloqueos_agenda b
    join piefirme.citas c on c.organizacion_id = b.organizacion_id and c.sede_id = b.sede_id
     and c.estado in ('por_confirmar', 'confirmada', 'en_camino')
     and c.ocupa_inicio < b.fin and c.ocupa_fin > b.inicio
     and (b.ambito = 'sede' or (b.ambito = 'podologo' and c.podologo_id = b.podologo_id) or (b.ambito = 'cabina' and c.cabina_id = b.cabina_id))
   where b.id = p_bloqueo
   order by c.inicio
$$;

-- ═════════════════ lista de espera (E61) ═════════════════
create table piefirme.lista_espera (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid not null references piefirme.sedes(id),
  paciente_id         uuid references piefirme.pacientes(id),
  nombre_solicitante  text not null,
  telefono            text,
  correo              text,
  servicio_id         uuid not null references piefirme.servicios(id),
  podologo_id         uuid references piefirme.perfiles(id),               -- null = cualquiera
  disponibilidad      text,                                              -- «Lun–Vie, tarde»
  prioridad           text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),   -- P-041
  origen              text not null default 'llamada' check (origen in ('llamada', 'portal', 'whatsapp', 'referido')),
  estado              text not null default 'esperando' check (estado in ('esperando', 'notificado', 'agendado', 'vencida')),
  ultimo_aviso_en     timestamptz,
  notificado_hasta    timestamptz,                                       -- ventana de 30 min por notificado
  vence_el            timestamptz,
  cita_id             uuid references piefirme.citas(id),
  created_by          uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (paciente_id is not null or telefono is not null or correo is not null),
  check (estado <> 'agendado' or cita_id is not null)
);
create index on piefirme.lista_espera (organizacion_id, sede_id, estado, prioridad);

create or replace function piefirme_app.lista_espera_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.vence_el := coalesce(new.vence_el, now() + make_interval(days => piefirme_app.param_num(new.organizacion_id, 'lista_espera_vence_dias', 14)::int));
  else
    if new.estado is distinct from old.estado and auth.uid() is not null then
      if not ((old.estado = 'esperando' and new.estado in ('notificado', 'agendado', 'vencida'))
           or (old.estado = 'notificado' and new.estado in ('agendado', 'vencida', 'esperando'))
           or (old.estado = 'vencida' and new.estado = 'esperando')) then
        raise exception 'transición de lista de espera no permitida: % → %', old.estado, new.estado using errcode = 'PF409';
      end if;
    end if;
    if new.estado = 'notificado' then
      new.ultimo_aviso_en := now();
      new.notificado_hasta := now() + make_interval(mins => piefirme_app.param_num(new.organizacion_id, 'lista_espera_ventana_min', 30)::int);
    end if;
    if new.estado = 'esperando' and old.estado = 'vencida' then   -- reactivar
      new.vence_el := now() + make_interval(days => piefirme_app.param_num(new.organizacion_id, 'lista_espera_vence_dias', 14)::int);
      new.notificado_hasta := null;
    end if;
  end if;
  return new;
end $$;
create trigger t_lista_espera_bi before insert or update on piefirme.lista_espera for each row execute function piefirme_app.lista_espera_bi();

-- ═════════════════ reservas del portal (E58): retención de horario mientras se paga ═════════════════
create table piefirme.reservas_portal (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                uuid not null references piefirme.sedes(id),
  servicio_id            uuid not null references piefirme.servicios(id),
  podologo_id            uuid not null references piefirme.perfiles(id),   -- el elegido o el asignado por «cualquiera disponible» (P-048)
  cabina_id              uuid references piefirme.cabinas(id),
  inicio                 timestamptz not null,
  fin                    timestamptz not null,
  tipo_atencion          text not null default 'presencial' check (tipo_atencion in ('presencial', 'videoconsulta')),
  estado                 text not null default 'retenido' check (estado in ('retenido', 'confirmada', 'pago_rechazado', 'vencida', 'horario_no_disponible')),
  retenido_hasta         timestamptz,
  token_hash             text not null,                                  -- sha256 del token de la reserva (el token solo lo conoce el navegador)
  precio                 numeric(14,2) not null default 0 check (precio >= 0),
  anticipo_monto         numeric(14,2) not null default 0 check (anticipo_monto >= 0),
  saldo                  numeric(14,2) not null default 0 check (saldo >= 0),
  -- datos del solicitante (pueden dar de alta o coincidir con un paciente existente)
  nombre                 text not null,
  apellidos              text not null,
  fecha_nacimiento       date not null,
  sexo                   text check (sexo in ('mujer', 'hombre', 'otro')),
  celular                text not null,
  correo                 text not null,
  primera_vez            boolean not null default false,
  motivo_consulta        text,
  tutor                  jsonb,                                          -- si es menor de edad
  requiere_factura       boolean not null default false,
  datos_fiscales         jsonb,                                          -- RFC, razón social, CP, régimen, uso de CFDI, correo
  consentimientos        jsonb not null default '{}'::jsonb,             -- {"aviso_privacidad":{"version":3,"aceptado":true},"terminos":…}
  ip                     text,                                           -- evidencia del consentimiento (P-142)
  dispositivo            text,
  paciente_id            uuid references piefirme.pacientes(id),
  cita_id                uuid references piefirme.citas(id),
  motivo_estado          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (fin > inicio),
  check (estado <> 'retenido' or retenido_hasta is not null),
  check (estado <> 'confirmada' or cita_id is not null)
);
create index on piefirme.reservas_portal (organizacion_id, estado, retenido_hasta);
create index on piefirme.reservas_portal (organizacion_id, podologo_id, inicio) where estado = 'retenido';
create index on piefirme.reservas_portal (organizacion_id, celular);
create index on piefirme.reservas_portal (organizacion_id, correo);
alter table piefirme.citas add constraint citas_reserva_portal_fk foreign key (reserva_portal_id) references piefirme.reservas_portal(id);

-- Una retención nueva no puede empalmarse (primera confirmación gana, P-037); se serializa por podólogo.
create or replace function piefirme_app.reserva_portal_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_conf text;
begin
  if tg_op = 'INSERT' and new.estado = 'retenido' then
    perform pg_advisory_xact_lock(hashtextextended(new.podologo_id::text, 0));
    v_conf := piefirme_app.conflicto_agenda(new.organizacion_id, new.sede_id, new.podologo_id, new.cabina_id, new.inicio, new.fin, 0, 0, null, new.id);
    if v_conf is not null then raise exception 'conflicto_agenda: %', v_conf using errcode = 'PF409'; end if;
  end if;
  return new;
end $$;
create trigger t_reserva_portal_bi before insert on piefirme.reservas_portal for each row execute function piefirme_app.reserva_portal_bi();

-- ═════════════════ RLS ═════════════════
-- Citas: todos los roles ven la agenda de su sede; el podólogo solo escribe las suyas; nadie borra (se cancela con motivo, P-051).
select piefirme_app.crear_politicas('citas', null, array['administrador', 'recepcion', 'podologo'], '{}'::text[], 'si',
                           $c$ piefirme_app.rol() <> 'podologo' or podologo_id = auth.uid() $c$);
select piefirme_app.crear_politicas('cita_estados_historial', null, '{}'::text[], '{}'::text[], 'no');
drop policy if exists cita_estados_historial_ins on piefirme.cita_estados_historial;
drop policy if exists cita_estados_historial_upd on piefirme.cita_estados_historial;
select piefirme_app.crear_politicas('lista_espera', null, array['administrador', 'recepcion'], array['administrador', 'recepcion'], 'si');
select piefirme_app.crear_politicas('reservas_portal', array['administrador', 'recepcion'], array['administrador'], '{}'::text[], 'si');
select piefirme_app.crear_politicas('autorizaciones_admin', null, '{}'::text[], '{}'::text[], 'no', 'false',
                           $c$ piefirme_app.es_admin() or solicitante_id = auth.uid() $c$);
drop policy if exists autorizaciones_admin_ins on piefirme.autorizaciones_admin;
drop policy if exists autorizaciones_admin_upd on piefirme.autorizaciones_admin;
select piefirme_app.b_triggers('citas');
select piefirme_app.b_triggers('lista_espera');
select piefirme_app.b_triggers('reservas_portal');
select piefirme_app.b_triggers('autorizaciones_admin', false);

-- ═════════════════ vistas prp_* ═════════════════
-- prp_agenda (agenda con anticipo y paciente) se define en 029 porque depende de anticipos (025).

create or replace view piefirme.prp_lista_espera with (security_invoker = true) as
select l.*, se.nombre as sede_nombre, s.nombre as servicio_nombre, pf.nombre as podologo_nombre,
       coalesce(btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')), l.nombre_solicitante) as solicitante,
       (l.estado in ('esperando', 'notificado') and l.vence_el < now()) as vencida_sin_marcar,
       (l.estado = 'notificado' and l.notificado_hasta < now()) as sin_respuesta
  from piefirme.lista_espera l
  join piefirme.sedes se on se.id = l.sede_id
  join piefirme.servicios s on s.id = l.servicio_id
  left join piefirme.perfiles pf on pf.id = l.podologo_id
  left join piefirme.pacientes p on p.id = l.paciente_id;

create or replace view piefirme.prp_reservas_portal with (security_invoker = true) as
select r.id, r.organizacion_id, r.sede_id, se.nombre as sede_nombre, r.servicio_id, s.nombre as servicio_nombre,
       r.podologo_id, pf.nombre as podologo_nombre, r.inicio, r.fin, r.estado,
       (r.estado = 'retenido' and r.retenido_hasta > now()) as retenida_vigente, r.retenido_hasta,
       r.precio, r.anticipo_monto, r.saldo, r.nombre, r.apellidos, r.celular, r.correo, r.requiere_factura,
       r.cita_id, r.paciente_id, r.created_at
  from piefirme.reservas_portal r
  join piefirme.sedes se on se.id = r.sede_id
  join piefirme.servicios s on s.id = r.servicio_id
  join piefirme.perfiles pf on pf.id = r.podologo_id;

-- ═════════════════ permisos de ejecución ═════════════════
revoke all on function piefirme.definir_pin_administrador(text) from public, anon;
revoke all on function piefirme.autorizar_con_pin(text, text, text, numeric, jsonb) from public, anon;
revoke all on function piefirme.citas_afectadas_por_bloqueo(uuid) from public, anon;
grant execute on function piefirme.definir_pin_administrador(text), piefirme.autorizar_con_pin(text, text, text, numeric, jsonb),
                          piefirme.citas_afectadas_por_bloqueo(uuid) to authenticated;
grant execute on function piefirme_app.precio_servicio(uuid, uuid, uuid, date), piefirme_app.conflicto_agenda(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, uuid, uuid),
                          piefirme_app.hash_pin(uuid, text) to authenticated;
