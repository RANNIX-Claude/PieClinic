// Rutas de ANALÍTICA: tablero ejecutivo alimentado por el data warehouse (dw_kpi_*). Solo Administración.
import { lazy } from 'react'
import { rolesCon } from '../lib/permisos'

export default [
  { path: '/analisis/ejecutivo', element: lazy(() => import('../pages/analitica/TableroEjecutivo.jsx')), roles: rolesCon('dashboard.finanzas'), titulo: 'Tablero ejecutivo', cap: 'dashboard.finanzas' },
  // Operación del día: dueños (consolidado) y supervisor (sus sucursales, por RLS). Ver lib/permisos.js → RUTAS_SUPERVISOR.
  { path: '/operacion-dia', element: lazy(() => import('../pages/analitica/OperacionDia.jsx')), roles: ['administrador', 'supervisor'], titulo: 'Operación del día', cap: 'dashboard.ver' },
]
