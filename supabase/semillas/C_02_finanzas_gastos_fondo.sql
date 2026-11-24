-- C_02 · Semilla SINTÉTICA (dominio C): cuentas bancarias, fondos revolventes por sede, gastos operativos de 3 meses (con comprobante desde $2,000), nómina y comisiones como gasto,
-- gastos compartidos prorrateables, pagos a proveedores y cierres semanales del fondo. Todo sintético (P-132).
-- DEBE EXISTIR ANTES: migraciones 001-049 · C_01 (proveedores y compras con sus cuentas por pagar) · B_00/B_02 (sedes, perfiles y los cobros que generan los ingresos
--   de caja; la nómina y las comisiones se calculan como % de esos ingresos: 14 % quincenal y 4.5 % mensual, de ejemplo). Si no hay ingresos, esta semilla genera cobros sintéticos
--   propios para que el EDR tenga números (ver bloque «respaldo»).
-- Rol que omita RLS; simula al administrador con request.jwt.claim.sub. Idempotente de forma gruesa: si ya hay cuentas bancarias, no hace nada.
-- Hoy = 25-oct-2026. Semanas sábado → viernes (P-088).

do $$
declare
  o   constant uuid := '00000000-0000-0000-0000-00000000c0de';
  adm constant uuid := 'a0000000-0000-0000-0000-000000000001';
  rec constant uuid := 'a0000000-0000-0000-0000-000000000002';
  hoy constant date := date '2026-10-25';
  v_c record; v_f record; v_cierre uuid; g_ren uuid; g_ser uuid; g_nom uuid; g_pub uuid; g_lic uuid; g_sus uuid; g_man uuid; g_com uuid; g_cmb uuid; p_rentas uuid; p_energia uuid; p_telecom uuid; p_medeq uuid;
  v_cta uuid;
begin
  if exists (select 1 from piefirme.cuentas_bancarias where organizacion_id = o) then
    raise notice 'C_02: ya aplicada'; return;
  end if;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('app.ignorar_cierre', 'on', true);

  select id into g_ren from piefirme.grupos_gasto where organizacion_id = o and clave = 'renta';
  select id into g_ser from piefirme.grupos_gasto where organizacion_id = o and clave = 'servicios';
  select id into g_nom from piefirme.grupos_gasto where organizacion_id = o and clave = 'nomina_personal';
  select id into g_pub from piefirme.grupos_gasto where organizacion_id = o and clave = 'publicidad';
  select id into g_lic from piefirme.grupos_gasto where organizacion_id = o and clave = 'licencias_permisos';
  select id into g_sus from piefirme.grupos_gasto where organizacion_id = o and clave = 'suscripcion_rannix';
  select id into g_man from piefirme.grupos_gasto where organizacion_id = o and clave = 'mantenimiento';
  select id into g_cmb from piefirme.grupos_gasto where organizacion_id = o and clave = 'combustible';
  select id into p_rentas from piefirme.proveedores where organizacion_id = o and clave = 'RENTAS';
  select id into p_energia from piefirme.proveedores where organizacion_id = o and clave = 'ENERGIA';
  select id into p_telecom from piefirme.proveedores where organizacion_id = o and clave = 'TELECOM';
  select id into p_medeq from piefirme.proveedores where organizacion_id = o and clave = 'MEDEQ';
  update piefirme.proveedores set alias = array[piefirme.proveedor_norm('Papelería Central')] where organizacion_id = o and clave = 'PAPEL';
  update piefirme.proveedores set alias = array[piefirme.proveedor_norm('Energia CFE sintetica')] where organizacion_id = o and clave = 'ENERGIA';

  -- ───────── cuentas bancarias: una general y una propia de Galerías (P-094) ─────────
  insert into piefirme.cuentas_bancarias (organizacion_id, sede_id, banco, alias, terminacion, titular)
  values (o, null, 'BBVA', 'Cuenta general', '4471', 'Pie Clinic (sintético)');
  insert into piefirme.cuentas_bancarias (organizacion_id, sede_id, banco, alias, terminacion, titular)
  select o, id, 'Banorte', 'Cuenta Galerías', '9902', 'Pie Clinic (sintético)' from piefirme.sedes where organizacion_id = o and clave = 'GAL';

  -- ───────── un fondo revolvente por sede, con monto base propio (P-095) ─────────
  insert into piefirme.fondos_revolventes (organizacion_id, sede_id, nombre, monto_base, responsable_id)
  select o, s.id, 'Fondo ' || s.nombre, case s.clave when 'GAL' then 4000 when 'SEN' then 2500 else 3000 end, rec
    from piefirme.sedes s where s.organizacion_id = o;

  -- ───────── respaldo: si la clínica no tiene cobros, se generan sintéticos (6 días por semana, 2 por sede) ─────────
  if not exists (select 1 from piefirme.ingresos where organizacion_id = o) then
    insert into piefirme.ingresos (organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, concepto, origen_registro)
    select o, s.id, d::date,
           (array['efectivo', 'tarjeta_clip', 'transferencia', 'efectivo', 'tarjeta_clip', 'tarjeta'])[1 + abs(hashtext(s.clave || d::text || k)) % 6],
           a.imp, case when a.prod then round(a.imp - a.imp / 1.16, 2) else 0 end, case when a.prod then 'producto' else 'servicio' end,
           'Cobro sintético (respaldo)', 'automatico'
      from piefirme.sedes s
      cross join generate_series(date '2026-08-01', date '2026-10-24', interval '1 day') d
      cross join generate_series(1, 2) k
      cross join lateral (select (array[400, 530, 800, 400, 700, 1200, 480, 350, 600])[1 + abs(hashtext(s.clave || d::text || k || 'm')) % 9]::numeric as imp,
                                 abs(hashtext(s.clave || d::text || k || 'p')) % 10 = 0 as prod) a
     where s.organizacion_id = o and extract(isodow from d) <> 7;
  end if;

  -- ───────── gastos fijos mensuales por sede ─────────
  -- renta (con IVA y CFDI)
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, cfdi_uuid, tiene_factura, factura_url, descripcion, origen_captura, estado)
  select o, s.id, m.d + 2, p_rentas, g_ren, 'transferencia', r.monto, round(r.monto * 0.16, 2), round(r.monto * 1.16, 2),
         'RENTA-' || s.clave || '-' || to_char(m.d, 'YYMM'), upper(substr(md5('renta' || s.clave || m.d::text), 1, 8) || '-' || substr(md5('renta' || s.clave || m.d::text), 9, 4) || '-4000-a000-' || substr(md5('renta' || s.clave || m.d::text), 13, 12)),
         true, o::text || '/gastos/renta-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Renta ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
    from piefirme.sedes s
    cross join (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d)
    join (values ('CHA', 7500), ('CEN', 9000), ('GAL', 11000), ('PAT', 8500), ('SEN', 7000)) r(clave, monto) on r.clave = s.clave
   where s.organizacion_id = o;

  -- luz e internet
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, tiene_factura, factura_url, descripcion, origen_captura, estado)
  select o, s.id, m.d + 11, p_energia, g_ser, 'transferencia', x.sub, round(x.sub * 0.16, 2), round(x.sub * 1.16, 2), 'LUZ-' || s.clave || '-' || to_char(m.d, 'YYMM'), true,
         o::text || '/gastos/luz-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Energía eléctrica ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
    from piefirme.sedes s cross join (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d)
    cross join lateral (select (1500 + abs(hashtext(s.clave || m.d::text)) % 1100)::numeric as sub) x
   where s.organizacion_id = o;
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, tiene_factura, factura_url, descripcion, origen_captura, estado)
  select o, s.id, m.d + 7, p_telecom, g_ser, 'tarjeta_clinica', 899, 143.84, 1042.84, 'NET-' || s.clave || '-' || to_char(m.d, 'YYMM'), true,
         o::text || '/gastos/net-' || s.clave || '-' || to_char(m.d, 'YYMM') || '.pdf', 'Internet y telefonía ' || to_char(m.d, 'YYYY-MM') || ' · ' || s.nombre, 'individual', 'guardado'
    from piefirme.sedes s cross join (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d) where s.organizacion_id = o;

  -- nómina (dos quincenas) y comisiones (mensual) a partir de los ingresos reales del mes: el módulo de equipo (D) registra su costo como gasto con origen_modulo
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
  select o, b.sede_id, q.f, g_nom, 'transferencia', round(0.14 * b.base, 2), 0, round(0.14 * b.base, 2),
         'Nómina ' || q.etq || ' · ' || to_char(b.mes, 'YYYY-MM') || ' (sintética)', 'sistema', 'nomina', 'guardado'
    from (select i.sede_id, date_trunc('month', i.fecha_pago)::date as mes,
                 sum(case when i.es_reembolso then -(i.importe - i.iva) else i.importe - i.iva end) as base
            from piefirme.ingresos i where i.organizacion_id = o group by 1, 2) b
    cross join lateral (values (b.mes + 14, '1.ª quincena'), ((b.mes + interval '1 month')::date - 1, '2.ª quincena')) q(f, etq)
   where q.f <= hoy and b.base > 0 and b.mes >= date '2026-08-01';
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
  select o, b.sede_id, (b.mes + interval '1 month')::date - 1, g_nom, 'transferencia', round(0.045 * b.base, 2), 0, round(0.045 * b.base, 2),
         'Comisiones de podólogos ' || to_char(b.mes, 'YYYY-MM') || ' (sintético)', 'sistema', 'comisiones', 'guardado'
    from (select i.sede_id, date_trunc('month', i.fecha_pago)::date as mes,
                 sum(case when i.es_reembolso then -(i.importe - i.iva) else i.importe - i.iva end) as base
            from piefirme.ingresos i where i.organizacion_id = o group by 1, 2) b
   where (b.mes + interval '1 month')::date - 1 <= hoy and b.base > 0 and b.mes >= date '2026-08-01';

  -- mantenimiento de autoclave (con CFDI porque pasa de $2,000)
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, cfdi_uuid, tiene_factura, factura_url, descripcion, origen_captura, origen_modulo, estado)
  select o, s.id, x.f, p_medeq, g_man, 'transferencia', 2400, 384, 2784, 'MANT-' || s.clave || '-' || to_char(x.f, 'YYMM'),
         upper(substr(md5('mant' || s.clave), 1, 8) || '-' || substr(md5('mant' || s.clave), 9, 4) || '-4000-a000-' || substr(md5('mant' || s.clave), 13, 12)), true,
         o::text || '/gastos/mant-' || s.clave || '-' || to_char(x.f, 'YYMM') || '.pdf', 'Servicio preventivo de autoclave', 'individual', 'mantenimiento', 'guardado'
    from piefirme.sedes s join (values ('CHA', date '2026-08-14'), ('GAL', date '2026-09-20')) x(clave, f) on x.clave = s.clave where s.organizacion_id = o;

  -- gastos compartidos de la clínica (se prorratean entre sedes por proporción de ingresos, P-092)
  insert into piefirme.gastos (organizacion_id, sede_id, compartido, fecha, proveedor_texto, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, tiene_factura, factura_url, descripcion, origen_captura, estado)
  select o, null, true, m.d + 9, 'Agencia Digital Sintética', g_pub, 'transferencia', 3500, 560, 4060, 'PUB-' || to_char(m.d, 'YYMM'), true,
         o::text || '/gastos/pub-' || to_char(m.d, 'YYMM') || '.pdf', 'Publicidad digital ' || to_char(m.d, 'YYYY-MM'), 'individual', 'guardado'
    from (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d);
  insert into piefirme.gastos (organizacion_id, sede_id, compartido, fecha, proveedor_texto, grupo_id, metodo_pago, subtotal, iva, total, tiene_factura, descripcion, origen_captura, estado)
  values (o, null, true, date '2026-08-05', 'Municipio (sintético)', g_lic, 'transferencia', 1800, 0, 1800, false, 'Licencia de funcionamiento (derechos)', 'individual', 'guardado');
  insert into piefirme.gastos (organizacion_id, sede_id, compartido, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
  select o, null, true, m.d + 4, g_sus, 'transferencia', 1000, 160, 1160, 'Suscripción Pie Firme · ' || to_char(m.d, 'YYYY-MM') || ' (plan por clínica, gasto del mes sin prorrateo, P-092)', 'sistema', 'suscripcion', 'guardado'
    from (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d);

  -- combustible con tarjeta de la clínica (visitas a domicilio) y dos gastos pagados por empleados
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_texto, grupo_id, metodo_pago, subtotal, iva, total, tiene_factura, descripcion, origen_captura, estado)
  select o, s.id, m.d + 16, 'Gasolinera Sintética', g_cmb, 'tarjeta_clinica', round(x.t / 1.16, 2), x.t - round(x.t / 1.16, 2), x.t, false, 'Combustible visitas a domicilio', 'individual', 'guardado'
    from piefirme.sedes s cross join (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d)
    cross join lateral (select (650 + abs(hashtext(s.clave || m.d::text)) % 250)::numeric as t) x
   where s.organizacion_id = o and s.clave in ('PAT', 'SEN');
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_texto, grupo_id, metodo_pago, subtotal, iva, total, descripcion, pagado_por_nombre, reembolsado, reembolsado_en, origen_captura, estado)
  select o, s.id, x.f, x.prov, (select id from piefirme.grupos_gasto where organizacion_id = o and clave = x.grupo), 'pagado_por_empleado', x.t, 0, x.t, x.d, 'Recepción Sintética', x.r, x.rf, 'individual', 'guardado'
    from piefirme.sedes s join (values ('CHA', date '2026-09-12', 'Taxi', 'otros', 280.00, 'Traslado de instrumental', true, date '2026-09-19'),
                                     ('CEN', date '2026-10-14', 'Tienda de Limpieza', 'limpieza_aseo', 540.00, 'Material de limpieza urgente', false, null::date)) x(clave, f, prov, grupo, t, d, r, rf) on x.clave = s.clave
   where s.organizacion_id = o;

  -- ───────── gastos del fondo revolvente, semana por semana (sábado → viernes), 3 a 5 por sede ─────────
  insert into piefirme.gastos (organizacion_id, sede_id, fecha, proveedor_texto, grupo_id, metodo_pago, subtotal, iva, total, tiene_factura, descripcion, origen_captura, creado_por, estado)
  select o, fo.sede_id, least(ws.w + (abs(hashtext(fo.sede_id::text || ws.w::text || n)) % 7), hoy), pr.nom, gr.id, 'efectivo_fondo',
         t.total - case when abs(hashtext(fo.sede_id::text || ws.w::text || n || 'i')) % 3 <> 0 then round(t.total - t.total / 1.16, 2) else 0 end,
         case when abs(hashtext(fo.sede_id::text || ws.w::text || n || 'i')) % 3 <> 0 then round(t.total - t.total / 1.16, 2) else 0 end, t.total, false,
         gr.nombre || ' (ticket sintético)', 'fondo', rec, 'guardado'
    from piefirme.fondos_revolventes fo
    cross join (select d::date as w from generate_series(date '2026-08-01', date '2026-10-24', interval '7 days') d) ws
    cross join generate_series(1, 5) n
    cross join lateral (select (40 + abs(hashtext(fo.sede_id::text || ws.w::text || n || 't')) % 380)::numeric as total) t
    cross join lateral (select (array['papeleria', 'limpieza_aseo', 'ferreteria', 'gastos_medicos', 'compras_operativas'])[1 + abs(hashtext(fo.sede_id::text || ws.w::text || n || 'g')) % 5] as clave) gc
    join piefirme.grupos_gasto gr on gr.organizacion_id = o and gr.clave = gc.clave
    cross join lateral (select (array['Papelería Central', 'Oxxo', 'Home Depot', 'Farmacia Sintética', 'Walmart'])[1 + abs(hashtext(fo.sede_id::text || ws.w::text || n || 'v')) % 5] as nom) pr
   where fo.organizacion_id = o and n <= 3 + abs(hashtext(fo.sede_id::text || ws.w::text)) % 3
     and (ws.w <= hoy);

  -- cierres semanales del fondo (hasta el viernes 23-oct); todos repuestos menos la última semana, que espera autorización
  for v_f in select fo.id as fondo_id, ws.w from piefirme.fondos_revolventes fo cross join (select d::date as w from generate_series(date '2026-08-01', date '2026-10-17', interval '7 days') d) ws
            where fo.organizacion_id = o order by ws.w, fo.id loop
    v_cierre := piefirme.fondo_cerrar_semana(v_f.fondo_id, v_f.w);
    if v_f.w < date '2026-10-17' then perform piefirme.fondo_reponer(v_cierre, null, v_f.w + 9); end if;
  end loop;

  -- ───────── pagos a proveedores (cuentas por pagar nacidas de las recepciones de C_01) ─────────
  select id into v_cta from piefirme.cuentas_bancarias where organizacion_id = o and sede_id is null;
  for v_c in select cp.*, s.clave as sede_clave from piefirme.cuentas_por_pagar cp join piefirme.sedes s on s.id = cp.sede_id
            where cp.organizacion_id = o and cp.estado = 'programada' order by cp.fecha_emision, cp.folio_factura loop
    if (v_c.fecha_emision < date '2026-10-01' and not (v_c.sede_clave = 'CEN' and v_c.fecha_emision between date '2026-09-01' and date '2026-09-30' and v_c.folio_factura like '%2')
        or v_c.fecha_emision >= date '2026-10-01' and v_c.sede_clave in ('CHA', 'CEN', 'SEN')) then
      insert into piefirme.pagos_proveedor (organizacion_id, sede_id, cuenta_pagar_id, fecha, monto, forma_pago, cuenta_bancaria_id, referencia, autorizado_por)
      values (o, v_c.sede_id, v_c.id, least(v_c.fecha_vencimiento - 2, date '2026-10-22'),
              case when v_c.sede_clave = 'GAL' and v_c.fecha_emision between date '2026-09-01' and date '2026-09-30' then round(v_c.importe / 2, 2) else v_c.importe end,
              'transferencia', v_cta, 'SPEI-' || v_c.folio_factura, adm);
    end if;
  end loop;
end $$;
