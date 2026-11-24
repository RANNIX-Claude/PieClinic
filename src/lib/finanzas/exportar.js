// Exportación a Excel (exceljs, carga bajo demanda) y a PDF (impresión del navegador → «Guardar como PDF»).
import { bitacoraExportar } from '../bitacora'

/** hojas: [{ nombre, columnas:[{label, key, formato?:'moneda'|'numero'|'texto'}], filas:[{...}] }] */
export async function exportarExcel(nombreArchivo, hojas, { entidad = nombreArchivo, detalle = {}, sedeId = null } = {}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  for (const h of hojas) {
    const ws = wb.addWorksheet(String(h.nombre).slice(0, 31))
    ws.addRow(h.columnas.map(c => c.label))
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EEFA' } }
    for (const f of h.filas) ws.addRow(h.columnas.map(c => f[c.key] ?? ''))
    h.columnas.forEach((c, i) => {
      const col = ws.getColumn(i + 1)
      col.width = Math.min(48, Math.max(12, c.label.length + 4))
      if (c.formato === 'moneda') col.numFmt = '"$"#,##0.00'
    })
  }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
  bitacoraExportar(entidad, { formato: 'xlsx', ...detalle }, sedeId)
}
