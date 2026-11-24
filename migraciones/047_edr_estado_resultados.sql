-- 047 · Inventario y finanzas · Estado de Resultados (EDR) por sede y mes: proy_ manual, real_ automático.
-- Dominio C. Clona de IRP: er_mensual (proy_* / real_*), pestañas «Tablero» y «En elaboración», recálculo automático de reales, desglose por renglón.
-- Reglas: P-090 (CONFIRMADO POR EL DUEÑO: proy_ lo captura Administración y el sistema NUNCA lo escribe; real_ lo calcula el sistema y nadie lo edita),
--   P-091 (base cobrado por fecha de pago), P-092 (EDR por sede; gastos compartidos prorrateados por proporción de ingresos; IVA aparte; suscripción = gasto del mes, sin prorrateo),
--   P-100 (utilidad gerencial «sin impuestos»), P-101 (renglón por servicio/producto), P-135 (consolidado solo con todas las sedes), P-099 (mes cerrado = solo lectura).
-- Dependencias: 042 (edr_renglones, grupos_gasto), 043 (ingresos, ingreso_renglones), 044 (gastos).
-- Contrato con D (nómina, comisiones, mantenimiento, suscripción): registran su costo como gasto (piefirme.gastos) con origen_modulo = 'nomina'|'comisiones'|'mantenimiento'|'suscripcion'.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.edr_periodos (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid not null references piefirme.sedes(id) on delete cascade,
  anio                integer not null check (anio between 2020 and 2100),
  mes                 integer not null check (mes between 1 and 12),
  estado              text not null default 'en_elaboracion' check (estado in ('en_elaboracion', 'publicado', 'cerrado')),
  real_calculado_en   timestamptz,
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (sede_id, anio, mes)
);
create index on piefirme.edr_periodos (organizacion_id, anio, mes);

create table piefirme.edr_lineas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  periodo_id       uuid not null references piefirme.edr_periodos(id) on delete cascade,
  renglon_id       uuid not null references piefirme.edr_renglones(id) on delete restrict,
  proy_importe     numeric(14,2) not null default 0,        -- MANUAL (administrador). El sistema nunca lo escribe.
  real_auto        numeric(14,2) not null default 0,        -- AUTOMÁTICO (ingresos, gastos, fondo…)
  real_ajustes     numeric(14,2) not null default 0,        -- suma de edr_ajustes
  real_importe     numeric(14,2) generated always as (real_auto + real_ajustes) stored,
  n_registros      integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (periodo_id, renglon_id)
);
create index on piefirme.edr_lineas (organizacion_id, sede_id, periodo_id);

create table piefirme.edr_ajustes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  periodo_id       uuid not null references piefirme.edr_periodos(id) on delete cascade,
  renglon_id       uuid not null references piefirme.edr_renglones(id) on delete restrict,
  importe          numeric(14,2) not null check (importe <> 0),
  motivo           text not null check (length(trim(motivo)) > 0),
  usuario_id       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index on piefirme.edr_ajustes (organizacion_id, periodo_id, renglon_id);

create trigger t_a_padre before insert on piefirme.edr_lineas for each row execute function piefirme_app.c_heredar_de_padre('edr_periodos', 'periodo_id');
create trigger t_a_padre before insert on piefirme.edr_ajustes for each row execute function piefirme_app.c_heredar_de_padre('edr_periodos', 'periodo_id');

-- ───────────────────────────── protección de proy_ y real_ ─────────────────────────────
create or replace function piefirme_app.c_edr_linea_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_calc boolean := coalesce(current_setting('app.edr_calculando', true), '') = 'on'; v_estado text;
begin
  select estado into v_estado from piefirme.edr_periodos where id = new.periodo_id;
  if not exists (select 1 from piefirme.edr_renglones r where r.id = new.renglon_id and r.organizacion_id = new.organizacion_id) then
    raise exception 'renglón de otra clínica' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if v_calc and new.proy_importe <> 0 then raise exception 'el recálculo automático no escribe proy_ (P-090)' using errcode = 'PF409'; end if;
    if not v_calc and (new.real_auto <> 0 or new.real_ajustes <> 0) then raise exception 'real_ es automático: no se captura (P-090)' using errcode = 'PF409'; end if;
    if not v_calc and v_estado = 'cerrado' then raise exception 'el periodo del EDR está cerrado' using errcode = 'PF409'; end if;
    return new;
  end if;
  if new.proy_importe is distinct from old.proy_importe then
    if v_calc then raise exception 'el recálculo automático no puede modificar proy_ (P-090)' using errcode = 'PF409'; end if;
    if not (piefirme_app.es_admin() or auth.uid() is null) then raise exception 'solo Administración captura la proyección' using errcode = '42501'; end if;
    if v_estado = 'cerrado' then raise exception 'el periodo del EDR está cerrado' using errcode = 'PF409'; end if;
  end if;
  if (new.real_auto is distinct from old.real_auto or new.real_ajustes is distinct from old.real_ajustes or new.n_registros is distinct from old.n_registros) and not v_calc then
    raise exception 'real_ lo calcula el sistema: no se edita (P-090)' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.edr_lineas for each row execute function piefirme_app.c_edr_linea_bi();

-- Bitácora específica de cambios de proyección (no de cada recálculo)
create or replace function piefirme_app.c_edr_proy_aud() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
  values (new.organizacion_id, auth.uid(), new.sede_id, case tg_op when 'INSERT' then 'insertar' else 'actualizar' end, 'edr_proyeccion', new.id::text,
          jsonb_build_object('renglon_id', new.renglon_id, 'periodo_id', new.periodo_id, 'antes', case when tg_op = 'UPDATE' then old.proy_importe end, 'despues', new.proy_importe));
  return null;
end $$;
create trigger t_aud_proy_u after update on piefirme.edr_lineas for each row when (new.proy_importe is distinct from old.proy_importe) execute function piefirme_app.c_edr_proy_aud();
create trigger t_aud_proy_i after insert on piefirme.edr_lineas for each row when (new.proy_importe <> 0) execute function piefirme_app.c_edr_proy_aud();

create or replace function piefirme_app.c_edr_periodo_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'sede de otra clínica' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'cerrado' and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
      raise exception 'el mes se cierra con piefirme.cerrar_periodo' using errcode = 'PF409';
    end if;
    if old.estado = 'cerrado' and coalesce(current_setting('app.c_rpc', true), '') <> 'on' then
      raise exception 'el mes se reabre con piefirme.reabrir_periodo' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.edr_periodos for each row execute function piefirme_app.c_edr_periodo_bi();

-- Los ajustes (E116) alimentan real_ajustes
create or replace function piefirme_app.c_edr_ajuste_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_p uuid := coalesce(new.periodo_id, old.periodo_id); v_r uuid := coalesce(new.renglon_id, old.renglon_id); v_org uuid := coalesce(new.organizacion_id, old.organizacion_id);
        v_sede uuid := coalesce(new.sede_id, old.sede_id); v_sum numeric; v_prev text := coalesce(current_setting('app.edr_calculando', true), 'off');
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return null; end if;
  if (select estado from piefirme.edr_periodos where id = v_p) = 'cerrado' then
    raise exception 'el periodo del EDR está cerrado: registra el ajuste en el periodo vigente' using errcode = 'PF409';
  end if;
  select coalesce(sum(importe), 0) into v_sum from piefirme.edr_ajustes where periodo_id = v_p and renglon_id = v_r;
  perform set_config('app.edr_calculando', 'on', true);
  insert into piefirme.edr_lineas (organizacion_id, sede_id, periodo_id, renglon_id, real_ajustes) values (v_org, v_sede, v_p, v_r, v_sum)
  on conflict (periodo_id, renglon_id) do update set real_ajustes = excluded.real_ajustes, updated_at = now();
  perform set_config('app.edr_calculando', v_prev, true);
  return null;
end $$;
create trigger t_ai after insert or delete on piefirme.edr_ajustes for each row execute function piefirme_app.c_edr_ajuste_ai();
create trigger t_inm_upd before update on piefirme.edr_ajustes for each row execute function piefirme_app.c_inmutable();

-- ───────────────────────────── recálculo de real_ ─────────────────────────────
create or replace function piefirme_app.c_todas_sedes() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select cardinality(sedes) = 0 from piefirme.perfiles where id = auth.uid() and activo), false)
$$;

create or replace function piefirme_app.c_edr_recalcular(p_org uuid, p_anio integer, p_mes integer) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_prev text := coalesce(current_setting('app.edr_calculando', true), 'off'); v_ini date := make_date(p_anio, p_mes, 1); v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month')::date - 1; v_n integer; v_ren_otros uuid; v_ren_fondo uuid; v_iva_t uuid; v_iva_a uuid;
begin
  select id into v_ren_otros from piefirme.edr_renglones where organizacion_id = p_org and clave = 'otros_servicios';
  select id into v_ren_fondo from piefirme.edr_renglones where organizacion_id = p_org and clave = 'fondo_revolvente';
  select id into v_iva_t from piefirme.edr_renglones where organizacion_id = p_org and clave = 'iva_trasladado';
  select id into v_iva_a from piefirme.edr_renglones where organizacion_id = p_org and clave = 'iva_acreditable';
  perform set_config('app.edr_calculando', 'on', true);

  insert into piefirme.edr_periodos (organizacion_id, sede_id, anio, mes)
  select p_org, s.id, p_anio, p_mes from piefirme.sedes s where s.organizacion_id = p_org and s.activa
  on conflict (sede_id, anio, mes) do nothing;

  create temporary table if not exists tmp_edr_calc (sede_id uuid, renglon_id uuid, importe numeric, n integer) on commit drop;
  truncate tmp_edr_calc;

  -- 1 · ingresos por renglón, base sin IVA, reembolsos restan; lo no repartido va al renglón principal
  insert into tmp_edr_calc
  with ing as (
    select i.id, i.sede_id, case when i.es_reembolso then -1 else 1 end as sg, i.importe, i.iva, coalesce(i.renglon_id, v_ren_otros) as renglon_id
      from piefirme.ingresos i where i.organizacion_id = p_org and i.fecha_pago between v_ini and v_fin),
  partes as (
    select a.sede_id, r.renglon_id, a.sg * r.importe * (a.importe - a.iva) / a.importe as importe, a.id from ing a join piefirme.ingreso_renglones r on r.ingreso_id = a.id
    union all
    select a.sede_id, a.renglon_id,
           a.sg * (a.importe - coalesce((select sum(r.importe) from piefirme.ingreso_renglones r where r.ingreso_id = a.id), 0)) * (a.importe - a.iva) / a.importe, a.id from ing a)
  select sede_id, renglon_id, round(sum(importe), 2), count(distinct id)::int from partes where importe <> 0 and renglon_id is not null group by sede_id, renglon_id;

  -- IVA trasladado (informativo)
  insert into tmp_edr_calc
  select i.sede_id, v_iva_t, round(sum(case when i.es_reembolso then -i.iva else i.iva end), 2), count(*)::int
    from piefirme.ingresos i where i.organizacion_id = p_org and i.fecha_pago between v_ini and v_fin and i.iva <> 0 and v_iva_t is not null group by i.sede_id;

  -- 2 · gastos directos de la sede (base: subtotal; fondo revolvente → renglón propio)
  insert into tmp_edr_calc
  select g.sede_id, case when g.metodo_pago = 'efectivo_fondo' and v_ren_fondo is not null then v_ren_fondo else gr.renglon_id end, round(sum(g.subtotal), 2), count(*)::int
    from piefirme.gastos g join piefirme.grupos_gasto gr on gr.id = g.grupo_id
   where g.organizacion_id = p_org and g.estado = 'guardado' and not g.compartido and g.fecha between v_ini and v_fin
     and case when g.metodo_pago = 'efectivo_fondo' and v_ren_fondo is not null then v_ren_fondo else gr.renglon_id end is not null
   group by g.sede_id, case when g.metodo_pago = 'efectivo_fondo' and v_ren_fondo is not null then v_ren_fondo else gr.renglon_id end;
  insert into tmp_edr_calc
  select g.sede_id, v_iva_a, round(sum(g.iva), 2), count(*)::int from piefirme.gastos g
   where g.organizacion_id = p_org and g.estado = 'guardado' and not g.compartido and g.fecha between v_ini and v_fin and g.iva <> 0 and v_iva_a is not null group by g.sede_id;

  -- 3 · gastos compartidos: proporción de los ingresos del mes por sede (si no hay ingresos, partes iguales) (P-092)
  insert into tmp_edr_calc
  with base as (
    select s.id as sede_id, coalesce((select sum(i.importe - i.iva) filter (where not i.es_reembolso) - coalesce(sum(i.importe - i.iva) filter (where i.es_reembolso), 0)
                                        from piefirme.ingresos i where i.sede_id = s.id and i.fecha_pago between v_ini and v_fin), 0) as ing
      from piefirme.sedes s where s.organizacion_id = p_org and s.activa),
  pesos as (select sede_id, case when (select sum(ing) from base) > 0 then ing / (select sum(ing) from base) else 1.0 / (select count(*) from base) end as w from base),
  comp as (
    select case when g.metodo_pago = 'efectivo_fondo' and v_ren_fondo is not null then v_ren_fondo else gr.renglon_id end as renglon_id, sum(g.subtotal) as sub, sum(g.iva) as iva, count(*)::int as n
      from piefirme.gastos g join piefirme.grupos_gasto gr on gr.id = g.grupo_id
     where g.organizacion_id = p_org and g.estado = 'guardado' and g.compartido and g.fecha between v_ini and v_fin group by 1)
  select p.sede_id, c.renglon_id, round(c.sub * p.w, 2), c.n from comp c cross join pesos p where c.renglon_id is not null and round(c.sub * p.w, 2) <> 0
  union all
  select p.sede_id, v_iva_a, round(c.iva * p.w, 2), c.n from comp c cross join pesos p where v_iva_a is not null and c.iva <> 0 and round(c.iva * p.w, 2) <> 0;

  -- 4 · escribir solo real_auto (nunca proy_) en periodos abiertos
  insert into piefirme.edr_lineas (organizacion_id, sede_id, periodo_id, renglon_id, real_auto, n_registros)
  select p_org, c.sede_id, pe.id, c.renglon_id, sum(c.importe), sum(c.n)
    from tmp_edr_calc c join piefirme.edr_periodos pe on pe.sede_id = c.sede_id and pe.anio = p_anio and pe.mes = p_mes
   where pe.estado <> 'cerrado' group by c.sede_id, pe.id, c.renglon_id
  on conflict (periodo_id, renglon_id) do update set real_auto = excluded.real_auto, n_registros = excluded.n_registros, updated_at = now();
  get diagnostics v_n = row_count;

  update piefirme.edr_lineas l set real_auto = 0, n_registros = 0, updated_at = now()
   from piefirme.edr_periodos pe
   where pe.id = l.periodo_id and pe.organizacion_id = p_org and pe.anio = p_anio and pe.mes = p_mes and pe.estado <> 'cerrado'
     and (l.real_auto <> 0 or l.n_registros <> 0)
     and not exists (select 1 from tmp_edr_calc c where c.sede_id = l.sede_id and c.renglon_id = l.renglon_id);

  update piefirme.edr_periodos set real_calculado_en = now() where organizacion_id = p_org and anio = p_anio and mes = p_mes and estado <> 'cerrado';
  perform set_config('app.edr_calculando', v_prev, true);
  return v_n;
end $$;

-- RPC: recalcular el mes (Administración; también se dispara solo al cambiar ingresos/gastos)
create or replace function piefirme.edr_recalcular(p_anio integer, p_mes integer) returns integer
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración' using errcode = '42501'; end if;
  return piefirme_app.c_edr_recalcular(piefirme_app.org_id(), p_anio, p_mes);
end $$;
revoke all on function piefirme.edr_recalcular(integer, integer) from public, anon;
grant execute on function piefirme.edr_recalcular(integer, integer) to authenticated;
revoke all on function piefirme_app.c_edr_recalcular(uuid, integer, integer), piefirme_app.c_todas_sedes() from public, anon;
grant execute on function piefirme_app.c_edr_recalcular(uuid, integer, integer), piefirme_app.c_todas_sedes() to authenticated;

-- RPC: capturar la proyección de un renglón (proy_ manual, con bitácora)
create or replace function piefirme.edr_guardar_proyeccion(p_sede uuid, p_anio integer, p_mes integer, p_renglon text, p_importe numeric) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_p uuid; v_r uuid;
begin
  if not piefirme_app.es_admin() or not piefirme_app.puede_sede(p_sede) then raise exception 'solo Administración captura la proyección' using errcode = '42501'; end if;
  select id into v_r from piefirme.edr_renglones where organizacion_id = piefirme_app.org_id() and clave = p_renglon;
  if v_r is null then raise exception 'renglón inexistente: %', p_renglon using errcode = 'PF404'; end if;
  insert into piefirme.edr_periodos (organizacion_id, sede_id, anio, mes) values (piefirme_app.org_id(), p_sede, p_anio, p_mes) on conflict (sede_id, anio, mes) do nothing;
  select id into v_p from piefirme.edr_periodos where sede_id = p_sede and anio = p_anio and mes = p_mes;
  insert into piefirme.edr_lineas (organizacion_id, sede_id, periodo_id, renglon_id, proy_importe) values (piefirme_app.org_id(), p_sede, v_p, v_r, p_importe)
  on conflict (periodo_id, renglon_id) do update set proy_importe = excluded.proy_importe, updated_at = now();
end $$;
revoke all on function piefirme.edr_guardar_proyeccion(uuid, integer, integer, text, numeric) from public, anon;
grant execute on function piefirme.edr_guardar_proyeccion(uuid, integer, integer, text, numeric) to authenticated;

-- Disparo automático: los triggers de sentencia (con tablas de transición) solo anotan el clínica-mes afectado; el recálculo corre UNA vez
-- por transacción y mes, al hacer commit (constraint trigger diferido). Así un lote de cientos de cobros recalcula una sola vez.
create table piefirme.edr_pendientes (
  organizacion_id uuid not null references piefirme.organizaciones(id) on delete cascade,
  anio integer not null,
  mes integer not null,
  primary key (organizacion_id, anio, mes)
);
alter table piefirme.edr_pendientes enable row level security;   -- sin políticas: solo funciones security definer

create or replace function piefirme_app.c_edr_pendiente_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  delete from piefirme.edr_pendientes where organizacion_id = new.organizacion_id and anio = new.anio and mes = new.mes;
  perform piefirme_app.c_edr_recalcular(new.organizacion_id, new.anio, new.mes);
  return null;
end $$;
create constraint trigger t_recalcular after insert on piefirme.edr_pendientes deferrable initially deferred for each row execute function piefirme_app.c_edr_pendiente_ai();

-- Disparo automático: statement-level con tablas de transición (un recálculo por clínica-mes afectados)
create or replace function piefirme_app.c_edr_disparar_ins() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare x record;
begin
  if coalesce(current_setting('app.sin_edr_auto', true), '') = 'on' then return null; end if;
  for x in select distinct (to_jsonb(r) ->> 'organizacion_id')::uuid as org, extract(year from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int as a,
                  extract(month from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int as m from new_rows r loop
    insert into piefirme.edr_pendientes (organizacion_id, anio, mes) values (x.org, x.a, x.m) on conflict do nothing;
  end loop;
  return null;
end $$;
create or replace function piefirme_app.c_edr_disparar_del() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare x record;
begin
  if coalesce(current_setting('app.sin_edr_auto', true), '') = 'on' or pg_trigger_depth() > 1 then return null; end if;
  for x in select distinct (to_jsonb(r) ->> 'organizacion_id')::uuid as org, extract(year from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int as a,
                  extract(month from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int as m from old_rows r loop
    insert into piefirme.edr_pendientes (organizacion_id, anio, mes) values (x.org, x.a, x.m) on conflict do nothing;
  end loop;
  return null;
end $$;
create or replace function piefirme_app.c_edr_disparar_upd() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare x record;
begin
  if coalesce(current_setting('app.sin_edr_auto', true), '') = 'on' then return null; end if;
  for x in select distinct org, a, m from (
             select (to_jsonb(r) ->> 'organizacion_id')::uuid as org, extract(year from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int as a,
                    extract(month from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int as m from new_rows r
             union
             select (to_jsonb(r) ->> 'organizacion_id')::uuid, extract(year from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int,
                    extract(month from coalesce(to_jsonb(r) ->> 'fecha_pago', to_jsonb(r) ->> 'fecha')::date)::int from old_rows r) q loop
    insert into piefirme.edr_pendientes (organizacion_id, anio, mes) values (x.org, x.a, x.m) on conflict do nothing;
  end loop;
  return null;
end $$;
create trigger t_edr_ins after insert on piefirme.ingresos referencing new table as new_rows for each statement execute function piefirme_app.c_edr_disparar_ins();
create trigger t_edr_upd after update on piefirme.ingresos referencing old table as old_rows new table as new_rows for each statement execute function piefirme_app.c_edr_disparar_upd();
create trigger t_edr_del after delete on piefirme.ingresos referencing old table as old_rows for each statement execute function piefirme_app.c_edr_disparar_del();
create trigger t_edr_ins after insert on piefirme.gastos referencing new table as new_rows for each statement execute function piefirme_app.c_edr_disparar_ins();
create trigger t_edr_upd after update on piefirme.gastos referencing old table as old_rows new table as new_rows for each statement execute function piefirme_app.c_edr_disparar_upd();
create trigger t_edr_del after delete on piefirme.gastos referencing old table as old_rows for each statement execute function piefirme_app.c_edr_disparar_del();

-- ───────────────────────────── RLS (EDR: Administración; proy_ solo Administración, real_ solo el sistema) ─────────────────────────────
select piefirme_app.c_politicas('edr_periodos', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[]);
select piefirme_app.c_politicas('edr_lineas', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[]);
select piefirme_app.c_politicas('edr_ajustes', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array[]::text[], p_del => array['administrador']);
select piefirme_app.c_triggers('edr_periodos');
select piefirme_app.c_triggers('edr_lineas', false);
select piefirme_app.c_triggers('edr_ajustes');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_edr with (security_invoker = true) as
select l.id, l.organizacion_id, l.sede_id, s.nombre as sede_nombre, pe.anio, pe.mes, pe.estado as estado_periodo, pe.real_calculado_en,
       r.id as renglon_id, r.clave as renglon_clave, r.nombre as renglon_nombre, r.tipo as renglon_tipo, r.orden,
       l.proy_importe, l.real_auto, l.real_ajustes, l.real_importe, l.n_registros,
       l.real_importe - l.proy_importe as variacion,
       case when l.proy_importe <> 0 then round((l.real_importe - l.proy_importe) / abs(l.proy_importe) * 100, 1) end as variacion_pct
  from piefirme.edr_lineas l
  join piefirme.edr_periodos pe on pe.id = l.periodo_id
  join piefirme.edr_renglones r on r.id = l.renglon_id
  join piefirme.sedes s on s.id = l.sede_id;

-- Consolidado: solo para quien tiene todas las sedes (P-135)
create or replace view piefirme.prp_edr_consolidado with (security_invoker = true) as
select l.organizacion_id, pe.anio, pe.mes, r.id as renglon_id, r.clave as renglon_clave, r.nombre as renglon_nombre, r.tipo as renglon_tipo, r.orden,
       sum(l.proy_importe) as proy_importe, sum(l.real_auto) as real_auto, sum(l.real_ajustes) as real_ajustes, sum(l.real_importe) as real_importe, sum(l.n_registros)::int as n_registros,
       sum(l.real_importe) - sum(l.proy_importe) as variacion,
       case when sum(l.proy_importe) <> 0 then round((sum(l.real_importe) - sum(l.proy_importe)) / abs(sum(l.proy_importe)) * 100, 1) end as variacion_pct
  from piefirme.edr_lineas l join piefirme.edr_periodos pe on pe.id = l.periodo_id join piefirme.edr_renglones r on r.id = l.renglon_id
 where piefirme_app.c_todas_sedes()
 group by l.organizacion_id, pe.anio, pe.mes, r.id, r.clave, r.nombre, r.tipo, r.orden;

-- Utilidad gerencial «sin impuestos» (P-100): ingresos − gastos − fijos; memo (IVA) fuera
create or replace view piefirme.prp_edr_resultados with (security_invoker = true) as
select l.organizacion_id, l.sede_id, s.nombre as sede_nombre, pe.anio, pe.mes, pe.estado as estado_periodo,
       sum(l.proy_importe) filter (where r.tipo = 'ingreso') as proy_ingresos, sum(l.real_importe) filter (where r.tipo = 'ingreso') as real_ingresos,
       sum(l.proy_importe) filter (where r.tipo in ('gasto', 'fijo')) as proy_gastos, sum(l.real_importe) filter (where r.tipo in ('gasto', 'fijo')) as real_gastos,
       coalesce(sum(l.proy_importe) filter (where r.tipo = 'ingreso'), 0) - coalesce(sum(l.proy_importe) filter (where r.tipo in ('gasto', 'fijo')), 0) as proy_utilidad,
       coalesce(sum(l.real_importe) filter (where r.tipo = 'ingreso'), 0) - coalesce(sum(l.real_importe) filter (where r.tipo in ('gasto', 'fijo')), 0) as real_utilidad,
       case when coalesce(sum(l.real_importe) filter (where r.tipo = 'ingreso'), 0) > 0
            then round((coalesce(sum(l.real_importe) filter (where r.tipo = 'ingreso'), 0) - coalesce(sum(l.real_importe) filter (where r.tipo in ('gasto', 'fijo')), 0))
                       / sum(l.real_importe) filter (where r.tipo = 'ingreso') * 100, 1) end as real_margen_pct,
       'utilidad gerencial, sin impuestos' as nota
  from piefirme.edr_lineas l join piefirme.edr_periodos pe on pe.id = l.periodo_id join piefirme.edr_renglones r on r.id = l.renglon_id join piefirme.sedes s on s.id = l.sede_id
 group by l.organizacion_id, l.sede_id, s.nombre, pe.anio, pe.mes, pe.estado;

-- Desglose de un renglón: «clic en un importe real abre el desglose» (origen, registro, importe base sin IVA)
create or replace function piefirme.edr_desglose(p_sede uuid, p_anio integer, p_mes integer, p_renglon text)
returns table (origen text, registro_id uuid, fecha date, descripcion text, importe numeric)
language sql stable set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  with p as (select make_date(p_anio, p_mes, 1) as ini, (make_date(p_anio, p_mes, 1) + interval '1 month')::date - 1 as fin,
                    (select id from piefirme.edr_renglones where organizacion_id = piefirme_app.org_id() and clave = p_renglon) as rid)
  select 'ingreso'::text, i.id, i.fecha_pago, coalesce(i.concepto, i.referencia, i.clasificacion), round((case when i.es_reembolso then -1 else 1 end) * i.importe * (i.importe - i.iva) / i.importe, 2)
    from piefirme.ingresos i, p where piefirme_app.es_admin() and i.sede_id = p_sede and i.fecha_pago between p.ini and p.fin and coalesce(i.renglon_id, (select id from piefirme.edr_renglones where organizacion_id = i.organizacion_id and clave = 'otros_servicios')) = p.rid
       and not exists (select 1 from piefirme.ingreso_renglones x where x.ingreso_id = i.id)
  union all
  select 'ingreso'::text, i.id, i.fecha_pago, coalesce(i.concepto, i.referencia, i.clasificacion), round((case when i.es_reembolso then -1 else 1 end) * x.importe * (i.importe - i.iva) / i.importe, 2)
    from piefirme.ingreso_renglones x join piefirme.ingresos i on i.id = x.ingreso_id, p where piefirme_app.es_admin() and i.sede_id = p_sede and i.fecha_pago between p.ini and p.fin and x.renglon_id = p.rid
  union all
  select 'gasto'::text, g.id, g.fecha, coalesce(g.descripcion, gr.nombre), g.subtotal
    from piefirme.gastos g join piefirme.grupos_gasto gr on gr.id = g.grupo_id, p
   where piefirme_app.es_admin() and g.sede_id = p_sede and not g.compartido and g.estado = 'guardado' and g.fecha between p.ini and p.fin
     and case when g.metodo_pago = 'efectivo_fondo' and (select clave from piefirme.edr_renglones where id = p.rid) = 'fondo_revolvente' then true
              when g.metodo_pago = 'efectivo_fondo' then false else gr.renglon_id = p.rid end
  order by 3, 1
$$;
revoke all on function piefirme.edr_desglose(uuid, integer, integer, text) from public, anon;
grant execute on function piefirme.edr_desglose(uuid, integer, integer, text) to authenticated;

revoke all on all tables in schema piefirme from anon;
