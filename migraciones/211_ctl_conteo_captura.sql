-- 211 · Control y Auditoría · ETAPA 2 · MOTOR DE CONTEO (1/3): lectura del origen, lista (completa | custodia | aleatoria ponderada | libre),
-- inicio de sesión por modo y CAPTURA A CIEGAS de una partida.
--   · Lectura del origen del lado del servidor: piefirme_app.ctl_o_* (independientes del rol; un rol de sucursal NO puede leer v_ctl_saldos, pero el
--     servidor sí congela el saldo). Si el origen cambia, se reimplementan estas funciones junto con las v_ctl_* (contrato de desacoplamiento D3).
--   · La captura responde SOLO ok + el siguiente producto: jamás saldo, diferencia ni valor. Única excepción (spec F2.1): auditoria_puntual
--     ejecutada por supervisor o dueño, que recibe la diferencia al instante bajo la clave «revision».
--   · Idempotencia: el id de la partida lo genera el cliente; un reenvío con el mismo id devuelve la misma respuesta y no duplica.
-- Depende de: 200–206, 210.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── lectura del origen (solo servidor) ─────────────────────────────
create or replace function piefirme_app.ctl_hoy(p_org uuid) returns date
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select (now() at time zone coalesce((select o.zona_horaria from piefirme.organizaciones o where o.id = p_org), 'America/Mexico_City'))::date
$$;

create or replace function piefirme_app.ctl_o_saldo(p_org uuid, p_sede uuid, p_producto uuid) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select i.existencia from piefirme.inventario_sede i where i.organizacion_id = p_org and i.sede_id = p_sede and i.producto_id = p_producto), 0)
$$;

-- Precio vigente y desde cuándo (misma regla que v_ctl_productos).
create or replace function piefirme_app.ctl_o_precio(p_org uuid, p_producto uuid) returns table (precio numeric, desde date)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select x.precio, x.vigente_desde from piefirme.precios x
   where x.producto_id = p_producto and x.organizacion_id = p_org and x.item_tipo = 'producto'
     and x.vigente_desde <= piefirme_app.ctl_hoy(p_org) and (x.vigente_hasta is null or x.vigente_hasta >= piefirme_app.ctl_hoy(p_org))
   order by (x.sede_id is null) desc, x.vigente_desde desc limit 1
$$;

-- ¿La etiqueta coincide con un precio que estuvo vigente dentro de la ventana de gracia (anterior al vigente)?
create or replace function piefirme_app.ctl_o_precio_previo(p_org uuid, p_producto uuid, p_etiqueta numeric, p_desde_vigente date, p_gracia integer, p_tolerancia numeric) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.precios x
                  where x.producto_id = p_producto and x.organizacion_id = p_org and x.item_tipo = 'producto'
                    and x.vigente_desde < p_desde_vigente
                    and coalesce(x.vigente_hasta, p_desde_vigente) >= piefirme_app.ctl_hoy(p_org) - p_gracia
                    and abs(x.precio - p_etiqueta) <= p_tolerancia)
$$;

-- Cancelaciones y devoluciones con reingreso al inventario de un producto en una sucursal (mismos datos que v_ctl_cancelaciones, por producto).
create or replace function piefirme_app.ctl_o_cancelaciones(p_org uuid, p_sede uuid, p_producto uuid, p_desde timestamptz)
returns table (tipo text, venta_id uuid, ticket text, usuario_id uuid, autorizador uuid, fecha timestamptz, motivo text, cantidad numeric)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select 'cancelacion'::text, v.id, v.folio, v.cancelada_por, null::uuid, v.cancelada_en, v.motivo_cancelacion, sum(l.cantidad)
    from piefirme.ventas v join piefirme.venta_lineas l on l.venta_id = v.id
   where v.organizacion_id = p_org and v.sede_id = p_sede and v.estado = 'cancelada' and v.cancelada_en >= p_desde and l.producto_id = p_producto
   group by v.id, v.folio, v.cancelada_por, v.cancelada_en, v.motivo_cancelacion
  union all
  select 'devolucion'::text, d.venta_id, v.folio, d.created_by, mc.autorizacion_id, d.created_at, d.motivo, d.cantidad
    from piefirme.devoluciones_venta d
    join piefirme.venta_lineas l on l.id = d.venta_linea_id
    join piefirme.ventas v on v.id = d.venta_id
    left join piefirme.movimientos_caja mc on mc.id = d.movimiento_caja_id
   where d.organizacion_id = p_org and d.sede_id = p_sede and d.reingresa_inventario and d.created_at >= p_desde and l.producto_id = p_producto
  order by 6 desc
$$;

-- Valor de un parámetro de configuración como número.
create or replace function piefirme_app.ctl_cfg_num(p_org uuid, p_clave text, p_sucursal uuid) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select (piefirme_app.ctl_config_en(p_org, p_clave, p_sucursal, now()) #>> '{}')::numeric
$$;

-- ───────────────────────────── siguiente producto de la lista (sin precio, costo ni existencia) ─────────────────────────────
create or replace function piefirme_app.ctl_siguiente(p_sesion uuid) returns jsonb
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select jsonb_build_object('producto_id', p.id, 'descripcion', p.nombre, 'marca', p.marca, 'presentacion', p.presentacion, 'codigo_barras', p.codigo_barras, 'sku', p.sku,
                            'requiere_serie', coalesce(a.requiere_serie, false), 'requiere_sello', coalesce(a.requiere_sello, false), 'orden', l.orden)
    from piefirme.ctl_lista_solicitada l
    join piefirme.productos p on p.id = l.producto_id and p.organizacion_id = l.organizacion_id
    left join piefirme.ctl_producto_atributo a on a.producto_id = p.id and a.organizacion_id = p.organizacion_id
   where l.sesion_id = p_sesion and not l.reportado
   order by l.orden limit 1
$$;

-- Avance sin cifras del sistema: cuántos productos distintos ya se capturaron y cuántos pidió la lista.
create or replace function piefirme_app.ctl_avance(p_sesion uuid) returns jsonb
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select jsonb_build_object(
    'capturadas', (select count(distinct p.producto_id) from piefirme.ctl_partida_conteo p where p.sesion_id = p_sesion),
    'en_lista',   (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = p_sesion))
$$;

-- Productos elegibles para la muestra aleatoria de una sucursal: con existencia, no pausados y NO contados en las últimas N horas
-- (24 por omisión) en esa misma sucursal, salvo que la sesión pida incluirlos.
create or replace function piefirme_app.ctl_elegibles(p_org uuid, p_sucursal uuid, p_incluir_recientes boolean) returns table (producto_id uuid, costo numeric)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select i.producto_id, p.costo_promedio
    from piefirme.inventario_sede i join piefirme.productos p on p.id = i.producto_id and p.organizacion_id = i.organizacion_id
   where i.organizacion_id = p_org and i.sede_id = p_sucursal and i.existencia > 0 and p.estado <> 'pausado'
     and (p_incluir_recientes or not exists (
           select 1 from piefirme.ctl_partida_conteo c
            where c.organizacion_id = p_org and c.sucursal_id = p_sucursal and c.producto_id = i.producto_id
              and c.escaneado_en >= now() - make_interval(secs => piefirme_app.ctl_cfg_num(p_org, 'aleatoria_excluir_horas', p_sucursal) * 3600)))
$$;

-- ───────────────────────────── generación de la lista ─────────────────────────────
-- completa: todo lo que la sucursal tiene en existencia · custodia: hasta 30 productos activos · libre: sin lista ·
-- aleatoria PONDERADA (F2.2), elegida SOLO aquí (nunca por el usuario):
--   peso = 1 + costo/costo_máx + rotación_30d/rotación_máx + 3 × min(diferencias previas en esa sucursal, 5)/5
--   (las diferencias previas pesan hasta 3 veces; costo y rotación hasta 1 cada uno) y sorteo sin reemplazo por «carrera exponencial»
--   (orden por -ln(1-random())/peso). Se excluyen los productos contados en las últimas N horas en la misma sucursal (24 por omisión)
--   salvo que la sesión lo pida. La lista se guarda en ctl_lista_solicitada ANTES de mostrarse: esta función corre dentro de la misma
--   transacción que crea la sesión y el cliente no recibe nada hasta que termina.
create or replace function piefirme_app.ctl_generar_lista(p_org uuid, p_sesion uuid, p_sucursal uuid, p_modo text, p_muestra integer, p_incluir_recientes boolean) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_n integer := 0;
begin
  perform piefirme_app.ctl_rpc_on();
  if p_modo = 'libre' then return 0; end if;
  if p_modo = 'completa' then
    insert into piefirme.ctl_lista_solicitada (organizacion_id, sucursal_id, sesion_id, producto_id, orden)
    select p_org, p_sucursal, p_sesion, i.producto_id, (row_number() over (order by p.nombre, i.producto_id))::integer
      from piefirme.inventario_sede i join piefirme.productos p on p.id = i.producto_id and p.organizacion_id = i.organizacion_id
     where i.organizacion_id = p_org and i.sede_id = p_sucursal and i.existencia > 0 and p.estado <> 'pausado';
  elsif p_modo = 'custodia' then
    insert into piefirme.ctl_lista_solicitada (organizacion_id, sucursal_id, sesion_id, producto_id, orden)
    select p_org, p_sucursal, p_sesion, c.producto_id, (row_number() over (order by p.nombre, c.producto_id))::integer
      from piefirme.ctl_producto_custodia c join piefirme.productos p on p.id = c.producto_id and p.organizacion_id = c.organizacion_id
     where c.organizacion_id = p_org and c.sucursal_id = p_sucursal and c.activo;
  elsif p_modo = 'aleatoria' then
    insert into piefirme.ctl_lista_solicitada (organizacion_id, sucursal_id, sesion_id, producto_id, orden)
    select p_org, p_sucursal, p_sesion, s.producto_id, (row_number() over (order by s.clave))::integer
      from (
        with elegibles as (
          select e.producto_id, e.costo from piefirme_app.ctl_elegibles(p_org, p_sucursal, p_incluir_recientes) e
        ), rot as (
          select l.producto_id, sum(l.cantidad) as piezas
            from piefirme.venta_lineas l join piefirme.ventas v on v.id = l.venta_id
           where l.organizacion_id = p_org and l.sede_id = p_sucursal and l.producto_id is not null and v.estado <> 'cancelada'
             and coalesce(v.cobrada_en, v.created_at) >= now() - interval '30 days'
           group by l.producto_id
        ), prev as (
          select c.producto_id, count(distinct c.sesion_id) as n from piefirme.ctl_partida_calculo c
           where c.organizacion_id = p_org and c.sucursal_id = p_sucursal and c.diferencia_piezas <> 0 group by c.producto_id
        ), base as (
          select e.producto_id, e.costo, coalesce(r.piezas, 0) as piezas, coalesce(pv.n, 0) as difs,
                 max(e.costo) over () as costo_max, max(coalesce(r.piezas, 0)) over () as piezas_max
            from elegibles e left join rot r on r.producto_id = e.producto_id left join prev pv on pv.producto_id = e.producto_id
        )
        select b.producto_id,
               (-ln(1 - random())) / (1 + coalesce(b.costo / nullif(b.costo_max, 0), 0) + coalesce(b.piezas / nullif(b.piezas_max, 0), 0)
                                        + 3 * least(b.difs, 5) / 5.0) as clave
          from base b order by clave limit p_muestra
      ) s;
  else
    raise exception 'modo de lista desconocido: %', p_modo using errcode = 'PF400';
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ───────────────────────────── iniciar sesión (conteo inicial, apertura, relevo, auditoría puntual) ─────────────────────────────
-- Quién inicia cada modo (spec F2): conteo_inicial → dueño o supervisor · conteo_apertura → quien abre la sucursal (cualquiera que capture)
-- · relevo_turno → quien entra al turno · auditoria_puntual → supervisor o dueño. La remota la lanza SOLO el dueño (ctl_remota_lanzar, 212).
create or replace function piefirme.ctl_sesion_iniciar(p_tipo text, p_sucursal uuid, p_opciones jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_rol text := piefirme_app.ctl_rol(); v_modo text; v_muestra integer; v_inc boolean; v_pide boolean;
        v_id uuid; v_folio text; v_n integer; v_turno uuid; v_turno_ent piefirme.turnos_caja%rowtype; v_turno_sal piefirme.turnos_caja%rowtype; v_ex piefirme.ctl_sesion_conteo%rowtype;
        v_entrega uuid; v_tope numeric; v_en_custodia integer; v_opc jsonb := coalesce(p_opciones, '{}'::jsonb);
begin
  if p_tipo is null or p_tipo not in ('conteo_inicial', 'conteo_apertura', 'relevo_turno', 'auditoria_puntual') then
    raise exception 'tipo de sesión no válido aquí (la auditoría remota se lanza con ctl_remota_lanzar): %', p_tipo using errcode = 'PF400';
  end if;
  if not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org and s.activa) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  if p_tipo in ('conteo_inicial', 'auditoria_puntual') and v_rol not in ('dueno', 'supervisor') then
    raise exception 'Solo el dueño o un supervisor puede iniciar un % .', case p_tipo when 'conteo_inicial' then 'conteo inicial' else 'auditoría puntual' end using errcode = 'PF403';
  end if;
  -- sesión abierta del mismo modo en la sucursal: no se apilan; se devuelve para retomarla
  select * into v_ex from piefirme.ctl_sesion_conteo where organizacion_id = v_org and sucursal_id = p_sucursal and tipo = p_tipo and estado = 'abierta';
  if found then
    return jsonb_build_object('ok', false, 'error', 'sesion_abierta', 'sesion_id', v_ex.id, 'folio', v_ex.folio, 'propia', v_ex.usuario_captura = auth.uid(),
                              'mensaje', 'Ya hay una sesión abierta de este tipo en la sucursal (' || v_ex.folio || '). Ciérrala o retómala antes de iniciar otra.');
  end if;

  v_modo := case p_tipo when 'relevo_turno' then 'custodia' when 'auditoria_puntual' then coalesce(nullif(v_opc ->> 'modo_lista', ''), 'aleatoria') else 'completa' end;
  if v_modo not in ('completa', 'custodia', 'aleatoria', 'libre') or (p_tipo = 'auditoria_puntual' and v_modo not in ('aleatoria', 'libre')) then
    raise exception 'modo de lista no permitido para %: %', p_tipo, v_modo using errcode = 'PF400';
  end if;
  v_inc := coalesce((v_opc ->> 'incluir_recientes')::boolean, false);
  v_pide := coalesce((v_opc ->> 'pide_precio')::boolean, false);
  if v_modo = 'aleatoria' then
    v_muestra := coalesce(nullif(v_opc ->> 'muestra', '')::integer, piefirme_app.ctl_cfg_num(v_org, 'muestra_aleatoria', p_sucursal)::integer);
    select d.tope into v_tope from piefirme.ctl_config_def d where d.clave = 'muestra_aleatoria';
    if v_muestra < 1 or v_muestra > v_tope then
      raise exception 'La muestra aleatoria debe estar entre 1 y % piezas. Una muestra mayor toma tanto tiempo que se termina capturando sin contar, y eso genera evidencia falsa.', v_tope::integer using errcode = 'PF422';
    end if;
  end if;

  if p_tipo = 'relevo_turno' then
    v_turno := coalesce(nullif(v_opc ->> 'turno_id', '')::uuid,
                        (select t.id from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = p_sucursal and t.estado = 'abierto' and t.cajero_id = auth.uid() order by t.apertura_en desc limit 1));
    select * into v_turno_ent from piefirme.turnos_caja t where t.id = v_turno and t.organizacion_id = v_org and t.sede_id = p_sucursal;
    if not found or v_turno_ent.cajero_id is distinct from auth.uid() then raise exception 'Abre tu turno de caja antes de iniciar el relevo: el relevo lo cuenta quien entra al turno.' using errcode = 'PF409'; end if;
    select count(*) into v_en_custodia from piefirme.ctl_producto_custodia c where c.organizacion_id = v_org and c.sucursal_id = p_sucursal and c.activo;
    if v_en_custodia = 0 then raise exception 'La sucursal no tiene productos en custodia: no hay nada que contar en el relevo.' using errcode = 'PF422'; end if;
    select * into v_turno_sal from piefirme.turnos_caja t
     where t.organizacion_id = v_org and t.sede_id = p_sucursal and t.id <> v_turno_ent.id and t.apertura_en < v_turno_ent.apertura_en
       and t.apertura_en >= v_turno_ent.apertura_en - make_interval(secs => piefirme_app.ctl_cfg_num(v_org, 'relevo_ventana_horas', p_sucursal) * 3600)
     order by t.apertura_en desc limit 1;
    if not found then raise exception 'No hay un turno saliente reciente en la sucursal: no se requiere relevo.' using errcode = 'PF422'; end if;
    if v_turno_sal.cajero_id = auth.uid() then raise exception 'El relevo lo cuenta quien entra, no quien sale: no puede ser la misma persona.' using errcode = 'PF403'; end if;
    if exists (select 1 from piefirme.ctl_entrega_turno e where e.organizacion_id = v_org and e.turno_entrante_id = v_turno_ent.id and e.estado in ('aceptada', 'aceptada_con_diferencia')) then
      raise exception 'La entrega de este turno ya fue aceptada.' using errcode = 'PF409';
    end if;
    if exists (select 1 from piefirme.ctl_entrega_turno e where e.organizacion_id = v_org and e.turno_entrante_id = v_turno_ent.id and e.estado in ('por_aceptar', 'con_diferencia')) then
      raise exception 'Ya contaste la custodia de este turno: falta aceptar la entrega.' using errcode = 'PF409';
    end if;
  else
    v_turno := (select t.id from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = p_sucursal and t.estado = 'abierto' and t.cajero_id = auth.uid() order by t.apertura_en desc limit 1);
  end if;

  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, usuario_captura, turno_id, pide_precio, tamano_muestra, incluir_recientes, recibida_en, hora_cliente)
  values (v_org, p_sucursal, p_tipo, v_modo, auth.uid(), v_turno, v_pide, v_muestra, v_inc, now(), nullif(v_opc ->> 'hora_cliente', '')::timestamptz)
  returning id, folio into v_id, v_folio;
  v_n := piefirme_app.ctl_generar_lista(v_org, v_id, p_sucursal, v_modo, v_muestra, v_inc);
  if v_n = 0 and v_modo <> 'libre' then
    raise exception 'No hay productos que contar en esta sucursal con este modo de lista (revise existencias o la lista de custodia).' using errcode = 'PF422';
  end if;

  if p_tipo = 'relevo_turno' then
    select e.id into v_entrega from piefirme.ctl_entrega_turno e where e.organizacion_id = v_org and e.turno_entrante_id = v_turno_ent.id and e.estado <> 'cancelada';
    if v_entrega is null then
      insert into piefirme.ctl_entrega_turno (organizacion_id, sucursal_id, sesion_id, turno_saliente_id, turno_entrante_id, usuario_saliente, usuario_entrante, en_custodia)
      values (v_org, p_sucursal, v_id, v_turno_sal.id, v_turno_ent.id, v_turno_sal.cajero_id, auth.uid(), v_n) returning id into v_entrega;
    else   -- la entrega ya existía (p. ej. marcada «no aceptada» porque el entrante tardó): se retoma con esta sesión
      update piefirme.ctl_entrega_turno set sesion_id = v_id, estado = 'contando', en_custodia = v_n, usuario_entrante = auth.uid() where id = v_entrega and estado <> 'contando';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'sesion_id', v_id, 'folio', v_folio, 'tipo', p_tipo, 'modo_lista', v_modo, 'en_lista', v_n, 'pide_precio', v_pide,
                            'entrega_id', v_entrega, 'siguiente', piefirme_app.ctl_siguiente(v_id));
end $$;

-- ───────────────────────────── abrir (retomar) una sesión: la sucursal abre una auditoría remota o retoma la suya ─────────────────────────────
-- En la remota quien la abre primero queda como quien captura; se registra el tiempo de respuesta (de la solicitud a la apertura).
create or replace function piefirme.ctl_sesion_abrir(p_sesion uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); s piefirme.ctl_sesion_conteo%rowtype;
begin
  perform piefirme_app.ctl_expirar_vencidas(v_org);
  select * into s from piefirme.ctl_sesion_conteo where id = p_sesion and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(s.sucursal_id) then raise exception 'sesión no encontrada' using errcode = 'PF404'; end if;
  if s.estado <> 'abierta' then
    return jsonb_build_object('ok', false, 'error', s.estado, 'estado', s.estado, 'mensaje', case s.estado when 'expirada' then 'El tiempo límite de esta sesión venció.' else 'La sesión ya no está abierta.' end);
  end if;
  if s.usuario_captura is not null and s.usuario_captura <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'otra_persona', 'mensaje', 'Otra persona ya abrió esta sesión en la sucursal.');
  end if;
  if s.usuario_captura is null then
    perform piefirme_app.ctl_rpc_on();
    update piefirme.ctl_sesion_conteo set usuario_captura = auth.uid(), recibida_en = now(),
           respuesta_seg = case when solicitada_en is not null then greatest(0, round(extract(epoch from (now() - solicitada_en)))::integer) end
     where id = s.id;
  end if;
  return jsonb_build_object('ok', true, 'sesion_id', s.id, 'folio', s.folio, 'tipo', s.tipo, 'modo_lista', s.modo_lista, 'limite_en', s.limite_en, 'pide_precio', s.pide_precio,
                            'avance', piefirme_app.ctl_avance(s.id), 'siguiente', piefirme_app.ctl_siguiente(s.id));
end $$;

-- ───────────────────────────── CAPTURAR UNA PARTIDA (a ciegas) ─────────────────────────────
-- Entra: el código escaneado, la cantidad física y, según el caso, el precio de etiqueta, la serie y el sello. El servidor congela el saldo
-- en ese instante, calcula las diferencias y clasifica el precio; NADA de eso regresa a quien captura.
-- Respuesta: { ok, idempotente, partida_id, avance:{capturadas,en_lista}, siguiente }  (errores de dominio: { ok:false, error, mensaje }).
-- p_clasificacion: SOLO para el auditor (supervisor/dueño) en auditoria_puntual: etiqueta_anterior | etiqueta_mal_puesta | revisar.
create or replace function piefirme.ctl_capturar_partida(p_id uuid, p_sesion uuid, p_codigo text, p_cantidad numeric, p_precio_etiqueta numeric default null,
    p_numero_serie text default null, p_folio_sello text default null, p_sello_intacto boolean default null, p_nota text default null,
    p_hora_cliente timestamptz default null, p_clasificacion text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); s piefirme.ctl_sesion_conteo%rowtype; ex piefirme.ctl_partida_conteo%rowtype; pr piefirme.productos%rowtype;
        a piefirme.ctl_producto_atributo%rowtype; v_cod text := btrim(coalesce(p_codigo, '')); v_n integer; v_lista piefirme.ctl_lista_solicitada%rowtype;
        v_prev uuid; v_saldo numeric; v_dif numeric; v_costo numeric; v_cat numeric; v_desde date; v_tol numeric; v_gracia integer; v_clase text; v_manual boolean := false;
        v_dprecio numeric; v_revision boolean; v_resp jsonb;
begin
  if p_id is null then raise exception 'la captura debe traer su id (lo genera el dispositivo para que un reenvío no duplique)' using errcode = 'PF400'; end if;

  -- idempotencia: mismo id = misma captura (no se vuelve a escribir)
  select * into ex from piefirme.ctl_partida_conteo where id = p_id;
  if found then
    if ex.organizacion_id <> v_org or ex.sesion_id <> p_sesion or ex.creado_por is distinct from auth.uid() then
      raise exception 'el id de captura ya fue usado en otra sesión' using errcode = 'PF409';
    end if;
    return jsonb_build_object('ok', true, 'idempotente', true, 'partida_id', ex.id, 'avance', piefirme_app.ctl_avance(p_sesion), 'siguiente', piefirme_app.ctl_siguiente(p_sesion));
  end if;

  perform piefirme_app.ctl_expirar_vencidas(v_org);
  select * into s from piefirme.ctl_sesion_conteo where id = p_sesion and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(s.sucursal_id) then raise exception 'sesión no encontrada' using errcode = 'PF404'; end if;
  if s.estado <> 'abierta' then
    return jsonb_build_object('ok', false, 'error', s.estado, 'mensaje', case s.estado when 'expirada' then 'El tiempo límite de la sesión venció: ya no recibe capturas.' else 'La sesión ya no está abierta.' end);
  end if;
  if s.usuario_captura is not null and s.usuario_captura <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'otra_persona', 'mensaje', 'Esta sesión la captura otra persona.');
  end if;
  if p_cantidad is null or p_cantidad < 0 then return jsonb_build_object('ok', false, 'error', 'cantidad_invalida', 'mensaje', 'Escribe cuántas piezas hay (0 o más).'); end if;
  if v_cod = '' then return jsonb_build_object('ok', false, 'error', 'codigo_vacio', 'mensaje', 'Escanea o escribe el código del producto.'); end if;
  if p_precio_etiqueta is not null and p_precio_etiqueta < 0 then return jsonb_build_object('ok', false, 'error', 'precio_invalido', 'mensaje', 'El precio de la etiqueta no puede ser negativo.'); end if;
  if p_nota is not null and length(p_nota) > 500 then return jsonb_build_object('ok', false, 'error', 'nota_larga', 'mensaje', 'La nota admite hasta 500 caracteres.'); end if;

  -- producto por código de barras, SKU o clave alterna (con o sin ceros a la izquierda)
  select count(*) into v_n from piefirme.productos p where p.organizacion_id = v_org and p.estado <> 'pausado' and (p.codigo_barras = v_cod or p.sku = v_cod or p.clave_alterna = v_cod);
  if v_n > 0 then
    select * into pr from piefirme.productos p where p.organizacion_id = v_org and p.estado <> 'pausado' and (p.codigo_barras = v_cod or p.sku = v_cod or p.clave_alterna = v_cod)
     order by (p.codigo_barras = v_cod) desc, (p.estado = 'activo') desc, p.created_at limit 1;
  else
    select * into pr from piefirme.productos p where p.organizacion_id = v_org and p.estado <> 'pausado' and p.codigo_barras is not null
       and ltrim(p.codigo_barras, '0') = ltrim(v_cod, '0') and ltrim(v_cod, '0') <> '' order by (p.estado = 'activo') desc, p.created_at limit 1;
  end if;
  if pr.id is null then return jsonb_build_object('ok', false, 'error', 'codigo_no_encontrado', 'mensaje', 'Ese código no corresponde a ningún producto del catálogo.'); end if;

  -- en las listas cerradas (aleatoria y custodia) solo se captura lo pedido
  select * into v_lista from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id and l.producto_id = pr.id;
  if s.modo_lista in ('aleatoria', 'custodia') and v_lista.id is null then
    return jsonb_build_object('ok', false, 'error', 'fuera_de_lista', 'mensaje', 'Ese producto no está en la lista de esta sesión.');
  end if;
  select * into a from piefirme.ctl_producto_atributo x where x.organizacion_id = v_org and x.producto_id = pr.id;
  if coalesce(a.requiere_serie, false) and coalesce(btrim(p_numero_serie), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'falta_serie', 'mensaje', 'Este producto exige capturar su número de serie.');
  end if;
  if coalesce(a.requiere_sello, false) and (coalesce(btrim(p_folio_sello), '') = '' or p_sello_intacto is null) then
    return jsonb_build_object('ok', false, 'error', 'falta_sello', 'mensaje', 'Este producto exige el folio del sello y si está intacto.');
  end if;
  if s.pide_precio and p_precio_etiqueta is null then
    return jsonb_build_object('ok', false, 'error', 'falta_precio_etiqueta', 'mensaje', 'Este conteo pide el precio de la etiqueta.');
  end if;

  -- cálculo en el servidor: saldo congelado ahora, costo, precio vigente y clasificación del precio de etiqueta
  v_saldo := piefirme_app.ctl_o_saldo(v_org, s.sucursal_id, pr.id);
  v_dif := p_cantidad - v_saldo;
  v_costo := coalesce(pr.costo_promedio, 0);
  select x.precio, x.desde into v_cat, v_desde from piefirme_app.ctl_o_precio(v_org, pr.id) x;
  v_dprecio := case when p_precio_etiqueta is not null and v_cat is not null then p_precio_etiqueta - v_cat end;
  if p_precio_etiqueta is not null then
    v_tol := piefirme_app.ctl_cfg_num(v_org, 'tolerancia_precio_etiqueta', s.sucursal_id);
    v_gracia := piefirme_app.ctl_cfg_num(v_org, 'dias_gracia_precio', s.sucursal_id)::integer;
    if v_cat is null then v_clase := 'revisar';
    elsif abs(v_dprecio) <= v_tol then v_clase := 'coincide';
    elsif v_desde >= piefirme_app.ctl_hoy(v_org) - v_gracia and piefirme_app.ctl_o_precio_previo(v_org, pr.id, p_precio_etiqueta, v_desde, v_gracia, v_tol) then v_clase := 'etiqueta_anterior';
    else v_clase := 'revisar'; end if;
  end if;
  -- el auditor (solo auditoría puntual) puede clasificar en el momento
  v_revision := s.tipo = 'auditoria_puntual' and piefirme_app.ctl_rol() in ('dueno', 'supervisor');
  if p_clasificacion is not null then
    if not v_revision then raise exception 'Solo el auditor (supervisor o dueño) en una auditoría puntual clasifica el precio de la etiqueta.' using errcode = 'PF403'; end if;
    if p_clasificacion not in ('etiqueta_anterior', 'etiqueta_mal_puesta', 'revisar') then raise exception 'clasificación no válida: %', p_clasificacion using errcode = 'PF400'; end if;
    if p_precio_etiqueta is null or v_clase = 'coincide' then raise exception 'No hay diferencia de precio que clasificar.' using errcode = 'PF422'; end if;
    v_clase := p_clasificacion; v_manual := true;
  end if;

  -- la captura repetida del mismo producto es una corrección: fila nueva que referencia la anterior (nada se edita)
  select p.id into v_prev from piefirme.ctl_partida_conteo p
   where p.sesion_id = s.id and p.producto_id = pr.id and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)
   order by p.escaneado_en desc limit 1;

  insert into piefirme.ctl_partida_conteo (id, organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, precio_etiqueta,
                                           numero_serie, folio_sello, sello_intacto, nota, hora_cliente, corrige_a)
  values (p_id, v_org, s.sucursal_id, s.id, pr.id, v_cod, p_cantidad, p_precio_etiqueta, nullif(btrim(p_numero_serie), ''), nullif(btrim(p_folio_sello), ''), p_sello_intacto,
          nullif(btrim(p_nota), ''), p_hora_cliente, v_prev);
  insert into piefirme.ctl_partida_calculo (partida_id, organizacion_id, sucursal_id, sesion_id, producto_id, saldo_sistema, diferencia_piezas, costo_unitario, diferencia_valor,
                                            precio_catalogo, diferencia_precio, clasificacion_precio, clasificacion_manual)
  values (p_id, v_org, s.sucursal_id, s.id, pr.id, v_saldo, v_dif, v_costo, round(v_dif * v_costo, 2), v_cat, v_dprecio, v_clase, v_manual);

  perform piefirme_app.ctl_rpc_on();
  if v_lista.id is not null then update piefirme.ctl_lista_solicitada set reportado = true where id = v_lista.id and not reportado; end if;
  if s.usuario_captura is null then
    update piefirme.ctl_sesion_conteo set usuario_captura = auth.uid(), recibida_en = coalesce(recibida_en, now()),
           respuesta_seg = case when solicitada_en is not null then greatest(0, round(extract(epoch from (now() - solicitada_en)))::integer) end where id = s.id;
  end if;

  v_resp := jsonb_build_object('ok', true, 'idempotente', false, 'partida_id', p_id, 'corrige', v_prev is not null,
                               'avance', piefirme_app.ctl_avance(s.id), 'siguiente', piefirme_app.ctl_siguiente(s.id));
  -- EXCEPCIÓN única: el auditor de una auditoría puntual ve la diferencia al instante (quien la ve no es quien responde por el faltante)
  if v_revision then
    v_resp := v_resp || jsonb_build_object('revision', jsonb_build_object('diferencia_piezas', v_dif, 'diferencia_valor', round(v_dif * v_costo, 2),
                                           'clasificacion_precio', v_clase, 'precio_catalogo', v_cat, 'diferencia_precio', v_dprecio, 'descripcion', pr.nombre));
  end if;
  return v_resp;
end $$;

-- las funciones internas no se ejecutan desde la app (solo desde las RPC SECURITY DEFINER)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'piefirme_app' and p.proname in ('ctl_hoy', 'ctl_o_saldo', 'ctl_o_precio', 'ctl_o_precio_previo', 'ctl_o_cancelaciones', 'ctl_cfg_num', 'ctl_siguiente', 'ctl_avance', 'ctl_generar_lista', 'ctl_elegibles'))
               or (n.nspname = 'piefirme' and p.proname in ('ctl_sesion_iniciar', 'ctl_sesion_abrir', 'ctl_capturar_partida')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
