// Exportación a PDF de la consulta de diferencias, respetando los filtros activos. Horizontal, varias páginas, encabezado de totales y filtros en la primera.
// Tope de 1,500 renglones por PDF (un PDF de miles de páginas no se lee): el detalle completo va en Excel. Valores al costo.
import { PdfDoc, recortarTexto } from './pdf.js'
import { NOMBRE_ESTADO_AJUSTE } from './reportes.js'

export const TOPE_RENGLONES_PDF = 1500
const AZUL = [27, 63, 122], GRIS = [90, 98, 110], ROJO = [176, 42, 42], VERDE = [31, 122, 77]
const MARGEN = 30
const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const m = n => fmtMoneda.format(Number(n ?? 0))
const num = n => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(Number(n ?? 0))

/** d = respuesta de ctl_dif_consultar con exportar:true; filtrosTexto = describirFiltros(...); fmtFecha(iso) → texto en la zona de la clínica. */
export function armarPdfDiferencias(d, { filtrosTexto = '', organizacion = '', fmtFecha = x => String(x), generado = new Date() } = {}) {
  const doc = new PdfDoc({ ancho: 841.89, alto: 595.28, titulo: 'Diferencias de inventario', autor: organizacion || 'Pie Firme' })
  const cols = [
    { k: 'fecha', t: 'Fecha y hora', x: MARGEN, w: 82 }, { k: 'sucursal', t: 'Sucursal', x: MARGEN + 86, w: 100 }, { k: 'producto', t: 'Producto', x: MARGEN + 190, w: 190 },
    { k: 'fisica', t: 'Física', x: MARGEN + 384, w: 38, r: true }, { k: 'sistema', t: 'Sistema', x: MARGEN + 426, w: 42, r: true }, { k: 'dif', t: 'Dif. pzas', x: MARGEN + 472, w: 44, r: true },
    { k: 'valor', t: 'Dif. al costo', x: MARGEN + 520, w: 62, r: true }, { k: 'auditor', t: 'Auditor', x: MARGEN + 590, w: 80 }, { k: 'estado', t: 'Ajuste', x: MARGEN + 674, w: 108 },
  ]
  const ancho = doc.ancho - 2 * MARGEN
  const filas = d.filas.slice(0, TOPE_RENGLONES_PDF)
  const t = d.totales
  const encabezadoPagina = (n) => {
    doc.rect(0, 0, doc.ancho, 40, { relleno: AZUL })
    doc.texto(MARGEN, 26, 'Diferencias de inventario', { size: 15, bold: true, color: [255, 255, 255] })
    doc.texto(doc.ancho - MARGEN, 26, `${organizacion} · página ${n}`, { size: 8.5, color: [220, 228, 242], align: 'right' })
  }
  const cabeceraTabla = y => {
    doc.rect(MARGEN, y - 10, ancho, 15, { relleno: [238, 241, 246] })
    for (const c of cols) doc.texto(c.r ? c.x + c.w : c.x + 2, y, c.t, { size: 7.5, bold: true, color: GRIS, align: c.r ? 'right' : 'left' })
  }
  let pagina = 1
  encabezadoPagina(pagina)
  let y = 58
  doc.parrafo(MARGEN, y, filtrosTexto || 'Sin filtros', ancho, { size: 8.5, color: GRIS })
  y += 22
  const cajas = [['Faltantes', `${num(t.faltantes_piezas)} pzas · ${m(t.faltantes_valor)}`, ROJO], ['Sobrantes', `${num(t.sobrantes_piezas)} pzas · ${m(t.sobrantes_valor)}`, VERDE],
                 ['Casos pendientes de ajuste', String(t.casos_pendientes_ajuste), [217, 119, 6]], ['Renglones', `${d.total_filas}${d.total_filas > filas.length ? ` (se muestran ${filas.length})` : ''}`, [24, 28, 36]]]
  const wc = (ancho - 3 * 8) / 4
  cajas.forEach(([tit, val, col], i) => {
    const x = MARGEN + i * (wc + 8)
    doc.rect(x, y, wc, 38, { relleno: [247, 249, 252], borde: [225, 229, 236] })
    doc.texto(x + 8, y + 13, tit, { size: 7.5, color: GRIS, bold: true })
    doc.texto(x + 8, y + 30, val, { size: 11.5, bold: true, color: col })
  })
  y += 56
  cabeceraTabla(y)
  y += 15
  const limite = doc.alto - 36
  filas.forEach((f, i) => {
    if (y > limite) {
      doc.texto(MARGEN, doc.alto - 14, 'Valores al costo · hora de México', { size: 7, color: GRIS })
      doc.nuevaPagina(); pagina += 1; encabezadoPagina(pagina); y = 62; cabeceraTabla(y); y += 15
    }
    if (i % 2 === 0) doc.rect(MARGEN, y - 8.5, ancho, 12.5, { relleno: [250, 251, 253] })
    const v = {
      fecha: fmtFecha(f.fecha_hora), sucursal: f.sucursal, producto: f.producto, fisica: num(f.fisica), sistema: num(f.sistema), dif: `${Number(f.dif_piezas) > 0 ? '+' : ''}${num(f.dif_piezas)}`,
      valor: `${Number(f.dif_valor) > 0 ? '+' : Number(f.dif_valor) < 0 ? '−' : ''}${m(Math.abs(f.dif_valor))}`, auditor: f.auditor ?? '', estado: NOMBRE_ESTADO_AJUSTE[f.estado_ajuste] ?? f.estado_ajuste,
    }
    for (const c of cols) {
      const txt = recortarTexto(v[c.k], 7.5, c.w - 3)
      doc.texto(c.r ? c.x + c.w : c.x + 2, y, txt, { size: 7.5, align: c.r ? 'right' : 'left', color: c.k === 'valor' || c.k === 'dif' ? (Number(f.dif_piezas) < 0 ? ROJO : VERDE) : [24, 28, 36] })
    }
    y += 12.5
  })
  if (filas.length === 0) doc.texto(MARGEN + 2, y + 6, 'No hay diferencias con estos filtros.', { size: 9, color: GRIS })
  if (d.total_filas > filas.length) doc.texto(MARGEN, y + 14, `Se muestran ${filas.length} de ${d.total_filas} renglones: para el detalle completo exporte a Excel.`, { size: 8, color: GRIS })
  doc.texto(MARGEN, doc.alto - 14, `Valores al costo · hora de México · generado ${generado.toLocaleString('es-MX')}`, { size: 7, color: GRIS })
  return doc
}
