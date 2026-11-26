// Evaluaciones programadas de Control y Auditoría (F7.3): sucursal sin conteo de apertura / sin cierre / sin sincronizar a la hora configurada, cancelaciones y ventas de piezas de
// alto valor observadas en el origen, y el resumen diario. HOY NO HAY PLANIFICADOR: esta función se invoca a mano (POST con el encabezado x-cron-secret) o con el script
// scripts/auditoria-alertas-programadas.mjs. Para que corra sola basta descomentar el bloque `config` de abajo (Netlify Scheduled Functions) y definir AUDITORIA_CRON_SECRET.
// Las llaves viven SOLO en variables de entorno de Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y AUDITORIA_CRON_SECRET. Los envíos Push/WhatsApp/correo siguen SIMULADOS:
// la base solo registra lo que se habría enviado (ctl_alerta_envio).
//   POST /.netlify/functions/auditoria-alertas-programadas   { "resumen": true|false, "ahora": "2026-11-26T22:30:00Z" (opcional, para pruebas) }
import { json, leerCuerpo, entorno, DB_SCHEMA } from './_lib/comun.js'

// ── Planificador (descomentar para activarlo) ───────────────────────────────────────────────
// Cada 15 minutos evalúa las alertas por hora. El resumen diario se pide una vez al día con otra programación (p. ej. a las 21:00 de México = 03:00 UTC)
// llamando a esta misma función con { "resumen": true }.
// export const config = { schedule: '*/15 * * * *' }

async function rpcServicio({ url, service }, nombre, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', 'Content-Profile': DB_SCHEMA, 'Accept-Profile': DB_SCHEMA },
    body: JSON.stringify(args),
  })
  const t = await r.text()
  let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { ok: r.ok, status: r.status, data, error: r.ok ? null : (data?.message || 'Error') }
}

export default async req => {
  const { url, service } = entorno()
  const secreto = process.env.AUDITORIA_CRON_SECRET
  const esPlanificador = req.method === 'GET' || req.headers.get('x-netlify-event') === 'schedule'   // las funciones programadas llegan sin cuerpo
  if (!esPlanificador && req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  if (!url || !service) return json(503, { error: 'El servidor no está configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' })
  if (!esPlanificador && (!secreto || req.headers.get('x-cron-secret') !== secreto)) return json(401, { error: 'No autorizado' })
  const b = (await leerCuerpo(req)) ?? {}
  const ahora = b.ahora && !Number.isNaN(Date.parse(b.ahora)) ? new Date(b.ahora).toISOString() : new Date().toISOString()
  const ctx = { url, service }
  const evaluacion = await rpcServicio(ctx, 'ctl_alertas_programadas', { p_org: null, p_ahora: ahora })
  if (!evaluacion.ok) return json(502, { error: evaluacion.error })
  let resumen = null
  if (b.resumen === true) {
    const r = await rpcServicio(ctx, 'ctl_resumen_diario_generar', { p_org: null, p_fecha: null })
    resumen = r.ok ? r.data : { error: r.error }
  }
  return json(200, { ok: true, simulado: true, evaluacion: evaluacion.data, resumen })
}
