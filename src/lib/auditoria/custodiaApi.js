// Acceso a datos de la CADENA DE CUSTODIA (Etapa 7). Se escribe SOLO por RPC (la app no tiene INSERT/UPDATE/DELETE en ctl_*); la hora la pone el servidor.
// A quien captura nunca le llega saldo, existencia, peso esperado ni lo que el sistema espera vender (se prueba en scripts/test-auditoria-custodia-qa.mjs).
import { rpc } from '../api'
import { supabase } from '../supabase'
import { BUCKETS } from '../urlFirmada'
import { horaClienteISO } from './hora'
import { listar } from './api'
import { nuevoId } from './apiCierres'

export { nuevoId }

/**
 * Sube la foto EN VIVO (ya comprimida) al bucket privado y la registra con el origen que se declara. No existe camino de galería.
 * `origenId` es el id que tendrá el registro al que pertenece la foto (la recepción, el ticket, la auditoría…): se genera en el cliente ANTES de la foto.
 * @returns {Promise<{ id: string|null, error: any }>} id de la evidencia
 */
export async function subirEvidencia({ organizacionId, sucursalId, tipoOrigen, origenId, blob, ancho, alto, hash }) {
  const id = nuevoId()
  const ruta = `${organizacionId}/ctl/${sucursalId}/${id}.jpg`
  const up = await supabase.storage.from(BUCKETS.auditoria).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) return { id: null, error: up.error }
  const r = await rpc('ctl_evidencia_registrar', {
    p_id: id, p_sucursal: sucursalId, p_tipo_origen: tipoOrigen, p_origen_id: origenId, p_ruta: ruta, p_hash: hash,
    p_bytes: blob.size, p_ancho: ancho, p_alto: alto, p_hora_cliente: horaClienteISO(), p_toma_fija: null,
  })
  if (r.error) return { id: null, error: r.error }
  return { id, error: null }
}

// ── catálogo de control (banderas) ──
export const guardarAtributos = ({ productoId, requiereSerie, requiereSello, altoValor, pesoCajaLlena = null }) =>
  rpc('ctl_producto_atributo_guardar', { p_producto: productoId, p_requiere_serie: !!requiereSerie, p_requiere_sello: !!requiereSello, p_alto_valor: !!altoValor, p_peso_caja_llena: pesoCajaLlena })
export const listarProductosControl = ({ busqueda = null, soloMarcados = false, limite = 100 } = {}) =>
  rpc('ctl_productos_control_listar', { p_busqueda: busqueda, p_solo_marcados: soloMarcados, p_limite: limite })

// ── sellos ──
export const colocarSello = ({ id = nuevoId(), sucursalId, folio, productoId, serie = null, evidenciaId = null }) =>
  rpc('ctl_sello_colocar', { p_id: id, p_sucursal: sucursalId, p_folio: folio, p_producto: productoId, p_serie: serie, p_evidencia: evidenciaId, p_hora_cliente: horaClienteISO() })
export const reabrirSello = ({ id = nuevoId(), selloAnteriorId, motivo, nuevoFolio, evidenciaId = null }) =>
  rpc('ctl_sello_reabrir', { p_id: id, p_sello_anterior: selloAnteriorId, p_motivo: motivo, p_nuevo_folio: nuevoFolio, p_evidencia: evidenciaId, p_hora_cliente: horaClienteISO() })
export const verificarSello = ({ id = nuevoId(), sucursalId, folio, intacto, peso = null, evidenciaId = null }) =>
  rpc('ctl_sello_verificar', { p_id: id, p_sucursal: sucursalId, p_folio: folio, p_intacto: intacto, p_peso: peso, p_evidencia: evidenciaId, p_hora_cliente: horaClienteISO() })
export const listarSellos = ({ sucursalId = null, estado = null, limite = 200 } = {}) =>
  listar('ctl_sello', { filtros: { sucursal_id: sucursalId, estado }, orden: [{ columna: 'colocado_en', asc: false }], limite })

// ── recepción con responsiva ──
export const registrarRecepcion = ({ id, sucursalId, documento = null, lineas, pin, nota = null }) =>
  rpc('ctl_recepcion_registrar', { p_id: id, p_sucursal: sucursalId, p_documento: documento, p_lineas: lineas, p_pin: pin, p_nota: nota, p_hora_cliente: horaClienteISO() })
export const listarRecepciones = ({ sucursalId = null, limite = 100 } = {}) =>
  listar('ctl_recepcion', { filtros: { sucursal_id: sucursalId }, orden: [{ columna: 'firmada_en', asc: false }], limite })
export const listarLineasRecepcion = (recepcionIds) =>
  listar('ctl_recepcion_linea', { filtros: { recepcion_id: recepcionIds }, orden: [{ columna: 'creado_en', asc: true }], limite: 1000 })
/** Productos que se pueden escanear en una recepción (sin precio, costo ni existencia). */
export const productosEscaneables = () => listar('ctl_producto_captura', { orden: [{ columna: 'descripcion', asc: true }], limite: 5000 })

// ── piezas de alto valor y custodia del relevo ──
export const registrarPieza = ({ id = nuevoId(), sucursalId, productoId, serie }) =>
  rpc('ctl_pieza_registrar', { p_id: id, p_sucursal: sucursalId, p_producto: productoId, p_serie: serie, p_hora_cliente: horaClienteISO() })
export const listarPiezas = ({ sucursalId = null, estado = null, limite = 500 } = {}) =>
  listar('ctl_pieza', { filtros: { sucursal_id: sucursalId, estado }, orden: [{ columna: 'alta_en', asc: false }], limite })
export const listarVentasAltoValor = ({ sucursalId = null, limite = 100 } = {}) =>
  listar('ctl_venta_alto_valor', { filtros: { sucursal_id: sucursalId }, orden: [{ columna: 'creado_en', asc: false }], limite })
export const revisarVentasAltoValor = (horas = 72) => rpc('ctl_alto_valor_revisar', { p_horas: horas })
export const estadoCustodia = sucursalId => rpc('ctl_custodia_estado', { p_sucursal: sucursalId })
export const incluirAltoValorEnCustodia = sucursalId => rpc('ctl_custodia_incluir_alto_valor', { p_sucursal: sucursalId })

// ── talonarios, tickets manuales y caídas ──
export const altaTalonario = ({ sucursalId, inicial, final, entregadoA = null, recibidoNombre = null, entregadoEn = null, nota = null }) =>
  rpc('ctl_talonario_alta', { p_sucursal: sucursalId, p_inicial: inicial, p_final: final, p_entregado_a: entregadoA, p_recibido_nombre: recibidoNombre, p_entregado_en: entregadoEn, p_nota: nota })
export const cancelarTalonario = (talonarioId, motivo) => rpc('ctl_talonario_cancelar', { p_talonario: talonarioId, p_motivo: motivo })
export const resumenTalonarios = (sucursalId = null) => rpc('ctl_talonario_resumen', { p_sucursal: sucursalId })
export const capturarTicketManual = ({ id, sucursalId, folio, monto, productos, evidenciaId, cancelado = false, fechaVenta = null, horaVenta = null, caidaId = null }) =>
  rpc('ctl_ticket_manual_capturar', {
    p_id: id, p_sucursal: sucursalId, p_folio: folio, p_monto: monto, p_productos: productos, p_evidencia: evidenciaId, p_cancelado: cancelado,
    p_fecha_venta: fechaVenta, p_hora_venta: horaVenta, p_caida: caidaId, p_hora_cliente: horaClienteISO(),
  })
export const listarTicketsManuales = ({ talonarioId = null, sucursalId = null, limite = 300 } = {}) =>
  listar('ctl_ticket_manual', { filtros: { talonario_id: talonarioId, sucursal_id: sucursalId }, orden: [{ columna: 'folio', asc: true }], limite })
export const auditarTalonario = ({ id = nuevoId(), talonarioId, siguiente, evidenciaId }) =>
  rpc('ctl_talonario_auditar', { p_id: id, p_talonario: talonarioId, p_siguiente: siguiente, p_evidencia: evidenciaId, p_hora_cliente: horaClienteISO() })
export const listarAuditoriasTalonario = (talonarioId = null) =>
  listar('ctl_talonario_auditoria', { filtros: { talonario_id: talonarioId }, orden: [{ columna: 'creado_en', asc: false }], limite: 100 })
export const iniciarCaida = ({ id = nuevoId(), sucursalId, inicio = null }) => rpc('ctl_caida_iniciar', { p_id: id, p_sucursal: sucursalId, p_inicio: inicio, p_hora_cliente: horaClienteISO() })
export const cerrarCaida = ({ caidaId, fin = null, nota = null }) => rpc('ctl_caida_cerrar', { p_caida: caidaId, p_fin: fin, p_nota: nota })
export const listarCaidas = ({ sucursalId = null, limite = 50 } = {}) => rpc('ctl_caidas_listar', { p_sucursal: sucursalId, p_limite: limite })
