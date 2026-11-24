import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Stethoscope, FileWarning, CheckCircle2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { fecha, fechaHora } from '../../lib/formato'
import { useVista, mensajeError } from './componentes/comunes'
import { etiquetaDe, TIPOS_ATENCION } from '../../lib/clinico/catalogos'

export default function Consultas() {
  const nav = useNavigate()
  const { perfil, rol, sedes } = useApp()
  const puedeEscribir = usePermiso('consultas.escribir')
  const [tab, setTab] = useState('pendientes')
  const propias = rol === 'podologo' ? { podologo_id: perfil?.id } : {}
  const pend = useVista('pendientes', 'prp_consultas_pendientes', { filtros: propias, orden: { columna: 'fecha_hora', asc: false }, limite: 300 })
  const rec = useVista('recientes', 'prp_seguimiento_clinico', { orden: { columna: 'fecha_hora', asc: false }, limite: 300 })
  const pacs = useVista('pac-nombres-consultas', 'prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo,numero_expediente', limite: 3000 })
  const pn = Object.fromEntries((pacs.data?.filas ?? []).map(p => [p.id, p]))
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const nPend = pend.data?.filas?.length ?? 0
  const sinFirma = (pend.data?.filas ?? []).filter(c => c.estado === 'pendiente_firma').length

  const colsPend = [
    { key: 'folio', label: 'Folio' }, { key: 'fecha_hora', label: 'Fecha', render: c => fechaHora(c.fecha_hora) },
    { key: 'paciente', label: 'Paciente', valor: c => pn[c.paciente_id]?.nombre_completo ?? '—', render: c => <>{pn[c.paciente_id]?.nombre_completo ?? '—'} <span style={{ color: 'var(--muted)', fontSize: 11 }}>{pn[c.paciente_id]?.numero_expediente}</span></> },
    { key: 'sede', label: 'Sede', valor: c => sn[c.sede_id] ?? '' }, { key: 'estado', label: 'Estado', filtro: true, render: c => <StatusBadge estado={c.estado} /> },
    { key: 'aviso', label: 'Aviso', sortable: false, render: c => c.firma_aviso_pendiente && <span className="bd a">Aviso de privacidad pendiente</span> },
    { key: 'guardado', label: 'Último guardado', render: c => fechaHora(c.borrador_guardado_en) },
  ]
  const colsRec = [
    { key: 'folio', label: 'Folio' }, { key: 'fecha', label: 'Fecha', render: c => fecha(c.fecha) }, { key: 'paciente', label: 'Paciente', valor: c => pn[c.paciente_id]?.nombre_completo ?? '—' },
    { key: 'atendio', label: 'Atendió', filtro: true }, { key: 'servicio', label: 'Servicio', filtro: true }, { key: 'observaciones', label: 'Observaciones' },
    { key: 'tipo_atencion', label: 'Modalidad', valor: c => etiquetaDe(TIPOS_ATENCION, c.tipo_atencion) }, { key: 'proxima_visita', label: 'Próx. visita', render: c => fecha(c.proxima_visita) },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Consultas" subtitulo="Notas de evolución: borradores, pendientes de firma y consultas firmadas"
        acciones={puedeEscribir && <Link to="/consultas/nueva" className="btn" style={{ textDecoration: 'none' }}><Stethoscope size={14} style={{ verticalAlign: -3 }} /> Nueva consulta</Link>} />
      <div className="grid-kpis">
        <KPICard title="Borradores y pendientes" value={nPend} icon={FileWarning} color="var(--gold)" loading={pend.isLoading} onClick={() => setTab('pendientes')} activo={tab === 'pendientes'} />
        <KPICard title="Pendientes de firma" value={sinFirma} icon={FileWarning} color="var(--red)" loading={pend.isLoading} subtitle="No pueden cerrarse sin firma" />
        <KPICard title="Firmadas (últimas 300)" value={rec.data?.filas?.length ?? 0} icon={CheckCircle2} color="var(--green)" loading={rec.isLoading} onClick={() => setTab('firmadas')} activo={tab === 'firmadas'} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'pendientes', label: 'Borradores y pendientes', badge: nPend }, { id: 'firmadas', label: 'Firmadas' }]} />
      {tab === 'pendientes'
        ? <DataTable columnas={colsPend} filas={pend.data?.filas ?? []} cargando={pend.isLoading} error={pend.error ? mensajeError(pend.error) : null} filaKey="id" onFila={c => nav(`/consultas/${c.id}`)} vacio={{ title: 'Sin pendientes', description: 'No tienes consultas abiertas.' }} />
        : <DataTable columnas={colsRec} filas={rec.data?.filas ?? []} cargando={rec.isLoading} error={rec.error ? mensajeError(rec.error) : null} filaKey="consulta_id" onFila={c => nav(`/consultas/${c.consulta_id}`)} exportarNombre="consultas_firmadas" vacio={{ title: 'Sin consultas firmadas', description: 'Aún no hay notas firmadas en esta sede.' }} />}
    </div>
  )
}
