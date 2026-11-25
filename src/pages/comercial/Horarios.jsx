// Horarios de atención, bloqueos (comida, vacaciones, mantenimiento…) y festivos. Alimentan la agenda y el portal.
// Lee prp_horarios_atencion, prp_bloqueos_agenda y festivos. El podólogo edita su horario y solicita vacaciones; el Administrador autoriza.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { actualizar, insertar, borrar, rpc } from '../../lib/api'
import { fechaHora, fecha as fmtFecha, hoyISO } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import StatusBadge from '../../components/ui/StatusBadge'
import DataTable from '../../components/ui/DataTable'
import { useLeer, usePodologos, AvisoError, ejecutar, nombrePerfil, isoDe, hhmmAMin, textoError } from './componentes/comun'

const DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [7, 'Dom']]
const TIPOS_BLOQUEO = ['comida', 'festivo', 'vacaciones', 'capacitacion', 'mantenimiento', 'otro']

export default function Horarios() {
  const { rol, perfil, sedes, sedeActivaId } = useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState('horarios')
  const esAdmin = rol === 'administrador'
  const [modal, setModal] = useState(null)
  const [afectadas, setAfectadas] = useState(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['comercial'] })
  const podQ = usePodologos()
  const hor = useLeer('horarios', 'prp_horarios_atencion', { filtros: { activo: true }, orden: [{ columna: 'sede_nombre' }, { columna: 'dia_semana' }], limite: 500 })
  const [desdeBloqueos] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString()) // fijo: un valor nuevo por render cambia la clave de la consulta y nunca termina de cargar
  const blq = useLeer('bloqueos-lista', 'prp_bloqueos_agenda', { filtros: { fin: { gte: desdeBloqueos } }, orden: { columna: 'inicio', asc: false }, limite: 300 })
  const fes = useLeer('festivos-lista', 'festivos', { sedeCol: false, orden: { columna: 'fecha' }, limite: 300 })
  const puedeHorario = esAdmin || rol === 'podologo'
  const editaFila = h => esAdmin || h.podologo_id === perfil?.id

  const quitarHorario = async h => { if (await ejecutar(actualizar('horarios_atencion', h.id, { activo: false }), 'Horario desactivado')) refrescar() }
  const resolver = async (b, estado) => { if (await ejecutar(actualizar('bloqueos_agenda', b.id, { estado, ...(estado === 'autorizado' ? { autorizado_por: perfil?.id } : {}) }), estado === 'autorizado' ? 'Bloqueo autorizado' : 'Bloqueo actualizado')) refrescar() }
  const verAfectadas = async b => { const r = await rpc('citas_afectadas_por_bloqueo', { p_bloqueo: b.id }); if (r.error) toast.error(textoError(r.error)); else setAfectadas({ bloqueo: b, citas: r.data ?? [] }) }
  const quitarFestivo = async f => { if (await ejecutar(borrar('festivos', f.id), 'Festivo eliminado')) refrescar() }

  return (
    <div className="pagina">
      <PageHeader titulo="Horarios y bloqueos" subtitulo="Horario de atención por sede y podólogo, bloqueos de agenda y días festivos"
        acciones={tab === 'horarios' ? puedeHorario && <button className="btn" onClick={() => setModal('horario')}><Plus size={14} /> Agregar horario</button>
          : tab === 'bloqueos' ? <button className="btn" onClick={() => setModal('bloqueo')}><Plus size={14} /> {esAdmin ? 'Nuevo bloqueo' : 'Solicitar bloqueo / vacaciones'}</button>
          : esAdmin && <button className="btn" onClick={() => setModal('festivo')}><Plus size={14} /> Agregar festivo</button>} />
      <Tabs items={[{ id: 'horarios', label: 'Horarios de atención' }, { id: 'bloqueos', label: 'Bloqueos y vacaciones', badge: blq.filas.filter(b => b.estado === 'solicitado').length || undefined }, { id: 'festivos', label: 'Festivos' }]} value={tab} onChange={setTab} />
      <div className="card" style={{ padding: 0, marginTop: 10 }}>
        {tab === 'horarios' && (<><AvisoError error={hor.error} /><DataTable cargando={hor.cargando} filas={hor.filas} exportarNombre="horarios" vacio={{ title: 'Sin horarios', description: 'Sin horario de atención no se ofrecen citas en el portal. Agrega al menos el horario de la sede.' }}
          columnas={[
            { key: 'sede_nombre', label: 'Sede', filtro: true },
            { key: 'podologo', label: 'Podólogo', render: h => (h.podologo_id ? `${h.podologo_nombre ?? ''} ${h.podologo_apellidos ?? ''}` : 'Toda la sede'), valor: h => (h.podologo_id ? `${h.podologo_nombre ?? ''} ${h.podologo_apellidos ?? ''}` : 'Toda la sede'), filtro: true },
            { key: 'dia_semana', label: 'Día', render: h => DIAS.find(d => d[0] === h.dia_semana)?.[1], valor: h => h.dia_semana },
            { key: 'hora_inicio', label: 'De', render: h => String(h.hora_inicio).slice(0, 5) }, { key: 'hora_fin', label: 'A', render: h => String(h.hora_fin).slice(0, 5) },
            { key: 'vigente_desde', label: 'Desde', render: h => fmtFecha(h.vigente_desde) }, { key: 'vigente_hasta', label: 'Hasta', render: h => (h.vigente_hasta ? fmtFecha(h.vigente_hasta) : 'Sin fin') },
            { key: 'acc', label: '', sortable: false, exportar: false, render: h => editaFila(h) && <button className="btn o" onClick={() => quitarHorario(h)} aria-label="Quitar"><Trash2 size={13} /></button> },
          ]} /></>)}
        {tab === 'bloqueos' && (<><AvisoError error={blq.error} /><DataTable cargando={blq.cargando} filas={blq.filas} exportarNombre="bloqueos" vacio={{ title: 'Sin bloqueos', description: 'Aquí aparecen comidas, vacaciones, capacitación, mantenimiento y festivos que cierran la agenda.' }}
          columnas={[
            { key: 'tipo', label: 'Tipo', filtro: true }, { key: 'ambito', label: 'Ámbito', filtro: true },
            { key: 'objetivo', label: 'Podólogo / cabina / sede', render: b => b.podologo_nombre ?? b.cabina_nombre ?? b.sede_nombre, valor: b => b.podologo_nombre ?? b.cabina_nombre ?? b.sede_nombre },
            { key: 'inicio', label: 'Inicio', render: b => fechaHora(b.inicio) }, { key: 'fin', label: 'Fin', render: b => fechaHora(b.fin) }, { key: 'motivo', label: 'Motivo' },
            { key: 'estado', label: 'Estado', render: b => <StatusBadge estado={b.estado} variante={b.estado === 'solicitado' ? 'a' : b.estado === 'autorizado' ? 'v' : 'n'} />, filtro: true },
            { key: 'acc', label: '', sortable: false, exportar: false, render: b => (
              <div style={{ display: 'flex', gap: 4 }}>
                {esAdmin && b.estado === 'solicitado' && <><button className="btn" onClick={() => resolver(b, 'autorizado')}>Autorizar</button><button className="btn o" onClick={() => resolver(b, 'rechazado')}>Rechazar</button></>}
                {b.estado === 'autorizado' && esAdmin && <button className="btn o" onClick={() => verAfectadas(b)}>Citas afectadas</button>}
                {['solicitado', 'autorizado'].includes(b.estado) && (esAdmin || b.solicitado_por === perfil?.id) && <button className="btn o" onClick={() => resolver(b, 'cancelado')}>Cancelar</button>}
              </div>) },
          ]} /></>)}
        {tab === 'festivos' && (<><AvisoError error={fes.error} /><DataTable cargando={fes.cargando} filas={fes.filas} exportarNombre="festivos" vacio={{ title: 'Sin festivos', description: 'Los festivos cierran la agenda y el portal ese día, salvo que la sede abra.' }}
          columnas={[
            { key: 'fecha', label: 'Fecha', render: f => fmtFecha(f.fecha) }, { key: 'nombre', label: 'Nombre' },
            { key: 'sede', label: 'Sede', render: f => (f.sede_id ? sedes.find(s => s.id === f.sede_id)?.nombre ?? '—' : 'Todas'), valor: f => (f.sede_id ? sedes.find(s => s.id === f.sede_id)?.nombre ?? '—' : 'Todas') },
            { key: 'abre', label: 'La sede abre', render: f => (f.abre ? 'Sí' : 'No, cerrado') },
            { key: 'acc', label: '', sortable: false, exportar: false, render: f => esAdmin && <button className="btn o" onClick={() => quitarFestivo(f)} aria-label="Eliminar"><Trash2 size={13} /></button> },
          ]} /></>)}
      </div>

      {modal === 'horario' && <FormHorario onClose={() => setModal(null)} onListo={() => { setModal(null); refrescar() }} podologos={podQ.filas} esAdmin={esAdmin} />}
      {modal === 'bloqueo' && <FormBloqueo onClose={() => setModal(null)} onListo={() => { setModal(null); refrescar() }} podologos={podQ.filas} esAdmin={esAdmin} />}
      {modal === 'festivo' && <FormFestivo onClose={() => setModal(null)} onListo={() => { setModal(null); refrescar() }} />}
      <Modal open={!!afectadas} onClose={() => setAfectadas(null)} title="Citas afectadas por el bloqueo" footer={<button className="btn o" onClick={() => setAfectadas(null)}>Cerrar</button>}>
        {afectadas?.citas.length ? <table><thead><tr><th>Folio</th><th>Inicio</th></tr></thead><tbody>{afectadas.citas.map(c => <tr key={c.cita_id}><td>{c.folio}</td><td>{fechaHora(c.inicio)}</td></tr>)}</tbody></table> : <div className="text-muted">No hay citas afectadas.</div>}
        <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Reprograma o notifica a esos pacientes desde la agenda.</div>
      </Modal>
    </div>
  )
}

function FormHorario({ onClose, onListo, podologos, esAdmin }) {
  const { sedes, sedeActivaId, perfil } = useApp()
  const [f, setF] = useState({ sede: sedeActivaId ?? sedes[0]?.id ?? '', podologo: esAdmin ? '' : perfil?.id, dias: [1, 2, 3, 4, 5], ini: '09:00', fin: '18:00', desde: hoyISO() })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const guardar = async () => {
    if (!f.sede || !f.dias.length || f.fin <= f.ini) return toast.error('Revisa sede, días y horas')
    const filas = f.dias.map(d => ({ sede_id: f.sede, podologo_id: f.podologo || null, dia_semana: d, hora_inicio: f.ini, hora_fin: f.fin, vigente_desde: f.desde }))
    if (await ejecutar(insertar('horarios_atencion', filas), 'Horario guardado')) onListo()
  }
  return (
    <Modal open onClose={onClose} title="Agregar horario de atención" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
      <div className="grid2">
        <FormField label="Sede" as="select" value={f.sede} onChange={e => set('sede', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Podólogo" as="select" value={f.podologo ?? ''} disabled={!esAdmin} onChange={e => set('podologo', e.target.value)} placeholder="Toda la sede" options={podologos.map(p => ({ value: p.id, label: nombrePerfil(p) }))} />
      </div>
      <div className="field"><label>Días</label><div style={{ display: 'flex', gap: 10 }}>{DIAS.map(([n, l]) => <label key={n}><input type="checkbox" checked={f.dias.includes(n)} onChange={e => set('dias', e.target.checked ? [...f.dias, n] : f.dias.filter(x => x !== n))} /> {l}</label>)}</div></div>
      <div className="grid3"><FormField label="De" type="time" value={f.ini} onChange={e => set('ini', e.target.value)} /><FormField label="A" type="time" value={f.fin} onChange={e => set('fin', e.target.value)} /><FormField label="Vigente desde" type="date" value={f.desde} onChange={e => set('desde', e.target.value)} /></div>
    </Modal>
  )
}

function FormBloqueo({ onClose, onListo, podologos, esAdmin }) {
  const { sedes, sedeActivaId, perfil } = useApp()
  const cab = useLeer('cabinas-bloq', 'cabinas', { filtros: { activa: true } })
  const [f, setF] = useState({ sede: sedeActivaId ?? sedes[0]?.id ?? '', ambito: esAdmin ? 'sede' : 'podologo', podologo: esAdmin ? '' : perfil?.id, cabina: '', fi: hoyISO(), hi: '14:00', ff: hoyISO(), hf: '15:00', tipo: esAdmin ? 'comida' : 'vacaciones', motivo: '' })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const guardar = async () => {
    const inicio = isoDe(f.fi, hhmmAMin(f.hi)), fin = isoDe(f.ff, hhmmAMin(f.hf))
    if (new Date(fin) <= new Date(inicio)) return toast.error('El fin debe ser posterior al inicio')
    if (f.ambito === 'podologo' && !f.podologo) return toast.error('Elige al podólogo')
    if (f.ambito === 'cabina' && !f.cabina) return toast.error('Elige la cabina')
    const fila = { sede_id: f.sede, ambito: f.ambito, podologo_id: f.ambito === 'podologo' ? f.podologo : null, cabina_id: f.ambito === 'cabina' ? f.cabina : null, inicio, fin, tipo: f.tipo, motivo: f.motivo || null, estado: esAdmin ? 'autorizado' : 'solicitado', autorizado_por: esAdmin ? perfil?.id : null }
    if (await ejecutar(insertar('bloqueos_agenda', fila), esAdmin ? 'Bloqueo creado' : 'Solicitud enviada al Administrador')) onListo()
  }
  return (
    <Modal open onClose={onClose} title={esAdmin ? 'Nuevo bloqueo' : 'Solicitar bloqueo / vacaciones'} footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>{esAdmin ? 'Guardar' : 'Solicitar'}</button></>}>
      <div className="grid2">
        <FormField label="Sede" as="select" value={f.sede} onChange={e => set('sede', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Tipo" as="select" value={f.tipo} onChange={e => set('tipo', e.target.value)} options={TIPOS_BLOQUEO.map(t => ({ value: t, label: t }))} />
      </div>
      <div className="grid2">
        <FormField label="Aplica a" as="select" value={f.ambito} disabled={!esAdmin} onChange={e => set('ambito', e.target.value)} options={[{ value: 'sede', label: 'Toda la sede' }, { value: 'podologo', label: 'Un podólogo' }, { value: 'cabina', label: 'Una cabina' }]} />
        {f.ambito === 'podologo' && <FormField label="Podólogo" as="select" value={f.podologo ?? ''} disabled={!esAdmin} onChange={e => set('podologo', e.target.value)} options={podologos.map(p => ({ value: p.id, label: nombrePerfil(p) }))} />}
        {f.ambito === 'cabina' && <FormField label="Cabina" as="select" value={f.cabina} onChange={e => set('cabina', e.target.value)} options={cab.filas.filter(c => c.sede_id === f.sede).map(c => ({ value: c.id, label: c.nombre }))} />}
      </div>
      <div className="grid2"><FormField label="Desde (fecha)" type="date" value={f.fi} onChange={e => set('fi', e.target.value)} /><FormField label="Hora" type="time" value={f.hi} onChange={e => set('hi', e.target.value)} /></div>
      <div className="grid2"><FormField label="Hasta (fecha)" type="date" value={f.ff} onChange={e => set('ff', e.target.value)} /><FormField label="Hora" type="time" value={f.hf} onChange={e => set('hf', e.target.value)} /></div>
      <FormField label="Motivo" value={f.motivo} onChange={e => set('motivo', e.target.value)} />
      {!esAdmin && <div className="text-muted" style={{ fontSize: 12.5 }}>Las vacaciones y bloqueos que solicita un podólogo los autoriza el Administrador.</div>}
    </Modal>
  )
}

function FormFestivo({ onClose, onListo }) {
  const { sedes } = useApp()
  const [f, setF] = useState({ fecha: hoyISO(), nombre: '', sede: '', abre: false })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const guardar = async () => { if (!f.nombre.trim()) return toast.error('Pon el nombre del festivo'); if (await ejecutar(insertar('festivos', { fecha: f.fecha, nombre: f.nombre.trim(), sede_id: f.sede || null, abre: f.abre }), 'Festivo guardado')) onListo() }
  return (
    <Modal open onClose={onClose} size="sm" title="Agregar festivo" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
      <FormField label="Fecha" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} />
      <FormField label="Nombre" value={f.nombre} onChange={e => set('nombre', e.target.value)} />
      <FormField label="Sede" as="select" value={f.sede} onChange={e => set('sede', e.target.value)} placeholder="Todas las sedes" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.abre} onChange={e => set('abre', e.target.checked)} /> La sede abre ese día</label>
    </Modal>
  )
}
