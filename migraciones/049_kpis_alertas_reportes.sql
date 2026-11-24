-- 049 · Inventario y finanzas · integración con caja/citas (pagos → ingresos, ventas → kardex, anticipos, Clip), KPIs, alertas y vistas de reporte.
-- Dominio C. Clona de IRP: Dashboard.jsx / Reportes.jsx / Finanzas.jsx (prp_kpis, prp_compras, prp_ingresos_*).
-- Reglas: P-098 (glosario), P-102 (Dashboard por rol: Administración ve todo; Recepción solo operación de su sede, sin finanzas), P-089 (Observado = alerta), P-135 (consolidado con todas las sedes).
-- Parte 1: ganchos sobre tablas de B/A (pagos, ventas, anticipos, facturas, devoluciones_venta, consumos_consulta). Parte 2: vistas.
-- Las vistas son security_invoker: la visibilidad la imponen las políticas de las tablas base (finanzas = Administración).
-- Dependencias: 040-048 y, de otros dominios, 025 (anticipos, pagos_clip), 026 (ventas, venta_lineas, pagos, devoluciones_venta), 027 (facturas), 032 (consumos_consulta).

-- ═════════════════════ PARTE 1 · Ganchos con caja, citas y consulta (el dominio C reacciona; no se asume más que lo declarado en 025/026/027/032) ═════════════════════

-- Renglón del EDR para una línea: clave exacta → nombre del servicio (alias) → texto que declara el servicio/producto (P-101) → por defecto
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.c_renglon_id(p_org uuid, p_texto text, p_tipo text, p_servicio uuid default null) returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(
    (select r.id from piefirme.edr_renglones r where r.organizacion_id = p_org and r.clave = nullif(p_texto, '')),
    (select r.id from piefirme.edr_renglones r join piefirme.servicios s on s.id = p_servicio
      where r.organizacion_id = p_org and r.tipo = 'ingreso'
        and exists (select 1 from unnest(r.alias || piefirme.proveedor_norm(r.nombre)) a where a is not null and position(a in piefirme.proveedor_norm(s.nombre)) > 0)
      order by r.orden limit 1),
    (select r.id from piefirme.edr_renglones r
      where r.organizacion_id = p_org and r.tipo = 'ingreso' and piefirme.proveedor_norm(p_texto) is not null
        and (piefirme.proveedor_norm(r.nombre) = piefirme.proveedor_norm(p_texto) or piefirme.proveedor_norm(r.clave) = piefirme.proveedor_norm(p_texto) or piefirme.proveedor_norm(p_texto) = any (r.alias))
      order by r.orden limit 1),
    (select r.id from piefirme.edr_renglones r where r.organizacion_id = p_org and r.clave = case when p_tipo = 'producto' then 'venta_productos' else 'otros_servicios' end))
$$;

create or replace function piefirme_app.c_fecha_local(p_org uuid, p_ts timestamptz) returns date
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select (p_ts at time zone coalesce((select zona_horaria from piefirme.organizaciones where id = p_org), 'America/Mexico_City'))::date
$$;

-- 1 · Pago de un ticket → ingreso (cobro por validar). Cortesía y anticipo no son dinero nuevo; la venta de gift card es pasivo (P-073).
create or replace function piefirme_app.c_pago_a_ingreso() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; v_total numeric; v_com numeric; v_iva_com numeric; v_imp numeric; v_iva numeric; v_forma text; v_clas text; v_main uuid; v_id uuid := gen_random_uuid(); r record;
begin
  if new.metodo in ('cortesia', 'anticipo') then return null; end if;
  select * into v from piefirme.ventas where id = new.venta_id;
  select coalesce(sum(importe), 0), coalesce(sum(importe) filter (where tipo <> 'gift_card'), 0), coalesce(sum(iva_monto) filter (where tipo <> 'gift_card'), 0)
    into v_total, v_com, v_iva_com from piefirme.venta_lineas where venta_id = v.id;
  if v_total <= 0 or v_com <= 0 then return null; end if;
  v_imp := round(new.monto * v_com / v_total, 2);
  if v_imp <= 0 then return null; end if;
  v_iva := least(round(v_imp * v_iva_com / v_com, 2), v_imp);
  v_forma := case new.metodo when 'clip' then 'tarjeta_clip' else new.metodo end;
  select case when count(distinct g) = 1 then min(g) else 'mixto' end into v_clas
    from (select case tipo when 'servicio' then 'servicio' when 'producto' then 'producto' else 'plan' end as g from piefirme.venta_lineas where venta_id = v.id and tipo <> 'gift_card') x;
  select piefirme_app.c_renglon_id(v.organizacion_id, l.renglon_edr, l.tipo, l.servicio_id) into v_main
    from piefirme.venta_lineas l where l.venta_id = v.id and l.tipo <> 'gift_card' group by 1 order by sum(l.importe) desc limit 1;
  perform set_config('app.c_rpc', 'on', true);
  insert into piefirme.ingresos (id, organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, renglon_id, venta_id, cita_id, pago_id, paciente_id, podologo_id,
                               referencia, concepto, origen_registro)
  values (v_id, v.organizacion_id, new.sede_id, piefirme_app.c_fecha_local(v.organizacion_id, new.created_at), v_forma, v_imp, v_iva, coalesce(v_clas, 'servicio'), v_main, v.id, v.cita_id, new.id,
          v.paciente_id, v.podologo_id, new.referencia, 'Ticket ' || coalesce(v.folio, ''), 'automatico')
  on conflict (pago_id) where pago_id is not null do nothing;
  if found then
    for r in select piefirme_app.c_renglon_id(v.organizacion_id, l.renglon_edr, l.tipo, l.servicio_id) as rid, sum(l.importe) as imp
               from piefirme.venta_lineas l where l.venta_id = v.id and l.tipo <> 'gift_card' group by 1 loop
      if r.rid is distinct from v_main and round(v_imp * r.imp / v_com, 2) > 0 then
        insert into piefirme.ingreso_renglones (organizacion_id, sede_id, ingreso_id, renglon_id, importe)
        values (v.organizacion_id, new.sede_id, v_id, r.rid, least(round(v_imp * r.imp / v_com, 2), v_imp));
      end if;
    end loop;
  end if;
  return null;
end $$;
create trigger t_ingreso_ai after insert on piefirme.pagos for each row execute function piefirme_app.c_pago_a_ingreso();

-- Un pago que se borra antes de validarse se lleva su ingreso; uno ya validado no se borra
create or replace function piefirme_app.c_pago_bd_ingreso() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_est text;
begin
  select estatus_validacion into v_est from piefirme.ingresos where pago_id = old.id;
  if v_est in ('validado', 'validado_cfdi') then
    raise exception 'el cobro ya está validado: cancela el ticket para generar el reembolso' using errcode = 'PF409';
  end if;
  delete from piefirme.ingresos where pago_id = old.id;
  return old;
end $$;
create trigger t_ingreso_bd before delete on piefirme.pagos for each row execute function piefirme_app.c_pago_bd_ingreso();

-- 2 · Ticket cobrado → kardex (venta, existencia puede quedar negativa: P-085) y fecha contable del ingreso = fecha del cobro · Ticket cancelado → reembolsos e inventario de regreso
create or replace function piefirme_app.c_venta_cobrada_kardex() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l record; v_lote uuid;
begin
  for l in select vl.*, p.tipo as ptipo from piefirme.venta_lineas vl join piefirme.productos p on p.id = vl.producto_id
            where vl.venta_id = new.id and vl.tipo = 'producto' and p.tipo = 'venta' loop      -- por encargo: sin inventario (P-087)
    v_lote := (select lp.id from piefirme.lotes_producto lp where lp.id = l.lote_id and lp.sede_id = new.sede_id and lp.producto_id = l.producto_id);
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, referencia_folio, usuario_id, fecha)
    values (new.organizacion_id, new.sede_id, l.producto_id, v_lote, 'venta', -l.cantidad, 'venta', new.id, new.folio, coalesce(new.cajero_id, auth.uid()), coalesce(new.cobrada_en, now()));
  end loop;
  -- el cobro se registra al registrar el pago; la fecha contable del ingreso es la del cobro del ticket (P-046)
  if new.cobrada_en is not null then
    update piefirme.ingresos set fecha_pago = piefirme_app.c_fecha_local(new.organizacion_id, new.cobrada_en)
     where venta_id = new.id and not es_reembolso and anticipo_id is null and fecha_pago is distinct from piefirme_app.c_fecha_local(new.organizacion_id, new.cobrada_en);
  end if;
  return null;
end $$;
create trigger t_kardex_venta after update of estado on piefirme.ventas for each row
  when (old.estado in ('por_cobrar', 'cuenta_abierta') and new.estado in ('cobrada', 'por_facturar')) execute function piefirme_app.c_venta_cobrada_kardex();

create or replace function piefirme_app.c_venta_cancelada() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare i record; k record; v_new uuid;
begin
  perform set_config('app.c_rpc', 'on', true);
  for i in select * from piefirme.ingresos x where x.venta_id = new.id and not x.es_reembolso and x.anticipo_id is null
              and not exists (select 1 from piefirme.ingresos y where y.ingreso_origen_id = x.id and y.es_reembolso) loop
    v_new := gen_random_uuid();
    insert into piefirme.ingresos (id, organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, renglon_id, venta_id, cita_id, paciente_id, podologo_id,
                                 referencia, concepto, origen_registro, es_reembolso, ingreso_origen_id)
    values (v_new, i.organizacion_id, i.sede_id, piefirme_app.c_fecha_local(i.organizacion_id, now()), i.forma_pago, i.importe, i.iva, i.clasificacion, i.renglon_id, i.venta_id, i.cita_id,
            i.paciente_id, i.podologo_id, i.referencia, 'Cancelación del ticket ' || coalesce(new.folio, ''), 'automatico', true, i.id);
    insert into piefirme.ingreso_renglones (organizacion_id, sede_id, ingreso_id, renglon_id, importe)
    select organizacion_id, sede_id, v_new, renglon_id, importe from piefirme.ingreso_renglones where ingreso_id = i.id;
  end loop;
  for k in select * from piefirme.movimientos_inventario m where m.referencia_tipo = 'venta' and m.referencia_id = new.id and m.tipo = 'venta' loop
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id, referencia_folio, nota)
    values (k.organizacion_id, k.sede_id, k.producto_id, k.lote_id, 'devolucion_cliente', -k.cantidad, k.costo_unitario, 'venta', new.id, new.folio, 'cancelación del ticket');
  end loop;
  return null;
end $$;
create trigger t_cancel_venta after update of estado on piefirme.ventas for each row
  when (new.estado = 'cancelada' and old.estado <> 'cancelada') execute function piefirme_app.c_venta_cancelada();

-- 3 · Devolución parcial (P-065): reembolso en efectivo y, si aplica, regreso a inventario
create or replace function piefirme_app.c_devolucion_a_finanzas() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l piefirme.venta_lineas%rowtype; v piefirme.ventas%rowtype; o piefirme.ingresos%rowtype; v_iva numeric;
begin
  select * into l from piefirme.venta_lineas where id = new.venta_linea_id;
  select * into v from piefirme.ventas where id = new.venta_id;
  if new.reingresa_inventario and l.tipo = 'producto' and l.producto_id is not null then
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id, referencia_folio, nota)
    values (new.organizacion_id, v.sede_id, l.producto_id, 'devolucion_cliente', new.cantidad, 'devolucion_venta', new.id, v.folio, new.motivo);
  end if;
  select * into o from piefirme.ingresos where venta_id = v.id and not es_reembolso order by fecha_pago, created_at limit 1;
  if found then
    perform set_config('app.c_rpc', 'on', true);
    v_iva := case when l.importe > 0 then least(round(new.monto * l.iva_monto / l.importe, 2), new.monto) else 0 end;
    insert into piefirme.ingresos (organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, renglon_id, venta_id, cita_id, paciente_id, podologo_id,
                                 concepto, origen_registro, es_reembolso, ingreso_origen_id)
    values (new.organizacion_id, v.sede_id, piefirme_app.c_fecha_local(new.organizacion_id, new.created_at), 'efectivo', new.monto, v_iva, o.clasificacion,
            piefirme_app.c_renglon_id(new.organizacion_id, l.renglon_edr, l.tipo, l.servicio_id), v.id, v.cita_id, v.paciente_id, v.podologo_id,
            'Devolución · ' || new.motivo, 'automatico', true, o.id);
  end if;
  return null;
end $$;
create trigger t_fin_devolucion after insert on piefirme.devoluciones_venta for each row execute function piefirme_app.c_devolucion_a_finanzas();

-- 4 · Anticipos pagados (Clip, efectivo…) → ingreso «anticipo»; reembolso procesado → reembolso
create or replace function piefirme_app.c_anticipo_a_ingreso() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o piefirme.ingresos%rowtype;
begin
  perform set_config('app.c_rpc', 'on', true);
  if new.estado in ('pagado', 'aplicado', 'no_reembolsable', 'reembolsado') and new.pagado_en is not null
     and (tg_op = 'INSERT' or old.estado = 'pendiente' or old.pagado_en is null) then
    insert into piefirme.ingresos (organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, cita_id, paciente_id, referencia, concepto, anticipo_id, origen_registro)
    values (new.organizacion_id, new.sede_id, piefirme_app.c_fecha_local(new.organizacion_id, new.pagado_en), case new.metodo when 'clip' then 'tarjeta_clip' else new.metodo end,
            new.monto, 0, 'anticipo', new.cita_id, new.paciente_id, new.referencia, 'Anticipo ' || coalesce(new.folio, ''), new.id, 'automatico')
    on conflict (anticipo_id) where anticipo_id is not null and not es_reembolso do nothing;
  end if;
  if tg_op = 'UPDATE' and new.reembolso_estado in ('procesado', 'manual') and old.reembolso_estado is distinct from new.reembolso_estado then
    select * into o from piefirme.ingresos where anticipo_id = new.id and not es_reembolso;
    if found then
      insert into piefirme.ingresos (organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, cita_id, paciente_id, referencia, concepto, origen_registro, es_reembolso, ingreso_origen_id)
      values (new.organizacion_id, new.sede_id, piefirme_app.c_fecha_local(new.organizacion_id, now()), o.forma_pago, least(coalesce(new.reembolso_monto, new.monto), o.importe), 0, 'anticipo',
              new.cita_id, new.paciente_id, new.reembolso_referencia, 'Reembolso del anticipo ' || coalesce(new.folio, ''), 'automatico', true, o.id);
    end if;
  end if;
  return null;
end $$;
create trigger t_ingreso_anticipo_i after insert on piefirme.anticipos for each row when (new.pagado_en is not null) execute function piefirme_app.c_anticipo_a_ingreso();
create trigger t_ingreso_anticipo_u after update of estado, pagado_en, reembolso_estado on piefirme.anticipos for each row execute function piefirme_app.c_anticipo_a_ingreso();

-- 5 · Factura vigente ligada a la venta → el cobro queda «con CFDI»
create or replace function piefirme_app.c_factura_a_ingreso() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.venta_id is null then return null; end if;
  perform set_config('app.c_rpc', 'on', true);
  if new.estado = 'vigente' then
    update piefirme.ingresos set factura_id = new.id,
           estatus_validacion = case when estatus_validacion = 'validado' then 'validado_cfdi' else estatus_validacion end
     where venta_id = new.venta_id and not es_reembolso and factura_id is null;
  elsif new.estado = 'cancelada' then
    update piefirme.ingresos set factura_id = null,
           estatus_validacion = case when estatus_validacion = 'validado_cfdi' then 'validado' else estatus_validacion end
     where factura_id = new.id;
  end if;
  return null;
end $$;
create trigger t_ingreso_factura after insert or update of estado on piefirme.facturas for each row execute function piefirme_app.c_factura_a_ingreso();

-- 6 · Material consumido en consulta que no se cobra → kardex (P-079: se descuenta por lo que el podólogo captura)
create or replace function piefirme_app.c_consumo_a_kardex() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_lote uuid; v_tipo text;
begin
  if tg_op = 'DELETE' then
    if old.cobrar or pg_trigger_depth() > 1 then return old; end if;
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, nota)
    select old.organizacion_id, old.sede_id, old.producto_id, m.lote_id, 'ajuste', old.cantidad, 'consumo_consulta', old.id, 'consumo eliminado'
      from (select (select lp.id from piefirme.lotes_producto lp where lp.id = old.lote_id and lp.sede_id = old.sede_id and lp.producto_id = old.producto_id) as lote_id) m
     where exists (select 1 from piefirme.movimientos_inventario k where k.referencia_tipo = 'consumo_consulta' and k.referencia_id = old.id);
    return old;
  end if;
  select tipo into v_tipo from piefirme.productos where id = new.producto_id;
  if new.cobrar or v_tipo <> 'insumo_clinico' then return new; end if;
  v_lote := (select lp.id from piefirme.lotes_producto lp where lp.id = new.lote_id and lp.sede_id = new.sede_id and lp.producto_id = new.producto_id);
  if tg_op = 'INSERT' then
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, usuario_id, fecha)
    values (new.organizacion_id, new.sede_id, new.producto_id, v_lote, 'consumo_consulta', -new.cantidad, 'consumo_consulta', new.id, new.registrado_por, new.created_at);
  elsif new.cantidad is distinct from old.cantidad then
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, referencia_id, nota)
    values (new.organizacion_id, new.sede_id, new.producto_id, v_lote, 'ajuste', old.cantidad - new.cantidad, 'consumo_consulta', new.id, 'cambio de cantidad consumida');
  end if;
  return new;
end $$;
create trigger t_kardex_consumo after insert or update of cantidad or delete on piefirme.consumos_consulta for each row execute function piefirme_app.c_consumo_a_kardex();

-- 7 · Liquidaciones de Clip (lote) a partir de pagos_clip (P-094): crea la liquidación, liga los cobros y registra la comisión como gasto (P-077)
create or replace function piefirme.clip_sincronizar_liquidaciones() returns integer
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l record; v_liq uuid; v_gasto uuid; v_grupo uuid; v_sede uuid; v_n integer := 0; v_org uuid := piefirme_app.org_id();
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración' using errcode = '42501'; end if;
  for l in select pc.liquidacion_lote as lote, max(pc.liquidado_en) as fecha, sum(pc.monto) as bruto, sum(pc.comision) as comision,
                  case when count(distinct pc.sede_id) = 1 then min(pc.sede_id::text)::uuid end as sede
             from piefirme.pagos_clip pc where pc.organizacion_id = v_org and pc.estado = 'aprobado' and pc.liquidacion_lote is not null and pc.liquidado_en is not null
            group by pc.liquidacion_lote loop
    select id, gasto_comision_id into v_liq, v_gasto from piefirme.liquidaciones_clip where organizacion_id = v_org and lote = l.lote;
    if v_liq is null then
      v_liq := gen_random_uuid();
      insert into piefirme.liquidaciones_clip (id, organizacion_id, lote, fecha_liquidacion, monto_depositado, comision_retenida)
      values (v_liq, v_org, l.lote, l.fecha, l.bruto - l.comision, l.comision);
      v_n := v_n + 1;
    end if;
    if l.comision > 0 and v_gasto is null then
      select id into v_grupo from piefirme.grupos_gasto where organizacion_id = v_org and clave = 'comision_terminal';
      v_gasto := gen_random_uuid();
      insert into piefirme.gastos (id, organizacion_id, sede_id, compartido, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
      values (v_gasto, v_org, l.sede, l.sede is null, l.fecha, v_grupo, 'transferencia', l.comision, 0, l.comision, 'Comisión de terminal · lote ' || l.lote, 'sistema', 'comision_terminal', 'guardado');
      update piefirme.liquidaciones_clip set gasto_comision_id = v_gasto where id = v_liq;
    end if;
    update piefirme.ingresos i set lote_liquidacion_id = v_liq
     where i.organizacion_id = v_org and i.lote_liquidacion_id is null and not i.es_reembolso
       and (i.pago_id in (select vp.id from piefirme.pagos vp join piefirme.pagos_clip pc on pc.id = vp.pago_clip_id where pc.liquidacion_lote = l.lote)
            or i.anticipo_id in (select pc.anticipo_id from piefirme.pagos_clip pc where pc.liquidacion_lote = l.lote and pc.anticipo_id is not null));
  end loop;
  return v_n;
end $$;
revoke all on function piefirme.clip_sincronizar_liquidaciones() from public, anon;
grant execute on function piefirme.clip_sincronizar_liquidaciones() to authenticated;

-- ═════════════════════ PARTE 2 · vistas ═════════════════════
create or replace view piefirme.prp_kpis_finanzas with (security_invoker = true) as
select s.organizacion_id, s.id as sede_id, s.nombre as sede_nombre, date_trunc('month', current_date)::date as mes,
       coalesce((select sum(case when i.es_reembolso then -i.importe else i.importe end) from piefirme.ingresos i
                  where i.sede_id = s.id and i.fecha_pago >= date_trunc('month', current_date)::date and i.fecha_pago < (date_trunc('month', current_date) + interval '1 month')::date), 0) as ingresos_mes,
       coalesce((select sum(g.total) from piefirme.gastos g where g.sede_id = s.id and g.estado = 'guardado'
                  and g.fecha >= date_trunc('month', current_date)::date and g.fecha < (date_trunc('month', current_date) + interval '1 month')::date), 0) as gastos_mes,
       (select count(*) from piefirme.ingresos i where i.sede_id = s.id and i.estatus_validacion = 'por_validar') as ingresos_por_validar,
       (select count(*) from piefirme.ingresos i where i.sede_id = s.id and i.estatus_validacion = 'observado') as ingresos_observados,
       coalesce((select sum(c.saldo) from piefirme.cuentas_por_cobrar c where c.sede_id = s.id and c.estado in ('pendiente', 'parcial')), 0) as por_cobrar,
       coalesce((select sum(c.saldo) from piefirme.cuentas_por_pagar c where c.sede_id = s.id and c.estado in ('programada', 'parcial')), 0) as por_pagar,
       (select count(*) from piefirme.cuentas_por_pagar c where c.sede_id = s.id and c.estado in ('programada', 'parcial') and c.fecha_vencimiento < current_date) as cxp_vencidas,
       (select count(*) from piefirme.prp_inventario v where v.sede_id = s.id and v.estado in ('bajo_minimo', 'sin_existencia')) as productos_bajo_minimo,
       (select count(*) from piefirme.prp_inventario v where v.sede_id = s.id and v.estado = 'caduca_pronto') as productos_caducan_pronto,
       coalesce((select sum(v.valor) from piefirme.prp_inventario v where v.sede_id = s.id), 0) as valor_inventario
  from piefirme.sedes s where s.activa;

-- Alertas operativas y financieras (una fila por situación a atender)
create or replace view piefirme.prp_alertas_financieras with (security_invoker = true) as
select i.organizacion_id, i.sede_id, 'ingreso_observado'::text as tipo, 'alta'::text as severidad, i.id as registro_id, i.fecha_pago as fecha,
       'Cobro observado de $' || i.importe || ': ' || coalesce(i.observacion, '') as mensaje
  from piefirme.ingresos i where i.estatus_validacion = 'observado'
union all
select c.organizacion_id, c.sede_id, 'cxp_vencida', 'alta', c.id, c.fecha_vencimiento, 'Cuenta por pagar vencida ' || coalesce(c.folio_factura, '') || ' · saldo $' || c.saldo
  from piefirme.cuentas_por_pagar c where c.estado in ('programada', 'parcial') and c.fecha_vencimiento < current_date
union all
select o.organizacion_id, o.sede_id, 'oc_pendiente_autorizacion', 'media', o.id, o.fecha, 'La orden ' || o.folio || ' ($' || o.total || ') requiere autorización de Administración'
  from piefirme.ordenes_compra o where o.estado = 'borrador' and o.requiere_autorizacion and o.autorizada_por is null
union all
select f.organizacion_id, f.sede_id, 'fondo_en_alerta', 'media', f.fondo_id, current_date, 'El fondo de ' || f.sede_nombre || ' va al ' || f.pct_usado || '% de su monto base'
  from piefirme.prp_fondo_semana f where f.en_alerta
union all
select v.organizacion_id, v.sede_id, 'inventario_' || v.estado, case when v.estado in ('sin_existencia', 'bajo_minimo') then 'media' else 'baja' end, v.id, current_date,
       'Producto ' || v.producto_id || ' en ' || v.sede_nombre || ': ' || v.estado
  from piefirme.prp_inventario v where v.estado in ('sin_existencia', 'bajo_minimo', 'caduca_pronto')
union all
select v.organizacion_id, v.sede_id, 'existencia_negativa', 'alta', v.id, current_date, 'Existencia negativa (' || v.existencia || ') en ' || v.sede_nombre || ': regulariza con un conteo físico (P-085)'
  from piefirme.prp_inventario v where v.existencia_negativa
union all
select m.organizacion_id, m.sede_id, 'movimiento_sin_conciliar', 'baja', m.id, m.fecha, 'Movimiento bancario ' || m.estado || ' por $' || m.monto
  from piefirme.movimientos_bancarios m where m.estado in ('sin_cobro', 'es_gasto', 'ambiguo');

-- Ingresos por mes (Reportes · Finanzas): sede, clasificación y forma de pago
create or replace view piefirme.prp_ingresos_mensuales with (security_invoker = true) as
select i.organizacion_id, i.sede_id, date_trunc('month', i.fecha_pago)::date as mes, i.clasificacion, i.forma_pago, i.estatus_validacion,
       sum(case when i.es_reembolso then -i.importe else i.importe end) as importe, sum(case when i.es_reembolso then -i.iva else i.iva end) as iva, count(*) as num_cobros,
       sum(case when i.estatus_validacion in ('validado', 'validado_cfdi') then (case when i.es_reembolso then -i.importe else i.importe end) else 0 end) as importe_comisionable
  from piefirme.ingresos i group by i.organizacion_id, i.sede_id, date_trunc('month', i.fecha_pago), i.clasificacion, i.forma_pago, i.estatus_validacion;

create or replace view piefirme.prp_gastos_mensuales with (security_invoker = true) as
select g.organizacion_id, g.sede_id, date_trunc('month', g.fecha)::date as mes, gr.clave as grupo_clave, gr.nombre as grupo_nombre, g.metodo_pago, g.origen_modulo,
       sum(g.subtotal) as subtotal, sum(g.iva) as iva, sum(g.total) as total, count(*) as num_gastos
  from piefirme.gastos g join piefirme.grupos_gasto gr on gr.id = g.grupo_id where g.estado = 'guardado'
 group by g.organizacion_id, g.sede_id, date_trunc('month', g.fecha), gr.clave, gr.nombre, g.metodo_pago, g.origen_modulo;

-- Compras por proveedor (clon prp_compras): órdenes no canceladas + lo pagado
create or replace view piefirme.prp_compras_proveedor with (security_invoker = true) as
select x.organizacion_id, x.proveedor_id, x.proveedor_nombre, x.sede_id, x.mes, x.num_ordenes, x.total_ordenado, x.total_recibido, coalesce(pg.pagado, 0) as total_pagado
  from (select o.organizacion_id, o.proveedor_id, p.nombre as proveedor_nombre, o.sede_id, date_trunc('month', o.fecha)::date as mes,
               count(*) as num_ordenes, sum(o.total) as total_ordenado, sum(o.total) filter (where o.estado in ('recibida', 'recibida_parcial')) as total_recibido
          from piefirme.ordenes_compra o join piefirme.proveedores p on p.id = o.proveedor_id where o.estado <> 'cancelada'
         group by o.organizacion_id, o.proveedor_id, p.nombre, o.sede_id, date_trunc('month', o.fecha)) x
  left join (select c.proveedor_id, c.sede_id, date_trunc('month', c.fecha_emision)::date as mes, sum(c.pagado) as pagado
               from piefirme.cuentas_por_pagar c group by c.proveedor_id, c.sede_id, date_trunc('month', c.fecha_emision)) pg
         on pg.proveedor_id = x.proveedor_id and pg.sede_id = x.sede_id and pg.mes = x.mes;

-- Valuación del inventario por sede y producto (costo promedio vigente, P-083)
create or replace view piefirme.prp_valuacion_inventario with (security_invoker = true) as
select v.organizacion_id, v.sede_id, v.sede_nombre, v.producto_id, v.existencia, v.costo_promedio, v.valor, v.estado
  from piefirme.prp_inventario v where v.existencia <> 0;

revoke all on all tables in schema piefirme from anon;
