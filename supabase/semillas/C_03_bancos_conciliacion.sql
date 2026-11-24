-- C_03 · Semilla SINTÉTICA (dominio C): estados de cuenta, liquidaciones Clip por semana, depósitos de efectivo por sede, conciliación automática y manual,
-- ingresos validados / observados y cobros con CFDI. Todo sintético (P-132); los movimientos nacen de los cobros y gastos de las semillas B_02, C_01 y C_02.
-- DEBE EXISTIR ANTES: migraciones 001-049 · B_02 (cobros) · C_01 (compras/pagos a proveedores) · C_02 (cuentas bancarias, gastos, fondos).
-- Rol que omita RLS; simula al administrador con request.jwt.claim.sub. Idempotente de forma gruesa: si ya hay movimientos bancarios, no hace nada.
-- Quedan SIN conciliar a propósito (para probar la pantalla): lo cobrado desde el sábado 17-oct, un par de depósitos con referencia ambigua en octubre y las comisiones/intereses del banco.
-- Hoy = 25-oct-2026.

do $$
declare
  o   constant uuid := '00000000-0000-0000-0000-00000000c0de';
  adm constant uuid := 'a0000000-0000-0000-0000-000000000001';
  v_gen uuid; v_gal uuid; v_sede_gal uuid; v_rows jsonb; v_rows_gal jsonb; v_d record; v_m record; v_w date; v_n integer := 0; v_liq uuid; v_vinc jsonb; v_res jsonb; v_cand uuid;
begin
  if exists (select 1 from piefirme.movimientos_bancarios where organizacion_id = o) then raise notice 'C_03: ya aplicada'; return; end if;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('app.ignorar_cierre', 'on', true);
  select id into v_gen from piefirme.cuentas_bancarias where organizacion_id = o and sede_id is null;
  select id into v_gal from piefirme.cuentas_bancarias where organizacion_id = o and sede_id is not null;
  select id into v_sede_gal from piefirme.sedes where organizacion_id = o and clave = 'GAL';

  -- referencias de operación para cobros sin referencia
  update piefirme.ingresos set referencia = 'OP-' || upper(substr(id::text, 1, 8))
   where organizacion_id = o and referencia is null and forma_pago in ('transferencia', 'deposito', 'tarjeta') and not es_reembolso;
  -- folio de comprobante para gastos pagados por banco (la referencia del cargo)
  update piefirme.gastos set folio_comprobante = 'GTO-' || upper(substr(id::text, 1, 8))
   where organizacion_id = o and folio_comprobante is null and metodo_pago in ('transferencia', 'tarjeta_clinica') and origen_modulo not in ('compra', 'comision_terminal');

  -- tres cobros por transferencia de septiembre que NO aparecen en el banco (se marcarán «observados»)
  create temporary table tmp_obs on commit drop as
    select id from piefirme.ingresos where organizacion_id = o and forma_pago = 'transferencia' and not es_reembolso and sede_id <> v_sede_gal
       and fecha_pago between date '2026-09-01' and date '2026-09-30' order by md5(id::text) limit 3;

  -- liquidaciones Clip por semana (comisión 3.6 %), hasta el viernes 9-oct (se depositan el lunes 12 o antes de hoy)
  for v_w in select g::date from generate_series(date '2026-08-01', date '2026-10-10', interval '7 days') g loop
    declare v_bruto numeric; v_dep numeric; v_lote text;
    begin
      select coalesce(sum(importe), 0) into v_bruto from piefirme.ingresos
       where organizacion_id = o and forma_pago = 'tarjeta_clip' and not es_reembolso and fecha_pago between v_w and v_w + 6;
      if v_bruto > 0 then
        v_n := v_n + 1; v_lote := 'CLIP-' || (1000 + v_n);
        v_dep := round(v_bruto * (1 - 0.036), 2);
        v_liq := gen_random_uuid();
        insert into piefirme.liquidaciones_clip (id, organizacion_id, lote, fecha_liquidacion, monto_depositado, comision_retenida) values (v_liq, o, v_lote, v_w + 9, v_dep, v_bruto - v_dep);
        update piefirme.ingresos set lote_liquidacion_id = v_liq
         where organizacion_id = o and forma_pago = 'tarjeta_clip' and not es_reembolso and fecha_pago between v_w and v_w + 6;
      end if;
    end;
  end loop;

  -- ───────── estado de cuenta de la cuenta general (BBVA ···4471) ─────────
  select coalesce(jsonb_agg(jsonb_build_object('fecha', x.f, 'descripcion', x.d, 'monto', x.m, 'referencia', x.r) order by x.f), '[]'::jsonb) into v_rows from (
    -- abonos por transferencia, depósito y terminal bancaria (el 5 % llega sin referencia en la descripción)
    select i.fecha_pago + case when i.forma_pago = 'tarjeta' then 1 else 0 end as f, 'Abono ' || i.forma_pago || ' ' || coalesce(i.referencia, '') as d, i.importe as m,
           case when abs(hashtext(i.id::text)) % 20 = 0 then null else i.referencia end as r
      from piefirme.ingresos i
     where i.organizacion_id = o and i.forma_pago in ('transferencia', 'deposito', 'tarjeta') and not i.es_reembolso and i.sede_id <> v_sede_gal
       and i.id not in (select id from tmp_obs) and i.fecha_pago + case when i.forma_pago = 'tarjeta' then 1 else 0 end <= date '2026-10-22'
    union all
    select l.fecha_liquidacion, 'Depósito Clip liquidación ' || l.lote, l.monto_depositado, l.lote from piefirme.liquidaciones_clip l where l.organizacion_id = o and l.fecha_liquidacion <= date '2026-10-22'
    union all
    -- depósitos de efectivo por sede y semana = efectivo cobrado − gastos del fondo (corte sábado → viernes)
    select ws.w + 9, 'Depósito en efectivo ' || s.clave, e.neto, 'DEP-' || s.clave || '-' || to_char(ws.w, 'YYMMDD')
      from (select d::date as w from generate_series(date '2026-08-01', date '2026-10-10', interval '7 days') d) ws
      cross join piefirme.sedes s
      cross join lateral (
        select coalesce((select sum(case when i.es_reembolso then -i.importe else i.importe end) from piefirme.ingresos i
                          where i.sede_id = s.id and i.forma_pago = 'efectivo' and i.fecha_pago between ws.w and ws.w + 6), 0)
             - coalesce((select sum(g.total) from piefirme.gastos g where g.sede_id = s.id and g.metodo_pago = 'efectivo_fondo' and g.estado = 'guardado' and g.fecha between ws.w and ws.w + 6), 0) as neto) e
     where s.organizacion_id = o and e.neto > 0
    union all
    -- cargos: gastos pagados por banco (nómina, renta, servicios, publicidad…)
    select g.fecha, 'Pago ' || left(coalesce(g.descripcion, 'gasto'), 40), -g.total, g.folio_comprobante
      from piefirme.gastos g where g.organizacion_id = o and g.estado = 'guardado' and g.metodo_pago in ('transferencia', 'tarjeta_clinica') and g.origen_modulo not in ('compra', 'comision_terminal')
       and g.fecha <= date '2026-10-22'
    union all
    select pp.fecha, 'Pago a proveedor ' || pr.nombre, -pp.monto, pp.referencia
      from piefirme.pagos_proveedor pp join piefirme.cuentas_por_pagar c on c.id = pp.cuenta_pagar_id join piefirme.proveedores pr on pr.id = c.proveedor_id
     where pp.organizacion_id = o and pp.fecha <= date '2026-10-22'
    union all
    select (m.d + 24)::date, 'Comisión por manejo de cuenta', -145.00, null from (values (date '2026-08-01'), (date '2026-09-01'), (date '2026-10-01')) m(d) where (m.d + 24) <= date '2026-10-23'
    union all
    select (m.d + 27)::date, 'Intereses ganados', 8.42, null from (values (date '2026-08-01'), (date '2026-09-01')) m(d)
  ) x;
  perform piefirme.conciliar_importar(v_gen, 'estado_cuenta_ago_oct_BBVA.csv', v_rows, o::text || '/bancos/estado_cuenta_ago_oct_BBVA.csv');

  -- ───────── estado de cuenta propio de Galerías (Banorte ···9902): sus transferencias ─────────
  select coalesce(jsonb_agg(jsonb_build_object('fecha', i.fecha_pago, 'descripcion', 'Abono ' || i.forma_pago || ' ' || coalesce(i.referencia, ''), 'monto', i.importe, 'referencia', i.referencia) order by i.fecha_pago), '[]'::jsonb)
    into v_rows_gal from piefirme.ingresos i
   where i.organizacion_id = o and i.forma_pago in ('transferencia', 'deposito') and not i.es_reembolso and i.sede_id = v_sede_gal and i.fecha_pago <= date '2026-10-22';
  perform piefirme.conciliar_importar(v_gal, 'estado_cuenta_ago_oct_Banorte_GAL.csv', v_rows_gal, o::text || '/bancos/estado_cuenta_ago_oct_Banorte_GAL.csv');

  -- ───────── conciliación automática (referencia → monto + fecha) en las dos cuentas ─────────
  v_res := piefirme.conciliar_automatico(v_gen);
  raise notice 'C_03 cuenta general: %', v_res;
  v_res := piefirme.conciliar_automatico(v_gal);
  raise notice 'C_03 cuenta Galerías: %', v_res;

  -- depósitos de efectivo: un movimiento ↔ N cobros en efectivo (y los gastos pagados con el fondo restan)
  for v_d in select id, referencia from piefirme.movimientos_bancarios where organizacion_id = o and referencia like 'DEP-%' and estado <> 'conciliado' loop
    select jsonb_agg(v) into v_vinc from (
      select jsonb_build_object('tipo', 'ingreso', 'id', i.id) as v from piefirme.ingresos i
       join piefirme.sedes s on s.id = i.sede_id and s.clave = split_part(v_d.referencia, '-', 2)
       where i.organizacion_id = o and i.forma_pago = 'efectivo' and i.fecha_pago between to_date(split_part(v_d.referencia, '-', 3), 'YYMMDD') and to_date(split_part(v_d.referencia, '-', 3), 'YYMMDD') + 6
      union all
      select jsonb_build_object('tipo', 'gasto', 'id', g.id) from piefirme.gastos g
       join piefirme.sedes s on s.id = g.sede_id and s.clave = split_part(v_d.referencia, '-', 2)
       where g.organizacion_id = o and g.metodo_pago = 'efectivo_fondo' and g.estado = 'guardado'
         and g.fecha between to_date(split_part(v_d.referencia, '-', 3), 'YYMMDD') and to_date(split_part(v_d.referencia, '-', 3), 'YYMMDD') + 6) q;
    if v_vinc is not null then perform piefirme.conciliar_confirmar(v_d.id, v_vinc); end if;
  end loop;

  -- sugeridos y ambiguos de agosto-septiembre: el administrador los revisó y confirmó (octubre queda pendiente)
  for v_m in select id, sugeridos, estado from piefirme.movimientos_bancarios
            where organizacion_id = o and estado in ('sugerido', 'ambiguo') and fecha < date '2026-10-01' order by fecha, created_at loop
    v_cand := null;
    select u into v_cand from unnest(v_m.sugeridos) u
     where not exists (select 1 from piefirme.conciliaciones c where c.ingreso_id = u or c.pago_proveedor_id = u or c.gasto_id = u) limit 1;
    if v_cand is not null then
      perform piefirme.conciliar_confirmar(v_m.id, jsonb_build_array(jsonb_build_object('tipo',
              case when exists (select 1 from piefirme.ingresos where id = v_cand) then 'ingreso' when exists (select 1 from piefirme.pagos_proveedor where id = v_cand) then 'pago_proveedor' else 'gasto' end, 'id', v_cand)));
    end if;
  end loop;

  -- ingresos observados (S17): no aparecen en el estado de cuenta
  perform piefirme.ingreso_validar(id, 'observado', 'No aparece en el estado de cuenta del banco (sintético)') from tmp_obs;
  -- cobros ya validados cuyo ticket tiene CFDI vigente → «Validado CFDI»
  perform piefirme.ingreso_validar(id, 'validado_cfdi') from piefirme.ingresos where organizacion_id = o and estatus_validacion = 'validado' and factura_id is not null;
  raise notice 'C_03: movimientos %, conciliados %', (select count(*) from piefirme.movimientos_bancarios where organizacion_id = o), (select count(*) from piefirme.movimientos_bancarios where organizacion_id = o and estado = 'conciliado');
end $$;
