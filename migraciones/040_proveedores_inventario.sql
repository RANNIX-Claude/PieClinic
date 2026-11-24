-- 040 · Inventario y finanzas · proveedores, inventario por sede, lotes/caducidad, kardex, conteos y mermas.
-- Dominio C (INVENTARIO Y FINANZAS). Clona de IRP: cat_proveedores (+alias y vinculación por nombre), cat_productos/gasto_detalle (productos de compra).
-- Reglas: P-079 (inventario por sucursal, lote/caducidad), P-082 (catálogo único de proveedores), P-083 (costo promedio ponderado),
--         P-084 (mínimos), P-085 (venta sin existencia → existencia negativa), P-086 (conteos y mermas con autorización), P-111 (CLABE restringida), P-133 (folios).
-- Dependencias: 001 (organizaciones, sedes, perfiles, app.*) y 020 (productos(id), productos.costo_promedio; dominio B).
-- Contrato: la existencia solo cambia por el kardex (movimientos_inventario); nadie la edita directo.

-- ───────────────────────────── parámetros por defecto de finanzas/inventario (REGLAS_NEGOCIO §0) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.parametros_finanzas_default() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'compra_autorizacion_desde', 5000,        -- P-081: OC con total >= este monto exige autorización de Administración
    'comprobante_gasto_desde', 2000,          -- P-093: comprobante fiscal exigido en gasto desde este monto
    'semana_inicio_dow', 6,                   -- P-088: 6 = sábado (semana sábado → viernes)
    'dias_caducidad_proxima', 90,             -- P-079/CA-20: «próximo a caducar» = vence en ≤ 90 días
    'cxc_dias_reciente', 7,                   -- S21: umbrales no definidos por el dueño → default propio
    'cxc_dias_mora', 30,
    'cxp_dias_por_vencer', 7,                 -- S20: ventana de «Por vencer»
    'fondo_alerta_pct', 80,                   -- alerta visual del fondo revolvente
    'conciliacion_tolerancia_dias', 3,        -- P-094: cruce por monto + fecha ± días
    'edr_prorrateo_compartidos', 'ingresos',  -- P-092: gastos compartidos entre sedes por proporción de ingresos
    'iva_tasa_general', 16                    -- P-056
  )
$$;

create or replace function piefirme_app.sembrar_parametros_finanzas() returns trigger
language plpgsql as $$
begin
  new.parametros := piefirme_app.parametros_finanzas_default() || coalesce(new.parametros, '{}'::jsonb);
  return new;
end $$;
drop trigger if exists t_parametros_finanzas on piefirme.organizaciones;
create trigger t_parametros_finanzas before insert on piefirme.organizaciones
  for each row execute function piefirme_app.sembrar_parametros_finanzas();
update piefirme.organizaciones set parametros = piefirme_app.parametros_finanzas_default() || coalesce(parametros, '{}'::jsonb);

create or replace function piefirme_app.c_param(p_org uuid, p_clave text, p_def numeric default null) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select nullif(o.parametros ->> p_clave, '')::numeric from piefirme.organizaciones o where o.id = p_org), p_def)
$$;
create or replace function piefirme_app.c_param_txt(p_org uuid, p_clave text, p_def text default null) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select o.parametros ->> p_clave from piefirme.organizaciones o where o.id = p_org), p_def)
$$;

-- ───────────────────────────── helpers de migración (no se exponen) ─────────────────────────────
-- p_ver: roles que leen (null = todos) · p_ins/p_upd/p_del: roles que escriben ({} = nadie) · p_sede: 'si' = además piefirme_app.puede_sede(sede_id)
create or replace function piefirme_app.c_politicas(
  p_tabla text, p_ver text[] default null,
  p_ins text[] default array['administrador'], p_upd text[] default array['administrador'], p_del text[] default array[]::text[],
  p_sede text default 'si', p_cond_ver text default 'true', p_cond_ins text default 'true', p_cond_upd text default 'true', p_cond_del text default 'true')
returns void language plpgsql as $$
declare v_s text; v_v text;
begin
  v_s := case when p_sede = 'si' then ' and piefirme_app.puede_sede(sede_id)' else '' end;
  v_v := case when p_ver is null then '' else format(' and piefirme_app.rol()::text = any(%L)', p_ver) end;
  execute format('alter table piefirme.%I enable row level security', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_sel', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_ins', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_upd', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_del', p_tabla);
  execute format('create policy %I on piefirme.%I for select to authenticated using (organizacion_id = piefirme_app.org_id()%s%s and (%s))',
                 p_tabla || '_sel', p_tabla, v_s, v_v, p_cond_ver);
  if coalesce(cardinality(p_ins), 0) > 0 then
    execute format('create policy %I on piefirme.%I for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()%s and piefirme_app.rol()::text = any(%L) and (%s))',
                   p_tabla || '_ins', p_tabla, v_s, p_ins, p_cond_ins);
  end if;
  if coalesce(cardinality(p_upd), 0) > 0 then
    execute format('create policy %I on piefirme.%I for update to authenticated using (organizacion_id = piefirme_app.org_id()%s and piefirme_app.rol()::text = any(%L) and (%s)) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()%s and piefirme_app.rol()::text = any(%L) and (%s))',
                   p_tabla || '_upd', p_tabla, v_s, p_upd, p_cond_upd, v_s, p_upd, p_cond_upd);
  end if;
  if coalesce(cardinality(p_del), 0) > 0 then
    execute format('create policy %I on piefirme.%I for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()%s and piefirme_app.rol()::text = any(%L) and (%s))',
                   p_tabla || '_del', p_tabla, v_s, p_del, p_cond_del);
  end if;
end $$;
revoke all on function piefirme_app.c_politicas(text, text[], text[], text[], text[], text, text, text, text, text) from public, anon, authenticated;

create or replace function piefirme_app.c_triggers(p_tabla text, p_auditar boolean default true) returns void
language plpgsql as $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = p_tabla and column_name = 'updated_at') then
    execute format('drop trigger if exists t_upd on piefirme.%I', p_tabla);
    execute format('create trigger t_upd before update on piefirme.%I for each row execute function piefirme_app.tocar_updated_at()', p_tabla);
  end if;
  if p_auditar then
    execute format('drop trigger if exists t_aud on piefirme.%I', p_tabla);
    execute format('create trigger t_aud after insert or update or delete on piefirme.%I for each row execute function piefirme_app.auditar()', p_tabla);
  end if;
end $$;
revoke all on function piefirme_app.c_triggers(text, boolean) from public, anon, authenticated;

-- Hijo → hereda organizacion_id (y sede_id si la tabla lo tiene) del padre y rechaza un padre de otra clínica.
-- Uso: trigger before insert con args (tabla_padre, columna_fk).
create or replace function piefirme_app.c_heredar_de_padre() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_sede uuid; v_padre uuid; v_pj jsonb; v_json jsonb := to_jsonb(new);
begin
  v_padre := (v_json ->> tg_argv[1])::uuid;
  execute format('select to_jsonb(t) from piefirme.%I t where t.id = $1', tg_argv[0]) into v_pj using v_padre;
  v_org := (v_pj ->> 'organizacion_id')::uuid;
  v_sede := (v_pj ->> 'sede_id')::uuid;
  if v_org is null then raise exception 'registro padre inexistente (%)', tg_argv[0] using errcode = 'PF404'; end if;
  if v_json ? 'organizacion_id' and (v_json ->> 'organizacion_id') is not null and (v_json ->> 'organizacion_id')::uuid <> v_org then
    raise exception 'el registro pertenece a otra clínica' using errcode = '42501';
  end if;
  new := jsonb_populate_record(new, jsonb_build_object('organizacion_id', v_org));
  if v_json ? 'sede_id' and v_sede is not null then
    new := jsonb_populate_record(new, jsonb_build_object('sede_id', v_sede));
  end if;
  return new;
end $$;

-- Folio automático {SEDE}-{TIPO}-{NNNNNN} (P-133). args: (tipo, columna_sede)
create table piefirme.fin_folios (
  organizacion_id uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id         uuid not null references piefirme.sedes(id) on delete cascade,
  tipo            text not null,
  ultimo          bigint not null default 0,
  primary key (sede_id, tipo)
);
alter table piefirme.fin_folios enable row level security;   -- sin políticas: solo funciones security definer

create or replace function piefirme.fin_folio(p_sede uuid, p_tipo text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_clave text; v_n bigint;
begin
  select organizacion_id, upper(clave) into v_org, v_clave from piefirme.sedes where id = p_sede;
  if v_org is null then raise exception 'sede inexistente' using errcode = 'PF404'; end if;
  if auth.uid() is not null and v_org is distinct from piefirme_app.org_id() then
    raise exception 'sede de otra clínica' using errcode = '42501';
  end if;
  insert into piefirme.fin_folios as f (organizacion_id, sede_id, tipo, ultimo) values (v_org, p_sede, upper(p_tipo), 1)
  on conflict (sede_id, tipo) do update set ultimo = f.ultimo + 1
  returning ultimo into v_n;
  return format('%s-%s-%s', v_clave, upper(p_tipo), lpad(v_n::text, 6, '0'));
end $$;
revoke all on function piefirme.fin_folio(uuid, text) from public, anon;
grant execute on function piefirme.fin_folio(uuid, text) to authenticated;

create or replace function piefirme_app.c_asignar_folio() returns trigger
language plpgsql as $$
declare v_sede uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
begin
  if (to_jsonb(new) ->> 'folio') is null then
    new := jsonb_populate_record(new, jsonb_build_object('folio', piefirme.fin_folio(v_sede, tg_argv[0])));
  end if;
  return new;
end $$;

-- ───────────────────────────── proveedores (E97) · clon de IRP cat_proveedores ─────────────────────────────
create table piefirme.proveedores (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null,
  nombre           text not null,
  razon_social     text,
  rfc              text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  categoria        text not null default 'insumos'
                   check (categoria in ('insumos', 'plantillas_ortesis', 'material_clinico', 'equipo_instrumental', 'mantenimiento_equipo', 'operacion')),
  es_laboratorio   boolean not null default false,     -- P-013: laboratorio externo de plantillas
  activo           boolean not null default true,      -- S40
  telefono         text,
  email            text,
  contacto         text,
  condiciones_pago text not null default 'contado',
  dias_credito     integer not null default 0 check (dias_credito >= 0),
  dias_entrega     text,
  notas            text,
  alias            text[] not null default '{}',       -- IRP: nombres alternos normalizados con proveedor_norm()
  sintetico        boolean not null default false,
  created_by       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index on piefirme.proveedores (organizacion_id, activo, nombre);

-- Datos bancarios aparte: la CLABE solo la ve Administración (P-111)
create table piefirme.proveedores_bancarios (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  proveedor_id     uuid not null unique references piefirme.proveedores(id) on delete cascade,
  banco            text,
  titular          text,
  clabe            text check (clabe is null or clabe ~ '^[0-9]{18}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.proveedores_bancarios (organizacion_id);

create table piefirme.proveedor_documentos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  proveedor_id     uuid not null references piefirme.proveedores(id) on delete cascade,
  tipo             text not null default 'otro' check (tipo in ('contrato', 'constancia_fiscal', 'cotizacion', 'otro')),
  nombre           text not null,
  archivo_path     text not null,                       -- bucket «pf-documentos»: <organizacion_id>/proveedores/…
  vigente_hasta    date,
  subido_por       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index on piefirme.proveedor_documentos (organizacion_id, proveedor_id);

-- Producto que surte el proveedor (E98)
create table piefirme.proveedor_productos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  proveedor_id     uuid not null references piefirme.proveedores(id) on delete cascade,
  producto_id      uuid not null references piefirme.productos(id) on delete cascade,
  sku_proveedor    text,
  ultimo_costo     numeric(14,4) check (ultimo_costo is null or ultimo_costo >= 0),
  ultima_compra    date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (proveedor_id, producto_id)
);
create index on piefirme.proveedor_productos (organizacion_id, producto_id);

-- Normalización y vinculación por nombre (IRP: proveedor_norm / proveedor_buscar / vincular_nombre_proveedor)
create or replace function piefirme.proveedor_norm(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(translate(upper(trim(coalesce(p, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]', '', 'g'), '')
$$;

create or replace function piefirme.proveedor_buscar(p_org uuid, p text) returns uuid
language sql stable as $$
  select c.id from piefirme.proveedores c
   where c.organizacion_id = p_org and piefirme.proveedor_norm(p) is not null
     and (piefirme.proveedor_norm(c.nombre) = piefirme.proveedor_norm(p)
          or piefirme.proveedor_norm(c.clave) = piefirme.proveedor_norm(p)
          or piefirme.proveedor_norm(c.razon_social) = piefirme.proveedor_norm(p)
          or piefirme.proveedor_norm(p) = any (c.alias))
   order by c.activo desc, c.created_at limit 1
$$;

-- Asigna el texto libre a un proveedor del catálogo y guarda el alias; liga los gastos (042-044) sin proveedor_id.
-- (la parte que toca gastos vive en 044: piefirme.proveedor_vincular_nombre)
create or replace function piefirme_app.c_proveedor_alias() returns trigger
language plpgsql as $$
begin
  new.alias := coalesce((select array_agg(distinct a) from unnest(new.alias) a where a is not null), '{}');
  return new;
end $$;
create trigger t_alias before insert or update of alias on piefirme.proveedores
  for each row execute function piefirme_app.c_proveedor_alias();

select piefirme_app.c_politicas('proveedores', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no');
select piefirme_app.c_politicas('proveedores_bancarios', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no');
select piefirme_app.c_politicas('proveedor_documentos', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no');
select piefirme_app.c_politicas('proveedor_productos', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no');
select piefirme_app.c_triggers('proveedores');
select piefirme_app.c_triggers('proveedores_bancarios');
select piefirme_app.c_triggers('proveedor_documentos');
select piefirme_app.c_triggers('proveedor_productos', false);
create trigger t_a_padre before insert on piefirme.proveedores_bancarios for each row execute function piefirme_app.c_heredar_de_padre('proveedores', 'proveedor_id');
create trigger t_a_padre before insert on piefirme.proveedor_documentos for each row execute function piefirme_app.c_heredar_de_padre('proveedores', 'proveedor_id');
create trigger t_a_padre before insert on piefirme.proveedor_productos for each row execute function piefirme_app.c_heredar_de_padre('proveedores', 'proveedor_id');

-- ───────────────────────────── inventario por producto y sede (E87) ─────────────────────────────
create table piefirme.inventario_sede (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  producto_id      uuid not null references piefirme.productos(id) on delete cascade,
  existencia       numeric(14,3) not null default 0,                     -- puede ser negativa (P-085); solo la mueve el kardex
  minimo           numeric(14,3) not null default 0 check (minimo >= 0), -- P-084 lo captura Administración
  maximo           numeric(14,3) check (maximo is null or maximo >= minimo),
  ubicacion        text,
  ultimo_conteo    date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (sede_id, producto_id)
);
create index on piefirme.inventario_sede (organizacion_id, sede_id);
create index on piefirme.inventario_sede (organizacion_id, producto_id);

-- Lotes y caducidad (E88): el lote vive por sede
create table piefirme.lotes_producto (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  producto_id      uuid not null references piefirme.productos(id) on delete cascade,
  numero_lote      text,
  caducidad        date,
  existencia       numeric(14,3) not null default 0,
  estado           text not null default 'vigente' check (estado in ('vigente', 'bloqueado', 'agotado')),
  proveedor_id     uuid references piefirme.proveedores(id) on delete set null,
  recibido_en      date not null default current_date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index lotes_unico on piefirme.lotes_producto (sede_id, producto_id, coalesce(numero_lote, ''), coalesce(caducidad, date '1900-01-01'));
create index on piefirme.lotes_producto (organizacion_id, sede_id, producto_id);
create index on piefirme.lotes_producto (organizacion_id, caducidad) where caducidad is not null and existencia > 0;

-- Kardex (E89): solo inserta, jamás se edita ni se borra
create table piefirme.movimientos_inventario (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  producto_id      uuid not null references piefirme.productos(id),
  lote_id          uuid references piefirme.lotes_producto(id),
  tipo             text not null check (tipo in ('compra', 'venta', 'traspaso_salida', 'traspaso_entrada', 'merma', 'conteo', 'ajuste',
                                                 'consumo_consulta', 'devolucion_proveedor', 'devolucion_cliente')),
  cantidad         numeric(14,3) not null check (cantidad <> 0),         -- (+) entra · (−) sale
  costo_unitario   numeric(14,4) check (costo_unitario is null or costo_unitario >= 0),   -- compra: costo real; resto: costo promedio vigente (P-083)
  costo_total      numeric(14,2),
  referencia_tipo  text,                                                  -- venta | traspaso | merma | conteo | oc | recepcion | consulta …
  referencia_id    uuid,
  referencia_folio text,
  nota             text,
  usuario_id       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  fecha            timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  check ((tipo in ('compra', 'traspaso_entrada', 'devolucion_cliente') and cantidad > 0)
      or (tipo in ('venta', 'traspaso_salida', 'merma', 'consumo_consulta', 'devolucion_proveedor') and cantidad < 0)
      or tipo in ('conteo', 'ajuste')),
  check (tipo <> 'compra' or costo_unitario is not null)
);
create index on piefirme.movimientos_inventario (organizacion_id, sede_id, fecha desc);
create index on piefirme.movimientos_inventario (organizacion_id, producto_id, fecha desc);
create index on piefirme.movimientos_inventario (referencia_tipo, referencia_id);

-- Histórico de costo (E99)
create table piefirme.historico_costos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  producto_id        uuid not null references piefirme.productos(id) on delete cascade,
  proveedor_id       uuid references piefirme.proveedores(id) on delete set null,
  fecha              date not null default current_date,
  costo              numeric(14,4) not null check (costo >= 0),
  costo_promedio     numeric(14,4) not null,                             -- promedio resultante tras la entrada
  movimiento_id      uuid references piefirme.movimientos_inventario(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index on piefirme.historico_costos (organizacion_id, producto_id, fecha desc);

-- Folio y coherencia del movimiento ANTES de insertar
create or replace function piefirme_app.c_kardex_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_lote piefirme.lotes_producto%rowtype; v_prom numeric;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'sede de otra clínica' using errcode = '42501';
  end if;
  if not exists (select 1 from piefirme.productos p where p.id = new.producto_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'producto de otra clínica' using errcode = '42501';
  end if;
  if new.lote_id is not null then
    select * into v_lote from piefirme.lotes_producto where id = new.lote_id;
    if not found or v_lote.sede_id <> new.sede_id or v_lote.producto_id <> new.producto_id or v_lote.organizacion_id <> new.organizacion_id then
      raise exception 'el lote no corresponde a la sede y producto del movimiento' using errcode = 'PF409';
    end if;
  end if;
  if new.costo_unitario is null then   -- P-083: mermas, ventas y traspasos se valúan al costo promedio del momento
    select p.costo_promedio into v_prom from piefirme.productos p where p.id = new.producto_id;
    new.costo_unitario := coalesce(v_prom, 0);
  end if;
  new.costo_total := round(new.cantidad * new.costo_unitario, 2);
  return new;
end $$;
create trigger t_bi before insert on piefirme.movimientos_inventario for each row execute function piefirme_app.c_kardex_bi();

-- Aplica el movimiento: existencia por sede, lote, costo promedio ponderado (P-083) e histórico de costo
create or replace function piefirme_app.c_kardex_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_total numeric; v_prom numeric; v_nuevo numeric;
begin
  perform set_config('app.kardex', 'on', true);
  if new.tipo = 'compra' then
    select coalesce(sum(i.existencia), 0) into v_total from piefirme.inventario_sede i
     where i.organizacion_id = new.organizacion_id and i.producto_id = new.producto_id;
    select p.costo_promedio into v_prom from piefirme.productos p where p.id = new.producto_id;
    v_total := greatest(v_total, 0);
    v_nuevo := case when v_total + new.cantidad > 0
                    then round((v_total * coalesce(v_prom, 0) + new.cantidad * new.costo_unitario) / (v_total + new.cantidad), 2)
                    else round(new.costo_unitario, 2) end;
    update piefirme.productos set costo_promedio = v_nuevo where id = new.producto_id;
    insert into piefirme.historico_costos (organizacion_id, producto_id, proveedor_id, fecha, costo, costo_promedio, movimiento_id)
    values (new.organizacion_id, new.producto_id, (select l.proveedor_id from piefirme.lotes_producto l where l.id = new.lote_id), new.fecha::date, new.costo_unitario, v_nuevo, new.id);
  end if;

  insert into piefirme.inventario_sede as i (organizacion_id, sede_id, producto_id, existencia)
  values (new.organizacion_id, new.sede_id, new.producto_id, new.cantidad)
  on conflict (sede_id, producto_id) do update set existencia = i.existencia + new.cantidad, updated_at = now();

  if new.lote_id is not null then
    update piefirme.lotes_producto set existencia = existencia + new.cantidad,
           estado = case when estado = 'bloqueado' then 'bloqueado'
                         when existencia + new.cantidad <= 0 then 'agotado' else 'vigente' end,
           updated_at = now()
     where id = new.lote_id;
  end if;
  return null;
end $$;
create trigger t_ai after insert on piefirme.movimientos_inventario for each row execute function piefirme_app.c_kardex_ai();

-- El kardex es de solo inserción; la existencia solo la mueve el kardex
create or replace function piefirme_app.c_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (baja de la clínica)
  raise exception 'el registro es de solo inserción (%): corrige con un movimiento nuevo', tg_table_name using errcode = 'PF409';
end $$;
create trigger t_inm before update or delete on piefirme.movimientos_inventario for each row execute function piefirme_app.c_inmutable();
create trigger t_inm before update or delete on piefirme.historico_costos for each row execute function piefirme_app.c_inmutable();

create or replace function piefirme_app.c_existencia_protegida() returns trigger
language plpgsql as $$
begin
  if new.existencia is distinct from old.existencia and coalesce(current_setting('app.kardex', true), '') <> 'on' then
    raise exception 'la existencia solo cambia mediante movimientos de inventario' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_exist before update on piefirme.inventario_sede for each row execute function piefirme_app.c_existencia_protegida();
create trigger t_exist before update on piefirme.lotes_producto for each row execute function piefirme_app.c_existencia_protegida();

create or replace function piefirme_app.c_existencia_inicial() returns trigger
language plpgsql as $$
begin
  if new.existencia <> 0 and coalesce(current_setting('app.kardex', true), '') <> 'on' then
    raise exception 'la existencia inicial se registra con un movimiento de inventario' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_exist_ins before insert on piefirme.inventario_sede for each row execute function piefirme_app.c_existencia_inicial();
create trigger t_exist_ins before insert on piefirme.lotes_producto for each row execute function piefirme_app.c_existencia_inicial();

-- Conteos físicos (E90) y mermas (E91) con autorización de Administración (P-086)
create table piefirme.conteos_fisicos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  folio            text,
  fecha            date not null default current_date,
  responsable_id   uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  estado           text not null default 'borrador' check (estado in ('borrador', 'capturado', 'autorizado', 'cancelado')),
  nota             text,
  autorizado_por   uuid references piefirme.perfiles(id) on delete set null,
  autorizado_en    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.conteos_fisicos (organizacion_id, sede_id, fecha desc);

create table piefirme.conteo_lineas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  conteo_id        uuid not null references piefirme.conteos_fisicos(id) on delete cascade,
  producto_id      uuid not null references piefirme.productos(id),
  lote_id          uuid references piefirme.lotes_producto(id),
  esperado         numeric(14,3) not null default 0,
  contado          numeric(14,3) not null check (contado >= 0),
  ajuste           numeric(14,3) generated always as (contado - esperado) stored,
  motivo           text,
  created_at       timestamptz not null default now()
);
create unique index conteo_linea_unica on piefirme.conteo_lineas (conteo_id, producto_id, coalesce(lote_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on piefirme.conteo_lineas (organizacion_id, conteo_id);

create table piefirme.mermas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  folio            text,
  producto_id      uuid not null references piefirme.productos(id),
  lote_id          uuid references piefirme.lotes_producto(id),
  cantidad         numeric(14,3) not null check (cantidad > 0),
  motivo           text not null,
  tipo             text not null default 'merma' check (tipo in ('merma', 'caducidad', 'danio', 'reclamacion_traspaso', 'otro')),
  es_reclamacion   boolean not null default false,        -- diferencia de traspaso/recepción: se reclama, no vuelve a descontar (P-080)
  traspaso_id      uuid,                                  -- FK en 041
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'autorizada', 'rechazada')),
  registrado_por   uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  autorizado_por   uuid references piefirme.perfiles(id) on delete set null,
  autorizado_en    timestamptz,
  movimiento_id    uuid references piefirme.movimientos_inventario(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.mermas (organizacion_id, sede_id, created_at desc);

create trigger t_folio before insert on piefirme.conteos_fisicos for each row execute function piefirme_app.c_asignar_folio('CNT', 'sede_id');
create trigger t_folio before insert on piefirme.mermas for each row execute function piefirme_app.c_asignar_folio('MER', 'sede_id');
create trigger t_a_padre before insert on piefirme.conteo_lineas for each row execute function piefirme_app.c_heredar_de_padre('conteos_fisicos', 'conteo_id');

-- Un conteo/merma ya autorizado no se edita (se corrige con otro movimiento)
create or replace function piefirme_app.c_cerrado_si_autorizado() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (baja de la clínica)
  if old.estado in ('autorizado', 'autorizada', 'rechazada', 'cancelado') and tg_op = 'UPDATE' and new.estado = old.estado then
    raise exception '% ya está resuelto: no se modifica', tg_table_name using errcode = 'PF409';
  end if;
  if tg_op = 'DELETE' and old.estado in ('autorizado', 'autorizada') then
    raise exception '% autorizado no se borra', tg_table_name using errcode = 'PF409';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_res before update or delete on piefirme.conteos_fisicos for each row execute function piefirme_app.c_cerrado_si_autorizado();
create trigger t_res before update or delete on piefirme.mermas for each row execute function piefirme_app.c_cerrado_si_autorizado();

create or replace function piefirme_app.c_conteo_linea_bloqueada() returns trigger
language plpgsql as $$
declare v_estado text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (baja de la clínica)
  select estado into v_estado from piefirme.conteos_fisicos where id = coalesce(new.conteo_id, old.conteo_id);
  if v_estado in ('autorizado', 'cancelado') then
    raise exception 'el conteo ya está %: no se modifican sus líneas', v_estado using errcode = 'PF409';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_bloq before insert or update or delete on piefirme.conteo_lineas for each row execute function piefirme_app.c_conteo_linea_bloqueada();

-- RPC: autorizar conteo físico → genera movimientos 'conteo' con el ajuste (esperado se congela al capturar)
create or replace function piefirme.conteo_autorizar(p_conteo uuid) returns integer
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; l record; v_n integer := 0;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración autoriza ajustes (P-086)' using errcode = '42501'; end if;
  perform set_config('app.c_rpc', 'on', true);
  select * into c from piefirme.conteos_fisicos where id = p_conteo for update;
  if not found then raise exception 'conteo inexistente' using errcode = 'PF404'; end if;
  if c.estado not in ('borrador', 'capturado') then raise exception 'el conteo ya está %', c.estado using errcode = 'PF409'; end if;
  for l in
    select cl.*, coalesce(case when cl.lote_id is null then i.existencia else lp.existencia end, 0) as actual
      from piefirme.conteo_lineas cl
      left join piefirme.inventario_sede i on i.sede_id = c.sede_id and i.producto_id = cl.producto_id
      left join piefirme.lotes_producto lp on lp.id = cl.lote_id
     where cl.conteo_id = c.id
  loop
    if l.contado - l.actual <> 0 then
      insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, referencia_folio, nota)
      values (c.organizacion_id, c.sede_id, l.producto_id, l.lote_id, 'conteo', l.contado - l.actual, 'conteo', c.id, c.folio, coalesce(l.motivo, 'ajuste por conteo físico'));
      v_n := v_n + 1;
    end if;
  end loop;
  update piefirme.inventario_sede set ultimo_conteo = c.fecha where sede_id = c.sede_id and producto_id in (select producto_id from piefirme.conteo_lineas where conteo_id = c.id);
  update piefirme.conteos_fisicos set estado = 'autorizado', autorizado_por = auth.uid(), autorizado_en = now() where id = c.id;
  return v_n;
end $$;
revoke all on function piefirme.conteo_autorizar(uuid) from public, anon;
grant execute on function piefirme.conteo_autorizar(uuid) to authenticated;

-- RPC: autorizar o rechazar una merma
create or replace function piefirme.merma_resolver(p_merma uuid, p_autorizar boolean) returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare m piefirme.mermas%rowtype; v_mov uuid := gen_random_uuid();
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración autoriza mermas (P-086)' using errcode = '42501'; end if;
  perform set_config('app.c_rpc', 'on', true);
  select * into m from piefirme.mermas where id = p_merma for update;
  if not found then raise exception 'merma inexistente' using errcode = 'PF404'; end if;
  if m.estado <> 'pendiente' then raise exception 'la merma ya está %', m.estado using errcode = 'PF409'; end if;
  if p_autorizar and not m.es_reclamacion then
    insert into piefirme.movimientos_inventario (id, organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, referencia_folio, nota)
    values (v_mov, m.organizacion_id, m.sede_id, m.producto_id, m.lote_id, 'merma', -m.cantidad, 'merma', m.id, m.folio, m.motivo);
    update piefirme.mermas set estado = 'autorizada', autorizado_por = auth.uid(), autorizado_en = now(), movimiento_id = v_mov where id = m.id;
  else
    update piefirme.mermas set estado = case when p_autorizar then 'autorizada' else 'rechazada' end,
           autorizado_por = auth.uid(), autorizado_en = now() where id = m.id;
    v_mov := null;
  end if;
  return v_mov;
end $$;
revoke all on function piefirme.merma_resolver(uuid, boolean) from public, anon;
grant execute on function piefirme.merma_resolver(uuid, boolean) to authenticated;

-- Bloquear/desbloquear un lote (esterilización/biológico o recall): solo Administración
create or replace function piefirme.lote_cambiar_estado(p_lote uuid, p_estado text) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if p_estado not in ('vigente', 'bloqueado') then raise exception 'estado inválido' using errcode = '22023'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo Administración' using errcode = '42501'; end if;
  update piefirme.lotes_producto set estado = case when p_estado = 'vigente' and existencia <= 0 then 'agotado' else p_estado end where id = p_lote;
end $$;
revoke all on function piefirme.lote_cambiar_estado(uuid, text) from public, anon;
grant execute on function piefirme.lote_cambiar_estado(uuid, text) to authenticated;

-- ───────────────────────────── RLS ─────────────────────────────
-- Existencias y kardex: Podólogo ve, Recepción y Administración operan (MATRIZ_ROLES §4.3). La existencia solo la mueve el kardex.
select piefirme_app.c_politicas('inventario_sede', p_ver => null, p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador']);
select piefirme_app.c_politicas('lotes_producto', p_ver => null, p_ins => array['administrador', 'recepcion'], p_upd => array['administrador']);
select piefirme_app.c_politicas('movimientos_inventario', p_ver => null, p_ins => array['administrador', 'recepcion', 'podologo'],
                       p_upd => array[]::text[], p_cond_ins => $c$(piefirme_app.rol()::text <> 'podologo' or tipo = 'consumo_consulta')$c$);
select piefirme_app.c_politicas('historico_costos', p_ver => array['administrador', 'recepcion'], p_ins => array[]::text[], p_upd => array[]::text[], p_sede => 'no');
select piefirme_app.c_politicas('conteos_fisicos', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'],
                       p_upd => array['administrador', 'recepcion'], p_del => array['administrador', 'recepcion'], p_cond_del => $c$estado = 'borrador'$c$);
select piefirme_app.c_politicas('conteo_lineas', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'],
                       p_upd => array['administrador', 'recepcion'], p_del => array['administrador', 'recepcion']);
select piefirme_app.c_politicas('mermas', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'],
                       p_upd => array['administrador'], p_del => array['administrador'], p_cond_del => $c$estado <> 'autorizada'$c$);
select piefirme_app.c_triggers('inventario_sede', false);
select piefirme_app.c_triggers('lotes_producto');
select piefirme_app.c_triggers('conteos_fisicos');
select piefirme_app.c_triggers('mermas');

-- Los estados que mueven inventario solo cambian dentro de las RPC de esta migración (set_config('app.c_rpc','on'))
create or replace function piefirme_app.c_exigir_rpc() returns trigger
language plpgsql as $$
declare v_prot text[] := string_to_array(tg_argv[0], ',');
begin
  if coalesce(current_setting('app.c_rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.estado = any (v_prot) then
      raise exception 'el estado % solo se alcanza mediante la función correspondiente', new.estado using errcode = 'PF409';
    end if;
  elsif new.estado is distinct from old.estado and new.estado = any (v_prot) then
    raise exception 'el estado % solo se alcanza mediante la función correspondiente', new.estado using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_rpc before insert or update on piefirme.conteos_fisicos for each row execute function piefirme_app.c_exigir_rpc('autorizado');
create trigger t_rpc before insert or update on piefirme.mermas for each row execute function piefirme_app.c_exigir_rpc('autorizada,rechazada');

-- ───────────────────────────── vistas prp_* (lectura; el frontend escribe en tablas base) ─────────────────────────────
create or replace view piefirme.prp_proveedores with (security_invoker = true) as
select p.id, p.organizacion_id, p.clave, p.nombre, p.razon_social, p.rfc, p.categoria, p.es_laboratorio, p.activo,
       case when p.activo then 'Activo' else 'Inactivo' end as estatus,
       p.telefono, p.email, p.contacto, p.condiciones_pago, p.dias_credito, p.dias_entrega, p.notas, p.alias, p.created_at,
       case when b.clabe is null then null else repeat('•', 14) || right(b.clabe, 4) end as clabe_enmascarada
  from piefirme.proveedores p
  left join piefirme.proveedores_bancarios b on b.proveedor_id = p.id;

create or replace view piefirme.prp_inventario with (security_invoker = true) as
select i.id, i.organizacion_id, i.sede_id, s.nombre as sede_nombre, i.producto_id, i.existencia, i.minimo, i.maximo, i.ubicacion, i.ultimo_conteo,
       pr.costo_promedio,
       round(i.existencia * pr.costo_promedio, 2) as valor,
       (select min(l.caducidad) from piefirme.lotes_producto l
         where l.sede_id = i.sede_id and l.producto_id = i.producto_id and l.existencia > 0 and l.caducidad is not null and l.estado <> 'bloqueado') as proxima_caducidad,
       (i.existencia < 0) as existencia_negativa,
       case
         when i.existencia <= 0 then 'sin_existencia'
         when i.existencia < i.minimo then 'bajo_minimo'
         when i.existencia = i.minimo and i.minimo > 0 then 'en_el_minimo'
         when exists (select 1 from piefirme.lotes_producto l
                       where l.sede_id = i.sede_id and l.producto_id = i.producto_id and l.existencia > 0 and l.caducidad is not null
                         and l.caducidad <= current_date + piefirme_app.c_param(i.organizacion_id, 'dias_caducidad_proxima', 90)::int) then 'caduca_pronto'
         else 'ok' end as estado,
       case when i.maximo is not null and i.existencia < i.maximo then i.maximo - i.existencia else null end as sugerido_comprar
  from piefirme.inventario_sede i
  join piefirme.sedes s on s.id = i.sede_id
  join piefirme.productos pr on pr.id = i.producto_id;

create or replace view piefirme.prp_lotes with (security_invoker = true) as
select l.id, l.organizacion_id, l.sede_id, s.nombre as sede_nombre, l.producto_id, l.numero_lote, l.caducidad, l.existencia, l.estado, l.recibido_en,
       (l.caducidad - current_date) as dias_para_caducar,
       case when l.caducidad is null or l.existencia <= 0 then null
            when l.caducidad < current_date then 'rematar_o_mermar'
            when l.caducidad <= current_date + piefirme_app.c_param(l.organizacion_id, 'dias_caducidad_proxima', 90)::int then
                 case when exists (select 1 from piefirme.inventario_sede o where o.producto_id = l.producto_id and o.sede_id <> l.sede_id and o.existencia < o.minimo)
                      then 'mover_a_otra_sede' else 'rematar_o_mermar' end
            else 'vigilar' end as accion_sugerida
  from piefirme.lotes_producto l join piefirme.sedes s on s.id = l.sede_id;

create or replace view piefirme.prp_kardex with (security_invoker = true) as
select m.id, m.organizacion_id, m.sede_id, s.nombre as sede_nombre, m.producto_id, m.lote_id, m.tipo, m.cantidad, m.costo_unitario, m.costo_total,
       m.referencia_tipo, m.referencia_id, m.referencia_folio, m.nota, m.usuario_id, m.fecha
  from piefirme.movimientos_inventario m join piefirme.sedes s on s.id = m.sede_id;

create or replace view piefirme.prp_mermas with (security_invoker = true) as
select m.id, m.organizacion_id, m.sede_id, s.nombre as sede_nombre, m.folio, m.producto_id, m.lote_id, m.cantidad, m.motivo, m.tipo, m.es_reclamacion,
       m.estado, m.registrado_por, m.autorizado_por, m.autorizado_en, m.created_at,
       round(m.cantidad * pr.costo_promedio, 2) as valor_estimado
  from piefirme.mermas m join piefirme.sedes s on s.id = m.sede_id join piefirme.productos pr on pr.id = m.producto_id;

-- ───────────────────────────── permisos ─────────────────────────────
revoke all on all tables in schema piefirme from anon;
revoke all on function piefirme.proveedor_norm(text), piefirme.proveedor_buscar(uuid, text) from public, anon;
grant execute on function piefirme.proveedor_norm(text), piefirme.proveedor_buscar(uuid, text) to authenticated;
revoke all on function piefirme_app.c_param(uuid, text, numeric), piefirme_app.c_param_txt(uuid, text, text) from public, anon;
grant execute on function piefirme_app.c_param(uuid, text, numeric), piefirme_app.c_param_txt(uuid, text, text) to authenticated;
