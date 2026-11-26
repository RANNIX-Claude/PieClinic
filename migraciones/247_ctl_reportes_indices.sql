-- 247 · Control y Auditoría · ETAPA 6 · ÍNDICES del tablero de salud.
-- ctl_ultima_actividad (última señal de vida de una sucursal en el módulo) se calcula por sucursal en cada carga del tablero: sin estos índices cada máximo recorre la tabla
-- completa (con 63 mil partidas el tablero tardaba casi 3 s). Con ellos es una lectura de índice por sucursal.
-- Depende de: 200, 240, 241.
set search_path = piefirme, piefirme_app, extensions;

create index if not exists ctl_partida_actividad_idx on piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, creado_en desc);
create index if not exists ctl_cierre_cap_actividad_idx on piefirme.ctl_cierre_captura (organizacion_id, sucursal_id, creado_en desc);
create index if not exists ctl_evid_actividad_idx on piefirme.ctl_evidencia (organizacion_id, sucursal_id, creado_en desc);

-- sesiones y cierres ya tienen índice por (organización, sucursal, fecha de apertura): se usa esa columna (es la hora del servidor al abrirse)
create or replace function piefirme_app.ctl_ultima_actividad(p_org uuid, p_sucursal uuid) returns timestamptz
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select greatest(
    (select x.creado_en from piefirme.ctl_partida_conteo x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal order by x.creado_en desc limit 1),
    (select x.abierta_en from piefirme.ctl_sesion_conteo x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal order by x.abierta_en desc limit 1),
    (select x.creado_en from piefirme.ctl_cierre_captura x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal order by x.creado_en desc limit 1),
    (select x.abierto_en from piefirme.ctl_cierre x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal order by x.abierto_en desc limit 1),
    (select x.creado_en from piefirme.ctl_evidencia x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal order by x.creado_en desc limit 1))
$$;
revoke all on function piefirme_app.ctl_ultima_actividad(uuid, uuid) from public, anon, authenticated;
