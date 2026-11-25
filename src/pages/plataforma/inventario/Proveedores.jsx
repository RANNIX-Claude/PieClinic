// Pantalla 24 · Catálogo de proveedores (comunes a toda la clínica). Lista/mosaico, alta, baja y exportación.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, List, LayoutGrid, Truck } from 'lucide-react'
import { usePermiso } from '../../../lib/permisos'
import { insertar } from '../../../lib/api'
import { telefono } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import EmptyState from '../../../components/ui/EmptyState'
import { useProveedores, useAccion, msgError, CATEGORIAS_PROVEEDOR, condicionPago } from './comun'

export const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
const CONDICIONES = [{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }, { value: 'anticipo', label: 'Anticipo' }]

export default function Proveedores() {
  const nav = useNavigate()
  const puedeEditar = usePermiso('proveedores.editar')
  const { proveedores, cargando, error } = useProveedores()
  const [vista, setVista] = useState('lista')
  const [nuevo, setNuevo] = useState(false)
  const [cat, setCat] = useState('')
  const [est, setEst] = useState('')
  const [q, setQ] = useState('')
  const filas = useMemo(() => proveedores.filter(p => (!cat || p.categoria === cat) && (!est || (est === 'activo') === p.activo)
    && (!q || `${p.nombre} ${p.razon_social ?? ''} ${p.rfc ?? ''} ${p.clave}`.toLowerCase().includes(q.toLowerCase()))), [proveedores, cat, est, q])
  const k = useMemo(() => ({
    total: proveedores.length, activos: proveedores.filter(p => p.activo).length,
    insumos: proveedores.filter(p => ['insumos', 'material_clinico', 'plantillas_ortesis'].includes(p.categoria)).length,
    equipo: proveedores.filter(p => ['mantenimiento_equipo', 'equipo_instrumental'].includes(p.categoria)).length,
  }), [proveedores])
  const cols = [
    { key: 'clave', label: 'Clave' },
    { key: 'nombre', label: 'Proveedor', render: p => <><b>{p.nombre}</b>{p.razon_social && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.razon_social}</div>}</> },
    { key: 'rfc', label: 'RFC' }, { key: 'categoriaTxt', label: 'Categoría', filtro: true, valor: p => CATEGORIAS_PROVEEDOR[p.categoria] ?? p.categoria },
    { key: 'contacto', label: 'Contacto' }, { key: 'telefono', label: 'Teléfono', render: p => telefono(p.telefono) },
    { key: 'condiciones', label: 'Pago', valor: p => `${p.condiciones_pago}${p.dias_credito ? ` ${p.dias_credito} d` : ''}` },
    { key: 'estatus', label: 'Estatus', render: p => <StatusBadge estado={p.activo ? 'activo' : 'inactivo'} label={p.estatus} /> },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Proveedores" subtitulo="Catálogo común a toda la clínica: insumos, plantillas, equipo y mantenimiento"
        acciones={puedeEditar && <button className="btn" onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo proveedor</button>} />
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="Total proveedores" value={k.total} icon={Truck} loading={cargando} />
        <KPICard title="Activos" value={k.activos} subtitle={`${k.total - k.activos} inactivo(s)`} color="var(--green)" loading={cargando} />
        <KPICard title="Insumos y material" value={k.insumos} color="var(--accent)" loading={cargando} />
        <KPICard title="Equipo y mantenimiento" value={k.equipo} color="var(--gold)" loading={cargando} />
      </div>
      {vista === 'lista' ? (
        <DataTable columnas={cols} filas={filas} cargando={cargando} error={msgError(error)} exportarNombre="proveedores" placeholderBusqueda="Buscar nombre o RFC…" onFila={p => nav(`/proveedores/${p.id}`)}
          acciones={<>
            <select value={est} onChange={e => setEst(e.target.value)}><option value="">Estatus: todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select>
            <button className="btn o sm" onClick={() => setVista('mosaico')} title="Mosaico"><LayoutGrid size={13} /></button></>}
          vacio={{ title: 'Sin proveedores', description: 'Da de alta a tus proveedores para registrar compras y cuentas por pagar.' }} />
      ) : (
        <>
          <div className="toolbar">
            <input placeholder="Buscar nombre o RFC…" value={q} onChange={e => setQ(e.target.value)} />
            <select value={cat} onChange={e => setCat(e.target.value)}><option value="">Categoría: todas</option>{Object.entries(CATEGORIAS_PROVEEDOR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select value={est} onChange={e => setEst(e.target.value)}><option value="">Estatus: todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select>
            <button className="btn o sm" onClick={() => setVista('lista')} title="Lista"><List size={13} /></button>
          </div>
          {!filas.length ? <EmptyState title="Sin proveedores" description="Ningún proveedor coincide con el filtro." /> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
              {filas.map(p => (
                <div key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => nav(`/proveedores/${p.id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{p.nombre}</b><StatusBadge estado={p.activo ? 'activo' : 'inactivo'} label={p.estatus} /></div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{CATEGORIAS_PROVEEDOR[p.categoria]} · {p.rfc ?? 'sin RFC'}</div>
                  <div style={{ fontSize: 12.5, marginTop: 6 }}>{p.contacto ?? '—'} · {telefono(p.telefono)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.condiciones_pago}{p.dias_credito ? ` · ${p.dias_credito} días` : ''}</div>
                </div>))}
            </div>)}
        </>)}
      {nuevo && <ModalProveedor onClose={() => setNuevo(false)} onCreado={id => { setNuevo(false); if (id) nav(`/proveedores/${id}`) }} />}
    </div>
  )
}

/** Alta (sin id) o edición (con `proveedor`) de los datos generales. */
export function ModalProveedor({ proveedor, onClose, onCreado, onGuardar }) {
  const { correr, ocupado } = useAccion()
  const [f, setF] = useState({
    clave: '', nombre: '', razon_social: '', rfc: '', categoria: 'insumos', es_laboratorio: false, activo: true, telefono: '', email: '', contacto: '',
    condiciones_pago: 'contado', dias_credito: 0, dias_entrega: '', notas: '', ...(proveedor ? Object.fromEntries(Object.entries(proveedor).map(([k, v]) => [k, v ?? (typeof v === 'boolean' ? v : '')])) : {}), ...(proveedor ? { condiciones_pago: condicionPago(proveedor.condiciones_pago) } : {}),
  })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const rfc = f.rfc.trim().toUpperCase()
  const err = { nombre: !f.nombre.trim() ? 'Obligatorio' : null, clave: !f.clave.trim() ? 'Obligatoria' : null, rfc: rfc && !RFC_RE.test(rfc) ? 'RFC con formato inválido' : null }
  const guardar = async () => {
    const datos = {
      clave: f.clave.trim().toUpperCase(), nombre: f.nombre.trim(), razon_social: f.razon_social || null, rfc: rfc || null, categoria: f.categoria, es_laboratorio: !!f.es_laboratorio, activo: !!f.activo,
      telefono: f.telefono || null, email: f.email || null, contacto: f.contacto || null, condiciones_pago: f.condiciones_pago || 'contado', dias_credito: Number(f.dias_credito) || 0, dias_entrega: f.dias_entrega || null, notas: f.notas || null,
    }
    if (proveedor) { const ok = await correr(() => onGuardar(datos), 'Proveedor actualizado'); if (ok) onClose() } else {
      const r = await correr(() => insertar('proveedores', datos), 'Proveedor creado'); if (r) onCreado?.(r[0]?.id)
    }
  }
  return (
    <Modal open onClose={onClose} title={proveedor ? 'Editar datos del proveedor' : 'Nuevo proveedor'} size="wide" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || Object.values(err).some(Boolean)} onClick={guardar}>Guardar</button></>}>
      <div className="grid2">
        <FormField label="Clave" required value={f.clave} onChange={e => set('clave', e.target.value)} error={f.clave !== '' || proveedor ? err.clave : undefined} disabled={!!proveedor} hint="Corta y única (ej. PODO)" />
        <FormField label="Nombre comercial" required value={f.nombre} onChange={e => set('nombre', e.target.value)} />
        <FormField label="Razón social" value={f.razon_social} onChange={e => set('razon_social', e.target.value)} />
        <FormField label="RFC" value={f.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} error={err.rfc} />
        <FormField label="Categoría" as="select" value={f.categoria} onChange={e => set('categoria', e.target.value)} options={Object.entries(CATEGORIAS_PROVEEDOR).map(([value, label]) => ({ value, label }))} />
        <FormField label="Estatus" as="select" value={f.activo ? '1' : '0'} onChange={e => set('activo', e.target.value === '1')} options={[{ value: '1', label: 'Activo' }, { value: '0', label: 'Inactivo' }]} />
        <FormField label="Teléfono" value={f.telefono} onChange={e => set('telefono', e.target.value)} />
        <FormField label="Correo" type="email" value={f.email} onChange={e => set('email', e.target.value)} />
        <FormField label="Contacto" value={f.contacto} onChange={e => set('contacto', e.target.value)} />
        <FormField label="Condiciones de pago" as="select" value={f.condiciones_pago} onChange={e => set('condiciones_pago', e.target.value)} options={CONDICIONES} />
        <FormField label="Días de crédito" type="number" min="0" value={f.dias_credito} onChange={e => set('dias_credito', e.target.value)} />
        <FormField label="Tiempo de entrega" value={f.dias_entrega} onChange={e => set('dias_entrega', e.target.value)} placeholder="2-3 días hábiles" />
      </div>
      <label style={{ fontSize: 13, display: 'flex', gap: 6, margin: '4px 0 8px' }}><input type="checkbox" checked={!!f.es_laboratorio} onChange={e => set('es_laboratorio', e.target.checked)} /> Es laboratorio externo de plantillas ortopédicas</label>
      <FormField label="Notas" as="textarea" value={f.notas} onChange={e => set('notas', e.target.value)} />
    </Modal>
  )
}
