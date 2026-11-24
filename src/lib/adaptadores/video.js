// Adaptador de videoconsulta (P-016). SIN proveedor de video: modo `simulado` explícito.
// Simulado = el podólogo ve su propia cámara local; el paciente NO puede conectarse (no hay servidor de video).
export const MODO_VIDEO = 'simulado' // 'simulado' | 'daily' | 'jitsi'
export const AVISO_VIDEO = 'Modo simulado: sin proveedor de video. Se muestra solo tu cámara local; el paciente no puede conectarse todavía.'

/** Abre la cámara/micrófono locales. Devuelve { stream, detener() } o lanza un Error legible. */
export async function abrirMediosLocales({ audio = true, video = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar cámara o micrófono.')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video })
    return { stream, detener: () => stream.getTracks().forEach(t => t.stop()) }
  } catch (e) {
    throw new Error(e?.name === 'NotAllowedError' ? 'Permiso de cámara/micrófono denegado.' : `No se pudo abrir la cámara: ${e?.message ?? e}`)
  }
}

/** Captura un fotograma del <video> como Blob JPEG (para «Capturar imagen»). */
export function capturarFotograma(videoEl, calidad = 0.9) {
  const c = document.createElement('canvas')
  c.width = videoEl.videoWidth || 640; c.height = videoEl.videoHeight || 480
  c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height)
  return new Promise(res => c.toBlob(res, 'image/jpeg', calidad))
}

/** Liga que recibirá el paciente (la RPC crear_sala_videoconsulta devuelve el token; el portal construye la URL). */
export const ligaSalaPaciente = (origen, token) => `${origen}/portal/sala?t=${encodeURIComponent(token)}`
