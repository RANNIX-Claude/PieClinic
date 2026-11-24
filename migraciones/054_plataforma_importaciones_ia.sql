-- 054 · EQUIPO Y PLATAFORMA (D) · Importaciones con IA: lote, archivo, mapeo propuesto, filas, errores, duplicados y confirmación.
-- Depende de: 001, 051 (checadas.importacion_id), y por contrato: pacientes(id) [A].
-- Reglas: P-122 (la IA propone el mapeo, un ADMINISTRADOR revisa y confirma; vista previa con errores y duplicados; nada se guarda sin
--   confirmar; cada carga es un lote reversible si no se ha modificado después), P-123 (duplicados según P-006; campos clínicos con confianza
--   < umbral [80 %] SIEMPRE a revisión humana, marcados "importado" con su origen; en conflicto gana el dato existente),
--   P-124 (la IA es un ADAPTADOR sin llave: el servidor guarda la propuesta JSON; modo "no_configurado"/"sintetico" hasta tener llave),
--   CA-08 (importación: solo Administrador), N-07 (migración del expediente en papel entra por aquí).
-- La carga efectiva a las tablas de otros dominios la ejecuta una función servidor DESPUÉS de piefirme.importacion_confirmar();
--   esa función registra cada registro creado en importacion_filas.registro_tabla/registro_id (base de la reversa).
-- Entidades: E138 Lote de importación, E139 Mapeo de columna, E140 Plantilla de mapeo, E141 Fila de importación.

-- ───────────────────────────── plantillas de mapeo (E140) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.importacion_plantillas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  nombre           text not null,
  tipo_datos       text not null check (tipo_datos in ('pacientes', 'citas', 'historial', 'productos', 'proveedores', 'imagenes_expediente', 'checadas')),
  origen_sistema   text,
  mapeos           jsonb not null default '[]'::jsonb,       -- [{columna, campo_destino, transformacion}]
  creada_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
create trigger t_upd before update on piefirme.importacion_plantillas for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── lote (E138) ─────────────────────────────
create table piefirme.importaciones (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid references piefirme.sedes(id),                -- sede destino
  tipo_datos          text not null check (tipo_datos in ('pacientes', 'citas', 'historial', 'productos', 'proveedores', 'imagenes_expediente', 'checadas')),
  origen_sistema      text,
  archivo_nombre      text not null,
  archivo_path        text,                                             -- bucket pf-importaciones: <organizacion_id>/<lote>/<archivo>
  archivo_bytes       bigint check (archivo_bytes is null or archivo_bytes >= 0),
  hoja                text,
  total_filas         integer not null default 0,
  total_columnas      integer not null default 0,
  paso                text not null default 'subir' check (paso in ('subir', 'mapeo', 'vista_previa', 'confirmar')),
  estado              text not null default 'subido' check (estado in ('subido', 'mapeo_propuesto', 'vista_previa', 'confirmado', 'cargado', 'revertido', 'descartado', 'error')),
  politica_duplicados text not null default 'omitir' check (politica_duplicados in ('omitir', 'combinar', 'crear_nuevo')),
  umbral_confianza    numeric(5,2) not null default 80 check (umbral_confianza between 0 and 100),
  plantilla_id        uuid references piefirme.importacion_plantillas(id) on delete set null,
  ia_modo             text not null default 'no_configurado' check (ia_modo in ('no_configurado', 'sintetico', 'activo')),
  ia_proveedor        text,
  ia_propuesta        jsonb,                                            -- JSON tal como lo devolvió el adaptador de IA
  ia_propuesta_en     timestamptz,
  resumen             jsonb not null default '{"validos":0,"advertencias":0,"errores":0,"duplicados":0}'::jsonb,
  mensaje_error       text,
  subido_por          uuid default auth.uid(),
  confirmado_por      uuid,
  confirmado_en       timestamptz,
  cargado_en          timestamptz,
  revertido_por       uuid,
  revertido_en        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (archivo_path is null or split_part(archivo_path, '/', 1) = organizacion_id::text)
);
create index on piefirme.importaciones (organizacion_id, estado, created_at desc);
create trigger t_upd before update on piefirme.importaciones for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.importaciones for each row execute function piefirme_app.auditar();

-- reglas de la transición de estado del lote
create or replace function piefirme_app.importacion_flujo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.estado := 'subido'; new.paso := 'subir'; new.confirmado_por := null; new.confirmado_en := null;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    if old.estado in ('cargado', 'revertido', 'descartado') and not (old.estado = 'cargado' and new.estado = 'revertido') then
      raise exception 'Lote en estado %, sin más transiciones', old.estado;
    end if;
    if new.estado = 'confirmado' and auth.uid() is not null and not piefirme_app.es_admin() then
      raise exception 'Solo un Administrador confirma la importación';
    end if;
    if new.estado = 'confirmado' and old.estado <> 'vista_previa' then
      raise exception 'Solo se confirma desde la vista previa';
    end if;
    if new.estado = 'cargado' and old.estado <> 'confirmado' then
      raise exception 'Nada se carga sin confirmar (P-122)';
    end if;
    if new.estado = 'revertido' and old.estado <> 'cargado' then
      raise exception 'Solo se revierte un lote cargado';
    end if;
  end if;
  return new;
end $$;
create trigger t_flujo before insert or update on piefirme.importaciones for each row execute function piefirme_app.importacion_flujo();

-- las checadas importadas apuntan a su lote
alter table piefirme.checadas add constraint checadas_importacion_fk foreign key (importacion_id) references piefirme.importaciones(id) on delete set null;

-- ───────────────────────────── mapeo de columnas (E139) ─────────────────────────────
create table piefirme.importacion_mapeos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  importacion_id   uuid not null references piefirme.importaciones(id) on delete cascade,
  columna_archivo  text not null,
  ejemplo          text,
  campo_destino    text,                                             -- null = sin campo equivalente (→ folio anterior / elegir campo)
  confianza        numeric(5,2) check (confianza between 0 and 100),
  transformacion   text,                                             -- p. ej. "Separar y capitalizar", "Año de 2 a 4 dígitos"
  campo_clinico    boolean not null default false,                   -- alergias, diagnósticos, medicamentos…
  accion           text not null default 'revisar' check (accion in ('aceptar', 'revisar', 'elegir_campo')),
  decidido_por     uuid,
  decidido_en      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (importacion_id, columna_archivo)
);
create index on piefirme.importacion_mapeos (organizacion_id, importacion_id);

-- confianza < umbral, campo clínico o sin destino ⇒ nunca "aceptar" sin decisión humana (P-123)
create or replace function piefirme_app.mapeo_reglas() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_umb numeric; v_org uuid;
begin
  select umbral_confianza, organizacion_id into v_umb, v_org from piefirme.importaciones where id = new.importacion_id;
  if v_org is distinct from new.organizacion_id then raise exception 'Lote de otra clínica'; end if;
  if new.campo_destino is null then
    new.accion := 'elegir_campo';
  elsif tg_op = 'INSERT' and (new.campo_clinico or coalesce(new.confianza, 0) < v_umb) then
    new.accion := 'revisar';                       -- la propuesta de la IA no puede entrar ya aceptada
  end if;
  if tg_op = 'UPDATE' and new.accion = 'aceptar' and old.accion is distinct from 'aceptar' then
    new.decidido_por := coalesce(auth.uid(), new.decidido_por); new.decidido_en := now();
  end if;
  return new;
end $$;
create trigger t_reglas before insert or update on piefirme.importacion_mapeos for each row execute function piefirme_app.mapeo_reglas();
create trigger t_upd before update on piefirme.importacion_mapeos for each row execute function piefirme_app.tocar_updated_at();

-- ───────────────────────────── filas del lote (E141) ─────────────────────────────
create table piefirme.importacion_filas (
  id                      uuid primary key default gen_random_uuid(),
  organizacion_id         uuid not null references piefirme.organizaciones(id) on delete cascade,
  importacion_id          uuid not null references piefirme.importaciones(id) on delete cascade,
  numero_fila             integer not null check (numero_fila > 0),
  valores_originales      jsonb not null default '{}'::jsonb,
  valores_normalizados    jsonb not null default '{}'::jsonb,
  resultado               text not null default 'valido' check (resultado in ('valido', 'advertencia', 'error', 'duplicado')),
  mensajes                jsonb not null default '[]'::jsonb,         -- [{campo, motivo}]
  paciente_coincidente_id uuid references piefirme.pacientes(id) on delete set null,
  decision                text check (decision in ('omitir', 'combinar', 'crear_nuevo')),
  origen_importado        boolean not null default true,              -- marca "importado" con su origen (P-123)
  registro_tabla          text,                                       -- registro creado (base de la reversa)
  registro_id             uuid,
  modificado_despues      boolean not null default false,             -- alguien editó el registro creado: ya no se revierte
  created_at              timestamptz not null default now(),
  unique (importacion_id, numero_fila)
);
create index on piefirme.importacion_filas (organizacion_id, importacion_id, resultado);
create index on piefirme.importacion_filas (paciente_coincidente_id);

-- ───────────────────────────── RLS: solo Administración (CA-08) ─────────────────────────────
alter table piefirme.importacion_plantillas enable row level security;
alter table piefirme.importaciones          enable row level security;
alter table piefirme.importacion_mapeos     enable row level security;
alter table piefirme.importacion_filas      enable row level security;

create policy ipl_sel on piefirme.importacion_plantillas for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy ipl_ins on piefirme.importacion_plantillas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy ipl_upd on piefirme.importacion_plantillas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy ipl_del on piefirme.importacion_plantillas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy imp_sel on piefirme.importaciones for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy imp_ins on piefirme.importaciones for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy imp_upd on piefirme.importaciones for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy imp_del on piefirme.importaciones for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and estado in ('subido', 'mapeo_propuesto', 'vista_previa', 'descartado', 'error'));

create policy imm_sel on piefirme.importacion_mapeos for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy imm_ins on piefirme.importacion_mapeos for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy imm_upd on piefirme.importacion_mapeos for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy imm_del on piefirme.importacion_mapeos for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

create policy imf_sel on piefirme.importacion_filas for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin());
create policy imf_ins on piefirme.importacion_filas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy imf_upd on piefirme.importacion_filas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy imf_del on piefirme.importacion_filas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- ───────────────────────────── RPC ─────────────────────────────
-- El adaptador de IA (función servidor, sin llave real por ahora) entrega su propuesta JSON; aquí se guarda y se expande en mapeos.
-- p_propuesta: {"proveedor":"…","modo":"sintetico","mapeos":[{"columna":"Nombre completo","ejemplo":"Ana López","campo_destino":"nombre","confianza":98,"transformacion":"Separar y capitalizar","campo_clinico":false}]}
create or replace function piefirme.importacion_guardar_propuesta(p_importacion uuid, p_propuesta jsonb)
returns integer language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare imp piefirme.importaciones; m jsonb; n int := 0;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  select * into imp from piefirme.importaciones where id = p_importacion and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'Lote no encontrado'; end if;
  if imp.estado not in ('subido', 'mapeo_propuesto', 'vista_previa') then raise exception 'El lote ya no admite nueva propuesta'; end if;
  for m in select * from jsonb_array_elements(coalesce(p_propuesta -> 'mapeos', '[]'::jsonb)) loop
    insert into piefirme.importacion_mapeos (organizacion_id, importacion_id, columna_archivo, ejemplo, campo_destino, confianza, transformacion, campo_clinico)
    values (imp.organizacion_id, imp.id, m ->> 'columna', m ->> 'ejemplo', nullif(m ->> 'campo_destino', ''), (m ->> 'confianza')::numeric,
            m ->> 'transformacion', coalesce((m ->> 'campo_clinico')::boolean, false))
    on conflict (importacion_id, columna_archivo) do update set
      ejemplo = excluded.ejemplo, campo_destino = excluded.campo_destino, confianza = excluded.confianza,
      transformacion = excluded.transformacion, campo_clinico = excluded.campo_clinico, accion = 'revisar';
    n := n + 1;
  end loop;
  update piefirme.importaciones
     set ia_propuesta = p_propuesta, ia_propuesta_en = now(), ia_proveedor = p_propuesta ->> 'proveedor',
         ia_modo = coalesce(nullif(p_propuesta ->> 'modo', ''), 'no_configurado'), estado = 'mapeo_propuesto', paso = 'mapeo'
   where id = imp.id;
  return n;
end $$;

-- recalcula el resumen (válidos, advertencias, errores, duplicados) desde las filas
create or replace function piefirme.importacion_resumir(p_importacion uuid)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v jsonb;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo Administración'; end if;
  select jsonb_build_object(
           'validos', count(*) filter (where resultado = 'valido'),
           'advertencias', count(*) filter (where resultado = 'advertencia'),
           'errores', count(*) filter (where resultado = 'error'),
           'duplicados', count(*) filter (where resultado = 'duplicado'))
    into v from piefirme.importacion_filas where importacion_id = p_importacion and organizacion_id = piefirme_app.org_id();
  update piefirme.importaciones set resumen = v, total_filas = greatest(total_filas, (select count(*) from piefirme.importacion_filas where importacion_id = p_importacion)),
         estado = case when estado in ('mapeo_propuesto') then 'vista_previa' else estado end,
         paso = case when estado in ('mapeo_propuesto') then 'vista_previa' else paso end
   where id = p_importacion and organizacion_id = piefirme_app.org_id();
  return v;
end $$;

-- el Administrador confirma: exige que no queden mapeos por revisar y deja el lote listo para la carga servidor
create or replace function piefirme.importacion_confirmar(p_importacion uuid)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare imp piefirme.importaciones; v_pend int; v_cargar int;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo un Administrador confirma la importación'; end if;
  select * into imp from piefirme.importaciones where id = p_importacion and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'Lote no encontrado'; end if;
  if imp.estado <> 'vista_previa' then raise exception 'El lote debe estar en vista previa (estado actual: %)', imp.estado; end if;
  select count(*) into v_pend from piefirme.importacion_mapeos where importacion_id = imp.id and accion <> 'aceptar' and campo_destino is not null;
  if v_pend > 0 then raise exception 'Quedan % columnas por revisar antes de confirmar', v_pend; end if;
  select count(*) into v_cargar from piefirme.importacion_filas
   where importacion_id = imp.id and (resultado in ('valido', 'advertencia') or (resultado = 'duplicado' and coalesce(decision, imp.politica_duplicados) <> 'omitir'));
  update piefirme.importaciones set estado = 'confirmado', paso = 'confirmar', confirmado_por = auth.uid(), confirmado_en = now() where id = imp.id;
  perform piefirme.registrar_bitacora('confirmar', 'importaciones', imp.id::text, jsonb_build_object('filas_a_cargar', v_cargar, 'tipo', imp.tipo_datos), imp.sede_id);
  return jsonb_build_object('filas_a_cargar', v_cargar, 'omitidas_por_error', (select count(*) from piefirme.importacion_filas where importacion_id = imp.id and resultado = 'error'));
end $$;

-- la función servidor avisa que terminó la carga
create or replace function piefirme.importacion_marcar_cargado(p_importacion uuid)
returns void language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_admin() then raise exception 'Solo Administración'; end if;
  update piefirme.importaciones set estado = 'cargado', cargado_en = now() where id = p_importacion and organizacion_id = piefirme_app.org_id() and estado = 'confirmado';
  if not found then raise exception 'El lote no está confirmado'; end if;
end $$;

-- reversa del lote (P-122): solo si ningún registro creado se ha modificado; devuelve qué registros borrar a la función servidor
create or replace function piefirme.importacion_revertir(p_importacion uuid)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare imp piefirme.importaciones; v_mod int; v_reg jsonb;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración'; end if;
  select * into imp from piefirme.importaciones where id = p_importacion and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'Lote no encontrado'; end if;
  if imp.estado <> 'cargado' then raise exception 'Solo se revierte un lote cargado'; end if;
  select count(*) into v_mod from piefirme.importacion_filas where importacion_id = imp.id and modificado_despues;
  if v_mod > 0 then raise exception 'No se puede revertir: % registros ya se modificaron después de la carga', v_mod; end if;
  select coalesce(jsonb_agg(jsonb_build_object('tabla', registro_tabla, 'id', registro_id)), '[]'::jsonb) into v_reg
    from piefirme.importacion_filas where importacion_id = imp.id and registro_id is not null;
  update piefirme.importaciones set estado = 'revertido', revertido_por = auth.uid(), revertido_en = now() where id = imp.id;
  perform piefirme.registrar_bitacora('revertir', 'importaciones', imp.id::text, jsonb_build_object('registros', jsonb_array_length(v_reg)), imp.sede_id);
  return v_reg;
end $$;

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_importaciones with (security_invoker = true) as
select i.id, i.organizacion_id, i.sede_id, i.tipo_datos, i.origen_sistema, i.archivo_nombre, i.archivo_bytes, i.hoja, i.total_filas, i.total_columnas,
       i.paso, i.estado, i.politica_duplicados, i.umbral_confianza, i.ia_modo, i.ia_proveedor, i.resumen,
       (i.resumen ->> 'validos')::int as validos, (i.resumen ->> 'advertencias')::int as advertencias,
       (i.resumen ->> 'errores')::int as errores, (i.resumen ->> 'duplicados')::int as duplicados,
       (select count(*) from piefirme.importacion_mapeos m where m.importacion_id = i.id and m.accion <> 'aceptar' and m.campo_destino is not null) as mapeos_por_revisar,
       i.subido_por, i.confirmado_por, i.confirmado_en, i.cargado_en, i.revertido_en, i.created_at
  from piefirme.importaciones i;

create or replace view piefirme.prp_importacion_mapeos with (security_invoker = true) as
select m.id, m.organizacion_id, m.importacion_id, m.columna_archivo, m.ejemplo, m.campo_destino, m.confianza, m.transformacion,
       m.campo_clinico, m.accion, (m.confianza is not null and m.confianza < i.umbral_confianza) as bajo_umbral
  from piefirme.importacion_mapeos m
  join piefirme.importaciones i on i.id = m.importacion_id;

create or replace view piefirme.prp_importacion_filas with (security_invoker = true) as
select f.id, f.organizacion_id, f.importacion_id, f.numero_fila, f.valores_originales, f.valores_normalizados, f.resultado, f.mensajes,
       f.paciente_coincidente_id, f.decision, f.registro_tabla, f.registro_id, f.modificado_despues
  from piefirme.importacion_filas f;

revoke all on function piefirme.importacion_guardar_propuesta(uuid, jsonb) from public, anon;
revoke all on function piefirme.importacion_resumir(uuid) from public, anon;
revoke all on function piefirme.importacion_confirmar(uuid) from public, anon;
revoke all on function piefirme.importacion_marcar_cargado(uuid) from public, anon;
revoke all on function piefirme.importacion_revertir(uuid) from public, anon;
grant execute on function piefirme.importacion_guardar_propuesta(uuid, jsonb) to authenticated;
grant execute on function piefirme.importacion_resumir(uuid) to authenticated;
grant execute on function piefirme.importacion_confirmar(uuid) to authenticated;
grant execute on function piefirme.importacion_marcar_cargado(uuid) to authenticated;
grant execute on function piefirme.importacion_revertir(uuid) to authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.importacion_flujo(), piefirme_app.mapeo_reglas() from authenticated;
