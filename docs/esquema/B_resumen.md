# Dominio B · Comercial y agenda (migraciones 020-029)

Validación local: `node scripts/validar-sql-local.mjs --archivos 001,010,020,…,029` y la cadena completa (001-059) terminan sin errores, sin tablas sin RLS, sin políticas abiertas y sin vistas sin `security_invoker`. Semillas sintéticas en `supabase/semillas/B_00..B_02` (org `00000000-0000-0000-0000-00000000c0de`; prerrequisitos documentados en cada encabezado).

## Archivos y tablas

| Migración | Tablas | Notas |
|---|---|---|
| 020 catálogo | `servicios`, `productos`, `precios`, `contadores_folio_comercial` | Parámetros por defecto de la clínica en `organizaciones.parametros` (trigger al crear la org + backfill). Precios con histórico (nunca se sobrescriben), por sede y programables. Helpers `app.crear_politicas`, `app.b_triggers`, `app.param_*`, `app.siguiente_folio_comercial`. |
| 021 ofertas | `ofertas`, `oferta_componentes`, `planes_adquiridos`, `plan_sesiones_consumo`, `membresias_paciente`, `gift_cards`, `gift_card_movimientos`, `usos_promocion` | Paquete / plan multisesión / membresía / gift card / promoción en una sola tabla con `tipo`. |
| 022 agenda | `horarios_atencion`, `bloqueos_agenda`, `festivos` | El podólogo edita su horario; vacaciones solicitadas por el podólogo las autoriza el Administrador. |
| 023 citas | `citas`, `cita_estados_historial`, `lista_espera`, `reservas_portal`, `pins_administrador`, `pin_intentos`, `autorizaciones_admin` | Conflicto de agenda, sobrecupo, estados y reprogramaciones por trigger. |
| 024 portal | `organizaciones_portal`, `portal_podologos`, `ligas_cita`, `portal_intentos` | RPC públicas `portal_*`. |
| 025 anticipos | `clip_cuentas`, `clip_terminales`, `anticipos`, `pagos_clip` | Clip como adaptador SIN llaves (solo referencia al secreto). |
| 026 caja y ventas | `turnos_caja`, `movimientos_caja`, `ventas`, `venta_lineas`, `pagos`, `devoluciones_venta`, `cortes_caja` | `pagos` es la tabla de pagos de venta (nombre por contrato con C). |
| 027 CFDI | `pac_configuracion`, `emisor_fiscal`, `cfdi_receptores`, `facturas`, `factura_conceptos`, `cfdi_cancelaciones`, `notas_credito`, `factura_global_ventas` | Adaptador de PAC sin llave; CSD solo como ruta/referencia. |
| 028 recordatorios | `recordatorios` | Cola de mensajes con canal correo/SMS/WhatsApp/wa.me. |
| 029 cierre | (vistas y mantenimiento) | `mantenimiento_comercial()`. |

Totales: 46 tablas nuevas, 28 vistas, 93 funciones (helpers app.* y RPC piefirme.*) (más FKs hacia `pacientes`, `perfiles`, `sedes`, `cabinas`).

## Vistas `prp_*` (security_invoker)

`prp_servicios`, `prp_productos`, `prp_precios_historial`, `prp_ofertas`, `prp_planes_adquiridos`, `prp_gift_cards`, `prp_membresias`, `prp_horarios_atencion`, `prp_bloqueos_agenda`, `prp_lista_espera`, `prp_reservas_portal`, `prp_portal_podologos`, `prp_anticipos`, `prp_pagos_clip`, `prp_ventas`, `prp_venta_lineas`, `prp_turnos_caja`, `prp_cortes_caja`, `prp_facturas`, `prp_facturacion_pendiente`, `prp_notas_credito`, `prp_recordatorios`, `prp_agenda`, `prp_citas_sin_cobro`, `prp_ingreso_por_servicio`, `prp_ventas_por_dia`, `prp_ocupacion_podologo_dia`, `prp_vigencias_por_vencer` (28).

## RPC (public)

- **Personal autenticado:** `precio_vigente`, `disponibilidad`, `citas_afectadas_por_bloqueo`, `generar_liga_cita`, `definir_pin_administrador`, `autorizar_con_pin`, `registrar_reembolso_anticipo`, `cobrar_venta`, `cancelar_venta`, `aplicar_descuento_global`, `reimprimir_ticket`, `cerrar_turno`, `revisar_turno`, `crear_factura_desde_venta`, `timbrar_factura_simulado`, `emitir_nota_credito`, `generar_factura_global_borrador`, `reenviar_recordatorio`.
- **Solo servidor (`service_role`):** `servicio_pago_reserva` (resultado de Clip, idempotente por `clip_payment_id`), `servicio_marcar_timbrada`, `servicio_marcar_nota_credito`, `servicio_recordatorios_pendientes`, `servicio_preparar_recordatorio`, `servicio_resultado_recordatorio`, `mantenimiento_comercial`.
- **Portal público (`anon`, security definer, `search_path` fijo):**

| RPC | Devuelve / hace | Límites |
|---|---|---|
| `portal_catalogo(slug)` | sedes, servicios publicados con precio y anticipo, podólogos visibles | 120/h por IP; solo clínicas con portal activo |
| `portal_disponibilidad(slug, sede, servicio, podólogo, desde, hasta, tipo)` | solo horarios libres (sin datos de pacientes); «cualquiera disponible» elige menor carga | ventana máx. 14 días, 400 filas, 120/h por IP |
| `portal_retener_horario(…)` | crea la reserva con retención de 10 min (o confirma de inmediato si no hay anticipo); alta/coincidencia de paciente, consentimientos, datos fiscales | 10 reservas/h por IP, 5/día por celular, máx. 3 reservas futuras activas por celular o correo; aviso de privacidad y términos obligatorios; el horario debe seguir libre |
| `portal_estado_reserva(slug, reserva, token)` | estado y folio | solo con el token de la reserva (se guarda su hash) |
| `portal_ver_cita(token)` | solo datos de ESA cita y qué acciones permite | 60/h por liga; 20 intentos inválidos/h por IP |
| `portal_accion_cita(token, acción, nuevo_inicio)` | confirmar / cancelar / reprogramar | liga de un solo uso (devuelve una nueva si la cita sigue viva); vence a la hora de la cita; reprogramar solo con ≥ 48 h y < 2 reprogramaciones |
| `portal_lista_espera(…)` | «avisarme si se libera un horario» | 10/h por IP; máx. 3 entradas activas por celular |

Ninguna tabla se expone a `anon`.

## Estados (check + trigger)

- Cita: por_confirmar → confirmada / no_asistio / cancelada; confirmada → en_camino (solo domicilio) / no_asistio / cancelada / atendida; en_camino → no_asistio / atendida; no_asistio → por_confirmar; revertir solo Administrador. Historial en `cita_estados_historial`.
- Lista de espera: esperando / notificado / agendado / vencida. Reserva portal: retenido / confirmada / pago_rechazado / vencida / horario_no_disponible. Liga: activa / usada / expirada / revocada.
- Anticipo: pendiente → pagado / vencido; pagado → aplicado / reembolsado / no_reembolsable. Oferta: programada / activa / pausada / vencida / cancelada. Plan adquirido: vigente / consumido / caducado / cancelado. Gift card: activa / canjeada / caducada / cancelada.
- Ticket: por_cobrar ↔ cuenta_abierta → cobrada → por_facturar → facturada; cancelada desde cualquier no final. Turno: abierto → cerrado → revisado.
- Factura: borrador → vigente → cancelacion_en_proceso → cancelada | vigente. Cancelación SAT: solicitada → esperando_aceptacion → aceptada | rechazada. Nota de crédito: borrador / emitida / cancelada.

## Reglas cubiertas por constraint o trigger (BD)

P-033 plazo de 48 h (`cancelacion_fuera_de_plazo`), P-034 anticipo calculado (`app.anticipo_servicio`; 30 % solo en el portal, sin anticipo en «a valorar», curaciones y $0), P-035 estado de reembolso y registro manual, P-036 retención de 10 min con bloqueo de horario, P-037 sin empalme de podólogo o cabina (lock por podólogo en la retención), P-038 contador de reprogramaciones y marca de exceso, P-041 vencimiento y ventana de lista de espera (trigger y mantenimiento), P-042 sobrecupo con autorización de Administrador y tope diario, P-043 margen entre citas, P-044 traslado de domicilio bloquea al podólogo, P-045 «No asistió» tras la tolerancia y revertir solo Administrador, P-047 bloqueos y vacaciones autorizadas, P-048 desempate por menor carga, P-049 limitación de tasa y topes del portal, P-051 cita sin borrado (cancelar con motivo; atendida/cancelada solo Administrador), P-055 descuento de Recepción ≤ 10 % sin PIN y motivo obligatorio, P-056/P-057 IVA por concepto y redondeo por línea (ticket = CFDI), P-058/P-059 un turno abierto por caja y por cajero, tolerancia de $50 y fórmula del corte, P-060 cancelar en el mismo turno / reimpresión «copia» / no cancelar con CFDI vigente, P-062 sin CFDI de anticipo automático, P-063 cancelación SAT con motivo 01-04, P-064 plazo de facturación en el mes y global solo en borrador, P-065 notas de crédito solo Administrador con tope y salida de caja, P-066 receptor congelado en el CFDI, P-068 precio congelado y no se sobrescribe, P-070/P-071 caducidad y valor prorrateado por sesión, P-073 gift card (pasivo al vender, canje por movimiento, sin promociones), P-074 promoción con vigencia y límite de usos, P-078 cobra siempre caja (el podólogo solo envía a caja), P-133 folios por sede, nunca reutilizados; serie fiscal por clínica.

## Reglas que quedan en la aplicación

P-039 envío real de recordatorios (la BD programa y lleva la cola), P-040 proveedor de WhatsApp, P-046 corte del día como corte de caja (la BD usa la fecha local del ticket), P-052 inactivos y revisión vencida (se calculan en reportes), P-053/P-054 campañas y NPS (dominio D), P-056 validación del contador, P-067 cálculo del precio vigente para mostrar (la BD lo ofrece con `precio_vigente`), P-075 anticipo y estudio acreditable de plantillas (parámetros listos; el cálculo lo hace la pantalla de venta), P-076 crédito, P-077 la comisión de Clip es gasto (dominio C) y la comisión del podólogo la calcula D desde `venta_lineas` validadas, P-079..P-087 inventario (C descuenta existencias al cobrar), P-084/P-085 venta sin existencia (aviso en la app), P-099 cierre de periodos de comisiones/nómina (D). El timbrado real, el cobro real con Clip y el envío de mensajes requieren las funciones de servidor y llaves que NO existen aún.

## Huecos y decisiones a revisar

1. El cobro real en Clip y el timbrado real del PAC dependen de funciones de servidor que llaman a `servicio_*`; hoy solo hay modo `simulado`.
2. Productos vendidos: C debe enganchar el descuento de inventario a `venta_lineas`/`ventas.estado` (la cancelación revierte por estado).
3. `receptores` CFDI es una tabla propia (`cfdi_receptores`) distinta de `datos_fiscales_paciente` (A); la pantalla debe copiar de una a otra.
4. Alta de paciente desde el portal usa las columnas reales de `pacientes` (010); si A cambia sus columnas obligatorias hay que ajustar `app.finalizar_reserva`.
5. La rejilla de horarios ofrecidos usa un paso técnico de 15 min (`paso_agenda_min`).
6. Los datos de ejemplo usan RFC de pruebas públicas del SAT y UUID simulados (sin validez fiscal).
