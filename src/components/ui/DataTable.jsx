import { useMemo, useState, useEffect } from 'react'
import { ArrowUp, ArrowDown, Search, Download, ChevronLeft, ChevronRight, X } from 'lucide-react'
import LoadingSpinner from './LoadingSpinner'
import EmptyState from './EmptyState'
import { bitacoraExportar } from '../../lib/bitacora'

/**
 * Tabla de datos estándar: orden por columna, búsqueda, filtro por lista en columnas, paginación y exportar a Excel.
 *
 * columnas: [{ key, label, render?(fila), valor?(fila) → texto/número para ordenar, buscar y exportar,
 *              align: 'left'|'right'|'center', filtro: true (lista de valores distintos), ancho, sortable=true, exportar=true }]
 *
 * MODO CLIENTE (por defecto): recibe todas las filas y ordena/filtra/pagina en el navegador (hasta unos miles).
 * MODO SERVIDOR: pasa `servidor={{ total, pagina, onPagina, orden, onOrden, buscar, onBuscar }}`; la tabla solo muestra lo
 *   que llegó y avisa los cambios (el módulo consulta con `leer()` de lib/api.js). Exportar baja SOLO las filas visibles
 *   (o llama a `servidor.onExportar` si el módulo prepara el archivo completo).
 *
 * <DataTable columnas={cols} filas={filas} cargando={isLoading} exportarNombre="pacientes" onFila={f => nav(`/pacientes/${f.id}`)}
 *            vacio={{ title: 'Sin pacientes', description: '…' }} />
 */
const valorDe = (c, f) => (c.valor ? c.valor(f) : f[c.key])
const txt = v => (v == null ? '' : String(v))
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : txt(a).localeCompare(txt(b), 'es', { numeric: true }))

export default function DataTable({
  columnas, filas = [], cargando, error, vacio, tamanoPagina = 25, buscador = true, placeholderBusqueda = 'Buscar…',
  exportarNombre, onFila, filaKey = 'id', servidor, sinPaginacion, acciones, compacto,
}) {
  const [orden, setOrden] = useState(null)       // { key, dir }
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState({})     // key -> valor
  const [pagina, setPagina] = useState(0)
  const [exportando, setExportando] = useState(false)

  useEffect(() => { setPagina(0) }, [busqueda, filtros, orden, filas.length])

  const opciones = useMemo(() => Object.fromEntries(columnas.filter(c => c.filtro).map(c =>
    [c.key, [...new Set(filas.map(f => txt(valorDe(c, f))).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))])), [columnas, filas])

  const visibles = useMemo(() => {
    if (servidor) return filas
    let r = filas
    const q = busqueda.trim().toLowerCase()
    if (q) r = r.filter(f => columnas.some(c => txt(valorDe(c, f)).toLowerCase().includes(q)))
    for (const [k, v] of Object.entries(filtros)) if (v) { const c = columnas.find(x => x.key === k); r = r.filter(f => txt(valorDe(c, f)) === v) }
    if (orden) {
      const c = columnas.find(x => x.key === orden.key), s = orden.dir === 'asc' ? 1 : -1
      r = [...r].sort((a, b) => {
        const x = valorDe(c, a), y = valorDe(c, b)
        if (x == null && y == null) return 0
        if (x == null) return 1
        if (y == null) return -1
        return s * cmp(x, y)
      })
    }
    return r
  }, [filas, columnas, busqueda, filtros, orden, servidor])

  const total = servidor ? servidor.total ?? filas.length : visibles.length
  const pagActual = servidor ? servidor.pagina ?? 0 : pagina
  const paginas = Math.max(1, Math.ceil(total / (servidor?.tamano ?? tamanoPagina)))
  const tam = servidor?.tamano ?? tamanoPagina
  const pagina_filas = servidor || sinPaginacion ? visibles : visibles.slice(pagina * tam, pagina * tam + tam)
  const irAPagina = p => (servidor ? servidor.onPagina?.(p) : setPagina(p))

  const alternarOrden = c => {
    if (c.sortable === false) return
    const nuevo = !orden || orden.key !== c.key ? { key: c.key, dir: 'asc' } : orden.dir === 'asc' ? { key: c.key, dir: 'desc' } : null
    if (servidor) servidor.onOrden?.(nuevo ? { columna: c.key, asc: nuevo.dir === 'asc' } : null)
    setOrden(nuevo)
  }

  async function exportar() {
    setExportando(true)
    try {
      if (servidor?.onExportar) { await servidor.onExportar(); return }
      const ExcelJS = (await import('exceljs')).default
      const cols = columnas.filter(c => c.exportar !== false)
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet((exportarNombre || 'datos').slice(0, 31))
      ws.addRow(cols.map(c => c.label))
      ws.getRow(1).font = { bold: true }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EEFA' } }
      visibles.forEach(f => ws.addRow(cols.map(c => { const v = valorDe(c, f); return v instanceof Date ? v : v ?? '' })))
      ws.columns.forEach((col, i) => { col.width = Math.min(48, Math.max(10, cols[i].label.length + 4)) })
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `${exportarNombre || 'datos'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
      bitacoraExportar(exportarNombre || 'tabla', { filas: visibles.length })
    } finally { setExportando(false) }
  }

  const padY = compacto ? 6 : undefined
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {(buscador || exportarNombre || acciones || Object.keys(opciones).length > 0) && (
        <div className="toolbar" style={{ padding: '12px 14px 0', marginBottom: 12 }}>
          {buscador && (
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
              <input value={servidor ? servidor.buscar ?? '' : busqueda} placeholder={placeholderBusqueda} style={{ paddingLeft: 30, minWidth: 220 }}
                onChange={e => (servidor ? servidor.onBuscar?.(e.target.value) : setBusqueda(e.target.value))} />
            </div>
          )}
          {columnas.filter(c => c.filtro).map(c => (
            <select key={c.key} value={filtros[c.key] ?? ''} onChange={e => setFiltros(f => ({ ...f, [c.key]: e.target.value }))} aria-label={`Filtrar ${c.label}`}>
              <option value="">{c.label}: todos</option>
              {(opciones[c.key] ?? []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          {Object.values(filtros).some(Boolean) && (
            <button type="button" className="btn sm ghost" onClick={() => setFiltros({})}><X size={12} style={{ verticalAlign: -2 }} /> Quitar filtros</button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {acciones}
            {exportarNombre && (
              <button type="button" className="btn o sm" onClick={exportar} disabled={exportando || !visibles.length}>
                <Download size={12} style={{ verticalAlign: -2 }} /> {exportando ? 'Exportando…' : 'Excel'}
              </button>
            )}
          </div>
        </div>
      )}
      {error ? (
        <EmptyState title="No se pudo cargar" description={typeof error === 'string' ? error : error.message} />
      ) : cargando ? (
        <LoadingSpinner />
      ) : !visibles.length ? (
        <EmptyState {...(vacio ?? {})} />
      ) : (
        <div className="tabla-wrap">
          <table>
            <thead>
              <tr>
                {columnas.map(c => (
                  <th key={c.key} onClick={() => alternarOrden(c)} style={{ textAlign: c.align ?? 'left', width: c.ancho, cursor: c.sortable === false ? 'default' : 'pointer', userSelect: 'none', padding: padY ? `${padY}px 14px` : undefined }}
                    aria-sort={orden?.key === c.key ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {c.label}
                    {orden?.key === c.key && (orden.dir === 'asc' ? <ArrowUp size={11} style={{ marginLeft: 4, verticalAlign: -1 }} /> : <ArrowDown size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagina_filas.map((f, i) => (
                <tr key={f[filaKey] ?? i} className={onFila ? 'clickable' : undefined} onClick={onFila ? () => onFila(f) : undefined}>
                  {columnas.map(c => (
                    <td key={c.key} style={{ textAlign: c.align ?? 'left', padding: padY ? `${padY}px 14px` : undefined }}>
                      {c.render ? c.render(f) : (valorDe(c, f) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!error && !cargando && total > 0 && !sinPaginacion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--row-line)', fontSize: 12, color: 'var(--muted)' }}>
          <span>{total} registro{total === 1 ? '' : 's'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="btn o sm" disabled={pagActual <= 0} onClick={() => irAPagina(pagActual - 1)} aria-label="Página anterior"><ChevronLeft size={12} /></button>
            <span>Página {pagActual + 1} de {paginas}</span>
            <button type="button" className="btn o sm" disabled={pagActual >= paginas - 1} onClick={() => irAPagina(pagActual + 1)} aria-label="Página siguiente"><ChevronRight size={12} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
