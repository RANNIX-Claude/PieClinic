-- G_02 · Semilla SINTÉTICA V2: cursos con lecciones, evaluaciones, avance del personal de prueba y acervo de documentos.
-- Los textos son BORRADORES por validar por la clínica (guías operativas generales, no normas oficiales). Sin videos inventados:
--   las lecciones de video quedan con video_pendiente = true hasta que se grabe y se suba el enlace de YouTube (video_url).
-- Requiere: migraciones 064-072. Idempotente (ids deterministas). Marca: sintetico = true.
do $$
declare o constant uuid := '00000000-0000-0000-0000-00000000c0de';
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  if not exists (select 1 from piefirme.organizaciones where id = o) then raise notice 'G_02: falta la organización (corre D_01)'; return; end if;

  -- ───────────── cursos ─────────────
  insert into piefirme.cursos (id, organizacion_id, titulo, descripcion, categoria, cargos, obligatorio, duracion_min, orden, sintetico)
  select md5('G02:curso:' || v.k)::uuid, o, v.titulo, v.descr || ' (BORRADOR POR VALIDAR)', v.cat, v.cargos, v.oblig, v.dur, v.k, true
    from (values
      (1, 'Bienvenida y cultura de servicio', 'Quiénes somos, cómo recibimos al paciente y qué se espera de cada persona del equipo.', 'inducción', '{}'::text[], true, 25),
      (2, 'Higiene de manos y bioseguridad', 'Lavado de manos, uso de equipo de protección y manejo de residuos en consultorio.', 'seguridad', '{}'::text[], true, 30),
      (3, 'Esterilización y manejo de instrumental', 'Ciclo de limpieza, empaque, esterilización y trazabilidad del instrumental podológico.', 'clínico', array['podologo', 'asistente'], true, 40),
      (4, 'Recepción, agenda y atención al paciente', 'Cómo agendar, confirmar, reprogramar y atender llamadas y mensajes sin errores.', 'operación', array['recepcion', 'cajero', 'gerente'], false, 35),
      (5, 'Caja: apertura, cobro y corte', 'Procedimiento de apertura de turno, cobro con distintas formas de pago, devoluciones y corte.', 'operación', array['cajero', 'recepcion', 'gerente'], true, 40),
      (6, 'Inventario y salida PEPS', 'Recepción de mercancía, conteos, caducidades y la regla primeras entradas, primeras salidas.', 'operación', array['almacen', 'asistente', 'cajero', 'gerente'], false, 30),
      (7, 'Pie diabético: identificar y derivar', 'Señales de alerta en el pie de una persona con diabetes y cuándo derivar al médico.', 'clínico', array['podologo', 'asistente'], true, 45),
      (8, 'Liderazgo de sucursal', 'Cómo conducir al equipo, leer los indicadores de la sucursal y dar retroalimentación.', 'gestión', array['gerente', 'admin', 'direccion'], false, 50)
    ) v(k, titulo, descr, cat, cargos, oblig, dur)
  on conflict (id) do nothing;

  -- ───────────── lecciones (texto real; los videos quedan pendientes de grabar) ─────────────
  insert into piefirme.lecciones (id, organizacion_id, curso_id, orden, titulo, tipo, video_pendiente, contenido, duracion_min)
  select md5('G02:leccion:' || v.k || ':' || v.ord)::uuid, o, md5('G02:curso:' || v.k)::uuid, v.ord, v.titulo, v.tipo,
         v.tipo = 'video', v.contenido, v.dur
    from (values
      (1, 1, 'Quiénes somos y cómo atendemos', 'texto', 'Somos una clínica de podología: cuidamos la salud de los pies de personas de todas las edades. Cada visita debe sentirse segura, puntual y respetuosa. Todo el equipo, sea cual sea su cargo, participa en esa experiencia: quien abre la puerta, quien cobra, quien atiende en cabina y quien surte el material.', 8),
      (1, 2, 'Recorrido por la clínica (video)', 'video', null, 7),
      (1, 3, 'Los cinco momentos de la visita', 'texto', E'1. Antes: la cita se confirma y el paciente sabe qué llevar.\n2. Llegada: se le saluda por su nombre en menos de un minuto.\n3. Atención: se explica lo que se hará y se pide su consentimiento.\n4. Cobro: el total se dice con claridad antes de cobrar.\n5. Después: se agenda el seguimiento y, a los pocos días, se le pregunta cómo se siente.', 10),
      (2, 1, 'Lavado de manos paso a paso', 'texto', E'Se lava antes y después de cada paciente y siempre que haya contacto con sangre o secreciones. Humedecer, enjabonar 40 a 60 segundos (palmas, dorso, entre dedos, pulgares, uñas y muñecas), enjuagar, secar con toalla desechable y cerrar la llave con la toalla. Si no hay suciedad visible se puede usar gel alcoholado al 70 por ciento durante 20 a 30 segundos.', 10),
      (2, 2, 'Equipo de protección personal', 'texto', E'Guantes nuevos para cada paciente, cubrebocas bien ajustado, lentes o careta cuando haya posibilidad de salpicadura y bata limpia. El equipo se retira sin tocar la parte externa y se desecha en el contenedor que corresponda. Nunca se sale al área de recepción con guantes puestos.', 10),
      (2, 3, 'Residuos punzocortantes (video)', 'video', null, 10),
      (2, 4, 'Qué hacer ante un pinchazo o salpicadura', 'texto', E'Lavar de inmediato con agua y jabón, no exprimir ni succionar la herida, avisar al gerente, registrar el incidente en la bitácora y acudir a valoración médica el mismo día. Anotar qué instrumento fue y si el paciente tenía algún padecimiento informado.', 8),
      (3, 1, 'Ciclo del instrumental', 'texto', E'Instrumental usado: remojo en solución desinfectante, cepillado con agua corriente, enjuague, secado, empaque en bolsa de grado médico con indicador, esterilización en autoclave y almacenamiento en área limpia. Nunca se mezcla instrumental limpio con sucio.', 12),
      (3, 2, 'Autoclave: carga y registro', 'texto', E'No sobrecargar la cámara, dejar espacio para que circule el vapor, verificar temperatura y tiempo del ciclo y revisar el indicador químico al abrir. Cada ciclo se registra con fecha, número de carga, responsable y resultado. Un paquete húmedo o con indicador sin cambio se considera no estéril.', 12),
      (3, 3, 'Caducidad del material estéril', 'texto', E'Cada paquete lleva fecha de esterilización y de caducidad según la política de la clínica. Antes de usarlo se revisa que la bolsa esté íntegra, seca y sin manchas. Ante la duda, se reprocesa.', 8),
      (3, 4, 'Demostración en vivo (video)', 'video', null, 8),
      (4, 1, 'Agendar y confirmar', 'texto', E'Al agendar se confirman nombre completo, teléfono, servicio y sede. Se avisa la política de cancelación y el anticipo si aplica. La confirmación se hace con anticipación razonable y se registra en la cita; si no responde, se intenta por un segundo canal antes de liberar el horario.', 10),
      (4, 2, 'Reprogramar y cancelar', 'texto', E'Una reprogramación dentro del plazo no genera costo. Fuera del plazo se explica la política con amabilidad y se ofrece la fecha más cercana. Toda cancelación lleva motivo registrado; así se detectan patrones.', 10),
      (4, 3, 'Llamadas y mensajes difíciles', 'texto', E'Escuchar sin interrumpir, repetir el problema con las propias palabras de la persona, ofrecer una solución concreta y un plazo, y dar seguimiento. Si no puedes resolver, escala al gerente en el momento y no prometas lo que no controlas.', 10),
      (4, 4, 'Atención en el mostrador (video)', 'video', null, 5),
      (5, 1, 'Apertura de turno', 'texto', E'Contar el fondo inicial junto con la persona que entrega, registrar el monto y confirmar que el equipo de cobro funciona. Ninguna venta se cobra antes de abrir turno.', 8),
      (5, 2, 'Cobrar con distintas formas de pago', 'texto', E'Se dice el total antes de cobrar. Efectivo: contar frente al cliente y dar cambio exacto. Tarjeta: verificar el voucher. Transferencia: confirmar el depósito antes de entregar el comprobante. Si el cliente pide factura, se capturan sus datos fiscales en ese momento.', 12),
      (5, 3, 'Devoluciones y cancelaciones', 'texto', E'Una cancelación o devolución requiere motivo, comprobante y autorización del gerente. Nunca se borra una venta: se cancela dejando rastro. Si el periodo ya está cerrado, solo la administración puede autorizarlo.', 10),
      (5, 4, 'Corte de caja', 'texto', E'Al cierre se cuenta cada forma de pago, se compara contra lo esperado por el sistema y se registra la diferencia con su explicación. Una diferencia no se corrige moviendo cifras: se documenta y se investiga al día siguiente.', 10),
      (6, 1, 'Recepción de mercancía', 'texto', E'Se cuenta contra la orden de compra y la factura, se revisan empaques y fechas de caducidad y se registra la entrada con su lote. Lo que llega incompleto o dañado se anota en el momento y se avisa al proveedor.', 10),
      (6, 2, 'Regla PEPS', 'texto', E'Primeras entradas, primeras salidas: lo que caduca antes se acomoda al frente y sale primero. Cada anaquel se ordena por fecha de caducidad y se revisa al menos una vez por semana.', 8),
      (6, 3, 'Conteos y diferencias', 'texto', E'El conteo físico se compara con el sistema. Una diferencia se revisa primero por errores de captura o traspasos pendientes; solo después se ajusta con motivo y autorización. Los ajustes frecuentes del mismo producto se reportan al gerente.', 12),
      (7, 1, 'Señales de alerta en el pie diabético', 'texto', E'Heridas que no cierran, enrojecimiento o calor local, hinchazón, mal olor, uñas con sangrado debajo, piel muy seca con grietas, pérdida de sensibilidad o cambios de color. Ante cualquiera de estas señales se registra con fotografía autorizada y se informa al podólogo responsable.', 15),
      (7, 2, 'Cuándo derivar al médico', 'texto', E'Se deriva el mismo día cuando hay úlcera con secreción, fiebre, enrojecimiento que avanza o dolor intenso nuevo. Se entrega al paciente una nota clara con lo observado y se agenda un seguimiento. Esta guía no sustituye el criterio clínico del podólogo.', 12),
      (7, 3, 'Revisión del pie paso a paso (video)', 'video', null, 18),
      (8, 1, 'Leer los indicadores de la sucursal', 'texto', E'Cada semana revisar ventas contra meta, ocupación de agenda, no asistencias y evaluaciones. Un indicador solo sirve si lleva una acción: qué voy a cambiar esta semana y quién lo hace.', 15),
      (8, 2, 'Retroalimentación efectiva', 'texto', E'Hablar de hechos concretos y recientes, reconocer primero lo que salió bien, acordar un cambio medible y dar seguimiento en fecha. La retroalimentación se da en privado; el reconocimiento, en público.', 15),
      (8, 3, 'Conducir la junta semanal (video)', 'video', null, 20)
    ) v(k, ord, titulo, tipo, contenido, dur)
  on conflict (id) do nothing;

  -- ───────────── evaluaciones opcionales ─────────────
  insert into piefirme.curso_evaluaciones (id, organizacion_id, curso_id, orden, pregunta, opciones, correcta)
  select md5('G02:eval:' || v.k || ':' || v.ord)::uuid, o, md5('G02:curso:' || v.k)::uuid, v.ord, v.pregunta, v.opciones::jsonb, v.correcta
    from (values
      (2, 1, '¿Cuánto debe durar como mínimo el enjabonado de manos?', '["10 segundos","40 a 60 segundos","5 minutos"]', 1),
      (2, 2, '¿Cuándo se cambian los guantes?', '["Al terminar el día","Con cada paciente","Solo si se rompen"]', 1),
      (2, 3, 'Tras un pinchazo con un instrumento usado, lo primero es…', '["Exprimir la herida","Lavar con agua y jabón y avisar","Esperar a ver si duele"]', 1),
      (2, 4, '¿En qué momento se retira el equipo de protección para ir a recepción?', '["Nunca","Antes de salir del área clínica","Al final de la semana"]', 1),
      (5, 1, '¿Cuándo se dice el total al cliente?', '["Después de cobrar","Antes de cobrar","Solo si lo pregunta"]', 1),
      (5, 2, 'Una diferencia en el corte de caja se…', '["Corrige moviendo cifras","Documenta y se investiga","Ignora si es pequeña"]', 1),
      (5, 3, '¿Quién autoriza una devolución?', '["Cualquier cajero","El gerente","Nadie, no se permiten"]', 1),
      (5, 4, 'Una transferencia se considera pagada cuando…', '["El cliente lo dice","Se confirma el depósito","Manda una captura"]', 1)
    ) v(k, ord, pregunta, opciones, correcta)
  on conflict (id) do nothing;

  -- ───────────── avance del personal de prueba con sesión (según su cargo) ─────────────
  insert into piefirme.curso_avance (id, organizacion_id, perfil_id, curso_id, leccion_id, completado_en)
  select md5('G02:avance:' || p.id || ':' || l.id)::uuid, o, p.id, c.id, l.id, now() - make_interval(days => 1 + abs(hashtext(p.id::text || l.id::text)) % 60)
    from piefirme.perfiles p
    join piefirme.cursos c on c.organizacion_id = o and c.sintetico and c.activo
                          and (c.cargos = '{}' or coalesce(p.cargo, case p.rol when 'administrador' then 'admin' when 'podologo' then 'podologo' else 'recepcion' end) = any(c.cargos))
    join piefirme.lecciones l on l.curso_id = c.id
   where p.organizacion_id = o and p.activo
     and abs(hashtext(p.id::text || c.id::text)) % 100 < case when c.obligatorio then 88 else 55 end                       -- quién avanzó en ese curso
     and l.orden <= 1 + abs(hashtext(p.id::text || c.id::text || 'n')) % (select count(*) from piefirme.lecciones x where x.curso_id = c.id)   -- hasta qué lección
  on conflict (perfil_id, leccion_id) do nothing;

  -- resultados de evaluación para quien terminó los cursos con examen (2 y 5)
  insert into piefirme.curso_resultados (id, organizacion_id, perfil_id, curso_id, intento, calificacion, aprobado, realizado_en)
  select md5('G02:res:' || a.perfil_id || ':' || a.curso_id)::uuid, o, a.perfil_id, a.curso_id, 1,
         50 + abs(hashtext(a.perfil_id::text || a.curso_id::text)) % 51,
         50 + abs(hashtext(a.perfil_id::text || a.curso_id::text)) % 51 >= 70, max(a.completado_en)
    from piefirme.curso_avance a
   where a.organizacion_id = o and a.curso_id in (md5('G02:curso:2')::uuid, md5('G02:curso:5')::uuid)
   group by a.perfil_id, a.curso_id
  having count(*) = (select count(*) from piefirme.lecciones x where x.curso_id = a.curso_id)
  on conflict (perfil_id, curso_id, intento) do nothing;

  -- ───────────── acervo (textos de consulta; BORRADOR POR VALIDAR) ─────────────
  insert into piefirme.acervo_documentos (id, organizacion_id, titulo, tipo, contenido, categoria, etiquetas, cargos, version, estado, sintetico)
  select md5('G02:acervo:' || v.k)::uuid, o, v.titulo, v.tipo, v.contenido || E'\n\n[BORRADOR POR VALIDAR por la clínica antes de usarse como norma interna.]', v.cat, v.etiquetas, v.cargos, '0.9', 'vigente', true
    from (values
      (1, 'Manual de bienvenida al equipo', 'manual', E'Horario: llega 10 minutos antes de tu turno y registra tu entrada en el checador. Uniforme limpio y calzado cerrado. El celular se usa solo para temas de trabajo mientras atiendes. Si vas a faltar o llegar tarde, avisa a tu gerente antes de la hora de entrada. Tu gerente es tu primer contacto para cualquier duda.', 'inducción', array['bienvenida', 'equipo'], '{}'::text[]),
      (2, 'Protocolo de limpieza de cabina', 'procedimiento', E'Entre pacientes: retirar material usado, desinfectar camilla, lámpara, mesa y superficies de contacto con solución aprobada, cambiar el papel de la camilla y ventilar. Al cierre: desinfección general, trapeado, vaciado de residuos y registro en la bitácora de limpieza. Nunca se rocía desinfectante sobre instrumental limpio.', 'seguridad', array['limpieza', 'cabina'], '{}'::text[]),
      (3, 'Política de cancelaciones y reprogramaciones', 'politica', E'El paciente puede reprogramar sin costo dentro del plazo definido por la clínica (parámetro de configuración). Fuera de plazo se informa la política y se registra el motivo. La no asistencia sin aviso se registra como tal. El anticipo se aplica conforme a la política vigente y la decisión de excepciones es del gerente.', 'operación', array['citas', 'anticipo'], array['recepcion', 'cajero', 'gerente', 'admin', 'direccion']),
      (4, 'Procedimiento de apertura y cierre de caja', 'procedimiento', E'Apertura: contar fondo, registrar monto, probar terminal. Durante el día: cada venta con folio, forma de pago y vendedor. Cierre: corte por forma de pago, comparar contra sistema, documentar diferencias, entregar el efectivo con firma de quien recibe. Los cortes de periodos cerrados no se modifican.', 'operación', array['caja', 'corte'], array['cajero', 'recepcion', 'gerente', 'admin']),
      (5, 'Guía de entrega y recepción de turno', 'guia', E'Quien entrega deja: pendientes de agenda, pacientes en espera, efectivo contado, incidencias y material por surtir. Quien recibe confirma cada punto y firma. Nada se da por entendido: si no está escrito, no se entregó.', 'operación', array['turno', 'entrega'], array['cajero', 'recepcion', 'asistente', 'gerente']),
      (6, 'Manejo de producto: caducidades y PEPS', 'procedimiento', E'Todo producto entra con lote y caducidad. Se acomoda con lo más próximo a caducar al frente. Una vez por semana se revisa caducidad a 60 días y se avisa al gerente para promoción o traspaso. Producto caducado se retira, se registra la merma y se separa en un área marcada.', 'inventario', array['peps', 'caducidad', 'merma'], array['almacen', 'asistente', 'cajero', 'gerente', 'admin']),
      (7, 'Esterilización: bitácora de ciclos', 'formato', E'Campos de la bitácora: fecha, hora, número de carga, equipo, contenido, temperatura y tiempo del ciclo, resultado del indicador, responsable y observaciones. Toda carga con indicador sin cambio se reprocesa y se anota. La bitácora se conserva y está disponible para revisión.', 'seguridad', array['esterilizacion', 'bitacora'], array['podologo', 'asistente', 'gerente', 'admin']),
      (8, 'Preguntas frecuentes de pacientes', 'guia', E'¿Duele el tratamiento? Un tratamiento podológico no debería doler; si hay molestia el paciente avisa y se ajusta. ¿Cada cuánto debo venir? Depende del caso; el podólogo lo indica al final de la consulta. ¿Qué llevo a mi primera cita? Identificación, calzado de uso diario y, si aplica, estudios o recetas. ¿Atienden a personas con diabetes? Sí, con valoración especial del pie.', 'atención', array['pacientes', 'faq'], '{}'::text[]),
      (9, 'Glosario podológico básico', 'texto', E'Onicocriptosis: uña encarnada. Onicomicosis: infección de la uña por hongos. Hiperqueratosis: engrosamiento de la piel por presión o fricción. Helomas: callosidades con núcleo, conocidas como ojos de gallo. Fascitis plantar: inflamación de la banda de tejido bajo el pie. Plantilla ortopédica: soporte hecho a la medida del pie del paciente.', 'clínico', array['glosario', 'terminologia'], '{}'::text[]),
      (10, 'Seguridad y primeros auxilios básicos', 'guia', E'Ante un mareo o desmayo: acostar a la persona con las piernas elevadas, aflojar ropa, no darle de beber hasta que reaccione y avisar al podólogo y al gerente. Ante sangrado: presión directa con gasa limpia. Teléfonos de emergencia visibles en cada sucursal. Todo incidente se registra.', 'seguridad', array['primeros auxilios', 'emergencia'], '{}'::text[]),
      (11, 'Uso del checador y de «Trabajando en»', 'guia', E'Al llegar, elige en el encabezado la sucursal donde trabajas ese día y registra tu entrada. Al terminar, registra tu salida. Si cambias de sucursal durante el día, cámbiala en el encabezado antes de vender o registrar movimientos: de ahí salen tus ventas, bonos e inventario. Olvidos de checada se justifican con tu gerente el mismo día.', 'operación', array['checador', 'asistencia', 'sucursal'], '{}'::text[]),
      (12, 'Cómo se calculan los bonos', 'guia', E'Existen bonos individuales (por tus ventas atribuidas) y de sucursal (por cumplimiento de la meta del mes). Cada esquema indica base, escalones y condiciones como asistencia mínima. Tu venta cuenta para la sucursal donde trabajabas ese día. Puedes consultar el detalle de las ventas atribuidas en tu pantalla de bonos.', 'desempeño', array['bonos', 'metas'], '{}'::text[])
    ) v(k, titulo, tipo, contenido, cat, etiquetas, cargos)
  on conflict (id) do nothing;
end $$;
