// Pestaña «Tickets del día»: lista, reimpresión marcada «copia», cancelación con motivo, retomar cuentas abiertas y facturar.
import { useEffect, useState } from 'react'
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
import CajaCancelacion from './CajaCancelacion'
import { cancelacionRequiere, cancelacionesPendientes, parametrosCaja, PARAMETROS_CAJA_OMISION } from '../../../lib/comercial/cajaControl'

export default function CajaTickets({ turno, onCambio, onRetomar }) {
  const { organizacion, sedeActiva, sedeActivaId } = useApp()
  const qc = useQueryClient()
  const puedeCancelar = usePermiso('ventas.cancelar')
  const [dia, setDia] = useState(hoyISO())
  const [cancelar, setCancelar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [params, setParams] = useState(PARAMETROS_CAJA_OMISION)   // controles de Caja (Etapa 1): cancelación con bloqueo, motivos y autorizadores
  const [validar, setValidar] = useState(null)                     // ticket cuya cancelación se valida con pieza, foto y clave
  const [pendientes, setPendientes] = useState([])
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
  useEffect(() => {
    if (!sedeActivaId || !navigator.onLine) return
    parametrosCaja(sedeActivaId).then(r => { if (r.data) setParams(r.data) })
  }, [sedeActivaId])
  // cancelaciones que esperan respuesta del módulo: la pieza NO ha vuelto al inventario (se consulta cada 10 s; el servidor vence las que pasaron su espera)
  useEffect(() => {
    if (!sedeActivaId || !params.cancelacion_con_bloqueo || !navigator.onLine) { setPendientes([]); return }
    let vivo = true
    const cargar = () => cancelacionesPendientes(sedeActivaId).then(r => { if (vivo && Array.isArray(r.data)) setPendientes(r.data) })
    cargar(); const t = setInterval(cargar, 10000)
    return () => { vivo = false; clearInterval(t) }
  }, [sedeActivaId, params.cancelacion_con_bloqueo, validar])
  // «Cancelar»: un ticket con piezas pasa por la validación del módulo (si está activa en la sucursal); uno sin piezas se cancela como siempre
  const iniciarCancelacion = async v => {
    if (params.cancelacion_con_bloqueo && ['cobrada', 'por_facturar'].includes(v.estado) && navigator.onLine) {
      const { data } = await cancelacionRequiere(v.id)
      if (data?.requiere) return setValidar(v)
    }
    setCancelar(v)
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
        {puedeCancelar && v.estado !== 'cancelada' && <button className="btn red" onClick={() => iniciarCancelacion(v)}>Cancelar</button>}
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
      {pendientes.length > 0 && (
        <div className="cj-hecho-off" role="status" style={{ background: '#FFF4D6', border: '1px solid #E5B93C', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 8 }}>
          {pendientes.length} cancelación(es) esperan validación — la pieza todavía NO vuelve al inventario y la venta sigue firme: {pendientes.map(p => <button key={p.id} type="button" className="btn o" style={{ marginLeft: 6, padding: '1px 8px' }} onClick={() => setValidar({ id: p.venta_id, folio: p.ticket, sede_id: p.sucursal_id })}>{p.ticket} · {p.estado === 'pendiente_de_validacion' ? 'vencida' : 'validar'}</button>)}
        </div>)}
      <AvisoError error={dia_.error ?? abiertos.error} titulo="No se pudieron cargar los tickets" />
      <div className="card" style={{ padding: 0 }}>
        <DataTable columnas={columnas} filas={filas} cargando={dia_.cargando} exportarNombre={`tickets-${dia}`} vacio={{ title: 'Sin tickets', description: 'No hay tickets en este día.' }} />
      </div>
      <ConfirmDialog open={!!cancelar} titulo={`Cancelar ticket ${cancelar?.folio ?? ''}`} peligro pedirMotivo ocupado={ocupado} textoConfirmar="Cancelar ticket"
        mensaje="El ticket no se borra: queda cancelado con su motivo, se revierten inventario y comisiones y los anticipos vuelven a estar disponibles. Si tiene CFDI vigente, cancélalo o acredítalo primero. Tras cerrar el turno solo Administración puede cancelar."
        onConfirm={confirmarCancelar} onCancel={() => setCancelar(null)} />
      {validar && <CajaCancelacion venta={validar} params={params} onClose={() => setValidar(null)} onResuelta={refrescar} />}
    </div>
  )
}
