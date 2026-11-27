// Detalle de un ticket para validarlo: datos, conceptos, pagos con sus referencias (autorización, rastreo, voucher) y cuadre de importes.
import { useEffect, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import StatusBadge from '../../../components/ui/StatusBadge'
import { fechaHora, moneda } from '../../../lib/formato'
import { suma, redondear } from '../../../lib/comercial/dinero'
import { verComprobante } from '../../finanzas/componentes/SubirComprobante'
import { cargarTicket } from './ticketDatos'

const ETQ = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia SPEI', clip: 'Clip', gift_card: 'Gift card', cortesia: 'Cortesía', anticipo: 'Anticipo' }
const ETQ_REF = { tarjeta: 'Autorización', transferencia: 'Clave de rastreo', clip: 'ID Clip', gift_card: 'Código', cortesia: 'Motivo' }
const th = { textAlign: 'left', fontSize: 11.5, color: 'var(--text-muted, #666)', fontWeight: 600, padding: '4px 6px', borderBottom: '1px solid var(--border)' }
const td = { padding: '5px 6px', fontSize: 13, borderBottom: '1px solid var(--border)' }
const der = { textAlign: 'right', whiteSpace: 'nowrap' }

function Cuadre({ ok, children }) {
  return <div style={{ fontSize: 12.5, color: ok ? 'var(--green, #1a7f4b)' : 'var(--red, #c0392b)', fontWeight: 600 }}>{ok ? '✔' : '⚠'} {children}</div>
}

export default function CajaTicketDetalle({ venta, onClose }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    let vivo = true
    setD(null)
    if (venta) cargarTicket(venta.id).then(r => { if (vivo) setD(r) })
    return () => { vivo = false }
  }, [venta?.id])

  const v = d?.venta ?? venta
  const lineas = d?.lineas ?? [], pagos = d?.pagos ?? []
  const sumaLineas = suma(lineas.map(l => l.importe))
  const sumaPagos = suma(pagos.map(p => p.monto))
  const cuadraLineas = d && Math.abs(redondear(sumaLineas) - redondear(Number(v?.total))) < 0.011
  const cuadraPagos = d && Math.abs(redondear(sumaPagos) - redondear(Number(v?.total))) < 0.011

  return (
    <Modal open={!!venta} onClose={onClose} title={`Ticket ${venta?.folio ?? ''}`} size="wide" footer={<button type="button" className="btn" onClick={onClose}>Cerrar</button>}>
      {!d && <div className="text-muted">Cargando detalle…</div>}
      {d?.error && <div className="text-red">No se pudo cargar el detalle: {d.error.message}</div>}
      {d && !d.error && v && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', fontSize: 13 }}>
            <span><b>Fecha:</b> {fechaHora(v.cobrada_en ?? v.created_at)}</span>
            <span><b>Estado:</b> <StatusBadge estado={v.estado} /></span>
            <span><b>Cajero:</b> {v.cajero_nombre ?? '—'}</span>
            <span><b>Cliente:</b> {v.paciente_nombre ?? 'Cliente general'}</span>
            <span><b>Atendió:</b> {v.podologo_nombre ?? '—'}</span>
            {v.motivo_cancelacion && <span className="text-red"><b>Cancelado:</b> {v.motivo_cancelacion}</span>}
          </div>

          <div>
            <h3 style={{ margin: '0 0 4px' }}>Conceptos</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Concepto</th><th style={{ ...th, ...der }}>Cant.</th><th style={{ ...th, ...der }}>Precio</th><th style={{ ...th, ...der }}>Descuento</th><th style={{ ...th, ...der }}>Importe</th></tr></thead>
              <tbody>
                {lineas.map(l => (
                  <tr key={l.id}>
                    <td style={td}>{l.descripcion}{l.descuento_motivo ? <div className="text-muted" style={{ fontSize: 11.5 }}>Descuento: {l.descuento_motivo}</div> : null}</td>
                    <td style={{ ...td, ...der }}>{Number(l.cantidad)}</td>
                    <td style={{ ...td, ...der }}>{moneda(l.precio_unitario)}</td>
                    <td style={{ ...td, ...der }}>{Number(l.descuento) > 0 ? `-${moneda(l.descuento)}` : '—'}</td>
                    <td style={{ ...td, ...der }}>{moneda(l.importe)}</td>
                  </tr>))}
                {!lineas.length && <tr><td style={td} colSpan={5} className="text-muted">Sin conceptos.</td></tr>}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', fontSize: 13, marginTop: 6 }}>
              <div>Subtotal {moneda(v.subtotal)}{Number(v.descuento_total) > 0 ? ` · Descuento -${moneda(v.descuento_total)}` : ''} · IVA incluido {moneda(v.iva_total)}</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Total {moneda(v.total)}</div>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 4px' }}>Pagos</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Método</th><th style={th}>Referencia</th><th style={{ ...th, ...der }}>Monto</th><th style={{ ...th, ...der }}>Recibido</th><th style={{ ...th, ...der }}>Cambio</th><th style={th}>Voucher</th></tr></thead>
              <tbody>
                {pagos.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{ETQ[p.metodo] ?? p.metodo}{p.ultimos4 ? ` ****${p.ultimos4}` : ''}</td>
                    <td style={td}>{p.referencia ? `${ETQ_REF[p.metodo] ?? 'Ref.'}: ${p.referencia}` : (['tarjeta', 'transferencia'].includes(p.metodo) ? <span className="text-red">sin referencia</span> : '—')}</td>
                    <td style={{ ...td, ...der }}>{moneda(p.monto)}</td>
                    <td style={{ ...td, ...der }}>{p.metodo === 'efectivo' && p.efectivo_recibido != null ? moneda(p.efectivo_recibido) : '—'}</td>
                    <td style={{ ...td, ...der }}>{Number(p.cambio) > 0 ? moneda(p.cambio) : '—'}</td>
                    <td style={td}>{p.comprobante_path ? <button type="button" className="btn o sm" onClick={() => verComprobante(p.comprobante_path)}>Ver foto</button> : (p.metodo === 'tarjeta' ? <span className="text-muted">sin foto</span> : '—')}</td>
                  </tr>))}
                {!pagos.length && <tr><td style={td} colSpan={6} className="text-muted">Sin pagos registrados.</td></tr>}
              </tbody>
            </table>
          </div>

          {v.estado !== 'cancelada' && (
            <div>
              <Cuadre ok={cuadraLineas}>Conceptos {moneda(sumaLineas)} {cuadraLineas ? '= total del ticket' : `≠ total ${moneda(v.total)}`}</Cuadre>
              <Cuadre ok={cuadraPagos}>Pagos {moneda(sumaPagos)} {cuadraPagos ? '= total del ticket' : `≠ total ${moneda(v.total)}`}</Cuadre>
            </div>)}
        </div>)}
    </Modal>
  )
}
