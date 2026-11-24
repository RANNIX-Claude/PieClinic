import { rpc } from './api'

/**
 * Registra una acción en la bitácora (RPC public.registrar_bitacora).
 * accion: 'ver' | 'imprimir' | 'exportar' | 'iniciar_sesion' | 'insertar' | 'actualizar' | 'borrar'
 * Los INSERT/UPDATE/DELETE de tablas clínicas y financieras ya los audita un trigger; desde la app se registran
 * las LECTURAS de expediente, impresiones y exportaciones. Nunca rompe la pantalla: si falla, solo avisa en consola.
 */
export async function registrarBitacora(accion, entidad, entidadId = null, detalle = {}, sedeId = null) {
  // «Desde dónde»: dispositivo, pantalla y navegador acompañan cada evento que se registra desde la app.
  const origen = typeof window === 'undefined' ? {} : {
    dispositivo: window.innerWidth < 768 ? 'móvil' : 'escritorio', ruta: window.location.pathname, navegador: (navigator.userAgent || '').slice(0, 120),
  }
  const { error } = await rpc('registrar_bitacora', {
    p_accion: accion, p_entidad: entidad, p_entidad_id: entidadId == null ? null : String(entidadId),
    p_detalle: { ...(detalle ?? {}), origen }, p_sede: sedeId,
  })
  if (error && error.code !== 'SIN_CONEXION') console.warn('[bitácora] no se registró:', accion, entidad, error.message)
  return !error
}

export const bitacoraVer = (entidad, id, detalle, sedeId) => registrarBitacora('ver', entidad, id, detalle, sedeId)
export const bitacoraImprimir = (entidad, id, detalle, sedeId) => registrarBitacora('imprimir', entidad, id, detalle, sedeId)
export const bitacoraExportar = (entidad, detalle, sedeId) => registrarBitacora('exportar', entidad, null, detalle, sedeId)
