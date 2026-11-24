// Guarda una firma en pantalla como evidencia (P-142): imagen en storage privado + fila inmutable en `firmas`.
import { supabase } from '../supabase'
import { insertar, contextoApi } from '../api'
import { BUCKETS, rutaStorage } from '../urlFirmada'

/**
 * @param blob       PNG de la firma (FirmaPad.toBlob())
 * @param firmante   { tipo, pacienteId?, usuarioId?, nombre, cedula? }
 * @param documento  { tipo, id?, version?, hash? }
 * @param rol        rol del usuario: Recepción no escribe en el bucket `expedientes`, usa `documentos`
 */
export async function registrarFirma({ blob, firmante, documento, canal = 'podologo_pantalla', rol, motivoRepresentante = null }) {
  if (!blob) throw new Error('Dibuja la firma antes de continuar.')
  if (!String(firmante?.nombre ?? '').trim()) throw new Error('Escribe el nombre del firmante.')
  const { organizacionId } = contextoApi()
  const id = crypto.randomUUID()
  const bucket = rol === 'recepcion' ? BUCKETS.documentos : BUCKETS.expedientes
  const ruta = rutaStorage(organizacionId, 'firmas', `${id}.png`)
  const { error: eSub } = await supabase.storage.from(bucket).upload(ruta, blob, { contentType: 'image/png', upsert: false })
  if (eSub) throw eSub
  const { data, error } = await insertar('firmas', {
    id, firmante_tipo: firmante.tipo, firmante_paciente_id: firmante.pacienteId ?? null, firmante_usuario_id: firmante.usuarioId ?? null,
    nombre_firmante: firmante.nombre.trim(), cedula: firmante.cedula ?? null, imagen_path: ruta,
    documento_tipo: documento.tipo, documento_id: documento.id ?? null, documento_version: documento.version != null ? String(documento.version) : null,
    documento_hash: documento.hash ?? null, canal, dispositivo: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 200),
    motivo_representante: motivoRepresentante,
  })
  if (error) throw error
  return data[0]
}

/** Huella SHA-256 (hex) de un texto: para fijar qué documento se firmó. */
export async function huella(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
