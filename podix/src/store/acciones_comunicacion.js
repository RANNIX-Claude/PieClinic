// Acciones y selectores del dominio «comunicación»: mensajería interna, correo interno y feed de la comunidad.
// Todas las acciones reciben el borrador `d` (dentro de mutar(...)), toman al usuario de d.sesion.userId, validan rol y pertenencia
// EN LA ACCIÓN (no solo escondiendo botones) y lanzan Error con un mensaje en español si algo no corresponde.
//
// SELECTORES DE NO LEÍDOS PARA EL MENÚ (el coordinador los conecta a selectors.js → badgeDe):
//   mensajesNoLeidos(d, usuarioId)  → número de mensajes ajenos sin leer en conversaciones donde participa y que no silenció.
//   correosNoLeidos(d, usuarioId)   → número de correos sin leer en su Entrada (sin contar archivados ni borradores).
//   feedNuevos(d, usuarioId)        → publicaciones visibles para él, de otras personas, posteriores a la última vez que abrió el feed.
// Estructura de datos: d.com = { hilos, correos, feed, feedVisto } (ver docs/AMPLIACION_V2.md; campos extra son opcionales).
import { auditar, uid } from "./core.js";
import { ahoraLocal, fechaCorta, hora, normaliza, parse } from "../lib/format.js";

// ───────── Constantes
export const ETIQUETAS_CORREO = ["Administrativo", "RRHH", "Clínico", "Compras", "Finanzas", "Urgente"];
export const TIPOS_FEED = [
  { v: "aviso", l: "Aviso", icon: "megaphone" },
  { v: "logro", l: "Logro", icon: "award" },
  { v: "reconocimiento", l: "Reconocimiento", icon: "star" },
  { v: "evento", l: "Evento", icon: "calendar" },
  { v: "foto", l: "Foto", icon: "image" },
];
export const REACCIONES = ["👍", "❤️", "👏", "🎉"];
export const ROL_ETIQUETA = { direccion: "Dirección", admin: "Administración", gerente: "Gerente", cajero: "Caja", recepcion: "Recepción", almacen: "Almacén", asistente: "Asistente", podologo: "Podólogo" };
const ROLES_DIFUSION = ["admin", "direccion", "gerente"]; // avisos oficiales, fijar y correos a grupos
const ROLES_CENTRALES = ["admin", "direccion"];
const MAX_IMAGEN = 400000; // caracteres del dataURL (las miniaturas de reducirImagen pesan mucho menos)

// ───────── Utilidades internas
const com = (d) => (d.com ||= { hilos: [], correos: [], feed: [], feedVisto: {} });
const usuarioDe = (d, id) => d.usuarios.find((x) => x.id === id) || null;
function actual(d) {
  const u = usuarioDe(d, d.sesion?.userId);
  if (!u || u.activo === false) throw new Error("Inicia sesión para continuar.");
  return u;
}
const esCentral = (u) => ROLES_CENTRALES.includes(u.rol);
const sucActiva = (d) => d.sesion?.sucursalId || null;
function validarImagen(img) {
  if (img == null || img === "") return null;
  if (typeof img !== "string" || !img.startsWith("data:image/")) throw new Error("La imagen no es válida.");
  if (img.length > MAX_IMAGEN) throw new Error("La imagen es muy pesada. Elige una más pequeña.");
  return img;
}
export const nombreCorto = (u) => (u ? String(u.nombre).replace(/\s*\(.*\)\s*$/, "") : "Usuario");
export const nombreDe = (d, id) => nombreCorto(usuarioDe(d, id));
export function rolDe(d, id) { const u = usuarioDe(d, id); return u ? ROL_ETIQUETA[u.rol] || u.rol : ""; }
export function nombreSucursal(d, sid) { return d.sucursales.find((s) => s.id === sid)?.nombre || (sid === "CEN" ? "Almacén central" : ""); }
/** Sucursal "de referencia" visible de una persona: la única que tiene o vacío si rota entre varias o es central. */
export function sucursalDePersona(d, u) {
  if (!u) return "";
  if (esCentral(u) || u.almacenCentral) return "Oficinas centrales";
  return u.sucursales.map((s) => nombreSucursal(d, s)).join(" / ");
}

/** Tiempo relativo en español: "ahora", "hace 5 min", "hace 2 h", "hace 3 d", o fecha corta si pasó una semana. */
export function tiempoRelativo(ts, ahora = new Date()) {
  if (!ts) return "";
  const min = Math.round((ahora - parse(ts)) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.floor(min / 60)} h`;
  if (min < 60 * 24 * 7) return `hace ${Math.floor(min / 1440)} d`;
  return fechaCorta(ts);
}
/** Hora si es de hoy; si no, fecha corta. Para la lista de conversaciones y de correos. */
export function marcaCorta(ts, ahora = new Date()) {
  if (!ts) return "";
  const h = parse(ts), mismo = h.toDateString() === ahora.toDateString();
  return mismo ? hora(ts) : fechaCorta(ts);
}

// ───────── Destinatarios y grupos
/** Grupos que la persona puede elegir al redactar: [{token, etiqueta}]. Solo admin, dirección y gerente envían a grupos. */
export function gruposDestinatarios(d, u) {
  if (!ROLES_DIFUSION.includes(u.rol)) return [];
  const g = [];
  if (esCentral(u)) g.push({ token: "g:todos", etiqueta: "Toda la empresa" });
  [["gerente", "Gerentes"], ["podologo", "Podólogos"], ["cajero", "Cajeros"], ["recepcion", "Recepción"], ["asistente", "Asistentes"], ["almacen", "Almacén"]].forEach(([rol, et]) => g.push({ token: `g:rol:${rol}`, etiqueta: et }));
  d.sucursales.forEach((s) => { if (esCentral(u) || u.sucursales.includes(s.id)) g.push({ token: `g:suc:${s.id}`, etiqueta: `Todos de la sucursal ${s.nombre}` }); });
  return g;
}
export function etiquetaToken(d, token) {
  if (token === "g:todos") return "Toda la empresa";
  if (token.startsWith("g:rol:")) return { gerente: "Gerentes", podologo: "Podólogos", cajero: "Cajeros", recepcion: "Recepción", asistente: "Asistentes", almacen: "Almacén" }[token.slice(6)] || token;
  if (token.startsWith("g:suc:")) return `Todos de la sucursal ${nombreSucursal(d, token.slice(6))}`;
  return nombreDe(d, token);
}
/** Personas de una sucursal (sin personal central), para canales y grupos. */
export function personasDeSucursal(d, sucursalId) {
  return d.usuarios.filter((x) => x.activo !== false && !ROLES_CENTRALES.includes(x.rol) && !x.almacenCentral && x.sucursales.includes(sucursalId));
}
/** Expande una lista de tokens (id de usuario o "g:…") en ids únicos de usuarios activos. */
export function expandirDestinatarios(d, tokens) {
  const out = new Set();
  const act = d.usuarios.filter((x) => x.activo !== false);
  for (const t of tokens || []) {
    if (typeof t !== "string") continue;
    if (t === "g:todos") act.forEach((x) => out.add(x.id));
    else if (t.startsWith("g:rol:")) act.filter((x) => x.rol === t.slice(6)).forEach((x) => out.add(x.id));
    else if (t.startsWith("g:suc:")) personasDeSucursal(d, t.slice(6)).forEach((x) => out.add(x.id));
    else if (act.some((x) => x.id === t)) out.add(t);
  }
  return [...out];
}
function validarTokens(d, u, tokens) {
  for (const t of tokens || []) {
    if (!String(t).startsWith("g:")) continue;
    if (!ROLES_DIFUSION.includes(u.rol)) throw new Error("Tu rol solo puede escribir a personas, no a grupos.");
    if (t === "g:todos" && !esCentral(u)) throw new Error("Solo Administración o Dirección escriben a toda la empresa.");
    if (t.startsWith("g:suc:") && !esCentral(u) && !u.sucursales.includes(t.slice(6))) throw new Error("Solo puedes escribir a grupos de tu sucursal.");
  }
}

// ═════════════════════════════ MENSAJERÍA INTERNA ═════════════════════════════
export const esMiembro = (h, uid_) => !!h && h.miembros.includes(uid_);
export const puedeLeerHilo = (d, hiloId, usuarioId) => esMiembro(com(d).hilos.find((x) => x.id === hiloId), usuarioId);
function hiloPropio(d, hiloId, u) {
  const h = com(d).hilos.find((x) => x.id === hiloId);
  if (!h) throw new Error("La conversación no existe.");
  if (!h.miembros.includes(u.id)) throw new Error("No perteneces a esta conversación.");
  return h;
}
export const noLeidosHilo = (h, usuarioId) => h.mensajes.filter((m) => m.de !== usuarioId && !m.leidoPor.includes(usuarioId)).length;

export function tituloHilo(d, h, usuarioId) {
  if (h.tipo === "directo") return nombreDe(d, h.miembros.find((x) => x !== usuarioId) || h.miembros[0]);
  return h.nombre || "Conversación";
}
export function subtituloHilo(d, h) {
  if (h.global) return "Toda la empresa";
  if (h.tipo === "sucursal") return `Canal de la sucursal · ${h.miembros.length} personas`;
  if (h.tipo === "rol") return `Canal del equipo · ${h.miembros.length} personas`;
  if (h.tipo === "grupo") return `Grupo · ${h.miembros.length} personas`;
  return "";
}

/** Sucursal donde la persona está trabajando hoy según el checador (d.rh). null si no hay dato o ya salió. Opcional. */
export function trabajandoEn(d, usuarioId, fecha = ahoraLocal().slice(0, 10)) {
  const emp = d.rh?.empleados?.find((e) => e.usuarioId === usuarioId);
  if (!emp) return null;
  const a = (d.rh.asistencia || []).filter((x) => x.empleadoId === emp.id && x.fecha === fecha && x.entrada && !x.salida).pop();
  return a ? nombreSucursal(d, a.sucursalId) || null : null;
}

/** Conversaciones del usuario ordenadas (fijadas arriba, luego por último mensaje). Cada elemento trae los datos de la lista. */
export function hilosDe(d, usuarioId, q = "") {
  const nq = normaliza(q);
  return com(d).hilos
    .filter((h) => h.miembros.includes(usuarioId))
    .map((h) => {
      const ultimo = h.mensajes[h.mensajes.length - 1] || null;
      return { hilo: h, id: h.id, titulo: tituloHilo(d, h, usuarioId), ultimo, ts: ultimo?.ts || h.creado || "", noLeidos: noLeidosHilo(h, usuarioId), fijado: (h.fijadoPor || []).includes(usuarioId), silenciado: (h.silenciadoPor || []).includes(usuarioId) };
    })
    .filter((x) => !nq || normaliza(x.titulo).includes(nq))
    .sort((a, b) => (b.fijado - a.fijado) || String(b.ts).localeCompare(String(a.ts)));
}

/** Busca texto en los mensajes de las conversaciones del usuario (solo las suyas). */
export function buscarMensajes(d, usuarioId, q, limite = 40) {
  const nq = normaliza(q).trim();
  if (nq.length < 2) return [];
  const out = [];
  for (const h of com(d).hilos) {
    if (!h.miembros.includes(usuarioId)) continue;
    for (const m of h.mensajes) if (normaliza(m.texto).includes(nq)) out.push({ hiloId: h.id, hilo: tituloHilo(d, h, usuarioId), msgId: m.id, de: m.de, ts: m.ts, texto: m.texto });
  }
  return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limite);
}

export function enviarMensaje(d, hiloId, { texto = "", imagen = null } = {}) {
  const u = actual(d);
  const h = hiloPropio(d, hiloId, u);
  const t = String(texto).trim();
  const img = validarImagen(imagen);
  if (!t && !img) throw new Error("Escribe un mensaje o adjunta una imagen.");
  if (t.length > 2000) throw new Error("El mensaje es demasiado largo (máximo 2,000 caracteres).");
  const m = { id: uid("MS"), de: u.id, sucursalId: sucActiva(d), ts: ahoraLocal(), texto: t, leidoPor: [u.id] };
  if (img) m.adjuntos = [{ tipo: "imagen", src: img }];
  h.mensajes.push(m);
  return m;
}
/** Marca como leídos todos los mensajes del hilo para el usuario (al abrir la conversación). Devuelve cuántos marcó. */
export function marcarHiloLeido(d, hiloId) {
  const u = actual(d);
  const h = hiloPropio(d, hiloId, u);
  let n = 0;
  h.mensajes.forEach((m) => { if (!m.leidoPor.includes(u.id)) { m.leidoPor.push(u.id); n++; } });
  return n;
}
export function fijarHilo(d, hiloId, valor) {
  const u = actual(d); const h = hiloPropio(d, hiloId, u);
  h.fijadoPor ||= [];
  const on = valor ?? !h.fijadoPor.includes(u.id);
  h.fijadoPor = h.fijadoPor.filter((x) => x !== u.id); if (on) h.fijadoPor.push(u.id);
  return on;
}
export function silenciarHilo(d, hiloId, valor) {
  const u = actual(d); const h = hiloPropio(d, hiloId, u);
  h.silenciadoPor ||= [];
  const on = valor ?? !h.silenciadoPor.includes(u.id);
  h.silenciadoPor = h.silenciadoPor.filter((x) => x !== u.id); if (on) h.silenciadoPor.push(u.id);
  return on;
}

/** Qué tipos de conversación puede crear este usuario. */
export function tiposHiloPermitidos(u) {
  const t = [{ v: "directo", l: "Mensaje directo" }];
  if (u.rol === "gerente") t.push({ v: "sucursal", l: "Canal de mi sucursal" });
  if (esCentral(u)) t.push({ v: "grupo", l: "Grupo" }, { v: "sucursal", l: "Canal por sucursal" }, { v: "rol", l: "Canal por rol / equipo" }, { v: "todos", l: "Toda la empresa" });
  return t;
}
/**
 * Crea una conversación. Directos: cualquiera (si ya existe, devuelve la existente). Grupos y «toda la empresa»: admin/dirección.
 * Canal de sucursal: gerente de esa sucursal o admin/dirección. Canal de rol: admin/dirección.
 * opts: { tipo: "directo"|"grupo"|"sucursal"|"rol"|"todos", nombre, miembros:[usuarioId], sucursalId, rol }
 */
export function crearHilo(d, { tipo, nombre = "", miembros = [], sucursalId = null, rol = null } = {}) {
  const u = actual(d);
  const c = com(d);
  const activos = (ids) => [...new Set(ids)].filter((id) => { const x = usuarioDe(d, id); return x && x.activo !== false; });
  const nuevo = (h) => { const hilo = { fijadoPor: [], silenciadoPor: [], creado: ahoraLocal(), creadoPor: u.id, mensajes: [], ...h, id: uid("H") }; c.hilos.push(hilo); return hilo; };
  if (tipo === "directo") {
    const otro = miembros.find((x) => x !== u.id);
    if (!otro || !usuarioDe(d, otro) || usuarioDe(d, otro).activo === false) throw new Error("Elige con quién quieres hablar.");
    const ya = c.hilos.find((h) => h.tipo === "directo" && h.miembros.length === 2 && h.miembros.includes(u.id) && h.miembros.includes(otro));
    return ya || nuevo({ tipo: "directo", nombre: null, miembros: [u.id, otro] });
  }
  if (tipo === "todos") {
    if (!esCentral(u)) throw new Error("Solo Administración o Dirección crean el canal de toda la empresa.");
    const ya = c.hilos.find((h) => h.global);
    if (ya) return ya;
    const h = nuevo({ tipo: "grupo", global: true, nombre: "Toda la empresa", miembros: d.usuarios.filter((x) => x.activo !== false).map((x) => x.id) });
    auditar(d, "crear_canal", "hilo", h.id, "Toda la empresa");
    return h;
  }
  if (tipo === "grupo") {
    if (!esCentral(u)) throw new Error("Solo Administración o Dirección crean grupos.");
    const m = activos([u.id, ...miembros]);
    if (!String(nombre).trim()) throw new Error("Ponle nombre al grupo.");
    if (m.length < 3) throw new Error("Un grupo necesita al menos 3 personas (tú y dos más).");
    const h = nuevo({ tipo: "grupo", nombre: String(nombre).trim(), miembros: m });
    auditar(d, "crear_grupo", "hilo", h.id, `${h.nombre} (${m.length} personas)`);
    return h;
  }
  if (tipo === "sucursal") {
    const sid = sucursalId || u.sucursales[0];
    if (!d.sucursales.some((s) => s.id === sid)) throw new Error("Elige una sucursal.");
    if (!(esCentral(u) || (u.rol === "gerente" && u.sucursales.includes(sid)))) throw new Error("Solo el gerente de esa sucursal o Administración crea su canal.");
    const gerentes = d.usuarios.filter((x) => x.rol === "gerente" && x.sucursales.includes(sid)).map((x) => x.id);
    const m = activos([u.id, ...gerentes, ...personasDeSucursal(d, sid).map((x) => x.id), ...miembros]);
    const h = nuevo({ tipo: "sucursal", sucursalId: sid, nombre: String(nombre).trim() || `Equipo ${nombreSucursal(d, sid)}`, miembros: m });
    auditar(d, "crear_canal", "hilo", h.id, `Canal de ${nombreSucursal(d, sid)}`);
    return h;
  }
  if (tipo === "rol") {
    if (!esCentral(u)) throw new Error("Solo Administración o Dirección crean canales por rol.");
    if (!rol || !ROL_ETIQUETA[rol]) throw new Error("Elige el rol o equipo del canal.");
    const m = activos([u.id, ...d.usuarios.filter((x) => x.rol === rol).map((x) => x.id)]);
    const h = nuevo({ tipo: "rol", rol, nombre: String(nombre).trim() || `Equipo ${ROL_ETIQUETA[rol]}`, miembros: m });
    auditar(d, "crear_canal", "hilo", h.id, `Canal de ${ROL_ETIQUETA[rol]}`);
    return h;
  }
  throw new Error("Tipo de conversación no válido.");
}

// Selector para el menú
export function mensajesNoLeidos(d, usuarioId) {
  return (d.com?.hilos || []).reduce((n, h) => (h.miembros.includes(usuarioId) && !(h.silenciadoPor || []).includes(usuarioId) ? n + noLeidosHilo(h, usuarioId) : n), 0);
}

// ═════════════════════════════ CORREO INTERNO ═════════════════════════════
export const CARPETAS_CORREO = [
  { v: "entrada", l: "Entrada" }, { v: "enviados", l: "Enviados" }, { v: "borradores", l: "Borradores" },
  { v: "destacados", l: "Destacados" }, { v: "archivados", l: "Archivados" },
];
const participa = (c, id) => c.de === id || (!c.borrador && (c.para.includes(id) || (c.cc || []).includes(id)));
export const correoVisiblePara = (c, id) => participa(c, id);
const esEntrada = (c, id) => !c.borrador && (c.para.includes(id) || (c.cc || []).includes(id));
const archivado = (c, id) => (c.archivadoPor || []).includes(id);
export const correoLeido = (c, id) => c.leidoPor.includes(id);

/** Correos de una carpeta, más recientes primero. f: { q, etiqueta, soloNoLeidos }. */
export function carpetaCorreo(d, usuarioId, carpeta, f = {}) {
  const nq = normaliza(f.q || "");
  let l = com(d).correos.filter((c) => {
    if (!participa(c, usuarioId)) return false;
    if (carpeta === "entrada") return esEntrada(c, usuarioId) && !archivado(c, usuarioId);
    if (carpeta === "enviados") return c.de === usuarioId && !c.borrador && !archivado(c, usuarioId);
    if (carpeta === "borradores") return c.de === usuarioId && c.borrador;
    if (carpeta === "destacados") return !c.borrador && (c.destacadoPor || []).includes(usuarioId);
    if (carpeta === "archivados") return !c.borrador && archivado(c, usuarioId);
    return false;
  });
  if (f.etiqueta) l = l.filter((c) => (c.etiquetas || []).includes(f.etiqueta));
  if (f.soloNoLeidos) l = l.filter((c) => !correoLeido(c, usuarioId));
  if (nq) l = l.filter((c) => normaliza(`${c.asunto} ${c.cuerpo} ${nombreDe(d, c.de)}`).includes(nq));
  return l.sort((a, b) => b.ts.localeCompare(a.ts));
}
/** Contadores para las pestañas: no leídos en entrada y totales en el resto. */
export function conteosCorreo(d, usuarioId) {
  const n = (carp, soloNL) => carpetaCorreo(d, usuarioId, carp, { soloNoLeidos: soloNL }).length;
  return { entrada: n("entrada", true), enviados: n("enviados"), borradores: n("borradores"), destacados: n("destacados"), archivados: n("archivados") };
}
/** Cadena de correos (misma conversación) visible para el usuario, del más antiguo al más reciente. */
export function hiloCorreo(d, usuarioId, correoId) {
  const c = com(d).correos.find((x) => x.id === correoId);
  if (!c) return [];
  const raiz = c.hiloId || c.id;
  return com(d).correos.filter((x) => (x.hiloId || x.id) === raiz && !x.borrador && participa(x, usuarioId)).sort((a, b) => a.ts.localeCompare(b.ts));
}
function correoPropio(d, id, u) {
  const c = com(d).correos.find((x) => x.id === id);
  if (!c || !participa(c, u.id)) throw new Error("No tienes acceso a este correo.");
  return c;
}
function limpiarEtiquetas(et) { return (et || []).filter((e) => ETIQUETAS_CORREO.includes(e)); }

/**
 * Envía un correo interno. para/cc: tokens (id de usuario o "g:todos" | "g:rol:<rol>" | "g:suc:<S#>"); se expanden a personas reales
 * y quedan en la entrada de cada destinatario. Admin, dirección y gerente pueden escribir a grupos; los demás roles, solo a personas.
 * Si viene borradorId, se reemplaza ese borrador. responderA: id del correo que se contesta (encadena la conversación).
 */
export function enviarCorreo(d, { para = [], cc = [], asunto = "", cuerpo = "", imagen = null, etiquetas = [], responderA = null, borradorId = null } = {}) {
  const u = actual(d);
  validarTokens(d, u, [...para, ...cc]);
  const pe = expandirDestinatarios(d, para).filter((x) => x !== u.id || para.includes(x));
  const ce = expandirDestinatarios(d, cc).filter((x) => !pe.includes(x));
  if (!pe.length) throw new Error("Agrega al menos un destinatario.");
  if (!String(asunto).trim()) throw new Error("Escribe el asunto del correo.");
  if (!String(cuerpo).trim() && !imagen) throw new Error("Escribe el mensaje del correo.");
  const img = validarImagen(imagen);
  const c = com(d);
  let orig = null;
  if (responderA) orig = correoPropio(d, responderA, u);
  if (borradorId) {
    const b = c.correos.find((x) => x.id === borradorId && x.borrador && x.de === u.id);
    if (!b) throw new Error("El borrador ya no existe.");
    c.correos = c.correos.filter((x) => x.id !== borradorId);
  }
  const id = uid("CO");
  const correo = {
    id, hiloId: orig ? (orig.hiloId || orig.id) : id, enRespuestaA: orig ? orig.id : null, de: u.id, sucursalId: sucActiva(d),
    para: pe, cc: ce, paraTokens: [...para], ccTokens: [...cc], asunto: String(asunto).trim(), cuerpo: String(cuerpo).trim(),
    ts: ahoraLocal(), leidoPor: [u.id], etiquetas: limpiarEtiquetas(etiquetas), destacadoPor: [], archivadoPor: [], borrador: false,
  };
  if (img) correo.adjuntos = [{ tipo: "imagen", nombre: "imagen.jpg", src: img }];
  c.correos.push(correo);
  if (orig && !orig.leidoPor.includes(u.id)) orig.leidoPor.push(u.id);
  if ([...para, ...cc].some((t) => String(t).startsWith("g:"))) auditar(d, "correo_a_grupo", "correo", id, `${correo.asunto} → ${pe.length + ce.length} personas`);
  return correo;
}
/** Guarda (o actualiza) un borrador. No valida destinatarios: puede estar incompleto. */
export function guardarBorrador(d, { id = null, para = [], cc = [], asunto = "", cuerpo = "", imagen = null, etiquetas = [], responderA = null } = {}) {
  const u = actual(d);
  validarTokens(d, u, [...para, ...cc]);
  if (!String(asunto).trim() && !String(cuerpo).trim() && !para.length) throw new Error("El borrador está vacío.");
  const img = validarImagen(imagen);
  const c = com(d);
  let b = id ? c.correos.find((x) => x.id === id) : null;
  if (id && (!b || !b.borrador || b.de !== u.id)) throw new Error("No puedes editar ese borrador.");
  if (!b) { b = { id: uid("CO"), de: u.id, borrador: true, leidoPor: [u.id], destacadoPor: [], archivadoPor: [], para: [], cc: [] }; b.hiloId = b.id; c.correos.push(b); }
  Object.assign(b, { sucursalId: sucActiva(d), paraTokens: [...para], ccTokens: [...cc], asunto: String(asunto).trim(), cuerpo: String(cuerpo), ts: ahoraLocal(), etiquetas: limpiarEtiquetas(etiquetas), enRespuestaA: responderA || null, adjuntos: img ? [{ tipo: "imagen", nombre: "imagen.jpg", src: img }] : undefined });
  return b;
}
export function eliminarBorrador(d, id) {
  const u = actual(d);
  const c = com(d);
  const b = c.correos.find((x) => x.id === id);
  if (!b || !b.borrador || b.de !== u.id) throw new Error("Solo puedes descartar tus propios borradores.");
  c.correos = c.correos.filter((x) => x.id !== id);
}
export function marcarCorreoLeido(d, id, leido = true) {
  const u = actual(d); const c = correoPropio(d, id, u);
  c.leidoPor = c.leidoPor.filter((x) => x !== u.id); if (leido) c.leidoPor.push(u.id);
}
function alternar(d, id, campo, valor) {
  const u = actual(d); const c = correoPropio(d, id, u);
  if (c.borrador) throw new Error("Un borrador no se puede destacar ni archivar.");
  c[campo] ||= [];
  const on = valor ?? !c[campo].includes(u.id);
  c[campo] = c[campo].filter((x) => x !== u.id); if (on) c[campo].push(u.id);
  return on;
}
export const destacarCorreo = (d, id, valor) => alternar(d, id, "destacadoPor", valor);
export const archivarCorreo = (d, id, valor) => alternar(d, id, "archivadoPor", valor);
export function etiquetarCorreo(d, id, etiquetas) {
  const u = actual(d); const c = correoPropio(d, id, u);
  c.etiquetas = limpiarEtiquetas(etiquetas);
}

const cita = (d, c) => `\n\n— El ${fechaCorta(c.ts)} a las ${hora(c.ts)}, ${nombreDe(d, c.de)} escribió:\n${String(c.cuerpo).split("\n").map((l) => `> ${l}`).join("\n")}`;
const conPrefijo = (p, a) => (new RegExp(`^${p}:`, "i").test(a) ? a : `${p}: ${a}`);
/** Campos prellenados para responder (o responder a todos) al correo `id`. */
export function armarRespuesta(d, id, { todos = false } = {}) {
  const u = actual(d); const c = correoPropio(d, id, u);
  const otros = todos ? [...c.para, ...(c.cc || [])].filter((x) => x !== u.id && x !== c.de) : [];
  const para = c.de === u.id ? [...c.para] : [c.de];
  return { para, cc: otros, asunto: conPrefijo("Re", c.asunto), cuerpo: cita(d, c), responderA: c.id, etiquetas: [...(c.etiquetas || [])] };
}
/** Campos prellenados para reenviar el correo `id`. */
export function armarReenvio(d, id) {
  const u = actual(d); const c = correoPropio(d, id, u);
  return { para: [], cc: [], asunto: conPrefijo("Fwd", c.asunto), cuerpo: cita(d, c), responderA: null, etiquetas: [...(c.etiquetas || [])] };
}

/**
 * INTEGRACIÓN: salida de correo a buzones externos (Gmail, Outlook…) y envío masivo.
 * Requiere contratar y configurar un proveedor de correo (pendiente). En la demo NO envía nada: solo devuelve el aviso.
 */
export function enviarCorreoExterno(correo, destinatariosExternos = []) {
  // INTEGRACIÓN: aquí iría la llamada al proveedor de correo (SMTP / API) desde el servidor, nunca desde el navegador.
  return { enviado: false, destinatarios: destinatariosExternos.length, motivo: "Simulación de demostración: la salida a correos externos y el envío masivo requieren configurar un proveedor de correo (pendiente). No se envió nada fuera del sistema." };
}

// Selector para el menú
export function correosNoLeidos(d, usuarioId) {
  return (d.com?.correos || []).reduce((n, c) => (esEntrada(c, usuarioId) && !archivado(c, usuarioId) && !c.leidoPor.includes(usuarioId) ? n + 1 : n), 0);
}

// ═════════════════════════════ FEED DE LA COMUNIDAD ═════════════════════════════
const puedeAvisar = (u) => ROLES_DIFUSION.includes(u.rol);
/** ¿Esta publicación la ve la persona? Toda la empresa, o la sucursal elegida (admin/dirección ven todo). */
export const publicacionVisible = (p, u) => p.alcance === "todos" || esCentral(u) || u.sucursales.includes(p.alcance);
/** ¿Puede moderar (editar, borrar, fijar) esta publicación? Admin/dirección todas; gerente las de su sucursal o de su gente. */
export function puedeModerar(d, u, p) {
  if (esCentral(u)) return true;
  if (u.rol !== "gerente") return false;
  if (p.alcance !== "todos") return u.sucursales.includes(p.alcance);
  const au = usuarioDe(d, p.autorId);
  return !!au && au.sucursales.some((s) => u.sucursales.includes(s));
}
export const puedeEditarPublicacion = (d, u, p) => p.autorId === u.id || puedeModerar(d, u, p);
export const puedeFijarPublicacion = (d, u, p) => ROLES_DIFUSION.includes(u.rol) && puedeModerar(d, u, p || { alcance: "todos", autorId: u.id });
export const tiposFeedPermitidos = (u) => TIPOS_FEED.filter((t) => t.v !== "aviso" || puedeAvisar(u));
function pub(d, id, u, { lectura = true } = {}) {
  const p = com(d).feed.find((x) => x.id === id);
  if (!p) throw new Error("La publicación no existe.");
  if (lectura && !publicacionVisible(p, u)) throw new Error("No tienes acceso a esta publicación.");
  return p;
}

/** Publicaciones visibles para el usuario: fijadas primero y luego por fecha. f: { tipo, sucursalId, q }. */
export function feedDe(d, usuarioId, f = {}) {
  const u = usuarioDe(d, usuarioId);
  if (!u) return [];
  const nq = normaliza(f.q || "");
  return com(d).feed
    .filter((p) => publicacionVisible(p, u))
    .filter((p) => !f.tipo || p.tipo === f.tipo)
    .filter((p) => !f.sucursalId || p.alcance === f.sucursalId || (f.sucursalId === "todos" && p.alcance === "todos"))
    .filter((p) => !nq || normaliza(`${p.titulo} ${p.texto} ${nombreDe(d, p.autorId)}`).includes(nq))
    .sort((a, b) => (Number(b.fijado) - Number(a.fijado)) || b.ts.localeCompare(a.ts));
}

/** Publica en el feed. Avisos: solo admin/dirección/gerente. Fijar: solo admin/dirección/gerente. Guarda usuario y sucursal. */
export function publicarFeed(d, { tipo, titulo = "", texto = "", imagen = null, alcance = "todos", fijado = false, etiquetadoId = null } = {}) {
  const u = actual(d);
  if (!TIPOS_FEED.some((t) => t.v === tipo)) throw new Error("Elige el tipo de publicación.");
  if (tipo === "aviso" && !puedeAvisar(u)) throw new Error("Solo Administración, Dirección y gerentes publican avisos oficiales.");
  if (!String(titulo).trim()) throw new Error("Ponle un título a la publicación.");
  const img = validarImagen(imagen);
  if (!String(texto).trim() && !img) throw new Error("Escribe el texto o agrega una imagen.");
  if (tipo === "foto" && !img) throw new Error("Una publicación de tipo Foto lleva imagen.");
  if (alcance !== "todos" && !d.sucursales.some((s) => s.id === alcance)) throw new Error("El alcance no es válido.");
  if (alcance !== "todos" && !esCentral(u) && !u.sucursales.includes(alcance)) throw new Error("Solo puedes publicar para toda la empresa o para tu sucursal.");
  if (tipo === "reconocimiento") {
    const t = usuarioDe(d, etiquetadoId);
    if (!t || t.activo === false) throw new Error("Elige a quién reconoces.");
  }
  if (fijado && !ROLES_DIFUSION.includes(u.rol)) throw new Error("Solo Administración, Dirección y gerentes fijan publicaciones.");
  const p = {
    id: uid("F"), autorId: u.id, sucursalId: sucActiva(d), ts: ahoraLocal(), tipo, titulo: String(titulo).trim(), texto: String(texto).trim(),
    imagen: img, fijado: !!fijado, alcance, etiquetadoId: tipo === "reconocimiento" ? etiquetadoId : null, reacciones: {}, comentarios: [],
  };
  com(d).feed.unshift(p);
  if (tipo === "aviso" || fijado) auditar(d, "publicar_aviso", "feed", p.id, p.titulo);
  return p;
}
export function editarPublicacion(d, id, { titulo, texto, imagen, alcance } = {}) {
  const u = actual(d); const p = pub(d, id, u);
  if (!puedeEditarPublicacion(d, u, p)) throw new Error("Solo puedes editar tus propias publicaciones.");
  if (titulo !== undefined) { if (!String(titulo).trim()) throw new Error("El título no puede quedar vacío."); p.titulo = String(titulo).trim(); }
  if (texto !== undefined) p.texto = String(texto).trim();
  if (imagen !== undefined) p.imagen = validarImagen(imagen);
  if (alcance !== undefined) {
    if (alcance !== "todos" && !d.sucursales.some((s) => s.id === alcance)) throw new Error("El alcance no es válido.");
    if (alcance !== "todos" && !esCentral(u) && !u.sucursales.includes(alcance)) throw new Error("Solo puedes publicar para toda la empresa o para tu sucursal.");
    p.alcance = alcance;
  }
  p.editado = true;
  if (p.autorId !== u.id) auditar(d, "moderar_editar", "feed", p.id, p.titulo);
  return p;
}
export function eliminarPublicacion(d, id) {
  const u = actual(d); const p = pub(d, id, u);
  if (!puedeEditarPublicacion(d, u, p)) throw new Error("Solo puedes eliminar tus propias publicaciones.");
  if (p.autorId !== u.id) auditar(d, "moderar_eliminar", "feed", p.id, `${p.titulo} (de ${nombreDe(d, p.autorId)})`);
  com(d).feed = com(d).feed.filter((x) => x.id !== id);
}
export function fijarPublicacion(d, id, valor) {
  const u = actual(d); const p = pub(d, id, u);
  if (!puedeFijarPublicacion(d, u, p)) throw new Error("Solo Administración, Dirección o el gerente de la sucursal fijan publicaciones.");
  p.fijado = valor ?? !p.fijado;
  auditar(d, p.fijado ? "fijar_publicacion" : "desfijar_publicacion", "feed", p.id, p.titulo);
  return p.fijado;
}
/** Alterna la reacción del usuario con ese emoji (una por emoji y persona, sin duplicar). Devuelve true si quedó reaccionada. */
export function reaccionar(d, id, emoji) {
  const u = actual(d); const p = pub(d, id, u);
  if (!REACCIONES.includes(emoji)) throw new Error("Reacción no válida.");
  p.reacciones ||= {};
  const lista = (p.reacciones[emoji] ||= []).filter((x) => x !== u.id);
  const ya = (p.reacciones[emoji] || []).includes(u.id);
  if (!ya) lista.push(u.id);
  if (lista.length) p.reacciones[emoji] = lista; else delete p.reacciones[emoji];
  return !ya;
}
export function comentarPublicacion(d, id, texto) {
  const u = actual(d); const p = pub(d, id, u);
  const t = String(texto || "").trim();
  if (!t) throw new Error("Escribe tu comentario.");
  if (t.length > 600) throw new Error("El comentario es muy largo (máximo 600 caracteres).");
  const c = { id: uid("FC"), de: u.id, ts: ahoraLocal(), texto: t };
  (p.comentarios ||= []).push(c);
  return c;
}
export function eliminarComentario(d, id, comentarioId) {
  const u = actual(d); const p = pub(d, id, u);
  const c = (p.comentarios || []).find((x) => x.id === comentarioId);
  if (!c) throw new Error("El comentario no existe.");
  if (c.de !== u.id && !puedeModerar(d, u, p)) throw new Error("Solo puedes eliminar tus propios comentarios.");
  if (c.de !== u.id) auditar(d, "moderar_comentario", "feed", p.id, `Comentario de ${nombreDe(d, c.de)}`);
  p.comentarios = p.comentarios.filter((x) => x.id !== comentarioId);
}
export function reaccionesTotales(p) { return Object.values(p.reacciones || {}).reduce((n, l) => n + l.length, 0); }
/** Marca el feed como visto (al abrir la pantalla): pone en cero «feedNuevos». */
export function marcarFeedVisto(d) {
  const u = actual(d);
  com(d).feedVisto ||= {};
  com(d).feedVisto[u.id] = ahoraLocal();
}

// Selector para el menú
export function feedNuevos(d, usuarioId) {
  const u = d.usuarios.find((x) => x.id === usuarioId);
  if (!u || !d.com) return 0;
  const visto = d.com.feedVisto?.[usuarioId] || "";
  return d.com.feed.filter((p) => p.autorId !== usuarioId && p.ts > visto && publicacionVisible(p, u)).length;
}
