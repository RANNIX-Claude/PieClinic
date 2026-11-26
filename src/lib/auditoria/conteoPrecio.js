// Clasificación del precio de etiqueta (F2.6). Réplica en el cliente de la que hace el servidor al capturar (migración 211, ctl_capturar_partida):
// sirve para explicar el resultado y para probar la regla. La AUTORIDAD es el servidor; el rol de sucursal nunca recibe esta clasificación.
export const CLASES_PRECIO = ['coincide', 'etiqueta_anterior', 'etiqueta_mal_puesta', 'revisar']
export const NOMBRE_CLASE_PRECIO = { coincide: 'Coincide', etiqueta_anterior: 'Etiqueta anterior', etiqueta_mal_puesta: 'Etiqueta mal puesta', revisar: 'A revisar' }
/** Solo «revisar» abre caso. */
export const abreCasoPrecio = clase => clase === 'revisar'

const aDias = f => { const [a, m, d] = String(f).slice(0, 10).split('-').map(Number); return Math.floor(Date.UTC(a, m - 1, d) / 86400000) }

/**
 * @param {object} o
 *   etiqueta        precio impreso en la etiqueta (null = no se capturó)
 *   catalogo        precio vigente (null = sin precio vigente)
 *   vigenteDesde    'YYYY-MM-DD' desde cuándo rige el precio vigente
 *   hoy             'YYYY-MM-DD' (zona de la clínica)
 *   gracia          días de gracia por cambio de precio (0–90)
 *   tolerancia      tolerancia de precio de etiqueta (MXN)
 *   preciosPrevios  [{precio, hasta:'YYYY-MM-DD'|null}] precios anteriores al vigente
 * @returns {string|null}
 */
export function clasificarPrecio({ etiqueta, catalogo, vigenteDesde, hoy, gracia = 30, tolerancia = 0, preciosPrevios = [] }) {
  if (etiqueta == null) return null
  if (catalogo == null) return 'revisar'
  if (Math.abs(etiqueta - catalogo) <= tolerancia) return 'coincide'
  const dentroDeGracia = !!vigenteDesde && aDias(vigenteDesde) >= aDias(hoy) - gracia
  const coincideConAnterior = preciosPrevios.some(p => (p.hasta == null || aDias(p.hasta) >= aDias(hoy) - gracia) && Math.abs(p.precio - etiqueta) <= tolerancia)
  return dentroDeGracia && coincideConAnterior ? 'etiqueta_anterior' : 'revisar'
}
