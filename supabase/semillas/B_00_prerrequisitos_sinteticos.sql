-- Semilla B_00 · Prerrequisitos SINTÉTICOS del dominio B (Comercial y agenda). OPCIONAL: solo si la BD de QA aún no tiene estos datos.
-- Todo es sintético (P-132): nada de personas, RFC ni teléfonos reales. Idempotente (on conflict do nothing).
--
-- Organización fija:  00000000-0000-0000-0000-00000000c0de  («Pie Clinic (sintético)»)
-- Sedes (id fijo 5e000000-0000-0000-0000-00000000000N, clave): 1 CHA Chalco · 2 CEN Centenario · 3 GAL Galerías · 4 PAT Patio · 5 SEN Sendero
-- Cabinas: «Cabina 1» y «Cabina 2» por sede.
-- Usuarios (auth.users + perfiles), ids fijos:
--   a0000000-0000-0000-0000-000000000001  Administrador (todas las sedes)
--   a0000000-0000-0000-0000-000000000002  Recepción (todas las sedes)
--   a0000000-0000-0000-0000-00000000001N  Podólogo N (N = 1..5), asignado a la sede N
-- Pacientes sintéticos: c1000000-0000-0000-0000-0000000000NN (NN = 01..40).
-- NOTA: crear filas en auth.users solo funciona con rol de servicio; en QA los usuarios reales de prueba se dan de alta por invitación
-- (dominio D) y entonces basta con que usen estos mismos ids o con ajustar los ids en B_01/B_02.

insert into piefirme.organizaciones (id, nombre, razon_social, zona_horaria, plan, estado)
values ('00000000-0000-0000-0000-00000000c0de', 'Pie Clinic (sintético)', 'Razón social sintética', 'America/Mexico_City', 'por_clinica', 'activa')
on conflict (id) do nothing;

insert into piefirme.sedes (id, organizacion_id, clave, nombre, direccion, telefono, horario)
select ('5e000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-00000000c0de', c, nm, 'Dirección sintética ' || nm, '55 0000 000' || n,
       '{"lun_vie":"09:00-19:00","sab":"09:00-14:00"}'::jsonb
  from (values (1, 'CHA', 'Chalco'), (2, 'CEN', 'Centenario'), (3, 'GAL', 'Galerías'), (4, 'PAT', 'Patio'), (5, 'SEN', 'Sendero')) v(n, c, nm)
on conflict do nothing;

insert into piefirme.cabinas (organizacion_id, sede_id, nombre)
select '00000000-0000-0000-0000-00000000c0de', ('5e000000-0000-0000-0000-00000000000' || n)::uuid, 'Cabina ' || k
  from generate_series(1, 5) n, generate_series(1, 2) k
on conflict do nothing;

-- Usuarios sintéticos (requiere permiso de escritura en auth.users)
-- Usuario sin contraseña, sin confirmar y con todas las columnas de texto de GoTrue rellenas ('' en vez de NULL) para no romper el servicio de auth compartido.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', email, '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"sintetico":true}'::jsonb, now(), now() from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin@sintetico.test'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'recepcion@sintetico.test'),
  ('a0000000-0000-0000-0000-000000000011'::uuid, 'podologo1@sintetico.test'),
  ('a0000000-0000-0000-0000-000000000012'::uuid, 'podologo2@sintetico.test'),
  ('a0000000-0000-0000-0000-000000000013'::uuid, 'podologo3@sintetico.test'),
  ('a0000000-0000-0000-0000-000000000014'::uuid, 'podologo4@sintetico.test'),
  ('a0000000-0000-0000-0000-000000000015'::uuid, 'podologo5@sintetico.test')) u(id, email)
on conflict (id) do nothing;

insert into piefirme.perfiles (id, organizacion_id, rol, nombre, apellidos, email, cedula, sedes)
values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000c0de', 'administrador', 'Administrador', 'Sintético', 'admin@sintetico.test', null, '{}'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000c0de', 'recepcion', 'Recepción', 'Sintética', 'recepcion@sintetico.test', null, '{}')
on conflict (id) do nothing;
insert into piefirme.perfiles (id, organizacion_id, rol, nombre, apellidos, email, cedula, sedes)
select ('a0000000-0000-0000-0000-00000000001' || n)::uuid, '00000000-0000-0000-0000-00000000c0de', 'podologo',
       (array['Elena', 'Marco', 'Lucía', 'Andrés', 'Paula'])[n], 'Podólogo Sintético ' || n, 'podologo' || n || '@sintetico.test', 'CED-SINT-' || n,
       array[('5e000000-0000-0000-0000-00000000000' || n)::uuid]
  from generate_series(1, 5) n
on conflict (id) do nothing;

-- 40 pacientes sintéticos con nombres combinados (sin coincidencias de nombre completo + nacimiento)
insert into piefirme.pacientes (id, organizacion_id, sede_registro_id, nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento,
                              telefono_celular, email, origen_registro, alta_rapida, diabetes)
select ('c1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000c0de',
       ('5e000000-0000-0000-0000-00000000000' || (1 + n % 5))::uuid,
       (array['Ana', 'Luis', 'María', 'Jorge', 'Carmen', 'Pedro', 'Rosa', 'Miguel'])[1 + n % 8],
       (array['Sánchez', 'Ramírez', 'Torres', 'Flores', 'Vargas', 'Mendoza', 'Ortega', 'Cruz', 'Reyes', 'Morales'])[1 + n % 10],
       (array['Luna', 'Soto', 'Ríos', 'Peña', 'Campos'])[1 + n % 5] || ' (sint. ' || n || ')',
       case when n % 2 = 0 then 'mujer' else 'hombre' end,
       date '1950-01-01' + (n * 397) % 18000,
       '5500000' || lpad(n::text, 3, '0'), 'paciente' || n || '@sintetico.test', 'recepcion', false,
       case when n % 7 = 0 then 'tipo2' else 'no' end
  from generate_series(1, 40) n
on conflict (id) do nothing;
