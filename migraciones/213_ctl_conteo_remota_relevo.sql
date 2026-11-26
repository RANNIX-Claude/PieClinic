-- 213 · Control y Auditoría · ETAPA 2 · MOTOR DE CONTEO (3/3): auditoría remota (F2.3) y relevo de turno (F2.4).
-- AUDITORÍA REMOTA: la lanza SOLO el dueño; por omisión a TODAS las sucursales (una sola es la excepción y exige motivo: lanzar de una en una
--   permite que las tiendas se presten mercancía). Una sesión por sucursal con su propia lista aleatoria ponderada, límite de tiempo y aviso en
--   ctl_alerta (el push real llega en la Etapa 5/6). Avance en vivo para el dueño; al vencer el límite la sesión pasa a «expirada».
-- RELEVO: el entrante cuenta a ciegas la custodia (≤ 30); el servidor compara; si cuadra, el entrante acepta con su PIN y la custodia pasa a él;
--   si no, se muestra la diferencia a ambos (excepción F2.4), se abren casos diferencia_relevo con los dos turnos y las dos firmas y se alerta al dueño.
--   Regla de servidor para Caja: piefirme.ctl_entrega_pendiente(turno) dice si el entrante está bloqueado para vender (ver docs/AUDITORIA_ETAPA2.md).
-- Depende de: 200–206, 210–212.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── AUDITORÍA REMOTA ─────────────────────────────
create or replace function piefirme.ctl_remota_lanzar(p_sucursales uuid[] default null, p_muestra integer default null, p_limite_min integer default null,
                                                      p_incluir_recientes boolean default false, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_sedes uuid[]; v_activas integer; v_grupo uuid := gen_random_uuid(); v_limite numeric; v_tope numeric; v_muestra integer;
        x record; v_id uuid; v_folio text; v_n integer; v_lim timestamptz; v_ok jsonb := '[]'::jsonb; v_om jsonb := '[]'::jsonb;
begin
  if piefirme_app.ctl_rol() <> 'dueno' then raise exception 'Solo el dueño lanza auditorías remotas.' using errcode = 'PF403'; end if;
  select count(*) into v_activas from piefirme.sedes s where s.organizacion_id = v_org and s.activa and piefirme_app.puede_sede(s.id);
  select array_agg(s.id order by s.nombre) into v_sedes from piefirme.sedes s
   where s.organizacion_id = v_org and s.activa and piefirme_app.puede_sede(s.id) and (p_sucursales is null or s.id = any (p_sucursales));
  if v_sedes is null then raise exception 'No hay sucursales activas para lanzar la auditoría.' using errcode = 'PF422'; end if;
  if p_sucursales is not null and cardinality(v_sedes) <> (select count(distinct u) from unnest(p_sucursales) u) then
    raise exception 'Alguna de las sucursales indicadas no existe o no está activa.' using errcode = 'PF422';
  end if;
  if cardinality(v_sedes) = 1 and v_activas > 1 and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Lanzar a una sola sucursal es la excepción (permite que las tiendas se presten mercancía): lánzala a todas o escribe el motivo.' using errcode = 'PF422';
  end if;
  v_limite := coalesce(p_limite_min, piefirme_app.ctl_cfg_num(v_org, 'auditoria_remota_limite_min', null)::integer);
  if v_limite < 1 then raise exception 'El tiempo límite debe ser de al menos 1 minuto.' using errcode = 'PF422'; end if;
  select d.tope into v_tope from piefirme.ctl_config_def d where d.clave = 'muestra_aleatoria';
  if p_muestra is not null and (p_muestra < 1 or p_muestra > v_tope) then
    raise exception 'La muestra debe estar entre 1 y % piezas. Una muestra mayor toma tanto tiempo que se termina capturando sin contar, y eso genera evidencia falsa.', v_tope::integer using errcode = 'PF422';
  end if;
  v_lim := now() + make_interval(mins => v_limite::integer);

  perform piefirme_app.ctl_rpc_on();
  for x in select s.id, s.nombre from piefirme.sedes s where s.id = any (v_sedes) order by s.nombre loop
    if exists (select 1 from piefirme.ctl_sesion_conteo c where c.organizacion_id = v_org and c.sucursal_id = x.id and c.tipo = 'auditoria_remota' and c.estado = 'abierta') then
      v_om := v_om || jsonb_build_object('sucursal_id', x.id, 'sucursal', x.nombre, 'motivo', 'Ya tiene una auditoría remota abierta.'); continue;
    end if;
    if not exists (select 1 from piefirme_app.ctl_elegibles(v_org, x.id, coalesce(p_incluir_recientes, false))) then   -- sin productos que contar no se crea la sesión
      v_om := v_om || jsonb_build_object('sucursal_id', x.id, 'sucursal', x.nombre, 'motivo', 'Sin productos elegibles (sin existencias o contados hace poco).'); continue;
    end if;
    v_muestra := coalesce(p_muestra, piefirme_app.ctl_cfg_num(v_org, 'muestra_aleatoria', x.id)::integer);
    insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, solicitada_por, solicitada_en, limite_en, grupo_id, tamano_muestra, incluir_recientes, motivo)
    values (v_org, x.id, 'auditoria_remota', 'aleatoria', auth.uid(), now(), v_lim, v_grupo, v_muestra, coalesce(p_incluir_recientes, false), nullif(btrim(p_motivo), ''))
    returning id, folio into v_id, v_folio;
    v_n := piefirme_app.ctl_generar_lista(v_org, v_id, x.id, 'aleatoria', v_muestra, coalesce(p_incluir_recientes, false));
    -- aviso a la sucursal (el push real llega en la Etapa 5/6; el dispositivo ya ve la sesión abierta por su RLS)
    insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
    values (v_org, x.id, 'auditoria_remota_solicitada', 'media', array['sucursal'],
            'Auditoría remota solicitada: cuenta ' || v_n || ' producto(s) antes de ' || to_char(v_lim at time zone coalesce((select o.zona_horaria from piefirme.organizaciones o where o.id = v_org), 'America/Mexico_City'), 'HH24:MI') || '.',
            'sesion_conteo', v_id);
    v_ok := v_ok || jsonb_build_object('sesion_id', v_id, 'folio', v_folio, 'sucursal_id', x.id, 'sucursal', x.nombre, 'en_lista', v_n);
  end loop;
  if jsonb_array_length(v_ok) = 0 then raise exception 'No se lanzó ninguna sesión: %', v_om::text using errcode = 'PF422'; end if;
  return jsonb_build_object('ok', true, 'grupo_id', v_grupo, 'limite_en', v_lim, 'sesiones', v_ok, 'omitidas', v_om);
end $$;

-- Avance en vivo: sucursales que abrieron, partidas capturadas, tiempo transcurrido y expiradas. Solo cifras de avance, jamás diferencias.
create or replace function piefirme.ctl_remota_avance(p_grupo uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); v_grupo uuid := p_grupo; v_filas jsonb; v_res jsonb; v_lanz timestamptz; v_lim timestamptz;
begin
  perform piefirme_app.ctl_expirar_vencidas(v_org);
  if v_grupo is null then
    select s.grupo_id into v_grupo from piefirme.ctl_sesion_conteo s where s.organizacion_id = v_org and s.tipo = 'auditoria_remota' and s.grupo_id is not null order by s.solicitada_en desc limit 1;
  end if;
  if v_grupo is null then return jsonb_build_object('grupo_id', null, 'sucursales', '[]'::jsonb, 'resumen', jsonb_build_object('total', 0)); end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sucursal), '[]'::jsonb), min(t.solicitada_en), max(t.limite_en) into v_filas, v_lanz, v_lim from (
    select s.id as sesion_id, s.folio, s.sucursal_id, (select x.nombre from piefirme.sedes x where x.id = s.sucursal_id) as sucursal, s.estado, s.solicitada_en, s.limite_en,
           (s.recibida_en is not null) as abrio, s.recibida_en, s.respuesta_seg,
           (select count(distinct p.producto_id) from piefirme.ctl_partida_conteo p where p.sesion_id = s.id) as capturadas,
           (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id) as en_lista,
           greatest(0, round(extract(epoch from (coalesce(s.cerrada_en, now()) - s.solicitada_en)))::integer) as transcurrido_seg,
           case when s.estado = 'abierta' then greatest(0, round(extract(epoch from (s.limite_en - now())))::integer) end as restante_seg,
           case when s.estado = 'abierta' and s.recibida_en is null then 'sin_abrir'
                when s.estado = 'abierta' then 'en_curso'
                when s.estado = 'cerrada' then 'completa'
                when s.estado = 'cancelada' then 'cancelada'
                when exists (select 1 from piefirme.ctl_partida_conteo p where p.sesion_id = s.id) then 'parcial'
                else 'no_reportada' end as respuesta
      from piefirme.ctl_sesion_conteo s
     where s.organizacion_id = v_org and s.grupo_id = v_grupo and piefirme_app.puede_sede(s.sucursal_id)) t;
  select jsonb_build_object('total', count(*), 'abrieron', count(*) filter (where f ->> 'abrio' = 'true'), 'en_curso', count(*) filter (where f ->> 'respuesta' = 'en_curso'),
                            'sin_abrir', count(*) filter (where f ->> 'respuesta' = 'sin_abrir'), 'completas', count(*) filter (where f ->> 'respuesta' = 'completa'),
                            'expiradas', count(*) filter (where f ->> 'estado' = 'expirada'), 'no_reportadas', count(*) filter (where f ->> 'respuesta' = 'no_reportada'),
                            'partidas_capturadas', coalesce(sum((f ->> 'capturadas')::integer), 0), 'pendientes', count(*) filter (where f ->> 'estado' = 'abierta'))
    into v_res from jsonb_array_elements(v_filas) f;
  return jsonb_build_object('grupo_id', v_grupo, 'lanzada_en', v_lanz, 'limite_en', v_lim, 'transcurrido_seg', greatest(0, round(extract(epoch from (now() - v_lanz)))::integer),
                            'resumen', v_res, 'sucursales', v_filas);
end $$;

create or replace function piefirme.ctl_remota_listar(p_limite integer default 20) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  perform piefirme_app.ctl_expirar_vencidas(v_org);
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.lanzada_en desc) from (
    select s.grupo_id, min(s.solicitada_en) as lanzada_en, max(s.limite_en) as limite_en, count(*) as sucursales, max(s.tamano_muestra) as muestra,
           count(*) filter (where s.estado = 'abierta') as abiertas, count(*) filter (where s.estado = 'cerrada') as cerradas, count(*) filter (where s.estado = 'expirada') as expiradas,
           count(*) filter (where s.estado = 'cancelada') as canceladas, max(s.motivo) as motivo
      from piefirme.ctl_sesion_conteo s
     where s.organizacion_id = v_org and s.tipo = 'auditoria_remota' and s.grupo_id is not null and piefirme_app.puede_sede(s.sucursal_id)
     group by s.grupo_id order by min(s.solicitada_en) desc limit least(greatest(coalesce(p_limite, 20), 1), 100)) t), '[]'::jsonb);
end $$;

-- ───────────────────────────── PIN (misma regla que ctl_pin_abrir_sesion: 3 fallos bloquean 15 min) ─────────────────────────────
create or replace function piefirme_app.ctl_validar_pin(p_org uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_desde bigint; v_fallos integer; v_ok boolean; v_ultimo timestamptz;
begin
  select coalesce(max(i.id), 0) into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'pin' and i.exito;
  select count(*), max(i.creado_en) into v_fallos, v_ultimo from piefirme.ctl_intento i
   where i.usuario_id = auth.uid() and i.tipo = 'pin' and not i.exito and i.id > v_desde and i.creado_en > now() - interval '15 minutes';
  if v_fallos >= 3 then
    raise exception 'PIN bloqueado por intentos fallidos; espere % minutos o use su contraseña', greatest(1, ceil(extract(epoch from (v_ultimo + interval '15 minutes' - now())) / 60))::integer using errcode = 'PF429';
  end if;
  if not exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'sin_pin', 'mensaje', 'Defina su PIN en «Mi PIN» antes de aceptar la entrega.');
  end if;
  v_ok := coalesce(p_pin, '') ~ '^[0-9]{4,8}$' and exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = auth.uid() and pp.pin_hash = piefirme_app.hash_pin(pp.perfil_id, p_pin));
  insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values (p_org, auth.uid(), 'pin', v_ok);
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'pin_incorrecto', 'intentos_restantes', greatest(0, 2 - v_fallos), 'mensaje', 'PIN incorrecto.'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────────── RELEVO: entregas sin aceptar (criterio 18) ─────────────────────────────
-- «Se va» = el saliente cerró su turno y pasó la espera (relevo_espera_min) sin que el entrante aceptara. También cubre al entrante que ni empezó
-- a contar: el servidor deja una entrega entrega_no_aceptada ligada a los dos turnos. Se evalúa al consultar (no hay planificador): Caja,
-- el tablero y las pantallas del módulo la invocan; si hay pg_cron, basta programar piefirme_app.ctl_entregas_revisar(<org>).
create or replace function piefirme_app.ctl_entregas_revisar(p_org uuid) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_a integer; v_b integer;
begin
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_entrega_turno e set estado = 'entrega_no_aceptada', no_aceptada_en = now()
   where e.organizacion_id = p_org and e.estado in ('contando', 'por_aceptar', 'con_diferencia')
     and exists (select 1 from piefirme.turnos_caja s where s.id = e.turno_saliente_id and s.cierre_en is not null
                    and s.cierre_en <= now() - make_interval(mins => piefirme_app.ctl_cfg_num(p_org, 'relevo_espera_min', e.sucursal_id)::integer));
  get diagnostics v_a = row_count;
  insert into piefirme.ctl_entrega_turno (organizacion_id, sucursal_id, turno_saliente_id, turno_entrante_id, usuario_saliente, usuario_entrante, estado, no_aceptada_en, en_custodia)
  select p_org, t.sede_id, prev.id, t.id, prev.cajero_id, t.cajero_id, 'entrega_no_aceptada', now(),
         (select count(*) from piefirme.ctl_producto_custodia c where c.organizacion_id = p_org and c.sucursal_id = t.sede_id and c.activo)::integer
    from piefirme.turnos_caja t
    join lateral (select p.* from piefirme.turnos_caja p
                   where p.organizacion_id = p_org and p.sede_id = t.sede_id and p.id <> t.id and p.apertura_en < t.apertura_en
                     and p.apertura_en >= t.apertura_en - make_interval(secs => piefirme_app.ctl_cfg_num(p_org, 'relevo_ventana_horas', t.sede_id) * 3600)
                   order by p.apertura_en desc limit 1) prev on true
   where t.organizacion_id = p_org and t.apertura_en >= now() - interval '72 hours'
     and prev.cierre_en is not null and prev.cierre_en <= now() - make_interval(mins => piefirme_app.ctl_cfg_num(p_org, 'relevo_espera_min', t.sede_id)::integer)
     and prev.cajero_id is distinct from t.cajero_id
     and exists (select 1 from piefirme.ctl_producto_custodia c where c.organizacion_id = p_org and c.sucursal_id = t.sede_id and c.activo)
     and not exists (select 1 from piefirme.ctl_entrega_turno e where e.organizacion_id = p_org and e.turno_entrante_id = t.id and e.estado <> 'cancelada')
  on conflict do nothing;
  get diagnostics v_b = row_count;
  return v_a + v_b;
end $$;

-- REGLA PARA CAJA (criterio 19): ¿este turno puede registrar ventas? Bloquea mientras exista un relevo requerido sin aceptar.
--   { bloquea, requerida, estado, entrega_id, motivo }. Caja llama esta función al abrir el turno y antes de cada venta; la integración visual y el
--   candado en el punto de venta son del origen (Etapa 1/4/5): este es el contrato.
create or replace function piefirme.ctl_entrega_pendiente(p_turno uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); t piefirme.turnos_caja%rowtype; e piefirme.ctl_entrega_turno%rowtype; v_req boolean;
begin
  perform piefirme_app.ctl_entregas_revisar(v_org);
  select * into t from piefirme.turnos_caja where id = p_turno and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(t.sede_id) then raise exception 'turno no encontrado' using errcode = 'PF404'; end if;
  select * into e from piefirme.ctl_entrega_turno x where x.organizacion_id = v_org and x.turno_entrante_id = t.id and x.estado <> 'cancelada' order by x.creado_en desc limit 1;
  if found then
    if e.estado in ('aceptada', 'aceptada_con_diferencia') then
      return jsonb_build_object('bloquea', false, 'requerida', true, 'estado', e.estado, 'entrega_id', e.id, 'motivo', null);
    end if;
    return jsonb_build_object('bloquea', true, 'requerida', true, 'estado', e.estado, 'entrega_id', e.id,
      'motivo', case e.estado when 'contando' then 'Termina de contar la custodia y acepta la entrega para poder vender.'
                              when 'por_aceptar' then 'La custodia cuadra: acepta la entrega con tu PIN para poder vender.'
                              when 'con_diferencia' then 'La custodia no cuadra: revisa la diferencia y acepta la entrega con tu PIN para poder vender.'
                              else 'La entrega del turno anterior no fue aceptada: cuenta la custodia y acéptala para poder vender.' end);
  end if;
  select exists (
    select 1 from piefirme.turnos_caja p
     where p.organizacion_id = v_org and p.sede_id = t.sede_id and p.id <> t.id and p.apertura_en < t.apertura_en and p.cajero_id is distinct from t.cajero_id
       and p.apertura_en >= t.apertura_en - make_interval(secs => piefirme_app.ctl_cfg_num(v_org, 'relevo_ventana_horas', t.sede_id) * 3600)
  ) and exists (select 1 from piefirme.ctl_producto_custodia c where c.organizacion_id = v_org and c.sucursal_id = t.sede_id and c.activo) into v_req;
  if v_req then
    return jsonb_build_object('bloquea', true, 'requerida', true, 'estado', 'sin_iniciar', 'entrega_id', null,
                              'motivo', 'Hay un turno anterior: cuenta la custodia (Conteos → Relevo de turno) y acepta la entrega para poder vender.');
  end if;
  return jsonb_build_object('bloquea', false, 'requerida', false, 'estado', null, 'entrega_id', null, 'motivo', null);
end $$;

-- Diferencia del relevo para el entrante y el saliente (excepción F2.4 a la captura a ciegas); también la ven dueño y supervisor.
create or replace function piefirme.ctl_relevo_ver(p_entrega uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); e piefirme.ctl_entrega_turno%rowtype; v_dif jsonb := '[]'::jsonb;
begin
  select * into e from piefirme.ctl_entrega_turno where id = p_entrega and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(e.sucursal_id) then raise exception 'entrega no encontrada' using errcode = 'PF404'; end if;
  if (auth.uid() is distinct from e.usuario_entrante and auth.uid() is distinct from e.usuario_saliente) and not piefirme_app.ctl_puede('ver_directo') then
    raise exception 'Solo el entrante, el saliente, un supervisor o el dueño ven esta entrega.' using errcode = 'PF403';
  end if;
  if e.estado in ('con_diferencia', 'aceptada_con_diferencia') and e.sesion_id is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.descripcion), '[]'::jsonb) into v_dif from (
      select p.producto_id, pr.nombre as descripcion, p.cantidad_fisica as contado, c.diferencia_piezas as diferencia_relevo
        from piefirme.ctl_partida_conteo p join piefirme.ctl_partida_calculo c on c.partida_id = p.id join piefirme.productos pr on pr.id = p.producto_id
       where p.sesion_id = e.sesion_id and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id) and c.diferencia_piezas <> 0
      union all
      select l.producto_id, pr.nombre, null, null from piefirme.ctl_lista_solicitada l join piefirme.productos pr on pr.id = l.producto_id where l.sesion_id = e.sesion_id and not l.reportado) t;
  end if;
  return jsonb_build_object('entrega_id', e.id, 'estado', e.estado, 'sucursal_id', e.sucursal_id, 'turno_saliente_id', e.turno_saliente_id, 'turno_entrante_id', e.turno_entrante_id,
                            'usuario_saliente', e.usuario_saliente, 'usuario_entrante', e.usuario_entrante, 'aceptada_en', e.aceptada_en, 'firma_entrante_en', e.firma_entrante_en,
                            'firma_saliente_en', e.firma_saliente_en, 'no_aceptada_en', e.no_aceptada_en, 'diferencias', v_dif);
end $$;

-- Aceptar la entrega con PIN. El entrante acepta (y desbloquea las ventas); si hubo diferencia, el saliente firma después con su PIN (dos firmas).
create or replace function piefirme.ctl_relevo_aceptar(p_entrega uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); e piefirme.ctl_entrega_turno%rowtype; v_pin jsonb; v_rol text; v_nuevo text;
begin
  select * into e from piefirme.ctl_entrega_turno where id = p_entrega and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(e.sucursal_id) then raise exception 'entrega no encontrada' using errcode = 'PF404'; end if;
  if auth.uid() = e.usuario_entrante then v_rol := 'entrante';
  elsif auth.uid() = e.usuario_saliente then v_rol := 'saliente';
  else raise exception 'Solo el entrante o el saliente de este relevo pueden firmarlo.' using errcode = 'PF403'; end if;
  if v_rol = 'entrante' and e.estado not in ('por_aceptar', 'con_diferencia') then
    return jsonb_build_object('ok', false, 'error', case when e.estado in ('aceptada', 'aceptada_con_diferencia') then 'ya_aceptada' else 'sin_conteo' end,
                              'mensaje', case when e.estado in ('aceptada', 'aceptada_con_diferencia') then 'La entrega ya fue aceptada.' else 'Cuenta la custodia antes de aceptar la entrega.' end);
  end if;
  if v_rol = 'saliente' and e.estado not in ('con_diferencia', 'aceptada_con_diferencia') then
    return jsonb_build_object('ok', false, 'error', 'sin_diferencia', 'mensaje', 'La firma del saliente solo se pide cuando el relevo no cuadra.');
  end if;
  v_pin := piefirme_app.ctl_validar_pin(v_org, p_pin);
  if not (v_pin ->> 'ok')::boolean then return v_pin; end if;
  perform piefirme_app.ctl_rpc_on();
  if v_rol = 'entrante' then
    v_nuevo := case e.estado when 'por_aceptar' then 'aceptada' else 'aceptada_con_diferencia' end;
    update piefirme.ctl_entrega_turno set estado = v_nuevo, aceptada_en = now(), aceptada_por = auth.uid(), firma_entrante_en = now() where id = e.id;
    update piefirme.ctl_caso set contexto = jsonb_set(contexto, '{firmas}', coalesce(contexto -> 'firmas', '{}'::jsonb) || jsonb_build_object('entrante', jsonb_build_object('usuario_id', auth.uid(), 'en', now())))
     where organizacion_id = v_org and tipo = 'diferencia_relevo' and contexto ->> 'entrega_id' = e.id::text;
  else
    v_nuevo := e.estado;
    update piefirme.ctl_entrega_turno set firma_saliente_en = coalesce(firma_saliente_en, now()) where id = e.id;
    update piefirme.ctl_caso set contexto = jsonb_set(contexto, '{firmas}', coalesce(contexto -> 'firmas', '{}'::jsonb) || jsonb_build_object('saliente', jsonb_build_object('usuario_id', auth.uid(), 'en', now())))
     where organizacion_id = v_org and tipo = 'diferencia_relevo' and contexto ->> 'entrega_id' = e.id::text;
  end if;
  return jsonb_build_object('ok', true, 'estado', v_nuevo, 'firmo', v_rol, 'entrega_id', e.id);
end $$;

create or replace function piefirme.ctl_entregas_listar(p_sucursal uuid default null, p_estado text default null, p_limite integer default 100) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  perform piefirme_app.ctl_entregas_revisar(v_org);
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.creado_en desc) from (
    select e.id, e.sucursal_id, (select s.nombre from piefirme.sedes s where s.id = e.sucursal_id) as sucursal, e.estado, e.turno_saliente_id, e.turno_entrante_id,
           (select trim(p.nombre || ' ' || coalesce(p.apellidos, '')) from piefirme.perfiles p where p.id = e.usuario_saliente) as saliente,
           (select trim(p.nombre || ' ' || coalesce(p.apellidos, '')) from piefirme.perfiles p where p.id = e.usuario_entrante) as entrante,
           e.contados, e.en_custodia, e.aceptada_en, e.firma_entrante_en, e.firma_saliente_en, e.no_aceptada_en, e.creado_en
      from piefirme.ctl_entrega_turno e
     where e.organizacion_id = v_org and piefirme_app.puede_sede(e.sucursal_id) and (p_sucursal is null or e.sucursal_id = p_sucursal) and (p_estado is null or e.estado = p_estado)
     order by e.creado_en desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) t), '[]'::jsonb);
end $$;

-- Quién tiene hoy la custodia de la sucursal: el entrante de la última entrega aceptada (la custodia «se transfiere» al aceptar).
create or replace function piefirme.ctl_custodia_actual(p_sucursal uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); e piefirme.ctl_entrega_turno%rowtype;
begin
  if not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no permitida' using errcode = 'PF403'; end if;
  select * into e from piefirme.ctl_entrega_turno x where x.organizacion_id = v_org and x.sucursal_id = p_sucursal and x.estado in ('aceptada', 'aceptada_con_diferencia') order by x.aceptada_en desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('entrega_id', e.id, 'usuario_id', e.usuario_entrante, 'desde', e.aceptada_en, 'con_diferencia', e.estado = 'aceptada_con_diferencia',
                            'nombre', (select trim(p.nombre || ' ' || coalesce(p.apellidos, '')) from piefirme.perfiles p where p.id = e.usuario_entrante));
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'piefirme_app' and p.proname in ('ctl_validar_pin', 'ctl_entregas_revisar'))
               or (n.nspname = 'piefirme' and p.proname in ('ctl_remota_lanzar', 'ctl_remota_avance', 'ctl_remota_listar', 'ctl_entrega_pendiente', 'ctl_relevo_ver', 'ctl_relevo_aceptar',
                                                             'ctl_entregas_listar', 'ctl_custodia_actual')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
