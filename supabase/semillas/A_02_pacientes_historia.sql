-- A_02 · Semilla SINTÉTICA (dominio A · clínico): 40 pacientes de ejemplo con padecimientos variados, consentimientos y firmas, tutores,
-- antecedentes (formato 2 de Pie Clinic), alergias, medicamentos, datos fiscales, etiquetas y dato sensible (VIH) de un caso.
-- Debe existir antes: migraciones 001, 010, 030-039 y la semilla A_01. Idempotente: si ya hay pacientes marcados «SINT-A:» no hace nada.
-- Marcador: pacientes.notas_administrativas = 'SINT-A:<n>:<perfil>' (lo usa A_03 para encontrarlos). created_at = fecha de alta (antes de su 1.ª consulta).
-- Perfiles: 1-7 pie diabético · 8-15 uña encarnada · 16-21 onicomicosis · 22-24 verruga plantar · 25-29 biomecánica/plantillas ·
--           30-33 quiropodia recurrente (adultos mayores) · 34-35 reconstrucción ungueal · 36-37 menores con tutor · 38-40 otros (hiperqueratosis, pie de atleta).
-- Casos de prueba de reglas: #12 y #34 son homónimas «María Pérez Aguirre» con distinta fecha de nacimiento (CA-13, P-006); #3 conserva número de expediente
-- migrado a mano (N-08); #39 sin aviso de privacidad firmado (P-004); #40 y 4 más sin autorización de fotos (CD-19); #30 con representante de adulto (P-005); #24, #25, #36 y #37 son menores con tutor.

do $$
declare
  c_org constant uuid := '00000000-0000-0000-0000-00000000c0de';
  fem text[] := array['María','Guadalupe','Rosa','Laura','Patricia','Sofía','Carmen','Verónica','Alicia','Teresa','Gabriela','Silvia','Norma','Lucía','Irma','Daniela','Elena','Beatriz','Martha','Claudia'];
  masc text[] := array['José','Juan','Miguel','Luis','Carlos','Jorge','Ricardo','Fernando','Alberto','Héctor','Raúl','Arturo','Sergio','Roberto','Manuel','Andrés','Pablo','Javier','Mario','Óscar'];
  ape text[] := array['García','Hernández','Martínez','López','González','Pérez','Rodríguez','Sánchez','Ramírez','Flores','Gómez','Cruz','Morales','Reyes','Jiménez','Torres','Vargas','Castillo','Romero','Mendoza','Aguilar','Ortega','Silva','Navarro'];
  sedes_c text[] := array['chalco','centenario','galerias','patio','sendero'];
  municipios text[] := array['Chalco','Centenario','Galerías','Patio','Sendero'];
  como text[] := array['Google','Facebook','Recomendación','Pasó por la plaza','Médico','Instagram'];
  calzados text[] := array['Cerrado','Tenis','Sandalia','Zapato formal','Bota de trabajo'];
  i int; v_perfil text; v_sexo text; v_nombre text; v_a1 text; v_a2 text; v_edad numeric; v_fnac date; v_alta date; v_sede uuid; v_pac uuid;
  v_firma uuid; v_n int := 0;
begin
  if exists (select 1 from piefirme.pacientes where organizacion_id = c_org and notas_administrativas like 'SINT-A:%') then
    raise notice 'A_02 ya aplicada'; return;
  end if;

  for i in 1..40 loop
    v_perfil := case when i <= 7 then 'diabetico' when i <= 15 then 'una_encarnada' when i <= 21 then 'onicomicosis' when i <= 24 then 'verruga'
                     when i <= 29 then 'biomecanica' when i <= 33 then 'quiropodia' when i <= 35 then 'reconstruccion' when i <= 37 then 'menor' else 'otros' end;
    v_sexo := case when i % 2 = 0 then 'mujer' else 'hombre' end;
    v_nombre := case when v_sexo = 'mujer' then fem[i / 2] else masc[(i + 1) / 2] end;
    v_a1 := ape[1 + (i * 7) % 24]; v_a2 := ape[1 + (i * 11 + 3) % 24];
    if i in (12, 34) then v_nombre := 'María'; v_a1 := 'Pérez'; v_a2 := 'Aguirre'; end if;
    v_edad := case v_perfil when 'diabetico' then 55 + (i * 3) % 18 when 'una_encarnada' then 18 + (i * 5) % 28 when 'onicomicosis' then 38 + (i * 3) % 25
                 when 'verruga' then 12 + (i % 3) * 9 when 'biomecanica' then (array[11, 27, 41, 52, 35])[i - 24] when 'quiropodia' then 70 + (i * 3) % 13
                 when 'reconstruccion' then (array[38, 44])[i - 33] when 'menor' then (array[9, 14])[i - 35] else (array[29, 47, 61])[i - 37] end;
    v_fnac := (date '2026-10-25' - make_interval(years => v_edad::int))::date - ((i * 37) % 300);
    if i = 34 then v_fnac := date '1982-06-21'; end if;
    if i = 12 then v_fnac := date '1968-03-14'; end if;
    v_alta := date '2026-08-03' + ((i * 5) % 55);
    if v_perfil = 'diabetico' then v_alta := date '2026-08-03' + (i % 4); end if;
    v_sede := (select id from piefirme.sedes where organizacion_id = c_org and clave = sedes_c[1 + (i - 1) % 5]);

    insert into piefirme.pacientes (organizacion_id, numero_expediente, folio_anterior, sede_registro_id, nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento,
        curp, estado_civil, lugar_origen, ocupacion, telefono_celular, telefono_fijo, email, calle, num_exterior, manzana, lote, colonia, municipio, codigo_postal, estado_domicilio,
        deporte, tipo_calzado, talla_calzado, preferencia_contacto, horario_preferido, como_nos_conocio, referido_texto, canal_origen, notas_administrativas,
        facturar_automatico, origen_registro, acepta_recordatorios, acepta_promociones, created_at)
    values (c_org, case when i = 3 then 'PC-0412' end, case when i = 3 then 'P-4127' end, v_sede, v_nombre, v_a1, v_a2, v_sexo, v_fnac,
        'SINT' || lpad(i::text, 6, '0') || 'XXXXXX00', (array['soltero','casado','union_libre','divorciado','viudo'])[1 + i % 5],
        (array['Chalco','Ciudad de México','Puebla','Texcoco','Toluca'])[1 + i % 5],
        (array['Docente','Comerciante','Enfermera','Taxista','Jubilado','Estudiante','Empleado de oficina','Hogar'])[1 + i % 8],
        '55' || lpad((10000000 + i)::text, 8, '0'), case when i % 3 = 0 then '55' || lpad((20000000 + i)::text, 8, '0') end,
        lower(translate(v_nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) || '.' || i || '@ejemplo.invalid',
        'Calle Ejemplo ' || i, (100 + i)::text, 'Mz ' || (1 + i % 9), 'Lt ' || (1 + (i * 3) % 14), 'Colonia Ejemplo ' || (1 + i % 6), municipios[1 + (i - 1) % 5], '56' || lpad((600 + i)::text, 3, '0'), 'Estado de México',
        case when i % 4 = 0 then 'Caminata' end, calzados[1 + i % 5], 23 + (i % 7) * 0.5 + case when v_sexo = 'hombre' then 3 else 0 end,
        case when i % 2 = 0 then array['whatsapp'] else array['whatsapp','correo'] end, (array['mañana','tarde','indistinto'])[1 + i % 3],
        como[1 + i % 6], case when i = 1 then 'Dr. Hugo Salas, endocrinólogo (sintético)' end, case when i % 6 = 0 then 'portal' else 'recepción' end,
        'SINT-A:' || i || ':' || v_perfil, i % 4 = 0, case when i % 6 = 0 then 'portal' else 'recepcion' end, true, i % 2 = 0, v_alta::timestamptz + time '10:00')
    returning id into v_pac;
    v_n := v_n + 1;

    -- ───── consentimientos (firma en pantalla con evidencia, P-142) ─────
    if i <> 39 then
      insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, imagen_path, documento_tipo, documento_version, ip, dispositivo, canal, firmado_en)
      values (c_org, 'paciente', v_pac, v_nombre || ' ' || v_a1 || ' ' || v_a2, c_org || '/firmas/' || gen_random_uuid() || '.png', 'consentimiento', '1', '10.0.0.' || (1 + i % 200), 'tablet recepción (sintético)',
              'recepcion_pantalla', v_alta::timestamptz + time '10:05') returning id into v_firma;
      insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, plantilla_id, aceptado, firma_id, canal, estado, fecha_hora)
      values (c_org, v_pac, 'aviso_privacidad', (select id from piefirme.plantillas_documento where organizacion_id = c_org and codigo = 'aviso_privacidad' and estado = 'activa'), true, v_firma,
              'recepcion_pantalla', 'firmado', v_alta::timestamptz + time '10:05'),
             (c_org, v_pac, 'datos_salud', (select id from piefirme.plantillas_documento where organizacion_id = c_org and codigo = 'consentimiento_datos_salud' and estado = 'activa'), true, v_firma,
              'recepcion_pantalla', 'firmado', v_alta::timestamptz + time '10:05'),
             (c_org, v_pac, 'comunicaciones_recordatorios', null, true, v_firma, 'recepcion_pantalla', 'firmado', v_alta::timestamptz + time '10:05');
      if i not in (7, 13, 20, 40) then
        insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, plantilla_id, aceptado, firma_id, canal, estado, fecha_hora)
        values (c_org, v_pac, 'fotos_clinicas', (select id from piefirme.plantillas_documento where organizacion_id = c_org and codigo = 'autorizacion_fotos_clinicas' and estado = 'activa'), true, v_firma,
                'recepcion_pantalla', 'firmado', v_alta::timestamptz + time '10:06');
      end if;
      if i in (2, 9, 21, 26) then
        insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, plantilla_id, aceptado, firma_id, canal, estado, fecha_hora)
        values (c_org, v_pac, 'fotos_docencia', (select id from piefirme.plantillas_documento where organizacion_id = c_org and codigo = 'autorizacion_fotos_docencia' and estado = 'activa'), true, v_firma,
                'recepcion_pantalla', 'firmado', v_alta::timestamptz + time '10:07');
      end if;
      if i % 2 = 0 then
        insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, aceptado, firma_id, canal, estado, fecha_hora)
        values (c_org, v_pac, 'comunicaciones_promociones', true, v_firma, 'recepcion_pantalla', 'firmado', v_alta::timestamptz + time '10:08');
      end if;
    end if;

    -- ───── tutores y representantes (P-005) ─────
    if i in (24, 25, 36, 37) then
      insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, imagen_path, documento_tipo, canal, firmado_en)
      values (c_org, 'tutor', v_pac, 'Mariana ' || v_a1 || ' (tutora, sintético)', c_org || '/firmas/' || gen_random_uuid() || '.png', 'consentimiento', 'recepcion_pantalla', v_alta::timestamptz + time '10:09') returning id into v_firma;
      insert into piefirme.tutores (organizacion_id, paciente_id, tipo, nombre_completo, parentesco, telefono, identificacion_tipo, identificacion_folio, firma_id)
      values (c_org, v_pac, 'tutor_menor', 'Mariana ' || v_a1 || ' ' || v_a2 || ' (sintético)', 'madre', '55' || lpad((30000000 + i)::text, 8, '0'), 'INE', 'SINT-INE-' || i, v_firma);
    elsif i = 30 then
      insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, imagen_path, documento_tipo, canal, motivo_representante, firmado_en)
      values (c_org, 'representante', v_pac, 'Hija de ' || v_nombre || ' (sintético)', c_org || '/firmas/' || gen_random_uuid() || '.png', 'consentimiento', 'recepcion_pantalla', 'Debilidad visual severa', v_alta::timestamptz + time '10:09') returning id into v_firma;
      insert into piefirme.tutores (organizacion_id, paciente_id, tipo, nombre_completo, parentesco, telefono, motivo, firma_id)
      values (c_org, v_pac, 'representante_adulto', 'Hija de ' || v_nombre || ' (sintético)', 'hija', '55' || lpad((30000000 + i)::text, 8, '0'), 'Debilidad visual severa', v_firma);
    end if;

    insert into piefirme.contactos_emergencia (organizacion_id, paciente_id, nombre, parentesco, telefono)
    values (c_org, v_pac, 'Contacto Ejemplo ' || i, (array['esposo(a)','hijo(a)','hermano(a)','amigo(a)'])[1 + i % 4], '55' || lpad((40000000 + i)::text, 8, '0'));

    if i % 4 = 0 then
      insert into piefirme.datos_fiscales_paciente (organizacion_id, paciente_id, rfc, razon_social, regimen_fiscal, codigo_postal_fiscal, uso_cfdi, email_factura, predeterminado)
      values (c_org, v_pac, 'XXXX' || lpad(i::text, 6, '0') || 'AA0', upper(v_nombre || ' ' || v_a1 || ' ' || v_a2), (array['612','605','626'])[1 + i % 3], '56600', (array['D01','G03'])[1 + i % 2],
              'factura.' || i || '@ejemplo.invalid', true);
    end if;

    insert into piefirme.paciente_etiquetas (organizacion_id, paciente_id, etiqueta_id)
    select c_org, v_pac, e.id from piefirme.etiquetas_paciente e
     where e.organizacion_id = c_org and ((v_perfil = 'diabetico' and e.nombre = 'Diabético') or (v_perfil = 'biomecanica' and e.nombre = 'Plantillas')
            or (v_perfil = 'quiropodia' and e.nombre = 'Recurrente') or (i = 1 and e.nombre = 'Referida'));

    -- ───── antecedentes (formato 2) ─────
    update piefirme.antecedentes_paciente set
      diabetes = case when v_perfil = 'diabetico' then 'si' else 'no' end,
      diabetes_tipo = case when v_perfil = 'diabetico' then case when i = 3 then 'tipo1' else 'tipo2' end end,
      diabetes_anios_evolucion = case when v_perfil = 'diabetico' then 3 + (i * 3) % 17 end,
      hba1c = case when v_perfil = 'diabetico' then 6.8 + (i % 6) * 0.5 end,
      hba1c_fecha = case when v_perfil = 'diabetico' then date '2026-07-10' + i end,
      diabetes_tratamiento = case when v_perfil = 'diabetico' then case when i = 3 then 'Insulina NPH' else 'Metformina 850 mg c/12 h' end end,
      medico_tratante = case when v_perfil = 'diabetico' then 'Dra. Médica Ejemplo (sintético)' end,
      medico_especialidad = case when v_perfil = 'diabetico' then 'Endocrinología' end,
      hipertension = case when v_perfil in ('diabetico', 'quiropodia') and i % 3 <> 0 then 'si' else 'no' end,
      alergicos = case when i in (2, 8, 10, 15, 22, 31) then 'si' else 'no' end,
      alergicos_detalle = case i when 2 then 'Látex' when 8 then 'Lidocaína con epinefrina' when 10 then 'Penicilina' when 15 then 'Yodo' when 22 then 'Látex' when 31 then 'Ibuprofeno' end,
      artritis = case when v_perfil = 'quiropodia' then 'si' else 'no' end,
      obesidad = case when i % 7 = 0 then 'si' else 'no' end,
      traumaticos = case when v_perfil = 'biomecanica' and i % 2 = 1 then 'si' else 'no' end,
      traumaticos_detalle = case when v_perfil = 'biomecanica' and i % 2 = 1 then 'Esguince de tobillo hace 2 años' end,
      varices = case when i % 5 = 0 then 'si' else 'no' end,
      otras_enfermedades = 'no',
      toma_medicamentos = case when v_perfil in ('diabetico', 'quiropodia') then 'si' else 'no' end,
      medicamentos_texto = case when v_perfil = 'diabetico' then 'Metformina 850 mg' when v_perfil = 'quiropodia' then 'Losartán 50 mg' end,
      ultima_glucosa_fecha = case when v_perfil = 'diabetico' then date '2026-10-01' + (i % 20) end,
      ultima_glucosa_texto = case when v_perfil = 'diabetico' then 'Ayuno ' || (110 + i * 6) || ' mg/dL' end,
      insuficiencia_venosa = case when i % 5 = 0 then 'si' else 'no' end, insuficiencia_arterial = case when i in (4, 31) then 'si' else 'no' end,
      neuropatia = case when v_perfil = 'diabetico' and i in (2, 4, 5) then 'si' else 'no' end,
      psoriasis = case when i = 18 then 'si' else 'no' end, inmunosupresion = 'no',
      anticoagulacion = case when i in (6, 31) then 'si' else 'no' end,
      ulcera_previa = case when i = 4 then 'si' else 'no' end, amputacion_previa = 'no', embarazo = case when v_sexo = 'mujer' and i = 16 then 'no' end,
      cirugia_previa_pie = case when i = 26 then 'Ninguna en pie' end,
      hf_padre = case when v_perfil = 'diabetico' then 'Diabetes' else 'Ninguno' end, hf_madre = case when i % 3 = 0 then 'Hipertensión' else 'Ninguno' end,
      hf_hermanos = case when i % 4 = 0 then 'Diabetes' else 'Ninguno' end, hf_esposo = 'Ninguno', hf_hijos = 'Ninguno',
      tabaquismo = case when i % 7 = 3 then 'si' else 'no' end, alcoholismo = case when i % 5 = 0 then 'si' else 'no' end, toxicomanias = 'no',
      tipo_calzado = calzados[1 + i % 5], numero_calzado = 23 + (i % 7) * 0.5 + case when v_sexo = 'hombre' then 3 else 0 end,
      deporte = case when i % 4 = 0 then 'si' else 'no' end, deporte_detalle = case when i % 4 = 0 then case when i = 26 then 'Fútbol' else 'Caminata' end end,
      calzado_actividad = case when v_perfil = 'diabetico' then 'Cerrado 8 h/día; de pie 6 h' when i = 8 then 'Docente, de pie 6 h' end,
      motivo_consulta_inicial = case v_perfil when 'diabetico' then 'Revisión de pie diabético' when 'una_encarnada' then 'Dolor e inflamación en uña del dedo gordo'
                                  when 'onicomicosis' then 'Uñas amarillas y gruesas' when 'verruga' then 'Verruga dolorosa en planta' when 'biomecanica' then 'Dolor de talón y arco al caminar'
                                  when 'quiropodia' then 'Corte y cuidado de uñas y callosidades' when 'reconstruccion' then 'Reconstrucción de uña dañada' when 'menor' then 'Uña encarnada recurrente'
                                  else 'Resequedad y descamación' end,
      sintomas_iniciales = case v_perfil when 'diabetico' then 'Hormigueo ocasional' when 'una_encarnada' then 'Dolor, enrojecimiento, secreción leve' when 'onicomicosis' then 'Engrosamiento, color amarillo'
                             when 'verruga' then 'Dolor al apoyar' when 'biomecanica' then 'Dolor al despertar' else 'Molestia leve' end
    where paciente_id = v_pac;

    -- ───── alergias y medicamentos estructurados ─────
    if i in (2, 8, 10, 15, 22, 31) then
      insert into piefirme.alergias_paciente (organizacion_id, paciente_id, sustancia, reaccion, anio, gravedad)
      values (c_org, v_pac, case i when 2 then 'Látex' when 8 then 'Lidocaína con epinefrina' when 10 then 'Penicilina' when 15 then 'Yodo' when 22 then 'Látex' else 'Ibuprofeno' end,
              case i when 8 then 'Reacción leve' when 10 then 'Urticaria' else 'Dermatitis de contacto' end, 2018 + i % 8, case when i = 10 then 'moderada' else 'leve' end);
    end if;
    if v_perfil = 'diabetico' then
      insert into piefirme.medicamentos_paciente (organizacion_id, paciente_id, nombre_dosis, anticoagulante, desde) values (c_org, v_pac, 'Metformina 850 mg c/12 h', false, date '2024-01-01');
    end if;
    if i in (6, 31) then
      insert into piefirme.medicamentos_paciente (organizacion_id, paciente_id, nombre_dosis, anticoagulante, desde)
      values (c_org, v_pac, case when i = 6 then 'AAS 100 mg c/24 h' else 'Acenocumarol 4 mg c/24 h' end, true, date '2025-05-01');
    end if;
    if v_perfil = 'quiropodia' then
      insert into piefirme.medicamentos_paciente (organizacion_id, paciente_id, nombre_dosis, anticoagulante, desde) values (c_org, v_pac, 'Losartán 50 mg c/24 h', false, date '2023-03-01');
    end if;

    -- ───── dato sensible (N-04): solo podólogo/administración lo leen ─────
    if i in (2, 14, 27) then
      insert into piefirme.paciente_datos_sensibles (paciente_id, organizacion_id, vih, vih_nota)
      values (v_pac, c_org, case i when 27 then 'si' when 14 then 'no' else 'no_sabe' end, 'Dato sintético para probar la restricción');
    end if;
  end loop;
  raise notice 'A_02: % pacientes', v_n;
end $$;
