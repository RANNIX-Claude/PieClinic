-- 212 · Control y Auditoría · ETAPA 2 · MOTOR DE CONTEO (2/3): cierre, expiración, cancelación y detalle de resultado.
-- Al cerrar una sesión el servidor (nunca el dispositivo):
--   · toma la última captura vigente de cada producto (las correcciones son filas nuevas que referencian la anterior),
--   · conteo_inicial: deja el saldo de arranque en ctl_saldo_arranque y NO abre casos; los demás modos abren un caso por cada diferencia
--     (diferencia_inventario | diferencia_precio | diferencia_relevo) con el contexto heredado de la sesión,
--   · trata lo pedido y no reportado igual que una diferencia (caso con contexto.no_reportado),
--   · cruza cada faltante con cancelaciones y devoluciones recientes del producto (F1.4),
--   · busca pares faltante caro / sobrante barato (F2.5, sustitución de código) y los liga en un mismo caso,
--   · guarda el resultado (ctl_sesion_resultado, solo ver diferencias) y avisa al dueño en ctl_alerta.
-- Depende de: 200–206, 210, 211.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── abrir un caso desde el motor ─────────────────────────────
create or replace function piefirme_app.ctl_abrir_caso(p_org uuid, p_sucursal uuid, p_tipo text, p_origen_tipo text, p_origen_id uuid, p_producto uuid, p_cantidad numeric,
    p_valor numeric, p_usuario_captura uuid, p_contexto jsonb, p_turno_sal uuid default null, p_turno_ent uuid default null, p_texto text default null) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid;
begin
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, valor, usuario_captura, turno_saliente_id, turno_entrante_id, contexto)
  values (p_org, p_sucursal, p_tipo, p_origen_tipo, p_origen_id, p_producto, p_cantidad, p_valor, p_usuario_captura, p_turno_sal, p_turno_ent, coalesce(p_contexto, '{}'::jsonb))
  returning id into v_id;
  -- entrada de sistema (sin usuario: no cuenta como «investigó» para la separación de funciones)
  insert into piefirme.ctl_caso_bitacora (organizacion_id, sucursal_id, caso_id, usuario_id, tipo, texto, estado_anterior, estado_nuevo)
  values (p_org, p_sucursal, v_id, null, 'cambio_estado', coalesce(p_texto, 'Caso abierto automáticamente por el motor de conteo'), null, 'abierta');
  return v_id;
end $$;

-- ───────────────────────────── cierre (interno): cálculo de resultado, casos, cruces y alertas ─────────────────────────────
create or replace function piefirme_app.ctl_cerrar_interno(p_sesion uuid, p_estado text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s piefirme.ctl_sesion_conteo%rowtype; v_org uuid; r record; v_c record; v_tol numeric; v_ventana integer; v_relacion numeric;
        v_total integer := 0; v_difs integer := 0; v_val numeric := 0; v_falt numeric := 0; v_sobr numeric := 0;
        v_nr integer := 0; v_valnr numeric := 0; v_casos integer := 0; v_caso uuid; v_tipo text; v_ctx jsonb; v_cancs jsonb; v_saldo numeric; v_sin_casos boolean;
        v_ent piefirme.ctl_entrega_turno%rowtype; v_cuadra boolean := true; v_rel jsonb := '[]'::jsonb; v_con_canc integer := 0; v_pares integer := 0; v_dur integer; v_peso numeric;
begin
  if p_estado not in ('cerrada', 'expirada') then raise exception 'estado de cierre no válido: %', p_estado using errcode = 'PF400'; end if;
  select * into s from piefirme.ctl_sesion_conteo where id = p_sesion for update;
  if not found then raise exception 'sesión no encontrada' using errcode = 'PF404'; end if;
  if s.estado <> 'abierta' then return jsonb_build_object('ok', true, 'ya_cerrada', true, 'estado', s.estado); end if;
  v_org := s.organizacion_id;
  perform piefirme_app.ctl_rpc_on();
  v_sin_casos := s.tipo = 'conteo_inicial';
  v_tol := piefirme_app.ctl_cfg_num(v_org, 'tolerancia_kits', s.sucursal_id);
  v_ventana := piefirme_app.ctl_cfg_num(v_org, 'cancelacion_ventana_dias', s.sucursal_id)::integer;
  v_relacion := piefirme_app.ctl_cfg_num(v_org, 'sustitucion_relacion_costo', s.sucursal_id);
  if s.tipo = 'relevo_turno' then select * into v_ent from piefirme.ctl_entrega_turno where sesion_id = s.id order by creado_en desc limit 1; end if;

  -- 1 · lo capturado: la última captura vigente de cada producto
  for r in
    select p.id as partida_id, p.producto_id, p.cantidad_fisica, p.precio_etiqueta, p.creado_por, c.saldo_sistema, c.diferencia_piezas, c.costo_unitario, c.diferencia_valor,
           c.precio_catalogo, c.diferencia_precio, c.clasificacion_precio, pr.nombre
      from piefirme.ctl_partida_conteo p
      join piefirme.ctl_partida_calculo c on c.partida_id = p.id
      join piefirme.productos pr on pr.id = p.producto_id
     where p.sesion_id = s.id and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)
     order by pr.nombre, p.id
  loop
    v_total := v_total + 1;
    if v_sin_casos then
      insert into piefirme.ctl_saldo_arranque (organizacion_id, sucursal_id, sesion_id, producto_id, cantidad_contada, cantidad_origen)
      values (v_org, s.sucursal_id, s.id, r.producto_id, r.cantidad_fisica, r.saldo_sistema) on conflict (sesion_id, producto_id) do nothing;
    end if;
    if abs(r.diferencia_piezas) > v_tol then
      v_difs := v_difs + 1; v_val := v_val + r.diferencia_valor;
      if r.diferencia_piezas < 0 then v_falt := v_falt + r.diferencia_valor; else v_sobr := v_sobr + r.diferencia_valor; end if;
      if s.tipo = 'relevo_turno' then
        v_cuadra := false;
        v_rel := v_rel || jsonb_build_object('producto_id', r.producto_id, 'descripcion', r.nombre, 'contado', r.cantidad_fisica, 'diferencia_relevo', r.diferencia_piezas);
      end if;
      if not v_sin_casos then
        v_ctx := jsonb_build_object('sesion_id', s.id, 'sesion_folio', s.folio, 'modo', s.tipo, 'partida_id', r.partida_id, 'descripcion', r.nombre, 'costo_unitario', r.costo_unitario,
                                    'cantidad_fisica', r.cantidad_fisica, 'saldo_al_contar', r.saldo_sistema);
        if s.tipo = 'relevo_turno' then
          v_ctx := v_ctx || jsonb_build_object('entrega_id', v_ent.id, 'usuario_saliente', v_ent.usuario_saliente, 'usuario_entrante', v_ent.usuario_entrante, 'firmas', '{}'::jsonb);
        end if;
        -- F1.4 · cruce con cancelaciones y devoluciones recientes del producto en la sucursal
        if r.diferencia_piezas < 0 then
          select coalesce(jsonb_agg(jsonb_build_object('tipo', q.tipo, 'folio', q.ticket, 'venta_id', q.venta_id, 'usuario_cancelo', q.usuario_id, 'autorizador', q.autorizador,
                                                       'fecha', q.fecha, 'motivo', q.motivo, 'cantidad', q.cantidad) order by q.fecha desc), '[]'::jsonb)
            into v_cancs
            from (select * from piefirme_app.ctl_o_cancelaciones(v_org, s.sucursal_id, r.producto_id, now() - make_interval(days => v_ventana)) limit 3) q;
          if jsonb_array_length(v_cancs) > 0 then
            v_ctx := v_ctx || jsonb_build_object('cancelacion', v_cancs -> 0, 'cancelaciones', v_cancs); v_con_canc := v_con_canc + 1;
          end if;
        end if;
        v_caso := piefirme_app.ctl_abrir_caso(v_org, s.sucursal_id, case when s.tipo = 'relevo_turno' then 'diferencia_relevo' else 'diferencia_inventario' end,
                                              'partida_conteo', r.partida_id, r.producto_id, r.diferencia_piezas, r.diferencia_valor, r.creado_por, v_ctx,
                                              v_ent.turno_saliente_id, v_ent.turno_entrante_id, 'Caso abierto por la sesión ' || s.folio || ' (' || s.tipo || ')');
        v_casos := v_casos + 1;
      end if;
    end if;
    -- F2.6 · solo «revisar» abre caso de precio
    if r.clasificacion_precio = 'revisar' and not v_sin_casos then
      perform piefirme_app.ctl_abrir_caso(v_org, s.sucursal_id, 'diferencia_precio', 'partida_conteo', r.partida_id, r.producto_id, null,
                                          round(coalesce(r.diferencia_precio, 0) * r.cantidad_fisica, 2), r.creado_por,
                                          jsonb_build_object('sesion_id', s.id, 'sesion_folio', s.folio, 'modo', s.tipo, 'partida_id', r.partida_id, 'descripcion', r.nombre,
                                                             'precio_etiqueta', r.precio_etiqueta, 'precio_catalogo', r.precio_catalogo, 'diferencia_precio', r.diferencia_precio),
                                          null, null, 'Etiqueta con precio a revisar (sesión ' || s.folio || ')');
      v_casos := v_casos + 1;
    end if;
  end loop;

  -- 2 · lo pedido y no reportado: el silencio es dato, mismo trato que una diferencia
  for r in
    select l.id as lista_id, l.producto_id, pr.nombre, coalesce(pr.costo_promedio, 0) as costo
      from piefirme.ctl_lista_solicitada l join piefirme.productos pr on pr.id = l.producto_id
     where l.sesion_id = s.id and not l.reportado order by l.orden
  loop
    v_nr := v_nr + 1;
    v_saldo := piefirme_app.ctl_o_saldo(v_org, s.sucursal_id, r.producto_id);
    v_valnr := v_valnr + round(v_saldo * r.costo, 2);
    if s.tipo = 'relevo_turno' then
      v_cuadra := false;
      v_rel := v_rel || jsonb_build_object('producto_id', r.producto_id, 'descripcion', r.nombre, 'contado', null, 'no_reportado', true);
    end if;
    if not v_sin_casos then
      v_ctx := jsonb_build_object('sesion_id', s.id, 'sesion_folio', s.folio, 'modo', s.tipo, 'no_reportado', true, 'descripcion', r.nombre, 'costo_unitario', r.costo,
                                  'saldo_al_cerrar', v_saldo, 'sesion_estado', p_estado);
      if s.tipo = 'relevo_turno' then
        v_ctx := v_ctx || jsonb_build_object('entrega_id', v_ent.id, 'usuario_saliente', v_ent.usuario_saliente, 'usuario_entrante', v_ent.usuario_entrante, 'firmas', '{}'::jsonb);
      end if;
      perform piefirme_app.ctl_abrir_caso(v_org, s.sucursal_id, case when s.tipo = 'relevo_turno' then 'diferencia_relevo' else 'diferencia_inventario' end,
                                          'lista_solicitada', r.lista_id, r.producto_id, null, round(v_saldo * r.costo, 2), s.usuario_captura, v_ctx,
                                          v_ent.turno_saliente_id, v_ent.turno_entrante_id, 'No reportado: la sesión ' || s.folio || ' pidió contarlo y nadie lo reportó');
      v_casos := v_casos + 1;
    end if;
  end loop;

  -- 3 · F2.5 · posible sustitución de código: faltante caro + sobrante barato en cantidades iguales, misma sesión y sucursal
  if not v_sin_casos and s.tipo <> 'relevo_turno' then
    for r in
      select k.id as caso_id, k.producto_id, k.cantidad, (k.contexto ->> 'costo_unitario')::numeric as costo, k.contexto ->> 'descripcion' as descripcion
        from piefirme.ctl_caso k
       where k.organizacion_id = v_org and k.sucursal_id = s.sucursal_id and k.tipo = 'diferencia_inventario' and k.cantidad < 0 and k.contexto ->> 'sesion_id' = s.id::text
         and k.contexto ? 'partida_id'
       order by (k.contexto ->> 'costo_unitario')::numeric desc, k.cantidad
    loop
      continue when coalesce(r.costo, 0) <= 0;
      select k2.id as caso_id, k2.producto_id, k2.cantidad, (k2.contexto ->> 'costo_unitario')::numeric as costo, k2.contexto ->> 'descripcion' as descripcion
        into v_c
        from piefirme.ctl_caso k2
       where k2.organizacion_id = v_org and k2.sucursal_id = s.sucursal_id and k2.tipo = 'diferencia_inventario' and k2.contexto ->> 'sesion_id' = s.id::text and k2.contexto ? 'partida_id'
         and k2.cantidad = -r.cantidad and (k2.contexto ->> 'costo_unitario')::numeric > 0 and r.costo >= v_relacion * (k2.contexto ->> 'costo_unitario')::numeric
         and not (k2.contexto ? 'sustitucion')
       order by (k2.contexto ->> 'costo_unitario')::numeric limit 1;
      continue when not found;
      continue when exists (select 1 from piefirme.ctl_caso x where x.id = r.caso_id and x.contexto ? 'sustitucion');
      update piefirme.ctl_caso set contexto = contexto || jsonb_build_object('sustitucion', jsonb_build_object(
          'rol', 'faltante_caro', 'relacion_costo', round(r.costo / v_c.costo, 2), 'umbral', v_relacion,
          'faltante', jsonb_build_object('producto_id', r.producto_id, 'descripcion', r.descripcion, 'cantidad', r.cantidad, 'costo_unitario', r.costo, 'caso_id', r.caso_id),
          'sobrante', jsonb_build_object('producto_id', v_c.producto_id, 'descripcion', v_c.descripcion, 'cantidad', v_c.cantidad, 'costo_unitario', v_c.costo, 'caso_id', v_c.caso_id)))
       where id = r.caso_id;
      update piefirme.ctl_caso set contexto = contexto || jsonb_build_object('sustitucion', jsonb_build_object(
          'rol', 'sobrante_barato', 'caso_principal_id', r.caso_id, 'relacion_costo', round(r.costo / v_c.costo, 2), 'umbral', v_relacion,
          'faltante', jsonb_build_object('producto_id', r.producto_id, 'descripcion', r.descripcion, 'cantidad', r.cantidad, 'costo_unitario', r.costo, 'caso_id', r.caso_id),
          'sobrante', jsonb_build_object('producto_id', v_c.producto_id, 'descripcion', v_c.descripcion, 'cantidad', v_c.cantidad, 'costo_unitario', v_c.costo, 'caso_id', v_c.caso_id)))
       where id = v_c.caso_id;
      insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
      values (v_org, s.sucursal_id, 'posible_sustitucion_codigo', 'alta', array['dueno', 'supervisor'],
              'Posible sustitución de código en la sesión ' || s.folio || ': falta «' || r.descripcion || '» (' || r.cantidad || ') y sobra «' || v_c.descripcion || '» (+' || v_c.cantidad
              || '), con una relación de costo de ' || round(r.costo / v_c.costo, 1) || ' a 1.', 'caso', r.caso_id);
      v_pares := v_pares + 1;
    end loop;
  end if;

  -- 4 · resultado y cierre de la sesión
  v_dur := greatest(0, round(extract(epoch from (now() - coalesce(s.solicitada_en, s.abierta_en))))::integer);
  insert into piefirme.ctl_sesion_resultado (sesion_id, organizacion_id, sucursal_id, partidas_con_diferencia, valor_diferencia, valor_faltante, valor_sobrante,
                                              no_reportadas, valor_no_reportado, casos_abiertos)
  values (s.id, v_org, s.sucursal_id, v_difs, round(v_val, 2), round(v_falt, 2), round(v_sobr, 2), v_nr, v_valnr, v_casos);
  update piefirme.ctl_sesion_conteo set estado = p_estado, cerrada_en = now(), total_partidas = v_total, duracion_seg = v_dur, motivo_cierre = coalesce(p_motivo, motivo_cierre) where id = s.id;
  if s.tipo = 'relevo_turno' and v_ent.id is not null then
    update piefirme.ctl_entrega_turno set estado = case when v_cuadra then 'por_aceptar' else 'con_diferencia' end, contados = v_total, en_custodia = coalesce(en_custodia, v_total + v_nr)
     where id = v_ent.id and estado in ('contando', 'entrega_no_aceptada');
    if not v_cuadra then
      insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
      values (v_org, s.sucursal_id, 'relevo_con_diferencia', 'alta', array['dueno', 'supervisor'],
              'El relevo de turno no cuadra: ' || (v_difs + v_nr) || ' producto(s) de la custodia con diferencia o sin contar (sesión ' || s.folio || ').', 'entrega_turno', v_ent.id);
    end if;
  end if;
  if v_casos > 0 and s.tipo <> 'relevo_turno' then
    insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
    values (v_org, s.sucursal_id, case when p_estado = 'expirada' then 'auditoria_remota_expirada' else 'sesion_con_diferencias' end,
            case when p_estado = 'expirada' and v_total = 0 then 'critica' when v_nr > 0 or v_difs > 0 then 'alta' else 'media' end, array['dueno', 'supervisor'],
            case when p_estado = 'expirada' then 'La sesión ' || s.folio || ' venció' || case when v_total = 0 then ' sin que la sucursal capturara nada' else ' con lo capturado' end || ': ' || v_nr || ' producto(s) no reportado(s).'
                 else 'La sesión ' || s.folio || ' cerró con ' || v_difs || ' diferencia(s) y ' || v_nr || ' no reportado(s); ' || v_casos || ' caso(s) abierto(s).' end,
            'sesion_conteo', s.id);
  end if;
  if v_con_canc > 0 then
    insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
    values (v_org, s.sucursal_id, 'faltante_con_cancelacion', 'alta', array['dueno', 'supervisor'],
            v_con_canc || ' faltante(s) de la sesión ' || s.folio || ' coinciden con una cancelación reciente del mismo producto: el caso nace con la cancelación ligada.', 'sesion_conteo', s.id);
  end if;

  return jsonb_build_object('ok', true, 'estado', p_estado, 'total_partidas', v_total, 'partidas_con_diferencia', v_difs, 'valor_diferencia', round(v_val, 2),
                            'valor_faltante', round(v_falt, 2), 'valor_sobrante', round(v_sobr, 2), 'no_reportadas', v_nr, 'valor_no_reportado', v_valnr, 'casos_abiertos', v_casos,
                            'con_cancelacion', v_con_canc, 'sustituciones', v_pares, 'cuadra', v_cuadra, 'diferencias_relevo', v_rel, 'entrega_id', v_ent.id);
end $$;

-- ───────────────────────────── expiración por límite de tiempo (auditoría remota) ─────────────────────────────
-- La sesión que pasó su límite_en pasa a «expirada» con lo capturado; lo faltante queda como no reportado (casos) y se registra el tiempo.
create or replace function piefirme_app.ctl_expirar_vencidas(p_org uuid, p_sesion uuid default null) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid; v_n integer := 0;
begin
  for v_id in select s.id from piefirme.ctl_sesion_conteo s
               where s.organizacion_id = p_org and s.estado = 'abierta' and s.limite_en is not null and s.limite_en <= now() and (p_sesion is null or s.id = p_sesion)
               order by s.limite_en loop
    perform piefirme_app.ctl_cerrar_interno(v_id, 'expirada', 'Venció el tiempo límite');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function piefirme.ctl_sesiones_expirar() returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo');
begin
  return piefirme_app.ctl_expirar_vencidas(v_org);
end $$;

-- ───────────────────────────── cerrar la sesión ─────────────────────────────
-- Quien captura (o un dueño/supervisor) la cierra. Respuesta ciega para el rol de sucursal: solo ok, estado y cuántas partidas.
-- Con ver_diferencias se añaden las cifras. EXCEPCIÓN documentada (F2.4): en el relevo de turno el servidor muestra la diferencia al entrante.
create or replace function piefirme.ctl_sesion_cerrar(p_sesion uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); s piefirme.ctl_sesion_conteo%rowtype; v_res jsonb; v_out jsonb; v_ver boolean := piefirme_app.ctl_puede('ver_diferencias');
begin
  select * into s from piefirme.ctl_sesion_conteo where id = p_sesion and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(s.sucursal_id) then raise exception 'sesión no encontrada' using errcode = 'PF404'; end if;
  if s.usuario_captura is distinct from auth.uid() and not piefirme_app.ctl_puede('ver_directo') then
    raise exception 'Solo quien captura la sesión (o un supervisor o el dueño) puede cerrarla.' using errcode = 'PF403';
  end if;
  if s.estado = 'abierta' and s.usuario_captura is null and not piefirme_app.ctl_puede('ver_directo') then
    raise exception 'Abre la sesión antes de cerrarla.' using errcode = 'PF409';
  end if;
  if s.estado = 'abierta' and s.limite_en is not null and s.limite_en <= now() then
    v_res := piefirme_app.ctl_cerrar_interno(s.id, 'expirada', 'Venció el tiempo límite');
  else
    v_res := piefirme_app.ctl_cerrar_interno(s.id, 'cerrada');
  end if;
  v_out := jsonb_build_object('ok', true, 'sesion_id', s.id, 'folio', s.folio, 'estado', coalesce(v_res ->> 'estado', 'cerrada'), 'ya_cerrada', coalesce((v_res ->> 'ya_cerrada')::boolean, false));
  if (v_res ->> 'ya_cerrada')::boolean is distinct from true then
    v_out := v_out || jsonb_build_object('total_partidas', (v_res ->> 'total_partidas')::integer, 'no_reportadas', (v_res ->> 'no_reportadas')::integer);
    if v_ver then
      v_out := v_out || jsonb_build_object('partidas_con_diferencia', (v_res ->> 'partidas_con_diferencia')::integer, 'valor_diferencia', (v_res ->> 'valor_diferencia')::numeric,
                                            'valor_faltante', (v_res ->> 'valor_faltante')::numeric, 'valor_sobrante', (v_res ->> 'valor_sobrante')::numeric,
                                            'valor_no_reportado', (v_res ->> 'valor_no_reportado')::numeric, 'casos_abiertos', (v_res ->> 'casos_abiertos')::integer,
                                            'con_cancelacion', (v_res ->> 'con_cancelacion')::integer, 'sustituciones', (v_res ->> 'sustituciones')::integer);
    end if;
    if s.tipo = 'relevo_turno' then
      v_out := v_out || jsonb_build_object('relevo', jsonb_build_object('entrega_id', v_res -> 'entrega_id', 'cuadra', (v_res ->> 'cuadra')::boolean,
                                           'diferencias', case when (v_res ->> 'cuadra')::boolean then '[]'::jsonb else v_res -> 'diferencias_relevo' end));
    end if;
  end if;
  return v_out;
end $$;

-- ───────────────────────────── cancelar la sesión ─────────────────────────────
-- Quien captura solo puede cancelar si todavía no capturó nada (cancelar después de contar permitiría esconder lo que se cuenta a ciegas);
-- dueño y supervisor pueden cancelar con motivo. Lo capturado no se borra (es evidencia); no se abren casos.
create or replace function piefirme.ctl_sesion_cancelar(p_sesion uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); s piefirme.ctl_sesion_conteo%rowtype; v_n integer;
begin
  select * into s from piefirme.ctl_sesion_conteo where id = p_sesion and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(s.sucursal_id) then raise exception 'sesión no encontrada' using errcode = 'PF404'; end if;
  if s.estado <> 'abierta' then return jsonb_build_object('ok', false, 'error', s.estado, 'mensaje', 'La sesión ya no está abierta.'); end if;
  select count(*) into v_n from piefirme.ctl_partida_conteo p where p.sesion_id = s.id;
  if piefirme_app.ctl_puede('ver_directo') then
    if coalesce(btrim(p_motivo), '') = '' then raise exception 'Indica el motivo de la cancelación.' using errcode = 'PF422'; end if;
  else
    if s.tipo = 'auditoria_remota' then raise exception 'Una auditoría remota no se cancela desde la sucursal.' using errcode = 'PF403'; end if;
    if s.usuario_captura is distinct from auth.uid() then raise exception 'Solo quien abrió la sesión puede cancelarla.' using errcode = 'PF403'; end if;
    if v_n > 0 then raise exception 'Ya hay productos capturados: la sesión se cierra, no se cancela. Pide a un supervisor que la cancele con motivo.' using errcode = 'PF403'; end if;
  end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_sesion_conteo set estado = 'cancelada', cerrada_en = now(), motivo_cierre = left(coalesce(nullif(btrim(p_motivo), ''), 'Cancelada antes de capturar'), 300) where id = s.id;
  if s.tipo = 'relevo_turno' then
    update piefirme.ctl_entrega_turno set estado = 'cancelada' where sesion_id = s.id and estado in ('contando', 'entrega_no_aceptada', 'por_aceptar');
  end if;
  return jsonb_build_object('ok', true, 'estado', 'cancelada', 'partidas_capturadas', v_n);
end $$;

-- ───────────────────────────── resultado de una sesión (SOLO dueño y supervisor) ─────────────────────────────
create or replace function piefirme.ctl_sesion_detalle(p_sesion uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_directo'); s piefirme.ctl_sesion_conteo%rowtype; v_sesion jsonb; v_partidas jsonb; v_nr jsonb;
begin
  select * into s from piefirme.ctl_sesion_conteo where id = p_sesion and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(s.sucursal_id) then raise exception 'sesión no encontrada' using errcode = 'PF404'; end if;
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros) values (v_org, auth.uid(), piefirme_app.ctl_rol(), 'sesion_detalle', jsonb_build_object('sesion_id', p_sesion));
  select to_jsonb(t) into v_sesion from (
    select se.id, se.folio, se.sucursal_id, (select x.nombre from piefirme.sedes x where x.id = se.sucursal_id) as sucursal, se.tipo, se.modo_lista, se.estado, se.solicitada_por, se.solicitada_en,
           se.limite_en, se.abierta_en, se.cerrada_en, se.recibida_en, se.respuesta_seg, se.duracion_seg, se.usuario_captura, se.total_partidas, se.tamano_muestra, se.pide_precio, se.motivo, se.motivo_cierre,
           r.partidas_con_diferencia, r.valor_diferencia, r.valor_faltante, r.valor_sobrante, r.no_reportadas, r.valor_no_reportado, r.casos_abiertos,
           (select trim(pf.nombre || ' ' || coalesce(pf.apellidos, '')) from piefirme.perfiles pf where pf.id = se.usuario_captura) as capturista
      from piefirme.ctl_sesion_conteo se left join piefirme.ctl_sesion_resultado r on r.sesion_id = se.id where se.id = s.id) t;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.descripcion), '[]'::jsonb) into v_partidas from (
    select p.id as partida_id, p.producto_id, pr.nombre as descripcion, pr.codigo_barras, p.codigo_escaneado, p.cantidad_fisica, c.saldo_sistema, c.diferencia_piezas, c.costo_unitario, c.diferencia_valor,
           p.precio_etiqueta, c.precio_catalogo, c.diferencia_precio, c.clasificacion_precio, c.clasificacion_manual, p.numero_serie, p.folio_sello, p.sello_intacto, p.nota, p.escaneado_en,
           (p.corrige_a is not null) as es_correccion,
           (select k.folio from piefirme.ctl_caso k where k.origen_tipo = 'partida_conteo' and k.origen_id = p.id and k.tipo <> 'diferencia_precio' order by k.creado_en limit 1) as caso_folio,
           (select k.folio from piefirme.ctl_caso k where k.origen_tipo = 'partida_conteo' and k.origen_id = p.id and k.tipo = 'diferencia_precio' order by k.creado_en limit 1) as caso_precio_folio
      from piefirme.ctl_partida_conteo p join piefirme.ctl_partida_calculo c on c.partida_id = p.id join piefirme.productos pr on pr.id = p.producto_id
     where p.sesion_id = s.id and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)) t;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.descripcion), '[]'::jsonb) into v_nr from (
    select l.producto_id, pr.nombre as descripcion, pr.codigo_barras, l.orden,
           (select k.folio from piefirme.ctl_caso k where k.origen_tipo = 'lista_solicitada' and k.origen_id = l.id limit 1) as caso_folio
      from piefirme.ctl_lista_solicitada l join piefirme.productos pr on pr.id = l.producto_id where l.sesion_id = s.id and not l.reportado) t;
  return jsonb_build_object('sesion', v_sesion, 'partidas', v_partidas, 'no_reportados', v_nr);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'piefirme_app' and p.proname in ('ctl_abrir_caso', 'ctl_cerrar_interno', 'ctl_expirar_vencidas'))
               or (n.nspname = 'piefirme' and p.proname in ('ctl_sesiones_expirar', 'ctl_sesion_cerrar', 'ctl_sesion_cancelar', 'ctl_sesion_detalle')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
