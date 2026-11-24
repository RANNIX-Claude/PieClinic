// IVA y conceptos de CFDI (P-056/P-057): el ticket y el CFDI deben dar el mismo total.
import { redondear, suma } from './dinero.js'
import { calcularLinea } from './ventas.js'

export const IVA_TIPOS = { exento: 'Exento', '16': '16 %', tasa0: 'Tasa 0 %' }
export const TASA = { exento: null, '16': 0.16, tasa0: 0 }

/** Desglose de un precio con IVA incluido. exento/0 %: base = precio; 16 %: base = precio / 1.16. */
export function desglosarIva(precioConIva, ivaTipo = 'exento') {
  const total = redondear(precioConIva)
  if (String(ivaTipo) === '16') { const base = redondear(total / 1.16); return { base, iva: redondear(total - base), total } }
  return { base: total, iva: 0, total }
}

/**
 * Conceptos del CFDI desde las líneas del ticket (cada línea con importe, descuento e iva_tipo).
 * importe = base + descuento (sin IVA); base = importe - descuento (regla del esquema factura_conceptos).
 */
export function conceptosCfdi(lineas) {
  const conceptos = lineas.filter(l => Number(l.importe_bruto ?? calcularLinea(l).importe_bruto) > 0).map(l => {
    const c = l.importe != null && l.base_neta != null ? l : { ...l, ...calcularLinea(l) }
    const tipo = String(c.iva_tipo)
    const base = c.base_neta
    const descuentoSinIva = tipo === '16' ? redondear(c.descuento / 1.16) : c.descuento
    const importe = redondear(base + descuentoSinIva)
    return {
      clave_sat: c.clave_sat ?? '85121600', descripcion: c.descripcion, unidad_sat: c.unidad_sat ?? 'E48',
      cantidad: Number(c.cantidad), valor_unitario: Number(c.cantidad) ? importe / Number(c.cantidad) : 0,
      importe, descuento: descuentoSinIva, base, objeto_impuesto: '02', iva_tipo: tipo, iva_tasa: TASA[tipo] ?? null, iva_importe: c.iva_monto,
    }
  })
  const subtotal = suma(conceptos.map(c => c.importe))
  const descuento = suma(conceptos.map(c => c.descuento))
  const iva_trasladado_base = suma(conceptos.filter(c => c.iva_tipo === '16').map(c => c.base))
  const iva_trasladado = suma(conceptos.map(c => c.iva_importe))
  const iva_exento_base = suma(conceptos.filter(c => c.iva_tipo === 'exento').map(c => c.base))
  const total = redondear(subtotal - descuento + iva_trasladado)
  return { conceptos, subtotal, descuento, iva_trasladado_base, iva_trasladado, iva_exento_base, total }
}

export const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
export const RFC_PUBLICO = 'XAXX010101000'
export const validarRfc = rfc => RFC_RE.test(String(rfc ?? '').trim().toUpperCase())

// Catálogos SAT mínimos (sugerencias a validar con el contador, P-056).
export const REGIMENES = [
  ['601', 'General de Ley Personas Morales'], ['603', 'Personas Morales con Fines no Lucrativos'], ['605', 'Sueldos y Salarios'],
  ['606', 'Arrendamiento'], ['612', 'Personas Físicas con Actividades Empresariales'], ['616', 'Sin obligaciones fiscales'],
  ['621', 'Incorporación Fiscal'], ['626', 'Régimen Simplificado de Confianza'],
]
export const USOS_CFDI = [
  ['G03', 'Gastos en general'], ['D01', 'Honorarios médicos, dentales y gastos hospitalarios'], ['D07', 'Primas por seguros de gastos médicos'],
  ['S01', 'Sin efectos fiscales'], ['CP01', 'Pagos'],
]
export const FORMAS_PAGO_SAT = { efectivo: '01', transferencia: '03', tarjeta: '04', clip: '04', gift_card: '99', anticipo: '30', cortesia: '99' }
export const MOTIVOS_CANCELACION = [
  ['01', 'Comprobante emitido con errores con relación'], ['02', 'Comprobante emitido con errores sin relación'],
  ['03', 'No se llevó a cabo la operación'], ['04', 'Operación nominativa relacionada en una factura global'],
]
