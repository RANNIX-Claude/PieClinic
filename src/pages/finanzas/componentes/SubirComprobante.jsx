// Subida de comprobantes (imagen o PDF ≤ 10 MB) al bucket privado «comprobantes»: <organizacion_id>/<carpeta>/<uuid>.<ext>.
// Guarda en la tabla SOLO la ruta; se muestra con urlFirmada. Las imágenes grandes se reducen a 2048 px.
import { useRef, useState } from 'react'
import { Paperclip, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { urlFirmada, rutaStorage, BUCKETS } from '../../../lib/urlFirmada'
import { useApp } from '../../../context/AppContext'

const MAX = 10 * 1024 * 1024

async function reducirImagen(file) {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size <= MAX) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85))
  } catch { return file }
}

export async function verComprobante(ruta) {
  const u = await urlFirmada(BUCKETS.comprobantes, ruta, 300)
  if (u) window.open(u, '_blank', 'noopener'); else toast.error('No se pudo abrir el comprobante.')
}

export default function SubirComprobante({ carpeta, valor, onSubida, etiqueta = 'Adjuntar', capture, disabled }) {
  const { organizacion, soloLectura } = useApp()
  const ref = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const bloqueado = disabled || soloLectura || !organizacion?.id

  async function elegir(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const esImg = f.type.startsWith('image/'), esPdf = f.type === 'application/pdf'
    if (!esImg && !esPdf) return toast.error('Solo imágenes o PDF.')
    setSubiendo(true)
    try {
      const blob = esImg ? await reducirImagen(f) : f
      if (blob.size > MAX) return toast.error('El archivo excede 10 MB.')
      const ext = esPdf ? 'pdf' : 'jpg'
      const ruta = rutaStorage(organizacion.id, carpeta, `${crypto.randomUUID()}.${ext}`)
      const { error } = await supabase.storage.from(BUCKETS.comprobantes).upload(ruta, blob, { contentType: esPdf ? 'application/pdf' : 'image/jpeg', upsert: false })
      if (error) return toast.error(`No se pudo subir: ${error.message}`)
      await onSubida?.({ ruta, nombre: f.name, bytes: blob.size, esPdf })
    } finally { setSubiendo(false) }
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input ref={ref} type="file" accept="image/*,application/pdf" capture={capture} onChange={elegir} style={{ display: 'none' }} />
      <button type="button" className="btn o sm" disabled={bloqueado || subiendo} onClick={() => ref.current?.click()}>
        <Paperclip size={12} style={{ verticalAlign: -2 }} /> {subiendo ? 'Subiendo…' : valor ? 'Reemplazar' : etiqueta}
      </button>
      {valor && <button type="button" className="btn o sm" onClick={() => verComprobante(valor)}><Eye size={12} style={{ verticalAlign: -2 }} /> Ver</button>}
    </span>
  )
}
