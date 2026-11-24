import { useRef, useState } from 'react'
import { Camera, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { urlFirmada, rutaStorage, BUCKETS } from '../../lib/urlFirmada'
import { useApp } from '../../context/AppContext'

/**
 * Subida de fotos a Storage PRIVADO con ruta <organizacion_id>/<carpeta>/<archivo>.jpg (RLS por primer segmento).
 * Reduce la imagen en el navegador a `maxPx` (2048 por defecto) y la guarda como JPEG ≤ `maxMB` (P-007: 10 MB, ≤ 2048 px).
 *
 * <FotoUploader bucket={BUCKETS.fotos} carpeta={`pacientes/${pacienteId}/sesion-${sesionId}`} multiple
 *               onSubida={({ ruta, bucket, nombre, bytes }) => guardarEnTabla(ruta)} />
 * La app guarda en la tabla SOLO `ruta`; para mostrarla usa urlFirmada(bucket, ruta) (nunca URL pública).
 * Si la clínica está en solo lectura, el control se deshabilita.
 */
async function reducir(file, maxPx, calidad) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise(res => c.toBlob(res, 'image/jpeg', calidad))
}

export default function FotoUploader({ bucket = BUCKETS.fotos, carpeta = '', onSubida, multiple, maxMB = 10, maxPx = 2048, capture, etiqueta = 'Subir foto', disabled }) {
  const { organizacion, soloLectura } = useApp()
  const input = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const [previas, setPrevias] = useState([])
  const bloqueado = disabled || soloLectura || !organizacion?.id

  async function elegir(e) {
    const archivos = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!archivos.length) return
    setSubiendo(true)
    try {
      for (const f of archivos) {
        if (!f.type.startsWith('image/')) { toast.error(`${f.name}: no es una imagen`); continue }
        let blob = await reducir(f, maxPx, 0.88)
        if (blob && blob.size > maxMB * 1024 * 1024) blob = await reducir(f, maxPx, 0.65)
        if (!blob || blob.size > maxMB * 1024 * 1024) { toast.error(`${f.name}: excede ${maxMB} MB`); continue }
        const nombre = `${crypto.randomUUID()}.jpg`
        const ruta = rutaStorage(organizacion.id, carpeta, nombre)
        const { error } = await supabase.storage.from(bucket).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
        if (error) { toast.error(`No se pudo subir ${f.name}: ${error.message}`); continue }
        const url = await urlFirmada(bucket, ruta, 600)
        setPrevias(p => [...p, { ruta, url }])
        await onSubida?.({ ruta, bucket, nombre: f.name, bytes: blob.size })
      }
    } finally { setSubiendo(false) }
  }

  return (
    <div>
      <input ref={input} type="file" accept="image/*" multiple={multiple} capture={capture} onChange={elegir} style={{ display: 'none' }} />
      <button type="button" className="btn o" disabled={bloqueado || subiendo} onClick={() => input.current?.click()}>
        {capture ? <Camera size={14} style={{ verticalAlign: -3 }} /> : <Upload size={14} style={{ verticalAlign: -3 }} />} {subiendo ? 'Subiendo…' : etiqueta}
      </button>
      {soloLectura && <div className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Clínica en solo lectura: no se pueden subir archivos.</div>}
      {previas.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {previas.map(p => p.url && <img key={p.ruta} src={p.url} alt="Foto subida" style={{ height: 72, borderRadius: 8, border: '1px solid var(--border)' }} />)}
        </div>
      )}
    </div>
  )
}
