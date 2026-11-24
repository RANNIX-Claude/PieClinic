// Consulta a Base de Datos (clon adaptado de IRP «Utilidades»): SOLO LECTURA sobre una lista blanca de vistas prp_* administrativas.
// Nada de SQL libre desde el navegador: el usuario elige vista, columnas, filtros estructurados y límite; la app arma una consulta
// PostgREST (select + filtros) con leer() de lib/api.js. Las vistas con datos de paciente (nombres, expediente, notas) NO están en la lista.
// `sede`: la vista tiene columna sede_id (se filtra por la sede activa). El RLS sigue siendo la autoridad.

export const LIMITE_FILAS = 5000
export const LIMITE_DEFECTO = 500
export const LIMITES = [100, 500, 1000, 2000, 5000]

export const VISTAS_PERMITIDAS = [
  // Finanzas
  { vista: 'prp_ingresos', nombre: 'Ingresos', grupo: 'Finanzas', sede: true },
  { vista: 'prp_ingresos_mensuales', nombre: 'Ingresos por mes', grupo: 'Finanzas', sede: true },
  { vista: 'prp_ingreso_por_servicio', nombre: 'Ingreso por servicio', grupo: 'Finanzas', sede: true },
  { vista: 'prp_ventas_por_dia', nombre: 'Ventas por día', grupo: 'Finanzas', sede: true },
  { vista: 'prp_gastos', nombre: 'Gastos', grupo: 'Finanzas', sede: true },
  { vista: 'prp_gastos_mensuales', nombre: 'Gastos por mes', grupo: 'Finanzas', sede: true },
  { vista: 'prp_gasto_por_rubro_semana', nombre: 'Gasto por rubro y semana', grupo: 'Finanzas', sede: false },
  { vista: 'prp_cuentas_pagar', nombre: 'Cuentas por pagar', grupo: 'Finanzas', sede: true },
  { vista: 'prp_antiguedad_saldos_pagar', nombre: 'Antigüedad de saldos por pagar', grupo: 'Finanzas', sede: true },
  { vista: 'prp_pagos_proveedor', nombre: 'Pagos a proveedores', grupo: 'Finanzas', sede: true },
  { vista: 'prp_movimientos_bancarios', nombre: 'Movimientos bancarios', grupo: 'Finanzas', sede: true },
  { vista: 'prp_liquidaciones_clip', nombre: 'Liquidaciones de Clip', grupo: 'Finanzas', sede: false },
  { vista: 'prp_edr', nombre: 'Estado de resultados (por sede)', grupo: 'Finanzas', sede: true },
  { vista: 'prp_edr_consolidado', nombre: 'Estado de resultados (consolidado)', grupo: 'Finanzas', sede: false },
  { vista: 'prp_edr_resultados', nombre: 'Utilidad gerencial por mes', grupo: 'Finanzas', sede: true },
  { vista: 'prp_resumen_semanal', nombre: 'Resumen semanal', grupo: 'Finanzas', sede: true },
  { vista: 'prp_cierres_periodo', nombre: 'Cierres de periodo', grupo: 'Finanzas', sede: true },
  { vista: 'prp_fondo_semana', nombre: 'Fondo revolvente por semana', grupo: 'Finanzas', sede: true },
  { vista: 'prp_fondo_revolvente_cierres', nombre: 'Cierres del fondo revolvente', grupo: 'Finanzas', sede: true },
  { vista: 'prp_kpis_finanzas', nombre: 'Indicadores de finanzas', grupo: 'Finanzas', sede: true },
  { vista: 'prp_alertas_financieras', nombre: 'Alertas financieras', grupo: 'Finanzas', sede: true },
  { vista: 'prp_grupos_gasto', nombre: 'Grupos de gasto', grupo: 'Finanzas', sede: false },
  // Inventario y compras
  { vista: 'prp_inventario', nombre: 'Inventario por sede', grupo: 'Inventario', sede: true },
  { vista: 'prp_valuacion_inventario', nombre: 'Valuación del inventario', grupo: 'Inventario', sede: true },
  { vista: 'prp_kardex', nombre: 'Kardex', grupo: 'Inventario', sede: true },
  { vista: 'prp_lotes', nombre: 'Lotes y caducidades', grupo: 'Inventario', sede: true },
  { vista: 'prp_mermas', nombre: 'Mermas', grupo: 'Inventario', sede: true },
  { vista: 'prp_proveedores', nombre: 'Proveedores', grupo: 'Inventario', sede: false },
  { vista: 'prp_ordenes_compra', nombre: 'Órdenes de compra', grupo: 'Inventario', sede: true },
  { vista: 'prp_compras_proveedor', nombre: 'Compras por proveedor', grupo: 'Inventario', sede: true },
  // Catálogo comercial
  { vista: 'prp_servicios', nombre: 'Servicios', grupo: 'Catálogo', sede: false },
  { vista: 'prp_productos', nombre: 'Productos', grupo: 'Catálogo', sede: false },
  { vista: 'prp_precios_historial', nombre: 'Histórico de precios', grupo: 'Catálogo', sede: true },
  { vista: 'prp_catalogos', nombre: 'Catálogos de la clínica', grupo: 'Catálogo', sede: false },
  // Operación y equipo
  { vista: 'prp_ocupacion_podologo_dia', nombre: 'Ocupación por podólogo y día', grupo: 'Operación', sede: true },
  { vista: 'prp_asistencia_resumen_mes', nombre: 'Asistencia (resumen mensual)', grupo: 'Equipo', sede: true },
  { vista: 'prp_nomina_periodos', nombre: 'Periodos de nómina', grupo: 'Equipo', sede: false },
  { vista: 'prp_mantenimiento_mes', nombre: 'Mantenimiento por mes', grupo: 'Equipo', sede: true },
  { vista: 'prp_equipos', nombre: 'Equipos', grupo: 'Equipo', sede: true },
  { vista: 'prp_ordenes_trabajo', nombre: 'Órdenes de trabajo', grupo: 'Equipo', sede: true },
  { vista: 'prp_nps_mensual', nombre: 'NPS mensual', grupo: 'Equipo', sede: true },
  { vista: 'prp_importaciones', nombre: 'Importaciones de datos', grupo: 'Sistema', sede: true },
  // Validación (utilerías)
  { vista: 'prp_validacion_chequeos', nombre: 'Validación: conteos', grupo: 'Sistema', sede: true },
  { vista: 'prp_validacion_detalle', nombre: 'Validación: detalle', grupo: 'Sistema', sede: true },
]

export const VISTA_POR_NOMBRE = Object.fromEntries(VISTAS_PERMITIDAS.map(v => [v.vista, v]))
export const GRUPOS_CONSULTA = [...new Set(VISTAS_PERMITIDAS.map(v => v.grupo))]
export const esVistaPermitida = vista => Object.prototype.hasOwnProperty.call(VISTA_POR_NOMBRE, String(vista))

/** Operadores soportados → operador de PostgREST (el valor siempre viaja como parámetro, jamás se concatena SQL). */
export const OPERADORES = [
  { id: 'eq', label: 'es igual a' },
  { id: 'neq', label: 'es distinto de' },
  { id: 'ilike', label: 'contiene' },
  { id: 'gte', label: 'desde / mayor o igual' },
  { id: 'lte', label: 'hasta / menor o igual' },
  { id: 'gt', label: 'mayor que' },
  { id: 'lt', label: 'menor que' },
]
const OPS = new Set(OPERADORES.map(o => o.id))
const NOMBRE_COLUMNA = /^[a-z_][a-z0-9_]{0,62}$/

/** Valida y normaliza una consulta del usuario. Devuelve { ok, errores, consulta } con límite acotado y columnas válidas. */
export function validarConsulta({ vista, columnas = [], filtros = [], limite = LIMITE_DEFECTO, orden = null }, columnasDisponibles = []) {
  const errores = []
  if (!esVistaPermitida(vista)) errores.push('La vista no está en la lista permitida.')
  const disp = new Set(columnasDisponibles)
  const cols = columnas.filter(c => NOMBRE_COLUMNA.test(c) && (!disp.size || disp.has(c)))
  if (columnas.length && cols.length !== columnas.length) errores.push('Alguna columna no es válida para esta vista.')
  const fs = []
  for (const f of filtros) {
    if (!f?.columna) continue
    if (!NOMBRE_COLUMNA.test(f.columna) || (disp.size && !disp.has(f.columna))) { errores.push(`Columna de filtro no válida: ${f.columna}`); continue }
    if (!OPS.has(f.op)) { errores.push(`Operador no permitido: ${f.op}`); continue }
    if (f.valor === '' || f.valor == null) continue
    fs.push({ columna: f.columna, op: f.op, valor: String(f.valor) })
  }
  const lim = Math.min(LIMITE_FILAS, Math.max(1, Math.floor(Number(limite)) || LIMITE_DEFECTO))
  let ord = null
  if (orden?.columna) {
    if (NOMBRE_COLUMNA.test(orden.columna) && (!disp.size || disp.has(orden.columna))) ord = { columna: orden.columna, asc: orden.asc !== false }
    else errores.push('Columna de orden no válida.')
  }
  return { ok: errores.length === 0, errores, consulta: { vista, columnas: cols, filtros: fs, limite: lim, orden: ord } }
}

/** Convierte los filtros estructurados al formato de `leer()`: { columna: valor | { op: valor } }. Varios filtros de la misma columna se combinan. */
export function aFiltrosLeer(filtros = []) {
  const porColumna = {}
  for (const f of filtros) {
    const valor = f.op === 'ilike' ? `%${f.valor.replace(/[%,()]/g, ' ').trim()}%` : f.valor
    ;(porColumna[f.columna] ??= {})[f.op] = valor
  }
  const out = {}
  for (const [c, ops] of Object.entries(porColumna)) {
    const claves = Object.keys(ops)
    out[c] = claves.length === 1 && claves[0] === 'eq' ? ops.eq : ops
  }
  return out
}

/** Tipo aproximado de una columna a partir de una muestra de filas. */
export function tipoColumna(filas, col) {
  const v = filas.map(f => f[col]).find(x => x !== null && x !== undefined)
  if (v === undefined) return 'texto'
  if (typeof v === 'boolean') return 'bool'
  if (typeof v === 'number') return 'numero'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return 'fecha'
  return 'texto'
}

/** Columnas que casi nunca sirven al consultar (ids técnicos). */
export const esColumnaTecnica = c => c === 'id' || c === 'organizacion_id' || /_id$/.test(c)

/** Resumen para la bitácora: nunca incluye los valores de los filtros (podrían ser datos), solo su forma. */
export const detalleBitacora = (consulta, filas) => ({ vista: consulta.vista, columnas: consulta.columnas.length || 'todas', filtros: consulta.filtros.map(f => `${f.columna} ${f.op}`), limite: consulta.limite, filas })
