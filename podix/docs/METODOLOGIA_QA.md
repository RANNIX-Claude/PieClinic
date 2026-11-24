# METODOLOGÍA DE PRUEBAS — Clínicas de Podología (podix)

> Adaptación de `plantilla-proyecto/docs/METODOLOGIA_QA.md` de la fábrica RANNIX a **este** proyecto y a su estado actual. Para cualquier tarea de pruebas se sigue este documento. La plantilla de la fábrica sigue siendo la norma general; aquí se dice qué aplica hoy, qué no, y por qué.
> Estado al 21 de noviembre de 2026: modo demostración, datos en el navegador, sin base de datos conectada, compuerta E3 sin firmar.

## 0. Qué es distinto en este proyecto

| La plantilla supone | Aquí, hoy | Qué se hace |
|---|---|---|
| Base de datos QA; cada paso se verifica con una consulta | Los datos viven en `localStorage` (`podologia.demo.v3`) | La «verificación en base» es una **lectura del estado** en el navegador (ver §6) o una afirmación en una prueba automática |
| `semilla.sql` restaurable | Semilla en código, determinista (`src/store/seed.js` + `src/store/dominios/*.js`), con **fechas relativas a hoy** | Fase 0 = «Restablecer datos de demo». La semilla no es idéntica de un día a otro |
| Agentes `qa-*` y comandos `/qa-*` en `.claude/` | **No están instalados** en este repositorio | Copiarlos de la plantilla antes de la primera corrida formal (pendiente en `ACTA_QA.md`) |
| `npm run test:rls` | No hay base ni RLS | No aplica hasta conectar la base. Los permisos se prueban hoy en las pruebas de lógica |
| Casos esperados que salen de reglas confirmadas | `REGLAS_NEGOCIO.md` sin firma; casi todo es «decidido por defecto» | Una prueba que pasa demuestra que **el código hace lo que el código dice**, no que el negocio lo quiera así. Ver §2 |
| Mockups aprobados en E3 | 15 mockups del sistema original, propuestos por Claude y no validados; **ninguno** de la ampliación | El nivel 1 de validación está incompleto por construcción |

## 1. Principios no negociables

1. **Sin evidencia no hay CUMPLE.** Captura de pantalla y lectura del estado que confirme lo guardado; o una prueba automática que lo afirme.
2. **Quien construye no juzga.** Quien ejecuta la corrida manual no lee `src/`. Valida contra el caso y contra `REGLAS_NEGOCIO.md`, no contra la implementación.
3. **Nada se descarta en silencio.** Todo «no es bug» o «es de la hora» se registra con su justificación (ejemplo real: las dos pruebas que fallan antes de las 9:00).
4. **No se corrige durante la corrida.** Primero la batería completa; luego corregir; luego re-ejecutar.
5. **Negocio decide las discrepancias.** Si el sistema hace algo coherente pero distinto a lo esperado, se marca para decisión; aquí eso será frecuente porque las reglas no están confirmadas.
6. **El resultado esperado no se edita.** Si negocio lo cambia, se versiona el caso y se anota quién y cuándo.
7. **Una precondición rota detiene el escenario**, no la corrida.
8. **No se inventan resultados.** Un número de pruebas «que pasan» solo se escribe después de correrlas, con fecha, hora y commit.
9. **Lo simulado se prueba como simulado.** Se verifica que esté rotulado y que nunca registre nada por sí solo; no se evalúa su «precisión».

## 2. Los tres niveles de validación (E6) y dónde está cada uno

| Nivel | Qué es | Estado en este proyecto |
|---|---|---|
| 1. Contra los mockups | Cada pantalla contra la imagen aprobada | **No hecho.** Sistema original: 15 mockups sin validar por el cliente. Ampliación: sin mockups |
| 2. Contra las reglas | Los casos borde de `REGLAS_NEGOCIO.md`, no el camino feliz | **Parcial.** Hay pruebas automáticas de lógica por dominio, escritas por quien construyó, contra reglas sin firma. Falta la corrida formal con escenarios y evidencia |
| 3. Contra los números | Datos reales y el cliente confirma que cuadran | **No hecho.** No hay datos reales |

Mientras E3 no esté firmada, el máximo que se puede afirmar es «el sistema es consistente consigo mismo».

## 3. Pruebas automáticas de lógica (lo que existe hoy)

```
npm test            # = node --test tests/
```

- 14 archivos en `tests/`, uno por rol o dominio. Importan `src/store/*.js` y afirman sobre el estado; **no abren el navegador ni prueban pantallas**.
- Conteo de casos por archivo: ver `ACTA_QA.md`.
- **Sensibles a la hora:** `tests/cajero.test.js` y `tests/reglas.test.js` fallan si se corren antes de las 9:00, porque la semilla aún no tiene consultas «cerradas» de hoy. Correr después de las 9:00 y anotar la hora en el acta. Es deuda de la semilla, no un defecto del sistema; no se «arregla» cambiando el esperado.
- Sensibles a la fecha: lo que depende del «mes en curso» (proyecciones, parciales) cambia según el día del mes.
- Compilación: `npx vite build --outDir ../.tmp-build-<nombre> --emptyOutDir` mientras haya varios agentes trabajando (no usar `npm run build`, que pisa `dist/`).
- No cubren: pantallas, navegación, diseño a 360 px, la tienda pública en el navegador, el portal ni el service worker. El dominio plataforma tiene pruebas de lógica pero sus pantallas no existían al redactar esto.

## 4. Roles

| Rol | Responsabilidad | Lee código | Modifica código |
|---|---|---|---|
| qa-arquitecto | Genera escenarios desde los documentos de negocio | Solo la forma de los datos (`DICCIONARIO_DATOS.md`) | No |
| qa-tester | Ejecuta en el navegador, captura evidencia | **No** | No |
| qa-analista | Clasifica hallazgos, busca causa raíz | Sí | No |
| qa-corrector | Corrige lo aprobado, con su prueba de regresión | Sí | Sí |
| Negocio (cliente; hoy, Roberto en su nombre) | Resuelve discrepancias | — | — |
| Coordinador | Coordina y completa el acta. **No ejecuta ni clasifica** | — | — |

## 5. De dónde salen los escenarios (no hay casos legados)

1. `REQUERIMIENTO.md` → **QUÉ NO PUEDE FALLAR** (original y ampliación). Se ejecutan primero: cuadre de caja, expediente único, PEPS, mora, esterilización, atribución de la venta, consolidado igual a la suma, bono aprobado congelado, la IA no registra sola, evidencia del faltante, precio central, lo simulado rotulado.
2. `REGLAS_NEGOCIO.md` → un escenario por regla (RN-…) y uno por cada fila de «Casos borde».
3. `MATRIZ_ROLES.md` → por rol: qué ve, qué puede y **qué no** (permiso negado = escenario). Incluye el recorrido completo del menú: los ítems cuya pantalla no existe son hallazgo.
4. `METRICAS.md` → cargar datos conocidos y comparar la cifra mostrada con la calculada a mano; incluir las «definiciones que no coinciden».
5. `docs/mockups/*.html` → pantalla igual al mockup (solo sistema original).
6. Portal y tienda → el botón de la hoja inicial abre `/app/`; `/app/#/tienda` carga sin sesión; un pedido completo de punta a punta.
7. Multitienda → una persona con dos sucursales entra, elige, vende, cambia de sucursal y vuelve a vender; se verifica a qué sucursal quedó cada movimiento.

El resultado esperado sale siempre del documento de negocio, **nunca** de leer el código.

## 6. Ciclo de una corrida

**Fase 0 — Preparación.** Ambiente: local o el sitio de QA; nunca datos reales. Navegador limpio → «Restablecer datos de demo». Registrar en `tests/corridas/<fecha>_R00N/manifiesto.json`: id, fecha **y hora**, commit, `VERSION_SISTEMA`, clave de almacenamiento, URL, cuenta y sucursal de prueba, escenarios. Todo lo creado lleva prefijo `QA-R00N`.

**Fase 1 — Conversión.** Escenarios en `tests/escenarios/ESC-NNN_*.yaml` con el formato de la plantilla (§5 de la plantilla). En lugar de `verificar_bd` con SQL se usa `verificar_estado`: la expresión que se lee del estado y el valor esperado. Ejemplo:

```yaml
- n: 4
  descripcion: Confirmar la nota de compra leída
  esperado: Se crea la nota y su cuenta por pagar; sin confirmar no se crea nada.
  accion: "Clic en Confirmar"
  verificar_ui: "Aviso de nota registrada con folio NC-…"
  verificar_estado: "d.fin.notasCompra[0].cxpId != null && d.cxp.some(c => c.notaId === d.fin.notasCompra[0].id)"
  esperado_estado: true
```

**Fase 2 — Ejecución.** Paso por paso: captura antes, acción, esperar estado estable, captura después, lectura del estado, evento en `bitacora.jsonl`. Reintentar una vez con método alternativo antes de registrar un fallo. Medir a 360, 390 y 430 px y en escritorio (1024 px o más): el menú cambia.

**Fase 3 — Análisis.** Clasificar todo lo que no sea CUMPLE; causa raíz; `hallazgos.md`; preguntas para negocio.

**Fase 4 — Revisión humana.** Negocio resuelve discrepancias; se anota quién y cuándo.

**Fase 5 — Corrección.** Un commit por hallazgo (`fix(QA-R001-H01): …`) con su prueba de regresión en `tests/`.

**Fase 6 — Re-ejecución.** Lo afectado más un muestreo de lo que pasaba.

**Fase 7 — Cierre.** Criterio de salida (§8) y actualización de `ACTA_QA.md`.

## 7. Taxonomía

**Resultado del paso:** CUMPLE · NO CUMPLE · PARCIAL · NO EJECUTABLE · VERIFICAR · PENDIENTE.

**Clasificación del hallazgo:** BUG · FALSO_POSITIVO_HERRAMIENTA · DISCREPANCIA_NEGOCIO · CAMBIO_NOMENCLATURA · GAP_CATALOGO · GAP_MIGRACION · UX_MENOR. Se agregan dos propias de este proyecto:
- **REGLA_SIN_CONFIRMAR** — el sistema cumple una regla «decidida por defecto» que el cliente no ha confirmado. No es defecto; va a la lista de preguntas.
- **SIMULADO** — el comportamiento depende de un servicio no contratado. Se verifica el rótulo y que no registre nada solo.

**Severidad (BUG):** Crítica (pérdida de datos, monto mal calculado, operación bloqueada) · Alta (regla incumplida, dato mal guardado) · Media (dato correcto mal mostrado) · Baja (cosmético).

## 8. Criterio de salida

Una corrida se cierra solo si: 0 BUG críticos o altos abiertos; 0 pasos en VERIFICAR o PENDIENTE; toda DISCREPANCIA_NEGOCIO y toda REGLA_SIN_CONFIRMAR con decisión firmada; todo NO EJECUTABLE con explicación y plan; cada BUG corregido con su prueba de regresión en verde; `npm test` en verde **corrido después de las 9:00**, con hora anotada.

Para liberar a producción, además: E3 firmada, base conectada con RLS probado, y el nivel 3 (números reales) hecho con el cliente.

## 9. Cuando se conecte la base (esquema `piefirme`)

Vuelve a regir la plantilla completa: verificación por `SELECT`, `npm run test:rls` antes de la primera vuelta y después de cada corrección, `tests/rls.config.json` con la aserción cruzada entre organizaciones (la base es compartida y el esquema es multiorganización), y la tienda pública limitada a funciones declaradas para el rol anónimo. Solo contra QA: si el ambiente apunta a producción, abortar.

## 10. De agente a regresión permanente

Cada escenario que llegue a CUMPLE completo se convierte en una prueba permanente: de lógica en `tests/*.test.js` si es una regla, o de navegador (Playwright) en `tests/regresion/` si es un recorrido. El agente queda para escenarios nuevos y pruebas exploratorias.
