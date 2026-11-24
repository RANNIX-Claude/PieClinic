// Reportes y BI (mockup 42; clon de IRP Reportes con catálogo de reportes + exportación Excel/PDF).
// Cada reporte arma { columnas, filas } y la misma estructura alimenta la tabla, el Excel y el PDF.
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ClipboardList, DollarSign, Package, UserCheck, Users, MessageSquareWarning, CalendarCheck, ArrowLeft } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { moneda, numero, fecha, hoyISO } from '../../lib/formato'
import { bitacoraVer } from '../../lib/bitacora'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import { agruparSuma, ocupacionPct, suma } from '../../lib/finanzas/kpis.js'
import { MESES } from '../../lib/finanzas/constantes.js'
import { rangoMes } from '../../lib/finanzas/semana.js'
import { useVista, BotonesExportar, TablaImprimible, usePerfilesMapa, useProductosMapa, limitesTs, anioMesActual } from './componentes/comunes.jsx'

const CATALOGO = [
  { grupo: 'Financieros', items: [
    { id: 'servicio', titulo: 'Ingreso por servicio', desc: 'Cuánto genera cada servicio (quiropodia, extracción de uña, láser…).', icon: DollarSign, fin: true },
    { id: 'podologo', titulo: 'Ingreso por podólogo', desc: 'Producción de cada podólogo, por sede y periodo.', icon: Users, fin: true },
    { id: 'sede', titulo: 'Ingreso por sede', desc: 'Comparativo de sedes, día / mes / año.', icon: BarChart3, fin: true },
  ] },
  { grupo: 'Operativos', items: [
    { id: 'quejas', titulo: 'Quejas e incidencias', desc: 'Por podólogo y sede; por día, mes y año.', icon: MessageSquareWarning },
    { id: 'quien', titulo: '¿Quién atendió? (sesión anterior)', desc: 'Historial de quién hizo cada sesión de un paciente.', icon: UserCheck },
    { id: 'ocupacion', titulo: 'Ocupación de agenda y faltas', desc: 'Citas atendidas, canceladas y no asistió.', icon: CalendarCheck },
    { id: 'inventario', titulo: 'Inventario por sede', desc: 'Qué producto hay en cada tienda: existencias, mínimos y caducidades.', icon: Package },
  ] },
]
const periodoKey = (iso, agr) => (agr === 'anio' ? iso.slice(0, 4) : agr === 'mes' ? iso.slice(0, 7) : iso.slice(0, 10))
const etqPeriodo = (k, agr) => (agr === 'mes' ? `${MESES[Number(k.slice(5, 7)) - 1].slice(0, 3)} ${k.slice(2, 4)}` : k)

/** Pivote: filas por (clave) y columnas por periodo → { columnas, filas } */
function pivote({ items, filaDe, fechaDe, valorDe = () => 1, agr, etiquetaFila = 'Concepto', extra = [], formatoValor = n => numero(n), textoFila }) {
  const periodos = [...new Set(items.map(i => periodoKey(fechaDe(i), agr)))].sort()
  const m = new Map()
  for (const i of items) {
    const k = filaDe(i); const a = m.get(k) ?? { k, texto: textoFila ? textoFila(i) : k, total: 0, n: 0, ...Object.fromEntries(extra.map(e => [e.key, 0])), p: {} }
    const p = periodoKey(fechaDe(i), agr), v = valorDe(i)
    a.p[p] = (a.p[p] ?? 0) + v; a.total += v; a.n++
    for (const e of extra) a[e.key] += e.suma(i)
    m.set(k, a)
  }
  const filas = [...m.values()].sort((a, b) => b.total - a.total).map(a => ({ fila: a.texto, ...Object.fromEntries(periodos.map(p => [`p_${p}`, a.p[p] ?? 0])), total: a.total, ...Object.fromEntries(extra.map(e => [e.key, a[e.key]])) }))
  const columnas = [{ key: 'fila', label: etiquetaFila }, ...periodos.map(p => ({ key: `p_${p}`, label: etqPeriodo(p, agr), align: 'right', fmt: formatoValor })), { key: 'total', label: 'Total', align: 'right', fmt: formatoValor }, ...extra.map(e => ({ key: e.key, label: e.label, align: 'right', fmt: e.fmt ?? numero }))]
  if (filas.length) filas.push({ fila: 'Total', ...Object.fromEntries(periodos.map(p => [`p_${p}`, filas.reduce((s, f) => s + f[`p_${p}`], 0)])), total: filas.reduce((s, f) => s + f.total, 0), ...Object.fromEntries(extra.map(e => [e.key, filas.reduce((s, f) => s + f[e.key], 0)])) })
  return { columnas, filas }
}

export default function Reportes() {
  const { sedes, sedeActivaId } = useApp()
  const verFin = usePermiso('finanzas.ver')
  const [rep, setRep] = useState(null)
  const hoy = hoyISO(); const { anio: a0 } = anioMesActual()
  const [desde, setDesde] = useState(`${a0}-01-01`)
  const [hasta, setHasta] = useState(hoy)
  const [agr, setAgr] = useState('mes')
  const [podologoId, setPodologoId] = useState('')
  const [claseQueja, setClaseQueja] = useState('')
  const [pacTexto, setPacTexto] = useState('')
  const [pacSel, setPacSel] = useState(null)
  const { mapa: nombres, perfiles } = usePerfilesMapa()
  const prodNombre = useProductosMapa()
  const nomSede = id => sedes?.find(s => s.id === id)?.nombre ?? '—'
  const ts = limitesTs(desde, hasta)
  const activo = id => rep === id

  const serv = useVista('rep-serv', 'prp_ingreso_por_servicio', { filtros: { mes: { gte: rangoMes(Number(desde.slice(0, 4)), Number(desde.slice(5, 7))).desde, lte: hasta } }, limite: 10000 }, { enabled: activo('servicio') })
  const lineas = useVista('rep-lin', 'prp_venta_lineas', { filtros: { cobrada_en: ts, venta_estado: ['cobrada', 'por_facturar', 'facturada'] }, columnas: 'sede_id,atendio_id,atendio_nombre,importe,tipo,cobrada_en', limite: 20000 }, { enabled: activo('podologo') })
  const ingresos = useVista('rep-ing', 'prp_ingresos', { filtros: { fecha_pago: { gte: desde, lte: hasta } }, columnas: 'sede_id,sede_nombre,fecha_pago,importe_neto', limite: 20000 }, { enabled: activo('sede') })
  const quejas = useVista('rep-qj', 'prp_quejas_resumen', { filtros: { fecha_hora: ts, podologo_id: podologoId, clase: claseQueja }, limite: 20000 }, { enabled: activo('quejas') })
  const ocup = useVista('rep-oc', 'prp_ocupacion_podologo_dia', { filtros: { dia: { gte: desde, lte: hasta }, podologo_id: podologoId }, limite: 20000 }, { enabled: activo('ocupacion') })
  const inv = useVista('rep-inv', 'prp_inventario', { orden: { columna: 'sede_nombre' }, limite: 20000 }, { enabled: activo('inventario') })
  const pacs = useVista('rep-pac', 'prp_pacientes', { sedeCol: false, buscar: { columnas: ['nombre', 'apellido_paterno', 'apellido_materno', 'numero_expediente'], texto: pacTexto }, columnas: 'id,nombre_completo,numero_expediente', limite: 8 }, { enabled: activo('quien') && pacTexto.trim().length >= 2 })
  const citasPac = useVista('rep-cita', 'prp_agenda', { sedeCol: false, filtros: { paciente_id: pacSel?.id ?? '00000000-0000-0000-0000-000000000000', estado: ['atendida', 'no_asistio'] }, orden: { columna: 'inicio', asc: false }, limite: 200 }, { enabled: activo('quien') && !!pacSel })
  useEffect(() => { if (pacSel) bitacoraVer('reporte_quien_atendio', pacSel.id, { paciente: pacSel.nombre_completo }) }, [pacSel])

  const r = useMemo(() => {
    switch (rep) {
      case 'servicio': {
        const items = serv.filas.map(f => ({ ...f, k: f.tipo === 'producto' ? `Producto: ${f.descripcion}` : f.descripcion, s: nomSede(f.sede_id) }))
        const t = suma(items, 'base_neta')
        const filas = agruparSuma(items, 'k', 'base_neta').map(g => ({ servicio: g.clave, cantidad: suma(items.filter(i => i.k === g.clave), 'cantidad'), bruto: suma(items.filter(i => i.k === g.clave), 'importe_bruto'), descuento: suma(items.filter(i => i.k === g.clave), 'descuento'), base: g.total, pct: t ? Math.round((g.total / t) * 1000) / 10 : 0 }))
        return { columnas: [{ key: 'servicio', label: 'Servicio / producto' }, { key: 'cantidad', label: 'Cantidad', align: 'right', fmt: numero }, { key: 'bruto', label: 'Importe bruto', align: 'right', fmt: moneda, formato: 'moneda' }, { key: 'descuento', label: 'Descuentos', align: 'right', fmt: moneda, formato: 'moneda' }, { key: 'base', label: 'Ingreso sin IVA', align: 'right', fmt: moneda, formato: 'moneda' }, { key: 'pct', label: '% del total', align: 'right', fmt: n => `${n}%` }], filas, kpi: [['Ingreso sin IVA', moneda(t)], ['Servicios distintos', filas.length]] }
      }
      case 'podologo': {
        const l = lineas.filas.filter(x => x.atendio_id)
        const p = pivote({ items: l, filaDe: x => `${x.atendio_id}|${x.sede_id}`, textoFila: x => `${x.atendio_nombre ?? nombres[x.atendio_id] ?? '—'} · ${nomSede(x.sede_id)}`, fechaDe: x => x.cobrada_en.slice(0, 10), valorDe: x => Number(x.importe) || 0, agr, etiquetaFila: 'Podólogo · sede', formatoValor: moneda })
        return { ...p, kpi: [['Ingreso atribuido', moneda(suma(l, 'importe'))], ['Líneas cobradas', numero(l.length)]] }
      }
      case 'sede': {
        const p = pivote({ items: ingresos.filas, filaDe: x => x.sede_id, textoFila: x => x.sede_nombre ?? nomSede(x.sede_id), fechaDe: x => x.fecha_pago, valorDe: x => Number(x.importe_neto) || 0, agr, etiquetaFila: 'Sede', formatoValor: moneda })
        return { ...p, kpi: [['Ingresos netos', moneda(suma(ingresos.filas, 'importe_neto'))], ['Cobros', numero(ingresos.filas.length)]] }
      }
      case 'quejas': {
        const p = pivote({ items: quejas.filas, filaDe: x => `${x.podologo_id ?? 'sin'}|${x.sede_id}`, textoFila: x => `${x.podologo_id ? nombres[x.podologo_id] ?? '—' : 'Sin podólogo señalado'} · ${nomSede(x.sede_id)}`, fechaDe: x => x.fecha_hora.slice(0, 10), agr, etiquetaFila: 'Podólogo (quién atendió) · sede',
          extra: [{ key: 'resueltas', label: 'Resueltas', suma: x => (['resuelta', 'cerrada'].includes(x.estado) ? 1 : 0) }, { key: 'abiertas', label: 'Abiertas', suma: x => (['resuelta', 'cerrada'].includes(x.estado) ? 0 : 1) }] })
        return { ...p, kpi: [['Quejas', numero(quejas.filas.length)], ['Fuera de meta', numero(quejas.filas.filter(q => q.fuera_de_meta).length)]] }
      }
      case 'ocupacion': {
        const m = new Map()
        for (const f of ocup.filas) {
          const k = `${f.podologo_id}|${f.sede_id}`; const a = m.get(k) ?? { podologo: `${f.podologo_nombre ?? nombres[f.podologo_id] ?? '—'}`, sede: nomSede(f.sede_id), atendidas: 0, no_asistio: 0, canceladas: 0, ag: 0, di: 0, at: 0 }
          a.atendidas += Number(f.citas_atendidas) || 0; a.no_asistio += Number(f.no_asistio) || 0; a.canceladas += Number(f.canceladas) || 0
          a.ag += Number(f.minutos_agendados) || 0; a.di += Number(f.minutos_disponibles) || 0; a.at += Number(f.minutos_atendidos) || 0; m.set(k, a)
        }
        const filas = [...m.values()].map(a => ({ ...a, horas_ag: Math.round(a.ag / 6) / 10, horas_di: Math.round(a.di / 6) / 10, ocupacion: ocupacionPct(a.ag, a.di), faltas_pct: a.atendidas + a.no_asistio ? Math.round((a.no_asistio / (a.atendidas + a.no_asistio)) * 1000) / 10 : 0 })).sort((a, b) => b.atendidas - a.atendidas)
        return { columnas: [{ key: 'podologo', label: 'Podólogo' }, { key: 'sede', label: 'Sede' }, { key: 'atendidas', label: 'Atendidas', align: 'right', fmt: numero }, { key: 'no_asistio', label: 'No asistió', align: 'right', fmt: numero }, { key: 'canceladas', label: 'Canceladas', align: 'right', fmt: numero }, { key: 'faltas_pct', label: '% no asistió', align: 'right', fmt: n => `${n}%` }, { key: 'horas_ag', label: 'Horas agendadas', align: 'right', fmt: numero }, { key: 'horas_di', label: 'Horas disponibles', align: 'right', fmt: numero }, { key: 'ocupacion', label: 'Ocupación', align: 'right', fmt: n => (n == null ? '—' : `${n}%`) }], filas, kpi: [['Atendidas', numero(suma(filas, 'atendidas'))], ['No asistió', numero(suma(filas, 'no_asistio'))]] }
      }
      case 'inventario': {
        const filas = inv.filas.map(f => ({ producto: prodNombre[f.producto_id] ?? '—', sede: f.sede_nombre, existencia: Number(f.existencia), minimo: Number(f.minimo), maximo: f.maximo, ubicacion: f.ubicacion ?? '', caduca: f.proxima_caducidad ?? '', valor: Number(f.valor) || 0, estado: f.estado })).sort((a, b) => a.producto.localeCompare(b.producto, 'es') || a.sede.localeCompare(b.sede, 'es'))
        return { columnas: [{ key: 'producto', label: 'Producto' }, { key: 'sede', label: 'Sede' }, { key: 'existencia', label: 'Existencia', align: 'right', fmt: numero }, { key: 'minimo', label: 'Mínimo', align: 'right', fmt: numero }, { key: 'ubicacion', label: 'Ubicación' }, { key: 'caduca', label: 'Próx. caducidad', fmt: v => (v ? fecha(v) : '—') }, ...(verFin ? [{ key: 'valor', label: 'Valor', align: 'right', fmt: moneda, formato: 'moneda' }] : []), { key: 'estado', label: 'Estado', render: x => <StatusBadge estado={x.estado} /> }], filas, kpi: [['Renglones', numero(filas.length)], ['Bajo mínimo', numero(filas.filter(f => ['bajo_minimo', 'sin_existencia'].includes(f.estado)).length)]] }
      }
      case 'quien': {
        const filas = citasPac.filas.map((c, i) => ({ fecha: c.inicio, sede: c.sede_nombre, servicio: c.servicio_nombre ?? '—', agendado: c.podologo_nombre ?? '—', atendio: c.atendio_id ? nombres[c.atendio_id] ?? '—' : (c.estado === 'atendida' ? c.podologo_nombre ?? '—' : '—'), estado: c.estado, anterior: i === (citasPac.filas.findIndex(x => x.estado === 'atendida')) }))
        return { columnas: [{ key: 'fecha', label: 'Fecha', fmt: v => fecha(v) }, { key: 'sede', label: 'Sede' }, { key: 'servicio', label: 'Servicio' }, { key: 'agendado', label: 'Podólogo agendado' }, { key: 'atendio', label: 'Quién atendió' }, { key: 'estado', label: 'Estado', render: x => <><StatusBadge estado={x.estado} />{x.anterior && <span className="bd m" style={{ marginLeft: 6 }}>Sesión anterior</span>}</> }], filas, kpi: [['Sesiones', numero(filas.filter(f => f.estado === 'atendida').length)]] }
      }
      default: return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, serv.filas, lineas.filas, ingresos.filas, quejas.filas, ocup.filas, inv.filas, citasPac.filas, nombres, prodNombre, agr, sedes, verFin])

  const cargando = { servicio: serv, podologo: lineas, sede: ingresos, quejas, ocupacion: ocup, inventario: inv, quien: citasPac }[rep]?.cargando
  const error = { servicio: serv, podologo: lineas, sede: ingresos, quejas, ocupacion: ocup, inventario: inv, quien: citasPac }[rep]?.error
  const meta = CATALOGO.flatMap(g => g.items).find(i => i.id === rep)
  const fmtCelda = (c, f) => (c.render ? c.render(f) : c.fmt ? c.fmt(f[c.key]) : f[c.key] ?? '—')
  const columnasTabla = r?.columnas.map(c => ({ key: c.key, label: c.label, align: c.align, render: x => fmtCelda(c, x), valor: x => x[c.key] }))
  const hojas = r ? [{ nombre: meta?.titulo.slice(0, 28) ?? 'Reporte', columnas: r.columnas.map(c => ({ key: c.key, label: c.label, formato: c.formato })), filas: r.filas.map(f => Object.fromEntries(r.columnas.map(c => [c.key, c.key === 'fecha' && typeof f[c.key] === 'string' ? f[c.key].slice(0, 10) : f[c.key]]))) }] : []
  const filtrosPeriodo = ['servicio', 'podologo', 'sede', 'quejas', 'ocupacion'].includes(rep)
  const sedeTxt = sedeActivaId ? nomSede(sedeActivaId) : 'todas mis sedes'

  if (!rep) {
    return (
      <div className="pagina">
        <PageHeader titulo="Reportes y BI" subtitulo="Inteligencia de negocio e informes gerenciales" />
        {CATALOGO.map(g => {
          const items = g.items.filter(i => !i.fin || verFin)
          if (!items.length) return null
          return (
            <div key={g.grupo} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{g.grupo}</h3>
              <div className="grid-kpis" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {items.map(i => (
                  <div key={i.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}><i.icon size={16} color="var(--accent)" /> {i.titulo}</div>
                    <div className="mini" style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>{i.desc}</div>
                    <button type="button" className="btn o sm" onClick={() => setRep(i.id)} style={{ alignSelf: 'flex-start' }}>Generar reporte</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="mini" style={{ fontSize: 11.5, color: 'var(--muted)' }}>Los reportes de planes, órdenes de trabajo, CFDI, nómina e incidencias de personal viven en sus propios módulos.</div>
      </div>
    )
  }

  return (
    <div className="pagina">
      <PageHeader titulo={meta.titulo} subtitulo={`${meta.desc} · ${sedeTxt}`}
        acciones={<><button type="button" className="btn o" onClick={() => { setRep(null); setPacSel(null) }}><ArrowLeft size={14} style={{ verticalAlign: -3 }} /> Catálogo</button>
          <BotonesExportar nombre={`reporte_${rep}`} titulo={`${meta.titulo} · ${sedeTxt}`} hojas={hojas} deshabilitado={!r?.filas.length}>
            {r && <TablaImprimible columnas={r.columnas.map(c => ({ key: c.key, label: c.label, align: c.align, render: x => (c.render ? String(fmtCelda({ ...c, render: undefined }, x)) : fmtCelda(c, x)) }))} filas={r.filas} />}
          </BotonesExportar></>} />
      <div className="toolbar">
        {filtrosPeriodo && <><label className="mini">Del <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
          <label className="mini">al <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label></>}
        {['podologo', 'sede', 'quejas'].includes(rep) && (
          <select value={agr} onChange={e => setAgr(e.target.value)} aria-label="Agrupar"><option value="dia">Agrupar: día</option><option value="mes">Agrupar: mes</option><option value="anio">Agrupar: año</option></select>)}
        {['quejas', 'ocupacion'].includes(rep) && (
          <select value={podologoId} onChange={e => setPodologoId(e.target.value)} aria-label="Podólogo"><option value="">Todos los podólogos</option>
            {perfiles.filter(p => p.rol === 'podologo').map(p => <option key={p.id} value={p.id}>{nombres[p.id]}</option>)}</select>)}
        {rep === 'quejas' && <select value={claseQueja} onChange={e => setClaseQueja(e.target.value)} aria-label="Clase"><option value="">Todas las clases</option><option value="administrativa">Administrativas</option><option value="evento_adverso_clinico">Eventos adversos clínicos</option></select>}
        {rep === 'quien' && (
          <div style={{ position: 'relative' }}>
            <input placeholder="Buscar paciente (nombre o expediente)…" value={pacSel ? pacSel.nombre_completo : pacTexto} onChange={e => { setPacSel(null); setPacTexto(e.target.value) }} style={{ minWidth: 280 }} />
            {!pacSel && pacTexto.trim().length >= 2 && pacs.filas.length > 0 && (
              <div className="card" style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, padding: 4 }}>
                {pacs.filas.map(p => <div key={p.id} className="clickable" style={{ padding: '6px 8px', cursor: 'pointer', fontSize: 13 }} onClick={() => setPacSel(p)}>{p.nombre_completo} <span className="mini" style={{ color: 'var(--muted)' }}>{p.numero_expediente}</span></div>)}
              </div>)}
          </div>)}
      </div>
      {r?.kpi && <div className="grid-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>{r.kpi.map(([t, v]) => <KPICard key={t} title={t} value={v} />)}</div>}
      {rep === 'quien' && !pacSel
        ? <EmptyState icon={ClipboardList} title="Elige un paciente" description="Busca al paciente para ver quién atendió cada una de sus sesiones." />
        : <DataTable columnas={columnasTabla} filas={r?.filas ?? []} cargando={cargando} error={error} sinPaginacion={(r?.filas.length ?? 0) <= 200} filaKey="fila" buscador
            vacio={{ title: 'Sin datos', description: 'No hay información para los filtros elegidos.' }} />}
    </div>
  )
}
