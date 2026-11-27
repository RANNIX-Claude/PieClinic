// Rutas de PEDIDOS ESPECIALES (zapatos, plantillas y aditamentos pedidos al proveedor a nombre de un cliente). Ver docs/PEDIDOS_ESPECIALES.md.
// Lo ven y solicitan administración, recepción y podología de su sucursal; autoriza solo administración (la base lo vuelve a comprobar).
import { lazy } from 'react'

const roles = ['administrador', 'recepcion', 'podologo']

export default [
  { path: '/pedidos', element: lazy(() => import('../pages/plataforma/pedidos/Pedidos.jsx')), roles, titulo: 'Pedidos' },
  { path: '/pedidos/nuevo', element: lazy(() => import('../pages/plataforma/pedidos/PedidoNuevo.jsx')), roles, titulo: 'Nuevo pedido' },
  { path: '/pedidos/:id', element: lazy(() => import('../pages/plataforma/pedidos/PedidoDetalle.jsx')), roles, titulo: 'Detalle del pedido' },
]
