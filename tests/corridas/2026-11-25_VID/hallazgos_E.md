# Hallazgos del lote E de videos de QA (2026-11-25)

Seis videos narrados en `demo/video/` (MP4, voz Microsoft Sabina es-MX). Cuentas: `m@g.com` (administrador) y, donde se indica, `p@g.com` (podólogo). Migraciones: no se usó el rango 120–129 (ningún hallazgo requirió cambio de esquema).

## Resumen por video

| # | Video | Estado de hallazgos |
|---|---|---|
| 1 | `demo/video/vid-rh-asistencia-narrado.mp4` | H-E1 CORREGIDO y regrabado |
| 2 | `demo/video/vid-nomina-recibos-narrado.mp4` | H-E6 NO CORREGIDO — requiere decisión (cuentas de prueba sin empleado ligado) |
| 3 | `demo/video/vid-mantenimiento-narrado.mp4` | sin hallazgos |
| 4 | `demo/video/vid-importar-ia-narrado.mp4` | H-E2 y H-E3 CORREGIDOS y regrabado · H-E4 NO CORREGIDO — requiere liberación (función servidor / llave de IA) |
| 5 | `demo/video/vid-asistente-dictado-narrado.mp4` | H-E5 NO CORREGIDO — requiere llave (IA simulada) · observación O-E2 |
| 6 | `demo/video/vid-tableros-narrado.mp4` | sin hallazgos de código |

## Hallazgos

### H-E1 · RH › Incidencias: el listado no cargaba en meses de 30 días — CORREGIDO y regrabado
- Síntoma (visto al grabar el video 1): en noviembre la pestaña Incidencias mostraba «No se pudo cargar — date/time field value out of range: "2026-11-31"» y los tres indicadores en cero. Pasaría en abril, junio, septiembre, noviembre y febrero.
- Causa: `TabIncidencias.jsx` armaba el filtro con `${mes}-31`.
- Corrección: el último día se calcula del mes real (`src/pages/plataforma/equipo/rh/TabIncidencias.jsx`). En el video regrabado la lista de noviembre carga y la incidencia nueva aparece.

### H-E2 · Importar datos: el CSV se leía con la codificación equivocada — CORREGIDO y regrabado
- Síntoma (video 4, primera toma): en la vista previa «María Jiménez Hernández» salía como «Marã­a Hernã¡ndez Jimã©nez» y la fecha «1969-05-20» como «Fecha no reconocida: 5/19/69» (un día menos). Además, por el nombre corrupto, la paciente ya existente no se detectaba como duplicado.
- Causa: `leerTabla` leía los CSV con `type: 'array'` (SheetJS los toma como Latin-1) y convertía las fechas ISO en fechas de Excel.
- Corrección: en `src/lib/plataforma/archivos.js` los .csv/.tsv/.txt se decodifican como UTF-8 (con respaldo Windows-1252, quitando el BOM) y se leen sin inferir tipos. Prueba nueva: `src/lib/plataforma/archivos.test.mjs` (2 casos). `node --test src/lib`: 153 pruebas pasan, más las 2 nuevas.

### H-E3 · Importar datos: el detector de duplicados solo veía los primeros 1,000 pacientes — CORREGIDO y regrabado
- Causa: `existentesDe` pedía `limite: 20000`, pero PostgREST devuelve como máximo 1,000 filas; la base de QA tiene 1,497 pacientes, así que un duplicado entre los pacientes 1,001 en adelante pasaba como «válido» y se creaba repetido.
- Corrección: se pagina de 1,000 en 1,000 en `src/pages/plataforma/admin/Importar.jsx`. En la toma final del video: 3 válidos, 0 advertencias, 1 error (fila sin nombre) y 1 posible duplicado (María Jiménez Hernández, 12/08/1965).

### H-E4 · Importar datos con IA: la carga final no termina en el ambiente de desarrollo — NO CORREGIDO — requiere liberación
- «Confirmar y cargar» marca el lote «confirmado» y llama a la función de servidor `importacion-cargar`, que solo existe desplegada en Netlify (el servidor de desarrollo en el puerto 5174 no la sirve). Resultado en pantalla: «La carga no terminó: La función servidor «importacion-cargar» no está disponible en este entorno». El lote queda «confirmado» con el botón «Reintentar carga». No se creó ningún paciente.
- La IA es SIMULADA (mapeo por reglas locales, aviso visible «Modo simulado: sin llave»). PDF e imagen no se pueden leer sin llave.
- El video lo dice con claridad en la narración final. Para cerrar: probar la carga con `netlify dev` o en QA desplegado, y la llave de IA.
- Observación para revisar cuando se pruebe en servidor: `importacion-cargar.js` pide las filas con `limit=100000`, pero PostgREST corta en 1,000; en un archivo de más de 1,000 filas la primera carga procesaría solo 1,000 (la función es idempotente: reintentar completa el resto).

### H-E5 · Asistente de IA y dictado clínico: ambos SIMULADOS — NO CORREGIDO — requiere llave
- Asistente: contesta «[Respuesta simulada] No hay llave de IA configurada…» y solo resume qué vistas devolvieron datos (muestra la tabla real de la vista). Queda registrada la conversación.
- Dictado: el micrófono del navegador de prueba es un dispositivo falso (tono), la transcripción trae la marca «[TRANSCRIPCIÓN SIMULADA · sin llave de IA]» y el sistema NO deja pasar esa marca a la nota (se comprobó: al aceptar con la marca, rechaza). El podólogo escribe el texto y decide campo por campo; el diagnóstico nunca se propone. El video lo dice en la narración final.

### H-E6 · Mis recibos: no se pudo demostrar la firma del empleado — NO CORREGIDO — requiere decisión
- Las cuentas de prueba `p@g.com` y `r@g.com` no están ligadas a un expediente de empleado, así que «Mis recibos» muestra «Aún no tienes recibos» (correcto por RLS, pero sin poder probar «Ver» y «Firmar de conformidad»). El video muestra esa pantalla y lo dice. Decisión pendiente: ligar usuarios de prueba a empleados con recibos autorizados (hay 45 recibos autorizados o pagados sin firmar) o agregar cuentas de empleado a `scripts/qa-usuarios-prueba.mjs`.

## Observaciones (no son errores del sistema)
- O-E1 · RH › Asistencia: no hay checadas en la semana en curso (la semilla llega a octubre), por eso «Hoy hay 0 presentes». La narración lo aclara.
- O-E2 · Asistente: `TablaResultado` oculta las columnas `*_id`; en la vista de mantenimiento por mes quedan renglones repetidos del mismo mes sin saber de qué sede son. Conviene que las vistas del asistente traigan el nombre de la sede.
- O-E3 · Las sedes «Pie Clinic …» no tienen historial (cobros, citas): los tableros se grabaron con «Centenario» y «Chalco», que sí lo tienen (guía de grabación).
- O-E4 · Nómina: no se autorizó el periodo grabado (autorizar congela los montos); queda «calculada».

## Datos usados (basura de QA que no se puede borrar)
- RH: incidencia «Permiso sin goce» de Daniel Gómez Morales (25/11/2026) y vacaciones de Rosa Castillo Rodríguez 07–11/12/2026 (5 días, saldo 12), autorizada. Tomas previas dejaron otras incidencias (E006, E007, E009) y solicitudes de vacaciones similares.
- Nómina: periodo quincenal 16–30/11/2026 creado y calculado (66 empleados, percepciones $534,100.00, deducciones $1,540.00, neto $532,560.00). Recibo mostrado: Karen Montes Lira, periodo 01–15/10/2026, neto $11,284.00, pendiente de firma.
- Mantenimiento (sede Pie Clinic Centenario): equipo «Autoclave a presión E2» (serie QA-E-0002); OT-0010 (autorizada, en proceso y cerrada con costo real $2,850.00); presupuesto de noviembre $5,000.00 contra costo real $5,700.00 (incluye la OT de una toma previa: equipo «Autoclave de vapor QA-E», OT-0009) → diferencia -$700.00.
- Importar: archivo `demo/datos/importar-pacientes-E.csv` (5 filas); varios lotes «importar-pacientes-E.csv» quedaron en «confirmado» sin cargar (se pueden descartar o reintentar).
- Asistente y dictado: consulta CHA-CON-001705 (borrador) de Raúl Aguilar Flores (CEN-EXP-000056) con consentimiento de dictado firmado y nota dictada; varias conversaciones del asistente («¿Cuánto se ha gastado en mantenimiento por mes?»). Tomas previas dejaron consultas/consentimientos de otros pacientes.
- Tableros: solo lectura (Centenario, octubre de 2026: ingreso real $48,065.00, 69 citas atendidas, ocupación 27.2 %; Chalco $73,900.00; semana en curso $2,740.00 y semana anterior $11,050.00; ingresos de octubre: servicios $32,783.00, productos $6,120.00, 147 registros).

## Nota de infraestructura de la grabación
- El codificador de video de Playwright dejó los .webm truncados con la máquina cargada (varios lotes grabando). Los videos 1, 2, 4, 5 y 6 usan la grabación por pantallazos de `demo/lib/video-c.ts` (`iniciarGrabacion`) y se mezclan con `demo/lib/mezclar-a.mjs --off=0`; el video 3 se grabó con el webm de Playwright, que salió completo.
- Las pruebas pasaron de 10 minutos con la carga: los specs fijan `test.setTimeout(1_500_000)`.

## Archivos
- Specs: `demo/vid-rh-asistencia.spec.ts`, `vid-nomina-recibos`, `vid-mantenimiento`, `vid-importar-ia`, `vid-asistente-dictado`, `vid-tableros` (`.spec.ts`); dato de apoyo `demo/datos/importar-pacientes-E.csv`; explorador `demo/explorar-E.mjs`.
- Código corregido: `src/pages/plataforma/equipo/rh/TabIncidencias.jsx`, `src/pages/plataforma/admin/Importar.jsx`, `src/lib/plataforma/archivos.js` (+ `archivos.test.mjs`).
