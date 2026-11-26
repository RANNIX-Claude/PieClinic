// Reportes de seguimiento de casos (F4.5): abiertos por sucursal y antigüedad, causas por sucursal y periodo (la gráfica que dice dónde está el problema),
// monto absorbido por la empresa y recurrencia en relevos. La recurrencia es un INDICADOR PARA INVESTIGAR con los casos de contexto a la vista: nunca una
// conclusión ni un ranking de personas. Cada consulta queda registrada en la bitácora de consultas (lo hace el servidor).
// El reporte de diferencias del dueño y el tablero son de la Etapa 6.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { reportesCasos } from '../../../lib/auditoria/casoApi'
import { causasParaGrafica, totalesPorCausa, fraseRecurrencia, NOMBRE_ESTADO_CASO, NOMBRE_RESPONSABLE } from '../../../lib/auditoria/casoReglas'
import { mensajeError } from '../../../lib/auditoria/roles'
import { fechaHora, moneda, hoyISO } from '../../../lib/formato'
import { useApp } from '../../../context/AppContext'
import DataTable from '../../../components/ui/DataTable'
import KPICard from '../../../components/ui/KPICard'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'

const PALETA = ['#1d4ed8', '#c2410c', '#15803d', '#7e22ce', '#b45309', '#0e7490', '#be123c', '#4d7c0f']
const restar = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)

export default function ReportesCasos({ onAbrirCaso }) {
  const { sedes } = useApp()
  const [desde, setDesde] = useState(restar(89))
  const [hasta, setHasta] = useState(hoyISO())
  const [sucursal, setSucursal] = useState('')
  const q = useQuery({
    queryKey: ['ctl-casos-reportes', desde, hasta, sucursal], retry: false,
    queryFn: async () => { const r = await reportesCasos({ desde, hasta, sucursalId: sucursal || null }); if (r.error) throw new Error(mensajeError(r.error)); return r.data },
  })
  const d = q.data
  const grafica = causasParaGrafica(d?.causas ?? [])
  const porCausa = totalesPorCausa(d?.causas ?? [])

  const colAb = [
    { key: 'sucursal', label: 'Sucursal' }, { key: 'abiertos', label: 'Abiertos', align: 'right' },
    { key: 'de_0_a_2', label: '0–2 días', align: 'right' }, { key: 'de_3_a_7', label: '3–7', align: 'right' }, { key: 'de_8_a_14', label: '8–14', align: 'right' },
    { key: 'de_15_a_30', label: '15–30', align: 'right' }, { key: 'mas_de_30', label: 'Más de 30', align: 'right', render: f => (f.mas_de_30 ? <span className="bd r">{f.mas_de_30}</span> : 0) },
    { key: 'mas_antiguo_dias', label: 'El más antiguo (días)', align: 'right' }, { key: 'sin_asignar', label: 'Sin asignar', align: 'right' },
    { key: 'vencidos', label: 'Compromiso vencido', align: 'right' }, { key: 'ajuste_fallido', label: 'Ajuste fallido', align: 'right' },
    { key: 'valor_abierto', label: 'Valor abierto', align: 'right', render: f => moneda(f.valor_abierto) },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0 }}><label>Desde</label><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Hasta</label><input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Sucursal</label>
          <select value={sucursal} onChange={e => setSucursal(e.target.value)}><option value="">Todas</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
        <div className="hint">El periodo aplica a causas, monto y recurrencia; los casos abiertos son la foto de hoy.</div>
      </div>
      {q.isLoading && <LoadingSpinner />}
      {q.isError && <EmptyState title="No se pudo cargar el reporte" description={q.error.message} />}
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <KPICard title="Casos abiertos hoy" value={(d.abiertos_por_sucursal ?? []).reduce((s, x) => s + x.abiertos, 0)} />
            <KPICard title="Absorbido por la empresa" value={moneda(d.monto.empresa_total)} subtitle="Casos cerrados en el periodo, al costo" />
            <KPICard title="Valor ajustado" value={moneda(d.monto.valor_ajustado)} subtitle="Casos cerrados con ajuste" />
            {(d.monto.por_responsable ?? []).filter(r => r.responsable !== 'empresa').map(r => (
              <KPICard key={r.responsable} title={`Absorbe: ${NOMBRE_RESPONSABLE[r.responsable]}`} value={moneda(r.monto)} subtitle={`${r.casos} caso(s)`} />
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Casos abiertos por sucursal y antigüedad</h3>
            <DataTable columnas={colAb} filas={d.abiertos_por_sucursal} filaKey="sucursal_id" buscador={false} sinPaginacion exportarNombre="casos_abiertos_antiguedad"
              vacio={{ title: 'Nada abierto', description: 'No hay casos abiertos con estos filtros.' }} />
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Causas por sucursal y periodo</h3>
            {grafica.filas.length === 0 ? <div className="hint">No hay casos cerrados con causa en el periodo.</div> : (
              <>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grafica.filas} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="sucursal" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip /><Legend />
                      {grafica.causas.map((c, i) => <Bar key={c} dataKey={c} stackId="causas" fill={PALETA[i % PALETA.length]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Total por causa: {porCausa.map(c => `${c.causa} ${c.casos}`).join(' · ')}</div>
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Recurrencia en relevos de turno</h3>
            <div className="hint" role="note" style={{ marginBottom: 8 }}>{d.recurrencia.nota}</div>
            {(d.recurrencia.por_persona_saliente ?? []).length === 0 && (d.recurrencia.por_turno ?? []).length === 0
              ? <div className="hint">Nadie repite del lado saliente en {d.recurrencia.umbral_relevos} o más relevos con diferencia en este periodo.</div> : null}
            {(d.recurrencia.por_persona_saliente ?? []).map(p => (
              <div key={p.usuario_id} style={{ borderTop: '1px solid var(--border, #ddd)', padding: '8px 0', fontSize: 13 }}>
                <div>{fraseRecurrencia(p)}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {p.lista.map(c => <button key={c.id} type="button" className="btn o sm" onClick={() => onAbrirCaso(c.id)} title="Abrir el caso con sus movimientos de contexto">{c.folio} · {c.producto ?? '—'} · {NOMBRE_ESTADO_CASO[c.estado]}</button>)}
                </div>
              </div>
            ))}
            {(d.recurrencia.por_turno ?? []).map(t => (
              <div key={`${t.sucursal}-${t.turno}`} style={{ borderTop: '1px solid var(--border, #ddd)', padding: '8px 0', fontSize: 13 }}>
                <div>{t.sucursal} · turno «{t.turno}»: {t.relevos_con_diferencia} relevos con diferencia ({t.casos} casos). Indicador para investigar.</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {t.lista.map(c => <button key={c.id} type="button" className="btn o sm" onClick={() => onAbrirCaso(c.id)}>{c.folio} · {fechaHora(c.abierto_en)}</button>)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
