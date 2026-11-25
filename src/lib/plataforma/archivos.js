// Lectura de archivos para la importación (Excel/CSV en el navegador, sin IA). PDF e imagen requieren la IA (adaptador).
const EXT = n => (String(n).split('.').pop() || '').toLowerCase()

export const tipoArchivo = nombre => {
  const e = EXT(nombre)
  if (['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'txt'].includes(e)) return 'tabla'
  if (e === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(e)) return 'imagen'
  return 'otro'
}

/** Lee un Excel/CSV y devuelve { hojas: [{nombre, columnas, filas}] } (filas = objetos columna → valor). La primera fila no vacía es el encabezado. */
export async function leerTabla(archivo) {
  const XLSX = await import('xlsx')
  const buf = await archivo.arrayBuffer()
  let wb
  if (['csv', 'tsv', 'txt'].includes(EXT(archivo.name))) {
    // Texto plano: se decodifica como UTF-8 (si no es válido, Windows-1252) y se leen los valores TAL CUAL. Con type:'array' SheetJS lo tomaba como Latin-1
    // (María → «MarÃ­a», lo que además impedía detectar duplicados) y convertía «1969-05-20» en fecha con un día de menos («5/19/69»).
    let texto
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { texto = new TextDecoder('windows-1252').decode(buf) }
    wb = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true })
  } else wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false })
  const hojas = wb.SheetNames.map(nombre => {
    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '', raw: false, blankrows: false })
    const iEnc = matriz.findIndex(f => f.filter(c => String(c).trim() !== '').length >= 2)
    if (iEnc < 0) return { nombre, columnas: [], filas: [] }
    const cab = matriz[iEnc].map((c, i) => String(c).trim() || `Columna ${i + 1}`)
    const unicas = cab.map((c, i) => (cab.indexOf(c) === i ? c : `${c} (${i + 1})`))
    const filas = matriz.slice(iEnc + 1).map(f => Object.fromEntries(unicas.map((c, i) => [c, f[i] ?? '']))).filter(f => Object.values(f).some(v => String(v).trim() !== ''))
    return { nombre, columnas: unicas, filas }
  })
  return { hojas }
}
