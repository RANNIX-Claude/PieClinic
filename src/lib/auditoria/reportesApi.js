// RPC de reportes, tablero y alertas (Etapa 6). Solo lectura salvo marcar alertas, guardar reglas y destinatarios (todo por RPC SECURITY DEFINER; la app no tiene INSERT/UPDATE).
// Todas devuelven { data, error } (lib/api.js). Cada consulta de un reporte queda registrada en la bitácora de consultas por el servidor (no depende de esta capa).
import { rpc } from '../api'

export const opcionesReportes = () => rpc('ctl_reportes_opciones')
export const consultarDiferencias = (filtros = {}) => rpc('ctl_dif_consultar', { p_filtros: filtros })
export const tableroDueno = (dias = 30) => rpc('ctl_tablero', { p_dias: dias })

export const repVentasBajoCatalogo = (filtros = {}) => rpc('ctl_rep_ventas_bajo_catalogo', { p_filtros: filtros })
export const repCajonSinVenta = (filtros = {}) => rpc('ctl_rep_cajon', { p_filtros: filtros })
export const repMezclaPago = (filtros = {}) => rpc('ctl_rep_mezcla_pago', { p_filtros: filtros })
export const reporteMensual = (mes = null) => rpc('ctl_reporte_mensual', { p_mes: mes })

export const bitacoraConsultas = (filtros = {}) => rpc('ctl_bitacora_consultas_listar', { p_filtros: filtros })
export const resumenRetencion = () => rpc('ctl_retencion_resumen')

export const listarAlertas = (filtros = {}) => rpc('ctl_alertas_listar', { p_filtros: filtros })
export const atenderAlertas = (ids, estado = 'atendida', nota = null) => rpc('ctl_alerta_atender', { p_alertas: ids, p_estado: estado, p_nota: nota })
export const reglasAlertas = () => rpc('ctl_alertas_reglas')
export const guardarReglaAlerta = ({ tipo, canales, destinatarios, inmediata, activa = true, motivo = null }) =>
  rpc('ctl_alerta_regla_guardar', { p_tipo: tipo, p_canales: canales, p_destinatarios: destinatarios, p_inmediata: inmediata, p_activa: activa, p_motivo: motivo })
export const destinatariosAlertas = () => rpc('ctl_alerta_destinatarios_listar')
export const guardarDestinatario = ({ usuario, techo, recibir = true, motivo = null }) =>
  rpc('ctl_alerta_destinatario_guardar', { p_usuario: usuario, p_techo: techo, p_recibir: recibir, p_motivo: motivo })
export const enviosAlertas = (filtros = {}) => rpc('ctl_alertas_envios_listar', { p_filtros: filtros })
export const evaluarAlertasAhora = () => rpc('ctl_alertas_evaluar_ahora')
export const generarResumenDiario = (fecha = null) => rpc('ctl_resumen_diario_ahora', { p_fecha: fecha })
