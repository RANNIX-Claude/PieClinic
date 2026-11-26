// Visibilidad de costos en inventario y compras. El dueño pidió: la recepción consulta el inventario pero NO ve el costo,
// solo el precio de lista. La capacidad es `inventario.ver_costos` (administrador, supervisor y RANNIX; ver lib/permisos.js)
// y la base devuelve NULL en las vistas prp_* para quien no la tiene (migración 270). Aquí vive la lógica pura que usan las pantallas.

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v))
const r2 = n => Math.round(n * 100) / 100

/** Marca una columna de DataTable como «de costo»: desaparece (de la tabla y de la exportación a Excel) sin la capacidad. */
export const colCosto = col => ({ ...col, costo: true })

/** Quita de una lista de columnas las marcadas `costo: true` cuando el usuario no puede ver costos. */
export const columnasVisibles = (columnas, verCostos) => (verCostos ? columnas : columnas.filter(c => !c.costo))

/** Pestañas que solo muestran costos o montos de compra: `costo: true` → ocultas sin la capacidad. */
export const pestanasVisibles = (items, verCostos) => items.map(t => (t.costo && !verCostos ? { ...t, oculto: true } : t))

/** Valor del inventario a PRECIO DE LISTA (existencia × precio de venta): no revela el costo. Solo cuenta productos con precio vigente. */
export function valorAPrecioLista(filasInventario, mapaProductos) {
  const porSede = {}
  let total = 0
  for (const i of filasInventario) {
    const precio = num(mapaProductos[i.producto_id]?.precio_lista)
    const v = r2(num(i.existencia) * precio)
    porSede[i.sede_nombre] = r2((porSede[i.sede_nombre] ?? 0) + v)
    total = r2(total + v)
  }
  return { total, porSede }
}

/** Valor del inventario al costo (solo con la capacidad): suma `valor` de prp_inventario por sede. */
export function valorAlCosto(filasInventario) {
  const porSede = {}
  for (const i of filasInventario) porSede[i.sede_nombre] = r2((porSede[i.sede_nombre] ?? 0) + num(i.valor))
  return { total: r2(Object.values(porSede).reduce((s, v) => s + v, 0)), porSede }
}

/** KPI de valor para la pantalla de inventario según la capacidad. */
export function kpiValorInventario(filasInventario, mapaProductos, verCostos) {
  if (verCostos) return { titulo: 'Valor de inventario', ...valorAlCosto(filasInventario), alCosto: true }
  return { titulo: 'Valor a precio de lista', ...valorAPrecioLista(filasInventario, mapaProductos), alCosto: false }
}

/** Para una fila de producto (prp_productos) devuelve solo lo que el rol puede ver. Sin la capacidad: nada de costo ni margen. */
export function productoVisible(p, verCostos) {
  if (verCostos || !p) return p
  const { costo_promedio, margen_pct, margen_objetivo_pct, ...resto } = p // eslint-disable-line no-unused-vars
  return resto
}
