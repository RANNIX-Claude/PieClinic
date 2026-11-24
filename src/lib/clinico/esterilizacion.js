// Esterilización: estado esperado del lote (P-023) y uso del kit. La BD decide; esto anticipa la propuesta y valida en pantalla.

/**
 * químico no viró → rechazado · biológico positivo → bloqueado · químico viró + biológico negativo/no aplica → liberado
 * · químico viró + biológico pendiente → liberado_condicionado.
 */
export function estadoLoteSugerido({ indicador_quimico, indicador_biologico }) {
  if (indicador_quimico === 'no_viro') return 'rechazado'
  if (indicador_biologico === 'positivo') return 'bloqueado'
  if (indicador_biologico === 'pendiente') return 'liberado_condicionado'
  return indicador_quimico === 'viro' ? 'liberado' : 'registrado'
}

export const loteUsable = (lote, hoyISO) =>
  ['liberado', 'liberado_condicionado'].includes(lote?.estado) && (!lote?.esteril_hasta || lote.esteril_hasta >= hoyISO)

/** Un kit solo se usa si está «esterilizado» y su lote es usable; después pasa a «en_uso» y requiere nuevo ciclo (P-023). */
export function kitUsable(kit, lote, hoyISO) {
  if (!kit || kit.estado !== 'esterilizado') return { ok: false, motivo: kit?.estado === 'en_uso' ? 'El kit ya está en uso: necesita un nuevo ciclo de esterilización.' : 'El kit no está esterilizado.' }
  if (!loteUsable(lote, hoyISO)) return { ok: false, motivo: lote?.estado === 'bloqueado' ? 'El lote está bloqueado (indicador biológico positivo).' : 'El lote no está liberado o su esterilidad venció.' }
  return { ok: true, motivo: null }
}

/** Días de vigencia de esterilidad según el ciclo (ajustable por la clínica; propuesta 30 días). */
export function esterilHastaSugerido(fechaISO, dias = 30) {
  const [y, m, d] = String(fechaISO).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** El resultado biológico se espera a las 24 h: avisa si ya venció sin resultado. */
export const biologicoVencidoSinResultado = (lote, ahora = new Date()) =>
  lote?.indicador_biologico === 'pendiente' && new Date(lote.fecha_hora).getTime() < ahora.getTime() - 24 * 3600 * 1000

export const CICLOS = [
  { value: 'instrumental_envuelto', label: 'Instrumental envuelto', temp: 134, bar: 2.1, min: 4 },
  { value: 'textil_curacion', label: 'Textil / curación', temp: 121, bar: 1.1, min: 15 },
  { value: 'instrumental_sin_envolver', label: 'Instrumental sin envolver', temp: 134, bar: 2.1, min: 3 },
  { value: 'otro', label: 'Otro', temp: '', bar: '', min: '' },
]
