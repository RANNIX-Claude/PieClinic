// INICIO: Dashboard completo (/dashboard) y Resumen semanal. El ítem simple de menu/inicio.js ('/') lo reemplaza este.
export default {
  grupo: 'INICIO', orden: 20,
  items: [
    { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Resumen semanal', path: '/resumen-semanal', icon: 'CalendarRange', roles: ['administrador'] },
  ],
}
