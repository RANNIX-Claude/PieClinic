// Parámetros por defecto de finanzas (espejo de app.parametros_finanzas_default, migración 040).
// La clínica puede cambiarlos en organizaciones.parametros; la app los lee con parametrosFinanzas(organizacion).
export const PARAMETROS_DEFAULT = {
  compra_autorizacion_desde: 5000,
  comprobante_gasto_desde: 2000,
  semana_inicio_dow: 6, // 6 = sábado (semana sábado → viernes, P-088)
  dias_caducidad_proxima: 90,
  cxc_dias_reciente: 7,
  cxc_dias_mora: 30,
  cxp_dias_por_vencer: 7,
  fondo_alerta_pct: 80,
  conciliacion_tolerancia_dias: 3,
  iva_tasa_general: 16,
}
export const parametrosFinanzas = org => ({ ...PARAMETROS_DEFAULT, ...(org?.parametros ?? {}) })

// Tolerancias
export const TOLERANCIA_APLICACION = 0.01 // las aplicaciones no pueden exceder el ingreso/saldo por más de 1 centavo
export const TOLERANCIA_TICKET = 0.5 // diferencia permitida entre suma de líneas y total del ticket (redondeos)
export const TOLERANCIA_CORTE_CAJA = 50 // P-058: diferencia de caja mayor requiere Administrador

export const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Depósito', 'Cheque', 'Otro']
export const CLASIFICACIONES_INGRESO = ['cita', 'venta', 'anticipo', 'membresia', 'gift_card', 'otro', 'mixto']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
