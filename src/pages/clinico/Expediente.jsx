import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Stethoscope, CalendarPlus, Pencil, Printer, ClipboardList, Lock, Eye, FileText, Upload, Gavel } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import EmptyState from '../../components/ui/EmptyState'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { leer, rpc, insertar } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { urlFirmada, BUCKETS, rutaStorage } from '../../lib/urlFirmada'
import { fecha, fechaHora, moneda, telefono, hoyISO } from '../../lib/formato'
import { resumenAntecedentesTexto } from '../../lib/clinico/impresos'
import { etiquetaDe, TIPOS_ATENCION } from '../../lib/clinico/catalogos'
import { Aviso, Seccion, useVista, useAccion, mensajeError, usePaciente, Volver } from './componentes/comunes'

const TIPOS_DOC = [['consentimiento_escaneado', 'Consentimiento escaneado'], ['historia_papel', 'Historia en papel'], ['estudio', 'Estudio'], ['referencia', 'Referencia'], ['receta_externa', 'Receta externa'], ['constancia_fiscal', 'Constancia fiscal'], ['otro', 'Otro']].map(([value, label]) => ({ value, label }))

export default function Expediente() {
  const { id } = useParams()
  const nav = useNavigate()
  const { rol, perfil, sedeActivaId, sedes } = useApp()
  const p = usePermisos('expediente.ver', 'consultas.escribir', 'pacientes.editar', 'agenda.editar', 'fotos.ver', 'facturas.ver', 'ventas.ver', 'planes.ver')
  const clinico = p['expediente.ver']
  const [tab, setTab] = useState('resumen')
  const paciente = usePaciente(id)
  const [aviso, setAviso] = useState(null)
  const abierto = useRef(null)

  // P-002: cada apertura queda en bitácora; si la sede del paciente es distinta, se marca para Administración
  useEffect(() => {
    if (!clinico || abierto.current === id) return
    abierto.current = id
    rpc('abrir_expediente', { p_paciente: id, p_sede_trabajo: sedeActivaId }).then(r => {
      if (r.error) { if (r.error.code !== 'SIN_CONEXION') setAviso({ tipo: 'err', texto: `No se pudo registrar la apertura del expediente: ${mensajeError(r.error)}` }); return }
      if (r.data?.sede_distinta) {
        setAviso({ tipo: 'warn', texto: 'Este paciente es de otra sede. La apertura quedó en la bitácora y se marcó para que Administración la revise (P-002).' })
        toast('Expediente de otra sede: se avisó a Administración', { icon: '🔔' })
      }
    })
  }, [id, clinico, sedeActivaId])

  if (paciente.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (paciente.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(paciente.error)}</Aviso><Volver a="/pacientes" /></div>
  const pac = paciente.data
  if (!pac) return <div className="pagina"><EmptyState title="Paciente no encontrado" description="Puede pertenecer a otra clínica o haber sido fusionado." /><Volver a="/pacientes" /></div>
  const sede = sedes.find(s => s.id === pac.sede_registro_id)

  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'historial', label: 'Historial de consultas', oculto: !clinico },
    { id: 'fotos', label: 'Fotos clínicas', oculto: !p['fotos.ver'] },
    { id: 'planes', label: 'Planes de tratamiento', oculto: !p['planes.ver'] },
    { id: 'documentos', label: 'Documentos y consentimientos' },
    { id: 'facturas', label: 'Facturas y pagos', oculto: !(p['facturas.ver'] || p['ventas.ver']) },
    { id: 'plantillas', label: 'Plantillas ortopédicas', oculto: !clinico },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Expediente del paciente" subtitulo={`Pacientes › ${pac.nombre_completo}${clinico ? '' : ' · vista de recepción (solo datos de contacto)'}`}
        acciones={<>
          {p['consultas.escribir'] && <Link to={`/consultas/nueva?paciente=${id}`} className="btn" style={{ textDecoration: 'none' }}><Stethoscope size={14} style={{ verticalAlign: -3 }} /> Nueva consulta</Link>}
          {p['agenda.editar'] && <Link to={`/agenda/nueva?paciente=${id}`} className="btn o" style={{ textDecoration: 'none' }}><CalendarPlus size={14} style={{ verticalAlign: -3 }} /> Cita</Link>}
          {p['pacientes.editar'] && <Link to={`/pacientes/${id}/editar`} className="btn o" style={{ textDecoration: 'none' }}><Pencil size={14} style={{ verticalAlign: -3 }} /> Editar ficha</Link>}
          {clinico && <Link to={`/pacientes/${id}/historia`} className="btn o" style={{ textDecoration: 'none' }}><ClipboardList size={14} style={{ verticalAlign: -3 }} /> Historia clínica</Link>}
          {clinico && <Link to={`/pacientes/${id}/imprimir`} className="btn o" style={{ textDecoration: 'none' }}><Printer size={14} style={{ verticalAlign: -3 }} /> Imprimir / PDF</Link>}
        </>} />
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {pac.estado === 'fusionado' && <Aviso tipo="err">Este expediente fue fusionado en otro. <Link to={`/pacientes/${pac.fusionado_en}`}>Abrir el expediente vigente</Link>.</Aviso>}
      {pac.alta_rapida && <Aviso>Alta rápida: la ficha está incompleta y no se puede abrir una consulta hasta completarla (P-003). {p['pacientes.editar'] && <Link to={`/pacientes/${id}/editar`}>Completar ficha</Link>}</Aviso>}
      {!pac.aviso_privacidad_firmado && <Aviso>Falta el aviso de privacidad firmado: la consulta podrá atenderse pero no cerrarse sin la excepción de Administración (P-004).</Aviso>}

      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent-dark)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18 }}>
          {(pac.nombre?.[0] ?? '') + (pac.apellido_paterno?.[0] ?? '')}
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 17 }}>{pac.nombre_completo}</b><StatusBadge estado={pac.estado} />
            {pac.diabetes && !['no', null].includes(pac.diabetes) && <span className="bd a">Diabetes {pac.diabetes.replace('tipo', 'tipo ')}</span>}
            {pac.es_menor && <span className="bd b">Menor de edad{pac.tiene_tutor ? '' : ' · sin tutor'}</span>}
            <span className="bd m">Expediente {pac.numero_expediente}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.7 }}>
            {pac.edad ?? '—'} años ({fecha(pac.fecha_nacimiento)}) · {pac.sexo ?? '—'} · Tel. {telefono(pac.telefono_celular)}{pac.telefono_fijo ? ` / ${telefono(pac.telefono_fijo)}` : ''} · {pac.email ?? 'sin correo'}
            {clinico && pac.curp ? ` · CURP ${pac.curp}` : ''} · Ocupación: {pac.ocupacion ?? '—'} · Sede de registro: {sede?.nombre ?? '—'}
            <br />Domicilio: {[pac.calle, pac.num_exterior, pac.manzana && `Mz ${pac.manzana}`, pac.lote && `Lt ${pac.lote}`, pac.colonia, pac.municipio, pac.codigo_postal].filter(Boolean).join(', ') || '—'}
          </div>
        </div>
      </div>

      {clinico && <Alertas pacienteId={id} perfilId={perfil?.id} />}
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'resumen' && <Resumen pac={pac} id={id} clinico={clinico} rol={rol} />}
      {tab === 'historial' && clinico && <Historial id={id} sedes={sedes} />}
      {tab === 'fotos' && <Fotos id={id} />}
      {tab === 'planes' && <Planes id={id} />}
      {tab === 'documentos' && <Documentos id={id} clinico={clinico} />}
      {tab === 'facturas' && <Facturas id={id} />}
      {tab === 'plantillas' && clinico && <PlantillasOrt id={id} />}
    </div>
  )
}

function Alertas({ pacienteId, perfilId }) {
  const q = useVista('alertas-' + pacienteId, 'prp_alertas_paciente', { sedeCol: false, filtros: { paciente_id: pacienteId } })
  const { ejecutar, ocupado } = useAccion()
  const [visto, setVisto] = useState(false)
  const filas = q.data?.filas ?? []
  if (!filas.length) return null
  const enterado = () => ejecutar(async () => {
    const r = await insertar('alertas_clinicas_vistas', filas.map(a => ({ paciente_id: pacienteId, tipo: a.tipo, detalle: a.mensaje, usuario_id: perfilId })))
    if (!r.error) setVisto(true)
    return r
  }, { ok: 'Alertas marcadas como vistas', invalidar: [] })
  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--red)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>Alertas clínicas</b><span style={{ fontSize: 11, color: 'var(--muted)' }}>(apoyo, no diagnóstico · nunca bloquean)</span>
        <button type="button" className="btn o sm" style={{ marginLeft: 'auto' }} disabled={ocupado || visto} onClick={enterado}>{visto ? '✓ Enterado' : 'Marcar como vistas'}</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {filas.map((a, i) => <span key={i} className={`bd ${a.severidad === 'alta' ? 'r' : 'a'}`}>{a.mensaje}</span>)}
      </div>
    </div>
  )
}

function useConsultas(id) {
  return useQuery({
    queryKey: ['clinico', 'consultas-paciente', id],
    queryFn: async () => {
      const c = await leer('consultas', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'fecha_hora', asc: false }, limite: 300 })
      if (c.error) throw c.error
      const ids = c.data.map(x => x.id)
      const polIds = [...new Set(c.data.map(x => x.firmada_por ?? x.podologo_id))]
      const servIds = [...new Set(c.data.map(x => x.servicio_id).filter(Boolean))]
      const [dx, fotos, pol, serv] = await Promise.all([
        ids.length ? leer('diagnosticos_consulta', { sedeCol: false, filtros: { consulta_id: ids }, limite: 1000 }) : { data: [] },
        ids.length ? leer('prp_fotos_clinicas', { sedeCol: false, filtros: { consulta_id: ids, retirada: false }, columnas: 'id,consulta_id', limite: 2000 }) : { data: [] },
        polIds.length ? leer('perfiles', { sedeCol: false, filtros: { id: polIds }, columnas: 'id,nombre,apellidos,cedula', limite: 100 }) : { data: [] },
        servIds.length ? leer('prp_servicios', { sedeCol: false, filtros: { id: servIds }, columnas: 'id,nombre', limite: 200 }) : { data: [] },
      ])
      const pm = Object.fromEntries((pol.data ?? []).map(x => [x.id, x])), sm = Object.fromEntries((serv.data ?? []).map(x => [x.id, x]))
      return c.data.map(x => ({
        ...x,
        diagnosticos: (dx.data ?? []).filter(d => d.consulta_id === x.id),
        nFotos: (fotos.data ?? []).filter(f => f.consulta_id === x.id).length,
        atendio: pm[x.firmada_por ?? x.podologo_id], servicio: sm[x.servicio_id]?.nombre,
      }))
    },
  })
}
const nombrePerfil = p => (p ? [p.nombre, p.apellidos].filter(Boolean).join(' ') : '—')
const dxTexto = d => d.cie10_codigo ? `${d.cie10_codigo}${d.categoria ? ' · ' + d.categoria.replace(/_/g, ' ') : ''}` : (d.categoria === 'otros' ? `Otros: ${d.texto_otros ?? ''}` : (d.categoria ?? '').replace(/_/g, ' '))

function Resumen({ pac, id, clinico, rol }) {
  const { sedes } = useApp()
  const ult = useConsultas(clinico ? id : null)
  const ant = useVista('ant-' + id, 'antecedentes_paciente', { sedeCol: false, filtros: { paciente_id: id }, limite: 1 }, { enabled: clinico })
  const alerg = useVista('alerg-' + id, 'alergias_paciente', { sedeCol: false, filtros: { paciente_id: id, vigente: true } }, { enabled: clinico })
  const cons = useVista('cons-' + id, 'prp_consentimientos_vigentes', { sedeCol: false, filtros: { paciente_id: id } })
  const prox = useVista('prox-' + id, 'prp_agenda', { sedeCol: false, filtros: { paciente_id: id, estado: ['por_confirmar', 'confirmada'], inicio: { gte: new Date().toISOString() } }, orden: { columna: 'inicio' }, limite: 1 })
  const [nota, setNota] = useState(null)
  const u = (ult.data ?? []).find(c => c.estado === 'cerrada')
  const a = ant.data?.filas?.[0]
  return (
    <>
      {clinico && (
        <Seccion titulo="Última sesión y quién atendió" acciones={u && <button type="button" className="btn o sm" onClick={() => setNota(u)}>Ver nota completa</button>}>
          {ult.isLoading ? <LoadingSpinner compacto /> : !u ? <span style={{ color: 'var(--muted)' }}>Aún no hay consultas firmadas.</span> : (
            <div className="grid2" style={{ gap: 6, fontSize: 13 }}>
              <div><b>Fecha</b> {fechaHora(u.fecha_hora)}</div>
              <div><b>Atendió</b> {nombrePerfil(u.atendio)}{u.cedula_firmante ? ` (cédula ${u.cedula_firmante})` : ''}</div>
              <div><b>Sede</b> {sedes.find(x => x.id === u.sede_id)?.nombre ?? '—'}</div><div><b>Servicio</b> {u.servicio ?? '—'}</div>
              <div style={{ gridColumn: '1 / -1' }}><b>Nota de evolución</b> {u.nota_evolucion}</div>
            </div>
          )}
        </Seccion>
      )}
      <div className="grid2">
        {clinico && (
          <Seccion titulo="Antecedentes clave">
            <div style={{ fontSize: 13 }}>{a ? (resumenAntecedentesTexto(a, alerg.data?.filas ?? []) || 'Sin antecedentes capturados.') : 'Sin antecedentes capturados.'}</div>
            <div style={{ marginTop: 8 }}><Link to={`/pacientes/${id}/historia`}>Abrir historia clínica completa</Link></div>
          </Seccion>
        )}
        <Seccion titulo="Documentos vigentes">
          {(cons.data?.filas ?? []).length === 0 ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>Sin consentimientos firmados.</span> : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {cons.data.filas.map(c => <li key={c.id}>{c.tipo.replace(/_/g, ' ')} v{c.plantilla_version ?? '—'} · {fecha(c.fecha_hora)}{!c.aceptado && ' · NO autorizado'}{c.requiere_nueva_firma && <span className="bd a" style={{ marginLeft: 6 }}>requiere nueva firma</span>}</li>)}
            </ul>
          )}
        </Seccion>
        <Seccion titulo="Próxima cita">
          {prox.data?.filas?.[0] ? (() => { const c = prox.data.filas[0]; return <div style={{ fontSize: 13 }}>{fechaHora(c.inicio)} · {c.podologo_nombre} · {c.servicio_nombre} · {c.cabina_nombre ?? 'sin cabina'} · <StatusBadge estado={c.estado} />{c.tipo_atencion === 'videoconsulta' && <> · <Link to={`/videoconsulta/${c.id}`}>Abrir sala de videoconsulta</Link></>}{clinico && <> · <Link to={`/consultas/nueva?paciente=${id}&cita=${c.id}`}>Iniciar consulta de esta cita</Link></>}</div> })() : <span style={{ color: 'var(--muted)', fontSize: 13 }}>Sin citas próximas.</span>}
        </Seccion>
        {clinico && <Sensible id={id} rol={rol} />}
      </div>
      <Modal open={!!nota} onClose={() => setNota(null)} title={`Nota ${nota?.folio ?? ''}`} size="wide" footer={<><Link className="btn o" style={{ textDecoration: 'none' }} to={`/consultas/${nota?.id}`}>Abrir consulta</Link><button type="button" className="btn" onClick={() => setNota(null)}>Cerrar</button></>}>
        {nota && <NotaCompleta c={nota} />}
      </Modal>
    </>
  )
}

function NotaCompleta({ c }) {
  const na = useVista('na-' + c.id, 'notas_aclaratorias', { sedeCol: false, filtros: { consulta_id: c.id }, orden: { columna: 'fecha_hora' } })
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      <div><b>{c.folio}</b> · {fechaHora(c.fecha_hora)} · {etiquetaDe(TIPOS_ATENCION, c.tipo_atencion)} · <StatusBadge estado={c.estado} /> · Atendió {nombrePerfil(c.atendio)}</div>
      <p><b>Motivo:</b> {c.motivo_consulta}</p><p><b>Padecimiento actual:</b> {c.padecimiento_actual}</p>
      <p><b>Nota de evolución:</b> {c.nota_evolucion}</p><p><b>Pronóstico:</b> {c.pronostico ?? '—'} · <b>Próxima visita:</b> {fecha(c.proxima_visita)}</p>
      <p><b>Diagnósticos:</b> {c.diagnosticos?.map(dxTexto).join('; ') || '—'}</p>
      {(na.data?.filas ?? []).map(n => <div key={n.id} className="card" style={{ background: 'var(--bd-a-bg)', margin: '8px 0' }}><b>Nota aclaratoria · {fechaHora(n.fecha_hora)}</b><div>{n.texto}</div></div>)}
    </div>
  )
}

function Sensible({ id, rol }) {
  const [abrir, setAbrir] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [dato, setDato] = useState(null)
  const { ejecutar, ocupado } = useAccion()
  async function ver() {
    const r = await ejecutar(() => rpc('ver_dato_sensible', { p_paciente: id, p_motivo: motivo || null }), { invalidar: [] })
    if (r) { setDato(r.data); setAbrir(false) }
  }
  return (
    <Seccion titulo="Dato muy sensible (restringido)">
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}><Lock size={12} style={{ verticalAlign: -1 }} /> El VIH solo lo ve el podólogo tratante, otros podólogos con motivo y Administración. Cada lectura queda en la bitácora (N-04).</div>
      {dato ? <div style={{ fontSize: 13 }}><b>VIH:</b> {({ si: 'Sí', no: 'No', no_sabe: 'No sabe' })[dato.vih] ?? 'Sin dato'}{dato.vih_nota ? ` · ${dato.vih_nota}` : ''}</div>
        : <button type="button" className="btn o sm" onClick={() => setAbrir(true)}><Eye size={12} style={{ verticalAlign: -2 }} /> Consultar dato restringido</button>}
      <Modal open={abrir} onClose={() => setAbrir(false)} title="Consultar dato restringido" size="sm" footer={<><button type="button" className="btn o" onClick={() => setAbrir(false)}>Cancelar</button><button type="button" className="btn" disabled={ocupado} onClick={ver}>Consultar</button></>}>
        <FormField label={rol === 'podologo' ? 'Motivo (obligatorio si no eres el podólogo tratante)' : 'Motivo'} as="textarea" value={motivo} onChange={e => setMotivo(e.target.value)} />
      </Modal>
    </Seccion>
  )
}

export function Historial({ id, sedes }) {
  const q = useConsultas(id)
  const [f, setF] = useState({ desde: '', hasta: '', pod: '', sede: '', serv: '', texto: '' })
  const [nota, setNota] = useState(null)
  const filas = useMemo(() => (q.data ?? []).filter(c => {
    const d = c.fecha_hora.slice(0, 10)
    if (f.desde && d < f.desde) return false
    if (f.hasta && d > f.hasta) return false
    if (f.pod && (c.firmada_por ?? c.podologo_id) !== f.pod) return false
    if (f.sede && c.sede_id !== f.sede) return false
    if (f.serv && c.servicio !== f.serv) return false
    if (f.texto && !`${c.nota_evolucion ?? ''} ${c.motivo_consulta ?? ''} ${c.padecimiento_actual ?? ''}`.toLowerCase().includes(f.texto.toLowerCase())) return false
    return true
  }), [q.data, f])
  const pods = [...new Map((q.data ?? []).map(c => [c.firmada_por ?? c.podologo_id, c.atendio])).entries()]
  const servs = [...new Set((q.data ?? []).map(c => c.servicio).filter(Boolean))]
  const sedeNombre = sid => sedes.find(s => s.id === sid)?.nombre ?? '—'
  const cols = [
    { key: 'fecha_hora', label: 'Fecha', render: c => fechaHora(c.fecha_hora) },
    { key: 'sede', label: 'Sede', valor: c => sedeNombre(c.sede_id) },
    { key: 'atendio', label: 'Atendió', valor: c => nombrePerfil(c.atendio) },
    { key: 'servicio', label: 'Servicio / procedimiento', render: c => c.servicio ?? '—' },
    { key: 'dx', label: 'Diagnóstico', sortable: false, valor: c => c.diagnosticos.map(dxTexto).join('; ') },
    { key: 'nFotos', label: 'Fotos', align: 'right' },
    { key: 'firma', label: 'Firma', valor: c => (c.firma_podologo_id ? 'Firmada' : 'Sin firma'), render: c => (c.firma_podologo_id ? <span className="bd v">Firmada</span> : <span className="bd a">Pendiente de firma</span>) },
    { key: 'estado', label: 'Estado de nota', render: c => <StatusBadge estado={c.estado} />, filtro: true, valor: c => c.estado },
    { key: 'tipo', label: 'Modalidad', valor: c => etiquetaDe(TIPOS_ATENCION, c.tipo_atencion) },
  ]
  const campo = (k, label, type = 'text', extra = {}) => <FormField label={label} type={type} value={f[k]} onChange={e => setF(s => ({ ...s, [k]: e.target.value }))} {...extra} />
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        {campo('desde', 'Desde', 'date')}{campo('hasta', 'Hasta', 'date')}
        <FormField label="Podólogo" as="select" options={pods.map(([i, p]) => ({ value: i, label: nombrePerfil(p) }))} value={f.pod} onChange={e => setF(s => ({ ...s, pod: e.target.value }))} placeholder="Todos" />
        <FormField label="Sede" as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede} onChange={e => setF(s => ({ ...s, sede: e.target.value }))} placeholder="Todas" />
        <FormField label="Servicio" as="select" options={servs.map(s => ({ value: s, label: s }))} value={f.serv} onChange={e => setF(s => ({ ...s, serv: e.target.value }))} placeholder="Todos" />
        {campo('texto', 'Buscar en notas', 'text', { placeholder: 'Buscar en notas…' })}
      </div>
      <DataTable columnas={cols} filas={filas} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} onFila={setNota} buscador={false} exportarNombre="historial_consultas"
        vacio={{ title: 'Sin consultas', description: 'No hay consultas con esos filtros.' }} />
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{filas.length} consultas · {new Set(filas.map(c => c.firmada_por ?? c.podologo_id)).size} podólogos</div>
      <Modal open={!!nota} onClose={() => setNota(null)} title={`Nota ${nota?.folio ?? ''}`} size="wide" footer={<><Link className="btn o" style={{ textDecoration: 'none' }} to={`/consultas/${nota?.id}`}>Abrir consulta</Link><button type="button" className="btn" onClick={() => setNota(null)}>Cerrar</button></>}>
        {nota && <NotaCompleta c={nota} />}
      </Modal>
    </>
  )
}

export function Fotos({ id }) {
  const q = useVista('fotos-' + id, 'prp_fotos_clinicas', { sedeCol: false, filtros: { paciente_id: id, retirada: false }, orden: { columna: 'tomada_en', asc: false }, limite: 60 })
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let vivo = true
    ;(async () => { const o = {}; for (const f of q.data?.filas ?? []) o[f.id] = await urlFirmada(BUCKETS.fotos, f.archivo_path, 900); if (vivo) setUrls(o) })()
    return () => { vivo = false }
  }, [q.data])
  const filas = q.data?.filas ?? []
  return (
    <Seccion titulo={`Fotos clínicas (${filas.length})`} acciones={<Link to={`/pacientes/${id}/fotos`} className="btn sm" style={{ textDecoration: 'none' }}>Comparar evolución / subir fotos</Link>}>
      {q.isLoading ? <LoadingSpinner compacto /> : q.error ? <Aviso tipo="err">{mensajeError(q.error)}</Aviso> : !filas.length ? <EmptyState compacto title="Sin fotos" description="Las fotos se suben en la consulta o desde el comparador." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {filas.map(f => (
            <div key={f.id} style={{ fontSize: 11 }}>
              {urls[f.id] ? <img src={urls[f.id]} alt={`Foto ${f.momento}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /> : <div style={{ aspectRatio: '1', background: 'var(--bd-n-bg)', borderRadius: 8 }} />}
              <div><b>{f.momento.replace('_', ' ')}</b> · {f.pie ?? ''} {f.vista ?? ''}</div><div style={{ color: 'var(--muted)' }}>{fecha(f.tomada_en)}{f.origen === 'paciente' ? ' · enviada por paciente' : ''}</div>
            </div>))}
        </div>
      )}
    </Seccion>
  )
}

function Planes({ id }) {
  const q = useVista('planes-' + id, 'prp_planes_progreso', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'fecha_inicio', asc: false } })
  const cols = [
    { key: 'folio', label: 'Folio' }, { key: 'nombre', label: 'Plan' }, { key: 'fecha_inicio', label: 'Inicio', render: p => fecha(p.fecha_inicio) },
    { key: 'avance', label: 'Avance', valor: p => `${p.sesiones_realizadas}/${p.sesiones_total}` }, { key: 'faltas', label: 'Faltas', align: 'right' },
    { key: 'sesiones_atrasadas', label: 'Atrasadas', align: 'right' }, { key: 'proxima_sesion', label: 'Próxima sesión', render: p => fecha(p.proxima_sesion) },
    { key: 'precio_plan', label: 'Precio', align: 'right', render: p => moneda(p.precio_plan) }, { key: 'estado', label: 'Estado', render: p => <StatusBadge estado={p.estado} /> },
  ]
  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to={`/planes/nuevo?paciente=${id}`} className="btn sm" style={{ textDecoration: 'none' }}>+ Nuevo plan</Link></div>
      <DataTable columnas={cols} filas={q.data?.filas ?? []} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} buscador={false} sinPaginacion vacio={{ title: 'Sin planes de tratamiento', description: 'Este paciente no tiene planes.' }} />
    </>
  )
}

export function Documentos({ id, clinico }) {
  const { perfil, organizacion } = useApp()
  const { ejecutar, ocupado } = useAccion()
  const cons = useVista('cons-all-' + id, 'consentimientos', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'fecha_hora', asc: false } })
  const adj = useVista('adj-' + id, 'documentos_adjuntos', { sedeCol: false, filtros: { paciente_id: id, retirado: false }, orden: { columna: 'created_at', asc: false } }, { enabled: clinico })
  const imp = useVista('imp-' + id, 'prp_documentos_emitidos', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'emitido_en', asc: false } }, { enabled: clinico })
  const [tipo, setTipo] = useState('consentimiento_escaneado')
  const input = useRef(null)
  async function subir(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('El archivo excede 10 MB'); return }
    await ejecutar(async () => {
      const ruta = rutaStorage(organizacion.id, 'pacientes', id, `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`)
      const { error } = await supabase.storage.from(BUCKETS.documentos).upload(ruta, file, { contentType: file.type, upsert: false })
      if (error) return { error }
      return insertar('documentos_adjuntos', { paciente_id: id, tipo, nombre: file.name, archivo_path: ruta, mime: file.type, tamano_bytes: file.size, subido_por: perfil?.id, fecha_documento: hoyISO() })
    }, { ok: 'Documento adjuntado (papel escaneado conservado, N-05)' })
  }
  async function abrir(path) { const u = await urlFirmada(BUCKETS.documentos, path, 300); if (u) window.open(u, '_blank', 'noopener'); else toast.error('No se pudo abrir el archivo') }
  return (
    <>
      <Seccion titulo="Consentimientos firmados">
        <DataTable buscador={false} sinPaginacion cargando={cons.isLoading} error={cons.error ? mensajeError(cons.error) : null} filas={cons.data?.filas ?? []}
          columnas={[{ key: 'tipo', label: 'Tipo', render: c => c.tipo.replace(/_/g, ' ') }, { key: 'plantilla_version', label: 'Versión', align: 'right' }, { key: 'fecha_hora', label: 'Fecha', render: c => fechaHora(c.fecha_hora) },
            { key: 'canal', label: 'Canal', render: c => (c.canal ?? '').replace(/_/g, ' ') }, { key: 'aceptado', label: 'Autorizó', render: c => (c.aceptado ? 'Sí' : 'No') }, { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} /> }]}
          vacio={{ title: 'Sin consentimientos', description: 'Aún no hay consentimientos firmados.' }} />
      </Seccion>
      {clinico && (
        <Seccion titulo="Documentos adjuntos (papel escaneado, estudios)" acciones={<>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ width: 'auto' }}>{TIPOS_DOC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <input ref={input} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={subir} />
          <button type="button" className="btn sm" disabled={ocupado} onClick={() => input.current?.click()}><Upload size={12} style={{ verticalAlign: -2 }} /> Adjuntar</button></>}>
          <DataTable buscador={false} sinPaginacion cargando={adj.isLoading} error={adj.error ? mensajeError(adj.error) : null} filas={adj.data?.filas ?? []}
            columnas={[{ key: 'nombre', label: 'Archivo', render: d => <button type="button" className="chip-quick" onClick={() => abrir(d.archivo_path)}><FileText size={12} /> {d.nombre}</button> }, { key: 'tipo', label: 'Tipo', render: d => etiquetaDe(TIPOS_DOC, d.tipo) }, { key: 'fecha_documento', label: 'Fecha', render: d => fecha(d.fecha_documento) }]}
            vacio={{ title: 'Sin adjuntos', description: 'Adjunta el papel firmado escaneado o estudios.' }} />
        </Seccion>)}
      {clinico && (
        <Seccion titulo="Impresiones del expediente (bitácora)">
          <DataTable buscador={false} sinPaginacion cargando={imp.isLoading} error={imp.error ? mensajeError(imp.error) : null} filas={imp.data?.filas ?? []}
            columnas={[{ key: 'emitido_en', label: 'Fecha', render: d => fechaHora(d.emitido_en) }, { key: 'folio', label: 'Folio' }, { key: 'tipo', label: 'Documento', render: d => d.tipo.replace('impreso_', '').replace(/_/g, ' ') },
              { key: 'version_expediente', label: 'Versión exp.', align: 'right' }, { key: 'es_copia', label: 'Copia', render: d => (d.es_copia ? 'Sí' : 'No') }, { key: 'incluye_sensibles', label: 'Con datos sensibles', render: d => (d.incluye_sensibles ? 'Sí' : 'No') }]}
            vacio={{ title: 'Sin impresiones', description: 'Aún no se ha impreso este expediente.' }} />
        </Seccion>)}
      <ArcoBoton id={id} />
    </>
  )
}

function ArcoBoton({ id }) {
  const { ejecutar, ocupado } = useAccion()
  const { perfil } = useApp()
  const [abrir, setAbrir] = useState(false)
  const [tipo, setTipo] = useState('acceso')
  const [detalle, setDetalle] = useState('')
  const guardar = async () => {
    const r = await ejecutar(() => insertar('solicitudes_arco', { paciente_id: id, tipo, detalle: detalle.trim() || null, fecha_recibida: hoyISO(), registrada_por: perfil?.id }), { ok: 'Solicitud ARCO registrada (plazo de 20 días naturales)' })
    if (r) setAbrir(false)
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <button type="button" className="btn o sm" onClick={() => setAbrir(true)}><Gavel size={12} style={{ verticalAlign: -2 }} /> Registrar solicitud ARCO</button>
      <Modal open={abrir} onClose={() => setAbrir(false)} title="Solicitud ARCO" size="sm" footer={<><button type="button" className="btn o" onClick={() => setAbrir(false)}>Cancelar</button><button type="button" className="btn" disabled={ocupado} onClick={guardar}>Registrar</button></>}>
        <FormField label="Derecho" as="select" options={[['acceso', 'Acceso'], ['rectificacion', 'Rectificación'], ['cancelacion', 'Cancelación'], ['oposicion', 'Oposición']].map(([value, label]) => ({ value, label }))} value={tipo} onChange={e => setTipo(e.target.value)} />
        <FormField label="Detalle de lo solicitado" as="textarea" value={detalle} onChange={e => setDetalle(e.target.value)} />
      </Modal>
    </div>
  )
}

function Facturas({ id }) {
  const v = useVista('ventas-' + id, 'prp_ventas', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'created_at', asc: false }, limite: 200 })
  const ids = (v.data?.filas ?? []).map(x => x.id)
  const fs = useVista('facturas-' + id, 'prp_facturas', { sedeCol: false, filtros: { venta_id: ids } }, { enabled: ids.length > 0 })
  const total = (v.data?.filas ?? []).filter(x => ['cobrada', 'por_facturar', 'facturada'].includes(x.estado)).reduce((a, x) => a + Number(x.total || 0), 0)
  return (
    <>
      <Seccion titulo={`Pagos y tickets · total pagado ${moneda(total)}`}>
        <DataTable buscador={false} sinPaginacion cargando={v.isLoading} error={v.error ? mensajeError(v.error) : null} filas={v.data?.filas ?? []}
          columnas={[{ key: 'folio', label: 'Ticket' }, { key: 'cobrada_en', label: 'Fecha', render: x => fechaHora(x.cobrada_en ?? x.created_at) }, { key: 'sede_nombre', label: 'Sede' }, { key: 'total', label: 'Total', align: 'right', render: x => moneda(x.total) }, { key: 'estado', label: 'Estado', render: x => <StatusBadge estado={x.estado} /> }]}
          vacio={{ title: 'Sin tickets', description: 'No hay cobros registrados.' }} />
      </Seccion>
      <Seccion titulo="Facturas (CFDI)">
        <DataTable buscador={false} sinPaginacion filas={fs.data?.filas ?? []} cargando={fs.isLoading}
          columnas={[{ key: 'folio', label: 'Folio', render: f => f.folio ?? f.ticket_folio ?? '—' }, { key: 'created_at', label: 'Fecha', render: f => fecha(f.created_at) }, { key: 'total', label: 'Total', align: 'right', render: f => moneda(f.total) }, { key: 'estado', label: 'Estado', render: f => <StatusBadge estado={f.estado} /> }]}
          vacio={{ title: 'Sin facturas', description: 'No hay facturas ligadas a este paciente.' }} />
      </Seccion>
    </>
  )
}

function PlantillasOrt({ id }) {
  const nav = useNavigate()
  const q = useVista('ort-' + id, 'prp_plantillas_seguimiento', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'fecha_envio', asc: false } })
  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to={`/plantillas-ortopedicas/nueva?paciente=${id}`} className="btn sm" style={{ textDecoration: 'none' }}>+ Estudio de pisada y orden</Link></div>
      <DataTable buscador={false} sinPaginacion cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filas={q.data?.filas ?? []}
        onFila={o => nav(`/plantillas-ortopedicas/${o.orden_id}`)}
        columnas={[{ key: 'folio', label: 'Orden' }, { key: 'estado', label: 'Estado', render: o => <StatusBadge estado={o.estado} /> }, { key: 'fecha_envio', label: 'Envío', render: o => fecha(o.fecha_envio) }, { key: 'entrega_estimada', label: 'Entrega estimada', render: o => fecha(o.entrega_estimada) },
          { key: 'garantia_hasta', label: 'Garantía hasta', render: o => fecha(o.garantia_hasta) }, { key: 'precio', label: 'Precio', align: 'right', render: o => moneda(o.precio) },
          { key: 'flags', label: 'Avisos', sortable: false, render: o => <>{o.retrasada_laboratorio && <span className="bd r">Retrasada</span>} {o.revision_ajuste_pendiente && <span className="bd a">Revisión de ajuste</span>} {o.renovacion_disponible && <span className="bd b">Renovación</span>}</> }]}
        vacio={{ title: 'Sin plantillas ortopédicas', description: 'Este paciente no tiene órdenes de plantillas.' }} />
    </>
  )
}
