-- 024 · Portal público (el paciente NO tiene cuenta): configuración del portal por clínica, ligas de cita de un solo uso,
-- limitación de tasa, disponibilidad de horarios y RPC security definer piefirme.portal_* mínimas y con límites.
-- Reglas: P-034, P-036..P-038, P-041, P-048, P-049, P-134. Estados: MODELO_ESTADOS S02, S03, S04. MATRIZ_ROLES §6.
-- Nada de esto da acceso a anon sobre tablas: anon solo ejecuta las funciones portal_* (devuelven lo mínimo y no leen datos de otros pacientes).
-- Dependencias: 001, 010, 020..023.

-- ───────────────────────────── configuración del portal por clínica ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.organizaciones_portal (
  organizacion_id    uuid primary key references piefirme.organizaciones(id) on delete cascade,
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),    -- piefirme.rannix.com/c/{slug}
  activo             boolean not null default false,                                      -- apagado hasta que la clínica publique
  titulo             text,
  mensaje_bienvenida text,
  whatsapp_url       text,
  sedes_visibles     uuid[] not null default '{}',                                        -- vacío = todas las sedes activas
  antibots_proveedor text,                                                                -- por definir (sin llave real)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table piefirme.portal_podologos (
  perfil_id        uuid primary key references piefirme.perfiles(id) on delete cascade,
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  visible          boolean not null default false,       -- casilla «visible en portal» (P-134)
  nombre_publico   text,
  resumen          text,
  foto_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.portal_podologos (organizacion_id, visible);

-- ───────────────────────────── ligas de cita (E59): token largo de un solo uso, vence a la hora de la cita ─────────────────────────────
create table piefirme.ligas_cita (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  cita_id          uuid not null references piefirme.citas(id) on delete cascade,
  token_hash       text not null unique,                 -- sha256 del token; el token en claro solo viaja en el correo/mensaje
  estado           text not null default 'activa' check (estado in ('activa', 'usada', 'expirada', 'revocada')),
  vence_en         timestamptz not null,
  accion           text check (accion in ('confirmar', 'reprogramar', 'cancelar')),
  usada_en         timestamptz,
  nuevo_inicio     timestamptz,
  created_at       timestamptz not null default now()
);
create index on piefirme.ligas_cita (organizacion_id, cita_id, estado);

-- ───────────────────────────── limitación de tasa (P-049) ─────────────────────────────
create table piefirme.portal_intentos (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null,
  clave            text not null,                        -- sha256(org:ip|celular|…); nunca el dato en claro
  accion           text not null,
  created_at       timestamptz not null default now()
);
create index on piefirme.portal_intentos (organizacion_id, clave, accion, created_at desc);
alter table piefirme.portal_intentos enable row level security;       -- sin políticas: solo funciones definer

create or replace function piefirme_app.ip_cliente() returns text language plpgsql stable as $$
declare v text;
begin
  begin
    v := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then v := null; end;
  return coalesce(v, 'sin-ip');
end $$;

create or replace function piefirme_app.agente_cliente() returns text language plpgsql stable as $$
declare v text;
begin
  begin v := left(current_setting('request.headers', true)::json ->> 'user-agent', 300);
  exception when others then v := null; end;
  return v;
end $$;

create or replace function piefirme_app.limite_tasa(p_org uuid, p_clave text, p_accion text, p_max integer, p_ventana interval) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_k text := encode(sha256(convert_to(p_org::text || ':' || coalesce(p_clave, ''), 'UTF8')), 'hex'); v_n integer;
begin
  insert into piefirme.portal_intentos (organizacion_id, clave, accion) values (p_org, v_k, p_accion);
  select count(*) into v_n from piefirme.portal_intentos
   where organizacion_id = p_org and clave = v_k and accion = p_accion and created_at > now() - p_ventana;
  if v_n > p_max then raise exception 'demasiadas solicitudes; intente más tarde' using errcode = 'PF429'; end if;
  if random() < 0.02 then delete from piefirme.portal_intentos where created_at < now() - interval '2 days'; end if;
end $$;

create or replace function piefirme_app.portal_org(p_slug text) returns uuid
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v uuid;
begin
  select op.organizacion_id into v from piefirme.organizaciones_portal op
    join piefirme.organizaciones o on o.id = op.organizacion_id
   where op.slug = lower(btrim(p_slug)) and op.activo and o.estado in ('prueba', 'activa');
  if v is null then raise exception 'clinica_no_disponible' using errcode = 'PF404'; end if;
  return v;
end $$;

create or replace function piefirme_app.hash_token(p_token text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;
create or replace function piefirme_app.token_nuevo() returns text
language sql volatile as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

-- Anticipo del portal: 30 % del precio de lista (o monto fijo del servicio); sin anticipo si es «a valorar», curación incluida o $0 (P-034)
create or replace function piefirme_app.anticipo_servicio(p_org uuid, p_servicio uuid, p_precio numeric) returns numeric
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s piefirme.servicios%rowtype;
begin
  select * into s from piefirme.servicios where id = p_servicio and organizacion_id = p_org;
  if not found or s.tipo_precio in ('a_valorar', 'gratis') or s.es_curacion_incluida or coalesce(p_precio, 0) <= 0 then return 0; end if;
  return least(coalesce(s.anticipo_monto_fijo, round(p_precio * piefirme_app.param_num(p_org, 'anticipo_portal_pct', 30) / 100, 2)), p_precio);
end $$;

-- ───────────────────────────── liga de cita: emisión ─────────────────────────────
create or replace function piefirme_app.emitir_liga(p_cita uuid) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.citas%rowtype; v_tok text := piefirme_app.token_nuevo();
begin
  select * into c from piefirme.citas where id = p_cita;
  if not found then raise exception 'cita inexistente' using errcode = 'PF404'; end if;
  update piefirme.ligas_cita set estado = 'revocada' where cita_id = p_cita and estado = 'activa';
  insert into piefirme.ligas_cita (organizacion_id, cita_id, token_hash, vence_en) values (c.organizacion_id, c.id, piefirme_app.hash_token(v_tok), c.inicio);
  return v_tok;
end $$;

-- Para Recepción/Administrador: nueva liga (confirmar / reprogramar / cancelar) para enviarla al paciente.
create or replace function piefirme.generar_liga_cita(p_cita uuid) returns text
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.citas where id = p_cita) then raise exception 'cita inexistente o fuera de alcance' using errcode = 'PF404'; end if;
  return piefirme_app.emitir_liga(p_cita);
end $$;

-- ───────────────────────────── horarios disponibles ─────────────────────────────
-- Genera los inicios posibles de un servicio en una sede, respetando horario del podólogo, festivos, bloqueos, citas, retenciones y margen.
create or replace function piefirme_app.slots_disponibles(
  p_org uuid, p_sede uuid, p_servicio uuid, p_podologo uuid, p_desde date, p_hasta date, p_tipo text default 'presencial')
returns table (podologo_id uuid, cabina_id uuid, inicio timestamptz, fin timestamptz, carga integer)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_tz text := piefirme_app.zona_org(p_org);
  v_dur integer; v_paso integer := piefirme_app.param_num(p_org, 'paso_agenda_min', 15)::int;
  d date; h record; cab record; v_t timestamptz; v_lim timestamptz; v_fin timestamptz; v_conf text; v_cab uuid; v_carga integer; v_hay_cab boolean;
begin
  select duracion_min into v_dur from piefirme.servicios where id = p_servicio and organizacion_id = p_org;
  if v_dur is null then return; end if;
  select exists (select 1 from piefirme.cabinas where sede_id = p_sede and activa) into v_hay_cab;
  for d in select g::date from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') g loop
    if exists (select 1 from piefirme.festivos f where f.organizacion_id = p_org and f.fecha = d and not f.abre and (f.sede_id is null or f.sede_id = p_sede)) then
      continue;
    end if;
    for h in select ha.* from piefirme.horarios_atencion ha
               join piefirme.perfiles pf on pf.id = ha.podologo_id and pf.activo
              where ha.organizacion_id = p_org and ha.sede_id = p_sede and ha.activo and ha.podologo_id is not null
                and (p_podologo is null or ha.podologo_id = p_podologo)
                and ha.dia_semana = extract(isodow from d)
                and ha.vigente_desde <= d and (ha.vigente_hasta is null or ha.vigente_hasta >= d)
              order by ha.hora_inicio loop
      v_t := (d + h.hora_inicio) at time zone v_tz;
      v_lim := (d + h.hora_fin) at time zone v_tz;
      select count(*) into v_carga from piefirme.citas c
       where c.organizacion_id = p_org and c.podologo_id = h.podologo_id and c.estado in ('por_confirmar', 'confirmada', 'en_camino', 'atendida')
         and (c.inicio at time zone v_tz)::date = d;
      while v_t + make_interval(mins => v_dur) <= v_lim loop
        v_fin := v_t + make_interval(mins => v_dur);
        if v_t > now() then
          v_conf := piefirme_app.conflicto_agenda(p_org, p_sede, h.podologo_id, null, v_t, v_fin, 0, 0);
          if v_conf is null then
            v_cab := null;
            if p_tipo = 'presencial' and v_hay_cab then
              for cab in select c2.id from piefirme.cabinas c2 where c2.sede_id = p_sede and c2.activa order by c2.nombre loop
                if piefirme_app.conflicto_agenda(p_org, p_sede, h.podologo_id, cab.id, v_t, v_fin, 0, 0) is null then v_cab := cab.id; exit; end if;
              end loop;
            end if;
            if v_cab is not null or p_tipo <> 'presencial' or not v_hay_cab then
              podologo_id := h.podologo_id; cabina_id := v_cab; inicio := v_t; fin := v_fin; carga := v_carga;
              return next;
            end if;
          end if;
        end if;
        v_t := v_t + make_interval(mins => v_paso);
      end loop;
    end loop;
  end loop;
end $$;

-- Para el personal (agenda interna): misma lógica, acotada a su clínica.
create or replace function piefirme.disponibilidad(p_sede uuid, p_servicio uuid, p_podologo uuid, p_desde date, p_hasta date, p_tipo text default 'presencial')
returns table (podologo_id uuid, cabina_id uuid, inicio timestamptz, fin timestamptz, carga integer)
language plpgsql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if piefirme_app.org_id() is null or not piefirme_app.puede_sede(p_sede) then raise exception 'sin acceso a la sede' using errcode = 'PF403'; end if;
  if p_hasta - p_desde > 31 then raise exception 'ventana máxima de 31 días' using errcode = 'PF400'; end if;
  return query select * from piefirme_app.slots_disponibles(piefirme_app.org_id(), p_sede, p_servicio, p_podologo, p_desde, p_hasta, p_tipo);
end $$;

-- «Cualquiera disponible» (P-048): primer horario libre; desempate por menor carga del día.
create or replace function piefirme_app.slots_mejor_por_inicio(
  p_org uuid, p_sede uuid, p_servicio uuid, p_podologo uuid, p_desde date, p_hasta date, p_tipo text default 'presencial')
returns table (podologo_id uuid, cabina_id uuid, inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select distinct on (s.inicio) s.podologo_id, s.cabina_id, s.inicio, s.fin
    from piefirme_app.slots_disponibles(p_org, p_sede, p_servicio, p_podologo, p_desde, p_hasta, p_tipo) s
   order by s.inicio, s.carga, s.podologo_id
$$;

-- ───────────────────────────── finalización de una reserva (alta de paciente + cita + consentimientos + liga) ─────────────────────────────
create or replace function piefirme_app.finalizar_reserva(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  r piefirme.reservas_portal%rowtype; sv piefirme.servicios%rowtype; v_pac uuid; v_cita piefirme.citas%rowtype; v_liga text;
  v_pat text; v_mat text; v_cel text; v_det text; k text; v_ok boolean; v_conf text; v_pl uuid;
begin
  select * into r from piefirme.reservas_portal where id = p_reserva for update;
  if not found then raise exception 'reserva inexistente' using errcode = 'PF404'; end if;
  if r.estado = 'confirmada' then
    return jsonb_build_object('estado', 'confirmada', 'cita_id', r.cita_id, 'paciente_id', r.paciente_id);
  end if;
  -- si la retención venció, solo se confirma si el horario sigue libre
  v_conf := piefirme_app.conflicto_agenda(r.organizacion_id, r.sede_id, r.podologo_id, r.cabina_id, r.inicio, r.fin, 0, 0, null, r.id);
  if v_conf is not null then
    update piefirme.reservas_portal set estado = 'horario_no_disponible', motivo_estado = v_conf where id = r.id;
    return jsonb_build_object('estado', 'horario_no_disponible', 'motivo', v_conf);
  end if;
  select * into sv from piefirme.servicios where id = r.servicio_id;

  -- paciente: alta o coincidencia (P-006: nombre completo + fecha de nacimiento)
  v_cel := regexp_replace(r.celular, '[^0-9+]', '', 'g');
  v_pat := split_part(btrim(r.apellidos), ' ', 1);
  v_mat := nullif(btrim(substr(btrim(r.apellidos), length(v_pat) + 1)), '');
  begin
    insert into piefirme.pacientes (organizacion_id, sede_registro_id, nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento,
                                  telefono_celular, email, origen_registro, alta_rapida, acepta_recordatorios, canal_origen)
    values (r.organizacion_id, r.sede_id, r.nombre, v_pat, v_mat, r.sexo, r.fecha_nacimiento, v_cel, lower(r.correo), 'portal', false,
            coalesce((r.consentimientos -> 'comunicaciones_recordatorios' ->> 'aceptado')::boolean, true), 'portal')
    returning id into v_pac;
  exception when others then
    if sqlerrm = 'posible_duplicado' then
      get stacked diagnostics v_det = pg_exception_detail;
      v_pac := v_det::uuid;
    else
      raise;
    end if;
  end;

  -- cita confirmada con precio congelado (P-068) y retención liberada
  insert into piefirme.citas (organizacion_id, sede_id, paciente_id, servicio_id, podologo_id, cabina_id, inicio, fin, duracion_min, tipo_atencion,
                            estado, origen, primera_vez, motivo_consulta, precio_servicio, anticipo_requerido, reserva_portal_id, sede_atribucion_id)
  values (r.organizacion_id, r.sede_id, v_pac, r.servicio_id, r.podologo_id, r.cabina_id, r.inicio, r.fin, sv.duracion_min, r.tipo_atencion,
          'confirmada', 'portal', r.primera_vez, r.motivo_consulta, r.precio, r.anticipo_monto, r.id, r.sede_id)
  returning * into v_cita;

  update piefirme.reservas_portal set estado = 'confirmada', cita_id = v_cita.id, paciente_id = v_pac, retenido_hasta = null where id = r.id;

  -- consentimientos aceptados en el portal (evidencia: versión, IP, dispositivo)
  for k in select jsonb_object_keys(r.consentimientos) loop
    if k in ('aviso_privacidad', 'terminos_reserva', 'comunicaciones_recordatorios', 'comunicaciones_promociones', 'fotos_clinicas') then
      v_ok := coalesce((r.consentimientos -> k ->> 'aceptado')::boolean, false);
      select pd.id into v_pl from piefirme.plantillas_documento pd
       where pd.organizacion_id = r.organizacion_id and pd.estado = 'activa'
         and pd.tipo = case k when 'aviso_privacidad' then 'aviso_privacidad' when 'terminos_reserva' then 'terminos_reserva'
                             when 'fotos_clinicas' then 'autorizacion_fotos' else 'recordatorio_cita' end
       limit 1;
      insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, plantilla_id, aceptado, canal, ip, dispositivo, cita_id, estado)
      values (r.organizacion_id, v_pac, k, v_pl, v_ok, 'portal', r.ip, r.dispositivo, v_cita.id, 'firmado');
    end if;
  end loop;

  -- datos fiscales solicitados en la reserva (solo si son válidos; los de un CFDI se congelan en el comprobante, P-066)
  if r.requiere_factura and r.datos_fiscales is not null and upper(coalesce(r.datos_fiscales ->> 'rfc', '')) ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
     and coalesce(r.datos_fiscales ->> 'razon_social', '') <> '' and coalesce(r.datos_fiscales ->> 'regimen_fiscal', '') <> ''
     and coalesce(r.datos_fiscales ->> 'codigo_postal', '') <> '' and coalesce(r.datos_fiscales ->> 'uso_cfdi', '') <> '' then
    insert into piefirme.datos_fiscales_paciente (organizacion_id, paciente_id, rfc, razon_social, regimen_fiscal, codigo_postal_fiscal, uso_cfdi, email_factura)
    values (r.organizacion_id, v_pac, upper(r.datos_fiscales ->> 'rfc'), r.datos_fiscales ->> 'razon_social', r.datos_fiscales ->> 'regimen_fiscal',
            r.datos_fiscales ->> 'codigo_postal', r.datos_fiscales ->> 'uso_cfdi', coalesce(r.datos_fiscales ->> 'correo', lower(r.correo)));
  end if;

  v_liga := piefirme_app.emitir_liga(v_cita.id);
  return jsonb_build_object('estado', 'confirmada', 'cita_id', v_cita.id, 'folio', v_cita.folio, 'paciente_id', v_pac,
                            'liga_token', v_liga, 'inicio', v_cita.inicio);
end $$;

-- ═════════════════ RPC PÚBLICAS (anon): portal_* ═════════════════

-- 1) Catálogo publicado: sedes, servicios con precio y anticipo, podólogos visibles (nada de datos de pacientes).
create or replace function piefirme.portal_catalogo(p_slug text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.portal_org(p_slug); op piefirme.organizaciones_portal%rowtype; v jsonb;
begin
  perform piefirme_app.limite_tasa(v_org, piefirme_app.ip_cliente(), 'catalogo', (piefirme_app.param_num(v_org, 'portal_limite_ip_hora', 60) * 2)::int, interval '1 hour');
  select * into op from piefirme.organizaciones_portal where organizacion_id = v_org;
  select jsonb_build_object(
    'clinica', (select jsonb_build_object('nombre', o.nombre, 'zona_horaria', o.zona_horaria, 'logo_url', o.logo_url,
                                           'titulo', op.titulo, 'mensaje', op.mensaje_bienvenida, 'whatsapp_url', op.whatsapp_url)
                  from piefirme.organizaciones o where o.id = v_org),
    'sedes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'clave', s.clave, 'nombre', s.nombre, 'direccion', s.direccion,
                                                            'telefono', s.telefono, 'horario', s.horario) order by s.nombre)
                         from piefirme.sedes s
                        where s.organizacion_id = v_org and s.activa and (cardinality(op.sedes_visibles) = 0 or s.id = any (op.sedes_visibles))), '[]'::jsonb),
    'servicios', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', sv.id, 'nombre', sv.nombre, 'categoria', sv.categoria, 'descripcion', sv.descripcion_publica,
                    'duracion_min', sv.duracion_min, 'tipo_precio', sv.tipo_precio, 'unidad_cobro', sv.unidad_cobro,
                    'precio', piefirme_app.precio_servicio(v_org, sv.id, null),
                    'precios_sede', coalesce((select jsonb_object_agg(pr.sede_id::text, pr.precio) from piefirme.precios pr
                                               where pr.servicio_id = sv.id and pr.sede_id is not null and pr.vigente_desde <= piefirme_app.hoy_org(v_org)
                                                 and (pr.vigente_hasta is null or pr.vigente_hasta >= piefirme_app.hoy_org(v_org))), '{}'::jsonb),
                    'anticipo', piefirme_app.anticipo_servicio(v_org, sv.id, piefirme_app.precio_servicio(v_org, sv.id, null)),
                    'admite_videoconsulta', sv.admite_videoconsulta) order by sv.categoria, sv.nombre)
                    from piefirme.servicios sv
                   where sv.organizacion_id = v_org and sv.estado = 'activo' and sv.visible_portal), '[]'::jsonb),
    'podologos', coalesce((select jsonb_agg(jsonb_build_object('id', pp.perfil_id, 'nombre', coalesce(pp.nombre_publico, pf.nombre || ' ' || coalesce(pf.apellidos, '')),
                                                                'cedula', pf.cedula, 'resumen', pp.resumen, 'foto_url', pp.foto_url, 'sedes', to_jsonb(pf.sedes)))
                             from piefirme.portal_podologos pp join piefirme.perfiles pf on pf.id = pp.perfil_id and pf.activo
                            where pp.organizacion_id = v_org and pp.visible), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- 2) Disponibilidad: solo horarios libres (sin datos de otros pacientes). «Cualquiera disponible» = p_podologo null.
create or replace function piefirme.portal_disponibilidad(p_slug text, p_sede uuid, p_servicio uuid, p_podologo uuid, p_desde date, p_hasta date, p_tipo text default 'presencial')
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.portal_org(p_slug); v_max integer := piefirme_app.param_num(piefirme_app.portal_org(p_slug), 'portal_ventana_max_dias', 14)::int; v jsonb;
begin
  perform piefirme_app.limite_tasa(v_org, piefirme_app.ip_cliente(), 'disponibilidad', (piefirme_app.param_num(v_org, 'portal_limite_ip_hora', 60) * 2)::int, interval '1 hour');
  if p_tipo not in ('presencial', 'videoconsulta') then raise exception 'tipo de atención no disponible en el portal' using errcode = 'PF400'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > v_max then
    raise exception 'ventana de fechas inválida (máximo % días)', v_max using errcode = 'PF400';
  end if;
  if not exists (select 1 from piefirme.servicios sv where sv.id = p_servicio and sv.organizacion_id = v_org and sv.estado = 'activo' and sv.visible_portal)
     or not exists (select 1 from piefirme.sedes s where s.id = p_sede and s.organizacion_id = v_org and s.activa) then
    raise exception 'servicio o sede no disponible' using errcode = 'PF404';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('inicio', x.inicio, 'fin', x.fin, 'podologo_id', x.podologo_id) order by x.inicio), '[]'::jsonb)
    into v
    from (select * from piefirme_app.slots_mejor_por_inicio(v_org, p_sede, p_servicio, p_podologo, p_desde, p_hasta, p_tipo) limit 400) x;
  return v;
end $$;

-- 3) Retener horario y registrar al solicitante. Sin anticipo: confirma de inmediato. Con anticipo: queda retenido N min (P-036).
create or replace function piefirme.portal_retener_horario(
  p_slug text, p_sede uuid, p_servicio uuid, p_podologo uuid, p_inicio timestamptz, p_tipo text, p_datos jsonb, p_consentimientos jsonb)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.portal_org(p_slug); v_ip text := piefirme_app.ip_cliente(); sv piefirme.servicios%rowtype; s record;
  v_cel text; v_correo text; v_nac date; v_precio numeric; v_ant numeric; v_tok text := piefirme_app.token_nuevo(); v_id uuid := gen_random_uuid();
  v_n integer; v_ret integer; v_fin jsonb;
begin
  if p_tipo not in ('presencial', 'videoconsulta') then raise exception 'tipo de atención no disponible en el portal' using errcode = 'PF400'; end if;
  perform piefirme_app.limite_tasa(v_org, v_ip, 'reservar', piefirme_app.param_num(v_org, 'portal_limite_reservas_ip_hora', 10)::int, interval '1 hour');
  -- datos mínimos obligatorios (P-003 / mockup 26) y consentimientos obligatorios
  if coalesce(btrim(p_datos ->> 'nombre'), '') = '' or coalesce(btrim(p_datos ->> 'apellidos'), '') = ''
     or coalesce(p_datos ->> 'fecha_nacimiento', '') = '' or coalesce(p_datos ->> 'celular', '') = '' or coalesce(p_datos ->> 'correo', '') = '' then
    raise exception 'faltan datos obligatorios (nombre, apellidos, nacimiento, celular, correo)' using errcode = 'PF400';
  end if;
  begin v_nac := (p_datos ->> 'fecha_nacimiento')::date; exception when others then raise exception 'fecha de nacimiento inválida' using errcode = 'PF400'; end;
  if v_nac > current_date then raise exception 'fecha de nacimiento inválida' using errcode = 'PF400'; end if;
  v_cel := regexp_replace(p_datos ->> 'celular', '[^0-9+]', '', 'g');
  v_correo := lower(btrim(p_datos ->> 'correo'));
  if length(regexp_replace(v_cel, '[^0-9]', '', 'g')) < 10 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'celular o correo inválidos' using errcode = 'PF400';
  end if;
  if not coalesce((p_consentimientos -> 'aviso_privacidad' ->> 'aceptado')::boolean, false)
     or not coalesce((p_consentimientos -> 'terminos_reserva' ->> 'aceptado')::boolean, false) then
    raise exception 'debe aceptar el aviso de privacidad y los términos' using errcode = 'PF400';
  end if;
  perform piefirme_app.limite_tasa(v_org, v_cel, 'reservar_celular', piefirme_app.param_num(v_org, 'portal_limite_reservas_celular_dia', 5)::int, interval '1 day');
  -- máximo 3 reservas futuras activas por celular o correo (P-049)
  select count(*) into v_n from piefirme.reservas_portal r
   where r.organizacion_id = v_org and (r.celular = v_cel or lower(r.correo) = v_correo)
     and ((r.estado = 'retenido' and r.retenido_hasta > now())
          or (r.estado = 'confirmada' and exists (select 1 from piefirme.citas c where c.id = r.cita_id and c.inicio > now() and c.estado in ('por_confirmar', 'confirmada'))));
  if v_n >= piefirme_app.param_num(v_org, 'portal_max_reservas_futuras', 3) then
    raise exception 'limite_reservas: ya tiene el máximo de reservas futuras activas' using errcode = 'PF429';
  end if;
  -- servicio / sede publicados
  select * into sv from piefirme.servicios where id = p_servicio and organizacion_id = v_org and estado = 'activo' and visible_portal;
  if not found or not exists (select 1 from piefirme.sedes x where x.id = p_sede and x.organizacion_id = v_org and x.activa) then
    raise exception 'servicio o sede no disponible' using errcode = 'PF404';
  end if;
  if p_tipo = 'videoconsulta' and not sv.admite_videoconsulta then raise exception 'el servicio no admite videoconsulta' using errcode = 'PF409'; end if;
  -- el horario debe seguir libre (la primera confirmación gana, P-037)
  select * into s from piefirme_app.slots_mejor_por_inicio(v_org, p_sede, p_servicio, p_podologo, (p_inicio at time zone piefirme_app.zona_org(v_org))::date,
                                                  (p_inicio at time zone piefirme_app.zona_org(v_org))::date, p_tipo) m
   where m.inicio = p_inicio;
  if not found then raise exception 'horario_no_disponible' using errcode = 'PF409'; end if;
  v_precio := coalesce(piefirme_app.precio_servicio(v_org, sv.id, p_sede), 0);
  v_ant := piefirme_app.anticipo_servicio(v_org, sv.id, v_precio);
  begin
    insert into piefirme.reservas_portal (id, organizacion_id, sede_id, servicio_id, podologo_id, cabina_id, inicio, fin, tipo_atencion, estado, retenido_hasta, token_hash,
                                        precio, anticipo_monto, saldo, nombre, apellidos, fecha_nacimiento, sexo, celular, correo, primera_vez, motivo_consulta,
                                        tutor, requiere_factura, datos_fiscales, consentimientos, ip, dispositivo)
    values (v_id, v_org, p_sede, sv.id, s.podologo_id, s.cabina_id, s.inicio, s.fin, p_tipo, 'retenido',
            now() + make_interval(mins => piefirme_app.param_num(v_org, 'retencion_horario_min', 10)::int), piefirme_app.hash_token(v_tok),
            v_precio, v_ant, v_precio - v_ant, btrim(p_datos ->> 'nombre'), btrim(p_datos ->> 'apellidos'), v_nac,
            nullif(p_datos ->> 'sexo', ''), v_cel, v_correo, coalesce((p_datos ->> 'primera_vez')::boolean, false), nullif(left(p_datos ->> 'motivo_consulta', 500), ''),
            p_datos -> 'tutor', coalesce((p_datos ->> 'requiere_factura')::boolean, false), p_datos -> 'datos_fiscales',
            coalesce(p_consentimientos, '{}'::jsonb), v_ip, piefirme_app.agente_cliente());
  exception when sqlstate 'PF409' then
    raise exception 'horario_no_disponible' using errcode = 'PF409';
  end;
  if v_ant = 0 then
    v_fin := piefirme_app.finalizar_reserva(v_id);
    return jsonb_build_object('reserva_id', v_id, 'token_reserva', v_tok, 'estado', v_fin ->> 'estado', 'requiere_pago', false,
                              'precio', v_precio, 'anticipo', 0, 'saldo', v_precio, 'cita_folio', v_fin ->> 'folio', 'liga_token', v_fin ->> 'liga_token');
  end if;
  return jsonb_build_object('reserva_id', v_id, 'token_reserva', v_tok, 'estado', 'retenido', 'requiere_pago', true,
                            'retenido_hasta', now() + make_interval(mins => piefirme_app.param_num(v_org, 'retencion_horario_min', 10)::int),
                            'precio', v_precio, 'anticipo', v_ant, 'saldo', v_precio - v_ant);
end $$;

-- 4) Estado de la reserva (para la pantalla de pago). Solo con el token de la reserva.
create or replace function piefirme.portal_estado_reserva(p_slug text, p_reserva uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.portal_org(p_slug); r piefirme.reservas_portal%rowtype;
begin
  perform piefirme_app.limite_tasa(v_org, piefirme_app.ip_cliente(), 'estado_reserva', 120, interval '1 hour');
  select * into r from piefirme.reservas_portal where id = p_reserva and organizacion_id = v_org and token_hash = piefirme_app.hash_token(p_token);
  if not found then raise exception 'reserva no encontrada' using errcode = 'PF404'; end if;
  return jsonb_build_object('estado', case when r.estado = 'retenido' and r.retenido_hasta <= now() then 'vencida' else r.estado end,
                            'retenido_hasta', r.retenido_hasta, 'anticipo', r.anticipo_monto, 'saldo', r.saldo,
                            'folio', (select c.folio from piefirme.citas c where c.id = r.cita_id));
end $$;

-- 5) Ver la cita desde la liga (confirmar / reprogramar / cancelar): solo lo de ESA cita.
create or replace function piefirme.portal_ver_cita(p_token text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l piefirme.ligas_cita%rowtype; c piefirme.citas%rowtype; v_horas numeric; v_aviso int; v_max int; v_ant record;
begin
  select * into l from piefirme.ligas_cita where token_hash = piefirme_app.hash_token(p_token);
  if not found then
    -- sin organización conocida: limitación global por IP para frenar adivinanza de tokens
    perform piefirme_app.limite_tasa('00000000-0000-0000-0000-000000000000'::uuid, piefirme_app.ip_cliente(), 'liga_invalida', 20, interval '1 hour');
    return jsonb_build_object('valida', false, 'motivo', 'liga_no_encontrada');
  end if;
  perform piefirme_app.limite_tasa(l.organizacion_id, piefirme_app.ip_cliente(), 'liga', 60, interval '1 hour');
  if l.estado = 'activa' and l.vence_en <= now() then
    update piefirme.ligas_cita set estado = 'expirada' where id = l.id; l.estado := 'expirada';
  end if;
  if l.estado <> 'activa' then return jsonb_build_object('valida', false, 'motivo', case l.estado when 'expirada' then 'liga_vencida' when 'usada' then 'liga_usada' else 'liga_revocada' end); end if;
  select * into c from piefirme.citas where id = l.cita_id;
  v_aviso := piefirme_app.param_num(c.organizacion_id, 'cancelacion_horas_aviso', 48)::int;
  v_max := piefirme_app.param_num(c.organizacion_id, 'reprogramaciones_max', 2)::int;
  v_horas := extract(epoch from (c.inicio - now())) / 3600;
  select a.monto, a.estado into v_ant from piefirme.anticipos a where a.cita_id = c.id order by a.created_at desc limit 1;
  return jsonb_build_object(
    'valida', true, 'estado', c.estado, 'folio', c.folio, 'inicio', c.inicio, 'fin', c.fin, 'zona_horaria', piefirme_app.zona_org(c.organizacion_id),
    'servicio', (select nombre from piefirme.servicios where id = c.servicio_id),
    'podologo', (select btrim(nombre || ' ' || coalesce(apellidos, '')) from piefirme.perfiles where id = c.podologo_id),
    'sede', (select jsonb_build_object('nombre', s.nombre, 'direccion', s.direccion, 'telefono', s.telefono) from piefirme.sedes s where s.id = c.sede_id),
    'tipo_atencion', c.tipo_atencion, 'anticipo', coalesce(v_ant.monto, 0), 'anticipo_estado', v_ant.estado,
    'puede_confirmar', c.estado = 'por_confirmar',
    'puede_cancelar', c.estado in ('por_confirmar', 'confirmada'),
    'cancelacion_reembolsa', v_horas >= v_aviso,
    'puede_reprogramar', c.estado in ('por_confirmar', 'confirmada') and v_horas >= v_aviso and c.reprogramaciones < v_max,
    'reprogramaciones_restantes', greatest(v_max - c.reprogramaciones, 0),
    'horas_de_aviso_requeridas', v_aviso);
end $$;

-- 6) Confirmar / cancelar / reprogramar con la liga. Cada liga sirve para UNA acción; si la cita sigue viva se devuelve una liga nueva.
create or replace function piefirme.portal_accion_cita(p_token text, p_accion text, p_nuevo_inicio timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  l piefirme.ligas_cita%rowtype; c piefirme.citas%rowtype; v_horas numeric; v_aviso int; v_max int; s record; v_nueva text; v_reemb boolean := false;
begin
  if p_accion not in ('confirmar', 'cancelar', 'reprogramar') then raise exception 'acción inválida' using errcode = 'PF400'; end if;
  select * into l from piefirme.ligas_cita where token_hash = piefirme_app.hash_token(p_token) for update;
  if not found then
    perform piefirme_app.limite_tasa('00000000-0000-0000-0000-000000000000'::uuid, piefirme_app.ip_cliente(), 'liga_invalida', 20, interval '1 hour');
    raise exception 'liga_no_encontrada' using errcode = 'PF404';
  end if;
  perform piefirme_app.limite_tasa(l.organizacion_id, piefirme_app.ip_cliente(), 'liga_accion', 30, interval '1 hour');
  if l.estado <> 'activa' or l.vence_en <= now() then
    if l.estado = 'activa' then update piefirme.ligas_cita set estado = 'expirada' where id = l.id; end if;
    raise exception 'liga_vencida: llame a la sede' using errcode = 'PF410';
  end if;
  select * into c from piefirme.citas where id = l.cita_id for update;
  v_aviso := piefirme_app.param_num(c.organizacion_id, 'cancelacion_horas_aviso', 48)::int;
  v_max := piefirme_app.param_num(c.organizacion_id, 'reprogramaciones_max', 2)::int;
  v_horas := extract(epoch from (c.inicio - now())) / 3600;

  if p_accion = 'confirmar' then
    if c.estado not in ('por_confirmar', 'confirmada') then raise exception 'la cita no admite confirmación (%)', c.estado using errcode = 'PF409'; end if;
    if c.estado = 'por_confirmar' then update piefirme.citas set estado = 'confirmada' where id = c.id; end if;
  elsif p_accion = 'cancelar' then
    if c.estado not in ('por_confirmar', 'confirmada') then raise exception 'la cita no se puede cancelar (%)', c.estado using errcode = 'PF409'; end if;
    update piefirme.citas set estado = 'cancelada', motivo_cancelacion = 'Cancelada por el paciente desde la liga' where id = c.id;
    v_reemb := v_horas >= v_aviso;
  else
    -- reprogramar: con ≥ 48 h y hasta 2 veces sin costo; con menos de 48 h cuenta como cancelación (P-038)
    if c.estado not in ('por_confirmar', 'confirmada') then raise exception 'la cita no se puede reprogramar (%)', c.estado using errcode = 'PF409'; end if;
    if v_horas < v_aviso or c.reprogramaciones >= v_max then
      raise exception 'reprogramacion_no_permitida: con menos de % h o tras % reprogramaciones cuenta como cancelación', v_aviso, v_max using errcode = 'PF409';
    end if;
    if p_nuevo_inicio is null then raise exception 'falta el nuevo horario' using errcode = 'PF400'; end if;
    select * into s from piefirme_app.slots_mejor_por_inicio(c.organizacion_id, c.sede_id, c.servicio_id, c.podologo_id,
          (p_nuevo_inicio at time zone piefirme_app.zona_org(c.organizacion_id))::date, (p_nuevo_inicio at time zone piefirme_app.zona_org(c.organizacion_id))::date, c.tipo_atencion) m
     where m.inicio = p_nuevo_inicio;
    if not found then raise exception 'horario_no_disponible' using errcode = 'PF409'; end if;
    update piefirme.citas set inicio = s.inicio, fin = s.fin, cabina_id = s.cabina_id, estado = 'confirmada' where id = c.id;   -- el anticipo se conserva
  end if;

  update piefirme.ligas_cita set estado = 'usada', accion = p_accion, usada_en = now(), nuevo_inicio = case when p_accion = 'reprogramar' then p_nuevo_inicio end where id = l.id;
  select * into c from piefirme.citas where id = c.id;
  if c.estado in ('por_confirmar', 'confirmada') then v_nueva := piefirme_app.emitir_liga(c.id); end if;
  return jsonb_build_object('ok', true, 'accion', p_accion, 'estado', c.estado, 'inicio', c.inicio, 'folio', c.folio,
                            'reembolso', v_reemb, 'plazo_reembolso', case when v_reemb then '5 a 10 días hábiles' end, 'liga_token', v_nueva);
end $$;

-- 7) «Avisarme si se libera un horario» (lista de espera) con límite anti-abuso.
create or replace function piefirme.portal_lista_espera(
  p_slug text, p_sede uuid, p_servicio uuid, p_podologo uuid, p_nombre text, p_celular text, p_correo text, p_disponibilidad text default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.portal_org(p_slug); v_cel text := regexp_replace(coalesce(p_celular, ''), '[^0-9+]', '', 'g'); v_n integer;
begin
  perform piefirme_app.limite_tasa(v_org, piefirme_app.ip_cliente(), 'lista_espera', 10, interval '1 hour');
  if coalesce(btrim(p_nombre), '') = '' or length(regexp_replace(v_cel, '[^0-9]', '', 'g')) < 10 then
    raise exception 'nombre y celular válidos son obligatorios' using errcode = 'PF400';
  end if;
  if not exists (select 1 from piefirme.servicios sv where sv.id = p_servicio and sv.organizacion_id = v_org and sv.estado = 'activo' and sv.visible_portal)
     or not exists (select 1 from piefirme.sedes s where s.id = p_sede and s.organizacion_id = v_org and s.activa) then
    raise exception 'servicio o sede no disponible' using errcode = 'PF404';
  end if;
  select count(*) into v_n from piefirme.lista_espera where organizacion_id = v_org and telefono = v_cel and estado in ('esperando', 'notificado');
  if v_n >= 3 then raise exception 'limite_lista_espera' using errcode = 'PF429'; end if;
  insert into piefirme.lista_espera (organizacion_id, sede_id, nombre_solicitante, telefono, correo, servicio_id, podologo_id, disponibilidad, origen, prioridad)
  values (v_org, p_sede, left(btrim(p_nombre), 120), v_cel, nullif(lower(btrim(coalesce(p_correo, ''))), ''), p_servicio, p_podologo, left(p_disponibilidad, 200), 'portal', 'media');
  return jsonb_build_object('ok', true);
end $$;

-- ═════════════════ RLS ═════════════════
select piefirme_app.crear_politicas('organizaciones_portal', null, array['administrador'], '{}'::text[], 'no', 'true');
select piefirme_app.crear_politicas('portal_podologos', null, array['administrador'], array['administrador'], 'no');
select piefirme_app.crear_politicas('ligas_cita', array['administrador', 'recepcion'], '{}'::text[], '{}'::text[], 'no');
drop policy if exists ligas_cita_ins on piefirme.ligas_cita;
drop policy if exists ligas_cita_upd on piefirme.ligas_cita;
select piefirme_app.b_triggers('organizaciones_portal');
select piefirme_app.b_triggers('portal_podologos');

-- ═════════════════ vistas prp_* ═════════════════
create or replace view piefirme.prp_portal_podologos with (security_invoker = true) as
select pf.id as perfil_id, pf.organizacion_id, pf.nombre, pf.apellidos, pf.cedula, pf.sedes, pf.activo,
       coalesce(pp.visible, false) as visible, pp.nombre_publico, pp.resumen, pp.foto_url
  from piefirme.perfiles pf
  left join piefirme.portal_podologos pp on pp.perfil_id = pf.id
 where pf.rol in ('podologo', 'administrador');

-- ═════════════════ permisos de ejecución ═════════════════
revoke all on function piefirme.portal_catalogo(text), piefirme.portal_disponibilidad(text, uuid, uuid, uuid, date, date, text),
  piefirme.portal_retener_horario(text, uuid, uuid, uuid, timestamptz, text, jsonb, jsonb), piefirme.portal_estado_reserva(text, uuid, text),
  piefirme.portal_ver_cita(text), piefirme.portal_accion_cita(text, text, timestamptz),
  piefirme.portal_lista_espera(text, uuid, uuid, uuid, text, text, text, text) from public;
grant execute on function piefirme.portal_catalogo(text), piefirme.portal_disponibilidad(text, uuid, uuid, uuid, date, date, text),
  piefirme.portal_retener_horario(text, uuid, uuid, uuid, timestamptz, text, jsonb, jsonb), piefirme.portal_estado_reserva(text, uuid, text),
  piefirme.portal_ver_cita(text), piefirme.portal_accion_cita(text, text, timestamptz),
  piefirme.portal_lista_espera(text, uuid, uuid, uuid, text, text, text, text) to anon, authenticated;

revoke all on function piefirme.generar_liga_cita(uuid), piefirme.disponibilidad(uuid, uuid, uuid, date, date, text) from public, anon;
grant execute on function piefirme.generar_liga_cita(uuid), piefirme.disponibilidad(uuid, uuid, uuid, date, date, text) to authenticated;
grant execute on function piefirme_app.slots_disponibles(uuid, uuid, uuid, uuid, date, date, text), piefirme_app.emitir_liga(uuid),
  piefirme_app.anticipo_servicio(uuid, uuid, numeric) to authenticated;
