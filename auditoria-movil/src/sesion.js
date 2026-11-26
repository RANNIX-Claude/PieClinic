// Acceso de la PWA: «usuario y PIN».
//  · Alta del usuario en ESTE teléfono (una sola vez): correo y contraseña. El teléfono conserva su sesión (renovable) como cualquier PWA.
//  · Cada entrada: elige su nombre y escribe su PIN de 4 a 6 dígitos (el mismo de «Mi PIN»). El servidor lo valida, cuenta los fallos (3 → bloqueo de 15 min)
//    y abre una sesión ligada al turno (ctl_sesion_pin) que caduca al cerrarse el turno. Para autorizar ajustes NO sirve el PIN: eso vive en escritorio.
//  · Varios usuarios por teléfono: cada uno conserva su sesión; la cola de envío es por usuario (cada quien envía lo suyo al volver a entrar).
import { supabase } from '../../src/lib/supabase'
import { rpc, fijarContextoApi } from '../../src/lib/api'
import { rolAuditoria } from '../../src/lib/auditoria/roles'
import { crearSesionLocal, esPinValido, estadoBloqueo, sesionVigente } from '../../src/lib/auditoria/pwaSesion.js'
import { guardarMeta, leerMeta, limpiarMeta } from './almacen'

const K_USUARIOS = 'pf-aud-usuarios', K_SESION = 'pf-aud-sesion', K_FALLOS = 'pf-aud-fallos-pin'
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* sin almacenamiento */ } },
}

export const usuariosDelDispositivo = () => (ls.get(K_USUARIOS, []) ?? []).map(({ slot, ...u }) => u)
const guardarUsuario = (u, slot) => { const l = (ls.get(K_USUARIOS, []) ?? []).filter(x => x.id !== u.id); l.push({ ...u, slot }); ls.set(K_USUARIOS, l) }
const slotDe = id => (ls.get(K_USUARIOS, []) ?? []).find(x => x.id === id)?.slot ?? null

// Las sesiones se renuevan solas: se guarda el relevo para poder volver a entrar con PIN sin pedir contraseña.
supabase.auth.onAuthStateChange((_e, s) => { if (s?.user) { const l = ls.get(K_USUARIOS, []) ?? []; const u = l.find(x => x.id === s.user.id); if (u) { u.slot = { access_token: s.access_token, refresh_token: s.refresh_token }; ls.set(K_USUARIOS, l) } } })

async function cargarPerfil(uid) {
  const { data: p } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle()
  if (!p) throw new Error('Tu usuario no tiene perfil activo en la clínica.')
  const { data: ss } = await supabase.from('sedes').select('id,clave,nombre').eq('organizacion_id', p.organizacion_id).eq('activa', true).order('nombre')
  const sedes = (ss ?? []).filter(s => !p.sedes?.length || p.sedes.includes(s.id))
  return { id: uid, nombre: [p.nombre, p.apellidos].filter(Boolean).join(' '), rolApp: p.rol, organizacionId: p.organizacion_id, sedes, rol: rolAuditoria(p.rol, false) }
}

/** Alta de un usuario en este teléfono (correo + contraseña, una vez). Necesita señal. */
export async function agregarUsuario(correo, contrasena) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: contrasena })
  if (error || !data?.session) throw new Error(error?.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : (error?.message ?? 'No se pudo entrar.'))
  const u = await cargarPerfil(data.user.id)
  guardarUsuario({ id: u.id, email: correo.trim(), nombre: u.nombre, rolApp: u.rolApp, organizacionId: u.organizacionId, sedes: u.sedes, rol: u.rol }, { access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  return u
}

/** Deja activa en el cliente la sesión del usuario elegido (sin red solo se prepara; el envío espera a la señal). */
export async function activarUsuario(id) {
  const u = usuariosDelDispositivo().find(x => x.id === id)
  if (!u) throw new Error('Ese usuario no está en este teléfono.')
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.id !== id) {
    const slot = slotDe(id)
    if (!slot) throw new Error('Hay que volver a dar de alta a este usuario (correo y contraseña).')
    const { error } = await supabase.auth.setSession(slot)
    if (error && !/network|fetch/i.test(error.message)) throw new Error('La sesión de este usuario ya no es válida: dalo de alta otra vez (correo y contraseña).')
  }
  fijarContextoApi({ organizacionId: u.organizacionId, sedesUsuario: u.sedes.map(s => s.id) })
  return u
}

export const quitarUsuario = id => { ls.set(K_USUARIOS, (ls.get(K_USUARIOS, []) ?? []).filter(x => x.id !== id)) }

/** PIN → sesión de captura. Lanza con un mensaje claro; devuelve la sesión local. */
export async function entrarConPin(usuario, sucursal, pin) {
  if (!esPinValido(pin)) throw new Error('El PIN tiene de 4 a 6 dígitos.')
  const fallos = ls.get(K_FALLOS, {})[usuario.id] ?? []
  const b = estadoBloqueo(fallos)
  if (b.bloqueado) throw new Error(`PIN bloqueado por intentos fallidos. Espera ${b.minutos} min.`)
  const r = await rpc('ctl_pin_abrir_sesion', { p_pin: pin, p_sucursal: sucursal.id, p_turno: null, p_hora_cliente: new Date().toISOString() })
  if (r.error) throw new Error(/failed to fetch|network/i.test(r.error.message) ? 'Sin señal: para entrar con PIN hace falta conexión.' : r.error.message)
  const d = r.data
  const todos = ls.get(K_FALLOS, {})
  if (!d?.ok) {
    if (d?.error === 'sin_pin') throw new Error('Aún no tienes PIN. Defínelo en escritorio, en «Mi PIN».')
    todos[usuario.id] = [...fallos, Date.now()]; ls.set(K_FALLOS, todos)
    throw new Error(`PIN incorrecto.${d?.intentos_restantes != null ? ` Te quedan ${d.intentos_restantes} intento(s).` : ''}`)
  }
  delete todos[usuario.id]; ls.set(K_FALLOS, todos)
  const p = await rpc('ctl_pwa_pendientes', { p_sucursal: sucursal.id })   // trae la hora del servidor: la cuenta regresiva no usa el reloj del teléfono
  const ses = crearSesionLocal({ sesionId: d.sesion_id, usuarioId: usuario.id, sucursalId: sucursal.id, turnoId: d.turno_id, venceEn: d.vence_en, ahoraServidor: p.data?.ahora ?? null })
  const rol = await rpc('ctl_mi_rol')
  const completa = { usuario: { ...usuario, rolAud: rol.data?.rol ?? usuario.rol }, sucursal, ses }
  ls.set(K_SESION, completa)
  guardarMeta('rolAud:' + usuario.id, rol.data?.rol ?? usuario.rol)
  return completa
}

/** Al abrir la app: ¿sigue valiendo la sesión? Con señal el servidor decide (p. ej. turno cerrado); sin señal solo cuenta el vencimiento. */
export async function restaurarSesion() {
  const s = ls.get(K_SESION)
  if (!s?.ses) return { sesion: null, motivo: 'sin_sesion' }
  let validacion = null
  if (navigator.onLine !== false) {
    try {
      await activarUsuario(s.usuario.id)
      const r = await Promise.race([rpc('ctl_pin_validar_sesion', { p_sesion: s.ses.sesionId }), new Promise(res => setTimeout(() => res({ error: { message: 'timeout' } }), 5000))])
      if (!r.error) validacion = r.data
    } catch { /* sin señal real: manda el vencimiento local */ }
  } else fijarContextoApi({ organizacionId: s.usuario.organizacionId, sedesUsuario: s.usuario.sedes.map(x => x.id) })
  const v = sesionVigente(s.ses, { validacion })
  if (!v.vigente) { ls.del(K_SESION); return { sesion: null, motivo: v.motivo, usuarioId: s.usuario.id } }
  return { sesion: s }
}

/** Revisión periódica con señal: si el servidor dice que ya no vale (turno cerrado), se pide el PIN otra vez. */
export async function validarAhora(s) {
  const r = await rpc('ctl_pin_validar_sesion', { p_sesion: s.ses.sesionId })
  return r.error ? sesionVigente(s.ses) : sesionVigente(s.ses, { validacion: r.data })
}

export async function cerrarSesion(s) {
  ls.del(K_SESION)
  if (s?.ses?.sesionId && navigator.onLine !== false) await rpc('ctl_pin_cerrar_sesion', { p_sesion: s.ses.sesionId }).catch(() => {})
}
/** Cierre completo en este teléfono: borra copias del arranque; la cola de envío NO se borra (es evidencia ya capturada). */
export async function olvidarCopias() { await limpiarMeta() }
export { leerMeta, guardarMeta }
