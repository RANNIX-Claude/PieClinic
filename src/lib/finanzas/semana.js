// Semana de corte sábado → viernes (P-088; espejo de app.c_semana_inicio / semana_corte).
// Todas las fechas son 'YYYY-MM-DD' (columnas date): se calculan en UTC para no correr de día.
import { MESES } from './constantes.js'

const aUTC = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const deUTC = ms => new Date(ms).toISOString().slice(0, 10)
const DIA = 86400000

export const sumarDias = (iso, n) => deUTC(aUTC(iso) + n * DIA)
export const diasEntre = (a, b) => Math.round((aUTC(b) - aUTC(a)) / DIA)
/** Día de la semana de una fecha ISO: 0 = domingo … 6 = sábado. */
export const diaSemana = iso => new Date(aUTC(iso)).getUTCDay()

/** Inicio (sábado por defecto) de la semana que contiene `iso`. */
export function inicioSemana(iso, dow = 6) {
  return sumarDias(iso, -((diaSemana(iso) - dow + 7) % 7))
}
/** Etiqueta 'S01'…: número de semana contado desde la primera semana del año del inicio (igual que app.c_semana_etiqueta). */
export function etiquetaSemana(iso, dow = 6) {
  const ini = inicioSemana(iso, dow)
  const anio = Number(ini.slice(0, 4))
  const ini1 = inicioSemana(`${anio}-01-01`, dow)
  return 'S' + String(Math.floor(diasEntre(ini1, ini) / 7) + 1).padStart(2, '0')
}
/** { inicio, fin, etiqueta } de la semana que contiene `iso`. */
export function semanaCorte(iso, dow = 6) {
  const inicio = inicioSemana(iso, dow)
  return { inicio, fin: sumarDias(inicio, 6), etiqueta: etiquetaSemana(iso, dow) }
}
export const ultimoDiaMes = (anio, mes) => deUTC(Date.UTC(anio, mes, 0))
export const rangoMes = (anio, mes) => ({ desde: `${anio}-${String(mes).padStart(2, '0')}-01`, hasta: ultimoDiaMes(anio, mes) })
export const nombreMes = mes => MESES[mes - 1] ?? ''
/** Semanas (de corte) que tocan un mes, en orden. */
export function semanasDelMes(anio, mes, dow = 6) {
  const { desde, hasta } = rangoMes(anio, mes)
  const out = []
  let s = inicioSemana(desde, dow)
  while (s <= hasta) { out.push(semanaCorte(s, dow)); s = sumarDias(s, 7) }
  return out
}
/** ¿La fecha cae dentro de [inicio, fin] (inclusive)? */
export const enRango = (iso, inicio, fin) => iso >= inicio && iso <= fin

/**
 * Estado derivado de la semana (S22): 'en_curso' (hoy dentro), 'por_cerrar' (ya terminó y no hay cierre), 'cerrada' (hay cierre vigente), 'futura'.
 * `cierres`: [{ tipo:'semana', fecha_inicio, estado:'cerrado'|'reabierto' }]
 */
export function estadoSemana(semana, hoyIso, cierres = []) {
  const c = cierres.find(x => (x.tipo ?? 'semana') === 'semana' && (x.fecha_inicio ?? x.inicio) === semana.inicio)
  if (c?.estado === 'cerrado') return 'cerrada'
  if (hoyIso < semana.inicio) return 'futura'
  if (hoyIso <= semana.fin) return 'en_curso'
  return 'por_cerrar'
}
/** Un registro con `fecha` cae en un periodo cerrado (no se puede crear/editar/borrar; P-099). */
export function enPeriodoCerrado(fechaIso, cierres = [], dow = 6) {
  const sem = semanaCorte(fechaIso, dow)
  return cierres.some(c => c.estado === 'cerrado' && (
    (c.tipo === 'semana' && c.fecha_inicio === sem.inicio) ||
    (c.tipo === 'mes' && fechaIso.slice(0, 7) === String(c.fecha_inicio).slice(0, 7))))
}
export function etiquetaRango(inicio, fin) {
  const f = iso => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)}` }
  return `${f(inicio)} – ${f(fin)}`
}
