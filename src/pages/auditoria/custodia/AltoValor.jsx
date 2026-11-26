// PIEZAS DE ALTO VALOR (F5.3): el número de serie es por PIEZA (no por modelo). Se registran al recibirlas o desde aquí; entran a la custodia del relevo
// (con el tope duro de 30 por sucursal) y su VENTA dispara una alerta inmediata al dueño: qué pieza, qué serie, qué sucursal y a qué precio.
// Quien captura registra piezas pero NO ve cuántas «debería» haber ni las ventas: eso es lo que el sistema espera.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Gem, RefreshCw } from 'lucide-react'
import FormField from '../../../components/ui/FormField'
import Tabs from '../../../components/ui/Tabs'
import EmptyState from '../../../components/ui/EmptyState'
import StatusBadge from '../../../components/ui/StatusBadge'
import { usePermiso } from '../../../lib/permisos'
import { moneda, fechaHora } from '../../../lib/formato'
import { nuevoId, registrarPieza, listarPiezas, listarVentasAltoValor, revisarVentasAltoValor, productosEscaneables } from '../../../lib/auditoria/custodiaApi'
import { NOMBRE_ESTADO_PIEZA, normalizarSerie } from '../../../lib/auditoria/custodia'
import { listar } from '../../../lib/auditoria/api'
import { errMsg, useDatos, EstadoConsulta } from '../comun'
import { SelectorSucursal, useSucursalInicial, grande } from './comunCustodia'

export default function AltoValor() {
  const revisa = usePermiso('auditoria.investigar')
  const [tab, setTab] = useState('registrar')
  const [sucursal, setSucursal] = useSucursalInicial()
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'registrar', label: 'Registrar pieza' }, { id: 'piezas', label: 'Piezas con serie', oculto: !revisa }, { id: 'ventas', label: 'Ventas de alto valor', oculto: !revisa },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'registrar' && <Registrar sucursal={sucursal} setSucursal={setSucursal} />}
        {tab === 'piezas' && revisa && <Piezas />}
        {tab === 'ventas' && revisa && <Ventas />}
      </div>
    </>
  )
}

function Registrar({ sucursal, setSucursal }) {
  const [id, setId] = useState(() => nuevoId())
  const [producto, setProducto] = useState('')
  const [serie, setSerie] = useState('')
  const prods = useDatos(['ctl-prod-escaneables-serie'], () => productosEscaneables())
  const conSerie = useMemo(() => (prods.data?.data ?? []).filter(p => p.requiere_serie), [prods.data])
  async function enviar() {
    const r = await registrarPieza({ id, sucursalId: sucursal, productoId: producto, serie })
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    toast.success(`Pieza con serie ${normalizarSerie(serie)} registrada`); setId(nuevoId()); setSerie('')
  }
  return (
    <div className="card" style={{ padding: 14, maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}><Gem size={16} style={{ verticalAlign: -3 }} /> Registrar una pieza con número de serie</h3>
      <div className="hint" style={{ marginBottom: 8 }}>La serie es de <b>esta pieza</b>, no del modelo: dos piezas del mismo modelo llevan series distintas. Una serie no se registra dos veces.</div>
      <SelectorSucursal value={sucursal} onChange={setSucursal} />
      <EstadoConsulta q={prods} />
      <FormField label="Producto controlado por serie" as="select" value={producto} onChange={e => setProducto(e.target.value)}
        options={[{ value: '', label: conSerie.length ? 'Seleccione…' : 'No hay productos con serie: el dueño los marca en Catálogo de control' }, ...conSerie.map(p => ({ value: p.id, label: p.descripcion }))]} />
      <FormField label="Número de serie" value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} />
      <button className="btn" style={{ ...grande, width: '100%', marginTop: 8 }} disabled={!producto || !serie.trim() || !sucursal} onClick={enviar}>Registrar pieza</button>
    </div>
  )
}

function useNombres() {
  const prods = useDatos(['ctl-prod-nombres'], () => productosEscaneables())
  const sedes = useDatos(['ctl-sedes'], () => listar('v_ctl_sucursales', { limite: 100 }))
  return useMemo(() => ({
    prod: Object.fromEntries((prods.data?.data ?? []).map(p => [p.id, p.descripcion])),
    suc: Object.fromEntries((sedes.data?.data ?? []).map(s => [s.id, s.nombre])),
  }), [prods.data, sedes.data])
}

function Piezas() {
  const [estado, setEstado] = useState('')
  const q = useDatos(['ctl-piezas', estado], () => listarPiezas({ estado: estado || null }))
  const n = useNombres()
  const filas = q.data?.data ?? []
  return (
    <>
      <FormField label="Estado" as="select" value={estado} onChange={e => setEstado(e.target.value)} options={[{ value: '', label: 'Todas' }, ...Object.entries(NOMBRE_ESTADO_PIEZA).map(([value, label]) => ({ value, label }))]} />
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && !filas.length && <EmptyState title="Sin piezas con serie" description="Se registran al recibirlas (Recepción) o desde «Registrar pieza»." />}
      {filas.length > 0 && <div className="tabla-wrap"><table className="tabla">
        <thead><tr><th>Serie</th><th>Pieza</th><th>Sucursal</th><th>Estado</th><th>Alta</th><th>Vendida</th></tr></thead>
        <tbody>{filas.map(z => (
          <tr key={z.id}><td><b>{z.numero_serie}</b></td><td>{n.prod[z.producto_id] ?? '—'}</td><td>{n.suc[z.sucursal_id] ?? '—'}</td>
            <td><StatusBadge variante={z.estado === 'en_sucursal' ? 'v' : 'n'} label={NOMBRE_ESTADO_PIEZA[z.estado]} /></td><td>{fechaHora(z.alta_en)}</td><td>{z.vendida_en ? fechaHora(z.vendida_en) : '—'}</td></tr>))}</tbody>
      </table></div>}
    </>
  )
}

function Ventas() {
  const qc = useQueryClient()
  const q = useDatos(['ctl-ventas-av'], () => listarVentasAltoValor({}))
  const n = useNombres()
  const [ocupado, setOcupado] = useState(false)
  async function revisar() {
    setOcupado(true)
    const r = await revisarVentasAltoValor(72)
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success(r.data.ventas_nuevas ? `${r.data.ventas_nuevas} venta(s) nueva(s) de alto valor: se avisó al dueño` : 'Sin ventas nuevas de alto valor')
    qc.invalidateQueries({ queryKey: ['ctl-ventas-av'] })
  }
  const filas = q.data?.data ?? []
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>
        La venta de una pieza de alto valor avisa de inmediato al dueño. Mientras el punto de venta no emita su evento, el sistema revisa las ventas por poleo (planificador o este botón).
      </div>
      <button className="btn" onClick={revisar} disabled={ocupado}><RefreshCw size={14} style={{ verticalAlign: -2 }} /> {ocupado ? 'Revisando…' : 'Revisar ventas ahora'}</button>
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && !filas.length && <EmptyState title="Sin ventas de alto valor" description="Aquí aparecerá cada venta de una pieza marcada como alto valor, con su serie, sucursal y precio." />}
      {filas.length > 0 && <div className="tabla-wrap" style={{ marginTop: 10 }}><table className="tabla">
        <thead><tr><th>Cuándo</th><th>Pieza</th><th>Serie</th><th>Sucursal</th><th>Precio</th><th>Ticket</th></tr></thead>
        <tbody>{filas.map(v => (
          <tr key={v.id}><td>{fechaHora(v.vendida_en ?? v.creado_en)}</td><td>{n.prod[v.producto_id] ?? '—'}</td>
            <td>{v.numero_serie ?? (v.candidatas?.length ? <span className="hint">sin determinar: {v.candidatas.join(', ')}</span> : <span className="text-red">sin serie registrada</span>)}</td>
            <td>{n.suc[v.sucursal_id] ?? '—'}</td><td>{moneda(v.precio)}</td><td>{v.ticket ?? '—'}</td></tr>))}</tbody>
      </table></div>}
    </>
  )
}
