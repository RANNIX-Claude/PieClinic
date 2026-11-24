-- 076 · Implementación Pie Clinic · Etapa 1 · Catálogo completo: clave alterna, departamentos, unidades con factor, margen,
--       listas de precio por tipo de cliente, folio y códigos de servicios y productos, y datos que trae la carga de SICAR.
-- ADITIVA: columnas nuevas con default, tablas y funciones nuevas. No cambia ninguna regla ni vista existente.
-- Lo que SICAR trae y ya estaba validado en PODIX se reutiliza (carga de artículos: scripts/sicar_articulos.py y sus reglas):
--   clave alterna      → productos.clave_alterna            (PODIX: claveSicar)
--   departamento       → departamentos + productos.departamento_id   (PODIX: «linea»: Podología, Ortopedia…)
--   mínimo y máximo    → productos.minimo_sicar / maximo_sicar: se guardan aparte y se activan con la PRIMERA entrada de inventario,
--                        para no llenar el tablero de alertas con artículos sin existencia (regla del 23-nov-2026)
--   precio sugerido y costo estimado → banderas para revisar lo que la carga calculó con el margen típico del proveedor
-- Lo nuevo, que ni PODIX ni Pie Firme tenían: unidades de compra y venta con factor, margen objetivo, precios 1 a 4 por TIPO DE CLIENTE
-- (decidido el 24-nov-2026), y folio con código QR y de barras para cada servicio y producto.
-- Depende de: 001, 020, 040, 073.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── departamentos ─────────────────────────────
create table if not exists piefirme.departamentos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null check (clave ~ '^[a-z0-9_\-]{2,40}$'),
  nombre           text not null check (length(btrim(nombre)) > 0),
  orden            integer not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index if not exists departamentos_org_idx on piefirme.departamentos (organizacion_id, activo, orden);
drop trigger if exists t_upd on piefirme.departamentos;
create trigger t_upd before update on piefirme.departamentos for each row execute function piefirme_app.tocar_updated_at();
drop trigger if exists t_aud on piefirme.departamentos;
create trigger t_aud after insert or update or delete on piefirme.departamentos for each row execute function piefirme_app.auditar();
select piefirme_app.c_politicas('departamentos', p_ver => array['administrador', 'podologo', 'recepcion', 'supervisor'],
  p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[], p_sede => 'no');

-- ───────────────────────────── campos nuevos del producto ─────────────────────────────
alter table piefirme.productos add column if not exists clave_alterna       text;
alter table piefirme.productos add column if not exists departamento_id     uuid references piefirme.departamentos(id) on delete set null;
alter table piefirme.productos add column if not exists unidad_compra       text;                          -- p. ej. caja
alter table piefirme.productos add column if not exists unidad_venta        text;                          -- p. ej. pieza; el inventario vive en la unidad de venta
alter table piefirme.productos add column if not exists factor              numeric(14,4) not null default 1;   -- piezas por unidad de compra
alter table piefirme.productos add column if not exists margen_objetivo_pct numeric(7,2);                  -- % de utilidad con el que se recalcula el precio
alter table piefirme.productos add column if not exists regla_precio_compra text not null default 'mantener_margen';
alter table piefirme.productos add column if not exists origen              text;                          -- 'sicar' cuando viene de la carga de SICAR
alter table piefirme.productos add column if not exists precio_sugerido     boolean not null default false;   -- el precio lo calculó la carga con el margen del proveedor
alter table piefirme.productos add column if not exists costo_estimado      boolean not null default false;   -- el costo lo estimó la carga a partir del precio
alter table piefirme.productos add column if not exists minimo_sicar        numeric(14,3) not null default 0;
alter table piefirme.productos add column if not exists maximo_sicar        numeric(14,3);
alter table piefirme.productos add column if not exists folio               text;
do $$ begin
  alter table piefirme.productos add constraint productos_factor_chk check (factor > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.productos add constraint productos_regla_precio_chk check (regla_precio_compra in ('mantener_margen', 'mantener_precio'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.productos add constraint productos_minimo_sicar_chk check (minimo_sicar >= 0 and (maximo_sicar is null or maximo_sicar >= 0));
exception when duplicate_object then null; end $$;
create index if not exists productos_clave_alterna_idx on piefirme.productos (organizacion_id, clave_alterna) where clave_alterna is not null;
create index if not exists productos_departamento_idx  on piefirme.productos (organizacion_id, departamento_id);
create unique index if not exists productos_folio_uq   on piefirme.productos (organizacion_id, folio) where folio is not null;

-- ───────────────────────────── folio y código de servicios ─────────────────────────────
alter table piefirme.servicios add column if not exists folio         text;
alter table piefirme.servicios add column if not exists codigo_barras text;       -- opcional; si falta, el código de barras y el QR usan el folio
create unique index if not exists servicios_folio_uq on piefirme.servicios (organizacion_id, folio) where folio is not null;

create table if not exists piefirme.contadores_catalogo (
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  tipo             text not null check (tipo in ('servicio', 'producto')),
  ultimo           integer not null default 0,
  primary key (organizacion_id, tipo)
);
alter table piefirme.contadores_catalogo enable row level security;     -- sin políticas: solo funciones security definer

create or replace function piefirme_app.siguiente_folio_catalogo(p_org uuid, p_tipo text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare n integer;
begin
  insert into piefirme.contadores_catalogo (organizacion_id, tipo, ultimo) values (p_org, p_tipo, 1)
  on conflict (organizacion_id, tipo) do update set ultimo = piefirme.contadores_catalogo.ultimo + 1
  returning ultimo into n;
  return (case p_tipo when 'servicio' then 'SRV' else 'PRD' end) || '-' || lpad(n::text, 6, '0');
end $$;

create or replace function piefirme_app.catalogo_folio_bi() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.folio is null then new.folio := piefirme_app.siguiente_folio_catalogo(new.organizacion_id, tg_argv[0]); end if;
  return new;
end $$;
drop trigger if exists t_folio_catalogo on piefirme.servicios;
create trigger t_folio_catalogo before insert on piefirme.servicios for each row execute function piefirme_app.catalogo_folio_bi('servicio');
drop trigger if exists t_folio_catalogo on piefirme.productos;
create trigger t_folio_catalogo before insert on piefirme.productos for each row execute function piefirme_app.catalogo_folio_bi('producto');

-- Folio para lo que ya existía, en el orden en que se dio de alta.
do $$
declare r record;
begin
  for r in select id, organizacion_id from piefirme.servicios where folio is null order by created_at, id loop
    update piefirme.servicios set folio = piefirme_app.siguiente_folio_catalogo(r.organizacion_id, 'servicio') where id = r.id;
  end loop;
  for r in select id, organizacion_id from piefirme.productos where folio is null order by created_at, id loop
    update piefirme.productos set folio = piefirme_app.siguiente_folio_catalogo(r.organizacion_id, 'producto') where id = r.id;
  end loop;
end $$;

-- ───────────────────────────── listas de precio por tipo de cliente ─────────────────────────────
-- Lista 1 = el precio central que ya existe (tabla precios). Listas 2 a 4 = precios_lista. Cada paciente trae su número de lista.
create table if not exists piefirme.listas_precio (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  numero           smallint not null check (numero between 1 and 4),
  nombre           text not null check (length(btrim(nombre)) > 0),
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, numero)
);
drop trigger if exists t_upd on piefirme.listas_precio;
create trigger t_upd before update on piefirme.listas_precio for each row execute function piefirme_app.tocar_updated_at();
drop trigger if exists t_aud on piefirme.listas_precio;
create trigger t_aud after insert or update or delete on piefirme.listas_precio for each row execute function piefirme_app.auditar();
select piefirme_app.c_politicas('listas_precio', p_ver => array['administrador', 'podologo', 'recepcion', 'supervisor'],
  p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[], p_sede => 'no');

create table if not exists piefirme.precios_lista (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  item_tipo        text not null check (item_tipo in ('servicio', 'producto')),
  servicio_id      uuid references piefirme.servicios(id) on delete cascade,
  producto_id      uuid references piefirme.productos(id) on delete cascade,
  lista_numero     smallint not null check (lista_numero between 2 and 4),
  precio           numeric(14,2) not null check (precio >= 0),            -- IVA incluido, como la lista 1
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  motivo           text,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check ((item_tipo = 'servicio' and servicio_id is not null and producto_id is null)
      or (item_tipo = 'producto' and producto_id is not null and servicio_id is null)),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index if not exists precios_lista_servicio_idx on piefirme.precios_lista (organizacion_id, lista_numero, servicio_id, vigente_desde desc);
create index if not exists precios_lista_producto_idx on piefirme.precios_lista (organizacion_id, lista_numero, producto_id, vigente_desde desc);
drop trigger if exists t_aud on piefirme.precios_lista;
create trigger t_aud after insert or update or delete on piefirme.precios_lista for each row execute function piefirme_app.auditar();
select piefirme_app.c_politicas('precios_lista', p_ver => array['administrador', 'podologo', 'recepcion', 'supervisor'],
  p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[], p_sede => 'no');

alter table piefirme.pacientes add column if not exists lista_precio smallint not null default 1;
do $$ begin
  alter table piefirme.pacientes add constraint pacientes_lista_precio_chk check (lista_precio between 1 and 4);
exception when duplicate_object then null; end $$;

-- Precio vigente de un producto o servicio para una lista. Si la lista no tiene precio propio, cae a la lista 1 (precio central).
create or replace function piefirme.precio_de_lista(p_item_tipo text, p_item uuid, p_lista smallint default 1, p_fecha date default current_date)
returns numeric language plpgsql stable set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v numeric;
begin
  if p_lista is not null and p_lista > 1 then
    select pl.precio into v from piefirme.precios_lista pl
     where pl.lista_numero = p_lista and pl.item_tipo = p_item_tipo
       and (case when p_item_tipo = 'servicio' then pl.servicio_id else pl.producto_id end) = p_item
       and pl.vigente_desde <= p_fecha and (pl.vigente_hasta is null or pl.vigente_hasta >= p_fecha)
     order by pl.vigente_desde desc limit 1;
    if v is not null then return v; end if;
  end if;
  select p.precio into v from piefirme.precios p
   where p.item_tipo = p_item_tipo and p.sede_id is null
     and (case when p_item_tipo = 'servicio' then p.servicio_id else p.producto_id end) = p_item
     and p.vigente_desde <= p_fecha and (p.vigente_hasta is null or p.vigente_hasta >= p_fecha)
   order by p.vigente_desde desc limit 1;
  return v;
end $$;

-- ───────────────────────────── datos base de Pie Clinic (los dueños los pueden editar) ─────────────────────────────
-- Tres departamentos y cuatro listas. Idempotente: no pisa lo que ya exista.
create or replace function piefirme.catalogo_inicializar() returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); d integer; l integer;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños inicializan el catálogo' using errcode = 'PF403'; end if;
  insert into piefirme.departamentos (organizacion_id, clave, nombre, orden) values
    (v_org, 'podologia', 'Podología', 1), (v_org, 'ortopedia', 'Ortopedia', 2), (v_org, 'productos', 'Productos', 3)
  on conflict (organizacion_id, clave) do nothing;
  get diagnostics d = row_count;
  insert into piefirme.listas_precio (organizacion_id, numero, nombre) values
    (v_org, 1, 'Público'), (v_org, 2, 'Médico'), (v_org, 3, 'Convenio'), (v_org, 4, 'Mayorista')
  on conflict (organizacion_id, numero) do nothing;
  get diagnostics l = row_count;
  return jsonb_build_object('departamentos_nuevos', d, 'listas_nuevas', l);
end $$;

-- ───────────────────────────── el mínimo de SICAR se activa con la primera entrada ─────────────────────────────
create or replace function piefirme_app.activar_minimo_sicar() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.cantidad > 0 then
    update piefirme.inventario_sede i
       set minimo = p.minimo_sicar, maximo = coalesce(nullif(p.maximo_sicar, 0), i.maximo)
      from piefirme.productos p
     where p.id = new.producto_id and i.sede_id = new.sede_id and i.producto_id = new.producto_id
       and i.minimo = 0 and p.minimo_sicar > 0;
  end if;
  return null;
end $$;
drop trigger if exists t_zz_minimo_sicar on piefirme.movimientos_inventario;
create trigger t_zz_minimo_sicar after insert on piefirme.movimientos_inventario for each row execute function piefirme_app.activar_minimo_sicar();

-- ───────────────────────────── inventario inicial = un conteo de tipo «inicial» ─────────────────────────────
-- Se reutiliza el conteo físico que ya existe (borrador → capturado → autorizado por los dueños, con kardex).
alter table piefirme.conteos_fisicos add column if not exists tipo text not null default 'ciclico';
do $$ begin
  alter table piefirme.conteos_fisicos add constraint conteos_fisicos_tipo_chk check (tipo in ('ciclico', 'inicial'));
exception when duplicate_object then null; end $$;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.precio_de_lista(text, uuid, smallint, date) from public, anon;
revoke all on function piefirme.catalogo_inicializar() from public, anon;
grant execute on function piefirme.precio_de_lista(text, uuid, smallint, date), piefirme.catalogo_inicializar() to authenticated, service_role;
