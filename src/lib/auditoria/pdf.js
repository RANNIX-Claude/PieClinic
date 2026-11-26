// Generador de PDF mínimo, SIN dependencias (el repo no tiene librería PDF: sus «PDF» son impresión del navegador). Lo necesita el reporte mensual de dos páginas, que debe
// DESCARGARSE como archivo y salir siempre con las mismas dos páginas, y la exportación a PDF de la consulta de diferencias.
// Qué hace: páginas A4 con texto (Helvetica y Helvetica-Bold, codificación WinAnsi: acentos y eñes), líneas y rectángulos de color. Coordenadas con origen ARRIBA a la izquierda,
// en puntos (1 pt = 1/72 in). Qué NO hace: imágenes, otras fuentes, compresión. Es suficiente para tablas y barras vectoriales.
const A4 = { ancho: 595.28, alto: 841.89 }

// Anchos de Helvetica (milésimas de em) para los caracteres 32–126; el resto de los acentuados usa el de su letra base.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]

/** Ancho en puntos de un texto a un tamaño dado. */
export function anchoTexto(txt, size = 10, bold = false) {
  const tabla = bold ? WB : W
  let t = 0
  for (const ch of String(txt ?? '')) {
    let c = ch.codePointAt(0)
    if (c < 32 || c > 126) { const base = ch.normalize('NFD').charCodeAt(0); c = base >= 32 && base <= 126 ? base : 63 }
    t += tabla[c - 32] ?? 556
  }
  return (t * size) / 1000
}

// Windows-1252 (WinAnsiEncoding): lo que pasa de Latin-1 y se usa en español.
const CP1252 = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 }
function aBytes(txt) {
  const out = []
  for (const ch of String(txt ?? '')) {
    const c = ch.codePointAt(0)
    if (c >= 32 && c <= 126) out.push(c)
    else if (CP1252[ch] != null) out.push(CP1252[ch])
    else if (c >= 0xa0 && c <= 0xff) out.push(c)
    else if (c === 9 || c === 10 || c === 13) out.push(32)
    else out.push(63)
  }
  return out
}
const hex = bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join('')
const n2 = v => (Math.round(v * 100) / 100).toString()
const color = ([r, g, b]) => `${n2(r / 255)} ${n2(g / 255)} ${n2(b / 255)}`

/** Parte un texto en líneas que quepan en `maxAncho` puntos. */
export function envolverTexto(txt, size, maxAncho, bold = false) {
  const lineas = []
  for (const parrafo of String(txt ?? '').split('\n')) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (anchoTexto(prueba, size, bold) <= maxAncho || !actual) actual = prueba
      else { lineas.push(actual); actual = palabra }
    }
    lineas.push(actual)
  }
  return lineas
}

/** Recorta un texto con «…» para que quepa en `maxAncho`. */
export function recortarTexto(txt, size, maxAncho, bold = false) {
  let t = String(txt ?? '')
  if (anchoTexto(t, size, bold) <= maxAncho) return t
  while (t.length > 1 && anchoTexto(`${t}…`, size, bold) > maxAncho) t = t.slice(0, -1)
  return `${t}…`
}

export class PdfDoc {
  constructor({ ancho = A4.ancho, alto = A4.alto, titulo = '', autor = 'Pie Firme' } = {}) {
    this.ancho = ancho; this.alto = alto; this.titulo = titulo; this.autor = autor
    this.paginas = []
    this.nuevaPagina()
  }
  nuevaPagina() { this.paginas.push([]); return this.paginas.length }
  get _ops() { return this.paginas[this.paginas.length - 1] }
  get numeroDePaginas() { return this.paginas.length }

  /** Texto en (x, y) con y = línea base medida desde arriba. align: left | right | center (x es el borde derecho o el centro). */
  texto(x, y, txt, { size = 10, bold = false, color: col = [20, 20, 20], align = 'left' } = {}) {
    const w = anchoTexto(txt, size, bold)
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    this._ops.push(`BT /${bold ? 'F2' : 'F1'} ${n2(size)} Tf ${color(col)} rg ${n2(px)} ${n2(this.alto - y)} Td <${hex(aBytes(txt))}> Tj ET`)
    return w
  }
  /** Párrafo envuelto; devuelve la y de la línea siguiente. */
  parrafo(x, y, txt, maxAncho, { size = 10, bold = false, color: col, interlineado = 1.25 } = {}) {
    for (const l of envolverTexto(txt, size, maxAncho, bold)) { this.texto(x, y, l, { size, bold, color: col }); y += size * interlineado }
    return y
  }
  linea(x1, y1, x2, y2, { color: col = [200, 200, 200], grosor = 0.6 } = {}) {
    this._ops.push(`${color(col)} RG ${n2(grosor)} w ${n2(x1)} ${n2(this.alto - y1)} m ${n2(x2)} ${n2(this.alto - y2)} l S`)
  }
  /** Rectángulo con (x, y) en la esquina superior izquierda. */
  rect(x, y, w, h, { relleno = null, borde = null, grosor = 0.6 } = {}) {
    const ops = []
    if (relleno) ops.push(`${color(relleno)} rg`)
    if (borde) ops.push(`${color(borde)} RG ${n2(grosor)} w`)
    ops.push(`${n2(x)} ${n2(this.alto - y - h)} ${n2(w)} ${n2(h)} re ${relleno && borde ? 'B' : relleno ? 'f' : 'S'}`)
    this._ops.push(ops.join(' '))
  }

  /** Construye el archivo. Devuelve Uint8Array. */
  generar() {
    const partes = []
    let largo = 0
    const offsets = []
    const emit = s => { const b = new TextEncoder().encode(s); partes.push(b); largo += b.length }   // los streams son ASCII (texto en hexadecimal)
    const obj = (n, cuerpo) => { offsets[n] = largo; emit(`${n} 0 obj\n${cuerpo}\nendobj\n`) }
    emit('%PDF-1.4\n%âãÏÓ\n'.replace(/[^\x00-\x7f]/g, '?'))
    const nPag = this.paginas.length
    // 1 catálogo · 2 páginas · 3 y 4 fuentes · 5 info · luego, por página, [página, contenido]
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    const kids = this.paginas.map((_, i) => `${6 + i * 2} 0 R`).join(' ')
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${nPag} >>`)
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    obj(5, `<< /Title <${hex(aBytes(this.titulo))}> /Author <${hex(aBytes(this.autor))}> /Producer (Pie Firme) >>`)
    this.paginas.forEach((ops, i) => {
      const contenido = ops.join('\n')
      obj(6 + i * 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(this.ancho)} ${n2(this.alto)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`)
      obj(7 + i * 2, `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`)
    })
    const total = 6 + nPag * 2
    const xref = largo
    let tabla = `xref\n0 ${total}\n0000000000 65535 f \n`
    for (let n = 1; n < total; n++) tabla += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
    emit(`${tabla}trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
    const salida = new Uint8Array(largo)
    let p = 0
    for (const b of partes) { salida.set(b, p); p += b.length }
    return salida
  }
}

/** Descarga un PDF generado en el navegador. */
export function descargarPdf(bytes, nombreArchivo) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  a.download = nombreArchivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
