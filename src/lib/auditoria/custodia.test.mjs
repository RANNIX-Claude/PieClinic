// Lógica pura de la cadena de custodia (Etapa 7).   node --test src/lib/auditoria/custodia.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluarTopeCustodia, MOTIVO_TOPE_CUSTODIA, normalizarFolio, pesoCoincide, validarRangoTalonario, talonarioDelFolio, continuidadTalonario, listaFolios,
  validarTicketManual, validarLineaRecepcion, fotosRepetidas, proporcionVenta, duracionCaida,
} from './custodia.js'

test('custodia: 30 caben y el 31 se niega CON explicación (criterio 7)', () => {
  assert.equal(evaluarTopeCustodia(29).ok, true)
  assert.equal(evaluarTopeCustodia(29).restantes, 1)
  const x = evaluarTopeCustodia(30)
  assert.equal(x.ok, false)
  assert.match(x.mensaje, /30 de 30/)
  assert.match(x.mensaje, /veinte/)
  assert.match(x.mensaje, /evidencia falsa/)
  assert.ok(MOTIVO_TOPE_CUSTODIA.includes('retire uno'))
})

test('folios y series se normalizan como en el servidor', () => {
  assert.equal(normalizarFolio('  void-0001 '), 'VOID-0001')
  assert.equal(normalizarFolio('   '), null)
  assert.equal(normalizarFolio(null), null)
})

test('peso: tolerancia porcentual sobre el peso de caja llena', () => {
  assert.deepEqual(pesoCoincide(1020, 1000, 5), { ok: true, desviacion: 2 })
  assert.equal(pesoCoincide(950, 1000, 5).ok, true)
  assert.equal(pesoCoincide(949, 1000, 5).ok, false)
  assert.equal(pesoCoincide(120, 1000, 5).ok, false, 'una caja vacía se detecta')
  assert.equal(pesoCoincide(850, 1000, 20).ok, true, 'tolerancia configurable')
  assert.equal(pesoCoincide(null, 1000), null)
  assert.equal(pesoCoincide(100, 0), null)
})

test('talonarios: rango sin traslape, hasta 2,000 folios, los cancelados no estorban', () => {
  const ex = [{ folio_inicial: 1, folio_final: 50, estado: 'activo' }, { folio_inicial: 51, folio_final: 100, estado: 'cancelado' }]
  assert.equal(validarRangoTalonario(0, 10, ex).ok, false)
  assert.equal(validarRangoTalonario(10, 5, ex).ok, false)
  assert.equal(validarRangoTalonario(1, 2001, []).ok, false)
  assert.match(validarRangoTalonario(40, 90, ex).error, /se traslapa/)
  assert.equal(validarRangoTalonario(51, 120, ex).ok, true)
})

test('el folio debe caer en un talonario ACTIVO de esa sucursal', () => {
  const t = [
    { sucursal_id: 'A', folio_inicial: 1, folio_final: 50, estado: 'activo' },
    { sucursal_id: 'B', folio_inicial: 51, folio_final: 100, estado: 'activo' },
    { sucursal_id: 'A', folio_inicial: 101, folio_final: 150, estado: 'cancelado' },
  ]
  assert.equal(talonarioDelFolio(10, t, 'A').folio_final, 50)
  assert.equal(talonarioDelFolio(60, t, 'A'), null)
  assert.equal(talonarioDelFolio(120, t, 'A'), null)
})

test('auditoría del talonario: va en el 25 y falta el 18 → faltante y caso (criterio 21)', () => {
  const tickets = []
  for (let f = 1; f <= 24; f++) if (f !== 18) tickets.push({ folio: f, estado: f % 7 === 0 ? 'cancelado' : 'capturado' })
  const r = continuidadTalonario({ inicial: 1, final: 50, siguiente: 25, tickets })
  assert.deepEqual(r.faltantes, [18]); assert.deepEqual(r.nuevos, [18]); assert.equal(r.continuo, false); assert.equal(r.abreCaso, true)
  // ya marcado por una auditoría previa: sigue faltando pero no es un hallazgo nuevo
  const r2 = continuidadTalonario({ inicial: 1, final: 50, siguiente: 25, tickets: [...tickets, { folio: 18, estado: 'faltante' }] })
  assert.deepEqual(r2.faltantes, [18]); assert.deepEqual(r2.nuevos, []); assert.deepEqual(r2.yaMarcados, [18]); assert.equal(r2.abreCaso, false)
  // completo y continuo
  const r3 = continuidadTalonario({ inicial: 1, final: 50, siguiente: 25, tickets: [...tickets, { folio: 18, estado: 'capturado' }] })
  assert.equal(r3.continuo, true); assert.equal(r3.abreCaso, false)
  // un folio usado después del «en blanco»
  const r4 = continuidadTalonario({ inicial: 1, final: 50, siguiente: 25, tickets: [...tickets, { folio: 18, estado: 'capturado' }, { folio: 28, estado: 'capturado' }] })
  assert.deepEqual(r4.adelantados, [28]); assert.equal(r4.abreCaso, true)
  assert.equal(continuidadTalonario({ inicial: 1, final: 50, siguiente: 99, tickets }).ok, false)
  assert.equal(continuidadTalonario({ inicial: 1, final: 50, siguiente: 51, tickets }).ok, true)
})

test('lista de folios legible', () => {
  assert.equal(listaFolios([18]), '18')
  assert.equal(listaFolios([18, 21]), '18 y 21')
  assert.equal(listaFolios([3, 18, 21]), '3, 18 y 21')
  assert.equal(listaFolios([]), '')
})

test('ticket manual: folio, monto, renglones y foto en vivo', () => {
  const base = { folio: 12, monto: 350, productos: [{ descripcion: 'Plantilla', cantidad: 1 }], hayFoto: true }
  assert.equal(validarTicketManual(base).ok, true)
  assert.equal(validarTicketManual({ ...base, hayFoto: false }).ok, false)
  assert.equal(validarTicketManual({ ...base, monto: 0 }).ok, false)
  assert.equal(validarTicketManual({ ...base, productos: [] }).ok, false)
  assert.equal(validarTicketManual({ ...base, productos: [{ descripcion: '', cantidad: 1 }] }).ok, false)
  assert.equal(validarTicketManual({ ...base, folio: 'x' }).ok, false)
  assert.equal(validarTicketManual({ folio: 12, monto: 0, productos: [], cancelado: true, hayFoto: true }).ok, true, 'un folio cancelado va sin monto ni renglones')
})

test('recepción: solo con sello, serie por pieza, foto propia por pieza', () => {
  const caja = { descripcion: 'Equipo', requiere_sello: true, requiere_serie: true }
  const ok = { numero_serie: 'ab-12', verificacion: 'sello_intacto', folio_sello: 'v1', evidencia_id: 'e1' }
  assert.equal(validarLineaRecepcion(ok, caja).ok, true)
  assert.match(validarLineaRecepcion(ok, { descripcion: 'Jabón', requiere_sello: false }).error, /solo aplica a productos con sello/)
  assert.match(validarLineaRecepcion({ ...ok, numero_serie: ' ' }, caja).error, /serie/)
  assert.match(validarLineaRecepcion({ ...ok, evidencia_id: null }, caja).error, /foto/)
  assert.match(validarLineaRecepcion({ ...ok, verificacion: 'abierta_y_resellada' }, caja).error, /sello nuevo/)
  assert.match(validarLineaRecepcion({ ...ok, verificacion: 'abierta_y_resellada', nuevo_folio_sello: 'V1' }, caja).error, /distinto/)
  assert.equal(validarLineaRecepcion({ ...ok, verificacion: 'abierta_y_resellada', nuevo_folio_sello: 'v2', folio_sello: null }, caja).ok, true)
  assert.equal(fotosRepetidas([{ evidencia_id: 'a' }, { evidencia_id: 'a' }]), true)
  assert.equal(fotosRepetidas([{ evidencia_id: 'a' }, { evidencia_id: 'b' }]), false)
})

test('caídas: proporción de venta contra el promedio y duración', () => {
  assert.equal(proporcionVenta(100, 375), 26.67)
  assert.equal(proporcionVenta(100, 0), null)
  assert.equal(duracionCaida('2026-11-01T10:00:00Z', '2026-11-01T10:20:00Z'), '20 min')
  assert.equal(duracionCaida('2026-11-01T10:00:00Z', '2026-11-01T11:20:00Z'), '1 h 20 min')
})
