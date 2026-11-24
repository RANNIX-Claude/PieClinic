-- Semilla B_02 · Citas coherentes de ~3 meses (27-jul-2026 a 7-nov-2026), anticipos/Clip simulado, tickets, caja y cortes, planes,
-- gift card, membresías, lista de espera y CFDI SINTÉTICOS. Todo sintético (P-132); el timbrado es «simulado» (UUID sin validez fiscal).
-- REQUIERE (B_00 o equivalentes) y B_01 ya aplicada:
--   organización 00000000-0000-0000-0000-00000000c0de · sedes 5e000000-…-00000000000N (N=1..5) con «Cabina 1» y «Cabina 2»
--   perfiles: administrador a0000000-…-000000000001 · recepción a0000000-…-000000000002 · podólogos a0000000-…-00000000001N (N=1..5, sede N)
--   pacientes c1000000-0000-0000-0000-0000000000NN (NN=01..40)
-- Idempotente de forma gruesa: si la organización ya tiene citas, no hace nada.
-- Debe correrse con un rol que omita RLS (postgres / service_role) porque simula sesiones con request.jwt.claim.sub.

do $$
declare
  o    constant uuid := '00000000-0000-0000-0000-00000000c0de';
  recep constant uuid := 'a0000000-0000-0000-0000-000000000002';
  adm  constant uuid := 'a0000000-0000-0000-0000-000000000001';
  tz   constant text := 'America/Mexico_City';
  t record; v_turno uuid; v_ids uuid[]; v_ids2 uuid[]; v_ef numeric; v_dif numeric; v_gc uuid; v_gvta uuid; v_n int;
  f uuid; f1 uuid; f2 uuid; k int := 0; r record; v_rec uuid[];
begin
  if exists (select 1 from piefirme.citas where organizacion_id = o) then
    raise notice 'B_02: la organización ya tiene citas; no se repite la semilla';
    return;
  end if;

  -- ═════════ 1. Citas (L-S, 6 huecos por día y podólogo; los sábados solo la mañana) ═════════
  insert into piefirme.citas (organizacion_id, sede_id, paciente_id, servicio_id, podologo_id, atendio_id, cabina_id, inicio, fin, duracion_min, estado, origen, primera_vez,
                            anticipo_requerido, motivo_cancelacion, cancelacion_fuera_de_plazo, cancelada_en, cancelada_por, fin_atencion_en, llegada_en)
  select o, s.sede, s.pac, sv.id, s.pod, case when s.est = 'atendida' then s.pod end, cab.id,
         s.ini, s.ini + make_interval(mins => sv.duracion_min), sv.duracion_min, s.est, s.origen, (s.h5 % 5 = 0),
         case when s.origen = 'portal' then piefirme_app.anticipo_servicio(o, sv.id, coalesce(piefirme_app.precio_servicio(o, sv.id, s.sede, s.dia), 0)) else 0 end,
         case when s.est = 'cancelada' then 'Cancelación sintética (paciente)' end,
         case when s.est = 'cancelada' then (s.h5 % 2 = 0) end,
         case when s.est = 'cancelada' then s.ini - interval '3 days' end,
         case when s.est = 'cancelada' then recep end,
         case when s.est = 'atendida' then s.ini + make_interval(mins => sv.duracion_min) end,
         case when s.est = 'atendida' then s.ini - interval '5 minutes' end
    from (
      select b.dia, b.n, b.sede, b.pod, b.pac, b.ini, b.h5,
             case when b.h2 < 40 then 'SV-001' when b.h2 < 52 then 'SV-002' when b.h2 < 58 then 'SV-003' when b.h2 < 68 then 'SV-005' when b.h2 < 76 then 'SV-006'
                  when b.h2 < 82 then 'SV-007' when b.h2 < 88 then 'SV-008' when b.h2 < 93 then 'SV-011' else 'SV-012' end as cod,
             case when b.dia < date '2026-10-25' then (case when b.h3 < 72 then 'atendida' when b.h3 < 82 then 'no_asistio' else 'cancelada' end)
                  else (case when b.h3 < 5 then 'cancelada' when b.h3 < 60 then 'confirmada' else 'por_confirmar' end) end as est,
             case when b.h4 < 35 then 'portal' when b.h4 < 55 then 'llamada' when b.h4 < 75 then 'presencial' else 'whatsapp' end as origen
        from (
          select g.dia, n.n, ('5e000000-0000-0000-0000-00000000000' || n.n)::uuid as sede, ('a0000000-0000-0000-0000-00000000001' || n.n)::uuid as pod,
                 ('c1000000-0000-0000-0000-0000000000' || lpad((1 + abs(hashtext('p' || g.dia || n.n || sl.t)) % 40)::text, 2, '0'))::uuid as pac,
                 ((g.dia + sl.t) at time zone tz) as ini,
                 abs(hashtext('a' || g.dia || n.n || sl.t)) % 100 as h1, abs(hashtext('b' || g.dia || n.n || sl.t)) % 100 as h2,
                 abs(hashtext('c' || g.dia || n.n || sl.t)) % 100 as h3, abs(hashtext('d' || g.dia || n.n || sl.t)) % 100 as h4,
                 abs(hashtext('e' || g.dia || n.n || sl.t)) % 100 as h5
            from (select d::date as dia from generate_series(date '2026-07-27', date '2026-11-07', interval '1 day') d) g
            cross join generate_series(1, 5) n(n)
            cross join (values (time '09:00'), (time '10:15'), (time '11:30'), (time '15:00'), (time '16:15'), (time '17:30')) sl(t)
           where extract(isodow from g.dia) <> 7
             and (extract(isodow from g.dia) <> 6 or sl.t < time '14:00')
             and not exists (select 1 from piefirme.festivos f where f.organizacion_id = o and f.fecha = g.dia)
        ) b
       where b.h1 >= 18
    ) s
    join piefirme.servicios sv on sv.organizacion_id = o and sv.codigo = s.cod
    join piefirme.cabinas cab on cab.sede_id = s.sede and cab.nombre = 'Cabina 1'
   order by s.ini, s.sede;
  get diagnostics v_n = row_count;
  raise notice 'B_02: % citas', v_n;

  -- ═════════ 2. Anticipos del portal (Clip SIMULADO) ═════════
  insert into piefirme.anticipos (organizacion_id, sede_id, paciente_id, cita_id, origen, monto, metodo, estado, pagado_en, referencia,
                                reembolso_estado, reembolso_monto, reembolso_cerrado_en)
  select o, c.sede_id, c.paciente_id, c.id, 'portal', c.anticipo_requerido, 'clip',
         case when c.estado = 'cancelada' then (case when c.cancelacion_fuera_de_plazo then 'no_reembolsable' else 'reembolsado' end)
              when c.estado = 'no_asistio' then 'no_reembolsable' else 'pagado' end,
         least(c.inicio - interval '3 days', now() - interval '1 hour'), 'SINTETICO',
         case when c.estado = 'cancelada' and not c.cancelacion_fuera_de_plazo then 'manual' else 'ninguno' end,
         case when c.estado = 'cancelada' and not c.cancelacion_fuera_de_plazo then c.anticipo_requerido end,
         case when c.estado = 'cancelada' and not c.cancelacion_fuera_de_plazo then least(c.inicio - interval '1 day', now()) end
    from piefirme.citas c where c.organizacion_id = o and c.origen = 'portal' and c.anticipo_requerido > 0 order by c.inicio;
  insert into piefirme.pagos_clip (organizacion_id, sede_id, clip_payment_id, origen, anticipo_id, monto, comision, estado, ultimos4, marca, autorizacion, modo)
  select o, a.sede_id, 'SINT-' || a.folio, 'reserva_portal', a.id, a.monto, round(a.monto * 0.036, 2),
         case when a.estado = 'reembolsado' then 'reembolsado' else 'aprobado' end,
         lpad((abs(hashtext(a.folio)) % 10000)::text, 4, '0'), 'Visa', 'AUT' || lpad((abs(hashtext(a.id::text)) % 1000000)::text, 6, '0'), 'simulado'
    from piefirme.anticipos a where a.organizacion_id = o;

  -- ═════════ 3. Caja: un turno por sede y día con ventas (citas atendidas con cobro + mostrador) ═════════
  perform set_config('app.cerrando', 'off', true);
  for t in
    select distinct c.sede_id, (c.inicio at time zone tz)::date as dia
      from piefirme.citas c where c.organizacion_id = o and c.estado = 'atendida' and c.precio_servicio > 0
    union select '5e000000-0000-0000-0000-000000000001'::uuid, date '2026-08-10'
    union select '5e000000-0000-0000-0000-000000000003'::uuid, date '2026-09-07'
    union select '5e000000-0000-0000-0000-000000000002'::uuid, date '2026-09-21'
    union select '5e000000-0000-0000-0000-000000000001'::uuid, date '2026-09-14'
    union select '5e000000-0000-0000-0000-000000000001'::uuid, date '2026-10-05'
    order by 2, 1
  loop
    insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial)
    values (o, t.sede_id, 'Caja 1', 'Turno único', recep, (t.dia + time '08:30') at time zone tz, 1500) returning id into v_turno;

    -- tickets de las citas atendidas (el precio se congela de la cita, P-068)
    with ins as (
      insert into piefirme.ventas (organizacion_id, sede_id, cita_id)
      select o, c.sede_id, c.id from piefirme.citas c
       where c.organizacion_id = o and c.sede_id = t.sede_id and (c.inicio at time zone tz)::date = t.dia and c.estado = 'atendida'
         and c.precio_servicio > 0 and c.plan_adquirido_id is null order by c.inicio
      returning id)
    select coalesce(array_agg(id), '{}') into v_ids from ins;
    insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, servicio_id, cantidad)
    select o, v.id, 'servicio', c.servicio_id, 1 from piefirme.ventas v join piefirme.citas c on c.id = v.cita_id where v.id = any (v_ids);

    -- ventas de mostrador (productos) la mayoría de los días
    if abs(hashtext('m' || t.dia || t.sede_id)) % 3 <> 0 then
      with ins as (insert into piefirme.ventas (organizacion_id, sede_id, origen) select o, t.sede_id, 'mostrador' from generate_series(1, 1 + abs(hashtext('n' || t.dia)) % 2) returning id)
      select array_agg(id) into v_ids2 from ins;
      insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, producto_id, cantidad)
      select o, v2.id, 'producto', (select id from piefirme.productos where organizacion_id = o and sku = (array['PF-AM-001', 'PF-AM-002', 'PF-CC-001', 'PF-CC-002', 'PF-OR-001', 'PF-OR-002', 'PF-PD-001'])[1 + abs(hashtext(v2.id::text)) % 7]),
             1 + abs(hashtext('q' || v2.id::text)) % 2
        from unnest(v_ids2) v2(id);
      v_ids := v_ids || v_ids2;
    end if;

    -- ventas especiales: planes láser, gift card y su canje
    if t.sede_id = '5e000000-0000-0000-0000-000000000001' and t.dia = date '2026-08-10' then
      insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id, podologo_id) values (o, t.sede_id, 'paquete_plan_giftcard', 'c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000011') returning id into f;
      insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, oferta_id, cantidad) values (o, f, 'plan', '0f000000-0000-0000-0000-000000000001', 1);
      v_ids := v_ids || f;
    elsif t.sede_id = '5e000000-0000-0000-0000-000000000003' and t.dia = date '2026-09-07' then
      insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id, podologo_id) values (o, t.sede_id, 'paquete_plan_giftcard', 'c1000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000013') returning id into f;
      insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, oferta_id, cantidad) values (o, f, 'plan', '0f000000-0000-0000-0000-000000000001', 1);
      v_ids := v_ids || f;
    elsif t.sede_id = '5e000000-0000-0000-0000-000000000002' and t.dia = date '2026-09-21' then
      insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id, podologo_id) values (o, t.sede_id, 'paquete_plan_giftcard', 'c1000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000012') returning id into f;
      insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, oferta_id, cantidad) values (o, f, 'plan', '0f000000-0000-0000-0000-000000000001', 1);
      v_ids := v_ids || f;
    elsif t.sede_id = '5e000000-0000-0000-0000-000000000001' and t.dia = date '2026-09-14' then
      insert into piefirme.ventas (organizacion_id, sede_id, origen) values (o, t.sede_id, 'paquete_plan_giftcard') returning id into f;
      insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, oferta_id, cantidad) values (o, f, 'gift_card', '0f000000-0000-0000-0000-000000000004', 1);
      v_ids := v_ids || f; v_gvta := f;
    end if;

    -- pagos: primero el anticipo aplicado (no es dinero del turno), luego el resto por método
    insert into piefirme.pagos (organizacion_id, venta_id, metodo, monto, anticipo_id, referencia)
    select o, v.id, 'anticipo', a.monto, a.id, 'Anticipo ' || a.folio
      from piefirme.ventas v join piefirme.anticipos a on a.cita_id = v.cita_id and a.estado = 'pagado' where v.id = any (v_ids);
    insert into piefirme.pagos (organizacion_id, venta_id, metodo, monto, referencia, efectivo_recibido, ultimos4)
    select o, v.id, m.metodo, v.total - v.anticipo_aplicado,
           case when m.metodo = 'efectivo' then null else 'SINT-' || substr(v.id::text, 1, 6) end,
           case when m.metodo = 'efectivo' then ceil((v.total - v.anticipo_aplicado) / 10) * 10 end,
           case when m.metodo in ('tarjeta', 'clip') then lpad((abs(hashtext(v.id::text)) % 10000)::text, 4, '0') end
      from piefirme.ventas v
      cross join lateral (select (array['efectivo', 'tarjeta', 'clip', 'transferencia', 'efectivo'])[1 + abs(hashtext(v.id::text)) % 5] as metodo) m
     where v.id = any (v_ids) and v.total - v.anticipo_aplicado > 0;

    -- canje parcial de la gift card en un ticket de mostrador (P-073)
    if t.sede_id = '5e000000-0000-0000-0000-000000000001' and t.dia = date '2026-10-05' then
      insert into piefirme.ventas (organizacion_id, sede_id, origen) values (o, t.sede_id, 'mostrador') returning id into f;
      insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, producto_id, cantidad)
      values (o, f, 'producto', (select id from piefirme.productos where organizacion_id = o and sku = 'PF-OR-002'), 1);
      select id into v_gc from piefirme.gift_cards where organizacion_id = o limit 1;
      if v_gc is not null then
        insert into piefirme.pagos (organizacion_id, venta_id, metodo, monto, gift_card_id, referencia) select o, f, 'gift_card', total, v_gc, 'Canje gift card' from piefirme.ventas where id = f;
        v_ids := v_ids || f;
      else
        v_ids := v_ids || f;   -- sin gift card: queda sin pago y no se cobra
        delete from piefirme.venta_lineas where venta_id = f; delete from piefirme.ventas where id = f; v_ids := array_remove(v_ids, f);
      end if;
    end if;

    -- cobro: el ticket queda en el turno
    update piefirme.ventas v set estado = 'cobrada', turno_id = v_turno, cajero_id = recep,
           cobrada_en = coalesce((select c.fin + interval '10 minutes' from piefirme.citas c where c.id = v.cita_id), (t.dia + time '16:00') at time zone tz)
     where v.id = any (v_ids) and v.estado = 'por_cobrar';

    if v_gvta is not null then
      insert into piefirme.gift_cards (organizacion_id, oferta_id, sede_venta_id, venta_id, monto_inicial, saldo, fecha_venta, caduca_el, comprador, beneficiario)
      values (o, '0f000000-0000-0000-0000-000000000004', t.sede_id, v_gvta, 500, 500, t.dia, (t.dia + interval '12 months')::date, 'Comprador sintético', 'Beneficiario sintético');
      v_gvta := null;
    end if;

    -- cierre de turno con el cajero (corte con tolerancia de $50)
    select coalesce(sum(p.monto), 0) into v_ef from piefirme.pagos p join piefirme.ventas v on v.id = p.venta_id where v.turno_id = v_turno and p.metodo = 'efectivo';
    v_dif := case when abs(hashtext('z' || v_turno::text)) % 7 = 0 then -10 else 0 end;
    perform set_config('request.jwt.claim.sub', recep::text, true);
    perform piefirme.cerrar_turno(v_turno, 1500 + v_ef + v_dif, case when v_dif <> 0 then 'Faltante sintético por cambio' end);
    if t.dia < date '2026-10-20' then
      perform set_config('request.jwt.claim.sub', adm::text, true);
      perform piefirme.revisar_turno(v_turno);
    end if;
    perform set_config('request.jwt.claim.sub', '', true);
  end loop;

  -- hora de cierre coherente con la fecha del turno (los turnos cerrados son de solo lectura; se corrige como propietario de la tabla)
  alter table piefirme.turnos_caja disable trigger user;
  update piefirme.turnos_caja set cierre_en = apertura_en + interval '9 hours' where organizacion_id = o;
  alter table piefirme.turnos_caja enable trigger user;
  update piefirme.cortes_caja c set created_at = t2.apertura_en + interval '9 hours' from piefirme.turnos_caja t2 where t2.id = c.turno_id and c.organizacion_id = o;

  -- ═════════ 4. Planes láser vendidos y sus sesiones (consumen saldo al quedar atendidas) ═════════
  insert into piefirme.planes_adquiridos (organizacion_id, sede_compra_id, paciente_id, oferta_id, venta_id, venta_linea_id, fecha_compra, caduca_el, sesiones_total, precio_total)
  select o, v.sede_id, v.paciente_id, l.oferta_id, v.id, l.id, (v.cobrada_en at time zone tz)::date, ((v.cobrada_en at time zone tz)::date + interval '12 months')::date, 6, l.importe
    from piefirme.venta_lineas l join piefirme.ventas v on v.id = l.venta_id where v.organizacion_id = o and l.tipo = 'plan' and v.estado = 'cobrada';

  insert into piefirme.citas (organizacion_id, sede_id, paciente_id, servicio_id, podologo_id, cabina_id, inicio, fin, duracion_min, estado, origen, seguimiento_garantia, plan_adquirido_id, notas)
  select o, x.sede, x.pac, sv.id, x.pod, cab.id, (x.dia + time '08:00') at time zone tz, (x.dia + time '08:00') at time zone tz + make_interval(mins => sv.duracion_min), sv.duracion_min,
         'confirmada', 'presencial', true, pa.id, 'Sesión de plan láser (sintética)'
    from (values
      (date '2026-08-17', '5e000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000011'::uuid, 'c1000000-0000-0000-0000-000000000003'::uuid),
      (date '2026-09-17', '5e000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000011'::uuid, 'c1000000-0000-0000-0000-000000000003'::uuid),
      (date '2026-10-19', '5e000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000011'::uuid, 'c1000000-0000-0000-0000-000000000003'::uuid),
      (date '2026-09-09', '5e000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000013'::uuid, 'c1000000-0000-0000-0000-000000000008'::uuid),
      (date '2026-10-12', '5e000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000013'::uuid, 'c1000000-0000-0000-0000-000000000008'::uuid),
      (date '2026-09-23', '5e000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000012'::uuid, 'c1000000-0000-0000-0000-000000000015'::uuid),
      (date '2026-10-27', '5e000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000012'::uuid, 'c1000000-0000-0000-0000-000000000015'::uuid)
    ) x(dia, sede, pod, pac)
    join piefirme.servicios sv on sv.organizacion_id = o and sv.codigo = 'SV-005'
    join piefirme.cabinas cab on cab.sede_id = x.sede and cab.nombre = 'Cabina 2'
    join piefirme.planes_adquiridos pa on pa.paciente_id = x.pac and pa.organizacion_id = o
   order by x.dia;
  update piefirme.citas set estado = 'atendida', atendio_id = podologo_id where organizacion_id = o and plan_adquirido_id is not null and inicio < timestamptz '2026-10-25 00:00-06';

  -- ═════════ 5. Membresías, lista de espera ═════════
  insert into piefirme.membresias_paciente (organizacion_id, paciente_id, oferta_id, sede_venta_id, inicio, vencimiento, beneficios_consumo)
  values (o, 'c1000000-0000-0000-0000-000000000021', '0f000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000001', date '2026-03-01', date '2027-02-28', '{"quiropodias_usadas":5}'),
         (o, 'c1000000-0000-0000-0000-000000000022', '0f000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000004', date '2025-11-20', date '2026-11-19', '{"quiropodias_usadas":9}');

  insert into piefirme.lista_espera (organizacion_id, sede_id, paciente_id, nombre_solicitante, telefono, servicio_id, podologo_id, disponibilidad, prioridad, origen, estado)
  select o, ('5e000000-0000-0000-0000-00000000000' || (1 + i % 5))::uuid, ('c1000000-0000-0000-0000-0000000000' || lpad((30 + i)::text, 2, '0'))::uuid,
         'Solicitante sintético ' || i, '5500009' || lpad(i::text, 3, '0'),
         (select id from piefirme.servicios where organizacion_id = o and codigo = (array['SV-001', 'SV-002', 'SV-005'])[1 + i % 3]),
         case when i % 2 = 0 then null else ('a0000000-0000-0000-0000-00000000001' || (1 + i % 5))::uuid end,
         (array['Lun–Vie, tarde', 'Fines de semana', 'Cualquier horario'])[1 + i % 3],
         (array['alta', 'media', 'baja'])[1 + i % 3], (array['llamada', 'portal', 'whatsapp'])[1 + i % 3], 'esperando'
    from generate_series(1, 6) i;

  -- ═════════ 6. CFDI sintéticos de tickets del mes en curso (RFC de pruebas públicas del SAT) ═════════
  insert into piefirme.cfdi_receptores (organizacion_id, rfc, razon_social, regimen_fiscal, codigo_postal, uso_cfdi, correo, validado)
  values (o, 'URE180429TM6', 'UNIVERSIDAD ROBOTICA ESPAÑOLA (PRUEBAS)', '601', '65000', 'G03', 'facturas1@sintetico.test', true),
         (o, 'XIQB891116QE4', 'XOCHILT CASAS CHAVEZ (PRUEBAS)', '612', '86991', 'G03', 'facturas2@sintetico.test', true),
         (o, 'CACX7605101P8', 'XOCHILT CASAS CHAVEZ (PRUEBAS)', '612', '36257', 'D01', 'facturas3@sintetico.test', true);
  select array_agg(id order by rfc) into v_rec from piefirme.cfdi_receptores where organizacion_id = o;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  for r in select v.id from piefirme.ventas v
            where v.organizacion_id = o and v.estado = 'cobrada' and v.total > 0 and v.cobrada_en is not null
              and date_trunc('month', v.cobrada_en at time zone tz) = date_trunc('month', now() at time zone tz)
            order by v.cobrada_en limit 8 loop
    begin
      k := k + 1;
      f := piefirme.crear_factura_desde_venta(r.id, case when k % 3 = 0 then null else v_rec[1 + k % 3] end);
      perform piefirme.timbrar_factura_simulado(f);
      if k = 1 then f1 := f; elsif k = 2 then f2 := f; end if;
    exception when others then
      raise notice 'B_02: ticket % no se facturó (%)', r.id, sqlerrm;
    end;
  end loop;
  if f1 is not null then   -- una cancelación SAT aceptada (motivo 02) y una nota de crédito sobre otra factura
    insert into piefirme.cfdi_cancelaciones (organizacion_id, factura_id, motivo_sat, comentario) values (o, f1, '02', 'Cancelación sintética') returning id into f;
    update piefirme.cfdi_cancelaciones set estado = 'aceptada', acuse_path = null where id = f;
  end if;
  if f2 is not null then
    perform piefirme.emitir_nota_credito(f2, 'bonificacion', 20, 'Bonificación sintética', false);
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
