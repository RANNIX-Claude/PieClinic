// Geometría del mapa del pie (4 vistas: D/I × dorsal/plantar). Coordenadas en un lienzo de 100 × 220.
// Los códigos de zona son los de catalogo_zonas_pie (033). Se dibuja el pie derecho en vista dorsal con el
// primer dedo a la izquierda; las demás vistas se obtienen espejando (I dorsal = espejo; plantar = espejo del dorsal).

export const ANCHO = 100
export const ALTO = 220

export const CONTORNO = 'M22 40 C16 62 20 100 28 130 C30 150 26 182 38 200 C50 214 70 212 74 190 C78 160 82 120 82 80 C82 62 78 50 72 47 C60 44 40 38 22 40 Z'

const dedos = [
  { codigo: 'dedo1', nombre: '1.er dedo (hallux)', f: 'c', cx: 28, cy: 31, r: 9.5 },
  { codigo: 'dedo2', nombre: '2.º dedo', f: 'c', cx: 44, cy: 24, r: 6.5 },
  { codigo: 'dedo3', nombre: '3.er dedo', f: 'c', cx: 55, cy: 28, r: 6 },
  { codigo: 'dedo4', nombre: '4.º dedo', f: 'c', cx: 65, cy: 34, r: 5.5 },
  { codigo: 'dedo5', nombre: '5.º dedo', f: 'c', cx: 74, cy: 42, r: 5 },
]
const unas = dedos.map(d => ({ codigo: d.codigo.replace('dedo', 'una'), nombre: `Uña ${d.codigo.slice(4)}.º dedo`, f: 'e', cx: d.cx, cy: d.cy - d.r * 0.35, rx: d.r * 0.55, ry: d.r * 0.4 }))

export const ZONAS_DORSAL = [
  { codigo: 'dorso_pie', nombre: 'Dorso del pie', f: 'r', x: 18, y: 46, w: 70, h: 110 },
  { codigo: 'antepie_dorsal', nombre: 'Antepié dorsal', f: 'r', x: 18, y: 46, w: 70, h: 48 },
  { codigo: 'mediopie_medial', nombre: 'Medio pie medial (arco)', f: 'r', x: 18, y: 94, w: 30, h: 56 },
  { codigo: 'mediopie_lateral', nombre: 'Medio pie lateral', f: 'r', x: 48, y: 94, w: 40, h: 56 },
  { codigo: 'talon_posterior', nombre: 'Talón posterior', f: 'r', x: 22, y: 150, w: 56, h: 66 },
  { codigo: 'tobillo', nombre: 'Tobillo', f: 'r', x: 22, y: 208, w: 56, h: 10, fuera: true },
  ...dedos, ...unas,
]

export const ZONAS_PLANTAR = [
  { codigo: 'antepie_plantar', nombre: 'Antepié plantar (cabezas metatarsianas)', f: 'r', x: 18, y: 46, w: 70, h: 48 },
  { codigo: 'mt1', nombre: 'Cabeza MT 1', f: 'c', cx: 30, cy: 66, r: 6.5 },
  { codigo: 'mt2', nombre: 'Cabeza MT 2', f: 'c', cx: 42, cy: 62, r: 5.5 },
  { codigo: 'mt3', nombre: 'Cabeza MT 3', f: 'c', cx: 53, cy: 63, r: 5.5 },
  { codigo: 'mt4', nombre: 'Cabeza MT 4', f: 'c', cx: 63, cy: 66, r: 5.5 },
  { codigo: 'mt5', nombre: 'Cabeza MT 5', f: 'c', cx: 72, cy: 70, r: 5.5 },
  { codigo: 'mediopie_medial', nombre: 'Medio pie medial (arco)', f: 'r', x: 18, y: 94, w: 30, h: 56 },
  { codigo: 'mediopie_lateral', nombre: 'Medio pie lateral', f: 'r', x: 48, y: 94, w: 40, h: 56 },
  { codigo: 'talon', nombre: 'Talón', f: 'r', x: 22, y: 150, w: 56, h: 66 },
  ...dedos,
]

export const zonasDeVista = vista => (vista === 'plantar' ? ZONAS_PLANTAR : ZONAS_DORSAL)
export const NOMBRES_ZONA = Object.fromEntries([...ZONAS_DORSAL, ...ZONAS_PLANTAR].map(z => [z.codigo, z.nombre]))
export const nombreZona = codigo => NOMBRES_ZONA[codigo] ?? codigo ?? '—'

/** ¿Hay que espejar la vista? Dorsal-D es la base; I dorsal y D plantar se espejan; I plantar vuelve a la base. */
export const espejar = (pie, vista) => (vista === 'dorsal' ? pie === 'I' : pie === 'D')

/** Región (para SINBAD: S = sitio) de un código de zona. */
export function regionDeZona(codigo) {
  if (!codigo) return null
  if (/^(dedo|una)\d/.test(codigo) || codigo === 'interdigital') return 'dedo'
  if (codigo.startsWith('antepie') || /^mt\d/.test(codigo)) return 'antepie'
  if (codigo.startsWith('mediopie')) return 'mediopie'
  if (codigo.startsWith('talon')) return 'talon'
  return codigo === 'tobillo' ? 'tobillo' : 'dorso'
}

/** Combinaciones válidas (pie, vista) en el orden del formato en papel: D dorsal, I dorsal, D plantar, I plantar. */
export const VISTAS_FORMATO = [['D', 'dorsal'], ['I', 'dorsal'], ['D', 'plantar'], ['I', 'plantar']]

/** Siguiente número de hallazgo de una consulta. */
export const siguienteNumero = hallazgos => (hallazgos.reduce((m, h) => Math.max(m, Number(h.numero) || 0), 0) + 1)
