// Portal público: sala de espera de la videoconsulta (mockup 29). Ruta /app/sala/:token
// Usa SOLO portal_sala_estado y portal_sala_entrar (anon; token de un solo uso por cita). Sin consentimiento firmado no se entra (P-018).
// El proveedor de video NO está integrado todavía: aquí solo se prueba cámara/micrófono (en el navegador) y se pasa a la sala de espera.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, Mic, Video } from 'lucide-react'
import { rpc } from '../../lib/api'
import { fechaLarga, hora } from '../../lib/formato'
import Marco, { Cargando, Problema, mensajePortal, VerTexto } from './componentes/Marco'
import FormField from '../../components/ui/FormField'
import { AVISO_PRIVACIDAD } from './textos'

const CONSENTIMIENTO = `CONSENTIMIENTO DE TELEMEDICINA

Entiendo que la consulta se realizará a distancia, que tiene limitaciones frente a una revisión presencial (no se puede explorar el pie por completo), que la sesión no se graba salvo que yo lo autorice, y que el podólogo podrá indicarme acudir a la clínica.

Autorizo que se registre una nota «a distancia» en mi expediente.`

const ESTADOS = {
  aun_no_es_hora: ['Aún no es la hora', 'Podrás entrar 10 minutos antes de tu cita.', 'a'],
  programada: ['Lista para entrar', 'Acepta el consentimiento y entra a la sala de espera.', 'b'],
  en_sala_espera: ['En sala de espera', 'Esperando a que el podólogo(a) te admita.', 'v'],
  en_consulta: ['En consulta', 'El podólogo(a) ya te admitió.', 'v'],
  finalizada: ['Finalizada', 'La videoconsulta terminó. Gracias por tu visita.', 'n'],
  liga_vencida: ['Liga vencida', 'Esta liga ya no es válida. Llama a la clínica.', 'r'],
}

export default function PortalSala() {
  const { token } = useParams()
  const [sala, setSala] = useState(null)
  const [error, setError] = useState(null)
  const [firma, setFirma] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [aceptaAviso, setAceptaAviso] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState(null)
  const [, tick] = useState(0)

  const cargar = useCallback(async () => {
    const { data, error: e } = await rpc('portal_sala_estado', { p_token: token })
    if (e) return setError(e)
    setError(null); setSala(data)
  }, [token])
  useEffect(() => { cargar(); const id = setInterval(cargar, 8000); return () => clearInterval(id) }, [cargar])
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(id) }, [])

  const entrar = async () => {
    setMsg(null); setOcupado(true)
    const { data, error: e } = await rpc('portal_sala_entrar', { p_token: token, p_nombre_firma: firma.trim(), p_acepta: acepta && aceptaAviso })
    setOcupado(false)
    if (e) return setMsg(mensajePortal(e))
    if (data.requiere_consentimiento) setMsg('Para entrar firma el consentimiento con tu nombre completo.')
    else if (!data.puede_entrar) setMsg(data.estado === 'aun_no_es_hora' ? 'Aún no es la hora de tu cita.' : 'No es posible entrar a esta sala.')
    cargar()
  }

  if (error) return <Marco><Problema titulo="Sala no disponible" texto={/no disponible/.test(error.message ?? '') ? 'Esta sala no existe o la liga ya no es válida.' : mensajePortal(error)} /></Marco>
  if (!sala) return <Marco><Cargando texto="Preparando tu sala…" /></Marco>

  const [etq, desc, color] = ESTADOS[sala.estado] ?? [sala.estado, '', 'n']
  const ya = ['en_sala_espera', 'en_consulta'].includes(sala.estado)
  const inicio = new Date(sala.inicio)
  const falta = Math.max(0, Math.floor((inicio - Date.now()) / 1000))
  const cuenta = `${String(Math.floor(falta / 3600)).padStart(2, '0')}:${String(Math.floor((falta % 3600) / 60)).padStart(2, '0')}:${String(falta % 60).padStart(2, '0')}`
  const firmado = sala.consentimiento_firmado
  const puedeIntentar = sala.puede_entrar && (firmado || (acepta && aceptaAviso && firma.trim().length >= 5))

  return (
    <Marco clinica={{ nombre: sala.clinica }} titulo="Sala de espera de tu videoconsulta" subtitulo={`${sala.podologo} · ${sala.clinica} · ${fechaLarga(sala.inicio)} · ${hora(sala.inicio)}`} ancho={760}>
      <div className="card" role="status" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`bd ${color}`}>{etq}</span><span style={{ fontSize: 14 }}>{desc}</span>
        {!['finalizada', 'liga_vencida'].includes(sala.estado) && <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{cuenta}</span>}
      </div>
      {['finalizada', 'liga_vencida'].includes(sala.estado) ? null : (
        <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
          <div>
            <PruebaDispositivos />
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Antes de empezar</h3>
              <ul style={{ fontSize: 13.5, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Ten buena luz y descubre el pie a revisar.</li><li>Ten a la mano tus medicamentos y estudios.</li><li>Si se corta la conexión, vuelve a entrar con esta misma liga.</li>
                <li>En emergencia (herida infectada, fiebre), acude a urgencias.</li>
              </ul>
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 6 }}>Consentimiento de telemedicina</h3>
            {firmado ? <div className="bd v">Consentimiento firmado</div> : (<>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto', background: 'var(--bg)', borderRadius: 8, padding: 10, marginBottom: 8 }}>{CONSENTIMIENTO}</div>
              <label style={{ display: 'block', fontSize: 13.5, marginBottom: 6 }}><input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} /> He leído y acepto el consentimiento de telemedicina.</label>
              <label style={{ display: 'block', fontSize: 13.5, marginBottom: 6 }}><input type="checkbox" checked={aceptaAviso} onChange={e => setAceptaAviso(e.target.checked)} /> Acepto el <VerTexto titulo="Aviso de privacidad" texto={AVISO_PRIVACIDAD}>aviso de privacidad</VerTexto>.</label>
              <FormField label="Tu nombre completo (firma)" required value={firma} onChange={e => setFirma(e.target.value)} autoComplete="name" hint="Quedan registrados la fecha, la hora y tu dispositivo." />
            </>)}
            {msg && <div role="alert" className="text-red" style={{ fontSize: 13, margin: '6px 0' }}>{msg}</div>}
            {ya ? (
              <div style={{ marginTop: 8 }}>
                <div className="bd v" style={{ marginBottom: 6 }}>{sala.estado === 'en_consulta' ? 'En consulta' : 'Estás en la sala de espera'}</div>
                <div className="text-muted" style={{ fontSize: 12.5 }}>Sala {sala.identificador}. El proveedor de video aún no está conectado en esta versión: la clínica te contactará por la vía acordada. Esta página se actualiza sola.</div>
              </div>
            ) : (
              <button className="btn" style={{ width: '100%', marginTop: 6 }} disabled={!puedeIntentar || ocupado} onClick={entrar}><Video size={14} style={{ verticalAlign: -2 }} /> {ocupado ? 'Entrando…' : 'Unirme a la videoconsulta'}</button>
            )}
            {!ya && !firmado && <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Se activa al aceptar el consentimiento y firmar.</div>}
          </div>
        </div>
      )}
    </Marco>
  )
}

// Vista previa local de cámara y micrófono: no se envía ni se graba nada.
function PruebaDispositivos() {
  const video = useRef(null)
  const flujo = useRef(null)
  const [est, setEst] = useState({ cam: null, mic: null, error: null })
  const [dispositivos, setDispositivos] = useState({ cams: [], mics: [] })
  const [camId, setCamId] = useState('')
  const parar = () => { flujo.current?.getTracks().forEach(t => t.stop()); flujo.current = null }
  useEffect(() => parar, [])
  const probar = async (id = '') => {
    parar()
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true, audio: true })
      flujo.current = s
      if (video.current) video.current.srcObject = s
      const d = await navigator.mediaDevices.enumerateDevices()
      setDispositivos({ cams: d.filter(x => x.kind === 'videoinput'), mics: d.filter(x => x.kind === 'audioinput') })
      setEst({ cam: s.getVideoTracks().length > 0, mic: s.getAudioTracks().length > 0, error: null })
    } catch (e) { setEst({ cam: false, mic: false, error: 'No pudimos acceder a tu cámara o micrófono. Revisa los permisos del navegador.' }) }
  }
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Revisa tu cámara y micrófono</h3>
      <div style={{ background: 'var(--bd-n-bg)', borderRadius: 8, aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', overflow: 'hidden', marginBottom: 8 }}>
        <video ref={video} autoPlay muted playsInline style={{ width: '100%', display: est.cam ? 'block' : 'none' }} />
        {!est.cam && <div className="text-muted" style={{ fontSize: 13 }}>Vista previa de tu cámara</div>}
      </div>
      {dispositivos.cams.length > 1 && <FormField label="Cámara" as="select" value={camId} onChange={e => { setCamId(e.target.value); probar(e.target.value) }} options={dispositivos.cams.map(c => ({ value: c.deviceId, label: c.label || 'Cámara' }))} />}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn o" onClick={() => probar(camId)}>Probar cámara y micrófono</button>
        {est.cam != null && <><span className={`bd ${est.cam ? 'v' : 'r'}`}><Camera size={11} /> Cámara {est.cam ? 'OK' : 'sin acceso'}</span><span className={`bd ${est.mic ? 'v' : 'r'}`}><Mic size={11} /> Micrófono {est.mic ? 'OK' : 'sin acceso'}</span></>}
      </div>
      {est.error && <div className="text-red" style={{ fontSize: 12.5, marginTop: 6 }}>{est.error}</div>}
    </div>
  )
}
