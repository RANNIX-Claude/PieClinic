// Precio vigente por fecha y sede (P-067/P-068). Refleja public.precio_vigente: el precio de la sede gana sobre el de lista.
const FIN = '9999-12-31'
const hasta = p => p.vigente_hasta ?? FIN

/** Fila de `precios` vigente en `fecha` (YYYY-MM-DD) para el ítem y la sede; null si no hay. */
export function precioVigente(precios, { fecha, sedeId = null } = {}) {
  const f = fecha ?? new Date().toISOString().slice(0, 10)
  const candidatos = precios.filter(p => (p.sede_id == null || p.sede_id === sedeId) && p.vigente_desde <= f && hasta(p) >= f)
  candidatos.sort((a, b) => (b.sede_id != null) - (a.sede_id != null) || (a.vigente_desde < b.vigente_desde ? 1 : -1))
  return candidatos[0] ?? null
}

/** Situación de una versión de precio respecto a hoy: programado | vigente | historico. */
export function situacionPrecio(p, hoy = new Date().toISOString().slice(0, 10)) {
  if (p.vigente_desde > hoy) return 'programado'
  if (p.vigente_hasta == null || p.vigente_hasta >= hoy) return 'vigente'
  return 'historico'
}

const diaAnterior = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) }

/**
 * Nueva versión de precio: cierra la abierta anterior un día antes (como el trigger de la BD) y detecta traslapes
 * con versiones posteriores. Devuelve { ok, error, cierraId, cierraHasta, nueva }.
 */
export function nuevaVersionPrecio(precios, { vigente_desde, precio, sede_id = null, tipo_precio = 'fijo', motivo = 'Ajuste' }) {
  if (!(Number(precio) >= 0)) return { ok: false, error: 'Precio inválido' }
  const mismos = precios.filter(p => (p.sede_id ?? null) === sede_id)
  const abierta = mismos.find(p => p.vigente_hasta == null && p.vigente_desde < vigente_desde)
  const traslapa = mismos.some(p => p !== abierta && hasta(p) >= vigente_desde)
  if (traslapa) return { ok: false, error: 'Vigencia de precio traslapada: crea la nueva versión después de la última vigente' }
  return { ok: true, cierraId: abierta?.id ?? null, cierraHasta: abierta ? diaAnterior(vigente_desde) : null, nueva: { vigente_desde, precio: Number(precio), sede_id, tipo_precio, motivo } }
}
