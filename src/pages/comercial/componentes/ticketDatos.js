// Carga los datos de un ticket (venta, líneas, pagos) para imprimirlo.
import { leer, leerUno } from '../../../lib/api'
import { ticketHtml, imprimirHtml } from './ticket'

export async function cargarTicket(ventaId) {
  const [v, l, p] = await Promise.all([
    leerUno('prp_ventas', { id: ventaId }),
    leer('prp_venta_lineas', { sedeCol: false, filtros: { venta_id: ventaId }, orden: { columna: 'orden' } }),
    leer('pagos', { sedeCol: false, filtros: { venta_id: ventaId }, orden: { columna: 'created_at' } }),
  ])
  const error = v.error ?? l.error ?? p.error
  return { venta: v.data, lineas: l.data, pagos: p.data, error }
}

/** Imprime el ticket (con marca «COPIA n» si es reimpresión). Devuelve false si el navegador bloqueó la ventana. */
export async function imprimirTicketDe(ventaId, { org, sede, copia } = {}) {
  const d = await cargarTicket(ventaId)
  if (d.error || !d.venta) return false
  return imprimirHtml(ticketHtml({ org, sede, venta: d.venta, lineas: d.lineas, pagos: d.pagos, copia }))
}
