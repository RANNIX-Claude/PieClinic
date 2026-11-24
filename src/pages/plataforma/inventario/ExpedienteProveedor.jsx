// Expediente de proveedor (clon de ExpedienteProveedor de IRP): resumen, datos (CLABE aparte solo Administración), documentos, productos que surte, compras, CxP y nombres vinculados.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ShoppingCart, Wallet, Receipt, CalendarClock } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { actualizar, insertar, borrar, rpc } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'
import { rutaStorage, urlFirmada, BUCKETS } from '../../../lib/urlFirmada'
import { bitacoraVer } from '../../../lib/bitacora'
import { moneda, fecha, telefono } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useLectura, useProductos, useProveedores, useAccion, msgError, CATEGORIAS_PROVEEDOR, SelectorProducto, num, qty } from './comun'
import { ModalProveedor } from './Proveedores'
import { ESTADO_OC } from './OrdenDetalle'

const TIPOS_DOC = { contrato: 'Contrato', constancia_fiscal: 'Constancia fiscal', cotizacion: 'Cotización', otro: 'Otro' }

export default function ExpedienteProveedor() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'resumen'
  const esAdmin = usePermiso('proveedores.editar')
  const { proveedores, mapa, cargando, error } = useProveedores()
  const { productos, mapa: prods } = useProductos()
  const { correr, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const p = mapa[id]
  const ocs = useLectura('prov-ocs', 'prp_ordenes_compra', { sedeId: null, filtros: { proveedor_id: id }, orden: { columna: 'fecha', asc: false } })
  const cxp = useLectura('prov-cxp', 'prp_cuentas_pagar', { sedeId: null, filtros: { proveedor_id: id }, orden: { columna: 'fecha_vencimiento' } })
  const pp = useLectura('prov-pp', 'proveedor_productos', { sedeCol: false, filtros: { proveedor_id: id } })
  const docs = useLectura('prov-docs', 'proveedor_documentos', { sedeCol: false, filtros: { proveedor_id: id }, orden: { columna: 'created_at', asc: false } }, esAdmin)
  const banco = useLectura('prov-banco', 'proveedores_bancarios', { sedeCol: false, filtros: { proveedor_id: id } }, esAdmin)
  const [editar, setEditar] = useState(false)
  const [vincProd, setVincProd] = useState(false)
  const [subirDoc, setSubirDoc] = useState(false)
  const [texto, setTexto] = useState('')
  useEffect(() => { if (id) bitacoraVer('proveedores', id, { vista: 'expediente_proveedor' }) }, [id])

  const k = useMemo(() => {
    const hace12 = new Date(); hace12.setFullYear(hace12.getFullYear() - 1); const lim = hace12.toISOString().slice(0, 10)
    const validas = ocs.filas.filter(o => o.estado !== 'cancelada')
    const ult12 = validas.filter(o => o.fecha >= lim)
    return { ordenes: ult12.length, total: ult12.reduce((s, o) => s + num(o.total), 0), ultima: validas[0]?.fecha,
      saldo: cxp.filas.filter(c => !['pagada', 'cancelada'].includes(c.estado)).reduce((s, c) => s + num(c.saldo), 0),
      prox: cxp.filas.filter(c => !['pagada', 'cancelada'].includes(c.estado)).map(c => c.fecha_vencimiento).sort()[0] }
  }, [ocs.filas, cxp.filas])

  if (cargando) return <div className="pagina"><LoadingSpinner /></div>
  if (error || !p) return <div className="pagina"><EmptyState title={error ? 'No se pudo cargar' : 'Proveedor no encontrado'} description={error ? msgError(error) : 'No existe o no pertenece a esta clínica.'} action={<button className="btn o" onClick={() => nav('/proveedores')}>Volver a proveedores</button>} /></div>

  const baja = async () => {
    const reactivar = !p.activo
    if (await confirmar({ titulo: reactivar ? 'Reactivar proveedor' : 'Dar de baja al proveedor', mensaje: reactivar ? 'Volverá a aparecer en nuevas órdenes de compra.' : 'No se borra su historial; solo deja de ofrecerse en nuevas órdenes.', peligro: !reactivar, textoConfirmar: reactivar ? 'Reactivar' : 'Dar de baja' }))
      await correr(() => actualizar('proveedores', id, { activo: reactivar }), reactivar ? 'Proveedor reactivado' : 'Proveedor dado de baja')
  }
  const vincular = async () => {
    const n = await correr(() => rpc('proveedor_vincular_nombre', { p_texto: texto, p_proveedor: id }), 'Nombre vinculado')
    if (n !== false) setTexto('')
  }
  const abrirDoc = async d => { const u = await urlFirmada(BUCKETS.documentos, d.archivo_path); if (u) window.open(u, '_blank', 'noopener'); else window.alert('No se pudo abrir el archivo.') }
  const dato = (kk, v) => <div key={kk} className="field"><label>{kk}</label><div style={{ fontSize: 13.5 }}>{v ?? '—'}</div></div>
  const b = banco.filas[0]

  return (
    <div className="pagina">
      {dialogo}
      <PageHeader titulo={p.nombre} subtitulo={`${p.clave} · ${CATEGORIAS_PROVEEDOR[p.categoria] ?? p.categoria}${p.rfc ? ` · ${p.rfc}` : ''}`}
        acciones={<>
          <button className="btn o" onClick={() => nav('/proveedores')}><ArrowLeft size={14} /> Proveedores</button>
          {esAdmin && <><button className="btn" onClick={() => nav(`/compras?nueva=1&proveedor=${id}`)}>Nueva orden de compra</button>
            <button className={`btn ${p.activo ? 'red' : 'o'}`} disabled={ocupado} onClick={baja}>{p.activo ? 'Dar de baja' : 'Reactivar'}</button></>}
        </>} />
      <Tabs value={tab} onChange={t => setSp({ tab: t })} items={[
        { id: 'resumen', label: 'Resumen' }, { id: 'datos', label: 'Datos generales' }, { id: 'compras', label: 'Compras', badge: ocs.filas.length || null },
        { id: 'cxp', label: 'Cuentas por pagar' }, { id: 'productos', label: 'Productos que surte', badge: pp.filas.length || null },
        { id: 'documentos', label: 'Documentos', oculto: !esAdmin }, { id: 'nombres', label: 'Nombres vinculados', oculto: !esAdmin },
      ]} />
      {tab === 'resumen' && (
        <div className="grid-kpis">
          <KPICard title="Órdenes (12 meses)" value={k.ordenes} icon={ShoppingCart} loading={ocs.cargando} />
          <KPICard title="Total comprado (12 meses)" value={moneda(k.total)} icon={Receipt} color="var(--green)" loading={ocs.cargando} />
          <KPICard title="Saldo por pagar" value={moneda(k.saldo)} icon={Wallet} color="var(--gold)" subtitle={k.prox ? `vence ${fecha(k.prox)}` : undefined} loading={cxp.cargando} />
          <KPICard title="Última compra" value={k.ultima ? fecha(k.ultima) : '—'} icon={CalendarClock} loading={ocs.cargando} />
        </div>)}
      {tab === 'datos' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><h3>Datos generales</h3>{esAdmin && <button className="btn o sm" onClick={() => setEditar(true)}>Editar</button>}</div>
          <div className="grid2">
            {dato('Clave', p.clave)}{dato('Razón social', p.razon_social)}{dato('RFC', p.rfc)}{dato('Categoría', CATEGORIAS_PROVEEDOR[p.categoria])}
            {dato('Contacto', p.contacto)}{dato('Teléfono', telefono(p.telefono))}{dato('Correo', p.email)}{dato('Condiciones de pago', `${p.condiciones_pago}${p.dias_credito ? ` · ${p.dias_credito} días` : ''}`)}
            {dato('Tiempo de entrega', p.dias_entrega)}{dato('Estatus', <StatusBadge estado={p.activo ? 'activo' : 'inactivo'} label={p.estatus} />)}{dato('Laboratorio externo', p.es_laboratorio ? 'Sí' : 'No')}
          </div>
          {p.notas && <div style={{ fontSize: 13, marginTop: 6 }}>{p.notas}</div>}
          {esAdmin && <DatosBancarios proveedorId={id} datos={b} enmascarada={p.clabe_enmascarada} correr={correr} ocupado={ocupado} />}
        </div>)}
      {tab === 'compras' && <DataTable cargando={ocs.cargando} error={msgError(ocs.error)} filas={ocs.filas} exportarNombre={`compras_${p.clave}`} onFila={o => nav(`/compras?oc=${o.id}`)}
        columnas={[
          { key: 'folio', label: 'Orden', render: o => <b>{o.folio}</b> }, { key: 'fecha', label: 'Fecha', render: o => fecha(o.fecha) }, { key: 'sede_nombre', label: 'Sede', filtro: true },
          { key: 'total', label: 'Total', align: 'right', render: o => moneda(o.total), valor: o => num(o.total) }, { key: 'estado', label: 'Estado', render: o => <StatusBadge estado={o.estado} label={ESTADO_OC[o.estado]} /> },
          { key: 'entrega_esperada', label: 'Entrega', render: o => (o.entrega_esperada ? fecha(o.entrega_esperada) : '—') },
        ]} vacio={{ title: 'Sin órdenes de compra', description: 'Crea una orden con «Nueva orden de compra».' }} />}
      {tab === 'cxp' && <DataTable cargando={cxp.cargando} error={msgError(cxp.error)} filas={cxp.filas} exportarNombre={`cxp_${p.clave}`}
        columnas={[
          { key: 'folio_factura', label: 'Factura', render: c => c.folio_factura ?? '—' }, { key: 'fecha_emision', label: 'Emisión', render: c => fecha(c.fecha_emision) }, { key: 'fecha_vencimiento', label: 'Vence', render: c => fecha(c.fecha_vencimiento) },
          { key: 'importe', label: 'Importe', align: 'right', render: c => moneda(c.importe) }, { key: 'pagado', label: 'Pagado', align: 'right', render: c => moneda(c.pagado) },
          { key: 'saldo', label: 'Saldo', align: 'right', render: c => <b>{moneda(c.saldo)}</b> }, { key: 'estado', label: 'Estado', filtro: true, render: c => <StatusBadge estado={c.estado} /> },
        ]} vacio={{ title: 'Sin cuentas por pagar', description: 'Nacen al registrar la factura en una recepción. El pago se hace en Finanzas → Cuentas.' }} />}
      {tab === 'productos' && <>
        {esAdmin && <div style={{ marginBottom: 8 }}><button className="btn" onClick={() => setVincProd(true)}>+ Vincular producto</button></div>}
        <DataTable cargando={pp.cargando} error={msgError(pp.error)} filas={pp.filas} exportarNombre={`productos_${p.clave}`} onFila={f => nav(`/inventario/producto/${f.producto_id}`)}
          columnas={[
            { key: 'p', label: 'Producto', valor: f => prods[f.producto_id]?.nombre ?? '—', render: f => <b>{prods[f.producto_id]?.nombre ?? '—'}</b> }, { key: 'sku', label: 'SKU', valor: f => prods[f.producto_id]?.sku ?? '' },
            { key: 'sku_proveedor', label: 'SKU del proveedor' }, { key: 'ultimo_costo', label: 'Último costo', align: 'right', render: f => (f.ultimo_costo == null ? '—' : moneda(f.ultimo_costo)) },
            { key: 'var', label: 'Var. vs promedio', align: 'right', valor: f => (f.ultimo_costo && num(prods[f.producto_id]?.costo_promedio) ? Math.round((f.ultimo_costo - prods[f.producto_id].costo_promedio) / prods[f.producto_id].costo_promedio * 100) : null), render: f => { const c = num(prods[f.producto_id]?.costo_promedio); if (!f.ultimo_costo || !c) return '—'; const v = Math.round((f.ultimo_costo - c) / c * 100); return <span style={{ color: v > 0 ? 'var(--red)' : 'var(--green)' }}>{v > 0 ? '+' : ''}{v} %</span> } },
            { key: 'ultima_compra', label: 'Última compra', render: f => (f.ultima_compra ? fecha(f.ultima_compra) : '—') },
            ...(esAdmin ? [{ key: 'q', label: '', sortable: false, exportar: false, render: f => <button className="btn o sm" onClick={async e => { e.stopPropagation(); if (await confirmar({ titulo: 'Quitar producto', mensaje: 'Se quita del catálogo de este proveedor (no afecta compras pasadas).', peligro: true, textoConfirmar: 'Quitar' })) correr(() => borrar('proveedor_productos', f.id), 'Producto quitado') }}>Quitar</button> }] : []),
          ]} vacio={{ title: 'Sin productos vinculados', description: 'El costo y la fecha se actualizan solos al recibir una compra.' }} />
        {vincProd && <ModalVincular proveedorId={id} productos={productos} existentes={new Set(pp.filas.map(f => f.producto_id))} onClose={() => setVincProd(false)} correr={correr} ocupado={ocupado} />}
      </>}
      {tab === 'documentos' && <>
        <div style={{ marginBottom: 8 }}><button className="btn" onClick={() => setSubirDoc(true)}>+ Subir documento</button></div>
        <DataTable sinPaginacion buscador={false} cargando={docs.cargando} error={msgError(docs.error)} filas={docs.filas}
          columnas={[
            { key: 'nombre', label: 'Documento', render: d => <b>{d.nombre}</b> }, { key: 'tipo', label: 'Tipo', render: d => TIPOS_DOC[d.tipo] ?? d.tipo }, { key: 'vigente_hasta', label: 'Vigente hasta', render: d => (d.vigente_hasta ? fecha(d.vigente_hasta) : '—') },
            { key: 'created_at', label: 'Subido', render: d => fecha(d.created_at?.slice(0, 10)) },
            { key: 'acc', label: '', sortable: false, render: d => <div style={{ display: 'flex', gap: 4 }}><button className="btn o sm" onClick={() => abrirDoc(d)}>Abrir</button>
              <button className="btn o sm" onClick={async () => { if (await confirmar({ titulo: 'Eliminar documento', peligro: true, textoConfirmar: 'Eliminar', mensaje: d.nombre })) { await supabase.storage.from(BUCKETS.documentos).remove([d.archivo_path]); correr(() => borrar('proveedor_documentos', d.id), 'Documento eliminado') } }}>Eliminar</button></div> },
          ]} vacio={{ title: 'Sin documentos', description: 'Sube el contrato, la constancia de situación fiscal o cotizaciones.' }} />
        {subirDoc && <ModalDoc proveedorId={id} onClose={() => setSubirDoc(false)} correr={correr} ocupado={ocupado} />}
      </>}
      {tab === 'nombres' && (
        <div className="card">
          <div style={{ fontSize: 13, marginBottom: 8 }}>Nombres alternos con los que este proveedor aparece en tickets y gastos. Vincular un texto liga los gastos históricos que lo usaban.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{(p.alias ?? []).length ? p.alias.map(a => <span key={a} className="bd m">{a}</span>) : <span style={{ color: 'var(--muted)' }}>Sin nombres vinculados</span>}</div>
          <div className="toolbar"><input style={{ minWidth: 280 }} placeholder="Texto tal como viene en el ticket (ej. PODOMED SA)" value={texto} onChange={e => setTexto(e.target.value)} />
            <button className="btn" disabled={ocupado || texto.trim().length < 3} onClick={vincular}>Vincular nombre</button></div>
        </div>)}
      {editar && <ModalProveedor proveedor={p} onClose={() => setEditar(false)} onGuardar={datos => actualizar('proveedores', id, datos)} />}
    </div>
  )
}

function DatosBancarios({ proveedorId, datos, enmascarada, correr, ocupado }) {
  const [f, setF] = useState({ banco: datos?.banco ?? '', titular: datos?.titular ?? '', clabe: '' })
  const [abierto, setAbierto] = useState(false)
  const claveOk = !f.clabe || /^\d{18}$/.test(f.clabe)
  const guardar = async () => {
    const cambios = { banco: f.banco || null, titular: f.titular || null, ...(f.clabe ? { clabe: f.clabe } : {}) }
    const ok = await correr(() => (datos ? actualizar('proveedores_bancarios', datos.id, cambios) : insertar('proveedores_bancarios', { proveedor_id: proveedorId, ...cambios })), 'Datos bancarios guardados')
    if (ok) { setAbierto(false); setF(x => ({ ...x, clabe: '' })) }
  }
  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>Datos bancarios <small style={{ fontWeight: 400, color: 'var(--muted)' }}>(solo Administración)</small></b>
        <button className="btn o sm" onClick={() => setAbierto(a => !a)}>{abierto ? 'Cerrar' : 'Editar'}</button></div>
      {!abierto && <div style={{ fontSize: 13, marginTop: 4 }}>{datos?.banco ?? '—'} · {datos?.titular ?? '—'} · CLABE {enmascarada ?? 'sin capturar'}</div>}
      {abierto && <><div className="grid2">
        <FormField label="Banco" value={f.banco} onChange={e => setF({ ...f, banco: e.target.value })} />
        <FormField label="Titular" value={f.titular} onChange={e => setF({ ...f, titular: e.target.value })} />
        <FormField label="CLABE (18 dígitos)" value={f.clabe} onChange={e => setF({ ...f, clabe: e.target.value.replace(/\D/g, '').slice(0, 18) })} error={claveOk ? undefined : 'Deben ser 18 dígitos'} hint={enmascarada ? `Actual ${enmascarada}; déjalo vacío para conservarla` : undefined} />
      </div><button className="btn" disabled={ocupado || !claveOk} onClick={guardar}>Guardar datos bancarios</button></>}
    </div>
  )
}

function ModalVincular({ proveedorId, productos, existentes, onClose, correr, ocupado }) {
  const [f, setF] = useState({ producto_id: '', sku_proveedor: '', ultimo_costo: '' })
  const guardar = async () => { const ok = await correr(() => insertar('proveedor_productos', { proveedor_id: proveedorId, producto_id: f.producto_id, sku_proveedor: f.sku_proveedor || null, ultimo_costo: f.ultimo_costo === '' ? null : num(f.ultimo_costo) }), 'Producto vinculado'); if (ok) onClose() }
  return (
    <Modal open onClose={onClose} title="Vincular producto al proveedor" size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.producto_id || existentes.has(f.producto_id)} onClick={guardar}>Vincular</button></>}>
      <FormField label="Producto" required error={existentes.has(f.producto_id) ? 'Ya está vinculado' : undefined}><SelectorProducto productos={productos} value={f.producto_id} onChange={v => setF({ ...f, producto_id: v })} /></FormField>
      <FormField label="SKU del proveedor" value={f.sku_proveedor} onChange={e => setF({ ...f, sku_proveedor: e.target.value })} />
      <FormField label="Costo de referencia (sin IVA)" type="number" min="0" step="any" value={f.ultimo_costo} onChange={e => setF({ ...f, ultimo_costo: e.target.value })} />
    </Modal>
  )
}

function ModalDoc({ proveedorId, onClose, correr, ocupado }) {
  const { organizacion } = useApp()
  const [f, setF] = useState({ tipo: 'contrato', nombre: '', vigente_hasta: '' })
  const [archivo, setArchivo] = useState(null)
  const guardar = async () => {
    const ok = await correr(async () => {
      const ruta = rutaStorage(organizacion.id, 'proveedores', proveedorId, `${Date.now()}_${archivo.name.replace(/[^\w.-]+/g, '_')}`)
      const { error } = await supabase.storage.from(BUCKETS.documentos).upload(ruta, archivo)
      if (error) return { error }
      return insertar('proveedor_documentos', { proveedor_id: proveedorId, tipo: f.tipo, nombre: f.nombre.trim() || archivo.name, archivo_path: ruta, vigente_hasta: f.vigente_hasta || null })
    }, 'Documento subido')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Subir documento" size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !archivo} onClick={guardar}>Subir</button></>}>
      <FormField label="Tipo" as="select" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} options={Object.entries(TIPOS_DOC).map(([value, label]) => ({ value, label }))} />
      <FormField label="Nombre" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Contrato 2026" />
      <FormField label="Vigente hasta" type="date" value={f.vigente_hasta} onChange={e => setF({ ...f, vigente_hasta: e.target.value })} />
      <FormField label="Archivo" required><input type="file" onChange={e => setArchivo(e.target.files?.[0] ?? null)} /></FormField>
    </Modal>
  )
}
