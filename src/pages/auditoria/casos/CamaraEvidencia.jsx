// Cámara EN VIVO para la evidencia de un caso (foto de remisión, nota de compra). No hay camino de galería (criterio 4): la imagen sale de getUserMedia,
// se comprime en el dispositivo (lado largo 1,600 px, tope 2,400) y se le calcula su huella sha256. Subirla y registrarla es de lib/auditoria/casoApi.js.
import { useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, Check } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import { sha256Hex } from '../../../lib/auditoria/hash'

const LADO_LARGO = 1600, LADO_TOPE = 2400

/** Tamaño final para que el lado largo no pase de `lado` (nunca agranda; tope 2,400). */
export function escalar(ancho, alto, lado = LADO_LARGO) {
  const tope = Math.min(Math.max(Number(lado) || LADO_LARGO, 320), LADO_TOPE)
  const k = Math.min(1, tope / Math.max(ancho, alto))
  return { ancho: Math.round(ancho * k), alto: Math.round(alto * k) }
}

export default function CamaraEvidencia({ open, onClose, onFoto }) {
  const video = useRef(null)
  const flujo = useRef(null)
  const [error, setError] = useState('')
  const [captura, setCaptura] = useState(null)   // { blob, url, ancho, alto, hash }
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const apagar = () => { flujo.current?.getTracks().forEach(t => t.stop()); flujo.current = null }
  useEffect(() => {
    if (!open || captura) return undefined
    let vivo = true
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este dispositivo no permite abrir la cámara. La evidencia solo se captura en vivo; no se aceptan fotos de la galería.'); return undefined }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(s => { if (!vivo) { s.getTracks().forEach(t => t.stop()); return } flujo.current = s; if (video.current) { video.current.srcObject = s; video.current.play?.() } })
      .catch(() => setError('No se pudo abrir la cámara. Revise el permiso del navegador.'))
    return () => { vivo = false; apagar() }
  }, [open, captura])
  useEffect(() => () => { apagar() }, [])

  const tomar = async () => {
    const v = video.current
    if (!v?.videoWidth) return
    setOcupado(true)
    const t = escalar(v.videoWidth, v.videoHeight)
    const lienzo = document.createElement('canvas'); lienzo.width = t.ancho; lienzo.height = t.alto
    lienzo.getContext('2d').drawImage(v, 0, 0, t.ancho, t.alto)
    const blob = await new Promise(res => lienzo.toBlob(res, 'image/jpeg', 0.85))
    const hash = await sha256Hex(await blob.arrayBuffer())
    apagar()
    setCaptura({ blob, url: URL.createObjectURL(blob), ancho: t.ancho, alto: t.alto, hash })
    setOcupado(false)
  }
  const repetir = () => { if (captura?.url) URL.revokeObjectURL(captura.url); setCaptura(null) }
  const cerrar = () => { apagar(); repetir(); setNota(''); onClose?.() }
  const usar = async () => { setOcupado(true); try { await onFoto?.({ ...captura, nota: nota.trim() || null }); cerrar() } finally { setOcupado(false) } }

  return (
    <Modal open={open} onClose={cerrar} title="Evidencia del caso" size="md" cerrarAlClicFuera={false}
      footer={captura
        ? <><button type="button" className="btn o" onClick={repetir} disabled={ocupado}><RotateCcw size={14} /> Repetir</button><button type="button" className="btn" onClick={usar} disabled={ocupado}><Check size={14} /> {ocupado ? 'Subiendo…' : 'Adjuntar al caso'}</button></>
        : <button type="button" className="btn" onClick={tomar} disabled={!!error || ocupado}><Camera size={14} /> Tomar foto</button>}>
      {error && <div className="hint" role="alert">{error}</div>}
      {!captura && !error && <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: '60vh' }} />}
      {captura && (
        <>
          <img src={captura.url} alt="Vista previa de la evidencia" style={{ width: '100%', borderRadius: 8, maxHeight: '55vh', objectFit: 'contain', background: '#000' }} />
          <div className="field" style={{ marginTop: 10 }}><label>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. remisión del proveedor, nota de compra…" maxLength={200} /></div>
        </>
      )}
      <div className="hint" style={{ marginTop: 8 }}>La foto se toma en vivo; no se puede subir desde la galería. Queda con su huella sha256 y la hora del servidor.</div>
    </Modal>
  )
}
