// Mermas (E91) y conteos físicos (E90). Los ajustes los autoriza solo Administración (P-086): merma_resolver y conteo_autorizar.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, ClipboardCheck, Trash2, AlertTriangle } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { insertar, actualizar, borrar, rpc } from '../../../lib/api'
import { moneda, fecha, fechaHora } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useLectura, useProductos, useAccion, msgError, SelectorProducto, num, qty, hoy } from './comun'

const TIPO_MERMA = { merma: 'Merma', caducidad: 'Caducidad', danio: 'Daño', reclamacion_traspaso: 'Reclamación de traspaso', otro: 'Otro' }
const ESTADO_MERMA = { pendiente: 'Pendiente', autorizada: 'Autorizada', rechazada: 'Rechazada' }
const ESTADO_CONTEO = { borrador: 'Borrador', capturado: 'Capturado', autorizado: 'Autorizado', cancelado: 'Cancelado' }

export default function MermasConteos() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'mermas'
  return (
    <div className="pagina">
      <PageHeader titulo="Mermas y conteos físicos" subtitulo="Bajas de inventario y ajustes por conteo: se capturan en la sucursal y los autoriza Administración" />
      <Tabs value={tab} onChange={t => setSp({ tab: t })} items={[{ id: 'mermas', label: 'Mermas y reclamaciones' }, { id: 'conteos', label: 'Conteos físicos' }]} />
      {tab === 'mermas' ? <Mermas sp={sp} /> : <Conteos />}
    </div>
  )
}

function Mermas({ sp }) {
  const { sedes, sedeActivaId } = useApp()
  const { mapa } = useProductos()
  const { correr, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const esAdmin = usePermiso('inventario.autorizar')
  const puedeOperar = usePermiso('inventario.operar')
  const m = useLectura('mermas', 'prp_mermas', { orden: { columna: 'created_at', asc: false }, limite: 2000 })
  const [nueva, setNueva] = useState(sp.get('nueva') ? { sede: sp.get('sede'), producto: sp.get('producto'), lote: sp.get('lote') } : null)
  const filas = m.filas.map(x => ({ ...x, producto: mapa[x.producto_id]?.nombre ?? '—', tipoTxt: TIPO_MERMA[x.tipo] ?? x.tipo, estadoTxt: ESTADO_MERMA[x.estado] ?? x.estado }))
  const k = useMemo(() => {
    const pend = m.filas.filter(x => x.estado === 'pendiente')
    return { pend: pend.length, valor: pend.reduce((s, x) => s + num(x.valor_estimado), 0), recl: pend.filter(x => x.es_reclamacion).length,
      mes: m.filas.filter(x => x.estado === 'autorizada' && !x.es_reclamacion && (x.autorizado_en ?? '').startsWith(hoy().slice(0, 7))).reduce((s, x) => s + num(x.valor_estimado), 0) }
  }, [m.filas])
  const resolver = async (x, autorizar) => {
    const texto = autorizar ? (x.es_reclamacion ? 'Se reconoce la reclamación (no vuelve a descontar inventario).' : `Se descontarán ${qty(x.cantidad)} del inventario de ${x.sede_nombre}.`) : 'La merma quedará rechazada y no moverá el inventario.'
    if (await confirmar({ titulo: autorizar ? 'Autorizar merma' : 'Rechazar merma', mensaje: `${x.producto}: ${texto}`, peligro: !autorizar, textoConfirmar: autorizar ? 'Autorizar' : 'Rechazar' }))
      await correr(() => rpc('merma_resolver', { p_merma: x.id, p_autorizar: autorizar }), autorizar ? 'Merma autorizada' : 'Merma rechazada')
  }
  return (
    <>
      {dialogo}
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="Pendientes de autorizar" value={k.pend} icon={Trash2} color="var(--gold)" loading={m.cargando} />
        <KPICard title="Valor estimado pendiente" value={moneda(k.valor)} loading={m.cargando} />
        <KPICard title="Reclamaciones de traspaso" value={k.recl} icon={AlertTriangle} color="var(--red)" subtitle="Diferencias en recepción" loading={m.cargando} />
        <KPICard title="Mermas autorizadas del mes" value={moneda(k.mes)} color="var(--accent)" loading={m.cargando} />
      </div>
      <DataTable cargando={m.cargando} error={msgError(m.error)} filas={filas} exportarNombre="mermas"
        acciones={puedeOperar && <button className="btn" onClick={() => setNueva({ sede: sedeActivaId })}><Plus size={14} /> Registrar merma</button>}
        columnas={[
          { key: 'folio', label: 'Folio', render: x => <b>{x.folio}</b> }, { key: 'created_at', label: 'Fecha', render: x => fechaHora(x.created_at) },
          { key: 'producto', label: 'Producto' }, { key: 'sede_nombre', label: 'Sede', filtro: true }, { key: 'cantidad', label: 'Cant.', align: 'right', render: x => qty(x.cantidad) },
          { key: 'tipoTxt', label: 'Tipo', filtro: true }, { key: 'motivo', label: 'Motivo' }, { key: 'valor_estimado', label: 'Valor est.', align: 'right', render: x => moneda(x.valor_estimado) },
          { key: 'estadoTxt', label: 'Estado', filtro: true, render: x => <StatusBadge estado={x.estado} label={ESTADO_MERMA[x.estado]} variante={x.estado === 'pendiente' ? 'a' : undefined} /> },
          ...(esAdmin ? [{ key: 'acc', label: '', sortable: false, exportar: false, render: x => x.estado === 'pendiente' && (
            <div style={{ display: 'flex', gap: 4 }}><button className="btn sm" disabled={ocupado} onClick={() => resolver(x, true)}>Autorizar</button><button className="btn o sm" disabled={ocupado} onClick={() => resolver(x, false)}>Rechazar</button></div>) }] : []),
        ]} vacio={{ title: 'Sin mermas', description: 'Registra productos caducados, dañados o perdidos; Administración los autoriza antes de descontar.' }} />
      {nueva && <ModalMerma ini={nueva} onClose={() => setNueva(null)} />}
    </>
  )
}

function ModalMerma({ ini, onClose }) {
  const { sedes } = useApp()
  const { productos } = useProductos()
  const { correr, ocupado } = useAccion()
  const inv = useLectura('mm-inv', 'prp_inventario', { sedeId: null })
  const lotes = useLectura('mm-lotes', 'prp_lotes', { sedeId: null })
  const [f, setF] = useState({ sede_id: ini.sede ?? sedes[0]?.id ?? '', producto_id: ini.producto ?? '', lote_id: ini.lote ?? '', cantidad: '', tipo: 'merma', motivo: '' })
  const ids = new Set(inv.filas.filter(i => i.sede_id === f.sede_id).map(i => i.producto_id))
  const lotesP = lotes.filas.filter(l => l.sede_id === f.sede_id && l.producto_id === f.producto_id && num(l.existencia) > 0)
  const exist = num(inv.filas.find(i => i.sede_id === f.sede_id && i.producto_id === f.producto_id)?.existencia)
  const tope = f.lote_id ? num(lotes.filas.find(l => l.id === f.lote_id)?.existencia) : exist
  const guardar = async () => { const ok = await correr(() => insertar('mermas', { sede_id: f.sede_id, producto_id: f.producto_id, lote_id: f.lote_id || null, cantidad: num(f.cantidad), tipo: f.tipo, motivo: f.motivo.trim() }), 'Merma registrada, pendiente de autorización'); if (ok) onClose() }
  return (
    <Modal open onClose={onClose} title="Registrar merma" size="sm" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.producto_id || !(num(f.cantidad) > 0) || !f.motivo.trim()} onClick={guardar}>Registrar</button></>}>
      <FormField label="Sede" as="select" value={f.sede_id} onChange={e => setF({ ...f, sede_id: e.target.value, producto_id: '', lote_id: '' })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      <FormField label="Producto" required><SelectorProducto productos={productos} ids={ids} value={f.producto_id} onChange={v => setF({ ...f, producto_id: v, lote_id: '' })} /></FormField>
      {lotesP.length > 0 && <FormField label="Lote" as="select" value={f.lote_id} onChange={e => setF({ ...f, lote_id: e.target.value })} placeholder="Sin lote específico" options={lotesP.map(l => ({ value: l.id, label: `${l.numero_lote ?? 's/n'} · ${qty(l.existencia)} · ${l.caducidad ? fecha(l.caducidad) : 's/c'}` }))} />}
      <div className="grid2">
        <FormField label="Cantidad" type="number" min="0" step="any" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} hint={f.producto_id ? `Existencia: ${qty(tope)}` : undefined} error={num(f.cantidad) > tope && f.producto_id ? 'Más de la existencia (se permitirá solo si Administración lo autoriza)' : undefined} />
        <FormField label="Tipo" as="select" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} options={['merma', 'caducidad', 'danio', 'otro'].map(v => ({ value: v, label: TIPO_MERMA[v] }))} />
      </div>
      <FormField label="Motivo" required as="textarea" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} />
    </Modal>
  )
}

function Conteos() {
  const { sedes, sedeActivaId } = useApp()
  const puedeOperar = usePermiso('inventario.operar')
  const c = useLectura('conteos', 'conteos_fisicos', { orden: { columna: 'fecha', asc: false }, limite: 500 })
  const [nuevo, setNuevo] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const filas = c.filas.map(x => ({ ...x, sede: sedes.find(s => s.id === x.sede_id)?.nombre ?? '—', estadoTxt: ESTADO_CONTEO[x.estado] ?? x.estado }))
  return (
    <>
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="En captura" value={c.filas.filter(x => ['borrador', 'capturado'].includes(x.estado)).length} icon={ClipboardCheck} color="var(--gold)" loading={c.cargando} />
        <KPICard title="Autorizados" value={c.filas.filter(x => x.estado === 'autorizado').length} color="var(--green)" loading={c.cargando} />
      </div>
      <DataTable cargando={c.cargando} error={msgError(c.error)} filas={filas} exportarNombre="conteos_fisicos" onFila={x => setAbierto(x.id)}
        acciones={puedeOperar && <button className="btn" onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo conteo</button>}
        columnas={[
          { key: 'folio', label: 'Folio', render: x => <b>{x.folio}</b> }, { key: 'fecha', label: 'Fecha', render: x => fecha(x.fecha) }, { key: 'sede', label: 'Sede', filtro: true },
          { key: 'estadoTxt', label: 'Estado', filtro: true, render: x => <StatusBadge estado={x.estado} label={ESTADO_CONTEO[x.estado]} variante={x.estado === 'capturado' ? 'b' : undefined} /> },
          { key: 'autorizado_en', label: 'Autorizado', render: x => (x.autorizado_en ? fechaHora(x.autorizado_en) : '—') }, { key: 'nota', label: 'Nota' },
        ]} vacio={{ title: 'Sin conteos', description: 'Un conteo compara lo contado con la existencia del sistema; el ajuste lo autoriza Administración.' }} />
      {nuevo && <ModalNuevoConteo sedes={sedes} sedeIni={sedeActivaId} onClose={() => setNuevo(false)} onCreado={id => { setNuevo(false); if (id) setAbierto(id) }} />}
      {abierto && <DetalleConteo id={abierto} onClose={() => setAbierto(null)} />}
    </>
  )
}

function ModalNuevoConteo({ sedes, sedeIni, onClose, onCreado }) {
  const { correr, ocupado } = useAccion()
  const [f, setF] = useState({ sede_id: sedeIni ?? sedes[0]?.id ?? '', fecha: hoy(), nota: '' })
  const guardar = async () => { const r = await correr(() => insertar('conteos_fisicos', { sede_id: f.sede_id, fecha: f.fecha, nota: f.nota || null }), 'Conteo creado'); if (r) onCreado(r[0]?.id) }
  return (
    <Modal open onClose={onClose} title="Nuevo conteo físico" size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.sede_id} onClick={guardar}>Crear</button></>}>
      <FormField label="Sede" as="select" value={f.sede_id} onChange={e => setF({ ...f, sede_id: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      <FormField label="Fecha" type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
      <FormField label="Nota" as="textarea" value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} />
    </Modal>
  )
}

function DetalleConteo({ id, onClose }) {
  const { sedes } = useApp()
  const { productos, mapa } = useProductos()
  const { correr, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const esAdmin = usePermiso('inventario.autorizar')
  const puedeOperar = usePermiso('inventario.operar')
  const cab = useLectura('cnt-cab', 'conteos_fisicos', { sedeCol: false, filtros: { id } }).filas[0]
  const lin = useLectura('cnt-lin', 'conteo_lineas', { sedeCol: false, filtros: { conteo_id: id } })
  const inv = useLectura('cnt-inv', 'prp_inventario', { sedeId: cab?.sede_id ?? null }, !!cab)
  const [valores, setValores] = useState({})
  const [nuevo, setNuevo] = useState({ producto_id: '', contado: '' })
  useEffect(() => { setValores(Object.fromEntries(lin.filas.map(l => [l.id, String(l.contado)]))) }, [lin.filas])
  if (!cab) return <Modal open onClose={onClose} title="Conteo físico"><LoadingSpinner /></Modal>
  const editable = ['borrador', 'capturado'].includes(cab.estado) && puedeOperar
  const existSede = pid => num(inv.filas.find(i => i.sede_id === cab.sede_id && i.producto_id === pid)?.existencia)
  const idsSede = new Set(inv.filas.filter(i => i.sede_id === cab.sede_id).map(i => i.producto_id))
  const yaEn = new Set(lin.filas.filter(l => !l.lote_id).map(l => l.producto_id))
  const agregar = () => correr(() => insertar('conteo_lineas', { conteo_id: id, sede_id: cab.sede_id, producto_id: nuevo.producto_id, esperado: existSede(nuevo.producto_id), contado: num(nuevo.contado) }), 'Partida agregada').then(ok => ok && setNuevo({ producto_id: '', contado: '' }))
  const cargarTodos = async () => {
    const faltan = [...idsSede].filter(pid => !yaEn.has(pid))
    if (!faltan.length) return
    await correr(() => insertar('conteo_lineas', faltan.map(pid => ({ conteo_id: id, sede_id: cab.sede_id, producto_id: pid, esperado: existSede(pid), contado: existSede(pid) }))), `${faltan.length} productos cargados con el contado igual al esperado: corrige los que difieran`)
  }
  const guardarLineas = async () => {
    await correr(async () => { for (const l of lin.filas) { if (num(valores[l.id]) !== num(l.contado)) { const r = await actualizar('conteo_lineas', l.id, { contado: num(valores[l.id]) }); if (r.error) return r } } return { data: true } }, 'Cantidades guardadas')
  }
  const sucio = lin.filas.some(l => num(valores[l.id]) !== num(l.contado))
  const capturar = async () => { if (sucio) await guardarLineas(); await correr(() => actualizar('conteos_fisicos', id, { estado: 'capturado' }), 'Conteo capturado: pendiente de autorización') }
  const autorizar = async () => {
    if (await confirmar({ titulo: 'Autorizar conteo', mensaje: 'Se generarán movimientos de ajuste en el kardex para igualar la existencia a lo contado. No se puede deshacer; se corrige con otro conteo.', textoConfirmar: 'Autorizar y ajustar' })) {
      const n = await correr(() => rpc('conteo_autorizar', { p_conteo: id }), 'Conteo autorizado'); if (n !== false) onClose()
    }
  }
  const cancelar = async () => { if (await confirmar({ titulo: 'Cancelar conteo', peligro: true, textoConfirmar: 'Cancelar conteo', mensaje: 'No se ajustará ningún inventario.' })) await correr(() => actualizar('conteos_fisicos', id, { estado: 'cancelado' }), 'Conteo cancelado') }
  const difTotal = lin.filas.filter(l => num(valores[l.id]) !== num(l.esperado)).length
  return (
    <Modal open onClose={onClose} title={`Conteo ${cab.folio} · ${sedes.find(s => s.id === cab.sede_id)?.nombre ?? ''}`} size="wide" cerrarAlClicFuera={false}
      footer={<>
        {editable && sucio && <button className="btn o" disabled={ocupado} onClick={guardarLineas}>Guardar cantidades</button>}
        {editable && cab.estado === 'borrador' && <button className="btn" disabled={ocupado || !lin.filas.length} onClick={capturar}>Marcar capturado</button>}
        {esAdmin && ['borrador', 'capturado'].includes(cab.estado) && <button className="btn" disabled={ocupado || !lin.filas.length || sucio} onClick={autorizar}>Autorizar ajuste</button>}
        {editable && <button className="btn red" disabled={ocupado} onClick={cancelar}>Cancelar conteo</button>}
      </>}>
      {dialogo}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}><StatusBadge estado={cab.estado} label={ESTADO_CONTEO[cab.estado]} /> <span>{fecha(cab.fecha)}</span> {cab.nota && <span style={{ color: 'var(--muted)' }}>{cab.nota}</span>}</div>
      {editable && (
        <div className="toolbar" style={{ alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260, flex: 1 }}><SelectorProducto productos={productos} ids={new Set([...idsSede].filter(p => !yaEn.has(p)))} value={nuevo.producto_id} onChange={v => setNuevo({ ...nuevo, producto_id: v })} placeholder="Agregar producto a contar…" /></div>
          <input type="number" min="0" step="any" placeholder="Contado" style={{ width: 100 }} value={nuevo.contado} onChange={e => setNuevo({ ...nuevo, contado: e.target.value })} />
          <button className="btn o" disabled={ocupado || !nuevo.producto_id || nuevo.contado === ''} onClick={agregar}>+ Agregar</button>
          <button className="btn o" disabled={ocupado} onClick={cargarTodos}>Cargar todos los productos de la sede</button>
        </div>)}
      <div className="tabla-wrap"><table>
        <thead><tr><th>SKU</th><th>Producto</th><th style={{ textAlign: 'right' }}>Esperado</th><th style={{ textAlign: 'right' }}>Contado</th><th style={{ textAlign: 'right' }}>Diferencia</th><th /></tr></thead>
        <tbody>
          {!lin.filas.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 14 }}>{lin.cargando ? 'Cargando…' : 'Sin partidas'}</td></tr>}
          {lin.filas.map(l => { const d = num(valores[l.id]) - num(l.esperado); return (
            <tr key={l.id}><td>{mapa[l.producto_id]?.sku}</td><td>{mapa[l.producto_id]?.nombre}</td><td style={{ textAlign: 'right' }}>{qty(l.esperado)}</td>
              <td style={{ textAlign: 'right' }}>{editable ? <input type="number" min="0" step="any" style={{ width: 90 }} value={valores[l.id] ?? ''} onChange={e => setValores(v => ({ ...v, [l.id]: e.target.value }))} /> : qty(l.contado)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: d < 0 ? 'var(--red)' : d > 0 ? 'var(--green)' : undefined }}>{d > 0 ? '+' : ''}{qty(d)}</td>
              <td>{editable && <button className="btn o sm" onClick={() => correr(() => borrar('conteo_lineas', l.id))}>✕</button>}</td></tr>) })}
        </tbody></table></div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{difTotal} partida(s) con diferencia. Al autorizar, el sistema compara lo contado contra la existencia vigente en ese momento y registra el ajuste en el kardex.</div>
    </Modal>
  )
}
