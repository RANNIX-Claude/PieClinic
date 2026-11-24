-- G_01 · Semilla SINTÉTICA V2: sedes 6 y 7, cargos de las cuentas de prueba, empleados faltantes (53), vínculo empleado↔perfil,
-- asignaciones «trabajando en» de 2 semanas (hoy ± 7 días) y movimientos de personal.
-- Requiere: migraciones 001-072 y la semilla D_01 (organización y 15 empleados). Los perfiles de prueba (a@g.com, p@g.com…) los crea scripts/qa-usuarios-prueba.mjs;
--   si alguno no existe, el vínculo con su empleado simplemente no se hace.
-- Idempotente (se puede correr dos veces) · todo es ficticio (nombres, RFC, CLABE, correos @ejemplo.invalid) · marca: empleados.notas like 'G_01:%'.
-- Correspondencia con la app «podologia»:  S1 Centro=CHA(Chalco) S2 Norte=CEN(Centenario) S3 Sur=GAL(Galerías) S4 Oriente=PAT(Patio) S5 Poniente=SEN(Sendero)
--   S6 Polanco=POL(nueva) S7 Coyoacán=COY(nueva).
do $$
declare o constant uuid := '00000000-0000-0000-0000-00000000c0de';
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  if not exists (select 1 from piefirme.organizaciones where id = o) then raise notice 'G_01: falta la organización (corre D_01)'; return; end if;

  -- ───────────── sedes 6 y 7 (ids continuos con los de las cinco existentes) ─────────────
  insert into piefirme.sedes (id, organizacion_id, clave, nombre, direccion, telefono)
  select v.id::uuid, o, v.clave, v.nombre, v.dir || ' (sintético)', '55 0000 000' || v.n
    from (values ('5e000000-0000-0000-0000-000000000006', 'POL', 'Polanco', 'Av. Ejemplo 600, Polanco', 6),
                 ('5e000000-0000-0000-0000-000000000007', 'COY', 'Coyoacán', 'Calle Ejemplo 700, Coyoacán', 7)) v(id, clave, nombre, dir, n)
   where not exists (select 1 from piefirme.sedes s where s.id = v.id::uuid or (s.organizacion_id = o and s.clave = v.clave));
  insert into piefirme.cabinas (organizacion_id, sede_id, nombre)
  select o, s.id, c.nombre from piefirme.sedes s cross join (values ('Cabina 1'), ('Cabina 2')) c(nombre)
   where s.organizacion_id = o and s.clave in ('POL', 'COY')
  on conflict (sede_id, nombre) do nothing;

  -- ───────────── cargo de las cuentas de prueba (solo donde aún es nulo; no cambia rol ni sedes) ─────────────
  update piefirme.perfiles p set cargo = v.cargo
    from (values ('a@g.com', 'direccion'), ('du@g.com', 'direccion'), ('m@g.com', 'admin'), ('sa@g.com', 'admin'), ('adm@g.com', 'gerente'),
                 ('admin@sintetico.test', 'admin'), ('admin.sintetico@ejemplo.invalid', 'admin'),
                 ('r@g.com', 'recepcion'), ('r1@g.com', 'cajero'), ('r2@g.com', 'asistente'), ('recepcion@sintetico.test', 'cajero'), ('ana.lopez@ejemplo.invalid', 'recepcion')) v(email, cargo)
   where p.organizacion_id = o and p.email = v.email and p.cargo is null;
  update piefirme.perfiles set cargo = 'podologo' where organizacion_id = o and rol = 'podologo' and cargo is null;
  update piefirme.perfiles set cargo = 'recepcion' where organizacion_id = o and rol = 'recepcion' and cargo is null;
  update piefirme.perfiles set cargo = 'admin' where organizacion_id = o and rol = 'administrador' and cargo is null;

  -- ───────────── cargo de los 15 empleados de D_01 y vínculo con su perfil (por nombre.apellido@ejemplo.invalid) ─────────────
  update piefirme.empleados set cargo = case puesto when 'podologo' then 'podologo' when 'recepcion' then 'recepcion' when 'apoyo' then 'asistente' else 'admin' end
   where organizacion_id = o and cargo is null and numero_empleado ~ '^E0';
  update piefirme.empleados e set perfil_id = p.id
    from piefirme.perfiles p
   where e.organizacion_id = o and e.perfil_id is null and p.organizacion_id = o
     and p.email = lower(translate(e.nombre || '.' || e.apellido_pat, 'ÁÉÍÓÚáéíóúñÑ', 'AEIOUaeiounN')) || '@ejemplo.invalid'
     and not exists (select 1 from piefirme.empleados x where x.perfil_id = p.id);

  -- ───────────── empleados faltantes: 7 sedes × (gerente, 2 cajeros, recepción, asistente) + 15 podólogos + dirección, administración, almacén central ─────────────
  with s7 as (
    select * from (values (1, 'CHA'), (2, 'CEN'), (3, 'GAL'), (4, 'PAT'), (5, 'SEN'), (6, 'POL'), (7, 'COY')) t(n, clave)
  ), plantilla as (
    select * from (values ('gerente', 1), ('cajero', 1), ('cajero', 2), ('recepcion', 1), ('asistente', 1)) t(cargo, k)
  ), lista as (
    select p.cargo, p.k, s.clave, s.n from s7 s cross join plantilla p
    union all select 'podologo', k, clave, n from (values (1, 'POL', 6), (2, 'POL', 6), (1, 'COY', 7), (2, 'COY', 7)) t(k, clave, n)
    union all select 'podologo', 1, 'CHA', 1 union all select 'podologo', 2, 'CHA', 1 union all select 'podologo', 1, 'CEN', 2
    union all select 'podologo', 3, 'CHA', 1 union all select 'podologo', 2, 'CEN', 2
    union all select 'podologo', 1, 'GAL', 3 union all select 'podologo', 2, 'GAL', 3 union all select 'podologo', 1, 'PAT', 4 union all select 'podologo', 2, 'PAT', 4
    union all select 'podologo', 1, 'SEN', 5 union all select 'podologo', 2, 'SEN', 5
    union all select 'direccion', 1, 'CHA', 1 union all select 'admin', 1, 'CHA', 1 union all select 'almacen', 1, 'CHA', 1
  ), numerada as (
    select l.*, (row_number() over (order by l.n, l.cargo, l.k))::int as rn from lista l
  ), nombres as (
    select array['Carlos','Ana','Luis','María','Jorge','Laura','Miguel','Patricia','Andrés','Lucía','Ricardo','Gabriela','Daniel','Elena','Fernando','Rosa','Alejandro','Carmen','Iván','Silvia','Pablo','Paula','Sergio','Diana'] as nom,
           array['García','Hernández','López','Martínez','González','Pérez','Rodríguez','Sánchez','Ramírez','Torres','Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Ortiz','Ruiz','Mendoza','Vargas','Castillo','Jiménez','Navarro'] as ape
  )
  insert into piefirme.empleados (organizacion_id, sede_id, sedes, numero_empleado, nombre, apellido_pat, apellido_mat, puesto, cargo, esquema_contratacion,
                                fecha_ingreso, rfc, curp, nss, email, telefono, banco, clabe, periodicidad_pago, salario_periodo, bono_periodo, cedula, notas)
  select o, sd.id,
         case when n.cargo in ('podologo', 'asistente') or (n.cargo = 'cajero' and n.k = 2)
              then array[(select id from piefirme.sedes where organizacion_id = o and clave = (array['CHA','CEN','GAL','PAT','SEN','POL','COY'])[1 + (n.n % 7)])]
              else '{}'::uuid[] end,
         'E' || (100 + n.rn),
         nm.nom[1 + (n.rn * 7) % 24], nm.ape[1 + (n.rn * 5) % 24], nm.ape[1 + (n.rn * 11 + 3) % 24],
         case n.cargo when 'podologo' then 'podologo' when 'recepcion' then 'recepcion' when 'cajero' then 'recepcion' when 'asistente' then 'apoyo' when 'almacen' then 'apoyo' else 'administrador' end,
         n.cargo,
         case when n.cargo = 'podologo' and n.k = 2 then 'honorarios' else 'nomina' end,
         case when n.n >= 6 then date '2026-05-04' + ((n.rn * 3) % 90)::int
              when n.cargo = 'direccion' then date '2019-02-04' when n.cargo = 'admin' then date '2019-06-17'
              else date '2021-01-04' + ((n.rn * 53) % 1900)::int end,
         'XXXX' || lpad((500 + n.rn)::text, 6, '0') || 'AA0', 'XXXX' || lpad((500 + n.rn)::text, 6, '0') || 'HDFXXX00', lpad((71000000000 + n.rn)::text, 11, '0'),
         'g01.empleado' || (100 + n.rn) || '@ejemplo.invalid', '55 2000 ' || lpad((1000 + n.rn)::text, 4, '0'), 'Banco Ejemplo', lpad((200000000000000000 + n.rn)::text, 18, '0'),
         'quincenal',
         case n.cargo when 'direccion' then 31000 when 'admin' then 19000 when 'gerente' then 11000 when 'podologo' then 9000 when 'cajero' then 6200
                      when 'recepcion' then 6000 when 'asistente' then 5600 else 6400 end,
         case when n.cargo in ('cajero', 'recepcion') then 300 else 0 end,
         case when n.cargo = 'podologo' then 'CED-SINT-G' || lpad(n.rn::text, 4, '0') end,
         'G_01:' || n.cargo || ':' || n.clave || ':' || n.k || ' · Dato sintético para pruebas'
    from numerada n
    join piefirme.sedes sd on sd.organizacion_id = o and sd.clave = n.clave
   cross join nombres nm
  on conflict (organizacion_id, numero_empleado) do nothing;

  -- vínculo empleado ↔ cuenta de prueba (para probar «trabajando en», checador, bonos con sesión real)
  update piefirme.empleados e set perfil_id = p.id
    from (values ('G_01:direccion:CHA:1', 'a@g.com'), ('G_01:admin:CHA:1', 'm@g.com'), ('G_01:gerente:CHA:1', 'adm@g.com'),
                 ('G_01:cajero:CHA:1', 'r1@g.com'), ('G_01:asistente:CHA:1', 'r2@g.com'), ('G_01:recepcion:CHA:1', 'r@g.com'),
                 ('G_01:cajero:CHA:2', 'recepcion@sintetico.test'),
                 ('G_01:podologo:CHA:1', 'p@g.com'), ('G_01:podologo:CHA:2', 'p1@g.com'), ('G_01:podologo:CEN:1', 'p2@g.com'),
                 ('G_01:podologo:GAL:1', 'p3@g.com'), ('G_01:podologo:PAT:1', 'p4@g.com'), ('G_01:podologo:SEN:1', 'p5@g.com'),
                 ('G_01:podologo:CHA:3', 'podologo1@sintetico.test'), ('G_01:podologo:CEN:2', 'podologo2@sintetico.test'), ('G_01:podologo:GAL:2', 'podologo3@sintetico.test'),
                 ('G_01:podologo:PAT:2', 'podologo4@sintetico.test'), ('G_01:podologo:SEN:2', 'podologo5@sintetico.test')) v(clave, email)
    join piefirme.perfiles pr on pr.organizacion_id = o and pr.email = v.email
    join piefirme.perfiles p on p.id = pr.id
   where e.organizacion_id = o and e.notas like v.clave || ' %' and e.perfil_id is null
     and not exists (select 1 from piefirme.empleados x where x.perfil_id = p.id);

  -- dos bajas recientes (el trigger registra el movimiento 'baja')
  update piefirme.empleados set estado = 'baja', fecha_baja = current_date - 21, motivo_baja = 'Renuncia voluntaria (sintético)'
   where organizacion_id = o and estado = 'activo' and notas like 'G_01:asistente:GAL:1 %';
  update piefirme.empleados set estado = 'baja', fecha_baja = current_date - 9, motivo_baja = 'Término de contrato a prueba (sintético)'
   where organizacion_id = o and estado = 'activo' and notas like 'G_01:cajero:PAT:2 %';

  -- ───────────── asignaciones «trabajando en»: hoy ± 7 días, lunes a sábado ─────────────
  -- los empleados de D_01 cuelgan de sedes con clave en minúscula (duplicadas); su asignación va a la sede operativa equivalente (5e00…0001-5).
  insert into piefirme.empleado_asignaciones (organizacion_id, empleado_id, sede_id, fecha, origen)
  select o, e.id, pick.sede_id, d::date,
         case when d::date = current_date and cardinality(e.sedes) > 0 then 'autoelegida'
              when e.cargo = 'podologo' and extract(day from d)::int % 9 = 0 then 'gerente' else 'programada' end
    from piefirme.empleados e
    join lateral (
      select (array[coalesce((select c.id from piefirme.sedes c where c.organizacion_id = o and c.clave = (
                       select case s0.clave when 'chalco' then 'CHA' when 'centenario' then 'CEN' when 'galerias' then 'GAL' when 'patio' then 'PAT' when 'sendero' then 'SEN' else s0.clave end
                         from piefirme.sedes s0 where s0.id = e.sede_id)), e.sede_id)] || e.sedes) as todas
    ) t on true
    cross join generate_series(current_date - 7, current_date + 7, interval '1 day') d
    cross join lateral (select t.todas[1 + ((d::date - date '2026-01-05') + abs(hashtext(e.id::text)) % 3) % cardinality(t.todas)] as sede_id) pick
   where e.organizacion_id = o and e.estado <> 'baja' and extract(isodow from d) <= 6
     and (e.fecha_ingreso is null or e.fecha_ingreso <= d::date)
  on conflict (empleado_id, fecha) do nothing;

  -- ───────────── movimientos de personal ─────────────
  -- alta de los 15 empleados de D_01 (los nuevos ya la registró el trigger)
  insert into piefirme.empleado_movimientos (organizacion_id, empleado_id, tipo, fecha, sede_destino_id, motivo, detalle)
  select o, e.id, 'alta', coalesce(e.fecha_ingreso, current_date), e.sede_id, 'Alta del empleado (histórico)', jsonb_build_object('puesto_nuevo', e.puesto, 'cargo_nuevo', e.cargo)
    from piefirme.empleados e
   where e.organizacion_id = o and not exists (select 1 from piefirme.empleado_movimientos m where m.empleado_id = e.id and m.tipo = 'alta');
  -- historia: cambios de sede y de puesto (registros históricos; no modifican al empleado)
  insert into piefirme.empleado_movimientos (organizacion_id, empleado_id, tipo, fecha, sede_origen_id, sede_destino_id, motivo, detalle)
  select o, e.id, v.tipo, current_date - v.dias,
         (select id from piefirme.sedes where organizacion_id = o and clave = v.de), (select id from piefirme.sedes where organizacion_id = o and clave = v.a),
         v.motivo, v.detalle::jsonb
    from (values
      ('G_01:cajero:CHA:2',    'cambio_sede',   150, 'CEN', 'CHA', 'Cobertura por apertura de nuevo turno', '{}'),
      ('G_01:cajero:GAL:1',    'cambio_sede',    95, 'PAT', 'GAL', 'Solicitud de la persona por cercanía a su domicilio', '{}'),
      ('G_01:recepcion:SEN:1', 'cambio_sede',    60, 'GAL', 'SEN', 'Reasignación por rotación del equipo', '{}'),
      ('G_01:asistente:CHA:1', 'cambio_puesto', 210, null,  null,  'Promoción por desempeño', '{"puesto_anterior":"recepcion","puesto_nuevo":"apoyo","cargo_anterior":"recepcion","cargo_nuevo":"asistente"}'),
      ('G_01:cajero:CEN:1',    'cambio_puesto', 120, null,  null,  'Cambio de recepción a caja', '{"puesto_anterior":"apoyo","puesto_nuevo":"recepcion","cargo_anterior":"asistente","cargo_nuevo":"cajero"}'),
      ('G_01:gerente:SEN:1',   'cambio_puesto', 300, null,  null,  'Ascenso a gerente de sucursal', '{"puesto_anterior":"recepcion","puesto_nuevo":"administrador","cargo_anterior":"recepcion","cargo_nuevo":"gerente"}'),
      ('G_01:podologo:CHA:2',  'cambio_sede',    45, 'CEN', 'CHA', 'Rotación entre sucursales', '{}'))
      v(clave, tipo, dias, de, a, motivo, detalle)
    join piefirme.empleados e on e.organizacion_id = o and e.notas like v.clave || ' %'
   where not exists (select 1 from piefirme.empleado_movimientos m where m.empleado_id = e.id and m.tipo = v.tipo and m.fecha = current_date - v.dias);
end $$;
