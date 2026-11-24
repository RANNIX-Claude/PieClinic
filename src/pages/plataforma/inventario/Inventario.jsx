// Pantalla 21 · Inventario por sucursal. Existencias por producto y sede, matriz «¿qué hay en cada tienda?», lotes y caducidad, kardex.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRightLeft, ShoppingCart, ClipboardCheck, Plus, Package, AlertTriangle, Clock, Wallet } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { insertar, actualizar, rpc } from '../../../lib/api'
import { moneda, fecha, fechaHora } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useLectura, useProductos, useAccion, msgError, BadgeExist, etiquetaEstadoExist, PRIORIDAD_EXIST, TIPO_MOV, ACCION_LOTE, ESTADO_LOTE, SelectorProducto, num, qty } from './comun'

export default function Inventario() {
  const nav = useNavigate()
  const { sedes, sedeActivaId } = useApp()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'existencias'
  const puedeMinimos = usePermiso('inventario.autorizar')
  const puedeOperar = usePermiso('inventario.operar')
  const { productos, mapa, cargando: cp, error: ep } = useProductos()
  const inv = useLectura('inventario', 'prp_inventario')
  const lotes = useLectura('lotes', 'prp_lotes')
  const [asignar, setAsignar] = useState(false)
  const [editar, setEditar] = useState(null) // producto_id

  const sedesVista = sedeActivaId ? sedes.filter(s => s.id === sedeActivaId) : sedes
  const error = ep || inv.error

  const kpis = useMemo(() => {
    const conExist = new Set(inv.filas.filter(i => num(i.existencia) > 0).map(i => i.producto_id))
    const sinExist = inv.filas.filter(i => i.estado === 'sin_existencia').length
    const bajo = inv.filas.filter(i => i.estado === 'bajo_minimo').length
    const criticos = inv.filas.filter(i => i.estado === 'bajo_minimo' && num(i.existencia) <= num(i.minimo) / 2).length
    const caducan = lotes.filas.filter(l => num(l.existencia) > 0 && l.dias_para_caducar != null && l.dias_para_caducar <= 90).length
    const porSede = {}
    inv.filas.forEach(i => { porSede[i.sede_nombre] = (porSede[i.sede_nombre] ?? 0) + num(i.valor) })
    const valor = Object.values(porSede).reduce((s, v) => s + v, 0)
    return { conExist: conExist.size, total: productos.length, sinExist, bajo, criticos, caducan, valor, porSede }
  }, [inv.filas, lotes.filas, productos])

  return (
    <div className="pagina">
      <PageHeader titulo="Inventario por sucursal" subtitulo="Existencias, mínimos, lotes y caducidad por producto y sede"
        acciones={<>
          <button className="btn o" onClick={() => nav('/traspasos')}><ArrowRightLeft size={14} /> Traspaso</button>
          <button className="btn o" onClick={() => nav('/compras')}><ShoppingCart size={14} /> Orden de compra</button>
          <button className="btn o" onClick={() => nav('/mermas-conteos')}><ClipboardCheck size={14} /> Conteo / merma</button>
          {puedeMinimos && <button className="btn" onClick={() => setAsignar(true)}><Plus size={14} /> Producto en sede</button>}
        </>} />
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="Productos con existencia" value={`${kpis.conExist} de ${kpis.total}`} subtitle={`${kpis.sinExist} producto-sede sin existencia`} icon={Package} loading={inv.cargando || cp} />
        <KPICard title="Bajo mínimo (producto-sede)" value={kpis.bajo} subtitle={`${kpis.criticos} críticos (≤ mitad del mínimo)`} icon={AlertTriangle} color="var(--gold)" loading={inv.cargando} />
        <KPICard title="Próximos a caducar (90 d)" value={`${kpis.caducan} lotes`} icon={Clock} color="var(--red)" loading={lotes.cargando} />
        <KPICard title="Valor de inventario" value={moneda(kpis.valor)} icon={Wallet} color="var(--green)" loading={inv.cargando}
          subtitle={Object.entries(kpis.porSede).map(([s, v]) => `${s} ${moneda(v)}`).join(' · ') || undefined}
          ayuda="Existencia × costo promedio vigente (P-083). La existencia negativa se muestra y se alerta, pero resta al valor." />
      </div>
      <Tabs value={tab} onChange={t => setSp({ tab: t })} items={[
        { id: 'existencias', label: 'Existencias' }, { id: 'matriz', label: '¿Qué hay en cada tienda?' },
        { id: 'lotes', label: 'Lotes y caducidad', badge: kpis.caducan || null }, { id: 'kardex', label: 'Kardex' },
      ]} />
      {tab === 'existencias' && <Existencias {...{ productos, inv, sedesVista, nav, puedeMinimos, setEditar, error, cargando: inv.cargando || cp }} />}
      {tab === 'matriz' && <Matriz {...{ productos, inv, sedesVista, nav }} />}
      {tab === 'lotes' && <Lotes {...{ lotes, mapa, puedeOperar: puedeMinimos, nav }} />}
      {tab === 'kardex' && <Kardex {...{ mapa, productos }} />}
      {editar && <ModalMinimos productoId={editar} producto={mapa[editar]} inv={inv.filas} sedes={sedes} onClose={() => setEditar(null)} />}
      {asignar && <ModalAsignar productos={productos} sedes={sedes} inv={inv.filas} onClose={() => setAsignar(false)} />}
    </div>
  )
}

/** Agrupa prp_inventario por producto con una columna por sede. */
function pivote(productos, invFilas, sedesVista) {
  const por = new Map()
  invFilas.forEach(i => { if (!por.has(i.producto_id)) por.set(i.producto_id, []); por.get(i.producto_id).push(i) })
  return productos.map(p => {
    const filas = (por.get(p.id) ?? []).filter(i => sedesVista.some(s => s.id === i.sede_id))
    const porSede = Object.fromEntries(filas.map(i => [i.sede_id, i]))
    const estado = filas.length ? PRIORIDAD_EXIST.find(e => filas.some(i => i.estado === e)) ?? 'ok' : 'sin_asignar'
    const cads = filas.map(i => i.proxima_caducidad).filter(Boolean).sort()
    return {
      id: p.id, sku: p.sku, nombre: p.nombre, categoria: p.categoria, porSede, estado,
      total: filas.reduce((s, i) => s + num(i.existencia), 0),
      minimos: sedesVista.map(s => (porSede[s.id] ? qty(porSede[s.id].minimo) : '—')).join(' / '),
      caducidad: cads[0] ?? null, costo: num(p.costo_promedio), valor: filas.reduce((s, i) => s + num(i.valor), 0),
      negativa: filas.some(i => i.existencia_negativa),
    }
  })
}

function Existencias({ productos, inv, sedesVista, nav, puedeMinimos, setEditar, error, cargando }) {
  const [soloBajo, setSoloBajo] = useState(false)
  const filas = useMemo(() => pivote(productos, inv.filas, sedesVista).filter(f => !soloBajo || ['bajo_minimo', 'sin_existencia'].includes(f.estado)), [productos, inv.filas, sedesVista, soloBajo])
  const cols = [
    { key: 'sku', label: 'SKU' },
    { key: 'nombre', label: 'Producto', render: f => <b>{f.nombre}</b> },
    { key: 'categoria', label: 'Categoría', filtro: true },
    ...sedesVista.map(s => ({
      key: `s_${s.id}`, label: s.nombre, align: 'right', valor: f => (f.porSede[s.id] ? num(f.porSede[s.id].existencia) : null),
      render: f => { const i = f.porSede[s.id]; if (!i) return <span style={{ color: 'var(--muted)' }}>—</span>
        const c = i.estado === 'sin_existencia' ? 'var(--red)' : i.estado === 'bajo_minimo' ? 'var(--gold)' : undefined
        return <b style={{ color: c }}>{qty(i.existencia)}</b> },
    })),
    { key: 'total', label: 'Total', align: 'right', render: f => <b>{qty(f.total)}</b>, valor: f => f.total },
    { key: 'minimos', label: `Mínimo ${sedesVista.map(s => s.clave ?? s.nombre.slice(0, 1)).join('/')}`, sortable: false },
    { key: 'caducidad', label: 'Próx. caducidad', render: f => (f.caducidad ? fecha(f.caducidad) : '—') },
    { key: 'costo', label: 'Costo prom.', align: 'right', render: f => moneda(f.costo) },
    { key: 'valor', label: 'Valor', align: 'right', render: f => moneda(f.valor) },
    { key: 'estadoTxt', label: 'Estado', filtro: true, valor: f => etiquetaEstadoExist(f.estado), render: f => <><BadgeExist estado={f.estado} />{f.negativa && <span className="bd r" style={{ marginLeft: 4 }} title="Existencia negativa: revisar ventas sin existencia">Negativa</span>}</> },
    ...(puedeMinimos ? [{ key: 'acc', label: '', sortable: false, exportar: false, render: f => <button className="btn o sm" onClick={e => { e.stopPropagation(); setEditar(f.id) }}>Mín/Máx</button> }] : []),
  ]
  return <DataTable columnas={cols} filas={filas} cargando={cargando} error={msgError(error)} exportarNombre="inventario_por_sucursal"
    placeholderBusqueda="Buscar SKU o producto…" onFila={f => nav(`/inventario/producto/${f.id}`)} tamanoPagina={30}
    vacio={{ title: 'Sin productos', description: 'No hay productos en el catálogo o no tienes sedes asignadas.' }}
    acciones={<label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={soloBajo} onChange={e => setSoloBajo(e.target.checked)} /> Solo bajo mínimo</label>} />
}

function Matriz({ productos, inv, sedesVista, nav }) {
  const [q, setQ] = useState('')
  const hallados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return productos.filter(p => `${p.sku} ${p.nombre} ${p.marca ?? ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [q, productos])
  return (
    <div className="card">
      <h3 style={{ marginBottom: 8 }}>¿Qué producto hay en cada tienda?</h3>
      <div className="toolbar"><input style={{ minWidth: 300 }} placeholder="Buscar producto (ej. laca antimicótica)…" value={q} onChange={e => setQ(e.target.value)} /></div>
      {q.trim().length < 2 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Escribe al menos 2 letras del nombre, SKU o marca.</div>}
      {q.trim().length >= 2 && !hallados.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin coincidencias.</div>}
      {hallados.map(p => {
        const filas = sedesVista.map(s => ({ s, i: inv.filas.find(i => i.producto_id === p.id && i.sede_id === s.id) }))
        const totalE = filas.reduce((a, f) => a + num(f.i?.existencia), 0), totalM = filas.reduce((a, f) => a + num(f.i?.minimo), 0)
        return (
          <div key={p.id} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, cursor: 'pointer' }} onClick={() => nav(`/inventario/producto/${p.id}`)}>{p.nombre} <small style={{ color: 'var(--muted)', fontWeight: 400 }}>{p.sku}</small></div>
            <div className="tabla-wrap"><table>
              <thead><tr><th>Sucursal</th><th style={{ textAlign: 'right' }}>Existencia</th><th style={{ textAlign: 'right' }}>Mínimo</th><th>Estado</th></tr></thead>
              <tbody>
                {filas.map(({ s, i }) => (
                  <tr key={s.id}><td>{s.nombre}</td><td style={{ textAlign: 'right' }}>{i ? qty(i.existencia) : '—'}</td><td style={{ textAlign: 'right' }}>{i ? qty(i.minimo) : '—'}</td>
                    <td>{i ? <BadgeExist estado={i.estado} /> : <span style={{ color: 'var(--muted)' }}>No se maneja en esta sede</span>}</td></tr>
                ))}
                <tr className="tot"><td><b>Total</b></td><td style={{ textAlign: 'right' }}><b>{qty(totalE)}</b></td><td style={{ textAlign: 'right' }}><b>{qty(totalM)}</b></td><td /></tr>
              </tbody></table></div>
          </div>
        )
      })}
    </div>
  )
}

function Lotes({ lotes, mapa, puedeOperar, nav }) {
  const { correr } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const filas = lotes.filas.filter(l => num(l.existencia) > 0 || l.estado === 'bloqueado').map(l => ({ ...l, producto: mapa[l.producto_id]?.nombre ?? '—', sku: mapa[l.producto_id]?.sku ?? '' }))
  const cambiar = async (l, estado) => {
    if (estado === 'bloqueado' && !(await confirmar({ titulo: 'Bloquear lote', mensaje: `El lote ${l.numero_lote ?? '(sin número)'} de ${l.producto} no se podrá usar hasta desbloquearlo.`, peligro: true, textoConfirmar: 'Bloquear' }))) return
    await correr(() => rpc('lote_cambiar_estado', { p_lote: l.id, p_estado: estado }), estado === 'bloqueado' ? 'Lote bloqueado' : 'Lote desbloqueado')
  }
  const cols = [
    { key: 'producto', label: 'Producto', render: l => <><b>{l.producto}</b> <small style={{ color: 'var(--muted)' }}>{l.sku}</small></> },
    { key: 'numero_lote', label: 'Lote', render: l => l.numero_lote ?? '—' },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'caducidad', label: 'Caduca', render: l => (l.caducidad ? fecha(l.caducidad) : 'Sin caducidad') },
    { key: 'existencia', label: 'Existencia', align: 'right', render: l => qty(l.existencia), valor: l => num(l.existencia) },
    { key: 'dias_para_caducar', label: 'Días', align: 'right', render: l => (l.dias_para_caducar == null ? '—' : <span style={{ color: l.dias_para_caducar < 0 ? 'var(--red)' : l.dias_para_caducar <= 90 ? 'var(--gold)' : undefined, fontWeight: 700 }}>{l.dias_para_caducar}</span>) },
    { key: 'accion', label: 'Acción sugerida', filtro: true, valor: l => ACCION_LOTE[l.accion_sugerida] ?? '', render: l => ACCION_LOTE[l.accion_sugerida] ?? '—' },
    { key: 'estadoL', label: 'Estado', filtro: true, valor: l => ESTADO_LOTE[l.estado] ?? l.estado, render: l => <StatusBadge estado={l.estado} label={ESTADO_LOTE[l.estado]} variante={l.estado === 'bloqueado' ? 'r' : l.estado === 'agotado' ? 'n' : 'v'} /> },
    { key: 'acc', label: '', sortable: false, exportar: false, render: l => (
      <div style={{ display: 'flex', gap: 4 }}>
        {puedeOperar && (l.estado === 'bloqueado' ? <button className="btn o sm" onClick={() => cambiar(l, 'vigente')}>Desbloquear</button> : <button className="btn o sm" onClick={() => cambiar(l, 'bloqueado')}>Bloquear</button>)}
        {l.accion_sugerida === 'rematar_o_mermar' && <button className="btn o sm" onClick={() => nav(`/mermas-conteos?nueva=1&producto=${l.producto_id}&lote=${l.id}&sede=${l.sede_id}`)}>Dar de baja</button>}
      </div>) },
  ]
  return <>{dialogo}<DataTable columnas={cols} filas={filas} cargando={lotes.cargando} error={msgError(lotes.error)} exportarNombre="lotes_caducidad"
    vacio={{ title: 'Sin lotes', description: 'Los lotes aparecen al recibir mercancía de productos que manejan lote o caducidad.' }} /></>
}

const TIPOS_FILTRO = Object.values(TIPO_MOV)
function Kardex({ mapa, productos }) {
  const [producto, setProducto] = useState('')
  const k = useLectura('kardex', 'prp_kardex', { orden: { columna: 'fecha', asc: false }, limite: 1000, filtros: producto ? { producto_id: producto } : {} })
  const filas = k.filas.map(m => ({ ...m, producto: mapa[m.producto_id]?.nombre ?? '—', tipoTxt: TIPO_MOV[m.tipo] ?? m.tipo }))
  const cols = [
    { key: 'fecha', label: 'Fecha', render: m => fechaHora(m.fecha), valor: m => m.fecha },
    { key: 'tipoTxt', label: 'Tipo', filtro: true },
    { key: 'producto', label: 'Producto' },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'cantidad', label: 'Cant.', align: 'right', valor: m => num(m.cantidad), render: m => <b style={{ color: num(m.cantidad) < 0 ? 'var(--red)' : 'var(--green)' }}>{num(m.cantidad) > 0 ? '+' : ''}{qty(m.cantidad)}</b> },
    { key: 'costo_unitario', label: 'Costo unit.', align: 'right', render: m => (m.costo_unitario == null ? '—' : moneda(m.costo_unitario)) },
    { key: 'referencia_folio', label: 'Referencia', render: m => m.referencia_folio ?? m.referencia_tipo ?? '—' },
    { key: 'nota', label: 'Nota', render: m => m.nota ?? '' },
  ]
  return <DataTable columnas={cols} filas={filas} cargando={k.cargando} error={msgError(k.error)} exportarNombre="kardex" tamanoPagina={30}
    acciones={<div style={{ minWidth: 260 }}><SelectorProducto productos={productos} value={producto} onChange={setProducto} placeholder="Filtrar por producto…" /></div>}
    vacio={{ title: 'Sin movimientos', description: 'El kardex registra cada entrada y salida. Ningún movimiento se edita ni se borra.' }} />
}

function ModalMinimos({ productoId, producto, inv, sedes, onClose }) {
  const { correr, ocupado } = useAccion()
  const [vals, setVals] = useState(() => Object.fromEntries(sedes.map(s => {
    const i = inv.find(x => x.producto_id === productoId && x.sede_id === s.id)
    return [s.id, { id: i?.id ?? null, minimo: i?.minimo ?? '', maximo: i?.maximo ?? '', ubicacion: i?.ubicacion ?? '', activo: !!i }]
  })))
  const set = (sid, k, v) => setVals(x => ({ ...x, [sid]: { ...x[sid], [k]: v } }))
  const invalido = Object.values(vals).some(v => v.activo && v.maximo !== '' && num(v.maximo) < num(v.minimo))
  const guardar = async () => {
    const ok = await correr(async () => {
      for (const s of sedes) {
        const v = vals[s.id]
        if (!v.activo) continue
        const datos = { minimo: num(v.minimo), maximo: v.maximo === '' ? null : num(v.maximo), ubicacion: v.ubicacion || null }
        const r = v.id ? await actualizar('inventario_sede', v.id, datos) : await insertar('inventario_sede', { sede_id: s.id, producto_id: productoId, ...datos })
        if (r.error) return r
      }
      return { data: true }
    }, 'Mínimos y máximos guardados')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Mínimos y máximos · ${producto?.nombre ?? ''}`} size="wide"
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || invalido} onClick={guardar}>Guardar</button></>}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Los mínimos los fija Administración (P-084). La existencia solo cambia por movimientos del kardex.</div>
      <div className="tabla-wrap"><table>
        <thead><tr><th>Sede</th><th>Se maneja</th><th>Mínimo</th><th>Máximo</th><th>Ubicación</th></tr></thead>
        <tbody>{sedes.map(s => { const v = vals[s.id]; return (
          <tr key={s.id}><td>{s.nombre}</td>
            <td><input type="checkbox" checked={v.activo} onChange={e => set(s.id, 'activo', e.target.checked)} /></td>
            <td><input type="number" min="0" disabled={!v.activo} value={v.minimo} onChange={e => set(s.id, 'minimo', e.target.value)} style={{ width: 90 }} /></td>
            <td><input type="number" min="0" disabled={!v.activo} value={v.maximo} onChange={e => set(s.id, 'maximo', e.target.value)} style={{ width: 90 }} /></td>
            <td><input disabled={!v.activo} value={v.ubicacion} onChange={e => set(s.id, 'ubicacion', e.target.value)} placeholder="Estante / bodega" /></td></tr>) })}</tbody></table></div>
      {invalido && <div className="err" style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>El máximo no puede ser menor que el mínimo.</div>}
    </Modal>
  )
}

function ModalAsignar({ productos, sedes, inv, onClose }) {
  const { correr, ocupado } = useAccion()
  const [f, setF] = useState({ producto_id: '', sede_id: sedes[0]?.id ?? '', minimo: 0, maximo: '', ubicacion: '' })
  const existe = inv.some(i => i.producto_id === f.producto_id && i.sede_id === f.sede_id)
  const guardar = async () => {
    const ok = await correr(() => insertar('inventario_sede', { producto_id: f.producto_id, sede_id: f.sede_id, minimo: num(f.minimo), maximo: f.maximo === '' ? null : num(f.maximo), ubicacion: f.ubicacion || null }), 'Producto asignado a la sede')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Asignar producto a una sede" size="sm"
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.producto_id || !f.sede_id || existe || (f.maximo !== '' && num(f.maximo) < num(f.minimo))} onClick={guardar}>Asignar</button></>}>
      <FormField label="Producto" required><SelectorProducto productos={productos} value={f.producto_id} onChange={v => setF({ ...f, producto_id: v })} /></FormField>
      <FormField label="Sede" as="select" required value={f.sede_id} onChange={e => setF({ ...f, sede_id: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} error={existe ? 'Ya se maneja en esa sede' : undefined} />
      <div className="grid2">
        <FormField label="Mínimo" type="number" min="0" value={f.minimo} onChange={e => setF({ ...f, minimo: e.target.value })} />
        <FormField label="Máximo" type="number" min="0" value={f.maximo} onChange={e => setF({ ...f, maximo: e.target.value })} />
      </div>
      <FormField label="Ubicación" value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })} />
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>La existencia inicia en 0; se suma con una compra, traspaso o conteo físico autorizado.</div>
    </Modal>
  )
}
