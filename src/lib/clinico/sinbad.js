// Pie diabético: puntaje SINBAD, resumen de monofilamento, ITB y sugerencia de riesgo (P-010, P-011).
// Las escalas son APOYO a la decisión clínica; no emiten diagnóstico. La categoría de riesgo solo se sugiere
// cuando la clínica activó el parámetro (apagado hasta que un podólogo asesor valide los criterios).

export const PROFUNDIDADES = [
  { value: 'piel', label: 'Piel' },
  { value: 'subcutaneo', label: 'Tejido subcutáneo' },
  { value: 'musculo_tendon', label: 'Músculo / tendón' },
  { value: 'hueso_articulacion', label: 'Hueso / articulación' },
]

export const SITIOS_MONOFILAMENTO = [
  { value: 'dedo1', label: '1er dedo' }, { value: 'dedo3', label: '3er dedo' }, { value: 'dedo5', label: '5º dedo' },
  { value: 'mt1', label: 'Cabeza MT 1' }, { value: 'mt3', label: 'Cabeza MT 3' }, { value: 'mt5', label: 'Cabeza MT 5' },
  { value: 'mediopie_medial', label: 'Medio pie medial' }, { value: 'mediopie_lateral', label: 'Medio pie lateral' },
  { value: 'talon', label: 'Talón' }, { value: 'dorso', label: 'Dorso' },
]

const bit = v => (v === 1 || v === true ? 1 : 0)

/** Suma 0–6 de los seis ítems S, I, N, B, A, D (cada uno 0 o 1). Los ítems vacíos cuentan 0 (igual que la columna generada de la BD). */
export function puntajeSinbad({ s, i, n, b, a, d } = {}) {
  return bit(s) + bit(i) + bit(n) + bit(b) + bit(a) + bit(d)
}

/**
 * Propone los seis ítems a partir de lo capturado (el podólogo puede corregirlos).
 * region: 'antepie' | 'dedo' → S=0; 'mediopie' | 'talon' → S=1.
 * pulsosPedales: arreglo con 'presente' | 'disminuido' | 'ausente' | 'no_evaluado' (pedios y tibiales).
 */
export function sugerirSinbad({ region, pulsosPedales = [], sensibilidadProtectora, infeccion, areaCm2, profundidad } = {}) {
  const s = region === 'mediopie' || region === 'talon' ? 1 : 0
  const evaluados = pulsosPedales.filter(p => p && p !== 'no_evaluado')
  // Isquemia (I): 1 si no hay ningún pulso pedal palpable entre los evaluados
  const i = evaluados.length > 0 && !evaluados.includes('presente') ? 1 : 0
  const n = sensibilidadProtectora === 'ausente' ? 1 : 0
  const b = infeccion && infeccion !== 'sin_infeccion' ? 1 : 0
  const a = Number(areaCm2) >= 1 ? 1 : 0
  const d = profundidad === 'musculo_tendon' || profundidad === 'hueso_articulacion' ? 1 : 0
  return { s, i, n, b, a, d }
}

export const DESCRIPCION_SINBAD = {
  s: 'S · Sitio: antepié = 0, medio-retropié = 1',
  i: 'I · Isquemia: ≥ 1 pulso pedal palpable = 0',
  n: 'N · Neuropatía: sensibilidad protectora intacta = 0',
  b: 'B · Infección bacteriana: ausente = 0',
  a: 'A · Área: < 1 cm² = 0',
  d: 'D · Profundidad: piel/subcutáneo = 0',
}

/** Resumen por pie del monofilamento: { D: { evaluados, sinSensibilidad }, I: {...} }. `siente` false = sin sensibilidad. */
export function resumenMonofilamento(sitios = []) {
  const r = { D: { evaluados: 0, sinSensibilidad: 0 }, I: { evaluados: 0, sinSensibilidad: 0 } }
  for (const x of sitios) {
    const p = r[x.pie]
    if (!p || x.siente === null || x.siente === undefined) continue
    p.evaluados++
    if (!x.siente) p.sinSensibilidad++
  }
  return r
}

/** Sensibilidad protectora sugerida: ausente si falla ≥ 1 de los sitios evaluados en algún pie (criterio práctico; el podólogo confirma). */
export function sensibilidadProtectoraSugerida(sitios = []) {
  const r = resumenMonofilamento(sitios)
  const evaluados = r.D.evaluados + r.I.evaluados
  if (!evaluados) return null
  return r.D.sinSensibilidad + r.I.sinSensibilidad > 0 ? 'ausente' : 'intacta'
}

/** ITB: P-011 «nunca 0». Vacío, 0 o no numérico → null (no evaluado). */
export function normalizarItb(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
/** Lectura orientativa del ITB (apoyo, no diagnóstico). */
export function lecturaItb(v) {
  const n = normalizarItb(v)
  if (n === null) return 'No evaluado'
  if (n > 1.4) return 'Posible calcificación arterial (>1.40)'
  if (n >= 0.9) return 'Normal (0.90–1.40)'
  if (n >= 0.7) return 'Enfermedad arterial leve (0.70–0.89)'
  if (n >= 0.4) return 'Enfermedad arterial moderada (0.40–0.69)'
  return 'Enfermedad arterial grave (<0.40)'
}

export const FRECUENCIAS_REVISION = [
  { value: 'cada_1_mes', label: 'Cada mes', dias: 30 },
  { value: 'cada_2_meses', label: 'Cada 2 meses', dias: 60 },
  { value: 'cada_3_meses', label: 'Cada 3 meses', dias: 90 },
  { value: 'cada_6_meses', label: 'Cada 6 meses', dias: 180 },
  { value: 'anual', label: 'Anual', dias: 365 },
]

/** Suma `dias` a 'YYYY-MM-DD' (UTC, sin saltos por zona horaria). */
export function sumarDias(fechaISO, dias) {
  const [y, m, d] = String(fechaISO).slice(0, 10).split('-').map(Number)
  if (!y) return null
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}
export const proximaRevision = (fechaISO, frecuencia) => {
  const f = FRECUENCIAS_REVISION.find(x => x.value === frecuencia)
  return f ? sumarDias(fechaISO, f.dias) : null
}

/**
 * Categoría de riesgo sugerida (IWGDF 2023, solo si `activo`; P-010). Devuelve null cuando está apagada.
 * 0 sin LOPS ni EAP · 1 LOPS o EAP · 2 LOPS+EAP, LOPS+deformidad o EAP+deformidad · 3 úlcera o amputación previa.
 */
export function sugerirRiesgo({ lops, eap, deformidad, ulceraPrevia, amputacionPrevia } = {}, { activo = false } = {}) {
  if (!activo) return null
  if (ulceraPrevia || amputacionPrevia) return 3
  const n = [lops, eap, deformidad].filter(Boolean).length
  if (n >= 2) return 2
  if (lops || eap) return 1
  return 0
}
export const FRECUENCIA_POR_RIESGO = { 0: 'anual', 1: 'cada_6_meses', 2: 'cada_3_meses', 3: 'cada_1_mes' }
