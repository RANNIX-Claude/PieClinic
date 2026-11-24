import test from 'node:test'
import assert from 'node:assert/strict'
import { armarChecadas, mapeoInicialChecador } from './checador.js'

test('mapea columnas típicas de un reloj checador', () => {
  const m = Object.fromEntries(mapeoInicialChecador(['No. Empleado', 'Fecha y hora', 'Tipo'], []).map(x => [x.columna, x.campo_destino]))
  assert.equal(m['No. Empleado'], 'numero_empleado')
  assert.equal(m['Fecha y hora'], 'fecha_hora')
  assert.equal(m.Tipo, 'tipo')
})

test('sin columna de tipo: primer marcaje del día = entrada, último = salida; intermedios se descartan', () => {
  const mapeos = [{ columna: 'id', campo_destino: 'numero_empleado' }, { columna: 'f', campo_destino: 'fecha_hora' }]
  const filas = [
    { id: 'E001', f: '2026-10-05T08:55:00Z' }, { id: 'E001', f: '2026-10-05T13:00:00Z' }, { id: 'E001', f: '2026-10-05T17:02:00Z' },
    { id: 'E002', f: '2026-10-05T09:10:00Z' },
  ]
  const r = armarChecadas(filas, mapeos)
  assert.equal(r.filas.length, 3)
  assert.deepEqual(r.filas.filter(x => x.numero_empleado === 'E001').map(x => x.operacion).sort(), ['entrada', 'salida'])
  assert.equal(r.descartadas.length, 1)
  assert.equal(r.filas.filter(x => x.numero_empleado === 'E002').length, 1)
})

test('con columna de tipo se respeta; fecha + hora separadas; filas inválidas se reportan', () => {
  const mapeos = [{ columna: 'n', campo_destino: 'numero_empleado' }, { columna: 'd', campo_destino: 'fecha' }, { columna: 'h', campo_destino: 'hora' }, { columna: 't', campo_destino: 'tipo' }]
  const r = armarChecadas([
    { n: 'E001', d: '05/10/2026', h: '08:30', t: 'Entrada' },
    { n: 'E001', d: '05/10/2026', h: '17:30', t: 'Salida' },
    { n: '', d: '05/10/2026', h: '08:30', t: 'Entrada' },
  ], mapeos)
  assert.equal(r.filas.length, 2)
  assert.deepEqual(r.filas.map(x => x.operacion), ['entrada', 'salida'])
  assert.equal(r.errores.length, 1)
})
