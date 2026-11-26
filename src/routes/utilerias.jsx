// Rutas del área UTILERÍAS (clon de la sección UTILERÍAS de IRP): cálculos, validación, catálogos, consulta a BD, entrega y consulta del asistente.
// Solo Administrador de la clínica (capacidad 'utilerias.usar' en lib/permisos.js).
import { lazy } from 'react'
import { rolesCon } from '../lib/permisos'

const roles = rolesCon('utilerias.usar')

export default [
  { path: '/utilerias/calculos', element: lazy(() => import('../pages/utilerias/Calculos.jsx')), roles, titulo: 'Cálculos del sistema', cap: 'utilerias.usar' },
  { path: '/utilerias/validacion', element: lazy(() => import('../pages/utilerias/Validacion.jsx')), roles, titulo: 'Validación del sistema', cap: 'utilerias.usar' },
  { path: '/utilerias/catalogos', element: lazy(() => import('../pages/utilerias/Catalogos.jsx')), roles, titulo: 'Catálogos', cap: 'utilerias.usar' },
  { path: '/utilerias/consulta-bd', element: lazy(() => import('../pages/utilerias/ConsultaBD.jsx')), roles, titulo: 'Consulta a base de datos', cap: 'utilerias.usar' },
  { path: '/utilerias/codigos-productos', element: lazy(() => import('../pages/utilerias/CodigosProductos.jsx')), roles, titulo: 'Códigos de productos', cap: 'utilerias.usar' },
  { path: '/utilerias/entrega', element: lazy(() => import('../pages/utilerias/Entrega.jsx')), roles, titulo: 'Entrega del proyecto', cap: 'utilerias.usar' },
  { path: '/utilerias/asistente', element: lazy(() => import('../pages/utilerias/ConsultaAsistente.jsx')), roles, titulo: 'Consulta del asistente', cap: 'utilerias.usar' },
  { path: '/utilerias/salud', element: lazy(() => import('../pages/utilerias/Salud.jsx')), roles, titulo: 'Salud del sistema y errores', cap: 'utilerias.usar' },
  { path: '/utilerias/datos-prueba', element: lazy(() => import('../pages/utilerias/DatosPrueba.jsx')), roles, titulo: 'Datos de prueba', cap: 'utilerias.usar' },
  { path: '/utilerias/simulador-jornada', element: lazy(() => import('../pages/utilerias/SimuladorJornada.jsx')), roles, titulo: 'Simulador de jornada', cap: 'utilerias.usar' },
  { path: '/utilerias/warehouse', element: lazy(() => import('../pages/utilerias/Warehouse.jsx')), roles, titulo: 'Data warehouse', cap: 'utilerias.usar' },
  { path: '/utilerias/documentacion', element: lazy(() => import('../pages/utilerias/Documentacion.jsx')), roles, titulo: 'Documentación', cap: 'utilerias.usar' },
]
