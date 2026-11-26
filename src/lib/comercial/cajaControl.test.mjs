// Reglas puras de los controles de Caja (Etapa 1).   node --test src/lib/comercial
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PARAMETROS_CAJA_OMISION, topeSinClave, descuentoNecesitaClave, precioNecesitaClave, precioEditable, normalizarCodigo, piezasRequeridas,
  segundosRestantes, formatoCuenta, textoEstadoCancelacion, avisoEntregaPendiente, textoControl,
} from './cajaControlReglas.js'

test('lo que cambia la operación del cajero nace apagado', () => {
  assert.equal(PARAMETROS_CAJA_OMISION.precio_abierto_con_clave, false)
  assert.equal(PARAMETROS_CAJA_OMISION.descuento_motivo_cerrado, false)
  assert.equal(PARAMETROS_CAJA_OMISION.cancelacion_con_bloqueo, false)
  assert.equal(PARAMETROS_CAJA_OMISION.cancelacion_espera_seg, 60)
  assert.ok(Object.isFrozen(PARAMETROS_CAJA_OMISION))
})

test('tope de descuento sin clave: el 10 % libre de siempre, o el del catálogo cerrado (0 % por omisión) cuando está encendido', () => {
  assert.equal(topeSinClave({ descuento_motivo_cerrado: false, descuento_sin_clave_pct: 5 }, 10), 10)
  assert.equal(topeSinClave({ descuento_motivo_cerrado: true, descuento_sin_clave_pct: 0 }, 10), 0)
  assert.equal(topeSinClave({ descuento_motivo_cerrado: true, descuento_sin_clave_pct: 15 }, 10), 15)
  assert.equal(topeSinClave(undefined, 10), 10)
})

test('descuento: pide clave sobre el tope, no la pide el dueño ni quien ya está autorizado', () => {
  const cerrado = { descuento_motivo_cerrado: true, descuento_sin_clave_pct: 0 }
  assert.equal(descuentoNecesitaClave({ pct: 5, params: cerrado }), true)
  assert.equal(descuentoNecesitaClave({ pct: 0, params: cerrado }), false)
  assert.equal(descuentoNecesitaClave({ pct: 5, params: cerrado, esAdmin: true }), false)
  assert.equal(descuentoNecesitaClave({ pct: 5, params: cerrado, autorizado: true }), false)
  assert.equal(descuentoNecesitaClave({ pct: 10, params: {} }), false, 'apagado: 10 % libre, como siempre')
  assert.equal(descuentoNecesitaClave({ pct: 10.01, params: {} }), true)
  assert.equal(descuentoNecesitaClave({ pct: 10, params: { descuento_motivo_cerrado: true, descuento_sin_clave_pct: 10 } }), false)
})

test('precio: las líneas de catálogo nunca son editables; el precio abierto pide clave solo con el parámetro', () => {
  assert.equal(precioEditable({ linea: { editable: false } }), false)
  assert.equal(precioEditable({ linea: { editable: true, admite_caracteristicas: true } }), false, 'el producto especial se calcula: base + características')
  assert.equal(precioEditable({ linea: { editable: true } }), true)
  const abierta = { editable: true, precio_unitario: 2400 }
  assert.equal(precioNecesitaClave({ linea: abierta, params: { precio_abierto_con_clave: false } }), false)
  assert.equal(precioNecesitaClave({ linea: abierta, params: { precio_abierto_con_clave: true } }), true)
  assert.equal(precioNecesitaClave({ linea: { ...abierta, aut_precio: 'x' }, params: { precio_abierto_con_clave: true } }), false)
  assert.equal(precioNecesitaClave({ linea: abierta, params: { precio_abierto_con_clave: true }, esAdmin: true }), false)
  assert.equal(precioNecesitaClave({ linea: { editable: false, precio_unitario: 100 }, params: { precio_abierto_con_clave: true } }), false)
})

test('escaneo: se normaliza el código y se exige una lectura por unidad', () => {
  assert.equal(normalizarCodigo('  7501234567890 \n'), '7501234567890')
  assert.equal(normalizarCodigo('ABC-1'), 'abc-1')
  assert.equal(normalizarCodigo(null), '')
  assert.equal(piezasRequeridas([{ cantidad: 2 }, { cantidad: 1 }]), 3)
  assert.equal(piezasRequeridas([{ cantidad: 0.5 }]), 1)
  assert.equal(piezasRequeridas([]), 0)
})

test('cuenta regresiva de la espera', () => {
  const t0 = Date.parse('2026-11-26T12:00:00Z')
  assert.equal(segundosRestantes('2026-11-26T12:01:00Z', t0), 60)
  assert.equal(segundosRestantes('2026-11-26T12:00:00.400Z', t0), 1)
  assert.equal(segundosRestantes('2026-11-26T11:59:00Z', t0), 0, 'nunca negativo')
  assert.equal(formatoCuenta(60), '1:00')
  assert.equal(formatoCuenta(7), '0:07')
})

test('textos: nunca prometen que la pieza volvió antes de que el módulo responda', () => {
  assert.match(textoEstadoCancelacion('pendiente'), /NO vuelve/)
  assert.match(textoEstadoCancelacion('pendiente_de_validacion'), /no volvió/)
  assert.match(textoEstadoCancelacion('autorizada'), /volvió al inventario/)
  assert.match(textoEstadoCancelacion('rechazada'), /firme/)
})

test('aviso de entrega no aceptada: sin montos ni diferencias', () => {
  assert.equal(avisoEntregaPendiente({ puede: true }, { bloquea: false }), null)
  assert.match(avisoEntregaPendiente({ puede: false, motivo: 'El turno anterior no ha sido aceptado.' }, null), /no ha sido aceptado/)
  assert.match(avisoEntregaPendiente({ puede: true }, { bloquea: true }), /turno anterior no ha sido aceptado/)
  assert.equal(avisoEntregaPendiente(null, null), null)
})

test('los errores de control se muestran sin su prefijo técnico', () => {
  assert.equal(textoControl('precio_no_editable: el precio de «X» es el del catálogo'), 'el precio de «X» es el del catálogo')
  assert.equal(textoControl('PF403: cancelacion_con_bloqueo: pídala desde Tickets'), 'pídala desde Tickets')
  assert.equal(textoControl('otro error'), 'otro error')
})
