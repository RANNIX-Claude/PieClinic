// Sesión de captura de la PWA: usuario + PIN de 4 a 6 dígitos, ligada al turno, con caducidad (F6, ctl_sesion_pin). PURA.
// La autoridad es el servidor (ctl_pin_abrir_sesion / ctl_pin_validar_sesion: 3 fallos bloquean 15 min). Esto decide qué se pinta y cuándo se vuelve a pedir el PIN.
export const PIN_MIN = 4
export const PIN_MAX = 6   // el servidor admite hasta 8 (Mi PIN); la PWA pide 4–6 según la especificación
export const esPinValido = p => typeof p === 'string' && new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`).test(p)
export const BLOQUEO_INTENTOS = 3
export const BLOQUEO_MIN = 15

/** Bloqueo temporal local (espejo del servidor): `fallos` = marcas de tiempo (ms) de PIN incorrectos seguidos. */
export function estadoBloqueo(fallos = [], ahora = Date.now()) {
  const vivos = fallos.filter(t => ahora - t < BLOQUEO_MIN * 60000)
  if (vivos.length < BLOQUEO_INTENTOS) return { bloqueado: false, restantes: BLOQUEO_INTENTOS - vivos.length, minutos: 0 }
  const hasta = Math.max(...vivos) + BLOQUEO_MIN * 60000
  return { bloqueado: true, restantes: 0, minutos: Math.max(1, Math.ceil((hasta - ahora) / 60000)) }
}

/** Sesión local tras un PIN correcto. `venceEn` y `ahoraServidor` vienen del servidor. */
export const crearSesionLocal = ({ sesionId, usuarioId, sucursalId, turnoId = null, venceEn, ahoraServidor = null, ahoraLocal = Date.now() }) =>
  ({ sesionId, usuarioId, sucursalId, turnoId, venceEn, desfaseMs: ahoraServidor ? new Date(ahoraServidor).getTime() - ahoraLocal : 0 })

/** Hora del servidor estimada sin fiarse del reloj del teléfono: reloj local + desfase medido al entrar. */
export const horaServidorEstimada = (ses, ahora = Date.now()) => ahora + (ses?.desfaseMs ?? 0)

/** ¿Sigue vigente la sesión? `validacion` = respuesta de ctl_pin_validar_sesion si hay red (el servidor manda); sin red solo cuenta el vencimiento. */
export function sesionVigente(ses, { ahora = Date.now(), validacion = null } = {}) {
  if (!ses?.sesionId) return { vigente: false, motivo: 'sin_sesion' }
  if (validacion && validacion.vigente === false) return { vigente: false, motivo: validacion.motivo ?? 'invalida' }   // p. ej. turno_cerrado
  if (horaServidorEstimada(ses, ahora) >= new Date(ses.venceEn).getTime()) return { vigente: false, motivo: 'vencida' }
  return { vigente: true, motivo: null }
}
export const TEXTO_MOTIVO = {
  sin_sesion: 'Escribe tu PIN para entrar.', vencida: 'Tu sesión venció. Escribe tu PIN.', turno_cerrado: 'Tu turno de caja se cerró; la sesión caducó. Escribe tu PIN.',
  cerrada: 'Cerraste la sesión. Escribe tu PIN.', no_existe: 'Escribe tu PIN para entrar.', invalida: 'Escribe tu PIN para entrar.',
}
