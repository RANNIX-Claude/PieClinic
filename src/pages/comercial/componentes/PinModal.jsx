// Autorización con PIN de Administrador (descuento > 10 %, sobrecupo, diferencia de corte). RPC autorizar_con_pin → id de autorización.
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import { rpc } from '../../../lib/api'
import { textoError } from './comun'

export default function PinModal({ open, tipo, titulo = 'Autorización del Administrador', descripcion, motivoInicial = '', pctMax = null, detalle = {}, onAutorizado, onClose }) {
  const [pin, setPin] = useState('')
  const [motivo, setMotivo] = useState(motivoInicial)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const enviar = async e => {
    e?.preventDefault()
    setOcupado(true); setError(null)
    const { data, error: err } = await rpc('autorizar_con_pin', { p_pin: pin, p_tipo: tipo, p_motivo: motivo, p_pct_max: pctMax, p_detalle: detalle })
    setOcupado(false)
    if (err) { setError(/pin/i.test(err.message) ? 'PIN incorrecto o bloqueado temporalmente.' : textoError(err)); return }
    setPin('')
    onAutorizado?.(data)
  }
  return (
    <Modal open={open} onClose={onClose} title={titulo} size="sm"
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={ocupado || pin.length < 4 || !motivo.trim()} onClick={enviar}>{ocupado ? 'Validando…' : 'Autorizar'}</button></>}>
      <form onSubmit={enviar}>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 10 }}><ShieldCheck size={18} color="var(--accent)" /><span>{descripcion ?? 'Pide al Administrador que teclee su PIN. La autorización dura 10 minutos y queda en bitácora.'}</span></div>
        <div className="field"><label className="req">PIN del Administrador</label><input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} autoFocus /></div>
        <div className="field"><label className="req">Motivo</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Cortesía, promoción, cliente frecuente…" /></div>
        {error && <div className="text-red" role="alert" style={{ fontSize: 12.5 }}>{error}</div>}
      </form>
    </Modal>
  )
}
