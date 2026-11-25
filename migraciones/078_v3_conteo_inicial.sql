-- 078 · Implementación Pie Clinic · Conteo inicial de inventario por sucursal (zonas, capturas con trazabilidad, productos provisionales, corte y aprobación).
-- Se apoya en el conteo físico que ya existe (conteos_fisicos tipo «inicial» → conteo_lineas → conteo_autorizar → movimientos 'conteo'), de modo
-- que el kardex, el mínimo/máximo de SICAR y el bloqueo de un conteo autorizado siguen funcionando igual. Lo nuevo:
--   · conteo_zonas      anaquel o zona de la sucursal; se cierra cuando se termina de contar.
--   · conteo_capturas   una fila por zona y producto (quién, cuándo, cómo); un trigger mantiene conteo_lineas con la suma por producto.
--   · producto provisional: un código que no existe en el catálogo se da de alta ahí mismo (nombre, cantidad y foto de la etiqueta) con estado
--     'provisional'; después el encargado lo completa (marca, categoría, precio) o lo marca como duplicado de otro.
--   · corte: mientras hay un conteo inicial abierto con corte, la sucursal no registra ventas ni traspasos (lo exige un trigger).
--   · aprobación: solo Administración; los productos del catálogo que no se contaron y tienen existencia quedan en 0.
-- Todas las escrituras de la captura van por funciones (SECURITY DEFINER con revisión de rol y sucursal). ADITIVA. Depende de 020, 040, 073, 076, 077.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── producto provisional ─────────────────────────────
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'piefirme.productos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%sin_existencia%' loop
    execute format('alter table piefirme.productos drop constraint %I', c);
  end loop;
  alter table piefirme.productos add constraint productos_estado_check check (estado in ('activo', 'sin_existencia', 'pausado', 'provisional'));
end $$;
alter table piefirme.productos add column if not exists provisional_conteo_id uuid references piefirme.conteos_fisicos(id) on delete set null;
alter table piefirme.productos add column if not exists provisional_por       uuid;
alter table piefirme.productos add column if not exists provisional_en        timestamptz;
alter table piefirme.productos add column if not exists provisional_foto_path text;      -- bucket «comprobantes»: <organizacion_id>/conteo/…
alter table piefirme.productos add column if not exists provisional_nota      text;

-- ───────────────────────────── corte del conteo inicial ─────────────────────────────
alter table piefirme.conteos_fisicos add column if not exists corte_en  timestamptz;
alter table piefirme.conteos_fisicos add column if not exists corte_por uuid;

-- ───────────────────────────── zonas y capturas ─────────────────────────────
create table if not exists piefirme.conteo_zonas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  conteo_id        uuid not null references piefirme.conteos_fisicos(id) on delete cascade,
  nombre           text not null check (length(btrim(nombre)) > 0),
  estado           text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  abierta_por      uuid default auth.uid(),
  abierta_en       timestamptz not null default now(),
  cerrada_por      uuid,
  cerrada_en       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists conteo_zonas_nombre_uq on piefirme.conteo_zonas (conteo_id, lower(btrim(nombre)));
create index if not exists conteo_zonas_org_idx on piefirme.conteo_zonas (organizacion_id, conteo_id);

create table if not exists piefirme.conteo_capturas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  conteo_id        uuid not null references piefirme.conteos_fisicos(id) on delete cascade,
  zona_id          uuid not null references piefirme.conteo_zonas(id) on delete cascade,
  producto_id      uuid not null references piefirme.productos(id),
  cantidad         numeric(14,3) not null default 0 check (cantidad >= 0),
  metodo           text not null default 'escaner' check (metodo in ('escaner', 'camara', 'manual')),
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_por  uuid default auth.uid(),
  actualizado_en   timestamptz not null default now(),
  unique (zona_id, producto_id)
);
create index if not exists conteo_capturas_conteo_idx on piefirme.conteo_capturas (conteo_id, producto_id);
create index if not exists conteo_capturas_org_idx on piefirme.conteo_capturas (organizacion_id, conteo_id);

drop trigger if exists t_upd on piefirme.conteo_zonas;
create trigger t_upd before update on piefirme.conteo_zonas for each row execute function piefirme_app.tocar_updated_at();
drop trigger if exists t_aud on piefirme.conteo_zonas;
create trigger t_aud after insert or update or delete on piefirme.conteo_zonas for each row execute function piefirme_app.auditar();
-- las capturas son muchas (una por escaneo): no se auditan una a una; la trazabilidad es la propia fila (quién, cuándo, zona, método)

-- Lectura para quien cuenta, el supervisor y los dueños; NO hay políticas de escritura: se escribe solo con las funciones de abajo.
select piefirme_app.c_politicas('conteo_zonas', p_ver => array['administrador', 'recepcion', 'supervisor'],
  p_ins => array[]::text[], p_upd => array[]::text[], p_del => array[]::text[]);
select piefirme_app.c_politicas('conteo_capturas', p_ver => array['administrador', 'recepcion', 'supervisor'],
  p_ins => array[]::text[], p_upd => array[]::text[], p_del => array[]::text[]);

-- ───────────────────────────── trigger: la captura alimenta conteo_lineas ─────────────────────────────
create or replace function piefirme_app.conteo_sync_linea(p_conteo uuid, p_producto uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; v_total numeric; v_filas integer;
begin
  select * into c from piefirme.conteos_fisicos where id = p_conteo;
  if not found then return; end if;
  select coalesce(sum(cantidad), 0), count(*) into v_total, v_filas from piefirme.conteo_capturas where conteo_id = p_conteo and producto_id = p_producto;
  if v_filas = 0 then
    delete from piefirme.conteo_lineas where conteo_id = p_conteo and producto_id = p_producto and lote_id is null;
    return;
  end if;
  update piefirme.conteo_lineas set contado = v_total where conteo_id = p_conteo and producto_id = p_producto and lote_id is null;
  if not found then
    insert into piefirme.conteo_lineas (organizacion_id, sede_id, conteo_id, producto_id, esperado, contado)
    values (c.organizacion_id, c.sede_id, p_conteo, p_producto,
            coalesce((select existencia from piefirme.inventario_sede where sede_id = c.sede_id and producto_id = p_producto), 0), v_total);
  end if;
end $$;

create or replace function piefirme_app.conteo_captura_trg_antes() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_estado text;
begin
  select estado into v_estado from piefirme.conteos_fisicos where id = coalesce(new.conteo_id, old.conteo_id);
  if found and v_estado in ('autorizado', 'cancelado') then
    raise exception 'el conteo ya está %: no se modifican sus capturas', v_estado using errcode = 'PF409';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create or replace function piefirme_app.conteo_captura_trg_despues() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform piefirme_app.conteo_sync_linea(new.conteo_id, new.producto_id); end if;
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.producto_id is distinct from new.producto_id) then
    perform piefirme_app.conteo_sync_linea(old.conteo_id, old.producto_id);
  end if;
  return null;
end $$;
drop trigger if exists t_antes on piefirme.conteo_capturas;
create trigger t_antes before insert or update or delete on piefirme.conteo_capturas for each row execute function piefirme_app.conteo_captura_trg_antes();
drop trigger if exists t_despues on piefirme.conteo_capturas;
create trigger t_despues after insert or update or delete on piefirme.conteo_capturas for each row execute function piefirme_app.conteo_captura_trg_despues();

-- ───────────────────────────── corte: sin ventas ni traspasos mientras se cuenta ─────────────────────────────
create or replace function piefirme_app.corte_conteo_trg() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.tipo in ('venta', 'traspaso_salida', 'traspaso_entrada')
     and exists (select 1 from piefirme.conteos_fisicos c
                  where c.sede_id = new.sede_id and c.tipo = 'inicial' and c.corte_en is not null and c.estado in ('borrador', 'capturado')) then
    raise exception 'La sucursal está en corte de conteo inicial: no se registran ventas ni traspasos hasta aprobar o cancelar el conteo.' using errcode = 'PF409';
  end if;
  return new;
end $$;
drop trigger if exists t_00_corte_conteo on piefirme.movimientos_inventario;
create trigger t_00_corte_conteo before insert on piefirme.movimientos_inventario for each row execute function piefirme_app.corte_conteo_trg();

-- ───────────────────────────── acceso común ─────────────────────────────
create or replace function piefirme_app.conteo_acceso(p_conteo uuid, p_roles text[] default array['administrador', 'recepcion', 'supervisor'], p_abierto boolean default true)
returns piefirme.conteos_fisicos language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype;
begin
  select * into c from piefirme.conteos_fisicos where id = p_conteo;
  if not found or c.organizacion_id is distinct from piefirme_app.org_id() then raise exception 'conteo inexistente' using errcode = 'PF404'; end if;
  if piefirme_app.rol()::text <> all (p_roles) then raise exception 'tu rol no puede hacer esto en el conteo' using errcode = '42501'; end if;
  if not piefirme_app.puede_sede(c.sede_id) then raise exception 'sin acceso a esa sucursal' using errcode = '42501'; end if;
  if c.tipo <> 'inicial' then raise exception 'este flujo es solo para el conteo inicial' using errcode = 'PF409'; end if;
  if p_abierto and c.estado not in ('borrador', 'capturado') then raise exception 'el conteo ya está %', c.estado using errcode = 'PF409'; end if;
  return c;
end $$;

-- ───────────────────────────── iniciar el conteo (y el corte) ─────────────────────────────
create or replace function piefirme.conteo_inicial_iniciar(p_sede uuid) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid;
begin
  if piefirme_app.rol()::text not in ('administrador', 'supervisor') then raise exception 'solo Administración o la supervisión inician el conteo inicial' using errcode = '42501'; end if;
  if not exists (select 1 from piefirme.sedes where id = p_sede and organizacion_id = piefirme_app.org_id()) then raise exception 'sucursal inexistente' using errcode = 'PF404'; end if;
  if not piefirme_app.puede_sede(p_sede) then raise exception 'sin acceso a esa sucursal' using errcode = '42501'; end if;
  if exists (select 1 from piefirme.conteos_fisicos where sede_id = p_sede and tipo = 'inicial' and estado = 'autorizado') then
    raise exception 'esta sucursal ya tiene su inventario inicial aprobado' using errcode = 'PF409';
  end if;
  select id into v_id from piefirme.conteos_fisicos where sede_id = p_sede and tipo = 'inicial' and estado in ('borrador', 'capturado') order by created_at limit 1;
  if v_id is not null then return v_id; end if;
  insert into piefirme.conteos_fisicos (organizacion_id, sede_id, tipo, estado, nota, corte_en, corte_por)
  values (piefirme_app.org_id(), p_sede, 'inicial', 'borrador', 'Conteo inicial de inventario', now(), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── zonas ─────────────────────────────
create or replace function piefirme.conteo_zona_abrir(p_conteo uuid, p_nombre text) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; z piefirme.conteo_zonas%rowtype;
begin
  c := piefirme_app.conteo_acceso(p_conteo);
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'escribe el nombre del anaquel o la zona' using errcode = '22023'; end if;
  select * into z from piefirme.conteo_zonas where conteo_id = p_conteo and lower(btrim(nombre)) = lower(btrim(p_nombre));
  if found then
    if z.estado = 'cerrada' then raise exception 'la zona «%» ya está cerrada; pide a la supervisión que la reabra', z.nombre using errcode = 'PF409'; end if;
    return z.id;
  end if;
  insert into piefirme.conteo_zonas (organizacion_id, sede_id, conteo_id, nombre) values (c.organizacion_id, c.sede_id, p_conteo, btrim(p_nombre)) returning id into z.id;
  update piefirme.conteos_fisicos set estado = 'borrador' where id = p_conteo and estado = 'capturado';
  return z.id;
end $$;

create or replace function piefirme.conteo_zona_cerrar(p_zona uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare z piefirme.conteo_zonas%rowtype; c piefirme.conteos_fisicos%rowtype;
begin
  select * into z from piefirme.conteo_zonas where id = p_zona;
  if not found then raise exception 'zona inexistente' using errcode = 'PF404'; end if;
  c := piefirme_app.conteo_acceso(z.conteo_id);
  update piefirme.conteo_zonas set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now() where id = p_zona and estado = 'abierta';
  if not exists (select 1 from piefirme.conteo_zonas where conteo_id = z.conteo_id and estado = 'abierta') then
    update piefirme.conteos_fisicos set estado = 'capturado' where id = z.conteo_id and estado = 'borrador';
  end if;
end $$;

create or replace function piefirme.conteo_zona_reabrir(p_zona uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare z piefirme.conteo_zonas%rowtype; c piefirme.conteos_fisicos%rowtype;
begin
  select * into z from piefirme.conteo_zonas where id = p_zona;
  if not found then raise exception 'zona inexistente' using errcode = 'PF404'; end if;
  c := piefirme_app.conteo_acceso(z.conteo_id, array['administrador', 'supervisor']);
  update piefirme.conteo_zonas set estado = 'abierta', cerrada_por = null, cerrada_en = null where id = p_zona;
  update piefirme.conteos_fisicos set estado = 'borrador' where id = z.conteo_id and estado = 'capturado';
end $$;

-- ───────────────────────────── buscar un producto por lo que lee el escáner ─────────────────────────────
create or replace function piefirme.producto_por_codigo(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v text := btrim(coalesce(p_codigo, '')); r piefirme.productos%rowtype; n integer;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion', 'supervisor') then raise exception 'sin permiso' using errcode = '42501'; end if;
  if v = '' then return null; end if;
  select count(*) into n from piefirme.productos p where p.organizacion_id = piefirme_app.org_id() and p.estado <> 'pausado'
     and (p.codigo_barras = v or p.sku = v or p.clave_alterna = v);
  if n = 0 then
    select count(*) into n from piefirme.productos p where p.organizacion_id = piefirme_app.org_id() and p.estado <> 'pausado'
       and p.codigo_barras is not null and ltrim(p.codigo_barras, '0') = ltrim(v, '0') and ltrim(v, '0') <> '';
    if n = 0 then return null; end if;
    select * into r from piefirme.productos p where p.organizacion_id = piefirme_app.org_id() and p.estado <> 'pausado'
       and p.codigo_barras is not null and ltrim(p.codigo_barras, '0') = ltrim(v, '0') order by (p.estado = 'activo') desc, p.created_at limit 1;
  else
    select * into r from piefirme.productos p where p.organizacion_id = piefirme_app.org_id() and p.estado <> 'pausado'
       and (p.codigo_barras = v or p.sku = v or p.clave_alterna = v) order by (p.codigo_barras = v) desc, (p.estado = 'activo') desc, p.created_at limit 1;
  end if;
  return jsonb_build_object('id', r.id, 'nombre', r.nombre, 'sku', r.sku, 'codigo_barras', r.codigo_barras, 'marca', r.marca, 'estado', r.estado,
                            'imagen_path', r.imagen_path, 'coincidencias', n);
end $$;

-- ───────────────────────────── capturar, corregir y borrar ─────────────────────────────
create or replace function piefirme.conteo_capturar(p_conteo uuid, p_zona uuid, p_producto uuid, p_delta numeric default 1, p_cantidad numeric default null, p_metodo text default 'escaner')
returns numeric language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; z piefirme.conteo_zonas%rowtype; v_nueva numeric;
begin
  c := piefirme_app.conteo_acceso(p_conteo);
  select * into z from piefirme.conteo_zonas where id = p_zona and conteo_id = p_conteo;
  if not found then raise exception 'zona inexistente' using errcode = 'PF404'; end if;
  if z.estado <> 'abierta' then raise exception 'la zona «%» está cerrada', z.nombre using errcode = 'PF409'; end if;
  if not exists (select 1 from piefirme.productos where id = p_producto and organizacion_id = c.organizacion_id) then raise exception 'producto inexistente' using errcode = 'PF404'; end if;
  if p_metodo not in ('escaner', 'camara', 'manual') then p_metodo := 'manual'; end if;
  if p_cantidad is not null and p_cantidad < 0 then raise exception 'la cantidad no puede ser negativa' using errcode = '22023'; end if;
  insert into piefirme.conteo_capturas (organizacion_id, sede_id, conteo_id, zona_id, producto_id, cantidad, metodo)
  values (c.organizacion_id, c.sede_id, p_conteo, p_zona, p_producto, greatest(coalesce(p_cantidad, p_delta, 0), 0), p_metodo)
  on conflict (zona_id, producto_id) do update
    set cantidad = case when p_cantidad is not null then p_cantidad else greatest(piefirme.conteo_capturas.cantidad + coalesce(p_delta, 0), 0) end,
        metodo = excluded.metodo, actualizado_por = auth.uid(), actualizado_en = now()
  returning cantidad into v_nueva;
  return v_nueva;
end $$;

create or replace function piefirme.conteo_captura_borrar(p_captura uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare k piefirme.conteo_capturas%rowtype; z piefirme.conteo_zonas%rowtype; c piefirme.conteos_fisicos%rowtype;
begin
  select * into k from piefirme.conteo_capturas where id = p_captura;
  if not found then raise exception 'captura inexistente' using errcode = 'PF404'; end if;
  c := piefirme_app.conteo_acceso(k.conteo_id);
  select * into z from piefirme.conteo_zonas where id = k.zona_id;
  if z.estado <> 'abierta' then raise exception 'la zona «%» está cerrada', z.nombre using errcode = 'PF409'; end if;
  delete from piefirme.conteo_capturas where id = p_captura;
end $$;

-- ───────────────────────────── producto provisional ─────────────────────────────
create or replace function piefirme.producto_provisional_crear(p_conteo uuid, p_zona uuid, p_codigo text, p_nombre text, p_cantidad numeric, p_foto_path text default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; z piefirme.conteo_zonas%rowtype; v_cod text := btrim(coalesce(p_codigo, '')); v_id uuid;
begin
  c := piefirme_app.conteo_acceso(p_conteo);
  select * into z from piefirme.conteo_zonas where id = p_zona and conteo_id = p_conteo;
  if not found then raise exception 'zona inexistente' using errcode = 'PF404'; end if;
  if z.estado <> 'abierta' then raise exception 'la zona «%» está cerrada', z.nombre using errcode = 'PF409'; end if;
  if v_cod = '' then raise exception 'falta el código' using errcode = '22023'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'escribe el nombre del producto' using errcode = '22023'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'la cantidad debe ser cero o más' using errcode = '22023'; end if;
  if exists (select 1 from piefirme.productos where organizacion_id = c.organizacion_id and (codigo_barras = v_cod or sku = v_cod or sku = 'PROV-' || v_cod)) then
    raise exception 'ese código ya existe en el catálogo; vuelve a escanearlo' using errcode = 'PF409';
  end if;
  insert into piefirme.productos (organizacion_id, sku, codigo_barras, nombre, categoria, tipo, iva_tipo, estado, origen,
                                  provisional_conteo_id, provisional_por, provisional_en, provisional_foto_path)
  values (c.organizacion_id, 'PROV-' || v_cod, v_cod, btrim(p_nombre), 'Por clasificar', 'venta', 'exento', 'provisional', 'conteo',
          p_conteo, auth.uid(), now(), nullif(btrim(coalesce(p_foto_path, '')), ''))
  returning id into v_id;
  insert into piefirme.conteo_capturas (organizacion_id, sede_id, conteo_id, zona_id, producto_id, cantidad, metodo)
  values (c.organizacion_id, c.sede_id, p_conteo, p_zona, v_id, p_cantidad, 'manual');
  return jsonb_build_object('id', v_id, 'nombre', btrim(p_nombre), 'sku', 'PROV-' || v_cod, 'codigo_barras', v_cod, 'estado', 'provisional', 'cantidad', p_cantidad);
end $$;

-- Completar (marca, categoría, precio) o marcar como duplicado de otro producto; los conteos todavía abiertos pasan al producto correcto.
create or replace function piefirme.producto_provisional_completar(p_producto uuid, p_nombre text, p_marca text, p_categoria text, p_costo numeric, p_precio numeric, p_duplicado_de uuid default null)
returns text language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.productos%rowtype; k record; v_otro uuid;
begin
  if piefirme_app.rol()::text not in ('administrador', 'supervisor') then raise exception 'solo Administración o la supervisión completan productos provisionales' using errcode = '42501'; end if;
  select * into p from piefirme.productos where id = p_producto and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'producto inexistente' using errcode = 'PF404'; end if;
  if p.estado <> 'provisional' then raise exception 'el producto ya no es provisional' using errcode = 'PF409'; end if;
  if p_duplicado_de is not null then
    if p_duplicado_de = p_producto or not exists (select 1 from piefirme.productos where id = p_duplicado_de and organizacion_id = p.organizacion_id and estado <> 'provisional') then
      raise exception 'elige el producto del catálogo del que es duplicado' using errcode = '22023';
    end if;
    for k in select cp.* from piefirme.conteo_capturas cp join piefirme.conteos_fisicos cf on cf.id = cp.conteo_id
              where cp.producto_id = p_producto and cf.estado in ('borrador', 'capturado') loop
      select id into v_otro from piefirme.conteo_capturas where zona_id = k.zona_id and producto_id = p_duplicado_de;
      if v_otro is not null then
        update piefirme.conteo_capturas set cantidad = cantidad + k.cantidad, actualizado_por = auth.uid(), actualizado_en = now() where id = v_otro;
        delete from piefirme.conteo_capturas where id = k.id;
      else
        update piefirme.conteo_capturas set producto_id = p_duplicado_de, actualizado_por = auth.uid(), actualizado_en = now() where id = k.id;
      end if;
    end loop;
    update piefirme.productos set estado = 'pausado', provisional_nota = 'Duplicado de ' || (select sku from piefirme.productos where id = p_duplicado_de) where id = p_producto;
    return 'duplicado';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'falta el nombre' using errcode = '22023'; end if;
  if p_categoria is null or length(btrim(p_categoria)) = 0 or btrim(p_categoria) = 'Por clasificar' then raise exception 'elige la categoría' using errcode = '22023'; end if;
  if p_precio is null or p_precio <= 0 then raise exception 'falta el precio de lista' using errcode = '22023'; end if;
  update piefirme.productos set nombre = btrim(p_nombre), marca = nullif(btrim(coalesce(p_marca, '')), ''), categoria = btrim(p_categoria),
         costo_promedio = greatest(coalesce(p_costo, 0), 0), estado = 'activo' where id = p_producto;
  insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio, motivo)
  values (p.organizacion_id, 'producto', p_producto, current_date, p_precio, 'fijo', 'Alta desde conteo inicial (producto provisional)');
  return 'completado';
end $$;

-- ───────────────────────────── aprobar: genera el inventario inicial ─────────────────────────────
create or replace function piefirme.conteo_inicial_aprobar(p_conteo uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; v_movs integer; v_ceros integer := 0; r record;
begin
  c := piefirme_app.conteo_acceso(p_conteo, array['administrador']);
  if exists (select 1 from piefirme.conteo_zonas where conteo_id = p_conteo and estado = 'abierta') then raise exception 'hay zonas sin cerrar: ciérralas antes de aprobar' using errcode = 'PF409'; end if;
  if not exists (select 1 from piefirme.conteo_zonas where conteo_id = p_conteo) then raise exception 'no hay zonas contadas' using errcode = 'PF409'; end if;
  -- lo que no se contó y tiene existencia queda en cero
  for r in select i.producto_id from piefirme.inventario_sede i
            where i.sede_id = c.sede_id and i.existencia <> 0
              and not exists (select 1 from piefirme.conteo_lineas cl where cl.conteo_id = p_conteo and cl.producto_id = i.producto_id and cl.lote_id is null) loop
    insert into piefirme.conteo_lineas (organizacion_id, sede_id, conteo_id, producto_id, esperado, contado, motivo)
    values (c.organizacion_id, c.sede_id, p_conteo, r.producto_id, (select existencia from piefirme.inventario_sede where sede_id = c.sede_id and producto_id = r.producto_id), 0, 'no se contó: queda en 0');
    v_ceros := v_ceros + 1;
  end loop;
  -- el esperado de lo contado se refresca con la existencia de este momento
  update piefirme.conteo_lineas cl set esperado = coalesce((select existencia from piefirme.inventario_sede i where i.sede_id = c.sede_id and i.producto_id = cl.producto_id), 0)
   where cl.conteo_id = p_conteo and cl.lote_id is null and cl.motivo is null;
  update piefirme.conteos_fisicos set estado = 'capturado', corte_en = null where id = p_conteo and estado in ('borrador', 'capturado');   -- el corte termina: la sucursal vuelve a vender
  v_movs := piefirme.conteo_autorizar(p_conteo);
  return jsonb_build_object('movimientos', v_movs, 'puestos_en_cero', v_ceros, 'folio', c.folio);
end $$;

-- Cancelar el conteo y levantar el corte (solo Administración y supervisión)
create or replace function piefirme.conteo_inicial_cancelar(p_conteo uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype;
begin
  c := piefirme_app.conteo_acceso(p_conteo, array['administrador', 'supervisor']);
  update piefirme.conteos_fisicos set estado = 'cancelado', corte_en = null where id = p_conteo;
end $$;

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_conteo_zonas with (security_invoker = true) as
  select z.id, z.organizacion_id, z.sede_id, z.conteo_id, z.nombre, z.estado, z.abierta_por, z.abierta_en, z.cerrada_por, z.cerrada_en,
         (select count(*) from piefirme.conteo_capturas k where k.zona_id = z.id)::integer as productos,
         coalesce((select sum(k.cantidad) from piefirme.conteo_capturas k where k.zona_id = z.id), 0) as piezas,
         (select nullif(btrim(coalesce(pf.nombre, '') || ' ' || coalesce(pf.apellidos, '')), '') from piefirme.perfiles pf where pf.id = z.abierta_por) as abierta_por_nombre
    from piefirme.conteo_zonas z;

create or replace view piefirme.prp_conteo_capturas with (security_invoker = true) as
  select k.id, k.organizacion_id, k.sede_id, k.conteo_id, k.zona_id, z.nombre as zona_nombre, z.estado as zona_estado, k.producto_id,
         p.nombre as producto_nombre, p.sku, p.codigo_barras, p.marca, p.imagen_path, p.estado as producto_estado, k.cantidad, k.metodo,
         k.creado_por, k.creado_en, k.actualizado_por, k.actualizado_en,
         (select nullif(btrim(coalesce(pf.nombre, '') || ' ' || coalesce(pf.apellidos, '')), '') from piefirme.perfiles pf where pf.id = k.actualizado_por) as actualizado_por_nombre
    from piefirme.conteo_capturas k
    join piefirme.conteo_zonas z on z.id = k.zona_id
    join piefirme.productos p on p.id = k.producto_id;

create or replace view piefirme.prp_conteo_inicial_resumen with (security_invoker = true) as
  select c.id as conteo_id, c.organizacion_id, c.sede_id, s.nombre as sede_nombre, c.folio, c.estado, c.fecha, c.corte_en, c.autorizado_en, c.created_at,
         (select count(distinct k.producto_id) from piefirme.conteo_capturas k where k.conteo_id = c.id)::integer as productos_contados,
         coalesce((select sum(k.cantidad) from piefirme.conteo_capturas k where k.conteo_id = c.id), 0) as piezas,
         (select count(distinct k.producto_id) from piefirme.conteo_capturas k join piefirme.productos p on p.id = k.producto_id where k.conteo_id = c.id and p.estado = 'provisional')::integer as provisionales,
         (select count(*) from piefirme.conteo_zonas z where z.conteo_id = c.id)::integer as zonas_total,
         (select count(*) from piefirme.conteo_zonas z where z.conteo_id = c.id and z.estado = 'cerrada')::integer as zonas_cerradas,
         (select count(*) from piefirme.productos p where p.organizacion_id = c.organizacion_id and p.estado = 'activo' and p.tipo = 'venta'
             and not exists (select 1 from piefirme.conteo_capturas k where k.conteo_id = c.id and k.producto_id = p.id))::integer as sin_contar
    from piefirme.conteos_fisicos c
    join piefirme.sedes s on s.id = c.sede_id
   where c.tipo = 'inicial';

create or replace view piefirme.prp_productos_provisionales with (security_invoker = true) as
  select p.id, p.organizacion_id, p.sku, p.codigo_barras, p.nombre, p.categoria, p.marca, p.provisional_conteo_id, p.provisional_en, p.provisional_foto_path, p.provisional_nota,
         (select nullif(btrim(coalesce(pf.nombre, '') || ' ' || coalesce(pf.apellidos, '')), '') from piefirme.perfiles pf where pf.id = p.provisional_por) as creado_por_nombre,
         coalesce((select sum(k.cantidad) from piefirme.conteo_capturas k where k.producto_id = p.id), 0) as cantidad_contada,
         (select c.folio from piefirme.conteos_fisicos c where c.id = p.provisional_conteo_id) as conteo_folio
    from piefirme.productos p
   where p.estado = 'provisional';

grant select on piefirme.prp_conteo_zonas, piefirme.prp_conteo_capturas, piefirme.prp_conteo_inicial_resumen, piefirme.prp_productos_provisionales to authenticated;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.conteo_inicial_iniciar(uuid), piefirme.conteo_zona_abrir(uuid, text), piefirme.conteo_zona_cerrar(uuid), piefirme.conteo_zona_reabrir(uuid),
  piefirme.producto_por_codigo(text), piefirme.conteo_capturar(uuid, uuid, uuid, numeric, numeric, text), piefirme.conteo_captura_borrar(uuid),
  piefirme.producto_provisional_crear(uuid, uuid, text, text, numeric, text), piefirme.producto_provisional_completar(uuid, text, text, text, numeric, numeric, uuid),
  piefirme.conteo_inicial_aprobar(uuid), piefirme.conteo_inicial_cancelar(uuid) from public, anon;
grant execute on function piefirme.conteo_inicial_iniciar(uuid), piefirme.conteo_zona_abrir(uuid, text), piefirme.conteo_zona_cerrar(uuid), piefirme.conteo_zona_reabrir(uuid),
  piefirme.producto_por_codigo(text), piefirme.conteo_capturar(uuid, uuid, uuid, numeric, numeric, text), piefirme.conteo_captura_borrar(uuid),
  piefirme.producto_provisional_crear(uuid, uuid, text, text, numeric, text), piefirme.producto_provisional_completar(uuid, text, text, text, numeric, numeric, uuid),
  piefirme.conteo_inicial_aprobar(uuid), piefirme.conteo_inicial_cancelar(uuid) to authenticated;
revoke all on function piefirme_app.conteo_sync_linea(uuid, uuid), piefirme_app.conteo_captura_trg_antes(), piefirme_app.conteo_captura_trg_despues(), piefirme_app.corte_conteo_trg(),
  piefirme_app.conteo_acceso(uuid, text[], boolean) from public, anon, authenticated;
