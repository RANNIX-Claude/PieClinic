export default {
  grupo: 'INVENTARIO', orden: 10,
  items: [
    { label: 'Inventario', path: '/inventario', icon: 'Package', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Traspasos', path: '/traspasos', icon: 'ArrowRightLeft', roles: ['administrador', 'recepcion'] },
    { label: 'Compras', path: '/compras', icon: 'ShoppingCart', roles: ['administrador', 'recepcion'] },
    { label: 'Proveedores', path: '/proveedores', icon: 'Truck', roles: ['administrador', 'recepcion'] },
    { label: 'Mermas y conteos', path: '/mermas-conteos', icon: 'ClipboardCheck', roles: ['administrador', 'recepcion'] },
  ],
}
