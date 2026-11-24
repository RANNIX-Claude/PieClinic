// Pública (sin sesión): destino del enlace de invitación. El token es la credencial; la función servidor `invitacion-aceptar`
// crea la cuenta y consume la invitación (una cuenta = una clínica, P-119). Después se entra por el Login normal.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MarcoAcceso, estiloEtiqueta, estiloInput } from '../../Login'

export default function AceptarInvitacion() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [nombre, setNombre] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const [listo, setListo] = useState(null)
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault(); setError('')
    if (p1.length < 10) return setError('Usa al menos 10 caracteres.')
    if (p1 !== p2) return setError('Las contraseñas no coinciden.')
    setCargando(true)
    try {
      const r = await fetch('/.netlify/functions/invitacion-aceptar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: p1, nombre: nombre.trim() || null, apellidos: apellidos.trim() || null }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) setError(j.error || 'No se pudo crear tu cuenta. Intenta de nuevo.')
      else setListo(j.data?.email ?? true)
    } catch { setError('No se pudo contactar al servidor. Revisa tu conexión.') }
    setCargando(false)
  }

  return (
    <MarcoAcceso>
      <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>Crea tu cuenta</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)', margin: '2px 0 22px' }}>Aceptas la invitación a tu clínica en Pie Firme</p>
      {!token ? (
        <div role="alert" style={{ background: 'var(--bd-a-bg)', color: 'var(--bd-a-fg)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>El enlace está incompleto. Pide una invitación nueva a tu administrador.</div>
      ) : listo ? (
        <div role="status" style={{ background: 'var(--bd-v-bg)', color: 'var(--green)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
          Cuenta creada{typeof listo === 'string' ? ` para ${listo}` : ''}. <Link to="/login" style={{ fontWeight: 700 }}>Iniciar sesión</Link>
        </div>
      ) : (
        <form onSubmit={enviar}>
          <label htmlFor="ai-n" style={estiloEtiqueta}>Nombre</label>
          <input id="ai-n" value={nombre} onChange={e => setNombre(e.target.value)} style={estiloInput} autoComplete="given-name" />
          <label htmlFor="ai-a" style={estiloEtiqueta}>Apellidos</label>
          <input id="ai-a" value={apellidos} onChange={e => setApellidos(e.target.value)} style={estiloInput} autoComplete="family-name" />
          <label htmlFor="ai-p1" style={estiloEtiqueta}>Contraseña</label>
          <input id="ai-p1" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} style={estiloInput} required />
          <label htmlFor="ai-p2" style={estiloEtiqueta}>Repite la contraseña</label>
          <input id="ai-p2" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} style={estiloInput} required />
          {error && <div role="alert" style={{ background: 'var(--bd-r-bg)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <button className="btn" type="submit" disabled={cargando} style={{ width: '100%', padding: 11, fontSize: 14 }}>{cargando ? 'Creando…' : 'Crear cuenta'}</button>
        </form>
      )}
    </MarcoAcceso>
  )
}
