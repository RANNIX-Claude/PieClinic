// Análisis de inventario (BI): cálculos puros sobre filas de piefirme.prp_inventario_analisis (producto × sede).
// El inventario es uno solo: el del grupo de sucursales. Sin red ni DOM; el dinero se redondea a centavos al sumar.

export const num = v => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? 0 : n }
export const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100
const tieneNum = v => v != null && v !== '' && Number.isFinite(Number(v))

export const ESTADOS = {
  sin_existencia: 'Sin existencia',
  bajo_minimo: 'Bajo mínimo',
  en_el_minimo: 'En el mínimo',
  excede_maximo: 'Excede el máximo',
  ok: 'OK',
}
/** De más a menos urgente (para elegir el peor estado y ordenar). */
export const PRIORIDAD = ['sin_existencia', 'bajo_minimo', 'en_el_minimo', 'excede_maximo', 'ok']

/** Estado de existencia de un producto (en una sede, o sumado en el alcance). */
export function estadoExistencia({ existencia, minimo, maximo }) {
  const e = num(existencia), mn = num(minimo)
  if (e <= 0) return 'sin_existencia'
  if (e < mn) return 'bajo_minimo'
  if (e === mn && mn > 0) return 'en_el_minimo'
  if (tieneNum(maximo) && num(maximo) > 0 && e > num(maximo)) return 'excede_maximo'
  return 'ok'
}

/** Filas por producto: suma existencias, mínimos y máximos del alcance y calcula valores y estado. */
export function consolidarProductos(filas) {
  const m = new Map()
  for (const f of filas) {
    let p = m.get(f.producto_id)
    if (!p) {
      p = {
        producto_id: f.producto_id, sku: f.sku, nombre: f.nombre, categoria: f.categoria ?? 'Sin categoría', departamento: f.departamento ?? null,
        marca: f.marca ?? null, proveedor_id: f.proveedor_id ?? null, proveedor_nombre: f.proveedor_nombre ?? null,
        costo: num(f.costo_promedio), precioLista: tieneNum(f.precio_lista) ? num(f.precio_lista) : null, precioWeb: tieneNum(f.precio_web) ? num(f.precio_web) : null,
        preciosSede: [], existencia: 0, minimo: 0, maximo: null, valorCosto: 0, valorVenta: 0, caducaPronto: false, proximaCaducidad: null, sedes: [], porSede: {},
      }
      m.set(f.producto_id, p)
    }
    const e = num(f.existencia)
    p.existencia += e
    p.minimo += num(f.minimo)
    if (tieneNum(f.maximo)) p.maximo = (p.maximo ?? 0) + num(f.maximo)
    p.valorCosto = r2(p.valorCosto + num(f.valor_costo))
    p.valorVenta = r2(p.valorVenta + num(f.valor_venta))
    if (tieneNum(f.precio_sede)) p.preciosSede.push(num(f.precio_sede))
    if (f.caduca_pronto) p.caducaPronto = true
    if (f.proxima_caducidad && (!p.proximaCaducidad || f.proxima_caducidad < p.proximaCaducidad)) p.proximaCaducidad = f.proxima_caducidad
    p.sedes.push(f.sede_id)
    p.porSede[f.sede_id] = { existencia: e, minimo: num(f.minimo), maximo: tieneNum(f.maximo) ? num(f.maximo) : null, estado: estadoExistencia(f) }
  }
  return [...m.values()].map(p => {
    return {
      ...p,
      estado: estadoExistencia(p),
      precioVenta: p.existencia > 0 && p.valorVenta ? r2(p.valorVenta / p.existencia) : (p.precioLista ?? 0),
      precioSedeMin: p.preciosSede.length ? Math.min(...p.preciosSede) : null,
      precioSedeMax: p.preciosSede.length ? Math.max(...p.preciosSede) : null,
      margen: r2(p.valorVenta - p.valorCosto),
      margenPct: p.valorVenta > 0 ? r2(((p.valorVenta - p.valorCosto) / p.valorVenta) * 100) : null,
    }
  })
}

/**
 * Aplica el alcance y los filtros. El estado se evalúa por PRODUCTO sobre el alcance (todo el grupo o una sucursal),
 * y se conservan todas las filas de las sedes del alcance de los productos que cumplen.
 */
export function filtrar(filas, { sedeId = '', categoria = '', proveedorId = '', marca = '', estado = '' } = {}) {
  let r = filas
  if (sedeId) r = r.filter(f => f.sede_id === sedeId)
  if (categoria) r = r.filter(f => (f.categoria ?? 'Sin categoría') === categoria)
  if (proveedorId) r = r.filter(f => (proveedorId === '__sin' ? !f.proveedor_id : f.proveedor_id === proveedorId))
  if (marca) r = r.filter(f => (f.marca ?? 'Sin marca') === marca)
  if (estado) {
    const ok = new Set(consolidarProductos(r).filter(p => p.estado === estado).map(p => p.producto_id))
    r = r.filter(f => ok.has(f.producto_id))
  }
  return r
}

/** Valores distintos para los selectores de filtro. */
export function opcionesFiltro(filas) {
  const ord = a => a.sort((x, y) => x.etiqueta.localeCompare(y.etiqueta, 'es'))
  const cat = new Set(), mar = new Set(), prov = new Map()
  for (const f of filas) {
    cat.add(f.categoria ?? 'Sin categoría'); mar.add(f.marca ?? 'Sin marca')
    if (f.proveedor_id) prov.set(f.proveedor_id, f.proveedor_nombre ?? '—')
  }
  return {
    categorias: ord([...cat].map(c => ({ valor: c, etiqueta: c }))),
    marcas: ord([...mar].map(c => ({ valor: c, etiqueta: c }))),
    proveedores: ord([...prov].map(([valor, etiqueta]) => ({ valor, etiqueta }))),
  }
}

/** KPI del alcance. Los conteos de productos son por producto (consolidado); `productoSede*` por producto-sede. */
export function totales(filas) {
  const prods = consolidarProductos(filas)
  const piezas = filas.reduce((s, f) => s + num(f.existencia), 0)
  const valorCosto = r2(filas.reduce((s, f) => s + num(f.valor_costo), 0))
  const valorVenta = r2(filas.reduce((s, f) => s + num(f.valor_venta), 0))
  const margen = r2(valorVenta - valorCosto)
  const cuenta = e => prods.filter(p => p.estado === e).length
  const porLista = r2(filas.reduce((s, f) => s + num(f.existencia) * num(f.precio_lista), 0))
  const porSede = r2(filas.reduce((s, f) => s + (tieneNum(f.precio_sede) ? num(f.existencia) * num(f.precio_sede) : 0), 0))
  const porWeb = r2(filas.reduce((s, f) => s + (tieneNum(f.precio_web) ? num(f.existencia) * num(f.precio_web) : 0), 0))
  const sedeEstados = filas.map(f => estadoExistencia(f))
  return {
    piezas, valorCosto, valorVenta, margen, margenPct: valorVenta > 0 ? r2((margen / valorVenta) * 100) : null,
    productos: prods.length,
    conExistencia: prods.filter(p => p.existencia > 0).length,
    sinExistencia: cuenta('sin_existencia'),
    bajoMinimo: cuenta('bajo_minimo'),
    enMinimo: cuenta('en_el_minimo'),
    excedeMaximo: cuenta('excede_maximo'),
    caducanPronto: prods.filter(p => p.caducaPronto).length,
    productoSedeBajo: sedeEstados.filter(e => e === 'bajo_minimo').length,
    productoSedeSin: sedeEstados.filter(e => e === 'sin_existencia').length,
    sedesConStock: new Set(filas.filter(f => num(f.existencia) > 0).map(f => f.sede_id)).size,
    precios: { lista: porLista, sede: porSede, web: porWeb },
  }
}

/** Agrupa por una clave (línea, proveedor, marca…) con piezas, valor al costo, valor a precio de venta y % del total. */
export function agrupar(filas, claveFn, etiquetaFn = claveFn) {
  const m = new Map()
  for (const f of filas) {
    const k = claveFn(f)
    let g = m.get(k)
    if (!g) { g = { clave: k, etiqueta: etiquetaFn(f), productos: new Set(), piezas: 0, valorCosto: 0, valorVenta: 0, bajo: new Set() }; m.set(k, g) }
    g.productos.add(f.producto_id)
    g.piezas += num(f.existencia)
    g.valorCosto = r2(g.valorCosto + num(f.valor_costo))
    g.valorVenta = r2(g.valorVenta + num(f.valor_venta))
  }
  const prods = new Map(consolidarProductos(filas).map(p => [p.producto_id, p]))
  const totC = [...m.values()].reduce((s, g) => s + g.valorCosto, 0)
  const totP = [...m.values()].reduce((s, g) => s + g.piezas, 0)
  return [...m.values()].map(g => {
    const ids = [...g.productos]
    return {
      clave: g.clave, etiqueta: g.etiqueta, productos: ids.length, piezas: g.piezas, valorCosto: g.valorCosto, valorVenta: g.valorVenta,
      margen: r2(g.valorVenta - g.valorCosto), margenPct: g.valorVenta > 0 ? r2(((g.valorVenta - g.valorCosto) / g.valorVenta) * 100) : null,
      pctValor: totC > 0 ? r2((g.valorCosto / totC) * 100) : 0, pctPiezas: totP > 0 ? r2((g.piezas / totP) * 100) : 0,
      bajoMinimo: ids.filter(id => ['bajo_minimo', 'sin_existencia'].includes(prods.get(id)?.estado)).length,
    }
  }).sort((a, b) => b.valorCosto - a.valorCosto || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

export const porLinea = filas => agrupar(filas, f => f.categoria ?? 'Sin categoría')
export const porProveedor = filas => agrupar(filas, f => f.proveedor_id ?? '__sin', f => f.proveedor_nombre ?? 'Sin proveedor')
export const porMarca = filas => agrupar(filas, f => f.marca ?? 'Sin marca')

/** Ranking de sucursales: piezas y valor de cada una y su % del grupo. `sedes` agrega las que no tienen filas (en cero). */
export function porSucursal(filas, sedes = []) {
  const g = agrupar(filas, f => f.sede_id, f => f.sede_nombre)
  const vistas = new Set(g.map(x => x.clave))
  const extra = sedes.filter(s => !vistas.has(s.id)).map(s => ({ clave: s.id, etiqueta: s.nombre, productos: 0, piezas: 0, valorCosto: 0, valorVenta: 0, margen: 0, margenPct: null, pctValor: 0, pctPiezas: 0, bajoMinimo: 0 }))
  const porSedeProd = new Map()
  for (const f of filas) {
    const a = porSedeProd.get(f.sede_id) ?? { bajo: 0 }
    if (['bajo_minimo', 'sin_existencia'].includes(estadoExistencia(f))) a.bajo += 1
    porSedeProd.set(f.sede_id, a)
  }
  return [...g, ...extra].map(x => ({ ...x, bajoMinimo: porSedeProd.get(x.clave)?.bajo ?? 0 }))
}

/** Matriz producto × sucursal: una columna de existencia por sede, total del grupo, mínimo y estado. */
export function matrizProductoSucursal(filas) {
  return consolidarProductos(filas)
    .map(p => ({
      producto_id: p.producto_id, sku: p.sku, nombre: p.nombre, categoria: p.categoria, proveedor: p.proveedor_nombre ?? 'Sin proveedor',
      porSede: p.porSede, total: p.existencia, minimo: p.minimo, maximo: p.maximo, estado: p.estado,
      valorCosto: p.valorCosto, valorVenta: p.valorVenta,
    }))
    .sort((a, b) => PRIORIDAD.indexOf(a.estado) - PRIORIDAD.indexOf(b.estado) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Precios de compra y de venta por producto: costo, precio de lista, rango por sede, web, margen y valores. */
export function preciosPorProducto(filas) {
  return consolidarProductos(filas).map(p => ({
    producto_id: p.producto_id, sku: p.sku, nombre: p.nombre, categoria: p.categoria, costo: p.costo, precioLista: p.precioLista,
    precioSedeMin: p.precioSedeMin, precioSedeMax: p.precioSedeMax, precioWeb: p.precioWeb, existencia: p.existencia,
    valorCosto: p.valorCosto, valorVenta: p.valorVenta, margen: p.margen, margenPct: p.margenPct,
  })).sort((a, b) => b.valorCosto - a.valorCosto)
}

/**
 * Lista accionable «Bajo mínimo» por producto-sede, de lo más urgente a lo menos:
 * urgencia = existencia / mínimo (0 o menos = sin existencia), luego mayor valor de reposición.
 * `todas` son las filas de TODAS las sucursales (sin filtro de alcance) para sugerir traspasos desde otra sede con excedente.
 */
export function bajoMinimoAccionable(filas, todas = filas) {
  const porProd = new Map()
  for (const f of todas) { if (!porProd.has(f.producto_id)) porProd.set(f.producto_id, []); porProd.get(f.producto_id).push(f) }
  const lista = []
  for (const f of filas) {
    const e = num(f.existencia), mn = num(f.minimo)
    if (!(mn > 0 && e < mn)) continue
    const objetivo = tieneNum(f.maximo) && num(f.maximo) >= mn ? num(f.maximo) : mn
    const faltaMinimo = r2(mn - e), faltaMaximo = r2(objetivo - e)
    const costo = num(f.costo_promedio)
    const origenes = (porProd.get(f.producto_id) ?? [])
      .filter(o => o.sede_id !== f.sede_id)
      .map(o => ({ sede_id: o.sede_id, sede_nombre: o.sede_nombre, excedente: num(o.existencia) - Math.max(num(o.minimo), 0) }))
      .filter(o => o.excedente > 0).sort((a, b) => b.excedente - a.excedente)
    const sugerida = origenes[0] ? { ...origenes[0], cantidad: Math.min(Math.floor(origenes[0].excedente), Math.ceil(faltaMaximo)) } : null
    lista.push({
      id: f.id, producto_id: f.producto_id, sede_id: f.sede_id, sede_nombre: f.sede_nombre, sku: f.sku, nombre: f.nombre, categoria: f.categoria ?? 'Sin categoría',
      proveedor: f.proveedor_nombre ?? 'Sin proveedor', existencia: e, minimo: mn, maximo: tieneNum(f.maximo) ? num(f.maximo) : null,
      faltaMinimo, faltaMaximo, valorReposicion: r2(faltaMaximo * costo), urgencia: e <= 0 ? 0 : r2(e / mn),
      estado: e <= 0 ? 'sin_existencia' : 'bajo_minimo', traspaso: sugerida && sugerida.cantidad > 0 ? sugerida : null, origenes,
    })
  }
  return lista.sort((a, b) => a.urgencia - b.urgencia || b.valorReposicion - a.valorReposicion || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Hojas para exportar a Excel lo que se ve: [{ nombre, columnas:[…], filas:[[…]] }]. */
export function hojasExportacion({ filas, sedes, alcance, todas = filas }) {
  const t = totales(filas)
  const gTabla = g => ({ columnas: ['Concepto', 'Productos', 'Piezas', 'Valor al costo', 'Valor a precio de venta', 'Margen', 'Margen %', '% del valor'], filas: g.map(x => [x.etiqueta, x.productos, x.piezas, x.valorCosto, x.valorVenta, x.margen, x.margenPct ?? '', x.pctValor]) })
  const sedesVista = sedes.filter(s => filas.some(f => f.sede_id === s.id))
  const m = matrizProductoSucursal(filas)
  return [
    { nombre: 'Resumen', columnas: ['Indicador', 'Valor'], filas: [
      ['Alcance', alcance], ['Piezas totales', t.piezas], ['Valor al costo', t.valorCosto], ['Valor a precio de venta', t.valorVenta], ['Margen potencial', t.margen], ['Margen %', t.margenPct ?? ''],
      ['Productos con existencia', t.conExistencia], ['Productos sin existencia', t.sinExistencia], ['Productos bajo mínimo', t.bajoMinimo], ['Productos en el mínimo', t.enMinimo], ['Productos que exceden el máximo', t.excedeMaximo], ['Caducan pronto', t.caducanPronto],
      ['Valor a precio de lista', t.precios.lista], ['Valor a precio por sucursal', t.precios.sede], ['Valor a precio web', t.precios.web],
    ] },
    { nombre: 'Por línea', ...gTabla(porLinea(filas)) },
    { nombre: 'Por proveedor', ...gTabla(porProveedor(filas)) },
    { nombre: 'Por sucursal', ...gTabla(porSucursal(filas, [])) },
    { nombre: 'Precios', columnas: ['SKU', 'Producto', 'Línea', 'Precio de compra', 'Precio lista', 'Precio sucursal mín.', 'Precio sucursal máx.', 'Precio web', 'Existencia', 'Valor al costo', 'Valor a precio de venta', 'Margen', 'Margen %'],
      filas: preciosPorProducto(filas).map(p => [p.sku, p.nombre, p.categoria, p.costo, p.precioLista ?? '', p.precioSedeMin ?? '', p.precioSedeMax ?? '', p.precioWeb ?? '', p.existencia, p.valorCosto, p.valorVenta, p.margen, p.margenPct ?? '']) },
    { nombre: 'Producto x sucursal', columnas: ['SKU', 'Producto', 'Línea', 'Proveedor', ...sedesVista.map(s => s.nombre), 'Total grupo', 'Mínimo', 'Estado'],
      filas: m.map(p => [p.sku, p.nombre, p.categoria, p.proveedor, ...sedesVista.map(s => (p.porSede[s.id] ? p.porSede[s.id].existencia : '')), p.total, p.minimo, ESTADOS[p.estado]]) },
    { nombre: 'Bajo minimo', columnas: ['Sucursal', 'SKU', 'Producto', 'Proveedor', 'Existencia', 'Mínimo', 'Máximo', 'Falta al mínimo', 'Falta al máximo', 'Valor de reposición', 'Estado', 'Traspaso sugerido'],
      filas: bajoMinimoAccionable(filas, todas).map(b => [b.sede_nombre, b.sku, b.nombre, b.proveedor, b.existencia, b.minimo, b.maximo ?? '', b.faltaMinimo, b.faltaMaximo, b.valorReposicion, ESTADOS[b.estado], b.traspaso ? `${b.traspaso.cantidad} desde ${b.traspaso.sede_nombre}` : '']) },
  ]
}
