// Aperturas de cajón sin venta (F1.5): por cajero y por sucursal, con comparativo entre tiendas (aperturas por cada 100 tickets contra el promedio de la cadena).
// El punto de venta todavía NO emite el evento (cambio de la Etapa 1 en el origen): mientras tanto el reporte muestra un estado vacío honesto y la tabla está lista para recibirlo.
import { useMemo, useState } from 'react'
import DataTable from '../../../components/ui/DataTable'
import KPICard from '../../../components/ui/KPICard'
import EmptyState from '../../../components/ui/EmptyState'
import { useApp } from '../../../context/AppContext'
import { repCajonSinVenta } from '../../../lib/auditoria/reportesApi'
import { numero, fechaHora, hoyISO } from '../../../lib/formato'
import { Aviso, Estado, FiltroPeriodo, restarDias, useRpc } from './comun'

export default function CajonSinVenta() {
  const { sedes } = useApp()
  const [f, setF] = useState({ desde: restarDias(29), hasta: hoyISO(), sucursal: '' })
  const [ap, setAp] = useState(f)
  const filtros = useMemo(() => ({ desde: ap.desde, hasta: ap.hasta, ...(ap.sucursal ? { sucursal: ap.sucursal } : {}) }), [ap])
  const q = useRpc(['ctl-rep-cajon', filtros], () => repCajonSinVenta(filtros))
  const d = q.data
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <FiltroPeriodo valor={f} onCambio={setF} onAplicar={() => setAp(f)} sedes={sedes} cargando={q.isFetching} />
      <Estado q={q} />
      {d && !d.origen_activo && (
        <div className="card"><EmptyState title="El punto de venta aún no registra aperturas de cajón sin venta" description={d.aviso_origen} /></div>
      )}
      {d && d.origen_activo && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <KPICard title="Aperturas sin venta" value={numero(d.aperturas)} subtitle={`${numero(d.tickets)} ticket(s) cobrados en el periodo`} />
            <KPICard title="Promedio de la cadena" value={d.promedio_por_100_tickets == null ? '—' : `${d.promedio_por_100_tickets}`} subtitle="Aperturas por cada 100 tickets" />
          </div>
          <Aviso>{d.nota}</Aviso>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            <DataTable buscador={false} sinPaginacion compacto filaKey="sucursal_id" filas={d.por_sucursal} exportarNombre="cajon_por_sucursal"
              columnas={[{ key: 'sucursal', label: 'Por sucursal' }, { key: 'aperturas', label: 'Aperturas', align: 'right' }, { key: 'tickets', label: 'Tickets', align: 'right' },
                { key: 'por_100_tickets', label: 'Por 100 tickets', align: 'right', render: r => (r.por_100_tickets == null ? '—' : <b>{r.por_100_tickets}</b>) }]} />
            <DataTable buscador={false} sinPaginacion compacto filaKey="cajero_id" filas={d.por_cajero} exportarNombre="cajon_por_cajero" vacio={{ title: 'Sin aperturas', description: 'Nadie abrió el cajón sin venta en este periodo.' }}
              columnas={[{ key: 'cajero', label: 'Por cajero' }, { key: 'sucursales', label: 'Sucursales' }, { key: 'aperturas', label: 'Aperturas', align: 'right' },
                { key: 'por_100_tickets', label: 'Por 100 tickets', align: 'right', render: r => (r.por_100_tickets == null ? '—' : <b>{r.por_100_tickets}</b>) }]} />
          </div>
          <DataTable buscador={false} filaKey="id" filas={d.filas} exportarNombre="cajon_sin_venta" vacio={{ title: 'Sin aperturas', description: 'No hay aperturas con estos filtros.' }}
            columnas={[{ key: 'abierta_en', label: 'Fecha y hora', render: r => fechaHora(r.abierta_en) }, { key: 'sucursal', label: 'Sucursal' }, { key: 'caja', label: 'Caja', render: r => r.caja ?? '—' },
              { key: 'cajero', label: 'Cajero', render: r => r.cajero ?? '—' }, { key: 'motivo', label: 'Motivo (opcional)', render: r => r.motivo ?? '' }]} />
        </>
      )}
    </div>
  )
}
