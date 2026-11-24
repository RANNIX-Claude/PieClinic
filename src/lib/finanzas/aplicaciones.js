// Aplicaciones de pago (clon de IRP aplicaciones_pago): un ingreso se distribuye entre cuentas por cobrar
// y NUNCA excede el importe del ingreso ni el saldo de cada cuenta (app.c_aplicacion_chk).
import { TOLERANCIA_APLICACION } from './constantes.js'

const r2 = n => Math.round((Number(n) || 0) * 100) / 100
export const sumaAplicada = aplicaciones => r2((aplicaciones ?? []).reduce((s, a) => s + (Number(a.importe_aplicado ?? a.importe) || 0), 0))

/**
 * Valida una distribución propuesta.
 * @param ingreso      { importe, paciente_id?, es_reembolso? }
 * @param aplicaciones [{ cuenta_id, importe_aplicado }]
 * @param cuentas      { [cuenta_id]: { importe, cobrado, estado, paciente_id? } }  (cobrado = ya aplicado por OTROS ingresos)
 * @returns { ok, errores[], aplicado, sobrante }
 */
export function validarAplicaciones(ingreso, aplicaciones, cuentas = {}) {
  const errores = []
  const imp = r2(ingreso?.importe)
  if (ingreso?.es_reembolso) errores.push('Un reembolso no se aplica a cuentas por cobrar.')
  const aplicado = sumaAplicada(aplicaciones)
  if (aplicado > imp + TOLERANCIA_APLICACION) errores.push(`La distribución excede el cobro: el ingreso es de ${imp.toFixed(2)} y se aplican ${aplicado.toFixed(2)} (sobran ${r2(aplicado - imp).toFixed(2)}).`)
  const porCuenta = {}
  for (const a of aplicaciones ?? []) {
    const m = r2(a.importe_aplicado ?? a.importe)
    if (!(m > 0)) { errores.push('Cada aplicación debe ser mayor a cero.'); continue }
    porCuenta[a.cuenta_id] = r2((porCuenta[a.cuenta_id] ?? 0) + m)
  }
  for (const [id, m] of Object.entries(porCuenta)) {
    const c = cuentas[id]
    if (!c) { errores.push('Cuenta por cobrar inexistente.'); continue }
    if (c.estado === 'cancelada') errores.push('La cuenta por cobrar está cancelada.')
    if (ingreso?.paciente_id && c.paciente_id && ingreso.paciente_id !== c.paciente_id) errores.push('El cobro y la cuenta son de pacientes distintos.')
    const saldo = r2(c.importe - (c.cobrado ?? 0))
    if (m > saldo + TOLERANCIA_APLICACION) errores.push(`Lo aplicado (${m.toFixed(2)}) excede el saldo de la cuenta (${saldo.toFixed(2)}).`)
  }
  return { ok: errores.length === 0, errores, aplicado, sobrante: r2(imp - aplicado) }
}

/** Reparte `importe` en el orden dado de cuentas (más antigua primero) sin exceder saldos: sugerencia automática. */
export function autoDistribuir(importe, cuentasOrdenadas) {
  let resto = r2(importe)
  const out = []
  for (const c of cuentasOrdenadas) {
    if (resto <= 0) break
    const saldo = r2(c.importe - (c.cobrado ?? 0))
    if (saldo <= 0) continue
    const m = Math.min(saldo, resto)
    out.push({ cuenta_id: c.id, importe_aplicado: m })
    resto = r2(resto - m)
  }
  return { aplicaciones: out, sobrante: resto }
}

/** Estado de una cuenta por cobrar según lo aplicado (espejo de app.c_aplicacion_ai). */
export function estadoCuentaCobrar(importe, aplicado, cancelada = false) {
  if (cancelada) return 'cancelada'
  if (aplicado >= importe - TOLERANCIA_APLICACION) return 'cobrada'
  return aplicado > 0 ? 'parcial' : 'pendiente'
}
/** Clasificación del ingreso a partir de las de sus cuentas; la manual no se pisa. */
export function clasificarIngreso(clasificacionesCuentas, { manual = false, actual = null } = {}) {
  if (manual && actual) return actual
  const u = [...new Set(clasificacionesCuentas ?? [])]
  if (!u.length) return actual
  return u.length === 1 ? u[0] : 'mixto'
}
/** Antigüedad de una cuenta por cobrar: 'reciente' | 'pendiente' | 'en_mora' (umbrales 7 y 30 días). */
export function antiguedadCobrar(dias, { reciente = 7, mora = 30 } = {}) {
  return dias <= reciente ? 'reciente' : dias <= mora ? 'pendiente' : 'en_mora'
}
