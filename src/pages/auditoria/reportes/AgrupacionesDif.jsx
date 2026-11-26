// Agrupaciones de la consulta de diferencias (F7.1): por sucursal (ranking por faltante valorizado), por producto (recurrencia) y por auditor (auditorías hechas).
// La recurrencia y el conteo de auditorías son INDICADORES PARA INVESTIGAR: la causa puede ser una entrada sin registrar, un traspaso o un error de captura.
import DataTable from '../../../components/ui/DataTable'
import { moneda, numero } from '../../../lib/formato'
import { Aviso } from './comun'

export default function AgrupacionesDif({ tab, d, onFiltrarProducto }) {
  if (tab === 'sucursal') {
    return (
      <DataTable buscador={false} sinPaginacion exportarNombre="diferencias_por_sucursal" filaKey="sucursal_id" filas={d.por_sucursal}
        vacio={{ title: 'Sin diferencias', description: 'Ninguna sucursal tiene diferencias con estos filtros.' }}
        columnas={[
          { key: 'puesto', label: '#', align: 'right', render: r => r.puesto }, { key: 'sucursal', label: 'Sucursal' },
          { key: 'faltantes_piezas', label: 'Faltantes (pzas)', align: 'right', render: r => numero(r.faltantes_piezas) },
          { key: 'faltantes_valor', label: 'Faltante al costo', align: 'right', render: r => <b style={{ color: Number(r.faltantes_valor) > 0 ? 'var(--red)' : undefined }}>{moneda(r.faltantes_valor)}</b> },
          { key: 'sobrantes_valor', label: 'Sobrante al costo', align: 'right', render: r => moneda(r.sobrantes_valor) },
          { key: 'neto_valor', label: 'Neto', align: 'right', render: r => `${Number(r.neto_valor) < 0 ? '−' : ''}${moneda(Math.abs(r.neto_valor))}` },
          { key: 'productos', label: 'Productos distintos', align: 'right' }, { key: 'casos_pendientes', label: 'Casos pendientes', align: 'right' },
        ]} />
    )
  }
  if (tab === 'producto') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <Aviso>Recurrencia = en cuántas auditorías distintas aparece el producto con diferencia. Es un indicador para investigar, no una conclusión: abre los casos para ver los movimientos de contexto.</Aviso>
        <DataTable buscador={false} sinPaginacion exportarNombre="diferencias_por_producto" filaKey="producto_id" filas={d.por_producto} onFila={r => onFiltrarProducto(r.producto)}
          vacio={{ title: 'Sin diferencias', description: 'Ningún producto tiene diferencias con estos filtros.' }}
          columnas={[
            { key: 'producto', label: 'Producto', render: r => <span title={r.codigo_barras}>{r.producto}</span> },
            { key: 'auditorias', label: 'Auditorías con diferencia', align: 'right', render: r => <b>{r.auditorias}</b> }, { key: 'sucursales', label: 'Sucursales', align: 'right' },
            { key: 'faltantes_piezas', label: 'Faltantes (pzas)', align: 'right', render: r => numero(r.faltantes_piezas) },
            { key: 'faltantes_valor', label: 'Faltante al costo', align: 'right', render: r => <b style={{ color: Number(r.faltantes_valor) > 0 ? 'var(--red)' : undefined }}>{moneda(r.faltantes_valor)}</b> },
            { key: 'sobrantes_valor', label: 'Sobrante al costo', align: 'right', render: r => moneda(r.sobrantes_valor) },
          ]} />
        <div className="hint">Se muestran los 25 con más recurrencia. Haz clic en un producto para ver su detalle.</div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Aviso>Auditorías hechas = sesiones de conteo en las que la persona capturó partidas en el periodo. Sirve para ver quién sí está auditando; no es una medida de desempeño ni de responsabilidad.</Aviso>
      <DataTable buscador={false} sinPaginacion exportarNombre="diferencias_por_auditor" filaKey="auditor_id" filas={d.por_auditor}
        vacio={{ title: 'Sin auditorías', description: 'Nadie capturó conteos en este periodo.' }}
        columnas={[
          { key: 'auditor', label: 'Auditor' }, { key: 'auditorias', label: 'Auditorías hechas', align: 'right', render: r => <b>{r.auditorias}</b> },
          { key: 'partidas', label: 'Partidas contadas', align: 'right', render: r => numero(r.partidas) }, { key: 'lineas_con_diferencia', label: 'Con diferencia', align: 'right' },
          { key: 'faltantes_valor', label: 'Faltante al costo', align: 'right', render: r => moneda(r.faltantes_valor) }, { key: 'sobrantes_valor', label: 'Sobrante al costo', align: 'right', render: r => moneda(r.sobrantes_valor) },
        ]} />
    </div>
  )
}
