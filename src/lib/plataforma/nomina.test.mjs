import test from 'node:test'
import assert from 'node:assert/strict'
import { esquemaVigente, baseComisionable, renglonComision, resumenComisiones, descuentoIncidencias, totalesPrenomina, calcularPrenomina, totalesPeriodo, quincenasDelMes, diasPeriodo, minutosRetardo } from './nomina.js'

const esq = [
  { id: 'a', vigente_desde: '2026-01-01', vigente_hasta: '2026-06-30', pct_servicio: 40, pct_producto: 10, pct_plan: 30 },
  { id: 'b', vigente_desde: '2026-07-01', vigente_hasta: null, pct_servicio: 45, pct_producto: 10, pct_plan: 30, tipo: 'porcentaje_viatico', viatico_por_cita: 50, piso_periodo: 0 },
]

test('esquema vigente a la fecha del servicio (P-108)', () => {
  assert.equal(esquemaVigente(esq, '2026-03-01').id, 'a')
  assert.equal(esquemaVigente(esq, '2026-07-01').id, 'b')
  assert.equal(esquemaVigente(esq, '2025-12-31'), null)
})

test('base comisionable: sin IVA, neto de descuentos y reembolsos (P-107)', () => {
  assert.equal(baseComisionable({ cobrado: 1160, iva: 160, descuento: 100, reembolso: 0 }), 900)
})

test('renglón de comisión usa el % del tipo; sin esquema falla (P-106)', () => {
  assert.deepEqual(renglonComision({ tipo: 'servicio', base: 500, esquema: esq[1] }), { tipo: 'servicio', base: 500, pct: 45, comision: 225 })
  assert.equal(renglonComision({ tipo: 'producto', base: 200, esquema: esq[1] }).comision, 20)
  assert.throws(() => renglonComision({ tipo: 'servicio', base: 100, esquema: null }), /Sin esquema/)
})

test('resumen de comisiones: viático por cita, ajustes y piso', () => {
  const det = [
    { tipo: 'servicio', cita_id: 'c1', base: 500, comision: 225 },
    { tipo: 'servicio', cita_id: 'c2', base: 300, comision: 135 },
    { tipo: 'producto', cita_id: 'c2', base: 200, comision: 20 },
    { tipo: 'ajuste', base: -100, comision: -45 },
  ]
  const r = resumenComisiones(det, esq[1])
  assert.equal(r.citas, 2)
  assert.equal(r.viatico, 100)
  assert.equal(r.ajustes, -45)
  assert.equal(r.comision_total, 435)
  assert.equal(r.piso_aplicado, false)
  const conPiso = resumenComisiones(det, { ...esq[1], piso_periodo: 1000 })
  assert.equal(conPiso.piso_aplicado, true)
  assert.equal(conPiso.comision_total, 1000)
})

test('descuento por incidencias: monto fijo o prorrateo por días traslapados con el periodo', () => {
  const inc = [
    { fecha: '2026-10-03', fecha_fin: '2026-10-04', descuenta: true, estado: 'registrada' },
    { fecha: '2026-10-10', descuenta: true, monto: 150, estado: 'registrada' },
    { fecha: '2026-10-12', descuenta: false },
    { fecha: '2026-10-13', descuenta: true, estado: 'anulada' },
    { fecha: '2026-10-20', descuenta: true, estado: 'registrada' },
  ]
  // quincena 1–15 = 15 días; 3000 / 15 = 200 por día → 2 días = 400, + 150
  assert.equal(descuentoIncidencias(inc, 3000, '2026-10-01', '2026-10-15'), 550)
  // incidencia que empieza antes del periodo: solo cuentan los días dentro
  assert.equal(descuentoIncidencias([{ fecha: '2026-09-29', fecha_fin: '2026-10-02', descuenta: true }], 3000, '2026-10-01', '2026-10-15'), 400)
})

test('totales de prenómina = columnas generadas de la BD', () => {
  const t = totalesPrenomina({ salario_periodo: 3000, comision: 435, bono: 200, subsidio: 0, desc_incidencias: 550, imss: 100, isr: 50, otras_deducciones: 0 })
  assert.deepEqual(t, { percepcion_total: 3635, deduccion_total: 700, neto: 2935 })
})

test('prenómina: solo comisiones cerradas dentro del periodo y no incluidas antes (CA-18)', () => {
  const p = calcularPrenomina({
    empleado: { id: 'e1', sede_id: 's1', esquema_contratacion: 'nomina', salario_periodo: 4000, bono_periodo: 300 },
    periodo: { desde: '2026-10-01', hasta: '2026-10-15' },
    diasTrabajados: 11,
    comisionesCerradas: [
      { id: 'c1', comision_total: 500, cerrado_en: '2026-10-07' },
      { id: 'c2', comision_total: 250, cerrado_en: '2026-10-16' },
      { id: 'c3', comision_total: 100, cerrado_en: '2026-10-05', prenomina_previa: true },
    ],
    incidencias: [{ fecha: '2026-10-02', descuenta: true, monto: 100 }],
  })
  assert.equal(p.comision, 500)
  assert.deepEqual(p.comisiones_ids, ['c1'])
  assert.equal(p.desc_incidencias, 100)
  assert.equal(p.neto, 4000 + 500 + 300 - 100)
})

test('totales del periodo, quincenas y retardos', () => {
  const t = totalesPeriodo([{ salario_periodo: 1000, comision: 0, bono: 0, subsidio: 0, desc_incidencias: 100, imss: 0, isr: 0, otras_deducciones: 0 }, { salario_periodo: 2000, comision: 100, bono: 0, subsidio: 0, desc_incidencias: 0, imss: 0, isr: 0, otras_deducciones: 0 }])
  assert.deepEqual(t, { empleados: 2, percepciones: 3100, deducciones: 100, neto: 3000 })
  assert.deepEqual(quincenasDelMes(2026, 2), [{ desde: '2026-02-01', hasta: '2026-02-15' }, { desde: '2026-02-16', hasta: '2026-02-28' }])
  assert.equal(diasPeriodo('2026-10-16', '2026-10-31'), 16)
  assert.equal(minutosRetardo('09:08', '09:00', 10), 0)
  assert.equal(minutosRetardo('09:25', '09:00', 10), 25)
})

import { agruparComisionables, ajustesPorCancelacion } from './nomina.js'
test('base de comisión: solo ventas validadas, agrupadas por venta+tipo, sin repetir lo registrado (P-107)', () => {
  const lineas = [
    { venta_id: 'v1', tipo: 'servicio', descripcion: 'Quiropodia', base_neta: 500, atendio_id: 'p1', fecha: '2026-10-05' },
    { venta_id: 'v1', tipo: 'servicio', descripcion: 'Uña encarnada', base_neta: 300, atendio_id: 'p1', fecha: '2026-10-05' },
    { venta_id: 'v1', tipo: 'producto', descripcion: 'Crema', base_neta: 200, atendio_id: 'p1', fecha: '2026-10-05' },
    { venta_id: 'v2', tipo: 'servicio', descripcion: 'Sin validar', base_neta: 400, atendio_id: 'p1', fecha: '2026-10-06' },
    { venta_id: 'v3', tipo: 'gift_card', base_neta: 1000, atendio_id: 'p1' },
    { venta_id: 'v4', tipo: 'servicio', base_neta: 100, atendio_id: 'p9' },
    { venta_id: 'v5', tipo: 'servicio', base_neta: 250, atendio_id: 'p1', fecha: '2026-10-07' },
    { venta_id: 'v6', tipo: 'plan', base_neta: 0, atendio_id: 'p1' },
  ]
  const r = agruparComisionables({ lineas, validadas: new Set(['v1', 'v3', 'v4', 'v5', 'v6']), registradas: new Set(['v5|servicio|e1']), empleadoPorPerfil: { p1: 'e1' } })
  assert.equal(r.incluidas.length, 2)
  const serv = r.incluidas.find(x => x.tipo === 'servicio')
  assert.equal(serv.base, 800)
  assert.equal(serv.concepto, 'Quiropodia + Uña encarnada')
  assert.equal(r.incluidas.find(x => x.tipo === 'producto').base, 200)
  assert.equal(r.excluidas.length, 5)
})

test('ajuste negativo por cancelación posterior, una sola vez, con referencia (P-108)', () => {
  const det = [{ id: 'd1', tipo: 'servicio', venta_id: 'v1', empleado_id: 'e1', base: 800, concepto: 'Quiropodia' }, { id: 'd2', tipo: 'servicio', venta_id: 'v2', empleado_id: 'e1', base: 100 }, { id: 'a1', tipo: 'ajuste', referencia_detalle_id: 'd2', venta_id: 'v2', base: -100 }]
  const aj = ajustesPorCancelacion(det, new Set(['v1', 'v2']), '2026-10-20')
  assert.equal(aj.length, 1)
  assert.equal(aj[0].base, -800)
  assert.equal(aj[0].referencia_detalle_id, 'd1')
})
