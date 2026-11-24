# MODELO DE ESTADOS

> **[VISTO]** = badge/botón en un mockup. **[INFERIDO]** = necesario pero sin pantalla. Las condiciones de transición ambiguas van a `PREGUNTAS_ABIERTAS.md`.

## cita
Estados: `agendada` [VISTO] · `por_confirmar` [VISTO] · `confirmada` [VISTO] · `en_sala` [INFERIDO] · `en_atencion` [INFERIDO] · `atendida` [INFERIDO] · `cancelada` [INFERIDO] · `no_asistio` [INFERIDO] · `bloqueo` [VISTO] (no es cita real, ver PA-A1).
| De → A | Disparador |
|---|---|
| agendada → por_confirmar | recordatorio enviado [INFERIDO] |
| por_confirmar → confirmada | paciente confirma |
| confirmada → en_sala → en_atencion | recepción / podólogo |
| en_atencion → atendida | "Cerrar consulta" (03) |
| agendada/por_confirmar/confirmada → cancelada | "Cancelar cita" (02) |
| confirmada → no_asistio | pasa la hora [INFERIDO] |
| cualquiera previo a atención → reprogramada (nueva cita ligada) | "Reprogramar" (02) |

## consulta
`abierta` → `cerrada` ("Cerrar consulta y enviar a caja", 03) → `cobrada` [INFERIDO]. Una consulta cerrada no se edita sin bitácora [INFERIDO, ver PA-C1].

## venta
`en_captura` [INFERIDO] → `pagada` ("Cobrar", 05) · `apartada` · `a_credito`/`a_plazos` (08) → `liquidada` · `cancelada` ("Cancelar venta", requiere autorización, 14) · `con_devolucion` parcial/total ("Devolución", 05).

## apartado
`vigente` [VISTO] → `por_vencer` [VISTO, calculado] → `vencido` [VISTO] → `liberado` ("Liberar vencido", 07). `vigente` → `liquidado` (abono final) → `entregado` [INFERIDO]. `vigente/por_vencer` → `vigente` con nueva fecha ("Autorizar prórroga", gerente).

## parcialidad / plan de pagos
`pendiente` [VISTO] → `pagada` [VISTO] / `vencida` [VISTO] (después de 10 días de gracia, parámetro). Plan: `vigente` → `liquidado` / `en_mora` [INFERIDO] / `bloqueado` (gerente, "Bloquear crédito").

## autorizacion
`pendiente` [VISTO] → `autorizado` [VISTO] / `rechazado` [VISTO] / `escalado` [VISTO, botón]. Nivel requerido se calcula por monto/tipo (parámetros de 12).

## turno de caja
`abierto` → `en_cambio_de_turno` [INFERIDO] → `cerrado` (corte) → `reabierto` (solo supervisor, 06) → `cerrado`. Diferencia `pendiente_de_aprobar` [VISTO, texto en 06].

## orden de compra
`borrador` [INFERIDO] → `aprobada` [INFERIDO] → `enviada` [INFERIDO] → `recibida_parcial` [VISTO, botón] → `recibida` → `cerrada`; `cancelada`. Recepción con diferencia puede generar devolución a proveedor [VISTO].

## traspaso
`solicitado` [VISTO] → `autorizado` [VISTO botón] → `en_transito` [VISTO] → `recibido` [VISTO] / `recibido_con_diferencia` [VISTO botón "Reportar diferencia"].

## inventario físico
`abierto` → `en_primer_conteo` → `en_segundo_conteo` (si hay diferencia, "Recontar" [VISTO]) → `con_ajuste_propuesto` → `ajuste_autorizado` → `cerrado`.

## orden de laboratorio
`prescrita` [INFERIDO] → `enviada` [VISTO] → `retrasada` [VISTO, calculado vs fecha prometida] → `recibida` / `en_prueba` [VISTO] → `entregada` [VISTO botón] ; `retrabajo` [VISTO botón] vuelve a `enviada`.

## ciclo de esterilización / set instrumental
Ciclo: `en_curso` → `conforme` / `no_conforme` ("Reportar falla" [VISTO]). Set: `sucio` → `esterilizado` → `en_uso` → `sucio`.

## paciente (activo/inactivo), crédito (bloqueado/no), promoción (vigente/vencida)
[INFERIDO]; sin pantalla.

---

# AMPLIACIÓN V2 — estados de las entidades nuevas

> Derivados del código (`src/store/acciones_*.js`, `reglas_personas.js`, `desempeno_motor.js`). **[VISTO]** = el estado y la transición existen en el código. **[INFERIDO]** = supuesto. No hubo mockups de la ampliación.

## empleado [VISTO]
`activo` → `baja` (solo administración o dirección; motivo obligatorio; desactiva la cuenta y calcula finiquito estimado) → `activo` por **reingreso** (reinicia fecha de ingreso; contrato a prueba 30 días).

## asistencia del día (calculado) [VISTO]
Estado **guardado** en el registro: `normal` · `retardo` · `falta` · `vacaciones` · `incapacidad`.
Estado **calculado** para una persona y fecha (`estadoDia`): `baja` · `vacaciones` · `incapacidad` · `permiso` · `normal` · `retardo` · `falta` · `descanso` · `programado` (fecha futura) · `pendiente` (hoy, aún sin entrada) · `sin_registro` (día pasado con control y sin marca).
| De → A | Disparador |
|---|---|
| pendiente → normal / retardo | el empleado registra su entrada (retardo si pasa la tolerancia) |
| normal / retardo → con salida | el empleado registra su salida |
| sin_registro → falta | el gestor de la sucursal «marca faltas» de un día pasado (no es automático) |
| falta → normal / retardo | la persona sí se presentó y checa ese mismo día |
| cualquiera sin entrada → vacaciones / incapacidad | se aprueba la ausencia |

## incidencia [VISTO]
Tipos que justifican (permiso, incapacidad, falta justificada): `solicitada` (la pidió el propio empleado o un gestor para sí mismo) → `aprobada` / `rechazada`; si la registra el gestor de otra persona nace `aprobada`. Tipos disciplinarios (llamada de atención, acta, otra): `registrada` (sin flujo).

## vacaciones [VISTO]
`solicitada` → `aprobada` (valida saldo otra vez) / `rechazada` (motivo obligatorio). `solicitada` → eliminada por **cancelación** (el propio empleado o su gestor) o por **baja** del empleado. Una aprobada no tiene cancelación en el código [observación].

## recibo de nómina [VISTO]
`generado` (se puede recalcular) → `firmado` (ya no se recalcula) → se puede quitar la firma (vuelve a `generado`). Timbrado [INFERIDO, fuera de alcance].

## movimiento de personal — aviso al IMSS [VISTO]
`pendiente_envio` (alta, baja, reingreso, cambio de sueldo) · `no_aplica` (cambio de puesto o sucursal). No hay transición a «enviado» en el código [observación].

## finiquito [VISTO]
`por_pagar` (al registrar la baja). Sin transición a pagado en el código [observación].

## curso [VISTO]
`borrador` ↔ `publicado` ↔ `archivado` (gerente, administración, dirección). Avance por persona (calculado): `sin_iniciar` → `en_curso` → `completo` (todas las lecciones vistas y evaluación aprobada si existe; emite constancia).

## acervo [VISTO]
`publicado` ↔ `archivado`. Cada edición sube la versión.

## gasto [VISTO]
`registrado` → **eliminado** (borrado de la lista por administración o dirección, con motivo en bitácora). Sin estados de autorización ni de pago [observación].

## gasto recurrente [VISTO]
`activo` / inactivo. Por mes: `pendiente` → `generado` (una sola vez por mes).

## nota de compra [VISTO]
Borrador de lectura (no se guarda) → **registrada** al confirmar. Sin cancelación en el código [observación]. Su cuenta por pagar sigue el flujo existente (pendiente → pagada).

## esquema de bono [VISTO]
`activo` ↔ `archivado` (administración o dirección). Marca `porValidar` hasta que alguien lo edita.

## bono (libro) [VISTO]
`calculado` (vivo, cambia con las ventas) → `aprobado` (congela monto y reparto; solo periodo terminado y monto > 0) → `pagado`. No hay reversa en el código [observación].

## propuesta de meta [VISTO]
`pendiente` → `aprobada` (fija la meta) / `rechazada`. Una propuesta nueva de la misma sucursal y mes sustituye a la pendiente.

## evaluación de cliente [VISTO]
`pendiente` (creada al cerrar la cita o a mano) → enviada (se anota canal y fecha; sigue `pendiente`) → `respondida`. Seguimiento de calificación baja (≤ 2): `nuevo` → `contactado` → `resuelto`.

## pedido en línea [VISTO]
`nuevo` → `preparando` → `listo` → `entregado` (crea la venta y descuenta inventario). `nuevo`/`preparando`/`listo` → `cancelado` (motivo obligatorio; libera las piezas).
Pago: `pendiente` → `pagado` (en línea simulado, o al entregar) → `por_reembolsar` (si se cancela ya pagado). «Reembolsado» [INFERIDO].

## auditoría de inventario a distancia (calculado) [VISTO]
`conforme` (sin diferencias) · `con_alertas` (alguna diferencia sin atender) · `en_investigacion` (alguna investigación abierta) · `resuelta`. Por producto: `ok` / `diferencia` → resolución por `ajuste` (genera autorización) o `investigacion`.
Cumplimiento por sucursal: `nunca` · `al_dia` · `vencida` (más de 7 días sin auditar).

## investigación de inventario [VISTO]
`abierta` → `cerrada` (solo gerente, administración o dirección; conclusión obligatoria).

## acción propuesta por el asistente [VISTO]
`propuesta` → `ejecutada` (confirmación del mismo usuario) / descartada.

## correo interno [VISTO]
`borrador` → enviado. Por destinatario: no leído ↔ leído, destacado, archivado.

## publicación del feed [VISTO]
Publicada → editada / eliminada; `fijado` sí/no.

## documento de la clínica [VISTO en semilla; acciones en construcción]
`vigente`; vencimiento calculado contra la fecha de vigencia.

## corrida de ETL [VISTO]
Cada corrida guarda duración por proceso, conteos, totales y el resultado del cuadre (cuadra / con diferencia).
