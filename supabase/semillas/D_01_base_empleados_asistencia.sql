-- D_01 · Semilla SINTÉTICA (dominio D): organización de ejemplo "Pie Clinic" con sus 5 sedes, 15 empleados, horarios, 3 meses de
-- checadas/asistencia (3-ago a 24-oct-2026; "hoy" = 25-oct-2026), vacaciones e incidencias.
-- Debe existir antes: migraciones 001 y 050-059 (y 010 para plantillas). NO hace falta que existan perfiles ni pacientes.
-- Idempotente: se puede correr dos veces. Todos los nombres, RFC y CLABE son ficticios.
-- organizacion_id fijo: 00000000-0000-0000-0000-00000000c0de

insert into piefirme.organizaciones (id, nombre, razon_social, rfc, regimen_fiscal, codigo_postal, plan, estado)
values ('00000000-0000-0000-0000-00000000c0de', 'Pie Clinic (sintético)', 'Pie Clinic SA de CV (sintético)', 'PCL000000AA0', '601', '56600', 'por_clinica', 'activa')
on conflict (id) do nothing;

-- 5 sedes de ejemplo (si otra semilla ya las creó con ese nombre, se respetan)
insert into piefirme.sedes (organizacion_id, clave, nombre, direccion, telefono)
select '00000000-0000-0000-0000-00000000c0de', v.clave, v.nombre, v.dir || ' (sintético)', '55 0000 000' || v.n
  from (values ('chalco', 'Pie Clinic Chalco', 'Av. Ejemplo 100, Chalco', 1), ('centenario', 'Pie Clinic Centenario', 'Calle Ejemplo 200, Centenario', 2),
               ('galerias', 'Pie Clinic Galerías', 'Plaza Ejemplo local 30, Galerías', 3), ('patio', 'Pie Clinic Patio', 'Plaza Ejemplo local 12, Patio', 4),
               ('sendero', 'Pie Clinic Sendero', 'Plaza Ejemplo local 8, Sendero', 5)) v(clave, nombre, dir, n)
 where not exists (select 1 from piefirme.sedes s where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
                      and (s.clave = v.clave or s.nombre ilike '%' || left(v.clave, 5) || '%'))
on conflict do nothing;

create or replace function pg_temp.sede(p text) returns uuid language sql as $$
  select id from piefirme.sedes
   where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and (clave = p or nombre ilike '%' || left(p, 5) || '%')
   order by (clave = p) desc limit 1
$$;

-- ───────────── empleados (15) ─────────────
insert into piefirme.empleados (organizacion_id, sede_id, numero_empleado, nombre, apellido_pat, apellido_mat, puesto, esquema_contratacion, fecha_ingreso,
                              rfc, curp, nss, email, telefono, banco, clabe, periodicidad_pago, salario_periodo, bono_periodo, cedula, notas)
select '00000000-0000-0000-0000-00000000c0de', pg_temp.sede(v.sede), v.num, v.nombre, v.ap1, v.ap2, v.puesto, v.contr, v.ingreso::date,
       'XXXX' || lpad(v.n::text, 6, '0') || 'AA0', 'XXXX' || lpad(v.n::text, 6, '0') || 'HDFXXX00', lpad((70000000000 + v.n)::text, 11, '0'),
       lower(v.nombre) || '.' || v.n || '@ejemplo.invalid', '55 1000 00' || lpad(v.n::text, 2, '0'), 'Banco Ejemplo', lpad((100000000000000000 + v.n)::text, 18, '0'),
       'quincenal', v.salario, case when v.puesto = 'recepcion' then 300 else 0 end,
       case when v.puesto = 'podologo' then 'CED-SINT-' || lpad(v.n::text, 4, '0') end, 'Dato sintético para pruebas'
  from (values
    (1,  'E001', 'Elena',   'Ruiz',    'Vega',   'podologo',  'nomina',      'chalco',     '2023-02-01', 9000),
    (2,  'E002', 'Marco',   'Mena',    'Rojas',  'podologo',  'honorarios',  'chalco',     '2024-05-15', 8500),
    (3,  'E003', 'Ana',     'López',   'Díaz',   'recepcion', 'nomina',      'chalco',     '2022-09-01', 5200),
    (4,  'E004', 'Julián',  'Cano',    'Soto',   'podologo',  'nomina',      'centenario', '2021-03-10', 9000),
    (5,  'E005', 'Sofía',   'Lara',    'Ortiz',  'podologo',  'honorarios',  'centenario', '2025-01-20', 8800),
    (6,  'E006', 'Lucía',   'Torres',  'Gil',    'recepcion', 'nomina',      'centenario', '2023-07-03', 5200),
    (7,  'E007', 'Paola',   'Herrera', 'Núñez',  'podologo',  'nomina',      'galerias',   '2022-01-17', 9200),
    (8,  'E008', 'Diego',   'Salas',   'Ríos',   'recepcion', 'nomina',      'galerias',   '2024-10-01', 5200),
    (9,  'E009', 'Karen',   'Montes',  'Lira',   'podologo',  'honorarios',  'patio',      '2025-06-02', 8700),
    (10, 'E010', 'Iván',    'Beltrán', 'Cruz',   'recepcion', 'nomina',      'patio',      '2023-11-13', 5200),
    (11, 'E011', 'Renata',  'Ibarra',  'Paz',    'podologo',  'nomina',      'sendero',    '2024-02-05', 9000),
    (12, 'E012', 'Tomás',   'Aguirre', 'Luna',   'recepcion', 'nomina',      'sendero',    '2025-03-17', 5200),
    (13, 'E013', 'Luis',    'Ortega',  'Mora',   'apoyo',     'nomina',      'chalco',     '2022-04-04', 4600),
    (14, 'E014', 'Marta',   'Gil',     'Rubio',  'apoyo',     'nomina',      'centenario', '2023-01-09', 4600),
    (15, 'E015', 'Lupita',  'Torres',  'Vega',   'apoyo',     'nomina',      'galerias',   '2024-08-19', 4600)
  ) v(n, num, nombre, ap1, ap2, puesto, contr, sede, ingreso, salario)
on conflict (organizacion_id, numero_empleado) do nothing;

-- ───────────── horarios: lunes a viernes 09:00-18:00, sábado 09:00-14:00 ─────────────
insert into piefirme.horarios_laborales (organizacion_id, sede_id, empleado_id, dia_semana, entrada, salida, descanso_min, vigente_desde)
select e.organizacion_id, e.sede_id, e.id, d, '09:00'::time, case when d = 6 then '14:00'::time else '18:00'::time end, case when d = 6 then 0 else 60 end, date '2026-01-01'
  from piefirme.empleados e, generate_series(1, 6) d
 where e.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
on conflict (empleado_id, dia_semana, vigente_desde) do nothing;

-- ───────────── checadas de 3 meses (se consolidan solas en asistencia por trigger) ─────────────
-- ~70 % puntual, ~20 % retardo leve, ~10 % retardo largo; ~3 % de faltas; origen = importación del checador.
with dias as (
  select e.id as emp, e.organizacion_id as org, e.sede_id as sede, d::date as fecha, abs(hashtext(e.id::text || d::date::text)) as h
    from piefirme.empleados e, generate_series(date '2026-08-03', date '2026-10-24', interval '1 day') d
   where e.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and extract(isodow from d) <= 6
), marcas as (
  select emp, org, sede, fecha,
         (fecha + time '09:00' + make_interval(mins => case when h % 100 < 70 then (h / 7) % 9 - 6 when h % 100 < 90 then 6 + (h / 7) % 7 else 15 + (h / 7) % 16 end)) as entrada,
         (fecha + case when extract(isodow from fecha) = 6 then time '14:00' else time '18:00' end + make_interval(mins => (h / 11) % 12)) as salida
    from dias where h % 100 >= 3
)
insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, operacion, fecha_hora, origen)
select org, sede, emp, 'entrada', entrada at time zone 'America/Mexico_City', 'importacion' from marcas
union all
select org, sede, emp, 'salida', salida at time zone 'America/Mexico_City', 'importacion' from marcas
on conflict (organizacion_id, empleado_id, fecha_hora, operacion) do nothing;

-- ───────────── vacaciones ─────────────
insert into piefirme.vacaciones_detalle (organizacion_id, sede_id, empleado_id, anio, fecha_inicio, fecha_fin, dias, estado, notas)
select e.organizacion_id, e.sede_id, e.id, 2026, v.ini::date, v.fin::date, v.dias, v.estado, 'Sintético'
  from (values ('E001', '2026-08-17', '2026-08-21', 5, 'tomada'), ('E007', '2026-09-14', '2026-09-18', 5, 'tomada'),
               ('E015', '2026-11-09', '2026-11-13', 5, 'autorizada'), ('E004', '2026-12-21', '2026-12-31', 7, 'solicitada'),
               ('E003', '2026-10-05', '2026-10-06', 2, 'tomada')) v(num, ini, fin, dias, estado)
  join piefirme.empleados e on e.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and e.numero_empleado = v.num
 where not exists (select 1 from piefirme.vacaciones_detalle x where x.empleado_id = e.id and x.fecha_inicio = v.ini::date);
-- el resto de los empleados recibe su renglón de derecho del año (12 días el primer año, +2 por año de servicio)
insert into piefirme.vacaciones_anio (organizacion_id, empleado_id, anio, dias_derecho)
select e.organizacion_id, e.id, 2026, piefirme.vacaciones_dias_ley(greatest(1, 2026 - extract(year from e.fecha_ingreso)::int), 12)
  from piefirme.empleados e where e.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
on conflict (empleado_id, anio) do nothing;

-- ───────────── incidencias ─────────────
insert into piefirme.incidencias_rh (organizacion_id, sede_id, empleado_id, tipo_id, fecha, fecha_fin, motivo)
select e.organizacion_id, e.sede_id, e.id, t.id, v.fecha::date, v.fecha::date, v.motivo
  from (values ('E010', '2026-10-14', 'permiso_sin_goce', 'Trámite personal'), ('E006', '2026-09-22', 'incapacidad', 'Incapacidad IMSS sintética'),
               ('E003', '2026-10-09', 'retardo', 'Tráfico'), ('E013', '2026-08-27', 'inasistencia', 'Falta sin aviso'),
               ('E012', '2026-10-02', 'permiso_con_goce', 'Cita médica')) v(num, fecha, tipo, motivo)
  join piefirme.empleados e on e.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and e.numero_empleado = v.num
  join piefirme.tipos_incidencia_rh t on t.organizacion_id = e.organizacion_id and t.clave = v.tipo
on conflict (empleado_id, fecha, tipo_id) do nothing;

-- ───────────── vacantes ─────────────
insert into piefirme.vacantes (organizacion_id, sede_id, puesto, titulo, descripcion, estado)
select '00000000-0000-0000-0000-00000000c0de', pg_temp.sede('sendero'), 'podologo', 'Podólogo(a) turno vespertino', 'Vacante sintética', 'abierta'
 where not exists (select 1 from piefirme.vacantes where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and titulo = 'Podólogo(a) turno vespertino');
insert into piefirme.candidatos (organizacion_id, vacante_id, nombre, email, etapa, notas)
select v.organizacion_id, v.id, c.nombre, c.email, c.etapa, 'Candidato sintético'
  from piefirme.vacantes v, (values ('Candidata Ejemplo Uno', 'cand1@ejemplo.invalid', 'entrevista'), ('Candidato Ejemplo Dos', 'cand2@ejemplo.invalid', 'recibido')) c(nombre, email, etapa)
 where v.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and v.titulo = 'Podólogo(a) turno vespertino'
   and not exists (select 1 from piefirme.candidatos x where x.vacante_id = v.id and x.nombre = c.nombre);
