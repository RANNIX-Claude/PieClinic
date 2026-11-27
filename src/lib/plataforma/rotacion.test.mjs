import test from 'node:test'
import assert from 'node:assert/strict'
import { inicioMes, finMes, sumaMeses, semanasDelMes, personasPorDia, sedePorDia, resumenPersona, tramos } from './rotacion.js'

test('límites y salto de mes', () => {
  assert.equal(inicioMes('2026-11-26'), '2026-11-01')
  assert.equal(finMes('2026-02-10'), '2026-02-28')
  assert.equal(finMes('2028-02-10'), '2028-02-29')
  assert.equal(sumaMeses('2026-12-15', 1), '2027-01-01')
  assert.equal(sumaMeses('2026-01-31', -1), '2025-12-01')
})

test('semanas empiezan en lunes y rellenan con null', () => {
  const s = semanasDelMes('2026-11-15') // 1-nov-2026 es domingo
  assert.equal(s[0].filter(Boolean).length, 1)
  assert.equal(s[0][6], '2026-11-01')
  assert.ok(s.every(w => w.length === 7))
  assert.equal(s.flat().filter(Boolean).length, 30)
})

const A = 'sede-a', B = 'sede-b'
const f = (empleado_id, fecha, sede_id, extra = {}) => ({ empleado_id, nombre_completo: empleado_id, fecha, sede_id, sede_nombre: sede_id, fuente: 'horario', ...extra })

test('personas por día: una, dos o tres en la misma sucursal, sin descansos ni otras sedes', () => {
  const filas = [f('Zoe', '2026-11-03', A), f('Ana', '2026-11-03', A), f('Beto', '2026-11-03', B), f('Cris', '2026-11-03', null), f('Ana', '2026-11-04', A)]
  const r = personasPorDia(filas, A)
  assert.deepEqual(r['2026-11-03'].map(x => x.empleado_id), ['Ana', 'Zoe'])
  assert.equal(r['2026-11-04'].length, 1)
})

test('rotación semanal de una persona: martes y jueves aquí, el resto allá', () => {
  const filas = [f('Ana', '2026-11-02', B), f('Ana', '2026-11-03', A), f('Ana', '2026-11-04', B), f('Ana', '2026-11-05', A), f('Ana', '2026-11-06', B), f('Ana', '2026-11-08', null)]
  assert.equal(sedePorDia(filas, 'Ana')['2026-11-03'].sede_id, A)
  const r = resumenPersona(filas)
  assert.equal(r.porSede[0].sede_id, B)
  assert.equal(r.porSede[0].dias, 3)
  assert.equal(r.descanso, 1)
  assert.equal(r.cambios, 4)
})

test('tramos agrupan días consecutivos en la misma sucursal', () => {
  const filas = [f('Ana', '2026-11-02', A), f('Ana', '2026-11-03', A), f('Ana', '2026-11-04', B), f('Ana', '2026-11-06', B)]
  const t = tramos(filas)
  assert.deepEqual(t.map(x => [x.sede_id, x.desde, x.hasta, x.dias]), [[A, '2026-11-02', '2026-11-03', 2], [B, '2026-11-04', '2026-11-04', 1], [B, '2026-11-06', '2026-11-06', 1]])
})
