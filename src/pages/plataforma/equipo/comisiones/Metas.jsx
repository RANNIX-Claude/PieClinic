// Metas de ocupación e ingreso por sede o por podólogo (E133). El podólogo ve las suyas y las de su sede.
import { useState } from 'react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, borrar } from '../../../../lib/api'
import { moneda, fecha } from '../../../../lib/formato'
import { useVista, Estado, useEscribir, nSede, hoy } from '../comun'

export default function Metas({ admin }) {
  const puede = usePermiso('rh.editar')
  const { sedes } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const q = useVista('metas', 'prp_metas', { orden: [{ columna: 'desde', asc: false }], limite: 300 }, { conSede: false })
  const qe = useVista('podologos', 'prp_empleados', { filtros: { puesto: 'podologo', estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 200 }, { habilitado: admin })
  const [f, setF] = useState(null)
  const nombre = id => (qe.data ?? []).find(e => e.id === id)?.nombre_completo ?? '—'
  const guardar = async () => {
    if (f.ambito === 'sede' && !f.sede_id) { toast.error('Elige la sede'); return }
    if (f.ambito === 'podologo' && !f.empleado_id) { toast.error('Elige el podólogo'); return }
    if (!f.hasta || f.hasta < f.desde) { toast.error('Fechas inválidas'); return }
    if (f.meta_ocupacion === '' && f.meta_ingreso === '') { toast.error('Captura la meta de ocupación o de ingreso'); return }
    const ok = await ejecutar(() => insertar('metas', { ambito: f.ambito, sede_id: f.ambito === 'sede' ? f.sede_id : null, empleado_id: f.ambito === 'podologo' ? f.empleado_id : null, desde: f.desde, hasta: f.hasta,
      meta_ocupacion: f.meta_ocupacion === '' ? null : Number(f.meta_ocupacion), meta_ingreso: f.meta_ingreso === '' ? null : Number(f.meta_ingreso) }), 'Meta guardada')
    if (ok) setF(null)
  }
  return (
    <>
      {admin && puede && <div className="toolbar"><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setF({ ambito: 'sede', desde: hoy().slice(0, 8) + '01', hasta: '', meta_ocupacion: '', meta_ingreso: '' })}>+ Nueva meta</button></div>}
      <Estado q={q}>
        <DataTable exportarNombre="metas" filas={q.data ?? []} vacio={{ title: 'Sin metas', description: admin ? 'Define metas de ocupación (%) e ingreso por sede o podólogo.' : 'Administración aún no define metas.' }}
          columnas={[
            { key: 'ambito', label: 'Ámbito', filtro: true, valor: m => (m.ambito === 'sede' ? 'Sede' : 'Podólogo') },
            { key: 'quien', label: 'Quién', valor: m => (m.ambito === 'sede' ? nSede(sedes, m.sede_id) : nombre(m.empleado_id)) },
            { key: 'desde', label: 'Periodo', render: m => `${fecha(m.desde)} – ${fecha(m.hasta)}` },
            { key: 'meta_ocupacion', label: 'Meta de ocupación', align: 'right', render: m => (m.meta_ocupacion == null ? '—' : `${m.meta_ocupacion}%`) },
            { key: 'meta_ingreso', label: 'Meta de ingreso', align: 'right', render: m => (m.meta_ingreso == null ? '—' : moneda(m.meta_ingreso)) },
            { key: 'a', label: '', sortable: false, exportar: false, render: m => admin && puede && <button className="btn o sm" onClick={() => ejecutar(() => borrar('metas', m.id), 'Meta eliminada')}>Eliminar</button> },
          ]} />
      </Estado>
      <Modal open={!!f} onClose={() => setF(null)} size="sm" title="Nueva meta" footer={<><button className="btn o" onClick={() => setF(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {f && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Ámbito" as="select" options={[{ value: 'sede', label: 'Sede' }, { value: 'podologo', label: 'Podólogo' }]} value={f.ambito} onChange={e => setF({ ...f, ambito: e.target.value })} />
          {f.ambito === 'sede' ? <FormField label="Sede" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id ?? ''} onChange={e => setF({ ...f, sede_id: e.target.value })} />
            : <FormField label="Podólogo" as="select" options={(qe.data ?? []).map(e => ({ value: e.id, label: e.nombre_completo }))} value={f.empleado_id ?? ''} onChange={e => setF({ ...f, empleado_id: e.target.value })} />}
          <FormField label="Desde" type="date" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} />
          <FormField label="Hasta" type="date" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} />
          <FormField label="Meta de ocupación (%)" type="number" min="0" max="100" step="0.1" value={f.meta_ocupacion} onChange={e => setF({ ...f, meta_ocupacion: e.target.value })} />
          <FormField label="Meta de ingreso (MXN)" type="number" min="0" step="0.01" value={f.meta_ingreso} onChange={e => setF({ ...f, meta_ingreso: e.target.value })} />
        </div>}
      </Modal>
    </>
  )
}
