# Control y Auditoría — Etapa 2: motor de conteo

Migraciones **210–213** · pruebas `scripts/test-auditoria-conteo-qa.mjs` (contra QA, transacción que se deshace) y `src/lib/auditoria/conteo.test.mjs` · pantallas `src/pages/auditoria/Conteos.jsx` y `src/pages/auditoria/conteos/`. Requisitos: [`AUDITORIA_ESPECIFICACION.md`](AUDITORIA_ESPECIFICACION.md) §F2 y «Conteos y auditoría»; arquitectura y reglas heredadas: [`AUDITORIA_ARQUITECTURA.md`](AUDITORIA_ARQUITECTURA.md).

## 1. Qué hay

Un **solo motor** (`ctl_sesion_conteo` / `ctl_partida_conteo` / `ctl_lista_solicitada`) con cinco modos. Lo que cambia es quién inicia, qué lista se presenta y qué pasa al cerrar.

| Modo | Quién inicia (validado en el servidor) | Lista | Al cerrar |
|---|---|---|---|
| `conteo_inicial` | dueño o supervisor (`ctl_sesion_iniciar`) | completa | deja el saldo de arranque en `ctl_saldo_arranque`; **no** abre casos ni toca el inventario |
| `conteo_apertura` | cualquiera que capture en la sucursal | completa (existencias > 0) | un caso por cada diferencia y por cada no reportado |
| `relevo_turno` | quien entra al turno (con turno de caja abierto) | custodia (≤ 30) | si cuadra → `por_aceptar`; si no → casos `diferencia_relevo` con los dos turnos |
| `auditoria_puntual` | supervisor o dueño | aleatoria o libre | casos; **el auditor ve la diferencia al instante** |
| `auditoria_remota` | **solo el dueño** (`ctl_remota_lanzar`) | aleatoria ponderada, con tiempo límite | casos; registra el tiempo de respuesta; expira |

### RPC (todas `SECURITY DEFINER`, con `ctl_exigir`)
`ctl_sesion_iniciar` · `ctl_sesion_abrir` · `ctl_capturar_partida` · `ctl_sesion_cerrar` · `ctl_sesion_cancelar` · `ctl_sesion_detalle` (solo dueño/supervisor) · `ctl_sesiones_expirar` · `ctl_remota_lanzar` · `ctl_remota_avance` · `ctl_remota_listar` · `ctl_entrega_pendiente` (contrato con Caja) · `ctl_relevo_ver` · `ctl_relevo_aceptar` · `ctl_entregas_listar` · `ctl_custodia_actual`.
Internas (no ejecutables por la app, solo desde las RPC): `piefirme_app.ctl_cerrar_interno`, `ctl_generar_lista`, `ctl_elegibles`, `ctl_abrir_caso`, `ctl_expirar_vencidas`, `ctl_entregas_revisar`, `ctl_validar_pin` y los lectores del origen `ctl_o_*` (ver §4).

### Captura a ciegas (criterio 1)
`ctl_capturar_partida(p_id, p_sesion, p_codigo, p_cantidad, p_precio_etiqueta, p_numero_serie, p_folio_sello, p_sello_intacto, p_nota, p_hora_cliente, p_clasificacion)`:
- El **servidor** congela `saldo_sistema` en ese instante, calcula diferencia, valor al costo, precio de catálogo y clasificación del precio, y lo escribe en `ctl_partida_calculo` (solo ver diferencias).
- Responde **solo** `{ ok, idempotente, partida_id, corrige, avance:{capturadas,en_lista}, siguiente }`; errores de dominio: `{ ok:false, error, mensaje }`. Sin saldo, diferencia ni valor, a ninguna profundidad (probado recorriendo la respuesta).
- **Única excepción** (spec F2.1): `auditoria_puntual` ejecutada por supervisor o dueño recibe además `revision` con la diferencia.
- **Idempotencia**: el `id` lo genera el dispositivo. Reenviar el mismo `id` devuelve la misma respuesta y no escribe nada; el mismo `id` en otra sesión es error `PF409`.
- **Correcciones**: capturar otra vez el mismo producto crea una fila nueva con `corrige_a`; el cierre usa la última vigente.
- Validaciones: serie (`requiere_serie`), sello e intacto (`requiere_sello`), precio de etiqueta (si la sesión lo pide), lista cerrada (aleatoria/custodia: solo lo pedido), sesión de otra persona, sesión expirada (se expira en el acto).
- La hora la pone el servidor; `hora_cliente` es referencia y una diferencia > 5 min queda en `ctl_discrepancia_hora` (criterio 5).

### Lista aleatoria ponderada (F2.2)
Elegida **solo** en `piefirme_app.ctl_generar_lista`, dentro de la misma transacción que crea la sesión (se guarda en `ctl_lista_solicitada` antes de que el cliente reciba nada).
`peso = 1 + costo/costo_máx + rotación_30d/rotación_máx + 3 × min(diferencias_previas, 5)/5` y sorteo sin reemplazo por «carrera exponencial» (`-ln(1-random())/peso`). Las diferencias previas en esa sucursal pesan más que el costo y la rotación (prueba estadística de 300 sorteos). Excluye lo contado en las últimas **24 h** (`aleatoria_excluir_horas`) salvo `incluir_recientes`. Tamaño: `muestra_aleatoria` de `ctl_config`; **tope 100** validado en la RPC, en el trigger de configuración y con un `CHECK` en la tabla.

### Cierre (`ctl_cerrar_interno`)
`total_partidas`, `partidas_con_diferencia`, `valor_diferencia` (+ faltante, sobrante, no reportado) en `ctl_sesion_resultado`. Una diferencia cuenta si supera `tolerancia_kits` (0 por omisión).
- **Casos**: `diferencia_inventario` (o `diferencia_relevo`) con `cantidad` = física − sistema y `usuario_captura` = quien capturó (la regla dura de separación de la Etapa 0 ya los ve); `diferencia_precio` solo si la clasificación es `revisar`. Cada caso lleva `contexto` (sesión, modo, descripción, costo, saldo al contar) y una entrada de bitácora del sistema sin usuario (no cuenta como «investigó»).
- **No reportado** (pedido en la lista y sin captura): mismo trato que una diferencia (`origen_tipo = lista_solicitada`, `contexto.no_reportado`, valor = saldo × costo = valor en riesgo).
- **Sustitución de código (F2.5)**: faltante caro + sobrante barato, misma sesión y sucursal, **cantidades iguales** y costo caro ≥ relación × costo barato (`sustitucion_relacion_costo`, 3 por omisión). El caso del faltante lleva los dos productos en `contexto.sustitucion` y el del sobrante queda ligado con `caso_principal_id`; alerta `posible_sustitucion_codigo`.
- **Cruce con cancelación (F1.4)**: cada faltante busca cancelaciones y devoluciones con reingreso del mismo producto en la sucursal en los últimos `cancelacion_ventana_dias` (7) y el caso nace con `contexto.cancelacion` (folio, `usuario_cancelo`, `autorizador`, fecha, motivo) y `contexto.cancelaciones`. El origen hoy no registra autorizador en la cancelación de ticket: sale `null` (igual que `v_ctl_cancelaciones`).
- **Precio de etiqueta (F2.6)**: `coincide` (dentro de `tolerancia_precio_etiqueta`) · `etiqueta_anterior` (el precio vigente cambió dentro de `dias_gracia_precio` **y** la etiqueta coincide con un precio que rigió dentro de esa ventana) · `revisar`. El auditor puede reclasificar en el momento (`etiqueta_mal_puesta`…) re-capturando con `p_clasificacion`. Solo `revisar` abre caso.
- **Expiración**: una sesión con `limite_en` vencido pasa a `expirada` al primer contacto (captura, abrir, avance, listar); lo capturado se conserva, lo faltante abre casos «no reportado» y se guarda `respuesta_seg` (solicitud → apertura) y `duracion_seg`. Alerta `auditoria_remota_expirada` (crítica si la sucursal no capturó nada).
- **Cancelar**: el rol de sucursal solo si aún no capturó (si no, se podría esconder lo contado a ciegas); dueño y supervisor con motivo; lo capturado se conserva; no abre casos. La remota no se cancela desde la sucursal.

### Auditoría remota (F2.3)
`ctl_remota_lanzar(p_sucursales, p_muestra, p_limite_min, p_incluir_recientes, p_motivo)` — solo dueño. `p_sucursales = null` (**por omisión**) = todas las activas; **una sola** exige `p_motivo` (queda en la sesión). Una sesión por sucursal con su propia lista aleatoria; sin productos elegibles → la sucursal se omite y se informa. Aviso en `ctl_alerta` (`auditoria_remota_solicitada`, destinatario `sucursal`) — el push real llega en la Etapa 5/6; mientras tanto el dispositivo ve la sesión abierta por RLS (aviso en Conteos). `ctl_remota_avance` da el avance en vivo (abrió, partidas, transcurrido, restante, expiradas, `respuesta`: `sin_abrir | en_curso | completa | parcial | no_reportada`); la pantalla lo consulta cada 5 s mientras haya pendientes.

### Relevo de turno (F2.4) y contrato con Caja
Tabla `ctl_entrega_turno` (una por turno entrante): `contando → por_aceptar | con_diferencia → aceptada | aceptada_con_diferencia`, y `entrega_no_aceptada`.
1. El entrante inicia `relevo_turno` (necesita su turno de caja abierto; el saliente es el turno previo de la sucursal dentro de `relevo_ventana_horas`) y cuenta a ciegas la custodia (`ctl_producto_custodia`, ≤ 30).
2. Al cerrar, el servidor compara. **Cuadra** → `por_aceptar`; el entrante acepta con su **PIN** (`ctl_relevo_aceptar`, mismo PIN y mismo bloqueo de 3 intentos que la captura) y la custodia pasa a él (`ctl_custodia_actual`). **No cuadra** → `con_diferencia`, la diferencia se muestra al entrante y al saliente (`ctl_relevo_ver`), se abre un caso `diferencia_relevo` por producto con `turno_saliente_id`, `turno_entrante_id` y las firmas en `contexto.firmas` (entrante y saliente firman con PIN) y se alerta al dueño (`relevo_con_diferencia`).
3. **`entrega_no_aceptada`** (criterio 18): el saliente cerró su turno y pasaron `relevo_espera_min` (30) sin aceptación → el servidor la marca (`ctl_entregas_revisar`, que corre al consultar; no hay planificador: si hay `pg_cron`, programar `piefirme_app.ctl_entregas_revisar(<org>)`). También crea la fila si el entrante ni empezó. Visible con `ctl_entregas_listar` (dueño/supervisor) y en la pestaña «Relevos y entregas».
4. **Contrato para Caja (criterio 19)** — `piefirme.ctl_entrega_pendiente(p_turno uuid) → { bloquea, requerida, estado, entrega_id, motivo }`. **Caja debe llamarla al abrir el turno y antes de registrar cada venta; si `bloquea = true` no se registra la venta y se muestra `motivo`.** `bloquea` es verdadero mientras exista un relevo requerido (hay turno anterior de otra persona dentro de la ventana y la sucursal tiene custodia activa) que no esté `aceptada` o `aceptada_con_diferencia`. Sin custodia configurada no hay relevo y no bloquea (la lista de custodia es vacía por omisión). **La Etapa 2 no instala el candado en el punto de venta**: es regla de servidor consultable; el candado visual y de servidor en `ventas` lo decide la Etapa 4/5 (o el origen en la Etapa 1).

## 2. Pantallas (`/auditoria/conteos`)
Pestañas **Sesiones · Iniciar un conteo · Auditoría remota (dueño y supervisor) · Relevos y entregas**. Captura (`conteos/Captura.jsx`) apta para celular: escáner Bluetooth como teclado + cámara (`html5-qrcode`), hoja de captura con − / +, sonidos de `plataforma/inventario/conteoSonido.js`, precio de etiqueta / serie / sello cuando se piden, barra de avance y cuenta regresiva en la remota. El reconocimiento de la pieza usa `ctl_producto_captura` (sin precio, costo ni existencia). **No muestra saldo ni diferencia** al rol de sucursal; solo el auditor de una puntual ve la `revision`, y solo dueño/supervisor abren «Resultado» (diferencias valorizadas, `ctl_sesion_detalle`, que además deja bitácora de consulta). La remota avisa a la sucursal con un banner en Conteos. `lib/auditoria/conteo*.js` y `remotaAvance.js` tienen las reglas puras (modos, precio, validación, reintento con el mismo id, formato de avance).

## 3. Decisiones tomadas (revisables)
1. **Excepción del relevo**: la especificación pide mostrar la diferencia a ambos cuando el relevo no cuadra; es la única respuesta de sucursal con diferencias (llave `diferencia_relevo`, no `diferencia_piezas`). **Decisión del dueño**: si prefiere que el entrante solo vea «no cuadra» y los productos (sin cantidades), basta cambiar `ctl_sesion_cerrar`/`ctl_relevo_ver`.
2. **Conteo inicial no aplica el saldo al inventario del origen**: solo deja constancia (`ctl_saldo_arranque`: contado vs. lo que el origen decía). Aplicarlo escribiría el saldo sin un caso autorizado, contra la regla dura «ningún rol escribe en el saldo». Hoy el inventario inicial real se fija con Inventario → Conteo inicial (migraciones 078/160). Si se quiere que este modo lo aplique, debe pasar por un caso autorizado con contraseña (Etapa 3).
3. **Una sola sesión abierta por sucursal y modo** (índice único parcial): evita sesiones apiladas.
4. **Volumen de casos por «no reportado»**: una auditoría remota que una sucursal ignora abre un caso por cada producto pedido (hasta la muestra). Es lo que pide la especificación («mismo reporte que una diferencia»); el techo de alertas diario (Etapa 6) no los agrupa.
5. **Etiqueta anterior exige coincidir con un precio previo** (no solo que el catálogo haya cambiado dentro de la ventana): si no, una etiqueta de 400 para una pieza de 600 pasaría como «anterior» cuando el precio solo cambió ayer. Refinamiento sobre el texto literal de la especificación.
6. **Sustitución de código**: «cantidades compatibles» = cantidades **iguales** (una por una). Se pueden relajar.
7. **Tres parámetros nuevos** en `ctl_config_def`: `aleatoria_excluir_horas` (24, tope 168), `relevo_espera_min` (30, tope 480), `relevo_ventana_horas` (12, tope 48).
8. **Lecturas del origen en servidor**: las RPC leen existencias, precios, costos y cancelaciones con funciones internas `ctl_o_*` y no con las vistas `v_ctl_*`, porque estas devuelven cero filas al rol de sucursal por diseño y el servidor sí debe congelar el saldo. Si cambia el origen, se reimplementan las `ctl_o_*` junto con las vistas.
9. **PIN en la captura**: la captura usa la sesión normal de la app; la sesión por PIN ligada al turno (`ctl_pin_abrir_sesion`) es de la PWA (Etapa 5). El PIN sí se exige para aceptar/firmar el relevo.

## 4. Lo que no cubre esta etapa
- Notificación push real (solo `ctl_alerta`); el techo diario y la agrupación de alertas (Etapa 6).
- Cola offline y PWA con login por PIN (Etapa 5); aquí un reenvío por red se cubre con el mismo `id`.
- El candado de ventas en Caja (contrato en §1).
- Casos: investigación, causa, autorización y ajuste (Etapa 3). El caso de sustitución es un caso principal + uno ligado; el ajuste de **par** (los dos productos a la vez) lo define la Etapa 3.
- Prueba de campo del criterio 23 con lector Bluetooth real (aquí solo la parte de servidor: 100 capturas sin pérdida).
