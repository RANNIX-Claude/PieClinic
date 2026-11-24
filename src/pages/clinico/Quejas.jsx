import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquareWarning, CalendarDays, Timer, Smile } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { insertar, actualizar, rpc } from '../../lib/api'
import { fecha, fechaHora, hoyISO } from '../../lib/formato'
import { TIPOS_QUEJA, CANALES_QUEJA, COMPENSACIONES, GRAVEDADES, ESTADOS_QUEJA, etiquetaDe } from '../../lib/clinico/catalogos'
import { Aviso, Seccion, PacienteBuscador, useVista, useAccion, mensajeError, num, limpiar } from './componentes/comunes'

export default function Quejas() {
  const { sedes, perfil, rol } = useApp()
  const p = usePermisos('quejas.registrar', 'quejas.resolver')
  const [f, setF] = useState({ mes: hoyISO().slice(0, 7), podologo: '', tipo: '', gravedad: '', estado: 'abiertas' })
  const [sel, setSel] = useState(null)
  const [nueva, setNueva] = useState(false)
  const qs = useVista('quejas', 'quejas', { orden: { columna: 'fecha_hora', asc: false }, limite: 1000 })
  const res = useVista('quejas-res', 'prp_quejas_resumen', { limite: 1000 })
  const sat = useVista('quejas-sat', 'prp_satisfaccion_quejas', { orden: { columna: 'mes', asc: false }, limite: 24 })
  const pacs = useVista('pac-quejas', 'prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo,numero_expediente', limite: 4000 })
  const pers = useVista('perfiles-quejas', 'perfiles', { sedeCol: false, columnas: 'id,nombre,apellidos,rol', limite: 300 })
  const cons = useVista('consultas-quejas', 'consultas', { sedeCol: false, columnas: 'id,folio,fecha_hora', orden: { columna: 'fecha_hora', asc: false }, limite: 1500 }, { enabled: rol !== 'recepcion' })
  const pn = Object.fromEntries((pacs.data?.filas ?? []).map(x => [x.id, x]))
  const pf = Object.fromEntries((pers.data?.filas ?? []).map(x => [x.id, [x.nombre, x.apellidos].filter(Boolean).join(' ')]))
  const cn = Object.fromEntries((cons.data?.filas ?? []).map(x => [x.id, x]))
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const rm = Object.fromEntries((res.data?.filas ?? []).map(x => [x.id, x]))
  const todas = (qs.data?.filas ?? []).map(q => ({ ...q, ...rm[q.id] }))
  const abierta = q => !['resuelta', 'cerrada'].includes(q.estado)
  const filas = useMemo(() => todas.filter(q => (!f.mes || (q.fecha_hora ?? '').slice(0, 7) === f.mes || (f.estado === 'abiertas' && abierta(q))) && (!f.podologo || q.podologo_id === f.podologo) && (!f.tipo || q.tipo === f.tipo) && (!f.gravedad || q.gravedad === f.gravedad)
    && (f.estado === 'abiertas' ? abierta(q) : f.estado === 'todas' ? true : q.estado === f.estado)), [todas, f]) // eslint-disable-line
  const abiertas = todas.filter(abierta)
  const mes = todas.filter(q => (q.fecha_hora ?? '').slice(0, 7) === f.mes)
  const cerradas = todas.filter(q => !abierta(q) && q.dias_abiertos != null)
  const tmr = cerradas.length ? (cerradas.reduce((a, q) => a + Number(q.dias_abiertos), 0) / cerradas.length).toFixed(1) : '—'
  const satMes = (sat.data?.filas ?? [])[0]

  const cols = [
    { key: 'folio', label: 'Folio', render: q => <b>{q.folio}</b> }, { key: 'fecha_hora', label: 'Fecha', render: q => fecha(q.fecha_hora) },
    { key: 'pac', label: 'Paciente', valor: q => pn[q.paciente_id]?.nombre_completo ?? '—' },
    { key: 'ses', label: 'Sesión ligada', valor: q => (q.consulta_id ? `${cn[q.consulta_id]?.folio ?? ''} · ${fecha(cn[q.consulta_id]?.fecha_hora)}` : '—') },
    { key: 'pod', label: 'Podólogo', valor: q => pf[q.podologo_id] ?? '—' }, { key: 'sede', label: 'Sede', valor: q => sn[q.sede_id] ?? '', filtro: true },
    { key: 'tipo', label: 'Tipo', valor: q => etiquetaDe(TIPOS_QUEJA, q.tipo), filtro: true }, { key: 'clase', label: 'Clase', valor: q => (q.clase === 'evento_adverso_clinico' ? 'Evento adverso' : 'Administrativa') },
    { key: 'gravedad', label: 'Gravedad', render: q => <StatusBadge estado={q.gravedad} variante={q.gravedad === 'alta' ? 'r' : q.gravedad === 'media' ? 'a' : 'n'} /> },
    { key: 'estado', label: 'Estado', render: q => <StatusBadge estado={q.estado} variante={q.estado === 'escalada' ? 'r' : q.estado === 'nueva' ? 'b' : undefined} />, valor: q => q.estado },
    { key: 'resp', label: 'Responsable', valor: q => pf[q.responsable_id] ?? 'Sin asignar' },
    { key: 'dias_abiertos', label: 'Días', align: 'right', render: q => <>{q.dias_abiertos ?? '—'}{q.fuera_de_meta && <span className="bd r" style={{ marginLeft: 4 }}>fuera de meta</span>}</> },
    { key: 'resolucion', label: 'Resolución', render: q => q.resolucion ?? '—' },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Quejas e incidencias" subtitulo="Clínica › Quejas e incidencias · administrativas y eventos adversos clínicos; meta de resolución 3 días (P-020)"
        acciones={p['quejas.registrar'] && <button type="button" className="btn" onClick={() => setNueva(true)}>+ Registrar queja o incidencia</button>} />
      <div className="grid-kpis">
        <KPICard title="Quejas abiertas" value={abiertas.length} icon={MessageSquareWarning} color="var(--red)" subtitle={`${abiertas.filter(q => q.fuera_de_meta).length} fuera de meta`} loading={qs.isLoading} onClick={() => setF(s => ({ ...s, estado: 'abiertas' }))} activo={f.estado === 'abiertas'} />
        <KPICard title="Del mes" value={mes.length} icon={CalendarDays} loading={qs.isLoading} />
        <KPICard title="Tiempo medio de resolución" value={tmr === '—' ? tmr : `${tmr} días`} icon={Timer} color="var(--accent2)" subtitle="meta 3 días" loading={qs.isLoading} />
        <KPICard title="Satisfacción tras resolución" value={satMes?.promedio != null ? `${satMes.promedio} / 5` : '—'} icon={Smile} color="var(--green)" subtitle={satMes ? `${satMes.respuestas} encuestas` : 'sin encuestas'} loading={sat.isLoading} />
      </div>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <input type="month" value={f.mes} onChange={e => setF(s => ({ ...s, mes: e.target.value }))} aria-label="Mes" />
        <select value={f.podologo} onChange={e => setF(s => ({ ...s, podologo: e.target.value }))}><option value="">Podólogo: todos</option>{(pers.data?.filas ?? []).filter(x => x.rol === 'podologo').map(x => <option key={x.id} value={x.id}>{pf[x.id]}</option>)}</select>
        <select value={f.tipo} onChange={e => setF(s => ({ ...s, tipo: e.target.value }))}><option value="">Tipo: todos</option>{TIPOS_QUEJA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        <select value={f.gravedad} onChange={e => setF(s => ({ ...s, gravedad: e.target.value }))}><option value="">Gravedad: todas</option>{GRAVEDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}</select>
        <select value={f.estado} onChange={e => setF(s => ({ ...s, estado: e.target.value }))}><option value="abiertas">Estado: abiertas</option><option value="todas">Todas</option>{ESTADOS_QUEJA.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}</select>
      </div>
      <DataTable columnas={cols} filas={filas} cargando={qs.isLoading} error={qs.error ? mensajeError(qs.error) : null} onFila={q => setSel(q.id)} exportarNombre="quejas" placeholderBusqueda="Buscar folio / paciente…"
        vacio={{ title: 'Sin quejas', description: 'No hay quejas con esos filtros.' }} />
      {sel && <DetalleQueja key={sel} queja={todas.find(q => q.id === sel)} pn={pn} pf={pf} cn={cn} sn={sn} responsables={(pers.data?.filas ?? []).filter(x => ['administrador', 'podologo'].includes(x.rol))} p={p} perfil={perfil} onCerrar={() => setSel(null)} />}
      <PorPodologo todas={mes} pf={pf} sn={sn} />
      {nueva && <NuevaQueja onCerrar={() => setNueva(false)} sedes={sedes} perfil={perfil} podologos={(pers.data?.filas ?? []).filter(x => x.rol === 'podologo')} responsables={(pers.data?.filas ?? []).filter(x => ['administrador', 'podologo'].includes(x.rol))} pf={pf} />}
    </div>
  )
}

function PorPodologo({ todas, pf, sn }) {
  const por = (clave, nombre) => Object.entries(todas.reduce((a, q) => { const k = q[clave] ?? '—'; a[k] = (a[k] ?? 0) + 1; return a }, {})).map(([k, n]) => ({ k, n, nombre: nombre(k) })).sort((a, b) => b.n - a.n)
  return (
    <div className="grid2" style={{ marginTop: 14 }}>
      <Seccion titulo="Quejas por podólogo (mes)"><table><thead><tr><th>Podólogo</th><th className="num">Quejas</th></tr></thead><tbody>{por('podologo_id', k => pf[k] ?? 'Sin podólogo').map(x => <tr key={x.k}><td>{x.nombre}</td><td className="num">{x.n}</td></tr>)}{!todas.length && <tr><td colSpan={2} style={{ color: 'var(--muted)' }}>Sin datos.</td></tr>}</tbody></table></Seccion>
      <Seccion titulo="Por sede (mes)"><table><thead><tr><th>Sede</th><th className="num">Quejas</th></tr></thead><tbody>{por('sede_id', k => sn[k] ?? '—').map(x => <tr key={x.k}><td>{x.nombre}</td><td className="num">{x.n}</td></tr>)}{!todas.length && <tr><td colSpan={2} style={{ color: 'var(--muted)' }}>Sin datos.</td></tr>}</tbody></table></Seccion>
    </div>
  )
}

function DetalleQueja({ queja: q, pn, pf, cn, sn, responsables, p, perfil, onCerrar }) {
  const { ejecutar, ocupado } = useAccion()
  const [d, setD] = useState({ responsable_id: q?.responsable_id ?? '', fecha_compromiso: q?.fecha_compromiso ?? '', resolucion: q?.resolucion ?? '', compensacion_tipo: q?.compensacion_tipo ?? 'ninguna', compensacion_monto: q?.compensacion_monto ?? '', estado: q?.estado ?? 'nueva' })
  if (!q) return null
  const editable = p['quejas.registrar'] || p['quejas.resolver']
  const costo = ['consulta_sin_costo', 'reembolso', 'descuento'].includes(d.compensacion_tipo)
  const guardar = (extra = {}) => ejecutar(() => actualizar('quejas', q.id, limpiar({ responsable_id: d.responsable_id, fecha_compromiso: d.fecha_compromiso, resolucion: d.resolucion, compensacion_tipo: d.compensacion_tipo, compensacion_monto: num(d.compensacion_monto), estado: d.estado, ...(costo && !p['quejas.resolver'] ? { compensacion_propuesta_por: perfil.id } : {}), ...extra })), { ok: 'Queja actualizada', invalidar: ['clinico'] })
  const enviarEncuesta = async () => {
    const r = await ejecutar(() => rpc('encuesta_crear', { p_tipo: 'satisfaccion_queja', p_paciente: q.paciente_id, p_queja: q.id, p_sede: q.sede_id }), { ok: null, invalidar: ['clinico'] })
    if (r) toast.success('Encuesta creada. El envío al paciente requiere el proveedor de mensajes (aún sin configurar).', { duration: 7000 })
  }
  return (
    <Seccion titulo={`Detalle ${q.folio} · ${etiquetaDe(TIPOS_QUEJA, q.tipo)}`} acciones={<><StatusBadge estado={q.estado} /><button type="button" className="btn o sm" onClick={onCerrar}>Cerrar</button></>}>
      <div className="grid2">
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div><b>Registró / canal:</b> {pf[q.registrada_por] ?? '—'} · {etiquetaDe(CANALES_QUEJA, q.canal)}</div><div><b>Fecha y hora:</b> {fechaHora(q.fecha_hora)}</div>
          <div><b>Gravedad:</b> {q.gravedad} · <b>Clase:</b> {q.clase === 'evento_adverso_clinico' ? 'Evento adverso clínico' : 'Administrativa'}</div>
          <div><b>Paciente:</b> {q.paciente_id ? <Link to={`/pacientes/${q.paciente_id}`}>{pn[q.paciente_id]?.nombre_completo} ({pn[q.paciente_id]?.numero_expediente})</Link> : '—'}</div>
          <div><b>Sesión ligada:</b> {q.consulta_id ? <Link to={`/consultas/${q.consulta_id}`}>{cn[q.consulta_id]?.folio}</Link> : '—'} · <b>Podólogo:</b> {pf[q.podologo_id] ?? '—'} · <b>Sede:</b> {sn[q.sede_id]}</div>
          <div style={{ marginTop: 6 }}><b>Descripción:</b> {q.descripcion}</div>
          {q.lote_esterilizacion_id && <div><b>Lote de esterilización ligado:</b> {q.lote_esterilizacion_id}</div>}
          {q.compensacion_autorizada_por && <div><b>Compensación autorizada por:</b> {pf[q.compensacion_autorizada_por]}</div>}
        </div>
        <div>
          <fieldset disabled={!editable || ['cerrada'].includes(q.estado)} style={{ border: 0, padding: 0 }}>
            <div className="row">
              <FormField label="Responsable de seguimiento" as="select" options={responsables.map(r => ({ value: r.id, label: pf[r.id] }))} value={d.responsable_id} onChange={e => setD(s => ({ ...s, responsable_id: e.target.value }))} />
              <FormField label="Fecha compromiso" type="date" value={d.fecha_compromiso} onChange={e => setD(s => ({ ...s, fecha_compromiso: e.target.value }))} />
              <FormField label="Estado" as="select" options={ESTADOS_QUEJA.map(e => ({ value: e, label: e.replace('_', ' ') }))} value={d.estado} onChange={e => setD(s => ({ ...s, estado: e.target.value }))} />
            </div>
            <FormField label="Resolución / acción correctiva" as="textarea" value={d.resolucion} onChange={e => setD(s => ({ ...s, resolucion: e.target.value }))} />
            <div className="row">
              <FormField label="Compensación" as="select" options={COMPENSACIONES} value={d.compensacion_tipo} onChange={e => setD(s => ({ ...s, compensacion_tipo: e.target.value }))} />
              {['reembolso', 'descuento'].includes(d.compensacion_tipo) && <FormField label="Monto" type="number" step="0.01" min="0" value={d.compensacion_monto} onChange={e => setD(s => ({ ...s, compensacion_monto: e.target.value }))} />}
            </div>
          </fieldset>
          {costo && !q.compensacion_autorizada_por && <Aviso>La compensación con costo la autoriza Administración (P-022).{!p['quejas.resolver'] && ' Tu propuesta queda registrada.'}</Aviso>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editable && <button type="button" className="btn" disabled={ocupado} onClick={() => guardar()}>Guardar</button>}
            {p['quejas.resolver'] && costo && !q.compensacion_autorizada_por && <button type="button" className="btn o" disabled={ocupado} onClick={() => guardar({ compensacion_autorizada_por: perfil.id })}>Autorizar compensación</button>}
            {p['quejas.resolver'] && !['resuelta', 'cerrada'].includes(q.estado) && <button type="button" className="btn green" disabled={ocupado || !d.resolucion.trim()} onClick={() => guardar({ estado: 'resuelta' })}>Marcar resuelta</button>}
            {p['quejas.resolver'] && q.estado === 'resuelta' && <button type="button" className="btn o" disabled={ocupado} onClick={() => guardar({ estado: 'cerrada', cerrada_en: new Date().toISOString() })}>Cerrar</button>}
            {editable && <button type="button" className="btn o" disabled={ocupado} onClick={() => guardar({ paciente_notificado_en: new Date().toISOString() })} title="Registra que se avisó al paciente (el envío automático requiere proveedor de mensajes)">Registrar notificación al paciente</button>}
            {editable && q.paciente_id && <button type="button" className="btn o" disabled={ocupado} onClick={enviarEncuesta}>Crear encuesta de satisfacción</button>}
          </div>
        </div>
      </div>
    </Seccion>
  )
}

function NuevaQueja({ onCerrar, sedes, perfil, podologos, responsables, pf }) {
  const { ejecutar, ocupado } = useAccion()
  const [pac, setPac] = useState(null)
  const [f, setF] = useState({ sede_id: sedes.length === 1 ? sedes[0].id : '', canal: 'llamada', clase: 'administrativa', tipo: 'otro', gravedad: 'media', descripcion: '', podologo_id: '', consulta_id: '', responsable_id: '', fecha_compromiso: '' })
  const cons = useVista('consultas-pac-' + pac?.id, 'consultas', { sedeCol: false, filtros: { paciente_id: pac?.id }, columnas: 'id,folio,fecha_hora,podologo_id,sede_id', orden: { columna: 'fecha_hora', asc: false }, limite: 30 }, { enabled: !!pac })
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const adverso = f.clase === 'evento_adverso_clinico'
  const listo = f.sede_id && f.descripcion.trim().length >= 5 && (!adverso || (f.consulta_id && pac))
  async function guardar() {
    const r = await ejecutar(() => insertar('quejas', limpiar({ ...f, paciente_id: pac?.id ?? null, registrada_por: perfil.id, fecha_hora: new Date().toISOString() })), { ok: 'Queja registrada', invalidar: ['clinico'] })
    if (r) onCerrar()
  }
  return (
    <Modal open onClose={onCerrar} title="Registrar queja o incidencia" size="wide" footer={<><button type="button" className="btn o" onClick={onCerrar}>Cancelar</button><button type="button" className="btn" disabled={!listo || ocupado} onClick={guardar}>Registrar</button></>}>
      <PacienteBuscador seleccionado={pac} onElegir={setPac} etiqueta="Paciente (opcional salvo evento adverso)" />
      <div className="row">
        <FormField label="Clase" as="select" options={[{ value: 'administrativa', label: 'Administrativa (cobro, espera…)' }, { value: 'evento_adverso_clinico', label: 'Evento adverso clínico' }]} value={f.clase} onChange={set('clase')} />
        <FormField label="Tipo" required as="select" options={TIPOS_QUEJA} value={f.tipo} onChange={set('tipo')} />
        <FormField label="Gravedad" required as="select" options={GRAVEDADES} value={f.gravedad} onChange={set('gravedad')} />
        <FormField label="Canal" required as="select" options={CANALES_QUEJA} value={f.canal} onChange={set('canal')} />
      </div>
      <div className="row">
        <FormField label="Sede" required as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id} onChange={set('sede_id')} />
        <FormField label={adverso ? 'Sesión ligada (obligatoria)' : 'Sesión ligada'} required={adverso} as="select" options={(cons.data?.filas ?? []).map(c => ({ value: c.id, label: `${c.folio} · ${fecha(c.fecha_hora)}` }))} value={f.consulta_id}
          onChange={e => { const c = (cons.data?.filas ?? []).find(x => x.id === e.target.value); setF(s => ({ ...s, consulta_id: e.target.value, podologo_id: c?.podologo_id ?? s.podologo_id, sede_id: c?.sede_id ?? s.sede_id })) }} />
        <FormField label="Podólogo señalado" as="select" options={podologos.map(x => ({ value: x.id, label: pf[x.id] }))} value={f.podologo_id} onChange={set('podologo_id')} />
      </div>
      <FormField label="Descripción de la queja" required as="textarea" value={f.descripcion} onChange={set('descripcion')} hint="Mínimo 5 caracteres." />
      <div className="row">
        <FormField label="Responsable de seguimiento" as="select" options={responsables.map(x => ({ value: x.id, label: pf[x.id] }))} value={f.responsable_id} onChange={set('responsable_id')} />
        <FormField label="Fecha compromiso" type="date" value={f.fecha_compromiso} onChange={set('fecha_compromiso')} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>La encuesta con nota baja no crea quejas automáticamente: solo cuentan las registradas aquí (P-021). El podólogo señalado solo es notificado; no resuelve.</div>
    </Modal>
  )
}
