import test from 'node:test'
import assert from 'node:assert/strict'
import { generarSesionesPlan, PLANTILLA_EXTRACCION_REFERENCIA, diaIso, diaHabil, resumenCumplimiento, totalPlan, planPorAbandonar, saldoTrasAnticipo } from './plan.js'

test('extracción de uña = 5 sesiones: extracción + 4 curaciones diarias (P-028)', () => {
  const s = generarSesionesPlan({ plantillaSesiones: PLANTILLA_EXTRACCION_REFERENCIA, fechaInicio: '2026-10-27' }) // martes
  assert.equal(s.length, 5)
  assert.deepEqual(s.map(x => x.fecha_propuesta), ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
  assert.deepEqual(s.map(x => x.tipo), ['procedimiento', 'curacion', 'curacion', 'curacion', 'curacion'])
  assert.ok(s.every(x => !x.atrasada && x.estado === 'por_generar'))
  assert.equal(totalPlan(s), 1350)
  assert.equal(s[1].precio, 0)
})
test('un día cerrado mueve la curación al siguiente día hábil y la marca atrasada', () => {
  // inicio jueves 29/oct; sábado (6) y domingo (7) cerrados
  const s = generarSesionesPlan({ plantillaSesiones: PLANTILLA_EXTRACCION_REFERENCIA, fechaInicio: '2026-10-29', diasCerrados: [6, 7] })
  assert.deepEqual(s.map(x => x.fecha_propuesta), ['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'])
  assert.deepEqual(s.map(x => x.atrasada), [false, false, true, false, false])
})
test('festivos de la clínica también se saltan', () => {
  const s = generarSesionesPlan({ plantillaSesiones: PLANTILLA_EXTRACCION_REFERENCIA, fechaInicio: '2026-11-01', diasCerrados: [7], festivos: ['2026-11-02'] })
  assert.equal(s[0].fecha_propuesta, '2026-11-03')
  assert.equal(s[0].atrasada, true)
})
test('ventana de láser 30–35 días desde la sesión anterior', () => {
  const s = generarSesionesPlan({ fechaInicio: '2026-11-03', plantillaSesiones: [
    { numero: 1, nombre: 'Láser 1', tipo: 'procedimiento', intervalo_dias: 0, duracion_min: 30, precio: 800 },
    { numero: 2, nombre: 'Láser 2', tipo: 'procedimiento', intervalo_dias: 30, ventana_min_dias: 30, ventana_max_dias: 35, duracion_min: 30, precio: 800 }] })
  assert.equal(s[1].fecha_propuesta, '2026-12-03')
  assert.equal(s[1].ventana_desde, '2026-12-03')
  assert.equal(s[1].ventana_hasta, '2026-12-08')
})
test('sin fecha de inicio no genera nada y ordena por número', () => {
  assert.deepEqual(generarSesionesPlan({ plantillaSesiones: PLANTILLA_EXTRACCION_REFERENCIA, fechaInicio: '' }), [])
  const s = generarSesionesPlan({ fechaInicio: '2026-10-27', plantillaSesiones: [...PLANTILLA_EXTRACCION_REFERENCIA].reverse() })
  assert.equal(s[0].numero, 1)
})
test('día ISO y día hábil', () => {
  assert.equal(diaIso('2026-10-25'), 7)
  assert.equal(diaIso('2026-10-26'), 1)
  assert.equal(diaHabil('2026-10-25', [7]), '2026-10-26')
})
test('cumplimiento, abandono a 30 días y saldo', () => {
  const r = resumenCumplimiento([{ estado: 'realizada' }, { estado: 'falta', reprogramaciones: 1 }, { estado: 'por_generar', atrasada: true }, { estado: 'cancelada' }])
  assert.deepEqual(r, { total: 3, realizadas: 1, faltas: 1, reprogramaciones: 1, atrasadas: 1 })
  assert.equal(planPorAbandonar('2026-09-27', '2026-10-27'), true)
  assert.equal(planPorAbandonar('2026-09-28', '2026-10-27'), false)
  assert.deepEqual(saldoTrasAnticipo(1350, 300), { anticipo: 300, saldo: 1050 })
  assert.deepEqual(saldoTrasAnticipo(100, 300), { anticipo: 100, saldo: 0 })
})
