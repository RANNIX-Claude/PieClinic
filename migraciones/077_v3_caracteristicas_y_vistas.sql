-- 077 · Implementación Pie Clinic · Etapa 1 · Adaptaciones y características de un producto especial (pieza F17) y vistas del catálogo.
-- Decidido el 24-nov-2026: una plantilla con mayor altura, mayor grosor, descarga, cuña, etc. no es un producto de catálogo. Los productos del
-- catálogo (2,880 cargados de SICAR) son FIJOS: descripción y precio. Lo especial, ciertas plantillas y ciertos zapatos, se maneja como
-- PROCEDIMIENTO (servicio de precio variable) y es a ese servicio al que se le marca «admite características». Sus características
-- se ELIGEN de un catálogo, se transcriben a la DESCRIPCIÓN del renglón (que sale en el ticket y en la factura) y SUMAN al precio.
-- La caja ya guarda la descripción y el precio tal como se arman en pantalla (venta_lineas.descripcion / precio_unitario), así que no se toca
-- el cobro: el selector compone ambos y, aparte, se guarda cada característica elegida para reportes y para la solicitud al proveedor.
-- ADITIVA. Incluye además un arreglo: prp_productos y prp_servicios se crearon con «p.*» en la 020 y por eso NO mostraban las columnas agregadas
-- después (076 y ésta). Se recrean con las mismas columnas en el mismo orden y las nuevas AL FINAL (CREATE OR REPLACE VIEW lo permite).
-- Depende de: 001, 020, 026, 040, 073, 076.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── el servicio admite características ─────────────────────────────
alter table piefirme.servicios add column if not exists admite_caracteristicas boolean not null default false;

-- ───────────────────────────── catálogo de características ─────────────────────────────
create table if not exists piefirme.caracteristicas_producto (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  grupo            text not null check (length(btrim(grupo)) > 0),           -- Material, Altura y grosor, Almas, Adaptación, Molde, Lado…
  nombre           text not null check (length(btrim(nombre)) > 0),
  frase            text not null check (length(btrim(frase)) > 0),            -- lo que se transcribe a la descripción; {valor} se sustituye
  tipo_valor       text not null default 'ninguno' check (tipo_valor in ('ninguno', 'numero')),
  unidad           text,                                                      -- cm, mm, almas…
  efecto_precio    text not null default 'ninguno' check (efecto_precio in ('ninguno', 'fijo', 'por_unidad')),
  monto            numeric(14,2) not null default 0 check (monto >= 0),       -- IVA incluido, como los precios de lista
  nota             text,
  orden            integer not null default 0,
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, grupo, nombre),
  check (efecto_precio <> 'por_unidad' or tipo_valor = 'numero')              -- «por unidad» necesita un valor numérico que multiplicar
);
create index if not exists caracteristicas_org_idx on piefirme.caracteristicas_producto (organizacion_id, activa, grupo, orden);
drop trigger if exists t_upd on piefirme.caracteristicas_producto;
create trigger t_upd before update on piefirme.caracteristicas_producto for each row execute function piefirme_app.tocar_updated_at();
drop trigger if exists t_aud on piefirme.caracteristicas_producto;
create trigger t_aud after insert or update or delete on piefirme.caracteristicas_producto for each row execute function piefirme_app.auditar();
select piefirme_app.c_politicas('caracteristicas_producto', p_ver => array['administrador', 'podologo', 'recepcion', 'supervisor'],
  p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[], p_sede => 'no');

-- ───────────────────────────── características elegidas en un renglón de venta ─────────────────────────────
create table if not exists piefirme.venta_linea_caracteristicas (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid not null references piefirme.sedes(id),
  venta_linea_id      uuid not null references piefirme.venta_lineas(id) on delete cascade,
  caracteristica_id   uuid references piefirme.caracteristicas_producto(id) on delete set null,
  grupo               text not null,
  nombre              text not null,
  frase               text not null,                                          -- tal como quedó en la descripción
  valor               numeric(14,3),
  unidad              text,
  efecto_precio       text not null check (efecto_precio in ('ninguno', 'fijo', 'por_unidad')),
  monto_unitario      numeric(14,2) not null default 0,
  importe             numeric(14,2) not null default 0,                       -- lo que sumó al precio (monto, o monto × valor)
  orden               integer not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists vlc_linea_idx on piefirme.venta_linea_caracteristicas (venta_linea_id);
create index if not exists vlc_org_idx   on piefirme.venta_linea_caracteristicas (organizacion_id, caracteristica_id);
drop trigger if exists t_a_padre on piefirme.venta_linea_caracteristicas;
create trigger t_a_padre before insert on piefirme.venta_linea_caracteristicas for each row execute function piefirme_app.c_heredar_de_padre('venta_lineas', 'venta_linea_id');
drop trigger if exists t_aud on piefirme.venta_linea_caracteristicas;
create trigger t_aud after insert or update or delete on piefirme.venta_linea_caracteristicas for each row execute function piefirme_app.auditar();
select piefirme_app.c_politicas('venta_linea_caracteristicas', p_ver => array['administrador', 'podologo', 'recepcion', 'supervisor'],
  p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador', 'recepcion']);

-- ───────────────────────────── vistas del catálogo con las columnas nuevas ─────────────────────────────
do $$
declare cols text; nuevos text;
begin
  -- prp_productos: precio_lista y margen_pct se conservan; las columnas nuevas de productos van al final
  select string_agg('p.' || quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a where a.attrelid = 'piefirme.prp_productos'::regclass and a.attnum > 0 and not a.attisdropped and a.attname not in ('precio_lista', 'margen_pct');
  select string_agg('p.' || quote_ident(c.column_name), ', ' order by c.ordinal_position) into nuevos
    from information_schema.columns c
   where c.table_schema = 'piefirme' and c.table_name = 'productos'
     and not exists (select 1 from pg_attribute a where a.attrelid = 'piefirme.prp_productos'::regclass and a.attname = c.column_name and not a.attisdropped);
  if nuevos is not null then
    execute format($v$create or replace view piefirme.prp_productos with (security_invoker = true) as
      select %s,
             piefirme.precio_vigente('producto', p.id, null) as precio_lista,
             case when coalesce(piefirme.precio_vigente('producto', p.id, null), 0) > 0
                  then round(((piefirme.precio_vigente('producto', p.id, null) / (case when p.iva_tipo = '16' then 1.16 else 1 end)) - p.costo_promedio)
                             / (piefirme.precio_vigente('producto', p.id, null) / (case when p.iva_tipo = '16' then 1.16 else 1 end)) * 100, 2)
             end as margen_pct,
             %s
        from piefirme.productos p$v$, cols, nuevos);
  end if;

  -- prp_servicios: precio_lista y sedes_con_precio_propio se conservan
  select string_agg('s.' || quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a where a.attrelid = 'piefirme.prp_servicios'::regclass and a.attnum > 0 and not a.attisdropped and a.attname not in ('precio_lista', 'sedes_con_precio_propio');
  select string_agg('s.' || quote_ident(c.column_name), ', ' order by c.ordinal_position) into nuevos
    from information_schema.columns c
   where c.table_schema = 'piefirme' and c.table_name = 'servicios'
     and not exists (select 1 from pg_attribute a where a.attrelid = 'piefirme.prp_servicios'::regclass and a.attname = c.column_name and not a.attisdropped);
  if nuevos is not null then
    execute format($v$create or replace view piefirme.prp_servicios with (security_invoker = true) as
      select %s,
             piefirme.precio_vigente('servicio', s.id, null) as precio_lista,
             (select count(*) from piefirme.precios p where p.servicio_id = s.id and p.sede_id is not null and p.vigente_hasta is null) as sedes_con_precio_propio,
             %s
        from piefirme.servicios s$v$, cols, nuevos);
  end if;
end $$;

-- ───────────────────────────── catálogo base (los dueños lo editan) ─────────────────────────────
-- Nombres tomados de las adaptaciones y plantillas del catálogo de SICAR de Pie Clinic y de lo dicho en la junta. Solo traen precio las tres que
-- se mencionaron en la junta (molde, centímetro de disimetría, virón y cuña): el resto entra en $0 para que los dueños lo definan.
create or replace function piefirme.caracteristicas_inicializar() returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); n integer;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños inicializan las características' using errcode = 'PF403'; end if;
  insert into piefirme.caracteristicas_producto (organizacion_id, grupo, nombre, frase, tipo_valor, unidad, efecto_precio, monto, nota, orden) values
    (v_org, 'Material', 'Pelite',                  'material pelite',                     'ninguno', null,    'ninguno',    0,    null, 1),
    (v_org, 'Material', 'Piel',                    'material piel',                       'ninguno', null,    'ninguno',    0,    null, 2),
    (v_org, 'Material', 'Plastazote o Poron',      'material plastazote o poron',         'ninguno', null,    'ninguno',    0,    null, 3),
    (v_org, 'Material', 'Resina / deportiva',      'material resina deportiva',           'ninguno', null,    'ninguno',    0,    null, 4),
    (v_org, 'Altura y grosor', 'Mayor altura',     'altura {valor} mm',                   'numero',  'mm',    'ninguno',    0,    null, 1),
    (v_org, 'Altura y grosor', 'Mayor grosor',     'grosor {valor} mm',                   'numero',  'mm',    'ninguno',    0,    null, 2),
    (v_org, 'Almas', 'Número de almas',            '{valor} almas',                       'numero',  'almas', 'ninguno',    0,    null, 1),
    (v_org, 'Adaptación', 'Virón',                 'virón',                               'ninguno', null,    'ninguno',    0,    null, 1),
    (v_org, 'Adaptación', 'Cuña',                  'cuña',                                'ninguno', null,    'ninguno',    0,    null, 2),
    (v_org, 'Adaptación', 'Virón y cuña',          'virón y cuña',                        'ninguno', null,    'fijo',       590,  'Precio mencionado en la junta: confirmar', 3),
    (v_org, 'Adaptación', 'Virón corrido',         'virón corrido',                       'ninguno', null,    'ninguno',    0,    null, 4),
    (v_org, 'Adaptación', 'Antiderrapante',        'antiderrapante',                      'ninguno', null,    'ninguno',    0,    null, 5),
    (v_org, 'Adaptación', 'Cambio de suela',       'cambio de suela',                     'ninguno', null,    'ninguno',    0,    null, 6),
    (v_org, 'Adaptación', 'Alce bilateral (dona o herradura)', 'alce bilateral dona o herradura', 'ninguno', null, 'ninguno', 0,  null, 7),
    (v_org, 'Adaptación', 'Alce por centímetro',   'alce {valor} cm',                     'numero',  'cm',    'por_unidad', 0,    null, 8),
    (v_org, 'Adaptación', 'Compensación por disimetría', 'compensación {valor} cm',       'numero',  'cm',    'por_unidad', 450,  'Precio mencionado en la junta: confirmar', 9),
    (v_org, 'Adaptación', 'Descarga',              'descarga',                            'ninguno', null,    'ninguno',    0,    null, 10),
    (v_org, 'Molde', 'Molde de yeso',              'con molde de yeso',                   'ninguno', null,    'fijo',       1500, 'Precio mencionado en la junta: confirmar', 1),
    (v_org, 'Lado', 'Pie izquierdo',               'pie izquierdo',                       'ninguno', null,    'ninguno',    0,    null, 1),
    (v_org, 'Lado', 'Pie derecho',                 'pie derecho',                         'ninguno', null,    'ninguno',    0,    null, 2),
    (v_org, 'Lado', 'Ambos pies',                  'ambos pies',                          'ninguno', null,    'ninguno',    0,    null, 3)
  on conflict (organizacion_id, grupo, nombre) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────────────────────────── función en el catálogo de liberación y permisos ─────────────────────────────
insert into piefirme.catalogo_funciones (clave, nombre, grupo, roles)
values ('/catalogo/caracteristicas', 'Características y adaptaciones', 'VENTAS', array['administrador', 'recepcion']::text[])
on conflict (clave) do nothing;

revoke all on function piefirme.caracteristicas_inicializar() from public, anon;
grant execute on function piefirme.caracteristicas_inicializar() to authenticated, service_role;
