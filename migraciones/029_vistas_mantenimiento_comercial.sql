-- 029 · Cierre del dominio B: vistas prp_* transversales (agenda, ingreso por servicio, ocupación, ventas por día, pendientes de cobro)
-- y mantenimiento programable (retenciones vencidas, lista de espera, caducidad de planes/gift cards/membresías, avisos de vencimiento).
-- Reglas: P-036, P-041, P-045 (alerta de cobro), P-052, P-070, P-073, P-091, P-098, P-101. Dependencias: 001, 010, 020..028.

-- ───────────────────────────── vistas ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create or replace view piefirme.prp_agenda with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, se.nombre as sede_nombre, c.folio,
       c.inicio, c.fin, c.duracion_min, c.estado, c.tipo_atencion, c.origen, c.sobrecupo,
       c.paciente_id,
       btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '') || ' ' || coalesce(p.apellido_materno, '')) as paciente_nombre,
       p.telefono_celular as paciente_celular, p.numero_expediente,
       c.servicio_id, s.nombre as servicio_nombre, s.categoria as servicio_categoria,
       c.podologo_id, pf.nombre as podologo_nombre, c.atendio_id,
       c.cabina_id, cb.nombre as cabina_nombre,
       c.precio_servicio, c.anticipo_requerido,
       coalesce((select a.estado from piefirme.anticipos a where a.cita_id = c.id order by a.created_at desc limit 1), 'sin_anticipo') as anticipo_estado,
       c.plan_adquirido_id, c.plan_tratamiento_id, c.seguimiento_garantia, c.primera_vez, c.reprogramaciones, c.notas, c.motivo_consulta,
       c.direccion_visita, c.motivo_cancelacion, c.cancelacion_fuera_de_plazo,
       (c.estado in ('por_confirmar', 'confirmada') and c.inicio < now() - make_interval(mins => piefirme_app.param_num(c.organizacion_id, 'tolerancia_no_asistio_min', 15)::int)) as posible_no_asistio
  from piefirme.citas c
  join piefirme.sedes se on se.id = c.sede_id
  join piefirme.pacientes p on p.id = c.paciente_id
  join piefirme.servicios s on s.id = c.servicio_id
  join piefirme.perfiles pf on pf.id = c.podologo_id
  left join piefirme.cabinas cb on cb.id = c.cabina_id;

-- Cita atendida sin ticket (alerta de cobro, P-045)
create or replace view piefirme.prp_citas_sin_cobro with (security_invoker = true) as
select c.id as cita_id, c.organizacion_id, c.sede_id, c.folio, c.inicio, c.fin_atencion_en, c.paciente_id,
       btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')) as paciente_nombre,
       c.servicio_id, s.nombre as servicio_nombre, c.precio_servicio, c.podologo_id,
       round((extract(epoch from (now() - coalesce(c.fin_atencion_en, c.fin))) / 3600)::numeric, 1) as horas_sin_cobrar
  from piefirme.citas c
  join piefirme.pacientes p on p.id = c.paciente_id
  join piefirme.servicios s on s.id = c.servicio_id
 where c.estado = 'atendida' and c.plan_adquirido_id is null and not c.seguimiento_garantia and c.precio_servicio > 0
   and not exists (select 1 from piefirme.ventas v where v.cita_id = c.id and v.estado <> 'cancelada');

-- Ingreso por servicio/producto (base cobrado por fecha de pago, P-091; renglón del EDR, P-101)
create or replace view piefirme.prp_ingreso_por_servicio with (security_invoker = true) as
select v.organizacion_id, v.sede_id, se.nombre as sede_nombre,
       date_trunc('month', v.cobrada_en at time zone piefirme_app.zona_org(v.organizacion_id))::date as mes,
       l.tipo, coalesce(l.servicio_id, l.producto_id, l.oferta_id) as item_id, l.descripcion, l.renglon_edr,
       sum(l.cantidad) as cantidad, sum(l.importe_bruto) as importe_bruto, sum(l.descuento) as descuento,
       sum(l.importe) as importe, sum(l.base_neta) as base_neta, sum(l.iva_monto) as iva
  from piefirme.venta_lineas l
  join piefirme.ventas v on v.id = l.venta_id
  join piefirme.sedes se on se.id = v.sede_id
 where v.estado in ('cobrada', 'por_facturar', 'facturada')
 group by v.organizacion_id, v.sede_id, se.nombre, 4, l.tipo, 6, l.descripcion, l.renglon_edr;

-- Ventas por día contable y método (devengado vs cobrado; anticipos aplicados aparte, P-059)
create or replace view piefirme.prp_ventas_por_dia with (security_invoker = true) as
select v.organizacion_id, v.sede_id, se.nombre as sede_nombre,
       (v.cobrada_en at time zone piefirme_app.zona_org(v.organizacion_id))::date as dia,
       count(*) as tickets, sum(v.total) as ventas_total, sum(v.descuento_total) as descuentos, sum(v.iva_total) as iva_incluido,
       sum(v.anticipo_aplicado) as anticipos_aplicados, sum(x.dinero) as cobrado_dinero
  from piefirme.ventas v
  join piefirme.sedes se on se.id = v.sede_id
  cross join lateral (select coalesce(sum(p.monto), 0) as dinero from piefirme.pagos p
                       where p.venta_id = v.id and p.metodo not in ('anticipo', 'gift_card', 'cortesia')) x
 where v.estado in ('cobrada', 'por_facturar', 'facturada')
 group by v.organizacion_id, v.sede_id, se.nombre, 4;

-- Ocupación del podólogo por día: minutos agendados/atendidos / minutos disponibles (P-098)
create or replace view piefirme.prp_ocupacion_podologo_dia with (security_invoker = true) as
select d.organizacion_id, d.sede_id, d.podologo_id, d.podologo_nombre, d.dia,
       d.minutos_agendados, d.minutos_atendidos, d.citas_atendidas, d.no_asistio, d.canceladas,
       coalesce((select sum(extract(epoch from (h.hora_fin - h.hora_inicio)) / 60)
                   from piefirme.horarios_atencion h
                  where h.podologo_id = d.podologo_id and h.sede_id = d.sede_id and h.activo
                    and h.dia_semana = extract(isodow from d.dia)
                    and h.vigente_desde <= d.dia and (h.vigente_hasta is null or h.vigente_hasta >= d.dia)), 0)::int as minutos_disponibles
  from (select c.organizacion_id, c.sede_id, c.podologo_id, pf.nombre as podologo_nombre,
               (c.inicio at time zone piefirme_app.zona_org(c.organizacion_id))::date as dia,
               sum(c.duracion_min) filter (where c.estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida')) as minutos_agendados,
               sum(c.duracion_min) filter (where c.estado = 'atendida') as minutos_atendidos,
               count(*) filter (where c.estado = 'atendida') as citas_atendidas,
               count(*) filter (where c.estado = 'no_asistio') as no_asistio,
               count(*) filter (where c.estado = 'cancelada') as canceladas
          from piefirme.citas c join piefirme.perfiles pf on pf.id = c.podologo_id
         group by c.organizacion_id, c.sede_id, c.podologo_id, pf.nombre, 5) d;

-- Vigencias por vencer (planes, gift cards, membresías) para avisar 30 días antes (P-070, P-073)
create or replace view piefirme.prp_vigencias_por_vencer with (security_invoker = true) as
select 'plan'::text as tipo, pa.id, pa.organizacion_id, pa.paciente_id, pa.folio as referencia, pa.caduca_el as vence_el,
       (pa.sesiones_total - pa.sesiones_usadas)::numeric as saldo
  from piefirme.planes_adquiridos pa where pa.estado = 'vigente' and pa.caduca_el <= current_date + 30
union all
select 'gift_card', g.id, g.organizacion_id, null, g.codigo, g.caduca_el, g.saldo
  from piefirme.gift_cards g where g.estado = 'activa' and g.caduca_el <= current_date + 30
union all
select 'membresia', m.id, m.organizacion_id, m.paciente_id, m.id::text, m.vencimiento, null
  from piefirme.membresias_paciente m where m.estado = 'vigente' and m.vencimiento <= current_date + 30;

-- ───────────────────────────── mantenimiento programable (pg_cron o función de servidor, service_role) ─────────────────────────────
create or replace function piefirme.mantenimiento_comercial() returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare n_ret int; n_ant int; n_le int; n_notif int := 0; n_plan int; n_gift int; n_mem int; n_of1 int; n_of2 int; n_av int := 0; l record; n_int int;
begin
  -- retenciones de horario vencidas (P-036)
  update piefirme.reservas_portal set estado = 'vencida', retenido_hasta = retenido_hasta where estado = 'retenido' and retenido_hasta <= now();
  get diagnostics n_ret = row_count;
  -- anticipos con liga de pago vencida
  update piefirme.anticipos set estado = 'vencido' where estado = 'pendiente' and liga_vence_en is not null and liga_vence_en < now();
  get diagnostics n_ant = row_count;
  -- lista de espera: sin respuesta tras la ventana → vencida y pasa al siguiente (P-041); vence a los 14 días
  for l in select * from piefirme.lista_espera where estado = 'notificado' and notificado_hasta < now() loop
    update piefirme.lista_espera set estado = 'vencida' where id = l.id;
    if piefirme_app.notificar_lista_espera(l.sede_id, l.servicio_id, l.podologo_id) is not null then n_notif := n_notif + 1; end if;
  end loop;
  update piefirme.lista_espera set estado = 'vencida' where estado in ('esperando', 'notificado') and vence_el < now();
  get diagnostics n_le = row_count;
  -- caducidad de planes, gift cards y membresías (los planes pierden sesiones sin reembolso, P-070)
  update piefirme.planes_adquiridos pa set estado = 'caducado' where estado = 'vigente' and caduca_el < piefirme_app.hoy_org(pa.organizacion_id);
  get diagnostics n_plan = row_count;
  update piefirme.gift_cards g set estado = 'caducada' where estado = 'activa' and caduca_el < piefirme_app.hoy_org(g.organizacion_id);
  get diagnostics n_gift = row_count;
  update piefirme.membresias_paciente m set estado = 'vencida' where estado = 'vigente' and vencimiento < piefirme_app.hoy_org(m.organizacion_id);
  get diagnostics n_mem = row_count;
  -- ofertas: programada → activa; activa → vencida (S33)
  update piefirme.ofertas o set estado = 'activa' where estado = 'programada' and vigente_desde <= piefirme_app.hoy_org(o.organizacion_id) and (vigente_hasta is null or vigente_hasta >= piefirme_app.hoy_org(o.organizacion_id));
  get diagnostics n_of1 = row_count;
  update piefirme.ofertas o set estado = 'vencida' where estado in ('activa', 'programada') and vigente_hasta is not null and vigente_hasta < piefirme_app.hoy_org(o.organizacion_id);
  get diagnostics n_of2 = row_count;
  -- avisos 30 días antes del vencimiento de planes y membresías (una sola vez)
  for l in select pa.organizacion_id, pa.sede_compra_id as sede_id, pa.paciente_id, pa.id, 'vencimiento_plan' as tipo
             from piefirme.planes_adquiridos pa
            where pa.estado = 'vigente' and pa.caduca_el = piefirme_app.hoy_org(pa.organizacion_id) + piefirme_app.param_num(pa.organizacion_id, 'aviso_vencimiento_dias', 30)::int
              and not exists (select 1 from piefirme.recordatorios r where r.tipo = 'vencimiento_plan' and r.cuerpo = pa.id::text)
            union all
           select m.organizacion_id, m.sede_venta_id, m.paciente_id, m.id, 'renovacion_membresia'
             from piefirme.membresias_paciente m
            where m.estado = 'vigente' and m.vencimiento = piefirme_app.hoy_org(m.organizacion_id) + piefirme_app.param_num(m.organizacion_id, 'aviso_vencimiento_dias', 30)::int
              and not exists (select 1 from piefirme.recordatorios r where r.tipo = 'renovacion_membresia' and r.cuerpo = m.id::text) loop
    insert into piefirme.recordatorios (organizacion_id, sede_id, paciente_id, tipo, canal, destino, programado_para, incluye_liga, cuerpo, estado)
    select l.organizacion_id, l.sede_id, l.paciente_id, l.tipo, piefirme_app.param_txt(l.organizacion_id, 'recordatorio_canal', 'correo'),
           case when piefirme_app.param_txt(l.organizacion_id, 'recordatorio_canal', 'correo') = 'correo' then p.email else p.telefono_celular end,
           now(), false, l.id::text, case when coalesce(p.acepta_recordatorios, true) then 'programado' else 'omitido' end
      from piefirme.pacientes p where p.id = l.paciente_id;
    n_av := n_av + 1;
  end loop;
  delete from piefirme.portal_intentos where created_at < now() - interval '2 days';
  get diagnostics n_int = row_count;
  return jsonb_build_object('reservas_vencidas', n_ret, 'anticipos_vencidos', n_ant, 'lista_espera_vencida', n_le, 'lista_espera_notificados', n_notif,
                            'planes_caducados', n_plan, 'gift_cards_caducadas', n_gift, 'membresias_vencidas', n_mem,
                            'ofertas_activadas', n_of1, 'ofertas_vencidas', n_of2, 'avisos_programados', n_av, 'intentos_purgados', n_int);
end $$;
revoke all on function piefirme.mantenimiento_comercial() from public, anon, authenticated;
grant execute on function piefirme.mantenimiento_comercial() to service_role;
