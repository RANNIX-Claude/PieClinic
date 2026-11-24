// Reglas de agenda: disponibilidad de horarios, conflictos, estados y reprogramación (P-036…P-048).
// Funciones puras (sin React ni red) para poder probarlas con node:test.
import { puedeReprogramar } from './anticipo.js'

export const ESTADOS_CITA = {
  por_confirmar: { label: 'Por confirmar', color: 'a' },
  confirmada: { label: 'Confirmada', color: 'v' },
  en_camino: { label: 'En camino', color: 'b' },
  no_asistio: { label: 'No asistió', color: 'r' },
  cancelada: { label: 'Cancelada', color: 'n' },
  atendida: { label: 'Atendida', color: 'v' },
}
/** Colores de tarjeta por estado (variables del tema, sin colores fijos). */
export const COLOR_TARJETA = {
  por_confirmar: { bg: 'var(--bd-a-bg)', fg: 'var(--bd-a-fg)' }, confirmada: { bg: 'var(--bd-v-bg)', fg: 'var(--bd-v-fg)' },
  en_camino: { bg: 'var(--bd-b-bg)', fg: 'var(--bd-b-fg)' }, no_asistio: { bg: 'var(--bd-r-bg)', fg: 'var(--bd-r-fg)' },
  cancelada: { bg: 'var(--bd-n-bg)', fg: 'var(--bd-n-fg)' }, atendida: { bg: 'var(--accent-light)', fg: 'var(--accent-dark)' },
}

// Transiciones (MODELO_ESTADOS / 023). `atendida` solo la pone la firma de la nota; revertir es del Administrador.
const TRANSICIONES = {
  por_confirmar: ['confirmada', 'no_asistio', 'cancelada'],
  confirmada: ['en_camino', 'no_asistio', 'cancelada'],
  en_camino: ['no_asistio'],
  no_asistio: ['por_confirmar'],
  cancelada: [], atendida: [],
}
export function transicionesPermitidas(estado, { esAdmin = false, tipoAtencion = 'presencial' } = {}) {
  let t = [...(TRANSICIONES[estado] ?? [])]
  if (tipoAtencion !== 'domicilio') t = t.filter(e => e !== 'en_camino')
  if (esAdmin && estado === 'no_asistio') t = ['por_confirmar', 'confirmada']
  if (esAdmin && (estado === 'atendida' || estado === 'cancelada')) t = ['por_confirmar']
  if (estado === 'en_camino' && esAdmin) t.push('atendida')
  return t
}

/** Cita sin fin de proceso: ocupa agenda (no cancelada ni no asistió). */
export const ocupaAgenda = c => !['cancelada', 'no_asistio'].includes(c.estado)

const t = v => new Date(v).getTime()
export const traslapa = (aIni, aFin, bIni, bFin) => t(aIni) < t(bFin) && t(aFin) > t(bIni)

/**
 * ¿Hay conflicto de una cita candidata con otras citas? Mismo podólogo o misma cabina, con margen entre citas (P-043).
 * `ocupa_inicio/ocupa_fin` (traslado a domicilio, P-044) se respetan cuando vienen.
 */
export function conflictosCita(candidata, citas, { margenMin = 10, ignorarId = null } = {}) {
  const m = margenMin * 60000
  return citas.filter(c => c.id !== ignorarId && ocupaAgenda(c) && (
    (c.podologo_id && c.podologo_id === candidata.podologo_id) || (c.cabina_id && candidata.cabina_id && c.cabina_id === candidata.cabina_id)
  ) && t(candidata.inicio) < t(c.ocupa_fin ?? c.fin) + m && t(candidata.fin) + m > t(c.ocupa_inicio ?? c.inicio))
}

/** Bloqueos autorizados que tocan a la cita (sede completa, podólogo o cabina). */
export function bloqueosQueAfectan(candidata, bloqueos) {
  return bloqueos.filter(b => (b.estado ?? 'autorizado') === 'autorizado' && traslapa(candidata.inicio, candidata.fin, b.inicio, b.fin) && (
    b.ambito === 'sede' || (b.ambito === 'podologo' && b.podologo_id === candidata.podologo_id) || (b.ambito === 'cabina' && b.cabina_id && b.cabina_id === candidata.cabina_id)))
}

const aMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0) }
const dosD = n => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' + minutos del día + desfase ('-06:00') → ISO con desfase. */
export const aISO = (fecha, minutos, offset = '-06:00') => `${fecha}T${dosD(Math.floor(minutos / 60))}:${dosD(minutos % 60)}:00${offset}`

/**
 * Horarios libres de un día para un recurso (podólogo).
 * horarios: [{hora_inicio:'09:00', hora_fin:'18:00'}] del día; citas: las del recurso; bloqueos: aplicables;
 * festivo: { abre } o null. Devuelve [{inicio, fin}] con el paso técnico (15 min) y margen entre citas.
 */
export function horariosDisponibles({ fecha, offset = '-06:00', horarios = [], citas = [], bloqueos = [], festivo = null, duracionMin = 30, margenMin = 10, pasoMin = 15, ahora = new Date() }) {
  if (festivo && festivo.abre === false) return []
  const out = []
  for (const h of horarios) {
    for (let min = aMin(h.hora_inicio); min + duracionMin <= aMin(h.hora_fin); min += pasoMin) {
      const inicio = aISO(fecha, min, offset), fin = aISO(fecha, min + duracionMin, offset)
      if (t(inicio) <= t(ahora)) continue
      const cand = { inicio, fin, podologo_id: '_', cabina_id: null }
      if (conflictosCita(cand, citas.map(c => ({ ...c, podologo_id: '_' })), { margenMin }).length) continue
      if (bloqueos.some(b => (b.estado ?? 'autorizado') === 'autorizado' && traslapa(inicio, fin, b.inicio, b.fin))) continue
      out.push({ inicio, fin })
    }
  }
  return out
}

/** Agrupa horarios libres por día y quita duplicados. */
export const agruparPorDia = (slots, zona = 'America/Mexico_City') => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
  const g = {}
  for (const s of slots) { const d = fmt.format(new Date(s.inicio)); (g[d] ??= []).push(s) }
  return g
}

/**
 * Reglas para arrastrar/reprogramar una cita en la agenda. Devuelve { ok, errores[], avisos[], cuentaReprogramacion }.
 *  - Solo citas por confirmar / confirmadas (las demás se gestionan por estado).
 *  - No al pasado; sin empalme (podólogo/cabina) ni bloqueos ni festivo cerrado.
 *  - Reprogramar cuenta una reprogramación (máx. 2 sin costo con ≥ 48 h, P-038): si no cumple, se avisa y el recepcionista decide.
 */
export function validarReprogramacion({ cita, nuevoInicio, podologoId, cabinaId, citas = [], bloqueos = [], festivos = [], ahora = new Date(), parametros = {}, esAdmin = false }) {
  const errores = [], avisos = []
  const dur = t(cita.fin) - t(cita.inicio)
  const nuevoFin = new Date(t(nuevoInicio) + dur).toISOString()
  if (!['por_confirmar', 'confirmada'].includes(cita.estado)) errores.push(`Una cita ${ESTADOS_CITA[cita.estado]?.label?.toLowerCase() ?? cita.estado} no se reprograma desde la agenda`)
  if (t(nuevoInicio) < t(ahora)) errores.push('No se puede mover una cita al pasado')
  const cand = { ...cita, inicio: nuevoInicio, fin: nuevoFin, podologo_id: podologoId ?? cita.podologo_id, cabina_id: cabinaId === undefined ? cita.cabina_id : cabinaId }
  const choques = conflictosCita(cand, citas, { margenMin: parametros.margen_citas_min ?? 10, ignorarId: cita.id })
  if (choques.length) errores.push(`Empalme con ${choques.map(c => c.paciente_nombre ?? c.folio ?? 'otra cita').join(', ')} (incluye ${parametros.margen_citas_min ?? 10} min de margen)`)
  const bl = bloqueosQueAfectan(cand, bloqueos)
  if (bl.length) errores.push(`Horario bloqueado: ${bl.map(b => b.motivo || b.tipo).join(', ')}`)
  const dia = String(nuevoInicio).slice(0, 10)
  const fest = festivos.find(f => f.fecha === dia && (!f.sede_id || f.sede_id === cita.sede_id))
  if (fest && !fest.abre) errores.push(`Día festivo: ${fest.nombre}`)
  const movioHorario = t(nuevoInicio) !== t(cita.inicio)
  let cuentaReprogramacion = false
  if (movioHorario && errores.length === 0) {
    cuentaReprogramacion = true
    const r = puedeReprogramar({ inicio: cita.inicio, ahora, horasAviso: parametros.cancelacion_horas_aviso ?? 48, reprogramaciones: cita.reprogramaciones ?? 0, max: parametros.reprogramaciones_max ?? 2 })
    if (!r.permitido) {
      if (esAdmin) avisos.push(`${r.motivo}: la reprogramación queda marcada como excedida`)
      else avisos.push(`${r.motivo}. Requiere confirmación de Recepción y queda marcada`)
    }
  }
  return { ok: errores.length === 0, errores, avisos, cuentaReprogramacion, nuevoFin }
}

/** Sobrecupo: máximo por podólogo y día (P-042). */
export const sobrecupoDisponible = (citasDelDia, podologoId, max = 1) => citasDelDia.filter(c => c.podologo_id === podologoId && c.sobrecupo && ocupaAgenda(c)).length < max

/** Una cita «posible no asistió»: pasó la tolerancia y sigue por confirmar/confirmada (P-045). */
export const posibleNoAsistio = (c, ahora = new Date(), tolerancia = 15) => ['por_confirmar', 'confirmada'].includes(c.estado) && t(c.inicio) < t(ahora) - tolerancia * 60000

/** Disponibilidad en lista de espera: ventana de 30 min por notificado y vence a los 14 días (P-041). */
export function estadoListaEspera(e, ahora = new Date(), { ventanaMin = 30, venceDias = 14 } = {}) {
  if (e.estado === 'notificado' && e.notificado_hasta && t(e.notificado_hasta) < t(ahora)) return 'sin_respuesta'
  const vence = e.vence_el ? t(e.vence_el) : t(e.created_at) + venceDias * 86400000
  if (['esperando', 'notificado'].includes(e.estado) && vence < t(ahora)) return 'vencida'
  return e.estado
}
const PESO = { alta: 0, media: 1, baja: 2 }
/** Orden de la lista: prioridad (clínica) antes que antigüedad (P-041). */
export const ordenarListaEspera = lista => [...lista].sort((a, b) => (PESO[a.prioridad] - PESO[b.prioridad]) || (t(a.created_at) - t(b.created_at)))
