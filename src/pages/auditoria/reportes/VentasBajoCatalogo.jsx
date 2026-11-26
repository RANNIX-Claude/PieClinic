// Ventas por debajo de catálogo (F1.2): ticket, fecha y hora, sucursal, caja, cajero, producto, precio de catálogo vigente al momento de la venta, precio cobrado, diferencia en pesos,
// motivo de descuento y autorizador; totales por cajero y por sucursal. Es el reporte que detecta cobrar 140 por una pieza de 1,140: el inventario cuadra perfecto y ninguna
// auditoría de cantidades lo ve. Lee del origen por v_ctl_ventas (solo dueño y supervisor). Lo que el origen todavía no da se declara en pantalla (limitaciones).
import { useMemo, useState } from 'react'
import DataTable from '../../../components/ui/DataTable'
import KPICard from '../../../components/ui/KPICard'
import { useApp } from '../../../context/AppContext'
import { repVentasBajoCatalogo } from '../../../lib/auditoria/reportesApi'
import { moneda, numero, fechaHora, hoyISO } from '../../../lib/formato'
import { exportarExcel } from '../../../lib/finanzas/exportar'
import { Aviso, Estado, FiltroPeriodo, restarDias, useRpc } from './comun'

const TAM = 100
export default function VentasBajoCatalogo() {
  const { sedes } = useApp()
  const [f, setF] = useState({ desde: restarDias(29), hasta: hoyISO(), sucursal: '' })
  const [ap, setAp] = useState(f)
  const [pagina, setPagina] = useState(0)
  const filtros = useMemo(() => ({ desde: ap.desde, hasta: ap.hasta, ...(ap.sucursal ? { sucursal: ap.sucursal } : {}) }), [ap])
  const q = useRpc(['ctl-rep-bajo-cat', filtros, pagina], () => repVentasBajoCatalogo({ ...filtros, limite: TAM, offset: pagina * TAM }), { placeholderData: prev => prev })
  const d = q.data

  async function exportarTodo() {
    const r = await repVentasBajoCatalogo({ ...filtros, exportar: true })
    if (r.error) return
    await exportarExcel('ventas_bajo_catalogo', [{ nombre: 'Ventas bajo catálogo', columnas: [
      { key: 'ticket', label: 'Ticket' }, { key: 'fecha', label: 'Fecha y hora' }, { key: 'sucursal', label: 'Sucursal' }, { key: 'caja', label: 'Caja' }, { key: 'cajero', label: 'Cajero' }, { key: 'producto', label: 'Producto' },
      { key: 'catalogo', label: 'Precio de catálogo', formato: 'moneda' }, { key: 'cobrado', label: 'Precio cobrado', formato: 'moneda' }, { key: 'cantidad', label: 'Cantidad' },
      { key: 'diferencia', label: 'Diferencia', formato: 'moneda' }, { key: 'motivo', label: 'Motivo de descuento' }, { key: 'autorizador', label: 'Autorizador' }],
      filas: r.data.filas.map(x => ({ ...x, fecha: fechaHora(x.fecha_hora), motivo: x.motivo ?? '', autorizador: x.autorizador ?? '', caja: x.caja ?? '' })) }], { entidad: 'auditoria_ventas_bajo_catalogo', detalle: { filtros } })
  }

  const columnas = [
    { key: 'ticket', label: 'Ticket' }, { key: 'fecha_hora', label: 'Fecha y hora', render: r => fechaHora(r.fecha_hora) }, { key: 'sucursal', label: 'Sucursal' }, { key: 'caja', label: 'Caja', render: r => r.caja ?? '—' },
    { key: 'cajero', label: 'Cajero', render: r => r.cajero ?? '—' }, { key: 'producto', label: 'Producto' },
    { key: 'catalogo', label: 'Catálogo', align: 'right', render: r => moneda(r.catalogo) }, { key: 'cobrado', label: 'Cobrado', align: 'right', render: r => <b>{moneda(r.cobrado)}</b> },
    { key: 'diferencia', label: 'Diferencia', align: 'right', render: r => <b style={{ color: 'var(--red)' }}>{moneda(r.diferencia)}</b> },
    { key: 'motivo', label: 'Motivo de descuento', render: r => r.motivo ?? <span className="bd r" title="Cobrado por debajo del catálogo sin motivo registrado">Sin motivo</span> },
    { key: 'autorizador', label: 'Autorizó', render: r => r.autorizador ?? <span style={{ opacity: 0.6 }}>—</span> },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <FiltroPeriodo valor={f} onCambio={setF} onAplicar={() => { setPagina(0); setAp(f) }} sedes={sedes} cargando={q.isFetching}>
        <button type="button" className="btn o sm" onClick={exportarTodo} disabled={!d?.total_filas}>Exportar a Excel</button>
      </FiltroPeriodo>
      <Estado q={q} />
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <KPICard title="Diferencia total" color="var(--red)" value={moneda(d.totales.monto)} subtitle="Catálogo menos lo cobrado, al precio" />
            <KPICard title="Renglones" value={numero(d.totales.lineas)} subtitle={`${numero(d.totales.tickets)} ticket(s)`} />
            <KPICard title="Sin motivo ni autorizador" color={d.totales.sin_motivo_ni_autorizador ? 'var(--gold)' : 'var(--green)'} value={numero(d.totales.sin_motivo_ni_autorizador)} subtitle="Los que más conviene revisar" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <DataTable buscador={false} sinPaginacion compacto filaKey="cajero_id" filas={d.por_cajero} exportarNombre="bajo_catalogo_por_cajero" vacio={{ title: 'Sin diferencias', description: 'Nadie cobró por debajo del catálogo en este periodo.' }}
              columnas={[{ key: 'cajero', label: 'Por cajero' }, { key: 'lineas', label: 'Renglones', align: 'right' }, { key: 'tickets', label: 'Tickets', align: 'right' }, { key: 'monto', label: 'Diferencia', align: 'right', render: r => <b>{moneda(r.monto)}</b> }]} />
            <DataTable buscador={false} sinPaginacion compacto filaKey="sucursal_id" filas={d.por_sucursal} exportarNombre="bajo_catalogo_por_sucursal" vacio={{ title: 'Sin diferencias', description: 'Ninguna sucursal cobró por debajo del catálogo.' }}
              columnas={[{ key: 'sucursal', label: 'Por sucursal' }, { key: 'lineas', label: 'Renglones', align: 'right' }, { key: 'tickets', label: 'Tickets', align: 'right' }, { key: 'monto', label: 'Diferencia', align: 'right', render: r => <b>{moneda(r.monto)}</b> }]} />
          </div>
          <DataTable columnas={columnas} filas={d.filas} filaKey="n" buscador={false} cargando={q.isFetching && !q.isLoading} tamanoPagina={TAM}
            servidor={{ total: d.total_filas, pagina, tamano: TAM, onPagina: setPagina }} vacio={{ title: 'Nada por debajo del catálogo', description: 'Con estos filtros no hay ventas cobradas por debajo del precio de catálogo.' }} />
          <Aviso tono="alerta"><b>Lo que el punto de venta todavía no da (Etapa 1):</b> {d.limitaciones.join(' ')}</Aviso>
        </>
      )}
    </div>
  )
}
