# Folio de ticket parametrizable

Decidido 2026-11-26 (dueño): los tickets de una sucursal llevan un **consecutivo por sucursal, sin importar quién emita el ticket**; cortos (~10 por día). El formato es **parametrizable** y vive en `/parametros-duenos` (solo administrador), sección «Folio de tickets». Migraciones **300, 301, 302**.

## Parámetros (en `organizaciones.parametros`, con valor por omisión global)
| Clave | Valores | Omisión |
|---|---|---|
| `folio_ticket_formato` | texto con campos `{SUC}`, `{AAAA}`/`{AA}`, `{MM}`, `{DD}`, `{AAMMDD}`, `{NNN…}` (cada N = un dígito) | `{SUC}-{AAMMDD}-{NNN}` → `01-261126-003` |
| `folio_ticket_reinicio` | `diario` · `mensual` · `anual` · `nunca` | `diario` |
| `sedes.codigo_corto` | 2 dígitos, único por organización | 01, 02… por orden de creación (id como desempate), sin tocar los existentes |

Reglas de validación (SQL `piefirme_app.folio_ticket_validar`, espejo JS `src/lib/comercial/folioTicket.js`, mismos mensajes): exactamente un `{SUC}` y un `{N+}` (2 a 9 dígitos); solo letras, dígitos, `- . / _`; folio de máximo **24** caracteres; el formato debe llevar los campos del período que reinicia (diario ⇒ año+mes+día; mensual ⇒ año+mes; anual ⇒ año; nunca ⇒ nada), porque si no dos períodos repetirían el folio. Si el consecutivo rebasa sus dígitos crece (no se trunca; 302).

## Dónde se hace cumplir
* Trigger `t_folio_ticket` en `organizaciones`: rechaza (PF400) un formato inválido venga de la RPC, de la API o de SQL directo, y escribe en `piefirme.bitacora` `{cambio:'folio_ticket', antes, despues, nota}` con `usuario_id` y fecha. Los códigos cortos se bitacorizan igual (`t_codigo_corto` en `sedes`). No se guardan secretos.
* RPC (admin): `folio_ticket_parametros()`, `guardar_folio_ticket(formato, reinicio)`, `guardar_codigos_sedes(jsonb)` (unicidad del estado final; permite intercambiar 01↔02; constraint `sedes_codigo_corto_uq` diferible), `folio_ticket_proximos(sede, n, formato?, reinicio?)` (vista previa en vivo, **sin consumir números**), `folio_ticket_vista_previa(formato, reinicio, codigo, fecha, n)` (pura, sin efectos).

## Generador
`piefirme_app.siguiente_folio_ticket(sede)` → contador `piefirme.folio_ticket_contador (organizacion_id, sede_id, periodo)` con `INSERT … ON CONFLICT DO UPDATE` (bloqueo de fila hasta el fin de la transacción: dos cajas simultáneas se serializan y nunca reciben el mismo número; si la transacción se deshace, el contador también, **sin huecos**). Llave de período: `D2026-11-26`, `M2026-11`, `A2026`, `N`. **Día del folio**: `now()` del servidor (UTC) convertido a la zona de la organización (`organizaciones.zona_horaria`, `America/Mexico_City`) con `piefirme_app.hoy_org`. Si un formato nuevo coincidiera con un folio ya existente en `ventas`, el bucle salta ese número (nunca repite; único hueco posible, y solo en ese caso patológico). Respaldo: `unique (organizacion_id, folio)` en `ventas`.

El trigger de ventas (`venta_bi`) no se reescribió: sigue llamando `siguiente_folio_comercial(sede,'TKT')`, que para `'TKT'` delega al generador (301). LP/CIT/ANT/NC conservan `{SEDE}-{TIPO}-{NNNNNN}`. El trigger `t_folio_inmutable` impide reescribir el folio de un ticket emitido: **un cambio de formato solo aplica a tickets nuevos**.

## Quién cobra no importa
El folio depende solo de la sucursal del ticket. Recepción, podólogo (envía a caja) y encargado comparten el consecutivo (probado). El folio se asigna **al crear** el ticket (por cobrar), no al cobrarlo.

## «Encargado de sucursal»
No es un rol. Es una **función** (`perfiles.funciones = 'encargado'`, migración 301 amplía el check de 073; `FUNCIONES` en `src/lib/permisos.js` y `netlify/functions/usuarios-admin.js`) que se marca en Usuarios y roles sobre un usuario de rol **Recepción**. Por ahora **no otorga permisos nuevos**; solo etiqueta.

## Offline
Sin cambios en `sincronizar_ticket_offline`: el cliente imprime un folio **provisional** `OFF-{SEDE}-{NNNN}`; al sincronizar, el trigger asigna el folio **definitivo** y el provisional queda en `ventas.folio_offline`. Idempotente por `cliente_uuid` (el reintento devuelve el mismo folio; si la inserción falla por duplicado, el subtransacción deshace el número consumido). `docs/CAJA_OFFLINE.md` ya dice `{SEDE}-TKT-{NNNNNN}` para el definitivo: ahora es el formato parametrizado.

## Impacto en otros lugares (revisado con grep)
Nada en `src/`, `netlify/`, vistas `ctl_*`, DW ni migraciones parsea `-TKT-`; el ticket impreso (`comercial/componentes/ticket.js`) imprime `venta.folio` tal cual; el buscador usa `ilike`. Los folios históricos (`CENTENARIO-TKT-000036`) siguen siendo texto válido y únicos. Solo quedan menciones de formato viejo en: escenarios `tests/escenarios/ESC-CAJA-02, 11, 40, 44, 62` (ESC-CAJA-62 describe «folios formato consecutivo y serie por sede»), `tests/corridas/*` (reportes y videos con folios `…-TKT-…`) y `docs/AUDITORIA_ETAPA1.md` (evidencia histórica); semillas/pruebas de auditoría que inventan folios `QCS-TKT-…`/`DEMO-TKT-…` (no pasan por el generador). **Por regrabar** (no regrabado): escenarios y videos de caja que muestren el folio.

## Pruebas
`node --test src/lib/comercial/folioTicket.test.mjs` (formato, reinicios, validaciones, vista previa, simultaneidad modelada, solo-hacia-adelante, roles, offline) y `node --test scripts/test-folio-ticket-qa.mjs` (BD real en transacción que se deshace; la prueba de 10 conexiones simultáneas confirma y borra una sede temporal `QFT…`). Los casos de paridad SQL = JS viven en `src/lib/comercial/folioTicketCasos.js`. Verificación de pantalla: `scripts/verificar-folio-ticket-ui.mjs` (capturas en `tests/corridas/folio-ticket/`).

## Pendiente / decisiones
* Revisar en producción los códigos cortos por omisión (en QA las sedes reales de Pie Clinic quedaron 06–10 por haber otras antes en el orden de creación): conviene fijarlos en pantalla antes del primer ticket real.
* ¿El folio debe asignarse al cobrar en vez de al crear? Hoy un ticket «por cobrar» ya consume número.
* Aplicar 300–302 a producción (`pieclinic`) cuando el dueño lo confirme.
