-- 060 · UTILERÍAS · Validación del sistema (chequeos de integridad por clínica) y Entrega (checklist de puesta en marcha).
-- Depende de: 001, 010, 020, 022, 023, 026, 027, 029, 031, 040, 043, 045, 047, 054, 056 (tablas y vistas que se revisan).
-- Clon adaptado de la «Validación» y la «Entrega» de IRP. Solo lectura sobre los datos de negocio: las vistas NO corrigen nada, solo señalan.
--   · prp_validacion_detalle  → un renglón por registro con problema (clave del chequeo, registro, fecha, importe, descripción).
--   · prp_validacion_chequeos → conteo e importe por sede y chequeo (se agrega desde el detalle).
--   · prp_entrega_indicadores → conteos objetivos para el checklist de puesta en marcha (sedes, usuarios, precios, plantillas, CFDI, importación).
--   · entrega_pasos           → estado manual por paso (pendiente / en proceso / completado / no aplica) con nota; solo Administrador.
-- Todas las vistas son security_invoker y devuelven filas SOLO si quien consulta es Administrador de su clínica (MATRIZ_ROLES: utilerías = Administración).
-- Tolerancias: cuadre EDR ±$1.00 por periodo; conciliación pendiente > 3 días (PARAMETROS_DEFAULT.conciliacion_tolerancia_dias); nota sin firmar > 24 h.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── detalle de chequeos ─────────────────────────────
create or replace view piefirme.prp_validacion_detalle with (security_invoker = true) as
select d.* from (
  -- 1 · Ingresos sin cobro: ligados a un ticket cancelado sin reembolso, o a un ticket que sigue «por cobrar»
  select i.organizacion_id, i.sede_id, 'ingresos_sin_cobro'::text as clave, i.id as registro_id,
         coalesce(i.referencia, i.concepto, 'Ingreso')::text as referencia, i.fecha_pago as fecha, i.importe::numeric as importe,
         ('Ligado al ticket ' || coalesce(v.folio, '¿?') || ' en estado «' || v.estado || '»')::text as descripcion
    from piefirme.ingresos i join piefirme.ventas v on v.id = i.venta_id
   where not i.es_reembolso
     and ((v.estado = 'cancelada' and not exists (select 1 from piefirme.ingresos r where r.ingreso_origen_id = i.id))
          or v.estado = 'por_cobrar')
  union all
  -- 2 · Ventas cobradas sin ingreso (con pagos reales y líneas que no sean solo tarjeta de regalo)
  select v.organizacion_id, v.sede_id, 'ventas_sin_ingreso', v.id, coalesce(v.folio, 'Ticket'),
         piefirme_app.c_fecha_local(v.organizacion_id, v.cobrada_en), v.total,
         ('Ticket «' || v.estado || '» con pagos y sin ingreso registrado')::text
    from piefirme.ventas v
   where v.estado in ('cobrada', 'por_facturar', 'facturada') and v.cobrada_en is not null
     and exists (select 1 from piefirme.pagos p where p.venta_id = v.id and p.metodo not in ('cortesia', 'anticipo'))
     and exists (select 1 from piefirme.venta_lineas l where l.venta_id = v.id and l.tipo <> 'gift_card')
     and not exists (select 1 from piefirme.ingresos i where i.venta_id = v.id)
  union all
  -- 3 · Facturas vigentes sin venta (la global debe tener tickets ligados)
  select f.organizacion_id, f.sede_id, 'facturas_sin_venta', f.id, (coalesce(f.serie, '') || coalesce(f.folio::text, 's/folio')),
         piefirme_app.c_fecha_local(f.organizacion_id, f.created_at), f.total,
         (case when f.es_global then 'Factura global sin tickets ligados' else 'Factura de ingreso sin ticket de venta' end)::text
    from piefirme.facturas f
   where f.estado in ('vigente', 'cancelacion_en_proceso') and f.tipo_comprobante = 'I'
     and ((not f.es_global and f.venta_id is null)
          or (f.es_global and not exists (select 1 from piefirme.factura_global_ventas g where g.factura_id = f.id)))
  union all
  -- 4 · Inventario negativo (P-085 lo permite pero hay que conciliarlo)
  select s.organizacion_id, s.sede_id, 'inventario_negativo', s.id, pr.nombre::text, s.updated_at::date, null::numeric,
         ('Existencia ' || s.existencia::text || ' de «' || pr.nombre || '»')::text
    from piefirme.inventario_sede s join piefirme.productos pr on pr.id = s.producto_id
   where s.existencia < 0
  union all
  -- 5 · Citas atendidas sin cobro por más de 24 h (misma regla que prp_citas_sin_cobro)
  select c.organizacion_id, c.sede_id, 'citas_sin_cobro', c.cita_id, coalesce(c.folio, 'Cita'), c.inicio::date, c.precio_servicio,
         ('Atendida hace ' || c.horas_sin_cobrar::text || ' h sin ticket · ' || c.paciente_nombre || ' · ' || c.servicio_nombre)::text
    from piefirme.prp_citas_sin_cobro c
   where c.horas_sin_cobrar > 24
  union all
  -- 6 · Notas clínicas sin firmar por más de 24 h (NOM-004: la firma cierra la nota)
  select n.organizacion_id, n.sede_id, 'notas_sin_firmar', n.id, coalesce(n.folio, 'Consulta'), n.fecha_hora::date, null::numeric,
         ('Consulta en estado «' || n.estado || '» desde ' || to_char(n.fecha_hora, 'YYYY-MM-DD HH24:MI'))::text
    from piefirme.consultas n
   where n.estado <> 'cerrada' and n.fecha_hora < now() - interval '24 hours'
  union all
  -- 7 · Pacientes con consulta y sin aviso de privacidad / consentimiento de datos de salud firmados (P-003)
  select p.organizacion_id, p.sede_registro_id, 'consentimientos_faltantes', p.id, coalesce(p.numero_expediente, 'Paciente'), p.created_at::date, null::numeric,
         ('Falta: ' || concat_ws(' y ',
            case when not exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'aviso_privacidad' and c.estado = 'firmado') then 'aviso de privacidad' end,
            case when not exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'datos_salud' and c.estado = 'firmado') then 'consentimiento de datos de salud' end))::text
    from piefirme.pacientes p
   where p.estado = 'activo'
     and exists (select 1 from piefirme.consultas k where k.paciente_id = p.id)
     and (not exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'aviso_privacidad' and c.estado = 'firmado')
          or not exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'datos_salud' and c.estado = 'firmado'))
  union all
  -- 8 · Conciliación pendiente: movimientos del banco sin resolver pasados 3 días
  select m.organizacion_id, m.sede_id, 'conciliacion_pendiente', m.id, coalesce(m.referencia, m.descripcion)::text, m.fecha, m.monto,
         ('Movimiento «' || m.estado || '» desde hace ' || (current_date - m.fecha)::text || ' días')::text
    from piefirme.movimientos_bancarios m
   where m.estado in ('detectado', 'sugerido', 'ambiguo') and m.fecha < current_date - 3
  union all
  -- 9 · Cuadre EDR vs ingresos (periodos no cerrados, últimos 6 meses): base sin IVA, reembolsos restan
  select x.organizacion_id, x.sede_id, 'cuadre_edr_ingresos', x.periodo_id, (x.anio::text || '-' || lpad(x.mes::text, 2, '0')), make_date(x.anio, x.mes, 1), x.edr - x.fuente,
         ('EDR $' || to_char(x.edr, 'FM999,999,990.00') || ' vs ingresos $' || to_char(x.fuente, 'FM999,999,990.00') || ' (' || x.estado || ')')::text
    from (
      select pe.organizacion_id, pe.sede_id, pe.id as periodo_id, pe.anio, pe.mes, pe.estado,
             coalesce((select sum(l.real_auto) from piefirme.edr_lineas l join piefirme.edr_renglones r on r.id = l.renglon_id
                        where l.periodo_id = pe.id and r.tipo = 'ingreso'), 0) as edr,
             coalesce((select sum(case when i.es_reembolso then -(i.importe - i.iva) else (i.importe - i.iva) end) from piefirme.ingresos i
                        where i.sede_id = pe.sede_id and i.fecha_pago >= make_date(pe.anio, pe.mes, 1)
                          and i.fecha_pago < (make_date(pe.anio, pe.mes, 1) + interval '1 month')::date), 0) as fuente
        from piefirme.edr_periodos pe
       where pe.estado <> 'cerrado' and make_date(pe.anio, pe.mes, 1) >= (date_trunc('month', current_date) - interval '6 months')::date
    ) x where abs(x.edr - x.fuente) > 1.00
  union all
  -- 10 · Cuadre EDR vs gastos (organización completa por periodo: incluye gastos compartidos repartidos entre sedes)
  select y.organizacion_id, null::uuid, 'cuadre_edr_gastos', null::uuid, (y.anio::text || '-' || lpad(y.mes::text, 2, '0')), make_date(y.anio, y.mes, 1), y.edr - y.fuente,
         ('EDR $' || to_char(y.edr, 'FM999,999,990.00') || ' vs gastos guardados $' || to_char(y.fuente, 'FM999,999,990.00'))::text
    from (
      select pe.organizacion_id, pe.anio, pe.mes,
             coalesce(sum(l.real_auto) filter (where r.tipo in ('gasto', 'fijo')), 0) as edr,
             coalesce((select sum(g.subtotal) from piefirme.gastos g
                        where g.organizacion_id = pe.organizacion_id and g.estado = 'guardado' and g.fecha >= make_date(pe.anio, pe.mes, 1)
                          and g.fecha < (make_date(pe.anio, pe.mes, 1) + interval '1 month')::date), 0) as fuente
        from piefirme.edr_periodos pe
        left join piefirme.edr_lineas l on l.periodo_id = pe.id
        left join piefirme.edr_renglones r on r.id = l.renglon_id
       where make_date(pe.anio, pe.mes, 1) >= (date_trunc('month', current_date) - interval '6 months')::date
         and exists (select 1 from piefirme.edr_periodos q where q.organizacion_id = pe.organizacion_id and q.anio = pe.anio and q.mes = pe.mes and q.estado <> 'cerrado')
       group by pe.organizacion_id, pe.anio, pe.mes
    ) y where abs(y.edr - y.fuente) > 1.00
  union all
  -- 11 · Expedientes duplicados: mismo nombre, apellido paterno y fecha de nacimiento (si no se confirmó «no es la misma persona», P-006)
  select p.organizacion_id, p.sede_registro_id, 'expedientes_duplicados', p.id, coalesce(p.numero_expediente, 'Paciente'), p.created_at::date, null::numeric,
         ('Coincide con otro expediente activo: ' || btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')) || ' · nac. ' || p.fecha_nacimiento::text)::text
    from piefirme.pacientes p
   where p.estado = 'activo' and not p.homonimo_confirmado and p.fecha_nacimiento is not null
     and exists (select 1 from piefirme.pacientes q
                  where q.organizacion_id = p.organizacion_id and q.id <> p.id and q.estado = 'activo'
                    and lower(btrim(q.nombre)) = lower(btrim(p.nombre))
                    and lower(btrim(coalesce(q.apellido_paterno, ''))) = lower(btrim(coalesce(p.apellido_paterno, '')))
                    and q.fecha_nacimiento = p.fecha_nacimiento)
  union all
  -- 12 · Ingresos descuadrados contra sus aplicaciones a cuentas por cobrar (vista de 043)
  select d.organizacion_id, d.sede_id, 'ingresos_descuadrados', d.ingreso_id, d.problema::text, d.fecha_pago, d.diferencia,
         ('Ingreso $' || to_char(d.importe, 'FM999,999,990.00') || ' con aplicaciones por $' || to_char(d.total_aplicado, 'FM999,999,990.00'))::text
    from piefirme.prp_ingresos_descuadrados d
) d
where piefirme_app.es_admin() and d.organizacion_id = piefirme_app.org_id();

create or replace view piefirme.prp_validacion_chequeos with (security_invoker = true) as
select d.organizacion_id, d.sede_id, d.clave, count(*)::integer as n, coalesce(sum(d.importe), 0)::numeric(14,2) as importe, min(d.fecha) as desde, max(d.fecha) as hasta
  from piefirme.prp_validacion_detalle d
 group by d.organizacion_id, d.sede_id, d.clave;

-- ───────────────────────────── entrega / puesta en marcha ─────────────────────────────
create or replace view piefirme.prp_entrega_indicadores with (security_invoker = true) as
select o.id as organizacion_id,
       (select count(*) from piefirme.sedes s where s.organizacion_id = o.id and s.activa)::integer as sedes_activas,
       (select count(*) from piefirme.cabinas c where c.organizacion_id = o.id and c.activa)::integer as cabinas_activas,
       (select count(*) from piefirme.horarios_atencion h where h.organizacion_id = o.id and h.activo)::integer as horarios_activos,
       (select count(*) from piefirme.perfiles p where p.organizacion_id = o.id and p.activo)::integer as usuarios_activos,
       (select count(*) from piefirme.perfiles p where p.organizacion_id = o.id and p.activo and p.rol = 'administrador')::integer as administradores,
       (select count(*) from piefirme.perfiles p where p.organizacion_id = o.id and p.activo and p.rol = 'podologo')::integer as podologos,
       (select count(*) from piefirme.perfiles p where p.organizacion_id = o.id and p.activo and p.rol = 'recepcion')::integer as recepcion,
       (select count(*) from piefirme.servicios sv where sv.organizacion_id = o.id)::integer as servicios,
       (select count(distinct pr.servicio_id) from piefirme.precios pr
         where pr.organizacion_id = o.id and pr.item_tipo = 'servicio' and pr.vigente_desde <= current_date
           and (pr.vigente_hasta is null or pr.vigente_hasta >= current_date))::integer as servicios_con_precio,
       (select count(*) from piefirme.plantillas_documento pd where pd.organizacion_id = o.id and pd.estado = 'activa')::integer as plantillas_activas,
       (select count(*) from piefirme.plantillas_documento pd where pd.organizacion_id = o.id and pd.estado = 'activa' and pd.tipo = 'aviso_privacidad')::integer as aviso_activo,
       (select count(*) from piefirme.emisor_fiscal e where e.organizacion_id = o.id and e.activo and e.rfc is not null)::integer as emisores_fiscales,
       (select pc.modo from piefirme.pac_configuracion pc where pc.organizacion_id = o.id) as pac_modo,
       (select pc.csd_vigencia from piefirme.pac_configuracion pc where pc.organizacion_id = o.id) as csd_vigencia,
       (select (pc.csd_cer_path is not null) from piefirme.pac_configuracion pc where pc.organizacion_id = o.id) as csd_cargado,
       (select count(*) from piefirme.importaciones im where im.organizacion_id = o.id and im.estado = 'cargado')::integer as importaciones_cargadas,
       (select count(*) from piefirme.pacientes pa where pa.organizacion_id = o.id)::integer as pacientes
  from piefirme.organizaciones o
 where o.id = piefirme_app.org_id() and piefirme_app.es_admin();

create table if not exists piefirme.entrega_pasos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null check (clave in ('sedes', 'usuarios', 'catalogo_precios', 'plantillas', 'cfdi', 'importacion', 'capacitacion')),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'completado', 'no_aplica')),
  responsable      text,
  nota             text,
  completado_en    timestamptz,
  actualizado_por  uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave),
  check (estado <> 'completado' or completado_en is not null)
);
create index if not exists entrega_pasos_org_idx on piefirme.entrega_pasos (organizacion_id);
create trigger t_upd before update on piefirme.entrega_pasos for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.entrega_pasos for each row execute function piefirme_app.auditar();

alter table piefirme.entrega_pasos enable row level security;
create policy ent_sel on piefirme.entrega_pasos for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy ent_ins on piefirme.entrega_pasos for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy ent_upd on piefirme.entrega_pasos for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin())
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy ent_del on piefirme.entrega_pasos for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- ───────────────────────────── permisos ─────────────────────────────
revoke all on piefirme.prp_validacion_detalle, piefirme.prp_validacion_chequeos, piefirme.prp_entrega_indicadores, piefirme.entrega_pasos from anon;
grant select on piefirme.prp_validacion_detalle, piefirme.prp_validacion_chequeos, piefirme.prp_entrega_indicadores to authenticated;
grant select, insert, update, delete on piefirme.entrega_pasos to authenticated;
