// Nueva solicitud de mantenimiento (cualquier rol). La BD la crea siempre como «solicitado» y asigna el folio OT-NNNN.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { insertar } from '../../../../lib/api'
import { useVista, useEscribir, textoError } from '../comun'
import { subirEvidencia } from './evidencias'

export default function NuevaOT({ abierto, onClose, equipos }) {
  const { sedes, sedeActivaId, organizacion } = useApp()
  const gestionar = usePermiso('mantenimiento.gestionar')
  const { ejecutar, ocupado } = useEscribir()
  const [f, setF] = useState({})
  const [fotos, setFotos] = useState([])
  const qc = useVista('cat-ot', 'prp_catalogos', { filtros: { catalogo: 'categoria_ot', activo: true }, orden: [{ columna: 'orden' }] }, { conSede: false, habilitado: abierto })
  const qp = useVista('prov-mant', 'prp_proveedores', { filtros: { activo: true }, orden: [{ columna: 'nombre' }], limite: 300 }, { conSede: false, habilitado: abierto && gestionar })
  useEffect(() => { if (abierto) { setF({ sede_id: sedeActivaId ?? (sedes.length === 1 ? sedes[0].id : ''), tipo: 'normal', asignar: 'pendiente' }); setFotos([]) } }, [abierto]) // eslint-disable-line
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const eqSede = equipos.filter(e => e.sede_id === f.sede_id && e.estado_base !== 'baja')

  async function enviar() {
    if (!f.sede_id || !f.categoria || !f.descripcion?.trim()) { toast.error('Sede, categoría y descripción son obligatorias'); return }
    let creada
    const fila = { sede_id: f.sede_id, categoria: f.categoria, tipo: f.tipo, equipo_id: f.equipo_id || null, descripcion: f.descripcion.trim(), programada_para: f.programada_para || null,
      costo_estimado: f.costo_estimado === '' || f.costo_estimado == null ? null : Number(f.costo_estimado) }
    if (gestionar) {
      if (f.asignar === 'interno') fila.asignado_interno = true
      else if (f.asignar === 'proveedor' && f.proveedor_id) { fila.asignado_proveedor_id = f.proveedor_id; fila.asignado_texto = qp.data?.find(p => p.id === f.proveedor_id)?.nombre }
    }
    const ok = await ejecutar(async () => {
      const r = await insertar('ordenes_trabajo', fila)
      if (r.error) return r
      creada = r.data?.[0]
      for (const a of fotos) { const e = await subirEvidencia({ organizacionId: organizacion.id, ordenId: creada.id, archivo: a }); if (e.error) toast.error(textoError(e.error)) }
      return r
    }, null)
    if (ok) { toast.success(`Solicitud ${creada?.folio ?? ''} enviada`); onClose() }
  }
  return (
    <Modal open={abierto} onClose={onClose} title="Nueva solicitud de mantenimiento" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado} onClick={enviar}>{ocupado ? 'Enviando…' : 'Enviar solicitud'}</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <FormField label="Sede" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id ?? ''} onChange={e => setF(x => ({ ...x, sede_id: e.target.value, equipo_id: '' }))} />
        <FormField label="Categoría" as="select" options={(qc.data ?? []).map(c => ({ value: c.nombre, label: c.nombre }))} value={f.categoria ?? ''} onChange={e => set('categoria', e.target.value)} />
        <FormField label="Tipo" as="select" options={[{ value: 'normal', label: 'Normal' }, { value: 'urgente', label: 'Urgente' }, { value: 'preventivo', label: 'Preventivo' }]} value={f.tipo} onChange={e => set('tipo', e.target.value)} hint={f.tipo === 'urgente' ? 'El equipo ligado pasa a «falla» hasta que se atienda.' : undefined} />
        <FormField label="Equipo ligado (opcional)" as="select" placeholder="Ninguno" options={eqSede.map(e => ({ value: e.id, label: e.nombre }))} value={f.equipo_id ?? ''} onChange={e => set('equipo_id', e.target.value)} />
        <FormField label="Qué reparar" as="textarea" placeholder="Describe la falla…" value={f.descripcion ?? ''} onChange={e => set('descripcion', e.target.value)} style={{ gridColumn: '1 / -1' }} />
        <FormField label="Costo estimado (MXN, opcional)" type="number" min="0" step="0.01" value={f.costo_estimado ?? ''} onChange={e => set('costo_estimado', e.target.value)} />
        <FormField label="Programada para (opcional)" type="date" value={f.programada_para ?? ''} onChange={e => set('programada_para', e.target.value)} />
        {gestionar && <>
          <FormField label="Asignar a" as="select" options={[{ value: 'pendiente', label: 'Por definir' }, { value: 'interno', label: 'Mantenimiento interno' }, { value: 'proveedor', label: 'Proveedor' }]} value={f.asignar} onChange={e => set('asignar', e.target.value)} />
          {f.asignar === 'proveedor' && <FormField label="Proveedor" as="select" options={(qp.data ?? []).map(p => ({ value: p.id, label: p.nombre }))} value={f.proveedor_id ?? ''} onChange={e => set('proveedor_id', e.target.value)} />}
        </>}
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Fotos o PDF de la falla (opcional, ≤ 10 MB c/u)</label>
          <input type="file" multiple accept="image/*,application/pdf" onChange={e => setFotos([...e.target.files])} />
          {fotos.length > 0 && <span className="hint">{fotos.length} archivo(s) se subirán al enviar</span>}</div>
      </div>
    </Modal>
  )
}
