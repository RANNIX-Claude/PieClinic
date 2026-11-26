// Cuadre de insumos por periodo y sucursal (SOLO dueño y supervisor). Compara el consumo REAL del inventario (salidas del insumo) contra el TEÓRICO según los
// servicios cobrados × el consumo esperado por servicio (ctl_consumo_esperado), con la diferencia en piezas y en valor al costo. Es el cuadre semanal o mensual;
// el cuadre del cierre diario (F3.4) ya existe en Cierres. Indicador para investigar, no una conclusión. El dueño define el consumo esperado aquí mismo
// (la misma pantalla que Configuración → «Consumo de insumos»: se reutiliza, no se duplica).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import DataTable from '../../../components/ui/DataTable'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import { moneda, numero, fecha, fechaHora, hoyISO } from '../../../lib/formato'
import { repCuadreInsumos } from '../../../lib/auditoria/serviciosApi'
import { errMsg } from '../comun'
import { ConsumoEsperado } from '../cierres/PuntosControl'
import { desdeHace } from './fechas'

const ESTADO = { cuadra: ['v', 'Cuadra'], consumo_mayor: ['r', 'Consumo mayor al teórico'], consumo_menor: ['a', 'Consumo menor al teórico'] }
const NOMBRE_AGRUPAR = { semana: 'Semana', mes: 'Mes', total: 'Todo el periodo' }

export default function CuadreInsumos() {
  const { sedes } = useApp()
  const configura = usePermiso('auditoria.configurar')
  const [vista, setVista] = useState('cuadre')
  const [f, setF] = useState({ desde: desdeHace(27), hasta: hoyISO(), sucursal: '', agrupar: 'semana', incluirAjustes: true })
  const q = useQuery({
    queryKey: ['ctl-cuadre-insumos', f], retry: false,
    queryFn: async () => { const r = await repCuadreInsumos({ desde: f.desde, hasta: f.hasta, sucursal: f.sucursal || null, agrupar: f.agrupar, incluir_ajustes: f.incluirAjustes }); if (r.error) throw new Error(errMsg(r.error)); return r.data },
    enabled: vista === 'cuadre',
  })
  const d = q.data
  const periodo = x => (f.agrupar === 'mes' ? String(x.periodo).slice(0, 7) : fecha(x.periodo))
  return (
    <>
      <Tabs value={vista} onChange={setVista} items={[{ id: 'cuadre', label: 'Cuadre por periodo' }, { id: 'consumo', label: 'Consumo esperado por servicio' }]} />
      {vista === 'consumo' && <ConsumoEsperado puedeEditar={configura} />}
      {vista === 'cuadre' && <>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', margin: '10px 0' }}>
          <FormField label="Desde" type="date" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} />
          <FormField label="Hasta" type="date" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} />
          <FormField label="Sucursal" as="select" placeholder="Todas" value={f.sucursal} onChange={e => setF({ ...f, sucursal: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
          <FormField label="Agrupar por" as="select" value={f.agrupar} onChange={e => setF({ ...f, agrupar: e.target.value })} options={Object.entries(NOMBRE_AGRUPAR).map(([value, label]) => ({ value, label }))} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={f.incluirAjustes} onChange={e => setF({ ...f, incluirAjustes: e.target.checked })} /> Contar ajustes y conteos como consumo</label>
        </div>
        {q.isLoading && <div className="card">Calculando…</div>}
        {q.isError && <div className="card">{q.error.message}</div>}
        {d && <>
          <div className="hint" style={{ marginBottom: 10 }}>{d.aviso}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            <KPICard title="Renglones" value={d.resumen.filas} />
            <KPICard title="Fuera de cuadre" value={d.resumen.fuera_de_cuadre} color="var(--red, #c0392b)" />
            <KPICard title="Diferencia al costo" value={moneda(d.resumen.diferencia_valor)} color="var(--amber, #d4900a)" />
            <KPICard title="Servicios sin cobro (est.)" value={d.resumen.servicios_sin_cobro_est ?? 0} subtitle="diferencia ÷ piezas por servicio" />
          </div>
          <h3>Insumos: consumo real contra teórico</h3>
          <DataTable exportarNombre="cuadre-insumos" filas={d.insumos.map(x => ({ ...x, id: `${x.periodo}${x.sucursal_id}${x.insumo_id}` }))}
            vacio={{ title: 'Sin movimientos', description: 'No hay consumo esperado definido o no hubo servicios ni salidas en el periodo.' }}
            columnas={[
              { key: 'periodo', label: f.agrupar === 'semana' ? 'Semana del' : 'Periodo', render: periodo, valor: x => x.periodo },
              { key: 'sucursal', label: 'Sucursal', filtro: true }, { key: 'insumo', label: 'Insumo', filtro: true },
              { key: 'servicios_cobrados', label: 'Servicios cobrados', align: 'right', render: x => numero(x.servicios_cobrados) },
              { key: 'teorico', label: 'Teórico', align: 'right', render: x => numero(x.teorico) },
              { key: 'real', label: 'Real', align: 'right', render: x => numero(x.real) },
              { key: 'diferencia_piezas', label: 'Diferencia (pzas)', align: 'right', render: x => <b className={x.diferencia_piezas > 0 ? 'text-red' : ''}>{numero(x.diferencia_piezas)}</b> },
              { key: 'diferencia_valor', label: 'Diferencia al costo', align: 'right', render: x => moneda(x.diferencia_valor) },
              { key: 'servicios_sin_cobro_est', label: 'Servicios sin cobro', align: 'right' },
              { key: 'estado', label: 'Estado', render: x => <StatusBadge variante={ESTADO[x.estado][0]} label={ESTADO[x.estado][1]} />, valor: x => ESTADO[x.estado][1] },
              { key: 'salidas', label: 'Salidas (consumo · venta · merma · ajustes)', sortable: false, exportar: false, render: x => [x.salidas.consumo_consulta, x.salidas.venta, x.salidas.merma, x.salidas.ajustes_y_conteos].map(numero).join(' · ') },
            ]} />
          <h3 style={{ marginTop: 16 }}>Servicios cobrados · kits usados · atenciones</h3>
          <DataTable exportarNombre="servicios-kits-atenciones" filas={d.servicios_kits.map(x => ({ ...x, id: `${x.periodo}${x.sucursal_id}` }))}
            vacio={{ title: 'Sin datos', description: 'No hay servicios ni atenciones en el periodo.' }}
            columnas={[
              { key: 'periodo', label: 'Periodo', render: periodo, valor: x => x.periodo },
              { key: 'sucursal', label: 'Sucursal', filtro: true },
              { key: 'tickets_servicio', label: 'Tickets de servicio', align: 'right' },
              { key: 'servicios_cobrados', label: 'Servicios cobrados', align: 'right', render: x => numero(x.servicios_cobrados) },
              { key: 'piezas_usadas', label: 'Kits usados (pzas)', align: 'right', render: x => <b>{numero(x.piezas_usadas)}</b> },
              { key: 'piezas_esperadas', label: 'Kits esperados', align: 'right', render: x => numero(x.piezas_esperadas) },
              { key: 'servicios_sin_cobro_est', label: 'Servicios sin cobro', align: 'right', render: x => (x.servicios_sin_cobro_est ? <b className="text-red">{x.servicios_sin_cobro_est}</b> : '0') },
              { key: 'atenciones', label: 'Atenciones', align: 'right' },
              { key: 'atenciones_con_ticket', label: 'Con ticket', align: 'right' },
              { key: 'atenciones_abiertas', label: 'Abiertas', align: 'right' },
              { key: 'atenciones_canceladas', label: 'Canceladas', align: 'right' },
              { key: 'horas', label: 'Horas exactas de las atenciones sin ticket', sortable: false, exportar: false,
                render: x => (x.atenciones_sin_ticket.length ? x.atenciones_sin_ticket.map(a => <div key={a.id} className="hint">{fechaHora(a.inicio_en)} · {a.servicio ?? 'servicio'} · {a.paciente_ref} · {a.estado}</div>) : '—') },
            ]} />
          <div className="hint" style={{ marginTop: 8 }}>«Servicios sin cobro» divide la diferencia entre las piezas que consume un servicio; con varios insumos por servicio se toma el mayor. Las horas salen de las atenciones que nunca llegaron a ticket: son el punto de partida para investigar, no una conclusión.</div>
        </>}
      </>}
    </>
  )
}
