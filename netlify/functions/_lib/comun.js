// Utilidades compartidas de las funciones del área plataforma (no es una función: vive en una subcarpeta sin index).
// Variables de entorno SOLO de servidor: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function entorno() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  return { url, anon, service }
}

// Base compartida (BITDATA): PostgREST usa el esquema de Pie Firme vía perfiles de contenido
export const DB_SCHEMA = process.env.DB_SCHEMA || process.env.VITE_DB_SCHEMA || 'piefirme'

export const tokenDe = req => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()

/** Llamada REST a PostgREST. `llave` es la apikey; `token` el JWT con el que se ejecuta (RLS del usuario) o la service_role. */
export async function rest({ url, llave, token }, metodo, ruta, cuerpo, extra = {}) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { apikey: llave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept-Profile': DB_SCHEMA, 'Content-Profile': DB_SCHEMA, Prefer: 'return=representation', ...extra },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  const t = await r.text()
  let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { ok: r.ok, status: r.status, data, error: r.ok ? null : (data?.message || data?.error_description || data?.msg || data?.hint || (typeof data === 'string' ? data : 'Error')) }
}

/** Llama una RPC con el contexto dado. */
export const rpc = (ctx, nombre, args = {}) => rest(ctx, 'POST', `/rest/v1/rpc/${nombre}`, args)

/** Identifica al llamante con su JWT: { user, perfil, rannix, ctx } o { error, status }. Nunca confía en datos del cuerpo. */
export async function identificar(req) {
  const { url, anon } = entorno()
  const token = tokenDe(req)
  if (!url || !anon) return { status: 503, error: 'El servidor no está configurado (faltan variables de entorno).' }
  if (!token) return { status: 401, error: 'No autorizado' }
  const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  if (!u.ok) return { status: 401, error: 'Sesión inválida' }
  const user = await u.json()
  const ctx = { url, llave: anon, token }
  const p = await rest(ctx, 'GET', `/rest/v1/perfiles?id=eq.${user.id}&select=id,organizacion_id,rol,activo,nombre,email,sedes`)
  const perfil = Array.isArray(p.data) ? p.data[0] : null
  const s = await rest(ctx, 'GET', `/rest/v1/rannix_staff?user_id=eq.${user.id}&select=user_id`)
  const rannix = Array.isArray(s.data) && s.data.length > 0
  return { user, perfil, rannix, ctx }
}

export const leerCuerpo = async req => { try { return (await req.json()) ?? {} } catch { return null } }

/** Origen del sitio para armar enlaces (p. ej. de invitación). */
export const origenSitio = req => {
  const o = req.headers.get('origin')
  if (o && /^https?:\/\//.test(o)) return o
  return process.env.URL || process.env.SITE_URL || ''
}
