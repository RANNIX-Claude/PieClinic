// Importación de checadas del reloj (clon adaptado de ImportChecadorModal de IRP). Lógica pura.
import { normalizarFila, mapearColumnas } from './importacion.js'

const OP = v => {
  const s = String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/^(e|in|entrada|ent|check ?in|c\/in|0)$/.test(s) || s.includes('entrada') || s.startsWith('in')) return 'entrada'
  if (/^(s|out|salida|sal|check ?out|c\/out|1)$/.test(s) || s.includes('salida') || s.startsWith('out')) return 'salida'
  return null
}

/**
 * Arma los marcajes para la RPC rh_importar_checadas.
 * Con columna de tipo se respeta; sin ella, por empleado y día el primer marcaje es entrada y el último salida
 * (los intermedios se descartan y se reportan). Acepta fecha_hora o fecha + hora.
 * @returns {{ filas: {numero_empleado, fecha_hora, operacion}[], descartadas: string[], errores: string[] }}
 */
export function armarChecadas(filas, mapeos) {
  const errores = [], descartadas = [], marcajes = []
  filas.forEach((fila, i) => {
    const { valores, mensajes } = normalizarFila(fila, mapeos, 'checadas')
    const num = valores.numero_empleado ? String(valores.numero_empleado).trim() : null
    let fh = valores.fecha_hora
    if (!fh && valores.fecha && valores.hora) {
      const d = new Date(`${valores.fecha}T${String(valores.hora).padStart(5, '0').slice(0, 5)}:00`)
      if (!Number.isNaN(d.getTime())) fh = d.toISOString()
    }
    if (!num || !fh) { errores.push(`Fila ${i + 2}: ${!num ? 'sin número de empleado' : mensajes[0]?.motivo ?? 'sin fecha y hora'}`); return }
    const tipoCol = mapeos.find(m => m.campo_destino === 'tipo')
    marcajes.push({ numero_empleado: num, fecha_hora: fh, operacion: tipoCol ? OP(fila[tipoCol.columna]) : null, dia: fh.slice(0, 10) })
  })
  const conTipo = marcajes.filter(m => m.operacion)
  const sinTipo = marcajes.filter(m => !m.operacion)
  const grupos = new Map()
  for (const m of sinTipo) { const k = `${m.numero_empleado}|${m.dia}`; grupos.set(k, [...(grupos.get(k) ?? []), m]) }
  const salida = conTipo.map(({ dia, ...m }) => m)
  for (const g of grupos.values()) {
    g.sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
    salida.push({ numero_empleado: g[0].numero_empleado, fecha_hora: g[0].fecha_hora, operacion: 'entrada' })
    if (g.length > 1) salida.push({ numero_empleado: g[0].numero_empleado, fecha_hora: g[g.length - 1].fecha_hora, operacion: 'salida' })
    if (g.length > 2) descartadas.push(`${g[0].numero_empleado} ${g[0].dia}: ${g.length - 2} marcaje(s) intermedio(s) descartado(s)`)
  }
  return { filas: salida, descartadas, errores }
}

export const mapeoInicialChecador = (columnas, filas) => mapearColumnas(columnas, filas.slice(0, 20), 'checadas', 70)
