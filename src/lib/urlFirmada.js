import { supabase } from './supabase'

// Buckets privados de Pie Firme en la base compartida: prefijo pf- para no chocar con otros sistemas (convención 9): la ruta siempre empieza con <organizacion_id>/
// El prefijo se puede cambiar con VITE_BUCKET_PREFIX: la instancia del esquema «pieclinic» usa «pc» (ver scripts/clonar-esquema.mjs).
const P = import.meta.env?.VITE_BUCKET_PREFIX || 'pf'
export const BUCKETS = {
  expedientes: `${P}-expedientes`,
  fotos: `${P}-fotos-clinicas`,
  documentos: `${P}-documentos`,
  comprobantes: `${P}-comprobantes`,
  importaciones: `${P}-importaciones`,
  logos: `${P}-logos`,
  equipo: `${P}-equipo`,   // fotos del personal; ruta <organizacion_id>/fotos/<archivo>.jpg (solo el administrador escribe en fotos/)
  auditoria: `${P}-auditoria`,   // Control y Auditoría: fotos de evidencia; ruta <organizacion_id>/ctl/<sucursal_id>/… (firma ≤ 5 min, ver lib/auditoria/urlFirmadaAuditoria.js)
}

/**
 * URL firmada de vida corta para un archivo de Storage (los buckets son privados, nunca getPublicUrl).
 * @returns {Promise<string|null>} null si no existe, no hay permiso o no hay conexión
 */
export async function urlFirmada(bucket, path, expiraEnSegundos = 3600) {
  if (!path) return null
  let ruta = path.startsWith('http') ? (path.split(`/object/public/${bucket}/`)[1] ?? path) : path
  if (ruta.startsWith(`${bucket}/`)) ruta = ruta.slice(bucket.length + 1) // fullPath = "<bucket>/<ruta>"
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ruta, expiraEnSegundos)
  if (error) { console.error(`[storage] no se pudo firmar ${bucket}/${path}:`, error.message); return null }
  return data?.signedUrl ?? null
}

/** Ruta de subida: `<organizacion_id>/<carpeta...>/<archivo>` */
export const rutaStorage = (organizacionId, ...partes) =>
  [organizacionId, ...partes].filter(Boolean).join('/').replace(/\/+/g, '/')
