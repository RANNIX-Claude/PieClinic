-- G_03 · Semilla SINTÉTICA V2: gastos recurrentes (45) y notas de compra con confianza por campo (75, con sus líneas).
-- Requiere: migraciones 067, semillas D_01/G_01 (sedes), C_01/C_02 (proveedores, grupos y gastos). Si faltan proveedores o gastos, esa parte no inserta nada.
-- Idempotente (ids deterministas) · marca: sintetico = true.
do $$
declare o constant uuid := '00000000-0000-0000-0000-00000000c0de';
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  if not exists (select 1 from piefirme.organizaciones where id = o) then raise notice 'G_03: falta la organización'; return; end if;

  -- ───────────── gastos recurrentes por sede (6) + compartidos (3) ─────────────
  insert into piefirme.gastos_recurrentes (id, organizacion_id, sede_id, grupo_id, proveedor_id, concepto, monto, metodo_pago, frecuencia, dia_del_mes,
                                         fecha_inicio, proxima_fecha, ultima_generada, activo, notas, sintetico)
  select md5('G03:rec:' || coalesce(s.clave, 'ALL') || ':' || c.k)::uuid, o, s.id,
         (select id from piefirme.grupos_gasto g where g.organizacion_id = o and g.clave = c.grupo),
         (select id from piefirme.proveedores p where p.organizacion_id = o and p.clave = c.prov),
         c.concepto || coalesce(' · ' || s.nombre, ''),
         round(c.monto * (0.85 + (abs(hashtext(coalesce(s.clave, 'ALL') || c.k)) % 30) / 100.0), -1),
         c.metodo, c.frec, c.dia, date '2026-01-01',
         (case when (date_trunc('month', current_date) + (c.dia - 1) * interval '1 day')::date >= current_date
               then (date_trunc('month', current_date) + (c.dia - 1) * interval '1 day')::date
               else (date_trunc('month', current_date) + interval '1 month' + (c.dia - 1) * interval '1 day')::date end),
         (date_trunc('month', current_date) + (c.dia - 1) * interval '1 day')::date - interval '1 month',
         true, 'Gasto recurrente sintético', true
    from (values
      ('renta',   'Renta del local',            'renta',          'RENTAS',  26000, 'transferencia', 'mensual',   1),
      ('luz',     'Suministro de energía',      'servicios',      'ENERGIA',  3600, 'transferencia', 'mensual',  12),
      ('internet','Internet y telefonía',       'servicios',      'TELECOM',  1250, 'transferencia', 'mensual',   5),
      ('limpieza','Servicio de limpieza',       'limpieza_aseo',  'LIMPIA',   4500, 'transferencia', 'mensual',  15),
      ('equipo',  'Mantenimiento de equipo',    'mantenimiento',  'MEDEQ',    2400, 'transferencia', 'bimestral',20),
      ('papel',   'Papelería y consumibles',    'papeleria',      'PAPEL',     950, 'efectivo',      'mensual',  10)
    ) c(k, concepto, grupo, prov, monto, metodo, frec, dia)
    cross join (select id, clave, nombre from piefirme.sedes where organizacion_id = o and clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN', 'POL', 'COY')) s
  on conflict (id) do nothing;
  insert into piefirme.gastos_recurrentes (id, organizacion_id, sede_id, grupo_id, concepto, monto, metodo_pago, frecuencia, dia_del_mes, fecha_inicio, proxima_fecha, ultima_generada, activo, notas, sintetico)
  select md5('G03:rec:ALL:' || c.k)::uuid, o, null, (select id from piefirme.grupos_gasto g where g.organizacion_id = o and g.clave = c.grupo),
         c.concepto, c.monto, 'transferencia', c.frec, c.dia, date '2026-01-01',
         (case when (date_trunc('month', current_date) + (c.dia - 1) * interval '1 day')::date >= current_date
               then (date_trunc('month', current_date) + (c.dia - 1) * interval '1 day')::date
               else (date_trunc('month', current_date) + interval '1 month' + (c.dia - 1) * interval '1 day')::date end),
         case when c.frec = 'anual' then null else (date_trunc('month', current_date) + (c.dia - 1) * interval '1 day')::date - interval '1 month' end,
         true, 'Gasto compartido entre sedes (sintético)', true
    from (values ('suscripcion', 'Suscripción Pie Firme', 'suscripcion_rannix', 3500, 'mensual', 3),
                 ('publicidad', 'Publicidad en redes sociales', 'publicidad', 12000, 'mensual', 8),
                 ('licencia', 'Renovación de licencia sanitaria', 'licencias_permisos', 8000, 'anual', 28)) c(k, concepto, grupo, monto, frec, dia)
  on conflict (id) do nothing;

  -- ───────────── notas de compra ligadas a gastos reales (aplicadas / revisadas) ─────────────
  with g as (
    select x.*, row_number() over (partition by x.sede_id order by x.fecha desc, x.id) as rk
      from piefirme.gastos x
     where x.organizacion_id = o and x.estado <> 'anulado' and x.sede_id in (select id from piefirme.sedes where organizacion_id = o and clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN'))
       and x.total > 0
  ), pick as (
    select g.*, abs(hashtext(g.id::text)) as h from g where g.rk <= 8
  )
  insert into piefirme.notas_compra (id, organizacion_id, sede_id, gasto_id, cuenta_por_pagar_id, proveedor_id, proveedor_texto, fecha_nota, folio_nota,
                                   subtotal, iva, total, forma_pago, estado, fuente, confianza_global, confianza_campos, requiere_revision, notas, sintetico, created_at)
  select md5('G03:nota:g:' || p.id)::uuid, o, p.sede_id, p.id, p.cuenta_por_pagar_id, p.proveedor_id, p.proveedor_texto, p.fecha,
         coalesce(p.folio_comprobante, 'N-' || (1000 + p.h % 9000)), p.subtotal, p.iva, p.total,
         case when p.cuenta_por_pagar_id is not null then 'credito' else 'contado' end,
         case when p.h % 5 = 0 then 'revisada' else 'aplicada' end,
         case when p.h % 10 < 7 then 'ia' else 'manual' end,
         case when p.h % 10 < 7 then round((0.80 + (p.h % 20) / 100.0)::numeric, 3) end,
         case when p.h % 10 < 7 then jsonb_build_object('proveedor', round((0.85 + (p.h % 15) / 100.0)::numeric, 2), 'fecha', round((0.88 + (p.h % 12) / 100.0)::numeric, 2),
                                                        'folio', round((0.70 + (p.h % 30) / 100.0)::numeric, 2), 'total', round((0.92 + (p.h % 8) / 100.0)::numeric, 2)) else '{}'::jsonb end,
         false, 'Nota sintética ligada a un gasto existente', true, p.fecha::timestamptz + interval '10 hours'
    from pick p
  on conflict (id) do nothing;
  insert into piefirme.notas_compra_lineas (id, organizacion_id, sede_id, nota_id, orden, descripcion, cantidad, precio_unitario, importe, confianza)
  select md5('G03:linea:' || n.id)::uuid, o, n.sede_id, n.id, 1, coalesce(nullif(g.descripcion, ''), 'Compra según comprobante'), 1, n.subtotal, n.subtotal,
         case when n.fuente = 'ia' then 0.9 end
    from piefirme.notas_compra n join piefirme.gastos g on g.id = n.gasto_id
   where n.organizacion_id = o and n.sintetico and n.subtotal > 0
  on conflict (id) do nothing;

  -- ───────────── notas de compra independientes (pendientes de revisión / descartadas), con líneas de producto ─────────────
  insert into piefirme.notas_compra (id, organizacion_id, sede_id, proveedor_id, proveedor_texto, fecha_nota, folio_nota, forma_pago, estado, fuente,
                                   confianza_global, confianza_campos, requiere_revision, notas, sintetico, created_at)
  select md5('G03:nota:i:' || s.clave || ':' || k)::uuid, o, s.id,
         (select id from piefirme.proveedores p where p.organizacion_id = o and p.clave = (array['DERMA', 'PODO', 'ESTERIL', 'PAPEL', 'LIMPIA', 'MEDEQ'])[1 + (s.n + k) % 6]),
         'Proveedor leído de la nota', current_date - ((s.n * 3 + k * 4) % 25), 'F-' || (2000 + s.n * 50 + k),
         case when (s.n + k) % 4 = 0 then 'credito' else 'contado' end,
         (array['borrador', 'borrador', 'revisada', 'descartada', 'borrador'])[1 + (s.n + k) % 5],
         case when (s.n + k) % 3 = 0 then 'manual' else 'ia' end,
         case when (s.n + k) % 3 <> 0 then round((0.55 + ((s.n * 7 + k * 11) % 44) / 100.0)::numeric, 3) end,
         case when (s.n + k) % 3 <> 0 then jsonb_build_object('proveedor', round((0.60 + ((s.n * 5 + k) % 39) / 100.0)::numeric, 2), 'fecha', round((0.75 + ((s.n + k * 3) % 24) / 100.0)::numeric, 2),
                                                              'folio', round((0.50 + ((s.n * 3 + k * 5) % 45) / 100.0)::numeric, 2), 'total', round((0.80 + ((s.n * 2 + k) % 19) / 100.0)::numeric, 2)) else '{}'::jsonb end,
         ((s.n + k) % 3 <> 0 and (s.n * 7 + k * 11) % 44 < 20), 'Nota sintética pendiente de revisión', true, now() - make_interval(days => (s.n * 3 + k * 4) % 25)
    from (select id, clave, row_number() over (order by clave)::int as n from piefirme.sedes where organizacion_id = o and clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN', 'POL', 'COY')) s
    cross join generate_series(1, 5) k
  on conflict (id) do nothing;
  insert into piefirme.notas_compra_lineas (id, organizacion_id, sede_id, nota_id, orden, descripcion, producto_id, cantidad, precio_unitario, importe, confianza)
  select md5('G03:linea:' || n.id || ':' || l.ord)::uuid, o, n.sede_id, n.id, l.ord, p.nombre, p.id, q.cant, q.precio, q.cant * q.precio,
         case when n.fuente = 'ia' then round((0.6 + (abs(hashtext(n.id::text || l.ord)) % 40) / 100.0)::numeric, 3) end
    from piefirme.notas_compra n
    cross join generate_series(1, 3) l(ord)
    join lateral (select * from (select pr.*, row_number() over (order by pr.sku) rn from piefirme.productos pr where pr.organizacion_id = o) z
                   where z.rn = 1 + (abs(hashtext(n.id::text)) + l.ord) % greatest(1, (select count(*) from piefirme.productos where organizacion_id = o))) p on true
    cross join lateral (select 1 + (abs(hashtext(n.id::text || l.ord)) % 12) as cant, round((p.costo_promedio * 0.95 + 5)::numeric, 2) as precio) q
   where n.organizacion_id = o and n.gasto_id is null and n.sintetico
  on conflict (id) do nothing;
  -- los totales de las notas independientes salen de sus líneas (IVA 16 %)
  update piefirme.notas_compra n set subtotal = t.sub, iva = round(t.sub * 0.16, 2), total = round(t.sub * 1.16, 2)
    from (select nota_id, sum(importe) sub from piefirme.notas_compra_lineas where organizacion_id = o group by nota_id) t
   where t.nota_id = n.id and n.gasto_id is null and n.sintetico and n.subtotal = 0;
end $$;
