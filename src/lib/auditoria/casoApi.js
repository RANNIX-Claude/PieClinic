// RPC de casos de diferencia (Etapa 3). Toda escritura va por RPC SECURITY DEFINER; la app no tiene INSERT/UPDATE/DELETE sobre ctl_caso ni ctl_caso_bitacora,
// y NO existe una RPC para crear un caso a mano (siempre nace de una captura). Todas devuelven { data, error } (lib/api.js).
import { rpc, leer } from '../api'
import { supabase } from '../supabase'
import { BUCKETS } from '../urlFirmada'

export const listarCasos = (filtros = {}) => rpc('ctl_casos_listar', { p_filtros: filtros })
export const detalleCaso = casoId => rpc('ctl_caso_detalle', { p_caso: casoId })
export const reportesCasos = ({ desde = null, hasta = null, sucursalId = null } = {}) => rpc('ctl_casos_reportes', { p_desde: desde, p_hasta: hasta, p_sucursal: sucursalId })

export const tomarCaso = (casoId, fechaCompromiso = null, nota = null) => rpc('ctl_caso_tomar', { p_caso: casoId, p_fecha_compromiso: fechaCompromiso, p_nota: nota })
export const asignarCaso = (casoId, usuarioId, fechaCompromiso, nota = null) => rpc('ctl_caso_asignar', { p_caso: casoId, p_usuario: usuarioId, p_fecha_compromiso: fechaCompromiso, p_nota: nota })
export const comentarCaso = (casoId, texto) => rpc('ctl_caso_comentar', { p_caso: casoId, p_texto: texto })
export const guardarCierreCaso = ({ casoId, causaId, responsable, monto, nota = null }) =>
  rpc('ctl_caso_guardar_cierre', { p_caso: casoId, p_causa: causaId, p_responsable: responsable, p_monto: monto, p_nota: nota })
export const cerrarSinAjuste = ({ casoId, causaId, resolucion, responsable = null, monto = 0 }) =>
  rpc('ctl_caso_cerrar_sin_ajuste', { p_caso: casoId, p_causa: causaId, p_resolucion: resolucion, p_responsable: responsable, p_monto: monto })
export const rechazarCaso = (casoId, motivo) => rpc('ctl_caso_rechazar', { p_caso: casoId, p_motivo: motivo })
export const volverAInvestigar = (casoId, motivo) => rpc('ctl_caso_volver_a_investigar', { p_caso: casoId, p_motivo: motivo })
/** Autorizar el ajuste exige la CONTRASEÑA completa de la cuenta (re-autenticación en el servidor); el PIN no sirve. */
export const autorizarAjuste = (casoId, contrasena) => rpc('ctl_autorizar_ajuste', { p_caso: casoId, p_password: contrasena })
export const reintentarAjuste = (casoId, contrasena) => rpc('ctl_reintentar_ajuste', { p_caso: casoId, p_password: contrasena })

/**
 * Evidencia del caso (foto de remisión, nota de compra): se sube el JPEG comprimido al bucket privado y luego se registra con su hash.
 * No hay camino de galería: la imagen viene de la cámara en vivo (casos/CamaraEvidencia.jsx).
 */
export async function adjuntarEvidencia({ casoId, organizacionId, sucursalId, blob, hash, ancho, alto, nota = null, horaCliente = new Date().toISOString() }) {
  const id = globalThis.crypto.randomUUID()
  const ruta = `${organizacionId}/ctl/${sucursalId}/${id}.jpg`
  const { error: e1 } = await supabase.storage.from(BUCKETS.auditoria).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
  if (e1) return { data: null, error: e1 }
  return rpc('ctl_caso_adjuntar_evidencia', { p_caso: casoId, p_id: id, p_ruta: ruta, p_hash: hash, p_bytes: blob.size, p_ancho: ancho, p_alto: alto, p_hora_cliente: horaCliente, p_nota: nota })
}

/** Catálogos de apoyo (RLS: dueño y supervisor). */
export const listarCausas = () => leer('ctl_causa', { sedeCol: false, filtros: { activo: true }, orden: [{ columna: 'orden' }], limite: 100 })
export const listarInvestigadores = () => leer('v_ctl_usuarios', { sedeCol: false, filtros: { activo: true, rol_origen: ['administrador', 'supervisor'] }, orden: [{ columna: 'nombre' }], limite: 200 })
