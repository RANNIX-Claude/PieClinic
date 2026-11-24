import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/**
 * Firma en pantalla (canvas, dedo/lápiz/mouse). Para consentimientos, aviso de privacidad y cierre de consulta.
 *
 *   const ref = useRef()
 *   <FirmaPad ref={ref} alto={160} onChange={firmada => setHayFirma(firmada)} />
 *   const png = ref.current.toDataURL()        // data:image/png;base64,… (null si está vacía)
 *   const blob = await ref.current.toBlob()    // para subir a storage (bucket documentos)
 *   ref.current.limpiar()
 *
 * La firma es solo el trazo: la inmutabilidad, IP, dispositivo y huella los registra la BD/RPC (P-142).
 */
const FirmaPad = forwardRef(function FirmaPad({ alto = 160, onChange, disabled, etiqueta = 'Firma' }, ref) {
  const canvas = useRef(null)
  const dibujando = useRef(false)
  const [vacia, setVacia] = useState(true)

  useEffect(() => {
    const c = canvas.current
    const ajustar = () => {
      const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
      const previo = c.width > 0 && !vacia ? c.toDataURL() : null
      c.width = Math.round(r.width * dpr); c.height = Math.round(alto * dpr)
      const g = c.getContext('2d'); g.scale(dpr, dpr)
      g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1D1D1F'
      if (previo) { const img = new Image(); img.onload = () => g.drawImage(img, 0, 0, r.width, alto); img.src = previo }
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alto])

  const punto = e => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const inicio = e => {
    if (disabled) return
    e.preventDefault(); canvas.current.setPointerCapture?.(e.pointerId)
    dibujando.current = true
    const g = canvas.current.getContext('2d'), p = punto(e)
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.01, p.y + 0.01); g.stroke()
  }
  const mover = e => {
    if (!dibujando.current) return
    const g = canvas.current.getContext('2d'), p = punto(e)
    g.lineTo(p.x, p.y); g.stroke()
    if (vacia) { setVacia(false); onChange?.(true) }
  }
  const fin = () => { dibujando.current = false }

  const limpiar = () => {
    const c = canvas.current, g = c.getContext('2d')
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore()
    setVacia(true); onChange?.(false)
  }
  useImperativeHandle(ref, () => ({
    limpiar,
    vacia: () => vacia,
    toDataURL: () => (vacia ? null : canvas.current.toDataURL('image/png')),
    toBlob: () => new Promise(res => (vacia ? res(null) : canvas.current.toBlob(res, 'image/png'))),
  }))

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>{etiqueta}</div>
      <div style={{ position: 'relative', border: '1.5px dashed var(--border)', borderRadius: 8, background: '#fff', opacity: disabled ? 0.6 : 1 }}>
        <canvas ref={canvas} style={{ width: '100%', height: alto, display: 'block', touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onPointerDown={inicio} onPointerMove={mover} onPointerUp={fin} onPointerLeave={fin} aria-label="Área de firma" />
        {vacia && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B0B0B8', fontSize: 13, pointerEvents: 'none' }}>Firma aquí con el dedo o el mouse</div>}
      </div>
      <button type="button" className="btn o sm" style={{ marginTop: 6 }} onClick={limpiar} disabled={disabled || vacia}><Eraser size={12} style={{ verticalAlign: -2 }} /> Borrar firma</button>
    </div>
  )
})
export default FirmaPad
