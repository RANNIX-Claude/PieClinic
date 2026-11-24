// Alta del usuario que acepta una invitación (pública: el token es la credencial). Crea la cuenta en auth.users con la service_role
// y consume la invitación con la RPC invitacion_consumir (crea el perfil con el rol y las sedes invitados). Una cuenta = una clínica (P-119).
// POST { token, password, nombre?, apellidos? } → { data: { email } }. La contraseña viaja solo por HTTPS a esta función y no se guarda.
import { json, leerCuerpo, rpc, rest, entorno } from './_lib/comun.js'

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const { url, service } = entorno()
  if (!url || !service) return json(503, { error: 'El servidor no está configurado (faltan variables de entorno).' })
  const b = await leerCuerpo(req)
  if (!b || typeof b.token !== 'string' || b.token.length < 20) return json(400, { error: 'Invitación inválida' })
  if (typeof b.password !== 'string' || b.password.length < 10) return json(400, { error: 'La contraseña debe tener al menos 10 caracteres' })
  const admin = { url, llave: service, token: service }

  // 1) localizar la invitación por el hash del token (sin consumirla todavía)
  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256').update(b.token).digest('hex')
  const inv = await rest(admin, 'GET', `/rest/v1/invitaciones?token_hash=eq.${hash}&estado=eq.pendiente&select=id,email,nombre,expira_en`)
  const i = inv.data?.[0]
  if (!i || new Date(i.expira_en) < new Date()) return json(410, { error: 'La invitación no es válida, ya se usó o venció. Pide otra al administrador.' })

  // 2) crear la cuenta (correo ya confirmado: la invitación llegó a ese correo)
  const c = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: i.email, password: b.password, email_confirm: true }),
  })
  const u = await c.json().catch(() => ({}))
  if (!c.ok || !u.id) return json(409, { error: /already|registered|exists/i.test(JSON.stringify(u)) ? 'Ese correo ya tiene una cuenta.' : 'No se pudo crear la cuenta.' })

  // 3) consumir la invitación; si falla, no dejar una cuenta huérfana
  const r = await rpc(admin, 'invitacion_consumir', { p_token: b.token, p_user_id: u.id, p_nombre: b.nombre || null, p_apellidos: b.apellidos || null })
  if (!r.ok) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: { apikey: service, Authorization: `Bearer ${service}` } })
    return json(409, { error: r.error || 'No se pudo completar el alta' })
  }
  return json(200, { data: { email: i.email } })
}
