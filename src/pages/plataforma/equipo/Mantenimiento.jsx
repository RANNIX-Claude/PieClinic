// Pantalla 41 · Mantenimiento y órdenes de trabajo (clon de Mantenimiento.jsx + MantenimientoUI de IRP).
// Cualquier rol solicita; solo Administración autoriza, rechaza, inicia y cierra (P-112). Urgentes ≤ tope pueden iniciar antes de autorizar y se regularizan.
// La bitácora de lotes de esterilización (pestaña del mockup) es del dominio clínico (pantalla 15) y no vive aquí.
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { moneda, fecha } from '../../../lib/formato'
import { useVista, Estado, AvisoSoloLectura, hoy } from './comun'
import NuevaOT from './mantenimiento/NuevaOT'
import DetalleOT from './mantenimiento/DetalleOT'
import Equipos from './mantenimiento/Equipos'
import Presupuesto from './mantenimiento/Presupuesto'

const FILTROS = [['abiertas', 'Abiertas'], ['solicitado', 'Solicitadas'], ['autorizado', 'Autorizadas'], ['en_proceso', 'En proceso'], ['cerrado', 'Cerradas'], ['rechazado', 'Rechazadas'], ['todas', 'Todas']]
const ABIERTAS = ['solicitado', 'autorizado', 'en_proceso']
const BD_TIPO = { urgente: 'r', preventivo: 'b', normal: 'n' }

export default function Mantenimiento() {
  const solicitar = usePermiso('mantenimiento.solicitar')
  const gestionar = usePermiso('mantenimiento.gestionar')
  const { sedes } = useApp()
  const [tab, setTab] = useState('ordenes')
  const [filtro, setFiltro] = useState('abiertas')
  const [mes, setMes] = useState('')
  const [anio, setAnio] = useState('')
  const [soloMias, setSoloMias] = useState(false)
  const [nueva, setNueva] = useState(false)
  const [detalleId, setDetalleId] = useState(null)
  const { user } = useApp()
  const q = useVista('ots', 'prp_ordenes_trabajo', { orden: [{ columna: 'fecha', asc: false }], limite: 1500 })
  const qe = useVista('equipos', 'prp_equipos', { orden: [{ columna: 'nombre' }], limite: 500 })
  const qm = useVista('mant-mes', 'prp_mantenimiento_mes', { limite: 100 })
  const qp = useVista('mant-presup', 'mantenimiento_presupuestos', { limite: 100 }, { habilitado: gestionar })
  const ots = q.data ?? []
  const mesActual = hoy().slice(0, 7) + '-01'
  const costoMes = (qm.data ?? []).filter(m => m.mes === mesActual).reduce((s, m) => s + Number(m.costo_real), 0)
  const presupMes = (qp.data ?? []).filter(p => p.mes === mesActual).reduce((s, p) => s + Number(p.monto), 0)
  const vencidos = (qe.data ?? []).filter(e => e.estado === 'vencido')
  const filas = useMemo(() => ots.filter(o => {
    if (filtro === 'abiertas' ? !ABIERTAS.includes(o.estatus) : filtro !== 'todas' && o.estatus !== filtro) return false
    if (mes && o.fecha.slice(5, 7) !== mes) return false
    if (anio && o.fecha.slice(0, 4) !== anio) return false
    if (soloMias && o.autorizado_por !== user?.id) return false
    return true
  }), [ots, filtro, mes, anio, soloMias, user])
  const abiertas = ots.filter(o => ABIERTAS.includes(o.estatus))
  const urgentes = abiertas.filter(o => o.tipo === 'urgente')
  const anios = [...new Set(ots.map(o => o.fecha.slice(0, 4)))].sort().reverse()

  return (
    <div className="pagina">
      <PageHeader titulo="Mantenimiento · Órdenes de trabajo" subtitulo="Equipo, instrumental e instalaciones de las sedes"
        acciones={solicitar && <button className="btn" onClick={() => setNueva(true)}><Plus size={14} style={{ verticalAlign: -3 }} /> Nueva solicitud</button>} />
      <AvisoSoloLectura />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'ordenes', label: 'Solicitudes y órdenes', badge: abiertas.length || undefined }, { id: 'equipos', label: 'Equipo e instrumental' }, { id: 'presupuesto', label: 'Presupuesto y costo', oculto: !gestionar }]} />
      <div className="grid-kpis">
        <KPICard title="Abiertas" value={abiertas.length} subtitle={`${abiertas.filter(o => o.estatus === 'solicitado').length} por autorizar`} loading={q.isLoading} onClick={() => { setTab('ordenes'); setFiltro('abiertas') }} />
        <KPICard title="Urgentes abiertas" value={urgentes.length} color="var(--red)" subtitle={urgentes[0] ? `${urgentes[0].equipo_nombre ?? urgentes[0].descripcion.slice(0, 30)} · ${urgentes[0].sede_nombre}` : 'Ninguna'} loading={q.isLoading} />
        <KPICard title="Costo del mes" value={moneda(costoMes)} subtitle={gestionar ? (presupMes ? `vs. ${moneda(presupMes)} presupuestado` : 'Sin presupuesto del mes') : 'OT cerradas este mes'} color={presupMes && costoMes > presupMes ? 'var(--red)' : 'var(--green)'} loading={qm.isLoading} />
        <KPICard title="Equipos con servicio vencido" value={vencidos.length} color="var(--gold)" subtitle={vencidos.slice(0, 2).map(e => `${e.nombre} ${e.sede_nombre}`).join(' · ') || 'Ninguno'} loading={qe.isLoading} onClick={() => setTab('equipos')} />
      </div>

      {tab === 'ordenes' && <>
        <div className="toolbar">
          {FILTROS.map(([id, l]) => <button key={id} className={`btn sm ${filtro === id ? '' : 'o'}`} onClick={() => setFiltro(id)}>{l}{id === 'abiertas' ? ` (${abiertas.length})` : ''}</button>)}
          <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes"><option value="">Todos los meses</option>{['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => <option key={m} value={m}>{new Date(2000, i, 1).toLocaleDateString('es-MX', { month: 'long' })}</option>)}</select>
          <select value={anio} onChange={e => setAnio(e.target.value)} aria-label="Año"><option value="">Todos los años</option>{anios.map(a => <option key={a}>{a}</option>)}</select>
          {gestionar && <label style={{ fontSize: 12 }}><input type="checkbox" checked={soloMias} onChange={e => setSoloMias(e.target.checked)} /> Solo las que yo autoricé</label>}
        </div>
        <Estado q={q}>
          <DataTable exportarNombre="ordenes_trabajo" filas={filas} onFila={o => setDetalleId(o.id)} placeholderBusqueda="Buscar folio, equipo, descripción…"
            vacio={{ title: 'Sin órdenes', description: solicitar ? 'No hay órdenes con este filtro. Crea una con «Nueva solicitud».' : 'No hay órdenes con este filtro.' }}
            columnas={[
              { key: 'folio', label: 'Folio', render: o => <b>{o.folio}</b> },
              { key: 'fecha', label: 'Fecha', render: o => fecha(o.fecha) },
              { key: 'sede_nombre', label: 'Sede', filtro: true },
              { key: 'categoria', label: 'Categoría', filtro: true },
              { key: 'tipo', label: 'Tipo', filtro: true, render: o => <span className={`bd ${BD_TIPO[o.tipo]}`}>{o.tipo.toUpperCase()}</span> },
              { key: 'descripcion', label: 'Qué reparar', render: o => <span>{o.descripcion}{o.equipo_nombre ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.equipo_nombre}</div> : null}</span> },
              { key: 'asignado', label: 'Asignado a', valor: o => (o.asignado_interno ? 'Mantenimiento interno' : o.asignado_texto ?? '—') },
              { key: 'programada_para', label: 'Programada', render: o => (o.programada_para ? fecha(o.programada_para) : '—') },
              { key: 'costo', label: 'Costo', align: 'right', valor: o => o.costo_real ?? o.costo_estimado ?? 0, render: o => (o.costo_real != null ? moneda(o.costo_real) : o.costo_estimado != null ? <span title="Estimado" style={{ color: 'var(--muted)' }}>~{moneda(o.costo_estimado)}</span> : '—') },
              { key: 'estatus', label: 'Estatus', filtro: true, render: o => <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><StatusBadge estado={o.estatus} />{o.autorizacion_pendiente && <span className="bd a" title="Urgente atendida antes de autorizar">Regularizar</span>}</span> },
              { key: 'dias_abierta', label: 'Días', align: 'right', render: o => o.dias_abierta ?? '—' },
            ]} />
        </Estado>
      </>}
      {tab === 'equipos' && <Equipos q={qe} />}
      {tab === 'presupuesto' && gestionar && <Presupuesto qMes={qm} qPres={qp} sedes={sedes} />}
      <NuevaOT abierto={nueva} onClose={() => setNueva(false)} equipos={qe.data ?? []} />
      <DetalleOT id={detalleId} ots={ots} equipos={qe.data ?? []} onClose={() => setDetalleId(null)} />
    </div>
  )
}
