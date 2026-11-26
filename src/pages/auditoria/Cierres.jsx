// Cierres de turno, de día, de apertura y semanales (Etapa 4). El cierre es el recorrido de los puntos de control activos (los define el dueño en
// Configuración de auditoría: agregar un control es configuración, no desarrollo).
//  · Recepción y podología: recorrido móvil, un punto por pantalla, a ciegas (nunca ven esperado, diferencia ni corte) + recibir entregas de turno.
//  · Dueño y supervisor: lista de cierres, corte con esperados contra capturados, versión del checklist de cada cierre y pares antes/después.
// La PWA independiente es la Etapa 5; esta pantalla es la misma app, responsiva.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PlayCircle } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import FormField from '../../components/ui/FormField'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { abrirCierre, entregasPendientes } from '../../lib/auditoria/apiCierres'
import { NOMBRE_TIPO_CIERRE } from '../../lib/auditoria/cierres'
import { errMsg } from './comun'
import Recorrido from './cierres/Recorrido'
import Entregas from './cierres/Entregas'
import { ListaCierres, ParesTomas } from './cierres/Revision'

const LS = 'pf.ctl.cierre.en_curso'
const leerCurso = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null') } catch { return null } }
const guardarCurso = v => { try { v ? localStorage.setItem(LS, JSON.stringify(v)) : localStorage.removeItem(LS) } catch { /* sin almacenamiento: el servidor retoma igual */ } }

export default function Cierres() {
  const { sedes, sedeActivaId } = useApp()
  const revisa = usePermiso('auditoria.investigar')            // dueño y supervisor
  const captura = usePermiso('auditoria.capturar')
  const [tab, setTab] = useState(revisa ? 'cierres' : 'mi')
  const [pendientes, setPendientes] = useState(0)
  useEffect(() => { if (captura) entregasPendientes().then(r => setPendientes(r.error ? 0 : (r.data ?? []).filter(e => e.puede_aceptar).length)) }, [captura, tab])
  return (
    <div className="pagina">
      <PageHeader titulo="Cierres" subtitulo="Recorrido de los puntos de control del turno, del día y de la apertura" />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'mi', label: 'Hacer un cierre', oculto: !captura },
        { id: 'entregas', label: 'Entregas de turno', badge: pendientes || null, oculto: !captura },
        { id: 'cierres', label: 'Cierres y cortes', oculto: !revisa },
        { id: 'tomas', label: 'Tomas fijas: antes / después', oculto: !revisa },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'mi' && <MiCierre sedes={sedes} sedeInicial={sedeActivaId} />}
        {tab === 'entregas' && <Entregas />}
        {tab === 'cierres' && revisa && <ListaCierres />}
        {tab === 'tomas' && revisa && <ParesTomas />}
      </div>
    </div>
  )
}

function MiCierre({ sedes, sedeInicial }) {
  const [curso, setCurso] = useState(leerCurso)               // { cierreId } — se retoma aunque la app se haya cerrado
  const [sucursal, setSucursal] = useState(sedeInicial ?? sedes[0]?.id ?? '')
  const [tipo, setTipo] = useState('turno')
  const [ocupado, setOcupado] = useState(false)
  const salir = () => { guardarCurso(null); setCurso(null) }
  async function iniciar() {
    setOcupado(true)
    const r = await abrirCierre({ sucursalId: sucursal, tipo })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    const v = { cierreId: r.data.cierre.id }
    guardarCurso(v); setCurso(v)
    if (r.data.retomado) toast('Retomando el cierre que había dejado a medias')
  }
  if (curso) return <Recorrido cierreId={curso.cierreId} onSalir={salir} />
  return (
    <div className="card" style={{ maxWidth: 520, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Hacer un cierre</h3>
      <div className="hint" style={{ marginBottom: 10 }}>Un punto por pantalla. Se guarda al avanzar: si se cierra la app a medias, se retoma donde iba. No verá lo que el sistema espera.</div>
      <FormField label="Sucursal" as="select" value={sucursal} onChange={e => setSucursal(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      <FormField label="Tipo de cierre" as="select" value={tipo} onChange={e => setTipo(e.target.value)} options={Object.entries(NOMBRE_TIPO_CIERRE).map(([value, label]) => ({ value, label }))} />
      <button className="btn" style={{ padding: '14px 20px', fontSize: 16, width: '100%', marginTop: 8 }} disabled={!sucursal || ocupado} onClick={iniciar}>
        <PlayCircle size={18} style={{ verticalAlign: -4 }} /> {ocupado ? 'Abriendo…' : 'Iniciar o continuar'}
      </button>
    </div>
  )
}
