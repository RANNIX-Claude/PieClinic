-- 320 · Pedidos especiales (zapatos, plantillas y aditamentos a nombre de un cliente) · ESQUEMA.
-- Diseño acordado con el dueño: docs/pedidos_especiales_diagrama.html. Decisiones de diseño: docs/PEDIDOS_ESPECIALES.md.
--
-- Principio: el pedido NO duplica compras. Es la capa de «seguimiento al cliente» sobre lo que ya existe:
--   · el pedido al proveedor ES una orden de compra (ordenes_compra/oc_lineas) que nace al autorizar el propietario;
--   · «recibido» llama a la recepción de mercancía existente (recepcion_registrar → inventario por sucursal) y abre la cuenta por pagar;
--   · el anticipo es una fila de `anticipos` (misma tabla que las citas y plantillas) y se aplica al ticket de entrega como pago «anticipo»;
--   · el saldo pendiente vive en cuentas_por_cobrar con fecha límite; la entrega es un ticket normal (ventas) cobrado en Caja.
-- Todas las escrituras pasan por RPC (321); las tablas solo se pueden LEER con el token del usuario (RLS por organización, sede y rol).
-- Los costos estimados viven en una tabla aparte que solo ven administrador y supervisor (no se exponen a recepción ni podología).

-- ───────────────────────────── proveedor: contacto de WhatsApp y anticipo propio ─────────────────────────────
alter table piefirme.proveedores
  add column if not exists whatsapp_grupo    text,
  add column if not exists whatsapp_contacto text,
  add column if not exists anticipo_pct      numeric(5,2),
  add column if not exists pedidos_tipos     text[] not null default '{}';
do $$ begin
  alter table piefirme.proveedores add constraint proveedores_anticipo_pct_check check (anticipo_pct is null or (anticipo_pct >= 0 and anticipo_pct <= 100));
exception when duplicate_object then null; end $$;
comment on column piefirme.proveedores.whatsapp_grupo is 'Nombre del grupo de WhatsApp (o teléfono) donde se piden los pedidos especiales a este proveedor.';
comment on column piefirme.proveedores.anticipo_pct is 'Porcentaje de anticipo que se pide al cliente en pedidos de este proveedor; null = el de la organización (parámetro pedido_anticipo_pct, 50 por omisión).';
comment on column piefirme.proveedores.pedidos_tipos is 'Tipos de pedido que surte: zapato, plantilla, aditamento, otro. Vacío = cualquiera.';

-- ───────────────────────────── nota del cliente (agrupa los pedidos por proveedor) ─────────────────────────────
create table piefirme.pedido_notas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id),
  sede_id          uuid not null references piefirme.sedes(id),
  folio            text,
  paciente_id      uuid not null references piefirme.pacientes(id),
  fecha_prometida  date not null,
  plazo_saldo      date not null,
  total            numeric(14,2) not null default 0 check (total >= 0),
  anticipo_total   numeric(14,2) not null default 0 check (anticipo_total >= 0),
  nota             text,
  creado_por       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (plazo_saldo >= (created_at at time zone 'UTC')::date - 1)
);
create unique index pedido_notas_folio_uq on piefirme.pedido_notas (organizacion_id, folio);
create index pedido_notas_paciente_idx on piefirme.pedido_notas (organizacion_id, paciente_id);

-- ───────────────────────────── pedido (uno por proveedor) ─────────────────────────────
create table piefirme.pedidos_especiales (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id),
  sede_id            uuid not null references piefirme.sedes(id),
  nota_id            uuid not null references piefirme.pedido_notas(id),
  folio              text,
  paciente_id        uuid not null references piefirme.pacientes(id),
  proveedor_id       uuid not null references piefirme.proveedores(id),
  estado             text not null default 'solicitado'
                     check (estado in ('solicitado','anticipo_cobrado','autorizado','enviado_proveedor','aceptado','en_transito','recibido','entregado','en_espera','cancelado')),
  total              numeric(14,2) not null default 0 check (total >= 0),
  anticipo_pct       numeric(5,2) not null default 50 check (anticipo_pct >= 0 and anticipo_pct <= 100),
  anticipo_monto     numeric(14,2) not null default 0 check (anticipo_monto >= 0),
  saldo              numeric(14,2) generated always as (total - anticipo_monto) stored,
  fecha_prometida    date not null,
  plazo_saldo        date not null,
  -- solicitud y anticipo
  solicitado_por     uuid,
  anticipo_id        uuid references piefirme.anticipos(id),
  anticipo_cobrado_en timestamptz,
  cuenta_cobrar_id   uuid references piefirme.cuentas_por_cobrar(id),
  -- autorización del propietario
  autorizado_por     uuid,
  autorizado_en      timestamptz,
  -- espera (rechazo del propietario o del proveedor) y cancelación
  espera_origen      text check (espera_origen in ('propietario','proveedor')),
  espera_motivo      text,
  destino_anticipo   text check (destino_anticipo in ('devolucion','saldo_favor')),
  espera_en          timestamptz,
  cancelado_motivo   text,
  cancelado_por      uuid,
  cancelado_en       timestamptz,
  -- petición, aceptación y envío
  mensaje_enviado_en timestamptz,
  aceptado_en        timestamptz,
  aceptado_por       uuid,
  fecha_acordada     date,
  respuesta_proveedor text,
  guia_envio         text,
  fecha_estimada_llegada date,
  transito_en        timestamptz,
  -- compra y recepción (reutiliza ordenes_compra / recepciones / cuentas_por_pagar)
  oc_id              uuid references piefirme.ordenes_compra(id),
  recepcion_id       uuid references piefirme.recepciones(id),
  cuenta_pagar_id    uuid references piefirme.cuentas_por_pagar(id),
  recibido_en        timestamptz,
  recibido_por       uuid,
  -- entrega y cobro del saldo
  venta_id           uuid references piefirme.ventas(id),
  entregado_en       timestamptz,
  entregado_por      uuid,
  saldo_cobrado      numeric(14,2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (anticipo_monto <= total),
  check (estado <> 'en_espera' or (coalesce(btrim(espera_motivo), '') <> '' and espera_origen is not null)),
  check (estado <> 'cancelado' or coalesce(btrim(cancelado_motivo), '') <> ''),
  check (estado not in ('autorizado','enviado_proveedor','aceptado','en_transito','recibido','entregado') or autorizado_por is not null),
  check (estado <> 'entregado' or (venta_id is not null and entregado_en is not null))
);
create unique index pedidos_especiales_folio_uq on piefirme.pedidos_especiales (organizacion_id, folio);
create index pedidos_especiales_nota_idx on piefirme.pedidos_especiales (nota_id);
create index pedidos_especiales_sede_estado_idx on piefirme.pedidos_especiales (organizacion_id, sede_id, estado);
create index pedidos_especiales_proveedor_idx on piefirme.pedidos_especiales (organizacion_id, proveedor_id);
create index pedidos_especiales_paciente_idx on piefirme.pedidos_especiales (organizacion_id, paciente_id);
create index pedidos_especiales_oc_idx on piefirme.pedidos_especiales (oc_id) where oc_id is not null;

-- ───────────────────────────── partidas ─────────────────────────────
create table piefirme.pedido_especial_lineas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id),
  sede_id          uuid not null references piefirme.sedes(id),
  pedido_id        uuid not null references piefirme.pedidos_especiales(id) on delete cascade,
  orden            integer not null default 1,
  tipo_item        text not null check (tipo_item in ('zapato','plantilla','aditamento','otro')),
  producto_id      uuid not null references piefirme.productos(id),   -- producto «por encargo» de la compra al proveedor
  servicio_id      uuid not null references piefirme.servicios(id),   -- producto especial con características (patrón de Caja) para el ticket de entrega
  descripcion      text not null check (btrim(descripcion) <> ''),
  caracteristicas  jsonb not null default '[]'::jsonb,                -- [{grupo,nombre,frase,valor,unidad,efecto_precio,monto_unitario}]
  cantidad         numeric(10,2) not null check (cantidad > 0),
  precio_unitario  numeric(14,2) not null check (precio_unitario > 0),  -- precio de venta final (base + características); no lo cambia el cajero
  importe          numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  oc_linea_id      uuid references piefirme.oc_lineas(id),
  created_at       timestamptz not null default now()
);
create index pedido_especial_lineas_pedido_idx on piefirme.pedido_especial_lineas (pedido_id);

-- Costo estimado de compra: tabla aparte, solo administrador y supervisor (costos nunca a recepción ni podología).
create table piefirme.pedido_especial_costos (
  linea_id         uuid primary key references piefirme.pedido_especial_lineas(id) on delete cascade,
  organizacion_id  uuid not null references piefirme.organizaciones(id),
  sede_id          uuid not null references piefirme.sedes(id),
  pedido_id        uuid not null references piefirme.pedidos_especiales(id) on delete cascade,
  costo_unitario   numeric(14,4) not null check (costo_unitario > 0),
  capturado_por    uuid,
  updated_at       timestamptz not null default now()
);
create index pedido_especial_costos_pedido_idx on piefirme.pedido_especial_costos (pedido_id);

-- ───────────────────────────── bitácora inmutable de cambios de estado ─────────────────────────────
create table piefirme.pedido_especial_bitacora (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id),
  sede_id          uuid not null references piefirme.sedes(id),
  pedido_id        uuid not null references piefirme.pedidos_especiales(id) on delete cascade,
  accion           text not null default 'estado' check (accion in ('estado','recordatorio','costos','mensaje')),
  estado_anterior  text,
  estado_nuevo     text,
  usuario_id       uuid default auth.uid(),
  en               timestamptz not null default clock_timestamp(),   -- hora real del servidor (no la del cliente)
  motivo           text,
  detalle          jsonb not null default '{}'::jsonb
);
create index pedido_especial_bitacora_pedido_idx on piefirme.pedido_especial_bitacora (pedido_id, en);
create trigger t_inm_upd before update or delete on piefirme.pedido_especial_bitacora for each row execute function piefirme_app.c_inmutable();

-- Petición al proveedor: registro de lo enviado (mensaje sin datos personales del cliente: solo iniciales y referencia).
create table piefirme.pedido_mensajes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id),
  sede_id          uuid not null references piefirme.sedes(id),
  pedido_id        uuid not null references piefirme.pedidos_especiales(id) on delete cascade,
  proveedor_id     uuid not null references piefirme.proveedores(id),
  canal            text not null check (canal in ('whatsapp_simulado','copiado_manual')),
  destino          text,
  texto            text not null,
  enviado_por      uuid default auth.uid(),
  enviado_en       timestamptz not null default clock_timestamp()
);
create index pedido_mensajes_pedido_idx on piefirme.pedido_mensajes (pedido_id, enviado_en);
create trigger t_inm_upd before update or delete on piefirme.pedido_mensajes for each row execute function piefirme_app.c_inmutable();

-- ───────────────────────────── anticipos: ligados al pedido y al turno que los cobró ─────────────────────────────
alter table piefirme.anticipos
  add column if not exists pedido_especial_id uuid references piefirme.pedidos_especiales(id),
  add column if not exists turno_id uuid references piefirme.turnos_caja(id);
alter table piefirme.anticipos drop constraint if exists anticipos_check;
alter table piefirme.anticipos add constraint anticipos_check
  check (cita_id is not null or plan_adquirido_id is not null or orden_plantilla_id is not null or reserva_portal_id is not null or pedido_especial_id is not null);
create index if not exists anticipos_pedido_idx on piefirme.anticipos (pedido_especial_id) where pedido_especial_id is not null;

-- ───────────────────────────── triggers: folio, hora, transiciones válidas y bitácora ─────────────────────────────
create trigger t_folio before insert on piefirme.pedido_notas for each row execute function piefirme_app.c_asignar_folio('NPE', 'sede_id');
create trigger t_folio before insert on piefirme.pedidos_especiales for each row execute function piefirme_app.c_asignar_folio('PED', 'sede_id');
create trigger t_upd before update on piefirme.pedido_notas for each row execute function piefirme_app.tocar_updated_at();
create trigger t_upd before update on piefirme.pedidos_especiales for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.pedidos_especiales for each row execute function piefirme_app.auditar();

create or replace function piefirme_app.pedido_bi() returns trigger language plpgsql security definer
  set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'solicitado' then raise exception 'un pedido nace solicitado' using errcode = 'PF409'; end if;
    if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id)
       or not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id)
       or not exists (select 1 from piefirme.proveedores v where v.id = new.proveedor_id and v.organizacion_id = new.organizacion_id) then
      raise exception 'el pedido mezcla datos de otra clínica' using errcode = 'PF403';
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    v_ok := (old.estado = 'solicitado'         and new.estado in ('anticipo_cobrado','cancelado'))
         or (old.estado = 'anticipo_cobrado'   and new.estado in ('autorizado','en_espera','cancelado'))
         or (old.estado = 'autorizado'         and new.estado in ('enviado_proveedor','en_espera','cancelado'))
         or (old.estado = 'enviado_proveedor'  and new.estado in ('aceptado','en_espera','cancelado'))
         or (old.estado = 'aceptado'           and new.estado in ('en_transito','recibido','en_espera','cancelado'))
         or (old.estado = 'en_transito'        and new.estado in ('recibido','en_espera','cancelado'))
         or (old.estado = 'recibido'           and new.estado = 'entregado')
         or (old.estado = 'en_espera'          and new.estado in ('solicitado','anticipo_cobrado','cancelado'));
    if not v_ok then raise exception 'transición de pedido no permitida: % → %', old.estado, new.estado using errcode = 'PF409'; end if;
    if new.estado = 'cancelado' then new.cancelado_en := coalesce(new.cancelado_en, now()); new.cancelado_por := coalesce(new.cancelado_por, auth.uid()); end if;
    if new.estado = 'en_espera' then new.espera_en := now(); end if;
    if new.estado = 'recibido' and (new.recepcion_id is null or new.recibido_por is null) then
      raise exception 'recibido exige la recepción de mercancía y quién la hizo' using errcode = 'PF409';
    end if;
  elsif old.estado in ('entregado','cancelado') then
    raise exception 'el pedido ya está %: no se modifica', old.estado using errcode = 'PF409';
  end if;
  if new.total is distinct from old.total or new.anticipo_monto is distinct from old.anticipo_monto then
    if old.estado not in ('solicitado') and coalesce(current_setting('app.pedido_rpc', true), '') <> 'on' then
      raise exception 'el dinero del pedido no cambia después de cobrar el anticipo' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.pedidos_especiales for each row execute function piefirme_app.pedido_bi();

-- Bitácora automática: cada alta y cada cambio de estado, con usuario y hora de servidor (el motivo viene de la RPC en app.pedido_motivo).
create or replace function piefirme_app.pedido_ai() returns trigger language plpgsql security definer
  set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_motivo text := nullif(btrim(coalesce(current_setting('app.pedido_motivo', true), '')), '');
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    insert into piefirme.pedido_especial_bitacora (organizacion_id, sede_id, pedido_id, accion, estado_anterior, estado_nuevo, usuario_id, motivo, detalle)
    values (new.organizacion_id, new.sede_id, new.id, 'estado', case when tg_op = 'UPDATE' then old.estado end, new.estado, auth.uid(), v_motivo,
            jsonb_strip_nulls(jsonb_build_object('folio', new.folio, 'total', new.total, 'anticipo', new.anticipo_monto,
              'fecha_acordada', new.fecha_acordada, 'guia', new.guia_envio, 'destino_anticipo', new.destino_anticipo)));
  end if;
  return null;
end $$;
create trigger t_bitacora after insert or update on piefirme.pedidos_especiales for each row execute function piefirme_app.pedido_ai();

-- Un anticipo ligado a un pedido en curso NO se aplica a otro ticket (solo al de la entrega del propio pedido o, si el pedido quedó en espera
-- con «saldo a favor», a cualquier compra del mismo cliente).
create or replace function piefirme_app.pedido_pago_anticipo_bi() returns trigger language plpgsql security definer
  set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  if new.metodo <> 'anticipo' or new.anticipo_id is null then return new; end if;
  select pe.* into p from piefirme.pedidos_especiales pe join piefirme.anticipos a on a.pedido_especial_id = pe.id where a.id = new.anticipo_id;
  if found and p.estado not in ('en_espera','cancelado') and coalesce(current_setting('app.pedido_cobro', true), '') <> 'on' then
    raise exception 'este anticipo pertenece al pedido % (%): se aplica al entregarlo', p.folio, p.estado using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_pedido_anticipo before insert on piefirme.pagos for each row execute function piefirme_app.pedido_pago_anticipo_bi();

-- ───────────────────────────── RLS: lectura por organización, sede y rol; escritura solo por RPC ─────────────────────────────
alter table piefirme.pedido_notas             enable row level security;
alter table piefirme.pedidos_especiales       enable row level security;
alter table piefirme.pedido_especial_lineas   enable row level security;
alter table piefirme.pedido_especial_costos   enable row level security;
alter table piefirme.pedido_especial_bitacora enable row level security;
alter table piefirme.pedido_mensajes          enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pedido_notas','pedidos_especiales','pedido_especial_lineas','pedido_especial_bitacora','pedido_mensajes'] loop
    execute format($f$create policy %1$I_sel on piefirme.%1$I for select to authenticated using (
      organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sede_id)
      and (piefirme_app.rol())::text = any ('{administrador,recepcion,podologo,supervisor}'::text[]))$f$, t);
  end loop;
end $$;
-- costos: solo administrador y supervisor
create policy pedido_especial_costos_sel on piefirme.pedido_especial_costos for select to authenticated using (
  organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sede_id) and (piefirme_app.rol())::text = any ('{administrador,supervisor}'::text[]));

revoke all on piefirme.pedido_notas, piefirme.pedidos_especiales, piefirme.pedido_especial_lineas, piefirme.pedido_especial_costos,
              piefirme.pedido_especial_bitacora, piefirme.pedido_mensajes from public, anon, authenticated;
grant select on piefirme.pedido_notas, piefirme.pedidos_especiales, piefirme.pedido_especial_lineas, piefirme.pedido_especial_costos,
                piefirme.pedido_especial_bitacora, piefirme.pedido_mensajes to authenticated;
grant all on piefirme.pedido_notas, piefirme.pedidos_especiales, piefirme.pedido_especial_lineas, piefirme.pedido_especial_costos,
             piefirme.pedido_especial_bitacora, piefirme.pedido_mensajes to service_role;
