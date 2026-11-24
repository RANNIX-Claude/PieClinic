// Cálculo de líneas, descuentos, PIN e IVA de un ticket. Refleja app.venta_linea_bi / venta_recalcular (026).
import { redondear, suma } from './dinero.js'

/** Una línea: importe bruto, descuento (pct + monto), importe con IVA incluido, base neta e IVA (P-056/P-057). */
export function calcularLinea({ cantidad = 1, precio_unitario = 0, descuento_pct = 0, descuento_monto = 0, iva_tipo = 'exento' }) {
  const importe_bruto = redondear(Number(cantidad) * Number(precio_unitario))
  const descuento = Math.min(importe_bruto, redondear(redondear(importe_bruto * Number(descuento_pct) / 100) + Number(descuento_monto || 0)))
  const importe = redondear(importe_bruto - descuento)
  let base_neta = importe, iva_monto = 0
  if (String(iva_tipo) === '16') { base_neta = redondear(importe / 1.16); iva_monto = redondear(importe - base_neta) }
  return { importe_bruto, descuento, importe, base_neta, iva_monto }
}

/** Porcentaje efectivo de descuento de una línea. */
export const pctEfectivo = ({ importe_bruto, descuento }) => (importe_bruto > 0 ? (descuento / importe_bruto) * 100 : 0)

/** ¿Requiere PIN de Administrador? Recepción puede hasta el máximo (10 %); el administrador nunca lo necesita (P-055). */
export function requierePin({ pct, maxPct = 10, esAdmin = false }) {
  if (esAdmin) return false
  return Number(pct) > Number(maxPct) + 0.005
}

/** Valida un descuento antes de guardarlo: motivo obligatorio y PIN si pasa del límite. */
export function validarDescuento({ pct, motivo, maxPct = 10, esAdmin = false, autorizado = false, rol }) {
  if (rol === 'podologo') return { ok: false, error: 'El podólogo no aplica descuentos' }
  if (!(Number(pct) > 0)) return { ok: true }
  if (!String(motivo ?? '').trim()) return { ok: false, error: 'Todo descuento exige motivo' }
  if (requierePin({ pct, maxPct, esAdmin }) && !autorizado) return { ok: false, pin: true, error: `Más de ${maxPct} % requiere PIN de Administrador` }
  return { ok: true }
}

/** Totales del ticket a partir de sus líneas; el anticipo aplicado reduce lo que hay que cobrar. */
export function totalesVenta(lineas, { anticipo = 0, pagos = [] } = {}) {
  const calc = lineas.map(l => ({ ...l, ...calcularLinea(l) }))
  const subtotal = suma(calc.map(l => l.importe_bruto))
  const descuento_total = suma(calc.map(l => l.descuento))
  const iva_total = suma(calc.map(l => l.iva_monto))
  const total = suma(calc.map(l => l.importe))
  const anticipo_aplicado = Math.min(redondear(anticipo), total)
  const a_cobrar = redondear(total - anticipo_aplicado)
  const pagado = suma(pagos.map(p => p.monto))
  return { lineas: calc, subtotal, descuento_total, iva_total, total, anticipo_aplicado, a_cobrar, pagado, saldo: redondear(a_cobrar - pagado) }
}

/** Reparte un descuento global entre las líneas igual que aplicar_descuento_global (la última recibe el resto). */
export function repartirDescuentoGlobal(lineas, tipo, valor) {
  const brutos = lineas.map(l => calcularLinea({ ...l, descuento_pct: 0, descuento_monto: 0 }).importe_bruto)
  const total = suma(brutos)
  if (tipo === 'pct') return lineas.map(l => ({ ...l, descuento_pct: Number(valor), descuento_monto: 0 }))
  let resto = Math.min(Number(valor) || 0, total)
  return lineas.map((l, i) => {
    const asig = i === lineas.length - 1 ? resto : Math.min(resto, redondear((Number(valor) * brutos[i]) / (total || 1)))
    resto = redondear(resto - asig)
    return { ...l, descuento_pct: 0, descuento_monto: asig }
  })
}

/** Cambio de un pago en efectivo. */
export const cambio = (recibido, monto) => (Number(recibido) >= Number(monto) ? redondear(recibido - monto) : 0)

/** Lo que falta por cubrir con pagos. */
export const faltante = (total, pagos) => redondear(Number(total) - suma(pagos.map(p => p.monto)))
