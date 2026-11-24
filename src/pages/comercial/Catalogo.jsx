// Catálogo y precios (mockup 19): servicios y productos, tipos de precio (fijo / desde / por unidad / a valorar / gratis),
// vigencia con HISTÓRICO (el precio nunca se sobrescribe: cada cambio es una versión nueva), precio por sede e importación.
// Lee prp_servicios, prp_productos, prp_precios_historial, prp_inventario; escribe servicios, productos y precios.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { actualizar, insertar, leer } from '../../lib/api'
import { fecha, hoyISO, moneda } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { nuevaVersionPrecio, situacionPrecio } from '../../lib/comercial/precios'
import { useLeer, AvisoError, ejecutar, textoError } from './componentes/comun'

const TIPOS_PRECIO = [['fijo', 'Fijo'], ['desde', 'Desde'], ['por_unidad', 'Por unidad'], ['a_valorar', 'A valorar'], ['gratis', 'Gratis']]
const ETQ_TIPO = Object.fromEntries(TIPOS_PRECIO)
const IVA = [['exento', 'Exento'], ['16', '16 %'], ['tasa0', 'Tasa 0 %']]
const CATEGORIAS = ['Quiropodia', 'Ungueal', 'Pie en riesgo', 'Biomecánica', 'Domicilio', 'General']

export default function Catalogo() {
  const { sedes } = useApp()
  const qc = useQueryClient()
  const puedeEditar = usePermiso('catalogo.editar')
  const [tab, setTab] = useState('servicios')
  const [filtro, setFiltro] = useState({ cat: '', tipo: '', estado: 'activo', sede: '' })
  const [edit, setEdit] = useState(null)       // { kind:'servicio'|'producto', fila }
  const [hist, setHist] = useState(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['comercial'] })

  const serv = useLeer('cat-serv', 'prp_servicios', { sedeCol: false, orden: { columna: 'codigo' }, limite: 1000 })
  const prod = useLeer('cat-prod', 'prp_productos', { sedeCol: false, orden: { columna: 'sku' }, limite: 2000 })
  const inv = useLeer('cat-inv', 'prp_inventario', { sedeCol: false, columnas: 'producto_id,existencia,sede_id', limite: 5000 })
  const hp = useLeer('cat-hist', 'prp_precios_historial', { sedeCol: false, orden: [{ columna: 'item_nombre' }, { columna: 'vigente_desde', asc: false }], limite: 3000 })
  const existencia = useMemo(() => { const m = {}; for (const i of inv.filas) m[i.producto_id] = (m[i.producto_id] ?? 0) + Number(i.existencia); return m }, [inv.filas])

  const programados = hp.filas.filter(p => p.situacion === 'programado').length
  const ultimoCambio = hp.filas.reduce((m, p) => (p.cambiado_en > m ? p.cambiado_en : m), '')
  const categorias = [...new Set(serv.filas.map(s => s.categoria))].sort()

  const servicios = serv.filas.filter(s => (!filtro.cat || s.categoria === filtro.cat) && (!filtro.tipo || s.tipo_precio === filtro.tipo) && (!filtro.estado || s.estado === filtro.estado) && (!filtro.sede || s.precio_por_sede))
  const productos = prod.filas.filter(p => (!filtro.cat || p.categoria === filtro.cat) && (!filtro.estado || (filtro.estado === 'activo' ? p.estado !== 'pausado' : p.estado === filtro.estado)))

  const alternar = async (kind, f) => {
    const tabla = kind === 'servicio' ? 'servicios' : 'productos'
    const nuevo = f.estado === 'pausado' ? 'activo' : 'pausado'
    if (await ejecutar(actualizar(tabla, f.id, { estado: nuevo }), nuevo === 'pausado' ? 'Pausado' : 'Reactivado')) refrescar()
  }

  const colServ = [
    { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Servicio' }, { key: 'categoria', label: 'Categoría', filtro: true },
    { key: 'tipo_precio', label: 'Tipo de precio', render: s => ETQ_TIPO[s.tipo_precio], valor: s => ETQ_TIPO[s.tipo_precio], filtro: true },
    { key: 'precio_lista', label: 'Precio vigente', align: 'right', render: s => (s.tipo_precio === 'a_valorar' ? '— (cotización)' : s.precio_lista == null ? 'Sin precio' : `${s.tipo_precio === 'desde' ? 'Desde ' : ''}${moneda(s.precio_lista)}${s.tipo_precio === 'por_unidad' && s.unidad_cobro ? ` / ${s.unidad_cobro}` : ''}`), valor: s => Number(s.precio_lista ?? 0) },
    { key: 'duracion_min', label: 'Min', align: 'right' }, { key: 'iva_tipo', label: 'IVA', render: s => IVA.find(i => i[0] === s.iva_tipo)?.[1], filtro: true },
    { key: 'requiere_seguimiento', label: 'Seguimiento', render: s => (s.requiere_seguimiento ? (s.regla_seguimiento?.curaciones ? `Sí · ${s.regla_seguimiento.curaciones} curaciones` : 'Sí') : 'No'), valor: s => (s.requiere_seguimiento ? 'Sí' : 'No') },
    { key: 'requiere_consentimiento', label: 'Consent.', render: s => (s.requiere_consentimiento ? 'Sí' : 'No') },
    { key: 'precio_por_sede', label: 'Precio por sede', render: s => (s.precio_por_sede ? `Sí (${s.sedes_con_precio_propio})` : 'No') },
    { key: 'estado', label: 'Estatus', render: s => <StatusBadge estado={s.estado} />, filtro: true },
    { key: 'acc', label: '', sortable: false, exportar: false, render: s => (
      <div style={{ display: 'flex', gap: 4 }}>{puedeEditar && <button className="btn o" onClick={() => setEdit({ kind: 'servicio', fila: s })}>Editar</button>}<button className="btn o" onClick={() => setHist({ tipo: 'servicio', id: s.id, nombre: s.nombre })}>Historial</button>
        {puedeEditar && <button className="btn o" onClick={() => alternar('servicio', s)}>{s.estado === 'pausado' ? 'Reactivar' : 'Pausar'}</button>}</div>) },
  ]
  const colProd = [
    { key: 'sku', label: 'SKU' }, { key: 'nombre', label: 'Producto' }, { key: 'categoria', label: 'Categoría', filtro: true }, { key: 'marca', label: 'Marca' },
    { key: 'precio_lista', label: 'Precio venta', align: 'right', render: p => moneda(p.precio_lista), valor: p => Number(p.precio_lista ?? 0) }, { key: 'costo_promedio', label: 'Costo prom.', align: 'right', render: p => moneda(p.costo_promedio), valor: p => Number(p.costo_promedio) },
    { key: 'margen_pct', label: 'Margen', align: 'right', render: p => (p.margen_pct == null ? '—' : `${Math.round(p.margen_pct)} %`), valor: p => Number(p.margen_pct ?? 0) },
    { key: 'iva_tipo', label: 'IVA', render: p => IVA.find(i => i[0] === p.iva_tipo)?.[1] },
    { key: 'existencia', label: 'Existencia', align: 'right', render: p => (existencia[p.id] ?? (inv.error ? '—' : 0)), valor: p => existencia[p.id] ?? 0 },
    { key: 'precio_por_sede', label: 'Precio por sede', render: p => (p.precio_por_sede ? 'Sí' : 'No') },
    { key: 'estado', label: 'Estatus', render: p => <StatusBadge estado={p.estado} />, filtro: true },
    { key: 'acc', label: '', sortable: false, exportar: false, render: p => (
      <div style={{ display: 'flex', gap: 4 }}>{puedeEditar && <button className="btn o" onClick={() => setEdit({ kind: 'producto', fila: p })}>Editar</button>}<button className="btn o" onClick={() => setHist({ tipo: 'producto', id: p.id, nombre: p.nombre })}>Historial</button></div>) },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Catálogo y precios" subtitulo="Servicios y productos · tipos de precio, vigencia, histórico y precio por sucursal"
        acciones={puedeEditar && <><button className="btn" onClick={() => setEdit({ kind: 'servicio', fila: null })}><Plus size={14} /> Nuevo servicio</button><button className="btn" onClick={() => setEdit({ kind: 'producto', fila: null })}><Plus size={14} /> Nuevo producto</button></>} />
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Servicios activos" value={serv.filas.filter(s => s.estado === 'activo').length} subtitle={`${serv.filas.filter(s => s.estado === 'pausado').length} pausados`} loading={serv.cargando} />
        <KPICard title="Productos activos" value={prod.filas.filter(p => p.estado !== 'pausado').length} subtitle={`${prod.filas.filter(p => p.estado === 'sin_existencia').length} sin existencia`} color="var(--green)" loading={prod.cargando} />
        <KPICard title="Precios con vigencia futura" value={programados} color="var(--gold)" loading={hp.cargando} />
        <KPICard title="Último cambio de precios" value={ultimoCambio ? fecha(ultimoCambio) : '—'} loading={hp.cargando} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'servicios', label: 'Servicios' }, { id: 'productos', label: 'Productos' }, { id: 'historico', label: 'Histórico de precios' }, { id: 'importar', label: 'Importar lista de precios', oculto: !puedeEditar }]} />
      {(tab === 'servicios' || tab === 'productos') && (
        <div className="toolbar" style={{ margin: '10px 0' }}>
          <select value={filtro.cat} onChange={e => setFiltro(f => ({ ...f, cat: e.target.value }))}><option value="">Categoría: todas</option>{(tab === 'servicios' ? categorias : [...new Set(prod.filas.map(p => p.categoria))]).map(c => <option key={c}>{c}</option>)}</select>
          {tab === 'servicios' && <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}><option value="">Tipo de precio: todos</option>{TIPOS_PRECIO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          {tab === 'servicios' && <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!filtro.sede} onChange={e => setFiltro(f => ({ ...f, sede: e.target.checked ? 'si' : '' }))} /> Solo con precio por sucursal</label>}
          <select value={filtro.estado} onChange={e => setFiltro(f => ({ ...f, estado: e.target.value }))}><option value="activo">Activos</option><option value="pausado">Pausados</option><option value="">Todos</option></select>
        </div>
      )}
      <div className="card" style={{ padding: 0, marginTop: tab === 'servicios' || tab === 'productos' ? 0 : 10 }}>
        {tab === 'servicios' && (<><AvisoError error={serv.error} /><DataTable columnas={colServ} filas={servicios} cargando={serv.cargando} exportarNombre="servicios" vacio={{ title: 'Sin servicios', description: 'Crea el primero con «Nuevo servicio».' }} /></>)}
        {tab === 'productos' && (<><AvisoError error={prod.error} /><DataTable columnas={colProd} filas={productos} cargando={prod.cargando} exportarNombre="productos" vacio={{ title: 'Sin productos', description: 'Crea el primero con «Nuevo producto».' }} /></>)}
        {tab === 'historico' && (<><AvisoError error={hp.error} /><DataTable cargando={hp.cargando} filas={hp.filas} exportarNombre="historico-precios" vacio={{ title: 'Sin histórico', description: 'Cada cambio de precio queda guardado con quién, cuándo y por qué.' }}
          columnas={[{ key: 'item_nombre', label: 'Concepto' }, { key: 'item_tipo', label: 'Tipo', filtro: true }, { key: 'vigente_desde', label: 'Vigente desde', render: p => fecha(p.vigente_desde) }, { key: 'vigente_hasta', label: 'Vigente hasta', render: p => (p.vigente_hasta ? fecha(p.vigente_hasta) : 'vigente') },
            { key: 'sede_nombre', label: 'Sucursal', render: p => p.sede_nombre ?? 'Todas (lista)', valor: p => p.sede_nombre ?? 'Todas (lista)', filtro: true }, { key: 'tipo_precio', label: 'Tipo de precio', render: p => ETQ_TIPO[p.tipo_precio] },
            { key: 'precio', label: 'Precio', align: 'right', render: p => moneda(p.precio), valor: p => Number(p.precio) }, { key: 'motivo', label: 'Motivo' }, { key: 'creado_por_nombre', label: 'Cambió' }, { key: 'cambiado_en', label: 'Fecha de cambio', render: p => fecha(p.cambiado_en) },
            { key: 'situacion', label: 'Situación', render: p => <StatusBadge estado={p.situacion} variante={p.situacion === 'vigente' ? 'v' : p.situacion === 'programado' ? 'a' : 'n'} />, filtro: true }]} /></>)}
        {tab === 'importar' && <ImportarPrecios servicios={serv.filas} productos={prod.filas} onListo={refrescar} />}
      </div>
      {edit && <EditorItem kind={edit.kind} fila={edit.fila} sedes={sedes} categorias={categorias} onClose={() => setEdit(null)} onListo={() => { refrescar() }} />}
      {hist && <Historial item={hist} onClose={() => setHist(null)} />}
    </div>
  )
}

function Historial({ item, onClose }) {
  const h = useLeer('hist-item', 'prp_precios_historial', { sedeCol: false, filtros: { item_id: item.id }, orden: { columna: 'vigente_desde', asc: false }, limite: 200 })
  return (
    <Modal open onClose={onClose} size="wide" title={`Histórico de precios · ${item.nombre}`} footer={<button className="btn o" onClick={onClose}>Cerrar</button>}>
      <AvisoError error={h.error} />
      <table><thead><tr><th>Vigente desde</th><th>Hasta</th><th>Sucursal</th><th>Tipo</th><th className="num">Precio</th><th>Motivo</th><th>Cambió</th><th>Fecha de cambio</th></tr></thead>
        <tbody>{h.filas.map(p => <tr key={p.id}><td>{fecha(p.vigente_desde)}</td><td>{p.vigente_hasta ? fecha(p.vigente_hasta) : <b>vigente</b>}</td><td>{p.sede_nombre ?? 'Todas (lista)'}</td><td>{ETQ_TIPO[p.tipo_precio]}</td><td className="num">{moneda(p.precio)}</td><td>{p.motivo}</td><td>{p.creado_por_nombre}</td><td>{fecha(p.cambiado_en)}</td></tr>)}
          {!h.cargando && !h.filas.length && <tr><td colSpan={8} className="text-muted">Sin versiones de precio.</td></tr>}</tbody></table>
    </Modal>
  )
}

// ── Editor de servicio / producto ────────────────────────────────────────────────────────────────────
function EditorItem({ kind, fila, sedes, categorias, onClose, onListo }) {
  const esServ = kind === 'servicio'
  const tabla = esServ ? 'servicios' : 'productos'
  const [id, setId] = useState(fila?.id ?? null)
  const [f, setF] = useState(() => fila ? { ...fila, aliasTxt: (fila.alias ?? []).join(', '), curaciones: fila.regla_seguimiento?.curaciones ?? '', intervalo: fila.regla_seguimiento?.intervalo ?? '' } : esServ
    ? { codigo: '', nombre: '', categoria: 'Quiropodia', tipo_precio: 'fijo', duracion_min: 30, iva_tipo: 'exento', requiere_seguimiento: false, requiere_consentimiento: false, admite_videoconsulta: false, admite_domicilio: false, visible_portal: false, estado: 'activo', aliasTxt: '', curaciones: '', intervalo: '' }
    : { sku: '', nombre: '', categoria: 'Cuidado en casa', tipo: 'venta', iva_tipo: '16', estado: 'activo', visible_portal: false, maneja_lote: false, maneja_caducidad: false })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const [precio, setPrecio] = useState({ monto: '', desde: hoyISO(), motivo: 'Ajuste', sede: '' })
  const [guardando, setGuardando] = useState(false)
  const precios = useLeer('precios-item', 'precios', { sedeCol: false, filtros: esServ ? { servicio_id: id } : { producto_id: id }, orden: { columna: 'vigente_desde', asc: false }, limite: 200 }, !!id)
  const vigenteLista = precios.filas.find(p => !p.sede_id && situacionPrecio(p) === 'vigente')

  const guardarItem = async () => {
    if (!f.nombre.trim() || !(esServ ? f.codigo.trim() : f.sku.trim())) return toast.error('Código/SKU y nombre son obligatorios')
    const comunes = { nombre: f.nombre.trim(), categoria: f.categoria, iva_tipo: f.iva_tipo, estado: f.estado, visible_portal: !!f.visible_portal, clave_sat: f.clave_sat || null, unidad_sat: f.unidad_sat || null, renglon_edr: f.renglon_edr || null, precio_por_sede: !!f.precio_por_sede }
    const datos = esServ ? { ...comunes, codigo: f.codigo.trim(), alias: f.aliasTxt.split(',').map(s => s.trim()).filter(Boolean), tipo_precio: f.tipo_precio, unidad_cobro: f.unidad_cobro || null, duracion_min: Number(f.duracion_min),
        requiere_seguimiento: !!f.requiere_seguimiento, regla_seguimiento: f.requiere_seguimiento && f.curaciones ? { curaciones: Number(f.curaciones), intervalo: f.intervalo || 'diario' } : {}, revision_dias_min: f.revision_dias_min ? Number(f.revision_dias_min) : null, revision_dias_max: f.revision_dias_max ? Number(f.revision_dias_max) : null,
        requiere_consentimiento: !!f.requiere_consentimiento, garantia_dias: f.garantia_dias !== '' && f.garantia_dias != null ? Number(f.garantia_dias) : null, admite_videoconsulta: !!f.admite_videoconsulta, admite_domicilio: !!f.admite_domicilio,
        recargo_domicilio: f.recargo_domicilio ? Number(f.recargo_domicilio) : null, descripcion_publica: f.descripcion_publica || null, anticipo_monto_fijo: f.anticipo_monto_fijo !== '' && f.anticipo_monto_fijo != null ? Number(f.anticipo_monto_fijo) : null, es_curacion_incluida: !!f.es_curacion_incluida, valoracion_acreditable: !!f.valoracion_acreditable }
      : { ...comunes, sku: f.sku.trim(), codigo_barras: f.codigo_barras || null, marca: f.marca || null, presentacion: f.presentacion || null, tipo: f.tipo, maneja_lote: !!f.maneja_lote, maneja_caducidad: !!f.maneja_caducidad }
    setGuardando(true)
    const r = await (id ? actualizar(tabla, id, datos) : insertar(tabla, datos)).catch(e => ({ error: e }))
    setGuardando(false)
    if (r.error) return toast.error(textoError(r.error))
    toast.success(id ? 'Guardado' : 'Creado: ahora define su precio')
    if (!id) setId(r.data[0].id)
    onListo()
  }

  const guardarPrecio = async (programado) => {
    if (!id) return toast.error('Guarda primero el servicio o producto')
    if (precio.monto === '' || !(Number(precio.monto) >= 0)) return toast.error('Captura el precio (con IVA incluido)')
    const desde = programado ? precio.desde : (precio.desde > hoyISO() ? hoyISO() : precio.desde)
    if (programado && desde <= hoyISO()) return toast.error('Para programar elige una fecha futura')
    const v = nuevaVersionPrecio(precios.filas.filter(p => (p.sede_id ?? null) === (precio.sede || null)), { vigente_desde: desde, precio: precio.monto, sede_id: precio.sede || null, tipo_precio: esServ ? f.tipo_precio : 'fijo', motivo: precio.motivo || 'Ajuste' })
    if (!v.ok) return toast.error(v.error)
    const fila = { item_tipo: esServ ? 'servicio' : 'producto', ...(esServ ? { servicio_id: id } : { producto_id: id }), sede_id: v.nueva.sede_id, vigente_desde: v.nueva.vigente_desde, precio: v.nueva.precio, tipo_precio: v.nueva.tipo_precio, motivo: v.nueva.motivo }
    if (await ejecutar(insertar('precios', fila), programado ? 'Cambio de precio programado' : 'Nueva versión de precio guardada (el anterior queda en el histórico)')) { setPrecio(p => ({ ...p, monto: '' })); precios.refetch(); onListo() }
  }

  return (
    <Modal open onClose={onClose} size="wide" title={`${fila ? 'Editar' : 'Nuevo'} ${esServ ? 'servicio' : 'producto'}${fila ? ` · ${fila.codigo ?? fila.sku}` : ''}`}
      footer={<><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn" disabled={guardando} onClick={guardarItem}>Guardar {esServ ? 'servicio' : 'producto'}</button></>}>
      <div className="grid2" style={{ gap: 16, alignItems: 'start' }}>
        <div>
          <div className="grid2">
            <FormField label={esServ ? 'Código' : 'SKU'} required value={(esServ ? f.codigo : f.sku) ?? ''} disabled={!!fila} onChange={e => set(esServ ? 'codigo' : 'sku', e.target.value)} />
            <FormField label="Categoría" value={f.categoria ?? ''} onChange={e => set('categoria', e.target.value)} list="cat-list" />
            <datalist id="cat-list">{[...new Set([...CATEGORIAS, ...categorias])].map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <FormField label="Nombre canónico" required value={f.nombre} onChange={e => set('nombre', e.target.value)} />
          {esServ ? (<>
            <FormField label="Alias / sinónimos (separados por coma)" value={f.aliasTxt} onChange={e => set('aliasTxt', e.target.value)} />
            <div className="field"><label>Tipo de precio</label><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>{TIPOS_PRECIO.map(([v, l]) => <label key={v}><input type="radio" name="tp" checked={f.tipo_precio === v} onChange={() => set('tipo_precio', v)} /> {l}</label>)}</div></div>
            {f.tipo_precio === 'por_unidad' && <FormField label="Unidad de cobro" value={f.unidad_cobro ?? ''} onChange={e => set('unidad_cobro', e.target.value)} placeholder="por uña" />}
            <div className="grid3">
              <FormField label="Duración (min)" type="number" min="5" value={f.duracion_min} onChange={e => set('duracion_min', e.target.value)} />
              <FormField label="IVA" as="select" value={f.iva_tipo} onChange={e => set('iva_tipo', e.target.value)} options={IVA.map(([value, label]) => ({ value, label }))} />
              <FormField label="Garantía (días)" type="number" min="0" value={f.garantia_dias ?? ''} onChange={e => set('garantia_dias', e.target.value)} />
            </div>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!f.requiere_seguimiento} onChange={e => set('requiere_seguimiento', e.target.checked)} /> Requiere seguimiento</label>
            {f.requiere_seguimiento && <div className="grid3" style={{ marginTop: 6 }}><FormField label="Curaciones" type="number" min="0" value={f.curaciones} onChange={e => set('curaciones', e.target.value)} /><FormField label="Intervalo" value={f.intervalo} onChange={e => set('intervalo', e.target.value)} placeholder="diario" /><FormField label="Revisión (días mín–máx)" value={`${f.revision_dias_min ?? ''}${f.revision_dias_max ? '-' + f.revision_dias_max : ''}`} onChange={e => { const [a, b] = e.target.value.split('-'); set('revision_dias_min', a); set('revision_dias_max', b) }} /></div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13, margin: '8px 0' }}>
              {[['requiere_consentimiento', 'Requiere consentimiento'], ['admite_videoconsulta', 'Admite videoconsulta'], ['admite_domicilio', 'Admite domicilio'], ['visible_portal', 'Visible en el portal'], ['precio_por_sede', 'Precio por sucursal'], ['es_curacion_incluida', 'Curación incluida ($0)'], ['valoracion_acreditable', 'Valoración acreditable']].map(([k, l]) =>
                <label key={k}><input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} /> {l}</label>)}
            </div>
            <div className="grid2"><FormField label="Recargo domicilio" type="number" min="0" value={f.recargo_domicilio ?? ''} onChange={e => set('recargo_domicilio', e.target.value)} /><FormField label="Anticipo fijo (opcional)" type="number" min="0" value={f.anticipo_monto_fijo ?? ''} onChange={e => set('anticipo_monto_fijo', e.target.value)} hint="Si se deja vacío: 30 % del precio" /></div>
            <FormField label="Descripción pública (portal)" as="textarea" rows={2} value={f.descripcion_publica ?? ''} onChange={e => set('descripcion_publica', e.target.value)} />
          </>) : (<>
            <div className="grid2"><FormField label="Marca" value={f.marca ?? ''} onChange={e => set('marca', e.target.value)} /><FormField label="Código de barras" value={f.codigo_barras ?? ''} onChange={e => set('codigo_barras', e.target.value)} /></div>
            <div className="grid3"><FormField label="Tipo" as="select" value={f.tipo} onChange={e => set('tipo', e.target.value)} options={[{ value: 'venta', label: 'Venta' }, { value: 'insumo_clinico', label: 'Insumo clínico' }, { value: 'por_encargo', label: 'Por encargo' }]} />
              <FormField label="IVA" as="select" value={f.iva_tipo} onChange={e => set('iva_tipo', e.target.value)} options={IVA.map(([value, label]) => ({ value, label }))} /><FormField label="Presentación" value={f.presentacion ?? ''} onChange={e => set('presentacion', e.target.value)} /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 13 }}>{[['maneja_lote', 'Maneja lote'], ['maneja_caducidad', 'Maneja caducidad'], ['visible_portal', 'Visible en portal'], ['precio_por_sede', 'Precio por sucursal']].map(([k, l]) => <label key={k}><input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} /> {l}</label>)}</div>
          </>)}
          <div className="grid2" style={{ marginTop: 8 }}><FormField label="Clave SAT" value={f.clave_sat ?? ''} onChange={e => set('clave_sat', e.target.value)} hint="Sugerencia a validar con el contador" /><FormField label="Unidad SAT" value={f.unidad_sat ?? ''} onChange={e => set('unidad_sat', e.target.value)} /></div>
          <FormField label="Estatus" as="select" value={f.estado} onChange={e => set('estado', e.target.value)} options={esServ ? [{ value: 'activo', label: 'Activo' }, { value: 'pausado', label: 'Pausado' }] : [{ value: 'activo', label: 'Activo' }, { value: 'sin_existencia', label: 'Sin existencia' }, { value: 'pausado', label: 'Pausado' }]} />
        </div>
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ marginBottom: 6 }}>Precio (IVA incluido)</h4>
            {!id ? <div className="text-muted" style={{ fontSize: 13 }}>Guarda el {esServ ? 'servicio' : 'producto'} para definir su precio.</div> : (<>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Vigente hoy: <b>{vigenteLista ? moneda(vigenteLista.precio) : 'sin precio'}</b>{vigenteLista ? ` desde ${fecha(vigenteLista.vigente_desde)}` : ''}</div>
              <div className="grid2">
                <FormField label="Nuevo precio" type="number" min="0" step="0.01" value={precio.monto} onChange={e => setPrecio(p => ({ ...p, monto: e.target.value }))} />
                <FormField label="Vigente desde" type="date" value={precio.desde} onChange={e => setPrecio(p => ({ ...p, desde: e.target.value }))} />
              </div>
              <div className="grid2">
                <FormField label="Sucursal" as="select" value={precio.sede} onChange={e => setPrecio(p => ({ ...p, sede: e.target.value }))} placeholder="Todas (lista)" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
                <FormField label="Motivo" as="select" value={precio.motivo} onChange={e => setPrecio(p => ({ ...p, motivo: e.target.value }))} options={['Alta inicial', 'Ajuste', 'Promoción', 'Precio por sede', 'Inflación'].map(m => ({ value: m, label: m }))} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn" onClick={() => guardarPrecio(false)}>Guardar cambio de precio</button><button className="btn o" onClick={() => guardarPrecio(true)}>Programar cambio futuro</button></div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Crea un registro nuevo en el histórico; lo ya cobrado o agendado conserva su precio (P-068).</div>
            </>)}
          </div>
          {id && (
            <div className="card">
              <h4 style={{ marginBottom: 6 }}>Versiones y precio por sucursal</h4>
              <table style={{ fontSize: 12.5 }}><thead><tr><th>Sucursal</th><th className="num">Precio</th><th>Vigencia</th><th /></tr></thead>
                <tbody>{precios.filas.map(p => <tr key={p.id}><td>{p.sede_id ? sedes.find(s => s.id === p.sede_id)?.nombre ?? '—' : 'Todas (lista)'}</td><td className="num">{moneda(p.precio)}</td><td>{fecha(p.vigente_desde)} → {p.vigente_hasta ? fecha(p.vigente_hasta) : 'sin fin'}</td><td><StatusBadge estado={situacionPrecio(p)} variante={situacionPrecio(p) === 'vigente' ? 'v' : situacionPrecio(p) === 'programado' ? 'a' : 'n'} /></td></tr>)}
                  {!precios.filas.length && <tr><td colSpan={4} className="text-muted">Sin precios.</td></tr>}</tbody></table>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Las sucursales sin precio propio heredan el de lista.</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Importar lista de precios (CSV pegado) ───────────────────────────────────────────────────────────
function ImportarPrecios({ servicios, productos, onListo }) {
  const [texto, setTexto] = useState('')
  const [filas, setFilas] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const revisar = async () => {
    const todos = await leer('precios', { sedeCol: false, limite: 10000 })
    const out = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => !/^codigo|^sku/i.test(l)).map((l, i) => {
      const [cod, monto, desde, motivo] = l.split(/[,;\t]/).map(s => s.trim())
      const s = servicios.find(x => x.codigo === cod), p = productos.find(x => x.sku === cod)
      const item = s ?? p
      if (!item) return { i, cod, error: 'Código no encontrado' }
      const previos = todos.data.filter(x => (s ? x.servicio_id === s.id : x.producto_id === p.id) && !x.sede_id)
      const v = nuevaVersionPrecio(previos, { vigente_desde: desde || hoyISO(), precio: monto, motivo: motivo || 'Ajuste', tipo_precio: s?.tipo_precio ?? 'fijo' })
      return { i, cod, nombre: item.nombre, monto: Number(monto), desde: desde || hoyISO(), motivo: motivo || 'Ajuste', es: s ? 'servicio' : 'producto', id: item.id, error: v.ok ? null : v.error, tipo_precio: s?.tipo_precio ?? 'fijo' }
    })
    setFilas(out)
  }
  const importar = async () => {
    const ok = filas.filter(f => !f.error)
    setOcupado(true)
    let n = 0
    for (const f of ok) {
      const r = await insertar('precios', { item_tipo: f.es, ...(f.es === 'servicio' ? { servicio_id: f.id } : { producto_id: f.id }), vigente_desde: f.desde, precio: f.monto, tipo_precio: f.tipo_precio, motivo: f.motivo })
      if (r.error) toast.error(`${f.cod}: ${textoError(r.error)}`); else n++
    }
    setOcupado(false); toast.success(`${n} precios importados`); setFilas(null); setTexto(''); onListo()
  }
  return (
    <div style={{ padding: 14 }}>
      <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Pega una lista con columnas <code>código o SKU, precio, vigente desde (AAAA-MM-DD, opcional), motivo (opcional)</code>. Cada fila crea una versión nueva de precio de lista; nada se sobrescribe.</div>
      <textarea rows={7} style={{ width: '100%', fontFamily: 'monospace' }} value={texto} onChange={e => { setTexto(e.target.value); setFilas(null) }} placeholder={'SV-001, 420, 2026-11-01, Ajuste anual\nPF-CR-020, 260'} />
      <div style={{ margin: '8px 0', display: 'flex', gap: 8 }}><button className="btn o" disabled={!texto.trim()} onClick={revisar}>Revisar</button>{filas && <button className="btn" disabled={ocupado || !filas.some(f => !f.error)} onClick={importar}>Importar {filas.filter(f => !f.error).length} válidos</button>}</div>
      {filas && <table><thead><tr><th>Código</th><th>Concepto</th><th className="num">Precio</th><th>Desde</th><th>Resultado</th></tr></thead><tbody>{filas.map(f => <tr key={f.i}><td>{f.cod}</td><td>{f.nombre ?? '—'}</td><td className="num">{f.monto != null ? moneda(f.monto) : '—'}</td><td>{f.desde ? fecha(f.desde) : '—'}</td><td>{f.error ? <span className="text-red">{f.error}</span> : <span className="text-green">OK</span>}</td></tr>)}</tbody></table>}
    </div>
  )
}
