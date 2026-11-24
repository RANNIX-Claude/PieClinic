// Barra inferior del móvil POR ROL, definida como datos (no en el componente). Ver docs/MOVIL_MATRIZ_POR_ROL.md (compuerta aprobada).
// Reglas: máximo 4 pestañas + «Más» (menú completo por permisos). Si una ruta no está en el menú del rol, no se muestra (la autoridad de
// permisos es el servidor: RLS; esto solo ordena la navegación). `principal` marca la acción dominante del rol (se destaca en la barra).
// `badge` nombra un contador de pendientes que calcula useBadgesMovil (solo lo que existe en datos; nada inventado).
//
//   { path, label, icon (lucide por nombre, ver lib/iconos), badge?, principal? }

export const TABS_MOVIL = {
  recepcion: [
    { path: '/', label: 'Hoy', icon: 'Home' },
    { path: '/agenda', label: 'Agenda', icon: 'CalendarDays', badge: 'citas_por_confirmar' },
    { path: '/caja', label: 'Cobrar', icon: 'Wallet', principal: true },
    { path: '/pacientes', label: 'Pacientes', icon: 'Users' },
  ],
  podologo: [
    { path: '/', label: 'Hoy', icon: 'Home' },
    { path: '/mi-agenda', label: 'Mi agenda', icon: 'CalendarDays' },
    { path: '/consultas', label: 'Consultas', icon: 'Stethoscope', badge: 'consultas_sin_firmar', principal: true },
    { path: '/pacientes', label: 'Pacientes', icon: 'Users' },
  ],
  administrador: [
    { path: '/analisis/ejecutivo', label: 'Tablero', icon: 'BarChart3' },
    { path: '/agenda', label: 'Agenda', icon: 'CalendarDays' },
    { path: '/caja', label: 'Caja', icon: 'Wallet' },
    { path: '/', label: 'Alertas', icon: 'Bell' },       // el inicio del administrador concentra alertas y autorizaciones
  ],
  supervisor: [
    { path: '/analisis/ejecutivo', label: 'Tablero', icon: 'BarChart3' },
    { path: '/agenda', label: 'Agenda', icon: 'CalendarDays' },
    { path: '/inventario', label: 'Inventario', icon: 'Package' },
    { path: '/traspasos', label: 'Traspasos', icon: 'Truck' },
  ],
  // Superadministrador = administrador + miembro de RANNIX: la 4.ª pestaña pasa a ser el panel de clínicas.
  superadmin: [
    { path: '/analisis/ejecutivo', label: 'Tablero', icon: 'BarChart3' },
    { path: '/agenda', label: 'Agenda', icon: 'CalendarDays' },
    { path: '/caja', label: 'Caja', icon: 'Wallet' },
    { path: '/rannix', label: 'Clínicas', icon: 'Gauge' },
  ],
}

/** Rol de navegación móvil: el superadministrador tiene su propia barra. */
export const rolMovil = (rol, esRannix) => (esRannix && rol === 'administrador' ? 'superadmin' : rol)

/** Mínimo de pestañas resolubles para respetar la barra del rol; si no, se cae a los primeros ítems del menú. */
export const MIN_TABS = 3
