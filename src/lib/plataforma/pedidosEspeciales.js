// Pedidos especiales (zapatos, plantillas y aditamentos a nombre de un cliente): reglas puras que comparte la pantalla y las pruebas.
// La autoridad real es la base (migraciones 320-322: triggers de transición, RPC con comprobación de rol y RLS); esto solo decide qué
// se muestra y evita pedirle al usuario acciones que la base va a rechazar. Debe coincidir con piefirme_app.pedido_bi().
import { redondear } from '../comercial/dinero.js'

export const ESTADOS = {
  solicitado: 'Solicitado', anticipo_cobrado: 'Anticipo cobrado', autorizado: 'Autorizado', enviado_proveedor: 'Enviado al proveedor', aceptado: 'Aceptado por el proveedor',
  en_transito: 'En tránsito', recibido: 'Recibido en la sucursal', entregado: 'Entregado', en_espera: 'En espera', cancelado: 'Cancelado',
}
/** Etapas del camino feliz, en orden (columnas del tablero). */
export const ETAPAS = ['solicitado', 'anticipo_cobrado', 'autorizado', 'enviado_proveedor', 'aceptado', 'en_transito', 'recibido', 'entregado']
export const ETAPAS_TABLERO = [...ETAPAS.slice(0, 7), 'en_espera']
export const FINALES = ['entregado', 'cancelado']
export const TIPOS_ITEM = { zapato: 'Zapato', plantilla: 'Plantilla', aditamento: 'Aditamento', otro: 'Otro' }
export const PCT_ANTICIPO_DEFECTO = 50
export const CANALES = { whatsapp_simulado: 'WhatsApp (simulado)', copiado_manual: 'Copiado al grupo' }
export const AVISO_MENSAJERIA = 'Simulado: se copia al grupo de WhatsApp del proveedor.'

export const TRANSICIONES = {
  solicitado: ['anticipo_cobrado', 'cancelado'],
  anticipo_cobrado: ['autorizado', 'en_espera', 'cancelado'],
  autorizado: ['enviado_proveedor', 'en_espera', 'cancelado'],
  enviado_proveedor: ['aceptado', 'en_espera', 'cancelado'],
  aceptado: ['en_transito', 'recibido', 'en_espera', 'cancelado'],
  en_transito: ['recibido', 'en_espera', 'cancelado'],
  recibido: ['entregado'],
  en_espera: ['solicitado', 'anticipo_cobrado', 'cancelado'],
  entregado: [], cancelado: [],
}
export const puedeTransitar = (de, a) => (TRANSICIONES[de] ?? []).includes(a)

/** Anticipo y saldo de un importe: $2,000 al 50 % → $1,000 y $1,000. Nunca más que el total. */
export function desglosarAnticipo(total, pct = PCT_ANTICIPO_DEFECTO) {
  const t = redondear(Number(total) || 0)
  const p = Math.min(100, Math.max(0, Number(pct)))
  const anticipo = Math.min(t, redondear(t * p / 100))
  return { total: t, pct: p, anticipo, saldo: redondear(t - anticipo) }
}
export const importeLinea = l => redondear((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))

/**
 * Una nota con varias partidas se separa en UN pedido por proveedor. pctDe(proveedorId) da el % del proveedor (o null → el de la organización).
 * Devuelve [{ proveedor_id, lineas, total, pct, anticipo, saldo }] y los totales de la nota (un solo anticipo por cobrar).
 */
export function separarPorProveedor(lineas, pctDe = () => null, pctOrg = PCT_ANTICIPO_DEFECTO) {
  const grupos = new Map()
  for (const l of lineas) { if (!grupos.has(l.proveedor_id)) grupos.set(l.proveedor_id, []); grupos.get(l.proveedor_id).push(l) }
  const pedidos = [...grupos].map(([proveedor_id, ls]) => {
    const total = redondear(ls.reduce((s, l) => s + importeLinea(l), 0))
    return { proveedor_id, lineas: ls, ...desglosarAnticipo(total, pctDe(proveedor_id) ?? pctOrg) }
  })
  const suma = k => redondear(pedidos.reduce((s, p) => s + p[k], 0))
  return { pedidos, total: suma('total'), anticipo: suma('anticipo'), saldo: suma('saldo') }
}

/** Acciones que puede ver el usuario en un pedido según su estado y rol (la base vuelve a comprobar todo). */
export function accionesDisponibles({ estado, rol, esSolicitante = false, anticipoMonto = 1 }) {
  const admin = rol === 'administrador', caja = admin || rol === 'recepcion'
  const a = []
  switch (estado) {
    case 'solicitado':
      if (caja && anticipoMonto > 0) a.push('cobrar_anticipo')
      if (admin || esSolicitante) a.push('cancelar')
      break
    case 'anticipo_cobrado': if (admin) a.push('autorizar', 'rechazar', 'cancelar'); break
    case 'autorizado': if (caja) a.push('enviar'); if (admin) a.push('cancelar'); break
    case 'enviado_proveedor': if (caja) a.push('registrar_aceptacion', 'proveedor_rechaza'); if (admin) a.push('cancelar'); break
    case 'aceptado': if (caja) a.push('registrar_transito', 'recibir'); if (admin) a.push('cancelar'); break
    case 'en_transito': if (caja) a.push('recibir'); if (admin) a.push('cancelar'); break
    case 'recibido': if (caja) a.push('entregar'); break
    case 'en_espera': if (caja) a.push('reanudar'); if (admin) a.push('cancelar'); break
    default: break
  }
  return a
}

/** Semáforo de retraso (mismo criterio que la vista prp_pedidos_especiales). */
export function semaforo({ estado, fecha_prometida, fecha_acordada, plazo_saldo }, hoy) {
  if (['entregado', 'cancelado', 'en_espera'].includes(estado)) return null
  const limite = estado === 'recibido' ? plazo_saldo : (fecha_acordada ?? fecha_prometida)
  if (!limite) return 'verde'
  const dias = Math.round((new Date(limite + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 86400000)
  return dias < 0 ? 'rojo' : dias <= 2 ? 'ambar' : 'verde'
}
export const SEMAFORO = { rojo: { texto: 'Atrasado', variante: 'r' }, ambar: { texto: 'Por vencer', variante: 'a' }, verde: { texto: 'A tiempo', variante: 'v' } }

/** Iniciales para hablar de un cliente con el proveedor sin dar datos personales: «María González Ramírez» → «M.G.R.». */
export const inicialesCliente = (...partes) => partes.filter(p => p && String(p).trim()).map(p => String(p).trim()[0].toLocaleUpperCase('es') + '.').join('')

/** Los costos nunca llegan a recepción ni podología: la base ya los manda en null; esto lo asegura también en la pantalla. */
export const puedeVerCostos = rol => rol === 'administrador' || rol === 'supervisor'
export function sinCostos(fila, rol) {
  if (puedeVerCostos(rol)) return fila
  const { costo_estimado, costo_unitario, costo_total, partidas_sin_costo, ...resto } = fila
  return resto
}

/** Texto de la petición al proveedor (vista previa; el texto que se registra lo arma la base con piefirme_app.pedido_mensaje_texto). */
export function mensajeProveedor({ folio, notaFolio, iniciales, sede, fechaRequerida, lineas }) {
  const f = d => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}` }
  const partidas = lineas.map((l, i) => {
    const car = (l.caracteristicas ?? []).map(c => c.frase).filter(Boolean).join('; ')
    return `${i + 1}. ${Number(l.cantidad)} × ${l.descripcion} [${l.tipo_item}]${car ? `\n   Características: ${car}` : ''}`
  }).join('\n')
  return `Pedido especial ${folio}\nNota del cliente: ${notaFolio} (cliente ${iniciales || 's/i'})\nEntrega en sucursal: ${sede}\nFecha requerida: ${f(fechaRequerida)}\n\nPartidas:\n${partidas}\n\nFavor de confirmar si lo aceptan, la fecha de entrega y la guía o referencia del envío.`
}
