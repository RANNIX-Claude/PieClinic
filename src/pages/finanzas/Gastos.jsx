// Gastos operativos · capturar ticket (mockup 34; clon de IRP GastosOperativos.jsx). Lee prp_gastos; escribe en gastos / gasto_lineas /
// comprobantes_carga. Reglas: comprobante fiscal desde el umbral (P-093), rubros del fondo (P-095), anular con motivo (no se borra), OCR simulado (P-126).
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Camera, Ban, Image as ImagenIcono, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { insertar, actualizar, borrar, leer, rpc } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { BUCKETS, rutaStorage } from '../../lib/urlFirmada'
import { moneda, fecha } from '../../lib/formato'
import { semanaCorte } from '../../lib/finanzas/semana.js'
import { parametrosFinanzas } from '../../lib/finanzas/constantes.js'
import { requiereComprobante, cuadreTicket, validarGasto, desglosarIVA } from '../../lib/finanzas/gastos.js'
import { leerTicket, MODO_OCR_TEXTO } from '../../lib/adaptadores/ocr_ticket.js'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useVista, SelectorMes, anioMesActual, mensajeError, VistaNoDisponible, Chips, hoy, AvisoSimulado } from './componentes/comunes.jsx'
import SubirComprobante, { verComprobante } from './componentes/SubirComprobante.jsx'
import { exportarExcel } from '../../lib/finanzas/exportar.js'

export const METODOS_PAGO = [
  { value: 'efectivo_fondo', label: 'Efectivo (fondo revolvente)' },
  { value: 'tarjeta_clinica', label: 'Tarjeta de la clínica' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'pagado_por_empleado', label: 'Pagado por empleado (reembolsable)' },
]
const etiquetaMetodo = v => METODOS_PAGO.find(m => m.value === v)?.label ?? v

export default function Gastos() {
  const { sedes, sedeActivaId, organizacion, rol } = useApp()
  const qc = useQueryClient()
  const puedeCapturar = usePermiso('fondo.operar')
  const esAdmin = rol === 'administrador'
  const params = parametrosFinanzas(organizacion)
  const [{ anio, mes }, setPeriodo] = useState(anioMesActual)
  const [grupoFiltro, setGrupoFiltro] = useState('todos')
  const [estado, setEstado] = useState('guardado')
  const [form, setForm] = useState(null) // null | {} (nuevo) | fila (editar)
  const [carga, setCarga] = useState(false)
  const { confirmar, dialogo } = useConfirmacion()

  const hoyIso = hoy()
  const año0 = `${anio}-01-01`, año1 = `${anio}-12-31`
  const gastosAnio = useVista('gastos', 'prp_gastos', { filtros: { fecha: { gte: año0, lte: año1 } }, orden: [{ columna: 'fecha', asc: false }, { columna: 'created_at', asc: false }], limite: 5000 })
  const grupos = useVista('grupos', 'grupos_gasto', { sedeCol: false, filtros: { activo: true }, orden: [{ columna: 'orden' }], limite: 100 })
  const provs = useVista('prov', 'prp_proveedores', { sedeCol: false, columnas: 'id,nombre,activo', filtros: { activo: true }, orden: [{ columna: 'nombre' }], limite: 3000 })
  const fondos = useVista('fondos-activos', 'fondos_revolventes', { filtros: { activo: true }, limite: 50 })
  const invalidar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  const mesKey = `${anio}-${String(mes).padStart(2, '0')}`
  const sem = semanaCorte(hoyIso, params.semana_inicio_dow)
  const vigentes = gastosAnio.filas.filter(g => g.estado !== 'anulado')
  const kSemana = vigentes.filter(g => g.fecha >= sem.inicio && g.fecha <= sem.fin)
  const kMes = vigentes.filter(g => g.fecha.startsWith(mesKey))
  const conCat = kSemana.filter(g => g.proveedor_id).length
  const enMes = useMemo(() => gastosAnio.filas.filter(g => g.fecha.startsWith(mesKey) && (estado === 'todos' || g.estado === estado) && (grupoFiltro === 'todos' || g.grupo_id === grupoFiltro)), [gastosAnio.filas, mesKey, estado, grupoFiltro])
  const totalDia = useMemo(() => { const m = {}; for (const g of enMes) m[g.fecha] = (m[g.fecha] ?? 0) + Number(g.total); return m }, [enMes])

  async function anular(g) {
    const m = await confirmar({ titulo: 'Anular gasto', mensaje: `Un gasto guardado no se borra: se anula con motivo y deja de contar en los totales. ${moneda(g.total)} · ${g.proveedor_nombre ?? ''}`, pedirMotivo: true, peligro: true, textoConfirmar: 'Anular' })
    if (!m) return
    const r = await actualizar('gastos', g.id, { estado: 'anulado', anulado_motivo: m })
    if (r.error) toast.error(mensajeError(r.error)); else { toast.success('Gasto anulado.'); invalidar() }
  }

  const columnas = [
    { key: 'fecha', label: 'Fecha', render: g => <>{fecha(g.fecha)}{g.estado === 'anulado' && <span className="bd n" style={{ marginLeft: 4 }}>Anulado</span>}</>, valor: g => g.fecha },
    { key: 'proveedor', label: 'Proveedor', render: g => <>{g.proveedor_nombre ?? '—'}{!g.proveedor_id && g.proveedor_texto && <span className="bd a" style={{ marginLeft: 4 }} title="Texto libre: aún sin ligar al catálogo">sin catálogo</span>}</>, valor: g => g.proveedor_nombre ?? '' },
    { key: 'grupo', label: 'Grupo', valor: g => g.grupo_nombre, filtro: true },
    { key: 'sede', label: 'Sede', valor: g => (g.compartido ? 'Compartido (clínica)' : g.sede_nombre), filtro: true },
    { key: 'descripcion', label: 'Descripción', render: g => <>{g.descripcion ?? '—'}{g.num_lineas > 0 && <span className="bd m" style={{ marginLeft: 4 }}>{g.num_lineas} art.</span>}</>, valor: g => g.descripcion ?? '' },
    { key: 'metodo', label: 'Pago', valor: g => etiquetaMetodo(g.metodo_pago) },
    { key: 'comp', label: 'Comprobante', valor: g => (g.comprobante_ok ? 'Con factura' : g.exige_comprobante ? 'Falta' : 'Sin factura'), render: g => g.comprobante_ok ? <span className="bd v">Factura</span> : g.exige_comprobante && g.origen_modulo === 'manual' ? <span className="bd r">Falta factura</span> : <span className="bd n">Sin factura</span>, filtro: true },
    { key: 'total', label: 'Monto', align: 'right', render: g => <b className="num">{moneda(g.total)}</b>, valor: g => Number(g.total) },
    { key: 'dia', label: 'Total día', align: 'right', sortable: false, valor: g => totalDia[g.fecha], render: g => <span className="num" style={{ color: 'var(--muted)' }}>{moneda(totalDia[g.fecha])}</span> },
    { key: 'acc', label: 'Detalle', sortable: false, exportar: false, render: g => (
      <span style={{ display: 'inline-flex', gap: 4 }} onClick={e => e.stopPropagation()}>
        {g.ticket_url && <button type="button" className="btn o sm" title="Ver ticket" onClick={() => verComprobante(g.ticket_url)}><ImagenIcono size={12} /> Ticket</button>}
        {puedeCapturar && g.estado === 'guardado' && g.origen_modulo === 'manual' && <button type="button" className="btn red sm" title="Anular" onClick={() => anular(g)}><Ban size={12} /></button>}
      </span>) },
  ]

  async function exportar() {
    await exportarExcel(`gastos_${mesKey}`, [{ nombre: 'Gastos', columnas: [
      { label: 'Fecha', key: 'fecha' }, { label: 'Sede', key: 'sede' }, { label: 'Proveedor', key: 'prov' }, { label: 'Grupo', key: 'grupo' }, { label: 'Descripción', key: 'desc' },
      { label: 'Pago', key: 'pago' }, { label: 'Folio/UUID', key: 'folio' }, { label: 'Subtotal', key: 'subtotal', formato: 'moneda' }, { label: 'IVA', key: 'iva', formato: 'moneda' }, { label: 'Total', key: 'total', formato: 'moneda' }, { label: 'Estado', key: 'estado' },
    ], filas: enMes.map(g => ({ fecha: g.fecha, sede: g.compartido ? 'Compartido' : g.sede_nombre, prov: g.proveedor_nombre ?? '', grupo: g.grupo_nombre, desc: g.descripcion ?? '', pago: etiquetaMetodo(g.metodo_pago), folio: g.folio_comprobante ?? g.cfdi_uuid ?? '', subtotal: Number(g.subtotal), iva: Number(g.iva), total: Number(g.total), estado: g.estado })) }],
    { entidad: 'gastos', detalle: { filas: enMes.length, periodo: mesKey }, sedeId: sedeActivaId })
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Gastos operativos · Capturar ticket" subtitulo="Captura individual o carga en grupo de comprobantes (lectura automática: modo simulado hasta configurar la IA)"
        acciones={<>
          {esAdmin && <button type="button" className="btn o" onClick={() => setCarga(true)} disabled={!puedeCapturar}><Camera size={14} style={{ verticalAlign: -3 }} /> Carga en grupo</button>}
          <button type="button" className="btn o" onClick={exportar} disabled={!enMes.length}>Exportar</button>
          {puedeCapturar && <button type="button" className="btn" onClick={() => setForm({})}><Plus size={14} style={{ verticalAlign: -3 }} /> Nuevo ticket</button>}
        </>} />
      {!esAdmin && <div className="hint" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Recepción captura y consulta solo los gastos de efectivo del fondo revolvente de su sede.</div>}
      {gastosAnio.noDisponible ? <VistaNoDisponible nombre="prp_gastos" /> : <>
        <div className="grid-kpis">
          <KPICard title="Tickets esta semana" value={String(kSemana.length)} subtitle={`${kSemana.filter(g => g.ticket_url).length} con foto · ${moneda(kSemana.reduce((s, g) => s + Number(g.total), 0))}`} loading={gastosAnio.cargando} ayuda={`Semana ${sem.etiqueta}: sábado a viernes.`} />
          <KPICard title="Este mes" value={String(kMes.length)} subtitle={moneda(kMes.reduce((s, g) => s + Number(g.total), 0))} loading={gastosAnio.cargando} />
          <KPICard title={`Año ${anio}`} value={String(vigentes.length)} subtitle={moneda(vigentes.reduce((s, g) => s + Number(g.total), 0))} loading={gastosAnio.cargando} />
          <KPICard title="Con proveedor del catálogo" value={kSemana.length ? `${Math.round((conCat / kSemana.length) * 100)}%` : '—'} subtitle={`${conCat} de ${kSemana.length} (semana)`} color="var(--green)" loading={gastosAnio.cargando} />
          <KPICard title="Sin comprobante exigido" value={String(vigentes.filter(g => g.exige_comprobante && !g.comprobante_ok && g.origen_modulo === 'manual').length)} subtitle={`Desde ${moneda(params.comprobante_gasto_desde)}`} color="var(--red)" loading={gastosAnio.cargando} />
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <SelectorMes anio={anio} mes={mes} onChange={setPeriodo} />
          <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado"><option value="guardado">Guardados</option><option value="anulado">Anulados</option><option value="todos">Todos</option></select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <Chips valor={grupoFiltro} onChange={setGrupoFiltro} opciones={[{ value: 'todos', label: 'Todos' }, ...grupos.filas.map(g => ({ value: g.id, label: g.nombre }))]} />
        </div>
        <DataTable columnas={columnas} filas={enMes} cargando={gastosAnio.cargando} error={gastosAnio.error} onFila={g => setForm(g)} placeholderBusqueda="Buscar proveedor o descripción…" tamanoPagina={30}
          vacio={{ title: 'Sin gastos', description: 'No hay tickets con estos filtros en el mes.' }} />
      </>}
      {form && <ModalGasto base={form} onClose={() => setForm(null)} onListo={() => invalidar()} sedes={sedes} sedeActivaId={sedeActivaId} grupos={grupos.filas} provs={provs.filas} fondos={fondos.filas} params={params} esAdmin={esAdmin} puedeCapturar={puedeCapturar} />}
      {carga && <ModalCarga onClose={() => setCarga(false)} onListo={invalidar} sedes={sedes} sedeActivaId={sedeActivaId} grupos={grupos.filas} params={params} />}
      {dialogo}
    </div>
  )
}

// ───────────────────────── Nuevo / editar gasto ─────────────────────────
const lineaVacia = () => ({ sku: '', descripcion: '', cantidad: 1, precio_unitario: '', impuesto_pct: 16 })

function ModalGasto({ base, onClose, onListo, sedes, sedeActivaId, grupos, provs, fondos, params, esAdmin, puedeCapturar }) {
  const editando = !!base.id
  const bloqueado = editando && (base.estado === 'anulado' || base.origen_modulo !== 'manual') || !puedeCapturar
  const sedeIni = base.sede_id ?? sedeActivaId ?? (sedes.length === 1 ? sedes[0].id : '')
  const [f, setF] = useState(() => ({
    fecha: base.fecha ?? hoy(), sede_id: sedeIni, compartido: !!base.compartido, proveedor_id: base.proveedor_id ?? '', proveedor_texto: base.proveedor_texto ?? '',
    grupo_id: base.grupo_id ?? '', metodo_pago: base.metodo_pago ?? (esAdmin ? 'tarjeta_clinica' : 'efectivo_fondo'),
    total: base.total ?? '', conIva: base.id ? Number(base.iva) > 0 : true, iva: base.iva ?? '', ticket_total: base.ticket_total && base.id ? base.ticket_total : '',
    folio_comprobante: base.folio_comprobante ?? '', cfdi_uuid: base.cfdi_uuid ?? '', factura_url: base.factura_url ?? null, ticket_url: base.ticket_url ?? null,
    descripcion: base.descripcion ?? '', pagado_por_nombre: base.pagado_por_nombre ?? '',
  }))
  const [lineas, setLineas] = useState([])
  const [cargoLineas, setCargoLineas] = useState(!editando)
  const [guardando, setGuardando] = useState(false)
  const [nuevoProv, setNuevoProv] = useState('')
  const qc = useQueryClient()
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  // líneas existentes al editar
  const lineasBD = useVista('lineas-' + (base.id ?? 'nuevo'), 'gasto_lineas', { sedeCol: false, filtros: { gasto_id: base.id ?? '00000000-0000-0000-0000-000000000000' }, limite: 200 }, { enabled: editando })
  if (editando && !cargoLineas && !lineasBD.cargando) { setLineas(lineasBD.filas.map(l => ({ id: l.id, sku: l.sku ?? '', descripcion: l.descripcion, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario), impuesto_pct: Number(l.impuesto_pct) }))); setCargoLineas(true) }

  const total = Number(f.total) || 0
  const des = f.conIva ? desglosarIVA(total, params.iva_tasa_general) : { subtotal: total, iva: 0, total }
  const grupo = grupos.find(g => g.id === f.grupo_id)
  const fondo = fondos.find(x => x.sede_id === f.sede_id)
  const lineasValidas = lineas.filter(l => l.descripcion?.trim() || Number(l.precio_unitario) > 0)
  const cuadre = cuadreTicket(lineasValidas.map(l => ({ importe: Number(l.cantidad) * Number(l.precio_unitario) * (1 + Number(l.impuesto_pct || 0) / 100) })), f.ticket_total === '' ? total : f.ticket_total)
  const tieneFactura = !!(f.factura_url || f.cfdi_uuid.trim())
  const errores = validarGasto({
    fecha: f.fecha, total, sede_id: f.compartido ? 'compartido' : f.sede_id, grupo_id: f.grupo_id, proveedor_id: f.proveedor_id, proveedor_nombre: f.proveedor_texto,
    factura_url: f.factura_url, cfdi_uuid: f.cfdi_uuid.trim(), pagado_por_empleado: f.metodo_pago === 'pagado_por_empleado', pagado_por_id: f.pagado_por_nombre.trim(),
    origen: f.metodo_pago === 'efectivo_fondo' ? 'fondo' : 'otro', lineas: lineasValidas.length ? lineasValidas.map(l => ({ importe: Number(l.cantidad) * Number(l.precio_unitario) * (1 + Number(l.impuesto_pct || 0) / 100) })) : undefined,
    ticket_total: f.ticket_total === '' ? undefined : Number(f.ticket_total),
  }, { umbralComprobante: params.comprobante_gasto_desde, fondo: f.metodo_pago === 'efectivo_fondo' ? (fondo ?? null) : true, rubrosFondo: grupos.filter(g => g.permite_fondo).map(g => g.id) })
  if (f.metodo_pago === 'efectivo_fondo' && f.compartido) errores.push('Un gasto del fondo pertenece a una sede, no es compartido.')

  async function crearProveedor() {
    if (!nuevoProv.trim()) return
    const r = await rpc('proveedor_crear_rapido', { p_nombre: nuevoProv.trim(), p_categoria: 'operacion' })
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Proveedor creado en el catálogo.')
    await qc.invalidateQueries({ queryKey: ['finanzas', 'prov'] })
    set('proveedor_id', r.data); set('proveedor_texto', nuevoProv.trim()); setNuevoProv('')
  }
  async function guardar(otro) {
    if (errores.length) return toast.error(errores[0])
    setGuardando(true)
    const fila = {
      sede_id: f.compartido ? null : f.sede_id, compartido: f.compartido, fecha: f.fecha, proveedor_id: f.proveedor_id || null,
      proveedor_texto: f.proveedor_id ? (provs.find(p => p.id === f.proveedor_id)?.nombre ?? f.proveedor_texto) : f.proveedor_texto.trim() || null,
      grupo_id: f.grupo_id, metodo_pago: f.metodo_pago, fondo_id: f.metodo_pago === 'efectivo_fondo' ? (fondo?.id ?? null) : null,
      subtotal: des.subtotal, iva: des.iva, total: des.total, ticket_total: f.ticket_total === '' ? null : Number(f.ticket_total),
      folio_comprobante: f.folio_comprobante.trim() || null, cfdi_uuid: f.cfdi_uuid.trim() || null, tiene_factura: tieneFactura, factura_url: f.factura_url,
      ticket_url: f.ticket_url, descripcion: f.descripcion.trim() || null,
      pagado_por_nombre: f.metodo_pago === 'pagado_por_empleado' ? f.pagado_por_nombre.trim() : null,
    }
    const r = editando ? await actualizar('gastos', base.id, fila) : await insertar('gastos', { ...fila, origen_captura: f.metodo_pago === 'efectivo_fondo' ? 'fondo' : 'individual', estado: 'guardado' })
    if (r.error) { setGuardando(false); return toast.error(mensajeError(r.error)) }
    const id = editando ? base.id : r.data?.[0]?.id
    // artículos del ticket: se reemplazan todos
    if (id && (lineasValidas.length || editando)) {
      if (editando) { for (const l of lineasBD.filas) await borrar('gasto_lineas', l.id) }
      if (lineasValidas.length) {
        const rl = await insertar('gasto_lineas', lineasValidas.map(l => ({ gasto_id: id, sede_id: fila.sede_id, sku: l.sku?.trim() || null, descripcion: l.descripcion.trim() || 'Artículo', cantidad: Number(l.cantidad) || 1, precio_unitario: Number(l.precio_unitario) || 0, impuesto_pct: Number(l.impuesto_pct) || 0 })))
        if (rl.error) toast.error(`El gasto se guardó, pero no el detalle: ${mensajeError(rl.error)}`)
      }
    }
    setGuardando(false)
    toast.success(editando ? 'Gasto actualizado.' : 'Gasto guardado.')
    onListo()
    if (otro) { setF(x => ({ ...x, total: '', ticket_total: '', folio_comprobante: '', cfdi_uuid: '', factura_url: null, ticket_url: null, descripcion: '' })); setLineas([]) } else onClose()
  }
  const setLinea = (i, k, v) => setLineas(ls => ls.map((l, n) => (n === i ? { ...l, [k]: v } : l)))
  return (
    <Modal open onClose={onClose} size="wide" cerrarAlClicFuera={false} title={editando ? `Gasto ${fecha(base.fecha)} · ${moneda(base.total)}` : 'Nuevo gasto'}
      footer={<>
        <button type="button" className="btn o" onClick={onClose}>{bloqueado ? 'Cerrar' : 'Cancelar'}</button>
        {!bloqueado && !editando && <button type="button" className="btn o" disabled={guardando} onClick={() => guardar(true)}>Guardar y agregar otro</button>}
        {!bloqueado && <button type="button" className="btn" disabled={guardando} onClick={() => guardar(false)}>{guardando ? 'Guardando…' : 'Guardar gasto'}</button>}
      </>}>
      {bloqueado && editando && <div className="hint" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{base.estado === 'anulado' ? `Gasto anulado: ${base.anulado_motivo ?? ''}` : 'Este gasto no se edita aquí (lo generó otro módulo o no tienes permiso).'}</div>}
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="grid2">
          <FormField label="Fecha" required type="date" value={f.fecha} max={hoy()} onChange={e => set('fecha', e.target.value)} />
          <FormField label="Sede" required as="select" value={f.compartido ? '' : f.sede_id} disabled={f.compartido || bloqueado} onChange={e => set('sede_id', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} hint={esAdmin ? undefined : undefined} />
          <FormField label="Proveedor (catálogo)" as="select" value={f.proveedor_id} onChange={e => set('proveedor_id', e.target.value)} placeholder="— Sin catálogo (texto libre) —" options={provs.map(p => ({ value: p.id, label: p.nombre }))} />
          {!f.proveedor_id && <FormField label="Proveedor (texto libre)" required value={f.proveedor_texto} onChange={e => set('proveedor_texto', e.target.value)} hint="Se liga solo al catálogo si coincide con un nombre o alias." />}
          <FormField label="Categoría / grupo" required as="select" value={f.grupo_id} onChange={e => set('grupo_id', e.target.value)} options={grupos.map(g => ({ value: g.id, label: g.nombre + (g.permite_fondo ? '' : ' (no del fondo)') }))} />
          <FormField label="Método de pago" required as="select" value={f.metodo_pago} onChange={e => set('metodo_pago', e.target.value)} options={esAdmin ? METODOS_PAGO : METODOS_PAGO.slice(0, 1)} hint={f.metodo_pago === 'efectivo_fondo' ? (fondo ? `Fondo: ${fondo.nombre}` : 'La sede no tiene fondo activo') : undefined} />
          {f.metodo_pago === 'pagado_por_empleado' && <FormField label="Empleado que pagó" required value={f.pagado_por_nombre} onChange={e => set('pagado_por_nombre', e.target.value)} />}
          <FormField label="Total (con IVA)" required type="number" min="0" step="0.01" value={f.total} onChange={e => set('total', e.target.value)}
            hint={`Subtotal ${moneda(des.subtotal)} · IVA ${moneda(des.iva)}${requiereComprobante(total, params.comprobante_gasto_desde) ? ' · exige comprobante fiscal' : ''}`} />
          <FormField label="Total del ticket (cifra de control)" type="number" min="0" step="0.01" value={f.ticket_total} onChange={e => set('ticket_total', e.target.value)} hint="Opcional: se compara con el detalle de artículos." />
          <FormField label="Folio del comprobante" value={f.folio_comprobante} onChange={e => set('folio_comprobante', e.target.value)} />
          <FormField label="UUID del CFDI" value={f.cfdi_uuid} onChange={e => set('cfdi_uuid', e.target.value)} />
        </div>
        <FormField label="Descripción" value={f.descripcion} onChange={e => set('descripcion', e.target.value)} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, margin: '6px 0' }}>
          <label><input type="checkbox" checked={f.conIva} onChange={e => set('conIva', e.target.checked)} /> El total incluye IVA ({params.iva_tasa_general}%)</label>
          {esAdmin && <label><input type="checkbox" checked={f.compartido} onChange={e => set('compartido', e.target.checked)} /> Gasto compartido de la clínica (se prorratea entre sedes)</label>}
          {grupo && !grupo.permite_fondo && f.metodo_pago === 'efectivo_fondo' && <span style={{ color: 'var(--red)' }}>Este rubro no se paga con el fondo.</span>}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
          <span>Ticket / foto: <SubirComprobante carpeta="gastos" valor={f.ticket_url} capture="environment" etiqueta="Foto del ticket" onSubida={({ ruta }) => set('ticket_url', ruta)} disabled={bloqueado} /></span>
          <span>Factura XML/PDF: <SubirComprobante carpeta="gastos" valor={f.factura_url} etiqueta="Subir factura" onSubida={({ ruta }) => set('factura_url', ruta)} disabled={bloqueado} /></span>
          <span className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}><AvisoSimulado texto="Lectura del ticket: modo simulado" /></span>
        </div>
        {esAdmin && <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 8, margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <UserPlus size={14} /> <input placeholder="Nuevo proveedor (alta rápida)" value={nuevoProv} onChange={e => setNuevoProv(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <button type="button" className="btn o sm" onClick={crearProveedor} disabled={!nuevoProv.trim()}>Crear en catálogo</button>
        </div>}
        <div style={{ marginTop: 10 }}>
          <b style={{ fontSize: 13 }}>Artículos del ticket</b> <span className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}>(opcional; no mueve inventario, sirve para analizar compras)</span>
          {lineas.length > 0 && <div className="tabla-wrap"><table>
            <thead><tr><th>SKU</th><th>Descripción</th><th>Cant.</th><th>P/U</th><th style={{ textAlign: 'right' }}>Subtotal</th><th>Imp. %</th><th /></tr></thead>
            <tbody>{lineas.map((l, i) => (
              <tr key={i}>
                <td><input value={l.sku} style={{ width: 90 }} onChange={e => setLinea(i, 'sku', e.target.value)} /></td>
                <td><input value={l.descripcion} onChange={e => setLinea(i, 'descripcion', e.target.value)} /></td>
                <td><input type="number" min="0" step="0.001" style={{ width: 70 }} value={l.cantidad} onChange={e => setLinea(i, 'cantidad', e.target.value)} /></td>
                <td><input type="number" min="0" step="0.01" style={{ width: 90 }} value={l.precio_unitario} onChange={e => setLinea(i, 'precio_unitario', e.target.value)} /></td>
                <td className="num" style={{ textAlign: 'right' }}>{moneda((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))}</td>
                <td><input type="number" min="0" max="100" style={{ width: 60 }} value={l.impuesto_pct} onChange={e => setLinea(i, 'impuesto_pct', e.target.value)} /></td>
                <td>{!bloqueado && <button type="button" className="btn red sm" onClick={() => setLineas(ls => ls.filter((_, n) => n !== i))}><Trash2 size={12} /></button>}</td>
              </tr>))}</tbody>
          </table></div>}
          {!bloqueado && <button type="button" className="btn o sm" style={{ marginTop: 6 }} onClick={() => setLineas(ls => [...ls, lineaVacia()])}><Plus size={12} /> Agregar artículo</button>}
          {lineasValidas.length > 0 && <div style={{ fontSize: 12, marginTop: 6, color: cuadre.cuadra ? 'var(--green)' : 'var(--red)' }}>Detalle con impuesto: {moneda(cuadre.suma)} · {cuadre.cuadra ? 'cuadra con el ticket' : `diferencia de ${moneda(cuadre.diferencia)} contra el ticket`}</div>}
        </div>
        {!bloqueado && errores.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{errores.map(e => <li key={e}>{e}</li>)}</ul>}
      </fieldset>
    </Modal>
  )
}

// ───────────────────────── Carga en grupo (E108) ─────────────────────────
function ModalCarga({ onClose, onListo, sedes, sedeActivaId, grupos, params }) {
  const { organizacion } = useApp()
  const input = useRef(null)
  const [sedeId, setSedeId] = useState(sedeActivaId ?? (sedes.length === 1 ? sedes[0].id : ''))
  const [grupoId, setGrupoId] = useState('')
  const [metodo, setMetodo] = useState('tarjeta_clinica')
  const [filas, setFilas] = useState([])
  const [procesando, setProcesando] = useState(false)
  const pendientes = useVista('cargas-pend', 'comprobantes_carga', { filtros: { estado: ['procesando', 'listo', 'ilegible'] }, orden: [{ columna: 'created_at', asc: false }], limite: 100 })
  const mostradas = useMemo(() => {
    const ids = new Set(filas.map(f => f.id))
    return [...filas, ...pendientes.filas.filter(p => !ids.has(p.id)).map(p => ({ id: p.id, nombre: p.archivo_path.split('/').pop(), archivo_path: p.archivo_path, estado: p.estado, proveedor: p.proveedor_leido ?? '', total: p.total_leido ?? '', fecha: p.fecha_leida ?? '', folio: p.folio_leido ?? '', sede_id: p.sede_id }))]
  }, [filas, pendientes.filas])
  const setFila = (id, k, v) => setFilas(fs => (fs.some(f => f.id === id) ? fs.map(f => (f.id === id ? { ...f, [k]: v } : f)) : [...fs, { ...mostradas.find(f => f.id === id), [k]: v }]))

  async function elegir(e) {
    const archivos = [...(e.target.files ?? [])]; e.target.value = ''
    if (!archivos.length) return
    if (!sedeId) return toast.error('Primero elige la sede.')
    setProcesando(true)
    for (const a of archivos) {
      if (!a.type.startsWith('image/') && a.type !== 'application/pdf') { toast.error(`${a.name}: solo imágenes o PDF`); continue }
      if (a.size > 10 * 1024 * 1024) { toast.error(`${a.name}: excede 10 MB`); continue }
      const ruta = rutaStorage(organizacion.id, 'gastos', 'lote', `${crypto.randomUUID()}.${a.type === 'application/pdf' ? 'pdf' : 'jpg'}`)
      const up = await supabase.storage.from(BUCKETS.comprobantes).upload(ruta, a, { contentType: a.type, upsert: false })
      if (up.error) { toast.error(`${a.name}: ${up.error.message}`); continue }
      const ins = await insertar('comprobantes_carga', { sede_id: sedeId, archivo_path: ruta, estado: 'procesando', grupo_id: grupoId || null })
      if (ins.error) { toast.error(mensajeError(ins.error)); continue }
      const id = ins.data[0].id
      const lec = await leerTicket(ruta)
      const cambios = { estado: lec.estado, proveedor_leido: lec.proveedor, total_leido: lec.total, fecha_leida: lec.fecha, folio_leido: lec.folio, confianza: lec.confianza, ia_respuesta: { modo: lec.modo } }
      await actualizar('comprobantes_carga', id, cambios)
      setFilas(fs => [...fs, { id, nombre: a.name, archivo_path: ruta, estado: lec.estado, proveedor: lec.proveedor ?? '', total: lec.total ?? '', fecha: lec.fecha ?? hoy(), folio: lec.folio ?? '', sede_id: sedeId }])
    }
    setProcesando(false); pendientes.refetch()
  }
  const listas = mostradas.filter(f => f.estado === 'listo' || f.estado === 'ilegible')
  function problema(f) {
    const t = Number(f.total)
    if (!(t > 0)) return 'Captura el total'
    if (!String(f.proveedor).trim()) return 'Falta proveedor'
    if (!f.fecha) return 'Falta fecha'
    if (requiereComprobante(t, params.comprobante_gasto_desde)) return `Desde ${moneda(params.comprobante_gasto_desde)} exige factura: captúralo individual`
    return null
  }
  async function guardarListos() {
    if (!grupoId) return toast.error('Elige el grupo para todos.')
    let ok = 0
    setProcesando(true)
    for (const f of listas) {
      const p = problema(f)
      if (p) { toast.error(`${f.nombre}: ${p}`); continue }
      const t = Number(f.total), d = desglosarIVA(t, params.iva_tasa_general)
      const r = await insertar('gastos', { sede_id: f.sede_id ?? sedeId, fecha: f.fecha, proveedor_texto: String(f.proveedor).trim(), grupo_id: grupoId, metodo_pago: metodo, subtotal: d.subtotal, iva: d.iva, total: t, folio_comprobante: f.folio || null, ticket_url: f.archivo_path, origen_captura: 'carga_grupo', estado: 'guardado' })
      if (r.error) { toast.error(`${f.nombre}: ${mensajeError(r.error)}`); continue }
      await actualizar('comprobantes_carga', f.id, { estado: 'guardado', gasto_id: r.data[0].id, proveedor_leido: f.proveedor, total_leido: t, fecha_leida: f.fecha, folio_leido: f.folio || null, grupo_id: grupoId })
      ok++
    }
    setProcesando(false)
    if (ok) { toast.success(`${ok} gasto(s) guardados.`); setFilas(fs => fs.filter(f => !listas.some(l => l.id === f.id && !problema(l)))); onListo(); pendientes.refetch() }
  }
  async function quitar(f) { const r = await borrar('comprobantes_carga', f.id); if (r.error) toast.error(mensajeError(r.error)); else { setFilas(fs => fs.filter(x => x.id !== f.id)); pendientes.refetch() } }
  return (
    <Modal open onClose={onClose} size="wide" cerrarAlClicFuera={false} title="Carga en grupo — comprobantes"
      footer={<><button type="button" className="btn o" onClick={onClose}>Cerrar</button><button type="button" className="btn" disabled={procesando || !listas.length} onClick={guardarListos}>Guardar {listas.length} listos</button></>}>
      <div style={{ marginBottom: 10 }}><AvisoSimulado texto="Lectura automática: modo simulado" /> <span style={{ fontSize: 12, color: 'var(--muted)' }}>{MODO_OCR_TEXTO} Revisa y completa cada renglón antes de guardar: la IA propone, una persona confirma.</span></div>
      <div className="grid2">
        <FormField label="Sede" required as="select" value={sedeId} onChange={e => setSedeId(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Grupo para todos" required as="select" value={grupoId} onChange={e => setGrupoId(e.target.value)} options={grupos.map(g => ({ value: g.id, label: g.nombre }))} />
        <FormField label="Método de pago para todos" as="select" value={metodo} onChange={e => setMetodo(e.target.value)} options={METODOS_PAGO.filter(m => m.value !== 'pagado_por_empleado' && m.value !== 'efectivo_fondo')} />
      </div>
      <input ref={input} type="file" multiple accept="image/*,application/pdf" onChange={elegir} style={{ display: 'none' }} />
      <div onClick={() => input.current?.click()} style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 18, textAlign: 'center', color: 'var(--muted)', cursor: 'pointer', margin: '10px 0' }}>
        <Camera size={20} /> {procesando ? 'Procesando…' : 'Haz clic para elegir tickets, facturas o PDF (varios a la vez)'}
      </div>
      {mostradas.length > 0 ? <div className="tabla-wrap"><table>
        <thead><tr><th>Archivo</th><th>Proveedor</th><th>Fecha</th><th>Folio</th><th>Total</th><th>Estado</th><th /></tr></thead>
        <tbody>{mostradas.map(f => { const p = f.estado === 'listo' ? problema(f) : null; return (
          <tr key={f.id}>
            <td>{f.nombre}</td>
            <td><input value={f.proveedor} onChange={e => setFila(f.id, 'proveedor', e.target.value)} /></td>
            <td><input type="date" value={f.fecha ?? ''} onChange={e => setFila(f.id, 'fecha', e.target.value)} /></td>
            <td><input value={f.folio} style={{ width: 100 }} onChange={e => setFila(f.id, 'folio', e.target.value)} /></td>
            <td><input type="number" step="0.01" style={{ width: 100 }} value={f.total} onChange={e => setFila(f.id, 'total', e.target.value)} /></td>
            <td><StatusBadge estado={f.estado} />{p && <div style={{ fontSize: 10, color: 'var(--red)' }}>{p}</div>}</td>
            <td><button type="button" className="btn red sm" onClick={() => quitar(f)}><Trash2 size={12} /></button></td>
          </tr>) })}</tbody>
      </table></div> : <div className="hint" style={{ fontSize: 13, color: 'var(--muted)' }}>Aún no hay comprobantes cargados.</div>}
    </Modal>
  )
}
