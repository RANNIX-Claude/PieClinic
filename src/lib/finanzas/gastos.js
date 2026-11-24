// Reglas de captura de gasto (P-093, P-095, E105/E106) y del fondo revolvente.
import { PARAMETROS_DEFAULT, TOLERANCIA_TICKET, TOLERANCIA_CORTE_CAJA } from './constantes.js'

const r2 = n => Math.round((Number(n) || 0) * 100) / 100
/** ¿El gasto exige comprobante fiscal (factura/CFDI)? Desde el umbral inclusive (>=). */
export const requiereComprobante = (total, umbral = PARAMETROS_DEFAULT.comprobante_gasto_desde) => r2(total) >= Number(umbral)
/** Suma del detalle (líneas) vs total del ticket. */
export function cuadreTicket(lineas, ticketTotal) {
  const suma = r2((lineas ?? []).reduce((s, l) => s + (Number(l.importe ?? (Number(l.cantidad ?? 1) * Number(l.precio_unitario ?? 0))) || 0), 0))
  const diferencia = r2(suma - Number(ticketTotal || 0))
  return { suma, diferencia, cuadra: Math.abs(diferencia) <= TOLERANCIA_TICKET }
}
/** Validación de formulario de gasto → lista de errores legibles (la BD es la autoridad). */
export function validarGasto(g, { umbralComprobante = PARAMETROS_DEFAULT.comprobante_gasto_desde, fondo, rubrosFondo } = {}) {
  const e = []
  if (!g.fecha) e.push('Indica la fecha del gasto.')
  if (!(Number(g.total) > 0)) e.push('El total debe ser mayor a cero.')
  if (!g.sede_id) e.push('Selecciona la sede.')
  if (!g.grupo_id) e.push('Selecciona la categoría (grupo de gasto).')
  if (!g.proveedor_id && !String(g.proveedor_nombre ?? '').trim()) e.push('Indica el proveedor.')
  if (requiereComprobante(g.total, umbralComprobante) && !g.factura_url && !g.cfdi_uuid) e.push(`Desde ${umbralComprobante} MXN se exige comprobante fiscal (factura o CFDI).`)
  if (g.pagado_por_empleado && !g.pagado_por_id) e.push('Indica qué empleado pagó el gasto.')
  if (g.origen === 'fondo') {
    if (!fondo) e.push('La sede no tiene fondo revolvente activo.')
    if (rubrosFondo && g.grupo_id && !rubrosFondo.includes(g.grupo_id)) e.push('Este rubro no se puede pagar con el fondo (p. ej. comisiones bancarias).')
  }
  if (g.lineas?.length && g.ticket_total != null && !cuadreTicket(g.lineas, g.ticket_total).cuadra) e.push('La suma del detalle no coincide con el total del ticket.')
  return e
}
/** De un total con IVA incluido a subtotal/iva. */
export function desglosarIVA(total, tasa = PARAMETROS_DEFAULT.iva_tasa_general) {
  const t = r2(total), subtotal = r2(t / (1 + tasa / 100))
  return { subtotal, iva: r2(t - subtotal), total: t }
}
/** Uso del fondo: % usado y alerta (fondo_alerta_pct). */
export function usoFondo(monto, gastado, alertaPct = PARAMETROS_DEFAULT.fondo_alerta_pct) {
  const pct = monto > 0 ? Math.round((gastado / monto) * 1000) / 10 : 0
  return { pct, disponible: r2(monto - gastado), alerta: pct >= alertaPct, agotado: gastado >= monto }
}
/** Cierre del fondo: efectivo contado vs esperado (monto − gastado). Diferencia mayor a la tolerancia de caja → requiere Administrador. */
export function diferenciaCierreFondo(monto, gastado, contado, tolerancia = TOLERANCIA_CORTE_CAJA) {
  const esperado = r2(monto - gastado), diferencia = r2(contado - esperado)
  return { esperado, diferencia, requiereAdmin: Math.abs(diferencia) > tolerancia }
}
