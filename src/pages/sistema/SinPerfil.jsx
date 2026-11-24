import { useApp } from '../../context/AppContext'
import { MarcoAcceso } from '../Login'

// La sesión es válida pero no hay perfil activo (usuario sin clínica, inactivo o error al leerlo).
export default function SinPerfil({ mensaje }) {
  const { cerrarSesion, user } = useApp()
  return (
    <MarcoAcceso pie={user?.email}>
      <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>No pudimos abrir tu clínica</h1>
      <p role="alert" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, marginBottom: 18 }}>{mensaje}</p>
      <button className="btn" style={{ width: '100%', padding: 11 }} onClick={cerrarSesion}>Cerrar sesión</button>
    </MarcoAcceso>
  )
}
