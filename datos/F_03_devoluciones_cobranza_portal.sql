-- F_03 · Tarea 0 (datos de operación) · DEVOLUCIONES, CUENTAS POR COBRAR, CONSUMO DE INSUMOS y PORTAL DE RESERVA.
-- Cierra los huecos de ciclo de vida que dejaban las semillas E: ninguna devolución, ninguna cuenta por cobrar, ninguna reserva del portal
-- (aunque 2,451 citas son origen «portal»), ningún insumo consumido en consulta y ninguna liga de cita.
-- Todo pasa por las reglas reales (devolucion_bi → reembolso en ingresos y reingreso a inventario; c_cuenta_cobrar_bi calcula saldo y estado).
-- Determinista (hashtext), idempotente por sección (cada una se salta si su tabla ya tiene datos).
--@resumen: select jsonb_build_object('devoluciones',(select count(*) from piefirme.devoluciones_venta),'reembolsos',(select count(*) from piefirme.ingresos where es_reembolso),'cxc',(select count(*) from piefirme.cuentas_por_cobrar),'cxc_estados',(select jsonb_object_agg(estado,n) from (select estado,count(*) n from piefirme.cuentas_por_cobrar group by 1) x),'consumos',(select count(*) from piefirme.consumos_consulta),'reservas',(select count(*) from piefirme.reservas_portal),'reservas_estados',(select jsonb_object_agg(estado,n) from (select estado,count(*) n from piefirme.reservas_portal group by 1) x),'ligas',(select count(*) from piefirme.ligas_cita))::text
do $$
declare
  o constant uuid := '00000000-0000-0000-0000-00000000c0de';
  adm constant uuid := 'a0000000-0000-0000-0000-000000000001';
  recep constant uuid := 'a0000000-0000-0000-0000-000000000002';
  v_n int;
begin
  -- 1. Devoluciones de producto (~9 % de las líneas de producto cobradas desde el 26-sep). Regla P-099: los periodos hasta el 9-oct están cerrados, así que el reembolso se fecha en el periodo vigente (desde el 10-oct) con referencia al ticket original -----------------------------------------------
  if not exists (select 1 from piefirme.devoluciones_venta where organizacion_id = o) then
    insert into piefirme.devoluciones_venta (organizacion_id, sede_id, venta_id, venta_linea_id, cantidad, monto, motivo, reingresa_inventario, created_by, created_at)
    select o, l.sede_id, l.venta_id, l.id, 1, round(l.importe / l.cantidad, 2),
           (array['Talla incorrecta','No le acomodó el producto','Defecto de fabricación','Cambio de opinión','Reacción a la crema','Producto equivocado'])[1 + abs(hashtext('dm' || l.id)) % 6],
           abs(hashtext('dr' || l.id)) % 100 < 70, recep,
           least(now() - interval '1 hour', greatest(v.cobrada_en + make_interval(days => 1 + abs(hashtext('dd' || l.id)) % 14), timestamptz '2026-10-10 09:00-06' + make_interval(hours => abs(hashtext('dh' || l.id)) % 400)))
      from piefirme.venta_lineas l
      join piefirme.ventas v on v.id = l.venta_id and v.estado in ('cobrada', 'por_facturar')
     where l.organizacion_id = o and l.tipo = 'producto' and l.cantidad >= 1 and l.importe > 0 and v.cobrada_en >= timestamptz '2026-09-26 00:00-06' and abs(hashtext('dv' || l.id)) % 100 < 9;
    get diagnostics v_n = row_count;
    raise notice 'devoluciones: %', v_n;
  end if;

  -- 2. Cuentas por cobrar: citas atendidas que no generaron ticket (cortesías, seguimiento no cobrado, cobro pendiente) -----------------
  if not exists (select 1 from piefirme.cuentas_por_cobrar where organizacion_id = o) then
    insert into piefirme.cuentas_por_cobrar (organizacion_id, sede_id, paciente_id, origen_tipo, cita_id, concepto, clasificacion, importe, cobrado, fecha_emision, fecha_limite, estado, cancelada_motivo, creado_por)
    select o, c.sede_id, c.paciente_id, 'cita_sin_cobro', c.id, 'Consulta sin cobrar · ' || sv.nombre, 'servicio',
           x.importe,
           case x.dest when 'cobrada' then x.importe when 'parcial' then round(x.importe * (0.3 + (x.h % 40) / 100.0), 2) else 0 end,
           (c.inicio at time zone 'America/Mexico_City')::date, (c.inicio at time zone 'America/Mexico_City')::date + 15,
           x.dest, case when x.dest = 'cancelada' then 'Condonado por cortesía de la gerencia' end, adm
      from piefirme.citas c
      join piefirme.servicios sv on sv.id = c.servicio_id
      join lateral (select coalesce(nullif(c.precio_servicio, 0), piefirme_app.precio_servicio(o, c.servicio_id, c.sede_id, (c.inicio at time zone 'America/Mexico_City')::date), 350) as importe,
                           abs(hashtext('cx' || c.id)) as h,
                           case when abs(hashtext('cy' || c.id)) % 100 < 40 then 'cobrada' when abs(hashtext('cy' || c.id)) % 100 < 60 then 'parcial'
                                when abs(hashtext('cy' || c.id)) % 100 < 95 then 'pendiente' else 'cancelada' end as dest) x on true
     where c.organizacion_id = o and c.estado = 'atendida' and not exists (select 1 from piefirme.ventas v where v.cita_id = c.id) and x.importe > 0;
    get diagnostics v_n = row_count;
    raise notice 'cuentas por cobrar: %', v_n;
  end if;

  -- 3. Insumos consumidos en consulta (curación/quiropodia/uña/verruga) -----------------------------------------------------------------
  if not exists (select 1 from piefirme.consumos_consulta where organizacion_id = o) then
    insert into piefirme.consumos_consulta (organizacion_id, consulta_id, sede_id, producto_id, cantidad, cobrar, registrado_por, created_at)
    select o, k.id, k.sede_id, p.id, 1 + abs(hashtext('cc' || k.id || p.sku)) % 2, false, k.podologo_id, k.fecha_hora + interval '25 minutes'
      from piefirme.consultas k
      join piefirme.servicios sv on sv.id = k.servicio_id and sv.codigo in ('SV-001','SV-002','SV-003','SV-004','SV-007','SV-012')
      join piefirme.productos p on p.organizacion_id = o and p.tipo = 'insumo_clinico'
     where k.organizacion_id = o and k.cita_id is not null and abs(hashtext('cs' || k.id || p.sku)) % 100 < 55;
    get diagnostics v_n = row_count;
    raise notice 'consumos: %', v_n;
  end if;

  -- 4. Portal de reserva: una reserva confirmada por cada cita de origen «portal» + reservas fallidas/vencidas sin cita ----------------
  if not exists (select 1 from piefirme.reservas_portal where organizacion_id = o) then
    create temp table _rp on commit drop as
      select gen_random_uuid() as rid, c.id as cita_id, c.sede_id, c.servicio_id, c.podologo_id, c.cabina_id, c.inicio, c.fin, c.paciente_id, c.primera_vez, c.motivo_consulta,
             coalesce(nullif(c.precio_servicio, 0), 0) as precio, coalesce(c.anticipo_requerido, 0) as anticipo
        from piefirme.citas c where c.organizacion_id = o and c.origen = 'portal';
    insert into piefirme.reservas_portal (id, organizacion_id, sede_id, servicio_id, podologo_id, cabina_id, inicio, fin, tipo_atencion, estado, token_hash, precio, anticipo_monto, saldo,
        nombre, apellidos, fecha_nacimiento, sexo, celular, correo, primera_vez, motivo_consulta, paciente_id, cita_id, created_at)
    select r.rid, o, r.sede_id, r.servicio_id, r.podologo_id, r.cabina_id, r.inicio, r.fin, 'presencial', 'confirmada', md5('rp' || r.cita_id), r.precio, least(r.anticipo, r.precio), greatest(r.precio - r.anticipo, 0),
           p.nombre, coalesce(p.apellido_paterno, '') || ' ' || coalesce(p.apellido_materno, ''), coalesce(p.fecha_nacimiento, date '1970-01-01'), p.sexo,
           coalesce(p.telefono_celular, '5500000000'), coalesce(p.email, 'sin-correo-' || left(p.id::text, 6) || '@correo.mx'), r.primera_vez, r.motivo_consulta, r.paciente_id, r.cita_id,
           r.inicio - make_interval(days => 1 + abs(hashtext('rd' || r.cita_id)) % 6)
      from _rp r join piefirme.pacientes p on p.id = r.paciente_id;
    get diagnostics v_n = row_count;
    update piefirme.citas c set reserva_portal_id = r.rid from _rp r where c.id = r.cita_id;
    -- intentos que no terminaron en cita (≈ 9 % de las reservas): pago rechazado, retención vencida, horario ya ocupado
    insert into piefirme.reservas_portal (organizacion_id, sede_id, servicio_id, podologo_id, inicio, fin, tipo_atencion, estado, token_hash, precio, anticipo_monto, saldo,
        nombre, apellidos, fecha_nacimiento, sexo, celular, correo, primera_vez, motivo_estado, created_at)
    select o, r.sede_id, r.servicio_id, r.podologo_id, r.inicio + interval '7 days', r.fin + interval '7 days', 'presencial',
           (array['pago_rechazado','vencida','horario_no_disponible'])[1 + abs(hashtext('re' || r.cita_id)) % 3],
           md5('rf' || r.cita_id), r.precio, least(r.anticipo, r.precio), greatest(r.precio - r.anticipo, 0),
           p.nombre, coalesce(p.apellido_paterno, ''), coalesce(p.fecha_nacimiento, date '1970-01-01'), p.sexo, coalesce(p.telefono_celular, '5500000000'), coalesce(p.email, 'intento@correo.mx'), true,
           (array['Tarjeta rechazada','Retención de 10 minutos vencida','Otro paciente tomó el horario'])[1 + abs(hashtext('re' || r.cita_id)) % 3], r.inicio - interval '3 days'
      from _rp r join piefirme.pacientes p on p.id = r.paciente_id
     where abs(hashtext('rx' || r.cita_id)) % 100 < 9 and r.inicio + interval '7 days' < now();
    raise notice 'reservas portal: %', v_n;
  end if;

  -- 5. Ligas de cita (confirmar / reprogramar / cancelar) en las citas de portal y WhatsApp de los últimos 60 días -------------------------
  if not exists (select 1 from piefirme.ligas_cita where organizacion_id = o) then
    insert into piefirme.ligas_cita (organizacion_id, cita_id, token_hash, estado, vence_en, accion, usada_en, nuevo_inicio, created_at)
    select o, c.id, md5('lc' || c.id), l.estado, c.inicio - interval '2 hours', case when l.estado = 'usada' then l.accion end,
           case when l.estado = 'usada' then c.inicio - interval '1 day' end,
           case when l.estado = 'usada' and l.accion = 'reprogramar' then c.inicio end, c.inicio - interval '2 days'
      from piefirme.citas c
      join lateral (select case when abs(hashtext('l1' || c.id)) % 100 < 65 then 'usada' when abs(hashtext('l1' || c.id)) % 100 < 85 then 'expirada' else 'revocada' end as estado,
                           (array['confirmar','confirmar','reprogramar','cancelar'])[1 + abs(hashtext('l2' || c.id)) % 4] as accion) l on true
     where c.organizacion_id = o and c.origen in ('portal', 'whatsapp') and c.inicio > now() - interval '60 days';
    get diagnostics v_n = row_count;
    raise notice 'ligas: %', v_n;
  end if;
  {{FIN}}
end $$;
