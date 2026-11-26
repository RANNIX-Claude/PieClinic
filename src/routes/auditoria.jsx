// Rutas del área AUDITORÍA («Control y Auditoría»). Cada ruta declara el rol Y la capacidad del módulo (lib/auditoria/roles.js, espejo de la base):
//   ver diferencias → dueño, supervisor, soporte · capturar → todos menos soporte · configurar → dueño y soporte RANNIX.
import { lazy } from 'react'

const revisan = ['administrador', 'supervisor']
const capturan = ['administrador', 'supervisor', 'recepcion', 'podologo']

export default [
  { path: '/auditoria', element: lazy(() => import('../pages/auditoria/Tablero.jsx')), roles: revisan, titulo: 'Tablero de auditoría', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/diferencias', element: lazy(() => import('../pages/auditoria/Diferencias.jsx')), roles: revisan, titulo: 'Diferencias', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/casos', element: lazy(() => import('../pages/auditoria/Casos.jsx')), roles: revisan, titulo: 'Casos de diferencia', cap: 'auditoria.ver_diferencias' },
  { path: '/auditoria/conteos', element: lazy(() => import('../pages/auditoria/Conteos.jsx')), roles: capturan, titulo: 'Conteos', cap: 'auditoria.capturar' },
  { path: '/auditoria/cierres', element: lazy(() => import('../pages/auditoria/Cierres.jsx')), roles: capturan, titulo: 'Cierres', cap: 'auditoria.capturar' },
  { path: '/auditoria/configuracion', element: lazy(() => import('../pages/auditoria/Configuracion.jsx')), roles: ['administrador'], titulo: 'Configuración de auditoría', cap: 'auditoria.configurar' },
]
