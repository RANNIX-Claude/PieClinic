// Casos de diferencia · Etapa 3 del módulo de Control y Auditoría (docs/AUDITORIA_ETAPA3.md).
// Ciclo de vida: abierta → en investigación → cerrada con ajuste | cerrada sin ajuste | rechazada, más «ajuste fallido» (visible y reintentable).
// Un caso NUNCA se captura a mano: nace de un conteo o un cierre. Investigan dueño y supervisor; autoriza SOLO el dueño (contraseña completa) y distinto de
// quien capturó. Soporte RANNIX solo lee y sus consultas quedan en bitácora. El rol de sucursal no entra aquí (ni ve casos ni diferencias: lo exige la base).
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import { usePermiso } from '../../lib/permisos'
import CasosLista from './casos/CasosLista'
import CasoDetalle from './casos/CasoDetalle'
import ReportesCasos from './casos/ReportesCasos'

export default function Casos() {
  const esDueno = usePermiso('auditoria.autorizar')
  const investiga = usePermiso('auditoria.investigar')
  const verDif = usePermiso('auditoria.ver_diferencias')
  const rolAud = esDueno ? 'dueno' : investiga ? 'supervisor' : verDif ? 'soporte' : 'sucursal'
  const [params, setParams] = useSearchParams()
  const casoId = params.get('caso')
  const [tab, setTab] = useState('lista')
  const abrir = id => setParams(id ? { caso: id } : {})

  if (rolAud === 'sucursal') {
    return (
      <div className="pagina">
        <PageHeader titulo="Casos de diferencia" subtitulo="Esta pantalla es de dueño y supervisor" />
        <div className="card">Quien captura los conteos no ve casos ni diferencias: así el conteo se hace a ciegas.</div>
      </div>
    )
  }
  if (casoId) return <CasoDetalle casoId={casoId} rolAud={rolAud} onSalir={() => abrir(null)} />
  return (
    <div className="pagina">
      <PageHeader titulo="Casos de diferencia" subtitulo="Toda diferencia se vuelve un caso con folio; mientras esté abierto, el inventario no se mueve" />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'lista', label: 'Todos los casos' },
        { id: 'mios', label: 'Mis casos', oculto: rolAud === 'soporte' },
        { id: 'seguimiento', label: 'Seguimiento' },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'lista' && <CasosLista rolAud={rolAud} onAbrir={abrir} />}
        {tab === 'mios' && <CasosLista rolAud={rolAud} soloMios onAbrir={abrir} />}
        {tab === 'seguimiento' && <ReportesCasos onAbrirCaso={abrir} />}
      </div>
    </div>
  )
}
