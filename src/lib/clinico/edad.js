// Cálculo de edad y reglas ligadas a la edad (P-005: menores de 18 → tutor; a los 18 se pide nueva firma).
// Funciones puras: aceptan 'YYYY-MM-DD' (columna date) y una fecha de referencia opcional para poder probarlas.

const partes = v => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : [v.getFullYear(), v.getMonth() + 1, v.getDate()]
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Edad en años cumplidos, o null si la fecha no es válida o es futura. */
export function calcularEdad(fechaNacimiento, hoy = new Date()) {
  const n = partes(fechaNacimiento), h = partes(hoy)
  if (!n || !h) return null
  let e = h[0] - n[0]
  if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) e--
  return e < 0 ? null : e
}

/** Meses cumplidos (para bebés y para «8 meses»). */
export function calcularMeses(fechaNacimiento, hoy = new Date()) {
  const n = partes(fechaNacimiento), h = partes(hoy)
  if (!n || !h) return null
  let m = (h[0] - n[0]) * 12 + (h[1] - n[1])
  if (h[2] < n[2]) m--
  return m < 0 ? null : m
}

export const esMenorDeEdad = (fechaNacimiento, hoy) => {
  const e = calcularEdad(fechaNacimiento, hoy)
  return e !== null && e < 18
}

/** «51 años», «1 año», «8 meses»; '—' si no hay fecha. */
export function textoEdad(fechaNacimiento, hoy) {
  const e = calcularEdad(fechaNacimiento, hoy)
  if (e === null) return '—'
  if (e >= 1) return `${e} ${e === 1 ? 'año' : 'años'}`
  const m = calcularMeses(fechaNacimiento, hoy) ?? 0
  return `${m} ${m === 1 ? 'mes' : 'meses'}`
}

/** ¿Cumple 18 años dentro de `dias` días o ya los cumplió sin renovar firma? (P-005: pedir nueva firma en la siguiente visita). */
export function requiereFirmaPropiaPorMayoriaDeEdad(fechaNacimiento, firmoTutorHasta, hoy = new Date()) {
  const e = calcularEdad(fechaNacimiento, hoy)
  return e !== null && e >= 18 && Boolean(firmoTutorHasta)
}

/** ¿Hoy es el cumpleaños dentro de los próximos `dias` días (incluye hoy)? Maneja 29 de febrero como 28/feb en años no bisiestos. */
export function diasParaCumpleanos(fechaNacimiento, hoy = new Date()) {
  const n = partes(fechaNacimiento), h = partes(hoy)
  if (!n || !h) return null
  const esBisiesto = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const objetivo = anio => {
    const dia = n[1] === 2 && n[2] === 29 && !esBisiesto(anio) ? 28 : n[2]
    return Date.UTC(anio, n[1] - 1, dia)
  }
  const base = Date.UTC(h[0], h[1] - 1, h[2])
  let d = Math.round((objetivo(h[0]) - base) / 86400000)
  if (d < 0) d = Math.round((objetivo(h[0] + 1) - base) / 86400000)
  return d
}
