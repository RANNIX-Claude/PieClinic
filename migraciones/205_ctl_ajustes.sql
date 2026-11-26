-- 205 · Control y Auditoría · Etapa 0 · AJUSTES tras las pruebas:
--   · Orden determinista de la bitácora de configuración (seq): dos cambios en el mismo instante ya no son ambiguos al consultar «el valor de entonces».
--   · El bloqueo temporal del PIN y de la contraseña cuenta los fallos POSTERIORES al último acierto por orden de intento (id), no por reloj:
--     así un acierto y un fallo en el mismo instante no se confunden.
-- Depende de: 200–204.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.ctl_config_bitacora add column if not exists seq bigint generated always as identity;

create or replace function piefirme_app.ctl_config_en(p_org uuid, p_clave text, p_sucursal uuid, p_fecha timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v jsonb;
begin
  if p_sucursal is not null then
    select b.valor_nuevo into v from piefirme.ctl_config_bitacora b
     where b.organizacion_id = p_org and b.clave = p_clave and b.sucursal_id = p_sucursal and b.creado_en <= p_fecha
     order by b.creado_en desc, b.seq desc limit 1;
    if v is not null then return v; end if;
  end if;
  select b.valor_nuevo into v from piefirme.ctl_config_bitacora b
   where b.organizacion_id = p_org and b.clave = p_clave and b.sucursal_id is null and b.creado_en <= p_fecha
   order by b.creado_en desc, b.seq desc limit 1;
  if v is not null then return v; end if;
  return (select d.omision from piefirme.ctl_config_def d where d.clave = p_clave);
end $$;

create or replace function piefirme.ctl_pin_abrir_sesion(p_pin text, p_sucursal uuid, p_turno uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_desde bigint; v_fallos integer; v_ok boolean; v_turno uuid := p_turno; v_id uuid; v_vence timestamptz; v_ultimo timestamptz;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  select coalesce(max(i.id), 0) into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'pin' and i.exito;
  select count(*), max(i.creado_en) into v_fallos, v_ultimo from piefirme.ctl_intento i
   where i.usuario_id = auth.uid() and i.tipo = 'pin' and not i.exito and i.id > v_desde and i.creado_en > now() - interval '15 minutes';
  if v_fallos >= 3 then
    raise exception 'PIN bloqueado por intentos fallidos; espere % minutos o use su contraseña', greatest(1, ceil(extract(epoch from (v_ultimo + interval '15 minutes' - now())) / 60))::integer using errcode = 'PF429';
  end if;
  if not exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'sin_pin', 'mensaje', 'Defina su PIN en «Mi PIN» antes de capturar.');
  end if;
  v_ok := p_pin ~ '^[0-9]{4,8}$' and exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = auth.uid() and pp.pin_hash = piefirme_app.hash_pin(pp.perfil_id, p_pin));
  insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values (v_org, auth.uid(), 'pin', v_ok);
  if not v_ok then   -- no se lanza error: revertiría el registro del intento y el bloqueo nunca se activaría
    return jsonb_build_object('ok', false, 'error', 'pin_incorrecto', 'intentos_restantes', greatest(0, 2 - v_fallos));
  end if;
  if v_turno is null then
    select t.id into v_turno from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = p_sucursal and t.estado = 'abierto' and t.cajero_id = auth.uid() order by t.apertura_en desc limit 1;
  elsif not exists (select 1 from piefirme.turnos_caja t where t.id = v_turno and t.organizacion_id = v_org and t.sede_id = p_sucursal and t.estado = 'abierto') then
    raise exception 'el turno indicado no está abierto en esta sucursal' using errcode = 'PF409';
  end if;
  v_vence := now() + interval '12 hours';
  insert into piefirme.ctl_sesion_pin (organizacion_id, sucursal_id, perfil_id, turno_id, vence_en, hora_cliente)
  values (v_org, p_sucursal, auth.uid(), v_turno, v_vence, p_hora_cliente) returning id into v_id;
  return jsonb_build_object('ok', true, 'sesion_id', v_id, 'turno_id', v_turno, 'vence_en', v_vence);
end $$;

create or replace function piefirme.ctl_autorizar_ajuste(p_caso uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('autorizar'); k piefirme.ctl_caso%rowtype; v_cap uuid; v_inv boolean; v_ok boolean; v_desde bigint; v_fallos integer;
        v_res jsonb; v_estado text; v_causa text;
begin
  select * into k from piefirme.ctl_caso where id = p_caso and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(k.sucursal_id) then raise exception 'caso no encontrado' using errcode = 'PF404'; end if;
  if k.estado not in ('en_investigacion', 'ajuste_fallido') then raise exception 'el caso está % y no admite autorización de ajuste', k.estado using errcode = 'PF409'; end if;
  if k.causa_id is null or k.responsable_costo is null then raise exception 'antes de autorizar, el caso necesita causa y quién absorbe el costo' using errcode = 'PF422'; end if;
  if k.cantidad is null or k.cantidad = 0 or k.producto_id is null then raise exception 'este caso no tiene un ajuste de inventario que autorizar' using errcode = 'PF422'; end if;

  -- regla 2: quien capturó no autoriza su propio caso (del caso y, si existe, de la partida/cierre de origen)
  v_cap := coalesce(k.usuario_captura,
                    case k.origen_tipo when 'partida_conteo' then (select p.creado_por from piefirme.ctl_partida_conteo p where p.id = k.origen_id)
                                       when 'cierre_captura' then (select c.creado_por from piefirme.ctl_cierre_captura c where c.id = k.origen_id) end);
  if v_cap is not null and v_cap = auth.uid() then
    raise exception 'Quien capturó la partida no puede autorizar el ajuste de su propio caso. Pida a otra persona autorizada que lo apruebe.' using errcode = 'PF403';
  end if;
  -- regla 3: quien investigó no autoriza, salvo dueño
  select (k.asignado_a = auth.uid()) or exists (select 1 from piefirme.ctl_caso_bitacora b where b.caso_id = k.id and b.usuario_id = auth.uid()
                                               and (b.tipo in ('comentario', 'evidencia', 'asignacion') or b.estado_nuevo = 'en_investigacion')) into v_inv;
  if v_inv and piefirme_app.ctl_rol() <> 'dueno' then
    raise exception 'Quien investigó el caso no puede autorizar su ajuste (solo el dueño puede hacerlo).' using errcode = 'PF403';
  end if;

  -- regla 4: contraseña completa, con bloqueo temporal (3 fallos / 15 min). El fallo se devuelve (no se lanza) para conservar el intento.
  select coalesce(max(i.id), 0) into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'password' and i.exito;
  select count(*) into v_fallos from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'password' and not i.exito and i.id > v_desde and i.creado_en > now() - interval '15 minutes';
  if v_fallos >= 3 then raise exception 'autorización bloqueada por intentos fallidos; espere 15 minutos' using errcode = 'PF429'; end if;
  select (u.encrypted_password is not null and u.encrypted_password = extensions.crypt(coalesce(p_password, ''), u.encrypted_password)) into v_ok from auth.users u where u.id = auth.uid();
  v_ok := coalesce(v_ok, false);
  insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values (v_org, auth.uid(), 'password', v_ok);
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'contrasena_incorrecta', 'mensaje', 'Para autorizar un ajuste se exige su contraseña completa (no el PIN).'); end if;

  perform piefirme_app.ctl_rpc_on();
  select c.nombre into v_causa from piefirme.ctl_causa c where c.id = k.causa_id;
  update piefirme.ctl_caso set autorizado_por = auth.uid(), autorizado_en = now() where id = k.id;
  v_res := piefirme.ctl_solicitar_ajuste_origen(k.folio, k.sucursal_id, k.producto_id, k.cantidad, 'ajuste_por_auditoria', v_causa, auth.uid(), now(), v_org);
  v_estado := case when (v_res ->> 'ok')::boolean then 'cerrada_con_ajuste' else 'ajuste_fallido' end;
  update piefirme.ctl_caso set estado = v_estado, movimiento_origen_id = nullif(v_res ->> 'movimiento_id', '')::uuid,
         cerrado_en = case when v_estado = 'cerrada_con_ajuste' then now() end where id = k.id;
  insert into piefirme.ctl_caso_bitacora (organizacion_id, sucursal_id, caso_id, usuario_id, tipo, texto, estado_anterior, estado_nuevo)
  values (v_org, k.sucursal_id, k.id, auth.uid(), 'cambio_estado', case when v_estado = 'ajuste_fallido' then 'El origen rechazó el ajuste: ' || coalesce(v_res ->> 'mensaje', '') else 'Ajuste autorizado y aplicado' end, k.estado, v_estado);
  return jsonb_build_object('ok', (v_res ->> 'ok')::boolean, 'estado', v_estado, 'movimiento_id', v_res -> 'movimiento_id', 'mensaje', v_res ->> 'mensaje');
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_pin_abrir_sesion', 'ctl_autorizar_ajuste') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
