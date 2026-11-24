// Cálculos puros de KPIs y agrupaciones para dashboard y reportes.
const r2 = n => Math.round((Number(n) || 0) * 100) / 100
export const suma = (filas, campo) => r2((filas ?? []).reduce((s, f) => s + (Number(typeof campo === 'function' ? campo(f) : f[campo]) || 0), 0))

/** Agrupa filas por una clave y suma un campo → [{ clave, total, n }] ordenado de mayor a menor. */
export function agruparSuma(filas, clave, campo = 'importe') {
  const m = new Map()
  for (const f of filas ?? []) {
    const k = (typeof clave === 'function' ? clave(f) : f[clave]) ?? 'Sin dato'
    const a = m.get(k) ?? { clave: k, total: 0, n: 0 }
    a.total += Number(f[campo]) || 0; a.n += 1
    m.set(k, a)
  }
  return [...m.values()].map(a => ({ ...a, total: r2(a.total) })).sort((a, b) => b.total - a.total)
}
/** Participación porcentual de cada grupo. */
export const conParticipacion = grupos => {
  const t = grupos.reduce((s, g) => s + g.total, 0)
  return grupos.map(g => ({ ...g, pct: t ? Math.round((g.total / t) * 1000) / 10 : 0 }))
}
/** Variación porcentual contra el periodo anterior (null si no hay base). */
export const variacionPeriodo = (actual, anterior) => (Number(anterior) ? Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10 : null)
export const ticketPromedio = (total, n) => (n > 0 ? r2(total / n) : 0)
/** Ocupación de agenda: citas ocupadas / horas disponibles (ambos en la misma unidad). */
export const ocupacionPct = (ocupado, disponible) => (disponible > 0 ? Math.min(100, Math.round((ocupado / disponible) * 1000) / 10) : null)
/** Margen % = utilidad / ingresos. */
export const margenPct = (ingresos, gastos) => (ingresos > 0 ? Math.round(((ingresos - gastos) / ingresos) * 1000) / 10 : null)
/** Quejas por cada 100 atenciones. */
export const quejasPor100 = (quejas, atenciones) => (atenciones > 0 ? r2((quejas / atenciones) * 100) : null)
/** Productos bajo mínimo: existencia <= mínimo (en el mínimo o bajo, S30). */
export const inventarioBajo = filas => (filas ?? []).filter(f => ['bajo_minimo', 'sin_existencia', 'en_el_minimo'].includes(f.estado))
/** Serie diaria/mensual a partir de filas con fecha: agrupa por prefijo de fecha (7 = mes, 10 = día). */
export function serieTemporal(filas, campoFecha, campoValor, largo = 10) {
  const m = new Map()
  for (const f of filas ?? []) {
    const k = String(f[campoFecha] ?? '').slice(0, largo)
    if (k) m.set(k, (m.get(k) ?? 0) + (Number(f[campoValor]) || 0))
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, valor]) => ({ fecha, valor: r2(valor) }))
}
/** Top N con «Otros». */
export function topN(grupos, n = 5) {
  if (grupos.length <= n) return grupos
  const resto = grupos.slice(n)
  return [...grupos.slice(0, n), { clave: 'Otros', total: r2(resto.reduce((s, g) => s + g.total, 0)), n: resto.reduce((s, g) => s + g.n, 0) }]
}
