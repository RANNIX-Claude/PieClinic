// Seguimiento de pacientes (CRM): inactivos, revisiones vencidas, cumpleaños y consentimiento de contacto (P-052, P-053, P-148).
import { diasParaCumpleanos } from './edad.js'

const dia = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }

export const UMBRAL_INACTIVO_DIAS = 180

/** Días entre la última visita y hoy (null si nunca vino). */
export const diasSinVenir = (ultimaVisita, hoyISO) => (ultimaVisita ? Math.max(0, Math.round((dia(hoyISO) - dia(ultimaVisita)) / 86400000)) : null)
export const esInactivo = (dias, umbral = UMBRAL_INACTIVO_DIAS) => dias !== null && dias >= umbral

/** Revisión vencida = pasó el intervalo del servicio sin cita (días). */
export const revisionVencida = (ultimaVisita, intervaloDias, hoyISO) => {
  const d = diasSinVenir(ultimaVisita, hoyISO)
  return d !== null && Number(intervaloDias) > 0 && d > Number(intervaloDias)
}

/** Cumpleaños dentro de los próximos `dias` días (incluye hoy). */
export const cumpleEnVentana = (fechaNacimiento, hoy = new Date(), dias = 7) => {
  const d = diasParaCumpleanos(fechaNacimiento, hoy)
  return d !== null && d >= 0 && d < dias
}

/** ¿El último consentimiento de contacto para (tipo, canal) está otorgado? `vigentes` viene de prp_consentimientos_contacto_vigentes. */
export function puedeContactar(vigentes = [], pacienteId, tipo, canal = null) {
  const del = vigentes.filter(c => c.paciente_id === pacienteId && c.tipo === tipo && (!canal || c.canal === canal))
  return del.length > 0 && del.some(c => c.otorgado)
}

/**
 * Separa destinatarios de una campaña: solo se envía a quien tiene consentimiento comercial vigente (P-148/P-053).
 * canales: lista de canales de la campaña ('whatsapp','correo','sms'); basta uno otorgado.
 */
export function segmentarDestinatarios(pacienteIds = [], vigentes = [], canales = ['whatsapp', 'correo']) {
  const incluidos = [], excluidos = []
  for (const id of pacienteIds) {
    const ok = canales.some(c => puedeContactar(vigentes, id, 'comerciales', c))
    ;(ok ? incluidos : excluidos).push(id)
  }
  return { incluidos, excluidos }
}

export const CANALES_CAMPANA = { whatsapp: ['whatsapp'], correo: ['correo'], sms: ['sms'], whatsapp_correo: ['whatsapp', 'correo'] }

/** Liga wa.me para contacto manual (sin proveedor de WhatsApp todavía). */
export function ligaWhatsApp(telefono, texto = '') {
  const d = String(telefono ?? '').replace(/\D/g, '').replace(/^(52|521)(?=\d{10}$)/, '')
  return d.length === 10 ? `https://wa.me/52${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}` : null
}

/** Sustituye {{nombre}} y {{liga_cita}} de una campaña para vista previa. */
export const vistaPreviaMensaje = (mensaje, vars = {}) => String(mensaje ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
