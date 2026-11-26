// Acceso a datos del CONTROL DE SERVICIOS (Etapa 8). Se escribe SOLO por RPC (la app no tiene INSERT/UPDATE/DELETE en ctl_*); la hora la pone el servidor.
// Los reportes (sin cobro, cuadre de insumos, cruce de ocupación) son de dueño y supervisor: a un rol de sucursal el servidor le responde PF403.
import { rpc } from '../api'
import { horaClienteISO } from './hora'
import { nuevoId } from './apiCierres'

// ── captura (sucursal) ──
export const abrirAtencion = ({ id = nuevoId(), sucursalId, servicioId, pacienteRef = null, atiendeId = null }) =>
  rpc('ctl_atencion_abrir', { p_id: id, p_sucursal: sucursalId, p_servicio: servicioId, p_paciente_ref: pacienteRef || null, p_atiende: atiendeId || null, p_hora_cliente: horaClienteISO() })
export const ticketsCandidatos = atencionId => rpc('ctl_atencion_tickets_candidatos', { p_atencion: atencionId })
export const cerrarAtencionConTicket = ({ atencionId, ticketId }) => rpc('ctl_atencion_cerrar_con_ticket', { p_atencion: atencionId, p_ticket: ticketId })
export const supervisoresDe = sucursalId => rpc('ctl_atencion_supervisores', { p_sucursal: sucursalId })
export const cancelarAtencion = ({ atencionId, motivo, supervisorId, pin }) => rpc('ctl_atencion_cancelar', { p_atencion: atencionId, p_motivo: motivo, p_supervisor: supervisorId, p_pin: pin })
export const listarAtenciones = (filtros = {}) => rpc('ctl_atenciones_listar', { p_filtros: filtros })
export const conciliarAtenciones = (sucursalId = null) => rpc('ctl_atenciones_conciliar', { p_sucursal: sucursalId })
export const registrarOcupacion = ({ id = nuevoId(), sucursalId, inicio, fin, puestoNombre = null }) =>
  rpc('ctl_ocupacion_registrar', { p_id: id, p_sucursal: sucursalId, p_inicio: inicio, p_fin: fin, p_puesto: null, p_puesto_nombre: puestoNombre || null, p_hora_cliente: horaClienteISO() })

// ── reportes (dueño y supervisor) ──
export const repAtencionesSinCobro = (filtros = {}) => rpc('ctl_rep_atenciones_sin_cobro', { p_filtros: filtros })
export const repCuadreInsumos = (filtros = {}) => rpc('ctl_rep_cuadre_insumos', { p_filtros: filtros })
export const cruceOcupacionServidor = (filtros = {}) => rpc('ctl_ocupacion_cruce', { p_filtros: filtros })
export const evaluarServicios = () => rpc('ctl_servicios_evaluar_ahora')
