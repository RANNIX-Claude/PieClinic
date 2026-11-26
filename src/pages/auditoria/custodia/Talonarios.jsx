// TALONARIOS DE CONTINGENCIA (F5.4): alta por la oficina central, captura de tickets manuales con foto del papel, AUDITORÍA del talonario (el servidor valida la
// continuidad: si va en el 25, del 1 al 24 debe estar todo capturado) y caídas del sistema. La prioridad es que el papel casi nunca se use: la app trabaja sin
// conexión; esto es el respaldo.
// Capturan: recepción, podología, supervisor y dueño. Dan de alta, cancelan y auditan: supervisor y dueño. La sucursal NUNCA ve lo que se esperaba vender.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Trash2, ClipboardList, WifiOff, ShieldAlert, CheckCircle2 } from 'lucide-react'
import FormField from '../../../components/ui/FormField'
import Tabs from '../../../components/ui/Tabs'
import Modal from '../../../components/ui/Modal'
import EmptyState from '../../../components/ui/EmptyState'
import StatusBadge from '../../../components/ui/StatusBadge'
import { usePermiso } from '../../../lib/permisos'
import { moneda, fechaHora } from '../../../lib/formato'
import {
  nuevoId, altaTalonario, cancelarTalonario, resumenTalonarios, capturarTicketManual, auditarTalonario, iniciarCaida, cerrarCaida, listarCaidas, listarAuditoriasTalonario,
} from '../../../lib/auditoria/custodiaApi'
import { validarRangoTalonario, validarTicketManual, listaFolios, NOMBRE_ESTADO_TALONARIO, duracionCaida, proporcionVenta } from '../../../lib/auditoria/custodia'
import { listar } from '../../../lib/auditoria/api'
import { errMsg, useDatos, EstadoConsulta } from '../comun'
import { FotoEnVivo, SelectorSucursal, useSucursalInicial, grande } from './comunCustodia'

export default function Talonarios() {
  const revisa = usePermiso('auditoria.investigar')
  const [tab, setTab] = useState('ticket')
  const [sucursal, setSucursal] = useSucursalInicial()
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'ticket', label: 'Capturar ticket de papel' }, { id: 'caidas', label: 'Caídas del sistema' },
        { id: 'talonarios', label: 'Talonarios', oculto: !revisa }, { id: 'auditoria', label: 'Auditar talonario', oculto: !revisa },
      ]} />
      <div style={{ marginTop: 12 }}>
        <div style={{ maxWidth: 560 }}><SelectorSucursal value={sucursal} onChange={setSucursal} /></div>
        {tab === 'ticket' && <CapturaTicket sucursal={sucursal} />}
        {tab === 'caidas' && <Caidas sucursal={sucursal} />}
        {tab === 'talonarios' && revisa && <ListaTalonarios sucursal={sucursal} />}
        {tab === 'auditoria' && revisa && <Auditar sucursal={sucursal} />}
      </div>
    </>
  )
}

function useTalonarios(sucursal) {
  return useQuery({ queryKey: ['ctl-talonarios', sucursal], enabled: !!sucursal, retry: false,
    queryFn: async () => { const r = await resumenTalonarios(sucursal); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] } })
}

// ───────────────────────────── captura de un ticket manual ─────────────────────────────
function CapturaTicket({ sucursal }) {
  const qc = useQueryClient()
  const tal = useTalonarios(sucursal)
  const [id, setId] = useState(() => nuevoId())
  const [folio, setFolio] = useState('')
  const [monto, setMonto] = useState('')
  const [cancelado, setCancelado] = useState(false)
  const [renglones, setRenglones] = useState([{ descripcion: '', cantidad: 1 }])
  const [evidencia, setEvidencia] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const activos = (tal.data ?? []).filter(t => t.estado === 'activo')

  async function enviar() {
    const productos = cancelado ? [] : renglones.filter(r => r.descripcion.trim()).map(r => ({ descripcion: r.descripcion.trim(), cantidad: Number(r.cantidad) }))
    const v = validarTicketManual({ folio, monto: cancelado && monto === '' ? 0 : monto, productos, cancelado, hayFoto: !!evidencia })
    if (!v.ok) return toast.error(v.error)
    setOcupado(true)
    const r = await capturarTicketManual({ id, sucursalId: sucursal, folio: Number(folio), monto: cancelado ? Number(monto || 0) : Number(monto), productos, evidenciaId: evidencia, cancelado })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error), { duration: 10000 })
    toast.success(`Folio ${folio} capturado${r.data.talonario_consumido ? ' · talonario completo' : ''}`)
    setId(nuevoId()); setFolio(''); setMonto(''); setCancelado(false); setRenglones([{ descripcion: '', cantidad: 1 }]); setEvidencia(null)
    qc.invalidateQueries({ queryKey: ['ctl-talonarios'] })
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {tal.isError && <EmptyState title="No se pudo cargar" description={tal.error.message} />}
      {!tal.isLoading && !tal.isError && !activos.length && (
        <EmptyState title="Sin talonario activo en esta sucursal" description="Para capturar un ticket de papel, la oficina central debe dar de alta el talonario (rango de folios) de la sucursal." />
      )}
      {activos.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}><FileText size={16} style={{ verticalAlign: -3 }} /> Ticket de papel</h3>
          <div className="hint" style={{ marginBottom: 8 }}>
            {activos.map(t => `Talonario ${t.folio_inicial}–${t.folio_final}`).join(' · ')}. El servidor valida que el folio caiga en un rango activo de esta sucursal y que no esté repetido.
          </div>
          <FormField label="Folio impreso del ticket" type="number" inputMode="numeric" value={folio} onChange={e => setFolio(e.target.value)} />
          <label style={{ display: 'block', margin: '4px 0 8px', fontSize: 14 }}><input type="checkbox" checked={cancelado} onChange={e => setCancelado(e.target.checked)} /> El folio se canceló (ticket anulado)</label>
          {!cancelado && (
            <>
              <div style={{ fontWeight: 600, margin: '6px 0' }}>Productos o servicios</div>
              {renglones.map((r, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 44px', gap: 6, marginBottom: 6 }}>
                  <input aria-label={`Descripción ${i + 1}`} placeholder="Descripción" value={r.descripcion} onChange={e => setRenglones(renglones.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} style={{ minHeight: 44 }} />
                  <input aria-label={`Cantidad ${i + 1}`} type="number" inputMode="numeric" min="1" value={r.cantidad} onChange={e => setRenglones(renglones.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} style={{ minHeight: 44 }} />
                  <button type="button" className="btn o" aria-label="Quitar renglón" disabled={renglones.length === 1} onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" className="btn o sm" onClick={() => setRenglones([...renglones, { descripcion: '', cantidad: 1 }])}><Plus size={13} style={{ verticalAlign: -2 }} /> Otro renglón</button>
              <FormField label="Monto total del ticket" type="number" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} />
            </>
          )}
          <FotoEnVivo titulo="Foto en vivo del ticket de papel" tipoOrigen="ticket_manual" origenId={id} sucursalId={sucursal} evidenciaId={evidencia} onFoto={setEvidencia} />
          <button className="btn" style={{ ...grande, width: '100%', marginTop: 10 }} disabled={ocupado} onClick={enviar}>{ocupado ? 'Guardando…' : 'Guardar ticket'}</button>
        </div>
      )}
      {(tal.data ?? []).length > 0 && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Avance de los talonarios</h3>
          {(tal.data ?? []).map(t => (
            <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #ddd)' }}>
              <b>{t.folio_inicial}–{t.folio_final}</b> <StatusBadge variante={t.estado === 'activo' ? 'v' : 'n'} label={NOMBRE_ESTADO_TALONARIO[t.estado]} />
              <div className="hint">{t.capturados} vendidos · {t.cancelados} cancelados{t.siguiente_sin_capturar ? ` · siguiente por capturar: ${t.siguiente_sin_capturar}` : ' · completo'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── caídas del sistema ─────────────────────────────
function Caidas({ sucursal }) {
  const qc = useQueryClient()
  const revisa = usePermiso('auditoria.investigar')
  const q = useQuery({ queryKey: ['ctl-caidas', sucursal], enabled: !!sucursal, retry: false, refetchInterval: 30000,
    queryFn: async () => { const r = await listarCaidas({ sucursalId: sucursal }); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] } })
  const abierta = (q.data ?? []).find(c => c.abierta)
  const [nota, setNota] = useState('')
  async function iniciar() {
    const r = await iniciarCaida({ sucursalId: sucursal })
    if (r.error) return toast.error(errMsg(r.error))
    toast(r.data.ya_abierta ? 'Ya había una caída abierta' : 'Caída registrada: use los tickets de papel'); qc.invalidateQueries({ queryKey: ['ctl-caidas'] })
  }
  async function cerrar() {
    const r = await cerrarCaida({ caidaId: abierta.id, nota: nota || null })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success(`Caída cerrada · ${r.data.tickets_manuales} ticket(s) de papel`); setNota(''); qc.invalidateQueries({ queryKey: ['ctl-caidas'] })
  }
  return (
    <div>
      <div className="card" style={{ padding: 14, maxWidth: 560, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}><WifiOff size={16} style={{ verticalAlign: -3 }} /> Caída del sistema</h3>
        {!abierta && <><div className="hint" style={{ marginBottom: 8 }}>Registre cuando el sistema se caiga y cuando regrese. Los tickets de papel de ese rato se ligan solos a la caída.</div>
          <button className="btn" style={{ ...grande, width: '100%' }} disabled={!sucursal} onClick={iniciar}>Se cayó el sistema</button></>}
        {abierta && <>
          <p style={{ margin: '0 0 8px' }}>Caída abierta desde <b>{fechaHora(abierta.inicio_en)}</b> ({duracionCaida(abierta.inicio_en)}). {abierta.tickets_manuales} ticket(s) de papel.</p>
          <FormField label="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} placeholder="Se cayó el internet" />
          <button className="btn" style={{ ...grande, width: '100%' }} onClick={cerrar}>Ya regresó el sistema</button></>}
      </div>
      <EstadoConsulta q={{ isLoading: q.isLoading, isError: q.isError, error: q.error, data: {} }} />
      {!q.isLoading && !q.isError && !(q.data ?? []).length && <EmptyState title="Sin caídas registradas" description="Cuando el sistema se caiga, aparecerá aquí con su hora de inicio y fin." />}
      {(q.data ?? []).length > 0 && (
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Inicio</th><th>Duración</th><th>Tickets de papel</th>{revisa && <th>Venta del periodo</th>}{revisa && <th>Contra lo normal</th>}<th>Nota</th></tr></thead>
          <tbody>{q.data.map(c => {
            const cmp = c.comparacion
            const prop = cmp ? (cmp.proporcion ?? proporcionVenta(Number(cmp.venta_sistema) + Number(cmp.venta_manual), cmp.venta_esperada)) : null
            return (
              <tr key={c.id}>
                <td>{fechaHora(c.inicio_en)}</td><td>{c.abierta ? <StatusBadge variante="a" label="abierta" /> : duracionCaida(c.inicio_en, c.fin_en)}</td><td>{c.tickets_manuales}</td>
                {revisa && <td>{cmp ? moneda(Number(cmp.venta_sistema) + Number(cmp.venta_manual)) : '—'}</td>}
                {revisa && <td>{prop == null ? <span className="hint">sin historia suficiente</span> : <span className={cmp.baja ? 'text-red' : ''}>{prop} % del promedio{cmp.baja ? ' · baja' : ''}</span>}</td>}
                <td>{c.nota ?? '—'}</td>
              </tr>)
          })}</tbody>
        </table></div>
      )}
      {revisa && <div className="hint" style={{ marginTop: 8 }}>La comparación usa las mismas horas del mismo día de la semana en las 8 semanas previas. Una sucursal que se cae seguido y vende menos en esos ratos genera una alerta: es un patrón para revisar, no una conclusión.</div>}
    </div>
  )
}

// ───────────────────────────── alta y lista de talonarios (oficina central) ─────────────────────────────
function ListaTalonarios({ sucursal }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['ctl-talonarios', 'todos'], retry: false, queryFn: async () => { const r = await resumenTalonarios(null); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] } })
  const sedes = useDatos(['ctl-sedes'], () => listar('v_ctl_sucursales', { limite: 100 }))
  const suc = useMemo(() => Object.fromEntries((sedes.data?.data ?? []).map(s => [s.id, s.nombre])), [sedes.data])
  const [alta, setAlta] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  async function guardarAlta() {
    const v = validarRangoTalonario(alta.inicial, alta.final, q.data ?? [])
    if (!v.ok) return toast.error(v.error)
    const r = await altaTalonario({ sucursalId: alta.sucursal, inicial: Number(alta.inicial), final: Number(alta.final), recibidoNombre: alta.recibio, nota: alta.nota || null })
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    toast.success('Talonario dado de alta'); setAlta(null); qc.invalidateQueries({ queryKey: ['ctl-talonarios'] })
  }
  async function hacerCancelar() {
    const r = await cancelarTalonario(cancelar.id, cancelar.motivo)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Talonario cancelado'); setCancelar(null); qc.invalidateQueries({ queryKey: ['ctl-talonarios'] })
  }
  return (
    <>
      <div style={{ margin: '8px 0' }}><button className="btn" onClick={() => setAlta({ sucursal, inicial: '', final: '', recibio: '', nota: '' })}><Plus size={14} style={{ verticalAlign: -2 }} /> Alta de talonario</button></div>
      {q.isError && <EmptyState title="No se pudo cargar" description={q.error.message} />}
      {!q.isLoading && !q.isError && !(q.data ?? []).length && <EmptyState title="Sin talonarios" description="Dé de alta el primer talonario de contingencia: rango de folios, sucursal, fecha de entrega y quién lo recibió." />}
      {(q.data ?? []).length > 0 && (
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Sucursal</th><th>Rango</th><th>Entregado</th><th>Recibió</th><th>Estado</th><th>Vendidos</th><th>Cancelados</th><th>Faltantes</th><th></th></tr></thead>
          <tbody>{q.data.map(t => (
            <tr key={t.id}>
              <td>{suc[t.sucursal_id] ?? '—'}</td><td><b>{t.folio_inicial}–{t.folio_final}</b></td><td>{fechaHora(t.entregado_en)}</td><td>{t.recibido_nombre ?? '—'}</td>
              <td><StatusBadge variante={t.estado === 'activo' ? 'v' : 'n'} label={NOMBRE_ESTADO_TALONARIO[t.estado]} /></td>
              <td>{t.capturados}</td><td>{t.cancelados}</td><td>{t.faltantes_marcados > 0 ? <span className="text-red">{t.faltantes_marcados}</span> : 0}</td>
              <td>{t.estado === 'activo' && <button className="btn o sm" onClick={() => setCancelar({ id: t.id, rango: `${t.folio_inicial}–${t.folio_final}`, motivo: '' })}>Cancelar</button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal open={!!alta} onClose={() => setAlta(null)} title="Alta de talonario" size="sm" footer={<><button className="btn o" onClick={() => setAlta(null)}>Cancelar</button><button className="btn" onClick={guardarAlta}>Dar de alta</button></>}>
        {alta && <>
          <SelectorSucursal value={alta.sucursal} onChange={v => setAlta({ ...alta, sucursal: v })} />
          <FormField label="Folio inicial" type="number" value={alta.inicial} onChange={e => setAlta({ ...alta, inicial: e.target.value })} />
          <FormField label="Folio final" type="number" value={alta.final} onChange={e => setAlta({ ...alta, final: e.target.value })} />
          <FormField label="Quién lo recibió" value={alta.recibio} onChange={e => setAlta({ ...alta, recibio: e.target.value })} />
          <FormField label="Nota (opcional)" value={alta.nota} onChange={e => setAlta({ ...alta, nota: e.target.value })} />
          <div className="hint">Tickets con copia al carbón: ningún folio puede desaparecer sin rastro. El rango no puede traslaparse con otro talonario.</div>
        </>}
      </Modal>
      <Modal open={!!cancelar} onClose={() => setCancelar(null)} title={`Cancelar talonario ${cancelar?.rango ?? ''}`} size="sm"
        footer={<><button className="btn o" onClick={() => setCancelar(null)}>No cancelar</button><button className="btn" disabled={(cancelar?.motivo ?? '').trim().length < 5} onClick={hacerCancelar}>Cancelar talonario</button></>}>
        {cancelar && <FormField label="Motivo" value={cancelar.motivo} onChange={e => setCancelar({ ...cancelar, motivo: e.target.value })} />}
      </Modal>
    </>
  )
}

// ───────────────────────────── auditoría del talonario ─────────────────────────────
function Auditar({ sucursal }) {
  const qc = useQueryClient()
  const tal = useTalonarios(sucursal)
  const [talonario, setTalonario] = useState('')
  const [siguiente, setSiguiente] = useState('')
  const [id, setId] = useState(() => nuevoId())
  const [evidencia, setEvidencia] = useState(null)
  const [res, setRes] = useState(null)
  const hist = useDatos(['ctl-auditorias-tal'], () => listarAuditoriasTalonario(null))
  const activos = (tal.data ?? []).filter(t => t.estado !== 'cancelado')
  async function enviar() {
    const r = await auditarTalonario({ id, talonarioId: talonario, siguiente: Number(siguiente), evidenciaId: evidencia })
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    setRes(r.data); qc.invalidateQueries({ queryKey: ['ctl-talonarios'] }); qc.invalidateQueries({ queryKey: ['ctl-auditorias-tal'] })
  }
  function otra() { setRes(null); setId(nuevoId()); setSiguiente(''); setEvidencia(null) }
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}><ClipboardList size={16} style={{ verticalAlign: -3 }} /> Auditar un talonario en la visita</h3>
        {!res && <>
          <div className="hint" style={{ marginBottom: 8 }}>Registre el <b>siguiente folio en blanco</b> con su foto. Si va en el 25, los folios del primero al 24 deben estar todos capturados (venta o cancelado); cualquier folio faltante o saltado abre un caso y avisa al dueño.</div>
          {!activos.length && <EmptyState title="Esta sucursal no tiene talonarios" description="Dé de alta uno en la pestaña Talonarios." />}
          {activos.length > 0 && <>
            <FormField label="Talonario" as="select" value={talonario} onChange={e => setTalonario(e.target.value)}
              options={[{ value: '', label: 'Seleccione…' }, ...activos.map(t => ({ value: t.id, label: `${t.folio_inicial}–${t.folio_final} · ${NOMBRE_ESTADO_TALONARIO[t.estado]}` }))]} />
            <FormField label="Siguiente folio en blanco" type="number" inputMode="numeric" value={siguiente} onChange={e => setSiguiente(e.target.value)} />
            <FotoEnVivo titulo="Foto del folio en blanco" tipoOrigen="talonario_auditoria" origenId={id} sucursalId={sucursal} evidenciaId={evidencia} onFoto={setEvidencia} />
            <button className="btn" style={{ ...grande, width: '100%', marginTop: 10 }} disabled={!talonario || !siguiente || !evidencia} onClick={enviar}>Registrar auditoría</button>
          </>}
        </>}
        {res && (
          <div role="status">
            {res.continuo
              ? <p><CheckCircle2 size={16} style={{ verticalAlign: -3, color: 'var(--green, #1a9d55)' }} /> <b>Continuo.</b> Todos los folios anteriores al {siguiente} están capturados.</p>
              : <p className="text-red"><ShieldAlert size={16} style={{ verticalAlign: -3 }} /> <b>No es continuo.</b>
                {res.faltantes?.length > 0 && <> Faltan por capturar los folios <b>{listaFolios(res.faltantes)}</b>.</>}
                {res.adelantados?.length > 0 && <> Ya están capturados folios posteriores al «en blanco»: <b>{listaFolios(res.adelantados)}</b>.</>}
                {res.caso_folio ? <> Se abrió el caso <b>{res.caso_folio}</b> y se avisó al dueño.</> : <> Ya estaban marcados por una auditoría anterior: no se abre otro caso.</>}</p>}
            <button className="btn" style={grande} onClick={otra}>Auditar otro</button>
          </div>
        )}
      </div>
      {(hist.data?.data ?? []).length > 0 && (
        <div className="tabla-wrap" style={{ marginTop: 12 }}><table className="tabla">
          <thead><tr><th>Cuándo</th><th>En blanco</th><th>Resultado</th><th>Faltantes</th></tr></thead>
          <tbody>{hist.data.data.map(a => (
            <tr key={a.id}><td>{fechaHora(a.creado_en)}</td><td>{a.siguiente_folio}</td><td>{a.continuo ? 'Continuo' : <span className="text-red">No continuo</span>}</td><td>{a.folios_faltantes?.length ? listaFolios(a.folios_faltantes) : '—'}</td></tr>))}</tbody>
        </table></div>
      )}
    </div>
  )
}
