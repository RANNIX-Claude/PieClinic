// Rotación de personal: lógica pura del calendario mensual (semana lunes→domingo). Sin acceso a la base.
// Las filas vienen de la vista prp_rotacion_personal: una por empleado y día (sede_id null = descanso).

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Primer día (YYYY-MM-01) del mes de una fecha ISO. */
export const inicioMes = fecha => `${fecha.slice(0, 7)}-01`

/** Último día (YYYY-MM-DD) del mes de una fecha ISO. */
export function finMes(fecha) {
  const y = Number(fecha.slice(0, 4)), m = Number(fecha.slice(5, 7))
  return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate())
}

/** Suma n meses a un mes (cualquier fecha ISO) y devuelve YYYY-MM-01. */
export function sumaMeses(fecha, n) {
  const y = Number(fecha.slice(0, 4)), m = Number(fecha.slice(5, 7)) - 1 + n
  const d = new Date(Date.UTC(y, m, 1))
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

/** Semanas del mes (lunes primero). Cada celda es una fecha ISO o null (relleno fuera del mes). */
export function semanasDelMes(fecha) {
  const y = Number(fecha.slice(0, 4)), m = Number(fecha.slice(5, 7))
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // lunes = 0
  const celdas = [...Array(lead).fill(null), ...Array.from({ length: dias }, (_, i) => iso(y, m, i + 1))]
  while (celdas.length % 7) celdas.push(null)
  const semanas = []
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7))
  return semanas
}

/** Quiénes estuvieron en una sucursal cada día: { 'YYYY-MM-DD': [fila, …] } (excluye descansos y otras sucursales). */
export function personasPorDia(filas, sedeId) {
  const out = {}
  for (const f of filas) {
    if (!f.sede_id || f.sede_id !== sedeId) continue
    ;(out[f.fecha] ??= []).push(f)
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => String(a.nombre_completo).localeCompare(String(b.nombre_completo), 'es'))
  return out
}

/** Dónde estuvo una persona cada día: { 'YYYY-MM-DD': fila }. */
export function sedePorDia(filas, empleadoId) {
  const out = {}
  for (const f of filas) if (f.empleado_id === empleadoId) out[f.fecha] = f
  return out
}

/**
 * Resumen de una persona en el mes: días por sucursal (incluye descanso como null) y número de cambios de sucursal.
 * Devuelve { porSede: [{ sede_id, sede_nombre, dias }], descanso, cambios }.
 */
export function resumenPersona(filas) {
  const ord = [...filas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const mapa = new Map(); let descanso = 0, cambios = 0, prev
  for (const f of ord) {
    if (!f.sede_id) { descanso++; continue }
    const e = mapa.get(f.sede_id) ?? { sede_id: f.sede_id, sede_nombre: f.sede_nombre, dias: 0 }
    e.dias++; mapa.set(f.sede_id, e)
    if (prev && prev !== f.sede_id) cambios++
    prev = f.sede_id
  }
  return { porSede: [...mapa.values()].sort((a, b) => b.dias - a.dias), descanso, cambios }
}

/** Corridas consecutivas en la misma sucursal (para el listado): [{ sede_id, sede_nombre, desde, hasta, dias, fuente }]. */
export function tramos(filas) {
  const ord = [...filas].filter(f => f.sede_id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const out = []
  for (const f of ord) {
    const u = out[out.length - 1]
    const sigue = u && u.sede_id === f.sede_id && siguienteDia(u.hasta) === f.fecha
    if (sigue) { u.hasta = f.fecha; u.dias++ } else out.push({ sede_id: f.sede_id, sede_nombre: f.sede_nombre, desde: f.fecha, hasta: f.fecha, dias: 1, fuente: f.fuente })
  }
  return out
}

function siguienteDia(fecha) { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }

export const FUENTES = {
  cobertura: 'Cobertura asignada', autoelegida: 'Eligió su sucursal', programada: 'Programada', gerente: 'Asignada por gerente',
  checador: 'Por checador', sistema: 'Sistema', horario: 'Horario semanal', base: 'Sucursal de contrato', descanso: 'Descanso',
}
