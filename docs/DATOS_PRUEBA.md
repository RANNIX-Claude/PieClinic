# Datos de prueba de operación (Tarea 0) — estado al 2026-11-07

Ambiente: **QA** (BITDATA, esquema `piefirme`). Nada en producción. Organización de prueba `00000000-0000-0000-0000-00000000c0de`.

## Cuentas por rol (clave `123456`, solo QA)
`a@g.com` superadmin · `m@g.com` administrador · `p@g.com` podólogo · `r@g.com` recepción (`scripts/qa-usuarios-prueba.mjs`, ver `docs/ACCESOS.md`). El paciente no tiene cuenta (portal público).

## Capas de datos (todas deterministas e idempotentes)
| Semilla | Qué genera | Cómo se corre |
|---|---|---|
| `supabase/semillas/A_*…D_*` | Catálogos, 40 pacientes clínicos, 93 consultas, planes, finanzas, RH, mantenimiento, plataforma | Ya aplicadas |
| `supabase/semillas/E_*` | Historial de 12 meses: citas, tickets, pagos, caja, cortes, gastos, asistencia | `scripts/cargar-historial.mjs qa` |
| **`datos/F_01_poblacion_y_reasignacion.sql`** | +1,400 pacientes (`SINT-F:n`), aviso de privacidad (95 %), contactos de emergencia (70 %); reparte las 8,130 citas entre ellos (máx. 19 visitas por paciente); primera visita y fecha de alta coherentes | `node datos/cargar-datos.mjs qa F_01 [--ensayo]` |
| **`datos/F_02_consultas_clinicas.sql`** | Una consulta por cita atendida (5,703), con diagnóstico, signos vitales y procedimiento; firmas y cierre por el ciclo real; tutores de menores | `node datos/cargar-datos.mjs qa F_02 [--ensayo]` |
| **`datos/F_03_devoluciones_cobranza_portal.sql`** | 11 devoluciones (reembolso en ingresos + reingreso a inventario por los triggers reales), 691 cuentas por cobrar de citas sin ticket (cobrada 288 · parcial 143 · pendiente 228 · cancelada 32), 4,286 consumos de insumo, 2,688 reservas del portal (2,451 confirmadas ligadas a su cita + 217 fallidas/vencidas/horario ocupado), 607 ligas de cita | `node datos/cargar-datos.mjs qa F_03 [--ensayo]` |

`--ensayo` ejecuta todo y hace ROLLBACK, devolviendo un resumen. Purga: `pacientes.notas_administrativas like 'SINT-F:%'` (y `scripts/limpiar-datos-prueba.mjs` para la organización completa).

## Antes → después (QA, conteo exacto)
| | Antes | Después |
|---|---|---|
| Pacientes | 80 (40 sin citas, 40 con ~200 citas c/u) | 1,480 (1,344 con citas) |
| Consultas | 93 (sin cita ligada) | 5,796 (5,703 ligadas 1:1 a cita atendida) |
| Atendidas sin consulta | 5,703 | 0 |
| Consultas cerradas sin firma | — | 0 |
| Expedientes con última atención | 40 | 1,271 |

Escenarios de borde incluidos: pacientes sin aviso de privacidad (consulta queda en `pendiente_firma`, P-004), menores sin tutor (P-005), pacientes inactivos (4 %), diabetes por edad (tipo 2 en ~38 % de mayores de 55), dictado por IA (7 % de las notas), homónimos razonables (`homonimo_confirmado`).

## Reglas reales que las semillas respetaron (y dejaron casos)
- P-004 aviso de privacidad y P-005 tutor de menor: consultas que no se pueden cerrar quedan en `pendiente_firma`.
- P-099 periodo cerrado: los periodos hasta el 9-oct-2026 están cerrados, por eso solo hay 11 devoluciones (fechadas desde el 10-oct, sobre tickets desde el 26-sep). Más volumen exigiría reabrir periodos, que no se hace en datos de prueba.
- El token de Supabase se lee de `.env.local` (la variable de entorno del usuario da 403 en este proyecto).

## Tablas que siguen vacías (30 de 209) y por qué
| Grupo | Tablas | Motivo |
|---|---|---|
| Seguridad y errores (se llenan solo con uso real) | `pin_intentos`, `pins_administrador`, `portal_intentos`, `log_errores`, `alertas_clinicas_vistas`, `soporte_accesos` | Son rastros de uso; sembrarlos sería inventar incidentes |
| Funciones simuladas sin llave | `dictados`, `dictado_propuestas`, `salas_videoconsulta`, `sala_eventos`, `clip_terminales`, `importacion_plantillas` | IA, video y Clip están en modo simulado |
| Archivos | `documentos_adjuntos`, `documentos_emitidos`, `empleado_documentos`, `proveedor_documentos`, `comprobantes_carga`, `ot_evidencias` | Requieren objetos reales en Storage |
| Finanzas y caja (tocan cortes ya cerrados) | `movimientos_caja`, `aplicaciones_cobro`, `ingreso_renglones`, `gasto_lineas`, `edr_pendientes`, `factura_global_ventas` | Alterarían cortes y periodos cerrados; pendientes de diseñar sobre el periodo abierto |
| Otros | `autorizaciones_admin`, `devoluciones_proveedor`, `entrega_pasos`, `paciente_fusiones`, `soporte_mensajes`, `usos_promocion` | Faltan casos de borde por sembrar |

## Huecos que siguen abiertos
1. Ninguna venta en estado `cancelada`, `por_cobrar` ni `cuenta_abierta` (solo cobrada 6,537, facturada 7, por_facturar 1). Las cancelaciones requieren autorización y periodo abierto: pendiente.
2. Los 40 pacientes clínicos de la semilla A siguen sin citas; quejas (5), encuestas (4), planes (17) y fotos (72) siguen ligados a ellos y no a los 1,400 nuevos.
3. ~~Agenda de hoy vacía~~ → resuelto con **F_04** (`datos/F_04_agenda_hoy.sql`): 206 citas marcadas `notas='SINT-HOY'` del 16 al 21-nov-2026 (45 hoy: 16 con llegada en sala, 6 en atención, 1 cancelada; confirmadas 142, por confirmar 63), repartidas en p@g.com y p1..p5@g.com con cabina propia y sin empalmes. Es relativa a la fecha de ejecución: para refrescarla en otra fecha, borrar las marcadas y volver a correr `node datos/cargar-datos.mjs qa F_04`.
4. 270 citas pasadas (de las semillas E) siguen en `por_confirmar`/`confirmada` con más de un día de vencidas; deberían estar atendidas o no asistidas. Se verán como pendientes en Alertas; decidir si se resuelven antes de la demo.
