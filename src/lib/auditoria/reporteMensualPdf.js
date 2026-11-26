// Reporte mensual de Control y Auditoría (F7.4): PDF de DOS páginas, el artefacto comercial que el dueño enseña a su socio. Se arma en el cliente con lo que devuelve
// ctl_reporte_mensual (sin dependencias: lib/auditoria/pdf.js). Siempre salen exactamente dos páginas: la 1 trae la diferencia valorizada (total y por sucursal contra el mes
// anterior); la 2, las causas, los casos y los diez productos con más recurrencia. Valores al costo. La recurrencia se rotula «indicador para investigar».
import { PdfDoc, anchoTexto, envolverTexto, recortarTexto } from './pdf.js'
import { nombreMes } from './reportes.js'

const AZUL = [27, 63, 122], GRIS = [90, 98, 110], CLARO = [238, 241, 246], ROJO = [176, 42, 42], VERDE = [31, 122, 77], NARANJA = [217, 119, 6], TINTA = [24, 28, 36]
const MARGEN = 40
const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const m = n => fmtMoneda.format(Number(n ?? 0))
const num = n => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(Number(n ?? 0))
const pct = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`)

/** Datos que la página 1 muestra de las sucursales: hasta 12 filas; si hay más, el resto se suma en una fila «Otras». */
export function filasSucursales(porSucursal = [], max = 12) {
  if (porSucursal.length <= max) return porSucursal
  const visibles = porSucursal.slice(0, max - 1)
  const resto = porSucursal.slice(max - 1)
  const suma = k => resto.reduce((s, x) => s + Number(x[k] ?? 0), 0)
  const prev = suma('previo_faltante_valor')
  return [...visibles, {
    sucursal: `Otras ${resto.length} sucursales`, faltante_valor: suma('faltante_valor'), sobrante_valor: suma('sobrante_valor'), previo_faltante_valor: prev,
    variacion_pct: prev > 0 ? Math.round(((suma('faltante_valor') - prev) * 1000) / prev) / 10 : null,
  }]
}

function encabezado(doc, d, pagina) {
  doc.rect(0, 0, doc.ancho, 62, { relleno: AZUL })
  doc.texto(MARGEN, 30, 'Control y Auditoría', { size: 18, bold: true, color: [255, 255, 255] })
  doc.texto(MARGEN, 48, `${d.organizacion ?? ''} · Reporte mensual · ${nombreMes(d.mes)}`, { size: 10.5, color: [220, 228, 242] })
  doc.texto(doc.ancho - MARGEN, 30, `Página ${pagina} de 2`, { size: 9, color: [220, 228, 242], align: 'right' })
}
function pie(doc, d) {
  doc.linea(MARGEN, doc.alto - 46, doc.ancho - MARGEN, doc.alto - 46)
  const y = doc.parrafo(MARGEN, doc.alto - 34, d.nota ?? '', doc.ancho - 2 * MARGEN, { size: 7.5, color: GRIS })
  doc.texto(MARGEN, Math.max(y, doc.alto - 14), `Generado ${new Date(d.generado_en ?? Date.now()).toLocaleString('es-MX', { timeZone: d.zona ?? 'America/Mexico_City' })} · hora de México · valores al costo`, { size: 7.5, color: GRIS })
}
function tarjeta(doc, x, y, w, titulo, valor, subtitulo, colorValor = TINTA) {
  doc.rect(x, y, w, 62, { relleno: CLARO })
  doc.texto(x + 10, y + 16, titulo, { size: 8.5, color: GRIS, bold: true })
  doc.texto(x + 10, y + 40, valor, { size: 17, bold: true, color: colorValor })
  if (subtitulo) doc.texto(x + 10, y + 54, recortarTexto(subtitulo, 7.5, w - 20), { size: 7.5, color: GRIS })
}
function cabeceraTabla(doc, y, columnas) {
  doc.rect(MARGEN, y - 11, doc.ancho - 2 * MARGEN, 16, { relleno: AZUL })
  for (const c of columnas) doc.texto(c.align === 'right' ? c.x + c.w : c.x, y, c.titulo, { size: 8, bold: true, color: [255, 255, 255], align: c.align })
}
function barra(doc, x, y, w, valor, maximo, colorRelleno) {
  const largo = maximo > 0 ? Math.max(valor > 0 ? 1.5 : 0, (valor / maximo) * w) : 0
  doc.rect(x, y, w, 7, { relleno: [228, 232, 240] })
  if (largo > 0) doc.rect(x, y, largo, 7, { relleno: colorRelleno })
}

/** Arma el documento de dos páginas. `d` = respuesta de ctl_reporte_mensual. */
export function armarReporteMensual(d) {
  const doc = new PdfDoc({ titulo: `Reporte mensual de auditoría ${d.mes}`, autor: d.organizacion ?? 'Pie Firme' })
  const ancho = doc.ancho - 2 * MARGEN
  const t = d.total, a = d.total_anterior

  // ───── página 1 · diferencia valorizada
  encabezado(doc, d, 1)
  let y = 86
  doc.texto(MARGEN, y, 'Diferencia valorizada del mes (al costo)', { size: 12, bold: true, color: AZUL })
  y += 12
  const w4 = (ancho - 3 * 8) / 4
  const varFalt = a.faltante_valor > 0 ? Math.round(((t.faltante_valor - a.faltante_valor) * 1000) / a.faltante_valor) / 10 : null
  tarjeta(doc, MARGEN, y, w4, 'FALTANTES', m(t.faltante_valor), `${num(t.faltante_piezas)} pieza(s) · mes anterior ${m(a.faltante_valor)}`, ROJO)
  tarjeta(doc, MARGEN + (w4 + 8), y, w4, 'SOBRANTES', m(t.sobrante_valor), `${num(t.sobrante_piezas)} pieza(s) · mes anterior ${m(a.sobrante_valor)}`, VERDE)
  tarjeta(doc, MARGEN + 2 * (w4 + 8), y, w4, 'NETO', `${Number(t.neto_valor) < 0 ? '−' : ''}${m(Math.abs(t.neto_valor))}`, `mes anterior ${Number(a.neto_valor) < 0 ? '−' : ''}${m(Math.abs(a.neto_valor))}`, TINTA)
  tarjeta(doc, MARGEN + 3 * (w4 + 8), y, w4, 'FALTANTES VS MES ANTERIOR', varFalt == null ? (t.faltante_valor > 0 ? 'Nuevo' : '—') : pct(varFalt), `${t.auditorias} auditoría(s) · ${t.lineas} diferencia(s)`, varFalt > 0 ? ROJO : varFalt < 0 ? VERDE : TINTA)
  y += 86

  doc.texto(MARGEN, y, 'Por sucursal (ordenadas por faltante valorizado)', { size: 12, bold: true, color: AZUL })
  y += 18
  const cols = [
    { x: MARGEN + 6, w: 150, titulo: 'Sucursal' }, { x: MARGEN + 160, w: 70, titulo: 'Faltante', align: 'right' }, { x: MARGEN + 235, w: 70, titulo: 'Sobrante', align: 'right' },
    { x: MARGEN + 310, w: 70, titulo: 'Mes anterior', align: 'right' }, { x: MARGEN + 385, w: 60, titulo: 'Variación', align: 'right' },
  ]
  cabeceraTabla(doc, y, cols)
  y += 14
  const filas = filasSucursales(d.por_sucursal, 12)
  const maxF = Math.max(1, ...filas.map(f => Math.max(Number(f.faltante_valor), Number(f.previo_faltante_valor))))
  filas.forEach((f, i) => {
    if (i % 2 === 0) doc.rect(MARGEN, y - 9, ancho, 14, { relleno: [247, 249, 252] })
    doc.texto(cols[0].x, y, recortarTexto(f.sucursal, 8.5, cols[0].w - 6), { size: 8.5 })
    doc.texto(cols[1].x + cols[1].w, y, m(f.faltante_valor), { size: 8.5, align: 'right', color: Number(f.faltante_valor) > 0 ? ROJO : TINTA })
    doc.texto(cols[2].x + cols[2].w, y, m(f.sobrante_valor), { size: 8.5, align: 'right' })
    doc.texto(cols[3].x + cols[3].w, y, m(f.previo_faltante_valor), { size: 8.5, align: 'right', color: GRIS })
    doc.texto(cols[4].x + cols[4].w, y, f.variacion_pct == null ? (Number(f.faltante_valor) > 0 ? 'nuevo' : '—') : pct(f.variacion_pct), { size: 8.5, align: 'right', color: f.variacion_pct > 0 ? ROJO : f.variacion_pct < 0 ? VERDE : GRIS })
    barra(doc, MARGEN + 455, y - 7, ancho - 455, Number(f.faltante_valor), maxF, ROJO)
    y += 14
  })
  y += 14
  // comparativo de barras: este mes (rojo) contra el anterior (gris)
  doc.texto(MARGEN, y, 'Faltante valorizado: este mes contra el mes anterior', { size: 12, bold: true, color: AZUL })
  y += 16
  const top = filas.filter(f => Number(f.faltante_valor) > 0 || Number(f.previo_faltante_valor) > 0).slice(0, 8)
  const maxB = Math.max(1, ...top.map(f => Math.max(Number(f.faltante_valor), Number(f.previo_faltante_valor))))
  if (top.length === 0) doc.texto(MARGEN, y + 6, 'No hubo faltantes en este mes ni en el anterior.', { size: 9, color: GRIS })
  top.forEach(f => {
    doc.texto(MARGEN, y + 6, recortarTexto(f.sucursal, 8, 120), { size: 8 })
    doc.rect(MARGEN + 126, y, Math.max(1.5, (Number(f.faltante_valor) / maxB) * (ancho - 200)), 8, { relleno: ROJO })
    doc.texto(MARGEN + 130 + Math.max(1.5, (Number(f.faltante_valor) / maxB) * (ancho - 200)), y + 7, m(f.faltante_valor), { size: 7.5, color: ROJO })
    doc.rect(MARGEN + 126, y + 10, Math.max(1.5, (Number(f.previo_faltante_valor) / maxB) * (ancho - 200)), 6, { relleno: [170, 176, 188] })
    doc.texto(MARGEN + 130 + Math.max(1.5, (Number(f.previo_faltante_valor) / maxB) * (ancho - 200)), y + 16, m(f.previo_faltante_valor), { size: 7, color: GRIS })
    y += 22
  })
  pie(doc, d)

  // ───── página 2 · causas, casos y recurrencia
  doc.nuevaPagina()
  encabezado(doc, d, 2)
  y = 86
  doc.texto(MARGEN, y, 'Distribución de causas (casos cerrados en el mes)', { size: 12, bold: true, color: AZUL })
  y += 14
  const causas = (d.causas ?? []).slice(0, 8)
  const totalCasos = causas.reduce((s, c) => s + Number(c.casos), 0)
  if (causas.length === 0) { doc.texto(MARGEN, y + 6, 'Aún no se cerró ningún caso con causa en este mes.', { size: 9, color: GRIS }); y += 22 }
  const maxC = Math.max(1, ...causas.map(c => Number(c.casos)))
  causas.forEach(c => {
    doc.texto(MARGEN, y + 7, recortarTexto(c.causa, 8.5, 190), { size: 8.5 })
    barra(doc, MARGEN + 196, y, ancho - 400, Number(c.casos), maxC, AZUL)
    doc.texto(MARGEN + ancho - 196, y + 7, `${c.casos} caso(s) · ${totalCasos ? Math.round((Number(c.casos) * 100) / totalCasos) : 0}%`, { size: 8, color: GRIS })
    doc.texto(MARGEN + ancho, y + 7, m(c.valor), { size: 8.5, align: 'right' })
    y += 17
  })
  y += 12
  doc.texto(MARGEN, y, 'Casos abiertos y cerrados', { size: 12, bold: true, color: AZUL })
  y += 12
  const k = d.casos
  const w5 = (ancho - 4 * 8) / 5
  const tarjetasCasos = [['NACIDOS EN EL MES', k.nacidos_en_mes], ['CERRADOS EN EL MES', k.cerrados_en_mes], ['CON AJUSTE', k.cerrados_con_ajuste], ['SIN AJUSTE', k.cerrados_sin_ajuste], ['ABIERTOS AL CIERRE', k.abiertos_al_cierre_del_mes]]
  tarjetasCasos.forEach(([tit, val], i) => tarjeta(doc, MARGEN + i * (w5 + 8), y, w5, tit, String(val ?? 0), i === 4 ? `hoy: ${k.abiertos_hoy}` : null, i === 4 && val > 0 ? NARANJA : TINTA))
  y += 82

  doc.texto(MARGEN, y, 'Los diez productos con más recurrencia', { size: 12, bold: true, color: AZUL })
  y += 18
  const cp = [
    { x: MARGEN + 6, w: 24, titulo: '#' }, { x: MARGEN + 34, w: 230, titulo: 'Producto' }, { x: MARGEN + 270, w: 70, titulo: 'Auditorías', align: 'right' },
    { x: MARGEN + 345, w: 70, titulo: 'Sucursales', align: 'right' }, { x: MARGEN + 420, w: 50, titulo: 'Piezas', align: 'right' }, { x: MARGEN + 475, w: 40, titulo: 'Costo', align: 'right' },
  ]
  cp[5] = { x: MARGEN + 440, w: 75, titulo: 'Faltante al costo', align: 'right' }; cp[4] = { x: MARGEN + 395, w: 40, titulo: 'Piezas', align: 'right' }; cp[3] = { x: MARGEN + 340, w: 50, titulo: 'Sucurs.', align: 'right' }
  cabeceraTabla(doc, y, cp)
  y += 14
  const tp = d.top_productos ?? []
  if (tp.length === 0) doc.texto(MARGEN + 6, y, 'No hubo faltantes de productos en este mes.', { size: 9, color: GRIS })
  tp.forEach((p, i) => {
    if (i % 2 === 0) doc.rect(MARGEN, y - 9, ancho, 14, { relleno: [247, 249, 252] })
    doc.texto(cp[0].x, y, String(p.puesto), { size: 8.5 })
    doc.texto(cp[1].x, y, recortarTexto(p.producto, 8.5, cp[1].w), { size: 8.5 })
    doc.texto(cp[2].x + cp[2].w, y, String(p.auditorias), { size: 8.5, align: 'right' })
    doc.texto(cp[3].x + cp[3].w, y, String(p.sucursales), { size: 8.5, align: 'right' })
    doc.texto(cp[4].x + cp[4].w, y, num(p.faltante_piezas), { size: 8.5, align: 'right' })
    doc.texto(cp[5].x + cp[5].w, y, m(p.faltante_valor), { size: 8.5, align: 'right', color: ROJO })
    y += 14
  })
  y += 8
  doc.rect(MARGEN, y, ancho, 40, { relleno: [255, 247, 232] })
  const aviso = 'Indicador para investigar, no una conclusión: un producto que se repite puede reflejar una entrada sin registrar, un traspaso o un error de captura. Abra cada caso para ver los movimientos de contexto antes de actuar.' + (d.no_reportados > 0 ? ` Además, ${d.no_reportados} producto(s) pedidos en auditorías quedaron sin reportar.` : '')
  doc.parrafo(MARGEN + 8, y + 14, aviso, ancho - 16, { size: 8, color: [110, 70, 6] })
  pie(doc, d)
  return doc
}

export const nombreArchivoMensual = d => `reporte_auditoria_${d.mes.slice(0, 7)}.pdf`
export { anchoTexto, envolverTexto }
