import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Modal de captura (clases .modal-* de theme.css).
 * <Modal open={abierto} onClose={...} title="Nuevo paciente" size="wide" footer={<>…botones…</>}>…</Modal>
 * size: 'md' (760 px, por defecto) | 'wide' (1000 px) | 'sm' (460 px)
 * Cierra con Esc y clic en el fondo (cerrarAlClicFuera=false lo evita en formularios largos).
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md', cerrarAlClicFuera = true }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previo }
  }, [open, onClose])
  if (!open) return null
  const ancho = size === 'sm' ? 460 : undefined
  return createPortal(
    <div className="modal-overlay montado" onMouseDown={e => { if (cerrarAlClicFuera && e.target === e.currentTarget) onClose?.() }}>
      <div className={`modal-box${size === 'wide' ? ' wide' : ''}`} style={ancho ? { maxWidth: ancho } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
