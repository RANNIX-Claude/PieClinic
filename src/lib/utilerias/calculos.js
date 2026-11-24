// Catálogo de cálculos del sistema de Pie Firme (clon adaptado de «Cálculos del Sistema» de IRP).
// Cada entrada documenta la fórmula, de dónde sale cada número, los parámetros vigentes de la clínica y un probador con entradas manuales.
// El probador usa las MISMAS funciones puras que la aplicación (lib/finanzas, lib/comercial, lib/plataforma): no es una copia de la fórmula.
// `casos` son verificaciones de referencia (entrada → salida esperada, tomadas de REGLAS_NEGOCIO): la pantalla las corre en vivo y marca ✔/✘.
import { semanaCorte, sumarDias, ultimoDiaMes } from '../finanzas/semana.js'
import { PARAMETROS_DEFAULT, TOLERANCIA_CORTE_CAJA } from '../finanzas/constantes.js'
import { ivaIncluido } from '../finanzas/ingresos.js'
import { desglosarIVA, requiereComprobante, usoFondo, diferenciaCierreFondo } from '../finanzas/gastos.js'
import { variacion, variacionPct, semaforoVariacion } from '../finanzas/edr.js'
import { calcularLinea, requierePin, totalesVenta } from '../comercial/ventas.js'
import { desglosarIva } from '../comercial/fiscal.js'
import { anticipoServicio, evaluarCancelacion, resultadoAnticipoCancelacion, puedeReprogramar } from '../comercial/anticipo.js'
import { efectivoEsperado, evaluarCierre } from '../comercial/corte.js'
import { baseComisionable, renglonComision } from '../plataforma/nomina.js'
import { diasDerechoAnio, aniosServicioEnAnio, primaVacacional, diasSolicitados } from '../plataforma/vacaciones.js'
import { costoPromedio, variacionCosto, requiereAutorizacion } from '../plataforma/compras.js'

/** Lee un parámetro de la clínica por ruta con puntos ('iva.tasa_general'); si no existe, devuelve `defecto`. */
export function leerParametro(parametros, ruta, defecto = null) {
  let v = parametros
  for (const k of ruta.split('.')) { if (v == null || typeof v !== 'object') return defecto; v = v[k] }
  return v == null || v === '' ? defecto : v
}
const num = (parametros, ruta, defecto) => { const v = Number(leerParametro(parametros, ruta, defecto)); return Number.isFinite(v) ? v : defecto }
const DIAS_SEMANA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6 }
/** Día de inicio de la semana de corte (0 = domingo … 6 = sábado). Por defecto sábado (P-088). */
export const diaInicioSemana = parametros => DIAS_SEMANA[String(leerParametro(parametros, 'semana_corte.inicio', 'sabado')).toLowerCase()] ?? 6

/** Parámetros vigentes (con su valor por defecto) que usa cada cálculo. */
export function parametrosVigentes(parametros = {}) {
  const p = parametros ?? {}
  return {
    semana_inicio: { label: 'Inicio de la semana de corte', valor: String(leerParametro(p, 'semana_corte.inicio', 'sabado')), defecto: 'sabado' },
    iva_general: { label: 'Tasa general de IVA (%)', valor: num(p, 'iva.tasa_general', 16), defecto: 16 },
    iva_servicios: { label: 'IVA de servicios clínicos (%)', valor: num(p, 'iva.servicios_clinicos', 0), defecto: 0 },
    iva_productos: { label: 'IVA de productos (%)', valor: num(p, 'iva.productos', 16), defecto: 16 },
    descuento_max: { label: 'Descuento máximo de Recepción sin PIN (%)', valor: num(p, 'descuento_recepcion_pct_max', 10), defecto: 10 },
    anticipo_pct: { label: 'Anticipo del portal (%)', valor: num(p, 'anticipo_pct', 30), defecto: 30 },
    cancelacion_horas: { label: 'Horas de aviso para cancelar/reprogramar', valor: num(p, 'cancelacion_horas_aviso', 48), defecto: 48 },
    reprogramaciones: { label: 'Reprogramaciones sin costo', valor: num(p, 'reprogramaciones_sin_costo', 2), defecto: 2 },
    vacaciones_primer_anio: { label: 'Días de vacaciones del primer año', valor: num(p, 'vacaciones_dias_primer_anio', 12), defecto: 12 },
    corte_tolerancia: { label: 'Tolerancia del corte de caja ($)', valor: num(p, 'corte_caja_tolerancia', TOLERANCIA_CORTE_CAJA), defecto: TOLERANCIA_CORTE_CAJA },
    compra_autorizacion: { label: 'Compra que exige autorización desde ($)', valor: num(p, 'compra_autorizacion_monto', PARAMETROS_DEFAULT.compra_autorizacion_desde), defecto: PARAMETROS_DEFAULT.compra_autorizacion_desde },
    comprobante_gasto: { label: 'Gasto que exige comprobante fiscal desde ($)', valor: num(p, 'gasto_comprobante_fiscal_desde', PARAMETROS_DEFAULT.comprobante_gasto_desde), defecto: PARAMETROS_DEFAULT.comprobante_gasto_desde },
    fondo_alerta: { label: 'Alerta del fondo revolvente (% usado)', valor: num(p, 'fondo_alerta_pct', PARAMETROS_DEFAULT.fondo_alerta_pct), defecto: PARAMETROS_DEFAULT.fondo_alerta_pct },
    edr_umbral: { label: 'Umbral de variación del EDR (%)', valor: 10, defecto: 10 },
  }
}

const hoy = () => new Date().toISOString().slice(0, 10)
const sn = v => v === true || v === 'true' || v === 'on'
const R = (label, valor, fmt = 'texto') => ({ label, valor, fmt })

export const GRUPOS_CALCULO = ['Fechas y semanas', 'IVA y ventas', 'Citas y anticipos', 'Caja y gastos', 'Estado de resultados', 'Equipo', 'Inventario y compras']

/**
 * campos: [{ k, label, tipo: 'number'|'text'|'date'|'select'|'check', def, opciones?, paso? }]
 * calcular(valores, P) → [{ label, valor, fmt }]   (P = parametrosVigentes)
 * casos: [{ nombre, entrada, esperado: { etiqueta: valor } }]  → verifican con tolerancia de 0.005
 */
export const CALCULOS = [
  {
    id: 'semana', grupo: 'Fechas y semanas', titulo: 'Semana de corte sábado → viernes', regla: 'P-088',
    formula: 'inicio = fecha − ((díaSemana(fecha) − díaInicio + 7) mod 7) · fin = inicio + 6 · etiqueta = S{⌊(inicio − primer inicio del año) / 7⌋ + 1}',
    descripcion: 'Todo el sistema (Resumen semanal, fondo revolvente, cierres, comisiones) corta la semana de sábado a viernes. La etiqueta Sxx cuenta desde la primera semana que contiene el 1 de enero.',
    origen: 'Se calcula · espejo de app.c_semana_inicio / c_semana_etiqueta',
    parametros: ['semana_inicio'],
    campos: [{ k: 'fecha', label: 'Fecha', tipo: 'date', def: '2026-10-26' }],
    calcular: (v, P) => {
      const dow = DIAS_SEMANA[String(P.semana_inicio.valor).toLowerCase()] ?? 6
      const s = semanaCorte(v.fecha, dow)
      return [R('Inicio de la semana', s.inicio, 'fecha'), R('Fin de la semana', s.fin, 'fecha'), R('Etiqueta', s.etiqueta), R('Último día del mes', ultimoDiaMes(Number(v.fecha.slice(0, 4)), Number(v.fecha.slice(5, 7))), 'fecha'), R('Mismo día de la semana siguiente', sumarDias(v.fecha, 7), 'fecha')]
    },
    casos: [
      { nombre: 'Lunes 2026-10-26 cae en la semana que inicia el sábado 2026-10-24', entrada: { fecha: '2026-10-26' }, esperado: { 'Inicio de la semana': '2026-10-24', 'Fin de la semana': '2026-10-30' } },
      { nombre: 'Un sábado abre su propia semana', entrada: { fecha: '2026-10-24' }, esperado: { 'Inicio de la semana': '2026-10-24' } },
      { nombre: 'Un viernes cierra la semana que inició seis días antes', entrada: { fecha: '2026-10-30' }, esperado: { 'Inicio de la semana': '2026-10-24', 'Fin de la semana': '2026-10-30' } },
    ],
  },
  {
    id: 'iva', grupo: 'IVA y ventas', titulo: 'IVA incluido: exento / 16 % / tasa 0', regla: 'P-056, P-057',
    formula: 'exento y tasa 0: base = total, IVA = 0 · 16 %: base = total / 1.16, IVA = total − base (redondeo comercial a 2 decimales)',
    descripcion: 'Los precios se capturan con IVA incluido. Los servicios clínicos van exentos; los productos, al 16 %. Ticket y CFDI deben dar el mismo total.',
    origen: 'Se calcula · espejo de venta_linea_bi y fiscal.desglosarIva',
    parametros: ['iva_general', 'iva_servicios', 'iva_productos'],
    campos: [{ k: 'total', label: 'Precio con IVA incluido', tipo: 'number', def: 1160, paso: 0.01 }, { k: 'tipo', label: 'Tipo de IVA', tipo: 'select', def: '16', opciones: [['exento', 'Exento'], ['16', '16 %'], ['tasa0', 'Tasa 0 %']] }],
    calcular: (v, P) => {
      const d = desglosarIva(Number(v.total), v.tipo)
      return [R('Base (sin IVA)', d.base, 'moneda'), R('IVA', d.iva, 'moneda'), R('Total', d.total, 'moneda'), R(`IVA incluido a tasa general (${P.iva_general.valor} %)`, ivaIncluido(Number(v.total), P.iva_general.valor), 'moneda'), R('Desglose de gastos (base / IVA)', `${desglosarIVA(Number(v.total), P.iva_general.valor).subtotal} / ${desglosarIVA(Number(v.total), P.iva_general.valor).iva}`)]
    },
    casos: [
      { nombre: '$1,160 al 16 % → base 1,000 e IVA 160', entrada: { total: 1160, tipo: '16' }, esperado: { 'Base (sin IVA)': 1000, IVA: 160 } },
      { nombre: 'Servicio exento: el IVA es 0', entrada: { total: 800, tipo: 'exento' }, esperado: { 'Base (sin IVA)': 800, IVA: 0 } },
    ],
  },
  {
    id: 'linea', grupo: 'IVA y ventas', titulo: 'Línea de ticket, descuento y PIN', regla: 'P-055, P-056',
    formula: 'bruto = cantidad × precio · descuento = bruto × %desc + monto (tope: el bruto) · importe = bruto − descuento · requiere PIN si %efectivo > máximo de Recepción y quien cobra no es Administrador',
    descripcion: 'Recepción puede dar hasta el porcentaje máximo sin PIN; por encima exige PIN de Administrador. Todo descuento exige motivo. El podólogo no aplica descuentos.',
    origen: 'Se calcula · espejo de app.venta_linea_bi / venta_recalcular',
    parametros: ['descuento_max', 'iva_general'],
    campos: [{ k: 'cantidad', label: 'Cantidad', tipo: 'number', def: 2 }, { k: 'precio', label: 'Precio unitario', tipo: 'number', def: 580, paso: 0.01 },
      { k: 'pct', label: 'Descuento %', tipo: 'number', def: 15 }, { k: 'monto', label: 'Descuento en $', tipo: 'number', def: 0, paso: 0.01 },
      { k: 'iva', label: 'IVA', tipo: 'select', def: '16', opciones: [['exento', 'Exento'], ['16', '16 %'], ['tasa0', 'Tasa 0 %']] }, { k: 'admin', label: 'Cobra un Administrador', tipo: 'check', def: false }],
    calcular: (v, P) => {
      const l = calcularLinea({ cantidad: Number(v.cantidad), precio_unitario: Number(v.precio), descuento_pct: Number(v.pct), descuento_monto: Number(v.monto), iva_tipo: v.iva })
      const pct = l.importe_bruto > 0 ? (l.descuento / l.importe_bruto) * 100 : 0
      const t = totalesVenta([{ cantidad: Number(v.cantidad), precio_unitario: Number(v.precio), descuento_pct: Number(v.pct), descuento_monto: Number(v.monto), iva_tipo: v.iva }])
      return [R('Importe bruto', l.importe_bruto, 'moneda'), R('Descuento', l.descuento, 'moneda'), R('% efectivo de descuento', pct, 'pct'), R('Importe', l.importe, 'moneda'), R('Base neta', l.base_neta, 'moneda'), R('IVA', l.iva_monto, 'moneda'), R('Total del ticket', t.total, 'moneda'), R('¿Requiere PIN de Administrador?', requierePin({ pct, maxPct: P.descuento_max.valor, esAdmin: sn(v.admin) }), 'bool')]
    },
    casos: [
      { nombre: '2 × $580 con 15 % al 16 %: descuento 174, importe 986', entrada: { cantidad: 2, precio: 580, pct: 15, monto: 0, iva: '16', admin: false }, esperado: { Descuento: 174, Importe: 986, '¿Requiere PIN de Administrador?': true } },
      { nombre: 'El 10 % exacto no pide PIN', entrada: { cantidad: 1, precio: 1000, pct: 10, monto: 0, iva: 'exento', admin: false }, esperado: { '¿Requiere PIN de Administrador?': false } },
    ],
  },
  {
    id: 'anticipo', grupo: 'Citas y anticipos', titulo: 'Anticipo, cancelación y reembolso', regla: 'P-033, P-034, P-035, P-038',
    formula: 'anticipo = precio × %anticipo (o monto fijo; nunca > precio; $0 en «a valorar», gratis, curaciones incluidas y precio $0) · en plazo (≥ horas de aviso) se reembolsa completo; fuera de plazo queda como no reembolsable',
    descripcion: 'El anticipo se cobra en el portal vía Clip. Cancelar con al menos las horas de aviso lo reembolsa (la comisión de Clip la absorbe la clínica). Reprogramar sin costo se permite hasta el máximo de veces y con el mismo aviso.',
    origen: 'Se calcula · espejo de app.anticipo_servicio y portal_accion_cita',
    parametros: ['anticipo_pct', 'cancelacion_horas', 'reprogramaciones'],
    campos: [{ k: 'precio', label: 'Precio del servicio', tipo: 'number', def: 900, paso: 0.01 }, { k: 'tipo_precio', label: 'Tipo de precio', tipo: 'select', def: 'fijo', opciones: [['fijo', 'Fijo'], ['desde', 'Desde'], ['por_unidad', 'Por unidad'], ['a_valorar', 'A valorar'], ['gratis', 'Gratis']] },
      { k: 'horas', label: 'Horas que faltan para la cita', tipo: 'number', def: 60 }, { k: 'clip', label: 'Comisión de Clip ($)', tipo: 'number', def: 31.5, paso: 0.01 }, { k: 'repro', label: 'Reprogramaciones previas', tipo: 'number', def: 0 }],
    calcular: (v, P) => {
      const anticipo = anticipoServicio({ tipo_precio: v.tipo_precio }, Number(v.precio), P.anticipo_pct.valor)
      const inicio = new Date(Date.now() + Number(v.horas) * 3600000), ahora = new Date()
      const c = evaluarCancelacion({ inicio, ahora, horasAviso: P.cancelacion_horas.valor })
      const r = resultadoAnticipoCancelacion({ anticipo, enPlazo: c.enPlazo, comisionClip: Number(v.clip) })
      const rp = puedeReprogramar({ inicio, ahora, horasAviso: P.cancelacion_horas.valor, reprogramaciones: Number(v.repro), max: P.reprogramaciones.valor })
      return [R('Anticipo requerido', anticipo, 'moneda'), R('¿Cancelación en plazo?', c.enPlazo, 'bool'), R('Reembolso al paciente', r.montoReembolso, 'moneda'), R('Anticipo retenido', r.retenido, 'moneda'), R('Costo de Clip para la clínica', r.costoClinica, 'moneda'), R('Estado del anticipo', r.estadoAnticipo), R('¿Reprogramar sin costo?', rp.permitido, 'bool'), R('Motivo', rp.motivo ?? 'Sin restricción')]
    },
    casos: [
      { nombre: '30 % de $900 = $270; cancelando con 60 h se reembolsa completo', entrada: { precio: 900, tipo_precio: 'fijo', horas: 60, clip: 31.5, repro: 0 }, esperado: { 'Anticipo requerido': 270, 'Reembolso al paciente': 270, 'Anticipo retenido': 0 } },
      { nombre: 'Con 10 h queda retenido y no reembolsable', entrada: { precio: 900, tipo_precio: 'fijo', horas: 10, clip: 0, repro: 0 }, esperado: { 'Reembolso al paciente': 0, 'Anticipo retenido': 270 } },
      { nombre: 'Servicio a valorar: sin anticipo', entrada: { precio: 900, tipo_precio: 'a_valorar', horas: 60, clip: 0, repro: 0 }, esperado: { 'Anticipo requerido': 0 } },
    ],
  },
  {
    id: 'caja', grupo: 'Caja y gastos', titulo: 'Corte de caja', regla: 'P-058, P-059',
    formula: 'efectivo esperado = fondo + ventas en efectivo − retiros + depósitos − cancelaciones en efectivo · diferencia = contado − esperado · fuera de tolerancia si |diferencia| > tolerancia',
    descripcion: 'Los anticipos aplicados NO son dinero del turno. Con diferencia dentro de la tolerancia basta la justificación; fuera de ella exige autorización del Administrador.',
    origen: 'Se calcula · espejo de app.cerrar_turno',
    parametros: ['corte_tolerancia'],
    campos: [{ k: 'fondo', label: 'Fondo inicial', tipo: 'number', def: 1000, paso: 0.01 }, { k: 'ventas', label: 'Ventas en efectivo', tipo: 'number', def: 4350, paso: 0.01 }, { k: 'retiros', label: 'Retiros y gastos', tipo: 'number', def: 300, paso: 0.01 },
      { k: 'depositos', label: 'Depósitos', tipo: 'number', def: 0, paso: 0.01 }, { k: 'cancel', label: 'Cancelaciones en efectivo', tipo: 'number', def: 0, paso: 0.01 }, { k: 'contado', label: 'Efectivo contado', tipo: 'number', def: 5000, paso: 0.01 }],
    calcular: (v, P) => {
      const esperado = efectivoEsperado({ fondo_inicial: Number(v.fondo), ventas_efectivo: Number(v.ventas), retiros: Number(v.retiros), depositos: Number(v.depositos), cancelaciones_efectivo: Number(v.cancel) })
      const e = evaluarCierre({ contado: Number(v.contado), esperado, tolerancia: P.corte_tolerancia.valor, justificacion: '' })
      return [R('Efectivo esperado', esperado, 'moneda'), R('Diferencia', e.dif, 'moneda'), R('¿Fuera de tolerancia?', e.fueraDeTolerancia, 'bool'), R('Requiere', e.requiere.length ? e.requiere.map(x => (x === 'administrador' ? 'autorización de Administrador' : 'justificación')).join(' y ') : 'Nada: cuadra')]
    },
    casos: [
      { nombre: '1,000 + 4,350 − 300 = 5,050 esperado; contar 5,000 deja −50 (dentro de tolerancia)', entrada: { fondo: 1000, ventas: 4350, retiros: 300, depositos: 0, cancel: 0, contado: 5000 }, esperado: { 'Efectivo esperado': 5050, Diferencia: -50, '¿Fuera de tolerancia?': false } },
      { nombre: 'Faltante de $120 está fuera de tolerancia', entrada: { fondo: 1000, ventas: 4350, retiros: 300, depositos: 0, cancel: 0, contado: 4930 }, esperado: { Diferencia: -120, '¿Fuera de tolerancia?': true } },
    ],
  },
  {
    id: 'fondo', grupo: 'Caja y gastos', titulo: 'Fondo revolvente y comprobantes de gasto', regla: 'P-092, P-094',
    formula: 'uso % = gastado / monto × 100 · alerta si uso % ≥ umbral · disponible = monto − gastado · esperado al cierre = monto − gastado · gasto exige comprobante fiscal desde el umbral',
    descripcion: 'El fondo semanal (sábado → viernes) se cierra contando el efectivo restante. Un gasto desde el monto del parámetro exige comprobante.',
    origen: 'Se calcula · espejo de prp_fondo_semana y fondo_cerrar',
    parametros: ['fondo_alerta', 'corte_tolerancia', 'comprobante_gasto'],
    campos: [{ k: 'monto', label: 'Monto del fondo', tipo: 'number', def: 3000, paso: 0.01 }, { k: 'gastado', label: 'Gastado en la semana', tipo: 'number', def: 2500, paso: 0.01 }, { k: 'contado', label: 'Efectivo contado al cierre', tipo: 'number', def: 480, paso: 0.01 }, { k: 'gasto', label: 'Gasto a revisar ($)', tipo: 'number', def: 2400, paso: 0.01 }],
    calcular: (v, P) => {
      const u = usoFondo(Number(v.monto), Number(v.gastado), P.fondo_alerta.valor)
      const c = diferenciaCierreFondo(Number(v.monto), Number(v.gastado), Number(v.contado), P.corte_tolerancia.valor)
      return [R('Uso del fondo', u.pct, 'pct'), R('Disponible', u.disponible, 'moneda'), R('¿En alerta?', u.alerta, 'bool'), R('Esperado al cierre', c.esperado, 'moneda'), R('Diferencia al cierre', c.diferencia, 'moneda'), R('¿Cierre exige Administrador?', c.requiereAdmin, 'bool'), R('¿El gasto exige comprobante?', requiereComprobante(Number(v.gasto), P.comprobante_gasto.valor), 'bool')]
    },
    casos: [{ nombre: '2,500 de 3,000 = 83.3 %, en alerta; esperado 500, contando 480 falta 20', entrada: { monto: 3000, gastado: 2500, contado: 480, gasto: 2400 }, esperado: { 'Uso del fondo': 83.3, '¿En alerta?': true, 'Esperado al cierre': 500, 'Diferencia al cierre': -20, '¿El gasto exige comprobante?': true } }],
  },
  {
    id: 'edr', grupo: 'Estado de resultados', titulo: 'EDR: real_ vs proy_, variación y semáforo', regla: 'P-090, P-100, P-101',
    formula: 'real = real_auto + real_ajustes · variación = real − proy · variación % = (real − proy) / |proy| × 100 · semáforo: ingreso por debajo o gasto por encima del proyectado = rojo si pasa el umbral, ámbar si es menor, verde si cumple',
    descripcion: 'proy_* lo captura SOLO el administrador y nunca lo escribe el código; real_auto lo calcula el sistema desde ingresos (base sin IVA, reembolsos restan) y gastos (subtotal; compartidos prorrateados por ingresos del mes); real_ajustes suma los ajustes con motivo. La utilidad es gerencial, sin impuestos.',
    origen: 'real_auto: se calcula desde ingresos y gastos · proy_importe: se captura a mano · ajustes: se capturan con motivo',
    parametros: ['edr_umbral'],
    campos: [{ k: 'tipo', label: 'Tipo de renglón', tipo: 'select', def: 'ingreso', opciones: [['ingreso', 'Ingreso'], ['gasto', 'Gasto'], ['fijo', 'Fijo']] }, { k: 'proy', label: 'Proyectado (proy_importe)', tipo: 'number', def: 100000, paso: 0.01 }, { k: 'auto', label: 'Real automático (real_auto)', tipo: 'number', def: 86000, paso: 0.01 }, { k: 'ajustes', label: 'Ajustes (real_ajustes)', tipo: 'number', def: 2000, paso: 0.01 }],
    calcular: (v, P) => {
      const real = Math.round((Number(v.auto) + Number(v.ajustes)) * 100) / 100
      const sem = semaforoVariacion(v.tipo, real, Number(v.proy), P.edr_umbral.valor)
      return [R('Real (real_importe)', real, 'moneda'), R('Variación', variacion(real, Number(v.proy)), 'moneda'), R('Variación %', variacionPct(real, Number(v.proy)), 'pct'), R('Semáforo', { r: 'Rojo', a: 'Ámbar', v: 'Verde', n: 'Sin base' }[sem])]
    },
    casos: [
      { nombre: 'Ingreso 88,000 vs proy 100,000: −12 % es rojo', entrada: { tipo: 'ingreso', proy: 100000, auto: 86000, ajustes: 2000 }, esperado: { 'Real (real_importe)': 88000, 'Variación %': -12, Semáforo: 'Rojo' } },
      { nombre: 'Gasto 5 % sobre el proyectado es ámbar', entrada: { tipo: 'gasto', proy: 1000, auto: 1050, ajustes: 0 }, esperado: { Semáforo: 'Ámbar' } },
      { nombre: 'Sin proyección no hay variación %', entrada: { tipo: 'ingreso', proy: 0, auto: 500, ajustes: 0 }, esperado: { Semáforo: 'Sin base' } },
    ],
  },
  {
    id: 'comision', grupo: 'Equipo', titulo: 'Comisión sobre base sin IVA', regla: 'P-104 a P-108',
    formula: 'base = cobrado − IVA − descuento − reembolso · comisión = base × % del esquema vigente a la fecha del servicio (servicio / producto / plan) · sin esquema vigente no hay % por defecto',
    descripcion: 'Solo se comisiona lo cobrado y validado. Un reembolso o cancelación posterior genera un ajuste negativo en el periodo vigente.',
    origen: 'Se calcula · espejo de app.comisiones_recalcular · el % lo captura el administrador en cada esquema',
    parametros: [],
    campos: [{ k: 'cobrado', label: 'Cobrado (IVA incluido)', tipo: 'number', def: 1160, paso: 0.01 }, { k: 'iva', label: 'IVA', tipo: 'number', def: 160, paso: 0.01 }, { k: 'descuento', label: 'Descuento', tipo: 'number', def: 0, paso: 0.01 }, { k: 'reembolso', label: 'Reembolso', tipo: 'number', def: 0, paso: 0.01 },
      { k: 'tipo', label: 'Tipo de renglón', tipo: 'select', def: 'servicio', opciones: [['servicio', 'Servicio'], ['producto', 'Producto'], ['plan', 'Plan']] }, { k: 'pct', label: '% del esquema', tipo: 'number', def: 30, paso: 0.01 }],
    calcular: v => {
      const base = baseComisionable({ cobrado: Number(v.cobrado), iva: Number(v.iva), descuento: Number(v.descuento), reembolso: Number(v.reembolso) })
      const r = renglonComision({ tipo: v.tipo, base, esquema: { pct_servicio: Number(v.pct), pct_producto: Number(v.pct), pct_plan: Number(v.pct) } })
      return [R('Base comisionable', base, 'moneda'), R('Porcentaje', r.pct, 'pct'), R('Comisión', r.comision, 'moneda')]
    },
    casos: [{ nombre: '$1,160 con IVA $160 al 30 % → base 1,000, comisión 300', entrada: { cobrado: 1160, iva: 160, descuento: 0, reembolso: 0, tipo: 'servicio', pct: 30 }, esperado: { 'Base comisionable': 1000, Comisión: 300 } }],
  },
  {
    id: 'vacaciones', grupo: 'Equipo', titulo: 'Vacaciones por ley y prima vacacional', regla: 'P-110',
    formula: 'años = máx(1, año − año de ingreso) · días: año 1 = parámetro (12) · años 2-5: +2 por año · después +2 cada 5 años (reforma «Vacaciones dignas» 2023) · prima = días × sueldo diario × 25 %',
    descripcion: 'Los domingos y festivos no cuentan como días solicitados. El saldo es el derecho menos lo autorizado y tomado. Validar con asesoría laboral.',
    origen: 'Se calcula · espejo de piefirme.vacaciones_dias_ley',
    parametros: ['vacaciones_primer_anio'],
    campos: [{ k: 'ingreso', label: 'Fecha de ingreso', tipo: 'date', def: '2021-03-15' }, { k: 'anio', label: 'Año a calcular', tipo: 'number', def: 2026 }, { k: 'sueldo', label: 'Sueldo diario', tipo: 'number', def: 450, paso: 0.01 }, { k: 'desde', label: 'Vacaciones desde', tipo: 'date', def: '2026-11-02' }, { k: 'hasta', label: 'Vacaciones hasta', tipo: 'date', def: '2026-11-13' }],
    calcular: (v, P) => {
      const anios = aniosServicioEnAnio(v.ingreso, Number(v.anio)), dias = diasDerechoAnio(v.ingreso, Number(v.anio), P.vacaciones_primer_anio.valor)
      return [R('Años de servicio en el año', anios, 'num'), R('Días de derecho', dias, 'num'), R('Prima vacacional (25 %) del derecho completo', primaVacacional(dias, Number(v.sueldo)), 'moneda'), R('Días laborables en el rango (sin domingos)', diasSolicitados(v.desde, v.hasta), 'num')]
    },
    casos: [
      { nombre: 'Primer año: 12 días', entrada: { ingreso: '2026-01-10', anio: 2026, sueldo: 450, desde: '2026-11-02', hasta: '2026-11-13' }, esperado: { 'Días de derecho': 12 } },
      { nombre: '5.º año: 20 días', entrada: { ingreso: '2021-03-15', anio: 2026, sueldo: 450, desde: '2026-11-02', hasta: '2026-11-13' }, esperado: { 'Días de derecho': 20, 'Días laborables en el rango (sin domingos)': 11 } },
      { nombre: '6.º año: 22 días', entrada: { ingreso: '2020-03-15', anio: 2026, sueldo: 450, desde: '2026-11-02', hasta: '2026-11-13' }, esperado: { 'Días de derecho': 22 } },
    ],
  },
  {
    id: 'costo', grupo: 'Inventario y compras', titulo: 'Costo promedio ponderado y autorización de compra', regla: 'P-081, P-083, P-085',
    formula: 'costo nuevo = (existencia × costo actual + entrada × costo de entrada) / (existencia + entrada) · si la existencia es ≤ 0 se toma el costo de la entrada · la OC exige autorización si total ≥ umbral',
    descripcion: 'Solo las compras recalculan el costo promedio (ventas, mermas y traspasos se valúan al costo del momento). La existencia puede quedar negativa (P-085) pero se señala en Validación. La base guarda el costo a 2 decimales.',
    origen: 'Se calcula · espejo de app.c_kardex_ai (productos.costo_promedio)',
    parametros: ['compra_autorizacion'],
    campos: [{ k: 'existencia', label: 'Existencia actual (todas las sedes)', tipo: 'number', def: 10 }, { k: 'costo', label: 'Costo promedio actual', tipo: 'number', def: 100, paso: 0.01 }, { k: 'entrada', label: 'Cantidad que entra', tipo: 'number', def: 10 }, { k: 'costo_entrada', label: 'Costo de la entrada', tipo: 'number', def: 120, paso: 0.01 }],
    calcular: (v, P) => {
      const nuevo = Math.round(costoPromedio(Number(v.existencia), Number(v.costo), Number(v.entrada), Number(v.costo_entrada)) * 100) / 100
      const total = Number(v.entrada) * Number(v.costo_entrada)
      return [R('Nuevo costo promedio', nuevo, 'moneda'), R('Variación del costo de entrada', variacionCosto(Number(v.costo), Number(v.costo_entrada)), 'pct'), R('Valor de la compra', total, 'moneda'), R('¿La compra exige autorización?', requiereAutorizacion(total, P.compra_autorizacion.valor), 'bool')]
    },
    casos: [
      { nombre: '10 a $100 + 10 a $120 → $110', entrada: { existencia: 10, costo: 100, entrada: 10, costo_entrada: 120 }, esperado: { 'Nuevo costo promedio': 110, 'Variación del costo de entrada': 20 } },
      { nombre: 'Sin existencia toma el costo de la entrada', entrada: { existencia: 0, costo: 100, entrada: 5, costo_entrada: 80 }, esperado: { 'Nuevo costo promedio': 80 } },
      { nombre: '$5,000 exactos ya exigen autorización', entrada: { existencia: 0, costo: 0, entrada: 50, costo_entrada: 100 }, esperado: { '¿La compra exige autorización?': true } },
    ],
  },
]

const iguales = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : a === b)

/** Corre un cálculo con sus valores por defecto o los indicados. */
export function ejecutarCalculo(calculo, valores, parametros = {}) {
  const v = { ...Object.fromEntries(calculo.campos.map(c => [c.k, c.def])), ...valores }
  return calculo.calcular(v, parametrosVigentes(parametros))
}

/** Verifica los casos de referencia de un cálculo (con parámetros de fábrica, para que no dependan de la clínica). */
export function verificarCalculo(calculo) {
  return (calculo.casos ?? []).map(caso => {
    let salida = [], error = null
    try { salida = ejecutarCalculo(calculo, caso.entrada, {}) } catch (e) { error = e.message }
    const fallas = Object.entries(caso.esperado).filter(([etq, esperado]) => { const r = salida.find(x => x.label === etq); return !r || !iguales(r.valor, esperado) })
      .map(([etq, esperado]) => ({ etiqueta: etq, esperado, obtenido: salida.find(x => x.label === etq)?.valor ?? '(sin resultado)' }))
    return { nombre: caso.nombre, ok: !error && fallas.length === 0, fallas, error }
  })
}

/** Verifica todos los cálculos → { total, ok, fallan, detalle: { id: [...] } }. */
export function verificarTodos(calculos = CALCULOS) {
  const detalle = Object.fromEntries(calculos.map(c => [c.id, verificarCalculo(c)]))
  const todos = Object.values(detalle).flat()
  return { total: todos.length, ok: todos.filter(x => x.ok).length, fallan: todos.filter(x => !x.ok).length, detalle }
}

/** ¿El parámetro de la clínica difiere del de fábrica? (para resaltarlo en pantalla). */
export const parametroModificado = p => String(p.valor) !== String(p.defecto)
