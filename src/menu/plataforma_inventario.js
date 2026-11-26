export default {
  grupo: 'INVENTARIO', orden: 10,
  items: [
    { label: 'Inventario', path: '/inventario', icon: 'Package', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Traspasos', path: '/traspasos', icon: 'ArrowRightLeft', roles: ['administrador', 'recepcion'] },
    { label: 'Compras', path: '/compras', icon: 'ShoppingCart', roles: ['administrador', 'recepcion'] },
    { label: 'Proveedores', path: '/proveedores', icon: 'Truck', roles: ['administrador'] },
    { label: 'Mermas y conteos', path: '/mermas-conteos', icon: 'ClipboardCheck', roles: ['administrador', 'recepcion'] },
    { label: 'Conteo inicial', path: '/conteo-inicial', icon: 'ScanLine', roles: ['administrador', 'recepcion'] },
    { label: 'Códigos de servicios', path: '/catalogo/codigos', icon: 'QrCode', roles: ['administrador', 'recepcion'] },
    { label: 'Códigos de productos', path: '/catalogo/codigos-productos', icon: 'ScanBarcode', roles: ['administrador', 'recepcion'] },
    { label: 'Productos provisionales', path: '/productos-provisionales', icon: 'PackageSearch', roles: ['administrador'] },
    { label: 'Análisis de inventario', path: '/inventario/analisis', icon: 'BarChart3', roles: ['administrador'] }   // BI de dueños y supervisor (el supervisor entra por RUTAS_SUPERVISOR); recepción y podología no,
  ],
}
