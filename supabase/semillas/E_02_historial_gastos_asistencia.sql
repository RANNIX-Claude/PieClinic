-- Semilla E_02 · HISTORIAL de gastos (renta, luz, internet, publicidad, nómina, comisiones) y checadas del personal para nov-2025 → jul-2026,
-- de modo que gastos, utilidad y asistencia también tengan 12 meses (C_02 y D_01 solo cubren ago → oct-2026). Misma estructura que C_02/D_01.
-- Requiere C_01/C_02/D_01 y E_01 (la nómina y las comisiones se calculan como % de los ingresos del mes: 14 % y 4.5 %, de ejemplo).
-- Idempotente: si ya hay gastos de la organización antes del 1-ago-2026, el bloque de gastos no se repite; las checadas usan on conflict.
-- Rol que omita RLS; simula al administrador con request.jwt.claim.sub. Todo sintético.

do $$
declare
  o   constant uuid := '00000000-0000-0000-0000-00000000c0de';
  adm constant uuid := 'a0000000-0000-0000-0000-000000000001';
  g_ren uuid; g_ser uuid; g_nom uuid; g_pub uuid; p_rentas uuid; p_energia uuid; p_telecom uuid; v_n int;
begin
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('app.ignorar_cierre', 'on', true);

  select id into g_ren from piefirme.grupos_gasto where organizacion_id = o and clave = 'renta';
  select id into g_ser from piefirme.grupos_gasto where organizacion_id = o and clave = 'servicios';
  select id into g_nom from piefirme.grupos_gasto where organizacion_id = o and clave = 'nomina_personal';
  select id into g_pub from piefirme.grupos_gasto where organizacion_id = o and clave = 'publicidad';
  select id into p_rentas from piefirme.proveedores where organizacion_id = o and clave = 'RENTAS';
  select id into p_energia from piefirme.proveedores where organizacion_id = o and clave = 'ENERGIA';
  select id into p_telecom from piefirme.proveedores where organizacion_id = o and clave = 'TELECOM';

  if not exists (select 1 from piefirme.gastos where organizacion_id = o and fecha < date '2026-08-01') then
    -- renta (con IVA y CFDI)
    insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, cfdi_uuid, tiene_factura, factura_url, descripcion, origen_captura, estado)
    select o, s.id, m.d + 2, p_rentas, g_ren, 'transferencia', r.monto, round(r.monto * 0.16, 2), round(r.monto * 1.16, 2),
           'RENTA-' || s.clave || '-' || to_char(m.d, 'YYMM'), upper(substr(md5('renta' || s.clave || m.d::text), 1, 8) || '-' || substr(md5('renta' || s.clave || m.d::text), 9, 4) || '-4000-a000-' || substr(md5('renta' || s.clave || m.d::text), 13, 12)),
           true, o::text || '/gastos/renta-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Renta ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
      from piefirme.sedes s
      cross join (select d::date from generate_series(date '2025-11-01', date '2026-07-01', interval '1 month') d) m(d)
      join (values ('CHA', 7500), ('CEN', 9000), ('GAL', 11000), ('PAT', 8500), ('SEN', 7000)) r(clave, monto) on r.clave = s.clave
     where s.organizacion_id = o;

    -- luz
    insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, tiene_factura, factura_url, descripcion, origen_captura, estado)
    select o, s.id, m.d + 11, p_energia, g_ser, 'transferencia', x.sub, round(x.sub * 0.16, 2), round(x.sub * 1.16, 2), 'LUZ-' || s.clave || '-' || to_char(m.d, 'YYMM'), true,
           o::text || '/gastos/luz-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Energía eléctrica ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
      from piefirme.sedes s cross join (select d::date from generate_series(date '2025-11-01', date '2026-07-01', interval '1 month') d) m(d)
      cross join lateral (select (1500 + abs(hashtext(s.clave || m.d::text)) % 1100)::numeric as sub) x
     where s.organizacion_id = o;

    -- internet y telefonía
    insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, tiene_factura, factura_url, descripcion, origen_captura, estado)
    select o, s.id, m.d + 7, p_telecom, g_ser, 'tarjeta_clinica', 899, 143.84, 1042.84, 'NET-' || s.clave || '-' || to_char(m.d, 'YYMM'), true,
           o::text || '/gastos/net-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Internet y telefonía ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
      from piefirme.sedes s cross join (select d::date from generate_series(date '2025-11-01', date '2026-07-01', interval '1 month') d) m(d) where s.organizacion_id = o;

    -- publicidad (por debajo de $2,000 para no exigir CFDI)
    insert into piefirme.gastos (organizacion_id, sede_id, fecha, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, tiene_factura, factura_url, descripcion, origen_captura, estado)
    select o, s.id, m.d + 4, g_pub, 'tarjeta_clinica', x.sub, round(x.sub * 0.16, 2), round(x.sub * 1.16, 2), 'PUB-' || s.clave || '-' || to_char(m.d, 'YYMM'), true,
           o::text || '/gastos/pub-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Publicidad en redes ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
      from piefirme.sedes s cross join (select d::date from generate_series(date '2025-11-01', date '2026-07-01', interval '1 month') d) m(d)
      cross join lateral (select (700 + abs(hashtext('pub' || s.clave || m.d::text)) % 950)::numeric as sub) x
     where s.organizacion_id = o;

    -- nómina (dos quincenas) y comisiones (mensual) como % de los ingresos del mes
    insert into piefirme.gastos (organizacion_id, sede_id, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
    select o, b.sede_id, q.f, g_nom, 'transferencia', round(0.14 * b.base, 2), 0, round(0.14 * b.base, 2),
           'Nómina ' || q.etq || ' · ' || to_char(b.mes, 'YYYY-MM') || ' (sintética)', 'sistema', 'nomina', 'guardado'
      from (select i.sede_id, date_trunc('month', i.fecha_pago)::date as mes,
                   sum(case when i.es_reembolso then -(i.importe - i.iva) else i.importe - i.iva end) as base
              from piefirme.ingresos i where i.organizacion_id = o and i.fecha_pago < date '2026-08-01' group by 1, 2) b
      cross join lateral (values (b.mes + 14, '1.ª quincena'), ((b.mes + interval '1 month')::date - 1, '2.ª quincena')) q(f, etq)
     where b.base > 0 and b.mes >= date '2025-11-01';
    insert into piefirme.gastos (organizacion_id, sede_id, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
    select o, b.sede_id, (b.mes + interval '1 month')::date - 1, g_nom, 'transferencia', round(0.045 * b.base, 2), 0, round(0.045 * b.base, 2),
           'Comisiones de podólogos ' || to_char(b.mes, 'YYYY-MM') || ' (sintético)', 'sistema', 'comisiones', 'guardado'
      from (select i.sede_id, date_trunc('month', i.fecha_pago)::date as mes,
                   sum(case when i.es_reembolso then -(i.importe - i.iva) else i.importe - i.iva end) as base
              from piefirme.ingresos i where i.organizacion_id = o and i.fecha_pago < date '2026-08-01' group by 1, 2) b
     where b.base > 0 and b.mes >= date '2025-11-01';
    get diagnostics v_n = row_count;
    raise notice 'E_02: gastos de historial cargados (última tanda: % comisiones)', v_n;
  end if;

  -- checadas: lunes a sábado, ~70 % puntual, ~20 % retardo leve, ~10 % largo, ~3 % faltas (se consolidan solas en asistencia por trigger)
  with dias as (
    select e.id as emp, e.organizacion_id as org, e.sede_id as sede, d::date as fecha, abs(hashtext(e.id::text || d::date::text)) as h
      from piefirme.empleados e, generate_series(date '2025-11-03', date '2026-08-01', interval '1 day') d
     where e.organizacion_id = o and extract(isodow from d) <= 6 and e.fecha_ingreso <= d::date
  ), marcas as (
    select emp, org, sede, fecha,
           (fecha + time '09:00' + make_interval(mins => case when h % 100 < 70 then (h / 7) % 9 - 6 when h % 100 < 90 then 6 + (h / 7) % 7 else 15 + (h / 7) % 16 end)) as entrada,
           (fecha + case when extract(isodow from fecha) = 6 then time '14:00' else time '18:00' end + make_interval(mins => (h / 11) % 12)) as salida
      from dias where h % 100 >= 3
  )
  insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, operacion, fecha_hora, origen)
  select org, sede, emp, 'entrada', entrada at time zone 'America/Mexico_City', 'importacion' from marcas
  union all
  select org, sede, emp, 'salida', salida at time zone 'America/Mexico_City', 'importacion' from marcas
  on conflict (organizacion_id, empleado_id, fecha_hora, operacion) do nothing;
end $$;
