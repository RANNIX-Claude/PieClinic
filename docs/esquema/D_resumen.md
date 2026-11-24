# D · Equipo y plataforma — resumen del esquema (migraciones 050-059)

Validado con `node scripts/validar-sql-local.mjs --archivos 001,010,020…042,050…059` (28/28 aplicadas; sin tablas sin RLS, sin políticas abiertas, sin vistas sin `security_invoker`). Comportamiento probado en PGlite con las semillas D_01…D_04 (roles administrador/recepción/rannix, flujo de OT, nómina, suspensión, exportación).

## Archivos

| Migración | Tema |
|---|---|
| 050 `equipo_empleados` | empleados (E123), historial de sueldo, horarios laborales (E125), documentos del expediente de empleado |
| 051 `equipo_asistencia_vacaciones` | tipos de incidencia, checadas, asistencia consolidada (E124), incidencias (E126), vacaciones (E127), vacantes/candidatos (E128), RPC de importar checadas |
| 052 `equipo_comisiones_nomina` | esquemas de comisión (E131), periodos/comisiones/detalle (E132), metas (E133), periodos de nómina (E129), prenómina/recibos (E130) |
| 053 `equipo_mantenimiento` | equipos (E134), órdenes de trabajo (E135), historial, evidencias, presupuesto mensual, contadores de folio |
| 054 `plataforma_importaciones_ia` | plantillas de mapeo (E140), lotes (E138), mapeos propuestos por IA (E139), filas/duplicados/errores (E141) |
| 055 `plataforma_crm_campanas_encuestas` | consentimientos de contacto, seguimiento, campañas (E64), destinatarios (E65), encuestas/NPS (E66) |
| 056 `plataforma_suscripciones_usuarios` | planes (E13), suscripción (E14), cobros manuales (E15), invitaciones/altas, soporte (E16), acceso temporal de soporte |
| 057 `plataforma_configuracion_asistente` | parámetros de la clínica (E02), catálogos (E142), asistente IA: conversaciones, mensajes, accesos a datos, vistas permitidas (E18) |
| 058 `plataforma_storage` | 6 buckets privados y 24 políticas en `storage.objects` |
| 059 `plataforma_rannix_exportacion` | RPC del panel RANNIX, alta de clínica, estado de clínica, exportación completa |

Semillas (`supabase/semillas/`, org `00000000-0000-0000-0000-00000000c0de`): `D_01` org + 5 sedes + 15 empleados + horarios + 2,116 checadas (3 meses) + vacaciones/incidencias/vacantes; `D_02` esquemas, 3 periodos de comisión (2 cerrados), metas, 4 quincenas con 45 renglones de prenómina; `D_03` 10 equipos, 8 OT en todos los estatus, presupuesto; `D_04` suscripción + 3 pagos manuales, importación de ejemplo (12 filas), invitación, ticket, y (si hay pacientes) CRM y NPS. Requieren 001 y 050-059 (010 para la FK de plantillas); el CRM se omite sin pacientes.

## Totales

46 tablas · 47 vistas `prp_*` · ~38 RPC en `public` (el resto son helpers/triggers en `app`) · 6 buckets · 24 políticas de storage.

## Tablas por migración

050: `empleados`, `empleado_sueldo_historial`, `horarios_laborales`, `empleado_documentos`.
051: `tipos_incidencia_rh`, `checadas`, `asistencia`, `incidencias_rh`, `vacaciones_anio`, `vacaciones_detalle`, `vacantes`, `candidatos`.
052: `esquemas_comision`, `periodos_comision`, `comisiones_calculadas`, `comision_detalle`, `metas`, `periodos_nomina`, `prenomina`.
053: `contadores_equipo` (interna, sin políticas), `equipos`, `ordenes_trabajo`, `ot_historial`, `ot_evidencias`, `mantenimiento_presupuestos`.
054: `importacion_plantillas`, `importaciones`, `importacion_mapeos`, `importacion_filas`.
055: `consentimientos_contacto`, `seguimientos_paciente`, `campanas`, `campana_destinatarios`, `encuestas`.
056: `planes_suscripcion` (global, solo lectura), `suscripciones`, `cobros_suscripcion`, `invitaciones`, `soporte_tickets`, `soporte_mensajes`, `soporte_accesos`.
057: `catalogos_clinica`, `asistente_conversaciones`, `asistente_mensajes`, `asistente_accesos_datos`, `asistente_vistas_permitidas`.

## Vistas prp_*

050 `prp_empleados`, `prp_historico_sueldos`, `prp_horarios_laborales`, `prp_empleado_documentos`, `prp_expediente_empleado` · 051 `prp_checadas`, `prp_asistencia`, `prp_asistencia_semana`, `prp_asistencia_resumen_mes`, `prp_tipos_incidencia`, `prp_incidencias_rh`, `prp_vacaciones_anio`, `prp_vacaciones_detalle`, `prp_vacaciones_bloqueos` (para agenda, P-047), `prp_vacantes` · 052 `prp_esquemas_comision`, `prp_comisiones`, `prp_comision_detalle`, `prp_nomina_periodos`, `prp_prenomina`, `prp_recibos_nomina`, `prp_metas` · 053 `prp_equipos` (estado derivado «vencido»), `prp_ordenes_trabajo`, `prp_ot_historial`, `prp_ot_evidencias`, `prp_mantenimiento_mes` · 054 `prp_importaciones`, `prp_importacion_mapeos`, `prp_importacion_filas` · 055 `prp_consentimientos_contacto_vigentes`, `prp_seguimientos`, `prp_campanas`, `prp_campana_destinatarios`, `prp_encuestas`, `prp_nps_mensual`, `prp_satisfaccion_quejas` · 056 `prp_suscripcion`, `prp_cobros_suscripcion`, `prp_invitaciones`, `prp_soporte_tickets`, `prp_soporte_accesos` · 057 `prp_configuracion_clinica`, `prp_catalogos`, `prp_asistente_historial`, `prp_asistente_accesos` · 059 `prp_estado_clinica`.

## RPC (public)

- Clínica (admin): `rh_importar_checadas`, `vacaciones_generar_anio`, `vacaciones_dias_ley`, `esquema_comision_vigente`, `comisiones_registrar_detalle`, `comisiones_cerrar_periodo`, `comisiones_reabrir_periodo`, `nomina_calcular_periodo`, `nomina_autorizar_periodo`, `nomina_marcar_pagada`, `ot_regularizar`, `importacion_guardar_propuesta`, `importacion_resumir`, `importacion_confirmar`, `importacion_marcar_cargado`, `importacion_revertir`, `parametros_default`, `parametro_actualizar`, `suscripcion_solicitar_cambio_plan`, `suscripcion_actualizar_facturacion`, `suscripcion_podologos_activos`, `suscripcion_cargo_mensual`, `invitacion_crear`, `invitacion_revocar`, `exportar_clinica_catalogo`, `exportar_clinica_tabla`, `exportar_clinica_archivos`, `clinica_solo_lectura`.
- Otros roles: `campana_agregar_destinatarios`, `encuesta_crear` (Admin/Recepción), `nomina_firmar_recibo` (el empleado, solo su renglón).
- Portal (única con `anon`): `portal_responder_encuesta(token, calificación, comentario)`, security definer, token de un solo uso, devuelve solo `{ok}`.
- Solo `service_role`: `invitacion_consumir` (alta de usuario: crea el `perfil` al aceptar la invitación).
- Solo `rannix_staff` (verifican `piefirme_app.es_rannix()`): `rannix_panel_clinicas`, `rannix_panel_resumen`, `rannix_clinicas_por_suspender`, `rannix_cambiar_estado_org`, `rannix_marcar_vencida`, `rannix_registrar_pago`, `rannix_alta_clinica`, `rannix_tickets`, `rannix_responder_ticket`. Devuelven solo metadatos (conteos, plan, estado, uso, MRR).

## Estados (check constraints)

Empleado `activo|inactivo|baja` · asistencia `presente|retardo|falta|justificada|descanso|sin_entrada` · incidencia `registrada|aplicada|anulada` · vacaciones `solicitada|autorizada|tomada|cancelada` · vacante `abierta|en_proceso|cubierta|cancelada` · candidato `recibido|entrevista|prueba|oferta|contratado|descartado` · periodo de comisiones `por_cerrar|cerrado` · nómina `creado|calculada|autorizada|pagada` · CFDI de nómina `no_aplica|borrador|timbrado` · equipo `vigente|falla|en_proceso|baja` (+`vencido` derivado) · OT `solicitado|autorizado|en_proceso|cerrado|rechazado` · importación `subido|mapeo_propuesto|vista_previa|confirmado|cargado|revertido|descartado|error` (pasos subir/mapeo/vista_previa/confirmar) · fila `valido|advertencia|error|duplicado` · mapeo `aceptar|revisar|elegir_campo` · campaña `borrador|programada|enviada|cancelada` · destinatario `pendiente|enviado|fallido|respondio|agendo` · encuesta `nps_post_visita|satisfaccion_queja` · suscripción `prueba|activa|vencida|suspendida|cancelada` · cobro `proxima|pendiente|pagada|vencida|cancelada` · invitación `pendiente|aceptada|expirada|revocada` · ticket `abierto|en_atencion|esperando_clinica|resuelto|cerrado` · organización `prueba|activa|suspendida|baja` (001).

## Buckets (todos privados, URL firmada, `<organizacion_id>/…` en el primer segmento)

`expedientes` (Admin/Podólogo) · `fotos-clinicas` (Admin/Podólogo, 10 MB) · `documentos` (todos; `rh/…` solo Admin y cada empleado su carpeta de recibos) · `comprobantes` (Admin/Recepción) · `importaciones` (Admin) · `logos` (lectura de la clínica, escritura Admin). Escritura exige `piefirme_app.org_activa()`; borrar solo Admin. Límites de tamaño y MIME se aplican cuando el motor tiene esas columnas (Supabase).

## Equivalencias con IRP

| IRP | Pie Firme |
|---|---|
| `rh_empleados` (+ datos completos, tipo de contratación, bono) | `empleados` (domicilio y contacto de emergencia en jsonb) |
| `rh_historial_sueldo` + `fn_cerrar_sueldo_anterior` | `empleado_sueldo_historial` + trigger automático al cambiar salario |
| `rh_checadas` + `fn_consolidar_dia_asistencia`, `rh_asistencia` | `checadas` + `app.consolidar_asistencia`, `asistencia` (hora local de la clínica, tolerancias en parámetros) |
| `rh_tipos_incidencia`, `rh_incidencias` | `tipos_incidencia_rh` (por clínica), `incidencias_rh` |
| `rh_vacaciones_anio/detalle` + recalcula | `vacaciones_anio/detalle` + `app.recalcular_vacaciones_anio` |
| TabReclutamiento | `vacantes`, `candidatos` |
| TabNomina / TabRecibosNomina | `periodos_nomina`, `prenomina`, `nomina_*`, `prp_recibos_nomina` |
| `prp_asistencia_semana`, `prp_vacaciones_*`, `prp_historico_sueldos` | mismas vistas con `organizacion_id`/`sede_id` |
| `mantenimiento_solicitudes` + `trg_mantenimiento_flujo` + `mantenimiento_historial` | `ordenes_trabajo` + `app.ot_flujo` + `ot_historial` |
| `ordenes_trabajo.evidencias` (jsonb) / bucket `ot-evidencias` | `ot_evidencias` (fila por archivo) en bucket `documentos` |
| `cat_categoria_mantenimiento` | `catalogos_clinica` (`categoria_ot`) |
| `irp_usuarios` + roles | `perfiles` + invitaciones |
| políticas `using (true)` de storage | políticas por `organizacion_id` en la ruta |

## Reglas cubiertas por constraint/trigger/RLS

P-099 periodo de comisiones cerrado solo lectura (trigger) y nómina autorizada con montos congelados (trigger); P-104 sin timbrado (`cfdi_estado` por defecto `no_aplica`); P-106 sin % por defecto (columnas en 0; sin esquema vigente el registro de detalle falla); P-108 esquema vigente a la fecha del servicio, esquema nuevo cierra el anterior (trigger), ajustes con referencia; P-110 días de ley (`vacaciones_dias_ley`) y descuento por tipo de incidencia; P-112 transiciones de OT, urgentes hasta el tope sin autorizar y regularización obligatoria antes de cerrar; P-113 `cobro_automatico = false` por check; P-114 prueba 14 d y gracia 7 d como parámetros, clínica suspendida/baja en solo lectura por `piefirme_app.org_activa()` en todas las políticas y trigger `proteger_organizacion` (el admin no cambia plan/estado/prueba); P-119 invitación de un solo uso con token hasheado, una cuenta = una clínica; P-121 acceso temporal de soporte ≤ 7 días con motivo, solo metadatos en el panel; P-122 nada se carga sin confirmación de Administrador, reversa solo si no se modificó; P-123 mapeos clínicos o con confianza < umbral nacen en «revisar»; P-125 cada acceso del asistente queda en `asistente_accesos_datos` y, si identifica paciente, en bitácora; P-128 aislamiento total (RLS + storage + exportación con `organizacion_id` de la sesión); P-053 solo Administración programa campañas; P-148 consentimientos separados e históricos, exclusión automática de destinatarios sin consentimiento comercial; P-054 una encuesta NPS por paciente cada 90 días y sin consentimiento no se crea, ≤ 6 marca atención sin crear queja; CA-19 equipo vencido derivado y costo del mes por OT cerradas; CA-18 comisión cerrada entra a la quincena de su fecha de cierre; CA-08 importación solo Administrador.

## Reglas que quedan en la app / función servidor

- Cálculo de la **base comisionable** (cobrado sin IVA, neto de descuentos y reembolsos, solo ingresos validados): la app la toma de las líneas de venta validadas del dominio comercial y la entrega a `comisiones_registrar_detalle`. Cancelaciones posteriores al cierre → renglón `ajuste` en el siguiente periodo.
- Carga efectiva de la importación a las tablas de otros dominios y borrado de la reversa (la BD registra `registro_tabla/registro_id` y devuelve la lista); detección de duplicados (P-006); llamada al adaptador de IA (sin llave: se guarda `ia_modo` y la propuesta JSON).
- Envío real de campañas y encuestas (WhatsApp/correo), plazo de 24 h tras cita atendida y disparo automático; baja en cada mensaje (inserta un `consentimientos_contacto` con `otorgado=false`).
- Envío del correo de invitación, creación del usuario en `auth.users`, 2FA, bloqueo por 3 intentos / 15 min y sesión de 60 min (la BD guarda los parámetros).
- IMSS/ISR/subsidio de la prenómina (captura manual; P-104), generación del PDF de recibo y exportación al contador.
- Criterio «podólogo activo = acceso **o agenda** en el mes»: la vista cuenta acceso/alta en el mes; sumar la agenda es de la app.
- Empaquetado de la exportación (la BD entrega tablas por páginas y la lista de archivos; el servidor firma URLs y arma el ZIP) y respaldo diario.
- Cuota de almacenamiento 25 GB con aviso al 80 %: la BD expone bytes (panel RANNIX) y parámetros; el bloqueo lo aplica la app.

## Huecos y decisiones a revisar

1. `plantillas_documento` (E17) la define el dominio A en 010; 057 solo agrega la FK `campanas.plantilla_id`. `consentimientos_contacto` (D) convive con el consentimiento firmado de A (010): este último es el documento firmado, el de D es el permiso de contacto por canal.
2. Quejas (E67) no son de D: `encuestas.queja_id` y `consulta_id` son uuid sin FK; `campanas.oferta_id` también.
3. Las sedes de la semilla se buscan por clave/nombre; si otra semilla crea las mismas con otras claves se respetan.
4. Semilla con porcentajes de comisión de ejemplo (5/10/5 %); en producción los fija el cliente.
5. Las funciones `rannix_*` se otorgan a `authenticated` pero fallan si el usuario no está en `rannix_staff`; el panel debe llamarlas desde una función servidor.
6. `organizaciones.parametros` ya recibe los valores iniciales por trigger; las claves nuevas del dominio B/A que no estén en `parametros_default()` no pasan por `parametro_actualizar` (agregarlas ahí).
