export default {
  grupo: 'ANÁLISIS', orden: 5,
  items: [
    { label: 'Operación del día', path: '/operacion-dia', icon: 'Activity', roles: ['administrador', 'supervisor'] },
    { label: 'Tablero ejecutivo', path: '/analisis/ejecutivo', icon: 'BarChart3', roles: ['administrador'] },
  ],
}
