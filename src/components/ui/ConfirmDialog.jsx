import { useState, useCallback, useRef } from 'react'
import Modal from './Modal'

/**
 * Diálogo de confirmación para acciones que no se pueden deshacer (cancelar venta, anular, retirar foto…).
 * <ConfirmDialog open titulo="Cancelar venta" mensaje="…" textoConfirmar="Cancelar venta" peligro onConfirm={…} onCancel={…} />
 * `pedirMotivo` agrega un campo de texto obligatorio y lo pasa a onConfirm(motivo).
 */
export default function ConfirmDialog({ open, titulo = 'Confirmar', mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', peligro, pedirMotivo, ocupado, onConfirm, onCancel }) {
  const [motivo, setMotivo] = useState('')
  const listo = !pedirMotivo || motivo.trim().length >= 3
  return (
    <Modal open={open} onClose={onCancel} title={titulo} size="sm"
      footer={<>
        <button type="button" className="btn o" onClick={onCancel} disabled={ocupado}>{textoCancelar}</button>
        <button type="button" className={`btn${peligro ? ' red' : ''}`} disabled={!listo || ocupado}
          onClick={() => { onConfirm?.(pedirMotivo ? motivo.trim() : undefined); setMotivo('') }}>{ocupado ? 'Procesando…' : textoConfirmar}</button>
      </>}>
      {mensaje && <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{mensaje}</div>}
      {pedirMotivo && (
        <div className="field"><label className="req">Motivo</label>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Escribe el motivo (queda en la bitácora)" /></div>
      )}
    </Modal>
  )
}

/**
 * Versión con promesa:
 *   const { confirmar, dialogo } = useConfirmacion()
 *   if (await confirmar({ titulo, mensaje, peligro })) { … }      // y renderiza {dialogo} en el JSX
 */
export function useConfirmacion() {
  const [estado, setEstado] = useState(null)
  const resolver = useRef(null)
  const confirmar = useCallback(opts => new Promise(res => { resolver.current = res; setEstado(opts) }), [])
  const cerrar = v => { resolver.current?.(v); setEstado(null) }
  const dialogo = <ConfirmDialog open={!!estado} {...(estado ?? {})} onConfirm={m => cerrar(estado?.pedirMotivo ? m : true)} onCancel={() => cerrar(false)} />
  return { confirmar, dialogo }
}
