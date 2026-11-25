// Ingresos (mockup 33; clon de IRP Ingresos.jsx + Validacion.jsx). Lee prp_ingresos; escribe en ingresos / aplicaciones_cobro / ingreso_renglones;
// validación por RPC ingreso_validar; alta manual por RPC registrar_ingreso (solo Administración).
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, Check, AlertTriangle, Trash2, FileText, Paperclip, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { insertar, actualizar, borrar, rpc } from '../../lib/api'
import { moneda, fecha, porcentaje } from '../../lib/formato'
import { rangoMes } from '../../lib/finanzas/semana.js'
import { parametrosFinanzas } from '../../lib/finanzas/constantes.js'
import { validarAplicaciones, autoDistribuir, estadoCuentaCobrar } from '../../lib/finanzas/aplicaciones.js'
import {
  FORMAS_PAGO_BD, CLASIFICACIONES_BD, ESTATUS_VALIDACION, etiquetaForma, etiquetaClasificacion, ingresoCongelado, ingresoBorrable,
  validarIngresoManual, validarObservacion, puedeValidarCFDI, ivaIncluido, validarReparto, kpisIngresos,
} from '../../lib/finanzas/ingresos.js'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import FormField from '../../components/ui/FormField'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useVista, SelectorMes, anioMesActual, mensajeError, VistaNoDisponible, Chips, hoy } from './componentes/comunes.jsx'
import { usePacientesNombres } from './componentes/nombres.js'
import SubirComprobante from './componentes/SubirComprobante.jsx'
import { usePerfilesMapa } from './componentes/comunes.jsx'
import { exportarExcel } from '../../lib/finanzas/exportar.js'

const CLAVE = 'ingresos'

export default function Ingresos() {
  const { sedes, sedeActivaId, organizacion } = useApp()
  const qc = useQueryClient()
  const puedeEditar = usePermiso('finanzas.editar')
  const [{ anio, mes }, setPeriodo] = useState(anioMesActual)
  const [modoFecha, setModoFecha] = useState('fecha_pago')
  const [validacion, setValidacion] = useState('todas')
  const [clas, setClas] = useState('todas')
  const [factura, setFactura] = useState('todas')
  const [podologoId, setPodologoId] = useState('')
  const [kpiFiltro, setKpiFiltro] = useState(null)
  const [seleccion, setSeleccion] = useState(new Set())
  const [nuevo, setNuevo] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const { confirmar, dialogo } = useConfirmacion()
  const { mapa: perfiles, perfiles: listaPerfiles } = usePerfilesMapa()

  const { desde, hasta } = rangoMes(anio, mes)
  const filtrosFecha = modoFecha === 'fecha_pago'
    ? { fecha_pago: { gte: desde, lte: hasta } }
    : { created_at: { gte: `${desde}T00:00:00`, lte: `${hasta}T23:59:59` } }
  const ing = useVista(CLAVE, 'prp_ingresos', { filtros: filtrosFecha, orden: [{ columna: 'fecha_pago', asc: false }], limite: 3000 })
  const desc = useVista(CLAVE + '-desc', 'prp_ingresos_descuadrados', { filtros: {}, limite: 500 })
  const cxc = useVista(CLAVE + '-cxc', 'prp_cuentas_cobrar', { filtros: { estado: ['reciente', 'pendiente', 'en_mora'] }, limite: 3000 })
  const nombres = usePacientesNombres(ing.filas.map(f => f.paciente_id))
  const nombreSede = id => sedes.find(s => s.id === id)?.nombre ?? '—'
  const invalidar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  const filas = useMemo(() => ing.filas.filter(f => {
    if (validacion !== 'todas' && f.estatus_validacion !== validacion) return false
    if (clas !== 'todas' && f.clasificacion !== clas) return false
    if (factura === 'con' && !f.tiene_cfdi) return false
    if (factura === 'sin' && f.tiene_cfdi) return false
    if (podologoId && f.podologo_id !== podologoId) return false
    if (kpiFiltro === 'por_validar' && f.estatus_validacion !== 'por_validar') return false
    if (kpiFiltro === 'observado' && f.estatus_validacion !== 'observado') return false
    if (kpiFiltro === 'cfdi' && !f.tiene_cfdi) return false
    if (kpiFiltro === 'descuadrado' && !desc.filas.some(d => d.ingreso_id === f.id)) return false
    return true
  }), [ing.filas, validacion, clas, factura, podologoId, kpiFiltro, desc.filas])

  const k = useMemo(() => kpisIngresos(filas, cxc.filas, desc.filas), [filas, cxc.filas, desc.filas])
  const kBase = useMemo(() => kpisIngresos(ing.filas, cxc.filas, desc.filas), [ing.filas, cxc.filas, desc.filas])
  const conteoVal = est => ing.filas.filter(f => f.estatus_validacion === est).length

  async function validar(ids, estatus, observacion) {
    setOcupado(true)
    let ok = 0
    for (const id of ids) {
      const r = await rpc('ingreso_validar', { p_ingreso: id, p_estatus: estatus, p_observacion: observacion ?? null })
      if (r.error) toast.error(mensajeError(r.error)); else ok++
    }
    setOcupado(false)
    if (ok) toast.success(ok === 1 ? 'Cobro actualizado.' : `${ok} cobros actualizados.`)
    setSeleccion(new Set()); invalidar()
    return ok
  }
  async function observar(f) {
    const m = await confirmar({ titulo: 'Marcar como observado', mensaje: 'El cobro queda marcado y genera alerta; no bloquea el corte.', pedirMotivo: true, textoConfirmar: 'Observar' })
    if (m) { const err = validarObservacion(m); if (err) return toast.error(err); validar([f.id], 'observado', m) }
  }
  async function eliminar(f) {
    const m = await confirmar({ titulo: 'Eliminar cobro', mensaje: `Se eliminará el cobro de ${moneda(f.importe)} (${fecha(f.fecha_pago)}). Un cobro validado o conciliado no se puede borrar.`, pedirMotivo: true, peligro: true, textoConfirmar: 'Eliminar' })
    if (!m) return
    const r = await borrar('ingresos', f.id)
    if (r.error) toast.error(mensajeError(r.error)); else { toast.success('Cobro eliminado (queda en bitácora).'); invalidar() }
  }
  const alternar = id => setSeleccion(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pendientesSel = filas.filter(f => seleccion.has(f.id) && f.estatus_validacion === 'por_validar')

  const columnas = [
    ...(puedeEditar ? [{ key: '_sel', label: '', sortable: false, exportar: false, ancho: 34, render: f => ['por_validar'].includes(f.estatus_validacion) ? <input type="checkbox" checked={seleccion.has(f.id)} onClick={e => e.stopPropagation()} onChange={() => alternar(f.id)} aria-label="Seleccionar" /> : null }] : []),
    { key: 'docs', label: 'Docs', sortable: false, exportar: false, render: f => <span title="CFDI / comprobante">{f.tiene_cfdi ? <FileText size={14} color="var(--green)" /> : <span style={{ color: 'var(--muted)' }}>—</span>} {f.tiene_comprobante ? <Paperclip size={14} color="var(--accent)" /> : <span style={{ color: 'var(--muted)' }}>—</span>}</span>, valor: f => `${f.tiene_cfdi ? 'CFDI' : 'sin CFDI'} ${f.tiene_comprobante ? 'comprobante' : ''}` },
    { key: 'forma_pago', label: 'F. pago', render: f => <span title={etiquetaForma(f.forma_pago)}>{FORMAS_PAGO_BD.find(x => x.value === f.forma_pago)?.corto ?? f.forma_pago}</span>, valor: f => etiquetaForma(f.forma_pago), filtro: true },
    { key: 'fecha_pago', label: 'Fecha pago', render: f => fecha(f.fecha_pago), valor: f => f.fecha_pago },
    { key: 'origen', label: 'Cita / venta', valor: f => (f.venta_folio ? `Ticket ${f.venta_folio}` : f.cita_folio ? `Cita ${f.cita_folio}` : f.cita_id ? `Cita ${f.cita_id.slice(0, 6)}` : f.venta_id ? `Venta ${f.venta_id.slice(0, 6)}` : f.origen_registro === 'manual' ? 'Manual' : '—') },
    { key: 'paciente', label: 'Paciente', valor: f => nombres[f.paciente_id] ?? (f.paciente_id ? '…' : '—') },
    { key: 'podologo', label: 'Podólogo', valor: f => perfiles[f.podologo_id] ?? '—', filtro: true },
    { key: 'sede', label: 'Sede', valor: f => f.sede_nombre, filtro: true },
    { key: 'concepto', label: 'Concepto', render: f => <>{f.concepto ?? '—'} <span className="bd n" title={f.clasificacion_manual ? 'Clasificación manual' : 'Clasificación automática'}>{etiquetaClasificacion(f.clasificacion)}{f.clasificacion_manual ? ' ✎' : ''}</span>{f.es_reembolso && <span className="bd r" style={{ marginLeft: 4 }}>Reembolso</span>}</>, valor: f => `${f.concepto ?? ''} ${etiquetaClasificacion(f.clasificacion)}` },
    { key: 'estatus', label: 'Validación', render: f => <><StatusBadge estado={f.estatus_validacion} label={ESTATUS_VALIDACION.find(e => e.value === f.estatus_validacion)?.label} />{f.movimiento_id && <span className="bd v" style={{ marginLeft: 4 }} title={`Conciliado con el banco ${fecha(f.movimiento_fecha)}`}>Banco</span>}{desc.filas.some(d => d.ingreso_id === f.id) && <span className="bd r" style={{ marginLeft: 4 }}>Descuadre</span>}</>, valor: f => ESTATUS_VALIDACION.find(e => e.value === f.estatus_validacion)?.label },
    { key: 'importe', label: 'Cobrado', align: 'right', render: f => <b className="num">{moneda(f.importe_neto)}</b>, valor: f => Number(f.importe_neto) },
    { key: 'acc', label: '', sortable: false, exportar: false, render: f => (
      <span style={{ display: 'inline-flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        <button type="button" className="btn o sm" title="Ver / editar" onClick={() => setDetalle(f)}><Eye size={12} /></button>
        {puedeEditar && f.estatus_validacion === 'por_validar' && <button type="button" className="btn sm" title="Validar" disabled={ocupado} onClick={() => validar([f.id], 'validado')}><Check size={12} /></button>}
        {puedeEditar && ['por_validar', 'validado'].includes(f.estatus_validacion) && <button type="button" className="btn o sm" title="Observar" onClick={() => observar(f)}><AlertTriangle size={12} /></button>}
        {puedeEditar && ingresoBorrable(f) && <button type="button" className="btn red sm" title="Eliminar" onClick={() => eliminar(f)}><Trash2 size={12} /></button>}
      </span>) },
  ]

  async function exportar() {
    await exportarExcel(`ingresos_${anio}-${String(mes).padStart(2, '0')}`, [{
      nombre: 'Ingresos', columnas: [
        { label: 'Fecha pago', key: 'fecha_pago' }, { label: 'Sede', key: 'sede' }, { label: 'Paciente', key: 'paciente' }, { label: 'Podólogo', key: 'podologo' },
        { label: 'Concepto', key: 'concepto' }, { label: 'Clasificación', key: 'clas' }, { label: 'Forma de pago', key: 'forma' }, { label: 'Referencia', key: 'referencia' },
        { label: 'Validación', key: 'estatus' }, { label: 'CFDI', key: 'cfdi' }, { label: 'IVA', key: 'iva', formato: 'moneda' }, { label: 'Importe neto', key: 'neto', formato: 'moneda' }, { label: 'Observación', key: 'obs' },
      ],
      filas: filas.map(f => ({ fecha_pago: f.fecha_pago, sede: f.sede_nombre, paciente: nombres[f.paciente_id] ?? '', podologo: perfiles[f.podologo_id] ?? '', concepto: f.concepto ?? '', clas: etiquetaClasificacion(f.clasificacion), forma: etiquetaForma(f.forma_pago), referencia: f.referencia ?? '', estatus: ESTATUS_VALIDACION.find(e => e.value === f.estatus_validacion)?.label, cfdi: f.tiene_cfdi ? 'Sí' : 'No', iva: Number(f.iva), neto: Number(f.importe_neto), obs: f.observacion ?? '' })),
    }], { entidad: 'ingresos', detalle: { filas: filas.length, periodo: `${anio}-${mes}` }, sedeId: sedeActivaId })
  }

  const toggle = (id) => setKpiFiltro(v => (v === id ? null : id))
  return (
    <div className="pagina">
      <PageHeader titulo="Ingresos" subtitulo="Pagos recibidos por servicios y productos · cada ingreso ligado a su cita o venta"
        acciones={<>
          {puedeEditar && <button type="button" className="btn" onClick={() => setNuevo(true)}><Plus size={14} style={{ verticalAlign: -3 }} /> Registrar ingreso</button>}
          <button type="button" className="btn o" onClick={exportar} disabled={!filas.length}>Exportar</button>
        </>} />
      <div className="toolbar">
        <select value={modoFecha} onChange={e => setModoFecha(e.target.value)} aria-label="Modo de fecha"><option value="fecha_pago">Modo: Fecha de pago</option><option value="registro">Modo: Fecha de registro</option></select>
        <SelectorMes anio={anio} mes={mes} onChange={setPeriodo} />
        <select value={podologoId} onChange={e => setPodologoId(e.target.value)} aria-label="Podólogo"><option value="">Podólogo: todos</option>{listaPerfiles.filter(p => p.rol === 'podologo').map(p => <option key={p.id} value={p.id}>{perfiles[p.id]}</option>)}</select>
        <select value={validacion} onChange={e => setValidacion(e.target.value)} aria-label="Validación"><option value="todas">Validación: todas</option>{ESTATUS_VALIDACION.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</select>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chips valor={clas} onChange={setClas} opciones={[{ value: 'todas', label: 'Todos' }, ...CLASIFICACIONES_BD]} />
        <Chips valor={factura} onChange={setFactura} opciones={[{ value: 'todas', label: 'Todos' }, { value: 'con', label: 'Con factura' }, { value: 'sin', label: 'Sin factura' }]} />
      </div>

      {ing.noDisponible ? <VistaNoDisponible nombre="prp_ingresos" /> : <>
        {desc.filas.length > 0 && (
          <div className="card" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12, fontSize: 13 }}>
            <b>{desc.filas.length} cobro(s) con aplicaciones descuadradas</b> (sobre-aplicados o parcialmente aplicados a cuentas por cobrar). {' '}
            <button type="button" className="btn o sm" onClick={() => toggle('descuadrado')}>{kpiFiltro === 'descuadrado' ? 'Quitar filtro' : 'Ver cobros'}</button>
          </div>
        )}
        <div className="grid-kpis">
          <KPICard title="Por cobrar (cuentas abiertas)" value={moneda(kBase.porCobrar.importe)} subtitle={`${kBase.porCobrar.n} cuentas con saldo`} color="var(--gold)" loading={cxc.cargando} ayuda="Saldo de cuentas por cobrar reciente, pendiente o en mora." />
          <KPICard title="Cobrado servicios" value={moneda(k.servicios)} color="var(--green)" loading={ing.cargando} />
          <KPICard title="Cobrado productos" value={moneda(k.productos)} loading={ing.cargando} />
          <KPICard title="Anticipos / planes" value={moneda(k.anticiposPlanes)} subtitle={k.mixtos ? `+ ${moneda(k.mixtos)} mixtos` : undefined} loading={ing.cargando} />
          <KPICard title="Por validar" value={moneda(k.porValidar.importe)} subtitle={`${k.porValidar.n} registros`} color="var(--gold)" onClick={() => toggle('por_validar')} activo={kpiFiltro === 'por_validar'} loading={ing.cargando} />
          <KPICard title="Observados" value={moneda(k.observados.importe)} subtitle={`${k.observados.n} registros`} color="var(--red)" onClick={() => toggle('observado')} activo={kpiFiltro === 'observado'} loading={ing.cargando} />
          <KPICard title="Con CFDI" value={String(k.conCFDI.n)} subtitle={`${porcentaje(k.conCFDI.pct, 0)} de los cobros`} onClick={() => toggle('cfdi')} activo={kpiFiltro === 'cfdi'} loading={ing.cargando} />
          <KPICard title="Registros" value={String(k.registros)} subtitle={`Total ${moneda(k.total)}`} loading={ing.cargando} />
        </div>
        {puedeEditar && pendientesSel.length > 0 && (
          <div className="card" style={{ margin: '12px 0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{pendientesSel.length} seleccionados · {moneda(pendientesSel.reduce((s, f) => s + Number(f.importe_neto), 0))}</b>
            <button type="button" className="btn" disabled={ocupado} onClick={() => validar(pendientesSel.map(f => f.id), 'validado')}><ShieldCheck size={14} style={{ verticalAlign: -3 }} /> Validar seleccionados</button>
            <button type="button" className="btn o" onClick={() => setSeleccion(new Set())}>Limpiar</button>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <DataTable columnas={columnas} filas={filas} cargando={ing.cargando} error={ing.error} exportarNombre={null} onFila={setDetalle}
            placeholderBusqueda="Buscar paciente, concepto o folio…" tamanoPagina={30}
            vacio={{ title: 'Sin ingresos', description: 'No hay cobros con estos filtros en el periodo.' }} />
        </div>
        <div className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          T = Transferencia · D = Depósito · E = Efectivo · Tj = Tarjeta · Clip = Tarjeta Clip · Ch = Cheque. Los cobros validados no cambian monto, fecha ni forma de pago ni se borran. Observado no bloquea el corte.
        </div>
      </>}
      {nuevo && <ModalNuevo onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); invalidar() }} sedes={sedes} sedeInicial={sedeActivaId} organizacion={organizacion} />}
      {detalle && <ModalDetalle ingreso={detalle} nombres={nombres} perfiles={perfiles} puedeEditar={puedeEditar} cuentas={cxc.filas} onClose={() => setDetalle(null)} onCambio={invalidar} validar={validar} observar={observar} />}
      {dialogo}
    </div>
  )
}

// ───────────────────────── Registrar ingreso manual ─────────────────────────
function ModalNuevo({ onClose, onListo, sedes, sedeInicial, organizacion }) {
  const tasa = parametrosFinanzas(organizacion).iva_tasa_general
  const renglones = useVista('renglones-ing', 'edr_renglones', { sedeCol: false, filtros: { tipo: 'ingreso', activo: true }, orden: [{ columna: 'orden' }], limite: 100 })
  const [f, setF] = useState({ sede_id: sedeInicial ?? (sedes.length === 1 ? sedes[0].id : ''), fecha_pago: hoy(), forma_pago: 'transferencia', importe: '', conIva: true, clasificacion: 'servicio', renglon: '', concepto: '', referencia: '', comprobante: null })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const iva = f.conIva ? ivaIncluido(f.importe, tasa) : 0
  const errores = validarIngresoManual({ ...f, iva })
  async function guardar() {
    if (errores.length) return toast.error(errores[0])
    setGuardando(true)
    const r = await rpc('registrar_ingreso', {
      p_sede: f.sede_id, p_fecha: f.fecha_pago, p_forma: f.forma_pago, p_importe: Number(f.importe), p_iva: iva, p_clasificacion: f.clasificacion,
      p_renglon: f.renglon || null, p_referencia: f.referencia || null, p_concepto: f.concepto.trim(), p_comprobante: f.comprobante, p_manual: true,
    })
    setGuardando(false)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Ingreso registrado: queda «Por validar».')
    onListo()
  }
  return (
    <Modal open onClose={onClose} title="Registrar ingreso manual" cerrarAlClicFuera={false}
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar ingreso'}</button></>}>
      <div className="hint" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Los cobros de la caja nacen solos desde el pago. Usa esta captura solo para ingresos sin cita ni venta (depósitos, ajustes).</div>
      <div className="grid2">
        <FormField label="Sede" required as="select" value={f.sede_id} onChange={e => set('sede_id', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Fecha de pago" required type="date" value={f.fecha_pago} max={hoy()} onChange={e => set('fecha_pago', e.target.value)} />
        <FormField label="Forma de pago" required as="select" value={f.forma_pago} onChange={e => set('forma_pago', e.target.value)} options={FORMAS_PAGO_BD} />
        <FormField label="Monto cobrado (IVA incluido)" required type="number" min="0" step="0.01" value={f.importe} onChange={e => set('importe', e.target.value)} hint={f.conIva ? `IVA incluido ${tasa}%: ${moneda(iva)}` : 'Sin IVA'} />
        <FormField label="Clasificación" as="select" value={f.clasificacion} onChange={e => set('clasificacion', e.target.value)} options={CLASIFICACIONES_BD} />
        <FormField label="Renglón del estado de resultados" as="select" value={f.renglon} onChange={e => set('renglon', e.target.value)} placeholder="Automático (Otros servicios)" options={renglones.filas.map(r => ({ value: r.clave, label: r.nombre }))} />
        <FormField label="Concepto" required value={f.concepto} onChange={e => set('concepto', e.target.value)} placeholder="Ej. Depósito de anticipo sin cita" />
        <FormField label="Referencia / folio de operación" value={f.referencia} onChange={e => set('referencia', e.target.value)} placeholder="CLIP-882041, SPEI…" />
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, margin: '8px 0' }}><input type="checkbox" checked={f.conIva} onChange={e => set('conIva', e.target.checked)} /> El monto incluye IVA</label>
      <div>Comprobante: <SubirComprobante carpeta="ingresos" valor={f.comprobante} onSubida={({ ruta }) => set('comprobante', ruta)} /> <span className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}>La lectura automática de monto y fecha queda pendiente (sin llave de IA).</span></div>
      {errores.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{errores.map(e => <li key={e}>{e}</li>)}</ul>}
    </Modal>
  )
}

// ───────────────────────── Detalle: datos, aplicaciones, reparto ─────────────────────────
function ModalDetalle({ ingreso: i0, nombres, perfiles, puedeEditar, cuentas, onClose, onCambio, validar, observar }) {
  const [tab, setTab] = useState('datos')
  const [i, setI] = useState(i0)
  const congelado = ingresoCongelado(i)
  const editable = puedeEditar && !congelado
  const refrescar = async (cambios) => { setI(x => ({ ...x, ...cambios })); onCambio() }
  return (
    <Modal open onClose={onClose} size="wide" cerrarAlClicFuera={false} title={`Cobro ${moneda(i.importe)} · ${fecha(i.fecha_pago)}`}
      footer={<>
        {puedeEditar && i.estatus_validacion === 'por_validar' && <button type="button" className="btn" onClick={async () => { if (await validar([i.id], 'validado')) refrescar({ estatus_validacion: 'validado' }) }}>Validar</button>}
        {puedeEditar && i.estatus_validacion === 'validado' && <button type="button" className="btn" disabled={!puedeValidarCFDI(i)} title={puedeValidarCFDI(i) ? '' : 'El cobro aún no tiene factura ni UUID de CFDI'} onClick={async () => { if (await validar([i.id], 'validado_cfdi')) refrescar({ estatus_validacion: 'validado_cfdi' }) }}>Validar con CFDI</button>}
        {puedeEditar && i.estatus_validacion === 'observado' && <button type="button" className="btn" onClick={async () => { if (await validar([i.id], 'por_validar')) refrescar({ estatus_validacion: 'por_validar' }) }}>Regresar a «Por validar»</button>}
        {puedeEditar && ['por_validar', 'validado'].includes(i.estatus_validacion) && <button type="button" className="btn o" onClick={() => observar(i)}>Observar</button>}
        <button type="button" className="btn o" onClick={onClose}>Cerrar</button>
      </>}>
      <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusBadge estado={i.estatus_validacion} label={ESTATUS_VALIDACION.find(e => e.value === i.estatus_validacion)?.label} />
        {congelado && <span className="hint" style={{ fontSize: 12, color: 'var(--muted)' }}>Validado: monto, fecha y forma de pago ya no cambian.</span>}
        {i.observacion && <span style={{ fontSize: 12, color: 'var(--red)' }}>Observación: {i.observacion}</span>}
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'datos', label: 'Datos' }, { id: 'aplicaciones', label: 'Aplicaciones de pago', oculto: i.es_reembolso }, { id: 'reparto', label: 'Reparto por renglón' }]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'datos' && <TabDatos i={i} editable={editable} nombres={nombres} perfiles={perfiles} onGuardado={refrescar} puedeEditar={puedeEditar} />}
        {tab === 'aplicaciones' && <TabAplicaciones i={i} editable={puedeEditar} cuentas={cuentas} onCambio={onCambio} />}
        {tab === 'reparto' && <TabReparto i={i} editable={puedeEditar} onCambio={onCambio} />}
      </div>
    </Modal>
  )
}

function Dato({ k, v }) { return <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</div><div style={{ fontWeight: 600 }}>{v ?? '—'}</div></div> }

function TabDatos({ i, editable, nombres, perfiles, onGuardado, puedeEditar }) {
  const [e, setE] = useState({ clasificacion: i.clasificacion, concepto: i.concepto ?? '', referencia: i.referencia ?? '', forma_pago: i.forma_pago, fecha_pago: i.fecha_pago, importe: i.importe, iva: i.iva })
  const [g, setG] = useState(false)
  const set = (k, v) => setE(x => ({ ...x, [k]: v }))
  async function guardar() {
    if (!(Number(e.importe) > 0)) return toast.error('El monto debe ser mayor a cero.')
    setG(true)
    const cambios = { concepto: e.concepto || null, referencia: e.referencia || null, forma_pago: e.forma_pago, fecha_pago: e.fecha_pago, importe: Number(e.importe), iva: Number(e.iva) }
    if (e.clasificacion !== i.clasificacion) { cambios.clasificacion = e.clasificacion; cambios.clasificacion_manual = true }
    const r = await actualizar('ingresos', i.id, cambios)
    setG(false)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Cobro guardado.'); onGuardado(cambios)
  }
  async function volverAutomatica() {
    const r = await actualizar('ingresos', i.id, { clasificacion_manual: false })
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('La clasificación vuelve a ser automática.'); onGuardado({ clasificacion_manual: false })
  }
  async function comprobante({ ruta }) {
    const r = await actualizar('ingresos', i.id, { comprobante_url: ruta })
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Comprobante adjuntado.'); onGuardado({ comprobante_url: ruta, tiene_comprobante: true })
  }
  return (
    <div>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <Dato k="Paciente" v={nombres[i.paciente_id]} /><Dato k="Podólogo" v={perfiles[i.podologo_id]} />
        <Dato k="Sede" v={i.sede_nombre} /><Dato k="Origen" v={i.origen_registro === 'manual' ? 'Captura manual' : 'Automático desde la caja'} />
        <Dato k="IVA incluido" v={moneda(i.iva)} /><Dato k="Base sin IVA" v={moneda(i.base_sin_iva)} />
        <Dato k="CFDI" v={i.tiene_cfdi ? (i.cfdi_uuid ?? 'Factura ligada') : 'Sin factura'} />
        <Dato k="Conciliación bancaria" v={i.movimiento_id ? `Conciliado (${fecha(i.movimiento_fecha)})` : 'Sin conciliar'} />
        <Dato k="Aplicado a cuentas por cobrar" v={moneda(i.aplicado)} />
        {i.validado_en && <Dato k="Validado" v={fecha(i.validado_en)} />}
      </div>
      <div className="grid2">
        <FormField label="Concepto" value={e.concepto} disabled={!editable} onChange={x => set('concepto', x.target.value)} />
        <FormField label="Referencia / folio" value={e.referencia} disabled={!puedeEditar} onChange={x => set('referencia', x.target.value)} />
        <FormField label="Fecha de pago" type="date" value={e.fecha_pago} disabled={!editable} onChange={x => set('fecha_pago', x.target.value)} />
        <FormField label="Forma de pago" as="select" value={e.forma_pago} disabled={!editable} onChange={x => set('forma_pago', x.target.value)} options={FORMAS_PAGO_BD} />
        <FormField label="Monto cobrado" type="number" step="0.01" value={e.importe} disabled={!editable} onChange={x => set('importe', x.target.value)} />
        <FormField label="IVA incluido" type="number" step="0.01" value={e.iva} disabled={!editable} onChange={x => set('iva', x.target.value)} />
        <FormField label={`Clasificación (${i.clasificacion_manual ? 'manual' : 'automática'})`} as="select" value={e.clasificacion} disabled={!puedeEditar} onChange={x => set('clasificacion', x.target.value)} options={CLASIFICACIONES_BD} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {puedeEditar && <button type="button" className="btn" disabled={g} onClick={guardar}>{g ? 'Guardando…' : 'Guardar cambios'}</button>}
        {puedeEditar && i.clasificacion_manual && <button type="button" className="btn o" onClick={volverAutomatica}>Volver a clasificación automática</button>}
        {puedeEditar && <SubirComprobante carpeta="ingresos" valor={i.comprobante_url} onSubida={comprobante} etiqueta="Adjuntar comprobante" />}
      </div>
    </div>
  )
}

function TabAplicaciones({ i, editable, cuentas, onCambio }) {
  const qc = useQueryClient()
  const apps = useVista('apps-' + i.id, 'aplicaciones_cobro', { sedeCol: false, filtros: { ingreso_id: i.id }, limite: 200 })
  const cuentasPac = useVista('cxc-pac-' + i.id, 'prp_cuentas_cobrar', { sedeCol: false, filtros: i.paciente_id ? { paciente_id: i.paciente_id } : { id: '00000000-0000-0000-0000-000000000000' }, limite: 200 }, { enabled: true })
  const [monto, setMonto] = useState({})
  const [g, setG] = useState(false)
  const propias = Object.fromEntries(apps.filas.map(a => [a.cuenta_id, Number(a.importe_aplicado)]))
  const lista = cuentasPac.filas.filter(c => c.estado !== 'cancelada' && (Number(c.saldo) > 0 || propias[c.id]))
  const valor = id => (monto[id] !== undefined ? monto[id] : propias[id] ?? '')
  const propuesta = lista.map(c => ({ cuenta_id: c.id, importe_aplicado: Number(valor(c.id)) || 0 })).filter(a => a.importe_aplicado > 0)
  const mapaCuentas = Object.fromEntries(lista.map(c => [c.id, { importe: Number(c.importe), cobrado: Number(c.cobrado) - (propias[c.id] ?? 0), estado: c.estado_registro, paciente_id: c.paciente_id }]))
  const val = validarAplicaciones(i, propuesta, mapaCuentas)
  const sugerir = () => {
    const ord = [...lista].sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision)).map(c => ({ id: c.id, importe: Number(c.importe), cobrado: mapaCuentas[c.id].cobrado }))
    const r = autoDistribuir(Number(i.importe), ord)
    setMonto(Object.fromEntries(lista.map(c => [c.id, r.aplicaciones.find(a => a.cuenta_id === c.id)?.importe_aplicado ?? ''])))
  }
  async function guardar() {
    if (!val.ok) return toast.error(val.errores[0])
    setG(true)
    // primero se bajan o quitan, luego se suben: cada fila se valida contra el total del cobro
    const cambios = lista.map(c => ({ c, antes: propias[c.id] ?? 0, ahora: Number(valor(c.id)) || 0 })).filter(x => x.antes !== x.ahora).sort((a, b) => (a.ahora - a.antes) - (b.ahora - b.antes))
    for (const { c, antes, ahora } of cambios) {
      let r
      if (ahora === 0) { const existente = apps.filas.find(a => a.cuenta_id === c.id); r = await borrar('aplicaciones_cobro', existente.id) }
      else if (antes === 0) r = await insertar('aplicaciones_cobro', { sede_id: i.sede_id, ingreso_id: i.id, cuenta_id: c.id, importe_aplicado: ahora })
      else r = await actualizar('aplicaciones_cobro', apps.filas.find(a => a.cuenta_id === c.id).id, { importe_aplicado: ahora })
      if (r.error) { setG(false); toast.error(mensajeError(r.error)); qc.invalidateQueries({ queryKey: ['finanzas'] }); return }
    }
    setG(false); setMonto({}); toast.success('Aplicaciones guardadas.'); qc.invalidateQueries({ queryKey: ['finanzas'] }); onCambio()
  }
  if (!i.paciente_id) return <div className="hint" style={{ fontSize: 13, color: 'var(--muted)' }}>Este cobro no tiene paciente: no se puede aplicar a cuentas por cobrar.</div>
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Cobro: <b>{moneda(i.importe)}</b> · aplicado <b>{moneda(val.aplicado)}</b> · sin aplicar <b style={{ color: val.sobrante < 0 ? 'var(--red)' : undefined }}>{moneda(val.sobrante)}</b>. La suma nunca puede exceder el cobro ni el saldo de cada cuenta.</div>
      {cuentasPac.cargando ? <div>Cargando…</div> : !lista.length ? <div className="hint" style={{ fontSize: 13, color: 'var(--muted)' }}>El paciente no tiene cuentas por cobrar con saldo.</div> : (
        <div className="tabla-wrap"><table>
          <thead><tr><th>Concepto</th><th>Emisión</th><th>Estado</th><th style={{ textAlign: 'right' }}>Importe</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'right' }}>Aplicar</th></tr></thead>
          <tbody>{lista.map(c => (
            <tr key={c.id}><td>{c.concepto}</td><td>{fecha(c.fecha_emision)}</td><td><StatusBadge estado={c.estado} /></td>
              <td className="num" style={{ textAlign: 'right' }}>{moneda(c.importe)}</td><td className="num" style={{ textAlign: 'right' }}>{moneda(Number(c.saldo) + (propias[c.id] ?? 0))}</td>
              <td style={{ textAlign: 'right' }}><input type="number" min="0" step="0.01" style={{ width: 110, textAlign: 'right' }} value={valor(c.id)} disabled={!editable} onChange={e => setMonto(m => ({ ...m, [c.id]: e.target.value }))} /></td></tr>))}</tbody>
        </table></div>)}
      {!val.ok && propuesta.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{[...new Set(val.errores)].map(e => <li key={e}>{e}</li>)}</ul>}
      {editable && lista.length > 0 && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn o" onClick={sugerir}>Distribuir automáticamente (más antigua primero)</button>
        <button type="button" className="btn" disabled={g || !val.ok} onClick={guardar}>{g ? 'Guardando…' : 'Guardar aplicaciones'}</button></div>}
    </div>
  )
}

function TabReparto({ i, editable, onCambio }) {
  const qc = useQueryClient()
  const ren = useVista('renglones-rep', 'edr_renglones', { sedeCol: false, filtros: { tipo: 'ingreso', activo: true }, orden: [{ columna: 'orden' }], limite: 100 })
  const act = useVista('reparto-' + i.id, 'ingreso_renglones', { sedeCol: false, filtros: { ingreso_id: i.id }, limite: 50 })
  const [filas, setFilas] = useState(null)
  const [g, setG] = useState(false)
  const actual = filas ?? act.filas.map(r => ({ id: r.id, renglon_id: r.renglon_id, importe: Number(r.importe) }))
  const v = validarReparto(i.importe, actual)
  const cambiar = (idx, k, val) => setFilas(actual.map((f, n) => (n === idx ? { ...f, [k]: val } : f)))
  async function guardar() {
    if (!v.ok) return toast.error(v.errores[0])
    setG(true)
    for (const f of act.filas) { const r = await borrar('ingreso_renglones', f.id); if (r.error) { setG(false); return toast.error(mensajeError(r.error)) } }
    if (actual.length) {
      const r = await insertar('ingreso_renglones', actual.map(f => ({ sede_id: i.sede_id, ingreso_id: i.id, renglon_id: f.renglon_id, importe: Number(f.importe) })))
      if (r.error) { setG(false); return toast.error(mensajeError(r.error)) }
    }
    setG(false); setFilas(null); toast.success('Reparto guardado.'); qc.invalidateQueries({ queryKey: ['finanzas'] }); onCambio()
  }
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Reparte el cobro entre renglones del estado de resultados (p. ej. consulta, plantillas, productos). Sin reparto, todo cae en el renglón principal. Repartido <b>{moneda(v.suma)}</b> de <b>{moneda(i.importe)}</b>.</div>
      {actual.map((f, n) => (
        <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <select value={f.renglon_id} disabled={!editable} onChange={e => cambiar(n, 'renglon_id', e.target.value)} style={{ flex: 1 }}><option value="">Renglón…</option>{ren.filas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
          <input type="number" step="0.01" min="0" style={{ width: 120, textAlign: 'right' }} value={f.importe} disabled={!editable} onChange={e => cambiar(n, 'importe', e.target.value)} />
          {editable && <button type="button" className="btn red sm" onClick={() => setFilas(actual.filter((_, m) => m !== n))}><Trash2 size={12} /></button>}
        </div>))}
      {!actual.length && <div className="hint" style={{ fontSize: 13, color: 'var(--muted)' }}>Sin reparto: el cobro va al renglón principal.</div>}
      {!v.ok && actual.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12 }}>{v.errores.map(e => <li key={e}>{e}</li>)}</ul>}
      {editable && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn o" onClick={() => setFilas([...actual, { renglon_id: '', importe: v.sinRepartir > 0 ? v.sinRepartir : '' }])}><Plus size={12} /> Agregar renglón</button>
        <button type="button" className="btn" disabled={g || !v.ok || filas === null} onClick={guardar}>{g ? 'Guardando…' : 'Guardar reparto'}</button></div>}
    </div>
  )
}
