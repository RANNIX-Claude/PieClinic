// Menú del área COMERCIAL: grupo VENTAS.
export default {
  grupo: 'VENTAS',
  orden: 20,
  items: [
    { label: 'Caja y tickets', path: '/caja', icon: 'Receipt', roles: ['administrador', 'recepcion'] },
    { label: 'Facturación', path: '/facturacion', icon: 'FileText', roles: ['administrador', 'recepcion'] },
    { label: 'Catálogo y precios', path: '/catalogo', icon: 'Tags', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Características y adaptaciones', path: '/catalogo/caracteristicas', icon: 'SlidersHorizontal', roles: ['administrador', 'recepcion'] },
    { label: 'Paquetes y membresías', path: '/paquetes', icon: 'Gift', roles: ['administrador', 'podologo', 'recepcion'] },
  ],
}
