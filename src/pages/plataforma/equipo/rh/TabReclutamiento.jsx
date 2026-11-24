// Reclutamiento (E128): vacantes y embudo de candidatos. Clon de TabReclutamiento de IRP adaptado a vacantes/candidatos.
import { useMemo, useState } from 'react'
import { Plus, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import StatusBadge from '../../../../components/ui/StatusBadge'
import KPICard from '../../../../components/ui/KPICard'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar } from '../../../../lib/api'
import { supabase } from '../../../../lib/supabase'
import { urlFirmada, rutaStorage, BUCKETS } from '../../../../lib/urlFirmada'
import { fecha, telefono } from '../../../../lib/formato'
import { useVista, Estado, useEscribir, PUESTOS, etiquetaPuesto, textoError } from '../comun'
import ModalEmpleado from './ModalEmpleado'

const ETAPAS = [['recibido', 'Recibido'], ['entrevista', 'Entrevista'], ['prueba', 'Prueba'], ['oferta', 'Oferta'], ['contratado', 'Contratado'], ['descartado', 'Descartado']]
const COLOR_ETAPA = { recibido: 'var(--muted)', entrevista: 'var(--accent2)', prueba: 'var(--gold)', oferta: 'var(--accent)', contratado: 'var(--green)', descartado: 'var(--red)' }

export default function TabReclutamiento() {
  const puede = usePermiso('rh.editar')
  const { sedes, sedeActivaId, organizacion } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const qv = useVista('vacantes', 'prp_vacantes', { orden: [{ columna: 'fecha_apertura', asc: false }], limite: 300 })
  const qc = useVista('candidatos', 'candidatos', { orden: [{ columna: 'created_at', asc: false }], limite: 1000 }, { conSede: false })
  const [vacSel, setVacSel] = useState('')
  const [vac, setVac] = useState(null)
  const [cand, setCand] = useState(null)
  const [contratando, setContratando] = useState(null)
  const candidatos = useMemo(() => (qc.data ?? []).filter(c => !vacSel || c.vacante_id === vacSel), [qc.data, vacSel])
  const vacantes = qv.data ?? []
  const nombreVac = id => vacantes.find(v => v.id === id)?.titulo ?? '—'

  const guardarVac = async () => {
    if (!vac.titulo?.trim() || !vac.sede_id) { toast.error('Título y sede son obligatorios'); return }
    const fila = { sede_id: vac.sede_id, puesto: vac.puesto, titulo: vac.titulo.trim(), descripcion: vac.descripcion || null, estado: vac.estado, fecha_cierre: ['cubierta', 'cancelada'].includes(vac.estado) ? (vac.fecha_cierre ?? new Date().toISOString().slice(0, 10)) : null }
    const ok = await ejecutar(() => (vac.id ? actualizar('vacantes', vac.id, fila) : insertar('vacantes', fila)), 'Vacante guardada')
    if (ok) setVac(null)
  }
  const guardarCand = async () => {
    if (!cand.nombre?.trim() || !cand.vacante_id) { toast.error('Nombre y vacante son obligatorios'); return }
    let cv_path = cand.cv_path ?? null
    if (cand.archivo) {
      if (cand.archivo.size > 10 * 1024 * 1024) { toast.error('El CV excede 10 MB'); return }
      const ruta = rutaStorage(organizacion.id, 'rh/candidatos', `${crypto.randomUUID()}-${cand.archivo.name.replace(/[^\w.-]/g, '_')}`)
      const { error } = await supabase.storage.from(BUCKETS.documentos).upload(ruta, cand.archivo, { upsert: false })
      if (error) { toast.error(`No se pudo subir el CV: ${textoError(error)}`); return }
      cv_path = ruta
    }
    const fila = { vacante_id: cand.vacante_id, nombre: cand.nombre.trim(), email: cand.email || null, telefono: cand.telefono || null, etapa: cand.etapa ?? 'recibido', notas: cand.notas || null, cv_path }
    const ok = await ejecutar(() => (cand.id ? actualizar('candidatos', cand.id, fila) : insertar('candidatos', fila)), 'Candidato guardado')
    if (ok) setCand(null)
  }
  const mover = (c, etapa) => (etapa === 'contratado' ? setContratando(c) : ejecutar(() => actualizar('candidatos', c.id, { etapa }), `Movido a ${etapa}`))
  const verCv = async c => { const u = await urlFirmada(BUCKETS.documentos, c.cv_path, 300); if (u) window.open(u, '_blank', 'noopener'); else toast.error('No se pudo abrir el CV') }
  const vacContrata = contratando && vacantes.find(v => v.id === contratando.vacante_id)

  return (
    <Estado q={qv}>
      <div className="grid-kpis">
        <KPICard title="Vacantes abiertas" value={vacantes.filter(v => ['abierta', 'en_proceso'].includes(v.estado)).length} loading={qv.isLoading} />
        <KPICard title="Candidatos activos" value={vacantes.reduce((s, v) => s + Number(v.candidatos_activos ?? 0), 0)} color="var(--accent2)" loading={qv.isLoading} />
        <KPICard title="Contratados" value={(qc.data ?? []).filter(c => c.etapa === 'contratado').length} color="var(--green)" loading={qc.isLoading} />
      </div>
      <div className="toolbar">
        <FormField label="Vacante" as="select" placeholder="Todas" options={vacantes.map(v => ({ value: v.id, label: `${v.titulo} (${v.candidatos})` }))} value={vacSel} onChange={e => setVacSel(e.target.value)} style={{ maxWidth: 300 }} />
        {puede && <><button className="btn o sm" style={{ marginLeft: 'auto' }} onClick={() => setVac({ puesto: 'podologo', estado: 'abierta', sede_id: sedeActivaId ?? sedes[0]?.id ?? '' })}><Plus size={12} /> Vacante</button>
          <button className="btn sm" disabled={!vacantes.length} onClick={() => setCand({ vacante_id: vacSel || vacantes[0]?.id, etapa: 'recibido' })}><Plus size={12} /> Candidato</button></>}
      </div>
      <div className="card"><h3>Vacantes</h3>
        {!vacantes.length ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin vacantes. Crea una para empezar a recibir candidatos.</div> :
          <div className="tabla-wrap"><table><thead><tr><th>Vacante</th><th>Puesto</th><th>Sede</th><th>Apertura</th><th>Estado</th><th className="num">Candidatos</th><th /></tr></thead><tbody>
            {vacantes.map(v => <tr key={v.id}><td><b>{v.titulo}</b></td><td>{etiquetaPuesto(v.puesto)}</td><td>{sedes.find(s => s.id === v.sede_id)?.nombre ?? '—'}</td><td>{fecha(v.fecha_apertura)}</td><td><StatusBadge estado={v.estado} /></td><td className="num">{v.candidatos_activos}/{v.candidatos}</td>
              <td>{puede && <button className="btn o sm" onClick={() => setVac({ ...v })}>Editar</button>}</td></tr>)}
          </tbody></table></div>}
      </div>
      <h3 style={{ margin: '14px 0 8px', fontSize: 13 }}>Embudo de candidatos</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        {ETAPAS.map(([id, label]) => {
          const lista = candidatos.filter(c => c.etapa === id)
          return (
            <div key={id} className="card" style={{ padding: 10, borderTop: `3px solid ${COLOR_ETAPA[id]}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{label} <span className="bd n">{lista.length}</span></div>
              {lista.map(c => (
                <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 12 }}>
                  <b>{c.nombre}</b><div style={{ color: 'var(--muted)' }}>{nombreVac(c.vacante_id)}</div>
                  {c.telefono && <div>{telefono(c.telefono)}</div>}{c.email && <div>{c.email}</div>}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {c.cv_path && <button className="btn o sm" onClick={() => verCv(c)}><FileText size={11} /> CV</button>}
                    {puede && <><button className="btn o sm" onClick={() => setCand({ ...c })}>Editar</button>
                      <select value={c.etapa} onChange={e => mover(c, e.target.value)} style={{ fontSize: 11 }} aria-label="Mover de etapa">{ETAPAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></>}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <Modal open={!!vac} onClose={() => setVac(null)} title={vac?.id ? 'Editar vacante' : 'Nueva vacante'} size="sm" footer={<><button className="btn o" onClick={() => setVac(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardarVac}>Guardar</button></>}>
        {vac && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Título" value={vac.titulo ?? ''} onChange={e => setVac({ ...vac, titulo: e.target.value })} />
          <FormField label="Puesto" as="select" options={PUESTOS} value={vac.puesto} onChange={e => setVac({ ...vac, puesto: e.target.value })} />
          <FormField label="Sede" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={vac.sede_id} onChange={e => setVac({ ...vac, sede_id: e.target.value })} />
          <FormField label="Estado" as="select" options={['abierta', 'en_proceso', 'cubierta', 'cancelada'].map(v => ({ value: v, label: v.replace('_', ' ') }))} value={vac.estado} onChange={e => setVac({ ...vac, estado: e.target.value })} />
          <FormField label="Descripción" as="textarea" value={vac.descripcion ?? ''} onChange={e => setVac({ ...vac, descripcion: e.target.value })} />
        </div>}
      </Modal>
      <Modal open={!!cand} onClose={() => setCand(null)} title={cand?.id ? 'Editar candidato' : 'Nuevo candidato'} size="sm" footer={<><button className="btn o" onClick={() => setCand(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardarCand}>Guardar</button></>}>
        {cand && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Vacante" as="select" options={vacantes.map(v => ({ value: v.id, label: v.titulo }))} value={cand.vacante_id ?? ''} onChange={e => setCand({ ...cand, vacante_id: e.target.value })} />
          <FormField label="Nombre" value={cand.nombre ?? ''} onChange={e => setCand({ ...cand, nombre: e.target.value })} />
          <FormField label="Correo" value={cand.email ?? ''} onChange={e => setCand({ ...cand, email: e.target.value })} />
          <FormField label="Teléfono" value={cand.telefono ?? ''} onChange={e => setCand({ ...cand, telefono: e.target.value })} />
          <FormField label="Etapa" as="select" options={ETAPAS.filter(([k]) => k !== 'contratado').map(([value, label]) => ({ value, label }))} value={cand.etapa === 'contratado' ? 'oferta' : cand.etapa} onChange={e => setCand({ ...cand, etapa: e.target.value })} hint="Para contratar, muévelo a «Contratado» desde el embudo." />
          <div className="field"><label>CV (PDF o imagen, ≤ 10 MB)</label><input type="file" accept=".pdf,image/*" onChange={e => setCand({ ...cand, archivo: e.target.files?.[0] })} /></div>
          <FormField label="Notas" as="textarea" value={cand.notas ?? ''} onChange={e => setCand({ ...cand, notas: e.target.value })} />
        </div>}
      </Modal>
      <ModalEmpleado abierto={!!contratando} empleado={null} onClose={() => setContratando(null)} siguienteNumero=""
        inicial={contratando ? { nombre: contratando.nombre.split(' ')[0], apellido_pat: contratando.nombre.split(' ').slice(1).join(' '), email: contratando.email ?? '', telefono: contratando.telefono ?? '', puesto: vacContrata?.puesto ?? 'recepcion', sede_id: vacContrata?.sede_id ?? '', fecha_ingreso: new Date().toISOString().slice(0, 10) } : null}
        onGuardado={e => { if (e?.id) ejecutar(() => actualizar('candidatos', contratando.id, { etapa: 'contratado', empleado_id: e.id }), 'Candidato contratado y ligado al empleado') }} />
    </Estado>
  )
}
