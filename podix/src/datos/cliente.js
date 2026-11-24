// Capa de datos · cliente de Supabase (solo modo conectado).
// La librería se carga con import() dinámico: en modo demostración este archivo nunca se ejecuta y @supabase/supabase-js no se descarga.
// Variables (públicas por diseño, van en .env.local y en Netlify): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DB_SCHEMA.
// NUNCA la service_role: la seguridad es RLS con la sesión de la persona.
const env = (import.meta.env || {});
const url = String(env.VITE_SUPABASE_URL || "").trim();
const anon = String(env.VITE_SUPABASE_ANON_KEY || "").trim();
export const ESQUEMA = String(env.VITE_DB_SCHEMA || "piefirme").trim();
export const CONFIGURADO = Boolean(url && anon);
export const MENSAJE_SIN_CONFIGURAR = "Modo conectado sin configurar: faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. No se puede iniciar sesión ni leer la base.";

let promesa = null, inyectado = false;
/** ¿Hay con qué conectarse? (variables de entorno o un cliente inyectado por un script de verificación). */
export const configurado = () => CONFIGURADO || inyectado;
/** Solo para scripts de verificación en Node (sin Vite no hay import.meta.env): usa este cliente ya creado con la llave anon. */
export function inyectarCliente(c) { promesa = Promise.resolve(c); inyectado = true; }
/** Cliente único. Falla con un mensaje claro si faltan variables (nunca un cliente «de mentira»). */
export function cliente() {
  if (!configurado()) return Promise.reject(new Error(MENSAJE_SIN_CONFIGURAR));
  promesa ||= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, anon, {
      db: { schema: ESQUEMA },
      // Clave propia de almacenamiento: Pie Firme y esta app pueden convivir en el mismo origen sin pisarse la sesión.
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storageKey: "podologia.qa.sesion" },
    }));
  return promesa;
}

/** Lee TODAS las filas de una consulta paginando de 1,000 en 1,000 (tope de PostgREST). `armar()` devuelve una consulta nueva cada vez. */
export async function todas(armar, { pagina = 1000, tope = 20000 } = {}) {
  const out = [];
  for (let desde = 0; desde < tope; desde += pagina) {
    const { data, error } = await armar().range(desde, desde + pagina - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pagina) break;
  }
  return out;
}

/** Mensaje en español para un error de Supabase / PostgREST / Postgres. */
export function mensajeError(e) {
  if (!e) return "Error desconocido.";
  const m = String(e.message || e.error_description || e);
  if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/Email not confirmed/i.test(m)) return "La cuenta no ha confirmado su correo.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) return "No hay conexión con la base QA. Revisa tu red e inténtalo de nuevo.";
  if (e.code === "42501" || /row-level security|permission denied/i.test(m)) return "La base no permite esta acción con tu cuenta (regla de seguridad).";
  if (e.code === "PF403") return "Tu cuenta no está ligada a una ficha de empleado.";
  if (e.code === "PF409") return "No tienes sucursal de trabajo asignada para hoy.";
  if (e.code === "23505") return "Ese registro ya existía en la base.";
  return m;
}
