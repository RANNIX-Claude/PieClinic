// Parámetros del módulo: espejo local de ctl_config_def (migración 200) para validar en pantalla ANTES de enviar.
// Los topes son del SISTEMA y los hace cumplir un trigger de la base: aquí solo se evita el viaje de ida y vuelta.
export const TOPE_CUSTODIA = 30

export const DEFINICIONES = {
  frecuencia_conteo_completo: { tipo: 'texto', omision: 'diario_apertura', opciones: ['diario_apertura', 'semanal', 'solo_manual'] },
  muestra_aleatoria: { tipo: 'num', omision: 20, minimo: 1, tope: 100 },
  tolerancia_efectivo: { tipo: 'num', omision: 20, minimo: 0 },
  tolerancia_kits: { tipo: 'num', omision: 0, minimo: 0, confirmaDueno: true },
  tolerancia_precio_etiqueta: { tipo: 'num', omision: 0, minimo: 0 },
  descuento_sin_clave_pct: { tipo: 'num', omision: 0, minimo: 0, tope: 15 },
  dias_gracia_precio: { tipo: 'num', omision: 30, minimo: 0, tope: 90 },
  retencion_fotos_dias: { tipo: 'num', omision: 90, minimo: 1, tope: 365 },
  foto_lado_largo_px: { tipo: 'num', omision: 1600, minimo: 320, tope: 2400 },
  auditoria_remota_limite_min: { tipo: 'num', omision: 120, minimo: 1 },
  ocupacion_min_min: { tipo: 'num', omision: 5, minimo: 0 },
  cancelacion_ventana_dias: { tipo: 'num', omision: 7, minimo: 1 },
  sustitucion_relacion_costo: { tipo: 'num', omision: 3, minimo: 1 },
  alertas_techo_diario: { tipo: 'num', omision: 10, minimo: 1 },
  aleatoria_excluir_horas: { tipo: 'num', omision: 24, minimo: 0, tope: 168 },
  relevo_espera_min: { tipo: 'num', omision: 30, minimo: 1, tope: 480 },
  relevo_ventana_horas: { tipo: 'num', omision: 12, minimo: 1, tope: 48 },
  sello_peso_tolerancia_pct: { tipo: 'num', omision: 5, minimo: 0, tope: 25 },
  caidas_frecuentes_n: { tipo: 'num', omision: 3, minimo: 2 },
  caidas_ventana_dias: { tipo: 'num', omision: 30, minimo: 7, tope: 180 },
  caida_baja_venta_pct: { tipo: 'num', omision: 50, minimo: 1, tope: 100 },
  // Etapa 1 · cambios en el origen (la Caja): interruptores 0/1 que nacen apagados y espera de la cancelación
  precio_abierto_con_clave: { tipo: 'num', omision: 0, minimo: 0, tope: 1 },
  descuento_motivo_cerrado: { tipo: 'num', omision: 0, minimo: 0, tope: 1 },
  cancelacion_con_bloqueo: { tipo: 'num', omision: 0, minimo: 0, tope: 1 },
  cancelacion_espera_seg: { tipo: 'num', omision: 60, minimo: 10, tope: 600 },
}

/**
 * Valida un valor contra la definición (la de la base si se la pasa, si no la local).
 * @returns {{ok:boolean, error?:string, requiereConfirmacion?:boolean}}
 */
export function validarParametro(clave, valor, def = DEFINICIONES[clave]) {
  if (!def) return { ok: false, error: 'Parámetro desconocido' }
  if (def.tipo === 'texto') return def.opciones?.includes(valor) ? { ok: true } : { ok: false, error: `Debe ser uno de: ${(def.opciones ?? []).join(', ')}` }
  const n = Number(valor)
  if (valor === '' || valor == null || !Number.isFinite(n)) return { ok: false, error: 'Escribe un número' }
  const minimo = def.minimo ?? null
  const tope = def.tope ?? null
  if (minimo != null && n < minimo) return { ok: false, error: `No puede ser menor a ${minimo}` }
  if (tope != null && n > tope) return { ok: false, error: `El tope del sistema es ${tope}. No se puede superar: un control que toma demasiado tiempo se captura sin contar.` }
  const confirma = !!(def.confirmaDueno ?? def.confirma_dueno)
  if (confirma && n > 0) return { ok: true, requiereConfirmacion: true }
  return { ok: true }
}

/** ¿Cabe otro producto en la custodia de la sucursal? (`activos` = los activos hoy). */
export function puedeAgregarCustodia(activos) {
  if (activos >= TOPE_CUSTODIA) return { ok: false, error: `Máximo ${TOPE_CUSTODIA} productos en custodia por sucursal: con más, el relevo pasa de dos minutos a veinte y se termina capturando sin contar (evidencia falsa).` }
  return { ok: true }
}
