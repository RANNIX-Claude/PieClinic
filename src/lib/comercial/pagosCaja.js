// Lógica pura de los pagos de la caja (sin React), para poder probar todas las combinaciones de botones.
// Un pago: { clave, metodo, monto, auto, recibido, referencia, ultimos4, codigoGift, gift }.
// «auto» = el pago que absorbe la diferencia: sigue al total y a lo que los demás pagos ya cubren.
// Todas las funciones devuelven un arreglo nuevo de pagos ya ajustado (nunca lo mutan).
import { redondear, suma } from './dinero.js'

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const montoDe = p => num(p.monto)

let _n = 0
export const nuevaClavePago = () => `p${++_n}`

/** total − pagos (positivo = falta; negativo = se pasó). */
export const saldoPagos = (pagos, total) => redondear(num(total) - suma(pagos.map(montoDe)))

// Si el efectivo «recibido» seguía al monto, lo sigue; si ya no alcanza para el nuevo monto, se vuelve a capturar.
function sincRecibido(p, nuevo) {
  if (p.metodo !== 'efectivo' || p.recibido === '' || p.recibido == null) return p.recibido
  const r = num(p.recibido)
  if (r === montoDe(p)) return String(nuevo)
  if (r < nuevo) return ''
  return p.recibido
}

/** Hace que el pago automático cubra lo que falta (o quede en 0 si los demás ya cubren el total). */
export function ajustarAuto(pagos, total) {
  const autos = pagos.filter(p => p.auto)
  if (autos.length !== 1) return pagos
  const a = autos[0]
  const otros = suma(pagos.filter(p => p !== a).map(montoDe))
  const nuevo = Math.max(0, redondear(num(total) - otros))
  if (montoDe(a) === nuevo) return pagos
  return pagos.map(p => (p !== a ? p : { ...p, monto: nuevo, recibido: sincRecibido(p, nuevo) }))
}

/** Agrega un método (si ya está, no hace nada). El primero es automático; los siguientes toman lo que falte. */
export function agregarPago(pagos, metodo, total, clave = nuevaClavePago()) {
  if (pagos.some(p => p.metodo === metodo)) return pagos
  const falta = Math.max(0, saldoPagos(pagos, total))
  return ajustarAuto([...pagos, { clave, metodo, auto: !pagos.some(p => p.auto), monto: falta, referencia: '', recibido: '', ultimos4: '', codigoGift: '', gift: null }], total)
}

/** Quita un pago. Si ya no queda uno automático, el último que quede pasa a serlo para que el total siga cubierto. */
export function quitarPago(pagos, clave, total) {
  let ps = pagos.filter(p => p.clave !== clave)
  if (ps.length && !ps.some(p => p.auto)) ps = ps.map((p, i) => (i === ps.length - 1 ? { ...p, auto: true } : p))
  return ajustarAuto(ps, total)
}

/** Pulsar un método ya elegido lo quita; si no estaba, lo agrega. */
export function alternarMetodo(pagos, metodo, total, clave) {
  const p = pagos.find(x => x.metodo === metodo)
  return p ? quitarPago(pagos, p.clave, total) : agregarPago(pagos, metodo, total, clave)
}

/** Teclear el monto de un pago: queda fijo y el automático (si lo hay) absorbe la diferencia. */
export function fijarMonto(pagos, clave, valor, total) {
  const m = Math.max(0, redondear(num(valor)))
  return ajustarAuto(pagos.map(p => (p.clave === clave ? { ...p, monto: m, auto: false } : p)), total)
}

/** «Completar»: el pago se queda con lo que falta además de lo que ya tenía. */
export function completarPago(pagos, clave, total) {
  const p = pagos.find(x => x.clave === clave)
  if (!p) return pagos
  return fijarMonto(pagos, clave, Math.max(0, redondear(montoDe(p) + saldoPagos(pagos, total))), total)
}

/**
 * Efectivo recibido (botones $100… o campo «Recibido»).
 *  · Con otro método automático ya elegido: lo recibido se aplica al total (hasta lo que no cubren los demás pagos fijos) y el automático se queda con la diferencia.
 *  · Efectivo solo y se recibe menos que su monto: eso es lo que se paga en efectivo y el resto va con otro método.
 *  · Se recibe de más: el monto no cambia y se da cambio.
 */
export function fijarRecibido(pagos, clave, valor, total) {
  const p = pagos.find(x => x.clave === clave)
  if (!p || p.metodo !== 'efectivo') return pagos
  const s = valor == null ? '' : String(valor)
  const n = num(s)
  const conRecibido = pagos.map(x => (x.clave === clave ? { ...x, recibido: s } : x))
  if (s === '' || n <= 0) return conRecibido
  const fijosOtros = suma(pagos.filter(x => x.clave !== clave && !x.auto).map(montoDe))
  const hayAuto = pagos.some(x => x.clave !== clave && x.auto)
  let monto
  if (hayAuto) monto = Math.max(0, Math.min(n, redondear(num(total) - fijosOtros)))
  else if (n < montoDe(p)) monto = n
  else return conRecibido
  let ps = conRecibido.map(x => (x.clave === clave ? { ...x, monto, auto: false } : x))
  // El efectivo quedó fijo: si hay otros métodos y ninguno es automático, el último agregado se queda con la diferencia.
  if (!ps.some(x => x.auto)) {
    let i = -1
    ps.forEach((x, j) => { if (x.clave !== clave) i = j })
    if (i >= 0) ps = ps.map((x, j) => (j === i ? { ...x, auto: true } : x))
  }
  return ajustarAuto(ps, total)
}

/** Botón «Exacto»: lo recibido es justo el monto del efectivo. */
export function recibirExacto(pagos, clave) {
  const p = pagos.find(x => x.clave === clave)
  return p && p.metodo === 'efectivo' ? pagos.map(x => (x.clave === clave ? { ...x, recibido: String(montoDe(p)) } : x)) : pagos
}

/** Revisión de los pagos antes de cobrar. Devuelve el texto del error o null. */
export function validarPagos(pagos, total, { moneda = n => `$${Number(n).toFixed(2)}`, etiqueta = m => m } = {}) {
  const saldo = saldoPagos(pagos, total)
  if (!pagos.length && num(total) > 0) return `Elige cómo paga (faltan ${moneda(total)})`
  if (saldo > 0) return `Los pagos no cubren el total (faltan ${moneda(saldo)})`
  if (saldo < 0) return `Los pagos suman ${moneda(-saldo)} de más: quita un método de pago o baja su monto`
  for (const p of pagos) {
    if (!(montoDe(p) > 0)) return `${etiqueta(p.metodo)} no tiene monto: captura cuánto se paga con ese método o quítalo`
    if (p.metodo === 'efectivo' && p.recibido !== '' && p.recibido != null && num(p.recibido) < montoDe(p)) return 'El efectivo recibido es menor al monto del efectivo'
    if (p.metodo === 'tarjeta' && !String(p.referencia ?? '').trim()) return 'Captura la autorización de la tarjeta'
    if (p.metodo === 'transferencia' && !String(p.referencia ?? '').trim()) return 'Captura la clave de rastreo de la transferencia'
    if (p.metodo === 'cortesia' && !String(p.referencia ?? '').trim()) return 'La cortesía exige motivo'
    if (p.metodo === 'gift_card' && (!p.gift || montoDe(p) > num(p.gift.saldo))) return 'Revisa la gift card (código y saldo)'
    if (p.metodo === 'clip' && !String(p.referencia ?? '').trim()) return 'Captura el ID de pago de Clip'
  }
  return null
}
