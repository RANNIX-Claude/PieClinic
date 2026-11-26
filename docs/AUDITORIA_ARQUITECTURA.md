# Control y Auditoría — arquitectura (Etapa 0: cimientos)

Fuente de requisitos: [`AUDITORIA_ESPECIFICACION.md`](AUDITORIA_ESPECIFICACION.md) (módulo de 9 etapas). Este documento fija **lo que decide la arquitectura** y lo que cada etapa siguiente debe respetar. Migraciones **200–206**, pruebas en `scripts/test-auditoria-qa.mjs` y `src/lib/auditoria/`.

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Pie Firme es el **origen** (el «PODIX» de la especificación). Las tablas del módulo van con prefijo **`ctl_` dentro del esquema `piefirme`**, no en un esquema nuevo. | Un esquema nuevo habría que exponerlo en la Data API de Supabase. El prefijo + vistas de lectura conservan el desacoplamiento; mover `ctl_*` a otro esquema después es un `alter table … set schema`. |
| D2 | **Sin llaves foráneas** hacia tablas del origen (`productos`, `sedes`, `perfiles`, `turnos_caja`, `ventas`…). Solo hay FK entre tablas `ctl_`. `organizacion_id` tampoco lleva FK. | La especificación pide poder apuntar a otro origen. **Desviación documentada:** al borrar una organización los `ctl_*` quedan huérfanos y las tablas son inmutables; la única salida es la purga explícita (§5). |
| D3 | Lectura del origen **solo** por ocho vistas `v_ctl_*` (solo lectura, `security_invoker`). | Si el origen cambia, se reimplementan esas ocho vistas y el módulo no cambia. |
| D4 | **Un solo punto de escritura hacia el origen:** `piefirme.ctl_solicitar_ajuste_origen` (≡ `POST /podix/inventario/ajuste`), idempotente por `folio_caso`, con petición y respuesta en `ctl_llamada_origen`. **La app no puede ejecutarla**; solo `ctl_autorizar_ajuste`. | El módulo nunca corrompe el inventario: solicita y el origen aplica. |
| D5 | **Captura a ciegas por estructura**, no por filtro: lo que el sistema «espera» vive en tablas aparte (`ctl_partida_calculo`, `ctl_cierre_calculo`, `ctl_sesion_resultado`) con RLS que solo abre a quien ve diferencias. | Una pantalla nueva no puede filtrar mal lo que la base nunca le entrega. Desviación menor del modelo de la especificación (los campos `saldo_sistema`, `diferencia_*`, `valor_esperado`… no están en `ctl_partida_conteo` / `ctl_cierre_captura`; están en sus tablas `*_calculo`). |
| D6 | **Todo se escribe por RPC `SECURITY DEFINER`**. `authenticated` solo tiene `SELECT` (se revocó INSERT/UPDATE/DELETE/TRUNCATE de los privilegios por omisión del esquema). | Criterio de aceptación 8 y «reglas duras en el servidor». |
| D7 | Roles: se **mapean** a los existentes (§3). El superadministrador de prueba `a@g.com` es **soporte RANNIX** dentro del módulo (solo lectura y configuración), aunque en el resto del sistema opere como administrador. | Cumple «soporte lee pero no captura ni autoriza». Para probar flujos de dueño usar `m@g.com`. |
| D8 | PIN: se **reutiliza** «Mi PIN» (`pins_personales`, `definir_pin_personal`, migración 073). Longitud 4–8 (la especificación pide 4–6; no se cambió para no invalidar PIN ya definidos). | Evitar duplicar el secreto de la persona. |
| D9 | Foto: bucket privado nuevo **`pf-auditoria`** (el viejo `pf-auditorias` es de otro módulo); ruta `<organizacion_id>/ctl/<sucursal_id>/<archivo>`. `scripts/clonar-esquema.mjs` ya lo renombra (`pc-auditoria`) para la instancia Pie Clinic. | Retención y políticas independientes. |

## 2. Mapa de tablas (todas `piefirme.ctl_*`)

Todas llevan `organizacion_id`, `creado_en` (**`now()` del servidor, lo fija un trigger; el cliente no puede mandarlo**), `creado_por` (`auth.uid()`) y, si aplica, `sucursal_id`. Montos `numeric`; fechas `timestamptz` (UTC; se muestran en la zona de la clínica).

| Grupo | Tabla | Clase | Notas |
|---|---|---|---|
| Conteos | `ctl_sesion_conteo` | estado | folio `SES-AAAA-NNNNN` |
| | `ctl_partida_conteo` | **solo inserción** | el `id` lo genera el cliente: un reenvío choca con la PK y no duplica; `corrige_a` referencia la fila corregida |
| | `ctl_partida_calculo` | solo inserción · **solo ver diferencias** | saldo congelado, diferencias, costo, precio de catálogo, clasificación |
| | `ctl_sesion_resultado` | solo inserción · solo ver diferencias | partidas con diferencia, valor |
| | `ctl_lista_solicitada` | estado | `reportado` |
| Cierres | `ctl_punto_control` | estado (versionado) | cada cambio = versión nueva; `grupo_id` une versiones |
| | `ctl_cierre` | estado | folio `CIE-…`; `version_checklist` = instantánea `[ {punto_id, grupo_id, version} ]` (criterio 22) |
| | `ctl_cierre_captura`, `ctl_denominacion` | solo inserción | sin campo de total en denominaciones |
| | `ctl_cierre_calculo` | solo inserción · solo ver diferencias | valor esperado, diferencia, dentro de tolerancia |
| Evidencia | `ctl_evidencia` | solo inserción | `hash_sha256`; trigger alerta por hash repetido en la sucursal |
| | `ctl_toma_fija` | estado | |
| Casos | `ctl_caso` | estado | folio `CAS-…`; transiciones en `ctl_transicion` |
| | `ctl_caso_bitacora` | solo inserción | |
| | `ctl_causa` | estado | sembrada por organización (7 causas); trigger en `organizaciones` |
| Custodia/contingencia | `ctl_producto_custodia` | estado | **trigger: tope 30 activos por sucursal** |
| | `ctl_sello`, `ctl_talonario`, `ctl_ticket_manual`, `ctl_caida_sistema` | estado | |
| Servicios | `ctl_atencion`, `ctl_consumo_esperado`, `ctl_ocupacion` | estado | `paciente_ref` opaco, sin datos clínicos |
| Atributos | `ctl_producto_atributo` | estado | `requiere_serie`, `requiere_sello`, `alto_valor`, `peso_caja_llena` (el origen aún no los tiene) |
| Configuración | `ctl_config_def` (catálogo del sistema: omisión, mínimo, **tope**), `ctl_config` (valor vigente, global o por sucursal), `ctl_config_bitacora` (**solo inserción**: quién, cuándo, anterior, nuevo, `seq`) | | topes validados por trigger |
| Trazabilidad | `ctl_bitacora_consulta` (quién consultó qué), `ctl_discrepancia_hora`, `ctl_intento` (PIN/contraseña) | solo inserción | |
| Integración | `ctl_eventos_entrada` (cola con idempotencia `origen`+`id_externo`), `ctl_llamada_origen`, `ctl_alerta` | estado | |
| Sesión | `ctl_sesion_pin` | estado | ligada a `turnos_caja`; caduca al cerrarse el turno |
| Soporte | `ctl_folio_seq`, `ctl_transicion` | | contadores de folio; matriz de transiciones |

**Clases.** *Solo inserción:* RLS sin escritura + `REVOKE` + triggers `t_10_inmutable` (UPDATE/DELETE) y `t_11_vaciar` (TRUNCATE). *Estado:* `t_10_estado` solo permite UPDATE dentro de una RPC (`app.ctl_rpc`), impide cambiar `id`, `organizacion_id`, `sucursal_id`, `folio*`, `creado_*` y exige una transición válida de `ctl_transicion`.

**Folios sin huecos.** `ctl_siguiente_folio` incrementa `ctl_folio_seq` en la misma transacción del insert (si se deshace, el contador también). `piefirme.ctl_huecos_folios()` lista cualquier folio entre 1 y el último emitido que no exista.

**Hora.** Trigger de sellado fuerza `creado_en` y los `*_en` de captura. `hora_cliente` es solo referencia; si difiere >5 min del servidor, un trigger `AFTER INSERT` escribe `ctl_discrepancia_hora` (`piefirme_app.ctl_registrar_discrepancia_hora`).

## 3. Roles y capacidades

| Rol del módulo | Rol de Pie Firme | capturar | ver_diferencias | ver_directo | investigar | autorizar | configurar |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| dueño | `administrador` | Sí | Sí | Sí | Sí | **Sí** | Sí |
| supervisor | `supervisor` | Sí | Sí | Sí | Sí | No | No |
| sucursal (encargado, cajero, podólogo) | `recepcion`, `podologo` | Sí | **No** | No | No | No | No |
| soporte RANNIX | fila en `rannix_staff` (`soy_rannix()`; p. ej. `a@g.com`) | No | Sí | No (lee por `ctl_soporte_leer`, con bitácora) | No | No | Sí |

Fuente única en el servidor: `piefirme_app.ctl_rol()` / `ctl_puede(cap)` (migración 200). Espejo en el cliente: `src/lib/auditoria/roles.js`; capacidades `auditoria.*` en `src/lib/permisos.js`. Ambos tienen pruebas; si se cambia uno, cambiar el otro.

Reglas duras (en base de datos):
1. Quien capturó la partida/cierre de origen no autoriza el ajuste de su caso (`ctl_autorizar_ajuste`, comparando contra `ctl_caso.usuario_captura` y contra `creado_por` de la partida/cierre).
2. Quien investigó (asignado o con bitácora de comentario/evidencia/asignación) no autoriza, salvo el dueño.
3. Autorizar exige **contraseña completa** (se verifica contra `auth.users`; 3 fallos bloquean 15 min); el PIN no sirve.
4. Nadie escribe en el saldo: el ajuste solo lo aplica `ctl_solicitar_ajuste_origen` con un caso autorizado.
5. El soporte no captura ni autoriza y sus lecturas quedan en `ctl_bitacora_consulta`.

## 4. Vistas

**Hacia el origen (solo lectura, `security_invoker`, filtradas por `ver_directo`):** `v_ctl_productos` (precio vigente, fecha del último cambio, costo, `requiere_serie/sello`), `v_ctl_saldos`, `v_ctl_movimientos`, `v_ctl_ventas` (una fila por línea, con descuento, motivo, autorizador y precio de catálogo al momento), `v_ctl_cancelaciones` (cancelaciones y devoluciones), `v_ctl_sucursales`, `v_ctl_usuarios`, `v_ctl_turnos`. Un rol de sucursal las consulta y recibe **cero filas**.

**Por audiencia:** sucursal → `ctl_partida_captura`, `ctl_cierre_puntos`, `ctl_producto_captura` (descripción y banderas, **sin precio, costo ni existencia**); revisión → `ctl_partida_revision`, `ctl_sesion_revision`, `ctl_cierre_revision` (con saldo y diferencia).

## 5. Contratos

**Ajuste al origen** (`piefirme.ctl_solicitar_ajuste_origen`, no ejecutable por la app):
`(p_folio_caso, p_sucursal, p_producto, p_cantidad_delta, p_tipo='ajuste_por_auditoria', p_causa, p_autorizado_por, p_autorizado_en, p_org)` → `{ok, idempotente, movimiento_id}` o `{ok:false, mensaje}`. Registra la petición, inserta un movimiento `tipo='ajuste'` en `movimientos_inventario` y guarda la respuesta; un reintento con el mismo `folio_caso` devuelve el mismo movimiento, y el mismo folio con otros datos se rechaza. Si el origen rechaza, `ctl_llamada_origen` queda `rechazada` (reintentable) y el caso pasa a `ajuste_fallido`.
**Autorizar** (`ctl_autorizar_ajuste(p_caso, p_password)`): valida las reglas duras, llama al ajuste y deja el caso `cerrada_con_ajuste` (guardando `movimiento_origen_id`) o `ajuste_fallido`, con bitácora. La Etapa 3 añade pantalla, investigación y el cierre sin ajuste.

**RPC del módulo** (todas validan sesión, clínica activa y capacidad): `ctl_mi_rol`, `ctl_config_efectiva`, `ctl_config_guardar`, `ctl_config_restablecer`, `ctl_config_valor_en` (consulta histórica), `ctl_causa_guardar`, `ctl_punto_control_guardar`, `ctl_custodia_activar/desactivar`, `ctl_pin_abrir_sesion/validar_sesion/cerrar_sesion`, `ctl_evidencia_registrar`, `ctl_registrar_consulta`, `ctl_soporte_leer`, `ctl_huecos_folios`, `ctl_autorizar_ajuste`.

**Configuración.** Valor por sucursal con respaldo global y luego omisión (`ctl_config_en`). Topes (trigger `ctl_trg_config_valida`): muestra ≤ 100, descuento sin clave ≤ 15 %, gracia ≤ 90 días, retención ≤ 365 días, lado de foto ≤ 2,400 px, tolerancia de kits > 0 solo con confirmación del **dueño** (el soporte no puede confirmar). Custodia: trigger de 30 con mensaje que explica el porqué.

**Fotos.** `ctl_evidencia_registrar` exige: ruta dentro de `<org>/ctl/<sucursal>/`, objeto subido hace ≤ 15 min, hash sha256 válido; el servidor pone la hora. **No hay ruta de subida desde galería**; lo que el servidor *no puede probar* es que la foto sea «en vivo» (eso lo garantiza la PWA con `capture="environment"`, Etapa 5). A quien captura no se le dice si el hash está repetido; la alerta (`foto_repetida`) va al dueño. URLs firmadas ≤ 5 min (`urlFirmadaAuditoria.js`); ven fotos dueño y supervisor (no el soporte).

**Purga.** `app.ctl_purga='on'` (GUC local de transacción) es la única forma de borrar filas de `ctl_*`; solo la usan scripts de mantenimiento con rol de base de datos, nunca la app.

## 6. Lo que cada etapa siguiente debe respetar

1. **Ninguna** tabla, vista ni RPC accesible a `recepcion`/`podologo` puede incluir saldo, diferencia, valor esperado ni precio de catálogo. Nuevo objeto = nueva fila en la prueba «ningún rol de sucursal recibe saldo/diferencia» (`scripts/test-auditoria-qa.mjs`) y revisión contra D5. Los campos prohibidos están en `CAMPOS_CIEGOS`.
2. Escribir **solo por RPC** `SECURITY DEFINER` que llame `ctl_exigir(capacidad)`; nunca otorgar INSERT/UPDATE/DELETE a `authenticated`. Tabla nueva de captura = trigger de inmutabilidad + sellado + `REVOKE`; con estado = `ctl_trg_estado` y filas en `ctl_transicion`.
3. Toda marca temporal con `now()`; recibir `hora_cliente` como referencia (la registra el trigger si la tabla lo declara).
4. Folios de casos, cierres y sesiones solo por el trigger de folio; no insertar con folio propio.
5. **Etapa 2:** la RPC de captura de partida recibe `id` del cliente (idempotente), congela el saldo desde `v_ctl_saldos`, escribe `ctl_partida_conteo` + `ctl_partida_calculo` y responde solo `ok` y el siguiente producto; la excepción es `auditoria_puntual` ejecutada por supervisor/dueño. La lista aleatoria se guarda en `ctl_lista_solicitada` antes de mostrarse.
6. **Etapa 3:** casos solo nacen de capturas (`ctl_caso.origen_*` + `usuario_captura`); completar detalle con `v_ctl_movimientos`; el campo `responsable_costo = empleado` es registro de control interno, **sin** integración ni botón hacia nómina.
7. **Etapa 4:** al abrir un cierre, resolver los puntos vigentes y guardar la instantánea en `version_checklist`; calcular esperados en el servidor al cerrar (`ctl_cierre_calculo`).
8. **Etapa 5 (PWA):** sesión con `ctl_pin_abrir_sesion`; cámara en vivo sin galería; cola idempotente por `id` de cliente; subir a `pf-auditoria` y luego `ctl_evidencia_registrar`.
9. **Etapa 6:** cada consulta del reporte de diferencias llama `ctl_registrar_consulta`; el soporte lee solo por `ctl_soporte_leer`. Alertas con techo (`alertas_techo_diario`).
10. **Etapa 1 (cambios en el punto de venta)** es del origen, no de este módulo: precio no editable, cancelación con espera y registro de apertura de cajón; la cola es `ctl_eventos_entrada`.
11. Nada de integración con nómina ni con DVR en esta versión.

## 7. Hallazgos sobre el origen que requieren decisión del dueño

- **El inventario del origen no es ciego hoy:** las pantallas existentes de Pie Firme (Inventario, conteo inicial) muestran existencias a `recepcion`, y la política de INSERT de `movimientos_inventario` permite a recepción, podólogo y administrador escribir movimientos directos. El módulo no lo toca (es el núcleo existente); para cumplir al pie de la letra «ningún rol escribe directo en el saldo» y «el encargado nunca ve el saldo» habrá que restringir esas pantallas/políticas del origen. Queda fuera de la Etapa 0.
- Longitud del PIN (4–8 vs. 4–6 de la especificación).
- Podólogo con capacidad de captura (la especificación no lo lista; se asumió que sí por el control de servicios y kits).
- La cuenta de soporte (`a@g.com`) pierde en este módulo sus facultades de dueño.

## 8. Etapa 4 (checklist y cierres) — anexo

Detalle completo en [`AUDITORIA_ETAPA4.md`](AUDITORIA_ETAPA4.md) (migraciones 230–235). Lo que las etapas siguientes deben respetar:
- Las tablas nuevas siguen el patrón de la Etapa 0: `ctl_entrega_firma` y `ctl_cierre_corte` son solo inserción, `ctl_entrega` tiene estado (`ctl_transicion`), todas con RLS `ver_directo`; **quien captura un cierre solo recibe `{ok, folio, estado}`**; el esperado vive en `ctl_cierre_calculo`/`ctl_cierre_corte`.
- Regla «el entrante no puede vender hasta aceptar»: `piefirme.ctl_puede_vender(sucursal)` y trigger `t_ctl_bloqueo_entrega` sobre `ventas`; el fondo inicial del turno siguiente lo fija `t_ctl_fondo_entrega` sobre `turnos_caja`. Ambos son inertes mientras no exista una entrega del módulo.
- Un caso nacido de un cierre usa `origen_tipo = 'cierre_captura'` (o `'entrega_firma'` para `diferencia_relevo`), sin `producto_id` (no es un ajuste de inventario).
- Los contadores de folio (`ctl_folio_seq`) bloquean la fila hasta el fin de la transacción: dos corridas de pruebas del módulo con transacción abierta se esperan entre sí.

## 9. Etapa 2 (motor de conteo) — qué cambia para las etapas siguientes
Detalle en [`AUDITORIA_ETAPA2.md`](AUDITORIA_ETAPA2.md). Migraciones 210–213. Las RPC de captura leen el origen con funciones internas `piefirme_app.ctl_o_*` (no con las `v_ctl_*`, que devuelven cero filas a sucursal); el caso nace de la sesión con `usuario_captura`, `contexto` (cancelación ligada, sustitución de código, firmas del relevo) y `cantidad` = física − sistema. Caja debe consultar `piefirme.ctl_entrega_pendiente(turno)` antes de vender. La única respuesta de sucursal con diferencias es el relevo que no cuadra (llave `diferencia_relevo`, decisión revisable).

## 10. Etapa 3 (casos) — qué cambia para las etapas siguientes
Detalle en [`AUDITORIA_ETAPA3.md`](AUDITORIA_ETAPA3.md). Migraciones 220–222. El ciclo de vida, el cierre (causa, responsable del costo, monto) y la autorización viven en RPC `ctl_caso_*`, `ctl_autorizar_ajuste` (reemplazada, misma firma) y `ctl_reintentar_ajuste`; `ctl_caso_bitacora` gana `datos` y `evidencia_id` (sigue siendo solo inserción). Un caso nunca se crea a mano: las etapas nuevas que generen casos deben hacerlo solo desde el cierre de su captura (`ctl_abrir_caso` o, para cierres, sus RPC de cierre). Un caso sin `producto_id` o sin `cantidad` (efectivo, precio, no reportado) solo se cierra sin ajuste o se rechaza. La sustitución de código se autoriza por el caso principal y aplica los dos ajustes en una subtransacción. La Etapa 6 puede leer `ctl_casos_listar`/`ctl_casos_reportes` para el tablero (ya registran la consulta y admiten al soporte en solo lectura) y debe seguir presentando la recurrencia como indicador para investigar, nunca como conclusión.

## 11. Etapa 7 (cadena de custodia) — qué cambia para las etapas siguientes
Detalle en [`AUDITORIA_ETAPA7.md`](AUDITORIA_ETAPA7.md). Migraciones 250–255. Recepción con responsiva (`ctl_recepcion*`, evento `recepcion_registrada`), sellos VOID con reapertura y peso, piezas con serie (`ctl_pieza`), venta de alto valor por poleo (`piefirme_app.ctl_alto_valor_evaluar`, sin evento del origen todavía), talonarios, tickets manuales, auditoría de continuidad y caídas. Reglas para lo que viene: (1) las alertas nuevas (`sello_roto_sin_registro`, `peso_fuera_de_rango`, `venta_alto_valor`, `folio_faltante`, `folio_faltante_diario`, `sucursal_se_cae`) solo se registran en `ctl_alerta`: los adaptadores simulados de la Etapa 6 deben leerlas por `tipo`; (2) `ctl_sello` ya no es legible por toda la sede: quien captura ve solo los sellos que colocó; (3) la comparación de caídas, las piezas en existencia y el peso esperado viven en tablas «solo ver diferencias»; (4) las funciones internas de `piefirme_app` de esta etapa se revocaron también a `authenticated` (la Etapa 0 solo las revocó a `anon`); (5) la PWA monta `Recepcion` de `src/pages/auditoria/custodia/Recepcion.jsx` con las props `sucursalId` y `onTerminar`.

## 12. Etapa 6 (reportes, tablero y alertas) — qué cambia para las etapas siguientes
Detalle en [`AUDITORIA_ETAPA6.md`](AUDITORIA_ETAPA6.md). Migraciones 240–249. Reglas para lo que viene: (1) todo evento nuevo se registra en `ctl_alerta` (de preferencia con `piefirme_app.ctl_alerta_nueva(org, sucursal, tipo, mensaje, ref_tipo, ref_id)`) y **debe tener una fila en `ctl_alerta_catalogo`** (se agrega con una migración): un trigger (`t_30_despachar`) aplica regla, destinatarios, techo diario y resumen; los envíos Push/WhatsApp/correo son SIMULADOS (`ctl_alerta_envio`, `simulado = true`) hasta que haya proveedor; (2) las consultas de reportes del dueño viven en RPC `ctl_dif_consultar`, `ctl_tablero`, `ctl_rep_*`, `ctl_reporte_mensual`, agregan en la base, paginan y **cada una registra la consulta** (`piefirme_app.ctl_log_consulta`); una pantalla nueva de diferencias para el dueño debe hacer lo mismo; (3) la novena vista del contrato de lectura del origen es `v_ctl_pagos` (montos por método): cualquier origen nuevo debe implementarla junto con las ocho de la Etapa 0; (4) los reportes de caja leen solo por vistas `v_ctl_*` y declaran en pantalla lo que el origen aún no da (servicios sin precio de catálogo, motivo de descuento libre, evento de cajón sin emitir); (5) el reporte mensual es PDF de dos páginas armado en el cliente con un generador propio sin dependencias (`lib/auditoria/pdf.js`); (6) la retención de fotos (`retencion_fotos_dias`, tope 365) se aplica con `scripts/auditoria-purgar-fotos.mjs` (simulacro por omisión): la fila de `ctl_evidencia` se conserva y la purga se anota en `ctl_evidencia_purga`; (7) **hoy no hay planificador**: las evaluaciones por hora, el resumen diario y la purga se invocan a mano (scripts o botones del dueño) o con la función de Netlify `auditoria-alertas-programadas` (programación comentada).

## 13. Etapa 1 (cambios en el origen: la Caja) — qué cambia para las etapas siguientes
Detalle en [`AUDITORIA_ETAPA1.md`](AUDITORIA_ETAPA1.md). Migraciones 290–294. Reglas para lo que viene: (1) **lo que cambia lo que hace el cajero va detrás de un parámetro por sucursal apagado por omisión** (`precio_abierto_con_clave`, `descuento_motivo_cerrado`, `cancelacion_con_bloqueo`; el tope sin clave y la espera de 60 s ya tienen valor); lo que no lo cambia (precio de catálogo congelado en `venta_lineas.precio_catalogo`, quién aplicó y quién autorizó cada descuento, eventos) está siempre activo; (2) el origen **emite eventos solo por `piefirme_app.ctl_emitir_evento`**, que no puede romper la venta, y el módulo los drena por poleo (`ctl_eventos_drenar_org`, `scripts/auditoria-eventos-poleo.mjs`; **no hay planificador**); un evento nuevo = fila en el `check` de `ctl_eventos_entrada` y un trigger con bloque de excepción; (3) una cancelación con piezas es una solicitud `ctl_cancelacion` (`pendiente → autorizada | rechazada | pendiente_de_validacion`): la pieza vuelve al inventario **solo** cuando `ctl_cancelacion_resolver` llama a `cancelar_venta` con pieza escaneada, foto en vivo, clave y motivo; nunca se resuelve sola; el candado de servidor es el trigger `t_ctl_bloqueo_cancelacion`; (4) `v_ctl_cancelaciones.autorizador` y `ctl_o_cancelaciones` ya devuelven la persona que autorizó (antes `null`); `v_ctl_ventas.precio_catalogo_al_momento` ya se llena también para servicios y paquetes y es `null` cuando no hay referencia honesta (precio cotizado, saldo de plan, cortesía): el reporte «ventas por debajo de catálogo» debe tratarlas así; (5) la clave de supervisor es `ctl_verificar_clave` (PIN personal de otra persona, 3 fallos bloquean 15 min, nunca el soporte); cualquier otra autorización nueva en Caja debe usarla; (6) las vistas `prp_*` del origen **no** traen las columnas nuevas de `venta_lineas` (se creó antes de la migración): leerlas de la tabla o por `v_ctl_*`; (7) el pulso real del cajón llamará a `ctl_cajon_abrir` con `p_origen = 'hardware'`.

## 14. Etapa 8 (servicios) — qué cambia para las etapas siguientes
Detalle en [`AUDITORIA_ETAPA8.md`](AUDITORIA_ETAPA8.md). Migraciones 280–282. Reglas: (1) `ctl_atencion` y `ctl_ocupacion` se escriben solo por RPC (`ctl_atencion_*`, `ctl_ocupacion_registrar`); la atención no cierra sin un ticket que exista, sea de la sucursal, esté cobrado y tenga servicio compatible, y cancelarla exige motivo y PIN de otro supervisor; el expediente **no tiene nota clínica** (referencia opaca) y esa columna no debe añadirse sin decidir el régimen de datos sensibles (LFPDPPP); (2) la lectura del origen para servicios vive en `piefirme_app.ctl_o_servicios_cobrados`, `ctl_o_salidas_insumo` y `ctl_o_costo_producto` (un origen nuevo reimplementa solo esas tres); (3) los reportes `ctl_rep_atenciones_sin_cobro`, `ctl_rep_cuadre_insumos` y `ctl_ocupacion_cruce` son solo `ver_directo` y registran su consulta; (4) tres eventos nuevos en `ctl_alerta_catalogo` (`atencion_sin_ticket`, `atencion_cancelada`, `ocupacion_sin_cobro`) se evalúan con `ctl_servicios_evaluar_ahora` —manual hasta que exista planificador—; (5) hay un trigger sobre `consultas` (`t_ctl_atencion`) **apagado por omisión** (`atencion_auto_desde_consulta`), que nunca frena la consulta; (6) la ocupación es fase posterior al piloto: sin hardware, sensor recomendado celdas de carga con ESP32, cámara descartada.
