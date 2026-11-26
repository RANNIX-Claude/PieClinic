// Cámara con html5-qrcode (usa BarcodeDetector del navegador cuando existe). Ignora la misma lectura durante 2 s.
// Es el mismo lector del conteo inicial de Inventario (plataforma/inventario/ConteoInicial.jsx); aquí vive aparte para que el módulo de auditoría no dependa de él.
// El escáner Bluetooth sigue funcionando como teclado (campo de código de Captura.jsx); la cámara es el segundo camino.
import { useEffect, useRef } from 'react'

export default function CamaraEscaner({ onCodigo, onError }) {
  const id = useRef(`cam-${Math.random().toString(36).slice(2, 8)}`)
  const ultimo = useRef({ c: '', t: 0 })
  const cb = useRef(onCodigo); cb.current = onCodigo
  useEffect(() => {
    let lector = null, vivo = true
    ;(async () => {
      try {
        if (!window.isSecureContext) throw new Error('La cámara necesita HTTPS.')
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
        if (!vivo) return
        lector = new Html5Qrcode(id.current, { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.QR_CODE], experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false })
        const config = {
          fps: 15,
          qrbox: w => ({ width: Math.floor(w * 0.86), height: Math.floor(w * 0.5) }),
          videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] },
        }
        await lector.start({ facingMode: 'environment' }, config, texto => {
          const ahora = Date.now()
          if (texto === ultimo.current.c && ahora - ultimo.current.t < 2000) return
          ultimo.current = { c: texto, t: ahora }; cb.current(texto)
        }, () => {})
      } catch (e) { onError?.(e?.message?.includes('Permission') ? 'Permite el acceso a la cámara en el navegador.' : `No se pudo abrir la cámara: ${e?.message ?? e}`) }
    })()
    return () => { vivo = false; if (lector) { lector.stop().catch(() => {}).finally(() => { try { lector.clear() } catch { /* ya liberada */ } }) } }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420, height: 'min(44vh, 340px)', margin: '10px auto 0', borderRadius: 10, overflow: 'hidden', background: '#111' }}>
      <div id={id.current} style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }} />
    </div>
  )
}
