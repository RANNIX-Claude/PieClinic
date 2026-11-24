import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { MarcoAcceso, estiloEtiqueta, estiloInput } from '../Login'

// Recuperación por correo (estilo mockup 49). Siempre responde lo mismo exista o no la cuenta (no revela usuarios).
export default function RecuperarContrasena() {
  const { recuperarContrasena, sinConexion } = useApp()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault(); setError(''); setCargando(true)
    const { error: err } = await recuperarContrasena(email.trim())
    setCargando(false)
    if (err && err.code === 'SIN_CONEXION') { setError(err.message); return }
    setEnviado(true)
  }
  return (
    <MarcoAcceso>
      <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>Recuperar contraseña</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)', margin: '2px 0 22px' }}>Te enviaremos un enlace para crear una contraseña nueva</p>
      {enviado ? (
        <div role="status" style={{ background: 'var(--bd-v-bg)', color: 'var(--green)', borderRadius: 8, padding: '12px 14px', fontSize: 13, marginBottom: 14 }}>
          Si el correo está registrado, recibirás un enlace en unos minutos. Revisa también la carpeta de spam.
        </div>
      ) : (
        <form onSubmit={enviar}>
          <label htmlFor="pf-rec" style={estiloEtiqueta}>Correo electrónico</label>
          <input id="pf-rec" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={estiloInput} placeholder="correo electrónico" />
          {error && <div role="alert" style={{ background: 'var(--bd-r-bg)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <button className="btn" type="submit" disabled={cargando || sinConexion || !email} style={{ width: '100%', padding: 11, fontSize: 14 }}>{cargando ? 'Enviando…' : 'Enviar enlace'}</button>
        </form>
      )}
      <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/login" style={{ color: 'var(--accent-dark)', fontSize: 12.5 }}>Volver a iniciar sesión</Link></div>
    </MarcoAcceso>
  )
}
