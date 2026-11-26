// Adaptador de alertas de Control y Auditoría (Push / WhatsApp / correo). SIN PROVEEDOR: modo `simulado` explícito, igual que mensajeria.js y las demás integraciones de
// Pie Firme. El motor de alertas vive en la base (migración 245): cada alerta se despacha con su techo diario y deja en ctl_alerta_envio «lo que se habría enviado»
// (simulado = true). Cuando haya proveedor, UN proceso de servidor (netlify/functions/auditoria-alertas-programadas.js) leerá esos envíos pendientes, llamará a este contrato
// con las llaves de Netlify (jamás VITE_) y registrará una fila nueva con simulado = false. Esta capa nunca decide a quién ni cuántas alertas: eso ya lo resolvió la base.
export const ALERTAS_MODO = 'simulado'
export const ALERTAS_AVISO = 'Modo simulado: sin proveedor de Push, WhatsApp ni correo. Aquí se registra lo que se habría enviado; nada sale de la clínica.'
export const CANALES_ALERTA = { push: 'Push', whatsapp: 'WhatsApp', correo: 'Correo' }

/**
 * Contrato de envío (el proveedor real lo implementa igual).
 * @param {{canal:'push'|'whatsapp'|'correo', destino:string, asunto:string, mensaje:string, datos?:object}} envio
 * @returns {Promise<{ok:boolean, simulado:boolean, canal:string, id:string, enviado_en:string, error?:string}>}
 */
export async function enviarAlerta(envio) {
  const ahora = new Date().toISOString()
  if (!CANALES_ALERTA[envio?.canal]) return { ok: false, simulado: true, canal: envio?.canal, id: '', enviado_en: ahora, error: 'Canal no soportado' }
  if (!envio.mensaje) return { ok: false, simulado: true, canal: envio.canal, id: '', enviado_en: ahora, error: 'Mensaje vacío' }
  // SIMULADO: no se envía nada.
  return { ok: true, simulado: true, canal: envio.canal, id: `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, enviado_en: ahora }
}
