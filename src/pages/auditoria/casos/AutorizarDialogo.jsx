// Autorizar (o reintentar) el ajuste de un caso: exige la CONTRASEÑA completa de la cuenta (re-autenticación). El PIN no sirve: es una concesión del mostrador
// para capturar, no para autorizar. El servidor valida además la separación de funciones y bloquea tras 3 fallos.
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import { moneda } from '../../../lib/formato'
import { deltaDelAjuste, NOMBRE_RESPONSABLE, AVISO_EMPLEADO } from '../../../lib/auditoria/casoReglas'

export default function AutorizarDialogo({ open, caso, par, reintento = false, ocupado, mensaje, onConfirmar, onCancelar }) {
  const [clave, setClave] = useState('')
  if (!caso) return null
  const d = deltaDelAjuste(caso.cantidad), dp = par ? deltaDelAjuste(par.cantidad) : null
  const cerrar = () => { setClave(''); onCancelar?.() }
  const confirmar = async () => { const r = await onConfirmar?.(clave); if (r !== false) setClave('') }
  return (
    <Modal open={open} onClose={cerrar} title={reintento ? 'Reintentar el ajuste' : 'Autorizar el ajuste de inventario'} size="sm" cerrarAlClicFuera={false}
      footer={<>
        <button type="button" className="btn o" onClick={cerrar} disabled={ocupado}>Cancelar</button>
        <button type="button" className="btn" disabled={!clave || ocupado} onClick={confirmar}>
          <ShieldCheck size={14} /> {ocupado ? 'Aplicando…' : reintento ? 'Reintentar ajuste' : 'Autorizar y aplicar'}</button>
      </>}>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, display: 'grid', gap: 8 }}>
        <div><b>{caso.folio}</b> · {caso.producto?.descripcion ?? '—'}<br />{d.texto}.
          {par ? <><br /><b>{par.folio}</b> · {par.producto}: {dp.texto}. Se aplican <b>los dos</b> ajustes o ninguno.</> : null}</div>
        <div>Causa: <b>{caso.causa ?? '—'}</b> · Absorbe: <b>{NOMBRE_RESPONSABLE[caso.responsable_costo] ?? '—'}</b> · Monto al costo: <b>{moneda(caso.monto_costo)}</b></div>
        {caso.responsable_costo === 'empleado' && <div className="hint">{AVISO_EMPLEADO}</div>}
        <div className="hint">Para autorizar se pide <b>su contraseña completa</b> (no el PIN). Al confirmar, el módulo pide el ajuste al origen y guarda el movimiento resultante.</div>
        <div className="field"><label className="req">Contraseña</label>
          <input type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && clave && !ocupado) confirmar() }} /></div>
        {mensaje && <div role="alert" className="hint" style={{ color: 'var(--danger, #c0392b)' }}>{mensaje}</div>}
      </div>
    </Modal>
  )
}
