// 47 · Asistente de IA de consulta (clon adaptado de IRP AsistenteApp/Consulta). P-125: solo vistas administrativas agregadas de la clínica propia
// (asistente_vistas_permitidas); las vistas con datos de paciente exigen permiso de expediente y dejan bitácora; cada consulta se registra.
// El adaptador consultarAsistente es SIMULADO mientras no haya llave: nunca finge razonar.
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Send, MessageSquarePlus, Sparkles } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { leer, insertar, actualizar } from '../../../lib/api'
import { estadoIA, consultarAsistente } from '../../../lib/adaptadores/ia'
import { norm } from '../../../lib/plataforma/importacion'
import { fechaHora } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { BannerIA, useDatos, errMsg } from './comun'

const IA_MODO_BD = { simulado: 'sintetico', activo: 'activo', no_configurado: 'no_configurado' }
const SINONIMOS = { nps: ['nps', 'satisfaccion', 'encuesta', 'promotor', 'recomendacion'], mantenimiento: ['mantenimiento', 'reparacion', 'equipo', 'orden de trabajo', 'ot'], asistencia: ['asistencia', 'falta', 'retardo', 'checada', 'puntualidad'], nomina: ['nomina', 'sueldo', 'prenomina', 'quincena', 'pago al personal'], importaciones: ['importacion', 'importar', 'carga de datos'] }

/** Vistas que parecen relevantes para la pregunta (por palabras del nombre de la vista y sinónimos). */
export function vistasRelevantes(pregunta, vistas) {
  const q = norm(pregunta)
  return vistas.filter(v => {
    const tokens = v.vista.replace(/^prp_/, '').split('_')
    return tokens.some(t => t.length > 2 && (q.includes(t.slice(0, Math.max(3, t.length - 1))) || (SINONIMOS[t] ?? []).some(s => q.includes(s))))
  })
}

function TablaResultado({ titulo, filas }) {
  if (!filas?.length) return null
  const cols = Object.keys(filas[0]).filter(c => !/(^id$|_id$|organizacion)/.test(c)).slice(0, 8)
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>{titulo} · {filas.length} fila(s)</div>
      <div className="tabla-wrap" style={{ maxHeight: 240, overflow: 'auto' }}><table>
        <thead><tr>{cols.map(c => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>{filas.slice(0, 30).map((f, i) => <tr key={i}>{cols.map(c => <td key={c}>{typeof f[c] === 'object' && f[c] ? JSON.stringify(f[c]) : String(f[c] ?? '—')}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
  )
}

export default function Asistente() {
  const { user, sedeActivaId } = useApp()
  const puede = usePermiso('asistente.usar')
  const verExpediente = usePermiso('expediente.ver')
  const qc = useQueryClient()
  const [ia, setIa] = useState({ modo: 'simulado', proveedor: 'reglas-locales' })
  const [conv, setConv] = useState(null)             // id de conversación
  const [msgs, setMsgs] = useState([])               // { id, rol, contenido, tablas?, fuente?, created_at }
  const [pregunta, setPregunta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [cargandoConv, setCargandoConv] = useState(false)
  const fin = useRef(null)
  useEffect(() => { estadoIA().then(setIa) }, [])
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const historial = useDatos(['asist-hist'], () => leer('prp_asistente_historial', { sedeCol: false, orden: { columna: 'updated_at', asc: false }, limite: 50 }))
  const vistas = useDatos(['asist-vistas'], () => leer('asistente_vistas_permitidas', { sedeCol: false, filtros: { activa: true }, orden: { columna: 'vista' }, limite: 100 }))
  const permitidas = vistas.data?.data ?? []

  const sugerencias = useMemo(() => {
    const map = { prp_nps_mensual: '¿Cómo va el NPS de los últimos meses?', prp_mantenimiento_mes: '¿Cuánto se ha gastado en mantenimiento por mes?', prp_asistencia_resumen_mes: '¿Cómo va la asistencia y los retardos del mes?', prp_nomina_periodos: '¿Cuánto fue la nómina de los últimos periodos?', prp_importaciones: '¿Qué importaciones de datos se han hecho?' }
    return permitidas.map(v => map[v.vista] ?? `Resume la vista ${v.vista.replace(/^prp_/, '').replace(/_/g, ' ')}`)
  }, [permitidas])

  async function abrir(id) {
    setCargandoConv(true); setConv(id)
    const r = await leer('asistente_mensajes', { sedeCol: false, filtros: { conversacion_id: id }, orden: { columna: 'created_at' }, limite: 200 })
    setMsgs(r.data.map(m => ({ id: m.id, rol: m.rol, contenido: m.contenido, fuente: m.fuente, created_at: m.created_at, modo: m.modo_ia })))
    setCargandoConv(false)
  }
  const nueva = () => { setConv(null); setMsgs([]); setPregunta('') }

  async function enviar(texto) {
    const q = (texto ?? pregunta).trim()
    if (!q || cargando || !puede) return
    setPregunta(''); setCargando(true)
    const local = rol => ({ id: crypto.randomUUID(), rol, created_at: new Date().toISOString() })
    setMsgs(m => [...m, { ...local('usuario'), contenido: q }])
    try {
      let cid = conv
      if (!cid) {
        const c = await insertar('asistente_conversaciones', { titulo: q.slice(0, 60) })
        if (c.error) throw new Error(errMsg(c.error))
        cid = c.data[0].id; setConv(cid)
      }
      const mu = await insertar('asistente_mensajes', { conversacion_id: cid, usuario_id: user.id, rol: 'usuario', contenido: q })
      if (mu.error) throw new Error(errMsg(mu.error))

      // 1) vistas relevantes dentro de lo permitido; las de nivel «paciente» exigen permiso de expediente
      const candidatas = vistasRelevantes(q, permitidas)
      const consultas = []
      for (const v of candidatas) {
        if (v.nivel === 'paciente' && !verExpediente) { consultas.push({ vista: v.vista, bloqueada: true, motivo: 'Requiere permiso de expediente' }); continue }
        const r = await leer(v.vista, { sedeCol: false, limite: 60 })
        if (r.error) { consultas.push({ vista: v.vista, bloqueada: true, motivo: errMsg(r.error) }); continue }
        consultas.push({ vista: v.vista, nivel: v.nivel, filas: r.data })
      }
      // 2) adaptador de IA (simulado sin llave)
      const ctx = consultas.filter(c => !c.bloqueada).map(c => ({ titulo: c.vista, filas: c.filas }))
      const res = await consultarAsistente({ pregunta: q, contexto: ctx })
      setIa({ modo: res.modo, proveedor: res.proveedor })
      let texto = res.respuesta
      if (!candidatas.length) texto += ` Ninguna de las vistas permitidas parece relevante para tu pregunta. Vistas disponibles: ${permitidas.map(v => v.vista).join(', ') || 'ninguna (pide a un administrador habilitarlas)'}.`
      const bloqueadas = consultas.filter(c => c.bloqueada)
      if (bloqueadas.length) texto += ` No se consultó: ${bloqueadas.map(b => `${b.vista} (${b.motivo})`).join('; ')}.`

      // 3) registro (P-125): mensaje del asistente, accesos a datos y, si identifica paciente, bitácora (la hace el trigger)
      const usoPaciente = consultas.some(c => c.nivel === 'paciente' && c.filas?.some(f => f.paciente_id))
      const ma = await insertar('asistente_mensajes', {
        conversacion_id: cid, usuario_id: user.id, rol: 'asistente', contenido: texto, fuente: ctx.length ? ctx.map(c => c.titulo).join(' · ') : null,
        vistas_consultadas: ctx.map(c => c.titulo), accedio_dato_clinico: usoPaciente, paciente_id: usoPaciente ? consultas.find(c => c.nivel === 'paciente').filas.find(f => f.paciente_id).paciente_id : null,
        modo_ia: IA_MODO_BD[res.modo] ?? 'no_configurado', proveedor_ia: res.proveedor,
      })
      if (ma.error) throw new Error(errMsg(ma.error))
      const accesos = []
      for (const c of consultas) {
        if (c.bloqueada) { accesos.push({ usuario_id: user.id, mensaje_id: ma.data[0].id, vista: c.vista, permitido: false, motivo_bloqueo: c.motivo, filas_devueltas: 0 }); continue }
        const pacs = c.nivel === 'paciente' ? [...new Set(c.filas.map(f => f.paciente_id).filter(Boolean))].slice(0, 20) : []
        if (pacs.length) pacs.forEach(p => accesos.push({ usuario_id: user.id, mensaje_id: ma.data[0].id, vista: c.vista, filas_devueltas: c.filas.length, identifica_paciente: true, paciente_id: p }))
        else accesos.push({ usuario_id: user.id, mensaje_id: ma.data[0].id, vista: c.vista, filas_devueltas: c.filas.length })
      }
      if (accesos.length) { const a = await insertar('asistente_accesos_datos', accesos); if (a.error) console.warn('[asistente] accesos no registrados', a.error.message) }
      await actualizar('asistente_conversaciones', cid, { updated_at: new Date().toISOString() })
      setMsgs(m => [...m, { ...local('asistente'), id: ma.data[0].id, contenido: texto, fuente: ctx.map(c => c.titulo).join(' · '), tablas: ctx, modo: res.modo }])
      qc.invalidateQueries({ queryKey: ['asist-hist'] })
    } catch (e) {
      toast.error(errMsg(e))
      setMsgs(m => [...m, { id: crypto.randomUUID(), rol: 'asistente', contenido: `No pude completar la consulta: ${errMsg(e)}`, created_at: new Date().toISOString(), error: true }])
    } finally { setCargando(false) }
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Asistente de IA" subtitulo="Pregunta sobre los datos administrativos de tu clínica. Solo consulta vistas agregadas permitidas; cada consulta queda registrada." acciones={<button className="btn o" onClick={nueva}><MessageSquarePlus size={14} style={{ verticalAlign: -2 }} /> Nueva conversación</button>} />
      <BannerIA modo={ia.modo} proveedor={ia.proveedor} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 12, marginTop: 12 }} className="asistente-grid">
        <div className="card" style={{ padding: 8, maxHeight: 560, overflow: 'auto' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', padding: '4px 6px' }}>CONVERSACIONES</div>
          {historial.isLoading ? <LoadingSpinner /> : (historial.data?.data ?? []).length === 0
            ? <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>Sin conversaciones todavía.</div>
            : (historial.data?.data ?? []).map(h => (
              <button key={h.conversacion_id} type="button" className={`btn sm ${conv === h.conversacion_id ? '' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', margin: '2px 0', whiteSpace: 'normal' }} onClick={() => abrir(h.conversacion_id)}>
                {h.titulo}<div style={{ fontSize: 10.5, opacity: 0.7 }}>{fechaHora(h.updated_at)} · {h.mensajes} msj</div>
              </button>))}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 420, maxHeight: 620 }}>
          <div style={{ flex: 1, overflow: 'auto', display: 'grid', gap: 8, alignContent: 'start', padding: 4 }}>
            {cargandoConv ? <LoadingSpinner /> : msgs.length === 0 ? (
              <EmptyState icon={Sparkles} compacto title="¿Qué quieres saber?" description={permitidas.length ? 'Prueba una de estas preguntas:' : 'No hay vistas habilitadas para el asistente. Un administrador debe habilitarlas.'}
                action={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>{sugerencias.map(s => <button key={s} className="btn o sm" disabled={!puede} onClick={() => enviar(s)}>{s}</button>)}</div>} />
            ) : msgs.map(m => (
              <div key={m.id} style={{ justifySelf: m.rol === 'usuario' ? 'end' : 'start', maxWidth: '92%' }}>
                <div style={{ padding: '8px 12px', borderRadius: 10, background: m.rol === 'usuario' ? 'var(--accent)' : 'var(--row-line)', color: m.rol === 'usuario' ? 'white' : 'var(--text)', fontSize: 13.5, whiteSpace: 'pre-wrap', borderLeft: m.error ? '4px solid var(--red)' : undefined }}>{m.contenido}</div>
                {m.tablas?.map(t => <TablaResultado key={t.titulo} titulo={t.titulo} filas={t.filas} />)}
                {m.rol === 'asistente' && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{m.fuente ? `Fuente: ${m.fuente} · ` : ''}{m.modo === 'sintetico' || m.modo === 'simulado' ? 'IA simulada · ' : ''}{fechaHora(m.created_at)}</div>}
              </div>))}
            {cargando && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Consultando las vistas permitidas…</div>}
            <div ref={fin} />
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--row-line)' }}>
            <input style={{ flex: 1 }} placeholder={puede ? 'Escribe tu pregunta…' : 'Tu rol o el estado de la clínica no permite usar el asistente'} value={pregunta} disabled={!puede || cargando} onChange={e => setPregunta(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} />
            <button className="btn" disabled={!puede || cargando || !pregunta.trim()} onClick={() => enviar()}><Send size={14} style={{ verticalAlign: -2 }} /> Enviar</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>El asistente es un apoyo, no un diagnóstico. Vistas habilitadas: {permitidas.map(v => v.vista.replace(/^prp_/, '')).join(', ') || 'ninguna'}.</div>
        </div>
      </div>
    </div>
  )
}
