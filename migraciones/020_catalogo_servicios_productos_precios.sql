-- 020 · Comercial: parámetros de la clínica, folios, servicios, productos y precios con histórico/vigencia y por sede.
-- Dominio B (COMERCIAL Y AGENDA). Reglas: P-033..P-043 (parámetros), P-056 (IVA), P-067..P-069 (precios), P-101 (renglón EDR), P-133 (folios).
-- Dependencias: 001 (organizaciones, sedes, perfiles, app.*). No depende de otros dominios.

-- ───────────────────────────── parámetros por defecto de la clínica (REGLAS_NEGOCIO §0) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.parametros_comercial_default() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'cancelacion_horas_aviso', 48,            -- P-033
    'anticipo_portal_pct', 30,                -- P-034
    'reprogramaciones_max', 2,                -- P-038
    'retencion_horario_min', 10,              -- P-036
    'recordatorio_horas_antes', 24,           -- P-039
    'recordatorio_segundo_activo', false,
    'recordatorio_segundo_horas', 2,
    'recordatorio_canal', 'correo',
    'tolerancia_no_asistio_min', 15,          -- P-045
    'margen_citas_min', 10,                   -- P-043
    'sobrecupo_max_por_dia', 1,               -- P-042
    'lista_espera_ventana_min', 30,           -- P-041
    'lista_espera_vence_dias', 14,            -- P-041
    'paso_agenda_min', 15,                    -- rejilla técnica de horarios ofrecidos (no es regla de negocio)
    'descuento_recepcion_max_pct', 10,        -- P-055
    'iva_servicios', 'exento',                -- P-056
    'iva_productos', '16',
    'tolerancia_corte_mxn', 50,               -- P-058
    'plazo_facturar', 'mes_calendario',       -- P-064
    'vigencia_plan_meses', 12,                -- P-070
    'vigencia_gift_card_meses', 12,           -- P-073
    'aviso_vencimiento_dias', 30,
    'anticipo_plantilla_pct', 50,             -- P-075
    'estudio_acreditable_dias', 30,
    'portal_max_reservas_futuras', 3,         -- P-049
    'portal_limite_ip_hora', 60,
    'portal_limite_reservas_ip_hora', 10,
    'portal_limite_reservas_celular_dia', 5,
    'portal_ventana_max_dias', 14,
    'videoconsulta_servicio_precio', 300      -- P-017
  )
$$;

-- Toda clínica nueva nace con los parámetros por defecto (lo que traiga explícito gana).
create or replace function piefirme_app.sembrar_parametros_comercial() returns trigger
language plpgsql as $$
begin
  new.parametros := piefirme_app.parametros_comercial_default() || coalesce(new.parametros, '{}'::jsonb);
  return new;
end $$;
drop trigger if exists t_parametros_comercial on piefirme.organizaciones;
create trigger t_parametros_comercial before insert on piefirme.organizaciones
  for each row execute function piefirme_app.sembrar_parametros_comercial();
update piefirme.organizaciones set parametros = piefirme_app.parametros_comercial_default() || coalesce(parametros, '{}'::jsonb);

-- Lectura de parámetros / fecha local (security definer: las usan también las RPC del portal)
create or replace function piefirme_app.param_num(p_org uuid, p_clave text, p_def numeric default null) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select nullif(o.parametros ->> p_clave, '')::numeric from piefirme.organizaciones o where o.id = p_org), p_def)
$$;
create or replace function piefirme_app.param_bool(p_org uuid, p_clave text, p_def boolean default false) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select nullif(o.parametros ->> p_clave, '')::boolean from piefirme.organizaciones o where o.id = p_org), p_def)
$$;
create or replace function piefirme_app.param_txt(p_org uuid, p_clave text, p_def text default null) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select o.parametros ->> p_clave from piefirme.organizaciones o where o.id = p_org), p_def)
$$;
create or replace function piefirme_app.zona_org(p_org uuid) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select zona_horaria from piefirme.organizaciones where id = p_org), 'America/Mexico_City')
$$;
create or replace function piefirme_app.hoy_org(p_org uuid) returns date
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select (now() at time zone piefirme_app.zona_org(p_org))::date
$$;

-- ───────────────────────────── helper de políticas RLS (solo para migraciones; no se expone) ─────────────────────────────
-- p_ver: roles que leen (null = todos los de la clínica) · p_esc: roles que insertan/actualizan · p_borrar: roles que borran ({} = nadie)
-- p_sede: 'no' | 'si' (puede_sede(sede_id)) | 'nula' (sede_id null = toda la clínica)
create or replace function piefirme_app.crear_politicas(
  p_tabla text, p_ver text[] default null, p_esc text[] default array['administrador'],
  p_borrar text[] default array['administrador'], p_sede text default 'no',
  p_cond_esc text default 'true', p_cond_ver text default 'true')
returns void language plpgsql as $$
declare v_sede text; v_ver text; v_esc text;
begin
  v_sede := case p_sede when 'si' then ' and piefirme_app.puede_sede(sede_id)'
                        when 'nula' then ' and (sede_id is null or piefirme_app.puede_sede(sede_id))' else '' end;
  v_ver  := case when p_ver is null then '' else format(' and piefirme_app.rol()::text = any(%L)', p_ver) end;
  v_esc  := format(' and piefirme_app.rol()::text = any(%L) and (%s)', p_esc, p_cond_esc);
  execute format('alter table piefirme.%I enable row level security', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_sel', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_ins', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_upd', p_tabla);
  execute format('drop policy if exists %I on piefirme.%I', p_tabla || '_del', p_tabla);
  execute format('create policy %I on piefirme.%I for select to authenticated using (organizacion_id = piefirme_app.org_id()%s%s and (%s))',
                 p_tabla || '_sel', p_tabla, v_sede, v_ver, p_cond_ver);
  execute format('create policy %I on piefirme.%I for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()%s%s)',
                 p_tabla || '_ins', p_tabla, v_sede, v_esc);
  execute format('create policy %I on piefirme.%I for update to authenticated using (organizacion_id = piefirme_app.org_id()%s%s) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()%s%s)',
                 p_tabla || '_upd', p_tabla, v_sede, v_esc, v_sede, v_esc);
  if coalesce(cardinality(p_borrar), 0) > 0 then
    execute format('create policy %I on piefirme.%I for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()%s and piefirme_app.rol()::text = any(%L))',
                   p_tabla || '_del', p_tabla, v_sede, p_borrar);
  end if;
end $$;
revoke all on function piefirme_app.crear_politicas(text, text[], text[], text[], text, text, text) from public, anon, authenticated;

-- updated_at + auditoría en una tabla (helper de migraciones)
create or replace function piefirme_app.b_triggers(p_tabla text, p_auditar boolean default true) returns void
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
revoke all on function piefirme_app.b_triggers(text, boolean) from public, anon, authenticated;

-- ───────────────────────────── folios (P-133: prefijo de sede + consecutivo, nunca se reutilizan) ─────────────────────────────
create table piefirme.contadores_folio_comercial (
  organizacion_id uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id         uuid not null references piefirme.sedes(id) on delete cascade,
  tipo            text not null,
  ultimo          bigint not null default 0,
  primary key (organizacion_id, sede_id, tipo)
);
alter table piefirme.contadores_folio_comercial enable row level security;   -- sin políticas: solo funciones security definer

create or replace function piefirme_app.siguiente_folio_comercial(p_sede uuid, p_tipo text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_clave text; v_n bigint;
begin
  select organizacion_id, upper(clave) into v_org, v_clave from piefirme.sedes where id = p_sede;
  if v_org is null then raise exception 'sede inexistente' using errcode = 'PF404'; end if;
  insert into piefirme.contadores_folio_comercial as c (organizacion_id, sede_id, tipo, ultimo)
  values (v_org, p_sede, p_tipo, 1)
  on conflict (organizacion_id, sede_id, tipo) do update set ultimo = c.ultimo + 1
  returning ultimo into v_n;
  return format('%s-%s-%s', v_clave, p_tipo, lpad(v_n::text, 6, '0'));
end $$;

-- ───────────────────────────── servicios (E68) ─────────────────────────────
create table piefirme.servicios (
  id                          uuid primary key default gen_random_uuid(),
  organizacion_id             uuid not null references piefirme.organizaciones(id) on delete cascade,
  codigo                      text not null,
  nombre                      text not null,
  alias                       text[] not null default '{}',
  categoria                   text not null default 'General',       -- Quiropodia, Ungueal, Pie en riesgo, Biomecánica, Domicilio…
  tipo_precio                 text not null default 'fijo' check (tipo_precio in ('fijo', 'desde', 'por_unidad', 'a_valorar', 'gratis')),
  unidad_cobro                text,                                  -- p. ej. «por uña»
  duracion_min                integer not null default 30 check (duracion_min > 0 and duracion_min <= 480),   -- P-043
  iva_tipo                    text not null default 'exento' check (iva_tipo in ('exento', '16', 'tasa0')),   -- P-056
  requiere_seguimiento        boolean not null default false,
  regla_seguimiento           jsonb not null default '{}'::jsonb,     -- {"curaciones":4,"intervalo":"diario"} · semilla de plantilla de plan
  revision_dias_min           integer check (revision_dias_min is null or revision_dias_min > 0),  -- P-052 revisión vencida
  revision_dias_max           integer,
  requiere_consentimiento     boolean not null default false,         -- P-019
  plantilla_consentimiento_id uuid,                                   -- plantilla de documento (dominio A, 010), referencia lógica
  precio_por_sede             boolean not null default false,
  garantia_dias               integer check (garantia_dias is null or garantia_dias >= 0),
  admite_videoconsulta        boolean not null default false,         -- P-017
  admite_domicilio            boolean not null default false,         -- P-044
  recargo_domicilio           numeric(14,2) check (recargo_domicilio is null or recargo_domicilio >= 0),
  descripcion_publica         text,
  visible_portal              boolean not null default false,         -- P-134
  clave_sat                   text,
  unidad_sat                  text,
  renglon_edr                 text,                                   -- P-101
  valoracion_acreditable      boolean not null default false,         -- se descuenta si inicia tratamiento
  es_curacion_incluida        boolean not null default false,         -- curación de un plan: $0, sin anticipo (P-034)
  anticipo_monto_fijo         numeric(14,2) check (anticipo_monto_fijo is null or anticipo_monto_fijo >= 0),
  estado                      text not null default 'activo' check (estado in ('activo', 'pausado')),   -- S40
  sintetico                   boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (organizacion_id, codigo),
  check (revision_dias_max is null or revision_dias_min is null or revision_dias_max >= revision_dias_min)
);
create index on piefirme.servicios (organizacion_id, estado);
create index on piefirme.servicios (organizacion_id, categoria);

-- ───────────────────────────── productos (E69) ─────────────────────────────
create table piefirme.productos (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sku               text not null,
  codigo_barras     text,
  nombre            text not null,
  categoria         text not null default 'General',     -- Cuidado en casa, Antimicóticos, Ortopedia, Ortesis, Pie diabético, Insumo clínico
  marca             text,
  presentacion      text,
  tipo              text not null default 'venta' check (tipo in ('venta', 'insumo_clinico', 'por_encargo')),   -- P-079, P-087
  costo_promedio    numeric(14,2) not null default 0 check (costo_promedio >= 0),   -- lo recalcula el dominio de inventario (P-083)
  iva_tipo          text not null default '16' check (iva_tipo in ('exento', '16', 'tasa0')),
  maneja_lote       boolean not null default false,
  maneja_caducidad  boolean not null default false,
  precio_por_sede   boolean not null default false,
  visible_portal    boolean not null default false,
  clave_sat         text,
  unidad_sat        text,
  renglon_edr       text,
  estado            text not null default 'activo' check (estado in ('activo', 'sin_existencia', 'pausado')),
  sintetico         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organizacion_id, sku)
);
create index on piefirme.productos (organizacion_id, estado);
create index on piefirme.productos (organizacion_id, codigo_barras) where codigo_barras is not null;

-- ───────────────────────────── precios con histórico y vigencia (E70; P-067, P-068) ─────────────────────────────
-- Un precio nunca se sobrescribe: un cambio es una fila nueva; la anterior se cierra un día antes.
-- item_tipo = 'oferta' lo usan paquetes, planes, membresías y gift cards (la FK a ofertas se agrega en 021).
create table piefirme.precios (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  item_tipo        text not null check (item_tipo in ('servicio', 'producto', 'oferta')),
  servicio_id      uuid references piefirme.servicios(id) on delete cascade,
  producto_id      uuid references piefirme.productos(id) on delete cascade,
  oferta_id        uuid,
  sede_id          uuid references piefirme.sedes(id) on delete cascade,   -- null = precio de lista de la clínica
  vigente_desde    date not null,
  vigente_hasta    date,
  precio           numeric(14,2) not null check (precio >= 0),            -- con IVA incluido (P-056)
  tipo_precio      text not null default 'fijo' check (tipo_precio in ('fijo', 'desde', 'por_unidad', 'a_valorar', 'gratis')),
  motivo           text not null default 'Alta inicial',                  -- Alta inicial, Ajuste, Promoción, Precio por sede…
  creado_por       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  check ((item_tipo = 'servicio' and servicio_id is not null and producto_id is null and oferta_id is null)
      or (item_tipo = 'producto' and producto_id is not null and servicio_id is null and oferta_id is null)
      or (item_tipo = 'oferta'   and oferta_id   is not null and servicio_id is null and producto_id is null)),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index on piefirme.precios (organizacion_id, item_tipo, servicio_id, producto_id, oferta_id);
create unique index precios_unico_abierto on piefirme.precios
  (organizacion_id, item_tipo, (coalesce(servicio_id, producto_id, oferta_id)), (coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where vigente_hasta is null;
create unique index precios_unico_desde on piefirme.precios
  (organizacion_id, item_tipo, (coalesce(servicio_id, producto_id, oferta_id)), (coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid)), vigente_desde);

create or replace function piefirme_app.precios_antes_insertar() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_item uuid := coalesce(new.servicio_id, new.producto_id, new.oferta_id);
begin
  -- cierra la versión abierta anterior un día antes de la nueva
  update piefirme.precios p set vigente_hasta = new.vigente_desde - 1
   where p.organizacion_id = new.organizacion_id and p.item_tipo = new.item_tipo
     and coalesce(p.servicio_id, p.producto_id, p.oferta_id) = v_item
     and p.sede_id is not distinct from new.sede_id
     and p.vigente_hasta is null and p.vigente_desde < new.vigente_desde;
  if exists (select 1 from piefirme.precios p
              where p.organizacion_id = new.organizacion_id and p.item_tipo = new.item_tipo
                and coalesce(p.servicio_id, p.producto_id, p.oferta_id) = v_item
                and p.sede_id is not distinct from new.sede_id
                and daterange(p.vigente_desde, coalesce(p.vigente_hasta, 'infinity'::date), '[]')
                    && daterange(new.vigente_desde, coalesce(new.vigente_hasta, 'infinity'::date), '[]')) then
    raise exception 'vigencia de precio traslapada: crea la nueva versión después de la última vigente' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_precio_ins before insert on piefirme.precios for each row execute function piefirme_app.precios_antes_insertar();

create or replace function piefirme_app.precios_antes_actualizar() returns trigger
language plpgsql as $$
begin
  if new.precio is distinct from old.precio or new.vigente_desde is distinct from old.vigente_desde
     or new.sede_id is distinct from old.sede_id or new.servicio_id is distinct from old.servicio_id
     or new.producto_id is distinct from old.producto_id or new.oferta_id is distinct from old.oferta_id then
    raise exception 'el precio no se sobrescribe: crea una versión nueva (P-068)' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_precio_upd before update on piefirme.precios for each row execute function piefirme_app.precios_antes_actualizar();

-- Precio vigente: el de la sede si existe; si no, el de lista.
create or replace function piefirme.precio_vigente(p_tipo text, p_item uuid, p_sede uuid default null, p_fecha date default null)
returns numeric language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select pr.precio from piefirme.precios pr
   where pr.item_tipo = p_tipo and coalesce(pr.servicio_id, pr.producto_id, pr.oferta_id) = p_item
     and (pr.sede_id = p_sede or pr.sede_id is null)
     and pr.vigente_desde <= coalesce(p_fecha, piefirme_app.hoy_org(piefirme_app.org_id()))
     and (pr.vigente_hasta is null or pr.vigente_hasta >= coalesce(p_fecha, piefirme_app.hoy_org(piefirme_app.org_id())))
   order by (pr.sede_id is not null) desc, pr.vigente_desde desc
   limit 1
$$;

-- ───────────────────────────── RLS (MATRIZ_ROLES 4.2: todos ven; solo Administrador edita) + triggers ─────────────────────────────
select piefirme_app.crear_politicas('servicios', null, array['administrador'], array['administrador'], 'no');
select piefirme_app.crear_politicas('productos', null, array['administrador'], array['administrador'], 'no');
select piefirme_app.crear_politicas('precios',   null, array['administrador'], '{}'::text[], 'nula');   -- el histórico no se borra
select piefirme_app.b_triggers('servicios');
select piefirme_app.b_triggers('productos');
select piefirme_app.b_triggers('precios');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_servicios with (security_invoker = true) as
select s.*,
       piefirme.precio_vigente('servicio', s.id, null) as precio_lista,
       (select count(*) from piefirme.precios p where p.servicio_id = s.id and p.sede_id is not null and p.vigente_hasta is null) as sedes_con_precio_propio
  from piefirme.servicios s;

create or replace view piefirme.prp_productos with (security_invoker = true) as
select p.*,
       piefirme.precio_vigente('producto', p.id, null) as precio_lista,
       case when coalesce(piefirme.precio_vigente('producto', p.id, null), 0) > 0
            then round(((piefirme.precio_vigente('producto', p.id, null) / (case when p.iva_tipo = '16' then 1.16 else 1 end)) - p.costo_promedio)
                       / (piefirme.precio_vigente('producto', p.id, null) / (case when p.iva_tipo = '16' then 1.16 else 1 end)) * 100, 2)
       end as margen_pct
  from piefirme.productos p;

create or replace view piefirme.prp_precios_historial with (security_invoker = true) as
select pr.id, pr.organizacion_id, pr.item_tipo,
       coalesce(pr.servicio_id, pr.producto_id, pr.oferta_id) as item_id,
       coalesce(s.nombre, p.nombre) as item_nombre,
       pr.sede_id, se.nombre as sede_nombre,
       pr.vigente_desde, pr.vigente_hasta, pr.precio, pr.tipo_precio, pr.motivo,
       pr.creado_por, pf.nombre as creado_por_nombre, pr.created_at as cambiado_en,
       case when pr.vigente_desde > current_date then 'programado'
            when pr.vigente_hasta is null or pr.vigente_hasta >= current_date then 'vigente'
            else 'historico' end as situacion
  from piefirme.precios pr
  left join piefirme.servicios s on s.id = pr.servicio_id
  left join piefirme.productos p on p.id = pr.producto_id
  left join piefirme.sedes se on se.id = pr.sede_id
  left join piefirme.perfiles pf on pf.id = pr.creado_por;

grant execute on function piefirme_app.param_num(uuid, text, numeric), piefirme_app.param_bool(uuid, text, boolean), piefirme_app.param_txt(uuid, text, text),
                          piefirme_app.zona_org(uuid), piefirme_app.hoy_org(uuid) to authenticated;
revoke all on function piefirme_app.siguiente_folio_comercial(uuid, text) from public, anon;
grant execute on function piefirme_app.siguiente_folio_comercial(uuid, text) to authenticated;
revoke all on function piefirme.precio_vigente(text, uuid, uuid, date) from public, anon;
grant execute on function piefirme.precio_vigente(text, uuid, uuid, date) to authenticated;
