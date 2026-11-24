-- 053 · EQUIPO Y PLATAFORMA (D) · Equipos/instrumental (activos), órdenes de trabajo de mantenimiento, evidencias e historial.
-- Clona de IRP: mantenimiento_solicitudes + mantenimiento_historial + trigger de flujo (trg_mantenimiento_flujo),
--   ordenes_trabajo / ot_evidencias (fotos en bucket privado), catálogo de categorías, Mantenimiento.jsx / ExpedienteMantenimiento.jsx.
-- Depende de: 001, 050 (helpers) y por contrato: proveedores(id) [C]. Las categorías viven en catalogos_clinica (057) como texto aquí.
-- Reglas: P-112 (estados Solicitado→Autorizado→En proceso→Cerrado | Rechazado; autoriza Administración; urgentes hasta
--   organizaciones.parametros.mantenimiento_urgente_max [2,000.00 MXN] pueden atenderse antes de aprobar y se regularizan),
--   CA-19 (equipo vencido = proximo_servicio anterior a hoy; costo del mes = suma de OT cerradas del mes; cada equipo en una sola sede).
-- Entidades: E134 Equipo/instrumental, E135 Orden de trabajo.

-- ───────────────────────────── contadores de folio (interno) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.contadores_equipo (
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null,
  ultimo           bigint not null default 0,
  primary key (organizacion_id, clave)
);
alter table piefirme.contadores_equipo enable row level security;
-- sin políticas: solo se toca desde piefirme_app.siguiente_folio_d() (security definer)

create or replace function piefirme_app.siguiente_folio_d(p_org uuid, p_clave text) returns bigint
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v bigint;
begin
  insert into piefirme.contadores_equipo (organizacion_id, clave, ultimo) values (p_org, p_clave, 1)
  on conflict (organizacion_id, clave) do update set ultimo = piefirme.contadores_equipo.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

-- ───────────────────────────── equipos (E134) ─────────────────────────────
create table piefirme.equipos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id            uuid not null references piefirme.sedes(id),
  cabina_id          uuid references piefirme.cabinas(id) on delete set null,
  nombre             text not null,
  categoria          text,                                   -- catálogo categoria_ot (Esterilización, Equipo láser, Instalaciones…)
  marca              text,
  modelo             text,
  serie              text,
  fecha_compra       date,
  ultimo_servicio    date,
  proximo_servicio   date,
  periodicidad_dias  integer check (periodicidad_dias is null or periodicidad_dias > 0),
  estado             text not null default 'vigente' check (estado in ('vigente', 'falla', 'en_proceso', 'baja')),   -- "vencido" se deriva (prp_equipos)
  notas              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on piefirme.equipos (organizacion_id, sede_id);
create trigger t_upd before update on piefirme.equipos for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.equipos for each row execute function piefirme_app.auditar();

-- ───────────────────────────── órdenes de trabajo (E135) ─────────────────────────────
create table piefirme.ordenes_trabajo (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                  uuid not null references piefirme.sedes(id),
  folio                    text not null,
  fecha                    date not null default current_date,
  categoria                text not null,
  tipo                     text not null default 'normal' check (tipo in ('urgente', 'preventivo', 'normal')),
  equipo_id                uuid references piefirme.equipos(id) on delete set null,
  descripcion              text not null,
  estatus                  text not null default 'solicitado' check (estatus in ('solicitado', 'autorizado', 'en_proceso', 'cerrado', 'rechazado')),
  solicitante_id           uuid default auth.uid(),
  autorizado_por           uuid,
  fecha_autorizacion       timestamptz,
  autorizacion_pendiente   boolean not null default false,    -- urgente atendida antes de aprobar: falta regularizar (P-112)
  motivo_rechazo           text,
  asignado_proveedor_id    uuid references piefirme.proveedores(id) on delete set null,
  asignado_interno         boolean not null default false,    -- "Mantenimiento interno"
  asignado_texto           text,
  programada_para          date,
  costo_estimado           numeric(14,2) check (costo_estimado >= 0),
  costo_real               numeric(14,2) check (costo_real >= 0),
  fecha_inicio             date,
  fecha_cierre             date,
  resultado                text,
  proximo_servicio_equipo  date,                              -- al cerrar, próxima fecha de servicio del equipo
  nota_cambio              text,                              -- comentario del último cambio (pasa al historial)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organizacion_id, folio)
);
create index on piefirme.ordenes_trabajo (organizacion_id, sede_id, estatus);
create index on piefirme.ordenes_trabajo (equipo_id);
create index on piefirme.ordenes_trabajo (organizacion_id, fecha_cierre);

create table piefirme.ot_historial (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  orden_id         uuid not null references piefirme.ordenes_trabajo(id) on delete cascade,
  fecha            timestamptz not null default now(),
  usuario_id       uuid,
  estatus_anterior text,
  estatus_nuevo    text not null,
  nota             text
);
create index on piefirme.ot_historial (organizacion_id, orden_id, fecha);

-- evidencias: fotos de la solicitud y del resultado (bucket privado "pf-documentos": <org>/mantenimiento/<orden_id>/<archivo>)
create table piefirme.ot_evidencias (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  orden_id         uuid not null references piefirme.ordenes_trabajo(id) on delete cascade,
  momento          text not null default 'solicitud' check (momento in ('solicitud', 'resultado')),
  nombre           text not null,
  storage_path     text not null,
  mime             text check (mime is null or mime in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  tamano_kb        integer check (tamano_kb is null or tamano_kb <= 10240),     -- 10 MB, límite que anuncia IRP
  subido_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = organizacion_id::text)
);
create index on piefirme.ot_evidencias (organizacion_id, orden_id);

create table piefirme.mantenimiento_presupuestos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  mes              date not null check (mes = date_trunc('month', mes)::date),
  monto            numeric(14,2) not null check (monto >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (sede_id, mes)
);
create trigger t_upd before update on piefirme.mantenimiento_presupuestos for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── flujo de la OT ─────────────────────────────
create or replace function piefirme_app.ot_flujo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_max numeric; v_ok boolean := false;
  v_admin boolean := piefirme_app.es_admin() or auth.uid() is null;   -- auth.uid() nulo = service_role / semillas (confiables); las transiciones se validan igual
begin
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'Sede de otra clínica';
  end if;
  if new.equipo_id is not null and not exists (select 1 from piefirme.equipos q where q.id = new.equipo_id and q.organizacion_id = new.organizacion_id and q.sede_id = new.sede_id) then
    raise exception 'El equipo no pertenece a esa sede';
  end if;

  if tg_op = 'INSERT' then
    new.estatus := 'solicitado';
    new.autorizado_por := null; new.fecha_autorizacion := null; new.autorizacion_pendiente := false;
    new.solicitante_id := coalesce(new.solicitante_id, auth.uid());
    new.folio := coalesce(nullif(new.folio, ''), 'OT-' || lpad(piefirme_app.siguiente_folio_d(new.organizacion_id, 'ot')::text, 4, '0'));
    return new;
  end if;

  new.folio := old.folio; new.organizacion_id := old.organizacion_id; new.sede_id := old.sede_id;
  if new.estatus is distinct from old.estatus then
    if old.estatus in ('cerrado', 'rechazado') then raise exception 'La OT % está % y no admite cambios de estatus', old.folio, old.estatus; end if;
    select coalesce((parametros ->> 'mantenimiento_urgente_max')::numeric, 2000) into v_max from piefirme.organizaciones where id = new.organizacion_id;

    if old.estatus = 'solicitado' and new.estatus = 'autorizado' then
      v_ok := v_admin; new.autorizado_por := auth.uid(); new.fecha_autorizacion := now(); new.autorizacion_pendiente := false;
    elsif old.estatus = 'solicitado' and new.estatus = 'rechazado' then
      v_ok := v_admin;
      if coalesce(trim(new.motivo_rechazo), '') = '' then raise exception 'El rechazo exige motivo'; end if;
    elsif old.estatus = 'solicitado' and new.estatus = 'en_proceso' then
      -- atajo de urgentes (P-112): hasta el tope, antes de aprobar; se regulariza después
      v_ok := v_admin and new.tipo = 'urgente' and coalesce(new.costo_estimado, 0) <= v_max;
      if not v_ok then raise exception 'Solo una OT urgente de hasta % MXN puede iniciar antes de autorizarse', v_max; end if;
      new.autorizacion_pendiente := true; new.fecha_inicio := coalesce(new.fecha_inicio, current_date);
    elsif old.estatus = 'autorizado' and new.estatus = 'en_proceso' then
      v_ok := v_admin; new.fecha_inicio := coalesce(new.fecha_inicio, current_date);
    elsif old.estatus in ('autorizado', 'en_proceso') and new.estatus = 'cerrado' then
      v_ok := v_admin;
      if old.autorizacion_pendiente or new.autorizacion_pendiente then raise exception 'Regularice la autorización de la OT urgente antes de cerrarla'; end if;
      if new.costo_real is null then raise exception 'Cerrar la OT exige el costo real'; end if;
      new.fecha_cierre := coalesce(new.fecha_cierre, current_date);
      new.fecha_inicio := coalesce(new.fecha_inicio, old.fecha_inicio, new.fecha_cierre);
    end if;
    if not v_ok then raise exception 'Transición % → % no permitida (o sin permiso)', old.estatus, new.estatus; end if;
  elsif not v_admin then
    raise exception 'Solo Administración modifica una OT';
  end if;
  return new;
end $$;
create trigger t_flujo before insert or update on piefirme.ordenes_trabajo for each row execute function piefirme_app.ot_flujo();
create trigger t_upd before update on piefirme.ordenes_trabajo for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.ordenes_trabajo for each row execute function piefirme_app.auditar();

-- historial + efecto sobre el equipo (security definer: el solicitante no puede editar equipos)
create or replace function piefirme_app.ot_efectos() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.estatus is distinct from old.estatus then
    insert into piefirme.ot_historial (organizacion_id, orden_id, usuario_id, estatus_anterior, estatus_nuevo, nota)
    values (new.organizacion_id, new.id, auth.uid(), case when tg_op = 'UPDATE' then old.estatus end, new.estatus, new.nota_cambio);
  end if;
  if new.equipo_id is not null then
    if new.estatus = 'solicitado' and new.tipo = 'urgente' then
      update piefirme.equipos set estado = 'falla' where id = new.equipo_id and estado = 'vigente';
    elsif new.estatus = 'en_proceso' then
      update piefirme.equipos set estado = 'en_proceso' where id = new.equipo_id;
    elsif new.estatus = 'cerrado' then
      update piefirme.equipos set estado = 'vigente', ultimo_servicio = new.fecha_cierre,
             proximo_servicio = coalesce(new.proximo_servicio_equipo,
                                         case when periodicidad_dias is not null then new.fecha_cierre + periodicidad_dias else proximo_servicio end)
       where id = new.equipo_id;
    elsif new.estatus = 'rechazado' then
      update piefirme.equipos set estado = 'vigente'
       where id = new.equipo_id and estado = 'falla'
         and not exists (select 1 from piefirme.ordenes_trabajo o where o.equipo_id = new.equipo_id and o.id <> new.id and o.estatus in ('solicitado', 'autorizado', 'en_proceso') and o.tipo = 'urgente');
    end if;
  end if;
  return null;
end $$;
create trigger t_efectos after insert or update on piefirme.ordenes_trabajo for each row execute function piefirme_app.ot_efectos();

-- regulariza la autorización de una urgente atendida antes de aprobar (P-112)
create or replace function piefirme.ot_regularizar(p_orden uuid)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  update piefirme.ordenes_trabajo set autorizacion_pendiente = false, autorizado_por = auth.uid(), fecha_autorizacion = now(), nota_cambio = 'Autorización regularizada'
   where id = p_orden and organizacion_id = piefirme_app.org_id() and autorizacion_pendiente;
  if not found then raise exception 'La OT no tiene autorización pendiente'; end if;
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.equipos                    enable row level security;
alter table piefirme.ordenes_trabajo            enable row level security;
alter table piefirme.ot_historial               enable row level security;
alter table piefirme.ot_evidencias              enable row level security;
alter table piefirme.mantenimiento_presupuestos enable row level security;

create policy eqp_sel on piefirme.equipos for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sede_id));
create policy eqp_ins on piefirme.equipos for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy eqp_upd on piefirme.equipos for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
create policy eqp_del on piefirme.equipos for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));

-- Mantenimiento: cualquier usuario de la sede solicita y consulta; Administración autoriza, cierra y edita
create policy ot_sel on piefirme.ordenes_trabajo for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sede_id));
create policy ot_ins on piefirme.ordenes_trabajo for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id) and estatus = 'solicitado');
create policy ot_upd on piefirme.ordenes_trabajo for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.puede_sede(sede_id)) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and piefirme_app.puede_sede(sede_id));
-- sin delete: una OT se rechaza o se cierra, no se borra

create policy oth_sel on piefirme.ot_historial for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and exists (select 1 from piefirme.ordenes_trabajo o where o.id = orden_id and piefirme_app.puede_sede(o.sede_id)));
-- el historial lo escribe el trigger (security definer); nadie lo inserta/edita a mano

create policy ote_sel on piefirme.ot_evidencias for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and exists (select 1 from piefirme.ordenes_trabajo o where o.id = orden_id and piefirme_app.puede_sede(o.sede_id)));
create policy ote_ins on piefirme.ot_evidencias for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and exists (select 1 from piefirme.ordenes_trabajo o where o.id = orden_id and piefirme_app.puede_sede(o.sede_id)));
create policy ote_del on piefirme.ot_evidencias for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy mpr_sel on piefirme.mantenimiento_presupuestos for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy mpr_ins on piefirme.mantenimiento_presupuestos for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy mpr_upd on piefirme.mantenimiento_presupuestos for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy mpr_del on piefirme.mantenimiento_presupuestos for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- ───────────────────────────── vistas prp_* ─────────────────────────────
-- Equipo vencido = próximo servicio anterior a hoy (CA-19)
create or replace view piefirme.prp_equipos with (security_invoker = true) as
select q.id, q.organizacion_id, q.sede_id, s.nombre as sede_nombre, q.cabina_id, q.nombre, q.categoria, q.marca, q.modelo, q.serie,
       q.fecha_compra, q.ultimo_servicio, q.proximo_servicio, q.periodicidad_dias, q.estado as estado_base,
       case when q.estado = 'vigente' and q.proximo_servicio is not null and q.proximo_servicio < current_date then 'vencido' else q.estado end as estado,
       case when q.proximo_servicio is null then null else q.proximo_servicio - current_date end as dias_para_servicio,
       q.notas
  from piefirme.equipos q
  join piefirme.sedes s on s.id = q.sede_id;

create or replace view piefirme.prp_ordenes_trabajo with (security_invoker = true) as
select o.id, o.organizacion_id, o.sede_id, s.nombre as sede_nombre, o.folio, o.fecha, o.categoria, o.tipo, o.equipo_id, q.nombre as equipo_nombre,
       o.descripcion, o.estatus, o.solicitante_id, o.autorizado_por, o.fecha_autorizacion, o.autorizacion_pendiente, o.motivo_rechazo,
       o.asignado_proveedor_id, o.asignado_interno, o.asignado_texto, o.programada_para, o.costo_estimado, o.costo_real,
       o.fecha_inicio, o.fecha_cierre, o.resultado,
       case when o.estatus in ('cerrado', 'rechazado') then null else current_date - o.fecha end as dias_abierta,
       (select count(*) from piefirme.ot_evidencias e where e.orden_id = o.id) as evidencias
  from piefirme.ordenes_trabajo o
  join piefirme.sedes s on s.id = o.sede_id
  left join piefirme.equipos q on q.id = o.equipo_id;

create or replace view piefirme.prp_ot_historial with (security_invoker = true) as
select h.id, h.organizacion_id, h.orden_id, h.fecha, h.usuario_id, h.estatus_anterior, h.estatus_nuevo, h.nota
  from piefirme.ot_historial h;

create or replace view piefirme.prp_ot_evidencias with (security_invoker = true) as
select e.id, e.organizacion_id, e.orden_id, e.momento, e.nombre, e.storage_path, e.mime, e.tamano_kb, e.created_at
  from piefirme.ot_evidencias e;

-- costo del mes = suma de OT cerradas del mes vs presupuesto (CA-19)
create or replace view piefirme.prp_mantenimiento_mes with (security_invoker = true) as
select o.organizacion_id, o.sede_id, date_trunc('month', o.fecha_cierre)::date as mes,
       count(*) as ordenes_cerradas, coalesce(sum(o.costo_real), 0) as costo_real
  from piefirme.ordenes_trabajo o
 where o.estatus = 'cerrado' and o.fecha_cierre is not null
 group by 1, 2, 3;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.ot_regularizar(uuid) from public, anon;
grant execute on function piefirme.ot_regularizar(uuid) to authenticated;
revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.siguiente_folio_d(uuid, text), piefirme_app.ot_flujo(), piefirme_app.ot_efectos() from authenticated;
