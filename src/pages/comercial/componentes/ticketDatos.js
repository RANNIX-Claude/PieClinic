// Carga los datos de un ticket (venta, líneas, pagos) para imprimirlo.
import QRCode from 'qrcode'
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
  // Logo de la clínica (si tiene) o el de la aplicación, con URL absoluta (la ventana del ticket no hereda la base de la página).
  const logo = org?.logo_url && /^https?:/.test(org.logo_url) ? org.logo_url : `${window.location.origin}${import.meta.env.BASE_URL}logo-ticket.png`
  // QR real del ticket (el token con el que se factura); si falla, el ticket sale sin QR pero con el token impreso.
  const qr = d.venta.qr_token ? await QRCode.toDataURL(String(d.venta.qr_token), { margin: 0, width: 240, errorCorrectionLevel: 'M' }).catch(() => null) : null
  return imprimirHtml(ticketHtml({ org, sede, venta: d.venta, lineas: d.lineas, pagos: d.pagos, copia, logo, qr }))
}
