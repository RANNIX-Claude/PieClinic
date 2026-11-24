// Ticket imprimible de 80 mm (y corte de caja). Se arma como HTML y se imprime en una ventana aparte.
import { moneda, fechaHora } from '../../../lib/formato'

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fila = (izq, der, negrita) => `<div class="f${negrita ? ' b' : ''}"><span>${esc(izq)}</span><span>${esc(der)}</span></div>`
const ETQ_METODO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', clip: 'Clip', gift_card: 'Gift card', cortesia: 'Cortesía', anticipo: 'Anticipo' }

const CSS = `@page{size:80mm auto;margin:3mm}body{font:12px/1.35 "Courier New",monospace;width:74mm;margin:0 auto;color:#000}
.c{text-align:center}.f{display:flex;justify-content:space-between;gap:6px}.b{font-weight:700}hr{border:0;border-top:1px dashed #000;margin:5px 0}
.copia{border:2px solid #000;text-align:center;font-weight:700;margin:4px 0;padding:2px}.q{border:1px solid #000;width:60px;height:60px;margin:6px auto;display:flex;align-items:center;justify-content:center;font-size:9px}`

/** HTML del ticket. `copia` = 'COPIA 1' en reimpresiones (P-060). */
export function ticketHtml({ org, sede, venta, lineas, pagos, copia }) {
  const total = Number(venta.total)
  const cuerpo = [
    `<div class="c b">${esc((org?.nombre ?? '').toUpperCase())}</div>`,
    `<div class="c">${esc(sede?.nombre ?? venta.sede_nombre ?? '')}${sede?.direccion ? ` · ${esc(sede.direccion)}` : ''}</div>`,
    sede?.telefono ? `<div class="c">Tel. ${esc(sede.telefono)}</div>` : '',
    '<hr>',
    fila(`TICKET ${venta.folio ?? ''}`, fechaHora(venta.cobrada_en ?? venta.created_at)),
    `<div>Caja: ${esc(venta.cajero_nombre ?? '')}</div>`,
    venta.paciente_nombre ? `<div>Paciente: ${esc(venta.paciente_nombre)}</div>` : '',
    venta.podologo_nombre ? `<div>Atendió: ${esc(venta.podologo_nombre)}</div>` : '',
    copia ? `<div class="copia">${esc(copia)} — NO ES ORIGINAL</div>` : '',
    '<hr>',
    ...lineas.map(l => `${fila(`${Number(l.cantidad)} ${l.descripcion ?? ''}`, moneda(l.importe_bruto).replace('$', ''))}${Number(l.descuento) > 0 ? fila('  descuento', '-' + moneda(l.descuento).replace('$', '')) : ''}`),
    '<hr>',
    fila('SUBTOTAL', moneda(venta.subtotal)),
    Number(venta.descuento_total) > 0 ? fila('DESCUENTO', '-' + moneda(venta.descuento_total)) : '',
    fila('IVA incluido', moneda(venta.iva_total)),
    fila('TOTAL', moneda(total), true),
    '<hr>',
    ...pagos.map(p => fila(`${ETQ_METODO[p.metodo] ?? p.metodo}${p.ultimos4 ? ` ****${p.ultimos4}` : ''}`, (p.metodo === 'anticipo' ? '-' : '') + moneda(p.metodo === 'efectivo' && p.efectivo_recibido ? p.efectivo_recibido : p.monto))),
    ...pagos.filter(p => Number(p.cambio) > 0).map(p => fila('Cambio', moneda(p.cambio))),
    '<hr>',
    '<div class="c">Para facturar presente este ticket</div>',
    `<div class="q">QR ${esc(venta.qr_token ?? '')}</div>`,
    '<div class="c">¡Gracias por su visita!</div>',
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
  setTimeout(() => { w.print() }, 250)
  return true
}
