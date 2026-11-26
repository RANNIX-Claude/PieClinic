// Pruebas de la lógica de servicios (Etapa 8):  node --test src/lib/auditoria/servicios.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validarReferencia, sinDatosClinicos, validarCancelacion, claseAtencion, pctSinTicket, muestraPequena, serviciosSinCobro, cuadreInsumo, consumoReal,
  cruceOcupacion, duracionMin, horasMinutos,
} from './servicios.js'
import { puedeAuditoria, limpiarParaSucursal, CAMPOS_CIEGOS } from './roles.js'

test('referencia opaca: letras, números y guiones; un nombre o texto libre se rechaza; vacía la genera el servidor', () => {
  assert.deepEqual(validarReferencia('FICHA-0042'), { ok: true, ref: 'FICHA-0042' })
  assert.deepEqual(validarReferencia('  '), { ok: true, ref: null })
  for (const mala of ['Juan Pérez', 'ab', 'x'.repeat(41), 'tiene diabetes', 'a@b.com']) assert.equal(validarReferencia(mala).ok, false, mala)
})

test('expediente sin nota clínica: ninguna columna de atención ni ocupación es clínica o personal', () => {
  const columnas = ['id', 'organizacion_id', 'sucursal_id', 'paciente_ref', 'servicio_id', 'usuario_atiende', 'inicio_en', 'fin_en', 'estado', 'ticket_id', 'motivo_cancelacion', 'autorizado_por',
    'creado_en', 'creado_por', 'origen_tipo', 'origen_id', 'cerrada_por', 'hora_cliente', 'puesto_id', 'puesto_nombre', 'duracion_min', 'fuente']
  assert.deepEqual(sinDatosClinicos(columnas), [])
  assert.deepEqual(sinDatosClinicos([...columnas, 'nota_clinica', 'diagnostico', 'nombre_paciente']).sort(), ['diagnostico', 'nombre_paciente', 'nota_clinica'])
})

test('cancelar exige motivo y la clave de otra persona', () => {
  const ok = { motivo: 'El paciente se retiró', supervisorId: 's1', usuarioId: 'p1', pin: '4827' }
  assert.equal(validarCancelacion(ok).ok, true)
  assert.equal(validarCancelacion({ ...ok, motivo: '' }).ok, false)
  assert.equal(validarCancelacion({ ...ok, motivo: 'no' }).ok, false)
  assert.equal(validarCancelacion({ ...ok, motivo: 'x'.repeat(301) }).ok, false)
  assert.equal(validarCancelacion({ ...ok, supervisorId: null }).ok, false)
  assert.match(validarCancelacion({ ...ok, supervisorId: 'p1' }).error, /otra persona/)
  assert.equal(validarCancelacion({ ...ok, pin: '12' }).ok, false)
})

test('clase de la atención: con ticket, cancelada, vencida (más del umbral) o en curso', () => {
  const ahora = Date.parse('2026-11-26T18:00:00Z')
  const hace = min => new Date(ahora - min * 60000).toISOString()
  assert.equal(claseAtencion({ estado: 'cerrada_con_ticket', inicio_en: hace(500) }, 120, ahora), 'con_ticket')
  assert.equal(claseAtencion({ estado: 'cancelada', inicio_en: hace(500) }, 120, ahora), 'cancelada')
  assert.equal(claseAtencion({ estado: 'abierta', inicio_en: hace(121) }, 120, ahora), 'vencida')
  assert.equal(claseAtencion({ estado: 'abierta', inicio_en: hace(120) }, 120, ahora), 'en_curso', 'justo en el umbral aún no')
  assert.equal(claseAtencion({ estado: 'abierta', inicio_en: hace(10) }, 120, ahora), 'en_curso')
})

test('porcentaje sin ticket y aviso de muestra pequeña (el sistema no acusa con pocos datos)', () => {
  assert.equal(pctSinTicket({ canceladas: 1, vencidas: 3, con_ticket: 4 }), 50)
  assert.equal(pctSinTicket({ canceladas: 0, vencidas: 0, con_ticket: 0 }), null)
  assert.equal(muestraPequena(9), true); assert.equal(muestraPequena(10), false)
})

test('criterio 20: 12 kits usados y 10 tickets son dos servicios sin cobro', () => {
  const c = cuadreInsumo({ servicios: 10, consumoPorServicio: 1, real: 12, costo: 50 })
  assert.equal(c.teorico, 10); assert.equal(c.diferencia, 2); assert.equal(c.valor, 100); assert.equal(c.serviciosSinCobro, 2); assert.equal(c.estado, 'consumo_mayor')
  assert.equal(cuadreInsumo({ servicios: 10, consumoPorServicio: 1, real: 10 }).estado, 'cuadra')
  assert.equal(cuadreInsumo({ servicios: 10, consumoPorServicio: 1, real: 9 }).estado, 'consumo_menor')
  assert.equal(cuadreInsumo({ servicios: 10, consumoPorServicio: 1, real: 11, tolerancia: 1 }).estado, 'cuadra')
  // dos piezas por servicio: 24 usadas contra 20 teóricas = 2 servicios
  assert.equal(serviciosSinCobro({ real: 24, teorico: 20, servicios: 10 }), 2)
  assert.equal(serviciosSinCobro({ real: 8, teorico: 10, servicios: 10 }), 0)
  assert.equal(serviciosSinCobro({ real: 5, teorico: 0, servicios: 0 }), 0)
  assert.equal(cuadreInsumo({ servicios: 3, consumoPorServicio: 0.333, real: 1, costo: 10.1 }).valor, 0.01, 'importes a centavos, sin float suelto')
})

test('consumo real: cuenta consumo, venta, merma y ajustes; no cuenta traspasos ni devoluciones al proveedor', () => {
  const m = [{ tipo: 'consumo_consulta', cantidad: -12 }, { tipo: 'traspaso_salida', cantidad: -5 }, { tipo: 'ajuste', cantidad: -3 }, { tipo: 'compra', cantidad: 20 }, { tipo: 'devolucion_proveedor', cantidad: -1 }]
  assert.equal(consumoReal(m), 15)
  assert.equal(consumoReal(m, { incluirAjustes: false }), 12)
})

test('ocupación: 12 ocupaciones y 8 tickets son cuatro cobros faltantes con horas exactas', () => {
  const base = Date.parse('2026-11-25T14:00:00Z')   // 08:00 en la Ciudad de México
  const t = i => new Date(base + i * 3600000).toISOString()
  const ocupaciones = Array.from({ length: 12 }, (_, i) => ({ inicio: t(i), fin: new Date(base + i * 3600000 + 30 * 60000).toISOString() }))
  const tickets = Array.from({ length: 8 }, (_, i) => ({ id: `T${i}`, cobrada_en: new Date(base + i * 3600000 + 35 * 60000).toISOString() }))
  const r = cruceOcupacion(ocupaciones, tickets)
  assert.equal(r.ocupaciones, 12); assert.equal(r.tickets, 8); assert.equal(r.cobrosFaltantes, 4)
  assert.deepEqual(r.faltantes.map(f => f.inicio), [8, 9, 10, 11].map(t))
  assert.deepEqual(r.faltantes.map(f => f.duracion_min), [30, 30, 30, 30])
})

test('ocupación: la duración mínima contada es configurable y una ocupación abierta no cuenta', () => {
  const o = [{ inicio: '2026-11-25T14:00:00Z', fin: '2026-11-25T14:03:00Z' }, { inicio: '2026-11-25T15:00:00Z', fin: '2026-11-25T15:30:00Z' }, { inicio: '2026-11-25T16:00:00Z', fin: null }]
  assert.equal(cruceOcupacion(o, [], { minimoMin: 5 }).ocupaciones, 1)
  assert.equal(cruceOcupacion(o, [], { minimoMin: 5 }).menoresAlMinimo, 1)
  assert.equal(cruceOcupacion(o, [], { minimoMin: 2 }).ocupaciones, 2)
  assert.equal(cruceOcupacion(o, [], { minimoMin: 31 }).ocupaciones, 0)
  assert.equal(duracionMin('2026-11-25T14:00:00Z', '2026-11-25T14:30:00Z'), 30)
})

test('un ticket solo cubre una ocupación y se descarta si cae fuera de la ventana', () => {
  const o = [{ inicio: '2026-11-25T14:00:00Z', fin: '2026-11-25T14:30:00Z' }, { inicio: '2026-11-25T14:40:00Z', fin: '2026-11-25T15:10:00Z' }]
  assert.equal(cruceOcupacion(o, [{ id: 'A', cobrada_en: '2026-11-25T14:35:00Z' }]).cobrosFaltantes, 1)
  assert.equal(cruceOcupacion(o, [{ id: 'A', cobrada_en: '2026-11-25T18:00:00Z' }]).cobrosFaltantes, 2)
  assert.equal(cruceOcupacion(o, [{ id: 'A', cobrada_en: '2026-11-25T18:00:00Z' }], { ventanaMin: 300 }).cobrosFaltantes, 1)
})

test('roles: la sucursal captura servicios pero no ve reportes ni configura; dueño y supervisor ven; solo el dueño configura', () => {
  assert.equal(puedeAuditoria('recepcion', 'capturar'), true); assert.equal(puedeAuditoria('podologo', 'capturar'), true)
  assert.equal(puedeAuditoria('recepcion', 'ver_directo'), false); assert.equal(puedeAuditoria('podologo', 'ver_directo'), false)
  assert.equal(puedeAuditoria('supervisor', 'ver_directo'), true); assert.equal(puedeAuditoria('supervisor', 'configurar'), false)
  assert.equal(puedeAuditoria('administrador', 'configurar'), true)
})

test('lo que llega a una pantalla de sucursal no lleva campos de diferencia ni saldo', () => {
  const crudo = { id: 1, estado: 'abierta', diferencia: 2, saldo: 10, anidado: { valor_esperado: 5, ok: true } }
  const limpio = limpiarParaSucursal(crudo)
  assert.deepEqual(limpio, { id: 1, estado: 'abierta', anidado: { ok: true } })
  for (const k of CAMPOS_CIEGOS) assert.ok(!(k in limpio))
})

test('formato de minutos', () => { assert.equal(horasMinutos(45), '45 min'); assert.equal(horasMinutos(135), '2 h 15 min'); assert.equal(horasMinutos(null), '—') })
