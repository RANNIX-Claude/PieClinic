// Rotación de personal: calendario mensual de DÓNDE estuvo cada persona y QUIÉNES estuvieron en cada sucursal.
// Fuente: vista prp_rotacion_personal (migración 311): asignación del día > horario semanal > sucursal de contrato > descanso;
// y se contrasta con la sucursal donde la persona firmó realmente. Vistas: por sucursal / por persona, en calendario o listado.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List, AlertTriangle } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import FormField from '../../../components/ui/FormField'
import { useApp } from '../../../context/AppContext'
import { fecha as fmtFecha } from '../../../lib/formato'
import { inicioMes, finMes, sumaMeses, semanasDelMes, personasPorDia, sedePorDia, resumenPersona, tramos, FUENTES } from '../../../lib/plataforma/rotacion'
import { useVista, Estado, nombreMes, hoyZona, Foto, etiquetaPuesto } from './comun'

const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const PALETA = ['#1f6feb', '#d9822b', '#2e9d5b', '#a259d9', '#d13f6e', '#2aa3a3', '#8a6d1d', '#5b6b7f']
const colorDe = (ids, id) => PALETA[Math.max(0, ids.indexOf(id)) % PALETA.length]

function SelectorMes({ mes, setMes, hoy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn o sm" onClick={() => setMes(sumaMeses(mes, -1))} aria-label="Mes anterior"><ChevronLeft size={14} /></button>
      <b style={{ minWidth: 150, textAlign: 'center', display: 'inline-block' }} className="rot-mes">{nombreMes(mes).replace(/^./, c => c.toUpperCase())}</b>
      <button className="btn o sm" onClick={() => setMes(sumaMeses(mes, 1))} aria-label="Mes siguiente"><ChevronRight size={14} /></button>
      {inicioMes(hoy) !== mes && <button className="btn o sm" onClick={() => setMes(inicioMes(hoy))}>Este mes</button>}
    </div>
  )
}

function Leyenda({ sedes, ids }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, margin: '8px 0' }}>
      {sedes.map(s => <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: colorDe(ids, s.id), display: 'inline-block' }} />{s.nombre}</span>)}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted)' }}><i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--border)', display: 'inline-block' }} />Descanso</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--bd-r-fg, #b42318)' }}><AlertTriangle size={12} />Firmó en otra sucursal</span>
    </div>
  )
}

function Rejilla({ mes, hoy, celda }) {
  const semanas = semanasDelMes(mes)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
      {DIAS_CORTO.map(d => <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', padding: 2 }}>{d}</div>)}
      {semanas.flat().map((f, i) => f
        ? <div key={f} style={{ minHeight: 78, border: f === hoy ? '2px solid var(--primary, #1f6feb)' : '1px solid var(--border)', borderRadius: 8, padding: 4, background: 'var(--card, white)', overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>{Number(f.slice(8))}</div>
            {celda(f)}
          </div>
        : <div key={`v${i}`} />)}
    </div>
  )
}

function Chip({ color, children, title, alerta }) {
  return (
    <span title={title} style={{ display: 'block', fontSize: 11, lineHeight: 1.25, padding: '1px 5px', borderRadius: 5, marginBottom: 2, color: 'white', background: color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {alerta && <AlertTriangle size={10} style={{ verticalAlign: -1, marginRight: 2 }} />}{children}
    </span>
  )
}

// Nombre de pila + inicial del primer apellido ("Lucía H."), para distinguir homónimos el mismo día.
const primerNombre = n => { const [a, b] = String(n ?? '').trim().split(/\s+/); return b ? `${a} ${b[0].toUpperCase()}.` : a }

/** Calendario / listado de UNA persona. Se usa en la pestaña Rotación del expediente y en la vista «Por persona». */
export function RotacionEmpleado({ empleadoId, soloCalendario = false }) {
  const { sedes, organizacion } = useApp()
  const hoy = hoyZona(organizacion?.zona_horaria)
  const [mes, setMes] = useState(inicioMes(hoy))
  const [formato, setFormato] = useState('calendario')
  const q = useVista(['rot-emp', empleadoId, mes], 'prp_rotacion_personal',
    { filtros: { empleado_id: empleadoId, fecha: { gte: mes, lte: finMes(mes) } }, orden: [{ columna: 'fecha' }], limite: 40 }, { conSede: false, habilitado: !!empleadoId })
  const filas = q.data ?? []
  const porDia = useMemo(() => sedePorDia(filas, empleadoId), [filas, empleadoId])
  const ids = sedes.map(s => s.id)
  const res = useMemo(() => resumenPersona(filas), [filas])
  const lista = useMemo(() => tramos(filas), [filas])

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Rotación entre sucursales</h3>
        <SelectorMes mes={mes} setMes={setMes} hoy={hoy} />
        {!soloCalendario && <>
          <button className={`btn sm ${formato === 'calendario' ? '' : 'o'}`} onClick={() => setFormato('calendario')}><CalendarDays size={12} style={{ verticalAlign: -2 }} /> Calendario</button>
          <button className={`btn sm ${formato === 'listado' ? '' : 'o'}`} onClick={() => setFormato('listado')}><List size={12} style={{ verticalAlign: -2 }} /> Listado</button>
        </>}
      </div>
      <Estado q={q} vacio={{ title: 'Sin registro en este mes', description: 'La persona no había ingresado o ya estaba de baja.', compacto: true }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 6 }}>
          {res.porSede.map(s => <span key={s.sede_id} className="bd n"><b>{s.dias}</b> día(s) · {s.sede_nombre}</span>)}
          {res.descanso > 0 && <span className="bd">{res.descanso} de descanso</span>}
          <span className="bd">{res.cambios} cambio(s) de sucursal</span>
        </div>
        {formato === 'calendario'
          ? <>
            <Leyenda sedes={sedes.filter(s => filas.some(r => r.sede_id === s.id))} ids={ids} />
            <Rejilla mes={mes} hoy={hoy} celda={f => {
              const r = porDia[f]
              if (!r) return null
              if (!r.sede_id) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>Descanso</span>
              return <Chip color={colorDe(ids, r.sede_id)} alerta={r.checo_en_otra} title={`${r.sede_nombre} · ${FUENTES[r.fuente] ?? r.fuente}${r.checo_en_otra ? ` · firmó en ${r.sede_checada_nombre}` : ''}${r.motivo ? ` · ${r.motivo}` : ''}`}>{r.sede_nombre}</Chip>
            }} />
          </>
          : <div className="tabla-wrap"><table>
            <thead><tr><th>Del</th><th>Al</th><th>Sucursal</th><th className="num">Días</th><th>Origen</th></tr></thead>
            <tbody>{lista.map(t => <tr key={`${t.desde}-${t.sede_id}`}><td>{fmtFecha(t.desde)}</td><td>{fmtFecha(t.hasta)}</td><td><b>{t.sede_nombre}</b></td><td className="num">{t.dias}</td><td>{FUENTES[t.fuente] ?? t.fuente}</td></tr>)}</tbody>
          </table></div>}
      </Estado>
    </div>
  )
}

export default function RotacionPersonal() {
  const { sedes, organizacion } = useApp()
  const hoy = hoyZona(organizacion?.zona_horaria)
  const [vista, setVista] = useState('sucursal')
  const [formato, setFormato] = useState('calendario')
  const [mes, setMes] = useState(inicioMes(hoy))
  const [sedeId, setSedeId] = useState('')
  const [empId, setEmpId] = useState('')
  const sedesOrd = useMemo(() => [...sedes].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')), [sedes])
  const sedeSel = sedeId || sedesOrd[0]?.id || ''
  const ids = sedes.map(s => s.id)

  const qEmp = useVista('rot-empleados', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 1000 }, { conSede: false })
  const emps = qEmp.data ?? []
  const empSel = empId || emps[0]?.id || ''

  const qSede = useVista(['rot-sede', sedeSel, mes], 'prp_rotacion_personal',
    { filtros: { sede_id: sedeSel, fecha: { gte: mes, lte: finMes(mes) } }, orden: [{ columna: 'fecha' }, { columna: 'nombre_completo' }], limite: 3000 }, { conSede: false, habilitado: vista === 'sucursal' && !!sedeSel })
  const filasSede = qSede.data ?? []
  const porDia = useMemo(() => personasPorDia(filasSede, sedeSel), [filasSede, sedeSel])
  const dist = useMemo(() => [...new Set(filasSede.map(f => f.empleado_id))].length, [filasSede])
  const diasSolo = Object.values(porDia).filter(l => l.length === 1).length
  const diasVacios = useMemo(() => semanasDelMes(mes).flat().filter(f => f && f <= hoy && !porDia[f]).length, [mes, porDia, hoy])

  return (
    <div className="pagina">
      <PageHeader titulo="Rotación de personal" subtitulo="Dónde estuvo cada persona y quiénes estuvieron en cada sucursal, mes por mes" />
      <div className="card" style={{ marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }}>
        <b>Cómo se calcula.</b> Cada día cuenta la sucursal <b>asignada ese día</b> (cobertura); si no hay, la del <b>horario semanal</b> de esa persona (p. ej. martes y jueves aquí, el resto allá); si no tiene horario, su <b>sucursal de contrato</b>.
        Se marca con ⚠ cuando la persona <b>firmó en otra sucursal</b> distinta a la que le tocaba. Para cambiar a alguien un día usa <i>Asignación de personal</i>; para el patrón de la semana, <i>RH › Horarios</i>.
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn sm ${vista === 'sucursal' ? '' : 'o'}`} onClick={() => setVista('sucursal')}>Por sucursal</button>
            <button className={`btn sm ${vista === 'persona' ? '' : 'o'}`} onClick={() => setVista('persona')}>Por persona</button>
          </div>
          {vista === 'sucursal'
            ? <FormField label="Sucursal" as="select" value={sedeSel} onChange={e => setSedeId(e.target.value)} options={sedesOrd.map(s => ({ value: s.id, label: s.nombre }))} style={{ minWidth: 220 }} />
            : <FormField label="Persona" as="select" value={empSel} onChange={e => setEmpId(e.target.value)} options={emps.map(e => ({ value: e.id, label: `${e.nombre_completo} · ${etiquetaPuesto(e.puesto)}` }))} style={{ minWidth: 280 }} />}
          {vista === 'sucursal' && <>
            <div style={{ flex: 1 }} />
            <SelectorMes mes={mes} setMes={setMes} hoy={hoy} />
            <button className={`btn sm ${formato === 'calendario' ? '' : 'o'}`} onClick={() => setFormato('calendario')}><CalendarDays size={12} style={{ verticalAlign: -2 }} /> Calendario</button>
            <button className={`btn sm ${formato === 'listado' ? '' : 'o'}`} onClick={() => setFormato('listado')}><List size={12} style={{ verticalAlign: -2 }} /> Listado</button>
          </>}
        </div>
      </div>

      {vista === 'persona'
        ? (empSel ? <RotacionEmpleado empleadoId={empSel} /> : <Estado q={qEmp} vacio={{ title: 'Sin personal', description: 'Da de alta al personal en RH.' }}>{null}</Estado>)
        : <div className="card">
          <Estado q={qSede} vacio={{ title: 'Nadie en esta sucursal este mes', description: 'No hay personal asignado ni con horario en esta sucursal.', compacto: true }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 6 }}>
              <span className="bd n"><b>{dist}</b> persona(s) distintas pasaron por aquí</span>
              <span className="bd">{diasSolo} día(s) con una sola persona</span>
              {diasVacios > 0 && <span className="bd r">{diasVacios} día(s) sin nadie asignado</span>}
            </div>
            {formato === 'calendario'
              ? <>
                <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0' }}>Cada etiqueta es una persona; el color indica su sucursal de contrato. Pasa el cursor para ver el origen.</div>
                <Rejilla mes={mes} hoy={hoy} celda={f => (porDia[f] ?? []).map(r =>
                  <Chip key={r.empleado_id} color={colorDe(ids, r.sede_base_id)} alerta={r.checo_en_otra}
                    title={`${r.nombre_completo} · ${FUENTES[r.fuente] ?? r.fuente}${r.sede_base_id !== r.sede_id ? ` · viene de ${r.sede_base_nombre}` : ''}${r.checo_en_otra ? ` · firmó en ${r.sede_checada_nombre}` : ''}${r.motivo ? ` · ${r.motivo}` : ''}`}>{primerNombre(r.nombre_completo)}</Chip>)} />
              </>
              : <div className="tabla-wrap"><table>
                <thead><tr><th>Día</th><th>Personas</th><th className="num">Total</th></tr></thead>
                <tbody>{semanasDelMes(mes).flat().filter(Boolean).map(f => {
                  const l = porDia[f] ?? []
                  return <tr key={f}>
                    <td>{fmtFecha(f)}{f === hoy && <span className="bd a" style={{ marginLeft: 6 }}>Hoy</span>}</td>
                    <td>{l.length ? <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>{l.map(r => <span key={r.empleado_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Foto nombre={r.nombre_completo} ruta={r.foto_path} size={22} borde="1px solid white" />{r.nombre_completo}
                      {r.sede_base_id !== r.sede_id && <span className="bd a" title={`Viene de ${r.sede_base_nombre}`}>cubre</span>}
                      {r.checo_en_otra && <AlertTriangle size={12} color="#b42318" aria-label={`Firmó en ${r.sede_checada_nombre}`} />}</span>)}</span>
                      : <span style={{ color: 'var(--muted)' }}>Nadie</span>}</td>
                    <td className="num">{l.length}</td></tr>
                })}</tbody>
              </table></div>}
          </Estado>
        </div>}
    </div>
  )
}
