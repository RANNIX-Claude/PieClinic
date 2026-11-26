// Piezas compartidas de la cadena de custodia (Etapa 7). No se importan desde fuera de src/pages/auditoria/custodia.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, CheckCircle2 } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { ladoLargoFoto } from '../../../lib/auditoria/apiCierres'
import { subirEvidencia } from '../../../lib/auditoria/custodiaApi'
import { LADO_LARGO_POR_OMISION } from '../../../lib/auditoria/foto'
import CamaraEnVivo from '../cierres/CamaraEnVivo'
import FormField from '../../../components/ui/FormField'
import { errMsg } from '../comun'

export const grande = { padding: '14px 20px', fontSize: 16, minHeight: 50 }

/** Selector de sucursal (las del usuario). Si solo tiene una, la muestra sin selector. */
export function SelectorSucursal({ value, onChange, label = 'Sucursal' }) {
  const { sedes } = useApp()
  if (sedes.length <= 1) return <div className="hint" style={{ marginBottom: 8 }}>{label}: <b>{sedes[0]?.nombre ?? '—'}</b></div>
  return <FormField label={label} as="select" value={value} onChange={e => onChange(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
}

/** Sucursal inicial: la activa o la primera disponible. */
export function useSucursalInicial(sucursalProp) {
  const { sedes, sedeActivaId } = useApp()
  const [sucursal, setSucursal] = useState(sucursalProp ?? sedeActivaId ?? sedes[0]?.id ?? '')
  useEffect(() => { if (sucursalProp) setSucursal(sucursalProp) }, [sucursalProp])
  useEffect(() => { if (!sucursal && sedes[0]?.id) setSucursal(sedes[0].id) }, [sedes, sucursal])
  return [sucursal, setSucursal]
}

/**
 * Botón de foto EN VIVO (sin galería). Sube la foto, la registra con el origen declarado y avisa con el id de la evidencia.
 * @param {string} tipoOrigen  recepcion | ticket_manual | talonario_auditoria | sello
 * @param {string} origenId    id del registro al que pertenecerá la foto (se genera en el cliente antes de la foto)
 */
export function FotoEnVivo({ titulo, tipoOrigen, origenId, sucursalId, evidenciaId, onFoto, obligatoria = true }) {
  const { organizacion } = useApp()
  const [abierta, setAbierta] = useState(false)
  const [lado, setLado] = useState(LADO_LARGO_POR_OMISION)
  useEffect(() => {
    if (sucursalId) ladoLargoFoto(sucursalId).then(r => { if (!r.error && r.data) setLado(Number(r.data)) })
  }, [sucursalId])
  async function subir({ blob, ancho, alto, hash }) {
    const r = await subirEvidencia({ organizacionId: organizacion?.id, sucursalId, tipoOrigen, origenId, blob, ancho, alto, hash })
    if (r.error) { const m = errMsg(r.error); toast.error(m, { duration: 9000 }); throw new Error(m) }
    onFoto(r.id)
  }
  return (
    <>
      <button type="button" className={evidenciaId ? 'btn o' : 'btn'} style={{ ...grande, width: '100%' }} disabled={!sucursalId} onClick={() => setAbierta(true)}>
        {evidenciaId ? <CheckCircle2 size={18} style={{ verticalAlign: -4, color: 'var(--green, #1a9d55)' }} /> : <Camera size={18} style={{ verticalAlign: -4 }} />}{' '}
        {evidenciaId ? `Foto lista · volver a tomar` : `${titulo}${obligatoria ? ' (obligatoria)' : ''}`}
      </button>
      {abierta && <CamaraEnVivo titulo={titulo} ladoLargo={lado} onFoto={subir} onClose={() => setAbierta(false)} />}
    </>
  )
}
