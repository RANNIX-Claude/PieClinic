// Estado de la IA para el aviso «Modo simulado: sin llave». No consulta al proveedor: solo dice si hay llave configurada.
// Variables (solo servidor): ANTHROPIC_API_KEY (o IA_API_KEY) y opcionalmente IA_PROVEEDOR.
import { json, identificar } from './_lib/comun.js'

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  const llave = process.env.ANTHROPIC_API_KEY || process.env.IA_API_KEY
  return json(200, llave ? { modo: 'activo', proveedor: process.env.IA_PROVEEDOR || 'anthropic' } : { modo: 'no_configurado', proveedor: null })
}
