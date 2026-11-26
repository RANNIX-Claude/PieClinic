-- 243 · Control y Auditoría · ETAPA 6 · F7.2 TABLERO DE DUEÑO: «¿cómo van mis tiendas hoy?» en una sola llamada.
-- Cierres del día y cuáles faltan, sucursales sin conteo de apertura, casos abiertos por antigüedad, diferencia valorizada del periodo con su tendencia y la del periodo
-- anterior, alertas sin atender, turnos con entrega no aceptada, auditorías remotas en curso y el tablero de salud (sucursales que no han sincronizado en más de N horas).
-- Quién entra: dueño, supervisor (solo sus sucursales) y soporte RANNIX en solo lectura (ver_diferencias). El rol de sucursal recibe PF403.
-- «Operó hoy» = hubo una venta cobrada o se abrió un turno de caja hoy: una sucursal cerrada ese día no se marca como «sin cierre».
-- «Sincronizó» = última señal de vida en el módulo (captura, sesión, cierre, foto): lo que la PWA de la Etapa 5 envía al volver la señal.
-- Depende de: 200–206, 210–213, 220–223, 230–235, 240–242.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_tablero(p_dias integer default 30) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.ctl_exigir('ver_diferencias'); v_dias integer := least(greatest(coalesce(p_dias, 30), 7), 180);
  v_hoy date := piefirme_app.ctl_hoy(v_org); v_tz text := piefirme_app.ctl_zona(v_org); v_sedes uuid[];
  v_hoy_ini timestamptz; v_fin timestamptz; v_ini timestamptz; v_ini_prev timestamptz;
  v_hsync integer := piefirme_app.ctl_cfg_num(v_org, 'salud_sync_horas', null)::integer;
  v_h_ap integer := piefirme_app.ctl_cfg_num(v_org, 'alertas_hora_sin_apertura', null)::integer;
  v_h_ci integer := piefirme_app.ctl_cfg_num(v_org, 'alertas_hora_sin_cierre', null)::integer;
  v_hora integer; v_suc jsonb; v_casos jsonb; v_dif jsonb; v_alertas jsonb; v_ent jsonb; v_rem jsonb; v_res jsonb;
begin
  v_hoy_ini := v_hoy::timestamp at time zone v_tz; v_fin := (v_hoy + 1)::timestamp at time zone v_tz;
  v_ini := (v_hoy - (v_dias - 1))::timestamp at time zone v_tz; v_ini_prev := (v_hoy - (2 * v_dias - 1))::timestamp at time zone v_tz;
  v_hora := extract(hour from now() at time zone v_tz)::integer;
  v_sedes := piefirme_app.ctl_sedes_filtro(v_org, '{}'::jsonb);

  -- por sucursal: apertura, cierres, entregas, sincronización, casos, alertas y auditorías remotas
  select coalesce(jsonb_agg(to_jsonb(y) order by y.nombre), '[]'::jsonb) into v_suc from (
    select x.*,
           case when not x.usa_modulo then 'sin_modulo'
                when x.apertura_sesion = 'cerrada' then 'hecha' when x.apertura_sesion = 'abierta' then 'en_curso'
                when x.opero_hoy and v_hora >= v_h_ap then 'tarde' else 'pendiente' end as apertura,
           case when not x.usa_modulo then 'sin_modulo'
                when x.cierres_hoy > 0 then 'hecho' when x.cierres_en_captura > 0 then 'en_captura'
                when x.opero_hoy and v_hora >= v_h_ci then 'tarde' else 'pendiente' end as cierre,
           (x.usa_modulo and x.ultima_actividad is not null and x.ultima_actividad < now() - make_interval(hours => v_hsync)) as sin_sync
      from (
        select s.id, s.nombre, u.usa as usa_modulo,
               ap.estado as apertura_sesion, ap.folio as apertura_folio,
               coalesce(ci.cerrados, 0)::integer as cierres_hoy, coalesce(ci.en_captura, 0)::integer as cierres_en_captura,
               coalesce(en.n, 0)::integer as entregas_pendientes,
               ua.t as ultima_actividad, round(extract(epoch from (now() - ua.t)) / 3600, 1) as horas_sin_sync,
               (exists (select 1 from piefirme.ventas v where v.organizacion_id = v_org and v.sede_id = s.id and v.cobrada_en >= v_hoy_ini and v.cobrada_en < v_fin)
                or exists (select 1 from piefirme.turnos_caja t where t.organizacion_id = v_org and t.sede_id = s.id and t.apertura_en >= v_hoy_ini and t.apertura_en < v_fin)) as opero_hoy,
               coalesce(ca.n, 0)::integer as casos_abiertos, coalesce(al.n, 0)::integer as alertas_sin_atender, coalesce(rm.n, 0)::integer as remotas_en_curso
          from piefirme.sedes s
          cross join lateral (select piefirme_app.ctl_sucursal_usa_modulo(v_org, s.id) as usa) u
          left join lateral (select k.estado, k.folio from piefirme.ctl_sesion_conteo k
                              where k.organizacion_id = v_org and k.sucursal_id = s.id and k.tipo = 'conteo_apertura' and k.estado in ('abierta', 'cerrada')
                                and k.abierta_en >= v_hoy_ini and k.abierta_en < v_fin order by (k.estado = 'cerrada') desc, k.abierta_en desc limit 1) ap on true
          left join lateral (select count(*) filter (where c.estado in ('cerrado', 'entrega_no_aceptada') and c.cerrado_en >= v_hoy_ini and c.cerrado_en < v_fin and c.tipo in ('turno', 'dia')) as cerrados,
                                    count(*) filter (where c.estado = 'en_captura' and c.tipo in ('turno', 'dia')) as en_captura
                               from piefirme.ctl_cierre c where c.organizacion_id = v_org and c.sucursal_id = s.id and c.abierto_en >= v_hoy_ini - interval '1 day') ci on true
          left join lateral (select count(*) as n from piefirme.ctl_entrega e where e.organizacion_id = v_org and e.sucursal_id = s.id and e.estado = 'pendiente') en on true
          left join lateral (select piefirme_app.ctl_ultima_actividad(v_org, s.id) as t) ua on true
          left join lateral (select count(*) as n from piefirme.ctl_caso k where k.organizacion_id = v_org and k.sucursal_id = s.id and k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido')) ca on true
          left join lateral (select count(*) as n from piefirme.ctl_alerta a where a.organizacion_id = v_org and a.sucursal_id = s.id and a.estado in ('nueva', 'vista')) al on true
          left join lateral (select count(*) as n from piefirme.ctl_sesion_conteo k where k.organizacion_id = v_org and k.sucursal_id = s.id and k.tipo = 'auditoria_remota' and k.estado = 'abierta') rm on true
         where s.organizacion_id = v_org and s.activa and s.id = any (v_sedes)
      ) x
  ) y;

  -- casos abiertos por antigüedad (cubetas) y por sucursal
  select jsonb_build_object(
    'abiertos', count(*), 'ajuste_fallido', count(*) filter (where k.estado = 'ajuste_fallido'), 'sin_asignar', count(*) filter (where k.asignado_a is null),
    'valor_abierto', coalesce(sum(abs(k.valor)), 0),
    'cubetas', jsonb_build_array(
      jsonb_build_object('cubeta', '0–2 días',  'casos', count(*) filter (where d.dias <= 2)),
      jsonb_build_object('cubeta', '3–7 días',  'casos', count(*) filter (where d.dias between 3 and 7)),
      jsonb_build_object('cubeta', '8–14 días', 'casos', count(*) filter (where d.dias between 8 and 14)),
      jsonb_build_object('cubeta', '15–30 días','casos', count(*) filter (where d.dias between 15 and 30)),
      jsonb_build_object('cubeta', 'Más de 30', 'casos', count(*) filter (where d.dias > 30))),
    'mas_antiguo_dias', coalesce(max(d.dias), 0))
    into v_casos
    from piefirme.ctl_caso k
    cross join lateral (select floor(extract(epoch from (now() - k.abierto_en)) / 86400)::integer as dias) d
   where k.organizacion_id = v_org and k.estado in ('abierta', 'en_investigacion', 'ajuste_fallido') and k.sucursal_id = any (v_sedes);

  -- diferencia valorizada del periodo, del periodo anterior y su tendencia diaria
  with d as (select b.sucursal_id, b.escaneado_en, b.dif_piezas, b.dif_valor from piefirme_app.ctl_dif_filas(v_org, v_ini_prev, v_fin) b where b.sucursal_id = any (v_sedes)),
  dias as (select (v_hoy - (v_dias - 1) + g)::date as fecha from generate_series(0, v_dias - 1) g),
  diario as (select (d.escaneado_en at time zone v_tz)::date as fecha, sum(-d.dif_valor) filter (where d.dif_piezas < 0) as faltante, sum(d.dif_valor) filter (where d.dif_piezas > 0) as sobrante
               from d where d.escaneado_en >= v_ini group by 1)
  select jsonb_build_object(
    'dias', v_dias, 'desde', v_hoy - (v_dias - 1), 'hasta', v_hoy,
    'periodo', (select jsonb_build_object('faltante_valor', coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0), 'sobrante_valor', coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0),
                                         'neto_valor', coalesce(sum(dif_valor), 0), 'faltante_piezas', coalesce(sum(-dif_piezas) filter (where dif_piezas < 0), 0),
                                         'sobrante_piezas', coalesce(sum(dif_piezas) filter (where dif_piezas > 0), 0), 'lineas', count(*)) from d where escaneado_en >= v_ini),
    'anterior', (select jsonb_build_object('faltante_valor', coalesce(sum(-dif_valor) filter (where dif_piezas < 0), 0), 'sobrante_valor', coalesce(sum(dif_valor) filter (where dif_piezas > 0), 0),
                                          'neto_valor', coalesce(sum(dif_valor), 0), 'lineas', count(*)) from d where escaneado_en < v_ini),
    'tendencia', (select coalesce(jsonb_agg(jsonb_build_object('fecha', di.fecha, 'faltante', coalesce(dr.faltante, 0), 'sobrante', coalesce(dr.sobrante, 0), 'neto', coalesce(dr.sobrante, 0) - coalesce(dr.faltante, 0)) order by di.fecha), '[]'::jsonb)
                    from dias di left join diario dr on dr.fecha = di.fecha))
    into v_dif;

  -- alertas sin atender
  select jsonb_build_object(
    'sin_atender', count(*), 'nuevas', count(*) filter (where a.estado = 'nueva'),
    'por_severidad', jsonb_build_object('critica', count(*) filter (where a.severidad = 'critica'), 'alta', count(*) filter (where a.severidad = 'alta'),
                                        'media', count(*) filter (where a.severidad = 'media'), 'baja', count(*) filter (where a.severidad = 'baja')),
    'recientes', coalesce((select jsonb_agg(to_jsonb(z) order by z.creado_en desc) from (
        select a2.id, a2.tipo, coalesce(c.nombre, a2.tipo) as nombre, a2.severidad, a2.mensaje, a2.creado_en, a2.estado, sd.nombre as sucursal
          from piefirme.ctl_alerta a2 left join piefirme.ctl_alerta_catalogo c on c.tipo = a2.tipo left join piefirme.sedes sd on sd.id = a2.sucursal_id
         where a2.organizacion_id = v_org and a2.estado in ('nueva', 'vista') and (a2.sucursal_id is null or a2.sucursal_id = any (v_sedes))
         order by case a2.severidad when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, a2.creado_en desc limit 6) z), '[]'::jsonb))
    into v_alertas
    from piefirme.ctl_alerta a where a.organizacion_id = v_org and a.estado in ('nueva', 'vista') and (a.sucursal_id is null or a.sucursal_id = any (v_sedes));

  -- turnos con entrega no aceptada
  select coalesce(jsonb_agg(to_jsonb(z) order by z.entregado_en), '[]'::jsonb) into v_ent from (
    select e.id, e.sucursal_id, sd.nombre as sucursal, c.folio as cierre_folio, e.entregado_en, e.monto_entregado,
           piefirme_app.ctl_nombre_usuario(e.usuario_entrega) as usuario_entrega, round(extract(epoch from (now() - e.entregado_en)) / 3600, 1) as horas
      from piefirme.ctl_entrega e join piefirme.ctl_cierre c on c.id = e.cierre_id join piefirme.sedes sd on sd.id = e.sucursal_id
     where e.organizacion_id = v_org and e.estado = 'pendiente' and e.sucursal_id = any (v_sedes)) z;

  -- auditorías remotas en curso
  select coalesce(jsonb_agg(to_jsonb(z) order by z.limite_en), '[]'::jsonb) into v_rem from (
    select s.id, s.folio, s.sucursal_id, sd.nombre as sucursal, s.solicitada_en, s.limite_en, s.recibida_en,
           (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id) as en_lista,
           (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id and l.reportado) as reportadas,
           s.total_partidas as partidas, greatest(0, round(extract(epoch from (s.limite_en - now())) / 60))::integer as minutos_restantes
      from piefirme.ctl_sesion_conteo s join piefirme.sedes sd on sd.id = s.sucursal_id
     where s.organizacion_id = v_org and s.tipo = 'auditoria_remota' and s.estado = 'abierta' and s.sucursal_id = any (v_sedes)) z;

  v_res := jsonb_build_object(
    'generado_en', now(), 'hoy', v_hoy, 'zona', v_tz, 'hora_local', v_hora, 'umbral_sync_horas', v_hsync, 'hora_sin_apertura', v_h_ap, 'hora_sin_cierre', v_h_ci,
    'sucursales', v_suc, 'casos', v_casos, 'diferencia', v_dif, 'alertas', v_alertas, 'entregas_no_aceptadas', v_ent, 'remotas_en_curso', v_rem);
  v_res := v_res || jsonb_build_object('resumen', jsonb_build_object(
    'sucursales', jsonb_array_length(v_suc),
    'cierres_hechos', (select count(*) from jsonb_array_elements(v_suc) s where s ->> 'cierre' = 'hecho'),
    'cierres_faltan', (select count(*) from jsonb_array_elements(v_suc) s where s ->> 'cierre' in ('pendiente', 'tarde', 'en_captura')),
    'sin_apertura', (select count(*) from jsonb_array_elements(v_suc) s where s ->> 'apertura' = 'tarde'),
    'sin_sincronizar', (select count(*) from jsonb_array_elements(v_suc) s where (s ->> 'sin_sync')::boolean),
    'entregas_no_aceptadas', jsonb_array_length(v_ent), 'remotas_en_curso', jsonb_array_length(v_rem),
    'casos_abiertos', (v_casos ->> 'abiertos')::integer, 'alertas_sin_atender', (v_alertas ->> 'sin_atender')::integer));
  perform piefirme_app.ctl_log_consulta(v_org, 'tablero', jsonb_build_object('dias', v_dias));
  return v_res;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = 'ctl_tablero' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
