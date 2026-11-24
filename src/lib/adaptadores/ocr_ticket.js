// Adaptador de lectura de tickets (OCR/IA) para gastos. SIN LLAVE: modo SIMULADO explícito.
// Jamás inventa datos: en modo simulado devuelve los campos vacíos y la persona los captura (P-126: la IA propone, una persona confirma).
// Con llave, la función servidor netlify/functions/ia-ticket.js (pendiente) lee la imagen y contesta { modo:'activo', ... }; la llave solo vive en el servidor.
import { llamarFuncion } from '../api'

export const MODO_OCR_TEXTO = 'Modo simulado: sin llave de IA. El ticket se guarda pero los datos se capturan a mano.'

/**
 * @param {string} archivoPath ruta en el bucket «comprobantes»
 * @returns {Promise<{modo:'simulado'|'activo', estado:'listo'|'ilegible', proveedor:string|null, total:number|null, fecha:string|null, folio:string|null, confianza:number|null, mensaje?:string}>}
 */
export async function leerTicket(archivoPath) {
  try {
    const r = await llamarFuncion('ia-ticket', { archivo_path: archivoPath })
    if (r.ok) {
      const j = await r.json()
      if (j.modo === 'activo') {
        const ilegible = j.total == null && !j.proveedor
        return { modo: 'activo', estado: ilegible ? 'ilegible' : 'listo', proveedor: j.proveedor ?? null, total: j.total ?? null, fecha: j.fecha ?? null, folio: j.folio ?? null, confianza: j.confianza ?? null }
      }
    }
  } catch { /* sin función servidor (desarrollo) */ }
  return { modo: 'simulado', estado: 'listo', proveedor: null, total: null, fecha: null, folio: null, confianza: null, mensaje: MODO_OCR_TEXTO }
}
