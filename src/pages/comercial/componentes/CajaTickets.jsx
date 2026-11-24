// Pestaña «Tickets del día»: lista, reimpresión marcada «copia», cancelación con motivo, retomar cuentas abiertas y facturar.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { rpc } from '../../../lib/api'
import { fechaHora, hoyISO, moneda } from '../../../lib/formato'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import KPICard from '../../../components/ui/KPICard'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { suma } from '../../../lib/comercial/dinero'
import { imprimirTicketDe } from './ticketDatos'
import { useLeer, AvisoError, textoError, rangoDias } from './comun'

export default function CajaTickets({ turno, onCambio, onRetomar }) {
  const { organizacion, sedeActiva } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const puedeCancelar = usePermiso('ventas.cancelar')
  const puedeFacturar = usePermiso('facturas.timbrar')
  const [dia, setDia] = useState(hoyISO())
  const [cancelar, setCancelar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [r0, r1] = rangoDias(dia, dia)
  const dia_ = useLeer('tickets-dia', 'prp_ventas', { filtros: { created_at: { gte: r0, lte: r1 } }, orden: { columna: 'created_at', asc: false }, limite: 500 })
  const abiertos = useLeer('tickets-abiertos', 'prp_ventas', { filtros: { estado: ['por_cobrar', 'cuenta_abierta'] }, orden: { columna: 'created_at', asc: false }, limite: 100 })
  const filas = [...abiertos.filas.filter(a => !dia_.filas.some(d => d.id === a.id)), ...dia_.filas]
  const cobradas = filas.filter(v => ['cobrada', 'por_facturar', 'facturada'].includes(v.estado))
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['comercial'] }); onCambio?.() }

  const copia = async v => {
    const { data, error } = await rpc('reimprimir_ticket', { p_venta: v.id })
    if (error) return toast.error(textoError(error))
    if (!(await imprimirTicketDe(v.id, { org: organizacion, sede: sedeActiva, copia: data }))) toast.error('El navegador bloqueó la ventana de impresión')
    refrescar()
  }
  const confirmarCancelar = async motivo => {
    setOcupado(true)
    const { error } = await rpc('cancelar_venta', { p_venta: cancelar.id, p_motivo: motivo })
    setOcupado(false); setCancelar(null)
    if (error) toast.error(textoError(error)); else { toast.success('Ticket cancelado'); refrescar() }
  }

  const columnas = [
    { key: 'folio', label: 'Ticket' }, { key: 'created_at', label: 'Hora', render: v => fechaHora(v.cobrada_en ?? v.created_at), valor: v => v.cobrada_en ?? v.created_at },
    { key: 'paciente_nombre', label: 'Paciente', render: v => v.paciente_nombre ?? 'Mostrador' }, { key: 'podologo_nombre', label: 'Atendió' },
    { key: 'cajero_nombre', label: 'Cajero', filtro: true }, { key: 'num_lineas', label: 'Conceptos', align: 'right' },
    { key: 'descuento_total', label: 'Descuento', align: 'right', render: v => (Number(v.descuento_total) ? moneda(v.descuento_total) : '—') },
    { key: 'total', label: 'Total', align: 'right', render: v => moneda(v.total), valor: v => Number(v.total) },
    { key: 'estado', label: 'Estado', render: v => <StatusBadge estado={v.estado} />, filtro: true },
    { key: 'acc', label: 'Acciones', sortable: false, exportar: false, render: v => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {['por_cobrar', 'cuenta_abierta'].includes(v.estado) && <button className="btn" onClick={() => onRetomar(v.id)}>Retomar</button>}
        {['cobrada', 'por_facturar', 'facturada'].includes(v.estado) && <button className="btn o" onClick={() => copia(v)}>Reimprimir (copia)</button>}
        {['cobrada', 'por_facturar'].includes(v.estado) && puedeFacturar && <button className="btn o" onClick={() => nav(`/facturacion?venta=${v.id}`)}>Facturar</button>}
        {puedeCancelar && v.estado !== 'cancelada' && <button className="btn red" onClick={() => setCancelar(v)}>Cancelar</button>}
        {v.estado === 'cancelada' && <span className="text-muted" style={{ fontSize: 12 }}>{v.motivo_cancelacion}</span>}
      </div>) },
  ]
  return (
    <div>
      <div className="grid-kpis" style={{ marginBottom: 10 }}>
        <KPICard title="Tickets cobrados" value={cobradas.length} loading={dia_.cargando} />
        <KPICard title="Vendido" value={moneda(suma(cobradas.map(v => v.total)))} color="var(--green)" loading={dia_.cargando} />
        <KPICard title="Cuentas abiertas" value={abiertos.filas.length} color="var(--gold)" loading={abiertos.cargando} />
        <KPICard title="Cancelados" value={filas.filter(v => v.estado === 'cancelada').length} color="var(--red)" loading={dia_.cargando} />
      </div>
      <div className="toolbar" style={{ marginBottom: 8 }}><label style={{ fontSize: 13 }}>Día <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} /></label>
        {turno && <span className="text-muted" style={{ fontSize: 12.5 }}>Tu turno: {turno.caja} · {turno.num_ventas} tickets</span>}</div>
      <AvisoError error={dia_.error ?? abiertos.error} titulo="No se pudieron cargar los tickets" />
      <div className="card" style={{ padding: 0 }}>
        <DataTable columnas={columnas} filas={filas} cargando={dia_.cargando} exportarNombre={`tickets-${dia}`} vacio={{ title: 'Sin tickets', description: 'No hay tickets en este día.' }} />
      </div>
      <ConfirmDialog open={!!cancelar} titulo={`Cancelar ticket ${cancelar?.folio ?? ''}`} peligro pedirMotivo ocupado={ocupado} textoConfirmar="Cancelar ticket"
        mensaje="El ticket no se borra: queda cancelado con su motivo, se revierten inventario y comisiones y los anticipos vuelven a estar disponibles. Si tiene CFDI vigente, cancélalo o acredítalo primero. Tras cerrar el turno solo Administración puede cancelar."
        onConfirm={confirmarCancelar} onCancel={() => setCancelar(null)} />
    </div>
  )
}
