import test from 'node:test'
import assert from 'node:assert/strict'
import { puntajeSinbad, sugerirSinbad, resumenMonofilamento, sensibilidadProtectoraSugerida, normalizarItb, lecturaItb, sugerirRiesgo, proximaRevision, sumarDias } from './sinbad.js'

test('SINBAD: suma de los seis ítems (mockup 06 = 2 de 6)', () => {
  assert.equal(puntajeSinbad({ s: 0, i: 0, n: 1, b: 0, a: 1, d: 0 }), 2)
  assert.equal(puntajeSinbad({}), 0)
  assert.equal(puntajeSinbad({ s: 1, i: 1, n: 1, b: 1, a: 1, d: 1 }), 6)
  assert.equal(puntajeSinbad({ s: true, i: false, n: true }), 2)
})
test('SINBAD: sugerencia del mockup 06 (antepié, pulso pedio presente, neuropatía, 1.4 cm², subcutáneo)', () => {
  const r = sugerirSinbad({ region: 'antepie', pulsosPedales: ['presente', 'disminuido', 'ausente'], sensibilidadProtectora: 'ausente', infeccion: 'sin_infeccion', areaCm2: 1.4, profundidad: 'subcutaneo' })
  assert.deepEqual(r, { s: 0, i: 0, n: 1, b: 0, a: 1, d: 0 })
  assert.equal(puntajeSinbad(r), 2)
})
test('SINBAD: isquemia solo si NO hay ningún pulso presente entre los evaluados', () => {
  assert.equal(sugerirSinbad({ pulsosPedales: ['ausente', 'disminuido'] }).i, 1)
  assert.equal(sugerirSinbad({ pulsosPedales: ['no_evaluado'] }).i, 0)
  assert.equal(sugerirSinbad({ pulsosPedales: [] }).i, 0)
})
test('SINBAD: medio pie/talón = 1, hueso = profundidad 1, área < 1 = 0, infección leve = 1', () => {
  const r = sugerirSinbad({ region: 'talon', profundidad: 'hueso_articulacion', areaCm2: 0.99, infeccion: 'leve' })
  assert.deepEqual(r, { s: 1, i: 0, n: 0, b: 1, a: 0, d: 1 })
})
test('monofilamento: 3 de 10 sitios sin sensibilidad por pie', () => {
  const sitios = [
    ...['dedo1', 'dedo3', 'mt1', 'mt5', 'talon', 'dorso', 'mediopie_medial'].map(s => ({ pie: 'I', sitio: s, siente: true })),
    ...['dedo5', 'mt3', 'mt5'].map(s => ({ pie: 'I', sitio: s, siente: false })),
    { pie: 'D', sitio: 'dedo1', siente: null },
  ]
  const r = resumenMonofilamento(sitios)
  assert.deepEqual(r.I, { evaluados: 10, sinSensibilidad: 3 })
  assert.deepEqual(r.D, { evaluados: 0, sinSensibilidad: 0 })
  assert.equal(sensibilidadProtectoraSugerida(sitios), 'ausente')
  assert.equal(sensibilidadProtectoraSugerida([]), null)
  assert.equal(sensibilidadProtectoraSugerida([{ pie: 'D', siente: true }]), 'intacta')
})
test('ITB: nunca 0 (P-011); vacío = no evaluado', () => {
  assert.equal(normalizarItb(0), null)
  assert.equal(normalizarItb(''), null)
  assert.equal(normalizarItb('abc'), null)
  assert.equal(normalizarItb('0.784'), 0.78)
  assert.equal(lecturaItb(null), 'No evaluado')
  assert.match(lecturaItb(0.78), /leve/)
  assert.match(lecturaItb(1.0), /Normal/)
})
test('riesgo: apagado por defecto (P-010) y IWGDF cuando se activa', () => {
  assert.equal(sugerirRiesgo({ lops: true, eap: true }), null)
  assert.equal(sugerirRiesgo({ lops: true, eap: true }, { activo: true }), 2)
  assert.equal(sugerirRiesgo({}, { activo: true }), 0)
  assert.equal(sugerirRiesgo({ lops: true }, { activo: true }), 1)
  assert.equal(sugerirRiesgo({ ulceraPrevia: true }, { activo: true }), 3)
})
test('próxima revisión por frecuencia', () => {
  assert.equal(sumarDias('2026-10-27', 31), '2026-11-27')
  assert.equal(proximaRevision('2026-10-27', 'cada_3_meses'), '2027-01-25')
  assert.equal(proximaRevision('2026-10-27', 'nada'), null)
})
