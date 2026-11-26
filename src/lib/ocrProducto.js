// Sugerencias de nombre y código a partir de la foto de un producto nuevo (conteo inicial).
// La lectura del texto (OCR) corre en el navegador con tesseract.js: no hay llave ni servicio externo de IA. Lo que sale es SOLO una
// sugerencia: la persona la acepta, la corrige o la ignora. Las funciones puras de abajo se prueban con `node --test src/lib`.

const RUIDO = /^(contenido|content|net\b|neto|lote|lot\b|cad\b|caducidad|fabricado|hecho en|made in|ingredientes|modo de uso|uso externo|precio|www\.|http|tel\b|rfc|importado|distribuido|reg\.?\s|sanitario|c\.?p\.?\s|\d)/i
const soloLetras = t => (t.match(/\p{L}/gu) ?? []).length

/** «CREMA HIDRATANTE» → «Crema hidratante»; si ya trae minúsculas se respeta. */
export function acomodarMayusculas(t) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const letras = s.replace(/[^\p{L}]/gu, '')
  if (letras && letras === letras.toUpperCase()) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return s
}

/** EAN-13 válido (dígito verificador). */
export const ean13Valido = c => /^\d{13}$/.test(c) && ((10 - ([...c.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10) === Number(c[12])

/**
 * Código de barras impreso en la foto: tiras de 8 a 14 dígitos (el OCR puede separarlas con espacios o guiones).
 * Los EAN-13 con dígito verificador correcto van primero.
 */
export function codigosDeTexto(texto) {
  const salida = []
  for (const m of String(texto ?? '').matchAll(/\d(?:[ \t-]?\d){7,13}/g)) {
    const c = m[0].replace(/\D/g, '')
    if (c.length >= 8 && c.length <= 14 && !salida.includes(c)) salida.push(c)
  }
  return salida.sort((a, b) => Number(ean13Valido(b)) - Number(ean13Valido(a)))
}

/**
 * Nombres sugeridos a partir de las líneas del OCR: [{ text, confidence (0-100), altura (px) }, …] en orden de lectura.
 * Gana el texto más grande y más seguro, que en un empaque casi siempre es la marca o el nombre del producto.
 * Devuelve hasta 3 opciones: la mejor línea, la mejor línea con su vecina inmediata (nombre en dos renglones) y la siguiente mejor.
 */
export function nombresSugeridos(lineas, { max = 3 } = {}) {
  const buenas = (lineas ?? [])
    .map((l, i) => ({ i, texto: String(l.text ?? '').replace(/[|_~=<>{}[\]\\*#@]/g, ' ').replace(/\s+/g, ' ').trim(), conf: Number(l.confidence ?? 0), altura: Number(l.altura ?? 0) }))
    .filter(l => l.texto.length >= 4 && l.texto.length <= 60 && soloLetras(l.texto) / l.texto.length >= 0.6 && l.conf >= 55 && !RUIDO.test(l.texto))
    .map(l => ({ ...l, puntos: (l.altura || 10) * (l.conf / 100) * (soloLetras(l.texto) / l.texto.length) }))
    .sort((a, b) => b.puntos - a.puntos)
  const salida = []
  const poner = t => { const n = acomodarMayusculas(t); if (n && !salida.includes(n)) salida.push(n) }
  const [primera, ...resto] = buenas
  if (!primera) return []
  poner(primera.texto)
  const vecina = buenas.find(l => Math.abs(l.i - primera.i) === 1 && l.altura >= primera.altura * 0.6)
  if (vecina) { const a = acomodarMayusculas(primera.texto), b = acomodarMayusculas(vecina.texto); poner(vecina.i > primera.i ? `${a} ${b}` : `${b} ${a}`) }
  for (const l of resto) { if (salida.length >= max) break; poner(l.texto) }
  return salida.slice(0, max)
}

/** Lee el texto de una imagen (Blob/File/canvas) y devuelve { nombres, codigos, texto }. tesseract.js se descarga solo cuando se usa. */
export async function leerFotoProducto(imagen, { alAvanzar } = {}) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa', 1, { logger: m => { if (m?.status === 'recognizing text') alAvanzar?.(Math.round((m.progress ?? 0) * 100)) } })
  try {
    const { data } = await worker.recognize(imagen)
    const lineas = (data.lines ?? []).map(l => ({ text: l.text, confidence: l.confidence, altura: (l.bbox?.y1 ?? 0) - (l.bbox?.y0 ?? 0) }))
    return { nombres: nombresSugeridos(lineas), codigos: codigosDeTexto(data.text), texto: data.text ?? '' }
  } finally { await worker.terminate().catch(() => {}) }
}
