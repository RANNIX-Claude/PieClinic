// Foto rápida de evolución: abre la cámara del dispositivo, deja la foto anterior semitransparente como guía de encuadre
// y guarda cada toma ligada al paciente (y a la consulta del día si existe). Sin consulta queda como «foto de seguimiento».
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, X, ImageUp } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../../components/ui/Modal'
import { useApp } from '../../../context/AppContext'
import { leer, insertar } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'
import { urlFirmada, rutaStorage, BUCKETS } from '../../../lib/urlFirmada'
import { zonasDeVista } from '../../../lib/clinico/mapaPie'
import { VISTAS_FOTO } from '../../../lib/clinico/catalogos'
import { fecha } from '../../../lib/formato'

const MAX_PX = 2048
const aBlob = (canvas, calidad) => new Promise(res => canvas.toBlob(res, 'image/jpeg', calidad))
async function reducir(fuente, ancho, alto) {
  const k = Math.min(1, MAX_PX / Math.max(ancho, alto))
  const c = document.createElement('canvas'); c.width = Math.round(ancho * k); c.height = Math.round(alto * k)
  c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height)
  let b = await aBlob(c, 0.88); if (b && b.size > 9.5 * 1024 * 1024) b = await aBlob(c, 0.65)
  return { blob: b, ancho: c.width, alto: c.height }
}
export const semanasDesde = (desde, hasta) => Math.max(0, Math.floor((new Date(hasta) - new Date(desde)) / (7 * 86400000)))

export default function FotoRapida({ pacienteId, pacienteNombre, consultaId = null, onClose, onGuardada }) {
  const { organizacion, perfil, sedeActivaId, soloLectura } = useApp()
  const video = useRef(null), flujo = useRef(null), archivo = useRef(null)
  const [previas, setPrevias] = useState([])        // fotos ya existentes del paciente (más reciente primero)
  const [pie, setPie] = useState('I'), [vista, setVista] = useState('dorsal'), [zona, setZona] = useState('')
  const [guia, setGuia] = useState({ url: null, tomada_en: null }), [verGuia, setVerGuia] = useState(true)
  const [camara, setCamara] = useState('pendiente') // pendiente | lista | sin
  const [guardando, setGuardando] = useState(false)
  const [tomadas, setTomadas] = useState([])
  const [consulta, setConsulta] = useState(consultaId)
  const zonas = useMemo(() => zonasDeVista(vista === 'plantar' ? 'plantar' : 'dorsal'), [vista])

  // Fotos anteriores (para heredar pie/ángulo/zona y para la guía) y consulta del día
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leer('prp_fotos_clinicas', { sedeCol: false, filtros: { paciente_id: pacienteId, retirada: false }, orden: { columna: 'tomada_en', asc: false }, limite: 80 })
      if (!vivo || r.error) return
      setPrevias(r.data)
      const u = r.data[0]
      if (u) { setPie(u.pie ?? 'I'); setVista(u.vista ?? 'dorsal'); setZona(u.zona_codigo ?? '') }
      if (!consultaId) {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const c = await leer('consultas', { sedeCol: false, filtros: { paciente_id: pacienteId, fecha_hora: { gte: hoy.toISOString() } }, orden: { columna: 'fecha_hora', asc: false }, limite: 1, columnas: 'id' })
        if (vivo && !c.error && c.data[0]) setConsulta(c.data[0].id)
      }
    })()
    return () => { vivo = false }
  }, [pacienteId, consultaId])

  // La guía es la última foto del mismo pie, ángulo y zona (si no hay de esa zona, la última del mismo pie y ángulo)
  const anterior = useMemo(() => previas.find(f => f.pie === pie && f.vista === vista && (f.zona_codigo ?? '') === zona) ?? previas.find(f => f.pie === pie && f.vista === vista) ?? null, [previas, pie, vista, zona])
  useEffect(() => {
    let vivo = true
    setGuia({ url: null, tomada_en: anterior?.tomada_en ?? null })
    if (anterior) urlFirmada(BUCKETS.fotos, anterior.archivo_path, 900).then(u => { if (vivo) setGuia({ url: u, tomada_en: anterior.tomada_en }) })
    return () => { vivo = false }
  }, [anterior?.id])

  // Cámara
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin camara')
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2048 } }, audio: false })
        if (!vivo) { s.getTracks().forEach(t => t.stop()); return }
        flujo.current = s
        setCamara('lista')   // el <video> debe estar visible para reproducir; no se espera a play()
        requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; video.current.play?.().catch?.(() => {}) } })
      } catch { if (vivo) setCamara('sin') }
    })()
    return () => { vivo = false; flujo.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const momento = previas.length === 0 && tomadas.length === 0 ? 'antes' : 'seguimiento'

  async function guardar(blob, ancho, alto) {
    if (!blob) { toast.error('No se pudo procesar la foto'); return }
    if (blob.size > 10 * 1024 * 1024) { toast.error('La foto excede 10 MB'); return }
    setGuardando(true)
    try {
      const ruta = rutaStorage(organizacion.id, `${pacienteId}/${consulta ?? 'seguimiento'}`, `${crypto.randomUUID()}.jpg`)
      const up = await supabase.storage.from(BUCKETS.fotos).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
      if (up.error) { toast.error(`No se pudo subir: ${up.error.message}`); return }
      const r = await insertar('fotos_clinicas', {
        paciente_id: pacienteId, consulta_id: consulta, sede_id: sedeActivaId, archivo_path: ruta, mime: 'image/jpeg', tamano_bytes: blob.size, ancho_px: ancho, alto_px: alto,
        pie, vista, zona_codigo: zona || null, momento, nivel_autorizacion: 'clinico', difuminada: false, origen: 'clinica', tomada_en: new Date().toISOString(), subida_por: perfil?.id,
      })
      if (r.error) { toast.error(r.error.message); return }
      const fila = r.data?.[0]
      setTomadas(t => [{ id: fila?.id, url: URL.createObjectURL(blob), pie, vista, zona }, ...t])
      setPrevias(p => (fila ? [{ ...fila }, ...p] : p))
      toast.success('Foto guardada')
      onGuardada?.(fila)
    } finally { setGuardando(false) }
  }
  async function capturar() {
    const v = video.current
    if (!v?.videoWidth) { toast.error('La cámara aún no está lista'); return }
    const { blob, ancho, alto } = await reducir(v, v.videoWidth, v.videoHeight)
    await guardar(blob, ancho, alto)
  }
  async function deArchivo(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('El archivo no es una imagen'); return }
    const bmp = await createImageBitmap(f)
    const { blob, ancho, alto } = await reducir(bmp, bmp.width, bmp.height)
    await guardar(blob, ancho, alto)
  }

  const chip = (act, onClick, txt) => <button type="button" key={txt} className={act ? 'btn' : 'btn o'} style={{ padding: '6px 12px' }} onClick={onClick}>{txt}</button>
  const bloqueado = soloLectura || guardando

  return (
    <Modal open title={`Foto de evolución · ${pacienteNombre ?? ''}`} onClose={onClose} size="wide">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }} role="group" aria-label="Pie">
        {chip(pie === 'D', () => setPie('D'), 'Pie derecho')}{chip(pie === 'I', () => setPie('I'), 'Pie izquierdo')}
        <span style={{ width: 10 }} />
        {VISTAS_FOTO.map(v => chip(vista === v.value, () => { setVista(v.value); setZona('') }, v.label))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <select aria-label="Zona" value={zona} onChange={e => setZona(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Zona: todo el pie</option>
          {zonas.map(z => <option key={z.codigo} value={z.codigo}>{z.nombre}</option>)}
        </select>
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          {guia.tomada_en ? `Última foto de esta zona: ${fecha(guia.tomada_en)} (hace ${semanasDesde(guia.tomada_en, new Date())} sem.)` : 'Primera foto de esta zona'}
          {' · '}{consulta ? 'se liga a la consulta de hoy' : 'foto de seguimiento (sin consulta)'}
        </span>
      </div>

      <div style={{ position: 'relative', background: '#111', borderRadius: 10, overflow: 'hidden', aspectRatio: '4 / 3', maxHeight: 420 }}>
        <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: camara === 'lista' ? 'block' : 'none' }} />
        {camara !== 'lista' && <div style={{ color: '#ddd', padding: 24, textAlign: 'center', fontSize: 14 }}>{camara === 'pendiente' ? 'Abriendo la cámara…' : 'No hay cámara disponible o no se dio el permiso. Usa «Tomar con la cámara del sistema».'}</div>}
        {verGuia && guia.url && <img src={guia.url} alt="Foto anterior como guía" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.35, pointerEvents: 'none' }} />}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" disabled={bloqueado || camara !== 'lista'} onClick={capturar}><Camera size={14} style={{ verticalAlign: -3 }} /> {guardando ? 'Guardando…' : 'Tomar foto'}</button>
        <input ref={archivo} type="file" accept="image/*" capture="environment" onChange={deArchivo} style={{ display: 'none' }} />
        <button type="button" className="btn o" disabled={bloqueado} onClick={() => archivo.current?.click()}><ImageUp size={14} style={{ verticalAlign: -3 }} /> Tomar con la cámara del sistema / elegir archivo</button>
        {guia.url && <label style={{ fontSize: 13 }}><input type="checkbox" checked={verGuia} onChange={e => setVerGuia(e.target.checked)} /> Ver foto anterior como guía</label>}
        <button type="button" className="btn o" style={{ marginLeft: 'auto' }} onClick={onClose}><X size={13} style={{ verticalAlign: -2 }} /> Terminar</button>
      </div>
      {tomadas.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }} aria-label="Fotos tomadas ahora">
          {tomadas.map((t, i) => <img key={t.id ?? i} src={t.url} alt={`Foto tomada ${tomadas.length - i}`} style={{ height: 64, borderRadius: 8, border: '1px solid var(--border)' }} />)}
        </div>
      )}
    </Modal>
  )
}
