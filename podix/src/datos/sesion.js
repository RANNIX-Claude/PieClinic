// Capa de datos · sesión real en modo qa: Supabase Auth (correo y contraseña) + hidratación del estado `d`.
//   iniciarSesion(correo, contraseña) → inicia sesión, lee la base con RLS de esa persona y entra a la app con su rol.
//   restaurarSesion()                  → si Supabase guardó una sesión (recarga de página), vuelve a hidratar y entra.
//   cerrarSesion()                     → salir() de core.js; escribir.js cierra la sesión de Supabase y borra los datos de memoria.
//   rehidratar()                       → vuelve a leer la base sin cerrar sesión.
// El rol de la app sale del CARGO del perfil (064); el ícono / puerta de entrada nunca otorga permisos.
import { cliente, todas, mensajeError, configurado, MENSAJE_SIN_CONFIGURAR } from "./cliente.js";
import { leerBase, construirParche, aplicarParche } from "./hidratar.js";
import { activarEscritura, enSilencio } from "./escribir.js";
import { salir, auditar, reiniciarDemo } from "../store/core.js";
import { hoy, ahoraLocal } from "../lib/format.js";

let escritura = null;
let avisarUI = () => {};
/** La UI (Login.jsx) entrega su función de avisos (toast) para los rechazos de la base. */
export function configurarAvisos(fn) { avisarUI = typeof fn === "function" ? fn : () => {}; }

/** Sede inicial: la de hoy en la base («Trabajando en»: asignación del día o sede de contrato) manda, porque el checador
 *  de la base registra ahí; si no hay, la primera del usuario. */
export const sedeInicial = (u, sedeHoy) => sedeHoy || u?.sucursales?.[0] || null;

async function hidratarYEntrar(c, user) {
  const { filas, errores } = await leerBase(c, todas);
  if (filas.perfiles && !filas.perfiles.some((p) => p.id === user.id)) throw Object.assign(new Error("Tu cuenta no tiene perfil en la clínica."), { code: "PF403" });
  const res = construirParche(filas, { yo: user.id, errores });
  let u = null;
  enSilencio((d) => { // la hidratación nunca se vuelve a escribir en la base
    aplicarParche(d, res, { perfilId: user.id, correo: user.email || "", hoy: hoy(), ahora: ahoraLocal() });
    d.datos.errores = errores;
    u = d.usuarios.find((x) => x.id === user.id) || null;
    if (!u || u.activo === false) return;
    if (res.sedeHoy && !u.sucursales.includes(res.sedeHoy)) u.sucursales = [...u.sucursales, res.sedeHoy]; // asignado hoy a otra sede
    d.sesion = { userId: u.id, sucursalId: sedeInicial(u, res.sedeHoy) };
    auditar(d, "inicio_sesion", "usuario", u.id, "modo qa");
  });
  if (!u) { reiniciarDemo(); throw new Error("No se pudo leer tu perfil de la base (revisa que tu cuenta tenga perfil y cargo)."); }
  if (u.activo === false) { await c.auth.signOut().catch(() => {}); reiniciarDemo(); throw new Error("Tu cuenta está desactivada."); }
  escritura ||= activarEscritura({ obtenerCliente: cliente, avisar: (t, tono) => avisarUI(t, tono), mensajeError });
  return { usuario: u, errores };
}

export async function iniciarSesion(correo, contrasena) {
  if (!configurado()) throw new Error(MENSAJE_SIN_CONFIGURAR);
  const c = await cliente();
  const { data, error } = await c.auth.signInWithPassword({ email: String(correo || "").trim().toLowerCase(), password: String(contrasena || "") });
  if (error) throw new Error(mensajeError(error));
  try { return await hidratarYEntrar(c, data.user); }
  catch (e) { await c.auth.signOut().catch(() => {}); throw new Error(mensajeError(e)); }
}

/** Devuelve null si no había sesión guardada. */
export async function restaurarSesion() {
  if (!configurado()) return null;
  const c = await cliente();
  const { data } = await c.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;
  try { return await hidratarYEntrar(c, user); }
  catch (e) { await c.auth.signOut().catch(() => {}); throw new Error(mensajeError(e)); }
}

export async function rehidratar() {
  const c = await cliente();
  const { data } = await c.auth.getUser();
  if (!data?.user) throw new Error("La sesión expiró: vuelve a iniciar sesión.");
  return hidratarYEntrar(c, data.user);
}

export async function cerrarSesion() {
  salir(); // escribir.js detecta la salida, cierra Supabase Auth y reinicia el estado en memoria
  if (!escritura && configurado()) { const c = await cliente(); await c.auth.signOut().catch(() => {}); reiniciarDemo(); }
}
