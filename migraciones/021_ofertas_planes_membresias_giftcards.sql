-- 021 · Comercial: ofertas (paquetes, planes multi-sesión, membresías, gift cards, promociones), planes adquiridos con saldo,
-- membresías del paciente, gift cards emitidas y usos de promoción.
-- Reglas: P-027, P-070..P-074 (planes caducados, otra sede, membresía, gift cards, promociones). Estados: MODELO_ESTADOS S33, S34.
-- Dependencias: 001, 010 (pacientes), 020 (servicios, productos, precios, folios).

-- ───────────────────────────── ofertas (E71) y componentes (E72) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.ofertas (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo                text not null,                       -- PQ-001, PL-001, MB-001, GC-050, PR-017
  nombre                text not null,
  tipo                  text not null check (tipo in ('paquete', 'plan_multisesion', 'membresia', 'gift_card', 'promocion')),
  descripcion           text,
  vigente_desde         date not null default current_date,
  vigente_hasta         date,
  estado                text not null default 'activa' check (estado in ('programada', 'activa', 'pausada', 'vencida', 'cancelada')),
  -- plan multi-sesión
  servicio_base_id      uuid references piefirme.servicios(id),
  sesiones_total        integer check (sesiones_total is null or sesiones_total > 0),
  plantilla_sesiones    jsonb not null default '[]'::jsonb,  -- [{n, nombre, intervalo_dias_min, intervalo_dias_max, precio, proponer_cita}]
  caducidad_meses       integer check (caducidad_meses is null or caducidad_meses > 0),   -- 12 por defecto (P-070)
  usable_otra_sede      boolean not null default true,       -- P-071
  -- membresía
  beneficios            jsonb not null default '[]'::jsonb,  -- cada clínica define los suyos (P-072)
  renovacion_aviso_dias integer not null default 30,
  -- gift card
  monto_saldo           numeric(14,2) check (monto_saldo is null or monto_saldo > 0),
  combinable_promos     boolean not null default false,      -- P-073: no se combinan
  -- promoción
  descuento_pct         numeric(5,2) check (descuento_pct is null or (descuento_pct > 0 and descuento_pct <= 100)),
  sedes_aplica          uuid[] not null default '{}',        -- vacío = todas
  limite_usos           integer check (limite_usos is null or limite_usos > 0),
  usos                  integer not null default 0 check (usos >= 0),
  acumulable_paquete    boolean not null default false,
  garantia_texto        text,
  sintetico             boolean not null default false,
  created_by            uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organizacion_id, codigo),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  -- P-074: la promoción exige vigencia y límite de usos; el paquete exige vigencia
  check (tipo <> 'promocion' or (descuento_pct is not null and vigente_hasta is not null and limite_usos is not null)),
  check (tipo <> 'paquete' or vigente_hasta is not null),
  check (tipo <> 'plan_multisesion' or (servicio_base_id is not null and sesiones_total is not null and caducidad_meses is not null)),
  check (tipo <> 'gift_card' or (monto_saldo is not null and caducidad_meses is not null)),
  check (tipo <> 'membresia' or caducidad_meses is not null)
);
create index on piefirme.ofertas (organizacion_id, tipo, estado);

create table piefirme.oferta_componentes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  oferta_id        uuid not null references piefirme.ofertas(id) on delete cascade,
  tipo             text not null check (tipo in ('servicio', 'producto')),
  servicio_id      uuid references piefirme.servicios(id),
  producto_id      uuid references piefirme.productos(id),
  cantidad         numeric(10,2) not null default 1 check (cantidad > 0),
  precio_lista     numeric(14,2) check (precio_lista is null or precio_lista >= 0),
  aplica_en        text,                                      -- «Cita 1», «Entrega 15 días hábiles»
  orden            integer not null default 0,
  created_at       timestamptz not null default now(),
  check ((tipo = 'servicio' and servicio_id is not null and producto_id is null) or (tipo = 'producto' and producto_id is not null and servicio_id is null))
);
create index on piefirme.oferta_componentes (organizacion_id, oferta_id);

alter table piefirme.precios add constraint precios_oferta_fk foreign key (oferta_id) references piefirme.ofertas(id) on delete cascade;

-- Estado por vigencia: nace programada si empieza en el futuro; las transiciones S33 las valida este trigger.
create or replace function piefirme_app.oferta_bi() returns trigger language plpgsql as $$
declare v_hoy date := piefirme_app.hoy_org(new.organizacion_id);
begin
  if tg_op = 'INSERT' then
    if new.estado = 'activa' and new.vigente_desde > v_hoy then new.estado := 'programada'; end if;
  else
    if new.estado is distinct from old.estado and auth.uid() is not null then
      if not ((old.estado = 'programada' and new.estado in ('activa', 'cancelada'))
           or (old.estado = 'activa' and new.estado in ('pausada', 'vencida'))
           or (old.estado = 'pausada' and new.estado in ('activa', 'cancelada', 'vencida'))) then
        raise exception 'transición de oferta no permitida: % → % (para reutilizarla, duplícala)', old.estado, new.estado using errcode = 'PF409';
      end if;
    end if;
    if new.tipo is distinct from old.tipo then raise exception 'el tipo de oferta no se cambia' using errcode = 'PF409'; end if;
  end if;
  return new;
end $$;
create trigger t_oferta_bi before insert or update on piefirme.ofertas for each row execute function piefirme_app.oferta_bi();

-- ───────────────────────────── planes adquiridos (E73) ─────────────────────────────
create table piefirme.planes_adquiridos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_compra_id   uuid not null references piefirme.sedes(id),
  folio            text,                                      -- {SEDE}-LP-{NNNNNN}
  paciente_id      uuid not null references piefirme.pacientes(id),
  oferta_id        uuid not null references piefirme.ofertas(id),
  venta_id         uuid,                                      -- FK en 026
  venta_linea_id   uuid,
  fecha_compra     date not null default current_date,
  caduca_el        date not null,
  sesiones_total   integer not null check (sesiones_total > 0),
  sesiones_usadas  integer not null default 0 check (sesiones_usadas >= 0),
  precio_total     numeric(14,2) not null check (precio_total >= 0),
  precio_sesion    numeric(14,2) generated always as (round(precio_total / sesiones_total, 2)) stored,   -- P-071 valor prorrateado
  saldo_pendiente  numeric(14,2) not null default 0 check (saldo_pendiente >= 0),   -- por cobrar (CxC)
  usable_otra_sede boolean not null default true,
  estado           text not null default 'vigente' check (estado in ('vigente', 'consumido', 'caducado', 'cancelado')),
  created_by       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (sesiones_usadas <= sesiones_total)
);
create index on piefirme.planes_adquiridos (organizacion_id, paciente_id, estado);
create index on piefirme.planes_adquiridos (organizacion_id, caduca_el) where estado = 'vigente';

create or replace function piefirme_app.plan_adquirido_bi() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.folio is null then new.folio := piefirme_app.siguiente_folio_comercial(new.sede_compra_id, 'LP'); end if;
  else
    if new.estado = 'consumido' and old.estado <> 'consumido' and new.sesiones_usadas < new.sesiones_total then
      raise exception 'el plan aún tiene sesiones' using errcode = 'PF409';
    end if;
    if old.estado in ('caducado', 'cancelado', 'consumido') and new.estado is distinct from old.estado and not piefirme_app.es_admin() and auth.uid() is not null then
      raise exception 'solo el administrador reactiva un plan cerrado' using errcode = 'PF403';
    end if;
  end if;
  return new;
end $$;
create trigger t_plan_adq_bi before insert or update on piefirme.planes_adquiridos for each row execute function piefirme_app.plan_adquirido_bi();

-- Consumo de sesiones: la sesión se reconoce en la sede y con el podólogo que atiende (P-071). FK a citas se agrega en 023.
create table piefirme.plan_sesiones_consumo (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  plan_adquirido_id   uuid not null references piefirme.planes_adquiridos(id) on delete cascade,
  cita_id             uuid not null,
  sede_id             uuid not null references piefirme.sedes(id),
  podologo_id         uuid references piefirme.perfiles(id),
  valor               numeric(14,2) not null check (valor >= 0),
  fecha               date not null default current_date,
  reversado           boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (cita_id)
);
create index on piefirme.plan_sesiones_consumo (organizacion_id, plan_adquirido_id);

create or replace function piefirme_app.plan_consumo_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pa piefirme.planes_adquiridos%rowtype;
begin
  select * into v_pa from piefirme.planes_adquiridos where id = new.plan_adquirido_id for update;
  if v_pa.estado <> 'vigente' then raise exception 'el plan no está vigente (%)', v_pa.estado using errcode = 'PF409'; end if;
  if v_pa.sesiones_usadas >= v_pa.sesiones_total then raise exception 'el plan no tiene saldo de sesiones' using errcode = 'PF409'; end if;
  update piefirme.planes_adquiridos
     set sesiones_usadas = sesiones_usadas + 1,
         estado = case when sesiones_usadas + 1 >= sesiones_total then 'consumido' else estado end
   where id = new.plan_adquirido_id;
  return new;
end $$;
create trigger t_plan_consumo_ai after insert on piefirme.plan_sesiones_consumo for each row execute function piefirme_app.plan_consumo_ai();

-- ───────────────────────────── membresías del paciente (E74) ─────────────────────────────
create table piefirme.membresias_paciente (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id         uuid not null references piefirme.pacientes(id),
  oferta_id           uuid not null references piefirme.ofertas(id),
  sede_venta_id       uuid references piefirme.sedes(id),
  venta_id            uuid,                                   -- FK en 026
  inicio              date not null default current_date,
  vencimiento         date not null,
  estado              text not null default 'vigente' check (estado in ('vigente', 'vencida', 'renovada', 'cancelada')),
  beneficios_consumo  jsonb not null default '{}'::jsonb,     -- {"quiropodias_usadas":3}
  renovada_por        uuid references piefirme.membresias_paciente(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (vencimiento > inicio)
);
create index on piefirme.membresias_paciente (organizacion_id, paciente_id, estado);
create index on piefirme.membresias_paciente (organizacion_id, vencimiento) where estado = 'vigente';

-- ───────────────────────────── gift cards (E75) ─────────────────────────────
create or replace function piefirme_app.codigo_gift_card() returns text language sql volatile as $$
  select 'GC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
$$;

create table piefirme.gift_cards (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo           text not null default piefirme_app.codigo_gift_card(),
  oferta_id        uuid references piefirme.ofertas(id),
  sede_venta_id    uuid references piefirme.sedes(id),
  venta_id         uuid,                                      -- FK en 026
  monto_inicial    numeric(14,2) not null check (monto_inicial > 0),
  saldo            numeric(14,2) not null check (saldo >= 0),
  fecha_venta      date not null default current_date,
  caduca_el        date not null,
  estado           text not null default 'activa' check (estado in ('activa', 'canjeada', 'caducada', 'cancelada')),
  comprador        text,
  beneficiario     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, codigo),
  check (saldo <= monto_inicial)
);
create index on piefirme.gift_cards (organizacion_id, estado, caduca_el);

create table piefirme.gift_card_movimientos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  gift_card_id     uuid not null references piefirme.gift_cards(id) on delete cascade,
  tipo             text not null check (tipo in ('emision', 'canje', 'reversa', 'ajuste')),
  monto            numeric(14,2) not null,                    -- con signo: canje negativo, reversa positivo
  saldo_despues    numeric(14,2),
  venta_id         uuid,
  sede_id          uuid references piefirme.sedes(id),
  nota             text,
  usuario_id       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  check ((tipo = 'canje' and monto < 0) or (tipo in ('emision', 'reversa') and monto > 0) or tipo = 'ajuste')
);
create index on piefirme.gift_card_movimientos (organizacion_id, gift_card_id);

-- La emisión registra su movimiento; canje/reversa/ajuste actualizan el saldo (P-073: pasivo al vender, ingreso al canjear).
create or replace function piefirme_app.gift_card_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.gift_card_movimientos (organizacion_id, gift_card_id, tipo, monto, saldo_despues, venta_id, sede_id, nota)
  values (new.organizacion_id, new.id, 'emision', new.monto_inicial, new.saldo, new.venta_id, new.sede_venta_id, 'Emisión');
  return new;
end $$;
create trigger t_gift_ai after insert on piefirme.gift_cards for each row execute function piefirme_app.gift_card_ai();

create or replace function piefirme_app.gift_mov_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_gc piefirme.gift_cards%rowtype;
begin
  if new.tipo = 'emision' then return new; end if;     -- el saldo inicial ya está en la gift card
  select * into v_gc from piefirme.gift_cards where id = new.gift_card_id and organizacion_id = new.organizacion_id for update;
  if not found then raise exception 'gift card inexistente' using errcode = 'PF404'; end if;
  if new.tipo = 'canje' then
    if v_gc.estado <> 'activa' then raise exception 'la gift card no está activa (%)', v_gc.estado using errcode = 'PF409'; end if;
    if v_gc.caduca_el < piefirme_app.hoy_org(new.organizacion_id) then raise exception 'la gift card caducó el %', v_gc.caduca_el using errcode = 'PF409'; end if;
    if v_gc.saldo + new.monto < 0 then raise exception 'saldo insuficiente en la gift card' using errcode = 'PF409'; end if;
  end if;
  update piefirme.gift_cards
     set saldo = saldo + new.monto,
         estado = case when saldo + new.monto = 0 then 'canjeada'
                       when estado = 'canjeada' and saldo + new.monto > 0 then 'activa' else estado end
   where id = v_gc.id;
  new.saldo_despues := v_gc.saldo + new.monto;
  return new;
end $$;
create trigger t_gift_mov_bi before insert on piefirme.gift_card_movimientos for each row execute function piefirme_app.gift_mov_bi();

-- ───────────────────────────── uso de promoción (E76) ─────────────────────────────
create table piefirme.usos_promocion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  oferta_id        uuid not null references piefirme.ofertas(id),
  venta_id         uuid,                                      -- FK en 026
  venta_linea_id   uuid,
  paciente_id      uuid references piefirme.pacientes(id),
  sede_id          uuid references piefirme.sedes(id),
  monto_descuento  numeric(14,2) not null check (monto_descuento >= 0),
  motivo           text,                                      -- cortesía, promoción, cliente frecuente, otro
  autorizo_id      uuid references piefirme.perfiles(id),
  reversado        boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (venta_linea_id)
);
create index on piefirme.usos_promocion (organizacion_id, oferta_id);

-- P-074: vigencia y límite de usos; los usos se cuentan por clínica.
create or replace function piefirme_app.uso_promocion_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_of piefirme.ofertas%rowtype; v_hoy date := piefirme_app.hoy_org(new.organizacion_id);
begin
  select * into v_of from piefirme.ofertas where id = new.oferta_id and organizacion_id = new.organizacion_id for update;
  if v_of.tipo <> 'promocion' then raise exception 'la oferta no es una promoción' using errcode = 'PF409'; end if;
  if v_of.estado <> 'activa' or v_of.vigente_desde > v_hoy or v_of.vigente_hasta < v_hoy then
    raise exception 'la promoción no está vigente' using errcode = 'PF409';
  end if;
  if v_of.limite_usos is not null and v_of.usos >= v_of.limite_usos then
    raise exception 'la promoción alcanzó su límite de usos' using errcode = 'PF409';
  end if;
  if cardinality(v_of.sedes_aplica) > 0 and new.sede_id is not null and not (new.sede_id = any (v_of.sedes_aplica)) then
    raise exception 'la promoción no aplica en esta sede' using errcode = 'PF409';
  end if;
  update piefirme.ofertas set usos = usos + 1 where id = v_of.id;
  return new;
end $$;
create trigger t_uso_promo_bi before insert on piefirme.usos_promocion for each row execute function piefirme_app.uso_promocion_bi();

-- ───────────────────────────── RLS (MATRIZ_ROLES 4.2: Administrador edita; Recepción vende; Podólogo ve) ─────────────────────────────
select piefirme_app.crear_politicas('ofertas',            null, array['administrador'], array['administrador'], 'no');
select piefirme_app.crear_politicas('oferta_componentes', null, array['administrador'], array['administrador'], 'no');
select piefirme_app.crear_politicas('planes_adquiridos',  null, array['administrador', 'recepcion'], '{}'::text[], 'no');   -- un plan sirve en otras sedes (P-071)
select piefirme_app.crear_politicas('plan_sesiones_consumo', null, array['administrador'], '{}'::text[], 'no');            -- el consumo normal lo registra la cita atendida (definer)
select piefirme_app.crear_politicas('membresias_paciente', null, array['administrador', 'recepcion'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('gift_cards',        null, array['administrador', 'recepcion'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('gift_card_movimientos', null, array['administrador', 'recepcion'], '{}'::text[], 'nula');
select piefirme_app.crear_politicas('usos_promocion',    null, array['administrador', 'recepcion'], '{}'::text[], 'nula');

select piefirme_app.b_triggers('ofertas');
select piefirme_app.b_triggers('oferta_componentes', false);
select piefirme_app.b_triggers('planes_adquiridos');
select piefirme_app.b_triggers('plan_sesiones_consumo');
select piefirme_app.b_triggers('membresias_paciente');
select piefirme_app.b_triggers('gift_cards');
select piefirme_app.b_triggers('gift_card_movimientos');
select piefirme_app.b_triggers('usos_promocion');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_ofertas with (security_invoker = true) as
select o.*,
       piefirme.precio_vigente('oferta', o.id, null) as precio_lista,
       case when o.estado in ('activa', 'programada') and o.vigente_hasta is not null and o.vigente_hasta < current_date then 'vencida'
            when o.estado = 'programada' and o.vigente_desde <= current_date then 'activa'
            else o.estado end as estado_efectivo,
       (select coalesce(sum(c.cantidad * coalesce(c.precio_lista, 0)), 0) from piefirme.oferta_componentes c where c.oferta_id = o.id) as suma_componentes,
       (select count(*) from piefirme.planes_adquiridos pa where pa.oferta_id = o.id) as vendidos,
       (select count(*) from piefirme.planes_adquiridos pa where pa.oferta_id = o.id and pa.estado = 'vigente') as activos
  from piefirme.ofertas o;

create or replace view piefirme.prp_planes_adquiridos with (security_invoker = true) as
select pa.*, o.nombre as oferta_nombre, o.servicio_base_id,
       pa.sesiones_total - pa.sesiones_usadas as sesiones_saldo,
       (pa.caduca_el - current_date) as dias_para_caducar,
       (pa.estado = 'vigente' and pa.caduca_el - current_date <= 30) as por_caducar
  from piefirme.planes_adquiridos pa join piefirme.ofertas o on o.id = pa.oferta_id;

create or replace view piefirme.prp_gift_cards with (security_invoker = true) as
select g.*, (g.estado = 'activa' and g.caduca_el < current_date) as vencida_sin_marcar
  from piefirme.gift_cards g;

create or replace view piefirme.prp_membresias with (security_invoker = true) as
select m.*, o.nombre as oferta_nombre, (m.vencimiento - current_date) as dias_para_vencer
  from piefirme.membresias_paciente m join piefirme.ofertas o on o.id = m.oferta_id;

grant execute on function piefirme_app.codigo_gift_card() to authenticated;
