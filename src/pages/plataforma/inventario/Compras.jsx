// Pantalla 23 · Compras a proveedores: órdenes de compra, recepciones, devoluciones y análisis de compras por proveedor.
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, FileClock, CalendarClock, ShoppingCart, Wallet } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { moneda, fecha, porcentaje } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import { colCosto, columnasVisibles } from '../../../lib/plataforma/visibilidadCostos'
import { useLectura, useProductos, useProveedores, msgError, num, qty } from './comun'
import OrdenEditor from './OrdenEditor'
import OrdenDetalle, { ESTADO_OC, ESTADO_PAGO } from './OrdenDetalle'

export default function Compras() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'ordenes'
  const puedeEditar = usePermiso('compras.editar')
  const verCostos = usePermiso('inventario.ver_costos')   // recepción ve órdenes y recibe mercancía, sin totales, pagos ni cuentas por pagar
  const [editor, setEditor] = useState(sp.get('nueva') ? { id: null, inicial: { proveedor_id: sp.get('proveedor') ?? '' } } : null)
  const [detalle, setDetalle] = useState(sp.get('oc'))
  const ordenes = useLectura('ordenes', 'prp_ordenes_compra', { orden: { columna: 'fecha', asc: false }, limite: 2000 })
  const cxp = useLectura('cxp-compras', 'prp_cuentas_pagar', { limite: 3000 }, verCostos)
  const [mes, setMes] = useState('')

  const k = useMemo(() => {
    const abiertas = ordenes.filas.filter(o => ['enviada', 'recibida_parcial'].includes(o.estado))
    const hoy = new Date(), en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), hoyIso = hoy.toISOString().slice(0, 10)
    const porRecibir = abiertas.filter(o => o.entrega_esperada && o.entrega_esperada >= hoyIso && o.entrega_esperada <= en7).length
    const m = hoyIso.slice(0, 7), mAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 7)
    const suma = pref => ordenes.filas.filter(o => o.estado !== 'cancelada' && (o.fecha ?? '').startsWith(pref)).reduce((s, o) => s + num(o.total), 0)
    const abiertasCxp = cxp.filas.filter(c => !['pagada', 'cancelada'].includes(c.estado))
    const prox = abiertasCxp.map(c => c.fecha_vencimiento).filter(Boolean).sort()[0]
    return {
      abiertas: abiertas.length, totalAbiertas: abiertas.reduce((s, o) => s + num(o.total), 0), porRecibir,
      mes: suma(m), ant: suma(mAnt), pendAut: ordenes.filas.filter(o => o.pendiente_autorizacion).length,
      cxp: abiertasCxp.reduce((s, c) => s + num(c.saldo), 0), prox,
    }
  }, [ordenes.filas, cxp.filas])
  const trend = k.ant > 0 ? Math.round((k.mes - k.ant) / k.ant * 100) : undefined
  const filas = useMemo(() => ordenes.filas.filter(o => !mes || (o.fecha ?? '').startsWith(mes)).map(o => ({ ...o, estadoTxt: ESTADO_OC[o.estado] ?? o.estado })), [ordenes.filas, mes])

  return (
    <div className="pagina">
      <PageHeader titulo="Compras a proveedores" subtitulo="Órdenes de compra con autorización por monto, recepción parcial y cuenta por pagar automática"
        acciones={puedeEditar && <button className="btn" onClick={() => setEditor({ id: null })}><Plus size={14} /> Nueva orden de compra</button>} />
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="Órdenes abiertas" value={k.abiertas} subtitle={verCostos ? moneda(k.totalAbiertas) : undefined} icon={ShoppingCart} loading={ordenes.cargando} />
        <KPICard title="Por recibir esta semana" value={k.porRecibir} icon={CalendarClock} color="var(--gold)" loading={ordenes.cargando} />
        {verCostos && <KPICard title="Compras del mes" value={moneda(k.mes)} icon={Wallet} color="var(--green)" trend={trend} loading={ordenes.cargando} />}
        <KPICard title="Pendientes de autorizar" value={k.pendAut} icon={FileClock} color={k.pendAut ? 'var(--red)' : undefined} loading={ordenes.cargando} />
        {verCostos && <KPICard title="Cuentas por pagar" value={moneda(k.cxp)} subtitle={k.prox ? `próximo vencimiento ${fecha(k.prox)}` : undefined} icon={Wallet} color="var(--accent)" loading={cxp.cargando} />}
      </div>
      <Tabs value={tab} onChange={t => setSp({ tab: t })} items={[
        { id: 'ordenes', label: 'Órdenes', badge: ordenes.filas.length || null }, { id: 'recepciones', label: 'Recepciones' },
        { id: 'devoluciones', label: 'Devoluciones', oculto: !puedeEditar || !verCostos }, { id: 'analisis', label: 'Análisis por proveedor', oculto: !puedeEditar || !verCostos },
      ]} />
      {tab === 'ordenes' && (
        <DataTable cargando={ordenes.cargando} error={msgError(ordenes.error)} filas={filas} exportarNombre="ordenes_compra" placeholderBusqueda="Buscar folio o proveedor…" onFila={o => setDetalle(o.id)}
          acciones={<input type="month" value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes" />}
          columnas={columnasVisibles([
            { key: 'folio', label: 'Folio', render: o => <b>{o.folio}</b> }, { key: 'fecha', label: 'Fecha', render: o => fecha(o.fecha) },
            { key: 'proveedor_nombre', label: 'Proveedor', filtro: true }, { key: 'sede_nombre', label: 'Sede', filtro: true },
            colCosto({ key: 'total', label: 'Total', align: 'right', render: o => moneda(o.total), valor: o => num(o.total) }),
            { key: 'estadoTxt', label: 'Estado', filtro: true, render: o => <><StatusBadge estado={o.estado} label={ESTADO_OC[o.estado]} />{o.pendiente_autorizacion && <span className="bd a" style={{ marginLeft: 4 }}>Por autorizar</span>}</> },
            colCosto({ key: 'estado_pago', label: 'Pago', render: o => ESTADO_PAGO[o.estado_pago] ?? o.estado_pago }),
            { key: 'entrega_esperada', label: 'Entrega', render: o => (o.entrega_esperada ? fecha(o.entrega_esperada) : '—') },
            { key: 'unidades_pendientes', label: 'Pend.', align: 'right', render: o => (['enviada', 'recibida_parcial'].includes(o.estado) ? qty(o.unidades_pendientes) : '—') },
          ], verCostos)} vacio={{ title: 'Sin órdenes de compra', description: 'Crea una orden para comprar a un proveedor y recibir la mercancía en la sucursal.' }} />
      )}
      {tab === 'recepciones' && <Recepciones verCostos={verCostos} />}
      {verCostos && tab === 'devoluciones' && <Devoluciones />}
      {verCostos && tab === 'analisis' && <Analisis />}
      {editor && <OrdenEditor id={editor.id} inicial={editor.inicial} onClose={() => setEditor(null)} onGuardada={id => { setEditor(null); setDetalle(id) }} />}
      {detalle && <OrdenDetalle id={detalle} onClose={() => setDetalle(null)} onEditar={() => { const i = detalle; setDetalle(null); setEditor({ id: i }) }} />}
    </div>
  )
}

function Recepciones({ verCostos }) {
  const { mapa: provs } = useProveedores()
  const { sedes } = useApp()
  const r = useLectura('recepciones', 'prp_recepciones', { orden: { columna: 'fecha', asc: false }, limite: 2000 })
  return <DataTable cargando={r.cargando} error={msgError(r.error)} filas={r.filas} exportarNombre="recepciones"
    columnas={columnasVisibles([
      { key: 'folio', label: 'Folio', render: x => <b>{x.folio}</b> }, { key: 'fecha', label: 'Fecha', render: x => fecha(x.fecha) }, { key: 'oc_folio', label: 'Orden' },
      { key: 'prov', label: 'Proveedor', filtro: true, valor: x => provs[x.proveedor_id]?.nombre ?? '—' }, { key: 'sede', label: 'Sede', filtro: true, valor: x => sedes.find(s => s.id === x.sede_id)?.nombre ?? '—' },
      { key: 'partidas', label: 'Partidas', align: 'right' }, { key: 'estado', label: 'Estado', render: x => <StatusBadge estado={x.estado === 'completa' ? 'recibida' : 'recibida_parcial'} label={x.estado === 'completa' ? 'Completa' : 'Parcial'} /> },
      { key: 'factura_numero', label: 'Factura', render: x => x.factura_numero ?? '—' }, colCosto({ key: 'factura_importe', label: 'Importe', align: 'right', render: x => (x.factura_importe == null ? '—' : moneda(x.factura_importe)) }),
      colCosto({ key: 'factura_vencimiento', label: 'Vence', render: x => (x.factura_vencimiento ? fecha(x.factura_vencimiento) : '—') }),
    ], verCostos)} vacio={{ title: 'Sin recepciones', description: 'Se registran desde el detalle de una orden enviada.' }} />
}

function Devoluciones() {
  const { mapa: provs } = useProveedores()
  const { mapa } = useProductos()
  const r = useLectura('devoluciones', 'devoluciones_proveedor', { orden: { columna: 'fecha', asc: false }, limite: 1000 })
  return <DataTable cargando={r.cargando} error={msgError(r.error)} filas={r.filas} exportarNombre="devoluciones_proveedor"
    columnas={[
      { key: 'fecha', label: 'Fecha', render: x => fecha(x.fecha) }, { key: 'prov', label: 'Proveedor', filtro: true, valor: x => provs[x.proveedor_id]?.nombre ?? '—' },
      { key: 'producto', label: 'Producto', valor: x => mapa[x.producto_id]?.nombre ?? '—' }, { key: 'cantidad', label: 'Cant.', align: 'right', render: x => qty(x.cantidad) },
      { key: 'motivo', label: 'Motivo' }, { key: 'monto_credito', label: 'Crédito', align: 'right', render: x => moneda(x.monto_credito) },
    ]} vacio={{ title: 'Sin devoluciones', description: 'Las devoluciones se registran desde una orden recibida y descuentan inventario.' }} />
}

/** Agrupa prp_compras_proveedor por proveedor (y por mes) dentro de un rango de meses y una sede. */
export function agruparCompras(filas, { desde, hasta, sedeId } = {}) {
  const por = new Map(), mensual = new Map()
  for (const f of filas) {
    const mes = (f.mes ?? '').slice(0, 7)
    if ((desde && mes < desde) || (hasta && mes > hasta) || (sedeId && f.sede_id !== sedeId)) continue
    const p = por.get(f.proveedor_id) ?? { proveedor_id: f.proveedor_id, proveedor: f.proveedor_nombre, ordenes: 0, ordenado: 0, recibido: 0, pagado: 0, ultimo: '' }
    p.ordenes += num(f.num_ordenes); p.ordenado += num(f.total_ordenado); p.recibido += num(f.total_recibido); p.pagado += num(f.total_pagado); if (mes > p.ultimo) p.ultimo = mes
    por.set(f.proveedor_id, p)
    mensual.set(mes, (mensual.get(mes) ?? 0) + num(f.total_ordenado))
  }
  const lista = [...por.values()].sort((a, b) => b.ordenado - a.ordenado)
  const total = lista.reduce((s, p) => s + p.ordenado, 0)
  return { lista: lista.map(p => ({ ...p, pct: total ? p.ordenado / total * 100 : 0 })), total, mensual: [...mensual.entries()].sort().map(([mes, total]) => ({ mes, total })) }
}

function Analisis() {
  const { sedes } = useApp()
  const r = useLectura('analisis-compras', 'prp_compras_proveedor', { limite: 10000 })
  const anio = new Date().getFullYear()
  const [rango, setRango] = useState({ desde: `${anio}-01`, hasta: `${anio}-12` })
  const [sedeId, setSedeId] = useState('')
  const a = useMemo(() => agruparCompras(r.filas, { ...rango, sedeId }), [r.filas, rango, sedeId])
  return (
    <>
      <div className="toolbar">
        <label style={{ fontSize: 12 }}>Desde <input type="month" value={rango.desde} onChange={e => setRango({ ...rango, desde: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Hasta <input type="month" value={rango.hasta} onChange={e => setRango({ ...rango, hasta: e.target.value })} /></label>
        <select value={sedeId} onChange={e => setSedeId(e.target.value)}><option value="">Todas las sedes</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
      </div>
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Total ordenado" value={moneda(a.total)} loading={r.cargando} />
        <KPICard title="Proveedores con compras" value={a.lista.length} loading={r.cargando} />
        <KPICard title="Mayor proveedor" value={a.lista[0] ? porcentaje(a.lista[0].pct) : '—'} subtitle={a.lista[0]?.proveedor} color="var(--gold)" loading={r.cargando} />
      </div>
      {a.mensual.length > 0 && <div className="card" style={{ height: 220, marginBottom: 12 }}>
        <ResponsiveContainer><BarChart data={a.mensual}><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} tickFormatter={v => `$${Math.round(v / 1000)}k`} /><Tooltip formatter={v => moneda(v)} /><Bar dataKey="total" name="Ordenado" fill="var(--accent)" /></BarChart></ResponsiveContainer>
      </div>}
      <DataTable cargando={r.cargando} error={msgError(r.error)} filas={a.lista} filaKey="proveedor_id" exportarNombre="compras_por_proveedor" sinPaginacion
        columnas={[
          { key: 'proveedor', label: 'Proveedor', render: p => <b>{p.proveedor}</b> }, { key: 'ordenes', label: 'Órdenes', align: 'right' },
          { key: 'ordenado', label: 'Ordenado', align: 'right', render: p => moneda(p.ordenado) }, { key: 'recibido', label: 'Recibido', align: 'right', render: p => moneda(p.recibido) },
          { key: 'pagado', label: 'Pagado', align: 'right', render: p => moneda(p.pagado) }, { key: 'pct', label: '%', align: 'right', render: p => porcentaje(p.pct) },
          { key: 'ultimo', label: 'Última compra' },
        ]} vacio={{ title: 'Sin compras en el periodo', description: 'Ajusta el rango de meses o la sede.' }} />
    </>
  )
}
