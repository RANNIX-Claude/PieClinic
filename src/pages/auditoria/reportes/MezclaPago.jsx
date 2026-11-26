// Mezcla de formas de pago (F1.6): proporción efectivo / tarjeta / otros POR MONTO, por sucursal y por cajero, con el promedio de la cadena como referencia.
// SIEMPRE se presenta como INDICADOR PARA INVESTIGAR, nunca como hallazgo: el perfil de clientela cambia entre zonas y este reporte no prueba nada por sí solo.
// Con menos de diez tickets diarios por tienda, una desviación solo se marca con muestra suficiente (mínimo de tickets configurable en la consulta).
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import DataTable from '../../../components/ui/DataTable'
import KPICard from '../../../components/ui/KPICard'
import { useApp } from '../../../context/AppContext'
import { repMezclaPago } from '../../../lib/auditoria/reportesApi'
import { fraseMezcla } from '../../../lib/auditoria/reportes'
import { moneda, numero, hoyISO } from '../../../lib/formato'
import { Aviso, Estado, FiltroPeriodo, restarDias, useRpc } from './comun'

export default function MezclaPago() {
  const { sedes } = useApp()
  const [f, setF] = useState({ desde: restarDias(29), hasta: hoyISO(), sucursal: '' })
  const [ap, setAp] = useState(f)
  const filtros = useMemo(() => ({ desde: ap.desde, hasta: ap.hasta, ...(ap.sucursal ? { sucursal: ap.sucursal } : {}) }), [ap])
  const q = useRpc(['ctl-rep-mezcla', filtros], () => repMezclaPago(filtros))
  const d = q.data
  const col = (clave) => ({ key: clave, label: clave === 'sucursal' ? 'Sucursal' : 'Cajero' })
  const comunes = [
    { key: 'tickets', label: 'Tickets', align: 'right', render: r => numero(r.tickets) }, { key: 'efectivo', label: 'Efectivo', align: 'right', render: r => moneda(r.efectivo) },
    { key: 'tarjeta', label: 'Tarjeta', align: 'right', render: r => moneda(r.tarjeta) }, { key: 'otros', label: 'Otros', align: 'right', render: r => moneda(r.otros) },
    { key: 'pct_efectivo', label: '% efectivo', align: 'right', render: r => (r.pct_efectivo == null ? '—' : <b>{r.pct_efectivo}%</b>) },
    { key: 'desviacion_pp', label: 'Vs. cadena', align: 'right', render: r => (r.desviacion_pp == null ? '—' : `${r.desviacion_pp > 0 ? '+' : ''}${r.desviacion_pp} pts`) },
    { key: 'lectura', label: 'Lectura', sortable: false, exportar: false, render: r => <span className={r.para_investigar ? 'bd a' : 'hint'}>{fraseMezcla(r)}</span> },
  ]
  const grafica = (d?.por_sucursal ?? []).map(s => ({ sucursal: s.sucursal, efectivo: Number(s.pct_efectivo ?? 0), tarjeta: Number(s.pct_tarjeta ?? 0), otros: Math.max(0, 100 - Number(s.pct_efectivo ?? 0) - Number(s.pct_tarjeta ?? 0)) }))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Aviso tono="alerta"><b>Indicador para investigar, no un hallazgo.</b> {d?.aviso ?? 'El efectivo es lo único desviable, pero una tienda con otra mezcla puede tener simplemente otra clientela.'}</Aviso>
      <FiltroPeriodo valor={f} onCambio={setF} onAplicar={() => setAp(f)} sedes={sedes} cargando={q.isFetching} />
      <Estado q={q} />
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <KPICard title="Tickets cobrados" value={numero(d.cadena.tickets)} subtitle="Base del promedio de la cadena" />
            <KPICard title="Efectivo (promedio de la cadena)" value={d.cadena.pct_efectivo == null ? '—' : `${d.cadena.pct_efectivo}%`} subtitle={moneda(d.cadena.efectivo)} />
            <KPICard title="Tarjeta (promedio de la cadena)" value={d.cadena.pct_tarjeta == null ? '—' : `${d.cadena.pct_tarjeta}%`} subtitle={`${moneda(d.cadena.tarjeta)} · tarjeta y terminal Clip`} />
            <KPICard title="Otros" value={moneda(d.cadena.otros)} subtitle="Transferencia, anticipo y gift card" />
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Mezcla por sucursal (% del monto cobrado)</h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafica} margin={{ top: 6, right: 10, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="sucursal" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v, n) => [`${Math.round(v * 10) / 10}%`, n]} /><Legend />
                  {d.cadena.pct_efectivo != null && <ReferenceLine y={Number(d.cadena.pct_efectivo)} stroke="#444" strokeDasharray="4 3" label={{ value: 'Efectivo, cadena', fontSize: 10, position: 'right' }} />}
                  <Bar dataKey="efectivo" name="Efectivo" stackId="m" fill="#b45309" /><Bar dataKey="tarjeta" name="Tarjeta" stackId="m" fill="#1d4ed8" /><Bar dataKey="otros" name="Otros" stackId="m" fill="#9aa3b2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <DataTable buscador={false} sinPaginacion filaKey="sucursal_id" filas={d.por_sucursal} exportarNombre="mezcla_pago_por_sucursal" columnas={[col('sucursal'), ...comunes]}
            vacio={{ title: 'Sin ventas', description: 'No hay tickets cobrados en este periodo.' }} />
          <DataTable buscador={false} sinPaginacion filaKey="cajero_id" filas={d.por_cajero} exportarNombre="mezcla_pago_por_cajero" columnas={[col('cajero'), ...comunes]}
            vacio={{ title: 'Sin ventas', description: 'No hay tickets cobrados en este periodo.' }} />
          <div className="hint">Una desviación se marca solo con al menos {d.minimo_tickets} tickets y {d.umbral_pp} puntos de diferencia contra la cadena. «Para investigar» significa revisar con los demás reportes, no concluir.</div>
        </>
      )}
    </div>
  )
}
