// Mi PIN. Cada persona define su PIN personal (4 a 8 dígitos). Se teclea al cobrar y al autorizar descuentos o devoluciones
// como supervisor; así queda registrado quién cobró. El PIN no se guarda en claro. Migración 073 (definir_pin_personal).
import { useState } from 'react'
import toast from 'react-hot-toast'
import { ShieldCheck } from 'lucide-react'
import { rpc } from '../../../lib/api'
import PageHeader from '../../../components/ui/PageHeader'
import FormField from '../../../components/ui/FormField'
import { errMsg } from './comun'

export default function MiPin() {
  const [pin, setPin] = useState('')
  const [otra, setOtra] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const valido = /^[0-9]{4,8}$/.test(pin) && pin === otra

  async function guardar() {
    setOcupado(true)
    const r = await rpc('definir_pin_personal', { p_pin: pin })
    setOcupado(false)
    if (r.error) { toast.error(errMsg(r.error), { duration: 6000 }); return }
    toast.success('PIN guardado')
    setPin(''); setOtra('')
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Mi PIN" subtitulo="Tu firma personal al cobrar y al autorizar. No lo compartas." />
      <div className="card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> Definir o cambiar mi PIN</h3>
        <FormField label="Nuevo PIN (4 a 8 dígitos)" type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        <FormField label="Repite el PIN" type="password" inputMode="numeric" value={otra} onChange={e => setOtra(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        {otra && pin !== otra && <div className="hint" style={{ color: 'var(--red)' }}>Los PIN no coinciden.</div>}
        <div className="hint" style={{ marginBottom: 10 }}>Tres intentos fallidos bloquean la firma durante 15 minutos.</div>
        <button className="btn" disabled={!valido || ocupado} onClick={guardar}>Guardar PIN</button>
      </div>
    </div>
  )
}
