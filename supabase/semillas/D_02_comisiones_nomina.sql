-- D_02 · Semilla SINTÉTICA (dominio D): esquemas de comisión por podólogo, 3 periodos de comisiones (ago y sep cerrados, oct por cerrar),
-- metas, y prenómina quincenal (sep-1ª y sep-2ª pagadas, oct-1ª autorizada, oct-2ª creada).
-- Debe existir antes: migraciones 050-052 y la semilla D_01 (empleados y asistencia).
-- Los porcentajes (5 % servicio, 10 % producto, 5 % plan) son SOLO de ejemplo: en la clínica real los fija el cliente (P-106).
-- Los renglones de detalle son sintéticos y NO ligan cita_id/venta_id (columnas opcionales).

-- esquemas
insert into piefirme.esquemas_comision (organizacion_id, empleado_id, nombre, tipo, pct_servicio, pct_producto, pct_plan, viatico_por_cita, piso_periodo, vigente_desde, notas)
select e.organizacion_id, e.id,
       case e.numero_empleado when 'E009' then 'Porcentaje + viático (sintético)' when 'E005' then 'Porcentaje con piso (sintético)' else 'Porcentaje por tipo (sintético)' end,
       case e.numero_empleado when 'E009' then 'porcentaje_viatico' else 'porcentaje' end,
       5, 10, 5, case e.numero_empleado when 'E009' then 20 else 0 end, case e.numero_empleado when 'E005' then 3000 else 0 end, date '2026-01-01', 'Valores de ejemplo'
  from piefirme.empleados e
 where e.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and e.puesto = 'podologo'
on conflict (empleado_id, vigente_desde) do nothing;

-- periodos de comisiones
insert into piefirme.periodos_comision (organizacion_id, desde, hasta)
select '00000000-0000-0000-0000-00000000c0de', d::date, (d + interval '1 month - 1 day')::date
  from generate_series(date '2026-08-01', date '2026-10-01', interval '1 month') d
on conflict (organizacion_id, desde, hasta) do nothing;

-- detalle: 3 servicios por día laborable, un producto cada tercer día, una sesión de plan cada cuarto día (solo si el periodo sigue abierto)
with base as (
  select p.id as periodo, p.organizacion_id as org, e.id as emp, e.sede_id as sede, q.id as esq, q.pct_servicio, q.pct_producto, q.pct_plan, d::date as fecha,
         abs(hashtext(e.id::text || d::date::text)) as h
    from piefirme.periodos_comision p
    join piefirme.empleados e on e.organizacion_id = p.organizacion_id and e.puesto = 'podologo'
    join piefirme.esquemas_comision q on q.empleado_id = e.id and q.vigente_desde <= p.desde
    cross join lateral generate_series(p.desde::timestamp, least(p.hasta, date '2026-10-24')::timestamp, interval '1 day') d
   where p.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and p.estado = 'por_cerrar' and extract(isodow from d) <= 6
     and not exists (select 1 from piefirme.comision_detalle x where x.periodo_id = p.id)
), serv as (
  select b.*, g as n, (array[400, 530, 800, 300, 1200, 400, 400])[1 + (b.h / (g + 3)) % 7] as monto
    from base b, generate_series(1, 3) g
   where g <= 3 + b.h % 4 and g <= 3   -- hasta 3 renglones por día para mantener la semilla ligera
)
insert into piefirme.comision_detalle (organizacion_id, periodo_id, empleado_id, sede_id, fecha, tipo, concepto, base, pct, comision, esquema_id)
select org, periodo, emp, sede, fecha, 'servicio', 'Servicio clínico (sintético)', monto, pct_servicio, round(monto * pct_servicio / 100, 2), esq from serv
union all
select org, periodo, emp, sede, fecha, 'producto', 'Producto de cuidado (sintético)', 250, pct_producto, round(250 * pct_producto / 100, 2), esq from base where h % 3 = 0
union all
select org, periodo, emp, sede, fecha, 'plan', 'Sesión de plan multi-sesión (sintético)', 400, pct_plan, round(400 * pct_plan / 100, 2), esq from base where h % 4 = 0;

-- totales por podólogo
select piefirme_app.comisiones_recalcular(id) from piefirme.periodos_comision where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and estado = 'por_cerrar';
-- ago y sep se cierran (primero los totales, luego el periodo: un periodo cerrado ya no admite cambios)
update piefirme.comisiones_calculadas set estado = 'cerrado'
 where periodo_id in (select id from piefirme.periodos_comision where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and desde in (date '2026-08-01', date '2026-09-01'));
update piefirme.periodos_comision set estado = 'cerrado', cerrado_en = (hasta + 2)::timestamp at time zone 'America/Mexico_City'
 where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and desde in (date '2026-08-01', date '2026-09-01') and estado = 'por_cerrar';

-- metas del cuarto trimestre
insert into piefirme.metas (organizacion_id, sede_id, ambito, desde, hasta, meta_ocupacion, meta_ingreso)
select '00000000-0000-0000-0000-00000000c0de', s.id, 'sede', date '2026-10-01', date '2026-10-31', 80, 180000
  from piefirme.sedes s where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
   and not exists (select 1 from piefirme.metas m where m.sede_id = s.id and m.desde = date '2026-10-01');

-- periodos de nómina quincenales
insert into piefirme.periodos_nomina (organizacion_id, periodicidad, desde, hasta, fecha_pago)
select '00000000-0000-0000-0000-00000000c0de', 'quincenal', v.d::date, v.h::date, v.p::date
  from (values ('2026-09-01', '2026-09-15', '2026-09-15'), ('2026-09-16', '2026-09-30', '2026-09-30'), ('2026-10-01', '2026-10-15', '2026-10-15'), ('2026-10-16', '2026-10-31', '2026-10-31')) v(d, h, p)
on conflict (organizacion_id, periodicidad, desde, hasta) do nothing;

-- prenómina de las tres primeras quincenas (réplica SQL de piefirme.nomina_calcular_periodo para semilla: no hay sesión de administrador)
insert into piefirme.prenomina (organizacion_id, periodo_id, empleado_id, sede_id, esquema_contratacion, dias_trabajados, salario_periodo, comision, comisiones_ids, bono, desc_incidencias)
select p.organizacion_id, p.id, e.id, e.sede_id, e.esquema_contratacion,
       (select count(*) from piefirme.asistencia a where a.empleado_id = e.id and a.fecha between p.desde and p.hasta and a.estado in ('presente', 'retardo', 'justificada')),
       e.salario_periodo,
       coalesce((select sum(cc.comision_total) from piefirme.comisiones_calculadas cc join piefirme.periodos_comision pc on pc.id = cc.periodo_id
                  where cc.empleado_id = e.id and pc.estado = 'cerrado' and (pc.cerrado_en at time zone 'America/Mexico_City')::date between p.desde and p.hasta), 0),
       coalesce((select array_agg(cc.id) from piefirme.comisiones_calculadas cc join piefirme.periodos_comision pc on pc.id = cc.periodo_id
                  where cc.empleado_id = e.id and pc.estado = 'cerrado' and (pc.cerrado_en at time zone 'America/Mexico_City')::date between p.desde and p.hasta), '{}'),
       e.bono_periodo,
       round(coalesce((select sum(e.salario_periodo / (p.hasta - p.desde + 1) * (least(i.fecha_fin, p.hasta) - greatest(i.fecha, p.desde) + 1))
                         from piefirme.incidencias_rh i where i.empleado_id = e.id and i.descuenta and i.fecha <= p.hasta and i.fecha_fin >= p.desde), 0), 2)
  from piefirme.periodos_nomina p
  join piefirme.empleados e on e.organizacion_id = p.organizacion_id and e.estado = 'activo'
 where p.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and p.desde < date '2026-10-16' and p.estado = 'creado'
on conflict (periodo_id, empleado_id) do nothing;

update piefirme.periodos_nomina set estado = 'pagada', autorizado_en = hasta::timestamp, pagado_en = fecha_pago::timestamp where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and desde in (date '2026-09-01', date '2026-09-16') and estado = 'creado';
update piefirme.periodos_nomina set estado = 'autorizada', autorizado_en = hasta::timestamp where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and desde = date '2026-10-01' and estado = 'creado';
update piefirme.incidencias_rh set estado = 'aplicada' where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and descuenta and fecha < date '2026-10-16';
select piefirme_app.nomina_totales(id) from piefirme.periodos_nomina where organizacion_id = '00000000-0000-0000-0000-00000000c0de';
