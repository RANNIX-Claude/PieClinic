// Cierres de turno y de día (Etapa 4). ESPEJO de las reglas que hace cumplir el servidor (migraciones 230–233): sirve para pintar y para
// evitar viajes de ida y vuelta; la AUTORIDAD es la base de datos. Funciones puras (sin red) para poder probarlas con node --test.
// Montos en centavos enteros: nunca punto flotante para sumar dinero.

export const TIPOS_CIERRE = ['apertura', 'turno', 'dia', 'semanal']
export const NOMBRE_TIPO_CIERRE = { apertura: 'Apertura', turno: 'Cierre de turno', dia: 'Cierre de día', semanal: 'Cierre semanal' }
export const TIPOS_CAPTURA = ['numero', 'denominaciones', 'conteo_piezas', 'solo_foto', 'numero_y_foto']
export const NOMBRE_TIPO_CAPTURA = {
  numero: 'Número', denominaciones: 'Desglose por denominación', conteo_piezas: 'Conteo de piezas', solo_foto: 'Solo foto (evidencia)', numero_y_foto: 'Número y foto',
}
export const NOMBRE_ESTADO_CIERRE = { en_captura: 'En captura', cerrado: 'Cerrado', entrega_no_aceptada: 'Entrega no aceptada' }
export const NOMBRE_ESTADO_ENTREGA = { pendiente: 'Pendiente de aceptar', aceptada: 'Aceptada', aceptada_con_diferencia: 'Aceptada con diferencia', liberada: 'Liberada sin aceptación' }

/** Billetes y monedas MXN que acepta el desglose (igual que piefirme_app.ctl_denominaciones_validas). */
export const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5]

const centavos = n => Math.round(Number(n) * 100)

/** Total de un desglose [{denominacion, cantidad}] en pesos. En el desglose NO existe campo de total: el total es siempre esta suma. */
export function totalDenominaciones(desglose = []) {
  return desglose.reduce((s, d) => s + centavos(d.denominacion) * (Number(d.cantidad) || 0), 0) / 100
}

/** Mismas validaciones que el servidor (ctl_cierre_capturar con denominaciones). */
export function validarDesglose(desglose) {
  if (!Array.isArray(desglose) || desglose.length === 0) return { ok: false, error: 'Capture el desglose por denominación' }
  const vistas = new Set()
  for (const d of desglose) {
    if (!DENOMINACIONES.includes(Number(d.denominacion))) return { ok: false, error: `Denominación no válida: ${d.denominacion}` }
    const c = Number(d.cantidad)
    if (!Number.isInteger(c) || c < 0 || c > 100000) return { ok: false, error: `Cantidad no válida para ${d.denominacion}` }
    if (vistas.has(Number(d.denominacion))) return { ok: false, error: `La denominación ${d.denominacion} viene repetida` }
    vistas.add(Number(d.denominacion))
  }
  return { ok: true }
}

/**
 * ¿La entrada de un punto es válida para su tipo de captura? Replica ctl_cierre_capturar:
 *  · denominaciones: solo desglose, y se RECHAZA un total tecleado (no existe campo de total)
 *  · numero / conteo_piezas / numero_y_foto: un valor ≥ 0
 *  · solo_foto: sin valor
 */
export function validarCapturaPunto(tipoCaptura, { valor = null, denominaciones = null } = {}) {
  if (tipoCaptura === 'denominaciones') {
    if (valor !== null && valor !== undefined && valor !== '') return { ok: false, error: 'En el desglose por denominación no existe un campo de total: el total es la suma de lo contado' }
    return validarDesglose(denominaciones)
  }
  if (denominaciones) return { ok: false, error: 'Este punto no lleva desglose por denominación' }
  if (tipoCaptura === 'solo_foto') return valor === null || valor === undefined || valor === '' ? { ok: true } : { ok: false, error: 'Este punto es solo evidencia (foto): no lleva valor' }
  const n = Number(valor)
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(n) || n < 0) return { ok: false, error: 'Capture un valor igual o mayor a 0' }
  return { ok: true }
}

/**
 * Puntos que aplican a un cierre (espejo de ctl_cierre_abrir): activos, vigentes hoy, de la sucursal y del tipo, ordenados.
 * @param {object[]} puntos filas de ctl_punto_control
 */
export function resolverPuntos(puntos, { sucursalId, tipo }) {
  const flag = { apertura: 'aplica_apertura', turno: 'aplica_turno', dia: 'aplica_dia', semanal: 'aplica_semanal' }[tipo]
  if (!flag) return []
  return puntos
    .filter(p => p.activo && p.vigente_hasta == null && (p.sucursales == null || p.sucursales.includes(sucursalId)) && p[flag])
    .sort((a, b) => (a.orden - b.orden) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
}

/** Instantánea del checklist que se guarda al abrir el cierre (criterio 22). */
export const instantanea = puntos => puntos.map(p => ({ punto_id: p.id, grupo_id: p.grupo_id, version: p.version }))

/** Puntos con los que se abrió un cierre, con su versión de entonces (no la vigente hoy). */
export function puntosDeCierre(snapshot, todosLosPuntos) {
  const porId = new Map(todosLosPuntos.map(p => [p.id, p]))
  return snapshot.map(s => porId.get(s.punto_id)).filter(Boolean)
}

/** Avance del recorrido (barra de progreso) y si ya se puede cerrar: todos los obligatorios completos. */
export function progresoRecorrido(puntos) {
  const total = puntos.length
  const hechos = puntos.filter(p => p.completo).length
  const oblig = puntos.filter(p => p.obligatorio)
  const faltan = oblig.filter(p => !p.completo)
  return { total, hechos, obligatorios: oblig.length, faltan: faltan.map(p => p.nombre), puedeCerrar: faltan.length === 0, porcentaje: total ? Math.round((hechos / total) * 100) : 0 }
}

/** Siguiente punto sin completar (para retomar donde se iba). */
export const siguientePendiente = puntos => puntos.findIndex(p => !p.completo)

/** Tolerancia aplicable (espejo de ctl_tolerancia_punto): efectivo y kits salen de la configuración; el resto, del punto. */
export function toleranciaPunto(punto, config = {}) {
  if (punto.formula_esperado === 'efectivo_esperado') return Number(config.tolerancia_efectivo ?? 20)
  if (punto.formula_esperado === 'kits_usados') return Number(config.tolerancia_kits ?? 0)
  return Number(punto.tolerancia ?? 0)
}

/** diferencia = calculado − esperado; dentro de tolerancia si |diferencia| ≤ tolerancia. Sin esperado no hay veredicto. */
export function evaluarDiferencia(calculado, esperado, tolerancia) {
  if (esperado === null || esperado === undefined || calculado === null || calculado === undefined) return { diferencia: null, dentro: null }
  const diferencia = (centavos(calculado) - centavos(esperado)) / 100
  return { diferencia, dentro: Math.abs(diferencia) <= Number(tolerancia) }
}

/** Cuadre de kits (F3.4): usados = anterior + recibido − quedan; servicios sin cobro = usados − esperados por los servicios cobrados. */
export function cuadreKits({ anterior = 0, recibido = 0, quedan, serviciosCobrados, kitsPorServicio = 1, tolerancia = 0 }) {
  const usados = Number(anterior) + Number(recibido) - Number(quedan)
  const esperado = Number(serviciosCobrados) * Number(kitsPorServicio)
  const sinCobro = usados - esperado
  return { usados, esperado, sinCobro, dentro: Math.abs(sinCobro) <= tolerancia, alerta: sinCobro > tolerancia ? `${sinCobro} servicio(s) sin cobro` : null }
}

/** ¿La toma fija aplica a este tipo de cierre? (cierre_apertura → apertura, turno y día; semanal → semanal; ambos → todos). */
export function aplicaToma(aplica, tipoCierre) {
  if (aplica === 'ambos') return true
  return tipoCierre === 'semanal' ? aplica === 'semanal' : aplica === 'cierre_apertura'
}

/** Tipo de caso que abre un punto fuera de tolerancia (espejo del servidor). */
export const tipoCasoDeFormula = formula => (formula === 'kits_usados' ? 'diferencia_kits' : 'diferencia_efectivo')

/** Una entrega cuadra solo si el monto que contó quien recibe es EXACTAMENTE el que confirmó quien entrega. */
export const entregaCuadra = (montoEntregado, montoRecibido) => centavos(montoEntregado) === centavos(montoRecibido)

/** ¿Quien recibe puede firmar? No puede ser quien entrega (separación de funciones). */
export const puedeAceptarEntrega = (usuarioEntrega, usuarioActual) => !!usuarioActual && usuarioActual !== usuarioEntrega

/** Estado en el que queda el cierre al cerrarlo (espejo de ctl_cierre_cerrar). */
export const estadoAlCerrar = ({ tipo, conEntrega }) => ((conEntrega ?? tipo === 'turno') ? 'entrega_no_aceptada' : 'cerrado')

/** Campos que el servidor NUNCA devuelve a quien captura el cierre. */
export const CAMPOS_ESPERADO = ['valor_esperado', 'diferencia', 'dentro_tolerancia', 'valor_calculado', 'tolerancia', 'esperado', 'monto_entregado', 'corte']
export const tieneCamposEsperado = obj => {
  const visita = v => (Array.isArray(v) ? v.some(visita) : v && typeof v === 'object' ? Object.entries(v).some(([k, x]) => CAMPOS_ESPERADO.includes(k) || visita(x)) : false)
  return visita(obj)
}
