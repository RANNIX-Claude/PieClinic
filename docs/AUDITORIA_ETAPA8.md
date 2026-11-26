# Control y Auditoría — Etapa 8: servicios

Alcance: especificación §F5.5 «Control de servicios» y F3.4 (cuadre de kits, ahora por periodo). Migraciones **280–282**, pruebas en `scripts/test-auditoria-servicios-qa.mjs` y `src/lib/auditoria/servicios.test.mjs`. Lo decidido en las etapas anteriores (`AUDITORIA_ARQUITECTURA.md`) sigue vigente.

## 1. Qué hace

Tres amarres independientes; ninguno sustituye a los otros.

1. **Expediente de atención ligado a cobro** (`ctl_atencion`). Toda atención abre un registro con referencia **opaca** del paciente, quien atiende, sucursal, servicio y hora de inicio (del servidor). **No se cierra sin ticket**; cancelarla exige motivo y la clave (PIN) de un supervisor distinto. El piloto **no guarda nota clínica**: no existe columna para ella (se prueba), para no entrar al régimen de datos sensibles de salud de la LFPDPPP. Reporte de atenciones sin cobro por sucursal y por persona, y alerta de atenciones abiertas demasiado tiempo.
2. **Cuadre de insumos por periodo** (semana, mes o total) y sucursal: consumo real del inventario contra teórico (`servicios cobrados × ctl_consumo_esperado`), con diferencia en piezas y en valor al costo, y la tabla servicios cobrados · kits usados · atenciones con las **horas exactas** de las atenciones que nunca llegaron a ticket.
3. **Ocupación del puesto** (*posterior al piloto*, sin hardware): tabla `ctl_ocupacion`, registro manual y cruce diario ocupaciones ↔ tickets de servicio.

## 2. Contratos de servidor (todas `SECURITY DEFINER`; sesión + clínica activa + capacidad en el servidor)

| RPC (`piefirme.`) | Capacidad | Hace |
|---|---|---|
| `ctl_atencion_abrir(id, sucursal, servicio, paciente_ref, atiende, hora_cliente)` | capturar | Idempotente por `id` del cliente. Valida sucursal, servicio y quien atiende (activo y de esa sucursal). Referencia `^[A-Za-z0-9_-]{3,40}$` o el servidor genera `A-XXXXXXXX`. |
| `ctl_atencion_tickets_candidatos(atencion)` | capturar | Tickets cobrados de esa sucursal con servicio compatible y capacidad libre (sin montos). |
| `ctl_atencion_cerrar_con_ticket(atencion, ticket)` | capturar | Exige que el ticket **exista, sea de esa sucursal, esté cobrado y contenga un servicio compatible** (mismo servicio o misma categoría) y que no esté ya agotado: un ticket cubre tantas atenciones como unidades de servicio cobradas. |
| `ctl_atencion_cancelar(atencion, motivo, supervisor, pin)` | capturar | Motivo de 5 a 300 caracteres; el autorizador es un supervisor o dueño **distinto** de quien cancela y de esa sucursal; PIN verificado (mismo bloqueo de 3 fallos / 15 min). Un PIN incorrecto **no** lanza error (devuelve `{ok:false}`) para que el intento quede registrado. Alerta `atencion_cancelada` (solo resumen diario). |
| `ctl_atencion_supervisores(sucursal)` | capturar | Quién puede autorizar. |
| `ctl_atenciones_listar(filtros)` | capturar | Lista de la sucursal; la marca `sin_ticket` solo se entrega a dueño y supervisor. |
| `ctl_atenciones_conciliar(sucursal)` | capturar | Liga solas las atenciones nacidas de una consulta cuyo ticket ya se cobró (por cita o por paciente y día). |
| `ctl_rep_atenciones_sin_cobro(filtros)` | ver_directo | Por sucursal y por persona, detalle y aviso. |
| `ctl_rep_cuadre_insumos(filtros)` | ver_directo | Cuadre por periodo (`agrupar`: semana, mes, total; `incluir_ajustes`). |
| `ctl_ocupacion_registrar(id, sucursal, inicio, fin, puesto, nombre, hora_cliente)` | capturar | Fuente `manual`; duración calculada por el servidor; sin futuro, sin traslape en el mismo puesto, ≤ 12 h, ≤ 35 días atrás. |
| `ctl_ocupacion_cruce(filtros)` | ver_directo | Cruce diario (≤ 62 días). |
| `ctl_servicios_evaluar_ahora()` | ver_directo | Liga atenciones cobradas, crea alertas de atenciones abiertas pasado el umbral y de ocupaciones sin ticket del día anterior (sin duplicar). |

Todo reporte registra su consulta en `ctl_bitacora_consulta`. **Ninguna** función interna (`piefirme_app.ctl_o_*`, `ctl_ticket_capacidad`, `ctl_atencion_autoligar`…) es ejecutable por la app ni por anon (se prueba). La lectura del origen (tickets de servicio, salidas de insumo, costo) vive solo en tres funciones `piefirme_app.ctl_o_servicios_cobrados`, `ctl_o_salidas_insumo`, `ctl_o_costo_producto`: si el origen cambia, se reimplementan esas tres.

## 3. Reglas de diseño

* **Inmutabilidad.** `ctl_atencion` y `ctl_ocupacion` no tienen INSERT/UPDATE/DELETE para ningún rol (probado con los cinco). Una atención cerrada o cancelada es definitiva (`t_20_atencion`; `paciente_ref`, servicio, quien atiende, inicio y origen nunca cambian). Restricciones de coherencia: `cerrada_con_ticket` exige ticket y cierre; `cancelada` exige motivo y autorizador. La ocupación no se corrige (`t_06_fija`); la duración la calcula el servidor.
* **Referencia opaca.** Sin nombre, sin id de paciente, sin nota. El hook de consulta guarda `'P-' + 10 hex` de un hash del id y la organización.
* **Captura a ciegas.** La sucursal captura y lista sus atenciones, pero **nunca** recibe saldos, diferencias, consumo esperado ni resultados de cuadre: los tres reportes responden PF403 a recepción, podólogo y soporte; `ctl_consumo_esperado` y `v_ctl_*` le devuelven cero filas.
* **Indicador, no acusación.** Cada reporte lleva un aviso («indicador para investigar») y marca «muestra pequeña» con menos de 10 atenciones; las alertas dicen «conviene revisarla».
* **Hora y dinero.** Todo con `now()` del servidor (UTC), `numeric`, nunca float. Topes en base de datos (`ctl_config_def`): `atencion_sin_ticket_min` 15–1440 (omisión 120), `ocupacion_ventana_cobro_min` 5–480 (omisión 60), `ocupacion_min_min` (5, ya existía), `atencion_auto_desde_consulta` si/no (omisión **no**). Se configuran en *Configuración de auditoría → Parámetros* (dueño; por sucursal con respaldo global).

## 4. Integración con el origen (decisión para el dueño)

Cómo registra Pie Firme las atenciones: `consultas` (una por visita, con `podologo_id`, `servicio_id`, `cita_id`) se crea desde la pantalla clínica; el cobro es `ventas` + `venta_lineas (tipo='servicio', servicio_id)`; la cita enlaza ambas (`ventas.cita_id`, único por cita). Todo se liga **por id, sin llave foránea dura**.

**Hook construido, apagado por omisión.** Trigger `AFTER INSERT` sobre `consultas` (`t_ctl_atencion`, función `piefirme_app.ctl_trg_consulta_atencion`) que abre la atención opaca. Es de bajo riesgo: no toca la pantalla clínica, está envuelto en un bloque que **nunca** frena la consulta (un error solo emite un aviso; se prueba forzándolo a fallar), no copia nombre, nota ni diagnóstico, y solo actúa si la sucursal pone `atencion_auto_desde_consulta = si`. Después, `ctl_atenciones_conciliar` (botón «Ligar las ya cobradas» y la evaluación periódica) cierra sola cada atención cuyo ticket ya se cobró (por la cita de la consulta, o por el mismo paciente el mismo día).

**Decisión pendiente del dueño:** encenderlo. Con él encendido, una consulta que **no se cobra** (control sin cargo, paciente que no pagó) queda como atención abierta y, pasado el umbral, genera alerta: eso es exactamente lo que se quiere detectar, pero también produce falsos positivos legítimos (consultas gratuitas por política) que se cancelan con motivo y clave. Mientras esté apagado, la captura es manual (pantalla *Atenciones*). Una consulta borrador abandonada también deja su atención abierta.

## 5. Cuadre de insumos

* **Teórico** = Σ (unidades de servicio cobradas × `ctl_consumo_esperado.cantidad` activo), por periodo local y sucursal. Servicio cobrado = ticket `cobrada`, `por_facturar` o `facturada`.
* **Real** = salidas negativas del insumo en `movimientos_inventario`: consumo de consulta, venta, merma, **ajuste y conteo** (casilla «Contar ajustes y conteos como consumo», activa por omisión) — **no** cuenta traspasos de salida ni devoluciones al proveedor. El desglose por tipo va en cada renglón para distinguir un servicio sin cobro de una merma o un ajuste.
* **Diferencia** = real − teórico en piezas y a `costo_promedio` del producto; estado `cuadra` si |diferencia| ≤ `tolerancia_kits` (0 por omisión), si no `consumo_mayor` o `consumo_menor`. **Servicios sin cobro (est.)** = diferencia ÷ (teórico ÷ servicios); con varios insumos por servicio la tabla servicios/kits toma el mayor.
* **Criterio 20 (probado en QA):** 10 tickets + 12 consumos de un kit = teórico 10, real 12, +2 piezas, $100 al costo de $50, 2 servicios sin cobro, y las horas exactas de las dos atenciones sin ticket.
* El cuadre del cierre diario (F3.4, Etapa 4) no cambia; este es el reporte por periodo. La definición del consumo esperado es **la misma pantalla** que *Configuración → Consumo de insumos* (se reutiliza `ConsumoEsperado`, sin duplicarla) y también se abre desde la pestaña *Cuadre de insumos → Consumo esperado por servicio*.

## 6. Ocupación (fase posterior al piloto)

Marcada así en la interfaz. **No hay hardware ni sensores.** Quedan la tabla `ctl_ocupacion`, el registro manual (`fuente = 'manual'`) y el cruce: cada ocupación de duración ≥ `ocupacion_min_min` (5 min) toma el ticket de servicio más cercano a su fin dentro de ±`ocupacion_ventana_cobro_min` que nadie haya tomado; las que quedan sin ticket son **cobros faltantes con sus horas exactas**. Criterio probado: 12 ocupaciones y 8 tickets = 4 cobros faltantes (las cuatro últimas, con inicio y fin exactos), alerta `ocupacion_sin_cobro` una sola vez.

**Sensor recomendado:** celdas de carga bajo el sillón con un ESP32 (unos 15 a 20 USD en partes): señal inequívoca, no graba nada, sin implicaciones de privacidad. Contar cruces de puerta no sirve (el podólogo entra y sale varias veces): hay que medir la ocupación del sillón. Un radar mmWave multizona es más elegante pero en una cabina chica con dos personas pelea con la calibración. **Una cámara apuntada al sillón queda DESCARTADA** por privacidad: un paciente descalzo recibiendo un procedimiento, grabado, no vale el riesgo cuando un sensor da el mismo dato. Cuando haya sensor, entra por el mismo origen (`fuente = 'sensor_peso'`) vía `ctl_eventos_entrada`/un RPC de servicio; el cruce no cambia.

## 7. Archivos

Migraciones: `280_ctl_servicios_esquema.sql` (columnas, restricciones, triggers, parámetros, alertas), `281_ctl_servicios_atencion_rpc.sql` (lecturas del origen, RPC de atención, conciliación, hook), `282_ctl_servicios_reportes.sql` (reportes, ocupación, evaluación).
Lógica: `src/lib/auditoria/servicios.js` (+ `servicios.test.mjs`), `serviciosApi.js`.
Pantallas: `src/pages/auditoria/servicios/{Servicios,Atenciones,SinCobro,CuadreInsumos,Ocupacion}.jsx` y `fechas.js`. Ediciones mínimas: `src/menu/auditoria.js` (ítem *Servicios*), `src/routes/auditoria.jsx` (ruta `/auditoria/servicios`), `src/lib/permisos.js` (la ruta en `RUTAS_SUPERVISOR`).
Pruebas: `scripts/test-auditoria-servicios-qa.mjs`.

Roles: captura quien atiende o recepción (y supervisor/dueño) en su sucursal; ven reportes dueño y supervisor; configura el dueño; el soporte RANNIX no captura ni ve estos reportes (PF403, como ver_directo).

## 8. Pruebas y resultados (QA, 2026-11-26)

* `node --test src/lib/auditoria`: 103 pruebas, 0 fallas (13 son las de servicios: referencia opaca, sin columnas clínicas, cancelación, clase de atención, criterio 20, consumo real, ocupación 12 contra 8, duración mínima, ventana, roles, campos ciegos).
* `node --test scripts/test-auditoria-servicios-qa.mjs`: **43 pruebas, 0 fallas**, una transacción que se deshace. Cubren: la atención no cierra sin ticket (vacío, inexistente, de otra sucursal, sin cobrar, servicio incompatible, ticket agotado) y es definitiva; cancelar exige motivo, supervisor distinto y PIN (bloqueo tras 3 fallos); referencia opaca y ausencia de columnas clínicas; hook de consulta (apagado, encendido, conciliación, no frena la consulta al fallar); reporte de atenciones sin cobro por sucursal y persona con permisos por rol y bitácora; alertas sin duplicar y topes de parámetros; cuadre 12 kits contra 10 tickets con horas exactas (semana, mes, total, ajustes, traspaso excluido); sucursal sin resultados de cuadre por RPC, tablas ni vistas; ocupación 12 contra 8, duración mínima configurable, alerta única, sin edición; INSERT/UPDATE/DELETE denegados a los cinco roles; anon sin acceso.
* Migraciones 280–282 aplicadas a QA. `test-rls` tras ellas: **12 fallas, las mismas preexistentes** (10 `portal_*` con EXECUTE heredado de PUBLIC, `_rannix_semillas` sin RLS, bucket `comercio_img`); ninguna nueva. (La 282 se editó una vez antes de entregarse —se añadió la lista de horas al reporte— y se reaplicó en QA borrando su fila del registro; la versión final es la del archivo.)
* `vite build` compila. Humo en navegador (servidor en 5174, QA, Playwright): recepción ve *Atenciones* y *Ocupación*; el dueño ve las cuatro pestañas y la pestaña de consumo esperado reutilizada; sin errores de consola.

## 9. Decisiones que requieren al dueño

1. **Encender el hook de consulta** (`atencion_auto_desde_consulta`), sabiendo que una consulta sin cobro queda como atención abierta (ver §4).
2. **Quién autoriza la cancelación:** hoy es un supervisor o el dueño *distinto* de quien cancela. En una sucursal sin supervisor solo puede autorizar el dueño.
3. **Compatibilidad de servicio al cerrar con ticket:** mismo servicio o misma categoría (p. ej. dos servicios de Quiropodia). Si se quiere exacta, es un cambio de una línea en `ctl_ticket_capacidad`.
4. **Ajustes y conteos como consumo** (activo por omisión): un faltante detectado en un conteo suma al consumo real; quitarlo deja el cuadre solo con salidas operativas.
5. **Umbral de «sin ticket»:** 120 min por omisión (15 min a 24 h).
6. **Ocupación:** decidir cuándo se compra el sensor; mientras tanto es registro manual.

## 10. Lo no verificado

* Las pantallas se recorrieron en navegador contra QA **sin datos de servicios** (estados vacíos); los números 12/10 y 12/8 están probados en la base y en la lógica, no vistos en pantalla con datos. No se probaron en el navegador los modales de cerrar con ticket y de cancelar con PIN.
* La evaluación de alertas (`ctl_servicios_evaluar_ahora`) es **manual** (botón del dueño): hoy no hay planificador. Para automatizarla basta invocar `piefirme.ctl_servicios_evaluar_ahora` o `piefirme_app.ctl_servicios_evaluar(org)` desde el mismo planificador que use la Etapa 6 (no se tocó su script). Los envíos de las alertas siguen **simulados** (Etapa 6).
* Sin prueba de carga: el cruce de ocupación itera día × sucursal (62 días × sucursales) y la conciliación procesa hasta 500 atenciones por llamada.
* El hook de consulta se probó con inserciones directas en `consultas`; no con el flujo completo de la pantalla clínica.
* `consumo_consulta` es el tipo de movimiento que el origen debe emitir al consumir un insumo en una consulta; si hoy el consumo se registra de otra forma (p. ej. como `venta` o `merma`), el cuadre lo verá solo por esos tipos.
