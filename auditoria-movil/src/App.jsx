// PWA de captura de Control y Auditoría: cuatro pantallas y solo estas cuatro (Cierre, Auditoría, Recepción, Mis pendientes).
// Sin menú de escritorio, sin router: una barra inferior. Consultas, reportes y autorizaciones viven en escritorio.
import { useCallback, useEffect, useState } from 'react'
import Login from './pantallas/Login'
import Cierre from './pantallas/Cierre'
import Auditoria from './pantallas/Auditoria'
import Recepcion from './pantallas/Recepcion'
import Pendientes, { usePendientes } from './pantallas/Pendientes'
import { cerrarSesion, restaurarSesion, validarAhora } from './sesion'
import { detenerSincronizacion, iniciarSincronizacion } from './envio'
import { precargar } from './datos'
import { avisoPendientes } from '../../src/lib/auditoria/pwaCola.js'
import { registrarServiceWorker } from './registro'

const TABS = [['cierre', 'Cierre', '📋'], ['auditoria', 'Auditoría', '🔍'], ['recepcion', 'Recepción', '📦'], ['pendientes', 'Pendientes', '⏳']]
const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)

function useEnLinea() {
  const [v, setV] = useState(navigator.onLine !== false)
  useEffect(() => { const a = () => setV(true), b = () => setV(false); window.addEventListener('online', a); window.addEventListener('offline', b); return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) } }, [])
  return v
}

export default function App() {
  const [estado, setEstado] = useState({ cargando: true })
  const [nueva, setNueva] = useState(null)   // función que activa la versión nueva
  const enLinea = useEnLinea()
  useEffect(() => { registrarServiceWorker({ alHayNueva: aplicar => setNueva(() => aplicar) }) }, [])
  useEffect(() => { restaurarSesion().then(r => setEstado({ cargando: false, ...r })) }, [])
  const entrar = useCallback(s => setEstado({ cargando: false, sesion: s }), [])
  const salir = useCallback(async (s, motivo = 'cerrada') => { await cerrarSesion(s); detenerSincronizacion(); setEstado({ cargando: false, sesion: null, motivo, usuarioId: s?.usuario?.id }) }, [])

  if (estado.cargando) return <div className="app" style={{ justifyContent: 'center', textAlign: 'center' }}>Abriendo…</div>
  if (!estado.sesion) return <Login motivo={estado.motivo} usuarioIdPrevio={estado.usuarioId} onEntrar={entrar} enLinea={enLinea} />
  return <Principal s={estado.sesion} enLinea={enLinea} nueva={nueva} onSalir={(m) => salir(estado.sesion, m)} />
}

function Principal({ s, enLinea, nueva, onSalir }) {
  const [tab, setTab] = useState('cierre')
  const [sesionConteo, setSesionConteo] = useState(null)
  const ctx = { usuario: s.usuario, sucursal: s.sucursal, ses: s.ses }
  const pend = usePendientes(ctx)

  useEffect(() => { iniciarSincronizacion(s.usuario.id); if (navigator.onLine !== false) precargar(s.sucursal.id).catch(() => {}); return detenerSincronizacion }, [s.usuario.id, s.sucursal.id])
  useEffect(() => {   // caduca al cerrarse el turno: con señal el servidor decide; cada minuto
    const t = setInterval(async () => { const v = await validarAhora(s); if (!v.vigente) onSalir(v.motivo) }, 60000)
    return () => clearInterval(t)
  }, [s, onSalir])

  const ir = t => { setTab(t); setSesionConteo(null) }
  const abrirConteo = id => { setSesionConteo(id); setTab('auditoria') }
  const textoCola = avisoPendientes(pend.enCola, { enLinea, ios: esIOS() })

  return (
    <div className="app">
      <div className="top">
        <div className="sp"><b>{s.usuario.nombre}</b><small>{s.sucursal.nombre}</small></div>
        <span className={`punto ${enLinea ? '' : 'off'}`} title={enLinea ? 'Con señal' : 'Sin señal'} data-testid="estado-red" />
        <button className="btn sm" style={{ background: 'rgba(255,255,255,.2)', minHeight: 40 }} onClick={() => onSalir('cerrada')} data-testid="bloquear">Salir</button>
      </div>
      {nueva && <div className="aviso info" style={{ margin: 0, borderRadius: 0 }} data-testid="aviso-actualizacion">Hay una versión nueva. <button className="btn sm" style={{ minHeight: 36 }} onClick={nueva}>Actualizar</button></div>}
      {!enLinea && <div className="aviso" style={{ margin: 0, borderRadius: 0 }} data-testid="aviso-sin-red">Sin señal. Puedes seguir con tu cierre: se guarda en el teléfono y se envía solo al volver la señal.</div>}
      {textoCola && <div className="aviso" style={{ margin: 0, borderRadius: 0 }} data-testid="banner-pendientes">{textoCola}</div>}
      <main>
        {tab === 'cierre' && <Cierre ctx={ctx} />}
        {tab === 'auditoria' && <Auditoria ctx={ctx} sesionInicial={sesionConteo} onSalirInicial={() => setSesionConteo(null)} key={sesionConteo ?? 'x'} />}
        {tab === 'recepcion' && <Recepcion ctx={ctx} enLinea={enLinea} />}
        {tab === 'pendientes' && <Pendientes ctx={ctx} pend={pend} enLinea={enLinea} onAbrirSesion={abrirConteo} />}
      </main>
      <nav className="tabs" aria-label="Pantallas">
        {TABS.map(([k, n, i]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => ir(k)} data-testid={`tab-${k}`}><span style={{ fontSize: 20 }}>{i}</span>{n}
            {k === 'pendientes' && (pend.urgentes + pend.enCola + pend.rechazadas) > 0 && <span className="ins" data-testid="insignia">{pend.urgentes + pend.enCola + pend.rechazadas}</span>}</button>))}
      </nav>
    </div>
  )
}
