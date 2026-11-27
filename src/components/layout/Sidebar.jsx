import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { menuParaRol } from '../../lib/registro'
import { resolverIcono } from '../../lib/iconos'

/** Menú de un rol, generado desde src/menu/*.js. Compartido por Sidebar (escritorio) y MobileShell (cajón «Más»). */
export function useMenu() {
  const { rol, liberacion, esResponsable } = useApp()
  return useMemo(() => menuParaRol(rol, liberacion), [rol, liberacion, esResponsable])
}

export function EnlaceMenu({ item, colapsado, onNavegar }) {
  const Icono = resolverIcono(item.icon)
  return (
    <NavLink to={item.path} end={item.end ?? item.path === '/'} onClick={onNavegar} title={colapsado ? item.label : undefined}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 9, padding: colapsado ? '9px 0' : '7px 16px', justifyContent: colapsado ? 'center' : 'flex-start',
        fontSize: 12.5, textDecoration: 'none', color: isActive ? 'var(--accent-dark)' : 'var(--text)', fontWeight: isActive ? 700 : 400,
        background: isActive ? 'var(--accent-light)' : 'transparent',
        borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`, paddingLeft: colapsado ? 0 : 13,
      })}>
      {({ isActive }) => (
        <>
          <Icono size={15} color={isActive ? 'var(--accent)' : 'var(--muted)'} style={{ flexShrink: 0 }} />
          {!colapsado && <span style={{ flex: 1 }}>{item.label}</span>}
          {!colapsado && item.badge != null && <span className="bd m">{item.badge}</span>}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { sidebarOpen } = useApp()
  const grupos = useMenu()
  const colapsado = !sidebarOpen
  return (
    <aside aria-label="Menú principal" style={{
      position: 'fixed', top: 'var(--header-height)', bottom: 0, left: 0, width: colapsado ? 'var(--sidebar-width-colapsado)' : 'var(--sidebar-width)',
      background: 'var(--side-bg)', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '10px 0', zIndex: 40, transition: 'width .2s ease',
    }}>
      {grupos.map(g => (
        <div key={g.grupo}>
          {colapsado
            ? <div style={{ height: 1, background: 'var(--border)', margin: '8px 10px' }} />
            : <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', padding: '12px 16px 4px' }}>{g.grupo}</div>}
          {g.items.map(i => <EnlaceMenu key={i.path + i.label} item={i} colapsado={colapsado} />)}
        </div>
      ))}
    </aside>
  )
}
