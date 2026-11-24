-- 052 · EQUIPO Y PLATAFORMA (D) · Comisiones por podólogo, metas, periodos de nómina y prenómina / recibos.
-- Clona de IRP: TabNomina / TabNominaIWOL (periodo, cálculo, autorización), TabRecibosNomina (recibos firmados), rh_nomina_renglones.
-- Depende de: 001, 050, 051 (empleados, asistencia, incidencias_rh) y por contrato: citas(id), ventas(id).
-- Reglas: P-106 (esquema por podólogo; % por servicio/producto/plan; viático o piso opcional; SIN % por defecto: lo fija el cliente),
--   P-107 (base = cobrado sin IVA neto de descuentos y reembolsos; solo ingresos VALIDADOS; planes por sesión atendida),
--   P-108 (esquema vigente a la fecha del servicio, no se recalcula; ajustes posteriores van al siguiente periodo con referencia),
--   P-099 (periodo cerrado = solo lectura; reapertura solo Administración con bitácora), P-104 (solo prenómina, sin timbrado),
--   P-109 (comisión por cita; nómina a la sede de contrato), CA-18 (la comisión de un periodo cerrado entra a la quincena que
--   contiene su fecha de cierre).
-- La app/función servidor calcula la base desde los renglones de venta VALIDADOS del dominio comercial y la entrega a
--   piefirme.comisiones_registrar_detalle(); aquí se aplica el esquema vigente y se totaliza (el esquema de líneas de venta es de otro dominio).
-- Entidades: E129 Periodo de nómina, E130 Prenómina/recibo, E131 Esquema de comisión, E132 Comisión calculada, E133 Meta.

-- ───────────────────────────── esquemas de comisión (E131) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.esquemas_comision (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  empleado_id      uuid not null references piefirme.empleados(id) on delete cascade,   -- el podólogo
  nombre           text not null,
  tipo             text not null default 'porcentaje' check (tipo in ('porcentaje', 'porcentaje_viatico', 'sueldo_bono', 'renta_cabina')),
  pct_servicio     numeric(5,2) not null default 0 check (pct_servicio between 0 and 100),   -- sin valor por defecto de negocio (P-106)
  pct_producto     numeric(5,2) not null default 0 check (pct_producto between 0 and 100),
  pct_plan         numeric(5,2) not null default 0 check (pct_plan between 0 and 100),
  viatico_por_cita numeric(14,2) not null default 0 check (viatico_por_cita >= 0),
  piso_periodo     numeric(14,2) not null default 0 check (piso_periodo >= 0),
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  activo           boolean not null default true,
  notas            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  unique (empleado_id, vigente_desde)
);
create index on piefirme.esquemas_comision (organizacion_id, empleado_id, vigente_desde desc);

-- un esquema nuevo cierra el anterior el día previo (no hay traslapes; el histórico se conserva, P-108)
create or replace function piefirme_app.cerrar_esquema_anterior() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.esquemas_comision
     set vigente_hasta = new.vigente_desde - 1
   where empleado_id = new.empleado_id and id <> new.id and vigente_hasta is null and vigente_desde < new.vigente_desde;
  return null;
end $$;
create trigger t_cierra after insert on piefirme.esquemas_comision for each row execute function piefirme_app.cerrar_esquema_anterior();
create trigger t_upd before update on piefirme.esquemas_comision for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.esquemas_comision for each row execute function piefirme_app.auditar();

-- esquema vigente de un podólogo en una fecha
create or replace function piefirme.esquema_comision_vigente(p_empleado uuid, p_fecha date)
returns uuid language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select id from piefirme.esquemas_comision
   where empleado_id = p_empleado and activo and vigente_desde <= p_fecha and (vigente_hasta is null or vigente_hasta >= p_fecha)
   order by vigente_desde desc limit 1
$$;

-- ───────────────────────────── periodos y comisiones calculadas (E132) ─────────────────────────────
create table piefirme.periodos_comision (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  desde              date not null,
  hasta              date not null,
  estado             text not null default 'por_cerrar' check (estado in ('por_cerrar', 'cerrado')),
  cerrado_por        uuid,
  cerrado_en         timestamptz,
  reabierto_por      uuid,
  reabierto_en       timestamptz,
  motivo_reapertura  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (hasta >= desde),
  unique (organizacion_id, desde, hasta)
);
create trigger t_upd before update on piefirme.periodos_comision for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.periodos_comision for each row execute function piefirme_app.auditar();

create table piefirme.comisiones_calculadas (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  periodo_id          uuid not null references piefirme.periodos_comision(id) on delete cascade,
  empleado_id         uuid not null references piefirme.empleados(id),
  sede_id             uuid references piefirme.sedes(id),             -- sede de contrato
  citas               integer not null default 0,
  ingreso_servicios   numeric(14,2) not null default 0,
  venta_productos     numeric(14,2) not null default 0,
  ingreso_planes      numeric(14,2) not null default 0,
  base_comisionable   numeric(14,2) not null default 0,
  esquema_id          uuid references piefirme.esquemas_comision(id),  -- esquema del último renglón (el detalle guarda el de cada uno)
  comision_servicios  numeric(14,2) not null default 0,
  comision_productos  numeric(14,2) not null default 0,
  comision_planes     numeric(14,2) not null default 0,
  ajustes             numeric(14,2) not null default 0,
  viatico             numeric(14,2) not null default 0,
  piso_aplicado       boolean not null default false,
  comision_total      numeric(14,2) not null default 0,
  quejas_periodo      integer not null default 0,                    -- lo alimenta el dominio clínico/comercial
  estado              text not null default 'por_cerrar' check (estado in ('por_cerrar', 'cerrado')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (periodo_id, empleado_id)
);
create index on piefirme.comisiones_calculadas (organizacion_id, empleado_id);

create table piefirme.comision_detalle (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references piefirme.organizaciones(id) on delete cascade,
  periodo_id             uuid not null references piefirme.periodos_comision(id) on delete cascade,
  empleado_id            uuid not null references piefirme.empleados(id),
  sede_id                uuid references piefirme.sedes(id),             -- sede donde se atendió (P-109)
  fecha                  date not null,
  tipo                   text not null check (tipo in ('servicio', 'producto', 'plan', 'ajuste')),
  concepto               text,
  cita_id                uuid references piefirme.citas(id) on delete set null,
  venta_id               uuid references piefirme.ventas(id) on delete set null,
  base                   numeric(14,2) not null,                       -- cobrado sin IVA, neto de descuentos/reembolsos; negativa en ajustes
  pct                    numeric(5,2) not null check (pct between 0 and 100),
  comision               numeric(14,2) not null,
  esquema_id             uuid references piefirme.esquemas_comision(id),
  referencia_detalle_id  uuid references piefirme.comision_detalle(id),  -- ajuste que apunta al renglón original (P-108)
  created_at             timestamptz not null default now()
);
create index on piefirme.comision_detalle (organizacion_id, periodo_id, empleado_id);
create index on piefirme.comision_detalle (cita_id);
create index on piefirme.comision_detalle (venta_id);

-- periodo cerrado = solo lectura (P-099)
create or replace function piefirme_app.bloquear_periodo_comision_cerrado() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_per uuid; v_est text;
begin
  v_per := coalesce(new.periodo_id, old.periodo_id);
  select estado into v_est from piefirme.periodos_comision where id = v_per;
  if v_est = 'cerrado' then
    raise exception 'El periodo de comisiones está cerrado: los ajustes van al siguiente periodo con referencia (P-108)';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_cerrado before insert or update or delete on piefirme.comision_detalle for each row execute function piefirme_app.bloquear_periodo_comision_cerrado();
create trigger t_cerrado before insert or update or delete on piefirme.comisiones_calculadas for each row execute function piefirme_app.bloquear_periodo_comision_cerrado();
create trigger t_upd before update on piefirme.comisiones_calculadas for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.comisiones_calculadas for each row execute function piefirme_app.auditar();

-- recalcula totales de un periodo a partir del detalle (interno; lo invocan los RPC)
create or replace function piefirme_app.comisiones_recalcular(p_periodo uuid) returns void
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r record; v_org uuid; v_esq piefirme.esquemas_comision; v_com numeric; v_via numeric; v_piso boolean;
begin
  select organizacion_id into v_org from piefirme.periodos_comision where id = p_periodo;
  for r in
    select d.empleado_id,
           count(distinct d.cita_id) filter (where d.tipo <> 'ajuste') as citas,
           coalesce(sum(d.base) filter (where d.tipo = 'servicio'), 0) as ing_serv,
           coalesce(sum(d.base) filter (where d.tipo = 'producto'), 0) as ing_prod,
           coalesce(sum(d.base) filter (where d.tipo = 'plan'), 0) as ing_plan,
           coalesce(sum(d.comision) filter (where d.tipo = 'servicio'), 0) as c_serv,
           coalesce(sum(d.comision) filter (where d.tipo = 'producto'), 0) as c_prod,
           coalesce(sum(d.comision) filter (where d.tipo = 'plan'), 0) as c_plan,
           coalesce(sum(d.comision) filter (where d.tipo = 'ajuste'), 0) as c_aj,
           coalesce(sum(d.base) filter (where d.tipo <> 'ajuste'), 0) as base,
           (array_agg(d.esquema_id order by d.fecha desc))[1] as esquema_id,
           max(d.fecha) as ult
      from piefirme.comision_detalle d where d.periodo_id = p_periodo group by d.empleado_id
  loop
    select * into v_esq from piefirme.esquemas_comision where id = r.esquema_id;
    v_via := case when v_esq.tipo = 'porcentaje_viatico' then v_esq.viatico_por_cita * r.citas else 0 end;
    v_com := r.c_serv + r.c_prod + r.c_plan + r.c_aj + v_via;
    v_piso := coalesce(v_esq.piso_periodo, 0) > v_com;
    insert into piefirme.comisiones_calculadas (organizacion_id, periodo_id, empleado_id, sede_id, citas, ingreso_servicios, venta_productos, ingreso_planes,
             base_comisionable, esquema_id, comision_servicios, comision_productos, comision_planes, ajustes, viatico, piso_aplicado, comision_total)
    values (v_org, p_periodo, r.empleado_id, (select sede_id from piefirme.empleados where id = r.empleado_id), r.citas, r.ing_serv, r.ing_prod, r.ing_plan,
            r.base, r.esquema_id, r.c_serv, r.c_prod, r.c_plan, r.c_aj, v_via, v_piso, case when v_piso then v_esq.piso_periodo else v_com end)
    on conflict (periodo_id, empleado_id) do update set
      sede_id = excluded.sede_id, citas = excluded.citas, ingreso_servicios = excluded.ingreso_servicios, venta_productos = excluded.venta_productos,
      ingreso_planes = excluded.ingreso_planes, base_comisionable = excluded.base_comisionable, esquema_id = excluded.esquema_id,
      comision_servicios = excluded.comision_servicios, comision_productos = excluded.comision_productos, comision_planes = excluded.comision_planes,
      ajustes = excluded.ajustes, viatico = excluded.viatico, piso_aplicado = excluded.piso_aplicado, comision_total = excluded.comision_total;
  end loop;
end $$;

-- p_filas: [{"empleado_id":"…","fecha":"2026-10-05","tipo":"servicio","base":400,"concepto":"Quiropodia","cita_id":"…","venta_id":"…","sede_id":"…","referencia_detalle_id":null}]
-- La base debe venir de ingresos VALIDADOS (P-090/P-107). Sin esquema vigente a la fecha del servicio → error (no hay % por defecto).
create or replace function piefirme.comisiones_registrar_detalle(p_periodo uuid, p_filas jsonb)
returns integer language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare per piefirme.periodos_comision; r jsonb; v_emp uuid; v_fecha date; v_tipo text; v_base numeric; v_esq piefirme.esquemas_comision;
        v_pct numeric; v_ref uuid; n int := 0;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  select * into per from piefirme.periodos_comision where id = p_periodo and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'Periodo no encontrado'; end if;
  if per.estado = 'cerrado' then raise exception 'Periodo cerrado'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_emp := (r ->> 'empleado_id')::uuid;
    v_fecha := (r ->> 'fecha')::date;
    v_tipo := r ->> 'tipo';
    v_base := (r ->> 'base')::numeric;
    v_ref := nullif(r ->> 'referencia_detalle_id', '')::uuid;
    if v_tipo <> 'ajuste' and (v_fecha < per.desde or v_fecha > per.hasta) then
      raise exception 'La fecha % queda fuera del periodo %–%', v_fecha, per.desde, per.hasta;
    end if;
    select * into v_esq from piefirme.esquemas_comision where id = piefirme.esquema_comision_vigente(v_emp, v_fecha);
    if not found then raise exception 'Sin esquema de comisión vigente para el empleado % al %', v_emp, v_fecha; end if;
    if v_tipo = 'ajuste' and v_ref is not null then
      select pct into v_pct from piefirme.comision_detalle where id = v_ref and organizacion_id = per.organizacion_id;
    end if;
    v_pct := coalesce(v_pct, case v_tipo when 'servicio' then v_esq.pct_servicio when 'producto' then v_esq.pct_producto when 'plan' then v_esq.pct_plan else v_esq.pct_servicio end);
    insert into piefirme.comision_detalle (organizacion_id, periodo_id, empleado_id, sede_id, fecha, tipo, concepto, cita_id, venta_id, base, pct, comision, esquema_id, referencia_detalle_id)
    values (per.organizacion_id, p_periodo, v_emp, nullif(r ->> 'sede_id', '')::uuid, v_fecha, v_tipo, r ->> 'concepto',
            nullif(r ->> 'cita_id', '')::uuid, nullif(r ->> 'venta_id', '')::uuid, v_base, v_pct, round(v_base * v_pct / 100, 2), v_esq.id, v_ref);
    v_pct := null;
    n := n + 1;
  end loop;
  perform piefirme_app.comisiones_recalcular(p_periodo);
  return n;
end $$;

create or replace function piefirme.comisiones_cerrar_periodo(p_periodo uuid)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  if not exists (select 1 from piefirme.periodos_comision where id = p_periodo and organizacion_id = piefirme_app.org_id() and estado = 'por_cerrar') then
    raise exception 'Periodo inexistente o ya cerrado';
  end if;
  perform piefirme_app.comisiones_recalcular(p_periodo);
  update piefirme.comisiones_calculadas set estado = 'cerrado' where periodo_id = p_periodo;
  update piefirme.periodos_comision set estado = 'cerrado', cerrado_por = auth.uid(), cerrado_en = now() where id = p_periodo;
end $$;

create or replace function piefirme.comisiones_reabrir_periodo(p_periodo uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'La reapertura exige motivo'; end if;
  if not exists (select 1 from piefirme.periodos_comision where id = p_periodo and organizacion_id = piefirme_app.org_id() and estado = 'cerrado') then
    raise exception 'Periodo inexistente o no cerrado';
  end if;
  if exists (select 1 from piefirme.prenomina pn join piefirme.periodos_nomina pr on pr.id = pn.periodo_id
              where pn.organizacion_id = piefirme_app.org_id() and pr.estado in ('autorizada', 'pagada')
                and pn.comisiones_ids && (select array_agg(id) from piefirme.comisiones_calculadas where periodo_id = p_periodo)) then
    raise exception 'La comisión ya está en una nómina autorizada; ajuste en el siguiente periodo';
  end if;
  update piefirme.periodos_comision set estado = 'por_cerrar', reabierto_por = auth.uid(), reabierto_en = now(), motivo_reapertura = p_motivo where id = p_periodo;
  update piefirme.comisiones_calculadas set estado = 'por_cerrar' where periodo_id = p_periodo;
  perform piefirme.registrar_bitacora('reabrir', 'periodos_comision', p_periodo::text, jsonb_build_object('motivo', p_motivo));
end $$;

-- ───────────────────────────── metas (E133) ─────────────────────────────
create table piefirme.metas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),
  empleado_id      uuid references piefirme.empleados(id) on delete cascade,
  ambito           text not null check (ambito in ('sede', 'podologo')),
  desde            date not null,
  hasta            date not null,
  meta_ocupacion   numeric(5,2) check (meta_ocupacion between 0 and 100),   -- valor inicial 80 en organizaciones.parametros.meta_ocupacion_pct
  meta_ingreso     numeric(14,2) check (meta_ingreso >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (hasta >= desde),
  check ((ambito = 'sede' and sede_id is not null) or (ambito = 'podologo' and empleado_id is not null))
);
create index on piefirme.metas (organizacion_id, ambito, desde);
create trigger t_upd before update on piefirme.metas for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── periodos de nómina (E129) y prenómina (E130) ─────────────────────────────
create table piefirme.periodos_nomina (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  periodicidad     text not null default 'quincenal' check (periodicidad in ('semanal', 'quincenal', 'mensual')),
  desde            date not null,
  hasta            date not null,
  fecha_pago       date,
  estado           text not null default 'creado' check (estado in ('creado', 'calculada', 'autorizada', 'pagada')),
  empleados        integer not null default 0,
  percepciones     numeric(14,2) not null default 0,
  deducciones      numeric(14,2) not null default 0,
  neto             numeric(14,2) not null default 0,
  autorizado_por   uuid,
  autorizado_en    timestamptz,
  pagado_en        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (hasta >= desde),
  unique (organizacion_id, periodicidad, desde, hasta)
);
create trigger t_upd before update on piefirme.periodos_nomina for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.periodos_nomina for each row execute function piefirme_app.auditar();

create table piefirme.prenomina (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  periodo_id            uuid not null references piefirme.periodos_nomina(id) on delete cascade,
  empleado_id           uuid not null references piefirme.empleados(id),
  sede_id               uuid not null references piefirme.sedes(id),      -- sede de contrato (P-109)
  esquema_contratacion  text not null check (esquema_contratacion in ('nomina', 'honorarios')),
  dias_trabajados       integer not null default 0,
  salario_periodo       numeric(14,2) not null default 0,
  comision              numeric(14,2) not null default 0,
  comisiones_ids        uuid[] not null default '{}',                    -- comisiones_calculadas incluidas
  bono                  numeric(14,2) not null default 0,
  subsidio              numeric(14,2) not null default 0,
  desc_incidencias      numeric(14,2) not null default 0,
  imss                  numeric(14,2) not null default 0,
  isr                   numeric(14,2) not null default 0,
  otras_deducciones     numeric(14,2) not null default 0,
  percepcion_total      numeric(14,2) generated always as (salario_periodo + comision + bono + subsidio) stored,
  deduccion_total       numeric(14,2) generated always as (desc_incidencias + imss + isr + otras_deducciones) stored,
  neto                  numeric(14,2) generated always as (salario_periodo + comision + bono + subsidio - desc_incidencias - imss - isr - otras_deducciones) stored,
  cfdi_estado           text not null default 'no_aplica' check (cfdi_estado in ('no_aplica', 'borrador', 'timbrado')),   -- P-104: sin timbrado en esta fase
  recibo_path           text,                                            -- bucket pf-documentos: <org>/rh/recibos/<empleado>/<periodo>.pdf
  recibo_firmado        boolean not null default false,
  firmado_en            timestamptz,
  notas                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (periodo_id, empleado_id)
);
create index on piefirme.prenomina (organizacion_id, empleado_id);
create index on piefirme.prenomina using gin (comisiones_ids);

-- autorizada/pagada = montos congelados; solo cambian recibo y firma
create or replace function piefirme_app.bloquear_prenomina() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_est text;
begin
  select estado into v_est from piefirme.periodos_nomina where id = coalesce(new.periodo_id, old.periodo_id);
  if v_est in ('autorizada', 'pagada') then
    if tg_op = 'DELETE' then raise exception 'Nómina autorizada: no se puede borrar'; end if;
    if tg_op = 'INSERT' then raise exception 'Nómina autorizada: no se pueden agregar renglones'; end if;
    if (new.salario_periodo, new.comision, new.bono, new.subsidio, new.desc_incidencias, new.imss, new.isr, new.otras_deducciones, new.dias_trabajados, new.empleado_id)
       is distinct from
       (old.salario_periodo, old.comision, old.bono, old.subsidio, old.desc_incidencias, old.imss, old.isr, old.otras_deducciones, old.dias_trabajados, old.empleado_id) then
      raise exception 'Nómina autorizada: montos de solo lectura';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger t_bloquear before insert or update or delete on piefirme.prenomina for each row execute function piefirme_app.bloquear_prenomina();
create trigger t_upd before update on piefirme.prenomina for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.prenomina for each row execute function piefirme_app.auditar();

-- totales del periodo
create or replace function piefirme_app.nomina_totales(p_periodo uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  update piefirme.periodos_nomina p set
    empleados = coalesce(t.n, 0), percepciones = coalesce(t.per, 0), deducciones = coalesce(t.ded, 0), neto = coalesce(t.net, 0)
   from (select count(*) n, sum(percepcion_total) per, sum(deduccion_total) ded, sum(neto) net from piefirme.prenomina where periodo_id = p_periodo) t
  where p.id = p_periodo;
end $$;
create or replace function piefirme_app.t_nomina_totales() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin perform piefirme_app.nomina_totales(coalesce(new.periodo_id, old.periodo_id)); return null; end $$;
create trigger t_totales after insert or update or delete on piefirme.prenomina for each row execute function piefirme_app.t_nomina_totales();

-- Calcula la prenómina del periodo (idempotente mientras el periodo no esté autorizado). Clona el cálculo semanal de IRP.
--   salario = empleados.salario_periodo (misma periodicidad), bono, comisión de periodos CERRADOS cuya fecha de cierre cae en el periodo,
--   descuento = incidencias que descuentan (monto capturado, o salario/días del periodo × días traslapados).
--   IMSS/ISR/subsidio quedan en 0 para captura manual (P-104: prenómina y exportación al contador, sin timbrado).
create or replace function piefirme.nomina_calcular_periodo(p_periodo uuid)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare per piefirme.periodos_nomina; e record; v_tz text; v_dias int; v_trab int; v_com numeric; v_ids uuid[]; v_desc numeric; n int := 0;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  select * into per from piefirme.periodos_nomina where id = p_periodo and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'Periodo no encontrado'; end if;
  if per.estado in ('autorizada', 'pagada') then raise exception 'Nómina %: solo lectura', per.estado; end if;
  select zona_horaria into v_tz from piefirme.organizaciones where id = per.organizacion_id;
  v_dias := per.hasta - per.desde + 1;

  for e in select * from piefirme.empleados
            where organizacion_id = per.organizacion_id and estado = 'activo' and periodicidad_pago = per.periodicidad
              and (fecha_ingreso is null or fecha_ingreso <= per.hasta)
  loop
    select count(*) into v_trab from piefirme.asistencia a
     where a.empleado_id = e.id and a.fecha between per.desde and per.hasta and a.estado in ('presente', 'retardo', 'justificada');

    select coalesce(sum(cc.comision_total), 0), coalesce(array_agg(cc.id), '{}')
      into v_com, v_ids
      from piefirme.comisiones_calculadas cc
      join piefirme.periodos_comision pc on pc.id = cc.periodo_id
     where cc.empleado_id = e.id and pc.estado = 'cerrado'
       and (pc.cerrado_en at time zone coalesce(v_tz, 'America/Mexico_City'))::date between per.desde and per.hasta
       and not exists (select 1 from piefirme.prenomina pn where pn.empleado_id = e.id and pn.periodo_id <> per.id and pn.comisiones_ids @> array[cc.id]);

    select coalesce(sum(
             case when i.monto is not null then i.monto
                  else e.salario_periodo / v_dias *
                       (least(i.fecha_fin, per.hasta) - greatest(i.fecha, per.desde) + 1) end), 0)
      into v_desc
      from piefirme.incidencias_rh i
     where i.empleado_id = e.id and i.descuenta and i.estado <> 'anulada'
       and i.fecha <= per.hasta and i.fecha_fin >= per.desde;

    insert into piefirme.prenomina (organizacion_id, periodo_id, empleado_id, sede_id, esquema_contratacion, dias_trabajados,
                                  salario_periodo, comision, comisiones_ids, bono, desc_incidencias)
    values (per.organizacion_id, per.id, e.id, e.sede_id, e.esquema_contratacion, v_trab,
            e.salario_periodo, v_com, v_ids, e.bono_periodo, round(v_desc, 2))
    on conflict (periodo_id, empleado_id) do update set
      sede_id = excluded.sede_id, esquema_contratacion = excluded.esquema_contratacion, dias_trabajados = excluded.dias_trabajados,
      salario_periodo = excluded.salario_periodo, comision = excluded.comision, comisiones_ids = excluded.comisiones_ids,
      bono = excluded.bono, desc_incidencias = excluded.desc_incidencias;
    n := n + 1;
  end loop;
  update piefirme.periodos_nomina set estado = 'calculada' where id = per.id;
  return (select jsonb_build_object('empleados', empleados, 'percepciones', percepciones, 'deducciones', deducciones, 'neto', neto)
            from piefirme.periodos_nomina where id = per.id);
end $$;

create or replace function piefirme.nomina_autorizar_periodo(p_periodo uuid)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  if not exists (select 1 from piefirme.periodos_nomina where id = p_periodo and organizacion_id = piefirme_app.org_id() and estado = 'calculada') then
    raise exception 'Solo se autoriza una nómina calculada';
  end if;
  update piefirme.periodos_nomina set estado = 'autorizada', autorizado_por = auth.uid(), autorizado_en = now() where id = p_periodo;
  -- las incidencias descontadas en el periodo quedan aplicadas
  update piefirme.incidencias_rh i set estado = 'aplicada'
   from piefirme.periodos_nomina p
   where p.id = p_periodo and i.organizacion_id = p.organizacion_id and i.descuenta and i.estado = 'registrada'
     and i.fecha <= p.hasta and i.fecha_fin >= p.desde;
end $$;

create or replace function piefirme.nomina_marcar_pagada(p_periodo uuid)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  update piefirme.periodos_nomina set estado = 'pagada', pagado_en = now()
   where id = p_periodo and organizacion_id = piefirme_app.org_id() and estado = 'autorizada';
  if not found then raise exception 'Solo se marca pagada una nómina autorizada'; end if;
end $$;

-- el empleado firma su propio recibo (security definer: solo toca su renglón y solo el campo de firma)
create or replace function piefirme.nomina_firmar_recibo(p_prenomina uuid)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.org_activa() then raise exception 'Clínica en solo lectura'; end if;
  update piefirme.prenomina set recibo_firmado = true, firmado_en = now()
   where id = p_prenomina and organizacion_id = piefirme_app.org_id() and empleado_id = piefirme_app.empleado_id()
     and exists (select 1 from piefirme.periodos_nomina p where p.id = periodo_id and p.estado in ('autorizada', 'pagada'));
  if not found then raise exception 'Recibo no disponible para firma'; end if;
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.esquemas_comision    enable row level security;
alter table piefirme.periodos_comision    enable row level security;
alter table piefirme.comisiones_calculadas enable row level security;
alter table piefirme.comision_detalle     enable row level security;
alter table piefirme.metas                enable row level security;
alter table piefirme.periodos_nomina      enable row level security;
alter table piefirme.prenomina            enable row level security;

-- Comisiones y productividad: Admin V E; Podólogo V (p). Recepción sin acceso (P-130).
create policy esq_sel on piefirme.esquemas_comision for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id()));
create policy esq_ins on piefirme.esquemas_comision for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy esq_upd on piefirme.esquemas_comision for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
-- sin delete: los esquemas se cierran por vigencia (P-108)

create policy pcom_sel on piefirme.periodos_comision for select to authenticated using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or piefirme_app.rol() = 'podologo'));
create policy pcom_ins on piefirme.periodos_comision for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy pcom_upd on piefirme.periodos_comision for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy pcom_del on piefirme.periodos_comision for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and estado = 'por_cerrar');

create policy ccal_sel on piefirme.comisiones_calculadas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id()));
create policy ccal_ins on piefirme.comisiones_calculadas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy ccal_upd on piefirme.comisiones_calculadas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy ccal_del on piefirme.comisiones_calculadas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy cdet_sel on piefirme.comision_detalle for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id()));
create policy cdet_ins on piefirme.comision_detalle for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy cdet_upd on piefirme.comision_detalle for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy cdet_del on piefirme.comision_detalle for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy met_sel on piefirme.metas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or empleado_id = piefirme_app.empleado_id() or (sede_id is not null and piefirme_app.puede_sede(sede_id) and piefirme_app.rol() = 'podologo')));
create policy met_ins on piefirme.metas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy met_upd on piefirme.metas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy met_del on piefirme.metas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- Nómina: Admin V C E; cada empleado ve su prenómina (V p)
create policy pnom_sel on piefirme.periodos_nomina for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy pnom_ins on piefirme.periodos_nomina for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy pnom_upd on piefirme.periodos_nomina for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy pnom_del on piefirme.periodos_nomina for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and estado = 'creado');

create policy pre_sel on piefirme.prenomina for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or (empleado_id = piefirme_app.empleado_id() and exists (select 1 from piefirme.periodos_nomina p where p.id = periodo_id and p.estado in ('autorizada', 'pagada')))));
create policy pre_ins on piefirme.prenomina for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy pre_upd on piefirme.prenomina for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy pre_del on piefirme.prenomina for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_esquemas_comision with (security_invoker = true) as
select q.id, q.organizacion_id, q.empleado_id, q.nombre, q.tipo, q.pct_servicio, q.pct_producto, q.pct_plan,
       q.viatico_por_cita, q.piso_periodo, q.vigente_desde, q.vigente_hasta, q.activo,
       (q.vigente_hasta is null and q.activo) as vigente,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.esquemas_comision q
  join piefirme.empleados e on e.id = q.empleado_id;

create or replace view piefirme.prp_comisiones with (security_invoker = true) as
select c.id, c.organizacion_id, c.periodo_id, p.desde, p.hasta, c.empleado_id, c.sede_id, c.citas,
       c.ingreso_servicios, c.venta_productos, c.ingreso_planes, c.base_comisionable, c.esquema_id,
       q.nombre as esquema, c.comision_servicios, c.comision_productos, c.comision_planes, c.ajustes, c.viatico,
       c.piso_aplicado, c.comision_total, c.quejas_periodo, c.estado,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.comisiones_calculadas c
  join piefirme.periodos_comision p on p.id = c.periodo_id
  join piefirme.empleados e on e.id = c.empleado_id
  left join piefirme.esquemas_comision q on q.id = c.esquema_id;

create or replace view piefirme.prp_comision_detalle with (security_invoker = true) as
select d.id, d.organizacion_id, d.periodo_id, d.empleado_id, d.sede_id, d.fecha, d.tipo, d.concepto, d.cita_id, d.venta_id,
       d.base, d.pct, d.comision, d.esquema_id, d.referencia_detalle_id
  from piefirme.comision_detalle d;

create or replace view piefirme.prp_nomina_periodos with (security_invoker = true) as
select p.id, p.organizacion_id, p.periodicidad, p.desde, p.hasta, p.fecha_pago, p.estado, p.empleados,
       p.percepciones, p.deducciones, p.neto, p.autorizado_en, p.pagado_en
  from piefirme.periodos_nomina p;

create or replace view piefirme.prp_prenomina with (security_invoker = true) as
select n.id, n.organizacion_id, n.periodo_id, p.desde, p.hasta, p.estado as periodo_estado, n.empleado_id, n.sede_id,
       n.esquema_contratacion, n.dias_trabajados, n.salario_periodo, n.comision, n.bono, n.subsidio,
       n.percepcion_total, n.desc_incidencias, n.imss, n.isr, n.otras_deducciones, n.deduccion_total, n.neto,
       n.cfdi_estado, n.recibo_path, n.recibo_firmado, n.firmado_en,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo, e.puesto, e.banco, e.clabe
  from piefirme.prenomina n
  join piefirme.periodos_nomina p on p.id = n.periodo_id
  join piefirme.empleados e on e.id = n.empleado_id;

create or replace view piefirme.prp_recibos_nomina with (security_invoker = true) as
select n.id, n.organizacion_id, n.periodo_id, p.desde, p.hasta, n.empleado_id, n.neto, n.recibo_path, n.recibo_firmado, n.firmado_en,
       e.numero_empleado, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.prenomina n
  join piefirme.periodos_nomina p on p.id = n.periodo_id
  join piefirme.empleados e on e.id = n.empleado_id
 where p.estado in ('autorizada', 'pagada');

create or replace view piefirme.prp_metas with (security_invoker = true) as
select m.id, m.organizacion_id, m.ambito, m.sede_id, m.empleado_id, m.desde, m.hasta, m.meta_ocupacion, m.meta_ingreso
  from piefirme.metas m;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.esquema_comision_vigente(uuid, date) from public, anon;
revoke all on function piefirme.comisiones_registrar_detalle(uuid, jsonb) from public, anon;
revoke all on function piefirme.comisiones_cerrar_periodo(uuid) from public, anon;
revoke all on function piefirme.comisiones_reabrir_periodo(uuid, text) from public, anon;
revoke all on function piefirme.nomina_calcular_periodo(uuid) from public, anon;
revoke all on function piefirme.nomina_autorizar_periodo(uuid) from public, anon;
revoke all on function piefirme.nomina_marcar_pagada(uuid) from public, anon;
revoke all on function piefirme.nomina_firmar_recibo(uuid) from public, anon;
revoke all on function piefirme.vacaciones_dias_ley(integer, integer) from public, anon;
grant execute on function piefirme.esquema_comision_vigente(uuid, date) to authenticated;
grant execute on function piefirme.comisiones_registrar_detalle(uuid, jsonb) to authenticated;
grant execute on function piefirme.comisiones_cerrar_periodo(uuid) to authenticated;
grant execute on function piefirme.comisiones_reabrir_periodo(uuid, text) to authenticated;
grant execute on function piefirme.nomina_calcular_periodo(uuid) to authenticated;
grant execute on function piefirme.nomina_autorizar_periodo(uuid) to authenticated;
grant execute on function piefirme.nomina_marcar_pagada(uuid) to authenticated;
grant execute on function piefirme.nomina_firmar_recibo(uuid) to authenticated;
grant execute on function piefirme.vacaciones_dias_ley(integer, integer) to authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.cerrar_esquema_anterior(), piefirme_app.bloquear_periodo_comision_cerrado(), piefirme_app.bloquear_prenomina(),
  piefirme_app.nomina_totales(uuid), piefirme_app.t_nomina_totales() from authenticated;
