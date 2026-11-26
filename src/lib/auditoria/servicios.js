// Lógica pura del control de servicios (Etapa 8, spec §F5.5): atención ligada a cobro, cuadre de insumos y cruce de ocupación.
// Es el ESPEJO de lo que decide el servidor (migraciones 280–282): la autoridad es la base de datos; esto evita pedir lo que se va a rechazar y se prueba con
// los mismos números de la especificación (12 kits contra 10 tickets; 12 ocupaciones contra 8 tickets).

export const ESTADOS_ATENCION = { abierta: 'Abierta', cerrada_con_ticket: 'Cerrada con ticket', cancelada: 'Cancelada' }
export const MOTIVO_MIN = 5
export const MOTIVO_MAX = 300
export const REF_OPACA = /^[A-Za-z0-9_-]{3,40}$/

/** La referencia del paciente es opaca: letras, números y guiones; sin espacios, nombres ni texto libre. Vacía = el servidor genera una. */
export function validarReferencia(ref) {
  const r = String(ref ?? '').trim()
  if (!r) return { ok: true, ref: null }
  return REF_OPACA.test(r) ? { ok: true, ref: r } : { ok: false, error: 'La referencia es opaca: solo letras, números y guiones (3 a 40), sin nombre ni datos clínicos.' }
}

/** Nombres de columna que NUNCA deben existir en el expediente de atención del piloto (sin nota clínica: LFPDPPP). */
export const COLUMNA_CLINICA = /nota|diagn|nombre|apellid|clinic|padec|sintom|observ|trat|curp|telefono|correo|email|paciente_id|expediente|motivo_consulta/i
export const sinDatosClinicos = columnas => columnas.filter(c => COLUMNA_CLINICA.test(c) && c !== 'puesto_nombre')

/** Cancelar exige motivo (5–300) y la clave de OTRA persona. */
export function validarCancelacion({ motivo, supervisorId, usuarioId, pin }) {
  const m = String(motivo ?? '').trim()
  if (m.length < MOTIVO_MIN) return { ok: false, error: `Cancelar una atención exige un motivo (mínimo ${MOTIVO_MIN} caracteres).` }
  if (m.length > MOTIVO_MAX) return { ok: false, error: `El motivo admite hasta ${MOTIVO_MAX} caracteres.` }
  if (!supervisorId) return { ok: false, error: 'Elija al supervisor que autoriza.' }
  if (supervisorId === usuarioId) return { ok: false, error: 'La clave debe ser de otra persona: quien cancela no se autoriza a sí mismo.' }
  if (!/^[0-9]{4,8}$/.test(String(pin ?? ''))) return { ok: false, error: 'Teclee el PIN del supervisor (4 a 8 dígitos).' }
  return { ok: true, motivo: m }
}

/** Clase de una atención para el reporte: con_ticket · cancelada · vencida (abierta más del umbral) · en_curso. */
export function claseAtencion(a, umbralMin = 120, ahoraMs = Date.now()) {
  if (a.estado === 'cerrada_con_ticket') return 'con_ticket'
  if (a.estado === 'cancelada') return 'cancelada'
  return ahoraMs - new Date(a.inicio_en).getTime() > umbralMin * 60000 ? 'vencida' : 'en_curso'
}

/** % de atenciones terminadas sin ticket (canceladas + vencidas) sobre las que ya no están en curso. */
export function pctSinTicket({ canceladas = 0, vencidas = 0, con_ticket = 0 }) {
  const base = canceladas + vencidas + con_ticket
  return base ? Math.round((1000 * (canceladas + vencidas)) / base) / 10 : null
}
export const muestraPequena = total => total < 10

/** Servicios sin cobro estimados: la diferencia de piezas entre las piezas que consume un servicio (12 usados − 10 esperados, 1 por servicio = 2). */
export function serviciosSinCobro({ real, teorico, servicios }) {
  const dif = real - teorico
  if (!(teorico > 0 && servicios > 0 && dif > 0)) return 0
  return Math.round(dif / (teorico / servicios))
}

/** Cuadre de un insumo en un periodo: teórico = servicios × consumo esperado; real = salidas del insumo. */
export function cuadreInsumo({ servicios, consumoPorServicio, real, costo = 0, tolerancia = 0 }) {
  const teorico = servicios * consumoPorServicio
  const diferencia = real - teorico
  return {
    teorico, real, diferencia,
    valor: Math.round(diferencia * costo * 100) / 100,
    serviciosSinCobro: serviciosSinCobro({ real, teorico, servicios }),
    estado: Math.abs(diferencia) <= tolerancia ? 'cuadra' : diferencia > 0 ? 'consumo_mayor' : 'consumo_menor',
  }
}

/** Tipos de movimiento que cuentan como consumo (todas las salidas menos traspasos a otra sucursal y devoluciones al proveedor). */
export const NO_ES_CONSUMO = ['traspaso_salida', 'devolucion_proveedor']
export const consumoReal = (movs, { incluirAjustes = true } = {}) => movs
  .filter(m => m.cantidad < 0 && !NO_ES_CONSUMO.includes(m.tipo) && (incluirAjustes || !['ajuste', 'conteo'].includes(m.tipo)))
  .reduce((s, m) => s - m.cantidad, 0)

export const duracionMin = (inicio, fin) => Math.round(((new Date(fin) - new Date(inicio)) / 60000) * 100) / 100

/**
 * Cruce de ocupación (espejo de piefirme_app.ctl_ocupacion_cruce_dia): cada ocupación de duración ≥ mínimo toma el ticket de servicio más cercano
 * a su fin dentro de ±ventana que nadie haya tomado; las que quedan sin ticket son cobros faltantes (con sus horas exactas).
 */
export function cruceOcupacion(ocupaciones, tickets, { minimoMin = 5, ventanaMin = 60 } = {}) {
  const ms = x => new Date(x).getTime(), v = ventanaMin * 60000
  const validas = ocupaciones.filter(o => o.fin && duracionMin(o.inicio, o.fin) >= minimoMin).sort((a, b) => ms(a.inicio) - ms(b.inicio))
  const usados = new Set(), faltantes = []
  for (const o of validas) {
    let mejor = null
    for (const t of tickets) {
      if (usados.has(t.id) || ms(t.cobrada_en) < ms(o.inicio) - v || ms(t.cobrada_en) > ms(o.fin) + v) continue
      if (!mejor || Math.abs(ms(t.cobrada_en) - ms(o.fin)) < Math.abs(ms(mejor.cobrada_en) - ms(o.fin))) mejor = t
    }
    if (mejor) usados.add(mejor.id); else faltantes.push({ inicio: o.inicio, fin: o.fin, duracion_min: duracionMin(o.inicio, o.fin) })
  }
  return { ocupaciones: validas.length, menoresAlMinimo: ocupaciones.filter(o => o.fin).length - validas.length, tickets: tickets.length, cobrosFaltantes: faltantes.length, faltantes }
}

/** Hora legible en la zona de la clínica (el servidor entrega UTC). */
export function horaLocal(iso, zona = 'America/Mexico_City') {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-MX', { timeZone: zona, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
export const horasMinutos = min => (min == null ? '—' : min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)
