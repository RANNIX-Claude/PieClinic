-- 038 · A (Clínico) · Esterilización, instrumental y lotes: kits, autoclaves, lotes con indicadores químico/biológico,
-- uso del kit por consulta y trazabilidad inversa (pacientes atendidos con un lote bloqueado).
-- Fuentes: DICCIONARIO E43, E101-E103; MODELO_ESTADOS S31; REGLAS P-023 (liberado condicionado / liberado / bloqueado), P-024, CD-22.
-- Depende de: 001, 010, 031. equipos de mantenimiento (D, 053) se referencian con uuid sin FK.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.autoclaves (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  nombre           text not null,
  numero_serie     text,
  equipo_id        uuid,                                  -- equipo del módulo de mantenimiento (D); sin FK
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (sede_id, nombre)
);
create index on piefirme.autoclaves (organizacion_id, sede_id);

create table piefirme.kits_instrumental (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  codigo           text not null,                         -- K-12 (código/QR)
  nombre           text not null,                         -- Quiropodia; Uña encarnada; Matricectomía
  num_piezas       integer not null default 0 check (num_piezas >= 0),
  contenido        jsonb not null default '[]'::jsonb check (jsonb_typeof(contenido) = 'array'),
  estado           text not null default 'por_esterilizar' check (estado in ('por_esterilizar', 'esterilizado', 'en_uso', 'baja')),
  ultimo_lote_id   uuid,                                  -- FK más abajo
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, codigo)
);
create index on piefirme.kits_instrumental (organizacion_id, sede_id, estado);

create table piefirme.lotes_esterilizacion (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id                uuid not null references piefirme.sedes(id),
  lote                   text,                            -- {SEDE}-EST-{NNNNNN}
  autoclave_id           uuid not null references piefirme.autoclaves(id),
  fecha_hora             timestamptz not null default now(),
  inicio_ciclo           timestamptz,
  fin_ciclo              timestamptz,
  ciclo                  text not null check (ciclo in ('instrumental_envuelto', 'textil_curacion', 'instrumental_sin_envolver', 'otro')),
  temperatura_c          numeric(5, 1) not null check (temperatura_c between 50 and 200),
  presion_bar            numeric(5, 2) not null check (presion_bar >= 0),
  tiempo_min             integer not null check (tiempo_min > 0),
  indicador_quimico      text not null check (indicador_quimico in ('viro', 'no_viro')),
  indicador_biologico    text not null default 'pendiente' check (indicador_biologico in ('pendiente', 'negativo', 'positivo', 'no_aplica')),
  biologico_resultado_en timestamptz,
  responsable_id         uuid not null references piefirme.perfiles(id) default auth.uid(),
  estado                 text not null default 'registrado' check (estado in ('registrado', 'liberado_condicionado', 'liberado', 'bloqueado', 'rechazado')),
  esteril_hasta          date,
  liberado_por           uuid references piefirme.perfiles(id),
  liberado_en            timestamptz,
  motivo_rechazo         text,
  observaciones          text,
  etiquetas_impresas_en  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organizacion_id, lote),
  check (fin_ciclo is null or inicio_ciclo is null or fin_ciclo >= inicio_ciclo),
  check (estado not in ('liberado', 'liberado_condicionado') or (esteril_hasta is not null and liberado_por is not null)),
  check (estado <> 'rechazado' or motivo_rechazo is not null),
  check (estado <> 'liberado' or indicador_biologico in ('negativo', 'no_aplica')),
  check (estado <> 'liberado_condicionado' or (indicador_biologico = 'pendiente' and indicador_quimico = 'viro'))
);
create index on piefirme.lotes_esterilizacion (organizacion_id, sede_id, fecha_hora desc);
create index on piefirme.lotes_esterilizacion (organizacion_id, estado);
alter table piefirme.kits_instrumental add constraint kits_ultimo_lote_fk foreign key (ultimo_lote_id) references piefirme.lotes_esterilizacion(id);

create table piefirme.lote_kits (
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  lote_id          uuid not null references piefirme.lotes_esterilizacion(id) on delete cascade,
  kit_id           uuid not null references piefirme.kits_instrumental(id),
  created_at       timestamptz not null default now(),
  primary key (lote_id, kit_id)
);
create index on piefirme.lote_kits (organizacion_id, kit_id);

create table piefirme.uso_kit_consulta (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  consulta_id        uuid not null references piefirme.consultas(id) on delete cascade,
  kit_id             uuid not null references piefirme.kits_instrumental(id),
  lote_id            uuid not null references piefirme.lotes_esterilizacion(id),
  cabina_id          uuid references piefirme.cabinas(id),
  metodo_seleccion   text not null default 'manual' check (metodo_seleccion in ('qr', 'manual')),
  usado_en           timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index on piefirme.uso_kit_consulta (organizacion_id, consulta_id);
create index on piefirme.uso_kit_consulta (organizacion_id, lote_id);

-- ═════════════════════ reglas ═════════════════════
create or replace function piefirme_app.lote_est_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_manual boolean; v_dias integer;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from piefirme.autoclaves a where a.id = new.autoclave_id and a.organizacion_id = new.organizacion_id and a.sede_id = new.sede_id) then
      raise exception 'El autoclave no pertenece a la sede' using errcode = 'P0001';
    end if;
    new.lote := coalesce(new.lote, piefirme_app.siguiente_folio_clinico(new.sede_id, 'EST'));
    new.estado := 'registrado';
    -- El químico que no viró nunca se libera
    return new;
  end if;
  if new.sede_id <> old.sede_id or new.lote is distinct from old.lote or new.autoclave_id <> old.autoclave_id then
    raise exception 'Sede, folio y autoclave del lote no se cambian' using errcode = 'P0001';
  end if;
  if old.estado in ('rechazado') and new.estado <> old.estado then raise exception 'Un lote rechazado no se reactiva' using errcode = 'P0001'; end if;
  v_manual := new.estado is distinct from old.estado;
  if v_manual and not piefirme_app.es_admin() and auth.uid() is not null then
    raise exception 'Solo Administración libera o rechaza un lote' using errcode = '42501';
  end if;
  if v_manual then
    if new.estado = 'liberado_condicionado' and not (old.estado = 'registrado' and new.indicador_biologico = 'pendiente' and new.indicador_quimico = 'viro') then
      raise exception 'Liberado condicionado: requiere químico virado y biológico pendiente' using errcode = 'P0001';
    elsif new.estado = 'liberado' and not (new.indicador_biologico in ('negativo', 'no_aplica') and new.indicador_quimico = 'viro') then
      raise exception 'Liberado solo con indicador biológico negativo (P-023)' using errcode = 'P0001';
    elsif new.estado = 'rechazado' and new.motivo_rechazo is null then
      raise exception 'Indique el motivo del rechazo' using errcode = 'P0001';
    elsif new.estado = 'registrado' then
      raise exception 'Un lote no regresa a registrado' using errcode = 'P0001';
    end if;
    if new.estado in ('liberado', 'liberado_condicionado') then
      select coalesce((o.parametros ->> 'esterilidad_dias')::int, 30) into v_dias from piefirme.organizaciones o where o.id = new.organizacion_id;
      new.liberado_por := coalesce(auth.uid(), new.liberado_por);
      new.liberado_en := case when auth.uid() is null and new.liberado_en is not null and new.liberado_en is distinct from old.liberado_en then new.liberado_en else now() end;
      new.esteril_hasta := coalesce(new.esteril_hasta, current_date + v_dias);
    end if;
  end if;
  -- Resultado biológico: positivo = Bloqueado (con lista de pacientes); negativo cierra el condicionado
  if new.indicador_biologico is distinct from old.indicador_biologico then
    new.biologico_resultado_en := now();
    if new.indicador_biologico = 'positivo' then
      new.estado := 'bloqueado';
      new.observaciones := coalesce(new.observaciones || E'\n', '') || 'Biológico positivo: lote bloqueado; revisar pacientes atendidos con este instrumental.';
    elsif new.indicador_biologico = 'negativo' and old.estado = 'liberado_condicionado' then
      new.estado := 'liberado';
    end if;
  end if;
  return new;
end $$;
create trigger t_lote_est_bi before insert or update on piefirme.lotes_esterilizacion for each row execute function piefirme_app.lote_est_bi();

-- Efectos en los kits cuando el lote cambia de estado.
create or replace function piefirme_app.lote_est_au() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado in ('liberado', 'liberado_condicionado') and old.estado = 'registrado' then
      update piefirme.kits_instrumental k set estado = 'esterilizado', ultimo_lote_id = new.id
        from piefirme.lote_kits lk where lk.lote_id = new.id and lk.kit_id = k.id and k.estado = 'por_esterilizar';
    elsif new.estado in ('bloqueado', 'rechazado') then
      update piefirme.kits_instrumental k set estado = 'por_esterilizar'
        from piefirme.lote_kits lk where lk.lote_id = new.id and lk.kit_id = k.id and k.ultimo_lote_id = new.id and k.estado = 'esterilizado';
    end if;
    if new.estado = 'bloqueado' then
      insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
      values (new.organizacion_id, auth.uid(), new.sede_id, 'actualizar', 'lotes_esterilizacion', new.id::text,
              jsonb_build_object('incidente', 'biologico_positivo', 'lote', new.lote, 'pacientes_expuestos', (select count(distinct c.paciente_id) from piefirme.uso_kit_consulta u join piefirme.consultas c on c.id = u.consulta_id where u.lote_id = new.id)));
    end if;
  end if;
  return null;
end $$;
create trigger t_lote_est_au after update on piefirme.lotes_esterilizacion for each row execute function piefirme_app.lote_est_au();

create or replace function piefirme_app.lote_kit_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_l record; v_k record;
begin
  select estado, organizacion_id, sede_id into v_l from piefirme.lotes_esterilizacion where id = new.lote_id;
  select estado, organizacion_id, sede_id into v_k from piefirme.kits_instrumental where id = new.kit_id;
  if v_l.organizacion_id is distinct from new.organizacion_id or v_k.organizacion_id is distinct from new.organizacion_id or v_l.sede_id <> v_k.sede_id then
    raise exception 'El kit y el lote deben ser de la misma sede' using errcode = 'P0001';
  end if;
  if v_l.estado <> 'registrado' then raise exception 'Solo se agregan kits a un lote recién registrado' using errcode = 'P0001'; end if;
  if v_k.estado = 'en_uso' or v_k.estado = 'baja' then raise exception 'El kit no está disponible para esterilizar (%)', v_k.estado using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger t_lote_kit_bi before insert on piefirme.lote_kits for each row execute function piefirme_app.lote_kit_bi();

-- Uso de un kit en una consulta: debe estar esterilizado con lote vigente; no se reutiliza sin nuevo ciclo.
create or replace function piefirme_app.uso_kit_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_k record; v_l record;
begin
  select * into v_k from piefirme.kits_instrumental where id = new.kit_id;
  if v_k.organizacion_id is distinct from new.organizacion_id then raise exception 'Kit de otra clínica' using errcode = 'P0001'; end if;
  if v_k.estado <> 'esterilizado' or v_k.ultimo_lote_id is null then
    raise exception 'El kit % no está esterilizado (estado %): requiere un nuevo ciclo (P-023)', v_k.codigo, v_k.estado using errcode = 'P0001';
  end if;
  select * into v_l from piefirme.lotes_esterilizacion where id = v_k.ultimo_lote_id;
  if v_l.estado not in ('liberado', 'liberado_condicionado') or v_l.esteril_hasta < new.usado_en::date then
    raise exception 'El lote % del kit no está liberado o venció su esterilidad', v_l.lote using errcode = 'P0001';
  end if;
  new.lote_id := v_l.id;
  update piefirme.kits_instrumental set estado = 'en_uso' where id = v_k.id;
  return new;
end $$;
create trigger t_uso_kit_bi before insert on piefirme.uso_kit_consulta for each row execute function piefirme_app.uso_kit_bi();
create trigger t_hijo before insert or update or delete on piefirme.uso_kit_consulta for each row execute function piefirme_app.hijo_consulta_bi('bloquear');
-- (el trigger t_uso_kit_bi corre antes que t_hijo por orden alfabético de nombre: t_hijo < t_uso… → t_hijo primero; ambos son BEFORE y independientes)

-- Al cerrar la consulta los kits usados quedan «por esterilizar».
create or replace function piefirme_app.consulta_kits_au() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.estado = 'cerrada' and old.estado <> 'cerrada' then
    update piefirme.kits_instrumental k set estado = 'por_esterilizar'
     where k.estado = 'en_uso' and k.id in (select u.kit_id from piefirme.uso_kit_consulta u where u.consulta_id = new.id);
  end if;
  return null;
end $$;
create trigger t_consulta_kits_au after update on piefirme.consultas for each row execute function piefirme_app.consulta_kits_au();

-- Trazabilidad inversa: pacientes atendidos con instrumental de un lote.
create or replace function piefirme.pacientes_por_lote(p_lote uuid)
returns table (paciente_id uuid, numero_expediente text, consulta_id uuid, folio_consulta text, fecha_hora timestamptz, kit_codigo text)
language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select c.paciente_id, p.numero_expediente, c.id, c.folio, c.fecha_hora, k.codigo
    from piefirme.uso_kit_consulta u
    join piefirme.consultas c on c.id = u.consulta_id
    join piefirme.pacientes p on p.id = c.paciente_id
    join piefirme.kits_instrumental k on k.id = u.kit_id
   where u.lote_id = p_lote and u.organizacion_id = piefirme_app.org_id()
   order by c.fecha_hora
$$;

-- ═════════════════════ RLS ═════════════════════
select piefirme_app.a_politicas('autoclaves', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador'], true);
select piefirme_app.a_politicas('kits_instrumental', array['administrador', 'podologo', 'recepcion'], array['administrador'], array['administrador'], true);
select piefirme_app.a_politicas('lotes_esterilizacion', array['administrador', 'podologo', 'recepcion'], array['administrador', 'recepcion'], array[]::text[], true);
select piefirme_app.a_politicas('lote_kits', array['administrador', 'podologo', 'recepcion'], array['administrador', 'recepcion']);
select piefirme_app.a_politicas('uso_kit_consulta', array['administrador', 'podologo'], array['podologo']);

select piefirme_app.a_triggers('autoclaves', false);
select piefirme_app.a_triggers('kits_instrumental');
select piefirme_app.a_triggers('lotes_esterilizacion');
select piefirme_app.a_triggers('lote_kits', false);
select piefirme_app.a_triggers('uso_kit_consulta');

-- ═════════════════════ vistas ═════════════════════
create view piefirme.prp_esterilizacion_lotes with (security_invoker = true) as
select l.id as lote_id, l.organizacion_id, l.sede_id, l.lote, l.fecha_hora, l.autoclave_id, a.nombre as autoclave, l.ciclo, l.temperatura_c, l.presion_bar, l.tiempo_min,
       l.indicador_quimico, l.indicador_biologico, l.estado, l.esteril_hasta, l.responsable_id,
       (select count(*) from piefirme.lote_kits lk where lk.lote_id = l.id) as kits,
       (l.indicador_biologico = 'pendiente' and l.fecha_hora < now() - interval '24 hours') as biologico_vencido_sin_resultado,
       (l.esteril_hasta is not null and l.esteril_hasta < current_date) as esterilidad_vencida,
       (select count(distinct c.paciente_id) from piefirme.uso_kit_consulta u join piefirme.consultas c on c.id = u.consulta_id where u.lote_id = l.id) as pacientes_atendidos
  from piefirme.lotes_esterilizacion l join piefirme.autoclaves a on a.id = l.autoclave_id;

create view piefirme.prp_kits_resumen with (security_invoker = true) as
select k.organizacion_id, k.sede_id, count(*) filter (where k.activo and k.estado <> 'baja') as en_circulacion,
       count(*) filter (where k.estado = 'por_esterilizar' and k.activo) as por_esterilizar,
       count(*) filter (where k.estado = 'esterilizado') as esterilizados,
       count(*) filter (where k.estado = 'en_uso') as en_uso
  from piefirme.kits_instrumental k group by k.organizacion_id, k.sede_id;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on function piefirme.pacientes_por_lote(uuid) from public, anon;
grant execute on function piefirme.pacientes_por_lote(uuid) to authenticated;
revoke all on all tables in schema piefirme from anon;
