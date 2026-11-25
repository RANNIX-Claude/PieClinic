import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, SUPABASE_CONFIGURADO, MENSAJE_SIN_CONEXION } from '../lib/supabase'
import { fijarContextoApi } from '../lib/api'
import { fijarZonaHoraria } from '../lib/formato'
import { registrarBitacora } from '../lib/bitacora'
import { fijarSuperadmin } from '../lib/permisos'
import { borrarSnapshots } from '../lib/offline/almacen'

export const AppContext = createContext(null)

const LS_SEDE = 'pf.sedeActiva'
const LS_TEMA = 'pf.tema'
const ls = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } },
}

// Modo demostración SOLO en desarrollo y SIN Supabase configurado (?demo=administrador|podologo|recepcion).
// Datos sintéticos; se elimina del build de producción (import.meta.env.DEV es false allí).
function demoDesdeUrl() {
  if (!import.meta.env.DEV || SUPABASE_CONFIGURADO) return null
  const rol = new URLSearchParams(window.location.search).get('demo') || ls.get('pf.demo')
  if (!['administrador', 'podologo', 'recepcion'].includes(rol)) return null
  ls.set('pf.demo', rol)
  return {
    user: { id: 'demo', email: `${rol}@demo.piefirme.test` },
    perfil: { id: 'demo', rol, nombre: rol === 'podologo' ? 'Marco' : rol === 'recepcion' ? 'Ana' : 'Laura', apellidos: 'Demo', sedes: [], cedula: rol === 'podologo' ? '0000000' : null },
    organizacion: { id: 'org-demo', nombre: 'Clínica Demo (datos sintéticos)', zona_horaria: 'America/Mexico_City', plan: 'por_clinica', estado: 'activa', parametros: {} },
    sedes: [{ id: 'sede-1', clave: 'CEN', nombre: 'Sede Centro', activa: true }, { id: 'sede-2', clave: 'SUR', nombre: 'Sede Sur', activa: true }],
  }
}

const copiaArranque = {
  get: uid => { try { const c = JSON.parse(localStorage.getItem('pf.arranque') || 'null'); return c?.uid === uid ? c : null } catch { return null } },
  set: (uid, d) => { try { localStorage.setItem('pf.arranque', JSON.stringify({ uid, ...d })) } catch { /* sin almacenamiento */ } },
  borrar: () => { try { localStorage.removeItem('pf.arranque') } catch { /* sin almacenamiento */ } },
}
const leerCopiaArranque = uid => copiaArranque.get(uid)
const guardarCopiaArranque = (uid, d) => copiaArranque.set(uid, d)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)          // { rol, nombre, apellidos, sedes[], cedula, ... }
  const [organizacion, setOrganizacion] = useState(null) // { id, nombre, zona_horaria, plan, estado, parametros, logo_url, prueba_hasta }
  const [sedes, setSedes] = useState([])              // sedes a las que el usuario tiene acceso
  const [esRannix, setEsRannix] = useState(false)
  const [liberacion, setLiberacion] = useState({ estricta: false, claves: [] }) // liberación de funciones por RANNIX (074); sin ella todo se muestra
  const [errorPerfil, setErrorPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sedeId, setSedeId] = useState(() => ls.get(LS_SEDE) || null)   // null = todas mis sedes
  const [tema, setTemaState] = useState(() => ls.get(LS_TEMA) || 'light')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', tema === 'dark' ? '#2D2640' : '#7B5EA7')
  }, [tema])
  const setTema = t => { setTemaState(t); ls.set(LS_TEMA, t) }

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setSidebarOpen(false)
    }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const limpiar = () => { fijarSuperadmin(false); setPerfil(null); setOrganizacion(null); setSedes([]); setEsRannix(false); setErrorPerfil(null); setLiberacion({ estricta: false, claves: [] }) }

  // Perfil + organización + sedes. Si no hay perfil activo pero la persona está en rannix_staff, entra como superadmin.
  const cargarPerfil = useCallback(async (u) => {
    setErrorPerfil(null)
    const { data: p, error } = await supabase.from('perfiles').select('*').eq('id', u.id).maybeSingle()
    if (error) {
      // Sin conexión: se arranca con la copia del último acceso de ESTA persona (la caja debe seguir operando sin internet).
      const copia = leerCopiaArranque(u.id)
      if (copia && (!navigator.onLine || /failed to fetch|network|load failed/i.test(error.message ?? ''))) {
        fijarSuperadmin(copia.superadmin === true); setEsRannix(copia.superadmin === true); setLiberacion(copia.liberacion); setPerfil(copia.perfil); setOrganizacion(copia.organizacion); setSedes(copia.sedes)
        return
      }
      setErrorPerfil(error.message); setPerfil(null); return
    }
    if (!p || !p.activo) {
      const { data: staff } = await supabase.from('rannix_staff').select('user_id, nombre').eq('user_id', u.id).maybeSingle()
      if (staff) { setEsRannix(true); setPerfil({ id: u.id, rol: 'rannix', nombre: staff.nombre, apellidos: '', sedes: [] }); return }
      setPerfil(null)
      setErrorPerfil(p && !p.activo ? 'Tu usuario está inactivo. Pide a tu administrador que lo active.' : 'Tu usuario no pertenece a ninguna clínica. Pide una invitación a tu administrador.')
      return
    }
    // Superadministrador: administrador de la clínica que además es personal RANNIX (la tabla rannix_staff no es legible; se pregunta por RPC)
    const { data: soyRannix } = await supabase.rpc('soy_rannix')
    fijarSuperadmin(soyRannix === true)
    setEsRannix(soyRannix === true)
    // Liberación de funciones: se carga ANTES de mostrar el perfil para que el menú no parpadee con opciones no liberadas.
    // Si la migración 074 aún no está aplicada o la consulta falla, todo se muestra como hasta hoy.
    const { data: lib, error: errLib } = await supabase.rpc('funciones_habilitadas')
    setLiberacion(!errLib && lib && typeof lib === 'object' ? { estricta: lib.estricta === true, claves: Array.isArray(lib.claves) ? lib.claves : [] } : { estricta: false, claves: [] })
    setPerfil(p)
    const [{ data: org }, { data: ss }] = await Promise.all([
      supabase.from('organizaciones').select('*').eq('id', p.organizacion_id).maybeSingle(),
      supabase.from('sedes').select('*').eq('organizacion_id', p.organizacion_id).eq('activa', true).order('nombre'),
    ])
    setOrganizacion(org ?? null)
    const accesibles = (ss ?? []).filter(s => !p.sedes?.length || p.sedes.includes(s.id)) // sedes vacío = todas
    setSedes(accesibles)
    guardarCopiaArranque(u.id, { perfil: p, organizacion: org ?? null, sedes: accesibles, superadmin: soyRannix === true, liberacion: !errLib && lib && typeof lib === 'object' ? { estricta: lib.estricta === true, claves: Array.isArray(lib.claves) ? lib.claves : [] } : { estricta: false, claves: [] } })
    supabase.from('perfiles').update({ ultimo_acceso: new Date().toISOString() }).eq('id', u.id).then(() => {})
  }, [])

  useEffect(() => {
    const demo = demoDesdeUrl()
    if (demo) {
      setUser(demo.user); setPerfil(demo.perfil); setOrganizacion(demo.organizacion); setSedes(demo.sedes); setLoading(false)
      return
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) await cargarPerfil(session.user)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      setUser(session?.user ?? null)
      if (evento === 'SIGNED_OUT' || !session?.user) { limpiar(); return }
      // Fuera del callback para no bloquear el cliente de auth con otras consultas
      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED') setTimeout(() => cargarPerfil(session.user), 0)
    })
    return () => subscription.unsubscribe()
  }, [cargarPerfil])

  // Zona horaria y contexto del cliente de datos
  useEffect(() => { fijarZonaHoraria(organizacion?.zona_horaria) }, [organizacion?.zona_horaria])

  const rol = perfil?.rol ?? null
  const estadoClinica = organizacion?.estado ?? null
  const soloLectura = estadoClinica === 'suspendida' || estadoClinica === 'baja'

  // La sede activa debe ser una de las accesibles; si no, vuelve a «todas»
  const sedeActivaId = sedeId && sedes.some(s => s.id === sedeId) ? sedeId : null
  const sedeActiva = sedes.find(s => s.id === sedeActivaId) ?? null
  const setSedeActiva = id => { setSedeId(id || null); ls.set(LS_SEDE, id || null) }

  useEffect(() => {
    fijarContextoApi({ organizacionId: organizacion?.id ?? null, soloLectura, sedesUsuario: sedes.map(s => s.id) })
  }, [organizacion?.id, soloLectura, sedes])

  const iniciarSesion = async (email, password) => {
    const r = await supabase.auth.signInWithPassword({ email, password })
    if (!r.error) setTimeout(() => registrarBitacora('iniciar_sesion', 'sesion', r.data?.user?.id), 1500)
    return r
  }
  const iniciarSesionGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + import.meta.env.BASE_URL } })
  const recuperarContrasena = email =>
    supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + import.meta.env.BASE_URL + 'restablecer' })
  const cambiarContrasena = password => supabase.auth.updateUser({ password })
  const cerrarSesion = async () => {
    ls.set('pf.demo', null)
    await supabase.auth.signOut()
    copiaArranque.borrar(); borrarSnapshots()   // P-050: el equipo no conserva datos de la clínica sin sesión (la cola de tickets por sincronizar sí se conserva)
    limpiar(); setUser(null)
  }

  const valor = useMemo(() => ({
    user, perfil, rol, organizacion, sedes, esRannix, errorPerfil, loading, liberacion,
    sedeActiva, sedeActivaId, setSedeActiva,
    estadoClinica, soloLectura, sinConexion: !SUPABASE_CONFIGURADO, mensajeSinConexion: MENSAJE_SIN_CONEXION,
    tema, setTema, isMobile, sidebarOpen, setSidebarOpen,
    iniciarSesion, iniciarSesionGoogle, recuperarContrasena, cambiarContrasena, cerrarSesion,
    recargarPerfil: () => (user ? cargarPerfil(user) : Promise.resolve()),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, perfil, organizacion, sedes, esRannix, errorPerfil, loading, liberacion, sedeActivaId, tema, isMobile, sidebarOpen, soloLectura])

  return <AppContext.Provider value={valor}>{children}</AppContext.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider')
  return ctx
}
