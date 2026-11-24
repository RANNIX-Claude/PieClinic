-- 036 · A (Clínico) · Biomecánica y plantillas ortopédicas: laboratorios, estudio de pisada, orden de plantilla (borrador → enviada → recibida → entregada),
-- garantía, revisión de ajuste y renovación.
-- Fuentes: DICCIONARIO E51-E53; MODELO_ESTADOS S10; REGLAS P-013, P-075, P-087, CD-08.
-- Depende de: 001, 010, 031, 033, ventas (B). proveedores (C, 04x) y equipos (D, 05x) se referencian con uuid sin FK.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.laboratorios_ortopedicos (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  nombre                text not null,
  proveedor_id          uuid,                                   -- proveedor del catálogo de compras (C); sin FK por numeración
  contacto              text,
  telefono              text,
  email                 text,
  dias_entrega_habiles  integer not null default 15 check (dias_entrega_habiles > 0),
  activo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organizacion_id, nombre)
);

create table piefirme.estudios_pisada (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  paciente_id           uuid not null references piefirme.pacientes(id),
  consulta_id           uuid references piefirme.consultas(id),
  sede_id               uuid not null references piefirme.sedes(id),
  tipo_estudio          text not null check (tipo_estudio in ('baropodometria', 'huella_plantar', 'observacion_clinica', 'otro')),
  fecha                 date not null default current_date,
  realizado_por         uuid not null references piefirme.perfiles(id),
  equipo_id             uuid,                                   -- equipo/instrumental (D); sin FK
  equipo_texto          text,
  imagen_izq_path       text,                                   -- 'pf-expedientes' (JPG/PDF del equipo)
  imagen_der_path       text,
  tipo_arco             text check (tipo_arco in ('plano', 'normal', 'cavo')),
  retropie              text check (retropie in ('valgo', 'neutro', 'varo')),
  talla_calzado         numeric(4, 1),
  longitud_izq_mm       integer check (longitud_izq_mm between 100 and 400),
  longitud_der_mm       integer check (longitud_der_mm between 100 and 400),
  ancho_metatarsal_izq_mm integer check (ancho_metatarsal_izq_mm > 0),
  ancho_metatarsal_der_mm integer check (ancho_metatarsal_der_mm > 0),
  altura_arco_izq_mm    integer check (altura_arco_izq_mm >= 0),
  altura_arco_der_mm    integer check (altura_arco_der_mm >= 0),
  angulo_retropie_izq   numeric(4, 1),
  angulo_retropie_der   numeric(4, 1),
  dismetria_mm          numeric(4, 1) check (dismetria_mm >= 0),
  dismetria_lado        text check (dismetria_lado in ('D', 'I')),
  patron_marcha         text,
  desgaste_calzado      text,
  cie10_codigo          text references piefirme.cie10_catalogo(codigo),
  actividad             text,
  calzado_habitual      text,
  peso_kg               numeric(5, 1),
  costo                 numeric(14, 2) check (costo >= 0),      -- se cobra por venta (B); acreditable al comprar plantillas dentro de 30 días (P-075)
  venta_id              uuid references piefirme.ventas(id),
  acreditable_hasta     date,
  estado                text not null default 'borrador' check (estado in ('borrador', 'firmado')),
  firma_id              uuid references piefirme.firmas(id),
  firmado_en            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (estado <> 'firmado' or (firma_id is not null and tipo_arco is not null and retropie is not null and talla_calzado is not null
                                 and longitud_izq_mm is not null and longitud_der_mm is not null and cie10_codigo is not null)),
  check (dismetria_mm is null or dismetria_mm = 0 or dismetria_lado is not null)
);
create index on piefirme.estudios_pisada (organizacion_id, paciente_id, fecha desc);

create table piefirme.ordenes_plantilla (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null references piefirme.organizaciones(id) on delete cascade,
  folio                    text,                                -- {SEDE}-ORT-{NNNNNN}
  paciente_id              uuid not null references piefirme.pacientes(id),
  estudio_id               uuid references piefirme.estudios_pisada(id),
  sede_id                  uuid not null references piefirme.sedes(id),
  podologo_id              uuid not null references piefirme.perfiles(id),
  modelo                   text,
  material                 text,
  cuna_realce              text,
  cobertura                text check (cobertura in ('completa', 'tres_cuartos', 'antepie', 'otra')),
  pares                    integer not null default 1 check (pares between 1 and 6),
  laboratorio_id           uuid references piefirme.laboratorios_ortopedicos(id),
  indicaciones_laboratorio text,
  precio                   numeric(14, 2) not null default 0 check (precio >= 0),
  anticipo_monto           numeric(14, 2) not null default 0 check (anticipo_monto >= 0),
  anticipo_forma           text check (anticipo_forma in ('efectivo', 'tarjeta', 'transferencia', 'clip')),
  venta_id                 uuid references piefirme.ventas(id),
  paquete_origen_id        uuid,                                -- paquete comercial (B)
  estado                   text not null default 'borrador' check (estado in ('borrador', 'enviada', 'recibida', 'entregada', 'cancelada')),
  fecha_envio              date,
  dias_entrega_habiles     integer check (dias_entrega_habiles > 0),
  entrega_estimada         date,
  fecha_recepcion          date,
  costo_laboratorio        numeric(14, 2) check (costo_laboratorio >= 0),   -- P-087: costo al recibir; sin inventario
  avisar_whatsapp          boolean not null default true,
  fecha_entrega            date,
  entregado_por            uuid references piefirme.perfiles(id),
  ajuste_realizado         boolean not null default false,
  conformidad_firma_id     uuid references piefirme.firmas(id),
  garantia_meses           integer not null default 6 check (garantia_meses between 0 and 60),
  garantia_hasta           date,
  revision_ajuste_fecha    date,                                -- 30 días tras la entrega
  revision_ajuste_hecha    boolean not null default false,
  renovacion_desde         date,                                -- 12 meses
  renovacion_hasta         date,                                -- 18 meses
  motivo_cancelacion       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organizacion_id, folio),
  check (estado <> 'cancelada' or motivo_cancelacion is not null)
);
create index on piefirme.ordenes_plantilla (organizacion_id, paciente_id);
create index on piefirme.ordenes_plantilla (organizacion_id, sede_id, estado);

-- ═════════════════════ reglas ═════════════════════
create or replace function piefirme_app.sumar_dias_habiles(p_sede uuid, p_desde date, p_n integer) returns date
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare d date := p_desde; c integer := 0; guard integer := 0;
begin
  while c < p_n and guard < 400 loop
    d := d + 1; guard := guard + 1;
    if extract(isodow from d) < 6 and piefirme_app.dia_habil(p_sede, d) = d then c := c + 1; end if;
  end loop;
  return d;
end $$;

create or replace function piefirme_app.estudio_pisada_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dias integer;
begin
  if not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'Paciente de otra clínica' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.estado = 'firmado' then raise exception 'El estudio firmado no se modifica' using errcode = 'P0001'; end if;
  if new.estado = 'firmado' then
    select coalesce((o.parametros ->> 'dias_acreditable_estudio')::int, 30) into v_dias from piefirme.organizaciones o where o.id = new.organizacion_id;
    new.firmado_en := case when auth.uid() is null and new.firmado_en is not null then new.firmado_en else now() end;
    new.acreditable_hasta := new.fecha + v_dias;
  end if;
  return new;
end $$;
create trigger t_estudio_bi before insert or update on piefirme.estudios_pisada for each row execute function piefirme_app.estudio_pisada_bi();

create or replace function piefirme_app.orden_plantilla_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pct numeric; v_lab record; v_garantia integer;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from piefirme.pacientes p where p.id = new.paciente_id and p.organizacion_id = new.organizacion_id) then
      raise exception 'Paciente de otra clínica' using errcode = 'P0001';
    end if;
    new.folio := coalesce(new.folio, piefirme_app.siguiente_folio_clinico(new.sede_id, 'ORT'));
    new.estado := 'borrador';
    select coalesce((o.parametros ->> 'plantillas_garantia_meses')::int, 6) into v_garantia from piefirme.organizaciones o where o.id = new.organizacion_id;
    new.garantia_meses := coalesce(nullif(new.garantia_meses, 6), v_garantia, 6);
    return new;
  end if;

  if new.paciente_id <> old.paciente_id or new.folio is distinct from old.folio or new.organizacion_id <> old.organizacion_id then
    raise exception 'Paciente y folio de la orden no se cambian' using errcode = 'P0001';
  end if;
  if old.estado in ('entregada', 'cancelada') and new.estado <> old.estado then
    raise exception 'La orden % ya no cambia de estado', old.estado using errcode = 'P0001';
  end if;
  -- Recepción solo registra recepción/entrega, no cambia la especificación (MATRIZ_ROLES)
  if piefirme_app.rol()::text = 'recepcion' and auth.uid() is not null
     and (new.modelo is distinct from old.modelo or new.material is distinct from old.material or new.cuna_realce is distinct from old.cuna_realce
          or new.cobertura is distinct from old.cobertura or new.pares <> old.pares or new.laboratorio_id is distinct from old.laboratorio_id
          or new.precio <> old.precio or new.indicaciones_laboratorio is distinct from old.indicaciones_laboratorio or new.podologo_id <> old.podologo_id) then
    raise exception 'Recepción no modifica la especificación de la orden' using errcode = 'P0001';
  end if;
  if new.estado = old.estado then return new; end if;

  if old.estado = 'borrador' and new.estado = 'enviada' then
    if new.laboratorio_id is null or new.modelo is null or new.material is null or new.cobertura is null then
      raise exception 'Complete laboratorio, modelo, material y cobertura antes de enviar' using errcode = 'P0001';
    end if;
    select coalesce((o.parametros ->> 'plantillas_anticipo_pct')::numeric, 50) into v_pct from piefirme.organizaciones o where o.id = new.organizacion_id;
    if new.anticipo_monto < round(new.precio * v_pct / 100, 2) then
      raise exception 'El anticipo (%) es menor al % %% del precio (P-075)', new.anticipo_monto, v_pct using errcode = 'P0001';
    end if;
    select * into v_lab from piefirme.laboratorios_ortopedicos where id = new.laboratorio_id;
    new.fecha_envio := coalesce(new.fecha_envio, current_date);
    new.dias_entrega_habiles := coalesce(new.dias_entrega_habiles, v_lab.dias_entrega_habiles, 15);
    new.entrega_estimada := piefirme_app.sumar_dias_habiles(new.sede_id, new.fecha_envio, new.dias_entrega_habiles);
  elsif old.estado = 'enviada' and new.estado = 'recibida' then
    new.fecha_recepcion := coalesce(new.fecha_recepcion, current_date);
  elsif old.estado = 'recibida' and new.estado = 'entregada' then
    if new.conformidad_firma_id is null or new.entregado_por is null then
      raise exception 'La entrega requiere quién entrega y la firma de conformidad del paciente' using errcode = 'P0001';
    end if;
    new.fecha_entrega := coalesce(new.fecha_entrega, current_date);
    new.garantia_hasta := (new.fecha_entrega + make_interval(months => new.garantia_meses))::date;
    new.revision_ajuste_fecha := new.fecha_entrega + 30;
    new.renovacion_desde := (new.fecha_entrega + interval '12 months')::date;
    new.renovacion_hasta := (new.fecha_entrega + interval '18 months')::date;
  elsif new.estado = 'cancelada' and old.estado in ('borrador', 'enviada', 'recibida') then
    null;
  else
    raise exception 'Transición no válida: % → %', old.estado, new.estado using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_orden_plantilla_bi before insert or update on piefirme.ordenes_plantilla for each row execute function piefirme_app.orden_plantilla_bi();

-- ═════════════════════ RLS ═════════════════════
select piefirme_app.a_politicas('laboratorios_ortopedicos', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador']);
select piefirme_app.a_politicas('estudios_pisada', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo'], array[]::text[], true);
select piefirme_app.a_politicas('ordenes_plantilla', array['administrador', 'podologo', 'recepcion'], array['administrador', 'podologo', 'recepcion'], array[]::text[], true);

select piefirme_app.a_triggers('laboratorios_ortopedicos', false);
select piefirme_app.a_triggers('estudios_pisada');
select piefirme_app.a_triggers('ordenes_plantilla');

-- Seguimiento de garantía, revisión de ajuste (30 días) y renovación (12-18 meses): alimenta el CRM
create view piefirme.prp_plantillas_seguimiento with (security_invoker = true) as
select o.id as orden_id, o.organizacion_id, o.folio, o.paciente_id, o.sede_id, o.estado, o.pares, o.precio, o.fecha_envio, o.entrega_estimada,
       o.fecha_entrega, o.garantia_hasta, o.revision_ajuste_fecha, o.renovacion_desde, o.renovacion_hasta,
       (o.estado = 'enviada' and o.entrega_estimada < current_date) as retrasada_laboratorio,
       (o.estado = 'entregada' and o.garantia_hasta >= current_date) as garantia_vigente,
       (o.estado = 'entregada' and not o.revision_ajuste_hecha and o.revision_ajuste_fecha <= current_date) as revision_ajuste_pendiente,
       (o.estado = 'entregada' and o.renovacion_desde <= current_date) as renovacion_disponible
  from piefirme.ordenes_plantilla o;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on all tables in schema piefirme from anon;
