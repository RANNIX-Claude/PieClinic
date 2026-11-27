// Pestaña «Cobro» de Caja (mockup 17): conceptos (servicios, productos, paquetes, planes, gift cards), descuentos con PIN,
// anticipos aplicados, pago dividido, ticket. Escribe ventas / venta_lineas / pagos y cierra con la RPC cobrar_venta.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Minus, X, Printer, Search, Banknote, CreditCard, Landmark, Gift, Package, Stethoscope, CalendarCheck, Layers, Save, Percent } from 'lucide-react'
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
import { alternarMetodo, quitarPago, fijarMonto, completarPago, fijarRecibido as fijarRecibidoPuro, recibirExacto, ajustarAuto, validarPagos } from '../../../lib/comercial/pagosCaja'
import { COBRO_TERMINAL_AVISO } from '../../../lib/adaptadores/clip'
import PacienteBuscador from './PacienteBuscador'
import PinModal from './PinModal'
import ClaveSupervisorModal from './ClaveSupervisorModal'
import { parametrosCaja, PARAMETROS_CAJA_OMISION, topeSinClave, precioNecesitaClave } from '../../../lib/comercial/cajaControl'
import CajaCaracteristicas, { recomponer } from './CajaCaracteristicas'
import { imprimirTicketDe } from './ticketDatos'
import { useLeer, useLeerOffline, usePodologos, AvisoError, BannerSimulado, ejecutar, textoError, nombrePerfil } from './comun'
import { ticketHtml, imprimirHtml } from './ticket'
import { encolarTicket, nuevoUuid, folioProvisional } from '../../../lib/offline/cola'
import { guardarSnapshot, leerSnapshot } from '../../../lib/offline/almacen'

const METODOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta (terminal)'], ['transferencia', 'Transferencia SPEI'], ['clip', 'Clip (liga / terminal)'], ['gift_card', 'Gift card'], ['cortesia', 'Cortesía (sin cobro)']]
const MOTIVOS = ['Cortesía', 'Promoción', 'Cliente frecuente', 'Otro']
let _k = 0
const nuevaClave = () => `l${++_k}`

export default function CajaCobro({ turno, onListo, onTickets, bloqueo = null }) {
  const { sedeActivaId, sedeActiva, organizacion, rol, perfil, user } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const puedeCobrar = usePermiso('ventas.cobrar')
  const parametros = organizacion?.parametros ?? {}
  const maxPct = param(parametros, 'descuento_recepcion_max_pct')
  const esAdmin = rol === 'administrador'
  // Controles de Caja del módulo de auditoría (Etapa 1): lo que cambia la operación nace apagado; con internet se leen de la base y se guardan para el modo sin conexión
  const [params, setParams] = useState(PARAMETROS_CAJA_OMISION)
  const maxPctEf = topeSinClave(params, maxPct)

  const [ventaId, setVentaId] = useState(null)
  const [cita, setCita] = useState(null)
  const [paciente, setPaciente] = useState(null)
  const [clienteGeneral, setClienteGeneral] = useState(false) // el cliente no quiere dar su nombre (regla del dueño 2026-11-25)
  const [podologoId, setPodologoId] = useState('')
  const [lineas, setLineas] = useState([])
  const [global, setGlobal] = useState({ tipo: 'pct', valor: '', motivo: '', motivo_id: '', aut: null })
  const [anticiposSel, setAnticiposSel] = useState([])
  const [pagos, setPagos] = useState([])
  const cobrandoRef = useRef(false)
  const [requiereFactura, setRequiereFactura] = useState(false)
  const [busca, setBusca] = useState('')
  const [pin, setPin] = useState(null)           // { tipo:'linea'|'global', clave?, pct }
  const [confirmarLimpiar, setConfirmarLimpiar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState(null)       // { ventaId, folio }
  const [filtro, setFiltro] = useState('')       // filtro de la búsqueda: '' | servicio | producto | oferta
  const [panel, setPanel] = useState(null)       // 'citas' | 'mas' | null
  const [abiertas, setAbiertas] = useState(() => new Set())  // líneas con el detalle de precio/descuento abierto
  const buscaRef = useRef(null)
  useEffect(() => {
    if (!sedeActivaId) return
    const clave = `caja-parametros-${sedeActivaId}`
    if (!navigator.onLine) { leerSnapshot(clave).then(p => p && setParams(p)); return }
    parametrosCaja(sedeActivaId).then(r => { if (r.data) { setParams(r.data); guardarSnapshot(clave, r.data) } else leerSnapshot(clave).then(p => p && setParams(p)) })
  }, [sedeActivaId])

  const podQ = usePodologos()
  const porCobrar = useLeer('citas-sin-cobro', 'prp_citas_sin_cobro', { orden: { columna: 'inicio', asc: false }, limite: 100 })
  const servQ = useLeerOffline('cat-servicios', 'prp_servicios', { sedeCol: false, filtros: { estado: 'activo' }, orden: { columna: 'nombre' }, limite: 500 })
  const prodQ = useLeerOffline('cat-productos', 'prp_productos', { sedeCol: false, filtros: { estado: ['activo', 'sin_existencia'], tipo: ['venta', 'por_encargo'] }, orden: { columna: 'nombre' }, limite: 5000 })
  const ofQ = useLeerOffline('cat-ofertas', 'prp_ofertas', { sedeCol: false, filtros: { estado_efectivo: 'activa' }, orden: { columna: 'nombre' }, limite: 300 })
  const antQ = useLeer('anticipos-paciente', 'prp_anticipos', { sedeCol: false, filtros: { paciente_id: paciente?.id, estado: 'pagado', aplicable_en_caja: true }, limite: 20 }, !!paciente?.id)
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
    const extra = await leer('venta_lineas', { sedeCol: false, filtros: { venta_id: id }, columnas: 'id,descuento_motivo_id', limite: 200 })
    const motivoDe = Object.fromEntries((extra.data ?? []).map(e => [e.id, e.descuento_motivo_id]))
    setVentaId(id); setRequiereFactura(v.data.requiere_factura); setPodologoId(v.data.podologo_id ?? '')
    if (v.data.paciente_id) { const p = await leerUno('prp_pacientes', { id: v.data.paciente_id }); setPaciente(p.data) }
    if (v.data.cita_id) { const c = await leerUno('prp_agenda', { id: v.data.cita_id }); setCita(c.data) }
    setLineas(l.data.map(x => ({ clave: nuevaClave(), tipo: x.tipo, servicio_id: x.servicio_id, producto_id: x.producto_id, oferta_id: x.oferta_id, plan_adquirido_id: x.plan_adquirido_id, promocion_id: x.promocion_id,
      descripcion: x.descripcion, cantidad: Number(x.cantidad), precio_unitario: Number(x.precio_unitario), tipo_precio: x.tipo_precio, iva_tipo: x.iva_tipo, descuento_pct: Number(x.descuento_pct), descuento_motivo: x.descuento_motivo ?? '', descuento_motivo_id: motivoDe[x.id] ?? null, aut: x.autorizacion_descuento_id, atendio_id: x.atendio_id, editable: false })))
  }

  // ── catálogo ─────────────────────────────────────────────────────────────────────────────────────
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q.length < 2) return []
    const m = (...xs) => xs.some(x => String(x ?? '').toLowerCase().includes(q))
    return [
      ...servQ.filas.filter(s => m(s.nombre, s.codigo, s.folio, s.codigo_barras, ...(s.alias ?? []))).slice(0, 6).map(s => ({ t: 'servicio', id: s.id, nombre: s.nombre, extra: s.folio ?? s.codigo, item: s })),
      ...prodQ.filas.filter(p => m(p.nombre, p.sku, p.codigo_barras, p.folio, p.clave_alterna)).slice(0, 6).map(p => ({ t: 'producto', id: p.id, nombre: p.nombre, extra: p.sku, item: p })),
      ...ofQ.filas.filter(o => o.tipo !== 'promocion' && m(o.nombre, o.codigo)).slice(0, 5).map(o => ({ t: 'oferta', id: o.id, nombre: o.nombre, extra: `${o.tipo.replace('_', ' ')} · ${o.codigo}`, item: o })),
    ]
  }, [busca, servQ.filas, prodQ.filas, ofQ.filas])

  // Lector de código de barras o QR (teclado): al llegar el Enter, un folio/código EXACTO de servicio o producto se agrega solo, con su precio vigente.
  function leerCodigo(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = busca.trim().toLowerCase()
    if (!q) return
    const eq = (...xs) => xs.some(x => x != null && String(x).trim().toLowerCase() === q)
    const s = servQ.filas.find(x => eq(x.folio, x.codigo_barras, x.codigo))
    if (s) return agregar({ t: 'servicio', id: s.id, nombre: s.nombre, extra: s.folio ?? s.codigo, item: s })
    const p = prodQ.filas.find(x => eq(x.codigo_barras, x.sku, x.folio, x.clave_alterna))
    if (p) return agregar({ t: 'producto', id: p.id, nombre: p.nombre, extra: p.sku, item: p })
    if (resultados.length === 1) return agregar(resultados[0])
    toast.error(resultados.length ? 'Hay varios resultados: elige uno de la lista.' : 'Ese código no existe en el catálogo.')
  }

  async function agregar(r) {
    setBusca('')
    const tipoItem = r.t === 'oferta' ? 'oferta' : r.t
    // Sin internet el precio sale de la copia del catálogo (precio_lista); con internet, el vigente por sede y fecha.
    const { data: precioSrv } = navigator.onLine ? await rpc('precio_vigente', { p_tipo: tipoItem, p_item: r.id, p_sede: sedeActivaId, p_fecha: null }) : { data: null }
    const precio = precioSrv ?? r.item?.precio_lista ?? 0
    const it = r.item
    const tipoLinea = r.t === 'oferta' ? ({ plan_multisesion: 'plan', paquete: 'paquete', gift_card: 'gift_card', membresia: 'membresia' }[it.tipo] ?? 'paquete') : r.t
    const base = { clave: nuevaClave(), tipo: tipoLinea, descripcion: r.nombre, cantidad: 1, precio_unitario: Number(precio ?? 0), tipo_precio: 'fijo', descuento_pct: 0, descuento_motivo: '', descuento_motivo_id: null, aut: null, aut_precio: null,
      iva_tipo: r.t === 'oferta' ? (tipoLinea === 'gift_card' ? 'exento' : 'exento') : it.iva_tipo, editable: r.t === 'servicio' && ['desde', 'a_valorar', 'por_unidad'].includes(it.tipo_precio), atendio_id: podologoId || perfil?.id }
    if (r.t === 'servicio') base.servicio_id = r.id
    else if (r.t === 'producto') base.producto_id = r.id
    else base.oferta_id = r.id
    if (r.t === 'servicio' && it.admite_caracteristicas) Object.assign(base, { admite_caracteristicas: true, editable: true, base_nombre: r.nombre, precio_base: Number(precio ?? 0) > 0 ? Number(precio) : '', caracteristicas: [] }, recomponer({ admite_caracteristicas: true, base_nombre: r.nombre, precio_base: Number(precio ?? 0), caracteristicas: [] }))
    if (r.t === 'servicio' && it.tipo_precio === 'a_valorar') toast(it.admite_caracteristicas ? 'Producto especial: captura el precio base cotizado y elige sus características' : 'Servicio «a valorar»: captura el precio cotizado', { icon: 'ℹ️' })
    setLineas(ls => [...ls, base])
  }
  const setL = (clave, cambios) => setLineas(ls => ls.map(l => (l.clave === clave ? { ...l, ...cambios } : l)))
  const quitarL = clave => setLineas(ls => ls.filter(l => l.clave !== clave))
  const usarPlan = (l, plan) => setL(l.clave, { plan_adquirido_id: plan.id, precio_unitario: 0, tipo_precio: 'saldo_plan', descripcion: `${l.descripcion} (saldo del plan ${plan.folio ?? ''})`, editable: false })
  // Copia de pacientes (solo datos mínimos de búsqueda) para identificar al cliente sin internet; se borra al cerrar sesión (P-050).
  useEffect(() => {
    if (!navigator.onLine) return
    leer('prp_pacientes', { sedeCol: false, columnas: 'id,nombre,apellido_paterno,apellido_materno,nombre_completo,telefono_celular,numero_expediente,fecha_nacimiento,es_menor,tiene_datos_fiscales', orden: { columna: 'nombre_completo' }, limite: 3000 })
      .then(r => { if (!r.error && r.data.length) guardarSnapshot('pacientes-min', r.data) })
  }, [])
  const carQ = useLeerOffline('caracteristicas-activas', 'caracteristicas_producto', { sedeCol: false, filtros: { activa: true }, orden: { columna: 'grupo' }, limite: 300 })
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
  // El pago automático sigue al total cuando cambian los conceptos (lógica y pruebas en lib/comercial/pagosCaja.js).
  useEffect(() => { setPagos(ps => ajustarAuto(ps, tot.a_cobrar)) }, [tot.a_cobrar])

  const pinNecesarioLinea = l => {
    const c = calcularLinea(l)
    return requierePin({ pct: pctEfectivo(c), maxPct: maxPctEf, esAdmin }) && !l.aut
  }
  const pinNecesarioGlobal = Number(global.valor) > 0 && requierePin({ pct: pctGlobalEfectivo, maxPct: maxPctEf, esAdmin }) && !global.aut

  // ── pagos ────────────────────────────────────────────────────────────────────────────────────────
  const setP = (clave, c) => setPagos(ps => ps.map(p => (p.clave === clave ? { ...p, ...c } : p)))
  const buscarGift = async p => {
    const { data } = await leer('prp_gift_cards', { sedeCol: false, filtros: { codigo: p.codigoGift.trim().toUpperCase(), estado: 'activa' }, limite: 1 })
    if (!data[0]) return toast.error('Gift card no encontrada o inactiva')
    setPagos(ps => fijarMonto(ps.map(x => (x.clave === p.clave ? { ...x, gift: data[0] } : x)), p.clave, Math.min(Number(p.monto) || Math.max(0, tot.saldo), Number(data[0].saldo)), tot.a_cobrar))
  }

  // ── guardar / cobrar ─────────────────────────────────────────────────────────────────────────────
  const validar = (cobrar) => {
    if (!lineas.length) return 'Agrega al menos un concepto'
    if (lineas.some(l => !(Number(l.cantidad) > 0))) return 'Revisa las cantidades'
    if (lineas.some(l => l.tipo === 'servicio' && l.editable && !(Number(l.precio_unitario) >= 0))) return 'Captura el precio del servicio'
    const sinClavePrecio = lineas.find(l => precioNecesitaClave({ linea: l, params, esAdmin })); if (sinClavePrecio) return `El precio cotizado de «${sinClavePrecio.descripcion}» necesita la clave de un supervisor`
    const sinCar = lineas.find(l => l.admite_caracteristicas && !(l.caracteristicas ?? []).length); if (sinCar) return `Elige al menos una característica de «${sinCar.base_nombre}»`
    if (lineas.some(l => l.admite_caracteristicas && !(Number(l.precio_unitario) > 0))) return 'Captura el precio base cotizado del producto especial'
    for (const l of lineas) { const c = calcularLinea(l); if (c.descuento > 0 && !String(l.descuento_motivo).trim()) return 'Todo descuento exige motivo' }
    if (Number(global.valor) > 0 && !global.motivo.trim()) return 'El descuento global exige motivo'
    if (params.descuento_motivo_cerrado) {
      if (lineas.some(l => calcularLinea(l).descuento > 0 && !l.descuento_motivo_id) && !(Number(global.valor) > 0)) return 'Elige el motivo del descuento de la lista'
      if (Number(global.valor) > 0 && !global.motivo_id) return 'Elige el motivo del descuento global de la lista'
    }
    if (lineas.some(pinNecesarioLinea) || pinNecesarioGlobal) return params.descuento_motivo_cerrado ? `Los descuentos de más de ${maxPctEf} % requieren la clave de un supervisor` : `Descuentos de más de ${maxPct} % requieren PIN de Administrador`
    if (['plan', 'membresia'].some(t => lineas.some(l => l.tipo === t)) && !paciente) return 'Los planes y membresías se venden a un paciente'
    if (requiereFactura && !paciente) return 'Para facturar elige al paciente'
    if (!paciente && !clienteGeneral) return 'Falta el cliente: elígelo en la parte de arriba o marca «Cliente general»'
    if (anticipoExcede) return 'El anticipo seleccionado excede el total del ticket'
    if (cobrar) {
      if (!turno) return 'Abre tu turno de caja para cobrar'
      const errPago = validarPagos(pagos, tot.a_cobrar, { moneda, etiqueta: m => METODOS.find(x => x[0] === m)?.[1] ?? m }); if (errPago) return errPago
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
      descuento_pct: Number(global.valor) > 0 ? 0 : Number(l.descuento_pct) || 0, descuento_motivo: Number(global.valor) > 0 ? null : l.descuento_motivo || null, autorizacion_descuento_id: Number(global.valor) > 0 ? null : l.aut ?? null,
      descuento_motivo_id: Number(global.valor) > 0 ? null : l.descuento_motivo_id || null, autorizacion_precio_id: l.aut_precio ?? null }))
    const r = await insertar('venta_lineas', filas)
    if (r.error) throw new Error(textoError(r.error))
    const conCar = []
    lineas.forEach((l, i) => (l.caracteristicas ?? []).forEach((c, j) => { const vl = r.data?.find(x => x.orden === i); if (vl) conCar.push({ venta_linea_id: vl.id, sede_id: sedeActivaId, caracteristica_id: c.id, grupo: c.grupo, nombre: c.nombre, frase: c.tipo_valor === 'numero' ? c.frase.replace('{valor}', String(Number(c.valor))) : c.frase, valor: c.tipo_valor === 'numero' ? Number(c.valor) : null, unidad: c.unidad ?? null, efecto_precio: c.efecto_precio, monto_unitario: Number(c.monto) || 0, importe: c.efecto_precio === 'fijo' ? Number(c.monto) : c.efecto_precio === 'por_unidad' ? Number(c.monto) * Number(c.valor || 0) : 0, orden: j }) }))
    if (conCar.length) { const rc = await insertar('venta_linea_caracteristicas', conCar); if (rc.error) throw new Error(textoError(rc.error)) }
    // 3) descuento global
    if (Number(global.valor) > 0) {
      const g = await rpc('aplicar_descuento_global', { p_venta: id, p_tipo: global.tipo, p_valor: Number(global.valor), p_motivo: global.motivo, p_autorizacion: global.aut, p_motivo_id: global.motivo_id || null })
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
  // ── cobro SIN INTERNET: el ticket se guarda en este equipo y se sincroniza solo al volver la red (lib/offline/cola.js) ──
  async function cobrarOffline(imprimir) {
    const e = validar(true); if (e) return toast.error(e)
    if (lineas.some(l => ['plan', 'paquete', 'gift_card', 'membresia'].includes(l.tipo) || l.oferta_id || l.plan_adquirido_id || l.promocion_id)) return toast.error('Sin internet no se venden paquetes, planes, promociones ni se usa saldo de planes. Quítalos o espera a tener conexión.')
    if (params.descuento_motivo_cerrado && lineas.some(l => Number(l.descuento_pct) > 0)) return toast.error('Sin internet no se aplican descuentos mientras el catálogo de motivos y la clave de supervisor estén activos. Quita el descuento o espera a tener conexión.')
    if (lineas.some(l => precioNecesitaClave({ linea: l, params, esAdmin }))) return toast.error('Sin internet no se cobra un precio cotizado que exige la clave de un supervisor. Espera a tener conexión.')
    if (cita || ventaId || anticiposElegidos.length || Number(global.valor) > 0) return toast.error('Sin internet no se cobran citas, cuentas abiertas, anticipos ni descuentos globales. Espera a tener conexión.')
    if (pagos.some(p => !['efectivo', 'tarjeta', 'transferencia'].includes(p.metodo))) return toast.error('Sin internet solo se cobra con efectivo, tarjeta o transferencia.')
    setOcupado(true)
    try {
      const uuid = nuevoUuid(), creado = new Date().toISOString(), folio = await folioProvisional(sedeActiva)
      const carac = l => (l.caracteristicas ?? []).map(c => ({ caracteristica_id: c.id, grupo: c.grupo, nombre: c.nombre, frase: c.tipo_valor === 'numero' ? c.frase.replace('{valor}', String(Number(c.valor))) : c.frase, valor: c.tipo_valor === 'numero' ? Number(c.valor) : null, unidad: c.unidad ?? null, efecto_precio: c.efecto_precio, monto_unitario: Number(c.monto) || 0, importe: c.efecto_precio === 'fijo' ? Number(c.monto) : c.efecto_precio === 'por_unidad' ? Number(c.monto) * Number(c.valor || 0) : 0 }))
      const lineasPayload = lineas.map(l => ({ tipo: l.tipo, servicio_id: l.servicio_id ?? null, producto_id: l.producto_id ?? null, oferta_id: null, descripcion: l.descripcion, atendio_id: l.atendio_id ?? null, cantidad: Number(l.cantidad), precio_unitario: Number(l.precio_unitario) || 0, tipo_precio: l.tipo_precio, descuento_pct: Number(l.descuento_pct) || 0, descuento_motivo: l.descuento_motivo || null, caracteristicas: carac(l) }))
      const efRec = p => (p.metodo === 'efectivo' && p.recibido !== '' ? Number(p.recibido) : null)
      const cambioDe = p => (p.metodo === 'efectivo' && p.recibido !== '' ? cambio(p.recibido, p.monto) : null)
      const pagosPayload = pagos.map(p => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia || null, ultimos4: /^\d{4}$/.test(p.ultimos4) ? p.ultimos4 : null, efectivo_recibido: efRec(p), cambio: cambioDe(p) }))
      await encolarTicket({ cliente_uuid: uuid, user_id: user.id, sede_id: sedeActivaId, folio_provisional: folio, creado_en: creado, total: tot.a_cobrar,
        payload: { cliente_uuid: uuid, sede_id: sedeActivaId, folio_offline: folio, creado_en: creado, paciente_id: paciente?.id ?? null, podologo_id: podologoId || null, requiere_factura: requiereFactura, lineas: lineasPayload, pagos: pagosPayload } })
      window.dispatchEvent(new Event('pf-cola'))
      const logo = organizacion?.logo_url && /^https?:/.test(organizacion.logo_url) ? organizacion.logo_url : `${window.location.origin}${import.meta.env.BASE_URL}logo-ticket.png`
      const html = ticketHtml({ org: organizacion, sede: sedeActiva, copia: 'PROVISIONAL: se validará al sincronizar', logo, qr: null,
        venta: { folio, created_at: creado, cajero_nombre: `${perfil?.nombre ?? ''} ${perfil?.apellidos ?? ''}`.trim(), paciente_nombre: paciente?.nombre_completo ?? null, subtotal: tot.subtotal, descuento_total: tot.descuento_total, iva_total: tot.iva_total, total: tot.a_cobrar },
        lineas: lineas.map(l => { const c = calcularLinea(l); return { descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario, importe_bruto: c.importe + c.descuento, descuento: c.descuento } }),
        pagos: pagos.map(p => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia || null, ultimos4: p.ultimos4 || null, efectivo_recibido: efRec(p), cambio: cambioDe(p) })) })
      setHecho({ ventaId: null, folio, total: tot.a_cobrar, offline: true, html })
      toast.success(`Ticket ${folio} guardado sin conexión`)
      if (imprimir) imprimirHtml(html)
    } catch (err) { toast.error(textoError(err)) }
    setOcupado(false)
  }
  async function cobrar(imprimir) {
    if (bloqueo) return toast.error(bloqueo)
    if (!navigator.onLine) return cobrarOffline(imprimir)
    const e = validar(true); if (e) return toast.error(e)
    if (cobrandoRef.current) return   // doble clic: un solo cobro a la vez
    cobrandoRef.current = true
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
      if (previos.data.length) {
        // un intento anterior ya dejó pagos que no se pueden borrar: si lo de pantalla es distinto, no se cobra con otros pagos sin avisar
        const clave = x => `${x.metodo}:${Number(x.monto).toFixed(2)}`
        const a = previos.data.map(clave).sort().join('|'), b = filasPago.map(clave).sort().join('|')
        if (a !== b) throw new Error('Este ticket ya tiene pagos guardados de un intento anterior y son distintos a los de la pantalla. Déjalo como estaba o cancélalo desde «Tickets del día».')
      } else if (filasPago.length) { const rp = await insertar('pagos', filasPago); if (rp.error) throw new Error(textoError(rp.error)) }
      const rc = await rpc('cobrar_venta', { p_venta: id })
      if (rc.error) throw new Error(textoError(rc.error))
      const v = await leerUno('prp_ventas', { id })
      setHecho({ ventaId: id, folio: v.data?.folio, total: v.data?.total })
      toast.success(`Ticket ${v.data?.folio ?? ''} cobrado`)
      onListo?.()
      if (imprimir) imprimirTicketDe(id, { org: organizacion, sede: sedeActiva })
    } catch (err) { toast.error(textoError(err)) }
    cobrandoRef.current = false
    setOcupado(false)
  }
  function limpiar() {
    setVentaId(null); setCita(null); setPaciente(null); setClienteGeneral(false); setLineas([]); setPagos([]); setAnticiposSel([]); setGlobal({ tipo: 'pct', valor: '', motivo: '', motivo_id: '', aut: null }); setRequiereFactura(false); setHecho(null); setPodologoId('')
    const n = new URLSearchParams(sp); n.delete('cita'); n.delete('venta'); setSp(n, { replace: true })
  }

  // ── pantalla de cajero: atajos de teclado (F2…F9) y ayudas ───────────────────────────────────────
  const efectivo = pagos.find(p => p.metodo === 'efectivo')
  // Pulsar un método ya elegido lo quita (así se corrige un método elegido por error).
  const pagarCon = metodo => setPagos(ps => alternarMetodo(ps, metodo, tot.a_cobrar, nuevaClave()))
  const recibir = n => efectivo && setPagos(ps => (n === 'exacto' ? recibirExacto(ps, efectivo.clave) : fijarRecibidoPuro(ps, efectivo.clave, n, tot.a_cobrar)))
  const cambiarLinea = (clave, delta) => setLineas(ls => ls.map(l => (l.clave === clave ? { ...l, cantidad: Math.max(1, (Number(l.cantidad) || 1) + delta) } : l)))
  const alternarDesc = clave => setAbiertas(a => { const n = new Set(a); n.has(clave) ? n.delete(clave) : n.add(clave); return n })
  const enfocarBusqueda = f => { setFiltro(f); setPanel(null); setTimeout(() => buscaRef.current?.focus(), 0) }
  const favoritos = useMemo(() => servQ.filas.filter(s => s.tipo_precio === 'fijo').slice(0, 8), [servQ.filas])
  const resFiltrados = filtro ? resultados.filter(r => (filtro === 'oferta' ? r.t === 'oferta' : r.t === filtro)) : resultados

  const teclas = useRef(null)
  teclas.current = e => {
    if (hecho) { if (e.key === 'Enter') { e.preventDefault(); limpiar() } return }
    const mapa = {
      F2: () => enfocarBusqueda('servicio'), F3: () => enfocarBusqueda('producto'), F4: () => setPanel(p => (p === 'citas' ? null : 'citas')),
      F5: () => enfocarBusqueda('oferta'), F6: () => cuentaAbierta(), F7: () => pagarCon('efectivo'), F8: () => pagarCon('tarjeta'), F9: () => cobrar(true),
    }
    if (mapa[e.key]) { e.preventDefault(); mapa[e.key]() }
  }
  useEffect(() => {
    const h = e => teclas.current?.(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (!puedeCobrar) return <div className="card">Tu rol no cobra en caja (siempre cobra Caja, P-078). Puedes consultar los tickets.</div>
  if (hecho) {
    return (
      <div className="cj-hecho">
        <div className="cj-hecho-ok">✔</div>
        <h2>Cobro registrado</h2>
        <div className="cj-hecho-folio">Ticket <b>{hecho.folio}</b></div>
        <div className="cj-hecho-total">{moneda(hecho.total)}</div>
        {hecho.offline && <div className="cj-hecho-off" style={{ background: '#FFF4D6', border: '1px solid #E5B93C', borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '6px 0' }}>Sin conexión: el ticket quedó guardado en este equipo. Se sincroniza solo al volver el internet y entonces recibe su folio oficial.</div>}
        {efectivo && efectivo.recibido !== '' && <div className="cj-hecho-cambio">Cambio entregado: <b>{moneda(cambio(efectivo.recibido, efectivo.monto))}</b></div>}
        <div className="cj-hecho-acciones">
          <button className="cj-btn cj-btn-grande cj-verde" autoFocus onClick={limpiar}>Nueva venta (Enter)</button>
          <button className="cj-btn cj-btn-grande" onClick={() => (hecho.offline ? imprimirHtml(hecho.html) : imprimirTicketDe(hecho.ventaId, { org: organizacion, sede: sedeActiva }))}><Printer size={20} /> Reimprimir ticket</button>
          {requiereFactura && !hecho.offline && <button className="cj-btn cj-btn-grande" onClick={() => nav(`/facturacion?venta=${hecho.ventaId}`)}>Facturar este ticket</button>}
        </div>
      </div>
    )
  }

  const FILTROS = [['', 'Todo'], ['servicio', 'Servicios (F2)'], ['producto', 'Productos (F3)'], ['oferta', 'Paquetes y planes (F5)']]
  const METODO_ICONO = { efectivo: Banknote, tarjeta: CreditCard, transferencia: Landmark, gift_card: Gift }
  const hayPagoRapido = ['efectivo', 'tarjeta', 'transferencia']

  return (
    <div className="cj">
      {/* ───────── columna izquierda: qué se vende ───────── */}
      <div className="cj-izq">
        {/* Cliente siempre a la vista desde el inicio (obligatorio para cobrar): se elige aquí o se marca «Cliente general». */}
        <div className="card" style={{ padding: '8px 12px', marginBottom: 10, borderLeft: !paciente && !clienteGeneral ? '4px solid var(--red)' : undefined }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Cliente <span className="text-muted" style={{ fontWeight: 400 }}>(obligatorio para cobrar)</span></div>
          <PacienteBuscador valor={paciente} onElegir={p => { setPaciente(p); if (p) setClienteGeneral(false) }} />
          {!paciente && <label style={{ fontSize: 14, display: 'block', marginTop: 6 }}><input type="checkbox" checked={clienteGeneral} onChange={e => setClienteGeneral(e.target.checked)} /> Cliente general (no quiere dar su nombre)</label>}
        </div>
        <div className="cj-buscar">
          <Search size={22} className="cj-buscar-ico" />
          <input ref={buscaRef} autoFocus className="cj-buscar-in" placeholder="Busca o escanea: servicio, producto, paquete, código de barras…" value={busca}
            onChange={e => setBusca(e.target.value)} onKeyDown={e => { leerCodigo(e); if (e.key === 'Escape') { setBusca(''); setFiltro('') } }} />
          {resFiltrados.length > 0 && (
            <div className="cj-res">
              {resFiltrados.map(r => <button type="button" key={r.t + r.id} onClick={() => { agregar(r); buscaRef.current?.focus() }}>
                <span><span className="bd m" style={{ marginRight: 8 }}>{r.t}</span>{r.nombre}</span><span className="text-muted">{r.extra}</span></button>)}
            </div>
          )}
        </div>
        {busca.trim().length >= 2 && resFiltrados.length === 0 && <div className="text-muted" style={{ marginTop: 4 }}>Sin resultados{filtro ? ' en este filtro' : ''}.</div>}
        <div className="cj-filtros">{FILTROS.map(([v, t]) => <button key={v} type="button" className={`cj-chip ${filtro === v ? 'on' : ''}`} onClick={() => enfocarBusqueda(v)}>{t}</button>)}</div>
        <AvisoError error={servQ.error ?? prodQ.error} titulo="No se pudo cargar el catálogo" />

        <div className="cj-atajos">
          <button type="button" className={`cj-tile ${panel === 'citas' ? 'on' : ''}`} onClick={() => setPanel(p => (p === 'citas' ? null : 'citas'))}><CalendarCheck size={30} /><b>Cita por cobrar</b><span>F4 · {porCobrar.filas.length} pendientes</span></button>
          <button type="button" className="cj-tile" onClick={() => enfocarBusqueda('servicio')}><Stethoscope size={30} /><b>Servicio</b><span>F2</span></button>
          <button type="button" className="cj-tile" onClick={() => enfocarBusqueda('producto')}><Package size={30} /><b>Producto</b><span>F3</span></button>
          <button type="button" className="cj-tile" onClick={() => enfocarBusqueda('oferta')}><Layers size={30} /><b>Paquete / plan</b><span>F5</span></button>
          <button type="button" className="cj-tile" disabled={ocupado} onClick={cuentaAbierta}><Save size={30} /><b>Cuenta abierta</b><span>F6 · cobrar después</span></button>
          <button type="button" className={`cj-tile ${panel === 'mas' ? 'on' : ''}`} onClick={() => setPanel(p => (p === 'mas' ? null : 'mas'))}><Percent size={30} /><b>Paciente · factura · descuento</b><span>más opciones</span></button>
        </div>

        {panel === 'citas' && (
          <div className="card cj-panel">
            <h3>Citas atendidas sin cobro</h3>
            {porCobrar.filas.length === 0 && <div className="text-muted">No hay citas por cobrar.</div>}
            <AvisoError error={porCobrar.error} />
            {porCobrar.filas.map(c => <button type="button" key={c.cita_id} className="cj-fila-btn" onClick={() => { cargarCita(c.cita_id); setPanel(null) }}>
              <span><b>{c.paciente_nombre}</b> · {c.servicio_nombre}</span><span>{moneda(c.precio_servicio)}</span></button>)}
          </div>
        )}
        {panel === 'mas' && (
          <div className="card cj-panel">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginBottom: 6 }}>Atención y factura</h3>
                <FormField label="Podólogo que atendió" as="select" value={podologoId} onChange={e => { const nuevo = e.target.value, previo = podologoId || perfil?.id; setLineas(ls => ls.map(l => (l.atendio_id === previo ? { ...l, atendio_id: nuevo || perfil?.id } : l))); setPodologoId(nuevo) }} placeholder="—" options={podQ.filas.map(p => ({ value: p.id, label: nombrePerfil(p) }))} />
                <label style={{ fontSize: 14 }}><input type="checkbox" checked={requiereFactura} onChange={e => setRequiereFactura(e.target.checked)} /> ¿Requiere factura?{paciente?.tiene_datos_fiscales ? ' (datos fiscales ✓)' : ''}</label>
                {cita && <div style={{ fontSize: 12.5, marginTop: 6 }}>Cita <b>{cita.folio}</b> · {cita.sede_nombre}</div>}
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ marginBottom: 6 }}>Descuento global</h3>
                <div className="grid3">
                  <FormField label="Tipo" as="select" value={global.tipo} onChange={e => setGlobal(g => ({ ...g, tipo: e.target.value, aut: null }))} options={[{ value: 'pct', label: '%' }, { value: 'monto', label: '$ monto' }]} />
                  <FormField label="Valor" type="number" min="0" value={global.valor} onChange={e => setGlobal(g => ({ ...g, valor: e.target.value, aut: null }))} />
                  {params.descuento_motivo_cerrado
                    ? <FormField label="Motivo" as="select" value={global.motivo_id} onChange={e => { const m = params.motivos_descuento.find(x => x.id === e.target.value); setGlobal(g => ({ ...g, motivo_id: m?.id ?? '', motivo: m?.nombre ?? '', aut: null })) }} options={params.motivos_descuento.map(m => ({ value: m.id, label: m.nombre }))} />
                    : <FormField label="Motivo" as="select" value={global.motivo} onChange={e => setGlobal(g => ({ ...g, motivo: e.target.value }))} options={MOTIVOS.map(m => ({ value: m, label: m }))} />}
                </div>
                {Number(global.valor) > 0 && <div style={{ fontSize: 12.5 }}>Descuento efectivo {pctGlobalEfectivo.toFixed(1)} % · reemplaza los descuentos por línea.
                  {pinNecesarioGlobal ? <button type="button" className="btn red" style={{ marginLeft: 8 }} onClick={() => setPin({ tipo: 'global', pct: pctGlobalEfectivo, motivo: global.motivo })}>Pedir PIN</button> : global.aut ? <span className="bd v" style={{ marginLeft: 8 }}>Autorizado</span> : null}</div>}
                <div className="text-muted" style={{ fontSize: 12 }}>{params.descuento_motivo_cerrado ? `Hasta ${maxPctEf} % sin clave; arriba pide la clave de un supervisor. El motivo sale del catálogo.` : `Recepción da hasta ${maxPct} % sin autorización; arriba pide PIN del Administrador. Todo descuento exige motivo.`}</div>
                <h3 style={{ margin: '10px 0 6px' }}>Anticipo / pago previo aplicado</h3>
                {!paciente ? <div className="text-muted" style={{ fontSize: 13 }}>Elige al paciente para ver sus anticipos.</div> : antQ.filas.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>Sin anticipos pagados.</div> : (
                  <table><thead><tr><th>Folio</th><th>Fecha</th><th className="num">Monto</th><th>Aplicar</th></tr></thead>
                    <tbody>{antQ.filas.map(a => <tr key={a.id}><td>{a.folio}</td><td>{fecha(a.pagado_en)}</td><td className="num">{moneda(a.monto)}</td>
                      <td><input type="checkbox" checked={anticiposSel.includes(a.id)} onChange={e => setAnticiposSel(s => (e.target.checked ? [...s, a.id] : s.filter(x => x !== a.id)))} /></td></tr>)}</tbody></table>)}
                {anticipoExcede && <div className="text-red" style={{ fontSize: 12.5 }}>El anticipo excede el total del ticket.</div>}
              </div>
            </div>
          </div>
        )}

        {lineas.length === 0 && favoritos.length > 0 && (
          <div>
            <div className="cj-sub">Servicios frecuentes</div>
            <div className="cj-fav">{favoritos.map(s => <button type="button" key={s.id} className="cj-fav-b" onClick={() => agregar({ t: 'servicio', id: s.id, nombre: s.nombre, extra: s.folio ?? s.codigo, item: s })}>{s.nombre}</button>)}</div>
          </div>
        )}
      </div>

      {/* ───────── columna derecha: ticket y cobro ───────── */}
      <div className="cj-der">
        <div className="cj-ticket">
          <div className="cj-sub" style={{ marginTop: 0 }}>Ticket{paciente ? ` · ${paciente.nombre_completo ?? paciente.nombre ?? ''}` : clienteGeneral ? ' · cliente general' : ' · sin cliente (elígelo arriba)'}</div>
          <div className="cj-lineas">
            {lineas.length === 0 && <div className="cj-vacio">Agrega un servicio o producto para empezar</div>}
            {lineasConGlobal.map(l0 => {
              const l = lineas.find(x => x.clave === l0.clave) ?? l0
              const c = calcularLinea(l0)
              const necesitaPin = pinNecesarioLinea(l) && !(Number(global.valor) > 0)
              const plan = l.tipo === 'servicio' && !l.plan_adquirido_id ? planQ.filas.find(p => p.servicio_base_id === l.servicio_id && p.sesiones_saldo > 0) : null
              return (
                <div key={l.clave} className="cj-linea">
                  <div className="cj-linea-fila">
                    <div className="cj-linea-desc">{l.descripcion}<span className="bd m" style={{ marginLeft: 6 }}>{l.tipo}</span>
                      {plan && <div><button type="button" className="btn o" style={{ padding: '1px 8px', fontSize: 11.5 }} onClick={() => usarPlan(l, plan)}>Usar saldo del plan {plan.folio} ({plan.sesiones_saldo} ses.)</button></div>}</div>
                    <div className="cj-cant">
                      <button type="button" aria-label="Menos" onClick={() => cambiarLinea(l.clave, -1)}><Minus size={16} /></button>
                      <input type="number" min="1" step="1" value={l.cantidad} aria-label="Cantidad" onChange={e => setL(l.clave, { cantidad: e.target.value })} />
                      <button type="button" aria-label="Más" onClick={() => cambiarLinea(l.clave, 1)}><Plus size={16} /></button>
                    </div>
                    <div className="cj-imp"><b>{moneda(c.importe)}</b>{c.descuento > 0 && <div className="text-red" style={{ fontSize: 11 }}>−{moneda(c.descuento)}</div>}</div>
                    <button type="button" className="cj-ico" title="Descuento / precio" onClick={() => alternarDesc(l.clave)}><Percent size={15} /></button>
                    <button type="button" className="cj-ico" aria-label="Quitar" onClick={() => quitarL(l.clave)}><X size={16} /></button>
                  </div>
                  {(abiertas.has(l.clave) || l.editable || necesitaPin) && (
                    <div className="cj-linea-extra">
                      <label>Precio <input type="number" min="0" step="0.01" value={l.precio_unitario} disabled={!l.editable || !!l.admite_caracteristicas} title={l.admite_caracteristicas ? 'Calculado: precio base + características' : l.editable ? 'Precio cotizado' : 'Precio congelado del catálogo'} onChange={e => setL(l.clave, { precio_unitario: e.target.value, aut_precio: null })} /></label>
                      <label>Desc. % <input type="number" min="0" max="100" value={Number(global.valor) > 0 ? '' : l.descuento_pct} disabled={Number(global.valor) > 0} onChange={e => setL(l.clave, { descuento_pct: e.target.value, aut: null })} /></label>
                      {Number(l.descuento_pct) > 0 && !(Number(global.valor) > 0) && (params.descuento_motivo_cerrado
                        ? <select aria-label="Motivo del descuento" value={l.descuento_motivo_id ?? ''} onChange={e => { const m = params.motivos_descuento.find(x => x.id === e.target.value); setL(l.clave, { descuento_motivo_id: m?.id ?? null, descuento_motivo: m?.nombre ?? '', aut: null }) }}>
                            <option value="">Motivo del descuento…</option>{params.motivos_descuento.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
                        : <input placeholder="Motivo" value={l.descuento_motivo} onChange={e => setL(l.clave, { descuento_motivo: e.target.value })} />)}
                      {necesitaPin && <button type="button" className="btn red" style={{ padding: '1px 8px' }} onClick={() => setPin({ tipo: 'linea', clave: l.clave, pct: Number(l.descuento_pct), motivo: l.descuento_motivo })}>{params.descuento_motivo_cerrado ? 'Clave' : 'PIN'}</button>}
                      {l.aut && Number(l.descuento_pct) > 0 && <span className="bd v">Autorizado</span>}
                      {precioNecesitaClave({ linea: l, params, esAdmin }) && <button type="button" className="btn red" style={{ padding: '1px 8px' }} onClick={() => setPin({ tipo: 'precio', clave: l.clave, motivo: `Precio cotizado: ${l.descripcion}` })}>Clave para el precio</button>}
                      {l.aut_precio && <span className="bd v">Precio autorizado</span>}
                      {!(Number(global.valor) > 0) && promos.length > 0 && (l.tipo === 'servicio' || l.tipo === 'producto') && (
                        <select value={l.promocion_id ?? ''} onChange={e => aplicarPromo(l, e.target.value)}><option value="">Sin promoción</option>{promos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>)}
                      {l.admite_caracteristicas && <CajaCaracteristicas linea={l} catalogo={carQ.filas} onCambio={nl => setL(l.clave, { ...nl, aut_precio: nl.precio_unitario === undefined || Number(nl.precio_unitario) === Number(l.precio_unitario) ? l.aut_precio : null })} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="cj-totales">
            {Number(tot.descuento_total) > 0 && <div><span>Subtotal</span><span>{moneda(tot.subtotal)}</span></div>}
            {Number(tot.descuento_total) > 0 && <div><span>Descuentos</span><span>−{moneda(tot.descuento_total)}</span></div>}
            {Number(tot.anticipo_aplicado) > 0 && <div><span>Anticipo aplicado</span><span>−{moneda(tot.anticipo_aplicado)}</span></div>}
            <div className="cj-iva"><span>IVA incluido</span><span>{moneda(tot.iva_total)}</span></div>
            <div className="cj-total"><span>TOTAL</span><span>{moneda(tot.a_cobrar)}</span></div>
          </div>
        </div>

        <div className="cj-pago">
          <div className="cj-sub" style={{ marginTop: 0 }}>¿Cómo paga?</div>
          <div className="cj-metodos">
            {hayPagoRapido.map((m, i) => { const I = METODO_ICONO[m]; const act = pagos.some(p => p.metodo === m); return (
              <button key={m} type="button" className={`cj-metodo ${act ? 'on' : ''}`} onClick={() => pagarCon(m)}><I size={26} /><b>{METODOS.find(x => x[0] === m)[1].split(' (')[0]}</b>{i < 2 && <span>F{7 + i}</span>}</button>) })}
            <select className="cj-otros" value="" onChange={e => e.target.value && pagarCon(e.target.value)} aria-label="Otro método de pago">
              <option value="">Otro…</option>{METODOS.filter(([m]) => !hayPagoRapido.includes(m)).map(([m, l]) => <option key={m} value={m}>{l}</option>)}
            </select>
          </div>

          {pagos.map(p => (
            <div key={p.clave} className="cj-pago-fila">
              <div className="cj-pago-cab">
                <b>{METODOS.find(m => m[0] === p.metodo)?.[1]}</b>
                <input type="number" min="0" step="0.01" value={p.monto} onChange={e => setPagos(ps => fijarMonto(ps, p.clave, e.target.value, tot.a_cobrar))} aria-label="Monto" />
                <button type="button" className="btn o" style={{ padding: '2px 8px', fontSize: 11.5 }} onClick={() => setPagos(ps => completarPago(ps, p.clave, tot.a_cobrar))}>Completar</button>
                <button type="button" className="cj-ico" onClick={() => setPagos(ps => quitarPago(ps, p.clave, tot.a_cobrar))} aria-label="Quitar pago"><X size={15} /></button>
              </div>
              {p.metodo === 'efectivo' && (
                <div>
                  <div className="cj-billetes">
                    <button type="button" onClick={() => recibir('exacto')}>Exacto</button>
                    {[100, 200, 500, 1000].map(n => <button type="button" key={n} onClick={() => recibir(n)}>${n}</button>)}
                  </div>
                  <label className="cj-recibido">Recibido <input type="number" min="0" step="0.01" autoFocus value={p.recibido} onChange={e => setP(p.clave, { recibido: e.target.value })} onBlur={e => setPagos(ps => fijarRecibidoPuro(ps, p.clave, e.target.value, tot.a_cobrar))} /></label>
                  {p.recibido !== '' && Number(p.recibido) >= p.monto && <div className="cj-cambio">Cambio <b>{moneda(cambio(p.recibido, p.monto))}</b></div>}
                  {p.recibido !== '' && Number(p.recibido) < p.monto && <div className="text-red">Falta {moneda(p.monto - Number(p.recibido))}</div>}
                </div>
              )}
              {p.metodo === 'tarjeta' && <div style={{ display: 'flex', gap: 6, marginTop: 4 }}><input placeholder="Autorización (obligatoria)" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} /><input placeholder="Últimos 4" maxLength={4} style={{ width: 90 }} value={p.ultimos4} onChange={e => setP(p.clave, { ultimos4: e.target.value.replace(/\D/g, '') })} /></div>}
              {p.metodo === 'transferencia' && <input style={{ marginTop: 4, width: '100%' }} placeholder="Clave de rastreo (obligatoria)" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} />}
              {p.metodo === 'clip' && <div style={{ marginTop: 4 }}><input style={{ width: '100%' }} placeholder="ID de pago Clip (de la terminal o la liga)" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} /><div className="text-muted" style={{ fontSize: 11.5 }}>{COBRO_TERMINAL_AVISO}</div></div>}
              {p.metodo === 'gift_card' && <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}><input placeholder="Código (GC-…)" value={p.codigoGift} onChange={e => setP(p.clave, { codigoGift: e.target.value, gift: null })} /><button type="button" className="btn o" onClick={() => buscarGift(p)}>Buscar</button>{p.gift && <span className="bd v">Saldo {moneda(p.gift.saldo)}</span>}</div>}
              {p.metodo === 'cortesia' && <input style={{ marginTop: 4, width: '100%' }} placeholder="Motivo de la cortesía (y quién autoriza)" value={p.referencia} onChange={e => setP(p.clave, { referencia: e.target.value })} />}
            </div>
          ))}
          <div className="cj-saldo" style={{ color: tot.saldo === 0 && pagos.length ? 'var(--green)' : 'var(--red)' }}>
            <span>Pagado {moneda(tot.pagado)}</span><span>Saldo {moneda(tot.saldo)}</span>
          </div>
        </div>

        <button type="button" className="cj-cobrar" disabled={ocupado || !turno || !!bloqueo} onClick={() => cobrar(true)} title={bloqueo || (!turno ? 'Abre tu turno de caja' : '')}>
          <Printer size={26} /> COBRAR E IMPRIMIR · {moneda(tot.a_cobrar)} <span>(F9)</span>
        </button>
        <div className="cj-sec">
          <button className="btn o" disabled={ocupado || !turno || !!bloqueo} onClick={() => cobrar(false)}>Cobrar sin ticket</button>
          <button className="btn red" disabled={ocupado} onClick={() => setConfirmarLimpiar(true)}>Cancelar venta</button>
        </div>
        {!turno && <div className="text-red" style={{ fontSize: 13 }}>Abre tu turno de caja para cobrar.</div>}
        {bloqueo && <div className="text-red" role="alert" style={{ fontSize: 13, fontWeight: 600 }}>{bloqueo}</div>}
      </div>

      <PinModal open={!!pin && pin.tipo !== 'precio' && !params.descuento_motivo_cerrado} tipo="descuento" pctMax={pin?.pct ?? null} motivoInicial={pin?.motivo ?? ''} detalle={{ ticket: ventaId }} onClose={() => setPin(null)}
        onAutorizado={id => { if (pin.tipo === 'linea') setL(pin.clave, { aut: id }); else setGlobal(g => ({ ...g, aut: id })); setPin(null); toast.success('Descuento autorizado (10 min)') }} />
      {/* clave de supervisor (Etapa 1): descuentos con catálogo cerrado y precio cotizado; deja al autorizador registrado en la línea */}
      <ClaveSupervisorModal open={!!pin && (pin.tipo === 'precio' || params.descuento_motivo_cerrado)} tipo={pin?.tipo === 'precio' ? 'precio' : 'descuento'} pct={pin?.pct ?? null} motivoInicial={pin?.motivo ?? ''}
        autorizadores={params.autorizadores} sedeId={sedeActivaId} onClose={() => setPin(null)}
        onAutorizado={id => { if (pin.tipo === 'linea') setL(pin.clave, { aut: id }); else if (pin.tipo === 'precio') setL(pin.clave, { aut_precio: id }); else setGlobal(g => ({ ...g, aut: id })); setPin(null); toast.success(pin.tipo === 'precio' ? 'Precio autorizado (10 min)' : 'Descuento autorizado (10 min)') }} />
      <ConfirmDialog open={confirmarLimpiar} titulo="Cancelar venta" peligro textoConfirmar="Descartar"
        mensaje={ventaId ? 'El ticket abierto se conserva en «Tickets del día»; esta pantalla se limpia.' : 'Se descartan los conceptos capturados (aún no se guardó nada).'} onConfirm={() => { setConfirmarLimpiar(false); limpiar() }} onCancel={() => setConfirmarLimpiar(false)} />
    </div>
  )
}
