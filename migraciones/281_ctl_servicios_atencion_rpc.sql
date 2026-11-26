-- 281 · Control y Auditoría · ETAPA 8 (SERVICIOS) · EXPEDIENTE DE ATENCIÓN LIGADO A COBRO (F5.5).
--   · Lecturas del origen concentradas en funciones piefirme_app.ctl_o_* (tickets y servicios cobrados, salidas de insumo, costo): si el origen cambia solo se reimplementan.
--   · RPC: ctl_atencion_abrir · ctl_atencion_cerrar_con_ticket · ctl_atencion_cancelar (motivo + clave de supervisor) · ctl_atencion_tickets_candidatos ·
--     ctl_atencion_supervisores · ctl_atenciones_listar · ctl_atenciones_conciliar.
--   · Hook de BAJO RIESGO sobre consultas: trigger AFTER INSERT que abre la atención opaca. APAGADO por omisión (parámetro atencion_auto_desde_consulta = «no»);
--     envuelto en un bloque que NUNCA frena la consulta; no lleva nombre, nota ni diagnóstico: solo hash del paciente, servicio, podólogo y sucursal.
--   · La app no escribe en ctl_atencion: solo por estas RPC (SECURITY DEFINER; sesión + clínica activa + capacidad en el servidor).
-- Depende de: 200, 201, 280.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── lecturas del origen (capa de desacoplamiento) ─────────────────────────────
-- Servicios cobrados por línea (cantidades) en [ini, fin) para un conjunto de sucursales.
create or replace function piefirme_app.ctl_o_servicios_cobrados(p_org uuid, p_sedes uuid[], p_ini timestamptz, p_fin timestamptz)
returns table (venta_id uuid, ticket text, sucursal_id uuid, cobrada_en timestamptz, servicio_id uuid, unidades numeric)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select v.id, v.folio, v.sede_id, v.cobrada_en, l.servicio_id, l.cantidad
    from piefirme.ventas v join piefirme.venta_lineas l on l.venta_id = v.id and l.tipo = 'servicio'
   where v.organizacion_id = p_org and v.sede_id = any (p_sedes) and v.estado in ('cobrada', 'por_facturar', 'facturada')
     and v.cobrada_en >= p_ini and v.cobrada_en < p_fin
$$;

-- Salidas de inventario de insumos (negativas) que cuentan como consumo: todas menos traspasos a otra sucursal y devoluciones al proveedor.
create or replace function piefirme_app.ctl_o_salidas_insumo(p_org uuid, p_sedes uuid[], p_insumos uuid[], p_ini timestamptz, p_fin timestamptz)
returns table (sucursal_id uuid, producto_id uuid, tipo text, cantidad numeric, fecha timestamptz)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select m.sede_id, m.producto_id, m.tipo, -m.cantidad, m.fecha
    from piefirme.movimientos_inventario m
   where m.organizacion_id = p_org and m.sede_id = any (p_sedes) and m.producto_id = any (p_insumos) and m.cantidad < 0
     and m.tipo not in ('traspaso_salida', 'devolucion_proveedor') and m.fecha >= p_ini and m.fecha < p_fin
$$;

create or replace function piefirme_app.ctl_o_costo_producto(p_org uuid, p_producto uuid) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(p.costo_promedio, 0) from piefirme.productos p where p.id = p_producto and p.organizacion_id = p_org
$$;

-- Unidades de servicio cobradas en un ticket (de una sucursal y organización) y cuántas de ellas son compatibles con el servicio de la atención.
-- Compatible = el mismo servicio o uno de su misma categoría; atención sin servicio = cualquier servicio. Capacidad = unidades totales − atenciones ya ligadas al ticket.
create or replace function piefirme_app.ctl_ticket_capacidad(p_org uuid, p_sucursal uuid, p_venta uuid, p_servicio uuid, p_excluir uuid default null) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v piefirme.ventas%rowtype; v_tot numeric; v_comp numeric; v_lig integer; v_cat text;
begin
  select * into v from piefirme.ventas where id = p_venta and organizacion_id = p_org;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if v.sede_id <> p_sucursal then return jsonb_build_object('ok', false, 'motivo', 'otra_sucursal'); end if;
  if v.estado not in ('cobrada', 'por_facturar', 'facturada') then return jsonb_build_object('ok', false, 'motivo', 'no_cobrado'); end if;
  if p_servicio is not null then select s.categoria into v_cat from piefirme.servicios s where s.id = p_servicio; end if;
  select coalesce(sum(l.cantidad), 0), coalesce(sum(l.cantidad) filter (where p_servicio is null or l.servicio_id = p_servicio or (v_cat is not null and s.categoria = v_cat)), 0)
    into v_tot, v_comp
    from piefirme.venta_lineas l left join piefirme.servicios s on s.id = l.servicio_id where l.venta_id = p_venta and l.tipo = 'servicio';
  if v_comp < 1 then return jsonb_build_object('ok', false, 'motivo', 'sin_servicio_compatible'); end if;
  select count(*) into v_lig from piefirme.ctl_atencion a where a.organizacion_id = p_org and a.ticket_id = p_venta and a.estado = 'cerrada_con_ticket' and a.id is distinct from p_excluir;
  if floor(v_tot) - v_lig < 1 then return jsonb_build_object('ok', false, 'motivo', 'ticket_agotado'); end if;
  return jsonb_build_object('ok', true, 'ticket', v.folio, 'cobrada_en', v.cobrada_en, 'servicios', v_tot, 'ligadas', v_lig);
end $$;

create or replace function piefirme_app.ctl_msg_ticket(p_motivo text) returns text language sql immutable as $$
  select case p_motivo
    when 'no_existe' then 'El ticket no existe.'
    when 'otra_sucursal' then 'El ticket es de otra sucursal.'
    when 'no_cobrado' then 'El ticket aún no está cobrado (o está cancelado).'
    when 'sin_servicio_compatible' then 'El ticket no contiene un servicio compatible con esta atención.'
    when 'ticket_agotado' then 'Todos los servicios de ese ticket ya están ligados a otras atenciones.'
    else 'El ticket no es válido para esta atención.' end
$$;

-- PIN de otra persona (el supervisor que autoriza): mismo conteo de fallos que el PIN propio (3 fallos = 15 min) pero el intento se anota al SOLICITANTE.
create or replace function piefirme_app.ctl_verificar_pin_perfil(p_org uuid, p_perfil uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_desde bigint; v_fallos integer; v_ok boolean; v_ultimo timestamptz;
begin
  select coalesce(max(i.id), 0) into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'pin' and i.exito;
  select count(*), max(i.creado_en) into v_fallos, v_ultimo from piefirme.ctl_intento i
   where i.usuario_id = auth.uid() and i.tipo = 'pin' and not i.exito and i.id > v_desde and i.creado_en > now() - interval '15 minutes';
  if v_fallos >= 3 then
    raise exception 'Bloqueado por claves incorrectas; espere % minutos', greatest(1, ceil(extract(epoch from (v_ultimo + interval '15 minutes' - now())) / 60))::integer using errcode = 'PF429';
  end if;
  if not exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = p_perfil) then
    return jsonb_build_object('ok', false, 'error', 'sin_pin', 'mensaje', 'El supervisor elegido todavía no define su PIN en «Mi PIN».');
  end if;
  v_ok := coalesce(p_pin, '') ~ '^[0-9]{4,8}$' and exists (select 1 from piefirme.pins_personales pp where pp.perfil_id = p_perfil and pp.pin_hash = piefirme_app.hash_pin(pp.perfil_id, p_pin));
  insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values (p_org, auth.uid(), 'pin', v_ok);   -- no se lanza error: revertiría el intento
  if not v_ok then return jsonb_build_object('ok', false, 'error', 'pin_incorrecto', 'mensaje', 'Clave de supervisor incorrecta.', 'intentos_restantes', greatest(0, 2 - v_fallos)); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Referencia opaca de un paciente: huella corta de su identificador y la organización (nunca el id ni el nombre; no es reversible sin la sal de la organización).
create or replace function piefirme_app.ctl_ref_opaca(p_org uuid, p_paciente uuid) returns text
language sql immutable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select 'P-' || upper(substr(encode(digest(p_org::text || ':ctl-atencion:' || p_paciente::text, 'sha256'), 'hex'), 1, 10))
$$;

-- ───────────────────────────── abrir ─────────────────────────────
create or replace function piefirme.ctl_atencion_abrir(p_id uuid, p_sucursal uuid, p_servicio uuid, p_paciente_ref text default null, p_atiende uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_ref text; v_atiende uuid := coalesce(p_atiende, auth.uid()); a piefirme.ctl_atencion%rowtype;
begin
  if p_id is null then raise exception 'falta el identificador de la atención' using errcode = 'PF400'; end if;
  select * into a from piefirme.ctl_atencion where id = p_id and organizacion_id = v_org;
  if found then return jsonb_build_object('ok', true, 'idempotente', true, 'id', a.id, 'estado', a.estado, 'inicio_en', a.inicio_en, 'paciente_ref', a.paciente_ref); end if;
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org and s.activa) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  if p_servicio is null or not exists (select 1 from piefirme.servicios s where s.id = p_servicio and s.organizacion_id = v_org) then
    raise exception 'elija el tipo de servicio de la atención' using errcode = 'PF422';
  end if;
  if not exists (select 1 from piefirme.perfiles p where p.id = v_atiende and p.organizacion_id = v_org and p.activo
                    and (cardinality(p.sedes) = 0 or p_sucursal = any (p.sedes))) then
    raise exception 'quien atiende no es una persona activa de esta sucursal' using errcode = 'PF422';
  end if;
  v_ref := nullif(btrim(p_paciente_ref), '');
  if v_ref is null then v_ref := 'A-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  elsif v_ref !~ '^[A-Za-z0-9_-]{3,40}$' then
    raise exception 'la referencia del paciente es opaca: solo letras, números y guiones (3 a 40), sin nombre ni datos clínicos' using errcode = 'PF422';
  end if;
  insert into piefirme.ctl_atencion (id, organizacion_id, sucursal_id, paciente_ref, servicio_id, usuario_atiende, origen_tipo, hora_cliente)
  values (p_id, v_org, p_sucursal, v_ref, p_servicio, v_atiende, 'manual', p_hora_cliente) returning * into a;
  return jsonb_build_object('ok', true, 'idempotente', false, 'id', a.id, 'estado', a.estado, 'inicio_en', a.inicio_en, 'paciente_ref', a.paciente_ref);
end $$;

-- ───────────────────────────── tickets que podrían cerrar la atención ─────────────────────────────
create or replace function piefirme.ctl_atencion_tickets_candidatos(p_atencion uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); a piefirme.ctl_atencion%rowtype; r record; c jsonb; v_out jsonb := '[]'::jsonb;
begin
  select * into a from piefirme.ctl_atencion where id = p_atencion and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(a.sucursal_id) then raise exception 'atención no encontrada' using errcode = 'PF404'; end if;
  for r in select v.id, v.folio, v.cobrada_en from piefirme.ventas v
            where v.organizacion_id = v_org and v.sede_id = a.sucursal_id and v.estado in ('cobrada', 'por_facturar', 'facturada')
              and v.cobrada_en >= a.inicio_en - interval '12 hours' order by v.cobrada_en desc limit 60 loop
    c := piefirme_app.ctl_ticket_capacidad(v_org, a.sucursal_id, r.id, a.servicio_id, a.id);
    if (c ->> 'ok')::boolean then v_out := v_out || jsonb_build_array(jsonb_build_object('venta_id', r.id, 'ticket', r.folio, 'cobrada_en', r.cobrada_en, 'servicios', c -> 'servicios')); end if;
    exit when jsonb_array_length(v_out) >= 20;
  end loop;
  return v_out;
end $$;

-- ───────────────────────────── cerrar con ticket ─────────────────────────────
create or replace function piefirme.ctl_atencion_cerrar_con_ticket(p_atencion uuid, p_ticket uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); a piefirme.ctl_atencion%rowtype; c jsonb;
begin
  select * into a from piefirme.ctl_atencion where id = p_atencion and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(a.sucursal_id) then raise exception 'atención no encontrada' using errcode = 'PF404'; end if;
  if a.estado <> 'abierta' then raise exception 'La atención ya está % y no se modifica.', replace(a.estado, '_', ' ') using errcode = 'PF409'; end if;
  if p_ticket is null then raise exception 'La atención no se cierra sin ticket: indique el ticket cobrado.' using errcode = 'PF422'; end if;
  c := piefirme_app.ctl_ticket_capacidad(v_org, a.sucursal_id, p_ticket, a.servicio_id, a.id);
  if not (c ->> 'ok')::boolean then raise exception '%', piefirme_app.ctl_msg_ticket(c ->> 'motivo') using errcode = 'PF422'; end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_atencion set estado = 'cerrada_con_ticket', ticket_id = p_ticket, fin_en = greatest(now(), inicio_en), cerrada_por = auth.uid() where id = a.id;
  return jsonb_build_object('ok', true, 'id', a.id, 'estado', 'cerrada_con_ticket', 'ticket', c ->> 'ticket');
end $$;

-- ───────────────────────────── supervisores que pueden autorizar una cancelación ─────────────────────────────
create or replace function piefirme.ctl_atencion_supervisores(p_sucursal uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  if not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no permitida' using errcode = 'PF403'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', trim(p.nombre || ' ' || coalesce(p.apellidos, ''))) order by p.nombre)
                     from piefirme.perfiles p where p.organizacion_id = v_org and p.activo and p.rol::text in ('supervisor', 'administrador') and p.id <> auth.uid()
                      and (cardinality(p.sedes) = 0 or p_sucursal = any (p.sedes))), '[]'::jsonb);
end $$;

-- ───────────────────────────── cancelar (motivo + clave de supervisor) ─────────────────────────────
create or replace function piefirme.ctl_atencion_cancelar(p_atencion uuid, p_motivo text, p_supervisor uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); a piefirme.ctl_atencion%rowtype; v_mot text := nullif(btrim(p_motivo), ''); p jsonb;
begin
  select * into a from piefirme.ctl_atencion where id = p_atencion and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(a.sucursal_id) then raise exception 'atención no encontrada' using errcode = 'PF404'; end if;
  if a.estado <> 'abierta' then raise exception 'La atención ya está % y no se modifica.', replace(a.estado, '_', ' ') using errcode = 'PF409'; end if;
  if v_mot is null or length(v_mot) < 5 then raise exception 'Cancelar una atención exige un motivo (mínimo 5 caracteres).' using errcode = 'PF422'; end if;
  if length(v_mot) > 300 then raise exception 'El motivo admite hasta 300 caracteres.' using errcode = 'PF422'; end if;
  if p_supervisor is null then raise exception 'Cancelar una atención exige la clave de un supervisor.' using errcode = 'PF422'; end if;
  if p_supervisor = auth.uid() then raise exception 'La clave debe ser de otra persona: quien cancela no se autoriza a sí mismo.' using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.perfiles s where s.id = p_supervisor and s.organizacion_id = v_org and s.activo and s.rol::text in ('supervisor', 'administrador')
                    and (cardinality(s.sedes) = 0 or a.sucursal_id = any (s.sedes))) then
    raise exception 'La persona elegida no es supervisor de esta sucursal.' using errcode = 'PF403';
  end if;
  p := piefirme_app.ctl_verificar_pin_perfil(v_org, p_supervisor, p_pin);
  if not (p ->> 'ok')::boolean then return p; end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_atencion set estado = 'cancelada', fin_en = greatest(now(), inicio_en), motivo_cancelacion = v_mot, autorizado_por = p_supervisor, cerrada_por = auth.uid() where id = a.id;
  perform piefirme_app.ctl_alerta_nueva(v_org, a.sucursal_id, 'atencion_cancelada', format('Se canceló una atención (%s) con clave de supervisor. Motivo: %s', coalesce(a.paciente_ref, 's/ref'), v_mot), 'ctl_atencion', a.id);
  return jsonb_build_object('ok', true, 'id', a.id, 'estado', 'cancelada');
end $$;

-- ───────────────────────────── lista de atenciones ─────────────────────────────
-- Quien captura ve las de su sucursal (estado, ticket, motivo); la marca «sin cobro» (vencida) solo se entrega a dueño y supervisor.
create or replace function piefirme.ctl_atenciones_listar(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_sedes uuid[] := piefirme_app.ctl_sedes_filtro(v_org, coalesce(p_filtros, '{}'::jsonb)); v_ver boolean := piefirme_app.ctl_puede('ver_directo');
        r record; v_estado text := nullif(p_filtros ->> 'estado', ''); v_lim integer := least(coalesce(nullif(p_filtros ->> 'limite', '')::integer, 100), 300);
        v_solo_mias boolean := coalesce((p_filtros ->> 'solo_mias')::boolean, false);
begin
  select * into r from piefirme_app.ctl_rango(v_org, coalesce(p_filtros, '{}'::jsonb), 7);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio_en desc) from (
    select a.id, a.sucursal_id, sd.nombre as sucursal, a.servicio_id, sv.nombre as servicio, a.paciente_ref, a.usuario_atiende,
           trim(pa.nombre || ' ' || coalesce(pa.apellidos, '')) as atiende, a.inicio_en, a.fin_en, a.estado, vt.folio as ticket, a.ticket_id, a.motivo_cancelacion,
           trim(ps.nombre || ' ' || coalesce(ps.apellidos, '')) as autorizo, a.origen_tipo,
           case when a.estado = 'abierta' then round(extract(epoch from (now() - a.inicio_en)) / 60.0)::integer end as minutos_abierta,
           case when v_ver then (a.estado = 'abierta' and a.inicio_en < now() - make_interval(mins => piefirme_app.ctl_cfg_num(v_org, 'atencion_sin_ticket_min', a.sucursal_id)::integer)) end as sin_ticket
      from piefirme.ctl_atencion a
      join piefirme.sedes sd on sd.id = a.sucursal_id
      left join piefirme.servicios sv on sv.id = a.servicio_id
      left join piefirme.perfiles pa on pa.id = a.usuario_atiende
      left join piefirme.perfiles ps on ps.id = a.autorizado_por
      left join piefirme.ventas vt on vt.id = a.ticket_id
     where a.organizacion_id = v_org and a.sucursal_id = any (v_sedes) and a.inicio_en >= r.v_ini and a.inicio_en < r.v_fin
       and (v_estado is null or a.estado = v_estado) and (not v_solo_mias or a.usuario_atiende = auth.uid())
     order by a.inicio_en desc limit v_lim) x), '[]'::jsonb);
end $$;

-- ───────────────────────────── ligar solas las atenciones nacidas de una consulta cuyo ticket ya se cobró ─────────────────────────────
create or replace function piefirme_app.ctl_atencion_autoligar(p_org uuid, p_sucursal uuid default null) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a record; v_venta uuid; r record; c jsonb; v_n integer := 0; v_cita uuid; v_pac uuid;
begin
  for a in select x.* from piefirme.ctl_atencion x where x.organizacion_id = p_org and x.estado = 'abierta' and x.origen_tipo = 'consulta'
              and (p_sucursal is null or x.sucursal_id = p_sucursal) order by x.inicio_en limit 500 loop
    v_venta := null;
    select co.cita_id, co.paciente_id into v_cita, v_pac from piefirme.consultas co where co.id = a.origen_id;
    for r in select v.id from piefirme.ventas v
              where v.organizacion_id = p_org and v.sede_id = a.sucursal_id and v.estado in ('cobrada', 'por_facturar', 'facturada')
                and ((v_cita is not null and v.cita_id = v_cita)
                  or (v_pac is not null and v.paciente_id = v_pac and v.cobrada_en >= a.inicio_en - interval '2 hours' and v.cobrada_en < a.inicio_en + interval '24 hours'))
              order by (v.cita_id = v_cita) desc nulls last, v.cobrada_en loop
      c := piefirme_app.ctl_ticket_capacidad(p_org, a.sucursal_id, r.id, a.servicio_id, a.id);
      if (c ->> 'ok')::boolean then v_venta := r.id; exit; end if;
    end loop;
    if v_venta is not null then
      perform piefirme_app.ctl_rpc_on();
      update piefirme.ctl_atencion set estado = 'cerrada_con_ticket', ticket_id = v_venta, fin_en = greatest(now(), inicio_en), cerrada_por = auth.uid() where id = a.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function piefirme.ctl_atenciones_conciliar(p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  if p_sucursal is not null and not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no permitida' using errcode = 'PF403'; end if;
  return jsonb_build_object('ok', true, 'ligadas', piefirme_app.ctl_atencion_autoligar(v_org, p_sucursal));
end $$;

-- ───────────────────────────── hook sobre consultas (apagado por omisión) ─────────────────────────────
-- Al crearse una consulta, si la sucursal lo activó, se abre la atención opaca. NUNCA frena la consulta: cualquier error se descarta con un aviso.
create or replace function piefirme_app.ctl_trg_consulta_atencion() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  begin
    if coalesce(piefirme_app.ctl_config_en(new.organizacion_id, 'atencion_auto_desde_consulta', new.sede_id, now()) #>> '{}', 'no') = 'si' then
      insert into piefirme.ctl_atencion (organizacion_id, sucursal_id, paciente_ref, servicio_id, usuario_atiende, origen_tipo, origen_id)
      values (new.organizacion_id, new.sede_id, piefirme_app.ctl_ref_opaca(new.organizacion_id, new.paciente_id), new.servicio_id, new.podologo_id, 'consulta', new.id)
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'ctl: no se pudo abrir la atención de la consulta %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists t_ctl_atencion on piefirme.consultas;
create trigger t_ctl_atencion after insert on piefirme.consultas for each row execute function piefirme_app.ctl_trg_consulta_atencion();

-- ───────────────────────────── privilegios de ejecución ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_atencion_abrir', 'ctl_atencion_tickets_candidatos', 'ctl_atencion_cerrar_con_ticket', 'ctl_atencion_supervisores',
                  'ctl_atencion_cancelar', 'ctl_atenciones_listar', 'ctl_atenciones_conciliar', 'ctl_atencion_autoligar', 'ctl_verificar_pin_perfil', 'ctl_ref_opaca', 'ctl_ticket_capacidad',
                  'ctl_msg_ticket', 'ctl_o_servicios_cobrados', 'ctl_o_salidas_insumo', 'ctl_o_costo_producto', 'ctl_trg_consulta_atencion', 'ctl_trg_atencion', 'ctl_trg_ocupacion', 'ctl_trg_ocupacion_fija') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma);
    else execute format('revoke all on function %s from authenticated', f.firma); end if;
  end loop;
end $$;
