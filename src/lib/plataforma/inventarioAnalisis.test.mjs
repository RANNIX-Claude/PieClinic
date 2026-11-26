import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoExistencia, consolidarProductos, filtrar, totales, porLinea, porProveedor, porSucursal, matrizProductoSucursal, bajoMinimoAccionable, preciosPorProducto, hojasExportacion } from './inventarioAnalisis.js'

const fila = (o) => ({ id: `${o.producto_id}-${o.sede_id}`, sede_nombre: o.sede_id.toUpperCase(), sku: o.producto_id, nombre: `Prod ${o.producto_id}`, categoria: 'Línea A', marca: 'M', proveedor_id: 'v1', proveedor_nombre: 'Prov 1', costo_promedio: '10.00', precio_lista: '25.00', precio_sede: null, precio_web: null, minimo: 0, maximo: null, existencia: 0, ...o,
  valor_costo: o.valor_costo ?? String((Number(o.existencia) * Number(o.costo_promedio ?? 10)).toFixed(2)),
  valor_venta: o.valor_venta ?? String((Number(o.existencia) * Number(o.precio_sede ?? o.precio_lista ?? 25)).toFixed(2)) })

const datos = [
  fila({ producto_id: 'p1', sede_id: 'a', existencia: '10', minimo: '5', maximo: '20' }),
  fila({ producto_id: 'p1', sede_id: 'b', existencia: '2', minimo: '5', maximo: '20' }),
  fila({ producto_id: 'p2', sede_id: 'a', existencia: '0', minimo: '3', categoria: 'Línea B', proveedor_id: 'v2', proveedor_nombre: 'Prov 2' }),
  fila({ producto_id: 'p2', sede_id: 'b', existencia: '30', minimo: '3', maximo: '10', categoria: 'Línea B', proveedor_id: 'v2', proveedor_nombre: 'Prov 2', precio_sede: '30.00' }),
  fila({ producto_id: 'p3', sede_id: 'a', existencia: '4', minimo: '4', proveedor_id: null, proveedor_nombre: null, categoria: null }),
]

test('estadoExistencia: sin, bajo, en el mínimo, excede y ok', () => {
  assert.equal(estadoExistencia({ existencia: 0, minimo: 3 }), 'sin_existencia')
  assert.equal(estadoExistencia({ existencia: -2, minimo: 0 }), 'sin_existencia')
  assert.equal(estadoExistencia({ existencia: 2, minimo: 3 }), 'bajo_minimo')
  assert.equal(estadoExistencia({ existencia: 3, minimo: 3 }), 'en_el_minimo')
  assert.equal(estadoExistencia({ existencia: 11, minimo: 3, maximo: 10 }), 'excede_maximo')
  assert.equal(estadoExistencia({ existencia: 5, minimo: 3, maximo: 10 }), 'ok')
  assert.equal(estadoExistencia({ existencia: 5, minimo: 0, maximo: null }), 'ok')
})

test('totales del grupo: piezas, valor al costo, a venta y margen', () => {
  const t = totales(datos)
  assert.equal(t.piezas, 46)
  assert.equal(t.valorCosto, 460)
  // 10*25 + 2*25 + 0 + 30*30 + 4*25 = 250+50+900+100
  assert.equal(t.valorVenta, 1300)
  assert.equal(t.margen, 840)
  assert.equal(t.margenPct, 64.62)
  assert.equal(t.productos, 3)
  assert.equal(t.conExistencia, 3)
})

test('el estado de producto se evalúa sobre el alcance sumado', () => {
  const p = consolidarProductos(datos)
  assert.equal(p.find(x => x.producto_id === 'p1').estado, 'ok') // 12 de mín 10
  assert.equal(p.find(x => x.producto_id === 'p2').estado, 'excede_maximo') // 30 > 10
  assert.equal(p.find(x => x.producto_id === 'p3').estado, 'en_el_minimo')
  const t = totales(filtrar(datos, { sedeId: 'a' }))
  assert.equal(t.sinExistencia, 1)
  assert.equal(t.enMinimo, 1)
  assert.equal(t.piezas, 14)
})

test('filtros: línea, proveedor, sin proveedor y estado', () => {
  assert.equal(filtrar(datos, { categoria: 'Línea B' }).length, 2)
  assert.equal(filtrar(datos, { proveedorId: 'v2' }).length, 2)
  assert.equal(filtrar(datos, { proveedorId: '__sin' }).length, 1)
  assert.equal(filtrar(datos, { categoria: 'Sin categoría' }).length, 1)
  const ex = filtrar(datos, { estado: 'excede_maximo' })
  assert.deepEqual([...new Set(ex.map(f => f.producto_id))], ['p2'])
  assert.equal(ex.length, 2) // conserva las dos sedes del producto
})

test('agrupaciones: línea, proveedor y sucursal suman el total y su % cuadra', () => {
  const l = porLinea(datos)
  assert.equal(l.reduce((s, x) => s + x.valorCosto, 0), 460)
  assert.equal(l[0].etiqueta, 'Línea B')
  assert.ok(Math.abs(l.reduce((s, x) => s + x.pctValor, 0) - 100) < 0.05)
  const pr = porProveedor(datos)
  assert.ok(pr.some(x => x.etiqueta === 'Sin proveedor' && x.piezas === 4))
  const s = porSucursal(datos, [{ id: 'z', nombre: 'Z' }])
  assert.equal(s.find(x => x.clave === 'a').piezas, 14)
  assert.equal(s.find(x => x.clave === 'b').piezas, 32)
  assert.equal(s.find(x => x.clave === 'z').piezas, 0)
  assert.equal(s.reduce((q, x) => q + x.piezas, 0), 46)
  assert.equal(s.find(x => x.clave === 'a').bajoMinimo, 1)
})

test('matriz producto × sucursal ordena lo urgente primero', () => {
  const m = matrizProductoSucursal(datos)
  assert.equal(m.length, 3)
  assert.equal(m[0].estado, 'en_el_minimo')
  assert.equal(m.find(x => x.producto_id === 'p1').porSede.b.estado, 'bajo_minimo')
  assert.equal(m.find(x => x.producto_id === 'p1').total, 12)
})

test('bajo mínimo: urgencia, reposición y traspaso sugerido desde otra sede', () => {
  const b = bajoMinimoAccionable(datos)
  assert.deepEqual(b.map(x => `${x.producto_id}@${x.sede_id}`), ['p2@a', 'p1@b'])
  const p2a = b[0]
  assert.equal(p2a.estado, 'sin_existencia')
  assert.equal(p2a.faltaMinimo, 3)
  assert.equal(p2a.faltaMaximo, 3) // sin máximo: objetivo = mínimo
  assert.equal(p2a.valorReposicion, 30)
  assert.equal(p2a.traspaso.sede_id, 'b')
  assert.equal(p2a.traspaso.cantidad, 3)
  const p1b = b[1]
  assert.equal(p1b.faltaMaximo, 18)
  assert.equal(p1b.valorReposicion, 180)
  assert.equal(p1b.traspaso.sede_id, 'a')
  assert.equal(p1b.traspaso.cantidad, 5) // excedente de a: 10 - mínimo 5
  // con alcance de una sola sede, el origen se busca en todas
  assert.equal(bajoMinimoAccionable(filtrar(datos, { sedeId: 'b' }), datos)[0].traspaso.sede_id, 'a')
})

test('precios por producto y exportación', () => {
  const pr = preciosPorProducto(datos)
  const p2 = pr.find(x => x.producto_id === 'p2')
  assert.equal(p2.precioSedeMin, 30)
  assert.equal(p2.costo, 10)
  const hojas = hojasExportacion({ filas: datos, sedes: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }], alcance: 'Todo el grupo' })
  assert.equal(hojas.length, 7)
  assert.ok(hojas.every(h => h.filas.every(f => f.length === h.columnas.length)))
})
