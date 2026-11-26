-- 222 · Control y Auditoría · ETAPA 3 · CASOS (3/3): lista, detalle con movimientos de contexto (F4.3) y reportes de seguimiento (F4.5).
-- Quién entra: dueño, supervisor y soporte RANNIX (capacidad ver_diferencias). El rol de sucursal (encargado, cajero, podólogo) recibe PF403: no ve casos ni
-- diferencias. Toda consulta de detalle y de reporte deja renglón en ctl_bitacora_consulta (la lista solo cuando consulta el soporte).
-- DETALLE: junto a la diferencia muestra lo que pasó con el producto en esa sucursal DESDE EL CONTEO ANTERIOR (entradas de mercancía, traspasos, ventas,
-- cancelaciones y devoluciones), leído del origen por las vistas v_ctl_movimientos / v_ctl_ventas / v_ctl_cancelaciones / v_ctl_turnos (las vistas filtran por
-- el rol de quien consulta: el soporte, que no tiene «ver_directo», recibe esas secciones vacías y sin fotos). Es lo que distingue un robo de un error de
-- captura: la pantalla INFORMA, no acusa. Acota la ventana de tiempo y las personas con acceso; no pone etiquetas de culpa ni ordena personas por «sospecha».
-- Depende de: 200–206, 210–213, 220, 221.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── lista de casos (bandeja, filtros, «mis casos») ─────────────────────────────
-- Filtros (jsonb, todos opcionales): estados[] · sucursal · tipo · antiguedad_min · antiguedad_max (días) · asignado ('mio' | 'sin_asignar' | uuid) ·
-- solo_abiertos · vencidos · buscar (folio o producto) · limite (≤ 500) · offset.
create or replace function piefirme.ctl_casos_listar(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); f jsonb := coalesce(p_filtros, '{}'::jsonb);
        v_estados text[]; v_suc uuid := nullif(f ->> 'sucursal', '')::uuid; v_tipo text := nullif(f ->> 'tipo', ''); v_min integer := nullif(f ->> 'antiguedad_min', '')::integer;
        v_max integer := nullif(f ->> 'antiguedad_max', '')::integer; v_asig text := nullif(f ->> 'asignado', ''); v_ab boolean := coalesce((f ->> 'solo_abiertos')::boolean, false);
        v_venc boolean := coalesce((f ->> 'vencidos')::boolean, false); v_q text := nullif(btrim(coalesce(f ->> 'buscar', '')), '');
        v_lim integer := least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 200), 1), 500); v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0);
        v_hoy date := piefirme_app.ctl_hoy(piefirme_app.org_id()); v_res jsonb;
begin
  if jsonb_typeof(f -> 'estados') = 'array' then select array_agg(x) into v_estados from jsonb_array_elements_text(f -> 'estados') x; end if;
  if v_estados is null and nullif(f ->> 'estado', '') is not null then v_estados := array[f ->> 'estado']; end if;
  if v_ab then v_estados := array['abierta', 'en_investigacion', 'ajuste_fallido']; end if;
  if piefirme_app.ctl_rol() = 'soporte' then
    insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros) values (v_org, auth.uid(), 'soporte', 'soporte:casos_listar', f);
  end if;

  with base as (
    select k.id, k.folio, k.tipo, k.estado, k.sucursal_id, sd.nombre as sucursal, k.producto_id, pr.nombre as producto, k.cantidad, k.valor,
           k.abierto_en, k.cerrado_en, k.asignado_a, piefirme_app.ctl_nombre_usuario(k.asignado_a) as asignado, k.fecha_compromiso,
           (piefirme_app.ctl_caso_es_abierto(k.estado) and k.fecha_compromiso is not null and k.fecha_compromiso < v_hoy) as vencido,
           k.causa_id, ca.nombre as causa, k.responsable_costo, k.monto_costo, k.movimiento_origen_id, k.usuario_captura,
           piefirme_app.ctl_nombre_usuario(k.usuario_captura) as capturista,
           floor(extract(epoch from (coalesce(k.cerrado_en, now()) - k.abierto_en)) / 86400)::integer as antiguedad_dias,
           (k.contexto ? 'cancelacion') as con_cancelacion, k.contexto #>> '{sustitucion,rol}' as par_rol, coalesce((k.contexto ->> 'no_reportado')::boolean, false) as no_reportado,
           case k.estado when 'ajuste_fallido' then 0 when 'abierta' then 1 when 'en_investigacion' then 2 else 3 end as prio,
           case when k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido') then extract(epoch from k.abierto_en) else -extract(epoch from k.abierto_en) end as clave
      from piefirme.ctl_caso k
      join piefirme.sedes sd on sd.id = k.sucursal_id
      left join piefirme.productos pr on pr.id = k.producto_id
      left join piefirme.ctl_causa ca on ca.id = k.causa_id
     where k.organizacion_id = v_org and piefirme_app.puede_sede(k.sucursal_id)
       and (v_suc is null or k.sucursal_id = v_suc) and (v_tipo is null or k.tipo = v_tipo)
       and (v_min is null or floor(extract(epoch from (coalesce(k.cerrado_en, now()) - k.abierto_en)) / 86400) >= v_min)
       and (v_max is null or floor(extract(epoch from (coalesce(k.cerrado_en, now()) - k.abierto_en)) / 86400) <= v_max)
       and (v_asig is null or (v_asig = 'mio' and k.asignado_a = auth.uid()) or (v_asig = 'sin_asignar' and k.asignado_a is null and piefirme_app.ctl_caso_es_abierto(k.estado))
            or (v_asig not in ('mio', 'sin_asignar') and k.asignado_a = v_asig::uuid))
       and (not v_venc or (piefirme_app.ctl_caso_es_abierto(k.estado) and k.fecha_compromiso is not null and k.fecha_compromiso < v_hoy))
       and (v_q is null or k.folio ilike '%' || v_q || '%' or pr.nombre ilike '%' || v_q || '%' or pr.codigo_barras ilike '%' || v_q || '%')
  ), sel as (select * from base b where v_estados is null or b.estado = any (v_estados))
  select jsonb_build_object(
           'casos', coalesce((select jsonb_agg(to_jsonb(x) - 'prio' - 'clave' order by x.prio, x.clave) from (select * from sel order by prio, clave limit v_lim offset v_off) x), '[]'::jsonb),
           'total', (select count(*) from sel),
           'resumen', coalesce((select jsonb_object_agg(e.estado, e.n) from (select estado, count(*) as n from base group by estado) e), '{}'::jsonb))
    into v_res;
  return v_res;
end $$;

-- ───────────────────────────── detalle del caso (F4.3) ─────────────────────────────
create or replace function piefirme.ctl_caso_detalle(p_caso uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_dir boolean := piefirme_app.ctl_puede('ver_directo');
        v_sesion uuid; v_corte timestamptz; v_prev_p timestamptz; v_prev_m timestamptz; v_prev timestamptz; v_desde timestamptz; v_omision boolean := false;
        v_ids uuid[]; v_folios text[]; v_caso jsonb; v_bit jsonb; v_evid jsonb := '[]'::jsonb; v_llam jsonb; v_movs jsonb := '[]'::jsonb; v_ventas jsonb := '[]'::jsonb;
        v_canc jsonb := '[]'::jsonb; v_turnos jsonb := '[]'::jsonb; v_pers jsonb := '[]'::jsonb; v_hist jsonb; v_par jsonb := null; v_saldo numeric; v_yo_cap boolean; v_yo_inv boolean;
        v_canc_lig jsonb;
begin
  select * into k from piefirme.ctl_caso where id = p_caso and organizacion_id = v_org;
  if not found or not piefirme_app.puede_sede(k.sucursal_id) then raise exception 'caso no encontrado' using errcode = 'PF404'; end if;
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros) values (v_org, auth.uid(), piefirme_app.ctl_rol(), 'caso_detalle', jsonb_build_object('caso_id', p_caso, 'folio', k.folio));

  -- par de sustitución de código
  if k.contexto #>> '{sustitucion,rol}' = 'faltante_caro' then
    select * into s from piefirme.ctl_caso where id = nullif(k.contexto #>> '{sustitucion,sobrante,caso_id}', '')::uuid and organizacion_id = v_org;
  elsif k.contexto #>> '{sustitucion,rol}' = 'sobrante_barato' then
    select * into s from piefirme.ctl_caso where id = nullif(k.contexto #>> '{sustitucion,caso_principal_id}', '')::uuid and organizacion_id = v_org;
  end if;
  if s.id is not null then
    v_par := jsonb_build_object('id', s.id, 'folio', s.folio, 'estado', s.estado, 'rol', case when k.contexto #>> '{sustitucion,rol}' = 'faltante_caro' then 'sobrante_barato' else 'faltante_caro' end,
                                'producto_id', s.producto_id, 'producto', (select p.nombre from piefirme.productos p where p.id = s.producto_id), 'cantidad', s.cantidad, 'valor', s.valor,
                                'movimiento_origen_id', s.movimiento_origen_id, 'relacion_costo', k.contexto #> '{sustitucion,relacion_costo}');
  end if;
  v_ids := array[k.id] || case when s.id is not null then array[s.id] else '{}'::uuid[] end;
  v_folios := array[k.folio] || case when s.id is not null then array[s.folio] else '{}'::text[] end;

  -- momento del conteo que originó el caso y conteo anterior del producto en la sucursal
  if k.origen_tipo = 'partida_conteo' then
    select p.sesion_id, p.escaneado_en into v_sesion, v_corte from piefirme.ctl_partida_conteo p where p.id = k.origen_id;
  elsif k.origen_tipo = 'lista_solicitada' then
    select l.sesion_id, coalesce(se.cerrada_en, se.abierta_en) into v_sesion, v_corte from piefirme.ctl_lista_solicitada l join piefirme.ctl_sesion_conteo se on se.id = l.sesion_id where l.id = k.origen_id;
  end if;
  v_corte := coalesce(v_corte, k.abierto_en);
  if k.producto_id is not null then
    select max(p.escaneado_en) into v_prev_p from piefirme.ctl_partida_conteo p
     where p.organizacion_id = v_org and p.sucursal_id = k.sucursal_id and p.producto_id = k.producto_id and p.escaneado_en < v_corte and p.sesion_id is distinct from v_sesion;
    select max(m.fecha) into v_prev_m from piefirme.v_ctl_movimientos m where m.sucursal_id = k.sucursal_id and m.producto_id = k.producto_id and m.tipo = 'conteo' and m.fecha < v_corte;
    v_prev := greatest(v_prev_p, v_prev_m);
    if v_prev is null then v_desde := v_corte - interval '30 days'; v_omision := true; else v_desde := v_prev; end if;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha desc), '[]'::jsonb) into v_movs from (
      select m.id, m.tipo, m.cantidad, m.costo_unitario, m.fecha, m.documento, m.referencia_tipo, m.usuario_id, piefirme_app.ctl_nombre_usuario(m.usuario_id) as usuario, (m.fecha > v_corte) as posterior_al_conteo
        from piefirme.v_ctl_movimientos m
       where m.sucursal_id = k.sucursal_id and m.producto_id = k.producto_id and m.fecha >= v_desde and m.tipo <> 'venta' order by m.fecha desc limit 300) t;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha_hora desc), '[]'::jsonb) into v_ventas from (
      select v.linea_id, v.venta_id, v.ticket, v.fecha_hora, v.estado, v.cantidad, v.precio_cobrado, v.descuento_monto, v.precio_catalogo_al_momento, v.usuario_id,
             piefirme_app.ctl_nombre_usuario(v.usuario_id) as usuario, v.turno_id, (v.fecha_hora > v_corte) as posterior_al_conteo
        from piefirme.v_ctl_ventas v
       where v.sucursal_id = k.sucursal_id and v.producto_id = k.producto_id and v.fecha_hora >= v_desde order by v.fecha_hora desc limit 300) t;
    v_canc_lig := coalesce(k.contexto -> 'cancelaciones', '[]'::jsonb);
    select coalesce(jsonb_agg(to_jsonb(t) order by t.fecha desc), '[]'::jsonb) into v_canc from (
      select c.tipo, c.venta_id, c.ticket_original as ticket, c.fecha, c.usuario_id, piefirme_app.ctl_nombre_usuario(c.usuario_id) as usuario, c.autorizador,
             piefirme_app.ctl_nombre_usuario(c.autorizador) as autorizador_nombre, c.motivo, c.monto, c.reingresa_inventario,
             exists (select 1 from jsonb_array_elements(v_canc_lig) z where z ->> 'folio' = c.ticket_original) as ligada_al_caso, (c.fecha > v_corte) as posterior_al_conteo
        from piefirme.v_ctl_cancelaciones c
       where c.sucursal_id = k.sucursal_id and c.fecha >= v_desde
         and exists (select 1 from piefirme.venta_lineas l where l.venta_id = c.venta_id and l.producto_id = k.producto_id) order by c.fecha desc limit 100) t;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.apertura_en desc), '[]'::jsonb) into v_turnos from (
      select tu.id, tu.caja, tu.nombre_turno, tu.usuario_id, piefirme_app.ctl_nombre_usuario(tu.usuario_id) as usuario, tu.apertura_en, tu.cierre_en, tu.estado
        from piefirme.v_ctl_turnos tu where tu.sucursal_id = k.sucursal_id and coalesce(tu.cierre_en, now()) >= v_desde order by tu.apertura_en desc limit 40) t;
    select coalesce(jsonb_agg(jsonb_build_object('usuario_id', x.u, 'nombre', piefirme_app.ctl_nombre_usuario(x.u)) order by piefirme_app.ctl_nombre_usuario(x.u)), '[]'::jsonb) into v_pers from (
      select distinct (e ->> 'usuario_id')::uuid as u
        from (select * from jsonb_array_elements(v_movs) union all select * from jsonb_array_elements(v_ventas) union all select * from jsonb_array_elements(v_turnos)) q(e)
       where e ->> 'usuario_id' is not null) x;
    if v_dir then select coalesce(sum(i.existencia), 0) into v_saldo from piefirme.inventario_sede i where i.organizacion_id = v_org and i.sede_id = k.sucursal_id and i.producto_id = k.producto_id; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'tipo', b.tipo, 'texto', b.texto, 'estado_anterior', b.estado_anterior, 'estado_nuevo', b.estado_nuevo, 'creado_en', b.creado_en,
                                               'usuario_id', b.usuario_id, 'usuario', coalesce(piefirme_app.ctl_nombre_usuario(b.usuario_id), 'Sistema'), 'datos', b.datos, 'evidencia_id', b.evidencia_id,
                                               'caso_id', b.caso_id, 'folio', case when b.caso_id = k.id then k.folio else s.folio end) order by b.creado_en, b.id), '[]'::jsonb)
    into v_bit from piefirme.ctl_caso_bitacora b where b.organizacion_id = v_org and b.caso_id = any (v_ids);
  select exists (select 1 from piefirme.ctl_caso_bitacora b where b.caso_id = any (v_ids) and b.usuario_id = auth.uid() and (b.tipo in ('comentario', 'evidencia', 'asignacion') or b.estado_nuevo = 'en_investigacion')) or k.asignado_a = auth.uid() into v_yo_inv;
  v_yo_cap := piefirme_app.ctl_caso_capturista(k) = auth.uid() or (s.id is not null and piefirme_app.ctl_caso_capturista(s) = auth.uid());
  if v_dir then
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'caso_id', e.origen_id, 'ruta', e.url_almacenamiento, 'hash_sha256', e.hash_sha256, 'bytes', e.bytes, 'ancho', e.ancho, 'alto', e.alto,
                                                 'capturado_en', e.capturado_en, 'usuario_id', e.usuario_id, 'usuario', piefirme_app.ctl_nombre_usuario(e.usuario_id)) order by e.capturado_en), '[]'::jsonb)
      into v_evid from piefirme.ctl_evidencia e where e.organizacion_id = v_org and e.tipo_origen = 'caso' and e.origen_id = any (v_ids);
  end if;
  select coalesce(jsonb_agg(to_jsonb(l) - 'organizacion_id' order by l.creado_en), '[]'::jsonb) into v_llam from piefirme.ctl_llamada_origen l where l.organizacion_id = v_org and l.folio_caso = any (v_folios);
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'folio', h.folio, 'estado', h.estado, 'abierto_en', h.abierto_en, 'cantidad', h.cantidad,
                                               'causa', (select c.nombre from piefirme.ctl_causa c where c.id = h.causa_id)) order by h.abierto_en desc), '[]'::jsonb)
    into v_hist from (select * from piefirme.ctl_caso h2 where h2.organizacion_id = v_org and h2.sucursal_id = k.sucursal_id and h2.producto_id = k.producto_id and k.producto_id is not null and h2.id <> k.id
                       order by h2.abierto_en desc limit 10) h;

  v_caso := to_jsonb(k) || jsonb_build_object(
      'sucursal', (select sd.nombre from piefirme.sedes sd where sd.id = k.sucursal_id),
      'producto', (select jsonb_build_object('id', p.id, 'descripcion', p.nombre, 'codigo_barras', p.codigo_barras, 'sku', p.sku, 'costo', p.costo_promedio) from piefirme.productos p where p.id = k.producto_id),
      'asignado', piefirme_app.ctl_nombre_usuario(k.asignado_a), 'capturista', piefirme_app.ctl_nombre_usuario(k.usuario_captura),
      'autorizador', piefirme_app.ctl_nombre_usuario(k.autorizado_por),
      'causa', (select c.nombre from piefirme.ctl_causa c where c.id = k.causa_id), 'causa_requiere_nota', (select c.requiere_nota from piefirme.ctl_causa c where c.id = k.causa_id),
      'antiguedad_dias', floor(extract(epoch from (coalesce(k.cerrado_en, now()) - k.abierto_en)) / 86400)::integer,
      'vencido', piefirme_app.ctl_caso_es_abierto(k.estado) and k.fecha_compromiso is not null and k.fecha_compromiso < piefirme_app.ctl_hoy(v_org));
  return jsonb_build_object(
    'caso', v_caso, 'par', v_par, 'bitacora', v_bit, 'evidencias', v_evid, 'llamadas_origen', v_llam, 'historial_producto', v_hist,
    'yo', jsonb_build_object('capture', coalesce(v_yo_cap, false), 'investigue', coalesce(v_yo_inv, false)),
    'contexto', jsonb_build_object(
      'corte', v_corte, 'conteo_anterior', v_prev, 'desde', v_desde, 'hasta', now(), 'ventana_por_omision', v_omision,
      'saldo_actual', v_saldo, 'movimientos', v_movs, 'ventas', v_ventas, 'cancelaciones', v_canc, 'turnos', v_turnos, 'personas', v_pers,
      'nota', 'Este contexto informa: acota ventana de tiempo y personas con acceso. No es una conclusión ni señala culpables; una entrada de mercancía, un traspaso o una cancelación sin registrar explican la mayoría de las diferencias.'));
end $$;

-- ───────────────────────────── reportes de seguimiento (F4.5) ─────────────────────────────
-- 1) casos abiertos por sucursal y antigüedad · 2) distribución de causas por sucursal y periodo · 3) monto absorbido (por responsable) ·
-- 4) recurrencia por turno y por persona saliente de relevo: INDICADOR PARA INVESTIGAR, nunca una conclusión (con el denominador y los casos a la vista).
create or replace function piefirme.ctl_casos_reportes(p_desde date default null, p_hasta date default null, p_sucursal uuid default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); v_hoy date := piefirme_app.ctl_hoy(piefirme_app.org_id()); v_h date; v_d date; v_zona text; v_ini timestamptz; v_fin timestamptz;
        v_abiertos jsonb; v_causas jsonb; v_monto jsonb; v_rec_persona jsonb; v_rec_turno jsonb; v_umbral integer := 2;
begin
  v_h := coalesce(p_hasta, v_hoy); v_d := coalesce(p_desde, v_h - 89);
  if v_d > v_h then raise exception 'El periodo es inválido: la fecha inicial es posterior a la final.' using errcode = 'PF422'; end if;
  if v_h - v_d > 730 then raise exception 'El periodo no puede pasar de dos años.' using errcode = 'PF422'; end if;
  if p_sucursal is not null and not piefirme_app.puede_sede(p_sucursal) then raise exception 'sucursal no permitida' using errcode = 'PF403'; end if;
  select coalesce(o.zona_horaria, 'America/Mexico_City') into v_zona from piefirme.organizaciones o where o.id = v_org;
  v_ini := v_d::timestamp at time zone v_zona; v_fin := (v_h + 1)::timestamp at time zone v_zona;
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros)
  values (v_org, auth.uid(), piefirme_app.ctl_rol(), 'casos_reportes', jsonb_build_object('desde', v_d, 'hasta', v_h, 'sucursal', p_sucursal));

  -- 1 · abiertos por sucursal y antigüedad (foto de hoy; no depende del periodo)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.mas_antiguo_dias desc), '[]'::jsonb) into v_abiertos from (
    select k.sucursal_id, sd.nombre as sucursal, count(*)::integer as abiertos,
           count(*) filter (where d.dias <= 2)::integer as de_0_a_2, count(*) filter (where d.dias between 3 and 7)::integer as de_3_a_7,
           count(*) filter (where d.dias between 8 and 14)::integer as de_8_a_14, count(*) filter (where d.dias between 15 and 30)::integer as de_15_a_30,
           count(*) filter (where d.dias > 30)::integer as mas_de_30, max(d.dias)::integer as mas_antiguo_dias,
           count(*) filter (where k.estado = 'ajuste_fallido')::integer as ajuste_fallido,
           count(*) filter (where k.asignado_a is null)::integer as sin_asignar,
           count(*) filter (where k.fecha_compromiso is not null and k.fecha_compromiso < v_hoy)::integer as vencidos,
           coalesce(sum(abs(coalesce(k.valor, 0))), 0)::numeric(14,2) as valor_abierto
      from piefirme.ctl_caso k join piefirme.sedes sd on sd.id = k.sucursal_id
      cross join lateral (select floor(extract(epoch from (now() - k.abierto_en)) / 86400)::integer as dias) d
     where k.organizacion_id = v_org and k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido') and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal)
     group by k.sucursal_id, sd.nombre) x;

  -- 2 · causas por sucursal (casos cerrados con causa en el periodo)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sucursal, x.casos desc), '[]'::jsonb) into v_causas from (
    select k.sucursal_id, sd.nombre as sucursal, k.causa_id, ca.nombre as causa, count(*)::integer as casos, coalesce(sum(abs(coalesce(k.valor, 0))), 0)::numeric(14,2) as valor
      from piefirme.ctl_caso k join piefirme.sedes sd on sd.id = k.sucursal_id join piefirme.ctl_causa ca on ca.id = k.causa_id
     where k.organizacion_id = v_org and k.estado in ('cerrada_con_ajuste', 'cerrada_sin_ajuste') and k.cerrado_en >= v_ini and k.cerrado_en < v_fin
       and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal)
     group by k.sucursal_id, sd.nombre, k.causa_id, ca.nombre) x;

  -- 3 · monto al costo absorbido por responsable (registro de control interno; «empleado» NO es instrucción de descuento a nómina)
  select jsonb_build_object(
           'por_responsable', coalesce((select jsonb_agg(to_jsonb(r) order by r.responsable) from (
              select k.responsable_costo as responsable, count(*)::integer as casos, coalesce(sum(k.monto_costo), 0)::numeric(14,2) as monto
                from piefirme.ctl_caso k
               where k.organizacion_id = v_org and k.estado in ('cerrada_con_ajuste', 'cerrada_sin_ajuste') and k.responsable_costo is not null and k.cerrado_en >= v_ini and k.cerrado_en < v_fin
                 and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal) group by k.responsable_costo) r), '[]'::jsonb),
           'empresa_por_sucursal', coalesce((select jsonb_agg(to_jsonb(r) order by r.sucursal) from (
              select k.sucursal_id, sd.nombre as sucursal, count(*)::integer as casos, coalesce(sum(k.monto_costo), 0)::numeric(14,2) as monto
                from piefirme.ctl_caso k join piefirme.sedes sd on sd.id = k.sucursal_id
               where k.organizacion_id = v_org and k.estado in ('cerrada_con_ajuste', 'cerrada_sin_ajuste') and k.responsable_costo = 'empresa' and k.cerrado_en >= v_ini and k.cerrado_en < v_fin
                 and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal) group by k.sucursal_id, sd.nombre) r), '[]'::jsonb),
           'empresa_total', coalesce((select sum(k.monto_costo) from piefirme.ctl_caso k
               where k.organizacion_id = v_org and k.estado in ('cerrada_con_ajuste', 'cerrada_sin_ajuste') and k.responsable_costo = 'empresa' and k.cerrado_en >= v_ini and k.cerrado_en < v_fin
                 and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal)), 0)::numeric(14,2),
           'valor_ajustado', coalesce((select sum(abs(coalesce(k.valor, 0))) from piefirme.ctl_caso k
               where k.organizacion_id = v_org and k.estado = 'cerrada_con_ajuste' and k.cerrado_en >= v_ini and k.cerrado_en < v_fin
                 and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal)), 0)::numeric(14,2))
    into v_monto;

  -- 4 · recurrencia en relevos: quién estaba del lado saliente en varias diferencias de relevo (indicador para investigar)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.relevos_con_diferencia desc, x.nombre), '[]'::jsonb) into v_rec_persona from (
    select g.usuario_id, piefirme_app.ctl_nombre_usuario(g.usuario_id) as nombre, g.relevos_con_diferencia, g.casos,
           (select count(*)::integer from piefirme.ctl_entrega_turno e where e.organizacion_id = v_org and e.usuario_saliente = g.usuario_id and e.estado <> 'cancelada'
               and e.creado_en >= v_ini and e.creado_en < v_fin and (p_sucursal is null or e.sucursal_id = p_sucursal)) as relevos_totales,
           g.lista
      from (select (k.contexto ->> 'usuario_saliente')::uuid as usuario_id, count(distinct k.contexto ->> 'entrega_id')::integer as relevos_con_diferencia, count(*)::integer as casos,
                   (array_agg(jsonb_build_object('id', k.id, 'folio', k.folio, 'abierto_en', k.abierto_en, 'estado', k.estado, 'producto', (select p.nombre from piefirme.productos p where p.id = k.producto_id),
                                                 'valor', k.valor, 'sucursal', (select sd.nombre from piefirme.sedes sd where sd.id = k.sucursal_id)) order by k.abierto_en desc))[1:10] as lista
              from piefirme.ctl_caso k
             where k.organizacion_id = v_org and k.tipo = 'diferencia_relevo' and k.abierto_en >= v_ini and k.abierto_en < v_fin and k.contexto ->> 'usuario_saliente' is not null
               and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal)
             group by 1) g
     where g.relevos_con_diferencia >= v_umbral) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.relevos_con_diferencia desc), '[]'::jsonb) into v_rec_turno from (
    select sd.nombre as sucursal, coalesce(tu.nombre_turno, 'Turno sin nombre') as turno, count(distinct k.contexto ->> 'entrega_id')::integer as relevos_con_diferencia, count(*)::integer as casos,
           (array_agg(jsonb_build_object('id', k.id, 'folio', k.folio, 'abierto_en', k.abierto_en, 'estado', k.estado, 'valor', k.valor) order by k.abierto_en desc))[1:10] as lista
      from piefirme.ctl_caso k join piefirme.sedes sd on sd.id = k.sucursal_id left join piefirme.turnos_caja tu on tu.id = k.turno_saliente_id
     where k.organizacion_id = v_org and k.tipo = 'diferencia_relevo' and k.abierto_en >= v_ini and k.abierto_en < v_fin and piefirme_app.puede_sede(k.sucursal_id) and (p_sucursal is null or k.sucursal_id = p_sucursal)
     group by sd.nombre, coalesce(tu.nombre_turno, 'Turno sin nombre') having count(distinct k.contexto ->> 'entrega_id') >= v_umbral) x;

  return jsonb_build_object('periodo', jsonb_build_object('desde', v_d, 'hasta', v_h), 'abiertos_por_sucursal', v_abiertos, 'causas', v_causas, 'monto', v_monto,
    'recurrencia', jsonb_build_object('umbral_relevos', v_umbral, 'por_persona_saliente', v_rec_persona, 'por_turno', v_rec_turno,
      'nota', 'Indicador para investigar, no una conclusión: una persona aparece del lado saliente cuando su turno cerró con diferencias en la entrega, pero la causa puede ser una entrada sin registrar, un traspaso o un error de captura. Abra cada caso para ver los movimientos de contexto antes de sacar cualquier conclusión.'));
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_casos_listar', 'ctl_caso_detalle', 'ctl_casos_reportes') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
