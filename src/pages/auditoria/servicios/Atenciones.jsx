// Atenciones (captura): toda atención abre un registro con referencia OPACA del paciente, quien atiende, sucursal, servicio y hora; NO se cierra sin ticket y
// cancelarla exige motivo y la clave de un supervisor. El piloto NO guarda nota clínica (sin datos sensibles de salud: LFPDPPP). La hora la pone el servidor.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Link2, XCircle, RefreshCw } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { leer } from '../../../lib/api'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import { fechaHora } from '../../../lib/formato'
import { abrirAtencion, listarAtenciones, ticketsCandidatos, cerrarAtencionConTicket, supervisoresDe, cancelarAtencion, conciliarAtenciones } from '../../../lib/auditoria/serviciosApi'
import { ESTADOS_ATENCION, validarReferencia, validarCancelacion, horasMinutos } from '../../../lib/auditoria/servicios'
import { errMsg } from '../comun'

const consulta = (key, fn) => ({ queryKey: key, queryFn: async () => { const r = await fn(); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })
const VARIANTE = { abierta: 'a', cerrada_con_ticket: 'v', cancelada: 'n' }

export default function Atenciones() {
  const { sedes, sedeActivaId, user } = useApp()
  const qc = useQueryClient()
  const revisa = usePermiso('auditoria.investigar')
  const [sucursal, setSucursal] = useState(sedeActivaId || sedes[0]?.id || '')
  const [soloMias, setSoloMias] = useState(false)
  const [nueva, setNueva] = useState(false)
  const [cerrando, setCerrando] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const q = useQuery({ ...consulta(['ctl-atenciones', sucursal, soloMias], () => listarAtenciones({ sucursal: sucursal || null, solo_mias: soloMias, limite: 200 })), refetchInterval: 60000 })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ctl-atenciones'] })
  const conciliar = async () => {
    const r = await conciliarAtenciones(sucursal || null)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success(r.data.ligadas ? `${r.data.ligadas} atención(es) ligada(s) a su ticket` : 'No había atenciones por ligar'); refrescar()
  }
  const columnas = [
    { key: 'inicio_en', label: 'Inicio', render: f => fechaHora(f.inicio_en), valor: f => f.inicio_en },
    { key: 'fin_en', label: 'Cierre', render: f => (f.fin_en ? fechaHora(f.fin_en) : f.minutos_abierta != null ? <span className="hint">abierta {horasMinutos(f.minutos_abierta)}</span> : '—'), valor: f => f.fin_en ?? '' },
    { key: 'sucursal', label: 'Sucursal', filtro: true },
    { key: 'servicio', label: 'Servicio', filtro: true },
    { key: 'atiende', label: 'Atiende', filtro: true },
    { key: 'paciente_ref', label: 'Ref. paciente' },
    { key: 'estado', label: 'Estado', render: f => <StatusBadge variante={VARIANTE[f.estado]} label={ESTADOS_ATENCION[f.estado]} />, valor: f => ESTADOS_ATENCION[f.estado] },
    { key: 'ticket', label: 'Ticket', render: f => f.ticket ?? (f.estado === 'cancelada' ? <span className="hint" title={f.motivo_cancelacion}>cancelada · autorizó {f.autorizo}</span> : '—') },
    ...(revisa ? [{ key: 'sin_ticket', label: 'Sin ticket', render: f => (f.sin_ticket ? <b className="text-red">Sí</b> : ''), valor: f => (f.sin_ticket ? 'Sí' : 'No') }] : []),
    { key: 'acc', label: '', exportar: false, sortable: false, render: f => f.estado === 'abierta' && (
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn sm" onClick={() => setCerrando(f)}><Link2 size={13} style={{ verticalAlign: -2 }} /> Ticket</button>
        <button className="btn o sm" onClick={() => setCancelando(f)}><XCircle size={13} style={{ verticalAlign: -2 }} /> Cancelar</button>
      </div>) },
  ]
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <FormField label="Sucursal" as="select" placeholder="Todas" value={sucursal} onChange={e => setSucursal(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={soloMias} onChange={e => setSoloMias(e.target.checked)} /> Solo las que atiendo</label>
        <button className="btn" onClick={() => setNueva(true)}><Plus size={14} style={{ verticalAlign: -2 }} /> Nueva atención</button>
        <button className="btn o" onClick={conciliar} title="Liga con su ticket las atenciones nacidas de una consulta cuyo cobro ya se hizo"><RefreshCw size={14} style={{ verticalAlign: -2 }} /> Ligar las ya cobradas</button>
      </div>
      <div className="hint" style={{ marginBottom: 8 }}>La atención <b>no se cierra sin su ticket</b> de cobro; cancelarla exige motivo y la clave de un supervisor. No se captura nombre ni nota clínica: solo una referencia opaca.</div>
      {q.isLoading && <div className="card">Cargando…</div>}
      {q.isError && <div className="card">{q.error.message}</div>}
      {q.data && <DataTable columnas={columnas} filas={q.data} exportarNombre="atenciones" vacio={{ title: 'Sin atenciones', description: 'No hay atenciones en los últimos 7 días con este filtro.' }} />}
      {nueva && <NuevaAtencion sedes={sedes} sucursalInicial={sucursal} usuarioId={user?.id} onClose={() => { setNueva(false); refrescar() }} />}
      {cerrando && <CerrarConTicket atencion={cerrando} onClose={() => { setCerrando(null); refrescar() }} />}
      {cancelando && <Cancelar atencion={cancelando} usuarioId={user?.id} onClose={() => { setCancelando(null); refrescar() }} />}
    </>
  )
}

function NuevaAtencion({ sedes, sucursalInicial, usuarioId, onClose }) {
  const [f, setF] = useState({ sucursalId: sucursalInicial || sedes[0]?.id || '', servicioId: '', pacienteRef: '', atiendeId: usuarioId ?? '' })
  const [ocupado, setOcupado] = useState(false)
  const servicios = useQuery({ queryKey: ['ctl-srv-servicios'], queryFn: async () => (await leer('servicios', { sedeCol: false, columnas: 'id,nombre,categoria', orden: [{ columna: 'nombre', asc: true }], limite: 500 })).data ?? [], retry: false })
  const usuarios = useQuery({ queryKey: ['ctl-srv-usuarios'], queryFn: async () => (await leer('v_ctl_usuarios', { sedeCol: false, limite: 500 })).data ?? [], retry: false })
  const gente = useMemo(() => (usuarios.data ?? []).filter(u => u.activo && (!u.sucursales?.length || u.sucursales.includes(f.sucursalId))), [usuarios.data, f.sucursalId])
  const ref = validarReferencia(f.pacienteRef)
  async function guardar() {
    setOcupado(true)
    const r = await abrirAtencion({ sucursalId: f.sucursalId, servicioId: f.servicioId, pacienteRef: ref.ref, atiendeId: f.atiendeId })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Atención abierta'); onClose()
  }
  return (
    <Modal open onClose={onClose} title="Nueva atención" size="sm"
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.sucursalId || !f.servicioId || !ref.ok} onClick={guardar}>Abrir atención</button></>}>
      <FormField label="Sucursal" as="select" value={f.sucursalId} onChange={e => setF({ ...f, sucursalId: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      <FormField label="Tipo de servicio" required as="select" value={f.servicioId} onChange={e => setF({ ...f, servicioId: e.target.value })} options={(servicios.data ?? []).map(s => ({ value: s.id, label: `${s.nombre} · ${s.categoria}` }))} />
      <FormField label="Quién atiende" as="select" value={f.atiendeId} onChange={e => setF({ ...f, atiendeId: e.target.value })} options={gente.map(u => ({ value: u.id, label: u.nombre }))} />
      <FormField label="Referencia del paciente (opcional)" value={f.pacienteRef} onChange={e => setF({ ...f, pacienteRef: e.target.value })} error={ref.ok ? null : ref.error}
        hint="Un número de ficha o folio; nunca el nombre ni datos clínicos. Si la deja vacía, el sistema asigna una." />
    </Modal>
  )
}

function CerrarConTicket({ atencion, onClose }) {
  const q = useQuery({ queryKey: ['ctl-candidatos', atencion.id], queryFn: async () => { const r = await ticketsCandidatos(atencion.id); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })
  const [ocupado, setOcupado] = useState(false)
  async function ligar(t) {
    setOcupado(true)
    const r = await cerrarAtencionConTicket({ atencionId: atencion.id, ticketId: t.venta_id })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success(`Atención cerrada con el ticket ${r.data.ticket}`); onClose()
  }
  return (
    <Modal open onClose={onClose} title="Cerrar la atención con su ticket" size="sm" footer={<button className="btn o" onClick={onClose}>Salir</button>}>
      <div className="hint" style={{ marginBottom: 8 }}>{atencion.servicio} · {atencion.paciente_ref} · iniciada {fechaHora(atencion.inicio_en)}. Elija el ticket cobrado de esta sucursal que contiene el servicio.</div>
      {q.isLoading && <div>Buscando tickets…</div>}
      {q.isError && <div className="text-red">{q.error.message}</div>}
      {q.data && !q.data.length && <div className="hint">No hay tickets cobrados de esta sucursal con un servicio compatible y libre. Cobre primero el servicio en Caja; la atención no se cierra sin ticket.</div>}
      {(q.data ?? []).map(t => (
        <div key={t.venta_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border, #ddd)' }}>
          <div><b>{t.ticket}</b><div className="hint">cobrado {fechaHora(t.cobrada_en)} · {Number(t.servicios)} servicio(s)</div></div>
          <button className="btn sm" disabled={ocupado} onClick={() => ligar(t)}>Ligar</button>
        </div>))}
    </Modal>
  )
}

function Cancelar({ atencion, usuarioId, onClose }) {
  const [motivo, setMotivo] = useState('')
  const [sup, setSup] = useState('')
  const [pin, setPin] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const sups = useQuery({ queryKey: ['ctl-supervisores', atencion.sucursal_id], queryFn: async () => { const r = await supervisoresDe(atencion.sucursal_id); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })
  const v = validarCancelacion({ motivo, supervisorId: sup, usuarioId, pin })
  async function cancelar() {
    setOcupado(true)
    const r = await cancelarAtencion({ atencionId: atencion.id, motivo: v.motivo, supervisorId: sup, pin })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error))
    if (!r.data?.ok) { setPin(''); return toast.error(r.data?.mensaje ?? 'Clave de supervisor incorrecta') }
    toast.success('Atención cancelada'); onClose()
  }
  return (
    <Modal open onClose={onClose} title="Cancelar la atención" size="sm"
      footer={<><button className="btn o" onClick={onClose}>No cancelar</button><button className="btn" disabled={!v.ok || ocupado} onClick={cancelar}>Cancelar con clave de supervisor</button></>}>
      <div className="hint" style={{ marginBottom: 8 }}>{atencion.servicio} · {atencion.paciente_ref}. Quien cancela deja el motivo y un supervisor (otra persona) lo autoriza con su PIN.</div>
      <FormField label="Motivo" required as="textarea" rows={3} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} />
      <FormField label="Supervisor que autoriza" required as="select" value={sup} onChange={e => setSup(e.target.value)} options={(sups.data ?? []).map(s => ({ value: s.id, label: s.nombre }))} />
      <FormField label="PIN del supervisor" required type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      {!v.ok && (motivo || sup || pin) && <div className="hint">{v.error}</div>}
    </Modal>
  )
}
