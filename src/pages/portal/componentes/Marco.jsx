// Marco visual del portal público del paciente (sin sesión, sin menú de la app). Usa los tokens del tema.
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import { AVISO_PRIVACIDAD, TERMINOS_RESERVA } from '../textos'

export function VerTexto({ children, titulo, texto }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>{children}</button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title={titulo} footer={<button className="btn" onClick={() => setAbierto(false)}>Entendido</button>}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{texto}</div>
        <div className="text-muted" style={{ fontSize: 11.5, marginTop: 10 }}>Texto base por clínica; debe validarse con el abogado de la clínica antes de operar con pacientes reales.</div>
      </Modal>
    </>
  )
}

export default function Marco({ clinica, titulo, subtitulo, children, ancho = 880 }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
        <div style={{ maxWidth: ancho, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {clinica?.logo_url ? <img src={clinica.logo_url} alt="" style={{ height: 36 }} /> : <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{(clinica?.nombre ?? 'P')[0]}</span>}
          <div><b style={{ fontSize: 16 }}>{clinica?.titulo || clinica?.nombre || 'Pie Firme'}</b><div className="text-muted" style={{ fontSize: 12 }}>{clinica?.nombre ? 'Podología' : 'Tu clínica de podología'}</div></div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}><ShieldCheck size={14} /> Sin crear cuenta</div>
        </div>
      </header>
      <main style={{ flex: 1, width: '100%', maxWidth: ancho, margin: '0 auto', padding: '18px 16px 40px' }}>
        {titulo && <h1 className="pagina-titulo" style={{ fontSize: 24, marginBottom: 2 }}>{titulo}</h1>}
        {subtitulo && <div className="pagina-sub" style={{ marginBottom: 14 }}>{subtitulo}</div>}
        {children}
      </main>
      <footer style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
        {clinica?.whatsapp_url && <><a href={clinica.whatsapp_url} target="_blank" rel="noreferrer">WhatsApp</a> · </>}
        <VerTexto titulo="Aviso de privacidad" texto={AVISO_PRIVACIDAD}>Aviso de privacidad</VerTexto> · <VerTexto titulo="Términos y política de cancelación" texto={TERMINOS_RESERVA}>Términos y condiciones</VerTexto>
        <div style={{ marginTop: 4 }}>Reservas con Pie Firme · RANNIX</div>
      </footer>
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }) { return <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>{texto}</div> }
export function Problema({ titulo, texto, accion }) {
  return <div className="card" style={{ textAlign: 'center', padding: 30 }}><h2 style={{ marginBottom: 6 }}>{titulo}</h2><p style={{ color: 'var(--muted)', fontSize: 14 }}>{texto}</p>{accion}</div>
}
/** Mensaje legible de un error de las RPC portal_* (códigos PF4xx). */
export function mensajePortal(error) {
  const m = String(error?.message ?? error ?? '')
  if (error?.code === 'SIN_CONEXION') return 'No hay conexión con el servidor. Intenta de nuevo en unos minutos.'
  if (/horario_no_disponible/.test(m)) return 'Ese horario ya no está disponible. Elige otro.'
  if (/limite_reservas/.test(m)) return 'Ya tienes el máximo de reservas activas. Cancela una o llama a la sede.'
  if (/limite_lista_espera/.test(m)) return 'Ya estás en el máximo de listas de espera.'
  if (/liga_vencida/.test(m)) return 'Esta liga ya no es válida. Llama a la sede.'
  if (/reprogramacion_no_permitida/.test(m)) return 'Ya no es posible reprogramar sin costo. Puedes cancelar o llamar a la sede.'
  if (/rate|limite|demasiad|429/i.test(m)) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  if (/no disponible|no encontrada|PGRST/i.test(m)) return 'No encontramos esta página. Revisa la liga que recibiste.'
  return m.replace(/^PF\d+:?\s*/, '') || 'Ocurrió un error. Intenta de nuevo.'
}
