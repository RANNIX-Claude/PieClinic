// Cadena de custodia (Etapa 7): reglas puras que la pantalla usa para avisar ANTES de enviar. La AUTORIDAD es el servidor (migraciones 250–253): todo lo de aquí
// se vuelve a validar allá. Nada de esto toca saldos, existencias ni lo que el sistema espera.
import { TOPE_CUSTODIA } from './config.js'

export const NOMBRE_VERIFICACION = {
  sello_intacto: 'Sello intacto',
  abierta_y_resellada: 'Se abrió y se resellaron',
  sello_roto: 'Llegó con el sello roto',
}
export const NOMBRE_ESTADO_SELLO = { vigente: 'Vigente', reemplazado: 'Reemplazado', roto_sin_registro: 'Roto sin registro de reapertura' }
export const NOMBRE_ESTADO_TALONARIO = { activo: 'Activo', consumido: 'Consumido', cancelado: 'Cancelado' }
export const NOMBRE_ESTADO_PIEZA = { en_sucursal: 'En sucursal', vendida: 'Vendida', retirada: 'Retirada' }
export const NOMBRE_ESTADO_TICKET = { capturado: 'Capturado', cancelado: 'Cancelado', faltante: 'Faltante' }

export const MOTIVO_TOPE_CUSTODIA =
  `El tope es de ${TOPE_CUSTODIA} productos en custodia por sucursal y lo valida la base de datos. Con más piezas el relevo de turno pasa de dos minutos a veinte, ` +
  'el personal termina capturando sin contar y eso genera evidencia falsa, que es peor que no tener control. Para agregar otro producto, retire uno antes.'

/** ¿Cabe otro en la custodia? Si no cabe, devuelve la explicación completa (nunca un rechazo mudo: criterio 7). */
export function evaluarTopeCustodia(activos) {
  const n = Number(activos) || 0
  if (n >= TOPE_CUSTODIA) return { ok: false, restantes: 0, mensaje: `Ya hay ${n} de ${TOPE_CUSTODIA} productos en custodia. ${MOTIVO_TOPE_CUSTODIA}` }
  return { ok: true, restantes: TOPE_CUSTODIA - n, mensaje: null }
}

/** Folios de sello y series: se comparan en mayúsculas y sin espacios en los extremos (igual que el servidor). */
export const normalizarFolio = s => (String(s ?? '').trim().toUpperCase() || null)
export const normalizarSerie = normalizarFolio

/** Peso con báscula contra el de caja llena. `tolPct` es la tolerancia configurada (± %). Devuelve null si falta algún dato. */
export function pesoCoincide(medido, esperado, tolPct = 5) {
  const m = Number(medido), e = Number(esperado)
  if (!Number.isFinite(m) || !Number.isFinite(e) || e <= 0 || m <= 0) return null
  const desviacion = Math.round((Math.abs(m - e) / e) * 10000) / 100
  return { ok: desviacion <= Number(tolPct), desviacion }
}

/** Rango de talonario: inicial ≤ final, hasta 2,000 folios y sin traslape con los vigentes (los cancelados no cuentan). */
export function validarRangoTalonario(inicial, final, existentes = []) {
  const a = Number(inicial), b = Number(final)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) return { ok: false, error: 'El folio final debe ser igual o mayor al inicial, y ambos mayores a cero.' }
  if (b - a + 1 > 2000) return { ok: false, error: 'Un talonario de más de 2,000 folios no es un talonario: registre varios.' }
  const choque = existentes.find(t => t.estado !== 'cancelado' && t.folio_inicial <= b && t.folio_final >= a)
  if (choque) return { ok: false, error: `El rango se traslapa con el talonario ${choque.folio_inicial} a ${choque.folio_final}: un folio impreso no puede existir en dos talonarios.` }
  return { ok: true }
}

/** ¿Este folio cae en un talonario activo de la sucursal? Devuelve el talonario o null. */
export const talonarioDelFolio = (folio, talonarios, sucursalId) =>
  talonarios.find(t => t.estado === 'activo' && t.sucursal_id === sucursalId && folio >= t.folio_inicial && folio <= t.folio_final) ?? null

/**
 * Continuidad de un talonario (misma regla que el servidor): si el siguiente en blanco es el N, los folios del inicial al N-1 deben estar todos
 * capturados (venta o cancelado). Un folio capturado desde el N en adelante es «adelantado»: el que se dijo en blanco ya se usó.
 * @param {{inicial:number, final:number, siguiente:number, tickets:{folio:number, estado:string}[]}} d
 */
export function continuidadTalonario({ inicial, final, siguiente, tickets }) {
  if (!Number.isInteger(siguiente) || siguiente < inicial || siguiente > final + 1) return { ok: false, error: `El siguiente folio en blanco debe estar entre ${inicial} y ${final + 1}.` }
  const hechos = new Set(tickets.filter(t => t.estado === 'capturado' || t.estado === 'cancelado').map(t => t.folio))
  const marcados = new Set(tickets.filter(t => t.estado === 'faltante').map(t => t.folio))
  const faltantes = []
  for (let f = inicial; f < siguiente; f++) if (!hechos.has(f)) faltantes.push(f)
  const adelantados = [...hechos].filter(f => f >= siguiente).sort((a, b) => a - b)
  return {
    ok: true, faltantes, adelantados,
    nuevos: faltantes.filter(f => !marcados.has(f)), yaMarcados: faltantes.filter(f => marcados.has(f)),
    continuo: faltantes.length === 0 && adelantados.length === 0,
    abreCaso: faltantes.some(f => !marcados.has(f)) || adelantados.length > 0,
  }
}

/** Texto corto con los folios que faltan: «18», «18 y 21», «3, 18 y 21». */
export function listaFolios(folios) {
  const f = [...folios]
  if (f.length <= 1) return f.join('')
  return `${f.slice(0, -1).join(', ')} y ${f.at(-1)}`
}

/** Un renglón del ticket manual: descripción (o producto) y cantidad mayor a cero. */
export const renglonTicketValido = r => !!r && (String(r.descripcion ?? '').trim() !== '' || !!r.producto_id) && Number(r.cantidad) > 0

/** Valida un ticket manual antes de enviarlo (el servidor repite todo y valida el rango y el folio repetido). */
export function validarTicketManual({ folio, monto, productos, cancelado = false, hayFoto = false }) {
  if (!Number.isInteger(Number(folio)) || Number(folio) < 1) return { ok: false, error: 'Escriba el folio del ticket de papel.' }
  if (monto === '' || monto == null || !(Number(monto) >= 0)) return { ok: false, error: 'El monto debe ser cero o mayor.' }
  if (!cancelado) {
    if (!(Number(monto) > 0)) return { ok: false, error: 'Un ticket vendido lleva monto mayor a cero. Si el folio se anuló, márquelo como cancelado.' }
    if (!productos?.length || !productos.every(renglonTicketValido)) return { ok: false, error: 'Capture al menos un producto o servicio con su cantidad.' }
  }
  if (!hayFoto) return { ok: false, error: 'Falta la foto en vivo del ticket de papel.' }
  return { ok: true }
}

/** Revisión de una pieza antes de agregarla a la recepción. `producto` trae requiere_serie y requiere_sello (ctl_producto_captura). */
export function validarLineaRecepcion(l, producto) {
  if (!producto) return { ok: false, error: 'No se reconoce el producto.' }
  if (!producto.requiere_sello) return { ok: false, error: `«${producto.descripcion}» no lleva sello: la recepción con responsiva solo aplica a productos con sello (en el piloto, lo caro y en caja).` }
  if (producto.requiere_serie && !normalizarSerie(l.numero_serie)) return { ok: false, error: 'Esta pieza se identifica por su número de serie: capture la serie de ESTA pieza.' }
  if (!['sello_intacto', 'abierta_y_resellada', 'sello_roto'].includes(l.verificacion)) return { ok: false, error: 'Indique cómo se verificó: sello intacto, abierta y resellada, o sello roto.' }
  if (l.verificacion !== 'abierta_y_resellada' && !normalizarFolio(l.folio_sello)) return { ok: false, error: 'Capture el folio del sello que trae la pieza.' }
  if (l.verificacion === 'abierta_y_resellada' && !normalizarFolio(l.nuevo_folio_sello)) return { ok: false, error: 'Si se abrió, capture el folio del sello nuevo.' }
  if (l.verificacion === 'abierta_y_resellada' && normalizarFolio(l.nuevo_folio_sello) === normalizarFolio(l.folio_sello)) return { ok: false, error: 'El sello nuevo debe tener un folio distinto al anterior.' }
  if (!l.evidencia_id) return { ok: false, error: 'Falta la foto en vivo de la pieza.' }
  return { ok: true }
}

/** ¿Se pasó la misma foto a dos piezas? (cada pieza lleva su propia foto) */
export const fotosRepetidas = lineas => { const v = lineas.map(l => l.evidencia_id).filter(Boolean); return new Set(v).size !== v.length }

/** Venta del periodo contra lo esperado → % (solo la ve quien revisa). Nulo si no hay con qué comparar. */
export function proporcionVenta(venta, esperada) {
  const e = Number(esperada)
  if (!Number.isFinite(e) || e <= 0) return null
  return Math.round((Number(venta) / e) * 10000) / 100
}

/** Duración legible de una caída (minutos → «1 h 20 min»). */
export function duracionCaida(inicio, fin) {
  const ms = new Date(fin ?? Date.now()).getTime() - new Date(inicio).getTime()
  const min = Math.max(0, Math.round(ms / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}
