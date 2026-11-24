import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Flame, CheckCircle2, XCircle, Package } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { leer, insertar, actualizar, rpc } from '../../lib/api'
import { fecha, fechaHora, hoyISO, hora } from '../../lib/formato'
import { bitacoraVer } from '../../lib/bitacora'
import { estadoLoteSugerido, esterilHastaSugerido, CICLOS, biologicoVencidoSinResultado } from '../../lib/clinico/esterilizacion'
import { Aviso, Seccion, useVista, useAccion, mensajeError, num } from './componentes/comunes'

const ESTADOS = ['registrado', 'liberado_condicionado', 'liberado', 'bloqueado', 'rechazado']
const BIO = [{ value: 'pendiente', label: 'Pendiente (24 h)' }, { value: 'negativo', label: 'Negativo' }, { value: 'positivo', label: 'Positivo' }, { value: 'no_aplica', label: 'No aplica' }]
const QUIM = [{ value: 'viro', label: 'Viró' }, { value: 'no_viro', label: 'No viró' }]

export default function Esterilizacion() {
  const { sedes, sedeActivaId, perfil } = useApp()
  const p = usePermisos('esterilizacion.operar', 'esterilizacion.liberar')
  const { ejecutar, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const [f, setF] = useState({ mes: hoyISO().slice(0, 7), autoclave: '', estado: '' })
  const [sel, setSel] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const lotes = useVista('est-lotes', 'prp_esterilizacion_lotes', { orden: { columna: 'fecha_hora', asc: false }, limite: 1000 })
  const kitsRes = useVista('est-kits-res', 'prp_kits_resumen', {})
  const kits = useVista('est-kits', 'kits_instrumental', { filtros: { activo: true }, orden: { columna: 'codigo' }, limite: 500 })
  const auto = useVista('est-autoclaves', 'autoclaves', { filtros: { activa: true }, limite: 100 })
  const lk = useVista('est-lote-kits', 'lote_kits', { sedeCol: false, limite: 3000 })
  const resp = useVista('est-responsables', 'perfiles', { sedeCol: false, columnas: 'id,nombre,apellidos', limite: 300 })
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const rn = Object.fromEntries((resp.data?.filas ?? []).map(r => [r.id, [r.nombre, r.apellidos].filter(Boolean).join(' ')]))
  const km = Object.fromEntries((kits.data?.filas ?? []).map(k => [k.id, k]))
  const kitsDeLote = id => (lk.data?.filas ?? []).filter(x => x.lote_id === id).map(x => km[x.kit_id]).filter(Boolean)

  const filas = useMemo(() => (lotes.data?.filas ?? []).filter(l => (!f.mes || (l.fecha_hora ?? '').slice(0, 7) === f.mes) && (!f.autoclave || l.autoclave_id === f.autoclave) && (!f.estado || l.estado === f.estado)), [lotes.data, f])
  const aprob = filas.filter(l => ['liberado', 'liberado_condicionado'].includes(l.estado)).length
  const rech = filas.filter(l => l.estado === 'rechazado').length
  const kr = (kitsRes.data?.filas ?? []).reduce((a, k) => ({ circ: a.circ + Number(k.en_circulacion || 0), por: a.por + Number(k.por_esterilizar || 0) }), { circ: 0, por: 0 })

  const cols = [
    { key: 'lote', label: 'Lote', render: l => <b>{l.lote}</b> }, { key: 'fecha_hora', label: 'Fecha y hora', render: l => fechaHora(l.fecha_hora) },
    { key: 'sede', label: 'Sede', valor: l => sn[l.sede_id] ?? '', filtro: true }, { key: 'autoclave', label: 'Autoclave' },
    { key: 'ciclo', label: 'Ciclo', render: l => CICLOS.find(c => c.value === l.ciclo)?.label ?? l.ciclo },
    { key: 'tpt', label: 'Temp. / presión / tiempo', sortable: false, valor: l => `${l.temperatura_c} °C · ${l.presion_bar} bar · ${l.tiempo_min} min` },
    { key: 'indicador_quimico', label: 'Indicador químico', render: l => (l.indicador_quimico === 'viro' ? 'Viró' : 'No viró') },
    { key: 'indicador_biologico', label: 'Indicador biológico', render: l => <>{l.indicador_biologico}{l.biologico_vencido_sin_resultado && <span className="bd r" style={{ marginLeft: 6 }}>sin resultado &gt; 24 h</span>}</> },
    { key: 'resp', label: 'Operó', valor: l => rn[l.responsable_id] ?? '' }, { key: 'kits', label: 'Kits', valor: l => kitsDeLote(l.lote_id).map(k => k.codigo).join(', ') || `(${l.kits})` },
    { key: 'esteril_hasta', label: 'Estéril hasta', render: l => <>{fecha(l.esteril_hasta)}{l.esterilidad_vencida && <span className="bd r" style={{ marginLeft: 6 }}>vencida</span>}</> },
    { key: 'pacientes_atendidos', label: 'Pacientes', align: 'right' }, { key: 'estado', label: 'Estado', render: l => <StatusBadge estado={l.estado} variante={l.estado === 'bloqueado' ? 'r' : undefined} /> },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Esterilización de instrumental" subtitulo="Clínica › Esterilización · lotes de autoclave y trazabilidad hacia las consultas"
        acciones={p['esterilizacion.operar'] && <button type="button" className="btn" onClick={() => setNuevo(true)}>+ Registrar lote de esterilización</button>} />
      <div className="grid-kpis">
        <KPICard title="Lotes del mes" value={filas.length} icon={Flame} subtitle={`${(auto.data?.filas ?? []).length} autoclaves`} loading={lotes.isLoading} />
        <KPICard title="Lotes aprobados" value={aprob} icon={CheckCircle2} color="var(--green)" subtitle={filas.length ? `${Math.round((aprob / filas.length) * 100)} %` : '—'} loading={lotes.isLoading} />
        <KPICard title="Rechazados / bloqueados" value={rech + filas.filter(l => l.estado === 'bloqueado').length} icon={XCircle} color="var(--red)" subtitle="indicador no virado o biológico positivo" loading={lotes.isLoading} />
        <KPICard title="Kits en circulación" value={kr.circ} icon={Package} color="var(--accent2)" subtitle={`${kr.por} por esterilizar`} loading={kitsRes.isLoading} />
      </div>
      {filas.some(l => l.estado === 'bloqueado') && <Aviso tipo="err">Hay lotes <b>bloqueados</b> por biológico positivo. Abre el lote para ver la lista de pacientes atendidos con ese instrumental.</Aviso>}
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <input type="month" value={f.mes} onChange={e => setF(s => ({ ...s, mes: e.target.value }))} aria-label="Mes" />
        <select value={f.autoclave} onChange={e => setF(s => ({ ...s, autoclave: e.target.value }))}><option value="">Autoclave: todas</option>{(auto.data?.filas ?? []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
        <select value={f.estado} onChange={e => setF(s => ({ ...s, estado: e.target.value }))}><option value="">Estado: todos</option>{ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}</select>
      </div>
      <DataTable columnas={cols} filas={filas} cargando={lotes.isLoading} error={lotes.error ? mensajeError(lotes.error) : null} filaKey="lote_id" onFila={l => { setSel(l.lote_id); bitacoraVer('lotes_esterilizacion', l.lote_id) }} exportarNombre="bitacora_esterilizacion"
        vacio={{ title: 'Sin lotes', description: 'No hay lotes de esterilización con esos filtros.' }} />
      {sel && <Detalle key={sel} loteId={sel} lote={(lotes.data?.filas ?? []).find(l => l.lote_id === sel)} kitsLote={kitsDeLote(sel)} rn={rn} sn={sn} p={p} ejecutar={ejecutar} ocupado={ocupado} confirmar={confirmar} onCerrar={() => setSel(null)} perfil={perfil} />}
      {nuevo && <NuevoLote kits={kits.data?.filas ?? []} autoclaves={auto.data?.filas ?? []} sedes={sedes} sedeInicial={sedeActivaId} perfil={perfil} onCerrar={() => setNuevo(false)} />}
      {dialogo}
    </div>
  )
}

function Detalle({ loteId, lote, kitsLote, rn, sn, p, ejecutar, ocupado, confirmar, onCerrar }) {
  const crudo = useQuery({ queryKey: ['clinico', 'lote-crudo', loteId], queryFn: async () => { const r = await leer('lotes_esterilizacion', { sedeCol: false, filtros: { id: loteId }, limite: 1 }); if (r.error) throw r.error; return r.data[0] } })
  const pac = useQuery({ queryKey: ['clinico', 'pacientes-por-lote', loteId], queryFn: async () => { const r = await rpc('pacientes_por_lote', { p_lote: loteId }); if (r.error) throw r.error; return r.data ?? [] } })
  const [bio, setBio] = useState(null)
  const [obs, setObs] = useState(null)
  const l = crudo.data
  if (crudo.isLoading || !l) return <Seccion titulo="Detalle del lote">Cargando…</Seccion>
  const guardar = cambios => ejecutar(() => actualizar('lotes_esterilizacion', loteId, cambios), { ok: 'Lote actualizado', invalidar: ['clinico'] })
  async function rechazar() {
    const motivo = await confirmar({ titulo: 'Rechazar lote', mensaje: 'Un lote rechazado no se reactiva; los kits regresan a «por esterilizar».', pedirMotivo: true, peligro: true, textoConfirmar: 'Rechazar' })
    if (motivo) guardar({ estado: 'rechazado', motivo_rechazo: motivo })
  }
  const sugerido = estadoLoteSugerido(l)
  const venc = biologicoVencidoSinResultado(l)
  return (
    <Seccion titulo={`Detalle del lote ${l.lote}`} acciones={<><StatusBadge estado={l.estado} variante={l.estado === 'bloqueado' ? 'r' : undefined} /><button type="button" className="btn o sm" onClick={onCerrar}>Cerrar</button></>}>
      <div className="grid2">
        <div style={{ fontSize: 13, lineHeight: 1.9 }}>
          <div><b>Sede:</b> {sn[l.sede_id]} · <b>Responsable:</b> {rn[l.responsable_id]}</div>
          <div><b>Ciclo:</b> {CICLOS.find(c => c.value === l.ciclo)?.label} · inicio {l.inicio_ciclo ? hora(l.inicio_ciclo) : '—'} / fin {l.fin_ciclo ? hora(l.fin_ciclo) : '—'}</div>
          <div><b>Temp. / presión / tiempo:</b> {l.temperatura_c} °C · {l.presion_bar} bar · {l.tiempo_min} min</div>
          <div><b>Indicador químico:</b> {l.indicador_quimico === 'viro' ? 'Viró' : 'No viró'} · <b>biológico:</b> {l.indicador_biologico}{l.biologico_resultado_en ? ` (resultado ${fechaHora(l.biologico_resultado_en)})` : ''}</div>
          <div><b>Estéril hasta:</b> {fecha(l.esteril_hasta)} · <b>Liberado:</b> {l.liberado_en ? `${fechaHora(l.liberado_en)} por ${rn[l.liberado_por] ?? ''}` : '—'}</div>
          {l.motivo_rechazo && <div><b>Motivo de rechazo:</b> {l.motivo_rechazo}</div>}
          <div style={{ color: 'var(--muted)' }}>Estado esperado según indicadores: <b>{sugerido.replace('_', ' ')}</b></div>
          {venc && <Aviso>El biológico lleva más de 24 h sin resultado: regístralo.</Aviso>}
        </div>
        <div>
          <b style={{ fontSize: 12.5 }}>Kits del lote</b>
          <table><thead><tr><th>Kit</th><th>Contenido</th><th className="num">Piezas</th></tr></thead>
            <tbody>{kitsLote.map(k => <tr key={k.id}><td>{k.codigo}</td><td>{k.nombre}{Array.isArray(k.contenido) ? `: ${k.contenido.join(', ')}` : ''}</td><td className="num">{k.num_piezas}</td></tr>)}{!kitsLote.length && <tr><td colSpan={3} style={{ color: 'var(--muted)' }}>Sin kits ligados.</td></tr>}</tbody></table>
        </div>
      </div>
      {(p['esterilizacion.operar'] || p['esterilizacion.liberar']) && !['rechazado'].includes(l.estado) && (
        <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
          <FormField label="Resultado del indicador biológico" as="select" options={BIO} value={bio ?? l.indicador_biologico} onChange={e => setBio(e.target.value)} />
          <button type="button" className="btn o sm" disabled={ocupado || (bio ?? l.indicador_biologico) === l.indicador_biologico} onClick={() => guardar({ indicador_biologico: bio })}>Registrar resultado</button>
          <FormField label="Observaciones" as="textarea" value={obs ?? l.observaciones ?? ''} onChange={e => setObs(e.target.value)} />
          <button type="button" className="btn o sm" disabled={ocupado || obs === null} onClick={() => guardar({ observaciones: obs })}>Guardar</button>
        </div>)}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {p['esterilizacion.liberar'] && l.estado === 'registrado' && l.indicador_quimico === 'viro' && l.indicador_biologico === 'pendiente' && <button type="button" className="btn" disabled={ocupado} onClick={() => guardar({ estado: 'liberado_condicionado' })}>Liberar condicionado</button>}
        {p['esterilizacion.liberar'] && ['registrado', 'liberado_condicionado'].includes(l.estado) && ['negativo', 'no_aplica'].includes(l.indicador_biologico) && l.indicador_quimico === 'viro' && <button type="button" className="btn green" disabled={ocupado} onClick={() => guardar({ estado: 'liberado' })}>Liberar lote</button>}
        {p['esterilizacion.liberar'] && ['registrado', 'liberado_condicionado'].includes(l.estado) && <button type="button" className="btn red" disabled={ocupado} onClick={rechazar}>Rechazar lote</button>}
        <ImprimirHoja titulo={`Etiquetas · lote ${l.lote}`} entidad="lotes_esterilizacion" entidadId={loteId} etiqueta="Imprimir etiquetas" sedeId={l.sede_id}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {kitsLote.map(k => <div key={k.id} style={{ border: '1px solid #000', padding: 6, fontSize: 11 }}><b>{k.codigo}</b> {k.nombre}<br />Lote {l.lote} · {fecha(l.fecha_hora)}<br />Estéril hasta {fecha(l.esteril_hasta)}<br />Autoclave: {lote?.autoclave}</div>)}
          </div>
        </ImprimirHoja>
      </div>
      <h4 style={{ margin: '14px 0 4px', fontSize: 12.5 }}>Trazabilidad inversa: pacientes atendidos con este lote ({(pac.data ?? []).length})</h4>
      {l.estado === 'bloqueado' && <Aviso tipo="err">Lote bloqueado: contacta a estos pacientes y revisa el incidente (queda en bitácora).</Aviso>}
      {pac.error ? <Aviso tipo="err">{mensajeError(pac.error)}</Aviso> : (
        <table><thead><tr><th>Kit</th><th>Fecha / hora</th><th>Consulta</th><th>Paciente</th></tr></thead>
          <tbody>{(pac.data ?? []).map((x, i) => <tr key={i}><td>{x.kit_codigo}</td><td>{fechaHora(x.fecha_hora)}</td><td><Link to={`/consultas/${x.consulta_id}`}>{x.folio_consulta}</Link></td><td><Link to={`/pacientes/${x.paciente_id}`}>{x.numero_expediente}</Link></td></tr>)}
            {!(pac.data ?? []).length && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>Aún no se usó instrumental de este lote en consultas.</td></tr>}</tbody></table>)}
    </Seccion>
  )
}

function NuevoLote({ kits, autoclaves, sedes, sedeInicial, perfil, onCerrar }) {
  const { ejecutar, ocupado } = useAccion()
  const base = CICLOS[0]
  const [f, setF] = useState({ sede_id: sedeInicial ?? (sedes.length === 1 ? sedes[0].id : ''), autoclave_id: '', ciclo: base.value, temperatura_c: base.temp, presion_bar: base.bar, tiempo_min: base.min, inicio_ciclo: '', fin_ciclo: '', indicador_quimico: 'viro', indicador_biologico: 'pendiente', esteril_hasta: esterilHastaSugerido(hoyISO()), observaciones: '' })
  const [kitIds, setKitIds] = useState([])
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const kitsSede = kits.filter(k => k.sede_id === f.sede_id && ['por_esterilizar', 'esterilizado'].includes(k.estado))
  const aut = autoclaves.filter(a => a.sede_id === f.sede_id)
  const listo = f.sede_id && f.autoclave_id && num(f.temperatura_c) && f.presion_bar !== '' && num(f.tiempo_min) && kitIds.length
  async function guardar() {
    const hoy = hoyISO()
    const t = h => (h ? new Date(`${hoy}T${h}`).toISOString() : null)
    const r = await ejecutar(async () => {
      const l = await insertar('lotes_esterilizacion', { sede_id: f.sede_id, autoclave_id: f.autoclave_id, fecha_hora: new Date().toISOString(), inicio_ciclo: t(f.inicio_ciclo), fin_ciclo: t(f.fin_ciclo), ciclo: f.ciclo, temperatura_c: num(f.temperatura_c), presion_bar: num(f.presion_bar), tiempo_min: num(f.tiempo_min), indicador_quimico: f.indicador_quimico, indicador_biologico: f.indicador_biologico, responsable_id: perfil.id, esteril_hasta: f.esteril_hasta || null, observaciones: f.observaciones || null })
      if (l.error) return l
      const k = await insertar('lote_kits', kitIds.map(id => ({ lote_id: l.data[0].id, kit_id: id })))
      return k.error ? k : l
    }, { ok: 'Lote registrado. Administración lo libera o rechaza.', invalidar: ['clinico'] })
    if (r) onCerrar()
  }
  return (
    <Modal open onClose={onCerrar} title="Registrar lote de esterilización" size="wide" footer={<><button type="button" className="btn o" onClick={onCerrar}>Cancelar</button><button type="button" className="btn" disabled={!listo || ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="row">
        <FormField label="Sede" required as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id} onChange={e => { set('sede_id')(e); setKitIds([]) }} />
        <FormField label="Autoclave" required as="select" options={aut.map(a => ({ value: a.id, label: `${a.nombre}${a.numero_serie ? ' · SN ' + a.numero_serie : ''}` }))} value={f.autoclave_id} onChange={set('autoclave_id')} />
        <FormField label="Ciclo" required as="select" options={CICLOS.map(c => ({ value: c.value, label: c.label }))} value={f.ciclo} onChange={e => { const c = CICLOS.find(x => x.value === e.target.value); setF(s => ({ ...s, ciclo: c.value, temperatura_c: c.temp, presion_bar: c.bar, tiempo_min: c.min })) }} />
      </div>
      <div className="row">
        <FormField label="Hora de inicio" type="time" value={f.inicio_ciclo} onChange={set('inicio_ciclo')} /><FormField label="Hora de fin" type="time" value={f.fin_ciclo} onChange={set('fin_ciclo')} />
        <FormField label="Temperatura (°C)" required type="number" step="0.5" value={f.temperatura_c} onChange={set('temperatura_c')} /><FormField label="Presión (bar)" required type="number" step="0.1" value={f.presion_bar} onChange={set('presion_bar')} /><FormField label="Tiempo (min)" required type="number" value={f.tiempo_min} onChange={set('tiempo_min')} />
      </div>
      <div className="row">
        <FormField label="Indicador químico" required as="select" options={QUIM} value={f.indicador_quimico} onChange={set('indicador_quimico')} />
        <FormField label="Indicador biológico" as="select" options={BIO} value={f.indicador_biologico} onChange={set('indicador_biologico')} />
        <FormField label="Estéril hasta" type="date" value={f.esteril_hasta} onChange={set('esteril_hasta')} />
      </div>
      {f.indicador_quimico === 'no_viro' && <Aviso tipo="err">El indicador químico no viró: el lote no se podrá liberar.</Aviso>}
      <div className="field"><label className="req">Kits en el ciclo</label>
        <div className="chip-group">{kitsSede.map(k => <button key={k.id} type="button" className={`chip${kitIds.includes(k.id) ? ' on' : ''}`} onClick={() => setKitIds(s => (s.includes(k.id) ? s.filter(x => x !== k.id) : [...s, k.id]))}>{k.codigo} · {k.nombre}</button>)}{!kitsSede.length && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No hay kits por esterilizar en esta sede.</span>}</div></div>
      <FormField label="Observaciones" as="textarea" value={f.observaciones} onChange={set('observaciones')} />
    </Modal>
  )
}
