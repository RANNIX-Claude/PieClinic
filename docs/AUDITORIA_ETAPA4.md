# Control y Auditoría — Etapa 4: checklist y cierres

Alcance: especificación §F3 (cierre de turno y de día, entrega con doble firma, cuadre de kits, tomas fijas) y «Cierres» del modelo de datos. Migraciones **230–234**, pruebas en `scripts/test-auditoria-cierres-qa.mjs` y `src/lib/auditoria/cierres.test.mjs`. Lo decidido en la Etapa 0 (`AUDITORIA_ARQUITECTURA.md`) sigue vigente; aquí solo se documenta lo que esta etapa añade.

## 1. Qué hace

1. **Catálogo de puntos de control versionado.** `ctl_punto_control` (Etapa 0) gana `aplica_apertura` y `parametros` (`producto_id` del insumo, `kits_por_servicio`, `toma_fija`, `semilla`). `ctl_punto_control_guardar` valida el punto (tipo de captura, fórmula compatible, insumo elegido, sucursales de la clínica, parámetros conocidos) y **nunca edita**: cada cambio crea la versión siguiente y cierra la anterior. Agregar un control nuevo es configuración (pantalla *Configuración de auditoría → Puntos de control*), no desarrollo.
2. **Catálogo de fórmulas de esperado** (`ctl_formula_esperado`, 5 claves que el servidor sabe calcular): `efectivo_esperado`, `tarjeta_esperada`, `transferencia_esperada`, `kits_usados`, `tickets_cobrados`. Cada una declara los tipos de captura compatibles y las vistas del origen de donde sale el esperado.
3. **Motor de recorrido (RPC).** `ctl_cierre_abrir` → `ctl_cierre_capturar` (por punto, guardado parcial) → `ctl_cierre_foto` → `ctl_cierre_cerrar`. Lectura a ciegas: `ctl_cierre_recorrido`. Revisión: `ctl_cierre_detalle`, `ctl_cierres_listar`, `ctl_pares_toma`.
4. **Entrega de turno con doble firma** (`ctl_entrega`, `ctl_entrega_firma`): `ctl_entrega_aceptar`, `ctl_entregas_pendientes`, `ctl_entrega_liberar`, `ctl_puede_vender`.
5. **Cuadre de kits** (`ctl_calc_kits` + `ctl_consumo_esperado_guardar`).
6. **Tomas fijas y par cierre/apertura** (`ctl_toma_fija_guardar`, `ctl_toma_guia`, política de storage `pf_stg_aud_guia`, alertas).
7. **Frontend**: `Cierres.jsx` (recorrido móvil para quien captura; lista, corte y pares para dueño y supervisor) y tres pestañas nuevas en Configuración (puntos de control completos, tomas fijas, consumo de insumos).

## 2. Contratos de servidor (todas `SECURITY DEFINER`, sesión + clínica activa + capacidad en el servidor)

| RPC (`piefirme.`) | Capacidad | Hace | Devuelve a quien captura |
|---|---|---|---|
| `ctl_cierre_abrir(id, sucursal, tipo, turno, hora_cliente)` | capturar | Resuelve los puntos activos (sucursal + tipo), guarda la **instantánea** `[{punto_id, grupo_id, version}]` en `version_checklist` y devuelve el recorrido. Idempotente por `id` del cliente; si ya hay un cierre en captura del mismo usuario/sucursal/tipo/turno **lo retoma** (`retomado: true`). El cierre de turno exige un turno de caja (abierto o cerrado en las últimas 12 h). | Recorrido sin esperados ni tolerancias |
| `ctl_cierre_capturar(id, cierre, punto, valor, denominaciones, hora_cliente)` | capturar | Una captura por punto. Corregir = fila nueva con `corrige_a` (índices únicos impiden bifurcaciones); la vigente es la que nadie corrigió. **Denominaciones: si llega `valor` se rechaza**; el total (`valor_capturado`) lo suma el servidor del desglose y solo se acepta un catálogo de denominaciones MXN, cantidades enteras y sin repetidas. | `{ok, id, total?}` |
| `ctl_cierre_foto(evidencia_id, cierre, punto, ruta, hash, bytes, ancho, alto, toma, hora_cliente)` | capturar | Única vía de foto de un cierre: exige punto que pida foto y toma fija aplicable; reutiliza `ctl_evidencia_registrar` (objeto recién subido ≤ 15 min, ruta `<org>/ctl/<sucursal>/`, hash sha256, hora del servidor) y actualiza la guía de la toma. Alerta `apertura_tardia`. | `{ok, id}` (nunca se le dice si el hash está repetido) |
| `ctl_cierre_cerrar(cierre, con_entrega, monto_confirmado, hora_cliente)` | capturar | Exige obligatorios completos; calcula esperado, diferencia y `dentro_tolerancia` (`ctl_cierre_calculo`); abre **un caso por punto fuera de tolerancia** (nace de la captura: `origen_tipo='cierre_captura'`, `usuario_captura`, turno); arma el corte (`ctl_cierre_corte`); genera alertas; si es cierre de turno con entrega crea la entrega y deja el cierre en `entrega_no_aceptada`. Idempotente. | `{ok, folio, estado, entrega_id}` y nada más |
| `ctl_cierre_recorrido(cierre)` | capturar | Retoma: puntos con su captura propia, fotos y qué falta | sin esperado |
| `ctl_cierre_detalle(cierre)` · `ctl_cierres_listar(...)` · `ctl_pares_toma(...)` | ver_directo (dueño, supervisor) | Corte, puntos **con la versión del checklist con la que se abrió el cierre**, fotos, casos, entrega; lista con indicadores; pares antes/después | — (rechazado: PF403) |
| `ctl_entregas_pendientes(sucursal)` | capturar | Entregas por aceptar **sin monto** | — |
| `ctl_entrega_aceptar(entrega, pin, monto_contado, denominaciones, hora_cliente)` | capturar | Ver §4 | `{ok, cuadra, fondo_inicial, diferencia?}` |
| `ctl_entrega_liberar(entrega, motivo)` | investigar | Libera una entrega sin aceptar (nadie queda bloqueado para siempre); queda alerta | — |
| `ctl_puede_vender(sucursal)` | cualquier usuario de la clínica | `{puede, motivo, entrega_id, cierre_folio, entregado_en}` (sin montos) | — |
| `ctl_toma_guia(toma)` | capturar | Ruta de la última foto de la toma (guía fantasma) | — |
| `ctl_foto_lado_largo(sucursal)` | capturar | Lado largo configurado para comprimir (1,600 px por omisión, tope 2,400) | — |
| `ctl_toma_fija_guardar` · `ctl_consumo_esperado_guardar` · `ctl_punto_control_guardar` | configurar | Catálogos administrables del dueño | — |

La app **no tiene** INSERT/UPDATE/DELETE en ninguna tabla `ctl_*` (se prueba por cada rol). Las tablas nuevas siguen el patrón de la Etapa 0: `ctl_entrega_firma` y `ctl_cierre_corte` son solo inserción (trigger de inmutabilidad), `ctl_entrega` tiene estado con transiciones (`ctl_transicion`).

## 3. Cierre: esperados, tolerancia y casos

* **Esperados** (`ctl_calcular_punto`): el alcance del cierre (`ctl_alcance`) es el turno (cierre de turno), todos los turnos del día local (cierre de día) o los últimos 7 días (semanal).
  * `efectivo_esperado` = fondo inicial + ventas en efectivo − retiros/gastos/devoluciones + depósitos − cancelaciones en efectivo; **la misma cuenta que `cerrar_turno` de Caja**. En un cierre de día el fondo es el del primer turno (el efectivo pasa de un turno al siguiente).
  * `tarjeta_esperada` = pagos `tarjeta` + `clip` de tickets no cancelados. `transferencia_esperada` = pagos `transferencia`. `tickets_cobrados` = tickets cobrados.
  * `kits_usados`: ver §5.
* **Tolerancia**: efectivo → parámetro `tolerancia_efectivo` (±$20 por omisión, por sucursal, versionado); kits → `tolerancia_kits` (0; mayor a 0 solo con confirmación del dueño, Etapa 0); los demás puntos usan la `tolerancia` del propio punto. Se evalúa con la configuración vigente **al cerrar**.
* **Caso por punto fuera de tolerancia**: `diferencia_kits` para kits y `diferencia_efectivo` para efectivo, tarjeta y transferencias (el catálogo de tipos de la especificación no tiene «diferencia de tarjeta»; `contexto.formula` la distingue). Sin `producto_id`: un faltante de efectivo o un kit ya descontado **no** es un ajuste de inventario, así que `ctl_autorizar_ajuste` los rechaza («no tiene un ajuste de inventario que autorizar»). Alertas: `cierre_fuera_tolerancia` (dueño y supervisor) y `kits_sin_ticket` (dueño).
* **Corte** (`ctl_cierre_corte`, solo dueño y supervisor): efectivo esperado/contado, tarjeta esperada/terminal, kits usados/servicios cobrados, número de tickets, cancelaciones del turno, aperturas de cajón sin venta y ventas por debajo de catálogo (precio cobrado por unidad contra `precio_item`; detalle de las 20 mayores).

## 4. Entrega de turno con doble firma

1. Quien entrega cierra su cierre de turno y **confirma el monto** (`p_monto_confirmado`); el servidor lo compara con la suma de su desglose y rechaza si no coincide. Se crea `ctl_entrega` (`pendiente`) y la firma `entrega`; el cierre queda en **`entrega_no_aceptada`** (visible en la lista y, en la Etapa 6, en el tablero: criterio 18).
2. Quien recibe ve la entrega **sin el monto**, cuenta por denominación y firma con su **PIN** (mismo PIN y bloqueo de 3 fallos / 15 min que `ctl_pin_abrir_sesion`). No puede ser quien entregó.
   * **Cuadra** (mismo monto al centavo): `aceptada`, el cierre pasa a `cerrado` con `usuario_recibe` y `aceptado_en`.
   * **No cuadra**: se muestra la diferencia a quien recibe, se abre el caso `diferencia_relevo` (origen = la firma, con las dos firmas en el contexto), alerta `diferencia_relevo` al dueño y supervisor; la entrega queda `aceptada_con_diferencia`. *Decisión por defecto:* no se frena la operación; el fondo del turno queda en lo contado.
3. **Fondo inicial = monto confirmado**: si quien recibió ya había abierto su turno, el servidor corrige su `fondo_inicial` al aceptar; si lo abre después, el trigger `t_ctl_fondo_entrega` sobre `turnos_caja` **ignora lo que se teclee** y pone el monto confirmado (solo si hay una entrega aceptada por esa persona en las últimas 24 h).
4. **El entrante no puede vender hasta aceptar (criterio 19).** Contrato consultable: `piefirme.ctl_puede_vender(sucursal) → {puede, motivo, ...}`. Está **ya aplicado en Caja** mediante el trigger `t_ctl_bloqueo_entrega` sobre `ventas` (actúa solo en el cambio `por_cobrar/cuenta_abierta → cobrada/por_facturar` con sesión de usuario, y solo si existe una entrega pendiente en la sucursal; sin entregas el comportamiento de Caja es idéntico al anterior; no se tocó `cobrar_venta` ni `CajaCobro.jsx`). La Etapa 1 puede además llamar a `ctl_puede_vender` al abrir la pantalla de cobro para avisar antes de teclear el ticket.
5. Si el entrante nunca llega, supervisor o dueño **liberan** la entrega con motivo (`ctl_entrega_liberar`): la sucursal vende de nuevo, el cierre sigue marcado `entrega_no_aceptada` y el dueño recibe alerta.

## 5. Cuadre de kits (criterio 20)

`kits usados = existencia anterior + recibido − quedan`. *Existencia anterior*: lo que quedó en el cierre anterior de la sucursal para el mismo punto; si no hay, la existencia del sistema al inicio del periodo. *Recibido*: compras, traspasos de entrada y devoluciones de cliente del insumo desde el cierre anterior. *Esperado*: servicios cobrados del turno × consumo de `ctl_consumo_esperado` (si el insumo no tiene consumo definido, cada servicio cobrado consume `parametros.kits_por_servicio`, 1 por omisión). 12 usados contra 10 tickets → diferencia +2 → caso `diferencia_kits` y alerta «2 servicio(s) sin cobro» esa misma noche. El punto de kits se siembra **inactivo**: el dueño elige el insumo y lo activa (el servidor no deja activarlo sin insumo).

## 6. Tomas fijas y par cierre / apertura

* `ctl_toma_fija` por sucursal (siembra: *Mostrador* y *Escritorio*); un punto con `parametros.toma_fija` pide **una foto por cada toma aplicable** (un cierre no cierra sin todas).
* Cámara **en vivo** (`getUserMedia`; no hay selector de archivos ni ruta de galería): compresión en el dispositivo a `foto_lado_largo_px` (1,600), `sha256` en el cliente, subida a `pf-auditoria` y registro con hora del servidor. La guía fantasma (35 % de opacidad) es la última foto de esa toma; quien captura puede firmar **solo esa** foto (política de storage acotada `ctl_es_guia_toma`); el resto del bucket sigue siendo de dueño y supervisor.
* `ctl_pares_toma` empareja cada apertura con el cierre inmediato anterior de la misma toma (orden `capturado_en, seq`) y lista los cierres sin apertura posterior (`pendiente_apertura` < 20 h, `sin_apertura` después). La pantalla los muestra con deslizador antes/después.
* Alertas: `apertura_sin_cierre_previo`, `cierre_sin_apertura` (hoy no hubo apertura con fotos), `apertura_tardia` (foto de apertura después de la primera venta del día), `foto_repetida` (hash idéntico; trigger de la Etapa 0, criterio 6).

## 7. Archivos

Migraciones: `230_ctl_cierres_catalogo.sql`, `231_ctl_cierres_motor.sql`, `232_ctl_cierres_cierre_entrega.sql`, `233_ctl_cierres_tomas.sql`, `234_ctl_cierres_ajustes.sql`.
Lógica: `src/lib/auditoria/cierres.js`, `foto.js`, `apiCierres.js` (+ `cierres.test.mjs`).
Pantallas: `src/pages/auditoria/Cierres.jsx`, `src/pages/auditoria/cierres/{Recorrido,Entregas,Revision,ComparadorFotos,CamaraEnVivo,PuntosControl}.jsx`; `Configuracion.jsx` (solo cambia la pestaña de puntos y añade *Tomas fijas* y *Consumo de insumos*).
Pruebas: `scripts/test-auditoria-cierres-qa.mjs`.

## 8. Pruebas

* `node --test src/lib/auditoria` — lógica pura (denominaciones, tipos de captura, resolución y versionado de puntos, progreso, tolerancia, kits, entrega, tomas, ciegas, foto y hash).
* `node --test scripts/test-auditoria-cierres-qa.mjs` — contra QA, **una transacción que siempre se deshace**; cada escenario crea su propia sucursal, turno, ventas y puntos de control dentro de la transacción. **Los folios (SES/CIE/CAS) salen de un contador por organización que bloquea la fila hasta el fin de la transacción**: si otra corrida del módulo (p. ej. las pruebas del motor de conteo) tiene su transacción abierta, esta espera su turno (la prueba sube `statement_timeout` a 15 min).

### Resultados (QA, 2026-11-26)

* `node --test src/lib` (toda la lógica, incluida la de la Etapa 2 en curso): 202 pruebas, 0 fallas; de ellas 11 son las nuevas de cierres.
* `node --test scripts/test-auditoria-cierres-qa.mjs`: **56 pruebas, 0 fallas**. Cubren: siembra y catálogo de fórmulas; rechazo de fórmulas y tipos incompatibles; solo el dueño configura; obligatorios (mensaje con lo que falta); denominaciones sin total (rechazo de total tecleado, denominación inválida, repetida o negativa, total sumado por el servidor, sin columna de total); corrección como fila nueva; idempotencia por id de cliente; hora del servidor y discrepancia registrada (criterio 5); versionado del checklist (criterio 22); captura a ciegas del cierre en tablas, vistas y respuestas de RPC (criterio 1); tolerancia ±$20 por omisión (−$10 sin caso, −$30 caso `diferencia_efectivo` con alerta) y tolerancia por sucursal versionada; cuadre de kits 12 contra 10 (criterio 20) y con consumo esperado; doble firma (cuadra, no cuadra, `entrega_no_aceptada`, PIN incorrecto, quien entrega no acepta, liberación; criterios 18 y 19); fondo inicial = monto confirmado (con el turno abierto antes y después de aceptar); foto sin galería (criterio 4); guía fantasma acotada; hash idéntico entre tomas (criterio 6) y pares; apertura tardía y sin cierre previo; INSERT/UPDATE/DELETE denegados a los cinco roles en todas las tablas de cierres; ninguna función nueva ejecutable por anon.
* Migraciones 230–235 aplicadas a QA. Corrida de seguridad (`test-rls`) tras cada una: **12 fallas, las mismas preexistentes** (10 `portal_*` con EXECUTE heredado de PUBLIC, `_rannix_semillas` sin RLS, bucket `comercio_img` público); ninguna nueva.
* `vite build` compila. Humo en navegador contra QA (solo lectura): recepción ve *Hacer un cierre* y *Entregas de turno* (sin las pestañas de revisión); el dueño ve además *Cierres y cortes* y *Tomas fijas*; Configuración muestra los cinco puntos sembrados.

* **Pruebas de la Etapa 0** (`scripts/test-auditoria-qa.mjs`): se ajustó UNA aserción —ahora las siembras de la Etapa 4 versionan los puntos de control por omisión, así que el test de versiones compara contra el conteo previo en vez de «2»—. Verificado con una copia: 56 de 56. **Hallazgo para la Etapa 2:** su índice único `ctl_sesion_abierta_uq` (migración 210) hace fallar en ese archivo la prueba «folios consecutivos sin huecos», que inserta tres sesiones abiertas del mismo tipo en la misma sucursal; al abortar la transacción caen en cascada las pruebas siguientes. Corrección sugerida: que ese test use tres tipos de sesión distintos.

## 9. Decisiones que requieren al dueño

1. **Entrega que no cuadra**: hoy se acepta con diferencia (caso + alerta) y el fondo queda en lo contado. Alternativa: frenar la venta hasta que supervisor/dueño resuelva.
2. **Tipo de caso de tarjeta/transferencia**: se usa `diferencia_efectivo` (el catálogo de la especificación no trae «diferencia de tarjeta»). Si se quiere distinguir en reportes, hay que ampliar el catálogo de tipos.
3. **Insumo de los kits**: queda sin elegir (punto inactivo) hasta que el dueño indique cuál producto es el kit y, si quiere, el consumo por servicio.
4. **Aperturas de cajón sin venta**: el corte ya las cuenta, pero el origen aún no emite `cajon_abierto_sin_venta` (Etapa 1): hoy siempre es 0.
5. **Quien entrega y quien recibe deben ser personas distintas**: en una sucursal de una sola persona hay que cerrar el *día* (sin entrega) o que supervisor/dueño libere la entrega.
6. **Tarjeta = tarjeta + terminal Clip** en el esperado del terminal.

## 10. Lo no verificado

* Las pantallas compilan (build) pero **no se probaron en navegador con cámara real**: la cámara en vivo, la guía fantasma, la compresión en el dispositivo y el deslizador no tienen prueba automática más allá de la lógica pura (`foto.js`).
* No hay prueba de carga (la especificación pide < 3 s por cierre de 100 partidas: no aplica a cierres; el cierre mide ~1–2 s en QA con pocas ventas).
* `ctl_cierre_cerrar` y el corte consultan ventas con `precio_item` por línea: con miles de líneas en un cierre semanal podría ser lento (no medido).
