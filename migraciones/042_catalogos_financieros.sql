-- 042 · Inventario y finanzas · catálogos financieros: renglones del EDR, grupos de gasto, cuentas bancarias y cierres de periodo.
-- Dominio C. Clona de IRP: cat_grupo_gasto (prp_cat_grupo_gasto), renglones de er_mensual, cuentas/CSV bancario, cierre de semana del Resumen Semanal.
-- Reglas: P-088 (semana sábado → viernes), P-092 (renglones por sede), P-099 (periodo cerrado = solo lectura, reapertura con bitácora),
--   P-101 (renglón de EDR por servicio/producto), P-094 (cuenta por sede o general), CD «dos listas de rubros» → un solo catálogo con permite_fondo.
-- Dependencias: 001, 040 (helpers app.c_*).

-- ───────────────────────────── semana de corte (P-088) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.c_semana_inicio(p_org uuid, p_fecha date) returns date
language sql stable as $$
  select p_fecha - ((extract(dow from p_fecha)::int - s.d + 7) % 7)
    from (select coalesce(piefirme_app.c_param(p_org, 'semana_inicio_dow', 6), 6)::int as d) s
$$;
create or replace function piefirme_app.c_semana_etiqueta(p_org uuid, p_fecha date) returns text
language sql stable as $$
  select 'S' || lpad((((piefirme_app.c_semana_inicio(p_org, p_fecha) - piefirme_app.c_semana_inicio(p_org, make_date(extract(year from piefirme_app.c_semana_inicio(p_org, p_fecha))::int, 1, 1))) / 7) + 1)::text, 2, '0')
$$;

create or replace function piefirme.semana_corte(p_fecha date default null)
returns table (inicio date, fin date, etiqueta text)
language sql stable set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select piefirme_app.c_semana_inicio(piefirme_app.org_id(), f.d), piefirme_app.c_semana_inicio(piefirme_app.org_id(), f.d) + 6, piefirme_app.c_semana_etiqueta(piefirme_app.org_id(), f.d)
    from (select coalesce(p_fecha, current_date) as d) f
$$;
revoke all on function piefirme.semana_corte(date) from public, anon;
grant execute on function piefirme.semana_corte(date) to authenticated;

-- ───────────────────────────── renglones del EDR (E115) ─────────────────────────────
create table piefirme.edr_renglones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null,
  nombre           text not null,
  tipo             text not null check (tipo in ('ingreso', 'gasto', 'fijo', 'memo')),   -- memo: IVA (se muestra aparte, P-092)
  alias            text[] not null default '{}',           -- textos normalizados (proveedor_norm) con que servicios/productos declaran su renglón (P-101)
  orden            integer not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index on piefirme.edr_renglones (organizacion_id, tipo, orden);

-- ───────────────────────────── grupos de gasto (E107) ─────────────────────────────
create table piefirme.grupos_gasto (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null,
  nombre           text not null,
  permite_fondo    boolean not null default true,          -- las comisiones bancarias no son del fondo (P-095)
  renglon_id       uuid references piefirme.edr_renglones(id) on delete set null,
  orden            integer not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave)
);
create index on piefirme.grupos_gasto (organizacion_id, activo, orden);

-- Catálogo base de la clínica (editable por Administración): EDR de E115 y rubros de E107, unificados.
create or replace function piefirme_app.c_sembrar_catalogos_fin(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.edr_renglones (organizacion_id, clave, nombre, tipo, orden) values
    (p_org, 'quiropodia',          'Quiropodia',                          'ingreso', 10),
    (p_org, 'una_encarnada',       'Uña encarnada / onicocriptosis',      'ingreso', 20),
    (p_org, 'laser_hongos',        'Láser hongos',                        'ingreso', 30),
    (p_org, 'plantillas',          'Plantillas ortopédicas',              'ingreso', 40),
    (p_org, 'extraccion_una',      'Extracción de uña',                   'ingreso', 50),
    (p_org, 'otros_servicios',     'Otros servicios',                     'ingreso', 60),
    (p_org, 'venta_productos',     'Venta de productos',                  'ingreso', 70),
    (p_org, 'renta',               'Renta',                               'gasto',  110),
    (p_org, 'sueldos_comisiones',  'Sueldos y comisiones',                'gasto',  120),
    (p_org, 'insumos',             'Insumos',                             'gasto',  130),
    (p_org, 'fondo_revolvente',    'Fondo revolvente',                    'gasto',  140),
    (p_org, 'mantenimiento',       'Mantenimiento',                       'gasto',  150),
    (p_org, 'servicios',           'Servicios',                           'gasto',  160),
    (p_org, 'comisiones_terminal', 'Comisiones de terminal Clip',         'gasto',  170),
    (p_org, 'publicidad',          'Publicidad',                          'gasto',  180),
    (p_org, 'otros_gastos',        'Otros gastos',                        'gasto',  190),
    (p_org, 'licencias_permisos',  'Licencias y permisos',                'fijo',   210),
    (p_org, 'suscripcion_rannix',  'Suscripción Pie Firme',               'fijo',   220),   -- gasto del mes, sin prorrateo (P-092)
    (p_org, 'iva_trasladado',      'IVA trasladado (informativo)',        'memo',   310),
    (p_org, 'iva_acreditable',     'IVA acreditable (informativo)',       'memo',   320)
  on conflict (organizacion_id, clave) do nothing;

  update piefirme.edr_renglones r set alias = (select array_agg(piefirme.proveedor_norm(a)) from unnest(x.al) a)
    from (values ('quiropodia', array['quiropodia', 'pedicura']), ('una_encarnada', array['uña encarnada', 'onicocriptosis', 'ungueal']),
                 ('laser_hongos', array['láser', 'onicomicosis', 'hongos']), ('plantillas', array['plantilla', 'pisada']),
                 ('extraccion_una', array['extracción']), ('venta_productos', array['productos', 'producto'])) x(clave, al)
   where r.organizacion_id = p_org and r.clave = x.clave and r.alias = '{}';

  insert into piefirme.grupos_gasto (organizacion_id, clave, nombre, permite_fondo, renglon_id, orden)
  select p_org, g.clave, g.nombre, g.permite_fondo, r.id, g.orden
    from (values
      ('insumos_curacion',    'Insumos y material de curación', true,  'insumos',            10),
      ('servicios',           'Servicios',                      true,  'servicios',          20),
      ('mantenimiento',       'Mantenimiento',                  true,  'mantenimiento',      30),
      ('combustible',         'Combustible',                    true,  'otros_gastos',       40),
      ('nomina_personal',     'Nómina / Personal',              false, 'sueldos_comisiones', 50),
      ('renta',               'Renta',                          false, 'renta',              60),
      ('publicidad',          'Publicidad',                     false, 'publicidad',         70),
      ('licencias_permisos',  'Licencias y permisos',           false, 'licencias_permisos', 80),
      ('suscripcion_rannix',  'Suscripción Pie Firme',          false, 'suscripcion_rannix', 90),
      ('comision_terminal',   'Comisión de terminal Clip',      false, 'comisiones_terminal',100),
      ('comision_bancaria',   'Comisiones bancarias',           false, 'otros_gastos',      110),
      ('papeleria',           'Papelería',                      true,  'otros_gastos',      210),
      ('gastos_medicos',      'Gastos médicos',                 true,  'insumos',           220),
      ('ferreteria',          'Ferretería',                     true,  'mantenimiento',     230),
      ('limpieza_aseo',       'Limpieza y aseo',                true,  'otros_gastos',      240),
      ('compras_operativas',  'Compras operativas',             true,  'otros_gastos',      250),
      ('otros',               'Otros',                          true,  'otros_gastos',      900)
    ) g(clave, nombre, permite_fondo, renglon, orden)
    join piefirme.edr_renglones r on r.organizacion_id = p_org and r.clave = g.renglon
  on conflict (organizacion_id, clave) do nothing;
end $$;

create or replace function piefirme_app.c_t_sembrar_catalogos_fin() returns trigger
language plpgsql as $$
begin
  perform piefirme_app.c_sembrar_catalogos_fin(new.id);
  return null;
end $$;
create trigger t_sembrar_fin after insert on piefirme.organizaciones for each row execute function piefirme_app.c_t_sembrar_catalogos_fin();
select piefirme_app.c_sembrar_catalogos_fin(id) from piefirme.organizaciones;

-- ───────────────────────────── cuentas bancarias (E118) ─────────────────────────────
create table piefirme.cuentas_bancarias (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id) on delete set null,     -- null = cuenta general de la clínica (P-094)
  banco            text not null,
  alias            text not null,
  terminacion      text not null check (terminacion ~ '^[0-9]{4}$'),         -- nunca se guarda la cuenta completa
  titular          text,
  moneda           text not null default 'MXN' check (moneda in ('MXN', 'USD')),
  saldo_inicial    numeric(14,2) not null default 0,
  mapeo_csv        jsonb not null default '{"fecha":"fecha","descripcion":"descripcion","monto":"monto","referencia":"referencia","formato_fecha":"YYYY-MM-DD"}'::jsonb,   -- mapeo configurable (P-094)
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, banco, terminacion)
);
create index on piefirme.cuentas_bancarias (organizacion_id, activa);

-- ───────────────────────────── cierres de periodo (E117, P-099) ─────────────────────────────
-- Solo existe fila cuando el periodo se cerró (o se reabrió). Semana «en curso»/«por cerrar» se deriva de la fecha (prp_resumen_semanal, 048).
create table piefirme.cierres_periodo (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid references piefirme.sedes(id) on delete cascade,      -- null = toda la clínica
  tipo              text not null check (tipo in ('semana', 'mes')),
  etiqueta          text not null,                                          -- S41 · 2026-10
  fecha_inicio      date not null,
  fecha_fin         date not null,
  estado            text not null default 'cerrado' check (estado in ('cerrado', 'reabierto')),
  ingresos          numeric(14,2),
  gastos            numeric(14,2),
  neto              numeric(14,2),
  efectivo_a_depositar numeric(14,2),
  snapshot          jsonb not null default '{}'::jsonb,                      -- desglose congelado al cerrar
  cerrado_por       uuid references piefirme.perfiles(id) on delete set null,
  cerrado_en        timestamptz,
  reabierto_por     uuid references piefirme.perfiles(id) on delete set null,
  reabierto_en      timestamptz,
  motivo_reapertura text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio),
  check (estado <> 'reabierto' or coalesce(trim(motivo_reapertura), '') <> '')
);
create unique index cierres_unico on piefirme.cierres_periodo (organizacion_id, coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, fecha_inicio);
create index on piefirme.cierres_periodo (organizacion_id, estado, fecha_inicio desc);

-- ¿La fecha cae en un periodo cerrado de esa sede (o de toda la clínica)?
create or replace function piefirme_app.c_periodo_cerrado(p_org uuid, p_sede uuid, p_fecha date) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select p_fecha is not null and exists (
    select 1 from piefirme.cierres_periodo c
     where c.organizacion_id = p_org and c.estado = 'cerrado' and p_fecha between c.fecha_inicio and c.fecha_fin
       and (c.sede_id is null or p_sede is null or c.sede_id = p_sede))
$$;

-- Trigger de bloqueo para tablas con fecha contable. args: (columna_fecha, columnas_exentas_separadas_por_coma)
create or replace function piefirme_app.c_guardar_periodo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_col text := tg_argv[0]; v_ex text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
begin
  if coalesce(current_setting('app.ignorar_cierre', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;   -- borrado en cascada (baja de la clínica)
  if tg_op = 'UPDATE' and array_length(v_ex, 1) > 0 and (to_jsonb(new) - v_ex) = (to_jsonb(old) - v_ex) then
    return new;     -- solo cambió algo exento (p. ej. el estatus de validación)
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if piefirme_app.c_periodo_cerrado(old.organizacion_id, (to_jsonb(old) ->> 'sede_id')::uuid, (to_jsonb(old) ->> v_col)::date) then
      raise exception 'el periodo está cerrado (P-099): registra el ajuste en el periodo vigente con referencia al original' using errcode = 'PF409';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if piefirme_app.c_periodo_cerrado(new.organizacion_id, (to_jsonb(new) ->> 'sede_id')::uuid, (to_jsonb(new) ->> v_col)::date) then
      raise exception 'el periodo está cerrado (P-099): registra el ajuste en el periodo vigente con referencia al original' using errcode = 'PF409';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function piefirme_app.c_cierre_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not exists (select 1 from piefirme.perfiles p where p.id = auth.uid() and p.rol = 'administrador')
     and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
    raise exception 'solo Administración cierra o reabre periodos' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.cierres_periodo for each row execute function piefirme_app.c_cierre_bi();
create trigger t_rpc before insert or update on piefirme.cierres_periodo for each row execute function piefirme_app.c_exigir_rpc('cerrado,reabierto');
create trigger t_inm_del before delete on piefirme.cierres_periodo for each row execute function piefirme_app.c_inmutable();

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.c_politicas('edr_renglones', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_sede => 'no');
select piefirme_app.c_politicas('grupos_gasto', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_sede => 'no');
select piefirme_app.c_politicas('cuentas_bancarias', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'si');
select piefirme_app.c_politicas('cierres_periodo', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_sede => 'si');
select piefirme_app.c_triggers('edr_renglones');
select piefirme_app.c_triggers('grupos_gasto');
select piefirme_app.c_triggers('cuentas_bancarias');
select piefirme_app.c_triggers('cierres_periodo');

-- ───────────────────────────── vistas ─────────────────────────────
create or replace view piefirme.prp_grupos_gasto with (security_invoker = true) as
select g.id, g.organizacion_id, g.clave, g.nombre, g.permite_fondo, g.activo, g.orden, g.renglon_id, r.clave as renglon_clave, r.nombre as renglon_nombre
  from piefirme.grupos_gasto g left join piefirme.edr_renglones r on r.id = g.renglon_id;

create or replace view piefirme.prp_cuentas_bancarias with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, s.nombre as sede_nombre, c.banco, c.alias, c.terminacion, c.banco || ' ···' || c.terminacion as etiqueta,
       c.titular, c.moneda, c.saldo_inicial, c.mapeo_csv, c.activa
  from piefirme.cuentas_bancarias c left join piefirme.sedes s on s.id = c.sede_id;

-- ───────────────────────────── permisos ─────────────────────────────
revoke all on all tables in schema piefirme from anon;
revoke all on function piefirme_app.c_semana_inicio(uuid, date), piefirme_app.c_semana_etiqueta(uuid, date), piefirme_app.c_periodo_cerrado(uuid, uuid, date) from public, anon;
grant execute on function piefirme_app.c_semana_inicio(uuid, date), piefirme_app.c_semana_etiqueta(uuid, date), piefirme_app.c_periodo_cerrado(uuid, uuid, date) to authenticated;
