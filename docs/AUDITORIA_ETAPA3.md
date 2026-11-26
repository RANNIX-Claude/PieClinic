# Control y Auditoría — Etapa 3: casos de diferencia

Migraciones **220–222** · pruebas `scripts/test-auditoria-casos-qa.mjs` (contra QA, transacción que se deshace) y `src/lib/auditoria/casos.test.mjs` · pantallas `src/pages/auditoria/Casos.jsx` y `src/pages/auditoria/casos/` · lib `src/lib/auditoria/casoApi.js` y `casoReglas.js`. Requisitos: [`AUDITORIA_ESPECIFICACION.md`](AUDITORIA_ESPECIFICACION.md) §F4 y «Roles y separación de funciones»; arquitectura y reglas heredadas: [`AUDITORIA_ARQUITECTURA.md`](AUDITORIA_ARQUITECTURA.md); cómo nacen los casos: [`AUDITORIA_ETAPA2.md`](AUDITORIA_ETAPA2.md).

## 1. Ciclo de vida

```
abierta ──(tomar / asignar)──▶ en_investigacion ──▶ cerrada_con_ajuste   (autoriza el dueño; el origen aplica el ajuste)
                                    │             ├─▶ cerrada_sin_ajuste  (resolución registrada; el saldo no se toca)
                                    │             ├─▶ rechazada           (el caso no procede)
                                    │             └─▶ ajuste_fallido ◀──┐ el origen rechazó el ajuste
                                    ▲                       │           │ reintentar (contraseña) → cerrada_con_ajuste
                                    └──(volver a investigar)┘───────────┘
```
Las transiciones válidas viven en `ctl_transicion` (Etapa 0) y las exige el trigger `ctl_trg_estado`; una transición fuera de la tabla falla aunque se intente por la puerta de atrás. **Mientras el caso está abierto el inventario no se mueve**: la única función que escribe en el kardex es `ctl_solicitar_ajuste_origen`, que la app no puede ejecutar y solo invoca la autorización.

**Un caso nunca se captura a mano.** No existe RPC de alta: los casos nacen en `piefirme_app.ctl_abrir_caso` (al cerrar un conteo, interna) y en el cierre de los cierres (Etapa 4). `authenticated` no tiene INSERT sobre `ctl_caso`; la prueba lo verifica y revisa que ninguna RPC de la familia de casos inserte en `ctl_caso`.

## 2. RPC (todas `SECURITY DEFINER`, validan sesión, clínica activa y capacidad en el servidor)

| RPC | Quién | Qué hace |
|---|---|---|
| `ctl_casos_listar(p_filtros)` | dueño, supervisor, soporte | Filtros: `estados[]`/`estado`, `sucursal`, `tipo`, `antiguedad_min/max` (días), `asignado` (`mio` · `sin_asignar` · uuid), `solo_abiertos`, `vencidos`, `buscar`, `limite`, `offset`. Devuelve `casos`, `total` y `resumen` por estado. «Mis casos» = `asignado: 'mio'`. La lectura del soporte queda en `ctl_bitacora_consulta`. |
| `ctl_caso_detalle(p_caso)` | dueño, supervisor, soporte | Caso, par de sustitución, bitácora con usuarios, evidencias (solo dueño/supervisor), llamadas al origen, historial del producto y **contexto de movimientos** (ver §4). Cada consulta deja renglón en la bitácora de consultas. |
| `ctl_casos_reportes(p_desde, p_hasta, p_sucursal)` | dueño, supervisor, soporte | Reportes F4.5 (§6). Registra la consulta. |
| `ctl_caso_tomar(p_caso, p_fecha_compromiso, p_nota)` / `ctl_caso_asignar(p_caso, p_usuario, p_fecha_compromiso, p_nota)` | investigar | Asigna con fecha compromiso (hoy…+180 días; por omisión +7) y pasa `abierta → en_investigacion`. Solo se asigna a dueño o supervisor activo con acceso a la sucursal (no al soporte). |
| `ctl_caso_comentar(p_caso, p_texto)` | investigar | Comentario (3–2,000 caracteres) en la bitácora. |
| `ctl_caso_adjuntar_evidencia(p_caso, p_id, p_ruta, p_hash, …)` | investigar | Registra la foto (remisión, nota de compra) en `ctl_evidencia` con hash sha256 reutilizando `ctl_evidencia_registrar` (objeto reciente en `pf-auditoria`, hora del servidor, sin galería) y la anota en la bitácora. Reenviar el mismo `p_id` no duplica. |
| `ctl_caso_guardar_cierre(p_caso, p_causa, p_responsable, p_monto, p_nota)` | investigar | Propuesta de cierre: causa del catálogo cerrado (la que «requiere nota» exige nota de 10+ caracteres), quién absorbe el costo (`empresa · proveedor · empleado · seguro`) y monto al costo (≥ 0 y ≤ valor al costo del caso o del par). Se puede corregir mientras el caso siga abierto; cada guardado queda en la bitácora. |
| `ctl_caso_cerrar_sin_ajuste(p_caso, p_causa, p_resolucion, p_responsable, p_monto)` | investigar | Cierra sin tocar el saldo. Exige causa y resolución (10+ caracteres). |
| `ctl_caso_rechazar(p_caso, p_motivo)` | investigar | El caso no procede. Motivo de 10+ caracteres. |
| `ctl_caso_volver_a_investigar(p_caso, p_motivo)` | investigar | `ajuste_fallido → en_investigacion`. |
| `ctl_autorizar_ajuste(p_caso, p_password)` | **solo dueño** | Autoriza y aplica el ajuste (§3). Reemplaza la versión de la Etapa 0 con la misma firma. |
| `ctl_reintentar_ajuste(p_caso, p_password)` | **solo dueño** | Reintenta un `ajuste_fallido`; vuelve a exigir la contraseña (es de nuevo una autorización). |

Todo cambio escribe en `ctl_caso_bitacora` (solo inserción: la tabla y los triggers de la Etapa 0 no admiten UPDATE, DELETE ni TRUNCATE ni siquiera con la bandera de RPC). La migración 220 le añade `datos jsonb` (lo estructurado de cada entrada: a quién se asignó, causa propuesta, movimiento resultante) y `evidencia_id`.

## 3. Autorización del ajuste (F4.4)

`ctl_autorizar_ajuste` valida, en este orden y en el servidor:
1. el caso existe en la clínica y sucursal permitidas (404 si no: no se revela que existe);
2. el estado admite autorización (`en_investigacion` o `ajuste_fallido`);
3. hay causa, responsable del costo y ajuste de inventario (producto y cantidad ≠ 0);
4. **separación de funciones**: quien capturó (`usuario_captura`, o `creado_por` de la partida/cierre de origen, también el de la contraparte de un par) no autoriza su propio caso, con el mensaje «Quien capturó la partida no puede autorizar el ajuste de su propio caso. Pida a otra persona autorizada que lo apruebe.» (criterio 2); quien investigó (asignado o con bitácora de comentario, evidencia o asignación) no autoriza salvo el dueño;
5. monto al costo presente y causa vigente (con nota si la exige);
6. **contraseña completa** contra `auth.users` (el PIN de «Mi PIN» no sirve); 3 fallos bloquean 15 minutos; el fallo se devuelve como `{ok:false, error:'contrasena_incorrecta'}` para conservar el intento;
7. llama a `ctl_solicitar_ajuste_origen` (idempotente por `folio_caso`, registra petición y respuesta en `ctl_llamada_origen`) con `cantidad_delta = ctl_caso.cantidad` (**faltante = negativo, sobrante = positivo**, física − sistema), y guarda `movimiento_origen_id` (el «movimiento_podix_id» de la especificación) y `autorizado_por/en`.

Si el origen rechaza, el caso queda en **`ajuste_fallido`** con el mensaje en la bitácora y en `ctl_llamada_origen`, y se crea una alerta `ajuste_fallido` (alta, dueño y supervisor) que se marca atendida cuando el reintento aplica. Reintentar con el mismo `folio_caso`: si el origen ya había aplicado el movimiento (se perdió la respuesta), devuelve **el mismo movimiento** (`idempotente: true`) y no crea otro (criterio 13); reautorizar un caso ya cerrado es `PF409`.

**Quien captura no cierra ni rechaza el suyo** (decisión de diseño, revisable): `ctl_caso_cerrar_sin_ajuste` y `ctl_caso_rechazar` aplican la misma regla de captura; si no, bastaría con descartar la propia diferencia.

### Sustitución de código (F2.5)
El caso del faltante caro es el **principal** y lleva al del sobrante barato (`contexto.sustitucion`). Tomar, asignar, proponer cierre, cerrar, rechazar, autorizar y reintentar se hacen **sobre el principal** y se reflejan en la contraparte (que solo admite comentarios; sobre ella el servidor responde `PF422` indicando el folio del principal). Autorizar aplica **los dos** ajustes (`faltante` negativo en el producto caro, `sobrante` positivo en el barato) dentro de una subtransacción: si el origen rechaza cualquiera de los dos, **no se aplica ninguno**, ambos casos pasan a `ajuste_fallido`, se dejan las dos peticiones como rechazadas en `ctl_llamada_origen` y el reintento aplica el par completo. Cada caso guarda su propio movimiento y la bitácora de ambos documenta el par. El tope del monto absorbido es la suma de los valores al costo de los dos.

### «Empleado» como responsable del costo
Es un **registro de control interno**, no una instrucción de descuento a nómina (la Ley Federal del Trabajo restringe los descuentos al salario y un faltante de inventario no basta para justificar uno). Así lo dicen el comentario del servidor, el texto que queda en la bitácora, el rótulo de la lista desplegable, el aviso en el formulario y el diálogo de autorización. No existe ni existirá aquí integración con nómina ni un botón que la sugiera (la prueba revisa que ninguna función del módulo toque «nómina», «payroll» o «descuento»).

## 4. Detalle del caso: contexto de movimientos (F4.3, criterios 15 y 24)

`ctl_caso_detalle` calcula **la ventana** así: desde el **conteo anterior** del producto en esa sucursal (la última partida de otra sesión previa al conteo que originó el caso, o el último movimiento `conteo` del kardex, lo que sea más reciente) hasta hoy; si no hay conteo anterior, 30 días antes del conteo del caso (`ventana_por_omision: true` y la pantalla lo dice). Lee **del origen por las vistas** `v_ctl_movimientos` (entradas de mercancía, traspasos, mermas, ajustes, devoluciones), `v_ctl_ventas`, `v_ctl_cancelaciones` (cancelaciones y devoluciones de tickets que incluyen el producto) y `v_ctl_turnos`; esas vistas filtran por el rol de quien consulta, así que el soporte (que no tiene `ver_directo`) recibe esas secciones vacías y tampoco ve fotos.

- La cancelación ligada del cruce F1.4 va marcada (`ligada_al_caso`) y el caso conserva `contexto.cancelacion`.
- Lo registrado **después** del conteo va marcado `posterior_al_conteo` y la pantalla advierte que debe confirmarse que la diferencia sigue vigente antes de ajustar (una entrada registrada tarde reaparecería como sobrante al ajustar).
- Muestra el saldo actual, el historial de casos del mismo producto, la evidencia adjunta (miniaturas por URL firmada ≤ 5 min), la bitácora como línea de tiempo con el usuario de cada paso, la asignación y las llamadas al origen.
- **Informa, no acusa:** acota ventana de tiempo y personas con acceso (turnos y movimientos de la ventana, en orden alfabético, no por «sospecha»); sin etiquetas de culpa. La prueba revisa que la respuesta no contenga términos de culpa.

## 5. Pantalla (`/auditoria/casos`)

- **Todos los casos / Mis casos**: lista con tarjetas por estado (clic para filtrar), filtros de sucursal, estado, tipo, antigüedad (3, 8, 15, 30+ días), asignado y fecha compromiso vencida, búsqueda por folio o producto. Marcas de «Cancelación» ligada y «Par» de sustitución. Los más antiguos de lo abierto van primero; `ajuste_fallido` arriba de todo.
- **Detalle** (`?caso=<id>`): tarjetas de producto, diferencia, valor, saldo actual y asignación; contexto en pestañas; investigación (tomar, asignar, comentar, **cámara en vivo** para evidencia); cierre (causa, responsable, monto, nota; guardar propuesta, cerrar sin ajuste, rechazar, **autorizar** con diálogo de contraseña, reintentar, volver a investigar); evidencia; línea de tiempo; llamadas al origen.
- **Seguimiento** (F4.5): abiertos por sucursal y antigüedad (cubetas 0–2, 3–7, 8–14, 15–30, 30+, el más antiguo, sin asignar, vencidos, ajuste fallido, valor abierto), gráfica de **causas por sucursal y periodo** (barras apiladas) con el total por causa, monto absorbido (empresa, y por responsable) y valor ajustado, y **recurrencia en relevos** como *indicador para investigar*: solo aparece quien repite del lado saliente en 2 o más relevos con diferencia, con el denominador (relevos entregados en el periodo) y los casos a un clic para ver su contexto; nunca como conclusión ni como ranking. Los reportes de diferencias del dueño y el tablero son de la Etapa 6.
- La evidencia se toma con `casos/CamaraEvidencia.jsx` (getUserMedia; **no hay camino de galería**): comprime a 1,600 px (tope 2,400), calcula sha256, sube a `pf-auditoria/<org>/ctl/<sucursal>/…` y registra con la RPC.
- Roles en pantalla (`casoReglas.accionesCaso`, espejo de lo que valida el servidor): sucursal no entra (la base le responde `PF403` y las tablas le devuelven cero filas); soporte solo lee; supervisor investiga; solo el dueño ve el botón de autorizar, y deshabilitado con el porqué si capturó él o falta la propuesta.

## 6. Decisiones tomadas (revisables) y lo que requiere al dueño

1. **Quien capturó no cierra ni rechaza su propio caso** (además de no autorizar). Con un solo dueño que además haga auditorías puntuales, sus casos los tiene que resolver el supervisor (para cerrarlos o rechazarlos) y otro dueño (para autorizar el ajuste). **Pregunta al dueño:** ¿se mantiene, o basta con la regla de autorizar?
2. **Reintentar vuelve a pedir la contraseña** (es autorizar de nuevo). Se puede relajar a un clic sin contraseña si el dueño lo prefiere, pero entonces el reintento no re-autentica a nadie.
3. **El caso ajustado puede estar desactualizado**: el delta es el de la diferencia al contar; si la pieza apareció o se registró una entrada después, ajustar la duplicaría. Por eso el detalle marca lo posterior al conteo; no se bloquea el ajuste (la decisión es de quien autoriza).
4. **Los casos «no reportado», de precio y los de efectivo no tienen ajuste de inventario**: solo se cierran sin ajuste o se rechazan (la RPC de autorización responde `PF422`). El «no reportado» se resuelve con un conteo nuevo.
5. **Rechazar** exige haber tomado el caso (`en_investigacion`); no hay `abierta → rechazada` directo porque la matriz de transiciones de la Etapa 0 no lo contempla y el ciclo de la especificación pasa por investigación.
6. **Un par de sustitución se cierra por el principal**, y el monto absorbido se registra una sola vez en él (la contraparte queda con monto 0).
7. **La regla «quien investigó no autoriza, salvo dueño»** solo es ejercitable si algún rol distinto del dueño tuviera la capacidad de autorizar (hoy ninguno): el código la aplica y se revisa por lectura, pero no hay prueba de base de datos que la dispare sin cambiar la matriz de roles.
8. **Casos ya existentes** de la Etapa 2 (y de la Etapa 4) siguen siendo válidos: las columnas nuevas de la bitácora tienen valor por omisión.
9. La ventana de 30 días sin conteo anterior y los 7 días de fecha compromiso por omisión son constantes del código (no parámetros de `ctl_config`).

## 7. Pruebas

- `node --test src/lib/auditoria` — reglas puras de la pantalla (roles, validaciones, par, reportes).
- `node --test scripts/test-auditoria-casos-qa.mjs` — contra QA, todo en una transacción que se deshace: alta manual inexistente; sin escritura directa en saldo; ciclo de vida y transiciones inválidas; evidencia con hash e idempotencia; causa/«Otra»/monto; cierre sin ajuste con saldo intacto; rechazo; bitácora solo-inserción (app y dueño de la base); separación de funciones (criterio 2), PIN que no sirve, supervisor/sucursal/soporte sin autorizar; ajuste aplicado con movimiento y signo (criterio 11); origen que rechaza → `ajuste_fallido`, alerta, reintento (12); idempotencia por folio (13); par de sustitución atómico (14); detalle con movimientos desde el conteo anterior y cancelación ligada (15 y 24); sucursal sin acceso (1); lista y filtros; reportes y recurrencia; HTTP real con el token de cada cuenta. No correr en paralelo con otras suites del módulo (candados compartidos en `pins_personales` y los contadores de folio).
