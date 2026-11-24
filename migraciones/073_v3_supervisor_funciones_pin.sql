-- 073 · Implementación Pie Clinic · Ola 1a «quién hace qué»: cuarto rol supervisor, funciones habilitadas por usuario,
--       PIN personal al cobrar, vendedor de la venta y parámetros que fijan los dueños.
-- ADITIVA: no modifica tablas, políticas ni funciones existentes. Solo agrega: un valor al enum rol_usuario, columnas nuevas con
-- default, tablas nuevas con RLS, funciones nuevas y políticas SELECT nuevas (permisivas) para el supervisor.
-- Un supervisor sin políticas propias no ve nada: todo acceso que tenga está listado aquí.
--   supervisor  → ve (solo lectura) ventas, caja, inventario, traspasos, compras, citas y asistencia de SUS sedes (perfiles.sedes)
--                 autoriza descuentos y devoluciones dentro del tope que fijan los dueños; NO cambia precios, catálogo ni configuración
--   funciones   → perfiles.funciones: 'caja' | 'recepcion_mercancia' | 'podologia' (un usuario puede tener varias además de su rol)
--   PIN         → cada persona define su PIN personal; firmar al cobrar deja un registro de quién cobró
--   parámetros  → organizaciones.parametros (convención existente, piefirme_app.param_num): solo los dueños los editan
-- No usa el valor nuevo del enum como literal: compara rol::text, porque PostgreSQL no permite usar un valor recién agregado
-- dentro de la misma transacción.
-- Depende de: 001, 023 (pins, autorizaciones_admin, hash_pin), 026 (ventas), 040, 041, 050, 051.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── cuarto rol ─────────────────────────────
alter type piefirme.rol_usuario add value if not exists 'supervisor';

create or replace function piefirme_app.es_supervisor() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select rol::text = 'supervisor' from piefirme.perfiles where id = auth.uid() and activo), false)
$$;

-- ───────────────────────────── funciones habilitadas por usuario ─────────────────────────────
alter table piefirme.perfiles add column if not exists funciones text[] not null default '{}';
do $$ begin
  alter table piefirme.perfiles add constraint perfiles_funciones_chk
    check (funciones <@ array['caja', 'recepcion_mercancia', 'podologia']::text[]);
exception when duplicate_object then null; end $$;

create or replace function piefirme_app.tiene_funcion(p_funcion text) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select p_funcion = any(funciones) from piefirme.perfiles where id = auth.uid() and activo), false)
$$;

-- ───────────────────────────── vendedor de la venta ─────────────────────────────
-- La comisión se acredita a quien VENDE; quien cobra queda en cajero_id. Lo elige el cajero de una lista y queda en bitácora.
alter table piefirme.ventas add column if not exists vendedor_id uuid references piefirme.perfiles(id);
create index if not exists ventas_vendedor_idx on piefirme.ventas (organizacion_id, vendedor_id);

create or replace function piefirme.asignar_vendedor(p_venta uuid, p_vendedor uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v piefirme.ventas%rowtype; v_ok boolean;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not (piefirme_app.rol()::text in ('administrador', 'recepcion') or piefirme_app.tiene_funcion('caja')) then
    raise exception 'solo caja asigna al vendedor' using errcode = 'PF403';
  end if;
  select * into v from piefirme.ventas where id = p_venta and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(v.sede_id) then raise exception 'venta no encontrada' using errcode = 'PF404'; end if;
  if v.estado in ('cancelada') then raise exception 'la venta está cancelada' using errcode = 'PF409'; end if;
  select exists (select 1 from piefirme.perfiles p
                  where p.id = p_vendedor and p.organizacion_id = v_org and p.activo
                    and (cardinality(p.sedes) = 0 or v.sede_id = any(p.sedes))) into v_ok;
  if not v_ok then raise exception 'ese vendedor no trabaja en esta sede' using errcode = 'PF400'; end if;
  update piefirme.ventas set vendedor_id = p_vendedor where id = p_venta;
  insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), v.sede_id, 'actualizar', 'ventas', p_venta::text,
          jsonb_build_object('cambio', 'vendedor', 'anterior', v.vendedor_id, 'nuevo', p_vendedor, 'cobra', auth.uid()));
end $$;

-- ───────────────────────────── PIN personal ─────────────────────────────
create table piefirme.pins_personales (
  perfil_id         uuid primary key references piefirme.perfiles(id) on delete cascade,
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  pin_hash          text not null,
  updated_at        timestamptz not null default now()
);
alter table piefirme.pins_personales enable row level security;      -- sin políticas: solo funciones security definer

create or replace function piefirme.definir_pin_personal(p_pin text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if auth.uid() is null or piefirme_app.org_id() is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'el PIN debe tener de 4 a 8 dígitos' using errcode = 'PF400'; end if;
  insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash)
  values (auth.uid(), piefirme_app.org_id(), piefirme_app.hash_pin(auth.uid(), p_pin))
  on conflict (perfil_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (piefirme_app.org_id(), auth.uid(), 'actualizar', 'pins_personales', auth.uid()::text, '{"cambio":"pin"}'::jsonb);
end $$;

-- Firma al cobrar: la persona teclea su PIN y queda una firma que vence en 2 minutos. El cobro se liga a esa firma.
-- Devuelve el id de la firma, o NULL si el PIN es incorrecto (el intento queda registrado; 3 fallos en 15 min bloquean).
create table piefirme.firmas_cobro (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),
  perfil_id        uuid not null references piefirme.perfiles(id),
  vigente_hasta    timestamptz not null default now() + interval '2 minutes',
  usada_en         timestamptz,
  created_at       timestamptz not null default now()
);
create index on piefirme.firmas_cobro (organizacion_id, perfil_id, created_at desc);
alter table piefirme.firmas_cobro enable row level security;
drop policy if exists firmas_cobro_sel on piefirme.firmas_cobro;
create policy firmas_cobro_sel on piefirme.firmas_cobro for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (perfil_id = auth.uid() or piefirme_app.es_admin() or piefirme_app.es_supervisor()));

create or replace function piefirme.firmar_con_pin(p_pin text, p_sede uuid default null) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_fallos integer; v_ok boolean; v_id uuid;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not (piefirme_app.rol()::text in ('administrador', 'recepcion') or piefirme_app.tiene_funcion('caja')) then
    raise exception 'esta persona no tiene la función de caja' using errcode = 'PF403';
  end if;
  if p_sede is not null and not piefirme_app.puede_sede(p_sede) then raise exception 'sede no permitida' using errcode = 'PF403'; end if;
  select count(*) into v_fallos from piefirme.pin_intentos
   where solicitante_id = auth.uid() and not exito and created_at > now() - interval '15 minutes';
  if v_fallos >= 3 then raise exception 'bloqueado por intentos fallidos; espere 15 minutos' using errcode = 'PF429'; end if;
  select exists (select 1 from piefirme.pins_personales pp
                  where pp.perfil_id = auth.uid() and p_pin is not null and pp.pin_hash = piefirme_app.hash_pin(pp.perfil_id, p_pin)) into v_ok;
  insert into piefirme.pin_intentos (organizacion_id, solicitante_id, exito) values (v_org, auth.uid(), v_ok);
  if not v_ok then return null; end if;      -- no se lanza error: revertiría el registro del intento y el bloqueo nunca se activaría
  insert into piefirme.firmas_cobro (organizacion_id, sede_id, perfil_id) values (v_org, p_sede, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── parámetros que fijan los dueños ─────────────────────────────
-- Se guardan en organizaciones.parametros (lectura con piefirme_app.param_num). Sin valor = 0: el supervisor no autoriza nada
-- hasta que los dueños fijen el tope. Solo el administrador (dueños) los edita.
create or replace function piefirme.parametros_duenos() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not (piefirme_app.es_admin() or piefirme_app.es_supervisor()) then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  return jsonb_build_object(
    'supervisor_descuento_max_pct', piefirme_app.param_num(v_org, 'supervisor_descuento_max_pct', 0),
    'supervisor_devolucion_max',    piefirme_app.param_num(v_org, 'supervisor_devolucion_max', 0),
    'gasto_tope_sin_autorizacion',  piefirme_app.param_num(v_org, 'gasto_tope_sin_autorizacion', 0),
    'entrega_sin_entrada_horas',    piefirme_app.param_num(v_org, 'entrega_sin_entrada_horas', 24));
end $$;

create or replace function piefirme.guardar_parametros_duenos(p jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); k text; v numeric;
  v_claves text[] := array['supervisor_descuento_max_pct', 'supervisor_devolucion_max', 'gasto_tope_sin_autorizacion', 'entrega_sin_entrada_horas'];
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños fijan estos parámetros' using errcode = 'PF403'; end if;
  for k in select jsonb_object_keys(coalesce(p, '{}'::jsonb)) loop
    if not (k = any(v_claves)) then raise exception 'parámetro no permitido: %', k using errcode = 'PF400'; end if;
    v := (p ->> k)::numeric;
    if v is null or v < 0 then raise exception 'el valor de % debe ser un número mayor o igual a cero', k using errcode = 'PF400'; end if;
    if k = 'supervisor_descuento_max_pct' and v > 100 then raise exception 'el descuento máximo no puede pasar de 100 %%' using errcode = 'PF400'; end if;
    update piefirme.organizaciones set parametros = jsonb_set(parametros, array[k], to_jsonb(v), true) where id = v_org;
  end loop;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), 'actualizar', 'organizaciones', v_org::text, jsonb_build_object('cambio', 'parametros_duenos', 'valores', p));
  return piefirme.parametros_duenos();
end $$;

-- ───────────────────────────── autorización del supervisor ─────────────────────────────
-- Lo pide la persona de caja: elige al supervisor, él teclea su PIN personal y el sistema valida el tope que fijaron los dueños.
-- Devuelve NULL si el PIN es incorrecto (el intento queda registrado; 3 fallos en 15 min bloquean).
-- Reutiliza autorizaciones_admin (la validación de descuentos de la caja ya acepta esa tabla). Las devoluciones se guardan como
-- tipo 'otro' con detalle.tipo_real = 'devolucion'. Ajustes de inventario y pagos a proveedor NO los autoriza el supervisor.
create or replace function piefirme.autorizar_con_pin_supervisor(p_supervisor uuid, p_pin text, p_tipo text, p_monto numeric,
  p_motivo text, p_detalle jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_fallos integer; v_ok boolean; v_tope numeric; v_id uuid; v_sede uuid;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not (piefirme_app.rol()::text in ('administrador', 'recepcion') or piefirme_app.tiene_funcion('caja')) then
    raise exception 'solo caja pide esta autorización' using errcode = 'PF403';
  end if;
  if p_tipo not in ('descuento', 'devolucion') then raise exception 'el supervisor solo autoriza descuentos y devoluciones' using errcode = 'PF403'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'el motivo es obligatorio' using errcode = 'PF400'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el monto debe ser mayor a cero' using errcode = 'PF400'; end if;
  select count(*) into v_fallos from piefirme.pin_intentos
   where solicitante_id = auth.uid() and not exito and created_at > now() - interval '15 minutes';
  if v_fallos >= 3 then raise exception 'bloqueado por intentos fallidos; espere 15 minutos' using errcode = 'PF429'; end if;
  select exists (select 1 from piefirme.perfiles pf join piefirme.pins_personales pp on pp.perfil_id = pf.id
                  where pf.id = p_supervisor and pf.organizacion_id = v_org and pf.activo and pf.rol::text = 'supervisor'
                    and p_pin is not null and pp.pin_hash = piefirme_app.hash_pin(pf.id, p_pin)) into v_ok;
  insert into piefirme.pin_intentos (organizacion_id, solicitante_id, exito) values (v_org, auth.uid(), v_ok);
  if not v_ok then return null; end if;      -- no se lanza error: revertiría el registro del intento y el bloqueo nunca se activaría
  v_tope := case p_tipo when 'descuento' then piefirme_app.param_num(v_org, 'supervisor_descuento_max_pct', 0)
                        else piefirme_app.param_num(v_org, 'supervisor_devolucion_max', 0) end;
  if p_monto > v_tope + 0.005 then
    raise exception 'excede el tope del supervisor (%): requiere a los dueños', v_tope using errcode = 'PF403';
  end if;
  v_sede := nullif(p_detalle ->> 'sede_id', '')::uuid;
  insert into piefirme.autorizaciones_admin (organizacion_id, tipo, solicitante_id, autorizador_id, pct_max, motivo, detalle)
  values (v_org, case p_tipo when 'descuento' then 'descuento' else 'otro' end, auth.uid(), p_supervisor,
          case p_tipo when 'descuento' then p_monto else null end, p_motivo,
          coalesce(p_detalle, '{}'::jsonb) || jsonb_build_object('tipo_real', p_tipo, 'monto', p_monto, 'por', 'supervisor'))
  returning id into v_id;
  insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), v_sede, 'insertar', 'autorizaciones_admin', v_id::text,
          jsonb_build_object('tipo', p_tipo, 'monto', p_monto, 'autorizador', p_supervisor, 'motivo', p_motivo));
  return v_id;
end $$;

-- ───────────────────────────── lectura del supervisor (solo SELECT, solo sus sedes) ─────────────────────────────
-- Políticas nuevas y permisivas; las existentes no se tocan. Solo se crean en tablas que existen y tienen sede_id.
-- No incluye contenido clínico (historia, consultas, fotos) ni finanzas: eso sigue siendo de dueños y podólogo.
do $$
declare t text;
  tablas text[] := array['ventas', 'pagos', 'turnos_caja', 'movimientos_caja', 'cortes_caja', 'devoluciones_venta',
    'inventario_sede', 'movimientos_inventario', 'conteos_fisicos', 'mermas', 'traspasos', 'recepciones', 'ordenes_compra',
    'citas', 'checadas', 'asistencia', 'incidencias_rh', 'empleado_asignaciones'];
begin
  foreach t in array tablas loop
    if exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = t and column_name = 'sede_id')
       and exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = t and column_name = 'organizacion_id') then
      execute format('drop policy if exists %I on piefirme.%I', t || '_sel_supervisor', t);
      execute format('create policy %I on piefirme.%I for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_supervisor() and piefirme_app.puede_sede(sede_id))',
                     t || '_sel_supervisor', t);
    else
      raise notice '073: % no tiene sede_id u organizacion_id; el supervisor no la lee todavía', t;
    end if;
  end loop;
end $$;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.asignar_vendedor(uuid, uuid) from public, anon;
revoke all on function piefirme.definir_pin_personal(text) from public, anon;
revoke all on function piefirme.firmar_con_pin(text, uuid) from public, anon;
revoke all on function piefirme.parametros_duenos() from public, anon;
revoke all on function piefirme.guardar_parametros_duenos(jsonb) from public, anon;
revoke all on function piefirme.autorizar_con_pin_supervisor(uuid, text, text, numeric, text, jsonb) from public, anon;
grant execute on function piefirme.asignar_vendedor(uuid, uuid), piefirme.definir_pin_personal(text), piefirme.firmar_con_pin(text, uuid),
  piefirme.parametros_duenos(), piefirme.guardar_parametros_duenos(jsonb),
  piefirme.autorizar_con_pin_supervisor(uuid, text, text, numeric, text, jsonb) to authenticated, service_role;
