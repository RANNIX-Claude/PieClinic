export default {
  grupo: 'EQUIPO', orden: 10,
  items: [
    { label: 'RH y nómina', path: '/rh', icon: 'UserCog', roles: ['administrador'] },
    { label: 'Mis recibos', path: '/mis-recibos', icon: 'FileText', roles: ['podologo', 'recepcion'] },
    { label: 'Comisiones', path: '/comisiones', icon: 'Percent', roles: ['administrador', 'podologo'] },
    { label: 'Mantenimiento', path: '/mantenimiento', icon: 'Wrench', roles: ['administrador', 'podologo', 'recepcion'] },
  ],
}
