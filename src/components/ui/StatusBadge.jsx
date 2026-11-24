// Insignia de estado. Mapea los estados de MODELO_ESTADOS.md / esquema a colores del semáforo.
// v = verde · a = ámbar · r = rojo · b = azul · m = morado de marca · n = neutro
const MAPA = {
  // verdes
  activo: 'v', activa: 'v', atendida: 'v', confirmada: 'v', pagada: 'v', cobrada: 'v', validado: 'v', validado_cfdi: 'v', conciliado: 'v',
  guardado: 'v', guardada: 'v', recibido_completo: 'v', recibida: 'v', publicado: 'v', ok: 'v', liberado: 'v', timbrada: 'v', vigente: 'v',
  firmada: 'v', firmado: 'v', cerrada: 'v', cerrado: 'v', resuelta: 'v', aprobada: 'v', autorizada: 'v', completada: 'v', completado: 'v', repuesto: 'v', entregada: 'v', listo: 'v', terminada: 'v',
  // ámbar
  pendiente: 'a', por_validar: 'a', parcial: 'a', por_vencer: 'a', en_el_minimo: 'a', caduca_pronto: 'a', ambiguo: 'a', recibido_con_diferencias: 'a',
  recibida_parcial: 'a', programada: 'a', en_elaboracion: 'a', liberado_condicionado: 'a', por_firmar: 'a', abierta: 'a', en_proceso: 'a', espera: 'a', en_espera: 'a', sobrecupo: 'a', procesando: 'a', reabierto: 'a',
  // rojos
  vencida: 'r', vencido: 'r', bajo_minimo: 'r', sin_existencia: 'r', observado: 'r', bloqueado: 'r', suspendida: 'r', rechazada: 'r', no_asistio: 'r', en_mora: 'r', ilegible: 'r', error: 'r', fallida: 'r', rechazado: 'r',
  // azules
  prueba: 'b', enviado: 'b', enviada: 'b', detectado: 'b', sugerido: 'b', en_sala: 'b', en_atencion: 'b', reciente: 'b', nuevo: 'b', nueva: 'b', agendada: 'b', reservada: 'b',
  // neutros
  inactivo: 'n', cancelada: 'n', cancelado: 'n', anulado: 'n', anulada: 'n', borrador: 'n', baja: 'n', es_gasto: 'n', sin_cobro: 'n', sin_anticipo: 'n', reprogramada: 'n',
}
const normalizar = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_')
const etiqueta = s => { const t = String(s ?? '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }

export const varianteDeEstado = e => MAPA[normalizar(e)] ?? 'n'

/**
 * @param estado   valor del estado tal cual viene de la BD ('por_validar')
 * @param label    texto a mostrar (por defecto, el estado en forma legible)
 * @param variante fuerza el color: 'v' | 'a' | 'r' | 'b' | 'm' | 'n'
 * (`status` se acepta como alias de `estado` por compatibilidad con IRP)
 */
export default function StatusBadge({ estado, status, label, variante }) {
  const e = estado ?? status
  const v = variante ?? varianteDeEstado(e)
  return <span className={`bd ${v}`}>{label ?? etiqueta(e)}</span>
}
