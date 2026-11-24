# ARQUITECTURA DE LA WEB APP (modo demo) — guía para quien escribe pantallas

Web app instalable, **una por rol, con menú inferior** (aprobado en `docs/MATRIZ_MOVIL.md`). Vite + React 18 + react-router (HashRouter). Datos de demostración generados y persistidos en `localStorage`; la capa `src/store/` se sustituirá por Supabase sin tocar las pantallas.

## Estructura
```
src/config/roles.js      ← menús por rol (tabs, "Más", badges). ÚNICO lugar de configuración del menú. No editar.
src/shell/               ← Shell (menú inferior), Login, hooks. No editar.
src/store/core.js        ← useStore(), mutar(), folio(), auditar(), registrarOp() (cola sin señal)
src/store/reglas.js      ← reglas de negocio puras (precio, PEPS, apartados, mora, niveles, caja). USARLAS, no reimplementarlas
src/store/selectors.js   ← selectores y badges
src/store/acciones.js    ← resolverAutorizacion(), liberarApartado()
src/store/seed.js        ← forma de TODOS los datos (léelo: es el diccionario ejecutable)
src/ui/index.jsx         ← componentes (Icon, Button, Card, Badge, Kpi, Fila, Field/Input/Select/Area, Chips, Sheet, Pasos, BarraAccion, Fab, Buscador, Confirmar, Resumen, aviso())
src/componentes/         ← componentes compartidos entre roles (SelectorPaciente, Autorizaciones…)
src/pantallas/<app>/<tab>.jsx   ← una pantalla por tab:  recepcion|podologo|asistente|cajero|almacen|gerente|admin
src/pantallas/mas/<key>.jsx     ← pantallas de "Más" (compartidas por todos los roles; el contenido se adapta al rol del usuario)
```
Cada archivo de `src/pantallas/` **exporta por defecto un componente sin props**. Se registra solo por nombre de archivo (no hay que editar nada más).

## Cómo escribir una pantalla
```jsx
import { useSesion, useIr, useParam } from "../../shell/sesion.js";
import { mutar, folio, auditar, registrarOp } from "../../store/core.js";
import * as R from "../../store/reglas.js";            // precioFinal, stock, salidaPEPS, entradaCapa, estadoApartado, saldoPlan…
import { Card, Fila, Badge, Button, Sheet, Field, Input, aviso } from "../../ui/index.jsx";
import { dinero, hoy, ahoraLocal, fechaCorta, hora, dia } from "../../lib/format.js";

export default function Mia() {
  const { d, u, sucursalId, sucursal, params } = useSesion();   // d = estado (solo lectura). u = usuario. params = parámetros de la sucursal activa
  ...
  mutar((d) => { /* editar d aquí; es una copia */ });
}
```
- `useSesion()` se re-renderiza solo cuando cambian los datos. **Nunca mutes `d` fuera de `mutar()`.**
- `useIr()("consulta", { cita: id })` navega a otro tab del rol con parámetros; leerlos con `useParam("cita")`.
- Folios: `folio(d, "T")` → `T-0042` (series: T ventas, AP apartados, CR créditos, OC, TR, LAB, CIC).
- Toda acción sensible llama `auditar(d, "accion", "entidad", id, "detalle")` dentro de `mutar`.
- Sucursal activa: `sucursalId` ("S1".."S7"; `"CEN"` = almacén central, solo el usuario `almacenCentral`, y entonces `params` es `null`).
- Datos nuevos: se agregan como colecciones nuevas en `d` desde la propia acción (`d.mi_coleccion ||= []`). Si agregas campos a entidades existentes, que sean opcionales (los datos viejos no los tienen).
- Operaciones que deben funcionar **sin señal** (cobros en caja, conteo de almacén): se aplican siempre en local y además llaman `registrarOp(d, "tipo", "resumen")` dentro del `mutar`; la cola y el aviso los pinta el shell.
- Autorizaciones: se piden con `pedirAutorizacion(d, {tipo, sucursalId, solicitanteId, detalle, monto, nivel, ref})` (ver convención de `ref` en `src/store/acciones.js`) y las resuelve el gerente/admin. Niveles: `nivelCredito(d, suc, monto)`, `nivelAjuste(d, suc, monto)`.

## Reglas de diseño (estándar móvil de la fábrica) — obligatorias
- Una columna. Formulario > ~7 campos → **pasos** con `<Pasos>`. Botón principal **fijo abajo** con `<BarraAccion>` (o en el pie de un `<Sheet>`), con estado de carga.
- **Ninguna tabla**: usa tarjetas/`<Fila>` con 3–4 datos y el estatus como `<Badge>` de color. Detalle completo en un `<Sheet>` o sub-vista.
- Listas largas → `<Buscador>` + filtros `<Chips>`. Listas cortas → chips.
- Tipos de campo nativos: `type="tel"`, `inputMode="numeric"|"decimal"`, `type="date"`, `type="time"`, `autoComplete`. Mínimo 16 px (ya lo da `.inp`).
- Áreas táctiles ≥ 44 px. Nada de scroll horizontal (se mide a 360, 390 y 430 px). Texto en español.
- Estados vacíos con `<Vacio>`. Mensajes de éxito/error con `aviso("texto", "ok"|"warn"|"bad")`.
- Usa **solo** componentes e íconos de `src/ui/index.jsx` (si necesitas un ícono nuevo, usa uno existente; no edites `ui`). Colores solo con las variables CSS (`var(--p)`, `var(--ok)`…). Estilos propios mínimos con `style={{}}` y las clases existentes (`.lista`, `.form`, `.form2`, `.dos`, `.kpis`, `.tabla-m`, `.mu`, `.peq`, `.der`, `.fuerte`, `.titulo`).
- Acción dominante del rol: tab central (ya configurado) — no agregues botones flotantes salvo `recepcion/agenda` (único con `<Fab>`).
- Lógica de negocio **solo** vía `src/store/reglas.js` / `acciones.js` / funciones propias en `src/store/acciones_<tu-area>.js`. No dupliques reglas dentro de componentes. Si una regla falta en `reglas.js`, ponla en tu `acciones_<area>.js` y dilo en el reporte.
- Los permisos se validan también en el dato: una pantalla de otro rol no debe poder invocar acciones que no le tocan (la acción revisa `u.rol` y lanza/ignora).

## Qué NO tocar
`src/config/`, `src/shell/`, `src/ui/`, `src/store/core.js|reglas.js|selectors.js|seed.js|acciones.js`, `package.json`, `vite.config.js`, archivos de otros agentes. Si necesitas un cambio en alguno, **no lo hagas: descríbelo en tu reporte final** (el coordinador lo integra).

## Verificación
- Sintaxis/compilación: `npx vite build --outDir ../.tmp-build-<tuNombre> --emptyOutDir` (NO uses `npm run build`: varios agentes trabajan a la vez y pisarían `dist/`). Borra esa carpeta al terminar.
- Pruebas lógicas de tus acciones con `node --test` en `tests/<tuArea>.test.js` (importa `src/store/*.js`; `core.js` usa localStorage, así que prueba `reglas.js` y funciones puras, o ejecuta `mutar` tras definir un `globalThis.localStorage` simple).
- No afirmes que algo funciona sin haberlo ejecutado.

## Qué leer antes
`REQUERIMIENTO.md` (decisiones del cliente), `docs/MATRIZ_MOVIL.md` (tabs de cada rol: qué hace cada pantalla), `DICCIONARIO_DATOS.md`, `MODELO_ESTADOS.md`, `MATRIZ_ROLES.md`, `PREGUNTAS_ABIERTAS.md`, `docs/mockups/*.html` (diseño de cada función de escritorio; aquí se adaptan a móvil) y `src/store/seed.js`.
