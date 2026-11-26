// Captura de partidas a ciegas (cliente). El servidor responde SOLO ok + el siguiente producto (ctl_capturar_partida); esto genera el id
// idempotente, valida lo mínimo antes de enviar y vigila que ninguna respuesta lleve saldo ni diferencia a un rol de sucursal.
import { CAMPOS_CIEGOS } from './roles.js'

/** id de la captura: lo genera el dispositivo; un reenvío con el mismo id no duplica la partida. */
export const nuevoIdCaptura = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = (Math.random() * 16) | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16) }))

/** Llaves ciegas (saldo, diferencia, valor esperado…) que aparezcan en una respuesta, a cualquier profundidad. */
export function llavesCiegas(v, ruta = '') {
  if (Array.isArray(v)) return v.flatMap((x, i) => llavesCiegas(x, `${ruta}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => (CAMPOS_CIEGOS.includes(k) ? [`${ruta}.${k}`] : []).concat(llavesCiegas(x, `${ruta}.${k}`)))
  return []
}

/**
 * Lo que la pantalla de captura puede conservar de una respuesta. Solo el auditor de una puntual conserva «revision»; para cualquiera
 * más se descarta aunque el servidor la hubiera mandado (defensa en profundidad: el servidor ya no la manda).
 */
export function respuestaDeCaptura(resp, { esAuditorPuntual = false } = {}) {
  if (!resp || typeof resp !== 'object') return { ok: false, error: 'sin_respuesta', mensaje: 'Sin respuesta del servidor' }
  const base = {
    ok: !!resp.ok, idempotente: !!resp.idempotente, partidaId: resp.partida_id ?? null, corrige: !!resp.corrige,
    avance: resp.avance ? { capturadas: Number(resp.avance.capturadas) || 0, enLista: Number(resp.avance.en_lista) || 0 } : null,
    siguiente: resp.siguiente ?? null, error: resp.error ?? null, mensaje: resp.mensaje ?? null,
  }
  if (esAuditorPuntual && resp.revision) base.revision = resp.revision
  return base
}

/** Validación mínima antes de enviar (el servidor valida de nuevo). */
export function validarEntrada({ cantidad, precioEtiqueta, pidePrecio = false, producto = null, serie = '', sello = '', selloIntacto = null }) {
  const n = Number(cantidad)
  if (cantidad === '' || cantidad == null || !Number.isFinite(n) || n < 0) return { ok: false, error: 'Escribe cuántas piezas hay (0 o más).' }
  if (pidePrecio && (precioEtiqueta === '' || precioEtiqueta == null || !(Number(precioEtiqueta) >= 0))) return { ok: false, error: 'Este conteo pide el precio de la etiqueta.' }
  if (producto?.requiere_serie && !String(serie).trim()) return { ok: false, error: 'Este producto exige capturar su número de serie.' }
  if (producto?.requiere_sello && (!String(sello).trim() || selloIntacto == null)) return { ok: false, error: 'Este producto exige el folio del sello y si está intacto.' }
  return { ok: true }
}

/**
 * Envía con reintentos usando SIEMPRE el mismo id: si la red falla a medias, el reenvío no duplica (el servidor responde idempotente).
 * `enviar(id)` devuelve { data, error }. Solo se reintenta ante errores de red (no ante errores de dominio del servidor).
 */
export async function enviarConReintento(enviar, { id = nuevoIdCaptura(), intentos = 3, esperaMs = 400, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let ultimo = null
  for (let i = 0; i < intentos; i++) {
    const r = await enviar(id)
    if (!r?.error) return { ...r, id, intentos: i + 1 }
    ultimo = r.error
    const red = !ultimo.code || /fetch|network|failed|timeout|conexi/i.test(String(ultimo.message ?? ''))
    if (!red) break
    if (i < intentos - 1) await dormir(esperaMs * (i + 1))
  }
  return { data: null, error: ultimo, id, intentos }
}
