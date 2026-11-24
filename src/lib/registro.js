// Descubrimiento automático de rutas y menú de los módulos (contrato: docs/FRONTEND_ARQUITECTURA.md).
//   src/routes/*.jsx  → export default [{ path, element, roles, titulo }]
//   src/menu/*.js     → export default { grupo, orden, items: [{ label, path, icon, roles }] }
// Cada agente/módulo toca SOLO sus propios archivos; nadie edita App.jsx ni Sidebar.jsx.
import { rolPermitido } from './permisos'

const modRutas = import.meta.glob('../routes/*.jsx', { eager: true })
const modMenu = import.meta.glob('../menu/*.js', { eager: true })

/** Orden fijo de los grupos del menú (mockups). RANNIX va aparte y al final. */
export const GRUPOS_ORDEN = ['INICIO', 'AGENDA', 'PACIENTES', 'CLÍNICA', 'VENTAS', 'INVENTARIO', 'FINANZAS', 'EQUIPO', 'ANÁLISIS', 'ADMIN', 'UTILERÍAS', 'RANNIX']

/** Todas las rutas declaradas por los módulos (aplanadas). Una ruta repetida avisa en consola. */
export function obtenerRutas() {
  const vistas = new Map()
  for (const [archivo, m] of Object.entries(modRutas)) {
    const lista = m.default
    if (!Array.isArray(lista)) { console.warn(`[rutas] ${archivo} debe exportar por defecto un arreglo`); continue }
    for (const r of lista) {
      if (!r?.path || !r?.element) { console.warn(`[rutas] ${archivo}: ruta sin path o element`, r); continue }
      if (vistas.has(r.path)) console.warn(`[rutas] ruta duplicada ${r.path} (${archivo} y ${vistas.get(r.path)})`)
      vistas.set(r.path, archivo)
    }
  }
  return Object.values(modRutas).flatMap(m => (Array.isArray(m.default) ? m.default.filter(r => r?.path && r?.element) : []))
}

/** Título de una ruta (para <title> y migas) a partir de su path. */
export const tituloDeRuta = (path, rutas = obtenerRutas()) =>
  rutas.find(r => r.path === path)?.titulo ?? null

/**
 * Menú visible para un rol: grupos en orden, ítems filtrados por `roles`.
 * Los archivos que comparten `grupo` se mezclan (ordenados por su `orden`).
 */
export function menuParaRol(rol, liberacion) {
  const grupos = new Map()
  const archivos = Object.entries(modMenu)
    .map(([a, m]) => ({ a, def: m.default }))
    .filter(({ a, def }) => (def && Array.isArray(def.items)) || (console.warn(`[menú] ${a} debe exportar {grupo, orden, items}`), false))
    .sort((x, y) => (x.def.orden ?? 100) - (y.def.orden ?? 100))
  for (const { def } of archivos) {
    const items = def.items.filter(i => rolPermitido(rol, i.roles, i.path) && rutaLiberada(i.path, liberacion, rol))
    if (!items.length) continue
    const g = grupos.get(def.grupo) ?? []
    grupos.set(def.grupo, g.concat(items))
  }
  const orden = [...GRUPOS_ORDEN, ...[...grupos.keys()].filter(g => !GRUPOS_ORDEN.includes(g))]
  return orden.filter(g => grupos.has(g)).map(grupo => ({ grupo, items: grupos.get(grupo) }))
}

// ───────── Liberación de funciones por RANNIX (migración 074) ─────────
// Mientras la clínica no tenga la liberación estricta, todo se muestra como siempre. Con ella, solo lo que RANNIX liberó para el rol.
// La clave de una función es la ruta de su opción de menú; una ruta interna (p. ej. /pacientes/:id) pertenece a la opción más específica.
const clavesMenu = () => [...new Set(Object.values(modMenu).flatMap(m => (m.default?.items ?? []).map(i => i.path)))]
  .filter(p => p && p !== '/' && !p.startsWith('/rannix'))

/** Opción de menú (clave) a la que pertenece una ruta; null si no pertenece a ninguna (siempre disponible). */
export function claveDeRuta(path) {
  const p = (path || '').replace(/\/$/, '') || '/'
  let mejor = null
  for (const c of clavesMenu()) if ((p === c || p.startsWith(c + '/')) && (!mejor || c.length > mejor.length)) mejor = c
  return mejor
}

/** ¿Esta ruta está liberada para el rol? liberacion = { estricta, claves[] } que carga AppContext. */
export function rutaLiberada(path, liberacion, rol) {
  if (!liberacion?.estricta || rol === 'rannix') return true
  const clave = claveDeRuta(path)
  return !clave || liberacion.claves.includes(clave)
}
