// Rutas del área AUDITORÍA («Control y Auditoría»). Cada ruta declara el rol Y la capacidad del módulo (lib/auditoria/roles.js, espejo de la base):
//   ver diferencias → dueño, supervisor, soporte · capturar → todos menos soporte · configurar → dueño y soporte RANNIX.
import { lazy } from 'react'

const revisan = ['administrador', 'supervisor']
const capturan = ['administrador', 'supervisor', 'recepcion', 'podologo']

export default [
  { path: '/auditoria', element: lazy(() => import('../pages/auditoria/Tablero.jsx')), roles: revisan, titulo: 'Tablero de auditoría', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/diferencias', element: lazy(() => import('../pages/auditoria/Diferencias.jsx')), roles: revisan, titulo: 'Diferencias', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/casos', element: lazy(() => import('../pages/auditoria/Casos.jsx')), roles: revisan, titulo: 'Casos de diferencia', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/reportes', element: lazy(() => import('../pages/auditoria/Reportes.jsx')), roles: revisan, titulo: 'Reportes de auditoría', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/alertas', element: lazy(() => import('../pages/auditoria/Alertas.jsx')), roles: revisan, titulo: 'Alertas de auditoría', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/conteos', element: lazy(() => import('../pages/auditoria/Conteos.jsx')), roles: capturan, titulo: 'Conteos', cap: 'auditoria.capturar' },
  { path: '/auditoria/cierres', element: lazy(() => import('../pages/auditoria/Cierres.jsx')), roles: capturan, titulo: 'Cierres', cap: 'auditoria.capturar' },
  { path: '/auditoria/custodia', element: lazy(() => import('../pages/auditoria/custodia/Custodia.jsx')), roles: capturan, titulo: 'Custodia', cap: 'auditoria.capturar' },
  { path: '/auditoria/servicios', element: lazy(() => import('../pages/auditoria/servicios/Servicios.jsx')), roles: capturan, titulo: 'Servicios', cap: 'auditoria.capturar' },
  { path: '/auditoria/custodia/recepcion', element: lazy(() => import('../pages/auditoria/custodia/RecepcionRuta.jsx')), roles: capturan, titulo: 'Recepción con responsiva', cap: 'auditoria.capturar' },
  { path: '/auditoria/configuracion', element: lazy(() => import('../pages/auditoria/Configuracion.jsx')), roles: ['administrador'], titulo: 'Configuración de auditoría', cap: 'auditoria.configurar' },
]
