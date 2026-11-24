import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leer, insertar, actualizar, borrar } from '../../../lib/api'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import MapaPie from './MapaPie'
import { nombreZona, siguienteNumero } from '../../../lib/clinico/mapaPie'
import { TIPOS_HALLAZGO, GRAVEDAD_HALLAZGO, etiquetaDe } from '../../../lib/clinico/catalogos'
import { Aviso, useAccion, mensajeError, num } from './comunes'

const MARCAS = [{ value: 'lesion', label: 'Lesión (rojo)' }, { value: 'ungueal', label: 'Uña afectada (amarillo)' }]

/** Mapa interactivo del pie (4 vistas) + tabla de hallazgos de la consulta (# · pie · zona · hallazgo · gravedad). */
export default function ConsultaHallazgos({ consultaId, editable }) {
  const { ejecutar, ocupado } = useAccion()
  const [modal, setModal] = useState(null) // { punto?, hallazgo? }
  const [sel, setSel] = useState(null)
  const q = useQuery({
    queryKey: ['clinico', 'hallazgos', consultaId],
    queryFn: async () => { const r = await leer('hallazgos_pie', { sedeCol: false, filtros: { consulta_id: consultaId }, orden: { columna: 'numero' } }); if (r.error) throw r.error; return r.data },
  })
  const filas = q.data ?? []
  const [form, setForm] = useState({})
  const abrirNuevo = punto => {
    const esUna = /^una\d/.test(punto.zona_codigo)
    setForm({ tipo_hallazgo: esUna ? 'onicomicosis' : 'callosidad', marca: esUna ? 'ungueal' : 'lesion', gravedad: '', descripcion: '', medida_cm: '' })
    setModal({ punto })
  }
  const abrirEditar = h => { setForm({ tipo_hallazgo: h.tipo_hallazgo, marca: h.marca, gravedad: h.gravedad ?? '', descripcion: h.descripcion ?? '', medida_cm: h.medida_cm ?? '' }); setSel(h.numero); setModal({ hallazgo: h }) }

  async function guardar() {
    const cuerpo = { tipo_hallazgo: form.tipo_hallazgo, marca: form.marca, gravedad: form.gravedad || null, descripcion: form.descripcion?.trim() || null, medida_cm: num(form.medida_cm) }
    const r = await ejecutar(() => (modal.hallazgo
      ? actualizar('hallazgos_pie', modal.hallazgo.id, cuerpo)
      : insertar('hallazgos_pie', { consulta_id: consultaId, numero: siguienteNumero(filas), pie: modal.punto.pie, vista: modal.punto.vista, zona_codigo: modal.punto.zona_codigo, x: modal.punto.x, y: modal.punto.y, ...cuerpo })),
    { ok: 'Hallazgo guardado', invalidar: ['clinico'] })
    if (r) setModal(null)
  }
  async function quitar(h) { await ejecutar(() => borrar('hallazgos_pie', h.id), { ok: 'Hallazgo quitado', invalidar: ['clinico'] }); setModal(null) }

  if (q.error) return <Aviso tipo="err">{mensajeError(q.error)}</Aviso>
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
        {editable ? 'Haz clic en una zona o uña del pie para marcar un hallazgo. ' : ''}Amarillo = uña afectada · rojo = lesión. 4 vistas: dorsal y plantar de cada pie (D/I).
      </div>
      <MapaPie hallazgos={filas} onMarcar={editable ? abrirNuevo : undefined} onHallazgo={abrirEditar} seleccion={sel} />
      <table style={{ marginTop: 10 }}>
        <thead><tr><th>#</th><th>Pie</th><th>Vista</th><th>Zona / uña</th><th>Hallazgo</th><th>Gravedad</th></tr></thead>
        <tbody>
          {filas.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>Sin hallazgos marcados.</td></tr>}
          {filas.map(h => (
            <tr key={h.id} className="clickable" onClick={() => abrirEditar(h)}>
              <td>{h.numero}</td><td>{h.pie === 'D' ? 'Der.' : 'Izq.'}</td><td>{h.vista}</td><td>{nombreZona(h.zona_codigo)}</td>
              <td>{etiquetaDe(TIPOS_HALLAZGO, h.tipo_hallazgo)}{h.descripcion ? ` · ${h.descripcion}` : ''}{h.medida_cm != null ? ` · ${h.medida_cm} cm` : ''}</td><td>{h.gravedad ?? '—'}</td>
            </tr>))}
        </tbody>
      </table>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.hallazgo ? `Hallazgo ${modal.hallazgo.numero}` : 'Nuevo hallazgo'} size="sm"
        footer={<>
          {modal?.hallazgo && editable && <button type="button" className="btn red" disabled={ocupado} onClick={() => quitar(modal.hallazgo)} style={{ marginRight: 'auto' }}>Quitar</button>}
          <button type="button" className="btn o" onClick={() => setModal(null)}>{editable ? 'Cancelar' : 'Cerrar'}</button>
          {editable && <button type="button" className="btn" disabled={ocupado} onClick={guardar}>Guardar</button>}
        </>}>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>
          {modal?.punto && <>Pie {modal.punto.pie === 'D' ? 'derecho' : 'izquierdo'} · vista {modal.punto.vista} · <b>{nombreZona(modal.punto.zona_codigo)}</b></>}
          {modal?.hallazgo && <>Pie {modal.hallazgo.pie === 'D' ? 'derecho' : 'izquierdo'} · vista {modal.hallazgo.vista} · <b>{nombreZona(modal.hallazgo.zona_codigo)}</b></>}
        </div>
        <fieldset disabled={!editable} style={{ border: 0, padding: 0 }}>
          <FormField label="Hallazgo" as="select" options={TIPOS_HALLAZGO} value={form.tipo_hallazgo} onChange={e => setForm(s => ({ ...s, tipo_hallazgo: e.target.value }))} />
          <FormField label="Marca en el mapa" as="select" options={MARCAS} value={form.marca} onChange={e => setForm(s => ({ ...s, marca: e.target.value }))} />
          <FormField label="Gravedad" as="select" options={GRAVEDAD_HALLAZGO} value={form.gravedad} onChange={e => setForm(s => ({ ...s, gravedad: e.target.value }))} />
          <FormField label="Medida (cm)" type="number" step="0.1" min="0" value={form.medida_cm} onChange={e => setForm(s => ({ ...s, medida_cm: e.target.value }))} />
          <FormField label="Descripción" as="textarea" value={form.descripcion} onChange={e => setForm(s => ({ ...s, descripcion: e.target.value }))} />
        </fieldset>
      </Modal>
    </div>
  )
}
