// Esquemas de comisión por podólogo con vigencia (E131). P-106: no hay % por defecto, lo fija el cliente. P-108: un esquema
// nuevo cierra el anterior (trigger) y no recalcula lo ya comisionado.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar } from '../../../../lib/api'
import { moneda, fecha } from '../../../../lib/formato'
import { useVista, Estado, useEscribir, hoy } from '../comun'

const VACIO = { tipo: 'porcentaje', nombre: '', pct_servicio: '', pct_producto: '', pct_plan: '', viatico_por_cita: '', piso_periodo: '', vigente_desde: hoy(), notas: '' }

export default function Esquemas({ ESQ }) {
  const puede = usePermiso('rh.editar')
  const { ejecutar, ocupado } = useEscribir()
  const q = useVista('esquemas', 'prp_esquemas_comision', { orden: [{ columna: 'nombre_completo' }, { columna: 'vigente_desde', asc: false }], limite: 500 }, { conSede: false })
  const qe = useVista('podologos', 'prp_empleados', { filtros: { puesto: 'podologo', estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 200 })
  const [f, setF] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const guardar = async () => {
    const pcts = ['pct_servicio', 'pct_producto', 'pct_plan']
    if (!f.empleado_id) { toast.error('Elige el podólogo'); return }
    if (pcts.some(k => f[k] === '' || Number(f[k]) < 0 || Number(f[k]) > 100)) { toast.error('Captura los tres porcentajes (0 a 100): no hay valor por defecto'); return }
    const ok = await ejecutar(() => insertar('esquemas_comision', {
      empleado_id: f.empleado_id, nombre: f.nombre.trim() || ESQ[f.tipo], tipo: f.tipo, pct_servicio: Number(f.pct_servicio), pct_producto: Number(f.pct_producto), pct_plan: Number(f.pct_plan),
      viatico_por_cita: Number(f.viatico_por_cita) || 0, piso_periodo: Number(f.piso_periodo) || 0, vigente_desde: f.vigente_desde, notas: f.notas || null }), 'Esquema creado; el anterior se cerró el día previo')
    if (ok) setF(null)
  }
  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Los porcentajes los fija el cliente (P-106). La comisión usa el esquema vigente a la fecha del servicio y no se recalcula (P-108).</span>
        {puede && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setF({ ...VACIO })}><Plus size={12} style={{ verticalAlign: -2 }} /> Nuevo esquema</button>}
      </div>
      <Estado q={q}>
        <DataTable exportarNombre="esquemas_comision" filas={q.data ?? []} vacio={{ title: 'Sin esquemas', description: 'Sin esquema vigente no se puede registrar comisión de un podólogo.' }}
          columnas={[
            { key: 'nombre_completo', label: 'Podólogo' }, { key: 'nombre', label: 'Esquema' },
            { key: 'tipo', label: 'Tipo', filtro: true, valor: e => ESQ[e.tipo] },
            { key: 'pct_servicio', label: '% servicio', align: 'right', render: e => `${e.pct_servicio}%` },
            { key: 'pct_producto', label: '% producto', align: 'right', render: e => `${e.pct_producto}%` },
            { key: 'pct_plan', label: '% plan', align: 'right', render: e => `${e.pct_plan}%` },
            { key: 'viatico_por_cita', label: 'Viático/cita', align: 'right', render: e => (Number(e.viatico_por_cita) ? moneda(e.viatico_por_cita) : '—') },
            { key: 'piso_periodo', label: 'Piso', align: 'right', render: e => (Number(e.piso_periodo) ? moneda(e.piso_periodo) : '—') },
            { key: 'vigente_desde', label: 'Vigencia', render: e => `${fecha(e.vigente_desde)} – ${e.vigente_hasta ? fecha(e.vigente_hasta) : 'actual'}` },
            { key: 'vigente', label: 'Estado', valor: e => (e.vigente ? 'Vigente' : e.activo ? 'Histórico' : 'Inactivo'), filtro: true, render: e => <span className={`bd ${e.vigente ? 'v' : 'n'}`}>{e.vigente ? 'Vigente' : e.activo ? 'Histórico' : 'Inactivo'}</span> },
            { key: 'a', label: '', sortable: false, exportar: false, render: e => puede && e.vigente && <button className="btn o sm" onClick={() => ejecutar(() => actualizar('esquemas_comision', e.id, { activo: false }), 'Esquema desactivado')}>Desactivar</button> },
          ]} />
      </Estado>
      <Modal open={!!f} onClose={() => setF(null)} size="wide" title="Nuevo esquema de comisión" cerrarAlClicFuera={false} footer={<><button className="btn o" onClick={() => setF(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar esquema</button></>}>
        {f && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <FormField label="Podólogo" as="select" options={(qe.data ?? []).map(e => ({ value: e.id, label: e.nombre_completo }))} value={f.empleado_id ?? ''} onChange={e => set('empleado_id', e.target.value)} />
          <FormField label="Tipo de esquema" as="select" options={Object.entries(ESQ).map(([value, label]) => ({ value, label }))} value={f.tipo} onChange={e => set('tipo', e.target.value)} />
          <FormField label="Nombre (opcional)" value={f.nombre} onChange={e => set('nombre', e.target.value)} />
          <FormField label="Vigente desde" type="date" value={f.vigente_desde} onChange={e => set('vigente_desde', e.target.value)} />
          <FormField label="% sobre servicio" type="number" step="0.01" min="0" max="100" value={f.pct_servicio} onChange={e => set('pct_servicio', e.target.value)} />
          <FormField label="% sobre producto" type="number" step="0.01" min="0" max="100" value={f.pct_producto} onChange={e => set('pct_producto', e.target.value)} />
          <FormField label="% sobre plan (por sesión)" type="number" step="0.01" min="0" max="100" value={f.pct_plan} onChange={e => set('pct_plan', e.target.value)} />
          {f.tipo === 'porcentaje_viatico' && <FormField label="Viático por cita (MXN)" type="number" step="0.01" min="0" value={f.viatico_por_cita} onChange={e => set('viatico_por_cita', e.target.value)} />}
          <FormField label="Piso del periodo (MXN, opcional)" type="number" step="0.01" min="0" value={f.piso_periodo} onChange={e => set('piso_periodo', e.target.value)} hint="Si la comisión queda por debajo, se paga el piso." />
          <FormField label="Notas" as="textarea" value={f.notas} onChange={e => set('notas', e.target.value)} style={{ gridColumn: '1 / -1' }} />
        </div>}
      </Modal>
    </>
  )
}
