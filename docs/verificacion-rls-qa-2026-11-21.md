# Verificación de seguridad — qa — 2026-11-21

218 pruebas · **12 fallas**

| Bloque | Prueba | Resultado | Detalle |
|---|---|---|---|
| RLS | RLS activo en piefirme._rannix_semillas | ✗ | RLS DESACTIVADO |
| POLÍTICAS | ninguna política USING (true) | ✓ |  |
| VISTAS | piefirme.prp_validacion_chequeos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_validacion_detalle con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_entrega_indicadores con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_servicios con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_productos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_precios_historial con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ofertas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_horarios_atencion con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_bloqueos_agenda con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_lista_espera con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_reservas_portal con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_anticipos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_pagos_clip con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ventas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_venta_lineas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_turnos_caja con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cortes_caja con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_equipo_hoy con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_empleado_asignaciones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_empleado_movimientos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_lecciones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cursos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_curso_avance_equipo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_acervo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_gastos_recurrentes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_notas_compra con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_bono_esquemas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_bonos_calculados con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_bono_detalle con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_metas_mensuales con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_evaluaciones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_evaluacion_resumen_mensual con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ventas_vendedor con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_pedidos_web con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_auditorias_inventario con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_auditoria_fotos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_com_hilos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_com_mensajes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_correos_bandeja con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_correos_enviados con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_feed con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_feed_comentarios con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_catalogo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_grupo_gasto con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_tiempo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_cuentas_pagar con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_consultas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_ventas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_metodo_pago con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_comisiones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_encuestas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_quejas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_metricas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_mensual_sede con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_servicio_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_producto_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_gasto_grupo_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_inventario con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_pacientes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_paciente con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_podologo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_citas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_inventario_mov con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_pagos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_kpi_mensual_org con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_kpi_resumen con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_podologo_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_calc_kpi_metodo_pago_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_producto con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_proveedor con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_consentimientos_vigentes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_pacientes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_sede con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_planes_adquiridos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_gift_cards con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_membresias con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cuentas_pagar con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_portal_podologos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_facturas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_facturacion_pendiente con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_notas_credito con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_citas_sin_cobro con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ingreso_por_servicio con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_dim_servicio con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_asistencia con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_existencias con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_gastos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.dw_fact_ingresos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_recordatorios con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_agenda con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ventas_por_dia con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ocupacion_podologo_dia con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_vigencias_por_vencer con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_expediente_resumen con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_seguimiento_clinico con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_consultas_pendientes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_diagnosticos_frecuentes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_hallazgos_pie con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_fotos_clinicas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_planes_progreso con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_monofilamento_resumen con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_pie_diabetico_revisiones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_plantillas_seguimiento con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_alertas_paciente con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_esterilizacion_lotes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_kits_resumen con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_quejas_resumen con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_arco_pendientes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_documentos_emitidos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_proveedores con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_inventario con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_lotes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_kardex con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_mermas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_traspasos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_traspaso_lineas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ordenes_compra con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_oc_lineas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_recepciones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_grupos_gasto con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cuentas_bancarias con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ingresos_descuadrados con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cuentas_cobrar con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_gastos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_fondo_semana con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_fondo_revolvente_cierres con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_gasto_por_rubro_semana con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_movimientos_bancarios con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_conciliacion_cobros con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_liquidaciones_clip con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ingresos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_antiguedad_saldos_pagar con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_pagos_proveedor con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_edr con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_edr_consolidado con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_edr_resultados con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_resumen_semanal con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_resumen_semanal_consolidado con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cierres_periodo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_kpis_finanzas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_alertas_financieras con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ingresos_mensuales con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_gastos_mensuales con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_compras_proveedor con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_valuacion_inventario con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_empleados con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_historico_sueldos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_horarios_laborales con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_empleado_documentos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_expediente_empleado con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_checadas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_asistencia con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_asistencia_semana con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_asistencia_resumen_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_tipos_incidencia con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_incidencias_rh con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_vacaciones_anio con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_vacaciones_detalle con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_vacaciones_bloqueos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_vacantes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_esquemas_comision con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_comisiones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_comision_detalle con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_nomina_periodos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_prenomina con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_recibos_nomina con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_metas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_equipos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ordenes_trabajo con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ot_historial con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_ot_evidencias con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_mantenimiento_mes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_importaciones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_importacion_mapeos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_importacion_filas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_consentimientos_contacto_vigentes con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_seguimientos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_campanas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_campana_destinatarios con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_encuestas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_nps_mensual con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_satisfaccion_quejas con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_suscripcion con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_cobros_suscripcion con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_invitaciones con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_soporte_tickets con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_soporte_accesos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_configuracion_clinica con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_catalogos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_asistente_historial con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_asistente_accesos con security_invoker | ✓ | {security_invoker=true} |
| VISTAS | piefirme.prp_estado_clinica con security_invoker | ✓ | {security_invoker=true} |
| ANON | anon no tiene grants en las tablas | ✓ |  |
| FUNCIONES | anon no ejecuta piefirme.portal_estado_reserva | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_sala_entrar | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_responder_encuesta | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_disponibilidad | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_accion_cita | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_ver_cita | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_sala_estado | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_catalogo | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_retener_horario | ✗ | EXECUTE heredado de PUBLIC o concedido |
| FUNCIONES | anon no ejecuta piefirme.portal_lista_espera | ✗ | EXECUTE heredado de PUBLIC o concedido |
| STORAGE | bucket comercio_docs privado | ✓ |  |
| STORAGE | bucket comercio_img PÚBLICO | ✗ | público |
| STORAGE | bucket pf-acervo privado | ✓ |  |
| STORAGE | bucket pf-auditorias privado | ✓ |  |
| STORAGE | bucket pf-catalogo privado | ✓ |  |
| STORAGE | bucket pf-comprobantes privado | ✓ |  |
| STORAGE | bucket pf-documentos privado | ✓ |  |
| STORAGE | bucket pf-equipo privado | ✓ |  |
| STORAGE | bucket pf-expedientes privado | ✓ |  |
| STORAGE | bucket pf-fotos-clinicas privado | ✓ |  |
| STORAGE | bucket pf-importaciones privado | ✓ |  |
| STORAGE | bucket pf-logos privado | ✓ |  |
| REST-ANON | anon no lee filas de 300 tablas/vistas | ✓ |  |
