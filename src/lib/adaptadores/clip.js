// Adaptador de Clip (cobro de ANTICIPOS de citas, P-034). SIN LLAVE: modo `simulado` explícito y visible.
// Nunca finge un cobro real: en modo simulado el resultado lleva `simulado: true` y la interfaz lo rotula.
// Para pasar a sandbox/producción se reemplaza SOLO la función de servidor netlify/functions/clip-pago.js
// (las llaves viven en variables de entorno del servidor, jamás en VITE_).
import { llamarFuncion } from '../api'

export const CLIP_MODO = 'simulado'
export const CLIP_AVISO = 'Modo simulado: sin llave de Clip. No se cobra ninguna tarjeta real.'

/** Tarjetas de prueba del modo simulado (la última cifra decide el resultado). */
export const TARJETAS_PRUEBA = { aprobada: '4242 4242 4242 4242', rechazada: '4000 0000 0000 0002' }

/** Marca de la tarjeta por prefijo (solo para mostrar). */
export const marcaTarjeta = n => { const d = String(n).replace(/\D/g, ''); return d.startsWith('4') ? 'Visa' : /^5[1-5]/.test(d) ? 'Mastercard' : d.startsWith('3') ? 'Amex' : '' }

/** Valida el número con Luhn (en simulado solo se avisa; el procesador real lo exige). */
export function luhn(n) {
  const d = String(n).replace(/\D/g, '')
  if (d.length < 13) return false
  let s = 0
  for (let i = 0; i < d.length; i++) { let x = Number(d[d.length - 1 - i]); if (i % 2) { x *= 2; if (x > 9) x -= 9 } s += x }
  return s % 10 === 0
}

/**
 * Cobra el anticipo de una reserva del portal (sin sesión). Llama a la función de servidor `clip-pago`,
 * que a su vez registra el resultado con servicio_pago_reserva (idempotente por clip_payment_id).
 * @returns {{ ok:boolean, estado:string, resultado?:string, simulado:boolean, mensaje?:string, datos?:object }}
 */
export async function cobrarAnticipoReserva({ slug, reservaId, tokenReserva, numeroTarjeta }) {
  try {
    const r = await fetch('/.netlify/functions/clip-pago', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, reserva_id: reservaId, token_reserva: tokenReserva, ultimos4: String(numeroTarjeta).replace(/\D/g, '').slice(-4), marca: marcaTarjeta(numeroTarjeta) }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, estado: 'error', simulado: true, mensaje: j.error || `No se pudo procesar el pago (${r.status})` }
    return { ok: j.estado === 'confirmada', estado: j.estado, resultado: j.resultado, simulado: j.modo !== 'produccion', datos: j }
  } catch (e) {
    return { ok: false, estado: 'error', simulado: true, mensaje: 'Sin conexión con el servidor de pagos. Intenta de nuevo.' }
  }
}

/**
 * Liga de pago de un anticipo creado en recepción. En modo simulado NO hay liga real: devuelve null y la pantalla ofrece
 * «Registrar pago simulado» (deja el anticipo como pagado con referencia SIMULADO-… para poder probar el flujo).
 */
export async function crearLigaPago() { return { simulado: true, url: null, aviso: CLIP_AVISO } }

export const referenciaSimulada = () => `SIMULADO-${Date.now().toString(36).toUpperCase()}`

/** Cobro en terminal Clip desde caja: solo se registra la referencia que el cajero captura (no hay integración con la terminal). */
export const COBRO_TERMINAL_AVISO = 'La terminal Clip no está conectada: captura el ID de pago que muestra la terminal.'

export { llamarFuncion }
