// Entregas de turno pendientes (doble firma). Quien RECIBE cuenta el efectivo por denominación (sin ver cuánto le entregaron), firma con su PIN y,
// si lo contado coincide con lo entregado, ese monto es el fondo inicial de su turno. Si no coincide se le muestra la diferencia y se abre un caso.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, ShieldCheck } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import EmptyState from '../../../components/ui/EmptyState'
import { moneda, fechaHora } from '../../../lib/formato'
import { entregasPendientes, aceptarEntrega, liberarEntrega } from '../../../lib/auditoria/apiCierres'
import { DENOMINACIONES, totalDenominaciones } from '../../../lib/auditoria/cierres'
import { usePermiso } from '../../../lib/permisos'
import { errMsg } from '../comun'

export default function Entregas() {
  const qc = useQueryClient()
  const puedeLiberar = usePermiso('auditoria.investigar')
  const q = useQuery({ queryKey: ['ctl-entregas'], queryFn: async () => { const r = await entregasPendientes(); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] }, retry: false, refetchInterval: 30000 })
  const [firmando, setFirmando] = useState(null)
  const [liberando, setLiberando] = useState(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ctl-entregas'] })
  if (q.isLoading) return <div className="card">Cargando…</div>
  if (q.isError) return <EmptyState title="No se pudo cargar" description={q.error.message} />
  if (!q.data.length) return <EmptyState title="Sin entregas pendientes" description="No hay entregas de turno por aceptar en tus sucursales." />
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
      <div className="hint">Mientras una entrega siga pendiente, la sucursal <b>no puede vender</b>. Cuente el efectivo del cajón antes de aceptar.</div>
      {q.data.map(e => (
        <div key={e.id} className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700 }}>{e.sucursal} · {e.folio}</div>
          <div className="hint">Entrega: {e.entrega} · {fechaHora(e.entregado_en)} · hace {e.horas} h</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {e.puede_aceptar
              ? <button className="btn" style={{ padding: '12px 18px', fontSize: 15 }} onClick={() => setFirmando(e)}><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> Contar y aceptar</button>
              : <span className="hint">Usted entregó este turno: lo acepta la persona que recibe.</span>}
            {puedeLiberar && <button className="btn o" onClick={() => setLiberando(e)}>Liberar sin aceptación…</button>}
          </div>
        </div>
      ))}
      {firmando && <Firma entrega={firmando} onClose={() => { setFirmando(null); refrescar() }} />}
      {liberando && <Liberar entrega={liberando} onClose={() => { setLiberando(null); refrescar() }} />}
    </div>
  )
}

function Firma({ entrega, onClose }) {
  const [cant, setCant] = useState({})
  const [pin, setPin] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [res, setRes] = useState(null)
  const desglose = DENOMINACIONES.map(d => ({ denominacion: d, cantidad: Number(cant[d] || 0) }))
  const total = totalDenominaciones(desglose)

  async function aceptar() {
    setOcupado(true)
    const r = await aceptarEntrega({ entregaId: entrega.id, pin, denominaciones: desglose })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error))
    if (!r.data.ok) return toast.error(r.data.mensaje ?? 'No se pudo aceptar')
    setRes(r.data)
  }
  if (res) {
    return (
      <Modal open title="Entrega aceptada" onClose={onClose} size="sm" footer={<button className="btn" onClick={onClose}>Listo</button>}>
        {res.cuadra
          ? <p>Cuadra. El fondo inicial de su turno es <b>{moneda(res.fondo_inicial)}</b>. Ya puede vender.</p>
          : <><p className="text-red"><b>No cuadra.</b> Se le entregaron {moneda(res.monto_entregado)} y usted contó {moneda(res.fondo_inicial)}: diferencia {moneda(res.diferencia)}.</p>
            <p>Se abrió un caso y se avisó al dueño. El fondo inicial de su turno queda en lo que usted contó ({moneda(res.fondo_inicial)}).</p></>}
      </Modal>
    )
  }
  return (
    <Modal open title={`Recibir turno · ${entrega.sucursal}`} onClose={onClose} cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || pin.length < 4} onClick={aceptar}>{ocupado ? 'Firmando…' : 'Firmar con mi PIN y aceptar'}</button></>}>
      <div className="hint" style={{ marginBottom: 8 }}>Cuente el efectivo del cajón. No se le muestra cuánto se entregó: usted confirma lo que contó.</div>
      {DENOMINACIONES.map(d => (
        <div key={d} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <b>{moneda(d)}</b>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className="btn o" style={{ minWidth: 44, minHeight: 44 }} aria-label={`Quitar ${d}`} onClick={() => setCant({ ...cant, [d]: Math.max(0, Number(cant[d] || 0) - 1) })}><Minus size={14} /></button>
            <input inputMode="numeric" aria-label={`Cantidad de ${d}`} value={cant[d] ?? ''} placeholder="0" style={{ width: 70, textAlign: 'center', fontSize: 18, minHeight: 44 }} onChange={e => setCant({ ...cant, [d]: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
            <button type="button" className="btn o" style={{ minWidth: 44, minHeight: 44 }} aria-label={`Agregar ${d}`} onClick={() => setCant({ ...cant, [d]: Number(cant[d] || 0) + 1 })}><Plus size={14} /></button>
          </div>
          <div style={{ textAlign: 'right' }} className="hint">{moneda(d * Number(cant[d] || 0))}</div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border, #ddd)', paddingTop: 8, marginTop: 8, fontSize: 18 }}><b>Total que contó</b><b>{moneda(total)}</b></div>
      <div className="field" style={{ marginTop: 12 }}><label className="req">Su PIN</label>
        <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} /></div>
    </Modal>
  )
}

function Liberar({ entrega, onClose }) {
  const [motivo, setMotivo] = useState('')
  async function liberar() {
    const r = await liberarEntrega(entrega.id, motivo)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Entrega liberada: la sucursal ya puede vender'); onClose()
  }
  return (
    <Modal open title="Liberar sin aceptación" onClose={onClose} size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={!motivo.trim()} onClick={liberar}>Liberar</button></>}>
      <p style={{ fontSize: 13 }}>La entrega de <b>{entrega.folio}</b> sigue sin aceptar. Liberarla permite vender, deja el cierre marcado como «entrega no aceptada» y avisa al dueño.</p>
      <div className="field"><label className="req">Motivo</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por qué no se aceptó" /></div>
    </Modal>
  )
}
