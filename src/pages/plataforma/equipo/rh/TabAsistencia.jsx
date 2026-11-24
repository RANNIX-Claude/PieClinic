// Asistencia: semana (cuadrícula), checadas (consulta y alta manual), resumen mensual e importación del reloj.
import { useMemo, useRef, useState } from 'react'
import { Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import KPICard from '../../../../components/ui/KPICard'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, rpc } from '../../../../lib/api'
import { fechaCorta, hora, fechaHora } from '../../../../lib/formato'
import { leerTabla, tipoArchivo } from '../../../../lib/plataforma/archivos'
import { armarChecadas, mapeoInicialChecador } from '../../../../lib/plataforma/checador'
import { CAMPOS_DESTINO } from '../../../../lib/plataforma/importacion'
import { useVista, Estado, useEscribir, DIAS, hoy, nombreMes } from '../comun'

const lunesDe = iso => { const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10) }
const suma = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const ABREV = { presente: 'P', retardo: 'R', falta: 'F', justificada: 'J', descanso: 'D', sin_entrada: '?' }
const COLOR = { presente: 'v', retardo: 'a', falta: 'r', justificada: 'b', descanso: 'n', sin_entrada: 'a' }

function Semana() {
  const [lunes, setLunes] = useState(lunesDe(hoy()))
  const q = useVista(['asis-sem', lunes], 'prp_asistencia_semana', { filtros: { semana_inicio: lunes }, limite: 2000 })
  const qe = useVista('empleados-activos', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 500 })
  const dias = [0, 1, 2, 3, 4, 5, 6].map(i => suma(lunes, i))
  const mapa = useMemo(() => { const m = {}; (q.data ?? []).forEach(a => { m[`${a.empleado_id}|${a.fecha}`] = a }); return m }, [q.data])
  const hoyIso = hoy()
  const delHoy = (q.data ?? []).filter(a => a.fecha === hoyIso)
  const cuenta = e => delHoy.filter(a => a.estado === e).length
  return (
    <>
      <div className="grid-kpis">
        <KPICard title="Presentes hoy" value={cuenta('presente') + cuenta('retardo')} loading={q.isLoading} />
        <KPICard title="Retardos hoy" value={cuenta('retardo')} color="var(--gold)" loading={q.isLoading} />
        <KPICard title="Faltas hoy" value={cuenta('falta')} color="var(--red)" loading={q.isLoading} />
      </div>
      <div className="toolbar">
        <button className="btn o sm" onClick={() => setLunes(suma(lunes, -7))}><ChevronLeft size={12} /></button>
        <b style={{ fontSize: 13 }}>Semana del {fechaCorta(lunes)} al {fechaCorta(suma(lunes, 6))}</b>
        <button className="btn o sm" onClick={() => setLunes(suma(lunes, 7))}><ChevronRight size={12} /></button>
        <button className="btn o sm" onClick={() => setLunes(lunesDe(hoy()))}>Hoy</button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>P presente · R retardo · F falta · J justificada · D descanso · ? sin entrada</span>
      </div>
      <Estado q={q}>
        <div className="card" style={{ padding: 0 }}><div className="tabla-wrap"><table>
          <thead><tr><th>Empleado</th>{dias.map((d, i) => <th key={d} style={{ textAlign: 'center' }}>{DIAS[i + 1]} {d.slice(8)}</th>)}</tr></thead>
          <tbody>
            {(qe.data ?? []).map(e => (
              <tr key={e.id}><td><b>{e.nombre_completo}</b></td>
                {dias.map(d => { const a = mapa[`${e.id}|${d}`]; return (
                  <td key={d} style={{ textAlign: 'center' }} title={a ? `${a.estado}${a.hora_entrada ? ` · ${hora(a.hora_entrada)}–${hora(a.hora_salida)}` : ''}${a.minutos_retardo ? ` · ${a.minutos_retardo} min de retardo` : ''}` : 'Sin registro'}>
                    {a ? <span className={`bd ${COLOR[a.estado]}`}>{ABREV[a.estado]}</span> : <span style={{ color: 'var(--muted)' }}>·</span>}
                  </td>) })}
              </tr>
            ))}
            {!(qe.data ?? []).length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>Sin empleados activos</td></tr>}
          </tbody>
        </table></div></div>
      </Estado>
    </>
  )
}

function Checadas() {
  const puede = usePermiso('rh.editar')
  const { sedes, sedeActivaId } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const [desde, setDesde] = useState(suma(hoy(), -7)), [hasta, setHasta] = useState(hoy())
  const q = useVista(['checadas', desde, hasta], 'prp_checadas', { filtros: { fecha: { gte: desde, lte: hasta } }, orden: [{ columna: 'fecha_hora', asc: false }], limite: 1500 })
  const qe = useVista('empleados-activos', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 500 })
  const [alta, setAlta] = useState(null)
  const guardar = async () => {
    if (!alta.empleado_id || !alta.fecha_hora) { toast.error('Elige empleado y fecha/hora'); return }
    const emp = (qe.data ?? []).find(e => e.id === alta.empleado_id)
    const ok = await ejecutar(() => insertar('checadas', { sede_id: alta.sede_id || emp?.sede_id, empleado_id: alta.empleado_id, operacion: alta.operacion, fecha_hora: new Date(alta.fecha_hora).toISOString(), origen: 'manual', notas: alta.notas || null }), 'Checada registrada')
    if (ok) setAlta(null)
  }
  return (
    <>
      <div className="toolbar">
        <FormField label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ maxWidth: 160 }} />
        <FormField label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ maxWidth: 160 }} />
        {puede && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setAlta({ operacion: 'entrada', sede_id: sedeActivaId ?? '', fecha_hora: '', empleado_id: '', notas: '' })}>+ Checada manual</button>}
      </div>
      <Estado q={q}>
        <DataTable exportarNombre="checadas" filas={q.data ?? []} vacio={{ title: 'Sin checadas en el rango', description: 'Importa el archivo del reloj o captura una checada manual.' }}
          columnas={[
            { key: 'fecha_hora', label: 'Fecha y hora', render: c => fechaHora(c.fecha_hora), valor: c => c.fecha_hora },
            { key: 'numero_empleado', label: 'No.' },
            { key: 'nombre_completo', label: 'Empleado', render: c => (c.empleado_id ? c.nombre_completo : <span className="bd a">Sin empleado asignado</span>), valor: c => c.nombre_completo },
            { key: 'operacion', label: 'Operación', filtro: true },
            { key: 'origen', label: 'Origen', filtro: true },
            { key: 'notas', label: 'Notas' },
          ]} />
      </Estado>
      <Modal open={!!alta} onClose={() => setAlta(null)} title="Checada manual" size="sm"
        footer={<><button className="btn o" onClick={() => setAlta(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {alta && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Empleado" as="select" options={(qe.data ?? []).map(e => ({ value: e.id, label: `${e.numero_empleado} · ${e.nombre_completo}` }))} value={alta.empleado_id} onChange={e => setAlta({ ...alta, empleado_id: e.target.value })} />
          <FormField label="Sede" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={alta.sede_id} onChange={e => setAlta({ ...alta, sede_id: e.target.value })} hint="Vacío = sede de contrato" />
          <FormField label="Operación" as="select" options={[{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} value={alta.operacion} onChange={e => setAlta({ ...alta, operacion: e.target.value })} />
          <FormField label="Fecha y hora" type="datetime-local" value={alta.fecha_hora} onChange={e => setAlta({ ...alta, fecha_hora: e.target.value })} />
          <FormField label="Motivo / notas" value={alta.notas} onChange={e => setAlta({ ...alta, notas: e.target.value })} />
        </div>}
      </Modal>
    </>
  )
}

function ResumenMes() {
  const [mes, setMes] = useState(`${hoy().slice(0, 7)}-01`)
  const q = useVista(['asis-mes', mes], 'prp_asistencia_resumen_mes', { filtros: { mes }, limite: 1000 })
  const qe = useVista('empleados', 'prp_empleados', { limite: 1000 })
  const nom = useMemo(() => Object.fromEntries((qe.data ?? []).map(e => [e.id, e])), [qe.data])
  const filas = (q.data ?? []).map(r => ({ ...r, nombre: nom[r.empleado_id]?.nombre_completo ?? '—', numero: nom[r.empleado_id]?.numero_empleado }))
  return (
    <>
      <div className="toolbar"><FormField label="Mes" type="month" value={mes.slice(0, 7)} onChange={e => e.target.value && setMes(`${e.target.value}-01`)} style={{ maxWidth: 180 }} /><b style={{ fontSize: 13 }}>{nombreMes(mes)}</b></div>
      <Estado q={q}>
        <DataTable exportarNombre={`asistencia_${mes.slice(0, 7)}`} filas={filas} filaKey="empleado_id" vacio={{ title: 'Sin asistencia en el mes', description: 'Aún no hay checadas consolidadas para este mes.' }}
          columnas={[
            { key: 'numero', label: 'No.' }, { key: 'nombre', label: 'Empleado' },
            { key: 'dias_asistidos', label: 'Días asistidos', align: 'right' }, { key: 'retardos', label: 'Retardos', align: 'right' },
            { key: 'minutos_retardo', label: 'Min. de retardo', align: 'right' }, { key: 'horas_trabajadas', label: 'Horas trabajadas', align: 'right' },
          ]} />
      </Estado>
    </>
  )
}

function ImportarChecadas({ abierto, onClose }) {
  const { sedes, sedeActivaId } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const [sede, setSede] = useState(sedeActivaId ?? sedes[0]?.id ?? '')
  const [datos, setDatos] = useState(null) // { columnas, filas, nombre }
  const [mapeos, setMapeos] = useState([])
  const input = useRef(null)
  const campos = CAMPOS_DESTINO.checadas
  const prev = useMemo(() => (datos ? armarChecadas(datos.filas, mapeos) : null), [datos, mapeos])
  async function elegir(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (tipoArchivo(f.name) !== 'tabla') { toast.error('Sube un Excel o CSV (.xlsx, .xls, .csv)'); return }
    try {
      const { hojas } = await leerTabla(f)
      const h = hojas.find(x => x.filas.length) ?? hojas[0]
      if (!h?.columnas.length) { toast.error('No se encontraron columnas'); return }
      setDatos({ columnas: h.columnas, filas: h.filas, nombre: f.name })
      setMapeos(mapeoInicialChecador(h.columnas, h.filas))
    } catch (err) { toast.error(`No se pudo leer el archivo: ${err.message}`) }
  }
  const cerrar = () => { setDatos(null); setMapeos([]); onClose() }
  const importar = async () => {
    const ok = await ejecutar(async () => {
      const lote = 500
      let total = { insertadas: 0, repetidas: 0, sin_empleado: 0 }
      for (let i = 0; i < prev.filas.length; i += lote) {
        const r = await rpc('rh_importar_checadas', { p_sede: sede, p_filas: prev.filas.slice(i, i + lote) })
        if (r.error) return r
        for (const k of Object.keys(total)) total[k] += Number(r.data?.[k] ?? 0)
      }
      toast(`Insertadas: ${total.insertadas} · repetidas: ${total.repetidas} · sin empleado: ${total.sin_empleado}`, { icon: 'ℹ️' })
      return {}
    }, 'Checadas importadas')
    if (ok) cerrar()
  }
  return (
    <Modal open={abierto} onClose={cerrar} size="wide" title="Importar checadas del reloj" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={cerrar}>Cancelar</button><button className="btn" disabled={ocupado || !prev?.filas.length || !sede} onClick={importar}>{ocupado ? 'Importando…' : `Importar ${prev?.filas.length ?? 0} marcajes`}</button></>}>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={elegir} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn o" onClick={() => input.current?.click()}><Upload size={14} style={{ verticalAlign: -3 }} /> {datos ? datos.nombre : 'Elegir archivo Excel / CSV'}</button>
        <FormField label="Sede del reloj" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={sede} onChange={e => setSede(e.target.value)} style={{ maxWidth: 240 }} />
      </div>
      {!datos && <div style={{ fontSize: 13, color: 'var(--muted)' }}>El archivo debe traer número de empleado y fecha/hora (o fecha y hora por separado); opcionalmente entrada/salida. Si no trae tipo, el primer marcaje del día es entrada y el último salida. Reimportar el mismo archivo no duplica. Los marcajes de números desconocidos se guardan «sin empleado» para asignarlos después.</div>}
      {datos && <>
        <h3 style={{ fontSize: 13, marginBottom: 6 }}>Mapeo de columnas ({datos.filas.length} filas)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8, marginBottom: 12 }}>
          {mapeos.map((m, i) => (
            <FormField key={m.columna} label={`${m.columna} (ej. ${String(m.ejemplo).slice(0, 18)})`} as="select" placeholder="— ignorar —"
              options={campos.map(c => ({ value: c.campo, label: c.etiqueta }))} value={m.campo_destino ?? ''} onChange={e => setMapeos(ms => ms.map((x, j) => (j === i ? { ...x, campo_destino: e.target.value || null } : x)))} />
          ))}
        </div>
        {prev && <div style={{ fontSize: 13 }}>
          <b>{prev.filas.length}</b> marcajes listos · <b style={{ color: prev.errores.length ? 'var(--red)' : undefined }}>{prev.errores.length}</b> filas con error · {prev.descartadas.length} día(s) con marcajes intermedios descartados.
          {prev.errores.slice(0, 5).map(e => <div key={e} style={{ color: 'var(--red)', fontSize: 12 }}>{e}</div>)}
        </div>}
      </>}
    </Modal>
  )
}

export default function TabAsistencia() {
  const [sub, setSub] = useState('semana')
  const [imp, setImp] = useState(false)
  const puede = usePermiso('rh.editar')
  return (
    <>
      <div className="toolbar">
        {[['semana', 'Semana'], ['checadas', 'Checadas'], ['mes', 'Resumen mensual']].map(([id, l]) => <button key={id} className={`btn sm ${sub === id ? '' : 'o'}`} onClick={() => setSub(id)}>{l}</button>)}
        {puede && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setImp(true)}><Upload size={12} style={{ verticalAlign: -2 }} /> Importar checador</button>}
      </div>
      {sub === 'semana' && <Semana />}{sub === 'checadas' && <Checadas />}{sub === 'mes' && <ResumenMes />}
      <ImportarChecadas abierto={imp} onClose={() => setImp(false)} />
    </>
  )
}
