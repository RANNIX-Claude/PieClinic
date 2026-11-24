import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leer } from '../../../lib/api'
import { upsertPor } from '../../../lib/clinico/db'
import { SILUETAS } from '../../../lib/clinico/impresos'
import FormField from '../../../components/ui/FormField'
import { Aviso, Chips, useAccion, mensajeError } from './comunes'

const ROT = [{ value: 'neutra', label: 'Neutra' }, { value: 'interna', label: 'Interna' }, { value: 'externa', label: 'Externa' }]
const TIPOS_PIE = [{ value: 'normal', label: 'Normal' }, { value: 'varo', label: 'Varo' }, { value: 'valgo', label: 'Valgo' }, { value: 'plano', label: 'Plano' }, { value: 'cavo', label: 'Cavo' }]
const VACIO = { siluetas: [], rotacion: '', talalgias: '', tipo_pie: '', huella_plantar: '', notas: '' }

/**
 * Exploración física del formato en papel: 5 siluetas de miembro inferior por pierna (D/I) + campos del reverso
 * (rotación, talalgias, tipo de pie, huella) marcados «por validar» (N-02). Se guarda por consulta.
 */
export default function ExploracionMI({ consultaId, editable }) {
  const [d, setD] = useState({ D: { ...VACIO }, I: { ...VACIO } })
  const { ejecutar, ocupado } = useAccion()
  const q = useQuery({
    queryKey: ['clinico', 'expl-mi', consultaId],
    enabled: !!consultaId,
    queryFn: async () => { const r = await leer('exploracion_miembro_inferior', { sedeCol: false, filtros: { consulta_id: consultaId } }); if (r.error) throw r.error; return r.data },
  })
  useEffect(() => {
    if (!q.data) return
    const n = { D: { ...VACIO }, I: { ...VACIO } }
    for (const x of q.data) n[x.pierna] = { siluetas: x.siluetas ?? [], rotacion: x.rotacion ?? '', talalgias: x.talalgias === null || x.talalgias === undefined ? '' : x.talalgias ? 'si' : 'no', tipo_pie: x.tipo_pie ?? '', huella_plantar: x.huella_plantar ?? '', notas: x.notas ?? '' }
    setD(n)
  }, [q.data])
  const set = (pierna, k, v) => setD(s => ({ ...s, [pierna]: { ...s[pierna], [k]: v } }))
  const guardar = () => ejecutar(async () => {
    for (const pierna of ['D', 'I']) {
      const x = d[pierna]
      const vacio = !x.siluetas.length && !x.rotacion && !x.talalgias && !x.tipo_pie && !x.huella_plantar && !x.notas
      if (vacio && !(q.data ?? []).some(r => r.pierna === pierna)) continue
      const r = await upsertPor('exploracion_miembro_inferior', {
        consulta_id: consultaId, pierna, siluetas: x.siluetas, rotacion: x.rotacion || null, talalgias: x.talalgias === '' ? null : x.talalgias === 'si',
        tipo_pie: x.tipo_pie || null, huella_plantar: x.huella_plantar || null, notas: x.notas || null,
      }, 'consulta_id,pierna')
      if (r.error) return r
    }
    return {}
  }, { ok: 'Exploración guardada', invalidar: ['clinico'] })
  if (!consultaId) return <Aviso>La exploración física se captura dentro de una consulta abierta. Abre una consulta para registrarla; aquí se muestra la última capturada.</Aviso>
  if (q.error) return <Aviso tipo="err">{mensajeError(q.error)}</Aviso>
  return (
    <div>
      <div className="grid2">
        {['D', 'I'].map(p => (
          <div key={p} className="card" style={{ background: 'var(--accent-light)' }}>
            <b>Pierna {p === 'D' ? 'derecha' : 'izquierda'}</b>
            <div style={{ margin: '8px 0' }}><Chips disabled={!editable} options={SILUETAS.map(([value, label]) => ({ value, label }))} value={d[p].siluetas} onChange={v => set(p, 'siluetas', v)} /></div>
            <div className="row">
              <FormField label="Rotación" as="select" disabled={!editable} options={ROT} value={d[p].rotacion} onChange={e => set(p, 'rotacion', e.target.value)} />
              <FormField label="Talalgias" as="select" disabled={!editable} options={[{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }]} value={d[p].talalgias} onChange={e => set(p, 'talalgias', e.target.value)} />
              <FormField label="Tipo de pie" as="select" disabled={!editable} options={TIPOS_PIE} value={d[p].tipo_pie} onChange={e => set(p, 'tipo_pie', e.target.value)} />
            </div>
            <FormField label="Huella plantar" disabled={!editable} value={d[p].huella_plantar} onChange={e => set(p, 'huella_plantar', e.target.value)} />
            <FormField label="Notas" as="textarea" disabled={!editable} value={d[p].notas} onChange={e => set(p, 'notas', e.target.value)} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0' }}>Rotación, talalgias, tipo de pie y huella son campos del reverso del formato, <b>por validar</b> con el formato completo (N-02).</div>
      {editable && <button type="button" className="btn sm" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar exploración'}</button>}
    </div>
  )
}
