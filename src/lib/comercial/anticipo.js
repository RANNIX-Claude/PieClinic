// Anticipo, cancelación y reembolso (P-033, P-034, P-035, P-038). Refleja app.anticipo_servicio y portal_accion_cita.
import { redondear } from './dinero.js'

export const PARAMETROS_DEFECTO = {
  cancelacion_horas_aviso: 48, anticipo_portal_pct: 30, reprogramaciones_max: 2, retencion_horario_min: 10,
  tolerancia_no_asistio_min: 15, margen_citas_min: 10, sobrecupo_max_por_dia: 1, lista_espera_ventana_min: 30, lista_espera_vence_dias: 14,
  descuento_recepcion_max_pct: 10, tolerancia_corte_mxn: 50, paso_agenda_min: 15,
}
/** Parámetro numérico de la clínica (organizaciones.parametros) con el valor por defecto de REGLAS_NEGOCIO. */
// Configuración (plataforma) guarda anticipo_pct y reprogramaciones_sin_costo; el portal/BD usan los nombres de la derecha: se aceptan ambos (el de Configuración manda).
const ALIAS_PARAMETROS = { anticipo_portal_pct: 'anticipo_pct', reprogramaciones_max: 'reprogramaciones_sin_costo' }
export const param = (parametros, clave) => {
  const alias = ALIAS_PARAMETROS[clave]
  const crudo = alias && parametros?.[alias] !== undefined && parametros?.[alias] !== '' ? parametros[alias] : parametros?.[clave]
  const v = Number(crudo)
  return crudo !== '' && crudo != null && Number.isFinite(v) ? v : PARAMETROS_DEFECTO[clave]
}

/**
 * Anticipo sugerido (P-034): 30 % del precio (o monto fijo del servicio); sin anticipo en «a valorar», gratis,
 * curaciones incluidas y precios en $0. Nunca mayor al precio.
 */
export function anticipoServicio(servicio, precio, pct = PARAMETROS_DEFECTO.anticipo_portal_pct) {
  const p = Number(precio) || 0
  if (!servicio || servicio.tipo_precio === 'a_valorar' || servicio.tipo_precio === 'gratis' || servicio.es_curacion_incluida || p <= 0) return 0
  const base = servicio.anticipo_monto_fijo != null ? Number(servicio.anticipo_monto_fijo) : redondear(p * pct / 100)
  return Math.min(base, p)
}

/** Horas que faltan para la cita y si la cancelación llega dentro del plazo (≥ horas de aviso, P-033). */
export function evaluarCancelacion({ inicio, ahora = new Date(), horasAviso = PARAMETROS_DEFECTO.cancelacion_horas_aviso }) {
  const horas = (new Date(inicio).getTime() - new Date(ahora).getTime()) / 3600000
  return { horas, enPlazo: horas >= horasAviso }
}

/**
 * Qué pasa con el anticipo al cancelar (P-033/P-035): en plazo se reembolsa completo (la comisión de Clip la absorbe la
 * clínica); fuera de plazo queda como no reembolsable. Sin anticipo pagado no hay nada que reembolsar.
 */
export function resultadoAnticipoCancelacion({ anticipo, estadoAnticipo = 'pagado', enPlazo, comisionClip = 0 }) {
  const monto = Number(anticipo) || 0
  if (monto <= 0 || estadoAnticipo !== 'pagado') return { reembolsa: false, montoReembolso: 0, retenido: 0, costoClinica: 0, estadoAnticipo }
  if (enPlazo) return { reembolsa: true, montoReembolso: redondear(monto), retenido: 0, costoClinica: redondear(comisionClip), estadoAnticipo: 'reembolsado' }
  return { reembolsa: false, montoReembolso: 0, retenido: redondear(monto), costoClinica: 0, estadoAnticipo: 'no_reembolsable' }
}

/** ¿Puede reprogramarse sin costo? ≥ horas de aviso y menos de N reprogramaciones (P-038). Si no, cuenta como cancelación. */
export function puedeReprogramar({ inicio, ahora = new Date(), horasAviso = 48, reprogramaciones = 0, max = 2 }) {
  const { horas, enPlazo } = evaluarCancelacion({ inicio, ahora, horasAviso })
  if (!enPlazo) return { permitido: false, motivo: `Con menos de ${horasAviso} h de aviso cuenta como cancelación`, horas }
  if (reprogramaciones >= max) return { permitido: false, motivo: `Ya se reprogramó ${max} veces sin costo`, horas }
  return { permitido: true, motivo: null, horas, restantes: max - reprogramaciones }
}

/** Anticipo de una orden de plantilla ortopédica (P-075): % de la orden. */
export const anticipoPlantilla = (total, pct = 50) => redondear(Number(total || 0) * pct / 100)
