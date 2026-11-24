-- 027 · Facturación CFDI 4.0 con adaptador de PAC (SIN llave real): configuración del PAC, emisor y receptores fiscales, facturas con
-- conceptos e impuestos, cancelaciones SAT, notas de crédito y factura global en borrador.
-- Reglas: P-056, P-057 (ticket y CFDI dan el mismo total), P-061..P-066. Estados: MODELO_ESTADOS S14, S15, S16.
-- Los certificados CSD y sus contraseñas NO viven en la base: solo la ruta del archivo ('pf-documentos') y la referencia al secreto.
-- El timbrado real lo hace una función de servidor con service_role (piefirme.servicio_marcar_timbrada). En modo 'simulado' hay un timbrado
-- sintético para pruebas, marcado como tal.
-- Dependencias: 001, 010, 020..026.

-- ───────────────────────────── PAC y emisor ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.pac_configuracion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null unique references piefirme.organizaciones(id) on delete cascade,
  proveedor        text not null default 'por_definir',
  modo             text not null default 'no_configurado' check (modo in ('no_configurado', 'simulado', 'sandbox', 'produccion')),
  credencial_ref   text,                       -- nombre del secreto del PAC en el servidor
  csd_cer_path     text,                       -- <organizacion_id>/csd/emisor.cer ('pf-documentos')
  csd_key_ref      text,                       -- referencia al .key/contraseña cifrados en el servidor; nunca el contenido
  csd_vigencia     date,
  ultimo_error     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table piefirme.emisor_fiscal (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  rfc                text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  razon_social       text,
  regimen_fiscal     text,
  codigo_postal      text,                     -- lugar de expedición
  serie              text not null default 'A',
  folio_actual       bigint not null default 0 check (folio_actual >= 0),   -- serie fiscal por clínica; nunca se reutiliza ni reinicia (P-133)
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organizacion_id, serie)
);

create table piefirme.cfdi_receptores (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id         uuid references piefirme.pacientes(id),         -- null = persona física/moral que no es paciente
  rfc                 text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  razon_social        text not null,
  regimen_fiscal      text not null,
  codigo_postal       text not null,
  uso_cfdi            text not null,
  correo              text,
  constancia_path     text,
  validado            boolean not null default false,
  facturacion_automatica boolean not null default false,   -- solo con consentimiento y datos validados (P-066)
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on piefirme.cfdi_receptores (organizacion_id, paciente_id);
create index on piefirme.cfdi_receptores (organizacion_id, rfc);

create or replace function piefirme_app.reservar_folio_fiscal(p_emisor uuid) returns bigint
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v bigint;
begin
  update piefirme.emisor_fiscal set folio_actual = folio_actual + 1 where id = p_emisor returning folio_actual into v;
  if v is null then raise exception 'emisor fiscal inexistente' using errcode = 'PF404'; end if;
  return v;
end $$;

-- ───────────────────────────── facturas (E83) ─────────────────────────────
create table piefirme.facturas (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid not null references piefirme.sedes(id),
  emisor_id           uuid references piefirme.emisor_fiscal(id),
  serie               text,
  folio               bigint,
  estado              text not null default 'borrador' check (estado in ('borrador', 'vigente', 'cancelacion_en_proceso', 'cancelada')),
  tipo_comprobante    text not null default 'I' check (tipo_comprobante in ('I', 'E')),
  venta_id            uuid references piefirme.ventas(id),
  paciente_id         uuid references piefirme.pacientes(id),
  es_global           boolean not null default false,
  periodo_global      date,
  revisado_por        uuid references piefirme.perfiles(id),           -- la global la revisa el contador/administrador antes de timbrar (P-064)
  revisado_en         timestamptz,
  -- emisor congelado
  emisor_rfc          text,
  emisor_razon_social text,
  emisor_regimen      text,
  lugar_expedicion    text,
  -- receptor congelado (P-066)
  receptor_id         uuid references piefirme.cfdi_receptores(id),
  receptor_rfc        text not null,
  receptor_razon_social text not null,
  receptor_regimen    text not null,
  receptor_cp         text not null,
  uso_cfdi            text not null,
  receptor_correo     text,
  publico_general     boolean not null default false,
  forma_pago          text not null default '99',
  metodo_pago         text not null default 'PUE' check (metodo_pago in ('PUE', 'PPD')),
  moneda              text not null default 'MXN',
  tipo_cambio         numeric(12,6) not null default 1,
  subtotal            numeric(14,2) not null default 0,
  descuento           numeric(14,2) not null default 0,
  iva_trasladado_base numeric(14,2) not null default 0,
  iva_trasladado      numeric(14,2) not null default 0,
  iva_exento_base     numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0 check (total >= 0),
  relacion_tipo       text,                                           -- 01 nota de crédito, 04 sustitución…
  relacion_uuid       uuid,
  uuid                uuid,
  fecha_emision       timestamptz,
  fecha_timbrado      timestamptz,
  pac_modo            text check (pac_modo in ('simulado', 'sandbox', 'produccion')),
  pac_respuesta       jsonb not null default '{}'::jsonb,
  xml_path            text,
  pdf_path            text,
  constancia_path     text,
  enviado_a           text,
  enviado_en          timestamptz,
  creada_por          uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (estado = 'borrador' or (uuid is not null and fecha_timbrado is not null and folio is not null)),
  check (es_global or venta_id is not null or tipo_comprobante = 'E'),
  check (not es_global or publico_general)
);
create unique index facturas_serie_folio on piefirme.facturas (organizacion_id, serie, folio) where folio is not null;
create unique index facturas_uuid_unico on piefirme.facturas (uuid) where uuid is not null;
create unique index facturas_una_por_venta on piefirme.facturas (venta_id) where venta_id is not null and estado in ('borrador', 'vigente', 'cancelacion_en_proceso') and tipo_comprobante = 'I';
create index on piefirme.facturas (organizacion_id, sede_id, created_at desc);
create index on piefirme.facturas (organizacion_id, estado);

alter table piefirme.ventas add constraint ventas_factura_fk foreign key (factura_id) references piefirme.facturas(id);

create table piefirme.factura_conceptos (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid not null references piefirme.sedes(id),
  factura_id        uuid not null references piefirme.facturas(id) on delete cascade,
  venta_linea_id    uuid references piefirme.venta_lineas(id),
  clave_sat         text not null default '85121600',
  descripcion       text not null,
  unidad_sat        text not null default 'E48',
  cantidad          numeric(12,3) not null check (cantidad > 0),
  valor_unitario    numeric(18,6) not null check (valor_unitario >= 0),     -- sin IVA
  importe           numeric(14,2) not null check (importe >= 0),            -- cantidad × valor unitario
  descuento         numeric(14,2) not null default 0 check (descuento >= 0),
  base              numeric(14,2) not null check (base >= 0),               -- importe − descuento
  objeto_impuesto   text not null default '02' check (objeto_impuesto in ('01', '02', '03')),
  iva_tipo          text not null check (iva_tipo in ('exento', '16', 'tasa0')),
  iva_tasa          numeric(5,4),
  iva_importe       numeric(14,2) not null default 0,
  created_at        timestamptz not null default now(),
  check (base = importe - descuento)
);
create index on piefirme.factura_conceptos (organizacion_id, factura_id);

create or replace function piefirme_app.factura_concepto_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.facturas%rowtype; v_id uuid := coalesce(new.factura_id, old.factura_id);
begin
  select * into f from piefirme.facturas where id = v_id;
  if not found then return coalesce(new, old); end if;
  if f.estado <> 'borrador' then raise exception 'solo se editan los conceptos de un borrador' using errcode = 'PF409'; end if;
  if tg_op <> 'DELETE' then
    if f.organizacion_id <> new.organizacion_id then raise exception 'factura de otra clínica' using errcode = 'PF403'; end if;
    new.sede_id := f.sede_id;
    new.iva_tasa := case new.iva_tipo when '16' then 0.16 when 'tasa0' then 0 else null end;
    new.objeto_impuesto := case when new.iva_tipo = 'exento' then '01' else '02' end;
    return new;
  end if;
  return old;
end $$;
create trigger t_factura_concepto_bi before insert or update or delete on piefirme.factura_conceptos for each row execute function piefirme_app.factura_concepto_bi();

create or replace function piefirme_app.factura_recalcular() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := coalesce(new.factura_id, old.factura_id);
begin
  update piefirme.facturas f set
    subtotal = coalesce((select sum(importe) from piefirme.factura_conceptos where factura_id = v_id), 0),
    descuento = coalesce((select sum(descuento) from piefirme.factura_conceptos where factura_id = v_id), 0),
    iva_trasladado_base = coalesce((select sum(base) from piefirme.factura_conceptos where factura_id = v_id and iva_tipo = '16'), 0),
    iva_trasladado = coalesce((select sum(iva_importe) from piefirme.factura_conceptos where factura_id = v_id), 0),
    iva_exento_base = coalesce((select sum(base) from piefirme.factura_conceptos where factura_id = v_id and iva_tipo = 'exento'), 0),
    total = coalesce((select sum(base + iva_importe) from piefirme.factura_conceptos where factura_id = v_id), 0)
   where f.id = v_id;
  return null;
end $$;
create trigger t_factura_recalc after insert or update or delete on piefirme.factura_conceptos for each row execute function piefirme_app.factura_recalcular();

-- ¿el ticket está dentro del plazo para facturar? (mismo mes calendario, P-064)
create or replace function piefirme_app.venta_facturable(p_venta uuid) returns text
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; tz text;
begin
  select * into v from piefirme.ventas where id = p_venta;
  if not found then return 'venta_inexistente'; end if;
  if v.estado not in ('cobrada', 'por_facturar') then return 'ticket_no_cobrado'; end if;
  tz := piefirme_app.zona_org(v.organizacion_id);
  if piefirme_app.param_txt(v.organizacion_id, 'plazo_facturar', 'mes_calendario') = 'mes_calendario'
     and date_trunc('month', v.cobrada_en at time zone tz) <> date_trunc('month', now() at time zone tz) then
    return 'plazo_vencido';
  end if;
  return null;
end $$;

create or replace function piefirme_app.factura_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare e piefirme.emisor_fiscal%rowtype; v piefirme.ventas%rowtype; r piefirme.cfdi_receptores%rowtype; v_motivo text; v_suma numeric; v_servicio boolean;
begin
  v_servicio := (coalesce(auth.role(), '') = 'service_role' or auth.uid() is null or coalesce(current_setting('app.pac_simulado', true), '') = 'on');
  if tg_op = 'INSERT' then
    if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
      raise exception 'sede de otra clínica' using errcode = 'PF403';
    end if;
    if new.estado <> 'borrador' and not v_servicio then raise exception 'una factura nace en borrador' using errcode = 'PF409'; end if;
    if new.emisor_id is null then select * into e from piefirme.emisor_fiscal where organizacion_id = new.organizacion_id and activo order by serie limit 1;
    else select * into e from piefirme.emisor_fiscal where id = new.emisor_id and organizacion_id = new.organizacion_id; end if;
    if found then
      new.emisor_id := e.id; new.serie := coalesce(new.serie, e.serie);
      new.emisor_rfc := coalesce(new.emisor_rfc, e.rfc); new.emisor_razon_social := coalesce(new.emisor_razon_social, e.razon_social);
      new.emisor_regimen := coalesce(new.emisor_regimen, e.regimen_fiscal); new.lugar_expedicion := coalesce(new.lugar_expedicion, e.codigo_postal);
    end if;
    if new.receptor_id is not null then
      select * into r from piefirme.cfdi_receptores where id = new.receptor_id and organizacion_id = new.organizacion_id;
      if not found then raise exception 'receptor inexistente' using errcode = 'PF404'; end if;
    end if;
    if new.venta_id is not null and new.tipo_comprobante = 'I' then
      select * into v from piefirme.ventas where id = new.venta_id and organizacion_id = new.organizacion_id;
      if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
      v_motivo := piefirme_app.venta_facturable(new.venta_id);
      if v_motivo is not null then raise exception '%: el ticket no se puede facturar', v_motivo using errcode = 'PF409'; end if;
      new.paciente_id := coalesce(new.paciente_id, v.paciente_id);
    end if;
    new.fecha_emision := coalesce(new.fecha_emision, now());
  else
    if new.estado is distinct from old.estado then
      if not ((old.estado = 'borrador' and new.estado = 'vigente')
           or (old.estado = 'vigente' and new.estado = 'cancelacion_en_proceso')
           or (old.estado = 'cancelacion_en_proceso' and new.estado in ('cancelada', 'vigente'))) then
        raise exception 'transición de factura no permitida: % → %', old.estado, new.estado using errcode = 'PF409';
      end if;
      if new.estado = 'vigente' and old.estado = 'borrador' then
        if not v_servicio then raise exception 'el timbrado lo hace el adaptador de PAC en el servidor' using errcode = 'PF403'; end if;
        if new.es_global and new.revisado_por is null then raise exception 'la factura global exige revisión antes de timbrar (P-064)' using errcode = 'PF409'; end if;
        if new.venta_id is not null and new.tipo_comprobante = 'I' then
          v_motivo := piefirme_app.venta_facturable(new.venta_id);
          if v_motivo is not null then raise exception '%: el ticket no se puede timbrar', v_motivo using errcode = 'PF409'; end if;
          select total into v_suma from piefirme.ventas where id = new.venta_id;
          if v_suma is distinct from new.total then
            raise exception 'el total del CFDI (%) debe ser igual al del ticket (%) (P-057)', new.total, v_suma using errcode = 'PF409';
          end if;
        end if;
        if new.total <= 0 and new.tipo_comprobante = 'I' then raise exception 'no se timbra una factura en cero' using errcode = 'PF409'; end if;
        new.serie := coalesce(new.serie, (select serie from piefirme.emisor_fiscal where id = new.emisor_id));
        if new.folio is null then new.folio := piefirme_app.reservar_folio_fiscal(new.emisor_id); end if;
        new.fecha_timbrado := coalesce(new.fecha_timbrado, now());
        if new.uuid is null then raise exception 'falta el UUID del timbre' using errcode = 'PF400'; end if;
      end if;
    end if;
    if old.estado <> 'borrador' and pg_trigger_depth() = 1 and not v_servicio
       and (new.total is distinct from old.total or new.receptor_rfc is distinct from old.receptor_rfc or new.uuid is distinct from old.uuid
            or new.venta_id is distinct from old.venta_id or new.receptor_razon_social is distinct from old.receptor_razon_social) then
      raise exception 'un CFDI timbrado se congela: cancélalo o emite una nota de crédito' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_factura_bi before insert or update on piefirme.facturas for each row execute function piefirme_app.factura_bi();

-- Efecto sobre el ticket: timbrada → «facturada»; cancelada → vuelve a «por facturar»
create or replace function piefirme_app.factura_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.venta_id is not null and new.tipo_comprobante = 'I' then
    if tg_op = 'UPDATE' and new.estado = 'vigente' and old.estado = 'borrador' then
      update piefirme.ventas set estado = 'facturada', factura_id = new.id, requiere_factura = true where id = new.venta_id and estado in ('cobrada', 'por_facturar');
    elsif tg_op = 'UPDATE' and new.estado = 'cancelada' and old.estado <> 'cancelada' then
      update piefirme.ventas set estado = 'por_facturar', factura_id = null where id = new.venta_id and estado = 'facturada';
    end if;
  end if;
  return null;
end $$;
create trigger t_factura_ai after update of estado on piefirme.facturas for each row execute function piefirme_app.factura_ai();

-- ───────────────────────────── cancelación de CFDI (E85, P-063) ─────────────────────────────
create table piefirme.cfdi_cancelaciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  factura_id       uuid not null references piefirme.facturas(id),
  motivo_sat       text not null check (motivo_sat in ('01', '02', '03', '04')),
  uuid_sustituto   uuid,
  comentario       text,
  estado           text not null default 'solicitada' check (estado in ('solicitada', 'esperando_aceptacion', 'aceptada', 'rechazada')),
  acuse_path       text,
  solicitada_por   uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  solicitada_en    timestamptz not null default now(),
  resuelta_en      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (motivo_sat <> '01' or uuid_sustituto is not null)
);
create index on piefirme.cfdi_cancelaciones (organizacion_id, factura_id);

create or replace function piefirme_app.cfdi_cancelacion_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.facturas%rowtype;
begin
  select * into f from piefirme.facturas where id = new.factura_id and organizacion_id = new.organizacion_id;
  if not found then raise exception 'factura inexistente' using errcode = 'PF404'; end if;
  if tg_op = 'INSERT' then
    if f.estado <> 'vigente' then raise exception 'solo se cancela una factura vigente (%)', f.estado using errcode = 'PF409'; end if;
    update piefirme.facturas set estado = 'cancelacion_en_proceso' where id = f.id;
  else
    if new.estado is distinct from old.estado then
      if not ((old.estado = 'solicitada' and new.estado in ('esperando_aceptacion', 'aceptada', 'rechazada'))
           or (old.estado = 'esperando_aceptacion' and new.estado in ('aceptada', 'rechazada'))) then
        raise exception 'transición de cancelación no permitida: % → %', old.estado, new.estado using errcode = 'PF409';
      end if;
      if new.estado in ('aceptada', 'rechazada') then
        new.resuelta_en := now();
        update piefirme.facturas set estado = case when new.estado = 'aceptada' then 'cancelada' else 'vigente' end where id = f.id;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger t_cfdi_cancelacion_bi before insert or update on piefirme.cfdi_cancelaciones for each row execute function piefirme_app.cfdi_cancelacion_bi();

-- ───────────────────────────── notas de crédito (E86, P-065) ─────────────────────────────
create table piefirme.notas_credito (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id              uuid not null references piefirme.sedes(id),
  folio                text,                                           -- {SEDE}-NC-{NNNNNN}
  factura_origen_id    uuid not null references piefirme.facturas(id),
  tipo                 text not null check (tipo in ('devolucion', 'descuento', 'bonificacion')),
  importe              numeric(14,2) not null check (importe > 0),
  concepto             text not null,
  relacion_sat         text not null default '01',
  devolver_dinero      boolean not null default false,
  movimiento_caja_id   uuid references piefirme.movimientos_caja(id),    -- el retiro de caja si se devolvió dinero
  factura_egreso_id    uuid references piefirme.facturas(id),            -- CFDI de egreso
  uuid_egreso          uuid,
  estado               text not null default 'borrador' check (estado in ('borrador', 'emitida', 'cancelada')),
  sintetico            boolean not null default false,
  created_by           uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.notas_credito (organizacion_id, factura_origen_id);
alter table piefirme.movimientos_caja add constraint mov_caja_nc_fk foreign key (nota_credito_id) references piefirme.notas_credito(id);

create or replace function piefirme_app.nota_credito_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.facturas%rowtype; v_prev numeric;
begin
  if tg_op = 'INSERT' then
    select * into f from piefirme.facturas where id = new.factura_origen_id and organizacion_id = new.organizacion_id;
    if not found then raise exception 'factura inexistente' using errcode = 'PF404'; end if;
    if f.estado <> 'vigente' then raise exception 'la factura origen debe estar vigente' using errcode = 'PF409'; end if;
    select coalesce(sum(importe), 0) into v_prev from piefirme.notas_credito where factura_origen_id = f.id and estado <> 'cancelada';
    if v_prev + new.importe > f.total then raise exception 'las notas de crédito (%) exceden el total de la factura (%)', v_prev + new.importe, f.total using errcode = 'PF409'; end if;
    new.sede_id := f.sede_id;
    if new.folio is null then new.folio := piefirme_app.siguiente_folio_comercial(new.sede_id, 'NC'); end if;
  else
    if new.estado is distinct from old.estado and not ((old.estado = 'borrador' and new.estado in ('emitida', 'cancelada')) or (old.estado = 'emitida' and new.estado = 'cancelada')) then
      raise exception 'transición de nota de crédito no permitida' using errcode = 'PF409';
    end if;
    if old.estado <> 'borrador' and (new.importe is distinct from old.importe or new.factura_origen_id is distinct from old.factura_origen_id) and pg_trigger_depth() = 1 then
      raise exception 'una nota emitida no cambia' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_nota_credito_bi before insert or update on piefirme.notas_credito for each row execute function piefirme_app.nota_credito_bi();

-- ───────────────────────────── funciones de trabajo ─────────────────────────────
-- Ticket → factura en borrador con receptor congelado y conceptos con IVA por línea. Sin receptor = público en general (XAXX010101000).
create or replace function piefirme.crear_factura_desde_venta(p_venta uuid, p_receptor uuid default null, p_forma_pago text default null, p_metodo_pago text default 'PUE')
returns uuid language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v piefirme.ventas%rowtype; r piefirme.cfdi_receptores%rowtype; e piefirme.emisor_fiscal%rowtype; l piefirme.venta_lineas%rowtype; v_f uuid; v_fp text; v_motivo text;
  v_desc_base numeric; v_imp numeric;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  v_motivo := piefirme_app.venta_facturable(p_venta);
  if v_motivo is not null then raise exception '%', v_motivo using errcode = 'PF409'; end if;
  select * into e from piefirme.emisor_fiscal where organizacion_id = v.organizacion_id and activo order by serie limit 1;
  if not found then raise exception 'configure el emisor fiscal de la clínica' using errcode = 'PF409'; end if;
  if p_receptor is not null then
    select * into r from piefirme.cfdi_receptores where id = p_receptor and organizacion_id = v.organizacion_id and activo;
    if not found then raise exception 'receptor inexistente' using errcode = 'PF404'; end if;
  end if;
  v_fp := coalesce(p_forma_pago, (select case metodo when 'efectivo' then '01' when 'transferencia' then '03' when 'tarjeta' then '04' when 'clip' then '04' else '99' end
                                    from piefirme.pagos where venta_id = v.id and metodo <> 'anticipo' order by monto desc limit 1), '99');
  insert into piefirme.facturas (organizacion_id, sede_id, emisor_id, venta_id, paciente_id, receptor_id, receptor_rfc, receptor_razon_social, receptor_regimen,
                               receptor_cp, uso_cfdi, receptor_correo, publico_general, forma_pago, metodo_pago)
  values (v.organizacion_id, v.sede_id, e.id, v.id, v.paciente_id, r.id,
          coalesce(r.rfc, 'XAXX010101000'), coalesce(r.razon_social, 'PUBLICO EN GENERAL'), coalesce(r.regimen_fiscal, '616'),
          coalesce(r.codigo_postal, e.codigo_postal, '00000'), coalesce(r.uso_cfdi, 'S01'), r.correo, r.id is null, v_fp, p_metodo_pago)
  returning id into v_f;
  for l in select * from piefirme.venta_lineas where venta_id = v.id and importe > 0 order by orden, created_at loop
    v_desc_base := case when l.iva_tipo = '16' then round(l.descuento / 1.16, 2) else l.descuento end;
    v_imp := l.base_neta + v_desc_base;
    insert into piefirme.factura_conceptos (organizacion_id, sede_id, factura_id, venta_linea_id, clave_sat, descripcion, unidad_sat, cantidad, valor_unitario,
                                          importe, descuento, base, iva_tipo, iva_importe)
    values (v.organizacion_id, v.sede_id, v_f, l.id, coalesce(l.clave_sat, '85121600'), coalesce(l.descripcion, 'Servicio'), coalesce(l.unidad_sat, 'E48'),
            l.cantidad, round(v_imp / l.cantidad, 6), v_imp, v_desc_base, l.base_neta, l.iva_tipo, l.iva_monto);
  end loop;
  update piefirme.ventas set requiere_factura = true, estado = case when estado = 'cobrada' then 'por_facturar' else estado end where id = v.id;
  return v_f;
end $$;

-- Timbrado SINTÉTICO (solo si el PAC está en modo «simulado»): para pruebas; el UUID no tiene validez fiscal.
create or replace function piefirme.timbrar_factura_simulado(p_factura uuid) returns uuid
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.facturas%rowtype; v_uuid uuid := gen_random_uuid();
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  select * into f from piefirme.facturas where id = p_factura for update;
  if not found or f.estado <> 'borrador' then raise exception 'la factura no está en borrador' using errcode = 'PF409'; end if;
  if not exists (select 1 from piefirme.pac_configuracion where organizacion_id = f.organizacion_id and modo = 'simulado') then
    raise exception 'el PAC no está en modo simulado: el timbrado real lo hace la función de servidor' using errcode = 'PF409';
  end if;
  perform set_config('app.pac_simulado', 'on', true);
  update piefirme.facturas set estado = 'vigente', uuid = v_uuid, pac_modo = 'simulado', pac_respuesta = jsonb_build_object('sintetico', true) where id = p_factura;
  perform set_config('app.pac_simulado', 'off', true);
  return v_uuid;
end $$;

-- Timbrado real: lo invoca el servidor (service_role) con la respuesta del PAC.
create or replace function piefirme.servicio_marcar_timbrada(p_factura uuid, p_uuid uuid, p_xml_path text, p_pdf_path text, p_fecha_timbrado timestamptz, p_modo text, p_respuesta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.facturas set estado = 'vigente', uuid = p_uuid, xml_path = p_xml_path, pdf_path = p_pdf_path,
         fecha_timbrado = coalesce(p_fecha_timbrado, now()), pac_modo = p_modo, pac_respuesta = coalesce(p_respuesta, '{}'::jsonb)
   where id = p_factura and estado = 'borrador';
  if not found then raise exception 'la factura no está en borrador' using errcode = 'PF409'; end if;
end $$;

-- Nota de crédito: Administración, relacionando el CFDI origen; si devuelve dinero, sale de caja con registro de retiro (P-065).
create or replace function piefirme.emitir_nota_credito(p_factura uuid, p_tipo text, p_importe numeric, p_concepto text, p_devolver_dinero boolean default false)
returns uuid language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.facturas%rowtype; v_nc uuid; v_t uuid; v_mov uuid; v_sim boolean;
begin
  if not piefirme_app.es_admin() then raise exception 'las notas de crédito son del administrador (P-065)' using errcode = 'PF403'; end if;
  if coalesce(btrim(p_concepto), '') = '' then raise exception 'el concepto es obligatorio' using errcode = 'PF400'; end if;
  select * into f from piefirme.facturas where id = p_factura;
  if not found then raise exception 'factura inexistente' using errcode = 'PF404'; end if;
  if p_devolver_dinero then
    select id into v_t from piefirme.turnos_caja where sede_id = f.sede_id and cajero_id = auth.uid() and estado = 'abierto';
    if v_t is null then raise exception 'abra un turno de caja para registrar la salida de dinero' using errcode = 'PF409'; end if;
  end if;
  v_sim := exists (select 1 from piefirme.pac_configuracion where organizacion_id = f.organizacion_id and modo = 'simulado');
  insert into piefirme.notas_credito (organizacion_id, sede_id, factura_origen_id, tipo, importe, concepto, devolver_dinero, estado, sintetico, uuid_egreso)
  values (f.organizacion_id, f.sede_id, f.id, p_tipo, p_importe, p_concepto, p_devolver_dinero, case when v_sim then 'emitida' else 'borrador' end, v_sim,
          case when v_sim then gen_random_uuid() end)
  returning id into v_nc;
  if p_devolver_dinero then
    insert into piefirme.movimientos_caja (organizacion_id, sede_id, turno_id, tipo, monto, concepto, venta_id, nota_credito_id)
    values (f.organizacion_id, f.sede_id, v_t, 'devolucion', p_importe, 'Devolución por nota de crédito', f.venta_id, v_nc) returning id into v_mov;
    update piefirme.notas_credito set movimiento_caja_id = v_mov where id = v_nc;
  end if;
  return v_nc;
end $$;

create or replace function piefirme.servicio_marcar_nota_credito(p_nota uuid, p_uuid uuid, p_factura_egreso uuid default null) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.notas_credito set estado = 'emitida', uuid_egreso = p_uuid, factura_egreso_id = p_factura_egreso where id = p_nota and estado = 'borrador';
  if not found then raise exception 'la nota no está en borrador' using errcode = 'PF409'; end if;
end $$;

-- Factura global mensual de lo no solicitado: SOLO borrador para revisión del contador (no se timbra sola, P-064).
create table piefirme.factura_global_ventas (
  factura_id       uuid not null references piefirme.facturas(id) on delete cascade,
  venta_id         uuid not null unique references piefirme.ventas(id),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  primary key (factura_id, venta_id)
);

create or replace function piefirme.generar_factura_global_borrador(p_sede uuid, p_mes date) returns uuid
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare e piefirme.emisor_fiscal%rowtype; v_f uuid; v_org uuid := piefirme_app.org_id(); l record; v_desc_base numeric; v_imp numeric; v_ini timestamptz; v_fin timestamptz; tz text;
begin
  if not piefirme_app.es_admin() then raise exception 'solo el administrador genera la factura global' using errcode = 'PF403'; end if;
  tz := piefirme_app.zona_org(v_org);
  v_ini := date_trunc('month', p_mes)::timestamp at time zone tz; v_fin := (date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone tz;
  select * into e from piefirme.emisor_fiscal where organizacion_id = v_org and activo order by serie limit 1;
  if not found then raise exception 'configure el emisor fiscal' using errcode = 'PF409'; end if;
  if not exists (select 1 from piefirme.ventas v where v.sede_id = p_sede and v.estado = 'cobrada' and not v.requiere_factura and v.cobrada_en >= v_ini and v.cobrada_en < v_fin
                    and not exists (select 1 from piefirme.factura_global_ventas g where g.venta_id = v.id)) then
    raise exception 'no hay tickets pendientes de facturación global en el periodo' using errcode = 'PF409';
  end if;
  insert into piefirme.facturas (organizacion_id, sede_id, emisor_id, es_global, periodo_global, receptor_rfc, receptor_razon_social, receptor_regimen, receptor_cp,
                               uso_cfdi, publico_general, forma_pago, metodo_pago)
  values (v_org, p_sede, e.id, true, date_trunc('month', p_mes)::date, 'XAXX010101000', 'PUBLICO EN GENERAL', '616', e.codigo_postal, 'S01', true, '99', 'PUE')
  returning id into v_f;
  for l in select vl.*, v.id as v_id from piefirme.venta_lineas vl join piefirme.ventas v on v.id = vl.venta_id
            where v.sede_id = p_sede and v.estado = 'cobrada' and not v.requiere_factura and v.cobrada_en >= v_ini and v.cobrada_en < v_fin and vl.importe > 0
              and not exists (select 1 from piefirme.factura_global_ventas g where g.venta_id = v.id) order by v.cobrada_en, vl.orden loop
    v_desc_base := case when l.iva_tipo = '16' then round(l.descuento / 1.16, 2) else l.descuento end;
    v_imp := l.base_neta + v_desc_base;
    insert into piefirme.factura_conceptos (organizacion_id, sede_id, factura_id, venta_linea_id, clave_sat, descripcion, unidad_sat, cantidad, valor_unitario, importe, descuento, base, iva_tipo, iva_importe)
    values (v_org, p_sede, v_f, l.id, coalesce(l.clave_sat, '85121600'), coalesce(l.descripcion, 'Servicio'), coalesce(l.unidad_sat, 'E48'), l.cantidad,
            round(v_imp / l.cantidad, 6), v_imp, v_desc_base, l.base_neta, l.iva_tipo, l.iva_monto);
    insert into piefirme.factura_global_ventas (factura_id, venta_id, organizacion_id) values (v_f, l.v_id, v_org) on conflict do nothing;
  end loop;
  return v_f;
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.crear_politicas('pac_configuracion', array['administrador'], array['administrador'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('emisor_fiscal', array['administrador', 'recepcion'], array['administrador'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('cfdi_receptores', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('facturas', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'si');
create policy facturas_del on piefirme.facturas for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and estado = 'borrador' and piefirme_app.rol()::text = any (array['administrador', 'recepcion']) and piefirme_app.puede_sede(sede_id));
select piefirme_app.crear_politicas('factura_conceptos', array['administrador', 'recepcion'], array['administrador', 'recepcion'], array['administrador', 'recepcion'], 'si');
select piefirme_app.crear_politicas('cfdi_cancelaciones', array['administrador', 'recepcion'], array['administrador'], '{}'::text[], 'no');
select piefirme_app.crear_politicas('notas_credito', array['administrador', 'recepcion'], array['administrador'], '{}'::text[], 'si');
select piefirme_app.crear_politicas('factura_global_ventas', array['administrador'], array['administrador'], '{}'::text[], 'no');
select piefirme_app.b_triggers('pac_configuracion');
select piefirme_app.b_triggers('emisor_fiscal');
select piefirme_app.b_triggers('cfdi_receptores');
select piefirme_app.b_triggers('facturas');
select piefirme_app.b_triggers('factura_conceptos', false);
select piefirme_app.b_triggers('cfdi_cancelaciones');
select piefirme_app.b_triggers('notas_credito');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_facturas with (security_invoker = true) as
select f.*, se.nombre as sede_nombre, v.folio as ticket_folio,
       (select count(*) from piefirme.notas_credito n where n.factura_origen_id = f.id and n.estado = 'emitida') as notas_credito,
       (select coalesce(sum(n.importe), 0) from piefirme.notas_credito n where n.factura_origen_id = f.id and n.estado = 'emitida') as notas_credito_importe,
       coalesce(f.pac_respuesta ->> 'sintetico', 'false')::boolean as sintetico
  from piefirme.facturas f
  join piefirme.sedes se on se.id = f.sede_id
  left join piefirme.ventas v on v.id = f.venta_id;

create or replace view piefirme.prp_facturacion_pendiente with (security_invoker = true) as
select v.id as venta_id, v.organizacion_id, v.sede_id, se.nombre as sede_nombre, v.folio, v.cobrada_en, v.total, v.paciente_id,
       btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')) as paciente_nombre, v.requiere_factura,
       (date_trunc('month', v.cobrada_en at time zone piefirme_app.zona_org(v.organizacion_id)) + interval '1 month')::date
         - (now() at time zone piefirme_app.zona_org(v.organizacion_id))::date as dias_para_vencer_plazo
  from piefirme.ventas v
  join piefirme.sedes se on se.id = v.sede_id
  left join piefirme.pacientes p on p.id = v.paciente_id
 where v.estado = 'por_facturar' or (v.estado = 'cobrada' and v.requiere_factura);

create or replace view piefirme.prp_notas_credito with (security_invoker = true) as
select n.*, f.serie as factura_serie, f.folio as factura_folio, f.uuid as factura_uuid, f.receptor_razon_social
  from piefirme.notas_credito n join piefirme.facturas f on f.id = n.factura_origen_id;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.crear_factura_desde_venta(uuid, uuid, text, text), piefirme.timbrar_factura_simulado(uuid),
  piefirme.emitir_nota_credito(uuid, text, numeric, text, boolean), piefirme.generar_factura_global_borrador(uuid, date) from public, anon;
grant execute on function piefirme.crear_factura_desde_venta(uuid, uuid, text, text), piefirme.timbrar_factura_simulado(uuid),
  piefirme.emitir_nota_credito(uuid, text, numeric, text, boolean), piefirme.generar_factura_global_borrador(uuid, date) to authenticated;
revoke all on function piefirme.servicio_marcar_timbrada(uuid, uuid, text, text, timestamptz, text, jsonb), piefirme.servicio_marcar_nota_credito(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function piefirme.servicio_marcar_timbrada(uuid, uuid, text, text, timestamptz, text, jsonb), piefirme.servicio_marcar_nota_credito(uuid, uuid, uuid) to service_role;
grant execute on function piefirme_app.venta_facturable(uuid) to authenticated;
