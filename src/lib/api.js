// Helpers de datos de Pie Firme. Convención: se LEE de vistas prp_* y se ESCRIBE en tablas base.
// Todos devuelven { data, error, count }; nunca lanzan por errores de red/BD (el módulo decide qué mostrar).
// Excepción: insertar/actualizar/borrar lanzan si la clínica está en solo lectura (defensa; el RLS también lo impide).
import { supabase } from './supabase'

// AppContext fija esto al cargar el perfil.
const ctx = { organizacionId: null, soloLectura: false, sedesUsuario: [] }
export const fijarContextoApi = c => Object.assign(ctx, c)
export const contextoApi = () => ({ ...ctx })

/** ¿El error significa que la vista o tabla aún no existe (migración sin aplicar)? */
export const esVistaInexistente = e =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message || ''))

/**
 * Lee de una vista prp_* con filtro de sede, filtros simples, búsqueda, orden y paginación.
 * @param {string} vista  p. ej. 'prp_agenda'
 * @param {object} o
 *   sedeId   uuid de la sede activa (null = todas las sedes a las que el usuario tiene acceso)
 *   sedeCol  columna de sede (por defecto 'sede_id'); false = la vista no tiene sede
 *   filtros  { columna: valor | [valores] | {gte, lte, gt, lt, neq, ilike, ...} }
 *   buscar   { columnas: ['paciente_nombre'], texto }  (ilike con OR)
 *   orden    { columna, asc = true } | [{...}]
 *   pagina   0-based; tamano (por defecto 25); contar = true pide el total
 *   columnas 'col1,col2' (por defecto '*'); limite = N sin paginar
 */
export async function leer(vista, o = {}) {
  const { sedeId, sedeCol = 'sede_id', filtros = {}, buscar, orden, pagina, tamano = 25, contar = false, columnas = '*', limite } = o
  let q = supabase.from(vista).select(columnas, contar ? { count: 'exact' } : undefined)
  if (sedeCol) {
    if (sedeId) q = q.eq(sedeCol, sedeId)
    else if (ctx.sedesUsuario?.length) q = q.in(sedeCol, ctx.sedesUsuario) // «todas» = todas las asignadas
  }
  for (const [col, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) q = q.in(col, v)
    else if (typeof v === 'object') {
      for (const [op, val] of Object.entries(v)) q = q[op](col, val)
    } else q = q.eq(col, v)
  }
  if (buscar?.texto?.trim() && buscar.columnas?.length) {
    const t = buscar.texto.trim().replace(/[,()%]/g, ' ')
    q = q.or(buscar.columnas.map(c => `${c}.ilike.%${t}%`).join(','))
  }
  for (const ord of [].concat(orden ?? [])) q = q.order(ord.columna, { ascending: ord.asc !== false })
  if (pagina != null) q = q.range(pagina * tamano, pagina * tamano + tamano - 1)
  else if (limite) q = q.limit(limite)
  const { data, error, count } = await q
  return { data: data ?? [], error: error ?? null, count: count ?? null }
}

/** Una sola fila (por id u otro filtro). */
export async function leerUno(vista, filtros) {
  let q = supabase.from(vista).select('*')
  for (const [c, v] of Object.entries(filtros)) q = q.eq(c, v)
  const { data, error } = await q.limit(1).maybeSingle()
  return { data: data ?? null, error: error ?? null }
}

/** Solo cuenta filas. */
export async function contarFilas(vista, { sedeId, sedeCol = 'sede_id', filtros = {} } = {}) {
  const r = await leer(vista, { sedeId, sedeCol, filtros, contar: true, limite: 1, columnas: '*' })
  return { count: r.count, error: r.error }
}

/** Llama una RPC pública. Devuelve { data, error }. */
export async function rpc(nombre, args = {}) {
  const { data, error } = await supabase.rpc(nombre, args)
  return { data: data ?? null, error: error ?? null }
}

function exigirEscritura() {
  if (ctx.soloLectura) throw new Error('La clínica está en modo solo lectura (suspendida o dada de baja). No se puede guardar.')
}
/** Inserta en una tabla base; agrega organizacion_id automáticamente. */
export async function insertar(tabla, filas) {
  exigirEscritura()
  const lista = [].concat(filas).map(f => ({ organizacion_id: ctx.organizacionId, ...f }))
  const { data, error } = await supabase.from(tabla).insert(lista).select()
  return { data: data ?? null, error: error ?? null }
}
export async function actualizar(tabla, id, cambios) {
  exigirEscritura()
  const { data, error } = await supabase.from(tabla).update(cambios).eq('id', id).select().maybeSingle()
  return { data: data ?? null, error: error ?? null }
}
export async function borrar(tabla, id) {
  exigirEscritura()
  const { error } = await supabase.from(tabla).delete().eq('id', id)
  return { error: error ?? null }
}

/** Netlify Function con el token de la sesión (proxys de IA, Clip, timbrado, etc.). */
export async function llamarFuncion(nombre, body) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(`/.netlify/functions/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  })
}
