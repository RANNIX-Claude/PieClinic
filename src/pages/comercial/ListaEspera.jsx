// Lista de espera (mockup 12): prioridad (alta/media/baja) antes que antigüedad, notificación con ventana de 30 min,
// huecos liberados que coinciden y vencimiento a 14 días. Lee prp_lista_espera y prp_agenda (citas canceladas = huecos).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, MessageCircle, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { actualizar, insertar } from '../../lib/api'
import { fechaHora, telefono } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { ordenarListaEspera, estadoListaEspera } from '../../lib/comercial/agenda'
import { param } from '../../lib/comercial/anticipo'
import { enlaceWa, redactar, MENSAJERIA_AVISO } from '../../lib/adaptadores/mensajeria'
import PacienteBuscador from './componentes/PacienteBuscador'
import { useLeer, usePodologos, AvisoError, BannerSimulado, ejecutar, nombrePerfil } from './componentes/comun'

const PRIORIDADES = { alta: 'r', media: 'a', baja: 'n' }
const ORIGENES = ['llamada', 'portal', 'whatsapp', 'referido']

export default function ListaEspera() {
  const { sedes, sedeActivaId, organizacion } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const puede = usePermiso('lista_espera.gestionar')
  const parametros = organizacion?.parametros ?? {}
  const ventana = param(parametros, 'lista_espera_ventana_min'), venceDias = param(parametros, 'lista_espera_vence_dias')
  const [fServicio, setFServicio] = useState(''), [fPod, setFPod] = useState(''), [fEstado, setFEstado] = useState('esperando')
  const [alta, setAlta] = useState(false)

  const lista = useLeer('lista-espera', 'prp_lista_espera', { orden: { columna: 'created_at', asc: false }, limite: 500 })
  const hoy = new Date().toISOString()
  const huecos = useLeer('huecos', 'prp_agenda', { filtros: { estado: 'cancelada', inicio: { gte: hoy } }, orden: { columna: 'inicio' }, limite: 200 })
  const podQ = usePodologos()

  const filas = useMemo(() => ordenarListaEspera(lista.filas.map(e => ({ ...e, estadoVista: estadoListaEspera(e, new Date(), { ventanaMin: ventana, venceDias }) }))), [lista.filas, ventana, venceDias])
  const visibles = filas.filter(e => (!fServicio || e.servicio_id === fServicio) && (!fPod || e.podologo_id === fPod) && (!fEstado || e.estadoVista === fEstado || (fEstado === 'esperando' && e.estadoVista === 'esperando')))
  const servicios = [...new Map(lista.filas.map(e => [e.servicio_id, e.servicio_nombre])).entries()]

  const esperando = filas.filter(e => e.estadoVista === 'esperando')
  const coincidencias = useMemo(() => {
    const out = []
    for (const h of huecos.filas) for (const e of esperando) {
      if (e.servicio_id === h.servicio_id && (!e.podologo_id || e.podologo_id === h.podologo_id) && e.sede_id === h.sede_id) out.push({ hueco: h, espera: e })
    }
    return out
  }, [huecos.filas, esperando])

  const refrescar = () => qc.invalidateQueries({ queryKey: ['comercial'] })
  const notificar = async (e, hueco) => {
    const ahora = new Date()
    const texto = redactar('lista_espera_hueco', { nombre: (e.solicitante ?? '').split(' ')[0], fecha: hueco ? new Date(hueco.inicio).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : 'próximamente', hora: hueco ? new Date(hueco.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '', sede: e.sede_nombre, minutos: ventana })
    const ok = await ejecutar(actualizar('lista_espera', e.id, { estado: 'notificado', ultimo_aviso_en: ahora.toISOString(), notificado_hasta: new Date(ahora.getTime() + ventana * 60000).toISOString() }), `Notificado: ${ventana} min para responder`)
    if (ok) { if (e.telefono) window.open(enlaceWa(e.telefono, texto), '_blank', 'noopener'); refrescar() }
  }
  const notificarTodos = async () => {
    const vistos = new Set()
    for (const { hueco, espera } of coincidencias) { if (vistos.has(hueco.id) || vistos.has(espera.id)) continue; vistos.add(hueco.id); vistos.add(espera.id); await notificar(espera, hueco) }
    if (!vistos.size) toast('No hay coincidencias para notificar')
  }
  const reactivar = e => ejecutar(actualizar('lista_espera', e.id, { estado: 'esperando', vence_el: new Date(Date.now() + venceDias * 86400000).toISOString(), notificado_hasta: null }), 'Reactivado').then(ok => ok && refrescar())
  const quitar = e => ejecutar(actualizar('lista_espera', e.id, { estado: 'vencida' }), 'Quitado de la lista').then(ok => ok && refrescar())
  const agendar = e => nav(`/agenda/nueva?${new URLSearchParams({ ...(e.paciente_id ? { paciente: e.paciente_id } : {}), servicio: e.servicio_id, ...(e.podologo_id ? { podologo: e.podologo_id } : {}), espera: e.id })}`)

  const columnas = [
    { key: 'prioridad', label: 'Prioridad', render: e => <span className={`bd ${PRIORIDADES[e.prioridad]}`}>{e.prioridad}</span>, valor: e => e.prioridad, filtro: true },
    { key: 'solicitante', label: 'Paciente' },
    { key: 'telefono', label: 'Teléfono', render: e => telefono(e.telefono), valor: e => e.telefono },
    { key: 'servicio_nombre', label: 'Servicio deseado' },
    { key: 'podologo_nombre', label: 'Podólogo preferido', render: e => e.podologo_nombre ?? 'Cualquiera', valor: e => e.podologo_nombre ?? 'Cualquiera' },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'disponibilidad', label: 'Disponibilidad', render: e => e.disponibilidad ?? 'Cualquiera' },
    { key: 'created_at', label: 'Desde', render: e => fechaHora(e.created_at), valor: e => e.created_at },
    { key: 'origen', label: 'Origen', filtro: true },
    { key: 'ultimo_aviso_en', label: 'Último aviso', render: e => (e.ultimo_aviso_en ? fechaHora(e.ultimo_aviso_en) : '—'), valor: e => e.ultimo_aviso_en ?? '' },
    { key: 'estadoVista', label: 'Estado', render: e => <StatusBadge estado={e.estadoVista} label={e.estadoVista === 'sin_respuesta' ? 'Sin respuesta' : undefined} variante={e.estadoVista === 'sin_respuesta' ? 'r' : undefined} />, filtro: true },
    { key: 'acc', label: 'Acciones', sortable: false, exportar: false, render: e => puede && (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {['esperando', 'notificado', 'sin_respuesta'].includes(e.estadoVista) && <button className="btn" onClick={() => agendar(e)}>Agendar</button>}
        {['esperando', 'sin_respuesta'].includes(e.estadoVista) && <button className="btn o" onClick={() => notificar(e)}><MessageCircle size={13} /> WhatsApp</button>}
        {e.estadoVista === 'notificado' && <button className="btn o" onClick={() => notificar(e)}><Bell size={13} /> Reenviar</button>}
        {e.estadoVista === 'agendado' && e.cita_id && <button className="btn o" onClick={() => nav('/agenda')}>Ver cita</button>}
        {e.estadoVista === 'vencida' && <button className="btn o" onClick={() => reactivar(e)}>Reactivar</button>}
        {['esperando', 'sin_respuesta', 'vencida'].includes(e.estadoVista) && <button className="btn o" onClick={() => quitar(e)}>Quitar</button>}
      </div>) },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Lista de espera" subtitulo={`Agenda › Lista de espera · ${sedes.find(s => s.id === sedeActivaId)?.nombre ?? 'Todas mis sedes'}`}
        acciones={puede && <button className="btn" onClick={() => setAlta(true)}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar a lista</button>} />
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="En espera" value={esperando.length} subtitle={`${esperando.filter(e => e.prioridad === 'alta').length} con prioridad alta`} loading={lista.cargando} />
        <KPICard title="Huecos que coinciden" value={coincidencias.length} subtitle="por cancelaciones" color="var(--gold)" loading={huecos.cargando} />
        <KPICard title="Notificados sin respuesta" value={filas.filter(e => e.estadoVista === 'sin_respuesta').length} subtitle={`ventana de ${ventana} min`} color="var(--red)" loading={lista.cargando} />
        <KPICard title="Agendados desde lista" value={filas.filter(e => e.estadoVista === 'agendado').length} color="var(--green)" loading={lista.cargando} />
      </div>
      <BannerSimulado compacto texto={`${MENSAJERIA_AVISO} «WhatsApp» abre wa.me con el texto listo; el aviso queda registrado en la lista.`} />
      <AvisoError error={lista.error} titulo="No se pudo cargar la lista de espera" />
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <select value={fServicio} onChange={e => setFServicio(e.target.value)}><option value="">Servicio: todos</option>{servicios.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select value={fPod} onChange={e => setFPod(e.target.value)}><option value="">Podólogo: todos</option>{podQ.filas.map(p => <option key={p.id} value={p.id}>{nombrePerfil(p)}</option>)}</select>
        <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
          <option value="">Estado: todos</option><option value="esperando">Esperando</option><option value="notificado">Notificado</option><option value="sin_respuesta">Sin respuesta</option><option value="agendado">Agendado</option><option value="vencida">Vencida</option>
        </select>
        {puede && <button className="btn o" onClick={notificarTodos} disabled={!coincidencias.length}>Notificar a todos los que coinciden</button>}
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 14 }}>
        <DataTable columnas={columnas} filas={visibles} cargando={lista.cargando} filaKey="id" exportarNombre="lista-espera"
          vacio={{ title: 'Lista de espera vacía', description: 'Cuando no haya horario para un paciente, agrégalo aquí y avísale al liberarse un hueco.' }} />
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginBottom: 8 }}>Huecos liberados que coinciden</h3>
        {coincidencias.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Sin coincidencias: se calculan con las citas canceladas futuras del mismo servicio, sede y podólogo.</div> : (
          <table><thead><tr><th>Hueco</th><th>Podólogo</th><th>Coincide con</th><th /></tr></thead>
            <tbody>{coincidencias.map(({ hueco, espera }) => (
              <tr key={hueco.id + espera.id}><td>{fechaHora(hueco.inicio)}</td><td>{hueco.podologo_nombre}</td><td>{espera.solicitante} ({espera.servicio_nombre})</td>
                <td>{puede && <button className="btn o" onClick={() => notificar(espera, hueco)}>Notificar</button>}</td></tr>))}</tbody></table>
        )}
      </div>
      <div className="card" style={{ fontSize: 13 }}>
        <h3 style={{ marginBottom: 6 }}>Reglas de la lista (parámetros de la clínica)</h3>
        <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Se respeta la prioridad (la asigna Recepción con criterio clínico) antes que la antigüedad.</li>
          <li>Al notificar, el paciente tiene <b>{ventana} min</b> para responder antes de pasar al siguiente.</li>
          <li>Cada solicitud vence a los <b>{venceDias} días</b> sin respuesta (se puede reactivar).</li>
        </ul>
      </div>
      {alta && <AltaEspera onClose={() => setAlta(false)} onListo={() => { setAlta(false); refrescar() }} podologos={podQ.filas} />}
    </div>
  )
}

function AltaEspera({ onClose, onListo, podologos }) {
  const { sedes, sedeActivaId } = useApp()
  const servicios = useLeer('servicios-alta', 'prp_servicios', { sedeCol: false, filtros: { estado: 'activo' }, orden: { columna: 'nombre' } })
  const [f, setF] = useState({ paciente: null, nombre: '', telefono: '', servicio: '', podologo: '', sede: sedeActivaId ?? sedes[0]?.id ?? '', disp: '', prioridad: 'media', origen: 'llamada' })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const [ocupado, setOcupado] = useState(false)
  const guardar = async () => {
    if (!f.servicio || !f.sede || (!f.paciente && !f.nombre.trim()) || (!f.paciente && !f.telefono.trim())) return toast.error('Captura paciente (o nombre y teléfono), servicio y sede')
    setOcupado(true)
    const ok = await ejecutar(insertar('lista_espera', { sede_id: f.sede, paciente_id: f.paciente?.id ?? null, nombre_solicitante: f.paciente?.nombre_completo ?? f.nombre.trim(), telefono: f.paciente?.telefono_celular ?? f.telefono.trim(),
      servicio_id: f.servicio, podologo_id: f.podologo || null, disponibilidad: f.disp || null, prioridad: f.prioridad, origen: f.origen, vence_el: new Date(Date.now() + 14 * 86400000).toISOString() }), 'Agregado a la lista de espera')
    setOcupado(false)
    if (ok) onListo()
  }
  return (
    <Modal open onClose={onClose} title="Agregar a lista de espera"
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Agregar</button></>}>
      <FormField label="Paciente registrado"><PacienteBuscador valor={f.paciente} onElegir={p => set('paciente', p)} /></FormField>
      {!f.paciente && <div className="grid2"><FormField label="Nombre (si aún no es paciente)" value={f.nombre} onChange={e => set('nombre', e.target.value)} /><FormField label="Teléfono" value={f.telefono} onChange={e => set('telefono', e.target.value)} /></div>}
      <div className="grid2">
        <FormField label="Servicio deseado" required as="select" value={f.servicio} onChange={e => set('servicio', e.target.value)} options={servicios.filas.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Podólogo preferido" as="select" value={f.podologo} onChange={e => set('podologo', e.target.value)} placeholder="Cualquiera" options={podologos.map(p => ({ value: p.id, label: nombrePerfil(p) }))} />
      </div>
      <div className="grid2">
        <FormField label="Sede" required as="select" value={f.sede} onChange={e => set('sede', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Disponibilidad" value={f.disp} onChange={e => set('disp', e.target.value)} placeholder="Lun–Vie, tarde" />
      </div>
      <div className="grid2">
        <FormField label="Prioridad" as="select" value={f.prioridad} onChange={e => set('prioridad', e.target.value)} options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }]} />
        <FormField label="Origen" as="select" value={f.origen} onChange={e => set('origen', e.target.value)} options={ORIGENES.map(o => ({ value: o, label: o }))} />
      </div>
    </Modal>
  )
}
