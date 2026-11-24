// Asistente de IA de consulta (pantalla 47). SIN LLAVE responde {modo:'no_configurado'} y el navegador muestra su respuesta SIMULADA.
// P-125: el navegador consulta con la sesión del usuario (RLS) solo las vistas permitidas de SU clínica y manda aquí los resultados como contexto;
// la función no lee la base ni recibe nada de otra clínica. Con llave, el modelo responde únicamente con ese contexto («apoyo, no diagnóstico»).
import { json, identificar, leerCuerpo } from './_lib/comun.js'

const MODELO = process.env.IA_MODELO || 'claude-sonnet-4-5'

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  if (!quien.perfil?.activo || !['administrador', 'podologo'].includes(quien.perfil.rol)) return json(403, { error: 'Sin permiso para usar el asistente' })
  const llave = process.env.ANTHROPIC_API_KEY || process.env.IA_API_KEY
  if (!llave) return json(200, { modo: 'no_configurado', proveedor: null })

  const b = await leerCuerpo(req)
  if (!b || typeof b.pregunta !== 'string' || !b.pregunta.trim()) return json(400, { error: 'Pregunta vacía' })
  const contexto = JSON.stringify(b.contexto ?? []).slice(0, 60000)
  const sistema = 'Eres el asistente de consulta de una clínica de podología en México. Responde en español con base ÚNICAMENTE en los datos del contexto; ' +
    'si no alcanzan, dilo. No des diagnósticos ni consejos médicos: eres apoyo administrativo. Cita cifras exactas y el nombre de la vista de donde salen.'
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': llave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, system: sistema, messages: [{ role: 'user', content: `Contexto (vistas de la clínica):\n${contexto}\n\nPregunta: ${b.pregunta.slice(0, 1000)}` }] }),
    })
    if (!r.ok) return json(502, { error: 'El proveedor de IA no respondió correctamente' })
    const j = await r.json()
    const respuesta = (j.content ?? []).map(c => c.text ?? '').join('').trim()
    return json(200, { modo: 'activo', proveedor: process.env.IA_PROVEEDOR || 'anthropic', respuesta, vistas: (b.contexto ?? []).map(c => c.titulo) })
  } catch (e) {
    return json(502, { error: 'No se pudo contactar a la IA: ' + e.message })
  }
}
