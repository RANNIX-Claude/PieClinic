import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ClipboardList, AlertTriangle, PauseCircle, CheckCircle2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { moneda, fecha, hoyISO } from '../../lib/formato'
import { planPorAbandonar } from '../../lib/clinico/plan'
import { useVista, mensajeError } from './componentes/comunes'

export default function Planes() {
  const nav = useNavigate()
  const { sedes } = useApp()
  const puedeEditar = usePermiso('planes.editar')
  const [estado, setEstado] = useState('')
  const q = useVista('planes-lista', 'prp_planes_progreso', { orden: { columna: 'fecha_inicio', asc: false }, limite: 1000 })
  const pacs = useVista('pac-planes', 'prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo,numero_expediente', limite: 4000 })
  const pn = Object.fromEntries((pacs.data?.filas ?? []).map(p => [p.id, p]))
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const todas = q.data?.filas ?? []
  const filas = estado ? todas.filter(p => p.estado === estado) : todas
  const hoy = hoyISO()
  const cnt = e => todas.filter(p => p.estado === e).length
  const porAbandonar = todas.filter(p => p.estado === 'en_curso' && p.ultima_actividad && planPorAbandonar(p.ultima_actividad, hoy, 25)).length
  const cols = [
    { key: 'folio', label: 'Folio' }, { key: 'nombre', label: 'Plan' },
    { key: 'paciente', label: 'Paciente', valor: p => pn[p.paciente_id]?.nombre_completo ?? '—' },
    { key: 'sede', label: 'Sede', valor: p => sn[p.sede_id] ?? '', filtro: true },
    { key: 'fecha_inicio', label: 'Inicio', render: p => fecha(p.fecha_inicio) },
    { key: 'avance', label: 'Avance', valor: p => `${p.sesiones_realizadas}/${p.sesiones_total}` },
    { key: 'faltas', label: 'Faltas', align: 'right' }, { key: 'sesiones_atrasadas', label: 'Atrasadas', align: 'right', render: p => (p.sesiones_atrasadas > 0 ? <span className="bd a">{p.sesiones_atrasadas}</span> : 0) },
    { key: 'proxima_sesion', label: 'Próxima sesión', render: p => fecha(p.proxima_sesion) },
    { key: 'dias_sin_actividad', label: 'Días sin actividad', align: 'right', render: p => (p.estado === 'en_curso' && p.dias_sin_actividad >= 25 ? <span className="bd r">{p.dias_sin_actividad}</span> : p.dias_sin_actividad) },
    { key: 'precio_plan', label: 'Precio', align: 'right', render: p => moneda(p.precio_plan) }, { key: 'estado', label: 'Estado', render: p => <StatusBadge estado={p.estado} /> },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Planes de tratamiento" subtitulo="Extracción de uña = extracción + 4 curaciones diarias · láser cada 30–35 días · abandono a los 30 días sin actividad"
        acciones={puedeEditar && <Link to="/planes/nuevo" className="btn" style={{ textDecoration: 'none' }}>+ Nuevo plan</Link>} />
      <div className="grid-kpis">
        <KPICard title="En curso" value={cnt('en_curso')} icon={ClipboardList} loading={q.isLoading} onClick={() => setEstado(e => (e === 'en_curso' ? '' : 'en_curso'))} activo={estado === 'en_curso'} />
        <KPICard title="Por abandonarse (≥ 25 días)" value={porAbandonar} icon={AlertTriangle} color="var(--gold)" loading={q.isLoading} />
        <KPICard title="Pausados" value={cnt('pausado')} icon={PauseCircle} color="var(--accent2)" loading={q.isLoading} onClick={() => setEstado(e => (e === 'pausado' ? '' : 'pausado'))} activo={estado === 'pausado'} />
        <KPICard title="Abandonados" value={cnt('abandonado')} icon={AlertTriangle} color="var(--red)" loading={q.isLoading} onClick={() => setEstado(e => (e === 'abandonado' ? '' : 'abandonado'))} activo={estado === 'abandonado'} />
        <KPICard title="Concluidos" value={cnt('concluido')} icon={CheckCircle2} color="var(--green)" loading={q.isLoading} onClick={() => setEstado(e => (e === 'concluido' ? '' : 'concluido'))} activo={estado === 'concluido'} />
      </div>
      <DataTable columnas={cols} filas={filas} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filaKey="plan_id" onFila={p => nav(`/planes/${p.plan_id}`)} exportarNombre="planes_tratamiento"
        vacio={{ title: 'Sin planes de tratamiento', description: 'Crea un plan desde un paciente o con «+ Nuevo plan».' }} />
    </div>
  )
}
