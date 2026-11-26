# Control y Auditoría — Etapa 6: reportes, tablero y alertas

Alcance: especificación §F7 (F7.1 consulta de diferencias, F7.2 tablero de dueño, F7.3 alertas, F7.4 reporte mensual), las partes de reportes de §F1 (**F1.2** ventas por debajo de catálogo, **F1.5** aperturas de cajón sin venta, **F1.6** mezcla de formas de pago), la bitácora de consultas a reportes y la retención de fotos. Los reportes de seguimiento de casos (F4.5) ya están en la Etapa 3 (Casos → Seguimiento) y no se duplican. Migraciones **240–249**, pruebas `scripts/test-auditoria-reportes-qa.mjs` y `src/lib/auditoria/reportes.test.mjs`. Lo decidido en la Etapa 0 ([`AUDITORIA_ARQUITECTURA.md`](AUDITORIA_ARQUITECTURA.md)) sigue vigente.

## 1. Qué hay

| Pieza | Dónde | Quién entra |
|---|---|---|
| **Diferencias** (F7.1) | `/auditoria/diferencias` · `ctl_dif_consultar`, `ctl_reportes_opciones` | dueño, supervisor (sus sucursales), soporte en solo lectura |
| **Tablero** (F7.2) | `/auditoria` · `ctl_tablero` | ídem |
| **Reportes** | `/auditoria/reportes` (pestañas) | ver abajo |
| · Ventas bajo catálogo (F1.2) | `ctl_rep_ventas_bajo_catalogo` | dueño y supervisor |
| · Cajón sin venta (F1.5) | `ctl_rep_cajon`, tabla `ctl_apertura_cajon` | dueño y supervisor |
| · Formas de pago (F1.6) | `ctl_rep_mezcla_pago`, vista `v_ctl_pagos` | dueño y supervisor |
| · Reporte mensual PDF (F7.4) | `ctl_reporte_mensual` + `lib/auditoria/reporteMensualPdf.js` | dueño, supervisor, soporte |
| · Quién consultó qué | `ctl_bitacora_consultas_listar` | dueño y soporte RANNIX |
| · Retención de fotos | `ctl_retencion_resumen`, scripts | dueño y soporte RANNIX |
| **Alertas** (F7.3) | `/auditoria/alertas` · motor en la base (245) | dueño y supervisor atienden; dueño y soporte configuran; soporte lee |

El rol de sucursal (encargado, cajero, podólogo) **no entra a ninguna**: toda RPC responde `PF403` y las tablas nuevas le devuelven cero filas (la prueba lo verifica sobre cada RPC, cada tabla y cada vista). Soporte no lee ventas ni pagos crudos (D7): los reportes de caja son de dueño y supervisor.

## 2. F7.1 Consulta de diferencias

Una sola llamada agrega **en la base de datos** y devuelve un solo `jsonb` (PostgREST corta a 1,000 filas por respuesta; aquí se pagina de 100 en 100 y la exportación pide hasta 20,000 con `exportar: true`).

- **Filtros** (`p_filtros`): `desde`, `hasta` (fechas locales; por omisión 90 días; máximo 400), `sucursales[]` o `sucursal`, `auditor`, `producto`, `categoria`, `buscar` (nombre, código o SKU), `tipo` (`faltantes | sobrantes | ambas`), `umbral_piezas`, `umbral_pesos` (valor absoluto, **al costo**), `orden` (`valor` por omisión · `piezas · fecha · sucursal · producto`), `limite` (≤ 500), `offset`.
- **Qué es una fila:** la última captura vigente de cada producto en cada sesión (las correcciones son filas nuevas que referencian la anterior: la reemplazada no cuenta), con diferencia ≠ 0, sin sesiones canceladas y **sin conteo inicial** (fija el saldo de arranque; no es una diferencia). Columnas: fecha y hora, sucursal, producto, física, sistema, diferencia en piezas, diferencia al costo, auditor, estado del ajuste (el del caso: pendiente, ajustada, cerrada sin ajuste, rechazada, ajuste fallido o «sin caso»), nota, y el modo de la sesión. Clic en una fila abre su caso.
- **Orden por omisión:** mayor diferencia valorizada (valor absoluto) primero, no lo más reciente.
- **Encabezado:** faltantes y sobrantes en piezas y pesos al costo, neto, casos pendientes de ajuste (abierta, en investigación o ajuste fallido), casos ya ajustados, y los productos pedidos y no reportados (el silencio es dato).
- **Agrupaciones:** por sucursal (ranking por faltante valorizado), por producto (recurrencia = auditorías distintas con diferencia; primeros 25) y por auditor (**auditorías hechas** en el periodo, partidas contadas y las que salieron con diferencia). La recurrencia y el conteo de auditorías se rotulan como *indicador para investigar*.
- **Exportación** a Excel (hojas Diferencias, Resumen, Por sucursal, Por producto, Por auditor; reutiliza `exportarExcel` de `lib/finanzas/exportar.js`) y a PDF (horizontal, varias páginas, tope de 1,500 renglones: para el detalle completo, Excel). Ambas respetan los filtros y quedan en la bitácora de consultas (`diferencias:exportar`).
- **Bitácora:** cada llamada inserta en `ctl_bitacora_consulta` (usuario, rol, reporte, filtros y `filas_resultado`). La escribe el servidor, no la pantalla.
- **Rendimiento:** ver §10 (90 días × 7 sucursales con 63,000 partidas: menos de 1.2 s en QA).

## 3. F7.2 Tablero de dueño

Una sola pantalla responsiva, una sola llamada (`ctl_tablero(p_dias)`, 7–180 días, 30 por omisión; se refresca cada minuto):

- **Siete tarjetas:** cierres de hoy (hechos de N y cuántos faltan), sucursales sin conteo de apertura, entregas sin aceptar, casos abiertos (con ajustes fallidos y sin asignar), alertas sin atender, auditorías remotas en curso, sucursales sin sincronizar.
- **Sucursales hoy:** una tarjeta por sucursal con apertura (`hecha / en curso / falta (ya es tarde) / pendiente`), cierre, entregas pendientes, casos, alertas, y última señal («sin sincronizar» en rojo).
- **Diferencia valorizada del periodo** (faltantes, sobrantes, neto) **contra el periodo anterior** y su tendencia diaria (Recharts, áreas).
- **Casos abiertos por antigüedad** (0–2, 3–7, 8–14, 15–30, más de 30), **alertas** sin atender, **entregas de turno sin aceptar** (criterio 18) y **auditorías remotas en curso** con su avance y minutos restantes.
- **Definiciones:** *operó hoy* = hubo una venta cobrada o se abrió un turno de caja hoy (una sucursal cerrada ese día no se marca «sin cierre»); *cierre del día* = un cierre de turno o de día cerrado hoy; *sincronizó* = última señal de vida en el módulo (partida, sesión, captura de cierre, cierre o foto; lo que la PWA de la Etapa 5 envía al volver la señal); una sucursal que **nunca** usó el módulo aparece como «No usa el módulo» y no genera alertas de omisión.
- Parámetros (Configuración de auditoría, con tope validado en base de datos): `alertas_hora_sin_apertura` (11), `alertas_hora_sin_cierre` (22), `salud_sync_horas` (24, tope 720); todos por sucursal con respaldo global y versionados.

## 4. F7.3 Alertas

**Regla de diseño: pocas alertas que importen.** Todo evento nace en `ctl_alerta` (lo crean los motores de las Etapas 2–4, las evaluaciones programadas y, después, el punto de venta y la custodia con `piefirme_app.ctl_alerta_nueva`, que toma severidad y destinatarios del catálogo y no duplica por referencia). Un trigger (`t_30_despachar`) despacha cada alerta nueva; **una falla del despacho nunca tumba la operación** que generó la alerta.

1. **Catálogo** (`ctl_alerta_catalogo`, del sistema; se cambia con migraciones): los eventos de la tabla de la especificación — cancelación autorizada, venta de pieza de alto valor, diferencia en relevo (`relevo_con_diferencia` de piezas y `diferencia_relevo` de efectivo), cierre fuera de tolerancia, sello roto sin registro, folio de talonario faltante, sucursal sin conteo de apertura, sin cierre, posible sustitución de código, kits sin ticket, ajuste rechazado por el origen — con canal y destinatario por defecto como pide la especificación, más los eventos propios del sistema que ya existían (foto repetida, faltante con cancelación, auditoría remota vencida/solicitada, conteo con diferencias, apertura tardía, apertura sin cierre previo, cierre sin apertura, entrega liberada, sin sincronizar), rotulados «propio del sistema».
2. **Reglas por organización** (`ctl_alerta_regla`, **versionadas**: gana la fila más reciente; nada se actualiza): canales (`push · whatsapp · correo`), destinatarios (`dueno · supervisor · sucursal`), inmediata o solo resumen, activa. Las cambia el dueño (o el soporte, que tiene «configurar») desde *Alertas → Eventos y canales*.
3. **Destinatarios:** dueño = `administrador` que **no** es soporte RANNIX (D7); supervisor con acceso a la sucursal; «sucursal» = dispositivos de la sucursal (solo el aviso de auditoría remota, sin cifras). Cada persona puede apagar sus alertas.
4. **Techo diario por destinatario** (`ctl_alerta_destinatario`, versionado; `techo_diario` 1–200 o el general `alertas_techo_diario`, 10): cuenta solo las alertas **inmediatas** del día (en la zona de la clínica). Mientras no se exceda, una fila «individual» por canal; **al excederlo se escribe un solo aviso de techo** y el resto se agrupa como «pendiente de resumen». Los eventos de «solo resumen» (folio de talonario, conteo con diferencias, sin sincronizar…) **no cuentan** para el techo. *Decisión por defecto:* ninguna severidad salta el techo (la bandeja y el tablero muestran todo).
5. **Resumen diario** (`ctl_resumen_diario`): un correo por persona con lo agrupado por tipo, si se alcanzó el techo y cuántas alertas siguen sin atender. Idempotente por persona, día y canal. Se genera con el botón «Generar resumen de hoy», con `scripts/auditoria-alertas-programadas.mjs --resumen` o con la función de Netlify.
6. **Bandeja** (`ctl_alertas_listar`, `ctl_alerta_atender`): filtros por estado, severidad, evento y sucursal; marcar vista o atendida (con nota); un supervisor solo ve las de sus sucursales; el soporte solo lee (y queda en la bitácora).

### Envíos SIMULADOS (sin llaves)
No hay proveedor de Push, WhatsApp ni correo. Todo envío se registra en `ctl_alerta_envio` con `simulado = true` («lo que se habría enviado»: canal, destino, asunto, mensaje, modo) y la pantalla lo rotula en cada vista (franja morada + insignia SIMULADO). Contrato listo: `src/lib/adaptadores/alertasAuditoria.js` (`enviarAlerta({canal, destino, asunto, mensaje})`) y `netlify/functions/auditoria-alertas-programadas.js`. Cuando haya proveedor, un proceso de servidor consumirá los envíos y registrará una fila nueva con `simulado = false`; la base ya decidió a quién y cuántas.

### Evaluaciones programadas — hoy NO hay planificador
`piefirme.ctl_alertas_programadas(p_org, p_ahora)` (solo `service_role`) evalúa por sucursal: sin conteo de apertura (solo si la frecuencia es «diario a la apertura» y la sucursal ya operó hoy), sin cierre, sin sincronizar; además detecta cancelaciones y ventas de piezas de alto valor del origen de los últimos 2 días. **Cada hallazgo se emite una vez por día y sucursal** (referencia `dia:AAAA-MM-DD`) y `p_ahora` permite probar «a la hora configurada» con un reloj simulado. Cómo invocarlo hoy:
- botón **Evaluar ahora** (dueño o soporte) o **`node scripts/auditoria-alertas-programadas.mjs qa [--resumen] [--ahora=ISO] [--org=uuid]`**;
- función de Netlify `auditoria-alertas-programadas` (POST con `x-cron-secret`); para que corra sola basta descomentar `export const config = { schedule: '*/15 * * * *' }` y definir `AUDITORIA_CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` en Netlify (ningún despliegue se hizo).
- *Cancelación autorizada:* la Etapa 1 (en el origen) aún no emite «cancelación autorizada»; mientras tanto se alerta cada cancelación observada en `ventas`. Cuando exista el evento, se liga a él.
- *Sello roto sin registro y folio de talonario faltante:* los emitirá la Etapa 7 con `piefirme_app.ctl_alerta_nueva(org, sucursal, 'sello_roto_sin_registro' | 'folio_talonario_faltante', mensaje, referencia_tipo, referencia_id)`; el catálogo, la regla, el techo y el resumen ya los contemplan.

## 5. Reportes de caja (F1.2, F1.5, F1.6)

Se leen del origen **solo por vistas del contrato** (`v_ctl_ventas`; se añadió `v_ctl_pagos`, novena vista, porque la mezcla de pago necesita montos por método y `v_ctl_ventas` solo trae la lista de métodos de la línea). Cada consulta queda en la bitácora.

- **Ventas bajo catálogo:** ticket, fecha y hora, sucursal, caja, cajero, producto, precio de catálogo vigente al momento de la venta, precio cobrado (importe ÷ cantidad), diferencia en pesos, motivo de descuento y autorizador; totales por cajero y por sucursal; el contador «sin motivo ni autorizador» resalta lo que más conviene revisar. **Lo que el origen todavía no da (declarado en pantalla y en `limitaciones` de la respuesta; para la Etapa 1):** (a) `v_ctl_ventas` solo expone el precio de catálogo de **productos**, no de servicios; (b) el motivo de descuento es **texto libre** (no hay catálogo cerrado de motivos ni tope porcentual con clave de supervisor); (c) el precio sigue siendo editable en caja (justo lo que este reporte detecta); (d) el autorizador solo existe si el descuento quedó ligado a una autorización.
- **Cajón sin venta:** el origen **no emite** `cajon_abierto_sin_venta` todavía. La tabla `ctl_apertura_cajon` y el reporte están listos: un evento en `ctl_eventos_entrada` con `payload { sucursal_id, usuario_id, caja, motivo?, fecha? }` llena la tabla por trigger (idempotente por evento; un payload sin sucursal solo avisa, no frena al origen). Sin eventos la pantalla muestra un **estado vacío honesto** explicando el cambio pendiente; con eventos, por cajero y por sucursal y el comparativo en aperturas por cada 100 tickets contra el promedio de la cadena.
- **Formas de pago:** proporción efectivo / tarjeta (tarjeta + Clip) / otros (transferencia, anticipo, gift card) **por monto**, por sucursal y por cajero, con el promedio de la cadena y los puntos de desviación; solo se marca «para investigar» con muestra suficiente (`minimo_tickets`, 30) y desviación de 15 puntos o más (configurables en la consulta). **Siempre** rotulado como indicador para investigar, nunca hallazgo (franja en la pantalla, frase en cada fila, y la prueba revisa que ni la respuesta ni la frase usen «hallazgo», «culpable» o «robo»).

## 6. F7.4 Reporte mensual

`ctl_reporte_mensual(mes)` devuelve los datos; el cliente arma un **PDF de exactamente dos páginas** con un generador mínimo sin dependencias (`lib/auditoria/pdf.js`: el repo no trae librería PDF —su «PDF» es la impresión del navegador— y se necesitaba una descarga real; texto Helvetica WinAnsi, líneas y rectángulos). Página 1: faltantes, sobrantes, neto y variación contra el mes anterior; tabla por sucursal con su mes anterior y variación (más de 12 sucursales se agrupan en «Otras N»); barras este mes contra el anterior. Página 2: distribución de causas (casos cerrados en el mes), casos nacidos, cerrados (con y sin ajuste) y abiertos al cierre del mes, y los **diez productos con más recurrencia** (marcados como indicador para investigar). Botón **Descargar reporte del mes** en *Reportes → Reporte mensual* (selector de los últimos 12 meses con vista previa). La prueba valida que el PDF sea estructuralmente correcto (cabecera, xref con offsets reales) y siempre tenga dos páginas, con datos, sin datos y con 40 sucursales.
*No hay generación automática por calendario* (no hay planificador): el reporte de cualquier mes se genera al pedirlo, siempre con los datos vigentes. Un correo mensual automático queda para cuando exista el proveedor.

## 7. Bitácora de consultas
`ctl_bitacora_consulta` (solo inserción, Etapa 0) la llenan, desde el servidor, diferencias (y su exportación), tablero, casos (Etapa 3), ventas bajo catálogo, cajón, mezcla de pago, reporte mensual y las lecturas del soporte. *Reportes → Quién consultó qué* (dueño y soporte; el supervisor no audita a sus pares) filtra por fechas y reporte y muestra quién, rol, qué y con qué filtros, con conteos por usuario y por reporte.

## 8. Retención de fotos
`retencion_fotos_dias` (90 por omisión, **tope 365 en la base**, por sucursal) decide qué venció. `piefirme.ctl_fotos_por_purgar` y `ctl_fotos_marcar_purgadas` (solo `service_role`) las usa `scripts/auditoria-purgar-fotos.mjs`: **simulacro por omisión**, `--ejecutar` borra los objetos del bucket `pf-auditoria` con la `service_role` y anota cada foto en `ctl_evidencia_purga`. No se purga la foto de un caso abierto ni la última foto de cada toma fija (la guía de la siguiente). La fila de `ctl_evidencia` y su hash **se conservan** (la evidencia es solo inserción y el hash sigue detectando fotos repetidas); si el objeto no se pudo borrar queda `objeto_borrado = false` y se reintenta. Hoy no hay planificador: se corre a mano. *Limitación conocida:* el detalle de un caso muestra la miniatura por URL firmada; una foto ya purgada saldrá rota (el detalle del caso es de la Etapa 3 y no se tocó).

## 8 bis. Mapa de migraciones (240–249)
| # | Qué |
|---|---|
| 240 | Esquema: parámetros nuevos, catálogo de eventos, reglas, destinatarios, envíos simulados, aperturas de cajón, purga de fotos, índices del reporte |
| 241 | `v_ctl_pagos`, trigger del evento de cajón, utilerías internas (`ctl_dif_filas`, `ctl_rango`, `ctl_log_consulta`…) |
| 242 | F7.1: `ctl_reportes_opciones`, `ctl_dif_consultar` |
| 243 | F7.2: `ctl_tablero` |
| 244 | F1.2, F1.5, F1.6: `ctl_rep_ventas_bajo_catalogo`, `ctl_rep_cajon`, `ctl_rep_mezcla_pago` |
| 245 | F7.3: motor de alertas (despacho con techo, resumen diario, evaluaciones programadas, bandeja, reglas, destinatarios) |
| 246 | F7.4 y retención: `ctl_reporte_mensual`, `ctl_bitacora_consultas_listar`, funciones de purga |
| 247 | Índices del tablero de salud (con 63 mil partidas bajó de ~3 s a ~1 s) |
| 248 | Ajuste tras conocer la Etapa 7: el alto valor lo detecta la custodia (se invoca, no se duplica) y el catálogo incluye `folio_faltante`, `folio_faltante_diario`, `peso_fuera_de_rango`, `sucursal_se_cae` |
| 249 | `seq` en reglas y destinatarios: dos cambios en la misma transacción comparten `now()` y la «versión más reciente» necesita desempate real |

## 9. Decisiones y desviaciones (revisables)
1. **El soporte RANNIX lee diferencias, tablero, alertas, mensual y bitácora (solo lectura, con bitácora) pero no ventas ni pagos crudos ni atiende alertas.** La especificación dice «Sí (soporte)» para ver diferencias; las vistas del origen exigen `ver_directo`.
2. **«Ninguna severidad salta el techo».** Una alerta crítica tras el techo llega en el resumen; la bandeja y el tablero siempre la muestran. Si el dueño prefiere que lo crítico siempre avise, es un cambio de una línea.
3. **El conteo inicial no entra a la consulta de diferencias** (fija el saldo de arranque y no abre casos).
4. **Cancelación autorizada** se alerta hoy por cada cancelación observada en el origen (la autorización del módulo es de la Etapa 1).
5. **`v_ctl_pagos`** es una vista nueva del contrato de lectura (novena); cualquier origen futuro debe implementarla también.
6. **Los destinatarios de «dueño» excluyen al soporte** aunque su perfil sea `administrador`; en QA `m@g.com` es el único dueño.
7. **PDF propio** sin dependencias en lugar de impresión del navegador, por la exigencia de «descargar» y de salir siempre en dos páginas.
8. **La retención se calcula con la configuración vigente al purgar**, no la de la fecha de captura (la política de retención aplica a lo que existe hoy).

## 10. Pruebas
- `node --test src/lib/auditoria` — lógica pura (PDF, reporte mensual, filtros, alertas…); `reportes.test.mjs` añade 13.
- `node --test scripts/test-auditoria-reportes-qa.mjs` — contra QA, todo en una transacción que se deshace: rol de sucursal sin acceso (PF403 en cada RPC, cero filas en cada tabla y vista); quién puede qué entre dueño, supervisor y soporte; tablas solo inserción; funciones sin `anon`, con `search_path` fijo y las de planificador solo para `service_role`; diferencias (orden por valor, totales contra consulta directa, correcciones, filtros, umbrales, paginación, supervisor acotado); bitácora de consultas; ventas bajo catálogo con el caso de 140 contra 1,140; cajón sin venta (estado vacío y con eventos); mezcla de pago; tablero; techo diario con agrupación y resumen diario; reglas versionadas; bandeja; evaluaciones programadas con reloj simulado; reporte mensual contra la consulta de diferencias; retención y purga; **rendimiento con la semilla de 90 días × 7 sucursales** (`scripts/lib/semilla-reportes.mjs`).
- `scripts/semilla-auditoria-reportes-qa.mjs` deja la semilla **commiteada** en QA (sucursales `RQA1…RQA7`, productos `RQA-P…`, folios `…-RQA-…`; idempotente; `--quitar` la borra). No correr suites del módulo en paralelo (candados de `pins_personales` y folios).
