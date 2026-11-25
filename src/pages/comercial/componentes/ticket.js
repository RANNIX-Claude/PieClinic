// Ticket imprimible de 80 mm (y corte de caja). Se arma como HTML y se imprime en una ventana aparte.
import { moneda, fechaHora } from '../../../lib/formato'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fila = (izq, der, negrita) => `<div class="f${negrita ? ' b' : ''}"><span>${esc(izq)}</span><span>${esc(der)}</span></div>`
const ETQ_METODO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', clip: 'Clip', gift_card: 'Gift card', cortesia: 'Cortesía', anticipo: 'Anticipo' }

const CSS = `@page{size:80mm auto;margin:2mm}*{box-sizing:border-box}body{font:11.5px/1.4 "Courier New",monospace;width:72mm;margin:0 auto;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.c{text-align:center}.f{display:flex;justify-content:space-between;gap:6px}.f span:first-child{flex:1;min-width:0;word-break:break-word}.f span:last-child{white-space:nowrap}.b{font-weight:700}hr{border:0;border-top:1px dashed #000;margin:6px 0}
.logo{display:block;margin:2px auto 4px;max-width:34mm;max-height:20mm;object-fit:contain}.nom{font-size:14px;font-weight:700;letter-spacing:.3px}.sm{font-size:10.5px}
.folio{text-align:center;font-size:13px;font-weight:700;margin:2px 0}.copia{border:2px solid #000;text-align:center;font-weight:700;margin:4px 0;padding:2px}
.tot{font-size:16px;font-weight:700;margin:3px 0}.det{font-size:10.5px;padding-left:10px}.qr{display:block;margin:6px auto 2px;width:30mm;height:30mm;image-rendering:pixelated}.tok{font-size:9px;word-break:break-all}`

/** HTML del ticket. `copia` = 'COPIA 1' en reimpresiones (P-060). `logo` = URL absoluta del logo; `qr` = imagen (data URL) del QR del ticket. */
export function ticketHtml({ org, sede, venta, lineas, pagos, copia, logo, qr }) {
  const total = Number(venta.total)
  const pagoLinea = p => fila(`${ETQ_METODO[p.metodo] ?? p.metodo}${p.ultimos4 ? ` ****${p.ultimos4}` : ''}`, (p.metodo === 'anticipo' ? '-' : '') + moneda(p.metodo === 'efectivo' && p.efectivo_recibido ? p.efectivo_recibido : p.monto))
  const cuerpo = [
    logo ? `<img class="logo" src="${esc(logo)}" alt="">` : '',
    `<div class="c nom">${esc((org?.nombre ?? '').toUpperCase())}</div>`,
    `<div class="c sm">${esc(sede?.nombre ?? venta.sede_nombre ?? '')}</div>`,
    sede?.direccion ? `<div class="c sm">${esc(sede.direccion)}</div>` : '',
    sede?.telefono ? `<div class="c sm">Tel. ${esc(sede.telefono)}</div>` : '',
    '<hr>',
    `<div class="folio">TICKET ${esc(venta.folio ?? '')}</div>`,
    `<div class="c sm">${esc(fechaHora(venta.cobrada_en ?? venta.created_at))}</div>`,
    `<div class="sm">Cajero: ${esc(venta.cajero_nombre ?? '')}</div>`,
    `<div class="sm">Cliente: ${esc(venta.paciente_nombre ?? "Cliente general")}</div>`,
    venta.podologo_nombre ? `<div class="sm">Atendió: ${esc(venta.podologo_nombre)}</div>` : '',
    copia ? `<div class="copia">${esc(copia)} — NO ES ORIGINAL</div>` : '',
    '<hr>',
    ...lineas.map(l => {
      const cant = Number(l.cantidad)
      return `${fila(l.descripcion ?? '', moneda(l.importe_bruto).replace('$', ''))}${cant !== 1 ? `<div class="det">${cant} × ${moneda(l.precio_unitario).replace('$', '')}</div>` : ''}${Number(l.descuento) > 0 ? fila('  descuento', '-' + moneda(l.descuento).replace('$', '')) : ''}`
    }),
    '<hr>',
    fila('Subtotal', moneda(venta.subtotal)),
    Number(venta.descuento_total) > 0 ? fila('Descuento', '-' + moneda(venta.descuento_total)) : '',
    fila('IVA incluido', moneda(venta.iva_total)),
    `<div class="f tot"><span>TOTAL</span><span>${moneda(total)}</span></div>`,
    '<hr>',
    ...pagos.map(pagoLinea),
    ...pagos.filter(p => Number(p.cambio) > 0).map(p => fila('Cambio', moneda(p.cambio), true)),
    '<hr>',
    qr ? `<img class="qr" src="${esc(qr)}" alt="QR del ticket">` : '',
    venta.qr_token ? `<div class="c tok">${esc(venta.qr_token)}</div>` : '',
    '<div class="c sm">Para facturar presente este ticket</div>',
    '<div class="c b" style="margin-top:4px">¡Gracias por su visita!</div>',
  ].join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${esc(venta.folio)}</title><style>${CSS}</style></head><body>${cuerpo}</body></html>`
}

/** HTML del corte de caja del turno. */
export function corteHtml({ org, sede, turno, resumen, contado, diferencia, justificacion }) {
  const r = resumen
  const cuerpo = [
    `<div class="c b">${esc((org?.nombre ?? '').toUpperCase())}</div>`, `<div class="c">CORTE DE CAJA · ${esc(sede?.nombre ?? turno.sede_nombre ?? '')}</div>`,
    `<div class="c">${esc(turno.caja)} · ${esc(turno.nombre_turno ?? '')}</div>`, `<div class="c">${fechaHora(turno.apertura_en)} – ${fechaHora(turno.cierre_en ?? new Date())}</div>`,
    `<div>Cajero: ${esc(turno.cajero_nombre ?? '')}</div>`, '<hr>',
    fila('Fondo inicial', moneda(r.fondo_inicial)), fila('Efectivo', moneda(r.ventas_efectivo)), fila('Tarjeta', moneda(r.ventas_tarjeta)), fila('Transferencia', moneda(r.ventas_transferencia)),
    fila('Clip', moneda(r.ventas_clip)), fila('Gift card', moneda(r.ventas_gift_card)), fila('Anticipos aplicados*', moneda(r.anticipos_aplicados)), fila('Cortesías', moneda(r.cortesias)),
    fila('Retiros / gastos', '-' + moneda(r.retiros)), fila('Cancelaciones efectivo', '-' + moneda(r.cancelaciones_efectivo)), '<hr>',
    fila('Ventas del turno', moneda(r.ventas_total), true), fila('Efectivo esperado', moneda(r.efectivo_esperado), true),
    contado != null ? fila('Efectivo contado', moneda(contado), true) : '', diferencia != null ? fila('Diferencia', moneda(diferencia), true) : '',
    justificacion ? `<div>Justificación: ${esc(justificacion)}</div>` : '', '<hr>', '<div>*No es dinero del turno.</div>', '<br><div class="c">______________________<br>Firma del cajero</div>',
  ].join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Corte de caja</title><style>${CSS}</style></head><body>${cuerpo}</body></html>`
}

/** Abre una ventana, escribe el HTML y lanza la impresión. Debe llamarse desde un clic (si no, el navegador bloquea la ventana). */
export function imprimirHtml(html) {
  const w = window.open('', '_blank', 'width=380,height=640')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  w.focus()
  const imgs = () => Promise.all([...w.document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
  Promise.race([imgs(), new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(() => w.print(), 150))
  return true
}
