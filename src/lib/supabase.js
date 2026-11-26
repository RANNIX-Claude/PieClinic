import { createClient } from '@supabase/supabase-js'

// Pie Firme — cliente Supabase.
// Variables: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (la anon key es pública por diseño; NUNCA la service_role).
// Si faltan, la app NO usa un cliente "de mentira" en silencio: entra en MODO SIN CONEXIÓN, el cliente devuelve
// siempre un error explícito y la interfaz muestra un aviso visible (ver BannerConexion y la pantalla de acceso).
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const SUPABASE_CONFIGURADO = Boolean(url && anon)
export const MENSAJE_SIN_CONEXION =
  'Modo sin conexión: falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. No se puede iniciar sesión ni leer o guardar datos.'

// Cliente de reemplazo: cualquier consulta resuelve {data:null, error} con el motivo; nada se guarda ni se finge.
function crearClienteSinConexion() {
  const error = { message: MENSAJE_SIN_CONEXION, code: 'SIN_CONEXION' }
  const resultado = { data: null, error, count: null, status: 0, statusText: 'offline' }
  const cadena = () => new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (ok) => Promise.resolve(resultado).then(ok) : cadena()),
    apply: () => cadena(),
  })
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error }),
      signInWithOAuth: async () => ({ data: null, error }),
      resetPasswordForEmail: async () => ({ data: null, error }),
      updateUser: async () => ({ data: null, error }),
      signOut: async () => ({ error: null }),
    },
    from: () => cadena(),
    rpc: () => cadena(),
    storage: { from: () => cadena() },
    functions: { invoke: async () => ({ data: null, error }) },
  }
}

// Base compartida (BITDATA): los datos de Pie Firme viven en el esquema 'piefirme' (VITE_DB_SCHEMA lo puede cambiar)
export const DB_SCHEMA = import.meta.env.VITE_DB_SCHEMA || 'piefirme'

export const supabase = SUPABASE_CONFIGURADO
  ? createClient(url, anon, { db: { schema: DB_SCHEMA }, auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: !import.meta.env.VITE_AUTH_STORAGE_KEY, ...(import.meta.env.VITE_AUTH_STORAGE_KEY ? { storageKey: import.meta.env.VITE_AUTH_STORAGE_KEY } : {}) } })  // la PWA de auditoría (/aud/) usa su propia llave: no pisa la sesión de /app/
  : crearClienteSinConexion()

if (!SUPABASE_CONFIGURADO) console.warn('[supabase] ' + MENSAJE_SIN_CONEXION)
