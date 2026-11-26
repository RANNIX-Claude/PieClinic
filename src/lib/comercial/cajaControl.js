// Controles del punto de venta del módulo «Control y Auditoría» · ETAPA 1 (la Caja de Pie Firme hace el papel de PODIX).
// Acceso a datos por RPC (la Caja no escribe directo en ctl_*) y las reglas puras que la pantalla usa para decidir qué mostrar. El SERVIDOR es quien hace cumplir
// todo (migraciones 290–293): aquí solo se evita el viaje de ida y vuelta y se explica al cajero qué falta. La Caja nunca recibe saldos, existencias ni diferencias.
import { rpc } from '../api'
import { supabase } from '../supabase'
import { BUCKETS } from '../urlFirmada'

export const nuevoId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

export * from './cajaControlReglas'

// ── RPC ───────────────────────────────────────────────────────────────────────────────────────────
export const parametrosCaja = sedeId => rpc('ctl_caja_parametros', { p_sede: sedeId })
export const autorizarCaja = ({ tipo, autorizadorId, pin, pct = null, motivo, sedeId = null, detalle = {} }) =>
  rpc('ctl_autorizar_caja', { p_tipo: tipo, p_autorizador: autorizadorId, p_pin: pin, p_pct: pct, p_motivo: motivo, p_sede: sedeId, p_detalle: detalle })

export const cancelacionRequiere = ventaId => rpc('ctl_cancelacion_requiere', { p_venta: ventaId })
export const solicitarCancelacion = ({ ventaId, motivo = null }) => rpc('ctl_cancelacion_solicitar', { p_venta: ventaId, p_motivo: motivo })
export const solicitarDevolucion = ({ lineaId, cantidad, motivo = null }) => rpc('ctl_devolucion_solicitar', { p_linea: lineaId, p_cantidad: cantidad, p_motivo: motivo })
export const estadoCancelacion = id => rpc('ctl_cancelacion_estado', { p_id: id })
export const cancelacionesPendientes = (sucursalId = null) => rpc('ctl_cancelaciones_pendientes', { p_sucursal: sucursalId })
export const rechazarCancelacion = (id, razon = null) => rpc('ctl_cancelacion_rechazar', { p_id: id, p_razon: razon })

/** Responde la solicitud: pieza(s) escaneada(s) + foto EN VIVO ya registrable + motivo del catálogo + clave de supervisor. No existe camino de galería. */
export async function resolverCancelacion({ id, organizacionId, sucursalId, codigos, motivoId, nota = null, autorizadorId, pin, foto }) {
  let evidenciaId = null, ruta = null, hash = null, bytes = null, ancho = null, alto = null
  if (foto?.blob) {
    evidenciaId = nuevoId(); ruta = `${organizacionId}/ctl/${sucursalId}/${evidenciaId}.jpg`
    const up = await supabase.storage.from(BUCKETS.auditoria).upload(ruta, foto.blob, { contentType: 'image/jpeg', upsert: false })
    if (up.error) return { data: null, error: up.error }
    hash = foto.hash; bytes = foto.blob.size; ancho = foto.ancho; alto = foto.alto
  }
  return rpc('ctl_cancelacion_resolver', {
    p_id: id, p_codigos: codigos, p_motivo: motivoId, p_nota: nota, p_autorizador: autorizadorId, p_pin: pin,
    p_evidencia_id: evidenciaId, p_ruta: ruta, p_hash: hash, p_bytes: bytes, p_ancho: ancho, p_alto: alto, p_hora_cliente: new Date().toISOString(),
  })
}

export const abrirCajon = ({ sucursalId, caja = null, motivo = null, id = nuevoId(), origen = 'manual' }) =>
  rpc('ctl_cajon_abrir', { p_sucursal: sucursalId, p_caja: caja, p_motivo: motivo, p_hora_cliente: new Date().toISOString(), p_origen: origen, p_id: id })

export const puedeVender = sucursalId => rpc('ctl_puede_vender', { p_sucursal: sucursalId })
export const entregaPendiente = turnoId => rpc('ctl_entrega_pendiente', { p_turno: turnoId })
