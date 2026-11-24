// Dashboard (mockup 31): clon del Dashboard/EDR de IRP adaptado a la clínica.
// Parte financiera solo con 'dashboard.finanzas' (Administración); podólogo y recepción ven la parte operativa.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, CalendarCheck, DollarSign, MessageSquareWarning, Package, Percent, Receipt, UserPlus, TrendingUp } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { moneda, numero, fecha } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { agruparSuma, conParticipacion, margenPct, ocupacionPct, quejasPor100, ticketPromedio, variacionPeriodo, suma, serieTemporal } from '../../lib/finanzas/kpis.js'
import { rangoMes, semanaCorte, nombreMes } from '../../lib/finanzas/semana.js'
import { PARAMETROS_DEFAULT } from '../../lib/finanzas/constantes.js'
import { useVista, SelectorMes, anioMesActual, limitesMesTs, usePerfilesMapa, useProductosMapa, BotonesExportar, TablaImprimible } from './componentes/comunes.jsx'

const COLORES = ['var(--accent)', 'var(--green)', 'var(--gold)', 'var(--red)', '#4A90D9', '#8E6FBF', '#2A9D8F', '#999']
const pctTxt = n => (n == null ? '—' : `${n}%`)

function Bloque({ titulo, children, ayuda, style }) {
  return (
    <div className="card" style={style}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{titulo}</h3>
      {ayuda && <div className="mini" style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>{ayuda}</div>}
      {children}
    </div>
  )
}
function Barras({ datos, color = 'var(--accent)', formato = moneda }) {
  const max = Math.max(1, ...datos.map(d => d.total))
  if (!datos.length) return <EmptyState compacto title="Sin datos" description="No hay movimientos en el periodo." />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {datos.map(d => (
        <div key={d.clave}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
            <span>{d.clave}</span><b className="num">{formato(d.total)}{d.pct != null ? ` · ${d.pct}%` : ''}</b>
          </div>
          <div style={{ background: 'var(--row-line)', height: 8, borderRadius: 6 }}>
            <div style={{ width: `${(d.total / max) * 100}%`, background: color, height: 8, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { sedes, sedeActivaId } = useApp()
  const verFinanzas = usePermiso('dashboard.finanzas')
  const [{ anio, mes }, setPeriodo] = useState(anioMesActual())
  const [podologoId, setPodologoId] = useState('')
  const rango = rangoMes(anio, mes)
  const ts = limitesMesTs(anio, mes)
  const prev = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
  const rangoPrev = rangoMes(prev.anio, prev.mes)
  const { mapa: nombres, perfiles } = usePerfilesMapa()
  const prodNombre = useProductosMapa()
  const nomSede = id => sedes?.find(s => s.id === id)?.nombre ?? '—'

  // Financieros (solo Administración)
  const ing = useVista('dash-ing', 'prp_ingresos_mensuales', { filtros: { mes: `${rango.desde}` }, limite: 2000 }, { enabled: verFinanzas })
  const ingPrev = useVista('dash-ing-prev', 'prp_ingresos_mensuales', { filtros: { mes: rangoPrev.desde }, limite: 2000 }, { enabled: verFinanzas })
  const edr = useVista('dash-edr', 'prp_edr_resultados', { filtros: { anio, mes }, limite: 100 }, { enabled: verFinanzas })
  const porServicio = useVista('dash-serv', 'prp_ingreso_por_servicio', { filtros: { mes: rango.desde }, limite: 3000 }, { enabled: verFinanzas })
  const lineas = useVista('dash-lineas', 'prp_venta_lineas', {
    filtros: { cobrada_en: ts, venta_estado: ['cobrada', 'por_facturar', 'facturada'] }, columnas: 'sede_id,atendio_id,atendio_nombre,importe,tipo,cobrada_en', limite: 10000,
  }, { enabled: verFinanzas })
  const tickets = useVista('dash-tickets', 'prp_ventas_por_dia', { filtros: { dia: { gte: rango.desde, lte: rango.hasta } }, limite: 1000 }, { enabled: verFinanzas })
  const kpis = useVista('dash-kpis', 'prp_kpis_finanzas', {}, { enabled: verFinanzas })
  const alertas = useVista('dash-alertas', 'prp_alertas_financieras', { limite: 40 }, { enabled: verFinanzas })
  // Operativos
  const ocup = useVista('dash-ocup', 'prp_ocupacion_podologo_dia', { filtros: { dia: { gte: rango.desde, lte: rango.hasta }, podologo_id: podologoId }, limite: 10000 })
  const ocupPrev = useVista('dash-ocup-prev', 'prp_ocupacion_podologo_dia', { filtros: { dia: { gte: rangoPrev.desde, lte: rangoPrev.hasta }, podologo_id: podologoId }, limite: 10000 })
  const quejas = useVista('dash-quejas', 'prp_quejas_resumen', { filtros: { fecha_hora: ts, podologo_id: podologoId }, limite: 3000 })
  const nuevos = useVista('dash-nuevos', 'prp_agenda', { filtros: { inicio: ts, primera_vez: true, estado: ['atendida', 'confirmada', 'por_confirmar', 'en_camino'], podologo_id: podologoId }, columnas: 'id', contar: true, limite: 1 })
  const inv = useVista('dash-inv', 'prp_inventario', { filtros: { estado: ['bajo_minimo', 'sin_existencia'] }, limite: 300 })

  const cargando = ocup.cargando || quejas.cargando || (verFinanzas && ing.cargando)

  const d = useMemo(() => {
    const ingresosMes = suma(ing.filas, 'importe'), ingresosPrev = suma(ingPrev.filas, 'importe')
    const atendidas = suma(ocup.filas, 'citas_atendidas'), atendidasPrev = suma(ocupPrev.filas, 'citas_atendidas')
    const agend = suma(ocup.filas, 'minutos_agendados'), disp = suma(ocup.filas, 'minutos_disponibles')
    const ocupGlobal = ocupacionPct(agend, disp)
    const faltas = suma(ocup.filas, 'no_asistio') + suma(ocup.filas, 'canceladas')
    // Por sede
    const sedeIng = conParticipacion(agruparSuma(ing.filas.map(f => ({ ...f, s: nomSede(f.sede_id) })), 's', 'importe'))
    const sedeOcup = Object.values(ocup.filas.reduce((a, f) => {
      const k = f.sede_id; a[k] ??= { clave: nomSede(k), ag: 0, di: 0 }; a[k].ag += Number(f.minutos_agendados) || 0; a[k].di += Number(f.minutos_disponibles) || 0; return a
    }, {})).map(x => ({ clave: x.clave, total: ocupacionPct(x.ag, x.di) ?? 0 })).sort((a, b) => b.total - a.total)
    // Por servicio (solo servicios; productos aparte como una barra)
    const serv = conParticipacion(agruparSuma(porServicio.filas.map(f => ({ ...f, k: f.tipo === 'producto' ? 'Productos' : f.descripcion })), 'k', 'base_neta')).slice(0, 10)
    // Por podólogo (quién atendió / vendió)
    const pod = agruparSuma(lineas.filas.filter(l => l.atendio_id), l => l.atendio_nombre ?? nombres[l.atendio_id] ?? 'Sin nombre', 'importe').slice(0, 10)
    // Citas por semana de corte
    const sem = {}
    for (const f of ocup.filas) {
      const s = semanaCorte(f.dia); const k = s.etiqueta
      sem[k] ??= { semana: k, atendidas: 0, faltas: 0, inicio: s.inicio }
      sem[k].atendidas += Number(f.citas_atendidas) || 0; sem[k].faltas += (Number(f.no_asistio) || 0) + (Number(f.canceladas) || 0)
    }
    const citasSemana = Object.values(sem).sort((a, b) => a.inicio.localeCompare(b.inicio))
    // Quejas por podólogo
    const qp = {}
    for (const q of quejas.filas) {
      const k = q.podologo_id ?? 'sin'; qp[k] ??= { id: k, podologo: k === 'sin' ? 'Sin podólogo señalado' : nombres[k] ?? '—', sedes: new Set(), n: 0, abiertas: 0, ultima: null }
      qp[k].n++; qp[k].sedes.add(nomSede(q.sede_id)); if (!['resuelta', 'cerrada'].includes(q.estado)) qp[k].abiertas++
      if (!qp[k].ultima || q.fecha_hora > qp[k].ultima) qp[k].ultima = q.fecha_hora
    }
    const quejasPod = Object.values(qp).sort((a, b) => b.n - a.n)
    const abiertas = quejas.filas.filter(q => !['resuelta', 'cerrada'].includes(q.estado)).length
    // EDR
    const proyIng = suma(edr.filas, 'proy_ingresos'), realIngEdr = suma(edr.filas, 'real_ingresos')
    const util = suma(edr.filas, 'real_utilidad'), gastosEdr = suma(edr.filas, 'real_gastos')
    const ticket = ticketPromedio(suma(tickets.filas, 'ventas_total'), suma(tickets.filas, 'tickets'))
    return { ingresosMes, ingresosPrev, atendidas, atendidasPrev, ocupGlobal, faltas, sedeIng, sedeOcup, serv, pod, citasSemana, quejasPod, abiertas, proyIng, realIngEdr, util, gastosEdr, ticket }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ing.filas, ingPrev.filas, ocup.filas, ocupPrev.filas, porServicio.filas, lineas.filas, quejas.filas, edr.filas, tickets.filas, nombres, sedes])

  const bajos = useMemo(() => inv.filas.slice(0, 12), [inv.filas])
  const bajosPorSede = useMemo(() => agruparSuma(inv.filas.map(f => ({ ...f, n: 1, k: nomSede(f.sede_id) })), 'k', 'n'), [inv.filas, sedes]) // eslint-disable-line
  const metaOcup = 80
  const pctProy = d.proyIng > 0 ? Math.round((d.realIngEdr / d.proyIng) * 100) : null
  const alertasAltas = alertas.filas.filter(a => a.severidad === 'alta')

  const hojas = [
    { nombre: 'Resumen', columnas: [{ label: 'Indicador', key: 'k' }, { label: 'Valor', key: 'v' }], filas: [
      { k: 'Periodo', v: `${nombreMes(mes)} ${anio}` },
      ...(verFinanzas ? [{ k: 'Ingreso del mes', v: d.ingresosMes }, { k: 'Utilidad neta (EDR)', v: d.util }, { k: 'Ticket promedio', v: d.ticket }] : []),
      { k: 'Citas atendidas', v: d.atendidas }, { k: 'Ocupación %', v: d.ocupGlobal ?? '' }, { k: 'Quejas', v: quejas.filas.length }, { k: 'Productos bajo mínimo', v: inv.filas.length },
    ] },
    ...(verFinanzas ? [{ nombre: 'Ingreso por servicio', columnas: [{ label: 'Servicio', key: 'clave' }, { label: 'Importe sin IVA', key: 'total', formato: 'moneda' }], filas: d.serv }, { nombre: 'Ingreso por sede', columnas: [{ label: 'Sede', key: 'clave' }, { label: 'Importe', key: 'total', formato: 'moneda' }], filas: d.sedeIng }, { nombre: 'Ingreso por podólogo', columnas: [{ label: 'Podólogo', key: 'clave' }, { label: 'Importe', key: 'total', formato: 'moneda' }], filas: d.pod }] : []),
  ]

  const sinNada = !cargando && !d.atendidas && !quejas.filas.length && !inv.filas.length && !d.ingresosMes

  return (
    <div className="pagina">
      <PageHeader titulo="Dashboard" subtitulo={`${nombreMes(mes).replace(/^./, c => c.toUpperCase())} ${anio} · ${sedeActivaId ? nomSede(sedeActivaId) : 'todas mis sedes'}`}
        acciones={<BotonesExportar nombre="dashboard" titulo={`Dashboard ${nombreMes(mes)} ${anio}`} hojas={hojas} deshabilitado={cargando}>
          <TablaImprimible columnas={[{ key: 'k', label: 'Indicador' }, { key: 'v', label: 'Valor', align: 'right' }]} filas={hojas[0].filas} />
        </BotonesExportar>} />
      <div className="toolbar">
        <SelectorMes anio={anio} mes={mes} onChange={setPeriodo} />
        <select value={podologoId} onChange={e => setPodologoId(e.target.value)} aria-label="Podólogo">
          <option value="">Todos los podólogos</option>
          {perfiles.filter(p => p.rol === 'podologo').map(p => <option key={p.id} value={p.id}>{nombres[p.id]}</option>)}
        </select>
        <button type="button" className="btn o sm" onClick={() => setPeriodo(anioMesActual())}>Mes actual</button>
      </div>

      {cargando && <LoadingSpinner />}
      {sinNada && <EmptyState title="Aún no hay datos del periodo" description="Cuando haya citas, cobros o quejas en este mes aparecerán aquí." />}

      {!cargando && !sinNada && (<>
        {verFinanzas && alertasAltas.length > 0 && (
          <div className="card" style={{ borderLeft: '4px solid var(--red)', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {alertasAltas.length} alerta(s) de prioridad alta</div>
            <ul style={{ margin: '6px 0 0 18px', fontSize: 12.5 }}>
              {alertasAltas.slice(0, 4).map((a, i) => <li key={i}>{a.mensaje} <span className="mini" style={{ color: 'var(--muted)' }}>({fecha(a.fecha)})</span></li>)}
            </ul>
          </div>
        )}

        <div className="grid-kpis">
          {verFinanzas && <KPICard title="Ingreso del mes (real)" value={moneda(d.ingresosMes)} icon={DollarSign} color="var(--green)"
            subtitle={pctProy != null ? `${pctProy}% de la proyección (${moneda(d.proyIng)})` : 'Sin proyección capturada'}
            trend={variacionPeriodo(d.ingresosMes, d.ingresosPrev)} ayuda="Cobros del mes menos reembolsos (base caja, con IVA), de prp_ingresos_mensuales. La proyección viene del EDR (proy_*, captura manual)." />}
          <KPICard title="Citas atendidas" value={numero(d.atendidas)} icon={CalendarCheck} subtitle={`${numero(d.faltas)} faltas o canceladas`} trend={variacionPeriodo(d.atendidas, d.atendidasPrev)} />
          <KPICard title="Ocupación de agenda" value={pctTxt(d.ocupGlobal)} icon={Percent} color={d.ocupGlobal != null && d.ocupGlobal >= metaOcup ? 'var(--green)' : 'var(--gold)'} subtitle={`Meta ${metaOcup}%`}
            ayuda="Minutos agendados / minutos disponibles según los horarios de atención de cada podólogo." />
          <KPICard title="Quejas e incidencias" value={numero(quejas.filas.length)} icon={MessageSquareWarning} color="var(--red)"
            subtitle={`${d.abiertas} abiertas · ${quejasPor100(quejas.filas.length, d.atendidas) ?? '—'} por 100 citas`} />
          {verFinanzas && <KPICard title="Utilidad neta (EDR)" value={moneda(d.util)} icon={TrendingUp} color="var(--accent)"
            subtitle={margenPct(d.realIngEdr, d.gastosEdr) != null ? `${margenPct(d.realIngEdr, d.gastosEdr)}% del ingreso · sin impuestos` : 'EDR sin calcular'} />}
          {verFinanzas && <KPICard title="Ticket promedio" value={moneda(d.ticket)} icon={Receipt} subtitle={`${numero(suma(tickets.filas, 'tickets'))} tickets`} />}
          <KPICard title="Pacientes nuevos" value={numero(nuevos.count ?? 0)} icon={UserPlus} subtitle="Primera vez en el mes" />
          <KPICard title="Inventario bajo mínimo" value={numero(inv.filas.length)} icon={Package} color="var(--gold)"
            subtitle={bajosPorSede.length ? bajosPorSede.map(b => `${b.clave}: ${b.total}`).join(' · ') : 'Sin faltantes'} />
        </div>

        {verFinanzas && (
          <div className="grid2" style={{ marginBottom: 14 }}>
            <Bloque titulo="Ingreso por servicio (mes)" ayuda="Base sin IVA de lo cobrado, por servicio o producto.">
              <Barras datos={d.serv} />
            </Bloque>
            <Bloque titulo="Ingreso por sede">
              <Barras datos={d.sedeIng} />
            </Bloque>
            <Bloque titulo="Ingreso por podólogo" ayuda="Quien atendió o vendió cada línea cobrada (base de comisión).">
              <Barras datos={d.pod} color="var(--green)" />
            </Bloque>
            <Bloque titulo="Participación por sede">
              {d.sedeIng.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d.sedeIng} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tickFormatter={v => `${Math.round(v / 1000)}k`} /><YAxis type="category" dataKey="clave" width={110} />
                    <Tooltip formatter={v => moneda(v)} />
                    <Bar dataKey="total" name="Ingreso">{d.sedeIng.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState compacto title="Sin datos" description="No hay cobros en el periodo." />}
            </Bloque>
          </div>
        )}

        <div className="grid2" style={{ marginBottom: 14 }}>
          <Bloque titulo="Ocupación de agenda por sede" ayuda="Horas agendadas / horas disponibles.">
            <Barras datos={d.sedeOcup} formato={n => `${n}%`} color="var(--gold)" />
          </Bloque>
          <Bloque titulo="Citas por semana (sábado → viernes)">
            {d.citasSemana.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={d.citasSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="semana" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="atendidas" name="Atendidas" stroke="var(--green)" strokeWidth={2} />
                  <Line type="monotone" dataKey="faltas" name="Faltas / canceladas" stroke="var(--red)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState compacto title="Sin citas" description="No hay citas en el periodo." />}
          </Bloque>
        </div>

        <div className="grid2" style={{ marginBottom: 14 }}>
          <Bloque titulo="Quejas e incidencias por podólogo (mes)">
            {d.quejasPod.length ? (
              <div className="tabla-wrap"><table>
                <thead><tr><th>Podólogo</th><th>Sede</th><th className="num">Quejas</th><th className="num">Abiertas</th><th>Última</th></tr></thead>
                <tbody>{d.quejasPod.map(q => (
                  <tr key={q.id}><td>{q.podologo}</td><td>{[...q.sedes].join(' / ')}</td><td className="num">{q.n}</td><td className="num">{q.abiertas}</td><td>{fecha(q.ultima)}</td></tr>
                ))}</tbody></table></div>
            ) : <EmptyState compacto title="Sin quejas" description="No se registraron quejas en el periodo." />}
            <div style={{ marginTop: 8 }}><Link to="/reportes" className="btn o sm">Ver reporte de quejas</Link></div>
          </Bloque>
          <Bloque titulo="Inventario bajo mínimo">
            {bajos.length ? (
              <div className="tabla-wrap"><table>
                <thead><tr><th>Producto</th><th>Sede</th><th className="num">Existencia</th><th className="num">Mínimo</th><th>Estado</th></tr></thead>
                <tbody>{bajos.map(b => (
                  <tr key={b.id}><td>{prodNombre[b.producto_id] ?? '—'}</td><td>{b.sede_nombre}</td><td className="num">{numero(b.existencia)}</td><td className="num">{numero(b.minimo)}</td><td><StatusBadge estado={b.estado} /></td></tr>
                ))}</tbody></table></div>
            ) : <EmptyState compacto title="Sin faltantes" description="Ningún producto está bajo su mínimo." />}
          </Bloque>
        </div>

        {verFinanzas && (
          <div className="grid2">
            <Bloque titulo="Estado de resultados del mes (resumen)" ayuda="Utilidad gerencial sin impuestos. Proyectado = captura manual del administrador.">
              {edr.filas.length ? (
                <div className="tabla-wrap"><table>
                  <thead><tr><th>Sede</th><th className="num">Ingreso proy.</th><th className="num">Ingreso real</th><th className="num">Gastos real</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                  <tbody>{edr.filas.map((r, i) => (
                    <tr key={i}><td>{r.sede_nombre}</td><td className="num">{moneda(r.proy_ingresos)}</td><td className="num">{moneda(r.real_ingresos)}</td><td className="num">{moneda(r.real_gastos)}</td><td className="num">{moneda(r.real_utilidad)}</td><td className="num">{pctTxt(r.real_margen_pct)}</td></tr>
                  ))}</tbody></table></div>
              ) : <EmptyState compacto title="EDR sin datos" description="Aún no hay estado de resultados para este mes." />}
              <div style={{ marginTop: 8 }}><Link to="/estado-resultados" className="btn o sm">Abrir estado de resultados</Link></div>
            </Bloque>
            <Bloque titulo="Pendientes y alertas financieras">
              <div style={{ fontSize: 12.5, display: 'grid', gap: 6, marginBottom: 8 }}>
                <div>Por cobrar: <b className="num">{moneda(suma(kpis.filas, 'por_cobrar'))}</b></div>
                <div>Por pagar: <b className="num">{moneda(suma(kpis.filas, 'por_pagar'))}</b> · {numero(suma(kpis.filas, 'cxp_vencidas'))} vencidas</div>
                <div>Cobros por validar: <b>{numero(suma(kpis.filas, 'ingresos_por_validar'))}</b> · observados: <b>{numero(suma(kpis.filas, 'ingresos_observados'))}</b></div>
                <div>Valor del inventario: <b className="num">{moneda(suma(kpis.filas, 'valor_inventario'))}</b></div>
              </div>
              {alertas.filas.length ? (
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, maxHeight: 170, overflow: 'auto' }}>
                  {alertas.filas.slice(0, 12).map((a, i) => <li key={i}><StatusBadge estado={a.severidad === 'alta' ? 'rechazada' : a.severidad === 'media' ? 'pendiente' : 'borrador'} label={a.severidad} /> {a.mensaje}</li>)}
                </ul>
              ) : <div className="mini" style={{ color: 'var(--muted)' }}><Activity size={12} style={{ verticalAlign: -2 }} /> Sin alertas.</div>}
            </Bloque>
          </div>
        )}
      </>)}
      {!verFinanzas && <div className="mini" style={{ color: 'var(--muted)', marginTop: 10, fontSize: 11 }}>Las cifras financieras son visibles solo para Administración.</div>}
    </div>
  )
}
