// Netlify Function: cobro del anticipo de una reserva del portal con Clip.
// MODO SIMULADO (sin llave de Clip): no mueve dinero. Valida la reserva con su token (RPC pública portal_estado_reserva)
// y registra el resultado con servicio_pago_reserva (service_role, idempotente por clip_payment_id).
// Tarjeta que termina en 0002 → rechazada; cualquier otra → aprobada.
// Variables de entorno (SOLO servidor, jamás VITE_): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Para pasar a Clip real: reemplazar el bloque «PROCESADOR» por la llamada al API de Clip con CLIP_API_KEY / CLIP_SECRET.
import { randomUUID } from 'node:crypto'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Base compartida (BITDATA): los datos de Pie Firme viven en su propio esquema
const ESQUEMA = process.env.DB_SCHEMA || process.env.VITE_DB_SCHEMA || 'piefirme'

async function rpc(url, key, nombre, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Accept-Profile': ESQUEMA, 'Content-Profile': ESQUEMA }, body: JSON.stringify(args),
  })
  const t = await r.text()
  let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { ok: r.ok, status: r.status, data }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) return json(503, { error: 'El servidor de pagos no está configurado (faltan variables de entorno).' })
  if ((process.env.CLIP_MODO || 'simulado') !== 'simulado') return json(501, { error: 'Clip real aún no está implementado en esta función.' })

  let b
  try { b = await req.json() } catch { return json(400, { error: 'Solicitud inválida' }) }
  const { slug, reserva_id, token_reserva, ultimos4, marca } = b ?? {}
  if (!slug || !reserva_id || !token_reserva) return json(400, { error: 'Faltan datos de la reserva' })

  // 1) La reserva debe existir y el token ser el suyo (la RPC pública lo verifica con hash).
  const est = await rpc(url, anon, 'portal_estado_reserva', { p_slug: slug, p_reserva: reserva_id, p_token: token_reserva })
  if (!est.ok) return json(est.status === 404 ? 404 : 400, { error: 'Reserva no encontrada' })
  const e = est.data
  if (e.estado === 'confirmada') return json(200, { estado: 'confirmada', modo: 'simulado', repetido: true, folio: e.folio })
  if (e.estado !== 'retenido') return json(409, { estado: e.estado, error: e.estado === 'vencida' ? 'El horario ya no está apartado. Elige otro.' : 'La reserva no admite pago' })

  // 2) PROCESADOR (simulado)
  const rechazada = String(ultimos4 ?? '').endsWith('0002')
  const clipPaymentId = `SIM-${randomUUID()}`
  const resultado = rechazada ? 'rechazado' : 'aprobado'

  // 3) Registrar el resultado (solo service_role)
  const r = await rpc(url, service, 'servicio_pago_reserva', {
    p_reserva: reserva_id, p_resultado: resultado, p_clip_payment_id: clipPaymentId, p_monto: Number(e.anticipo), p_comision: 0,
    p_ultimos4: /^[0-9]{4}$/.test(String(ultimos4)) ? ultimos4 : null, p_autorizacion: `SIM${Date.now().toString().slice(-6)}`, p_marca: marca || null,
    p_modo: 'simulado', p_respuesta: { simulado: true },
  })
  if (!r.ok) return json(409, { error: (r.data && (r.data.message || r.data.hint)) || 'No se pudo registrar el pago' })
  return json(200, { ...(r.data ?? {}), resultado, modo: 'simulado', estado: r.data?.estado ?? (rechazada ? 'pago_rechazado' : 'confirmada') })
}
