// Formato es-MX. La zona horaria es la de la clínica (organizaciones.zona_horaria); AppContext la fija al cargar.
let ZONA = 'America/Mexico_City'
export const fijarZonaHoraria = tz => { if (tz) ZONA = tz }
export const zonaHoraria = () => ZONA

const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const fmtNum = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

export const moneda = n => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : fmtMoneda.format(Number(n)))
export const numero = n => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : fmtNum.format(Number(n)))
export const porcentaje = (n, dec = 1) => (n == null || Number.isNaN(Number(n)) ? '—' : `${Number(n).toFixed(dec)}%`)

// Las columnas `date` (YYYY-MM-DD) se muestran tal cual, sin correr por zona horaria (evita el día anterior).
const esSoloFecha = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const aDate = v => (v instanceof Date ? v : new Date(v))

function fmt(v, opts, soloFechaOk = true) {
  if (!v) return '—'
  if (esSoloFecha(v)) {
    if (!soloFechaOk) return '—'
    const [y, m, d] = v.split('-').map(Number)
    return new Intl.DateTimeFormat('es-MX', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
  }
  const d = aDate(v)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', { ...opts, timeZone: ZONA }).format(d)
}
export const fecha = v => fmt(v, { day: '2-digit', month: '2-digit', year: 'numeric' })
export const fechaLarga = v => fmt(v, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fechaCorta = v => fmt(v, { day: '2-digit', month: 'short' })
export const hora = v => fmt(v, { hour: '2-digit', minute: '2-digit', hour12: false }, false)
export const fechaHora = v => (v ? (esSoloFecha(v) ? fecha(v) : `${fecha(v)} ${hora(v)}`) : '—')

/** 'YYYY-MM-DD' de hoy en la zona de la clínica (para filtros por día). */
export function hoyISO(zona = ZONA) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return p
}

/** Teléfono mexicano: 5514120283 → (55) 1412-0283. Otros formatos se devuelven tal cual. */
export function telefono(v) {
  if (!v) return '—'
  const d = String(v).replace(/\D/g, '').replace(/^(52|521)(?=\d{10}$)/, '')
  return d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : String(v)
}
export const soloDigitos = v => String(v ?? '').replace(/\D/g, '')

export const nombreCompleto = p =>
  p ? [p.nombre, p.apellido_paterno ?? p.apellidos, p.apellido_materno].filter(Boolean).join(' ') : ''
export const iniciales = (txt = '') =>
  String(txt).trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('') || '?'

export function edad(nacimiento) {
  if (!esSoloFecha(nacimiento)) return null
  const n = new Date(nacimiento + 'T00:00:00'), h = new Date()
  let e = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--
  return e
}

/** Desfase de la zona de la clínica como '+HH:MM' / '-HH:MM' (hoy). */
export function offsetZona(zona = ZONA) {
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = parte.match(/GMT([+-]\d{2}:\d{2})/)
  return m ? m[1] : '+00:00'
}
/** [inicio, fin] ISO (con desfase) del día de hoy en la zona de la clínica: para filtrar columnas timestamptz. */
export function limitesDelDia(zona = ZONA) {
  const hoy = hoyISO(zona), off = offsetZona(zona)
  return [`${hoy}T00:00:00${off}`, `${hoy}T23:59:59.999${off}`]
}
