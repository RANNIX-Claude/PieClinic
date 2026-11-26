// Acceso a datos del módulo de auditoría. Se LEE de tablas/vistas ctl_* (RLS por rol) y se ESCRIBE solo por RPC (la app no tiene INSERT/UPDATE/DELETE).
import { rpc, leer } from '../api'
import { mensajeError } from './roles'

export const miRolAuditoria = () => rpc('ctl_mi_rol')
export const configEfectiva = sucursalId => rpc('ctl_config_efectiva', { p_sucursal: sucursalId ?? null })
export const guardarParametro = ({ clave, sucursalId, valor, confirmoDueno = false, motivo = null }) =>
  rpc('ctl_config_guardar', { p_clave: clave, p_sucursal: sucursalId ?? null, p_valor: valor, p_confirmo_dueno: confirmoDueno, p_motivo: motivo })
export const restablecerParametro = ({ clave, sucursalId, motivo = null }) => rpc('ctl_config_restablecer', { p_clave: clave, p_sucursal: sucursalId, p_motivo: motivo })
export const valorEn = ({ clave, sucursalId, fecha }) => rpc('ctl_config_valor_en', { p_clave: clave, p_sucursal: sucursalId ?? null, p_fecha: fecha })
export const guardarCausa = ({ id = null, nombre, requiereNota = false, activo = true }) => rpc('ctl_causa_guardar', { p_id: id, p_nombre: nombre, p_requiere_nota: requiereNota, p_activo: activo })
export const guardarPuntoControl = (id, datos) => rpc('ctl_punto_control_guardar', { p_id: id ?? null, p_datos: datos })
export const activarCustodia = (sucursalId, productoId) => rpc('ctl_custodia_activar', { p_sucursal: sucursalId, p_producto: productoId })
export const desactivarCustodia = (sucursalId, productoId) => rpc('ctl_custodia_desactivar', { p_sucursal: sucursalId, p_producto: productoId })
export const registrarConsulta = (reporte, filtros = {}) => rpc('ctl_registrar_consulta', { p_reporte: reporte, p_filtros: filtros })
export const huecosDeFolio = () => rpc('ctl_huecos_folios')

/** Lectura de una tabla o vista del módulo (sin filtro de sede automático: las políticas RLS ya filtran). */
export const listar = (tabla, o = {}) => leer(tabla, { sedeCol: false, ...o })
export { mensajeError }
