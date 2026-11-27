-- 311 · Rotación de personal por sucursal (calendario por sucursal y por persona).
-- Decisión del dueño (nov-2026): ver en un calendario mensual DÓNDE estuvo cada persona cada día y QUIÉNES estuvieron en cada
-- sucursal (a veces una persona, a veces dos o tres), saltando de un mes a otro, en formato calendario o listado, y la rotación
-- de cada persona dentro de su expediente.
-- La fuente de verdad ya existía: empleado_asignaciones (día concreto: cobertura / autoelegida / programada) y horarios_laborales
-- (patrón semanal por sede: «martes y jueves aquí, el resto allá»). Esta migración NO crea tablas: agrega una vista que resuelve,
-- para cada empleado y día, dónde le tocaba estar, y la compara con dónde firmó realmente (checadas).
-- Precedencia de «dónde le tocaba»: 1) asignación del día; 2) horario laboral vigente de ese día de la semana;
--   3) sede de contrato, solo si la persona no tiene ningún horario vigente ese día; 4) si tiene horario pero no ese día: descanso.
-- ADITIVA: solo una vista nueva. Depende de: 050, 051, 064, 310.
set search_path = piefirme, piefirme_app, extensions;

create or replace view piefirme.prp_rotacion_personal with (security_invoker = true) as
with dias as (
  select e.id as empleado_id, d::date as fecha
    from piefirme.empleados e
    cross join lateral generate_series(
      coalesce(e.fecha_ingreso, e.created_at::date),
      least(coalesce(e.fecha_baja, current_date + 90), current_date + 90),
      interval '1 day') d
)
select e.organizacion_id, e.id as empleado_id,
       trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo,
       e.foto_path, e.puesto, e.sede_id as sede_base_id, sb.nombre as sede_base_nombre,
       d.fecha,
       x.sede_id, s.nombre as sede_nombre,
       case when a.id is not null then a.origen
            when h.id is not null then 'horario'
            when x.sede_id is not null then 'base'
            else 'descanso' end as fuente,
       a.motivo,
       ch.sede_id as sede_checada_id, sc.nombre as sede_checada_nombre,
       (ch.sede_id is not null and x.sede_id is not null and ch.sede_id <> x.sede_id) as checo_en_otra
  from dias d
  join piefirme.empleados e on e.id = d.empleado_id
  join piefirme.sedes sb on sb.id = e.sede_id
  left join piefirme.empleado_asignaciones a on a.empleado_id = e.id and a.fecha = d.fecha
  left join lateral (
    select h1.id, h1.sede_id
      from piefirme.horarios_laborales h1
     where h1.empleado_id = e.id and h1.activo and h1.dia_semana = extract(isodow from d.fecha)::int
       and h1.vigente_desde <= d.fecha and (h1.vigente_hasta is null or h1.vigente_hasta >= d.fecha)
     order by h1.vigente_desde desc limit 1) h on true
  left join lateral (
    select exists (select 1 from piefirme.horarios_laborales h2
                    where h2.empleado_id = e.id and h2.activo
                      and h2.vigente_desde <= d.fecha and (h2.vigente_hasta is null or h2.vigente_hasta >= d.fecha)) as tiene
  ) th on true
  cross join lateral (
    select case when a.id is not null then a.sede_id
                when h.id is not null then h.sede_id
                when not th.tiene then e.sede_id
                else null end as sede_id) x
  left join piefirme.sedes s on s.id = x.sede_id
  left join lateral (
    select k.sede_id from piefirme.checadas k
     where k.empleado_id = e.id and k.fecha = d.fecha order by k.fecha_hora limit 1) ch on true
  left join piefirme.sedes sc on sc.id = ch.sede_id;

grant select on piefirme.prp_rotacion_personal to authenticated;

-- opción de menú en el catálogo de liberación por rol (074)
insert into piefirme.catalogo_funciones (clave, nombre, grupo, roles) values
  ('/rh/rotacion', 'Rotación de personal', 'EQUIPO', array['administrador']::text[])
on conflict (clave) do nothing;

notify pgrst, 'reload schema';
