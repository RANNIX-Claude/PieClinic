-- 242 · Control y Auditoría · ETAPA 6 · F7.1 CONSULTA DE DIFERENCIAS (pantalla principal del dueño).
-- Una sola llamada agrega EN LA BASE DE DATOS (PostgREST corta a 1,000 filas; aquí se devuelve un solo jsonb): totales, página de filas, y las tres agrupaciones
-- (por sucursal, por producto, por auditor). Quién entra: dueño, supervisor (solo sus sucursales) y soporte RANNIX en solo lectura (capacidad ver_diferencias).
-- El rol de sucursal recibe PF403: no ve diferencias en ninguna pantalla ni respuesta. CADA consulta (y cada exportación) deja una fila en
-- ctl_bitacora_consulta: quién consultó qué, con qué filtros y cuántas filas devolvió.
-- Filtros (jsonb, todos opcionales): desde, hasta (fechas locales) · sucursales[] o sucursal · auditor · producto · categoria · buscar · tipo (faltantes | sobrantes | ambas)
--   · umbral_piezas · umbral_pesos (valor absoluto, al costo) · orden (valor | piezas | fecha | sucursal | producto) · limite (≤ 500) · offset · exportar (hasta 20,000 filas).
-- Orden por omisión: mayor diferencia valorizada primero (no lo más reciente).
-- Depende de: 200–206, 210–213, 220–223, 240, 241.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_reportes_opciones() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias');
begin
  return jsonb_build_object(
    'sucursales', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.nombre), '[]'::jsonb)
                     from piefirme.sedes s where s.organizacion_id = v_org and s.activa and piefirme_app.puede_sede(s.id)),
    'auditores', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre), '[]'::jsonb)
                    from (select p.id, piefirme_app.ctl_nombre_usuario(p.id) as nombre from piefirme.perfiles p
                           where p.organizacion_id = v_org and exists (select 1 from piefirme.ctl_sesion_conteo s where s.organizacion_id = v_org and s.usuario_captura = p.id)) u),
    'categorias', (select coalesce(jsonb_agg(c order by c), '[]'::jsonb)
                     from (select distinct p.categoria as c from piefirme.productos p where p.organizacion_id = v_org and p.categoria is not null and btrim(p.categoria) <> '') x));
end $$;

create or replace function piefirme.ctl_dif_consultar(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); f jsonb := coalesce(p_filtros, '{}'::jsonb); t0 timestamptz := clock_timestamp();
  r record; v_sedes uuid[];
  v_tipo text := coalesce(nullif(f ->> 'tipo', ''), 'ambas');
  v_aud uuid := nullif(f ->> 'auditor', '')::uuid; v_prod uuid := nullif(f ->> 'producto', '')::uuid;
  v_cat text := nullif(btrim(coalesce(f ->> 'categoria', '')), ''); v_q text := nullif(btrim(coalesce(f ->> 'buscar', '')), '');
  v_up numeric := nullif(f ->> 'umbral_piezas', '')::numeric; v_um numeric := nullif(f ->> 'umbral_pesos', '')::numeric;
  v_orden text := coalesce(nullif(f ->> 'orden', ''), 'valor'); v_exp boolean := coalesce((f ->> 'exportar')::boolean, false);
  v_lim integer; v_off integer := greatest(coalesce(nullif(f ->> 'offset', '')::integer, 0), 0);
  v_res jsonb; v_total integer;
begin
  if v_tipo not in ('faltantes', 'sobrantes', 'ambas') then raise exception 'El tipo de diferencia debe ser faltantes, sobrantes o ambas.' using errcode = 'PF422'; end if;
  if v_orden not in ('valor', 'piezas', 'fecha', 'sucursal', 'producto') then raise exception 'Orden no válido: %', v_orden using errcode = 'PF422'; end if;
  if coalesce(v_up, 0) < 0 or coalesce(v_um, 0) < 0 then raise exception 'Los umbrales no pueden ser negativos.' using errcode = 'PF422'; end if;
  v_lim := case when v_exp then 20000 else least(greatest(coalesce(nullif(f ->> 'limite', '')::integer, 100), 1), 500) end;
  select * into r from piefirme_app.ctl_rango(v_org, f, 90);
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, f);

  with fl as materialized (
    select b.partida_id, b.sesion_id, b.sucursal_id, sd.nombre as sucursal, b.producto_id, pr.nombre as producto, pr.codigo_barras, pr.categoria, b.auditor_id,
           b.escaneado_en, b.tipo_sesion, b.fisica, b.saldo, b.dif_piezas, b.costo, b.dif_valor, b.nota, k.id as caso_id, k.folio as caso_folio, k.estado as caso_estado
      from piefirme_app.ctl_dif_filas(v_org, r.v_ini, r.v_fin) b
      join piefirme.productos pr on pr.id = b.producto_id
      join piefirme.sedes sd on sd.id = b.sucursal_id
      left join lateral (select k2.id, k2.folio, k2.estado from piefirme.ctl_caso k2
                          where k2.organizacion_id = v_org and k2.origen_tipo = 'partida_conteo' and k2.origen_id = b.partida_id order by k2.abierto_en limit 1) k on true
     where b.sucursal_id = any (v_sedes)
       and (v_aud is null or b.auditor_id = v_aud) and (v_prod is null or b.producto_id = v_prod) and (v_cat is null or pr.categoria = v_cat)
       and (v_q is null or pr.nombre ilike '%' || v_q || '%' or pr.codigo_barras ilike '%' || v_q || '%' or pr.sku ilike '%' || v_q || '%')
       and (v_tipo = 'ambas' or (v_tipo = 'faltantes' and b.dif_piezas < 0) or (v_tipo = 'sobrantes' and b.dif_piezas > 0))
       and (v_up is null or abs(b.dif_piezas) >= v_up) and (v_um is null or abs(b.dif_valor) >= v_um)
  ), aud as (
    select p.creado_por as auditor_id, count(distinct p.sesion_id)::integer as auditorias, count(*)::integer as partidas
      from piefirme.ctl_partida_conteo p join piefirme.ctl_sesion_conteo s on s.id = p.sesion_id
     where p.organizacion_id = v_org and p.escaneado_en >= r.v_ini and p.escaneado_en < r.v_fin and s.tipo <> 'conteo_inicial' and s.estado <> 'cancelada'
       and p.sucursal_id = any (v_sedes) and (v_aud is null or p.creado_por = v_aud)
       and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)
     group by p.creado_por
  )
  select jsonb_build_object(
    'totales', (select jsonb_build_object(
        'lineas', count(*), 'faltantes_lineas', count(*) filter (where dif_piezas < 0), 'sobrantes_lineas', count(*) filter (where dif_piezas > 0),
        'faltantes_piezas', coalesce(sum(-dif_piezas) filter (where dif_piezas < 0), 0), 'sobrantes_piezas', coalesce(sum(dif_piezas) filter (where dif_piezas > 0), 0),
        'faltantes_valor', coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0), 'sobrantes_valor', coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0),
        'neto_valor', coalesce(sum(dif_valor), 0),
        'casos_pendientes_ajuste', count(distinct caso_id) filter (where caso_estado in ('abierta', 'en_investigacion', 'ajuste_fallido')),
        'casos_ajustados', count(distinct caso_id) filter (where caso_estado = 'cerrada_con_ajuste'),
        'casos_total', count(distinct caso_id)) from fl),
    'total_filas', (select count(*) from fl),
    'filas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n), '[]'::jsonb) from (
        select row_number() over (order by
                 (case when v_orden = 'valor' then abs(g.dif_valor) end) desc nulls last, (case when v_orden = 'piezas' then abs(g.dif_piezas) end) desc nulls last,
                 (case when v_orden = 'fecha' then g.escaneado_en end) desc nulls last, (case when v_orden = 'sucursal' then g.sucursal end),
                 (case when v_orden = 'producto' then g.producto end), abs(g.dif_valor) desc, g.partida_id) as n,
               g.partida_id, g.escaneado_en as fecha_hora, g.sucursal_id, g.sucursal, g.producto_id, g.producto, g.codigo_barras, g.categoria, g.fisica, g.saldo as sistema,
               g.dif_piezas, g.costo, g.dif_valor, g.auditor_id, piefirme_app.ctl_nombre_usuario(g.auditor_id) as auditor, coalesce(g.caso_estado, 'sin_caso') as estado_ajuste,
               g.caso_id, g.caso_folio, g.nota, g.tipo_sesion as modo, g.sesion_id
          from fl g
         order by (case when v_orden = 'valor' then abs(g.dif_valor) end) desc nulls last, (case when v_orden = 'piezas' then abs(g.dif_piezas) end) desc nulls last,
                  (case when v_orden = 'fecha' then g.escaneado_en end) desc nulls last, (case when v_orden = 'sucursal' then g.sucursal end),
                  (case when v_orden = 'producto' then g.producto end), abs(g.dif_valor) desc, g.partida_id
         offset v_off limit v_lim) x),
    'por_sucursal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.puesto), '[]'::jsonb) from (
        select row_number() over (order by sum(-dif_valor) filter (where dif_piezas < 0) desc nulls last, sucursal) as puesto, sucursal_id, sucursal, count(*) as lineas,
               count(distinct producto_id) as productos, coalesce(sum(-dif_piezas) filter (where dif_piezas < 0), 0) as faltantes_piezas,
               coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0) as faltantes_valor, coalesce(sum(dif_piezas) filter (where dif_piezas > 0), 0) as sobrantes_piezas,
               coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0) as sobrantes_valor, coalesce(sum(dif_valor), 0) as neto_valor,
               count(distinct caso_id) filter (where caso_estado in ('abierta', 'en_investigacion', 'ajuste_fallido')) as casos_pendientes
          from fl group by sucursal_id, sucursal) x),
    'por_producto', (select coalesce(jsonb_agg(to_jsonb(x) order by x.auditorias desc, x.faltantes_valor desc, x.producto), '[]'::jsonb) from (
        select producto_id, producto, codigo_barras, count(*) as lineas, count(distinct sesion_id) as auditorias, count(distinct sucursal_id) as sucursales,
               coalesce(sum(-dif_piezas) filter (where dif_piezas < 0), 0) as faltantes_piezas, coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0) as faltantes_valor,
               coalesce(sum(dif_piezas) filter (where dif_piezas > 0), 0) as sobrantes_piezas, coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0) as sobrantes_valor
          from fl group by producto_id, producto, codigo_barras
         order by count(distinct sesion_id) desc, coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0) desc limit 25) x),
    'por_auditor', (select coalesce(jsonb_agg(to_jsonb(x) order by x.auditorias desc, x.auditor), '[]'::jsonb) from (
        select a.auditor_id, coalesce(piefirme_app.ctl_nombre_usuario(a.auditor_id), 'Sin nombre') as auditor, a.auditorias, a.partidas,
               coalesce(d.lineas, 0) as lineas_con_diferencia, coalesce(d.faltantes_valor, 0) as faltantes_valor, coalesce(d.sobrantes_valor, 0) as sobrantes_valor
          from aud a
          left join (select auditor_id, count(*) as lineas, sum(-dif_valor) filter (where dif_piezas < 0) as faltantes_valor, sum(dif_valor) filter (where dif_piezas > 0) as sobrantes_valor
                       from fl group by auditor_id) d on d.auditor_id = a.auditor_id) x),
    'no_reportados', (select count(*) from piefirme.ctl_lista_solicitada l join piefirme.ctl_sesion_conteo s on s.id = l.sesion_id
                       where l.organizacion_id = v_org and not l.reportado and s.estado in ('cerrada', 'expirada') and s.tipo <> 'conteo_inicial'
                         and s.abierta_en >= r.v_ini and s.abierta_en < r.v_fin and s.sucursal_id = any (v_sedes))
  ) into v_res;

  v_total := (v_res ->> 'total_filas')::integer;
  perform piefirme_app.ctl_log_consulta(v_org, case when v_exp then 'diferencias:exportar' else 'diferencias' end,
                                        f || jsonb_build_object('desde_efectivo', r.v_desde, 'hasta_efectivo', r.v_hasta, 'filas_resultado', v_total));
  return v_res || jsonb_build_object('ok', true, 'periodo', jsonb_build_object('desde', r.v_desde, 'hasta', r.v_hasta), 'truncado', v_exp and v_total > v_lim,
                                     'limite', v_lim, 'offset', v_off, 'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000));
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme' and p.proname in ('ctl_reportes_opciones', 'ctl_dif_consultar') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
