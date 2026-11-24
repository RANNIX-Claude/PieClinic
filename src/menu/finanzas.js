export default {
  grupo: 'FINANZAS', orden: 10,
  items: [
    { label: 'Ingresos', path: '/ingresos', icon: 'TrendingUp', roles: ['administrador'] },
    { label: 'Gastos', path: '/gastos', icon: 'TrendingDown', roles: ['administrador', 'recepcion'] },
    { label: 'Fondo revolvente', path: '/fondo-revolvente', icon: 'Wallet', roles: ['administrador', 'recepcion'] },
    { label: 'Conciliación bancaria', path: '/conciliacion', icon: 'Landmark', roles: ['administrador'] },
    { label: 'Cuentas por pagar y cobrar', path: '/cuentas', icon: 'Scale', roles: ['administrador'] },
    { label: 'Estado de resultados', path: '/estado-resultados', icon: 'FileBarChart2', roles: ['administrador'] },
    { label: 'Cierre de periodos', path: '/cierres', icon: 'ClipboardCheck', roles: ['administrador'] },
  ],
}
