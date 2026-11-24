// Cierre y reapertura de periodos (semana y mes) — P-088/P-099. Solo Administración; la reapertura exige motivo y queda en bitácora.
import { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { moneda, fecha, fechaHora, hoyISO } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import { semanaCorte, etiquetaRango, ultimoDiaMes, nombreMes } from '../../lib/finanzas/semana.js'
import { parametrosFinanzas } from '../../lib/finanzas/constantes.js'
import { useVista, VistaNoDisponible } from './componentes/comunes.jsx'
import { BotonCierre } from './componentes/cierres.jsx'

export default function Cierres() {
  const { organizacion, sedeActivaId, sedeActiva } = useApp()
  const dow = parametrosFinanzas(organizacion).semana_inicio_dow
  const hoy = hoyISO()
  const [tab, setTab] = useState('pendientes')
  const [detalle, setDetalle] = useState(null)
  const cierresV = useVista('cierres', 'prp_cierres_periodo', { sedeCol: false, orden: { columna: 'fecha_inicio', asc: false }, limite: 1000 })
  const semV = useVista('cierres-sem', 'prp_resumen_semanal', { orden: { columna: 'semana_inicio', asc: false }, limite: 1500 })

  const cierres = cierresV.filas
  const delAlcance = cierres.filter(c => (c.sede_id ?? null) === (sedeActivaId ?? null))

  // Semanas terminadas con movimiento y sin cierre vigente (mismo alcance de sede)
  const semanasPend = useMemo(() => {
    const ini = new Map()
    for (const f of semV.filas) if (f.semana_fin < hoy) ini.set(f.semana_inicio, true)
    return [...ini.keys()].filter(i => !delAlcance.some(c => c.tipo === 'semana' && c.fecha_inicio === i && c.estado === 'cerrado'))
      .sort((a, b) => b.localeCompare(a)).map(i => semanaCorte(i, dow))
  }, [semV.filas, delAlcance, hoy, dow])

  // Meses terminados (últimos 12) con movimiento en alguna semana y sin cierre
  const mesesPend = useMemo(() => {
    const [a, m] = hoy.split('-').map(Number)
    const meses = new Set(semV.filas.flatMap(f => [f.semana_inicio.slice(0, 7), f.semana_fin.slice(0, 7)]))
    const out = []
    for (let k = 1; k <= 12; k++) {
      const d = new Date(Date.UTC(a, m - 1 - k, 1)); const anio = d.getUTCFullYear(), mes = d.getUTCMonth() + 1
      const clave = `${anio}-${String(mes).padStart(2, '0')}`
      if (ultimoDiaMes(anio, mes) >= hoy || !meses.has(clave)) continue
      if (!delAlcance.some(c => c.tipo === 'mes' && c.fecha_inicio.slice(0, 7) === clave && c.estado === 'cerrado')) out.push({ anio, mes, clave, inicio: `${clave}-01` })
    }
    return out
  }, [semV.filas, delAlcance, hoy])

  const cols = [
    { key: 'tipo', label: 'Tipo', filtro: true, render: r => (r.tipo === 'mes' ? 'Mes' : 'Semana') },
    { key: 'etiqueta', label: 'Periodo', valor: r => r.etiqueta },
    { key: 'rango', label: 'Fechas', valor: r => r.fecha_inicio, render: r => etiquetaRango(r.fecha_inicio, r.fecha_fin) },
    { key: 'sede_nombre', label: 'Sede', valor: r => r.sede_nombre ?? 'Toda la clínica', filtro: true },
    { key: 'ingresos', label: 'Ingresos', align: 'right', render: r => moneda(r.ingresos) },
    { key: 'gastos', label: 'Gastos', align: 'right', render: r => moneda(r.gastos) },
    { key: 'neto', label: 'Neto', align: 'right', render: r => moneda(r.neto) },
    { key: 'estado', label: 'Estado', filtro: true, render: r => <StatusBadge estado={r.estado} /> },
    { key: 'cerrado_en', label: 'Cerrado', render: r => fechaHora(r.cerrado_en) },
    { key: 'acc', label: '', sortable: false, exportar: false, render: r => (
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <button type="button" className="btn o sm" onClick={() => setDetalle(r)}><Eye size={12} /> Ver</button>
        <BotonCierre tipo={r.tipo} fecha={r.fecha_inicio} etiqueta={r.etiqueta} sedeId={r.sede_id} cierre={r} terminado />
      </div>) },
  ]

  if (cierresV.noDisponible) return <div className="pagina"><PageHeader titulo="Cierre de periodos" /><VistaNoDisponible nombre="prp_cierres_periodo" /></div>
  const cerrados = cierres.filter(c => c.estado === 'cerrado'), reabiertos = cierres.filter(c => c.estado === 'reabierto')

  return (
    <div className="pagina">
      <PageHeader titulo="Cierre de periodos" subtitulo={`Semana sábado → viernes y mes · alcance: ${sedeActiva?.nombre ?? 'toda la clínica (consolidado)'}`} />
      <div className="note" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Un periodo cerrado congela sus totales: no se crean, editan ni borran registros con fecha dentro de él (los ajustes se hacen en el periodo vigente).
        Cerrar un mes recalcula y cierra su estado de resultados. Reabrir exige motivo y queda en la bitácora.
      </div>
      <div className="grid-kpis">
        <KPICard title="Semanas por cerrar" value={semanasPend.length} color="var(--gold)" />
        <KPICard title="Meses por cerrar" value={mesesPend.length} color="var(--gold)" />
        <KPICard title="Periodos cerrados" value={cerrados.length} color="var(--green)" />
        <KPICard title="Reabiertos" value={reabiertos.length} color="var(--red)" subtitle="Vuelven a requerir cierre" />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'pendientes', label: 'Por cerrar', badge: semanasPend.length + mesesPend.length }, { id: 'historial', label: 'Historial', badge: cierres.length }]} />
      {tab === 'pendientes' ? (
        <div className="grid2">
          <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Semanas terminadas</h3>
            {semanasPend.length ? <table><tbody>{semanasPend.slice(0, 30).map(s => (
              <tr key={s.inicio}><td><b>{s.etiqueta}</b> · {etiquetaRango(s.inicio, s.fin)}</td>
                <td style={{ textAlign: 'right' }}><BotonCierre tipo="semana" fecha={s.inicio} etiqueta={s.etiqueta} sedeId={sedeActivaId} cierre={delAlcance.find(c => c.tipo === 'semana' && c.fecha_inicio === s.inicio)} /></td></tr>))}</tbody></table>
              : <div className="mini" style={{ color: 'var(--muted)' }}>No hay semanas pendientes.</div>}
          </div>
          <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Meses terminados</h3>
            {mesesPend.length ? <table><tbody>{mesesPend.map(m => (
              <tr key={m.clave}><td><b style={{ textTransform: 'capitalize' }}>{nombreMes(m.mes)} {m.anio}</b></td>
                <td style={{ textAlign: 'right' }}><BotonCierre tipo="mes" fecha={m.inicio} etiqueta={m.clave} sedeId={sedeActivaId} cierre={delAlcance.find(c => c.tipo === 'mes' && c.fecha_inicio.slice(0, 7) === m.clave)} /></td></tr>))}</tbody></table>
              : <div className="mini" style={{ color: 'var(--muted)' }}>No hay meses pendientes.</div>}
          </div>
        </div>
      ) : (
        <DataTable columnas={cols} filas={cierres} cargando={cierresV.cargando} error={cierresV.error} exportarNombre="cierres_periodo" onFila={setDetalle}
          vacio={{ title: 'Sin cierres', description: 'Aún no se ha cerrado ningún periodo.' }} />
      )}
      <Modal open={!!detalle} onClose={() => setDetalle(null)} title={detalle ? `${detalle.tipo === 'mes' ? 'Mes' : 'Semana'} ${detalle.etiqueta} · ${detalle.sede_nombre ?? 'Toda la clínica'}` : ''}
        footer={<button type="button" className="btn o" onClick={() => setDetalle(null)}>Cerrar</button>}>
        {detalle && (
          <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
            <div>Periodo: {fecha(detalle.fecha_inicio)} al {fecha(detalle.fecha_fin)} · <StatusBadge estado={detalle.estado} /></div>
            <div>Ingresos <b>{moneda(detalle.ingresos)}</b> · Gastos <b>{moneda(detalle.gastos)}</b> · Neto <b>{moneda(detalle.neto)}</b> · Efectivo a depositar <b>{moneda(detalle.efectivo_a_depositar)}</b></div>
            <div>Cerrado: {fechaHora(detalle.cerrado_en)}</div>
            {detalle.reabierto_en && <div>Reabierto: {fechaHora(detalle.reabierto_en)} — {detalle.motivo_reapertura}</div>}
            {detalle.snapshot && (
              <details><summary>Instantánea al cierre</summary>
                <pre style={{ fontSize: 11, maxHeight: 260, overflow: 'auto', background: 'var(--row-line)', padding: 8, borderRadius: 6 }}>{JSON.stringify(detalle.snapshot, null, 2)}</pre></details>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
