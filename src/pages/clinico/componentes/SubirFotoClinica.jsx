import { useState } from 'react'
import FotoUploader from '../../../components/ui/FotoUploader'
import FormField from '../../../components/ui/FormField'
import { useApp } from '../../../context/AppContext'
import { insertar, leer } from '../../../lib/api'
import { BUCKETS } from '../../../lib/urlFirmada'
import { MOMENTOS_FOTO, VISTAS_FOTO, NIVELES_AUTORIZACION } from '../../../lib/clinico/catalogos'
import { fotoExcedeLimiteBlando } from '../../../lib/clinico/inmutabilidad'
import { zonasDeVista } from '../../../lib/clinico/mapaPie'
import { Aviso, useAccion } from './comunes'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'

/**
 * Sube una foto clínica a storage PRIVADO (≤ 2048 px, ≤ 10 MB) y registra la fila en fotos_clinicas.
 * El nivel «docencia» exige autorización vigente (la BD lo valida) y difuminado de rostro e identificadores (P-009).
 * consulta: { id, paciente_id, sede_id }
 */
export default function SubirFotoClinica({ consulta, defaults = {}, onSubida, disabled }) {
  const { perfil } = useApp()
  const { ejecutar } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const [f, setF] = useState({ pie: 'I', vista: 'dorsal', zona_codigo: '', momento: 'antes', nivel_autorizacion: 'clinico', comentario: '', difuminada: false, ...defaults })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const zonas = zonasDeVista(f.vista === 'plantar' ? 'plantar' : 'dorsal')

  async function registrar({ ruta, bytes }) {
    let excede = false
    const c = await leer('prp_fotos_clinicas', { sedeCol: false, filtros: { consulta_id: consulta.id, retirada: false }, columnas: 'id', contar: true, limite: 1 })
    if (fotoExcedeLimiteBlando(c.count ?? 0)) {
      if (!(await confirmar({ titulo: 'Más de 10 fotos en la sesión', mensaje: 'Se rebasa el límite recomendado de 10 fotos por sesión (P-007). ¿Registrar de todos modos?', textoConfirmar: 'Registrar' }))) return
      excede = true
    }
    const r = await ejecutar(() => insertar('fotos_clinicas', {
      paciente_id: consulta.paciente_id, consulta_id: consulta.id, sede_id: consulta.sede_id, archivo_path: ruta, mime: 'image/jpeg', tamano_bytes: bytes,
      pie: f.pie || null, vista: f.vista || null, zona_codigo: f.zona_codigo || null, momento: f.momento, nivel_autorizacion: f.nivel_autorizacion,
      difuminada: f.nivel_autorizacion === 'docencia' ? f.difuminada : false, origen: 'clinica', comentario: f.comentario || null,
      tomada_en: new Date().toISOString(), subida_por: perfil?.id, confirmo_excedente: excede,
    }), { ok: 'Foto registrada', invalidar: ['clinico'] })
    if (r) onSubida?.(r.data?.[0])
  }

  return (
    <div className="card" style={{ background: 'var(--accent-light)' }}>
      <div className="row">
        <FormField label="Pie" as="select" options={[{ value: 'D', label: 'Derecho' }, { value: 'I', label: 'Izquierdo' }]} value={f.pie} onChange={set('pie')} />
        <FormField label="Ángulo" as="select" options={VISTAS_FOTO} value={f.vista} onChange={set('vista')} />
        <FormField label="Zona" as="select" options={zonas.map(z => ({ value: z.codigo, label: z.nombre }))} value={f.zona_codigo} onChange={set('zona_codigo')} />
        <FormField label="Momento" as="select" options={MOMENTOS_FOTO} value={f.momento} onChange={set('momento')} />
        <FormField label="Autorización del paciente" as="select" options={NIVELES_AUTORIZACION} value={f.nivel_autorizacion} onChange={set('nivel_autorizacion')} />
      </div>
      {f.nivel_autorizacion === 'docencia' && (
        <Aviso>Solo con autorización escrita vigente y siempre con rostro e identificadores difuminados (P-009). El difuminado automático de la imagen aún no está disponible: confirma que la foto ya no muestra rostro ni identificadores.
          <label style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={f.difuminada} onChange={e => setF(s => ({ ...s, difuminada: e.target.checked }))} /> Confirmo que la imagen está difuminada</label></Aviso>)}
      <FormField label="Comentario" value={f.comentario} onChange={set('comentario')} />
      <FotoUploader bucket={BUCKETS.fotos} carpeta={`${consulta.paciente_id}/${consulta.id}`} disabled={disabled || (f.nivel_autorizacion === 'docencia' && !f.difuminada)} etiqueta="Subir foto" onSubida={registrar} />
      {dialogo}
    </div>
  )
}
