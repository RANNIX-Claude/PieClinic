// Fondo revolvente (mockup 37; clon de IRP FondoRevolvente.jsx): caja chica por sede con cierres semanales sábado→viernes.
// Lee prp_fondo_semana, prp_gastos, prp_gasto_por_rubro_semana, prp_fondo_revolvente_cierres; RPC fondo_cerrar_semana / fondo_reponer.
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Lock, RefreshCw, Settings } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { insertar, actualizar, rpc } from '../../lib/api'
import { moneda, fecha, porcentaje } from '../../lib/formato'
import { semanaCorte, sumarDias, etiquetaRango } from '../../lib/finanzas/semana.js'
import { parametrosFinanzas, TOLERANCIA_CORTE_CAJA } from '../../lib/finanzas/constantes.js'
import { usoFondo, diferenciaCierreFondo, desglosarIVA } from '../../lib/finanzas/gastos.js'
import { exportarExcel } from '../../lib/finanzas/exportar.js'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import FormField from '../../components/ui/FormField'
import EmptyState from '../../components/ui/EmptyState'
import { useVista, mensajeError, VistaNoDisponible, hoy, usePerfilesMapa } from './componentes/comunes.jsx'
import SubirComprobante, { verComprobante } from './componentes/SubirComprobante.jsx'

export default function FondoRevolvente() {
  const { sedes, organizacion, rol, sedeActivaId } = useApp()
  const qc = useQueryClient()
  const esAdmin = rol === 'administrador'
  const puedeOperar = usePermiso('fondo.operar')
  const params = parametrosFinanzas(organizacion)
  const dow = params.semana_inicio_dow
  const hoyIso = hoy()
  const semanaVigente = semanaCorte(hoyIso, dow)
  const [fondoId, setFondoId] = useState('')
  const [semIni, setSemIni] = useState(semanaVigente.inicio)
  const [tab, setTab] = useState('semana')
  const [gastoModal, setGastoModal] = useState(false)
  const [cierreModal, setCierreModal] = useState(false)
  const [reponer, setReponer] = useState(null)
  const [config, setConfig] = useState(null)
  const { mapa: perfiles, perfiles: listaPerfiles } = usePerfilesMapa()
  const invalidar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  const fondos = useVista('fondo-sem', 'prp_fondo_semana', { orden: [{ columna: 'sede_nombre' }], limite: 100 })
  useEffect(() => { if (!fondoId && fondos.filas.length) setFondoId(fondos.filas.find(f => f.sede_id === sedeActivaId)?.fondo_id ?? fondos.filas[0].fondo_id) }, [fondos.filas, fondoId, sedeActivaId])
  const fondo = fondos.filas.find(f => f.fondo_id === fondoId)
  const semFin = sumarDias(semIni, 6)
  const sem = semanaCorte(semIni, dow)
  const esVigente = semIni === semanaVigente.inicio

  const gastos = useVista('fondo-gastos', 'prp_gastos', { filtros: { fondo_id: fondoId || '00000000-0000-0000-0000-000000000000', fecha: { gte: semIni, lte: semFin }, estado: 'guardado' }, orden: [{ columna: 'fecha', asc: false }], limite: 500 }, { enabled: !!fondoId })
  const rubros = useVista('fondo-rubros', 'prp_gasto_por_rubro_semana', { sedeCol: false, filtros: { fondo_id: fondoId || '00000000-0000-0000-0000-000000000000', semana_inicio: semIni }, orden: [{ columna: 'total', asc: false }], limite: 100 }, { enabled: !!fondoId })
  const cierres = useVista('fondo-cierres', 'prp_fondo_revolvente_cierres', { filtros: { fondo_id: fondoId || '00000000-0000-0000-0000-000000000000' }, orden: [{ columna: 'semana_inicio', asc: false }], limite: 60 }, { enabled: !!fondoId })
  const cierreSemana = cierres.filas.find(c => c.semana_inicio === semIni)
  const semanas = useMemo(() => Array.from({ length: 12 }, (_, i) => semanaCorte(sumarDias(semanaVigente.inicio, -7 * i), dow)), [semanaVigente.inicio, dow])

  const gastado = gastos.filas.reduce((s, g) => s + Number(g.total), 0)
  const uso = fondo ? usoFondo(Number(fondo.monto_base), gastado, Number(fondo.alerta_pct)) : null
  const pendienteReponer = cierres.filas.filter(c => c.estado === 'cerrado')

  const cols = [
    { key: 'fecha', label: 'Fecha', render: g => fecha(g.fecha), valor: g => g.fecha },
    { key: 'prov', label: 'Proveedor', valor: g => g.proveedor_nombre ?? '—' },
    { key: 'grupo', label: 'Rubro', valor: g => g.grupo_nombre, filtro: true },
    { key: 'desc', label: 'Descripción', valor: g => g.descripcion ?? '' },
    { key: 'fact', label: 'Factura', valor: g => (g.comprobante_ok ? 'Factura' : 'Sin factura'), render: g => (g.comprobante_ok ? <span className="bd v">✓ Factura</span> : <span className="bd n">Sin factura</span>) },
    { key: 'ticket', label: 'Ticket', sortable: false, exportar: false, render: g => g.ticket_url ? <button type="button" className="btn o sm" onClick={() => verComprobante(g.ticket_url)}>Ver</button> : '—' },
    { key: 'total', label: 'Importe', align: 'right', render: g => <b className="num">{moneda(g.total)}</b>, valor: g => Number(g.total) },
  ]
  async function exportar() {
    await exportarExcel(`fondo_${fondo?.sede_nombre ?? ''}_${semIni}`, [{ nombre: 'Gastos del fondo', columnas: [
      { label: 'Fecha', key: 'fecha' }, { label: 'Proveedor', key: 'prov' }, { label: 'Rubro', key: 'grupo' }, { label: 'Descripción', key: 'desc' }, { label: 'Factura', key: 'fact' }, { label: 'Importe', key: 'total', formato: 'moneda' }],
      filas: gastos.filas.map(g => ({ fecha: g.fecha, prov: g.proveedor_nombre ?? '', grupo: g.grupo_nombre, desc: g.descripcion ?? '', fact: g.comprobante_ok ? 'Sí' : 'No', total: Number(g.total) })) }],
    { entidad: 'fondo_revolvente', detalle: { semana: semIni, fondo: fondoId }, sedeId: fondo?.sede_id })
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Fondo revolvente" subtitulo={fondo ? `Caja chica de ${fondo.sede_nombre} · semana del ${etiquetaRango(semIni, semFin)} (${sem.etiqueta})` : 'Caja chica por sede'}
        acciones={<>
          {puedeOperar && fondo && <button type="button" className="btn" onClick={() => setGastoModal(true)} disabled={!!cierreSemana}><Plus size={14} style={{ verticalAlign: -3 }} /> Registrar gasto</button>}
          {esAdmin && fondo && <button type="button" className="btn o" onClick={() => { const p = pendienteReponer[0]; p ? setReponer(p) : toast('No hay cierres por reponer. Cierra una semana primero.') }}><RefreshCw size={14} style={{ verticalAlign: -3 }} /> Reponer fondo{pendienteReponer.length ? ` (${pendienteReponer.length})` : ''}</button>}
          <button type="button" className="btn o" onClick={exportar} disabled={!gastos.filas.length}>Exportar</button>
        </>} />
      {fondos.noDisponible ? <VistaNoDisponible nombre="prp_fondo_semana" /> : fondos.cargando ? <EmptyState title="Cargando…" description="" compacto /> : fondos.error ? <EmptyState title="No se pudo cargar" description={fondos.error.message} /> : !fondos.filas.length ? (
        <div className="card"><EmptyState title="Sin fondo revolvente" description="Ninguna sede tiene fondo activo. Administración puede crear uno por sede." action={esAdmin ? <ConfigBoton sedes={sedes} onAbrir={() => setConfig({})} /> : null} /></div>
      ) : <>
        <div className="toolbar">
          <select value={fondoId} onChange={e => setFondoId(e.target.value)} aria-label="Sede del fondo">{fondos.filas.map(f => <option key={f.fondo_id} value={f.fondo_id}>Sede: {f.sede_nombre}</option>)}</select>
          <select value={semIni} onChange={e => setSemIni(e.target.value)} aria-label="Semana">{semanas.map(s => <option key={s.inicio} value={s.inicio}>Semana {s.etiqueta} · {etiquetaRango(s.inicio, s.fin)}</option>)}</select>
          {esAdmin && fondo && <button type="button" className="btn o sm" onClick={() => setConfig(fondo)}><Settings size={12} style={{ verticalAlign: -2 }} /> Configurar fondo</button>}
          {esAdmin && <button type="button" className="btn o sm" onClick={() => setConfig({})}>Nuevo fondo</button>}
        </div>
        {fondo && uso && (
          <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${uso.agotado ? 'var(--red)' : uso.alerta ? 'var(--gold)' : 'var(--green)'}` }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div><span style={{ fontSize: 11, color: 'var(--muted)' }}>Fondo base</span><div style={{ fontSize: 20, fontWeight: 800 }}>{moneda(fondo.monto_base)}</div></div>
              <div><span style={{ fontSize: 11, color: 'var(--muted)' }}>Gastado ({sem.etiqueta})</span><div style={{ fontSize: 20, fontWeight: 800 }}>{moneda(gastado)}</div></div>
              <div><span style={{ fontSize: 11, color: 'var(--muted)' }}>Disponible</span><div style={{ fontSize: 20, fontWeight: 800, color: uso.disponible < 0 ? 'var(--red)' : 'var(--green)' }}>{moneda(uso.disponible)}</div></div>
              <div style={{ marginLeft: 'auto' }}>{cierreSemana ? <StatusBadge estado={cierreSemana.estado} label={cierreSemana.estado === 'repuesto' ? 'Cerrada y repuesta' : 'Cerrada · por reponer'} /> : <span className="bd b">{esVigente ? 'Semana en curso' : 'Sin cierre'}</span>}</div>
            </div>
            <div style={{ height: 10, background: 'var(--row-line, #eee)', borderRadius: 6, margin: '10px 0 4px', overflow: 'hidden' }} role="progressbar" aria-valuenow={uso.pct}>
              <div style={{ width: `${Math.min(100, uso.pct)}%`, height: '100%', background: uso.agotado ? 'var(--red)' : uso.alerta ? 'var(--gold)' : 'var(--green)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span><b>{porcentaje(uso.pct)}</b> usado{uso.alerta && <b style={{ color: uso.agotado ? 'var(--red)' : 'var(--gold)' }}> · {uso.agotado ? 'fondo agotado' : `alerta: supera el ${fondo.alerta_pct}%`}</b>}</span>
              <span>Responsable: {perfiles[fondo.responsable_id] ?? 'sin designar'}</span>
              <span>Última reposición: {fondo.ultima_reposicion_fecha ? `${fecha(fondo.ultima_reposicion_fecha)} ${moneda(fondo.ultima_reposicion_monto)}` : '—'}</span>
              {puedeOperar && !cierreSemana && !esVigente && <span style={{ color: 'var(--gold)' }}>Semana pasada sin cerrar</span>}
            </div>
            {puedeOperar && !cierreSemana && <div style={{ marginTop: 10 }}><button type="button" className="btn o sm" onClick={() => setCierreModal(true)}><Lock size={12} style={{ verticalAlign: -2 }} /> Cerrar semana</button></div>}
          </div>
        )}
        <Tabs value={tab} onChange={setTab} items={[{ id: 'semana', label: 'Gastos de la semana', badge: gastos.filas.length }, { id: 'rubro', label: 'Por rubro' }, { id: 'cierres', label: 'Cierres semanales', badge: cierres.filas.length }]} />
        <div style={{ marginTop: 12 }}>
          {tab === 'semana' && <DataTable columnas={cols} filas={gastos.filas} cargando={gastos.cargando} error={gastos.error} placeholderBusqueda="Buscar proveedor o rubro…" vacio={{ title: 'Sin gastos en la semana', description: 'No se han registrado gastos del fondo.' }} />}
          {tab === 'rubro' && (
            <div className="card">{rubros.cargando ? '…' : !rubros.filas.length ? <EmptyState compacto title="Sin gastos" description="Nada que agrupar en esta semana." /> : (
              <table><thead><tr><th>Rubro</th><th style={{ textAlign: 'right' }}>Gastos</th><th style={{ textAlign: 'right' }}>Importe</th><th style={{ textAlign: 'right' }}>% del gastado</th></tr></thead>
                <tbody>{rubros.filas.map(r => <tr key={r.grupo_clave}><td>{r.grupo_nombre}</td><td className="num" style={{ textAlign: 'right' }}>{r.num_gastos}</td><td className="num" style={{ textAlign: 'right' }}>{moneda(r.total)}</td><td className="num" style={{ textAlign: 'right' }}>{gastado ? porcentaje((Number(r.total) / gastado) * 100) : '—'}</td></tr>)}</tbody></table>)}</div>)}
          {tab === 'cierres' && <DataTable sinPaginacion columnas={[
            { key: 'semana', label: 'Semana', valor: c => `${c.semana} · ${etiquetaRango(c.semana_inicio, c.semana_fin)}` },
            { key: 'monto_base', label: 'Fondo base', align: 'right', render: c => moneda(c.monto_base), valor: c => Number(c.monto_base) },
            { key: 'gastado', label: 'Gastado', align: 'right', render: c => moneda(c.gastado), valor: c => Number(c.gastado) },
            { key: 'num', label: 'Gastos', align: 'right', valor: c => c.num_gastos },
            { key: 'disp', label: 'Disponible final', align: 'right', render: c => moneda(c.disponible_final), valor: c => Number(c.disponible_final) },
            { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} />, valor: c => c.estado, filtro: true },
            { key: 'rep', label: 'Reposición', valor: c => (c.estado === 'repuesto' ? `${moneda(c.reposicion_monto)} el ${fecha(c.repuesto_en)}` : '—') },
            { key: 'acc', label: '', sortable: false, exportar: false, render: c => (esAdmin && c.estado === 'cerrado' ? <button type="button" className="btn sm" onClick={() => setReponer(c)}>Reponer</button> : null) },
          ]} filas={cierres.filas} cargando={cierres.cargando} error={cierres.error} vacio={{ title: 'Sin cierres', description: 'Aún no se ha cerrado ninguna semana.' }} />}
        </div>
      </>}
      {gastoModal && fondo && <ModalGastoFondo fondo={fondo} semIni={semIni} semFin={semFin} params={params} onClose={() => setGastoModal(false)} onListo={invalidar} />}
      {cierreModal && fondo && <ModalCierre fondo={fondo} semIni={semIni} gastado={gastado} esAdmin={esAdmin} onClose={() => setCierreModal(false)} onListo={() => { setCierreModal(false); invalidar() }} />}
      {reponer && <ModalReponer cierre={reponer} onClose={() => setReponer(null)} onListo={() => { setReponer(null); invalidar() }} />}
      {config && <ModalConfig base={config} sedes={sedes} fondos={fondos.filas} perfiles={listaPerfiles} nombres={perfiles} onClose={() => setConfig(null)} onListo={() => { setConfig(null); invalidar() }} />}
    </div>
  )
}

function ConfigBoton({ onAbrir }) { return <button type="button" className="btn" onClick={onAbrir}>Crear fondo</button> }

function ModalGastoFondo({ fondo, semIni, semFin, params, onClose, onListo }) {
  const grupos = useVista('grupos-fondo', 'grupos_gasto', { sedeCol: false, filtros: { activo: true, permite_fondo: true }, orden: [{ columna: 'orden' }], limite: 100 })
  const provs = useVista('prov', 'prp_proveedores', { sedeCol: false, columnas: 'id,nombre,activo', filtros: { activo: true }, orden: [{ columna: 'nombre' }], limite: 3000 })
  const maxFecha = hoy() < semFin ? hoy() : semFin
  const [f, setF] = useState({ fecha: maxFecha, grupo_id: '', proveedor_id: '', proveedor_texto: '', total: '', descripcion: '', factura_url: null, ticket_url: null, cfdi_uuid: '', conIva: true })
  const [g, setG] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const total = Number(f.total) || 0
  const exige = total >= params.comprobante_gasto_desde
  const tiene = !!(f.factura_url || f.cfdi_uuid.trim())
  const errores = []
  if (!f.grupo_id) errores.push('Elige el rubro.')
  if (!f.proveedor_id && !f.proveedor_texto.trim()) errores.push('Indica el proveedor.')
  if (!(total > 0)) errores.push('El importe debe ser mayor a cero.')
  if (exige && !tiene) errores.push(`Desde ${moneda(params.comprobante_gasto_desde)} se exige factura (archivo o UUID).`)
  if (total > Number(fondo.disponible) + 0.001) errores.push(`El importe excede el disponible del fondo (${moneda(fondo.disponible)}); Administración debe reponerlo.`)
  async function guardar() {
    if (errores.length) return toast.error(errores[0])
    setG(true)
    const d = f.conIva ? desglosarIVA(total, params.iva_tasa_general) : { subtotal: total, iva: 0, total }
    const r = await insertar('gastos', {
      sede_id: fondo.sede_id, fecha: f.fecha, grupo_id: f.grupo_id, proveedor_id: f.proveedor_id || null,
      proveedor_texto: f.proveedor_id ? provs.filas.find(p => p.id === f.proveedor_id)?.nombre : f.proveedor_texto.trim(),
      metodo_pago: 'efectivo_fondo', fondo_id: fondo.fondo_id, subtotal: d.subtotal, iva: d.iva, total: d.total, descripcion: f.descripcion.trim() || null,
      tiene_factura: tiene, factura_url: f.factura_url, cfdi_uuid: f.cfdi_uuid.trim() || null, ticket_url: f.ticket_url, origen_captura: 'fondo', estado: 'guardado',
    })
    setG(false)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Gasto del fondo registrado.'); onListo(); onClose()
  }
  return (
    <Modal open onClose={onClose} cerrarAlClicFuera={false} title="Nuevo gasto del fondo"
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={g} onClick={guardar}>{g ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="grid2">
        <FormField label="Fecha" required type="date" value={f.fecha} min={semIni} max={maxFecha} onChange={e => set('fecha', e.target.value)} hint="Dentro de la semana abierta." />
        <FormField label="Rubro" required as="select" value={f.grupo_id} onChange={e => set('grupo_id', e.target.value)} options={grupos.filas.map(g2 => ({ value: g2.id, label: g2.nombre }))} hint="Las comisiones bancarias no se pagan con el fondo." />
        <FormField label="Proveedor" as="select" value={f.proveedor_id} onChange={e => set('proveedor_id', e.target.value)} placeholder="— Escribir otro —" options={provs.filas.map(p => ({ value: p.id, label: p.nombre }))} />
        {!f.proveedor_id && <FormField label="Proveedor (texto)" required value={f.proveedor_texto} onChange={e => set('proveedor_texto', e.target.value)} placeholder="Escribe o elige proveedor…" />}
        <FormField label="Importe" required type="number" min="0" step="0.01" value={f.total} onChange={e => set('total', e.target.value)} hint={`Disponible: ${moneda(fondo.disponible)}`} />
        <FormField label="Descripción" value={f.descripcion} onChange={e => set('descripcion', e.target.value)} />
        <FormField label="UUID del CFDI" value={f.cfdi_uuid} onChange={e => set('cfdi_uuid', e.target.value)} />
      </div>
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.conIva} onChange={e => set('conIva', e.target.checked)} /> El importe incluye IVA</label>
      <div style={{ display: 'flex', gap: 14, margin: '10px 0', flexWrap: 'wrap' }}>
        <span>Ticket: <SubirComprobante carpeta="gastos" valor={f.ticket_url} capture="environment" etiqueta="Foto del ticket" onSubida={({ ruta }) => set('ticket_url', ruta)} /></span>
        <span>Factura: <SubirComprobante carpeta="gastos" valor={f.factura_url} etiqueta="Adjuntar factura" onSubida={({ ruta }) => set('factura_url', ruta)} /></span>
      </div>
      {errores.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12 }}>{errores.map(e => <li key={e}>{e}</li>)}</ul>}
    </Modal>
  )
}

function ModalCierre({ fondo, semIni, gastado, esAdmin, onClose, onListo }) {
  const [contado, setContado] = useState('')
  const [nota, setNota] = useState('')
  const [g, setG] = useState(false)
  const dif = contado === '' ? null : diferenciaCierreFondo(Number(fondo.monto_base), gastado, Number(contado), TOLERANCIA_CORTE_CAJA)
  const bloqueado = dif?.requiereAdmin && !esAdmin
  async function cerrar() {
    if (bloqueado) return toast.error(`La diferencia supera ${moneda(TOLERANCIA_CORTE_CAJA)}: debe cerrar Administración.`)
    if (dif && dif.diferencia !== 0 && !nota.trim()) return toast.error('Explica la diferencia en la nota.')
    setG(true)
    const r = await rpc('fondo_cerrar_semana', { p_fondo: fondo.fondo_id, p_fecha: semIni })
    if (r.error) { setG(false); return toast.error(mensajeError(r.error)) }
    if (esAdmin && dif && dif.diferencia !== 0 && r.data) await actualizar('fondo_cierres', r.data, { nota: `Diferencia de efectivo ${moneda(dif.diferencia)} (contado ${moneda(contado)} vs esperado ${moneda(dif.esperado)}). ${nota.trim()}` })
    setG(false); toast.success('Semana cerrada: los gastos de esa semana ya no se modifican.'); onListo()
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Cerrar semana del fondo" cerrarAlClicFuera={false}
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={g || bloqueado} onClick={cerrar}>{g ? 'Cerrando…' : 'Cerrar semana'}</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Se cerrará la semana del {fecha(semIni)}. Gastado según sistema: <b>{moneda(gastado)}</b>; efectivo esperado en caja: <b>{moneda(Number(fondo.monto_base) - gastado)}</b>.</div>
      <FormField label="Efectivo contado en caja (opcional)" type="number" step="0.01" value={contado} onChange={e => setContado(e.target.value)} />
      {dif && <div style={{ fontSize: 13, margin: '6px 0', color: dif.diferencia === 0 ? 'var(--green)' : dif.requiereAdmin ? 'var(--red)' : 'var(--gold)' }}>Diferencia: <b>{moneda(dif.diferencia)}</b>{dif.requiereAdmin ? ` · mayor a ${moneda(TOLERANCIA_CORTE_CAJA)}: requiere Administrador` : dif.diferencia !== 0 ? ' · dentro de la tolerancia' : ''}</div>}
      {dif && dif.diferencia !== 0 && !bloqueado && <FormField label="Nota de la diferencia" required as="textarea" value={nota} onChange={e => setNota(e.target.value)} />}
      {bloqueado && <div style={{ color: 'var(--red)', fontSize: 12 }}>Pide a Administración que cierre esta semana.</div>}
    </Modal>
  )
}

function ModalReponer({ cierre, onClose, onListo }) {
  const [monto, setMonto] = useState(String(cierre.gastado))
  const [fechaR, setFechaR] = useState(hoy())
  const [g, setG] = useState(false)
  async function reponer() {
    if (!(Number(monto) >= 0)) return toast.error('Monto inválido.')
    setG(true)
    const r = await rpc('fondo_reponer', { p_cierre: cierre.id, p_monto: Number(monto), p_fecha: fechaR })
    setG(false)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Reposición autorizada.'); onListo()
  }
  return (
    <Modal open onClose={onClose} size="sm" title={`Reponer fondo · semana ${cierre.semana}`}
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={g} onClick={reponer}>Autorizar reposición</button></>}>
      <div style={{ fontSize: 13, marginBottom: 10 }}>Gastado en la semana: <b>{moneda(cierre.gastado)}</b> ({cierre.num_gastos} gastos). La reposición la autoriza Administración y queda en bitácora.</div>
      <FormField label="Monto repuesto" type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} />
      <FormField label="Fecha de reposición" type="date" value={fechaR} onChange={e => setFechaR(e.target.value)} />
    </Modal>
  )
}

function ModalConfig({ base, sedes, fondos, perfiles, nombres, onClose, onListo }) {
  const editando = !!base.fondo_id
  const usadas = new Set(fondos.map(f => f.sede_id))
  const [f, setF] = useState({ sede_id: base.sede_id ?? '', nombre: base.nombre ?? '', monto_base: base.monto_base ?? '', responsable_id: base.responsable_id ?? '', alerta_pct: base.alerta_pct ?? 80 })
  const [g, setG] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function guardar() {
    if (!f.sede_id || !f.nombre.trim() || !(Number(f.monto_base) > 0)) return toast.error('Sede, nombre y monto base (> 0) son obligatorios.')
    setG(true)
    const datos = { nombre: f.nombre.trim(), monto_base: Number(f.monto_base), responsable_id: f.responsable_id || null, alerta_pct: Number(f.alerta_pct) }
    const r = editando ? await actualizar('fondos_revolventes', base.fondo_id, datos) : await insertar('fondos_revolventes', { sede_id: f.sede_id, ...datos })
    setG(false)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success(editando ? 'Fondo actualizado.' : 'Fondo creado.'); onListo()
  }
  return (
    <Modal open onClose={onClose} title={editando ? 'Configurar fondo' : 'Nuevo fondo revolvente'} cerrarAlClicFuera={false}
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={g} onClick={guardar}>Guardar</button></>}>
      <div className="grid2">
        <FormField label="Sede" required as="select" value={f.sede_id} disabled={editando} onChange={e => set('sede_id', e.target.value)} options={sedes.filter(s => editando || !usadas.has(s.id)).map(s => ({ value: s.id, label: s.nombre }))} hint="Un fondo activo por sede." />
        <FormField label="Nombre" required value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Caja chica Roma" />
        <FormField label="Monto base" required type="number" min="0" step="0.01" value={f.monto_base} onChange={e => set('monto_base', e.target.value)} />
        <FormField label="Alerta al % usado" type="number" min="1" max="100" value={f.alerta_pct} onChange={e => set('alerta_pct', e.target.value)} />
        <FormField label="Responsable designado" as="select" value={f.responsable_id} onChange={e => set('responsable_id', e.target.value)} placeholder="Sin designar" options={perfiles.filter(p => p.rol !== 'podologo').map(p => ({ value: p.id, label: nombres[p.id] }))} />
      </div>
    </Modal>
  )
}
