import { useState, useRef, useEffect } from 'react'
import { Menu, X, LogOut, User, MapPin, Moon, Sun } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { ROLES } from '../../lib/permisos'

// Selector de sede: se usa en el encabezado de escritorio y en el móvil.
export function SelectorSede({ compacto }) {
  const { sedes, sedeActivaId, setSedeActiva } = useApp()
  if (!sedes.length) return null
  const unica = sedes.length === 1
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.18)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
      <MapPin size={13} />
      {unica ? <span>{sedes[0].nombre}</span> : (
        <select value={sedeActivaId ?? ''} onChange={e => setSedeActiva(e.target.value || null)} aria-label="Sede activa"
          style={{ background: 'transparent', color: '#fff', border: 0, fontSize: 12, fontWeight: 600, maxWidth: compacto ? 120 : 190, cursor: 'pointer', outline: 'none' }}>
          <option value="" style={{ color: '#1D1D1F' }}>Todas las sedes</option>
          {sedes.map(s => <option key={s.id} value={s.id} style={{ color: '#1D1D1F' }}>{s.nombre}</option>)}
        </select>
      )}
    </label>
  )
}

export function MenuUsuario({ compacto }) {
  const { user, perfil, rol, organizacion, tema, setTema, cerrarSesion } = useApp()
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const f = e => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [])
  const nombre = perfil ? [perfil.nombre, perfil.apellidos].filter(Boolean).join(' ') : (user?.email ?? 'Usuario')
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button onClick={() => setAbierto(!abierto)} aria-haspopup="menu" aria-expanded={abierto} style={{
        background: 'rgba(255,255,255,.18)', border: 'none', color: 'white', cursor: 'pointer', padding: '5px 10px', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
      }}>
        <User size={15} />
        {!compacto && <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>}
      </button>
      {abierto && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: '115%', background: 'var(--white)', color: 'var(--text)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)', minWidth: 230, overflow: 'hidden', zIndex: 100, border: '1px solid var(--border)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{nombre}</div>
            <div style={{ color: 'var(--muted)' }}>{ROLES[rol] ?? rol}{organizacion ? ` · ${organizacion.nombre}` : ''}</div>
            <div style={{ color: 'var(--muted)' }}>{user?.email}</div>
          </div>
          <button onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')} style={itemMenu}>
            {tema === 'dark' ? <Sun size={14} /> : <Moon size={14} />} Tema {tema === 'dark' ? 'claro' : 'oscuro'}
          </button>
          <button onClick={() => { setAbierto(false); cerrarSesion() }} style={{ ...itemMenu, color: 'var(--red)' }}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
const itemMenu = { width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', textAlign: 'left' }

export default function Header() {
  const { sidebarOpen, setSidebarOpen, organizacion, esRannix } = useApp()
  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 'var(--header-height)', background: 'var(--header-bg)', color: 'var(--header-text)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, boxShadow: 'var(--shadow-md)',
    }}>
      <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Mostrar u ocultar el menú" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex' }}>
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Pie Firme" style={{ height: 36, background: '#fff', borderRadius: 8, padding: 2 }} />
      <b style={{ fontSize: 15 }}>Pie Firme</b>
      {organizacion && !esRannix && <span style={{ fontSize: 12, opacity: .85, borderLeft: '1px solid rgba(255,255,255,.35)', paddingLeft: 12 }}>{organizacion.nombre}</span>}
      {import.meta.env.VITE_AMBIENTE === 'QA' && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 4, background: '#F5A623', color: '#1D1D1F' }}>QA</span>}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
        <SelectorSede />
        <MenuUsuario />
      </div>
    </header>
  )
}
