import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Video, VideoOff, Mic, MicOff, MonitorUp, Camera, PhoneOff, Copy } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, rpc, insertar, actualizar } from '../../lib/api'
import { abrirMediosLocales, MODO_VIDEO, AVISO_VIDEO, ligaSalaPaciente } from '../../lib/adaptadores/video'
import { fechaHora, hora, fecha } from '../../lib/formato'
import { Aviso, AvisoSimulado, Seccion, Volver, useAccion, useVista, usePaciente, mensajeError } from './componentes/comunes'
import FirmaDialogo from './componentes/FirmaDialogo'

const ESTADOS = { programada: 'Programada', en_sala_espera: 'Paciente en sala de espera', en_consulta: 'En consulta', finalizada: 'Finalizada', liga_vencida: 'Liga vencida' }

export default function Videoconsulta() {
  const { citaId } = useParams()
  const nav = useNavigate()
  const { perfil } = useApp()
  const puede = usePermiso('consultas.escribir')
  const { ejecutar, ocupado } = useAccion()
  const cita = useQuery({ queryKey: ['clinico', 'cita-video', citaId], queryFn: async () => { const r = await leer('prp_agenda', { sedeCol: false, filtros: { id: citaId }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const c = cita.data
  const pac = usePaciente(c?.paciente_id)
  const sala = useQuery({ queryKey: ['clinico', 'sala', citaId], queryFn: async () => { const r = await leer('salas_videoconsulta', { sedeCol: false, filtros: { cita_id: citaId }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null }, refetchInterval: 15000 })
  const consulta = useVista('consulta-video-' + citaId, 'consultas', { sedeCol: false, filtros: { cita_id: citaId }, limite: 1 })
  const consTele = useVista('cons-tele-' + c?.paciente_id, 'consentimientos', { sedeCol: false, filtros: { paciente_id: c?.paciente_id, tipo: 'telemedicina', estado: 'firmado', aceptado: true }, orden: { columna: 'fecha_hora', asc: false }, limite: 1 }, { enabled: !!c })
  const fotos = useVista('fotos-video-' + consulta.data?.filas?.[0]?.id, 'fotos_clinicas', { sedeCol: false, filtros: { consulta_id: consulta.data?.filas?.[0]?.id, origen: 'paciente', retirada: false } }, { enabled: !!consulta.data?.filas?.[0] })
  const [liga, setLiga] = useState(null)
  const [firmando, setFirmando] = useState(false)
  const [medios, setMedios] = useState(null)
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const [seg, setSeg] = useState(0)

  useEffect(() => () => medios?.detener(), [medios])
  useEffect(() => { if (videoRef.current && medios) videoRef.current.srcObject = medios.stream }, [medios])
  useEffect(() => { if (!medios) return; const t = setInterval(() => setSeg(s => s + 1), 1000); return () => clearInterval(t) }, [medios])

  const s = sala.data
  const cons = consulta.data?.filas?.[0]
  const tieneConsent = (consTele.data?.filas ?? []).length > 0

  async function crearSala() {
    const r = await ejecutar(() => rpc('crear_sala_videoconsulta', { p_cita: citaId, p_consulta: cons?.id ?? null }), { ok: 'Sala creada', invalidar: ['clinico'] })
    if (r?.data) { setLiga(r.data.token ? ligaSalaPaciente(window.location.origin, r.data.token) : null); sala.refetch() }
  }
  async function abrirCamara() { setError(null); try { setMedios(await abrirMediosLocales()) } catch (e) { setError(e.message) } }
  function cerrarCamara() { medios?.detener(); setMedios(null); setSeg(0) }
  const alternar = (tipo) => {
    if (!medios) return
    const pistas = tipo === 'mic' ? medios.stream.getAudioTracks() : medios.stream.getVideoTracks()
    const nuevo = tipo === 'mic' ? !mic : !cam
    pistas.forEach(p => { p.enabled = nuevo }); tipo === 'mic' ? setMic(nuevo) : setCam(nuevo)
  }
  async function terminar() {
    cerrarCamara()
    if (s) await ejecutar(() => actualizar('salas_videoconsulta', s.id, { estado: 'finalizada', finalizada_en: new Date().toISOString() }), { ok: 'Videoconsulta terminada', invalidar: ['clinico'] })
  }
  async function crearNota() {
    const r = await ejecutar(() => insertar('consultas', { paciente_id: c.paciente_id, sede_id: c.sede_id, cita_id: c.id, podologo_id: perfil.id, fecha_hora: new Date().toISOString(), tipo_atencion: 'a_distancia', servicio_id: c.servicio_id, motivo_consulta: c.motivo_consulta ?? null }), { ok: 'Nota a distancia iniciada', invalidar: ['clinico'] })
    if (r?.data?.[0]) nav(`/consultas/${r.data[0].id}`)
  }
  async function firmarTele(f) {
    const r = await ejecutar(() => insertar('consentimientos', { paciente_id: c.paciente_id, tipo: 'telemedicina', aceptado: true, firma_id: f.id, canal: 'recepcion_pantalla', cita_id: c.id, dispositivo: navigator.userAgent.slice(0, 200), estado: 'firmado' }), { ok: 'Consentimiento a distancia registrado', invalidar: ['clinico'] })
    if (r) setFirmando(false)
  }

  if (cita.isLoading || sala.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (cita.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(cita.error)}</Aviso></div>
  if (!c) return <div className="pagina"><Aviso tipo="err">Cita no encontrada.</Aviso><Volver a="/consultas" /></div>
  const inicio = new Date(c.inicio), entrada = new Date(inicio.getTime() - (s?.entrada_minutos_antes ?? 10) * 60000)
  const ligaTxt = liga ?? null

  return (
    <div className="pagina">
      <PageHeader titulo="Videoconsulta" subtitulo={`Agenda › Cita en línea · ${c.paciente_nombre}`} acciones={<Volver a="/consultas" />} />
      <AvisoSimulado>{AVISO_VIDEO}</AvisoSimulado>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <Seccion titulo="Estado de la sala">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <StatusBadge estado={s?.estado ?? 'programada'} label={s ? ESTADOS[s.estado] : 'Sala no creada'} variante={s?.estado === 'en_consulta' ? 'v' : 'a'} />
              <span className={`bd ${s?.paciente_conectado_en ? 'v' : 'n'}`}>{s?.paciente_conectado_en ? 'Paciente conectado' : 'Paciente sin conectar'}</span>
              <span className={`bd ${tieneConsent ? 'v' : 'r'}`}>{tieneConsent ? 'Consentimiento a distancia firmado' : 'Falta consentimiento a distancia'}</span>
              <span className={`bd ${s?.pagado_en_linea ? 'v' : 'n'}`}>{s?.pagado_en_linea ? 'Pagado en línea' : 'Pago pendiente (no bloquea)'}</span>
              <span className="bd n">Liga enviada: no (sin proveedor de mensajes)</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Entrada desde {hora(entrada)} ({s?.entrada_minutos_antes ?? 10} min antes) · tope {s?.tope_minutos ?? 60} min · no se graba salvo autorización escrita (P-016, P-018). La liga es de un solo uso por cita.</div>
            {!s && puede && <div style={{ marginTop: 8 }}><button type="button" className="btn" disabled={ocupado} onClick={crearSala}>Crear sala y liga para el paciente</button><div className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}>La telemedicina debe estar activada en la configuración de la clínica.</div></div>}
            {ligaTxt && <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}><input readOnly value={ligaTxt} style={{ flex: 1 }} /><button type="button" className="btn o sm" onClick={() => { navigator.clipboard?.writeText(ligaTxt); toast.success('Liga copiada: envíala por WhatsApp o correo') }}><Copy size={12} /> Copiar</button></div>}
            {s && !ligaTxt && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Por seguridad la liga solo se muestra al crear la sala. El portal del paciente valida la liga y el consentimiento.</div>}
            {!tieneConsent && puede && <button type="button" className="btn o sm" style={{ marginTop: 8 }} onClick={() => setFirmando(true)}>Registrar consentimiento a distancia del paciente</button>}
          </Seccion>
          <Seccion titulo="Paciente">
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <b><Link to={`/pacientes/${c.paciente_id}`}>{c.paciente_nombre}</Link></b> · {pac.data?.edad ?? '—'} años · Tel. {c.paciente_celular ?? '—'}<br />
              Cita: {fechaHora(c.inicio)} · {c.duracion_min} min · {c.servicio_nombre} · {c.sede_nombre}<br />
              {pac.data?.diabetes && pac.data.diabetes !== 'no' && <span className="bd a">Diabetes {pac.data.diabetes}</span>} {c.motivo_consulta && <span>Motivo: {c.motivo_consulta}</span>}
            </div>
          </Seccion>
          <Seccion titulo="Fotos enviadas por el paciente" ayuda="Se guardan en Fotos clínicas con la etiqueta «enviada por paciente».">
            {(fotos.data?.filas ?? []).length ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{fotos.data.filas.map(f => <li key={f.id}>{fecha(f.tomada_en)} · {f.comentario ?? 'foto'}</li>)}</ul> : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sin fotos recibidas. La función «pedir foto» requiere el proveedor de video real.</span>}
          </Seccion>
        </div>
        <div>
          <Seccion titulo={`Sala · tu cámara local${medios ? ` · ${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}` : ''}`}>
            <div style={{ background: '#1D1D1F', borderRadius: 10, aspectRatio: '16 / 10', display: 'grid', placeItems: 'center', color: '#fff', overflow: 'hidden' }}>
              {medios ? <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', fontSize: 13, padding: 20 }}>La cámara está apagada.<br /><span style={{ opacity: 0.7 }}>El paciente no puede conectarse mientras no exista un proveedor de video.</span></div>}
            </div>
            {error && <Aviso tipo="err" style={{ marginTop: 8 }}>{error}</Aviso>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {!medios ? <button type="button" className="btn" onClick={abrirCamara}><Video size={14} style={{ verticalAlign: -3 }} /> Probar cámara y micrófono</button> : <>
                <button type="button" className="btn o" onClick={() => alternar('mic')}>{mic ? <><Mic size={14} style={{ verticalAlign: -3 }} /> Silenciar</> : <><MicOff size={14} style={{ verticalAlign: -3 }} /> Activar micrófono</>}</button>
                <button type="button" className="btn o" onClick={() => alternar('cam')}>{cam ? <><Video size={14} style={{ verticalAlign: -3 }} /> Cámara</> : <><VideoOff size={14} style={{ verticalAlign: -3 }} /> Encender</>}</button></>}
              <button type="button" className="btn o" disabled title={`Requiere proveedor de video (${MODO_VIDEO})`}><MonitorUp size={14} style={{ verticalAlign: -3 }} /> Compartir pantalla</button>
              <button type="button" className="btn o" disabled title="Requiere proveedor de video"><Camera size={14} style={{ verticalAlign: -3 }} /> Pedir foto al paciente</button>
              <button type="button" className="btn o" disabled title="Requiere proveedor de video: no se captura al paciente en modo simulado">Capturar imagen</button>
              <button type="button" className="btn red" onClick={terminar} disabled={ocupado}><PhoneOff size={14} style={{ verticalAlign: -3 }} /> Terminar videoconsulta</button>
            </div>
          </Seccion>
          <Seccion titulo="Nota «a distancia» (queda marcada en el expediente)">
            {cons ? (
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <StatusBadge estado={cons.estado} /> {cons.folio}<br />Limitaciones: {cons.limitaciones_distancia ?? '—'}<br />Observación por video y fotos: {cons.observacion_video ?? '—'}
                <div style={{ marginTop: 8 }}><Link to={`/consultas/${cons.id}`} className="btn" style={{ textDecoration: 'none' }}>Abrir nota a distancia para capturar y firmar</Link></div>
              </div>
            ) : puede ? <button type="button" className="btn" disabled={ocupado} onClick={crearNota}>Iniciar nota a distancia</button> : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Solo el podólogo captura la nota.</span>}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>La nota se captura y firma en la pantalla de consulta (motivo, limitaciones, observación por video, diagnóstico, indicaciones y próxima cita). El envío de receta e indicaciones usa la impresión de la consulta.</div>
          </Seccion>
        </div>
      </div>
      {firmando && <FirmaDialogo open titulo="Consentimiento de atención a distancia" firmante={{ tipo: 'paciente', pacienteId: c.paciente_id, nombre: c.paciente_nombre }} canal="recepcion_pantalla" documento={{ tipo: 'consentimiento_telemedicina', id: c.paciente_id }} onClose={() => setFirmando(false)} onFirmada={firmarTele}>
        <Aviso>El paciente acepta recibir atención podológica a distancia y conoce sus limitaciones (sin exploración táctil/vascular). Texto pendiente de validación legal (P-139).</Aviso></FirmaDialogo>}
    </div>
  )
}
