// Expediente de producto (clon de ExpedienteProducto de IRP): resumen, datos, existencia por sede, lotes, kardex, histórico de costo, proveedores y compras.
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Package, Wallet, TrendingUp, Layers } from 'lucide-react'
import { moneda, fecha, fechaHora, porcentaje } from '../../../lib/formato'
import { bitacoraVer } from '../../../lib/bitacora'
import { usePermiso } from '../../../lib/permisos'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useLectura, useProductos, useProveedores, msgError, BadgeExist, TIPO_MOV, ACCION_LOTE, ESTADO_LOTE, num, qty } from './comun'

export default function ExpedienteProducto() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'resumen'
  const verCostos = usePermiso('compras.ver')
  const { mapa, cargando, error } = useProductos()
  const p = mapa[id]
  const inv = useLectura('exp-inv', 'prp_inventario', { filtros: { producto_id: id } })
  const lotes = useLectura('exp-lotes', 'prp_lotes', { filtros: { producto_id: id } })
  const kardex = useLectura('exp-kardex', 'prp_kardex', { filtros: { producto_id: id }, orden: { columna: 'fecha', asc: false }, limite: 500 })
  const costos = useLectura('exp-costos', 'historico_costos', { sedeCol: false, filtros: { producto_id: id }, orden: { columna: 'fecha', asc: false }, limite: 200 }, verCostos)
  const provProd = useLectura('exp-provprod', 'proveedor_productos', { sedeCol: false, filtros: { producto_id: id } }, verCostos)
  const compras = useLectura('exp-compras', 'prp_oc_lineas', { sedeCol: false, filtros: { producto_id: id }, limite: 300 }, verCostos)
  const ocs = useLectura('exp-ocs', 'prp_ordenes_compra', { sedeId: null }, verCostos)
  const { mapa: provs } = useProveedores()
  useEffect(() => { if (id) bitacoraVer('productos', id, { vista: 'expediente_producto' }) }, [id])

  const ocMapa = useMemo(() => Object.fromEntries(ocs.filas.map(o => [o.id, o])), [ocs.filas])
  const total = inv.filas.reduce((s, i) => s + num(i.existencia), 0)
  const valor = inv.filas.reduce((s, i) => s + num(i.valor), 0)

  if (cargando) return <div className="pagina"><LoadingSpinner /></div>
  if (error || !p) return <div className="pagina"><EmptyState title={error ? 'No se pudo cargar' : 'Producto no encontrado'} description={error ? msgError(error) : 'El producto no existe o no pertenece a esta clínica.'}
    action={<button className="btn o" onClick={() => nav('/inventario')}>Volver al inventario</button>} /></div>

  const dato = (k, v) => <div key={k} className="field"><label>{k}</label><div style={{ fontSize: 13.5 }}>{v ?? '—'}</div></div>
  return (
    <div className="pagina">
      <PageHeader titulo={p.nombre} subtitulo={`${p.sku} · ${p.categoria}${p.marca ? ` · ${p.marca}` : ''}`}
        acciones={<button className="btn o" onClick={() => nav('/inventario')}><ArrowLeft size={14} /> Inventario</button>} />
      <Tabs value={tab} onChange={t => setSp({ tab: t })} items={[
        { id: 'resumen', label: 'Resumen' }, { id: 'datos', label: 'Datos del producto' }, { id: 'sedes', label: 'Existencia por sede' },
        { id: 'lotes', label: 'Lotes', badge: lotes.filas.length || null }, { id: 'kardex', label: 'Kardex' },
        { id: 'costos', label: 'Costos', oculto: !verCostos }, { id: 'proveedores', label: 'Proveedores', oculto: !verCostos, badge: provProd.filas.length || null },
        { id: 'compras', label: 'Compras', oculto: !verCostos },
      ]} />
      {tab === 'resumen' && (
        <div className="grid-kpis">
          <KPICard title="Existencia total" value={qty(total)} subtitle={`${inv.filas.length} sede(s)`} icon={Package} loading={inv.cargando} />
          <KPICard title="Valor en inventario" value={moneda(valor)} icon={Wallet} color="var(--green)" loading={inv.cargando} />
          <KPICard title="Costo promedio" value={moneda(p.costo_promedio)} icon={TrendingUp} color="var(--gold)" subtitle="Promedio ponderado (P-083)" />
          <KPICard title="Precio de lista" value={p.precio_lista == null ? '—' : moneda(p.precio_lista)} icon={Layers} subtitle={p.margen_pct == null ? 'Sin precio vigente' : `Margen ${porcentaje(p.margen_pct)}`} />
        </div>
      )}
      {tab === 'datos' && (
        <div className="card">
          <div className="grid2">
            {dato('SKU', p.sku)}{dato('Código de barras', p.codigo_barras)}{dato('Categoría', p.categoria)}{dato('Marca', p.marca)}
            {dato('Presentación', p.presentacion)}{dato('Tipo', { venta: 'Venta', insumo_clinico: 'Insumo clínico', por_encargo: 'Por encargo' }[p.tipo] ?? p.tipo)}
            {dato('IVA', { exento: 'Exento', '16': '16 %', tasa0: 'Tasa 0' }[p.iva_tipo] ?? p.iva_tipo)}{dato('Maneja lote', p.maneja_lote ? 'Sí' : 'No')}
            {dato('Maneja caducidad', p.maneja_caducidad ? 'Sí' : 'No')}{dato('Estado', <StatusBadge estado={p.estado} />)}
            {dato('Clave SAT', p.clave_sat)}{dato('Renglón del EDR', p.renglon_edr)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>El alta y edición del producto y sus precios se hace en Catálogo y precios (Ventas); aquí se consulta su operación de inventario.</div>
        </div>
      )}
      {tab === 'sedes' && <DataTable sinPaginacion buscador={false} cargando={inv.cargando} error={msgError(inv.error)} filas={inv.filas} exportarNombre={`existencia_${p.sku}`}
        columnas={[
          { key: 'sede_nombre', label: 'Sede' },
          { key: 'existencia', label: 'Existencia', align: 'right', render: i => <b>{qty(i.existencia)}</b>, valor: i => num(i.existencia) },
          { key: 'minimo', label: 'Mínimo', align: 'right', render: i => qty(i.minimo) },
          { key: 'maximo', label: 'Máximo', align: 'right', render: i => (i.maximo == null ? '—' : qty(i.maximo)) },
          { key: 'ubicacion', label: 'Ubicación' },
          { key: 'proxima_caducidad', label: 'Próx. caducidad', render: i => (i.proxima_caducidad ? fecha(i.proxima_caducidad) : '—') },
          { key: 'valor', label: 'Valor', align: 'right', render: i => moneda(i.valor) },
          { key: 'ultimo_conteo', label: 'Último conteo', render: i => (i.ultimo_conteo ? fecha(i.ultimo_conteo) : '—') },
          { key: 'estado', label: 'Estado', render: i => <BadgeExist estado={i.estado} /> },
        ]} vacio={{ title: 'No se maneja en ninguna sede', description: 'Asígnalo a una sede desde Inventario → «Producto en sede».' }} />}
      {tab === 'lotes' && <DataTable sinPaginacion cargando={lotes.cargando} error={msgError(lotes.error)} filas={lotes.filas} exportarNombre={`lotes_${p.sku}`}
        columnas={[
          { key: 'numero_lote', label: 'Lote', render: l => l.numero_lote ?? '—' }, { key: 'sede_nombre', label: 'Sede', filtro: true },
          { key: 'caducidad', label: 'Caduca', render: l => (l.caducidad ? fecha(l.caducidad) : '—') },
          { key: 'existencia', label: 'Existencia', align: 'right', render: l => qty(l.existencia), valor: l => num(l.existencia) },
          { key: 'dias_para_caducar', label: 'Días', align: 'right', render: l => l.dias_para_caducar ?? '—' },
          { key: 'acc', label: 'Acción sugerida', render: l => ACCION_LOTE[l.accion_sugerida] ?? '—' },
          { key: 'estado', label: 'Estado', render: l => <StatusBadge estado={l.estado} label={ESTADO_LOTE[l.estado]} variante={l.estado === 'bloqueado' ? 'r' : l.estado === 'agotado' ? 'n' : 'v'} /> },
        ]} vacio={{ title: 'Sin lotes', description: p.maneja_lote || p.maneja_caducidad ? 'Aún no se recibe mercancía con lote.' : 'Este producto no maneja lote ni caducidad.' }} />}
      {tab === 'kardex' && <DataTable cargando={kardex.cargando} error={msgError(kardex.error)} filas={kardex.filas} exportarNombre={`kardex_${p.sku}`} tamanoPagina={30}
        columnas={[
          { key: 'fecha', label: 'Fecha', render: m => fechaHora(m.fecha) }, { key: 'tipo', label: 'Tipo', filtro: true, valor: m => TIPO_MOV[m.tipo] ?? m.tipo },
          { key: 'sede_nombre', label: 'Sede', filtro: true },
          { key: 'cantidad', label: 'Cant.', align: 'right', valor: m => num(m.cantidad), render: m => <b style={{ color: num(m.cantidad) < 0 ? 'var(--red)' : 'var(--green)' }}>{num(m.cantidad) > 0 ? '+' : ''}{qty(m.cantidad)}</b> },
          { key: 'costo_unitario', label: 'Costo unit.', align: 'right', render: m => (m.costo_unitario == null ? '—' : moneda(m.costo_unitario)) },
          { key: 'referencia_folio', label: 'Referencia', render: m => m.referencia_folio ?? '—' }, { key: 'nota', label: 'Nota' },
        ]} vacio={{ title: 'Sin movimientos', description: 'Aún no hay entradas ni salidas de este producto.' }} />}
      {tab === 'costos' && <DataTable cargando={costos.cargando} error={msgError(costos.error)} filas={costos.filas} exportarNombre={`costos_${p.sku}`}
        columnas={[
          { key: 'fecha', label: 'Fecha', render: c => fecha(c.fecha) }, { key: 'proveedor', label: 'Proveedor', valor: c => provs[c.proveedor_id]?.nombre ?? '—' },
          { key: 'costo', label: 'Costo de la compra', align: 'right', render: c => moneda(c.costo), valor: c => num(c.costo) },
          { key: 'costo_promedio', label: 'Promedio resultante', align: 'right', render: c => moneda(c.costo_promedio), valor: c => num(c.costo_promedio) },
        ]} vacio={{ title: 'Sin histórico de costo', description: 'Cada compra recibida deja su costo y el promedio resultante.' }} />}
      {tab === 'proveedores' && <DataTable sinPaginacion cargando={provProd.cargando} error={msgError(provProd.error)} filas={provProd.filas} exportarNombre={`proveedores_${p.sku}`}
        onFila={f => nav(`/proveedores/${f.proveedor_id}`)}
        columnas={[
          { key: 'prov', label: 'Proveedor', valor: f => provs[f.proveedor_id]?.nombre ?? '—', render: f => <b>{provs[f.proveedor_id]?.nombre ?? '—'}</b> },
          { key: 'sku_proveedor', label: 'SKU del proveedor' },
          { key: 'ultimo_costo', label: 'Último costo', align: 'right', render: f => (f.ultimo_costo == null ? '—' : moneda(f.ultimo_costo)) },
          { key: 'ultima_compra', label: 'Última compra', render: f => (f.ultima_compra ? fecha(f.ultima_compra) : '—') },
        ]} vacio={{ title: 'Sin proveedores vinculados', description: 'El proveedor se vincula al producto desde su expediente.' }} />}
      {tab === 'compras' && <DataTable cargando={compras.cargando || ocs.cargando} error={msgError(compras.error)} filas={compras.filas} exportarNombre={`compras_${p.sku}`}
        onFila={f => nav(`/compras?oc=${f.oc_id}`)}
        columnas={[
          { key: 'folio', label: 'Orden', valor: l => ocMapa[l.oc_id]?.folio ?? '—' }, { key: 'fecha', label: 'Fecha', valor: l => ocMapa[l.oc_id]?.fecha ?? '', render: l => fecha(ocMapa[l.oc_id]?.fecha) },
          { key: 'prov', label: 'Proveedor', filtro: true, valor: l => ocMapa[l.oc_id]?.proveedor_nombre ?? '—' },
          { key: 'cantidad', label: 'Cant.', align: 'right', render: l => qty(l.cantidad) }, { key: 'recibida', label: 'Recibida', align: 'right', render: l => qty(l.cantidad_recibida) },
          { key: 'costo_unitario', label: 'Costo unit.', align: 'right', render: l => moneda(l.costo_unitario) },
          { key: 'variacion_pct', label: 'Variación', align: 'right', render: l => (l.variacion_pct == null ? '—' : <span style={{ color: l.variacion_pct > 0 ? 'var(--red)' : 'var(--green)' }}>{l.variacion_pct > 0 ? '+' : ''}{l.variacion_pct} %</span>) },
          { key: 'importe', label: 'Importe', align: 'right', render: l => moneda(l.importe) },
        ]} vacio={{ title: 'Sin compras', description: 'Este producto no aparece en órdenes de compra.' }} />}
    </div>
  )
}
