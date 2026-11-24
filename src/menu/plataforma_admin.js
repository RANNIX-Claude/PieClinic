export default {
  grupo: 'ADMIN', orden: 10,
  items: [
    { label: 'Importar datos', path: '/importar', icon: 'Upload', roles: ['administrador'] },
    { label: 'Usuarios y roles', path: '/usuarios', icon: 'Users', roles: ['administrador'] },
    { label: 'Configuración', path: '/configuracion', icon: 'Settings', roles: ['administrador'] },
    { label: 'Suscripción', path: '/suscripcion', icon: 'CreditCard', roles: ['administrador'] },
    { label: 'Parámetros de los dueños', path: '/parametros-duenos', icon: 'Settings', roles: ['administrador'] },
    { label: 'Mi PIN', path: '/mi-pin', icon: 'ShieldCheck', roles: ['administrador', 'podologo', 'recepcion', 'supervisor'] },
    { label: 'Asistente de IA', path: '/asistente', icon: 'Sparkles', roles: ['administrador', 'podologo'] },
    { label: 'Exportar mis datos', path: '/exportar-datos', icon: 'Download', roles: ['administrador'] },
  ],
}
