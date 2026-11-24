-- 041 · Inventario y finanzas · traspasos entre sedes, órdenes de compra con autorización, recepciones y devoluciones a proveedor.
-- Dominio C. Reglas: P-080 (traspasos: estados, envío descuenta origen, recepción suma destino, diferencias → reclamación),
--   P-081 (OC desde $5,000 exige autorización; recepción parcial; la CxP nace de la factura contra la recepción), P-083 (costo promedio), CA-20/CA-21 (OC con sede explícita; descuento y IVA por línea una sola vez).
-- Dependencias: 001, 020 (productos), 040 (proveedores, kardex, lotes, mermas, helpers app.c_*).
-- Contrato con 046: la cuenta por pagar se crea con un trigger en 046 sobre recepciones.factura_*.

-- ───────────────────────────── traspasos (E92, E93) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.traspasos (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_origen_id        uuid not null references piefirme.sedes(id),
  sede_destino_id       uuid not null references piefirme.sedes(id),
  folio                 text,
  estado                text not null default 'borrador'
                        check (estado in ('borrador', 'enviado', 'recibido_completo', 'recibido_con_diferencias', 'cancelado')),   -- CD-21
  fecha_envio           date,
  fecha_estimada        date,
  solicito_id           uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  responsable_envio_id  uuid references piefirme.perfiles(id) on delete set null,
  transporte            text,
  comentarios           text,
  partidas              integer not null default 0,
  unidades              numeric(14,3) not null default 0,
  valor_total           numeric(14,2) not null default 0,       -- a costo promedio (P-080)
  enviado_por           uuid references piefirme.perfiles(id) on delete set null,
  enviado_en            timestamptz,
  recibio_por           uuid references piefirme.perfiles(id) on delete set null,
  recibido_en           timestamptz,
  cancelado_motivo      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (sede_origen_id <> sede_destino_id)
);
create index on piefirme.traspasos (organizacion_id, estado, created_at desc);
create index on piefirme.traspasos (sede_origen_id);
create index on piefirme.traspasos (sede_destino_id);

create table piefirme.traspaso_lineas (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  traspaso_id       uuid not null references piefirme.traspasos(id) on delete cascade,
  producto_id       uuid not null references piefirme.productos(id),
  lote_id           uuid references piefirme.lotes_producto(id),
  cantidad_enviada  numeric(14,3) not null check (cantidad_enviada > 0),
  cantidad_recibida numeric(14,3) check (cantidad_recibida is null or cantidad_recibida >= 0),
  costo_unitario    numeric(14,4) check (costo_unitario is null or costo_unitario >= 0),   -- se congela al enviar
  diferencia        numeric(14,3) generated always as (cantidad_enviada - coalesce(cantidad_recibida, cantidad_enviada)) stored,
  motivo_diferencia text,                                                                  -- Faltante, dañado…
  created_at        timestamptz not null default now(),
  check (cantidad_recibida is null or cantidad_recibida <= cantidad_enviada)
);
create unique index traspaso_linea_unica on piefirme.traspaso_lineas (traspaso_id, producto_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on piefirme.traspaso_lineas (organizacion_id, traspaso_id);

alter table piefirme.mermas add constraint mermas_traspaso_fk foreign key (traspaso_id) references piefirme.traspasos(id) on delete set null;

create trigger t_folio before insert on piefirme.traspasos for each row execute function piefirme_app.c_asignar_folio('TRA', 'sede_origen_id');
create trigger t_a_padre before insert on piefirme.traspaso_lineas for each row execute function piefirme_app.c_heredar_de_padre('traspasos', 'traspaso_id');
create trigger t_rpc before insert or update on piefirme.traspasos for each row execute function piefirme_app.c_exigir_rpc('enviado,recibido_completo,recibido_con_diferencias,cancelado');

-- Las sedes deben ser de la misma clínica
create or replace function piefirme_app.c_traspaso_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if (select count(*) from piefirme.sedes s where s.id in (new.sede_origen_id, new.sede_destino_id) and s.organizacion_id = new.organizacion_id) <> 2 then
    raise exception 'las sedes del traspaso deben ser de la misma clínica' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.estado <> 'borrador' then
    if (new.sede_origen_id, new.sede_destino_id, new.folio) is distinct from (old.sede_origen_id, old.sede_destino_id, old.folio) then
      raise exception 'el traspaso ya fue enviado: solo se actualizan comentarios' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.traspasos for each row execute function piefirme_app.c_traspaso_bi();

-- Líneas: solo editables en borrador (salvo dentro de las RPC de envío/recepción)
create or replace function piefirme_app.c_traspaso_linea_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_estado text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (baja de la clínica)
  select estado into v_estado from piefirme.traspasos where id = coalesce(new.traspaso_id, old.traspaso_id);
  if v_estado <> 'borrador' and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
    raise exception 'el traspaso está % y sus partidas ya no se modifican', v_estado using errcode = 'PF409';
  end if;
  if tg_op <> 'DELETE' then
    if not exists (select 1 from piefirme.productos p where p.id = new.producto_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'producto de otra clínica' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' and new.cantidad_recibida is not null and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
      raise exception 'la cantidad recibida se captura al recibir' using errcode = 'PF409';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger t_bi before insert or update or delete on piefirme.traspaso_lineas for each row execute function piefirme_app.c_traspaso_linea_bi();

create or replace function piefirme_app.c_traspaso_totales() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := coalesce(new.traspaso_id, old.traspaso_id);
begin
  update piefirme.traspasos t set
    partidas = x.n, unidades = x.u, valor_total = x.v
   from (select count(*) n, coalesce(sum(l.cantidad_enviada), 0) u,
                coalesce(sum(round(l.cantidad_enviada * coalesce(l.costo_unitario, pr.costo_promedio), 2)), 0) v
           from piefirme.traspaso_lineas l join piefirme.productos pr on pr.id = l.producto_id where l.traspaso_id = v_id) x
  where t.id = v_id;
  return null;
end $$;
create trigger t_tot after insert or update of cantidad_enviada, costo_unitario or delete on piefirme.traspaso_lineas for each row execute function piefirme_app.c_traspaso_totales();

-- RPC · enviar: descuenta del origen a costo promedio (P-080)
create or replace function piefirme.traspaso_enviar(p_traspaso uuid) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t piefirme.traspasos%rowtype; l record; v_disp numeric;
begin
  perform set_config('app.c_rpc', 'on', true);
  select * into t from piefirme.traspasos where id = p_traspaso for update;
  if not found then raise exception 'traspaso inexistente' using errcode = 'PF404'; end if;
  if t.estado <> 'borrador' then raise exception 'el traspaso ya está %', t.estado using errcode = 'PF409'; end if;
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') or not piefirme_app.puede_sede(t.sede_origen_id) then
    raise exception 'sin permiso para enviar desde esta sede' using errcode = '42501';
  end if;
  if not exists (select 1 from piefirme.traspaso_lineas where traspaso_id = t.id) then
    raise exception 'el traspaso no tiene partidas' using errcode = 'PF409';
  end if;
  for l in select tl.id, tl.producto_id, tl.lote_id, tl.cantidad_enviada, pr.costo_promedio as cp
             from piefirme.traspaso_lineas tl join piefirme.productos pr on pr.id = tl.producto_id where tl.traspaso_id = t.id loop
    select coalesce(case when l.lote_id is null
                         then (select i.existencia from piefirme.inventario_sede i where i.sede_id = t.sede_origen_id and i.producto_id = l.producto_id)
                         else (select lp.existencia from piefirme.lotes_producto lp where lp.id = l.lote_id) end, 0) into v_disp;
    if v_disp < l.cantidad_enviada then
      raise exception 'existencia insuficiente en el origen (hay %, se envían %)', v_disp, l.cantidad_enviada using errcode = 'PF409';
    end if;
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, referencia_folio)
    values (t.organizacion_id, t.sede_origen_id, l.producto_id, l.lote_id, 'traspaso_salida', -l.cantidad_enviada, l.cp, 'traspaso', t.id, t.folio);
    update piefirme.traspaso_lineas set costo_unitario = l.cp where id = l.id;
  end loop;
  update piefirme.traspasos set estado = 'enviado', enviado_por = auth.uid(), enviado_en = now(), fecha_envio = coalesce(fecha_envio, current_date) where id = t.id;
end $$;

-- RPC · recibir: suma al destino lo recibido; diferencias → reclamación pendiente (P-080)
-- p_lineas: [{"linea_id": uuid, "cantidad_recibida": n, "motivo": "Faltante"}]; null = recibido completo
create or replace function piefirme.traspaso_recibir(p_traspaso uuid, p_lineas jsonb default null) returns text
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t piefirme.traspasos%rowtype; x record; l record; v_lote uuid; v_lo piefirme.lotes_producto%rowtype; v_dif boolean := false; v_estado text;
begin
  perform set_config('app.c_rpc', 'on', true);
  select * into t from piefirme.traspasos where id = p_traspaso for update;
  if not found then raise exception 'traspaso inexistente' using errcode = 'PF404'; end if;
  if t.estado <> 'enviado' then raise exception 'el traspaso está %, no se puede recibir', t.estado using errcode = 'PF409'; end if;
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') or not piefirme_app.puede_sede(t.sede_destino_id) then
    raise exception 'sin permiso para recibir en esta sede' using errcode = '42501';
  end if;
  if p_lineas is not null then
    for x in select * from jsonb_to_recordset(p_lineas) as r(linea_id uuid, cantidad_recibida numeric, motivo text) loop
      update piefirme.traspaso_lineas set cantidad_recibida = x.cantidad_recibida, motivo_diferencia = x.motivo
       where id = x.linea_id and traspaso_id = t.id;
    end loop;
  end if;
  update piefirme.traspaso_lineas set cantidad_recibida = cantidad_enviada where traspaso_id = t.id and cantidad_recibida is null;
  for l in select * from piefirme.traspaso_lineas where traspaso_id = t.id loop
    v_lote := null;
    if l.cantidad_recibida > 0 then
      if l.lote_id is not null then
        select * into v_lo from piefirme.lotes_producto where id = l.lote_id;
        select id into v_lote from piefirme.lotes_producto
         where sede_id = t.sede_destino_id and producto_id = l.producto_id
           and coalesce(numero_lote, '') = coalesce(v_lo.numero_lote, '') and coalesce(caducidad, date '1900-01-01') = coalesce(v_lo.caducidad, date '1900-01-01');
        if v_lote is null then
          v_lote := gen_random_uuid();
          insert into piefirme.lotes_producto (id, organizacion_id, sede_id, producto_id, numero_lote, caducidad, proveedor_id, estado)
          values (v_lote, t.organizacion_id, t.sede_destino_id, l.producto_id, v_lo.numero_lote, v_lo.caducidad, v_lo.proveedor_id,
                  case when v_lo.estado = 'bloqueado' then 'bloqueado' else 'vigente' end);
        end if;
      end if;
      insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, referencia_folio)
      values (t.organizacion_id, t.sede_destino_id, l.producto_id, v_lote, 'traspaso_entrada', l.cantidad_recibida, l.costo_unitario, 'traspaso', t.id, t.folio);
    end if;
    if l.cantidad_recibida < l.cantidad_enviada then
      v_dif := true;
      insert into piefirme.mermas (organizacion_id, sede_id, producto_id, lote_id, cantidad, motivo, tipo, es_reclamacion, traspaso_id)
      values (t.organizacion_id, t.sede_destino_id, l.producto_id, coalesce(v_lote, l.lote_id), l.cantidad_enviada - l.cantidad_recibida,
              coalesce(l.motivo_diferencia, 'Diferencia en recepción del traspaso ' || t.folio), 'reclamacion_traspaso', true, t.id);
    end if;
  end loop;
  v_estado := case when v_dif then 'recibido_con_diferencias' else 'recibido_completo' end;
  update piefirme.traspasos set estado = v_estado, recibio_por = auth.uid(), recibido_en = now() where id = t.id;
  return v_estado;
end $$;

-- RPC · cancelar: borrador (Recepción/Admin) o ya enviado (solo Administración; regresa el stock al origen)
create or replace function piefirme.traspaso_cancelar(p_traspaso uuid, p_motivo text) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t piefirme.traspasos%rowtype; l record;
begin
  perform set_config('app.c_rpc', 'on', true);
  select * into t from piefirme.traspasos where id = p_traspaso for update;
  if not found then raise exception 'traspaso inexistente' using errcode = 'PF404'; end if;
  if t.estado not in ('borrador', 'enviado') then raise exception 'el traspaso está %, no se cancela', t.estado using errcode = 'PF409'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'el motivo es obligatorio' using errcode = '22023'; end if;
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') or not (piefirme_app.puede_sede(t.sede_origen_id) or piefirme_app.puede_sede(t.sede_destino_id)) then
    raise exception 'sin permiso' using errcode = '42501';
  end if;
  if t.estado = 'enviado' then
    if not piefirme_app.es_admin() then raise exception 'solo Administración cancela un traspaso ya enviado' using errcode = '42501'; end if;
    for l in select * from piefirme.traspaso_lineas where traspaso_id = t.id loop
      insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, referencia_folio, nota)
      values (t.organizacion_id, t.sede_origen_id, l.producto_id, l.lote_id, 'traspaso_entrada', l.cantidad_enviada, l.costo_unitario, 'traspaso', t.id, t.folio, 'cancelación: ' || p_motivo);
    end loop;
  end if;
  update piefirme.traspasos set estado = 'cancelado', cancelado_motivo = p_motivo where id = t.id;
end $$;

-- ───────────────────────────── órdenes de compra (E94, E95) ─────────────────────────────
create table piefirme.ordenes_compra (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                uuid not null references piefirme.sedes(id),       -- toda OC tiene sede que recibe (CA-20)
  proveedor_id           uuid not null references piefirme.proveedores(id),
  folio                  text,
  fecha                  date not null default current_date,
  entrega_esperada       date,
  condiciones_pago       text not null default 'contado',
  dias_credito           integer not null default 0 check (dias_credito >= 0),
  moneda                 text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  solicita_id            uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  referencia_cotizacion  text,
  cotizacion_url         text,
  notas                  text,
  subtotal               numeric(14,2) not null default 0,
  descuento              numeric(14,2) not null default 0,
  iva                    numeric(14,2) not null default 0,
  total                  numeric(14,2) not null default 0,
  estado                 text not null default 'borrador' check (estado in ('borrador', 'enviada', 'recibida_parcial', 'recibida', 'cancelada')),
  estado_pago            text not null default 'sin_pago' check (estado_pago in ('sin_pago', 'por_pagar', 'pagada')),
  requiere_autorizacion  boolean not null default false,                  -- total >= parámetro compra_autorizacion_desde (P-081)
  autorizada_por         uuid references piefirme.perfiles(id) on delete set null,
  autorizada_en          timestamptz,
  enviada_en             timestamptz,
  cancelada_motivo       text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.ordenes_compra (organizacion_id, sede_id, estado);
create index on piefirme.ordenes_compra (organizacion_id, proveedor_id);

create table piefirme.oc_lineas (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid not null references piefirme.sedes(id),
  oc_id             uuid not null references piefirme.ordenes_compra(id) on delete cascade,
  producto_id       uuid not null references piefirme.productos(id),
  descripcion       text,                                                -- presentación
  cantidad          numeric(14,3) not null check (cantidad > 0),
  costo_unitario    numeric(14,4) not null check (costo_unitario >= 0),   -- sin IVA
  descuento_pct     numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  iva_pct           numeric(5,2) not null default 16 check (iva_pct between 0 and 100),
  ultimo_costo      numeric(14,4),                                        -- costo anterior para mostrar variación
  -- Descuento una sola vez por línea y IVA sobre la base neta (CA-21, P-057)
  base_neta         numeric(14,2) generated always as (round(cantidad * costo_unitario * (1 - descuento_pct / 100), 2)) stored,
  iva_monto         numeric(14,2) generated always as (round(round(cantidad * costo_unitario * (1 - descuento_pct / 100), 2) * iva_pct / 100, 2)) stored,
  importe           numeric(14,2) generated always as (round(cantidad * costo_unitario * (1 - descuento_pct / 100), 2)
                                                       + round(round(cantidad * costo_unitario * (1 - descuento_pct / 100), 2) * iva_pct / 100, 2)) stored,
  cantidad_recibida numeric(14,3) not null default 0 check (cantidad_recibida >= 0),
  created_at        timestamptz not null default now(),
  unique (oc_id, producto_id)
);
create index on piefirme.oc_lineas (organizacion_id, oc_id);

create trigger t_folio before insert on piefirme.ordenes_compra for each row execute function piefirme_app.c_asignar_folio('OC', 'sede_id');
create trigger t_a_padre before insert on piefirme.oc_lineas for each row execute function piefirme_app.c_heredar_de_padre('ordenes_compra', 'oc_id');

create or replace function piefirme_app.c_oc_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not exists (select 1 from piefirme.proveedores p where p.id = new.proveedor_id and p.organizacion_id = new.organizacion_id)
     or not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'proveedor o sede de otra clínica' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then raise exception 'la orden nace en borrador' using errcode = 'PF409'; end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'borrador' and new.estado in ('enviada', 'cancelada'))
         or (old.estado = 'enviada' and new.estado in ('recibida_parcial', 'recibida', 'cancelada'))
         or (old.estado = 'recibida_parcial' and new.estado = 'recibida')) then
      raise exception 'transición de orden de compra no permitida: % → %', old.estado, new.estado using errcode = 'PF409';
    end if;
    if new.estado in ('recibida_parcial', 'recibida') and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
      raise exception 'la orden pasa a recibida al registrar la recepción' using errcode = 'PF409';
    end if;
    if new.estado = 'enviada' then
      if new.requiere_autorizacion and new.autorizada_por is null then
        raise exception 'la orden de % requiere autorización de Administración antes de enviarse (P-081)', new.total using errcode = 'PF409';
      end if;
      if not exists (select 1 from piefirme.oc_lineas where oc_id = new.id) then
        raise exception 'la orden no tiene partidas' using errcode = 'PF409';
      end if;
      new.enviada_en := now();
    end if;
    if new.estado = 'cancelada' and coalesce(trim(new.cancelada_motivo), '') = '' then
      raise exception 'indica el motivo de la cancelación' using errcode = '22023';
    end if;
  elsif old.estado <> 'borrador' and coalesce(current_setting('app.c_rpc', true), '') <> 'on'
        and (new.proveedor_id, new.sede_id, new.condiciones_pago, new.moneda) is distinct from (old.proveedor_id, old.sede_id, old.condiciones_pago, old.moneda) then
    raise exception 'la orden ya no está en borrador: no se cambian proveedor, sede ni condiciones' using errcode = 'PF409';
  end if;
  if new.autorizada_por is distinct from old.autorizada_por then
    if new.autorizada_por is not null then
      if not piefirme_app.es_admin() and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
        raise exception 'solo Administración autoriza compras' using errcode = '42501';
      end if;
      new.autorizada_por := coalesce(new.autorizada_por, auth.uid());
      new.autorizada_en := now();
    else
      new.autorizada_en := null;
    end if;
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.ordenes_compra for each row execute function piefirme_app.c_oc_bi();

create or replace function piefirme_app.c_oc_linea_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_estado text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (baja de la clínica)
  select estado into v_estado from piefirme.ordenes_compra where id = coalesce(new.oc_id, old.oc_id);
  if tg_op = 'DELETE' then
    if v_estado <> 'borrador' then raise exception 'la orden ya no está en borrador' using errcode = 'PF409'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' or (new.cantidad, new.costo_unitario, new.descuento_pct, new.iva_pct, new.producto_id) is distinct from (old.cantidad, old.costo_unitario, old.descuento_pct, old.iva_pct, old.producto_id) then
    if v_estado <> 'borrador' then raise exception 'la orden ya no está en borrador' using errcode = 'PF409'; end if;
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from piefirme.productos p where p.id = new.producto_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'producto de otra clínica' using errcode = '42501';
    end if;
    new.ultimo_costo := coalesce(new.ultimo_costo,
        (select h.costo from piefirme.historico_costos h where h.producto_id = new.producto_id order by h.fecha desc, h.created_at desc limit 1));
  end if;
  return new;
end $$;
create trigger t_bi before insert or update or delete on piefirme.oc_lineas for each row execute function piefirme_app.c_oc_linea_bi();

create or replace function piefirme_app.c_oc_totales() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := coalesce(new.oc_id, old.oc_id); v_ant numeric; v_tot numeric;
begin
  select total into v_ant from piefirme.ordenes_compra where id = v_id;
  update piefirme.ordenes_compra o set
    subtotal = x.sub, descuento = x.des, iva = x.iva, total = x.tot,
    requiere_autorizacion = x.tot >= piefirme_app.c_param(o.organizacion_id, 'compra_autorizacion_desde', 5000)
   from (select coalesce(sum(round(l.cantidad * l.costo_unitario, 2)), 0) sub,
                coalesce(sum(round(l.cantidad * l.costo_unitario, 2) - l.base_neta), 0) des,
                coalesce(sum(l.iva_monto), 0) iva, coalesce(sum(l.importe), 0) tot
           from piefirme.oc_lineas l where l.oc_id = v_id) x
  where o.id = v_id returning o.total into v_tot;
  -- si el total cambia, la autorización previa ya no vale
  if v_ant is distinct from v_tot then
    update piefirme.ordenes_compra set autorizada_por = null, autorizada_en = null where id = v_id and autorizada_por is not null and estado = 'borrador';
  end if;
  return null;
end $$;
create trigger t_tot after insert or update of cantidad, costo_unitario, descuento_pct, iva_pct or delete on piefirme.oc_lineas for each row execute function piefirme_app.c_oc_totales();

-- RPC · autorizar la compra (Administración)
create or replace function piefirme.oc_autorizar(p_oc uuid) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración autoriza compras (P-081)' using errcode = '42501'; end if;
  update piefirme.ordenes_compra set autorizada_por = auth.uid() where id = p_oc and estado = 'borrador';
  if not found then raise exception 'la orden no existe o ya no está en borrador' using errcode = 'PF409'; end if;
end $$;
revoke all on function piefirme.oc_autorizar(uuid) from public, anon;
grant execute on function piefirme.oc_autorizar(uuid) to authenticated;

-- ───────────────────────────── recepciones (E96) ─────────────────────────────
create table piefirme.recepciones (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id              uuid not null references piefirme.sedes(id),
  oc_id                uuid not null references piefirme.ordenes_compra(id),
  folio                text,
  fecha                date not null default current_date,
  recibio_id           uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  estado               text not null default 'parcial' check (estado in ('completa', 'parcial')),
  -- factura o remisión del proveedor: de aquí nace la cuenta por pagar (P-081, trigger en 046)
  factura_numero       text,
  factura_importe      numeric(14,2) check (factura_importe is null or factura_importe >= 0),
  factura_url          text,
  factura_vencimiento  date,
  cfdi_uuid            text,
  cuenta_por_pagar_id  uuid,                                   -- FK en 046
  nota                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.recepciones (organizacion_id, oc_id);
create index on piefirme.recepciones (organizacion_id, sede_id, fecha desc);

create table piefirme.recepcion_lineas (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid not null references piefirme.sedes(id),
  recepcion_id      uuid not null references piefirme.recepciones(id) on delete cascade,
  oc_linea_id       uuid not null references piefirme.oc_lineas(id),
  producto_id       uuid references piefirme.productos(id),
  cantidad_recibida numeric(14,3) not null check (cantidad_recibida > 0),
  numero_lote       text,
  caducidad         date,
  costo_real        numeric(14,4) check (costo_real is null or costo_real >= 0),
  lote_id           uuid references piefirme.lotes_producto(id),
  movimiento_id     uuid references piefirme.movimientos_inventario(id),
  created_at        timestamptz not null default now()
);
create index on piefirme.recepcion_lineas (organizacion_id, recepcion_id);

create trigger t_folio before insert on piefirme.recepciones for each row execute function piefirme_app.c_asignar_folio('REC', 'sede_id');
create trigger t_a_padre before insert on piefirme.recepcion_lineas for each row execute function piefirme_app.c_heredar_de_padre('recepciones', 'recepcion_id');

create or replace function piefirme_app.c_recepcion_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o piefirme.ordenes_compra%rowtype;
begin
  select * into o from piefirme.ordenes_compra where id = new.oc_id;
  if not found or o.organizacion_id <> new.organizacion_id then raise exception 'orden de compra inexistente' using errcode = 'PF404'; end if;
  if tg_op = 'INSERT' then
    if o.estado not in ('enviada', 'recibida_parcial') then
      raise exception 'la orden está %: solo se recibe una orden enviada o con recepción parcial', o.estado using errcode = 'PF409';
    end if;
    new.sede_id := o.sede_id;
  end if;
  return new;
end $$;
create trigger t_bi before insert on piefirme.recepciones for each row execute function piefirme_app.c_recepcion_bi();

-- Registrar una línea: crea/usa lote, mete al kardex como compra (recalcula costo promedio e histórico) y avanza la OC
create or replace function piefirme_app.c_recepcion_linea_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r piefirme.recepciones%rowtype; ol piefirme.oc_lineas%rowtype; p piefirme.productos%rowtype; v_costo numeric; v_lote uuid; v_prov uuid; v_mov uuid := gen_random_uuid();
begin
  perform set_config('app.c_rpc', 'on', true);
  select * into r from piefirme.recepciones where id = new.recepcion_id;
  select * into ol from piefirme.oc_lineas where id = new.oc_linea_id;
  if ol.oc_id <> r.oc_id then raise exception 'la partida no pertenece a la orden de la recepción' using errcode = 'PF409'; end if;
  if ol.cantidad_recibida + new.cantidad_recibida > ol.cantidad then
    raise exception 'se recibe más de lo ordenado (ordenado %, ya recibido %, ahora %)', ol.cantidad, ol.cantidad_recibida, new.cantidad_recibida using errcode = 'PF409';
  end if;
  select * into p from piefirme.productos where id = ol.producto_id;
  if (p.maneja_lote and coalesce(new.numero_lote, '') = '') then raise exception 'el producto % exige número de lote', p.nombre using errcode = 'PF409'; end if;
  if (p.maneja_caducidad and new.caducidad is null) then raise exception 'el producto % exige fecha de caducidad', p.nombre using errcode = 'PF409'; end if;
  new.producto_id := ol.producto_id;
  new.sede_id := r.sede_id;
  v_costo := coalesce(new.costo_real, round(ol.costo_unitario * (1 - ol.descuento_pct / 100), 4));
  new.costo_real := v_costo;
  select proveedor_id into v_prov from piefirme.ordenes_compra where id = r.oc_id;
  v_lote := null;
  if coalesce(new.numero_lote, '') <> '' or new.caducidad is not null then
    select id into v_lote from piefirme.lotes_producto
     where sede_id = r.sede_id and producto_id = ol.producto_id
       and coalesce(numero_lote, '') = coalesce(new.numero_lote, '') and coalesce(caducidad, date '1900-01-01') = coalesce(new.caducidad, date '1900-01-01');
    if v_lote is null then
      v_lote := gen_random_uuid();
      insert into piefirme.lotes_producto (id, organizacion_id, sede_id, producto_id, numero_lote, caducidad, proveedor_id, recibido_en)
      values (v_lote, r.organizacion_id, r.sede_id, ol.producto_id, nullif(new.numero_lote, ''), new.caducidad, v_prov, r.fecha);
    end if;
  end if;
  insert into piefirme.movimientos_inventario (id, organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, referencia_folio, fecha)
  values (v_mov, r.organizacion_id, r.sede_id, ol.producto_id, v_lote, 'compra', new.cantidad_recibida, v_costo, 'recepcion', r.id, r.folio,
          case when r.fecha >= current_date then now() else r.fecha::timestamptz + interval '12 hours' end);
  new.lote_id := v_lote;
  new.movimiento_id := v_mov;
  -- costo del proveedor para «último costo y variación»
  insert into piefirme.proveedor_productos (organizacion_id, proveedor_id, producto_id, ultimo_costo, ultima_compra)
  values (r.organizacion_id, v_prov, ol.producto_id, v_costo, r.fecha)
  on conflict (proveedor_id, producto_id) do update set ultimo_costo = excluded.ultimo_costo, ultima_compra = excluded.ultima_compra, updated_at = now();
  update piefirme.oc_lineas set cantidad_recibida = cantidad_recibida + new.cantidad_recibida where id = ol.id;
  return new;
end $$;
create trigger t_bi before insert on piefirme.recepcion_lineas for each row execute function piefirme_app.c_recepcion_linea_bi();

-- Después de cada línea: estado de la OC y de la recepción
create or replace function piefirme_app.c_recepcion_linea_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_oc uuid; v_completa boolean; v_alguna boolean;
begin
  perform set_config('app.c_rpc', 'on', true);
  select oc_id into v_oc from piefirme.recepciones where id = new.recepcion_id;
  select bool_and(cantidad_recibida >= cantidad), bool_or(cantidad_recibida > 0) into v_completa, v_alguna from piefirme.oc_lineas where oc_id = v_oc;
  update piefirme.ordenes_compra set estado = case when v_completa then 'recibida' else 'recibida_parcial' end
   where id = v_oc and estado in ('enviada', 'recibida_parcial') and estado is distinct from case when v_completa then 'recibida' else 'recibida_parcial' end;
  update piefirme.recepciones set estado = case when v_completa then 'completa' else 'parcial' end where id = new.recepcion_id;
  return null;
end $$;
create trigger t_ai after insert on piefirme.recepcion_lineas for each row execute function piefirme_app.c_recepcion_linea_ai();

create trigger t_inm before update or delete on piefirme.recepcion_lineas for each row execute function piefirme_app.c_inmutable();

-- RPC · registrar recepción completa en una llamada
-- p_lineas: [{"oc_linea_id":uuid,"cantidad_recibida":n,"numero_lote":"…","caducidad":"YYYY-MM-DD","costo_real":n}]
-- p_factura: {"numero":"…","importe":n,"url":"…","vencimiento":"YYYY-MM-DD","cfdi_uuid":"…","nota":"…"}
create or replace function piefirme.recepcion_registrar(p_oc uuid, p_lineas jsonb, p_factura jsonb default null) returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o piefirme.ordenes_compra%rowtype; v_id uuid := gen_random_uuid(); x record;
begin
  select * into o from piefirme.ordenes_compra where id = p_oc;
  if not found then raise exception 'orden inexistente' using errcode = 'PF404'; end if;
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') or not piefirme_app.puede_sede(o.sede_id) then
    raise exception 'sin permiso para recibir en esta sede' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'la recepción no tiene partidas' using errcode = '22023';
  end if;
  insert into piefirme.recepciones (id, organizacion_id, sede_id, oc_id, factura_numero, factura_importe, factura_url, factura_vencimiento, cfdi_uuid, nota)
  values (v_id, o.organizacion_id, o.sede_id, o.id, p_factura ->> 'numero', nullif(p_factura ->> 'importe', '')::numeric, p_factura ->> 'url',
          nullif(p_factura ->> 'vencimiento', '')::date, p_factura ->> 'cfdi_uuid', p_factura ->> 'nota');
  for x in select * from jsonb_to_recordset(p_lineas) as r(oc_linea_id uuid, cantidad_recibida numeric, numero_lote text, caducidad date, costo_real numeric) loop
    insert into piefirme.recepcion_lineas (recepcion_id, oc_linea_id, cantidad_recibida, numero_lote, caducidad, costo_real)
    values (v_id, x.oc_linea_id, x.cantidad_recibida, x.numero_lote, x.caducidad, x.costo_real);
  end loop;
  return v_id;
end $$;
revoke all on function piefirme.recepcion_registrar(uuid, jsonb, jsonb) from public, anon;
grant execute on function piefirme.recepcion_registrar(uuid, jsonb, jsonb) to authenticated;

-- Devolución a proveedor (E96): saca del inventario; el crédito se aplica en la cuenta por pagar (046)
create table piefirme.devoluciones_proveedor (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid not null references piefirme.sedes(id),
  recepcion_id      uuid references piefirme.recepciones(id) on delete set null,
  proveedor_id      uuid not null references piefirme.proveedores(id),
  producto_id       uuid not null references piefirme.productos(id),
  lote_id           uuid references piefirme.lotes_producto(id),
  cantidad          numeric(14,3) not null check (cantidad > 0),
  motivo            text not null,
  monto_credito     numeric(14,2) not null default 0 check (monto_credito >= 0),
  fecha             date not null default current_date,
  movimiento_id     uuid references piefirme.movimientos_inventario(id),
  registrado_por    uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index on piefirme.devoluciones_proveedor (organizacion_id, sede_id, fecha desc);

create or replace function piefirme_app.c_devolucion_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_mov uuid := gen_random_uuid();
begin
  insert into piefirme.movimientos_inventario (id, organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, nota)
  values (v_mov, new.organizacion_id, new.sede_id, new.producto_id, new.lote_id, 'devolucion_proveedor', -new.cantidad, 'devolucion', new.id, new.motivo);
  new.movimiento_id := v_mov;
  return new;
end $$;
create trigger t_bi before insert on piefirme.devoluciones_proveedor for each row execute function piefirme_app.c_devolucion_bi();
create trigger t_inm before update or delete on piefirme.devoluciones_proveedor for each row execute function piefirme_app.c_inmutable();

-- ───────────────────────────── RLS ─────────────────────────────
-- Traspasos: Recepción y Administración operan en las sedes de origen o destino; Podólogo no los ve (MATRIZ_ROLES §4.3)
alter table piefirme.traspasos enable row level security;
alter table piefirme.traspaso_lineas enable row level security;
create policy traspasos_sel on piefirme.traspasos for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'recepcion') and (piefirme_app.puede_sede(sede_origen_id) or piefirme_app.puede_sede(sede_destino_id)));
create policy traspasos_ins on piefirme.traspasos for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'recepcion') and (piefirme_app.puede_sede(sede_origen_id) or piefirme_app.puede_sede(sede_destino_id)));
create policy traspasos_upd on piefirme.traspasos for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol()::text in ('administrador', 'recepcion') and (piefirme_app.puede_sede(sede_origen_id) or piefirme_app.puede_sede(sede_destino_id)))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.rol()::text in ('administrador', 'recepcion') and (piefirme_app.puede_sede(sede_origen_id) or piefirme_app.puede_sede(sede_destino_id)));
create policy traspasos_del on piefirme.traspasos for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and estado = 'borrador' and piefirme_app.rol()::text in ('administrador', 'recepcion') and piefirme_app.puede_sede(sede_origen_id));
create policy traspaso_lineas_sel on piefirme.traspaso_lineas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and exists (select 1 from piefirme.traspasos t where t.id = traspaso_id));
create policy traspaso_lineas_ins on piefirme.traspaso_lineas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and exists (select 1 from piefirme.traspasos t where t.id = traspaso_id));
create policy traspaso_lineas_upd on piefirme.traspaso_lineas for update to authenticated
  using (organizacion_id = piefirme_app.org_id() and exists (select 1 from piefirme.traspasos t where t.id = traspaso_id))
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and exists (select 1 from piefirme.traspasos t where t.id = traspaso_id));
create policy traspaso_lineas_del on piefirme.traspaso_lineas for delete to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and exists (select 1 from piefirme.traspasos t where t.id = traspaso_id and t.estado = 'borrador'));

select piefirme_app.c_politicas('ordenes_compra', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'],
                       p_del => array['administrador'], p_cond_del => $c$estado = 'borrador'$c$);
select piefirme_app.c_politicas('oc_lineas', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador']);
select piefirme_app.c_politicas('recepciones', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador']);
select piefirme_app.c_politicas('recepcion_lineas', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array[]::text[]);
select piefirme_app.c_politicas('devoluciones_proveedor', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array[]::text[]);
select piefirme_app.c_triggers('traspasos');
select piefirme_app.c_triggers('traspaso_lineas', false);
select piefirme_app.c_triggers('ordenes_compra');
select piefirme_app.c_triggers('oc_lineas', false);
select piefirme_app.c_triggers('recepciones');
select piefirme_app.c_triggers('recepcion_lineas', false);
select piefirme_app.c_triggers('devoluciones_proveedor');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_traspasos with (security_invoker = true) as
select t.id, t.organizacion_id, t.folio, t.estado, t.sede_origen_id, so.nombre as sede_origen, t.sede_destino_id, sd.nombre as sede_destino,
       t.fecha_envio, t.fecha_estimada, t.solicito_id, t.responsable_envio_id, t.transporte, t.comentarios,
       t.partidas, t.unidades, t.valor_total, t.enviado_en, t.recibido_en, t.recibio_por, t.cancelado_motivo, t.created_at,
       (select count(*) from piefirme.traspaso_lineas l where l.traspaso_id = t.id and coalesce(l.cantidad_recibida, l.cantidad_enviada) < l.cantidad_enviada) as partidas_con_diferencia
  from piefirme.traspasos t
  join piefirme.sedes so on so.id = t.sede_origen_id
  join piefirme.sedes sd on sd.id = t.sede_destino_id;

create or replace view piefirme.prp_traspaso_lineas with (security_invoker = true) as
select l.id, l.organizacion_id, l.traspaso_id, l.producto_id, l.lote_id, l.cantidad_enviada, l.cantidad_recibida, l.diferencia, l.motivo_diferencia,
       coalesce(l.costo_unitario, pr.costo_promedio) as costo_unitario,
       round(l.cantidad_enviada * coalesce(l.costo_unitario, pr.costo_promedio), 2) as valor,
       (select i.existencia from piefirme.inventario_sede i join piefirme.traspasos t on t.id = l.traspaso_id where i.sede_id = t.sede_origen_id and i.producto_id = l.producto_id) as existencia_origen,
       (select i.existencia from piefirme.inventario_sede i join piefirme.traspasos t on t.id = l.traspaso_id where i.sede_id = t.sede_destino_id and i.producto_id = l.producto_id) as existencia_destino,
       (select i.minimo from piefirme.inventario_sede i join piefirme.traspasos t on t.id = l.traspaso_id where i.sede_id = t.sede_destino_id and i.producto_id = l.producto_id) as minimo_destino
  from piefirme.traspaso_lineas l join piefirme.productos pr on pr.id = l.producto_id;

create or replace view piefirme.prp_ordenes_compra with (security_invoker = true) as
select o.id, o.organizacion_id, o.folio, o.sede_id, s.nombre as sede_nombre, o.proveedor_id, p.nombre as proveedor_nombre, o.fecha, o.entrega_esperada,
       o.condiciones_pago, o.dias_credito, o.moneda, o.solicita_id, o.referencia_cotizacion, o.cotizacion_url, o.notas,
       o.subtotal, o.descuento, o.iva, o.total, o.estado, o.estado_pago, o.requiere_autorizacion, o.autorizada_por, o.autorizada_en, o.enviada_en, o.created_at,
       (o.requiere_autorizacion and o.autorizada_por is null and o.estado = 'borrador') as pendiente_autorizacion,
       (select count(*) from piefirme.oc_lineas l where l.oc_id = o.id) as partidas,
       (select coalesce(sum(l.cantidad - l.cantidad_recibida), 0) from piefirme.oc_lineas l where l.oc_id = o.id) as unidades_pendientes
  from piefirme.ordenes_compra o
  join piefirme.sedes s on s.id = o.sede_id
  join piefirme.proveedores p on p.id = o.proveedor_id;

create or replace view piefirme.prp_oc_lineas with (security_invoker = true) as
select l.id, l.organizacion_id, l.oc_id, l.producto_id, l.descripcion, l.cantidad, l.costo_unitario, l.descuento_pct, l.iva_pct, l.base_neta, l.iva_monto, l.importe,
       l.cantidad_recibida, (l.cantidad - l.cantidad_recibida) as pendiente, l.ultimo_costo,
       case when l.ultimo_costo is not null and l.ultimo_costo > 0 then round((l.costo_unitario - l.ultimo_costo) / l.ultimo_costo * 100, 2) end as variacion_pct
  from piefirme.oc_lineas l;

create or replace view piefirme.prp_recepciones with (security_invoker = true) as
select r.id, r.organizacion_id, r.folio, r.oc_id, o.folio as oc_folio, r.sede_id, r.fecha, r.recibio_id, r.estado,
       r.factura_numero, r.factura_importe, r.factura_url, r.factura_vencimiento, r.cfdi_uuid, r.cuenta_por_pagar_id, r.nota,
       o.proveedor_id, (select count(*) from piefirme.recepcion_lineas l where l.recepcion_id = r.id) as partidas
  from piefirme.recepciones r join piefirme.ordenes_compra o on o.id = r.oc_id;

-- ───────────────────────────── permisos ─────────────────────────────
revoke all on all tables in schema piefirme from anon;
revoke all on function piefirme.traspaso_enviar(uuid), piefirme.traspaso_recibir(uuid, jsonb), piefirme.traspaso_cancelar(uuid, text) from public, anon;
grant execute on function piefirme.traspaso_enviar(uuid), piefirme.traspaso_recibir(uuid, jsonb), piefirme.traspaso_cancelar(uuid, text) to authenticated;
