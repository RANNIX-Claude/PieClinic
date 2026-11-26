// Cierre guardado en el dispositivo (F6.1 retoma, F6.4 sin conexión). PURO. El teléfono guarda la lista de puntos (ctl_cierre_plantilla) y cada captura;
// de ahí sale el recorrido que se pinta, con la misma forma que el de la base (progresoRecorrido y siguientePendiente lo entienden).
// NUNCA contiene esperado, tolerancia ni diferencia: el servidor no se los entrega a quien captura.
import { validarCapturaPunto } from './cierres.js'

export const crearCierreLocal = ({ id, sucursalId, tipo, turnoId = null, plantilla, creado = new Date().toISOString() }) => ({
  id, sucursalId, tipo, turnoId, creado, estado: 'en_captura', folio: null, serverId: null,
  puntos: plantilla.puntos.map(p => ({ ...p })), tomas: plantilla.tomas ?? [], ladoLargo: plantilla.lado_largo ?? plantilla.ladoLargo ?? 1600,
  capturas: {},   // punto_id → { id, valor, denominaciones }
  fotos: {},      // punto_id → { n, tomas: { toma_id: true } }
})

const conTomas = p => !!p.toma_fija
const fotoOk = (c, p, f) => !p.requiere_foto ? true : !conTomas(p) ? f.n >= 1 : c.tomas.length > 0 && c.tomas.every(t => f.tomas[t.id])

export function puntoCompleto(c, p) {
  const cap = c.capturas[p.punto_id], f = c.fotos[p.punto_id] ?? { n: 0, tomas: {} }
  const valor = p.tipo_captura === 'denominaciones' ? !!cap && (cap.denominaciones?.length ?? 0) > 0 : p.requiere_valor ? cap?.valor != null : true
  return valor && fotoOk(c, p, f)
}
function falta(c, p) {
  const cap = c.capturas[p.punto_id], f = c.fotos[p.punto_id] ?? { n: 0, tomas: {} }
  if (p.tipo_captura === 'denominaciones') return cap ? null : 'Falta el desglose por denominación'
  if (p.requiere_valor && cap?.valor == null) return 'Falta el valor'
  if (!fotoOk(c, p, f)) return conTomas(p) ? 'Faltan fotos de tomas fijas' : 'Falta la foto'
  return null
}

/** Recorrido con la forma del servidor: { cierre, puntos:[…, completo, falta, captura, fotos, tomas] }. */
export function recorridoLocal(c) {
  return {
    cierre: { id: c.id, folio: c.folio, tipo: c.tipo, estado: c.estado, sucursal_id: c.sucursalId, turno_id: c.turnoId },
    puntos: c.puntos.map(p => {
      const f = c.fotos[p.punto_id] ?? { n: 0, tomas: {} }
      return { ...p, captura: c.capturas[p.punto_id] ?? null, fotos: f.n, completo: puntoCompleto(c, p), falta: falta(c, p),
               tomas: conTomas(p) ? c.tomas.map(t => ({ ...t, foto: !!f.tomas[t.id] })) : null }
    }),
  }
}

export function aplicarCaptura(c, puntoId, { id, valor = null, denominaciones = null }) {
  const p = c.puntos.find(x => x.punto_id === puntoId)
  if (!p) throw new Error('Ese punto no pertenece a este cierre')
  const v = validarCapturaPunto(p.tipo_captura, { valor, denominaciones })
  if (!v.ok) throw new Error(v.error)
  return { ...c, capturas: { ...c.capturas, [puntoId]: { id, valor, denominaciones } } }
}
export function aplicarFoto(c, puntoId, tomaId = null) {
  const f = c.fotos[puntoId] ?? { n: 0, tomas: {} }
  return { ...c, fotos: { ...c.fotos, [puntoId]: { n: f.n + 1, tomas: tomaId ? { ...f.tomas, [tomaId]: true } : f.tomas } } }
}
export const marcarEstado = (c, estado) => ({ ...c, estado })

/** Si el servidor retomó un cierre en captura (guardado parcial), se suma lo que ya tenía. */
export function fusionarServidor(c, rec) {
  if (!rec?.puntos) return c
  const capturas = { ...c.capturas }, fotos = { ...c.fotos }
  for (const p of rec.puntos) {
    if (p.captura && !capturas[p.punto_id]) capturas[p.punto_id] = { id: p.captura.id, valor: p.captura.valor == null ? null : Number(p.captura.valor), denominaciones: p.captura.denominaciones ?? null, deServidor: true }
    if (p.fotos > 0 && !(fotos[p.punto_id]?.n > 0)) fotos[p.punto_id] = { n: p.fotos, tomas: Object.fromEntries((p.tomas ?? []).filter(t => t.foto).map(t => [t.id, true])) }
  }
  return { ...c, capturas, fotos, folio: rec.cierre?.folio ?? c.folio, serverId: rec.cierre?.id ?? c.serverId }
}
