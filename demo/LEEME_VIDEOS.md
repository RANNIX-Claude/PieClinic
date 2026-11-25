# Cómo se hace un video de QA narrado (Pie Clinic) — guía para quien graba

Proyecto: `C:\Users\asus\OneDrive\work\PieClinic\DEv` (React + Vite + Supabase QA). Lee `CLAUDE.md`, `docs/METODOLOGIA_QA.md` y `docs/ACCESOS.md`.

## Receta (copia el estilo de `demo/caja-especial.spec.ts`, `demo/cita-agendar.spec.ts`, `demo/inv-faltante.spec.ts`)
1. **Spec** en `demo/<area>-<nombre>.spec.ts` (el nombre DEBE ser `caja-`, `inv-`, `cita-`, `consulta-` o `vid-` + minúsculas/guiones; así lo toma `playwright.caja.config.ts`). Usa `crearVideo('<carpeta>')` de `demo/lib/video.ts` (léelo): `v.empezar(context)`, `v.firmar(page, SEDE, intro)`, `v.irA(page, /Enlace/)`, `v.narrar(page, texto, extraMs)`, `v.terminar(page, {datos})`. La narración se escribe ANTES de la acción que describe y SOLO dice lo que el video muestra: lee los valores reales de la pantalla (totales, folios, nombres) y compóntelos en el texto; verifica con `expect`.
2. **Correr**: `cd DEv && PW_LOTE=<tu letra> BASE_URL=http://localhost:5174 timeout 590 npx playwright test -c playwright.caja.config.ts <nombre-del-spec>` (≤ 10 min por llamada; `PW_LOTE` evita que tu corrida borre la de otro). El servidor de desarrollo ya corre en **5174** (`VITE_ENTORNO=prod`, oculta el panel de cuentas de prueba). Viewport 1366×768, Chrome headless, video grabado por Playwright.
3. **Voz y mezcla** (Windows SAPI, voz «Microsoft Sabina» es-MX):
   - `powershell -NoProfile -File demo/narrar.ps1 -Dir "$(pwd -W)/demo/video/<carpeta>"`
   - `node demo/mezclar.mjs demo/video/<carpeta> demo/video/<carpeta>/<carpeta>.webm demo/video/<area>-<nombre>-narrado.mp4`
   - El resultado es `demo/video/<area>-<nombre>-narrado.mp4`. Revisa que `voces que exceden su hueco` sea 0 o pequeño.
4. Para ver la pantalla: `ffmpeg -v error -sseof -3 -i <webm> -frames:v 1 -y %TEMP%/x.png` y lee la imagen. Los fallos dejan `error-context.md` con el árbol de la página en la carpeta de resultados (`%TEMP%/pw-res-<PW_LOTE>/…`).

## Datos de prueba
Cuentas (clave `123456`): `r@g.com` recepción, `p@g.com` podólogo, `m@g.com` administrador, `a@g.com` superadmin. Sedes de la organización «Pie Clinic (sintético)»: `Pie Clinic Centenario/Chalco/Galerías/Patio/Sendero` (tienen caja, inventario; **sin horarios de podólogo**) y `Centenario`, `Galerías`… sin prefijo (tienen horarios y podólogos: p. ej. en `Centenario` está **Paulina Soto Escamilla**). Pacientes buscables con «mar» (María Jiménez Hernández, Araceli Martínez Vega…). Producto especial a la medida = servicio «Plantilla ortopédica a la medida» (admite características). Cuenta cada dato nuevo como basura de QA que **no se puede borrar** (triggers de inmutabilidad): crea lo mínimo.
SQL directo a QA (solo lectura/verificación): `node "C:/Users/asus/AppData/Local/Temp/claude/05b683f7303be1b6/1a097814-e8f1-411c-81da-65d3a9658f0a/scratchpad/sqlpg.mjs" "select …"` (varias sentencias separadas por una línea `;;`). Nunca desactives triggers ni uses `session_replication_role`; nunca borres datos de QA.

## Trampas conocidas
- La búsqueda de la caja NO ignora acentos: escribe «valorac», no «valoracion».
- `getByLabel('Servicio')` es ambiguo (hay «Precio del servicio»): usa `{ exact: true }`.
- La impresión abre una ventana con `window.open`; `v.empezar` ya neutraliza `print()`. Para mostrar el ticket en el video, ver `demo/caja-tarjeta.spec.ts` (iframe de vista previa).
- Los `<select>` se llenan con `selectOption({ label })`; los campos `type=number` con `fill`.
- Si escribes el spec con heredoc de bash y comillas complejas se rompe: usa la herramienta Write para crear archivos.
- Algunos archivos del repo tienen finales de línea CRLF: al parchar con node, normaliza `\r\n` ↔ `\n`.
- Los reportes de duración de voz se guardan en `demo/video/<carpeta>/duraciones.json`; si un video queda desfasado, vuelve a correr la mezcla.

## REGLA DEL DUEÑO (obligatoria)
Si el video **encuentra un error** (de código o de regla): **corrígelo, valida y vuelve a grabar el video** para entregar el flujo correcto; no sigas con el siguiente dejando el hallazgo pendiente. Si NO se puede corregir (es una decisión de negocio, falta una función grande, depende de llaves externas como Clip/PAC/IA/WhatsApp): deja el video como está y márcalo **«NO CORREGIDO — requiere decisión/liberación»** en el hallazgo y, en el propio video, dilo en la narración final. Los cambios de esquema son migraciones numeradas en `migraciones/` (usa SOLO tu rango asignado) y se aplican a QA con `npm run migrate:qa -- migraciones/NNN_x.sql`; después de cambiar la BD o el código, valida (`node --test src/lib`, que la pantalla funcione). Cambios de código mínimos y con Edit/parches puntuales (otros lotes editan en paralelo: relee el archivo justo antes de editarlo). No hagas commit, push ni despliegues. No toques `public`, `comercio_*` ni otros esquemas.

## Entrega
Por cada video: la ruta del `.mp4`, qué muestra (pasos), los datos usados (folios, nombres) y el estado de cada hallazgo (CORREGIDO y regrabado / NO CORREGIDO requiere decisión / sin hallazgos). Escribe esos hallazgos también en `tests/corridas/2026-11-25_VID/hallazgos_<lote>.md`. Si una funcionalidad no tiene pantalla o está bloqueada por una integración simulada, graba lo que sí existe, di con claridad la limitación y márcala.
