// Agenda (mockup 01): vista día / semana por podólogo o cabina, colores por estado, arrastrar para reprogramar con reglas,
// bloqueos y festivos. Lee prp_agenda, prp_bloqueos_agenda, festivos y cabinas.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { actualizar } from '../../lib/api'
import { fechaLarga, hoyISO, hora } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import Modal from '../../components/ui/Modal'
import { ESTADOS_CITA, validarReprogramacion, ocupaAgenda } from '../../lib/comercial/agenda'
import { PARAMETROS_DEFECTO } from '../../lib/comercial/anticipo'
import RejillaAgenda from './componentes/RejillaAgenda'
import DetalleCita from './componentes/DetalleCita'
import { useLeer, usePodologos, AvisoError, ejecutar, sumarDias, lunesDe, rangoDias, etiquetaDia, isoDe, diaDe, nombrePerfil } from './componentes/comun'

export default function Agenda() {
  const { sedeActivaId, sedeActiva, organizacion, rol } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const puedeEditar = usePermiso('agenda.editar')
  const [sp] = useSearchParams()
  const [dia, setDia] = useState(/^\d{4}-\d{2}-\d{2}$/.test(sp.get('dia') ?? '') ? sp.get('dia') : hoyISO())
  const [vista, setVista] = useState('dia')
  const [agrupar, setAgrupar] = useState('podologo')
  const [podFiltro, setPodFiltro] = useState('')
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(null)
  const [mover, setMover] = useState(null)      // { cita, nuevoInicio, podologoId, cabinaId, resultado }
  const parametros = { ...PARAMETROS_DEFECTO, ...(organizacion?.parametros ?? {}) }
  const esAdmin = rol === 'administrador'

  const desde = vista === 'semana' ? lunesDe(dia) : dia
  const hasta = vista === 'semana' ? sumarDias(desde, 6) : dia
  const [r0, r1] = rangoDias(desde, hasta)

  const citasQ = useLeer('agenda', 'prp_agenda', { filtros: { inicio: { gte: r0, lte: r1 } }, orden: { columna: 'inicio' }, limite: 2000 })
  const bloqQ = useLeer('bloqueos', 'prp_bloqueos_agenda', { filtros: { fin: { gte: r0 }, inicio: { lte: r1 }, estado: 'autorizado' }, limite: 500 })
  const festQ = useLeer('festivos', 'festivos', { sedeCol: false, filtros: { fecha: { gte: desde, lte: hasta } } })
  const cabQ = useLeer('cabinas', 'cabinas', { filtros: { activa: true }, orden: { columna: 'nombre' } })
  const podQ = usePodologos()

  const citas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return citasQ.filas.filter(c => (!podFiltro || c.podologo_id === podFiltro) && (!q || `${c.paciente_nombre} ${c.servicio_nombre} ${c.folio}`.toLowerCase().includes(q)))
  }, [citasQ.filas, podFiltro, buscar])

  const festivoDe = d => festQ.filas.find(f => f.fecha === d && (!f.sede_id || f.sede_id === sedeActivaId))
  const dias = vista === 'semana' ? Array.from({ length: 7 }, (_, i) => sumarDias(desde, i)) : [dia]

  const columnas = useMemo(() => {
    const hoy = hoyISO()
    if (vista === 'semana') {
      return dias.map(d => ({
        key: d, tipo: 'dia', dia: d, label: etiquetaDia(d), sub: `${citas.filter(c => diaDe(c.inicio) === d && ocupaAgenda(c)).length} citas`, esHoy: d === hoy, festivo: festivoDe(d),
        citas: citas.filter(c => diaDe(c.inicio) === d), bloqueos: bloqQ.filas.filter(b => (b.ambito === 'sede' || !podFiltro || b.podologo_id === podFiltro)),
      }))
    }
    if (agrupar === 'cabina') {
      const cabs = cabQ.filas.filter(c => !sedeActivaId || c.sede_id === sedeActivaId)
      return [...cabs.map(cb => ({ key: cb.id, tipo: 'cabina', dia, cabinaId: cb.id, label: cb.nombre, sub: 'Cabina', esHoy: dia === hoy, festivo: festivoDe(dia),
        citas: citas.filter(c => c.cabina_id === cb.id), bloqueos: bloqQ.filas.filter(b => b.ambito === 'sede' || b.cabina_id === cb.id) })),
      { key: 'sin', tipo: 'cabina', dia, cabinaId: null, label: 'Sin cabina', sub: 'Domicilio / video', esHoy: dia === hoy, festivo: festivoDe(dia),
        citas: citas.filter(c => !c.cabina_id), bloqueos: bloqQ.filas.filter(b => b.ambito === 'sede') }]
    }
    const ids = new Set(citas.map(c => c.podologo_id))
    const pods = podQ.filas.filter(p => (!podFiltro || p.id === podFiltro) && (ids.has(p.id) || p.rol === 'podologo'))
    return pods.map(p => ({ key: p.id, tipo: 'podologo', dia, podologoId: p.id, label: nombrePerfil(p), sub: 'Podólogo', esHoy: dia === hoy, festivo: festivoDe(dia),
      citas: citas.filter(c => c.podologo_id === p.id), bloqueos: bloqQ.filas.filter(b => b.ambito === 'sede' || b.podologo_id === p.id) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, agrupar, dia, citas, bloqQ.filas, cabQ.filas, podQ.filas, festQ.filas, podFiltro, sedeActivaId])

  const kpi = n => citas.filter(c => c.estado === n).length
  const total = citas.filter(ocupaAgenda).length

  const alSoltar = (cita, col, minutos) => {
    const diaDestino = col.tipo === 'dia' ? col.dia : dia
    const nuevoInicio = isoDe(diaDestino, minutos)
    const podologoId = col.tipo === 'podologo' ? col.podologoId : cita.podologo_id
    const cabinaId = col.tipo === 'cabina' ? col.cabinaId : cita.cabina_id
    const resultado = validarReprogramacion({ cita, nuevoInicio, podologoId, cabinaId, citas: citasQ.filas, bloqueos: bloqQ.filas, festivos: festQ.filas, parametros, esAdmin })
    if (!resultado.ok) { toast.error(resultado.errores[0]); return }
    if (nuevoInicio === cita.inicio && podologoId === cita.podologo_id && cabinaId === cita.cabina_id) return
    setMover({ cita, nuevoInicio, podologoId, cabinaId, resultado })
  }
  const confirmarMover = async () => {
    const { cita, nuevoInicio, podologoId, cabinaId, resultado } = mover
    const cambios = { inicio: nuevoInicio, fin: resultado.nuevoFin, podologo_id: podologoId, cabina_id: cabinaId ?? null }
    const ok = await ejecutar(actualizar('citas', cita.id, cambios), 'Cita reprogramada')
    setMover(null)
    if (ok) qc.invalidateQueries({ queryKey: ['comercial'] })
  }

  const irNueva = (col, minutos) => {
    if (!puedeEditar) return
    const p = new URLSearchParams({ fecha: col?.tipo === 'dia' ? col.dia : dia })
    if (minutos != null) p.set('hora', `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`)
    if (col?.tipo === 'podologo') p.set('podologo', col.podologoId)
    if (col?.tipo === 'cabina' && col.cabinaId) p.set('cabina', col.cabinaId)
    nav(`/agenda/nueva?${p}`)
  }

  const tituloFecha = vista === 'semana' ? `Semana del ${etiquetaDia(desde)} al ${etiquetaDia(hasta)}` : fechaLarga(dia)
  const error = citasQ.error || bloqQ.error

  return (
    <div className="pagina">
      <PageHeader titulo="Agenda" subtitulo={`${tituloFecha} · ${sedeActiva?.nombre ?? 'Todas mis sedes'} · ${columnas.length} ${agrupar === 'cabina' && vista === 'dia' ? 'cabinas' : vista === 'semana' ? 'días' : 'podólogos'}`}
        acciones={puedeEditar && <button className="btn" onClick={() => irNueva()}><Plus size={14} style={{ verticalAlign: -2 }} /> Nueva cita</button>} />
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Citas" value={total} subtitle="sin canceladas" loading={citasQ.cargando} />
        <KPICard title="Por confirmar" value={kpi('por_confirmar')} color="var(--gold)" loading={citasQ.cargando} />
        <KPICard title="Confirmadas" value={kpi('confirmada')} color="var(--green)" loading={citasQ.cargando} />
        <KPICard title="No asistió" value={kpi('no_asistio')} color="var(--red)" loading={citasQ.cargando} />
      </div>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <button className="btn o" onClick={() => setDia(sumarDias(dia, vista === 'semana' ? -7 : -1))} aria-label="Anterior"><ChevronLeft size={15} /></button>
        <button className="btn o" onClick={() => setDia(hoyISO())}>Hoy</button>
        <button className="btn o" onClick={() => setDia(sumarDias(dia, vista === 'semana' ? 7 : 1))} aria-label="Siguiente"><ChevronRight size={15} /></button>
        <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} />
        <select value={vista} onChange={e => setVista(e.target.value)} aria-label="Vista"><option value="dia">Día</option><option value="semana">Semana</option></select>
        {vista === 'dia' && <select value={agrupar} onChange={e => setAgrupar(e.target.value)} aria-label="Agrupar por"><option value="podologo">Por podólogo</option><option value="cabina">Por cabina</option></select>}
        <select value={podFiltro} onChange={e => setPodFiltro(e.target.value)} aria-label="Podólogo"><option value="">Todos los podólogos</option>{podQ.filas.map(p => <option key={p.id} value={p.id}>{nombrePerfil(p)}</option>)}</select>
        <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--muted)' }} /><input style={{ paddingLeft: 26 }} placeholder="Buscar paciente…" value={buscar} onChange={e => setBuscar(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(ESTADOS_CITA).map(([k, v]) => <span key={k} className={`bd ${v.color}`}>{v.label}</span>)}
        <span className="text-muted" style={{ fontSize: 12 }}>{puedeEditar ? 'Arrastra una cita por confirmar o confirmada para reprogramarla.' : 'Solo consulta.'}</span>
      </div>
      <AvisoError error={error} titulo="No se pudo cargar la agenda" />
      {citasQ.cargando ? <div className="card text-muted">Cargando agenda…</div> : !error && columnas.length === 0 ? (
        <div className="card text-muted" style={{ textAlign: 'center', padding: 30 }}>No hay podólogos ni cabinas para mostrar en esta sede.</div>
      ) : (
        <RejillaAgenda columnas={columnas} onCita={setSel} onDropCita={alSoltar} onHueco={irNueva} puedeArrastrar={c => puedeEditar && ['por_confirmar', 'confirmada'].includes(c.estado)} />
      )}
      {!citasQ.cargando && !error && citas.length === 0 && <div className="text-muted" style={{ textAlign: 'center', marginTop: 10, fontSize: 13 }}>No hay citas en este periodo. Haz clic en un horario libre para agendar.</div>}

      {sel && <DetalleCita cita={sel} onClose={() => setSel(null)} onCambio={() => qc.invalidateQueries({ queryKey: ['comercial'] })} />}

      <Modal open={!!mover} onClose={() => setMover(null)} title="Reprogramar cita" size="sm"
        footer={<><button className="btn o" onClick={() => setMover(null)}>Cancelar</button><button className="btn" onClick={confirmarMover}>Reprogramar</button></>}>
        {mover && (
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <b>{mover.cita.paciente_nombre}</b> · {mover.cita.servicio_nombre}<br />
            De {hora(mover.cita.inicio)} a <b>{hora(mover.nuevoInicio)}</b> ({new Date(mover.nuevoInicio).toLocaleDateString('es-MX')}).
            {mover.resultado.cuentaReprogramacion && <div className="text-muted">Cuenta como reprogramación ({(mover.cita.reprogramaciones ?? 0) + 1} de {parametros.reprogramaciones_max}). El anticipo se conserva.</div>}
            {mover.resultado.avisos.map(a => <div key={a} className="text-red" style={{ marginTop: 6 }}>⚠ {a}</div>)}
          </div>
        )}
      </Modal>
    </div>
  )
}
