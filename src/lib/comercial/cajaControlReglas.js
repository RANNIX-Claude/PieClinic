// Reglas PURAS de los controles de Caja (Etapa 1): sin dependencias, probadas en cajaControl.test.mjs. El servidor hace cumplir todo (migraciones 290–293).
/** Valores por omisión cuando todavía no se leen los parámetros (todo lo que cambia la operación nace apagado). */
export const PARAMETROS_CAJA_OMISION = Object.freeze({
  precio_abierto_con_clave: false, descuento_motivo_cerrado: false, descuento_sin_clave_pct: 0, cancelacion_con_bloqueo: false, cancelacion_espera_seg: 60,
  motivos_descuento: [], motivos_cancelacion: [], autorizadores: [],
})

/** Tope de descuento sin clave: el del catálogo cerrado (ctl_config, 0 % por omisión) si está activo; si no, el 10 % libre de siempre. */
export const topeSinClave = (params, maxPctLibre = 10) => (params?.descuento_motivo_cerrado ? Number(params.descuento_sin_clave_pct ?? 0) : Number(maxPctLibre))

/** ¿Este descuento necesita clave? El dueño que opera la caja no la necesita (mismo criterio que la base). */
export const descuentoNecesitaClave = ({ pct, params, maxPctLibre = 10, esAdmin = false, autorizado = false }) =>
  !esAdmin && !autorizado && Number(pct) > topeSinClave(params, maxPctLibre) + 0.005

/** ¿El precio cotizado de esta línea necesita la clave de un supervisor? Solo con el parámetro encendido y para líneas de precio abierto. */
export const precioNecesitaClave = ({ linea, params, esAdmin = false }) =>
  !!params?.precio_abierto_con_clave && !esAdmin && !!linea?.editable && Number(linea?.precio_unitario) > 0 && !linea?.aut_precio

/** ¿El precio de esta línea lo puede teclear el cajero? Las líneas de catálogo NUNCA; las abiertas, solo con la clave cuando el parámetro lo pide. */
export const precioEditable = ({ linea }) => !!linea?.editable && !linea?.admite_caracteristicas

/** Normaliza lo que entrega el lector de código de barras (o el teclado). */
export const normalizarCodigo = s => String(s ?? '').trim().toLowerCase()

/** Piezas que deben escanearse: una por unidad (la base exige lo mismo). */
export const piezasRequeridas = productos => (productos ?? []).reduce((a, p) => a + Math.max(1, Math.ceil(Number(p.cantidad) || 1)), 0)

/** Segundos que faltan para que venza la espera (nunca negativo). */
export const segundosRestantes = (venceEn, ahoraMs = Date.now()) => Math.max(0, Math.ceil((new Date(venceEn).getTime() - ahoraMs) / 1000))
export const formatoCuenta = seg => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`

/** ¿Qué muestra la pantalla de una solicitud según su estado? */
export function textoEstadoCancelacion(estado) {
  return ({
    pendiente: 'Pendiente de validar: la pieza aún NO vuelve al inventario.',
    pendiente_de_validacion: 'Venció la espera sin respuesta: queda pendiente de validación (la pieza no volvió al inventario). Se puede validar ahora con pieza, foto y clave.',
    autorizada: 'Autorizada: el ticket quedó cancelado y la pieza volvió al inventario.',
    rechazada: 'Rechazada: la venta queda firme.',
  })[estado] ?? estado
}

/** Une los dos contratos de relevo en un solo aviso para el cajero (sin montos ni diferencias). */
export function avisoEntregaPendiente(puede, pendiente) {
  if (puede && puede.puede === false) return puede.motivo || 'El turno anterior no ha sido aceptado.'
  if (pendiente && pendiente.bloquea) return pendiente.motivo || 'El turno anterior no ha sido aceptado.'
  return null
}

/** Quita el prefijo técnico de los errores de control para mostrarlos legibles. */
export const textoControl = msg => String(msg ?? '').replace(/^(PF\d+:\s*)?(precio_no_editable|precio_abierto_requiere_clave|descuento_motivo_cerrado|descuento_requiere_pin|cancelacion_con_bloqueo):\s*/i, '')

