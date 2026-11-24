// Conciliación bancaria: lectura de CSV con mapeo y sugerencias monto + fecha ± días (P-094).
// La conciliación automática oficial la hace la RPC conciliar_automatico; esto sirve para previsualizar y para el modo manual.
import { PARAMETROS_DEFAULT } from './constantes.js'
import { diasEntre } from './semana.js'

/** Parte una línea CSV respetando comillas. */
function partirLinea(l, sep) {
  const out = []; let cur = ''; let q = false
  for (let i = 0; i < l.length; i++) {
    const c = l[i]
    if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === sep && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}
export function parsearCSV(texto) {
  const lineas = String(texto ?? '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
  if (!lineas.length) return { encabezados: [], filas: [] }
  const sep = [',', ';', '\t'].map(s => [s, lineas[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0]
  const encabezados = partirLinea(lineas[0], sep)
  return { encabezados, filas: lineas.slice(1).map(l => partirLinea(l, sep)), separador: sep }
}
/** Interpreta un monto: '$1,234.50', '(500.00)', '1.234,50' no soportado → null. Cargos negativos. */
export function parsearMonto(v) {
  if (v == null || v === '') return null
  let s = String(v).trim(); let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[$\s]/g, '')
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1) }
  s = s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return neg ? -n : n
}
/** Fecha según formato del mapeo: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD-MM-YYYY'. → ISO o null. */
export function parsearFecha(v, formato = 'YYYY-MM-DD') {
  const s = String(v ?? '').trim()
  if (!s) return null
  const p = s.split(/[-/.]/).map(x => x.trim())
  if (p.length !== 3) return null
  let y, m, d
  const f = formato.toUpperCase()
  if (f.startsWith('YYYY')) [y, m, d] = p
  else if (f.startsWith('DD')) [d, m, y] = p
  else [m, d, y] = p
  if (y.length === 2) y = '20' + y
  const iso = `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const t = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso
}
/**
 * Aplica el mapeo { fecha, descripcion, monto, referencia, formato_fecha, cargo?, abono? } (nombres de columna del CSV)
 * → { filas:[{fecha,descripcion,monto,referencia}], errores:[{linea,motivo}] }. Si hay columnas cargo/abono, monto = abono − cargo.
 */
export function aplicarMapeo({ encabezados, filas }, mapeo) {
  const idx = n => (n ? encabezados.findIndex(h => h.toLowerCase() === String(n).toLowerCase()) : -1)
  const iF = idx(mapeo.fecha), iD = idx(mapeo.descripcion), iM = idx(mapeo.monto), iR = idx(mapeo.referencia), iC = idx(mapeo.cargo), iA = idx(mapeo.abono)
  const errores = [], out = []
  if (iF < 0) errores.push({ linea: 0, motivo: 'No se encontró la columna de fecha.' })
  if (iM < 0 && iA < 0 && iC < 0) errores.push({ linea: 0, motivo: 'No se encontró la columna de monto.' })
  if (errores.length) return { filas: out, errores }
  filas.forEach((r, i) => {
    const fecha = parsearFecha(r[iF], mapeo.formato_fecha)
    let monto = iM >= 0 ? parsearMonto(r[iM]) : null
    if (iM < 0) monto = (parsearMonto(r[iA]) ?? 0) - (parsearMonto(r[iC]) ?? 0)
    if (!fecha) return errores.push({ linea: i + 2, motivo: 'Fecha inválida.' })
    if (monto == null || monto === 0) return errores.push({ linea: i + 2, motivo: 'Monto vacío o inválido.' })
    out.push({ fecha, descripcion: iD >= 0 ? r[iD] : '', monto, referencia: iR >= 0 ? r[iR] || null : null })
  })
  return { filas: out, errores }
}
/**
 * Sugiere cobros para un movimiento: 1) referencia igual, 2) monto igual y fecha ± tolerancia.
 * @returns { regla:'referencia'|'monto_fecha'|null, candidatos:[], estado:'sugerido'|'ambiguo'|'detectado' }
 */
export function sugerirCoincidencias(mov, cobros, tolDias = PARAMETROS_DEFAULT.conciliacion_tolerancia_dias) {
  const libres = (cobros ?? []).filter(c => !c.conciliado)
  if (mov.referencia) {
    const porRef = libres.filter(c => c.referencia && String(c.referencia).trim().toLowerCase() === String(mov.referencia).trim().toLowerCase() && Math.abs(c.importe - mov.monto) < 0.01)
    if (porRef.length === 1) return { regla: 'referencia', candidatos: porRef, estado: 'sugerido' }
  }
  const porMonto = libres.filter(c => Math.abs(c.importe - mov.monto) < 0.01 && Math.abs(diasEntre(c.fecha, mov.fecha)) <= tolDias)
  if (porMonto.length === 1) return { regla: 'monto_fecha', candidatos: porMonto, estado: 'sugerido' }
  if (porMonto.length > 1) return { regla: 'monto_fecha', candidatos: porMonto, estado: 'ambiguo' }
  return { regla: null, candidatos: [], estado: 'detectado' }
}
