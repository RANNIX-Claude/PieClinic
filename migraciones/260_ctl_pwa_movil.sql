-- 260 · Control y Auditoría · ETAPA 5 · PWA móvil de captura (F6)
--   · ctl_cierre_plantilla : la lista de puntos que el móvil guarda para poder ABRIR y completar un cierre sin internet (F6.4). Mismo filtro que
--                            ctl_cierre_abrir, pero sin crear nada y SIN valores esperados, tolerancias ni fórmulas (captura a ciegas).
--   · ctl_pwa_pendientes   : «Mis pendientes» en una sola llamada: auditorías remotas con tiempo límite y hora del servidor (la cuenta regresiva no
--                            usa el reloj del teléfono), cierres propios en captura y entregas por aceptar. Nada calculado.
--   · ctl_push_suscripcion : registro de suscripciones Web Push (F2.3). Sin llaves VAPID el envío está SIMULADO: la Etapa 6 lee esta tabla desde ctl_alerta.
--   · ctl_push_registrar / ctl_push_baja : únicas formas de escribirla (la app no tiene INSERT/UPDATE/DELETE).
-- Depende de: 200–206, 210–213, 230–235.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── plantilla del cierre (para operar sin conexión) ─────────────────────────────
create or replace function piefirme.ctl_cierre_plantilla(p_sucursal uuid, p_tipo text) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_puntos jsonb; v_tomas jsonb;
begin
  if p_tipo is null or p_tipo <> all (array['apertura', 'turno', 'dia', 'semanal']) then raise exception 'tipo de cierre no válido: %', p_tipo using errcode = 'PF422'; end if;
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'punto_id', p.id, 'grupo_id', p.grupo_id, 'version', p.version, 'nombre', p.nombre, 'tipo_captura', p.tipo_captura, 'obligatorio', p.obligatorio, 'orden', p.orden,
           'requiere_valor', p.tipo_captura in ('numero', 'conteo_piezas', 'numero_y_foto'), 'requiere_foto', p.tipo_captura in ('solo_foto', 'numero_y_foto'),
           'toma_fija', coalesce((p.parametros ->> 'toma_fija')::boolean, false)) order by p.orden, p.nombre), '[]'::jsonb) into v_puntos
    from piefirme.ctl_punto_control p
   where p.organizacion_id = v_org and p.activo and p.vigente_hasta is null and (p.sucursales is null or p_sucursal = any (p.sucursales))
     and case p_tipo when 'apertura' then p.aplica_apertura when 'turno' then p.aplica_turno when 'dia' then p.aplica_dia else p.aplica_semanal end;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre) order by t.orden, t.nombre), '[]'::jsonb) into v_tomas
    from piefirme_app.ctl_tomas_aplicables(v_org, p_sucursal, p_tipo) t;
  return jsonb_build_object('tipo', p_tipo, 'sucursal_id', p_sucursal, 'puntos', v_puntos, 'tomas', v_tomas,
                            'lado_largo', (piefirme_app.ctl_config_en(v_org, 'foto_lado_largo_px', p_sucursal, now()) #>> '{}')::integer,
                            'denominaciones', to_jsonb(piefirme_app.ctl_denominaciones_validas()), 'ahora', now());
end $$;

-- ───────────────────────────── mis pendientes ─────────────────────────────
create or replace function piefirme.ctl_pwa_pendientes(p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_rem jsonb; v_cie jsonb;
begin
  if p_sucursal is not null and (not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal)) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  perform piefirme_app.ctl_expirar_vencidas(v_org);
  select coalesce(jsonb_agg(jsonb_build_object('sesion_id', s.id, 'folio', s.folio, 'sucursal_id', s.sucursal_id, 'sucursal', x.nombre, 'solicitada_en', s.solicitada_en,
           'limite_en', s.limite_en, 'tamano_muestra', s.tamano_muestra) order by s.limite_en nulls last, s.solicitada_en), '[]'::jsonb) into v_rem
    from piefirme.ctl_sesion_conteo s join piefirme.sedes x on x.id = s.sucursal_id
   where s.organizacion_id = v_org and s.tipo = 'auditoria_remota' and s.estado = 'abierta' and piefirme_app.puede_sede(s.sucursal_id) and (p_sucursal is null or s.sucursal_id = p_sucursal);
  select coalesce(jsonb_agg(jsonb_build_object('cierre_id', c.id, 'folio', c.folio, 'tipo', c.tipo, 'sucursal_id', c.sucursal_id, 'sucursal', x.nombre, 'abierto_en', c.abierto_en) order by c.abierto_en), '[]'::jsonb) into v_cie
    from piefirme.ctl_cierre c join piefirme.sedes x on x.id = c.sucursal_id
   where c.organizacion_id = v_org and c.estado = 'en_captura' and c.usuario_cierra = auth.uid() and piefirme_app.puede_sede(c.sucursal_id) and (p_sucursal is null or c.sucursal_id = p_sucursal);
  return jsonb_build_object('ahora', now(), 'remotas', v_rem, 'cierres', v_cie, 'entregas', piefirme.ctl_entregas_pendientes(p_sucursal));
end $$;

-- ───────────────────────────── suscripciones Web Push ─────────────────────────────
create table if not exists piefirme.ctl_push_suscripcion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  perfil_id        uuid not null,
  sucursal_id      uuid,
  endpoint         text not null unique,
  clave_p256dh     text,
  clave_auth       text,
  agente           text,
  simulada         boolean not null default true,   -- true mientras no haya llaves VAPID: nada se envía de verdad
  activa           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists ctl_push_suscripcion_idx on piefirme.ctl_push_suscripcion (organizacion_id, sucursal_id) where activa;
alter table piefirme.ctl_push_suscripcion enable row level security;
revoke all on piefirme.ctl_push_suscripcion from public, anon, authenticated;
-- sin política de lectura para la app: solo la Etapa 6 (servidor) la consulta

create or replace function piefirme.ctl_push_registrar(p_endpoint text, p_p256dh text default null, p_auth text default null, p_sucursal uuid default null, p_agente text default null,
                                                       p_simulada boolean default true) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid;
begin
  if p_endpoint is null or length(p_endpoint) < 8 or length(p_endpoint) > 2000 then raise exception 'suscripción no válida' using errcode = 'PF422'; end if;
  if p_sucursal is not null and (not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal)) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  insert into piefirme.ctl_push_suscripcion (organizacion_id, perfil_id, sucursal_id, endpoint, clave_p256dh, clave_auth, agente, simulada)
  values (v_org, auth.uid(), p_sucursal, p_endpoint, p_p256dh, p_auth, left(p_agente, 300), coalesce(p_simulada, true))
  on conflict (endpoint) do update set perfil_id = auth.uid(), organizacion_id = v_org, sucursal_id = excluded.sucursal_id, clave_p256dh = excluded.clave_p256dh,
        clave_auth = excluded.clave_auth, agente = excluded.agente, simulada = excluded.simulada, activa = true, actualizado_en = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'simulada', coalesce(p_simulada, true));
end $$;

create or replace function piefirme.ctl_push_baja(p_endpoint text) returns boolean
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  update piefirme.ctl_push_suscripcion set activa = false, actualizado_en = now() where endpoint = p_endpoint and organizacion_id = v_org and perfil_id = auth.uid();
  return found;
end $$;

-- ───────────────────────────── privilegios de ejecución ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_cierre_plantilla', 'ctl_pwa_pendientes', 'ctl_push_registrar', 'ctl_push_baja') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
