// Menú del área clínica · grupo PACIENTES
export default {
  grupo: 'PACIENTES',
  orden: 20,
  items: [
    { label: 'Pacientes', path: '/pacientes', icon: 'Users', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Clientes', path: '/clientes', icon: 'Users', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Planes de tratamiento', path: '/planes', icon: 'ClipboardList', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Seguimiento', path: '/seguimiento', icon: 'Megaphone', roles: ['administrador', 'podologo', 'recepcion'] },
  ],
}
