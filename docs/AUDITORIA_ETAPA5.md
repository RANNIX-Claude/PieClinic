# Control y Auditoría — Etapa 5: PWA móvil de captura

Fuente: `AUDITORIA_ESPECIFICACION.md` §F6 (y F2.1, F2.3, F3.1, F5.1; criterios 4, 5, 9, 10, 23). Migración **260**. Código en `auditoria-movil/` (entrada propia de Vite) y `src/lib/auditoria/pwa*.js`. Pruebas: `node --test src/lib/auditoria` (pwa.test.mjs) y e2e en `tests/pwa-aud/`.

## 1. Qué es y dónde vive

| Ruta | Qué | Fuente | Build |
|---|---|---|---|
| `/aud/` | PWA de captura (instalable, standalone, scope `/aud/`) | `auditoria-movil/` + `vite.config.aud.js` (base `/aud/`) | `npm run build:aud` → `dist/aud` |

- `npm run build` ahora corre **tres pasos**: `vite build` (app en `dist/app`) → `vite build -c vite.config.aud.js` (PWA en `dist/aud`) → portal. `/app/` y el portal no cambian (config, salida y service worker propios; el de `/app/` tiene scope `/app/`, el de `/aud/` scope `/aud/`: no se pisan).
- `netlify.toml`: redirección SPA `/aud/*` → `/aud/index.html` y cabecera `no-cache` para `/aud/sw.js` (para que se actualice sola).
- Desarrollo: `npm run dev:aud` (puerto 5176). Vista previa de lo compilado (necesaria para probar el service worker): `npm run preview:aud` (puerto **5175**).
- La PWA usa su **propia llave de sesión** (`pf-aud-auth`, variable `VITE_AUTH_STORAGE_KEY` que solo define `vite.config.aud.js`; edición mínima en `src/lib/supabase.js`) y su propia IndexedDB (`pf-aud-movil`): abrirla en el mismo navegador que `/app/` no cierra ni pisa la sesión de escritorio ni la cola de la Caja (`pf-offline`).
- Reutiliza `src/lib/**` (API, foto, hash, conteo, cierres) y `CamaraEscaner.jsx`; **no** reutiliza el shell de escritorio, el menú ni `AppContext`.
- Íconos: por ahora los de Pie Firme copiados a `auditoria-movil/public/icons` (decisión de marca pendiente).

## 2. Las cuatro pantallas (y solo estas)

Barra inferior fija, sin router, sin menú de escritorio.

| Pantalla | Qué hace | Detalle |
|---|---|---|
| **Cierre** | Recorrido del checklist de la Etapa 4, un punto por pantalla | Barra de avance, botones ≥ 48 px, teclado numérico nativo (`inputMode`), denominaciones sin campo de total, foto en vivo, retoma donde iba, resumen final, doble confirmación de entrega en el cierre de turno (el entrante firma con PIN en *Pendientes*). Funciona **sin internet** (§5). |
| **Auditoría** | Conteos: apertura, relevo y (supervisor/dueño) puntual; también las remotas que llegan por *Pendientes* | Campo de código que acepta **lector Bluetooth (teclado + Enter)** y botón de **cámara** (BarcodeDetector → html5-qrcode de respaldo), códigos de barras y claves de proveedor alfanuméricas. A ciegas; solo el auditor de una puntual ve la diferencia. Aviso explícito en iPhone. |
| **Recepción** | Contenedor para el flujo de la Etapa 7 | `auditoria-movil/src/recepcionFlujo.js` exporta `null`; la Etapa 7 pone su componente (contrato en el comentario del archivo). Mientras tanto muestra un estado vacío honesto, sin simular nada. |
| **Pendientes** | Auditorías remotas con cuenta regresiva, cierres en captura, entregas por aceptar, capturas por enviar | RPC `ctl_pwa_pendientes` (devuelve la hora del servidor: la cuenta regresiva **no usa el reloj del teléfono**). Sondeo cada 20 s con la app abierta, al volver a primer plano y al volver la red. Activar avisos push (§7). |

Consultas, reportes y autorizaciones de ajuste **no existen** en la PWA (viven en escritorio).

## 3. Acceso: usuario y PIN

1. **Alta del usuario en el teléfono** (una sola vez): correo y contraseña. El teléfono conserva la sesión renovable. Varios usuarios por teléfono.
2. **Cada entrada**: elegir nombre (+ sucursal si tiene varias) y escribir el **PIN de 4 a 6 dígitos** (el mismo de «Mi PIN», `pins_personales`). El servidor lo valida con `ctl_pin_abrir_sesion` (3 fallos → bloqueo de 15 min; espejo local del bloqueo) y abre una **sesión ligada al turno** (`ctl_sesion_pin`, 12 h) que **caduca al cerrarse el turno de caja**: la app revisa con `ctl_pin_validar_sesion` al abrir y cada minuto con señal; sin señal solo cuenta el vencimiento.
3. El PIN **no** autoriza ajustes (eso exige contraseña completa en escritorio).
4. Sin señal no se puede *entrar con PIN* (el servidor es quien lo valida), pero una sesión ya abierta sigue valiendo sin señal hasta su vencimiento: así el cierre se completa sin internet y la app cerrada y reabierta retoma.

## 4. Cámara (F6.2) y escaneo (F6.3)

- Solo `getUserMedia` (cámara trasera). **No existe `<input type=file>`, ni `capture=`, ni File System Access API, ni arrastrar/soltar en ningún archivo de la PWA**: lo comprueba una prueba unitaria que recorre todo el código propio y los componentes reutilizados, y la e2e que revisa el DOM de las cuatro pantallas y de la cámara (criterio 4). Si no hay cámara o permiso, se dice y **no hay alternativa de galería**.
- Compresión en el dispositivo al lado largo de `ctl_config.foto_lado_largo_px` (1,600 por omisión; viaja en la plantilla del cierre y se guarda para uso sin red), sha256 en el cliente, subida a `pf-auditoria` y registro por `ctl_cierre_foto`. La hora, el usuario y la sucursal los sella el servidor; el reloj del teléfono viaja solo como `hora_cliente` y una diferencia > 5 min la registra la base (criterio 5). La app además avisa en *Pendientes* si el reloj del teléfono difiere más de 5 min del servidor.
- Escáner: el mismo `CamaraEscaner` de la Etapa 2 (lecciones del conteo inicial: solo una franja central con recuadro de lectura, 1920×1080, enfoque continuo, Code 128/39/93 además de EAN/UPC). En iPhone se muestra: «el escaneo por cámara es más lento… para el conteo diario se recomienda el lector Bluetooth».

## 5. Sin conexión (F6.4) y cola idempotente

- **Cierre**: al iniciar, la app pide la plantilla del cierre (`ctl_cierre_plantilla`: puntos, tomas fijas, lado de foto; **sin** esperado, fórmula ni tolerancia) y la guarda; al entrar con señal precarga las cuatro. El cierre se guarda en IndexedDB y de ahí sale el recorrido. Cada captura/foto/cierre se **encola** y se envía en orden.
- **Cola** (`src/lib/auditoria/pwaCola.js`, pura y probada): cada operación lleva el **id generado en el dispositivo**; encolar el mismo id no duplica; el servidor ya responde idempotente a un reenvío (`ctl_cierre_abrir`, `ctl_cierre_capturar`, `ctl_evidencia_registrar`, `ctl_cierre_cerrar`, `ctl_capturar_partida`); la subida de la foto trata «ya existe» como éxito. Falla de red → se conserva, espera 5 s, 10 s, 20 s… (tope 5 min) y corta la corrida para respetar el orden; al volver la red (`online`), al volver a primer plano y cada 10 s se reintenta. Sesión vencida → no cuenta intento. Rechazo del servidor → queda **rechazada con su motivo** (y lo que depende de ese cierre), con botón *Reintentar*: **nada se descarta**.
- Si el servidor **retoma** un cierre ya abierto (mismo usuario, tipo y turno) se guarda el alias de id y se suman las capturas que ya tenía.
- **Aviso explícito** (F6.4): «3 capturas pendientes de enviar, mantén la app abierta un momento» (con «en iPhone no se envía en segundo plano» y variante sin señal), en una banda fija y en *Pendientes*.
- La cola es **por usuario**: cada quien envía lo suyo al volver a entrar (una captura nunca se manda con la sesión de otra persona). La cola no se borra al salir.
- **Conteos**: necesitan señal para reconocer el producto (no se copia el catálogo al teléfono). Si la red se cae justo al guardar, la partida queda en la cola con su id y se envía sola.
- **Entregas**: aceptar una entrega (PIN) y entrar con PIN necesitan señal.

## 6. Captura a ciegas

La PWA no recibe ni pinta saldo ni diferencia: usa solo RPC/vistas que ya son ciegas (Etapas 2 y 4) y la nueva `ctl_cierre_plantilla`/`ctl_pwa_pendientes` (sin cifras calculadas). Excepción única: la auditoría puntual de supervisor o dueño. La e2e inspecciona **todas** las respuestas JSON de Supabase de las dos cuentas y falla si trae cualquier llave de `CAMPOS_CIEGOS` o de esperado.

## 7. Notificaciones push (F2.3)

`ctl_push_suscripcion` + `ctl_push_registrar/ctl_push_baja` (migración 260; solo escribe la RPC). Sin `VITE_VAPID_PUBLIC_KEY` el botón *Activar avisos* guarda una suscripción **SIMULADA** (`simulada = true`, `endpoint = simulada://<id del teléfono>`) y la pantalla lo rotula así; con la llave, hace la suscripción Web Push real. Contrato con la Etapa 6: lee esa tabla desde `ctl_alerta` y manda `{titulo, cuerpo, url}`; el service worker ya tiene el manejador `push` y `notificationclick`. Mientras tanto «Mis pendientes» consulta cada 20 s con la app abierta.

## 8. Actualización automática

El service worker (`auditoria-movil/public/sw.js`) guarda solo archivos de la propia app (nunca respuestas de Supabase). Una versión nueva queda en espera; la app muestra **«Hay una versión nueva» + Actualizar** y, al aceptar, la activa y recarga: una actualización nunca interrumpe un cierre a medias. Revisa actualizaciones al volver a primer plano, al volver la red y cada hora.

## 9. Dispositivos recomendados (F6.5) y pregunta abierta

- **Un Android de gama baja dedicado por sucursal + lector Bluetooth: unos 3,000 pesos por tienda.** Evita la mitad del soporte (Android viejos, memoria llena, permisos de cámara negados) y la resistencia a usar el teléfono personal para el trabajo. Chrome/Edge actual; instalar desde el menú «Agregar a pantalla de inicio». Lector Bluetooth en modo teclado (HID) con sufijo Enter.
- iPhone: funciona (PWA desde Safari), pero **sin escáner nativo** (más lento), **sin sincronización en segundo plano** (la app debe estar abierta para enviar) y con notificaciones push solo si la PWA está instalada.
- **Pregunta abierta para el cliente:** ¿ya hay un teléfono de la oficina en cada sucursal, o la encargada reportaría desde el suyo? Si es el suyo, conviene que lo sepa antes (datos personales, memoria, permisos de cámara).

## 10. Pruebas

- Unitarias: `node --test src/lib/auditoria` → `pwa.test.mjs` (26): cola idempotente, orden, reintentos con retroceso, rechazo con dependencias, alias de cierre, sesión vencida, una corrida a la vez, PIN 4–6, bloqueo, caducidad por hora del servidor, compresión, sha256, cámara sin galería (código propio), discrepancia de reloj, cierre local y captura a ciegas.
- E2E (Playwright, 390×844, cámara falsa, contra QA): `npm run build:aud && node scripts/qa-pwa-preparar.mjs && npx playwright test -c playwright.aud.config.mjs`. Capturas en `tests/corridas/2026-11-26_PWA_AUD/`. Última corrida completa: 11 de 11 en verde (instalable, usuario+PIN, cierre completo, sin galería, recepción vacía, conteo con lector simulado y reenvío sin duplicar, cierre sin conexión con app cerrada y reabierta, reenvío sin duplicar en cierre, aviso iPhone, mis pendientes con cuenta regresiva y push simulado, captura a ciegas sobre todas las respuestas de red). **No correr junto a otras suites del módulo** (candados compartidos → statement timeout).

## 11. Desviaciones, límites y decisiones para el dueño

1. **Hora de lo capturado sin conexión**: el servidor sella la hora al **recibir**, no al capturar (las RPC no tienen otro campo). Lo capturado sin señal viaja con `hora_cliente` = reloj del teléfono al capturar; si pasan más de 5 min hasta el envío, la base lo registra como discrepancia de hora (aquí sirve de evidencia de «capturado sin conexión», pero se mezcla con el desfase real del reloj). Mejora propuesta: un campo `capturada_offline_en` en las RPC y una discrepancia distinta.
2. **El checklist puede cambiar entre capturar sin señal y enviar**: el servidor fija la lista de puntos al *abrir* el cierre; si el dueño cambia el checklist antes de que llegue la cola, las capturas de un punto que ya no aplica quedan «rechazadas» con su motivo (no se pierden).
3. **Cierre de turno sin señal**: el servidor exige un turno de caja abierto (o cerrado hace < 12 h) a nombre de quien cierra; se verifica al enviar, no al capturar.
4. **Entrar con PIN y aceptar entregas exigen señal**; el PIN lo valida el servidor (no hay hash local del PIN).
5. **Los conteos no son 100 % sin conexión** (necesitan el catálogo); decisión consciente para no copiar al teléfono el catálogo ni nada cercano a existencias.
6. El PIN de la base admite 4–8 dígitos; la PWA pide 4–6 (como la especificación). Un PIN de 7–8 dígitos definido en escritorio no se puede usar aquí (decisión D8 de la arquitectura sigue abierta).
7. La sesión del teléfono (token renovable) vive en el almacenamiento del navegador; el PIN protege el uso de la app y ata las capturas a un turno, pero no cifra el teléfono: por eso se recomienda un equipo dedicado.
8. **Fallas transitorias del servidor se reintentan** (tiempo de espera de la base por candados, deadlock, 5xx): no se tratan como rechazo. Durante las pruebas, las suites de otras etapas mantienen transacciones largas en QA y las RPC que toman folios agotaban su tiempo; la cola las conservó y las envió al liberarse.
9. **Hallazgo de la Etapa 2 (pantalla de escritorio)**: `Captura.jsx` guarda `resp.avance` (con `enLista`) pero la pantalla lee `en_lista`; tras la primera captura pierde «N de M» y la barra. En la PWA está corregido (normaliza); falta el mismo cambio de una línea en escritorio.
10. **No verificado en un teléfono real**: instalación a pantalla de inicio, cámara y escáner de un Android/iPhone reales, lector Bluetooth físico, push real (no hay llaves VAPID). Las pruebas usan Chromium de escritorio en viewport móvil con cámara falsa y teclado como lector.
