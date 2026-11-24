import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Save, Printer, FileText, ClipboardList } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import FormField from '../../components/ui/FormField'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { leer, rpc, insertar, actualizar } from '../../lib/api'
import { actualizarPor, upsertPor } from '../../lib/clinico/db'
import { textoEdad } from '../../lib/clinico/edad'
import { SEXOS, ESTADOS_CIVILES, DIABETES_TIPO } from '../../lib/clinico/catalogos'
import { PARENTESCOS } from '../../lib/clinico/impresos'
import { fecha, fechaHora } from '../../lib/formato'
import { Aviso, Seccion, TriEstado, useAccion, usePaciente, useVista, mensajeError, num, Volver, CabeceraPaciente } from './componentes/comunes'
import ExploracionMI from './componentes/ExploracionMI'
import { Fotos, Documentos } from './Expediente'

const TRI_PATOLOGICOS = [
  ['diabetes', 'Diabetes'], ['hipertension', 'Hipertensión'], ['alergicos', 'Alérgicos', 'alergicos_detalle', '¿A qué?'], ['artritis', 'Artritis'], ['obesidad', 'Obesidad'],
  ['traumaticos', 'Traumáticos', 'traumaticos_detalle', 'Especifique'], ['varices', 'Várices'], ['vih', 'VIH (restringido)'], ['otras_enfermedades', 'Otras', 'otras_enfermedades_detalle', 'Especifique'],
  ['toma_medicamentos', 'Toma algún medicamento', 'medicamentos_texto', '¿Cuál?'],
]
const TRI_CLINICOS = [['insuficiencia_venosa', 'Insuficiencia venosa'], ['insuficiencia_arterial', 'Insuficiencia arterial'], ['neuropatia', 'Neuropatía'], ['psoriasis', 'Psoriasis'], ['inmunosupresion', 'Inmunosupresión'],
  ['anticoagulacion', 'Anticoagulación'], ['ulcera_previa', 'Úlcera previa'], ['amputacion_previa', 'Amputación previa'], ['embarazo', 'Embarazo']]
const TRI_NO_PAT = [['tabaquismo', 'Tabaquismo'], ['alcoholismo', 'Alcoholismo'], ['toxicomanias', 'Toxicomanías', 'toxicomanias_detalle', 'Especifique'], ['deporte', '¿Practica algún deporte?', 'deporte_detalle', '¿Cuál?']]
const NUMERICOS = ['diabetes_anios_evolucion', 'hba1c', 'numero_calzado']
const CAMPOS_ANT = ['diabetes', 'diabetes_tipo', 'diabetes_anios_evolucion', 'hba1c', 'hba1c_fecha', 'diabetes_tratamiento', 'medico_tratante', 'medico_especialidad', 'hipertension', 'alergicos', 'alergicos_detalle', 'artritis', 'obesidad', 'traumaticos', 'traumaticos_detalle', 'varices', 'otras_enfermedades', 'otras_enfermedades_detalle', 'toma_medicamentos', 'medicamentos_texto', 'ultima_glucosa_fecha', 'ultima_glucosa_texto', 'insuficiencia_venosa', 'insuficiencia_arterial', 'neuropatia', 'psoriasis', 'inmunosupresion', 'anticoagulacion', 'ulcera_previa', 'amputacion_previa', 'embarazo', 'cirugia_previa_pie', 'hf_padre', 'hf_madre', 'hf_hermanos', 'hf_esposo', 'hf_hijos', 'tabaquismo', 'alcoholismo', 'toxicomanias', 'toxicomanias_detalle', 'tipo_calzado', 'numero_calzado', 'deporte', 'deporte_detalle', 'calzado_actividad', 'motivo_consulta_inicial', 'sintomas_iniciales', 'notas']
const CAMPOS_PAC = ['sede_registro_id', 'nombre', 'apellido_paterno', 'apellido_materno', 'fecha_nacimiento', 'sexo', 'estado_civil', 'ocupacion', 'lugar_origen', 'calle', 'num_exterior', 'manzana', 'lote', 'colonia', 'telefono_fijo', 'telefono_celular', 'email']

export default function HistoriaClinica() {
  const { id } = useParams()
  const nav = useNavigate()
  const { sedes, rol, perfil } = useApp()
  const p = usePermisos('expediente.ver', 'pacientes.editar')
  const { ejecutar, ocupado } = useAccion()
  const [tab, setTab] = useState('antecedentes')
  const pac = usePaciente(id)
  const ant = useQuery({ queryKey: ['clinico', 'antecedentes', id], queryFn: async () => { const r = await leer('antecedentes_paciente', { sedeCol: false, filtros: { paciente_id: id }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const [a, setA] = useState({})
  const [g, setG] = useState({})
  const [vih, setVih] = useState({ visible: false, valor: null, nota: '', motivo: '' })
  useEffect(() => { if (ant.data) setA(Object.fromEntries(CAMPOS_ANT.map(k => [k, ant.data[k] ?? '']))) }, [ant.data])
  useEffect(() => { if (pac.data) setG(Object.fromEntries(CAMPOS_PAC.map(k => [k, pac.data[k] ?? '']))) }, [pac.data])

  // Consulta abierta (borrador) del podólogo: ahí vive la exploración física
  const abierta = useVista('consulta-abierta-' + id, 'consultas', { sedeCol: false, filtros: { paciente_id: id, estado: ['borrador', 'pendiente_firma'], podologo_id: perfil?.id }, orden: { columna: 'fecha_hora', asc: false }, limite: 1 }, { enabled: p['expediente.ver'] && rol === 'podologo' })
  const ultima = useVista('consulta-ultima-' + id, 'consultas', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'fecha_hora', asc: false }, limite: 1, columnas: 'id' }, { enabled: p['expediente.ver'] })
  const consultaExpl = abierta.data?.filas?.[0]?.id ?? ultima.data?.filas?.[0]?.id ?? null
  const explEditable = !!abierta.data?.filas?.[0]

  if (!p['expediente.ver']) return <div className="pagina"><Aviso tipo="err">La historia clínica solo la consultan Podología y Administración.</Aviso><Volver a={`/pacientes/${id}`} /></div>
  if (pac.isLoading || ant.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (pac.error || ant.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(pac.error ?? ant.error)}</Aviso></div>
  if (!pac.data) return <div className="pagina"><Aviso tipo="err">Paciente no encontrado.</Aviso><Volver a="/pacientes" /></div>

  const editable = p['pacientes.editar'] && pac.data.estado !== 'fusionado'
  const setAnt = (k, v) => setA(s => ({ ...s, [k]: v }))
  const campoA = (k, label, extra = {}) => <FormField label={label} value={a[k] ?? ''} onChange={e => setAnt(k, e.target.value)} disabled={!editable} {...extra} />

  async function guardar() {
    await ejecutar(async () => {
      const cambiosA = Object.fromEntries(CAMPOS_ANT.map(k => {
        let v = a[k]
        if (NUMERICOS.includes(k)) v = num(v)
        else if (v === '') v = null
        return [k, v]
      }))
      const rA = await actualizarPor('antecedentes_paciente', 'paciente_id', id, cambiosA)
      if (rA.error) return rA
      const cambiosP = Object.fromEntries(CAMPOS_PAC.filter(k => k !== 'sede_registro_id' || rol === 'administrador').map(k => [k, g[k] === '' ? null : g[k]]))
      const rP = await actualizar('pacientes', id, cambiosP)
      if (rP.error) return rP
      if (vih.visible && vih.valor !== null) return upsertPor('paciente_datos_sensibles', { paciente_id: id, vih: vih.valor, vih_nota: vih.nota || null, actualizado_por: perfil?.id }, 'paciente_id')
      return {}
    }, { ok: 'Historia clínica guardada', invalidar: ['clinico'] })
  }
  async function revelarVih() {
    const r = await ejecutar(() => rpc('ver_dato_sensible', { p_paciente: id, p_motivo: vih.motivo || null }), { invalidar: [] })
    if (r) setVih(s => ({ ...s, visible: true, valor: r.data?.vih ?? null, nota: r.data?.vih_nota ?? '' }))
  }

  const triFila = ([k, label, det, detLabel]) => (
    <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0', borderBottom: '1px solid var(--row-line)' }}>
      <div style={{ width: 190, fontSize: 13, fontWeight: 600 }}>{label}</div>
      {k === 'vih' ? (
        vih.visible ? <TriEstado value={vih.valor} onChange={v => setVih(s => ({ ...s, valor: v }))} disabled={!editable} />
          : <><input placeholder="Motivo (si no eres el tratante)" value={vih.motivo} onChange={e => setVih(s => ({ ...s, motivo: e.target.value }))} style={{ maxWidth: 260 }} />
            <button type="button" className="btn o sm" onClick={revelarVih} disabled={ocupado}>Consultar dato restringido</button></>
      ) : <TriEstado value={a[k] || null} onChange={v => setAnt(k, v ?? '')} disabled={!editable} />}
      {det && a[k] === 'si' && <input style={{ flex: 1, minWidth: 160 }} placeholder={detLabel} value={a[det] ?? ''} onChange={e => setAnt(det, e.target.value)} disabled={!editable} />}
      {k === 'diabetes' && a.diabetes === 'si' && <select value={a.diabetes_tipo ?? ''} onChange={e => setAnt('diabetes_tipo', e.target.value)} disabled={!editable}><option value="">Tipo…</option>{DIABETES_TIPO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>}
    </div>
  )

  return (
    <div className="pagina">
      <PageHeader titulo="Historia clínica · Antecedentes personales" subtitulo={`Paciente ${pac.data.nombre_completo} · Expediente ${pac.data.numero_expediente} · réplica 1:1 del formato en papel de la clínica`}
        acciones={<>
          {editable && <button type="button" className="btn" disabled={ocupado} onClick={guardar}><Save size={14} style={{ verticalAlign: -3 }} /> {ocupado ? 'Guardando…' : 'Guardar'}</button>}
          <button type="button" className="btn o" onClick={() => nav(`/pacientes/${id}/imprimir?tipo=impreso_historia_completa`)}><Printer size={14} style={{ verticalAlign: -3 }} /> Imprimir historia (PDF)</button>
          <button type="button" className="btn o" onClick={() => nav(`/pacientes/${id}/imprimir?tipo=impreso_en_blanco`)}>Imprimir en blanco</button>
          <button type="button" className="btn o" onClick={() => nav(`/pacientes/${id}/imprimir?tipo=impreso_consentimiento`)}>Consentimiento</button>
          <button type="button" className="btn o" onClick={() => nav(`/pacientes/${id}/imprimir?tipo=impreso_seguimiento`)}>Hoja de seguimiento</button>
          <Volver a={`/pacientes/${id}`} />
        </>} />
      <CabeceraPaciente paciente={pac.data} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'resumen', label: 'Resumen' }, { id: 'antecedentes', label: 'Antecedentes' }, { id: 'consentimiento', label: 'Consentimiento' }, { id: 'seguimiento', label: 'Seguimiento clínico' }, { id: 'fotos', label: 'Fotos' }, { id: 'documentos', label: 'Documentos' }]} />

      {tab === 'resumen' && (
        <Seccion titulo="Resumen">
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            Diabetes: <b>{a.diabetes || 'sin dato'}</b> · Hipertensión: <b>{a.hipertension || 'sin dato'}</b> · Alergias: <b>{a.alergicos === 'si' ? a.alergicos_detalle || 'sí' : a.alergicos || 'sin dato'}</b> · Medicamentos: <b>{a.medicamentos_texto || (a.toma_medicamentos || 'sin dato')}</b>
            <br />Motivo de consulta inicial: {a.motivo_consulta_inicial || '—'} · Última glucosa: {a.ultima_glucosa_texto || fecha(a.ultima_glucosa_fecha)}
          </div>
        </Seccion>
      )}

      {tab === 'antecedentes' && (
        <>
          <Seccion titulo="Datos generales">
            <div className="field" style={{ marginBottom: 8 }}><label>Sede de registro</label>
              <div className="chip-group">{sedes.map(s => <button key={s.id} type="button" disabled={!editable || rol !== 'administrador'} className={`chip${g.sede_registro_id === s.id ? ' on' : ''}`} onClick={() => setG(x => ({ ...x, sede_registro_id: s.id }))}>{s.nombre}</button>)}</div></div>
            <div className="row">
              <FormField label="Fecha" value={new Date().toLocaleDateString('es-MX')} readOnly />
              <FormField label="N.º de expediente" value={pac.data.numero_expediente ?? ''} readOnly hint="Solo Administración lo cambia" />
              <FormField label="Nombre(s)" value={g.nombre ?? ''} onChange={e => setG(x => ({ ...x, nombre: e.target.value }))} disabled={!editable} />
              <FormField label="Apellido paterno" value={g.apellido_paterno ?? ''} onChange={e => setG(x => ({ ...x, apellido_paterno: e.target.value }))} disabled={!editable} />
              <FormField label="Apellido materno" value={g.apellido_materno ?? ''} onChange={e => setG(x => ({ ...x, apellido_materno: e.target.value }))} disabled={!editable} />
            </div>
            <div className="row">
              <FormField label="Fecha de nacimiento" type="date" value={g.fecha_nacimiento ?? ''} onChange={e => setG(x => ({ ...x, fecha_nacimiento: e.target.value }))} disabled={!editable} />
              <FormField label="Edad" value={`${textoEdad(g.fecha_nacimiento)} (calculada)`} readOnly />
              <FormField label="Sexo" as="select" options={SEXOS} value={g.sexo ?? ''} onChange={e => setG(x => ({ ...x, sexo: e.target.value }))} disabled={!editable} />
              <FormField label="Estado civil" as="select" options={ESTADOS_CIVILES} value={g.estado_civil ?? ''} onChange={e => setG(x => ({ ...x, estado_civil: e.target.value }))} disabled={!editable} />
              <FormField label="Ocupación" value={g.ocupacion ?? ''} onChange={e => setG(x => ({ ...x, ocupacion: e.target.value }))} disabled={!editable} />
              <FormField label="Lugar de origen" value={g.lugar_origen ?? ''} onChange={e => setG(x => ({ ...x, lugar_origen: e.target.value }))} disabled={!editable} />
            </div>
            <div className="row">
              <FormField label="Calle" value={g.calle ?? ''} onChange={e => setG(x => ({ ...x, calle: e.target.value }))} disabled={!editable} />
              <FormField label="N.º ext." value={g.num_exterior ?? ''} onChange={e => setG(x => ({ ...x, num_exterior: e.target.value }))} disabled={!editable} style={{ maxWidth: 100 }} />
              <FormField label="Mz" value={g.manzana ?? ''} onChange={e => setG(x => ({ ...x, manzana: e.target.value }))} disabled={!editable} style={{ maxWidth: 90 }} />
              <FormField label="Lt" value={g.lote ?? ''} onChange={e => setG(x => ({ ...x, lote: e.target.value }))} disabled={!editable} style={{ maxWidth: 90 }} />
              <FormField label="Colonia" value={g.colonia ?? ''} onChange={e => setG(x => ({ ...x, colonia: e.target.value }))} disabled={!editable} />
            </div>
            <div className="row">
              <FormField label="Teléfono" value={g.telefono_fijo ?? ''} onChange={e => setG(x => ({ ...x, telefono_fijo: e.target.value }))} disabled={!editable} />
              <FormField label="Móvil" value={g.telefono_celular ?? ''} onChange={e => setG(x => ({ ...x, telefono_celular: e.target.value }))} disabled={!editable} />
              <FormField label="Email" type="email" value={g.email ?? ''} onChange={e => setG(x => ({ ...x, email: e.target.value }))} disabled={!editable} />
            </div>
          </Seccion>

          <Seccion titulo="Antecedentes personales patológicos · «Tiene alguna enfermedad como:»" ayuda="Cada casilla admite Sí / No / No sabe (no preguntado ≠ no). VIH y datos muy sensibles: visibilidad restringida (N-04).">
            {TRI_PATOLOGICOS.map(triFila)}
            {a.diabetes === 'si' && (
              <div className="row" style={{ marginTop: 8 }}>
                {campoA('diabetes_anios_evolucion', 'Años de evolución', { type: 'number', min: 0, max: 90 })}{campoA('hba1c', 'HbA1c (%)', { type: 'number', step: '0.1' })}{campoA('hba1c_fecha', 'Fecha de HbA1c', { type: 'date' })}
                {campoA('diabetes_tratamiento', 'Tratamiento')}{campoA('medico_tratante', 'Médico tratante')}{campoA('medico_especialidad', 'Especialidad')}
              </div>)}
            <div className="row" style={{ marginTop: 8 }}>
              {campoA('ultima_glucosa_fecha', 'Última toma de glucosa (fecha)', { type: 'date' })}{campoA('ultima_glucosa_texto', 'Resultado / comentario', { placeholder: '142 mg/dl' })}
            </div>
            <h4 style={{ margin: '12px 0 4px', fontSize: 12 }}>Antecedentes clínicos para la valoración (apoyan las alertas)</h4>
            {TRI_CLINICOS.map(triFila)}
            {campoA('cirugia_previa_pie', 'Cirugía previa en el pie')}
          </Seccion>
          <AlergiasMedicamentos id={id} editable={editable} />

          <Seccion titulo="Antecedentes heredo-familiares · «Padece alguna enfermedad su:»">
            <div className="row">{PARENTESCOS.map(([k, e]) => campoA(k, e))}</div>
          </Seccion>
          <Seccion titulo="Antecedentes personales no patológicos">
            {TRI_NO_PAT.map(triFila)}
            <div className="row" style={{ marginTop: 8 }}>{campoA('tipo_calzado', 'Tipo de calzado')}{campoA('numero_calzado', 'N.º de calzado', { type: 'number', step: '0.5' })}{campoA('calzado_actividad', 'Calzado / actividad')}</div>
          </Seccion>
          <Seccion titulo="Motivo y síntomas">
            {campoA('motivo_consulta_inicial', '¿Cuál es el motivo de su consulta?', { as: 'textarea' })}{campoA('sintomas_iniciales', 'Síntomas', { as: 'textarea' })}{campoA('notas', 'Notas', { as: 'textarea' })}
          </Seccion>
          <Seccion titulo="Exploración física"><ExploracionMI consultaId={consultaExpl} editable={explEditable} />
            {!explEditable && rol === 'podologo' && <div style={{ marginTop: 8 }}><Link to={`/consultas/nueva?paciente=${id}`} className="btn o sm" style={{ textDecoration: 'none' }}>Iniciar consulta para capturar exploración</Link></div>}</Seccion>
        </>
      )}

      {tab === 'consentimiento' && <ConsentimientosTab id={id} />}
      {tab === 'seguimiento' && <SeguimientoTab id={id} />}
      {tab === 'fotos' && <Fotos id={id} />}
      {tab === 'documentos' && <Documentos id={id} clinico />}
    </div>
  )
}

function AlergiasMedicamentos({ id, editable }) {
  const al = useVista('alergias-' + id, 'alergias_paciente', { sedeCol: false, filtros: { paciente_id: id, vigente: true } })
  const me = useVista('meds-' + id, 'medicamentos_paciente', { sedeCol: false, filtros: { paciente_id: id, vigente: true } })
  const { ejecutar, ocupado } = useAccion()
  const [na, setNa] = useState({ sustancia: '', reaccion: '', gravedad: '' })
  const [nm, setNm] = useState({ nombre_dosis: '', anticoagulante: false })
  return (
    <div className="grid2">
      <Seccion titulo="Alergias">
        {(al.data?.filas ?? []).map(x => <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}><span style={{ flex: 1 }}><b>{x.sustancia}</b> {x.reaccion && `· ${x.reaccion}`} {x.gravedad && <span className="bd a">{x.gravedad}</span>}</span>
          {editable && <button type="button" className="btn o sm" disabled={ocupado} onClick={() => ejecutar(() => actualizar('alergias_paciente', x.id, { vigente: false }), { ok: 'Alergia retirada' })}>Retirar</button>}</div>)}
        {!(al.data?.filas ?? []).length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin alergias registradas.</div>}
        {editable && <div className="row" style={{ marginTop: 8 }}>
          <FormField label="Sustancia" value={na.sustancia} onChange={e => setNa(s => ({ ...s, sustancia: e.target.value }))} /><FormField label="Reacción" value={na.reaccion} onChange={e => setNa(s => ({ ...s, reaccion: e.target.value }))} />
          <FormField label="Gravedad" as="select" options={[{ value: 'leve', label: 'Leve' }, { value: 'moderada', label: 'Moderada' }, { value: 'grave', label: 'Grave' }]} value={na.gravedad} onChange={e => setNa(s => ({ ...s, gravedad: e.target.value }))} />
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-end' }} disabled={ocupado || !na.sustancia.trim()} onClick={async () => { if (await ejecutar(() => insertar('alergias_paciente', { paciente_id: id, sustancia: na.sustancia.trim(), reaccion: na.reaccion || null, gravedad: na.gravedad || null }), { ok: 'Alergia agregada' })) setNa({ sustancia: '', reaccion: '', gravedad: '' }) }}>Agregar</button></div>}
      </Seccion>
      <Seccion titulo="Medicamentos actuales">
        {(me.data?.filas ?? []).map(x => <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}><span style={{ flex: 1 }}>{x.nombre_dosis} {x.anticoagulante && <span className="bd r">Anticoagulante</span>}</span>
          {editable && <button type="button" className="btn o sm" disabled={ocupado} onClick={() => ejecutar(() => actualizar('medicamentos_paciente', x.id, { vigente: false }), { ok: 'Medicamento retirado' })}>Retirar</button>}</div>)}
        {!(me.data?.filas ?? []).length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin medicamentos registrados.</div>}
        {editable && <div className="row" style={{ marginTop: 8 }}>
          <FormField label="Medicamento y dosis" value={nm.nombre_dosis} onChange={e => setNm(s => ({ ...s, nombre_dosis: e.target.value }))} />
          <label style={{ fontSize: 12, alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={nm.anticoagulante} onChange={e => setNm(s => ({ ...s, anticoagulante: e.target.checked }))} /> Anticoagulante</label>
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-end' }} disabled={ocupado || !nm.nombre_dosis.trim()} onClick={async () => { if (await ejecutar(() => insertar('medicamentos_paciente', { paciente_id: id, nombre_dosis: nm.nombre_dosis.trim(), anticoagulante: nm.anticoagulante }), { ok: 'Medicamento agregado' })) setNm({ nombre_dosis: '', anticoagulante: false }) }}>Agregar</button></div>}
      </Seccion>
    </div>
  )
}

function ConsentimientosTab({ id }) {
  const q = useVista('cons-all-' + id, 'prp_consentimientos_vigentes', { sedeCol: false, filtros: { paciente_id: id } })
  return (
    <Seccion titulo="Consentimientos vigentes" acciones={<Link to={`/pacientes/${id}/imprimir?tipo=impreso_consentimiento`} className="btn sm" style={{ textDecoration: 'none' }}><FileText size={12} style={{ verticalAlign: -2 }} /> Imprimir consentimiento</Link>}>
      <DataTable buscador={false} sinPaginacion cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filas={q.data?.filas ?? []}
        columnas={[{ key: 'tipo', label: 'Tipo', render: c => c.tipo.replace(/_/g, ' ') }, { key: 'plantilla_version', label: 'Versión', align: 'right' }, { key: 'version_activa', label: 'Versión vigente de la clínica', align: 'right' }, { key: 'fecha_hora', label: 'Firmado', render: c => fechaHora(c.fecha_hora) },
          { key: 'req', label: '', sortable: false, render: c => c.requiere_nueva_firma && <span className="bd a">Requiere nueva firma</span> }]}
        vacio={{ title: 'Sin consentimientos firmados', description: 'Se firman en el alta y en consulta, por servicio.' }} />
    </Seccion>
  )
}

function SeguimientoTab({ id }) {
  const q = useVista('seg-' + id, 'prp_seguimiento_clinico', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'fecha_hora', asc: false } })
  return (
    <Seccion titulo="Seguimiento clínico (tabla de visitas)" acciones={<Link to={`/pacientes/${id}/imprimir?tipo=impreso_seguimiento`} className="btn sm" style={{ textDecoration: 'none' }}><ClipboardList size={12} style={{ verticalAlign: -2 }} /> Imprimir hoja de visitas</Link>}>
      <DataTable buscador={false} sinPaginacion cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filas={q.data?.filas ?? []} onFila={() => {}}
        columnas={[{ key: 'fecha', label: 'Fecha', render: s => fecha(s.fecha) }, { key: 'atendio', label: 'Atendió' }, { key: 'servicio', label: 'Servicio' }, { key: 'observaciones', label: 'Observaciones' }, { key: 'proxima_visita', label: 'Próx. visita', render: s => fecha(s.proxima_visita) },
          { key: 'notas_aclaratorias', label: 'Notas aclaratorias', align: 'right' }, { key: 'tipo_atencion', label: 'Modalidad', render: s => <StatusBadge estado={s.tipo_atencion} variante="n" /> }]}
        vacio={{ title: 'Sin visitas', description: 'Las visitas aparecen al firmar cada consulta.' }} />
    </Seccion>
  )
}
