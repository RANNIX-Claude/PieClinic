import { useNavigate, Link } from 'react-router-dom'
import { HeartPulse, AlertTriangle, CalendarClock } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { fecha } from '../../lib/formato'
import { FRECUENCIAS_REVISION } from '../../lib/clinico/sinbad'
import { etiquetaDe } from '../../lib/clinico/catalogos'
import { Aviso, useVista, mensajeError } from './componentes/comunes'

/** Última valoración firmada por paciente y estado de la revisión (revisión vencida → alerta en el expediente). */
export default function PieDiabetico() {
  const nav = useNavigate()
  const { sedes } = useApp()
  const puede = usePermiso('consultas.escribir')
  const q = useVista('pd-revisiones', 'prp_pie_diabetico_revisiones', { orden: { columna: 'proxima_revision' }, limite: 2000 })
  const pacs = useVista('pac-pd', 'prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo,numero_expediente', limite: 4000 })
  const pn = Object.fromEntries((pacs.data?.filas ?? []).map(p => [p.id, p]))
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const filas = q.data?.filas ?? []
  const vencidas = filas.filter(r => r.revision_vencida)
  const cols = [
    { key: 'paciente', label: 'Paciente', valor: r => pn[r.paciente_id]?.nombre_completo ?? '—', render: r => <Link to={`/pacientes/${r.paciente_id}`} onClick={e => e.stopPropagation()}>{pn[r.paciente_id]?.nombre_completo ?? '—'}</Link> },
    { key: 'sede', label: 'Sede', valor: r => sn[r.sede_id] ?? '', filtro: true },
    { key: 'fecha', label: 'Última valoración', render: r => fecha(r.fecha) },
    { key: 'categoria_riesgo', label: 'Riesgo', filtro: true, valor: r => (r.categoria_riesgo == null ? 'Sin categoría' : `Categoría ${r.categoria_riesgo}`) },
    { key: 'frecuencia_revision', label: 'Frecuencia', render: r => etiquetaDe(FRECUENCIAS_REVISION, r.frecuencia_revision) },
    { key: 'proxima_revision', label: 'Próxima revisión', render: r => fecha(r.proxima_revision) },
    { key: 'dias_vencida', label: 'Estado', valor: r => (r.revision_vencida ? r.dias_vencida : -1), render: r => (r.revision_vencida ? <span className="bd r">Vencida hace {r.dias_vencida} d</span> : <span className="bd v">Al corriente</span>) },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Pie diabético" subtitulo="Valoraciones (monofilamento, pulsos, SINBAD) y seguimiento de revisiones · apoyo a la decisión clínica, no diagnóstico"
        acciones={puede && <Link to="/pie-diabetico/nueva" className="btn" style={{ textDecoration: 'none' }}>+ Nueva valoración</Link>} />
      <Aviso>Las categorías de riesgo y las frecuencias de revisión son una <b>sugerencia editable que está apagada</b> hasta que un podólogo asesor valide los criterios (P-010). El podólogo siempre decide.</Aviso>
      <div className="grid-kpis">
        <KPICard title="Pacientes con valoración" value={filas.length} icon={HeartPulse} loading={q.isLoading} />
        <KPICard title="Revisiones vencidas" value={vencidas.length} icon={AlertTriangle} color="var(--red)" loading={q.isLoading} />
        <KPICard title="Vencen en 30 días" value={filas.filter(r => !r.revision_vencida && r.proxima_revision && (new Date(r.proxima_revision) - new Date()) / 86400000 <= 30).length} icon={CalendarClock} color="var(--gold)" loading={q.isLoading} />
      </div>
      <DataTable columnas={cols} filas={filas} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filaKey="valoracion_id" onFila={r => nav(`/pie-diabetico/${r.valoracion_id}`)} exportarNombre="pie_diabetico_revisiones"
        vacio={{ title: 'Sin valoraciones firmadas', description: 'Las valoraciones firmadas aparecen aquí con su próxima revisión.' }} />
    </div>
  )
}
