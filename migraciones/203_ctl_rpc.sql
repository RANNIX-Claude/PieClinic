-- 203 · Control y Auditoría · Etapa 0 · RPC (única vía de escritura), reglas duras de roles, PIN, evidencia y punto de escritura al origen.
-- Toda RPC: SECURITY DEFINER, search_path fijo, sesión válida + clínica activa + capacidad validada EN EL SERVIDOR (ctl_exigir).
-- La Etapa 2 añade el motor de captura; la 3 completa los casos; aquí quedan: configuración con topes, catálogos, custodia, PIN de turno,
-- registro de evidencia, bitácora de consultas, lectura de soporte, detección de huecos de folio, ctl_autorizar_ajuste (separación de
-- funciones) y ctl_solicitar_ajuste_origen (idempotente; NO ejecutable por la app: solo la invoca ctl_autorizar_ajuste).
-- Depende de: 200–202, 073 (pins_personales, hash_pin).
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── rol y capacidades del usuario (el front las pinta; la autoridad es la base) ─────────────────────────────
create or replace function piefirme.ctl_mi_rol() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); c text; v_caps text[] := '{}';
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  foreach c in array array['capturar', 'ver_diferencias', 'investigar', 'autorizar', 'configurar'] loop
    if piefirme_app.ctl_puede(c) then v_caps := v_caps || c; end if;
  end loop;
  return jsonb_build_object('rol', piefirme_app.ctl_rol(), 'capacidades', to_jsonb(v_caps));
end $$;

-- ───────────────────────────── configuración con valor global por omisión, topes y versionado ─────────────────────────────
-- Valor vigente de un parámetro en una fecha: la última entrada de la sucursal; si no hay (o se restableció), la global; si no, la omisión.
create or replace function piefirme_app.ctl_config_en(p_org uuid, p_clave text, p_sucursal uuid, p_fecha timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v jsonb;
begin
  if p_sucursal is not null then
    select b.valor_nuevo into v from piefirme.ctl_config_bitacora b
     where b.organizacion_id = p_org and b.clave = p_clave and b.sucursal_id = p_sucursal and b.creado_en <= p_fecha
     order by b.creado_en desc, b.id desc limit 1;
    if v is not null then return v; end if;
  end if;
  select b.valor_nuevo into v from piefirme.ctl_config_bitacora b
   where b.organizacion_id = p_org and b.clave = p_clave and b.sucursal_id is null and b.creado_en <= p_fecha
   order by b.creado_en desc, b.id desc limit 1;
  if v is not null then return v; end if;
  return (select d.omision from piefirme.ctl_config_def d where d.clave = p_clave);
end $$;

create or replace function piefirme.ctl_config_efectiva(p_sucursal uuid default null)
returns table (clave text, descripcion text, tipo text, unidad text, valor jsonb, origen text, omision jsonb, minimo numeric, tope numeric,
               opciones text[], confirma_dueno boolean, explicacion_tope text, orden integer)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not (piefirme_app.ctl_puede('ver_diferencias') or piefirme_app.ctl_puede('configurar')) then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  if p_sucursal is not null and not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no permitida' using errcode = 'PF403'; end if;
  return query
    select d.clave, d.descripcion, d.tipo, d.unidad, piefirme_app.ctl_config_en(v_org, d.clave, p_sucursal, now()),
           case when p_sucursal is not null and exists (select 1 from piefirme.ctl_config c where c.organizacion_id = v_org and c.clave = d.clave and c.sucursal_id = p_sucursal and c.activa) then 'sucursal'
                when exists (select 1 from piefirme.ctl_config c where c.organizacion_id = v_org and c.clave = d.clave and c.sucursal_id is null and c.activa) then 'global'
                else 'omision' end,
           d.omision, d.minimo, d.tope, d.opciones, d.confirma_dueno, d.explicacion_tope, d.orden
      from piefirme.ctl_config_def d order by d.orden;
end $$;

-- Consulta histórica: «¿con qué configuración se cerró en agosto?»
create or replace function piefirme.ctl_config_valor_en(p_clave text, p_sucursal uuid default null, p_fecha timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not (piefirme_app.ctl_puede('ver_diferencias') or piefirme_app.ctl_puede('configurar')) then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  return piefirme_app.ctl_config_en(v_org, p_clave, p_sucursal, p_fecha);
end $$;

create or replace function piefirme.ctl_config_guardar(p_clave text, p_sucursal uuid, p_valor jsonb, p_confirmo_dueno boolean default false, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); c piefirme.ctl_config%rowtype; v_ant jsonb; v_conf uuid; v_id uuid;
begin
  if p_sucursal is not null and (not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal)) then
    raise exception 'sucursal no válida' using errcode = 'PF403';
  end if;
  perform piefirme_app.ctl_rpc_on();
  v_ant := piefirme_app.ctl_config_en(v_org, p_clave, p_sucursal, now());
  v_conf := case when p_confirmo_dueno and piefirme_app.ctl_rol() = 'dueno' then auth.uid() end;   -- solo el dueño confirma
  select * into c from piefirme.ctl_config k where k.organizacion_id = v_org and k.clave = p_clave and k.sucursal_id is not distinct from p_sucursal for update;
  if found then
    update piefirme.ctl_config set valor = p_valor, activa = true, confirmado_por = v_conf, modificado_en = now(), modificado_por = auth.uid() where id = c.id returning id into v_id;
  else
    insert into piefirme.ctl_config (organizacion_id, sucursal_id, clave, valor, confirmado_por) values (v_org, p_sucursal, p_clave, p_valor, v_conf) returning id into v_id;
  end if;
  insert into piefirme.ctl_config_bitacora (organizacion_id, sucursal_id, clave, valor_anterior, valor_nuevo, motivo, confirmado_por)
  values (v_org, p_sucursal, p_clave, v_ant, p_valor, p_motivo, v_conf);
  return jsonb_build_object('ok', true, 'id', v_id, 'valor_anterior', v_ant, 'valor', p_valor);
end $$;

-- Quita el valor propio de la sucursal: vuelve a regir el global (o la omisión).
create or replace function piefirme.ctl_config_restablecer(p_clave text, p_sucursal uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); c piefirme.ctl_config%rowtype; v_ant jsonb;
begin
  if p_sucursal is null then raise exception 'solo se restablece el valor propio de una sucursal' using errcode = 'PF400'; end if;
  perform piefirme_app.ctl_rpc_on();
  select * into c from piefirme.ctl_config k where k.organizacion_id = v_org and k.clave = p_clave and k.sucursal_id = p_sucursal and k.activa for update;
  if not found then return jsonb_build_object('ok', true, 'sin_cambios', true); end if;
  v_ant := c.valor;
  update piefirme.ctl_config set activa = false, modificado_en = now(), modificado_por = auth.uid() where id = c.id;
  insert into piefirme.ctl_config_bitacora (organizacion_id, sucursal_id, clave, valor_anterior, valor_nuevo, motivo)
  values (v_org, p_sucursal, p_clave, v_ant, null, p_motivo);
  return jsonb_build_object('ok', true, 'valor_anterior', v_ant);
end $$;

-- ───────────────────────────── catálogos administrables: causas y puntos de control ─────────────────────────────
create or replace function piefirme.ctl_causa_guardar(p_id uuid, p_nombre text, p_requiere_nota boolean default false, p_activo boolean default true) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); v_id uuid;
begin
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'la causa necesita un nombre' using errcode = 'PF400'; end if;
  perform piefirme_app.ctl_rpc_on();
  if p_id is null then
    insert into piefirme.ctl_causa (organizacion_id, nombre, requiere_nota, activo, orden)
    values (v_org, btrim(p_nombre), coalesce(p_requiere_nota, false), coalesce(p_activo, true),
            coalesce((select max(orden) from piefirme.ctl_causa where organizacion_id = v_org), 0) + 10) returning id into v_id;
  else
    update piefirme.ctl_causa set nombre = btrim(p_nombre), requiere_nota = coalesce(p_requiere_nota, false), activo = coalesce(p_activo, true)
     where id = p_id and organizacion_id = v_org returning id into v_id;
    if v_id is null then raise exception 'causa no encontrada' using errcode = 'PF404'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'ya existe una causa con ese nombre' using errcode = 'PF409';
end $$;

-- Un punto de control NUNCA se edita: cada cambio crea la versión siguiente y cierra la anterior (los cierres viejos se consultan con su versión).
create or replace function piefirme.ctl_punto_control_guardar(p_id uuid, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); o piefirme.ctl_punto_control%rowtype; v_id uuid; v_suc uuid[];
begin
  p_datos := coalesce(p_datos, '{}'::jsonb);
  perform piefirme_app.ctl_rpc_on();
  if p_id is null then
    if coalesce(btrim(p_datos ->> 'nombre'), '') = '' or (p_datos ->> 'tipo_captura') is null then raise exception 'nombre y tipo de captura son obligatorios' using errcode = 'PF400'; end if;
    insert into piefirme.ctl_punto_control (organizacion_id, nombre, tipo_captura, obligatorio, aplica_turno, aplica_dia, aplica_semanal, sucursales, formula_esperado, tolerancia, orden, activo)
    values (v_org, btrim(p_datos ->> 'nombre'), p_datos ->> 'tipo_captura', coalesce((p_datos ->> 'obligatorio')::boolean, true), coalesce((p_datos ->> 'aplica_turno')::boolean, true),
            coalesce((p_datos ->> 'aplica_dia')::boolean, false), coalesce((p_datos ->> 'aplica_semanal')::boolean, false),
            case when jsonb_typeof(p_datos -> 'sucursales') = 'array' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_datos -> 'sucursales') x) end,
            nullif(p_datos ->> 'formula_esperado', ''), coalesce((p_datos ->> 'tolerancia')::numeric, 0), coalesce((p_datos ->> 'orden')::integer, 100),
            coalesce((p_datos ->> 'activo')::boolean, true)) returning id into v_id;
    return v_id;
  end if;
  select * into o from piefirme.ctl_punto_control where organizacion_id = v_org and grupo_id = (select grupo_id from piefirme.ctl_punto_control where id = p_id and organizacion_id = v_org)
   order by version desc limit 1 for update;
  if not found then raise exception 'punto de control no encontrado' using errcode = 'PF404'; end if;
  v_suc := case when p_datos ? 'sucursales' then (case when jsonb_typeof(p_datos -> 'sucursales') = 'array' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_datos -> 'sucursales') x) end) else o.sucursales end;
  update piefirme.ctl_punto_control set vigente_hasta = now() where id = o.id;
  insert into piefirme.ctl_punto_control (organizacion_id, grupo_id, nombre, tipo_captura, obligatorio, aplica_turno, aplica_dia, aplica_semanal, sucursales, formula_esperado, tolerancia, orden, activo, version, vigente_desde)
  values (v_org, o.grupo_id, coalesce(nullif(btrim(p_datos ->> 'nombre'), ''), o.nombre), coalesce(p_datos ->> 'tipo_captura', o.tipo_captura),
          coalesce((p_datos ->> 'obligatorio')::boolean, o.obligatorio), coalesce((p_datos ->> 'aplica_turno')::boolean, o.aplica_turno),
          coalesce((p_datos ->> 'aplica_dia')::boolean, o.aplica_dia), coalesce((p_datos ->> 'aplica_semanal')::boolean, o.aplica_semanal), v_suc,
          case when p_datos ? 'formula_esperado' then nullif(p_datos ->> 'formula_esperado', '') else o.formula_esperado end,
          coalesce((p_datos ->> 'tolerancia')::numeric, o.tolerancia), coalesce((p_datos ->> 'orden')::integer, o.orden),
          coalesce((p_datos ->> 'activo')::boolean, o.activo), o.version + 1, now()) returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── custodia (tope de 30 activos por sucursal: trigger en base de datos) ─────────────────────────────
create or replace function piefirme.ctl_custodia_activar(p_sucursal uuid, p_producto uuid) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); c piefirme.ctl_producto_custodia%rowtype; v_id uuid;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no válida' using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.productos p where p.id = p_producto and p.organizacion_id = v_org) then raise exception 'producto no válido' using errcode = 'PF404'; end if;
  perform piefirme_app.ctl_rpc_on();
  select * into c from piefirme.ctl_producto_custodia where organizacion_id = v_org and sucursal_id = p_sucursal and producto_id = p_producto for update;
  if found then
    if c.activo then return c.id; end if;
    update piefirme.ctl_producto_custodia set activo = true, desactivado_en = null where id = c.id;   -- el trigger valida el tope
    return c.id;
  end if;
  insert into piefirme.ctl_producto_custodia (organizacion_id, sucursal_id, producto_id) values (v_org, p_sucursal, p_producto) returning id into v_id;
  return v_id;
end $$;

create or replace function piefirme.ctl_custodia_desactivar(p_sucursal uuid, p_producto uuid) returns boolean
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar');
begin
  if not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no válida' using errcode = 'PF403'; end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_producto_custodia set activo = false, desactivado_en = now()
   where organizacion_id = v_org and sucursal_id = p_sucursal and producto_id = p_producto and activo;
  return found;
end $$;

-- ───────────────────────────── PIN de captura: reutiliza «Mi PIN» (pins_personales, 073); sesión ligada al turno ─────────────────────────────
-- 3 fallos seguidos bloquean 15 minutos (los fallos se registran en ctl_intento; un acierto reinicia la cuenta).
create or replace function piefirme.ctl_pin_abrir_sesion(p_pin text, p_sucursal uuid, p_turno uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_desde timestamptz; v_fallos integer; v_ok boolean; v_turno uuid := p_turno; v_id uuid; v_vence timestamptz; v_ultimo timestamptz;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  select coalesce(max(i.creado_en), '-infinity') into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'pin' and i.exito;
  select count(*), max(i.creado_en) into v_fallos, v_ultimo from piefirme.ctl_intento i
   where i.usuario_id = auth.uid() and i.tipo = 'pin' and not i.exito and i.creado_en > greatest(v_desde, now() - interval '15 minutes');
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

-- Una sesión de PIN vale mientras no se cierre, no venza y su turno siga abierto (caduca al cerrar el turno).
create or replace function piefirme.ctl_pin_validar_sesion(p_sesion uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir(null); s piefirme.ctl_sesion_pin%rowtype;
begin
  select * into s from piefirme.ctl_sesion_pin where id = p_sesion and organizacion_id = v_org and perfil_id = auth.uid();
  if not found then return jsonb_build_object('vigente', false, 'motivo', 'no_existe'); end if;
  if s.cerrada_en is not null then return jsonb_build_object('vigente', false, 'motivo', 'cerrada'); end if;
  if now() >= s.vence_en then return jsonb_build_object('vigente', false, 'motivo', 'vencida'); end if;
  if s.turno_id is not null and not exists (select 1 from piefirme.turnos_caja t where t.id = s.turno_id and t.estado = 'abierto') then
    return jsonb_build_object('vigente', false, 'motivo', 'turno_cerrado');
  end if;
  return jsonb_build_object('vigente', true, 'vence_en', s.vence_en, 'turno_id', s.turno_id);
end $$;

create or replace function piefirme.ctl_pin_cerrar_sesion(p_sesion uuid) returns boolean
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir(null);
begin
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_sesion_pin set cerrada_en = now() where id = p_sesion and organizacion_id = v_org and perfil_id = auth.uid() and cerrada_en is null;
  return found;
end $$;

-- ───────────────────────────── evidencia (fotos en bucket privado) ─────────────────────────────
-- ¿Ya existe esa imagen (mismo hash) en la sucursal? Uso interno y de revisión.
create or replace function piefirme_app.ctl_hash_repetido(p_org uuid, p_sucursal uuid, p_hash text, p_excluir uuid default null) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.ctl_evidencia e where e.organizacion_id = p_org and e.sucursal_id = p_sucursal and e.hash_sha256 = p_hash and (p_excluir is null or e.id <> p_excluir))
$$;

-- No existe «subir desde galería»: la ruta debe corresponder a un archivo recién subido (≤ 15 min) al bucket privado, dentro de <organizacion>/ctl/<sucursal>/.
-- El navegador no puede probar que la foto es «en vivo»: lo que sí exige el servidor es hora propia, hash único y objeto reciente.
create or replace function piefirme.ctl_evidencia_registrar(p_id uuid, p_sucursal uuid, p_tipo_origen text, p_origen_id uuid, p_ruta text, p_hash text,
                                                           p_bytes integer default null, p_ancho integer default null, p_alto integer default null,
                                                           p_hora_cliente timestamptz default null, p_toma_fija uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid := coalesce(p_id, gen_random_uuid()); v_rep boolean;
begin
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  if left(coalesce(p_ruta, ''), length(v_org::text || '/ctl/' || p_sucursal::text || '/')) <> v_org::text || '/ctl/' || p_sucursal::text || '/' then
    raise exception 'la ruta de la foto debe empezar con <organización>/ctl/<sucursal>/' using errcode = 'PF400';
  end if;
  if exists (select 1 from piefirme.ctl_evidencia e where e.id = v_id and e.organizacion_id = v_org) then   -- reenvío idempotente
    return jsonb_build_object('ok', true, 'id', v_id, 'duplicada', true);
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id like '%-auditoria' and o.name = p_ruta and o.created_at > now() - interval '15 minutes') then
    raise exception 'no hay una foto reciente en esa ruta: la evidencia se captura en vivo y se registra enseguida' using errcode = 'PF409';
  end if;
  insert into piefirme.ctl_evidencia (id, organizacion_id, sucursal_id, tipo_origen, origen_id, url_almacenamiento, hash_sha256, bytes, ancho, alto, hora_cliente, toma_fija_id)
  values (v_id, v_org, p_sucursal, p_tipo_origen, p_origen_id, p_ruta, lower(p_hash), p_bytes, p_ancho, p_alto, p_hora_cliente, p_toma_fija);
  v_rep := piefirme_app.ctl_hash_repetido(v_org, p_sucursal, lower(p_hash), v_id);
  -- a quien captura NO se le dice que la imagen está repetida (no se le entrena a evadir el control): la alerta va al dueño
  return jsonb_build_object('ok', true, 'id', v_id) || case when piefirme_app.ctl_puede('ver_directo') then jsonb_build_object('hash_repetido', v_rep) else '{}'::jsonb end;
end $$;

-- ───────────────────────────── bitácora de consultas y lectura de soporte ─────────────────────────────
create or replace function piefirme.ctl_registrar_consulta(p_reporte text, p_filtros jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); v_id uuid;
begin
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros)
  values (v_org, auth.uid(), piefirme_app.ctl_rol(), left(coalesce(p_reporte, ''), 120), coalesce(p_filtros, '{}'::jsonb)) returning id into v_id;
  return v_id;
end $$;

-- El soporte RANNIX lee para diagnosticar, SOLO por aquí, y cada lectura queda registrada. No captura, no autoriza.
create or replace function piefirme.ctl_soporte_leer(p_objeto text, p_filtros jsonb default '{}'::jsonb, p_limite integer default 200) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); v_res jsonb;
begin
  if piefirme_app.ctl_rol() <> 'soporte' then raise exception 'esta lectura es solo para el soporte de RANNIX; use las pantallas del módulo' using errcode = 'PF403'; end if;
  if p_objeto <> all (array['ctl_sesion_revision', 'ctl_partida_revision', 'ctl_cierre_revision', 'ctl_caso', 'ctl_caso_bitacora', 'ctl_alerta',
                            'ctl_llamada_origen', 'ctl_discrepancia_hora', 'ctl_evidencia', 'ctl_config_bitacora']) then
    raise exception 'objeto no disponible para soporte: %', p_objeto using errcode = 'PF403';
  end if;
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros)
  values (v_org, auth.uid(), 'soporte', 'soporte:' || p_objeto, coalesce(p_filtros, '{}'::jsonb));
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from piefirme.%I t where t.organizacion_id = $1 and to_jsonb(t) @> $2 limit $3) t', p_objeto)
    into v_res using v_org, coalesce(p_filtros, '{}'::jsonb), least(greatest(coalesce(p_limite, 200), 1), 1000);
  return v_res;
end $$;

-- ───────────────────────────── folios sin huecos: ¿falta alguno? ─────────────────────────────
create or replace function piefirme.ctl_huecos_folios() returns table (serie text, anio integer, folio_faltante text)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias');
begin
  return query
    with f as (
      select 'SES'::text s, x.folio_anio a, x.folio_num n from piefirme.ctl_sesion_conteo x where x.organizacion_id = v_org
      union all select 'CIE', x.folio_anio, x.folio_num from piefirme.ctl_cierre x where x.organizacion_id = v_org
      union all select 'CAS', x.folio_anio, x.folio_num from piefirme.ctl_caso x where x.organizacion_id = v_org)
    select q.serie, q.anio, q.serie || '-' || q.anio || '-' || lpad(g.n::text, 5, '0')
      from piefirme.ctl_folio_seq q
      cross join lateral generate_series(1, q.ultimo) g(n)
     where q.organizacion_id = v_org and not exists (select 1 from f where f.s = q.serie and f.a = q.anio and f.n = g.n)
     order by 1, 2, 3;
end $$;

-- ═════════════════════════════ AJUSTE HACIA EL ORIGEN ═════════════════════════════
-- Equivalente a POST /podix/inventario/ajuste. Único punto de escritura del módulo hacia el inventario del origen.
-- Idempotente por folio_caso: un reintento (p. ej. por error de red) NO duplica el movimiento. Registra petición y respuesta.
-- NO la ejecuta la app (revocada abajo): solo ctl_autorizar_ajuste (y el servicio) la invocan. Nunca lanza por rechazo del origen:
-- devuelve {ok:false, mensaje} para que el caso pase a ajuste_fallido sin perderse en silencio.
create or replace function piefirme.ctl_solicitar_ajuste_origen(p_folio_caso text, p_sucursal uuid, p_producto uuid, p_cantidad_delta numeric,
                                                               p_tipo text, p_causa text, p_autorizado_por uuid, p_autorizado_en timestamptz, p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := coalesce(piefirme_app.org_id(), p_org); l piefirme.ctl_llamada_origen%rowtype; v_mov uuid; v_pet jsonb;
begin
  if v_org is null then raise exception 'organización requerida' using errcode = 'PF401'; end if;
  if coalesce(btrim(p_folio_caso), '') = '' then raise exception 'folio_caso es obligatorio' using errcode = 'PF400'; end if;
  if p_tipo is distinct from 'ajuste_por_auditoria' then raise exception 'tipo de ajuste no soportado: %', p_tipo using errcode = 'PF400'; end if;
  if p_cantidad_delta is null or p_cantidad_delta = 0 then raise exception 'la cantidad del ajuste no puede ser cero' using errcode = 'PF400'; end if;
  if p_autorizado_por is null or p_autorizado_en is null then raise exception 'el ajuste exige quién lo autorizó y cuándo' using errcode = 'PF400'; end if;
  v_pet := jsonb_build_object('origen', 'ctl', 'folio_caso', p_folio_caso, 'sucursal_id', p_sucursal, 'producto_id', p_producto, 'cantidad_delta', p_cantidad_delta,
                              'tipo', p_tipo, 'causa', p_causa, 'autorizado_por', p_autorizado_por, 'autorizado_en', p_autorizado_en);
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_llamada_origen (organizacion_id, folio_caso, sucursal_id, producto_id, peticion)
  values (v_org, p_folio_caso, p_sucursal, p_producto, v_pet) on conflict (organizacion_id, folio_caso) do nothing;
  select * into l from piefirme.ctl_llamada_origen where organizacion_id = v_org and folio_caso = p_folio_caso for update;
  if (l.peticion ->> 'producto_id') is distinct from p_producto::text or (l.peticion ->> 'sucursal_id') is distinct from p_sucursal::text
     or (l.peticion ->> 'cantidad_delta')::numeric is distinct from p_cantidad_delta then
    raise exception 'el folio % ya se usó con otros datos de ajuste', p_folio_caso using errcode = 'PF409';
  end if;
  if l.estado = 'aplicada' then   -- idempotencia
    return jsonb_build_object('ok', true, 'idempotente', true, 'movimiento_id', l.movimiento_id);
  end if;
  v_mov := gen_random_uuid();
  begin
    perform set_config('app.c_rpc', 'on', true);
    insert into piefirme.movimientos_inventario (id, organizacion_id, sede_id, producto_id, tipo, cantidad, referencia_tipo, referencia_folio, nota, usuario_id)
    values (v_mov, v_org, p_sucursal, p_producto, 'ajuste', p_cantidad_delta, 'ctl_caso', p_folio_caso, left('Ajuste por auditoría ' || p_folio_caso || ' · ' || coalesce(p_causa, ''), 300), p_autorizado_por);
    update piefirme.ctl_llamada_origen set estado = 'aplicada', movimiento_id = v_mov, mensaje = null, intentos = intentos + 1, ultimo_intento_en = now(),
           respuesta = jsonb_build_object('ok', true, 'movimiento_id', v_mov) where id = l.id;
    return jsonb_build_object('ok', true, 'idempotente', false, 'movimiento_id', v_mov);
  exception when others then
    update piefirme.ctl_llamada_origen set estado = 'rechazada', mensaje = left(sqlerrm, 500), intentos = intentos + 1, ultimo_intento_en = now(),
           respuesta = jsonb_build_object('ok', false, 'mensaje', left(sqlerrm, 500)) where id = l.id;
    return jsonb_build_object('ok', false, 'mensaje', left(sqlerrm, 500));
  end;
end $$;

-- ═════════════════════════════ AUTORIZAR AJUSTE (separación de funciones) ═════════════════════════════
-- Reglas duras validadas aquí, en el servidor:
--   1) solo quien tiene la capacidad 'autorizar' (dueño);  2) quien capturó la partida/cierre no autoriza su propio caso;
--   3) quien investigó no autoriza, salvo el dueño;       4) exige la CONTRASEÑA completa (re-autenticación), no el PIN;
--   5) causa y responsable del costo obligatorios;        6) el ajuste lo aplica el origen y el caso guarda el id del movimiento.
-- La Etapa 3 añade la pantalla y los flujos de investigación; el contrato (nombre, parámetros, reglas) queda fijado aquí.
create or replace function piefirme.ctl_autorizar_ajuste(p_caso uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('autorizar'); k piefirme.ctl_caso%rowtype; v_cap uuid; v_inv boolean; v_ok boolean; v_desde timestamptz; v_fallos integer;
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
  select coalesce(max(i.creado_en), '-infinity') into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'password' and i.exito;
  select count(*) into v_fallos from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'password' and not i.exito and i.creado_en > greatest(v_desde, now() - interval '15 minutes');
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

-- ═════════════════════════════ privilegios de ejecución ═════════════════════════════
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname like 'ctl\_%' loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
-- NADIE desde la app puede pedir un ajuste al origen directamente (solo ctl_autorizar_ajuste, que valida las reglas duras)
revoke all on function piefirme.ctl_solicitar_ajuste_origen(text, uuid, uuid, numeric, text, text, uuid, timestamptz, uuid) from public, anon, authenticated;
