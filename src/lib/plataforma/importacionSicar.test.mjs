// Pruebas de la carga de artículos de SICAR (reglas portadas de PODIX, decididas el 23-nov-2026). Datos 100 % sintéticos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { convertirCatalogoSicar, esHojaSicar, ENCABEZADO_SICAR } from './importacionSicar.js'

// Columnas: 0 SERVICIO, 1 CLAVE (barras), 2 CLAVE ALTERNA, 3 descripción (sin título), 4 CARACTERISTICAS, 5 DEPARTAMENTO, 6 CATEGORIA, 7 PRECIO COMPRA, 8 PRECIO 1, 9 INV_MIN, 10 INV_MAX
const ENC = [ENCABEZADO_SICAR, 'CLAVE', 'CLAVE ALTERNA', '', 'CARACTERISTICAS', 'DEPARTAMENTO', 'CATEGORIA', 'PRECIO COMPRA', 'PRECIO 1', 'INV_MIN', 'INV_MAX']
const fila = ({ barras = '', clave = '', desc, carac = '', depto = '', cat = '', costo = null, p1 = null, min = 1, max = 2 }) => ['N', barras, clave, desc, carac, depto, cat, costo, p1, min, max]
const hoja = (nombre, filas) => ({ nombre, filas: [['Lista de artículos'], ENC, ...filas] })

test('un precio válido (al menos 1.2 veces el costo) se toma tal cual', () => {
  const r = convertirCatalogoSicar([hoja('Proveedor A', [fila({ clave: 'A1', desc: 'Crema', costo: 100, p1: 300 })])])
  const p = r.productos[0]
  assert.equal(p.precio, 300); assert.equal(p.costo, 100)
  assert.equal(p.precioSugerido, false); assert.equal(p.costoEstimado, false)
  assert.equal(r.resumen.completo, 1)
})

test('«PRECIO 1» que solo trae el 16 % del costo (IVA) se ignora y el precio se sugiere con el margen del proveedor', () => {
  const r = convertirCatalogoSicar([hoja('Proveedor A', [
    fila({ clave: 'A1', desc: 'Uno', costo: 100, p1: 300 }),
    fila({ clave: 'A2', desc: 'Dos', costo: 200, p1: 600 }),
    fila({ clave: 'A3', desc: 'Tres', costo: 100, p1: 16 }),       // 16 % del costo: es el IVA
  ])])
  const tres = r.productos.find(p => p.sku === 'A3')
  assert.equal(tres.precioSugerido, true)
  assert.equal(tres.precio, 300)                                   // factor 3 × costo 100, redondeado hacia arriba a múltiplo de 5
  assert.equal(r.resumen.sugerido, 1)
})

test('el precio sugerido se redondea hacia arriba a múltiplos de 5', () => {
  const r = convertirCatalogoSicar([hoja('P', [
    fila({ clave: 'B1', desc: 'Base', costo: 10, p1: 33 }),         // factor 3.3
    fila({ clave: 'B2', desc: 'Sin precio', costo: 10, p1: 1 }),
  ])])
  assert.equal(r.productos.find(p => p.sku === 'B2').precio, 35)   // 10 × 3.3 = 33 → 35
})

test('con precio y sin costo, el costo se estima con el factor del proveedor', () => {
  const r = convertirCatalogoSicar([hoja('P', [
    fila({ clave: 'C1', desc: 'Con costo', costo: 100, p1: 300 }),
    fila({ clave: 'C2', desc: 'Sin costo', costo: null, p1: 450 }),
  ])])
  const p = r.productos.find(x => x.sku === 'C2')
  assert.equal(p.costoEstimado, true); assert.equal(p.costo, 150); assert.equal(p.precio, 450)
})

test('un artículo sin precio ni costo no se carga y queda en los omitidos', () => {
  const r = convertirCatalogoSicar([hoja('P', [fila({ clave: 'D1', desc: 'Bueno', costo: 10, p1: 40 }), fila({ clave: 'D2', desc: 'Vacío', min: 3, max: 6 })])])
  assert.equal(r.productos.length, 1)
  assert.equal(r.omitidos.length, 1); assert.equal(r.omitidos[0].clave, 'D2')
})

test('un renglón de título de grupo cambia la categoría de los siguientes', () => {
  const titulo = ['N', '', '', 'FAJAS', '', '', '', null, null, null, null]
  const r = convertirCatalogoSicar([hoja('Body', [titulo, fila({ clave: 'E1', desc: 'Faja uno', costo: 50, p1: 150 })])])
  assert.equal(r.productos[0].categoria, 'Fajas')
})

test('los repetidos entre hojas se descartan', () => {
  const igual = fila({ clave: 'F1', desc: 'Repetido', costo: 40, p1: 120 })
  const r = convertirCatalogoSicar([hoja('Una', [igual]), hoja('Otra', [[...igual]])])
  assert.equal(r.productos.length, 1); assert.equal(r.repetidos, 1)
})

test('una clave única se conserva tal cual (sin sufijo); la repetida entre tallas lleva sufijo', () => {
  const r = convertirCatalogoSicar([hoja('P', [
    fila({ clave: 'G1', desc: 'Faja chica', costo: 10, p1: 30 }),
    fila({ clave: 'G1', desc: 'Faja mediana', costo: 10, p1: 30 }),
    fila({ clave: 'G2', desc: 'Única', costo: 10, p1: 30 }),
  ])])
  assert.deepEqual(r.productos.map(p => p.sku), ['G1-1', 'G1-2', 'G2'])
  assert.deepEqual(r.productos.map(p => p.claveAlterna), ['G1', 'G1', 'G2'])   // la clave alterna original se conserva
})

test('un sufijo no puede chocar con una clave real', () => {
  const r = convertirCatalogoSicar([hoja('P', [
    fila({ clave: 'CA', desc: 'Uno', costo: 10, p1: 30 }),
    fila({ clave: 'CA', desc: 'Dos', costo: 10, p1: 31 }),
    fila({ clave: 'CA-2', desc: 'Real', costo: 10, p1: 32 }),
  ])])
  const skus = r.productos.map(p => p.sku)
  assert.equal(new Set(skus).size, 3)
  assert.ok(skus.includes('CA-2'))
})

test('una descripción que empieza con número se nombra con sus características y «talla»', () => {
  const r = convertirCatalogoSicar([hoja('P', [fila({ clave: 'H1', desc: '12 - 14', carac: 'ZAPATO ORTOPEDICO', costo: 100, p1: 400 })])])
  assert.equal(r.productos[0].nombre, 'Zapato ortopedico talla 12 - 14')
})

test('los nombres repetidos se distinguen con la SKU', () => {
  const r = convertirCatalogoSicar([hoja('P', [
    fila({ clave: 'I1', desc: 'Rodillera', costo: 10, p1: 30 }),
    fila({ clave: 'I2', desc: 'Rodillera', costo: 12, p1: 40 }),
  ])])
  assert.deepEqual(r.productos.map(p => p.nombre), ['Rodillera (I1)', 'Rodillera (I2)'])
})

test('mínimo y máximo se guardan aparte; departamento y marca tienen valores por omisión', () => {
  const r = convertirCatalogoSicar([hoja('Tynor', [fila({ clave: 'J1', desc: 'Bastón', costo: 100, p1: 300, min: 5, max: 8 })])])
  const p = r.productos[0]
  assert.equal(p.minimoSicar, 5); assert.equal(p.maximoSicar, 8)
  assert.equal(p.departamento, 'Ortopedia')        // sin departamento: Ortopedia
  assert.equal(p.marca, 'Tynor'); assert.equal(p.proveedor, 'Tynor')   // sin categoría: la marca es el nombre de la hoja
  assert.equal(p.origen, 'sicar')
})

test('con departamento y categoría en el archivo, se respetan', () => {
  const r = convertirCatalogoSicar([hoja('Hoja', [fila({ clave: 'K1', desc: 'Crema', depto: 'PODOLOGIA', cat: 'PIE CLINIC', costo: 10, p1: 40 })])])
  assert.equal(r.productos[0].departamento, 'Podologia'); assert.equal(r.productos[0].marca, 'Pie clinic')
  assert.deepEqual(r.departamentos, ['Podologia'])
})

test('el código de barras sale de la columna CLAVE', () => {
  const r = convertirCatalogoSicar([hoja('P', [fila({ barras: '7501234567890', clave: 'L1', desc: 'Con barras', costo: 10, p1: 40 })])])
  assert.equal(r.productos[0].codigoBarras, '7501234567890')
})

test('una hoja sin el encabezado de SICAR se avisa y no se lee', () => {
  const sin = { nombre: 'Notas', filas: [['otra cosa'], ['x']] }
  assert.equal(esHojaSicar(sin.filas), false)
  const r = convertirCatalogoSicar([sin, hoja('P', [fila({ clave: 'M1', desc: 'Sí', costo: 10, p1: 40 })])])
  assert.deepEqual(r.hojasSinEncabezado, ['Notas']); assert.equal(r.productos.length, 1)
})

test('sin ningún precio válido, el factor general es 1 y no truena', () => {
  const r = convertirCatalogoSicar([hoja('P', [fila({ clave: 'N1', desc: 'Solo costo', costo: 100, p1: null })])])
  assert.equal(r.productos[0].precio, 100); assert.equal(r.productos[0].precioSugerido, true)
})
