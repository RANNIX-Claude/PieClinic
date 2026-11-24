-- Semilla E_01 · HISTORIAL de citas, tickets, pagos, caja y cortes para completar los últimos 12 meses (B_02 solo cubre 27-jul → 7-nov-2026).
-- Genera lo mismo que B_02 (secciones 1-3) pero en el rango {{DESDE}} … {{HASTA}} (exclusivo), con la misma lógica de huecos por día/podólogo,
-- estados, origen, anticipos del portal (Clip simulado), cobro por método y cierre de turno. Sin planes ni gift cards (eso vive en B_02).
-- Se corre con scripts/cargar-historial.mjs, que sustituye las fechas y lo ejecuta mes por mes. Todo es sintético (P-132).
-- Idempotente por mes: si ya hay citas de la organización dentro del rango, no hace nada.
-- Requiere B_00, B_01 y B_02 aplicadas (organización, sedes, cabinas, perfiles a0000000-…, pacientes c1000000-…, servicios SV-xxx).

do $$
declare
  o     constant uuid := '00000000-0000-0000-0000-00000000c0de';
  recep constant uuid := 'a0000000-0000-0000-0000-000000000002';
  adm   constant uuid := 'a0000000-0000-0000-0000-000000000001';
  tz    constant text := 'America/Mexico_City';
  d0    constant date := date '{{DESDE}}';
  d1    constant date := date '{{HASTA}}';
  t record; v_turno uuid; v_ids uuid[]; v_ids2 uuid[]; v_ef numeric; v_dif numeric; v_n int;
begin
  -- Lista de precios: la primera vigencia (alta inicial) arranca el 1-ene-2026; se adelanta al 1-nov-2025 para que los 12 meses tengan precio.
  alter table piefirme.precios disable trigger user;
  update piefirme.precios set vigente_desde = date '2025-11-01' where organizacion_id = o and vigente_desde = date '2026-01-01';
  alter table piefirme.precios enable trigger user;

  -- 1. Citas (si el rango ya tiene citas no se duplican; igual se completan precios, anticipos y caja, que son idempotentes)
  if not exists (select 1 from piefirme.citas where organizacion_id = o and inicio >= (d0::timestamp at time zone tz) and inicio < (d1::timestamp at time zone tz)) then
  -- Citas (L-S, 6 huecos por día y podólogo; los sábados solo la mañana). Todo el rango es pasado: atendida / no asistió / cancelada.
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
             case when b.h3 < 72 then 'atendida' when b.h3 < 82 then 'no_asistio' else 'cancelada' end as est,
             case when b.h4 < 35 then 'portal' when b.h4 < 55 then 'llamada' when b.h4 < 75 then 'presencial' else 'whatsapp' end as origen
        from (
          select g.dia, n.n, ('5e000000-0000-0000-0000-00000000000' || n.n)::uuid as sede, ('a0000000-0000-0000-0000-00000000001' || n.n)::uuid as pod,
                 ('c1000000-0000-0000-0000-0000000000' || lpad((1 + abs(hashtext('p' || g.dia || n.n || sl.t)) % 40)::text, 2, '0'))::uuid as pac,
                 ((g.dia + sl.t) at time zone tz) as ini,
                 abs(hashtext('a' || g.dia || n.n || sl.t)) % 100 as h1, abs(hashtext('b' || g.dia || n.n || sl.t)) % 100 as h2,
                 abs(hashtext('c' || g.dia || n.n || sl.t)) % 100 as h3, abs(hashtext('d' || g.dia || n.n || sl.t)) % 100 as h4,
                 abs(hashtext('e' || g.dia || n.n || sl.t)) % 100 as h5
            from (select d::date as dia from generate_series(d0, d1 - 1, interval '1 day') d) g
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
  raise notice 'E_01: % citas', v_n;
  end if;

  -- Citas del rango sin precio (cargadas antes de existir la lista de precios): se les asigna el precio vigente ese día
  update piefirme.citas c set precio_servicio = x.p,
         anticipo_requerido = case when c.origen = 'portal' then piefirme_app.anticipo_servicio(o, c.servicio_id, x.p) else 0 end
    from (select c2.id, coalesce(piefirme_app.precio_servicio(o, c2.servicio_id, c2.sede_id, (c2.inicio at time zone tz)::date), 0) as p
            from piefirme.citas c2
           where c2.organizacion_id = o and coalesce(c2.precio_servicio, 0) = 0 and c2.inicio >= (d0::timestamp at time zone tz) and c2.inicio < (d1::timestamp at time zone tz)) x
   where c.id = x.id and x.p > 0;

  -- 2. Anticipos del portal (Clip SIMULADO)
  insert into piefirme.anticipos (organizacion_id, sede_id, paciente_id, cita_id, origen, monto, metodo, estado, pagado_en, referencia,
                                reembolso_estado, reembolso_monto, reembolso_cerrado_en)
  select o, c.sede_id, c.paciente_id, c.id, 'portal', c.anticipo_requerido, 'clip',
         case when c.estado = 'cancelada' then (case when c.cancelacion_fuera_de_plazo then 'no_reembolsable' else 'reembolsado' end)
              when c.estado = 'no_asistio' then 'no_reembolsable' else 'pagado' end,
         c.inicio - interval '3 days', 'SINTETICO',
         case when c.estado = 'cancelada' and not c.cancelacion_fuera_de_plazo then 'manual' else 'ninguno' end,
         case when c.estado = 'cancelada' and not c.cancelacion_fuera_de_plazo then c.anticipo_requerido end,
         case when c.estado = 'cancelada' and not c.cancelacion_fuera_de_plazo then c.inicio - interval '1 day' end
    from piefirme.citas c
   where c.organizacion_id = o and c.origen = 'portal' and c.anticipo_requerido > 0 and c.inicio >= (d0::timestamp at time zone tz) and c.inicio < (d1::timestamp at time zone tz)
     and not exists (select 1 from piefirme.anticipos a0 where a0.cita_id = c.id)
   order by c.inicio;
  insert into piefirme.pagos_clip (organizacion_id, sede_id, clip_payment_id, origen, anticipo_id, monto, comision, estado, ultimos4, marca, autorizacion, modo)
  select o, a.sede_id, 'SINT-' || a.folio, 'reserva_portal', a.id, a.monto, round(a.monto * 0.036, 2),
         case when a.estado = 'reembolsado' then 'reembolsado' else 'aprobado' end,
         lpad((abs(hashtext(a.folio)) % 10000)::text, 4, '0'), 'Visa', 'AUT' || lpad((abs(hashtext(a.id::text)) % 1000000)::text, 6, '0'), 'simulado'
    from piefirme.anticipos a
   where a.organizacion_id = o and not exists (select 1 from piefirme.pagos_clip pc where pc.anticipo_id = a.id);

  -- 3. Caja: un turno por sede y día con ventas (citas atendidas con cobro + mostrador)
  perform set_config('app.cerrando', 'off', true);
  for t in
    select distinct c.sede_id, (c.inicio at time zone tz)::date as dia
      from piefirme.citas c
     where c.organizacion_id = o and c.estado = 'atendida' and c.precio_servicio > 0 and c.inicio >= (d0::timestamp at time zone tz) and c.inicio < (d1::timestamp at time zone tz)
       and not exists (select 1 from piefirme.ventas v where v.cita_id = c.id)
     order by 2, 1
  loop
    insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial)
    values (o, t.sede_id, 'Caja 1', 'Turno único', recep, (t.dia + time '08:30') at time zone tz, 1500) returning id into v_turno;

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

    -- pagos: primero el anticipo aplicado, luego el resto por método
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

    -- cobro: el ticket queda en el turno
    update piefirme.ventas v set estado = 'cobrada', turno_id = v_turno, cajero_id = recep,
           cobrada_en = coalesce((select c.fin + interval '10 minutes' from piefirme.citas c where c.id = v.cita_id), (t.dia + time '16:00') at time zone tz)
     where v.id = any (v_ids) and v.estado = 'por_cobrar';

    -- cierre de turno con el cajero (corte con tolerancia de $50) y revisión del administrador
    select coalesce(sum(p.monto), 0) into v_ef from piefirme.pagos p join piefirme.ventas v on v.id = p.venta_id where v.turno_id = v_turno and p.metodo = 'efectivo';
    v_dif := case when abs(hashtext('z' || v_turno::text)) % 7 = 0 then -10 else 0 end;
    perform set_config('request.jwt.claim.sub', recep::text, true);
    perform piefirme.cerrar_turno(v_turno, 1500 + v_ef + v_dif, case when v_dif <> 0 then 'Faltante sintético por cambio' end);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    perform piefirme.revisar_turno(v_turno);
    perform set_config('request.jwt.claim.sub', '', true);
  end loop;

  -- hora de cierre coherente con la fecha del turno (los turnos cerrados son de solo lectura; se corrige como propietario de la tabla)
  alter table piefirme.turnos_caja disable trigger user;
  update piefirme.turnos_caja set cierre_en = apertura_en + interval '9 hours'
   where organizacion_id = o and apertura_en >= (d0::timestamp at time zone tz) and apertura_en < (d1::timestamp at time zone tz);
  alter table piefirme.turnos_caja enable trigger user;
  update piefirme.cortes_caja c set created_at = t2.apertura_en + interval '9 hours'
    from piefirme.turnos_caja t2 where t2.id = c.turno_id and c.organizacion_id = o and t2.apertura_en >= (d0::timestamp at time zone tz) and t2.apertura_en < (d1::timestamp at time zone tz);
end $$;
