// Auditoría remota · avance en vivo (F2.3). Formato de lo que devuelve ctl_remota_avance (migración 213): solo cifras de avance, jamás diferencias.
export const NOMBRE_RESPUESTA = { sin_abrir: 'Sin abrir', en_curso: 'En curso', completa: 'Completa', parcial: 'Vencida con lo capturado', no_reportada: 'No reportada', cancelada: 'Cancelada' }
export const VARIANTE_RESPUESTA = { sin_abrir: 'a', en_curso: 'b', completa: 'v', parcial: 'a', no_reportada: 'r', cancelada: 'n' }

/** 3725 → «1 h 02 min»; 95 → «1 min 35 s». */
export function formatoDuracion(seg) {
  if (seg == null || !Number.isFinite(Number(seg))) return '—'
  const s = Math.max(0, Math.round(Number(seg)))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min ${String(r).padStart(2, '0')} s`
  return `${r} s`
}

/** Porcentaje de avance de una sucursal (productos capturados / pedidos). */
export const porcentajeAvance = (capturadas, enLista) => (enLista > 0 ? Math.min(100, Math.round((capturadas / enLista) * 100)) : 0)

/** ¿Hay que seguir consultando? Mientras exista alguna sucursal abierta. */
export const hayPendientes = av => Number(av?.resumen?.pendientes ?? 0) > 0

/** Frase resumen del grupo: «5 de 7 sucursales abrieron la sesión · 2 sin responder». */
export function resumenFrase(av) {
  const r = av?.resumen
  if (!r || !r.total) return 'Sin auditoría remota reciente.'
  const partes = [`${r.abrieron} de ${r.total} sucursales abrieron la sesión`, `${r.partidas_capturadas} partida(s) capturadas`]
  if (r.pendientes > 0) partes.push(`${r.pendientes} pendiente(s)`)
  if (r.expiradas > 0) partes.push(`${r.expiradas} expirada(s)`)
  if (r.no_reportadas > 0) partes.push(`${r.no_reportadas} sin respuesta`)
  return partes.join(' · ')
}
