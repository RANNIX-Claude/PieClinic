-- G_06 · Semilla SINTÉTICA V2: hilos de mensajes (generales, por rol, por sucursal y directos) con mensajes y lecturas, correo interno (40) y feed (24 publicaciones
-- con reacciones y comentarios) entre los usuarios de prueba REALES de la organización (perfiles existentes; no crea usuarios).
-- Requiere: migraciones 070, G_01 (cargos de perfiles). Si hay menos de 2 perfiles, no hace nada. Idempotente (ids deterministas) · marca: sintetico = true.
do $$
declare
  o constant uuid := '00000000-0000-0000-0000-00000000c0de';
  v_all uuid[]; v_adm uuid[]; v_pod uuid[]; v_rec uuid[]; v_creador uuid; a uuid; b uuid; s record;
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  select array_agg(id order by email) into v_all from piefirme.perfiles where organizacion_id = o and activo;
  select array_agg(id order by email) into v_adm from piefirme.perfiles where organizacion_id = o and activo and rol = 'administrador';
  select array_agg(id order by email) into v_pod from piefirme.perfiles where organizacion_id = o and activo and rol = 'podologo';
  select array_agg(id order by email) into v_rec from piefirme.perfiles where organizacion_id = o and activo and rol = 'recepcion';
  if coalesce(cardinality(v_all), 0) < 2 or coalesce(cardinality(v_adm), 0) < 1 then raise notice 'G_06: faltan perfiles de prueba'; return; end if;
  select id into v_creador from piefirme.perfiles where organizacion_id = o and email = 'm@g.com';
  v_creador := coalesce(v_creador, v_adm[1]);

  -- ───────────── hilos ─────────────
  insert into piefirme.com_hilos (id, organizacion_id, tipo, nombre, sede_id, cargo, creado_por, sintetico)
  select md5('G06:hilo:' || x.k)::uuid, o, x.tipo, x.nombre, x.sede, x.cargo, v_creador, true
    from (values ('general', 'grupo', 'Anuncios generales', null::uuid, null::text), ('gerencia', 'grupo', 'Administración y gerencia', null, null),
                 ('podologos', 'rol', 'Podólogos', null, 'podologo'), ('recepcion', 'rol', 'Recepción y caja', null, 'recepcion')) x(k, tipo, nombre, sede, cargo)
  on conflict (id) do nothing;
  insert into piefirme.com_hilos (id, organizacion_id, tipo, nombre, sede_id, creado_por, sintetico)
  select md5('G06:hilo:suc:' || sd.clave)::uuid, o, 'sucursal', 'Sucursal ' || sd.nombre, sd.id, v_creador, true
    from piefirme.sedes sd where sd.organizacion_id = o and sd.clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN', 'POL', 'COY')
  on conflict (id) do nothing;

  -- miembros de los hilos de grupo/rol
  insert into piefirme.com_hilo_miembros (organizacion_id, hilo_id, perfil_id, rol_en_hilo)
  select o, md5('G06:hilo:general')::uuid, p, case when p = any(v_adm) then 'admin' else 'miembro' end from unnest(v_all) p
  on conflict (hilo_id, perfil_id) do nothing;
  insert into piefirme.com_hilo_miembros (organizacion_id, hilo_id, perfil_id, rol_en_hilo)
  select o, md5('G06:hilo:gerencia')::uuid, p, 'admin' from unnest(v_adm) p
  on conflict (hilo_id, perfil_id) do nothing;
  insert into piefirme.com_hilo_miembros (organizacion_id, hilo_id, perfil_id)
  select o, md5('G06:hilo:podologos')::uuid, p from unnest(v_pod || v_adm[1:1]) p
  on conflict (hilo_id, perfil_id) do nothing;
  insert into piefirme.com_hilo_miembros (organizacion_id, hilo_id, perfil_id)
  select o, md5('G06:hilo:recepcion')::uuid, p from unnest(v_rec || v_adm[1:1]) p
  on conflict (hilo_id, perfil_id) do nothing;
  -- miembros de hilos de sucursal: quien tiene esa sede en su perfil (o todas) + administración
  insert into piefirme.com_hilo_miembros (organizacion_id, hilo_id, perfil_id)
  select distinct o, h.id, p.id
    from piefirme.com_hilos h
    join piefirme.perfiles p on p.organizacion_id = o and p.activo
     and (h.sede_id = any(p.sedes) or p.rol = 'administrador')
   where h.organizacion_id = o and h.tipo = 'sucursal' and h.sintetico
  on conflict (hilo_id, perfil_id) do nothing;

  -- hilos directos entre cuentas de prueba (solo si ambas existen)
  for s in select * from (values ('m@g.com', 'adm@g.com'), ('r@g.com', 'r1@g.com'), ('p@g.com', 'p1@g.com'), ('adm@g.com', 'r1@g.com'), ('a@g.com', 'm@g.com'), ('p@g.com', 'r@g.com')) t(e1, e2) loop
    select id into a from piefirme.perfiles where organizacion_id = o and email = s.e1;
    select id into b from piefirme.perfiles where organizacion_id = o and email = s.e2;
    continue when a is null or b is null;
    insert into piefirme.com_hilos (id, organizacion_id, tipo, nombre, creado_por, sintetico)
    values (md5('G06:hilo:dm:' || s.e1 || s.e2)::uuid, o, 'directo', null, a, true) on conflict (id) do nothing;
    insert into piefirme.com_hilo_miembros (organizacion_id, hilo_id, perfil_id)
    values (o, md5('G06:hilo:dm:' || s.e1 || s.e2)::uuid, a), (o, md5('G06:hilo:dm:' || s.e1 || s.e2)::uuid, b) on conflict (hilo_id, perfil_id) do nothing;
  end loop;

  -- ───────────── mensajes: 6 a 14 por hilo, últimos 30 días, autores entre los miembros ─────────────
  insert into piefirme.com_mensajes (id, organizacion_id, hilo_id, autor_id, texto, created_at)
  select md5('G06:msg:' || h.id || ':' || n)::uuid, o, h.id, m.perfil_id, t.texto,
         now() - make_interval(days => 30 - (n * 30 / 14)) - make_interval(mins => (abs(hashtext(h.id::text || n)) % 540))
    from piefirme.com_hilos h
    cross join generate_series(1, 14) n
    join lateral (select array_agg(perfil_id order by perfil_id) arr from piefirme.com_hilo_miembros where hilo_id = h.id) ms on true
    join lateral (select (ms.arr)[1 + abs(hashtext(h.id::text || n || 'a')) % cardinality(ms.arr)] as perfil_id) m on true
    join lateral (select (case h.tipo
        when 'directo' then (array['¿Pudiste revisar lo que te mandé ayer?', 'Sí, ya lo vi. Te confirmo en la tarde.', 'Perfecto, gracias.', 'Oye, ¿quién cubre el sábado en la sucursal?', 'Yo cubro el turno de la mañana.', 'Listo, queda anotado.', '¿Me ayudas a validar el corte de ayer?', 'Claro, nos vemos a las cinco en caja.'])
        when 'sucursal' then (array['Buen día equipo, hoy tenemos la agenda casi llena; lleguemos con tiempo.', 'Recuerden registrar la bitácora de esterilización al terminar cada ciclo.', 'Se acabaron las gasas del consultorio 2, ¿alcanzamos a pedir hoy?', 'Ya llegó el pedido de plantillas, lo reviso y aviso.', 'Un paciente preguntó por pie diabético, le agendé valoración el jueves.', 'Corte de ayer sin diferencias, buen trabajo.', 'Mañana hay junta de 9:00 a 9:15, por favor puntuales.', 'Gracias por cubrir el turno ayer.'])
        when 'rol' then (array['Recuerden confirmar con el paciente antes de iniciar cualquier procedimiento.', 'Se actualizó la guía de esterilización en el acervo, léanla por favor.', '¿Alguien tiene un caso de uña encarnada recurrente para comentar?', 'Les recuerdo capturar el diagnóstico antes de cerrar la consulta.', 'Compartí en el acervo la lista de señales de alerta del pie diabético.', 'Gracias, la reviso hoy.'])
        else (array['Les comparto el calendario de la semana. Cualquier cambio me avisan.', 'Gracias a todos por el cierre del mes; cumplimos la meta en varias sucursales.', 'Recuerden que el checador se registra al llegar y al salir.', 'Se publicó un nuevo curso de capacitación; el avance se ve en su pantalla.', 'Reunión de gerentes el lunes a las 10:00 por videollamada.', 'Por favor revisen sus bonos del mes en la pantalla correspondiente.', 'Se cambió el proveedor de gasas; avisen si notan diferencias de calidad.'])
      end) as arr) tx on true
    join lateral (select tx.arr[1 + abs(hashtext(h.id::text || n || 't')) % cardinality(tx.arr)] as texto) t on true
   where h.organizacion_id = o and h.sintetico and n <= 6 + abs(hashtext(h.id::text)) % 9 and cardinality(ms.arr) > 0
  on conflict (id) do nothing;

  -- lecturas: casi todos leyeron lo antiguo; lo de las últimas 48 h queda parcialmente sin leer
  insert into piefirme.com_mensaje_lecturas (organizacion_id, mensaje_id, perfil_id, leido_en)
  select o, m.id, mi.perfil_id, m.created_at + make_interval(mins => 5 + abs(hashtext(m.id::text || mi.perfil_id)) % 600)
    from piefirme.com_mensajes m
    join piefirme.com_hilo_miembros mi on mi.hilo_id = m.hilo_id and mi.perfil_id <> m.autor_id
   where m.organizacion_id = o and exists (select 1 from piefirme.com_hilos h where h.id = m.hilo_id and h.sintetico)
     and abs(hashtext(m.id::text || mi.perfil_id)) % 100 < (case when m.created_at < now() - interval '2 days' then 88 else 40 end)
  on conflict (mensaje_id, perfil_id) do nothing;

  -- ───────────── correo interno: 40 correos ─────────────
  insert into piefirme.correos_internos (id, organizacion_id, de_perfil_id, asunto, cuerpo, borrador, enviado_en, sintetico, created_at)
  select md5('G06:correo:' || k)::uuid, o, v_adm[1 + abs(hashtext('de' || k)) % cardinality(v_adm)], t.asunto, t.cuerpo, false,
         now() - make_interval(days => 40 - k) - make_interval(mins => abs(hashtext('h' || k)) % 600), true, now() - make_interval(days => 40 - k)
    from generate_series(1, 40) k
    join (values (1, 'Calendario de vacaciones de fin de año', 'Les comparto el calendario preliminar. Revisen sus fechas y respondan este correo antes del viernes si necesitan algún cambio.'), (2, 'Resultados del cierre de mes', 'Adjunto el resumen: ventas contra meta por sucursal y evaluaciones. Felicidades a los equipos que superaron la meta.'), (3, 'Actualización del protocolo de esterilización', 'Se actualizó la guía en el acervo. Es obligatorio que todo el personal clínico la lea y complete el curso correspondiente.'), (4, 'Cambio de proveedor de material de curación', 'A partir del próximo pedido compraremos con un nuevo proveedor. Avisen a su gerente cualquier diferencia de calidad.'), (5, 'Recordatorio: registro de asistencia', 'Recuerden registrar entrada y salida en el checador. Los olvidos se justifican con su gerente el mismo día.'), (6, 'Auditoría de inventario de la semana', 'Cada sucursal realizará su auditoría con fotografías de anaqueles. Se pide subir las evidencias antes del viernes.'), (7, 'Nuevo curso disponible: Caja, apertura y corte', 'Ya está publicado en Capacitación. Es obligatorio para cajeros y recomendado para recepción.'), (8, 'Felicitación por la evaluación de pacientes', 'La sucursal obtuvo una de las mejores calificaciones del trimestre. Gracias por el trabajo constante.')) t(i, asunto, cuerpo) on t.i = 1 + (k * 3) % 8
   where exists (select 1 from piefirme.perfiles where organizacion_id = o)
  on conflict (id) do nothing;
  -- algunos borradores del administrador de prueba
  insert into piefirme.correos_internos (id, organizacion_id, de_perfil_id, asunto, cuerpo, borrador, sintetico)
  select md5('G06:borrador:' || n)::uuid, o, v_creador, t.asunto, t.cuerpo, true, true
    from generate_series(1, 2) n
    cross join lateral (select * from (values (1, 'Propuesta de horarios para temporada alta', 'Borrador: horarios extendidos del 15 al 31 de diciembre. Pendiente de validar con gerentes.'), (2, 'Invitación a la comida de fin de año', 'Borrador: sábado por la tarde, sucursal central. Pendiente de confirmar lugar.')) q(i, asunto, cuerpo) where q.i = n) t
  on conflict (id) do nothing;

  -- destinatarios: 1 «para» + 1 a 3 más, y un «cc» de vez en cuando
  insert into piefirme.correo_destinatarios (organizacion_id, correo_id, perfil_id, tipo, leido_en, etiquetas, destacado)
  select o, c.id, v_all[1 + abs(hashtext(c.id::text || d)) % cardinality(v_all)], case when d = 3 then 'cc' else 'para' end,
         case when abs(hashtext(c.id::text || d || 'l')) % 100 < 70 or c.enviado_en < now() - interval '15 days' then c.enviado_en + make_interval(hours => 1 + abs(hashtext(c.id::text || d)) % 30) end,
         case abs(hashtext(c.id::text || d || 'e')) % 6 when 0 then array['importante'] when 1 then array['rh'] when 2 then array['finanzas'] when 3 then array['operacion'] else '{}'::text[] end,
         abs(hashtext(c.id::text || d || 'f')) % 9 = 0
    from piefirme.correos_internos c cross join generate_series(1, 4) d
   where c.organizacion_id = o and c.sintetico and d <= 1 + abs(hashtext(c.id::text)) % 4
     and v_all[1 + abs(hashtext(c.id::text || d)) % cardinality(v_all)] <> c.de_perfil_id
  on conflict (correo_id, perfil_id) do nothing;
  -- ───────────── feed: 24 publicaciones con reacciones y comentarios ─────────────
  insert into piefirme.feed_publicaciones (id, organizacion_id, autor_id, tipo, titulo, texto, fijado, alcance_sede_id, reconocido_perfil_id, evento_fecha, sintetico, publicada_en)
  select md5('G06:feed:' || k)::uuid, o,
         case when t.tipo in ('aviso', 'evento', 'reconocimiento') then v_adm[1 + abs(hashtext('fa' || k)) % cardinality(v_adm)] else v_all[1 + abs(hashtext('fb' || k)) % cardinality(v_all)] end,
         t.tipo, t.titulo, t.texto, (k in (1, 9)),
         case when k % 5 = 0 then (select id from piefirme.sedes where organizacion_id = o and clave = 'CHA') end,
         case when t.tipo = 'reconocimiento' then v_all[1 + abs(hashtext('fr' || k)) % cardinality(v_all)] end,
         case when t.tipo = 'evento' then now() + make_interval(days => 3 + k % 20) end, true,
         now() - make_interval(days => 28 - k) - make_interval(mins => abs(hashtext('fp' || k)) % 600)
    from generate_series(1, 24) k
    join (values (1, 'aviso', 'Nuevo horario del checador', 'A partir del lunes el checador se registra desde la aplicación; elijan primero la sucursal donde trabajan ese día.'), (2, 'logro', 'Superamos la meta del mes', 'Gracias al equipo por un mes de cifras muy buenas. Cada venta y cada sonrisa del paciente cuenta.'), (3, 'reconocimiento', 'Reconocimiento por atención al paciente', 'Varios pacientes mencionaron la paciencia y claridad con la que explica los tratamientos. ¡Gracias!'), (4, 'evento', 'Capacitación presencial de pie diabético', 'Sesión práctica con casos reales. Es obligatoria para el personal clínico; habrá café y material impreso.'), (5, 'foto', 'Equipo de la sucursal en la junta del lunes', 'Así arrancamos la semana. Gracias por la actitud de todos.'), (6, 'aviso', 'Cambio de proveedor de material', 'Se actualiza el proveedor de gasas y guantes. Avisen a su gerente si notan alguna diferencia.'), (7, 'logro', 'Cero diferencias en el corte de caja', 'Tres semanas seguidas sin diferencias. Excelente trabajo en caja y recepción.'), (8, 'evento', 'Comida de fin de año', 'Nos reuniremos para cerrar el año. Pronto compartiremos lugar y hora.')) t(i, tipo, titulo, texto) on t.i = 1 + (k * 5) % 8
  on conflict (id) do nothing;
  insert into piefirme.feed_reacciones (organizacion_id, publicacion_id, perfil_id, emoji)
  select o, f.id, v_all[1 + abs(hashtext(f.id::text || r)) % cardinality(v_all)], (array['👍', '👏', '❤️', '🎉'])[1 + abs(hashtext(f.id::text || r || 'e')) % 4]
    from piefirme.feed_publicaciones f cross join generate_series(1, 9) r
   where f.organizacion_id = o and f.sintetico and r <= 2 + abs(hashtext(f.id::text)) % 8
  on conflict (publicacion_id, perfil_id, emoji) do nothing;
  insert into piefirme.feed_comentarios (id, organizacion_id, publicacion_id, autor_id, texto, created_at)
  select md5('G06:fc:' || f.id || ':' || c)::uuid, o, f.id, v_all[1 + abs(hashtext(f.id::text || c || 'c')) % cardinality(v_all)],
         (array['¡Felicidades a todos!', 'Gracias por compartirlo.', 'Muy bien equipo, así se hace.', 'Ahí estaremos.', 'Enhorabuena, se lo merecen.'])[1 + abs(hashtext(f.id::text || c || 't')) % 5],
         f.publicada_en + make_interval(hours => 1 + c * 5)
    from piefirme.feed_publicaciones f cross join generate_series(1, 4) c
   where f.organizacion_id = o and f.sintetico and c <= abs(hashtext(f.id::text)) % 5
  on conflict (id) do nothing;
end $$;
