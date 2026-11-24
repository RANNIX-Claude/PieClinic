-- 071 · V2 · Vistas prp_* de todo lo nuevo (el frontend lee de vistas y escribe en tablas base). Todas security_invoker = true:
-- cada consulta respeta la RLS del usuario que la hace. Las columnas «mi_*» / «mis_*» / «no_leidos» se calculan para la sesión (auth.uid()).
-- Depende de: 064-070.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────── personal ─────────────
create or replace view piefirme.prp_equipo_hoy with (security_invoker = true) as
select d.empleado_id, d.perfil_id, d.organizacion_id, d.nombre_completo, d.foto_path, d.cargo, d.puesto, d.estado,
       d.sede_base_id, sb.nombre as sede_base_nombre, d.sede_hoy_id, sh.nombre as sede_hoy_nombre
  from piefirme.equipo_directorio() d
  left join piefirme.sedes sb on sb.id = d.sede_base_id
  left join piefirme.sedes sh on sh.id = d.sede_hoy_id;

create or replace view piefirme.prp_empleado_asignaciones with (security_invoker = true) as
select a.id, a.organizacion_id, a.empleado_id, a.sede_id, s.nombre as sede_nombre, a.fecha, a.origen, a.registrado_por,
       d.nombre_completo, d.cargo, d.foto_path
  from piefirme.empleado_asignaciones a
  join piefirme.sedes s on s.id = a.sede_id
  left join piefirme.equipo_directorio() d on d.empleado_id = a.empleado_id;

create or replace view piefirme.prp_empleado_movimientos with (security_invoker = true) as
select m.id, m.organizacion_id, m.empleado_id, m.tipo, m.fecha, m.sede_origen_id, so.nombre as sede_origen_nombre,
       m.sede_destino_id, sd.nombre as sede_destino_nombre, m.motivo, m.detalle, m.registrado_por,
       trim(concat_ws(' ', e.nombre, e.apellido_pat, e.apellido_mat)) as nombre_completo
  from piefirme.empleado_movimientos m
  join piefirme.empleados e on e.id = m.empleado_id
  left join piefirme.sedes so on so.id = m.sede_origen_id
  left join piefirme.sedes sd on sd.id = m.sede_destino_id;

-- ───────────── capacitación y acervo ─────────────
create or replace view piefirme.prp_lecciones with (security_invoker = true) as
select l.id, l.organizacion_id, l.curso_id, l.orden, l.titulo, l.tipo, l.video_url, l.video_pendiente, l.recurso_path, l.contenido, l.duracion_min,
       exists (select 1 from piefirme.curso_avance a where a.leccion_id = l.id and a.perfil_id = auth.uid()) as mi_completada
  from piefirme.lecciones l;

create or replace view piefirme.prp_cursos with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, c.titulo, c.descripcion, c.categoria, c.cargos, c.obligatorio, c.duracion_min, c.portada_path, c.orden, c.activo,
       (select count(*) from piefirme.lecciones l where l.curso_id = c.id)::int as lecciones_total,
       (select count(*) from piefirme.curso_avance a where a.curso_id = c.id and a.perfil_id = auth.uid())::int as mis_lecciones_completadas,
       case when (select count(*) from piefirme.lecciones l where l.curso_id = c.id) = 0 then 0
            else round(100.0 * (select count(*) from piefirme.curso_avance a where a.curso_id = c.id and a.perfil_id = auth.uid())
                       / (select count(*) from piefirme.lecciones l where l.curso_id = c.id), 0) end as mi_avance_pct,
       (select max(a.completado_en) from piefirme.curso_avance a where a.curso_id = c.id and a.perfil_id = auth.uid()) as mi_ultimo_avance
  from piefirme.cursos c;

-- avance de todo el equipo (el administrador ve a todos; los demás solo se ven a sí mismos por RLS)
create or replace view piefirme.prp_curso_avance_equipo with (security_invoker = true) as
select a.organizacion_id, a.perfil_id, trim(concat_ws(' ', p.nombre, p.apellidos)) as nombre_completo, p.cargo, a.curso_id, c.titulo as curso,
       count(*)::int as lecciones_completadas, max(a.completado_en) as ultimo_avance
  from piefirme.curso_avance a
  join piefirme.perfiles p on p.id = a.perfil_id
  join piefirme.cursos c on c.id = a.curso_id
 group by a.organizacion_id, a.perfil_id, p.nombre, p.apellidos, p.cargo, a.curso_id, c.titulo;

create or replace view piefirme.prp_acervo with (security_invoker = true) as
select d.id, d.organizacion_id, d.sede_id, d.titulo, d.tipo, d.url, d.storage_path, d.contenido, d.categoria, d.etiquetas, d.cargos, d.version, d.estado,
       d.sintetico, d.created_at, d.updated_at
  from piefirme.acervo_documentos d;

-- ───────────── finanzas ─────────────
create or replace view piefirme.prp_gastos_recurrentes with (security_invoker = true) as
select g.id, g.organizacion_id, g.sede_id, s.nombre as sede_nombre, g.grupo_id, gg.nombre as grupo_nombre, g.proveedor_id, p.nombre as proveedor_nombre,
       g.concepto, g.monto, g.metodo_pago, g.frecuencia, g.dia_del_mes, g.fecha_inicio, g.fecha_fin, g.proxima_fecha, g.ultima_generada, g.activo, g.notas
  from piefirme.gastos_recurrentes g
  left join piefirme.sedes s on s.id = g.sede_id
  left join piefirme.grupos_gasto gg on gg.id = g.grupo_id
  left join piefirme.proveedores p on p.id = g.proveedor_id;

create or replace view piefirme.prp_notas_compra with (security_invoker = true) as
select n.id, n.organizacion_id, n.sede_id, s.nombre as sede_nombre, n.comprobante_id, n.gasto_id, n.cuenta_por_pagar_id, n.proveedor_id,
       coalesce(p.nombre, n.proveedor_texto) as proveedor, n.fecha_nota, n.folio_nota, n.subtotal, n.iva, n.total, n.forma_pago, n.estado, n.fuente,
       n.confianza_global, n.confianza_campos, n.requiere_revision, n.capturada_por, n.revisada_por, n.revisada_en, n.notas, n.created_at,
       (select count(*) from piefirme.notas_compra_lineas l where l.nota_id = n.id)::int as lineas
  from piefirme.notas_compra n
  join piefirme.sedes s on s.id = n.sede_id
  left join piefirme.proveedores p on p.id = n.proveedor_id;

-- ───────────── desempeño ─────────────
create or replace view piefirme.prp_bono_esquemas with (security_invoker = true) as
select e.id, e.organizacion_id, e.nombre, e.descripcion, e.tipo, e.periodo, e.base, e.tipo_pago, e.escalones, e.cargos, e.sedes, e.condiciones,
       e.vigente_desde, e.vigente_hasta, e.activo
  from piefirme.bono_esquemas e;

create or replace view piefirme.prp_bonos_calculados with (security_invoker = true) as
select b.id, b.organizacion_id, b.esquema_id, es.nombre as esquema, es.tipo as esquema_tipo, b.empleado_id, d.nombre_completo, d.cargo,
       b.sede_id, s.nombre as sede_nombre, b.periodo_inicio, b.periodo_fin, b.periodo_etiqueta, b.base_valor, b.meta_valor, b.escalon, b.monto,
       b.cumple_condiciones, b.estado, b.autorizado_por, b.autorizado_en, b.pagado_en, b.notas,
       (b.empleado_id is not null and b.empleado_id = piefirme_app.empleado_id()) as es_mio
  from piefirme.bonos_calculados b
  join piefirme.bono_esquemas es on es.id = b.esquema_id
  left join piefirme.sedes s on s.id = b.sede_id
  left join piefirme.equipo_directorio() d on d.empleado_id = b.empleado_id;

create or replace view piefirme.prp_bono_detalle with (security_invoker = true) as
select d.id, d.organizacion_id, d.bono_id, d.venta_id, v.folio as venta_folio, d.venta_linea_id, d.empleado_id, d.sede_id, d.fecha, d.concepto, d.importe_atribuido
  from piefirme.bono_detalle d
  left join piefirme.ventas v on v.id = d.venta_id;

-- meta del mes contra lo realmente vendido (ventas cobradas/facturadas de la sede en ese mes)
create or replace view piefirme.prp_metas_mensuales with (security_invoker = true) as
select m.id, m.organizacion_id, m.sede_id, s.nombre as sede_nombre, m.mes, m.meta_ventas, m.meta_servicios, m.meta_productos, m.meta_ocupacion, m.notas,
       coalesce(r.vendido, 0) as vendido,
       case when m.meta_ventas > 0 then round(100.0 * coalesce(r.vendido, 0) / m.meta_ventas, 1) end as cumplimiento_pct
  from piefirme.metas_mensuales m
  join piefirme.sedes s on s.id = m.sede_id
  left join lateral (
    select sum(v.total) as vendido from piefirme.ventas v
     where v.sede_id = m.sede_id and v.estado in ('cobrada', 'facturada')
       and v.cobrada_en >= m.mes and v.cobrada_en < (m.mes + interval '1 month')
  ) r on true;

create or replace view piefirme.prp_evaluaciones with (security_invoker = true) as
select e.id, e.organizacion_id, e.sede_id, s.nombre as sede_nombre, e.encuesta_id, e.cita_id, e.paciente_id, e.podologo_id,
       trim(concat_ws(' ', p.nombre, p.apellidos)) as podologo_nombre,
       e.calif_servicio, e.calif_podologo, e.calif_sucursal,
       round((coalesce(e.calif_servicio, 0) + coalesce(e.calif_podologo, 0) + coalesce(e.calif_sucursal, 0))::numeric
             / nullif((e.calif_servicio is not null)::int + (e.calif_podologo is not null)::int + (e.calif_sucursal is not null)::int, 0), 2) as calif_promedio,
       e.comentario, e.canal, e.estado_seguimiento, e.seguimiento_nota, e.atendida_por, e.atendida_en, e.respondida_en
  from piefirme.evaluacion_respuestas e
  join piefirme.sedes s on s.id = e.sede_id
  left join piefirme.perfiles p on p.id = e.podologo_id;

create or replace view piefirme.prp_evaluacion_resumen_mensual with (security_invoker = true) as
select e.organizacion_id, e.sede_id, date_trunc('month', e.respondida_en)::date as mes, count(*)::int as respuestas,
       round(avg(e.calif_servicio), 2) as servicio, round(avg(e.calif_podologo), 2) as podologo, round(avg(e.calif_sucursal), 2) as sucursal,
       count(*) filter (where e.estado_seguimiento in ('pendiente', 'en_atencion'))::int as por_atender
  from piefirme.evaluacion_respuestas e
 group by e.organizacion_id, e.sede_id, date_trunc('month', e.respondida_en);

-- vendedor efectivo de cada venta = vendedor_id ?? cajero_id
create or replace view piefirme.prp_ventas_vendedor with (security_invoker = true) as
select v.id, v.organizacion_id, v.sede_id, v.folio, v.estado, v.total, v.cobrada_en, v.podologo_id, v.cajero_id, v.vendedor_id,
       coalesce(v.vendedor_id, v.cajero_id) as vendedor_efectivo_id
  from piefirme.ventas v;

-- ───────────── comercial ─────────────
create or replace view piefirme.prp_pedidos_web with (security_invoker = true) as
select p.id, p.organizacion_id, p.sede_id, s.nombre as sede_nombre, p.folio, p.cliente_nombre, p.cliente_telefono, p.cliente_email, p.paciente_id,
       p.tipo_entrega, p.direccion_envio, p.estado, p.pago_estado, p.subtotal, p.envio, p.total, p.nota_cliente, p.motivo_cancelacion, p.origen,
       p.atendido_por, p.atendido_en, p.venta_id, p.created_at,
       (select count(*) from piefirme.pedidos_web_lineas l where l.pedido_id = p.id)::int as lineas
  from piefirme.pedidos_web p
  join piefirme.sedes s on s.id = p.sede_id;

create or replace view piefirme.prp_auditorias_inventario with (security_invoker = true) as
select a.id, a.organizacion_id, a.sede_id, s.nombre as sede_nombre, a.folio, a.fecha, a.responsable_id, a.conteo_id, a.estado, a.nota,
       count(f.id)::int as fotos,
       count(f.id) filter (where f.cantidad_confirmada is not null and f.cantidad_esperada is not null and f.cantidad_confirmada <> f.cantidad_esperada)::int as diferencias,
       round(avg(f.confianza), 3) as confianza_promedio
  from piefirme.auditorias_inventario a
  join piefirme.sedes s on s.id = a.sede_id
  left join piefirme.auditoria_fotos f on f.auditoria_id = a.id
 group by a.id, s.nombre;

create or replace view piefirme.prp_auditoria_fotos with (security_invoker = true) as
select f.id, f.organizacion_id, f.sede_id, f.auditoria_id, f.producto_id, pr.nombre as producto, pr.sku, f.storage_path, f.origen,
       f.cantidad_esperada, f.cantidad_ia, f.cantidad_confirmada, f.confianza, f.tomada_por, f.tomada_en, f.nota
  from piefirme.auditoria_fotos f
  left join piefirme.productos pr on pr.id = f.producto_id;

-- ───────────── comunicación ─────────────
create or replace view piefirme.prp_com_hilos with (security_invoker = true) as
select h.id, h.organizacion_id, h.tipo, h.sede_id, h.cargo, h.creado_por, h.ultimo_mensaje_en,
       coalesce(h.nombre, otros.nombres) as titulo,
       (select count(*) from piefirme.com_hilo_miembros m where m.hilo_id = h.id)::int as miembros,
       um.texto as ultimo_texto, um.autor_id as ultimo_autor_id,
       (select count(*) from piefirme.com_mensajes m
         where m.hilo_id = h.id and m.autor_id <> auth.uid()
           and not exists (select 1 from piefirme.com_mensaje_lecturas l where l.mensaje_id = m.id and l.perfil_id = auth.uid()))::int as no_leidos
  from piefirme.com_hilos h
  left join lateral (
    select string_agg(trim(concat_ws(' ', p.nombre, p.apellidos)), ', ' order by p.nombre) as nombres
      from piefirme.com_hilo_miembros m join piefirme.perfiles p on p.id = m.perfil_id
     where m.hilo_id = h.id and m.perfil_id <> auth.uid()) otros on true
  left join lateral (
    select m.texto, m.autor_id from piefirme.com_mensajes m where m.hilo_id = h.id order by m.created_at desc limit 1) um on true;

create or replace view piefirme.prp_com_mensajes with (security_invoker = true) as
select m.id, m.organizacion_id, m.hilo_id, m.autor_id, trim(concat_ws(' ', p.nombre, p.apellidos)) as autor_nombre, p.cargo as autor_cargo,
       m.texto, m.adjuntos, m.editado_en, m.created_at,
       (m.autor_id = auth.uid()) as es_mio,
       exists (select 1 from piefirme.com_mensaje_lecturas l where l.mensaje_id = m.id and l.perfil_id = auth.uid()) as leido_por_mi,
       (select count(*) from piefirme.com_mensaje_lecturas l where l.mensaje_id = m.id)::int as lecturas
  from piefirme.com_mensajes m
  join piefirme.perfiles p on p.id = m.autor_id;

-- bandeja de entrada de la sesión
create or replace view piefirme.prp_correos_bandeja with (security_invoker = true) as
select c.id, d.id as destinatario_id, c.organizacion_id, c.de_perfil_id, trim(concat_ws(' ', p.nombre, p.apellidos)) as de_nombre,
       c.asunto, c.cuerpo, c.adjuntos, c.respuesta_a_id, c.enviado_en, d.tipo, d.leido_en, (d.leido_en is null) as no_leido,
       d.etiquetas, d.destacado, d.archivado, d.eliminado_en
  from piefirme.correo_destinatarios d
  join piefirme.correos_internos c on c.id = d.correo_id and not c.borrador
  join piefirme.perfiles p on p.id = c.de_perfil_id
 where d.perfil_id = auth.uid();

-- enviados y borradores de la sesión (con destinatarios agregados)
create or replace view piefirme.prp_correos_enviados with (security_invoker = true) as
select c.id, c.organizacion_id, c.asunto, c.cuerpo, c.adjuntos, c.borrador, c.enviado_en, c.respuesta_a_id,
       (select coalesce(jsonb_agg(jsonb_build_object('perfil_id', d.perfil_id, 'tipo', d.tipo, 'leido_en', d.leido_en, 'nombre', trim(concat_ws(' ', p.nombre, p.apellidos))) order by d.tipo, p.nombre), '[]'::jsonb)
          from piefirme.correo_destinatarios d join piefirme.perfiles p on p.id = d.perfil_id where d.correo_id = c.id) as destinatarios
  from piefirme.correos_internos c
 where c.de_perfil_id = auth.uid();

create or replace view piefirme.prp_feed with (security_invoker = true) as
select f.id, f.organizacion_id, f.autor_id, trim(concat_ws(' ', a.nombre, a.apellidos)) as autor_nombre, a.cargo as autor_cargo,
       f.tipo, f.titulo, f.texto, f.imagen_path, f.fijado, f.alcance_sede_id, f.reconocido_perfil_id,
       trim(concat_ws(' ', r.nombre, r.apellidos)) as reconocido_nombre, f.evento_fecha, f.archivada, f.publicada_en,
       (select coalesce(jsonb_object_agg(x.emoji, x.n), '{}'::jsonb) from (select emoji, count(*)::int n from piefirme.feed_reacciones fr where fr.publicacion_id = f.id group by emoji) x) as reacciones,
       (select coalesce(array_agg(fr.emoji), '{}') from piefirme.feed_reacciones fr where fr.publicacion_id = f.id and fr.perfil_id = auth.uid()) as mis_reacciones,
       (select count(*) from piefirme.feed_comentarios fc where fc.publicacion_id = f.id)::int as comentarios
  from piefirme.feed_publicaciones f
  join piefirme.perfiles a on a.id = f.autor_id
  left join piefirme.perfiles r on r.id = f.reconocido_perfil_id;

create or replace view piefirme.prp_feed_comentarios with (security_invoker = true) as
select c.id, c.organizacion_id, c.publicacion_id, c.autor_id, trim(concat_ws(' ', p.nombre, p.apellidos)) as autor_nombre, c.texto, c.created_at
  from piefirme.feed_comentarios c
  join piefirme.perfiles p on p.id = c.autor_id;
