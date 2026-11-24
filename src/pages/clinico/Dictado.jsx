import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Mic, Pause, Play, Square, Upload, Trash2 } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, insertar, actualizar } from '../../lib/api'
import { transcribir, MODO_DICTADO, AVISO_DICTADO, esTextoSimulado, MARCA_SIMULADA } from '../../lib/adaptadores/dictadoIA'
import { SECCIONES_DICTADO, etiquetaDe } from '../../lib/clinico/catalogos'
import { consultaEditable } from '../../lib/clinico/inmutabilidad'
import { fechaHora } from '../../lib/formato'
import { Aviso, AvisoSimulado, Seccion, Volver, useAccion, useVista, usePaciente, mensajeError, CabeceraPaciente } from './componentes/comunes'
import FirmaDialogo from './componentes/FirmaDialogo'

const CAMPOS_PROPUESTA = [['motivo_consulta', 'Motivo de consulta'], ['procedimiento', 'Procedimiento'], ['hallazgo', 'Hallazgo'], ['medicamento', 'Medicamento (dosis, vía, frecuencia)'], ['proxima_cita', 'Próxima cita']]
const seg = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Dictado() {
  const { id } = useParams()
  const nav = useNavigate()
  const { perfil } = useApp()
  const puede = usePermiso('consultas.escribir')
  const { ejecutar, ocupado } = useAccion()
  const consulta = useQuery({ queryKey: ['clinico', 'consulta', id], queryFn: async () => { const r = await leer('consultas', { sedeCol: false, filtros: { id }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const c = consulta.data
  const pac = usePaciente(c?.paciente_id)
  const consent = useVista('cons-dictado-' + c?.paciente_id, 'consentimientos', { sedeCol: false, filtros: { paciente_id: c?.paciente_id, tipo: 'dictado_ia', estado: 'firmado', aceptado: true }, orden: { columna: 'fecha_hora', asc: false }, limite: 1 }, { enabled: !!c })
  const recientes = useVista('dictados-' + id, 'dictados', { sedeCol: false, filtros: { consulta_id: id }, orden: { columna: 'iniciado_en', asc: false }, limite: 20 })
  const [seccion, setSeccion] = useState('nota_evolucion')
  const [fase, setFase] = useState('espera') // espera | grabando | pausado | transcrito
  const [seg_, setSeg] = useState(0)
  const [dictadoId, setDictadoId] = useState(null)
  const [texto, setTexto] = useState('')
  const [original, setOriginal] = useState('')
  const [audio, setAudio] = useState(null)
  const [prop, setProp] = useState(Object.fromEntries(CAMPOS_PROPUESTA.map(([k]) => [k, { valor: '', decision: null }])))
  const [firmando, setFirmando] = useState(false)
  const rec = useRef(null)
  const trozos = useRef([])
  const flujo = useRef(null)
  const timer = useRef(null)

  useEffect(() => () => { clearInterval(timer.current); flujo.current?.getTracks().forEach(t => t.stop()) }, [])
  const tick = () => { clearInterval(timer.current); timer.current = setInterval(() => setSeg(s => s + 1), 1000) }
  const consentimiento = consent.data?.filas?.[0]

  async function crearDictado() {
    const r = await insertar('dictados', { consulta_id: id, usuario_id: perfil.id, seccion, idioma: 'es-MX', consentimiento_id: consentimiento.id, estado: 'en_curso', adaptador_ia: MODO_DICTADO })
    if (r.error) throw r.error
    setDictadoId(r.data[0].id)
    return r.data[0].id
  }
  async function iniciar() {
    if (!consentimiento) { toast.error('Sin consentimiento de dictado con IA no se puede grabar (P-015).'); return }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite grabar audio.')
      flujo.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      rec.current = new MediaRecorder(flujo.current)
      trozos.current = []
      rec.current.ondataavailable = e => e.data.size && trozos.current.push(e.data)
      await crearDictado()
      rec.current.start(); setSeg(0); setFase('grabando'); tick()
    } catch (e) { toast.error(mensajeError(e)) }
  }
  const pausar = () => { if (fase === 'grabando') { rec.current.pause(); clearInterval(timer.current); setFase('pausado') } else { rec.current.resume(); tick(); setFase('grabando') } }
  async function detener() {
    clearInterval(timer.current)
    const fin = new Promise(res => { rec.current.onstop = res })
    rec.current.stop(); flujo.current?.getTracks().forEach(t => t.stop())
    await fin
    await procesar(new Blob(trozos.current, { type: rec.current.mimeType || 'audio/webm' }), seg_)
  }
  async function subirArchivo(file) {
    if (!file) return
    if (!consentimiento) { toast.error('Sin consentimiento de dictado con IA no se puede procesar audio (P-015).'); return }
    try { await crearDictado(); await procesar(file, 0) } catch (e) { toast.error(mensajeError(e)) }
  }
  async function procesar(blob, duracion) {
    setAudio(blob)
    const r = await transcribir(blob, { seccion })
    setTexto(r.texto); setOriginal(r.texto); setFase('transcrito')
    const did = dictadoId ?? (await leer('dictados', { sedeCol: false, filtros: { consulta_id: id, estado: 'en_curso' }, orden: { columna: 'iniciado_en', asc: false }, limite: 1 })).data?.[0]?.id
    if (did) await actualizar('dictados', did, { estado: 'transcrito', transcripcion: r.texto, duracion_seg: duracion, terminado_en: new Date().toISOString() })
    recientes.refetch()
  }
  async function descartar() {
    if (dictadoId) await ejecutar(() => actualizar('dictados', dictadoId, { estado: 'descartado', terminado_en: new Date().toISOString() }), { ok: 'Dictado descartado; el audio no se conserva', invalidar: [] })
    setFase('espera'); setTexto(''); setAudio(null); setDictadoId(null); setSeg(0)
    recientes.refetch()
  }
  async function aceptar() {
    if (esTextoSimulado(texto)) { toast.error('Reemplaza el texto marcado como simulado por la transcripción real antes de pasar a la nota.'); return }
    if (!texto.trim()) { toast.error('El texto está vacío.'); return }
    const r = await ejecutar(async () => {
      const editado = texto !== original
      const u = await actualizar('dictados', dictadoId, { estado: editado ? 'editado' : 'aceptado', transcripcion_final: texto })
      if (u.error) return u
      const filas = CAMPOS_PROPUESTA.filter(([k]) => prop[k].valor.trim() && prop[k].decision).map(([k]) => ({ dictado_id: dictadoId, campo: k, valor: prop[k].valor.trim(), decision: prop[k].decision === 'aceptada' ? 'aceptada' : 'rechazada' }))
      if (filas.length) { const p = await insertar('dictado_propuestas', filas); if (p.error) return p }
      const cambios = { nota_origen: 'dictado_ia', dictado_id: dictadoId }
      const col = { nota_evolucion: 'nota_evolucion', descripcion_procedimiento: 'descripcion_procedimiento', hallazgos: 'observaciones_seguimiento' }[seccion]
      cambios[col] = [c[col], texto.trim()].filter(Boolean).join('\n')
      const acept = k => (prop[k].decision === 'aceptada' ? prop[k].valor.trim() : null)
      if (acept('motivo_consulta') && !c.motivo_consulta) cambios.motivo_consulta = acept('motivo_consulta')
      if (acept('procedimiento')) cambios.descripcion_procedimiento = [c.descripcion_procedimiento, acept('procedimiento')].filter(Boolean).join('\n')
      if (acept('proxima_cita')) cambios.proxima_cita_tipo = acept('proxima_cita')
      return actualizar('consultas', id, cambios)
    }, { ok: 'Texto revisado y pasado a la nota (nada se firma hasta que firmes la consulta)', invalidar: ['clinico'] })
    if (r) nav(`/consultas/${id}`)
  }
  async function alFirmarConsentimiento(f) {
    const r = await ejecutar(() => insertar('consentimientos', { paciente_id: c.paciente_id, tipo: 'dictado_ia', aceptado: true, firma_id: f.id, canal: 'recepcion_pantalla', consulta_id: id, dispositivo: navigator.userAgent.slice(0, 200), estado: 'firmado' }), { ok: 'Consentimiento de dictado registrado', invalidar: ['clinico'] })
    if (r) setFirmando(false)
  }

  if (consulta.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (consulta.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(consulta.error)}</Aviso></div>
  if (!c) return <div className="pagina"><Aviso tipo="err">Consulta no encontrada.</Aviso><Volver a="/consultas" /></div>
  if (!puede || !consultaEditable(c) || c.podologo_id !== perfil?.id) return <div className="pagina"><Aviso tipo="err">Solo el podólogo autor puede dictar en una consulta abierta (la nota firmada no se modifica).</Aviso><Volver a={`/consultas/${id}`} /></div>

  return (
    <div className="pagina">
      <PageHeader titulo="Dictar nota por voz" subtitulo={`Consultas › Dictado · se vincula a la consulta ${c.folio}`} acciones={<Volver a={`/consultas/${id}`} />} />
      <AvisoSimulado>{AVISO_DICTADO}</AvisoSimulado>
      <CabeceraPaciente paciente={pac.data} />
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <Seccion titulo={fase === 'grabando' ? '● Grabando' : fase === 'pausado' ? 'Pausado' : 'Dictado'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800 }}>{seg(seg_)}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Idioma: Español (México)</span>
              <FormField label="Sección que dicto" as="select" options={SECCIONES_DICTADO} value={seccion} onChange={e => setSeccion(e.target.value)} disabled={fase !== 'espera'} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {fase === 'espera' && <>
                <button type="button" className="btn" disabled={!consentimiento} onClick={iniciar}><Mic size={14} style={{ verticalAlign: -3 }} /> Iniciar grabación</button>
                <label className={`btn o${!consentimiento ? ' disabled' : ''}`} style={{ cursor: consentimiento ? 'pointer' : 'not-allowed', opacity: consentimiento ? 1 : 0.4 }}><Upload size={14} style={{ verticalAlign: -3 }} /> Subir audio<input type="file" accept="audio/*" disabled={!consentimiento} style={{ display: 'none' }} onChange={e => { subirArchivo(e.target.files?.[0]); e.target.value = '' }} /></label></>}
              {['grabando', 'pausado'].includes(fase) && <>
                <button type="button" className="btn o" onClick={pausar}>{fase === 'grabando' ? <><Pause size={14} style={{ verticalAlign: -3 }} /> Pausar</> : <><Play size={14} style={{ verticalAlign: -3 }} /> Reanudar</>}</button>
                <button type="button" className="btn" onClick={detener}><Square size={14} style={{ verticalAlign: -3 }} /> Detener y transcribir</button></>}
              {fase !== 'espera' && <button type="button" className="btn red" onClick={descartar}><Trash2 size={14} style={{ verticalAlign: -3 }} /> Descartar</button>}
            </div>
            <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
              <b style={{ fontSize: 12.5 }}>Consentimiento del paciente para grabar / usar IA</b>
              {consentimiento ? <div style={{ fontSize: 13, color: 'var(--green)' }}>✓ Informado y firmado el {fechaHora(consentimiento.fecha_hora)} (versión {consentimiento.plantilla_version ?? '—'})</div>
                : <div style={{ fontSize: 13 }}><span className="bd r">Sin consentimiento</span> Sin consentimiento firmado no se habilita el dictado (P-015). <button type="button" className="chip-quick" onClick={() => setFirmando(true)}>Registrar firma del paciente</button></div>}
            </div>
            {audio && <div style={{ marginTop: 10 }}><audio controls src={URL.createObjectURL(audio)} style={{ width: '100%' }} /><div style={{ fontSize: 11, color: 'var(--muted)' }}>El audio solo vive en este navegador y se descarta al aceptar o descartar (P-014); no se sube al servidor.</div></div>}
          </Seccion>

          {fase === 'transcrito' && (
            <Seccion titulo="Transcripción (editable)" ayuda="Revisa y corrige: nada se guarda en el expediente hasta que el podólogo acepta y, después, firma la consulta.">
              <FormField as="textarea" rows={8} value={texto} onChange={e => setTexto(e.target.value)} />
              {esTextoSimulado(texto) && <Aviso tipo="err">El texto contiene la marca «{MARCA_SIMULADA}». Bórrala y escribe lo dictado para poder aceptarlo.</Aviso>}
            </Seccion>)}
        </div>

        <div>
          {fase === 'transcrito' && (
            <Seccion titulo="Estructura para la nota (revisa y acepta campo por campo)" ayuda="Sin llave de IA no se propone nada automáticamente: captura los campos y decide. El diagnóstico NO se propone: lo elige el podólogo.">
              {CAMPOS_PROPUESTA.map(([k, l]) => (
                <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
                  <FormField label={l} value={prop[k].valor} onChange={e => setProp(s => ({ ...s, [k]: { ...s[k], valor: e.target.value } }))} />
                  <button type="button" className={`btn sm${prop[k].decision === 'aceptada' ? ' green' : ' o'}`} onClick={() => setProp(s => ({ ...s, [k]: { ...s[k], decision: 'aceptada' } }))}>Aceptar</button>
                  <button type="button" className={`btn sm${prop[k].decision === 'rechazada' ? ' red' : ' o'}`} onClick={() => setProp(s => ({ ...s, [k]: { ...s[k], decision: 'rechazada' } }))}>Rechazar</button>
                </div>))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn" disabled={ocupado} onClick={aceptar}>Aceptar y pasar a la nota</button>
                <button type="button" className="btn o" onClick={descartar}>Rechazar todo</button>
              </div>
            </Seccion>)}
          <Seccion titulo="Reglas del dictado">
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              • Di «punto y aparte», «nuevo hallazgo», «cerrar nota» (con transcripción real).<br />
              • Los términos del catálogo (CIE-10, procedimientos) se reconocerán con la IA real.<br />
              • Nada se guarda en el expediente hasta que el podólogo firma la consulta.<br />
              • El audio se borra al confirmar (máx. 24 h si no se confirma) y todo dictado queda en la bitácora.
            </div>
          </Seccion>
          <Seccion titulo="Dictados de esta consulta">
            <DataTable buscador={false} sinPaginacion cargando={recientes.isLoading} filas={recientes.data?.filas ?? []} error={recientes.error ? mensajeError(recientes.error) : null}
              columnas={[{ key: 'iniciado_en', label: 'Fecha', render: d => fechaHora(d.iniciado_en) }, { key: 'seccion', label: 'Sección', render: d => etiquetaDe(SECCIONES_DICTADO, d.seccion) }, { key: 'adaptador_ia', label: 'Motor' }, { key: 'estado', label: 'Estado', render: d => <StatusBadge estado={d.estado} variante={['aceptado', 'editado'].includes(d.estado) ? 'v' : d.estado === 'descartado' ? 'n' : 'a'} /> }]}
              vacio={{ title: 'Sin dictados', description: 'Aún no hay dictados en esta consulta.' }} />
          </Seccion>
        </div>
      </div>
      {firmando && <FirmaDialogo open titulo="Consentimiento para dictado con IA" firmante={{ tipo: 'paciente', pacienteId: c.paciente_id, nombre: pac.data?.nombre_completo }} canal="recepcion_pantalla" documento={{ tipo: 'consentimiento_dictado_ia', id: c.paciente_id }} onClose={() => setFirmando(false)} onFirmada={alFirmarConsentimiento}>
        <Aviso>El paciente autoriza que la voz del podólogo durante su consulta se grabe y procese con IA para redactar su nota. Es revocable. Texto pendiente de validación legal (P-139).</Aviso></FirmaDialogo>}
    </div>
  )
}
