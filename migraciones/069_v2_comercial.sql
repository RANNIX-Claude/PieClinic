-- 069 · V2 · Comercial: datos web de producto, pedidos de la tienda en línea y auditorías de inventario con evidencia fotográfica.
-- ADITIVA: columnas nuevas en productos y tablas nuevas. Sin tabla asistente_log: el historial del asistente ya vive en asistente_conversaciones/asistente_mensajes (057).
-- Tienda pública (sin sesión): los pedidos entran por una RPC portal_* que se escribirá cuando haya pasarela de pago; esta migración NO abre nada a anon.
-- Auditoría de inventario: cantidad_ia viene de la lectura de la foto (adaptador simulado hasta tener llave de IA); la persona confirma (cantidad_confirmada).
-- Depende de: 040 (productos, conteos_fisicos), 026 (ventas), 064.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.productos add column if not exists imagen_path text;         -- bucket pf-catalogo: <organizacion_id>/productos/<id>.jpg
alter table piefirme.productos add column if not exists descripcion_web text;
alter table piefirme.productos add column if not exists precio_web numeric(14,2); -- nulo = usa el precio de lista
do $$ begin
  alter table piefirme.productos add constraint productos_precio_web_chk check (precio_web is null or precio_web >= 0);
exception when duplicate_object then null; end $$;

create table piefirme.pedidos_web (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),         -- sucursal que surte / donde se recoge
  folio            text not null,
  cliente_nombre   text not null,
  cliente_telefono text,
  cliente_email    text,
  paciente_id      uuid references piefirme.pacientes(id) on delete set null,
  tipo_entrega     text not null default 'recoger' check (tipo_entrega in ('recoger', 'envio')),
  direccion_envio  text,
  estado           text not null default 'nuevo' check (estado in ('nuevo', 'confirmado', 'preparando', 'listo', 'entregado', 'cancelado')),
  pago_estado      text not null default 'pendiente' check (pago_estado in ('pendiente', 'pagado', 'simulado', 'reembolsado')),
  subtotal         numeric(14,2) not null default 0 check (subtotal >= 0),
  envio            numeric(14,2) not null default 0 check (envio >= 0),
  total            numeric(14,2) not null default 0 check (total >= 0),
  nota_cliente     text,
  motivo_cancelacion text,
  origen           text not null default 'tienda_web',
  atendido_por     uuid,
  atendido_en      timestamptz,
  venta_id         uuid references piefirme.ventas(id) on delete set null,
  sintetico        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (tipo_entrega <> 'envio' or direccion_envio is not null)
);
create index on piefirme.pedidos_web (organizacion_id, sede_id, estado, created_at desc);

create table piefirme.pedidos_web_lineas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),
  pedido_id        uuid not null references piefirme.pedidos_web(id) on delete cascade,
  producto_id      uuid references piefirme.productos(id),
  descripcion      text not null,
  cantidad         numeric(14,3) not null check (cantidad > 0),
  precio_unitario  numeric(14,2) not null check (precio_unitario >= 0),
  importe          numeric(14,2) not null check (importe >= 0),
  created_at       timestamptz not null default now()
);
create index on piefirme.pedidos_web_lineas (organizacion_id, pedido_id);
create trigger t_a_padre before insert on piefirme.pedidos_web_lineas for each row execute function piefirme_app.c_heredar_de_padre('pedidos_web', 'pedido_id');

create table piefirme.auditorias_inventario (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  folio            text not null,
  fecha            date not null default current_date,
  responsable_id   uuid default auth.uid() references piefirme.perfiles(id),
  conteo_id        uuid references piefirme.conteos_fisicos(id) on delete set null,   -- conteo físico que formaliza los ajustes (040)
  estado           text not null default 'abierta' check (estado in ('abierta', 'en_revision', 'cerrada')),
  nota             text,
  sintetico        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.auditorias_inventario (organizacion_id, sede_id, fecha desc);

create table piefirme.auditoria_fotos (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id               uuid references piefirme.sedes(id),
  auditoria_id          uuid not null references piefirme.auditorias_inventario(id) on delete cascade,
  producto_id           uuid references piefirme.productos(id),
  storage_path          text,                                           -- bucket pf-auditorias: <organizacion_id>/<auditoria_id>/<archivo>
  origen                text not null default 'colaborador' check (origen in ('colaborador', 'camara')),   -- foto subida por una persona | cámara de la sucursal
  cantidad_esperada     numeric(14,3),
  cantidad_ia           numeric(14,3) check (cantidad_ia is null or cantidad_ia >= 0),
  cantidad_confirmada   numeric(14,3) check (cantidad_confirmada is null or cantidad_confirmada >= 0),
  confianza             numeric(4,3) check (confianza between 0 and 1),
  tomada_por            uuid default auth.uid(),
  tomada_en             timestamptz not null default now(),
  nota                  text,
  sintetico             boolean not null default false,
  created_at            timestamptz not null default now(),
  check (storage_path is null or split_part(storage_path, '/', 1) = organizacion_id::text)
);
create index on piefirme.auditoria_fotos (organizacion_id, auditoria_id);
create trigger t_a_padre before insert on piefirme.auditoria_fotos for each row execute function piefirme_app.c_heredar_de_padre('auditorias_inventario', 'auditoria_id');

select piefirme_app.c_triggers('pedidos_web', true);
select piefirme_app.c_triggers('auditorias_inventario', true);

-- pedidos: administrador y recepción (cajeros, almacén) de la sede; solo administrador borra
select piefirme_app.c_politicas('pedidos_web',
  p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador']);
select piefirme_app.c_politicas('pedidos_web_lineas',
  p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador'],
  p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.pedidos_web p where p.id = pedido_id)$c$,
  p_cond_ins => $c$exists (select 1 from piefirme.pedidos_web p where p.id = pedido_id and p.estado in ('nuevo', 'confirmado', 'preparando'))$c$,
  p_cond_upd => $c$exists (select 1 from piefirme.pedidos_web p where p.id = pedido_id and p.estado in ('nuevo', 'confirmado', 'preparando'))$c$);
-- auditorías: administrador y recepción de la sede (el podólogo no audita inventario)
select piefirme_app.c_politicas('auditorias_inventario',
  p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador'],
  p_cond_upd => $c$estado <> 'cerrada' or piefirme_app.es_admin()$c$);
select piefirme_app.c_politicas('auditoria_fotos',
  p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador'],
  p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.auditorias_inventario a where a.id = auditoria_id)$c$,
  p_cond_ins => $c$exists (select 1 from piefirme.auditorias_inventario a where a.id = auditoria_id and a.estado <> 'cerrada')$c$,
  p_cond_upd => $c$exists (select 1 from piefirme.auditorias_inventario a where a.id = auditoria_id and a.estado <> 'cerrada')$c$);
