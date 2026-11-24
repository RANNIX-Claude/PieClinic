// Horarios laborales por empleado (E125): lunes a domingo, entrada/salida/descanso con vigencia (clon de TabHorariosGuardia de IRP).
import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import Modal from '../../../../components/ui/Modal'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar, borrar } from '../../../../lib/api'
import { useVista, Estado, useEscribir, DIAS, hoy } from '../comun'

const hhmm = t => (t ? String(t).slice(0, 5) : '')
const ayer = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }

export default function TabHorarios() {
  const puede = usePermiso('rh.editar')
  const { ejecutar, ocupado } = useEscribir()
  const qe = useVista('empleados-activos', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 500 })
  const qh = useVista('horarios', 'prp_horarios_laborales', { filtros: { activo: true }, limite: 3000 })
  const [edit, setEdit] = useState(null) // { emp, dias: {1:{entrada,salida,descanso_min}} }
  const vigentes = useMemo(() => { const m = {}; (qh.data ?? []).filter(h => !h.vigente_hasta).forEach(h => { (m[h.empleado_id] ??= {})[h.dia_semana] = h }); return m }, [qh.data])

  const abrir = emp => {
    const dias = {}
    for (let d = 1; d <= 7; d++) { const h = vigentes[emp.id]?.[d]; dias[d] = h ? { entrada: hhmm(h.entrada), salida: hhmm(h.salida), descanso_min: h.descanso_min } : { entrada: '', salida: '', descanso_min: 0 } }
    setEdit({ emp, dias })
  }
  const guardar = async () => {
    const { emp, dias } = edit
    for (let d = 1; d <= 7; d++) { const x = dias[d]; if ((x.entrada || x.salida) && !(x.entrada && x.salida && x.salida > x.entrada)) { alert(`${DIAS[d]}: la salida debe ser posterior a la entrada`); return } }
    const ok = await ejecutar(async () => {
      for (let d = 1; d <= 7; d++) {
        const x = dias[d], ant = vigentes[emp.id]?.[d]
        const igual = ant && hhmm(ant.entrada) === x.entrada && hhmm(ant.salida) === x.salida && Number(ant.descanso_min) === Number(x.descanso_min)
        if (igual || (!ant && !x.entrada)) continue
        if (ant) {
          const r = ant.vigente_desde === hoy() ? (x.entrada ? await actualizar('horarios_laborales', ant.id, { entrada: x.entrada, salida: x.salida, descanso_min: Number(x.descanso_min) || 0 }) : await borrar('horarios_laborales', ant.id))
            : await actualizar('horarios_laborales', ant.id, { vigente_hasta: ayer() })
          if (r.error) return r
          if (ant.vigente_desde === hoy()) continue
        }
        if (x.entrada) {
          const r = await insertar('horarios_laborales', { sede_id: emp.sede_id, empleado_id: emp.id, dia_semana: d, entrada: x.entrada, salida: x.salida, descanso_min: Number(x.descanso_min) || 0 })
          if (r.error) return r
        }
      }
      return {}
    }, 'Horario guardado')
    if (ok) setEdit(null)
  }
  return (
    <Estado q={qe} vacio={{ title: 'Sin empleados activos', description: 'Da de alta empleados para definir sus horarios.' }}>
      <div className="card" style={{ padding: 0 }}><div className="tabla-wrap"><table>
        <thead><tr><th>Empleado</th><th>Sede</th>{[1, 2, 3, 4, 5, 6, 7].map(d => <th key={d} style={{ textAlign: 'center' }}>{DIAS[d]}</th>)}<th /></tr></thead>
        <tbody>
          {(qe.data ?? []).map(e => (
            <tr key={e.id}><td><b>{e.nombre_completo}</b></td><td>{e.sede_nombre}</td>
              {[1, 2, 3, 4, 5, 6, 7].map(d => { const h = vigentes[e.id]?.[d]; return <td key={d} style={{ textAlign: 'center', fontSize: 12 }}>{h ? `${hhmm(h.entrada)}–${hhmm(h.salida)}` : <span style={{ color: 'var(--muted)' }}>descanso</span>}</td> })}
              <td>{puede && <button className="btn o sm" onClick={() => abrir(e)}><Pencil size={12} /> Editar</button>}</td></tr>
          ))}
        </tbody>
      </table></div></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Horario · ${edit?.emp.nombre_completo ?? ''}`} footer={<><button className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {edit && <table><thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Descanso (min)</th></tr></thead><tbody>
          {[1, 2, 3, 4, 5, 6, 7].map(d => (
            <tr key={d}><td>{DIAS[d]}</td>
              {['entrada', 'salida'].map(k => <td key={k}><input type="time" value={edit.dias[d][k]} onChange={ev => setEdit(s => ({ ...s, dias: { ...s.dias, [d]: { ...s.dias[d], [k]: ev.target.value } } }))} /></td>)}
              <td><input type="number" min="0" style={{ width: 80 }} value={edit.dias[d].descanso_min} onChange={ev => setEdit(s => ({ ...s, dias: { ...s.dias, [d]: { ...s.dias[d], descanso_min: ev.target.value } } }))} /></td></tr>
          ))}
        </tbody></table>}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Deja vacíos los días de descanso. El cambio rige desde hoy; el horario anterior se conserva con su vigencia.</div>
      </Modal>
    </Estado>
  )
}
