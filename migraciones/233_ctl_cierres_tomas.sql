-- 233 · Control y Auditoría · ETAPA 4 · TOMAS FIJAS Y PAR CIERRE / APERTURA (F3.5).
--   · ctl_cierre_foto: única vía de foto de un cierre: valida que sea de un punto que pide foto y de una toma que aplica, y registra la evidencia
--     con la hora del servidor (reutiliza ctl_evidencia_registrar: objeto recién subido ≤ 15 min al bucket privado, hash válido, sin ruta de galería).
--   · Guía fantasma: quien captura puede firmar SOLO la última foto de cada toma fija de su sucursal (política de storage acotada), para alinear el encuadre.
--     Cualquier otra foto del bucket sigue siendo solo de dueño y supervisor.
--   · El servidor empareja la foto de cierre con la apertura siguiente (ctl_pares_toma) y genera las alertas: apertura sin cierre previo, cierre sin
--     apertura del día, apertura fotografiada después de la primera venta del día y hash idéntico (trigger de la Etapa 0, criterio 6).
-- Depende de: 200–206, 230–232.
set search_path = piefirme, piefirme_app, extensions;

-- ¿Esta ruta es la última foto de una toma fija de una sucursal a la que el usuario puede entrar?
create or replace function piefirme_app.ctl_es_guia_toma(p_ruta text) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (
    select 1 from piefirme.ctl_evidencia e
     where e.url_almacenamiento = p_ruta and e.toma_fija_id is not null and e.organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(e.sucursal_id)
       and e.id = (select x.id from piefirme.ctl_evidencia x where x.toma_fija_id = e.toma_fija_id order by x.capturado_en desc, x.seq desc limit 1))
$$;
revoke all on function piefirme_app.ctl_es_guia_toma(text) from public, anon;
grant execute on function piefirme_app.ctl_es_guia_toma(text) to authenticated;

drop policy if exists pf_stg_aud_guia on storage.objects;
create policy pf_stg_aud_guia on storage.objects for select to authenticated
  using (bucket_id = 'pf-auditoria' and (storage.foldername(name))[1] = piefirme_app.org_id()::text and (storage.foldername(name))[2] = 'ctl'
         and piefirme_app.ctl_puede('capturar') and piefirme_app.ctl_es_guia_toma(name));

-- ───────────────────────────── foto de un cierre ─────────────────────────────
create or replace function piefirme.ctl_cierre_foto(p_evidencia_id uuid, p_cierre uuid, p_punto uuid, p_ruta text, p_hash text, p_bytes integer default null, p_ancho integer default null,
                                                   p_alto integer default null, p_toma_fija uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_cierre; p piefirme.ctl_punto_control; cap piefirme.ctl_cierre_captura; v_cap uuid; v_res jsonb; v_id uuid;
        v_es_toma boolean; v_tz text; v_ini timestamptz; v_suc text;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'cierre no encontrado' using errcode = 'PF404'; end if;
  if c.usuario_cierra <> auth.uid() then raise exception 'solo quien abrió el cierre captura en él' using errcode = 'PF403'; end if;
  if c.estado <> 'en_captura' then raise exception 'el cierre ya está % y no admite fotos', c.estado using errcode = 'PF409'; end if;
  if not exists (select 1 from jsonb_array_elements(c.version_checklist) e where (e ->> 'punto_id')::uuid = p_punto) then raise exception 'ese punto no pertenece a este cierre' using errcode = 'PF422'; end if;
  select * into p from piefirme.ctl_punto_control where id = p_punto;
  if p.tipo_captura not in ('solo_foto', 'numero_y_foto') then raise exception 'este punto no pide foto' using errcode = 'PF422'; end if;
  v_es_toma := coalesce((p.parametros ->> 'toma_fija')::boolean, false);
  if v_es_toma then
    if p_toma_fija is null or not exists (select 1 from piefirme_app.ctl_tomas_aplicables(v_org, c.sucursal_id, c.tipo) t where t.id = p_toma_fija) then
      raise exception 'indique una toma fija activa de esta sucursal que aplique a este cierre' using errcode = 'PF422';
    end if;
  elsif p_toma_fija is not null then raise exception 'este punto no es de tomas fijas' using errcode = 'PF422';
  end if;
  select * into cap from piefirme.ctl_cierre_captura k where k.cierre_id = c.id and k.punto_control_id = p.id and not exists (select 1 from piefirme.ctl_cierre_captura n where n.corrige_a = k.id);
  if cap.id is null then
    if p.tipo_captura = 'numero_y_foto' then raise exception 'capture primero el valor de «%» y luego su foto', p.nombre using errcode = 'PF422'; end if;
    perform piefirme_app.ctl_rpc_on();
    insert into piefirme.ctl_cierre_captura (organizacion_id, sucursal_id, cierre_id, punto_control_id, valor_capturado, hora_cliente)
    values (v_org, c.sucursal_id, c.id, p.id, null, p_hora_cliente) returning id into v_cap;
  else
    v_cap := cap.id;
  end if;
  v_res := piefirme.ctl_evidencia_registrar(p_evidencia_id, c.sucursal_id, 'cierre_captura', v_cap, p_ruta, p_hash, p_bytes, p_ancho, p_alto, p_hora_cliente, p_toma_fija);
  v_id := (v_res ->> 'id')::uuid;
  if p_toma_fija is not null and not coalesce((v_res ->> 'duplicada')::boolean, false) then
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_toma_fija set evidencia_referencia_id = v_id where id = p_toma_fija;   -- la guía fantasma de la próxima toma
    -- apertura fotografiada después de la primera venta del día
    if c.tipo = 'apertura' and not exists (select 1 from piefirme.ctl_alerta a where a.tipo = 'apertura_tardia' and a.referencia_id = c.id) then
      select coalesce(o.zona_horaria, 'America/Mexico_City') into v_tz from piefirme.organizaciones o where o.id = v_org;
      v_ini := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
      if exists (select 1 from piefirme.ventas v where v.organizacion_id = v_org and v.sede_id = c.sucursal_id and v.cobrada_en >= v_ini and v.cobrada_en < now()) then
        select s.nombre into v_suc from piefirme.sedes s where s.id = c.sucursal_id;
        insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
        values (v_org, c.sucursal_id, 'apertura_tardia', 'alta', array['dueno', 'supervisor'],
                format('%s: la foto de apertura (%s) se tomó después de la primera venta del día.', v_suc, c.folio), 'cierre', c.id);
      end if;
    end if;
  end if;
  return v_res || jsonb_build_object('captura_id', v_cap);
end $$;

-- Guía fantasma: la última foto de una toma fija (para alinear el encuadre). Quien captura solo recibe la ruta; la firma la autoriza la política de storage.
create or replace function piefirme.ctl_toma_guia(p_toma uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); t piefirme.ctl_toma_fija; e piefirme.ctl_evidencia;
begin
  select * into t from piefirme.ctl_toma_fija where id = p_toma and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(t.sucursal_id) then raise exception 'toma fija no encontrada' using errcode = 'PF404'; end if;
  select x.* into e from piefirme.ctl_evidencia x where x.toma_fija_id = t.id order by x.capturado_en desc, x.seq desc limit 1;
  if e.id is null then return jsonb_build_object('toma', t.nombre, 'hay_guia', false); end if;
  return jsonb_build_object('toma', t.nombre, 'hay_guia', true, 'ruta', e.url_almacenamiento, 'capturado_en', e.capturado_en);
end $$;

-- ───────────────────────────── alertas del par cierre/apertura (se llama al cerrar el cierre) ─────────────────────────────
create or replace function piefirme_app.ctl_alertas_tomas(p_cierre uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.ctl_cierre; t record; v_suc text; v_tz text; v_ini timestamptz;
begin
  select * into c from piefirme.ctl_cierre where id = p_cierre;
  select s.nombre into v_suc from piefirme.sedes s where s.id = c.sucursal_id;
  if c.tipo = 'apertura' then
    for t in select distinct e.toma_fija_id as id, tf.nombre from piefirme.ctl_evidencia e join piefirme.ctl_cierre_captura k on k.id = e.origen_id and e.tipo_origen = 'cierre_captura'
               join piefirme.ctl_toma_fija tf on tf.id = e.toma_fija_id where k.cierre_id = c.id and e.toma_fija_id is not null loop
      if not exists (select 1 from piefirme.ctl_evidencia e2 join piefirme.ctl_cierre_captura k2 on k2.id = e2.origen_id and e2.tipo_origen = 'cierre_captura' join piefirme.ctl_cierre c2 on c2.id = k2.cierre_id
                      where e2.toma_fija_id = t.id and c2.tipo <> 'apertura' and c2.id <> c.id) then
        insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
        values (c.organizacion_id, c.sucursal_id, 'apertura_sin_cierre_previo', 'media', array['dueno', 'supervisor'],
                format('%s: la apertura %s tiene foto de «%s» pero no hay foto de cierre previa para compararla.', v_suc, c.folio, t.nombre), 'cierre', c.id);
      end if;
    end loop;
  elsif exists (select 1 from piefirme.ctl_evidencia e join piefirme.ctl_cierre_captura k on k.id = e.origen_id and e.tipo_origen = 'cierre_captura' where k.cierre_id = c.id and e.toma_fija_id is not null) then
    select coalesce(o.zona_horaria, 'America/Mexico_City') into v_tz from piefirme.organizaciones o where o.id = c.organizacion_id;
    v_ini := date_trunc('day', c.abierto_en at time zone v_tz) at time zone v_tz;
    if not exists (select 1 from piefirme.ctl_cierre a where a.organizacion_id = c.organizacion_id and a.sucursal_id = c.sucursal_id and a.tipo = 'apertura' and a.abierto_en >= v_ini
                      and exists (select 1 from piefirme.ctl_cierre_captura k join piefirme.ctl_evidencia e on e.origen_id = k.id and e.tipo_origen = 'cierre_captura' where k.cierre_id = a.id and e.toma_fija_id is not null)) then
      insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
      values (c.organizacion_id, c.sucursal_id, 'cierre_sin_apertura', 'media', array['dueno', 'supervisor'],
              format('%s: el cierre %s tiene fotos de tomas fijas pero hoy no hubo foto de apertura con la que emparejarlas.', v_suc, c.folio), 'cierre', c.id);
    end if;
  end if;
end $$;

-- ───────────────────────────── pares antes / después (dueño y supervisor) ─────────────────────────────
-- Una fila por foto de apertura con la foto de cierre inmediata anterior de la MISMA toma, y los cierres que no tienen apertura posterior.
create or replace function piefirme.ctl_pares_toma(p_sucursal uuid default null, p_desde timestamptz default null, p_hasta timestamptz default null, p_limite integer default 60) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  return coalesce((select jsonb_agg(q.x order by q.ord desc, q.sq desc) from (
    with ev as (
      select e.id, e.seq, e.toma_fija_id, tf.nombre as toma, e.url_almacenamiento as ruta, e.hash_sha256 as hash, e.capturado_en, e.sucursal_id, ci.id as cierre_id, ci.folio, ci.tipo as cierre_tipo,
             trim(pf.nombre || ' ' || coalesce(pf.apellidos, '')) as usuario
        from piefirme.ctl_evidencia e
        join piefirme.ctl_cierre_captura k on k.id = e.origen_id and e.tipo_origen = 'cierre_captura'
        join piefirme.ctl_cierre ci on ci.id = k.cierre_id
        join piefirme.ctl_toma_fija tf on tf.id = e.toma_fija_id
        left join piefirme.perfiles pf on pf.id = e.usuario_id
       where e.organizacion_id = v_org and piefirme_app.puede_sede(e.sucursal_id) and (p_sucursal is null or e.sucursal_id = p_sucursal) and e.toma_fija_id is not null),
    ap as (select * from ev where cierre_tipo = 'apertura' and (p_desde is null or capturado_en >= p_desde) and (p_hasta is null or capturado_en <= p_hasta)),
    cr as (select * from ev where cierre_tipo <> 'apertura')
    select jsonb_build_object('estado', case when p.id is null then 'sin_cierre_previo' else 'par' end, 'toma_id', a.toma_fija_id, 'toma', a.toma, 'sucursal_id', a.sucursal_id,
             'apertura', jsonb_build_object('evidencia_id', a.id, 'ruta', a.ruta, 'capturado_en', a.capturado_en, 'folio', a.folio, 'usuario', a.usuario),
             'cierre', case when p.id is null then null else jsonb_build_object('evidencia_id', p.id, 'ruta', p.ruta, 'capturado_en', p.capturado_en, 'folio', p.folio, 'usuario', p.usuario) end,
             'hash_igual', coalesce(p.hash = a.hash, false),
             'apertura_tardia', exists (select 1 from piefirme.ctl_alerta al where al.organizacion_id = v_org and al.tipo = 'apertura_tardia' and al.referencia_id = a.cierre_id)) as x,
           a.capturado_en as ord, a.seq as sq
      from ap a
      left join lateral (select c.* from cr c where c.toma_fija_id = a.toma_fija_id and (c.capturado_en, c.seq) < (a.capturado_en, a.seq) order by c.capturado_en desc, c.seq desc limit 1) p on true
    union all
    select jsonb_build_object('estado', case when c.capturado_en > now() - interval '20 hours' then 'pendiente_apertura' else 'sin_apertura' end, 'toma_id', c.toma_fija_id, 'toma', c.toma, 'sucursal_id', c.sucursal_id,
             'apertura', null, 'cierre', jsonb_build_object('evidencia_id', c.id, 'ruta', c.ruta, 'capturado_en', c.capturado_en, 'folio', c.folio, 'usuario', c.usuario),
             'hash_igual', false, 'apertura_tardia', false), c.capturado_en, c.seq
      from cr c
     where (p_desde is null or c.capturado_en >= p_desde) and (p_hasta is null or c.capturado_en <= p_hasta)
       and not exists (select 1 from ev a2 where a2.cierre_tipo = 'apertura' and a2.toma_fija_id = c.toma_fija_id and (a2.capturado_en, a2.seq) > (c.capturado_en, c.seq))
    order by 2 desc limit least(greatest(coalesce(p_limite, 60), 1), 300)) q), '[]'::jsonb);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_cierre_foto', 'ctl_toma_guia', 'ctl_alertas_tomas', 'ctl_pares_toma') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
