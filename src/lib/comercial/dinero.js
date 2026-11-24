// Dinero y redondeo comercial (P-057): 2 decimales, medio hacia arriba, sin errores de coma flotante.
export const centavos = n => Math.round(Number((Number(n || 0) * 100).toFixed(6)))
/** Redondeo comercial a 2 decimales (0.005 sube). */
export const redondear = n => Math.sign(Number(n) || 0) * (Math.round(Number((Math.abs(Number(n) || 0) * 100).toFixed(6))) / 100)
export const suma = (...xs) => redondear(xs.flat().reduce((a, b) => a + (Number(b) || 0), 0))
