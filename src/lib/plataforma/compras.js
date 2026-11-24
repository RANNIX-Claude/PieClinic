// Lógica pura de compras e inventario (sin React ni red). Reglas: P-081, P-079/P-085 (costo promedio ponderado), E94-E96.
export const UMBRAL_AUTORIZACION_DEFAULT = 5000

const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const r2 = v => Math.round((n(v) + Number.EPSILON) * 100) / 100

/** ¿La orden exige autorización de Administración? (total >= umbral; «desde $5,000» se aplica como >=, ver C_resumen). */
export function requiereAutorizacion(total, umbral = UMBRAL_AUTORIZACION_DEFAULT) {
  return n(umbral) > 0 && n(total) >= n(umbral)
}

/** Estado de autorización de una OC: 'no_requiere' | 'pendiente' | 'autorizada'. La autorización se pierde si cambia el total. */
export function estadoAutorizacion({ total, umbral = UMBRAL_AUTORIZACION_DEFAULT, autorizadaPor, totalAutorizado }) {
  if (!requiereAutorizacion(total, umbral)) return 'no_requiere'
  if (autorizadaPor && totalAutorizado != null && r2(totalAutorizado) === r2(total)) return 'autorizada'
  return 'pendiente'
}

/** ¿Se puede enviar la OC al proveedor? Con autorización pendiente, no. */
export function puedeEnviarOC(oc) {
  if (!oc || oc.estado !== 'borrador') return { ok: false, motivo: 'Solo se envía una orden en borrador' }
  if (!(oc.lineas?.length)) return { ok: false, motivo: 'La orden no tiene partidas' }
  if (estadoAutorizacion(oc) === 'pendiente') return { ok: false, motivo: 'Requiere autorización de Administración por el monto' }
  return { ok: true }
}

/** Totales de una OC. lineas: [{cantidad, costo_unitario, descuento?, iva_pct?}] */
export function totalesOC(lineas = [], ivaPctDefault = 16) {
  let subtotal = 0, iva = 0
  for (const l of lineas) {
    const base = n(l.cantidad) * n(l.costo_unitario) - n(l.descuento)
    subtotal += base
    iva += base * (l.iva_pct == null ? n(ivaPctDefault) : n(l.iva_pct)) / 100
  }
  return { subtotal: r2(subtotal), iva: r2(iva), total: r2(subtotal + iva) }
}

/** Costo promedio ponderado tras una entrada. Existencia negativa o cero → el costo de la entrada. */
export function costoPromedio(existencia, costoActual, cantidadEntrada, costoEntrada) {
  const e = n(existencia), q = n(cantidadEntrada)
  if (q <= 0) return n(costoActual)
  if (e <= 0) return n(costoEntrada)
  return Math.round(((e * n(costoActual) + q * n(costoEntrada)) / (e + q)) * 10000) / 10000
}

/** Variación % del costo de entrada contra el costo promedio actual (null si no hay base). */
export function variacionCosto(costoActual, costoNuevo) {
  if (!n(costoActual)) return null
  return Math.round(((n(costoNuevo) - n(costoActual)) / n(costoActual)) * 10000) / 100
}

/** Estado derivado de la OC según lo recibido. lineas: [{cantidad, recibida}] */
export function estadoRecepcion(lineas = []) {
  const pedido = lineas.reduce((s, l) => s + n(l.cantidad), 0)
  const recibido = lineas.reduce((s, l) => s + Math.min(n(l.recibida), n(l.cantidad)), 0)
  if (!pedido || recibido <= 0) return 'enviada'
  return recibido >= pedido ? 'recibida' : 'recibida_parcial'
}

/** Estado de existencia (S30). */
export function estadoExistencia({ existencia, minimo, proximaCaducidadDias, diasAlertaCaducidad = 30 }) {
  const e = n(existencia)
  if (e <= 0) return 'sin_existencia'
  if (minimo != null && e < n(minimo)) return 'bajo_minimo'
  if (minimo != null && e === n(minimo)) return 'en_el_minimo'
  if (proximaCaducidadDias != null && proximaCaducidadDias <= diasAlertaCaducidad) return 'caduca_pronto'
  return 'ok'
}

/** Sugerencia de pedido: lleva la existencia al máximo (o al doble del mínimo si no hay máximo). */
export function cantidadSugerida({ existencia, minimo, maximo }) {
  const meta = maximo != null && n(maximo) > 0 ? n(maximo) : n(minimo) * 2
  return Math.max(0, Math.ceil(meta - n(existencia)))
}

/** Diferencias de un traspaso: lineas [{enviada, recibida}] → solo donde difiere. */
export function diferenciasTraspaso(lineas = []) {
  return lineas.map((l, indice) => ({ indice, diferencia: n(l.recibida) - n(l.enviada) })).filter(d => d.diferencia !== 0)
}

/**
 * Sugerencia de traspaso: para cada producto del destino por debajo del mínimo, lleva el destino al máximo (o al doble del mínimo)
 * sin pedir más de lo que hay en el origen. filasDestino: [{producto_id, existencia, minimo, maximo}]; existenciaOrigen: { producto_id: n }.
 */
export function sugerirTraspaso(filasDestino = [], existenciaOrigen = {}) {
  const out = []
  for (const f of filasDestino) {
    if (!(n(f.minimo) > 0) || n(f.existencia) >= n(f.minimo)) continue
    const disp = Math.floor(n(existenciaOrigen[f.producto_id]))
    const cantidad = Math.min(cantidadSugerida(f), disp)
    if (cantidad > 0) out.push({ producto_id: f.producto_id, cantidad })
  }
  return out
}

/** Línea de OC con descuento e IVA aplicados una sola vez (CA-21): espejo de las columnas generadas de oc_lineas. */
export function importeLineaOC({ cantidad, costo_unitario, descuento_pct = 0, iva_pct = 16 }) {
  const baseNeta = r2(n(cantidad) * n(costo_unitario) * (1 - n(descuento_pct) / 100))
  const iva = r2(baseNeta * n(iva_pct) / 100)
  return { base_neta: baseNeta, iva_monto: iva, importe: r2(baseNeta + iva) }
}

/** Totales de OC con la misma regla de la BD (por línea redondeada). descuento = ahorro por % de descuento. */
export function totalesOCPorLinea(lineas = []) {
  let subtotal = 0, iva = 0, descuento = 0
  for (const l of lineas) {
    const x = importeLineaOC(l)
    subtotal += n(l.cantidad) * n(l.costo_unitario); iva += x.iva_monto; descuento += n(l.cantidad) * n(l.costo_unitario) - x.base_neta
  }
  return { subtotal: r2(subtotal), descuento: r2(descuento), iva: r2(iva), total: r2(subtotal - descuento + iva) }
}
