-- 026 · Caja y ventas: turnos de caja, movimientos de caja, ventas/tickets con líneas y pagos por método, descuentos con PIN,
-- cancelación y reimpresión de ticket, devoluciones, corte de caja con tolerancia, y altas de planes/gift cards/membresías al cobrar.
-- Reglas: P-055 (descuentos), P-056/P-057 (IVA y redondeo), P-058/P-059 (turno y corte), P-060 (cancelar/reimprimir), P-065, P-071, P-073,
-- P-074, P-078 (quién cobra y quién vende), P-085. Estados: MODELO_ESTADOS S12, S13. MATRIZ_ROLES 4.2.
-- Dependencias: 001, 010, 020..025. Inventario (C) y comisiones (D) leen ventas/venta_lineas.estado sin que esta migración los toque.

-- ───────────────────────────── turnos de caja (E80) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.turnos_caja (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id               uuid not null references piefirme.sedes(id),
  caja                  text not null default 'Caja 1',
  nombre_turno          text,                                   -- matutino, vespertino…
  cajero_id             uuid not null references piefirme.perfiles(id) default auth.uid(),
  apertura_en           timestamptz not null default now(),
  fondo_inicial         numeric(14,2) not null default 0 check (fondo_inicial >= 0),
  estado                text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'revisado')),
  cierre_en             timestamptz,
  efectivo_esperado     numeric(14,2),
  efectivo_contado      numeric(14,2),
  diferencia            numeric(14,2),
  justificacion         text,
  autorizacion_id       uuid references piefirme.autorizaciones_admin(id),   -- diferencia > tolerancia
  cerrado_por           uuid references piefirme.perfiles(id) on delete set null,
  revisado_por          uuid references piefirme.perfiles(id) on delete set null,
  revisado_en           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index turnos_una_abierta_por_caja on piefirme.turnos_caja (sede_id, caja) where estado = 'abierto';      -- P-058: un turno por caja…
create unique index turnos_un_abierto_por_cajero on piefirme.turnos_caja (sede_id, cajero_id) where estado = 'abierto';  -- …y por cajero
create index on piefirme.turnos_caja (organizacion_id, sede_id, apertura_en desc);

create or replace function piefirme_app.turno_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
      raise exception 'sede de otra clínica' using errcode = 'PF403';
    end if;
    if auth.uid() is not null and new.cajero_id <> auth.uid() and not piefirme_app.es_admin() then
      raise exception 'solo puede abrir su propio turno' using errcode = 'PF403';
    end if;
    new.estado := 'abierto';
  else
    if old.estado = 'abierto' and new.estado <> 'abierto' and coalesce(current_setting('app.cerrando', true), '') <> 'on' then
      raise exception 'un turno se cierra con piefirme.cerrar_turno()' using errcode = 'PF409';
    end if;
    if old.estado <> 'abierto' and not (old.estado = 'cerrado' and new.estado = 'revisado') then
      raise exception 'un turno cerrado es de solo lectura (P-099)' using errcode = 'PF409';
    end if;
    if new.estado = 'revisado' then
      if not (piefirme_app.es_admin() or auth.uid() is null) then raise exception 'la revisión del turno es del administrador' using errcode = 'PF403'; end if;
      new.revisado_por := coalesce(new.revisado_por, auth.uid()); new.revisado_en := coalesce(new.revisado_en, now());
    end if;
  end if;
  return new;
end $$;
create trigger t_turno_bi before insert or update on piefirme.turnos_caja for each row execute function piefirme_app.turno_bi();

-- ───────────────────────────── movimientos de caja (E82) ─────────────────────────────
create table piefirme.movimientos_caja (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid not null references piefirme.sedes(id),
  turno_id          uuid not null references piefirme.turnos_caja(id),
  tipo              text not null check (tipo in ('retiro', 'gasto', 'devolucion', 'deposito')),
  monto             numeric(14,2) not null check (monto > 0),
  concepto          text not null,
  venta_id          uuid,                       -- FK abajo
  nota_credito_id   uuid,                       -- FK en 027
  gasto_id          uuid,                       -- gasto del dominio C; referencia lógica (¿se registra como gasto? P-093)
  autorizacion_id   uuid references piefirme.autorizaciones_admin(id),
  created_by        uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index on piefirme.movimientos_caja (organizacion_id, turno_id);

create or replace function piefirme_app.movimiento_caja_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t piefirme.turnos_caja%rowtype;
begin
  select * into t from piefirme.turnos_caja where id = new.turno_id;
  if not found or t.organizacion_id <> new.organizacion_id then raise exception 'turno inexistente' using errcode = 'PF404'; end if;
  if t.estado <> 'abierto' then raise exception 'el turno está cerrado: el ajuste va en el siguiente periodo (P-099)' using errcode = 'PF409'; end if;
  new.sede_id := t.sede_id;
  return new;
end $$;
create trigger t_mov_caja_bi before insert on piefirme.movimientos_caja for each row execute function piefirme_app.movimiento_caja_bi();

-- ───────────────────────────── ventas / tickets (E77) ─────────────────────────────
create table piefirme.ventas (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                  uuid not null references piefirme.sedes(id),
  folio                    text,                                         -- {SEDE}-TKT-{NNNNNN}
  origen                   text not null default 'cobro_cita' check (origen in ('cobro_cita', 'mostrador', 'paquete_plan_giftcard')),
  cita_id                  uuid references piefirme.citas(id),
  paciente_id              uuid references piefirme.pacientes(id),          -- null = público en general (venta de mostrador)
  podologo_id              uuid references piefirme.perfiles(id),           -- quien atendió
  turno_id                 uuid references piefirme.turnos_caja(id),        -- se asigna al cobrar
  cajero_id                uuid references piefirme.perfiles(id),
  estado                   text not null default 'por_cobrar' check (estado in ('por_cobrar', 'cuenta_abierta', 'cobrada', 'por_facturar', 'facturada', 'cancelada')),
  requiere_factura         boolean not null default false,
  subtotal                 numeric(14,2) not null default 0,              -- suma de importes brutos (IVA incluido)
  descuento_total          numeric(14,2) not null default 0,
  iva_total                numeric(14,2) not null default 0,              -- IVA incluido en el total
  total                    numeric(14,2) not null default 0 check (total >= 0),
  anticipo_aplicado        numeric(14,2) not null default 0,
  pagado_total             numeric(14,2) not null default 0,
  saldo                    numeric(14,2) not null default 0,
  descuento_global_tipo    text check (descuento_global_tipo in ('pct', 'monto')),
  descuento_global_valor   numeric(14,2),
  descuento_motivo         text,
  autorizacion_descuento_id uuid references piefirme.autorizaciones_admin(id),
  qr_token                 text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),   -- QR del ticket para facturar
  cobrada_en               timestamptz,
  copias_impresas          integer not null default 0,
  factura_id               uuid,                                         -- FK en 027
  cancelada_en             timestamptz,
  cancelada_por            uuid references piefirme.perfiles(id) on delete set null,
  cancelada_turno_id       uuid references piefirme.turnos_caja(id),
  motivo_cancelacion       text,
  nota                     text,
  created_by               uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (estado <> 'cancelada' or motivo_cancelacion is not null),
  check (estado not in ('cobrada', 'por_facturar', 'facturada') or (cobrada_en is not null and turno_id is not null)),
  check (requiere_factura or estado not in ('por_facturar', 'facturada'))
);
create unique index ventas_una_por_cita on piefirme.ventas (cita_id) where cita_id is not null and estado <> 'cancelada';
create index on piefirme.ventas (organizacion_id, sede_id, created_at desc);
create index on piefirme.ventas (organizacion_id, turno_id);
create index on piefirme.ventas (organizacion_id, paciente_id);
create index on piefirme.ventas (organizacion_id, estado) where estado in ('por_cobrar', 'cuenta_abierta', 'por_facturar');

alter table piefirme.movimientos_caja add constraint mov_caja_venta_fk foreign key (venta_id) references piefirme.ventas(id);

create or replace function piefirme_app.venta_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.citas%rowtype; v_ok boolean; v_priv boolean := (auth.uid() is null or piefirme_app.es_admin());
begin
  if tg_op = 'INSERT' then
    if new.cita_id is not null then
      select * into c from piefirme.citas where id = new.cita_id and organizacion_id = new.organizacion_id;
      if not found then raise exception 'cita inexistente' using errcode = 'PF404'; end if;
      new.sede_id := c.sede_id; new.paciente_id := coalesce(new.paciente_id, c.paciente_id);
      new.podologo_id := coalesce(new.podologo_id, c.atendio_id, c.podologo_id); new.origen := 'cobro_cita';
    end if;
    if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
      raise exception 'sede de otra clínica' using errcode = 'PF403';
    end if;
    if new.paciente_id is not null and not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'paciente de otra clínica' using errcode = 'PF403';
    end if;
    if new.folio is null then new.folio := piefirme_app.siguiente_folio_comercial(new.sede_id, 'TKT'); end if;
    if auth.uid() is not null and new.estado not in ('por_cobrar', 'cuenta_abierta') then
      raise exception 'un ticket nace por cobrar o como cuenta abierta' using errcode = 'PF409';
    end if;
    if piefirme_app.rol() = 'podologo' then new.estado := 'por_cobrar'; new.podologo_id := auth.uid(); end if;   -- «Enviar a caja» (P-078)
  else
    -- el dinero de un ticket cerrado no cambia (los recálculos internos corren a profundidad > 1)
    if old.estado in ('cobrada', 'por_facturar', 'facturada', 'cancelada') and pg_trigger_depth() = 1
       and (new.total is distinct from old.total or new.subtotal is distinct from old.subtotal or new.iva_total is distinct from old.iva_total
            or new.paciente_id is distinct from old.paciente_id or new.sede_id is distinct from old.sede_id or new.cita_id is distinct from old.cita_id
            or new.turno_id is distinct from old.turno_id or new.folio is distinct from old.folio) then
      raise exception 'un ticket cobrado no cambia de importes ni de cliente: cancélalo o emite nota de crédito' using errcode = 'PF409';
    end if;
    if new.estado is distinct from old.estado then
      v_ok := (old.estado = 'por_cobrar'     and new.estado in ('cuenta_abierta', 'cobrada', 'por_facturar', 'cancelada'))
           or (old.estado = 'cuenta_abierta' and new.estado in ('por_cobrar', 'cobrada', 'por_facturar', 'cancelada'))
           or (old.estado = 'cobrada'        and new.estado in ('por_facturar', 'cancelada'))
           or (old.estado = 'por_facturar'   and new.estado in ('facturada', 'cobrada', 'cancelada'))
           or (old.estado = 'facturada'      and new.estado = 'por_facturar');
      if not v_ok then raise exception 'transición de ticket no permitida: % → %', old.estado, new.estado using errcode = 'PF409'; end if;
      if new.estado = 'cancelada' then
        if coalesce(btrim(new.motivo_cancelacion), '') = '' then raise exception 'la cancelación exige motivo' using errcode = 'PF400'; end if;
        new.cancelada_en := now(); new.cancelada_por := coalesce(new.cancelada_por, auth.uid());
      end if;
    end if;
    if new.descuento_global_valor is distinct from old.descuento_global_valor and old.estado not in ('por_cobrar', 'cuenta_abierta') and not v_priv then
      raise exception 'ticket cerrado' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_venta_bi before insert or update on piefirme.ventas for each row execute function piefirme_app.venta_bi();

-- ───────────────────────────── líneas de venta (E78) ─────────────────────────────
create table piefirme.venta_lineas (
  id                        uuid primary key default gen_random_uuid(),
  organizacion_id           uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                   uuid not null references piefirme.sedes(id),
  venta_id                  uuid not null references piefirme.ventas(id) on delete cascade,
  orden                     integer not null default 0,
  tipo                      text not null check (tipo in ('servicio', 'producto', 'plan', 'paquete', 'gift_card', 'membresia')),
  servicio_id               uuid references piefirme.servicios(id),
  producto_id               uuid references piefirme.productos(id),
  oferta_id                 uuid references piefirme.ofertas(id),
  plan_adquirido_id         uuid references piefirme.planes_adquiridos(id),   -- sesión que consume saldo de un plan
  promocion_id              uuid references piefirme.ofertas(id),
  lote_id                   uuid,                                           -- lote de inventario (dominio C); referencia lógica
  descripcion               text,
  atendio_id                uuid references piefirme.perfiles(id),            -- «Atendió / vendió»: base de comisión
  cantidad                  numeric(12,3) not null default 1 check (cantidad > 0),
  precio_unitario           numeric(14,2) not null default 0 check (precio_unitario >= 0),   -- con IVA incluido, congelado
  tipo_precio               text not null default 'fijo' check (tipo_precio in ('fijo', 'incluido', 'saldo_plan', 'cortesia')),
  descuento_pct             numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  descuento_monto           numeric(14,2) not null default 0 check (descuento_monto >= 0),
  descuento_motivo          text,
  autorizacion_descuento_id uuid references piefirme.autorizaciones_admin(id),
  importe_bruto             numeric(14,2) not null default 0,
  descuento                 numeric(14,2) not null default 0,
  importe                   numeric(14,2) not null default 0 check (importe >= 0),   -- bruto − descuento (IVA incluido)
  iva_tipo                  text not null check (iva_tipo in ('exento', '16', 'tasa0')),
  base_neta                 numeric(14,2) not null default 0,                -- P-057: IVA sobre la base neta de cada línea
  iva_monto                 numeric(14,2) not null default 0,
  clave_sat                 text,
  unidad_sat                text,
  renglon_edr               text,
  created_at                timestamptz not null default now(),
  check ((tipo = 'servicio' and servicio_id is not null) or (tipo = 'producto' and producto_id is not null)
      or (tipo in ('plan', 'paquete', 'gift_card', 'membresia') and oferta_id is not null))
);
create index on piefirme.venta_lineas (organizacion_id, venta_id);
create index on piefirme.venta_lineas (organizacion_id, producto_id) where producto_id is not null;
create index on piefirme.venta_lineas (organizacion_id, atendio_id);

-- precio vigente de cualquier ítem (definer, para triggers)
create or replace function piefirme_app.precio_item(p_org uuid, p_tipo text, p_item uuid, p_sede uuid) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select pr.precio from piefirme.precios pr
   where pr.organizacion_id = p_org and pr.item_tipo = p_tipo and coalesce(pr.servicio_id, pr.producto_id, pr.oferta_id) = p_item
     and (pr.sede_id = p_sede or pr.sede_id is null)
     and pr.vigente_desde <= piefirme_app.hoy_org(p_org) and (pr.vigente_hasta is null or pr.vigente_hasta >= piefirme_app.hoy_org(p_org))
   order by (pr.sede_id is not null) desc, pr.vigente_desde desc limit 1
$$;

create or replace function piefirme_app.venta_linea_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v piefirme.ventas%rowtype; sv piefirme.servicios%rowtype; pd piefirme.productos%rowtype;
  v_pct_ef numeric; v_max numeric; a piefirme.autorizaciones_admin%rowtype;
begin
  select * into v from piefirme.ventas where id = new.venta_id;
  if not found or v.organizacion_id <> new.organizacion_id then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado not in ('por_cobrar', 'cuenta_abierta') then
    raise exception 'el ticket % ya no admite cambios', v.estado using errcode = 'PF409';
  end if;
  new.sede_id := v.sede_id;
  -- ítem, precio congelado e IVA por concepto (P-056)
  if new.tipo = 'servicio' then
    select * into sv from piefirme.servicios where id = new.servicio_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'servicio inexistente' using errcode = 'PF404'; end if;
    new.descripcion := coalesce(new.descripcion, sv.nombre);
    new.iva_tipo := coalesce(new.iva_tipo, sv.iva_tipo);
    new.clave_sat := coalesce(new.clave_sat, sv.clave_sat); new.unidad_sat := coalesce(new.unidad_sat, sv.unidad_sat); new.renglon_edr := coalesce(new.renglon_edr, sv.renglon_edr);
    if tg_op = 'INSERT' and new.precio_unitario = 0 and new.tipo_precio = 'fijo' then
      if v.cita_id is not null then select precio_servicio into new.precio_unitario from piefirme.citas where id = v.cita_id and servicio_id = new.servicio_id;
      end if;
      if coalesce(new.precio_unitario, 0) = 0 and new.plan_adquirido_id is null then new.precio_unitario := coalesce(piefirme_app.precio_item(new.organizacion_id, 'servicio', sv.id, v.sede_id), 0); end if;
    end if;
  elsif new.tipo = 'producto' then
    select * into pd from piefirme.productos where id = new.producto_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'producto inexistente' using errcode = 'PF404'; end if;
    new.descripcion := coalesce(new.descripcion, pd.nombre);
    new.iva_tipo := coalesce(new.iva_tipo, pd.iva_tipo);
    new.clave_sat := coalesce(new.clave_sat, pd.clave_sat); new.unidad_sat := coalesce(new.unidad_sat, pd.unidad_sat); new.renglon_edr := coalesce(new.renglon_edr, pd.renglon_edr);
    if tg_op = 'INSERT' and new.precio_unitario = 0 and new.tipo_precio = 'fijo' then
      new.precio_unitario := coalesce(piefirme_app.precio_item(new.organizacion_id, 'producto', pd.id, v.sede_id), 0);
    end if;
  else
    new.descripcion := coalesce(new.descripcion, (select nombre from piefirme.ofertas where id = new.oferta_id));
    new.iva_tipo := coalesce(new.iva_tipo, 'exento');
    if tg_op = 'INSERT' and new.precio_unitario = 0 and new.tipo_precio = 'fijo' then
      new.precio_unitario := coalesce(piefirme_app.precio_item(new.organizacion_id, 'oferta', new.oferta_id, v.sede_id), 0);
    end if;
  end if;
  if new.plan_adquirido_id is not null then new.tipo_precio := 'saldo_plan'; new.precio_unitario := 0; end if;   -- las curaciones/sesiones de plan van a $0 (P-027)
  new.atendio_id := coalesce(new.atendio_id, v.podologo_id);

  -- importes a 2 decimales, redondeo comercial (round de numeric); IVA sobre la base neta de la línea (P-057)
  new.importe_bruto := round(new.cantidad * new.precio_unitario, 2);
  new.descuento := least(new.importe_bruto, round(new.importe_bruto * new.descuento_pct / 100, 2) + new.descuento_monto);
  new.importe := new.importe_bruto - new.descuento;
  if new.iva_tipo = '16' then new.base_neta := round(new.importe / 1.16, 2); new.iva_monto := new.importe - new.base_neta;
  else new.base_neta := new.importe; new.iva_monto := 0; end if;

  -- descuentos (P-055): motivo obligatorio; Recepción hasta el % configurado; arriba, autorización con PIN de Administrador
  if new.descuento > 0 then
    if coalesce(btrim(new.descuento_motivo), '') = '' then raise exception 'todo descuento exige motivo' using errcode = 'PF400'; end if;
    if piefirme_app.rol() = 'podologo' then raise exception 'el podólogo no aplica descuentos' using errcode = 'PF403'; end if;
    v_pct_ef := case when new.importe_bruto > 0 then new.descuento / new.importe_bruto * 100 else 0 end;
    v_max := piefirme_app.param_num(new.organizacion_id, 'descuento_recepcion_max_pct', 10);
    if auth.uid() is not null and not piefirme_app.es_admin() and v_pct_ef > v_max + 0.005 then
      select * into a from piefirme.autorizaciones_admin where id = new.autorizacion_descuento_id;
      if not found or a.organizacion_id <> new.organizacion_id or a.tipo <> 'descuento' or a.vigente_hasta < now()
         or a.solicitante_id <> auth.uid() or coalesce(a.pct_max, 0) + 0.005 < v_pct_ef then
        raise exception 'descuento_requiere_pin: más de % %% exige autorización del administrador', v_max using errcode = 'PF403';
      end if;
    end if;
  end if;
  -- P-073: la gift card no se combina con promociones
  if new.promocion_id is not null and exists (select 1 from piefirme.pagos p where p.venta_id = new.venta_id and p.metodo = 'gift_card') then
    raise exception 'las gift cards no se combinan con promociones' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_venta_linea_bi before insert or update on piefirme.venta_lineas for each row execute function piefirme_app.venta_linea_bi();

-- ───────────────────────────── pagos de la venta (E79) ─────────────────────────────
create table piefirme.pagos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id            uuid not null references piefirme.sedes(id),
  venta_id           uuid not null references piefirme.ventas(id) on delete cascade,
  metodo             text not null check (metodo in ('efectivo', 'tarjeta', 'transferencia', 'clip', 'gift_card', 'cortesia', 'anticipo')),
  monto              numeric(14,2) not null check (monto > 0),
  referencia         text,                            -- autorización, clave de rastreo, motivo de cortesía…
  ultimos4           text check (ultimos4 is null or ultimos4 ~ '^[0-9]{4}$'),
  efectivo_recibido  numeric(14,2),
  cambio             numeric(14,2),
  gift_card_id       uuid references piefirme.gift_cards(id),
  anticipo_id        uuid references piefirme.anticipos(id),
  pago_clip_id       uuid references piefirme.pagos_clip(id),
  created_by         uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  check (metodo <> 'gift_card' or gift_card_id is not null),
  check (metodo <> 'anticipo' or anticipo_id is not null),
  check (metodo <> 'efectivo' or efectivo_recibido is null or efectivo_recibido >= monto),
  check (metodo <> 'cortesia' or coalesce(btrim(referencia), '') <> '')
);
create index on piefirme.pagos (organizacion_id, venta_id);
create index on piefirme.pagos (organizacion_id, sede_id, metodo, created_at);

create or replace function piefirme_app.venta_pago_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; g piefirme.gift_cards%rowtype; a piefirme.anticipos%rowtype; t piefirme.turnos_caja%rowtype; v_suma numeric;
begin
  select * into v from piefirme.ventas where id = new.venta_id for update;
  if not found or v.organizacion_id <> new.organizacion_id then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado not in ('por_cobrar', 'cuenta_abierta') then raise exception 'el ticket % ya no admite pagos', v.estado using errcode = 'PF409'; end if;
  new.sede_id := v.sede_id;
  if auth.uid() is not null then
    select * into t from piefirme.turnos_caja where sede_id = v.sede_id and cajero_id = auth.uid() and estado = 'abierto';
    if not found then raise exception 'sin turno de caja abierto en la sede' using errcode = 'PF409'; end if;
  end if;
  if new.metodo = 'cortesia' and not (auth.uid() is null or piefirme_app.es_admin()) then
    raise exception 'la cortesía la autoriza el administrador' using errcode = 'PF403';
  end if;
  if new.metodo = 'efectivo' and new.efectivo_recibido is not null then new.cambio := new.efectivo_recibido - new.monto; end if;
  if new.metodo = 'gift_card' then
    if exists (select 1 from piefirme.venta_lineas l where l.venta_id = new.venta_id and l.promocion_id is not null) then
      raise exception 'las gift cards no se combinan con promociones' using errcode = 'PF409';
    end if;
    select * into g from piefirme.gift_cards where id = new.gift_card_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'gift card inexistente' using errcode = 'PF404'; end if;
    insert into piefirme.gift_card_movimientos (organizacion_id, gift_card_id, tipo, monto, venta_id, sede_id, nota)
    values (new.organizacion_id, g.id, 'canje', -new.monto, v.id, v.sede_id, 'Canje en ' || coalesce(v.folio, ''));
  end if;
  if new.metodo = 'anticipo' then
    select * into a from piefirme.anticipos where id = new.anticipo_id and organizacion_id = new.organizacion_id for update;
    if not found or a.estado <> 'pagado' then raise exception 'el anticipo no está disponible para aplicar' using errcode = 'PF409'; end if;
    if v.paciente_id is not null and a.paciente_id <> v.paciente_id then raise exception 'el anticipo es de otro paciente' using errcode = 'PF409'; end if;
    if new.monto > a.monto then raise exception 'el monto excede el anticipo' using errcode = 'PF409'; end if;
    new.monto := a.monto;
    update piefirme.anticipos set estado = 'aplicado', venta_id = v.id where id = a.id;
  end if;
  select coalesce(sum(monto), 0) + new.monto into v_suma from piefirme.pagos where venta_id = new.venta_id;
  if v_suma > v.total then raise exception 'los pagos (%) exceden el total del ticket (%)', v_suma, v.total using errcode = 'PF409'; end if;
  return new;
end $$;
create trigger t_venta_pago_bi before insert on piefirme.pagos for each row execute function piefirme_app.venta_pago_bi();

alter table piefirme.pagos_clip add constraint pagos_clip_venta_pago_fk foreign key (venta_pago_id) references piefirme.pagos(id);

-- Recalcula totales (profundidad > 1: pasa la guarda de ventas cobradas)
create or replace function piefirme_app.venta_recalcular() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := coalesce(new.venta_id, old.venta_id);
begin
  update piefirme.ventas v set
    subtotal = coalesce((select sum(importe_bruto) from piefirme.venta_lineas where venta_id = v_id), 0),
    descuento_total = coalesce((select sum(descuento) from piefirme.venta_lineas where venta_id = v_id), 0),
    iva_total = coalesce((select sum(iva_monto) from piefirme.venta_lineas where venta_id = v_id), 0),
    total = coalesce((select sum(importe) from piefirme.venta_lineas where venta_id = v_id), 0),
    anticipo_aplicado = coalesce((select sum(monto) from piefirme.pagos where venta_id = v_id and metodo = 'anticipo'), 0),
    pagado_total = coalesce((select sum(monto) from piefirme.pagos where venta_id = v_id), 0)
   where v.id = v_id;
  update piefirme.ventas set saldo = total - pagado_total where id = v_id;
  return null;
end $$;
create trigger t_venta_recalc_l after insert or update or delete on piefirme.venta_lineas for each row execute function piefirme_app.venta_recalcular();
create trigger t_venta_recalc_p after insert on piefirme.pagos for each row execute function piefirme_app.venta_recalcular();

-- Los pagos y líneas de un ticket cobrado son evidencia
create or replace function piefirme_app.venta_hijo_inmutable() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_est text;
begin
  select estado into v_est from piefirme.ventas where id = coalesce(old.venta_id, new.venta_id);
  if tg_table_name = 'pagos' then raise exception 'los pagos registrados no se modifican ni se borran: cancele el ticket' using errcode = 'PF409'; end if;
  if v_est in ('cobrada', 'por_facturar', 'facturada', 'cancelada') then raise exception 'el ticket % es de solo lectura', v_est using errcode = 'PF409'; end if;
  return coalesce(new, old);
end $$;
create trigger t_venta_pago_inm before update or delete on piefirme.pagos for each row execute function piefirme_app.venta_hijo_inmutable();
create trigger t_venta_linea_inm before delete on piefirme.venta_lineas for each row execute function piefirme_app.venta_hijo_inmutable();

-- ───────────────────────────── FKs hacia el módulo de ventas desde 021 y 025 ─────────────────────────────
alter table piefirme.planes_adquiridos add constraint plan_adq_venta_fk foreign key (venta_id) references piefirme.ventas(id);
alter table piefirme.planes_adquiridos add constraint plan_adq_linea_fk foreign key (venta_linea_id) references piefirme.venta_lineas(id);
alter table piefirme.membresias_paciente add constraint membresia_venta_fk foreign key (venta_id) references piefirme.ventas(id);
alter table piefirme.gift_cards add constraint gift_card_venta_fk foreign key (venta_id) references piefirme.ventas(id);
alter table piefirme.gift_card_movimientos add constraint gift_mov_venta_fk foreign key (venta_id) references piefirme.ventas(id);
alter table piefirme.usos_promocion add constraint uso_promo_venta_fk foreign key (venta_id) references piefirme.ventas(id);
alter table piefirme.usos_promocion add constraint uso_promo_linea_fk foreign key (venta_linea_id) references piefirme.venta_lineas(id);
alter table piefirme.anticipos add constraint anticipo_venta_fk foreign key (venta_id) references piefirme.ventas(id);

-- ───────────────────────────── devoluciones (sin CFDI): P-065 ─────────────────────────────
create table piefirme.devoluciones_venta (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id               uuid not null references piefirme.sedes(id),
  venta_id              uuid not null references piefirme.ventas(id),
  venta_linea_id        uuid not null references piefirme.venta_lineas(id),
  cantidad              numeric(12,3) not null check (cantidad > 0),
  monto                 numeric(14,2) not null check (monto > 0),
  motivo                text not null check (length(btrim(motivo)) > 0),
  reingresa_inventario  boolean not null default false,     -- el dominio C lo lee para reingresar existencia
  movimiento_caja_id    uuid references piefirme.movimientos_caja(id),
  created_by            uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now()
);
create index on piefirme.devoluciones_venta (organizacion_id, venta_id);

create or replace function piefirme_app.devolucion_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l piefirme.venta_lineas%rowtype; v piefirme.ventas%rowtype; v_prev numeric;
begin
  select * into l from piefirme.venta_lineas where id = new.venta_linea_id and venta_id = new.venta_id;
  select * into v from piefirme.ventas where id = new.venta_id;
  if not found or l.id is null or v.organizacion_id <> new.organizacion_id then raise exception 'línea inexistente' using errcode = 'PF404'; end if;
  if v.estado not in ('cobrada', 'por_facturar') then raise exception 'solo se devuelve sobre tickets cobrados sin factura vigente' using errcode = 'PF409'; end if;
  select coalesce(sum(cantidad), 0) into v_prev from piefirme.devoluciones_venta where venta_linea_id = l.id;
  if v_prev + new.cantidad > l.cantidad then raise exception 'se devuelve más de lo vendido' using errcode = 'PF409'; end if;
  if new.monto > round(l.importe * new.cantidad / l.cantidad, 2) + 0.01 then raise exception 'el monto excede el importe de la línea' using errcode = 'PF409'; end if;
  new.sede_id := v.sede_id;
  return new;
end $$;
create trigger t_devolucion_bi before insert on piefirme.devoluciones_venta for each row execute function piefirme_app.devolucion_bi();

-- ───────────────────────────── cortes de caja (E81) ─────────────────────────────
create table piefirme.cortes_caja (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                 uuid not null references piefirme.sedes(id),
  turno_id                uuid not null unique references piefirme.turnos_caja(id),
  ventas_total            numeric(14,2) not null default 0,       -- devengado (P-059)
  cobros_total            numeric(14,2) not null default 0,       -- dinero recibido en el turno
  ventas_efectivo         numeric(14,2) not null default 0,
  ventas_tarjeta          numeric(14,2) not null default 0,
  ventas_transferencia    numeric(14,2) not null default 0,
  ventas_clip             numeric(14,2) not null default 0,
  ventas_gift_card        numeric(14,2) not null default 0,
  anticipos_aplicados     numeric(14,2) not null default 0,       -- no son dinero del turno
  cortesias               numeric(14,2) not null default 0,
  retiros                 numeric(14,2) not null default 0,
  cancelaciones_efectivo  numeric(14,2) not null default 0,
  cancelaciones_total     numeric(14,2) not null default 0,
  numero_cancelaciones    integer not null default 0,
  fondo_inicial           numeric(14,2) not null default 0,
  efectivo_esperado       numeric(14,2) not null,                 -- fondo + efectivo − retiros − cancelaciones en efectivo
  efectivo_contado        numeric(14,2) not null,
  diferencia              numeric(14,2) not null,
  justificacion           text,
  autorizacion_id         uuid references piefirme.autorizaciones_admin(id),
  cerrado_por             uuid references piefirme.perfiles(id) on delete set null,
  created_at              timestamptz not null default now()
);
create index on piefirme.cortes_caja (organizacion_id, sede_id, created_at desc);

-- Cierra el turno y genera el corte. Diferencia ≤ tolerancia: la justifica el cajero; mayor: Administrador (o su autorización con PIN).
create or replace function piefirme.cerrar_turno(p_turno uuid, p_efectivo_contado numeric, p_justificacion text default null, p_autorizacion uuid default null)
returns uuid language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  t piefirme.turnos_caja%rowtype; c piefirme.cortes_caja%rowtype; v_tol numeric; v_id uuid;
  v_ef numeric; v_tar numeric; v_tra numeric; v_clip numeric; v_gc numeric; v_ant numeric; v_cor numeric; v_ret numeric; v_cancel_ef numeric;
  v_cancel_tot numeric; v_cancel_n integer; v_vtot numeric; v_esp numeric; v_dif numeric; a piefirme.autorizaciones_admin%rowtype;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso para cerrar caja' using errcode = 'PF403'; end if;
  select * into t from piefirme.turnos_caja where id = p_turno for update;
  if not found then raise exception 'turno inexistente' using errcode = 'PF404'; end if;
  if t.estado <> 'abierto' then raise exception 'el turno ya está cerrado' using errcode = 'PF409'; end if;
  if t.cajero_id <> auth.uid() and not piefirme_app.es_admin() then raise exception 'solo el cajero del turno o un administrador lo cierra' using errcode = 'PF403'; end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 then raise exception 'indica el efectivo contado' using errcode = 'PF400'; end if;
  v_tol := piefirme_app.param_num(t.organizacion_id, 'tolerancia_corte_mxn', 50);

  select coalesce(sum(vp.monto) filter (where vp.metodo = 'efectivo'), 0), coalesce(sum(vp.monto) filter (where vp.metodo = 'tarjeta'), 0),
         coalesce(sum(vp.monto) filter (where vp.metodo = 'transferencia'), 0), coalesce(sum(vp.monto) filter (where vp.metodo = 'clip'), 0),
         coalesce(sum(vp.monto) filter (where vp.metodo = 'gift_card'), 0), coalesce(sum(vp.monto) filter (where vp.metodo = 'anticipo'), 0),
         coalesce(sum(vp.monto) filter (where vp.metodo = 'cortesia'), 0)
    into v_ef, v_tar, v_tra, v_clip, v_gc, v_ant, v_cor
    from piefirme.pagos vp join piefirme.ventas v on v.id = vp.venta_id
   where v.turno_id = t.id;      -- incluye cancelados: su reverso entra en cancelaciones
  select coalesce(sum(vp.monto) filter (where vp.metodo = 'efectivo'), 0), coalesce(sum(distinct 0), 0)
    into v_cancel_ef, v_cancel_tot
    from piefirme.pagos vp join piefirme.ventas v on v.id = vp.venta_id where v.cancelada_turno_id = t.id;
  select coalesce(sum(v.total), 0), count(*) into v_cancel_tot, v_cancel_n from piefirme.ventas v where v.cancelada_turno_id = t.id;
  select coalesce(sum(m.monto), 0) into v_ret from piefirme.movimientos_caja m where m.turno_id = t.id and m.tipo in ('retiro', 'gasto', 'devolucion');
  v_ret := v_ret - coalesce((select sum(m.monto) from piefirme.movimientos_caja m where m.turno_id = t.id and m.tipo = 'deposito'), 0);
  select coalesce(sum(v.total), 0) into v_vtot from piefirme.ventas v where v.turno_id = t.id and v.estado <> 'cancelada';

  v_esp := t.fondo_inicial + v_ef - v_ret - v_cancel_ef;
  v_dif := round(p_efectivo_contado - v_esp, 2);
  if v_dif <> 0 and coalesce(btrim(p_justificacion), '') = '' then raise exception 'justifica la diferencia de caja' using errcode = 'PF400'; end if;
  if abs(v_dif) > v_tol and not piefirme_app.es_admin() then
    select * into a from piefirme.autorizaciones_admin where id = p_autorizacion;
    if not found or a.organizacion_id <> t.organizacion_id or a.tipo <> 'diferencia_corte' or a.vigente_hasta < now() or a.solicitante_id <> auth.uid() then
      raise exception 'diferencia_requiere_administrador: la diferencia (%) supera la tolerancia de %', v_dif, v_tol using errcode = 'PF403';
    end if;
  end if;

  perform set_config('app.cerrando', 'on', true);
  update piefirme.turnos_caja set estado = 'cerrado', cierre_en = now(), efectivo_esperado = v_esp, efectivo_contado = p_efectivo_contado,
         diferencia = v_dif, justificacion = p_justificacion, autorizacion_id = p_autorizacion, cerrado_por = auth.uid() where id = t.id;
  perform set_config('app.cerrando', 'off', true);

  insert into piefirme.cortes_caja (organizacion_id, sede_id, turno_id, ventas_total, cobros_total, ventas_efectivo, ventas_tarjeta, ventas_transferencia,
         ventas_clip, ventas_gift_card, anticipos_aplicados, cortesias, retiros, cancelaciones_efectivo, cancelaciones_total, numero_cancelaciones,
         fondo_inicial, efectivo_esperado, efectivo_contado, diferencia, justificacion, autorizacion_id, cerrado_por)
  values (t.organizacion_id, t.sede_id, t.id, v_vtot, v_ef + v_tar + v_tra + v_clip, v_ef, v_tar, v_tra, v_clip, v_gc, v_ant, v_cor, v_ret,
          v_cancel_ef, v_cancel_tot, v_cancel_n, t.fondo_inicial, v_esp, p_efectivo_contado, v_dif, p_justificacion, p_autorizacion, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function piefirme.revisar_turno(p_turno uuid) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'la revisión es del administrador' using errcode = 'PF403'; end if;
  update piefirme.turnos_caja set estado = 'revisado' where id = p_turno and estado = 'cerrado';
  if not found then raise exception 'el turno no está cerrado' using errcode = 'PF409'; end if;
end $$;

-- ───────────────────────────── cobrar, cancelar, descuento global, reimprimir ─────────────────────────────
create or replace function piefirme.cobrar_venta(p_venta uuid) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; t piefirme.turnos_caja%rowtype; l piefirme.venta_lineas%rowtype; o piefirme.ofertas%rowtype; v_pagado numeric; v_hoy date; i integer;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'siempre cobra caja (P-078)' using errcode = 'PF403'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado not in ('por_cobrar', 'cuenta_abierta') then raise exception 'el ticket ya está %', v.estado using errcode = 'PF409'; end if;
  if not exists (select 1 from piefirme.venta_lineas where venta_id = p_venta) then raise exception 'el ticket no tiene líneas' using errcode = 'PF409'; end if;
  select * into t from piefirme.turnos_caja where sede_id = v.sede_id and cajero_id = auth.uid() and estado = 'abierto';
  if not found then raise exception 'abra su turno de caja en esta sede' using errcode = 'PF409'; end if;
  select coalesce(sum(monto), 0) into v_pagado from piefirme.pagos where venta_id = p_venta;
  if v_pagado <> v.total then raise exception 'los pagos (%) no cubren el total (%)', v_pagado, v.total using errcode = 'PF409'; end if;
  v_hoy := piefirme_app.hoy_org(v.organizacion_id);
  for l in select * from piefirme.venta_lineas where venta_id = p_venta order by orden loop
    if l.tipo in ('plan', 'membresia') and v.paciente_id is null then raise exception 'los planes y membresías se venden a un paciente' using errcode = 'PF409'; end if;
    if l.oferta_id is not null then select * into o from piefirme.ofertas where id = l.oferta_id; end if;
    for i in 1..greatest(floor(l.cantidad)::int, 1) loop
      if l.tipo = 'gift_card' then
        insert into piefirme.gift_cards (organizacion_id, oferta_id, sede_venta_id, venta_id, monto_inicial, saldo, fecha_venta, caduca_el)
        values (v.organizacion_id, o.id, v.sede_id, v.id, coalesce(o.monto_saldo, l.importe), coalesce(o.monto_saldo, l.importe), v_hoy,
                (v_hoy + make_interval(months => coalesce(o.caducidad_meses, piefirme_app.param_num(v.organizacion_id, 'vigencia_gift_card_meses', 12)::int)))::date);
      elsif l.tipo = 'plan' then
        insert into piefirme.planes_adquiridos (organizacion_id, sede_compra_id, paciente_id, oferta_id, venta_id, venta_linea_id, fecha_compra, caduca_el,
                                              sesiones_total, precio_total, usable_otra_sede)
        values (v.organizacion_id, v.sede_id, v.paciente_id, o.id, v.id, l.id, v_hoy,
                (v_hoy + make_interval(months => coalesce(o.caducidad_meses, piefirme_app.param_num(v.organizacion_id, 'vigencia_plan_meses', 12)::int)))::date,
                o.sesiones_total, round(l.importe / greatest(floor(l.cantidad), 1), 2), o.usable_otra_sede);
      elsif l.tipo = 'membresia' then
        insert into piefirme.membresias_paciente (organizacion_id, paciente_id, oferta_id, sede_venta_id, venta_id, inicio, vencimiento)
        values (v.organizacion_id, v.paciente_id, o.id, v.sede_id, v.id, v_hoy, (v_hoy + make_interval(months => o.caducidad_meses))::date);
      end if;
    end loop;
    if l.promocion_id is not null then
      insert into piefirme.usos_promocion (organizacion_id, oferta_id, venta_id, venta_linea_id, paciente_id, sede_id, monto_descuento, motivo, autorizo_id)
      values (v.organizacion_id, l.promocion_id, v.id, l.id, v.paciente_id, v.sede_id, l.descuento, l.descuento_motivo,
              (select autorizador_id from piefirme.autorizaciones_admin where id = l.autorizacion_descuento_id));
    end if;
  end loop;
  update piefirme.ventas set estado = case when requiere_factura then 'por_facturar' else 'cobrada' end,
         turno_id = t.id, cajero_id = auth.uid(), cobrada_en = now() where id = p_venta;
end $$;

-- Cancelación: Recepción en el mismo turno (o antes de cobrar); después, solo Administración con motivo. Nunca se borra (P-060).
create or replace function piefirme.cancelar_venta(p_venta uuid, p_motivo text) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; t_id uuid; p record; g piefirme.gift_cards%rowtype; pl record;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso para cancelar' using errcode = 'PF403'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'la cancelación exige motivo' using errcode = 'PF400'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado = 'cancelada' then raise exception 'el ticket ya está cancelado' using errcode = 'PF409'; end if;
  select id into t_id from piefirme.turnos_caja where sede_id = v.sede_id and cajero_id = auth.uid() and estado = 'abierto';
  if not piefirme_app.es_admin() and v.estado not in ('por_cobrar', 'cuenta_abierta') and (t_id is null or v.turno_id is distinct from t_id) then
    raise exception 'tras cerrar el turno solo Administración cancela el ticket (P-060)' using errcode = 'PF403';
  end if;
  if exists (select 1 from piefirme.facturas f where f.venta_id = v.id and f.estado in ('vigente', 'cancelacion_en_proceso')) then
    raise exception 'cancele o acredite el CFDI antes de cancelar el ticket (P-060)' using errcode = 'PF409';
  end if;
  -- gift cards vendidas en este ticket: solo se anulan si no se han usado
  for g in select * from piefirme.gift_cards where venta_id = v.id loop
    if g.saldo <> g.monto_inicial then raise exception 'la gift card % ya tiene canjes', g.codigo using errcode = 'PF409'; end if;
    update piefirme.gift_cards set estado = 'cancelada' where id = g.id;
  end loop;
  for pl in select * from piefirme.planes_adquiridos where venta_id = v.id loop
    if pl.sesiones_usadas > 0 then raise exception 'el plan % ya tiene sesiones usadas', pl.folio using errcode = 'PF409'; end if;
    update piefirme.planes_adquiridos set estado = 'cancelado' where id = pl.id;
  end loop;
  update piefirme.membresias_paciente set estado = 'cancelada' where venta_id = v.id;
  -- reversos: canjes de gift card, anticipos aplicados, usos de promoción
  for p in select * from piefirme.pagos where venta_id = v.id and metodo = 'gift_card' loop
    insert into piefirme.gift_card_movimientos (organizacion_id, gift_card_id, tipo, monto, venta_id, sede_id, nota)
    values (v.organizacion_id, p.gift_card_id, 'reversa', p.monto, v.id, v.sede_id, 'Cancelación de ' || coalesce(v.folio, ''));
  end loop;
  perform set_config('app.reversa', 'on', true);
  update piefirme.anticipos set estado = 'pagado' where venta_id = v.id and estado = 'aplicado';
  perform set_config('app.reversa', 'off', true);
  update piefirme.usos_promocion set reversado = true where venta_id = v.id and not reversado;
  update piefirme.ofertas o set usos = greatest(o.usos - 1, 0) where o.id in (select oferta_id from piefirme.usos_promocion where venta_id = v.id);
  update piefirme.ventas set estado = 'cancelada', motivo_cancelacion = p_motivo, cancelada_turno_id = t_id where id = v.id;
  perform piefirme.registrar_bitacora('actualizar', 'ventas', v.id::text, jsonb_build_object('cancelacion', p_motivo), v.sede_id);
end $$;

-- Descuento global: se reparte en las líneas (por porcentaje o proporcional al importe) y exige motivo y, arriba del límite, autorización (P-055).
create or replace function piefirme.aplicar_descuento_global(p_venta uuid, p_tipo text, p_valor numeric, p_motivo text, p_autorizacion uuid default null)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; l record; v_resto numeric; v_asig numeric; v_bruto numeric; v_n integer; v_i integer := 0;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  if p_tipo not in ('pct', 'monto') or p_valor is null or p_valor < 0 then raise exception 'descuento inválido' using errcode = 'PF400'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found or v.estado not in ('por_cobrar', 'cuenta_abierta') then raise exception 'el ticket no admite descuentos' using errcode = 'PF409'; end if;
  select coalesce(sum(importe_bruto), 0), count(*) into v_bruto, v_n from piefirme.venta_lineas where venta_id = p_venta;
  if v_n = 0 or v_bruto = 0 then raise exception 'no hay importe sobre el cual descontar' using errcode = 'PF409'; end if;
  v_resto := case when p_tipo = 'monto' then least(p_valor, v_bruto) else 0 end;
  for l in select * from piefirme.venta_lineas where venta_id = p_venta order by orden, created_at loop
    v_i := v_i + 1;
    if p_tipo = 'pct' then
      update piefirme.venta_lineas set descuento_pct = p_valor, descuento_monto = 0, descuento_motivo = p_motivo, autorizacion_descuento_id = p_autorizacion where id = l.id;
    else
      v_asig := case when v_i = v_n then v_resto else least(v_resto, round(p_valor * l.importe_bruto / v_bruto, 2)) end;
      v_resto := v_resto - v_asig;
      update piefirme.venta_lineas set descuento_pct = 0, descuento_monto = v_asig, descuento_motivo = p_motivo, autorizacion_descuento_id = p_autorizacion where id = l.id;
    end if;
  end loop;
  update piefirme.ventas set descuento_global_tipo = p_tipo, descuento_global_valor = p_valor, descuento_motivo = p_motivo, autorizacion_descuento_id = p_autorizacion where id = p_venta;
end $$;

-- Reimpresión: sale marcada «copia» y queda en bitácora (P-060).
create or replace function piefirme.reimprimir_ticket(p_venta uuid) returns text
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  update piefirme.ventas set copias_impresas = copias_impresas + 1 where id = p_venta;
  perform piefirme.registrar_bitacora('imprimir', 'ventas', p_venta::text, jsonb_build_object('copia', v.copias_impresas + 1), v.sede_id);
  return 'COPIA ' || (v.copias_impresas + 1)::text;
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.crear_politicas('turnos_caja', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'si',
                           $c$ piefirme_app.rol() = 'administrador' or cajero_id = auth.uid() $c$);
select piefirme_app.crear_politicas('movimientos_caja', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'si');
drop policy if exists movimientos_caja_upd on piefirme.movimientos_caja;
select piefirme_app.crear_politicas('ventas', null, array['administrador', 'recepcion', 'podologo'], '{}'::text[], 'si',
                           $c$ piefirme_app.rol() <> 'podologo' or (podologo_id = auth.uid() and estado = 'por_cobrar') $c$);
select piefirme_app.crear_politicas('venta_lineas', null, array['administrador', 'recepcion', 'podologo'], array['administrador', 'recepcion', 'podologo'], 'si',
                           $c$ piefirme_app.rol() <> 'podologo' or exists (select 1 from piefirme.ventas v where v.id = venta_id and v.podologo_id = auth.uid() and v.estado = 'por_cobrar') $c$);
select piefirme_app.crear_politicas('pagos', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'si');
select piefirme_app.crear_politicas('devoluciones_venta', array['administrador', 'recepcion'], array['administrador'], '{}'::text[], 'si');
select piefirme_app.crear_politicas('cortes_caja', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'si');
drop policy if exists cortes_caja_upd on piefirme.cortes_caja;
select piefirme_app.b_triggers('turnos_caja');
select piefirme_app.b_triggers('movimientos_caja');
select piefirme_app.b_triggers('ventas');
select piefirme_app.b_triggers('venta_lineas', false);
select piefirme_app.b_triggers('pagos');
select piefirme_app.b_triggers('devoluciones_venta');
select piefirme_app.b_triggers('cortes_caja');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_ventas with (security_invoker = true) as
select v.*, se.nombre as sede_nombre, se.clave as sede_clave,
       btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')) as paciente_nombre,
       pf.nombre as podologo_nombre, cj.nombre as cajero_nombre, c.folio as cita_folio,
       (v.estado = 'por_facturar' or (v.requiere_factura and v.estado = 'cobrada')) as pendiente_facturar,
       (select count(*) from piefirme.venta_lineas l where l.venta_id = v.id) as num_lineas
  from piefirme.ventas v
  join piefirme.sedes se on se.id = v.sede_id
  left join piefirme.pacientes p on p.id = v.paciente_id
  left join piefirme.perfiles pf on pf.id = v.podologo_id
  left join piefirme.perfiles cj on cj.id = v.cajero_id
  left join piefirme.citas c on c.id = v.cita_id;

create or replace view piefirme.prp_venta_lineas with (security_invoker = true) as
select l.*, v.folio as venta_folio, v.estado as venta_estado, v.cobrada_en, v.paciente_id, v.turno_id, v.cajero_id,
       af.nombre as atendio_nombre
  from piefirme.venta_lineas l
  join piefirme.ventas v on v.id = l.venta_id
  left join piefirme.perfiles af on af.id = l.atendio_id;

create or replace view piefirme.prp_turnos_caja with (security_invoker = true) as
select t.*, se.nombre as sede_nombre, cj.nombre as cajero_nombre,
       (select count(*) from piefirme.ventas v where v.turno_id = t.id and v.estado <> 'cancelada') as num_ventas,
       (select coalesce(sum(vp.monto), 0) from piefirme.pagos vp join piefirme.ventas v on v.id = vp.venta_id
         where v.turno_id = t.id and vp.metodo = 'efectivo' and v.estado <> 'cancelada') as efectivo_cobrado
  from piefirme.turnos_caja t
  join piefirme.sedes se on se.id = t.sede_id
  join piefirme.perfiles cj on cj.id = t.cajero_id;

create or replace view piefirme.prp_cortes_caja with (security_invoker = true) as
select cc.*, t.caja, t.nombre_turno, t.apertura_en, t.cierre_en, t.estado as turno_estado, se.nombre as sede_nombre, cj.nombre as cajero_nombre,
       (abs(cc.diferencia) > piefirme_app.param_num(cc.organizacion_id, 'tolerancia_corte_mxn', 50)) as diferencia_fuera_de_tolerancia
  from piefirme.cortes_caja cc
  join piefirme.turnos_caja t on t.id = cc.turno_id
  join piefirme.sedes se on se.id = cc.sede_id
  join piefirme.perfiles cj on cj.id = t.cajero_id;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.cerrar_turno(uuid, numeric, text, uuid), piefirme.revisar_turno(uuid), piefirme.cobrar_venta(uuid),
  piefirme.cancelar_venta(uuid, text), piefirme.aplicar_descuento_global(uuid, text, numeric, text, uuid), piefirme.reimprimir_ticket(uuid) from public, anon;
grant execute on function piefirme.cerrar_turno(uuid, numeric, text, uuid), piefirme.revisar_turno(uuid), piefirme.cobrar_venta(uuid),
  piefirme.cancelar_venta(uuid, text), piefirme.aplicar_descuento_global(uuid, text, numeric, text, uuid), piefirme.reimprimir_ticket(uuid) to authenticated;
grant execute on function piefirme_app.precio_item(uuid, text, uuid, uuid) to authenticated;
