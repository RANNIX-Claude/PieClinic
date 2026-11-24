// Adaptador de mensajería (correo / SMS / WhatsApp). SIN PROVEEDOR: modo `simulado` explícito (P-039/P-040).
// La BD programa y lleva la cola (tabla recordatorios); el envío real lo hará una función de servidor que consuma
// servicio_recordatorios_pendientes. Mientras tanto Recepción puede abrir wa.me con el texto ya redactado (envío manual).
export const MENSAJERIA_MODO = 'simulado'
export const MENSAJERIA_AVISO = 'Modo simulado: sin proveedor de mensajería. Los recordatorios se programan pero no se envían solos.'

export const CANALES = { correo: 'Correo', sms: 'SMS', whatsapp: 'WhatsApp', wa_me: 'WhatsApp manual (wa.me)' }
export const TIPOS_RECORDATORIO = {
  recordatorio_24h: 'Recordatorio 24 h', recordatorio_2h: 'Recordatorio 2 h', confirmacion: 'Confirmación', reprogramacion: 'Reprogramación',
  cancelacion: 'Cancelación', lista_espera_hueco: 'Hueco de lista de espera', liga_pago: 'Liga de pago', reembolso: 'Reembolso',
  vencimiento_plan: 'Vencimiento de plan', renovacion_membresia: 'Renovación de membresía', otro: 'Otro',
}

/** Teléfono a formato wa.me (México: 52 + 10 dígitos). */
export function telefonoWa(tel) {
  const d = String(tel ?? '').replace(/\D/g, '')
  if (d.length === 10) return `52${d}`
  if (d.length === 12 && d.startsWith('52')) return d
  if (d.length === 13 && d.startsWith('521')) return `52${d.slice(3)}`
  return d
}
export const enlaceWa = (tel, texto) => `https://wa.me/${telefonoWa(tel)}?text=${encodeURIComponent(texto ?? '')}`

/** Plantillas de texto (editables en la pantalla de recordatorios; aquí los valores por defecto). */
export const PLANTILLAS = {
  recordatorio_24h: ({ nombre, fecha, hora, sede, liga }) => `Hola ${nombre}, te esperamos el ${fecha} a las ${hora} en ${sede}.${liga ? ` Confirma, reprograma o cancela aquí: ${liga}` : ''}`,
  recordatorio_2h: ({ nombre, hora, sede }) => `Hola ${nombre}, te recordamos tu cita de hoy a las ${hora} en ${sede}.`,
  lista_espera_hueco: ({ nombre, fecha, hora, sede, minutos = 30 }) => `Hola ${nombre}, se liberó un horario el ${fecha} a las ${hora} en ${sede}. Responde en los próximos ${minutos} minutos para apartarlo.`,
  liga_pago: ({ nombre, monto, liga }) => `Hola ${nombre}, para apartar tu cita paga tu anticipo de ${monto}: ${liga}`,
  cancelacion: ({ nombre, fecha, hora }) => `Hola ${nombre}, tu cita del ${fecha} a las ${hora} fue cancelada.`,
}
export const redactar = (tipo, datos) => (PLANTILLAS[tipo] ? PLANTILLAS[tipo](datos) : '')

/** Liga completa a /app/cita/:token para el paciente (origen = dominio actual). */
export const ligaCita = token => `${window.location.origin}${import.meta.env.BASE_URL}cita/${token}`
