// CUSTODIA (módulo Control y Auditoría · Etapa 7): cadena de custodia de las piezas caras y respaldo en papel.
//   Recepción con responsiva · Sellos VOID · Alto valor · Custodia del relevo · Talonarios y caídas · Catálogo de control (solo el dueño).
// Captura recepción, podología, supervisor y dueño (a ciegas: nunca ven saldo ni lo que el sistema espera). Ven y administran supervisor y dueño; configura el dueño.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import { usePermiso } from '../../../lib/permisos'
import Recepcion, { ListaRecepciones } from './Recepcion'
import Sellos from './Sellos'
import AltoValor from './AltoValor'
import CustodiaRelevo from './CustodiaRelevo'
import Talonarios from './Talonarios'
import CatalogoControl from './CatalogoControl'

const TABS = ['recepcion', 'sellos', 'alto', 'relevo', 'talonarios', 'catalogo']

export default function Custodia() {
  const captura = usePermiso('auditoria.capturar')
  const configura = usePermiso('auditoria.configurar')
  const [params, setParams] = useSearchParams()
  const pedida = params.get('tab')
  const permitidas = TABS.filter(t => (t === 'catalogo' ? configura : captura))   // una pestaña pedida por la URL que el rol no ve cae a la primera permitida
  const [tab, setTabState] = useState(permitidas.includes(pedida) ? pedida : (permitidas[0] ?? 'recepcion'))
  const setTab = t => { setTabState(t); setParams({ tab: t }, { replace: true }) }
  const [verHistorial, setVerHistorial] = useState(false)
  return (
    <div className="pagina">
      <PageHeader titulo="Custodia" subtitulo="Recepción con responsiva, sellos VOID, piezas de alto valor, talonarios de contingencia y caídas del sistema" />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'recepcion', label: 'Recepción', oculto: !captura }, { id: 'sellos', label: 'Sellos', oculto: !captura }, { id: 'alto', label: 'Alto valor', oculto: !captura },
        { id: 'relevo', label: 'Custodia del relevo', oculto: !captura }, { id: 'talonarios', label: 'Talonarios y caídas', oculto: !captura },
        { id: 'catalogo', label: 'Catálogo de control', oculto: !configura },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'recepcion' && captura && (
          <>
            <Recepcion />
            <div style={{ maxWidth: 560, margin: '14px auto 0' }}>
              <button className="btn o" onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? 'Ocultar recepciones firmadas' : 'Ver recepciones firmadas'}</button>
            </div>
            {verHistorial && <div style={{ marginTop: 10 }}><ListaRecepciones /></div>}
          </>
        )}
        {tab === 'sellos' && captura && <Sellos />}
        {tab === 'alto' && captura && <AltoValor />}
        {tab === 'relevo' && captura && <CustodiaRelevo />}
        {tab === 'talonarios' && captura && <Talonarios />}
        {tab === 'catalogo' && configura && <CatalogoControl puedeEditar={configura} />}
      </div>
    </div>
  )
}
