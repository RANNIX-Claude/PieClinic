// Presupuesto mensual de mantenimiento por sede contra el costo real de las OT cerradas (CA-19).
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import { insertar, actualizar } from '../../../../lib/api'
import { moneda } from '../../../../lib/formato'
import { Estado, useEscribir, nSede, nombreMes, hoy } from '../comun'

export default function Presupuesto({ qMes, qPres, sedes }) {
  const { ejecutar, ocupado } = useEscribir()
  const [f, setF] = useState(null)
  const filas = useMemo(() => {
    const m = new Map()
    ;(qMes.data ?? []).forEach(x => m.set(`${x.sede_id}|${x.mes}`, { sede_id: x.sede_id, mes: x.mes, costo: Number(x.costo_real), ordenes: x.ordenes_cerradas, presupuesto: null, id: null }))
    ;(qPres.data ?? []).forEach(p => { const k = `${p.sede_id}|${p.mes}`; m.set(k, { ...(m.get(k) ?? { sede_id: p.sede_id, mes: p.mes, costo: 0, ordenes: 0 }), presupuesto: Number(p.monto), id: p.id }) })
    return [...m.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1))
  }, [qMes.data, qPres.data])
  const guardar = async () => {
    if (!f.sede_id || !f.mes || f.monto === '' || Number(f.monto) < 0) { toast.error('Sede, mes y monto son obligatorios'); return }
    const mes = `${f.mes}-01`
    const existente = filas.find(x => x.sede_id === f.sede_id && x.mes === mes && x.id)
    const ok = await ejecutar(() => (existente ? actualizar('mantenimiento_presupuestos', existente.id, { monto: Number(f.monto) }) : insertar('mantenimiento_presupuestos', { sede_id: f.sede_id, mes, monto: Number(f.monto) })), 'Presupuesto guardado')
    if (ok) setF(null)
  }
  return (
    <>
      <div className="toolbar"><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setF({ sede_id: sedes[0]?.id ?? '', mes: hoy().slice(0, 7), monto: '' })}>+ Presupuesto del mes</button></div>
      <Estado q={qMes}>
        <DataTable exportarNombre="mantenimiento_presupuesto" filas={filas} filaKey="mes" vacio={{ title: 'Sin datos', description: 'Aparecen al cerrar órdenes o definir un presupuesto.' }}
          columnas={[
            { key: 'mes', label: 'Mes', render: r => nombreMes(r.mes) }, { key: 'sede_id', label: 'Sede', valor: r => nSede(sedes, r.sede_id), filtro: true },
            { key: 'ordenes', label: 'OT cerradas', align: 'right' }, { key: 'costo', label: 'Costo real', align: 'right', render: r => moneda(r.costo) },
            { key: 'presupuesto', label: 'Presupuesto', align: 'right', render: r => (r.presupuesto == null ? '—' : moneda(r.presupuesto)) },
            { key: 'dif', label: 'Diferencia', align: 'right', valor: r => (r.presupuesto == null ? null : r.presupuesto - r.costo), render: r => (r.presupuesto == null ? '—' : <span style={{ color: r.costo > r.presupuesto ? 'var(--red)' : 'var(--green)' }}>{moneda(r.presupuesto - r.costo)}</span>) },
          ]} />
      </Estado>
      <Modal open={!!f} onClose={() => setF(null)} size="sm" title="Presupuesto de mantenimiento" footer={<><button className="btn o" onClick={() => setF(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {f && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Sede" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id} onChange={e => setF({ ...f, sede_id: e.target.value })} />
          <FormField label="Mes" type="month" value={f.mes} onChange={e => setF({ ...f, mes: e.target.value })} />
          <FormField label="Monto (MXN)" type="number" min="0" step="0.01" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} />
        </div>}
      </Modal>
    </>
  )
}
