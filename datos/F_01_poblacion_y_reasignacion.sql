-- F_01 · Tarea 0 (datos de operación) · POBLACIÓN DE PACIENTES + reparto realista de las citas históricas.
-- Problema que resuelve: las 8,130 citas del historial (E_01) estaban repartidas entre solo 40 pacientes (~200 visitas por persona).
-- Qué hace (determinista: todo sale de hashtext() de índices/ids, sin random(); re-ejecutable):
--   1. Crea {{N}} pacientes sintéticos (marca pacientes.notas_administrativas = 'SINT-F:<n>') en 5 sedes, edades 6-92, perfil de diabetes,
--      aviso de privacidad firmado (95 %), contacto de emergencia (70 %); el trigger crea expediente y antecedentes.
--   2. Reparte las citas de los 40 pacientes "operativos" (c1000000-…) entre los pacientes de SU sede con distribución sesgada
--      (unos cuantos frecuentes, cola larga de visitas únicas) y mueve con ellas ventas, ingresos, anticipos, recordatorios y cuentas por cobrar.
--      NO toca montos, folios, fechas, estados ni pagos: solo a quién pertenece cada cita.
--   3. Marca primera_vez en la cita más antigua de cada paciente y ajusta pacientes.created_at a la víspera de su primera cita.
-- Se purga borrando 'SINT-F:%' (o con scripts/limpiar-datos-prueba.mjs sobre organizaciones con parametros.es_prueba).
--@resumen: select jsonb_build_object('pacientes',(select count(*) from piefirme.pacientes where notas_administrativas like 'SINT-F:%'),'pac_con_citas',(select count(distinct paciente_id) from piefirme.citas where paciente_id in (select id from piefirme.pacientes where notas_administrativas like 'SINT-F:%')),'max_citas_un_paciente',(select max(c) from (select count(*) c from piefirme.citas group by paciente_id) x))::text
-- Idempotente: si ya existen pacientes 'SINT-F:%' no hace nada. {{FIN}} lo sustituye datos/cargar-datos.mjs (vacío = confirmar; 'raise exception' = ensayo).
do $$
declare
  o constant uuid := '00000000-0000-0000-0000-00000000c0de';
  n_pac constant int := {{N}};
  nom_m text[] := array['José','Juan','Miguel','Luis','Carlos','Jorge','Ricardo','Fernando','Alberto','Héctor','Raúl','Arturo','Sergio','Roberto','Manuel','Andrés','Pablo','Javier','Mario','Óscar','Daniel','Eduardo','Francisco','Antonio','Gerardo','Enrique','Armando','Rafael','Salvador','Ignacio'];
  nom_f text[] := array['María','Guadalupe','Rosa','Laura','Patricia','Sofía','Carmen','Verónica','Alicia','Teresa','Gabriela','Silvia','Norma','Lucía','Irma','Daniela','Elena','Beatriz','Martha','Claudia','Leticia','Araceli','Rocío','Esther','Josefina','Margarita','Yolanda','Adriana','Mónica','Karla'];
  ape text[] := array['García','Hernández','Martínez','López','González','Pérez','Rodríguez','Sánchez','Ramírez','Flores','Gómez','Cruz','Morales','Reyes','Jiménez','Torres','Vargas','Castillo','Romero','Mendoza','Aguilar','Ortega','Silva','Navarro','Rojas','Ruiz','Díaz','Herrera','Medina','Guerrero','Ríos','Salazar','Cortés','Luna','Campos','Núñez','Soto','Vega','Ibarra','Domínguez'];
  col text[] := array['Centro','Las Américas','San Rafael','Del Valle','Jardines','Benito Juárez','Lomas','Guadalupe','Villas','Los Pinos','Santa Cruz','Reforma'];
  como text[] := array['Google','Facebook','Recomendación','Pasó por la plaza','Médico','Instagram','WhatsApp'];
  calz text[] := array['Cerrado','Tenis','Sandalia','Zapato formal','Bota de trabajo'];
  mun text[] := array['Chalco','Centenario','Galerías','Patio','Sendero'];
  v_n int;
begin
  if exists (select 1 from piefirme.pacientes where organizacion_id = o and notas_administrativas like 'SINT-F:%') then
    raise notice 'F_01 ya aplicada'; return;
  end if;

  alter table piefirme.pacientes disable trigger t_aud;

  -- 1. pacientes ------------------------------------------------------------------------------------------------------------------
  insert into piefirme.pacientes (organizacion_id, sede_registro_id, nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, estado_civil,
      ocupacion, telefono_celular, email, colonia, municipio, codigo_postal, tipo_calzado, talla_calzado, diabetes, como_nos_conocio, canal_origen,
      acepta_recordatorios, acepta_promociones, origen_registro, alta_rapida, homonimo_confirmado, notas_administrativas, estado)
  select o, ('5e000000-0000-0000-0000-00000000000' || (1 + i % 5))::uuid,
         case when h1 % 100 < 58 then nom_f[1 + h2 % 30] else nom_m[1 + h2 % 30] end,
         ape[1 + h3 % 40], ape[1 + h4 % 40],
         case when h1 % 100 < 58 then 'mujer' else 'hombre' end,
         (date '2026-11-07' - (edad * 365 + h5 % 365))::date,
         upper(translate(left(md5('c' || i), 4), '0123456789abcdef', 'ABCDEFGHJKLMNPQR')) || to_char((date '2026-11-07' - (edad * 365 + h5 % 365)), 'YYMMDD')
           || case when h1 % 100 < 58 then 'M' else 'H' end || 'MC' || upper(translate(left(md5('d' || i), 3), '0123456789abcdef', 'BCDFGHJKLMNPQRST')) || chr(65 + i % 26) || (i % 10),
         (array['soltero','casado','casado','union_libre','divorciado','viudo'])[1 + h6 % 6],
         (array['Comerciante','Empleado','Hogar','Jubilado','Docente','Obrero','Chofer','Enfermería','Estudiante','Profesionista'])[1 + h7 % 10],
         '55' || lpad((10000000 + abs(hashtext('t' || i)) % 89999999)::text, 8, '0'),
         case when h8 % 100 < 55 then 'paciente' || i || '@correo.mx' end,
         col[1 + h9 % 12], mun[1 + i % 5], lpad((56000 + h9 % 900)::text, 5, '0'),
         calz[1 + h6 % 5], 22 + (h7 % 12) * 0.5 + case when h1 % 100 < 58 then 0 else 3 end,
         case when edad >= 55 and h8 % 100 < 38 then 'tipo2' when edad >= 40 and h8 % 100 < 12 then 'tipo2' when h8 % 100 < 3 then 'tipo1' when h8 % 100 < 8 then 'prediabetes' else 'no' end,
         como[1 + h5 % 7], (array['portal','llamada','presencial','whatsapp'])[1 + h4 % 4],
         h2 % 100 < 85, h3 % 100 < 40, case when h4 % 100 < 30 then 'portal' else 'recepcion' end, false,
         true, 'SINT-F:' || i, case when h5 % 100 < 4 then 'inactivo' else 'activo' end
    from (
      select i, abs(hashtext('a' || i)) h1, abs(hashtext('b' || i)) h2, abs(hashtext('c' || i)) h3, abs(hashtext('d' || i)) h4, abs(hashtext('e' || i)) h5,
             abs(hashtext('f' || i)) h6, abs(hashtext('g' || i)) h7, abs(hashtext('h' || i)) h8, abs(hashtext('k' || i)) h9,
             -- pirámide de edades de una clínica de podología: pocos menores, mayoría 35-80
             case when abs(hashtext('m' || i)) % 100 < 5 then 6 + abs(hashtext('n' || i)) % 12
                  when abs(hashtext('m' || i)) % 100 < 25 then 18 + abs(hashtext('n' || i)) % 22
                  when abs(hashtext('m' || i)) % 100 < 60 then 40 + abs(hashtext('n' || i)) % 20
                  else 60 + abs(hashtext('n' || i)) % 33 end as edad
        from generate_series(1, n_pac) i
    ) g;
  get diagnostics v_n = row_count;
  raise notice 'pacientes creados: %', v_n;

  -- aviso de privacidad firmado (95 %): una firma tecleada por paciente + consentimiento
  create temp table _av on commit drop as
    select p.id as pac, gen_random_uuid() as firma, p.nombre || ' ' || coalesce(p.apellido_paterno, '') as nom
      from piefirme.pacientes p
     where p.organizacion_id = o and p.notas_administrativas like 'SINT-F:%' and abs(hashtext('av' || p.id)) % 100 < 95;
  insert into piefirme.firmas (id, organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, nombre_tecleado, documento_tipo, documento_version, canal, firmado_en)
    select a.firma, o, 'paciente', a.pac, a.nom, a.nom, 'aviso_privacidad', '1', 'recepcion_pantalla', now() from _av a;
  insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, aceptado, firma_id, canal, estado, fecha_hora)
    select o, a.pac, 'aviso_privacidad', true, a.firma, 'recepcion_pantalla', 'firmado', now() from _av a;

  insert into piefirme.contactos_emergencia (organizacion_id, paciente_id, nombre, parentesco, telefono)
  select o, p.id, (array['María','José','Ana','Luis','Carmen','Pedro'])[1 + abs(hashtext('ce' || p.id)) % 6] || ' ' || (array['García','López','Pérez','Cruz'])[1 + abs(hashtext('cf' || p.id)) % 4],
         (array['Hijo(a)','Esposo(a)','Hermano(a)','Madre','Amigo(a)'])[1 + abs(hashtext('cg' || p.id)) % 5], '55' || lpad((10000000 + abs(hashtext('ct' || p.id)) % 89999999)::text, 8, '0')
    from piefirme.pacientes p
   where p.organizacion_id = o and p.notas_administrativas like 'SINT-F:%' and abs(hashtext('ce' || p.id)) % 100 < 70;

  -- 2. reparto de citas (sesgo u^1.15 → pocos frecuentes y cola larga) -------------------------------------------------------------
  create temp table _pool on commit drop as
    select p.id, p.sede_registro_id as sede, row_number() over (partition by p.sede_registro_id order by p.id) as rn,
           count(*) over (partition by p.sede_registro_id) as tot
      from piefirme.pacientes p where p.organizacion_id = o and p.notas_administrativas like 'SINT-F:%' and p.estado = 'activo';
  create temp table _map on commit drop as
    select c.id as cita_id, pl.id as nuevo
      from piefirme.citas c
      join _pool pl on pl.sede = c.sede_id
       and pl.rn = 1 + floor(pl.tot * power((abs(hashtext('u' || c.id::text)) % 100000) / 100000.0, 1.15))::int
     where c.organizacion_id = o and c.paciente_id::text like 'c1000000-%';
  raise notice 'citas a reasignar: %', (select count(*) from _map);

  alter table piefirme.citas disable trigger user;
  alter table piefirme.ventas disable trigger user;
  alter table piefirme.ingresos disable trigger user;
  alter table piefirme.anticipos disable trigger user;
  alter table piefirme.recordatorios disable trigger user;
  alter table piefirme.cuentas_por_cobrar disable trigger user;
  update piefirme.citas c set paciente_id = m.nuevo from _map m where c.id = m.cita_id;
  update piefirme.ventas v set paciente_id = m.nuevo from _map m where v.cita_id = m.cita_id;
  update piefirme.ingresos v set paciente_id = m.nuevo from _map m where v.cita_id = m.cita_id;
  update piefirme.anticipos v set paciente_id = m.nuevo from _map m where v.cita_id = m.cita_id;
  update piefirme.recordatorios v set paciente_id = m.nuevo from _map m where v.cita_id = m.cita_id;
  update piefirme.cuentas_por_cobrar v set paciente_id = m.nuevo from _map m where v.cita_id = m.cita_id;

  -- 3. primera visita coherente + fecha de alta
  update piefirme.citas c set primera_vez = (c.id = f.primera)
    from (select distinct on (paciente_id) paciente_id, id as primera from piefirme.citas
           where organizacion_id = o and paciente_id in (select id from _pool) order by paciente_id, inicio) f
   where c.paciente_id = f.paciente_id;
  update piefirme.pacientes p set created_at = f.pri - interval '1 day'
    from (select paciente_id, min(inicio) pri from piefirme.citas where paciente_id in (select id from _pool) group by 1) f
   where p.id = f.paciente_id;
  update piefirme.pacientes p set created_at = timestamptz '2025-11-03 10:00-06' + make_interval(days => abs(hashtext('al' || p.id)) % 360)
   where p.id in (select id from _pool) and not exists (select 1 from piefirme.citas c where c.paciente_id = p.id);

  alter table piefirme.citas enable trigger user;
  alter table piefirme.ventas enable trigger user;
  alter table piefirme.ingresos enable trigger user;
  alter table piefirme.anticipos enable trigger user;
  alter table piefirme.recordatorios enable trigger user;
  alter table piefirme.cuentas_por_cobrar enable trigger user;
  alter table piefirme.pacientes enable trigger t_aud;

  raise notice 'pacientes con citas: %, citas de pacientes SINT-F: %', (select count(distinct paciente_id) from piefirme.citas where paciente_id in (select id from _pool)),
    (select count(*) from piefirme.citas where paciente_id in (select id from _pool));
  {{FIN}}
end $$;
