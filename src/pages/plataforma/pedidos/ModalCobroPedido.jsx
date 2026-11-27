// Cobro de un pedido especial en Caja: ANTICIPO (al solicitar) y ENTREGA con cobro del SALDO (el anticipo se aplica como pago «anticipo»).
// Lo usan la pantalla Pedidos y la pestaña «Pedidos» de Caja. Escribe solo por RPC (pedido_cobrar_anticipo / pedido_entregar): exigen turno abierto del cajero.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import { moneda } from '../../../lib/formato'
import { redondear } from '../../../lib/comercial/dinero'
import { useLectura, useAccionPedido, useTurnoAbierto } from './comun'

const METODOS = [{ value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'clip', label: 'Clip (terminal)' }]

function AvisoTurno({ turno, cargando }) {
  if (cargando || turno) return null
  return <div className="card" role="alert" style={{ borderLeft: '4px solid var(--red)', marginBottom: 10, fontSize: 13 }}>No tienes un turno de caja abierto en esta sucursal. <Link to="/caja">Abre tu turno en Caja</Link> y vuelve a intentarlo.</div>
}

/** modo «anticipo»: `nota` = id de la nota; modo «entrega»: `pedido` = fila de prp_pedidos_especiales. */
export default function ModalCobroPedido({ modo, nota, pedido, sedeId, onClose, onListo }) {
  const { correr, ocupado } = useAccionPedido()
  const hijos = useLectura('cobro-nota', 'prp_pedidos_especiales', { sedeId: null, sedeCol: false, filtros: { nota_id: nota } }, modo === 'anticipo' && !!nota)
  const pendientes = useMemo(() => hijos.filas.filter(p => p.estado === 'solicitado' && !p.anticipo_id && Number(p.anticipo_monto) > 0), [hijos.filas])
  const sede = sedeId ?? pedido?.sede_id ?? hijos.filas[0]?.sede_id
  const { turno, cargando } = useTurnoAbierto(sede)
  const [metodo, setMetodo] = useState('efectivo')
  const [ref, setRef] = useState('')
  const [recibido, setRecibido] = useState('')
  const anticipo = redondear(pendientes.reduce((s, p) => s + Number(p.anticipo_monto), 0))
  const saldo = Number(pedido?.saldo ?? 0)
  const [pagos, setPagos] = useState(() => [{ metodo: 'efectivo', monto: String(saldo || ''), recibido: '' }])
  const base = modo === 'anticipo' ? anticipo : saldo
  const sumaPagos = redondear(pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0))
  const cambio = modo === 'anticipo' ? Number(recibido) - anticipo : null

  const cobrarAnticipo = async () => {
    const r = await correr('pedido_cobrar_anticipo', { p_nota: nota, p_metodo: metodo, p_referencia: ref || null, p_efectivo_recibido: metodo === 'efectivo' && recibido ? Number(recibido) : null }, 'Anticipo cobrado')
    if (r) { onListo?.(r); onClose() }
  }
  const entregar = async () => {
    const lista = pagos.filter(p => Number(p.monto) > 0).map(p => ({ metodo: p.metodo, monto: Number(p.monto), ...(p.metodo === 'efectivo' && p.recibido ? { efectivo_recibido: Number(p.recibido) } : {}) }))
    const r = await correr('pedido_entregar', { p_pedido: pedido.id, p_pagos: lista }, 'Pedido entregado y saldo cobrado')
    if (r) { onListo?.(r); onClose() }
  }
  const setPago = (i, c) => setPagos(ps => ps.map((p, j) => (j === i ? { ...p, ...c } : p)))

  return (
    <Modal open onClose={onClose} size="sm" title={modo === 'anticipo' ? 'Cobrar anticipo del pedido' : `Entregar ${pedido?.folio} y cobrar el saldo`} cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button>
        {modo === 'anticipo'
          ? <button className="btn" disabled={ocupado || !turno || anticipo <= 0 || (metodo === 'efectivo' && recibido !== '' && cambio < 0)} onClick={cobrarAnticipo}>Cobrar {moneda(anticipo)}</button>
          : <button className="btn" disabled={ocupado || !turno || Math.abs(sumaPagos - saldo) > 0.005} onClick={entregar}>{saldo > 0 ? `Cobrar ${moneda(saldo)} y entregar` : 'Entregar (sin saldo)'}</button>}</>}>
      <AvisoTurno turno={turno} cargando={cargando} />
      {modo === 'anticipo' ? (
        <>
          <div className="card" style={{ marginBottom: 10 }}>
            {pendientes.map(p => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{p.folio} · {p.proveedor_nombre} <small className="text-muted">({p.anticipo_pct} % de {moneda(p.total)})</small></span><b>{moneda(p.anticipo_monto)}</b></div>)}
            {pendientes.length === 0 && !hijos.cargando && <div className="text-muted" style={{ fontSize: 13 }}>No hay anticipo pendiente en esta nota.</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}><b>Anticipo a cobrar</b><b>{moneda(anticipo)}</b></div>
          </div>
          <FormField label="Método de pago" as="select" value={metodo} onChange={e => setMetodo(e.target.value)} options={METODOS} />
          {metodo === 'efectivo'
            ? <FormField label="Efectivo recibido" type="number" min="0" step="0.01" value={recibido} onChange={e => setRecibido(e.target.value)} hint={recibido !== '' ? (cambio >= 0 ? `Cambio ${moneda(cambio)}` : 'No cubre el anticipo') : 'Opcional: para calcular el cambio'} />
            : <FormField label="Referencia / autorización" value={ref} onChange={e => setRef(e.target.value)} />}
          <div className="text-muted" style={{ fontSize: 12 }}>El anticipo queda ligado a los pedidos de la nota; el saldo queda por cobrar con su fecha límite. El efectivo entra al corte del turno.</div>
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total del pedido</span><b>{moneda(pedido.total)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Anticipo aplicado ({pedido.anticipo_folio ?? 'anticipo'})</span><b>−{moneda(pedido.anticipo_monto)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}><b>Saldo a cobrar</b><b>{moneda(saldo)}</b></div>
          </div>
          {saldo > 0 && pagos.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr auto', gap: 6, alignItems: 'end', marginBottom: 6 }}>
              <FormField label={i === 0 ? 'Método' : undefined} as="select" value={p.metodo} onChange={e => setPago(i, { metodo: e.target.value })} options={METODOS} />
              <FormField label={i === 0 ? 'Monto' : undefined} type="number" min="0" step="0.01" value={p.monto} onChange={e => setPago(i, { monto: e.target.value })} />
              {pagos.length > 1 ? <button type="button" className="btn o sm" aria-label="Quitar pago" onClick={() => setPagos(ps => ps.filter((_, j) => j !== i))}><Trash2 size={13} /></button> : <span />}
              {p.metodo === 'efectivo' && <div style={{ gridColumn: '1 / -1' }}><FormField label="Efectivo recibido" type="number" min="0" step="0.01" value={p.recibido} onChange={e => setPago(i, { recibido: e.target.value })} hint={p.recibido !== '' && Number(p.monto) > 0 ? (Number(p.recibido) >= Number(p.monto) ? `Cambio ${moneda(Number(p.recibido) - Number(p.monto))}` : 'No cubre el monto') : undefined} /></div>}
            </div>))}
          {saldo > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="btn o sm" onClick={() => setPagos(ps => [...ps, { metodo: 'tarjeta', monto: String(Math.max(redondear(saldo - sumaPagos), 0)), recibido: '' }])}><Plus size={13} /> Dividir pago</button>
            <span style={{ fontSize: 13 }} className={Math.abs(sumaPagos - saldo) > 0.005 ? 'text-red' : undefined}>Suman {moneda(sumaPagos)} de {moneda(saldo)}</span></div>}
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Se genera el ticket de la entrega (con las características del producto especial) con el anticipo aplicado; la pieza sale del inventario de la sucursal y el pedido se cierra.</div>
        </>
      )}
      {base <= 0 && modo === 'anticipo' && !hijos.cargando && null}
    </Modal>
  )
}
