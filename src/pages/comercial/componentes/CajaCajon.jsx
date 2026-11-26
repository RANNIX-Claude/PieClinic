// «Abrir cajón (sin venta)» (Etapa 1, F1.5). En una web no hay hardware de cajón: aquí se REGISTRAN las aperturas manuales (usuario, caja, hora del servidor y motivo
// opcional) y se emite cajon_abierto_sin_venta. El pulso real de la impresora/cajón que no venga de un ticket llamará a la misma RPC con origen «hardware».
// Un ticket en efectivo abre el cajón por su cuenta y no se reporta aquí.
import { useState } from 'react'
import { Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../../components/ui/Modal'
import { abrirCajon, nuevoId } from '../../../lib/comercial/cajaControl'
import { textoError } from './comun'

export default function CajaCajon({ sedeId, turno, deshabilitado = false }) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [id, setId] = useState(nuevoId)   // un reintento del mismo clic no registra dos aperturas
  const registrar = async () => {
    setOcupado(true)
    const { data, error } = await abrirCajon({ sucursalId: sedeId, caja: turno?.caja ?? null, motivo: motivo.trim() || null, id })
    setOcupado(false)
    if (error || !data?.ok) return toast.error(textoError(error) || 'No se pudo registrar la apertura')
    toast.success('Apertura registrada: abre el cajón')
    setAbierto(false); setMotivo(''); setId(nuevoId())
  }
  return (
    <>
      <button type="button" className="btn o" disabled={deshabilitado} onClick={() => setAbierto(true)} title="Registra una apertura del cajón que no viene de un ticket"><Inbox size={14} style={{ verticalAlign: -2 }} /> Abrir cajón (sin venta)</button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Abrir cajón (sin venta)" size="sm"
        footer={<><button type="button" className="btn o" onClick={() => setAbierto(false)}>Cancelar</button><button type="button" className="btn" disabled={ocupado} onClick={registrar}>{ocupado ? 'Registrando…' : 'Registrar y abrir'}</button></>}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Cada apertura sin ticket queda registrada con tu nombre, la caja, la fecha y la hora. El motivo es opcional.</div>
        <div className="field"><label>Motivo (opcional)</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Dar cambio, guardar un retiro…" autoFocus /></div>
      </Modal>
    </>
  )
}
