import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

// Etiqueta de la versión liberada, V_AAMMDD_HHMM (la fija vite.config.js al compilar)
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export function MarcoAcceso({ children, pie }) {
  const { sinConexion, mensajeSinConexion } = useApp()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, var(--accent-light), var(--bg) 60%)' }}>
      {sinConexion && <div className="aviso err" role="alert"><b>Sin conexión.</b> {mensajeSinConexion}</div>}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 400, background: 'var(--white)', borderRadius: 16, boxShadow: '0 8px 32px rgba(90,64,128,.15)', padding: '34px 34px 28px' }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Pie Firme" style={{ height: 84, display: 'block', margin: '0 auto 10px' }} />
          {children}
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11.5, marginTop: 18 }}>{pie ?? 'Podólogo · Recepción · Administrador · piefirme.rannix.com/app'}</div>
          <div title="Versión liberada" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 6, letterSpacing: '.03em' }}>{VERSION}</div>
        </div>
      </div>
    </div>
  )
}

export const estiloEtiqueta = { display: 'block', fontWeight: 600, fontSize: 13, margin: '0 0 6px' }
export const estiloInput = { display: 'block', width: '100%', marginBottom: 16, padding: '10px 12px', fontSize: 14, border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--white)', color: 'var(--text)' }

// Cuentas de PRUEBA por rol (scripts/qa-usuarios-prueba.mjs). Se muestran salvo que VITE_ENTORNO=prod (variable del sitio de producción en Netlify).
const ACCESOS_PRUEBA = import.meta.env.VITE_ENTORNO !== 'prod'
const CUENTAS = [
  { correo: 'a@g.com', rol: 'Superadmin' }, { correo: 'm@g.com', rol: 'Administrador' },
  { correo: 'p@g.com', rol: 'Podólogo' }, { correo: 'r@g.com', rol: 'Recepción' },
]

function IconoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export default function Login() {
  const { iniciarSesion, iniciarSesionGoogle, sinConexion } = useApp()
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!email.includes('@')) { setError('Escribe tu correo electrónico (el mismo con el que te invitaron).'); return }
    setCargando(true)
    const { error: err } = await iniciarSesion(email.trim(), password)
    setCargando(false)
    if (err) {
      setError(err.code === 'SIN_CONEXION' ? err.message : /invalid login/i.test(err.message) ? 'Correo o contraseña incorrectos.' : /locked|too many|rate/i.test(err.message) ? 'Demasiados intentos. Espera unos minutos o recupera tu contraseña.' : err.message)
      return
    }
    nav(location.state?.desde ?? '/', { replace: true })
  }

  return (
    <MarcoAcceso>
      <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>Pie Firme</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)', margin: '2px 0 22px' }}>Expediente, agenda y administración de tu clínica de podología</p>
      <form onSubmit={enviar} noValidate>
        <label htmlFor="pf-email" style={estiloEtiqueta}>Usuario</label>
        <input id="pf-email" type="email" autoComplete="username" placeholder="correo electrónico" value={email} onChange={e => setEmail(e.target.value)} style={estiloInput} required />
        <label htmlFor="pf-pass" style={estiloEtiqueta}>Contraseña</label>
        <input id="pf-pass" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} style={estiloInput} required />
        {error && <div role="alert" style={{ background: 'var(--bd-r-bg)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button className="btn" type="submit" disabled={cargando || sinConexion || !email || !password} style={{ width: '100%', padding: 11, fontSize: 14, margin: '6px 0 12px' }}>
          {cargando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <Link to="/recuperar" style={{ color: 'var(--accent-dark)', fontSize: 12.5 }}>¿Olvidaste tu contraseña?</Link>
      </div>
      {ACCESOS_PRUEBA && (
        <div role="note" style={{ border: '1px dashed var(--gold)', borderRadius: 8, padding: '8px 10px', margin: '0 0 12px', fontSize: 12 }}>
          <b>Accesos de prueba</b> (contraseña <b>123456</b>) — <span style={{ color: 'var(--red)' }}>solo QA: quitar antes de producción</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {CUENTAS.map(c => (
              <button key={c.correo} type="button" className="btn o sm" onClick={() => { setEmail(c.correo); setPassword('123456') }} title={c.rol}>
                {c.correo} · {c.rol}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--muted)', fontSize: 12, margin: '4px 0 12px' }}>
        <i style={{ flex: 1, height: 1, background: 'var(--border)' }} />o continúa con<i style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <button type="button" onClick={async () => { const { error: err } = await iniciarSesionGoogle(); if (err) setError(err.message) }} disabled={sinConexion}
        style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', color: 'var(--text)', fontSize: 14, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}>
        <IconoGoogle /> Continuar con Google
      </button>
    </MarcoAcceso>
  )
}
