// Tablero ejecutivo · alimentado por el data warehouse (vistas piefirme.dw_kpi_*). KPIs del mes contra el anterior, tendencias de 12 meses,
// comparativo entre sedes y desgloses por servicio, método de pago, podólogo y perfil de paciente. Solo Administrador.
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, TrendingDown, Wallet, CalendarCheck, UserX, Users, Stethoscope, Banknote, RefreshCw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, rpc } from '../../lib/api'
import { moneda, numero, fechaHora } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

const COLORES = ['#7B5EA7', '#2E9E8F', '#E0A030', '#D9534F', '#4A7BD0', '#8A6F3B', '#5BB36B', '#B05BA8']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaMes = m => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
const corto = v => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} k` : String(Math.round(v)))
const suma = (filas, k) => filas.reduce((s, f) => s + Number(f[k] ?? 0), 0)

function useDW(vista) {
  return useQuery({ queryKey: ['dw', vista], queryFn: async () => { const r = await leer(vista, { sedeCol: false, limite: 5000 }); if (r.error) throw new Error(r.error.message); return r.data }, retry: false })
}
const Tarjeta = ({ titulo, children, alto = 260 }) => (
  <div className="card" style={{ padding: 14 }}>
    <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>{titulo}</h3>
    <div style={{ height: alto }}>{children}</div>
  </div>
)

export default function TableroEjecutivo() {
  const { sedes, sedeActivaId, sedeActiva } = useApp()
  const resumen = useDW('dw_kpi_resumen'), mensual = useDW('dw_kpi_mensual_sede'), servicios = useDW('dw_kpi_servicio_mes')
  const podologos = useDW('dw_kpi_podologo_mes'), pagos = useDW('dw_kpi_metodo_pago_mes'), pacientes = useDW('dw_kpi_pacientes'), inventario = useDW('dw_kpi_inventario')
  const act = useDW('dw_actualizacion')
  const qc = useQueryClient()
  const [refrescando, setRefrescando] = useState(false)
  async function refrescar() {
    setRefrescando(true)
    const r = await rpc('dw_refrescar')
    setRefrescando(false)
    if (r.error) return toast.error(`No se pudo actualizar: ${r.error.message}`)
    toast.success('Tablero actualizado')
    qc.invalidateQueries({ queryKey: ['dw'] })
  }
  // Primera vez (o tras limpiar): si el warehouse nunca se ha calculado para esta clínica, se calcula solo.
  useEffect(() => { if (act.isSuccess && !act.data?.length) refrescar() }, [act.isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps
  const cargando = refrescando || [resumen, mensual, servicios, podologos, pagos, pacientes, inventario, act].some(q => q.isLoading)
  const error = [resumen, mensual].find(q => q.isError)?.error
  const actualizado = act.data?.[0]?.actualizado_en

  const porSede = f => !sedeActivaId || f.sede_id === sedeActivaId
  const nombreSede = id => sedes.find(s => s.id === id)?.nombre ?? 'Sede'

  const serie = useMemo(() => {
    const m = new Map()
    for (const f of (mensual.data ?? []).filter(porSede)) {
      const x = m.get(f.anio_mes) ?? { anio_mes: f.anio_mes, ingresos: 0, gastos: 0, utilidad: 0, ventas: 0, tickets: 0, atendidas: 0, no_shows: 0, agendadas: 0, canceladas: 0, primeraVez: 0, consultas: 0 }
      x.primeraVez += Number(f.pacientes_primera_vez); x.consultas += Number(f.consultas)
      x.ingresos += Number(f.ingresos); x.gastos += Number(f.gastos); x.utilidad += Number(f.utilidad); x.ventas += Number(f.ventas); x.tickets += Number(f.tickets)
      x.atendidas += Number(f.citas_atendidas); x.no_shows += Number(f.no_shows); x.agendadas += Number(f.citas_agendadas); x.canceladas += Number(f.citas_canceladas)
      m.set(f.anio_mes, x)
    }
    const meses = [...m.values()].sort((a, b) => a.anio_mes.localeCompare(b.anio_mes))
    while (meses.length > 1 && meses[meses.length - 1].ingresos === 0 && meses[meses.length - 1].gastos === 0 && meses[meses.length - 1].atendidas === 0) meses.pop()  // mes recién iniciado, sin datos
    return meses.slice(-12)
      .map(x => ({ ...x, mes: etiquetaMes(x.anio_mes), ticket: x.tickets ? x.ventas / x.tickets : 0, noShow: x.agendadas - x.canceladas ? (100 * x.no_shows) / (x.agendadas - x.canceladas) : 0 }))
  }, [mensual.data, sedeActivaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const meses12 = new Set(serie.map(s => s.anio_mes))
  const comparativoSedes = useMemo(() => {
    const m = new Map()
    for (const f of mensual.data ?? []) {
      if (!meses12.has(f.anio_mes)) continue
      const x = m.get(f.sede_id) ?? { sede: nombreSede(f.sede_id), ingresos: 0, gastos: 0, utilidad: 0 }
      x.ingresos += Number(f.ingresos); x.gastos += Number(f.gastos); x.utilidad += Number(f.utilidad)
      m.set(f.sede_id, x)
    }
    return [...m.values()].sort((a, b) => b.ingresos - a.ingresos)
  }, [mensual.data, serie, sedes]) // eslint-disable-line react-hooks/exhaustive-deps

  const topServicios = useMemo(() => {
    const m = new Map()
    for (const f of (servicios.data ?? []).filter(porSede)) if (meses12.has(f.anio_mes)) m.set(f.servicio, (m.get(f.servicio) ?? 0) + Number(f.ventas))
    return [...m].map(([servicio, ventas]) => ({ servicio, ventas })).sort((a, b) => b.ventas - a.ventas).slice(0, 8)
  }, [servicios.data, serie, sedeActivaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const mezclaPago = useMemo(() => {
    const m = new Map()
    for (const f of (pagos.data ?? []).filter(porSede)) if (meses12.has(f.anio_mes)) m.set(f.metodo, (m.get(f.metodo) ?? 0) + Number(f.monto))
    return [...m].map(([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto)
  }, [pagos.data, serie, sedeActivaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tablaPodologos = useMemo(() => {
    const ultimos = new Set(serie.slice(-3).map(s => s.anio_mes))
    const m = new Map()
    for (const f of podologos.data ?? []) {
      if (!ultimos.has(f.anio_mes)) continue
      const x = m.get(f.podologo_id) ?? { podologo_id: f.podologo_id, podologo: f.podologo ?? 'Sin asignar', agendadas: 0, atendidas: 0, no_shows: 0, ingreso: 0 }
      x.agendadas += Number(f.citas_agendadas); x.atendidas += Number(f.citas_atendidas); x.no_shows += Number(f.no_shows); x.ingreso += Number(f.ingreso_atendido ?? 0)
      m.set(f.podologo_id, x)
    }
    return [...m.values()].map(x => ({ ...x, tasa: x.agendadas ? (100 * x.atendidas) / x.agendadas : 0 })).sort((a, b) => b.ingreso - a.ingreso)
  }, [podologos.data, serie])

  const perfilEdad = useMemo(() => {
    const m = new Map()
    for (const f of pacientes.data ?? []) m.set(f.grupo_edad, (m.get(f.grupo_edad) ?? 0) + Number(f.pacientes))
    return ['0-17', '18-35', '36-50', '51-65', '66+', 'sin dato'].filter(g => m.has(g)).map(g => ({ grupo: g, pacientes: m.get(g) }))
  }, [pacientes.data])

  const inv = (inventario.data ?? []).filter(porSede)
  // Las tarjetas comparan el último mes CON datos contra el anterior (al cambiar de mes el en curso aún está vacío y mostraría $0 / ↓100 %).
  const iRef = (() => { for (let i = serie.length - 1; i >= 0; i--) if (serie[i].ingresos > 0 || serie[i].atendidas > 0) return i; return serie.length - 1 })()
  const mesRef = serie[iRef], mesPrev = serie[iRef - 1]
  const CLAVE = { ingresos: 'ingresos', gastos: 'gastos', utilidad: 'utilidad', citas_atendidas: 'atendidas', no_shows: 'no_shows', pacientes_primera_vez: 'primeraVez', consultas: 'consultas' }
  const tarjeta = (k, titulo, icono, color, esDinero = true) => {
    const c = CLAVE[k], fmt = v => (esDinero ? moneda(v) : numero(v))
    const act = mesRef?.[c] ?? 0, ant = mesPrev?.[c]
    const anio = serie.filter(s => s.anio_mes.slice(0, 4) === mesRef?.anio_mes.slice(0, 4) && s.anio_mes <= mesRef.anio_mes).reduce((a, s) => a + (s[c] ?? 0), 0)
    return <KPICard title={`${titulo} · ${mesRef ? etiquetaMes(mesRef.anio_mes) : ''}`} icon={icono} color={color} value={fmt(act)}
      subtitle={`Mes anterior: ${ant == null ? '—' : fmt(ant)} · Año: ${fmt(anio)}`}
      trend={ant ? Math.round((1000 * (act - ant)) / Math.abs(ant)) / 10 : undefined} />
  }

  if (cargando) return <div className="pagina"><LoadingSpinner label="Calculando tablero…" /></div>
  if (error || !serie.length) return (
    <div className="pagina"><PageHeader titulo="Tablero ejecutivo" />
      <div className="card"><EmptyState title={error ? 'No se pudo cargar el tablero' : 'Sin datos todavía'}
        description={error ? error.message : 'Cuando haya citas, ventas y gastos el warehouse los resumirá aquí.'} /></div></div>
  )

  return (
    <div className="pagina">
      <PageHeader titulo="Tablero ejecutivo" subtitulo={`Últimos ${serie.length} meses · ${sedeActiva?.nombre ?? 'Todas las sedes'} · warehouse actualizado ${actualizado ? fechaHora(actualizado) : '—'} (el mes en curso puede estar incompleto)`}
        acciones={<button className="btn o sm" onClick={refrescar} disabled={refrescando}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> {refrescando ? 'Actualizando…' : 'Actualizar datos'}</button>} />
      <div className="grid-kpis">
        {tarjeta('ingresos', 'Ingresos',TrendingUp, 'var(--green)')}
        {tarjeta('gastos', 'Gastos',TrendingDown, 'var(--red)')}
        {tarjeta('utilidad', 'Utilidad',Wallet, 'var(--accent)')}
        {tarjeta('citas_atendidas', 'Citas atendidas', CalendarCheck, 'var(--accent2)', false)}
        {tarjeta('no_shows', 'No asistieron', UserX, 'var(--gold)', false)}
        {tarjeta('pacientes_primera_vez', 'Pacientes de primera vez', Users, 'var(--accent2)', false)}
        {tarjeta('consultas', 'Consultas clínicas', Stethoscope, 'var(--accent)', false)}
        <KPICard title="Valuación de inventario" icon={Banknote} color="var(--gold)" value={moneda(suma(inv, 'valuacion'))} subtitle={`${numero(suma(inv, 'bajo_minimo'))} productos bajo mínimo`} />
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <Tarjeta titulo="Ingresos, gastos y utilidad por mes">
          <ResponsiveContainer><ComposedChart data={serie}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0ef" /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} tickFormatter={corto} />
            <Tooltip formatter={v => moneda(v)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ingresos" name="Ingresos" fill={COLORES[1]} radius={[3, 3, 0, 0]} /><Bar dataKey="gastos" name="Gastos" fill={COLORES[3]} radius={[3, 3, 0, 0]} />
            <Line dataKey="utilidad" name="Utilidad" stroke={COLORES[0]} strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer>
        </Tarjeta>
        <Tarjeta titulo="Citas atendidas y tasa de no asistencia">
          <ResponsiveContainer><ComposedChart data={serie}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0ef" /><XAxis dataKey="mes" fontSize={11} />
            <YAxis yAxisId="a" fontSize={11} /><YAxis yAxisId="b" orientation="right" fontSize={11} unit="%" />
            <Tooltip formatter={(v, n) => (n === 'No asistió (%)' ? `${Number(v).toFixed(1)} %` : numero(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="a" dataKey="atendidas" name="Atendidas" fill={COLORES[0]} radius={[3, 3, 0, 0]} />
            <Line yAxisId="b" dataKey="noShow" name="No asistió (%)" stroke={COLORES[2]} strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer>
        </Tarjeta>
        <Tarjeta titulo="Ticket promedio por mes">
          <ResponsiveContainer><ComposedChart data={serie}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0ef" /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} tickFormatter={corto} />
            <Tooltip formatter={v => moneda(v)} /><Line dataKey="ticket" name="Ticket promedio" stroke={COLORES[4]} strokeWidth={2} dot /></ComposedChart></ResponsiveContainer>
        </Tarjeta>
        <Tarjeta titulo="Comparativo entre sedes (12 meses)">
          <ResponsiveContainer><BarChart data={comparativoSedes}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0ef" /><XAxis dataKey="sede" fontSize={10} /><YAxis fontSize={11} tickFormatter={corto} />
            <Tooltip formatter={v => moneda(v)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ingresos" name="Ingresos" fill={COLORES[1]} /><Bar dataKey="gastos" name="Gastos" fill={COLORES[3]} /><Bar dataKey="utilidad" name="Utilidad" fill={COLORES[0]} /></BarChart></ResponsiveContainer>
        </Tarjeta>
        <Tarjeta titulo="Servicios con más ventas (12 meses)">
          <ResponsiveContainer><BarChart data={topServicios} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0ef" /><XAxis type="number" fontSize={11} tickFormatter={corto} />
            <YAxis type="category" dataKey="servicio" fontSize={10} width={130} /><Tooltip formatter={v => moneda(v)} /><Bar dataKey="ventas" name="Ventas" fill={COLORES[0]} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer>
        </Tarjeta>
        <Tarjeta titulo="Mezcla de métodos de pago">
          <ResponsiveContainer><PieChart><Pie data={mezclaPago} dataKey="monto" nameKey="metodo" outerRadius={90} label={e => e.metodo} labelLine={false} fontSize={10}>
            {mezclaPago.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}</Pie><Tooltip formatter={v => moneda(v)} /></PieChart></ResponsiveContainer>
        </Tarjeta>
        <Tarjeta titulo="Pacientes por grupo de edad">
          <ResponsiveContainer><BarChart data={perfilEdad}><CartesianGrid strokeDasharray="3 3" stroke="#e5e0ef" /><XAxis dataKey="grupo" fontSize={11} /><YAxis fontSize={11} />
            <Tooltip /><Bar dataKey="pacientes" name="Pacientes" fill={COLORES[1]} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
        </Tarjeta>
      </div>

      <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Productividad por podólogo (últimos 3 meses)</h3>
      <DataTable filas={tablaPodologos} filaKey="podologo_id" sinPaginacion buscador={false} compacto exportarNombre="productividad_podologos"
        vacio={{ title: 'Sin citas en el periodo' }}
        columnas={[
          { key: 'podologo', label: 'Podólogo' },
          { key: 'agendadas', label: 'Agendadas', align: 'right', render: f => numero(f.agendadas), valor: f => f.agendadas },
          { key: 'atendidas', label: 'Atendidas', align: 'right', render: f => numero(f.atendidas), valor: f => f.atendidas },
          { key: 'tasa', label: '% atendidas', align: 'right', render: f => `${f.tasa.toFixed(1)} %`, valor: f => f.tasa },
          { key: 'no_shows', label: 'No asistió', align: 'right', render: f => numero(f.no_shows), valor: f => f.no_shows },
          { key: 'ingreso', label: 'Ingreso atendido', align: 'right', render: f => moneda(f.ingreso), valor: f => f.ingreso },
        ]} />
    </div>
  )
}
