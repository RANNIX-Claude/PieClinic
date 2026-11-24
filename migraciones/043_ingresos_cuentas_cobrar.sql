-- 043 · Inventario y finanzas · ingresos (cobros registrados) ligados a venta/cita/pago, aplicaciones a cuentas por cobrar, validación y clasificación.
-- Dominio C. Clona de IRP: ingresos + estatus_validacion (POR_VALIDAR/VALIDADO/OBSERVADO) + clasificación automática + aplicaciones_pago que no exceden el ingreso
--   (fn_validar_aplicaciones_vs_ingreso, fn_actualizar_estado_cargo, fn_clasificacion_desde_aplicaciones, prp_ingresos_descuadrados).
-- Reglas: P-089 (Observado solo marca y alerta, no bloquea), P-090 (real = cobrado; validado es atributo; comisión solo sobre validado), P-091 (base cobrado por fecha de pago),
--   P-076 (crédito solo por servicios prestados/apartados), P-077 (comisión de terminal es gasto, el cobro va bruto), P-099 (periodo cerrado), S17/S21 (estados).
-- Dependencias: 001, 010 (pacientes), 020 (servicios/productos), 023 (citas), 026+ (ventas, pagos, facturas: dominio B, por contrato), 042 (edr_renglones, c_guardar_periodo).
-- Contrato: B (o la app) llama piefirme.registrar_ingreso(...) al cobrar; no se asume ninguna columna de ventas/pagos más allá de id.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.ingresos (
  id                   uuid primary key default gen_random_uuid(),
  organizacion_id      uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id              uuid not null references piefirme.sedes(id),
  fecha_pago           date not null,
  forma_pago           text not null check (forma_pago in ('transferencia', 'deposito', 'efectivo', 'tarjeta_clip', 'tarjeta', 'cheque', 'gift_card')),
  importe              numeric(14,2) not null check (importe > 0),               -- cobrado bruto, IVA incluido (P-077)
  iva                  numeric(14,2) not null default 0 check (iva >= 0),
  clasificacion        text not null default 'servicio' check (clasificacion in ('servicio', 'producto', 'anticipo', 'plan', 'mixto')),
  clasificacion_manual boolean not null default false,
  renglon_id           uuid references piefirme.edr_renglones(id) on delete set null,   -- renglón principal del EDR (P-101)
  venta_id             uuid references piefirme.ventas(id) on delete set null,
  cita_id              uuid references piefirme.citas(id) on delete set null,
  pago_id              uuid references piefirme.pagos(id) on delete set null,
  anticipo_id          uuid references piefirme.anticipos(id) on delete set null,
  paciente_id          uuid references piefirme.pacientes(id) on delete set null,
  podologo_id          uuid references piefirme.perfiles(id) on delete set null,
  referencia           text,                                                      -- folio de operación: CLIP-882041, SPEI…
  concepto             text,
  comprobante_url      text,                                                      -- bucket «pf-comprobantes»: <organizacion_id>/ingresos/…
  factura_id           uuid references piefirme.facturas(id) on delete set null,
  cfdi_uuid            text,
  estatus_validacion   text not null default 'por_validar' check (estatus_validacion in ('por_validar', 'validado', 'validado_cfdi', 'observado')),
  validado_por         uuid references piefirme.perfiles(id) on delete set null,
  validado_en          timestamptz,
  observacion          text,
  origen_registro      text not null default 'manual' check (origen_registro in ('automatico', 'manual')),
  es_reembolso         boolean not null default false,
  ingreso_origen_id    uuid references piefirme.ingresos(id) on delete restrict,   -- reembolso/ajuste → cobro original
  lote_liquidacion_id  uuid,                                                      -- liquidación Clip (FK en 045)
  creado_por           uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (iva <= importe),
  check (venta_id is not null or cita_id is not null or pago_id is not null or anticipo_id is not null or coalesce(trim(concepto), '') <> ''),
  check (estatus_validacion <> 'observado' or coalesce(trim(observacion), '') <> ''),
  check (not es_reembolso or ingreso_origen_id is not null)
);
create unique index ingresos_pago_unico on piefirme.ingresos (pago_id) where pago_id is not null;
create unique index ingresos_anticipo_unico on piefirme.ingresos (anticipo_id) where anticipo_id is not null and not es_reembolso;
create index on piefirme.ingresos (organizacion_id, sede_id, fecha_pago desc);
create index on piefirme.ingresos (organizacion_id, estatus_validacion);
create index on piefirme.ingresos (organizacion_id, venta_id) where venta_id is not null;
create index on piefirme.ingresos (organizacion_id, cita_id) where cita_id is not null;
create index on piefirme.ingresos (organizacion_id, paciente_id) where paciente_id is not null;

-- Reparto opcional del cobro entre renglones del EDR (cobro «mixto»: servicio + producto). Importes con IVA; lo no repartido va al renglón principal.
create table piefirme.ingreso_renglones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  ingreso_id       uuid not null references piefirme.ingresos(id) on delete cascade,
  renglon_id       uuid not null references piefirme.edr_renglones(id) on delete restrict,
  importe          numeric(14,2) not null check (importe > 0),
  created_at       timestamptz not null default now(),
  unique (ingreso_id, renglon_id)
);
create index on piefirme.ingreso_renglones (organizacion_id, ingreso_id);

-- Cuentas por cobrar: saldos de pacientes por servicios prestados o apartados (E113, P-076)
create table piefirme.cuentas_por_cobrar (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  paciente_id      uuid not null references piefirme.pacientes(id),
  origen_tipo      text not null default 'venta' check (origen_tipo in ('venta', 'plan', 'plantilla_apartado', 'cita_sin_cobro', 'otro')),
  venta_id         uuid references piefirme.ventas(id) on delete set null,
  cita_id          uuid references piefirme.citas(id) on delete set null,
  concepto         text not null,                                            -- «Plan 2/3 · Uña», «Plantillas (apartado)»
  clasificacion    text not null default 'servicio' check (clasificacion in ('servicio', 'producto', 'anticipo', 'plan')),
  importe          numeric(14,2) not null check (importe > 0),
  cobrado          numeric(14,2) not null default 0 check (cobrado >= 0),   -- lo mantiene el trigger de aplicaciones
  saldo            numeric(14,2) generated always as (importe - cobrado) stored,
  fecha_emision    date not null default current_date,
  fecha_limite     date,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'cobrada', 'cancelada')),
  cancelada_motivo text,
  creado_por       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (estado <> 'cancelada' or coalesce(trim(cancelada_motivo), '') <> '')
);
create index on piefirme.cuentas_por_cobrar (organizacion_id, sede_id, estado);
create index on piefirme.cuentas_por_cobrar (organizacion_id, paciente_id);

create table piefirme.aplicaciones_cobro (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid not null references piefirme.sedes(id),
  ingreso_id        uuid not null references piefirme.ingresos(id) on delete cascade,
  cuenta_id         uuid not null references piefirme.cuentas_por_cobrar(id) on delete cascade,
  importe_aplicado  numeric(14,2) not null check (importe_aplicado > 0),
  created_at        timestamptz not null default now(),
  unique (ingreso_id, cuenta_id)
);
create index on piefirme.aplicaciones_cobro (organizacion_id, cuenta_id);
create index on piefirme.aplicaciones_cobro (organizacion_id, ingreso_id);

-- ───────────────────────────── triggers · ingresos ─────────────────────────────
create trigger t_a_padre before insert on piefirme.ingreso_renglones for each row execute function piefirme_app.c_heredar_de_padre('ingresos', 'ingreso_id');
create trigger t_a_padre before insert on piefirme.aplicaciones_cobro for each row execute function piefirme_app.c_heredar_de_padre('ingresos', 'ingreso_id');

create or replace function piefirme_app.c_ingreso_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_admin boolean := piefirme_app.es_admin() or auth.uid() is null; v_rpc boolean := coalesce(current_setting('app.c_rpc', true), '') = 'on';
begin
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'sede de otra clínica' using errcode = '42501';
  end if;
  if new.renglon_id is not null and not exists (select 1 from piefirme.edr_renglones r where r.id = new.renglon_id and r.organizacion_id = new.organizacion_id) then
    raise exception 'renglón de otra clínica' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if not v_admin and not v_rpc and (new.estatus_validacion <> 'por_validar' or new.es_reembolso) then
      raise exception 'Recepción solo registra cobros por validar' using errcode = '42501';
    end if;
    if new.renglon_id is null then
      select id into new.renglon_id from piefirme.edr_renglones
       where organizacion_id = new.organizacion_id and clave = case when new.clasificacion = 'producto' then 'venta_productos' else 'otros_servicios' end;
    end if;
    if new.estatus_validacion in ('validado', 'validado_cfdi') then new.validado_por := coalesce(new.validado_por, auth.uid()); new.validado_en := coalesce(new.validado_en, now()); end if;
    return new;
  end if;
  -- UPDATE
  if new.estatus_validacion is distinct from old.estatus_validacion then
    if not v_admin and not v_rpc then raise exception 'solo Administración valida o marca como observado (S17)' using errcode = '42501'; end if;
    if not ((old.estatus_validacion = 'por_validar' and new.estatus_validacion in ('validado', 'observado'))
         or (old.estatus_validacion = 'observado'   and new.estatus_validacion in ('por_validar', 'validado'))
         or (old.estatus_validacion = 'validado'    and new.estatus_validacion in ('validado_cfdi', 'por_validar', 'observado'))
         or (old.estatus_validacion = 'validado_cfdi' and new.estatus_validacion in ('validado', 'observado'))) then
      raise exception 'transición de ingreso no permitida: % → %', old.estatus_validacion, new.estatus_validacion using errcode = 'PF409';
    end if;
    if new.estatus_validacion = 'validado_cfdi' and new.factura_id is null and coalesce(new.cfdi_uuid, '') = '' then
      raise exception 'para marcar «Validado CFDI» asocia la factura o el UUID' using errcode = 'PF409';
    end if;
    if new.estatus_validacion in ('validado', 'validado_cfdi') then
      new.validado_por := coalesce(old.validado_por, auth.uid()); new.validado_en := coalesce(old.validado_en, now());
    else
      new.validado_por := null; new.validado_en := null;
    end if;
  end if;
  if old.estatus_validacion in ('validado', 'validado_cfdi') and new.estatus_validacion = old.estatus_validacion
     and (new.importe, new.fecha_pago, new.sede_id, new.forma_pago, new.iva) is distinct from (old.importe, old.fecha_pago, old.sede_id, old.forma_pago, old.iva) then
    raise exception 'el cobro ya está validado: regrésalo a «por validar» antes de modificar monto, fecha o forma de pago' using errcode = 'PF409';
  end if;
  if new.clasificacion is distinct from old.clasificacion and not v_rpc then new.clasificacion_manual := true; end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.ingresos for each row execute function piefirme_app.c_ingreso_bi();
create trigger t_per before insert or update or delete on piefirme.ingresos
  for each row execute function piefirme_app.c_guardar_periodo('fecha_pago', 'estatus_validacion,validado_por,validado_en,observacion,factura_id,cfdi_uuid,comprobante_url,updated_at');

-- No se borra un cobro validado
create or replace function piefirme_app.c_ingreso_bd() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if old.estatus_validacion in ('validado', 'validado_cfdi') then
    raise exception 'un cobro validado no se borra: regrésalo a por validar o regístralo como reembolso' using errcode = 'PF409';
  end if;
  return old;
end $$;
create trigger t_bd before delete on piefirme.ingresos for each row execute function piefirme_app.c_ingreso_bd();

-- Reparto por renglón: la suma no puede exceder el cobro
create or replace function piefirme_app.c_ingreso_renglones_chk() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ing uuid := coalesce(new.ingreso_id, old.ingreso_id); v_imp numeric; v_sum numeric;
begin
  select importe into v_imp from piefirme.ingresos where id = v_ing;
  if v_imp is null then return null; end if;
  select coalesce(sum(importe), 0) into v_sum from piefirme.ingreso_renglones where ingreso_id = v_ing;
  if v_sum > v_imp + 0.01 then
    raise exception 'el reparto por renglón ($%) excede el cobro ($%)', v_sum, v_imp using errcode = 'PF409';
  end if;
  return null;
end $$;
create constraint trigger t_chk after insert or update on piefirme.ingreso_renglones deferrable initially immediate for each row execute function piefirme_app.c_ingreso_renglones_chk();

-- ───────────────────────────── aplicaciones: no exceden el ingreso ni el saldo (clon IRP) ─────────────────────────────
create or replace function piefirme_app.c_aplicacion_chk() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ing piefirme.ingresos%rowtype; v_cta piefirme.cuentas_por_cobrar%rowtype; v_ap_ing numeric; v_ap_cta numeric;
begin
  select * into v_ing from piefirme.ingresos where id = new.ingreso_id;
  select * into v_cta from piefirme.cuentas_por_cobrar where id = new.cuenta_id;
  if v_cta.organizacion_id <> v_ing.organizacion_id then raise exception 'cuenta de otra clínica' using errcode = '42501'; end if;
  if v_cta.estado = 'cancelada' then raise exception 'la cuenta por cobrar está cancelada' using errcode = 'PF409'; end if;
  if v_ing.es_reembolso then raise exception 'un reembolso no se aplica a cuentas por cobrar' using errcode = 'PF409'; end if;
  if v_ing.paciente_id is not null and v_ing.paciente_id <> v_cta.paciente_id then
    raise exception 'el cobro y la cuenta son de pacientes distintos' using errcode = 'PF409';
  end if;
  select coalesce(sum(importe_aplicado), 0) into v_ap_ing from piefirme.aplicaciones_cobro where ingreso_id = new.ingreso_id;
  if v_ap_ing > v_ing.importe + 0.01 then
    raise exception 'La distribución excede el cobro: el ingreso es de $% y se aplican $% (sobran $%)',
      to_char(v_ing.importe, 'FM999,999,990.00'), to_char(v_ap_ing, 'FM999,999,990.00'), to_char(v_ap_ing - v_ing.importe, 'FM999,999,990.00') using errcode = 'PF409';
  end if;
  select coalesce(sum(importe_aplicado), 0) into v_ap_cta from piefirme.aplicaciones_cobro where cuenta_id = new.cuenta_id;
  if v_ap_cta > v_cta.importe + 0.01 then
    raise exception 'Lo aplicado ($%) excede el importe de la cuenta ($%)', v_ap_cta, v_cta.importe using errcode = 'PF409';
  end if;
  return null;
end $$;
create constraint trigger t_chk after insert or update on piefirme.aplicaciones_cobro deferrable initially immediate for each row execute function piefirme_app.c_aplicacion_chk();

-- Bajar el importe de un cobro no puede dejarlo sobre-aplicado
create or replace function piefirme_app.c_ingreso_vs_aplicaciones() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ap numeric;
begin
  select coalesce(sum(importe_aplicado), 0) into v_ap from piefirme.aplicaciones_cobro where ingreso_id = new.id;
  if v_ap > new.importe + 0.01 then
    raise exception 'No se puede bajar el cobro a $%: ya tiene $% distribuidos', new.importe, v_ap using errcode = 'PF409';
  end if;
  return null;
end $$;
create constraint trigger t_chk after update on piefirme.ingresos deferrable initially immediate
  for each row when (new.importe is distinct from old.importe) execute function piefirme_app.c_ingreso_vs_aplicaciones();

-- Estado de la cuenta (cobrado/saldo) y clasificación del ingreso, también al borrar o mover (clon fn_actualizar_estado_cargo)
create or replace function piefirme_app.c_aplicacion_ai() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_ctas uuid[]; v_ings uuid[]; v_c uuid; v_i uuid; v_imp numeric; v_ap numeric; v_cl text[];
begin
  v_ctas := array_remove(array[case when tg_op in ('INSERT', 'UPDATE') then new.cuenta_id end, case when tg_op in ('DELETE', 'UPDATE') then old.cuenta_id end], null);
  v_ings := array_remove(array[case when tg_op in ('INSERT', 'UPDATE') then new.ingreso_id end, case when tg_op in ('DELETE', 'UPDATE') then old.ingreso_id end], null);
  foreach v_c in array v_ctas loop
    select importe into v_imp from piefirme.cuentas_por_cobrar where id = v_c;
    if v_imp is null then continue; end if;
    select coalesce(sum(importe_aplicado), 0) into v_ap from piefirme.aplicaciones_cobro where cuenta_id = v_c;
    update piefirme.cuentas_por_cobrar set cobrado = v_ap,
           estado = case when estado = 'cancelada' then 'cancelada' when v_ap >= v_imp - 0.01 then 'cobrada' when v_ap > 0 then 'parcial' else 'pendiente' end
     where id = v_c;
  end loop;
  foreach v_i in array v_ings loop
    select array_agg(distinct c.clasificacion) into v_cl from piefirme.aplicaciones_cobro a join piefirme.cuentas_por_cobrar c on c.id = a.cuenta_id
     where a.ingreso_id = v_i and a.importe_aplicado > 0;
    if v_cl is not null then
      perform set_config('app.c_rpc', 'on', true);
      update piefirme.ingresos set clasificacion = case when array_length(v_cl, 1) = 1 then v_cl[1] else 'mixto' end
       where id = v_i and not clasificacion_manual;
    end if;
  end loop;
  return null;
end $$;
create trigger t_ai after insert or update or delete on piefirme.aplicaciones_cobro for each row execute function piefirme_app.c_aplicacion_ai();

create or replace function piefirme_app.c_cuenta_cobrar_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'paciente de otra clínica' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.importe < new.cobrado - 0.01 then
    raise exception 'el importe no puede ser menor a lo ya cobrado' using errcode = 'PF409';
  end if;
  if tg_op = 'UPDATE' and new.estado = 'cancelada' and old.estado <> 'cancelada' and old.cobrado > 0 then
    raise exception 'la cuenta ya tiene cobros aplicados: no se cancela' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.cuentas_por_cobrar for each row execute function piefirme_app.c_cuenta_cobrar_bi();

-- ───────────────────────────── RPC · registrar un cobro (lo llama caja/B al cobrar) ─────────────────────────────
-- Devuelve el id del ingreso nuevo o null si ese pago ya estaba registrado (idempotente por pago_id).
create or replace function piefirme.registrar_ingreso(
  p_sede uuid, p_fecha date, p_forma text, p_importe numeric,
  p_iva numeric default 0, p_clasificacion text default 'servicio', p_renglon text default null,
  p_venta uuid default null, p_cita uuid default null, p_pago uuid default null, p_paciente uuid default null, p_podologo uuid default null,
  p_referencia text default null, p_concepto text default null, p_comprobante text default null, p_manual boolean default false)
returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_ren uuid;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') or not piefirme_app.puede_sede(p_sede) then
    raise exception 'sin permiso para registrar cobros en esta sede' using errcode = '42501';
  end if;
  if p_manual and not piefirme_app.es_admin() then raise exception 'solo Administración captura ingresos manuales' using errcode = '42501'; end if;
  if p_renglon is not null then
    select id into v_ren from piefirme.edr_renglones where organizacion_id = piefirme_app.org_id() and clave = p_renglon;
    if v_ren is null then raise exception 'renglón de EDR inexistente: %', p_renglon using errcode = 'PF404'; end if;
  end if;
  begin
    insert into piefirme.ingresos (id, organizacion_id, sede_id, fecha_pago, forma_pago, importe, iva, clasificacion, renglon_id, venta_id, cita_id, pago_id,
                                 paciente_id, podologo_id, referencia, concepto, comprobante_url, origen_registro)
    values (v_id, piefirme_app.org_id(), p_sede, p_fecha, p_forma, p_importe, coalesce(p_iva, 0), coalesce(p_clasificacion, 'servicio'), v_ren, p_venta, p_cita, p_pago,
            p_paciente, p_podologo, p_referencia, p_concepto, p_comprobante, case when p_manual then 'manual' else 'automatico' end);
  exception when unique_violation then
    return null;      -- ese pago ya estaba registrado (idempotente); sin ON CONFLICT porque Recepción no tiene política de lectura
  end;
  return v_id;
end $$;
revoke all on function piefirme.registrar_ingreso(uuid, date, text, numeric, numeric, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text, boolean) from public, anon;
grant execute on function piefirme.registrar_ingreso(uuid, date, text, numeric, numeric, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text, boolean) to authenticated;

-- RPC · validar / observar (Administración)
create or replace function piefirme.ingreso_validar(p_ingreso uuid, p_estatus text, p_observacion text default null) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_n integer;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración valida cobros' using errcode = '42501'; end if;
  if p_estatus not in ('por_validar', 'validado', 'validado_cfdi', 'observado') then raise exception 'estatus inválido' using errcode = '22023'; end if;
  perform set_config('app.c_rpc', 'on', true);
  update piefirme.ingresos set estatus_validacion = p_estatus, observacion = coalesce(p_observacion, observacion) where id = p_ingreso;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'cobro inexistente' using errcode = 'PF404'; end if;
end $$;
revoke all on function piefirme.ingreso_validar(uuid, text, text) from public, anon;
grant execute on function piefirme.ingreso_validar(uuid, text, text) to authenticated;

-- ───────────────────────────── RLS ─────────────────────────────
-- Finanzas: solo Administración ve y edita; Recepción solo inserta el cobro que nace de la caja (MATRIZ_ROLES §4.4 y CA-08).
select piefirme_app.c_politicas('ingresos', p_ver => array['administrador'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador'], p_del => array['administrador'],
                       p_cond_ins => $c$(piefirme_app.rol()::text = 'administrador' or (origen_registro = 'automatico' and estatus_validacion = 'por_validar' and not es_reembolso))$c$,
                       p_cond_del => $c$estatus_validacion in ('por_validar', 'observado')$c$);
select piefirme_app.c_politicas('ingreso_renglones', p_ver => array['administrador'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador'], p_del => array['administrador']);
select piefirme_app.c_politicas('cuentas_por_cobrar', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador'], p_del => array[]::text[]);
select piefirme_app.c_politicas('aplicaciones_cobro', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador']);
select piefirme_app.c_triggers('ingresos');
select piefirme_app.c_triggers('ingreso_renglones', false);
select piefirme_app.c_triggers('cuentas_por_cobrar');
select piefirme_app.c_triggers('aplicaciones_cobro');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_ingresos with (security_invoker = true) as
select i.id, i.organizacion_id, i.sede_id, s.nombre as sede_nombre, i.fecha_pago, i.forma_pago, i.importe, i.iva, (i.importe - i.iva) as base_sin_iva,
       case when i.es_reembolso then -i.importe else i.importe end as importe_neto,
       i.clasificacion, i.clasificacion_manual, i.renglon_id, i.venta_id, i.cita_id, i.pago_id, i.paciente_id, i.podologo_id,
       i.referencia, i.concepto, i.comprobante_url, (i.comprobante_url is not null) as tiene_comprobante, i.factura_id, i.cfdi_uuid,
       (i.factura_id is not null or i.cfdi_uuid is not null) as tiene_cfdi,
       i.estatus_validacion, (i.estatus_validacion in ('validado', 'validado_cfdi')) as comisionable, i.validado_por, i.validado_en, i.observacion,
       i.origen_registro, i.es_reembolso, i.ingreso_origen_id, i.lote_liquidacion_id, i.created_at,
       coalesce((select sum(a.importe_aplicado) from piefirme.aplicaciones_cobro a where a.ingreso_id = i.id), 0) as aplicado
  from piefirme.ingresos i join piefirme.sedes s on s.id = i.sede_id;

create or replace view piefirme.prp_ingresos_descuadrados with (security_invoker = true) as
select i.id as ingreso_id, i.organizacion_id, i.sede_id, i.fecha_pago, i.importe, i.paciente_id,
       coalesce(a.total_aplicado, 0) as total_aplicado, coalesce(a.total_aplicado, 0) - i.importe as diferencia, a.n_aplicaciones,
       case when coalesce(a.total_aplicado, 0) > i.importe + 0.01 then 'SOBRE_APLICADO' else 'PARCIALMENTE_APLICADO' end as problema
  from piefirme.ingresos i
  join lateral (select sum(ap.importe_aplicado) total_aplicado, count(*) n_aplicaciones from piefirme.aplicaciones_cobro ap where ap.ingreso_id = i.id) a on a.n_aplicaciones > 0
 where abs(coalesce(a.total_aplicado, 0) - i.importe) > 0.01;

create or replace view piefirme.prp_cuentas_cobrar with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, s.nombre as sede_nombre, c.paciente_id, c.origen_tipo, c.venta_id, c.cita_id, c.concepto, c.clasificacion,
       c.importe, c.cobrado, c.saldo, c.fecha_emision, c.fecha_limite, c.estado as estado_registro,
       greatest(current_date - c.fecha_emision, 0) as dias_antiguedad,
       case when c.estado = 'cobrada' then 'cobrada' when c.estado = 'cancelada' then 'cancelada'
            when current_date - c.fecha_emision >= piefirme_app.c_param(c.organizacion_id, 'cxc_dias_mora', 30) or (c.fecha_limite is not null and c.fecha_limite < current_date) then 'en_mora'
            when current_date - c.fecha_emision <= piefirme_app.c_param(c.organizacion_id, 'cxc_dias_reciente', 7) then 'reciente'
            else 'pendiente' end as estado
  from piefirme.cuentas_por_cobrar c join piefirme.sedes s on s.id = c.sede_id;

-- ───────────────────────────── permisos ─────────────────────────────
revoke all on all tables in schema piefirme from anon;
