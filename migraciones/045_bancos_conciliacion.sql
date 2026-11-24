-- 045 · Inventario y finanzas · estados de cuenta, movimientos bancarios, liquidaciones Clip y conciliación (movimiento ↔ cobro/gasto/pago).
-- Dominio C. Clona de IRP: prp_movimientos_bancarios, prp_conciliacion_cobros, RPC conciliar_banco_batch / confirmar_cobro / desmarcar_cobros.
-- Reglas: P-094 (cuenta por sede o general; CSV genérico con mapeo configurable; liquidaciones Clip por lote), P-096 (el pago a proveedor se concilia con el banco),
--   P-077 (la comisión de la terminal es gasto de la clínica), S18 (estados del movimiento), S17 (conciliar valida el ingreso).
-- Dependencias: 042 (cuentas_bancarias), 043 (ingresos), 044 (gastos, grupos_gasto). La conciliación automática (RPC) y la FK a pagos a proveedor viven en 046.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.estados_cuenta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id) on delete set null,
  cuenta_id        uuid not null references piefirme.cuentas_bancarias(id) on delete cascade,
  archivo_nombre   text not null,
  archivo_path     text,                                    -- bucket «pf-importaciones»: <organizacion_id>/bancos/…
  periodo_desde    date,
  periodo_hasta    date,
  num_movimientos  integer not null default 0,
  cargado_por      uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index on piefirme.estados_cuenta (organizacion_id, cuenta_id, created_at desc);

create table piefirme.movimientos_bancarios (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid references piefirme.sedes(id) on delete set null,
  cuenta_id         uuid not null references piefirme.cuentas_bancarias(id) on delete cascade,
  estado_cuenta_id  uuid references piefirme.estados_cuenta(id) on delete set null,
  fecha             date not null,
  descripcion       text not null default '',
  monto             numeric(14,2) not null check (monto <> 0),          -- (+) abono · (−) cargo
  referencia        text,
  hash              text not null,
  estado            text not null default 'detectado' check (estado in ('detectado', 'conciliado', 'sugerido', 'ambiguo', 'es_gasto', 'sin_cobro')),
  sugeridos         uuid[] not null default '{}',                      -- cobros/pagos candidatos
  conciliado_neto   numeric(14,2) not null default 0,                  -- suma con signo de lo vinculado
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (cuenta_id, hash)
);
create index on piefirme.movimientos_bancarios (organizacion_id, cuenta_id, fecha desc);
create index on piefirme.movimientos_bancarios (organizacion_id, estado);

-- Liquidación Clip (E122): un depósito del banco paga N cobros con tarjeta menos la comisión retenida
create table piefirme.liquidaciones_clip (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  lote               text not null,                                    -- CLIP-1022
  fecha_liquidacion  date not null,
  monto_depositado   numeric(14,2) not null check (monto_depositado >= 0),
  comision_retenida  numeric(14,2) not null default 0 check (comision_retenida >= 0),
  monto_bruto        numeric(14,2) generated always as (monto_depositado + comision_retenida) stored,
  estado             text not null default 'pendiente' check (estado in ('pendiente', 'conciliada')),
  gasto_comision_id  uuid references piefirme.gastos(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organizacion_id, lote)
);
alter table piefirme.ingresos add constraint ingresos_liquidacion_fk foreign key (lote_liquidacion_id) references piefirme.liquidaciones_clip(id) on delete set null;

create table piefirme.conciliaciones (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid references piefirme.sedes(id) on delete set null,
  movimiento_id       uuid not null references piefirme.movimientos_bancarios(id) on delete cascade,
  ingreso_id          uuid references piefirme.ingresos(id) on delete restrict,
  gasto_id            uuid references piefirme.gastos(id) on delete restrict,
  pago_proveedor_id   uuid,                                            -- FK en 046
  liquidacion_id      uuid references piefirme.liquidaciones_clip(id) on delete set null,
  importe_aplicado    numeric(14,2) not null check (importe_aplicado > 0),
  origen              text not null default 'manual' check (origen in ('automatica', 'manual')),
  forma_pago          text,
  confirmado_por      uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  check (num_nonnulls(ingreso_id, gasto_id, pago_proveedor_id) = 1)
);
create unique index conciliacion_ingreso_unica on piefirme.conciliaciones (ingreso_id) where ingreso_id is not null;
create unique index conciliacion_gasto_unica on piefirme.conciliaciones (gasto_id) where gasto_id is not null;
create unique index conciliacion_pago_unica on piefirme.conciliaciones (pago_proveedor_id) where pago_proveedor_id is not null;
create index on piefirme.conciliaciones (organizacion_id, movimiento_id);

create trigger t_a_padre before insert on piefirme.conciliaciones for each row execute function piefirme_app.c_heredar_de_padre('movimientos_bancarios', 'movimiento_id');
create trigger t_rpc before insert or update on piefirme.movimientos_bancarios for each row execute function piefirme_app.c_exigir_rpc('conciliado');

create or replace function piefirme_app.c_movimiento_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.cuentas_bancarias%rowtype;
begin
  select * into c from piefirme.cuentas_bancarias where id = new.cuenta_id;
  if not found or c.organizacion_id <> new.organizacion_id then raise exception 'cuenta de otra clínica' using errcode = '42501'; end if;
  new.sede_id := coalesce(new.sede_id, c.sede_id);
  if tg_op = 'UPDATE' and (new.monto, new.fecha, new.cuenta_id, new.hash) is distinct from (old.monto, old.fecha, old.cuenta_id, old.hash) then
    raise exception 'un movimiento bancario importado no se edita' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.movimientos_bancarios for each row execute function piefirme_app.c_movimiento_bi();

-- Coherencia de cada vínculo + sin sobre-aplicación + estado del movimiento + validación del ingreso (S17/S18)
create or replace function piefirme_app.c_conciliacion_chk() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare m piefirme.movimientos_bancarios%rowtype; v_net numeric; v_imp numeric; v_org uuid;
begin
  select * into m from piefirme.movimientos_bancarios where id = new.movimiento_id;
  if new.ingreso_id is not null then
    select organizacion_id, importe into v_org, v_imp from piefirme.ingresos where id = new.ingreso_id;
  elsif new.gasto_id is not null then
    select organizacion_id, total into v_org, v_imp from piefirme.gastos where id = new.gasto_id;
  else
    v_org := m.organizacion_id; v_imp := new.importe_aplicado;
  end if;
  if v_org is distinct from m.organizacion_id then raise exception 'vínculo de otra clínica' using errcode = '42501'; end if;
  if new.importe_aplicado > v_imp + 0.01 then raise exception 'se aplica más que el importe del documento' using errcode = 'PF409'; end if;
  select coalesce(sum(case when c.ingreso_id is not null and not coalesce((select i.es_reembolso from piefirme.ingresos i where i.id = c.ingreso_id), false) then c.importe_aplicado
                           when c.ingreso_id is not null then -c.importe_aplicado
                           else -c.importe_aplicado end), 0) into v_net
    from piefirme.conciliaciones c where c.movimiento_id = m.id;
  if sign(v_net) = sign(m.monto) and abs(v_net) > abs(m.monto) + 0.01 then
    raise exception 'lo conciliado ($%) excede el movimiento ($%)', abs(v_net), abs(m.monto) using errcode = 'PF409';
  end if;
  return null;
end $$;
create constraint trigger t_chk after insert or update on piefirme.conciliaciones deferrable initially deferred for each row execute function piefirme_app.c_conciliacion_chk();

create or replace function piefirme_app.c_conciliacion_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_mov uuid := coalesce(new.movimiento_id, old.movimiento_id); m piefirme.movimientos_bancarios%rowtype; v_net numeric; v_n integer; v_ing uuid;
begin
  select * into m from piefirme.movimientos_bancarios where id = v_mov;
  if not found then return null; end if;     -- borrado en cascada del movimiento
  select coalesce(sum(case when c.ingreso_id is not null and not coalesce((select i.es_reembolso from piefirme.ingresos i where i.id = c.ingreso_id), false) then c.importe_aplicado
                           else -c.importe_aplicado end), 0), count(*) into v_net, v_n
    from piefirme.conciliaciones c where c.movimiento_id = v_mov;
  perform set_config('app.c_rpc', 'on', true);
  update piefirme.movimientos_bancarios set conciliado_neto = v_net,
         estado = case when v_n > 0 and abs(v_net - monto) <= 0.01 then 'conciliado'
                       when estado = 'conciliado' then 'detectado' else estado end,
         sugeridos = case when v_n > 0 and abs(v_net - monto) <= 0.01 then '{}' else sugeridos end
   where id = v_mov;
  -- conciliar valida el ingreso; deshacer lo regresa a «por validar» (S17)
  if tg_op = 'INSERT' and new.ingreso_id is not null then
    update piefirme.ingresos set estatus_validacion = 'validado', validado_por = coalesce(auth.uid(), new.confirmado_por), validado_en = now()
     where id = new.ingreso_id and estatus_validacion in ('por_validar', 'observado');
  elsif tg_op = 'DELETE' and old.ingreso_id is not null then
    update piefirme.ingresos set estatus_validacion = 'por_validar', validado_por = null, validado_en = null
     where id = old.ingreso_id and estatus_validacion = 'validado';
  end if;
  return null;
end $$;
create trigger t_ai after insert or delete on piefirme.conciliaciones for each row execute function piefirme_app.c_conciliacion_ai();

-- Liquidación conciliada ⇒ lo marca el vínculo; la comisión retenida se vuelve gasto de la terminal (P-077)
create or replace function piefirme_app.c_liquidacion_bi() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.estado = 'conciliada' and old.estado = 'pendiente' and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
    raise exception 'la liquidación se concilia con su movimiento bancario' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_bi before update on piefirme.liquidaciones_clip for each row execute function piefirme_app.c_liquidacion_bi();

-- ───────────────────────────── RPC ─────────────────────────────
-- Importar estado de cuenta (el mapeo de columnas del CSV lo hace el cliente con cuentas_bancarias.mapeo_csv)
-- p_filas: [{"fecha":"2026-10-03","descripcion":"SPEI …","monto":1200.00,"referencia":"…"}]
create or replace function piefirme.conciliar_importar(p_cuenta uuid, p_archivo text, p_filas jsonb, p_archivo_path text default null) returns jsonb
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.cuentas_bancarias%rowtype; v_ec uuid := gen_random_uuid(); v_ins integer; v_tot integer; v_min date; v_max date;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración carga estados de cuenta' using errcode = '42501'; end if;
  select * into c from piefirme.cuentas_bancarias where id = p_cuenta;
  if not found then raise exception 'cuenta inexistente' using errcode = 'PF404'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'p_filas debe ser un arreglo' using errcode = '22023'; end if;
  with filas as (
    select f.fecha, coalesce(f.descripcion, '') as descripcion, f.monto, nullif(f.referencia, '') as referencia,
           md5(p_cuenta::text || '|' || f.fecha || '|' || f.monto || '|' || coalesce(f.descripcion, '') || '|' || coalesce(f.referencia, '') || '|' ||
               row_number() over (partition by f.fecha, f.monto, f.descripcion, f.referencia order by f.ord)) as hash
      from (select (e.j ->> 'fecha')::date as fecha, e.j ->> 'descripcion' as descripcion, (e.j ->> 'monto')::numeric as monto, e.j ->> 'referencia' as referencia, e.ord
              from jsonb_array_elements(p_filas) with ordinality as e(j, ord)) f
     where f.monto is not null and f.monto <> 0 and f.fecha is not null)
  select count(*), min(fecha), max(fecha) into v_tot, v_min, v_max from filas;
  insert into piefirme.estados_cuenta (id, organizacion_id, sede_id, cuenta_id, archivo_nombre, archivo_path, periodo_desde, periodo_hasta, num_movimientos)
  values (v_ec, c.organizacion_id, c.sede_id, c.id, p_archivo, p_archivo_path, v_min, v_max, v_tot);
  with filas as (
    select f.fecha, coalesce(f.descripcion, '') as descripcion, f.monto, nullif(f.referencia, '') as referencia,
           md5(p_cuenta::text || '|' || f.fecha || '|' || f.monto || '|' || coalesce(f.descripcion, '') || '|' || coalesce(f.referencia, '') || '|' ||
               row_number() over (partition by f.fecha, f.monto, f.descripcion, f.referencia order by f.ord)) as hash
      from (select (e.j ->> 'fecha')::date as fecha, e.j ->> 'descripcion' as descripcion, (e.j ->> 'monto')::numeric as monto, e.j ->> 'referencia' as referencia, e.ord
              from jsonb_array_elements(p_filas) with ordinality as e(j, ord)) f
     where f.monto is not null and f.monto <> 0 and f.fecha is not null)
  insert into piefirme.movimientos_bancarios (organizacion_id, sede_id, cuenta_id, estado_cuenta_id, fecha, descripcion, monto, referencia, hash)
  select c.organizacion_id, c.sede_id, c.id, v_ec, t.fecha, t.descripcion, t.monto, t.referencia, t.hash from filas t
  on conflict (cuenta_id, hash) do nothing;
  get diagnostics v_ins = row_count;
  update piefirme.estados_cuenta set num_movimientos = v_ins where id = v_ec;
  return jsonb_build_object('estado_cuenta_id', v_ec, 'leidos', v_tot, 'nuevos', v_ins, 'duplicados', v_tot - v_ins);
end $$;
revoke all on function piefirme.conciliar_importar(uuid, text, jsonb, text) from public, anon;
grant execute on function piefirme.conciliar_importar(uuid, text, jsonb, text) to authenticated;

-- Conciliación manual: p_vinculos = [{"tipo":"ingreso"|"gasto"|"pago_proveedor","id":uuid,"importe":n opcional}]
create or replace function piefirme.conciliar_confirmar(p_movimiento uuid, p_vinculos jsonb) returns text
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare m piefirme.movimientos_bancarios%rowtype; x record; v_imp numeric; v_estado text;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración concilia' using errcode = '42501'; end if;
  select * into m from piefirme.movimientos_bancarios where id = p_movimiento for update;
  if not found then raise exception 'movimiento inexistente' using errcode = 'PF404'; end if;
  for x in select * from jsonb_to_recordset(p_vinculos) as r(tipo text, id uuid, importe numeric) loop
    if x.tipo = 'ingreso' then select importe into v_imp from piefirme.ingresos where id = x.id;
    elsif x.tipo = 'gasto' then select total into v_imp from piefirme.gastos where id = x.id;
    else v_imp := x.importe; end if;
    if v_imp is null then raise exception 'documento inexistente (%)', x.tipo using errcode = 'PF404'; end if;
    insert into piefirme.conciliaciones (organizacion_id, movimiento_id, ingreso_id, gasto_id, pago_proveedor_id, importe_aplicado, origen)
    values (m.organizacion_id, m.id, case when x.tipo = 'ingreso' then x.id end, case when x.tipo = 'gasto' then x.id end,
            case when x.tipo = 'pago_proveedor' then x.id end, coalesce(x.importe, v_imp), 'manual');
  end loop;
  select estado into v_estado from piefirme.movimientos_bancarios where id = p_movimiento;
  return v_estado;
end $$;
revoke all on function piefirme.conciliar_confirmar(uuid, jsonb) from public, anon;
grant execute on function piefirme.conciliar_confirmar(uuid, jsonb) to authenticated;

-- Deshacer (D-75): Administración, queda en bitácora por el trigger de auditoría de conciliaciones
create or replace function piefirme.conciliar_deshacer(p_movimiento uuid) returns integer
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_n integer;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración deshace conciliaciones' using errcode = '42501'; end if;
  delete from piefirme.conciliaciones where movimiento_id = p_movimiento;
  get diagnostics v_n = row_count;
  perform set_config('app.c_rpc', 'on', true);
  update piefirme.movimientos_bancarios set estado = 'detectado', sugeridos = '{}', conciliado_neto = 0 where id = p_movimiento;
  return v_n;
end $$;
revoke all on function piefirme.conciliar_deshacer(uuid) from public, anon;
grant execute on function piefirme.conciliar_deshacer(uuid) to authenticated;

-- Marcar «es gasto» / «sin cobro» a mano
create or replace function piefirme.movimiento_marcar(p_movimiento uuid, p_estado text) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración' using errcode = '42501'; end if;
  if p_estado not in ('detectado', 'es_gasto', 'sin_cobro', 'ambiguo') then raise exception 'estado inválido' using errcode = '22023'; end if;
  update piefirme.movimientos_bancarios set estado = p_estado where id = p_movimiento and estado <> 'conciliado';
  if not found then raise exception 'movimiento inexistente o ya conciliado' using errcode = 'PF409'; end if;
end $$;
revoke all on function piefirme.movimiento_marcar(uuid, text) from public, anon;
grant execute on function piefirme.movimiento_marcar(uuid, text) to authenticated;

-- ───────────────────────────── RLS (todo es de Administración, MATRIZ_ROLES §4.4) ─────────────────────────────
select piefirme_app.c_politicas('estados_cuenta', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array[]::text[], p_del => array['administrador']);
select piefirme_app.c_politicas('movimientos_bancarios', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[]);
select piefirme_app.c_politicas('liquidaciones_clip', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no');
select piefirme_app.c_politicas('conciliaciones', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array[]::text[], p_del => array['administrador']);
select piefirme_app.c_triggers('estados_cuenta', false);
select piefirme_app.c_triggers('movimientos_bancarios');
select piefirme_app.c_triggers('liquidaciones_clip');
select piefirme_app.c_triggers('conciliaciones');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_movimientos_bancarios with (security_invoker = true) as
select m.id, m.organizacion_id, m.sede_id, m.cuenta_id, cb.banco || ' ···' || cb.terminacion as cuenta, m.fecha, m.descripcion, m.monto, m.referencia, m.estado,
       m.sugeridos, m.conciliado_neto, (m.monto - m.conciliado_neto) as pendiente,
       (select count(*) from piefirme.conciliaciones c where c.movimiento_id = m.id) as num_vinculos, m.estado_cuenta_id, m.created_at
  from piefirme.movimientos_bancarios m join piefirme.cuentas_bancarias cb on cb.id = m.cuenta_id;

-- Cobros del periodo con su movimiento conciliado (clon prp_conciliacion_cobros de IRP)
create or replace view piefirme.prp_conciliacion_cobros with (security_invoker = true) as
select i.id, i.organizacion_id, i.sede_id, i.fecha_pago, i.forma_pago, i.importe, i.clasificacion, i.referencia as referencia_pago, i.estatus_validacion,
       i.paciente_id, i.lote_liquidacion_id,
       c.movimiento_id, mb.fecha as banco_fecha, mb.monto as banco_monto, mb.referencia as referencia_banco, mb.descripcion as banco_descripcion,
       (c.id is not null) as conciliado
  from piefirme.ingresos i
  left join piefirme.conciliaciones c on c.ingreso_id = i.id
  left join piefirme.movimientos_bancarios mb on mb.id = c.movimiento_id;

create or replace view piefirme.prp_liquidaciones_clip with (security_invoker = true) as
select l.id, l.organizacion_id, l.lote, l.fecha_liquidacion, l.monto_depositado, l.comision_retenida, l.monto_bruto, l.estado, l.gasto_comision_id,
       (select count(*) from piefirme.ingresos i where i.lote_liquidacion_id = l.id) as cobros_incluidos,
       (select coalesce(sum(i.importe), 0) from piefirme.ingresos i where i.lote_liquidacion_id = l.id) as suma_cobros,
       (select coalesce(sum(i.importe), 0) from piefirme.ingresos i where i.lote_liquidacion_id = l.id) - l.monto_bruto as diferencia
  from piefirme.liquidaciones_clip l;

-- prp_ingresos (043) + movimiento conciliado (columnas nuevas al final)
create or replace view piefirme.prp_ingresos with (security_invoker = true) as
select i.id, i.organizacion_id, i.sede_id, s.nombre as sede_nombre, i.fecha_pago, i.forma_pago, i.importe, i.iva, (i.importe - i.iva) as base_sin_iva,
       case when i.es_reembolso then -i.importe else i.importe end as importe_neto,
       i.clasificacion, i.clasificacion_manual, i.renglon_id, i.venta_id, i.cita_id, i.pago_id, i.paciente_id, i.podologo_id,
       i.referencia, i.concepto, i.comprobante_url, (i.comprobante_url is not null) as tiene_comprobante, i.factura_id, i.cfdi_uuid,
       (i.factura_id is not null or i.cfdi_uuid is not null) as tiene_cfdi,
       i.estatus_validacion, (i.estatus_validacion in ('validado', 'validado_cfdi')) as comisionable, i.validado_por, i.validado_en, i.observacion,
       i.origen_registro, i.es_reembolso, i.ingreso_origen_id, i.lote_liquidacion_id, i.created_at,
       coalesce((select sum(a.importe_aplicado) from piefirme.aplicaciones_cobro a where a.ingreso_id = i.id), 0) as aplicado,
       c.movimiento_id, mb.fecha as movimiento_fecha
  from piefirme.ingresos i
  join piefirme.sedes s on s.id = i.sede_id
  left join piefirme.conciliaciones c on c.ingreso_id = i.id
  left join piefirme.movimientos_bancarios mb on mb.id = c.movimiento_id;

revoke all on all tables in schema piefirme from anon;
