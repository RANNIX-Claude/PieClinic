# Control y Auditoría — Etapa 1: cambios en el origen (la Caja)

La Caja de Pie Firme hace el papel de «PODIX» de la especificación. Esta etapa son los **tres cambios que la especificación exige en el punto de venta** (precio no editable, cancelaciones con bloqueo, apertura de cajón registrada) más la **cola de eventos** del origen hacia el módulo. Requisitos: [`AUDITORIA_ESPECIFICACION.md`](AUDITORIA_ESPECIFICACION.md) «Lo que PODIX debe cambiar…», «Eventos de PODIX hacia el módulo», F1.1–F1.5 y criterios 3 y 15. Arquitectura y reglas heredadas: [`AUDITORIA_ARQUITECTURA.md`](AUDITORIA_ARQUITECTURA.md).

Migraciones **290–294** · pruebas `scripts/test-auditoria-caja-qa.mjs` (contra QA, transacción que se deshace) y `src/lib/comercial/cajaControl.test.mjs` · poleo de ejemplo `scripts/auditoria-eventos-poleo.mjs`.

## 0. Regla de esta etapa: la Caja ya está en uso

Todo cambio es **compatible hacia atrás**. Lo que cambia lo que hace el cajero a diario queda detrás de un parámetro por sucursal (`ctl_config`), **apagado por omisión**, para que el dueño lo decida. Lo que nunca cambia a un cajero honesto (guardar el precio de catálogo, registrar quién autorizó, emitir eventos) está siempre activo.

| Parámetro (por sucursal, valor global como respaldo) | Omisión | Tope del sistema | Qué enciende |
|---|:-:|---|---|
| `precio_abierto_con_clave` | **0** | 0 o 1 | El precio cotizado (servicio «a valorar», «desde», por unidad y **Producto especial** con características) exige la clave de un supervisor o del dueño y queda el autorizador en la línea. |
| `descuento_motivo_cerrado` | **0** | 0 o 1 | Los descuentos solo con **motivo del catálogo cerrado** (`ctl_motivo`) y con el tope sin clave del módulo en lugar del 10 % libre. |
| `descuento_sin_clave_pct` (ya existía, Etapa 0) | **0 %** | **15 %** | Tope de descuento sin clave **cuando** `descuento_motivo_cerrado = 1`. |
| `cancelacion_con_bloqueo` | **0** | 0 o 1 | Cancelar un ticket **con piezas** exige escanear la pieza, foto en vivo, clave de supervisor y motivo del catálogo; la pieza no vuelve hasta que el módulo responde. |
| `cancelacion_espera_seg` | **60** | 10 a 600 | Segundos de espera antes de pasar a `pendiente_de_validacion`. |

Cada interruptor se prende o apaga en *Auditoría → Configuración → Parámetros* (historial de cambios incluido, con la misma regla de topes que las demás). El catálogo de motivos se administra en la pestaña nueva **Motivos de caja** (solo el dueño y el soporte RANNIX).

## 1. F1.1 y F1.2 — Precio no editable y precio de catálogo congelado (migración 291)

`piefirme_app.venta_linea_bi` (trigger de `venta_lineas`) se reemplazó conservando **toda** su lógica de la migración 026. Lo que añade:

1. **Precio de catálogo congelado.** Al insertar una línea de precio de catálogo se guarda `venta_lineas.precio_catalogo` = precio vigente de ese concepto *en la fecha de la venta* (la fecha del dispositivo si la venta fue offline). Es la columna que consume el reporte «ventas por debajo de catálogo» (F1.2): `v_ctl_ventas.precio_catalogo_al_momento = coalesce(precio_catalogo, <precio vigente del producto>)`. **Ahora también se llena para servicios y paquetes** (antes solo existía para productos). Es `null` cuando no hay referencia honesta: precio abierto (cotizado), saldo de plan, incluido, cortesía. Las líneas anteriores a la migración siguen leyéndose por el cálculo de siempre.
2. **El precio de una línea de catálogo no se edita.** Para una sesión de usuario en línea, si `precio_unitario` ≠ catálogo vigente (o ≠ el precio pactado en la cita, `citas.precio_servicio`), el servidor rechaza con `precio_no_editable`. No depende de que el campo esté deshabilitado en pantalla. **No se aplica** a: la sincronización offline (el equipo pudo cobrar con la copia del catálogo; la diferencia queda visible en el reporte porque `precio_catalogo` sí se sella), ni a semillas/scripts sin sesión.
3. **Precio abierto** (`venta_lineas.precio_abierto = true`: servicio con `tipo_precio ≠ 'fijo'` o que admite características). Con `precio_abierto_con_clave = 0` sigue como hoy: lo cotiza el cajero. Con `1`, exige `autorizacion_precio_id` (una autorización vigente del propio solicitante, tipo `precio`, de un supervisor o del dueño; el dueño que opera la caja no la necesita).
4. **Descuentos** (cada descuento guarda **usuario, motivo, autorizador y monto**):
   * `venta_lineas.descuento_usuario_id` (quién lo aplicó), `descuento_motivo` + `descuento_motivo_id` (catálogo), `descuento_autorizado_por` (quién tecleó su clave; `null` = quedó dentro del tope sin clave; el dueño que opera la caja queda como su propio autorizador), `descuento` (monto).
   * Con `descuento_motivo_cerrado = 1`: el texto libre se rechaza (`descuento_motivo_cerrado`) y el tope sin clave es `descuento_sin_clave_pct` (0 % por omisión, máx. 15 %). Con `0`: el 10 % libre de siempre (`descuento_recepcion_max_pct`).
   * `aplicar_descuento_global` gana `p_motivo_id` (se recreó con la misma firma más un parámetro con valor por omisión).
5. **Clave de supervisor** — `piefirme.ctl_autorizar_caja(tipo, autorizador, pin, pct, motivo, sede)`: la persona elige **quién** autoriza (supervisor o dueño, nunca el soporte RANNIX) y esa persona teclea su PIN personal (el mismo «Mi PIN» de la Etapa 0; el dueño puede usar también su PIN de administrador heredado). 3 claves incorrectas bloquean 15 minutos a quien las pide (misma regla que 073). Un supervisor no se autoriza a sí mismo. Un supervisor autoriza hasta `supervisor_descuento_max_pct`; si los dueños nunca lo fijaron, se toma 100 % (activar el catálogo cerrado ya es la decisión del dueño; arriba de ese tope, el dueño).
6. **Lectura para la Caja sin saldos** — `piefirme.ctl_caja_parametros(sede)` devuelve interruptores, tope, motivos y la lista de autorizadores. No contiene existencias, costos ni diferencias (se prueba recorriendo la respuesta).

### Lo que NO se quitó (decisión pendiente del dueño)
La especificación pide «eliminar el producto genérico con precio abierto». En Pie Firme lo único que se parece es el **Producto especial** (servicio con características: plantilla ortopédica especial = molde + mayor altura…, caso ESC-CAJA-04), que se vende con un **precio base cotizado por el cajero**. Quitarlo rompería esa venta. En su lugar: `precio_abierto_con_clave`. Con 0 el cajero sigue cotizando (puerta que la especificación quiere cerrar); con 1 cada precio cotizado queda con el nombre de quien lo autorizó y el reporte de la Etapa 6 lo distingue (`precio_abierto`). La decisión de fondo —catálogo de «productos especiales» con precio definido por el dueño en vez de cotización libre— es del dueño.

## 2. F1.3 — Cancelaciones y devoluciones con bloqueo (migración 292, criterio 3)

```
Caja: «Cancelar»  ──ctl_cancelacion_solicitar──►  PENDIENTE   (el ticket sigue cobrado; la pieza NO vuelve; evento cancelacion_solicitada; espera 60 s)
                                                    │
        ctl_cancelacion_resolver: pieza escaneada + foto EN VIVO + clave de supervisor + motivo del catálogo
                                                    │
        ┌───────────────────────────┬───────────────┴───────────────┐
   AUTORIZADA                   RECHAZADA                  (60 s sin respuesta)
   cancelar_venta de siempre    la venta queda firme       PENDIENTE_DE_VALIDACIÓN (la pieza NO vuelve + alerta crítica)
   → la pieza vuelve                                        └─ solo una validación completa la cierra; NUNCA se resuelve sola
   + alerta inmediata al dueño
```

* **Tabla** `ctl_cancelacion` (estado, folio `CCN-AAAA-NNNNN` sin huecos; sin llaves foráneas al origen) y `ctl_cancelacion_evento` (solo inserción: solicitada, pieza no escaneada, pieza que no corresponde, clave incorrecta, vencida, autorizada, rechazada). `ctl_motivo`: catálogo cerrado (6 motivos de descuento y 6 de cancelación sembrados por clínica; «Otro» pide nota).
* **Pieza presente (criterio 3).** `p_codigos` = lo que leyó el escáner: código de barras, SKU o clave alterna. Cada código debe ser de una pieza del ticket y **cada pieza se escanea una vez por unidad** (2 piezas = 2 lecturas). Si no: `{ok:false, error:'pieza_no_escaneada'|'pieza_no_corresponde'}`, la solicitud sigue pendiente, **no queda foto ni autorización**, se cuenta el intento, y un código que no es del ticket genera la alerta `cancelacion_pieza_no_corresponde` al dueño. El ticket sigue cobrado y la pieza no vuelve al inventario.
* **Foto en vivo.** Se sube a `pf-auditoria` y se registra con `ctl_evidencia_registrar(…, 'cancelacion', id)`: el objeto debe tener menos de 15 min, el hash se calcula en el dispositivo, la hora la pone el servidor, **no existe ruta de galería** (criterio 4), y la repetición de hash entre cancelaciones alerta al dueño (criterio 6). La interfaz reutiliza la cámara de la Etapa 4 (`CamaraEnVivo.jsx`, `foto.js`).
* **Autorización.** Al cumplirse todo, la RPC llama a **`cancelar_venta` de siempre** (con todos sus candados: CFDI vigente, gift cards usadas, planes consumidos, turno cerrado = solo Administración) bajo la marca de transacción `app.ctl_cancel_ok`, guarda `ventas.cancelacion_autorizada_por`, `ventas.cancelacion_id`, la foto y los códigos, y emite la alerta `cancelacion_autorizada` (push + WhatsApp simulado al dueño, una por ticket; el evaluador del origen de la Etapa 6 la deduplica por ticket). Si el ensayo previo (`ctl_cancelacion_precheck`) falla —CFDI, gift card usada, etc.— la solicitud ni se crea y se explica por qué.
* **Candado de servidor.** Con `cancelacion_con_bloqueo = 1`, un `UPDATE` a «cancelada» (incluido `cancelar_venta` llamado directo) de un ticket cobrado **con piezas de inventario** se rechaza (`cancelacion_con_bloqueo`) si no viene del flujo. Los tickets sin piezas (solo servicios) o por cobrar se cancelan como siempre. Igual para `devoluciones_venta` con `reingresa_inventario`.
* **Espera.** `cancelacion_espera_seg` (60 s). Como **no hay planificador**, el vencimiento se aplica «al consultar»: `ctl_cancelacion_estado`, `ctl_cancelaciones_pendientes`, el resolver y cada ciclo del poleo lo ejecutan; la pantalla pregunta cada 5 s. Al vencer: `pendiente_de_validacion`, alerta `cancelacion_pendiente_validacion` (crítica, dueño y supervisor, una sola por solicitud) y **la pieza no vuelve**.
* **Devolución** (`ctl_devolucion_solicitar(línea, cantidad)` → mismo resolver): inserta en `devoluciones_venta` con `reingresa_inventario = true`, `autorizado_por` y `cancelacion_id`. Hoy **no existe pantalla de devolución en Caja** (solo la base y la nota de crédito), así que el flujo existe en la base y en las pruebas; la pantalla queda para cuando el dueño decida cómo quiere devolver.
* **El autorizador por fin sale.** `v_ctl_cancelaciones.autorizador` y `ctl_o_cancelaciones` (la lectura del motor de conteo, F1.4/criterio 15) devuelven `ventas.cancelacion_autorizada_por` y, en devoluciones, quien autorizó la salida de caja (antes era un id de autorización, no una persona). Cierra el pendiente documentado en las Etapas 2 y 3. Una cancelación hecha *antes* del interruptor (o de un ticket sin piezas) sigue con autorizador `null`: es la verdad, nadie la autorizó con clave.

## 3. F1.5 — Apertura de cajón sin venta (migración 293)

`piefirme.ctl_cajon_abrir(sucursal, caja, motivo, hora_cliente, origen, id)` registra cada pulso que no viene de un ticket: usuario, caja (la del turno abierto), hora del servidor y motivo opcional, y emite `cajon_abierto_sin_venta`. El trigger de la Etapa 6 (`t_40_cajon`) lo copia a `ctl_apertura_cajon`, de donde ya leen el reporte por cajero y sucursal, el corte del cierre (Etapa 4) y el tablero. Idempotente por `id`.

* **Web = solo aperturas manuales.** En Caja hay un botón **«Abrir cajón (sin venta)»** (motivo opcional). Una web no puede mandar el pulso a un cajón físico: hoy solo se registran las aperturas manuales.
* **Contrato para el hardware real.** Cuando exista un adaptador de impresora/cajón (ESC/POS), cada pulso que no pertenezca a un ticket debe llamar a la **misma RPC** con `p_origen = 'hardware'`. Un ticket cobrado en efectivo abre el cajón por su cuenta y **no** se reporta.
* Roles: administrador, recepción y supervisor. El podólogo no abre el cajón.

## 4. Eventos del origen hacia el módulo (migración 293)

Cola: `ctl_eventos_entrada` (Etapa 0; idempotente por organización + `origen` + `id_externo`; estados `pendiente → procesado | error`). El origen escribe **siempre por `piefirme_app.ctl_emitir_evento`**, que traga cualquier error (queda como aviso en el log) y además cada trigger lleva su propio bloque de excepción: **un evento que falla nunca rompe la venta, el turno ni el cambio de precio** (se prueba agregando un `CHECK` imposible a la cola y cobrando).

| Evento | Quién lo emite | Payload (resumen) |
|---|---|---|
| `venta_registrada` | trigger sobre `ventas` (por cobrar → cobrada / por facturar; incluye las sincronizadas desde offline) | venta, ticket, sucursal, usuario, turno, total, `offline`, líneas |
| `cancelacion_solicitada` | `ctl_cancelacion_solicitar` (292) | solicitud, ticket, sucursal, usuario, monto, productos, `vence_en` |
| `devolucion_solicitada` | `ctl_devolucion_solicitar` (292) | ídem + línea |
| `cajon_abierto_sin_venta` | `ctl_cajon_abrir` | sucursal, usuario, caja, turno, motivo, fecha, `origen_pulso` |
| `precio_modificado_en_catalogo` | trigger sobre `precios` (cada versión) | concepto, sede, precio anterior y nuevo, vigente desde |
| `turno_abierto` / `turno_cerrado` | triggers sobre `turnos_caja` | turno, sucursal, usuario, caja (**sin** esperado ni diferencia) |
| `recepcion_registrada` | trigger sobre `recepciones` (mercancía contra orden de compra, origen `piefirme`) | recepción, OC, sucursal, usuario, folio. La recepción **con responsiva** del módulo (Etapa 7) ya emite la suya con origen `ctl`: son hechos distintos y no se duplican. |

**Drenado (poleo cada 30 s).** `piefirme_app.ctl_eventos_drenar_org(org, límite)` / `ctl_eventos_drenar_todas()` y, para el dueño o supervisor, el botón/RPC `piefirme.ctl_eventos_drenar()`. Cada ciclo vence las cancelaciones que pasaron su espera, revisa relevos si hubo apertura o cierre de turno, evalúa ventas de alto valor (Etapa 7) si hubo ventas, asegura la fila de `ctl_apertura_cajon` de cada apertura (por si el trigger falló) y marca `procesado` (o `error` con su mensaje, reintentable). Ejemplo de proceso: `node scripts/auditoria-eventos-poleo.mjs qa [--una-vez] [--cada=30]`; con `pg_cron`: `select cron.schedule('ctl-eventos', '30 seconds', $$select piefirme_app.ctl_eventos_drenar_todas()$$)`. **Hoy no hay planificador en el servidor**: sin ese script o `pg_cron`, la cola solo se drena cuando alguien consulta una cancelación, usa el botón o corre el script.

**Contrato con el relevo de turno (Etapas 2 y 4).** La Caja avisa antes de teclear el ticket: al abrir el turno y cada 20 s llama `ctl_puede_vender(sucursal)` y `ctl_entrega_pendiente(turno)`; si alguna bloquea muestra «**El turno anterior no ha sido aceptado**» (sin montos ni diferencias) y deshabilita *Cobrar*. **El trigger `t_ctl_bloqueo_entrega` sobre `ventas` sigue siendo el candado real** y no se tocó.

## 5. Interfaz de Caja (todo a ciegas: el cajero nunca ve saldos ni diferencias)

| Archivo | Cambio |
|---|---|
| `componentes/CajaCobro.jsx` | Lee los controles de la sucursal (`ctl_caja_parametros`, con copia para el modo sin internet). Campo de precio: **no editable** en líneas de catálogo (como ya era) y, con `precio_abierto_con_clave`, el precio cotizado pide *«Clave para el precio»*. Descuentos: lista cerrada de motivos, tope sin clave del módulo, botón *Clave*. Cobro bloqueado (con aviso) si el turno anterior no se aceptó. Sin internet no se aplican descuentos ni precios cotizados que exijan clave (y los controles apagados se comportan como siempre). |
| `componentes/ClaveSupervisorModal.jsx` (nuevo) | Elegir quién autoriza + su PIN + motivo; deja al autorizador en la línea. |
| `componentes/CajaCancelacion.jsx` (nuevo) | Validación de la cancelación: cuenta regresiva, escaneo (el lector de código de barras funciona como teclado: Enter agrega la lectura), **foto en vivo** (`CamaraEnVivo`, sin galería), motivo del catálogo y clave de supervisor. |
| `componentes/CajaTickets.jsx` | «Cancelar» pregunta al servidor si el ticket exige validación; banner de cancelaciones pendientes (la pieza todavía no vuelve). Sin piezas: el cuadro de siempre. |
| `componentes/CajaCajon.jsx` (nuevo) y `Caja.jsx` | Botón *Abrir cajón (sin venta)* y aviso de entrega no aceptada. |
| `pages/auditoria/MotivosCaja.jsx` (nuevo) + 3 líneas en `Configuracion.jsx` | Pestaña *Motivos de caja*. |
| `lib/comercial/cajaControl.js` + `cajaControlReglas.js` | RPC y reglas puras con pruebas. |

## 6. Compatibilidad con lo que ya existe

* **Caja sin internet.** La cola offline no cambia. `sincronizar_ticket_offline` sigue creando venta, líneas y pagos y cobrando en una sola transacción, idempotente por `cliente_uuid`; el trigger de líneas exime las ventas con `folio_offline` de «precio no editable» y de «motivo cerrado/clave» (el equipo cobró con una copia del catálogo y la regla de descuento de ese momento), pero **sí sella** `precio_catalogo` y `descuento_usuario_id`: lo que se cobró de más o de menos aparece en el reporte. Se prueba con un ticket offline que cobró 180 con un catálogo de 210 y con un descuento con el catálogo cerrado encendido: sincroniza, no se duplica y emite un solo `venta_registrada`.
* **Facturación y planes/paquetes.** No se tocaron `cobrar_venta`, la facturación ni `consumir_plan_en_venta`. Una cancelación autorizada pasa por `cancelar_venta`, así que el CFDI vigente, las gift cards usadas y los planes consumidos siguen bloqueándola. Las líneas de plan (saldo) y de cortesía tienen precio cero **por diseño** y no se miden contra el catálogo.
* **`validar-sql-local` / PGlite**: no se ejecutó (ver §9).

### Videos y escenarios de Caja que habría que regrabar (NO se regrabaron)
Con los **parámetros apagados (omisión) la interfaz es la misma** y ningún video se invalida. Si el dueño enciende los controles:
* `demo/caja-cancelar.spec.ts` — cancela un antimicótico cobrado: con `cancelacion_con_bloqueo = 1` abre la validación (escaneo, foto, clave) en lugar del cuadro de motivo.
* `demo/caja-especial.spec.ts` y `demo/caja-diez.spec.ts` — producto especial con precio cotizado (con `precio_abierto_con_clave = 1` pide clave) y ticket de varios conceptos con descuento (con `descuento_motivo_cerrado = 1` el motivo es lista y pide clave desde 0 %).
* `demo/caja.spec.ts`, `caja-dividido`, `caja-tarjeta`, `caja-plan-paquete`, `caja-facturar`, `caja-corte`, `caja-offline`: **sin cambio visible** salvo el botón nuevo *Abrir cajón (sin venta)* en la barra y, si hay relevo pendiente, el aviso de entrega.
* `tests/escenarios/CAJA_escenarios.md` ESC-CAJA-06 («Descuento y devolución piden autorización de los dueños») queda cubierto con el catálogo cerrado encendido; con el interruptor apagado se mantiene el PIN del administrador.

## 7. Pruebas

* `node --test src/lib` — lógica pura; `src/lib/comercial/cajaControl.test.mjs` (9 pruebas): topes, claves, precio, escaneo, cuenta regresiva y textos que nunca prometen que la pieza volvió antes de la respuesta.
* `node --test scripts/test-auditoria-caja-qa.mjs` — **una transacción que siempre se deshace**; cada escenario crea su sucursal, turno, producto y precio. Cubre: motivos y parámetros apagados por omisión; tope del sistema; captura a ciegas; **precio congelado y no editable**; el catálogo cambia y la línea vieja conserva el suyo; evento `precio_modificado_en_catalogo`; precio abierto con y sin clave; **descuento sobre el tope sin clave rechazado y con clave aceptado con autorizador, usuario, motivo y monto registrados**; claves incorrectas y bloqueo de 3; **cancelación sin escanear rechazada y la pieza no vuelve (criterio 3)**; código que no es de la pieza (alerta); faltan piezas; motivo y foto obligatorios; foto sin objeto reciente; **autorizada → la pieza vuelve, autorizador guardado y alerta al dueño**; `v_ctl_cancelaciones` y el motor de conteo devuelven el autorizador (criterio 15); **vencimiento → `pendiente_de_validacion` sin devolver, nunca se resuelve sola, una sola alerta, validación tardía**; espera configurable; rechazo; devolución con reingreso (y su candado); quién ve qué; cajón registrado con usuario, caja, hora y motivo (idempotente, hardware, roles); `venta_registrada`, `turno_abierto`, `turno_cerrado`; drenado idempotente; evento malo en `error` sin frenar a los demás; la app no escribe directo en la cola ni en las tablas nuevas; **un evento que falla no rompe la venta**; **venta offline idempotente** y con descuento con el catálogo encendido; ninguna función nueva ejecutable por `anon`.
* Resultados y verificación en navegador: §10.

## 8. Decisiones del dueño (cambian la operación; **nada se impuso**)

1. **Encender cada control** (`precio_abierto_con_clave`, `descuento_motivo_cerrado`, `cancelacion_con_bloqueo`) por sucursal, cuando el equipo esté listo. Cada uno cambia lo que hace el cajero: cancelar pasa de un clic con motivo a pieza + foto + supervisor presente; con el catálogo cerrado y 0 % de tope **todo** descuento necesita un supervisor.
2. **El Producto especial** y el precio cotizado libre (§1): ¿catálogo de productos especiales con precio del dueño?
3. **Tope de un supervisor** para descuentos: hoy `supervisor_descuento_max_pct` (Etapa 0073) y, si nunca se fijó, 100 % al encender el catálogo. Fijarlo en *Parámetros de los dueños*.
4. **Espera de 60 s** para cancelar con la pieza en el estante: es lo que dice la especificación, pero en una sucursal de una sola persona (sin supervisor presente) la cancelación se queda en `pendiente_de_validacion`. Subir `cancelacion_espera_seg` (hasta 600) o dejar que el dueño valide después con su clave.
5. **Tickets sin piezas** (solo servicios) se siguen cancelando como siempre: no hay pieza que escanear. Si el dueño quiere un control equivalente para servicios (p. ej. clave de supervisor sin escaneo) es un cambio aparte.
6. **Devoluciones**: el flujo existe en la base y se prueba, pero Caja no tiene pantalla de devolución.
7. **Descuentos sin internet**: con el catálogo cerrado encendido no se aplican descuentos sin conexión (no hay forma de validar la clave). Alternativa: permitir hasta el tope sin clave configurado.

## 9. Lo no verificado / límites

* **No hay cajón ni escáner físico**: el escaneo se probó con el teclado (el lector USB/Bluetooth se comporta igual: teclea y Enter) y la foto con la cámara falsa de Chrome. El pulso real del cajón está solo como contrato.
* **El poleo cada 30 s no corre solo** (no hay planificador). La cola se drena con el script de ejemplo, `pg_cron` (comando en §4) o el botón.
* **No hay pantalla de Caja para devoluciones ni de «pendientes de validar» para el dueño**: el dueño las ve por la alerta `cancelacion_pendiente_validacion` (Etapa 6) y puede validarlas desde *Tickets del día* con la pieza, la foto y su clave. La lista de solicitudes y su bitácora (`ctl_cancelacion`, `ctl_cancelacion_evento`) las lee quien revisa; la pantalla del tablero no las muestra todavía.
* `scripts/validar-sql-local.mjs` (PGlite) **no se corrió** con estas migraciones; todo se validó contra QA.
* La carga con muchos tickets simultáneos no se midió (el trigger de líneas añade 2–3 consultas indexadas por línea).

## 10. Resultados (QA, 2026-11-26)

* **Migraciones 290–294 aplicadas a QA** (`npm run migrate:qa`, en orden; los pasos intermedios con `--sin-pruebas`). Corrida de seguridad final (`node scripts/test-rls.mjs qa`): **243 pruebas, 12 fallas, las mismas preexistentes** (10 `portal_*` con EXECUTE heredado de PUBLIC, `_rannix_semillas` sin RLS y bucket `comercio_img` público); **ninguna nueva**. Las tablas `ctl_motivo`, `ctl_cancelacion` y `ctl_cancelacion_evento` quedan con RLS, solo `SELECT` para la app y sin ejecución para `anon` (probado).
* `node --test src/lib`: **293 pruebas, 0 fallas** (9 nuevas de Caja).
* `node --test scripts/test-auditoria-caja-qa.mjs`: **49 pruebas, 0 fallas** (6 bloques: catálogo y parámetros; precio; descuentos; cancelación; cajón y eventos; el origen no se rompe).
* `vite build` compila (Caja, Configuración y las pantallas nuevas).
* **Regresión de las etapas anteriores** (corridas secuenciales, nunca en paralelo): custodia 67/0 y casos 45/0 sin fallas; conteo 26/2, cierres 54/2, reportes 38/1 y Etapa 0 53/3. **Las 8 fallas no vienen de esta etapa**: (a) conteo — `ctl_remota_listar` ordena por `now()` y dos auditorías remotas creadas en la misma transacción empatan; (b) cierres — «hora del servidor» exige que la prueba no lleve más de 2 min dentro de su transacción (`now()` es el inicio) y con la máquina saturada tardó 6; (c) reportes — la prueba de rendimiento < 2 s; (d) Etapa 0 — cuentan filas confirmadas de toda la clínica (`foto_repetida` = 54, `ctl_sesion_pin`, bitácora de consultas) que dejaron las corridas E2E de la PWA (la cámara falsa de Chrome sube siempre la misma imagen). No se tocaron esas pruebas (son de otras etapas).
* **Ajuste a las pruebas de otras etapas: ninguno.** Con los parámetros apagados el comportamiento de `cobrar_venta`, `cancelar_venta`, la facturación y los planes es el de siempre.
* **Verificación en navegador** (dev server `:5174`, `r@g.com`, sede *Pie Clinic Centenario*, contra QA; capturas en `tests/corridas/etapa1-caja/`): con `descuento_motivo_cerrado` y `cancelacion_con_bloqueo` encendidos temporalmente para esa sede —y restablecidos al terminar— se comprobó: botón *Abrir cajón (sin venta)* en la barra (`01`, `06`); el campo de precio de un producto de catálogo está **deshabilitado**; el descuento de 5 % muestra el **motivo como lista cerrada** y el botón *Clave* (`02`); la clave de supervisor con PIN incorrecto dice «Clave incorrecta» y con el correcto deja «Autorizado» (`03`, `04`); cobro (`05`); **cancelar** abre la validación con cuenta regresiva y «la pieza aún NO vuelve al inventario» (`07`); un código que no es de la pieza → «sin la pieza presente no hay cancelación» (`09`); con la pieza correcta + foto en vivo (cámara falsa) + clave + motivo → «Autorizada: el ticket quedó cancelado y la pieza volvió al inventario» (`08`, `10`). Sin errores de consola. Para esta verificación se puso temporalmente un PIN a `s@g.com` (retirado) y quedó en QA el ticket `CENTENARIO-TKT-000036` cancelado, su solicitud `CCN-2026-00001` y una apertura de cajón; el turno abierto de `r@g.com` en Centenario ya existía y no se tocó.
* `scripts/auditoria-eventos-poleo.mjs qa --una-vez` corrido contra QA: procesó los 3 eventos pendientes que dejó esa verificación, 0 errores.

### Archivos de esta etapa
Migraciones `290_caja_origen_esquema.sql`, `291_caja_origen_precio_descuento.sql`, `292_caja_origen_cancelacion.sql`, `293_caja_origen_eventos_cajon.sql`, `294_caja_origen_folio_ccn.sql` · `scripts/test-auditoria-caja-qa.mjs`, `scripts/auditoria-eventos-poleo.mjs` · `src/lib/comercial/{cajaControl,cajaControlReglas}.js`, `cajaControl.test.mjs` · `src/pages/comercial/componentes/{ClaveSupervisorModal,CajaCancelacion,CajaCajon}.jsx` (nuevos), `CajaCobro.jsx`, `CajaTickets.jsx`, `comun.jsx` (solo el texto de los errores de control), `Caja.jsx` · `src/pages/auditoria/MotivosCaja.jsx` (nuevo) y 3 líneas en `Configuracion.jsx` · `src/lib/auditoria/config.js` (4 parámetros) · `tests/escenarios/CAJA_escenarios.md` (ESC-CAJA-11 a 14) · este documento y el anexo §13 de `AUDITORIA_ARQUITECTURA.md`.
