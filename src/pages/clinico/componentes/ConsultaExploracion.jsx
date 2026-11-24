import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { leer, insertar, actualizar } from '../../../lib/api'
import Tabs from '../../../components/ui/Tabs'
import FormField from '../../../components/ui/FormField'
import { TIPOS_EXPLORACION, CAMPOS_EXPLORACION } from '../../../lib/clinico/catalogos'
import { normalizarItb } from '../../../lib/clinico/sinbad'
import ExploracionMI from './ExploracionMI'
import { Aviso, useAccion, mensajeError } from './comunes'

/** Exploración por tipo (dermatológica, ungueal, ortopédica, vascular, neurológica) + siluetas de miembro inferior. */
export default function ConsultaExploracion({ consultaId, pacienteId, editable, diabetico }) {
  const [tipo, setTipo] = useState('ungueal')
  const { ejecutar, ocupado } = useAccion()
  const q = useQuery({ queryKey: ['clinico', 'exploraciones', consultaId], queryFn: async () => { const r = await leer('exploraciones', { sedeCol: false, filtros: { consulta_id: consultaId } }); if (r.error) throw r.error; return r.data } })
  const fila = (q.data ?? []).find(x => x.tipo === tipo)
  const [datos, setDatos] = useState({})
  const [resumen, setResumen] = useState('')
  useEffect(() => { setDatos(fila?.datos ?? {}); setResumen(fila?.resumen ?? '') }, [fila?.id, tipo, q.data])
  const campos = CAMPOS_EXPLORACION[tipo] ?? []

  async function guardar() {
    const limpio = { ...datos }
    if (tipo === 'vascular') { const itb = normalizarItb(limpio.itb); if (itb === null) delete limpio.itb; else limpio.itb = itb } // P-011: jamás 0
    await ejecutar(() => (fila ? actualizar('exploraciones', fila.id, { datos: limpio, resumen: resumen || null }) : insertar('exploraciones', { consulta_id: consultaId, tipo, datos: limpio, resumen: resumen || null })),
      { ok: 'Exploración guardada', invalidar: ['clinico'] })
  }
  if (q.error) return <Aviso tipo="err">{mensajeError(q.error)}</Aviso>
  return (
    <div>
      <Tabs items={[...TIPOS_EXPLORACION.map(t => ({ id: t.value, label: t.label, badge: (q.data ?? []).some(x => x.tipo === t.value) ? '✓' : undefined })), { id: 'miembro', label: 'Miembro inferior (siluetas)' }]} value={tipo} onChange={setTipo} />
      {tipo === 'miembro' ? <ExploracionMI consultaId={consultaId} editable={editable} /> : (
        <>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0 }}>
            <div className="row">
              {campos.map(([k, label, opts]) => {
                const common = { key: k, label, value: datos[k] ?? '', onChange: e => setDatos(s => ({ ...s, [k]: e.target.value })) }
                if (Array.isArray(opts)) return <FormField {...common} as="select" options={opts.map(o => ({ value: o, label: o }))} />
                if (opts === 'num') return <FormField {...common} type="number" step="0.1" min="0" />
                return <FormField {...common} />
              })}
            </div>
            <FormField label="Resumen / observaciones de la exploración" as="textarea" value={resumen} onChange={e => setResumen(e.target.value)} />
          </fieldset>
          {editable && <button type="button" className="btn sm" disabled={ocupado} onClick={guardar}>Guardar exploración {TIPOS_EXPLORACION.find(t => t.value === tipo)?.label.toLowerCase()}</button>}
          {diabetico && <Link to={`/pie-diabetico/nueva?paciente=${pacienteId}&consulta=${consultaId}`} className="btn o sm" style={{ textDecoration: 'none', marginLeft: 8 }}>Evaluar pie diabético (SINBAD)</Link>}
        </>
      )}
    </div>
  )
}
