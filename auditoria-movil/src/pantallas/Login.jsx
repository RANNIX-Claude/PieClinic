// Acceso por usuario y PIN (4 a 6 dígitos). Alta del usuario en este teléfono: correo y contraseña, una sola vez.
import { useEffect, useState } from 'react'
import { activarUsuario, agregarUsuario, entrarConPin, quitarUsuario, usuariosDelDispositivo } from '../sesion'
import { TEXTO_MOTIVO, esPinValido } from '../../../src/lib/auditoria/pwaSesion.js'

export default function Login({ motivo, usuarioIdPrevio, onEntrar, enLinea }) {
  const [usuarios, setUsuarios] = useState(usuariosDelDispositivo())
  const [elegido, setElegido] = useState(null)
  const [alta, setAlta] = useState(usuarios.length === 0)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [correo, setCorreo] = useState(''), [clave, setClave] = useState('')
  const [pin, setPin] = useState('')
  const [sucId, setSucId] = useState('')

  useEffect(() => { if (usuarioIdPrevio && !elegido) { const u = usuarios.find(x => x.id === usuarioIdPrevio); if (u) elegir(u) } }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function elegir(u) {
    setError(null); setPin('')
    try { await activarUsuario(u.id) } catch (e) { setError(e.message) }
    setElegido(u)
    const guardada = localStorage.getItem('pf-aud-suc-' + u.id)
    setSucId(u.sedes.find(s => s.id === guardada)?.id ?? u.sedes[0]?.id ?? '')
  }
  async function darDeAlta(e) {
    e.preventDefault(); setOcupado(true); setError(null)
    try { const u = await agregarUsuario(correo, clave); setUsuarios(usuariosDelDispositivo()); setAlta(false); setClave(''); await elegir(usuariosDelDispositivo().find(x => x.id === u.id)) }
    catch (er) { setError(er.message) } finally { setOcupado(false) }
  }
  async function entrar(e) {
    e.preventDefault(); setOcupado(true); setError(null)
    try {
      const suc = elegido.sedes.find(s => s.id === sucId)
      if (!suc) throw new Error('Elige la sucursal.')
      localStorage.setItem('pf-aud-suc-' + elegido.id, suc.id)
      onEntrar(await entrarConPin(elegido, suc, pin))
    } catch (er) { setError(er.message); setPin('') } finally { setOcupado(false) }
  }

  return (
    <div className="app" style={{ justifyContent: 'center', padding: 18 }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}><img src="/aud/icons/piefirme-192.png" alt="" width="72" height="72" style={{ borderRadius: 16 }} /><h1 style={{ marginTop: 8 }}>Pie Firme · Auditoría</h1></div>
      {!enLinea && <div className="aviso" data-testid="login-sin-red">Sin señal: para entrar con PIN hace falta conexión (el servidor valida el PIN y ata la sesión a tu turno).</div>}
      {motivo && !elegido && <div className="aviso info" data-testid="motivo-sesion">{TEXTO_MOTIVO[motivo] ?? TEXTO_MOTIVO.sin_sesion}</div>}
      {error && <div className="aviso rojo" role="alert" data-testid="error-login">{error}</div>}

      {!elegido && !alta && <>
        <p className="hint">¿Quién eres?</p>
        {usuarios.map(u => <button key={u.id} className="usuario" onClick={() => elegir(u)} data-testid="usuario-chip"><b>{u.nombre}</b><div className="hint">{u.email}</div></button>)}
        <button className="btn o bloque" onClick={() => setAlta(true)}>Agregar otro usuario a este teléfono</button>
      </>}

      {!elegido && alta && (
        <form onSubmit={darDeAlta} className="card">
          <h3>Agregar usuario a este teléfono</h3>
          <p className="hint">Solo la primera vez: correo y contraseña. Después entras con tu PIN.</p>
          <label>Correo</label><input type="email" autoComplete="username" value={correo} onChange={e => setCorreo(e.target.value)} data-testid="correo" />
          <label>Contraseña</label><input type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} data-testid="clave" />
          <button className="btn bloque" style={{ marginTop: 12 }} disabled={ocupado || !correo || !clave || !enLinea} data-testid="alta-usuario">{ocupado ? 'Entrando…' : 'Agregar'}</button>
          {usuarios.length > 0 && <button type="button" className="btn o bloque" style={{ marginTop: 8 }} onClick={() => setAlta(false)}>Cancelar</button>}
        </form>
      )}

      {elegido && (
        <form onSubmit={entrar} className="card">
          <h3>{elegido.nombre}</h3>
          {elegido.sedes.length > 1 && <><label>Sucursal</label><select value={sucId} onChange={e => setSucId(e.target.value)} data-testid="sucursal">{elegido.sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></>}
          {elegido.sedes.length === 1 && <div className="hint">{elegido.sedes[0].nombre}</div>}
          <label>Tu PIN (4 a 6 dígitos)</label>
          <input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={6} value={pin} autoFocus className="num-grande" onChange={e => setPin(e.target.value.replace(/\D/g, ''))} data-testid="pin" />
          <button className="btn bloque" style={{ marginTop: 12 }} disabled={ocupado || !esPinValido(pin) || !enLinea} data-testid="entrar">{ocupado ? 'Entrando…' : 'Entrar'}</button>
          <button type="button" className="btn o bloque" style={{ marginTop: 8 }} onClick={() => { setElegido(null); setError(null) }}>No soy yo</button>
          <button type="button" className="btn o bloque sm" style={{ marginTop: 8 }} onClick={() => { if (window.confirm('¿Quitar a este usuario de este teléfono? Sus capturas pendientes de enviar se conservan.')) { quitarUsuario(elegido.id); setUsuarios(usuariosDelDispositivo()); setElegido(null) } }}>Quitar de este teléfono</button>
        </form>
      )}
    </div>
  )
}
