-- 241 · Control y Auditoría · ETAPA 6 · BASE DE LOS REPORTES: vista de pagos del origen, aperturas de cajón desde el evento y utilerías internas.
--   · v_ctl_pagos: novena vista del contrato de lectura sobre el origen (pagos por ticket con su método y monto). La mezcla de formas de pago (F1.6) necesita
--     MONTOS por método y v_ctl_ventas solo expone la lista de métodos de la línea; igual que las otras ocho: solo lectura, security_invoker, filtrada por ver_directo.
--   · Trigger: un evento «cajon_abierto_sin_venta» en ctl_eventos_entrada llena ctl_apertura_cajon (F1.5). Hoy el origen no lo emite (Etapa 1).
--   · piefirme_app.ctl_dif_filas: las partidas con diferencia (vigentes, sin conteo inicial) que alimentan el reporte de diferencias, el tablero y el mensual.
-- Depende de: 200–206, 240.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── v_ctl_pagos ─────────────────────────────
create or replace view piefirme.v_ctl_pagos with (security_invoker = true) as
  select pg.id as pago_id, v.id as venta_id, v.organizacion_id, v.folio as ticket, v.sede_id as sucursal_id, t.caja,
         coalesce(v.cajero_id, v.created_by) as usuario_id, coalesce(v.cobrada_en, v.created_at) as fecha_hora, v.estado, v.turno_id,
         pg.metodo, pg.monto
    from piefirme.pagos pg
    join piefirme.ventas v on v.id = pg.venta_id
    left join piefirme.turnos_caja t on t.id = v.turno_id
   where piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(v.sede_id);
revoke all on piefirme.v_ctl_pagos from public, anon;
grant select on piefirme.v_ctl_pagos to authenticated;

-- ───────────────────────────── cajón sin venta: del evento a la tabla ─────────────────────────────
create or replace function piefirme_app.ctl_trg_cajon_evento() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_suc uuid; v_fecha timestamptz;
begin
  if new.evento <> 'cajon_abierto_sin_venta' then return null; end if;
  begin
    v_suc := nullif(new.payload ->> 'sucursal_id', '')::uuid;
    v_fecha := coalesce(nullif(new.payload ->> 'fecha', '')::timestamptz, new.creado_en);
    if v_suc is null then raise exception 'el evento no trae sucursal_id'; end if;
    insert into piefirme.ctl_apertura_cajon (organizacion_id, sucursal_id, evento_id, usuario_id, caja, motivo, abierta_en)
    values (new.organizacion_id, v_suc, new.id, nullif(new.payload ->> 'usuario_id', '')::uuid, nullif(new.payload ->> 'caja', ''), nullif(left(new.payload ->> 'motivo', 300), ''), v_fecha)
    on conflict do nothing;
  exception when others then
    raise warning 'cajon_abierto_sin_venta no se pudo registrar (evento %): %', new.id, sqlerrm;   -- un payload malo nunca debe frenar al origen
  end;
  return null;
end $$;
drop trigger if exists t_40_cajon on piefirme.ctl_eventos_entrada;
create trigger t_40_cajon after insert on piefirme.ctl_eventos_entrada for each row execute function piefirme_app.ctl_trg_cajon_evento();

-- ───────────────────────────── utilerías internas ─────────────────────────────
create or replace function piefirme_app.ctl_zona(p_org uuid) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select o.zona_horaria from piefirme.organizaciones o where o.id = p_org), 'America/Mexico_City')
$$;

-- Quién consultó qué: una fila en la bitácora de consultas (solo inserción). El rol queda como lo ve el módulo (dueno, supervisor, soporte).
create or replace function piefirme_app.ctl_log_consulta(p_org uuid, p_reporte text, p_filtros jsonb) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.ctl_bitacora_consulta (organizacion_id, usuario_id, rol_ctl, reporte, filtros)
  values (p_org, auth.uid(), piefirme_app.ctl_rol(), left(coalesce(p_reporte, ''), 120), coalesce(p_filtros, '{}'::jsonb));
end $$;

-- Rango de fechas locales de un filtro → límites UTC [ini, fin). Por omisión los últimos p_dias días; tope de 400 días por consulta.
create or replace function piefirme_app.ctl_rango(p_org uuid, p_filtros jsonb, p_dias integer default 90, out v_desde date, out v_hasta date, out v_ini timestamptz, out v_fin timestamptz)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_hoy date := piefirme_app.ctl_hoy(p_org); v_tz text := piefirme_app.ctl_zona(p_org);
begin
  v_hasta := coalesce(nullif(p_filtros ->> 'hasta', '')::date, v_hoy);
  v_desde := coalesce(nullif(p_filtros ->> 'desde', '')::date, v_hasta - (p_dias - 1));
  if v_desde > v_hasta then raise exception 'La fecha inicial no puede ser posterior a la final.' using errcode = 'PF422'; end if;
  if v_hasta - v_desde > 400 then raise exception 'Una consulta abarca como máximo 400 días: acote el rango.' using errcode = 'PF422'; end if;
  v_ini := v_desde::timestamp at time zone v_tz;
  v_fin := (v_hasta + 1)::timestamp at time zone v_tz;
end $$;

-- Sucursales que el usuario puede ver, opcionalmente acotadas por el filtro («sucursal»: uuid o «sucursales»: [uuid]).
create or replace function piefirme_app.ctl_sedes_filtro(p_org uuid, p_filtros jsonb) returns uuid[]
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_pedidas uuid[];
begin
  if jsonb_typeof(p_filtros -> 'sucursales') = 'array' then
    select array_agg(x::uuid) into v_pedidas from jsonb_array_elements_text(p_filtros -> 'sucursales') x;
  elsif nullif(p_filtros ->> 'sucursal', '') is not null then
    v_pedidas := array[(p_filtros ->> 'sucursal')::uuid];
  end if;
  return coalesce((select array_agg(s.id) from piefirme.sedes s
                    where s.organizacion_id = p_org and piefirme_app.puede_sede(s.id) and (v_pedidas is null or cardinality(v_pedidas) = 0 or s.id = any (v_pedidas))), '{}'::uuid[]);
end $$;

-- Partidas con diferencia: la última captura vigente de cada producto (las correcciones son filas nuevas que referencian la anterior), sin el conteo inicial
-- (fija el saldo de arranque; no es una diferencia) y sin sesiones canceladas. Es la MISMA regla con la que el motor abre casos al cerrar la sesión.
create or replace function piefirme_app.ctl_dif_filas(p_org uuid, p_ini timestamptz, p_fin timestamptz)
returns table (partida_id uuid, sesion_id uuid, sucursal_id uuid, producto_id uuid, auditor_id uuid, escaneado_en timestamptz, tipo_sesion text,
               fisica numeric, saldo numeric, dif_piezas numeric, costo numeric, dif_valor numeric, nota text)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select p.id, p.sesion_id, p.sucursal_id, p.producto_id, p.creado_por, p.escaneado_en, s.tipo, p.cantidad_fisica, c.saldo_sistema, c.diferencia_piezas,
         c.costo_unitario, c.diferencia_valor, p.nota
    from piefirme.ctl_partida_conteo p
    join piefirme.ctl_partida_calculo c on c.partida_id = p.id
    join piefirme.ctl_sesion_conteo s on s.id = p.sesion_id
   where p.organizacion_id = p_org and p.escaneado_en >= p_ini and p.escaneado_en < p_fin
     and s.tipo <> 'conteo_inicial' and s.estado <> 'cancelada'
     and c.diferencia_piezas <> 0
     and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)
$$;

-- Última señal de vida de una sucursal en el módulo (captura, sesión, cierre o foto): base del tablero de salud.
create or replace function piefirme_app.ctl_ultima_actividad(p_org uuid, p_sucursal uuid) returns timestamptz
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select greatest(
    (select max(x.creado_en) from piefirme.ctl_partida_conteo x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal),
    (select max(x.creado_en) from piefirme.ctl_sesion_conteo x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal),
    (select max(x.creado_en) from piefirme.ctl_cierre_captura x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal),
    (select max(x.creado_en) from piefirme.ctl_cierre x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal),
    (select max(x.creado_en) from piefirme.ctl_evidencia x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal))
$$;

-- ¿Esta sucursal ya usa el módulo? (alguna sesión o cierre alguna vez). Las que nunca lo usaron no generan alertas de «sin conteo / sin cierre».
create or replace function piefirme_app.ctl_sucursal_usa_modulo(p_org uuid, p_sucursal uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.ctl_sesion_conteo x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal)
      or exists (select 1 from piefirme.ctl_cierre x where x.organizacion_id = p_org and x.sucursal_id = p_sucursal)
$$;

-- ───────────────────────────── privilegios: ninguna de estas utilerías la ejecuta la app ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme_app' and p.proname in ('ctl_trg_cajon_evento', 'ctl_zona', 'ctl_log_consulta', 'ctl_rango', 'ctl_sedes_filtro', 'ctl_dif_filas',
                                                               'ctl_ultima_actividad', 'ctl_sucursal_usa_modulo') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
