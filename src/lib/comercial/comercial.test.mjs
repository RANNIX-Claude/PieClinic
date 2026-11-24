// Pruebas de la lógica pura del área comercial. Correr: node --test src/lib/comercial/
import test from 'node:test'
import assert from 'node:assert/strict'
import { redondear } from './dinero.js'
import { anticipoServicio, evaluarCancelacion, resultadoAnticipoCancelacion, puedeReprogramar, param } from './anticipo.js'
import { calcularLinea, requierePin, validarDescuento, totalesVenta, repartirDescuentoGlobal, cambio } from './ventas.js'
import { desglosarIva, conceptosCfdi, validarRfc } from './fiscal.js'
import { efectivoEsperado, diferencia, fueraDeTolerancia, evaluarCierre, resumenTurno } from './corte.js'
import { precioVigente, situacionPrecio, nuevaVersionPrecio } from './precios.js'
import { horariosDisponibles, validarReprogramacion, conflictosCita, transicionesPermitidas, estadoListaEspera, ordenarListaEspera } from './agenda.js'

test('redondeo comercial: 0.005 sube', () => {
  assert.equal(redondear(1.005), 1.01)
  assert.equal(redondear(2.675), 2.68)
  assert.equal(redondear(0.1 + 0.2), 0.3)
})

// ── Anticipo / cancelación / reembolso ──────────────────────────────────────────────────────────────
test('anticipo: 30 % del precio, tope al precio y sin anticipo en a valorar, gratis, curación o $0', () => {
  assert.equal(anticipoServicio({ tipo_precio: 'fijo' }, 400), 120)
  assert.equal(anticipoServicio({ tipo_precio: 'fijo' }, 530), 159)
  assert.equal(anticipoServicio({ tipo_precio: 'fijo', anticipo_monto_fijo: 200 }, 400), 200)
  assert.equal(anticipoServicio({ tipo_precio: 'fijo', anticipo_monto_fijo: 900 }, 400), 400)
  assert.equal(anticipoServicio({ tipo_precio: 'a_valorar' }, 0), 0)
  assert.equal(anticipoServicio({ tipo_precio: 'gratis' }, 100), 0)
  assert.equal(anticipoServicio({ tipo_precio: 'fijo', es_curacion_incluida: true }, 100), 0)
  assert.equal(anticipoServicio({ tipo_precio: 'fijo' }, 0), 0)
  assert.equal(anticipoServicio({ tipo_precio: 'fijo' }, 400, 50), 200)
})
test('cancelación: ≥ 48 h está en plazo; menos (incluido el mismo día) no', () => {
  const inicio = '2026-10-29T11:30:00-06:00'
  assert.equal(evaluarCancelacion({ inicio, ahora: '2026-10-27T11:30:00-06:00' }).enPlazo, true)   // exactamente 48 h
  assert.equal(evaluarCancelacion({ inicio, ahora: '2026-10-27T11:31:00-06:00' }).enPlazo, false)
  assert.equal(evaluarCancelacion({ inicio, ahora: '2026-10-29T08:00:00-06:00' }).enPlazo, false)
  assert.equal(evaluarCancelacion({ inicio, ahora: '2026-10-28T11:30:00-06:00', horasAviso: 24 }).enPlazo, true)
})
test('reembolso: en plazo se devuelve completo (la comisión de Clip la absorbe la clínica); fuera de plazo es no reembolsable', () => {
  const ok = resultadoAnticipoCancelacion({ anticipo: 200, enPlazo: true, comisionClip: 7.8 })
  assert.deepEqual([ok.reembolsa, ok.montoReembolso, ok.costoClinica, ok.estadoAnticipo], [true, 200, 7.8, 'reembolsado'])
  const no = resultadoAnticipoCancelacion({ anticipo: 200, enPlazo: false })
  assert.deepEqual([no.reembolsa, no.montoReembolso, no.retenido, no.estadoAnticipo], [false, 0, 200, 'no_reembolsable'])
  assert.equal(resultadoAnticipoCancelacion({ anticipo: 0, enPlazo: true }).reembolsa, false)
  assert.equal(resultadoAnticipoCancelacion({ anticipo: 200, estadoAnticipo: 'pendiente', enPlazo: true }).reembolsa, false)
})
test('reprogramar: ≥ 48 h y menos de 2 reprogramaciones', () => {
  const inicio = '2026-10-29T11:30:00-06:00', ahora = '2026-10-26T10:00:00-06:00'
  assert.equal(puedeReprogramar({ inicio, ahora, reprogramaciones: 0 }).permitido, true)
  assert.equal(puedeReprogramar({ inicio, ahora, reprogramaciones: 1 }).restantes, 1)
  assert.equal(puedeReprogramar({ inicio, ahora, reprogramaciones: 2 }).permitido, false)
  assert.equal(puedeReprogramar({ inicio, ahora: '2026-10-28T10:00:00-06:00', reprogramaciones: 0 }).permitido, false)
})
test('parámetros de clínica con valores por defecto', () => {
  assert.equal(param({}, 'cancelacion_horas_aviso'), 48)
  assert.equal(param({ cancelacion_horas_aviso: 24 }, 'cancelacion_horas_aviso'), 24)
  assert.equal(param({ tolerancia_corte_mxn: '' }, 'tolerancia_corte_mxn'), 50)
})

// ── Descuentos, PIN e IVA ───────────────────────────────────────────────────────────────────────────
test('línea: descuento 10 % y totales (mockup 17)', () => {
  const l = calcularLinea({ cantidad: 1, precio_unitario: 250, descuento_pct: 10, iva_tipo: '16' })
  assert.deepEqual([l.importe_bruto, l.descuento, l.importe], [250, 25, 225])
  assert.equal(l.base_neta + l.iva_monto, 225)
  assert.equal(l.base_neta, 193.97)
  assert.equal(l.iva_monto, 31.03)
})
test('descuento: Recepción hasta 10 % sin PIN; más pide PIN; Administrador nunca', () => {
  assert.equal(requierePin({ pct: 10 }), false)
  assert.equal(requierePin({ pct: 10.01 }), true)
  assert.equal(requierePin({ pct: 25, esAdmin: true }), false)
  assert.equal(requierePin({ pct: 15, maxPct: 20 }), false)
})
test('validar descuento: motivo obligatorio, PIN y podólogo no descuenta', () => {
  assert.equal(validarDescuento({ pct: 5, motivo: '' }).ok, false)
  assert.equal(validarDescuento({ pct: 5, motivo: 'cortesía' }).ok, true)
  const sinPin = validarDescuento({ pct: 20, motivo: 'promoción' })
  assert.equal(sinPin.ok, false); assert.equal(sinPin.pin, true)
  assert.equal(validarDescuento({ pct: 20, motivo: 'promoción', autorizado: true }).ok, true)
  assert.equal(validarDescuento({ pct: 5, motivo: 'x', rol: 'podologo' }).ok, false)
  assert.equal(validarDescuento({ pct: 0 }).ok, true)
})
test('ticket del mockup 17: totales con descuento y anticipo', () => {
  const t = totalesVenta([
    { cantidad: 1, precio_unitario: 400, iva_tipo: 'exento' },
    { cantidad: 1, precio_unitario: 0, iva_tipo: 'exento' },
    { cantidad: 1, precio_unitario: 250, descuento_pct: 10, iva_tipo: '16' },
    { cantidad: 1, precio_unitario: 1185, iva_tipo: '16' },
  ], { anticipo: 200, pagos: [{ monto: 1000 }, { monto: 610 }] })
  assert.equal(t.subtotal, 1835); assert.equal(t.descuento_total, 25); assert.equal(t.total, 1810)
  assert.equal(t.anticipo_aplicado, 200); assert.equal(t.a_cobrar, 1610); assert.equal(t.saldo, 0)
})
test('descuento global por monto se reparte y suma exacto', () => {
  const ls = repartirDescuentoGlobal([{ precio_unitario: 100 }, { precio_unitario: 100 }, { precio_unitario: 100 }], 'monto', 10)
  assert.equal(redondear(ls.reduce((s, l) => s + l.descuento_monto, 0)), 10)
  assert.equal(repartirDescuentoGlobal([{ precio_unitario: 100 }], 'pct', 5)[0].descuento_pct, 5)
})
test('cambio de efectivo', () => { assert.equal(cambio(1100, 1000), 100); assert.equal(cambio(900, 1000), 0) })

test('IVA: servicios exentos y productos 16 % incluido', () => {
  assert.deepEqual(desglosarIva(400, 'exento'), { base: 400, iva: 0, total: 400 })
  assert.deepEqual(desglosarIva(116, '16'), { base: 100, iva: 16, total: 116 })
  assert.deepEqual(desglosarIva(250, 'tasa0'), { base: 250, iva: 0, total: 250 })
  const d = desglosarIva(1185, '16'); assert.equal(redondear(d.base + d.iva), 1185)
})
test('CFDI desde el ticket: mismo total que el ticket (P-057)', () => {
  const lineas = [
    { descripcion: 'Quiropodia', cantidad: 1, precio_unitario: 400, iva_tipo: 'exento' },
    { descripcion: 'Crema', cantidad: 1, precio_unitario: 250, descuento_pct: 10, iva_tipo: '16' },
    { descripcion: 'Laca', cantidad: 1, precio_unitario: 1185, iva_tipo: '16' },
  ]
  const ticket = totalesVenta(lineas)
  const cfdi = conceptosCfdi(ticket.lineas)
  assert.equal(cfdi.total, ticket.total)
  assert.equal(cfdi.total, 1810)
  assert.equal(cfdi.iva_exento_base, 400)
  assert.equal(cfdi.iva_trasladado, ticket.iva_total)
  for (const c of cfdi.conceptos) assert.equal(redondear(c.importe - c.descuento), c.base)
})
test('RFC válido', () => { assert.equal(validarRfc('PEAM780512KT3'), true); assert.equal(validarRfc('XAXX010101000'), true); assert.equal(validarRfc('123'), false) })

// ── Corte de caja ───────────────────────────────────────────────────────────────────────────────────
test('corte: efectivo esperado del mockup 17', () => {
  const esperado = efectivoEsperado({ fondo_inicial: 1500, ventas_efectivo: 6340, retiros: 2000, cancelaciones_efectivo: 0 })
  assert.equal(esperado, 5840)
  assert.equal(diferencia(5820, esperado), -20)
})
test('corte: tolerancia de $50', () => {
  assert.equal(fueraDeTolerancia(-50), false)
  assert.equal(fueraDeTolerancia(50.01), true)
  assert.equal(fueraDeTolerancia(-20), false)
})
test('cierre: exacto cierra; diferencia pide justificación; fuera de tolerancia pide Administrador', () => {
  assert.equal(evaluarCierre({ contado: 5840, esperado: 5840 }).ok, true)
  assert.deepEqual(evaluarCierre({ contado: 5820, esperado: 5840 }).requiere, ['justificacion'])
  assert.equal(evaluarCierre({ contado: 5820, esperado: 5840, justificacion: 'falta de cambio' }).ok, true)
  assert.deepEqual(evaluarCierre({ contado: 5700, esperado: 5840, justificacion: 'x' }).requiere, ['administrador'])
  assert.equal(evaluarCierre({ contado: 5700, esperado: 5840, justificacion: 'x', autorizado: true }).ok, true)
  assert.equal(evaluarCierre({ contado: 5700, esperado: 5840, justificacion: 'x', esAdmin: true }).ok, true)
})
test('resumen del turno: anticipos aplicados no son dinero del turno', () => {
  const r = resumenTurno({ turno: { fondo_inicial: 1500 }, pagos: [{ metodo: 'efectivo', monto: 6340 }, { metodo: 'tarjeta', monto: 8120 }, { metodo: 'anticipo', monto: 1000 }],
    movimientos: [{ tipo: 'retiro', monto: 2000 }, { tipo: 'deposito', monto: 0.01 }], canceladasEfectivo: 250 })
  assert.equal(r.anticipos_aplicados, 1000)
  assert.equal(r.retiros, 1999.99)
  assert.equal(r.efectivo_esperado, redondear(1500 + 6340 - 1999.99 - 250))
})

// ── Precio vigente por fecha ────────────────────────────────────────────────────────────────────────
const precios = [
  { id: 1, sede_id: null, vigente_desde: '2026-01-01', vigente_hasta: '2026-06-30', precio: 750 },
  { id: 2, sede_id: null, vigente_desde: '2026-07-01', vigente_hasta: null, precio: 800 },
  { id: 3, sede_id: null, vigente_desde: '2026-03-15', vigente_hasta: '2026-03-31', precio: 650 },   // promoción dentro de la lista (traslapada a propósito para el histórico)
  { id: 4, sede_id: 'roma', vigente_desde: '2026-01-01', vigente_hasta: null, precio: 850 },
]
test('precio vigente por fecha: el histórico se conserva y el de la sede gana', () => {
  assert.equal(precioVigente(precios, { fecha: '2026-02-01' }).precio, 750)
  assert.equal(precioVigente(precios, { fecha: '2026-07-01' }).precio, 800)
  assert.equal(precioVigente(precios, { fecha: '2026-06-30' }).precio, 750)
  assert.equal(precioVigente(precios, { fecha: '2026-08-01', sedeId: 'roma' }).precio, 850)
  assert.equal(precioVigente(precios, { fecha: '2026-08-01', sedeId: 'coyoacan' }).precio, 800)
  assert.equal(precioVigente(precios, { fecha: '2025-12-31' }), null)
})
test('situación de precio y nueva versión', () => {
  assert.equal(situacionPrecio({ vigente_desde: '2026-11-01', vigente_hasta: null }, '2026-10-26'), 'programado')
  assert.equal(situacionPrecio({ vigente_desde: '2026-01-01', vigente_hasta: null }, '2026-10-26'), 'vigente')
  assert.equal(situacionPrecio({ vigente_desde: '2026-01-01', vigente_hasta: '2026-06-30' }, '2026-10-26'), 'historico')
  const lista = precios.filter(p => p.sede_id == null && p.id !== 3)
  const r = nuevaVersionPrecio(lista, { vigente_desde: '2026-12-01', precio: 900 })
  assert.equal(r.ok, true); assert.equal(r.cierraId, 2); assert.equal(r.cierraHasta, '2026-11-30')
  assert.equal(nuevaVersionPrecio(lista, { vigente_desde: '2026-05-01', precio: 900 }).ok, false)   // traslape con versiones posteriores
  assert.equal(nuevaVersionPrecio(lista, { vigente_desde: '2026-12-01', precio: -1 }).ok, false)
})

// ── Disponibilidad de horarios ──────────────────────────────────────────────────────────────────────
const base = { fecha: '2026-10-29', offset: '-06:00', horarios: [{ hora_inicio: '10:00', hora_fin: '13:00' }], duracionMin: 30, margenMin: 10, pasoMin: 30, ahora: '2026-10-26T08:00:00-06:00' }
const hh = s => new Date(s.inicio).toLocaleTimeString('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })
test('disponibilidad: rejilla completa sin citas', () => {
  assert.deepEqual(horariosDisponibles(base).map(hh), ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'])
})
test('disponibilidad: una cita bloquea su hueco más el margen de 10 min', () => {
  const r = horariosDisponibles({ ...base, citas: [{ estado: 'confirmada', inicio: '2026-10-29T11:00:00-06:00', fin: '2026-10-29T11:30:00-06:00' }] })
  assert.deepEqual(r.map(hh), ['10:00', '12:00', '12:30'])    // 10:30 queda pegado (margen) y 11:30 también
})
test('disponibilidad: citas canceladas y no asistió liberan el horario', () => {
  const r = horariosDisponibles({ ...base, citas: [{ estado: 'cancelada', inicio: '2026-10-29T11:00:00-06:00', fin: '2026-10-29T11:30:00-06:00' }] })
  assert.equal(r.length, 6)
})
test('disponibilidad: bloqueos y festivos', () => {
  const r = horariosDisponibles({ ...base, bloqueos: [{ estado: 'autorizado', inicio: '2026-10-29T11:00:00-06:00', fin: '2026-10-29T12:00:00-06:00' }] })
  assert.deepEqual(r.map(hh), ['10:00', '10:30', '12:00', '12:30'])
  assert.deepEqual(horariosDisponibles({ ...base, festivo: { abre: false } }), [])
  assert.equal(horariosDisponibles({ ...base, festivo: { abre: true } }).length, 6)
  const sinAutorizar = horariosDisponibles({ ...base, bloqueos: [{ estado: 'solicitado', inicio: '2026-10-29T11:00:00-06:00', fin: '2026-10-29T12:00:00-06:00' }] })
  assert.equal(sinAutorizar.length, 6)
})
test('disponibilidad: no ofrece horarios pasados ni servicios que no caben', () => {
  assert.equal(horariosDisponibles({ ...base, ahora: '2026-10-29T11:10:00-06:00' }).length, 3)
  assert.deepEqual(horariosDisponibles({ ...base, duracionMin: 90 }).map(hh), ['10:00', '10:30', '11:00', '11:30'])
  assert.deepEqual(horariosDisponibles({ ...base, duracionMin: 200 }), [])
})

// ── Conflictos y reprogramación ─────────────────────────────────────────────────────────────────────
const cita = { id: 'c1', estado: 'confirmada', sede_id: 's1', podologo_id: 'p1', cabina_id: 'k1', inicio: '2026-10-30T10:00:00-06:00', fin: '2026-10-30T10:30:00-06:00', reprogramaciones: 0 }
const otra = { id: 'c2', estado: 'confirmada', podologo_id: 'p1', cabina_id: 'k2', inicio: '2026-10-30T12:00:00-06:00', fin: '2026-10-30T12:30:00-06:00', paciente_nombre: 'A. Cruz' }
test('conflictos: mismo podólogo o misma cabina, con margen', () => {
  assert.equal(conflictosCita({ ...cita, inicio: '2026-10-30T12:30:00-06:00', fin: '2026-10-30T13:00:00-06:00' }, [otra]).length, 1)   // pegada: margen 10
  assert.equal(conflictosCita({ ...cita, inicio: '2026-10-30T12:40:00-06:00', fin: '2026-10-30T13:10:00-06:00' }, [otra]).length, 0)
  assert.equal(conflictosCita({ ...cita, podologo_id: 'p9', cabina_id: 'k2', inicio: '2026-10-30T12:10:00-06:00', fin: '2026-10-30T12:40:00-06:00' }, [otra]).length, 1)
  assert.equal(conflictosCita({ ...cita, podologo_id: 'p9', cabina_id: 'k9', inicio: '2026-10-30T12:00:00-06:00', fin: '2026-10-30T12:30:00-06:00' }, [otra]).length, 0)
})
test('reprogramar arrastrando: válido, empalme, bloqueo, festivo, pasado y estado', () => {
  const ahora = '2026-10-26T09:00:00-06:00'
  const ok = validarReprogramacion({ cita, nuevoInicio: '2026-10-30T11:00:00-06:00', citas: [otra], ahora })
  assert.equal(ok.ok, true); assert.equal(ok.cuentaReprogramacion, true); assert.equal(ok.avisos.length, 0)
  assert.equal(validarReprogramacion({ cita, nuevoInicio: '2026-10-30T12:00:00-06:00', citas: [otra], ahora }).ok, false)
  const blq = [{ ambito: 'podologo', podologo_id: 'p1', inicio: '2026-10-30T14:00:00-06:00', fin: '2026-10-30T15:00:00-06:00', estado: 'autorizado', tipo: 'comida' }]
  assert.equal(validarReprogramacion({ cita, nuevoInicio: '2026-10-30T14:00:00-06:00', bloqueos: blq, ahora }).ok, false)
  assert.equal(validarReprogramacion({ cita, nuevoInicio: '2026-10-30T14:00:00-06:00', bloqueos: [{ ...blq[0], podologo_id: 'p2' }], ahora }).ok, true)
  assert.equal(validarReprogramacion({ cita, nuevoInicio: '2026-11-02T10:00:00-06:00', festivos: [{ fecha: '2026-11-02', nombre: 'Día de Muertos', abre: false }], ahora }).ok, false)
  assert.equal(validarReprogramacion({ cita, nuevoInicio: '2026-10-25T10:00:00-06:00', ahora }).ok, false)
  assert.equal(validarReprogramacion({ cita: { ...cita, estado: 'atendida' }, nuevoInicio: '2026-10-30T11:00:00-06:00', ahora }).ok, false)
})
test('reprogramar con menos de 48 h o tras 2 veces: avisa (cuenta como cancelación)', () => {
  const ahora = '2026-10-29T09:00:00-06:00'
  const r = validarReprogramacion({ cita, nuevoInicio: '2026-10-30T11:00:00-06:00', ahora })
  assert.equal(r.ok, true); assert.equal(r.avisos.length, 1)
  const r2 = validarReprogramacion({ cita: { ...cita, reprogramaciones: 2 }, nuevoInicio: '2026-10-30T11:00:00-06:00', ahora: '2026-10-20T09:00:00-06:00' })
  assert.equal(r2.avisos.length, 1)
  assert.equal(validarReprogramacion({ cita, nuevoInicio: '2026-10-30T10:00:00-06:00', ahora }).cuentaReprogramacion, false) // mismo horario: solo cambia de recurso
})
test('transiciones de estado de la cita', () => {
  assert.deepEqual(transicionesPermitidas('por_confirmar'), ['confirmada', 'no_asistio', 'cancelada'])
  assert.ok(!transicionesPermitidas('confirmada').includes('en_camino'))
  assert.ok(transicionesPermitidas('confirmada', { tipoAtencion: 'domicilio' }).includes('en_camino'))
  assert.deepEqual(transicionesPermitidas('atendida'), [])
  assert.deepEqual(transicionesPermitidas('atendida', { esAdmin: true }), ['por_confirmar'])
})
test('lista de espera: prioridad antes que antigüedad, ventana de 30 min y vencimiento a 14 días', () => {
  const l = [
    { id: 1, prioridad: 'baja', created_at: '2026-10-01T10:00:00Z' }, { id: 2, prioridad: 'alta', created_at: '2026-10-25T10:00:00Z' },
    { id: 3, prioridad: 'alta', created_at: '2026-10-24T10:00:00Z' }, { id: 4, prioridad: 'media', created_at: '2026-10-10T10:00:00Z' },
  ]
  assert.deepEqual(ordenarListaEspera(l).map(x => x.id), [3, 2, 4, 1])
  const ahora = '2026-10-26T12:00:00Z'
  assert.equal(estadoListaEspera({ estado: 'notificado', notificado_hasta: '2026-10-26T11:30:00Z', created_at: '2026-10-25T00:00:00Z' }, ahora), 'sin_respuesta')
  assert.equal(estadoListaEspera({ estado: 'esperando', created_at: '2026-10-01T00:00:00Z' }, ahora), 'vencida')
  assert.equal(estadoListaEspera({ estado: 'esperando', created_at: '2026-10-20T00:00:00Z' }, ahora), 'esperando')
})
