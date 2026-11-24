// Equipo e instrumental (E134): estado derivado (vencido = servicio vencido), próximo servicio y alta/edición (solo Administración).
import { useState } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar } from '../../../../lib/api'
import { fecha } from '../../../../lib/formato'
import { useVista, Estado, useEscribir } from '../comun'

const VACIO = { nombre: '', categoria: '', marca: '', modelo: '', serie: '', fecha_compra: '', ultimo_servicio: '', proximo_servicio: '', periodicidad_dias: '', estado: 'vigente', notas: '' }

export default function Equipos({ q }) {
  const gestionar = usePermiso('mantenimiento.gestionar')
  const { sedes, sedeActivaId } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const qc = useVista('cat-ot', 'prp_catalogos', { filtros: { catalogo: 'categoria_ot', activo: true }, orden: [{ columna: 'orden' }] }, { conSede: false, habilitado: gestionar })
  const [f, setF] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const guardar = async () => {
    if (!f.nombre.trim() || !f.sede_id) { toast.error('Nombre y sede son obligatorios'); return }
    const n = k => (f[k] === '' || f[k] == null ? null : f[k])
    const fila = { sede_id: f.sede_id, nombre: f.nombre.trim(), categoria: n('categoria'), marca: n('marca'), modelo: n('modelo'), serie: n('serie'), fecha_compra: n('fecha_compra'), ultimo_servicio: n('ultimo_servicio'),
      proximo_servicio: n('proximo_servicio'), periodicidad_dias: f.periodicidad_dias === '' ? null : Number(f.periodicidad_dias), estado: f.estado, notas: n('notas') }
    if (!fila.proximo_servicio && fila.ultimo_servicio && fila.periodicidad_dias) { const d = new Date(`${fila.ultimo_servicio}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + fila.periodicidad_dias); fila.proximo_servicio = d.toISOString().slice(0, 10) }
    const ok = await ejecutar(() => (f.id ? actualizar('equipos', f.id, fila) : insertar('equipos', fila)), 'Equipo guardado')
    if (ok) setF(null)
  }
  return (
    <>
      {gestionar && <div className="toolbar"><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setF({ ...VACIO, sede_id: sedeActivaId ?? sedes[0]?.id ?? '' })}><Plus size={12} style={{ verticalAlign: -2 }} /> Nuevo equipo</button></div>}
      <Estado q={q}>
        <DataTable exportarNombre="equipos" filas={q.data ?? []} vacio={{ title: 'Sin equipos registrados', description: gestionar ? 'Registra equipo e instrumental para llevar su calendario de servicio.' : 'Administración aún no registra equipos.' }}
          columnas={[
            { key: 'nombre', label: 'Equipo', render: e => <b>{e.nombre}</b> }, { key: 'sede_nombre', label: 'Sede', filtro: true }, { key: 'categoria', label: 'Categoría', filtro: true },
            { key: 'marca', label: 'Marca / modelo', valor: e => [e.marca, e.modelo].filter(Boolean).join(' ') }, { key: 'serie', label: 'Serie' },
            { key: 'ultimo_servicio', label: 'Último servicio', render: e => (e.ultimo_servicio ? fecha(e.ultimo_servicio) : '—') },
            { key: 'proximo_servicio', label: 'Próximo', render: e => (e.proximo_servicio ? <span>{fecha(e.proximo_servicio)}<span style={{ color: e.dias_para_servicio < 0 ? 'var(--red)' : 'var(--muted)', fontSize: 11 }}> ({e.dias_para_servicio < 0 ? `vencido ${-e.dias_para_servicio} d` : `en ${e.dias_para_servicio} d`})</span></span> : '—') },
            { key: 'estado', label: 'Estado', filtro: true, render: e => <StatusBadge estado={e.estado} label={e.estado === 'falla' ? 'Falla' : undefined} /> },
            { key: 'a', label: '', sortable: false, exportar: false, render: e => gestionar && <button className="btn o sm" onClick={() => setF({ ...VACIO, ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? ''])), estado: e.estado_base })}>Editar</button> },
          ]} />
      </Estado>
      <Modal open={!!f} onClose={() => setF(null)} size="wide" title={f?.id ? 'Editar equipo' : 'Nuevo equipo'} cerrarAlClicFuera={false} footer={<><button className="btn o" onClick={() => setF(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {f && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <FormField label="Nombre" value={f.nombre} onChange={e => set('nombre', e.target.value)} />
          <FormField label="Sede" as="select" disabled={!!f.id} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id} onChange={e => set('sede_id', e.target.value)} />
          <FormField label="Categoría" as="select" options={(qc.data ?? []).map(c => ({ value: c.nombre, label: c.nombre }))} value={f.categoria} onChange={e => set('categoria', e.target.value)} />
          <FormField label="Marca" value={f.marca} onChange={e => set('marca', e.target.value)} /><FormField label="Modelo" value={f.modelo} onChange={e => set('modelo', e.target.value)} /><FormField label="Serie" value={f.serie} onChange={e => set('serie', e.target.value)} />
          <FormField label="Fecha de compra" type="date" value={f.fecha_compra} onChange={e => set('fecha_compra', e.target.value)} />
          <FormField label="Último servicio" type="date" value={f.ultimo_servicio} onChange={e => set('ultimo_servicio', e.target.value)} />
          <FormField label="Periodicidad (días)" type="number" min="1" value={f.periodicidad_dias} onChange={e => set('periodicidad_dias', e.target.value)} />
          <FormField label="Próximo servicio" type="date" value={f.proximo_servicio} onChange={e => set('proximo_servicio', e.target.value)} hint="Vacío = último servicio + periodicidad." />
          <FormField label="Estado" as="select" options={[{ value: 'vigente', label: 'Vigente' }, { value: 'falla', label: 'Falla' }, { value: 'en_proceso', label: 'En proceso' }, { value: 'baja', label: 'Baja' }]} value={f.estado} onChange={e => set('estado', e.target.value)} />
          <FormField label="Notas" as="textarea" value={f.notas} onChange={e => set('notas', e.target.value)} style={{ gridColumn: '1 / -1' }} />
        </div>}
      </Modal>
    </>
  )
}
