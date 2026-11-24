-- A_03 · Semilla SINTÉTICA (dominio A · clínico): 3 meses de consultas firmadas (3-ago a 24-oct-2026), diagnósticos, mapa del pie, exploración,
-- signos vitales, fotos clínicas (metadatos), planes de tratamiento con sesiones (extracción + 4 curaciones diarias, láser, papiloma), valoraciones de pie
-- diabético, estudios de pisada y órdenes de plantilla en todos los estados, esterilización (lotes/kits con un lote bloqueado), quejas y una solicitud ARCO.
-- Debe existir antes: migraciones 001, 010, 030-039 y las semillas A_01 y A_02. Idempotente: si ya hay consultas de pacientes «SINT-A:» no hace nada.
-- Las consultas no ligan cita_id (las citas son del dominio B): para cuadrar con la agenda, B puede ligar consultas.cita_id por paciente+fecha.
-- Los servicios/productos se ligan por nombre solo si el catálogo de B ya existe (si no, quedan nulos). «Hoy» = 25-oct-2026.
-- Sin sesión (service_role) los triggers aceptan fijar fecha de firma/liberación, que es lo que hace esta semilla.

do $$ begin
  if exists (select 1 from piefirme.consultas c join piefirme.pacientes p on p.id = c.paciente_id where p.notas_administrativas like 'SINT-A:%') then
    raise notice 'A_03 ya aplicada'; return;
  end if;
  if not exists (select 1 from piefirme.pacientes where notas_administrativas like 'SINT-A:%') then
    raise exception 'Falta correr A_02 antes de A_03';
  end if;
end $$;

-- ═════════════════════ auxiliares (solo viven en esta sesión) ═════════════════════
create temp table sp on commit preserve rows as
  select split_part(p.notas_administrativas, ':', 2)::int as n, split_part(p.notas_administrativas, ':', 3) as perfil, p.id, p.sede_registro_id as sede,
         p.created_at::date as alta, p.nombre, p.sexo, p.fecha_nacimiento as fnac
    from piefirme.pacientes p where p.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and p.notas_administrativas like 'SINT-A:%';

create or replace function pg_temp.pod(p_sede uuid, p_n int) returns uuid language sql as $$
  select case s.clave when 'chalco' then (case when p_n % 2 = 0 then '00000000-0000-0000-0000-00000000a101' else '00000000-0000-0000-0000-00000000a102' end)::uuid
                      when 'centenario' then '00000000-0000-0000-0000-00000000a103'::uuid when 'galerias' then '00000000-0000-0000-0000-00000000a104'::uuid
                      when 'patio' then '00000000-0000-0000-0000-00000000a105'::uuid else '00000000-0000-0000-0000-00000000a106'::uuid end
    from piefirme.sedes s where s.id = p_sede $$;
create or replace function pg_temp.hab(p_sede uuid, p_f date) returns date language sql as $$ select piefirme_app.dia_habil(p_sede, p_f) $$;
create or replace function pg_temp.sig_sede(p_sede uuid) returns uuid language sql as $$
  select (select s2.id from piefirme.sedes s2 where s2.organizacion_id = s.organizacion_id and s2.clave = (array['chalco','centenario','galerias','patio','sendero'])[1 + (array_position(array['chalco','centenario','galerias','patio','sendero'], s.clave)) % 5])
    from piefirme.sedes s where s.id = p_sede $$;
create or replace function pg_temp.ts(p_f date, p_h time) returns timestamptz language sql as $$ select ((p_f + p_h)::timestamp at time zone 'America/Mexico_City') $$;

-- Esterilización: garantiza que el kit esté esterilizado con un lote vigente a la fecha de uso (crea el lote del día si hace falta).
create or replace function pg_temp.ensure_kit(p_kit uuid, p_f date) returns void language plpgsql as $$
declare k record; l record; v_lote uuid; v_pend boolean; c_org constant uuid := '00000000-0000-0000-0000-00000000c0de'; v_auto uuid; v_sede text;
begin
  select * into k from piefirme.kits_instrumental where id = p_kit;
  if k.estado = 'esterilizado' then
    select * into l from piefirme.lotes_esterilizacion where id = k.ultimo_lote_id;
    if l.esteril_hasta >= p_f and l.fecha_hora::date <= p_f and l.estado in ('liberado', 'liberado_condicionado') then return; end if;
    update piefirme.kits_instrumental set estado = 'por_esterilizar' where id = k.id;          -- esterilidad vencida
  end if;
  select clave into v_sede from piefirme.sedes where id = k.sede_id;
  select id into v_auto from piefirme.autoclaves where sede_id = k.sede_id limit 1;
  v_pend := (v_sede = 'patio' and p_f between date '2026-09-15' and date '2026-09-30') or p_f >= date '2026-10-23';   -- biológico aún pendiente
  insert into piefirme.lotes_esterilizacion (organizacion_id, sede_id, autoclave_id, fecha_hora, inicio_ciclo, fin_ciclo, ciclo, temperatura_c, presion_bar, tiempo_min, indicador_quimico, responsable_id)
  values (c_org, k.sede_id, v_auto, pg_temp.ts(p_f, '07:30'), pg_temp.ts(p_f, '07:30'), pg_temp.ts(p_f, '08:15'), 'instrumental_envuelto', 134.0, 2.10, 18, 'viro', '00000000-0000-0000-0000-00000000a201')
  returning id into v_lote;
  insert into piefirme.lote_kits (organizacion_id, lote_id, kit_id)
  select c_org, v_lote, kk.id from piefirme.kits_instrumental kk where kk.sede_id = k.sede_id and kk.estado in ('por_esterilizar') and kk.activo;
  update piefirme.lotes_esterilizacion set estado = 'liberado_condicionado', liberado_por = '00000000-0000-0000-0000-00000000a001', liberado_en = pg_temp.ts(p_f, '08:30'),
         esteril_hasta = p_f + 30 where id = v_lote;
  if not v_pend then
    update piefirme.lotes_esterilizacion set indicador_biologico = 'negativo' where id = v_lote;
  end if;
end $$;

-- Una consulta completa y firmada (o en el estado final indicado).
create or replace function pg_temp.consulta(p_n int, p_fecha date, p_hora time, p_sede uuid, p_proc text, p_plan uuid default null, p_sesion uuid default null,
                                           p_prox date default null, p_final text default 'cerrada') returns uuid language plpgsql as $$
declare
  c_org constant uuid := '00000000-0000-0000-0000-00000000c0de';
  p record; v_pod uuid; v_ts timestamptz := pg_temp.ts(p_fecha, p_hora); v_cons uuid; v_firma uuid; v_nota text; v_motivo text; v_padec text; v_diag text; v_otros text; v_cie text;
  v_primera boolean; v_hall record; v_kit uuid; v_proc uuid; v_serv uuid; v_prof_ung boolean; v_foto_ok boolean; v_pie text; v_dolor int; v_apell text;
  v_trat text; v_obs text; v_anest text;
begin
  select * into p from pg_temp.sp where n = p_n;
  v_pod := pg_temp.pod(p_sede, p_n);
  select apellido_paterno into v_apell from piefirme.pacientes where id = p.id;
  v_primera := not exists (select 1 from piefirme.consultas c where c.paciente_id = p.id);
  v_pie := case when p_n % 2 = 0 then 'D' else 'I' end;
  v_dolor := case p_proc when 'ESPIC' then 5 when 'EXTUN' then 6 when 'VERRU' then 4 when 'CURAC' then 2 else 1 end;
  v_nota := case p_proc
    when 'QUIRO' then 'Quiropodia: desbridamiento de hiperqueratosis y helomas, corte y limado de uñas; piel íntegra, sin signos de infección. Indicaciones de hidratación diaria.'
    when 'ESPIC' then 'Espiculectomía en uña encarnada con anestesia tópica; se retira espícula, sin sangrado excesivo. Se indica curación y calzado abierto.'
    when 'EXTUN' then 'Extracción de uña con anestesia infiltrativa, hemostasia y curación. Se programa curación diaria por 4 días consecutivos hasta cicatrización adecuada.'
    when 'CURAC' then 'Curación y control: lecho limpio, evolución favorable, sin secreción ni datos de infección.'
    when 'LASER' then 'Sesión de láser antimicótico en uñas afectadas; tolera el procedimiento. Se cita en 30-35 días.'
    when 'VERRU' then 'Tratamiento de verruga plantar con aplicación local; se indica evitar humedad. Control en 2 semanas.'
    when 'RECON' then 'Reconstrucción ungueal con resina; buena adherencia y estética. Cuidados en casa.'
    when 'ESTPIS' then 'Estudio de la pisada con baropodometría; se documentan arco, retropié y longitudes. Se comenta opción de plantillas a medida.'
    when 'VALDM' then 'Valoración de pie de riesgo: inspección, pulsos, sensibilidad con monofilamento. Se educa sobre cuidado diario del pie.'
    when 'ENTPLA' then 'Entrega y ajuste de plantillas ortopédicas; marcha y confort adecuados. Se cita revisión de ajuste a los 30 días.'
    else 'Tratamiento de hiperqueratosis y control de piel; evolución favorable.' end;
  v_motivo := coalesce((select motivo_consulta_inicial from piefirme.antecedentes_paciente where paciente_id = p.id), 'Control') ;
  if p_proc in ('CURAC', 'ENTPLA') then v_motivo := case p_proc when 'CURAC' then 'Curación programada' else 'Entrega de plantillas' end; end if;
  v_padec := 'Paciente refiere ' || lower(coalesce((select sintomas_iniciales from piefirme.antecedentes_paciente where paciente_id = p.id), 'molestia leve')) || '; evolución de varias semanas.';
  select case p.perfil when 'diabetico' then 'otros' when 'una_encarnada' then 'otros' when 'menor' then 'otros' when 'onicomicosis' then 'onicomicosis' when 'verruga' then 'papiloma_plantar'
                       when 'biomecanica' then 'otros' when 'quiropodia' then 'hiperqueratosis' when 'reconstruccion' then 'otros'
                       else case p_n when 38 then 'hiperqueratosis' when 39 then 'pie_atleta' else 'micosis' end end into v_diag;
  v_otros := case p.perfil when 'diabetico' then 'Pie diabético en vigilancia' when 'una_encarnada' then 'Onicocriptosis (uña encarnada)' when 'menor' then 'Onicocriptosis (uña encarnada)'
                           when 'biomecanica' then 'Alteración biomecánica del pie' when 'reconstruccion' then 'Onicodistrofia' end;
  v_cie := case p.perfil when 'diabetico' then case when p_n = 3 then 'E10.5' else 'E11.5' end when 'una_encarnada' then 'L60.0' when 'menor' then 'L60.0' when 'onicomicosis' then 'B35.1'
                         when 'verruga' then 'B07.0' when 'biomecanica' then case when p_n % 2 = 0 then 'M21.4' else 'M77.4' end when 'quiropodia' then 'L84' when 'reconstruccion' then 'L60.3'
                         else case p_n when 38 then 'L85.9' when 39 then 'B35.3' else 'B36.9' end end;
  v_anest := (select anestesia_tipica from piefirme.catalogo_procedimientos where organizacion_id = c_org and codigo = p_proc);
  v_trat := case p_proc when 'QUIRO' then 'Quiropodia' when 'ESPIC' then 'Espiculectomía + curación' when 'EXTUN' then 'Extracción de uña (incluye 4 curaciones)' when 'CURAC' then 'Curación incluida en el plan'
                        when 'LASER' then 'Sesión de láser antimicótico' when 'VERRU' then 'Tratamiento de verruga plantar' when 'RECON' then 'Reconstrucción ungueal'
                        when 'ESTPIS' then 'Estudio de la pisada' when 'VALDM' then 'Valoración de pie de riesgo' when 'ENTPLA' then 'Entrega de plantillas' else 'Tratamiento de hiperqueratosis' end;
  v_obs := case p_proc when 'CURAC' then 'Evolución favorable' when 'EXTUN' then 'Hemostasia lograda' when 'ESTPIS' then 'Plantillas a medida sugeridas' else 'Sin complicaciones' end;
  v_serv := (select id from piefirme.servicios s where s.organizacion_id = c_org and s.nombre ilike case p_proc when 'QUIRO' then '%quiropodia%' when 'ESPIC' then '%encarnada%' when 'EXTUN' then '%extracci%'
              when 'CURAC' then '%curaci%' when 'LASER' then '%láser%' when 'VERRU' then '%papiloma%' when 'RECON' then '%reconstrucci%' when 'ESTPIS' then '%pisada%' when 'VALDM' then '%valoraci%' else '%quiropodia%' end limit 1);

  insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_usuario_id, nombre_firmante, cedula, imagen_path, documento_tipo, documento_version, canal, firmado_en)
  values (c_org, 'podologo', v_pod, (select nombre || ' ' || coalesce(apellidos, '') from piefirme.perfiles where id = v_pod), (select cedula from piefirme.perfiles where id = v_pod),
          c_org || '/firmas/' || gen_random_uuid() || '.png', 'consulta', '1', 'podologo_pantalla', v_ts + interval '35 minutes') returning id into v_firma;

  insert into piefirme.consultas (organizacion_id, paciente_id, sede_id, podologo_id, fecha_hora, tipo_atencion, servicio_id, plan_id, sesion_plan_id, motivo_consulta, padecimiento_actual,
      sintomas, anestesia, descripcion_procedimiento, nota_evolucion, tratamiento_texto, observaciones_seguimiento, pronostico, proxima_visita, proxima_cita_plazo_dias, borrador_guardado_en)
  values (c_org, p.id, p_sede, v_pod, v_ts, 'presencial', v_serv, p_plan, p_sesion, v_motivo, v_padec, (select sintomas_iniciales from piefirme.antecedentes_paciente where paciente_id = p.id),
          coalesce(v_anest, 'no_aplico'), v_nota, v_nota, v_trat, v_obs, 'bueno', coalesce(p_prox, case when p_proc in ('QUIRO', 'HIPER') then p_fecha + 35 end),
          case when p_prox is not null then p_prox - p_fecha end, v_ts + interval '20 minutes') returning id into v_cons;

  -- diagnóstico principal: lista corta del formato real + CIE-10 opcional
  insert into piefirme.diagnosticos_consulta (organizacion_id, consulta_id, tipo, categoria, texto_otros, cie10_codigo) values (c_org, v_cons, 'principal', v_diag, v_otros, v_cie);
  if p.perfil = 'diabetico' then
    insert into piefirme.diagnosticos_consulta (organizacion_id, consulta_id, tipo, categoria, cie10_codigo) values (c_org, v_cons, 'secundario', 'hiperqueratosis', 'L84');
  end if;

  insert into piefirme.signos_vitales (organizacion_id, consulta_id, peso_kg, talla_cm, ta_sistolica, ta_diastolica, glucosa_capilar, frecuencia_cardiaca, temperatura_c, dolor_0_10, talla_calzado)
  values (c_org, v_cons, 55 + (p_n * 3) % 40, 150 + (p_n * 2) % 30, 108 + (p_n * 5) % 34, 68 + (p_n * 3) % 22, case when p.perfil = 'diabetico' then 105 + (p_n * 17) % 90 end,
          62 + (p_n * 3) % 26, 36.4 + (p_n % 4) * 0.1, v_dolor, 23 + (p_n % 7) * 0.5 + case when p.sexo = 'hombre' then 3 else 0 end);

  insert into piefirme.procedimientos_consulta (organizacion_id, consulta_id, procedimiento_id, es_principal, anestesia, descripcion)
  select c_org, v_cons, cp.id, true, coalesce(v_anest, 'no_aplico'), v_nota from piefirme.catalogo_procedimientos cp where cp.organizacion_id = c_org and cp.codigo = p_proc;

  -- exploración: miembro inferior (primera consulta), ungueal si aplica
  if v_primera then
    insert into piefirme.exploracion_miembro_inferior (organizacion_id, consulta_id, pierna, siluetas, rotacion, talalgias, tipo_pie, huella_plantar, por_validar)
    select c_org, v_cons, l, case (p_n + (l = 'D')::int) % 5 when 0 then array['normal'] when 1 then array['genu_valgum'] when 2 then array['genu_varum'] when 3 then array['normal'] else array['genu_recurvatum'] end,
           (array['neutra', 'interna', 'externa'])[1 + (p_n % 3)], p.perfil = 'biomecanica', (array['normal', 'plano', 'cavo', 'valgo', 'varo'])[1 + (p_n % 5)], 'Huella ' || (array['normal', 'plana', 'cava'])[1 + (p_n % 3)], true
      from unnest(array['D', 'I']) l;
  end if;
  if p_proc in ('ESPIC', 'EXTUN', 'LASER', 'RECON') then
    insert into piefirme.exploraciones (organizacion_id, consulta_id, tipo, pie, dedo, datos, resumen)
    values (c_org, v_cons, 'ungueal', v_pie, 1, jsonb_build_object('forma', case p_proc when 'ESPIC' then 'involuta' else 'normal' end, 'grosor_mm', 1.2 + (p_n % 3) * 0.4,
            'color', case p_proc when 'LASER' then 'amarillo' else 'rosado' end, 'patron_onicomicosis', case p_proc when 'LASER' then 'subungueal distal' end,
            'dolor_presion_0_10', v_dolor, 'signos_infeccion', p_proc in ('ESPIC', 'EXTUN') and v_primera), 'Exploración ungueal ' || v_pie || ' dedo 1');
  end if;
  if p.perfil = 'diabetico' and v_primera then
    insert into piefirme.exploraciones (organizacion_id, consulta_id, tipo, pie, datos, resumen)
    values (c_org, v_cons, 'vascular', null, jsonb_build_object('pulso_pedio', 'presente', 'llenado_capilar_s', 2.0, 'edema', 'no', 'itb', null), 'ITB no evaluado (sin equipo)');
  end if;

  -- mapa del pie (4 vistas)
  insert into piefirme.hallazgos_pie (organizacion_id, consulta_id, numero, pie, vista, zona_codigo, tipo_hallazgo, marca, descripcion, medida_cm, gravedad, x, y)
  select c_org, v_cons, 1, v_pie,
         case when p_proc in ('ESPIC', 'EXTUN', 'CURAC', 'LASER', 'RECON') then 'dorsal' else 'plantar' end,
         case p_proc when 'ESPIC' then 'una1' when 'EXTUN' then 'una1' when 'CURAC' then 'una1' when 'LASER' then 'una1' when 'RECON' then 'una1' when 'VERRU' then 'mt2' when 'ESTPIS' then 'mediopie_medial'
                     when 'VALDM' then 'mt3' else 'talon' end,
         case p_proc when 'ESPIC' then 'una_encarnada' when 'EXTUN' then 'una_encarnada' when 'CURAC' then 'una_encarnada' when 'LASER' then 'onicomicosis' when 'RECON' then 'onicomicosis'
                     when 'VERRU' then 'papiloma_plantar' when 'ESTPIS' then 'deformidad' when 'VALDM' then 'callosidad' else 'hiperqueratosis' end,
         case when p_proc in ('ESPIC', 'EXTUN', 'CURAC', 'LASER', 'RECON') then 'ungueal' else 'lesion' end,
         v_nota, case when p_proc in ('QUIRO', 'HIPER', 'VALDM') then 1.5 end, case when p_proc in ('EXTUN', 'ESPIC') then 'moderada' else 'leve' end,
         0.40 + (p_n % 5) * 0.08, 0.30 + (p_n % 4) * 0.1
   where p_proc not in ('ENTPLA');

  -- indicaciones
  if p_proc in ('ESPIC', 'EXTUN') then
    insert into piefirme.indicaciones_consulta (organizacion_id, consulta_id, tipo, medicamento_id, medicamento, dosis, via, frecuencia, duracion, es_receta, medio_entrega)
    select c_org, v_cons, 'medicamento', m.id, m.nombre, 'Aplicar capa delgada', 'tópica', 'c/12 h', '5 días', false, 'impresa' from piefirme.catalogo_medicamentos m where m.organizacion_id = c_org and m.nombre like 'Mupirocina%';
    insert into piefirme.indicaciones_consulta (organizacion_id, consulta_id, tipo, indicacion, medio_entrega) values (c_org, v_cons, 'no_farmacologica', 'Calzado abierto 1 semana; mantener seca la herida', 'impresa');
  end if;

  -- consentimiento informado del procedimiento invasivo (P-019): en consulta, una vez por paciente
  if p_proc in ('ESPIC', 'EXTUN', 'VERRU', 'LASER') and not exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'procedimiento') then
    insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, imagen_path, documento_tipo, documento_version, canal, firmado_en)
    values (c_org, 'paciente', p.id, p.nombre || ' ' || v_apell, c_org || '/firmas/' || gen_random_uuid() || '.png', 'consentimiento', '1', 'podologo_pantalla', v_ts + interval '3 minutes') returning id into v_firma;
    insert into piefirme.consentimientos (organizacion_id, paciente_id, tipo, plantilla_id, aceptado, firma_id, canal, estado, consulta_id, fecha_hora)
    values (c_org, p.id, 'procedimiento', (select id from piefirme.plantillas_documento where organizacion_id = c_org and codigo = 'consentimiento_procedimiento_podologico' and estado = 'activa'), true, v_firma,
            'recepcion_pantalla', 'firmado', v_cons, v_ts + interval '3 minutes');
    insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_usuario_id, nombre_firmante, cedula, imagen_path, documento_tipo, documento_version, canal, firmado_en)
    values (c_org, 'podologo', v_pod, (select nombre || ' ' || coalesce(apellidos, '') from piefirme.perfiles where id = v_pod), (select cedula from piefirme.perfiles where id = v_pod),
            c_org || '/firmas/' || gen_random_uuid() || '.png', 'consulta', '1', 'podologo_pantalla', v_ts + interval '35 minutes') returning id into v_firma;
  end if;
  select id into v_firma from piefirme.firmas where documento_tipo = 'consulta' and firmante_usuario_id = v_pod and firmado_en = v_ts + interval '35 minutes' order by created_at desc limit 1;

  -- instrumental: kit esterilizado con lote vigente a la fecha
  if p_proc in ('QUIRO', 'ESPIC', 'EXTUN', 'VERRU', 'RECON', 'HIPER') then
    select id into v_kit from piefirme.kits_instrumental
     where sede_id = p_sede and codigo = 'K-' || upper(left((select clave from piefirme.sedes where id = p_sede), 3)) || '-' || case p_proc when 'ESPIC' then 2 when 'VERRU' then 2 when 'EXTUN' then 3 else 1 end;
    perform pg_temp.ensure_kit(v_kit, p_fecha);
    insert into piefirme.uso_kit_consulta (organizacion_id, consulta_id, kit_id, metodo_seleccion, usado_en) values (c_org, v_cons, v_kit, case when p_n % 3 = 0 then 'manual' else 'qr' end, v_ts + interval '5 minutes');
  end if;

  -- cierre
  if p_final = 'cerrada' then
    update piefirme.consultas set firma_podologo_id = v_firma, estado = 'cerrada', firmada_en = v_ts + interval '35 minutes' where id = v_cons;
  elsif p_final = 'pendiente_firma' then
    update piefirme.consultas set estado = 'pendiente_firma' where id = v_cons;
  end if;

  -- fotos clínicas (metadatos; los archivos reales no existen en la semilla). Solo con autorización vigente (CD-19)
  v_foto_ok := exists (select 1 from piefirme.consentimientos c where c.paciente_id = p.id and c.tipo = 'fotos_clinicas' and c.estado = 'firmado' and c.aceptado);
  if v_foto_ok and p_proc in ('ESPIC', 'EXTUN', 'LASER', 'VERRU', 'RECON', 'VALDM') then
    insert into piefirme.fotos_clinicas (organizacion_id, paciente_id, consulta_id, sede_id, archivo_path, mime, tamano_bytes, ancho_px, alto_px, hash_sha256, pie, vista, zona_codigo, momento,
                                       nivel_autorizacion, difuminada, origen, comentario, tomada_en, subida_por)
    select c_org, p.id, v_cons, p_sede, c_org || '/' || p.id || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 900000 + (p_n * 13) % 400000, 1600, 1200,
           md5(v_cons::text || m), v_pie, case when p_proc in ('VERRU', 'VALDM') then 'plantar' else 'dorsal' end, case when p_proc in ('VERRU') then 'mt2' when p_proc = 'VALDM' then 'mt3' else 'una1' end, m,
           case when p.id in (select id from pg_temp.sp where n in (2, 9, 21, 26)) and m = 'despues' then 'docencia' else 'clinico' end,
           p.id in (select id from pg_temp.sp where n in (2, 9, 21, 26)) and m = 'despues', 'clinica', 'Foto sintética (' || m || ')', v_ts + case when m = 'antes' then interval '8 minutes' else interval '30 minutes' end, v_pod
      from unnest(array['antes', 'despues']) m;
  end if;
  return v_cons;
end $$;

-- ═════════════════════ planes de tratamiento ═════════════════════
create temp table plan_cfg (n int primary key, plantilla text, inicio date, precio numeric, max_real int, final text) on commit preserve rows;
insert into plan_cfg values
  (8, 'extraccion_una', null, 800, null, null), (9, 'extraccion_una', null, 800, null, null), (10, 'extraccion_una', null, 800, null, null),
  (11, 'extraccion_una', date '2026-08-20', 800, 2, 'abandonado'), (12, 'extraccion_una', date '2026-10-23', 800, null, null), (13, 'extraccion_una', date '2026-10-21', 800, null, null),
  (14, 'una_encarnada', null, 530, null, null), (15, 'una_encarnada', null, 530, null, null),
  (16, 'laser_onicomicosis', null, 1800, null, null), (17, 'laser_onicomicosis', null, 1800, null, null), (18, 'laser_onicomicosis', null, 1800, null, null),
  (19, 'laser_onicomicosis', null, 1800, null, null), (20, 'laser_onicomicosis', null, 1800, 1, 'abandonado'), (21, 'laser_onicomicosis', null, 1800, null, null),
  (22, 'papiloma_plantar', null, 600, null, null), (23, 'papiloma_plantar', null, 600, null, null), (24, 'papiloma_plantar', date '2026-10-09', 600, null, null);

create temp table sv (n int, fecha date, hora time, sede uuid, proc text, plan uuid, sesion uuid, prox date, final text default 'cerrada') on commit preserve rows;

do $$
declare
  c_org constant uuid := '00000000-0000-0000-0000-00000000c0de'; r record; ses record; v_plan uuid; v_pod uuid; v_ini date; v_sig date;
begin
  -- planes con sus sesiones
  for r in select cfg.*, p.id as pac, p.sede, p.alta from plan_cfg cfg join pg_temp.sp p on p.n = cfg.n order by cfg.n loop
    v_ini := greatest(r.alta, coalesce(r.inicio, r.alta));
    v_pod := pg_temp.pod(r.sede, r.n);
    insert into piefirme.planes_tratamiento (organizacion_id, paciente_id, nombre, plantilla_id, podologo_id, sede_id, fecha_inicio, objetivo_alta, precio_plan, forma_cobro, intervalo_texto, created_at)
    select c_org, r.pac, pl.nombre, pl.id, v_pod, r.sede, v_ini, pl.criterio_alta, r.precio, case when r.plantilla = 'laser_onicomicosis' then 'por_sesion' else 'todo_en_sesion_1' end,
           case r.plantilla when 'extraccion_una' then 'Curaciones diarias por 4 días consecutivos' when 'laser_onicomicosis' then 'Cada 30-35 días' else null end, v_ini::timestamptz + time '09:00'
      from piefirme.plantillas_plan pl where pl.organizacion_id = c_org and pl.codigo = r.plantilla returning id into v_plan;
    perform piefirme.generar_sesiones_plan(v_plan);
    for ses in select * from piefirme.sesiones_plan where plan_id = v_plan order by numero loop
      if ses.fecha_propuesta <= date '2026-10-24' and (r.max_real is null or ses.numero <= r.max_real) then
        if r.n = 19 and ses.numero = 2 then
          update piefirme.sesiones_plan set estado = 'falta' where id = ses.id;                -- inasistencia: no hay consulta
        else
          insert into sv (n, fecha, hora, sede, proc, plan, sesion)
          values (r.n, ses.fecha_propuesta, time '09:00' + ((r.n * 3) % 8) * interval '1 hour', r.sede,
                  case when ses.procedimiento ilike 'Extracción%' then 'EXTUN' when ses.procedimiento ilike 'Curación%' then 'CURAC' when ses.procedimiento ilike 'Retiro de espícula%' then 'ESPIC'
                       when ses.procedimiento ilike 'Láser%' then 'LASER' else 'VERRU' end, v_plan, ses.id);
        end if;
      end if;
    end loop;
  end loop;

  -- la siguiente sesión pendiente de cada plan en curso queda agendada (Recepción la liga a una cita del dominio B)
  update piefirme.sesiones_plan s set estado = 'agendada'
   where s.estado = 'por_generar' and s.fecha_propuesta >= date '2026-10-25'
     and s.numero = (select min(x.numero) from piefirme.sesiones_plan x where x.plan_id = s.plan_id and x.estado = 'por_generar')
     and exists (select 1 from piefirme.planes_tratamiento p where p.id = s.plan_id and p.estado = 'en_curso');

  -- visitas sueltas (sin plan)
  for r in select * from pg_temp.sp order by n loop
    if r.perfil = 'diabetico' then
      insert into sv select r.n, pg_temp.hab(r.sede, r.alta + d), time '10:00' + (r.n % 5) * interval '1 hour', r.sede, case when d = 0 then 'VALDM' else 'QUIRO' end, null::uuid, null::uuid, null::date
        from unnest(array[0, 35, 70]) d where r.alta + d <= date '2026-10-24';
    elsif r.perfil = 'quiropodia' then
      insert into sv select r.n, pg_temp.hab(r.sede, r.alta + d), time '09:30' + (r.n % 4) * interval '1 hour', r.sede, 'QUIRO', null::uuid, null::uuid, null::date
        from unnest(array[0, 35, 70]) d where r.alta + d <= date '2026-10-24';
    elsif r.perfil = 'reconstruccion' then
      insert into sv select r.n, pg_temp.hab(r.sede, r.alta + d), time '11:00', r.sede, 'RECON', null::uuid, null::uuid, null::date from unnest(array[0, 21]) d where r.alta + d <= date '2026-10-24';
    elsif r.perfil = 'menor' then
      insert into sv select r.n, pg_temp.hab(r.sede, r.alta + d), time '16:00', r.sede, case when d = 0 then 'ESPIC' else 'CURAC' end, null::uuid, null::uuid, null::date from unnest(array[0, 7]) d where r.alta + d <= date '2026-10-24';
    elsif r.n = 38 then insert into sv values (38, pg_temp.hab(r.sede, r.alta), time '12:00', r.sede, 'HIPER', null, null, null);
    elsif r.n = 40 then insert into sv values (40, pg_temp.hab(r.sede, r.alta), time '12:00', r.sede, 'HIPER', null, null, null);
    elsif r.n = 39 then insert into sv values (39, date '2026-10-24', time '17:00', r.sede, 'HIPER', null, null, null, 'pendiente_firma');   -- sin aviso firmado: se atiende pero no se puede cerrar (P-004)
    end if;
  end loop;
  insert into sv select 5, date '2026-10-24', time '18:00', sede, 'QUIRO', null, null, null, 'borrador' from pg_temp.sp where n = 5;   -- borrador autoguardado
  -- biomecánica: estudio y entrega en las fechas del escenario de órdenes
  insert into sv select 25, pg_temp.hab(sede, date '2026-10-19'), time '10:00', sede, 'ESTPIS', null, null, null from pg_temp.sp where n = 25;
  insert into sv select 26, pg_temp.hab(sede, date '2026-10-05'), time '10:00', sede, 'ESTPIS', null, null, null from pg_temp.sp where n = 26;
  insert into sv select 27, pg_temp.hab(sede, date '2026-08-29'), time '10:00', sede, 'ESTPIS', null, null, null from pg_temp.sp where n = 27;
  insert into sv select 27, pg_temp.hab(sede, date '2026-09-24'), time '10:00', sede, 'ENTPLA', null, null, null from pg_temp.sp where n = 27;
  insert into sv select 28, pg_temp.hab(sede, date '2026-09-14'), time '10:00', sede, 'ESTPIS', null, null, null from pg_temp.sp where n = 28;
  insert into sv select 28, pg_temp.hab(sede, date '2026-10-14'), time '10:00', sede, 'ENTPLA', null, null, null from pg_temp.sp where n = 28;
  insert into sv select 29, pg_temp.hab(sede, date '2026-10-12'), time '10:00', sede, 'ESTPIS', null, null, null from pg_temp.sp where n = 29;
  -- pacientes que se atienden en otra sede (n múltiplo de 9: visita en la sede siguiente con su podólogo)
  update sv set sede = pg_temp.sig_sede(sede) where n % 9 = 0 and plan is null and proc = 'QUIRO' and fecha = (select min(fecha) from sv x where x.n = sv.n and x.proc = 'QUIRO');
end $$;

-- ═════════════════════ consultas en orden cronológico (esterilización coherente con el calendario) ═════════════════════
do $$
declare r record; v_sig date;
begin
  for r in select * from sv order by fecha, hora, n loop
    perform pg_temp.consulta(r.n, r.fecha, r.hora, r.sede, r.proc, r.plan, r.sesion,
      case when r.sesion is not null then (select min(x.fecha_propuesta) from piefirme.sesiones_plan x where x.plan_id = r.plan and x.numero > (select numero from piefirme.sesiones_plan where id = r.sesion)) end,
      r.final);
  end loop;
end $$;

-- planes abandonados: se cancelan las sesiones restantes (P-026); el estado lo fija la clínica
update piefirme.sesiones_plan set estado = 'cancelada'
 where estado in ('por_generar', 'agendada', 'falta') and plan_id in (select pl.id from piefirme.planes_tratamiento pl join pg_temp.sp p on p.id = pl.paciente_id where p.n in (11, 20));
update piefirme.planes_tratamiento set estado = 'abandonado', motivo_estado = 'Sin actividad en más de 30 días (sintético)'
 where paciente_id in (select id from pg_temp.sp where n in (11, 20)) and estado = 'en_curso';

-- ═════════════════════ pie diabético: valoraciones firmadas ═════════════════════
do $$
declare c_org constant uuid := '00000000-0000-0000-0000-00000000c0de'; r record; v_c record; v_val uuid; v_firma uuid; k int; v_prox date; v_ult date; pie text; sitio text;
begin
  for r in select * from pg_temp.sp where perfil = 'diabetico' order by n loop
    for k in 1..case when r.n in (1, 3) then 2 else 1 end loop
      select * into v_c from piefirme.consultas where paciente_id = r.id and estado = 'cerrada' order by fecha_hora asc offset (case when k = 1 then 0 else 2 end) limit 1;
      continue when v_c.id is null;
      v_prox := case when r.n in (2, 5) then (v_c.fecha_hora::date + 60) else (v_c.fecha_hora::date + 90) end;
      insert into piefirme.valoraciones_pie_diabetico (organizacion_id, paciente_id, consulta_id, sede_id, podologo_id, fecha, diabetes_tipo, anios_evolucion, hba1c, hba1c_fecha, tratamiento_diabetes,
          medico_tratante, ulcera_previa, amputacion_previa, tabaquismo, sintomas, diapason_izq, diapason_der, reflejo_aquileo_izq, reflejo_aquileo_der, sensibilidad_termica, sensibilidad_protectora,
          pulso_pedio_izq, pulso_pedio_der, pulso_tibial_izq, pulso_tibial_der, llenado_capilar_izq_s, llenado_capilar_der_s, temperatura_piel, coloracion, edema, piel_atrofica_sin_vello,
          itb_izq, itb_der, deformidades, wagner, infeccion_idsa, riesgo_confirmado, frecuencia_revision, proxima_revision, educacion_plan, generar_carta_referencia, indicar_calzado_plantilla)
      select c_org, r.id, v_c.id, v_c.sede_id, v_c.podologo_id, v_c.fecha_hora::date, a.diabetes_tipo, a.diabetes_anios_evolucion, a.hba1c, a.hba1c_fecha, a.diabetes_tratamiento, a.medico_tratante,
             a.ulcera_previa = 'si', false, a.tabaquismo = 'si', case when a.neuropatia = 'si' then array['hormigueo', 'perdida_sensibilidad'] else array['hormigueo'] end::text[],
             'presente', case when a.neuropatia = 'si' then 'disminuida' else 'presente' end, 'presente', case when a.neuropatia = 'si' then 'disminuido' else 'presente' end,
             'normal', case when a.neuropatia = 'si' or r.n = 4 then 'ausente' else 'intacta' end,
             'presente', case when r.n in (4, 6) then 'disminuido' else 'presente' end, 'presente', 'presente', 2.0, 2.5, 'normal', 'normal', 'no', false, null, null,
             case when r.n = 4 then array['callosidad', 'hallux_valgus']::text[] else array['callosidad']::text[] end, case when r.n = 4 then 1 else 0 end, 'sin_infeccion',
             case when r.n = 4 then 3 when a.neuropatia = 'si' then 2 else 1 end,
             case when r.n in (4, 5) then 'cada_1_mes' when r.n in (2, 6) then 'cada_2_meses' else 'cada_3_meses' end, v_prox,
             'Revisión diaria del pie, calzado cerrado y amplio, hidratación sin interdigital.', r.n = 4, r.n in (4, 5)
        from piefirme.antecedentes_paciente a where a.paciente_id = r.id returning id into v_val;
      -- monofilamento 10 g: 10 sitios por pie (sitios sin sensibilidad en neuropatía/úlcera previa)
      foreach pie in array array['D', 'I'] loop
        foreach sitio in array array['dedo1', 'dedo3', 'dedo5', 'mt1', 'mt3', 'mt5', 'mediopie_medial', 'mediopie_lateral', 'talon', 'dorso'] loop
          insert into piefirme.monofilamento_sitios (organizacion_id, valoracion_id, pie, sitio, siente)
          values (c_org, v_val, pie, sitio, not (r.n in (2, 4, 5) and sitio in ('dedo1', 'mt1', 'mt3') and (r.n <> 4 or pie = 'D')));
        end loop;
      end loop;
      if r.n = 4 and k = 1 then
        insert into piefirme.ulceras_pie (organizacion_id, valoracion_id, pie, zona_codigo, localizacion_texto, area_cm2, profundidad)
        values (c_org, v_val, 'D', 'mt3', 'Cabeza MT 3 plantar', 1.4, 'subcutaneo');
      end if;
      insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_usuario_id, nombre_firmante, cedula, imagen_path, documento_tipo, documento_id, canal, firmado_en)
      select c_org, 'podologo', v_c.podologo_id, pf.nombre || ' ' || coalesce(pf.apellidos, ''), pf.cedula, c_org || '/firmas/' || gen_random_uuid() || '.png', 'valoracion', v_val, 'podologo_pantalla',
             v_c.fecha_hora + interval '45 minutes' from piefirme.perfiles pf where pf.id = v_c.podologo_id returning id into v_firma;
      update piefirme.valoraciones_pie_diabetico set estado = 'firmada', firma_id = v_firma, firmada_en = v_c.fecha_hora + interval '45 minutes' where id = v_val;
    end loop;
  end loop;
end $$;

-- ═════════════════════ plantillas ortopédicas: estudio de pisada y orden en todos los estados ═════════════════════
do $$
declare
  c_org constant uuid := '00000000-0000-0000-0000-00000000c0de'; r record; v_c record; v_est uuid; v_firma uuid; v_ord uuid; v_lab uuid; v_pod uuid; v_ent piefirme.consultas%rowtype;
  v_envio date; v_recep date; v_entrega date; v_estado text;
begin
  select id into v_lab from piefirme.laboratorios_ortopedicos where organizacion_id = c_org limit 1;
  for r in select * from pg_temp.sp where perfil = 'biomecanica' order by n loop
    select * into v_c from piefirme.consultas where paciente_id = r.id and estado = 'cerrada' order by fecha_hora asc limit 1;
    continue when v_c.id is null;
    v_pod := v_c.podologo_id;
    insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_usuario_id, nombre_firmante, imagen_path, documento_tipo, canal, firmado_en)
    select c_org, 'podologo', v_pod, pf.nombre, c_org || '/firmas/' || gen_random_uuid() || '.png', 'estudio_pisada', 'podologo_pantalla', v_c.fecha_hora + interval '50 minutes' from piefirme.perfiles pf where pf.id = v_pod returning id into v_firma;
    insert into piefirme.estudios_pisada (organizacion_id, paciente_id, consulta_id, sede_id, tipo_estudio, fecha, realizado_por, equipo_texto, tipo_arco, retropie, talla_calzado, longitud_izq_mm, longitud_der_mm,
        ancho_metatarsal_izq_mm, ancho_metatarsal_der_mm, altura_arco_izq_mm, altura_arco_der_mm, angulo_retropie_izq, angulo_retropie_der, patron_marcha, desgaste_calzado, cie10_codigo, actividad,
        calzado_habitual, peso_kg, costo)
    values (c_org, r.id, v_c.id, v_c.sede_id, 'baropodometria', v_c.fecha_hora::date, v_pod, 'Baropodómetro #BP-01 (sintético)', (array['plano', 'normal', 'cavo'])[1 + r.n % 3], (array['valgo', 'neutro', 'varo'])[1 + r.n % 3],
            24 + (r.n % 5), 235 + (r.n % 6) * 5, 236 + (r.n % 6) * 5, 92, 93, 14 + r.n % 6, 15 + r.n % 6, 4.5, 5.0, 'Marcha con pronación', 'Desgaste en borde interno', 'M21.4',
            case r.n when 26 then 'Fútbol' else 'Actividad diaria' end, 'Tenis', 60 + r.n, 1200) returning id into v_est;
    update piefirme.estudios_pisada set estado = 'firmado', firma_id = v_firma, firmado_en = v_c.fecha_hora + interval '50 minutes' where id = v_est;

    v_envio := case r.n when 26 then date '2026-10-07' when 27 then date '2026-09-01' when 28 then date '2026-09-16' when 29 then date '2026-10-14' end;
    v_recep := case r.n when 26 then date '2026-10-23' when 27 then date '2026-09-22' when 28 then date '2026-10-07' end;
    v_entrega := case r.n when 27 then date '2026-09-24' when 28 then date '2026-10-14' end;
    v_estado := case r.n when 25 then 'borrador' when 26 then 'recibida' when 29 then 'enviada' else 'entregada' end;
    insert into piefirme.ordenes_plantilla (organizacion_id, paciente_id, estudio_id, sede_id, podologo_id, modelo, material, cuna_realce, cobertura, pares, laboratorio_id, precio, anticipo_monto, anticipo_forma,
                                          indicaciones_laboratorio, created_at)
    values (c_org, r.id, v_est, v_c.sede_id, v_pod, 'Funcional a medida', 'Polipropileno + EVA', case when r.n % 2 = 0 then 'Cuña medial 3 mm' end, 'completa', 1, v_lab, 2500, case when r.n = 25 then 0 else 1250 end,
            'tarjeta', 'Orden sintética', v_c.fecha_hora + interval '1 hour') returning id into v_ord;
    if v_estado <> 'borrador' then
      update piefirme.ordenes_plantilla set estado = 'enviada', fecha_envio = v_envio where id = v_ord;
    end if;
    if v_estado in ('recibida', 'entregada') then
      update piefirme.ordenes_plantilla set estado = 'recibida', fecha_recepcion = v_recep, costo_laboratorio = 900 where id = v_ord;
    end if;
    if v_estado = 'entregada' then
      select * into v_ent from piefirme.consultas where paciente_id = r.id and fecha_hora::date = pg_temp.hab(v_c.sede_id, v_entrega) and estado = 'cerrada' limit 1;
      insert into piefirme.firmas (organizacion_id, firmante_tipo, firmante_paciente_id, nombre_firmante, imagen_path, documento_tipo, documento_id, canal, firmado_en)
      values (c_org, 'paciente', r.id, r.nombre || ' (conformidad)', c_org || '/firmas/' || gen_random_uuid() || '.png', 'entrega_plantilla', v_ord, 'podologo_pantalla', pg_temp.ts(v_entrega, '10:30')) returning id into v_firma;
      update piefirme.ordenes_plantilla set estado = 'entregada', fecha_entrega = v_entrega, entregado_por = v_pod, ajuste_realizado = true, conformidad_firma_id = v_firma where id = v_ord;
    end if;
  end loop;
end $$;

-- ═════════════════════ bloqueo de un lote por biológico positivo (P-023) ═════════════════════
update piefirme.lotes_esterilizacion set indicador_biologico = 'positivo'
 where id = (select l.id from piefirme.lotes_esterilizacion l join piefirme.sedes s on s.id = l.sede_id
              where s.clave = 'patio' and l.estado = 'liberado_condicionado' and l.fecha_hora::date between date '2026-09-15' and date '2026-09-30' order by l.fecha_hora limit 1);

-- ═════════════════════ notas aclaratorias (la nota firmada no se edita) ═════════════════════
insert into piefirme.notas_aclaratorias (organizacion_id, consulta_id, texto, autor_id, firma_id, fecha_hora)
select c.organizacion_id, c.id, 'Aclaración: el paciente refiere además dolor nocturno en el dedo afectado; se agrega a la evolución.', c.podologo_id, c.firma_podologo_id, c.firmada_en + interval '1 day'
  from piefirme.consultas c join pg_temp.sp p on p.id = c.paciente_id where p.n in (9, 12) and c.estado = 'cerrada' order by c.fecha_hora limit 2;

-- ═════════════════════ fotos retiradas (nunca se borran, P-008) ═════════════════════
update piefirme.fotos_clinicas set retirada = true, retirada_motivo = 'Foto movida/borrosa (sintético)', retirada_por = '00000000-0000-0000-0000-00000000a101'
 where id = (select f.id from piefirme.fotos_clinicas f order by f.tomada_en limit 1);

-- ═════════════════════ quejas e incidencias ═════════════════════
do $$
declare c_org constant uuid := '00000000-0000-0000-0000-00000000c0de'; r record; v_c uuid; q uuid;
begin
  for r in select * from (values
      (9,  'administrativa', 'tiempo_espera', 'baja', 'llamada', 'Esperó 35 minutos pasada su hora de cita.', 'resuelta', 'Se ofreció disculpa y se ajustó la agenda de la mañana.', 'disculpa', null::numeric, false),
      (12, 'administrativa', 'cobro_incorrecto', 'media', 'presencial', 'Cobro duplicado de la curación incluida en el plan.', 'cerrada', 'Se canceló el cargo duplicado y se regresó al paciente.', 'reembolso', 150::numeric, true),
      (16, 'evento_adverso_clinico', 'dolor_posterior', 'alta', 'llamada', 'Dolor intenso y enrojecimiento 2 días después del procedimiento.', 'en_revision', null, 'ninguna', null::numeric, false),
      (18, 'administrativa', 'trato_personal', 'media', 'whatsapp', 'Comentó trato poco amable en recepción.', 'nueva', null, 'ninguna', null::numeric, false),
      (21, 'administrativa', 'instrumental_higiene', 'alta', 'presencial', 'Preguntó por la esterilización del instrumental; solicita ver el lote usado.', 'escalada', null, 'ninguna', null::numeric, false)
    ) v(n, clase, tipo, grav, canal, descr, estado, resol, comp, monto, costo) loop
    select c.id into v_c from piefirme.consultas c join pg_temp.sp p on p.id = c.paciente_id where p.n = r.n and c.estado = 'cerrada' order by c.fecha_hora desc limit 1;
    insert into piefirme.quejas (organizacion_id, sede_id, paciente_id, consulta_id, podologo_id, registrada_por, canal, fecha_hora, clase, tipo, gravedad, descripcion, compensacion_tipo, compensacion_monto, compensacion_propuesta_por)
    select c_org, c.sede_id, c.paciente_id, case when r.clase = 'evento_adverso_clinico' or r.tipo = 'instrumental_higiene' then c.id end, c.podologo_id, '00000000-0000-0000-0000-00000000a201', r.canal,
           c.fecha_hora + interval '3 days', r.clase, r.tipo, r.grav, r.descr, r.comp, r.monto, case when r.comp <> 'ninguna' then '00000000-0000-0000-0000-00000000a201'::uuid end
      from piefirme.consultas c where c.id = v_c returning id into q;
    if r.estado <> 'nueva' then
      update piefirme.quejas set estado = 'en_revision', responsable_id = '00000000-0000-0000-0000-00000000a001' where id = q;
    end if;
    if r.estado = 'escalada' then update piefirme.quejas set estado = 'escalada', responsable_id = '00000000-0000-0000-0000-00000000a101' where id = q; end if;
    if r.estado in ('resuelta', 'cerrada') then
      update piefirme.quejas set compensacion_autorizada_por = case when r.costo then '00000000-0000-0000-0000-00000000a001'::uuid end where id = q;
      update piefirme.quejas set estado = 'resuelta', resolucion = r.resol where id = q;
    end if;
    if r.estado = 'cerrada' then update piefirme.quejas set estado = 'cerrada' where id = q; end if;
  end loop;
end $$;

-- ═════════════════════ solicitud ARCO (acceso) en proceso ═════════════════════
insert into piefirme.solicitudes_arco (organizacion_id, paciente_id, tipo, fecha_recibida, detalle, registrada_por)
select '00000000-0000-0000-0000-00000000c0de', id, 'acceso', date '2026-10-15', 'Solicita copia de su expediente (sintético)', '00000000-0000-0000-0000-00000000a201' from pg_temp.sp where n = 10;
update piefirme.solicitudes_arco set estado = 'en_proceso' where tipo = 'acceso' and fecha_recibida = date '2026-10-15';

-- ═════════════════════ resumen de lo sembrado ═════════════════════
do $$
declare t text;
begin
  for t in select format('%s: %s', k, v) from (values
      ('pacientes', (select count(*) from piefirme.pacientes where notas_administrativas like 'SINT-A:%')),
      ('consultas cerradas', (select count(*) from piefirme.consultas where estado = 'cerrada')),
      ('consultas abiertas', (select count(*) from piefirme.consultas where estado <> 'cerrada')),
      ('planes', (select count(*) from piefirme.planes_tratamiento)),
      ('sesiones realizadas', (select count(*) from piefirme.sesiones_plan where estado = 'realizada')),
      ('valoraciones pie diabético', (select count(*) from piefirme.valoraciones_pie_diabetico)),
      ('órdenes de plantilla', (select count(*) from piefirme.ordenes_plantilla)),
      ('lotes de esterilización', (select count(*) from piefirme.lotes_esterilizacion)),
      ('fotos', (select count(*) from piefirme.fotos_clinicas)),
      ('quejas', (select count(*) from piefirme.quejas))) x(k, v) loop
    raise notice 'A_03 · %', t;
  end loop;
end $$;
