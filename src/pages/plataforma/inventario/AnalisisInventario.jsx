// Análisis de inventario (BI): el inventario es uno solo, el de todo el grupo de sucursales.
// Lee piefirme.prp_inventario_analisis (producto × sede, migración 170) y calcula todo en lib/plataforma/inventarioAnalisis.js.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRightLeft, ShoppingCart, Package, Wallet, TrendingUp, AlertTriangle, PackageX, PackageCheck, Clock, Download, Layers } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { leer } from '../../../lib/api'
import { moneda } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import { msgError, qty, CLAVE } from './comun'
import {
  ESTADOS, filtrar, opcionesFiltro, totales, porLinea, porProveedor, porSucursal, matrizProductoSucursal,
  preciosPorProducto, bajoMinimoAccionable, hojasExportacion,
} from '../../../lib/plataforma/inventarioAnalisis'

const COLORES = ['var(--accent)', 'var(--green)', 'var(--gold)', 'var(--red)', '#4A90D9', '#8E6FBF', '#2A9D8F', '#E07A5F', '#81B29A', '#999']
const TAM = 1000 // PostgREST corta a 1,000 filas por petición: se pagina hasta agotar
const pct = v => (v == null ? '—' : `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`)
const corto = (t, n = 18) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t)
const COLOR_ESTADO = { sin_existencia: 'var(--red)', bajo_minimo: 'var(--gold)', en_el_minimo: 'var(--gold)', excede_maximo: '#4A90D9' }

async function leerTodo(organizacionId) {
  const filas = []
  for (let pagina = 0; pagina < 200; pagina++) {
    const r = await leer('prp_inventario_analisis', { pagina, tamano: TAM, orden: [{ columna: 'sede_id' }, { columna: 'producto_id' }] })
    if (r.error) return { data: filas, error: r.error }
    filas.push(...r.data)
    if (r.data.length < TAM) break
  }
  return { data: filas, error: null, organizacionId }
}

function Tarjeta({ titulo, ayuda, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>{titulo}</h3>
      {ayuda && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{ayuda}</div>}
      {children}
    </div>
  )
}

/** Gráfica de barras horizontal (valor al costo) + pastel de participación. */
function GraficasGrupo({ datos, llave = 'valorCosto', nombre = 'Valor al costo', formato = moneda }) {
  const top = datos.slice(0, 8)
  const resto = datos.slice(8)
  const pastel = resto.length ? [...top, { etiqueta: 'Otros', [llave]: resto.reduce((s, x) => s + x[llave], 0) }] : top
  if (!datos.length) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos con los filtros actuales.</div>
  return (
    <div className="grid2" style={{ alignItems: 'center' }}>
      <div style={{ minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={Math.max(180, top.length * 34)}>
          <BarChart data={top.map(x => ({ ...x, corto: corto(x.etiqueta) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
            <YAxis type="category" dataKey="corto" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => formato(v)} labelFormatter={(_, p) => p?.[0]?.payload?.etiqueta} />
            <Bar isAnimationActive={false} dataKey={llave} name={nombre}>{top.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie isAnimationActive={false} data={pastel.filter(x => x[llave] > 0)} dataKey={llave} nameKey="etiqueta" innerRadius={45} outerRadius={85} paddingAngle={1}>
              {pastel.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
            </Pie>
            <Tooltip formatter={v => formato(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => corto(v, 22)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const colsGrupo = (primera) => [
  { key: 'etiqueta', label: primera, render: g => <b>{g.etiqueta}</b> },
  { key: 'productos', label: 'Productos', align: 'right' },
  { key: 'piezas', label: 'Piezas', align: 'right', render: g => qty(g.piezas) },
  { key: 'valorCosto', label: 'Valor al costo', align: 'right', render: g => moneda(g.valorCosto) },
  { key: 'valorVenta', label: 'Valor a precio de venta', align: 'right', render: g => moneda(g.valorVenta) },
  { key: 'margen', label: 'Margen', align: 'right', render: g => moneda(g.margen) },
  { key: 'margenPct', label: 'Margen %', align: 'right', valor: g => g.margenPct, render: g => pct(g.margenPct) },
  { key: 'pctValor', label: '% del valor', align: 'right', render: g => pct(g.pctValor) },
  { key: 'bajoMinimo', label: 'Bajo mínimo', align: 'right', render: g => (g.bajoMinimo ? <b style={{ color: 'var(--gold)' }}>{g.bajoMinimo}</b> : 0) },
]

export default function AnalisisInventario() {
  const nav = useNavigate()
  const { organizacion, sedes } = useApp()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'resumen'
  const [f, setF] = useState({ sedeId: '', categoria: '', proveedorId: '', marca: '', estado: '' })
  const [exportando, setExportando] = useState(false)

  const q = useQuery({ queryKey: [CLAVE, 'analisis', organizacion?.id], enabled: !!organizacion?.id, queryFn: () => leerTodo(organizacion.id) })
  const todas = q.data?.data ?? []
  const error = q.data?.error ?? q.error ?? null

  const listaSedes = useMemo(() => {
    const m = new Map(todas.map(x => [x.sede_id, x.sede_nombre]))
    sedes.forEach(s => { if (!m.has(s.id)) m.set(s.id, s.nombre) })
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [todas, sedes])
  // Solo las sedes con inventario aparecen como columnas
  const sedesConFilas = useMemo(() => listaSedes.filter(s => todas.some(x => x.sede_id === s.id)), [listaSedes, todas])
  const opciones = useMemo(() => opcionesFiltro(todas), [todas])
  const filas = useMemo(() => filtrar(todas, f), [todas, f])
  const t = useMemo(() => totales(filas), [filas])
  const lineas = useMemo(() => porLinea(filas), [filas])
  const provs = useMemo(() => porProveedor(filas), [filas])
  const suc = useMemo(() => porSucursal(filas, f.sedeId ? [] : listaSedes.filter(s => !todas.some(x => x.sede_id === s.id))), [filas, f.sedeId, listaSedes, todas])
  const matriz = useMemo(() => matrizProductoSucursal(filas), [filas])
  const precios = useMemo(() => preciosPorProducto(filas), [filas])
  // Alcance de sede para la lista accionable; los orígenes de traspaso se buscan en TODAS las sedes (con los demás filtros aplicados)
  const bajo = useMemo(() => bajoMinimoAccionable(filas, filtrar(todas, { ...f, sedeId: '', estado: '' })), [filas, todas, f])
  const alcance = f.sedeId ? (listaSedes.find(s => s.id === f.sedeId)?.nombre ?? 'Sucursal') : 'Todo el grupo'
  const conFiltros = f.categoria || f.proveedorId || f.marca || f.estado
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const cargando = q.isLoading

  async function exportar() {
    setExportando(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      for (const h of hojasExportacion({ filas, sedes: sedesConFilas, alcance, todas: filtrar(todas, { ...f, sedeId: '', estado: '' }) })) {
        const ws = wb.addWorksheet(h.nombre.slice(0, 31))
        ws.addRow(h.columnas); ws.getRow(1).font = { bold: true }
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EEFA' } }
        h.filas.forEach(r => ws.addRow(r))
        ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(12, String(h.columnas[i]).length + 4)) })
      }
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `analisis_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
    } finally { setExportando(false) }
  }

  const colsPrecios = [
    { key: 'sku', label: 'SKU' },
    { key: 'nombre', label: 'Producto', render: p => <b>{p.nombre}</b> },
    { key: 'categoria', label: 'Línea', filtro: true },
    { key: 'costo', label: 'Precio de compra', align: 'right', render: p => moneda(p.costo) },
    { key: 'precioLista', label: 'Precio lista', align: 'right', valor: p => p.precioLista, render: p => (p.precioLista == null ? '—' : moneda(p.precioLista)) },
    { key: 'precioSede', label: 'Precio por sucursal', align: 'right', valor: p => p.precioSedeMin, render: p => (p.precioSedeMin == null ? <span style={{ color: 'var(--muted)' }}>= lista</span> : p.precioSedeMin === p.precioSedeMax ? moneda(p.precioSedeMin) : `${moneda(p.precioSedeMin)} – ${moneda(p.precioSedeMax)}`) },
    { key: 'precioWeb', label: 'Precio web', align: 'right', valor: p => p.precioWeb, render: p => (p.precioWeb == null ? '—' : moneda(p.precioWeb)) },
    { key: 'existencia', label: 'Existencia', align: 'right', render: p => qty(p.existencia) },
    { key: 'valorCosto', label: 'Valor al costo', align: 'right', render: p => moneda(p.valorCosto) },
    { key: 'valorVenta', label: 'Valor a precio venta', align: 'right', render: p => moneda(p.valorVenta) },
    { key: 'margenPct', label: 'Margen %', align: 'right', valor: p => p.margenPct, render: p => pct(p.margenPct) },
  ]

  const colsMatriz = [
    { key: 'sku', label: 'SKU' },
    { key: 'nombre', label: 'Producto', render: p => <b>{p.nombre}</b> },
    { key: 'categoria', label: 'Línea', filtro: true },
    ...sedesConFilas.filter(s => !f.sedeId || s.id === f.sedeId).map(s => ({
      key: `s_${s.id}`, label: s.nombre, align: 'right', valor: p => (p.porSede[s.id] ? p.porSede[s.id].existencia : null),
      render: p => { const c = p.porSede[s.id]; if (!c) return <span style={{ color: 'var(--muted)' }}>—</span>; return <b style={{ color: COLOR_ESTADO[c.estado] }}>{qty(c.existencia)}</b> },
    })),
    { key: 'total', label: 'Total grupo', align: 'right', render: p => <b>{qty(p.total)}</b> },
    { key: 'minimo', label: 'Mínimo', align: 'right', render: p => qty(p.minimo) },
    { key: 'estadoTxt', label: 'Estado', filtro: true, valor: p => ESTADOS[p.estado], render: p => <span className={`bd ${p.estado === 'ok' ? 'v' : p.estado === 'sin_existencia' ? 'r' : p.estado === 'excede_maximo' ? 'b' : 'a'}`}>{ESTADOS[p.estado]}</span> },
  ]

  const colsBajo = [
    { key: 'sede_nombre', label: 'Sucursal', filtro: true },
    { key: 'nombre', label: 'Producto', render: b => <><b>{b.nombre}</b> <small style={{ color: 'var(--muted)' }}>{b.sku}</small></> },
    { key: 'proveedor', label: 'Proveedor', filtro: true },
    { key: 'existencia', label: 'Existencia', align: 'right', render: b => <b style={{ color: b.estado === 'sin_existencia' ? 'var(--red)' : 'var(--gold)' }}>{qty(b.existencia)}</b> },
    { key: 'minimo', label: 'Mínimo', align: 'right', render: b => qty(b.minimo) },
    { key: 'maximo', label: 'Máximo', align: 'right', valor: b => b.maximo, render: b => (b.maximo == null ? '—' : qty(b.maximo)) },
    { key: 'faltaMinimo', label: 'Falta al mínimo', align: 'right', render: b => qty(b.faltaMinimo) },
    { key: 'faltaMaximo', label: 'Falta al máximo', align: 'right', render: b => qty(b.faltaMaximo) },
    { key: 'valorReposicion', label: 'Valor de reposición', align: 'right', render: b => moneda(b.valorReposicion) },
    { key: 'estadoTxt', label: 'Estado', filtro: true, valor: b => ESTADOS[b.estado], render: b => <span className={`bd ${b.estado === 'sin_existencia' ? 'r' : 'a'}`}>{ESTADOS[b.estado]}</span> },
    { key: 'traspaso', label: 'Traspaso sugerido (informativo)', sortable: false, valor: b => (b.traspaso ? `${b.traspaso.cantidad} desde ${b.traspaso.sede_nombre}` : 'Sin existencia en otra sucursal'),
      render: b => (b.traspaso ? <span>{b.traspaso.cantidad} pz desde <b>{b.traspaso.sede_nombre}</b></span> : <span style={{ color: 'var(--muted)' }}>Comprar</span>) },
    { key: 'acc', label: '', sortable: false, exportar: false, render: b => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {b.traspaso && <button className="btn o sm" onClick={e => { e.stopPropagation(); nav('/traspasos') }}><ArrowRightLeft size={12} /> Traspasos</button>}
        <button className="btn o sm" onClick={e => { e.stopPropagation(); nav('/compras') }}><ShoppingCart size={12} /> Compras</button>
      </div>) },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Análisis de inventario" subtitulo="El inventario es uno solo: el de todo el grupo de sucursales"
        acciones={<>
          <button className="btn o" onClick={() => nav('/inventario')}><Package size={14} /> Inventario por sucursal</button>
          <button className="btn" disabled={exportando || cargando || !filas.length} onClick={exportar}><Download size={14} /> {exportando ? 'Exportando…' : 'Exportar a Excel'}</button>
        </>} />
      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 12 }}>{msgError(error)}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Alcance<br />
            <select value={f.sedeId} onChange={e => set('sedeId', e.target.value)} aria-label="Alcance">
              <option value="">Todo el grupo</option>
              {listaSedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select></label>
          <label style={{ fontSize: 12 }}>Línea<br />
            <select value={f.categoria} onChange={e => set('categoria', e.target.value)} aria-label="Línea de producto">
              <option value="">Todas las líneas</option>
              {opciones.categorias.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select></label>
          <label style={{ fontSize: 12 }}>Proveedor<br />
            <select value={f.proveedorId} onChange={e => set('proveedorId', e.target.value)} aria-label="Proveedor">
              <option value="">Todos los proveedores</option>
              <option value="__sin">Sin proveedor</option>
              {opciones.proveedores.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select></label>
          <label style={{ fontSize: 12 }}>Marca<br />
            <select value={f.marca} onChange={e => set('marca', e.target.value)} aria-label="Marca">
              <option value="">Todas las marcas</option>
              {opciones.marcas.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select></label>
          <label style={{ fontSize: 12 }}>Estado de existencia<br />
            <select value={f.estado} onChange={e => set('estado', e.target.value)} aria-label="Estado de existencia">
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {(f.sedeId || conFiltros) && <button className="btn o sm" style={{ alignSelf: 'flex-end' }} onClick={() => setF({ sedeId: '', categoria: '', proveedorId: '', marca: '', estado: '' })}>Limpiar</button>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Mostrando: <b>{alcance}</b>{conFiltros ? ' · con filtros' : ''} · {t.productos} productos · {filas.length} registros producto-sucursal</div>
      </div>

      <div className="grid-kpis">
        <KPICard title="Piezas totales" value={qty(t.piezas)} subtitle={`${t.sedesConStock} sucursales con existencia`} icon={Package} loading={cargando} />
        <KPICard title="Valor al costo" value={moneda(t.valorCosto)} subtitle="Existencia × precio de compra" icon={Wallet} color="var(--green)" loading={cargando}
          ayuda="Costo promedio vigente × existencia. La existencia negativa resta al valor." />
        <KPICard title="Valor a precio de venta" value={moneda(t.valorVenta)} subtitle={`Margen potencial ${moneda(t.margen)} (${pct(t.margenPct)})`} icon={TrendingUp} color="var(--accent)" loading={cargando}
          ayuda="Existencia × precio vigente de la sucursal; si la sucursal no tiene precio propio se usa el precio de lista." />
        <KPICard title="Productos con existencia" value={`${t.conExistencia} de ${t.productos}`} subtitle={`${t.sinExistencia} sin existencia`} icon={PackageCheck} loading={cargando} />
        <KPICard title="Bajo mínimo" value={t.bajoMinimo} subtitle={`${t.productoSedeBajo} producto-sucursal · ${t.enMinimo} en el mínimo`} icon={AlertTriangle} color="var(--gold)" loading={cargando} onClick={() => { set('estado', 'bajo_minimo') }} />
        <KPICard title="Exceden el máximo" value={t.excedeMaximo} subtitle="Existencia del grupo mayor al máximo" icon={Layers} color="#4A90D9" loading={cargando} onClick={() => { set('estado', 'excede_maximo') }} />
        <KPICard title="Sin existencia" value={t.sinExistencia} subtitle={`${t.productoSedeSin} producto-sucursal`} icon={PackageX} color="var(--red)" loading={cargando} onClick={() => { set('estado', 'sin_existencia') }} />
        <KPICard title="Caducan pronto" value={t.caducanPronto} subtitle="Productos con lote por caducar" icon={Clock} color="var(--red)" loading={cargando} />
      </div>
      <div className="card" style={{ marginBottom: 14, fontSize: 12.5 }}>
        <b>Valor del inventario por tipo de precio de venta:</b>{' '}
        precio de lista {moneda(t.precios.lista)} · precio por sucursal (solo productos con precio propio) {moneda(t.precios.sede)} · precio web {moneda(t.precios.web)}
        {t.precios.web === 0 && <span style={{ color: 'var(--muted)' }}> (ningún producto tiene precio web)</span>}
      </div>

      <Tabs value={tab} onChange={id => setSp({ tab: id })} items={[
        { id: 'resumen', label: 'Resumen' }, { id: 'linea', label: 'Por línea' }, { id: 'proveedor', label: 'Por proveedor' },
        { id: 'sucursal', label: 'Por sucursal' }, { id: 'precios', label: 'Precios' }, { id: 'matriz', label: 'Producto × sucursal' },
        { id: 'bajo', label: 'Bajo mínimo', badge: bajo.length || null },
      ]} />

      {tab === 'resumen' && (<>
        <div className="grid2" style={{ alignItems: 'start' }}>
          <Tarjeta titulo="Valor al costo por línea de producto" ayuda={alcance}><GraficasGrupoCompacta datos={lineas} /></Tarjeta>
          <Tarjeta titulo="Valor al costo por sucursal" ayuda="Ranking de sucursales"><GraficasGrupoCompacta datos={[...suc].sort((a, b) => b.valorCosto - a.valorCosto)} /></Tarjeta>
        </div>
        <Tarjeta titulo="Piezas por sucursal"><GraficasGrupo datos={[...suc].sort((a, b) => b.piezas - a.piezas)} llave="piezas" nombre="Piezas" formato={v => `${qty(v)} pz`} /></Tarjeta>
      </>)}

      {tab === 'linea' && (<>
        <Tarjeta titulo="Por línea de producto" ayuda="Valor al costo (precio de compra × existencia)"><GraficasGrupo datos={lineas} /></Tarjeta>
        <DataTable columnas={colsGrupo('Línea')} filas={lineas} filaKey="clave" cargando={cargando} exportarNombre="inventario_por_linea" tamanoPagina={30} placeholderBusqueda="Buscar línea…" />
      </>)}

      {tab === 'proveedor' && (<>
        <Tarjeta titulo="Por proveedor" ayuda="Proveedor de la última compra del producto; «Sin proveedor» si nunca se ha comprado"><GraficasGrupo datos={provs} /></Tarjeta>
        <DataTable columnas={colsGrupo('Proveedor')} filas={provs} filaKey="clave" cargando={cargando} exportarNombre="inventario_por_proveedor" tamanoPagina={30} placeholderBusqueda="Buscar proveedor…" />
      </>)}

      {tab === 'sucursal' && (<>
        <Tarjeta titulo="Cuánto hay en cada sucursal" ayuda="Piezas y valor de cada sucursal y su participación en el inventario del grupo"><GraficasGrupo datos={suc} /></Tarjeta>
        <DataTable columnas={[{ key: 'rank', label: '#', valor: g => suc.findIndex(x => x.clave === g.clave) + 1, render: g => suc.findIndex(x => x.clave === g.clave) + 1 },
          ...colsGrupo('Sucursal'), { key: 'pctPiezas', label: '% de piezas', align: 'right', render: g => pct(g.pctPiezas) }]}
          filas={suc} filaKey="clave" cargando={cargando} exportarNombre="inventario_por_sucursal_grupo" tamanoPagina={30} placeholderBusqueda="Buscar sucursal…" />
      </>)}

      {tab === 'precios' && (
        <DataTable columnas={colsPrecios} filas={precios} filaKey="producto_id" cargando={cargando} exportarNombre="inventario_precios" tamanoPagina={30}
          placeholderBusqueda="Buscar SKU o producto…" onFila={p => nav(`/inventario/producto/${p.producto_id}`)} />
      )}

      {tab === 'matriz' && (
        <DataTable columnas={colsMatriz} filas={matriz} filaKey="producto_id" cargando={cargando} exportarNombre="inventario_producto_por_sucursal" tamanoPagina={30}
          placeholderBusqueda="Buscar SKU o producto…" onFila={p => nav(`/inventario/producto/${p.producto_id}`)} />
      )}

      {tab === 'bajo' && (<>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          Ordenado por urgencia (existencia ÷ mínimo) y luego por valor de reposición (faltante al máximo, o al mínimo si no hay máximo, × costo). El traspaso sugerido es solo informativo: toma el excedente sobre el mínimo de otra sucursal.
        </div>
        <DataTable columnas={colsBajo} filas={bajo} filaKey="id" cargando={cargando} exportarNombre="inventario_bajo_minimo" tamanoPagina={30} placeholderBusqueda="Buscar producto…"
          onFila={b => nav(`/inventario/producto/${b.producto_id}`)} vacio={{ title: 'Nada bajo el mínimo', description: 'Todos los productos del alcance están en su mínimo o por encima.' }} />
      </>)}
    </div>
  )
}

/** Versión compacta: solo barras (para columnas de media pantalla). */
function GraficasGrupoCompacta({ datos }) {
  const top = datos.slice(0, 8).map(x => ({ ...x, corto: corto(x.etiqueta, 16) }))
  if (!top.length) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin datos con los filtros actuales.</div>
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, top.length * 32)}>
      <BarChart data={top} layout="vertical" margin={{ left: 4, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
        <YAxis type="category" dataKey="corto" width={100} tick={{ fontSize: 11 }} />
        <Tooltip formatter={v => moneda(v)} labelFormatter={(_, p) => p?.[0]?.payload?.etiqueta} />
        <Bar isAnimationActive={false} dataKey="valorCosto" name="Valor al costo">{top.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
