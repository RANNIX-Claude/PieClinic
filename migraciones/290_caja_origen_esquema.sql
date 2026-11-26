-- 290 · Control y Auditoría · ETAPA 1 · CAMBIOS EN EL ORIGEN (la Caja de Pie Firme hace el papel de PODIX) · (1/4) ESQUEMA.
-- Los tres cambios que la especificación exige en el punto de venta (precio no editable, cancelaciones con bloqueo, apertura de cajón registrada) y la cola de eventos.
--   · Parámetros nuevos de ctl_config (por sucursal): lo que CAMBIA la operación del cajero queda APAGADO por omisión hasta que el dueño lo decida:
--       precio_abierto_con_clave · descuento_motivo_cerrado · cancelacion_con_bloqueo (0/1) y cancelacion_espera_seg (60 s).
--   · ctl_motivo: catálogo CERRADO de motivos (de descuento y de cancelación), sembrado por organización y administrable por el dueño.
--   · ctl_cancelacion (+ ctl_cancelacion_evento): la cancelación/devolución con espera. pendiente → autorizada | rechazada | pendiente_de_validacion.
--   · Columnas nuevas en el origen: venta_lineas (precio de catálogo congelado, precio abierto, motivo del catálogo, usuario y autorizador del descuento,
--     autorización de precio) y ventas (quién autorizó la cancelación) → v_ctl_cancelaciones deja de devolver el autorizador en null.
--   · Utilerías internas: emitir evento sin poder romper al origen, precio de catálogo a una fecha, verificación de clave de supervisor.
-- Todo con prefijo ctl_ y SIN llaves foráneas hacia el origen (decisión D2 de la Etapa 0). Depende de: 200–206, 210–213, 230–235, 240–241.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── parámetros nuevos ─────────────────────────────
insert into piefirme.ctl_config_def (clave, descripcion, tipo, omision, minimo, tope, opciones, unidad, confirma_dueno, explicacion_tope, orden) values
 ('precio_abierto_con_clave',  'El precio cotizado (servicios «a valorar», «desde», por unidad y productos especiales) exige clave de supervisor', 'num', '0', 0, 1, null, '0 = no · 1 = sí', false,
    'Es un interruptor: 0 deja el precio cotizado como hoy (lo captura el cajero); 1 exige la clave de un supervisor o del dueño y deja el autorizador en la línea.', 300),
 ('descuento_motivo_cerrado',  'Descuentos solo con motivo del catálogo cerrado y con el tope sin clave de este módulo', 'num', '0', 0, 1, null, '0 = no · 1 = sí', false,
    'Es un interruptor: 1 sustituye el motivo libre por el catálogo cerrado y aplica «descuento_sin_clave_pct» (0 % por omisión) como único tope sin clave.', 310),
 ('cancelacion_con_bloqueo',   'Cancelar un ticket con piezas exige escanear la pieza, foto en vivo, clave de supervisor y motivo del catálogo', 'num', '0', 0, 1, null, '0 = no · 1 = sí', false,
    'Es un interruptor: 1 deja la cancelación pendiente (la pieza NO vuelve al inventario) hasta que el módulo la autorice; sin respuesta queda pendiente de validación y nunca se resuelve sola.', 320),
 ('cancelacion_espera_seg',    'Espera de la respuesta del módulo a una cancelación', 'num', '60', 10, 600, null, 'segundos', false,
    'Más de 10 minutos de espera deja una pieza «en el aire» sin dueño: pasados los segundos configurados la cancelación queda pendiente de validación y alerta.', 330)
on conflict (clave) do nothing;

-- ───────────────────────────── catálogo cerrado de motivos ─────────────────────────────
create table if not exists piefirme.ctl_motivo (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  tipo             text not null check (tipo in ('descuento', 'cancelacion')),
  nombre           text not null check (length(btrim(nombre)) > 0),
  requiere_nota    boolean not null default false,
  activo           boolean not null default true,
  orden            integer not null default 100,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, tipo, nombre)
);

create or replace function piefirme_app.ctl_sembrar_motivos(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.ctl_motivo (organizacion_id, tipo, nombre, requiere_nota, orden) values
    (p_org, 'descuento', 'Cortesía de la casa', false, 10),
    (p_org, 'descuento', 'Promoción vigente', false, 20),
    (p_org, 'descuento', 'Cliente frecuente', false, 30),
    (p_org, 'descuento', 'Convenio o empresa', false, 40),
    (p_org, 'descuento', 'Corrección de un error de precio', false, 50),
    (p_org, 'descuento', 'Otro (con nota)', true, 90),
    (p_org, 'cancelacion', 'Error de captura del cajero', false, 10),
    (p_org, 'cancelacion', 'El cliente se arrepintió', false, 20),
    (p_org, 'cancelacion', 'Producto equivocado', false, 30),
    (p_org, 'cancelacion', 'Producto con defecto', false, 40),
    (p_org, 'cancelacion', 'Cambio por otro producto', false, 50),
    (p_org, 'cancelacion', 'Otro (con nota)', true, 90)
  on conflict (organizacion_id, tipo, nombre) do nothing;
end $$;
create or replace function piefirme_app.ctl_trg_org_sembrar_motivos() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin perform piefirme_app.ctl_sembrar_motivos(new.id); return null; end $$;
drop trigger if exists t_ctl_sembrar_motivos on piefirme.organizaciones;
create trigger t_ctl_sembrar_motivos after insert on piefirme.organizaciones for each row execute function piefirme_app.ctl_trg_org_sembrar_motivos();
select piefirme_app.ctl_sembrar_motivos(id) from piefirme.organizaciones;

-- ───────────────────────────── cancelación / devolución con espera ─────────────────────────────
create table if not exists piefirme.ctl_cancelacion (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null,
  sucursal_id         uuid not null,
  folio               text,
  folio_anio          integer,
  folio_num           integer,
  tipo                text not null check (tipo in ('cancelacion', 'devolucion')),
  venta_id            uuid not null,                       -- sin llave foránea: el origen es intercambiable
  ticket              text,
  venta_linea_id      uuid,                                -- devolución parcial: la línea
  cantidad            numeric(12,3),                       -- devolución parcial: piezas
  monto               numeric(14,2) not null default 0,
  productos           jsonb not null default '[]'::jsonb,  -- [{producto_id, nombre, cantidad}] piezas que deben estar de regreso en el estante
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'autorizada', 'rechazada', 'pendiente_de_validacion')),
  motivo_solicitud    text,                                -- lo que escribió quien la pidió
  solicitada_por      uuid not null,
  solicitada_en       timestamptz not null default now(),
  espera_seg          integer not null,
  vence_en            timestamptz not null,
  vencida_en          timestamptz,
  intentos_rechazados integer not null default 0,
  motivo_id           uuid,                                -- ctl_motivo (tipo cancelacion) con que se autorizó
  motivo_nombre       text,
  nota                text,
  autorizador_id      uuid,                                -- supervisor o dueño que tecleó su clave
  resuelta_en         timestamptz,
  resuelta_por        uuid,
  resuelta_tarde      boolean not null default false,      -- se autorizó después de vencer la espera
  evidencia_id        uuid,                                -- foto en vivo de la pieza de regreso en el estante
  codigos_escaneados  text[],
  razon_rechazo       text,
  creado_en           timestamptz not null default now(),
  creado_por          uuid
);
create index if not exists ctl_cancelacion_org_idx on piefirme.ctl_cancelacion (organizacion_id, sucursal_id, solicitada_en desc);
create index if not exists ctl_cancelacion_estado_idx on piefirme.ctl_cancelacion (organizacion_id, estado) where estado in ('pendiente', 'pendiente_de_validacion');
-- una sola solicitud viva por ticket (cancelación) o por línea (devolución)
create unique index if not exists ctl_cancelacion_viva_venta_uq on piefirme.ctl_cancelacion (organizacion_id, venta_id) where tipo = 'cancelacion' and estado in ('pendiente', 'pendiente_de_validacion');
create unique index if not exists ctl_cancelacion_viva_linea_uq on piefirme.ctl_cancelacion (organizacion_id, venta_linea_id) where tipo = 'devolucion' and estado in ('pendiente', 'pendiente_de_validacion');

insert into piefirme.ctl_transicion (tabla, de, a) values
 ('ctl_cancelacion', 'pendiente', 'autorizada'), ('ctl_cancelacion', 'pendiente', 'rechazada'), ('ctl_cancelacion', 'pendiente', 'pendiente_de_validacion'),
 ('ctl_cancelacion', 'pendiente_de_validacion', 'autorizada'), ('ctl_cancelacion', 'pendiente_de_validacion', 'rechazada')
on conflict do nothing;

-- bitácora de lo que pasó con cada solicitud (solo inserción): intentos con pieza que no corresponde, claves incorrectas, vencimiento, resolución
create table if not exists piefirme.ctl_cancelacion_evento (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  cancelacion_id   uuid not null references piefirme.ctl_cancelacion(id),
  tipo             text not null check (tipo in ('solicitada', 'pieza_no_corresponde', 'pieza_no_escaneada', 'clave_incorrecta', 'vencida', 'autorizada', 'autorizada_tarde', 'rechazada')),
  detalle          jsonb not null default '{}'::jsonb,
  usuario_id       uuid,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_canc_ev_idx on piefirme.ctl_cancelacion_evento (cancelacion_id, creado_en);

-- ───────────────────────────── privilegios, RLS y triggers (mismo patrón de 200/201/250) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ctl_motivo', 'ctl_cancelacion', 'ctl_cancelacion_evento'] loop
    execute format('alter table piefirme.%I enable row level security', t);
    execute format('revoke all on piefirme.%I from public, anon, authenticated', t);
    execute format('grant select on piefirme.%I to authenticated', t);
    execute format('drop trigger if exists t_00_sellar on piefirme.%I', t);
    execute format('create trigger t_00_sellar before insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_sellar()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
  foreach t in array array['ctl_motivo', 'ctl_cancelacion'] loop
    execute format('drop trigger if exists t_10_estado on piefirme.%I', t);
    execute format('create trigger t_10_estado before update or delete on piefirme.%I for each row execute function piefirme_app.ctl_trg_estado()', t);
  end loop;
  drop trigger if exists t_10_inmutable on piefirme.ctl_cancelacion_evento;
  create trigger t_10_inmutable before update or delete on piefirme.ctl_cancelacion_evento for each row execute function piefirme_app.ctl_trg_inmutable();
end $$;
drop trigger if exists t_01_folio on piefirme.ctl_cancelacion;
create trigger t_01_folio before insert on piefirme.ctl_cancelacion for each row execute function piefirme_app.ctl_trg_folio('CCN');

-- el motivo del catálogo lo ve quien captura (el cajero lo elige); la solicitud la ve quien la pidió y quien revisa; la bitácora, solo quien revisa
drop policy if exists ctl_motivo_sel on piefirme.ctl_motivo;
create policy ctl_motivo_sel on piefirme.ctl_motivo for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_cancelacion_sel on piefirme.ctl_cancelacion;
create policy ctl_cancelacion_sel on piefirme.ctl_cancelacion for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id) and (piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('ver_directo')));
drop policy if exists ctl_cancelacion_evento_sel on piefirme.ctl_cancelacion_evento;
create policy ctl_cancelacion_evento_sel on piefirme.ctl_cancelacion_evento for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(sucursal_id));

-- ───────────────────────────── columnas nuevas en el ORIGEN ─────────────────────────────
-- F1.2 · precio de catálogo vigente al momento de la venta, congelado en la línea (la Etapa 6 lo lee por v_ctl_ventas.precio_catalogo_al_momento)
alter table piefirme.venta_lineas add column if not exists precio_catalogo numeric(14,2);                 -- null = sin referencia (precio abierto, saldo de plan, cortesía…)
alter table piefirme.venta_lineas add column if not exists precio_abierto boolean not null default false;  -- el precio lo cotiza el cajero (a valorar, desde, por unidad, producto especial)
alter table piefirme.venta_lineas add column if not exists autorizacion_precio_id uuid references piefirme.autorizaciones_admin(id);
-- F1.1 · cada descuento guarda usuario, motivo, autorizador y monto
alter table piefirme.venta_lineas add column if not exists descuento_motivo_id uuid;                      -- ctl_motivo (catálogo cerrado)
alter table piefirme.venta_lineas add column if not exists descuento_usuario_id uuid;                     -- quien aplicó el descuento
alter table piefirme.venta_lineas add column if not exists descuento_autorizado_por uuid;                 -- quien lo autorizó con su clave (null = dentro del tope sin clave)
-- F1.3 · quien autorizó la cancelación (hoy v_ctl_cancelaciones lo devolvía en null)
alter table piefirme.ventas add column if not exists cancelacion_autorizada_por uuid;
alter table piefirme.ventas add column if not exists cancelacion_id uuid;                                  -- ctl_cancelacion que la autorizó

-- ───────────────────────────── alertas nuevas (catálogo del motor de la Etapa 6) ─────────────────────────────
insert into piefirme.ctl_alerta_catalogo (tipo, nombre, descripcion, canales, destinatarios, inmediata, severidad, fuente, emite, orden) values
 ('cancelacion_pendiente_validacion', 'Cancelación sin validar', 'Pasó la espera sin que el módulo respondiera: la cancelación quedó pendiente de validación y la pieza NO volvió al inventario. Nunca se resuelve sola (F1.3).',
    array['push', 'whatsapp'], array['dueno', 'supervisor'], true, 'critica', 'especificacion', 'Caja (Etapa 1): ctl_cancelacion_vencer', 12),
 ('cancelacion_pieza_no_corresponde', 'Cancelación con pieza que no corresponde', 'Se intentó validar una cancelación escaneando un código que no es de la pieza del ticket (F1.3: sin pieza presente no hay cancelación).',
    array['push'], array['dueno'], true, 'alta', 'especificacion', 'Caja (Etapa 1): ctl_cancelacion_resolver', 13)
on conflict (tipo) do nothing;
update piefirme.ctl_alerta_catalogo set emite = 'Caja (Etapa 1): ctl_cancelacion_resolver · y el evaluador del origen como respaldo' where tipo = 'cancelacion_autorizada';

-- ───────────────────────────── utilerías internas ─────────────────────────────
-- Emite un evento hacia el módulo SIN poder romper al origen: cualquier falla se traga y queda como aviso en el log.
create or replace function piefirme_app.ctl_emitir_evento(p_org uuid, p_evento text, p_id_externo text, p_payload jsonb, p_origen text default 'piefirme') returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid;
begin
  insert into piefirme.ctl_eventos_entrada (organizacion_id, evento, origen, id_externo, payload, estado)
  values (p_org, p_evento, p_origen, p_id_externo, coalesce(p_payload, '{}'::jsonb), 'pendiente')
  on conflict (organizacion_id, origen, id_externo) where id_externo is not null do nothing
  returning id into v_id;
  return v_id;
exception when others then
  raise warning 'ctl_emitir_evento(%): no se pudo registrar el evento (%): %', p_evento, p_id_externo, sqlerrm;   -- el origen jamás se frena por el módulo
  return null;
end $$;

-- Fecha local de una venta (la del dispositivo si fue offline).
create or replace function piefirme_app.ctl_fecha_venta(p_org uuid, p_offline timestamptz) returns date
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select (coalesce(p_offline, now()) at time zone piefirme_app.ctl_zona(p_org))::date
$$;

-- Precio de catálogo de un concepto a una fecha: el de la sede si existe; si no, el de lista (misma regla que precio_vigente).
create or replace function piefirme_app.ctl_precio_catalogo(p_org uuid, p_tipo text, p_item uuid, p_sede uuid, p_fecha date) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select pr.precio from piefirme.precios pr
   where pr.organizacion_id = p_org and pr.item_tipo = p_tipo and coalesce(pr.servicio_id, pr.producto_id, pr.oferta_id) = p_item
     and (pr.sede_id = p_sede or pr.sede_id is null)
     and pr.vigente_desde <= p_fecha and (pr.vigente_hasta is null or pr.vigente_hasta >= p_fecha)
   order by (pr.sede_id is not null) desc, pr.vigente_desde desc limit 1
$$;

-- Clave de un supervisor o del dueño (PIN personal, o el PIN de administrador heredado). 3 fallos en 15 min bloquean a quien la pide (misma regla que 073).
-- NO lanza error al fallar: revertiría el registro del intento y el bloqueo nunca se activaría.  → { ok, error?, mensaje?, rol?, restantes? }
create or replace function piefirme_app.ctl_verificar_clave(p_org uuid, p_autorizador uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_fallos integer; pf piefirme.perfiles%rowtype; v_ok boolean := false;
begin
  select count(*) into v_fallos from piefirme.pin_intentos where solicitante_id = auth.uid() and not exito and created_at > now() - interval '15 minutes';
  if v_fallos >= 3 then return jsonb_build_object('ok', false, 'error', 'bloqueado', 'mensaje', 'Bloqueado por intentos fallidos: espere 15 minutos.'); end if;
  select * into pf from piefirme.perfiles p
   where p.id = p_autorizador and p.organizacion_id = p_org and p.activo and p.rol::text in ('supervisor', 'administrador')
     and not exists (select 1 from piefirme.rannix_staff rs where rs.user_id = p.id);
  if found and p_pin is not null and p_pin ~ '^[0-9]{4,8}$' then
    v_ok := exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = pf.id and pp.pin_hash = piefirme_app.hash_pin(pf.id, p_pin))
         or (pf.rol::text = 'administrador' and exists (select 1 from piefirme.pins_administrador pa where pa.perfil_id = pf.id and pa.pin_hash = piefirme_app.hash_pin(pf.id, p_pin)));
  end if;
  if v_ok and pf.id = auth.uid() and pf.rol::text <> 'administrador' then
    return jsonb_build_object('ok', false, 'error', 'autorizador_propio', 'mensaje', 'La clave debe ser de otra persona: un supervisor no se autoriza a sí mismo.');
  end if;
  insert into piefirme.pin_intentos (organizacion_id, solicitante_id, exito) values (p_org, auth.uid(), v_ok);
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'clave_incorrecta', 'restantes', greatest(0, 2 - v_fallos), 'mensaje', 'Clave incorrecta.'); end if;
  return jsonb_build_object('ok', true, 'rol', pf.rol::text, 'autorizador_id', pf.id);
end $$;

-- nada de esto lo ejecuta la app ni anon: solo las RPC definer del módulo
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme_app' and p.proname in ('ctl_sembrar_motivos', 'ctl_trg_org_sembrar_motivos', 'ctl_emitir_evento', 'ctl_fecha_venta', 'ctl_precio_catalogo', 'ctl_verificar_clave') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
