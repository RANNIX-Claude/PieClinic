import test from 'node:test'
import assert from 'node:assert/strict'
import { diasLey, aniosServicioEnAnio, diasDerechoAnio, diasSolicitados, validarSolicitud, saldoVacaciones, primaVacacional } from './vacaciones.js'

test('días de vacaciones por antigüedad (espejo de vacaciones_dias_ley)', () => {
  const esperado = { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20, 6: 22, 10: 22, 11: 24, 15: 24, 16: 26 }
  for (const [a, d] of Object.entries(esperado)) assert.equal(diasLey(Number(a)), d, `año ${a}`)
  assert.equal(diasLey(0), 12)
  assert.equal(diasLey(1, 14), 14)
})

test('años de servicio y derecho del año calendario', () => {
  assert.equal(aniosServicioEnAnio('2024-03-10', 2026), 2)
  assert.equal(aniosServicioEnAnio(null, 2026), 1)
  assert.equal(aniosServicioEnAnio('2026-05-01', 2026), 1)
  assert.equal(diasDerechoAnio('2022-01-01', 2026), 18)
})

test('días solicitados: sin domingos ni festivos', () => {
  // 2026-10-26 es lunes; lunes a domingo = 6 laborables
  assert.equal(diasSolicitados('2026-10-26', '2026-11-01'), 6)
  assert.equal(diasSolicitados('2026-10-26', '2026-11-01', { excluirDomingos: false }), 7)
  assert.equal(diasSolicitados('2026-10-26', '2026-11-01', { festivos: ['2026-10-28'] }), 5)
  assert.equal(diasSolicitados('2026-11-02', '2026-10-30'), 0)
})

test('validación de solicitud: saldo y traslapes', () => {
  assert.equal(validarSolicitud({ desde: '2026-11-02', hasta: '2026-11-06', dias: 5, saldo: 10 }).ok, true)
  assert.match(validarSolicitud({ desde: '2026-11-02', hasta: '2026-11-06', dias: 5, saldo: 3 }).errores[0], /3 día/)
  const t = validarSolicitud({ desde: '2026-11-02', hasta: '2026-11-06', dias: 5, saldo: 10, existentes: [{ desde: '2026-11-05', hasta: '2026-11-10', estado: 'autorizada' }] })
  assert.equal(t.ok, false)
  const cancelada = validarSolicitud({ desde: '2026-11-02', hasta: '2026-11-06', dias: 5, saldo: 10, existentes: [{ desde: '2026-11-05', hasta: '2026-11-10', estado: 'cancelada' }] })
  assert.equal(cancelada.ok, true)
})

test('saldo: solo cuentan autorizadas y tomadas; prima vacacional 25 %', () => {
  const s = saldoVacaciones(12, [{ dias: 5, estado: 'tomada' }, { dias: 2, estado: 'autorizada' }, { dias: 3, estado: 'solicitada' }, { dias: 4, estado: 'cancelada' }])
  assert.deepEqual(s, { usados: 7, disponibles: 5 })
  assert.equal(primaVacacional(6, 400), 600)
})
