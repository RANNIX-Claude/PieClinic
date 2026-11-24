-- 062 · UTILERÍAS y ANALÍTICA · superadministrador (RPC), registro de errores, salud del sistema, resumen de datos de prueba y DATA WAREHOUSE.
-- Depende de: 001 (seguridad, bitácora), 020-059 (tablas operativas), 059 (rannix_staff, exportación).
-- Reglas: nada en `public`; todo en el esquema piefirme. Vistas security_invoker (heredan el RLS de las tablas de origen) y solo para
--   administradores (piefirme_app.es_admin()): el warehouse nunca expone datos de salud identificables (dim_paciente va anonimizada, P-121).
--   Sin DDL destructivo: todo es `create or replace` / `if not exists` → idempotente.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── superadministrador ─────────────────────────────
-- rannix_staff no es legible por la API (sin políticas); la app pregunta por esta RPC si la persona es también personal RANNIX.
create or replace function piefirme.soy_rannix() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select piefirme_app.es_rannix()
$$;
revoke all on function piefirme.soy_rannix() from public, anon;
grant execute on function piefirme.soy_rannix() to authenticated;

-- ───────────────────────────── registro de errores de la aplicación ─────────────────────────────
create table if not exists piefirme.log_errores (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  usuario_id       uuid,
  rol              text,
  ruta             text,
  origen           text not null default 'app' check (origen in ('app', 'api', 'servidor', 'integracion')),
  mensaje          text not null,
  detalle          text,
  agente           text,
  resuelto         boolean not null default false,
  resuelto_por     uuid,
  resuelto_en      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists log_errores_org_fecha on piefirme.log_errores (organizacion_id, created_at desc);
alter table piefirme.log_errores enable row level security;

drop policy if exists logerr_sel on piefirme.log_errores;
drop policy if exists logerr_ins on piefirme.log_errores;
drop policy if exists logerr_upd on piefirme.log_errores;
create policy logerr_sel on piefirme.log_errores for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy logerr_ins on piefirme.log_errores for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid());
create policy logerr_upd on piefirme.log_errores for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin())
  with check (organizacion_id = piefirme_app.org_id());
revoke delete on piefirme.log_errores from authenticated;

create or replace function piefirme.registrar_error(p_ruta text, p_mensaje text, p_detalle text default null, p_origen text default 'app', p_agente text default null)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if piefirme_app.org_id() is null then return; end if;
  insert into piefirme.log_errores (organizacion_id, usuario_id, rol, ruta, origen, mensaje, detalle, agente)
  values (piefirme_app.org_id(), auth.uid(), piefirme_app.rol()::text, left(p_ruta, 300), coalesce(p_origen, 'app'), left(coalesce(p_mensaje, 'sin mensaje'), 1000), left(p_detalle, 4000), left(p_agente, 300));
end $$;
revoke all on function piefirme.registrar_error(text, text, text, text, text) from public, anon;
grant execute on function piefirme.registrar_error(text, text, text, text, text) to authenticated;

-- ───────────────────────────── salud del sistema ─────────────────────────────
create or replace function piefirme.salud_sistema() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v jsonb; o uuid := piefirme_app.org_id();
begin
  if o is null or not piefirme_app.es_admin() then raise exception 'Solo administración'; end if;
  select jsonb_build_object(
    'generado_en', now(),
    'organizacion', (select jsonb_build_object('nombre', nombre, 'estado', estado, 'plan', plan, 'zona_horaria', zona_horaria) from piefirme.organizaciones where id = o),
    'usuarios_activos', (select count(*) from piefirme.perfiles where organizacion_id = o and activo),
    'usuarios_por_rol', (select coalesce(jsonb_object_agg(rol, n), '{}'::jsonb) from (select rol::text, count(*) n from piefirme.perfiles where organizacion_id = o and activo group by rol) x),
    'ultimo_acceso', (select max(ultimo_acceso) from piefirme.perfiles where organizacion_id = o),
    'errores_24h', (select count(*) from piefirme.log_errores where organizacion_id = o and created_at > now() - interval '24 hours'),
    'errores_7d', (select count(*) from piefirme.log_errores where organizacion_id = o and created_at > now() - interval '7 days'),
    'errores_sin_resolver', (select count(*) from piefirme.log_errores where organizacion_id = o and not resuelto),
    'bitacora_24h', (select count(*) from piefirme.bitacora where organizacion_id = o and created_at > now() - interval '24 hours'),
    'bitacora_total', (select count(*) from piefirme.bitacora where organizacion_id = o),
    'migraciones_aplicadas', (select count(*) from piefirme._rannix_migraciones),
    'ultima_migracion', (select nombre from piefirme._rannix_migraciones order by aplicada_en desc, nombre desc limit 1),
    'tablas', (select count(*) from pg_tables where schemaname = 'piefirme'),
    'tablas_sin_rls', (select coalesce(jsonb_agg(tablename), '[]'::jsonb) from pg_tables where schemaname = 'piefirme' and not rowsecurity and tablename not like '\_%'),
    'vistas_sin_invoker', (select coalesce(jsonb_agg(c.relname), '[]'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                            where n.nspname = 'piefirme' and c.relkind = 'v' and not coalesce((select 'security_invoker=true' = any (c.reloptions)), false)),
    'tamano_bd_mb', round(pg_database_size(current_database()) / 1048576.0, 1)
  ) into v;
  return v;
end $$;
revoke all on function piefirme.salud_sistema() from public, anon;
grant execute on function piefirme.salud_sistema() to authenticated;

-- ───────────────────────────── resumen de datos (marca de prueba) ─────────────────────────────
-- La organización de prueba lleva parametros.es_prueba = true: ese es el marcador para limpiar sin tocar datos reales.
update piefirme.organizaciones set parametros = parametros || '{"es_prueba": true}'::jsonb
 where id = '00000000-0000-0000-0000-00000000c0de' and not (parametros ? 'es_prueba');

create or replace function piefirme.resumen_datos() returns table (modulo text, tabla text, registros bigint, es_prueba boolean)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t record; n bigint; prueba boolean; o uuid := piefirme_app.org_id();
begin
  -- definer + filtro explícito por clínica: contar bajo RLS evalúa la política fila por fila y agota el tiempo con decenas de miles de filas
  if o is null or not piefirme_app.es_admin() then raise exception 'Solo administración'; end if;
  select coalesce((parametros ->> 'es_prueba')::boolean, false) into prueba from piefirme.organizaciones where id = o;
  for t in
    select * from (values
      ('Organización', 'sedes'), ('Organización', 'cabinas'), ('Organización', 'perfiles'),
      ('Pacientes', 'pacientes'), ('Pacientes', 'expedientes'), ('Pacientes', 'consentimientos'),
      ('Agenda', 'citas'), ('Agenda', 'lista_espera'), ('Agenda', 'recordatorios'),
      ('Clínico', 'consultas'), ('Clínico', 'diagnosticos_consulta'), ('Clínico', 'planes_tratamiento'), ('Clínico', 'fotos_clinicas'),
      ('Clínico', 'lotes_esterilizacion'), ('Clínico', 'quejas'), ('Clínico', 'encuestas'),
      ('Comercial', 'servicios'), ('Comercial', 'precios'), ('Comercial', 'ofertas'), ('Comercial', 'ventas'), ('Comercial', 'venta_lineas'),
      ('Comercial', 'pagos'), ('Comercial', 'anticipos'), ('Comercial', 'turnos_caja'), ('Comercial', 'facturas'),
      ('Inventario', 'productos'), ('Inventario', 'proveedores'), ('Inventario', 'inventario_sede'), ('Inventario', 'movimientos_inventario'),
      ('Inventario', 'ordenes_compra'), ('Inventario', 'traspasos'),
      ('Finanzas', 'ingresos'), ('Finanzas', 'gastos'), ('Finanzas', 'cuentas_por_pagar'), ('Finanzas', 'movimientos_bancarios'),
      ('Finanzas', 'conciliaciones'), ('Finanzas', 'edr_periodos'), ('Finanzas', 'fondos_revolventes'),
      ('Equipo', 'empleados'), ('Equipo', 'asistencia'), ('Equipo', 'comision_detalle'), ('Equipo', 'prenomina'), ('Equipo', 'equipos'),
      ('Plataforma', 'bitacora'), ('Plataforma', 'log_errores'), ('Plataforma', 'importaciones'), ('Plataforma', 'campanas')
    ) v(m, tb)
  loop
    execute format('select count(*) from piefirme.%I where organizacion_id = $1', t.tb) into n using o;
    modulo := t.m; tabla := t.tb; registros := n; es_prueba := prueba;
    return next;
  end loop;
end $$;
revoke all on function piefirme.resumen_datos() from public, anon;
grant execute on function piefirme.resumen_datos() to authenticated;

-- ═════════════════════════════ DATA WAREHOUSE (modelo dimensional) ═════════════════════════════
-- Estrella: dimensiones dw_dim_* + hechos dw_fact_* (llave de tiempo `fecha_key` = AAAAMMDD) + tableros dw_kpi_*.
-- Zona horaria de negocio: America/Mexico_City. Solo administradores. Documentado en docs/DW_DICCIONARIO.md.

-- ── Dimensiones ──
create or replace view piefirme.dw_dim_tiempo with (security_invoker = true) as
select to_char(d, 'YYYYMMDD')::int as fecha_key, d::date as fecha, extract(year from d)::int as anio, extract(quarter from d)::int as trimestre,
       extract(month from d)::int as mes, to_char(d, 'YYYY-MM') as anio_mes,
       (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from d)::int] as nombre_mes,
       extract(week from d)::int as semana_iso, extract(day from d)::int as dia_mes, extract(isodow from d)::int as dia_semana,
       (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from d)::int] as nombre_dia,
       (extract(isodow from d) >= 6) as es_fin_semana
  from generate_series(date '2024-01-01', date '2028-12-31', interval '1 day') d;

create or replace view piefirme.dw_dim_sede with (security_invoker = true) as
select s.id as sede_id, s.organizacion_id, s.clave, s.nombre, s.activa, s.direccion
  from piefirme.sedes s where (select piefirme_app.es_admin());

create or replace view piefirme.dw_dim_servicio with (security_invoker = true) as
select v.id as servicio_id, v.organizacion_id, v.codigo, v.nombre, v.categoria, v.tipo_precio, v.duracion_min, v.requiere_seguimiento,
       v.admite_domicilio, v.admite_videoconsulta, v.estado
  from piefirme.servicios v where (select piefirme_app.es_admin());

create or replace view piefirme.dw_dim_producto with (security_invoker = true) as
select p.id as producto_id, p.organizacion_id, p.sku, p.nombre, p.categoria, p.marca, p.tipo, p.costo_promedio, p.estado
  from piefirme.productos p where (select piefirme_app.es_admin());

create or replace view piefirme.dw_dim_podologo with (security_invoker = true) as
select p.id as podologo_id, p.organizacion_id, trim(p.nombre || ' ' || coalesce(p.apellidos, '')) as nombre, p.cedula, p.activo,
       case when cardinality(p.sedes) = 0 then null else p.sedes[1] end as sede_base_id
  from piefirme.perfiles p where p.rol = 'podologo' and (select piefirme_app.es_admin());

-- Paciente ANONIMIZADO: sin nombre, CURP, teléfono, correo ni domicilio. Solo atributos analíticos.
create or replace view piefirme.dw_dim_paciente with (security_invoker = true) as
select p.id as paciente_id, p.organizacion_id, p.sexo,
       case when p.fecha_nacimiento is null then 'sin dato'
            when extract(year from age(p.fecha_nacimiento)) < 18 then '0-17'
            when extract(year from age(p.fecha_nacimiento)) < 36 then '18-35'
            when extract(year from age(p.fecha_nacimiento)) < 51 then '36-50'
            when extract(year from age(p.fecha_nacimiento)) < 66 then '51-65' else '66+' end as grupo_edad,
       coalesce(p.diabetes, 'no') as diabetes, p.canal_origen, p.como_nos_conocio as origen, p.municipio, p.estado as estado_paciente,
       p.sede_registro_id, p.acepta_promociones, (p.created_at at time zone 'America/Mexico_City')::date as fecha_alta
  from piefirme.pacientes p where (select piefirme_app.es_admin());

create or replace view piefirme.dw_dim_proveedor with (security_invoker = true) as
select p.id as proveedor_id, p.organizacion_id, p.clave, p.nombre, p.categoria, p.es_laboratorio, p.activo, p.dias_credito
  from piefirme.proveedores p where (select piefirme_app.es_admin());

create or replace view piefirme.dw_dim_grupo_gasto with (security_invoker = true) as
select g.id as grupo_id, g.organizacion_id, g.clave, g.nombre, g.permite_fondo, g.activo
  from piefirme.grupos_gasto g where (select piefirme_app.es_admin());

create or replace view piefirme.dw_dim_metodo_pago with (security_invoker = true) as
select * from (values
  ('efectivo', 'Efectivo', true), ('tarjeta', 'Tarjeta (terminal)', true), ('clip', 'Clip (terminal/liga)', true),
  ('transferencia', 'Transferencia', true), ('anticipo', 'Anticipo aplicado', false), ('gift_card', 'Gift card', false)
) v(metodo, nombre, es_ingreso_de_caja);

-- ── Hechos ──
create or replace view piefirme.dw_fact_citas with (security_invoker = true) as
select c.id as cita_id, c.organizacion_id, c.sede_id, c.servicio_id, c.podologo_id, c.paciente_id,
       to_char(c.inicio at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key,
       (c.inicio at time zone 'America/Mexico_City')::date as fecha,
       extract(hour from c.inicio at time zone 'America/Mexico_City')::int as hora,
       c.estado, c.tipo_atencion, c.origen, coalesce(c.primera_vez, false) as primera_vez,
       coalesce(c.precio_servicio, 0) as precio_servicio, c.duracion_min,
       1 as citas, (c.estado = 'atendida')::int as atendidas, (c.estado = 'no_asistio')::int as no_asistio, (c.estado = 'cancelada')::int as canceladas,
       case when c.llegada_en is not null and c.inicio_atencion_en is not null then round((extract(epoch from c.inicio_atencion_en - c.llegada_en) / 60)::numeric, 1) end as espera_min
  from piefirme.citas c where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_ventas with (security_invoker = true) as
select l.id as linea_id, v.id as venta_id, v.organizacion_id, v.sede_id, l.servicio_id, l.producto_id, v.paciente_id, v.podologo_id, v.cajero_id,
       to_char(coalesce(v.cobrada_en, v.created_at) at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key,
       (coalesce(v.cobrada_en, v.created_at) at time zone 'America/Mexico_City')::date as fecha,
       l.tipo, v.origen, v.estado, l.cantidad, l.importe_bruto, l.descuento, l.importe, l.base_neta, l.iva_monto
  from piefirme.venta_lineas l join piefirme.ventas v on v.id = l.venta_id
 where v.estado not in ('por_cobrar', 'cancelada') and (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_pagos with (security_invoker = true) as
select p.id as pago_id, v.organizacion_id, v.sede_id, v.id as venta_id, p.metodo,
       to_char(coalesce(v.cobrada_en, p.created_at) at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key,
       (coalesce(v.cobrada_en, p.created_at) at time zone 'America/Mexico_City')::date as fecha, p.monto
  from piefirme.pagos p join piefirme.ventas v on v.id = p.venta_id
 where v.estado not in ('por_cobrar', 'cancelada') and (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_ingresos with (security_invoker = true) as
select i.id as ingreso_id, i.organizacion_id, i.sede_id, i.paciente_id, i.podologo_id, to_char(i.fecha_pago, 'YYYYMMDD')::int as fecha_key, i.fecha_pago as fecha,
       i.forma_pago, i.clasificacion, i.importe, i.iva, coalesce(i.es_reembolso, false) as es_reembolso, i.estatus_validacion
  from piefirme.ingresos i where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_gastos with (security_invoker = true) as
select g.id as gasto_id, g.organizacion_id, g.sede_id, g.grupo_id, g.proveedor_id, to_char(g.fecha, 'YYYYMMDD')::int as fecha_key, g.fecha,
       g.metodo_pago, g.subtotal, g.iva, g.total, coalesce(g.tiene_factura, false) as tiene_factura, g.estado, g.origen_modulo
  from piefirme.gastos g where g.estado <> 'anulado' and (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_inventario_mov with (security_invoker = true) as
select m.id as movimiento_id, m.organizacion_id, m.sede_id, m.producto_id, to_char(m.fecha at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key,
       (m.fecha at time zone 'America/Mexico_City')::date as fecha, m.tipo, m.cantidad, m.costo_unitario, m.costo_total
  from piefirme.movimientos_inventario m where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_existencias with (security_invoker = true) as
select i.id as existencia_id, i.organizacion_id, i.sede_id, i.producto_id, i.existencia, i.minimo, i.maximo, p.costo_promedio,
       round(i.existencia * coalesce(p.costo_promedio, 0), 2) as valuacion, (i.existencia < i.minimo) as bajo_minimo
  from piefirme.inventario_sede i join piefirme.productos p on p.id = i.producto_id where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_consultas with (security_invoker = true) as
select c.id as consulta_id, c.organizacion_id, c.sede_id, c.paciente_id, c.podologo_id, c.servicio_id,
       to_char(c.fecha_hora at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key, (c.fecha_hora at time zone 'America/Mexico_City')::date as fecha,
       c.estado, (c.firmada_en is not null) as firmada, 1 as consultas,
       (select count(*) from piefirme.diagnosticos_consulta d where d.consulta_id = c.id)::int as diagnosticos,
       (select count(*) from piefirme.procedimientos_consulta p where p.consulta_id = c.id)::int as procedimientos
  from piefirme.consultas c where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_asistencia with (security_invoker = true) as
select a.id as asistencia_id, a.organizacion_id, a.sede_id, a.empleado_id, to_char(a.fecha, 'YYYYMMDD')::int as fecha_key, a.fecha, a.estado,
       coalesce(a.minutos_trabajados, 0) as minutos_trabajados, coalesce(a.minutos_retardo, 0) as minutos_retardo
  from piefirme.asistencia a where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_comisiones with (security_invoker = true) as
select d.id as comision_id, d.organizacion_id, d.sede_id, d.empleado_id, to_char(d.fecha, 'YYYYMMDD')::int as fecha_key, d.fecha, d.tipo, d.base, d.pct, d.comision
  from piefirme.comision_detalle d where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_cuentas_pagar with (security_invoker = true) as
select c.id as cxp_id, c.organizacion_id, c.sede_id, c.proveedor_id, to_char(c.fecha_emision, 'YYYYMMDD')::int as fecha_key, c.fecha_emision, c.fecha_vencimiento,
       c.estado, c.importe, c.pagado, c.saldo, (c.saldo > 0 and c.fecha_vencimiento < current_date) as vencida
  from piefirme.cuentas_por_pagar c where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_quejas with (security_invoker = true) as
select q.id as queja_id, q.organizacion_id, q.sede_id, q.paciente_id, q.podologo_id, to_char(q.fecha_hora at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key,
       (q.fecha_hora at time zone 'America/Mexico_City')::date as fecha, q.canal, q.clase, q.tipo, q.gravedad, q.estado, coalesce(q.compensacion_monto, 0) as compensacion_monto,
       case when q.cerrada_en is not null then round((extract(epoch from q.cerrada_en - q.fecha_hora) / 86400)::numeric, 1) end as dias_resolucion
  from piefirme.quejas q where (select piefirme_app.es_admin());

create or replace view piefirme.dw_fact_encuestas with (security_invoker = true) as
select e.id as encuesta_id, e.organizacion_id, e.sede_id, e.paciente_id, to_char(e.respondida_en at time zone 'America/Mexico_City', 'YYYYMMDD')::int as fecha_key,
       (e.respondida_en at time zone 'America/Mexico_City')::date as fecha, e.tipo, e.calificacion, coalesce(e.requiere_atencion, false) as requiere_atencion
  from piefirme.encuestas e where e.respondida_en is not null and (select piefirme_app.es_admin());

-- ── Tableros ejecutivos (KPIs) ──
-- Mensual por sede: cada rama agrega un hecho y rellena con ceros lo demás; el envoltorio calcula las razones.
create or replace view piefirme.dw_calc_kpi_mensual_sede with (security_invoker = true) as
with u as (
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM') as anio_mes,
         count(*) as citas_agendadas, count(*) filter (where estado = 'atendida') as citas_atendidas, count(*) filter (where estado = 'no_asistio') as no_shows,
         count(*) filter (where estado = 'cancelada') as citas_canceladas, count(*) filter (where primera_vez and estado = 'atendida') as pacientes_primera_vez,
         0::numeric as ventas, 0::bigint as tickets, 0::numeric as ingresos, 0::numeric as gastos, 0::bigint as consultas, 0::numeric as calif_suma, 0::bigint as calif_n,
         0::numeric as comisiones, 0::bigint as minutos_trabajados
    from piefirme.dw_fact_citas group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, sum(base_neta), count(distinct venta_id), 0, 0, 0, 0, 0, 0, 0
    from piefirme.dw_fact_ventas group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, 0, 0, sum(importe) filter (where not es_reembolso) - coalesce(sum(importe) filter (where es_reembolso), 0), 0, 0, 0, 0, 0, 0
    from piefirme.dw_fact_ingresos group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, 0, 0, 0, sum(total), 0, 0, 0, 0, 0
    from piefirme.dw_fact_gastos group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, 0, 0, 0, 0, count(*), 0, 0, 0, 0
    from piefirme.dw_fact_consultas group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, sum(calificacion), count(*), 0, 0
    from piefirme.dw_fact_encuestas where calificacion is not null group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, sum(comision), 0
    from piefirme.dw_fact_comisiones group by 1, 2, 3
  union all
  select organizacion_id, sede_id, to_char(fecha, 'YYYY-MM'), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, sum(minutos_trabajados)
    from piefirme.dw_fact_asistencia group by 1, 2, 3
), s as (
  select organizacion_id, sede_id, anio_mes,
         sum(citas_agendadas) as citas_agendadas, sum(citas_atendidas) as citas_atendidas, sum(no_shows) as no_shows, sum(citas_canceladas) as citas_canceladas,
         sum(pacientes_primera_vez) as pacientes_primera_vez, sum(ventas) as ventas, sum(tickets) as tickets, sum(ingresos) as ingresos, sum(gastos) as gastos,
         sum(consultas) as consultas, sum(calif_suma) as calif_suma, sum(calif_n) as calif_n, sum(comisiones) as comisiones, sum(minutos_trabajados) as minutos_trabajados
    from u group by 1, 2, 3
)
select organizacion_id, sede_id, anio_mes, citas_agendadas, citas_atendidas, no_shows, citas_canceladas, pacientes_primera_vez, consultas,
       round(ventas, 2) as ventas, tickets, round(ingresos, 2) as ingresos, round(gastos, 2) as gastos, round(ingresos - gastos, 2) as utilidad,
       round(100.0 * no_shows / nullif(citas_agendadas - citas_canceladas, 0), 1) as tasa_no_show_pct,
       round(ventas / nullif(tickets, 0), 2) as ticket_promedio,
       round(calif_suma / nullif(calif_n, 0), 2) as calificacion_promedio, calif_n as encuestas,
       round(comisiones, 2) as comisiones, round(minutos_trabajados / 60.0, 1) as horas_trabajadas
  from s where (select piefirme_app.es_admin());

create or replace view piefirme.dw_calc_kpi_servicio_mes with (security_invoker = true) as
select v.organizacion_id, to_char(v.fecha, 'YYYY-MM') as anio_mes, v.sede_id, s.servicio_id, s.nombre as servicio, s.categoria,
       count(distinct v.venta_id) as tickets, sum(v.cantidad) as unidades, round(sum(v.base_neta), 2) as ventas, round(sum(v.descuento), 2) as descuentos
  from piefirme.dw_fact_ventas v join piefirme.dw_dim_servicio s on s.servicio_id = v.servicio_id
 where v.tipo = 'servicio' group by 1, 2, 3, 4, 5, 6;

create or replace view piefirme.dw_calc_kpi_producto_mes with (security_invoker = true) as
select v.organizacion_id, to_char(v.fecha, 'YYYY-MM') as anio_mes, v.sede_id, p.producto_id, p.nombre as producto, p.categoria,
       sum(v.cantidad) as unidades, round(sum(v.base_neta), 2) as ventas, round(sum(v.base_neta) - sum(v.cantidad * coalesce(p.costo_promedio, 0)), 2) as margen
  from piefirme.dw_fact_ventas v join piefirme.dw_dim_producto p on p.producto_id = v.producto_id
 where v.tipo = 'producto' group by 1, 2, 3, 4, 5, 6;

create or replace view piefirme.dw_calc_kpi_podologo_mes with (security_invoker = true) as
select c.organizacion_id, to_char(c.fecha, 'YYYY-MM') as anio_mes, c.podologo_id, d.nombre as podologo,
       count(*) as citas_agendadas, sum(c.atendidas) as citas_atendidas, sum(c.no_asistio) as no_shows,
       round(100.0 * sum(c.no_asistio) / nullif(count(*) - sum(c.canceladas), 0), 1) as tasa_no_show_pct,
       round(sum(c.precio_servicio) filter (where c.atendidas = 1), 2) as ingreso_atendido,
       round(avg(c.espera_min), 1) as espera_promedio_min
  from piefirme.dw_fact_citas c left join piefirme.dw_dim_podologo d on d.podologo_id = c.podologo_id group by 1, 2, 3, 4;

create or replace view piefirme.dw_calc_kpi_metodo_pago_mes with (security_invoker = true) as
select organizacion_id, to_char(fecha, 'YYYY-MM') as anio_mes, sede_id, metodo, count(*) as pagos, round(sum(monto), 2) as monto
  from piefirme.dw_fact_pagos group by 1, 2, 3, 4;

create or replace view piefirme.dw_calc_kpi_gasto_grupo_mes with (security_invoker = true) as
select g.organizacion_id, to_char(g.fecha, 'YYYY-MM') as anio_mes, g.sede_id, d.nombre as grupo, count(*) as gastos, round(sum(g.total), 2) as total
  from piefirme.dw_fact_gastos g left join piefirme.dw_dim_grupo_gasto d on d.grupo_id = g.grupo_id group by 1, 2, 3, 4;

create or replace view piefirme.dw_calc_kpi_inventario with (security_invoker = true) as
select e.organizacion_id, e.sede_id, p.categoria, count(*) as productos, count(*) filter (where e.bajo_minimo) as bajo_minimo,
       round(sum(e.valuacion), 2) as valuacion
  from piefirme.dw_fact_existencias e join piefirme.dw_dim_producto p on p.producto_id = e.producto_id group by 1, 2, 3;

create or replace view piefirme.dw_calc_kpi_pacientes with (security_invoker = true) as
select organizacion_id, grupo_edad, sexo, diabetes, coalesce(canal_origen, 'sin dato') as canal_origen, count(*) as pacientes
  from piefirme.dw_dim_paciente group by 1, 2, 3, 4, 5;

-- ── Capa de instantáneas ──
-- Calcular los KPIs sobre las tablas con RLS cuesta varios segundos (la política se evalúa fila por fila). Por eso las vistas dw_calc_kpi_*
-- (internas, sin acceso para la API) se materializan en tablas dw_kpi_* con RLS por clínica, que refresca piefirme.dw_refrescar() (botón
-- «Actualizar» del tablero ejecutivo y del módulo Data warehouse). Cada refresco reemplaza solo las filas de la clínica de quien lo pide.
do $$
declare n text;
begin
  foreach n in array array['mensual_sede', 'servicio_mes', 'producto_mes', 'podologo_mes', 'metodo_pago_mes', 'gasto_grupo_mes', 'inventario', 'pacientes'] loop
    if exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'piefirme' and c.relname = 'dw_kpi_' || n and c.relkind = 'v') then
      execute format('drop view piefirme.dw_kpi_%s cascade', n);   -- primera versión de esta migración: eran vistas
    end if;
    execute format('create table if not exists piefirme.dw_kpi_%s (like piefirme.dw_calc_kpi_%s)', n, n);
    execute format('alter table piefirme.dw_kpi_%s enable row level security', n);
    execute format('drop policy if exists dw_sel on piefirme.dw_kpi_%s', n);
    execute format('create policy dw_sel on piefirme.dw_kpi_%s for select to authenticated using (organizacion_id = piefirme_app.org_id() and (select piefirme_app.es_admin()))', n);
    execute format('revoke all on piefirme.dw_kpi_%s from anon', n);
    execute format('revoke insert, update, delete, truncate on piefirme.dw_kpi_%s from authenticated', n);
    execute format('revoke all on piefirme.dw_calc_kpi_%s from authenticated, anon', n);
  end loop;
end $$;

create table if not exists piefirme.dw_actualizacion (
  organizacion_id  uuid primary key references piefirme.organizaciones(id) on delete cascade,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid,
  filas            jsonb not null default '{}'::jsonb
);
alter table piefirme.dw_actualizacion enable row level security;
drop policy if exists dwact_sel on piefirme.dw_actualizacion;
create policy dwact_sel on piefirme.dw_actualizacion for select to authenticated using (organizacion_id = piefirme_app.org_id() and (select piefirme_app.es_admin()));
revoke all on piefirme.dw_actualizacion from anon;
revoke insert, update, delete, truncate on piefirme.dw_actualizacion from authenticated;

create or replace function piefirme.dw_refrescar() returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o uuid := piefirme_app.org_id(); n text; c bigint; r jsonb := '{}'::jsonb;
begin
  if o is null or not piefirme_app.es_admin() then raise exception 'Solo administración'; end if;
  foreach n in array array['mensual_sede', 'servicio_mes', 'producto_mes', 'podologo_mes', 'metodo_pago_mes', 'gasto_grupo_mes', 'inventario', 'pacientes'] loop
    execute format('delete from piefirme.dw_kpi_%s where organizacion_id = $1', n) using o;
    execute format('insert into piefirme.dw_kpi_%s select * from piefirme.dw_calc_kpi_%s where organizacion_id = $1', n, n) using o;
    get diagnostics c = row_count;
    r := r || jsonb_build_object(n, c);
  end loop;
  insert into piefirme.dw_actualizacion (organizacion_id, actualizado_en, actualizado_por, filas) values (o, now(), auth.uid(), r)
  on conflict (organizacion_id) do update set actualizado_en = now(), actualizado_por = auth.uid(), filas = excluded.filas;
  return r;
end $$;
revoke all on function piefirme.dw_refrescar() from public, anon;
grant execute on function piefirme.dw_refrescar() to authenticated;

create or replace view piefirme.dw_kpi_mensual_org with (security_invoker = true) as
select organizacion_id, anio_mes, sum(citas_agendadas) as citas_agendadas, sum(citas_atendidas) as citas_atendidas, sum(no_shows) as no_shows,
       sum(citas_canceladas) as citas_canceladas, sum(pacientes_primera_vez) as pacientes_primera_vez, sum(consultas) as consultas,
       sum(ventas) as ventas, sum(tickets) as tickets, sum(ingresos) as ingresos, sum(gastos) as gastos, sum(utilidad) as utilidad,
       round(100.0 * sum(no_shows) / nullif(sum(citas_agendadas) - sum(citas_canceladas), 0), 1) as tasa_no_show_pct,
       round(sum(ventas) / nullif(sum(tickets), 0), 2) as ticket_promedio,
       round(100.0 * sum(utilidad) / nullif(sum(ingresos), 0), 1) as margen_pct
  from piefirme.dw_kpi_mensual_sede group by 1, 2;

-- Tarjetas del tablero: mes en curso contra mes anterior y acumulado del año (una fila por métrica)
create or replace view piefirme.dw_kpi_resumen with (security_invoker = true) as
with m as (select * from piefirme.dw_kpi_mensual_org),
     p as (select to_char(current_date, 'YYYY-MM') as actual, to_char(current_date - interval '1 month', 'YYYY-MM') as anterior, to_char(current_date, 'YYYY') as anio),
     largo as (
       select m.organizacion_id, k.metrica, k.unidad, k.orden,
              sum(k.valor) filter (where m.anio_mes = p.actual) as mes_actual,
              sum(k.valor) filter (where m.anio_mes = p.anterior) as mes_anterior,
              sum(k.valor) filter (where left(m.anio_mes, 4) = p.anio and m.anio_mes <= p.actual) as acumulado_anio
         from m cross join p
         cross join lateral (values
           ('ventas', 'MXN', 1, m.ventas), ('ingresos', 'MXN', 2, m.ingresos), ('gastos', 'MXN', 3, m.gastos), ('utilidad', 'MXN', 4, m.utilidad),
           ('citas_atendidas', 'citas', 5, m.citas_atendidas::numeric), ('no_shows', 'citas', 6, m.no_shows::numeric),
           ('pacientes_primera_vez', 'pacientes', 7, m.pacientes_primera_vez::numeric), ('consultas', 'consultas', 8, m.consultas::numeric)
         ) k(metrica, unidad, orden, valor)
        group by 1, 2, 3, 4)
select organizacion_id, metrica, unidad, round(mes_actual, 2) as mes_actual, round(mes_anterior, 2) as mes_anterior,
       round(100.0 * (mes_actual - mes_anterior) / nullif(mes_anterior, 0), 1) as variacion_pct, round(acumulado_anio, 2) as acumulado_anio
  from largo order by orden;

-- ── Diccionario y catálogo de exportación ──
create or replace view piefirme.dw_catalogo with (security_invoker = true) as
select * from (values
  ('dw_dim_tiempo', 'dimensión', 'día', 'Calendario 2024-2028: año, trimestre, mes, semana ISO, día, fin de semana', 'fecha_key'),
  ('dw_dim_sede', 'dimensión', 'sede', 'Sucursales de la clínica', 'sede_id'),
  ('dw_dim_servicio', 'dimensión', 'servicio', 'Catálogo de servicios clínicos con categoría y duración', 'servicio_id'),
  ('dw_dim_producto', 'dimensión', 'producto', 'Catálogo de productos con costo promedio', 'producto_id'),
  ('dw_dim_podologo', 'dimensión', 'podólogo', 'Podólogos (cédula profesional, sede base)', 'podologo_id'),
  ('dw_dim_paciente', 'dimensión', 'paciente (anonimizado)', 'Sexo, grupo de edad, diabetes, canal de origen, municipio; sin datos personales', 'paciente_id'),
  ('dw_dim_proveedor', 'dimensión', 'proveedor', 'Proveedores y laboratorios', 'proveedor_id'),
  ('dw_dim_grupo_gasto', 'dimensión', 'grupo de gasto', 'Grupos del catálogo de gastos', 'grupo_id'),
  ('dw_dim_metodo_pago', 'dimensión', 'método de pago', 'Efectivo, tarjeta, Clip, transferencia, anticipo, gift card', 'metodo'),
  ('dw_fact_citas', 'hecho', 'cita', 'Una fila por cita: estado, origen, precio, espera, banderas atendida/no asistió/cancelada', 'cita_id'),
  ('dw_fact_ventas', 'hecho', 'línea de venta', 'Una fila por renglón de ticket cobrado: importe bruto, descuento, base neta, IVA', 'linea_id'),
  ('dw_fact_pagos', 'hecho', 'pago', 'Pagos por método aplicados a ventas cobradas', 'pago_id'),
  ('dw_fact_ingresos', 'hecho', 'ingreso', 'Ingresos del módulo de finanzas por clasificación y forma de pago', 'ingreso_id'),
  ('dw_fact_gastos', 'hecho', 'gasto', 'Gastos no anulados por grupo, proveedor y método de pago', 'gasto_id'),
  ('dw_fact_inventario_mov', 'hecho', 'movimiento de inventario', 'Compras, ventas, ajustes, mermas y traspasos con costo', 'movimiento_id'),
  ('dw_fact_existencias', 'hecho', 'existencia (foto actual)', 'Existencia por sede y producto, mínimo, valuación y bandera bajo mínimo', 'existencia_id'),
  ('dw_fact_consultas', 'hecho', 'consulta', 'Consultas clínicas con diagnósticos, procedimientos y firma', 'consulta_id'),
  ('dw_fact_asistencia', 'hecho', 'asistencia', 'Jornada del personal: minutos trabajados y retardo', 'asistencia_id'),
  ('dw_fact_comisiones', 'hecho', 'comisión', 'Comisiones calculadas por empleado', 'comision_id'),
  ('dw_fact_cuentas_pagar', 'hecho', 'cuenta por pagar', 'Facturas de proveedor con saldo y vencimiento', 'cxp_id'),
  ('dw_fact_quejas', 'hecho', 'queja', 'Quejas y su resolución', 'queja_id'),
  ('dw_fact_encuestas', 'hecho', 'encuesta respondida', 'Calificación de satisfacción', 'encuesta_id'),
  ('dw_kpi_mensual_sede', 'tablero', 'sede × mes', 'Citas, no-show, ventas, ticket, ingresos, gastos, utilidad, calificación, comisiones, horas', 'sede_id, anio_mes'),
  ('dw_kpi_mensual_org', 'tablero', 'organización × mes', 'Consolidado mensual de la clínica con margen', 'anio_mes'),
  ('dw_kpi_servicio_mes', 'tablero', 'servicio × sede × mes', 'Tickets, unidades, ventas y descuentos por servicio', 'servicio_id, sede_id, anio_mes'),
  ('dw_kpi_producto_mes', 'tablero', 'producto × sede × mes', 'Unidades, ventas y margen por producto', 'producto_id, sede_id, anio_mes'),
  ('dw_kpi_podologo_mes', 'tablero', 'podólogo × mes', 'Productividad: atendidas, no-show, ingreso atendido, espera', 'podologo_id, anio_mes'),
  ('dw_kpi_metodo_pago_mes', 'tablero', 'método × sede × mes', 'Mezcla de medios de pago', 'metodo, sede_id, anio_mes'),
  ('dw_kpi_gasto_grupo_mes', 'tablero', 'grupo de gasto × sede × mes', 'Gasto por grupo', 'grupo, sede_id, anio_mes'),
  ('dw_kpi_inventario', 'tablero', 'sede × categoría', 'Productos, bajo mínimo y valuación', 'sede_id, categoria'),
  ('dw_kpi_pacientes', 'tablero', 'perfil de paciente', 'Pacientes por grupo de edad, sexo, diabetes y canal', 'grupo_edad, sexo, diabetes, canal_origen'),
  ('dw_kpi_resumen', 'tablero', 'métrica', 'Mes actual vs mes anterior y acumulado del año', 'metrica')
) v(objeto, tipo, grano, descripcion, llaves);

create or replace view piefirme.dw_metricas with (security_invoker = true) as
select * from (values
  ('ventas', 'Σ base_neta de líneas de ventas cobradas (sin IVA)', 'dw_fact_ventas', 'MXN'),
  ('tickets', 'Conteo distinto de ventas cobradas', 'dw_fact_ventas', 'tickets'),
  ('ticket_promedio', 'ventas ÷ tickets', 'dw_kpi_mensual_sede', 'MXN'),
  ('ingresos', 'Σ importe de ingresos − reembolsos', 'dw_fact_ingresos', 'MXN'),
  ('gastos', 'Σ total de gastos no anulados', 'dw_fact_gastos', 'MXN'),
  ('utilidad', 'ingresos − gastos', 'dw_kpi_mensual_sede', 'MXN'),
  ('margen_pct', '100 × utilidad ÷ ingresos', 'dw_kpi_mensual_org', '%'),
  ('citas_agendadas', 'Conteo de citas del mes (todos los estados)', 'dw_fact_citas', 'citas'),
  ('citas_atendidas', 'Citas en estado atendida', 'dw_fact_citas', 'citas'),
  ('no_shows', 'Citas en estado no_asistio', 'dw_fact_citas', 'citas'),
  ('tasa_no_show_pct', '100 × no_shows ÷ (citas agendadas − canceladas)', 'dw_kpi_mensual_sede', '%'),
  ('pacientes_primera_vez', 'Citas atendidas con primera_vez = verdadero', 'dw_fact_citas', 'pacientes'),
  ('consultas', 'Conteo de consultas clínicas', 'dw_fact_consultas', 'consultas'),
  ('calificacion_promedio', 'Promedio de calificación de encuestas respondidas', 'dw_fact_encuestas', '1-5'),
  ('espera_promedio_min', 'Promedio de (inicio de atención − llegada) en minutos', 'dw_fact_citas', 'min'),
  ('valuacion', 'Σ existencia × costo promedio', 'dw_fact_existencias', 'MXN'),
  ('bajo_minimo', 'Productos con existencia < mínimo', 'dw_fact_existencias', 'productos'),
  ('comisiones', 'Σ comisión calculada', 'dw_fact_comisiones', 'MXN'),
  ('horas_trabajadas', 'Σ minutos trabajados ÷ 60', 'dw_fact_asistencia', 'h'),
  ('cxp_vencidas', 'Cuentas por pagar con saldo > 0 y vencimiento < hoy', 'dw_fact_cuentas_pagar', 'cuentas')
) v(metrica, formula, fuente, unidad);

-- Solo lectura para la API: el warehouse no se escribe nunca
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'piefirme' and viewname like 'dw\_%' and viewname not like 'dw\_calc\_%' loop
    execute format('revoke all on piefirme.%I from anon', v.viewname);
    execute format('revoke insert, update, delete, truncate on piefirme.%I from authenticated', v.viewname);
    execute format('grant select on piefirme.%I to authenticated, service_role', v.viewname);
  end loop;
end $$;

-- ───────────────────────────── rendimiento de la bitácora ─────────────────────────────
-- La política original evaluaba es_admin() fila por fila: para un no-administrador recorría toda la bitácora (cientos de miles de filas) antes de
-- devolver cero y agotaba el tiempo. Con (select …) el planificador lo resuelve una vez y corta de inmediato. Mismo criterio de acceso.
drop policy if exists bit_sel on piefirme.bitacora;
create policy bit_sel on piefirme.bitacora for select to authenticated
  using ((select piefirme_app.es_admin()) and organizacion_id = (select piefirme_app.org_id()));
