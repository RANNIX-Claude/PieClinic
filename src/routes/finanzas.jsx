// Rutas del área FINANZAS (dashboard, resumen semanal, ingresos, gastos, EDR, conciliación, fondo, CxP/CxC, reportes, bitácora, cierres).
import { lazy } from 'react'
import { rolesCon } from '../lib/permisos'

export default [
  { path: '/dashboard', element: lazy(() => import('../pages/finanzas/Dashboard.jsx')), roles: rolesCon('dashboard.ver'), titulo: 'Dashboard', cap: 'dashboard.ver' },
  { path: '/resumen-semanal', element: lazy(() => import('../pages/finanzas/ResumenSemanal.jsx')), roles: rolesCon('finanzas.ver'), titulo: 'Resumen semanal', cap: 'finanzas.ver' },
  { path: '/ingresos', element: lazy(() => import('../pages/finanzas/Ingresos.jsx')), roles: rolesCon('finanzas.ver'), titulo: 'Ingresos', cap: 'finanzas.ver' },
  { path: '/gastos', element: lazy(() => import('../pages/finanzas/Gastos.jsx')), roles: rolesCon('fondo.operar'), titulo: 'Gastos', cap: 'fondo.operar' },
  { path: '/estado-resultados', element: lazy(() => import('../pages/finanzas/EDR.jsx')), roles: rolesCon('finanzas.ver'), titulo: 'Estado de resultados', cap: 'finanzas.ver' },
  { path: '/conciliacion', element: lazy(() => import('../pages/finanzas/Conciliacion.jsx')), roles: rolesCon('finanzas.ver'), titulo: 'Conciliación bancaria', cap: 'finanzas.ver' },
  { path: '/fondo-revolvente', element: lazy(() => import('../pages/finanzas/FondoRevolvente.jsx')), roles: rolesCon('fondo.operar'), titulo: 'Fondo revolvente', cap: 'fondo.operar' },
  { path: '/cuentas', element: lazy(() => import('../pages/finanzas/CuentasPagarCobrar.jsx')), roles: rolesCon('finanzas.ver'), titulo: 'Cuentas por pagar y por cobrar', cap: 'finanzas.ver' },
  { path: '/cierres', element: lazy(() => import('../pages/finanzas/Cierres.jsx')), roles: rolesCon('finanzas.ver'), titulo: 'Cierre de periodos', cap: 'finanzas.ver' },
  { path: '/reportes', element: lazy(() => import('../pages/finanzas/Reportes.jsx')), roles: rolesCon('reportes.ver'), titulo: 'Reportes', cap: 'reportes.ver' },
  { path: '/bitacora', element: lazy(() => import('../pages/finanzas/Bitacora.jsx')), roles: rolesCon('bitacora.ver'), titulo: 'Bitácora', cap: 'bitacora.ver' },
]
