// URL firmada de VIDA CORTA para las fotos de evidencia (bucket privado pf-auditoria). Nunca getPublicUrl.
// No hay función de subida desde galería: la captura en vivo y la compresión son de la PWA (Etapa 5); aquí solo se arma la ruta y se firma.
import { BUCKETS, urlFirmada } from '../urlFirmada'

export const VIDA_MAXIMA_SEG = 300       // 5 minutos: tope en el cliente; la base solo entrega firma a dueño y supervisor
export const VIDA_POR_OMISION_SEG = 120

export const rutaEvidencia = (organizacionId, sucursalId, archivo) => `${organizacionId}/ctl/${sucursalId}/${archivo}`

/** @returns {Promise<string|null>} */
export const urlEvidencia = (ruta, segundos = VIDA_POR_OMISION_SEG) =>
  urlFirmada(BUCKETS.auditoria, ruta, Math.min(Math.max(1, segundos), VIDA_MAXIMA_SEG))
