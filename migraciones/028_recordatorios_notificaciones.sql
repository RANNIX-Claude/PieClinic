-- 028 · Recordatorios y notificaciones de citas (cola de mensajes con adaptador de canal SIN credenciales) y aviso de lista de espera.
-- Reglas: P-039 (24 h antes, 2.º aviso opcional apagado, canal correo; SMS/WhatsApp cuando haya proveedor), P-040 (wa.me informativo),
-- P-041 (lista de espera: ventana de 30 min por notificado), P-143 (solo datos mínimos; nunca notas clínicas), P-148 (consentimiento de recordatorios).
-- El envío real lo hace una función de servidor (service_role) con el proveedor; aquí solo la cola, el estado y los límites.
-- Dependencias: 001, 010, 020..027.

set search_path = piefirme, piefirme_app, extensions;

create table piefirme.recordatorios (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id            uuid references piefirme.sedes(id),
  cita_id            uuid references piefirme.citas(id) on delete cascade,
  paciente_id        uuid references piefirme.pacientes(id),
  lista_espera_id    uuid references piefirme.lista_espera(id) on delete cascade,
  anticipo_id        uuid references piefirme.anticipos(id) on delete cascade,
  tipo               text not null check (tipo in ('recordatorio_24h', 'recordatorio_2h', 'confirmacion', 'reprogramacion', 'cancelacion',
                                                    'lista_espera_hueco', 'liga_pago', 'reembolso', 'vencimiento_plan', 'renovacion_membresia', 'otro')),
  canal              text not null default 'correo' check (canal in ('correo', 'sms', 'whatsapp', 'wa_me')),
  destino            text,                                        -- correo o celular; se resuelve al programar
  plantilla_id       uuid references piefirme.plantillas_documento(id),
  asunto             text,
  cuerpo             text,                                        -- nunca datos clínicos (P-143)
  incluye_liga       boolean not null default true,               -- liga de confirmar / reprogramar / cancelar (un solo uso)
  programado_para    timestamptz not null,
  estado             text not null default 'programado' check (estado in ('programado', 'enviando', 'enviado', 'entregado', 'respondido', 'fallido', 'cancelado', 'omitido')),
  enviado_en         timestamptz,
  proveedor          text,
  proveedor_msg_id   text,
  intentos           integer not null default 0 check (intentos >= 0),
  error              text,
  costo              numeric(14,2) check (costo is null or costo >= 0),   -- repercutido a la clínica (P-040)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (cita_id is not null or lista_espera_id is not null or anticipo_id is not null or paciente_id is not null)
);
create unique index recordatorios_uno_por_cita on piefirme.recordatorios (cita_id, tipo, canal)
  where cita_id is not null and tipo in ('recordatorio_24h', 'recordatorio_2h') and estado in ('programado', 'enviando', 'enviado', 'entregado', 'respondido');
create index on piefirme.recordatorios (organizacion_id, estado, programado_para);
create index on piefirme.recordatorios (organizacion_id, cita_id);

-- Programa los recordatorios de una cita viva; los anteriores aún no enviados se cancelan (reprogramación/cancelación).
create or replace function piefirme_app.programar_recordatorios(p_cita uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.citas%rowtype; p piefirme.pacientes%rowtype; v_canal text; v_dest text; v_t timestamptz; v_h int;
begin
  select * into c from piefirme.citas where id = p_cita;
  if not found then return; end if;
  update piefirme.recordatorios set estado = 'cancelado', updated_at = now()
   where cita_id = c.id and estado = 'programado' and tipo in ('recordatorio_24h', 'recordatorio_2h');
  if c.estado not in ('por_confirmar', 'confirmada') or c.inicio <= now() then return; end if;
  select * into p from piefirme.pacientes where id = c.paciente_id;
  v_canal := piefirme_app.param_txt(c.organizacion_id, 'recordatorio_canal', 'correo');
  v_dest := case when v_canal = 'correo' then p.email else p.telefono_celular end;
  v_h := piefirme_app.param_num(c.organizacion_id, 'recordatorio_horas_antes', 24)::int;
  v_t := c.inicio - make_interval(hours => v_h);
  if v_t > now() then
    insert into piefirme.recordatorios (organizacion_id, sede_id, cita_id, paciente_id, tipo, canal, destino, programado_para, estado, error)
    values (c.organizacion_id, c.sede_id, c.id, c.paciente_id, 'recordatorio_24h', v_canal, v_dest, v_t,
            case when coalesce(p.acepta_recordatorios, true) and v_dest is not null then 'programado' else 'omitido' end,
            case when not coalesce(p.acepta_recordatorios, true) then 'sin consentimiento de recordatorios' when v_dest is null then 'sin dato de contacto' end);
  end if;
  if piefirme_app.param_bool(c.organizacion_id, 'recordatorio_segundo_activo', false) then
    v_t := c.inicio - make_interval(hours => piefirme_app.param_num(c.organizacion_id, 'recordatorio_segundo_horas', 2)::int);
    if v_t > now() then
      insert into piefirme.recordatorios (organizacion_id, sede_id, cita_id, paciente_id, tipo, canal, destino, programado_para, estado, error)
      values (c.organizacion_id, c.sede_id, c.id, c.paciente_id, 'recordatorio_2h', v_canal, v_dest, v_t,
              case when coalesce(p.acepta_recordatorios, true) and v_dest is not null then 'programado' else 'omitido' end,
              case when not coalesce(p.acepta_recordatorios, true) then 'sin consentimiento de recordatorios' when v_dest is null then 'sin dato de contacto' end);
    end if;
  end if;
end $$;

create or replace function piefirme_app.cita_recordatorios_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  perform piefirme_app.programar_recordatorios(new.id);
  return null;
end $$;
create trigger t_cita_recordatorios after insert or update of inicio, estado on piefirme.citas for each row execute function piefirme_app.cita_recordatorios_ai();

-- Hueco liberado: se avisa al primero de la lista (prioridad y antigüedad) con ventana de 30 min; el siguiente lo toma el mantenimiento (029).
create or replace function piefirme_app.notificar_lista_espera(p_sede uuid, p_servicio uuid, p_podologo uuid) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare l piefirme.lista_espera%rowtype; v_dest text; v_canal text;
begin
  select * into l from piefirme.lista_espera le
   where le.sede_id = p_sede and le.servicio_id = p_servicio and le.estado = 'esperando' and le.vence_el > now()
     and (le.podologo_id is null or le.podologo_id = p_podologo)
   order by case le.prioridad when 'alta' then 1 when 'media' then 2 else 3 end, le.created_at
   limit 1 for update skip locked;
  if not found then return null; end if;
  v_canal := piefirme_app.param_txt(l.organizacion_id, 'recordatorio_canal', 'correo');
  v_dest := case when v_canal = 'correo' then coalesce(l.correo, (select email from piefirme.pacientes where id = l.paciente_id))
                 else coalesce(l.telefono, (select telefono_celular from piefirme.pacientes where id = l.paciente_id)) end;
  update piefirme.lista_espera set estado = 'notificado' where id = l.id;
  insert into piefirme.recordatorios (organizacion_id, sede_id, paciente_id, lista_espera_id, tipo, canal, destino, programado_para, incluye_liga, estado, error)
  values (l.organizacion_id, l.sede_id, l.paciente_id, l.id, 'lista_espera_hueco', v_canal, v_dest, now(), false,
          case when v_dest is null then 'omitido' else 'programado' end, case when v_dest is null then 'sin dato de contacto' end);
  return l.id;
end $$;

create or replace function piefirme_app.cita_cancelada_lista_espera() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.inicio > now() then perform piefirme_app.notificar_lista_espera(new.sede_id, new.servicio_id, new.podologo_id); end if;
  return null;
end $$;
create trigger t_cita_cancelada_lista after update of estado on piefirme.citas
  for each row when (new.estado = 'cancelada' and old.estado is distinct from 'cancelada') execute function piefirme_app.cita_cancelada_lista_espera();

-- Aviso inmediato a petición de Recepción (reenviar liga, confirmar por otro canal).
create or replace function piefirme.reenviar_recordatorio(p_cita uuid, p_canal text default null) returns uuid
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.citas%rowtype; p piefirme.pacientes%rowtype; v_canal text; v_id uuid;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  select * into c from piefirme.citas where id = p_cita;
  if not found then raise exception 'cita inexistente o fuera de alcance' using errcode = 'PF404'; end if;
  select * into p from piefirme.pacientes where id = c.paciente_id;
  if not coalesce(p.acepta_recordatorios, true) then raise exception 'el paciente no autorizó recordatorios (P-148)' using errcode = 'PF409'; end if;
  v_canal := coalesce(p_canal, piefirme_app.param_txt(c.organizacion_id, 'recordatorio_canal', 'correo'));
  insert into piefirme.recordatorios (organizacion_id, sede_id, cita_id, paciente_id, tipo, canal, destino, programado_para)
  values (c.organizacion_id, c.sede_id, c.id, c.paciente_id, 'confirmacion', v_canal, case when v_canal = 'correo' then p.email else p.telefono_celular end, now())
  returning id into v_id;
  return v_id;
end $$;

-- ───────────────────────────── funciones del servidor de mensajería (service_role) ─────────────────────────────
-- Toma un lote de pendientes y los marca «enviando» (sin doble envío entre ejecuciones concurrentes).
create or replace function piefirme.servicio_recordatorios_pendientes(p_limite integer default 50)
returns table (id uuid, organizacion_id uuid, tipo text, canal text, destino text, asunto text, cuerpo text, incluye_liga boolean, cita_id uuid, plantilla_id uuid)
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  return query
  with tomados as (
    select r.id as rid from piefirme.recordatorios r
     where r.estado = 'programado' and r.programado_para <= now() and r.intentos < 3
     order by r.programado_para limit greatest(p_limite, 1) for update skip locked)
  update piefirme.recordatorios r set estado = 'enviando', intentos = r.intentos + 1, updated_at = now()
    from tomados t where r.id = t.rid
  returning r.id, r.organizacion_id, r.tipo, r.canal, r.destino, r.asunto, r.cuerpo, r.incluye_liga, r.cita_id, r.plantilla_id;
end $$;

-- Datos mínimos para armar el mensaje (P-143) y, si aplica, una liga nueva de un solo uso.
create or replace function piefirme.servicio_preparar_recordatorio(p_id uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r piefirme.recordatorios%rowtype; c piefirme.citas%rowtype; v_liga text;
begin
  select * into r from piefirme.recordatorios where id = p_id;
  if not found then raise exception 'recordatorio inexistente' using errcode = 'PF404'; end if;
  if r.cita_id is null then return jsonb_build_object('tipo', r.tipo, 'canal', r.canal, 'destino', r.destino); end if;
  select * into c from piefirme.citas where id = r.cita_id;
  if r.incluye_liga and c.estado in ('por_confirmar', 'confirmada') then v_liga := piefirme_app.emitir_liga(c.id); end if;
  return jsonb_build_object(
    'tipo', r.tipo, 'canal', r.canal, 'destino', r.destino, 'liga_token', v_liga,
    'paciente', (select nombre from piefirme.pacientes where id = c.paciente_id),
    'inicio', c.inicio, 'zona_horaria', piefirme_app.zona_org(c.organizacion_id),
    'servicio', (select nombre from piefirme.servicios where id = c.servicio_id),
    'sede', (select jsonb_build_object('nombre', nombre, 'direccion', direccion, 'telefono', telefono) from piefirme.sedes where id = c.sede_id),
    'tipo_atencion', c.tipo_atencion);
end $$;

create or replace function piefirme.servicio_resultado_recordatorio(p_id uuid, p_estado text, p_proveedor text default null, p_msg_id text default null, p_error text default null, p_costo numeric default null)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if p_estado not in ('enviado', 'entregado', 'respondido', 'fallido') then raise exception 'estado inválido' using errcode = 'PF400'; end if;
  update piefirme.recordatorios set estado = case when p_estado = 'fallido' and intentos < 3 then 'programado' else p_estado end,
         enviado_en = case when p_estado <> 'fallido' then coalesce(enviado_en, now()) else enviado_en end,
         proveedor = coalesce(p_proveedor, proveedor), proveedor_msg_id = coalesce(p_msg_id, proveedor_msg_id), error = p_error,
         costo = coalesce(p_costo, costo), updated_at = now()
   where id = p_id;
end $$;

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.crear_politicas('recordatorios', array['administrador', 'recepcion'], array['administrador', 'recepcion'], '{}'::text[], 'nula');
select piefirme_app.b_triggers('recordatorios', false);

create or replace view piefirme.prp_recordatorios with (security_invoker = true) as
select r.*, c.folio as cita_folio, c.inicio as cita_inicio, c.estado as cita_estado,
       btrim(p.nombre || ' ' || coalesce(p.apellido_paterno, '')) as paciente_nombre
  from piefirme.recordatorios r
  left join piefirme.citas c on c.id = r.cita_id
  left join piefirme.pacientes p on p.id = r.paciente_id;

revoke all on function piefirme.reenviar_recordatorio(uuid, text) from public, anon;
grant execute on function piefirme.reenviar_recordatorio(uuid, text) to authenticated;
revoke all on function piefirme.servicio_recordatorios_pendientes(integer), piefirme.servicio_preparar_recordatorio(uuid),
  piefirme.servicio_resultado_recordatorio(uuid, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function piefirme.servicio_recordatorios_pendientes(integer), piefirme.servicio_preparar_recordatorio(uuid),
  piefirme.servicio_resultado_recordatorio(uuid, text, text, text, text, numeric) to service_role;
