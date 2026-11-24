// Pantalla 39 · Recursos humanos y nómina (clon de RH.jsx de IRP). Solo Administración.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import { usePermiso } from '../../../lib/permisos'
import { AvisoSoloLectura } from './comun'
import TabEmpleados from './rh/TabEmpleados'
import TabReclutamiento from './rh/TabReclutamiento'
import TabAsistencia from './rh/TabAsistencia'
import TabHorarios from './rh/TabHorarios'
import TabIncidencias from './rh/TabIncidencias'
import TabVacaciones from './rh/TabVacaciones'
import TabNomina from './rh/TabNomina'
import Recibos from './rh/Recibos'

const TABS = [['empleados', 'Empleados'], ['reclutamiento', 'Reclutamiento'], ['asistencia', 'Asistencia'], ['horarios', 'Horarios'], ['incidencias', 'Incidencias'], ['vacaciones', 'Vacaciones'], ['nomina', 'Nómina'], ['recibos', 'Recibos firmados']]

export default function RH() {
  const editar = usePermiso('rh.editar')
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('pf.rh.tab') || 'empleados' } catch { return 'empleados' } })
  const [nuevo, setNuevo] = useState(false)
  const cambiar = t => { setTab(t); try { sessionStorage.setItem('pf.rh.tab', t) } catch { /* sin storage */ } }
  return (
    <div className="pagina">
      <PageHeader titulo="Recursos humanos" subtitulo="Reclutamiento · Expediente · Asistencia · Nómina"
        acciones={tab === 'empleados' && editar && <button className="btn" onClick={() => setNuevo(true)}><Plus size={14} style={{ verticalAlign: -3 }} /> Nuevo empleado</button>} />
      <AvisoSoloLectura />
      <Tabs value={tab} onChange={cambiar} items={TABS.map(([id, label]) => ({ id, label }))} />
      {tab === 'empleados' && <TabEmpleados nuevo={nuevo} onNuevoCerrado={() => setNuevo(false)} />}
      {tab === 'reclutamiento' && <TabReclutamiento />}
      {tab === 'asistencia' && <TabAsistencia />}
      {tab === 'horarios' && <TabHorarios />}
      {tab === 'incidencias' && <TabIncidencias />}
      {tab === 'vacaciones' && <TabVacaciones />}
      {tab === 'nomina' && <TabNomina />}
      {tab === 'recibos' && <Recibos />}
    </div>
  )
}
