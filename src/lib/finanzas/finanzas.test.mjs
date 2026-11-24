import test from 'node:test'
import assert from 'node:assert/strict'
import { semanaCorte, semanasDelMes, estadoSemana, enPeriodoCerrado, inicioSemana } from './semana.js'
import { validarAplicaciones, autoDistribuir, estadoCuentaCobrar, clasificarIngreso, antiguedadCobrar } from './aplicaciones.js'
import { armarEDR, sinProyecciones, cambiosProyeccion, puedeProyectar, realImporte, semaforoVariacion } from './edr.js'
import { requiereComprobante, cuadreTicket, validarGasto, usoFondo, diferenciaCierreFondo, desglosarIVA } from './gastos.js'
import { agruparSuma, conParticipacion, variacionPeriodo, ocupacionPct, margenPct, topN, serieTemporal } from './kpis.js'
import { parsearCSV, parsearMonto, parsearFecha, aplicarMapeo, sugerirCoincidencias } from './conciliacion.js'

test('semana sábado→viernes', () => {
  // 2026-10-24 es sábado, 2026-10-30 viernes
  assert.deepEqual(semanaCorte('2026-10-24'), { inicio: '2026-10-24', fin: '2026-10-30', etiqueta: semanaCorte('2026-10-30').etiqueta })
  assert.equal(inicioSemana('2026-10-30'), '2026-10-24') // viernes
  assert.equal(inicioSemana('2026-10-31'), '2026-10-31') // sábado abre semana nueva
  assert.equal(inicioSemana('2026-10-26'), '2026-10-24') // lunes
  assert.equal(semanaCorte('2026-10-26').fin, '2026-10-30')
  const sem = semanasDelMes(2026, 10)
  assert.equal(sem[0].inicio, '2026-09-26'); assert.equal(sem.at(-1).inicio, '2026-10-31')
})
test('estado de semana y periodos cerrados', () => {
  const s = semanaCorte('2026-10-17')
  assert.equal(estadoSemana(s, '2026-10-25'), 'por_cerrar')
  assert.equal(estadoSemana(s, '2026-10-25', [{ tipo: 'semana', fecha_inicio: s.inicio, estado: 'cerrado' }]), 'cerrada')
  assert.equal(estadoSemana(s, '2026-10-25', [{ tipo: 'semana', fecha_inicio: s.inicio, estado: 'reabierto' }]), 'por_cerrar')
  assert.equal(estadoSemana(s, '2026-10-20'), 'en_curso')
  assert.equal(estadoSemana(s, '2026-10-01'), 'futura')
  assert.ok(enPeriodoCerrado('2026-10-19', [{ tipo: 'semana', fecha_inicio: '2026-10-17', estado: 'cerrado' }]))
  assert.ok(!enPeriodoCerrado('2026-10-24', [{ tipo: 'semana', fecha_inicio: '2026-10-17', estado: 'cerrado' }]))
})
test('aplicaciones de pago no exceden', () => {
  const ing = { importe: 1000 }
  const ctas = { a: { importe: 800, cobrado: 0 }, b: { importe: 500, cobrado: 400 } }
  assert.ok(validarAplicaciones(ing, [{ cuenta_id: 'a', importe_aplicado: 800 }, { cuenta_id: 'b', importe_aplicado: 100 }], ctas).ok)
  const mal = validarAplicaciones(ing, [{ cuenta_id: 'a', importe_aplicado: 800 }, { cuenta_id: 'b', importe_aplicado: 300 }], ctas)
  assert.ok(!mal.ok); assert.equal(mal.errores.length, 2) // excede ingreso y saldo de b
  assert.ok(validarAplicaciones(ing, [{ cuenta_id: 'a', importe_aplicado: 1000.01 }], { a: { importe: 2000, cobrado: 0 } }).ok) // 1 centavo de tolerancia
  assert.ok(!validarAplicaciones(ing, [{ cuenta_id: 'a', importe_aplicado: 1000.02 }], { a: { importe: 2000, cobrado: 0 } }).ok)
  assert.ok(!validarAplicaciones({ importe: 10, es_reembolso: true }, [], {}).ok)
  assert.ok(!validarAplicaciones({ importe: 100, paciente_id: 1 }, [{ cuenta_id: 'a', importe_aplicado: 10 }], { a: { importe: 50, paciente_id: 2 } }).ok)
  const d = autoDistribuir(1000, [{ id: 'a', importe: 800, cobrado: 0 }, { id: 'b', importe: 500, cobrado: 400 }])
  assert.deepEqual(d.aplicaciones, [{ cuenta_id: 'a', importe_aplicado: 800 }, { cuenta_id: 'b', importe_aplicado: 100 }]); assert.equal(d.sobrante, 100)
  assert.equal(estadoCuentaCobrar(100, 100), 'cobrada'); assert.equal(estadoCuentaCobrar(100, 99.995), 'cobrada')
  assert.equal(estadoCuentaCobrar(100, 40), 'parcial'); assert.equal(estadoCuentaCobrar(100, 0), 'pendiente'); assert.equal(estadoCuentaCobrar(100, 0, true), 'cancelada')
  assert.equal(clasificarIngreso(['cita', 'venta']), 'mixto'); assert.equal(clasificarIngreso(['cita', 'cita']), 'cita')
  assert.equal(clasificarIngreso(['cita'], { manual: true, actual: 'otro' }), 'otro')
  assert.equal(antiguedadCobrar(7), 'reciente'); assert.equal(antiguedadCobrar(8), 'pendiente'); assert.equal(antiguedadCobrar(31), 'en_mora')
})
test('EDR: proy_ manual, real_ automático', () => {
  assert.ok(puedeProyectar('administrador')); assert.ok(!puedeProyectar('recepcion')); assert.ok(!puedeProyectar('podologo'))
  assert.deepEqual(sinProyecciones({ proy_importe: 5, real_auto: 7 }), { real_auto: 7 })
  assert.ok(!cambiosProyeccion({ rol: 'recepcion', estadoPeriodo: 'en_elaboracion', renglones: [] }).ok)
  assert.ok(!cambiosProyeccion({ rol: 'administrador', estadoPeriodo: 'cerrado', renglones: [] }).ok)
  assert.deepEqual(cambiosProyeccion({ rol: 'administrador', estadoPeriodo: 'en_elaboracion', renglones: [{ clave: 'x', proy_importe: '10.005' }] }).lineas, [{ renglon: 'x', proy_importe: 10.01 }])
  assert.equal(realImporte({ real_auto: 100, real_ajustes: -15 }), 85)
  const e = armarEDR([
    { renglon_tipo: 'ingreso', orden: 1, proy_importe: 1000, real_importe: 1200 },
    { renglon_tipo: 'gasto', orden: 2, proy_importe: 300, real_importe: 250 },
    { renglon_tipo: 'fijo', orden: 3, proy_importe: 200, real_importe: 200 },
    { renglon_tipo: 'memo', orden: 4, proy_importe: 160, real_importe: 190 },
  ])
  assert.equal(e.utilidad.proy, 500); assert.equal(e.utilidad.real, 750); assert.equal(e.utilidad.var, 250); assert.equal(e.utilidad.pct, 50)
  assert.equal(e.margenPct, 62.5) // memo (IVA) no entra
  assert.equal(semaforoVariacion('ingreso', 700, 1000), 'r'); assert.equal(semaforoVariacion('gasto', 1200, 1000), 'r')
  assert.equal(semaforoVariacion('gasto', 900, 1000), 'v'); assert.equal(semaforoVariacion('ingreso', 950, 1000), 'a')
})
test('gastos: comprobante desde $2,000, ticket y fondo', () => {
  assert.ok(!requiereComprobante(1999.99)); assert.ok(requiereComprobante(2000)); assert.ok(requiereComprobante(2500, 2500)); assert.ok(!requiereComprobante(2499, 2500))
  assert.ok(cuadreTicket([{ importe: 60 }, { cantidad: 2, precio_unitario: 20 }], 100).cuadra)
  assert.ok(!cuadreTicket([{ importe: 60 }], 100).cuadra)
  const base = { fecha: '2026-10-01', total: 2000, sede_id: 's', grupo_id: 'g', proveedor_nombre: 'X' }
  assert.equal(validarGasto(base).length, 1)
  assert.equal(validarGasto({ ...base, factura_url: 'ruta' }).length, 0)
  assert.equal(validarGasto({ ...base, total: 100 }).length, 0)
  assert.ok(validarGasto({ ...base, total: 100, origen: 'fondo' }).length >= 1)
  assert.deepEqual(desglosarIVA(116), { subtotal: 100, iva: 16, total: 116 })
  assert.ok(usoFondo(1000, 800).alerta); assert.ok(!usoFondo(1000, 799).alerta); assert.ok(usoFondo(1000, 1000).agotado)
  assert.ok(!diferenciaCierreFondo(1000, 400, 650).requiereAdmin) // esperado 600, dif 50 = tolerancia
  assert.ok(diferenciaCierreFondo(1000, 400, 549).requiereAdmin)
})
test('KPIs', () => {
  const g = agruparSuma([{ s: 'a', importe: 10 }, { s: 'b', importe: 30 }, { s: 'a', importe: 25 }], 's')
  assert.deepEqual(g.map(x => [x.clave, x.total, x.n]), [['a', 35, 2], ['b', 30, 1]])
  assert.equal(conParticipacion(g)[0].pct, 53.8)
  assert.equal(variacionPeriodo(120, 100), 20); assert.equal(variacionPeriodo(5, 0), null)
  assert.equal(ocupacionPct(8, 10), 80); assert.equal(ocupacionPct(1, 0), null); assert.equal(ocupacionPct(12, 10), 100)
  assert.equal(margenPct(1000, 750), 25); assert.equal(margenPct(0, 5), null)
  assert.equal(topN(agruparSuma([1, 2, 3, 4].map(i => ({ k: i, importe: i })), 'k'), 2).at(-1).total, 3)
  assert.deepEqual(serieTemporal([{ f: '2026-10-01T10:00', v: 5 }, { f: '2026-10-01', v: 5 }, { f: '2026-10-02', v: 1 }], 'f', 'v'), [{ fecha: '2026-10-01', valor: 10 }, { fecha: '2026-10-02', valor: 1 }])
})
test('conciliación: CSV, mapeo y tolerancia de fechas', () => {
  assert.equal(parsearMonto('$1,234.50'), 1234.5); assert.equal(parsearMonto('(500.00)'), -500); assert.equal(parsearMonto('-20'), -20); assert.equal(parsearMonto('abc'), null)
  assert.equal(parsearFecha('23/10/2026', 'DD/MM/YYYY'), '2026-10-23'); assert.equal(parsearFecha('31/02/2026', 'DD/MM/YYYY'), null)
  const csv = parsearCSV('Fecha;Concepto;Abono;Cargo;Ref\n23/10/2026;SPEI;650,00;;88204\n')
  assert.equal(csv.separador, ';')
  const r = aplicarMapeo(parsearCSV('fecha,descripcion,monto,referencia\n2026-10-23,"SPEI, Pérez",650.00,88204\n2026-10-24,x,0,\nmala,x,5,'), { fecha: 'fecha', descripcion: 'descripcion', monto: 'monto', referencia: 'referencia', formato_fecha: 'YYYY-MM-DD' })
  assert.equal(r.filas.length, 1); assert.equal(r.filas[0].descripcion, 'SPEI, Pérez'); assert.equal(r.errores.length, 2)
  const cobros = [{ id: 1, importe: 1500, fecha: '2026-10-20' }, { id: 2, importe: 1500, fecha: '2026-10-22' }, { id: 3, importe: 650, fecha: '2026-10-10' }]
  assert.equal(sugerirCoincidencias({ monto: 1500, fecha: '2026-10-22' }, cobros).estado, 'ambiguo')
  assert.equal(sugerirCoincidencias({ monto: 1500, fecha: '2026-10-24' }, [cobros[1]]).estado, 'sugerido') // 2 días
  assert.equal(sugerirCoincidencias({ monto: 1500, fecha: '2026-10-26' }, [cobros[1]]).estado, 'detectado') // 4 días > 3
  assert.equal(sugerirCoincidencias({ monto: 650, fecha: '2026-10-30', referencia: 'R1' }, [{ id: 9, importe: 650, fecha: '2026-10-11', referencia: 'r1' }]).regla, 'referencia')
})
