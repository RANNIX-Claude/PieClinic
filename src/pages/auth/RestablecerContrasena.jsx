import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { MarcoAcceso, estiloEtiqueta, estiloInput } from '../Login'

// Destino del enlace del correo de recuperación: Supabase abre una sesión temporal y aquí se fija la nueva contraseña.
export default function RestablecerContrasena() {
  const { user, cambiarContrasena } = useApp()
  const nav = useNavigate()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  const [cargando, setCargando] = useState(false)

  async function guardar(e) {
    e.preventDefault(); setError('')
    if (p1.length < 10) { setError('Usa al menos 10 caracteres.'); return }
    if (p1 !== p2) { setError('Las contraseñas no coinciden.'); return }
    setCargando(true)
    const { error: err } = await cambiarContrasena(p1)
    setCargando(false)
    if (err) { setError(err.message); return }
    setListo(true)
    setTimeout(() => nav('/', { replace: true }), 1500)
  }
  return (
    <MarcoAcceso>
      <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}>Nueva contraseña</h1>
      <p style={{ textAlign: 'center', color: 'var(--muted)', margin: '2px 0 22px' }}>Elige una contraseña que no uses en otro sitio</p>
      {!user ? (
        <div role="alert" style={{ background: 'var(--bd-a-bg)', color: 'var(--bd-a-fg)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
          El enlace venció o ya se usó. <Link to="/recuperar" style={{ fontWeight: 700 }}>Pide uno nuevo</Link>.
        </div>
      ) : listo ? (
        <div role="status" style={{ background: 'var(--bd-v-bg)', color: 'var(--green)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>Contraseña actualizada. Entrando…</div>
      ) : (
        <form onSubmit={guardar}>
          <label htmlFor="pf-n1" style={estiloEtiqueta}>Contraseña nueva</label>
          <input id="pf-n1" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} style={estiloInput} required />
          <label htmlFor="pf-n2" style={estiloEtiqueta}>Repite la contraseña</label>
          <input id="pf-n2" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} style={estiloInput} required />
          {error && <div role="alert" style={{ background: 'var(--bd-r-bg)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <button className="btn" type="submit" disabled={cargando} style={{ width: '100%', padding: 11, fontSize: 14 }}>{cargando ? 'Guardando…' : 'Guardar contraseña'}</button>
        </form>
      )}
    </MarcoAcceso>
  )
}
