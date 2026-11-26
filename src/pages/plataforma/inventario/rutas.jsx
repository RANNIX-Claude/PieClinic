// Rutas del clúster INVENTARIO: existencias, traspasos, compras, proveedores, mermas y conteos.
import { lazy } from 'react'
import { rolesCon } from '../../../lib/permisos'

export default [
  { path: '/inventario', element: lazy(() => import('./Inventario.jsx')), roles: rolesCon('inventario.ver'), titulo: 'Inventario por sucursal', cap: 'inventario.ver' },
  { path: '/inventario/producto/:id', element: lazy(() => import('./ExpedienteProducto.jsx')), roles: rolesCon('inventario.ver'), titulo: 'Expediente de producto', cap: 'inventario.ver' },
  { path: '/traspasos', element: lazy(() => import('./Traspasos.jsx')), roles: rolesCon('inventario.operar'), titulo: 'Traspasos', cap: 'inventario.operar' },
  { path: '/compras', element: lazy(() => import('./Compras.jsx')), roles: rolesCon('compras.ver'), titulo: 'Compras', cap: 'compras.ver' },
  { path: '/proveedores', element: lazy(() => import('./Proveedores.jsx')), roles: rolesCon('proveedores.ver'), titulo: 'Proveedores', cap: 'proveedores.ver' },
  { path: '/proveedores/:id', element: lazy(() => import('./ExpedienteProveedor.jsx')), roles: rolesCon('proveedores.ver'), titulo: 'Expediente de proveedor', cap: 'proveedores.ver' },
  { path: '/mermas-conteos', element: lazy(() => import('./MermasConteos.jsx')), roles: rolesCon('inventario.operar'), titulo: 'Mermas y conteos', cap: 'inventario.operar' },
  { path: '/conteo-inicial', element: lazy(() => import('./ConteoInicial.jsx')), roles: rolesCon('conteo.operar'), titulo: 'Conteo inicial', cap: 'conteo.operar' },
  { path: '/productos-provisionales', element: lazy(() => import('./ProductosProvisionales.jsx')), roles: rolesCon('conteo.provisionales'), titulo: 'Productos provisionales', cap: 'conteo.provisionales' },
  { path: '/catalogo/codigos', element: lazy(() => import('./HojaCodigos.jsx')), roles: rolesCon('catalogo.ver'), titulo: 'Códigos de servicios', cap: 'catalogo.ver' },
  { path: '/catalogo/codigos-productos', element: lazy(() => import('./CodigosProductos.jsx')), roles: rolesCon('catalogo.ver'), titulo: 'Códigos de productos', cap: 'catalogo.ver' },
]
