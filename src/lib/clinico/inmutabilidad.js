// Reglas de inmutabilidad y cierre en el CLIENTE. La autoridad es la BD (triggers de 031/033/039); esto evita
// pedirle al usuario acciones que la base va a rechazar y explica el motivo en español.

export const ESTADOS_CONSULTA = ['borrador', 'pendiente_firma', 'cerrada']

/** Antes de firmar se edita libremente; una consulta cerrada está bloqueada (P-001). */
export const consultaEditable = c => !!c && c.estado !== 'cerrada'

/** Transiciones válidas de la consulta (trigger consulta_bi). */
export function transicionConsultaValida(de, a) {
  if (de === a) return true
  if (de === 'cerrada') return false
  if (de === 'pendiente_firma' && a === 'borrador') return true
  return (de === 'borrador' && (a === 'pendiente_firma' || a === 'cerrada')) || (de === 'pendiente_firma' && a === 'cerrada')
}

/** Solo el podólogo autor firma y agrega notas aclaratorias. */
export const esAutorDeLaConsulta = (perfil, c) => !!perfil && !!c && perfil.id === c.podologo_id

/** Nota aclaratoria: solo sobre nota cerrada, del mismo podólogo, texto ≥ 5 caracteres (CHECK de la BD). */
export function puedeAgregarNotaAclaratoria(perfil, c) {
  return !!c && c.estado === 'cerrada' && esAutorDeLaConsulta(perfil, c) && perfil?.rol === 'podologo'
}
export function validarNotaAclaratoria(texto) {
  const t = String(texto ?? '').trim()
  if (t.length < 5) return 'La nota aclaratoria necesita al menos 5 caracteres.'
  return null
}

/**
 * Motivos que impiden cerrar y firmar (espejo del trigger consulta_bi, P-001/P-003/P-004/P-005/P-146).
 * @returns {string[]} lista vacía = se puede firmar
 */
export function motivosBloqueoCierre({ consulta, perfil, diagnosticos = [], esMenor = false, tutorVigente = false, avisoFirmado = true, firmaVacia = false }) {
  const m = []
  if (!consulta) return ['No hay consulta.']
  if (consulta.estado === 'cerrada') return ['La nota ya está firmada y bloqueada (solo admite nota aclaratoria).']
  if (!esAutorDeLaConsulta(perfil, consulta)) m.push('Solo el podólogo que atiende firma la nota.')
  if (!String(perfil?.cedula ?? '').trim()) m.push('Tu perfil no tiene cédula profesional: pide a Administración que la capture para poder firmar.')
  if (firmaVacia) m.push('Falta la firma del podólogo en pantalla.')
  if (!String(consulta.motivo_consulta ?? '').trim()) m.push('Falta el motivo de consulta.')
  if (!String(consulta.padecimiento_actual ?? '').trim()) m.push('Falta el padecimiento actual.')
  if (!String(consulta.nota_evolucion ?? '').trim()) m.push('Falta la nota de evolución.')
  if (!consulta.pronostico) m.push('Falta el pronóstico.')
  if (!diagnosticos.some(d => d.tipo === 'principal')) m.push('Falta el diagnóstico principal.')
  if (esMenor && !tutorVigente) m.push('El paciente es menor de 18 años y no tiene tutor registrado.')
  if (!avisoFirmado && !consulta.excepcion_autorizada_por) m.push('Falta el aviso de privacidad firmado: Administración debe autorizar la excepción.')
  return m
}

/** Una nota con la firma pendiente de aviso puede atenderse pero no cerrarse (P-004). */
export const requiereExcepcionAviso = (avisoFirmado, consulta) => !avisoFirmado && !consulta?.excepcion_autorizada_por

/** Fusión de expedientes: se puede deshacer hasta `limite_deshacer` (30 días) y solo una vez (P-006). */
export function fusionDeshacible(fusion, ahora = new Date()) {
  if (!fusion || fusion.deshecha_en) return false
  return new Date(fusion.limite_deshacer).getTime() >= new Date(ahora).getTime()
}

/** Foto clínica: nunca se borra; se retira con motivo (P-008). */
export function validarRetiroFoto(motivo) {
  return String(motivo ?? '').trim().length >= 3 ? null : 'Indica el motivo del retiro (queda en la bitácora).'
}

/** Foto 11 en la sesión: límite blando, requiere confirmar (P-007). */
export const fotoExcedeLimiteBlando = (fotosEnSesion, limite = 10) => fotosEnSesion >= limite

/** Docencia/difusión: solo con autorización vigente y difuminado (P-009). */
export function fotoPublicable(foto) {
  return foto?.nivel_autorizacion === 'docencia' ? !!foto.autorizacion_vigente && !!foto.difuminada : true
}

/** Orden de plantilla: borrador → enviada → recibida → entregada (+ cancelada). */
const TRANS_ORDEN = { borrador: ['enviada', 'cancelada'], enviada: ['recibida', 'cancelada'], recibida: ['entregada', 'cancelada'], entregada: [], cancelada: [] }
export const transicionOrdenValida = (de, a) => (TRANS_ORDEN[de] ?? []).includes(a)
export const siguienteEstadoOrden = de => ({ borrador: 'enviada', enviada: 'recibida', recibida: 'entregada' })[de] ?? null

/** Estudio de pisada y valoración de pie diabético: borrador → firmado/firmada, luego inmutables. */
export const registroFirmadoBloqueado = estado => estado === 'firmada' || estado === 'firmado'

/** P-075: no se envía la orden al laboratorio sin el anticipo (50 % del precio por defecto). */
export function anticipoOrdenCubierto(precio, anticipo, porcentaje = 50) {
  const p = Number(precio) || 0
  if (p <= 0) return true
  return (Number(anticipo) || 0) + 1e-9 >= p * (porcentaje / 100)
}
