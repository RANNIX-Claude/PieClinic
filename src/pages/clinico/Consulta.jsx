import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, Mic, Send, PenLine, Stethoscope, Lock } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import Modal from '../../components/ui/Modal'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { leer, insertar, actualizar, rpc } from '../../lib/api'
import { upsertPor } from '../../lib/clinico/db'
import { fechaHora, hora } from '../../lib/formato'
import { TIPOS_ATENCION, ANESTESIA, PRONOSTICOS, etiquetaDe } from '../../lib/clinico/catalogos'
import { consultaEditable, motivosBloqueoCierre, puedeAgregarNotaAclaratoria, validarNotaAclaratoria, requiereExcepcionAviso } from '../../lib/clinico/inmutabilidad'
import { resumenAntecedentesTexto } from '../../lib/clinico/impresos'
import { Aviso, Seccion, Volver, PacienteBuscador, useAccion, useVista, usePaciente, mensajeError, num, CabeceraPaciente } from './componentes/comunes'
import FirmaDialogo from './componentes/FirmaDialogo'
import ConsultaHallazgos from './componentes/ConsultaHallazgos'
import ConsultaExploracion from './componentes/ConsultaExploracion'
import ConsultaDiagnostico from './componentes/ConsultaDiagnostico'
import ConsultaProductos from './componentes/ConsultaProductos'
import SubirFotoClinica from './componentes/SubirFotoClinica'

const CAMPOS = ['servicio_id', 'plan_id', 'motivo_consulta', 'padecimiento_actual', 'sintomas', 'anestesia', 'descripcion_procedimiento', 'nota_evolucion', 'tratamiento_texto', 'observaciones_seguimiento', 'pronostico', 'proxima_visita', 'proxima_cita_tipo', 'proxima_cita_plazo_dias', 'cerrar_plan', 'limitaciones_distancia', 'observacion_video']
const SIGNOS = [['peso_kg', 'Peso (kg)', '0.1'], ['talla_cm', 'Talla (cm)', '0.1'], ['ta_sistolica', 'T/A sistólica', '1'], ['ta_diastolica', 'T/A diastólica', '1'], ['glucosa_capilar', 'Glucosa capilar (mg/dL)', '1'], ['frecuencia_cardiaca', 'Frec. cardiaca (lpm)', '1'], ['temperatura_c', 'Temperatura (°C)', '0.1'], ['dolor_0_10', 'Dolor (0–10)', '1'], ['talla_calzado', 'Talla de calzado', '0.5']]
const NUM = new Set(['proxima_cita_plazo_dias'])

export default function Consulta() {
  const { id } = useParams()
  return id ? <Captura id={id} /> : <Nueva />
}

/* ───────────────────────── Paso previo: crear el borrador ───────────────────────── */
function Nueva() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { perfil, sedes, sedeActivaId } = useApp()
  const p = usePermisos('consultas.escribir')
  const { ejecutar, ocupado } = useAccion()
  const [paciente, setPaciente] = useState(null)
  const [f, setF] = useState({ sede_id: sedeActivaId ?? (sedes.length === 1 ? sedes[0].id : ''), cabina_id: '', tipo_atencion: 'presencial', servicio_id: '', plan_id: '', cita_id: sp.get('cita') ?? '' })
  const pidUrl = sp.get('paciente')
  const pacUrl = usePaciente(pidUrl)
  useEffect(() => { if (pacUrl.data && !paciente) setPaciente(pacUrl.data) }, [pacUrl.data]) // eslint-disable-line
  const cita = useQuery({ queryKey: ['clinico', 'cita-para-consulta', f.cita_id], enabled: !!f.cita_id, queryFn: async () => { const r = await leer('citas', { sedeCol: false, filtros: { id: f.cita_id }, limite: 1 }); return r.data?.[0] ?? null } })
  useEffect(() => {
    const c = cita.data; if (!c) return
    setF(s => ({ ...s, sede_id: c.sede_id, cabina_id: c.cabina_id ?? '', servicio_id: c.servicio_id ?? '', tipo_atencion: c.tipo_atencion === 'videoconsulta' ? 'a_distancia' : c.tipo_atencion === 'domicilio' ? 'domicilio' : 'presencial', plan_id: c.plan_tratamiento_id ?? '' }))
    if (!paciente) leer('prp_pacientes', { sedeCol: false, filtros: { id: c.paciente_id }, limite: 1 }).then(r => r.data?.[0] && setPaciente(r.data[0]))
  }, [cita.data]) // eslint-disable-line
  // Ventana de citas fija al abrir la pantalla: si se calculara en cada render la clave de la consulta cambiaría siempre y no terminaría de cargar.
  const [ventanaCitas] = useState(() => ({ gte: new Date(Date.now() - 12 * 3600e3).toISOString(), lte: new Date(Date.now() + 24 * 3600e3).toISOString() }))
  const cabinas = useVista('cabinas-' + f.sede_id, 'cabinas', { sedeCol: false, filtros: { sede_id: f.sede_id, activa: true } }, { enabled: !!f.sede_id })
  const servicios = useVista('servicios-consulta', 'prp_servicios', { sedeCol: false, columnas: 'id,nombre', orden: { columna: 'nombre' }, limite: 300 })
  const planes = useVista('planes-abiertos-' + paciente?.id, 'prp_planes_progreso', { sedeCol: false, filtros: { paciente_id: paciente?.id, estado: 'en_curso' } }, { enabled: !!paciente })
  const citas = useVista('citas-hoy-' + paciente?.id, 'prp_agenda', { sedeCol: false, filtros: { paciente_id: paciente?.id, estado: ['por_confirmar', 'confirmada', 'en_camino'], inicio: ventanaCitas }, orden: { columna: 'inicio' } }, { enabled: !!paciente })

  if (!p['consultas.escribir']) return <div className="pagina"><Aviso tipo="err">Solo el podólogo abre consultas (y la clínica debe estar activa).</Aviso><Volver a="/consultas" /></div>
  const crear = async () => {
    const r = await ejecutar(() => insertar('consultas', {
      paciente_id: paciente.id, sede_id: f.sede_id, cabina_id: f.cabina_id || null, cita_id: f.cita_id || null, podologo_id: perfil.id, fecha_hora: new Date().toISOString(),
      tipo_atencion: f.tipo_atencion, servicio_id: f.servicio_id || null, plan_id: f.plan_id || null, sesion_plan_id: cita.data?.sesion_plan_id ?? null, motivo_consulta: cita.data?.motivo_consulta ?? null,
    }), { ok: 'Consulta iniciada (borrador)', invalidar: ['clinico'] })
    if (r?.data?.[0]) nav(`/consultas/${r.data[0].id}`, { replace: true })
  }
  const listo = paciente && f.sede_id
  return (
    <div className="pagina">
      <PageHeader titulo="Nueva consulta" subtitulo="Consultas › Iniciar consulta (se guarda como borrador y se autoguarda)" acciones={<Volver a="/consultas" />} />
      <Seccion titulo="Datos de la consulta">
        <PacienteBuscador seleccionado={paciente} onElegir={setPaciente} />
        {paciente?.alta_rapida && <Aviso tipo="err">La ficha del paciente es de alta rápida: complétala antes de la primera consulta (P-003). <Link to={`/pacientes/${paciente.id}/editar`}>Completar ficha</Link></Aviso>}
        <div className="row">
          <FormField label="Sede" required as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id} onChange={e => setF(s => ({ ...s, sede_id: e.target.value, cabina_id: '' }))} />
          <FormField label="Cabina" as="select" options={(cabinas.data?.filas ?? []).map(c => ({ value: c.id, label: c.nombre }))} value={f.cabina_id} onChange={e => setF(s => ({ ...s, cabina_id: e.target.value }))} />
          <FormField label="Tipo de atención" required as="select" options={TIPOS_ATENCION} value={f.tipo_atencion} onChange={e => setF(s => ({ ...s, tipo_atencion: e.target.value }))} />
          <FormField label="Servicio" as="select" options={(servicios.data?.filas ?? []).map(s => ({ value: s.id, label: s.nombre }))} value={f.servicio_id} onChange={e => setF(s => ({ ...s, servicio_id: e.target.value }))} />
        </div>
        <div className="row">
          <FormField label="Cita vinculada" as="select" options={(citas.data?.filas ?? []).map(c => ({ value: c.id, label: `${c.folio} · ${hora(c.inicio)} · ${c.servicio_nombre}` }))} value={f.cita_id} onChange={e => setF(s => ({ ...s, cita_id: e.target.value }))} placeholder="Sin cita (paciente sin cita)" />
          <FormField label="Plan de tratamiento" as="select" options={(planes.data?.filas ?? []).map(pl => ({ value: pl.plan_id, label: `${pl.nombre} (${pl.sesiones_realizadas}/${pl.sesiones_total})` }))} value={f.plan_id} onChange={e => setF(s => ({ ...s, plan_id: e.target.value }))} placeholder="Ninguno" />
        </div>
        <button type="button" className="btn" disabled={!listo || ocupado || paciente?.alta_rapida} onClick={crear}><Stethoscope size={14} style={{ verticalAlign: -3 }} /> {ocupado ? 'Creando…' : 'Iniciar consulta'}</button>
      </Seccion>
    </div>
  )
}

/* ───────────────────────── Captura y firma ───────────────────────── */
function Captura({ id }) {
  const nav = useNavigate()
  const { perfil, rol, sedes } = useApp()
  const p = usePermisos('consultas.escribir', 'consultas.firmar', 'expediente.ver')
  const { ejecutar, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const q = useQuery({ queryKey: ['clinico', 'consulta', id], queryFn: async () => { const r = await leer('consultas', { sedeCol: false, filtros: { id }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const c0 = q.data
  const pac = usePaciente(c0?.paciente_id)
  const sig = useQuery({ queryKey: ['clinico', 'signos', id], queryFn: async () => { const r = await leer('signos_vitales', { sedeCol: false, filtros: { consulta_id: id }, limite: 1 }); return r.data?.[0] ?? null } })
  const dx = useVista('dx-cierre-' + id, 'diagnosticos_consulta', { sedeCol: false, filtros: { consulta_id: id } })
  const tutor = useVista('tutor-' + c0?.paciente_id, 'tutores', { sedeCol: false, filtros: { paciente_id: c0?.paciente_id, vigente: true } }, { enabled: !!c0 })
  const consProc = useVista('cons-proc-' + c0?.paciente_id, 'consentimientos', { sedeCol: false, filtros: { paciente_id: c0?.paciente_id, tipo: 'procedimiento', estado: 'firmado' }, orden: { columna: 'fecha_hora', asc: false }, limite: 1 }, { enabled: !!c0 })
  const alerg = useVista('alerg-c-' + c0?.paciente_id, 'alergias_paciente', { sedeCol: false, filtros: { paciente_id: c0?.paciente_id, vigente: true } }, { enabled: !!c0 })
  const meds = useVista('meds-c-' + c0?.paciente_id, 'medicamentos_paciente', { sedeCol: false, filtros: { paciente_id: c0?.paciente_id, vigente: true } }, { enabled: !!c0 })
  const servicios = useVista('servicios-consulta', 'prp_servicios', { sedeCol: false, columnas: 'id,nombre', orden: { columna: 'nombre' }, limite: 300 })
  const planes = useVista('planes-c-' + c0?.paciente_id, 'prp_planes_progreso', { sedeCol: false, filtros: { paciente_id: c0?.paciente_id } }, { enabled: !!c0 })
  const indic = useVista('ind-print-' + id, 'indicaciones_consulta', { sedeCol: false, filtros: { consulta_id: id } })

  const [c, setC] = useState({})
  const [s, setS] = useState({})
  const [dirty, setDirty] = useState(false)
  const [guardado, setGuardado] = useState(null)
  const [firma, setFirma] = useState(null) // 'podologo' | 'paciente' | 'consentimiento'
  const [bloqueos, setBloqueos] = useState([])
  const [nota, setNota] = useState('')
  const [excepcion, setExcepcion] = useState(null)
  const [motivoExc, setMotivoExc] = useState('')
  const cargadoPara = useRef(null)

  useEffect(() => {
    if (!c0 || cargadoPara.current === c0.id + c0.updated_at) return
    if (cargadoPara.current?.startsWith(c0.id) && dirty) return
    cargadoPara.current = c0.id + c0.updated_at
    setC(Object.fromEntries(CAMPOS.map(k => [k, c0[k] ?? (k === 'cerrar_plan' ? false : '')])))
  }, [c0]) // eslint-disable-line
  useEffect(() => { if (sig.data) setS(Object.fromEntries(SIGNOS.map(([k]) => [k, sig.data[k] ?? '']))) }, [sig.data])

  const editable = !!c0 && consultaEditable(c0) && p['consultas.escribir'] && c0.podologo_id === perfil?.id
  const cambiar = (k, v) => { setC(x => ({ ...x, [k]: v })); setDirty(true) }
  const cambiarS = (k, v) => { setS(x => ({ ...x, [k]: v })); setDirty(true) }

  const guardar = async ({ silencioso } = {}) => {
    const cuerpo = Object.fromEntries(CAMPOS.map(k => { let v = c[k]; if (NUM.has(k)) v = num(v); else if (v === '') v = null; return [k, v] }))
    cuerpo.borrador_guardado_en = new Date().toISOString()
    const r = await ejecutar(async () => {
      const a = await actualizar('consultas', id, cuerpo)
      if (a.error) return a
      const hayS = Object.values(s).some(v => v !== '' && v !== null)
      if (hayS) {
        const sv = Object.fromEntries(SIGNOS.map(([k]) => [k, num(s[k])]))
        const b = await upsertPor('signos_vitales', { consulta_id: id, ...sv }, 'consulta_id')
        if (b.error) return b
      }
      return a
    }, { ok: silencioso ? null : 'Borrador guardado', invalidar: silencioso ? [] : ['clinico'] })
    if (r) { setDirty(false); setGuardado(new Date()); if (silencioso) cargadoPara.current = null }
    return !!r
  }
  // Autoguardado del borrador (3 s después del último cambio)
  const guardarRef = useRef(guardar); guardarRef.current = guardar
  useEffect(() => {
    if (!dirty || !editable) return
    const t = setTimeout(() => guardarRef.current({ silencioso: true }), 3000)
    return () => clearTimeout(t)
  }, [c, s, dirty, editable])

  const motivos = useMemo(() => (c0 ? motivosBloqueoCierre({
    consulta: { ...c0, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === '' ? null : v])) }, perfil, diagnosticos: dx.data?.filas ?? [],
    esMenor: !!pac.data?.es_menor, tutorVigente: (tutor.data?.filas ?? []).length > 0, avisoFirmado: pac.data?.aviso_privacidad_firmado ?? true, firmaVacia: false,
  }) : []), [c0, c, dx.data, pac.data, tutor.data, perfil])

  async function intentarCerrar() {
    if (dirty && !(await guardar({ silencioso: true }))) return
    if (motivos.length) { setBloqueos(motivos); return }
    setBloqueos([]); setFirma('podologo')
  }
  async function alFirmarPodologo(f) {
    const r = await ejecutar(() => rpc('firmar_consulta', { p_consulta: id, p_firma: f.id }), { ok: null, invalidar: ['clinico'] })
    if (!r) { setFirma(null); return }
    toast.success(`Nota firmada y cerrada${r.data ? ` · ${r.data}` : ''}`)
    // P-045: la BD pasa la cita a «Atendida» y la sesión del plan a «Realizada» al cerrar; si no puede, lo deja en bitácora
    setFirma(null)
  }
  async function alFirmarPaciente(f) {
    const r = await ejecutar(() => actualizar('consultas', id, { firma_paciente_id: f.id }), { ok: 'Recibo de indicaciones firmado', invalidar: ['clinico'] })
    if (r) setFirma(null)
  }
  async function alFirmarConsentimiento(f) {
    const r = await ejecutar(() => insertar('consentimientos', { paciente_id: c0.paciente_id, tipo: 'procedimiento', aceptado: true, firma_id: f.id, canal: 'recepcion_pantalla', consulta_id: id, dispositivo: navigator.userAgent.slice(0, 200), estado: 'firmado' }), { ok: 'Consentimiento del procedimiento firmado', invalidar: ['clinico'] })
    if (r) setFirma(null)
  }
  async function dejarPendiente() {
    if (dirty) await guardar({ silencioso: true })
    await ejecutar(() => actualizar('consultas', id, { estado: 'pendiente_firma' }), { ok: 'Consulta pendiente de firma', invalidar: ['clinico'] })
  }

  if (q.isLoading || (c0 && pac.isLoading)) return <div className="pagina"><LoadingSpinner /></div>
  if (q.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(q.error)}</Aviso><Volver a="/consultas" /></div>
  if (!c0) return <div className="pagina"><Aviso tipo="err">Consulta no encontrada o sin permiso para verla (Recepción no ve notas clínicas).</Aviso><Volver a="/consultas" /></div>

  const cerrada = c0.estado === 'cerrada'
  const lectura = !editable
  const snapshot = c0.antecedentes_snapshot
  const serv = (servicios.data?.filas ?? []).find(x => x.id === c0.servicio_id)
  const diabetico = ['tipo1', 'tipo2', 'prediabetes'].includes(pac.data?.diabetes) || snapshot?.diabetes === 'si'
  const campo = (k, label, extra = {}) => <FormField label={label} value={c[k] ?? ''} onChange={e => cambiar(k, e.target.value)} disabled={lectura} {...extra} />
  const sedeNombre = sedes.find(x => x.id === c0.sede_id)?.nombre ?? '—'
  const nombreP = [perfil?.nombre, perfil?.apellidos].filter(Boolean).join(' ')
  const sinAvisoSinExc = requiereExcepcionAviso(pac.data?.aviso_privacidad_firmado ?? true, c0)

  return (
    <div className="pagina">
      <PageHeader titulo={cerrada ? 'Consulta firmada' : 'Consulta'} subtitulo={`Consultas › ${c0.folio} · ${guardado ? `Borrador autoguardado ${hora(guardado)}` : c0.borrador_guardado_en ? `Último guardado ${hora(c0.borrador_guardado_en)}` : 'Borrador'}`}
        acciones={<Volver a="/consultas" />} />
      <CabeceraPaciente paciente={pac.data} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
        <StatusBadge estado={c0.estado} /> <span>{fechaHora(c0.fecha_hora)}</span><span>· {sedeNombre}</span><span>· {etiquetaDe(TIPOS_ATENCION, c0.tipo_atencion)}</span>
        {c0.tipo_atencion === 'a_distancia' && <span className="bd b">A distancia</span>}
        {c0.cita_id && <span className="bd n">Cita vinculada</span>}
      </div>

      {cerrada && (
        <Aviso tipo="ok" icono={Lock}>
          Nota firmada y bloqueada (P-001): solo admite nota aclaratoria con fecha, hora, autor y firma; la original siempre queda visible. Firmó {nombreP && c0.firmada_por === perfil?.id ? nombreP : 'el podólogo'}{c0.cedula_firmante ? ` · cédula ${c0.cedula_firmante}` : ''} · {fechaHora(c0.firmada_en)} · huella {c0.hash_contenido?.slice(0, 12)}…
        </Aviso>
      )}
      {!cerrada && !editable && <Aviso>Solo el podólogo que abrió la consulta la edita.</Aviso>}
      {!cerrada && sinAvisoSinExc && (
        <Aviso>Falta el aviso de privacidad firmado: se puede atender, pero la consulta no se cierra sin la excepción de Administración (P-004).
          {rol === 'administrador' && <> <button type="button" className="chip-quick" onClick={() => setExcepcion(true)}>Autorizar excepción</button></>}
          {rol === 'podologo' && <> <Link to={`/pacientes/${c0.paciente_id}`}>Ir a la ficha</Link></>}</Aviso>
      )}

      <Seccion titulo="Datos de la consulta y signos vitales">
        <div className="row">
          <FormField label="Servicio" as="select" options={(servicios.data?.filas ?? []).map(x => ({ value: x.id, label: x.nombre }))} value={c.servicio_id ?? ''} onChange={e => cambiar('servicio_id', e.target.value)} disabled={lectura} />
          <FormField label="Plan de tratamiento" as="select" options={(planes.data?.filas ?? []).map(x => ({ value: x.plan_id, label: `${x.nombre} (${x.sesiones_realizadas}/${x.sesiones_total})` }))} value={c.plan_id ?? ''} onChange={e => cambiar('plan_id', e.target.value)} disabled={lectura} placeholder="Ninguno" />
          {serv && lectura && <FormField label="Servicio" value={serv.nombre} readOnly />}
        </div>
        <div className="row">{SIGNOS.map(([k, label, step]) => <FormField key={k} label={label} type="number" step={step} value={s[k] ?? ''} onChange={e => cambiarS(k, e.target.value)} disabled={lectura} style={{ minWidth: 120 }} />)}</div>
        {sig.data?.imc != null && <div style={{ fontSize: 12, color: 'var(--muted)' }}>IMC calculado: {sig.data.imc}</div>}
        {campo('motivo_consulta', 'Motivo de consulta', { as: 'textarea', required: true })}
        {campo('padecimiento_actual', 'Padecimiento actual', { as: 'textarea', required: true })}
        {campo('sintomas', 'Síntomas', { as: 'textarea' })}
        {c0.tipo_atencion === 'a_distancia' && (<>
          {campo('limitaciones_distancia', 'Limitaciones por ser a distancia', { hint: 'p. ej. no hay exploración táctil/vascular' })}
          {campo('observacion_video', 'Observación por video y fotos', { as: 'textarea', required: true })}
        </>)}
      </Seccion>

      <Seccion titulo="Antecedentes (revisión rápida, se actualizan en la ficha)">
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          {snapshot ? (resumenAntecedentesTexto(snapshot) || 'Sin antecedentes relevantes capturados.') : 'Sin instantánea de antecedentes.'}
          <br /><b>Alergias:</b> {(alerg.data?.filas ?? []).map(a => a.sustancia).join('; ') || 'ninguna registrada'} · <b>Medicamentos:</b> {(meds.data?.filas ?? []).map(m => m.nombre_dosis).join('; ') || 'ninguno registrado'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Cada consulta guarda una instantánea de los antecedentes del momento (P-030). <Link to={`/pacientes/${c0.paciente_id}/historia`}>Editar en la historia clínica</Link></div>
      </Seccion>

      <Seccion titulo="Mapa del pie">
        <ConsultaHallazgos consultaId={id} editable={editable} />
        {editable && <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontSize: 13 }}>Adjuntar foto clínica a la zona</summary><SubirFotoClinica consulta={c0} /></details>}
      </Seccion>

      <Seccion titulo="Exploración"><ConsultaExploracion consultaId={id} pacienteId={c0.paciente_id} editable={editable} diabetico={diabetico && p['consultas.escribir']} /></Seccion>

      <Seccion titulo="Diagnóstico y procedimiento">
        <ConsultaDiagnostico consultaId={id} editable={editable} consentimientoProcedimiento={consProc.data?.filas?.[0]} onFirmarConsentimiento={() => setFirma('consentimiento')} />
        <div className="row" style={{ marginTop: 10 }}>
          <FormField label="Anestesia (general de la consulta)" as="select" options={ANESTESIA} value={c.anestesia ?? ''} onChange={e => cambiar('anestesia', e.target.value)} disabled={lectura} />
          {campo('descripcion_procedimiento', 'Descripción del procedimiento', { as: 'textarea' })}
        </div>
      </Seccion>

      <Seccion titulo="Productos y material usado"><ConsultaProductos consulta={c0} editable={editable} /></Seccion>

      <Seccion titulo="Nota de evolución, próxima cita y firma">
        {campo('nota_evolucion', 'Nota de evolución (NOM-004: evolución, hallazgos, diagnóstico, pronóstico, tratamiento)', { as: 'textarea', required: true, rows: 5 })}
        {c0.nota_origen === 'dictado_ia' && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Texto originado por dictado y revisado por el podólogo.</div>}
        {campo('tratamiento_texto', 'Tratamiento (lo que adquirió, para la hoja de seguimiento)', { as: 'textarea' })}
        {campo('observaciones_seguimiento', 'Observaciones (columna «Observaciones» de la hoja de seguimiento)', { as: 'textarea' })}
        <div className="row">
          <FormField label="Pronóstico" required as="select" options={PRONOSTICOS} value={c.pronostico ?? ''} onChange={e => cambiar('pronostico', e.target.value)} disabled={lectura} />
          <FormField label="Próxima visita" type="date" value={c.proxima_visita ?? ''} onChange={e => cambiar('proxima_visita', e.target.value)} disabled={lectura} />
          <FormField label="Tipo de próxima cita" value={c.proxima_cita_tipo ?? ''} onChange={e => cambiar('proxima_cita_tipo', e.target.value)} disabled={lectura} placeholder="Revisión de pie diabético…" />
          <FormField label="En (días)" type="number" min="0" max="730" value={c.proxima_cita_plazo_dias ?? ''} onChange={e => cambiar('proxima_cita_plazo_dias', e.target.value)} disabled={lectura} style={{ maxWidth: 110 }} />
          <label style={{ alignSelf: 'flex-end', fontSize: 13, paddingBottom: 8 }}><input type="checkbox" checked={!!c.cerrar_plan} onChange={e => cambiar('cerrar_plan', e.target.checked)} disabled={lectura} /> Cerrar plan de tratamiento (concluido)</label>
        </div>

        {bloqueos.length > 0 && <Aviso tipo="err"><b>No se puede cerrar todavía:</b><ul style={{ margin: '4px 0 0 18px' }}>{bloqueos.map(b => <li key={b}>{b}</li>)}</ul></Aviso>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {editable && <button type="button" className="btn o" disabled={ocupado} onClick={() => guardar()}><Save size={14} style={{ verticalAlign: -3 }} /> Guardar borrador</button>}
          {editable && <Link to={`/consultas/${id}/dictado`} className="btn o" style={{ textDecoration: 'none' }} onClick={() => dirty && guardar({ silencioso: true })}><Mic size={14} style={{ verticalAlign: -3 }} /> Dictar nota por voz</Link>}
          {c0.tipo_atencion === 'a_distancia' && c0.cita_id && <Link to={`/videoconsulta/${c0.cita_id}`} className="btn o" style={{ textDecoration: 'none' }}>Abrir sala de videoconsulta</Link>}
          <ImprimirHoja titulo={`Indicaciones · ${pac.data?.nombre_completo ?? ''}`} entidad="consultas" entidadId={id} etiqueta="Imprimir indicaciones" sedeId={c0.sede_id}>
            <p><b>Paciente:</b> {pac.data?.nombre_completo} · Expediente {pac.data?.numero_expediente} · {c0.folio}</p>
            {(indic.data?.filas ?? []).length === 0 ? <p>Sin indicaciones registradas.</p> : <ul>{indic.data.filas.map(i => <li key={i.id}>{i.tipo === 'medicamento' ? `${i.medicamento} ${[i.dosis, i.via, i.frecuencia, i.duracion].filter(Boolean).join(' · ')}` : i.indicacion}</li>)}</ul>}
            <p style={{ marginTop: 24 }}>{c0.proxima_visita ? `Próxima visita: ${c0.proxima_visita}` : ''}</p>
          </ImprimirHoja>
          {editable && <button type="button" className="btn o" onClick={() => setFirma('paciente')}><PenLine size={14} style={{ verticalAlign: -3 }} /> {c0.firma_paciente_id ? 'Recibo del paciente firmado ✓' : 'Firma del paciente (recibo de indicaciones)'}</button>}
          {editable && c0.estado === 'borrador' && <button type="button" className="btn o" onClick={dejarPendiente}>Dejar pendiente de firma</button>}
          {c0.cita_id && <Link to={`/caja?cita=${c0.cita_id}`} className="btn o" style={{ textDecoration: 'none' }}><Send size={14} style={{ verticalAlign: -3 }} /> Enviar a caja</Link>}
          {editable && p['consultas.firmar'] && <button type="button" className="btn green" disabled={ocupado} onClick={intentarCerrar}>Cerrar y firmar consulta</button>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Cobra siempre Caja (P-078): el podólogo solo envía el servicio y los productos marcados «Cobrar».</div>
      </Seccion>

      {cerrada && <NotasAclaratorias consulta={c0} perfil={perfil} puede={puedeAgregarNotaAclaratoria(perfil, c0)} nota={nota} setNota={setNota} onFirmar={() => { const e = validarNotaAclaratoria(nota); if (e) toast.error(e); else setFirma('aclaratoria') }} />}

      {firma === 'podologo' && (
        <FirmaDialogo open titulo="Firma del podólogo" textoConfirmar="Firmar y cerrar" firmante={{ tipo: 'podologo', usuarioId: perfil.id, nombre: nombreP, cedula: perfil.cedula }}
          documento={{ tipo: 'consulta', id, version: c0.folio }} onClose={() => setFirma(null)} onFirmada={alFirmarPodologo}>
          <Aviso>Al firmar, la nota queda <b>bloqueada</b>: solo podrá agregarse una nota aclaratoria. Firma con tu cédula {perfil.cedula}.</Aviso>
        </FirmaDialogo>)}
      {firma === 'paciente' && <FirmaDialogo open titulo="Firma del paciente · recibo de indicaciones" firmante={{ tipo: 'paciente', pacienteId: c0.paciente_id, nombre: pac.data?.nombre_completo }} canal="recepcion_pantalla" documento={{ tipo: 'recibo_indicaciones', id }} onClose={() => setFirma(null)} onFirmada={alFirmarPaciente} />}
      {firma === 'consentimiento' && <FirmaDialogo open titulo="Consentimiento informado del procedimiento" firmante={{ tipo: 'paciente', pacienteId: c0.paciente_id, nombre: pac.data?.nombre_completo }} canal="recepcion_pantalla" documento={{ tipo: 'consentimiento_procedimiento', id: c0.paciente_id }} onClose={() => setFirma(null)} onFirmada={alFirmarConsentimiento} />}
      {firma === 'aclaratoria' && (
        <FirmaDialogo open titulo="Firma de la nota aclaratoria" firmante={{ tipo: 'podologo', usuarioId: perfil.id, nombre: nombreP, cedula: perfil.cedula }} documento={{ tipo: 'nota_aclaratoria', id, hash: null }} onClose={() => setFirma(null)}
          onFirmada={async f => {
            const r = await ejecutar(() => insertar('notas_aclaratorias', { consulta_id: id, texto: nota.trim(), autor_id: perfil.id, firma_id: f.id }), { ok: 'Nota aclaratoria agregada', invalidar: ['clinico'] })
            if (r) { setNota(''); setFirma(null) }
          }}><p style={{ fontSize: 13 }}>«{nota}»</p></FirmaDialogo>)}
      <Modal open={!!excepcion} onClose={() => setExcepcion(null)} title="Autorizar excepción de aviso de privacidad" size="sm"
        footer={<><button type="button" className="btn o" onClick={() => setExcepcion(null)}>Cancelar</button><button type="button" className="btn" disabled={motivoExc.trim().length < 5 || ocupado} onClick={async () => { if (await ejecutar(() => rpc('autorizar_excepcion_aviso', { p_consulta: id, p_motivo: motivoExc.trim() }), { ok: 'Excepción autorizada (queda en bitácora)', invalidar: ['clinico'] })) setExcepcion(null) }}>Autorizar</button></>}>
        <FormField label="Motivo (queda en bitácora)" as="textarea" value={motivoExc} onChange={e => setMotivoExc(e.target.value)} />
      </Modal>
      {dialogo}
    </div>
  )
}

function NotasAclaratorias({ consulta, puede, nota, setNota, onFirmar }) {
  const q = useVista('na-lista-' + consulta.id, 'notas_aclaratorias', { sedeCol: false, filtros: { consulta_id: consulta.id }, orden: { columna: 'fecha_hora' } })
  return (
    <Seccion titulo="Notas aclaratorias (NOM-004)">
      {(q.data?.filas ?? []).map(n => <div key={n.id} className="card" style={{ background: 'var(--bd-a-bg)', marginBottom: 8 }}><b>{fechaHora(n.fecha_hora)}</b> · firma {n.firma_id?.slice(0, 8)} · huella {n.hash_contenido?.slice(0, 10)}…<div>{n.texto}</div></div>)}
      {!(q.data?.filas ?? []).length && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sin notas aclaratorias. La nota original no se modifica.</div>}
      {puede && (<>
        <FormField label="Nueva nota aclaratoria" as="textarea" value={nota} onChange={e => setNota(e.target.value)} hint="Mínimo 5 caracteres; se firma y queda con fecha, hora y autor." />
        <button type="button" className="btn sm" onClick={onFirmar}>Firmar y agregar nota aclaratoria</button></>)}
    </Seccion>
  )
}
