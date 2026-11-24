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
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false })
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
