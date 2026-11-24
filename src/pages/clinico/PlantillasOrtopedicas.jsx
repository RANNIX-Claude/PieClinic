import { useNavigate, Link } from 'react-router-dom'
import { Footprints, Truck, ShieldCheck, RefreshCw } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { fecha, moneda } from '../../lib/formato'
import { useVista, mensajeError } from './componentes/comunes'

export default function PlantillasOrtopedicas() {
  const nav = useNavigate()
  const { sedes } = useApp()
  const puede = usePermiso('ortopedia.editar')
  const q = useVista('ort-lista', 'prp_plantillas_seguimiento', { orden: { columna: 'fecha_envio', asc: false }, limite: 1000 })
  const pacs = useVista('pac-ort', 'prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo,numero_expediente', limite: 4000 })
  const pn = Object.fromEntries((pacs.data?.filas ?? []).map(p => [p.id, p]))
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const f = q.data?.filas ?? []
  const cols = [
    { key: 'folio', label: 'Orden' }, { key: 'paciente', label: 'Paciente', valor: o => pn[o.paciente_id]?.nombre_completo ?? '—' }, { key: 'sede', label: 'Sede', valor: o => sn[o.sede_id] ?? '', filtro: true },
    { key: 'estado', label: 'Estado', filtro: true, render: o => <StatusBadge estado={o.estado} /> }, { key: 'pares', label: 'Pares', align: 'right' },
    { key: 'fecha_envio', label: 'Envío', render: o => fecha(o.fecha_envio) }, { key: 'entrega_estimada', label: 'Entrega estimada', render: o => fecha(o.entrega_estimada) },
    { key: 'fecha_entrega', label: 'Entregada', render: o => fecha(o.fecha_entrega) }, { key: 'garantia_hasta', label: 'Garantía hasta', render: o => fecha(o.garantia_hasta) },
    { key: 'precio', label: 'Precio', align: 'right', render: o => moneda(o.precio) },
    { key: 'avisos', label: 'Avisos', sortable: false, exportar: false, render: o => <>{o.retrasada_laboratorio && <span className="bd r">Retrasada</span>} {o.revision_ajuste_pendiente && <span className="bd a">Revisión de ajuste</span>} {o.renovacion_disponible && <span className="bd b">Renovación</span>}</> },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Plantillas ortopédicas" subtitulo="Estudio de pisada, orden al laboratorio, entrega, garantía (6 meses), revisión de ajuste (30 días) y renovación (12–18 meses)"
        acciones={puede && <Link to="/plantillas-ortopedicas/nueva" className="btn" style={{ textDecoration: 'none' }}>+ Estudio de pisada y orden</Link>} />
      <div className="grid-kpis">
        <KPICard title="En laboratorio" value={f.filter(o => o.estado === 'enviada').length} icon={Truck} loading={q.isLoading} />
        <KPICard title="Retrasadas" value={f.filter(o => o.retrasada_laboratorio).length} icon={Truck} color="var(--red)" loading={q.isLoading} />
        <KPICard title="Garantía vigente" value={f.filter(o => o.garantia_vigente).length} icon={ShieldCheck} color="var(--green)" loading={q.isLoading} />
        <KPICard title="Revisión de ajuste pendiente" value={f.filter(o => o.revision_ajuste_pendiente).length} icon={Footprints} color="var(--gold)" loading={q.isLoading} />
        <KPICard title="Renovación disponible" value={f.filter(o => o.renovacion_disponible).length} icon={RefreshCw} color="var(--accent2)" loading={q.isLoading} />
      </div>
      <DataTable columnas={cols} filas={f} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filaKey="orden_id" onFila={o => nav(`/plantillas-ortopedicas/${o.orden_id}`)} exportarNombre="plantillas_ortopedicas"
        vacio={{ title: 'Sin órdenes', description: 'Aún no hay órdenes de plantillas ortopédicas.' }} />
    </div>
  )
}
