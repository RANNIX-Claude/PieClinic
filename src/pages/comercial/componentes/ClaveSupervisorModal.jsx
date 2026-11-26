// Clave de un supervisor (o del dueño) para un descuento sobre el tope o para un precio cotizado (Etapa 1, F1.1). La persona elige QUIÉN autoriza y esa persona teclea su
// PIN: queda registrado el autorizador en la línea del ticket. 3 claves incorrectas bloquean 15 minutos a quien las pide. No muestra saldos ni diferencias.
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import { autorizarCaja } from '../../../lib/comercial/cajaControl'
import { textoError } from './comun'

export default function ClaveSupervisorModal({ open, tipo = 'descuento', pct = null, motivoInicial = '', autorizadores = [], sedeId = null, onAutorizado, onClose }) {
  const [autorizador, setAutorizador] = useState('')
  const [pin, setPin] = useState('')
  const [motivo, setMotivo] = useState(motivoInicial)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (open) { setMotivo(motivoInicial); setPin(''); setError(null); setAutorizador(a => a || autorizadores[0]?.id || '') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async e => {
    e?.preventDefault()
    setOcupado(true); setError(null)
    const { data, error: err } = await autorizarCaja({ tipo, autorizadorId: autorizador, pin, pct: tipo === 'descuento' ? Number(pct) : null, motivo, sedeId })
    setOcupado(false)
    if (err) { setError(textoError(err)); return }
    if (!data?.ok) { setError(data?.mensaje || 'No se pudo autorizar.'); setPin(''); return }
    setPin('')
    onAutorizado?.(data.id)
  }
  const titulo = tipo === 'precio' ? 'Clave de supervisor · precio cotizado' : 'Clave de supervisor · descuento'
  return (
    <Modal open={open} onClose={onClose} title={titulo} size="sm"
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn" disabled={ocupado || !autorizador || pin.length < 4 || !motivo.trim()} onClick={enviar}>{ocupado ? 'Validando…' : 'Autorizar'}</button></>}>
      <form onSubmit={enviar}>
        <div style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 10 }}><ShieldCheck size={18} color="var(--accent)" />
          <span>{tipo === 'precio' ? 'El precio cotizado necesita la clave de un supervisor o del dueño.' : `Un descuento de ${Number(pct).toFixed(1)} % rebasa el tope sin clave.`} Queda registrado quién autoriza. La autorización dura 10 minutos.</span></div>
        {autorizadores.length === 0 && <div className="text-red" style={{ fontSize: 12.5, marginBottom: 8 }}>No hay supervisores ni dueños con PIN para esta sucursal.</div>}
        <div className="field"><label className="req">¿Quién autoriza?</label>
          <select value={autorizador} onChange={e => setAutorizador(e.target.value)} aria-label="Quién autoriza">
            {autorizadores.map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.rol === 'administrador' ? 'dueño' : 'supervisor'}</option>)}
          </select></div>
        <div className="field"><label className="req">Su PIN personal</label>
          <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} autoFocus aria-label="PIN del supervisor" /></div>
        <div className="field"><label className="req">Motivo</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tipo === 'precio' ? 'Cotización acordada con el cliente' : 'Motivo del descuento'} /></div>
        {error && <div className="text-red" role="alert" style={{ fontSize: 12.5 }}>{error}</div>}
      </form>
    </Modal>
  )
}
