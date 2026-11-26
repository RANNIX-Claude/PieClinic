import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { colCosto, columnasVisibles, pestanasVisibles, valorAPrecioLista, valorAlCosto, kpiValorInventario, productoVisible } from './visibilidadCostos.js'

const cols = [
  { key: 'sku', label: 'SKU' },
  { key: 'precio', label: 'Precio de lista' },
  colCosto({ key: 'costo', label: 'Costo prom.' }),
  colCosto({ key: 'valor', label: 'Valor' }),
]

test('sin la capacidad desaparecen las columnas de costo y quedan SKU y precio de lista', () => {
  assert.deepEqual(columnasVisibles(cols, false).map(c => c.key), ['sku', 'precio'])
})

test('con la capacidad se ven todas las columnas', () => {
  assert.deepEqual(columnasVisibles(cols, true).map(c => c.key), ['sku', 'precio', 'costo', 'valor'])
})

test('las pestañas de costo se ocultan sin la capacidad y las demás no se tocan', () => {
  const tabs = [{ id: 'resumen' }, { id: 'costos', costo: true }, { id: 'compras', costo: true }]
  const sin = pestanasVisibles(tabs, false)
  assert.equal(sin.find(t => t.id === 'resumen').oculto, undefined)
  assert.equal(sin.find(t => t.id === 'costos').oculto, true)
  assert.equal(sin.find(t => t.id === 'compras').oculto, true)
  assert.ok(pestanasVisibles(tabs, true).every(t => !t.oculto))
})

const inv = [
  { producto_id: 'a', sede_nombre: 'Centro', existencia: '10', valor: '100' },
  { producto_id: 'b', sede_nombre: 'Centro', existencia: '2', valor: '60' },
  { producto_id: 'a', sede_nombre: 'Norte', existencia: '5', valor: '50' },
  { producto_id: 'c', sede_nombre: 'Norte', existencia: '-1', valor: '-4' },
]
const prods = { a: { precio_lista: 25 }, b: { precio_lista: 40 }, c: { precio_lista: null } }

test('valor a precio de lista = existencia × precio de venta, por sede, y no usa el costo', () => {
  const v = valorAPrecioLista(inv, prods)
  assert.equal(v.porSede.Centro, 330)
  assert.equal(v.porSede.Norte, 125)
  assert.equal(v.total, 455)
})

test('valor al costo suma el campo valor de la vista', () => {
  assert.equal(valorAlCosto(inv).total, 206)
})

test('KPI de valor: dueños ven el costo; recepción el precio de lista', () => {
  const dueno = kpiValorInventario(inv, prods, true)
  const recep = kpiValorInventario(inv, prods, false)
  assert.equal(dueno.titulo, 'Valor de inventario'); assert.equal(dueno.alCosto, true); assert.equal(dueno.total, 206)
  assert.equal(recep.titulo, 'Valor a precio de lista'); assert.equal(recep.alCosto, false); assert.equal(recep.total, 455)
})

test('con la base endurecida (valor null) recepción no se rompe', () => {
  const nulos = inv.map(i => ({ ...i, valor: null }))
  assert.equal(valorAlCosto(nulos).total, 0)
  assert.equal(kpiValorInventario(nulos, prods, false).total, 455)
})

test('productoVisible quita costo y margen sin la capacidad y conserva precios', () => {
  const p = { id: 1, costo_promedio: 12, margen_pct: 40, margen_objetivo_pct: 30, precio_lista: 30, precio_web: 35 }
  const sin = productoVisible(p, false)
  assert.equal('costo_promedio' in sin, false)
  assert.equal('margen_pct' in sin, false)
  assert.equal('margen_objetivo_pct' in sin, false)
  assert.equal(sin.precio_lista, 30); assert.equal(sin.precio_web, 35)
  assert.equal(productoVisible(p, true), p)
})

test('matriz de roles: inventario.ver_costos es de administrador/RANNIX y del supervisor, nunca de recepción ni podología', () => {
  const src = readFileSync(new URL('../permisos.js', import.meta.url), 'utf8')
  const linea = src.split('\n').find(l => l.includes("'inventario.ver_costos':"))
  assert.ok(linea, 'la capacidad existe')
  assert.match(linea, /cap\(\[A, X\]\)/)
  assert.doesNotMatch(linea, /\bR\b|\bP\b/)
  const sup = src.slice(src.indexOf('export const CAPS_SUPERVISOR'), src.indexOf('export const RUTAS_SUPERVISOR'))
  assert.ok(sup.includes("'inventario.ver_costos'"))
  const prov = src.split('\n').find(l => l.includes("'proveedores.ver':"))
  assert.doesNotMatch(prov, /\bR\b/)
})

test('rutas y menú: Análisis de inventario exige la capacidad de costos y no figura para recepción ni podología', () => {
  const rutas = readFileSync(new URL('../../pages/plataforma/inventario/rutas.jsx', import.meta.url), 'utf8')
  const r = rutas.split('\n').find(l => l.includes("path: '/inventario/analisis'"))
  assert.match(r, /rolesCon\('inventario\.ver_costos'\)/)
  const menu = readFileSync(new URL('../../menu/plataforma_inventario.js', import.meta.url), 'utf8')
  const m = menu.split('\n').find(l => l.includes("path: '/inventario/analisis'"))
  assert.doesNotMatch(m, /recepcion|podologo/)
})
