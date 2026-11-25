-- 131 · Hallazgo del video caja-plan-paquete (lote F): al cobrar en Caja una sesión con «Usar saldo del plan» el renglón quedaba en $0 pero la
-- sesión NUNCA se descontaba del plan (el consumo solo existía al marcar atendida una cita): un plan de 6 sesiones daba sesiones gratis sin fin.
-- Ahora cobrar_venta registra el consumo (plan_sesiones_consumo) de cada renglón con plan_adquirido_id —salvo que la cita del ticket ya lo consumió al
-- atenderse— y cancelar_venta lo revierte. El consumo ya no exige cita (cita_id nullable) y se liga al renglón (venta_linea_id único).
alter table piefirme.plan_sesiones_consumo alter column cita_id drop not null;
alter table piefirme.plan_sesiones_consumo add column if not exists venta_linea_id uuid references piefirme.venta_lineas(id);
create unique index if not exists plan_sesiones_consumo_linea_uq on piefirme.plan_sesiones_consumo (venta_linea_id) where venta_linea_id is not null;

create or replace function piefirme_app.consumir_plan_en_venta(p_linea uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l piefirme.venta_lineas%rowtype; v piefirme.ventas%rowtype; pa piefirme.planes_adquiridos%rowtype;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'siempre cobra caja (P-078)' using errcode = 'PF403'; end if;
  select * into l from piefirme.venta_lineas where id = p_linea and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'renglón inexistente' using errcode = 'PF404'; end if;
  select * into v from piefirme.ventas where id = l.venta_id;
  if v.cita_id is not null and exists (select 1 from piefirme.plan_sesiones_consumo where cita_id = v.cita_id and not reversado) then return; end if;   -- ya se consumió al atender la cita
  if exists (select 1 from piefirme.plan_sesiones_consumo where venta_linea_id = l.id) then return; end if;
  select * into pa from piefirme.planes_adquiridos where id = l.plan_adquirido_id and organizacion_id = v.organizacion_id;
  if not found then raise exception 'plan inexistente' using errcode = 'PF404'; end if;
  if pa.paciente_id is distinct from v.paciente_id then raise exception 'el plan % no es del paciente del ticket', pa.folio using errcode = 'PF409'; end if;
  if not pa.usable_otra_sede and pa.sede_compra_id <> v.sede_id then raise exception 'el plan % solo se usa en su sede de compra', pa.folio using errcode = 'PF409'; end if;
  insert into piefirme.plan_sesiones_consumo (organizacion_id, plan_adquirido_id, cita_id, venta_linea_id, sede_id, podologo_id, valor)
  values (v.organizacion_id, pa.id, v.cita_id, l.id, v.sede_id, v.podologo_id, pa.precio_sesion);   -- el trigger valida vigencia y saldo y suma la sesión usada
end $$;

create or replace function piefirme_app.revertir_consumo_venta(p_venta uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.plan_sesiones_consumo%rowtype;
begin
  for c in select * from piefirme.plan_sesiones_consumo where venta_linea_id in (select id from piefirme.venta_lineas where venta_id = p_venta and organizacion_id = piefirme_app.org_id()) loop
    update piefirme.planes_adquiridos set sesiones_usadas = greatest(sesiones_usadas - 1, 0), estado = case when estado = 'consumido' then 'vigente' else estado end where id = c.plan_adquirido_id;
    delete from piefirme.plan_sesiones_consumo where id = c.id;
  end loop;
end $$;
revoke all on function piefirme_app.consumir_plan_en_venta(uuid), piefirme_app.revertir_consumo_venta(uuid) from public, anon;
grant execute on function piefirme_app.consumir_plan_en_venta(uuid), piefirme_app.revertir_consumo_venta(uuid) to authenticated;

create or replace function piefirme.cobrar_venta(p_venta uuid) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; t piefirme.turnos_caja%rowtype; l piefirme.venta_lineas%rowtype; o piefirme.ofertas%rowtype; v_pagado numeric; v_hoy date; i integer;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'siempre cobra caja (P-078)' using errcode = 'PF403'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado not in ('por_cobrar', 'cuenta_abierta') then raise exception 'el ticket ya está %', v.estado using errcode = 'PF409'; end if;
  if not exists (select 1 from piefirme.venta_lineas where venta_id = p_venta) then raise exception 'el ticket no tiene líneas' using errcode = 'PF409'; end if;
  select * into t from piefirme.turnos_caja where sede_id = v.sede_id and cajero_id = auth.uid() and estado = 'abierto';
  if not found then raise exception 'abra su turno de caja en esta sede' using errcode = 'PF409'; end if;
  select coalesce(sum(monto), 0) into v_pagado from piefirme.pagos where venta_id = p_venta;
  if v_pagado <> v.total then raise exception 'los pagos (%) no cubren el total (%)', v_pagado, v.total using errcode = 'PF409'; end if;
  v_hoy := piefirme_app.hoy_org(v.organizacion_id);
  for l in select * from piefirme.venta_lineas where venta_id = p_venta order by orden loop
    if l.tipo in ('plan', 'membresia') and v.paciente_id is null then raise exception 'los planes y membresías se venden a un paciente' using errcode = 'PF409'; end if;
    if l.oferta_id is not null then select * into o from piefirme.ofertas where id = l.oferta_id; end if;
    for i in 1..greatest(floor(l.cantidad)::int, 1) loop
      if l.tipo = 'gift_card' then
        insert into piefirme.gift_cards (organizacion_id, oferta_id, sede_venta_id, venta_id, monto_inicial, saldo, fecha_venta, caduca_el)
        values (v.organizacion_id, o.id, v.sede_id, v.id, coalesce(o.monto_saldo, l.importe), coalesce(o.monto_saldo, l.importe), v_hoy,
                (v_hoy + make_interval(months => coalesce(o.caducidad_meses, piefirme_app.param_num(v.organizacion_id, 'vigencia_gift_card_meses', 12)::int)))::date);
      elsif l.tipo = 'plan' then
        insert into piefirme.planes_adquiridos (organizacion_id, sede_compra_id, paciente_id, oferta_id, venta_id, venta_linea_id, fecha_compra, caduca_el,
                                              sesiones_total, precio_total, usable_otra_sede)
        values (v.organizacion_id, v.sede_id, v.paciente_id, o.id, v.id, l.id, v_hoy,
                (v_hoy + make_interval(months => coalesce(o.caducidad_meses, piefirme_app.param_num(v.organizacion_id, 'vigencia_plan_meses', 12)::int)))::date,
                o.sesiones_total, round(l.importe / greatest(floor(l.cantidad), 1), 2), o.usable_otra_sede);
      elsif l.tipo = 'membresia' then
        insert into piefirme.membresias_paciente (organizacion_id, paciente_id, oferta_id, sede_venta_id, venta_id, inicio, vencimiento)
        values (v.organizacion_id, v.paciente_id, o.id, v.sede_id, v.id, v_hoy, (v_hoy + make_interval(months => o.caducidad_meses))::date);
      end if;
    end loop;
    if l.plan_adquirido_id is not null then perform piefirme_app.consumir_plan_en_venta(l.id); end if;   -- sesión pagada con el saldo del plan (130+)
    if l.promocion_id is not null then
      insert into piefirme.usos_promocion (organizacion_id, oferta_id, venta_id, venta_linea_id, paciente_id, sede_id, monto_descuento, motivo, autorizo_id)
      values (v.organizacion_id, l.promocion_id, v.id, l.id, v.paciente_id, v.sede_id, l.descuento, l.descuento_motivo,
              (select autorizador_id from piefirme.autorizaciones_admin where id = l.autorizacion_descuento_id));
    end if;
  end loop;
  update piefirme.ventas set estado = case when requiere_factura then 'por_facturar' else 'cobrada' end,
         turno_id = t.id, cajero_id = auth.uid(), cobrada_en = now() where id = p_venta;
end $$;


create or replace function piefirme.cancelar_venta(p_venta uuid, p_motivo text) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; t_id uuid; p record; g piefirme.gift_cards%rowtype; pl record;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso para cancelar' using errcode = 'PF403'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'la cancelación exige motivo' using errcode = 'PF400'; end if;
  select * into v from piefirme.ventas where id = p_venta for update;
  if not found then raise exception 'venta inexistente' using errcode = 'PF404'; end if;
  if v.estado = 'cancelada' then raise exception 'el ticket ya está cancelado' using errcode = 'PF409'; end if;
  select id into t_id from piefirme.turnos_caja where sede_id = v.sede_id and cajero_id = auth.uid() and estado = 'abierto';
  if not piefirme_app.es_admin() and v.estado not in ('por_cobrar', 'cuenta_abierta') and (t_id is null or v.turno_id is distinct from t_id) then
    raise exception 'tras cerrar el turno solo Administración cancela el ticket (P-060)' using errcode = 'PF403';
  end if;
  if exists (select 1 from piefirme.facturas f where f.venta_id = v.id and f.estado in ('vigente', 'cancelacion_en_proceso')) then
    raise exception 'cancele o acredite el CFDI antes de cancelar el ticket (P-060)' using errcode = 'PF409';
  end if;
  -- gift cards vendidas en este ticket: solo se anulan si no se han usado
  for g in select * from piefirme.gift_cards where venta_id = v.id loop
    if g.saldo <> g.monto_inicial then raise exception 'la gift card % ya tiene canjes', g.codigo using errcode = 'PF409'; end if;
    update piefirme.gift_cards set estado = 'cancelada' where id = g.id;
  end loop;
  for pl in select * from piefirme.planes_adquiridos where venta_id = v.id loop
    if pl.sesiones_usadas > 0 then raise exception 'el plan % ya tiene sesiones usadas', pl.folio using errcode = 'PF409'; end if;
    update piefirme.planes_adquiridos set estado = 'cancelado' where id = pl.id;
  end loop;
  update piefirme.membresias_paciente set estado = 'cancelada' where venta_id = v.id;
  -- reversos: canjes de gift card, anticipos aplicados, usos de promoción
  for p in select * from piefirme.pagos where venta_id = v.id and metodo = 'gift_card' loop
    insert into piefirme.gift_card_movimientos (organizacion_id, gift_card_id, tipo, monto, venta_id, sede_id, nota)
    values (v.organizacion_id, p.gift_card_id, 'reversa', p.monto, v.id, v.sede_id, 'Cancelación de ' || coalesce(v.folio, ''));
  end loop;
  perform set_config('app.reversa', 'on', true);
  update piefirme.anticipos set estado = 'pagado' where venta_id = v.id and estado = 'aplicado';
  perform set_config('app.reversa', 'off', true);
  update piefirme.usos_promocion set reversado = true where venta_id = v.id and not reversado;
  update piefirme.ofertas o set usos = greatest(o.usos - 1, 0) where o.id in (select oferta_id from piefirme.usos_promocion where venta_id = v.id);
  perform piefirme_app.revertir_consumo_venta(v.id);   -- las sesiones de plan cobradas en este ticket regresan al plan
  update piefirme.ventas set estado = 'cancelada', motivo_cancelacion = p_motivo, cancelada_turno_id = t_id where id = v.id;
  perform piefirme.registrar_bitacora('actualizar', 'ventas', v.id::text, jsonb_build_object('cancelacion', p_motivo), v.sede_id);
end $$;

