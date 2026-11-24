// Catálogos (clon adaptado de IRP «Catálogos»): visor de solo lectura de los catálogos del sistema con búsqueda y exportación.
// La EDICIÓN no se duplica aquí: cada catálogo enlaza a la pantalla donde se edita (Configuración → Catálogos, Catálogo y precios, Proveedores…).
export const CATALOGOS_SISTEMA = [
  { id: 'cat_config', vista: 'prp_catalogos', nombre: 'Catálogos de la clínica (estado civil, parentesco, orígenes, categorías…)', grupo: 'Configuración', sede: false, editar: '/configuracion', editarLabel: 'Configuración → Catálogos', orden: [{ columna: 'catalogo' }, { columna: 'orden' }] },
  { id: 'servicios', vista: 'prp_servicios', nombre: 'Servicios', grupo: 'Comercial', sede: false, editar: '/catalogo', editarLabel: 'Catálogo y precios' },
  { id: 'productos', vista: 'prp_productos', nombre: 'Productos', grupo: 'Comercial', sede: false, editar: '/catalogo', editarLabel: 'Catálogo y precios' },
  { id: 'precios', vista: 'prp_precios_historial', nombre: 'Histórico de precios', grupo: 'Comercial', sede: true, editar: '/catalogo', editarLabel: 'Catálogo y precios' },
  { id: 'proveedores', vista: 'prp_proveedores', nombre: 'Proveedores', grupo: 'Inventario', sede: false, editar: '/proveedores', editarLabel: 'Proveedores' },
  { id: 'grupos_gasto', vista: 'prp_grupos_gasto', nombre: 'Grupos de gasto', grupo: 'Finanzas', sede: false, editar: '/configuracion', editarLabel: 'Configuración' },
  { id: 'incidencias', vista: 'prp_tipos_incidencia', nombre: 'Tipos de incidencia de RH', grupo: 'Equipo', sede: false, editar: '/rh', editarLabel: 'Recursos humanos' },
  { id: 'esquemas', vista: 'prp_esquemas_comision', nombre: 'Esquemas de comisión', grupo: 'Equipo', sede: false, editar: '/comisiones', editarLabel: 'Comisiones' },
  { id: 'horarios', vista: 'prp_horarios_atencion', nombre: 'Horarios de atención', grupo: 'Agenda', sede: false, editar: '/agenda/horarios', editarLabel: 'Agenda → Horarios' },
]

/** Nombre legible de un catálogo de la clínica (clave de catalogos_clinica.catalogo). */
export const NOMBRES_CATALOGO = { estado_civil: 'Estado civil', parentesco: 'Parentesco', origen_paciente: 'Origen del paciente', canal_contacto: 'Canal de contacto', categoria_servicio: 'Categorías de servicio', categoria_producto: 'Categorías de producto', categoria_proveedor: 'Categorías de proveedor', categoria_gasto: 'Categorías de gasto', categoria_ot: 'Categorías de mantenimiento (OT)', tipo_queja: 'Tipos de queja', transporte: 'Transporte', ciclo_autoclave: 'Ciclos de autoclave', origen_sistema_importacion: 'Origen de importación' }

export const textoCelda = v => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
export const esColumnaTecnica = c => c === 'id' || c === 'organizacion_id' || c === 'created_at' || c === 'updated_at' || /_id$/.test(c) || /_url$/.test(c)

/** Columnas visibles de un conjunto de filas (ids técnicos ocultos salvo `tecnicas`). */
export function columnasDe(filas, { tecnicas = false } = {}) {
  const todas = [...new Set(filas.flatMap(f => Object.keys(f)))]
  return tecnicas ? todas : todas.filter(c => !esColumnaTecnica(c))
}
export function filtrarFilas(filas, q) {
  const t = String(q ?? '').trim().toLowerCase()
  return t ? filas.filter(f => Object.values(f).some(v => textoCelda(v).toLowerCase().includes(t))) : filas
}
