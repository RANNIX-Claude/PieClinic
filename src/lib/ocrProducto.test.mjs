import test from 'node:test'
import assert from 'node:assert/strict'
import { acomodarMayusculas, codigosDeTexto, nombresSugeridos, ean13Valido } from './ocrProducto.js'

test('acomodarMayusculas baja el todo-mayúsculas y respeta el resto', () => {
  assert.equal(acomodarMayusculas('CREMA HIDRATANTE'), 'Crema hidratante')
  assert.equal(acomodarMayusculas('Crema Podal 50 g'), 'Crema Podal 50 g')
})
test('ean13Valido', () => {
  assert.equal(ean13Valido('7501031311309'), true)
  assert.equal(ean13Valido('7501031311308'), false)
})
test('codigosDeTexto junta dígitos separados y pone primero el EAN-13 válido', () => {
  const r = codigosDeTexto('LOTE 12345678\n7 501031 311309\nTel 55 1234 5678')
  assert.equal(r[0], '7501031311309')
  assert.ok(r.includes('12345678'))
})
test('nombresSugeridos prefiere el texto grande y seguro e ignora el ruido', () => {
  const lineas = [
    { text: 'Contenido neto 50 g', confidence: 90, altura: 14 },
    { text: 'CREMA PODAL', confidence: 92, altura: 60 },
    { text: 'Hidratante intensiva', confidence: 88, altura: 40 },
    { text: 'Lote 2345 Cad 12/27', confidence: 80, altura: 12 },
    { text: '7501031311309', confidence: 95, altura: 30 },
  ]
  const r = nombresSugeridos(lineas)
  assert.equal(r[0], 'Crema podal')
  assert.equal(r[1], 'Crema podal Hidratante intensiva')
  assert.ok(!r.some(n => /contenido|lote|7501/i.test(n)))
})
test('nombresSugeridos sin texto legible devuelve vacío', () => {
  assert.deepEqual(nombresSugeridos([{ text: '..', confidence: 30, altura: 20 }]), [])
  assert.deepEqual(nombresSugeridos(undefined), [])
})
