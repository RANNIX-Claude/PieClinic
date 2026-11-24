// Menú del área COMERCIAL: grupos AGENDA y VENTAS (contrato: docs/FRONTEND_ARQUITECTURA.md).
// Exporta un solo objeto por archivo; los ítems de VENTAS van en menu/comercial_ventas.js.
export default {
  grupo: 'AGENDA',
  orden: 20,
  items: [
    { label: 'Agenda', path: '/agenda', icon: 'CalendarDays', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Mi agenda (móvil)', path: '/mi-agenda', icon: 'UserCheck', roles: ['podologo'] },
    { label: 'Lista de espera', path: '/lista-espera', icon: 'Clock', roles: ['administrador', 'recepcion'] },
    { label: 'Recordatorios', path: '/recordatorios', icon: 'Bell', roles: ['administrador', 'recepcion'] },
    { label: 'Horarios y bloqueos', path: '/agenda/horarios', icon: 'CalendarRange', roles: ['administrador', 'podologo', 'recepcion'] },
  ],
}
