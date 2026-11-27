-- 310 · Responsable de sucursal y cobertura de personal (asignación por día a otra sucursal).
-- Decisiones del dueño (nov-2026):
--  1) Cada sucursal tiene UN responsable: es un PODÓLOGO (sigue dando servicio) con opciones extra, SOLO en su sucursal
--     (ver personal del día, asistencia, ventas y caja de la sede). No es administrador: no ve sueldos, CLABE ni finanzas.
--  2) Los propietarios (administrador) asignan personal por día a otra sucursal (cobertura por ausencias). Esa asignación
--     reemplaza el acceso habitual de la persona ESE DÍA: solo puede operar (tickets, agenda, caja…) en la sucursal asignada.
--  3) Nadie está en dos sucursales el mismo día: una asignación por empleado y día (unique), una sola sede de checadas
--     por día y, para quien cubre, no puede generar tickets sin haber firmado su entrada en la sucursal asignada.
-- ADITIVA salvo dos reemplazos controlados: piefirme_app.puede_sede (misma firma; solo cambia para quien tiene cobertura hoy)
-- y la vista prp_empleados (se le agregan columnas al final). Depende de: 001, 050, 051, 064, 065, 073.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── responsable de sucursal ─────────────────────────────
alter table piefirme.sedes add column if not exists responsable_id uuid references piefirme.perfiles(id) on delete set null;
-- un responsable por sucursal y una sucursal por responsable
create unique index if not exists sedes_responsable_uidx on piefirme.sedes (responsable_id) where responsable_id is not null;

create or replace function piefirme_app.sedes_responsable_biu() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.perfiles%rowtype;
begin
  if new.responsable_id is null then return new; end if;
  select * into p from piefirme.perfiles where id = new.responsable_id;
  if not found or p.organizacion_id <> new.organizacion_id then raise exception 'el responsable debe ser un usuario de esta clínica' using errcode = 'PF403'; end if;
  if not p.activo then raise exception 'el responsable debe estar activo' using errcode = 'PF409'; end if;
  if p.rol::text <> 'podologo' then raise exception 'el responsable de sucursal es un podólogo' using errcode = 'PF409'; end if;
  -- si el podólogo tiene sedes limitadas, la de su responsabilidad debe estar entre ellas (vacío = todas)
  if cardinality(p.sedes) > 0 and not (new.id = any (p.sedes)) then
    update piefirme.perfiles set sedes = sedes || new.id where id = p.id;
  end if;
  return new;
end $$;
drop trigger if exists t_responsable on piefirme.sedes;
create trigger t_responsable before insert or update of responsable_id on piefirme.sedes for each row execute function piefirme_app.sedes_responsable_biu();

-- ¿el usuario es responsable de esta sucursal (o de alguna, si p_sede es null)? Solo cuenta mientras siga siendo podólogo activo.
create or replace function piefirme_app.es_responsable(p_sede uuid default null) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select exists (select 1 from piefirme.sedes s join piefirme.perfiles p on p.id = s.responsable_id
                  where s.responsable_id = auth.uid() and p.activo and p.rol::text = 'podologo' and s.activa
                    and (p_sede is null or s.id = p_sede))
$$;

-- Los propietarios fijan (o quitan, con null) al responsable de una sucursal.
create or replace function piefirme.asignar_responsable_sucursal(p_sede uuid, p_perfil uuid) returns piefirme.sedes
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s piefirme.sedes%rowtype; v_ant uuid;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'solo los propietarios asignan al responsable' using errcode = 'PF403'; end if;
  select * into s from piefirme.sedes where id = p_sede and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'sucursal inexistente' using errcode = 'PF404'; end if;
  v_ant := s.responsable_id;
  -- un podólogo solo puede responder de una sucursal: si ya lo era de otra, se le quita ahí
  if p_perfil is not null then update piefirme.sedes set responsable_id = null where responsable_id = p_perfil and id <> p_sede; end if;
  update piefirme.sedes set responsable_id = p_perfil where id = p_sede returning * into s;
  perform piefirme.registrar_bitacora('actualizar', 'sedes', p_sede::text, jsonb_build_object('responsable_anterior', v_ant, 'responsable_nuevo', p_perfil), p_sede);
  return s;
end $$;
revoke all on function piefirme.asignar_responsable_sucursal(uuid, uuid) from public, anon;
grant execute on function piefirme.asignar_responsable_sucursal(uuid, uuid) to authenticated;

-- ───────────────────────────── cobertura: asignación por día ─────────────────────────────
alter table piefirme.empleado_asignaciones add column if not exists motivo text;
alter table piefirme.empleado_asignaciones add column if not exists cubre_a uuid references piefirme.empleados(id) on delete set null;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'piefirme.empleado_asignaciones'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%origen%' loop
    execute format('alter table piefirme.empleado_asignaciones drop constraint %I', c);
  end loop;
  alter table piefirme.empleado_asignaciones add constraint empleado_asignaciones_origen_check
    check (origen in ('programada', 'autoelegida', 'gerente', 'checador', 'sistema', 'cobertura'));
end $$;
create index if not exists empleados_perfil_idx on piefirme.empleados (perfil_id) where perfil_id is not null;
create index if not exists empleado_asignaciones_cobertura_idx on piefirme.empleado_asignaciones (empleado_id, fecha) where origen = 'cobertura';

-- sede fija de HOY para la sesión por una cobertura asignada por los propietarios (null si no hay)
create or replace function piefirme_app.sede_cobertura_hoy() returns uuid
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select a.sede_id
    from piefirme.empleados e
    join piefirme.empleado_asignaciones a on a.empleado_id = e.id and a.origen = 'cobertura'
   where e.perfil_id = auth.uid()
     and a.fecha = (now() at time zone coalesce((select o.zona_horaria from piefirme.organizaciones o where o.id = e.organizacion_id), 'America/Mexico_City'))::date
   limit 1
$$;

-- puede_sede: con cobertura hoy, SOLO la sucursal asignada (el propietario nunca se restringe); sin cobertura, igual que siempre.
create or replace function piefirme_app.puede_sede(p_sede uuid) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select case when p.rol::text <> 'administrador' and c.sede is not null then p_sede = c.sede
                               else cardinality(p.sedes) = 0 or p_sede = any (p.sedes) end
                     from piefirme.perfiles p
                    cross join lateral (select piefirme_app.sede_cobertura_hoy() as sede) c
                    where p.id = auth.uid() and p.activo), false)
$$;

-- reglas de la asignación
create or replace function piefirme_app.cobertura_biud() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_hoy date; v_estado text; v_otra text;
begin
  if tg_op = 'DELETE' then
    -- una cobertura solo la quitan los propietarios, y no después de que la persona ya firmó ese día en esa sucursal
    if old.origen = 'cobertura' and auth.uid() is not null then
      if not piefirme_app.es_admin() then raise exception 'la cobertura la fijan los propietarios' using errcode = 'PF403'; end if;
      if exists (select 1 from piefirme.checadas c where c.empleado_id = old.empleado_id and c.fecha = old.fecha) then
        raise exception 'ya hay checadas de ese día: la cobertura no se puede quitar' using errcode = 'PF409';
      end if;
    end if;
    return old;
  end if;
  -- quien tiene cobertura no puede cambiarla ni «volver a elegir» sede por su cuenta
  if tg_op = 'UPDATE' and old.origen = 'cobertura' and auth.uid() is not null and not piefirme_app.es_admin() then
    raise exception 'tu sucursal de hoy la fijaron los propietarios' using errcode = 'PF403';
  end if;
  if new.origen = 'cobertura' then
    v_hoy := piefirme_app.hoy_org(new.organizacion_id);
    if tg_op = 'INSERT' or new.fecha is distinct from old.fecha or new.sede_id is distinct from old.sede_id or new.empleado_id is distinct from old.empleado_id then
      if new.fecha < v_hoy then raise exception 'no se asigna personal a una fecha pasada' using errcode = 'PF409'; end if;
      select estado into v_estado from piefirme.empleados where id = new.empleado_id;
      if v_estado is distinct from 'activo' then raise exception 'solo se asigna personal activo' using errcode = 'PF409'; end if;
      if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.activa) then raise exception 'la sucursal no está activa' using errcode = 'PF409'; end if;
      -- no puede estar en dos sucursales el mismo día: si ya firmó en otra, no se le reasigna
      select s.nombre into v_otra from piefirme.checadas c join piefirme.sedes s on s.id = c.sede_id
       where c.empleado_id = new.empleado_id and c.fecha = new.fecha and c.sede_id <> new.sede_id limit 1;
      if v_otra is not null then raise exception 'ese día ya firmó en % : no puede estar en dos sucursales', v_otra using errcode = 'PF409'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_cobertura on piefirme.empleado_asignaciones;
create trigger t_cobertura before insert or update or delete on piefirme.empleado_asignaciones for each row execute function piefirme_app.cobertura_biud();

-- Asignar personal a una sucursal por un día (propietarios). Reemplaza la sede elegida/programada de ese día.
create or replace function piefirme.asignar_personal_dia(p_empleado uuid, p_sede uuid, p_fecha date, p_motivo text default null, p_cubre_a uuid default null)
returns piefirme.empleado_asignaciones
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r piefirme.empleado_asignaciones;
begin
  if not piefirme_app.es_admin() then raise exception 'solo los propietarios asignan personal' using errcode = 'PF403'; end if;
  insert into piefirme.empleado_asignaciones (organizacion_id, empleado_id, sede_id, fecha, origen, motivo, cubre_a, registrado_por)
  values (piefirme_app.org_id(), p_empleado, p_sede, p_fecha, 'cobertura', nullif(btrim(p_motivo), ''), p_cubre_a, auth.uid())
  on conflict (empleado_id, fecha) do update
    set sede_id = excluded.sede_id, origen = 'cobertura', motivo = excluded.motivo, cubre_a = excluded.cubre_a, registrado_por = auth.uid()
  returning * into r;
  return r;
end $$;
revoke all on function piefirme.asignar_personal_dia(uuid, uuid, date, text, uuid) from public, anon;
grant execute on function piefirme.asignar_personal_dia(uuid, uuid, date, text, uuid) to authenticated;

-- Una sola sucursal de checadas por día (sin tocar lo ya cargado; vale para checadas nuevas)
create or replace function piefirme_app.checada_una_sede_biu() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_otra text; v_cob uuid;
begin
  if new.empleado_id is null then return new; end if;
  select s.nombre into v_otra from piefirme.checadas c join piefirme.sedes s on s.id = c.sede_id
   where c.empleado_id = new.empleado_id and c.fecha = new.fecha and c.sede_id <> new.sede_id limit 1;
  if v_otra is not null then raise exception 'ya firmó hoy en % : no puede estar en dos sucursales el mismo día', v_otra using errcode = 'PF409'; end if;
  select a.sede_id into v_cob from piefirme.empleado_asignaciones a where a.empleado_id = new.empleado_id and a.fecha = new.fecha and a.origen = 'cobertura';
  if v_cob is not null and v_cob <> new.sede_id then raise exception 'ese día tiene asignada otra sucursal por los propietarios' using errcode = 'PF409'; end if;
  return new;
end $$;
drop trigger if exists t_zz_una_sede on piefirme.checadas;
create trigger t_zz_una_sede before insert on piefirme.checadas for each row execute function piefirme_app.checada_una_sede_biu();

-- Tickets de quien cubre: solo en la sucursal asignada y solo si ya firmó su entrada ahí ese día
create or replace function piefirme_app.venta_cobertura_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_sede uuid; v_emp uuid; v_hoy date; v_nom text;
begin
  if auth.uid() is null or piefirme_app.es_admin() then return new; end if;
  select a.sede_id, e.id, a.fecha into v_sede, v_emp, v_hoy
    from piefirme.empleados e join piefirme.empleado_asignaciones a on a.empleado_id = e.id and a.origen = 'cobertura'
   where e.perfil_id = auth.uid() and a.fecha = piefirme_app.hoy_org(e.organizacion_id) limit 1;
  if v_sede is null then return new; end if;
  select nombre into v_nom from piefirme.sedes where id = v_sede;
  if new.sede_id <> v_sede then raise exception 'hoy tu asignación es en %: solo puedes generar tickets ahí', v_nom using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.checadas c where c.empleado_id = v_emp and c.fecha = v_hoy and c.sede_id = v_sede and c.operacion = 'entrada') then
    raise exception 'firma tu entrada en % antes de generar tickets', v_nom using errcode = 'PF409';
  end if;
  return new;
end $$;
drop trigger if exists t_venta_cobertura on piefirme.ventas;
create trigger t_venta_cobertura before insert on piefirme.ventas for each row execute function piefirme_app.venta_cobertura_bi();

-- ───────────────────────────── lo que ve el responsable (solo SELECT, solo su sucursal) ─────────────────────────────
do $$
declare t text;
  tablas text[] := array['ventas', 'pagos', 'turnos_caja', 'movimientos_caja', 'cortes_caja', 'devoluciones_venta', 'inventario_sede',
    'conteos_fisicos', 'citas', 'checadas', 'asistencia', 'incidencias_rh', 'empleado_asignaciones'];
begin
  foreach t in array tablas loop
    if exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = t and column_name = 'sede_id')
       and exists (select 1 from information_schema.columns where table_schema = 'piefirme' and table_name = t and column_name = 'organizacion_id') then
      execute format('drop policy if exists %I on piefirme.%I', t || '_sel_responsable', t);
      execute format('create policy %I on piefirme.%I for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_responsable(sede_id) and piefirme_app.puede_sede(sede_id))',
                     t || '_sel_responsable', t);
    else
      raise notice '310: % no tiene sede_id u organizacion_id; el responsable no la lee todavía', t;
    end if;
  end loop;
end $$;

-- Personal de MI sucursal para el responsable: sin sueldos, CLABE ni datos fiscales.
create or replace function piefirme.personal_de_mi_sucursal()
returns table (empleado_id uuid, nombre_completo text, foto_path text, cargo text, puesto text, estado text, telefono text,
               sede_base_id uuid, sede_base_nombre text, sede_hoy_id uuid, sede_hoy_nombre text, sentido text, motivo text, entrada_hoy timestamptz, salida_hoy timestamptz)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  with mi as (select s.id from piefirme.sedes s where s.responsable_id = auth.uid() and piefirme_app.es_responsable(s.id) limit 1),
       hoy as (select piefirme_app.hoy() as d)
  select e.id, trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)), e.foto_path,
         coalesce(e.cargo, case e.puesto when 'podologo' then 'podologo' when 'recepcion' then 'recepcion' when 'administrador' then 'admin' else 'asistente' end),
         e.puesto, e.estado, e.telefono, e.sede_id, sb.nombre, coalesce(a.sede_id, e.sede_id), sh.nombre,
         case when coalesce(a.sede_id, e.sede_id) = (select id from mi) and e.sede_id <> (select id from mi) then 'llega'
              when coalesce(a.sede_id, e.sede_id) <> (select id from mi) then 'sale' else 'base' end,
         a.motivo,
         (select min(c.fecha_hora) from piefirme.checadas c where c.empleado_id = e.id and c.fecha = (select d from hoy) and c.operacion = 'entrada'),
         (select max(c.fecha_hora) from piefirme.checadas c where c.empleado_id = e.id and c.fecha = (select d from hoy) and c.operacion = 'salida')
    from piefirme.empleados e
    join piefirme.sedes sb on sb.id = e.sede_id
    left join piefirme.empleado_asignaciones a on a.empleado_id = e.id and a.fecha = (select d from hoy)
    left join piefirme.sedes sh on sh.id = coalesce(a.sede_id, e.sede_id)
   where e.organizacion_id = piefirme_app.org_id() and e.estado = 'activo' and (select id from mi) is not null
     and ((select id from mi) in (e.sede_id, coalesce(a.sede_id, e.sede_id)) or (select id from mi) = any (e.sedes))
$$;
revoke all on function piefirme.personal_de_mi_sucursal() from public, anon;
grant execute on function piefirme.personal_de_mi_sucursal() to authenticated;

-- ¿qué soy hoy? responsable de, cobertura de hoy (para el menú y el aviso de la app)
create or replace function piefirme.mi_contexto_sucursal() returns jsonb
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select jsonb_build_object(
    'responsable_de', (select s.id from piefirme.sedes s where s.responsable_id = auth.uid() and piefirme_app.es_responsable(s.id) limit 1),
    'cobertura_sede', piefirme_app.sede_cobertura_hoy(),
    'cobertura_motivo', (select a.motivo from piefirme.empleado_asignaciones a join piefirme.empleados e on e.id = a.empleado_id
                          where e.perfil_id = auth.uid() and a.origen = 'cobertura' and a.fecha = piefirme_app.hoy() limit 1))
$$;
revoke all on function piefirme.mi_contexto_sucursal() from public, anon;
grant execute on function piefirme.mi_contexto_sucursal() to authenticated;

-- ───────────────────────────── vistas ─────────────────────────────
-- prp_empleados: se agregan al final foto y cargo (el catálogo de personal muestra foto)
create or replace view piefirme.prp_empleados with (security_invoker = true) as
select e.id, e.organizacion_id, e.sede_id, s.nombre as sede_nombre, e.sedes, e.perfil_id, e.numero_empleado,
       trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo,
       e.nombre, e.apellido_pat, e.apellido_mat, e.puesto, e.esquema_contratacion, e.estado,
       e.fecha_ingreso, e.fecha_baja, e.motivo_baja, e.rfc, e.curp, e.nss, e.fecha_nacimiento, e.email, e.telefono, e.telefono_fijo,
       e.domicilio, e.contacto_emergencia, e.estado_civil, e.escolaridad, e.nacionalidad, e.lugar_nacimiento,
       e.banco, e.clabe, e.periodicidad_pago, e.salario_periodo, e.bono_periodo, e.tipo_jornada, e.supervisor, e.centro_trabajo,
       e.cedula, e.notas,
       (e.perfil_id is not null) as tiene_sesion,
       case when e.fecha_ingreso is null then null else date_part('year', age(current_date, e.fecha_ingreso))::int end as antiguedad_anios,
       e.created_at, e.updated_at,
       e.foto_path, e.cargo, (select sr.id from piefirme.sedes sr where sr.responsable_id = e.perfil_id and e.perfil_id is not null limit 1) as responsable_de_sede_id
  from piefirme.empleados e
  join piefirme.sedes s on s.id = e.sede_id;

-- asignaciones de personal con nombres (para el módulo de los propietarios)
create or replace view piefirme.prp_asignaciones_personal with (security_invoker = true) as
select a.id, a.organizacion_id, a.empleado_id, a.sede_id, s.nombre as sede_nombre, a.fecha, a.origen, a.motivo, a.cubre_a,
       trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo, e.foto_path, e.puesto,
       e.sede_id as sede_base_id, sb.nombre as sede_base_nombre,
       trim(concat_ws(' ', c.nombre, c.apellido_pat, c.apellido_mat)) as cubre_a_nombre,
       exists (select 1 from piefirme.checadas k where k.empleado_id = a.empleado_id and k.fecha = a.fecha and k.sede_id = a.sede_id and k.operacion = 'entrada') as firmo_entrada,
       a.registrado_por, a.created_at
  from piefirme.empleado_asignaciones a
  join piefirme.sedes s on s.id = a.sede_id
  join piefirme.empleados e on e.id = a.empleado_id
  join piefirme.sedes sb on sb.id = e.sede_id
  left join piefirme.empleados c on c.id = a.cubre_a;

grant select on piefirme.prp_empleados, piefirme.prp_asignaciones_personal to authenticated;

-- opciones de menú nuevas en el catálogo de liberación por rol (074); sin esto una clínica con liberación estricta no las vería
insert into piefirme.catalogo_funciones (clave, nombre, grupo, roles) values
  ('/rh/asignacion', 'Asignación de personal', 'EQUIPO', array['administrador']::text[]),
  ('/mi-sucursal', 'Mi sucursal (responsable)', 'EQUIPO', array['podologo']::text[])
on conflict (clave) do nothing;
notify pgrst, 'reload schema';
