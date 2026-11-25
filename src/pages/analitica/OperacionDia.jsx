// Operación del día · cómo van TODAS las sucursales hoy, hora por hora. Lo ven los dueños (consolidado) y el supervisor (solo sus sucursales,
// por RLS). Lee la vista prp_operacion_hora (tickets cobrados en vivo) y se refresca sola: cada ola de tickets que entra en una sucursal
// aparece aquí sin recargar. No es un tablero aparte: son los mismos tickets de la caja.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, DollarSign, Receipt, Stethoscope, Store } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer } from '../../lib/api'
import { moneda, numero } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import EmptyState from '../../components/ui/EmptyState'
import { errMsg, EstadoConsulta } from '../utilerias/comun'

const hoyLocal = () => new Date().toLocaleDateString('en-CA')
const hh = h => `${String(h).padStart(2, '0')}:00`

export default function OperacionDia() {
  const { rol, sedes } = useApp()
  const [dia, setDia] = useState(hoyLocal())
  const q = useQuery({
    queryKey: ['operacion-dia', dia],
    queryFn: async () => {
      const r = await leer('prp_operacion_hora', { sedeCol: false, filtros: { dia }, limite: 2000 })
      if (r.error) throw new Error(errMsg(r.error))
      return { filas: r.data, hora: new Date() }
    },
    refetchInterval: 8000,
    retry: false,
  })
  const filas = q.data?.filas ?? []

  const m = useMemo(() => {
    const horas = filas.map(f => Number(f.hora))
    const h0 = Math.min(9, ...(horas.length ? horas : [9])), h1 = Math.max(19, ...(horas.length ? horas : [19]))
    const cols = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
    const porSede = new Map()
    for (const f of filas) {
      const s = porSede.get(f.sede_id) ?? { id: f.sede_id, nombre: f.sede_nombre, clave: f.sede_clave, horas: {}, tickets: 0, ventas: 0, servicios: 0, productos: 0 }
      s.horas[f.hora] = (s.horas[f.hora] ?? 0) + Number(f.tickets)
      s.tickets += Number(f.tickets); s.ventas += Number(f.ventas); s.servicios += Number(f.servicios); s.productos += Number(f.productos)
      porSede.set(f.sede_id, s)
    }
    const lista = [...porSede.values()].sort((a, b) => b.ventas - a.ventas)
    const total = lista.reduce((t, s) => ({ tickets: t.tickets + s.tickets, ventas: t.ventas + s.ventas, servicios: t.servicios + s.servicios, productos: t.productos + s.productos }), { tickets: 0, ventas: 0, servicios: 0, productos: 0 })
    let acum = 0, acumT = 0
    const serie = cols.map(h => {
      const t = filas.filter(f => Number(f.hora) === h).reduce((s, f) => s + Number(f.tickets), 0)
      const v = filas.filter(f => Number(f.hora) === h).reduce((s, f) => s + Number(f.ventas), 0)
      acum += v; acumT += t
      return { hora: hh(h), tickets: t, ventas_acumuladas: Math.round(acum), tickets_acumulados: acumT }
    })
    const maxCelda = Math.max(1, ...lista.flatMap(s => Object.values(s.horas)))
    return { cols, lista, total, serie, maxCelda }
  }, [filas])

  const totalSedes = sedes?.filter(s => s.activa !== false).length ?? m.lista.length
  const esSupervisor = rol === 'supervisor'

  return (
    <div className="pagina">
      <PageHeader titulo="Operación del día" subtitulo={esSupervisor ? 'Tus sucursales, hora por hora' : 'Todas las sucursales, hora por hora · se actualiza sola cada 8 segundos'}
        acciones={<input type="date" value={dia} max={hoyLocal()} onChange={e => e.target.value && setDia(e.target.value)} aria-label="Día" />} />

      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && (
        <>
          <div className="grid-kpis">
            <KPICard title="Tickets cobrados" icon={Receipt} value={numero(m.total.tickets)} subtitle={`${m.lista.length} de ${totalSedes} sucursales con operación`} color="var(--accent)" />
            <KPICard title="Ventas del día" icon={DollarSign} value={moneda(m.total.ventas)} subtitle="IVA incluido, tickets cobrados" color="var(--green)" />
            <KPICard title="Servicios realizados" icon={Stethoscope} value={numero(m.total.servicios)} subtitle={`${numero(m.total.productos)} productos vendidos`} color="var(--accent2)" />
            <KPICard title="Ticket promedio" icon={Activity} value={m.total.tickets ? moneda(m.total.ventas / m.total.tickets) : '—'} subtitle={q.data?.hora ? `Actualizado ${q.data.hora.toLocaleTimeString('es-MX')}` : ''} color="var(--gold)" />
          </div>

          {!m.lista.length ? (
            <EmptyState icon={Store} title="Aún no hay tickets este día" description="Cuando una sucursal cobre, aparece aquí al instante. Para ensayar un día completo usa Utilerías → Simulador de jornada." />
          ) : (
            <>
              <div className="card" style={{ marginTop: 14 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Cómo se va acumulando el día</h3>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={m.serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--row-line)" />
                      <XAxis dataKey="hora" fontSize={12} />
                      <YAxis yAxisId="t" fontSize={12} allowDecimals={false} />
                      <YAxis yAxisId="v" orientation="right" fontSize={12} tickFormatter={n => `$${Math.round(n / 1000)}k`} />
                      <Tooltip formatter={(v, n) => (n === 'Ventas acumuladas' ? moneda(v) : numero(v))} />
                      <Legend />
                      <Bar yAxisId="t" dataKey="tickets" name="Tickets en la hora" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="v" dataKey="ventas_acumuladas" name="Ventas acumuladas" stroke="var(--green)" strokeWidth={2.5} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card" style={{ marginTop: 14, overflowX: 'auto' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Tickets por sucursal y hora</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Sucursal</th>
                      {m.cols.map(h => <th key={h} style={{ padding: '6px 6px', fontWeight: 500 }}>{hh(h)}</th>)}
                      <th style={{ padding: '6px 8px' }}>Tickets</th><th style={{ padding: '6px 8px' }}>Servicios</th>
                      <th style={{ padding: '6px 8px' }}>Ventas</th><th style={{ padding: '6px 8px' }}>% del día</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.lista.map(s => (
                      <tr key={s.id} style={{ borderTop: '1px solid var(--row-line)', textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.nombre}</td>
                        {m.cols.map(h => {
                          const n = s.horas[h] ?? 0
                          return <td key={h} className="num" style={{ padding: '6px 6px', background: n ? `color-mix(in srgb, var(--accent) ${Math.round(12 + 50 * n / m.maxCelda)}%, transparent)` : 'transparent' }}>{n || ''}</td>
                        })}
                        <td className="num" style={{ padding: '6px 8px', fontWeight: 700 }}>{numero(s.tickets)}</td>
                        <td className="num" style={{ padding: '6px 8px' }}>{numero(s.servicios)}</td>
                        <td className="num" style={{ padding: '6px 8px', fontWeight: 700 }}>{moneda(s.ventas)}</td>
                        <td className="num" style={{ padding: '6px 8px' }}>{m.total.ventas ? `${(100 * s.ventas / m.total.ventas).toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--row-line)', textAlign: 'right', fontWeight: 700 }}>
                      <td style={{ textAlign: 'left', padding: '6px 8px' }}>Total</td>
                      {m.cols.map(h => <td key={h} className="num" style={{ padding: '6px 6px' }}>{m.lista.reduce((t, s) => t + (s.horas[h] ?? 0), 0) || ''}</td>)}
                      <td className="num" style={{ padding: '6px 8px' }}>{numero(m.total.tickets)}</td>
                      <td className="num" style={{ padding: '6px 8px' }}>{numero(m.total.servicios)}</td>
                      <td className="num" style={{ padding: '6px 8px' }}>{moneda(m.total.ventas)}</td>
                      <td className="num" style={{ padding: '6px 8px' }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
