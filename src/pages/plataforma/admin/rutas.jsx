// Rutas del clúster ADMIN (plataforma): importar, usuarios, configuración, suscripción, asistente, exportación y panel RANNIX.
// Los imports lazy son relativos a ESTA carpeta; routes/plataforma.jsx solo las reúne.
import { lazy } from 'react'
import { rolesCon } from '../../../lib/permisos'

export default [
  { path: '/importar', element: lazy(() => import('./Importar.jsx')), roles: ['administrador'], titulo: 'Importar datos', cap: 'importar.usar' },
  { path: '/usuarios', element: lazy(() => import('./Usuarios.jsx')), roles: rolesCon('usuarios.gestionar'), titulo: 'Usuarios y roles', cap: 'usuarios.gestionar' },
  { path: '/configuracion', element: lazy(() => import('./Configuracion.jsx')), roles: rolesCon('configuracion.editar'), titulo: 'Configuración', cap: 'configuracion.editar' },
  { path: '/suscripcion', element: lazy(() => import('./Suscripcion.jsx')), roles: rolesCon('suscripcion.ver'), titulo: 'Suscripción', cap: 'suscripcion.ver' },
  { path: '/asistente', element: lazy(() => import('./Asistente.jsx')), roles: rolesCon('asistente.usar'), titulo: 'Asistente de IA', cap: 'asistente.usar' },
  { path: '/exportar-datos', element: lazy(() => import('./ExportarDatos.jsx')), roles: rolesCon('configuracion.editar'), titulo: 'Exportar mis datos', cap: 'configuracion.editar' },
  { path: '/rannix', element: lazy(() => import('./RannixPanel.jsx')), roles: ['rannix'], titulo: 'Panel de clínicas', cap: 'rannix.panel' },
  { path: '/rannix/soporte', element: lazy(() => import('./RannixSoporte.jsx')), roles: ['rannix'], titulo: 'Soporte RANNIX', cap: 'rannix.panel' },
  { path: '/rannix/liberacion', element: lazy(() => import('./RannixLiberacion.jsx')), roles: ['rannix'], titulo: 'Liberación de funciones', cap: 'rannix.panel' },
  { path: '/parametros-duenos', element: lazy(() => import('./ParametrosDuenos.jsx')), roles: ['administrador'], titulo: 'Parámetros de los dueños', cap: 'configuracion.editar' },
  { path: '/mi-pin', element: lazy(() => import('./MiPin.jsx')), roles: ['administrador', 'podologo', 'recepcion', 'supervisor'], titulo: 'Mi PIN' },
]
