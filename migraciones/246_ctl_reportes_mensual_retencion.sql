-- 246 · Control y Auditoría · ETAPA 6 · F7.4 REPORTE MENSUAL, BITÁCORA DE CONSULTAS Y RETENCIÓN DE FOTOS.
--   · ctl_reporte_mensual(mes): los datos del PDF de dos páginas del mes (diferencia valorizada total y por sucursal con comparativo contra el mes anterior, distribución de causas,
--     casos abiertos y cerrados, los diez productos con más recurrencia). El PDF se arma en el cliente (src/lib/auditoria/reporteMensualPdf.js) con estos datos.
--   · ctl_bitacora_consultas_listar: «quién consultó qué» para el dueño y el soporte RANNIX.
--   · Retención de fotos (datos personales de empleados: 90 días por omisión, tope 365): ctl_fotos_por_purgar / ctl_fotos_marcar_purgadas (solo service_role: las usa
--     scripts/auditoria-purgar-fotos.mjs, que borra los objetos de storage y anota la purga) y ctl_retencion_resumen para el dueño.
--     La evidencia es solo-inserción: la fila de ctl_evidencia se CONSERVA (con su hash, para seguir detectando fotos repetidas) y la purga queda anotada en ctl_evidencia_purga.
--     No se purga: la foto adjunta a un caso abierto, ni la última foto de cada toma fija (es la guía fantasma de la siguiente).
-- Depende de: 200–206, 220–223, 240–242.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── F7.4 · reporte mensual ─────────────────────────────
create or replace function piefirme.ctl_reporte_mensual(p_mes date default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); t0 timestamptz := clock_timestamp(); v_tz text := piefirme_app.ctl_zona(v_org); v_hoy date := piefirme_app.ctl_hoy(v_org);
  v_mes date := date_trunc('month', coalesce(p_mes, v_hoy))::date; v_sig date; v_ant date;
  v_ini timestamptz; v_fin timestamptz; v_ini_ant timestamptz; v_sedes uuid[]; v_res jsonb; v_org_nombre text;
begin
  if v_mes > date_trunc('month', v_hoy)::date then raise exception 'El mes pedido todavía no empieza.' using errcode = 'PF422'; end if;
  v_sig := (v_mes + interval '1 month')::date; v_ant := (v_mes - interval '1 month')::date;
  v_ini := v_mes::timestamp at time zone v_tz; v_fin := v_sig::timestamp at time zone v_tz; v_ini_ant := v_ant::timestamp at time zone v_tz;
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, '{}'::jsonb);
  select o.nombre into v_org_nombre from piefirme.organizaciones o where o.id = v_org;

  with d as materialized (select b.* from piefirme_app.ctl_dif_filas(v_org, v_ini_ant, v_fin) b where b.sucursal_id = any (v_sedes)),
  m as (select * from d where escaneado_en >= v_ini), p as (select * from d where escaneado_en < v_ini),
  suc as (
    select s.id as sucursal_id, s.nombre as sucursal,
           coalesce((select sum(-m.dif_valor) from m where m.sucursal_id = s.id and m.dif_piezas < 0), 0) as faltante_valor,
           coalesce((select sum(m.dif_valor) from m where m.sucursal_id = s.id and m.dif_piezas > 0), 0) as sobrante_valor,
           coalesce((select sum(-p.dif_valor) from p where p.sucursal_id = s.id and p.dif_piezas < 0), 0) as previo_faltante_valor,
           coalesce((select sum(p.dif_valor) from p where p.sucursal_id = s.id and p.dif_piezas > 0), 0) as previo_sobrante_valor
      from piefirme.sedes s where s.organizacion_id = v_org and s.activa and s.id = any (v_sedes)
  ), cerrados as (
    select k.id, k.estado, k.valor, k.monto_costo, k.responsable_costo, ca.nombre as causa
      from piefirme.ctl_caso k left join piefirme.ctl_causa ca on ca.id = k.causa_id
     where k.organizacion_id = v_org and k.sucursal_id = any (v_sedes) and k.cerrado_en >= v_ini and k.cerrado_en < v_fin
  )
  select jsonb_build_object(
    'mes', v_mes, 'mes_anterior', v_ant, 'organizacion', v_org_nombre, 'zona', v_tz,
    'total', (select jsonb_build_object(
        'faltante_valor', coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0), 'sobrante_valor', coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0), 'neto_valor', coalesce(sum(dif_valor), 0),
        'faltante_piezas', coalesce(sum(-dif_piezas) filter (where dif_piezas < 0), 0), 'sobrante_piezas', coalesce(sum(dif_piezas) filter (where dif_piezas > 0), 0), 'lineas', count(*),
        'auditorias', count(distinct sesion_id)) from m),
    'total_anterior', (select jsonb_build_object(
        'faltante_valor', coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0), 'sobrante_valor', coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0), 'neto_valor', coalesce(sum(dif_valor), 0),
        'lineas', count(*)) from p),
    'por_sucursal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.faltante_valor desc, x.sucursal), '[]'::jsonb) from (
        select s.*, s.faltante_valor - s.previo_faltante_valor as variacion_faltante,
               case when s.previo_faltante_valor > 0 then round((s.faltante_valor - s.previo_faltante_valor) * 100 / s.previo_faltante_valor, 1) end as variacion_pct from suc s) x),
    'causas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.casos desc, x.causa), '[]'::jsonb) from (
        select causa, count(*) as casos, coalesce(sum(abs(valor)), 0) as valor, coalesce(sum(monto_costo), 0) as monto_absorbido from cerrados where causa is not null group by causa) x),
    'casos', jsonb_build_object(
        'nacidos_en_mes', (select count(*) from piefirme.ctl_caso k where k.organizacion_id = v_org and k.sucursal_id = any (v_sedes) and k.abierto_en >= v_ini and k.abierto_en < v_fin),
        'cerrados_en_mes', (select count(*) from cerrados where estado in ('cerrada_con_ajuste', 'cerrada_sin_ajuste', 'rechazada')),
        'cerrados_con_ajuste', (select count(*) from cerrados where estado = 'cerrada_con_ajuste'), 'cerrados_sin_ajuste', (select count(*) from cerrados where estado = 'cerrada_sin_ajuste'),
        'rechazados', (select count(*) from cerrados where estado = 'rechazada'),
        'abiertos_al_cierre_del_mes', (select count(*) from piefirme.ctl_caso k where k.organizacion_id = v_org and k.sucursal_id = any (v_sedes) and k.abierto_en < v_fin
                                         and (k.cerrado_en is null or k.cerrado_en >= v_fin)),
        'abiertos_hoy', (select count(*) from piefirme.ctl_caso k where k.organizacion_id = v_org and k.sucursal_id = any (v_sedes) and k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido'))),
    'top_productos', (select coalesce(jsonb_agg(to_jsonb(x) order by x.puesto), '[]'::jsonb) from (
        select row_number() over (order by count(distinct sesion_id) desc, sum(-dif_valor) desc, producto) as puesto, producto, codigo_barras, count(distinct sesion_id) as auditorias,
               count(distinct sucursal_id) as sucursales, sum(-dif_piezas) as faltante_piezas, sum(-dif_valor) as faltante_valor
          from (select m.*, pr.nombre as producto, pr.codigo_barras from m join piefirme.productos pr on pr.id = m.producto_id where m.dif_piezas < 0) q
         group by producto_id, producto, codigo_barras order by count(distinct sesion_id) desc, sum(-dif_valor) desc, producto limit 10) x),
    'no_reportados', (select count(*) from piefirme.ctl_lista_solicitada l join piefirme.ctl_sesion_conteo s on s.id = l.sesion_id
                       where l.organizacion_id = v_org and not l.reportado and s.estado in ('cerrada', 'expirada') and s.tipo <> 'conteo_inicial'
                         and s.abierta_en >= v_ini and s.abierta_en < v_fin and s.sucursal_id = any (v_sedes)),
    'nota', 'Valores al costo. La recurrencia de un producto es un indicador para investigar, no una conclusión: abra cada caso para ver los movimientos de contexto antes de actuar.'
  ) into v_res;
  perform piefirme_app.ctl_log_consulta(v_org, 'reporte_mensual', jsonb_build_object('mes', v_mes));
  return v_res || jsonb_build_object('ok', true, 'generado_en', now(), 'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000));
end $$;

-- ───────────────────────────── bitácora de consultas ─────────────────────────────
-- Dueño y soporte RANNIX (capacidad configurar): quién consultó qué. Filtros: desde, hasta, usuario, reporte (texto contenido), limite (≤ 500), offset.
create or replace function piefirme.ctl_bitacora_consultas_listar(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); f jsonb := coalesce(p_filtros, '{}'::jsonb); v_tz text := piefirme_app.ctl_zona(piefirme_app.org_id());
        v_desde date := nullif(f ->> 'desde', '')::date; v_hasta date := nullif(f ->> 'hasta', '')::date; v_usr uuid := nullif(f ->> 'usuario', '')::uuid; v_rep text := nullif(btrim(coalesce(f ->> 'reporte', '')), '');
        v_lim integer := least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 100), 1), 500); v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0); v_res jsonb;
begin
  with sel as (
    select b.* from piefirme.ctl_bitacora_consulta b
     where b.organizacion_id = v_org and (v_usr is null or b.usuario_id = v_usr) and (v_rep is null or b.reporte ilike '%' || v_rep || '%')
       and (v_desde is null or b.creado_en >= v_desde::timestamp at time zone v_tz) and (v_hasta is null or b.creado_en < (v_hasta + 1)::timestamp at time zone v_tz)
  )
  select jsonb_build_object('total', (select count(*) from sel),
    'filas', coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc) from (
        select s.id, s.creado_en, s.usuario_id, coalesce(piefirme_app.ctl_nombre_usuario(s.usuario_id), 'Sin nombre') as usuario, s.rol_ctl as rol, s.reporte, s.filtros
          from sel s order by s.creado_en desc offset v_off limit v_lim) x), '[]'::jsonb),
    'por_reporte', coalesce((select jsonb_agg(jsonb_build_object('reporte', r.reporte, 'n', r.n) order by r.n desc) from (select reporte, count(*) as n from sel group by reporte) r), '[]'::jsonb),
    'por_usuario', coalesce((select jsonb_agg(jsonb_build_object('usuario_id', u.usuario_id, 'usuario', u.usuario, 'rol', u.rol, 'n', u.n) order by u.n desc) from (
        select s.usuario_id, coalesce(piefirme_app.ctl_nombre_usuario(s.usuario_id), 'Sin nombre') as usuario, max(s.rol_ctl) as rol, count(*) as n from sel s group by s.usuario_id) u), '[]'::jsonb))
    into v_res;
  return v_res;
end $$;

-- ───────────────────────────── retención de fotos ─────────────────────────────
create or replace function piefirme_app.ctl_fotos_vencidas(p_org uuid, p_limite integer, p_ahora timestamptz default now())
returns table (evidencia_id uuid, sucursal_id uuid, url_almacenamiento text, hash_sha256 text, capturado_en timestamptz, retencion_dias integer)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select e.id, e.sucursal_id, e.url_almacenamiento, e.hash_sha256, e.capturado_en, r.dias
    from piefirme.ctl_evidencia e
    join (select s.id, piefirme_app.ctl_cfg_num(p_org, 'retencion_fotos_dias', s.id)::integer as dias from piefirme.sedes s where s.organizacion_id = p_org) r on r.id = e.sucursal_id
   where e.organizacion_id = p_org and e.capturado_en < p_ahora - make_interval(days => r.dias)
     and not exists (select 1 from piefirme.ctl_evidencia_purga u where u.evidencia_id = e.id and u.objeto_borrado)
     -- foto de un caso que sigue abierto (adjunta al caso, a su partida o a su captura de cierre)
     and not exists (select 1 from piefirme.ctl_caso_bitacora b join piefirme.ctl_caso k on k.id = b.caso_id
                      where b.evidencia_id = e.id and k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido'))
     and not exists (select 1 from piefirme.ctl_caso k where k.organizacion_id = p_org and k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido')
                        and ((e.tipo_origen = 'caso' and k.id = e.origen_id) or (e.tipo_origen in ('partida_conteo', 'cierre_captura') and k.origen_tipo = e.tipo_origen and k.origen_id = e.origen_id)))
     -- la última foto de una toma fija es la guía fantasma de la siguiente
     and not (e.toma_fija_id is not null and e.id = (select x.id from piefirme.ctl_evidencia x where x.toma_fija_id = e.toma_fija_id order by x.capturado_en desc limit 1))
   order by e.capturado_en
   limit greatest(p_limite, 1)
$$;

-- Para el script de purga (service_role): lo que ya venció según ctl_config de cada sucursal. p_org nulo = todas las organizaciones.
create or replace function piefirme.ctl_fotos_por_purgar(p_org uuid default null, p_limite integer default 500, p_ahora timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o record; v_res jsonb := '[]'::jsonb;
begin
  for o in select x.id from piefirme.organizaciones x where (p_org is null or x.id = p_org) loop
    v_res := v_res || coalesce((select jsonb_agg(jsonb_build_object('organizacion_id', o.id, 'evidencia_id', f.evidencia_id, 'sucursal_id', f.sucursal_id, 'ruta', f.url_almacenamiento,
                                                                    'capturado_en', f.capturado_en, 'retencion_dias', f.retencion_dias))
                                  from piefirme_app.ctl_fotos_vencidas(o.id, least(greatest(p_limite, 1), 5000), p_ahora) f), '[]'::jsonb);
  end loop;
  return jsonb_build_object('ok', true, 'fotos', v_res);
end $$;

-- Anota las fotos cuyo objeto ya se borró (o no se pudo). items: [{ "evidencia_id": uuid, "objeto_borrado": true|false }]
create or replace function piefirme.ctl_fotos_marcar_purgadas(p_org uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare i jsonb; e piefirme.ctl_evidencia%rowtype; v_n integer := 0; v_dias integer;
begin
  if p_org is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Indique la organización y la lista de fotos.' using errcode = 'PF400'; end if;
  for i in select * from jsonb_array_elements(p_items) loop
    select * into e from piefirme.ctl_evidencia where id = (i ->> 'evidencia_id')::uuid and organizacion_id = p_org;
    continue when not found;
    v_dias := piefirme_app.ctl_cfg_num(p_org, 'retencion_fotos_dias', e.sucursal_id)::integer;
    insert into piefirme.ctl_evidencia_purga (organizacion_id, sucursal_id, evidencia_id, url_almacenamiento, hash_sha256, retencion_dias, capturada_en, objeto_borrado)
    values (p_org, e.sucursal_id, e.id, e.url_almacenamiento, e.hash_sha256, v_dias, e.capturado_en, coalesce((i ->> 'objeto_borrado')::boolean, true))
    on conflict (evidencia_id) where objeto_borrado do nothing;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'anotadas', v_n);
end $$;

-- Resumen para el dueño y el soporte: cuánto se conserva, cuánto vence pronto y la última purga.
create or replace function piefirme.ctl_retencion_resumen() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); v_sedes uuid[] := piefirme_app.ctl_sedes_filtro(piefirme_app.org_id(), '{}'::jsonb);
        v_dias integer := piefirme_app.ctl_cfg_num(piefirme_app.org_id(), 'retencion_fotos_dias', null)::integer;
begin
  return jsonb_build_object(
    'retencion_dias', v_dias, 'tope_dias', 365,
    'fotos_total', (select count(*) from piefirme.ctl_evidencia e where e.organizacion_id = v_org and e.sucursal_id = any (v_sedes)),
    'fotos_purgadas', (select count(*) from piefirme.ctl_evidencia_purga u where u.organizacion_id = v_org and u.objeto_borrado and u.sucursal_id = any (v_sedes)),
    'por_purgar_ahora', (select count(*) from piefirme_app.ctl_fotos_vencidas(v_org, 100000) f where f.sucursal_id = any (v_sedes)),
    'vencen_en_7_dias', (select count(*) from piefirme_app.ctl_fotos_vencidas(v_org, 100000, now() + interval '7 days') f where f.sucursal_id = any (v_sedes))
                        - (select count(*) from piefirme_app.ctl_fotos_vencidas(v_org, 100000) f where f.sucursal_id = any (v_sedes)),
    'mas_antigua', (select min(e.capturado_en) from piefirme.ctl_evidencia e where e.organizacion_id = v_org and e.sucursal_id = any (v_sedes)
                      and not exists (select 1 from piefirme.ctl_evidencia_purga u where u.evidencia_id = e.id and u.objeto_borrado)),
    'ultima_purga', (select max(u.creado_en) from piefirme.ctl_evidencia_purga u where u.organizacion_id = v_org),
    'por_sucursal', coalesce((select jsonb_agg(jsonb_build_object('sucursal_id', s.id, 'sucursal', s.nombre, 'retencion_dias', piefirme_app.ctl_cfg_num(v_org, 'retencion_fotos_dias', s.id)::integer) order by s.nombre)
                                from piefirme.sedes s where s.organizacion_id = v_org and s.activa and s.id = any (v_sedes)), '[]'::jsonb),
    'nota', 'La purga la ejecuta scripts/auditoria-purgar-fotos.mjs (hoy no hay planificador). La fila de la evidencia y su hash se conservan; solo se borra el archivo.');
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' and p.proname = 'ctl_fotos_vencidas' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_reporte_mensual', 'ctl_bitacora_consultas_listar', 'ctl_retencion_resumen') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_fotos_por_purgar', 'ctl_fotos_marcar_purgadas') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
  end loop;
end $$;
