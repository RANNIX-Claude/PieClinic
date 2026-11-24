import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, UserX, CalendarClock, Cake, Phone, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { insertar, actualizar, rpc } from '../../lib/api'
import { fecha, fechaHora, moneda, hoyISO, telefono } from '../../lib/formato'
import { diasSinVenir, esInactivo, cumpleEnVentana, puedeContactar, segmentarDestinatarios, CANALES_CAMPANA, ligaWhatsApp, vistaPreviaMensaje, UMBRAL_INACTIVO_DIAS } from '../../lib/clinico/crm'
import { diasParaCumpleanos } from '../../lib/clinico/edad'
import { Aviso, AvisoSimulado, Seccion, useVista, useAccion, mensajeError, limpiar } from './componentes/comunes'

const MOTIVOS = [['inactivo', 'Inactivo'], ['revision_vencida', 'Revisión vencida'], ['cumpleanos', 'Cumpleaños'], ['post_consulta', 'Post consulta'], ['plan_abandonado', 'Plan abandonado'], ['queja', 'Queja'], ['otro', 'Otro']].map(([value, label]) => ({ value, label }))
const CANALES = [['whatsapp', 'WhatsApp'], ['correo', 'Correo'], ['telefono', 'Llamada'], ['presencial', 'Presencial'], ['sms', 'SMS']].map(([value, label]) => ({ value, label }))

export default function Seguimiento() {
  const { sedes, perfil, organizacion, rol } = useApp()
  const p = usePermisos('crm.editar')
  const [tab, setTab] = useState('inactivos')
  const [umbral, setUmbral] = useState(String(organizacion?.parametros?.dias_inactivo ?? UMBRAL_INACTIVO_DIAS))
  const [ventana, setVentana] = useState('7')
  const [soloConsent, setSoloConsent] = useState(false)
  const [elegidos, setElegidos] = useState(new Set())
  const [contacto, setContacto] = useState(null)
  const [campana, setCampana] = useState(false)
  const hoy = hoyISO()

  const pacs = useVista('crm-pacientes', 'prp_pacientes', { sedeCol: 'sede_registro_id', filtros: { estado: ['activo', 'inactivo'] }, columnas: 'id,nombre_completo,numero_expediente,telefono_celular,email,fecha_nacimiento,sede_registro_id,estado,diabetes', limite: 6000 })
  const vis = useVista('crm-visitas', 'prp_seguimiento_clinico', { columnas: 'paciente_id,fecha,servicio,atendio,sede_id', orden: { columna: 'fecha_hora', asc: false }, limite: 15000 })
  const ven = useVista('crm-ventas', 'prp_ventas', { columnas: 'paciente_id,total,estado', filtros: { estado: ['cobrada', 'por_facturar', 'facturada'] }, limite: 15000 })
  const cont = useVista('crm-consent', 'prp_consentimientos_contacto_vigentes', { sedeCol: false, limite: 20000 })
  const segs = useVista('crm-segs', 'prp_seguimientos', { orden: { columna: 'created_at', asc: false }, limite: 3000 })
  const pd = useVista('crm-pd', 'prp_pie_diabetico_revisiones', { filtros: { revision_vencida: true }, limite: 2000 })
  const ort = useVista('crm-ort', 'prp_plantillas_seguimiento', { limite: 2000 })
  const planes = useVista('crm-planes', 'prp_planes_progreso', { filtros: { estado: 'abandonado' }, limite: 2000 })
  const camps = useVista('crm-camps', 'prp_campanas', { sedeCol: false, orden: { columna: 'created_at', asc: false }, limite: 100 })
  const nps = useVista('crm-nps', 'prp_nps_mensual', { orden: { columna: 'mes', asc: false }, limite: 12 })
  const enc = useVista('crm-enc', 'prp_encuestas', { orden: { columna: 'respondida_en', asc: false }, limite: 300 })

  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const vigentes = cont.data?.filas ?? []
  const modelo = useMemo(() => {
    const ult = {}
    for (const v of vis.data?.filas ?? []) if (!ult[v.paciente_id]) ult[v.paciente_id] = v   // ya vienen de la más reciente a la más antigua
    const valor = {}
    for (const v of ven.data?.filas ?? []) valor[v.paciente_id] = (valor[v.paciente_id] ?? 0) + Number(v.total || 0)
    const ultCont = {}
    for (const s of segs.data?.filas ?? []) if (s.contactado_en && !ultCont[s.paciente_id]) ultCont[s.paciente_id] = s
    const etiquetas = {}
    for (const x of planes.data?.filas ?? []) (etiquetas[x.paciente_id] ??= new Set()).add('Plan abandonado')
    for (const x of ort.data?.filas ?? []) if (x.revision_ajuste_pendiente || x.renovacion_disponible) (etiquetas[x.paciente_id] ??= new Set()).add('Plantillas')
    for (const x of pd.data?.filas ?? []) (etiquetas[x.paciente_id] ??= new Set()).add('Diabético')
    return (pacs.data?.filas ?? []).map(pa => {
      const u = ult[pa.id]
      const dias = diasSinVenir(u?.fecha, hoy)
      return { ...pa, ultima: u?.fecha ?? null, ultimoServicio: u?.servicio ?? null, atendio: u?.atendio ?? null, dias, valor: valor[pa.id] ?? 0, ultContacto: ultCont[pa.id] ?? null, etiquetas: [...(etiquetas[pa.id] ?? [])],
        consentPromos: ['whatsapp', 'correo', 'sms'].some(c => puedeContactar(vigentes, pa.id, 'comerciales', c)) }
    })
  }, [pacs.data, vis.data, ven.data, segs.data, planes.data, ort.data, pd.data, vigentes, hoy])

  const umbralN = Number(umbral)
  const inactivos = modelo.filter(x => esInactivo(x.dias, umbralN) && (!soloConsent || x.consentPromos))
  const activos12 = modelo.filter(x => x.dias !== null && x.dias < 365).length
  const reactivados = (segs.data?.filas ?? []).filter(s => s.motivo === 'inactivo' && s.estado === 'agendado').length
  const vencidas = useMemo(() => {
    const m = new Map(modelo.map(x => [x.id, x]))
    const filas = []
    for (const r of pd.data?.filas ?? []) if (m.get(r.paciente_id)) filas.push({ ...m.get(r.paciente_id), motivo: 'Pie diabético', detalle: `Revisión vencida hace ${r.dias_vencida} d`, sugerida: fecha(r.proxima_revision), claveFila: 'pd' + r.valoracion_id })
    for (const o of ort.data?.filas ?? []) if (m.get(o.paciente_id) && (o.revision_ajuste_pendiente || o.renovacion_disponible)) filas.push({ ...m.get(o.paciente_id), motivo: 'Plantillas ortopédicas', detalle: o.revision_ajuste_pendiente ? 'Revisión de ajuste pendiente' : 'Renovación disponible', sugerida: fecha(o.revision_ajuste_fecha ?? o.renovacion_desde), claveFila: 'ort' + o.orden_id })
    for (const pl of planes.data?.filas ?? []) if (m.get(pl.paciente_id)) filas.push({ ...m.get(pl.paciente_id), motivo: 'Plan abandonado', detalle: `${pl.nombre} (${pl.sesiones_realizadas}/${pl.sesiones_total})`, sugerida: fecha(pl.proxima_sesion), claveFila: 'pl' + pl.plan_id })
    return filas
  }, [modelo, pd.data, ort.data, planes.data])
  const cumples = modelo.filter(x => x.fecha_nacimiento && cumpleEnVentana(x.fecha_nacimiento, new Date(), Number(ventana)))
    .sort((a, b) => diasParaCumpleanos(a.fecha_nacimiento) - diasParaCumpleanos(b.fecha_nacimiento))
  const cumplesSemana = modelo.filter(x => x.fecha_nacimiento && cumpleEnVentana(x.fecha_nacimiento, new Date(), 7))

  const alternar = id => setElegidos(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const colBase = [
    { key: 'sel', label: '', sortable: false, exportar: false, render: x => <input type="checkbox" checked={elegidos.has(x.id)} onClick={e => e.stopPropagation()} onChange={() => alternar(x.id)} aria-label="Seleccionar" /> },
    { key: 'nombre_completo', label: 'Paciente', render: x => <Link to={`/pacientes/${x.id}`}>{x.nombre_completo}</Link> },
  ]
  const accion = { key: 'acc', label: 'Acciones', sortable: false, exportar: false, render: x => (
    <div style={{ display: 'flex', gap: 4 }}>
      {ligaWhatsApp(x.telefono_celular) && <a className="btn o sm" href={ligaWhatsApp(x.telefono_celular, '')} target="_blank" rel="noopener noreferrer" onClick={e => { e.stopPropagation(); setContacto({ pac: x, canal: 'whatsapp' }) }}><MessageCircle size={12} style={{ verticalAlign: -2 }} /> WhatsApp</a>}
      {x.telefono_celular && <a className="btn o sm" href={`tel:${x.telefono_celular}`} onClick={e => { e.stopPropagation(); setContacto({ pac: x, canal: 'telefono' }) }}><Phone size={12} style={{ verticalAlign: -2 }} /> Llamar</a>}
      {p['crm.editar'] && <button type="button" className="btn o sm" onClick={e => { e.stopPropagation(); setContacto({ pac: x, canal: 'whatsapp' }) }}>Registrar</button>}
    </div>) }
  const colsInact = [...colBase,
    { key: 'ultima', label: 'Última visita', render: x => fecha(x.ultima) }, { key: 'dias', label: 'Días sin venir', align: 'right' }, { key: 'ultimoServicio', label: 'Último servicio' }, { key: 'atendio', label: 'Atendió' },
    { key: 'valor', label: 'Valor histórico', align: 'right', render: x => moneda(x.valor) },
    { key: 'ultContacto', label: 'Último contacto', valor: x => x.ultContacto?.contactado_en ?? '', render: x => (x.ultContacto ? `${fecha(x.ultContacto.contactado_en)} · ${x.ultContacto.canal ?? ''}` : '—') },
    { key: 'etq', label: 'Segmento / etiquetas', valor: x => x.etiquetas.join(', '), render: x => x.etiquetas.map(e => <span key={e} className="bd m" style={{ marginRight: 4 }}>{e}</span>) },
    { key: 'consentPromos', label: 'Consent. promos', valor: x => (x.consentPromos ? 'Sí' : 'No'), render: x => (x.consentPromos ? <span className="bd v">Sí</span> : <span className="bd n">No</span>) }, accion]

  return (
    <div className="pagina">
      <PageHeader titulo="Seguimiento de pacientes (CRM)" subtitulo={`Pacientes › Seguimiento · ${sedes.length === 1 ? sedes[0].nombre : 'sedes del usuario'}`} />
      <div className="grid-kpis">
        <KPICard title="Pacientes activos" value={activos12} icon={Users} subtitle="visita en los últimos 12 meses" loading={pacs.isLoading || vis.isLoading} />
        <KPICard title={`Inactivos > ${Math.round(umbralN / 30)} meses`} value={inactivos.length} icon={UserX} color="var(--red)" subtitle={`${reactivados} reactivados (con cita agendada)`} loading={pacs.isLoading || vis.isLoading} onClick={() => setTab('inactivos')} activo={tab === 'inactivos'} />
        <KPICard title="Revisiones vencidas" value={vencidas.length} icon={CalendarClock} color="var(--gold)" subtitle={`${(pd.data?.filas ?? []).length} de pie diabético`} loading={pd.isLoading} onClick={() => setTab('vencidas')} activo={tab === 'vencidas'} />
        <KPICard title="Cumpleaños esta semana" value={cumplesSemana.length} icon={Cake} color="var(--accent2)" subtitle={`${cumplesSemana.filter(x => x.consentPromos).length} con consentimiento de promos`} loading={pacs.isLoading} onClick={() => setTab('cumples')} activo={tab === 'cumples'} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'inactivos', label: 'Inactivos' }, { id: 'vencidas', label: 'Revisiones vencidas' }, { id: 'cumples', label: 'Cumpleaños' }, { id: 'campanas', label: 'Campañas' }, { id: 'encuestas', label: 'Encuestas y NPS' }]} />

      {['inactivos', 'vencidas', 'cumples'].includes(tab) && (
        <div className="toolbar" style={{ marginBottom: 10 }}>
          {tab === 'inactivos' && <><select value={umbral} onChange={e => setUmbral(e.target.value)} aria-label="Inactivo desde"><option value="90">Inactivo desde: 3 meses</option><option value="180">6 meses</option><option value="365">12 meses</option></select>
            <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={soloConsent} onChange={e => setSoloConsent(e.target.checked)} /> Solo con consentimiento de contacto</label></>}
          {tab === 'cumples' && <select value={ventana} onChange={e => setVentana(e.target.value)}><option value="7">Próximos 7 días</option><option value="30">Próximos 30 días</option></select>}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{elegidos.size} seleccionados</span>
          {p['crm.editar'] && <button type="button" className="btn" disabled={!elegidos.size} onClick={() => setCampana(true)}>Crear campaña con selección</button>}
        </div>)}

      {tab === 'inactivos' && <DataTable columnas={colsInact} filas={inactivos} cargando={pacs.isLoading || vis.isLoading} error={pacs.error ? mensajeError(pacs.error) : vis.error ? mensajeError(vis.error) : null} exportarNombre="pacientes_inactivos"
        vacio={{ title: 'Sin pacientes inactivos', description: 'Nadie supera el umbral de días sin venir.' }} />}
      {tab === 'vencidas' && <DataTable columnas={[...colBase, { key: 'motivo', label: 'Motivo', filtro: true }, { key: 'detalle', label: 'Detalle' }, { key: 'sugerida', label: 'Fecha sugerida' }, { key: 'ultima', label: 'Última visita', render: x => fecha(x.ultima) }, { key: 'ultContacto', label: 'Último contacto', valor: x => x.ultContacto?.contactado_en ?? '', render: x => (x.ultContacto ? fecha(x.ultContacto.contactado_en) : '—') }, accion]} filas={vencidas} filaKey="claveFila" cargando={pd.isLoading} exportarNombre="revisiones_vencidas"
        vacio={{ title: 'Sin revisiones vencidas', description: 'No hay revisiones periódicas pendientes.' }} />}
      {tab === 'cumples' && <DataTable columnas={[...colBase, { key: 'fecha_nacimiento', label: 'Cumpleaños', render: x => { const d = diasParaCumpleanos(x.fecha_nacimiento); return `${fecha(x.fecha_nacimiento).slice(0, 5)} · ${d === 0 ? 'hoy' : `en ${d} d`}` } }, { key: 'consentPromos', label: 'Consent. promos', valor: x => (x.consentPromos ? 'Sí' : 'No'), render: x => (x.consentPromos ? <span className="bd v">Sí</span> : <span className="bd n">No: no se envía promoción</span>) }, accion]} filas={cumples} cargando={pacs.isLoading} exportarNombre="cumpleanos"
        vacio={{ title: 'Sin cumpleaños', description: 'Nadie cumple años en esa ventana.' }} />}
      {tab === 'campanas' && <Campanas q={camps} onNueva={() => setCampana(true)} puede={p['crm.editar']} />}
      {tab === 'encuestas' && <Encuestas nps={nps} enc={enc} modelo={modelo} puede={p['crm.editar']} />}

      {contacto && <ModalContacto pac={contacto.pac} canal={contacto.canal} perfil={perfil} onCerrar={() => setContacto(null)} />}
      {campana && <ModalCampana ids={[...elegidos]} vigentes={vigentes} modelo={modelo} rol={rol} perfil={perfil} onCerrar={() => setCampana(false)} />}
    </div>
  )
}

function ModalContacto({ pac, canal, perfil, onCerrar }) {
  const { ejecutar, ocupado } = useAccion()
  const [f, setF] = useState({ motivo: 'inactivo', canal, estado: 'contactado', resultado: '', detalle: '', fecha_compromiso: '' })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const guardar = async () => {
    const r = await ejecutar(() => insertar('seguimientos_paciente', limpiar({ paciente_id: pac.id, sede_id: pac.sede_registro_id, motivo: f.motivo, canal: f.canal, estado: f.estado, resultado: f.resultado, detalle: f.detalle, fecha_compromiso: f.fecha_compromiso, responsable_id: perfil.id, creado_por: perfil.id, contactado_en: f.estado === 'pendiente' ? null : new Date().toISOString() })), { ok: 'Contacto registrado', invalidar: ['clinico'] })
    if (r) onCerrar()
  }
  return (
    <Modal open onClose={onCerrar} title={`Registrar contacto · ${pac.nombre_completo}`} size="sm" footer={<><button type="button" className="btn o" onClick={onCerrar}>Cancelar</button><button type="button" className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
      <Aviso tipo="sim">El mensaje se envía por tu cuenta (wa.me / llamada); aquí solo queda el registro. No hay proveedor de WhatsApp conectado.</Aviso>
      <FormField label="Motivo" as="select" options={MOTIVOS} value={f.motivo} onChange={set('motivo')} />
      <FormField label="Canal" as="select" options={CANALES} value={f.canal} onChange={set('canal')} />
      <FormField label="Resultado" as="select" options={[['pendiente', 'Pendiente de contactar'], ['contactado', 'Contactado'], ['agendado', 'Agendó cita'], ['sin_respuesta', 'Sin respuesta'], ['descartado', 'Descartado']].map(([value, label]) => ({ value, label }))} value={f.estado} onChange={set('estado')} />
      <FormField label="Comentario" as="textarea" value={f.resultado} onChange={set('resultado')} />
      <FormField label="Fecha compromiso (seguimiento)" type="date" value={f.fecha_compromiso} onChange={set('fecha_compromiso')} />
    </Modal>
  )
}

function Campanas({ q, onNueva, puede }) {
  const { ejecutar, ocupado } = useAccion()
  const { perfil, rol } = useApp()
  const aprobar = c => ejecutar(() => actualizar('campanas', c.id, { estado: 'programada', aprobada_por: perfil.id, aprobada_en: new Date().toISOString() }), { ok: 'Campaña programada (el envío real requiere proveedor de mensajes)', invalidar: ['clinico'] })
  const cols = [
    { key: 'nombre', label: 'Campaña' }, { key: 'canal', label: 'Canal' }, { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} /> }, { key: 'programada_para', label: 'Programada', render: c => fechaHora(c.programada_para) },
    { key: 'destinatarios', label: 'Destinatarios', align: 'right' }, { key: 'excluidos_sin_consentimiento', label: 'Excluidos sin consentimiento', align: 'right' },
    { key: 'enviados', label: 'Enviados', align: 'right' }, { key: 'respondieron', label: 'Respondieron', align: 'right' }, { key: 'citas_generadas', label: 'Citas', align: 'right' }, { key: 'ingreso_atribuido', label: 'Ingreso', align: 'right', render: c => moneda(c.ingreso_atribuido) },
    { key: 'acc', label: '', sortable: false, exportar: false, render: c => rol === 'administrador' && c.estado === 'borrador' && <button type="button" className="btn sm" disabled={ocupado} onClick={() => aprobar(c)}>Aprobar y programar</button> },
  ]
  return (
    <>
      <AvisoSimulado>Envío de campañas en modo simulado: no hay proveedor de WhatsApp/correo. Se arman destinatarios, consentimientos y resultados; el envío real queda pendiente de la función de servidor.</AvisoSimulado>
      {puede && <div style={{ marginBottom: 8 }}><button type="button" className="btn" onClick={onNueva}>+ Nueva campaña</button></div>}
      <DataTable columnas={cols} filas={q.data?.filas ?? []} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} exportarNombre="campanas" vacio={{ title: 'Sin campañas', description: 'Crea una campaña desde la lista de inactivos o cumpleaños.' }} />
    </>
  )
}

function Encuestas({ nps, enc, modelo, puede }) {
  const { ejecutar } = useAccion()
  const { perfil } = useApp()
  const pn = Object.fromEntries(modelo.map(x => [x.id, x.nombre_completo]))
  const u = (nps.data?.filas ?? [])[0]
  const filas = (enc.data?.filas ?? []).filter(e => e.respondida_en)
  return (
    <>
      <div className="grid-kpis">
        <KPICard title="NPS del último mes con datos" value={u?.nps != null ? (u.nps > 0 ? `+${u.nps}` : u.nps) : '—'} icon={Users} color="var(--green)" subtitle={u ? `${u.respuestas} respuestas · ${fecha(u.mes)}` : 'sin respuestas'} loading={nps.isLoading} />
        <KPICard title="Promotores / detractores" value={u ? `${u.promotores} / ${u.detractores}` : '—'} icon={Users} color="var(--accent2)" loading={nps.isLoading} />
        <KPICard title="Requieren atención (≤ 6)" value={filas.filter(e => e.requiere_atencion && !e.atendida_en).length} icon={UserX} color="var(--red)" loading={enc.isLoading} subtitle="No crean queja automática (P-054)" />
      </div>
      <DataTable columnas={[{ key: 'paciente', label: 'Paciente', valor: e => pn[e.paciente_id] ?? '—' }, { key: 'tipo', label: 'Tipo', render: e => (e.tipo === 'nps_post_visita' ? 'NPS post-visita' : 'Satisfacción de queja') }, { key: 'respondida_en', label: 'Respondida', render: e => fechaHora(e.respondida_en) },
        { key: 'calificacion', label: 'Calificación', align: 'right', render: e => <span className={`bd ${e.calificacion <= 6 && e.tipo === 'nps_post_visita' ? 'r' : 'v'}`}>{e.calificacion}</span> }, { key: 'comentario', label: 'Comentario' },
        { key: 'acc', label: '', sortable: false, exportar: false, render: e => puede && e.requiere_atencion && !e.atendida_en && <button type="button" className="btn o sm" onClick={() => ejecutar(() => actualizar('encuestas', e.id, { atendida_por: perfil.id, atendida_en: new Date().toISOString() }), { ok: 'Marcada como atendida', invalidar: ['clinico'] })}>Marcar atendida</button> }]}
        filas={filas} cargando={enc.isLoading} error={enc.error ? mensajeError(enc.error) : null} vacio={{ title: 'Sin respuestas', description: 'Aún no hay encuestas respondidas.' }} />
    </>
  )
}

function ModalCampana({ ids, vigentes, modelo, rol, perfil, onCerrar }) {
  const { ejecutar, ocupado } = useAccion()
  const plantillas = useVista('plantillas-camp', 'plantillas_documento', { sedeCol: false, filtros: { tipo: 'mensaje_campana', estado: 'activa' } })
  const ofertas = useVista('ofertas-camp', 'prp_ofertas', { sedeCol: false, columnas: 'id,nombre', limite: 200 })
  const [f, setF] = useState({ nombre: '', canal: 'whatsapp_correo', plantilla_id: '', oferta_id: '', mensaje: 'Hola {{nombre}}, en la clínica te extrañamos. Agenda tu revisión aquí: {{liga_cita}}', programada_para: '' })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const seg = segmentarDestinatarios(ids, vigentes, CANALES_CAMPANA[f.canal])
  const pa = modelo.find(x => x.id === ids[0])
  const guardar = async () => {
    const r = await ejecutar(async () => {
      const c = await insertar('campanas', limpiar({ nombre: f.nombre, segmento: { tipo: 'seleccion_manual', total: ids.length }, canal: f.canal, plantilla_id: f.plantilla_id, oferta_id: f.oferta_id, mensaje: f.mensaje, programada_para: f.programada_para ? new Date(f.programada_para).toISOString() : null, creada_por: perfil.id }))
      if (c.error) return c
      const d = await rpc('campana_agregar_destinatarios', { p_campana: c.data[0].id, p_pacientes: ids })
      if (d.error) return d
      toast(`Destinatarios: ${d.data?.incluidos ?? seg.incluidos.length} · excluidos sin consentimiento: ${d.data?.excluidos ?? seg.excluidos.length}`, { duration: 6000 })
      return c
    }, { ok: 'Campaña guardada como borrador', invalidar: ['clinico'] })
    if (r) onCerrar()
  }
  return (
    <Modal open onClose={onCerrar} title="Nueva campaña de recontacto" size="wide" footer={<><button type="button" className="btn o" onClick={onCerrar}>Cancelar</button><button type="button" className="btn" disabled={!f.nombre.trim() || !f.mensaje.trim() || ocupado} onClick={guardar}>Guardar borrador</button></>}>
      <Aviso>Solo se envía a pacientes con consentimiento de comunicaciones comerciales vigente; los demás se excluyen automáticamente (P-148). {rol !== 'administrador' && 'Solo Administración aprueba y programa el envío (P-053).'}</Aviso>
      <div className="row">
        <FormField label="Nombre" required value={f.nombre} onChange={set('nombre')} />
        <FormField label="Canal" required as="select" options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'correo', label: 'Correo' }, { value: 'sms', label: 'SMS' }, { value: 'whatsapp_correo', label: 'WhatsApp + correo' }]} value={f.canal} onChange={set('canal')} />
        <FormField label="Plantilla de mensaje" as="select" options={(plantillas.data?.filas ?? []).map(x => ({ value: x.id, label: x.nombre }))} value={f.plantilla_id} onChange={e => { const x = (plantillas.data?.filas ?? []).find(y => y.id === e.target.value); setF(s => ({ ...s, plantilla_id: e.target.value, mensaje: x?.contenido ?? s.mensaje })) }} />
        <FormField label="Oferta / promoción" as="select" options={(ofertas.data?.filas ?? []).map(x => ({ value: x.id, label: x.nombre }))} value={f.oferta_id} onChange={set('oferta_id')} />
        <FormField label="Programar envío" type="datetime-local" value={f.programada_para} onChange={set('programada_para')} />
      </div>
      <FormField label="Mensaje" required as="textarea" rows={4} value={f.mensaje} onChange={set('mensaje')} hint="Variables: {{nombre}}, {{liga_cita}}" />
      <div className="card" style={{ background: 'var(--accent-light)', fontSize: 13 }}><b>Vista previa:</b> {vistaPreviaMensaje(f.mensaje, { nombre: pa?.nombre_completo?.split(' ')[0] ?? 'Paciente', liga_cita: 'https://…/cita' })}</div>
      <div style={{ fontSize: 13, marginTop: 8 }}>Seleccionados: <b>{ids.length}</b> · se enviarían a <b>{seg.incluidos.length}</b> · excluidos sin consentimiento: <b>{seg.excluidos.length}</b></div>
    </Modal>
  )
}
