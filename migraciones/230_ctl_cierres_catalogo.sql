-- 230 · Control y Auditoría · ETAPA 4 (checklist y cierres) · CATÁLOGO: puntos de control versionados, catálogo de fórmulas de esperado,
--       tomas fijas por sucursal, consumo esperado por servicio, tablas nuevas (entrega de turno, firmas, corte) y siembra por omisión.
-- Decisiones (docs/AUDITORIA_ETAPA4.md):
--   · Agregar un control es CONFIGURACIÓN: un punto nunca se edita, cada cambio crea la versión siguiente (ctl_punto_control_guardar) y un cierre
--     se abre con una INSTANTÁNEA de los puntos vigentes en ese momento (version_checklist) → se consulta siempre con su versión (criterio 22).
--   · La fórmula de esperado es una CLAVE de un catálogo cerrado (ctl_formula_esperado) que el servidor sabe calcular; la tolerancia de efectivo y de
--     kits sale de ctl_config (versionada por sucursal); la de los demás puntos es la del propio punto.
--   · Lo que el sistema esperaba (valor_esperado, diferencia) sigue viviendo SOLO en ctl_cierre_calculo / ctl_cierre_corte (solo ver_diferencias).
-- Depende de: 200–206.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── columnas nuevas en tablas de la Etapa 0 ─────────────────────────────
alter table piefirme.ctl_punto_control add column if not exists aplica_apertura boolean not null default false;
alter table piefirme.ctl_punto_control add column if not exists parametros jsonb not null default '{}'::jsonb;   -- producto_id (insumo), kits_por_servicio, toma_fija, semilla
alter table piefirme.ctl_toma_fija add column if not exists orden integer not null default 100;
alter table piefirme.ctl_consumo_esperado add column if not exists activo boolean not null default true;          -- no se borra: se desactiva

-- una captura por punto y cierre; corregirla = fila nueva que referencia la anterior (nunca se edita)
alter table piefirme.ctl_cierre_captura add column if not exists corrige_a uuid references piefirme.ctl_cierre_captura(id);
create unique index if not exists ctl_cierre_cap_inicial_uq on piefirme.ctl_cierre_captura (cierre_id, punto_control_id) where corrige_a is null;
create unique index if not exists ctl_cierre_cap_corr_uq on piefirme.ctl_cierre_captura (corrige_a) where corrige_a is not null;

-- lo que el servidor calculó de la captura (suma del desglose, kits usados…) y de dónde salió el esperado
alter table piefirme.ctl_cierre_calculo add column if not exists valor_calculado numeric(14,2);
alter table piefirme.ctl_cierre_calculo add column if not exists detalle jsonb not null default '{}'::jsonb;

-- orden total de la evidencia (el reloj del servidor es el mismo dentro de una transacción; el orden de inserción no)
alter table piefirme.ctl_evidencia add column if not exists seq bigint generated always as identity;

-- ───────────────────────────── catálogo de fórmulas de esperado ─────────────────────────────
create table if not exists piefirme.ctl_formula_esperado (
  clave             text primary key,
  nombre            text not null,
  descripcion       text not null,
  origen            text not null,                    -- vistas del origen de donde sale el esperado (contrato de desacoplamiento)
  tipos_captura     text[] not null,
  requiere_producto boolean not null default false,   -- el punto debe indicar el insumo (parametros.producto_id)
  unidad            text not null default 'MXN',
  orden             integer not null default 100
);
insert into piefirme.ctl_formula_esperado (clave, nombre, descripcion, origen, tipos_captura, requiere_producto, unidad, orden) values
 ('efectivo_esperado', 'Efectivo esperado en caja', 'Fondo inicial + ventas en efectivo − retiros y gastos − cancelaciones en efectivo del turno (igual que el corte de Caja). En un cierre de día suma todos los turnos del día.',
    'v_ctl_turnos · v_ctl_ventas · movimientos de caja', array['denominaciones', 'numero', 'numero_y_foto'], false, 'MXN', 10),
 ('tarjeta_esperada', 'Tarjeta esperada (terminal)', 'Suma de lo cobrado con tarjeta y terminal Clip en tickets no cancelados del turno, contra el total que marca el terminal.',
    'v_ctl_ventas', array['numero', 'numero_y_foto'], false, 'MXN', 20),
 ('transferencia_esperada', 'Transferencias esperadas', 'Suma de lo cobrado por transferencia en tickets no cancelados del turno.',
    'v_ctl_ventas', array['numero', 'numero_y_foto'], false, 'MXN', 30),
 ('kits_usados', 'Kits usados contra servicios cobrados', 'Existencia anterior + recibido − quedan = kits usados, contra los servicios cobrados del turno por su consumo esperado (ctl_consumo_esperado; si el insumo no tiene consumo definido, un kit por servicio).',
    'v_ctl_ventas · v_ctl_movimientos · v_ctl_saldos · ctl_consumo_esperado', array['conteo_piezas'], true, 'piezas', 40),
 ('tickets_cobrados', 'Tickets cobrados', 'Número de tickets cobrados (no cancelados) del turno.',
    'v_ctl_ventas', array['numero', 'numero_y_foto'], false, 'tickets', 50)
on conflict (clave) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, origen = excluded.origen, tipos_captura = excluded.tipos_captura,
  requiere_producto = excluded.requiere_producto, unidad = excluded.unidad, orden = excluded.orden;

-- ───────────────────────────── entrega de turno (doble firma), firmas y corte ─────────────────────────────
-- La entrega vive en una tabla propia con RLS ver_directo: quien recibe NO ve el monto entregado antes de contar (captura a ciegas).
create table if not exists piefirme.ctl_entrega (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null,
  sucursal_id       uuid not null,
  cierre_id         uuid not null references piefirme.ctl_cierre(id),
  turno_saliente_id uuid,
  usuario_entrega   uuid not null,
  monto_entregado   numeric(14,2) not null check (monto_entregado >= 0),
  entregado_en      timestamptz not null default now(),
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'aceptada_con_diferencia', 'liberada')),
  usuario_recibe    uuid,
  monto_recibido    numeric(14,2),
  recibido_en       timestamptz,
  fondo_inicial     numeric(14,2),            -- el monto confirmado por quien recibe: será el fondo inicial del turno siguiente (nunca uno tecleado)
  turno_entrante_id uuid,                     -- turno que lo tomó como fondo inicial
  caso_id           uuid,
  liberada_por      uuid, liberada_en timestamptz, motivo_liberacion text,
  creado_en         timestamptz not null default now(),
  creado_por        uuid,
  unique (cierre_id)
);
create index if not exists ctl_entrega_pend_idx on piefirme.ctl_entrega (organizacion_id, sucursal_id, estado);

create table if not exists piefirme.ctl_entrega_firma (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  entrega_id       uuid not null references piefirme.ctl_entrega(id),
  lado             text not null check (lado in ('entrega', 'recibe')),
  usuario_id       uuid not null,
  monto            numeric(14,2) not null check (monto >= 0),
  desglose         jsonb,
  firmado_en       timestamptz not null default now(),
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (entrega_id, lado)
);

-- corte del cierre (solo dueño y supervisor): lo que el servidor armó al cerrar
create table if not exists piefirme.ctl_cierre_corte (
  cierre_id        uuid primary key references piefirme.ctl_cierre(id),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  datos            jsonb not null,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

insert into piefirme.ctl_transicion (tabla, de, a) values
 ('ctl_entrega', 'pendiente', 'aceptada'), ('ctl_entrega', 'pendiente', 'aceptada_con_diferencia'), ('ctl_entrega', 'pendiente', 'liberada')
on conflict do nothing;

-- privilegios, RLS y triggers de las tablas nuevas (mismo patrón de 200/201)
do $$
declare t text;
begin
  foreach t in array array['ctl_formula_esperado', 'ctl_entrega', 'ctl_entrega_firma', 'ctl_cierre_corte'] loop
    execute format('alter table piefirme.%I enable row level security', t);
    execute format('revoke all on piefirme.%I from public, anon, authenticated', t);
    execute format('grant select on piefirme.%I to authenticated', t);
  end loop;
  foreach t in array array['ctl_entrega', 'ctl_entrega_firma', 'ctl_cierre_corte'] loop
    execute format('drop policy if exists %I on piefirme.%I', t || '_sel', t);
    execute format($p$create policy %I on piefirme.%I for select to authenticated using (
        organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id) and piefirme_app.ctl_puede('ver_directo'))$p$, t || '_sel', t);
    execute format('drop trigger if exists t_00_sellar on piefirme.%I', t);
    execute format('create trigger t_00_sellar before insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_sellar()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
  foreach t in array array['ctl_entrega_firma', 'ctl_cierre_corte'] loop
    execute format('drop trigger if exists t_10_inmutable on piefirme.%I', t);
    execute format('create trigger t_10_inmutable before update or delete on piefirme.%I for each row execute function piefirme_app.ctl_trg_inmutable()', t);
  end loop;
end $$;
drop trigger if exists t_10_estado on piefirme.ctl_entrega;
create trigger t_10_estado before update or delete on piefirme.ctl_entrega for each row execute function piefirme_app.ctl_trg_estado();
drop trigger if exists t_90_hora on piefirme.ctl_entrega_firma;
create trigger t_90_hora after insert on piefirme.ctl_entrega_firma for each row execute function piefirme_app.ctl_trg_hora();

drop policy if exists ctl_formula_esperado_sel on piefirme.ctl_formula_esperado;
create policy ctl_formula_esperado_sel on piefirme.ctl_formula_esperado for select to authenticated
  using (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar'));

-- vistas de cierres: se añade corrige_a (captura vigente = la que nadie corrigió) y lo calculado (solo revisión)
create or replace view piefirme.ctl_cierre_puntos with (security_invoker = true) as
  select c.id, c.organizacion_id, c.sucursal_id, c.cierre_id, c.punto_control_id, c.valor_capturado, c.capturado_en, c.corrige_a
    from piefirme.ctl_cierre_captura c
   where piefirme_app.ctl_puede('capturar');
create or replace view piefirme.ctl_cierre_revision with (security_invoker = true) as
  select c.id, c.organizacion_id, c.sucursal_id, c.cierre_id, c.punto_control_id, c.valor_capturado, c.capturado_en,
         k.valor_esperado, k.diferencia, k.dentro_tolerancia, c.corrige_a, k.valor_calculado, k.detalle
    from piefirme.ctl_cierre_captura c
    join piefirme.ctl_cierre_calculo k on k.cierre_captura_id = c.id
   where piefirme_app.ctl_puede('ver_diferencias');

-- ───────────────────────────── validación y versionado de puntos de control ─────────────────────────────
create or replace function piefirme_app.ctl_validar_punto(p_org uuid, p_tipo text, p_formula text, p_parametros jsonb, p_activo boolean, p_tolerancia numeric, p_sucursales uuid[])
returns void language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.ctl_formula_esperado%rowtype; k text; v_prod uuid;
begin
  if p_tipo is null or p_tipo <> all (array['numero', 'denominaciones', 'conteo_piezas', 'solo_foto', 'numero_y_foto']) then
    raise exception 'tipo de captura no válido: %', p_tipo using errcode = 'PF422';
  end if;
  if coalesce(p_tolerancia, 0) < 0 then raise exception 'la tolerancia no puede ser negativa' using errcode = 'PF422'; end if;
  if p_formula is not null then
    select * into f from piefirme.ctl_formula_esperado where clave = p_formula;
    if not found then raise exception 'fórmula de esperado desconocida: %', p_formula using errcode = 'PF422'; end if;
    if p_tipo <> all (f.tipos_captura) then
      raise exception 'la fórmula «%» no se puede usar con una captura de tipo %', f.nombre, p_tipo using errcode = 'PF422';
    end if;
    if f.requiere_producto and p_activo then
      v_prod := nullif(p_parametros ->> 'producto_id', '')::uuid;
      if v_prod is null or not exists (select 1 from piefirme.productos x where x.id = v_prod and x.organizacion_id = p_org) then
        raise exception 'la fórmula «%» necesita que elija el insumo (producto) que se cuenta', f.nombre using errcode = 'PF422';
      end if;
    end if;
  elsif p_tipo = 'solo_foto' then null;
  end if;
  if p_tipo = 'solo_foto' and p_formula is not null then raise exception 'un punto de solo foto es evidencia: no cuadra contra nada' using errcode = 'PF422'; end if;
  for k in select jsonb_object_keys(coalesce(p_parametros, '{}'::jsonb)) loop
    if k <> all (array['producto_id', 'kits_por_servicio', 'toma_fija', 'semilla']) then raise exception 'parámetro de punto desconocido: %', k using errcode = 'PF422'; end if;
  end loop;
  if coalesce((p_parametros ->> 'toma_fija')::boolean, false) and p_tipo <> 'solo_foto' then
    raise exception 'los puntos de tomas fijas son de tipo solo foto' using errcode = 'PF422';
  end if;
  if p_sucursales is not null and exists (select 1 from unnest(p_sucursales) s where not exists (select 1 from piefirme.sedes d where d.id = s and d.organizacion_id = p_org)) then
    raise exception 'alguna sucursal indicada no pertenece a la clínica' using errcode = 'PF422';
  end if;
end $$;

-- Un punto de control NUNCA se edita: cada cambio crea la versión siguiente y cierra la anterior (los cierres viejos se consultan con su versión).
create or replace function piefirme.ctl_punto_control_guardar(p_id uuid, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); o piefirme.ctl_punto_control%rowtype; v_id uuid; v_suc uuid[]; v_par jsonb; v_tipo text; v_form text; v_act boolean; v_tol numeric;
begin
  p_datos := coalesce(p_datos, '{}'::jsonb);
  perform piefirme_app.ctl_rpc_on();
  if p_id is null then
    if coalesce(btrim(p_datos ->> 'nombre'), '') = '' or (p_datos ->> 'tipo_captura') is null then raise exception 'nombre y tipo de captura son obligatorios' using errcode = 'PF400'; end if;
    v_suc := case when jsonb_typeof(p_datos -> 'sucursales') = 'array' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_datos -> 'sucursales') x) end;
    v_par := case when jsonb_typeof(p_datos -> 'parametros') = 'object' then p_datos -> 'parametros' else '{}'::jsonb end;
    v_form := nullif(p_datos ->> 'formula_esperado', ''); v_act := coalesce((p_datos ->> 'activo')::boolean, true); v_tol := coalesce((p_datos ->> 'tolerancia')::numeric, 0);
    perform piefirme_app.ctl_validar_punto(v_org, p_datos ->> 'tipo_captura', v_form, v_par, v_act, v_tol, v_suc);
    insert into piefirme.ctl_punto_control (organizacion_id, nombre, tipo_captura, obligatorio, aplica_apertura, aplica_turno, aplica_dia, aplica_semanal, sucursales, formula_esperado, tolerancia, orden, activo, parametros)
    values (v_org, btrim(p_datos ->> 'nombre'), p_datos ->> 'tipo_captura', coalesce((p_datos ->> 'obligatorio')::boolean, true), coalesce((p_datos ->> 'aplica_apertura')::boolean, false),
            coalesce((p_datos ->> 'aplica_turno')::boolean, true), coalesce((p_datos ->> 'aplica_dia')::boolean, false), coalesce((p_datos ->> 'aplica_semanal')::boolean, false),
            v_suc, v_form, v_tol, coalesce((p_datos ->> 'orden')::integer, 100), v_act, v_par) returning id into v_id;
    return v_id;
  end if;
  select * into o from piefirme.ctl_punto_control where organizacion_id = v_org and grupo_id = (select grupo_id from piefirme.ctl_punto_control where id = p_id and organizacion_id = v_org)
   order by version desc limit 1 for update;
  if not found then raise exception 'punto de control no encontrado' using errcode = 'PF404'; end if;
  v_suc := case when p_datos ? 'sucursales' then (case when jsonb_typeof(p_datos -> 'sucursales') = 'array' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_datos -> 'sucursales') x) end) else o.sucursales end;
  v_par := case when jsonb_typeof(p_datos -> 'parametros') = 'object' then p_datos -> 'parametros' else o.parametros end;
  v_tipo := coalesce(p_datos ->> 'tipo_captura', o.tipo_captura);
  v_form := case when p_datos ? 'formula_esperado' then nullif(p_datos ->> 'formula_esperado', '') else o.formula_esperado end;
  v_act := coalesce((p_datos ->> 'activo')::boolean, o.activo);
  v_tol := coalesce((p_datos ->> 'tolerancia')::numeric, o.tolerancia);
  perform piefirme_app.ctl_validar_punto(v_org, v_tipo, v_form, v_par, v_act, v_tol, v_suc);
  update piefirme.ctl_punto_control set vigente_hasta = now() where id = o.id;
  insert into piefirme.ctl_punto_control (organizacion_id, grupo_id, nombre, tipo_captura, obligatorio, aplica_apertura, aplica_turno, aplica_dia, aplica_semanal, sucursales, formula_esperado,
                                         tolerancia, orden, activo, parametros, version, vigente_desde)
  values (v_org, o.grupo_id, coalesce(nullif(btrim(p_datos ->> 'nombre'), ''), o.nombre), v_tipo,
          coalesce((p_datos ->> 'obligatorio')::boolean, o.obligatorio), coalesce((p_datos ->> 'aplica_apertura')::boolean, o.aplica_apertura),
          coalesce((p_datos ->> 'aplica_turno')::boolean, o.aplica_turno), coalesce((p_datos ->> 'aplica_dia')::boolean, o.aplica_dia),
          coalesce((p_datos ->> 'aplica_semanal')::boolean, o.aplica_semanal), v_suc, v_form, v_tol, coalesce((p_datos ->> 'orden')::integer, o.orden), v_act, v_par,
          o.version + 1, now()) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── tomas fijas y consumo esperado (catálogos administrables del dueño) ─────────────────────────────
create or replace function piefirme.ctl_toma_fija_guardar(p_id uuid, p_sucursal uuid, p_nombre text, p_aplica text default 'ambos', p_activa boolean default true, p_orden integer default 100) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); v_id uuid;
begin
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'la toma fija necesita un nombre' using errcode = 'PF400'; end if;
  if p_aplica is null or p_aplica <> all (array['cierre_apertura', 'semanal', 'ambos']) then raise exception 'la toma aplica a: cierre_apertura, semanal o ambos' using errcode = 'PF422'; end if;
  perform piefirme_app.ctl_rpc_on();
  if p_id is null then
    if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no válida' using errcode = 'PF403'; end if;
    insert into piefirme.ctl_toma_fija (organizacion_id, sucursal_id, nombre, aplica, activa, orden) values (v_org, p_sucursal, btrim(p_nombre), p_aplica, coalesce(p_activa, true), coalesce(p_orden, 100)) returning id into v_id;
  else
    update piefirme.ctl_toma_fija set nombre = btrim(p_nombre), aplica = p_aplica, activa = coalesce(p_activa, true), orden = coalesce(p_orden, orden)
     where id = p_id and organizacion_id = v_org returning id into v_id;
    if v_id is null then raise exception 'toma fija no encontrada' using errcode = 'PF404'; end if;
  end if;
  return v_id;
end $$;

-- Consumo teórico de un insumo por servicio (base del cuadre de kits). Quitarlo = desactivarlo (no se borra).
create or replace function piefirme.ctl_consumo_esperado_guardar(p_servicio uuid, p_insumo uuid, p_cantidad numeric, p_activo boolean default true) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); v_id uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'la cantidad de insumo por servicio debe ser mayor a 0' using errcode = 'PF422'; end if;
  if not exists (select 1 from piefirme.servicios s where s.id = p_servicio and s.organizacion_id = v_org) then raise exception 'servicio no válido' using errcode = 'PF404'; end if;
  if not exists (select 1 from piefirme.productos p where p.id = p_insumo and p.organizacion_id = v_org) then raise exception 'insumo no válido' using errcode = 'PF404'; end if;
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_consumo_esperado (organizacion_id, servicio_id, insumo_producto_id, cantidad, activo) values (v_org, p_servicio, p_insumo, p_cantidad, coalesce(p_activo, true))
  on conflict (organizacion_id, servicio_id, insumo_producto_id) do update set cantidad = excluded.cantidad, activo = excluded.activo
  returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── siembra por omisión (idempotente) ─────────────────────────────
-- Coherente con la especificación: efectivo por denominaciones contra fondo + ventas en efectivo − retiros, total del terminal contra ventas con tarjeta,
-- kits usados contra servicios cobrados (inactivo hasta elegir el insumo), fotos de tomas fijas y foto del efectivo entregado.
create or replace function piefirme_app.ctl_sembrar_puntos(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare d record; o piefirme.ctl_punto_control%rowtype; v_vacio boolean;
begin
  perform piefirme_app.ctl_rpc_on();
  v_vacio := not exists (select 1 from piefirme.ctl_punto_control where organizacion_id = p_org);
  for d in select * from (values
    ('efectivo', 'Efectivo en caja (desglose por denominación)', 'Efectivo en caja (desglose por denominación)', 'denominaciones', true,  false, true,  true,  false, 'efectivo_esperado', 20::numeric, 10, '{}'::jsonb, true),
    ('tarjeta',  'Total del terminal de tarjeta',                'Total del terminal de tarjeta',                'numero_y_foto', true,  false, true,  true,  false, 'tarjeta_esperada',  0::numeric,  20, '{}'::jsonb, true),
    ('kits',     'Kits de servicio que quedan',                  'Kits de servicio que quedan',                  'conteo_piezas', true,  false, true,  true,  false, 'kits_usados',       0::numeric,  30, '{"kits_por_servicio": 1}'::jsonb, false),
    ('tomas',    'Fotos de las tomas fijas',                     'Foto de la toma fija del mostrador',           'solo_foto',     true,  true,  false, true,  true,  null,                0::numeric,  40, '{"toma_fija": true}'::jsonb, true),
    ('efectivo_foto', 'Foto del efectivo entregado',             'Foto del efectivo entregado',                  'solo_foto',     false, false, true,  false, false, null,                0::numeric,  50, '{}'::jsonb, true)
  ) as t(clave, nombre, nombre_previo, tipo, oblig, ap, tu, di, se, formula, tol, orden, parametros, activo) loop
    if exists (select 1 from piefirme.ctl_punto_control where organizacion_id = p_org and vigente_hasta is null and parametros ->> 'semilla' = d.clave) then continue; end if;
    select * into o from piefirme.ctl_punto_control where organizacion_id = p_org and vigente_hasta is null and nombre = d.nombre_previo and not (parametros ? 'semilla') order by version desc limit 1;
    if found then   -- punto de la Etapa 0: se versiona (la versión anterior se conserva para los cierres que la usaron)
      update piefirme.ctl_punto_control set vigente_hasta = now() where id = o.id;
      insert into piefirme.ctl_punto_control (organizacion_id, grupo_id, nombre, tipo_captura, obligatorio, aplica_apertura, aplica_turno, aplica_dia, aplica_semanal, sucursales,
                                             formula_esperado, tolerancia, orden, activo, parametros, version, vigente_desde)
      values (p_org, o.grupo_id, d.nombre, d.tipo, d.oblig, d.ap, d.tu, d.di, d.se, o.sucursales, d.formula, d.tol, o.orden, case when d.clave = 'kits' then false else o.activo end,
              d.parametros || jsonb_build_object('semilla', d.clave), o.version + 1, now());
    elsif v_vacio then
      insert into piefirme.ctl_punto_control (organizacion_id, nombre, tipo_captura, obligatorio, aplica_apertura, aplica_turno, aplica_dia, aplica_semanal, formula_esperado, tolerancia, orden, activo, parametros)
      values (p_org, d.nombre, d.tipo, d.oblig, d.ap, d.tu, d.di, d.se, d.formula, d.tol, d.orden, d.activo, d.parametros || jsonb_build_object('semilla', d.clave));
    end if;
  end loop;
end $$;

create or replace function piefirme_app.ctl_sembrar_tomas(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s record;
begin
  for s in select id from piefirme.sedes where organizacion_id = p_org and activa and not exists (select 1 from piefirme.ctl_toma_fija t where t.sucursal_id = sedes.id) loop
    insert into piefirme.ctl_toma_fija (organizacion_id, sucursal_id, nombre, aplica, orden) values (p_org, s.id, 'Mostrador', 'ambos', 10), (p_org, s.id, 'Escritorio', 'ambos', 20);
  end loop;
end $$;

create or replace function piefirme_app.ctl_sembrar_org(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.ctl_causa (organizacion_id, nombre, requiere_nota, orden) values
    (p_org, 'Robo', false, 10),
    (p_org, 'Merma o producto dañado', false, 20),
    (p_org, 'Error de captura en venta', false, 30),
    (p_org, 'Entrada de mercancía no registrada', false, 40),
    (p_org, 'Traspaso no registrado', false, 50),
    (p_org, 'Error en el conteo', false, 60),
    (p_org, 'Otra', true, 70)
  on conflict (organizacion_id, nombre) do nothing;
  perform piefirme_app.ctl_sembrar_puntos(p_org);
  perform piefirme_app.ctl_sembrar_tomas(p_org);
end $$;
select piefirme_app.ctl_sembrar_org(id) from piefirme.organizaciones;

-- ───────────────────────────── privilegios de ejecución de lo nuevo ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_toma_fija_guardar', 'ctl_consumo_esperado_guardar', 'ctl_punto_control_guardar',
                  'ctl_validar_punto', 'ctl_sembrar_puntos', 'ctl_sembrar_tomas', 'ctl_sembrar_org') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
