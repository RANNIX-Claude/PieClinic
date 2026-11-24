// Adaptador de IA (importación, asistente de consulta, lectura de comprobantes). SIN LLAVE: modo SIMULADO explícito y visible.
// Jamás finge que algo real ocurrió: toda respuesta lleva { modo: 'simulado' | 'activo', proveedor }. La llave real vive solo en la
// función servidor (netlify/functions/ia-*.js) leyendo variables de entorno; si no hay llave la función contesta modo 'no_configurado'.
import { llamarFuncion } from '../api'
import { mapearColumnas } from '../plataforma/importacion'

export const MODO_SIMULADO_TEXTO = 'Modo simulado: sin llave de IA. Las propuestas salen de reglas locales, no de un modelo.'

/** Estado de la IA para mostrar el aviso. Pregunta a la función servidor; si no responde, simulado. */
export async function estadoIA() {
  try {
    const r = await llamarFuncion('ia-estado', {})
    if (r.ok) return await r.json() // { modo: 'activo' | 'no_configurado', proveedor }
  } catch { /* sin función servidor (desarrollo) */ }
  return { modo: 'simulado', proveedor: 'reglas-locales' }
}

/**
 * Propone el mapeo de columnas. Con llave: la función servidor llama al modelo (también para PDF/imagen).
 * Sin llave: mapeador heurístico (real, determinista) etiquetado como simulado. PDF/imagen sin llave → no se puede leer: captura manual.
 * @returns {{modo, proveedor, mapeos, mensaje?}}
 */
export async function proponerMapeo({ columnas, filas, tipo, umbral = 80, archivo }) {
  if (archivo && (archivo.tipo === 'pdf' || archivo.tipo === 'imagen')) {
    try {
      const r = await llamarFuncion('ia-importacion', { tipo, archivo_path: archivo.path, umbral })
      if (r.ok) { const j = await r.json(); if (j.modo === 'activo') return j }
    } catch { /* sin servidor */ }
    return { modo: 'simulado', proveedor: 'reglas-locales', mapeos: [], mensaje: 'Leer PDF o imágenes requiere la llave de IA (modo simulado). Sube un Excel/CSV o captura manualmente.' }
  }
  try {
    const r = await llamarFuncion('ia-importacion', { tipo, columnas, muestra: (filas ?? []).slice(0, 5), umbral })
    if (r.ok) { const j = await r.json(); if (j.modo === 'activo') return j }
  } catch { /* sin servidor */ }
  return { modo: 'simulado', proveedor: 'reglas-locales', mapeos: mapearColumnas(columnas, (filas ?? []).slice(0, 20), tipo, umbral) }
}

/**
 * Pregunta al asistente de consulta (solo datos de la clínica propia, vistas administrativas agregadas, P-125).
 * Sin llave devuelve una respuesta SIMULADA que dice claramente que lo es, con los datos agregados que se le pasen.
 * @param {{pregunta, contexto?: {titulo, filas}[]}} o
 */
export async function consultarAsistente({ pregunta, contexto = [] }) {
  try {
    const r = await llamarFuncion('ia-asistente', { pregunta, contexto: contexto.map(c => ({ titulo: c.titulo, filas: (c.filas ?? []).slice(0, 60) })) })
    if (r.ok) { const j = await r.json(); if (j.modo === 'activo') return j }
  } catch { /* sin servidor */ }
  const partes = contexto.filter(c => c.filas?.length).map(c => `${c.titulo}: ${c.filas.length} registro(s)`)
  return {
    modo: 'simulado', proveedor: 'reglas-locales', vistas: contexto.map(c => c.titulo),
    respuesta: `[Respuesta simulada] No hay llave de IA configurada, así que no puedo razonar sobre «${pregunta}». ` +
      (partes.length ? `Las vistas consultadas de tu clínica devolvieron: ${partes.join('; ')}. Revisa la tabla de resultados.` : 'Ninguna vista administrativa devolvió datos para esta pregunta.'),
  }
}
