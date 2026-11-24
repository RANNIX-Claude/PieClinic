-- 056 · EQUIPO Y PLATAFORMA (D) · Planes y suscripciones (SIN cobro automático), registro manual de pagos, invitaciones/altas de usuarios,
--        soporte y acceso temporal de soporte.
-- Depende de: 001 (organizaciones, perfiles, rannix_staff).
-- Reglas: P-113 (planes $400/podólogo activo o $1,000/clínica, +IVA; el cobro NO ocurre en el sistema: RANNIX lleva plan, periodo y estado manual),
--   P-114 (prueba 14 días sin tarjeta; vencida → gracia 7 días → solo lectura y exportación, ejecutado manualmente por RANNIX),
--   P-116 (podólogo activo = acceso en el mes; cambio de plan surte efecto el siguiente periodo, sin prorrateo), P-117 (IVA 16 % aparte;
--   MRR = suma de planes vigentes), P-119 (una cuenta pertenece a una sola clínica; alta por invitación de un solo uso, el administrador
--   no teclea contraseñas ajenas), P-121 (soporte sin suplantación: metadatos; acceso temporal otorgado por la clínica con motivo y bitácora).
-- Escrituras de plataforma (plan, estado, pagos): solo vía funciones rannix_* (059) con service_role/rannix_staff; la clínica solo lee su suscripción.
-- Entidades: E13 Plan, E14 Suscripción, E15 Cobro de suscripción, E16 Ticket de soporte, E09 Usuario (invitaciones).

-- ───────────────────────────── catálogo global de planes (E13) ─────────────────────────────
-- Referencia global de RANNIX (P-128: catálogos de referencia globales, solo lectura). Sin organizacion_id por diseño.
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.planes_suscripcion (
  clave            text primary key check (clave in ('por_podologo', 'por_clinica')),
  nombre           text not null,
  precio_mensual   numeric(14,2) not null check (precio_mensual > 0),
  unidad_cobro     text not null check (unidad_cobro in ('por_podologo_activo', 'por_clinica')),
  iva_pct          numeric(5,2) not null default 16,
  iva_incluido     boolean not null default false,
  descripcion      text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table piefirme.planes_suscripcion enable row level security;
create policy planes_sel on piefirme.planes_suscripcion for select to authenticated using (activo);
-- sin insert/update/delete: solo service_role / migraciones

insert into piefirme.planes_suscripcion (clave, nombre, precio_mensual, unidad_cobro, descripcion) values
  ('por_podologo', 'Por podólogo', 400.00,  'por_podologo_activo', '$400 MXN al mes por podólogo activo, más IVA. Sedes ilimitadas.'),
  ('por_clinica',  'Por clínica',  1000.00, 'por_clinica',         '$1,000 MXN al mes por clínica, más IVA. Podólogos y sedes ilimitados.')
on conflict (clave) do nothing;

-- ───────────────────────────── suscripción de la organización (E14) ─────────────────────────────
create table piefirme.suscripciones (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null unique references piefirme.organizaciones(id) on delete cascade,
  plan_clave            text not null references piefirme.planes_suscripcion(clave),
  plan_siguiente        text references piefirme.planes_suscripcion(clave),      -- cambio pedido: surte efecto el siguiente periodo (P-116)
  estado                text not null default 'prueba' check (estado in ('prueba', 'activa', 'vencida', 'suspendida', 'cancelada')),
  prueba_inicio         date,
  prueba_hasta          date,
  periodo_actual_desde  date,
  proximo_cobro         date,
  gracia_hasta          date,                                                    -- vencida + 7 días (P-114)
  cobro_automatico      boolean not null default false check (cobro_automatico = false),   -- P-113: sin cobro dentro del sistema
  razon_social          text,
  rfc                   text,
  regimen_fiscal        text,
  codigo_postal         text,
  correo_facturas       text,
  notas_rannix          text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger t_upd before update on piefirme.suscripciones for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.suscripciones for each row execute function piefirme_app.auditar();

-- cobros / pagos registrados A MANO por RANNIX (E15)
create table piefirme.cobros_suscripcion (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  suscripcion_id    uuid not null references piefirme.suscripciones(id) on delete cascade,
  periodo           date not null check (periodo = date_trunc('month', periodo)::date),
  plan_clave        text not null references piefirme.planes_suscripcion(clave),
  unidades          integer not null default 1 check (unidades >= 0),            -- podólogos activos facturados (1 si es por clínica)
  importe_base      numeric(14,2) not null check (importe_base >= 0),
  iva               numeric(14,2) not null default 0 check (iva >= 0),
  total             numeric(14,2) generated always as (importe_base + iva) stored,
  estado            text not null default 'proxima' check (estado in ('proxima', 'pendiente', 'pagada', 'vencida', 'cancelada')),
  metodo_pago       text check (metodo_pago in ('transferencia', 'efectivo', 'deposito', 'otro')),
  fecha_pago        date,
  referencia        text,
  comprobante_path  text,                                                         -- bucket pf-comprobantes: <organizacion_id>/suscripcion/…
  factura_folio     text,                                                         -- p. ej. RNX-2026-0710
  factura_xml_path  text,
  registrado_por    uuid,
  notas             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (suscripcion_id, periodo),
  check (estado <> 'pagada' or (fecha_pago is not null and metodo_pago is not null))
);
create index on piefirme.cobros_suscripcion (organizacion_id, periodo desc);
create trigger t_upd before update on piefirme.cobros_suscripcion for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.cobros_suscripcion for each row execute function piefirme_app.auditar();

-- podólogos activos del mes (P-116): con sesión activa y acceso en el mes en curso (el criterio de "agenda en el mes" lo suma la app)
create or replace function piefirme.suscripcion_podologos_activos(p_org uuid default null) returns integer
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select count(*)::int from piefirme.perfiles p
   where p.organizacion_id = coalesce(p_org, piefirme_app.org_id()) and p.rol = 'podologo' and p.activo
     and (p.ultimo_acceso >= date_trunc('month', now()) or p.created_at >= date_trunc('month', now()))
     and (p_org is null or piefirme_app.es_rannix() or p_org = piefirme_app.org_id())
$$;

-- cargo mensual vigente (sin IVA)
create or replace function piefirme.suscripcion_cargo_mensual(p_org uuid default null) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select case s.plan_clave when 'por_clinica' then pl.precio_mensual
              else pl.precio_mensual * piefirme.suscripcion_podologos_activos(s.organizacion_id) end
    from piefirme.suscripciones s join piefirme.planes_suscripcion pl on pl.clave = s.plan_clave
   where s.organizacion_id = coalesce(p_org, piefirme_app.org_id()) and (p_org is null or piefirme_app.es_rannix() or p_org = piefirme_app.org_id())
$$;

-- el admin de la clínica pide cambiar de plan: queda como plan_siguiente (surte efecto el siguiente periodo, sin prorrateo)
create or replace function piefirme.suscripcion_solicitar_cambio_plan(p_plan text)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'Solo Administración'; end if;
  if not exists (select 1 from piefirme.planes_suscripcion where clave = p_plan and activo) then raise exception 'Plan inexistente'; end if;
  update piefirme.suscripciones set plan_siguiente = case when plan_clave = p_plan then null else p_plan end where organizacion_id = piefirme_app.org_id();
  perform piefirme.registrar_bitacora('actualizar', 'suscripciones', null, jsonb_build_object('plan_siguiente', p_plan));
end $$;

-- datos de facturación de la clínica para el CFDI mensual de RANNIX
create or replace function piefirme.suscripcion_actualizar_facturacion(p_razon_social text, p_rfc text, p_regimen text, p_cp text, p_correo text)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  update piefirme.suscripciones set razon_social = p_razon_social, rfc = upper(trim(p_rfc)), regimen_fiscal = p_regimen, codigo_postal = p_cp, correo_facturas = p_correo
   where organizacion_id = piefirme_app.org_id();
  perform piefirme.registrar_bitacora('actualizar', 'suscripciones', null, jsonb_build_object('campos', 'facturacion'));
end $$;

-- ───────────────────────────── invitaciones y altas de usuario (E09) ─────────────────────────────
create table piefirme.invitaciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  email            text not null,
  nombre           text,
  rol              piefirme.rol_usuario not null,
  sedes            uuid[] not null default '{}',
  token_hash       text not null unique,                   -- sha256 del token; el token en claro solo lo ve quien invita, una vez
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'expirada', 'revocada')),
  expira_en        timestamptz not null default (now() + interval '7 days'),
  invitado_por     uuid,
  aceptada_en      timestamptz,
  perfil_id        uuid references piefirme.perfiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (email = lower(email))
);
create unique index invitaciones_email_pend on piefirme.invitaciones (organizacion_id, email) where estado = 'pendiente';
create index on piefirme.invitaciones (organizacion_id, estado);
create trigger t_aud after insert or update or delete on piefirme.invitaciones for each row execute function piefirme_app.auditar();

-- Crea la invitación (admin de la clínica). Devuelve el token UNA vez; la función servidor lo manda por correo.
create or replace function piefirme.invitacion_crear(p_email text, p_rol piefirme.rol_usuario, p_sedes uuid[] default '{}', p_nombre text default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_email text := lower(trim(p_email)); v_tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); v_id uuid;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración de una clínica activa'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo inválido'; end if;
  if exists (select 1 from piefirme.perfiles where lower(email) = v_email) then raise exception 'Ese correo ya tiene una cuenta (una cuenta pertenece a una sola clínica)'; end if;
  if exists (select 1 from unnest(p_sedes) s where not exists (select 1 from piefirme.sedes x where x.id = s and x.organizacion_id = v_org)) then raise exception 'Sede de otra clínica'; end if;
  update piefirme.invitaciones set estado = 'expirada' where organizacion_id = v_org and email = v_email and estado = 'pendiente' and expira_en < now();
  insert into piefirme.invitaciones (organizacion_id, email, nombre, rol, sedes, token_hash, invitado_por)
  values (v_org, v_email, p_nombre, p_rol, coalesce(p_sedes, '{}'), encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_tok, 'expira_en', (select expira_en from piefirme.invitaciones where id = v_id));
end $$;

create or replace function piefirme.invitacion_revocar(p_invitacion uuid)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'Solo Administración'; end if;
  update piefirme.invitaciones set estado = 'revocada' where id = p_invitacion and organizacion_id = piefirme_app.org_id() and estado = 'pendiente';
end $$;

-- ALTA DE USUARIO (solo función servidor con service_role): consume el token, crea el perfil del usuario ya creado en auth.users.
create or replace function piefirme.invitacion_consumir(p_token text, p_user_id uuid, p_nombre text default null, p_apellidos text default null)
returns piefirme.perfiles language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare inv piefirme.invitaciones; per piefirme.perfiles;
begin
  select * into inv from piefirme.invitaciones where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or inv.estado <> 'pendiente' or inv.expira_en < now() then raise exception 'Invitación inválida, usada o vencida'; end if;
  if exists (select 1 from piefirme.perfiles where id = p_user_id) then raise exception 'El usuario ya tiene perfil'; end if;
  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, apellidos, email, sedes)
  values (p_user_id, inv.organizacion_id, inv.rol, coalesce(p_nombre, inv.nombre, split_part(inv.email, '@', 1)), p_apellidos, inv.email, inv.sedes)
  returning * into per;
  update piefirme.invitaciones set estado = 'aceptada', aceptada_en = now(), perfil_id = per.id where id = inv.id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (inv.organizacion_id, p_user_id, 'insertar', 'perfiles', per.id::text, jsonb_build_object('via', 'invitacion', 'rol', inv.rol));
  return per;
end $$;

-- ───────────────────────────── soporte (E16) ─────────────────────────────
create table piefirme.soporte_tickets (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  folio            text not null,
  asunto           text not null,
  descripcion      text,
  prioridad        text not null default 'normal' check (prioridad in ('urgente', 'normal')),
  estado           text not null default 'abierto' check (estado in ('abierto', 'en_atencion', 'esperando_clinica', 'resuelto', 'cerrado')),
  creado_por       uuid default auth.uid(),
  resuelto_en      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.soporte_tickets (organizacion_id, estado);
create trigger t_upd before update on piefirme.soporte_tickets for each row execute function piefirme_app.tocar_updated_at();

create table piefirme.soporte_mensajes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  ticket_id        uuid not null references piefirme.soporte_tickets(id) on delete cascade,
  autor_tipo       text not null check (autor_tipo in ('clinica', 'rannix')),
  autor_id         uuid default auth.uid(),
  mensaje          text not null,
  created_at       timestamptz not null default now()
);
create index on piefirme.soporte_mensajes (organizacion_id, ticket_id, created_at);

-- acceso temporal de soporte a la clínica: lo otorga la clínica con motivo; bitácora visible para ella (P-121)
create table piefirme.soporte_accesos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  ticket_id        uuid references piefirme.soporte_tickets(id) on delete set null,
  motivo           text not null check (length(trim(motivo)) >= 5),
  otorgado_por     uuid not null default auth.uid(),
  alcance          text not null default 'metadatos' check (alcance in ('metadatos', 'configuracion')),   -- nunca datos clínicos
  vence_en         timestamptz not null default (now() + interval '24 hours') check (vence_en <= now() + interval '7 days'),
  revocado_en      timestamptz,
  created_at       timestamptz not null default now()
);
create index on piefirme.soporte_accesos (organizacion_id, vence_en desc);
create trigger t_aud after insert or update or delete on piefirme.soporte_accesos for each row execute function piefirme_app.auditar();

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.suscripciones      enable row level security;
alter table piefirme.cobros_suscripcion enable row level security;
alter table piefirme.invitaciones       enable row level security;
alter table piefirme.soporte_tickets    enable row level security;
alter table piefirme.soporte_mensajes   enable row level security;
alter table piefirme.soporte_accesos    enable row level security;

-- suscripción y cobros: la clínica (admin) solo lee; las escrituras son de RANNIX vía funciones (059)
create policy sus_sel on piefirme.suscripciones for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy cob_sel on piefirme.cobros_suscripcion for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());

create policy inv_sel on piefirme.invitaciones for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
-- altas/revocaciones: funciones invitacion_crear / invitacion_revocar / invitacion_consumir

create policy tkt_sel on piefirme.soporte_tickets for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy tkt_ins on piefirme.soporte_tickets for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy tkt_upd on piefirme.soporte_tickets for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());

create policy smsg_sel on piefirme.soporte_mensajes for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy smsg_ins on piefirme.soporte_mensajes for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and autor_tipo = 'clinica' and autor_id = auth.uid()
              and exists (select 1 from piefirme.soporte_tickets t where t.id = soporte_mensajes.ticket_id and t.organizacion_id = soporte_mensajes.organizacion_id));

create policy sacc_sel on piefirme.soporte_accesos for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy sacc_ins on piefirme.soporte_accesos for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and otorgado_por = auth.uid());
create policy sacc_upd on piefirme.soporte_accesos for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());

-- folio de ticket S-NNN por clínica
create or replace function piefirme_app.ticket_folio() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if coalesce(new.folio, '') = '' then new.folio := 'S-' || lpad(piefirme_app.siguiente_folio_d(new.organizacion_id, 'soporte')::text, 3, '0'); end if;
  return new;
end $$;
create trigger t_folio before insert on piefirme.soporte_tickets for each row execute function piefirme_app.ticket_folio();

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_suscripcion with (security_invoker = true) as
select s.id, s.organizacion_id, s.plan_clave, pl.nombre as plan_nombre, pl.precio_mensual, pl.iva_pct, s.plan_siguiente, s.estado,
       s.prueba_inicio, s.prueba_hasta,
       case when s.estado = 'prueba' and s.prueba_hasta is not null then greatest(0, s.prueba_hasta - current_date) end as dias_prueba_restantes,
       s.periodo_actual_desde, s.proximo_cobro, s.gracia_hasta, s.cobro_automatico,
       piefirme.suscripcion_podologos_activos(s.organizacion_id) as podologos_activos,
       piefirme.suscripcion_cargo_mensual(s.organizacion_id) as cargo_mensual,
       round(piefirme.suscripcion_cargo_mensual(s.organizacion_id) * (1 + pl.iva_pct / 100), 2) as cargo_mensual_con_iva,
       s.razon_social, s.rfc, s.regimen_fiscal, s.codigo_postal, s.correo_facturas
  from piefirme.suscripciones s
  join piefirme.planes_suscripcion pl on pl.clave = s.plan_clave;

create or replace view piefirme.prp_cobros_suscripcion with (security_invoker = true) as
select c.id, c.organizacion_id, c.suscripcion_id, c.periodo, c.plan_clave, c.unidades, c.importe_base, c.iva, c.total, c.estado,
       c.metodo_pago, c.fecha_pago, c.referencia, c.comprobante_path, c.factura_folio, c.factura_xml_path
  from piefirme.cobros_suscripcion c;

create or replace view piefirme.prp_invitaciones with (security_invoker = true) as
select i.id, i.organizacion_id, i.email, i.nombre, i.rol, i.sedes,
       case when i.estado = 'pendiente' and i.expira_en < now() then 'expirada' else i.estado end as estado,
       i.expira_en, i.aceptada_en, i.created_at
  from piefirme.invitaciones i;

create or replace view piefirme.prp_soporte_tickets with (security_invoker = true) as
select t.id, t.organizacion_id, t.folio, t.asunto, t.descripcion, t.prioridad, t.estado, t.resuelto_en, t.created_at,
       (select count(*) from piefirme.soporte_mensajes m where m.ticket_id = t.id) as mensajes
  from piefirme.soporte_tickets t;

create or replace view piefirme.prp_soporte_accesos with (security_invoker = true) as
select a.id, a.organizacion_id, a.ticket_id, a.motivo, a.otorgado_por, a.alcance, a.vence_en, a.revocado_en,
       (a.revocado_en is null and a.vence_en > now()) as vigente, a.created_at
  from piefirme.soporte_accesos a;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.suscripcion_podologos_activos(uuid) from public, anon;
revoke all on function piefirme.suscripcion_cargo_mensual(uuid) from public, anon;
revoke all on function piefirme.suscripcion_solicitar_cambio_plan(text) from public, anon;
revoke all on function piefirme.suscripcion_actualizar_facturacion(text, text, text, text, text) from public, anon;
revoke all on function piefirme.invitacion_crear(text, piefirme.rol_usuario, uuid[], text) from public, anon;
revoke all on function piefirme.invitacion_revocar(uuid) from public, anon;
revoke all on function piefirme.invitacion_consumir(text, uuid, text, text) from public, anon, authenticated;
grant execute on function piefirme.suscripcion_podologos_activos(uuid) to authenticated;
grant execute on function piefirme.suscripcion_cargo_mensual(uuid) to authenticated;
grant execute on function piefirme.suscripcion_solicitar_cambio_plan(text) to authenticated;
grant execute on function piefirme.suscripcion_actualizar_facturacion(text, text, text, text, text) to authenticated;
grant execute on function piefirme.invitacion_crear(text, piefirme.rol_usuario, uuid[], text) to authenticated;
grant execute on function piefirme.invitacion_revocar(uuid) to authenticated;
grant execute on function piefirme.invitacion_consumir(text, uuid, text, text) to service_role;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.ticket_folio() from authenticated;
