// Adaptador de dictado por voz con IA (P-014). SIN llave real: modo `simulado` explícito.
// En modo simulado NO se transcribe nada: devuelve un texto de marcador claramente identificado y el podólogo
// debe escribir/pegar la transcripción. Cuando exista la función de servidor (Netlify) y la llave, cambiar MODO a 'real'.
import { llamarFuncion } from '../api'

export const MODO_DICTADO = 'simulado' // 'simulado' | 'real'
export const AVISO_DICTADO = 'Modo simulado: sin llave de IA. La transcripción no es real; revisa y escribe el texto tú mismo antes de guardar.'
export const MARCA_SIMULADA = '[TRANSCRIPCIÓN SIMULADA · sin llave de IA]'

/**
 * @param {Blob|File|null} audio  grabación del navegador o archivo subido
 * @returns {{ simulado: boolean, texto: string, propuestas: Array, aviso: string|null }}
 */
export async function transcribir(audio, { idioma = 'es-MX', seccion = 'nota_evolucion' } = {}) {
  if (MODO_DICTADO === 'simulado') {
    return {
      simulado: true,
      texto: `${MARCA_SIMULADA} Escribe aquí lo dictado (${audio ? `audio recibido: ${Math.round((audio.size ?? 0) / 1024)} KB` : 'sin audio'}).`,
      propuestas: [], // en modo simulado no se proponen campos: se capturan a mano
      aviso: AVISO_DICTADO,
    }
  }
  const r = await llamarFuncion('transcribir-dictado', { idioma, seccion, audio: audio ? await blobABase64(audio) : null })
  if (!r.ok) throw new Error('El servicio de transcripción no respondió')
  return { simulado: false, aviso: null, ...(await r.json()) }
}

export const esTextoSimulado = t => String(t ?? '').includes(MARCA_SIMULADA)

async function blobABase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  buf.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s)
}
