// Cámara de la PWA (F6.2): captura EN VIVO, sin galería. PURA. La política es: ningún elemento de la PWA puede elegir un archivo del teléfono.
// Si se pudiera subir de la galería se podría subir la foto de ayer. La hora oficial la pone el servidor; el reloj del teléfono es solo referencia.
import { UMBRAL_DISCREPANCIA_SEG } from './hora.js'

/** Restricciones de getUserMedia: cámara trasera, resolución suficiente para comprimir a 1,600 px. */
export const restriccionesFoto = () => ({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2048 } }, audio: false })

/** ¿El código contiene un camino a la galería o al selector de archivos? (lo usa la prueba que recorre todo el código de la PWA). */
export function caminosDeGaleria(texto) {
  const patrones = [
    [/type\s*=\s*["'{`]\s*file\b/i, 'input type=file'],
    [/showOpenFilePicker|showSaveFilePicker/, 'File System Access API'],
    [/createElement\(\s*['"]input['"]\s*\)/, 'input creado por código'],
    [/accept\s*=\s*["'{`]\s*image/i, 'accept=image/*'],
    [/\bdataTransfer\b|\bonDrop\b/, 'arrastrar y soltar archivos'],
    [/\bFileReader\b/, 'FileReader (leer archivo local)'],
  ]
  return patrones.filter(([re]) => re.test(texto)).map(([, n]) => n)
}

/** Diferencia entre el reloj del teléfono y el del servidor. Más de 5 min se avisa y la base lo registra (criterio 5). */
export function discrepanciaDeReloj(relojTelefonoMs, relojServidorMs) {
  const seg = Math.round((relojTelefonoMs - relojServidorMs) / 1000)
  return { segundos: seg, discrepancia: Math.abs(seg) > UMBRAL_DISCREPANCIA_SEG }
}

/** Blob → bytes guardables en IndexedDB (Safari no guarda Blob de forma fiable). */
export async function blobABytes(blob) { return { bytes: await blob.arrayBuffer(), tipo: blob.type || 'image/jpeg' } }
export const bytesABlob = ({ bytes, tipo }) => new Blob([bytes], { type: tipo || 'image/jpeg' })
