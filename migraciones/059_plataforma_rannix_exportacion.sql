-- 059 · EQUIPO Y PLATAFORMA (D) · Panel RANNIX (solo rannix_staff, vía funciones), alta de clínica, estado suspendida/baja,
--        exportación completa por clínica y vista de estado de la clínica.
-- Depende de: 001, 056 (suscripciones, cobros, invitaciones, soporte), 057 (parametros).
-- Reglas: P-121 (RANNIX ve solo METADATOS: conteos, plan, estado, uso; nunca datos de salud ni de pacientes), P-128 (aislamiento total),
--   P-113/P-114 (planes sin cobro automático; prueba 14 d; vencida → gracia 7 d → solo lectura y exportación, ejecutado A MANO por RANNIX),
--   P-117 (MRR = suma de planes vigentes; clínica en prueba no cobra), P-127 (retención ≥ 5 años; exportación de todo lo de la clínica).
-- Todas las funciones rannix_* son security definer, verifican piefirme_app.es_rannix() y no se otorgan a anon. El resto de la app no las ve.
-- "Solo lectura": suspendida/baja ya se impone en TODAS las políticas de escritura vía piefirme_app.org_activa() (001) y en el trigger
--   piefirme_app.proteger_organizacion() (057); la exportación sigue disponible.

-- ───────────────────────────── estado de la clínica (banner de la app) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.clinica_solo_lectura() returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select not piefirme_app.org_activa() and piefirme_app.org_id() is not null
$$;

create or replace view piefirme.prp_estado_clinica with (security_invoker = true) as
select o.id as organizacion_id, o.nombre, o.estado, o.plan, o.prueba_hasta,
       case when o.estado = 'prueba' and o.prueba_hasta is not null then greatest(0, o.prueba_hasta - current_date) end as dias_prueba_restantes,
       (o.estado in ('suspendida', 'baja')) as solo_lectura,
       s.estado as suscripcion_estado, s.gracia_hasta,
       case when s.estado = 'vencida' and s.gracia_hasta is not null then greatest(0, s.gracia_hasta - current_date) end as dias_gracia_restantes,
       (o.parametros ->> 'almacenamiento_cuota_gb')::numeric as cuota_gb,
       (o.parametros ->> 'almacenamiento_aviso_pct')::numeric as aviso_pct
  from piefirme.organizaciones o
  left join piefirme.suscripciones s on s.organizacion_id = o.id;

-- bytes almacenados por la clínica (primer segmento de la ruta = organizacion_id)
create or replace function piefirme_app.bytes_almacenados(p_org uuid) returns bigint
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v bigint;
begin
  execute 'select coalesce(sum((metadata ->> ''size'')::bigint), 0) from storage.objects where (string_to_array(name, ''/''))[1] = $1' into v using p_org::text;
  return v;
exception when others then
  return 0;
end $$;

-- ───────────────────────────── panel RANNIX ─────────────────────────────
create or replace function piefirme_app.exigir_rannix() returns void
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_rannix() then raise exception 'Acceso solo para el personal de RANNIX'; end if;
end $$;

-- una fila por clínica: solo metadatos de uso y facturación
create or replace function piefirme.rannix_panel_clinicas()
returns table (organizacion_id uuid, nombre text, plan text, estado text, suscripcion_estado text, prueba_hasta date, dias_prueba_restantes integer,
               sedes integer, usuarios_activos integer, podologos_activos integer, citas_mes integer, almacenamiento_gb numeric,
               cargo_mensual numeric, ultimo_cobro_estado text, ultimo_cobro_periodo date, tickets_abiertos integer)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  perform piefirme_app.exigir_rannix();
  return query
  select o.id, o.nombre, o.plan, o.estado, s.estado, o.prueba_hasta,
         case when o.estado = 'prueba' and o.prueba_hasta is not null then greatest(0, o.prueba_hasta - current_date) end,
         (select count(*)::int from piefirme.sedes x where x.organizacion_id = o.id and x.activa),
         (select count(*)::int from piefirme.perfiles p where p.organizacion_id = o.id and p.activo),
         piefirme.suscripcion_podologos_activos(o.id),
         (select count(*)::int from piefirme.citas c where c.organizacion_id = o.id and c.created_at >= date_trunc('month', now())),
         round(piefirme_app.bytes_almacenados(o.id) / 1073741824.0, 3),
         case when o.estado = 'activa' then piefirme.suscripcion_cargo_mensual(o.id) else 0 end,
         (select c.estado from piefirme.cobros_suscripcion c where c.organizacion_id = o.id order by c.periodo desc limit 1),
         (select c.periodo from piefirme.cobros_suscripcion c where c.organizacion_id = o.id order by c.periodo desc limit 1),
         (select count(*)::int from piefirme.soporte_tickets t where t.organizacion_id = o.id and t.estado in ('abierto', 'en_atencion', 'esperando_clinica'))
    from piefirme.organizaciones o
    left join piefirme.suscripciones s on s.organizacion_id = o.id
   order by o.nombre;
end $$;

-- tarjetas del panel: MRR (planes vigentes de clínicas activas), conteos por estado, cobros pendientes/vencidos
create or replace function piefirme.rannix_panel_resumen() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v jsonb;
begin
  perform piefirme_app.exigir_rannix();
  select jsonb_build_object(
    'clinicas_total', count(*),
    'en_prueba', count(*) filter (where o.estado = 'prueba'),
    'activas', count(*) filter (where o.estado = 'activa'),
    'suspendidas', count(*) filter (where o.estado = 'suspendida'),
    'baja', count(*) filter (where o.estado = 'baja'),
    'mrr', coalesce(sum(piefirme.suscripcion_cargo_mensual(o.id)) filter (where o.estado = 'activa'), 0),
    'cobros_vencidos', (select count(*) from piefirme.cobros_suscripcion c where c.estado = 'vencida'),
    'cobros_pendientes', (select count(*) from piefirme.cobros_suscripcion c where c.estado in ('pendiente', 'proxima') and c.periodo <= date_trunc('month', current_date)::date),
    'tickets_abiertos', (select count(*) from piefirme.soporte_tickets t where t.estado in ('abierto', 'en_atencion', 'esperando_clinica')),
    'tickets_urgentes', (select count(*) from piefirme.soporte_tickets t where t.prioridad = 'urgente' and t.estado in ('abierto', 'en_atencion', 'esperando_clinica'))
  ) into v from piefirme.organizaciones o;
  return v;
end $$;

-- clínicas que ya pasaron la prueba o la gracia: RANNIX decide a mano si suspende (P-114)
create or replace function piefirme.rannix_clinicas_por_suspender()
returns table (organizacion_id uuid, nombre text, estado text, motivo text, desde date)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  perform piefirme_app.exigir_rannix();
  return query
  select o.id, o.nombre, o.estado, 'prueba vencida'::text, o.prueba_hasta from piefirme.organizaciones o
   where o.estado = 'prueba' and o.prueba_hasta < current_date
  union all
  select o.id, o.nombre, o.estado, 'gracia vencida'::text, s.gracia_hasta from piefirme.organizaciones o join piefirme.suscripciones s on s.organizacion_id = o.id
   where o.estado = 'activa' and s.estado = 'vencida' and s.gracia_hasta < current_date;
end $$;

-- cambia el estado de la clínica y sincroniza la suscripción (deja bitácora en la clínica con el motivo)
create or replace function piefirme.rannix_cambiar_estado_org(p_org uuid, p_estado text, p_motivo text)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o piefirme.organizaciones;
begin
  perform piefirme_app.exigir_rannix();
  if p_estado not in ('prueba', 'activa', 'suspendida', 'baja') then raise exception 'Estado inválido'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'El cambio de estado exige motivo'; end if;
  select * into o from piefirme.organizaciones where id = p_org for update;
  if not found then raise exception 'Clínica no encontrada'; end if;
  if o.estado = 'baja' then raise exception 'Una clínica dada de baja no cambia de estado'; end if;
  if o.estado = p_estado then return; end if;
  update piefirme.organizaciones set estado = p_estado where id = p_org;
  update piefirme.suscripciones set
    estado = case p_estado when 'activa' then 'activa' when 'suspendida' then 'suspendida' when 'baja' then 'cancelada' else estado end,
    gracia_hasta = case when p_estado = 'activa' then null else gracia_hasta end,
    periodo_actual_desde = case when p_estado = 'activa' and periodo_actual_desde is null then date_trunc('month', current_date)::date else periodo_actual_desde end
   where organizacion_id = p_org;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (p_org, auth.uid(), 'actualizar', 'organizaciones', p_org::text, jsonb_build_object('estado_antes', o.estado, 'estado_despues', p_estado, 'motivo', p_motivo, 'por', 'rannix'));
end $$;

-- marca la suscripción como vencida y abre la gracia (7 días por parámetro)
create or replace function piefirme.rannix_marcar_vencida(p_org uuid)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_gracia int;
begin
  perform piefirme_app.exigir_rannix();
  select coalesce((parametros ->> 'gracia_dias')::int, 7) into v_gracia from piefirme.organizaciones where id = p_org;
  update piefirme.suscripciones set estado = 'vencida', gracia_hasta = current_date + v_gracia where organizacion_id = p_org and estado in ('prueba', 'activa');
  if not found then raise exception 'Suscripción no vigente'; end if;
end $$;

-- registro MANUAL del pago de la suscripción (no hay cobro dentro del sistema, P-113)
create or replace function piefirme.rannix_registrar_pago(p_org uuid, p_periodo date, p_metodo text, p_fecha_pago date, p_referencia text default null,
                                                       p_factura_folio text default null, p_notas text default null)
returns piefirme.cobros_suscripcion language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s piefirme.suscripciones; pl piefirme.planes_suscripcion; v_per date := date_trunc('month', p_periodo)::date; v_uni int; v_base numeric; r piefirme.cobros_suscripcion;
begin
  perform piefirme_app.exigir_rannix();
  select * into s from piefirme.suscripciones where organizacion_id = p_org;
  if not found then raise exception 'La clínica no tiene suscripción'; end if;
  select * into pl from piefirme.planes_suscripcion where clave = s.plan_clave;
  v_uni := case when s.plan_clave = 'por_clinica' then 1 else greatest(1, piefirme.suscripcion_podologos_activos(p_org)) end;
  v_base := pl.precio_mensual * v_uni;
  insert into piefirme.cobros_suscripcion (organizacion_id, suscripcion_id, periodo, plan_clave, unidades, importe_base, iva, estado, metodo_pago, fecha_pago,
                                         referencia, factura_folio, registrado_por, notas)
  values (p_org, s.id, v_per, s.plan_clave, v_uni, v_base, round(v_base * pl.iva_pct / 100, 2), 'pagada', p_metodo, p_fecha_pago, p_referencia, p_factura_folio, auth.uid(), p_notas)
  on conflict (suscripcion_id, periodo) do update set estado = 'pagada', metodo_pago = excluded.metodo_pago, fecha_pago = excluded.fecha_pago,
        referencia = excluded.referencia, factura_folio = coalesce(excluded.factura_folio, piefirme.cobros_suscripcion.factura_folio),
        registrado_por = excluded.registrado_por, notas = coalesce(excluded.notas, piefirme.cobros_suscripcion.notas)
  returning * into r;
  -- un pago al corriente reabre la suscripción vencida y avanza el próximo cobro; si el plan cambió, surte efecto aquí (P-116)
  update piefirme.suscripciones set
    estado = case when estado in ('vencida', 'prueba') then 'activa' else estado end,
    gracia_hasta = null, periodo_actual_desde = v_per, proximo_cobro = (v_per + interval '1 month')::date,
    plan_clave = coalesce(plan_siguiente, plan_clave), plan_siguiente = null
   where id = s.id;
  update piefirme.organizaciones set estado = 'activa' where id = p_org and estado = 'prueba';
  return r;
end $$;

-- alta de clínica (Superadmin): organización en prueba (14 d), suscripción, invitación para su administrador. Devuelve el token UNA vez.
create or replace function piefirme.rannix_alta_clinica(p_nombre text, p_razon_social text, p_email_admin text, p_plan text default 'por_podologo',
                                                     p_prueba_dias integer default 14)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_email text := lower(trim(p_email_admin)); v_tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform piefirme_app.exigir_rannix();
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Nombre de la clínica requerido'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo del administrador inválido'; end if;
  if exists (select 1 from piefirme.perfiles where lower(email) = v_email) then raise exception 'Ese correo ya pertenece a otra clínica'; end if;
  if not exists (select 1 from piefirme.planes_suscripcion where clave = p_plan and activo) then raise exception 'Plan inexistente'; end if;
  insert into piefirme.organizaciones (nombre, razon_social, plan, estado, prueba_hasta)
  values (p_nombre, p_razon_social, p_plan, 'prueba', current_date + greatest(0, p_prueba_dias)) returning id into v_org;
  insert into piefirme.suscripciones (organizacion_id, plan_clave, estado, prueba_inicio, prueba_hasta, razon_social)
  values (v_org, p_plan, 'prueba', current_date, current_date + greatest(0, p_prueba_dias), p_razon_social);
  insert into piefirme.invitaciones (organizacion_id, email, rol, token_hash, invitado_por)
  values (v_org, v_email, 'administrador', encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), auth.uid());
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (v_org, auth.uid(), 'insertar', 'organizaciones', v_org::text, jsonb_build_object('alta_por', 'rannix', 'plan', p_plan));
  return jsonb_build_object('organizacion_id', v_org, 'token', v_tok);
end $$;

-- soporte: lista y respuesta (solo metadatos del ticket; el acceso a la clínica exige un permiso temporal otorgado por ella)
create or replace function piefirme.rannix_tickets(p_estado text default null)
returns table (id uuid, organizacion_id uuid, clinica text, folio text, asunto text, prioridad text, estado text, created_at timestamptz, mensajes integer)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  perform piefirme_app.exigir_rannix();
  return query
  select t.id, t.organizacion_id, o.nombre, t.folio, t.asunto, t.prioridad, t.estado, t.created_at,
         (select count(*)::int from piefirme.soporte_mensajes m where m.ticket_id = t.id)
    from piefirme.soporte_tickets t join piefirme.organizaciones o on o.id = t.organizacion_id
   where p_estado is null or t.estado = p_estado
   order by (t.prioridad = 'urgente') desc, t.created_at desc;
end $$;

create or replace function piefirme.rannix_responder_ticket(p_ticket uuid, p_mensaje text, p_nuevo_estado text default null)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid;
begin
  perform piefirme_app.exigir_rannix();
  select organizacion_id into v_org from piefirme.soporte_tickets where id = p_ticket;
  if v_org is null then raise exception 'Ticket no encontrado'; end if;
  insert into piefirme.soporte_mensajes (organizacion_id, ticket_id, autor_tipo, autor_id, mensaje) values (v_org, p_ticket, 'rannix', auth.uid(), p_mensaje);
  if p_nuevo_estado is not null then
    update piefirme.soporte_tickets set estado = p_nuevo_estado, resuelto_en = case when p_nuevo_estado in ('resuelto', 'cerrado') then now() end where id = p_ticket;
  end if;
end $$;

-- ───────────────────────────── exportación completa por clínica ─────────────────────────────
-- La pide el Administrador de SU clínica (también con la clínica suspendida o en baja: derecho de portabilidad, P-114/P-127).
-- RANNIX no la ejecuta (los datos de salud no se le muestran). Funciona por tabla y por páginas para no cargar todo en memoria.
create or replace function piefirme.exportar_clinica_catalogo()
returns table (tabla text, filas bigint)
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare t record; v_org uuid := piefirme_app.org_id(); n bigint;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el Administrador de la clínica exporta sus datos'; end if;
  for t in
    select c.relname::text as nombre from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'piefirme' and c.relkind = 'r'
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organizacion_id' and not a.attisdropped)
     order by 1
  loop
    execute format('select count(*) from piefirme.%I where organizacion_id = $1', t.nombre) into n using v_org;
    tabla := t.nombre; filas := n; return next;
  end loop;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, detalle) values (v_org, auth.uid(), 'exportar', 'clinica', jsonb_build_object('paso', 'catalogo'));
end $$;

create or replace function piefirme.exportar_clinica_tabla(p_tabla text, p_desde integer default 0, p_limite integer default 1000)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v jsonb;
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el Administrador de la clínica exporta sus datos'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
                  where n.nspname = 'piefirme' and c.relkind = 'r' and c.relname = p_tabla and a.attname = 'organizacion_id' and not a.attisdropped) then
    raise exception 'Tabla no exportable: %', p_tabla;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''token_hash'' order by t.created_at nulls last), ''[]''::jsonb)
                    from (select * from piefirme.%I where organizacion_id = $1 order by 1 offset $2 limit $3) t', p_tabla)
    into v using v_org, greatest(0, p_desde), least(greatest(1, p_limite), 5000);
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, detalle)
  values (v_org, auth.uid(), 'exportar', p_tabla, jsonb_build_object('desde', p_desde, 'limite', p_limite));
  return v;
end $$;

-- lista de archivos de la clínica en storage (el servidor genera las URL firmadas para empaquetarlos)
create or replace function piefirme.exportar_clinica_archivos()
returns table (bucket text, ruta text)
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if not piefirme_app.es_admin() then raise exception 'Solo el Administrador de la clínica exporta sus datos'; end if;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, detalle) values (v_org, auth.uid(), 'exportar', 'storage', '{}'::jsonb);
  return query execute 'select bucket_id::text, name::text from storage.objects where (string_to_array(name, ''/''))[1] = $1 order by 1, 2' using v_org::text;
end $$;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.clinica_solo_lectura() from public, anon;
revoke all on function piefirme.rannix_panel_clinicas() from public, anon;
revoke all on function piefirme.rannix_panel_resumen() from public, anon;
revoke all on function piefirme.rannix_clinicas_por_suspender() from public, anon;
revoke all on function piefirme.rannix_cambiar_estado_org(uuid, text, text) from public, anon;
revoke all on function piefirme.rannix_marcar_vencida(uuid) from public, anon;
revoke all on function piefirme.rannix_registrar_pago(uuid, date, text, date, text, text, text) from public, anon;
revoke all on function piefirme.rannix_alta_clinica(text, text, text, text, integer) from public, anon;
revoke all on function piefirme.rannix_tickets(text) from public, anon;
revoke all on function piefirme.rannix_responder_ticket(uuid, text, text) from public, anon;
revoke all on function piefirme.exportar_clinica_catalogo() from public, anon;
revoke all on function piefirme.exportar_clinica_tabla(text, integer, integer) from public, anon;
revoke all on function piefirme.exportar_clinica_archivos() from public, anon;
grant execute on function piefirme.clinica_solo_lectura() to authenticated;
-- las rannix_* las invoca la función servidor del panel con la sesión del superadmin (la función verifica piefirme_app.es_rannix())
grant execute on function piefirme.rannix_panel_clinicas() to authenticated;
grant execute on function piefirme.rannix_panel_resumen() to authenticated;
grant execute on function piefirme.rannix_clinicas_por_suspender() to authenticated;
grant execute on function piefirme.rannix_cambiar_estado_org(uuid, text, text) to authenticated;
grant execute on function piefirme.rannix_marcar_vencida(uuid) to authenticated;
grant execute on function piefirme.rannix_registrar_pago(uuid, date, text, date, text, text, text) to authenticated;
grant execute on function piefirme.rannix_alta_clinica(text, text, text, text, integer) to authenticated;
grant execute on function piefirme.rannix_tickets(text) to authenticated;
grant execute on function piefirme.rannix_responder_ticket(uuid, text, text) to authenticated;
grant execute on function piefirme.exportar_clinica_catalogo() to authenticated;
grant execute on function piefirme.exportar_clinica_tabla(text, integer, integer) to authenticated;
grant execute on function piefirme.exportar_clinica_archivos() to authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.bytes_almacenados(uuid), piefirme_app.exigir_rannix() from authenticated;
