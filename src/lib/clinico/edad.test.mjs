import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularEdad, calcularMeses, esMenorDeEdad, textoEdad, diasParaCumpleanos } from './edad.js'

const HOY = new Date(2026, 9, 27) // 27/oct/2026

test('edad: cumple años justo hoy cuenta el año', () => {
  assert.equal(calcularEdad('1975-10-27', HOY), 51)
  assert.equal(calcularEdad('1975-10-28', HOY), 50)
  assert.equal(calcularEdad('1971-03-14', HOY), 55)
})
test('edad: mockup 10 (02/05/1975 → 51 años a oct-2026)', () => {
  assert.equal(calcularEdad('1975-05-02', HOY), 51)
})
test('edad: fecha inválida o futura devuelve null', () => {
  assert.equal(calcularEdad('', HOY), null)
  assert.equal(calcularEdad(null, HOY), null)
  assert.equal(calcularEdad('no-es-fecha', HOY), null)
  assert.equal(calcularEdad('2030-01-01', HOY), null)
})
test('edad: 29 de febrero', () => {
  assert.equal(calcularEdad('2000-02-29', new Date(2026, 1, 28)), 25)
  assert.equal(calcularEdad('2000-02-29', new Date(2026, 2, 1)), 26)
})
test('menor de edad (P-005): 17 años sí, 18 años no', () => {
  assert.equal(esMenorDeEdad('2009-10-28', HOY), true)
  assert.equal(esMenorDeEdad('2008-10-27', HOY), false)
  assert.equal(esMenorDeEdad(null, HOY), false)
})
test('texto de edad con singular y meses', () => {
  assert.equal(textoEdad('2025-10-27', HOY), '1 año')
  assert.equal(textoEdad('1975-05-02', HOY), '51 años')
  assert.equal(textoEdad('2026-02-27', HOY), '8 meses')
  assert.equal(textoEdad(undefined, HOY), '—')
  assert.equal(calcularMeses('2026-09-28', HOY), 0)
})
test('días para el cumpleaños', () => {
  assert.equal(diasParaCumpleanos('1980-10-27', HOY), 0)
  assert.equal(diasParaCumpleanos('1980-10-30', HOY), 3)
  assert.equal(diasParaCumpleanos('1980-10-20', HOY), 358)
  assert.equal(diasParaCumpleanos('2000-02-29', new Date(2026, 1, 20)), 8)
})
