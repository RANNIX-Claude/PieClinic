# Hallazgos del lote C de videos de QA (2026-11-25)

Videos: plantilla ortopédica, pie diabético, quejas e incidencias y esterilización. Grabados con `PW_LOTE=C` contra el QA compartido (`http://localhost:5174`, Chrome headless 1366×768, voz «Microsoft Sabina»). Los MP4 están en `DEv/demo/video/`.
Migración usada: **100** (rango 100–109).

## Resumen de estado

| # | Hallazgo | Estado |
|---|---|---|
| H1 | Folio clínico duplicado entre sedes con la misma clave de 3 letras (órdenes de plantilla, quejas, lotes, consultas, planes, documentos) | CORREGIDO (mig. 100) y regrabado |
| H2 | Podólogo de una sola sede no podía guardar una valoración de pie diabético ni una orden de plantilla de un paciente registrado en otra sede (`No tienes permiso`) | CORREGIDO y regrabado |
| H3 | Quejas: Recepción veía los botones de seguimiento y «Queja actualizada», pero la BD no guardaba nada | CORREGIDO en la pantalla y regrabado; el origen común queda como decisión (H5) |
| H4 | Las 72 fotos clínicas sembradas no tenían archivo en Storage: el comparador salía con imágenes rotas | CORREGIDO (script de relleno sintético) y regrabado |
| H5 | `actualizar()` de `src/lib/api.js` devuelve éxito cuando la política RLS deja el UPDATE en 0 filas | NO CORREGIDO — requiere decisión |
| H6 | El webm de Playwright salía truncado a la mitad con la máquina saturada (varios lotes grabando) | CORREGIDO en el método de grabación del lote C (grabadora por pantallazos) |
| H7 | Pie diabético: la sugerencia de riesgo y frecuencia está apagada; el historial de valoraciones anteriores de un paciente no se puede consultar desde la lista | NO CORREGIDO — requiere decisión |
| H8 | `npm run migrate:qa` termina con «225 pruebas · 12 fallas» ajenas a este lote | Observación (no mía) |

## Detalle

### H1 · Folio duplicado entre sedes de la misma clínica — CORREGIDO
- **Cómo apareció**: primer intento del video de plantillas. «Guardar borrador» mostraba «Ya existe un registro con esos datos» (HTTP 409, `ordenes_plantilla_organizacion_id_folio_key`) y no se creaba la orden.
- **Causa**: `piefirme_app.siguiente_folio_clinico` arma el folio con `upper(left(clave, 3))` y un contador por sede. La organización «Pie Clinic (sintético)» tiene dos sedes con el mismo prefijo (`CHA` «Chalco» y `chalco` «Pie Clinic Chalco»; igual con Centenario, Galerías, Patio, Sendero), así que ambas emiten `CHA-ORT-000001`, y la restricción `unique (organizacion_id, folio)` rechaza el segundo. Solo expedientes tenían el «salto al siguiente libre» (N-08). Afectaba a ORT, QJ, EST, CON, PLA y DOC.
- **Corrección**: `migraciones/100_folio_clinico_sin_colision.sql` (aplicada a QA). La función ahora salta al siguiente número libre revisando la tabla que lleva ese folio. No cambia el formato ni los folios ya emitidos. Validado: `siguiente_folio_clinico(Chalco,'ORT')` → `CHA-ORT-000002`; se guardaron las órdenes `CHA-ORT-000003…000006` y las quejas `CEN-QJ-000002…`; `node --test src/lib` 153/153.

### H2 · Sede de registro fuera del alcance del usuario — CORREGIDO
- **Cómo apareció**: video de pie diabético. «Firmar y cerrar» una valoración de Juan Ortega (expediente PC-0412, registrado en Galerías) con la cuenta `p@g.com` (una sola sede, «Chalco»): HTTP 403 `new row violates row-level security policy for table "valoraciones_pie_diabetico"`, mensaje «No tienes permiso para esta acción».
- **Causa**: con una sola sede el usuario queda en «todas mis sedes» (`sedeActivaId = null`) y el formulario usaba `sede_id = paciente.sede_registro_id`, que no es una sede del usuario; la política exige `puede_sede(sede_id)`. Mismo patrón en la orden de plantilla y el estudio de pisada.
- **Corrección**: `sedeDeRegistro(sedeActivaId, paciente, sedes)` en `src/pages/clinico/componentes/comunes.jsx` (sede activa; si no, la del paciente solo si es del usuario; si no, la primera del usuario) y su uso en `PieDiabeticoForm.jsx` y `PlantillaOrtopedica.jsx` (2 sitios). Validado con la valoración real del video (firmada, categoría 3, aparece en la lista de la sede Chalco).
- **Pendiente de decisión del dueño (regla de negocio)**: el documento queda en la sede de trabajo del podólogo y no en la del paciente; es lo que exige la política de sede. Si se quiere que el podólogo vea valoraciones de otras sedes, hay que cambiar la política, no el formulario.

### H3 · Quejas: Recepción «guardaba» sin efecto — CORREGIDO en pantalla
- **Cómo apareció**: primera versión del video. Recepción cambió el estado a «en revisión» y pulsó Guardar: salió «Queja actualizada», pero en la BD la queja `CEN-QJ-000002` siguió en `nueva`.
- **Causa**: la política `quejas_upd` (mig. 039) solo permite modificar a Administración y al podólogo responsable; el UPDATE de Recepción afecta 0 filas y el cliente lo tomaba como éxito. La pantalla mostraba Guardar, «Registrar notificación» y «Crear encuesta» a Recepción.
- **Corrección**: `src/pages/clinico/Quejas.jsx` (`DetalleQueja`): `editable` = Administración o podólogo responsable; Recepción ve el detalle en solo lectura con el aviso «Recepción registra y consulta la queja; el seguimiento, la resolución y el cierre los hace Administración o el responsable asignado». El video se regrabó con ese flujo (registra Recepción; seguimiento, resolución y cierre los hace Administración).

### H4 · Fotos clínicas sembradas sin archivo — CORREGIDO
- Las 72 filas de `fotos_clinicas` apuntaban a rutas de `pf-fotos-clinicas` que no existían (`storage.objects` vacío), por lo que el comparador mostraba imágenes rotas.
- Se agregó `scripts/subir-fotos-semilla.mjs` (solo QA, idempotente) que sube imágenes SINTÉTICAS rotuladas «FOTO SINTETICA – ANTES/DESPUES» a esas rutas. Resultado: 72 subidas, 0 fallos.

### H5 · `actualizar()` trata «0 filas» como éxito — NO CORREGIDO — requiere decisión
- `src/lib/api.js` → `actualizar` usa `.update().eq('id').select().maybeSingle()` y devuelve `{ data: null, error: null }` cuando la RLS bloquea el UPDATE. Cualquier pantalla que muestre un botón sin que la política lo permita dirá «guardado» sin guardar (así ocurrió en H3).
- No se cambió porque afecta a todos los módulos (algunos UPDATE legítimos podrían devolver `null` si el rol no puede leer la fila resultante). Propuesta: que `actualizar` devuelva error `SIN_PERMISO_O_INEXISTENTE` cuando `data === null`, y revisar el resultado de la suite completa.

### H6 · Video truncado — CORREGIDO (método)
- Con varios lotes grabando a la vez la máquina quedó al 100 % de CPU y el webm de Playwright (que usa un `ffmpeg` vivo durante toda la prueba) salió cortado (178 s de 280 s, etc.; «File ended prematurely»). Se probó `saveAs` (ya aplicado en `demo/lib/video.ts`) y no bastó.
- Se agregó `iniciarGrabacion` en `demo/lib/video-c.ts`: guarda pantallazos JPEG (CDP screencast) fuera de OneDrive durante la prueba y arma el MP4 al final; `demo/mezclar-c.mjs` ajusta la duración del video a la que espera `demo/mezclar.mjs`. Los especs del lote C usan `video: 'off'`.

### H6b · Selector de sede tardío en la guía de grabación — CORREGIDO (método)
- En la primera versión del video de esterilización el encabezado decía «Todas las sedes» aunque la narración hablaba de la sucursal Patio: `firmar` elige la sede solo si el selector ya existe y con la máquina lenta aparecía después. `demo/lib/video-c.ts` (`firmarCon`) ahora espera el selector (hasta 90 s). El video se regrabó. El video de quejas ya mostraba la sede correcta.

### H7 · Observaciones de producto (no son errores) — requiere decisión
- La sugerencia automática de categoría y frecuencia de revisión del pie diabético está apagada por diseño (P-010, parámetro `pie_diabetico_criterios_activos`); en el video la categoría se confirma a mano y se dice en la narración.
- La lista «Pie diabético» muestra solo la última valoración firmada por paciente; no hay pantalla para comparar valoraciones sucesivas (p. ej. Juan Ortega tiene 3). «Evolución» se muestra con el comparador de fotos y la línea de tiempo.
- Las integraciones de mensajería siguen simuladas: la encuesta de satisfacción de una queja se crea pero no se envía (el sistema lo avisa); la narración de los videos lo dice.

### H8 · Observaciones del smoke de `migrate:qa` (no relacionadas)
`npm run migrate:qa` terminó con «225 pruebas · 12 fallas»: RLS desactivado en `_rannix_semillas`, `anon` con EXECUTE heredado en 10 funciones `portal_*` y bucket `comercio_img` público. Ninguna la introduce la migración 100; se dejan avisadas.

## Datos de QA creados (no se pueden borrar: triggers de inmutabilidad)
- Plantillas: órdenes `CHA-ORT-000003` a `000006` (paciente Adriana Martínez Ibarra, CHA-EXP-000045; la `000006` es la del video final; las otras tres son corridas previas de depuración). Todas entregadas.
- Quejas: `CEN-QJ-000002` (queda en «nueva», del primer intento), `CEN-QJ-000003` (cerrada, corrida previa) y `CEN-QJ-000004` (cerrada; la del video final).
- Esterilización: lotes `PAT-EST-000007` (registrado, intento fallido), `000008`, `000009` y `000010` (liberados, corridas previas) y `000011` (el del video final). Todos con el kit `K-PAT-2`.
- Pie diabético: una valoración firmada de Juan Ortega (PC-0412) fechada 25/11/2026, categoría 3.
- 72 imágenes sintéticas en `pf-fotos-clinicas`.

## Archivos tocados
- Migración: `migraciones/100_folio_clinico_sin_colision.sql`.
- Código: `src/pages/clinico/Quejas.jsx`, `src/pages/clinico/PieDiabeticoForm.jsx`, `src/pages/clinico/PlantillaOrtopedica.jsx`, `src/pages/clinico/componentes/comunes.jsx`.
- Utilerías de video: `demo/lib/video-c.ts`, `demo/mezclar-c.mjs`, `scripts/subir-fotos-semilla.mjs`, `demo/vid-plantilla-ortopedica.spec.ts`, `demo/vid-pie-diabetico.spec.ts`, `demo/vid-quejas.spec.ts`, `demo/vid-esterilizacion.spec.ts`.
