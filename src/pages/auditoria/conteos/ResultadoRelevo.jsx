// Relevo de turno (F2.4): resultado del conteo de la custodia y aceptación de la entrega con PIN.
// EXCEPCIÓN documentada a la captura a ciegas: cuando la custodia NO cuadra, el servidor muestra la diferencia al entrante y al saliente
// (docs/AUDITORIA_ETAPA2.md §Decisiones). Es la única pantalla de sucursal con diferencias; aparece solo en un relevo que no cuadra.
// Mientras la entrega no se acepte, Caja bloquea las ventas del entrante (piefirme.ctl_entrega_pendiente).
import { useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { aceptarRelevo } from '../../../lib/auditoria/conteoApi'
import { mensajeError } from '../../../lib/auditoria/roles'

export default function ResultadoRelevo({ relevo, entregaId, saliente = false }) {
  const id = entregaId ?? relevo?.entrega_id
  const [pin, setPin] = useState('')
  const [estado, setEstado] = useState(null)    // resultado de aceptar
  const [ocupado, setOcupado] = useState(false)
  if (!relevo) return null
  const cuadra = !!relevo.cuadra
  const aceptar = async () => {
    if (!/^[0-9]{4,8}$/.test(pin)) return toast.error('Escribe tu PIN (4 a 8 dígitos).')
    setOcupado(true)
    const r = await aceptarRelevo(id, pin)
    setOcupado(false)
    if (r.error) return toast.error(mensajeError(r.error))
    if (!r.data?.ok) return toast.error(r.data?.mensaje ?? (r.data?.error === 'pin_incorrecto' ? `PIN incorrecto. Intentos restantes: ${r.data.intentos_restantes}` : 'No se pudo aceptar la entrega.'))
    setEstado(r.data); setPin('')
    toast.success(r.data.firmo === 'saliente' ? 'Firma registrada' : 'Entrega aceptada: ya puedes vender')
  }
  return (
    <div className="card" style={{ borderColor: cuadra ? 'var(--ok, #2e8b57)' : 'var(--danger, #c0392b)' }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>
        {cuadra ? <><CheckCircle2 size={20} style={{ verticalAlign: -3, color: 'var(--ok, #2e8b57)' }} /> La custodia cuadra</>
                : <><AlertTriangle size={20} style={{ verticalAlign: -3, color: 'var(--danger, #c0392b)' }} /> La custodia no cuadra</>}
      </div>
      {!cuadra && (
        <table style={{ width: '100%', marginTop: 10, fontSize: 14 }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Producto</th><th style={{ textAlign: 'right' }}>Contado</th><th style={{ textAlign: 'right' }}>Diferencia</th></tr></thead>
          <tbody>
            {(relevo.diferencias ?? []).map(d => (
              <tr key={d.producto_id}>
                <td>{d.descripcion}</td>
                <td style={{ textAlign: 'right' }}>{d.no_reportado ? 'Sin contar' : d.contado}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.no_reportado ? '—' : (Number(d.diferencia_relevo) > 0 ? `+${d.diferencia_relevo}` : d.diferencia_relevo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!cuadra && <div className="hint" style={{ marginTop: 8 }}>Se abrieron casos «diferencia de relevo» con los dos turnos y se avisó al dueño. Entrante y saliente firman con su PIN.</div>}
      {estado ? (
        <div style={{ marginTop: 10, fontWeight: 700 }}>{estado.firmo === 'saliente' ? 'Firma del saliente registrada.' : 'Entrega aceptada.'}</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="field"><label>{saliente ? 'PIN del saliente (firma)' : 'Tu PIN para aceptar la entrega'}</label>
            <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} style={{ fontSize: 22, minHeight: 52, letterSpacing: 6 }} data-testid="pin-relevo" /></div>
          <button className="btn" style={{ width: '100%', minHeight: 56, fontSize: 18, fontWeight: 800, marginTop: 8 }} disabled={ocupado || !id} onClick={aceptar}>
            {ocupado ? 'Validando…' : saliente ? 'Firmar como saliente' : cuadra ? 'Aceptar la entrega' : 'Aceptar la entrega con la diferencia'}</button>
        </div>
      )}
    </div>
  )
}
