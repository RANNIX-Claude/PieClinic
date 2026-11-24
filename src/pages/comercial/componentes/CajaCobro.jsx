// Pestaña «Cobro» de Caja (mockup 17): conceptos (servicios, productos, paquetes, planes, gift cards), descuentos con PIN,
// anticipos aplicados, pago dividido, ticket. Escribe ventas / venta_lineas / pagos y cierra con la RPC cobrar_venta.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, X, Printer, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { actualizar, borrar, insertar, leer, leerUno, rpc } from '../../../lib/api'
import { fecha, moneda } from '../../../lib/formato'
import FormField from '../../../components/ui/FormField'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { totalesVenta, repartirDescuentoGlobal, pctEfectivo, requierePin, cambio, calcularLinea } from '../../../lib/comercial/ventas'
import { param } from '../../../lib/comercial/anticipo'
import { redondear, suma } from '../../../lib/comercial/dinero'
import { COBRO_TERMINAL_AVISO } from '../../../lib/adaptadores/clip'
import PacienteBuscador from './PacienteBuscador'
import PinModal from './PinModal'
import { imprimirTicketDe } from './ticketDatos'
import { useLeer, usePodologos, AvisoError, BannerSimulado, ejecutar, textoError, nombrePerfil } from './comun'

const METODOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta (terminal)'], ['transferencia', 'Transferencia SPEI'], ['clip', 'Clip (liga / terminal)'], ['gift_card', 'Gift card'], ['cortesia', 'Cortesía (sin cobro)']]
const MOTIVOS = ['Cortesía', 'Promoción', 'Cliente frecuente', 'Otro']
let _k = 0
const nuevaClave = () => `l${++_k}`

export default function CajaCobro({ turno, onListo, onTickets }) {
  const { sedeActivaId, sedeActiva, organizacion, rol, perfil } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const puedeCobrar = usePermiso('ventas.cobrar')
  const parametros = organizacion?.parametros ?? {}
  const maxPct = param(parametros, 'descuento_recepcion_max_pct')
  const esAdmin = rol === 'administrador'

  const [ventaId, setVentaId] = useState(null)
  const [cita, setCita] = useState(null)
  const [paciente, setPaciente] = useState(null)
  const [podologoId, setPodologoId] = useState('')
  const [lineas, setLineas] = useState([])
  const [global, setGlobal] = useState({ tipo: 'pct', valor: '', motivo: '', aut: null })
  const [anticiposSel, setAnticiposSel] = useState([])
  const [pagos, setPagos] = useState([])
  const [requiereFactura, setRequiereFactura] = useState(false)
  const [busca, setBusca] = useState('')
  const [pin, setPin] = useState(null)           // { tipo:'linea'|'global', clave?, pct }
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState(null)       // { ventaId, folio }

  const podQ = usePodologos()
  const porCobrar = useLeer('citas-sin-cobro', 'prp_citas_sin_cobro', { orden: { columna: 'inicio', asc: false }, limite: 100 })
  const servQ = useLeer('cat-servicios', 'prp_servicios', { sedeCol: false, filtros: { estado: 'activo' }, orden: { columna: 'nombre' }, limite: 500 })
  const prodQ = useLeer('cat-productos', 'prp_productos', { sedeCol: false, filtros: { estado: ['activo', 'sin_existencia'], tipo: ['venta', 'por_encargo'] }, orden: { columna: 'nombre' }, limite: 800 })
  const ofQ = useLeer('cat-ofertas', 'prp_ofertas', { sedeCol: false, filtros: { estado_efectivo: 'activa' }, orden: { columna: 'nombre' }, limite: 300 })
  const antQ = useLeer('anticipos-paciente', 'prp_anticipos', { sedeCol: false, filtros: { paciente_id: paciente?.id, estado: 'pagado' }, limite: 20 }, !!paciente?.id)
  const planQ = useLeer('planes-paciente', 'prp_planes_adquiridos', { sedeCol: false, filtros: { paciente_id: paciente?.id, estado: 'vigente' }, limite: 20 }, !!paciente?.id)

  // ── precarga desde la cita (?cita=) o ticket abierto (?venta=) ───────────────────────────────────
  useEffect(() => {
    const citaId = sp.get('cita'), vId = sp.get('venta')
    if (vId && vId !== ventaId) retomar(vId)
    else if (citaId && citaId !== cita?.id) cargarCita(citaId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get('cita'), sp.get('venta')])

  async function cargarCita(id) {
    const { data: c, error } = await leerUno('prp_agenda', { id })
    if (error || !c) return toast.error('No se encontró la cita')
    setCita(c); setPodologoId(c.podologo_id)
    const { data: p } = await leerUno('prp_pacientes', { id: c.paciente_id })
    setPaciente(p ?? { id: c.paciente_id, nombre_completo: c.paciente_nombre })
    const sv = servQ.filas.find(s => s.id === c.servicio_id)
    setLineas([{ clave: nuevaClave(), tipo: 'servicio', servicio_id: c.servicio_id, descripcion: c.servicio_nombre, cantidad: 1, precio_unitario: c.plan_adquirido_id || c.seguimiento_garantia ? 0 : Number(c.precio_servicio),
      tipo_precio: c.plan_adquirido_id ? 'saldo_plan' : c.seguimiento_garantia ? 'incluido' : 'fijo', plan_adquirido_id: c.plan_adquirido_id ?? null, iva_tipo: sv?.iva_tipo ?? 'exento', descuento_pct: 0, descuento_motivo: '', aut: null, editable: sv ? ['desde', 'a_valorar', 'por_unidad'].includes(sv.tipo_precio) : false, atendio_id: c.podologo_id }])
  }
  async function retomar(id) {
    const v = await leerUno('prp_ventas', { id })
    if (v.error || !v.data) return toast.error('No se encontró el ticket')
    if (!['por_cobrar', 'cuenta_abierta'].includes(v.data.estado)) return toast.error(`El ticket está ${v.data.estado}`)
    const l = await leer('prp_venta_lineas', { sedeCol: false, filtros: { venta_id: id }, orden: { columna: 'orden' } })
    setVentaId(id); setRequiereFactura(v.data.requiere_factura); setPodologoId(v.data.podologo_id ?? '')
    if (v.data.paciente_id) { const p = await leerUno('prp_pacientes', { id: v.data.paciente_id }); setPaciente(p.data) }
    if (v.data.cita_id) { const c = await leerUno('prp_agenda', { id: v.data.cita_id }); setCita(c.data) }
    setLineas(l.data.map(x => ({ clave: nuevaClave(), tipo: x.tipo, servicio_id: x.servicio_id, producto_id: x.producto_id, oferta_id: x.oferta_id, plan_adquirido_id: x.plan_adquirido_id, promocion_id: x.promocion_id,
      descripcion: x.descripcion, cantidad: Number(x.cantidad), precio_unitario: Number(x.precio_unitario), tipo_precio: x.tipo_precio, iva_tipo: x.iva_tipo, descuento_pct: Number(x.descuento_pct), descuento_motivo: x.descuento_motivo ?? '', aut: x.autorizacion_descuento_id, atendio_id: x.atendio_id, editable: false })))
  }

  // ── catálogo ─────────────────────────────────────────────────────────────────────────────────────
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 2) return []
    const m = (...xs) => xs.some(x => String(x ?? '').toLowerCase().includes(q))
    return [
      ...servQ.filas.filter(s => m(s.nombre, s.codigo, ...(s.alias ?? []))).slice(0, 6).map(s => ({ t: 'servicio', id: s.id, nombre: s.nombre, extra: s.codigo, item: s })),
      ...prodQ.filas.filter(p => m(p.nombre, p.sku, p.codigo_barras)).slice(0, 6).map(p => ({ t: 'producto', id: p.id, nombre: p.nombre, extra: p.sku, item: p })),
      ...ofQ.filas.filter(o => o.tipo !== 'promocion' && m(o.nombre, o.codigo)).slice(0, 5).map(o => ({ t: 'oferta', id: o.id, nombre: o.nombre, extra: `${o.tipo.replace('_', ' ')} · ${o.codigo}`, item: o })),
    ]
  }, [busca, servQ.filas, prodQ.filas, ofQ.filas])

  async function agregar(r) {
    setBusca('')
    const tipoItem = r.t === 'oferta' ? 'oferta' : r.t
    const { data: precio } = await rpc('precio_vigente', { p_tipo: tipoItem, p_item: r.id, p_sede: sedeActivaId, p_fecha: null })
    const it = r.item
    const tipoLinea = r.t === 'oferta' ? ({ plan_multisesion: 'plan', paquete: 'paquete', gift_card: 'gift_card', membresia: 'membresia' }[it.tipo] ?? 'paquete') : r.t
    const base = { clave: nuevaClave(), tipo: tipoLinea, descripcion: r.nombre, cantidad: 1, precio_unitario: Number(precio ?? 0), tipo_precio: 'fijo', descuento_pct: 0, descuento_motivo: '', aut: null,
      iva_tipo: r.t === 'oferta' ? (tipoLinea === 'gift_card' ? 'exento' : 'exento') : it.iva_tipo, editable: r.t === 'servicio' && ['desde', 'a_valorar', 'por_unidad'].includes(it.tipo_precio), atendio_id: podologoId || perfil?.id }
    if (r.t === 'servicio') base.servicio_id = r.id
    else if (r.t === 'producto') base.producto_id = r.id
    else base.oferta_id = r.id
    if (r.t === 'servicio' && it.tipo_precio === 'a_valorar') toast('Servicio «a valorar»: captura el precio cotizado', { icon: 'ℹ️' })
    setLineas(ls => [...ls, base])
  }
  const setL = (clave, cambios) => setLineas(ls => ls.map(l => (l.clave === clave ? { ...l, ...cambios } : l)))
  const quitarL = clave => setLineas(ls => ls.filter(l => l.clave !== clave))
  const usarPlan = (l, plan) => setL(l.clave, { plan_adquirido_id: plan.id, precio_unitario: 0, tipo_precio: 'saldo_plan', descripcion: `${l.descripcion} (saldo del plan ${plan.folio ?? ''})`, editable: false })
  const promos = ofQ.filas.filter(o => o.tipo === 'promocion')
  const aplicarPromo = (l, id) => {
    const p = promos.find(x => x.id === id)
    setL(l.clave, p ? { promocion_id: p.id, descuento_pct: Number(p.descuento_pct), descuento_motivo: `Promoción: ${p.nombre}`, aut: null } : { promocion_id: null, descuento_pct: 0, descuento_motivo: '', aut: null })
  }

  // ── cálculo ──────────────────────────────────────────────────────────────────────────────────────
  const lineasConGlobal = useMemo(() => (Number(global.valor) > 0 ? repartirDescuentoGlobal(lineas, global.tipo, Number(global.valor)) : lineas), [lineas, global.tipo, global.valor])
  const anticiposElegidos = antQ.filas.filter(a => anticiposSel.includes(a.id))
  const sumaAnticipos = suma(anticiposElegidos.map(a => a.monto))
  const pagosNoAnticipo = pagos.map(p => ({ ...p, monto: Number(p.monto) || 0 }))
  const tot = totalesVenta(lineasConGlobal, { anticipo: sumaAnticipos, pagos: pagosNoAnticipo })
  const anticipoExcede = sumaAnticipos > tot.total
  const pctGlobalEfectivo = tot.subtotal > 0 ? (tot.descuento_total / tot.subtotal) * 100 : 0

  const pinNecesarioLinea = l => {
    const c = calcularLinea(l)
    return requierePin({ pct: pctEfectivo(c), maxPct, esAdmin }) && !l.aut
  }
  const pinNecesarioGlobal = Number(global.valor) > 0 && requierePin({ pct: pctGlobalEfectivo, maxPct, esAdmin }) && !global.aut

  // ── pagos ────────────────────────────────────────────────────────────────────────────────────────
  const agregarPago = metodo => setPagos(ps => [...ps, { clave: nuevaClave(), metodo, monto: Math.max(0, tot.saldo), referencia: '', recibido: '', ultimos4: '', codigoGift: '', gift: null }])
  const setP = (clave, c) => setPagos(ps => ps.map(p => (p.clave === clave ? { ...p, ...c } : p)))
  const buscarGift = async p => {
    const { data } = await leer('prp_gift_cards', { sedeCol: false, filtros: { codigo: p.codigoGift.trim().toUpperCase(), estado: 'activa' }, limite: 1 })
    if (!data[0]) return toast.error('Gift card no encontrada o inactiva')
    setP(p.clave, { gift: data[0], monto: Math.min(Number(p.monto) || tot.saldo, Number(data[0].saldo)) })
  }

  // ── guardar / cobrar ─────────────────────────────────────────────────────────────────────────────
  const validar = (cobrar) => {
    if (!lineas.length) return 'Agrega al menos un concepto'
    if (lineas.some(l => !(Number(l.cantidad) > 0))) return 'Revisa las cantidades'
    if (lineas.some(l => l.tipo === 'servicio' && l.editable && !(Number(l.precio_unitario) >= 0))) return 'Captura el precio del servicio'
    for (const l of lineas) { const c = calcularLinea(l); if (c.descuento > 0 && !String(l.descuento_motivo).trim()) return 'Todo descuento exige motivo' }
    if (Number(global.valor) > 0 && !global.motivo.trim()) return 'El descuento global exige motivo'
    if (lineas.some(pinNecesarioLinea) || pinNecesarioGlobal) return `Descuentos de más de ${maxPct} % requieren PIN de Administrador`
    if (['plan', 'membresia'].some(t => lineas.some(l => l.tipo === t)) && !paciente) return 'Los planes y membresías se venden a un paciente'
    if (requiereFactura && !paciente) return 'Para facturar elige al paciente'
    if (anticipoExcede) return 'El anticipo seleccionado excede el total del ticket'
    if (cobrar) {
      if (!turno) return 'Abre tu turno de caja para cobrar'
      if (tot.saldo !== 0) return `Los pagos no cubren el total (saldo ${moneda(tot.saldo)})`
      for (const p of pagos) {
        if (!(p.monto > 0)) return 'Hay un pago sin monto'
        if (p.metodo === 'efectivo' && p.recibido !== '' && Number(p.recibido) < p.monto) return 'El efectivo recibido es menor al monto'
        if (p.metodo === 'cortesia' && !String(p.referencia).trim()) return 'La cortesía exige motivo'
        if (p.metodo === 'gift_card' && (!p.gift || p.monto > Number(p.gift.saldo))) return 'Revisa la gift card (código y saldo)'
        if (p.metodo === 'clip' && !String(p.referencia).trim()) return 'Captura el ID de pago de Clip'
      }
    }
    return null
  }

  async function guardarTicket(estadoFinal) {
    // 1) venta (cabecera)
    let id = ventaId
    const origen = cita ? 'cobro_cita' : lineas.some(l => ['plan', 'paquete', 'gift_card', 'membresia'].includes(l.tipo)) ? 'paquete_plan_giftcard' : 'mostrador'
    if (!id) {
      const { data, error } = await insertar('ventas', { sede_id: sedeActivaId, origen, cita_id: cita?.id ?? null, paciente_id: paciente?.id ?? null, podologo_id: podologoId || null, requiere_factura: requiereFactura, estado: 'por_cobrar' })
      if (error || !data?.[0]) throw new Error(textoError(error) || 'No se pudo crear el ticket')
      id = data[0].id; setVentaId(id)
    } else {
      await actualizar('ventas', id, { requiere_factura: requiereFactura, paciente_id: paciente?.id ?? null, podologo_id: podologoId || null })
      const prev = await leer('prp_venta_lineas', { sedeCol: false, filtros: { venta_id: id } })
      for (const l of prev.data) await borrar('venta_lineas', l.id)
    }
    // 2) líneas
    const filas = lineas.map((l, i) => ({ venta_id: id, orden: i, tipo: l.tipo, servicio_id: l.servicio_id ?? null, producto_id: l.producto_id ?? null, oferta_id: l.oferta_id ?? null, plan_adquirido_id: l.plan_adquirido_id ?? null,
      promocion_id: l.promocion_id ?? null, descripcion: l.descripcion, atendio_id: l.atendio_id ?? null, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario) || 0, tipo_precio: l.tipo_precio,
      descuento_pct: Number(global.valor) > 0 ? 0 : Number(l.descuento_pct) || 0, descuento_motivo: Number(global.valor) > 0 ? null : l.descuento_motivo || null, autorizacion_descuento_id: Number(global.valor) > 0 ? null : l.aut ?? null }))
    const r = await insertar('venta_lineas', filas)
    if (r.error) throw new Error(textoError(r.error))
    // 3) descuento global
    if (Number(global.valor) > 0) {
      const g = await rpc('aplicar_descuento_global', { p_venta: id, p_tipo: global.tipo, p_valor: Number(global.valor), p_motivo: global.motivo, p_autorizacion: global.aut })
      if (g.error) throw new Error(textoError(g.error))
    }
    if (estadoFinal === 'cuenta_abierta') await actualizar('ventas', id, { estado: 'cuenta_abierta' })
    return id
  }

  async function cuentaAbierta() {
    const e = validar(false); if (e) return toast.error(e)
    setOcupado(true)
    try { await guardarTicket('cuenta_abierta'); toast.success('Cuenta abierta guardada'); limpiar(); onListo?.(); onTickets?.() }
    catch (err) { toast.error(textoError(err)) }
    setOcupado(false)
  }
  async function cobrar(imprimir) {
    const e = validar(true); if (e) return toast.error(e)
    setOcupado(true)
    try {
      const id = await guardarTicket('por_cobrar')
      const filasPago = [
        ...anticiposElegidos.map(a => ({ venta_id: id, metodo: 'anticipo', monto: Number(a.monto), anticipo_id: a.id })),
        ...pagos.map(p => ({ venta_id: id, metodo: p.metodo, monto: p.monto, referencia: p.referencia || null, ultimos4: /^\d{4}$/.test(p.ultimos4) ? p.ultimos4 : null,
          efectivo_recibido: p.metodo === 'efectivo' && p.recibido !== '' ? Number(p.recibido) : null, cambio: p.metodo === 'efectivo' && p.recibido !== '' ? cambio(p.recibido, p.monto) : null, gift_card_id: p.gift?.id ?? null })),
      ]
      // pagos ya registrados de un intento anterior no se pueden borrar: solo se insertan los que faltan
      const previos = await leer('pagos', { sedeCol: false, filtros: { venta_id: id } })
      if (!previos.data.length && filasPago.length) { const rp = await insertar('pagos', filasPago); if (rp.error) throw new Error(textoError(rp.error)) }
      const rc = await rpc('cobrar_venta', { p_venta: id })
      if (rc.error) throw new Error(textoError(rc.error))
      const v = await leerUno('prp_ventas', { id })
      setHecho({ ventaId: id, folio: v.data?.folio, total: v.data?.total })
      toast.success(`Ticket ${v.data?.folio ?? ''} cobrado`)
      onListo?.()
      if (imprimir) imprimirTicketDe(id, { org: organizacion, sede: sedeActiva })
    } catch (err) { toast.error(textoError(err)) }
    setOcupado(false)
  }
  function limpiar() {
    setVentaId(null); setCita(null); setPaciente(null); setLineas([]); setPagos([]); setAnticiposSel([]); setGlobal({ tipo: 'pct', valor: '', motivo: '', aut: null }); setRequiereFactura(false); setHecho(null); setPodologoId('')
    const n = new URLSearchParams(sp); n.delete('cita'); n.delete('venta'); setSp(n, { replace: true })
  }

  if (!puedeCobrar) return <div className="card">Tu rol no cobra en caja (siempre cobra Caja, P-078). Puedes consultar los tickets.</div>
  if (hecho) {
    return (
      <div className="card" style={{ maxWidth: 520, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--green)' }}>Cobro registrado</h2>
        <p style={{ margin: '8px 0 14px' }}>Ticket <b>{hecho.folio}</b> · {moneda(hecho.total)}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => imprimirTicketDe(hecho.ventaId, { org: organizacion, sede: sedeActiva })}><Printer size={14} /> Imprimir ticket</button>
          {requiereFactura && <button className="btn o" onClick={() => nav(`/facturacion?venta=${hecho.ventaId}`)}>Facturar este ticket</button>}
          <button className="btn o" onClick={limpiar}>Nueva venta</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid2" style={{ gap: 12, marginBottom: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Cita a cobrar</h3>
          <FormField label="Citas atendidas sin cobro" as="select" value={cita?.id ?? ''} placeholder={porCobrar.cargando ? 'Cargando…' : porCobrar.filas.length ? 'Selecciona una cita…' : 'No hay citas por cobrar'}
            onChange={e => e.target.value && cargarCita(e.target.value)} options={porCobrar.filas.map(c => ({ value: c.cita_id, label: `${c.folio} · ${c.paciente_nombre} · ${c.servicio_nombre} · ${moneda(c.precio_servicio)}` }))} />
          {cita && <div style={{ fontSize: 12.5 }}>Cita <b>{cita.folio}</b> · {cita.sede_nombre}{cita.cabina_nombre ? ` · ${cita.cabina_nombre}` : ''} · estado {cita.estado}</div>}
          <AvisoError error={porCobrar.error} />
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Paciente</h3>
          <PacienteBuscador valor={paciente} onElegir={setPaciente} />
          <div className="grid2" style={{ marginTop: 8 }}>
            <FormField label="Podólogo que atendió" as="select" value={podologoId} onChange={e => setPodologoId(e.target.value)} placeholder="—" options={podQ.filas.map(p => ({ value: p.id, label: nombrePerfil(p) }))} />
            <div className="field"><label>¿Requiere factura?</label>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={requiereFactura} onChange={e => setRequiereFactura(e.target.checked)} /> Sí{paciente?.tiene_datos_fiscales ? ' (datos fiscales registrados ✓)' : requiereFactura ? ' (capturar datos al facturar)' : ''}</label></div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Conceptos de la venta</h3>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--muted)' }} />
          <input style={{ width: '100%', paddingLeft: 28 }} placeholder="Buscar servicio, producto, paquete, plan o gift card (nombre, código, SKU o código de barras)…" value={busca} onChange={e => setBusca(e.target.value)} />
          {resultados.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', padding: 4, maxHeight: 300, overflow: 'auto' }}>
              {resultados.map(r => <button type="button" key={r.t + r.id} onClick={() => agregar(r)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: '7px 10px', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                <span><span className="bd m" style={{ marginRight: 6 }}>{r.t}</span>{r.nombre}</span><span className="text-muted">{r.extra}</span></button>)}
            </div>
          )}
          {busca.trim().length >= 2 && resultados.length === 0 && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>Sin resultados.</div>}
        </div>
        <AvisoError error={servQ.error ?? prodQ.error} titulo="No se pudo cargar el catálogo" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 820 }}>
            <thead><tr><th>Tipo</th><th>Concepto</th><th style={{ width: 70 }}>Cant.</th><th style={{ width: 110 }}>Precio unit.</th><th>Tipo precio</th><th style={{ width: 70 }}>Desc. %</th><th>Motivo / promoción</th><th className="num">Importe</th><th /></tr></thead>
            <tbody>
              {lineas.length === 0 && <tr><td colSpan={9} className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Sin conceptos. Elige una cita por cobrar o busca un servicio o producto.</td></tr>}
              {lineasConGlobal.map(l0 => {
                const l = lineas.find(x => x.clave === l0.clave) ?? l0
                const c = calcularLinea(l0)
                const necesitaPin = pinNecesarioLinea(l) && !(Number(global.valor) > 0)
                const plan = l.tipo === 'servicio' && !l.plan_adquirido_id ? planQ.filas.find(p => p.servicio_base_id === l.servicio_id && p.sesiones_saldo > 0) : null
                return (
                  <tr key={l.clave}>
                    <td><span className="bd m">{l.tipo}</span></td>
                    <td>{l.descripcion}{plan && <div><button type="button" className="btn o" style={{ padding: '1px 8px', fontSize: 11.5 }} onClick={() => usarPlan(l, plan)}>Usar saldo del plan {plan.folio} ({plan.sesiones_saldo} ses.)</button></div>}</td>
                    <td><input type="number" min="1" step="1" value={l.cantidad} style={{ width: 60 }} onChange={e => setL(l.clave, { cantidad: e.target.value })} /></td>
                    <td><input type="number" min="0" step="0.01" value={l.precio_unitario} disabled={!l.editable} title={l.editable ? 'Precio cotizado' : 'Precio congelado del catálogo'} style={{ width: 100 }} onChange={e => setL(l.clave, { precio_unitario: e.target.value })} /></td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{l.tipo_precio.replace('_', ' ')}</td>
                    <td><input type="number" min="0" max="100" value={Number(global.valor) > 0 ? '' : l.descuento_pct} disabled={Number(global.valor) > 0} style={{ width: 60 }} onChange={e => setL(l.clave, { descuento_pct: e.target.value, aut: null })} /></td>
                    <td>
                      {Number(l.descuento_pct) > 0 && !(Number(global.valor) > 0) && <input placeholder="Motivo" value={l.descuento_motivo} style={{ width: 130 }} onChange={e => setL(l.clave, { descuento_motivo: e.target.value })} />}
                      {necesitaPin && <button type="button" className="btn red" style={{ padding: '1px 8px', marginLeft: 4 }} onClick={() => setPin({ tipo: 'linea', clave: l.clave, pct: Number(l.descuento_pct), motivo: l.descuento_motivo })}>PIN</button>}
                      {l.aut && Number(l.descuento_pct) > 0 && <span className="bd v" style={{ marginLeft: 4 }}>Autorizado</span>}
                      {!(Number(global.valor) > 0) && promos.length > 0 && (l.tipo === 'servicio' || l.tipo === 'producto') && (
                        <select value={l.promocion_id ?? ''} onChange={e => aplicarPromo(l, e.target.value)} style={{ marginLeft: 4, maxWidth: 140 }}><option value="">Sin promoción</option>{promos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>)}
                    </td>
                    <td className="num"><b>{moneda(c.importe)}</b>{c.descuento > 0 && <div className="text-red" style={{ fontSize: 11 }}>−{moneda(c.descuento)}</div>}</td>
                    <td><button type="button" className="btn o" onClick={() => quitarL(l.clave)} aria-label="Quitar"><X size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2" style={{ gap: 12, marginBottom: 12, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Descuento global</h3>
            <div className="grid3">
              <FormField label="Tipo" as="select" value={global.tipo} onChange={e => setGlobal(g => ({ ...g, tipo: e.target.value, aut: null }))} options={[{ value: 'pct', label: '%' }, { value: 'monto', label: '$ monto' }]} />
              <FormField label="Valor" type="number" min="0" value={global.valor} onChange={e => setGlobal(g => ({ ...g, valor: e.target.value, aut: null }))} />
              <FormField label="Motivo" as="select" value={global.motivo} onChange={e => setGlobal(g => ({ ...g, motivo: e.target.value }))} options={MOTIVOS.map(m => ({ value: m, label: m }))} />
            </div>
            {Number(global.valor) > 0 && <div style={{ fontSize: 12.5 }}>Descuento efectivo {pctGlobalEfectivo.toFixed(1)} % · reemplaza los descuentos por línea.
              {pinNecesarioGlobal ? <button type="button" className="btn red" style={{ marginLeft: 8 }} onClick={() => setPin({ tipo: 'global', pct: pctGlobalEfectivo, motivo: global.motivo })}>Pedir PIN</button> : global.aut ? <span className="bd v" style={{ marginLeft: 8 }}>Autorizado</span> : null}</div>}
            <div className="text-muted" style={{ fontSize: 12 }}>Recepción da hasta {maxPct} % sin autorización; arriba pide PIN del Administrador. Todo descuento exige motivo.</div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Anticipo / pago previo aplicado</h3>
            {!paciente ? <div className="text-muted" style={{ fontSize: 13 }}>Elige al paciente para ver sus anticipos.</div> : antQ.filas.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Sin anticipos pagados.</div> : (
              <table><thead><tr><th>Folio</th><th>Fecha</th><th>Origen</th><th className="num">Monto</th><th>Aplicar</th></tr></thead>
                <tbody>{antQ.filas.map(a => <tr key={a.id}><td>{a.folio}</td><td>{fecha(a.pagado_en)}</td><td>{a.origen}{a.cita_folio ? ` · ${a.cita_folio}` : ''}</td><td className="num">{moneda(a.monto)}</td>
                  <td><input type="checkbox" checked={anticiposSel.includes(a.id)} onChange={e => setAnticiposSel(s => (e.target.checked ? [...s, a.id] : s.filter(x => x !== a.id)))} /></td></tr>)}</tbody></table>)}
            {anticipoExcede && <div className="text-red" style={{ fontSize: 12.5 }}>El anticipo excede el total del ticket.</div>}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Método de pago <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>(se puede dividir)</span></h3>
          {pagos.map(p => (
            <div key={p.clave} style={{ borderBottom: '1px solid var(--row-line)', padding: '6px 0' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ width: 120, fontSize: 13 }}>{METODOS.find(m => m[0] === p.metodo)?.[1]}</b>
                <input type="number" min="0" step="0.01" value={p.monto} style={{ width: 100 }} onChange={e => setP(p.clave, { monto: Number(e.target.value) })} aria-label="Monto" />
                <button type="button" className="btn o" style={{ padding: '2px 8px', fontSize: 11.5 }} onClick={() => setP(p.clave, { monto: Math.max(0, redondear(p.monto + tot.saldo)) })}>Completar</button>
                <button type="button" className="btn o" onClick={() => setPagos(ps => ps.filter(x => x.clave !== p.clave))} aria-label="Quitar pago"><X size={13} /></button>
              </div>
              {p.metodo === 'efectivo' && <div style={{ fontSize: 12.5, marginTop: 4 }}>Recibido <input type="number" min="0" step="0.01" style={{ width: 90 }} value={p.recibido} onChange={e => setP(p.clave, { recibido: e.target.value })} /> {p.recibido !== '' && <>· cambio <b>{moneda(cambio(p.recibido, p.monto))}</b></>}</div>}
              {p.metodo === 'tarjeta' && <div style={{ display: 'flex', gap: 6, marginTop: 4 }}><input placeholder="Autorización" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} /><input placeholder="Últimos 4" maxLength={4} style={{ width: 80 }} value={p.ultimos4} onChange={e => setP(p.clave, { ultimos4: e.target.value.replace(/\D/g, '') })} /></div>}
              {p.metodo === 'transferencia' && <input style={{ marginTop: 4, width: '100%' }} placeholder="Clave de rastreo" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} />}
              {p.metodo === 'clip' && <div style={{ marginTop: 4 }}><input style={{ width: '100%' }} placeholder="ID de pago Clip (de la terminal o la liga)" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} /><div className="text-muted" style={{ fontSize: 11.5 }}>{COBRO_TERMINAL_AVISO}</div></div>}
              {p.metodo === 'gift_card' && <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}><input placeholder="Código (GC-…)" value={p.codigoGift} onChange={e => setP(p.clave, { codigoGift: e.target.value, gift: null })} /><button type="button" className="btn o" onClick={() => buscarGift(p)}>Buscar</button>{p.gift && <span className="bd v">Saldo {moneda(p.gift.saldo)}</span>}</div>}
              {p.metodo === 'cortesia' && <input style={{ marginTop: 4, width: '100%' }} placeholder="Motivo de la cortesía (y quién autoriza)" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} />}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{METODOS.map(([m, l]) => <button key={m} type="button" className="btn o" style={{ fontSize: 12 }} onClick={() => agregarPago(m)}><Plus size={12} /> {l}</button>)}</div>
          <BannerSimulado compacto texto="Clip: sin integración con la terminal (modo simulado); el cajero captura el ID de pago." />
          <div style={{ marginTop: 10, borderTop: '2px solid var(--border)', paddingTop: 8, fontSize: 13.5 }}>
            {[['Subtotal', moneda(tot.subtotal)], ['Descuentos', `−${moneda(tot.descuento_total)}`], ['IVA incluido', moneda(tot.iva_total)], ['Anticipo aplicado', `−${moneda(tot.anticipo_aplicado)}`]].map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span>{v}</span></div>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, margin: '4px 0' }}><span>TOTAL A COBRAR</span><span>{moneda(tot.a_cobrar)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: tot.saldo === 0 ? 'var(--green)' : 'var(--red)' }}><span>Pagado / saldo</span><span>{moneda(tot.pagado)} / {moneda(tot.saldo)}</span></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={ocupado || !turno} onClick={() => cobrar(true)} title={!turno ? 'Abre tu turno de caja' : ''}><Printer size={14} /> Cobrar e imprimir ticket</button>
        <button className="btn" disabled={ocupado || !turno} onClick={() => cobrar(false)}>Cobrar sin ticket</button>
        <button className="btn o" disabled={ocupado} onClick={cuentaAbierta}>Guardar como cuenta abierta</button>
        <button className="btn red" disabled={ocupado} onClick={() => setConfirmarLimpiar(true)}>Cancelar venta</button>
        {!turno && <span className="text-red" style={{ fontSize: 12.5, alignSelf: 'center' }}>Abre tu turno de caja para cobrar.</span>}
      </div>

      <PinModal open={!!pin} tipo="descuento" pctMax={pin?.pct ?? null} motivoInicial={pin?.motivo ?? ''} detalle={{ ticket: ventaId }} onClose={() => setPin(null)}
        onAutorizado={id => { if (pin.tipo === 'linea') setL(pin.clave, { aut: id }); else setGlobal(g => ({ ...g, aut: id })); setPin(null); toast.success('Descuento autorizado (10 min)') }} />
      <ConfirmDialog open={confirmarLimpiar} titulo="Cancelar venta" peligro textoConfirmar="Descartar"
        mensaje={ventaId ? 'El ticket abierto se conserva en «Tickets del día»; esta pantalla se limpia.' : 'Se descartan los conceptos capturados (aún no se guardó nada).'} onConfirm={() => { setConfirmarLimpiar(false); limpiar() }} onCancel={() => setConfirmarLimpiar(false)} />
    </div>
  )
}
