// Cámara EN VIVO para evidencia de cierres. NO hay selector de archivos ni galería: si se pudiera subir de galería se podría subir la foto de ayer.
// Deja la foto anterior de la misma toma como fantasma semitransparente para alinear el encuadre (idea de clinico/componentes/FotoRapida.jsx),
// comprime en el dispositivo (lado largo de ctl_config, 1,600 px por omisión) y calcula el sha256 antes de subir.
import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import { urlEvidencia } from '../../../lib/auditoria/urlFirmadaAuditoria'
import { comprimirADispositivo, hashDeFoto, OPACIDAD_GUIA, LADO_LARGO_POR_OMISION } from '../../../lib/auditoria/foto'

/**
 * @param {string} titulo           qué se fotografía (p. ej. «Mostrador»)
 * @param {string|null} guiaRuta    ruta de la última foto de esta toma (para el fantasma); null si es la primera
 * @param {number} ladoLargo        px del lado largo tras comprimir
 * @param {(foto:{blob:Blob, ancho:number, alto:number, hash:string})=>Promise<void>} onFoto  sube y registra; si lanza, se muestra el error y se puede reintentar
 */
export default function CamaraEnVivo({ titulo, guiaRuta = null, ladoLargo = LADO_LARGO_POR_OMISION, onFoto, onClose }) {
  const video = useRef(null), flujo = useRef(null)
  const [camara, setCamara] = useState('pendiente')   // pendiente | lista | sin
  const [guia, setGuia] = useState(null)
  const [verGuia, setVerGuia] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin camara')
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2048 } }, audio: false })
        if (!vivo) { s.getTracks().forEach(t => t.stop()); return }
        flujo.current = s
        setCamara('lista')
        requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; video.current.play?.().catch?.(() => {}) } })
      } catch { if (vivo) setCamara('sin') }
    })()
    return () => { vivo = false; flujo.current?.getTracks().forEach(t => t.stop()) }
  }, [])
  useEffect(() => {
    let vivo = true
    if (guiaRuta) urlEvidencia(guiaRuta, 240).then(u => { if (vivo) setGuia(u) })
    return () => { vivo = false }
  }, [guiaRuta])

  async function tomar() {
    const v = video.current
    if (!v?.videoWidth) { setError('La cámara aún no está lista'); return }
    setOcupado(true); setError(null)
    try {
      const { blob, ancho, alto } = await comprimirADispositivo(v, v.videoWidth, v.videoHeight, ladoLargo)
      if (!blob) throw new Error('No se pudo procesar la foto')
      const hash = await hashDeFoto(blob)
      await onFoto({ blob, ancho, alto, hash })
      onClose()
    } catch (e) { setError(e?.message || 'No se pudo guardar la foto'); setOcupado(false) }
  }

  return (
    <Modal open title={`Foto en vivo · ${titulo}`} onClose={onClose} size="wide" cerrarAlClicFuera={false}>
      <div style={{ position: 'relative', background: '#111', borderRadius: 10, overflow: 'hidden', aspectRatio: '4 / 3', maxHeight: '60vh' }}>
        <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: camara === 'lista' ? 'block' : 'none' }} />
        {camara !== 'lista' && (
          <div style={{ color: '#ddd', padding: 24, textAlign: 'center', fontSize: 15 }}>
            {camara === 'pendiente' ? 'Abriendo la cámara…' : 'No hay cámara disponible o no se dio el permiso. La evidencia solo se captura en vivo: no se puede subir una foto de la galería. Habilite la cámara del navegador y vuelva a intentar.'}
          </div>
        )}
        {verGuia && guia && <img src={guia} alt="Foto anterior como guía de encuadre" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: OPACIDAD_GUIA, pointerEvents: 'none' }} />}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" style={{ padding: '14px 22px', fontSize: 16 }} disabled={ocupado || camara !== 'lista'} onClick={tomar}>
          <Camera size={18} style={{ verticalAlign: -4 }} /> {ocupado ? 'Subiendo…' : 'Tomar foto'}
        </button>
        {guia && <label style={{ fontSize: 13 }}><input type="checkbox" checked={verGuia} onChange={e => setVerGuia(e.target.checked)} /> Ver la foto anterior como guía (alinea el encuadre con ella)</label>}
        <button type="button" className="btn o" style={{ marginLeft: 'auto' }} onClick={onClose}><X size={14} style={{ verticalAlign: -2 }} /> Cancelar</button>
      </div>
      {error && <div className="text-red" role="alert" style={{ fontSize: 13, marginTop: 8 }}>{error}</div>}
    </Modal>
  )
}
