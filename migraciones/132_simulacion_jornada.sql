-- 132 · Simulador de jornada: inyecta la operación de un día, por olas, en todas las sucursales.
-- Para qué: que los dueños y el supervisor vean cómo se van concentrando los tickets de las sucursales en los resúmenes
-- («a las 11:00 llevan tantos, a las 14:00 se acumulan otros…»). Cada ola crea tickets REALES (venta + líneas + pago + turno de caja)
-- con las mismas reglas del cobro, fechados a la hora de la ola. No hay un camino paralelo: los tableros leen las mismas tablas.
-- Seguridad: solo administración; solo en una clínica marcada parametros.es_prueba; los tickets llevan nota 'SIM-JORNADA' y
-- se pueden borrar con reiniciar_jornada(). Nunca toca tickets reales.
-- Se aplica a las dos instancias (piefirme y pieclinic; la segunda se genera con scripts/clonar-esquema.mjs).

-- ── Bitácora de lo inyectado ──
create table if not exists piefirme.simulacion_jornada (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  dia              date not null,
  ola              integer not null check (ola between 1 and 9),      -- 1..4 olas de operación · 9 = cierre de cajas
  hora             time not null,
  sede_id          uuid references piefirme.sedes(id) on delete cascade,
  tickets          integer not null default 0,
  ventas           numeric(14,2) not null default 0,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists simulacion_jornada_dia on piefirme.simulacion_jornada (organizacion_id, dia, ola);
alter table piefirme.simulacion_jornada enable row level security;
drop policy if exists simjor_sel on piefirme.simulacion_jornada;
create policy simjor_sel on piefirme.simulacion_jornada for select to authenticated
  using (organizacion_id = piefirme_app.org_id()
         and (piefirme_app.es_admin() or (piefirme_app.es_supervisor() and (sede_id is null or piefirme_app.puede_sede(sede_id)))));
revoke all on piefirme.simulacion_jornada from anon;
revoke insert, update, delete, truncate on piefirme.simulacion_jornada from authenticated;

-- ── Las cuatro olas del día (desde → hasta: el tramo de reloj que cubren los tickets de la ola) ──
create or replace function piefirme_app.jornada_olas() returns table (ola integer, desde time, hasta time, peso numeric)
language sql immutable as $$
  select * from (values (1, time '09:00', time '11:00', 0.25), (2, time '11:00', time '14:00', 0.30),
                        (3, time '14:00', time '17:00', 0.30), (4, time '17:00', time '19:00', 0.15)) v(ola, desde, hasta, peso)
$$;

-- ── Ritmo por omisión: tickets por sucursal y ola (la pantalla lo deja editar antes de inyectar) ──
create or replace function piefirme.jornada_plan() returns table (sede_id uuid, clave text, nombre text, ola integer, hora time, tickets integer)
language sql stable security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select s.id, s.clave, s.nombre, w.ola, w.hasta,
         greatest(1, round((14 + abs(hashtext(s.clave)) % 22) * w.peso)::integer)
    from piefirme.sedes s cross join piefirme_app.jornada_olas() w
   where s.organizacion_id = piefirme_app.org_id() and s.activa
   order by s.nombre, w.ola
$$;

-- ── Candados comunes: administración + clínica de prueba ──
create or replace function piefirme_app.jornada_exigir() returns uuid
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o uuid := piefirme_app.org_id();
begin
  if o is null or auth.uid() is null or not piefirme_app.es_admin() then raise exception 'el simulador de jornada es solo de administración' using errcode = 'PF403'; end if;
  if coalesce((select (parametros ->> 'es_prueba')::boolean from piefirme.organizaciones where id = o), false) is not true then
    raise exception 'el simulador solo corre en una clínica marcada como de prueba (parametros.es_prueba)' using errcode = 'PF403';
  end if;
  return o;
end $$;

-- ── Inyecta una ola ──
-- p_tickets: {"<sede_id>": n, …}; sin él se usa jornada_plan(). Devuelve {ola, hora, tickets, ventas, sedes:[{sede, tickets, ventas}]}.
create or replace function piefirme.simular_ola(p_dia date, p_ola integer, p_tickets jsonb default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  o uuid := piefirme_app.jornada_exigir(); uid uuid := auth.uid(); tz text := piefirme_app.zona_org(o);
  w record; s record; i integer; n integer; v_turno uuid; v_venta uuid; v_ts timestamptz; v_tot numeric; v_metodo text; h integer;
  v_serv uuid[]; v_prod uuid[]; v_pac uuid[]; v_pod uuid[]; v_sedes jsonb := '[]'::jsonb; v_tk integer := 0; v_mt numeric := 0; v_tks integer; v_mts numeric;
begin
  if p_dia is null then raise exception 'indica el día' using errcode = 'PF400'; end if;
  select * into w from piefirme_app.jornada_olas() x where x.ola = p_ola;
  if not found then raise exception 'la ola debe ser de 1 a 4' using errcode = 'PF400'; end if;
  if exists (select 1 from piefirme.simulacion_jornada where organizacion_id = o and dia = p_dia and ola = p_ola) then
    raise exception 'la ola % del % ya se inyectó: reinicia el día para repetirla', p_ola, p_dia using errcode = 'PF409';
  end if;
  if p_ola > 1 and not exists (select 1 from piefirme.simulacion_jornada where organizacion_id = o and dia = p_dia and ola = p_ola - 1) then
    raise exception 'inyecta primero la ola %', p_ola - 1 using errcode = 'PF409';
  end if;

  select coalesce(array_agg(id order by codigo), '{}') into v_serv from piefirme.servicios
   where organizacion_id = o and tipo_precio = 'fijo' and codigo like 'SV-%';
  select coalesce(array_agg(id order by sku), '{}') into v_prod from piefirme.productos where organizacion_id = o and tipo = 'venta';
  select coalesce(array_agg(id order by id), '{}') into v_pac from (select id from piefirme.pacientes where organizacion_id = o order by id limit 200) q;

  for s in select se.id, se.clave from piefirme.sedes se where se.organizacion_id = o and se.activa order by se.clave loop
    n := case when p_tickets is not null then coalesce((p_tickets ->> s.id::text)::integer, 0)
              else coalesce((select tickets from piefirme.jornada_plan() p where p.sede_id = s.id and p.ola = p_ola), 0) end;
    if n < 0 or n > 300 then raise exception 'tickets por sucursal y ola: de 0 a 300' using errcode = 'PF400'; end if;
    if n = 0 then continue; end if;

    -- turno de la caja de la sede: el abierto del administrador (si ya tiene uno) o uno nuevo que abre a las 08:30
    select id into v_turno from piefirme.turnos_caja where sede_id = s.id and cajero_id = uid and estado = 'abierto';
    if v_turno is null then
      insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial)
      values (o, s.id, 'Caja 1', 'Simulación', uid, (p_dia + time '08:30') at time zone tz, 1500) returning id into v_turno;
    end if;
    select coalesce(array_agg(id), '{}') into v_pod from piefirme.perfiles
     where organizacion_id = o and rol = 'podologo' and activo and (sedes = '{}' or s.id = any (sedes));

    v_tks := 0; v_mts := 0;
    for i in 1..n loop
      h := abs(hashtext(p_dia::text || s.clave || p_ola || '/' || i));
      v_ts := (p_dia + w.desde + make_interval(secs => ((extract(epoch from (w.hasta - w.desde)) * (i - 0.5)) / n)::int)) at time zone tz;
      insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id, podologo_id, nota, created_at)
      values (o, s.id, 'mostrador',
              case when h % 10 < 7 and cardinality(v_pac) > 0 then v_pac[1 + h % cardinality(v_pac)] end,
              case when h % 10 < 7 and cardinality(v_pod) > 0 then v_pod[1 + (h / 7) % cardinality(v_pod)] end,
              'SIM-JORNADA', v_ts)
      returning id into v_venta;
      if h % 10 < 7 and cardinality(v_serv) > 0 then            -- 7 de cada 10 tickets son un servicio…
        insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, servicio_id, cantidad)
        values (o, v_venta, 'servicio', v_serv[1 + (h / 3) % cardinality(v_serv)], 1);
      elsif cardinality(v_prod) > 0 then                         -- …y 3 de cada 10, producto de mostrador
        insert into piefirme.venta_lineas (organizacion_id, venta_id, tipo, producto_id, cantidad)
        values (o, v_venta, 'producto', v_prod[1 + (h / 5) % cardinality(v_prod)], 1 + h % 2);
      else
        delete from piefirme.ventas where id = v_venta; continue;
      end if;
      select total into v_tot from piefirme.ventas where id = v_venta;
      if coalesce(v_tot, 0) <= 0 then       -- sin precio vigente: no es un ticket cobrable
        delete from piefirme.venta_lineas where venta_id = v_venta; delete from piefirme.ventas where id = v_venta; continue;
      end if;
      v_metodo := (array['efectivo', 'tarjeta', 'clip', 'transferencia', 'efectivo'])[1 + (h / 11) % 5];
      insert into piefirme.pagos (organizacion_id, venta_id, metodo, monto, referencia, efectivo_recibido, ultimos4, created_at)
      values (o, v_venta, v_metodo, v_tot,
              case when v_metodo = 'efectivo' then null else 'SIM-' || substr(v_venta::text, 1, 6) end,
              case when v_metodo = 'efectivo' then ceil(v_tot / 10) * 10 end,
              case when v_metodo in ('tarjeta', 'clip') then lpad((h % 10000)::text, 4, '0') end, v_ts);
      update piefirme.ventas set estado = 'cobrada', turno_id = v_turno, cajero_id = uid, cobrada_en = v_ts where id = v_venta;
      v_tks := v_tks + 1; v_mts := v_mts + v_tot;
    end loop;

    insert into piefirme.simulacion_jornada (organizacion_id, dia, ola, hora, sede_id, tickets, ventas) values (o, p_dia, p_ola, w.hasta, s.id, v_tks, v_mts);
    v_sedes := v_sedes || jsonb_build_object('sede', s.clave, 'tickets', v_tks, 'ventas', v_mts);
    v_tk := v_tk + v_tks; v_mt := v_mt + v_mts;
  end loop;
  -- la ola queda registrada aunque ninguna sede haya recibido tickets (marca de avance)
  if not exists (select 1 from piefirme.simulacion_jornada where organizacion_id = o and dia = p_dia and ola = p_ola) then
    insert into piefirme.simulacion_jornada (organizacion_id, dia, ola, hora, tickets, ventas) values (o, p_dia, p_ola, w.hasta, 0, 0);
  end if;
  return jsonb_build_object('ola', p_ola, 'hora', w.hasta, 'tickets', v_tk, 'ventas', v_mt, 'sedes', v_sedes);
end $$;

-- ── Cierra las cajas del día: corte por sucursal (como lo haría el cajero) y revisión del administrador ──
create or replace function piefirme.cerrar_jornada(p_dia date) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o uuid := piefirme_app.jornada_exigir(); uid uuid := auth.uid(); tz text := piefirme_app.zona_org(o); t record; v_ef numeric; v_n integer := 0; v_cerrados uuid[] := '{}';
begin
  if not exists (select 1 from piefirme.simulacion_jornada where organizacion_id = o and dia = p_dia and ola = 4) then
    raise exception 'inyecta las cuatro olas antes de cerrar las cajas' using errcode = 'PF409';
  end if;
  if exists (select 1 from piefirme.simulacion_jornada where organizacion_id = o and dia = p_dia and ola = 9) then
    raise exception 'las cajas de ese día ya se cerraron' using errcode = 'PF409';
  end if;
  for t in select tc.id, tc.sede_id, tc.fondo_inicial from piefirme.turnos_caja tc
            where tc.organizacion_id = o and tc.cajero_id = uid and tc.estado = 'abierto' and tc.nombre_turno = 'Simulación'
              and (tc.apertura_en at time zone tz)::date = p_dia loop
    select coalesce(sum(p.monto), 0) into v_ef from piefirme.pagos p join piefirme.ventas v on v.id = p.venta_id where v.turno_id = t.id and p.metodo = 'efectivo';
    perform piefirme.cerrar_turno(t.id, t.fondo_inicial + v_ef, null);
    perform piefirme.revisar_turno(t.id);
    insert into piefirme.simulacion_jornada (organizacion_id, dia, ola, hora, sede_id, tickets, ventas)
    select o, p_dia, 9, time '19:30', t.sede_id, count(*), coalesce(sum(v.total), 0) from piefirme.ventas v where v.turno_id = t.id;
    v_cerrados := v_cerrados || t.id;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then   -- hora de cierre coherente con el día simulado (un turno cerrado es de solo lectura: se corrige con el cursor ya cerrado)
    alter table piefirme.turnos_caja disable trigger user;
    update piefirme.turnos_caja set cierre_en = (p_dia + time '19:30') at time zone tz where id = any (v_cerrados);
    alter table piefirme.turnos_caja enable trigger user;
    update piefirme.cortes_caja set created_at = (p_dia + time '19:30') at time zone tz where turno_id = any (v_cerrados);
  end if;
  if v_n = 0 then
    insert into piefirme.simulacion_jornada (organizacion_id, dia, ola, hora, tickets, ventas) values (o, p_dia, 9, time '19:30', 0, 0);
  end if;
  return jsonb_build_object('dia', p_dia, 'cajas_cerradas', v_n);
end $$;

-- ── Reinicia el día: borra SOLO los tickets marcados SIM-JORNADA de ese día, con sus pagos, ingresos, kardex y turnos de simulación ──
create or replace function piefirme.reiniciar_jornada(p_dia date) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare o uuid := piefirme_app.jornada_exigir(); tz text := piefirme_app.zona_org(o); v_ids uuid[]; v_turnos uuid[]; v_n integer;
begin
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(distinct turno_id) filter (where turno_id is not null), '{}') into v_ids, v_turnos
    from piefirme.ventas where organizacion_id = o and nota = 'SIM-JORNADA' and (created_at at time zone tz)::date = p_dia;
  v_n := cardinality(v_ids);
  if v_n > 0 then
    alter table piefirme.pagos disable trigger user;  alter table piefirme.venta_lineas disable trigger user;  alter table piefirme.ventas disable trigger user;
    alter table piefirme.ingresos disable trigger user;  alter table piefirme.turnos_caja disable trigger user;
    alter table piefirme.movimientos_inventario disable trigger user;  alter table piefirme.cortes_caja disable trigger user;
    delete from piefirme.ingreso_renglones where ingreso_id in (select id from piefirme.ingresos where venta_id = any (v_ids));
    delete from piefirme.ingresos where venta_id = any (v_ids);
    delete from piefirme.movimientos_inventario where referencia_tipo = 'venta' and referencia_id = any (v_ids);
    delete from piefirme.pagos where venta_id = any (v_ids);
    delete from piefirme.venta_lineas where venta_id = any (v_ids);
    delete from piefirme.ventas where id = any (v_ids);
    delete from piefirme.cortes_caja where turno_id = any (v_turnos) and not exists (select 1 from piefirme.ventas v where v.turno_id = cortes_caja.turno_id);
    delete from piefirme.turnos_caja where id = any (v_turnos) and nombre_turno = 'Simulación' and not exists (select 1 from piefirme.ventas v where v.turno_id = turnos_caja.id);
    alter table piefirme.cortes_caja enable trigger user;  alter table piefirme.movimientos_inventario enable trigger user;
    alter table piefirme.turnos_caja enable trigger user;  alter table piefirme.ingresos enable trigger user;
    alter table piefirme.ventas enable trigger user;  alter table piefirme.venta_lineas enable trigger user;  alter table piefirme.pagos enable trigger user;
  end if;
  delete from piefirme.simulacion_jornada where organizacion_id = o and dia = p_dia;
  return jsonb_build_object('dia', p_dia, 'tickets_borrados', v_n);
end $$;

-- ── Resumen en vivo del día: sucursal × hora (lo leen la pantalla «Operación del día» y los tableros) ──
-- Cuenta tickets cobrados de TODA la operación (reales y simulados): para el dueño no hay diferencia.
create or replace view piefirme.prp_operacion_hora with (security_invoker = true) as
select v.organizacion_id, v.sede_id, se.clave as sede_clave, se.nombre as sede_nombre,
       (v.cobrada_en at time zone piefirme_app.zona_org(v.organizacion_id))::date as dia,
       extract(hour from (v.cobrada_en at time zone piefirme_app.zona_org(v.organizacion_id)))::integer as hora,
       count(*) as tickets, sum(v.total) as ventas,
       count(*) filter (where exists (select 1 from piefirme.venta_lineas l where l.venta_id = v.id and l.tipo = 'servicio')) as tickets_servicio,
       coalesce(sum((select sum(l.cantidad) from piefirme.venta_lineas l where l.venta_id = v.id and l.tipo = 'servicio')), 0) as servicios,
       coalesce(sum((select sum(l.cantidad) from piefirme.venta_lineas l where l.venta_id = v.id and l.tipo = 'producto')), 0) as productos
  from piefirme.ventas v join piefirme.sedes se on se.id = v.sede_id
 where v.estado in ('cobrada', 'por_facturar', 'facturada')
   and (piefirme_app.es_admin() or piefirme_app.es_supervisor())      -- consolidado solo para dueños y supervisión (el supervisor, solo sus sedes por RLS)
 group by v.organizacion_id, v.sede_id, se.clave, se.nombre, 5, 6;

-- ── Permisos ──
revoke all on function piefirme.simular_ola(date, integer, jsonb), piefirme.cerrar_jornada(date), piefirme.reiniciar_jornada(date), piefirme.jornada_plan() from public, anon;
grant execute on function piefirme.simular_ola(date, integer, jsonb), piefirme.cerrar_jornada(date), piefirme.reiniciar_jornada(date), piefirme.jornada_plan() to authenticated;
revoke all on function piefirme_app.jornada_exigir(), piefirme_app.jornada_olas() from public, anon;
grant execute on function piefirme_app.jornada_exigir(), piefirme_app.jornada_olas() to authenticated;
grant select on piefirme.simulacion_jornada, piefirme.prp_operacion_hora to authenticated;
