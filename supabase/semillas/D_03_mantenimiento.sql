-- D_03 · Semilla SINTÉTICA (dominio D): equipos por sede, órdenes de trabajo de mantenimiento en todos los estatus y presupuesto del mes.
-- Debe existir antes: migraciones 050 y 053, semilla D_01 (organización y sedes). Proveedores (C) no son necesarios: la asignación va como texto/interna.
-- Las OT se crean como "solicitado" y avanzan con UPDATE; las semillas corren sin sesión (auth.uid() nulo = service_role), que el flujo acepta.

create or replace function pg_temp.sede(p text) returns uuid language sql as $$
  select id from piefirme.sedes
   where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and (clave = p or nombre ilike '%' || left(p, 5) || '%')
   order by (clave = p) desc limit 1
$$;

insert into piefirme.equipos (organizacion_id, sede_id, nombre, categoria, marca, modelo, serie, fecha_compra, ultimo_servicio, proximo_servicio, periodicidad_dias, estado)
select '00000000-0000-0000-0000-00000000c0de', pg_temp.sede(v.sede), v.nombre, v.cat, 'Marca Ejemplo', 'M-' || v.n, 'SINT-' || lpad(v.n::text, 4, '0'),
       date '2024-01-15', v.ult::date, v.prox::date, v.per, 'vigente'
  from (values
    (1, 'chalco',     'Autoclave 18 L',               'esterilizacion', '2026-07-20', '2026-10-20', 90),   -- vencido (próximo servicio < hoy)
    (2, 'centenario', 'Láser hongos 1064 nm',         'equipo_laser',   '2026-09-01', '2027-03-01', 180),
    (3, 'galerias',   'Torno / micromotor',           'instrumental',   '2026-08-10', '2026-11-10', 90),
    (4, 'patio',      'Lámpara de cabina 2',          'mobiliario',     '2026-06-01', '2026-12-01', 180),
    (5, 'sendero',    'Baropodómetro',                'instrumental',   '2026-05-15', '2026-11-15', 180),
    (6, 'centenario', 'Autoclave 18 L',               'esterilizacion', '2026-09-12', '2026-12-12', 90),
    (7, 'galerias',   'Autoclave 18 L',               'esterilizacion', '2026-08-30', '2026-11-30', 90),
    (8, 'patio',      'Autoclave 18 L',               'esterilizacion', '2026-09-05', '2026-12-05', 90),
    (9, 'sendero',    'Autoclave 18 L',               'esterilizacion', '2026-10-02', '2027-01-02', 90),
    (10,'chalco',     'Aire acondicionado recepción', 'instalaciones',  '2026-04-10', '2026-10-10', 180)   -- vencido
  ) v(n, sede, nombre, cat, ult, prox, per)
 where not exists (select 1 from piefirme.equipos q where q.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and q.serie = 'SINT-' || lpad(v.n::text, 4, '0'));

-- órdenes: folio por contador (OT-0001…); cada una avanza por su flujo
create or replace function pg_temp.nueva_ot(p_sede text, p_cat text, p_tipo text, p_equipo_serie text, p_desc text, p_fecha date, p_costo_est numeric)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into piefirme.ordenes_trabajo (organizacion_id, sede_id, fecha, categoria, tipo, equipo_id, descripcion, costo_estimado)
  values ('00000000-0000-0000-0000-00000000c0de', pg_temp.sede(p_sede), p_fecha, p_cat, p_tipo,
          (select id from piefirme.equipos where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and serie = p_equipo_serie), p_desc, p_costo_est)
  returning id into v_id;
  return v_id;
end $$;

do $$
declare a uuid;
begin
  if exists (select 1 from piefirme.ordenes_trabajo where organizacion_id = '00000000-0000-0000-0000-00000000c0de') then return; end if;

  -- 1 cerrada (preventivo)
  a := pg_temp.nueva_ot('chalco', 'esterilizacion', 'preventivo', 'SINT-0001', 'Servicio preventivo trimestral de autoclave', date '2026-07-18', 1500);
  update piefirme.ordenes_trabajo set estatus = 'autorizado', asignado_texto = 'Técnico externo (sintético)', programada_para = date '2026-07-20' where id = a;
  update piefirme.ordenes_trabajo set estatus = 'en_proceso' where id = a;
  update piefirme.ordenes_trabajo set estatus = 'cerrado', costo_real = 1450, fecha_cierre = date '2026-07-20', resultado = 'Servicio realizado, sin hallazgos' where id = a;

  -- 2 cerrada (normal)
  a := pg_temp.nueva_ot('centenario', 'instalaciones', 'normal', null, 'Cambio de chapa en cabina 2', date '2026-09-03', 800);
  update piefirme.ordenes_trabajo set estatus = 'autorizado', asignado_interno = true where id = a;
  update piefirme.ordenes_trabajo set estatus = 'cerrado', costo_real = 650, fecha_cierre = date '2026-09-05', resultado = 'Chapa sustituida' where id = a;

  -- 3 cerrada urgente, atendida antes de aprobar y regularizada
  a := pg_temp.nueva_ot('galerias', 'instrumental', 'urgente', 'SINT-0003', 'Falla del micromotor en consulta', date '2026-09-22', 1800);
  update piefirme.ordenes_trabajo set estatus = 'en_proceso', asignado_texto = 'Reparación externa (sintético)' where id = a;
  update piefirme.ordenes_trabajo set autorizacion_pendiente = false, autorizado_por = null, fecha_autorizacion = now(), nota_cambio = 'Autorización regularizada' where id = a;
  update piefirme.ordenes_trabajo set estatus = 'cerrado', costo_real = 1750, fecha_cierre = date '2026-09-25', resultado = 'Micromotor reparado' where id = a;

  -- 4 en proceso
  a := pg_temp.nueva_ot('sendero', 'instrumental', 'normal', 'SINT-0005', 'Calibración del baropodómetro', date '2026-10-15', 2500);
  update piefirme.ordenes_trabajo set estatus = 'autorizado', asignado_texto = 'Proveedor del equipo (sintético)', programada_para = date '2026-10-27' where id = a;
  update piefirme.ordenes_trabajo set estatus = 'en_proceso' where id = a;

  -- 5 autorizada
  a := pg_temp.nueva_ot('patio', 'mobiliario', 'normal', 'SINT-0004', 'Reemplazo de lámpara de cabina 2', date '2026-10-19', 1200);
  update piefirme.ordenes_trabajo set estatus = 'autorizado', asignado_interno = true, programada_para = date '2026-10-30' where id = a;

  -- 6 solicitada urgente (equipo pasa a falla)
  a := pg_temp.nueva_ot('chalco', 'esterilizacion', 'urgente', 'SINT-0001', 'Autoclave no alcanza temperatura', date '2026-10-23', 3200);

  -- 7 solicitada preventiva
  a := pg_temp.nueva_ot('chalco', 'instalaciones', 'preventivo', 'SINT-0010', 'Mantenimiento del aire acondicionado de recepción', date '2026-10-24', 900);

  -- 8 rechazada
  a := pg_temp.nueva_ot('galerias', 'mobiliario', 'normal', null, 'Compra de sillón adicional (no es mantenimiento)', date '2026-10-10', 6000);
  update piefirme.ordenes_trabajo set estatus = 'rechazado', motivo_rechazo = 'No corresponde a mantenimiento; pasar a compras' where id = a;

  -- el contador de folios sigue desde la última OT sembrada
  insert into piefirme.contadores_equipo (organizacion_id, clave, ultimo)
  values ('00000000-0000-0000-0000-00000000c0de', 'ot', (select count(*) from piefirme.ordenes_trabajo where organizacion_id = '00000000-0000-0000-0000-00000000c0de'))
  on conflict (organizacion_id, clave) do update set ultimo = excluded.ultimo;
end $$;

-- presupuesto mensual por sede (octubre 2026)
insert into piefirme.mantenimiento_presupuestos (organizacion_id, sede_id, mes, monto)
select s.organizacion_id, s.id, date '2026-10-01', 3000 from piefirme.sedes s where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
on conflict (sede_id, mes) do nothing;
