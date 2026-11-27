// Pestaña «Pedidos» de Caja: anticipos por cobrar de pedidos solicitados y pedidos recibidos listos para entregar con cobro del saldo.
// El cobro es el mismo de la pantalla Pedidos (ModalCobroPedido): exige el turno abierto de esta caja. No toca el cobro normal de tickets ni el modo sin internet.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DataTable from '../../../components/ui/DataTable'
import { moneda, fecha } from '../../../lib/formato'
import { useEnLinea } from '../../comercial/componentes/comun'
import { useLectura, EstadoPedido, Semaforo } from './comun'
import ModalCobroPedido from './ModalCobroPedido'

export default function CajaPedidos({ turno }) {
  const enLinea = useEnLinea()
  const q = useLectura('caja-pedidos', 'prp_pedidos_especiales', { orden: [{ columna: 'created_at', asc: true }], limite: 500 })
  const [cobro, setCobro] = useState(null)
  const porCobrar = useMemo(() => q.filas.filter(p => p.estado === 'solicitado' && Number(p.anticipo_monto) > 0), [q.filas])
  const porNota = useMemo(() => { const m = new Map(); for (const p of porCobrar) m.set(p.nota_id, [...(m.get(p.nota_id) ?? []), p]); return [...m].map(([nota, ps]) => ({ id: nota, nota, folio: ps[0].nota_folio, paciente_nombre: ps[0].paciente_nombre, sede_id: ps[0].sede_id, pedidos: ps.map(p => p.folio).join(', '), anticipo: ps.reduce((s, p) => s + Number(p.anticipo_monto), 0), saldo: ps.reduce((s, p) => s + Number(p.saldo), 0) })) }, [porCobrar])
  const entregables = useMemo(() => q.filas.filter(p => p.estado === 'recibido'), [q.filas])
  const bloqueado = !turno || !enLinea
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!turno && <div className="card text-muted" style={{ fontSize: 13 }}>Abre el turno de caja para cobrar anticipos y entregar pedidos.</div>}
      {!enLinea && <div className="card text-red" role="alert" style={{ fontSize: 13 }}>Sin internet no se cobran anticipos ni entregas de pedidos: espera a tener conexión (el cobro normal de tickets sigue funcionando sin internet).</div>}
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Anticipos por cobrar</h3>
        <DataTable sinPaginacion buscador={false} cargando={q.cargando} filas={porNota}
          columnas={[
            { key: 'folio', label: 'Nota', render: n => <b>{n.folio}</b> }, { key: 'paciente_nombre', label: 'Cliente' }, { key: 'pedidos', label: 'Pedidos' },
            { key: 'anticipo', label: 'Anticipo', align: 'right', render: n => <b>{moneda(n.anticipo)}</b> }, { key: 'saldo', label: 'Saldo después', align: 'right', render: n => moneda(n.saldo) },
            { key: 'acc', label: '', sortable: false, exportar: false, render: n => <button className="btn sm" disabled={bloqueado} onClick={() => setCobro({ modo: 'anticipo', nota: n.nota, sede: n.sede_id })}>Cobrar anticipo</button> },
          ]} vacio={{ title: 'Sin anticipos por cobrar', description: 'Los pedidos nuevos aparecen aquí hasta que se cobra su anticipo.' }} />
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Listos para entregar</h3>
        <DataTable sinPaginacion buscador={false} cargando={q.cargando} filas={entregables}
          columnas={[
            { key: 'folio', label: 'Pedido', render: p => <Link to={`/pedidos/${p.id}`}><b>{p.folio}</b></Link> }, { key: 'paciente_nombre', label: 'Cliente' }, { key: 'estado', label: 'Etapa', render: p => <EstadoPedido estado={p.estado} /> },
            { key: 'saldo', label: 'Saldo', align: 'right', render: p => <b>{moneda(p.saldo)}</b> }, { key: 'plazo_saldo', label: 'Plazo del saldo', render: p => <>{fecha(p.plazo_saldo)} <Semaforo valor={p.semaforo} dias={p.dias_retraso} /></> },
            { key: 'acc', label: '', sortable: false, exportar: false, render: p => <button className="btn sm" disabled={bloqueado} onClick={() => setCobro({ modo: 'entrega', pedido: p })}>Entregar y cobrar saldo</button> },
          ]} vacio={{ title: 'Nada por entregar', description: 'Aquí aparecen los pedidos que ya recibió la sucursal.' }} />
      </div>
      {cobro && <ModalCobroPedido modo={cobro.modo} nota={cobro.nota} pedido={cobro.pedido} sedeId={cobro.sede ?? cobro.pedido?.sede_id} onClose={() => setCobro(null)} />}
    </div>
  )
}
