import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { resolverIcono } from '../../lib/iconos'
import { SelectorSede, MenuUsuario } from './Header'
import { useMenu, EnlaceMenu } from './Sidebar'
import Footer from './Footer'
import { TABS_MOVIL, rolMovil, MIN_TABS } from '../../config/movil.tabs'
import { useBadgesMovil } from '../../lib/badgesMovil'

/**
 * Marco para celular/tableta angosta (PWA): barra superior compacta, contenido y barra inferior con los 4 accesos
 * principales del rol (los primeros ítems del menú) + «Más» con el menú completo. Las MISMAS páginas que en escritorio,
 * con la clase .pagina responsiva; no hay páginas móviles aparte.
 */
export default function MobileShell({ children }) {
  const { organizacion } = useApp()
  const grupos = useMenu()
  const [mas, setMas] = useState(false)
  const { rol, esRannix } = useApp()
  const todos = grupos.flatMap(g => g.items)
  // Barra inferior por rol: viene de config/movil.tabs.js (datos, no código). Una pestaña solo aparece si su ruta está en el menú
  // del rol (permisos); si quedan menos de MIN_TABS se cae a los primeros ítems del menú.
  const config = TABS_MOVIL[rolMovil(rol, esRannix)] ?? []
  const elegidas = config.map(t => ({ ...t, existe: todos.some(i => i.path === t.path) })).filter(t => t.existe)
  const rapidos = elegidas.length >= MIN_TABS ? elegidas : todos.slice(0, 4).map(i => ({ path: i.path, label: i.label, icon: i.icon }))
  const badges = useBadgesMovil(rapidos)
  // Puerta instalable por rol: el navegador instala el manifiesto vigente al momento de «Agregar a inicio»; cada rol tiene el suyo
  // (nombre, accesos directos y start_url propios) y una instalación por rol no se pisa con la de otro.
  const rolPwa = rolMovil(rol, esRannix)
  useEffect(() => {
    const enlace = document.querySelector('link[rel="manifest"]')
    if (enlace && rolPwa && TABS_MOVIL[rolPwa]) enlace.setAttribute('href', `/manifests/piefirme-${rolPwa}.webmanifest`)
  }, [rolPwa])
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--header-bg)', color: '#fff', height: 'var(--header-height)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Pie Firme" style={{ height: 32, background: '#fff', borderRadius: 8, padding: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>Pie Firme</div>
          <div style={{ fontSize: 10, opacity: .85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{organizacion?.nombre}</div>
        </div>
        <SelectorSede compacto />
        <MenuUsuario compacto />
      </header>

      <main style={{ flex: 1, paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>{children}</main>
      <div style={{ paddingBottom: 'calc(58px + env(safe-area-inset-bottom))' }}><Footer /></div>

      <nav aria-label="Navegación inferior" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'var(--side-bg)', borderTop: '1px solid var(--border)',
        display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {rapidos.map(i => {
          const Icono = resolverIcono(i.icon)
          const n = i.badge ? badges[i.badge] : 0
          return (
            <NavLink key={i.path} to={i.path} end={i.path === '/'} aria-label={n ? `${i.label}, ${n} pendientes` : i.label} style={({ isActive }) => ({
              flex: 1, minHeight: 56, minWidth: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 2px', textDecoration: 'none', fontSize: 11,
              color: isActive || i.principal ? 'var(--accent)' : 'var(--muted)', fontWeight: isActive || i.principal ? 700 : 500, position: 'relative',
            })}>
              <span style={{ position: 'relative', display: 'inline-flex', ...(i.principal ? { background: 'var(--accent-light)', borderRadius: 14, padding: '4px 14px' } : null) }}>
                <Icono size={i.principal ? 22 : 20} />
                {n > 0 && <span className="bd m" style={{ position: 'absolute', top: -6, right: i.principal ? 2 : -10, minWidth: 18, height: 18, padding: '0 4px', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>{n > 99 ? '99+' : n}</span>}
              </span>
              <span>{i.label.length > 12 ? i.label.slice(0, 11) + '…' : i.label}</span>
            </NavLink>
          )
        })}
        <button onClick={() => setMas(true)} aria-label="Más opciones" style={{ flex: 1, minHeight: 56, minWidth: 44, background: 'none', border: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 2px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
          <MoreHorizontal size={20} /><span>Más</span>
        </button>
      </nav>

      {mas && (
        <div onClick={() => setMas(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80vh', overflowY: 'auto', background: 'var(--side-bg)', borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <b style={{ flex: 1 }}>Menú</b>
              <button onClick={() => setMas(false)} aria-label="Cerrar" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)' }}><X size={20} /></button>
            </div>
            {grupos.map(g => (
              <div key={g.grupo}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', padding: '12px 16px 4px' }}>{g.grupo}</div>
                {g.items.map(i => <EnlaceMenu key={i.path + i.label} item={i} onNavegar={() => setMas(false)} />)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
