import test from 'node:test'
import assert from 'node:assert/strict'
import { requiereAutorizacion, estadoAutorizacion, puedeEnviarOC, totalesOC, costoPromedio, variacionCosto, estadoRecepcion, estadoExistencia, cantidadSugerida, diferenciasTraspaso } from './compras.js'

test('autorización por monto: desde $5,000 (>=) y umbral configurable (P-081)', () => {
  assert.equal(requiereAutorizacion(4999.99), false)
  assert.equal(requiereAutorizacion(5000), true)
  assert.equal(requiereAutorizacion(12000), true)
  assert.equal(requiereAutorizacion(3000, 2000), true)
  assert.equal(requiereAutorizacion(9999, 0), false)
})

test('la autorización se pierde si cambia el total', () => {
  assert.equal(estadoAutorizacion({ total: 6000, autorizadaPor: 'u1', totalAutorizado: 6000 }), 'autorizada')
  assert.equal(estadoAutorizacion({ total: 6500, autorizadaPor: 'u1', totalAutorizado: 6000 }), 'pendiente')
  assert.equal(estadoAutorizacion({ total: 800 }), 'no_requiere')
})

test('no se envía una OC con autorización pendiente ni sin partidas ni fuera de borrador', () => {
  const base = { estado: 'borrador', lineas: [{}], total: 8000 }
  assert.equal(puedeEnviarOC(base).ok, false)
  assert.equal(puedeEnviarOC({ ...base, autorizadaPor: 'u', totalAutorizado: 8000 }).ok, true)
  assert.equal(puedeEnviarOC({ ...base, total: 100 }).ok, true)
  assert.equal(puedeEnviarOC({ ...base, lineas: [], total: 100 }).ok, false)
  assert.equal(puedeEnviarOC({ ...base, estado: 'enviada', total: 100 }).ok, false)
})

test('totales de la orden con IVA', () => {
  const t = totalesOC([{ cantidad: 10, costo_unitario: 100 }, { cantidad: 2, costo_unitario: 50, descuento: 10, iva_pct: 0 }])
  assert.deepEqual(t, { subtotal: 1090, iva: 160, total: 1250 })
})

test('costo promedio ponderado', () => {
  assert.equal(costoPromedio(10, 100, 10, 120), 110)
  assert.equal(costoPromedio(0, 100, 5, 80), 80)
  assert.equal(costoPromedio(-3, 100, 5, 80), 80)
  assert.equal(costoPromedio(10, 100, 0, 999), 100)
  assert.equal(costoPromedio(3, 10, 4, 20), 15.7143)
  assert.equal(variacionCosto(100, 110), 10)
  assert.equal(variacionCosto(0, 5), null)
})

test('recepción parcial y completa', () => {
  assert.equal(estadoRecepcion([{ cantidad: 10, recibida: 0 }]), 'enviada')
  assert.equal(estadoRecepcion([{ cantidad: 10, recibida: 4 }, { cantidad: 5, recibida: 5 }]), 'recibida_parcial')
  assert.equal(estadoRecepcion([{ cantidad: 10, recibida: 12 }, { cantidad: 5, recibida: 5 }]), 'recibida')
})

test('estado de existencia (S30), sugerencia y diferencias de traspaso', () => {
  assert.equal(estadoExistencia({ existencia: 0, minimo: 3 }), 'sin_existencia')
  assert.equal(estadoExistencia({ existencia: -2, minimo: 3 }), 'sin_existencia')
  assert.equal(estadoExistencia({ existencia: 2, minimo: 3 }), 'bajo_minimo')
  assert.equal(estadoExistencia({ existencia: 3, minimo: 3 }), 'en_el_minimo')
  assert.equal(estadoExistencia({ existencia: 9, minimo: 3, proximaCaducidadDias: 10 }), 'caduca_pronto')
  assert.equal(estadoExistencia({ existencia: 9, minimo: 3, proximaCaducidadDias: 90 }), 'ok')
  assert.equal(cantidadSugerida({ existencia: 2, minimo: 3, maximo: 10 }), 8)
  assert.equal(cantidadSugerida({ existencia: 2, minimo: 3 }), 4)
  assert.deepEqual(diferenciasTraspaso([{ enviada: 5, recibida: 5 }, { enviada: 4, recibida: 3 }]), [{ indice: 1, diferencia: -1 }])
})

import { sugerirTraspaso, importeLineaOC, totalesOCPorLinea } from './compras.js'
test('sugerencia de traspaso: no pide más de lo que hay en el origen ni a quien no está bajo mínimo', () => {
  const r = sugerirTraspaso([
    { producto_id: 'a', existencia: 1, minimo: 4, maximo: 10 }, { producto_id: 'b', existencia: 5, minimo: 4 },
    { producto_id: 'c', existencia: 0, minimo: 3 }, { producto_id: 'd', existencia: 0, minimo: 3 },
  ], { a: 6, b: 50, c: 100, d: 0 })
  assert.deepEqual(r, [{ producto_id: 'a', cantidad: 6 }, { producto_id: 'c', cantidad: 6 }])
})
test('importe de línea de OC: descuento una vez e IVA sobre la base neta (CA-21)', () => {
  assert.deepEqual(importeLineaOC({ cantidad: 40, costo_unitario: 112, descuento_pct: 5, iva_pct: 16 }), { base_neta: 4256, iva_monto: 680.96, importe: 4936.96 })
  const t = totalesOCPorLinea([{ cantidad: 40, costo_unitario: 112, descuento_pct: 5 }, { cantidad: 10, costo_unitario: 10, iva_pct: 0 }])
  assert.deepEqual(t, { subtotal: 4580, descuento: 224, iva: 680.96, total: 5036.96 })
})
