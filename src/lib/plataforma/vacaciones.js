// Vacaciones (P-110). Espejo de public.vacaciones_dias_ley: 12 días el primer año (parámetro), +2 por año hasta el 5.º,
// luego +2 cada 5 años (reforma «Vacaciones dignas» 2023). Validar con asesoría laboral.
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export function diasLey(aniosServicio, primerAnio = 12) {
  const a = Math.max(1, Math.floor(n(aniosServicio)))
  if (a <= 1) return primerAnio
  if (a <= 5) return primerAnio + 2 * (a - 1)
  return primerAnio + 8 + 2 * Math.ceil((a - 5) / 5)
}

/** Años de servicio que corresponden al año calendario `anio` (misma fórmula de la BD: anio − año de ingreso, mínimo 1). */
export function aniosServicioEnAnio(fechaIngreso, anio) {
  const ing = fechaIngreso ? Number(String(fechaIngreso).slice(0, 4)) : anio - 1
  return Math.max(1, anio - ing)
}

export const diasDerechoAnio = (fechaIngreso, anio, primerAnio = 12) => diasLey(aniosServicioEnAnio(fechaIngreso, anio), primerAnio)

/** Días entre dos fechas (inclusive), sin domingos por defecto y sin festivos indicados. */
export function diasSolicitados(desde, hasta, { excluirDomingos = true, festivos = [] } = {}) {
  let d = Date.parse(desde)
  const fin = Date.parse(hasta)
  let c = 0
  if (!(fin >= d)) return 0
  for (; d <= fin; d += 86400000) {
    const f = new Date(d), iso = f.toISOString().slice(0, 10)
    if (excluirDomingos && f.getUTCDay() === 0) continue
    if (festivos.includes(iso)) continue
    c++
  }
  return c
}

/** Valida una solicitud contra el saldo y los traslapes. existentes: [{desde,hasta,estado}] del mismo empleado. */
export function validarSolicitud({ desde, hasta, dias, saldo, existentes = [] }) {
  const errores = []
  if (!desde || !hasta || hasta < desde) errores.push('Las fechas no son válidas')
  if (dias <= 0) errores.push('La solicitud no incluye días laborables')
  if (dias > n(saldo)) errores.push(`Solo hay ${n(saldo)} día(s) disponibles`)
  const choca = existentes.find(e => ['solicitada', 'autorizada', 'tomada'].includes(e.estado) && e.desde <= hasta && e.hasta >= desde)
  if (choca) errores.push(`Se traslapa con otra solicitud (${choca.desde} a ${choca.hasta})`)
  return { ok: errores.length === 0, errores }
}

/** Saldo: derecho − (autorizadas + tomadas). */
export function saldoVacaciones(diasDerecho, detalle = []) {
  const usados = detalle.filter(d => ['autorizada', 'tomada'].includes(d.estado)).reduce((s, d) => s + n(d.dias), 0)
  return { usados, disponibles: n(diasDerecho) - usados }
}

/** Prima vacacional (25 % mínimo legal) sobre los días tomados. */
export const primaVacacional = (dias, sueldoDiario, pct = 25) => Math.round(n(dias) * n(sueldoDiario) * pct) / 100
