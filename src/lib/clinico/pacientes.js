// Alta de pacientes: validación P-003, normalización para detectar duplicados (P-006) y utilidades de búsqueda.
import { esMenorDeEdad } from './edad.js'

/** Minúsculas, sin acentos ni signos, espacios colapsados. */
export const normalizarTexto = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Clave de duplicado: nombre completo normalizado + fecha de nacimiento (P-006). */
export const claveDuplicado = p => `${normalizarTexto([p?.nombre, p?.apellido_paterno, p?.apellido_materno].filter(Boolean).join(' '))}|${p?.fecha_nacimiento ?? ''}`

/** Compara dos pacientes: 'bloquea' (nombre+nacimiento iguales), 'avisa' (mismo celular) o null. */
export function coincidencia(a, b) {
  if (!a || !b) return null
  const ka = claveDuplicado(a)
  if (a.fecha_nacimiento && ka === claveDuplicado(b)) return 'bloquea'
  const ta = String(a.telefono_celular ?? '').replace(/\D/g, '').slice(-10)
  const tb = String(b.telefono_celular ?? '').replace(/\D/g, '').slice(-10)
  return ta && ta === tb ? 'avisa' : null
}

const CURP = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/
const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
export const curpValida = v => !v || CURP.test(String(v).toUpperCase())
export const rfcValido = v => !v || RFC.test(String(v).toUpperCase())

/**
 * Valida el alta. `rapida` = alta rápida desde cita/portal (nombre + celular; el resto antes de la primera consulta, P-003).
 * @returns {Record<string,string>} errores por campo (vacío = válido)
 */
export function validarAlta(f, { rapida = false, hoy = new Date() } = {}) {
  const e = {}
  const vacio = v => !String(v ?? '').trim()
  if (vacio(f.nombre)) e.nombre = 'Escribe el nombre.'
  if (vacio(f.telefono_celular) || String(f.telefono_celular).replace(/\D/g, '').length < 10) e.telefono_celular = 'Escribe un celular de 10 dígitos.'
  if (!rapida) {
    if (vacio(f.apellido_paterno)) e.apellido_paterno = 'Escribe el apellido paterno.'
    if (vacio(f.fecha_nacimiento)) e.fecha_nacimiento = 'Captura la fecha de nacimiento.'
    else if (new Date(f.fecha_nacimiento + 'T00:00:00') > hoy) e.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura.'
    if (vacio(f.sede_registro_id)) e.sede_registro_id = 'Elige la sede de registro.'
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Correo no válido.'
    if (!curpValida(f.curp)) e.curp = 'CURP no válida (18 caracteres).'
    if (f.fecha_nacimiento && esMenorDeEdad(f.fecha_nacimiento, hoy)) {
      if (vacio(f.tutor?.nombre_completo)) e.tutor = 'Es menor de 18 años: captura al tutor.'
      else if (vacio(f.tutor?.parentesco)) e.tutor = 'Captura el parentesco del tutor.'
    }
    if (f.rfc && !rfcValido(f.rfc)) e.rfc = 'RFC no válido.'
  }
  return e
}

/** ¿Qué consentimientos faltan para guardar el alta completa? (aviso + datos de salud, P-003). */
export function consentimientosFaltantes({ aviso, datosSalud, firmaVacia }) {
  const f = []
  if (!aviso) f.push('Aviso de privacidad')
  if (!datosSalud) f.push('Consentimiento de tratamiento de datos de salud')
  if (firmaVacia && (aviso || datosSalud)) f.push('Firma del paciente')
  return f
}

/** Número de expediente manual (migración N-08): se conserva el vigente; vacío = lo asigna la BD. */
export const expedienteManualValido = v => !v || /^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,39}$/.test(String(v).trim())
