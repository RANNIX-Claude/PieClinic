-- 293 · Control y Auditoría · ETAPA 1 · (4/4) EVENTOS DEL ORIGEN HACIA EL MÓDULO Y APERTURA DE CAJÓN SIN VENTA (F1.5).
-- La cola es ctl_eventos_entrada (Etapa 0; idempotente por organización + origen + id_externo). El origen escribe una fila por cada hecho y el módulo la
-- drena por poleo cada 30 s (ctl_eventos_drenar_org / ctl_eventos_drenar_todas; ejemplo: scripts/auditoria-eventos-poleo.mjs).
--   venta_registrada ........... trigger sobre ventas (por_cobrar/cuenta_abierta → cobrada/por_facturar; incluye las sincronizadas desde offline)
--   cancelacion_solicitada ..... ctl_cancelacion_solicitar (292)         devolucion_solicitada ... ctl_devolucion_solicitar (292)
--   cajon_abierto_sin_venta .... ctl_cajon_abrir (esta migración); el pulso real del hardware llamará a la MISMA RPC con p_origen = 'hardware'
--   precio_modificado_en_catalogo  trigger sobre precios (cada versión nueva)
--   turno_abierto / turno_cerrado  triggers sobre turnos_caja
--   recepcion_registrada ....... trigger sobre recepciones (mercancía recibida contra orden de compra; origen 'piefirme'). La recepción con responsiva del propio
--                                módulo (Etapa 7) ya emite la suya con origen 'ctl': son hechos distintos, no se duplican.
-- REGLA DE ORO: un evento que falla NUNCA rompe la venta, el turno ni el cambio de precio. Todos los triggers escriben por ctl_emitir_evento, que traga cualquier
-- error (queda como aviso en el log del servidor), y además llevan su propio bloque de excepción.
-- Depende de: 200–206, 241, 290–292.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── triggers sobre el origen ─────────────────────────────
create or replace function piefirme_app.ctl_trg_ev_venta() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  begin
    perform piefirme_app.ctl_emitir_evento(new.organizacion_id, 'venta_registrada', 'venta:' || new.id,
      jsonb_build_object('venta_id', new.id, 'ticket', new.folio, 'sucursal_id', new.sede_id, 'usuario_id', coalesce(new.cajero_id, auth.uid()), 'turno_id', new.turno_id,
                         'total', new.total, 'cobrada_en', new.cobrada_en, 'offline', new.folio_offline is not null, 'lineas', (select count(*) from piefirme.venta_lineas l where l.venta_id = new.id)));
  exception when others then
    raise warning 'venta_registrada no se pudo emitir (venta %): %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists t_ctl_ev_venta on piefirme.ventas;
create trigger t_ctl_ev_venta after update of estado on piefirme.ventas for each row
  when (old.estado in ('por_cobrar', 'cuenta_abierta') and new.estado in ('cobrada', 'por_facturar')) execute function piefirme_app.ctl_trg_ev_venta();

create or replace function piefirme_app.ctl_trg_ev_turno() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform piefirme_app.ctl_emitir_evento(new.organizacion_id, 'turno_abierto', 'turno_abierto:' || new.id,
        jsonb_build_object('turno_id', new.id, 'sucursal_id', new.sede_id, 'usuario_id', new.cajero_id, 'caja', new.caja, 'nombre_turno', new.nombre_turno, 'apertura_en', new.apertura_en));
    else
      perform piefirme_app.ctl_emitir_evento(new.organizacion_id, 'turno_cerrado', 'turno_cerrado:' || new.id,
        jsonb_build_object('turno_id', new.id, 'sucursal_id', new.sede_id, 'usuario_id', new.cajero_id, 'caja', new.caja, 'cierre_en', coalesce(new.cierre_en, now())));
    end if;
  exception when others then
    raise warning 'evento de turno no se pudo emitir (turno %): %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists t_ctl_ev_turno_abierto on piefirme.turnos_caja;
create trigger t_ctl_ev_turno_abierto after insert on piefirme.turnos_caja for each row execute function piefirme_app.ctl_trg_ev_turno();
drop trigger if exists t_ctl_ev_turno_cerrado on piefirme.turnos_caja;
create trigger t_ctl_ev_turno_cerrado after update of estado on piefirme.turnos_caja for each row
  when (old.estado = 'abierto' and new.estado <> 'abierto') execute function piefirme_app.ctl_trg_ev_turno();

create or replace function piefirme_app.ctl_trg_ev_precio() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_prev numeric;
begin
  begin
    select p.precio into v_prev from piefirme.precios p
     where p.organizacion_id = new.organizacion_id and p.item_tipo = new.item_tipo and coalesce(p.servicio_id, p.producto_id, p.oferta_id) = coalesce(new.servicio_id, new.producto_id, new.oferta_id)
       and p.sede_id is not distinct from new.sede_id and p.id <> new.id
     order by p.vigente_desde desc, p.created_at desc limit 1;
    perform piefirme_app.ctl_emitir_evento(new.organizacion_id, 'precio_modificado_en_catalogo', 'precio:' || new.id,
      jsonb_build_object('precio_id', new.id, 'item_tipo', new.item_tipo, 'producto_id', new.producto_id, 'servicio_id', new.servicio_id, 'oferta_id', new.oferta_id,
                         'sucursal_id', new.sede_id, 'precio_anterior', v_prev, 'precio_nuevo', new.precio, 'vigente_desde', new.vigente_desde, 'motivo', new.motivo, 'usuario_id', new.creado_por));
  exception when others then
    raise warning 'precio_modificado_en_catalogo no se pudo emitir (precio %): %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists t_ctl_ev_precio on piefirme.precios;
create trigger t_ctl_ev_precio after insert on piefirme.precios for each row execute function piefirme_app.ctl_trg_ev_precio();

create or replace function piefirme_app.ctl_trg_ev_recepcion() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  begin
    perform piefirme_app.ctl_emitir_evento(new.organizacion_id, 'recepcion_registrada', 'recepcion_oc:' || new.id,
      jsonb_build_object('recepcion_id', new.id, 'oc_id', new.oc_id, 'sucursal_id', new.sede_id, 'usuario_id', new.recibio_id, 'folio', new.folio, 'estado', new.estado, 'fecha', new.fecha));
  exception when others then
    raise warning 'recepcion_registrada no se pudo emitir (recepción %): %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists t_ctl_ev_recepcion on piefirme.recepciones;
create trigger t_ctl_ev_recepcion after insert on piefirme.recepciones for each row execute function piefirme_app.ctl_trg_ev_recepcion();

-- ───────────────────────────── apertura de cajón sin venta (F1.5) ─────────────────────────────
-- En la web no hay hardware de cajón: hoy se registran las aperturas MANUALES («Abrir cajón (sin venta)» en Caja). El pulso real de la impresora/cajón (ESC/POS) que no
-- venga de un ticket debe llamar a esta misma RPC con p_origen = 'hardware'. Un ticket en efectivo abre el cajón por su cuenta y NO se reporta aquí.
-- El trigger t_40_cajon (241) llena ctl_apertura_cajon con el usuario, la caja, el motivo y la hora del servidor; el reporte de la Etapa 6 ya la lee.
create or replace function piefirme.ctl_cajon_abrir(p_sucursal uuid, p_caja text default null, p_motivo text default null, p_hora_cliente timestamptz default null,
                                                  p_origen text default 'manual', p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid := coalesce(p_id, gen_random_uuid()); t piefirme.turnos_caja%rowtype; v_ev uuid;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion', 'supervisor') then raise exception 'sin permiso para abrir el cajón' using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  if p_origen not in ('manual', 'hardware') then raise exception 'origen del pulso no válido' using errcode = 'PF400'; end if;
  select * into t from piefirme.turnos_caja where sede_id = p_sucursal and cajero_id = auth.uid() and estado = 'abierto';
  insert into piefirme.ctl_eventos_entrada (organizacion_id, evento, origen, id_externo, payload, estado)
  values (v_org, 'cajon_abierto_sin_venta', 'piefirme', 'cajon:' || v_id, jsonb_build_object('sucursal_id', p_sucursal, 'usuario_id', auth.uid(), 'caja', coalesce(nullif(btrim(p_caja), ''), t.caja),
          'turno_id', t.id, 'motivo', nullif(left(btrim(coalesce(p_motivo, '')), 300), ''), 'fecha', now(), 'hora_cliente', p_hora_cliente, 'origen_pulso', p_origen), 'pendiente')
  on conflict (organizacion_id, origen, id_externo) where id_externo is not null do nothing
  returning id into v_ev;
  if v_ev is null then return jsonb_build_object('ok', true, 'idempotente', true, 'id', v_id); end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'evento_id', v_ev, 'abierto_en', now());
end $$;

-- ───────────────────────────── poleo: drenar la cola ─────────────────────────────
-- Marca como procesados los eventos pendientes y ejecuta lo que el módulo hace con ellos: vence cancelaciones, revisa relevos al abrir/cerrar turno, evalúa ventas de alto
-- valor, y asegura la fila de ctl_apertura_cajon de cada apertura (por si el trigger 241 falló). Un evento que falla queda en 'error' con su mensaje (reintentable).
create or replace function piefirme_app.ctl_eventos_drenar_org(p_org uuid, p_limite integer default 500) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare e piefirme.ctl_eventos_entrada; v_proc integer := 0; v_err integer := 0; v_venc integer; v_por jsonb := '{}'::jsonb; v_min_venta timestamptz; v_turnos boolean := false; v_msg_venta text; v_msg text;
begin
  perform piefirme_app.ctl_rpc_on();
  v_venc := piefirme_app.ctl_cancelacion_vencer(p_org);
  select min(x.creado_en) into v_min_venta from piefirme.ctl_eventos_entrada x where x.organizacion_id = p_org and x.estado in ('pendiente', 'error') and x.evento = 'venta_registrada';
  v_turnos := exists (select 1 from piefirme.ctl_eventos_entrada x where x.organizacion_id = p_org and x.estado in ('pendiente', 'error') and x.evento in ('turno_abierto', 'turno_cerrado'));
  if v_min_venta is not null and to_regprocedure('piefirme_app.ctl_alto_valor_evaluar(uuid,timestamp with time zone)') is not null then
    begin
      perform piefirme_app.ctl_alto_valor_evaluar(p_org, v_min_venta - interval '2 minutes');
    exception when others then v_msg_venta := left(sqlerrm, 300);
    end;
  end if;
  if v_turnos then
    begin perform piefirme_app.ctl_entregas_revisar(p_org); exception when others then raise warning 'ctl_entregas_revisar: %', sqlerrm; end;
  end if;
  for e in select * from piefirme.ctl_eventos_entrada x where x.organizacion_id = p_org and x.estado in ('pendiente', 'error') order by x.creado_en limit greatest(coalesce(p_limite, 500), 1) for update skip locked loop
    begin
      v_msg := null;
      if e.evento = 'venta_registrada' then v_msg := v_msg_venta;
      elsif e.evento = 'cajon_abierto_sin_venta' then
        if nullif(e.payload ->> 'sucursal_id', '') is null then v_msg := 'el evento no trae sucursal_id';
        else
          insert into piefirme.ctl_apertura_cajon (organizacion_id, sucursal_id, evento_id, usuario_id, caja, motivo, abierta_en)
          values (e.organizacion_id, (e.payload ->> 'sucursal_id')::uuid, e.id, nullif(e.payload ->> 'usuario_id', '')::uuid, nullif(e.payload ->> 'caja', ''),
                  nullif(left(e.payload ->> 'motivo', 300), ''), coalesce(nullif(e.payload ->> 'fecha', '')::timestamptz, e.creado_en))
          on conflict do nothing;
        end if;
      end if;
      if v_msg is null then
        update piefirme.ctl_eventos_entrada set estado = 'procesado', procesado_en = now(), error = null where id = e.id;
        v_proc := v_proc + 1; v_por := jsonb_set(v_por, array[e.evento], to_jsonb(coalesce((v_por ->> e.evento)::integer, 0) + 1));
      else
        update piefirme.ctl_eventos_entrada set estado = 'error', error = left(v_msg, 300) where id = e.id;
        v_err := v_err + 1;
      end if;
    exception when others then
      update piefirme.ctl_eventos_entrada set estado = 'error', error = left(sqlerrm, 300) where id = e.id;
      v_err := v_err + 1;
    end;
  end loop;
  return jsonb_build_object('organizacion_id', p_org, 'procesados', v_proc, 'con_error', v_err, 'cancelaciones_vencidas', v_venc, 'por_evento', v_por);
end $$;

-- Todas las clínicas activas (lo llama el script de poleo con el rol de base de datos; no la ejecuta la app).
create or replace function piefirme_app.ctl_eventos_drenar_todas(p_limite integer default 500) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o record; v_res jsonb := '[]'::jsonb;
begin
  for o in select id from piefirme.organizaciones order by id loop
    v_res := v_res || jsonb_build_array(piefirme_app.ctl_eventos_drenar_org(o.id, p_limite));
  end loop;
  return v_res;
end $$;

-- Botón «Procesar ahora» del dueño o supervisor (equivale a un ciclo del poleo para su clínica).
create or replace function piefirme.ctl_eventos_drenar(p_limite integer default 500) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  return piefirme_app.ctl_eventos_drenar_org(v_org, p_limite);
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_trg_ev_venta', 'ctl_trg_ev_turno', 'ctl_trg_ev_precio', 'ctl_trg_ev_recepcion',
                  'ctl_cajon_abrir', 'ctl_eventos_drenar_org', 'ctl_eventos_drenar_todas', 'ctl_eventos_drenar') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
