-- 046 · Inventario y finanzas · cuentas por pagar, pagos a proveedor y conciliación automática.
-- Dominio C. Clona de IRP: cuentas_pagar (prp_cuentas_pagar), pagos a proveedor, RPC conciliar_banco_batch.
-- Reglas: P-081 (la CxP nace al registrar la factura del proveedor contra una recepción; recepción parcial), P-096 (Administración autoriza y registra el pago con cuenta y referencia; se concilia con el banco),
--   P-091/P-093 (el pago genera el gasto en base caja y el comprobante fiscal desde $2,000), S20 (estados de la CxP), P-094 (cruce por referencia y por monto + fecha).
-- Dependencias: 041 (recepciones, ordenes_compra), 042 (cuentas_bancarias), 044 (gastos), 045 (conciliaciones, movimientos, liquidaciones).

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.cuentas_por_pagar (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id            uuid not null references piefirme.sedes(id),
  proveedor_id       uuid not null references piefirme.proveedores(id),
  folio_factura      text,
  concepto           text not null,
  fecha_emision      date not null default current_date,
  fecha_vencimiento  date not null,
  importe            numeric(14,2) not null check (importe > 0),
  iva                numeric(14,2) not null default 0 check (iva >= 0 and iva <= importe),
  pagado             numeric(14,2) not null default 0 check (pagado >= 0),       -- lo mantiene el trigger de pagos
  saldo              numeric(14,2) generated always as (importe - pagado) stored,
  estado             text not null default 'programada' check (estado in ('programada', 'parcial', 'pagada', 'cancelada')),
  oc_id              uuid references piefirme.ordenes_compra(id) on delete set null,
  recepcion_id       uuid references piefirme.recepciones(id) on delete set null,
  gasto_id           uuid references piefirme.gastos(id) on delete set null,       -- «Ligar a gasto» manual (E111)
  cfdi_uuid          text,
  archivo_url        text,                                                        -- bucket «pf-comprobantes»
  cancelada_motivo   text,
  creado_por         uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (fecha_vencimiento >= fecha_emision),
  check (estado <> 'cancelada' or coalesce(trim(cancelada_motivo), '') <> '')
);
create unique index cxp_factura_unica on piefirme.cuentas_por_pagar (organizacion_id, proveedor_id, folio_factura) where folio_factura is not null;
create index on piefirme.cuentas_por_pagar (organizacion_id, sede_id, estado, fecha_vencimiento);
create index on piefirme.cuentas_por_pagar (organizacion_id, proveedor_id);

create table piefirme.pagos_proveedor (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id              uuid not null references piefirme.sedes(id),
  cuenta_pagar_id      uuid not null references piefirme.cuentas_por_pagar(id),
  fecha                date not null default current_date,
  monto                numeric(14,2) not null check (monto > 0),
  forma_pago           text not null check (forma_pago in ('transferencia', 'cheque', 'tarjeta_clinica')),
  cuenta_bancaria_id   uuid references piefirme.cuentas_bancarias(id) on delete set null,
  referencia           text,
  autorizado_por       uuid not null references piefirme.perfiles(id) default auth.uid(),
  gasto_id             uuid references piefirme.gastos(id) on delete set null,   -- gasto generado (base caja)
  nota                 text,
  created_at           timestamptz not null default now()
);
create index on piefirme.pagos_proveedor (organizacion_id, cuenta_pagar_id);
create index on piefirme.pagos_proveedor (organizacion_id, fecha desc);

alter table piefirme.recepciones add constraint recepciones_cxp_fk foreign key (cuenta_por_pagar_id) references piefirme.cuentas_por_pagar(id) on delete set null;
alter table piefirme.gastos add constraint gastos_cxp_fk foreign key (cuenta_por_pagar_id) references piefirme.cuentas_por_pagar(id) on delete set null;
alter table piefirme.conciliaciones add constraint conciliaciones_pago_fk foreign key (pago_proveedor_id) references piefirme.pagos_proveedor(id) on delete restrict;

create trigger t_a_padre before insert on piefirme.pagos_proveedor for each row execute function piefirme_app.c_heredar_de_padre('cuentas_por_pagar', 'cuenta_pagar_id');

create or replace function piefirme_app.c_cxp_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not exists (select 1 from piefirme.proveedores p where p.id = new.proveedor_id and p.organizacion_id = new.organizacion_id)
     or not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'proveedor o sede de otra clínica' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.importe < new.pagado - 0.01 then raise exception 'el importe no puede ser menor a lo ya pagado' using errcode = 'PF409'; end if;
    if new.estado = 'cancelada' and old.estado <> 'cancelada' and old.pagado > 0 then
      raise exception 'la cuenta ya tiene pagos: no se cancela' using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.cuentas_por_pagar for each row execute function piefirme_app.c_cxp_bi();

-- OC: estado de pago derivado de sus cuentas por pagar
create or replace function piefirme_app.c_oc_estado_pago(p_oc uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_n integer; v_pend integer;
begin
  if p_oc is null then return; end if;
  select count(*), count(*) filter (where estado <> 'pagada') into v_n, v_pend from piefirme.cuentas_por_pagar where oc_id = p_oc and estado <> 'cancelada';
  perform set_config('app.c_rpc', 'on', true);
  update piefirme.ordenes_compra set estado_pago = case when v_n = 0 then 'sin_pago' when v_pend = 0 then 'pagada' else 'por_pagar' end where id = p_oc;
end $$;

create or replace function piefirme_app.c_cxp_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  perform piefirme_app.c_oc_estado_pago(coalesce(new.oc_id, old.oc_id));
  return null;
end $$;
create trigger t_ai after insert or update of estado, oc_id or delete on piefirme.cuentas_por_pagar for each row execute function piefirme_app.c_cxp_ai();

-- Pago: no excede el saldo, actualiza la cuenta y genera el gasto (base caja, P-091)
create or replace function piefirme_app.c_pago_prov_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.cuentas_por_pagar%rowtype; p piefirme.proveedores%rowtype; v_grupo uuid; v_clave text; v_gasto uuid := gen_random_uuid(); v_iva numeric; v_comp text;
begin
  select * into c from piefirme.cuentas_por_pagar where id = new.cuenta_pagar_id for update;
  if c.estado = 'cancelada' then raise exception 'la cuenta por pagar está cancelada' using errcode = 'PF409'; end if;
  if new.monto > c.saldo + 0.01 then
    raise exception 'el pago ($%) excede el saldo de la cuenta ($%)', new.monto, c.saldo using errcode = 'PF409';
  end if;
  if new.cuenta_bancaria_id is not null and not exists (select 1 from piefirme.cuentas_bancarias b where b.id = new.cuenta_bancaria_id and b.organizacion_id = new.organizacion_id) then
    raise exception 'cuenta bancaria de otra clínica' using errcode = '42501';
  end if;
  if new.forma_pago in ('transferencia', 'cheque') and new.cuenta_bancaria_id is null then
    raise exception 'indica la cuenta bancaria desde la que se paga (P-096)' using errcode = 'PF409';
  end if;
  if c.gasto_id is null then
    select * into p from piefirme.proveedores where id = c.proveedor_id;
    v_clave := case p.categoria when 'mantenimiento_equipo' then 'mantenimiento' when 'operacion' then 'servicios'
                                when 'equipo_instrumental' then 'compras_operativas' else 'insumos_curacion' end;
    select id into v_grupo from piefirme.grupos_gasto where organizacion_id = new.organizacion_id and clave = v_clave;
    v_iva := case when c.importe > 0 then round(new.monto * c.iva / c.importe, 2) else 0 end;
    insert into piefirme.gastos (id, organizacion_id, sede_id, fecha, proveedor_id, grupo_id, metodo_pago, subtotal, iva, total, folio_comprobante, cfdi_uuid,
                               tiene_factura, factura_url, descripcion, origen_captura, origen_modulo, cuenta_por_pagar_id, estado)
    values (v_gasto, new.organizacion_id, c.sede_id, new.fecha, c.proveedor_id, v_grupo,
            case when new.forma_pago = 'tarjeta_clinica' then 'tarjeta_clinica' else 'transferencia' end,
            new.monto - v_iva, v_iva, new.monto, c.folio_factura, c.cfdi_uuid,
            (coalesce(c.archivo_url, '') <> '' or coalesce(c.cfdi_uuid, '') <> ''), c.archivo_url,
            'Pago a proveedor · ' || c.concepto, 'sistema', 'compra', c.id, 'guardado');
    new.gasto_id := v_gasto;
  end if;
  return new;
end $$;
create trigger t_bi before insert on piefirme.pagos_proveedor for each row execute function piefirme_app.c_pago_prov_bi();

create or replace function piefirme_app.c_pago_prov_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := coalesce(new.cuenta_pagar_id, old.cuenta_pagar_id); v_pag numeric; v_imp numeric;
begin
  select importe into v_imp from piefirme.cuentas_por_pagar where id = v_id;
  select coalesce(sum(monto), 0) into v_pag from piefirme.pagos_proveedor where cuenta_pagar_id = v_id;
  update piefirme.cuentas_por_pagar set pagado = v_pag,
         estado = case when estado = 'cancelada' then 'cancelada' when v_pag >= v_imp - 0.01 then 'pagada' when v_pag > 0 then 'parcial' else 'programada' end
   where id = v_id;
  return null;
end $$;
create trigger t_ai after insert or delete on piefirme.pagos_proveedor for each row execute function piefirme_app.c_pago_prov_ai();
create trigger t_inm_upd before update on piefirme.pagos_proveedor for each row execute function piefirme_app.c_inmutable();

-- La CxP nace de la factura registrada contra una recepción (P-081). Misma factura en varias recepciones parciales = una sola cuenta.
create or replace function piefirme_app.c_recepcion_cxp() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o piefirme.ordenes_compra%rowtype; v_cxp uuid;
begin
  if new.cuenta_por_pagar_id is not null or coalesce(trim(new.factura_numero), '') = '' or coalesce(new.factura_importe, 0) <= 0 then return null; end if;
  select * into o from piefirme.ordenes_compra where id = new.oc_id;
  select id into v_cxp from piefirme.cuentas_por_pagar where organizacion_id = new.organizacion_id and proveedor_id = o.proveedor_id and folio_factura = new.factura_numero;
  if v_cxp is null then
    v_cxp := gen_random_uuid();
    insert into piefirme.cuentas_por_pagar (id, organizacion_id, sede_id, proveedor_id, folio_factura, concepto, fecha_emision, fecha_vencimiento, importe, iva,
                                          oc_id, recepcion_id, cfdi_uuid, archivo_url)
    values (v_cxp, new.organizacion_id, new.sede_id, o.proveedor_id, new.factura_numero, 'Compra ' || o.folio, new.fecha,
            greatest(coalesce(new.factura_vencimiento, new.fecha + o.dias_credito), new.fecha), new.factura_importe,
            least(new.factura_importe, round(coalesce((select sum(l.iva_monto) from piefirme.oc_lineas l where l.oc_id = o.id), 0)
                  * new.factura_importe / nullif(o.total, 0), 2)),
            o.id, new.id, new.cfdi_uuid, new.factura_url);
  end if;
  update piefirme.recepciones set cuenta_por_pagar_id = v_cxp where id = new.id;
  return null;
end $$;
create trigger t_cxp after insert or update of factura_numero, factura_importe on piefirme.recepciones for each row execute function piefirme_app.c_recepcion_cxp();

-- ───────────────────────────── conciliación automática (clon conciliar_banco_batch) ─────────────────────────────
create or replace function piefirme.conciliar_automatico(p_cuenta uuid, p_desde date default null, p_hasta date default null) returns jsonb
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare m record; l piefirme.liquidaciones_clip%rowtype; v_tol integer; v_cand uuid[]; v_suma numeric; v_gasto uuid; v_grupo uuid; v_sede uuid;
        r_conc integer := 0; r_sug integer := 0; r_amb integer := 0; r_gas integer := 0; r_sin integer := 0; v_ref text;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración concilia' using errcode = '42501'; end if;
  v_tol := piefirme_app.c_param(piefirme_app.org_id(), 'conciliacion_tolerancia_dias', 3)::int;
  perform set_config('app.c_rpc', 'on', true);
  for m in select * from piefirme.movimientos_bancarios
            where cuenta_id = p_cuenta and estado in ('detectado', 'sugerido', 'ambiguo', 'es_gasto', 'sin_cobro')
              and fecha between coalesce(p_desde, date '1900-01-01') and coalesce(p_hasta, date '2999-12-31') order by fecha, created_at loop
    v_ref := lower(trim(coalesce(m.referencia, '')));
    -- 0 · liquidación Clip por lote: N cobros − comisión = depósito
    if m.monto > 0 then
      select * into l from piefirme.liquidaciones_clip
       where organizacion_id = m.organizacion_id and estado = 'pendiente' and monto_depositado = m.monto
         and position(lower(lote) in lower(coalesce(m.referencia, '') || ' ' || m.descripcion)) > 0 limit 1;
      if found then
        select coalesce(sum(importe), 0), case when count(distinct sede_id) = 1 then min(sede_id::text)::uuid end into v_suma, v_sede from piefirme.ingresos
         where lote_liquidacion_id = l.id and not exists (select 1 from piefirme.conciliaciones c where c.ingreso_id = ingresos.id);
        if abs(v_suma - l.monto_bruto) <= 0.01 then
          -- primero la comisión retenida (resta) y luego los cobros, para que la suma parcial nunca rebase el depósito
          if l.comision_retenida > 0 then
            v_gasto := l.gasto_comision_id;
            if v_gasto is null then
              select id into v_grupo from piefirme.grupos_gasto where organizacion_id = m.organizacion_id and clave = 'comision_terminal';
              v_gasto := gen_random_uuid();
              insert into piefirme.gastos (id, organizacion_id, sede_id, compartido, fecha, grupo_id, metodo_pago, subtotal, iva, total, descripcion, origen_captura, origen_modulo, estado)
              values (v_gasto, m.organizacion_id, v_sede, v_sede is null, l.fecha_liquidacion, v_grupo, 'transferencia', l.comision_retenida, 0, l.comision_retenida,
                      'Comisión de terminal · lote ' || l.lote, 'sistema', 'comision_terminal', 'guardado');
              update piefirme.liquidaciones_clip set gasto_comision_id = v_gasto where id = l.id;
            end if;
            insert into piefirme.conciliaciones (organizacion_id, movimiento_id, gasto_id, importe_aplicado, origen, liquidacion_id)
            values (m.organizacion_id, m.id, v_gasto, l.comision_retenida, 'automatica', l.id);
          end if;
          insert into piefirme.conciliaciones (organizacion_id, movimiento_id, ingreso_id, importe_aplicado, origen, forma_pago, liquidacion_id)
          select m.organizacion_id, m.id, i.id, i.importe, 'automatica', 'tarjeta_clip', l.id from piefirme.ingresos i
           where i.lote_liquidacion_id = l.id and not exists (select 1 from piefirme.conciliaciones c where c.ingreso_id = i.id);
          update piefirme.liquidaciones_clip set estado = 'conciliada' where id = l.id;
          r_conc := r_conc + 1; continue;
        end if;
      end if;
    end if;
    -- 1 · referencia exacta + monto
    v_cand := null;
    if v_ref <> '' then
      if m.monto > 0 then
        select array_agg(i.id) into v_cand from piefirme.ingresos i
         where i.organizacion_id = m.organizacion_id and lower(trim(coalesce(i.referencia, ''))) = v_ref and i.importe = m.monto and not i.es_reembolso
           and not exists (select 1 from piefirme.conciliaciones c where c.ingreso_id = i.id);
        if cardinality(v_cand) = 1 then
          insert into piefirme.conciliaciones (organizacion_id, movimiento_id, ingreso_id, importe_aplicado, origen) values (m.organizacion_id, m.id, v_cand[1], m.monto, 'automatica');
          r_conc := r_conc + 1; continue;
        end if;
      else
        select array_agg(x.id) into v_cand from (
          select p.id from piefirme.pagos_proveedor p where p.organizacion_id = m.organizacion_id and lower(trim(coalesce(p.referencia, ''))) = v_ref and p.monto = -m.monto
             and not exists (select 1 from piefirme.conciliaciones c where c.pago_proveedor_id = p.id)
          union all
          select g.id from piefirme.gastos g where g.organizacion_id = m.organizacion_id and lower(trim(coalesce(g.folio_comprobante, ''))) = v_ref and g.total = -m.monto
             and g.estado = 'guardado' and g.origen_modulo <> 'compra' and not exists (select 1 from piefirme.conciliaciones c where c.gasto_id = g.id)) x;
        if cardinality(v_cand) = 1 then
          insert into piefirme.conciliaciones (organizacion_id, movimiento_id, pago_proveedor_id, gasto_id, importe_aplicado, origen)
          select m.organizacion_id, m.id, (select p.id from piefirme.pagos_proveedor p where p.id = v_cand[1]), (select g.id from piefirme.gastos g where g.id = v_cand[1]), -m.monto, 'automatica';
          r_conc := r_conc + 1; continue;
        end if;
      end if;
    end if;
    -- 2 · monto + fecha ± tolerancia
    if m.monto > 0 then
      select array_agg(i.id) into v_cand from piefirme.ingresos i
       where i.organizacion_id = m.organizacion_id and i.importe = m.monto and not i.es_reembolso and i.forma_pago not in ('efectivo', 'gift_card')
         and i.fecha_pago between m.fecha - v_tol and m.fecha + v_tol and not exists (select 1 from piefirme.conciliaciones c where c.ingreso_id = i.id);
    else
      select array_agg(x.id) into v_cand from (
        select p.id from piefirme.pagos_proveedor p where p.organizacion_id = m.organizacion_id and p.monto = -m.monto and p.fecha between m.fecha - v_tol and m.fecha + v_tol
           and not exists (select 1 from piefirme.conciliaciones c where c.pago_proveedor_id = p.id)
        union all
        select g.id from piefirme.gastos g where g.organizacion_id = m.organizacion_id and g.total = -m.monto and g.estado = 'guardado' and g.origen_modulo <> 'compra'
           and g.metodo_pago in ('tarjeta_clinica', 'transferencia') and g.fecha between m.fecha - v_tol and m.fecha + v_tol
           and not exists (select 1 from piefirme.conciliaciones c where c.gasto_id = g.id)) x;
    end if;
    if cardinality(v_cand) = 1 then
      update piefirme.movimientos_bancarios set estado = 'sugerido', sugeridos = v_cand where id = m.id; r_sug := r_sug + 1;
    elsif cardinality(v_cand) > 1 then
      update piefirme.movimientos_bancarios set estado = 'ambiguo', sugeridos = v_cand where id = m.id; r_amb := r_amb + 1;
    elsif m.monto < 0 then
      update piefirme.movimientos_bancarios set estado = 'es_gasto', sugeridos = '{}' where id = m.id; r_gas := r_gas + 1;
    else
      update piefirme.movimientos_bancarios set estado = 'sin_cobro', sugeridos = '{}' where id = m.id; r_sin := r_sin + 1;
    end if;
  end loop;
  return jsonb_build_object('conciliados', r_conc, 'sugeridos', r_sug, 'ambiguos', r_amb, 'es_gasto', r_gas, 'sin_cobro', r_sin);
end $$;
revoke all on function piefirme.conciliar_automatico(uuid, date, date) from public, anon;
grant execute on function piefirme.conciliar_automatico(uuid, date, date) to authenticated;

-- Registrar el pago a proveedor en una llamada (autoriza y registra Administración)
create or replace function piefirme.pagar_proveedor(p_cuenta uuid, p_monto numeric, p_forma text, p_cuenta_bancaria uuid default null, p_referencia text default null, p_fecha date default null) returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.cuentas_por_pagar%rowtype; v_id uuid := gen_random_uuid();
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración autoriza pagos a proveedores (P-096)' using errcode = '42501'; end if;
  select * into c from piefirme.cuentas_por_pagar where id = p_cuenta;
  if not found then raise exception 'cuenta por pagar inexistente' using errcode = 'PF404'; end if;
  insert into piefirme.pagos_proveedor (id, organizacion_id, sede_id, cuenta_pagar_id, fecha, monto, forma_pago, cuenta_bancaria_id, referencia)
  values (v_id, c.organizacion_id, c.sede_id, c.id, coalesce(p_fecha, current_date), p_monto, p_forma, p_cuenta_bancaria, p_referencia);
  return v_id;
end $$;
revoke all on function piefirme.pagar_proveedor(uuid, numeric, text, uuid, text, date) from public, anon;
grant execute on function piefirme.pagar_proveedor(uuid, numeric, text, uuid, text, date) to authenticated;

-- ───────────────────────────── RLS (cuentas por pagar: Administración, MATRIZ_ROLES §4.4) ─────────────────────────────
select piefirme_app.c_politicas('cuentas_por_pagar', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array[]::text[]);
select piefirme_app.c_politicas('pagos_proveedor', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array[]::text[], p_del => array[]::text[]);
select piefirme_app.c_triggers('cuentas_por_pagar');
select piefirme_app.c_triggers('pagos_proveedor');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_cuentas_pagar with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, s.nombre as sede_nombre, c.proveedor_id, p.nombre as proveedor_nombre, c.folio_factura, c.concepto,
       c.fecha_emision, c.fecha_vencimiento, c.importe, c.iva, c.pagado, c.saldo, c.oc_id, c.recepcion_id, c.gasto_id, c.cfdi_uuid, c.archivo_url,
       case when c.estado in ('pagada', 'cancelada') then c.estado
            when c.fecha_vencimiento < current_date then 'vencida'
            when c.fecha_vencimiento <= current_date + piefirme_app.c_param(c.organizacion_id, 'cxp_dias_por_vencer', 7)::int then 'por_vencer'
            else c.estado end as estado,
       c.estado as estado_registro,
       greatest(current_date - c.fecha_emision, 0) as dias_antiguedad,
       case when c.estado in ('pagada', 'cancelada') then null
            when current_date - c.fecha_emision <= 30 then '0-30' when current_date - c.fecha_emision <= 60 then '31-60'
            when current_date - c.fecha_emision <= 90 then '61-90' else '+90' end as rango_antiguedad
  from piefirme.cuentas_por_pagar c join piefirme.sedes s on s.id = c.sede_id join piefirme.proveedores p on p.id = c.proveedor_id;

create or replace view piefirme.prp_antiguedad_saldos_pagar with (security_invoker = true) as
select organizacion_id, sede_id, proveedor_id, proveedor_nombre,
       sum(saldo) filter (where rango_antiguedad = '0-30') as r_0_30, sum(saldo) filter (where rango_antiguedad = '31-60') as r_31_60,
       sum(saldo) filter (where rango_antiguedad = '61-90') as r_61_90, sum(saldo) filter (where rango_antiguedad = '+90') as r_mas_90,
       sum(saldo) as saldo_total
  from piefirme.prp_cuentas_pagar where estado not in ('pagada', 'cancelada') group by organizacion_id, sede_id, proveedor_id, proveedor_nombre;

create or replace view piefirme.prp_pagos_proveedor with (security_invoker = true) as
select pp.id, pp.organizacion_id, pp.sede_id, pp.cuenta_pagar_id, c.folio_factura, c.proveedor_id, pr.nombre as proveedor_nombre, pp.fecha, pp.monto, pp.forma_pago,
       pp.cuenta_bancaria_id, pp.referencia, pp.autorizado_por, pp.gasto_id, pp.nota,
       (select count(*) > 0 from piefirme.conciliaciones k where k.pago_proveedor_id = pp.id) as conciliado
  from piefirme.pagos_proveedor pp join piefirme.cuentas_por_pagar c on c.id = pp.cuenta_pagar_id join piefirme.proveedores pr on pr.id = c.proveedor_id;

revoke all on all tables in schema piefirme from anon;
