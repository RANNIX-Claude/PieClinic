-- D_04 · Semilla SINTÉTICA (dominio D): suscripción y pagos manuales de la clínica de ejemplo, una importación con IA en vista previa,
-- invitación pendiente, ticket de soporte, conversación del asistente y (si ya hay pacientes sembrados por el dominio A) CRM:
-- consentimientos, seguimientos, campaña en borrador y encuestas.
-- Debe existir antes: migraciones 050-059 y semilla D_01. Los planes ($400 / $1,000) ya los siembra la migración 056 (catálogo global).
-- El bloque CRM solo corre si piefirme.pacientes ya tiene filas de la organización de ejemplo; si no, se omite sin error.

-- ───────────── suscripción (plan por clínica) y pagos registrados a mano ─────────────
insert into piefirme.suscripciones (organizacion_id, plan_clave, estado, prueba_inicio, prueba_hasta, periodo_actual_desde, proximo_cobro, razon_social, rfc, regimen_fiscal, codigo_postal, correo_facturas, notas_rannix)
values ('00000000-0000-0000-0000-00000000c0de', 'por_clinica', 'activa', date '2026-08-01', date '2026-08-15', date '2026-10-01', date '2026-11-01',
        'Pie Clinic SA de CV (sintético)', 'PCL000000AA0', '601', '56600', 'facturas@ejemplo.invalid', 'Semilla sintética')
on conflict (organizacion_id) do nothing;

insert into piefirme.cobros_suscripcion (organizacion_id, suscripcion_id, periodo, plan_clave, unidades, importe_base, iva, estado, metodo_pago, fecha_pago, referencia, factura_folio)
select s.organizacion_id, s.id, v.periodo::date, 'por_clinica', 1, 1000, 160, v.estado, v.metodo, v.fecha::date, v.ref, v.folio
  from piefirme.suscripciones s,
       (values ('2026-08-01', 'pagada', 'transferencia', '2026-08-03', 'SPEI-SINT-0001', 'RNX-2026-0001'),
               ('2026-09-01', 'pagada', 'transferencia', '2026-09-02', 'SPEI-SINT-0002', 'RNX-2026-0002'),
               ('2026-10-01', 'pagada', 'deposito',      '2026-10-02', 'DEP-SINT-0003',  'RNX-2026-0003'),
               ('2026-11-01', 'proxima', null, null, null, null)) v(periodo, estado, metodo, fecha, ref, folio)
 where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
on conflict (suscripcion_id, periodo) do nothing;

-- invitación pendiente (el token en claro NO se guarda; este hash corresponde a un valor inventado)
insert into piefirme.invitaciones (organizacion_id, email, nombre, rol, token_hash)
values ('00000000-0000-0000-0000-00000000c0de', 'nueva.recepcion@ejemplo.invalid', 'Recepción nueva (sintético)', 'recepcion',
        encode(sha256(convert_to('semilla-sintetica-no-usar', 'UTF8')), 'hex'))
on conflict do nothing;

-- ticket de soporte
insert into piefirme.soporte_tickets (organizacion_id, asunto, descripcion, prioridad, estado)
select '00000000-0000-0000-0000-00000000c0de', 'Importar pacientes del sistema anterior', 'Ticket sintético de ejemplo', 'normal', 'abierto'
 where not exists (select 1 from piefirme.soporte_tickets where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and asunto = 'Importar pacientes del sistema anterior');

-- ───────────── importación de ejemplo (pacientes, IA en modo sintético, vista previa) ─────────────
do $$
declare v_imp uuid; v_org uuid := '00000000-0000-0000-0000-00000000c0de';
begin
  if exists (select 1 from piefirme.importaciones where organizacion_id = v_org) then return; end if;
  insert into piefirme.importaciones (organizacion_id, sede_id, tipo_datos, origen_sistema, archivo_nombre, archivo_path, archivo_bytes, hoja, total_filas, total_columnas,
                                    paso, estado, politica_duplicados, ia_modo, ia_proveedor, ia_propuesta, ia_propuesta_en)
  values (v_org, (select id from piefirme.sedes where organizacion_id = v_org order by clave limit 1), 'pacientes', 'Excel / CSV propio', 'pacientes_sinteticos.xlsx',
          v_org || '/ejemplo/pacientes_sinteticos.xlsx', 18432, 'Hoja1', 12, 7, 'vista_previa', 'vista_previa', 'combinar', 'sintetico', 'adaptador-sintetico',
          '{"proveedor":"adaptador-sintetico","modo":"sintetico","mapeos":[{"columna":"Nombre completo","campo_destino":"nombre","confianza":98},{"columna":"Cel","campo_destino":"celular","confianza":96},{"columna":"Nac.","campo_destino":"fecha_nacimiento","confianza":88},{"columna":"Correo","campo_destino":"email","confianza":99},{"columna":"Alergias","campo_destino":"alergias","confianza":72,"campo_clinico":true},{"columna":"Expediente viejo","campo_destino":null,"confianza":40}]}'::jsonb,
          now())
  returning id into v_imp;

  -- mapeos (los clínicos o de baja confianza quedan "revisar"; sin destino "elegir_campo")
  insert into piefirme.importacion_mapeos (organizacion_id, importacion_id, columna_archivo, ejemplo, campo_destino, confianza, transformacion, campo_clinico)
  values (v_org, v_imp, 'Nombre completo', 'ana lópez díaz', 'nombre', 98, 'Separar y capitalizar', false),
         (v_org, v_imp, 'Cel', '5510000001', 'celular', 96, null, false),
         (v_org, v_imp, 'Nac.', '14/03/68', 'fecha_nacimiento', 88, 'Año de 2 a 4 dígitos', false),
         (v_org, v_imp, 'Correo', 'ana@ejemplo.invalid', 'email', 99, null, false),
         (v_org, v_imp, 'Alergias', 'penicilina', 'alergias', 72, null, true),
         (v_org, v_imp, 'Expediente viejo', 'A-0045', null, 40, 'Guardar como folio anterior', false);
  update piefirme.importacion_mapeos set accion = 'aceptar' where importacion_id = v_imp and campo_destino in ('nombre', 'celular', 'email');

  -- 12 filas: 8 válidas, 2 advertencias, 1 error, 1 duplicado
  insert into piefirme.importacion_filas (organizacion_id, importacion_id, numero_fila, valores_originales, valores_normalizados, resultado, mensajes, decision)
  select v_org, v_imp, g, jsonb_build_object('Nombre completo', 'persona ' || g, 'Cel', '55100000' || lpad(g::text, 2, '0')),
         jsonb_build_object('nombre', 'Persona ' || g, 'celular', '55100000' || lpad(g::text, 2, '0')),
         case when g <= 8 then 'valido' when g in (9, 10) then 'advertencia' when g = 11 then 'error' else 'duplicado' end,
         case when g in (9, 10) then '[{"campo":"fecha_nacimiento","motivo":"año de 2 dígitos interpretado"}]'::jsonb
              when g = 11 then '[{"campo":"celular","motivo":"celular incompleto y correo inválido"}]'::jsonb
              when g = 12 then '[{"campo":"nombre","motivo":"posible duplicado de un paciente existente"}]'::jsonb else '[]'::jsonb end,
         case when g = 12 then 'combinar' end
    from generate_series(1, 12) g;
  update piefirme.importaciones set paso = 'vista_previa', estado = 'vista_previa', resumen = jsonb_build_object('validos', 8, 'advertencias', 2, 'errores', 1, 'duplicados', 1) where id = v_imp;
end $$;

-- ───────────── asistente de IA: una conversación de ejemplo sin datos clínicos ─────────────
-- (necesita un perfil de usuario; si la clínica de ejemplo aún no tiene perfiles, se omite)
do $$
declare v_org uuid := '00000000-0000-0000-0000-00000000c0de'; v_user uuid; v_conv uuid; v_msg uuid;
begin
  select id into v_user from piefirme.perfiles where organizacion_id = v_org and rol = 'administrador' limit 1;
  if v_user is null or exists (select 1 from piefirme.asistente_conversaciones where organizacion_id = v_org) then return; end if;
  insert into piefirme.asistente_conversaciones (organizacion_id, usuario_id, titulo) values (v_org, v_user, 'NPS por sede (sintético)') returning id into v_conv;
  insert into piefirme.asistente_mensajes (organizacion_id, conversacion_id, usuario_id, rol, contenido) values (v_org, v_conv, v_user, 'usuario', '¿Cómo va el NPS por sede este mes?');
  insert into piefirme.asistente_mensajes (organizacion_id, conversacion_id, usuario_id, rol, contenido, fuente, vistas_consultadas, modo_ia)
  values (v_org, v_conv, v_user, 'asistente', 'Respuesta sintética del adaptador de IA (sin llave).', 'vista prp_nps_mensual', array['prp_nps_mensual'], 'sintetico') returning id into v_msg;
  insert into piefirme.asistente_accesos_datos (organizacion_id, usuario_id, mensaje_id, vista, filas_devueltas) values (v_org, v_user, v_msg, 'prp_nps_mensual', 5);
end $$;

-- ───────────── CRM (solo si ya hay pacientes sintéticos de la clínica de ejemplo) ─────────────
do $$
declare v_org uuid := '00000000-0000-0000-0000-00000000c0de'; v_pac uuid[]; v_cam uuid; p uuid; i int := 0;
begin
  if to_regclass('piefirme.pacientes') is null then return; end if;
  select array_agg(id) into v_pac from (select id from piefirme.pacientes where organizacion_id = v_org order by created_at limit 6) x;
  if v_pac is null or exists (select 1 from piefirme.campanas where organizacion_id = v_org) then return; end if;

  foreach p in array v_pac loop
    i := i + 1;
    insert into piefirme.consentimientos_contacto (organizacion_id, paciente_id, tipo, canal, otorgado, fuente, version_texto)
    values (v_org, p, 'recordatorios', 'todos', true, 'registro', 'v1'),
           (v_org, p, 'comerciales', 'todos', i % 3 <> 0, 'registro', 'v1'),     -- 1 de cada 3 sin consentimiento comercial
           (v_org, p, 'encuestas', 'todos', true, 'registro', 'v1');
  end loop;

  insert into piefirme.campanas (organizacion_id, nombre, segmento, canal, mensaje)
  values (v_org, 'Recontacto de inactivos (sintético)', '{"inactivos_dias":180,"con_consentimiento":true}', 'whatsapp_correo',
          'Hola {{nombre}}, hace tiempo no te vemos. Agenda tu revisión: {{liga_cita}}') returning id into v_cam;
  insert into piefirme.campana_destinatarios (organizacion_id, campana_id, paciente_id) select v_org, v_cam, unnest(v_pac);

  foreach p in array v_pac[1:3] loop
    insert into piefirme.seguimientos_paciente (organizacion_id, paciente_id, motivo, detalle, canal, estado, fecha_compromiso)
    values (v_org, p, 'inactivo', 'Más de 180 días sin cita atendida (sintético)', 'whatsapp', 'pendiente', date '2026-10-28');
  end loop;

  -- encuestas NPS respondidas (promotores, pasivos y un detractor que avisa a Administración sin crear queja)
  i := 0;
  foreach p in array v_pac[1:4] loop
    i := i + 1;
    insert into piefirme.encuestas (organizacion_id, tipo, paciente_id, enviada_en) values (v_org, 'nps_post_visita', p, now() - interval '2 days');
    update piefirme.encuestas set calificacion = (array[10, 9, 7, 5])[i], comentario = 'Respuesta sintética'
     where organizacion_id = v_org and paciente_id = p and tipo = 'nps_post_visita' and calificacion is null;
  end loop;
end $$;
