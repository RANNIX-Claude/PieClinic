// Lógica pura de comisiones y prenómina. Refleja las RPC de 052 (app.comisiones_recalcular, nomina_calcular_periodo).
// P-104 sin timbrado; P-106 sin % por defecto; P-107 base = cobrado sin IVA neto; P-108 esquema vigente a la fecha del servicio.
const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const r2 = v => Math.round((n(v) + Number.EPSILON) * 100) / 100

/** Esquema vigente a una fecha (YYYY-MM-DD): el de mayor vigente_desde que cubra la fecha. */
export function esquemaVigente(esquemas = [], fecha) {
  return esquemas
    .filter(e => e.activo !== false && e.vigente_desde <= fecha && (!e.vigente_hasta || e.vigente_hasta >= fecha))
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0] ?? null
}

/** Base comisionable: cobrado sin IVA, neto de descuentos y reembolsos (P-107). */
export function baseComisionable({ cobrado, iva = 0, descuento = 0, reembolso = 0 }) {
  return r2(n(cobrado) - n(iva) - n(descuento) - n(reembolso))
}

/** Renglón de comisión con el % del esquema; sin esquema → error (no hay % por defecto, P-106). */
export function renglonComision({ tipo, base, esquema, pctOverride }) {
  if (!esquema && pctOverride == null) throw new Error('Sin esquema de comisión vigente a la fecha del servicio')
  const pct = pctOverride ?? ({ servicio: esquema.pct_servicio, producto: esquema.pct_producto, plan: esquema.pct_plan }[tipo] ?? esquema.pct_servicio)
  return { tipo, base: r2(base), pct: n(pct), comision: r2(n(base) * n(pct) / 100) }
}

/** Resumen de un empleado en un periodo a partir de sus renglones de detalle (misma lógica que app.comisiones_recalcular). */
export function resumenComisiones(detalle = [], esquema = null) {
  const suma = (tipo, campo) => detalle.filter(d => d.tipo === tipo).reduce((s, d) => s + n(d[campo]), 0)
  const citas = new Set(detalle.filter(d => d.tipo !== 'ajuste' && d.cita_id).map(d => d.cita_id)).size
  const base = detalle.filter(d => d.tipo !== 'ajuste').reduce((s, d) => s + n(d.base), 0)
  const viatico = esquema?.tipo === 'porcentaje_viatico' ? n(esquema.viatico_por_cita) * citas : 0
  const bruta = suma('servicio', 'comision') + suma('producto', 'comision') + suma('plan', 'comision') + suma('ajuste', 'comision') + viatico
  const piso = n(esquema?.piso_periodo)
  const pisoAplicado = piso > bruta
  return {
    citas, base_comisionable: r2(base),
    comision_servicios: r2(suma('servicio', 'comision')), comision_productos: r2(suma('producto', 'comision')),
    comision_planes: r2(suma('plan', 'comision')), ajustes: r2(suma('ajuste', 'comision')),
    viatico: r2(viatico), piso_aplicado: pisoAplicado, comision_total: r2(pisoAplicado ? piso : bruta),
  }
}

/** Días naturales del periodo (inclusive). */
export const diasPeriodo = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1

/** Descuento por incidencias: monto fijo o prorrateo del salario del periodo por días traslapados con el periodo. */
export function descuentoIncidencias(incidencias = [], salarioPeriodo, desde, hasta) {
  const dias = diasPeriodo(desde, hasta)
  let total = 0
  for (const i of incidencias) {
    if (!i.descuenta || i.estado === 'anulada') continue
    const fin = i.fecha_fin ?? i.fecha
    if (i.fecha > hasta || fin < desde) continue
    if (i.monto != null) { total += n(i.monto); continue }
    const ini = i.fecha > desde ? i.fecha : desde, f = fin < hasta ? fin : hasta
    total += n(salarioPeriodo) / dias * diasPeriodo(ini, f)
  }
  return r2(total)
}

/** Totales de un renglón de prenómina (columnas generadas de la BD). */
export function totalesPrenomina(p) {
  const percepcion = n(p.salario_periodo) + n(p.comision) + n(p.bono) + n(p.subsidio)
  const deduccion = n(p.desc_incidencias) + n(p.imss) + n(p.isr) + n(p.otras_deducciones)
  return { percepcion_total: r2(percepcion), deduccion_total: r2(deduccion), neto: r2(percepcion - deduccion) }
}

/**
 * Prenómina de un empleado para un periodo.
 * comisionesCerradas: [{id, comision_total, cerrado_en(YYYY-MM-DD, zona de la clínica), prenomina_previa?}]
 * Solo entran las comisiones de periodos CERRADOS cuya fecha de cierre cae en el periodo y que no estén ya en otra prenómina (CA-18).
 */
export function calcularPrenomina({ empleado, periodo, diasTrabajados = 0, comisionesCerradas = [], incidencias = [] }) {
  const coms = comisionesCerradas.filter(c => !c.prenomina_previa && c.cerrado_en >= periodo.desde && c.cerrado_en <= periodo.hasta)
  const renglon = {
    empleado_id: empleado.id, sede_id: empleado.sede_id, esquema_contratacion: empleado.esquema_contratacion,
    dias_trabajados: diasTrabajados, salario_periodo: n(empleado.salario_periodo),
    comision: r2(coms.reduce((s, c) => s + n(c.comision_total), 0)), comisiones_ids: coms.map(c => c.id),
    bono: n(empleado.bono_periodo), subsidio: 0,
    desc_incidencias: descuentoIncidencias(incidencias, empleado.salario_periodo, periodo.desde, periodo.hasta),
    imss: 0, isr: 0, otras_deducciones: 0,
  }
  return { ...renglon, ...totalesPrenomina(renglon) }
}

/** Totales del periodo de nómina. */
export function totalesPeriodo(renglones = []) {
  const t = renglones.map(totalesPrenomina)
  return {
    empleados: renglones.length,
    percepciones: r2(t.reduce((s, x) => s + x.percepcion_total, 0)),
    deducciones: r2(t.reduce((s, x) => s + x.deduccion_total, 0)),
    neto: r2(t.reduce((s, x) => s + x.neto, 0)),
  }
}

/** Periodos quincenales (1–15 y 16–fin de mes) de un mes (mes 1-12). */
export function quincenasDelMes(anio, mes) {
  const p = x => String(x).padStart(2, '0')
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return [
    { desde: `${anio}-${p(mes)}-01`, hasta: `${anio}-${p(mes)}-15` },
    { desde: `${anio}-${p(mes)}-16`, hasta: `${anio}-${p(mes)}-${p(ultimo)}` },
  ]
}

/** Minutos de retardo de una checada contra el horario (0 si está dentro de la tolerancia). */
export function minutosRetardo(horaEntrada, horaProgramada, toleranciaMin = 10) {
  const m = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b }
  const d = m(horaEntrada) - m(horaProgramada)
  return d > toleranciaMin ? d : 0
}

const TIPO_COMISION = { servicio: 'servicio', producto: 'producto', plan: 'plan' }

/**
 * Base de comisión a partir de las líneas de venta (P-107): solo ventas cobradas con ingreso VALIDADO (P-090), sin lo ya registrado.
 * Agrupa por venta + podólogo + tipo (una sola fila de detalle) y suma `base_neta` (cobrado sin IVA, neto de descuentos).
 * lineas: [{ venta_id, tipo, descripcion, base_neta, atendio_id, cita_id, sede_id, fecha }]  (fecha YYYY-MM-DD local de cobro)
 * validadas: Set de venta_id con ingreso validado · registradas: Set de `${venta_id}|${tipo}|${empleado_id}` ya en comision_detalle
 * empleadoPorPerfil: { perfil_id: empleado_id }
 * @returns {{ incluidas: object[], excluidas: {venta_id, motivo}[] }}
 */
export function agruparComisionables({ lineas = [], validadas = new Set(), registradas = new Set(), empleadoPorPerfil = {} }) {
  const grupos = new Map(), excluidas = []
  for (const l of lineas) {
    const emp = empleadoPorPerfil[l.atendio_id]
    const tipo = TIPO_COMISION[l.tipo]
    if (!emp) { excluidas.push({ venta_id: l.venta_id, motivo: 'La línea no tiene un podólogo con empleado ligado' }); continue }
    if (!tipo) { excluidas.push({ venta_id: l.venta_id, motivo: `Las líneas de tipo «${l.tipo}» no comisionan` }); continue }
    if (!validadas.has(l.venta_id)) { excluidas.push({ venta_id: l.venta_id, motivo: 'Ingreso aún no validado (P-090)' }); continue }
    if (!(n(l.base_neta) > 0)) { excluidas.push({ venta_id: l.venta_id, motivo: 'Base cero (cortesía o sesión de plan sin cobro)' }); continue }
    const k = `${l.venta_id}|${tipo}|${emp}`
    if (registradas.has(k)) { excluidas.push({ venta_id: l.venta_id, motivo: 'Ya registrada en un periodo' }); continue }
    const g = grupos.get(k) ?? { empleado_id: emp, venta_id: l.venta_id, cita_id: l.cita_id ?? null, sede_id: l.sede_id ?? null, fecha: l.fecha, tipo, base: 0, conceptos: [] }
    g.base = r2(g.base + n(l.base_neta))
    if (l.descripcion) g.conceptos.push(l.descripcion)
    grupos.set(k, g)
  }
  const incluidas = [...grupos.values()].map(({ conceptos, ...g }) => ({ ...g, concepto: [...new Set(conceptos)].join(' + ') || null }))
  return { incluidas, excluidas }
}

/** Ajustes por ventas canceladas después de comisionar (P-108): una fila negativa por cada detalle original cuya venta se canceló. */
export function ajustesPorCancelacion(detalle = [], ventasCanceladas = new Set(), fecha) {
  const yaAjustados = new Set(detalle.filter(d => d.tipo === 'ajuste' && d.referencia_detalle_id).map(d => d.referencia_detalle_id))
  return detalle
    .filter(d => d.tipo !== 'ajuste' && d.venta_id && ventasCanceladas.has(d.venta_id) && !yaAjustados.has(d.id))
    .map(d => ({ empleado_id: d.empleado_id, fecha, tipo: 'ajuste', base: -Math.abs(n(d.base)), concepto: `Cancelación de venta (${d.concepto ?? d.tipo})`, venta_id: d.venta_id, sede_id: d.sede_id ?? null, referencia_detalle_id: d.id }))
}
