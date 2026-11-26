-- 220 · Control y Auditoría · ETAPA 3 · CASOS (1/3): columnas de apoyo, índices y funciones internas.
-- Un caso nunca se captura a mano: nace del cierre de un conteo o de un cierre (piefirme_app.ctl_abrir_caso y las RPC de cierre). Aquí NO se crea ninguna
-- ruta de alta. Esta migración solo añade:
--   · ctl_caso_bitacora.datos (jsonb) y .evidencia_id: lo estructurado de cada entrada (a quién se asignó, causa propuesta, movimiento resultante…).
--     La bitácora sigue siendo solo-inserción (triggers de la Etapa 0); las columnas nuevas no cambian eso.
--   · índices para «mis casos», antigüedad y reportes.
--   · funciones internas piefirme_app.ctl_caso_* (no ejecutables por la app; solo las RPC de 221/222 las invocan).
-- Depende de: 200–206, 210–213.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.ctl_caso_bitacora add column if not exists datos jsonb not null default '{}'::jsonb;
alter table piefirme.ctl_caso_bitacora add column if not exists evidencia_id uuid;

create index if not exists ctl_caso_asignado_idx on piefirme.ctl_caso (organizacion_id, asignado_a, estado);
create index if not exists ctl_caso_abierto_idx on piefirme.ctl_caso (organizacion_id, abierto_en desc);
create index if not exists ctl_caso_producto_idx on piefirme.ctl_caso (organizacion_id, sucursal_id, producto_id);

-- ───────────────────────────── funciones internas ─────────────────────────────
create or replace function piefirme_app.ctl_nombre_usuario(p_id uuid) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select nullif(trim(p.nombre || ' ' || coalesce(p.apellidos, '')), '') from piefirme.perfiles p where p.id = p_id
$$;

-- Entrada de bitácora del caso (solo inserción). usuario_id = quien actúa (null = el sistema).
create or replace function piefirme_app.ctl_caso_bit(p_org uuid, p_sucursal uuid, p_caso uuid, p_usuario uuid, p_tipo text, p_texto text,
                                                     p_antes text default null, p_despues text default null, p_datos jsonb default '{}'::jsonb, p_evidencia uuid default null) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.ctl_caso_bitacora (organizacion_id, sucursal_id, caso_id, usuario_id, tipo, texto, estado_anterior, estado_nuevo, datos, evidencia_id)
  values (p_org, p_sucursal, p_caso, p_usuario, p_tipo, p_texto, p_antes, p_despues, coalesce(p_datos, '{}'::jsonb), p_evidencia);
end $$;

-- Quién capturó lo que originó el caso (el del caso; si falta, el de la partida o la captura del cierre).
create or replace function piefirme_app.ctl_caso_capturista(k piefirme.ctl_caso) returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(k.usuario_captura,
           case k.origen_tipo when 'partida_conteo' then (select p.creado_por from piefirme.ctl_partida_conteo p where p.id = k.origen_id)
                              when 'cierre_captura' then (select c.creado_por from piefirme.ctl_cierre_captura c where c.id = k.origen_id) end)
$$;

create or replace function piefirme_app.ctl_caso_es_abierto(p_estado text) returns boolean
language sql immutable as $$ select p_estado in ('abierta', 'en_investigacion', 'ajuste_fallido') $$;

-- Carga y bloquea el caso (misma organización y sede permitida). 404 si no existe: no se revela que existe en otra clínica o sede.
create or replace function piefirme_app.ctl_caso_cargar(p_caso uuid, p_org uuid) returns piefirme.ctl_caso
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare k piefirme.ctl_caso%rowtype;
begin
  select * into k from piefirme.ctl_caso where id = p_caso and organizacion_id = p_org for update;
  if not found or not piefirme_app.puede_sede(k.sucursal_id) then raise exception 'caso no encontrado' using errcode = 'PF404'; end if;
  return k;
end $$;

-- Contraparte de una posible sustitución de código (F2.5): el caso del faltante caro es el PRINCIPAL y lleva al del sobrante barato.
-- Devuelve el caso ligado (bloqueado) si k es el principal; null si no hay par o si k es la contraparte.
create or replace function piefirme_app.ctl_caso_par(k piefirme.ctl_caso) returns piefirme.ctl_caso
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s piefirme.ctl_caso%rowtype; v_id uuid;
begin
  if k.contexto #>> '{sustitucion,rol}' is distinct from 'faltante_caro' then return null; end if;
  v_id := nullif(k.contexto #>> '{sustitucion,sobrante,caso_id}', '')::uuid;
  if v_id is null then return null; end if;
  select * into s from piefirme.ctl_caso where id = v_id and organizacion_id = k.organizacion_id and sucursal_id = k.sucursal_id for update;
  if not found then return null; end if;
  return s;
end $$;

-- Las acciones del caso se hacen sobre el PRINCIPAL del par: la contraparte solo admite comentarios.
create or replace function piefirme_app.ctl_caso_exigir_principal(k piefirme.ctl_caso) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_p text;
begin
  if k.contexto #>> '{sustitucion,rol}' = 'sobrante_barato' then
    select folio into v_p from piefirme.ctl_caso where id = nullif(k.contexto #>> '{sustitucion,caso_principal_id}', '')::uuid;
    raise exception 'Este caso es la contraparte de una posible sustitución de código: actúe sobre el caso principal %, que lleva el par completo.', coalesce(v_p, '(principal)') using errcode = 'PF422';
  end if;
end $$;

-- Valida la causa del catálogo cerrado (activa, de la organización; la nota es obligatoria si la causa la exige). Devuelve el nombre.
create or replace function piefirme_app.ctl_caso_validar_causa(p_org uuid, p_causa uuid, p_nota text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.ctl_causa%rowtype;
begin
  if p_causa is null then raise exception 'La causa es obligatoria y sale del catálogo cerrado.' using errcode = 'PF422'; end if;
  select * into c from piefirme.ctl_causa where id = p_causa and organizacion_id = p_org;
  if not found or not c.activo then raise exception 'La causa no existe o está desactivada en el catálogo.' using errcode = 'PF422'; end if;
  if c.requiere_nota and length(btrim(coalesce(p_nota, ''))) < 10 then
    raise exception 'La causa «%» exige una nota (mínimo 10 caracteres) que explique el caso.', c.nombre using errcode = 'PF422';
  end if;
  return c.nombre;
end $$;

-- Tope del costo que se puede absorber: no más que el valor al costo de lo que se perdió (o sobró) en el caso y su par.
create or replace function piefirme_app.ctl_caso_tope_monto(k piefirme.ctl_caso, s piefirme.ctl_caso) returns numeric
language sql stable as $$ select abs(coalesce(k.valor, 0)) + abs(coalesce(s.valor, 0)) $$;

-- ───────────────────────────── privilegios: nada de esto lo ejecuta la app ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme_app' and p.proname in ('ctl_nombre_usuario', 'ctl_caso_bit', 'ctl_caso_capturista', 'ctl_caso_es_abierto', 'ctl_caso_cargar',
                                                               'ctl_caso_par', 'ctl_caso_exigir_principal', 'ctl_caso_validar_causa', 'ctl_caso_tope_monto') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
