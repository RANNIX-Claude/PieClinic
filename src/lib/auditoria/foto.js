// Foto de evidencia: compresión en el dispositivo (lado largo configurable, 1,600 px por omisión, tope 2,400) y huella sha256.
// NO hay camino de galería: la captura es en vivo (getUserMedia en componentes/CamaraEnVivo.jsx). Aquí solo hay matemática y utilidades puras.
import { sha256Hex } from './hash.js'

export const LADO_LARGO_POR_OMISION = 1600
export const LADO_LARGO_TOPE = 2400
export const OPACIDAD_GUIA = 0.35

/** Tamaño final (px) para que el lado largo no pase de `lado`. Nunca agranda. */
export function escalaFoto(ancho, alto, lado = LADO_LARGO_POR_OMISION) {
  const tope = Math.min(Math.max(Number(lado) || LADO_LARGO_POR_OMISION, 320), LADO_LARGO_TOPE)
  const k = Math.min(1, tope / Math.max(ancho, alto))
  return { ancho: Math.round(ancho * k), alto: Math.round(alto * k), escala: k }
}

/** Huella de un Blob/ArrayBuffer/Uint8Array. */
export async function hashDeFoto(datos) {
  const bytes = typeof datos?.arrayBuffer === 'function' ? await datos.arrayBuffer() : datos
  return sha256Hex(bytes)
}

/** ¿Es la misma imagen? (mismo hash). El cliente NO muestra este resultado a quien captura: lo evalúa el servidor y alerta al dueño. */
export const mismaImagen = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase()

/** Dibuja la fuente (video o imagen) reducida y devuelve un JPEG. Solo navegador. */
export async function comprimirADispositivo(fuente, ancho, alto, lado = LADO_LARGO_POR_OMISION, calidad = 0.85) {
  const t = escalaFoto(ancho, alto, lado)
  const lienzo = document.createElement('canvas')
  lienzo.width = t.ancho; lienzo.height = t.alto
  lienzo.getContext('2d').drawImage(fuente, 0, 0, t.ancho, t.alto)
  const blob = await new Promise(res => lienzo.toBlob(res, 'image/jpeg', calidad))
  return { blob, ancho: t.ancho, alto: t.alto }
}

/** Ruta en el bucket privado: <organizacion>/ctl/<sucursal>/<archivo> (la exige ctl_evidencia_registrar). */
export const rutaFotoCierre = (organizacionId, sucursalId, id) => `${organizacionId}/ctl/${sucursalId}/${id}.jpg`
