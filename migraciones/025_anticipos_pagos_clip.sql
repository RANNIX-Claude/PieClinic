-- 025 · Anticipos, pagos Clip (adaptador SIN llaves), reembolsos y efecto de la cancelación de citas sobre el anticipo.
-- Reglas: P-033 (cancelación 48 h), P-034 (anticipo 30 % solo portal; Clip únicamente para anticipos), P-035 (reembolso 5-10 días hábiles,
-- comisión de Clip la absorbe la clínica), P-062 (sin CFDI de anticipo automático), P-077 (comisión = gasto de la clínica), P-094.
-- Estados: MODELO_ESTADOS S11. Las llaves de Clip NUNCA viven en la base: solo la referencia al secreto del servidor.
-- Dependencias: 001, 010, 020..024.

-- ───────────────────────────── cuenta y terminales Clip (E04, E05) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.clip_cuentas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null unique references piefirme.organizaciones(id) on delete cascade,
  alias            text,
  estado           text not null default 'desconectada' check (estado in ('desconectada', 'conectada')),
  modo             text not null default 'no_configurado' check (modo in ('no_configurado', 'simulado', 'sandbox', 'produccion')),
  credencial_ref   text,        -- nombre del secreto en el servidor (Netlify/Supabase Vault); jamás la llave
  webhook_ref      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table piefirme.clip_terminales (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  identificador    text,
  alias            text,
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (sede_id, identificador)
);
create index on piefirme.clip_terminales (organizacion_id, sede_id);

-- ───────────────────────────── anticipos (E62) ─────────────────────────────
create table piefirme.anticipos (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                 uuid not null references piefirme.sedes(id),
  folio                   text,                                          -- {SEDE}-ANT-{NNNNNN}
  paciente_id             uuid not null references piefirme.pacientes(id),
  cita_id                 uuid references piefirme.citas(id),
  plan_adquirido_id       uuid references piefirme.planes_adquiridos(id),
  orden_plantilla_id      uuid,                                          -- orden de plantilla ortopédica (dominio A); referencia lógica
  reserva_portal_id       uuid references piefirme.reservas_portal(id),
  origen                  text not null default 'mostrador' check (origen in ('portal', 'mostrador', 'liga_pago')),
  monto                   numeric(14,2) not null check (monto > 0),
  metodo                  text not null default 'clip' check (metodo in ('clip', 'efectivo', 'tarjeta', 'transferencia')),
  estado                  text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'aplicado', 'reembolsado', 'no_reembolsable', 'vencido')),
  liga_pago_url           text,
  liga_vence_en           timestamptz,
  referencia              text,
  pagado_en               timestamptz,
  venta_id                uuid,                                          -- FK en 026
  aplicado_en             timestamptz,
  reembolso_estado        text not null default 'ninguno' check (reembolso_estado in ('ninguno', 'solicitado', 'procesado', 'manual')),
  reembolso_monto         numeric(14,2) check (reembolso_monto is null or reembolso_monto >= 0),
  reembolso_solicitado_en timestamptz,
  reembolso_cerrado_en    timestamptz,
  reembolso_referencia    text,
  reembolso_por           uuid references piefirme.perfiles(id) on delete set null,
  nota                    text,
  created_by              uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (cita_id is not null or plan_adquirido_id is not null or orden_plantilla_id is not null or reserva_portal_id is not null),
  check (estado <> 'aplicado' or venta_id is not null),
  check (estado not in ('pagado', 'aplicado', 'reembolsado', 'no_reembolsable') or pagado_en is not null)
);
create index on piefirme.anticipos (organizacion_id, cita_id);
create index on piefirme.anticipos (organizacion_id, paciente_id, estado);
create index on piefirme.anticipos (organizacion_id, estado, liga_vence_en);

create or replace function piefirme_app.anticipo_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ok boolean;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id)
     or not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'el anticipo mezcla datos de otra clínica' using errcode = 'PF403';
  end if;
  if tg_op = 'INSERT' then
    if new.folio is null then new.folio := piefirme_app.siguiente_folio_comercial(new.sede_id, 'ANT'); end if;
    if new.estado = 'pagado' and new.pagado_en is null then new.pagado_en := now(); end if;
    if new.estado not in ('pendiente', 'pagado') and auth.uid() is not null then
      raise exception 'un anticipo nace pendiente o pagado' using errcode = 'PF409';
    end if;
  else
    if new.monto is distinct from old.monto and old.estado <> 'pendiente' then
      raise exception 'el monto de un anticipo pagado no se modifica' using errcode = 'PF409';
    end if;
    if new.estado is distinct from old.estado then
      v_ok := (old.estado = 'pendiente' and new.estado in ('pagado', 'vencido'))
           or (old.estado = 'pagado'    and new.estado in ('aplicado', 'reembolsado', 'no_reembolsable'))
           or (old.estado = 'aplicado'  and new.estado = 'pagado' and current_setting('app.reversa', true) = 'on');
      if not v_ok and not (piefirme_app.es_admin() or auth.uid() is null) then
        raise exception 'transición de anticipo no permitida: % → %', old.estado, new.estado using errcode = 'PF409';
      end if;
      if new.estado = 'pagado' then new.pagado_en := coalesce(new.pagado_en, now()); end if;
      if new.estado = 'aplicado' then new.aplicado_en := now(); end if;
      if new.estado = 'pagado' and old.estado = 'aplicado' then new.aplicado_en := null; new.venta_id := null; end if;
      if new.estado = 'reembolsado' then
        new.reembolso_estado := 'solicitado'; new.reembolso_monto := coalesce(new.reembolso_monto, old.monto); new.reembolso_solicitado_en := now();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_anticipo_bi before insert or update on piefirme.anticipos for each row execute function piefirme_app.anticipo_bi();

-- ───────────────────────────── transacciones de pago Clip (E63) ─────────────────────────────
create table piefirme.pagos_clip (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id            uuid references piefirme.sedes(id),
  clip_payment_id    text,                                             -- ID de Clip (no hay tarjeta guardada: «Pie Firme no la guarda»)
  origen             text not null check (origen in ('liga_pago', 'reserva_portal', 'terminal_sede')),
  anticipo_id        uuid references piefirme.anticipos(id),
  venta_pago_id      uuid,                                             -- FK en 026
  reserva_portal_id  uuid references piefirme.reservas_portal(id),
  monto              numeric(14,2) not null check (monto > 0),
  comision           numeric(14,2) not null default 0 check (comision >= 0),   -- gasto de la clínica; el cobro se registra bruto (P-077)
  estado             text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'reembolsado')),
  ultimos4           text check (ultimos4 is null or ultimos4 ~ '^[0-9]{4}$'),
  marca              text,
  autorizacion       text,
  liquidacion_lote   text,                                             -- «CLIP-1022»: conciliación por lote (P-094)
  liquidado_en       date,
  modo               text not null default 'simulado' check (modo in ('simulado', 'sandbox', 'produccion')),
  respuesta          jsonb not null default '{}'::jsonb,               -- respuesta del adaptador SIN datos de tarjeta
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index pagos_clip_id_unico on piefirme.pagos_clip (organizacion_id, clip_payment_id) where clip_payment_id is not null;
create index on piefirme.pagos_clip (organizacion_id, sede_id, created_at desc);
create index on piefirme.pagos_clip (organizacion_id, liquidacion_lote) where liquidacion_lote is not null;

-- ───────────────────────────── efecto de la cancelación de la cita sobre el anticipo (P-033, P-035) ─────────────────────────────
create or replace function piefirme_app.cita_cancelada_anticipo() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.anticipos a set estado = case when new.cancelacion_fuera_de_plazo then 'no_reembolsable' else 'reembolsado' end
   where a.cita_id = new.id and a.estado = 'pagado';
  update piefirme.anticipos a set estado = 'vencido' where a.cita_id = new.id and a.estado = 'pendiente';
  return null;
end $$;
create trigger t_cita_cancelada_anticipo after update of estado on piefirme.citas
  for each row when (new.estado = 'cancelada' and old.estado is distinct from 'cancelada') execute function piefirme_app.cita_cancelada_anticipo();

-- Reembolso: lo ejecuta Clip cuando exista cuenta real; mientras tanto se registra a mano (P-035). La comisión de Clip no se devuelve.
create or replace function piefirme.registrar_reembolso_anticipo(p_anticipo uuid, p_modo text, p_referencia text default null) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a piefirme.anticipos%rowtype;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  if p_modo not in ('clip', 'manual') then raise exception 'modo de reembolso inválido' using errcode = 'PF400'; end if;
  select * into a from piefirme.anticipos where id = p_anticipo for update;
  if not found then raise exception 'anticipo inexistente' using errcode = 'PF404'; end if;
  if a.estado <> 'reembolsado' or a.reembolso_estado <> 'solicitado' then
    raise exception 'el anticipo no tiene un reembolso pendiente (estado %, reembolso %)', a.estado, a.reembolso_estado using errcode = 'PF409';
  end if;
  update piefirme.anticipos set reembolso_estado = case p_modo when 'clip' then 'procesado' else 'manual' end,
         reembolso_cerrado_en = now(), reembolso_referencia = p_referencia, reembolso_por = auth.uid() where id = p_anticipo;
  update piefirme.pagos_clip set estado = 'reembolsado' where anticipo_id = p_anticipo and estado = 'aprobado' and p_modo = 'clip';
end $$;

-- ───────────────────────────── resultado de pago de una reserva del portal (solo servidor: service_role) ─────────────────────────────
-- La función de servidor (Netlify) habla con Clip con sus llaves y, con el resultado, llama a esta función. Idempotente por clip_payment_id.
create or replace function piefirme.servicio_pago_reserva(
  p_reserva uuid, p_resultado text, p_clip_payment_id text, p_monto numeric, p_comision numeric default 0,
  p_ultimos4 text default null, p_autorizacion text default null, p_marca text default null, p_modo text default 'simulado', p_respuesta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r piefirme.reservas_portal%rowtype; v_fin jsonb; v_ant uuid; v_prev piefirme.pagos_clip%rowtype;
begin
  if p_resultado not in ('aprobado', 'rechazado') then raise exception 'resultado inválido' using errcode = 'PF400'; end if;
  select * into r from piefirme.reservas_portal where id = p_reserva for update;
  if not found then raise exception 'reserva inexistente' using errcode = 'PF404'; end if;
  if p_clip_payment_id is not null then
    select * into v_prev from piefirme.pagos_clip where organizacion_id = r.organizacion_id and clip_payment_id = p_clip_payment_id;
    if found then return jsonb_build_object('estado', r.estado, 'repetido', true, 'cita_id', r.cita_id); end if;
  end if;
  if p_resultado = 'rechazado' then
    insert into piefirme.pagos_clip (organizacion_id, sede_id, clip_payment_id, origen, reserva_portal_id, monto, estado, modo, respuesta)
    values (r.organizacion_id, r.sede_id, p_clip_payment_id, 'reserva_portal', r.id, r.anticipo_monto, 'rechazado', p_modo, coalesce(p_respuesta, '{}'::jsonb));
    if r.estado = 'retenido' and r.retenido_hasta <= now() then
      update piefirme.reservas_portal set estado = 'pago_rechazado' where id = r.id;
    end if;
    return jsonb_build_object('estado', 'pago_rechazado', 'retenido_hasta', r.retenido_hasta);   -- mientras dure la retención puede reintentar
  end if;
  if p_monto is distinct from r.anticipo_monto then raise exception 'el monto pagado no coincide con el anticipo' using errcode = 'PF409'; end if;
  v_fin := piefirme_app.finalizar_reserva(r.id);
  select * into r from piefirme.reservas_portal where id = r.id;
  if v_fin ->> 'estado' = 'confirmada' then
    insert into piefirme.anticipos (organizacion_id, sede_id, paciente_id, cita_id, reserva_portal_id, origen, monto, metodo, estado, pagado_en, referencia)
    values (r.organizacion_id, r.sede_id, r.paciente_id, r.cita_id, r.id, 'portal', r.anticipo_monto, 'clip', 'pagado', now(), p_autorizacion)
    returning id into v_ant;
  else
    -- cobró pero el horario ya no estaba libre: queda el pago aprobado SIN anticipo y la reserva marcada para reembolso (P-035)
    update piefirme.reservas_portal set motivo_estado = 'requiere_reembolso: horario no disponible al confirmar el pago' where id = r.id;
  end if;
  insert into piefirme.pagos_clip (organizacion_id, sede_id, clip_payment_id, origen, anticipo_id, reserva_portal_id, monto, comision, estado, ultimos4, marca, autorizacion, modo, respuesta)
  values (r.organizacion_id, r.sede_id, p_clip_payment_id, 'reserva_portal', v_ant, r.id, p_monto, coalesce(p_comision, 0), 'aprobado',
          p_ultimos4, p_marca, p_autorizacion, p_modo, coalesce(p_respuesta, '{}'::jsonb));
  return v_fin || jsonb_build_object('anticipo_id', v_ant);
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.crear_politicas('clip_cuentas',    array['administrador'], array['administrador'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('clip_terminales', array['administrador', 'recepcion'], array['administrador'], array['administrador'], 'si');
select piefirme_app.crear_politicas('anticipos',       array['administrador', 'recepcion', 'podologo'], array['administrador', 'recepcion'], '{}'::text[], 'si');
select piefirme_app.crear_politicas('pagos_clip',      array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'nula');
select piefirme_app.b_triggers('clip_cuentas');
select piefirme_app.b_triggers('clip_terminales');
select piefirme_app.b_triggers('anticipos');
select piefirme_app.b_triggers('pagos_clip');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_anticipos with (security_invoker = true) as
select a.id, a.organizacion_id, a.sede_id, se.nombre as sede_nombre, a.folio, a.origen, a.metodo, a.monto, a.estado,
       a.paciente_id, btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')) as paciente_nombre,
       a.cita_id, c.folio as cita_folio, c.inicio as cita_inicio, c.estado as cita_estado,
       a.plan_adquirido_id, a.pagado_en, a.aplicado_en, a.venta_id,
       a.reembolso_estado, a.reembolso_monto, a.reembolso_solicitado_en, a.reembolso_cerrado_en, a.liga_pago_url, a.liga_vence_en,
       (a.estado = 'pendiente' and a.liga_vence_en < now()) as liga_vencida,
       (a.estado = 'pagado') as aplicable_en_caja
  from piefirme.anticipos a
  join piefirme.sedes se on se.id = a.sede_id
  join piefirme.pacientes p on p.id = a.paciente_id
  left join piefirme.citas c on c.id = a.cita_id;

create or replace view piefirme.prp_pagos_clip with (security_invoker = true) as
select pc.*, se.nombre as sede_nombre, a.folio as anticipo_folio,
       round(pc.monto - pc.comision, 2) as neto_a_liquidar
  from piefirme.pagos_clip pc
  left join piefirme.sedes se on se.id = pc.sede_id
  left join piefirme.anticipos a on a.id = pc.anticipo_id;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.registrar_reembolso_anticipo(uuid, text, text) from public, anon;
grant execute on function piefirme.registrar_reembolso_anticipo(uuid, text, text) to authenticated;
revoke all on function piefirme.servicio_pago_reserva(uuid, text, text, numeric, numeric, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function piefirme.servicio_pago_reserva(uuid, text, text, numeric, numeric, text, text, text, text, jsonb) to service_role;
