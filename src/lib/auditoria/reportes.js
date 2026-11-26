// Lógica pura de los reportes, el tablero y las alertas (sin React ni red; la prueba está en reportes.test.mjs).
// Principios que se respetan aquí: valores SIEMPRE al costo; lo que es un indicador (recurrencia, mezcla de pago, aperturas de cajón) se rotula «para investigar», nunca como hallazgo.

export const NOMBRE_ESTADO_AJUSTE = {
  sin_caso: 'Sin caso', abierta: 'Pendiente (abierta)', en_investigacion: 'Pendiente (en investigación)', ajuste_fallido: 'Ajuste fallido',
  cerrada_con_ajuste: 'Ajustada', cerrada_sin_ajuste: 'Cerrada sin ajuste', rechazada: 'Rechazada',
}
export const VARIANTE_ESTADO_AJUSTE = {
  sin_caso: 'n', abierta: 'a', en_investigacion: 'a', ajuste_fallido: 'r', cerrada_con_ajuste: 'g', cerrada_sin_ajuste: 'n', rechazada: 'n',
}
export const PENDIENTE_DE_AJUSTE = ['abierta', 'en_investigacion', 'ajuste_fallido']
export const esPendienteDeAjuste = estado => PENDIENTE_DE_AJUSTE.includes(estado)
export const NOMBRE_MODO_SESION = {
  conteo_apertura: 'Conteo de apertura', relevo_turno: 'Relevo de turno', auditoria_puntual: 'Auditoría puntual', auditoria_remota: 'Auditoría remota', conteo_inicial: 'Conteo inicial',
}

/** Quita lo vacío de un formulario de filtros para mandarlo al servidor. */
export function limpiarFiltros(f = {}) {
  const o = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === '' || v == null || v === false) continue
    if (Array.isArray(v)) { if (v.length) o[k] = v; continue }
    o[k] = v
  }
  return o
}

/** Texto legible de los filtros activos (para encabezados de Excel/PDF). nombres: { sucursales: {id→nombre}, auditores: {id→nombre} }. */
export function describirFiltros(f = {}, nombres = {}) {
  const p = []
  if (f.desde || f.hasta) p.push(`Periodo: ${f.desde ?? '…'} a ${f.hasta ?? '…'}`)
  const sucs = Array.isArray(f.sucursales) ? f.sucursales : f.sucursal ? [f.sucursal] : []
  p.push(`Sucursales: ${sucs.length ? sucs.map(id => nombres.sucursales?.[id] ?? id).join(', ') : 'todas'}`)
  if (f.auditor) p.push(`Auditor: ${nombres.auditores?.[f.auditor] ?? f.auditor}`)
  if (f.categoria) p.push(`Categoría: ${f.categoria}`)
  if (f.buscar) p.push(`Producto: «${f.buscar}»`)
  if (f.tipo && f.tipo !== 'ambas') p.push(f.tipo === 'faltantes' ? 'Solo faltantes' : 'Solo sobrantes')
  if (f.umbral_piezas) p.push(`Mínimo ${f.umbral_piezas} pieza(s)`)
  if (f.umbral_pesos) p.push(`Mínimo $${f.umbral_pesos} al costo`)
  return p.join(' · ')
}

export const signo = n => (Number(n) > 0 ? `+${Number(n)}` : `${Number(n)}`)

/** Diferencia valorizada para mostrar: faltantes con signo menos. */
export function textoValor(n, formato) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${formato(Math.abs(v))}`
}

/** Variación contra el periodo anterior: { texto, tono } (subir un faltante es malo). */
export function variacion(actual, anterior) {
  const a = Number(actual ?? 0), b = Number(anterior ?? 0)
  if (!b && !a) return { texto: 'sin cambio', tono: 'neutro', pct: 0 }
  if (!b) return { texto: 'nuevo (mes anterior sin faltantes)', tono: 'malo', pct: null }
  const pct = Math.round(((a - b) * 1000) / b) / 10
  return { texto: `${pct > 0 ? '+' : ''}${pct}% vs mes anterior`, tono: pct > 0 ? 'malo' : pct < 0 ? 'bueno' : 'neutro', pct }
}

/** Filas del reporte → hoja de Excel. */
export function columnasExcelDiferencias() {
  return [
    { key: 'fecha_hora', label: 'Fecha y hora' }, { key: 'sucursal', label: 'Sucursal' }, { key: 'producto', label: 'Producto' }, { key: 'codigo_barras', label: 'Código' },
    { key: 'fisica', label: 'Física' }, { key: 'sistema', label: 'Sistema' }, { key: 'dif_piezas', label: 'Diferencia (pzas)' },
    { key: 'dif_valor', label: 'Diferencia al costo', formato: 'moneda' }, { key: 'auditor', label: 'Auditor' }, { key: 'estado_ajuste', label: 'Estado del ajuste' }, { key: 'nota', label: 'Nota' },
  ]
}
export function filasExcelDiferencias(filas, fmtFecha) {
  return filas.map(f => ({
    fecha_hora: fmtFecha(f.fecha_hora), sucursal: f.sucursal, producto: f.producto, codigo_barras: f.codigo_barras ?? '', fisica: Number(f.fisica), sistema: Number(f.sistema),
    dif_piezas: Number(f.dif_piezas), dif_valor: Number(f.dif_valor), auditor: f.auditor ?? '', estado_ajuste: NOMBRE_ESTADO_AJUSTE[f.estado_ajuste] ?? f.estado_ajuste, nota: f.nota ?? '',
  }))
}

/** Últimos `n` meses como { valor: 'AAAA-MM-01', etiqueta: 'noviembre 2026' }, del más reciente al más antiguo. hoy: 'AAAA-MM-DD'. */
export function ultimosMeses(hoy, n = 12) {
  const [a, m] = hoy.split('-').map(Number)
  const salida = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    salida.push({ valor: d.toISOString().slice(0, 10), etiqueta: nombreMes(d.toISOString().slice(0, 10)) })
  }
  return salida
}
export function nombreMes(fechaISO) {
  const t = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fechaISO.slice(0, 10)}T00:00:00Z`))
  return t
}

// ───────────────────────────── alertas ─────────────────────────────
export const NOMBRE_CANAL = { push: 'Push', whatsapp: 'WhatsApp', correo: 'Correo' }
export const NOMBRE_DESTINATARIO = { dueno: 'Dueño', supervisor: 'Supervisor', sucursal: 'Dispositivos de la sucursal' }
export const NOMBRE_MODO_ENVIO = {
  individual: 'Enviada', aviso_techo: 'Aviso de techo', pendiente_resumen: 'Agrupada para el resumen', resumen_diario: 'Resumen diario', sin_destinatario: 'Sin destinatario', regla_desactivada: 'Regla desactivada',
}
export const VARIANTE_SEVERIDAD = { critica: 'r', alta: 'r', media: 'a', baja: 'n' }
export const NOMBRE_SEVERIDAD = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' }

/** ¿Ya se alcanzó el techo? (misma cuenta que hace el servidor: solo las alertas individuales cuentan). */
export const techoAlcanzado = (enviadasHoy, techo) => Number(enviadasHoy) >= Number(techo)

/** Resumen de la regla para la tabla de configuración. */
export const textoRegla = e =>
  `${(e.canales ?? []).map(c => NOMBRE_CANAL[c] ?? c).join(' + ')} → ${(e.destinatarios ?? []).map(d => NOMBRE_DESTINATARIO[d] ?? d).join(', ')}${e.inmediata ? '' : ' (solo en el resumen diario)'}`

// ───────────────────────────── mezcla de pago ─────────────────────────────
/** Frase para una sucursal o cajero de la mezcla de pago: siempre «para investigar», nunca «hallazgo». */
export function fraseMezcla(f) {
  if (!f.muestra_suficiente) return 'Muestra insuficiente: pocos tickets para comparar'
  if (f.para_investigar) return `${f.desviacion_pp > 0 ? 'Más' : 'Menos'} efectivo que el promedio (${f.desviacion_pp > 0 ? '+' : ''}${f.desviacion_pp} pts): indicador para investigar`
  return 'Dentro del rango de la cadena'
}

// ───────────────────────────── tablero ─────────────────────────────
export const NOMBRE_ESTADO_TABLERO = { hecho: 'Hecho', hecha: 'Hecha', en_captura: 'En captura', en_curso: 'En curso', tarde: 'Falta (ya es tarde)', pendiente: 'Pendiente', sin_modulo: 'No usa el módulo' }
export const VARIANTE_ESTADO_TABLERO = { hecho: 'g', hecha: 'g', en_captura: 'a', en_curso: 'a', tarde: 'r', pendiente: 'n', sin_modulo: 'n' }
export function horasTexto(h) {
  if (h == null) return 'sin señal'
  const n = Number(h)
  return n < 1 ? 'hace menos de 1 h' : n < 48 ? `hace ${Math.round(n)} h` : `hace ${Math.round(n / 24)} días`
}
