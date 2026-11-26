// RPC del motor de conteo (Etapa 2). Toda escritura va por RPC SECURITY DEFINER; la app no tiene INSERT/UPDATE/DELETE sobre ctl_*.
import { rpc, leer } from '../api'
import { nuevoIdCaptura } from './conteoCaptura.js'

export const iniciarSesion = (tipo, sucursalId, opciones = {}) => rpc('ctl_sesion_iniciar', { p_tipo: tipo, p_sucursal: sucursalId, p_opciones: opciones })
export const abrirSesion = sesionId => rpc('ctl_sesion_abrir', { p_sesion: sesionId })
export const capturarPartida = ({ id = nuevoIdCaptura(), sesionId, codigo, cantidad, precioEtiqueta = null, serie = null, sello = null, selloIntacto = null, nota = null, horaCliente = new Date().toISOString(), clasificacion = null }) =>
  rpc('ctl_capturar_partida', {
    p_id: id, p_sesion: sesionId, p_codigo: codigo, p_cantidad: cantidad, p_precio_etiqueta: precioEtiqueta, p_numero_serie: serie, p_folio_sello: sello,
    p_sello_intacto: selloIntacto, p_nota: nota, p_hora_cliente: horaCliente, p_clasificacion: clasificacion,
  })
export const cerrarSesion = sesionId => rpc('ctl_sesion_cerrar', { p_sesion: sesionId })
export const cancelarSesion = (sesionId, motivo = null) => rpc('ctl_sesion_cancelar', { p_sesion: sesionId, p_motivo: motivo })
export const detalleSesion = sesionId => rpc('ctl_sesion_detalle', { p_sesion: sesionId })
export const lanzarRemota = ({ sucursales = null, muestra = null, limiteMin = null, incluirRecientes = false, motivo = null }) =>
  rpc('ctl_remota_lanzar', { p_sucursales: sucursales, p_muestra: muestra, p_limite_min: limiteMin, p_incluir_recientes: incluirRecientes, p_motivo: motivo })
export const avanceRemota = grupoId => rpc('ctl_remota_avance', { p_grupo: grupoId ?? null })
export const listarRemotas = (limite = 20) => rpc('ctl_remota_listar', { p_limite: limite })
export const expirarVencidas = () => rpc('ctl_sesiones_expirar')
export const entregaPendiente = turnoId => rpc('ctl_entrega_pendiente', { p_turno: turnoId })
export const verRelevo = entregaId => rpc('ctl_relevo_ver', { p_entrega: entregaId })
export const aceptarRelevo = (entregaId, pin) => rpc('ctl_relevo_aceptar', { p_entrega: entregaId, p_pin: pin })
export const listarEntregas = ({ sucursalId = null, estado = null, limite = 100 } = {}) => rpc('ctl_entregas_listar', { p_sucursal: sucursalId, p_estado: estado, p_limite: limite })
export const custodiaActual = sucursalId => rpc('ctl_custodia_actual', { p_sucursal: sucursalId })

/** Sesiones visibles para quien captura (RLS de la base): sin cifras calculadas. */
export const listarSesiones = (limite = 100) => leer('ctl_sesion_conteo', { sedeCol: false, orden: [{ columna: 'abierta_en', asc: false }], limite })
/** La lista de lo que se pidió contar (se guarda antes de mostrarse). */
export const listaDeSesion = sesionId => leer('ctl_lista_solicitada', { sedeCol: false, filtros: { sesion_id: sesionId }, orden: [{ columna: 'orden' }], limite: 500 })
