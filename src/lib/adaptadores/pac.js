// Adaptador del PAC (timbrado CFDI 4.0). SIN LLAVE: modo `simulado` explícito; el comprobante simulado NO tiene validez fiscal (P-061).
// El timbrado simulado lo hace la RPC timbrar_factura_simulado (UUID sintético). El real requiere una función de servidor
// que llame al PAC con el CSD de la clínica y registre el resultado con servicio_marcar_timbrada.
import { rpc, leer } from '../api'

export const PAC_AVISO = 'Modo simulado: sin llave de PAC. Los CFDI que se timbran aquí NO tienen validez fiscal.'

/** Lee el modo configurado del PAC (pac_configuracion); si no hay configuración, es simulado. */
export async function modoPac() {
  const { data } = await leer('pac_configuracion', { sedeCol: false, limite: 1 })
  const modo = data?.[0]?.modo
  return { modo: !modo || modo === 'no_configurado' || modo === 'simulado' ? 'simulado' : modo, proveedor: data?.[0]?.proveedor ?? 'por_definir', csdVigencia: data?.[0]?.csd_vigencia ?? null }
}

/** Timbra una factura en borrador. En modo simulado usa timbrar_factura_simulado; otros modos aún no existen. */
export async function timbrar(facturaId) {
  const { modo } = await modoPac()
  if (modo !== 'simulado') return { ok: false, error: `El modo «${modo}» del PAC requiere la función de servidor de timbrado (pendiente).`, simulado: false }
  const { data, error } = await rpc('timbrar_factura_simulado', { p_factura: facturaId })
  if (error) return { ok: false, error: error.message, simulado: true }
  return { ok: true, uuid: data, simulado: true }
}

/** Solicita la cancelación SAT (cfdi_cancelaciones). En simulado la respuesta del SAT/receptor se simula con acciones manuales. */
export const ESTADOS_CANCELACION = { solicitada: 'Solicitada', esperando_aceptacion: 'Esperando aceptación del receptor', aceptada: 'Aceptada', rechazada: 'Rechazada' }
