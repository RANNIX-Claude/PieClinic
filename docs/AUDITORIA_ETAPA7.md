# Control y Auditoría — Etapa 7: cadena de custodia

Alcance: especificación §F5.1 a F5.4 (recepción con responsiva, sellos VOID, piezas de alto valor, talonarios de contingencia y caídas del sistema), con F2.5 y F3.5 solo en lo relacionado (tomas fijas). Migraciones **250–255**, pruebas en `scripts/test-auditoria-custodia-qa.mjs` y `src/lib/auditoria/custodia.test.mjs`, pantallas en `src/pages/auditoria/custodia/`. Lo decidido en la Etapa 0 ([`AUDITORIA_ARQUITECTURA.md`](AUDITORIA_ARQUITECTURA.md)) sigue vigente: todo se escribe por RPC `SECURITY DEFINER`, nada de UPDATE/DELETE en tablas de captura, hora del servidor, captura a ciegas.

## 1. Qué hace

| Pieza | Qué resuelve |
|---|---|
| **Recepción con responsiva** (F5.1) | Quien recibe escanea cada pieza, la verifica (sello intacto, o la abre y la vuelve a sellar), toma la foto en vivo y firma con su PIN. Desde ese instante la pieza es suya, con fecha, hora y usuario. Sustituye el «ya recibí» por WhatsApp. Solo aplica a productos con la bandera `requiere_sello`. |
| **Sellos VOID** (F5.2) | Colocar, verificar (intacto + peso con báscula sin abrir la caja) y **reapertura** (pieza, motivo, usuario, folio nuevo, `sello_anterior_id`). Un sello roto sin registro de reapertura es alerta al supervisor y abre un caso `sello_roto`. |
| **Alto valor** (F5.3) | Número de serie por PIEZA (no por modelo), entra a la custodia del relevo con el tope duro de 30, y su venta avisa de inmediato al dueño. |
| **Talonarios** (F5.4) | Alta por la oficina central, captura de tickets de papel con foto, validación de rango y folio repetido en el servidor, auditoría de continuidad (criterio 21) y caídas del sistema con comparación contra el promedio de la tienda. |
| **Tomas fijas** | Ya las construyó la Etapa 4 (`ctl_toma_fija`, guía fantasma, `ComparadorFotos`, pares cierre/apertura). **No se duplicó nada**: la pantalla de custodia del relevo solo muestra las tomas de la sucursal y si ya tienen foto de referencia, y apunta a Configuración → Tomas fijas. |

## 2. Esquema (migración 250) y contratos de servidor (251–255)

Tablas nuevas, todas de **solo inserción** (trigger de inmutabilidad: ni el dueño de la base puede modificar o borrar) salvo `ctl_pieza` (con estado):

| Tabla | Para qué | Quién la lee |
|---|---|---|
| `ctl_recepcion`, `ctl_recepcion_linea` | La recepción firmada y cada pieza (con `responsable_id` y `responsable_desde`) | La propia persona (lo que firmó); dueño y supervisor, todo |
| `ctl_sello_verificacion` · `ctl_sello_verificacion_calculo` | Cada revisión de un sello · lo que el sistema esperaba del peso (peso esperado, desviación, tolerancia, resultado) | Propia · **solo dueño/supervisor** |
| `ctl_pieza` | Pieza con número de serie (`en_sucursal → vendida \| retirada`); única por (clínica, producto, serie) | **Solo dueño/supervisor** (es la existencia esperada) |
| `ctl_venta_alto_valor` | Línea de venta ya evaluada (idempotencia del poleo) con serie, candidatas, precio y alerta | Solo dueño/supervisor |
| `ctl_talonario_auditoria` | Cada auditoría de talonario: siguiente en blanco, foto, faltantes, adelantados, caso | Solo dueño/supervisor |
| `ctl_caida_resumen` | Foto al cierre de la caída: venta del sistema, venta manual, esperada, proporción | Solo dueño/supervisor |
| `ctl_producto_atributo_bitacora` | Quién cambió qué bandera del catálogo, cuándo, antes y después | Dueño, supervisor y soporte |

Columnas añadidas a las tablas de la Etapa 0: `ctl_sello` (origen, evidencia, `roto_en`, `caso_id`; índice único de **un sello vigente por serie**), `ctl_talonario` (`recibido_nombre`, nota, motivo de cancelación), `ctl_ticket_manual` (`productos`, `caida_id`, `hora_venta`; las filas `faltante` que deja una auditoría se resuelven si aparece el papel) y `ctl_caida_sistema` (una sola caída abierta por sucursal). Transiciones nuevas: sello `roto_sin_registro → reemplazado`, ticket `faltante → capturado | cancelado`, pieza `en_sucursal → vendida | retirada`. La política de `ctl_sello` se **endureció**: quien captura solo ve los sellos que él colocó (los vigentes de los demás son «lo que el sistema espera de la pieza»).

| RPC (`piefirme.`) | Capacidad | Hace |
|---|---|---|
| `ctl_producto_atributo_guardar` · `ctl_productos_control_listar` | **configurar** (dueño, soporte) · dueño/supervisor/soporte | Banderas `requiere_serie`, `requiere_sello`, `alto_valor` (fuerza serie) y `peso_caja_llena`; bitácora de cambios. |
| `ctl_sello_colocar` · `ctl_sello_reabrir` · `ctl_sello_reabrir_por_folio` · `ctl_sello_verificar` | capturar | Folio único, serie por pieza, motivo y folio nuevo en la reapertura; verificación con peso. A quien captura solo se le devuelve `peso_coincide` (sí/no), nunca el peso esperado ni la desviación, y hay un límite de 5 verificaciones por persona, folio y hora (para que no se pueda adivinar el esperado). |
| `ctl_recepcion_registrar(id, sucursal, documento, lineas, pin, …)` | capturar | Valida todo (producto con sello, serie por pieza, foto propia por pieza, foto de ESE origen y de ESA persona) **antes** de gastar un intento de PIN; firma con `ctl_verificar_pin` (3 fallos bloquean 15 min); crea sellos, piezas con serie y líneas de responsiva; emite `recepcion_registrada` en `ctl_eventos_entrada`. Idempotente por `id`. |
| `ctl_pieza_registrar` | capturar | Alta de una pieza con su serie. |
| `ctl_custodia_estado` · `ctl_custodia_incluir_alto_valor` | capturar · configurar | Estado de la custodia con la **explicación del tope**; mete los productos de alto valor hasta el tope y devuelve los que no caben (sin error). |
| `ctl_alto_valor_revisar(horas)` | investigar | Botón «Revisar ventas ahora»; llama al poleo. |
| `ctl_talonario_alta` · `ctl_talonario_cancelar` · `ctl_talonario_auditar` | **investigar** (supervisor, dueño) | Rango sin traslape (máx. 2,000 folios); la auditoría valida continuidad. |
| `ctl_ticket_manual_capturar` · `ctl_talonario_resumen` | capturar | El folio debe caer en un talonario **activo de esa sucursal** y no estar capturado; foto en vivo obligatoria; liga a la caída abierta; marca el talonario `consumido` al completarse. |
| `ctl_caida_iniciar` · `ctl_caida_cerrar` · `ctl_caidas_listar` | capturar | Una caída abierta por sucursal; al cerrar guarda la comparación y evalúa si la sucursal «se cae» seguido. La comparación solo la devuelve a dueño y supervisor. |

**Internas (la app no las ejecuta; se revocó a `authenticated`):** `piefirme_app.ctl_alto_valor_evaluar(org, desde)`, `ctl_alto_valor_procesar(org, venta)`, `ctl_talonario_alerta_diaria(org)`, `ctl_sello_marcar_roto`, `ctl_caida_calcular`, `ctl_caidas_evaluar`, `ctl_cus_*`. Un trigger `AFTER INSERT` sobre `ctl_partida_conteo` marca como roto el sello vigente cuando un conteo reporta `sello_intacto = false` (sin romper nunca la captura del conteo).

## 3. Reglas que se hacen cumplir en el servidor

* **Recepción:** solo productos con `requiere_sello` («en el piloto se controla lo caro y en caja, no las 2,000 claves»); una foto por pieza, en vivo, de quien recibe y registrada como origen `recepcion` de ESTE id; PIN correcto; una serie no se recibe dos veces (ni se repite dentro de la misma recepción). Una pieza vendida o ya registrada no se recibe de nuevo.
* **Sellos:** folio único por clínica; un sello vigente por serie; la reapertura exige motivo (5+ caracteres) y folio distinto; un sello reemplazado ya no se verifica. Un sello vigente en otra sucursal no se «recibe»: se reabre y se vuelve a sellar (decisión revisable, ver §7).
* **Alto valor:** `alto_valor ⇒ requiere_serie`; la serie es de 3 a 60 caracteres y única por (clínica, producto).
* **Talonarios:** rango válido y sin traslape; folio dentro de un talonario activo de la sucursal; folio no repetido; si el folio estaba marcado `faltante`, la captura lo resuelve. Fecha de venta dentro de los últimos 90 días.
* **Auditoría del talonario (criterio 21):** `siguiente en blanco = N` ⇒ los folios del inicial al N−1 deben estar `capturado` o `cancelado`. Los que falten se marcan (`faltante`), se abre **un** caso `folio_faltante` por auditoría (con la lista en el contexto) y se alerta al dueño; los capturados desde N en adelante son «adelantados» y también abren caso. Una segunda auditoría con el mismo faltante no abre otro caso.
* **Caídas:** venta del periodo (sistema + tickets manuales) contra el promedio de las mismas horas del mismo día de la semana en las 8 semanas previas (se necesitan al menos 2 con venta; si no, «sin historia suficiente»). Alerta `sucursal_se_cae` si en la ventana (30 días) hay al menos 3 caídas y más de la mitad de las medibles (y al menos 2) vendieron menos del 50 % de lo normal; una por día y sucursal. Es un patrón para revisar, no una conclusión.

## 4. Alertas que emite (todas en `ctl_alerta`)

| Tipo | Destinatario | Cuándo |
|---|---|---|
| `sello_roto_sin_registro` | supervisor y dueño | Sello hallado roto (verificación, recepción o conteo) sin reapertura registrada; ligada al caso `sello_roto` |
| `peso_fuera_de_rango` | supervisor y dueño | La caja pesa distinto del peso de caja llena, fuera de tolerancia |
| `venta_alto_valor` | dueño | Se vendió una pieza de alto valor: qué pieza, qué serie, qué sucursal, a qué precio, qué ticket (severidad crítica) |
| `folio_faltante` | dueño | La auditoría de un talonario halló faltantes o adelantados; ligada al caso |
| `folio_faltante_diario` | dueño | **Resumen diario** de todos los folios que siguen faltando (una por clínica y día): es la que consume el correo diario |
| `sucursal_se_cae` | dueño y supervisor | La sucursal se cae seguido y vende menos en esos ratos |

**Canal.** La Etapa 6 define los adaptadores simulados (push, WhatsApp, correo). Al momento de esta etapa no existían, así que **todas las alertas se registran en `ctl_alerta`** y nada más; los destinatarios usan el mismo vocabulario de la Etapa 0 (`dueno`, `supervisor`). Cuando exista el adaptador de correo diario, debe leer `folio_faltante_diario` (y `folio_faltante`) y el de push/WhatsApp `venta_alto_valor` y `sello_roto_sin_registro`.

## 5. Venta de alto valor: poleo y contrato con el origen

El origen todavía no emite un evento de venta. Se implementó el poleo:

* `piefirme_app.ctl_alto_valor_evaluar(org, desde)` revisa las ventas cobradas (`cobrada`, `por_facturar`, `facturada`) con líneas de productos marcados `alto_valor` y aún no evaluadas; `ctl_alto_valor_procesar(org, venta)` evalúa una venta. Idempotentes por línea (`ctl_venta_alto_valor`, único por línea): se pueden correr cada minuto sin repetir alertas.
* **Serie vendida:** las líneas de venta no traen número de serie. Se determina solo si es inequívoca (una sola pieza `en_sucursal` de ese producto en esa sucursal y una unidad vendida): la pieza pasa a `vendida`. Si hay varias, la alerta lista las **candidatas**; si no hay ninguna registrada, dice «sin serie registrada: la pieza vendida no estaba dada de alta». **Decisión para el origen:** cuando la línea de venta (o su evento) traiga el número de serie, hay que pasarlo aquí para que sea exacto.
* **Planificador:** `node scripts/custodia-planificador.mjs qa|prod [--horas=72]` corre el poleo y la alerta diaria de folios de todas las clínicas activas o en prueba (usa el rol de base de datos; `prod` exige `--confirmo-produccion`). También hay un botón «Revisar ventas ahora» para dueño y supervisor.
* **Cuando el origen emita `venta_registrada`:** basta llamar `piefirme_app.ctl_alto_valor_procesar(org, venta)` al recibirlo.

## 6. Frontend

Ruta `/auditoria/custodia` (ítem «Custodia» del grupo AUDITORÍA; pestaña elegible con `?tab=`) y `/auditoria/custodia/recepcion` (la recepción sola, para el móvil). Roles: capturan recepción, podología, supervisor y dueño; ven y administran supervisor y dueño; configura el dueño (Catálogo de control, también como pestaña de Configuración de auditoría). Estados vacíos honestos en todas las listas.

* `Recepcion.jsx` — **componente reutilizable** (`export default function Recepcion({ sucursalId, onTerminar })`) que la PWA de la Etapa 5 monta en su pantalla RECEPCIÓN; más `ListaRecepciones`.
* `Sellos.jsx` (verificar, colocar, reabrir, lista) · `AltoValor.jsx` (registrar pieza, piezas, ventas) · `CustodiaRelevo.jsx` (estado y **explicación del tope de 30**, incluir alto valor, tomas fijas) · `Talonarios.jsx` (capturar ticket, caídas, alta, auditoría) · `CatalogoControl.jsx` (banderas) · `Custodia.jsx` (hub) · `RecepcionRuta.jsx` · `comunCustodia.jsx` (foto en vivo, selector de sucursal).
* Lógica pura y probada: `src/lib/auditoria/custodia.js`; acceso a datos: `custodiaApi.js`.
* **La sucursal no ve nunca** saldo, existencias, peso esperado, ventas de alto valor, la comparación de caídas ni los sellos que no colocó.

Edición mínima a archivos compartidos: `src/menu/auditoria.js` (un ítem), `src/routes/auditoria.jsx` (dos rutas), `src/lib/permisos.js` (las dos rutas en `RUTAS_SUPERVISOR`), `src/pages/auditoria/Configuracion.jsx` (una pestaña) y `src/lib/auditoria/config.js` (4 parámetros).

## 7. Decisiones para el dueño y desviaciones

1. **Piloto:** la recepción exige la bandera `requiere_sello`; el dueño decide qué productos la llevan (Catálogo de control). No hay ninguno marcado por omisión en producción.
2. **Peso:** `peso_caja_llena` está en **gramos**. Tolerancia ±5 % por omisión (configurable por sucursal; **tope duro 25 %**: más deja pasar cajas incompletas). A quien captura se le dice solo «coincide / no coincide» para que sepa si abrir la caja (decisión revisable: es lo más cercano a un «diferencia» que ve la sucursal; se limita a 5 intentos por hora por folio).
3. **Peso fuera de rango = alerta, no caso.** El catálogo de tipos de caso no tiene «caja incompleta»; abrir un `diferencia_inventario` sin cantidad no tendría ajuste que autorizar. Si el dueño lo quiere como caso, hay que ampliar el catálogo de tipos.
4. **Sello de otra sucursal:** una pieza sellada que cambia de sucursal se reabre y se vuelve a sellar; `sucursal_id` de un sello es inmutable por diseño de la Etapa 0.
5. **Talonario:** lo da de alta supervisor o dueño (la especificación dice «oficina central»); no hay un rol de oficina aparte.
6. **Alerta por correo:** hoy solo `ctl_alerta` (ver §4).
7. **Serie vendida:** ver §5.
8. **Tomas fijas:** sin cambios; la «referencia fantasma» ya es automática (la última foto de cada toma). Si el dueño quiere fijar una foto de referencia manual distinta de la última, es un cambio pequeño pendiente de decidir.

## 8. Archivos

Migraciones: `250_ctl_custodia_esquema.sql`, `251_ctl_custodia_sellos_recepcion.sql`, `252_ctl_custodia_alto_valor.sql`, `253_ctl_custodia_talonarios.sql`, `254_ctl_custodia_ajustes.sql`, `255_ctl_custodia_recepcion_serie.sql`.
Lógica: `src/lib/auditoria/custodia.js`, `custodiaApi.js`, `config.js` (cuatro parámetros). Pantallas: `src/pages/auditoria/custodia/*`.
Scripts: `scripts/test-auditoria-custodia-qa.mjs` (pruebas), `scripts/semilla-auditoria-custodia-qa.mjs` (semilla idempotente solo QA), `scripts/custodia-planificador.mjs`.

## 9. Pruebas

* `node --test src/lib/auditoria/custodia.test.mjs` — lógica pura (tope y su explicación, folios, peso con tolerancia, rangos, continuidad del talonario con el 18 faltante y el 25 en blanco, ticket manual, línea de recepción, caídas). Toda la carpeta `src/lib/auditoria`: **90 pruebas, 0 fallas**.
* `node --test scripts/test-auditoria-custodia-qa.mjs` — contra QA, **una transacción que siempre se deshace**; cada bloque crea sus sucursales, productos, turnos y ventas dentro de la transacción: **67 pruebas, 0 fallas**. Cubren: solo el dueño marca banderas y queda bitácora; **30 en custodia entran y el 31 se rechaza con la explicación (criterio 7)**; incluir alto valor respeta el tope y devuelve los omitidos; recepción sin foto, con la misma foto en dos piezas, con foto de otro origen, sin serie, con PIN incorrecto (no se registra nada) y con PIN correcto (usuario, fecha y hora de servidor, evento `recepcion_registrada`, reenvío idempotente); recepción inmutable aun para el dueño de la base (criterio 8); abierta y resellada; sello roto al recibir; peso fuera de rango; sello de otra sucursal; **sello roto sin reapertura → alerta al supervisor y caso `sello_roto`** (por verificación y por conteo); **reapertura con nuevo folio** y `sello_anterior_id`; tolerancia del peso configurable con tope 25 %; límite de intentos; serie por pieza y serie repetida; **venta de alto valor → alerta crítica al dueño con pieza, serie, sucursal y precio**, idempotente, con candidatas y sin alerta para productos comunes; talonarios (alta solo supervisor/dueño, traslape, folio fuera de rango, folio repetido, sin foto, idempotencia); **auditoría con el folio 18 sin capturar y el 25 en blanco → caso `folio_faltante` y alerta (criterio 21)**, segunda auditoría sin caso duplicado, adelantados, resolución cuando aparece el papel, talonario consumido y cancelado; caídas (una abierta por sucursal, tickets ligados, comparación contra el promedio, alerta «se cae» una por día); captura a ciegas (ninguna respuesta de RPC a recepción o podología trae campos ciegos; cero filas en las tablas de «lo esperado»); INSERT/UPDATE/DELETE denegados a los cinco roles en las 14 tablas; tablas de captura inmutables y de estado solo por RPC; ninguna función nueva ejecutable por anon, y las internas tampoco por la app.
* Regresión de las etapas anteriores tras las migraciones 250–255 (tocan `ctl_sello`, `ctl_evidencia` y agregan un trigger a `ctl_partida_conteo`): `test-auditoria-conteo-qa` 28/28, `test-auditoria-cierres-qa` 56/56, `test-auditoria-casos-qa` 45/45.
* Seguridad (`npm run test:rls`): **12 fallas, las mismas preexistentes** (10 `portal_*` con EXECUTE heredado de PUBLIC, `_rannix_semillas` sin RLS y el bucket `comercio_img` público); ninguna nueva tras las migraciones 250–255. `node scripts/validar-sql-local.mjs`: 115/115 migraciones en PGlite, sin tablas sin RLS ni vistas sin `security_invoker`.
* `vite build` compila (probado a un directorio temporal, sin tocar `dist/`).
* Navegador (Playwright headless contra el dev server de QA, cuentas `m@g.com`, `r@g.com` móvil 390 px y `s@g.com`, con capturas): carga sin errores de consola propios las diez vistas del dueño, la recepción y los talonarios en móvil, la custodia de la sucursal y la del supervisor (que no ve el Catálogo de control). Se hizo con la semilla `scripts/semilla-auditoria-custodia-qa.mjs` (3 productos marcados, 2 piezas con serie y un talonario 5001–5050 en Centenario; `--quitar` desmarca los productos).

### Lo no verificado

* **Cámara real y subida real a Storage desde la pantalla.** Las pruebas de base de datos simulan la foto insertando el objeto en `storage.objects` (como hace la subida) y registrándolo con `ctl_evidencia_registrar`; en el navegador no se tomó ninguna foto ni se firmó una recepción para no escribir datos de prueba permanentes en QA. El flujo completo (escanear → foto → PIN) solo está probado en sus dos mitades: la lógica pura y la RPC.
* **Escáner por cámara** (`CamaraEscaner`, html5-qrcode) en un teléfono real; **báscula**: el peso se teclea.
* **Integración con la PWA de la Etapa 5:** `Recepcion` está listo para montarse, pero no se probó dentro de la PWA.
* **Rendimiento** de la comparación de caídas y del poleo con historial grande (8 consultas por caída; el poleo recorre solo las ventas de las últimas 72 h con líneas de alto valor).
* **Correo diario y push:** no existen adaptadores aún (Etapa 6); solo hay filas en `ctl_alerta`.
