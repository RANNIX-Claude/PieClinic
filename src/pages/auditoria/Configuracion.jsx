// Configuración de auditoría (dueño y soporte RANNIX). Parámetros por sucursal con valor global por omisión y TOPES DUROS (los hace cumplir la base),
// catálogo de causas, puntos de control del checklist (cada cambio crea una versión nueva), productos en custodia (tope de 30 por sucursal),
// historial de cambios con consulta por fecha y bitácora de consultas. Toda escritura es por RPC (la app no tiene INSERT/UPDATE/DELETE en ctl_*).
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, RotateCcw, Save, Pencil, Trash2, ShieldAlert, History } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso, esSuperadmin } from '../../lib/permisos'
import { leer } from '../../lib/api'
import {
  configEfectiva, guardarParametro, restablecerParametro, valorEn, guardarCausa, activarCustodia, desactivarCustodia, listar,
} from '../../lib/auditoria/api'
import { validarParametro, puedeAgregarCustodia, TOPE_CUSTODIA } from '../../lib/auditoria/config'
import { rolAuditoria, ROL_AUDITORIA_NOMBRE } from '../../lib/auditoria/roles'
import { fechaHora } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import StatusBadge from '../../components/ui/StatusBadge'
import { useDatos, EstadoConsulta, errMsg } from './comun'
import { Puntos as PuntosControl, TomasFijas, ConsumoEsperado } from './cierres/PuntosControl'
import CatalogoControl from './custodia/CatalogoControl'
import MotivosCaja from './MotivosCaja'

export default function Configuracion() {
  const { rol, sedes } = useApp()
  const puedeEditar = usePermiso('auditoria.configurar')
  const [tab, setTab] = useState('parametros')
  const miRol = ROL_AUDITORIA_NOMBRE[rolAuditoria(rol, esSuperadmin())] ?? ''
  const nombreSede = useMemo(() => Object.fromEntries(sedes.map(s => [s.id, s.nombre])), [sedes])
  return (
    <div className="pagina">
      <PageHeader titulo="Configuración de auditoría"
        subtitulo={`Parámetros, topes y catálogos del módulo de Control y Auditoría · tu rol aquí: ${miRol}`} />
      {!puedeEditar && <div className="card" style={{ marginBottom: 10, fontSize: 13 }}>Tu rol puede consultar esta configuración pero no cambiarla.</div>}
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'parametros', label: 'Parámetros' }, { id: 'causas', label: 'Causas' }, { id: 'motivos', label: 'Motivos de caja' }, { id: 'puntos', label: 'Puntos de control' }, { id: 'tomas', label: 'Tomas fijas' }, { id: 'consumo', label: 'Consumo de insumos' },
        { id: 'custodia', label: 'Custodia' }, { id: 'catalogo', label: 'Catálogo de control' }, { id: 'historial', label: 'Historial de cambios' }, { id: 'consultas', label: 'Consultas a reportes' },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'parametros' && <Parametros sedes={sedes} puedeEditar={puedeEditar} />}
        {tab === 'causas' && <Causas puedeEditar={puedeEditar} />}
        {tab === 'motivos' && <MotivosCaja puedeEditar={puedeEditar} />}
        {tab === 'puntos' && <PuntosControl puedeEditar={puedeEditar} />}
        {tab === 'tomas' && <TomasFijas puedeEditar={puedeEditar} />}
        {tab === 'consumo' && <ConsumoEsperado puedeEditar={puedeEditar} />}
        {tab === 'custodia' && <Custodia sedes={sedes} puedeEditar={puedeEditar} />}
        {tab === 'catalogo' && <CatalogoControl puedeEditar={puedeEditar} />}
        {tab === 'historial' && <Historial sedes={sedes} nombreSede={nombreSede} />}
        {tab === 'consultas' && <Consultas />}
      </div>
    </div>
  )
}

const mostrarValor = (v, unidad) => (v == null ? '—' : typeof v === 'string' ? v.replace(/_/g, ' ') : `${v}${unidad ? ' ' + unidad : ''}`)

// ───────────────────────────── Parámetros ─────────────────────────────
function Parametros({ sedes, puedeEditar }) {
  const qc = useQueryClient()
  const { rol } = useApp()
  const [sucursal, setSucursal] = useState('')            // '' = valor global de la organización
  const [ediciones, setEdiciones] = useState({})
  const [confirma, setConfirma] = useState({})
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const esDueno = rol === 'administrador' && !esSuperadmin()
  const q = useDatos(['ctl-config', sucursal], () => configEfectiva(sucursal || null))
  const filas = q.data?.data ?? []

  async function guardar(f) {
    const nuevo = ediciones[f.clave] ?? f.valor
    const def = { tipo: f.tipo, minimo: f.minimo == null ? null : Number(f.minimo), tope: f.tope == null ? null : Number(f.tope), opciones: f.opciones, confirma_dueno: f.confirma_dueno }
    const v = validarParametro(f.clave, f.tipo === 'num' ? nuevo : String(nuevo), def)
    if (!v.ok) return toast.error(v.error, { duration: 7000 })
    if (v.requiereConfirmacion && !(esDueno && confirma[f.clave])) {
      return toast.error(esDueno ? 'Marca «Confirmo como dueño» para aceptar una tolerancia mayor a 0.' : 'Solo el dueño puede confirmar una tolerancia mayor a 0.', { duration: 7000 })
    }
    setOcupado(f.clave)
    const r = await guardarParametro({ clave: f.clave, sucursalId: sucursal || null, valor: f.tipo === 'num' ? Number(nuevo) : String(nuevo), confirmoDueno: !!confirma[f.clave], motivo: motivo || null })
    setOcupado(null)
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    toast.success('Parámetro guardado y registrado en el historial')
    setEdiciones(e => { const c = { ...e }; delete c[f.clave]; return c })
    qc.invalidateQueries({ queryKey: ['ctl-config'] }); qc.invalidateQueries({ queryKey: ['ctl-historial'] })
  }
  async function restablecer(f) {
    setOcupado(f.clave)
    const r = await restablecerParametro({ clave: f.clave, sucursalId: sucursal, motivo: motivo || null })
    setOcupado(null)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Vuelve a regir el valor global')
    qc.invalidateQueries({ queryKey: ['ctl-config'] }); qc.invalidateQueries({ queryKey: ['ctl-historial'] })
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <FormField label="Aplicar a" as="select" value={sucursal} onChange={e => { setSucursal(e.target.value); setEdiciones({}) }}
          options={[{ value: '', label: 'Todas las sucursales (valor global)' }, ...sedes.map(s => ({ value: s.id, label: s.nombre }))]} placeholder="Todas las sucursales (valor global)" />
        <FormField label="Motivo del cambio (opcional, queda en el historial)" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ minWidth: 280 }} />
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>Cada parámetro tiene un valor global por omisión y puede cambiarse por sucursal. Los <b>topes</b> son del sistema: la base de datos los rechaza aunque se intente saltar la pantalla.</div>
      <EstadoConsulta q={q} />
      {filas.length > 0 && (
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Parámetro</th><th>Valor</th><th>Origen</th><th>Tope del sistema</th><th></th></tr></thead>
          <tbody>
            {filas.map(f => {
              const editado = ediciones[f.clave]
              const valor = editado ?? f.valor
              const cambiado = editado !== undefined && String(editado) !== String(f.valor)
              const requiereConf = f.confirma_dueno && Number(valor) > 0
              return (
                <tr key={f.clave}>
                  <td><b>{f.descripcion}</b>{f.explicacion_tope && <div className="hint" style={{ maxWidth: 420 }}>{f.explicacion_tope}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {f.tipo === 'texto'
                      ? <select disabled={!puedeEditar} value={valor} onChange={e => setEdiciones(x => ({ ...x, [f.clave]: e.target.value }))}>{(f.opciones ?? []).map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</select>
                      : <input type="number" inputMode="decimal" disabled={!puedeEditar} style={{ width: 96 }} value={valor} min={f.minimo ?? undefined} max={f.tope ?? undefined}
                          onChange={e => setEdiciones(x => ({ ...x, [f.clave]: e.target.value }))} />}
                    {f.unidad && <span className="hint" style={{ marginLeft: 6 }}>{f.unidad}</span>}
                    {requiereConf && esDueno && puedeEditar && (
                      <label style={{ display: 'block', fontSize: 12, marginTop: 4 }}><input type="checkbox" checked={!!confirma[f.clave]} onChange={e => setConfirma(c => ({ ...c, [f.clave]: e.target.checked }))} /> Confirmo como dueño</label>
                    )}
                  </td>
                  <td><StatusBadge variante={f.origen === 'sucursal' ? 'b' : f.origen === 'global' ? 'v' : 'n'} label={f.origen === 'sucursal' ? 'De la sucursal' : f.origen === 'global' ? 'Global' : 'Omisión'} />
                    <div className="hint">Omisión: {mostrarValor(f.omision, f.unidad)}</div></td>
                  <td>{f.tope != null ? <b>{f.tope} {f.unidad}</b> : <span className="hint">—</span>}{f.minimo != null && <div className="hint">mínimo {f.minimo}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {puedeEditar && <>
                      <button className="btn sm" disabled={!cambiado || ocupado === f.clave} onClick={() => guardar(f)}><Save size={13} style={{ verticalAlign: -2 }} /> Guardar</button>{' '}
                      {sucursal && f.origen === 'sucursal' && <button className="btn o sm" disabled={ocupado === f.clave} onClick={() => restablecer(f)} title="Volver al valor global"><RotateCcw size={13} style={{ verticalAlign: -2 }} /></button>}
                    </>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}
    </>
  )
}

// ───────────────────────────── Causas ─────────────────────────────
function Causas({ puedeEditar }) {
  const qc = useQueryClient()
  const q = useDatos(['ctl-causas'], () => listar('ctl_causa', { orden: [{ columna: 'orden', asc: true }], limite: 200 }))
  const [nueva, setNueva] = useState('')
  const [requiere, setRequiere] = useState(false)
  async function guardar(c, cambios) {
    const r = await guardarCausa({ id: c.id, nombre: c.nombre, requiereNota: c.requiere_nota, activo: c.activo, ...cambios })
    if (r.error) return toast.error(errMsg(r.error))
    qc.invalidateQueries({ queryKey: ['ctl-causas'] })
  }
  async function agregar() {
    const r = await guardarCausa({ nombre: nueva, requiereNota: requiere })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Causa agregada'); setNueva(''); setRequiere(false); qc.invalidateQueries({ queryKey: ['ctl-causas'] })
  }
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Catálogo cerrado: al cerrar un caso se elige una de estas causas. Con texto libre nunca se sabría si el problema de la cadena es robo o captura.</div>
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && (
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Causa</th><th>Pide nota</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {q.data.data.map(c => (
              <tr key={c.id}>
                <td>{c.nombre}</td><td>{c.requiere_nota ? 'Sí' : 'No'}</td>
                <td><StatusBadge variante={c.activo ? 'v' : 'n'} label={c.activo ? 'Activa' : 'Inactiva'} /></td>
                <td>{puedeEditar && <>
                  <button className="btn o sm" onClick={() => guardar(c, { requiereNota: !c.requiere_nota })}>{c.requiere_nota ? 'Quitar nota' : 'Pedir nota'}</button>{' '}
                  <button className="btn o sm" onClick={() => guardar(c, { activo: !c.activo })}>{c.activo ? 'Desactivar' : 'Activar'}</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {puedeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          <FormField label="Nueva causa" value={nueva} onChange={e => setNueva(e.target.value)} />
          <label style={{ fontSize: 13, paddingBottom: 8 }}><input type="checkbox" checked={requiere} onChange={e => setRequiere(e.target.checked)} /> Pide nota al cerrar</label>
          <button className="btn" disabled={!nueva.trim()} onClick={agregar}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button>
        </div>
      )}
    </>
  )
}

// ───────────────────────────── Custodia ─────────────────────────────
function Custodia({ sedes, puedeEditar }) {
  const qc = useQueryClient()
  const [sucursal, setSucursal] = useState(sedes[0]?.id ?? '')
  const [producto, setProducto] = useState('')
  const productos = useDatos(['ctl-productos'], () => leer('ctl_producto_captura', { sedeCol: false, orden: [{ columna: 'descripcion', asc: true }], limite: 2000 }))
  const q = useDatos(['ctl-custodia', sucursal], () => (sucursal ? listar('ctl_producto_custodia', { filtros: { sucursal_id: sucursal, activo: true }, limite: 200 }) : Promise.resolve({ data: [] })))
  const nombres = useMemo(() => Object.fromEntries((productos.data?.data ?? []).map(p => [p.id, p])), [productos.data])
  const activos = q.data?.data ?? []
  const tope = puedeAgregarCustodia(activos.length)
  const disponibles = (productos.data?.data ?? []).filter(p => !activos.some(a => a.producto_id === p.id))
  async function agregar() {
    const r = await activarCustodia(sucursal, producto)
    if (r.error) return toast.error(errMsg(r.error), { duration: 12000 })     // trae la explicación del tope de la base
    toast.success('Producto en custodia'); setProducto(''); qc.invalidateQueries({ queryKey: ['ctl-custodia'] })
  }
  async function quitar(a) {
    const r = await desactivarCustodia(sucursal, a.producto_id)
    if (r.error) return toast.error(errMsg(r.error))
    qc.invalidateQueries({ queryKey: ['ctl-custodia'] })
  }
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Lo que se cuenta en cada relevo de turno. <b>Tope duro: {TOPE_CUSTODIA} productos activos por sucursal</b> (lo valida la base de datos). Con más, el relevo pasa de dos minutos a veinte, se captura sin contar y se genera evidencia falsa.</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <FormField label="Sucursal" as="select" value={sucursal} onChange={e => setSucursal(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <div style={{ paddingBottom: 8, fontWeight: 700 }}>{activos.length} de {TOPE_CUSTODIA} lugares usados</div>
      </div>
      {puedeEditar && sucursal && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
          <FormField label="Agregar producto" as="select" value={producto} onChange={e => setProducto(e.target.value)} disabled={!tope.ok}
            options={disponibles.map(p => ({ value: p.id, label: `${p.descripcion}${p.codigo_barras ? ' · ' + p.codigo_barras : ''}` }))} />
          <button className="btn" disabled={!producto || !tope.ok} onClick={agregar}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button>
        </div>
      )}
      {!tope.ok && <div className="card" style={{ marginBottom: 10, color: 'var(--red)', fontSize: 13 }}><ShieldAlert size={14} style={{ verticalAlign: -2 }} /> {tope.error}</div>}
      <EstadoConsulta q={q} />
      <div className="tabla-wrap"><table className="tabla">
        <thead><tr><th>Producto</th><th>Código</th><th></th></tr></thead>
        <tbody>
          {activos.map(a => (
            <tr key={a.id}><td>{nombres[a.producto_id]?.descripcion ?? a.producto_id}</td><td>{nombres[a.producto_id]?.codigo_barras ?? '—'}</td>
              <td>{puedeEditar && <button className="btn o sm" onClick={() => quitar(a)} title="Quitar de la custodia"><Trash2 size={13} /></button>}</td></tr>
          ))}
          {!activos.length && <tr><td colSpan={3} className="hint">Sin productos en custodia en esta sucursal.</td></tr>}
        </tbody>
      </table></div>
    </>
  )
}

// ───────────────────────────── Historial y consulta por fecha ─────────────────────────────
function Historial({ sedes, nombreSede }) {
  const q = useDatos(['ctl-historial'], () => listar('ctl_config_bitacora', { orden: [{ columna: 'creado_en', asc: false }], limite: 500 }))
  const usuarios = useDatos(['ctl-usuarios'], () => leer('v_ctl_usuarios', { sedeCol: false, limite: 500 }))
  const quien = useMemo(() => Object.fromEntries((usuarios.data?.data ?? []).map(u => [u.id, u.nombre])), [usuarios.data])
  const [clave, setClave] = useState('muestra_aleatoria')
  const [sucursal, setSucursal] = useState('')
  const [dia, setDia] = useState(new Date().toLocaleDateString('en-CA'))
  const [res, setRes] = useState(null)
  async function consultar() {
    const r = await valorEn({ clave, sucursalId: sucursal || null, fecha: new Date(`${dia}T23:59:59`).toISOString() })
    setRes(r.error ? { error: errMsg(r.error) } : { valor: r.data })
  }
  const defs = useDatos(['ctl-config', ''], () => configEfectiva(null))
  const columnas = [
    { key: 'creado_en', label: 'Cuándo', render: f => fechaHora(f.creado_en) },
    { key: 'creado_por', label: 'Quién', valor: f => quien[f.creado_por] ?? '—' },
    { key: 'clave', label: 'Parámetro', filtro: true },
    { key: 'sucursal_id', label: 'Sucursal', valor: f => (f.sucursal_id ? nombreSede[f.sucursal_id] ?? f.sucursal_id : 'Global'), filtro: true },
    { key: 'valor_anterior', label: 'Antes', valor: f => (f.valor_anterior == null ? '—' : String(f.valor_anterior)) },
    { key: 'valor_nuevo', label: 'Después', valor: f => (f.valor_nuevo == null ? 'Se restableció' : String(f.valor_nuevo)) },
    { key: 'motivo', label: 'Motivo' },
  ]
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <h4 style={{ marginTop: 0 }}><History size={14} style={{ verticalAlign: -2 }} /> ¿Con qué configuración se trabajó en una fecha?</h4>
        <div className="hint" style={{ marginBottom: 8 }}>Un cierre de agosto se consulta con la configuración vigente en agosto, no con la de hoy.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FormField label="Parámetro" as="select" value={clave} onChange={e => setClave(e.target.value)} options={(defs.data?.data ?? []).map(d => ({ value: d.clave, label: d.descripcion }))} />
          <FormField label="Sucursal" as="select" value={sucursal} onChange={e => setSucursal(e.target.value)} placeholder="Global" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
          <FormField label="Al final del día" type="date" value={dia} onChange={e => setDia(e.target.value)} />
          <button className="btn" onClick={consultar}>Consultar</button>
          {res && <div style={{ paddingBottom: 8, fontWeight: 700 }}>{res.error ?? `Valor entonces: ${mostrarValor(res.valor)}`}</div>}
        </div>
      </div>
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && <DataTable columnas={columnas} filas={q.data.data} exportarNombre="historial_config_auditoria" vacio={{ title: 'Sin cambios', description: 'Aún no se ha cambiado ningún parámetro: rigen los valores por omisión.' }} />}
    </>
  )
}

// ───────────────────────────── Consultas a reportes ─────────────────────────────
function Consultas() {
  const q = useDatos(['ctl-consultas'], () => listar('ctl_bitacora_consulta', { orden: [{ columna: 'creado_en', asc: false }], limite: 500 }))
  const usuarios = useDatos(['ctl-usuarios'], () => leer('v_ctl_usuarios', { sedeCol: false, limite: 500 }))
  const quien = useMemo(() => Object.fromEntries((usuarios.data?.data ?? []).map(u => [u.id, u.nombre])), [usuarios.data])
  const columnas = [
    { key: 'creado_en', label: 'Cuándo', render: f => fechaHora(f.creado_en) },
    { key: 'usuario_id', label: 'Quién consultó', valor: f => quien[f.usuario_id] ?? '—', filtro: true },
    { key: 'rol_ctl', label: 'Rol', filtro: true }, { key: 'reporte', label: 'Reporte', filtro: true },
    { key: 'filtros', label: 'Filtros', valor: f => JSON.stringify(f.filtros ?? {}) },
  ]
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Quién consultó los reportes de diferencias (incluye las lecturas del soporte de RANNIX). Es de solo lectura: nadie la edita.</div>
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && <DataTable columnas={columnas} filas={q.data.data} exportarNombre="consultas_auditoria" vacio={{ title: 'Sin consultas', description: 'Aún nadie ha consultado un reporte de diferencias.' }} />}
    </>
  )
}
