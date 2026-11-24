-- F_02 · Tarea 0 (datos de operación) · CONSULTAS CLÍNICAS de las citas atendidas de los pacientes SINT-F.
-- Hasta F_01 había 5,703 citas atendidas y solo 93 consultas (sin cita ligada). Esta semilla crea UNA consulta por cita atendida con
-- su diagnóstico principal, signos vitales y procedimiento realizado, y la lleva por el ciclo real: borrador → pendiente_firma → cerrada (firmada).
-- Estados resultantes (determinista por hash del id de la cita):
--   · cerrada (firmada con firma de podólogo): la mayoría de lo anterior a 4 días y toda consulta cuyo paciente tiene aviso de privacidad;
--   · pendiente_firma: pacientes SIN aviso de privacidad firmado (regla P-004: se atiende pero no se cierra) y ~30 % de lo de los últimos 4 días;
--   · borrador: ~15 % de lo de los últimos 4 días.
-- No toca citas, ventas ni pagos. La firma/cierre pasan por las reglas reales (trigger consulta_bi/consulta_au: expediente.ultima_atencion y retención).
--@resumen: select jsonb_build_object('consultas_con_cita',(select count(*) from piefirme.consultas where cita_id is not null),'cerradas',(select count(*) from piefirme.consultas where cita_id is not null and estado='cerrada'),'pendiente_firma',(select count(*) from piefirme.consultas where cita_id is not null and estado='pendiente_firma'),'borrador',(select count(*) from piefirme.consultas where cita_id is not null and estado='borrador'),'diagnosticos',(select count(*) from piefirme.diagnosticos_consulta),'signos',(select count(*) from piefirme.signos_vitales))::text
-- Idempotente: no crea consulta para una cita que ya tiene una.
do $$
declare
  o constant uuid := '00000000-0000-0000-0000-00000000c0de';
  v_n int;
begin
  alter table piefirme.consultas disable trigger t_aud;
  alter table piefirme.diagnosticos_consulta disable trigger t_aud;
  alter table piefirme.procedimientos_consulta disable trigger t_aud;
  alter table piefirme.signos_vitales disable trigger t_aud;
  alter table piefirme.firmas disable trigger user;
  alter table piefirme.expedientes disable trigger t_aud;
  alter table piefirme.pacientes disable trigger t_aud;
  alter table piefirme.citas disable trigger user;

  create temp table _src on commit drop as
    select c.id as cita_id, c.paciente_id, c.sede_id, c.podologo_id, c.servicio_id, c.inicio, c.fin, sv.codigo as sv, p.diabetes, p.fecha_nacimiento,
           abs(hashtext('k1' || c.id)) as h1, abs(hashtext('k2' || c.id)) as h2, abs(hashtext('k3' || c.id)) as h3, abs(hashtext('k4' || c.id)) as h4,
           gen_random_uuid() as consulta_id, gen_random_uuid() as firma_id, upper(left(se.clave, 3)) as pref,
           exists (select 1 from piefirme.consentimientos k where k.paciente_id = p.id and k.tipo = 'aviso_privacidad' and k.estado = 'firmado') as con_aviso
      from piefirme.citas c
      join piefirme.pacientes p on p.id = c.paciente_id and p.notas_administrativas like 'SINT-F:%'
      join piefirme.servicios sv on sv.id = c.servicio_id
      join piefirme.sedes se on se.id = c.sede_id
     where c.organizacion_id = o and c.estado = 'atendida'
       and not exists (select 1 from piefirme.consultas x where x.cita_id = c.id);
  -- Folio explícito: varias sedes comparten la misma clave de 3 letras (GAL, CEN…), así que el contador por sede chocaría con los folios de las semillas A.
  alter table _src add column folio text;
  update _src s set folio = f.pref || '-CON-' || lpad((coalesce((select max(substring(x.folio from '[0-9]+$')::int) from piefirme.consultas x where x.folio like f.pref || '-CON-%'), 0) + f.rn)::text, 6, '0')
    from (select cita_id, pref, row_number() over (partition by pref order by inicio, cita_id) rn from _src) f where s.cita_id = f.cita_id;
  raise notice 'citas atendidas sin consulta: %', (select count(*) from _src);

  insert into piefirme.consultas (id, folio, organizacion_id, paciente_id, sede_id, cita_id, podologo_id, fecha_hora, tipo_atencion, servicio_id, motivo_consulta, padecimiento_actual,
      sintomas, anestesia, descripcion_procedimiento, nota_evolucion, nota_origen, tratamiento_texto, observaciones_seguimiento, pronostico, proxima_visita, borrador_guardado_en)
  select s.consulta_id, s.folio, o, s.paciente_id, s.sede_id, s.cita_id, s.podologo_id, s.inicio, 'presencial', s.servicio_id,
         m.motivo, m.padec, m.sint, case when s.sv in ('SV-002','SV-003') then 'infiltrativa' when s.sv in ('SV-007') then 'topica' else 'no_aplico' end,
         m.proc, m.nota, case when s.h3 % 100 < 7 then 'dictado_ia' else 'tecleada' end, m.trat, m.obs,
         case when s.diabetes in ('tipo1','tipo2') and s.h4 % 100 < 30 then 'reservado' else 'bueno' end,
         case when s.sv in ('SV-001','SV-012','SV-005') then (s.inicio at time zone 'America/Mexico_City')::date + (30 + s.h2 % 20) end,
         s.inicio + interval '20 minutes'
    from _src s
    join lateral (select * from (values
      ('SV-001','Quiropodia de rutina','Callosidades y uñas largas de varios meses','Dolor leve al caminar','Quiropodia: corte, fresado y deslaminado de hiperqueratosis','Pie con callosidad plantar tratada; piel íntegra','Hidratación diaria y calzado amplio','Evolución favorable'),
      ('SV-002','Dolor en uña encarnada','Uña encarnada de varias semanas, con inflamación','Dolor, enrojecimiento','Espiculectomía con anestesia infiltrativa','Se retira espícula, sin sangrado; curación','Antisepsia y curación cada 48 h','Sin complicaciones'),
      ('SV-003','Uña encarnada recurrente','Recidiva de onicocriptosis','Dolor intenso, secreción','Extracción de uña, hemostasia y curación','Hemostasia lograda; se cita a control','Curación y antibiótico indicado por el médico','Cita de control en 1 semana'),
      ('SV-004','Control post-extracción','Seguimiento tras extracción de uña','Molestia leve','Curación y control post-extracción','Cicatrización adecuada','Continuar curaciones','Alta próxima'),
      ('SV-005','Hongos en uñas','Uñas amarillas y engrosadas de meses','Sin dolor; estética','Sesión de láser antimicótico','Se aplica láser en 10 uñas, tolerancia buena','Antimicótico tópico y calzado ventilado','Requiere sesiones adicionales'),
      ('SV-006','Valoración de pie de riesgo','Paciente con factores de riesgo en pie','Hormigueo ocasional','Valoración con monofilamento y pulsos','Sensibilidad conservada; sin úlceras','Revisión diaria del pie y calzado adecuado','Revisión en 6 meses'),
      ('SV-007','Verruga en planta','Lesión plantar dolorosa de semanas','Dolor al apoyar','Tratamiento de verruga plantar','Se aplica tratamiento y se desbrida la lesión','Evitar humedad; control en 2 semanas','Requiere seguimiento'),
      ('SV-008','Estudio de la pisada','Dolor en talón y arco al caminar','Dolor al final del día','Estudio de la pisada con baropodometría','Pie plano flexible; se sugieren plantillas','Plantillas a medida','Pendiente orden de laboratorio'),
      ('SV-009','Primera valoración','Primera visita por molestias en los pies','Variable','Valoración inicial y plan de tratamiento','Se integra expediente y plan','Plan de sesiones','Se agenda tratamiento'),
      ('SV-010','Seguimiento a distancia','Control por videollamada','Sin molestias nuevas','Seguimiento a distancia','Evolución según lo esperado','Continuar indicaciones','Sin cambios'),
      ('SV-011','Cansancio de pies','Pies cansados tras jornada larga','Cansancio, tensión','Reflexología podal','Relajación y alivio de tensión','Estiramientos y descanso','Sin complicaciones'),
      ('SV-012','Uñas engrosadas','Uñas gruesas que no puede cortar','Presión al calzar','Fresado de uña engrosada','Se reduce grosor sin molestias','Repetir cada 2 meses','Evolución favorable')
    ) v(cod, motivo, padec, sint, proc, nota, trat, obs) where v.cod = s.sv) m on true;
  get diagnostics v_n = row_count;
  raise notice 'consultas creadas: %', v_n;

  insert into piefirme.diagnosticos_consulta (organizacion_id, consulta_id, tipo, categoria, texto_otros)
  select o, s.consulta_id, 'principal',
         case s.sv when 'SV-001' then 'hiperqueratosis' when 'SV-005' then 'onicomicosis' when 'SV-012' then 'onicomicosis' when 'SV-007' then 'papiloma_plantar' else 'otros' end,
         case s.sv when 'SV-002' then 'Onicocriptosis (uña encarnada)' when 'SV-003' then 'Onicocriptosis recurrente' when 'SV-004' then 'Control posquirúrgico de uña'
                   when 'SV-006' then 'Pie de riesgo (valoración)' when 'SV-008' then 'Alteración biomecánica de la marcha' when 'SV-009' then 'Valoración inicial'
                   when 'SV-010' then 'Seguimiento a distancia' when 'SV-011' then 'Fatiga de pie' end
    from _src s;
  insert into piefirme.diagnosticos_consulta (organizacion_id, consulta_id, tipo, categoria)
  select o, s.consulta_id, 'secundario', 'hiperqueratosis' from _src s where s.sv in ('SV-006','SV-008') and s.h1 % 100 < 50;

  insert into piefirme.signos_vitales (organizacion_id, consulta_id, peso_kg, talla_cm, ta_sistolica, ta_diastolica, glucosa_capilar, frecuencia_cardiaca, temperatura_c, dolor_0_10, talla_calzado)
  select o, s.consulta_id, 48 + s.h1 % 62, 148 + s.h2 % 40, 104 + s.h3 % 50, 64 + s.h4 % 32,
         case when s.diabetes in ('tipo1','tipo2') then 90 + s.h1 % 160 when s.diabetes = 'prediabetes' then 95 + s.h1 % 40 end,
         58 + s.h2 % 34, 36.2 + (s.h3 % 6) * 0.1, case when s.sv in ('SV-002','SV-003','SV-007') then 3 + s.h4 % 6 else s.h4 % 4 end, null
    from _src s;

  insert into piefirme.procedimientos_consulta (organizacion_id, consulta_id, procedimiento_id, es_principal, anestesia, descripcion)
  select o, s.consulta_id, cp.id, true, c.anestesia, c.descripcion_procedimiento
    from _src s
    join piefirme.consultas c on c.id = s.consulta_id
    join piefirme.catalogo_procedimientos cp on cp.organizacion_id = o and cp.codigo =
         case s.sv when 'SV-001' then 'QUIRO' when 'SV-002' then 'ESPIC' when 'SV-003' then 'EXTUN' when 'SV-004' then 'CURAC' when 'SV-005' then 'LASER'
                   when 'SV-006' then 'VALDM' when 'SV-007' then 'VERRU' when 'SV-008' then 'ESTPIS' when 'SV-009' then 'VALDM' when 'SV-012' then 'QUIRO' end;

  -- Menores de 18: 90 % con tutor registrado (INE); el 10 % restante es el caso borde P-005 (se atiende pero la nota no se puede cerrar)
  insert into piefirme.tutores (organizacion_id, paciente_id, tipo, nombre_completo, parentesco, telefono, identificacion_tipo, identificacion_folio, vigente)
  select o, p.id, 'tutor_menor', 'Tutor de ' || p.nombre || ' ' || coalesce(p.apellido_paterno, ''),
         (array['madre','padre','abuela','tía'])[1 + abs(hashtext('tp' || p.id)) % 4], p.telefono_celular, 'INE', 'INE' || lpad((abs(hashtext('ti' || p.id)) % 100000000)::text, 8, '0'), true
    from piefirme.pacientes p
   where p.notas_administrativas like 'SINT-F:%' and p.fecha_nacimiento > (current_date - interval '18 years')::date and abs(hashtext('tu' || p.id)) % 100 < 90
     and not exists (select 1 from piefirme.tutores t where t.paciente_id = p.id);

  -- Ciclo de estado ----------------------------------------------------------------------------------------------------------------
  -- estado final por consulta
  create temp table _fin on commit drop as
    select s.*, case
             when not s.con_aviso then 'pendiente_firma'
             when s.fecha_nacimiento > (current_date - interval '18 years')::date and not exists (select 1 from piefirme.tutores t where t.paciente_id = s.paciente_id and t.vigente) then 'pendiente_firma'
             when s.inicio < now() - interval '4 days' then case when s.h3 % 100 < 97 then 'cerrada' else 'pendiente_firma' end
             else case when s.h3 % 100 < 55 then 'cerrada' when s.h3 % 100 < 85 then 'pendiente_firma' else 'borrador' end end as destino
      from _src s;

  insert into piefirme.firmas (id, organizacion_id, firmante_tipo, firmante_usuario_id, nombre_firmante, cedula, imagen_path, documento_tipo, documento_id, documento_version, canal, firmado_en)
  select f.firma_id, o, 'podologo', f.podologo_id, coalesce(pf.nombre, '') || ' ' || coalesce(pf.apellidos, ''), pf.cedula,
         o || '/firmas/' || f.firma_id || '.png', 'consulta', f.consulta_id, '1', 'podologo_pantalla', f.fin + interval '12 minutes'
    from _fin f join piefirme.perfiles pf on pf.id = f.podologo_id where f.destino = 'cerrada';

  update piefirme.consultas c set estado = 'pendiente_firma' from _fin f where c.id = f.consulta_id and f.destino = 'pendiente_firma';
  update piefirme.consultas c
     set estado = 'cerrada', firma_podologo_id = f.firma_id, firmada_en = f.fin + interval '12 minutes', firmada_por = f.podologo_id,
         cedula_firmante = (select cedula from piefirme.perfiles where id = f.podologo_id), hash_contenido = md5(c.id::text || coalesce(c.nota_evolucion, ''))
    from _fin f where c.id = f.consulta_id and f.destino = 'cerrada';

  -- el contador por sede queda en el máximo de su clave para que los folios que genere la app sigan sin chocar
  insert into piefirme.secuencias_clinicas (organizacion_id, sede_id, tipo, ultimo)
  select se.organizacion_id, se.id, 'CON', (select coalesce(max(substring(x.folio from '[0-9]+$')::int), 0) from piefirme.consultas x where x.folio like upper(left(se.clave, 3)) || '-CON-%')
    from piefirme.sedes se where se.organizacion_id = o
  on conflict (sede_id, tipo) do update set ultimo = greatest(piefirme.secuencias_clinicas.ultimo, excluded.ultimo);

  alter table piefirme.consultas enable trigger t_aud;
  alter table piefirme.diagnosticos_consulta enable trigger t_aud;
  alter table piefirme.procedimientos_consulta enable trigger t_aud;
  alter table piefirme.signos_vitales enable trigger t_aud;
  alter table piefirme.firmas enable trigger user;
  alter table piefirme.expedientes enable trigger t_aud;
  alter table piefirme.pacientes enable trigger t_aud;
  alter table piefirme.citas enable trigger user;
  {{FIN}}
end $$;
