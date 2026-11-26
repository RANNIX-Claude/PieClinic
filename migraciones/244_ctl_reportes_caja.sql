-- 244 · Control y Auditoría · ETAPA 6 · REPORTES DE CAJA (F1.2 ventas por debajo de catálogo, F1.5 aperturas de cajón sin venta, F1.6 mezcla de formas de pago).
-- Se leen SOLO por las vistas del contrato del origen (v_ctl_ventas, v_ctl_pagos), que ya filtran por «ver_directo»: por eso los reportes de caja son de dueño y
-- supervisor (sus sucursales); el soporte RANNIX no lee ventas crudas (D7) y el rol de sucursal recibe PF403. Cada consulta queda en ctl_bitacora_consulta.
-- LO QUE EL ORIGEN AÚN NO DA (documentado para la Etapa 1; los reportes lo declaran en pantalla en vez de inventarlo):
--   · v_ctl_ventas no trae precio de catálogo para SERVICIOS (solo productos): el reporte de ventas bajo catálogo cubre productos.
--   · El motivo de descuento es texto libre (no hay catálogo cerrado de motivos ni tope porcentual con clave de supervisor).
--   · El precio todavía es editable en caja (la Etapa 1 lo cierra): estas diferencias son justo lo que detecta este reporte.
--   · El evento «cajon_abierto_sin_venta» no se emite todavía: el reporte de cajón responde con estado vacío honesto (origen_activo = false).
-- Depende de: 200–206, 240, 241.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── F1.2 · ventas por debajo de catálogo ─────────────────────────────
-- Filtros: desde, hasta (por omisión 30 días) · sucursales[] | sucursal · cajero · orden (monto | fecha) · limite (≤ 500) · offset · exportar (hasta 20,000 filas).
create or replace function piefirme.ctl_rep_ventas_bajo_catalogo(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.ctl_exigir('ver_directo'); f jsonb := coalesce(p_filtros, '{}'::jsonb); t0 timestamptz := clock_timestamp();
  r record; v_sedes uuid[]; v_cajero uuid := nullif(f ->> 'cajero', '')::uuid; v_orden text := coalesce(nullif(f ->> 'orden', ''), 'monto');
  v_exp boolean := coalesce((f ->> 'exportar')::boolean, false); v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0); v_lim integer; v_res jsonb; v_n integer;
begin
  if v_orden not in ('monto', 'fecha') then raise exception 'Orden no válido: %', v_orden using errcode = 'PF422'; end if;
  v_lim := case when v_exp then 20000 else least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 100), 1), 500) end;
  select * into r from piefirme_app.ctl_rango(v_org, f, 30);
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);

  with fl as materialized (
    select v.linea_id, v.venta_id, v.ticket, v.fecha_hora, v.sucursal_id, sd.nombre as sucursal, v.caja, v.usuario_id, v.descripcion as producto, v.producto_id, v.cantidad,
           v.precio_catalogo_al_momento as catalogo, round(v.importe / v.cantidad, 2) as cobrado,
           round(v.precio_catalogo_al_momento * v.cantidad - v.importe, 2) as diferencia, v.motivo_descuento as motivo, v.autorizador
      from piefirme.v_ctl_ventas v join piefirme.sedes sd on sd.id = v.sucursal_id
     where v.fecha_hora >= r.v_ini and v.fecha_hora < r.v_fin and v.sucursal_id = any (v_sedes) and v.estado in ('cobrada', 'por_facturar', 'facturada')
       and v.tipo_linea = 'producto' and v.cantidad > 0 and v.precio_catalogo_al_momento is not null
       and v.importe / v.cantidad < v.precio_catalogo_al_momento - 0.005 and (v_cajero is null or v.usuario_id = v_cajero)
  )
  select jsonb_build_object(
    'totales', (select jsonb_build_object('lineas', count(*), 'tickets', count(distinct venta_id), 'monto', coalesce(sum(diferencia), 0),
                                         'sin_motivo_ni_autorizador', count(*) filter (where coalesce(btrim(motivo), '') = '' and autorizador is null)) from fl),
    'total_filas', (select count(*) from fl),
    'filas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n), '[]'::jsonb) from (
        select row_number() over (order by (case when v_orden = 'monto' then g.diferencia end) desc nulls last, (case when v_orden = 'fecha' then g.fecha_hora end) desc nulls last, g.linea_id) as n,
               g.ticket, g.venta_id, g.fecha_hora, g.sucursal_id, g.sucursal, g.caja, g.usuario_id as cajero_id, piefirme_app.ctl_nombre_usuario(g.usuario_id) as cajero, g.producto, g.cantidad,
               g.catalogo, g.cobrado, g.diferencia, round((g.catalogo - g.cobrado) * 100 / nullif(g.catalogo, 0), 1) as pct_debajo, g.motivo,
               piefirme_app.ctl_nombre_usuario(g.autorizador) as autorizador
          from fl g
         order by (case when v_orden = 'monto' then g.diferencia end) desc nulls last, (case when v_orden = 'fecha' then g.fecha_hora end) desc nulls last, g.linea_id
         offset v_off limit v_lim) x),
    'por_cajero', (select coalesce(jsonb_agg(to_jsonb(x) order by x.monto desc), '[]'::jsonb) from (
        select usuario_id as cajero_id, coalesce(piefirme_app.ctl_nombre_usuario(usuario_id), 'Sin cajero') as cajero, count(*) as lineas, count(distinct venta_id) as tickets,
               sum(diferencia) as monto, string_agg(distinct sucursal, ', ') as sucursales from fl group by usuario_id) x),
    'por_sucursal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.monto desc), '[]'::jsonb) from (
        select sucursal_id, sucursal, count(*) as lineas, count(distinct venta_id) as tickets, sum(diferencia) as monto from fl group by sucursal_id, sucursal) x),
    'limitaciones', jsonb_build_array(
      'El origen solo expone el precio de catálogo de PRODUCTOS: las ventas de servicios por debajo de su precio no aparecen aquí hasta que la Etapa 1 lo exponga.',
      'El motivo de descuento es texto libre: la Etapa 1 instala el catálogo cerrado de motivos con tope porcentual y clave de supervisor.',
      'El autorizador solo aparece cuando el descuento quedó registrado con una autorización; una diferencia sin motivo ni autorizador es la que más conviene revisar.')
  ) into v_res;
  v_n := (v_res ->> 'total_filas')::integer;
  perform piefirme_app.ctl_log_consulta(v_org, case when v_exp then 'ventas_bajo_catalogo:exportar' else 'ventas_bajo_catalogo' end,
                                        f || jsonb_build_object('desde_efectivo', r.v_desde, 'hasta_efectivo', r.v_hasta, 'filas_resultado', v_n));
  return v_res || jsonb_build_object('ok', true, 'periodo', jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta), 'truncado', v_exp and v_n > v_lim, 'limite', v_lim, 'offset', v_off,
                                     'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000));
end $$;

-- ───────────────────────────── F1.5 · aperturas de cajón sin venta ─────────────────────────────
-- Por cajero y por sucursal, con comparativo entre tiendas (aperturas por cada 100 tickets cobrados contra el promedio de la cadena).
-- Si el origen todavía no emite el evento: origen_activo = false y todo en cero (estado vacío honesto en pantalla).
create or replace function piefirme.ctl_rep_cajon(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.ctl_exigir('ver_directo'); f jsonb := coalesce(p_filtros, '{}'::jsonb); t0 timestamptz := clock_timestamp();
  r record; v_sedes uuid[]; v_cajero uuid := nullif(f ->> 'cajero', '')::uuid; v_activo boolean; v_res jsonb; v_aperturas integer; v_tickets integer; v_prom numeric;
  v_exp boolean := coalesce((f ->> 'exportar')::boolean, false); v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0); v_lim integer;
begin
  v_lim := case when v_exp then 20000 else least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 100), 1), 500) end;
  select * into r from piefirme_app.ctl_rango(v_org, f, 30);
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);
  v_activo := exists (select 1 from piefirme.ctl_eventos_entrada e where e.organizacion_id = v_org and e.evento = 'cajon_abierto_sin_venta')
              or exists (select 1 from piefirme.ctl_apertura_cajon a where a.organizacion_id = v_org);

  with ap as materialized (
    select a.id, a.sucursal_id, sd.nombre as sucursal, a.usuario_id, a.caja, a.motivo, a.abierta_en
      from piefirme.ctl_apertura_cajon a join piefirme.sedes sd on sd.id = a.sucursal_id
     where a.organizacion_id = v_org and a.abierta_en >= r.v_ini and a.abierta_en < r.v_fin and a.sucursal_id = any (v_sedes) and (v_cajero is null or a.usuario_id = v_cajero)
  ), tk as materialized (
    select v.sucursal_id, v.usuario_id, count(distinct v.venta_id) as tickets
      from piefirme.v_ctl_ventas v
     where v.fecha_hora >= r.v_ini and v.fecha_hora < r.v_fin and v.sucursal_id = any (v_sedes) and v.estado in ('cobrada', 'por_facturar', 'facturada')
     group by v.sucursal_id, v.usuario_id
  ), suc as (
    select s.id as sucursal_id, s.nombre as sucursal, count(a.id) as aperturas, count(distinct a.usuario_id) as cajeros,
           coalesce((select sum(t.tickets) from tk t where t.sucursal_id = s.id), 0) as tickets
      from piefirme.sedes s left join ap a on a.sucursal_id = s.id where s.organizacion_id = v_org and s.id = any (v_sedes) and s.activa group by s.id, s.nombre
  )
  select (select count(*) from ap), coalesce((select sum(tickets) from suc), 0) into v_aperturas, v_tickets;
  v_prom := case when v_tickets > 0 then round(v_aperturas * 100.0 / v_tickets, 2) end;

  with ap as materialized (
    select a.id, a.sucursal_id, sd.nombre as sucursal, a.usuario_id, a.caja, a.motivo, a.abierta_en
      from piefirme.ctl_apertura_cajon a join piefirme.sedes sd on sd.id = a.sucursal_id
     where a.organizacion_id = v_org and a.abierta_en >= r.v_ini and a.abierta_en < r.v_fin and a.sucursal_id = any (v_sedes) and (v_cajero is null or a.usuario_id = v_cajero)
  ), tk as materialized (
    select v.sucursal_id, v.usuario_id, count(distinct v.venta_id) as tickets
      from piefirme.v_ctl_ventas v
     where v.fecha_hora >= r.v_ini and v.fecha_hora < r.v_fin and v.sucursal_id = any (v_sedes) and v.estado in ('cobrada', 'por_facturar', 'facturada')
     group by v.sucursal_id, v.usuario_id
  )
  select jsonb_build_object(
    'origen_activo', v_activo, 'aperturas', v_aperturas, 'tickets', v_tickets, 'promedio_por_100_tickets', v_prom, 'total_filas', v_aperturas,
    'por_sucursal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.aperturas desc, x.sucursal), '[]'::jsonb) from (
        select s.id as sucursal_id, s.nombre as sucursal, (select count(*) from ap a where a.sucursal_id = s.id) as aperturas,
               (select count(distinct a.usuario_id) from ap a where a.sucursal_id = s.id) as cajeros, coalesce((select sum(t.tickets) from tk t where t.sucursal_id = s.id), 0) as tickets,
               case when coalesce((select sum(t.tickets) from tk t where t.sucursal_id = s.id), 0) > 0
                    then round((select count(*) from ap a where a.sucursal_id = s.id) * 100.0 / (select sum(t.tickets) from tk t where t.sucursal_id = s.id), 2) end as por_100_tickets
          from piefirme.sedes s where s.organizacion_id = v_org and s.id = any (v_sedes) and s.activa) x),
    'por_cajero', (select coalesce(jsonb_agg(to_jsonb(x) order by x.aperturas desc, x.cajero), '[]'::jsonb) from (
        select a.usuario_id as cajero_id, coalesce(piefirme_app.ctl_nombre_usuario(a.usuario_id), 'Sin usuario') as cajero, count(*) as aperturas, string_agg(distinct a.sucursal, ', ') as sucursales,
               coalesce((select sum(t.tickets) from tk t where t.usuario_id = a.usuario_id), 0) as tickets,
               case when coalesce((select sum(t.tickets) from tk t where t.usuario_id = a.usuario_id), 0) > 0
                    then round(count(*) * 100.0 / (select sum(t.tickets) from tk t where t.usuario_id = a.usuario_id), 2) end as por_100_tickets
          from ap a group by a.usuario_id) x),
    'filas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.abierta_en desc), '[]'::jsonb) from (
        select a.id, a.abierta_en, a.sucursal_id, a.sucursal, a.caja, piefirme_app.ctl_nombre_usuario(a.usuario_id) as cajero, a.motivo from ap a order by a.abierta_en desc offset v_off limit v_lim) x),
    'nota', 'Una apertura de cajón sin venta puede tener una razón válida (dar cambio, abrir para contar). El comparativo entre tiendas es un indicador para investigar, no un hallazgo.',
    'aviso_origen', case when v_activo then null else 'El punto de venta todavía no emite el evento «cajón abierto sin venta» (cambio de la Etapa 1 en el origen). El reporte y la tabla están listos: en cuanto el origen lo emita, aparecerán aquí las aperturas por cajero y sucursal.' end
  ) into v_res;
  perform piefirme_app.ctl_log_consulta(v_org, case when v_exp then 'cajon_sin_venta:exportar' else 'cajon_sin_venta' end,
                                        f || jsonb_build_object('desde_efectivo', r.v_desde, 'hasta_efectivo', r.v_hasta, 'filas_resultado', v_aperturas));
  return v_res || jsonb_build_object('ok', true, 'periodo', jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta), 'truncado', v_exp and v_aperturas > v_lim, 'limite', v_lim, 'offset', v_off,
                                     'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000));
end $$;

-- ───────────────────────────── F1.6 · mezcla de formas de pago ─────────────────────────────
-- Proporción efectivo / tarjeta / otros POR MONTO, por sucursal y por cajero, con el promedio de la cadena como referencia.
-- «tarjeta» = tarjeta + terminal Clip · «otros» = transferencia, anticipo, gift card. SIEMPRE se presenta como indicador para investigar: el perfil de clientela varía
-- entre zonas y este reporte no prueba nada por sí solo. Una desviación solo se marca con muestra suficiente (minimo_tickets, 30 por omisión; la operación vende
-- menos de diez tickets diarios por tienda, así que un periodo corto no basta).
-- Filtros: desde, hasta (por omisión 30 días) · sucursales[] | sucursal · cajero · minimo_tickets · umbral_pp (puntos porcentuales de desviación, 15 por omisión).
create or replace function piefirme.ctl_rep_mezcla_pago(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.ctl_exigir('ver_directo'); f jsonb := coalesce(p_filtros, '{}'::jsonb); t0 timestamptz := clock_timestamp();
  r record; v_sedes uuid[]; v_cajero uuid := nullif(f ->> 'cajero', '')::uuid; v_min integer := greatest(coalesce(nullif(f ->> 'minimo_tickets', '')::integer, 30), 1);
  v_umbral numeric := greatest(coalesce(nullif(f ->> 'umbral_pp', '')::numeric, 15), 1); v_res jsonb;
begin
  select * into r from piefirme_app.ctl_rango(v_org, f, 30);
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);

  with m as materialized (
    select p.venta_id, p.sucursal_id, sd.nombre as sucursal, p.usuario_id,
           coalesce(sum(p.monto) filter (where p.metodo = 'efectivo'), 0) as efectivo, coalesce(sum(p.monto) filter (where p.metodo in ('tarjeta', 'clip')), 0) as tarjeta,
           coalesce(sum(p.monto) filter (where p.metodo not in ('efectivo', 'tarjeta', 'clip')), 0) as otros
      from piefirme.v_ctl_pagos p join piefirme.sedes sd on sd.id = p.sucursal_id
     where p.fecha_hora >= r.v_ini and p.fecha_hora < r.v_fin and p.sucursal_id = any (v_sedes) and p.estado in ('cobrada', 'por_facturar', 'facturada') and (v_cajero is null or p.usuario_id = v_cajero)
     group by p.venta_id, p.sucursal_id, sd.nombre, p.usuario_id
  ), cad as (
    select count(*) as tickets, coalesce(sum(efectivo), 0) as efectivo, coalesce(sum(tarjeta), 0) as tarjeta, coalesce(sum(otros), 0) as otros,
           round(sum(efectivo) * 100 / nullif(sum(efectivo + tarjeta + otros), 0), 1) as pct_efectivo, round(sum(tarjeta) * 100 / nullif(sum(efectivo + tarjeta + otros), 0), 1) as pct_tarjeta
      from m
  )
  select jsonb_build_object(
    'cadena', (select to_jsonb(c) from cad c), 'minimo_tickets', v_min, 'umbral_pp', v_umbral,
    'por_sucursal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sucursal), '[]'::jsonb) from (
        select z.*, (z.tickets >= v_min) as muestra_suficiente, round(z.pct_efectivo - (select pct_efectivo from cad), 1) as desviacion_pp,
               (z.tickets >= v_min and (select pct_efectivo from cad) is not null and abs(z.pct_efectivo - (select pct_efectivo from cad)) >= v_umbral) as para_investigar
          from (select sucursal_id, sucursal, count(*) as tickets, sum(efectivo) as efectivo, sum(tarjeta) as tarjeta, sum(otros) as otros,
                       round(sum(efectivo) * 100 / nullif(sum(efectivo + tarjeta + otros), 0), 1) as pct_efectivo, round(sum(tarjeta) * 100 / nullif(sum(efectivo + tarjeta + otros), 0), 1) as pct_tarjeta
                  from m group by sucursal_id, sucursal) z) x),
    'por_cajero', (select coalesce(jsonb_agg(to_jsonb(x) order by x.cajero), '[]'::jsonb) from (
        select z.*, (z.tickets >= v_min) as muestra_suficiente, round(z.pct_efectivo - (select pct_efectivo from cad), 1) as desviacion_pp,
               (z.tickets >= v_min and (select pct_efectivo from cad) is not null and abs(z.pct_efectivo - (select pct_efectivo from cad)) >= v_umbral) as para_investigar
          from (select usuario_id as cajero_id, coalesce(piefirme_app.ctl_nombre_usuario(usuario_id), 'Sin cajero') as cajero, string_agg(distinct sucursal, ', ') as sucursales,
                       count(*) as tickets, sum(efectivo) as efectivo, sum(tarjeta) as tarjeta, sum(otros) as otros,
                       round(sum(efectivo) * 100 / nullif(sum(efectivo + tarjeta + otros), 0), 1) as pct_efectivo, round(sum(tarjeta) * 100 / nullif(sum(efectivo + tarjeta + otros), 0), 1) as pct_tarjeta
                  from m group by usuario_id) z) x),
    'aviso', 'Indicador para investigar, no un hallazgo: el perfil de clientela cambia entre zonas y este reporte no prueba nada por sí solo. Una desviación solo se marca con muestra suficiente; confírmela con el resto de los reportes antes de sacar conclusiones.'
  ) into v_res;
  perform piefirme_app.ctl_log_consulta(v_org, 'mezcla_pago', f || jsonb_build_object('desde_efectivo', r.v_desde, 'hasta_efectivo', r.v_hasta, 'tickets', (v_res -> 'cadena' ->> 'tickets')::integer));
  return v_res || jsonb_build_object('ok', true, 'periodo', jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta), 'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000));
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_rep_ventas_bajo_catalogo', 'ctl_rep_cajon', 'ctl_rep_mezcla_pago') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
