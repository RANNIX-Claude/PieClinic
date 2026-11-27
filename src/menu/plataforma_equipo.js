export default {
  grupo: 'EQUIPO', orden: 10,
  items: [
    { label: 'RH y nómina', path: '/rh', end: true, icon: 'UserCog', roles: ['administrador'] },
    { label: 'Asignación de personal', path: '/rh/asignacion', icon: 'ArrowRightLeft', roles: ['administrador'], cap: 'personal.asignar' },
    { label: 'Rotación de personal', path: '/rh/rotacion', icon: 'CalendarDays', roles: ['administrador'], cap: 'personal.asignar' },
    { label: 'Mi sucursal', path: '/mi-sucursal', icon: 'Store', roles: ['podologo'], cap: 'sucursal.ver' },
    { label: 'Mis recibos', path: '/mis-recibos', icon: 'FileText', roles: ['podologo', 'recepcion'] },
    { label: 'Comisiones', path: '/comisiones', icon: 'Percent', roles: ['administrador', 'podologo'] },
    { label: 'Mantenimiento', path: '/mantenimiento', icon: 'Wrench', roles: ['administrador', 'podologo', 'recepcion'] },
  ],
}
