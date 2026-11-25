// Utilerías · Simulador de jornada. Ensaya un día completo de operación en las sucursales: cada ola inyecta tickets REALES (venta + pago +
// turno de caja) fechados a la hora de la ola, para ver cómo se concentran en «Operación del día» y en los tableros de dueños y supervisor.
// Solo administración y solo en una clínica marcada como de prueba (el servidor lo exige: migración 132).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Play, Pause, RotateCcw, Lock, FlaskConical, BarChart3, FastForward } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, rpc } from '../../lib/api'
import { moneda, numero } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import { errMsg, EstadoConsulta } from './comun'

const OLAS = [
  { ola: 1, hora: '11:00', texto: 'Mañana (09:00 a 11:00)' },
  { ola: 2, hora: '14:00', texto: 'Mediodía (11:00 a 14:00)' },
  { ola: 3, hora: '17:00', texto: 'Tarde (14:00 a 17:00)' },
  { ola: 4, hora: '19:00', texto: 'Cierre (17:00 a 19:00)' },
]
const hoyLocal = () => new Date().toLocaleDateString('en-CA')

export default function SimuladorJornada() {
  const { organizacion } = useApp()
  const qc = useQueryClient()
  const esPrueba = organizacion?.parametros?.es_prueba === true
  const [dia, setDia] = useState(hoyLocal())
  const [plan, setPlan] = useState({})            // { sede_id: { ola: n } }
  const [ocupado, setOcupado] = useState(false)
  const [corriendo, setCorriendo] = useState(false)
  const [segundos, setSegundos] = useState(6)
  const [dw, setDw] = useState(false)
  const parar = useRef(false)

  const planQ = useQuery({
    queryKey: ['jornada-plan'],
    queryFn: async () => { const r = await rpc('jornada_plan'); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] },
    retry: false,
  })
  const bitQ = useQuery({
    queryKey: ['jornada-bitacora', dia],
    queryFn: async () => {
      const r = await leer('simulacion_jornada', { sedeCol: false, filtros: { dia }, orden: [{ columna: 'created_at' }], limite: 500 })
      if (r.error) throw new Error(errMsg(r.error))
      return r.data
    },
    retry: false,
  })

  const sedes = useMemo(() => {
    const m = new Map()
    for (const f of planQ.data ?? []) if (!m.has(f.sede_id)) m.set(f.sede_id, { id: f.sede_id, nombre: f.nombre, clave: f.clave })
    return [...m.values()]
  }, [planQ.data])
  useEffect(() => {      // el ritmo por omisión llena la matriz; después el usuario la edita
    if (!planQ.data?.length) return
    setPlan(prev => {
      if (Object.keys(prev).length) return prev
      const p = {}
      for (const f of planQ.data) (p[f.sede_id] ??= {})[f.ola] = Number(f.tickets)
      return p
    })
  }, [planQ.data])

  const hechas = useMemo(() => new Set((bitQ.data ?? []).filter(b => b.ola <= 4).map(b => b.ola)), [bitQ.data])
  const cerrado = (bitQ.data ?? []).some(b => b.ola === 9)
  const siguiente = [1, 2, 3, 4].find(o => !hechas.has(o)) ?? null
  const acumulado = useMemo(() => (bitQ.data ?? []).filter(b => b.ola <= 4).reduce((t, b) => ({ tickets: t.tickets + Number(b.tickets), ventas: t.ventas + Number(b.ventas) }), { tickets: 0, ventas: 0 }), [bitQ.data])
  const totalOla = ola => sedes.reduce((s, x) => s + (Number(plan[x.id]?.[ola]) || 0), 0)
  const cambiar = (sede, ola, v) => setPlan(p => ({ ...p, [sede]: { ...(p[sede] ?? {}), [ola]: Math.max(0, Math.min(300, Number(v) || 0)) } }))

  const refrescar = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['jornada-bitacora'] }), qc.invalidateQueries({ queryKey: ['operacion-dia'] })])
  }
  // Una acción del servidor; devuelve true si salió bien
  const ejecutar = async (nombre, args, ok) => {
    setOcupado(true)
    try {
      const r = await rpc(nombre, args)
      if (r.error) { toast.error(errMsg(r.error)); return false }
      if (ok) toast.success(ok(r.data))
      if (dw && nombre === 'simular_ola') await rpc('dw_refrescar')
      await refrescar()
      return true
    } finally { setOcupado(false) }
  }
  const inyectar = ola => ejecutar('simular_ola', { p_dia: dia, p_ola: ola, p_tickets: Object.fromEntries(sedes.map(s => [s.id, Number(plan[s.id]?.[ola]) || 0])) },
    d => `${OLAS[ola - 1].hora}: ${numero(d.tickets)} tickets · ${moneda(d.ventas)} en ${d.sedes?.length ?? 0} sucursales`)

  const correrDia = async () => {
    parar.current = false; setCorriendo(true)
    try {
      const pend = [1, 2, 3, 4].filter(o => !hechas.has(o))
      for (const o of pend) {
        if (parar.current) break
        if (!(await inyectar(o))) break
        if (o !== pend[pend.length - 1]) await new Promise(res => setTimeout(res, segundos * 1000))
      }
    } finally { setCorriendo(false) }
  }
  const detener = () => { parar.current = true; toast('Se detiene después de la ola en curso') }
  const cerrar = () => ejecutar('cerrar_jornada', { p_dia: dia }, d => `${d.cajas_cerradas} cajas cerradas y revisadas`)
  const reiniciar = async () => {
    if (!window.confirm(`Se borrarán los tickets simulados del ${dia} (solo los marcados SIM-JORNADA). Los tickets reales no se tocan. ¿Continuar?`)) return
    await ejecutar('reiniciar_jornada', { p_dia: dia }, d => `${numero(d.tickets_borrados)} tickets simulados borrados`)
  }

  const deshabilitado = ocupado || corriendo || !esPrueba
  return (
    <div className="pagina">
      <PageHeader titulo="Simulador de jornada" subtitulo="Ensaya un día completo en las sucursales: tú marcas el ritmo, el sistema inyecta los tickets"
        acciones={<Link className="btn o sm" to="/operacion-dia"><BarChart3 size={13} style={{ verticalAlign: -2 }} /> Ver Operación del día</Link>} />

      {!esPrueba && (
        <div className="aviso err" role="alert" style={{ marginBottom: 14 }}>
          <Lock size={14} style={{ verticalAlign: -2 }} /> <b>Bloqueado.</b> El simulador solo corre en una clínica marcada como de prueba (<code>parametros.es_prueba</code>). Nunca inyecta tickets en una clínica real.
        </div>
      )}
      <div className="aviso" style={{ marginBottom: 14, fontSize: 13 }}>
        <FlaskConical size={14} style={{ verticalAlign: -2 }} /> Los tickets simulados son cobros reales del sistema (caja, pagos, inventario, ingresos) marcados <code>SIM-JORNADA</code>:
        se ven igual que los de verdad en los tableros y se pueden borrar con «Reiniciar el día».
      </div>

      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13 }}>Día a simular <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} disabled={deshabilitado} style={{ marginLeft: 6 }} /></label>
        <div style={{ fontSize: 13 }}>Acumulado del día: <b className="num">{numero(acumulado.tickets)} tickets</b> · <b className="num">{moneda(acumulado.ventas)}</b></div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{cerrado ? 'Cajas cerradas' : siguiente ? `Sigue la ola de las ${OLAS[siguiente - 1].hora}` : 'Las 4 olas ya entraron: falta cerrar cajas'}</div>
      </div>

      <h3 style={{ fontSize: 14, margin: '4px 0 8px' }}>Ritmo del día · tickets por sucursal y ola (editable)</h3>
      <EstadoConsulta q={planQ} />
      {!planQ.isLoading && !planQ.isError && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Sucursal</th>
                {OLAS.map(o => (
                  <th key={o.ola} style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{o.hora}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{o.texto}</div>
                  </th>
                ))}
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Día</th>
              </tr>
            </thead>
            <tbody>
              {sedes.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--row-line)' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 600 }}>{s.nombre}</td>
                  {OLAS.map(o => (
                    <td key={o.ola} style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <input type="number" min={0} max={300} value={plan[s.id]?.[o.ola] ?? 0} disabled={deshabilitado || hechas.has(o.ola)}
                        onChange={e => cambiar(s.id, o.ola, e.target.value)} style={{ width: 64, textAlign: 'center' }} aria-label={`${s.nombre} ${o.hora}`} />
                    </td>
                  ))}
                  <td className="num" style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{OLAS.reduce((t, o) => t + (Number(plan[s.id]?.[o.ola]) || 0), 0)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--row-line)', fontWeight: 700 }}>
                <td style={{ padding: '6px 8px' }}>Total</td>
                {OLAS.map(o => <td key={o.ola} className="num" style={{ padding: '6px 8px', textAlign: 'center' }}>{totalOla(o.ola)}</td>)}
                <td className="num" style={{ padding: '6px 8px', textAlign: 'right' }}>{OLAS.reduce((t, o) => t + totalOla(o.ola), 0)}</td>
              </tr>
              <tr>
                <td />
                {OLAS.map(o => (
                  <td key={o.ola} style={{ padding: '8px', textAlign: 'center' }}>
                    {hechas.has(o.ola)
                      ? <span style={{ color: 'var(--green)', fontSize: 12.5, fontWeight: 600 }}>✓ Inyectada</span>
                      : <button className="btn sm" disabled={deshabilitado || o.ola !== siguiente || !totalOla(o.ola)} onClick={() => inyectar(o.ola)}>Inyectar {o.hora}</button>}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        {corriendo
          ? <button className="btn o" onClick={detener}><Pause size={14} style={{ verticalAlign: -2 }} /> Detener</button>
          : <button className="btn" onClick={correrDia} disabled={deshabilitado || !siguiente}><FastForward size={14} style={{ verticalAlign: -2 }} /> Correr el día completo</button>}
        <label style={{ fontSize: 13 }}>una ola cada <input type="number" min={1} max={60} value={segundos} onChange={e => setSegundos(Math.max(1, Number(e.target.value) || 1))} disabled={corriendo} style={{ width: 54, textAlign: 'center' }} /> s</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={dw} onChange={e => setDw(e.target.checked)} /> Actualizar también el data warehouse en cada ola (más lento)</label>
        <span style={{ flex: 1 }} />
        <button className="btn o" onClick={cerrar} disabled={deshabilitado || cerrado || siguiente !== null}><Play size={14} style={{ verticalAlign: -2 }} /> Cerrar cajas del día</button>
        <button className="btn ghost" onClick={reiniciar} disabled={deshabilitado || !(bitQ.data ?? []).length}><RotateCcw size={14} style={{ verticalAlign: -2 }} /> Reiniciar el día</button>
      </div>

      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Lo inyectado en {dia}</h3>
      <EstadoConsulta q={bitQ} />
      {!bitQ.isLoading && !bitQ.isError && (
        <div className="card" style={{ overflowX: 'auto' }}>
          {!(bitQ.data ?? []).length ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Todavía no se inyecta nada en este día.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th style={{ padding: '4px 8px' }}>Momento</th><th>Sucursal</th><th style={{ textAlign: 'right' }}>Tickets</th><th style={{ textAlign: 'right', padding: '4px 8px' }}>Ventas</th></tr></thead>
              <tbody>
                {bitQ.data.map(b => (
                  <tr key={b.id} style={{ borderTop: '1px solid var(--row-line)' }}>
                    <td style={{ padding: '4px 8px' }}>{b.ola === 9 ? 'Cierre de caja' : `Ola ${b.ola} · ${String(b.hora).slice(0, 5)}`}</td>
                    <td>{sedes.find(s => s.id === b.sede_id)?.nombre ?? 'Todas'}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{numero(b.tickets)}</td>
                    <td className="num" style={{ textAlign: 'right', padding: '4px 8px' }}>{moneda(b.ventas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
