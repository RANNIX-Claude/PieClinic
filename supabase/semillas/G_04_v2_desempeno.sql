-- G_04 · Semilla SINTÉTICA V2: esquemas de bono, metas mensuales por sucursal (nov-2025 → dic-2026), evaluaciones de servicio (~30 % de las citas
-- atendidas), bonos calculados de 12 meses (con base REAL tomada de ventas y evaluaciones) y detalle de ventas atribuidas de los dos últimos meses.
-- Requiere: migraciones 068, G_01 (empleados con perfil), B_02/E_01 (ventas y citas). Sin ventas/citas, solo se siembran esquemas y metas.
-- No se modifica ninguna venta (ventas.vendedor_id queda nulo: vendedor = cajero). Idempotente (ids deterministas) · marca: sintetico = true.
-- POL y COY no tienen ventas históricas: tienen meta pero no bonos calculados.
do $$
declare o constant uuid := '00000000-0000-0000-0000-00000000c0de'; v_admin uuid;
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  if not exists (select 1 from piefirme.organizaciones where id = o) then raise notice 'G_04: falta la organización'; return; end if;
  select id into v_admin from piefirme.perfiles where organizacion_id = o and email = 'm@g.com';

  -- ───────────── esquemas de bono ─────────────
  insert into piefirme.bono_esquemas (id, organizacion_id, nombre, descripcion, tipo, periodo, base, tipo_pago, escalones, cargos, condiciones, vigente_desde, sintetico)
  select md5('G04:esq:' || v.k)::uuid, o, v.nombre, v.descr, v.tipo, v.periodo, v.base, v.pago, v.esc::jsonb, v.cargos, v.cond::jsonb, date '2025-11-01', true
    from (values
      (1, 'Bono individual de servicios (podólogo)', 'Escalones por servicios atribuidos al podólogo en el mes.', 'individual', 'mensual', 'ventas_servicios', 'monto',
         '[{"desde":30000,"valor":600},{"desde":45000,"valor":1200},{"desde":60000,"valor":2000}]', array['podologo'], '{"asistencia_min_pct":95}'),
      (2, 'Bono individual de producto (caja y recepción)', 'Porcentaje sobre la venta de productos atribuida a quien vende.', 'individual', 'mensual', 'ventas_productos', 'porcentaje',
         '[{"desde":3000,"valor":2},{"desde":6000,"valor":3},{"desde":10000,"valor":4}]', array['cajero', 'recepcion'], '{"asistencia_min_pct":95}'),
      (3, 'Bono de sucursal por cumplimiento de meta', 'Se paga a todo el equipo de la sucursal según el % de cumplimiento de la meta mensual.', 'sucursal', 'mensual', 'cumplimiento_meta', 'monto',
         '[{"desde":90,"valor":1500},{"desde":100,"valor":3000},{"desde":110,"valor":4500}]', array['gerente', 'cajero', 'recepcion', 'asistente', 'podologo'], '{}'),
      (4, 'Bono trimestral de calidad de servicio', 'Por calificación promedio de la sucursal en las evaluaciones del trimestre.', 'sucursal', 'trimestral', 'calificacion_promedio', 'monto',
         '[{"desde":4.3,"valor":2000},{"desde":4.6,"valor":3500}]', array['gerente', 'cajero', 'recepcion', 'asistente', 'podologo'], '{"calificacion_min":4.3}')
    ) v(k, nombre, descr, tipo, periodo, base, pago, esc, cargos, cond)
  on conflict (id) do nothing;

  -- ───────────── metas mensuales por sucursal (14 meses × 7 sedes) ─────────────
  insert into piefirme.metas_mensuales (id, organizacion_id, sede_id, mes, meta_ventas, meta_servicios, meta_productos, meta_ocupacion, notas, sintetico)
  select md5('G04:meta:' || s.clave || ':' || m)::uuid, o, s.id, m::date,
         round(52000 * s.f * (case extract(month from m)::int when 12 then 1.12 when 1 then 1.03 when 2 then 0.92 when 8 then 1.06 else 1.0 end) * (1 + 0.004 * ((m::date - date '2025-11-01') / 30)) / 500) * 500,
         round(52000 * s.f * 0.8 * (case extract(month from m)::int when 12 then 1.12 when 1 then 1.03 when 2 then 0.92 when 8 then 1.06 else 1.0 end) / 500) * 500,
         round(52000 * s.f * 0.2 * (case extract(month from m)::int when 12 then 1.12 when 1 then 1.03 when 2 then 0.92 when 8 then 1.06 else 1.0 end) / 500) * 500,
         78 + (abs(hashtext(s.clave || m)) % 8), 'Meta sintética', true
    from (select id, clave, case clave when 'CHA' then 1.15 when 'CEN' then 0.95 when 'GAL' then 1.05 when 'PAT' then 1.0 when 'SEN' then 0.95 when 'POL' then 0.8 else 0.75 end as f
            from piefirme.sedes where organizacion_id = o and clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN', 'POL', 'COY')) s
    cross join generate_series(date '2025-11-01', date '2026-12-01', interval '1 month') m
  on conflict (sede_id, mes) do nothing;

  -- ───────────── evaluaciones de servicio: ~30 % de las citas atendidas responde ─────────────
  insert into piefirme.evaluacion_respuestas (id, organizacion_id, sede_id, cita_id, paciente_id, podologo_id, calif_servicio, calif_podologo, calif_sucursal, comentario,
                                            canal, estado_seguimiento, seguimiento_nota, atendida_por, atendida_en, respondida_en, sintetico)
  select md5('G04:eval:' || c.id)::uuid, o, c.sede_id, c.id, c.paciente_id, c.podologo_id, x.cs, x.cp, x.cu,
         case when x.h % 100 < 45 then
           (case when least(x.cs, x.cp, x.cu) >= 5 then (array['Excelente atención, muy puntuales y amables.', 'Me explicaron todo el tratamiento con paciencia.', 'Salí sin dolor y con mucha confianza, gracias.', 'Instalaciones muy limpias y personal atento.'])[1 + x.h % 4]
                 when least(x.cs, x.cp, x.cu) >= 4 then (array['Buen servicio, solo esperé unos minutos de más.', 'Todo bien, me gustaría más opciones de horario.', 'Muy buena atención del podólogo.'])[1 + x.h % 3]
                 when least(x.cs, x.cp, x.cu) = 3 then (array['Regular: tardaron en atenderme.', 'La atención fue correcta pero el cobro fue lento.'])[1 + x.h % 2]
                 else (array['Esperé más de media hora sin aviso.', 'No me explicaron el costo antes del tratamiento.', 'El trato en recepción no fue amable.'])[1 + x.h % 3] end) end,
         (array['qr', 'whatsapp', 'qr', 'correo', 'recepcion'])[1 + x.h % 5],
         case when least(x.cs, x.cp, x.cu) <= 2 then (case when c.inicio < now() - interval '30 days' then 'resuelta' when x.h % 2 = 0 then 'pendiente' else 'en_atencion' end) else 'no_requiere' end,
         case when least(x.cs, x.cp, x.cu) <= 2 and c.inicio < now() - interval '30 days' then 'Se contactó a la persona, se ofreció disculpa y una valoración de cortesía.' end,
         case when least(x.cs, x.cp, x.cu) <= 2 and c.inicio < now() - interval '30 days' then v_admin end,
         case when least(x.cs, x.cp, x.cu) <= 2 and c.inicio < now() - interval '30 days' then c.inicio + interval '4 days' end,
         c.fin + make_interval(hours => 3 + x.h % 45), true
    from piefirme.citas c
    cross join lateral (
      select abs(hashtext('ev' || c.id::text)) as h,
             case when abs(hashtext('s' || c.id::text)) % 100 < 55 then 5 when abs(hashtext('s' || c.id::text)) % 100 < 82 then 4 when abs(hashtext('s' || c.id::text)) % 100 < 92 then 3
                  when abs(hashtext('s' || c.id::text)) % 100 < 97 then 2 else 1 end as cs,
             case when abs(hashtext('p' || c.id::text)) % 100 < 62 then 5 when abs(hashtext('p' || c.id::text)) % 100 < 86 then 4 when abs(hashtext('p' || c.id::text)) % 100 < 94 then 3
                  when abs(hashtext('p' || c.id::text)) % 100 < 98 then 2 else 1 end as cp,
             case when abs(hashtext('u' || c.id::text)) % 100 < 50 then 5 when abs(hashtext('u' || c.id::text)) % 100 < 80 then 4 when abs(hashtext('u' || c.id::text)) % 100 < 91 then 3
                  when abs(hashtext('u' || c.id::text)) % 100 < 97 then 2 else 1 end as cu
    ) x
   where c.organizacion_id = o and c.estado = 'atendida' and c.fin < now() - interval '1 day' and abs(hashtext('resp' || c.id::text)) % 100 < 30
  on conflict (id) do nothing;

  -- ───────────── bonos calculados: sucursal por meta (esquema 3), mensual, nov-2025 → oct-2026, con base real ───────────────
  insert into piefirme.bonos_calculados (id, organizacion_id, esquema_id, sede_id, periodo_inicio, periodo_fin, periodo_etiqueta, base_valor, meta_valor, escalon, monto,
                                       cumple_condiciones, estado, autorizado_por, autorizado_en, pagado_en, notas, sintetico)
  select md5('G04:bono3:' || m.sede_id || ':' || m.mes)::uuid, o, md5('G04:esq:3')::uuid, m.sede_id, m.mes, (m.mes + interval '1 month - 1 day')::date, to_char(m.mes, 'YYYY-MM'),
         round(100.0 * r.vendido / m.meta_ventas, 2), m.meta_ventas, esc.e, coalesce((esc.e ->> 'valor')::numeric, 0), true,
         case when m.mes < date '2026-09-01' then 'pagado' else 'autorizado' end, v_admin, (m.mes + interval '1 month + 3 days'),
         case when m.mes < date '2026-09-01' then (m.mes + interval '1 month + 12 days') end, 'Bono sintético calculado con ventas reales', true
    from piefirme.metas_mensuales m
    join piefirme.sedes s on s.id = m.sede_id and s.clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN')
    cross join lateral (select coalesce(sum(v.total), 0) as vendido from piefirme.ventas v
                         where v.sede_id = m.sede_id and v.estado in ('cobrada', 'facturada') and v.cobrada_en >= m.mes and v.cobrada_en < m.mes + interval '1 month') r
    left join lateral (select e from jsonb_array_elements((select escalones from piefirme.bono_esquemas where id = md5('G04:esq:3')::uuid)) e
                        where (e ->> 'desde')::numeric <= round(100.0 * r.vendido / m.meta_ventas, 2) order by (e ->> 'desde')::numeric desc limit 1) esc on true
   where m.organizacion_id = o and m.sintetico and m.mes between date '2025-11-01' and date '2026-10-01' and r.vendido > 0
  on conflict (id) do nothing;

  -- individual por servicios (esquema 1): podólogos con sesión; base = importe de líneas de servicio de sus ventas
  insert into piefirme.bonos_calculados (id, organizacion_id, esquema_id, empleado_id, sede_id, periodo_inicio, periodo_fin, periodo_etiqueta, base_valor, escalon, monto,
                                       cumple_condiciones, estado, autorizado_por, autorizado_en, pagado_en, notas, sintetico)
  select md5('G04:bono1:' || e.id || ':' || m)::uuid, o, md5('G04:esq:1')::uuid, e.id, e.sede_id, m::date, (m + interval '1 month - 1 day')::date, to_char(m, 'YYYY-MM'),
         r.base, esc.e, case when ok.cumple then coalesce((esc.e ->> 'valor')::numeric, 0) else 0 end, ok.cumple,
         case when m < date '2026-09-01' then 'pagado' else 'autorizado' end, v_admin, (m + interval '1 month + 3 days'),
         case when m < date '2026-09-01' then (m + interval '1 month + 12 days') end, case when not ok.cumple then 'No alcanzó la asistencia mínima' end, true
    from piefirme.empleados e
    cross join generate_series(date '2025-11-01', date '2026-10-01', interval '1 month') m
    cross join lateral (select coalesce(sum(l.importe), 0) as base from piefirme.ventas v join piefirme.venta_lineas l on l.venta_id = v.id and l.tipo = 'servicio'
                         where v.podologo_id = e.perfil_id and v.estado in ('cobrada', 'facturada') and v.cobrada_en >= m and v.cobrada_en < m + interval '1 month') r
    cross join lateral (select abs(hashtext(e.id::text || m::text)) % 100 >= 8 as cumple) ok
    left join lateral (select x as e from jsonb_array_elements((select escalones from piefirme.bono_esquemas where id = md5('G04:esq:1')::uuid)) x
                        where (x ->> 'desde')::numeric <= r.base order by (x ->> 'desde')::numeric desc limit 1) esc on true
   where e.organizacion_id = o and e.cargo = 'podologo' and e.perfil_id is not null and r.base > 0
  on conflict (id) do nothing;

  -- individual por producto (esquema 2): cajeros/recepción con sesión; base = productos vendidos en ventas que ellos cobraron
  insert into piefirme.bonos_calculados (id, organizacion_id, esquema_id, empleado_id, sede_id, periodo_inicio, periodo_fin, periodo_etiqueta, base_valor, escalon, monto,
                                       cumple_condiciones, estado, autorizado_por, autorizado_en, pagado_en, notas, sintetico)
  select md5('G04:bono2:' || e.id || ':' || m)::uuid, o, md5('G04:esq:2')::uuid, e.id, e.sede_id, m::date, (m + interval '1 month - 1 day')::date, to_char(m, 'YYYY-MM'),
         r.base, esc.e, round(r.base * coalesce((esc.e ->> 'valor')::numeric, 0) / 100.0, 2), true,
         case when m < date '2026-09-01' then 'pagado' else 'autorizado' end, v_admin, (m + interval '1 month + 3 days'),
         case when m < date '2026-09-01' then (m + interval '1 month + 12 days') end, null, true
    from piefirme.empleados e
    cross join generate_series(date '2025-11-01', date '2026-10-01', interval '1 month') m
    cross join lateral (select coalesce(sum(l.importe), 0) as base from piefirme.ventas v join piefirme.venta_lineas l on l.venta_id = v.id and l.tipo = 'producto'
                         where coalesce(v.vendedor_id, v.cajero_id) = e.perfil_id and v.estado in ('cobrada', 'facturada') and v.cobrada_en >= m and v.cobrada_en < m + interval '1 month') r
    left join lateral (select x as e from jsonb_array_elements((select escalones from piefirme.bono_esquemas where id = md5('G04:esq:2')::uuid)) x
                        where (x ->> 'desde')::numeric <= r.base order by (x ->> 'desde')::numeric desc limit 1) esc on true
   where e.organizacion_id = o and e.cargo in ('cajero', 'recepcion') and e.perfil_id is not null and r.base > 0
  on conflict (id) do nothing;

  -- trimestral de calidad (esquema 4): T1, T2 y T3 de 2026 por sucursal, base = calificación promedio real de la sucursal
  insert into piefirme.bonos_calculados (id, organizacion_id, esquema_id, sede_id, periodo_inicio, periodo_fin, periodo_etiqueta, base_valor, escalon, monto,
                                       cumple_condiciones, estado, autorizado_por, autorizado_en, pagado_en, sintetico)
  select md5('G04:bono4:' || s.id || ':' || q)::uuid, o, md5('G04:esq:4')::uuid, s.id, q::date, (q + interval '3 months - 1 day')::date,
         extract(year from q)::int || '-T' || extract(quarter from q)::int, r.prom, esc.e, coalesce((esc.e ->> 'valor')::numeric, 0), r.prom >= 4.3,
         case when q < date '2026-07-01' then 'pagado' else 'autorizado' end, v_admin, (q + interval '3 months + 5 days'), case when q < date '2026-07-01' then (q + interval '3 months + 15 days') end, true
    from piefirme.sedes s
    cross join generate_series(date '2026-01-01', date '2026-07-01', interval '3 months') q
    cross join lateral (select round(avg(x.calif_sucursal), 2) as prom from piefirme.evaluacion_respuestas x
                         where x.sede_id = s.id and x.respondida_en >= q and x.respondida_en < q + interval '3 months') r
    left join lateral (select e as e from jsonb_array_elements((select escalones from piefirme.bono_esquemas where id = md5('G04:esq:4')::uuid)) e
                        where (e ->> 'desde')::numeric <= r.prom order by (e ->> 'desde')::numeric desc limit 1) esc on true
   where s.organizacion_id = o and s.clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN') and r.prom is not null
  on conflict (id) do nothing;

  -- ───────────── detalle: ventas atribuidas (las 12 mayores) de los bonos individuales de sep y oct 2026 ─────────────
  insert into piefirme.bono_detalle (id, organizacion_id, sede_id, bono_id, venta_id, empleado_id, fecha, concepto, importe_atribuido)
  select md5('G04:det:' || b.id || ':' || t.vid)::uuid, o, b.sede_id, b.id, t.vid, b.empleado_id, t.fecha, t.concepto, t.importe
    from piefirme.bonos_calculados b
    cross join lateral (
      select v.id as vid, v.cobrada_en::date as fecha, 'Venta ' || coalesce(v.folio, v.id::text) as concepto, v.total as importe
        from piefirme.ventas v join piefirme.empleados e on e.id = b.empleado_id
       where v.estado in ('cobrada', 'facturada') and v.cobrada_en >= b.periodo_inicio and v.cobrada_en < b.periodo_fin + 1
         and ((b.esquema_id = md5('G04:esq:1')::uuid and v.podologo_id = e.perfil_id) or (b.esquema_id = md5('G04:esq:2')::uuid and coalesce(v.vendedor_id, v.cajero_id) = e.perfil_id))
       order by v.total desc limit 12) t
   where b.organizacion_id = o and b.sintetico and b.empleado_id is not null and b.periodo_inicio >= date '2026-09-01'
  on conflict (id) do nothing;
end $$;
