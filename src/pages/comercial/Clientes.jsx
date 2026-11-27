// Clientes: buscar por nombre y ver toda la historia con la clínica (tickets y renglones, citas y servicios,
// planes, anticipos, facturas, plantillas). Es la vista comercial del paciente; el detalle clínico vive en el expediente.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { usePermiso } from '../../lib/permisos'
import { leer, rpc } from '../../lib/api'
import toast from 'react-hot-toast'
import { fecha, fechaHora, moneda, telefono } from '../../lib/formato'
import { Seccion, useVista, mensajeError, usePaciente, Volver } from '../clinico/componentes/comunes'
import { EstadoPedido, Semaforo } from '../plataforma/pedidos/comun'

const useDebounce = (v, ms = 350) => { const [x, setX] = useState(v); useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t) }, [v, ms]); return x }
const COBRADAS = ['cobrada', 'por_facturar', 'facturada']

export default function Clientes() {
  const { id } = useParams()
  return id ? <Historia id={id} /> : <Buscar />
}

function Buscar() {
  const nav = useNavigate()
  const [buscar, setBuscar] = useState('')
  const texto = useDebounce(buscar)
  const q = useQuery({
    queryKey: ['clientes', 'buscar', texto],
    queryFn: async () => {
      const r = await leer('prp_pacientes', {
        sedeCol: false, filtros: { estado: ['activo', 'inactivo', 'bloqueado'] }, limite: 40, orden: { columna: 'nombre_completo' },
        columnas: 'id,numero_expediente,nombre_completo,telefono_celular,email,estado,tipo_registro',
        buscar: { columnas: ['nombre_completo', 'numero_expediente', 'telefono_celular', 'email'], texto },
      })
      if (r.error) throw r.error
      return r.data
    },
  })
  return (
    <div className="pagina">
      <PageHeader titulo="Clientes" subtitulo="Busca por nombre, teléfono, correo o expediente y consulta toda su historia: servicios, compras, planes, anticipos y facturas." />
      <input className="input" autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar cliente por nombre…" aria-label="Buscar cliente" style={{ maxWidth: 480, marginBottom: 12 }} />
      <DataTable buscador={false} sinPaginacion cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} filas={q.data ?? []} onFila={c => nav(`/clientes/${c.id}`)}
        columnas={[{ key: 'nombre_completo', label: 'Cliente' }, { key: 'tipo_registro', label: 'Tipo', render: c => (c.tipo_registro === 'cliente' ? <span className="bd a">Solo cliente</span> : <span className="bd b">Paciente</span>) }, { key: 'numero_expediente', label: 'Expediente', render: c => c.numero_expediente ?? '—' }, { key: 'telefono_celular', label: 'Celular', render: c => telefono(c.telefono_celular) }, { key: 'email', label: 'Correo' }, { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} /> }]}
        vacio={{ title: 'Sin resultados', description: 'No hay clientes con ese dato. Las ventas a «Cliente general» no generan historia.' }} />
    </div>
  )
}

function Historia({ id }) {
  const paciente = usePaciente(id)
  const verClinico = usePermiso('expediente.ver')
  const [tab, setTab] = useState('compras')
  const nav = useNavigate()
  const puedeEditar = usePermiso('pacientes.editar')
  const altaPaciente = async () => {
    const r = await rpc('convertir_cliente_en_paciente', { p_id: id })
    if (r.error) { toast.error(r.error.message); return }
    toast.success('Ahora es paciente: completa su ficha'); nav(`/pacientes/${id}/editar`)
  }
  const pac = paciente.data
  const ventas = useVista('cli-ventas-' + id, 'prp_ventas', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'created_at', asc: false }, limite: 500 })
  const lineas = useVista('cli-lineas-' + id, 'prp_venta_lineas', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'created_at', asc: false }, limite: 2000 })
  const citas = useVista('cli-citas-' + id, 'prp_agenda', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'inicio', asc: false }, limite: 500 })
  const planes = useVista('cli-planes-' + id, 'prp_planes_adquiridos', { sedeCol: false, filtros: { paciente_id: id }, limite: 200 })
  const pedidos = useVista('cli-pedidos-' + id, 'prp_pedidos_especiales', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'created_at', asc: false }, limite: 200 })
  const antic = useVista('cli-antic-' + id, 'prp_anticipos', { sedeCol: false, filtros: { paciente_id: id }, limite: 200 })
  const ids = (ventas.data?.filas ?? []).map(v => v.id)
  const facturas = useVista('cli-fact-' + id, 'prp_facturas', { sedeCol: false, filtros: { venta_id: ids } }, { enabled: ids.length > 0 })

  const resumen = useMemo(() => {
    const cobradas = (ventas.data?.filas ?? []).filter(v => COBRADAS.includes(v.estado))
    const total = cobradas.reduce((a, v) => a + Number(v.total || 0), 0)
    const fechas = cobradas.map(v => v.cobrada_en ?? v.created_at).filter(Boolean).sort()
    const asistio = (citas.data?.filas ?? []).filter(c => ['atendida', 'cobrada', 'completada'].includes(c.estado)).length
    return { tickets: cobradas.length, total, ultima: fechas.at(-1), primera: fechas[0], citas: (citas.data?.filas ?? []).length, asistio }
  }, [ventas.data, citas.data])

  const lineasPorVenta = useMemo(() => {
    const m = new Map()
    for (const l of lineas.data?.filas ?? []) { if (!m.has(l.venta_id)) m.set(l.venta_id, []); m.get(l.venta_id).push(l) }
    return m
  }, [lineas.data])

  if (paciente.isLoading) return <div className="pagina">Cargando…</div>
  if (!pac) return <div className="pagina"><Volver a="/clientes" /> Cliente no encontrado.</div>

  const tabs = [
    { id: 'compras', label: 'Compras y tickets', badge: resumen.tickets },
    { id: 'productos', label: 'Qué ha comprado' },
    { id: 'servicios', label: 'Citas y servicios', badge: resumen.citas },
    { id: 'planes', label: 'Planes y anticipos' },
    { id: 'pedidos', label: 'Pedidos', badge: (pedidos.data?.filas ?? []).filter(p => !['entregado', 'cancelado'].includes(p.estado)).length || null },
    { id: 'facturas', label: 'Facturas' },
  ]
  const err = q => (q.error ? mensajeError(q.error) : null)

  return (
    <div className="pagina">
      <PageHeader titulo={pac.nombre_completo} subtitulo={`Clientes › ${pac.nombre_completo} · ${pac.tipo_registro === 'cliente' ? 'Solo cliente (sin expediente)' : 'Exp. ' + (pac.numero_expediente ?? '—')} · ${telefono(pac.telefono_celular) || 'sin celular'}`}
        acciones={<><Volver a="/clientes">Otros clientes</Volver> {pac.tipo_registro === 'cliente' ? (puedeEditar && <button type="button" className="btn" onClick={altaPaciente}>Dar de alta como paciente</button>) : <Link to={`/pacientes/${id}`} className="btn o" style={{ textDecoration: 'none' }}>{verClinico ? 'Expediente clínico' : 'Ficha del paciente'}</Link>}</>} />
      <div className="grid4" style={{ marginBottom: 12 }}>
        <KPICard title="Total gastado" value={moneda(resumen.total)} subtitle={`${resumen.tickets} tickets cobrados`} />
        <KPICard title="Primera compra" value={resumen.primera ? fecha(resumen.primera) : '—'} />
        <KPICard title="Última compra" value={resumen.ultima ? fecha(resumen.ultima) : '—'} />
        <KPICard title="Ticket promedio" value={resumen.tickets ? moneda(resumen.total / resumen.tickets) : '—'} subtitle={`${resumen.citas} citas en total`} />
      </div>
      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'compras' && (
        <Seccion titulo="Todos los tickets, con lo que incluyó cada uno">
          <DataTable buscador={false} sinPaginacion cargando={ventas.isLoading} error={err(ventas)} filas={ventas.data?.filas ?? []}
            columnas={[
              { key: 'folio', label: 'Ticket', render: v => v.folio ?? '—' },
              { key: 'cobrada_en', label: 'Fecha', render: v => fechaHora(v.cobrada_en ?? v.created_at) },
              { key: 'sede_nombre', label: 'Sede' },
              { key: 'detalle', label: 'Incluyó', sortable: false, render: v => (lineasPorVenta.get(v.id) ?? []).map(l => `${Number(l.cantidad) !== 1 ? l.cantidad + '× ' : ''}${l.descripcion}`).join(' · ') || '—' },
              { key: 'total', label: 'Total', align: 'right', render: v => moneda(v.total) },
              { key: 'estado', label: 'Estado', render: v => <StatusBadge estado={v.estado} /> },
            ]}
            vacio={{ title: 'Sin tickets', description: 'Este cliente no tiene compras registradas.' }} />
        </Seccion>
      )}

      {tab === 'productos' && (
        <Seccion titulo="Servicios y productos cobrados, renglón por renglón">
          <DataTable buscador={false} sinPaginacion cargando={lineas.isLoading} error={err(lineas)}
            filas={(lineas.data?.filas ?? []).filter(l => COBRADAS.includes(l.venta_estado))}
            columnas={[
              { key: 'cobrada_en', label: 'Fecha', render: l => fecha(l.cobrada_en ?? l.created_at) },
              { key: 'venta_folio', label: 'Ticket' },
              { key: 'tipo', label: 'Tipo' },
              { key: 'descripcion', label: 'Concepto' },
              { key: 'cantidad', label: 'Cant.', align: 'right' },
              { key: 'atendio_nombre', label: 'Atendió' },
              { key: 'importe', label: 'Importe', align: 'right', render: l => moneda(l.importe) },
            ]}
            vacio={{ title: 'Sin renglones', description: 'No hay conceptos cobrados.' }} />
        </Seccion>
      )}

      {tab === 'servicios' && (
        <Seccion titulo="Citas y servicios">
          <DataTable buscador={false} sinPaginacion cargando={citas.isLoading} error={err(citas)} filas={citas.data?.filas ?? []}
            columnas={[
              { key: 'inicio', label: 'Fecha', render: c => fechaHora(c.inicio) },
              { key: 'sede_nombre', label: 'Sede' },
              { key: 'servicio_nombre', label: 'Servicio' },
              { key: 'podologo_nombre', label: 'Podólogo' },
              { key: 'precio_servicio', label: 'Precio', align: 'right', render: c => moneda(c.precio_servicio) },
              { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} /> },
            ]}
            vacio={{ title: 'Sin citas', description: 'Este cliente no tiene citas registradas.' }} />
          {verClinico && <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>El detalle clínico de cada consulta está en el <Link to={`/pacientes/${id}`}>expediente</Link>.</p>}
        </Seccion>
      )}

      {tab === 'planes' && (
        <>
          <Seccion titulo="Planes, paquetes y membresías">
            <DataTable buscador={false} sinPaginacion cargando={planes.isLoading} error={err(planes)} filas={planes.data?.filas ?? []}
              columnas={[{ key: 'folio', label: 'Folio' }, { key: 'oferta_nombre', label: 'Plan' }, { key: 'fecha_compra', label: 'Compra', render: p => fecha(p.fecha_compra) }, { key: 'sesiones', label: 'Sesiones', render: p => `${p.sesiones_usadas ?? 0}/${p.sesiones_total ?? '—'}` }, { key: 'estado', label: 'Estado', render: p => <StatusBadge estado={p.estado} /> }]}
              vacio={{ title: 'Sin planes', description: 'No ha comprado planes ni paquetes.' }} />
          </Seccion>
          <Seccion titulo="Anticipos">
            <DataTable buscador={false} sinPaginacion cargando={antic.isLoading} error={err(antic)} filas={antic.data?.filas ?? []}
              columnas={[{ key: 'folio', label: 'Folio' }, { key: 'pagado_en', label: 'Pagado', render: a => a.pagado_en ? fecha(a.pagado_en) : '—' }, { key: 'monto', label: 'Monto', align: 'right', render: a => moneda(a.monto) }, { key: 'estado', label: 'Estado', render: a => <StatusBadge estado={a.estado} /> }]}
              vacio={{ title: 'Sin anticipos', description: 'No tiene anticipos.' }} />
          </Seccion>
        </>
      )}

      {tab === 'pedidos' && (
        <Seccion titulo="Pedidos especiales (zapatos, plantillas y aditamentos)">
          <DataTable buscador={false} sinPaginacion cargando={pedidos.isLoading} error={err(pedidos)} filas={pedidos.data?.filas ?? []} onFila={p => nav('/pedidos/' + p.id)}
            columnas={[{ key: 'folio', label: 'Pedido', render: p => <b>{p.folio}</b> }, { key: 'producto', label: 'Producto' }, { key: 'proveedor_nombre', label: 'Proveedor' }, { key: 'estado', label: 'Etapa', render: p => <EstadoPedido estado={p.estado} /> },
              { key: 'total', label: 'Total', align: 'right', render: p => moneda(p.total) }, { key: 'anticipo_monto', label: 'Anticipo', align: 'right', render: p => moneda(p.anticipo_monto) }, { key: 'saldo', label: 'Saldo', align: 'right', render: p => moneda(p.saldo) },
              { key: 'fecha_prometida', label: 'Prometida', render: p => fecha(p.fecha_acordada ?? p.fecha_prometida) }, { key: 'semaforo', label: 'Retraso', render: p => <Semaforo valor={p.semaforo} dias={p.dias_retraso} /> }]}
            vacio={{ title: 'Sin pedidos', description: 'No tiene pedidos especiales. Se crean en Pedidos → Nuevo pedido.' }} />
        </Seccion>
      )}

      {tab === 'facturas' && (
        <Seccion titulo="Facturas (CFDI)">
          <DataTable buscador={false} sinPaginacion cargando={facturas.isLoading} error={err(facturas)} filas={facturas.data?.filas ?? []}
            columnas={[{ key: 'folio', label: 'Folio', render: f => f.folio ?? f.ticket_folio ?? '—' }, { key: 'created_at', label: 'Fecha', render: f => fecha(f.created_at) }, { key: 'total', label: 'Total', align: 'right', render: f => moneda(f.total) }, { key: 'estado', label: 'Estado', render: f => <StatusBadge estado={f.estado} /> }]}
            vacio={{ title: 'Sin facturas', description: 'No hay facturas de este cliente.' }} />
        </Seccion>
      )}
    </div>
  )
}
