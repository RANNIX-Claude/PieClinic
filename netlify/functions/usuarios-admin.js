// Altas y cambios de usuarios de una clínica (pantalla 44; clon de admin-usuarios.js de IRP adaptado al esquema multi-clínica).
// Quien llama debe ser Administrador activo de SU clínica; todo se limita a perfiles de esa organización.
// invitar / reenviar → RPC invitacion_crear (token de un solo uso, hash en BD) y devuelve el enlace; el envío por correo queda pendiente (sin proveedor de correo).
// cambiar_rol / cambiar_sedes / activar / desactivar → actualiza perfiles con la service_role, después de validar la organización del objetivo.
// Variables (solo servidor): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { json, identificar, leerCuerpo, rpc, rest, entorno, origenSitio } from './_lib/comun.js'

const ROLES = ['administrador', 'podologo', 'recepcion', 'supervisor']
const FUNCIONES = ['caja', 'recepcion_mercancia', 'podologia']   // perfiles.funciones (073)

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const { url, anon, service } = entorno()
  if (!service) return json(503, { error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  const { perfil } = quien
  if (!perfil?.activo || perfil.rol !== 'administrador') return json(403, { error: 'Solo el Administrador de la clínica gestiona usuarios' })
  const b = await leerCuerpo(req)
  if (!b) return json(400, { error: 'JSON inválido' })
  const org = perfil.organizacion_id
  const admin = { url, llave: service, token: service }

  // la clínica no puede estar suspendida (solo lectura)
  const o = await rest(admin, 'GET', `/rest/v1/organizaciones?id=eq.${org}&select=estado`)
  if (['suspendida', 'baja'].includes(o.data?.[0]?.estado)) return json(403, { error: 'La clínica está en modo solo lectura' })

  const sedesValidas = async sedes => {
    if (!sedes?.length) return true
    const ids = sedes.map(s => String(s)).filter(s => /^[0-9a-f-]{36}$/i.test(s))
    if (ids.length !== sedes.length) return false
    const r = await rest(admin, 'GET', `/rest/v1/sedes?organizacion_id=eq.${org}&id=in.(${ids.join(',')})&select=id`)
    return Array.isArray(r.data) && r.data.length === ids.length
  }

  if (b.accion === 'invitar' || b.accion === 'reenviar') {
    if (!ROLES.includes(b.rol) && b.accion === 'invitar') return json(400, { error: 'Rol inválido' })
    if (b.accion === 'reenviar') {
      // revoca la pendiente anterior y crea otra con los mismos datos (el token en claro solo existe al crearlo)
      const prev = await rest(admin, 'GET', `/rest/v1/invitaciones?id=eq.${encodeURIComponent(b.invitacion_id)}&organizacion_id=eq.${org}&select=id,email,nombre,rol,sedes,estado`)
      const inv = prev.data?.[0]
      if (!inv) return json(404, { error: 'Invitación no encontrada' })
      await rpc(quien.ctx, 'invitacion_revocar', { p_invitacion: inv.id })
      b.email = inv.email; b.nombre = inv.nombre; b.rol = inv.rol; b.sedes = inv.sedes
    }
    if (!(await sedesValidas(b.sedes))) return json(400, { error: 'Alguna sede no pertenece a la clínica' })
    const r = await rpc(quien.ctx, 'invitacion_crear', { p_email: b.email, p_rol: b.rol, p_sedes: b.sedes ?? [], p_nombre: b.nombre ?? null })
    if (!r.ok) return json(400, { error: r.error })
    return json(200, { data: { ...r.data, enlace: `${origenSitio(req)}/app/aceptar-invitacion?token=${encodeURIComponent(r.data.token)}`, correo_enviado: false } })
  }

  // acciones sobre un usuario existente de la MISMA clínica
  const objetivo = await rest(admin, 'GET', `/rest/v1/perfiles?id=eq.${encodeURIComponent(b.usuario_id)}&organizacion_id=eq.${org}&select=id,rol,activo`)
  const u = objetivo.data?.[0]
  if (!u) return json(404, { error: 'Usuario no encontrado en tu clínica' })
  const eliminaAdmin = (cambio) => cambio && u.rol === 'administrador' && u.activo
  const otrosAdmins = async () => {
    const r = await rest(admin, 'GET', `/rest/v1/perfiles?organizacion_id=eq.${org}&rol=eq.administrador&activo=eq.true&id=neq.${u.id}&select=id`)
    return Array.isArray(r.data) ? r.data.length : 0
  }
  let cambios
  if (b.accion === 'cambiar_rol') { if (!ROLES.includes(b.rol)) return json(400, { error: 'Rol inválido' }); cambios = { rol: b.rol }; if (b.rol !== 'administrador' && eliminaAdmin(true) && !(await otrosAdmins())) return json(409, { error: 'La clínica debe conservar al menos un Administrador activo' }) }
  else if (b.accion === 'cambiar_sedes') { if (!(await sedesValidas(b.sedes))) return json(400, { error: 'Alguna sede no pertenece a la clínica' }); cambios = { sedes: b.sedes ?? [] } }
  else if (b.accion === 'cambiar_funciones') {
    const f = Array.isArray(b.funciones) ? [...new Set(b.funciones.map(String))] : null
    if (!f || f.some(x => !FUNCIONES.includes(x))) return json(400, { error: 'Función inválida' })
    cambios = { funciones: f }
  }
  else if (b.accion === 'activar') cambios = { activo: true }
  else if (b.accion === 'desactivar') {
    if (u.id === perfil.id) return json(409, { error: 'No puedes desactivar tu propia cuenta' })
    if (eliminaAdmin(true) && !(await otrosAdmins())) return json(409, { error: 'La clínica debe conservar al menos un Administrador activo' })
    cambios = { activo: false }
  } else return json(400, { error: 'Acción no permitida' })

  const r = await rest(admin, 'PATCH', `/rest/v1/perfiles?id=eq.${u.id}&organizacion_id=eq.${org}`, cambios)
  if (!r.ok) return json(400, { error: r.error })
  await rpc(quien.ctx, 'registrar_bitacora', { p_accion: 'actualizar', p_entidad: 'perfiles', p_entidad_id: u.id, p_detalle: { via: 'usuarios-admin', accion: b.accion, ...cambios }, p_sede: null })
  return json(200, { data: r.data?.[0] ?? null })
}
