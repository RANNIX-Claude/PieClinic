// Hora del servidor: toda marca temporal la pone el servidor (now()). El cliente puede mandar la suya SOLO como referencia (hora_cliente);
// una diferencia mayor a 5 minutos la registra la base (ctl_discrepancia_hora). Esto mide lo mismo para avisarle a la persona.
export const UMBRAL_DISCREPANCIA_SEG = 300
export const diferenciaSegundos = (horaClienteMs, horaServidorMs) => Math.round((horaClienteMs - horaServidorMs) / 1000)
export const hayDiscrepancia = (horaClienteMs, horaServidorMs) => Math.abs(diferenciaSegundos(horaClienteMs, horaServidorMs)) > UMBRAL_DISCREPANCIA_SEG
/** Hora local del dispositivo para enviar como `hora_cliente` (ISO UTC). Nunca se usa como marca oficial. */
export const horaClienteISO = (ahora = new Date()) => ahora.toISOString()
