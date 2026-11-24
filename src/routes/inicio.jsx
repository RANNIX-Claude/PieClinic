// EJEMPLO FUNCIONAL del contrato de rutas (docs/FRONTEND_ARQUITECTURA.md).
// Cada módulo agrega su propio archivo en src/routes/ y NO toca App.jsx.
//   path:    ruta bajo el basename '/app' (con ':parametros' si hace falta)
//   element: componente cargado con lazy() (o un elemento <X />)
//   roles:   roles que pueden entrar (vacío/omitido = cualquier usuario con sesión). Ver lib/permisos.js
//   titulo:  título de la pestaña y de la página
//   cap:     (opcional) capacidad exigida además del rol, p. ej. 'finanzas.ver'
import { lazy } from 'react'
import { TODOS_LOS_ROLES } from '../lib/permisos'

export default [
  { path: '/', element: lazy(() => import('../pages/inicio/Inicio.jsx')), roles: TODOS_LOS_ROLES, titulo: 'Inicio' },
]
