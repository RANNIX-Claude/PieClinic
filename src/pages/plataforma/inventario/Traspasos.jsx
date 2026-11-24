// Pantalla 22 · Traspasos entre sucursales. Borrador → Enviado → Recibido (completo / con diferencias) · Cancelado (P-080, CD-21).
// Las transiciones solo ocurren por RPC (traspaso_enviar / traspaso_recibir / traspaso_cancelar).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Truck, FileEdit, AlertTriangle, Boxes } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { insertar, actualizar, borrar, rpc } from '../../../lib/api'
import { moneda, fecha, fechaHora } from '../../../lib/formato'
import { sugerirTraspaso } from '../../../lib/plataforma/compras'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import ImprimirHoja from '../../../components/ui/ImprimirHoja'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useLectura, useProductos, useAccion, msgError, SelectorProducto, num, qty } from './comun'

const ESTADOS = { borrador: 'Borrador', enviado: 'Enviado (en tránsito)', recibido_completo: 'Recibido completo', recibido_con_diferencias: 'Recibido con diferencias', cancelado: 'Cancelado' }

export default function Traspasos() {
  const { sedes } = useApp()
  const puedeOperar = usePermiso('inventario.operar')
  const [editor, setEditor] = useState(null)   // { id|null }
  const [detalle, setDetalle] = useState(null) // id
  const [mes, setMes] = useState('')
  const t = useLectura('traspasos', 'prp_traspasos', { sedeCol: false, orden: { columna: 'created_at', asc: false }, limite: 1000 })
  const filas = useMemo(() => t.filas.filter(f => !mes || (f.created_at ?? '').startsWith(mes)).map(f => ({ ...f, estadoTxt: ESTADOS[f.estado] ?? f.estado })), [t.filas, mes])
  const k = useMemo(() => ({
    borr: t.filas.filter(f => f.estado === 'borrador').length, trans: t.filas.filter(f => f.estado === 'enviado').length,
    dif: t.filas.filter(f => f.estado === 'recibido_con_diferencias').length, valorTrans: t.filas.filter(f => f.estado === 'enviado').reduce((s, f) => s + num(f.valor_total), 0),
  }), [t.filas])
  const cols = [
    { key: 'folio', label: 'Folio', render: f => <b>{f.folio}</b> },
    { key: 'created_at', label: 'Fecha', render: f => fecha((f.fecha_envio ?? f.created_at ?? '').slice(0, 10)), valor: f => f.created_at },
    { key: 'sede_origen', label: 'Origen', filtro: true }, { key: 'sede_destino', label: 'Destino', filtro: true },
    { key: 'partidas', label: 'Partidas', align: 'right' }, { key: 'unidades', label: 'Unidades', align: 'right', render: f => qty(f.unidades) },
    { key: 'valor_total', label: 'Valor (costo prom.)', align: 'right', render: f => moneda(f.valor_total) },
    { key: 'estadoTxt', label: 'Estado', filtro: true, render: f => <><StatusBadge estado={f.estado} label={ESTADOS[f.estado]} variante={f.estado === 'enviado' ? 'b' : undefined} />{num(f.partidas_con_diferencia) > 0 && <span className="bd r" style={{ marginLeft: 4 }}>{f.partidas_con_diferencia} dif.</span>}</> },
    { key: 'recibido_en', label: 'Recibido', render: f => (f.recibido_en ? fechaHora(f.recibido_en) : '—') },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Traspasos entre sucursales" subtitulo="Al enviar se descuenta del origen a costo promedio; al recibir se suma al destino y las diferencias generan una reclamación"
        acciones={puedeOperar && <button className="btn" onClick={() => setEditor({ id: null })}><Plus size={14} /> Nuevo traspaso</button>} />
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="Borradores" value={k.borr} icon={FileEdit} loading={t.cargando} />
        <KPICard title="En tránsito" value={k.trans} subtitle={moneda(k.valorTrans)} icon={Truck} color="var(--gold)" loading={t.cargando} />
        <KPICard title="Con diferencias" value={k.dif} icon={AlertTriangle} color="var(--red)" subtitle="Ver reclamaciones en Mermas y conteos" loading={t.cargando} />
        <KPICard title="Traspasos totales" value={t.filas.length} icon={Boxes} color="var(--green)" loading={t.cargando} />
      </div>
      <DataTable columnas={cols} filas={filas} cargando={t.cargando} error={msgError(t.error)} exportarNombre="traspasos" placeholderBusqueda="Buscar folio…"
        onFila={f => setDetalle(f.id)} acciones={<input type="month" value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes" />}
        vacio={{ title: 'Sin traspasos', description: 'Crea un traspaso para mover producto de una sucursal a otra.' }} />
      {editor && <Editor id={editor.id} sedes={sedes} onClose={() => setEditor(null)} onVer={id => { setEditor(null); setDetalle(id) }} />}
      {detalle && <Detalle id={detalle} sedes={sedes} onClose={() => setDetalle(null)} onEditar={() => { const i = detalle; setDetalle(null); setEditor({ id: i }) }} />}
    </div>
  )
}

function Editor({ id, sedes, onClose, onVer }) {
  const { sedeActivaId } = useApp()
  const { productos, mapa } = useProductos()
  const { correr, ocupado } = useAccion()
  const inv = useLectura('tr-inv', 'prp_inventario', { sedeId: null })
  const lotes = useLectura('tr-lotes', 'prp_lotes', { sedeId: null })
  const existente = useLectura('tr-uno', 'prp_traspasos', { sedeCol: false, filtros: { id: id ?? '00000000-0000-0000-0000-000000000000' } }, !!id)
  const lineasEx = useLectura('tr-lineas-ed', 'prp_traspaso_lineas', { sedeCol: false, filtros: { traspaso_id: id ?? '00000000-0000-0000-0000-000000000000' } }, !!id)
  const [f, setF] = useState(null)
  const [nuevo, setNuevo] = useState({ producto_id: '', lote_id: '', cantidad: '' })

  // Estado inicial (nuevo o cargado desde el borrador)
  if (!f && (!id || (existente.filas[0] && !lineasEx.cargando))) {
    const e = existente.filas[0]
    setF(id ? {
      origen: e.sede_origen_id, destino: e.sede_destino_id, fecha_estimada: e.fecha_estimada ?? '', transporte: e.transporte ?? '', comentarios: e.comentarios ?? '',
      lineas: lineasEx.filas.map(l => ({ producto_id: l.producto_id, lote_id: l.lote_id ?? '', cantidad: l.cantidad_enviada, lineaId: l.id })),
    } : { origen: sedeActivaId ?? sedes[0]?.id ?? '', destino: '', fecha_estimada: '', transporte: '', comentarios: '', lineas: [] })
  }
  if (!f) return <Modal open onClose={onClose} title="Traspaso"><LoadingSpinner /></Modal>

  const exOrigen = pid => num(inv.filas.find(i => i.sede_id === f.origen && i.producto_id === pid)?.existencia)
  const filaDest = pid => inv.filas.find(i => i.sede_id === f.destino && i.producto_id === pid)
  const idsOrigen = new Set(inv.filas.filter(i => i.sede_id === f.origen && num(i.existencia) > 0).map(i => i.producto_id))
  const lotesDe = pid => lotes.filas.filter(l => l.sede_id === f.origen && l.producto_id === pid && num(l.existencia) > 0 && l.estado === 'vigente')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const agregar = () => {
    if (!nuevo.producto_id || !(num(nuevo.cantidad) > 0)) return
    setF(x => ({ ...x, lineas: [...x.lineas.filter(l => !(l.producto_id === nuevo.producto_id && (l.lote_id || '') === (nuevo.lote_id || ''))), { ...nuevo, cantidad: num(nuevo.cantidad) }] }))
    setNuevo({ producto_id: '', lote_id: '', cantidad: '' })
  }
  const sugerir = () => {
    const dest = inv.filas.filter(i => i.sede_id === f.destino)
    const orig = Object.fromEntries(inv.filas.filter(i => i.sede_id === f.origen).map(i => [i.producto_id, num(i.existencia)]))
    const sug = sugerirTraspaso(dest, orig)
    setF(x => ({ ...x, lineas: [...x.lineas.filter(l => !sug.some(s => s.producto_id === l.producto_id)), ...sug.map(s => ({ producto_id: s.producto_id, lote_id: '', cantidad: s.cantidad }))] }))
  }
  const errores = []
  if (!f.origen || !f.destino) errores.push('Elige sucursal de origen y de destino')
  if (f.origen && f.origen === f.destino) errores.push('El origen y el destino deben ser distintos')
  if (!f.lineas.length) errores.push('Agrega al menos un producto')
  f.lineas.forEach(l => { if (num(l.cantidad) > exOrigen(l.producto_id)) errores.push(`${mapa[l.producto_id]?.nombre ?? 'Producto'}: pides más de lo que hay en el origen (${qty(exOrigen(l.producto_id))})`) })
  const costo = f.lineas.reduce((s, l) => s + num(l.cantidad) * num(mapa[l.producto_id]?.costo_promedio), 0)

  const guardar = async enviar => {
    const res = await correr(async () => {
      let tid = id
      const cab = { sede_origen_id: f.origen, sede_destino_id: f.destino, fecha_estimada: f.fecha_estimada || null, transporte: f.transporte || null, comentarios: f.comentarios || null }
      if (tid) {
        const r = await actualizar('traspasos', tid, cab); if (r.error) return r
        for (const l of lineasEx.filas) { const b = await borrar('traspaso_lineas', l.id); if (b.error) return b }
      } else {
        const r = await insertar('traspasos', cab); if (r.error) return r
        tid = r.data?.[0]?.id
      }
      const r2 = await insertar('traspaso_lineas', f.lineas.map(l => ({ traspaso_id: tid, producto_id: l.producto_id, lote_id: l.lote_id || null, cantidad_enviada: num(l.cantidad) })))
      if (r2.error) return r2
      if (enviar) { const r3 = await rpc('traspaso_enviar', { p_traspaso: tid }); if (r3.error) return r3 }
      return { data: tid }
    }, enviar ? 'Traspaso enviado: el stock salió del origen' : 'Borrador guardado')
    if (res) onVer(typeof res === 'string' ? res : id)
  }
  return (
    <Modal open onClose={onClose} title={id ? 'Editar borrador de traspaso' : 'Nuevo traspaso'} size="wide" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cerrar</button>
        <button className="btn o" disabled={ocupado || errores.length > 0} onClick={() => guardar(false)}>Guardar borrador</button>
        <button className="btn" disabled={ocupado || errores.length > 0} onClick={() => guardar(true)}>Enviar traspaso</button></>}>
      <div className="grid2">
        <FormField label="Sucursal origen" as="select" required value={f.origen} onChange={e => setF({ ...f, origen: e.target.value, lineas: [] })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} disabled={!!id} />
        <FormField label="Sucursal destino" as="select" required value={f.destino} onChange={e => set('destino', e.target.value)} options={sedes.filter(s => s.id !== f.origen).map(s => ({ value: s.id, label: s.nombre }))} disabled={!!id} />
        <FormField label="Fecha estimada de llegada" type="date" value={f.fecha_estimada} onChange={e => set('fecha_estimada', e.target.value)} />
        <FormField label="Transporte" value={f.transporte} onChange={e => set('transporte', e.target.value)} placeholder="Mensajería interna, podólogo itinerante…" />
      </div>
      <FormField label="Comentarios" as="textarea" value={f.comentarios} onChange={e => set('comentarios', e.target.value)} />
      <div className="toolbar" style={{ alignItems: 'flex-end' }}>
        <div style={{ minWidth: 260, flex: 1 }}><SelectorProducto productos={productos} ids={idsOrigen} value={nuevo.producto_id} onChange={v => setNuevo({ ...nuevo, producto_id: v, lote_id: '' })} placeholder="Agregar producto con existencia en el origen…" /></div>
        {nuevo.producto_id && lotesDe(nuevo.producto_id).length > 0 && (
          <select value={nuevo.lote_id} onChange={e => setNuevo({ ...nuevo, lote_id: e.target.value })}>
            <option value="">Lote (opcional)</option>{lotesDe(nuevo.producto_id).map(l => <option key={l.id} value={l.id}>{l.numero_lote ?? 'sin núm.'} · {qty(l.existencia)} · {l.caducidad ? fecha(l.caducidad) : 's/c'}</option>)}
          </select>)}
        <input type="number" min="0" step="any" placeholder="Cantidad" value={nuevo.cantidad} onChange={e => setNuevo({ ...nuevo, cantidad: e.target.value })} style={{ width: 100 }} />
        <button className="btn o" onClick={agregar} disabled={!nuevo.producto_id || !(num(nuevo.cantidad) > 0)}>+ Agregar</button>
        <button className="btn o" onClick={sugerir} disabled={!f.origen || !f.destino || f.origen === f.destino} title="Productos del destino por debajo del mínimo que el origen puede surtir">Sugerir según mínimos del destino</button>
      </div>
      <div className="tabla-wrap"><table>
        <thead><tr><th>SKU</th><th>Producto</th><th>Lote</th><th style={{ textAlign: 'right' }}>Origen</th><th style={{ textAlign: 'right' }}>Destino</th><th style={{ textAlign: 'right' }}>Mín. destino</th><th style={{ textAlign: 'right' }}>Cant. a enviar</th><th /></tr></thead>
        <tbody>
          {f.lineas.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--muted)', textAlign: 'center', padding: 14 }}>Sin partidas</td></tr>}
          {f.lineas.map((l, i) => { const d = filaDest(l.producto_id); return (
            <tr key={i}><td>{mapa[l.producto_id]?.sku}</td><td>{mapa[l.producto_id]?.nombre}</td>
              <td>{l.lote_id ? lotes.filas.find(x => x.id === l.lote_id)?.numero_lote ?? '—' : '—'}</td>
              <td style={{ textAlign: 'right' }}>{qty(exOrigen(l.producto_id))}</td><td style={{ textAlign: 'right' }}>{d ? qty(d.existencia) : '—'}</td><td style={{ textAlign: 'right' }}>{d ? qty(d.minimo) : '—'}</td>
              <td style={{ textAlign: 'right' }}><input type="number" min="0" step="any" value={l.cantidad} style={{ width: 90 }} onChange={e => setF(x => ({ ...x, lineas: x.lineas.map((y, j) => (j === i ? { ...y, cantidad: e.target.value } : y)) }))} /></td>
              <td><button className="btn o sm" onClick={() => setF(x => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }))}>✕</button></td></tr>) })}
        </tbody></table></div>
      <div style={{ marginTop: 8, fontSize: 13 }}><b>Partidas {f.lineas.length}</b> · Unidades {qty(f.lineas.reduce((s, l) => s + num(l.cantidad), 0))} · Costo del traspaso (a costo promedio) <b>{moneda(costo)}</b></div>
      {errores.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12, margin: '6px 0 0 16px' }}>{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </Modal>
  )
}

function Detalle({ id, sedes, onClose, onEditar }) {
  const { mapa } = useProductos()
  const { correr, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeOperar = usePermiso('inventario.operar')
  const esAdmin = usePermiso('inventario.autorizar')
  const t = useLectura('tr-det', 'prp_traspasos', { sedeCol: false, filtros: { id } })
  const l = useLectura('tr-det-lineas', 'prp_traspaso_lineas', { sedeCol: false, filtros: { traspaso_id: id } })
  const [recibiendo, setRecibiendo] = useState(false)
  const tr = t.filas[0]
  if (!tr) return <Modal open onClose={onClose} title="Traspaso">{t.cargando ? <LoadingSpinner /> : <div style={{ color: 'var(--muted)' }}>{msgError(t.error) ?? 'No se encontró el traspaso.'}</div>}</Modal>

  const enviar = async () => { if (await confirmar({ titulo: 'Enviar traspaso', mensaje: `Se descontarán ${qty(tr.unidades)} unidades de ${tr.sede_origen} a costo promedio y quedarán en tránsito. Las partidas ya no se podrán modificar.`, textoConfirmar: 'Enviar' })) await correr(() => rpc('traspaso_enviar', { p_traspaso: id }), 'Traspaso enviado') }
  const cancelar = async () => { const m = await confirmar({ titulo: 'Cancelar traspaso', mensaje: tr.estado === 'enviado' ? 'El stock regresará al origen (solo Administración).' : 'El borrador quedará cancelado.', pedirMotivo: true, peligro: true, textoConfirmar: 'Cancelar traspaso' })
    if (m) await correr(() => rpc('traspaso_cancelar', { p_traspaso: id, p_motivo: m }), 'Traspaso cancelado') }
  return (
    <Modal open onClose={onClose} title={`Traspaso ${tr.folio}`} size="wide"
      footer={<>
        <ImprimirHoja titulo={`Hoja de traspaso ${tr.folio}`} entidad="traspasos" entidadId={id} etiqueta="Imprimir hoja" className="btn o">
          <p>{tr.sede_origen} → {tr.sede_destino} · Estado: {ESTADOS[tr.estado]} · Fecha estimada: {tr.fecha_estimada ? fecha(tr.fecha_estimada) : '—'} · Transporte: {tr.transporte ?? '—'}</p>
          <table><thead><tr><th>Producto</th><th>Enviada</th><th>Recibida</th><th>Diferencia</th></tr></thead>
            <tbody>{l.filas.map(x => <tr key={x.id}><td>{mapa[x.producto_id]?.nombre}</td><td>{qty(x.cantidad_enviada)}</td><td>{x.cantidad_recibida == null ? '' : qty(x.cantidad_recibida)}</td><td>{num(x.diferencia) ? qty(x.diferencia) : ''}</td></tr>)}</tbody></table>
          <p>Costo (a costo promedio): {moneda(tr.valor_total)}</p><p style={{ marginTop: 40 }}>Entregó: ____________________ &nbsp;&nbsp; Recibió: ____________________</p>
        </ImprimirHoja>
        {tr.estado === 'borrador' && puedeOperar && <><button className="btn o" onClick={onEditar}>Editar</button><button className="btn" disabled={ocupado} onClick={enviar}>Enviar</button></>}
        {tr.estado === 'enviado' && puedeOperar && <button className="btn" disabled={ocupado} onClick={() => setRecibiendo(true)}>Recibir en destino</button>}
        {(tr.estado === 'borrador' && puedeOperar || tr.estado === 'enviado' && esAdmin) && <button className="btn red" disabled={ocupado} onClick={cancelar}>Cancelar</button>}
      </>}>
      {dialogo}
      <div className="grid2" style={{ marginBottom: 8 }}>
        <div><small>Origen → Destino</small><div><b>{tr.sede_origen} → {tr.sede_destino}</b></div></div>
        <div><small>Estado</small><div><StatusBadge estado={tr.estado} label={ESTADOS[tr.estado]} /></div></div>
        <div><small>Enviado</small><div>{tr.enviado_en ? fechaHora(tr.enviado_en) : '—'}</div></div>
        <div><small>Recibido</small><div>{tr.recibido_en ? fechaHora(tr.recibido_en) : '—'}</div></div>
      </div>
      {tr.comentarios && <div style={{ fontSize: 13, marginBottom: 8 }}>{tr.comentarios}</div>}
      {tr.cancelado_motivo && <div className="bd r" style={{ marginBottom: 8 }}>Cancelado: {tr.cancelado_motivo}</div>}
      <DataTable sinPaginacion buscador={false} cargando={l.cargando} error={msgError(l.error)} filas={l.filas}
        columnas={[
          { key: 'p', label: 'Producto', valor: x => mapa[x.producto_id]?.nombre ?? '—' }, { key: 'sku', label: 'SKU', valor: x => mapa[x.producto_id]?.sku ?? '' },
          { key: 'cantidad_enviada', label: 'Enviada', align: 'right', render: x => qty(x.cantidad_enviada) },
          { key: 'cantidad_recibida', label: 'Recibida', align: 'right', render: x => (x.cantidad_recibida == null ? '—' : qty(x.cantidad_recibida)) },
          { key: 'diferencia', label: 'Diferencia', align: 'right', render: x => (num(x.diferencia) ? <b style={{ color: 'var(--red)' }}>−{qty(x.diferencia)}</b> : '—') },
          { key: 'motivo_diferencia', label: 'Motivo' }, { key: 'valor', label: 'Valor', align: 'right', render: x => moneda(x.valor) },
        ]} vacio={{ title: 'Sin partidas' }} />
      {tr.estado === 'recibido_con_diferencias' && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Las diferencias quedaron como reclamación pendiente en Mermas y conteos (no vuelven a descontar inventario, P-080).</div>}
      {recibiendo && <Recepcion tr={tr} lineas={l.filas} mapa={mapa} onClose={() => { setRecibiendo(false) }} correr={correr} ocupado={ocupado} />}
    </Modal>
  )
}

function Recepcion({ tr, lineas, mapa, onClose, correr, ocupado }) {
  const [v, setV] = useState(() => Object.fromEntries(lineas.map(l => [l.id, { cant: num(l.cantidad_enviada), motivo: '' }])))
  const hayDif = lineas.some(l => num(v[l.id]?.cant) < num(l.cantidad_enviada))
  const invalido = lineas.some(l => num(v[l.id]?.cant) > num(l.cantidad_enviada) || num(v[l.id]?.cant) < 0 || (num(v[l.id]?.cant) < num(l.cantidad_enviada) && !v[l.id]?.motivo?.trim()))
  const confirmar = async () => {
    const ok = await correr(() => rpc('traspaso_recibir', { p_traspaso: tr.id, p_lineas: lineas.map(l => ({ linea_id: l.id, cantidad_recibida: num(v[l.id].cant), motivo: v[l.id].motivo || null })) }),
      hayDif ? 'Recepción registrada con diferencias' : 'Recepción completa registrada')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Recepción en destino · ${tr.folio}`} size="wide"
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || invalido} onClick={confirmar}>{hayDif ? 'Confirmar y reportar diferencia' : 'Confirmar recepción'}</button></>}>
      <div className="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Enviado</th><th style={{ textAlign: 'right' }}>Recibido</th><th style={{ textAlign: 'right' }}>Diferencia</th><th>Motivo (faltante, dañado…)</th></tr></thead>
        <tbody>{lineas.map(l => { const d = num(v[l.id]?.cant) - num(l.cantidad_enviada); return (
          <tr key={l.id}><td>{mapa[l.producto_id]?.nombre}</td><td style={{ textAlign: 'right' }}>{qty(l.cantidad_enviada)}</td>
            <td style={{ textAlign: 'right' }}><input type="number" min="0" max={l.cantidad_enviada} step="any" style={{ width: 90 }} value={v[l.id].cant} onChange={e => setV(x => ({ ...x, [l.id]: { ...x[l.id], cant: e.target.value } }))} /></td>
            <td style={{ textAlign: 'right', color: d < 0 ? 'var(--red)' : undefined, fontWeight: 700 }}>{d ? qty(d) : '0'}</td>
            <td><input disabled={d >= 0} value={v[l.id].motivo} onChange={e => setV(x => ({ ...x, [l.id]: { ...x[l.id], motivo: e.target.value } }))} placeholder={d < 0 ? 'Obligatorio' : ''} /></td></tr>) })}</tbody></table></div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>No se puede recibir más de lo enviado. Cada diferencia crea una reclamación (merma tipo «reclamación de traspaso») que Administración resuelve.</div>
    </Modal>
  )
}
