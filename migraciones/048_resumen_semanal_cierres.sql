-- 048 · Inventario y finanzas · Resumen semanal (corte sábado → viernes) y cierre/reapertura de periodos.
-- Dominio C. Clona de IRP: ResumenSemanal.jsx (ingresos por concepto y forma de cobro, gastos, neto, efectivo a depositar, comisiones de terminal, estado En curso/Por cerrar/Cerrada).
-- Reglas: P-088 (semana sábado → viernes configurable; cierre por Administración; reapertura solo con bitácora), P-089 (Observado no bloquea el corte), P-099 (periodo cerrado = solo lectura; ajustes al siguiente periodo con referencia),
--   P-059 (efectivo a depositar), P-077 (la comisión de terminal es gasto, el cobro va bruto), P-135 (consolidado solo con todas las sedes).
-- Dependencias: 042 (cierres_periodo, semana helpers), 043 (ingresos), 044 (gastos), 047 (edr_periodos).
-- Definiciones: efectivo_a_depositar = cobros en efectivo de la semana − gastos pagados con efectivo del fondo revolvente de la semana.

set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.c_totales_periodo(p_org uuid, p_sede uuid, p_ini date, p_fin date) returns jsonb
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  with i as (
    select i.* , case when i.es_reembolso then -i.importe else i.importe end as neto from piefirme.ingresos i
     where i.organizacion_id = p_org and (p_sede is null or i.sede_id = p_sede) and i.fecha_pago between p_ini and p_fin),
  g as (
    select g.* from piefirme.gastos g
     where g.organizacion_id = p_org and g.estado = 'guardado' and (p_sede is null or g.sede_id = p_sede) and g.fecha between p_ini and p_fin)
  select jsonb_build_object(
    'ingresos', coalesce((select sum(neto) from i), 0),
    'ingresos_por_forma', coalesce((select jsonb_object_agg(forma_pago, t) from (select forma_pago, sum(neto) t from i group by 1) x), '{}'::jsonb),
    'ingresos_por_concepto', coalesce((select jsonb_object_agg(clasificacion, t) from (select clasificacion, sum(neto) t from i group by 1) x), '{}'::jsonb),
    'ingresos_por_validar', coalesce((select count(*) from i where estatus_validacion = 'por_validar'), 0),
    'ingresos_observados', coalesce((select count(*) from i where estatus_validacion = 'observado'), 0),
    'gastos', coalesce((select sum(total) from g), 0),
    'gastos_fondo', coalesce((select sum(total) from g where metodo_pago = 'efectivo_fondo'), 0),
    'comisiones_terminal', coalesce((select sum(total) from g where origen_modulo = 'comision_terminal'), 0),
    'neto', coalesce((select sum(neto) from i), 0) - coalesce((select sum(total) from g), 0),
    'efectivo_a_depositar', coalesce((select sum(neto) from i where forma_pago = 'efectivo'), 0) - coalesce((select sum(total) from g where metodo_pago = 'efectivo_fondo'), 0)
  )
$$;
revoke all on function piefirme_app.c_totales_periodo(uuid, uuid, date, date) from public, anon;
grant execute on function piefirme_app.c_totales_periodo(uuid, uuid, date, date) to authenticated;

-- RPC · desglose de una semana (para «Generar corte» / «Imprimir corte»); Administración
create or replace function piefirme.resumen_semanal(p_sede uuid default null, p_fecha date default null) returns jsonb
language plpgsql stable set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ini date; v_fin date; v_org uuid := piefirme_app.org_id(); v_c piefirme.cierres_periodo%rowtype;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración' using errcode = '42501'; end if;
  if p_sede is null and not piefirme_app.c_todas_sedes() then raise exception 'el consolidado exige tener asignadas todas las sedes (P-135)' using errcode = '42501'; end if;
  if p_sede is not null and not piefirme_app.puede_sede(p_sede) then raise exception 'sede fuera de tu alcance' using errcode = '42501'; end if;
  v_ini := piefirme_app.c_semana_inicio(v_org, coalesce(p_fecha, current_date));
  v_fin := v_ini + 6;
  select * into v_c from piefirme.cierres_periodo where organizacion_id = v_org and tipo = 'semana' and fecha_inicio = v_ini and sede_id is not distinct from p_sede;
  return piefirme_app.c_totales_periodo(v_org, p_sede, v_ini, v_fin) || jsonb_build_object(
    'semana', piefirme_app.c_semana_etiqueta(v_org, v_ini), 'inicio', v_ini, 'fin', v_fin,
    'estado', case when v_c.estado = 'cerrado' then 'cerrada' when v_c.estado = 'reabierto' then 'reabierta' when v_fin < current_date then 'por_cerrar' else 'en_curso' end,
    'gastos_por_grupo', coalesce((select jsonb_object_agg(nombre, t) from (
        select gr.nombre, sum(g.total) t from piefirme.gastos g join piefirme.grupos_gasto gr on gr.id = g.grupo_id
         where g.organizacion_id = v_org and g.estado = 'guardado' and (p_sede is null or g.sede_id = p_sede) and g.fecha between v_ini and v_fin group by 1) x), '{}'::jsonb));
end $$;
revoke all on function piefirme.resumen_semanal(uuid, date) from public, anon;
grant execute on function piefirme.resumen_semanal(uuid, date) to authenticated;

-- RPC · cerrar semana o mes (Administración). p_sede null = toda la clínica (requiere todas las sedes).
create or replace function piefirme.cerrar_periodo(p_tipo text, p_fecha date default null, p_sede uuid default null) returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_ini date; v_fin date; v_et text; v_tot jsonb; v_id uuid; v_prev piefirme.cierres_periodo%rowtype; r record;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración cierra periodos (P-088)' using errcode = '42501'; end if;
  if p_tipo not in ('semana', 'mes') then raise exception 'tipo inválido' using errcode = '22023'; end if;
  if p_sede is null and not piefirme_app.c_todas_sedes() then raise exception 'cerrar toda la clínica exige tener asignadas todas las sedes (P-135)' using errcode = '42501'; end if;
  if p_sede is not null and not piefirme_app.puede_sede(p_sede) then raise exception 'sede fuera de tu alcance' using errcode = '42501'; end if;
  if p_tipo = 'semana' then
    v_ini := piefirme_app.c_semana_inicio(v_org, coalesce(p_fecha, current_date)); v_fin := v_ini + 6; v_et := piefirme_app.c_semana_etiqueta(v_org, v_ini);
  else
    v_ini := date_trunc('month', coalesce(p_fecha, current_date))::date; v_fin := (v_ini + interval '1 month')::date - 1; v_et := to_char(v_ini, 'YYYY-MM');
  end if;
  if v_fin > current_date then raise exception 'el periodo % aún no termina', v_et using errcode = 'PF409'; end if;
  perform set_config('app.c_rpc', 'on', true);
  if p_tipo = 'mes' then
    perform piefirme_app.c_edr_recalcular(v_org, extract(year from v_ini)::int, extract(month from v_ini)::int);
  end if;
  v_tot := piefirme_app.c_totales_periodo(v_org, p_sede, v_ini, v_fin);
  select * into v_prev from piefirme.cierres_periodo where organizacion_id = v_org and tipo = p_tipo and fecha_inicio = v_ini and sede_id is not distinct from p_sede for update;
  if found and v_prev.estado = 'cerrado' then raise exception 'el periodo % ya está cerrado', v_et using errcode = 'PF409'; end if;
  if found then
    v_id := v_prev.id;
    update piefirme.cierres_periodo set estado = 'cerrado', ingresos = (v_tot ->> 'ingresos')::numeric, gastos = (v_tot ->> 'gastos')::numeric, neto = (v_tot ->> 'neto')::numeric,
           efectivo_a_depositar = (v_tot ->> 'efectivo_a_depositar')::numeric, snapshot = v_tot, cerrado_por = auth.uid(), cerrado_en = now() where id = v_id;
  else
    v_id := gen_random_uuid();
    insert into piefirme.cierres_periodo (id, organizacion_id, sede_id, tipo, etiqueta, fecha_inicio, fecha_fin, estado, ingresos, gastos, neto, efectivo_a_depositar, snapshot, cerrado_por, cerrado_en)
    values (v_id, v_org, p_sede, p_tipo, v_et, v_ini, v_fin, 'cerrado', (v_tot ->> 'ingresos')::numeric, (v_tot ->> 'gastos')::numeric, (v_tot ->> 'neto')::numeric,
            (v_tot ->> 'efectivo_a_depositar')::numeric, v_tot, auth.uid(), now());
  end if;
  if p_tipo = 'mes' then
    update piefirme.edr_periodos set estado = 'cerrado'
     where organizacion_id = v_org and anio = extract(year from v_ini)::int and mes = extract(month from v_ini)::int and (p_sede is null or sede_id = p_sede);
  end if;
  return v_id;
end $$;
revoke all on function piefirme.cerrar_periodo(text, date, uuid) from public, anon;
grant execute on function piefirme.cerrar_periodo(text, date, uuid) to authenticated;

-- RPC · reabrir (solo Administración, con motivo; queda en bitácora por el trigger de auditoría)
create or replace function piefirme.reabrir_periodo(p_cierre uuid, p_motivo text) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.cierres_periodo%rowtype;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración reabre periodos' using errcode = '42501'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'el motivo es obligatorio' using errcode = '22023'; end if;
  select * into c from piefirme.cierres_periodo where id = p_cierre for update;
  if not found or c.organizacion_id <> piefirme_app.org_id() then raise exception 'cierre inexistente' using errcode = 'PF404'; end if;
  if c.estado <> 'cerrado' then raise exception 'el periodo no está cerrado' using errcode = 'PF409'; end if;
  perform set_config('app.c_rpc', 'on', true);
  update piefirme.cierres_periodo set estado = 'reabierto', reabierto_por = auth.uid(), reabierto_en = now(), motivo_reapertura = p_motivo where id = c.id;
  if c.tipo = 'mes' then
    update piefirme.edr_periodos set estado = 'publicado'
     where organizacion_id = c.organizacion_id and anio = extract(year from c.fecha_inicio)::int and mes = extract(month from c.fecha_inicio)::int and (c.sede_id is null or sede_id = c.sede_id);
  end if;
  insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
  values (c.organizacion_id, auth.uid(), c.sede_id, 'actualizar', 'reapertura_periodo', c.id::text, jsonb_build_object('tipo', c.tipo, 'etiqueta', c.etiqueta, 'motivo', p_motivo));
end $$;
revoke all on function piefirme.reabrir_periodo(uuid, text) from public, anon;
grant execute on function piefirme.reabrir_periodo(uuid, text) to authenticated;

-- ───────────────────────────── vistas prp_* ─────────────────────────────
-- Resumen semanal por sede (E117): semanas con movimiento, ingresos por forma y concepto, gastos, neto y efectivo a depositar
create or replace view piefirme.prp_resumen_semanal with (security_invoker = true) as
with filas as (
  select i.organizacion_id, i.sede_id, piefirme_app.c_semana_inicio(i.organizacion_id, i.fecha_pago) as ini,
         case when i.es_reembolso then -i.importe else i.importe end as ing, i.forma_pago, i.clasificacion, i.estatus_validacion,
         0::numeric as gas, 0::numeric as gas_fondo, 0::numeric as gas_term
    from piefirme.ingresos i
  union all
  select g.organizacion_id, g.sede_id, piefirme_app.c_semana_inicio(g.organizacion_id, g.fecha), 0, null, null, null,
         g.total, case when g.metodo_pago = 'efectivo_fondo' then g.total else 0 end, case when g.origen_modulo = 'comision_terminal' then g.total else 0 end
    from piefirme.gastos g where g.estado = 'guardado'),
agr as (
  select organizacion_id, sede_id, ini,
         sum(ing) as ingresos,
         sum(ing) filter (where forma_pago = 'efectivo') as ing_efectivo, sum(ing) filter (where forma_pago = 'tarjeta_clip') as ing_tarjeta_clip,
         sum(ing) filter (where forma_pago = 'tarjeta') as ing_tarjeta, sum(ing) filter (where forma_pago in ('transferencia', 'deposito')) as ing_transferencia,
         sum(ing) filter (where forma_pago = 'cheque') as ing_cheque,
         sum(ing) filter (where clasificacion = 'servicio') as ing_servicios, sum(ing) filter (where clasificacion = 'producto') as ing_productos,
         sum(ing) filter (where clasificacion = 'anticipo') as ing_anticipos, sum(ing) filter (where clasificacion = 'plan') as ing_planes, sum(ing) filter (where clasificacion = 'mixto') as ing_mixtos,
         count(*) filter (where estatus_validacion = 'por_validar') as por_validar, count(*) filter (where estatus_validacion = 'observado') as observados,
         sum(gas) as gastos, sum(gas_fondo) as gastos_fondo, sum(gas_term) as comisiones_terminal
    from filas group by organizacion_id, sede_id, ini)
select a.organizacion_id, a.sede_id, coalesce(s.nombre, 'Gastos compartidos') as sede_nombre, a.ini as semana_inicio, a.ini + 6 as semana_fin,
       piefirme_app.c_semana_etiqueta(a.organizacion_id, a.ini) as semana,
       coalesce(a.ingresos, 0) as ingresos, coalesce(a.ing_efectivo, 0) as ing_efectivo, coalesce(a.ing_tarjeta_clip, 0) as ing_tarjeta_clip, coalesce(a.ing_tarjeta, 0) as ing_tarjeta,
       coalesce(a.ing_transferencia, 0) as ing_transferencia, coalesce(a.ing_cheque, 0) as ing_cheque,
       coalesce(a.ing_servicios, 0) as ing_servicios, coalesce(a.ing_productos, 0) as ing_productos, coalesce(a.ing_anticipos, 0) as ing_anticipos,
       coalesce(a.ing_planes, 0) as ing_planes, coalesce(a.ing_mixtos, 0) as ing_mixtos,
       coalesce(a.gastos, 0) as gastos, coalesce(a.gastos_fondo, 0) as gastos_fondo, coalesce(a.comisiones_terminal, 0) as comisiones_terminal,
       coalesce(a.ingresos, 0) - coalesce(a.gastos, 0) as neto,
       coalesce(a.ing_efectivo, 0) - coalesce(a.gastos_fondo, 0) as efectivo_a_depositar,
       a.por_validar, a.observados,
       case when c.estado = 'cerrado' then 'cerrada' when a.ini + 6 < current_date then 'por_cerrar' else 'en_curso' end as estado,
       c.id as cierre_id, c.cerrado_en
  from agr a
  left join piefirme.sedes s on s.id = a.sede_id
  left join piefirme.cierres_periodo c on c.organizacion_id = a.organizacion_id and c.tipo = 'semana' and c.fecha_inicio = a.ini and c.sede_id is not distinct from a.sede_id;

-- Consolidado semanal de la clínica: solo con todas las sedes (P-135)
create or replace view piefirme.prp_resumen_semanal_consolidado with (security_invoker = true) as
select organizacion_id, semana_inicio, semana_fin, semana, sum(ingresos) as ingresos, sum(ing_efectivo) as ing_efectivo, sum(ing_tarjeta_clip) as ing_tarjeta_clip,
       sum(ing_transferencia) as ing_transferencia, sum(gastos) as gastos, sum(gastos_fondo) as gastos_fondo, sum(comisiones_terminal) as comisiones_terminal,
       sum(neto) as neto, sum(efectivo_a_depositar) as efectivo_a_depositar, sum(por_validar) as por_validar, sum(observados) as observados
  from piefirme.prp_resumen_semanal where piefirme_app.c_todas_sedes()
 group by organizacion_id, semana_inicio, semana_fin, semana;

create or replace view piefirme.prp_cierres_periodo with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, s.nombre as sede_nombre, c.tipo, c.etiqueta, c.fecha_inicio, c.fecha_fin, c.estado, c.ingresos, c.gastos, c.neto, c.efectivo_a_depositar,
       c.snapshot, c.cerrado_por, c.cerrado_en, c.reabierto_por, c.reabierto_en, c.motivo_reapertura
  from piefirme.cierres_periodo c left join piefirme.sedes s on s.id = c.sede_id;

revoke all on all tables in schema piefirme from anon;
