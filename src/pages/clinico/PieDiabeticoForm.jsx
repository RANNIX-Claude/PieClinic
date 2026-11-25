import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, insertar, actualizar } from '../../lib/api'
import { upsertVarios, borrarPor } from '../../lib/clinico/db'
import { hoyISO, fecha } from '../../lib/formato'
import { puntajeSinbad, sugerirSinbad, DESCRIPCION_SINBAD, resumenMonofilamento, sensibilidadProtectoraSugerida, normalizarItb, lecturaItb, FRECUENCIAS_REVISION, FRECUENCIA_POR_RIESGO, proximaRevision, sugerirRiesgo, SITIOS_MONOFILAMENTO, PROFUNDIDADES } from '../../lib/clinico/sinbad'
import { zonasDeVista, nombreZona, regionDeZona } from '../../lib/clinico/mapaPie'
import { DIABETES_TIPO } from '../../lib/clinico/catalogos'
import { registroFirmadoBloqueado } from '../../lib/clinico/inmutabilidad'
import { Aviso, Seccion, Chips, TriEstado, PacienteBuscador, usePaciente, useAccion, Volver, num, mensajeError, sedeDeRegistro, CabeceraPaciente, useVista } from './componentes/comunes'
import FirmaDialogo from './componentes/FirmaDialogo'

const PULSO = ['presente', 'disminuido', 'ausente', 'no_evaluado'].map(v => ({ value: v, label: v.replace('_', ' ') }))
const DIAP = ['presente', 'disminuida', 'ausente', 'no_evaluado'].map(v => ({ value: v, label: v.replace('_', ' ') }))
const SINTOMAS = [['hormigueo', 'Hormigueo'], ['ardor', 'Ardor'], ['calambres', 'Calambres'], ['dolor_reposo', 'Dolor en reposo'], ['claudicacion', 'Claudicación'], ['perdida_sensibilidad', 'Pérdida de sensibilidad']].map(([value, label]) => ({ value, label }))
const DEFORM = [['hallux_valgus', 'Hallux valgus'], ['garra', 'Dedos en garra'], ['charcot', 'Pie de Charcot'], ['callosidad', 'Callosidad'], ['fisura', 'Fisura'], ['maceracion', 'Maceración interdigital'], ['onicomicosis', 'Onicomicosis']].map(([value, label]) => ({ value, label }))
const sel = o => o.map(x => (typeof x === 'string' ? { value: x, label: x } : x))
const NUM = ['anios_evolucion', 'hba1c', 'llenado_capilar_izq_s', 'llenado_capilar_der_s', 'itb_izq', 'itb_der', 'wagner', 'perfusion_wifi', 'riesgo_confirmado']
const BOOL = ['ulcera_previa', 'amputacion_previa', 'tabaquismo', 'recordatorio_paciente', 'alerta_si_vence', 'generar_carta_referencia', 'indicar_calzado_plantilla']
const CAMPOS = ['diabetes_tipo', 'anios_evolucion', 'hba1c', 'hba1c_fecha', 'tratamiento_diabetes', 'medico_tratante', 'sintomas', 'diapason_izq', 'diapason_der', 'reflejo_aquileo_izq', 'reflejo_aquileo_der', 'sensibilidad_termica', 'sensibilidad_protectora',
  'pulso_pedio_izq', 'pulso_pedio_der', 'pulso_tibial_izq', 'pulso_tibial_der', 'llenado_capilar_izq_s', 'llenado_capilar_der_s', 'temperatura_piel', 'coloracion', 'edema', 'piel_atrofica_sin_vello', 'itb_izq', 'itb_der', 'deformidades',
  'wagner', 'infeccion_idsa', 'perfusion_wifi', 'riesgo_confirmado', 'frecuencia_revision', 'proxima_revision', 'educacion_plan', ...BOOL]
const VACIO = Object.fromEntries(CAMPOS.map(k => [k, k === 'sintomas' || k === 'deformidades' ? [] : BOOL.includes(k) ? (k === 'recordatorio_paciente' || k === 'alerta_si_vence') : '']))

export default function PieDiabeticoForm() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { perfil, organizacion, sedes, sedeActivaId } = useApp()
  const puede = usePermiso('consultas.escribir')
  const { ejecutar, ocupado } = useAccion()
  const [paciente, setPaciente] = useState(null)
  const val = useQuery({ queryKey: ['clinico', 'valoracion-pd', id], enabled: !!id, queryFn: async () => { const r = await leer('valoraciones_pie_diabetico', { sedeCol: false, filtros: { id }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const pidParam = id ? val.data?.paciente_id : sp.get('paciente')
  const pacQ = usePaciente(pidParam)
  useEffect(() => { if (pacQ.data) setPaciente(pacQ.data) }, [pacQ.data])
  const [v, setV] = useState(VACIO)
  const [fechaV, setFechaV] = useState(hoyISO())
  const [mono, setMono] = useState({})            // `${pie}|${sitio}` → true | false
  const [ulceras, setUlceras] = useState([])
  const [firmando, setFirmando] = useState(false)
  const monoQ = useQuery({ queryKey: ['clinico', 'mono', id], enabled: !!id, queryFn: async () => { const r = await leer('monofilamento_sitios', { sedeCol: false, filtros: { valoracion_id: id } }); return r.data ?? [] } })
  const ulcQ = useQuery({ queryKey: ['clinico', 'ulceras', id], enabled: !!id, queryFn: async () => { const r = await leer('ulceras_pie', { sedeCol: false, filtros: { valoracion_id: id } }); return r.data ?? [] } })
  const antQ = useVista('ant-pd-' + paciente?.id, 'antecedentes_paciente', { sedeCol: false, filtros: { paciente_id: paciente?.id }, limite: 1 }, { enabled: !!paciente && !id })

  useEffect(() => {
    if (!val.data) return
    setV(Object.fromEntries(CAMPOS.map(k => [k, val.data[k] ?? (Array.isArray(VACIO[k]) ? [] : BOOL.includes(k) ? false : '')]))); setFechaV(val.data.fecha)
  }, [val.data])
  useEffect(() => { if (monoQ.data) setMono(Object.fromEntries(monoQ.data.map(m => [`${m.pie}|${m.sitio}`, m.siente]))) }, [monoQ.data])
  useEffect(() => { if (ulcQ.data) setUlceras(ulcQ.data.map(u => ({ ...u, area_cm2: String(u.area_cm2) }))) }, [ulcQ.data])
  // Precarga desde antecedentes (solo valoración nueva)
  useEffect(() => {
    const a = antQ.data?.filas?.[0]
    if (!a || id) return
    setV(s => ({ ...s, diabetes_tipo: s.diabetes_tipo || a.diabetes_tipo || '', anios_evolucion: s.anios_evolucion || (a.diabetes_anios_evolucion ?? ''), hba1c: s.hba1c || (a.hba1c ?? ''), hba1c_fecha: s.hba1c_fecha || a.hba1c_fecha || '',
      tratamiento_diabetes: s.tratamiento_diabetes || a.diabetes_tratamiento || '', medico_tratante: s.medico_tratante || a.medico_tratante || '', ulcera_previa: s.ulcera_previa || a.ulcera_previa === 'si', amputacion_previa: s.amputacion_previa || a.amputacion_previa === 'si' }))
  }, [antQ.data]) // eslint-disable-line

  const firmada = registroFirmadoBloqueado(val.data?.estado)
  const editable = puede && !firmada
  const set = k => e => setV(s => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const campo = (k, label, extra = {}) => <FormField label={label} value={v[k] ?? ''} onChange={set(k)} disabled={!editable} {...extra} />
  const select = (k, label, options, extra = {}) => <FormField label={label} as="select" options={options} value={v[k] ?? ''} onChange={set(k)} disabled={!editable} {...extra} />

  const sitiosArr = Object.entries(mono).map(([k, siente]) => ({ pie: k.split('|')[0], sitio: k.split('|')[1], siente }))
  const rm = resumenMonofilamento(sitiosArr)
  const sugeridaProt = sensibilidadProtectoraSugerida(sitiosArr)
  const itbI = normalizarItb(v.itb_izq), itbD = normalizarItb(v.itb_der)
  const criteriosActivos = !!organizacion?.parametros?.pie_diabetico_criterios_activos
  const pulsos = [v.pulso_pedio_izq, v.pulso_pedio_der, v.pulso_tibial_izq, v.pulso_tibial_der]
  const riesgoSug = sugerirRiesgo({ lops: v.sensibilidad_protectora === 'ausente', eap: pulsos.some(p => p === 'ausente') || (itbI !== null && itbI < 0.9) || (itbD !== null && itbD < 0.9), deformidad: v.deformidades.some(d => ['garra', 'charcot', 'hallux_valgus'].includes(d)), ulceraPrevia: v.ulcera_previa, amputacionPrevia: v.amputacion_previa }, { activo: criteriosActivos })

  const nuevaUlcera = () => setUlceras(u => [...u, { _n: crypto.randomUUID(), pie: 'D', zona_codigo: 'antepie_plantar', localizacion_texto: '', area_cm2: '', profundidad: 'piel', s: 0, i: 0, n: 0, b: 0, a: 0, d: 0 }])
  const cambiarU = (i, cambios) => setUlceras(u => u.map((x, j) => (j === i ? { ...x, ...cambios } : x)))
  const sugerirU = i => {
    const x = ulceras[i]
    cambiarU(i, sugerirSinbad({ region: regionDeZona(x.zona_codigo), pulsosPedales: pulsos, sensibilidadProtectora: v.sensibilidad_protectora, infeccion: v.infeccion_idsa, areaCm2: num(x.area_cm2), profundidad: x.profundidad }))
  }
  const todasZonas = useMemo(() => [...new Map([...zonasDeVista('plantar'), ...zonasDeVista('dorsal')].map(z => [z.codigo, z])).values()].filter(z => !/^una|^dedo/.test(z.codigo) || true), [])

  async function guardar(devolverId) {
    const cuerpo = Object.fromEntries(CAMPOS.map(k => {
      let x = v[k]
      if (NUM.includes(k)) x = k === 'itb_izq' ? itbI : k === 'itb_der' ? itbD : num(x)
      else if (!Array.isArray(x) && typeof x !== 'boolean' && x === '') x = null
      return [k, x]
    }))
    if (cuerpo.hba1c !== null && !cuerpo.hba1c_fecha) { toast.error('Si capturas HbA1c indica su fecha.'); return null }
    if (!cuerpo.diabetes_tipo || cuerpo.anios_evolucion === null) { toast.error('Tipo de diabetes y años de evolución son obligatorios.'); return null }
    if (riesgoSug !== null) cuerpo.riesgo_sugerido = riesgoSug
    const r = await ejecutar(async () => {
      let vid = id
      if (id) { const u = await actualizar('valoraciones_pie_diabetico', id, cuerpo); if (u.error) return u }
      else {
        const c = await insertar('valoraciones_pie_diabetico', { paciente_id: paciente.id, consulta_id: sp.get('consulta') || null, sede_id: sedeDeRegistro(sedeActivaId, paciente, sedes), podologo_id: perfil.id, fecha: fechaV, ...cuerpo })
        if (c.error) return c
        vid = c.data[0].id
      }
      const filasMono = Object.entries(mono).map(([k, siente]) => ({ valoracion_id: vid, pie: k.split('|')[0], sitio: k.split('|')[1], siente }))
      if (filasMono.length) { const m = await upsertVarios('monofilamento_sitios', filasMono, 'valoracion_id,pie,sitio'); if (m.error) return m }
      if (id) await borrarPor('ulceras_pie', 'valoracion_id', vid)
      const filasU = ulceras.filter(u => u.area_cm2 !== '').map(u => ({ valoracion_id: vid, pie: u.pie, zona_codigo: u.zona_codigo, localizacion_texto: u.localizacion_texto || null, area_cm2: num(u.area_cm2), profundidad: u.profundidad, s: u.s, i: u.i, n: u.n, b: u.b, a: u.a, d: u.d }))
      if (filasU.length) { const x = await insertar('ulceras_pie', filasU); if (x.error) return x }
      return { data: vid }
    }, { ok: 'Valoración guardada (borrador)', invalidar: ['clinico'] })
    if (!r) return null
    if (!id && !devolverId) nav(`/pie-diabetico/${r.data}`, { replace: true })
    return r.data
  }
  async function firmar(f) {
    const vid = id
    const r = await ejecutar(() => actualizar('valoraciones_pie_diabetico', vid, { estado: 'firmada', firma_id: f.id }), { ok: 'Valoración firmada', invalidar: ['clinico'] })
    if (r) setFirmando(false)
  }
  async function iniciarFirma() {
    if (!v.sensibilidad_protectora || !v.frecuencia_revision || !v.proxima_revision) { toast.error('Para firmar captura sensibilidad protectora, frecuencia y próxima revisión.'); return }
    const vid = await guardar(true)
    if (vid) { if (!id) nav(`/pie-diabetico/${vid}?firmar=1`, { replace: true }); else setFirmando(true) }
  }
  useEffect(() => { if (sp.get('firmar') && val.data && editable) setFirmando(true) }, [val.data]) // eslint-disable-line

  if (!puede && !id) return <div className="pagina"><Aviso tipo="err">Solo el podólogo captura valoraciones.</Aviso><Volver a="/pie-diabetico" /></div>
  if (id && (val.isLoading || monoQ.isLoading)) return <div className="pagina"><LoadingSpinner /></div>
  if (val.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(val.error)}</Aviso></div>
  if (id && !val.data) return <div className="pagina"><Aviso tipo="err">Valoración no encontrada.</Aviso><Volver a="/pie-diabetico" /></div>
  const nombreP = [perfil?.nombre, perfil?.apellidos].filter(Boolean).join(' ')
  const maxSinbad = Math.max(0, ...ulceras.map(u => puntajeSinbad(u)))

  return (
    <div className="pagina">
      <PageHeader titulo="Valoración de pie diabético" subtitulo={`Consultas › Evaluar pie diabético${paciente ? ' · ' + paciente.nombre_completo : ''} · ${fecha(fechaV)}`} acciones={<Volver a="/pie-diabetico" />} />
      <Aviso>Las escalas son apoyo a la decisión clínica; no sustituyen el criterio del podólogo ni emiten diagnóstico (P-010).</Aviso>
      {firmada && <Aviso tipo="ok">Valoración firmada el {fecha(val.data.firmada_en)}: no se modifica; registra una nueva valoración para actualizarla.</Aviso>}
      {!id && <PacienteBuscador seleccionado={paciente} onElegir={setPaciente} />}
      <CabeceraPaciente paciente={paciente} />

      <Seccion titulo="Datos de diabetes y del paciente">
        <div className="row">
          {select('diabetes_tipo', 'Tipo de diabetes', DIABETES_TIPO, { required: true })}{campo('anios_evolucion', 'Años de evolución', { type: 'number', min: 0, max: 90, required: true })}
          {campo('hba1c', 'HbA1c (%)', { type: 'number', step: '0.1' })}{campo('hba1c_fecha', 'Fecha de HbA1c', { type: 'date' })}{campo('tratamiento_diabetes', 'Tratamiento')}{campo('medico_tratante', 'Médico tratante')}
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, margin: '6px 0' }}>
          {[['ulcera_previa', 'Úlcera previa'], ['amputacion_previa', 'Amputación previa'], ['tabaquismo', 'Tabaquismo']].map(([k, l]) => <label key={k}><input type="checkbox" disabled={!editable} checked={!!v[k]} onChange={e => setV(s => ({ ...s, [k]: e.target.checked }))} /> {l}</label>)}
        </div>
        <div className="field"><label>Síntomas referidos</label><Chips options={SINTOMAS} value={v.sintomas} onChange={x => setV(s => ({ ...s, sintomas: x }))} disabled={!editable} /></div>
      </Seccion>

      <Seccion titulo="Neurológica — monofilamento 10 g" ayuda="Marca «Siente» / «No siente» en cada sitio plantar. Resultado por pie: sitios sin sensibilidad de los evaluados.">
        <table>
          <thead><tr><th>Sitio plantar</th><th>Pie izquierdo</th><th>Pie derecho</th></tr></thead>
          <tbody>
            {SITIOS_MONOFILAMENTO.map(s => (
              <tr key={s.value}><td>{s.label}</td>
                {['I', 'D'].map(pie => <td key={pie}><TriEstado disabled={!editable} opciones={[['si', 'Siente'], ['no', 'No siente']]} value={mono[`${pie}|${s.value}`] === undefined ? null : mono[`${pie}|${s.value}`] ? 'si' : 'no'}
                  onChange={x => setMono(m => { const n = { ...m }; if (x === null) delete n[`${pie}|${s.value}`]; else n[`${pie}|${s.value}`] = x === 'si'; return n })} /></td>)}</tr>))}
            <tr><td><b>Resultado</b></td><td><b>{rm.I.sinSensibilidad} de {rm.I.evaluados || 10}</b> sitios sin sensibilidad</td><td><b>{rm.D.sinSensibilidad} de {rm.D.evaluados || 10}</b> sitios sin sensibilidad</td></tr>
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 8 }}>
          {select('diapason_izq', 'Diapasón 128 Hz izq.', DIAP)}{select('diapason_der', 'Diapasón 128 Hz der.', DIAP)}
          {select('reflejo_aquileo_izq', 'Reflejo aquíleo izq.', sel(['presente', 'disminuido', 'ausente', 'no_evaluado']))}{select('reflejo_aquileo_der', 'Reflejo aquíleo der.', sel(['presente', 'disminuido', 'ausente', 'no_evaluado']))}
          {select('sensibilidad_termica', 'Sensibilidad térmica', sel(['normal', 'disminuida', 'ausente', 'no_evaluado']))}
          {select('sensibilidad_protectora', 'Sensibilidad protectora', [{ value: 'intacta', label: 'Intacta' }, { value: 'ausente', label: 'Ausente' }], { required: true, hint: sugeridaProt ? `Sugerida por el monofilamento: ${sugeridaProt}` : undefined })}
        </div>
      </Seccion>

      <Seccion titulo="Vascular">
        <div className="row">
          {select('pulso_pedio_izq', 'Pulso pedio izq.', PULSO)}{select('pulso_pedio_der', 'Pulso pedio der.', PULSO)}{select('pulso_tibial_izq', 'Pulso tibial posterior izq.', PULSO)}{select('pulso_tibial_der', 'Pulso tibial posterior der.', PULSO)}
        </div>
        <div className="row">
          {campo('llenado_capilar_izq_s', 'Llenado capilar izq. (s)', { type: 'number', step: '0.5', min: 0 })}{campo('llenado_capilar_der_s', 'Llenado capilar der. (s)', { type: 'number', step: '0.5', min: 0 })}
          {select('temperatura_piel', 'Temperatura', sel(['normal', 'fria', 'caliente']))}{select('coloracion', 'Coloración', sel(['normal', 'palida', 'cianotica', 'eritematosa', 'rubor_dependiente']))}{select('edema', 'Edema', sel(['no', 'leve', 'moderado', 'severo']))}
          <div className="field"><label>Vello / piel atrófica</label><TriEstado disabled={!editable} opciones={[['si', 'Sí'], ['no', 'No']]} value={v.piel_atrofica_sin_vello === '' || v.piel_atrofica_sin_vello === null ? null : v.piel_atrofica_sin_vello ? 'si' : 'no'} onChange={x => setV(s => ({ ...s, piel_atrofica_sin_vello: x === null ? '' : x === 'si' }))} /></div>
        </div>
        <div className="row">
          {campo('itb_izq', 'ITB izq.', { type: 'number', step: '0.01', min: 0, hint: lecturaItb(v.itb_izq) })}{campo('itb_der', 'ITB der.', { type: 'number', step: '0.01', min: 0, hint: lecturaItb(v.itb_der) })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>El ITB es opcional: sin equipo Doppler queda «no evaluado» (nunca 0, P-011).</div>
      </Seccion>

      <Seccion titulo="Deformidades y piel"><Chips options={DEFORM} value={v.deformidades} onChange={x => setV(s => ({ ...s, deformidades: x }))} disabled={!editable} /></Seccion>

      <Seccion titulo="Úlcera activa (solo si existe) — clasificación SINBAD" acciones={editable && <button type="button" className="btn o sm" onClick={nuevaUlcera}>+ Agregar úlcera</button>}>
        {ulceras.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Sin úlceras registradas.</div>}
        {ulceras.map((u, i) => (
          <div key={u.id ?? u._n} className="card" style={{ background: 'var(--accent-light)', marginBottom: 10 }}>
            <div className="row">
              <FormField label="Pie" as="select" disabled={!editable} options={[{ value: 'D', label: 'Derecho' }, { value: 'I', label: 'Izquierdo' }]} value={u.pie} onChange={e => cambiarU(i, { pie: e.target.value })} />
              <FormField label="Zona" as="select" disabled={!editable} options={todasZonas.map(z => ({ value: z.codigo, label: z.nombre }))} value={u.zona_codigo} onChange={e => cambiarU(i, { zona_codigo: e.target.value })} />
              <FormField label="Localización (texto)" disabled={!editable} value={u.localizacion_texto ?? ''} onChange={e => cambiarU(i, { localizacion_texto: e.target.value })} />
              <FormField label="Área (cm²)" type="number" step="0.1" min="0" disabled={!editable} value={u.area_cm2} onChange={e => cambiarU(i, { area_cm2: e.target.value })} />
              <FormField label="Profundidad" as="select" disabled={!editable} options={PROFUNDIDADES} value={u.profundidad} onChange={e => cambiarU(i, { profundidad: e.target.value })} />
            </div>
            <table><thead><tr><th>Ítem SINBAD</th><th>Valor</th></tr></thead>
              <tbody>{['s', 'i', 'n', 'b', 'a', 'd'].map(k => <tr key={k}><td>{DESCRIPCION_SINBAD[k]}</td><td><select disabled={!editable} value={u[k]} onChange={e => cambiarU(i, { [k]: Number(e.target.value) })}><option value={0}>0</option><option value={1}>1</option></select></td></tr>)}
                <tr><td><b>Puntaje SINBAD</b></td><td><b>{puntajeSinbad(u)} / 6</b></td></tr></tbody></table>
            {editable && <div style={{ marginTop: 6, display: 'flex', gap: 8 }}><button type="button" className="btn o sm" onClick={() => sugerirU(i)}>Proponer ítems con lo capturado</button><button type="button" className="btn red sm" onClick={() => setUlceras(us => us.filter((_, j) => j !== i))}>Quitar</button></div>}
          </div>))}
        <div className="row">
          {campo('wagner', 'Wagner (opcional)', { as: 'select', options: [0, 1, 2, 3, 4, 5].map(n => ({ value: n, label: `Grado ${n}` })) })}
          {select('infeccion_idsa', 'Infección (IDSA/IWGDF)', [{ value: 'sin_infeccion', label: 'Sin infección' }, { value: 'leve', label: 'Leve' }, { value: 'moderada', label: 'Moderada' }, { value: 'grave', label: 'Grave' }])}
          {campo('perfusion_wifi', 'Perfusión (WIfI, opcional)', { as: 'select', options: [0, 1, 2, 3].map(n => ({ value: n, label: String(n) })) })}
        </div>
      </Seccion>

      <Seccion titulo="Categoría de riesgo y seguimiento">
        {criteriosActivos
          ? <Aviso tipo="sim">Categoría sugerida: <b>{riesgoSug}</b> (IWGDF, editable). El podólogo confirma.{maxSinbad ? ` SINBAD máximo: ${maxSinbad}/6.` : ''}</Aviso>
          : <Aviso>La sugerencia automática de categoría y frecuencia está apagada hasta que un podólogo asesor valide los criterios (parámetro de la clínica). Captura la categoría manualmente.</Aviso>}
        <div className="row">
          {select('riesgo_confirmado', 'Categoría de riesgo confirmada', [0, 1, 2, 3].map(n => ({ value: n, label: `Categoría ${n}` })), { onChange: e => { const n = e.target.value; setV(s => ({ ...s, riesgo_confirmado: n, ...(criteriosActivos && n !== '' && !s.frecuencia_revision ? { frecuencia_revision: FRECUENCIA_POR_RIESGO[n], proxima_revision: proximaRevision(fechaV, FRECUENCIA_POR_RIESGO[n]) } : {}) })) } })}
          {select('frecuencia_revision', 'Frecuencia de revisión', FRECUENCIAS_REVISION.map(f => ({ value: f.value, label: f.label })), { required: true, onChange: e => setV(s => ({ ...s, frecuencia_revision: e.target.value, proxima_revision: proximaRevision(fechaV, e.target.value) ?? s.proxima_revision })) })}
          {campo('proxima_revision', 'Próxima revisión', { type: 'date', required: true })}
        </div>
        <div style={{ display: 'grid', gap: 4, fontSize: 13, margin: '6px 0' }}>
          {[['recordatorio_paciente', 'Recordatorio automático al paciente'], ['alerta_si_vence', 'Alerta en expediente si la revisión se vence'], ['generar_carta_referencia', 'Generar carta de referencia a angiología/endocrinología'], ['indicar_calzado_plantilla', 'Indicar calzado terapéutico / plantilla ortopédica']]
            .map(([k, l]) => <label key={k}><input type="checkbox" disabled={!editable} checked={!!v[k]} onChange={e => setV(s => ({ ...s, [k]: e.target.checked }))} /> {l}</label>)}
        </div>
        {campo('educacion_plan', 'Educación al paciente y plan', { as: 'textarea' })}
      </Seccion>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 30 }}>
        {editable && <button type="button" className="btn o" disabled={ocupado || !paciente} onClick={() => guardar(false)}>Guardar valoración</button>}
        {id && (
          <ImprimirHoja titulo={`Referencia · valoración de pie diabético`} entidad="valoraciones_pie_diabetico" entidadId={id} etiqueta="Imprimir referencia">
            <p><b>Paciente:</b> {paciente?.nombre_completo} · {paciente?.numero_expediente}</p>
            <p>Diabetes {v.diabetes_tipo}, {v.anios_evolucion} años de evolución. Sensibilidad protectora: {v.sensibilidad_protectora}. ITB izq. {itbI ?? 'no evaluado'} / der. {itbD ?? 'no evaluado'}.</p>
            <p>Monofilamento: izq. {rm.I.sinSensibilidad}/{rm.I.evaluados} sitios sin sensibilidad · der. {rm.D.sinSensibilidad}/{rm.D.evaluados}. Próxima revisión: {fecha(v.proxima_revision)}.</p>
            <p>{v.educacion_plan}</p>{ulceras.map((u, i) => <p key={i}>Úlcera {u.pie} · {nombreZona(u.zona_codigo)} · {u.area_cm2} cm² · SINBAD {puntajeSinbad(u)}/6</p>)}
            <p>Apoyo a la decisión clínica; no constituye diagnóstico. {nombreP}{perfil?.cedula ? ` · céd. ${perfil.cedula}` : ''}</p>
          </ImprimirHoja>)}
        {editable && <button type="button" className="btn green" disabled={ocupado || !paciente} onClick={iniciarFirma}>Firmar y cerrar</button>}
      </div>
      {firmando && <FirmaDialogo open titulo="Firma de la valoración" firmante={{ tipo: 'podologo', usuarioId: perfil.id, nombre: nombreP, cedula: perfil.cedula }} documento={{ tipo: 'valoracion_pie_diabetico', id }} onClose={() => setFirmando(false)} onFirmada={firmar}><Aviso>Una valoración firmada no se modifica; para actualizar se registra una nueva.</Aviso></FirmaDialogo>}
    </div>
  )
}
