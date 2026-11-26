// Acceso a datos de CIERRES (Etapa 4). Se escribe SOLO por RPC (la app no tiene INSERT/UPDATE/DELETE en ctl_*); la hora de cada captura la pone el servidor.
// Las respuestas a quien captura no traen esperado ni diferencia (se prueba en scripts/test-auditoria-cierres-qa.mjs).
import { rpc } from '../api'
import { supabase } from '../supabase'
import { BUCKETS } from '../urlFirmada'
import { horaClienteISO } from './hora'
import { listar } from './api'

const nuevoId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
export { nuevoId }

// ── captura (sucursal) ──
export const abrirCierre = ({ id = nuevoId(), sucursalId, tipo, turnoId = null }) =>
  rpc('ctl_cierre_abrir', { p_id: id, p_sucursal: sucursalId, p_tipo: tipo, p_turno: turnoId, p_hora_cliente: horaClienteISO() })
export const recorridoCierre = cierreId => rpc('ctl_cierre_recorrido', { p_cierre: cierreId })
/** Un punto: `valor` (número o piezas) o `denominaciones` [{denominacion, cantidad}] (nunca un total). `id` = id de cliente (reenvío idempotente). */
export const capturarPunto = ({ id = nuevoId(), cierreId, puntoId, valor = null, denominaciones = null }) =>
  rpc('ctl_cierre_capturar', { p_id: id, p_cierre: cierreId, p_punto: puntoId, p_valor: valor, p_denominaciones: denominaciones, p_hora_cliente: horaClienteISO() })
export const cerrarCierre = ({ cierreId, conEntrega = null, montoConfirmado = null }) =>
  rpc('ctl_cierre_cerrar', { p_cierre: cierreId, p_con_entrega: conEntrega, p_monto_confirmado: montoConfirmado, p_hora_cliente: horaClienteISO() })
export const guiaToma = tomaId => rpc('ctl_toma_guia', { p_toma: tomaId })
export const ladoLargoFoto = sucursalId => rpc('ctl_foto_lado_largo', { p_sucursal: sucursalId })

/** Sube la foto comprimida al bucket privado y la registra (el servidor sella la hora y calcula la alerta por hash repetido). No existe camino de galería. */
export async function subirFotoCierre({ organizacionId, sucursalId, cierreId, puntoId, tomaId = null, blob, ancho, alto, hash }) {
  const id = nuevoId()
  const ruta = `${organizacionId}/ctl/${sucursalId}/${id}.jpg`
  const up = await supabase.storage.from(BUCKETS.auditoria).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) return { data: null, error: up.error }
  return rpc('ctl_cierre_foto', {
    p_evidencia_id: id, p_cierre: cierreId, p_punto: puntoId, p_ruta: ruta, p_hash: hash, p_bytes: blob.size, p_ancho: ancho, p_alto: alto, p_toma_fija: tomaId, p_hora_cliente: horaClienteISO(),
  })
}

// ── entrega de turno ──
export const puedeVender = sucursalId => rpc('ctl_puede_vender', { p_sucursal: sucursalId })
export const entregasPendientes = (sucursalId = null) => rpc('ctl_entregas_pendientes', { p_sucursal: sucursalId })
export const aceptarEntrega = ({ entregaId, pin, montoContado = null, denominaciones = null }) =>
  rpc('ctl_entrega_aceptar', { p_entrega: entregaId, p_pin: pin, p_monto_contado: montoContado, p_denominaciones: denominaciones, p_hora_cliente: horaClienteISO() })
export const liberarEntrega = (entregaId, motivo) => rpc('ctl_entrega_liberar', { p_entrega: entregaId, p_motivo: motivo })

// ── revisión (dueño y supervisor) ──
export const listarCierres = ({ sucursalId = null, desde = null, hasta = null, tipo = null, estado = null, limite = 100 } = {}) =>
  rpc('ctl_cierres_listar', { p_sucursal: sucursalId, p_desde: desde, p_hasta: hasta, p_tipo: tipo, p_estado: estado, p_limite: limite })
export const detalleCierre = cierreId => rpc('ctl_cierre_detalle', { p_cierre: cierreId })
export const paresToma = ({ sucursalId = null, desde = null, hasta = null, limite = 60 } = {}) => rpc('ctl_pares_toma', { p_sucursal: sucursalId, p_desde: desde, p_hasta: hasta, p_limite: limite })

// ── configuración (dueño) ──
export const formulasEsperado = () => listar('ctl_formula_esperado', { orden: [{ columna: 'orden', asc: true }], limite: 50 })
export const guardarToma = ({ id = null, sucursalId, nombre, aplica = 'ambos', activa = true, orden = 100 }) =>
  rpc('ctl_toma_fija_guardar', { p_id: id, p_sucursal: sucursalId, p_nombre: nombre, p_aplica: aplica, p_activa: activa, p_orden: orden })
export const guardarConsumo = ({ servicioId, insumoId, cantidad, activo = true }) =>
  rpc('ctl_consumo_esperado_guardar', { p_servicio: servicioId, p_insumo: insumoId, p_cantidad: cantidad, p_activo: activo })
