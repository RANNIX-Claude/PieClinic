// Rutas del clúster EQUIPO: RH y nómina (39), expediente de empleado, mis recibos, comisiones (40) y mantenimiento (41).
import { lazy } from 'react'
import { rolesCon } from '../../../lib/permisos'

export default [
  { path: '/rh', element: lazy(() => import('./RH.jsx')), roles: rolesCon('rh.ver'), titulo: 'RH y nómina', cap: 'rh.ver' },
  { path: '/rh/empleado/:id', element: lazy(() => import('./ExpedienteEmpleado.jsx')), roles: rolesCon('rh.ver'), titulo: 'Expediente de empleado', cap: 'rh.ver' },
  { path: '/mis-recibos', element: lazy(() => import('./MisRecibos.jsx')), roles: rolesCon('rh.propio'), titulo: 'Mis recibos', cap: 'rh.propio' },
  { path: '/comisiones', element: lazy(() => import('./Comisiones.jsx')), roles: [...new Set([...rolesCon('comisiones.ver_todas'), ...rolesCon('comisiones.ver_propias')])], titulo: 'Comisiones' },
  { path: '/mantenimiento', element: lazy(() => import('./Mantenimiento.jsx')), roles: rolesCon('mantenimiento.solicitar'), titulo: 'Mantenimiento', cap: 'mantenimiento.solicitar' },
]
