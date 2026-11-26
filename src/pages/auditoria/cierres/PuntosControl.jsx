// Configuración del checklist (dueño y soporte RANNIX): puntos de control versionados, tomas fijas por sucursal y consumo esperado de insumos por servicio.
// Agregar un control es configuración, no desarrollo. Un punto NUNCA se edita: cada cambio crea la versión siguiente y los cierres ya hechos se consultan
// con la versión de su fecha. Toda escritura es por RPC (la app no tiene INSERT/UPDATE/DELETE en ctl_*).
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { leer } from '../../../lib/api'
import { listar, guardarPuntoControl } from '../../../lib/auditoria/api'
import { formulasEsperado, guardarToma, guardarConsumo } from '../../../lib/auditoria/apiCierres'
import { NOMBRE_TIPO_CAPTURA, TIPOS_CAPTURA } from '../../../lib/auditoria/cierres'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useDatos, EstadoConsulta, errMsg } from '../comun'

const NUEVO = { nombre: '', tipo_captura: 'numero', obligatorio: true, aplica_apertura: false, aplica_turno: true, aplica_dia: false, aplica_semanal: false, formula_esperado: '', tolerancia: 0, orden: 100, activo: true, sucursales: null, parametros: {} }
const aplicaTxt = p => [p.aplica_apertura && 'apertura', p.aplica_turno && 'turno', p.aplica_dia && 'día', p.aplica_semanal && 'semana'].filter(Boolean).join(', ')

// ───────────────────────────── puntos de control ─────────────────────────────
export function Puntos({ puedeEditar }) {
  const qc = useQueryClient()
  const { sedes } = useApp()
  const [todas, setTodas] = useState(false)
  const [edit, setEdit] = useState(null)
  const q = useDatos(['ctl-puntos', todas], () => listar('ctl_punto_control', { orden: [{ columna: 'orden', asc: true }, { columna: 'version', asc: false }], limite: 500, filtros: todas ? {} : { vigente_hasta: null } }))
  const formulas = useDatos(['ctl-formulas'], formulasEsperado)
  const productos = useDatos(['ctl-productos-insumo'], () => leer('ctl_producto_captura', { sedeCol: false, orden: [{ columna: 'descripcion', asc: true }], limite: 3000 }))
  const nombreFormula = Object.fromEntries((formulas.data?.data ?? []).map(f => [f.clave, f.nombre]))
  const filas = (q.data?.data ?? []).filter(p => todas || p.vigente_hasta == null)
  const f = formulas.data?.data?.find(x => x.clave === edit?.formula_esperado)

  async function guardar() {
    const d = edit
    const par = { ...(d.parametros ?? {}) }
    if (f?.requiere_producto) { par.producto_id = par.producto_id || null; par.kits_por_servicio = Number(par.kits_por_servicio || 1) } else { delete par.producto_id; delete par.kits_por_servicio }
    if (d.tipo_captura !== 'solo_foto') delete par.toma_fija
    const datos = {
      nombre: d.nombre, tipo_captura: d.tipo_captura, obligatorio: d.obligatorio, aplica_apertura: d.aplica_apertura, aplica_turno: d.aplica_turno, aplica_dia: d.aplica_dia, aplica_semanal: d.aplica_semanal,
      formula_esperado: d.formula_esperado || null, tolerancia: Number(d.tolerancia || 0), orden: Number(d.orden || 100), activo: d.activo, sucursales: d.sucursales?.length ? d.sucursales : null, parametros: par,
    }
    const r = await guardarPuntoControl(d.id ?? null, datos)
    if (r.error) return toast.error(errMsg(r.error), { duration: 10000 })
    toast.success(d.id ? 'Se creó una versión nueva del punto de control' : 'Punto de control creado')
    setEdit(null); qc.invalidateQueries({ queryKey: ['ctl-puntos'] })
  }
  const columnas = [
    { key: 'orden', label: '#', align: 'right' }, { key: 'nombre', label: 'Punto de control' },
    { key: 'tipo_captura', label: 'Captura', render: p => NOMBRE_TIPO_CAPTURA[p.tipo_captura] ?? p.tipo_captura, valor: p => NOMBRE_TIPO_CAPTURA[p.tipo_captura] ?? p.tipo_captura },
    { key: 'obligatorio', label: 'Obligatorio', render: p => (p.obligatorio ? 'Sí' : 'No'), valor: p => (p.obligatorio ? 'Sí' : 'No') },
    { key: 'aplica', label: 'Aplica en', valor: aplicaTxt },
    { key: 'sucursales', label: 'Sucursales', render: p => (p.sucursales?.length ? `${p.sucursales.length} elegida(s)` : 'Todas'), valor: p => (p.sucursales?.length ? 'Elegidas' : 'Todas') },
    { key: 'formula_esperado', label: 'Cuadra contra', render: p => nombreFormula[p.formula_esperado] ?? '—', valor: p => nombreFormula[p.formula_esperado] ?? '—' },
    { key: 'tolerancia', label: 'Tolerancia', align: 'right', render: p => (p.formula_esperado === 'efectivo_esperado' || p.formula_esperado === 'kits_usados' ? 'Parámetro' : p.tolerancia) },
    { key: 'version', label: 'Versión', align: 'right', render: p => `v${p.version}${p.vigente_hasta ? ' (anterior)' : ''}` },
    { key: 'activo', label: 'Estado', render: p => <StatusBadge variante={p.activo && !p.vigente_hasta ? 'v' : 'n'} label={p.vigente_hasta ? 'Reemplazada' : p.activo ? 'Activo' : 'Inactivo'} />, valor: p => (p.activo ? 'Activo' : 'Inactivo') },
    { key: 'acc', label: '', exportar: false, sortable: false, render: p => puedeEditar && !p.vigente_hasta && <button className="btn o sm" onClick={() => setEdit({ ...NUEVO, ...p, formula_esperado: p.formula_esperado ?? '', parametros: p.parametros ?? {} })}><Pencil size={13} style={{ verticalAlign: -2 }} /> Editar</button> },
  ]
  const compatibles = (formulas.data?.data ?? []).filter(x => x.tipos_captura.includes(edit?.tipo_captura))
  const flag = (k, t) => <label key={k} style={{ display: 'block', fontSize: 13, margin: '4px 0' }}><input type="checkbox" checked={!!edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.checked })} /> {t}</label>
  const alternar = id => { const a = new Set(edit.sucursales ?? []); a.has(id) ? a.delete(id) : a.add(id); setEdit({ ...edit, sucursales: [...a] }) }
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>El cierre es el recorrido de estos puntos: <b>agregar un control es configuración, no desarrollo</b>. Un punto <b>nunca se edita</b>: cada cambio crea una versión nueva y los cierres anteriores se consultan con la versión de su fecha. La tolerancia de efectivo y de kits es un parámetro (por sucursal); la de los demás puntos es la del punto.</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Ver también versiones anteriores</label>
        {puedeEditar && <button className="btn sm" onClick={() => setEdit({ ...NUEVO })}><Plus size={13} style={{ verticalAlign: -2 }} /> Nuevo punto</button>}
      </div>
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && <DataTable columnas={columnas} filas={filas} buscador={false} sinPaginacion vacio={{ title: 'Sin puntos de control', description: 'Crea el primer punto del checklist.' }} />}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Editar «${edit.nombre}» (crea la versión ${edit.version + 1})` : 'Nuevo punto de control'}
        footer={<><button className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" disabled={!edit?.nombre?.trim()} onClick={guardar}>Guardar</button></>}>
        {edit && <>
          <FormField label="Nombre" value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} />
          <FormField label="Tipo de captura" as="select" value={edit.tipo_captura} options={TIPOS_CAPTURA.map(value => ({ value, label: NOMBRE_TIPO_CAPTURA[value] }))}
            onChange={e => setEdit({ ...edit, tipo_captura: e.target.value, formula_esperado: '' })} />
          {edit.tipo_captura !== 'solo_foto' && (
            <FormField label="Cuadra contra" as="select" value={edit.formula_esperado ?? ''} placeholder="Ninguna (solo evidencia)" options={compatibles.map(x => ({ value: x.clave, label: x.nombre }))}
              onChange={e => setEdit({ ...edit, formula_esperado: e.target.value })} hint={f?.descripcion} />)}
          {f?.requiere_producto && (
            <>
              <FormField label="Insumo que se cuenta (el kit)" as="select" value={edit.parametros?.producto_id ?? ''} options={(productos.data?.data ?? []).map(p => ({ value: p.id, label: p.descripcion }))}
                onChange={e => setEdit({ ...edit, parametros: { ...edit.parametros, producto_id: e.target.value } })} />
              <FormField label="Kits por servicio (si el insumo no tiene consumo esperado definido)" type="number" min="0.001" step="0.001" value={edit.parametros?.kits_por_servicio ?? 1}
                onChange={e => setEdit({ ...edit, parametros: { ...edit.parametros, kits_por_servicio: e.target.value } })} />
            </>)}
          {edit.tipo_captura === 'solo_foto' && (
            <label style={{ display: 'block', fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={!!edit.parametros?.toma_fija} onChange={e => setEdit({ ...edit, parametros: { ...edit.parametros, toma_fija: e.target.checked } })} /> Es de tomas fijas (pide una foto por cada toma configurada de la sucursal)</label>)}
          {!['efectivo_esperado', 'kits_usados'].includes(edit.formula_esperado) && <FormField label="Tolerancia (±)" type="number" min="0" value={edit.tolerancia} onChange={e => setEdit({ ...edit, tolerancia: e.target.value })} />}
          <FormField label="Orden" type="number" value={edit.orden} onChange={e => setEdit({ ...edit, orden: e.target.value })} />
          {flag('obligatorio', 'Obligatorio (no se cierra sin él)')}{flag('aplica_apertura', 'Aplica a la apertura')}{flag('aplica_turno', 'Aplica al cierre de turno')}
          {flag('aplica_dia', 'Aplica al cierre de día')}{flag('aplica_semanal', 'Aplica al cierre semanal')}{flag('activo', 'Activo')}
          <div style={{ marginTop: 8, fontSize: 13 }}><b>Sucursales</b> <span className="hint">(ninguna marcada = todas)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>{sedes.map(s => <label key={s.id}><input type="checkbox" checked={edit.sucursales?.includes(s.id) ?? false} onChange={() => alternar(s.id)} /> {s.nombre}</label>)}</div></div>
        </>}
      </Modal>
    </>
  )
}

// ───────────────────────────── tomas fijas por sucursal ─────────────────────────────
const APLICA = [{ value: 'cierre_apertura', label: 'Cierre y apertura' }, { value: 'semanal', label: 'Semanal' }, { value: 'ambos', label: 'Ambos' }]
export function TomasFijas({ puedeEditar }) {
  const qc = useQueryClient()
  const { sedes } = useApp()
  const [sucursal, setSucursal] = useState(sedes[0]?.id ?? '')
  const [edit, setEdit] = useState(null)
  const q = useDatos(['ctl-tomas', sucursal], () => (sucursal ? listar('ctl_toma_fija', { filtros: { sucursal_id: sucursal }, orden: [{ columna: 'orden', asc: true }], limite: 100 }) : Promise.resolve({ data: [] })))
  async function guardar() {
    const r = await guardarToma({ id: edit.id ?? null, sucursalId: sucursal, nombre: edit.nombre, aplica: edit.aplica, activa: edit.activa, orden: Number(edit.orden || 100) })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Toma fija guardada'); setEdit(null); qc.invalidateQueries({ queryKey: ['ctl-tomas'] })
  }
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Posiciones de cámara por sucursal (se recomienda arrancar con una o dos: mostrador y escritorio). Quien captura ve la foto anterior como fantasma para alinear el encuadre; el servidor empareja el cierre de ayer con la apertura de hoy.</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 8 }}>
        <FormField label="Sucursal" as="select" value={sucursal} onChange={e => setSucursal(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        {puedeEditar && <button className="btn sm" style={{ marginBottom: 8 }} onClick={() => setEdit({ nombre: '', aplica: 'ambos', activa: true, orden: 100 })}><Plus size={13} style={{ verticalAlign: -2 }} /> Nueva toma</button>}
      </div>
      <EstadoConsulta q={q} />
      <div className="tabla-wrap"><table className="tabla">
        <thead><tr><th>Toma</th><th>Aplica a</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {(q.data?.data ?? []).map(t => (
            <tr key={t.id}><td>{t.nombre}</td><td>{APLICA.find(a => a.value === t.aplica)?.label}</td><td><StatusBadge variante={t.activa ? 'v' : 'n'} label={t.activa ? 'Activa' : 'Inactiva'} /></td>
              <td>{puedeEditar && <button className="btn o sm" onClick={() => setEdit({ ...t })}><Pencil size={13} /></button>}</td></tr>))}
          {!q.data?.data?.length && <tr><td colSpan={4} className="hint">Sin tomas fijas en esta sucursal.</td></tr>}
        </tbody>
      </table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar toma fija' : 'Nueva toma fija'} size="sm"
        footer={<><button className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" disabled={!edit?.nombre?.trim()} onClick={guardar}>Guardar</button></>}>
        {edit && <>
          <FormField label="Nombre" value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} />
          <FormField label="Aplica a" as="select" value={edit.aplica} options={APLICA} onChange={e => setEdit({ ...edit, aplica: e.target.value })} />
          <FormField label="Orden" type="number" value={edit.orden} onChange={e => setEdit({ ...edit, orden: e.target.value })} />
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!edit.activa} onChange={e => setEdit({ ...edit, activa: e.target.checked })} /> Activa</label>
        </>}
      </Modal>
    </>
  )
}

// ───────────────────────────── consumo esperado de insumos por servicio ─────────────────────────────
export function ConsumoEsperado({ puedeEditar }) {
  const qc = useQueryClient()
  const [edit, setEdit] = useState(null)
  const q = useDatos(['ctl-consumo'], () => listar('ctl_consumo_esperado', { limite: 500 }))
  const servicios = useDatos(['ctl-servicios'], () => leer('servicios', { sedeCol: false, columnas: 'id,nombre', orden: [{ columna: 'nombre', asc: true }], limite: 500 }))
  const productos = useDatos(['ctl-productos-insumo'], () => leer('ctl_producto_captura', { sedeCol: false, orden: [{ columna: 'descripcion', asc: true }], limite: 3000 }))
  const nomS = useMemo(() => Object.fromEntries((servicios.data?.data ?? []).map(s => [s.id, s.nombre])), [servicios.data])
  const nomP = useMemo(() => Object.fromEntries((productos.data?.data ?? []).map(p => [p.id, p.descripcion])), [productos.data])
  async function guardar(f = edit) {
    const r = await guardarConsumo({ servicioId: f.servicio_id, insumoId: f.insumo_producto_id, cantidad: Number(f.cantidad), activo: f.activo })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Consumo esperado guardado'); setEdit(null); qc.invalidateQueries({ queryKey: ['ctl-consumo'] })
  }
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Cuántas piezas del insumo (el kit) consume cada servicio. Es la base del cuadre de kits al cerrar: <b>12 kits usados y 10 servicios cobrados son dos servicios sin cobro</b>. Si un insumo no tiene consumo definido, cada servicio cobrado cuenta como los «kits por servicio» del punto de control.</div>
      {puedeEditar && <button className="btn sm" style={{ marginBottom: 8 }} onClick={() => setEdit({ servicio_id: '', insumo_producto_id: '', cantidad: 1, activo: true })}><Plus size={13} style={{ verticalAlign: -2 }} /> Nuevo consumo</button>}
      <EstadoConsulta q={q} />
      <div className="tabla-wrap"><table className="tabla">
        <thead><tr><th>Servicio</th><th>Insumo</th><th style={{ textAlign: 'right' }}>Cantidad</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {(q.data?.data ?? []).map(c => (
            <tr key={c.id}><td>{nomS[c.servicio_id] ?? c.servicio_id}</td><td>{nomP[c.insumo_producto_id] ?? c.insumo_producto_id}</td><td style={{ textAlign: 'right' }}>{Number(c.cantidad)}</td>
              <td><StatusBadge variante={c.activo ? 'v' : 'n'} label={c.activo ? 'Activo' : 'Inactivo'} /></td>
              <td>{puedeEditar && <><button className="btn o sm" onClick={() => setEdit({ ...c })}><Pencil size={13} /></button>{c.activo && <button className="btn o sm" style={{ marginLeft: 4 }} onClick={() => guardar({ ...c, activo: false })}>Quitar</button>}</>}</td></tr>))}
          {!q.data?.data?.length && <tr><td colSpan={5} className="hint">Sin consumos definidos.</td></tr>}
        </tbody>
      </table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Consumo esperado" size="sm"
        footer={<><button className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" disabled={!edit?.servicio_id || !edit?.insumo_producto_id || !(Number(edit?.cantidad) > 0)} onClick={() => guardar()}>Guardar</button></>}>
        {edit && <>
          <FormField label="Servicio" as="select" value={edit.servicio_id} disabled={!!edit.id} options={(servicios.data?.data ?? []).map(s => ({ value: s.id, label: s.nombre }))} onChange={e => setEdit({ ...edit, servicio_id: e.target.value })} />
          <FormField label="Insumo" as="select" value={edit.insumo_producto_id} disabled={!!edit.id} options={(productos.data?.data ?? []).map(p => ({ value: p.id, label: p.descripcion }))} onChange={e => setEdit({ ...edit, insumo_producto_id: e.target.value })} />
          <FormField label="Cantidad por servicio" type="number" min="0.001" step="0.001" value={edit.cantidad} onChange={e => setEdit({ ...edit, cantidad: e.target.value })} />
        </>}
      </Modal>
    </>
  )
}
