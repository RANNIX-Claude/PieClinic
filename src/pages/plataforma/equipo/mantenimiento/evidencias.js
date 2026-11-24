// Subida de evidencias de OT al bucket privado «documentos» (<org>/mantenimiento/<ot>/…). Solo la ruta va a la tabla; se muestra con URL firmada.
import { supabase } from '../../../../lib/supabase'
import { rutaStorage, BUCKETS } from '../../../../lib/urlFirmada'
import { insertar } from '../../../../lib/api'

export const MIMES_EVIDENCIA = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']

/** Sube un archivo y registra la fila en ot_evidencias. Devuelve { error } con mensaje legible si algo falla. */
export async function subirEvidencia({ organizacionId, ordenId, archivo, momento = 'solicitud' }) {
  if (!MIMES_EVIDENCIA.includes(archivo.type)) return { error: { message: `${archivo.name}: solo imágenes JPG, PNG, WEBP, HEIC o PDF` } }
  if (archivo.size > 10 * 1024 * 1024) return { error: { message: `${archivo.name}: excede 10 MB` } }
  const ruta = rutaStorage(organizacionId, 'mantenimiento', ordenId, `${crypto.randomUUID()}-${archivo.name.replace(/[^\w.-]/g, '_')}`)
  const { error } = await supabase.storage.from(BUCKETS.documentos).upload(ruta, archivo, { upsert: false, contentType: archivo.type })
  if (error) return { error }
  return insertar('ot_evidencias', { orden_id: ordenId, momento, nombre: archivo.name, storage_path: ruta, mime: archivo.type, tamano_kb: Math.ceil(archivo.size / 1024) })
}
