# Conexión a la base QA (Fase 1 · «modo conectado»)

Estado al **2026-11-21**. La app puede correr en dos modos, elegidos al **construir** con `VITE_MODO`:

| Modo | Qué hace | Cuándo |
|---|---|---|
| `demo` (por defecto) | Todo vive en este navegador (`localStorage`, clave `podologia.demo.v3`) con la semilla ficticia. Idéntico a como era antes. | Demostraciones, pruebas de pantalla, Netlify actual |
| `qa` | Login real (correo y contraseña) contra **Supabase Auth de la base QA compartida con Pie Firme**, esquema `piefirme`. Las colecciones conectadas se leen de la base con la sesión de la persona (RLS decide qué llega); 4 acciones se escriben en la base. Lo demás sigue en demostración, en memoria. | Pruebas con datos reales de QA |

El login muestra siempre el modo (píldora bajo el título) y, al tocarla, la hoja **«Origen de los datos»** con cada colección: *Base QA · n filas*, *Vacío en QA* o *Demostración* (con el motivo).

## 1. Diseño

```
Login.jsx ── import() ──► datos/sesion.js ──► datos/cliente.js ── import() ──► @supabase/supabase-js
                               │                    (db.schema = VITE_DB_SCHEMA, storageKey propio)
                               ▼
                      datos/hidratar.js  leerBase() → construirParche() (PURO) → aplicarParche() (PURO)
                               │                                     usa datos/mapas.js (PURO)
                               ▼
                    store/core.js  mutar()  ──► observarMutaciones(antes, después)
                                                        │
                                                        ▼
                                             datos/escribir.js  detectarEscrituras() (PURO) → cola en serie → base
                                                                 éxito: reconciliar (uuid, hora y sede del servidor)
                                                                 rechazo: revertir() (PURO) + aviso «bad»
```

- **Las pantallas y las acciones no cambian.** Las colecciones conectadas se hidratan *con la misma forma* de `d` (formas leídas de `src/store/dominios/*.js`); los ids hidratados son los uuid de la base, salvo las sucursales, que conservan `S1..S7` (V2_ESQUEMA §1).
- **core.js** (cambios aditivos): `MODO_DATOS`; en modo `qa` no se persiste el estado en `localStorage` (la base es la fuente y la sesión la guarda Supabase en `podologia.qa.sesion`); `observarMutaciones(fn)` recibe `(antes, después)` tras cada `mutar()`. En demo no hay observadores: `mutar`, `useStore`, `entrar`, `salir`, `cambiarSucursal`, `auditar`, `folio`, `uid` siguen igual.
- **Rol**: sale de `perfiles.cargo` (064); si es nulo, del rol de seguridad (`administrador→admin`, `podologo`, `recepcion`) — igual que `piefirme_app.cargo()`. El ícono o puerta de entrada no otorga permisos.
- **Sede al entrar**: la de hoy en la base (`equipo_directorio().sede_hoy_id` = asignación del día o sede de contrato); si no está entre las sedes del perfil se agrega, porque el checador de la base registra ahí.
- **Regla de dominio**: un dominio se aplica solo si todas sus consultas salieron bien; si una falla, el dominio entero se queda en demostración y la hoja muestra el error.
- **Nunca se mezclan ids**: lo que referencia empleados que RLS no dejó ver se descarta; colecciones cuya forma no se puede llenar con fidelidad y cuyos padres ya vienen de la base quedan *vacías* (no con ficticios).
- `origenDe(coleccion)` (`src/datos/index.js`) → `"qa" | "demo"`; `useDatos()` en `src/shell/sesion.js` lo expone a las pantallas.
- Cerrar sesión (`salir()` de core, o `cerrarSesion()`): escribir.js detecta la salida, cierra Supabase Auth y **reinicia el estado en memoria** (no quedan datos reales en el navegador).

## 2. Mapa colección ↔ tabla / vista

| Colección de `d` | Origen en qa | Fuente en la base | Escritura |
|---|---|---|---|
| `sucursales` | QA (7) | `sedes` (las 5 duplicadas en minúscula se ignoran) | — |
| `usuarios` | QA | `perfiles` + `equipo_directorio()` | — |
| `rh.empleados` | QA | `prp_empleados` + `prp_horarios_laborales` | — |
| `rh.asistencia` | QA (45 días) | `prp_asistencia` (consolidada por trigger desde `checadas`) | **entrada/salida → RPC `checar()`** |
| `rh.asignaciones` | QA (14 días) | `prp_empleado_asignaciones` | cambio de sucursal → RPC `elegir_sede_hoy()` |
| `rh.movimientos` / `rh.incidencias` / `rh.vacaciones` | QA | `prp_empleado_movimientos` / `prp_incidencias_rh` / `prp_vacaciones_detalle` | — |
| `rh.recibos` | **vacío** | (prenómina de la base con otra forma) | — |
| `cap.cursos` / `cap.avance` / `cap.acervo` | QA | `prp_cursos`+`prp_lecciones`+`curso_evaluaciones` / `curso_avance`+`curso_resultados` / `prp_acervo` | **lección completada → `curso_avance`** |
| `com.hilos` | QA | `prp_com_hilos`+`com_hilo_miembros`+`prp_com_mensajes`+`com_mensaje_lecturas` | **enviar mensaje → `com_mensajes`** |
| `com.correos` | QA | `prp_correos_bandeja`+`prp_correos_enviados`+`correo_destinatarios` | — |
| `com.feed` | QA | `prp_feed`+`feed_reacciones`+`prp_feed_comentarios` | **publicar → `feed_publicaciones`; reaccionar → `feed_reacciones` (insert/delete); comentar → `feed_comentarios`** |
| `eval` | QA | `prp_evaluaciones` | — |
| `fin.categorias` / `fin.gastos` / `fin.recurrentes` | QA | `prp_grupos_gasto` / `prp_gastos` (sin anulados) / `prp_gastos_recurrentes` | — |
| `bonos` | demo | motor calcula contra `d.ventas` (demo); esquemas de la base con otras bases y escalones | — |
| `fin.notasCompra` | demo | partidas apuntan a productos/OC/CxP en demo | — |
| `pedidosWeb` | demo | partidas reservan existencias del inventario en demo | — |
| `auditorias` | demo | comparan contra existencias en demo; fotos en Storage | — |
| `pacientes`, `citas`, `ventas`, `productos`, `bitacora`, resto | demo | Fase 2 (clínico con RLS por sede; venta = RPC atómica caja+PEPS+cartera) | — |

La fuente de verdad del catálogo es `src/datos/catalogo.js` (lo usan la hoja, `origenDe` y las pruebas).

## 3. Escritura write-through

`escribir.js` compara `antes` y `después` **solo en colecciones conectadas** y **solo lo de la persona de la sesión**: registro de hoy de su empleado (entrada/salida), publicaciones nuevas sin uuid, sus reacciones (alta/baja), comentarios y mensajes nuevos sin uuid, vistas nuevas de su avance, cambio de `sesion.sucursalId` y salida. Las operaciones van en una cola en serie. Éxito → se reconcilia (uuid real, hora del servidor, sede real del checador). Rechazo → se revierte en pantalla y aparece el aviso *«La base QA no guardó …: motivo. Se deshizo en pantalla.»*. Hidratación, reconciliación y reversión corren con `enSilencio()` para no volver a detectarse.

Límites conocidos: imágenes del feed y de mensajes no se suben (la publicación se guarda sin imagen y se avisa; un mensaje solo con imagen se rechaza); conversaciones creadas en la app no existen en la base (sus mensajes se rechazan con aviso); editar/eliminar/fijar publicaciones, marcar leído, correo interno y evaluaciones de cursos aún no se escriben (siguen solo en pantalla hasta recargar).

## 4. Verificación realizada (2026-11-21, base QA)

Script Node con `@supabase/supabase-js` y llave anon, mismo código de `src/datos/` y de las acciones de las pantallas.

**Lectura** (filas que llegaron con RLS de cada cuenta vs. conteo total con `consulta-ro`):

| Consulta | total base | m@ admin | a@ dirección | r@ recepción | p@ podólogo |
|---|---|---|---|---|---|
| empleados | 68 | 68 | 68 | 1 | 1 |
| asistencia (45 d) | 236 | 236 | — | 0 | 0 |
| asignaciones (14 d) | 858 | 858 | — | 13 | 13 |
| cursos / lecciones | 8 / 28 | 8 / 28 | — | 4 / 15 | 4 / 14 |
| curso_avance | 231 | 231 | — | 7 | 11 |
| hilos / mensajes | 17 / 163 | 13 / 131 | 12 / — | 4 / 29 | 5 / 46 |
| feed / reacciones / comentarios | 24 / 131 / 50 | 24 / 131 / 50 | — | igual | igual |
| evaluaciones | 1,699 | 1,699 | — | 1,699 | 217 |
| gastos (sin anulados) | 1,178 | 1,178 | 1,178 | 526 | 0 |
| gastos recurrentes | 45 | 45 | — | 0 | 0 |

Ninguna consulta falló. Los hilos se limitan por membresía aun para administración (regla de la base).

**Escritura** (p@g.com, podólogo, sede de hoy CEN = S2), confirmada con `consulta-ro`: checada entrada y salida en CEN (`checadas` 87ab3e33…, 2a003d7f…; `prp_asistencia` «presente»), publicación `logro` 38fc88d1…, reacción 👏, comentario 453d002c…, mensaje 606b71cc…, `curso_avance` 66d7a4cf…. **Rechazo**: una publicación tipo «evento» de un podólogo (la app la permite, RLS solo deja foto/logro a no administradores) fue rechazada por la base, revertida en pantalla y avisada. Todo texto de prueba lleva **«[prueba conexión podix]»**. Tras cerrar sesión el estado vuelve a demostración en memoria.

No verificado en vivo: el cambio de sucursal (`elegir_sede_hoy`) — implementado y probado solo en `tests/datos.test.js`; no se quiso mover la asignación real de una cuenta compartida.

## 5. Construir y desplegar

```bash
# demo (igual que siempre)
npm run build
# qa (lee .env.local en local; en Netlify, las variables del sitio)
VITE_MODO=qa npm run build
```

Variables para un sitio Netlify de QA: `VITE_MODO=qa`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DB_SCHEMA=piefirme` (las tres últimas = las del sitio QA de Pie Firme). Son públicas por diseño. **Nunca** `service_role`, tokens de cuenta ni contraseña de la base. Recomendado: un sitio aparte (o contexto `deploy-preview`) para qa y dejar el sitio actual en demo. CSP: si el sitio define `connect-src`, agregar el dominio de Supabase.

Cuentas de prueba (solo QA, docs/ACCESOS.md de Pie Firme): `a@g.com`, `m@g.com`, `p@g.com`, `r@g.com`, clave compartida de prueba. `r1@`, `r2@`, `adm@` no usan esa clave (no se pudo entrar con ellas; no se modificaron).

## 6. Qué falta en esquema / RLS (para el coordinador y Pie Firme)

- No hay cuenta de prueba con la clave compartida para **gerente, cajero, almacén ni asistente** → no se pudo verificar en vivo el menú de esos roles. Sugerido: `scripts/qa-usuarios-prueba.mjs` en Pie Firme (decisión del dueño).
- `curso_evaluaciones` no guarda mínimo aprobatorio (la app supone 80, rotulado `minimoSupuesto`).
- La base no tiene programación semanal de turnos (solo asignación por día) ni horario de todos los empleados visible para no administradores (RLS) → `horarioSupuesto` 09:00–18:00 para el control de retardos local; la base calcula el estado real.
- Recibos de nómina: la prenómina de la base no tiene la forma del recibo de la app.
- Feed y mensajes: falta subir imágenes al bucket `pf-equipo` (072) desde la app.
- 5 sedes duplicadas (V2_ESQUEMA §1) se ignoran; decisión pendiente de consolidarlas.

## 7. Riesgos

- **Mezcla de datos**: en qa conviven colecciones reales con colecciones de demostración (p. ej. el estado de resultados combina gastos reales con ingresos ficticios). La hoja «Origen de los datos» lo hace visible; las pantallas no lo rotulan todavía.
- **Base compartida**: las escrituras de prueba de esta app aparecen en Pie Firme (mismo esquema). Marcar siempre con «[prueba conexión podix]».
- **Cambios locales no conectados se pierden al recargar** en modo qa (no se persiste en el navegador a propósito).
- Las acciones de las pantallas validan con sus reglas locales antes de llegar a la base; si difieren de RLS, la base rechaza y se revierte (ya probado con «evento»).
- Las cuentas de prueba y su clave están a la vista en el login de qa: nunca construir `VITE_MODO=qa` contra producción.

## 8. Fase 2

Pacientes/expediente y agenda (RLS por sede + bitácora de acceso), ventas/caja como RPC atómica (caja + PEPS + cartera), inventario y compras, bonos contra ventas reales, subida de imágenes a Storage, escritura del resto de acciones (correo, editar/eliminar en feed, lecturas de mensajes, evaluaciones de cursos, RH de gestión), Realtime para feed y mensajes, y rótulo «demo» por pantalla con `useDatos()`.
