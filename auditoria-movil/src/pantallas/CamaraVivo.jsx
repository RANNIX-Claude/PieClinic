// Cámara EN VIVO de la PWA (F6.2). No hay selector de archivos ni galería en ninguna parte de esta app: solo getUserMedia (cámara trasera).
// Comprime en el dispositivo al lado largo de la configuración (1,600 px por omisión), calcula el sha256 y entrega los bytes; la hora oficial la pone el servidor.
import { useEffect, useRef, useState } from 'react'
import { restriccionesFoto } from '../../../src/lib/auditoria/pwaCamara.js'
import { comprimirADispositivo, hashDeFoto, LADO_LARGO_POR_OMISION } from '../../../src/lib/auditoria/foto.js'

export default function CamaraVivo({ titulo, ladoLargo = LADO_LARGO_POR_OMISION, onFoto, onCerrar }) {
  const video = useRef(null), flujo = useRef(null)
  const [estado, setEstado] = useState('pendiente')   // pendiente | lista | sin
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin camara')
        const s = await navigator.mediaDevices.getUserMedia(restriccionesFoto())
        if (!vivo) { s.getTracks().forEach(t => t.stop()); return }
        flujo.current = s; setEstado('lista')
        requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; video.current.play?.().catch(() => {}) } })
      } catch { if (vivo) setEstado('sin') }
    })()
    return () => { vivo = false; flujo.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  async function tomar() {
    const v = video.current
    if (!v?.videoWidth) { setError('La cámara aún no está lista'); return }
    setOcupado(true); setError(null)
    try {
      const { blob, ancho, alto } = await comprimirADispositivo(v, v.videoWidth, v.videoHeight, ladoLargo)
      if (!blob) throw new Error('No se pudo procesar la foto')
      const hash = await hashDeFoto(blob)
      await onFoto({ blob, ancho, alto, hash })
      onCerrar()
    } catch (e) { setError(e?.message || 'No se pudo guardar la foto'); setOcupado(false) }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Foto en vivo: ${titulo}`} data-testid="camara-vivo">
      <div className="cuerpo">
        <h2>Foto en vivo · {titulo}</h2>
        <div className="visor">
          <video ref={video} playsInline muted style={{ display: estado === 'lista' ? 'block' : 'none' }} data-testid="video-vivo" />
          {estado !== 'lista' && <div style={{ color: '#ddd', padding: 24, textAlign: 'center' }}>{estado === 'pendiente' ? 'Abriendo la cámara…' : 'No hay cámara o no diste el permiso. La evidencia solo se toma en vivo: no se puede subir una foto de la galería. Activa la cámara del navegador y vuelve a intentar.'}</div>}
        </div>
        <p className="hint">Se toma en vivo; la fecha y la hora las pone el servidor, no el teléfono.</p>
        {error && <div className="aviso rojo" role="alert">{error}</div>}
      </div>
      <div className="pie">
        <button type="button" className="btn o" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={ocupado || estado !== 'lista'} onClick={tomar} data-testid="tomar-foto">{ocupado ? 'Guardando…' : 'Tomar foto'}</button>
      </div>
    </div>
  )
}
