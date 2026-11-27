-- 322 · Pedidos especiales · VISTAS prp_* (lectura), ampliación de prp_proveedores y prp_anticipos. Ver 320/321 y docs/PEDIDOS_ESPECIALES.md.
-- Todas security_invoker: el RLS de las tablas de 320 decide qué filas ve cada rol. Los costos salen enmascarados con piefirme_app.ve_costos() (migración 270).

-- nombres que el podólogo no podría leer por RLS (proveedores y perfiles): solo el nombre, de la misma organización
create or replace function piefirme_app.nombre_proveedor_pedido(p_id uuid) returns text language sql stable security definer
  set search_path = piefirme, piefirme_app, extensions, pg_temp as
$$ select nombre from piefirme.proveedores where id = p_id and organizacion_id = piefirme_app.org_id() $$;
create or replace function piefirme_app.nombre_usuario_pedido(p_id uuid) returns text language sql stable security definer
  set search_path = piefirme, piefirme_app, extensions, pg_temp as
$$ select btrim(nombre || ' ' || coalesce(apellidos, '')) from piefirme.perfiles where id = p_id and organizacion_id = piefirme_app.org_id() $$;
revoke all on function piefirme_app.nombre_proveedor_pedido(uuid), piefirme_app.nombre_usuario_pedido(uuid) from public, anon;
grant execute on function piefirme_app.nombre_proveedor_pedido(uuid), piefirme_app.nombre_usuario_pedido(uuid) to authenticated, service_role;

create or replace view piefirme.prp_pedidos_especiales with (security_invoker = true) as
select p.id, p.organizacion_id, p.sede_id, se.nombre as sede_nombre, p.folio, p.nota_id, n.folio as nota_folio,
       p.paciente_id, btrim(pa.nombre || ' ' || coalesce(pa.apellido_paterno, '') || ' ' || coalesce(pa.apellido_materno, '')) as paciente_nombre,
       p.proveedor_id, piefirme_app.nombre_proveedor_pedido(p.proveedor_id) as proveedor_nombre,
       p.estado,
       case p.estado when 'solicitado' then 1 when 'anticipo_cobrado' then 2 when 'autorizado' then 3 when 'enviado_proveedor' then 4 when 'aceptado' then 5
                     when 'en_transito' then 6 when 'recibido' then 7 when 'entregado' then 8 when 'en_espera' then 9 else 10 end as etapa_orden,
       p.total, p.anticipo_pct, p.anticipo_monto, p.saldo,
       p.fecha_prometida, p.plazo_saldo, p.fecha_acordada, p.fecha_estimada_llegada,
       (select string_agg(l.cantidad::int || ' × ' || l.descripcion, ' · ' order by l.orden) from piefirme.pedido_especial_lineas l where l.pedido_id = p.id) as producto,
       (select count(*) from piefirme.pedido_especial_lineas l where l.pedido_id = p.id) as partidas,
       (select min(l.tipo_item) from piefirme.pedido_especial_lineas l where l.pedido_id = p.id) as tipo_item,
       p.solicitado_por, piefirme_app.nombre_usuario_pedido(p.solicitado_por) as solicitado_por_nombre, p.created_at,
       p.anticipo_id, a.folio as anticipo_folio, a.estado as anticipo_estado, a.reembolso_estado as anticipo_reembolso_estado, p.anticipo_cobrado_en, p.cuenta_cobrar_id,
       p.autorizado_por, piefirme_app.nombre_usuario_pedido(p.autorizado_por) as autorizado_por_nombre, p.autorizado_en,
       p.espera_origen, p.espera_motivo, p.destino_anticipo, p.espera_en, p.cancelado_motivo, p.cancelado_en,
       p.mensaje_enviado_en, p.aceptado_en, p.respuesta_proveedor, p.guia_envio, p.transito_en,
       p.oc_id, oc.folio as oc_folio, p.recepcion_id, p.cuenta_pagar_id, p.recibido_en, p.recibido_por, piefirme_app.nombre_usuario_pedido(p.recibido_por) as recibido_por_nombre,
       p.venta_id, p.entregado_en, p.saldo_cobrado,
       -- semáforo de retraso: rojo = fecha vencida; ámbar = vence en ≤ 2 días; verde = a tiempo; null = ya no corre
       case when p.estado in ('entregado', 'cancelado', 'en_espera') then null
            when p.estado = 'recibido' and p.plazo_saldo < piefirme_app.hoy_org(p.organizacion_id) then 'rojo'
            when p.estado <> 'recibido' and coalesce(p.fecha_acordada, p.fecha_prometida) < piefirme_app.hoy_org(p.organizacion_id) then 'rojo'
            when coalesce(case when p.estado = 'recibido' then p.plazo_saldo else coalesce(p.fecha_acordada, p.fecha_prometida) end, p.fecha_prometida) <= piefirme_app.hoy_org(p.organizacion_id) + 2 then 'ambar'
            else 'verde' end as semaforo,
       case when p.estado in ('entregado', 'cancelado', 'en_espera') then 0
            when p.estado = 'recibido' then greatest(piefirme_app.hoy_org(p.organizacion_id) - p.plazo_saldo, 0)
            else greatest(piefirme_app.hoy_org(p.organizacion_id) - coalesce(p.fecha_acordada, p.fecha_prometida), 0) end as dias_retraso,
       (p.estado = 'recibido' and p.plazo_saldo < piefirme_app.hoy_org(p.organizacion_id)) as saldo_vencido,
       -- costos: solo administrador y supervisor
       (case when piefirme_app.ve_costos() then (select sum(round(l.cantidad * k.costo_unitario, 2)) from piefirme.pedido_especial_lineas l join piefirme.pedido_especial_costos k on k.linea_id = l.id where l.pedido_id = p.id) end)::numeric(14,2) as costo_estimado,
       (select count(*) from piefirme.pedido_especial_lineas l left join piefirme.pedido_especial_costos k on k.linea_id = l.id where l.pedido_id = p.id and k.linea_id is null and piefirme_app.ve_costos()) as partidas_sin_costo
  from piefirme.pedidos_especiales p
  join piefirme.pedido_notas n on n.id = p.nota_id
  join piefirme.sedes se on se.id = p.sede_id
  join piefirme.pacientes pa on pa.id = p.paciente_id
  left join piefirme.anticipos a on a.id = p.anticipo_id
  left join piefirme.ordenes_compra oc on oc.id = p.oc_id;

create or replace view piefirme.prp_pedido_lineas with (security_invoker = true) as
select l.id, l.organizacion_id, l.sede_id, l.pedido_id, l.orden, l.tipo_item, l.producto_id, l.servicio_id, l.descripcion, l.caracteristicas, l.cantidad, l.precio_unitario, l.importe, l.oc_linea_id,
       (case when piefirme_app.ve_costos() then k.costo_unitario end)::numeric(14,4) as costo_unitario,
       (case when piefirme_app.ve_costos() then round(l.cantidad * k.costo_unitario, 2) end)::numeric(14,2) as costo_total
  from piefirme.pedido_especial_lineas l
  left join piefirme.pedido_especial_costos k on k.linea_id = l.id;

create or replace view piefirme.prp_pedido_bitacora with (security_invoker = true) as
select b.id, b.organizacion_id, b.sede_id, b.pedido_id, b.accion, b.estado_anterior, b.estado_nuevo, b.usuario_id, piefirme_app.nombre_usuario_pedido(b.usuario_id) as usuario_nombre,
       b.en, b.motivo, b.detalle
  from piefirme.pedido_especial_bitacora b;

create or replace view piefirme.prp_pedido_mensajes with (security_invoker = true) as
select m.id, m.organizacion_id, m.sede_id, m.pedido_id, m.proveedor_id, m.canal, m.destino, m.texto, m.enviado_por, piefirme_app.nombre_usuario_pedido(m.enviado_por) as enviado_por_nombre, m.enviado_en
  from piefirme.pedido_mensajes m;

grant select on piefirme.prp_pedidos_especiales, piefirme.prp_pedido_lineas, piefirme.prp_pedido_bitacora, piefirme.prp_pedido_mensajes to authenticated, service_role;
revoke all on piefirme.prp_pedidos_especiales, piefirme.prp_pedido_lineas, piefirme.prp_pedido_bitacora, piefirme.prp_pedido_mensajes from anon;

-- ───────────────────────────── prp_proveedores: contacto de WhatsApp, anticipo y tipos (columnas nuevas al final) ─────────────────────────────
create or replace view piefirme.prp_proveedores as
 SELECT p.id, p.organizacion_id, p.clave, p.nombre, p.razon_social, p.rfc, p.categoria, p.es_laboratorio, p.activo,
        CASE WHEN p.activo THEN 'Activo'::text ELSE 'Inactivo'::text END AS estatus,
        p.telefono, p.email, p.contacto, p.condiciones_pago, p.dias_credito, p.dias_entrega, p.notas, p.alias, p.created_at,
        CASE WHEN b.clabe IS NULL THEN NULL::text ELSE repeat('•'::text, 14) || "right"(b.clabe, 4) END AS clabe_enmascarada,
        p.whatsapp_grupo, p.whatsapp_contacto, p.anticipo_pct, p.pedidos_tipos
   FROM piefirme.proveedores p LEFT JOIN piefirme.proveedores_bancarios b ON b.proveedor_id = p.id;

-- ───────────────────────────── prp_anticipos: un anticipo de un pedido en curso NO se ofrece para aplicarlo a otro ticket ─────────────────────────────
create or replace view piefirme.prp_anticipos as
 SELECT a.id, a.organizacion_id, a.sede_id, se.nombre AS sede_nombre, a.folio, a.origen, a.metodo, a.monto, a.estado, a.paciente_id,
        btrim(((p.nombre || ' '::text) || COALESCE(p.apellido_paterno, ''::text))) AS paciente_nombre,
        a.cita_id, c.folio AS cita_folio, c.inicio AS cita_inicio, c.estado AS cita_estado, a.plan_adquirido_id, a.pagado_en, a.aplicado_en, a.venta_id,
        a.reembolso_estado, a.reembolso_monto, a.reembolso_solicitado_en, a.reembolso_cerrado_en, a.liga_pago_url, a.liga_vence_en,
        ((a.estado = 'pendiente'::text) AND (a.liga_vence_en < now())) AS liga_vencida,
        ((a.estado = 'pagado'::text) AND NOT EXISTS (SELECT 1 FROM piefirme.pedidos_especiales pe WHERE pe.id = a.pedido_especial_id AND pe.estado NOT IN ('en_espera', 'cancelado'))) AS aplicable_en_caja,
        a.pedido_especial_id
   FROM (((piefirme.anticipos a
     JOIN piefirme.sedes se ON ((se.id = a.sede_id)))
     JOIN piefirme.pacientes p ON ((p.id = a.paciente_id)))
     LEFT JOIN piefirme.citas c ON ((c.id = a.cita_id)));

notify pgrst, 'reload schema';
