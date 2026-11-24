// Portal público: confirmar / reprogramar / cancelar una cita desde la liga (mockup 27). Ruta /app/cita/:token
// Usa SOLO portal_ver_cita y portal_accion_cita (anon). Cada liga sirve para UNA acción; si la cita sigue viva el servidor
// devuelve una liga nueva y aquí se cambia la URL a esa liga.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Check, MapPin } from 'lucide-react'
import { rpc } from '../../lib/api'
import { fijarZonaHoraria, fechaLarga, hora, moneda } from '../../lib/formato'
import { agruparPorDia } from '../../lib/comercial/agenda'
import Marco, { Cargando, Problema, mensajePortal } from './componentes/Marco'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FormField from '../../components/ui/FormField'

const MOTIVOS = { liga_no_encontrada: 'Esta liga no existe.', liga_vencida: 'Esta liga ya no es válida (venció o ya se usó).', liga_usada: 'Esta liga ya se usó. Si necesitas otro cambio, llama a la sede.', liga_revocada: 'Esta liga fue reemplazada por una más reciente.' }
const ETQ_ESTADO = { por_confirmar: 'Por confirmar', confirmada: 'Confirmada', cancelada: 'Cancelada', atendida: 'Atendida', no_asistio: 'No asistió', en_camino: 'En camino' }
const sumarDias = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

export default function PortalCita() {
  const { token } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const [cita, setCita] = useState(null)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [reprog, setReprog] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(async () => {
    setCita(null); setError(null)
    const { data, error: e } = await rpc('portal_ver_cita', { p_token: token })
    if (e) return setError(e)
    if (data?.zona_horaria) fijarZonaHoraria(data.zona_horaria)
    setCita(data)
  }, [token])
  useEffect(() => { cargar() }, [cargar])

  const accion = async (a, nuevoInicio = null) => {
    setOcupado(true); setAviso(null)
    const { data, error: e } = await rpc('portal_accion_cita', { p_token: token, p_accion: a, p_nuevo_inicio: nuevoInicio })
    setOcupado(false)
    if (e) { setAviso(mensajePortal(e)); return false }
    setResultado(data)
    if (data.liga_token) nav(`/cita/${data.liga_token}${window.location.search}`, { replace: true })
    setReprog(false); setCancelando(false)
    return true
  }

  if (error) return <Marco><Problema titulo="No pudimos abrir tu cita" texto={mensajePortal(error)} /></Marco>
  if (!cita) return <Marco><Cargando texto="Buscando tu cita…" /></Marco>
  if (!cita.valida) return <Marco titulo="Tu cita"><Problema titulo="Liga no válida" texto={MOTIVOS[cita.motivo] ?? 'Esta liga ya no es válida.'} accion={<p style={{ marginTop: 10, fontSize: 14 }}>Llama a la sede para que te ayuden.</p>} /></Marco>

  const sede = cita.sede ?? {}
  const siguiente = resultado ? { ...cita, estado: resultado.estado, inicio: resultado.inicio ?? cita.inicio } : cita
  const vivo = ['por_confirmar', 'confirmada'].includes(siguiente.estado)

  return (
    <Marco titulo="Tu cita" subtitulo="Confirmar, reprogramar o cancelar · sin iniciar sesión" ancho={640}>
      {resultado && (
        <div className="card" role="status" style={{ borderLeft: `4px solid ${resultado.accion === 'cancelar' ? 'var(--muted)' : 'var(--green)'}`, marginBottom: 12 }}>
          {resultado.accion === 'confirmar' && <><b><Check size={16} style={{ verticalAlign: -3 }} /> ¡Cita confirmada!</b><div style={{ fontSize: 14 }}>{fechaLarga(resultado.inicio)} · {hora(resultado.inicio)} · {sede.nombre}</div></>}
          {resultado.accion === 'reprogramar' && <><b><Check size={16} style={{ verticalAlign: -3 }} /> Cita reprogramada</b><div style={{ fontSize: 14 }}>Nuevo horario: {fechaLarga(resultado.inicio)} · {hora(resultado.inicio)}. Tu anticipo se conserva.</div></>}
          {resultado.accion === 'cancelar' && <><b>Cita cancelada</b><div style={{ fontSize: 14 }}>{resultado.reembolso ? `Cancelaste con más de ${cita.horas_de_aviso_requeridas} h: tu anticipo se reembolsará (${resultado.plazo_reembolso}).` : `Cancelaste con menos de ${cita.horas_de_aviso_requeridas} h: el anticipo no es reembolsable.`}</div></>}
          {resultado.accion !== 'cancelar' && <a className="btn o" style={{ marginTop: 8, display: 'inline-block' }} href={icsUrl(siguiente, cita)} download="cita.ics"><CalendarPlus size={14} style={{ verticalAlign: -2 }} /> Agregar al calendario</a>}
        </div>
      )}
      {aviso && <div role="alert" className="card" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12, fontSize: 14 }}>{aviso}</div>}
      <div className="card">
        <table style={{ fontSize: 14.5 }}><tbody>
          {[['Folio', cita.folio], ['Servicio', cita.servicio], ['Podólogo(a)', cita.podologo], ['Sede', `${sede.nombre ?? ''}${sede.direccion ? ' · ' + sede.direccion : ''}`], ['Fecha', `${fechaLarga(siguiente.inicio)} · ${hora(siguiente.inicio)}`],
            ['Atención', cita.tipo_atencion], ['Anticipo', Number(cita.anticipo) > 0 ? `${moneda(cita.anticipo)} (${cita.anticipo_estado ?? 'registrado'})` : 'Sin anticipo'], ['Estado actual', ETQ_ESTADO[siguiente.estado] ?? siguiente.estado]].map(([k, v]) =>
            <tr key={k}><td className="text-muted" style={{ paddingRight: 16, paddingBottom: 4 }}>{k}</td><td><b>{v}</b></td></tr>)}
        </tbody></table>
        {sede.direccion && <div style={{ marginTop: 8, fontSize: 14 }}><MapPin size={14} style={{ verticalAlign: -2 }} /> <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sede.direccion)}`} target="_blank" rel="noreferrer">Cómo llegar</a>{sede.telefono ? ` · Tel. ${sede.telefono}` : ''}</div>}
      </div>

      {vivo && !resultado?.accion?.startsWith('cancel') && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          {cita.puede_confirmar && siguiente.estado === 'por_confirmar' && <button className="btn" disabled={ocupado} onClick={() => accion('confirmar')}>Confirmo mi asistencia</button>}
          {cita.puede_reprogramar ? <button className="btn o" disabled={ocupado} onClick={() => setReprog(true)}>Reprogramar mi cita</button> : <span className="text-muted" style={{ fontSize: 13, alignSelf: 'center' }}>No es posible reprogramar sin costo ({cita.reprogramaciones_restantes === 0 ? 'ya usaste tus reprogramaciones' : `faltan menos de ${cita.horas_de_aviso_requeridas} h`}).</span>}
          {cita.puede_cancelar && <button className="btn red" disabled={ocupado} onClick={() => setCancelando(true)}>Cancelar mi cita</button>}
        </div>)}
      {!vivo && !resultado && <p className="text-muted" style={{ marginTop: 12 }}>Esta cita ya no admite cambios desde la liga. Llama a la sede si necesitas ayuda.</p>}
      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>Reprogramar es sin costo con al menos {cita.horas_de_aviso_requeridas} h de aviso (te quedan {cita.reprogramaciones_restantes}). Cancelando con menos de {cita.horas_de_aviso_requeridas} h el anticipo no se reembolsa.</p>

      <ConfirmDialog open={cancelando} titulo="Cancelar mi cita" peligro textoConfirmar="Sí, cancelar" textoCancelar="Mejor no" ocupado={ocupado}
        mensaje={Number(cita.anticipo) > 0 ? (cita.cancelacion_reembolsa ? `Cancelas con más de ${cita.horas_de_aviso_requeridas} h: tu anticipo de ${moneda(cita.anticipo)} se reembolsará (5 a 10 días hábiles).` : `Cancelas con menos de ${cita.horas_de_aviso_requeridas} h: tu anticipo de ${moneda(cita.anticipo)} no es reembolsable.`) : '¿Seguro que quieres cancelar tu cita?'}
        onConfirm={() => accion('cancelar')} onCancel={() => setCancelando(false)} />
      {reprog && <Reprogramar cita={cita} params={Object.fromEntries(sp)} onClose={() => setReprog(false)} onElegir={accion} ocupado={ocupado} aviso={aviso} />}
    </Marco>
  )
}

// Reprogramar: con ?c=clinica&s=sede&sv=servicio&p=podologo (liga generada por la clínica) se ofrecen horarios libres;
// sin esos datos el paciente propone día y hora y el servidor valida que el horario esté libre.
function Reprogramar({ cita, params, onClose, onElegir, ocupado, aviso }) {
  const puedeListar = params.c && params.s && params.sv
  const [slots, setSlots] = useState({ cargando: !!puedeListar, filas: [], error: null })
  const [manual, setManual] = useState('')
  const [elegido, setElegido] = useState(null)
  useEffect(() => {
    if (!puedeListar) return
    const hoy = new Date().toISOString().slice(0, 10)
    rpc('portal_disponibilidad', { p_slug: params.c, p_sede: params.s, p_servicio: params.sv, p_podologo: params.p ?? null, p_desde: hoy, p_hasta: sumarDias(hoy, 13), p_tipo: cita.tipo_atencion === 'videoconsulta' ? 'videoconsulta' : 'presencial' })
      .then(({ data, error }) => setSlots({ cargando: false, filas: Array.isArray(data) ? data : [], error }))
  }, []) // eslint-disable-line
  const dias = Object.entries(agruparPorDia(slots.filas, cita.zona_horaria))
  return (
    <Modal open onClose={onClose} title="Reprogramar mi cita" size="wide"
      footer={<><button className="btn o" onClick={onClose}>Volver</button><button className="btn" disabled={ocupado || (!elegido && !manual)} onClick={() => onElegir('reprogramar', elegido ?? new Date(manual).toISOString())}>Confirmar nuevo horario</button></>}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>Cita actual: <b>{fechaLarga(cita.inicio)} · {hora(cita.inicio)}</b> · {cita.podologo}. Tu anticipo se conserva.</div>
      {puedeListar ? (
        slots.cargando ? <Cargando texto="Buscando horarios…" /> : slots.error ? <div className="text-red">{mensajePortal(slots.error)}</div> : dias.length === 0 ? <div className="text-muted">No hay horarios libres en los próximos 14 días. Llama a la sede.</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {dias.map(([d, hs]) => <div key={d} className="card" style={{ padding: 8 }}><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</div>
              {hs.map(s => <button key={s.inicio} type="button" className={`btn${elegido === s.inicio ? '' : ' o'}`} style={{ width: '100%', marginBottom: 3, padding: '4px' }} onClick={() => setElegido(s.inicio)}>{hora(s.inicio)}</button>)}</div>)}
          </div>)
      ) : (
        <FormField label="Nuevo día y hora" type="datetime-local" value={manual} onChange={e => setManual(e.target.value)} hint="Te confirmaremos al instante si ese horario está libre." />
      )}
      {aviso && <div role="alert" className="text-red" style={{ fontSize: 13, marginTop: 8 }}>{aviso}</div>}
    </Modal>
  )
}

function icsUrl(c, cita) {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const fin = c.fin ?? new Date(new Date(c.inicio).getTime() + 30 * 60000).toISOString()
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART:${f(c.inicio)}`, `DTEND:${f(fin)}`, `SUMMARY:${cita.servicio ?? 'Cita'}`, `LOCATION:${cita.sede?.direccion ?? ''}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}
