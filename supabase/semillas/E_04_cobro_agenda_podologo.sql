-- Semilla E_04 · COBRO de las citas atendidas que aún no tienen ticket (agenda de p@g.com, sembrada en E_03).
-- Por cada sede y día del rango {{DESDE}} … {{HASTA}} (exclusivo): un turno de «Caja 2», un ticket por cita atendida con precio, su pago por método,
-- cobro, cierre de turno con el cajero y revisión del administrador. Misma lógica que la sección 3 de E_01; sin ventas de mostrador.
-- Se corre mes por mes con scripts/cargar-historial.mjs (o sustituyendo las fechas a mano). Idempotente: solo toma citas sin venta. Sintético.
-- Requiere E_03 (citas de p@g.com) y B_00/B_01/B_02 (organización, perfiles a0000000-…, servicios).

do $$
declare
  o     constant uuid := '00000000-0000-0000-0000-00000000c0de';
  recep constant uuid := 'a0000000-0000-0000-0000-000000000002';
  adm   constant uuid := 'a0000000-0000-0000-0000-000000000001';
  tz    constant text := 'America/Mexico_City';
  d0    constant date := date '{{DESDE}}';
  d1    constant date := date '{{HASTA}}';
  t record; v_turno uuid; v_ids uuid[]; v_ef numeric; v_dif numeric;
begin
  perform set_config('app.ignorar_cierre', 'on', true);   -- como C_01, C_02, C_03 y E_02: la semilla de prueba completa meses ya cerrados
  perform set_config('app.cerrando', 'off', true);
  for t in
    select distinct c.sede_id, (c.inicio at time zone tz)::date as dia
      from piefirme.citas c
     where c.organizacion_id = o and c.estado = 'atendida' and c.precio_servicio > 0 and c.plan_adquirido_id is null
       and c.inicio >= (d0::timestamp at time zone tz) and c.inicio < (d1::timestamp at time zone tz)
       and not exists (select 1 from piefirme.ventas v where v.cita_id = c.id)
     order by 2, 1
  loop
    insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial)
    values (o, t.sede_id, 'Caja 2', 'Turno agenda podólogo', recep, (t.dia + time '08:30') at time zone tz, 1000) returning id into v_turno;

    with ins as (
      insert into piefirme.ventas (organizacion_id, sede_id, cita_id)
      select o, c.sede_id, c.id from piefirme.citas c
       where c.organizacion_id = o and c.sede_id = t.sede_id and (c.inicio at time zone tz)::date = t.dia and c.estado = 'atendida'
         and c.precio_servicio > 0 and c.plan_adquirido_id is null
         and not exists (select 1 from piefirme.ventas v where v.cita_id = c.id)
       order by c.inicio
      returning id)
    select coalesce(array_agg(id), '{}') into v_ids from ins;
    insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, servicio_id, cantidad)
    select o, v.id, 'servicio', c.servicio_id, 1 from piefirme.ventas v join piefirme.citas c on c.id = v.cita_id where v.id = any (v_ids);

    insert into piefirme.pagos (organizacion_id, venta_id, metodo, monto, referencia, efectivo_recibido, ultimos4)
    select o, v.id, m.metodo, v.total - v.anticipo_aplicado,
           case when m.metodo = 'efectivo' then null else 'SINT-' || substr(v.id::text, 1, 6) end,
           case when m.metodo = 'efectivo' then ceil((v.total - v.anticipo_aplicado) / 10) * 10 end,
           case when m.metodo in ('tarjeta', 'clip') then lpad((abs(hashtext(v.id::text)) % 10000)::text, 4, '0') end
      from piefirme.ventas v
      cross join lateral (select (array['efectivo', 'tarjeta', 'clip', 'transferencia', 'efectivo'])[1 + abs(hashtext(v.id::text)) % 5] as metodo) m
     where v.id = any (v_ids) and v.total - v.anticipo_aplicado > 0;

    update piefirme.ventas v set estado = 'cobrada', turno_id = v_turno, cajero_id = recep,
           cobrada_en = coalesce((select c.fin + interval '10 minutes' from piefirme.citas c where c.id = v.cita_id), (t.dia + time '16:00') at time zone tz)
     where v.id = any (v_ids) and v.estado = 'por_cobrar';

    select coalesce(sum(p.monto), 0) into v_ef from piefirme.pagos p join piefirme.ventas v on v.id = p.venta_id where v.turno_id = v_turno and p.metodo = 'efectivo';
    v_dif := case when abs(hashtext('z' || v_turno::text)) % 7 = 0 then -10 else 0 end;
    perform set_config('request.jwt.claim.sub', recep::text, true);
    perform piefirme.cerrar_turno(v_turno, 1000 + v_ef + v_dif, case when v_dif <> 0 then 'Faltante sintético por cambio' end);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    perform piefirme.revisar_turno(v_turno);
    perform set_config('request.jwt.claim.sub', '', true);
  end loop;

  -- hora de cierre coherente con la fecha del turno (los turnos cerrados son de solo lectura; se corrige como propietario de la tabla)
  alter table piefirme.turnos_caja disable trigger user;
  update piefirme.turnos_caja set cierre_en = apertura_en + interval '9 hours'
   where organizacion_id = o and nombre_turno = 'Turno agenda podólogo' and apertura_en >= (d0::timestamp at time zone tz) and apertura_en < (d1::timestamp at time zone tz);
  alter table piefirme.turnos_caja enable trigger user;
  update piefirme.cortes_caja c set created_at = t2.apertura_en + interval '9 hours'
    from piefirme.turnos_caja t2 where t2.id = c.turno_id and c.organizacion_id = o and t2.nombre_turno = 'Turno agenda podólogo'
     and t2.apertura_en >= (d0::timestamp at time zone tz) and t2.apertura_en < (d1::timestamp at time zone tz);
end $$;
