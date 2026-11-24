// Reglas y cálculos de la pantalla de Ingresos (valores reales del esquema, migración 043).
const r2 = n => Math.round((Number(n) || 0) * 100) / 100

export const FORMAS_PAGO_BD = [
  { value: 'efectivo', label: 'Efectivo', corto: 'E' },
  { value: 'transferencia', label: 'Transferencia', corto: 'T' },
  { value: 'deposito', label: 'Depósito', corto: 'D' },
  { value: 'tarjeta', label: 'Tarjeta', corto: 'Tj' },
  { value: 'tarjeta_clip', label: 'Tarjeta (Clip)', corto: 'Clip' },
  { value: 'cheque', label: 'Cheque', corto: 'Ch' },
  { value: 'gift_card', label: 'Gift card', corto: 'GC' },
]
export const CLASIFICACIONES_BD = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'producto', label: 'Producto' },
  { value: 'anticipo', label: 'Anticipo' },
  { value: 'plan', label: 'Plan multi-sesión' },
  { value: 'mixto', label: 'Mixto' },
]
export const ESTATUS_VALIDACION = [
  { value: 'por_validar', label: 'Por validar' },
  { value: 'validado', label: 'Validado' },
  { value: 'validado_cfdi', label: 'Validado con CFDI' },
  { value: 'observado', label: 'Observado' },
]
export const etiquetaForma = v => FORMAS_PAGO_BD.find(f => f.value === v)?.label ?? v ?? '—'
export const etiquetaClasificacion = v => CLASIFICACIONES_BD.find(f => f.value === v)?.label ?? v ?? '—'

/** ¿Un cobro ya validado está congelado? (no cambia monto/fecha/forma ni se borra). */
export const ingresoCongelado = i => ['validado', 'validado_cfdi'].includes(i?.estatus_validacion)
/** El borrado solo se permite en por_validar / observado (RLS). */
export const ingresoBorrable = i => ['por_validar', 'observado'].includes(i?.estatus_validacion) && !i?.movimiento_id

/** Validación del formulario de ingreso manual → lista de errores. */
export function validarIngresoManual(f) {
  const e = []
  if (!f.sede_id) e.push('Selecciona la sede.')
  if (!f.fecha_pago) e.push('Indica la fecha de pago.')
  if (!f.forma_pago) e.push('Selecciona la forma de pago.')
  if (!(Number(f.importe) > 0)) e.push('El monto cobrado debe ser mayor a cero.')
  if (Number(f.iva) < 0 || Number(f.iva) > Number(f.importe)) e.push('El IVA no puede ser negativo ni mayor al monto.')
  if (!String(f.concepto ?? '').trim()) e.push('Escribe el concepto (un ingreso manual no está ligado a cita ni venta).')
  return e
}
/** Un ingreso observado exige observación. */
export const validarObservacion = txt => (String(txt ?? '').trim().length >= 3 ? null : 'Escribe la observación (mínimo 3 caracteres).')
/** ¿Se puede pasar a «validado_cfdi»? Solo si el cobro ya tiene factura o UUID de CFDI. */
export const puedeValidarCFDI = i => !!(i?.tiene_cfdi || i?.factura_id || i?.cfdi_uuid)
/** IVA incluido en un importe bruto (tasa en %). */
export const ivaIncluido = (importe, tasa = 16) => r2(Number(importe) - Number(importe) / (1 + tasa / 100))

/** Valida un reparto por renglón del EDR: cada importe > 0, sin renglones repetidos, suma ≤ importe del cobro. */
export function validarReparto(importeIngreso, filas) {
  const e = []
  const vistos = new Set()
  let s = 0
  for (const f of filas) {
    if (!f.renglon_id) { e.push('Elige el renglón en cada fila.'); continue }
    if (vistos.has(f.renglon_id)) e.push('Un renglón no puede repetirse.')
    vistos.add(f.renglon_id)
    if (!(Number(f.importe) > 0)) e.push('Cada importe debe ser mayor a cero.')
    s += Number(f.importe) || 0
  }
  s = r2(s)
  if (s > r2(importeIngreso) + 0.01) e.push(`El reparto (${s.toFixed(2)}) excede el cobro (${r2(importeIngreso).toFixed(2)}).`)
  return { ok: e.length === 0, errores: [...new Set(e)], suma: s, sinRepartir: r2(importeIngreso - s) }
}

/** KPIs de la pantalla. `filas` = prp_ingresos del periodo; `cuentas` = prp_cuentas_cobrar abiertas. */
export function kpisIngresos(filas, cuentas = [], descuadrados = []) {
  const neto = f => Number(f.importe_neto) || 0
  const sum = arr => r2(arr.reduce((s, f) => s + neto(f), 0))
  const porClas = c => filas.filter(f => f.clasificacion === c)
  const porValidar = filas.filter(f => f.estatus_validacion === 'por_validar')
  const conCFDI = filas.filter(f => f.tiene_cfdi)
  const abiertas = cuentas.filter(c => !['cobrada', 'cancelada'].includes(c.estado))
  return {
    registros: filas.length,
    total: sum(filas),
    servicios: sum(porClas('servicio')),
    productos: sum(porClas('producto')),
    anticiposPlanes: r2(sum(porClas('anticipo')) + sum(porClas('plan'))),
    mixtos: sum(porClas('mixto')),
    porValidar: { n: porValidar.length, importe: sum(porValidar) },
    observados: { n: filas.filter(f => f.estatus_validacion === 'observado').length, importe: sum(filas.filter(f => f.estatus_validacion === 'observado')) },
    conCFDI: { n: conCFDI.length, pct: filas.length ? Math.round((conCFDI.length / filas.length) * 100) : 0 },
    porCobrar: { n: abiertas.length, importe: r2(abiertas.reduce((s, c) => s + (Number(c.saldo) || 0), 0)) },
    descuadrados: descuadrados.length,
  }
}
