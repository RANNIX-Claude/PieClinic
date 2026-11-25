# Hallazgos — Lote A de videos de QA (2026-11-25)

Videos: `cita-cobrar`, `consulta-clinica`, `vid-paciente-expediente` (MP4 en `demo/video/`). Sede de trabajo: **Chalco** (sin prefijo): es la única sede del podólogo `p@g.com`, tiene Caja 1, Cabinas 1–2 y se agenda ahí con «Podólogo Prueba».

## Hallazgos de código (todos CORREGIDOS y videos grabados ya con la corrección)

| # | Dónde | Qué pasaba | Estado |
|---|---|---|---|
| A-1 | `src/pages/clinico/Consulta.jsx` (Nueva consulta) | El selector «Cita vinculada» nunca cargaba: la ventana de tiempo (`Date.now()`) se calculaba en cada render y entraba en la clave de la consulta, así que React Query repetía la petición sin fin (decenas de GET a `prp_agenda` por segundo) y la lista quedaba siempre vacía («Sin cita»). El podólogo no podía iniciar una consulta desde la cita. | **CORREGIDO**: la ventana se fija al abrir la pantalla (`useState`). |
| A-2 | `src/pages/clinico/Expediente.jsx` (Resumen › Próxima cita) | Mismo patrón (`new Date().toISOString()` en el filtro): bucle de peticiones y «Próxima cita» sin terminar de cargar. | **CORREGIDO** (valor fijo al abrir). |
| A-3 | `src/pages/comercial/Horarios.jsx` (bloqueos) | Mismo patrón con `Date.now() - 30 días`. | **CORREGIDO**. |
| A-4 | `src/pages/clinico/componentes/ConsultaExploracion.jsx` | La pestaña **Ungueal** (la que abre por defecto) nunca se podía guardar: la tabla `exploraciones` exige `pie` y `dedo` cuando `tipo='ungueal'` (`exploraciones_check`) y la pantalla no tenía esos campos → «violates check constraint». | **CORREGIDO**: campos «Pie» y «Dedo» (obligatorios) en la exploración ungueal; se guardan en las columnas `pie`/`dedo`. |

Validación: `node --test src/lib` → 153 pruebas, 0 fallas; los tres flujos corrieron completos en pantalla contra QA (Chalco). No se cambió el esquema (no se usó ninguna migración 083–089).

> Nota para otros lotes: el patrón de A-1 (valores con hora en `useVista/useLeer(..., { filtros })`) puede repetirse en otras pantallas; en `ExpedienteEmpleado.jsx` el valor es solo fecha (`slice(0,10)`) y es estable, por eso no se tocó.

## Observaciones de reglas/datos (no son errores; quedan documentadas en los videos)

- **Fotos clínicas** exigen autorización vigente de fotografías (regla CD-19, trigger en `fotos_clinicas`). Una paciente sin ese consentimiento recibe «El paciente no tiene autorización vigente de fotografías clínicas» al subir. Por eso la paciente del video es la que se registró en `vid-paciente-expediente` marcando esa autorización. Comportamiento correcto.
- **Consentimiento de procedimiento**: si la paciente ya tiene uno firmado (de visitas anteriores) el sistema no lo vuelve a pedir; en el video se muestra el caso de la paciente nueva, que sí lo firma en pantalla.
- **Recepción no ve historia clínica ni notas** (ficha «vista de recepción, solo datos de contacto»): diseño del rol. El video muestra esa restricción y abre la historia clínica con la cuenta del podólogo.
- **Turno de caja en Chalco**: la Caja 1 de Chalco tiene un turno abierto desde el 22-nov de otra persona (`cajero 78670831…`); el sistema permite un solo turno por caja y por cajero, así que `r@g.com` abrió la **Caja 2** (fondo $1,000). No hubo que migrar nada. Esa Caja 2 de `r@g.com` en Chalco queda abierta (hay que cortarla desde «Corte de turno» si se quiere limpiar).
- **Podólogo vs. caja**: `p@g.com` no tiene permiso de caja (P-078, cobra siempre Caja); el video lo dice y el cobro se muestra con recepción.
- `atendida` solo la pone la firma de la nota (P-045): por eso el video de cobro usa la cita que cierra el video de consulta (misma paciente y cita).

## Datos de QA creados (no se pueden borrar: triggers de inmutabilidad)

- Pacientes reales de los videos: **Valeria Montes Villalobos, CHA-EXP-000305** (alta en `vid-paciente-expediente`).
- Pacientes de ensayo (corridas previas sin narración): Ensayo/Ensayob/Ensayoc/Ensayod Montes Villalobos (CEN-EXP-000301, CHA-EXP-000301…000303).
- Citas de hoy en Chalco para «Podólogo Prueba»: la del video de consulta (`CHA-CIT-002554`, Valeria, 12:30; atendida y cobrada en una grabación de cobro que se descartó: ticket `CHA-TKT-002008`), la del video de cobro (`CHA-CIT-002551`, Verónica Vargas Cruz, 08:30; consulta cerrada con la misma spec en modo rápido y cobrada en el video: ticket `CHA-TKT-002009`) y varias de ensayo (Margarita Castillo Jiménez 07:30 «por confirmar»; Ensayoc 10:30 «por confirmar» con borrador; Ensayod 11:30 atendida y cobrada en ensayo).
- Consultas borrador sin firmar (de ensayos fallidos) y fotos/hallazgos/exploraciones de prueba asociadas; una foto de prueba (`demo/video/foto-prueba.jpg`, patrón de color) subida al bucket privado.
- Turno de caja de `r@g.com` en Chalco (Caja 2) y los tickets de cobro de ensayo y del video.
- Auxiliares de grabación en `demo/`: `consulta-clinica.spec.ts`, `cita-cobrar.spec.ts`, `vid-paciente-expediente.spec.ts`, `lib/lote-a.ts`, `lib/mezclar-a.mjs`, `preparar-lotea.mjs` (agenda la cita de partida sin grabar) y `explorar-lotea*.mjs` (exploración).

## Nota de grabación (no es hallazgo de la app)

- La vista previa del ticket en `cita-cobrar` salió en blanco en la primera grabación (el equipo iba lento y se copió el HTML de la ventana de impresión antes de que se escribiera). Se corrigió en `demo/lib/lote-a.ts` (`verTicket` espera a que el ticket tenga texto) y el video se regrabó.
- La vista `prp_agenda` solo expone el nombre de pila del podólogo (`podologo_nombre`), por eso el detalle de cita dice «Podólogo» y no «Podólogo Prueba»; con nombres reales no estorba, pero dos podólogos con el mismo nombre de pila se verían igual. Se anota como mejora menor (requeriría agregar `apellidos` a la vista en una migración de la 083–089); no se hizo.
- La duración de los videos es larga (6–10 min) porque QA respondió lento durante la grabación; la narración va sincronizada con la pantalla.

## Estado por video

Ver el resumen de entrega (rutas, pasos, folios). Sin hallazgos pendientes: **ningún «NO CORREGIDO»** en este lote.
