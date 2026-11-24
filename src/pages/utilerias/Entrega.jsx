// Utilerías · Entrega. Clon adaptado de IRP Entrega.jsx: allá es el paquete de documentos de entrega-recepción del sistema; aquí es la
// entrega / puesta en marcha del proyecto en UNA clínica: checklist (sedes, usuarios, catálogo de precios, plantillas, certificados CFDI,
// importación inicial, capacitación) con estado por paso, progreso y acta imprimible. Los pasos se contrastan con datos reales
// (prp_entrega_indicadores); el estado lo marca el Administrador y se guarda en entrega_pasos (auditada por trigger).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { PackageOpen, CheckCircle2, CircleDashed, Hand, Save, ExternalLink, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, insertar, actualizar } from '../../lib/api'
import { fecha, fechaHora } from '../../lib/formato'
import { ESTADOS_PASO, armarEntrega, progresoEntrega } from '../../lib/utilerias/entrega'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import { useDatos, EstadoConsulta, errMsg } from './comun'

const ETQ = Object.fromEntries(ESTADOS_PASO.map(e => [e.id, e]))

function Paso({ paso, puede, onGuardar }) {
  const [estado, setEstado] = useState(paso.estado)
  const [responsable, setResponsable] = useState(paso.responsable)
  const [nota, setNota] = useState(paso.nota)
  const [guardando, setGuardando] = useState(false)
  const sucio = estado !== paso.estado || responsable !== paso.responsable || nota !== paso.nota
  const guardar = async () => { setGuardando(true); await onGuardar(paso, { estado, responsable: responsable.trim() || null, nota: nota.trim() || null }); setGuardando(false) }
  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${paso.estado === 'completado' ? 'var(--green)' : paso.estado === 'en_proceso' ? 'var(--gold)' : paso.estado === 'no_aplica' ? 'var(--accent)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent-dark)', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>{paso.numero}</div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14.5 }}>{paso.titulo}</b>
            <StatusBadge variante={ETQ[paso.estado].variante} label={ETQ[paso.estado].label} />
            {paso.auto === true && <span className="bd v"><CheckCircle2 size={11} style={{ verticalAlign: -1 }} /> Datos cumplen</span>}
            {paso.auto === false && <span className="bd a"><CircleDashed size={11} style={{ verticalAlign: -1 }} /> Faltan datos</span>}
            {paso.auto === null && <span className="bd n"><Hand size={11} style={{ verticalAlign: -1 }} /> Se confirma a mano</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0' }}>{paso.descripcion}</div>
          <div style={{ fontSize: 12.5 }}><b>Datos actuales:</b> {paso.detalle}</div>
          {paso.aviso && <div style={{ fontSize: 12, color: 'var(--gold)', marginTop: 4, display: 'flex', gap: 5, alignItems: 'center' }}><AlertTriangle size={13} /> {paso.aviso}</div>}
        </div>
        {paso.ruta && <Link to={paso.ruta} className="btn o sm">{paso.rutaLabel} <ExternalLink size={11} style={{ verticalAlign: -1 }} /></Link>}
      </div>
      <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 180 }}><label htmlFor={`e-${paso.clave}`}>Estado</label>
          <select id={`e-${paso.clave}`} value={estado} disabled={!puede} onChange={e => setEstado(e.target.value)}>{ESTADOS_PASO.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></div>
        <div className="field" style={{ maxWidth: 220 }}><label htmlFor={`r-${paso.clave}`}>Responsable</label>
          <input id={`r-${paso.clave}`} value={responsable} disabled={!puede} onChange={e => setResponsable(e.target.value)} placeholder="Quién lo lleva" /></div>
        <div className="field" style={{ flex: 2 }}><label htmlFor={`n-${paso.clave}`}>Nota</label>
          <input id={`n-${paso.clave}`} value={nota} disabled={!puede} onChange={e => setNota(e.target.value)} placeholder="Observaciones del paso" /></div>
        {puede && <button type="button" className="btn sm" disabled={!sucio || guardando} onClick={guardar}><Save size={12} style={{ verticalAlign: -2 }} /> {guardando ? 'Guardando…' : 'Guardar'}</button>}
      </div>
      {paso.completado_en && paso.estado === 'completado' && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Completado el {fecha(paso.completado_en)}</div>}
    </div>
  )
}

export default function Entrega() {
  const { organizacion } = useApp()
  const puede = usePermiso('configuracion.editar')
  const qc = useQueryClient()
  const ind = useDatos(['entrega-ind'], () => leer('prp_entrega_indicadores', { sedeCol: false, limite: 1 }))
  const guardados = useDatos(['entrega-pasos'], () => leer('entrega_pasos', { sedeCol: false, limite: 50 }))
  const pasos = useMemo(() => armarEntrega(ind.data?.data?.[0] ?? {}, guardados.data?.data ?? []), [ind.data, guardados.data])
  const prog = useMemo(() => progresoEntrega(pasos), [pasos])
  const cargando = ind.isLoading || guardados.isLoading

  async function guardar(paso, cambios) {
    const completado_en = cambios.estado === 'completado' ? (paso.completado_en ?? new Date().toISOString()) : null
    const r = paso.id ? await actualizar('entrega_pasos', paso.id, { ...cambios, completado_en }).catch(e => ({ error: e })) : await insertar('entrega_pasos', { clave: paso.clave, ...cambios, completado_en }).catch(e => ({ error: e }))
    if (r.error) { toast.error(`No se pudo guardar: ${errMsg(r.error)}`); return }
    toast.success('Paso guardado')
    qc.invalidateQueries({ queryKey: ['entrega-pasos'] })
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Entrega del proyecto" subtitulo={`Puesta en marcha de ${organizacion?.nombre ?? 'la clínica'}: lo que debe quedar listo antes de operar en producción.`}
        acciones={!cargando && !ind.isError && !guardados.isError && (
          <ImprimirHoja titulo={`Acta de entrega · ${organizacion?.nombre ?? ''}`} entidad="entrega_proyecto" etiqueta="Imprimir acta">
            <p style={{ fontSize: 12 }}>Avance de la puesta en marcha: <b>{prog.pct} %</b> ({prog.hechos} completados, {prog.noAplica} no aplican, {prog.enProceso} en proceso, {prog.pendientes} pendientes). Corte: {fechaHora(new Date())}.</p>
            <table><thead><tr><th>#</th><th>Paso</th><th>Estado</th><th>Datos actuales</th><th>Responsable</th><th>Nota</th></tr></thead>
              <tbody>{pasos.map(p => <tr key={p.clave}><td>{p.numero}</td><td>{p.titulo}</td><td>{ETQ[p.estado].label}</td><td>{p.detalle}</td><td>{p.responsable}</td><td>{p.nota}</td></tr>)}</tbody></table>
            <div style={{ display: 'flex', gap: 60, marginTop: 60, fontSize: 12 }}><div style={{ borderTop: '1px solid #000', paddingTop: 4, flex: 1 }}>Entrega (RANNIX)</div><div style={{ borderTop: '1px solid #000', paddingTop: 4, flex: 1 }}>Recibe (Administración de la clínica)</div></div>
          </ImprimirHoja>
        )} />
      <EstadoConsulta q={ind} />
      {!ind.isLoading && !ind.isError && !ind.data?.aviso && (<>
        {guardados.isError && <div className="aviso err" role="alert" style={{ borderRadius: 8, marginBottom: 10 }}>No se pudieron leer los estados guardados: {errMsg(guardados.error)}</div>}
        <div className="grid-kpis">
          <KPICard title="Avance de la entrega" value={`${prog.pct} %`} subtitle={prog.listo ? 'Lista para operar' : `${prog.total - prog.hechos - prog.noAplica} paso(s) por cerrar`} icon={PackageOpen} color={prog.listo ? 'var(--green)' : 'var(--accent)'} />
          <KPICard title="Completados" value={prog.hechos} subtitle={prog.noAplica ? `${prog.noAplica} no aplican` : undefined} icon={CheckCircle2} color="var(--green)" />
          <KPICard title="En proceso" value={prog.enProceso} icon={CircleDashed} color="var(--gold)" />
          <KPICard title="Pendientes" value={prog.pendientes} icon={Hand} color="var(--muted)" />
        </div>
        <div style={{ height: 8, background: 'var(--row-line)', borderRadius: 4, margin: '12px 0 16px' }} role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la entrega">
          <div style={{ height: 8, borderRadius: 4, background: prog.listo ? 'var(--green)' : 'var(--accent)', width: `${prog.pct}%`, transition: 'width .3s' }} />
        </div>
        {!puede && <div className="aviso warn" style={{ borderRadius: 8, marginBottom: 10 }}>Solo lectura: la clínica está suspendida o dada de baja, o no tienes permiso para editar.</div>}
        {pasos.map(p => <Paso key={`${p.clave}-${p.estado}-${p.responsable}-${p.nota}`} paso={p} puede={puede} onGuardar={guardar} />)}
      </>)}
    </div>
  )
}
