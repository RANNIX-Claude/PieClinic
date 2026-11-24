// Utilerías · Consulta Asistente. En IRP, «Utilerías» es la bitácora de conversaciones del asistente (por mes, canal y usuario).
// El asistente en sí ya existe en /asistente (pages/plataforma/admin/Asistente.jsx) y NO se duplica: esta pantalla lo AUDITA.
// Muestra qué vistas consultó el asistente en la clínica (prp_asistente_accesos: vista, filas, si identificó a un paciente, si se bloqueó,
// quién lo pidió) y el historial de conversaciones propias (prp_asistente_historial). Los mensajes de otros usuarios no son visibles
// para nadie (RLS: cada quien solo ve los suyos; el Administrador audita los accesos a datos).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, ShieldAlert, UserSearch, Database, ExternalLink, X } from 'lucide-react'
import { leer } from '../../lib/api'
import { fechaHora, fecha, hora } from '../../lib/formato'
import { filtrarAccesos, mesesDe, vistasDe, agruparPorDia, resumenAccesos } from '../../lib/utilerias/asistente'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import { useDatos, EstadoConsulta } from './comun'

const mesLabel = m => { const [y, mm] = m.split('-'); return `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(mm) - 1]} ${y}` }

function Accesos() {
  const q = useDatos(['ua-accesos'], () => leer('prp_asistente_accesos', { sedeCol: false, orden: [{ columna: 'created_at', asc: false }], limite: 1000 }))
  const perf = useDatos(['ua-perfiles'], () => leer('perfiles', { sedeCol: false, columnas: 'id,nombre,apellidos,rol', limite: 500 }))
  const [f, setF] = useState({ mes: '', vista: '', soloPaciente: false, soloBloqueados: false, texto: '' })
  const todos = q.data?.data ?? []
  const nombres = useMemo(() => Object.fromEntries((perf.data?.data ?? []).map(p => [p.id, `${p.nombre ?? ''} ${p.apellidos ?? ''}`.trim() || p.id.slice(0, 8)])), [perf.data])
  const lista = useMemo(() => filtrarAccesos(todos, f), [todos, f])
  const res = useMemo(() => resumenAccesos(lista), [lista])
  const dias = useMemo(() => agruparPorDia(lista), [lista])
  const hayFiltros = f.mes || f.vista || f.soloPaciente || f.soloBloqueados || f.texto
  const set = parche => setF(x => ({ ...x, ...parche }))
  if (q.isLoading || q.isError || q.data?.aviso) return <EstadoConsulta q={q} />
  return (<>
    <div className="grid-kpis">
      <KPICard title="Consultas del asistente" value={res.total} subtitle={hayFiltros ? 'Con los filtros actuales' : 'Últimas 1,000'} icon={MessageSquare} color="var(--accent)" />
      <KPICard title="Con paciente identificado" value={res.conPaciente} subtitle="Dejan bitácora de acceso al expediente" icon={UserSearch} color="var(--gold)" />
      <KPICard title="Bloqueadas" value={res.bloqueados} subtitle="Sin permiso o vista no permitida" icon={ShieldAlert} color={res.bloqueados ? 'var(--red)' : 'var(--green)'} />
      <KPICard title="Filas consultadas" value={res.filas.toLocaleString('es-MX')} subtitle={res.vistaTop ? `Más usada: ${res.vistaTop.vista.replace(/^prp_/, '')}` : undefined} icon={Database} color="var(--green)" />
    </div>
    <div className="toolbar" style={{ margin: '14px 0 10px' }}>
      <select value={f.mes} onChange={e => set({ mes: e.target.value })} aria-label="Mes"><option value="">Todos los meses</option>{mesesDe(todos).map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}</select>
      <select value={f.vista} onChange={e => set({ vista: e.target.value })} aria-label="Vista"><option value="">Todas las vistas</option>{vistasDe(todos).map(v => <option key={v}>{v}</option>)}</select>
      <input value={f.texto} onChange={e => set({ texto: e.target.value })} placeholder="Buscar vista o motivo…" aria-label="Buscar" />
      <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={f.soloPaciente} onChange={e => set({ soloPaciente: e.target.checked })} /> Con paciente</label>
      <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={f.soloBloqueados} onChange={e => set({ soloBloqueados: e.target.checked })} /> Bloqueadas</label>
      {hayFiltros && <button type="button" className="btn ghost sm" onClick={() => setF({ mes: '', vista: '', soloPaciente: false, soloBloqueados: false, texto: '' })}><X size={12} /> Limpiar</button>}
    </div>
    {dias.length === 0
      ? <div className="card"><EmptyState title="Sin consultas" description={todos.length ? 'Ninguna coincide con los filtros.' : 'El asistente aún no ha consultado datos de la clínica.'} /></div>
      : dias.map(([dia, items]) => (
        <div key={dia} className="card" style={{ marginBottom: 10, padding: 0 }}>
          <div style={{ padding: '8px 14px', fontWeight: 800, fontSize: 12.5, borderBottom: '1px solid var(--border)' }}>{fecha(dia)} <span className="bd n">{items.length}</span></div>
          <div className="tabla-wrap"><table>
            <thead><tr><th>Hora</th><th>Usuario</th><th>Vista</th><th className="num">Filas</th><th>Paciente</th><th>Resultado</th></tr></thead>
            <tbody>{items.map(a => (
              <tr key={a.id}>
                <td>{hora(a.created_at)}</td><td>{nombres[a.usuario_id] ?? String(a.usuario_id ?? '').slice(0, 8)}</td>
                <td className="font-mono" style={{ fontSize: 12 }}>{a.vista}</td><td className="num">{a.filas_devueltas}</td>
                <td>{a.identifica_paciente ? <span className="bd a">Identificó paciente</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td>{a.permitido === false ? <span className="bd r" title={a.motivo_bloqueo ?? ''}>Bloqueada{a.motivo_bloqueo ? `: ${a.motivo_bloqueo}` : ''}</span> : <span className="bd v">Permitida</span>}</td>
              </tr>))}</tbody>
          </table></div>
        </div>))}
  </>)
}

function Conversaciones() {
  const q = useDatos(['ua-conversaciones'], () => leer('prp_asistente_historial', { sedeCol: false, orden: [{ columna: 'updated_at', asc: false }], limite: 200 }))
  if (q.isLoading || q.isError || q.data?.aviso) return <EstadoConsulta q={q} />
  return (<>
    <div className="aviso warn" style={{ borderRadius: 8, marginBottom: 10 }}>Por privacidad cada usuario ve solo sus propias conversaciones. Para leerlas completas ábrelas en el Asistente.</div>
    <DataTable filas={q.data.data} filaKey="conversacion_id" tamanoPagina={15} placeholderBusqueda="Buscar conversación…" exportarNombre="asistente_conversaciones"
      vacio={{ title: 'Sin conversaciones', description: 'Aún no has conversado con el asistente.', icon: MessageSquare }}
      columnas={[{ key: 'titulo', label: 'Conversación' }, { key: 'mensajes', label: 'Mensajes', align: 'right' }, { key: 'updated_at', label: 'Última actividad', render: c => fechaHora(c.updated_at), valor: c => c.updated_at ?? '' }]} />
  </>)
}

export default function ConsultaAsistente() {
  const [tab, setTab] = useState('accesos')
  return (
    <div className="pagina">
      <PageHeader titulo="Consulta del asistente" subtitulo="Auditoría de lo que el asistente de IA consultó en tu clínica. Solo vistas administrativas; los accesos con paciente quedan en bitácora."
        acciones={<Link className="btn" to="/asistente"><MessageSquare size={14} style={{ verticalAlign: -2 }} /> Abrir el Asistente <ExternalLink size={11} style={{ verticalAlign: -1 }} /></Link>} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'accesos', label: 'Datos consultados' }, { id: 'conversaciones', label: 'Mis conversaciones' }]} />
      <div style={{ marginTop: 12 }}>{tab === 'accesos' ? <Accesos /> : <Conversaciones />}</div>
    </div>
  )
}
