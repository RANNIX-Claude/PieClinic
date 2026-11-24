// Dominio «plataforma»: módulos generales de la fábrica RANNIX (los del menú del IRP) sobre el estado local `d`.
//   Tablero DW · Control de ETL · Configuración · Documentos · Validación · Catálogos · Consulta a base de datos · Entrega · Consulta asistente
// Funciones puras sobre `d` (o su copia dentro de mutar()). Toda acción valida el rol del usuario en sesión, deja auditoría
// y guarda usuarioId + sucursalId. El motor del DW (vistas dw_dim_*, dw_fact_*, dw_kpi_*) vive en plataforma_dw.js y se reexporta aquí.
import { hoy, dia, redondear, diasEntre, ahoraLocal, normaliza, dinero, sumarDias } from "../lib/format.js";
import * as R from "./reglas.js";
import { auditar, uid, folio } from "./core.js";
import { PARAMS_DEFECTO } from "./seed.js";
import * as DW from "./plataforma_dw.js";
import { CATEGORIAS_DOC, INTEGRACIONES_BASE, NOMBRE_SERIE, VERSION_SISTEMA, seed as sembrarPlataforma } from "./dominios/plataforma.js";

export * from "./plataforma_dw.js";
export { CATEGORIAS_DOC, INTEGRACIONES_BASE, NOMBRE_SERIE, VERSION_SISTEMA };

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const r2 = redondear;
const num = (x) => (x === "" || x === null || x === undefined ? NaN : Number(x));
const txt = (s) => String(s ?? "").trim();
const igual = (a, b) => normaliza(txt(a)) === normaliza(txt(b));

// ═════════════════════════ Roles
export const actor = (d) => { const u = (d.usuarios || []).find((x) => x.id === (d.sesion && d.sesion.userId)); return u && u.activo !== false ? u : null; };
export const esCentral = (u) => !!u && (u.rol === "admin" || u.rol === "direccion");
export const esGerente = (u) => !!u && u.rol === "gerente";
const SOLO_CENTRAL = err("Esta función es solo de Administración central o Dirección.");
const central = (d) => { const u = actor(d); return esCentral(u) ? u : null; };
/** Sucursales cuyo DW puede ver el usuario: admin/dirección todas (null = sin filtro); gerente las suyas; el resto ninguna. */
export function alcanceDW(d, u) {
  if (esCentral(u)) return { ok: true, sucursalIds: null, todas: true };
  if (esGerente(u)) return { ok: true, sucursalIds: u.sucursales.filter((s) => d.sucursales.some((x) => x.id === s)), todas: false };
  return err("El tablero del data warehouse es para gerencia, Administración central y Dirección.");
}

// ═════════════════════════ Datos del dominio en estados guardados antes de que existiera
const CLAVES_PLATAFORMA = ["config", "documentos", "catalogos", "dw", "validacion", "entrega", "asistenteCalif"];
export const faltaPlataforma = (d) => CLAVES_PLATAFORMA.some((k) => d[k] === undefined || d[k] === null);
/**
 * Un navegador que guardó sus datos antes de este dominio no trae configuración, documentos, catálogos ni cargas del DW.
 * Esta función los siembra (solo lo que falte, sin tocar nada más) con la misma semilla determinista. Devuelve true si agregó algo.
 */
export function asegurarPlataforma(d) {
  if (!faltaPlataforma(d)) return false;
  let a = 20261121;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const F = (n) => sumarDias(hoy(), n);
  const util = { r, int: (x, y) => x + Math.floor(r() * (y - x + 1)), pick: (l) => l[Math.floor(r() * l.length)], F, DT: (n, h = 9, m = 0) => `${F(n)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
  d.contadores ||= {};
  const extra = sembrarPlataforma(d, util);
  CLAVES_PLATAFORMA.forEach((k) => { if (d[k] === undefined || d[k] === null) d[k] = extra[k]; });
  return true;
}

// ═════════════════════════ Tablero DW
/** Tablero ejecutivo del usuario en sesión. sucursalId opcional (admin: una sucursal; gerente: debe ser una de las suyas). */
export function tableroDW(d, { periodo = "7d", sucursalId = "", ref = hoy() } = {}) {
  const u = actor(d), al = alcanceDW(d, u);
  if (!al.ok) return al;
  let ids = al.sucursalIds;
  if (sucursalId) {
    if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
    if (ids && !ids.includes(sucursalId)) return err("El gerente solo ve el tablero de su sucursal.");
    ids = [sucursalId];
  }
  if (ids && !ids.length) return err("Tu cuenta no tiene sucursales asignadas.");
  return ok({ ...DW.datosTablero(d, { sucursalIds: ids, periodo, ref }), todas: al.todas && !sucursalId, sucursalesPermitidas: al.sucursalIds });
}
/** Registra en bitácora la exportación de una tabla del DW. */
export function registrarExportacionDW(d, objeto, filas) {
  const u = actor(d);
  if (!alcanceDW(d, u).ok) return SOLO_CENTRAL;
  auditar(d, "dw_exportado", "dw", objeto, `${objeto} · ${filas} filas (CSV)`);
  return ok();
}

// ═════════════════════════ Control de ETL
/** «Ejecutar ahora»: recalcula todas las tablas del DW, cuadra y registra la corrida. Solo administración. */
export function ejecutarCargaDW(d) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const corrida = DW.ejecutarETL(d, { origen: "manual", usuarioId: u.id, sucursalId: d.sesion.sucursalId });
  const malas = corrida.cuadre.filter((c) => !c.ok);
  auditar(d, "dw_carga", "dw", corrida.id, `${corrida.filas} filas en ${corrida.duracionMs} ms · ${corrida.estado === "ok" ? "cuadre en cero" : corrida.estado === "error" ? "con error" : `${malas.length} diferencia(s) en el cuadre`}`);
  return ok({ corrida });
}

// ═════════════════════════ Configuración general
export const ZONAS_HORARIAS = ["America/Mexico_City", "America/Cancun", "America/Monterrey", "America/Chihuahua", "America/Hermosillo", "America/Tijuana"];
export const MONEDAS = [["MXN", "Peso mexicano (MXN)"], ["USD", "Dólar estadounidense (USD)"]];
export const ESTADOS_INTEGRACION = { simulada: ["Simulada", "warn"], pendiente_llave: ["Pendiente de llave", "neutral"], desactivada: ["Desactivada", "bad"] };
export const CAMPOS_CONFIG = [
  { k: "nombreComercial", l: "Nombre comercial", g: "identidad", req: true },
  { k: "razonSocial", l: "Razón social", g: "fiscal", req: true },
  { k: "rfc", l: "RFC", g: "fiscal", req: true },
  { k: "regimenFiscal", l: "Régimen fiscal", g: "fiscal" },
  { k: "domicilioFiscal", l: "Domicilio fiscal", g: "fiscal" },
  { k: "cp", l: "Código postal fiscal", g: "fiscal" },
  { k: "lugarExpedicion", l: "Lugar de expedición (CP)", g: "fiscal" },
  { k: "telefono", l: "Teléfono de contacto", g: "identidad" },
  { k: "correo", l: "Correo de contacto", g: "identidad" },
  { k: "sitio", l: "Sitio web", g: "identidad" },
  { k: "colorPrimario", l: "Color primario", g: "identidad" },
  { k: "colorSecundario", l: "Color secundario", g: "identidad" },
  { k: "zonaHoraria", l: "Zona horaria", g: "regional" },
  { k: "moneda", l: "Moneda", g: "regional" },
  { k: "ivaPct", l: "IVA (%)", g: "regional" },
  { k: "preciosIncluyenIva", l: "Los precios de lista incluyen IVA", g: "regional" },
];
export const POLITICAS = [["devoluciones", "Devoluciones"], ["cancelacionCitas", "Cancelación de citas"], ["credito", "Crédito y cobranza"], ["privacidad", "Privacidad y expediente"]];
export const configDe = (d) => d.config || {};

export function validarConfig(v) {
  const e = {};
  if (txt(v.nombreComercial).length < 3) e.nombreComercial = "Captura el nombre comercial.";
  if (txt(v.razonSocial).length < 3) e.razonSocial = "Captura la razón social.";
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(txt(v.rfc).toUpperCase())) e.rfc = "RFC no válido (12 o 13 caracteres).";
  if (txt(v.cp) && !/^\d{5}$/.test(txt(v.cp))) e.cp = "El código postal lleva 5 dígitos.";
  if (txt(v.lugarExpedicion) && !/^\d{5}$/.test(txt(v.lugarExpedicion))) e.lugarExpedicion = "El lugar de expedición es un código postal de 5 dígitos.";
  if (txt(v.correo) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(txt(v.correo))) e.correo = "Correo no válido.";
  ["colorPrimario", "colorSecundario"].forEach((k) => { if (!/^#[0-9a-fA-F]{6}$/.test(txt(v[k]))) e[k] = "Usa un color hexadecimal (#rrggbb)."; });
  if (!ZONAS_HORARIAS.includes(v.zonaHoraria)) e.zonaHoraria = "Elige una zona horaria de la lista.";
  if (!MONEDAS.some(([m]) => m === v.moneda)) e.moneda = "Moneda no válida.";
  const iva = num(v.ivaPct);
  if (!(iva >= 0 && iva <= 100)) e.ivaPct = "El IVA va de 0 a 100.";
  return e;
}
const cambiosDe = (antes, despues, claves) => claves.filter((k) => String(antes[k] ?? "") !== String(despues[k] ?? "")).map((k) => `${k}: ${String(antes[k] ?? "—").slice(0, 40)} → ${String(despues[k] ?? "—").slice(0, 40)}`);
function sellar(d, u) { d.config.actualizado = ahoraLocal(); d.config.actualizadoPor = u.id; d.config.sucursalId = d.sesion.sucursalId; }

/** Guarda los datos generales (identidad, fiscales, regionales). Audita campo por campo (antes → después). */
export function guardarConfig(d, nuevos) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const cfg = (d.config ||= {});
  const v = { ...cfg, ...nuevos, rfc: txt(nuevos.rfc ?? cfg.rfc).toUpperCase(), ivaPct: num(nuevos.ivaPct ?? cfg.ivaPct), preciosIncluyenIva: !!(nuevos.preciosIncluyenIva ?? cfg.preciosIncluyenIva) };
  const e = validarConfig(v);
  if (Object.keys(e).length) return { ok: false, error: Object.values(e)[0], errores: e };
  const claves = CAMPOS_CONFIG.map((c) => c.k);
  const limpio = {};
  claves.forEach((k) => { limpio[k] = typeof v[k] === "string" ? txt(v[k]) : v[k]; });
  const cambios = cambiosDe(cfg, limpio, claves);
  if (!cambios.length) return err("No hay cambios que guardar.");
  Object.assign(cfg, limpio); sellar(d, u);
  auditar(d, "config_guardada", "config", "general", cambios.join(" · ").slice(0, 400));
  return ok({ cambios });
}
export function guardarPolitica(d, clave, texto) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (!POLITICAS.some(([k]) => k === clave)) return err("Política no válida.");
  if (txt(texto).length < 20) return err("Redacta la política (al menos 20 caracteres).");
  const pol = ((d.config ||= {}).politicas ||= {});
  if (txt(pol[clave]) === txt(texto)) return err("No hay cambios que guardar.");
  pol[clave] = txt(texto); sellar(d, u);
  auditar(d, "config_politica", "config", clave, `Política de ${clave} actualizada (${txt(texto).length} caracteres)`);
  return ok();
}
/** Logo: miniatura ya reducida (dataURL). Tope de tamaño para no llenar el almacenamiento del navegador. */
export const LOGO_MAX_BYTES = 90000;
export function guardarLogo(d, dataUrl) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (dataUrl !== null && !/^data:image\/(jpeg|png|webp);base64,/.test(String(dataUrl))) return err("El logo debe ser una imagen (JPG, PNG o WebP).");
  if (dataUrl && dataUrl.length > LOGO_MAX_BYTES) return err("La imagen es demasiado pesada; usa una más pequeña.");
  (d.config ||= {}).logo = dataUrl; sellar(d, u);
  auditar(d, dataUrl ? "config_logo" : "config_logo_quitado", "config", "logo", dataUrl ? `Logo actualizado (${Math.round(dataUrl.length / 1024)} KB)` : "Logo eliminado");
  return ok();
}
/** Integraciones: ninguna está contratada, así que el estado solo puede ser simulada / pendiente de llave / desactivada. */
export function guardarIntegracion(d, id, { estado, proveedor, nota }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const it = ((d.config ||= {}).integraciones ||= []).find((x) => x.id === id);
  if (!it) return err("Integración no encontrada.");
  if (!ESTADOS_INTEGRACION[estado]) return err("Estado no válido: mientras no exista la llave del servicio, una integración no puede marcarse como activa.");
  const antes = `${it.estado} · ${it.proveedor}`;
  it.estado = estado; it.proveedor = txt(proveedor) || it.proveedor; it.nota = txt(nota); sellar(d, u);
  auditar(d, "config_integracion", "config", id, `${it.nombre}: ${antes} → ${it.estado} · ${it.proveedor}`);
  return ok();
}
/** Series de folios: contador vigente y siguiente folio. */
export function seriesDe(d) {
  const cfg = configDe(d).series || {};
  const claves = [...new Set([...Object.keys(d.contadores || {}), ...Object.keys(cfg)])].sort();
  return claves.map((k) => {
    const ancho = (cfg[k] && cfg[k].ancho) || 4, actual = (d.contadores || {})[k] || 0;
    return { serie: k, nombre: (cfg[k] && cfg[k].nombre) || NOMBRE_SERIE[k] || "Serie sin descripción", actual, ancho, siguiente: `${k}-${String(actual + 1).padStart(ancho, "0")}`, enUso: k in (d.contadores || {}) };
  });
}
/** Cambia la descripción de una serie o adelanta su consecutivo. Nunca permite retroceder (duplicaría folios). */
export function ajustarSerie(d, serie, { nombre, siguiente }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (!/^[A-Z]{1,4}$/.test(String(serie))) return err("Serie no válida.");
  const cfg = (((d.config ||= {}).series ||= {})[serie] ||= { nombre: NOMBRE_SERIE[serie] || "", ancho: 4 });
  const actual = d.contadores[serie] || 0, cambios = [];
  if (nombre !== undefined && txt(nombre) !== cfg.nombre) { if (txt(nombre).length < 3) return err("Describe para qué se usa la serie."); cambios.push(`nombre: ${cfg.nombre} → ${txt(nombre)}`); cfg.nombre = txt(nombre); }
  if (siguiente !== undefined && siguiente !== "") {
    const n = num(siguiente);
    if (!Number.isInteger(n) || n < 1) return err("El siguiente número debe ser un entero positivo.");
    if (n <= actual) return err(`No se puede retroceder el consecutivo: ya se usó hasta el ${actual}. El siguiente mínimo es ${actual + 1}.`);
    if (n !== actual + 1) { cambios.push(`siguiente: ${actual + 1} → ${n}`); d.contadores[serie] = n - 1; }
  }
  if (!cambios.length) return err("No hay cambios que guardar.");
  sellar(d, u);
  auditar(d, "config_serie", "config", serie, `Serie ${serie} · ${cambios.join(" · ")}`);
  return ok({ cambios });
}

// ═════════════════════════ Documentos de la clínica
export const VISIBILIDAD_DOC = { todos: "Todo el personal", gerencia: "Gerencia y administración", admin: "Solo administración" };
export const ALERTAS_DOC = { vencido: ["Vencido", "bad"], por_vencer_30: ["Vence en 30 días o menos", "bad"], por_vencer_60: ["Vence en 60 días o menos", "warn"], por_vencer_90: ["Vence en 90 días o menos", "info"], vigente: ["Vigente", "ok"], sin_vigencia: ["Sin vencimiento", "neutral"] };
export const nombreCategoriaDoc = (id) => (CATEGORIAS_DOC.find((c) => c.id === id) || {}).nombre || id;
const docs = (d) => d.documentos || [];

/** Estado de vigencia con alerta a 30/60/90 días. dias = días que faltan (negativo = días vencido). */
export function estadoVigencia(doc, ref = hoy()) {
  if (!doc.vigencia) return { estado: "sin_vigencia", dias: null, etiqueta: "No vence", tono: "neutral" };
  const dias = diasEntre(ref, doc.vigencia);
  if (dias < 0) return { estado: "vencido", dias, etiqueta: `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}`, tono: "bad" };
  const estado = dias <= 30 ? "por_vencer_30" : dias <= 60 ? "por_vencer_60" : dias <= 90 ? "por_vencer_90" : "vigente";
  return { estado, dias, etiqueta: dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`, tono: ALERTAS_DOC[estado][1] };
}
/** ¿Puede este usuario VER el documento? Por nivel de visibilidad y por sucursal (los de la cadena no tienen sucursal). */
export function puedeVerDocumento(u, doc) {
  if (!u || u.activo === false) return false;
  if (esCentral(u)) return true;
  if (doc.estado === "archivado" && !esGerente(u)) return false;
  if (doc.visibilidad === "admin") return false;
  if (doc.visibilidad === "gerencia" && !esGerente(u)) return false;
  return doc.sucursalId == null || (u.sucursales || []).includes(doc.sucursalId);
}
/** ¿Puede editarlo/subirlo? Admin y dirección todo; gerente solo los de su sucursal que no sean de «solo administración». */
export function puedeEditarDocumento(u, doc) {
  if (esCentral(u)) return true;
  return esGerente(u) && doc.sucursalId != null && u.sucursales.includes(doc.sucursalId) && doc.visibilidad !== "admin";
}
export const puedeSubirDocumentos = (u) => esCentral(u) || esGerente(u);
export const documentosVisibles = (d, u) => docs(d).filter((x) => puedeVerDocumento(u, x));
export function filtrarDocumentos(lista, { texto = "", categoria = "", sucursalId = "", alerta = "", archivados = false } = {}, ref = hoy()) {
  const q = normaliza(texto);
  return lista.filter((x) => {
    if (!archivados && x.estado === "archivado") return false;
    if (archivados && x.estado !== "archivado") return false;
    if (categoria && x.categoria !== categoria) return false;
    if (sucursalId === "cadena" ? x.sucursalId != null : sucursalId && x.sucursalId !== sucursalId) return false;
    const v = estadoVigencia(x, ref).estado;
    if (alerta === "alertas" ? !["vencido", "por_vencer_30", "por_vencer_60", "por_vencer_90"].includes(v) : alerta && v !== alerta) return false;
    return !q || normaliza(`${x.titulo} ${x.folio} ${x.emisor} ${x.numero} ${x.notas} ${nombreCategoriaDoc(x.categoria)}`).includes(q);
  }).sort((a, b) => (a.vigencia || "9999").localeCompare(b.vigencia || "9999") || a.titulo.localeCompare(b.titulo, "es"));
}
export function resumenDocumentos(lista, ref = hoy()) {
  const r = { total: 0, vencido: 0, por_vencer_30: 0, por_vencer_60: 0, por_vencer_90: 0, vigente: 0, sin_vigencia: 0, sinArchivo: 0 };
  lista.forEach((x) => { if (x.estado === "archivado") return; r.total += 1; r[estadoVigencia(x, ref).estado] += 1; if (!x.archivo || x.archivo.tipo === "ninguno") r.sinArchivo += 1; });
  return r;
}
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f)) && !Number.isNaN(Date.parse(`${f}T00:00:00`));
export const MINIATURA_MAX_BYTES = 120000;
function validarArchivo(a) {
  if (!a || a.tipo === "ninguno") return null;
  if (a.tipo === "enlace") return /^https:\/\/[^\s]+\.[^\s]+$/.test(txt(a.url)) ? null : "El enlace debe empezar con https://";
  if (a.tipo === "imagen") {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(a.miniatura))) return "Adjunta una imagen válida.";
    return a.miniatura.length > MINIATURA_MAX_BYTES ? "La imagen es demasiado pesada; se guarda solo una miniatura." : null;
  }
  return "Tipo de archivo no válido.";
}
const archivoLimpio = (a) => (!a || a.tipo === "ninguno" ? { tipo: "ninguno", url: "", miniatura: null } : a.tipo === "enlace" ? { tipo: "enlace", url: txt(a.url), miniatura: null } : { tipo: "imagen", url: "", miniatura: a.miniatura });

export function validarDocumento(d, x, u = actor(d)) {
  const e = {};
  if (txt(x.titulo).length < 4) e.titulo = "Escribe el nombre del documento.";
  if (!CATEGORIAS_DOC.some((c) => c.id === x.categoria)) e.categoria = "Elige una categoría.";
  const suc = x.sucursalId || null;
  if (suc && !d.sucursales.some((s) => s.id === suc)) e.sucursalId = "Sucursal no válida.";
  if (!VISIBILIDAD_DOC[x.visibilidad]) e.visibilidad = "Elige quién puede verlo.";
  if (!fechaOk(x.emision)) e.emision = "Fecha de emisión no válida.";
  else if (x.emision > hoy()) e.emision = "La emisión no puede ser futura.";
  if (x.vigencia && !fechaOk(x.vigencia)) e.vigencia = "Fecha de vigencia no válida.";
  else if (x.vigencia && fechaOk(x.emision) && x.vigencia < x.emision) e.vigencia = "La vigencia no puede ser anterior a la emisión.";
  if (!d.usuarios.some((y) => y.id === x.responsableId && y.activo !== false)) e.responsableId = "Elige un responsable activo.";
  const a = validarArchivo(x.archivo);
  if (a) e.archivo = a;
  if (u && !esCentral(u)) {
    if (!esGerente(u)) e.permiso = "Solo gerencia y administración suben documentos.";
    else if (!suc || !u.sucursales.includes(suc)) e.sucursalId = "El gerente solo sube documentos de su sucursal.";
    else if (x.visibilidad === "admin") e.visibilidad = "El gerente no puede crear documentos de solo administración.";
  }
  const dup = docs(d).find((y) => y.id !== x.id && y.estado !== "archivado" && igual(y.titulo, x.titulo) && (y.sucursalId || null) === suc);
  if (dup) e.titulo = `Ya existe «${dup.titulo}» (${dup.folio}). Renueva ese documento en lugar de duplicarlo.`;
  return e;
}
/** Alta o edición de datos (no cambia la versión). */
export function guardarDocumento(d, x) {
  const u = actor(d);
  if (!puedeSubirDocumentos(u)) return err("Solo gerencia y administración suben documentos.");
  const previo = x.id ? docs(d).find((y) => y.id === x.id) : null;
  if (x.id && !previo) return err("Documento no encontrado.");
  if (previo && !puedeEditarDocumento(u, previo)) return err("No puedes modificar este documento.");
  const e = validarDocumento(d, x, u);
  if (Object.keys(e).length) return { ok: false, error: Object.values(e)[0], errores: e };
  const datos = { titulo: txt(x.titulo), categoria: x.categoria, sucursalId: x.sucursalId || null, emision: x.emision, vigencia: x.vigencia || null, responsableId: x.responsableId, emisor: txt(x.emisor), numero: txt(x.numero), visibilidad: x.visibilidad, notas: txt(x.notas), archivo: archivoLimpio(x.archivo) };
  if (previo) {
    const cambios = cambiosDe(previo, datos, ["titulo", "categoria", "sucursalId", "emision", "vigencia", "responsableId", "emisor", "numero", "visibilidad", "notas"]);
    if (JSON.stringify(previo.archivo) !== JSON.stringify(datos.archivo)) cambios.push("archivo actualizado");
    if (!cambios.length) return err("No hay cambios que guardar.");
    Object.assign(previo, datos, { actualizadoEn: ahoraLocal(), actualizadoPor: u.id });
    auditar(d, "documento_editado", "documento", previo.id, `${previo.folio} · ${cambios.join(" · ").slice(0, 300)}`);
    return ok({ documento: previo });
  }
  d.documentos ||= [];
  const nuevo = { id: uid("DC"), folio: folio(d, "DOC"), ...datos, version: 1, estado: "vigente", historial: [{ version: 1, fecha: hoy(), usuarioId: u.id, nota: "Carga inicial" }], usuarioId: u.id, sucursalRegistro: d.sesion.sucursalId, creadoEn: ahoraLocal() };
  d.documentos.unshift(nuevo);
  auditar(d, "documento_alta", "documento", nuevo.id, `${nuevo.folio} · ${nuevo.titulo} · ${nuevo.sucursalId ? R.nombreSucursal(d, nuevo.sucursalId) : "Cadena"}${nuevo.vigencia ? ` · vence ${nuevo.vigencia}` : ""}`);
  return ok({ documento: nuevo });
}
/** Renovación: sube la versión, cambia emisión/vigencia/archivo y deja la anterior en el historial. */
export function renovarDocumento(d, { id, emision, vigencia, archivo, nota = "" }) {
  const u = actor(d), x = docs(d).find((y) => y.id === id);
  if (!x) return err("Documento no encontrado.");
  if (!puedeEditarDocumento(u, x)) return err("No puedes renovar este documento.");
  if (!fechaOk(emision) || emision > hoy()) return err("Fecha de emisión no válida.");
  if (emision < x.emision) return err("La nueva emisión no puede ser anterior a la de la versión vigente.");
  if (vigencia && (!fechaOk(vigencia) || vigencia < emision)) return err("La vigencia no puede ser anterior a la emisión.");
  if (x.vigencia && !vigencia) return err("Captura la nueva fecha de vencimiento.");
  const a = validarArchivo(archivo);
  if (a) return err(a);
  const antes = x.vigencia;
  x.version += 1; x.emision = emision; x.vigencia = vigencia || null; x.estado = "vigente";
  if (archivo) x.archivo = archivoLimpio(archivo);
  x.historial.push({ version: x.version, fecha: hoy(), usuarioId: u.id, nota: txt(nota) || "Renovación" });
  x.actualizadoEn = ahoraLocal(); x.actualizadoPor = u.id;
  auditar(d, "documento_renovado", "documento", x.id, `${x.folio} · versión ${x.version} · vigencia ${antes || "—"} → ${x.vigencia || "sin vencimiento"}`);
  return ok({ documento: x });
}
export function archivarDocumento(d, id, archivar = true, motivo = "") {
  const u = actor(d), x = docs(d).find((y) => y.id === id);
  if (!x) return err("Documento no encontrado.");
  if (!puedeEditarDocumento(u, x)) return err("No puedes archivar este documento.");
  if (archivar && txt(motivo).length < 5) return err("Escribe el motivo para archivarlo.");
  x.estado = archivar ? "archivado" : "vigente"; x.actualizadoEn = ahoraLocal(); x.actualizadoPor = u.id;
  auditar(d, archivar ? "documento_archivado" : "documento_restaurado", "documento", x.id, `${x.folio} · ${x.titulo}${archivar ? ` · ${txt(motivo)}` : ""}`);
  return ok();
}
/** Documentos con alerta que le tocan al usuario (para avisos). */
export const alertasDocumentos = (d, u, ref = hoy()) => filtrarDocumentos(documentosVisibles(d, u), { alerta: "alertas" }, ref);

// ═════════════════════════ Catálogos generales
export const puedeVerCatalogos = (u) => esCentral(u) || esGerente(u);
export const TIPOS_MOTIVO = { devolucion: "Devolución", ajuste: "Ajuste de inventario", baja: "Baja de personal", cancelacion_cita: "Cancelación de cita" };
export const slug = (s) => normaliza(txt(s)).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const cats = (d) => (d.catalogos ||= { formasPago: [], motivos: [], categoriasProducto: [] });
const duplicado = (lista, campo, valor, exceptoId, extra = () => true) => (lista || []).find((x) => x.id !== exceptoId && extra(x) && igual(x[campo], valor));
const editor = (d) => central(d);

export function guardarSucursal(d, { id = null, nombre, direccion = "", telefono = "", consultorios = 3 }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  if (txt(nombre).length < 3) return err("Escribe el nombre de la sucursal.");
  const dup = duplicado(d.sucursales, "nombre", nombre, id);
  if (dup) return err(`Ya existe la sucursal «${dup.nombre}».`);
  const nc = Math.round(num(consultorios));
  if (!(nc >= 1 && nc <= 12)) return err("Los consultorios van de 1 a 12.");
  const lista = Array.from({ length: nc }, (_, i) => `C${i + 1}`);
  if (id) {
    const s = d.sucursales.find((x) => x.id === id);
    if (!s) return err("Sucursal no encontrada.");
    const usados = new Set(d.citas.filter((c) => c.sucursalId === id && dia(c.inicio) >= hoy() && !["cancelada", "no_asistio"].includes(c.estado)).map((c) => c.consultorioId));
    const falta = [...usados].find((c) => !lista.includes(c));
    if (falta) return err(`No se puede quitar el consultorio ${falta}: tiene citas programadas.`);
    const antes = `${s.nombre} · ${s.consultorios.length} consultorios`;
    Object.assign(s, { nombre: txt(nombre), direccion: txt(direccion), telefono: txt(telefono), consultorios: lista });
    const al = d.almacenes.find((x) => x.id === id);
    if (al) al.nombre = `Almacén ${s.nombre}`;
    auditar(d, "catalogo_sucursal_editada", "sucursal", id, `${antes} → ${s.nombre} · ${nc} consultorios`);
    return ok({ sucursal: s });
  }
  const n = d.sucursales.reduce((m, s) => Math.max(m, Number(String(s.id).slice(1)) || 0), 0) + 1;
  const s = { id: `S${n}`, nombre: txt(nombre), direccion: txt(direccion), telefono: txt(telefono), consultorios: lista, activa: true };
  d.sucursales.push(s);
  d.almacenes.push({ id: s.id, nombre: `Almacén ${s.nombre}` });
  d.params[s.id] = { ...PARAMS_DEFECTO };
  d.ajustesPrecio.push({ sucursalId: s.id, tipo: "*", itemId: "*", pct: 0 });
  auditar(d, "catalogo_sucursal_alta", "sucursal", s.id, `${s.nombre} · ${nc} consultorios · parámetros de fábrica y ajuste de precio 0 %`);
  return ok({ sucursal: s });
}
/** Razones que impiden desactivar una sucursal (operación viva). */
export function bloqueosSucursal(d, id) {
  const b = [];
  const turnos = d.turnos.filter((t) => t.sucursalId === id && t.estado === "abierto").length;
  const citas = d.citas.filter((c) => c.sucursalId === id && dia(c.inicio) >= hoy() && !["cancelada", "no_asistio", "atendida"].includes(c.estado)).length;
  const piezas = d.capas.filter((c) => c.almacenId === id).reduce((a, c) => a + c.cant, 0);
  if (turnos) b.push(`${turnos} turno(s) de caja abierto(s)`);
  if (citas) b.push(`${citas} cita(s) programada(s)`);
  if (piezas) b.push(`${piezas} pieza(s) en su almacén`);
  return b;
}
export function activarSucursal(d, id, activa) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const s = d.sucursales.find((x) => x.id === id);
  if (!s) return err("Sucursal no encontrada.");
  if (!activa) {
    const b = bloqueosSucursal(d, id);
    if (b.length) return err(`No se puede desactivar ${s.nombre}: tiene ${b.join(", ")}.`);
    if (d.sucursales.filter((x) => x.activa !== false).length <= 1) return err("Debe quedar al menos una sucursal activa.");
  }
  s.activa = !!activa;
  auditar(d, activa ? "catalogo_sucursal_activada" : "catalogo_sucursal_desactivada", "sucursal", id, s.nombre);
  return ok();
}
export function guardarCategoriaProducto(d, { id = null, nombre }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const c = cats(d);
  if (txt(nombre).length < 3) return err("Escribe el nombre de la categoría.");
  const dup = duplicado(c.categoriasProducto, "nombre", nombre, id);
  if (dup) return err(`Ya existe la categoría «${dup.nombre}».`);
  if (id) {
    const x = c.categoriasProducto.find((y) => y.id === id);
    if (!x) return err("Categoría no encontrada.");
    const antes = x.nombre;
    let n = 0;
    d.productos.forEach((p) => { if (p.categoria === antes) { p.categoria = txt(nombre); n += 1; } });
    x.nombre = txt(nombre);
    auditar(d, "catalogo_categoria_editada", "categoria_producto", id, `${antes} → ${x.nombre} · ${n} producto(s) actualizados`);
    return ok({ categoria: x, productos: n });
  }
  const x = { id: slug(nombre) || uid("cat"), nombre: txt(nombre), activa: true };
  if (c.categoriasProducto.some((y) => y.id === x.id)) x.id = `${x.id}_${c.categoriasProducto.length + 1}`;
  c.categoriasProducto.push(x);
  auditar(d, "catalogo_categoria_alta", "categoria_producto", x.id, x.nombre);
  return ok({ categoria: x });
}
export function activarCategoriaProducto(d, id, activa) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const x = cats(d).categoriasProducto.find((y) => y.id === id);
  if (!x) return err("Categoría no encontrada.");
  const n = d.productos.filter((p) => p.categoria === x.nombre && p.activo !== false).length;
  if (!activa && n) return err(`No se puede desactivar «${x.nombre}»: tiene ${n} producto(s) activo(s).`);
  x.activa = !!activa;
  auditar(d, activa ? "catalogo_categoria_activada" : "catalogo_categoria_desactivada", "categoria_producto", id, x.nombre);
  return ok();
}
/** Servicio: alta con precio; en edición el precio NO se toca aquí (va por Precios, con motivo e historial). */
export function guardarServicio(d, { id = null, nombre, duracion, precioBase }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  if (txt(nombre).length < 3) return err("Escribe el nombre del servicio.");
  const dup = duplicado(d.servicios, "nombre", nombre, id);
  if (dup) return err(`Ya existe el servicio «${dup.nombre}».`);
  const dur = Math.round(num(duracion));
  if (!(dur >= 10 && dur <= 240) || dur % 5) return err("La duración va de 10 a 240 minutos, en múltiplos de 5.");
  if (id) {
    const s = d.servicios.find((x) => x.id === id);
    if (!s) return err("Servicio no encontrado.");
    const antes = `${s.nombre} · ${s.duracion} min`;
    s.nombre = txt(nombre); s.duracion = dur;
    auditar(d, "catalogo_servicio_editado", "servicio", id, `${antes} → ${s.nombre} · ${dur} min`);
    return ok({ servicio: s });
  }
  const precio = num(precioBase);
  if (!(precio > 0)) return err("Captura el precio de lista (mayor a cero).");
  const n = d.servicios.reduce((m, s) => Math.max(m, Number(String(s.id).slice(2)) || 0), 0) + 1;
  const s = { id: `SV${n}`, nombre: txt(nombre), duracion: dur, precioBase: r2(precio), consumo: [], activo: true };
  d.servicios.push(s);
  auditar(d, "catalogo_servicio_alta", "servicio", s.id, `${s.nombre} · ${dur} min · ${dinero(s.precioBase)}`);
  return ok({ servicio: s });
}
export function guardarProducto(d, { id = null, sku, nombre, categoria, tipo = "venta", precioBase, costo, minimo }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const clave = txt(sku).toUpperCase();
  if (!/^[A-Z0-9]{2,5}-[A-Z0-9]{2,6}$/.test(clave)) return err("La clave (SKU) va como AAA-000.");
  if (txt(nombre).length < 3) return err("Escribe el nombre del producto.");
  if (duplicado(d.productos, "sku", clave, id)) return err(`Ya existe un producto con la clave ${clave}.`);
  const dup = duplicado(d.productos, "nombre", nombre, id);
  if (dup) return err(`Ya existe el producto «${dup.nombre}» (${dup.sku}).`);
  if (!["venta", "insumo"].includes(tipo)) return err("Tipo no válido.");
  const cat = cats(d).categoriasProducto.find((c) => c.nombre === categoria);
  if (!cat) return err("Elige una categoría del catálogo.");
  if (cat.activa === false) return err(`La categoría «${cat.nombre}» está desactivada.`);
  const min = Math.round(num(minimo));
  if (!(min >= 0 && min <= 9999)) return err("El mínimo debe ser un entero de 0 en adelante.");
  if (id) {
    const p = d.productos.find((x) => x.id === id);
    if (!p) return err("Producto no encontrado.");
    if (p.tipo !== tipo && d.capas.some((c) => c.productoId === id)) return err("No se puede cambiar el tipo de un producto con existencias.");
    const antes = `${p.sku} · ${p.nombre} · ${p.categoria} · mín ${p.minimo}`;
    Object.assign(p, { sku: clave, nombre: txt(nombre), categoria, tipo, minimo: min });
    auditar(d, "catalogo_producto_editado", "producto", id, `${antes} → ${p.sku} · ${p.nombre} · ${p.categoria} · mín ${min}`);
    return ok({ producto: p });
  }
  const precio = tipo === "insumo" ? 0 : num(precioBase), cst = num(costo);
  if (tipo === "venta" && !(precio > 0)) return err("Captura el precio de lista (mayor a cero).");
  if (!(cst > 0)) return err("Captura el costo de referencia (mayor a cero).");
  if (tipo === "venta" && precio <= cst) return err("El precio de lista debe ser mayor al costo.");
  const n = d.productos.reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0) + 1;
  const p = { id: `P${String(n).padStart(2, "0")}`, sku: clave, nombre: txt(nombre), categoria, tipo, precioBase: r2(precio), costo: r2(cst), minimo: min, activo: true };
  d.productos.push(p);
  auditar(d, "catalogo_producto_alta", "producto", p.id, `${p.sku} · ${p.nombre} · ${p.categoria} · ${tipo === "venta" ? dinero(p.precioBase) : "insumo"}`);
  return ok({ producto: p });
}
/** Activa o desactiva un servicio o producto. No se desactiva lo que tiene citas futuras o existencias. */
export function activarItem(d, tipo, id, activo) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const it = R.itemCatalogo(d, tipo, id);
  if (!it) return err("Registro no encontrado.");
  if (!activo && tipo === "servicio") {
    const n = d.citas.filter((c) => c.servicioId === id && dia(c.inicio) >= hoy() && !["cancelada", "no_asistio", "atendida"].includes(c.estado)).length;
    if (n) return err(`No se puede desactivar: tiene ${n} cita(s) programada(s).`);
  }
  if (!activo && tipo === "producto") {
    const n = d.capas.filter((c) => c.productoId === id).reduce((a, c) => a + c.cant, 0);
    if (n) return err(`No se puede desactivar: hay ${n} pieza(s) en existencia.`);
  }
  it.activo = !!activo;
  auditar(d, activo ? "catalogo_item_activado" : "catalogo_item_desactivado", tipo, id, it.nombre);
  return ok();
}
export function guardarFormaPago(d, { id = null, nombre, daCambio = false }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const c = cats(d);
  if (txt(nombre).length < 3) return err("Escribe el nombre de la forma de pago.");
  const dup = duplicado(c.formasPago, "nombre", nombre, id);
  if (dup) return err(`Ya existe la forma de pago «${dup.nombre}».`);
  if (id) {
    const x = c.formasPago.find((y) => y.id === id);
    if (!x) return err("Forma de pago no encontrada.");
    const antes = x.nombre;
    x.nombre = txt(nombre);
    if (!x.sistema) x.daCambio = !!daCambio;
    auditar(d, "catalogo_forma_pago_editada", "forma_pago", id, `${antes} → ${x.nombre}`);
    return ok({ forma: x });
  }
  const x = { id: slug(nombre), nombre: txt(nombre), activa: true, sistema: false, daCambio: !!daCambio };
  if (!x.id || c.formasPago.some((y) => y.id === x.id)) return err(`Ya existe una forma de pago con la clave «${x.id}».`);
  c.formasPago.push(x);
  auditar(d, "catalogo_forma_pago_alta", "forma_pago", x.id, x.nombre);
  return ok({ forma: x });
}
export function activarFormaPago(d, id, activa) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const x = cats(d).formasPago.find((y) => y.id === id);
  if (!x) return err("Forma de pago no encontrada.");
  if (!activa && x.sistema) return err(`«${x.nombre}» es una forma de pago del sistema: caja y tienda la usan y no se puede desactivar.`);
  x.activa = !!activa;
  auditar(d, activa ? "catalogo_forma_pago_activada" : "catalogo_forma_pago_desactivada", "forma_pago", id, x.nombre);
  return ok();
}
export function guardarMotivo(d, { id = null, tipo, nombre }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const c = cats(d);
  if (!TIPOS_MOTIVO[tipo]) return err("Tipo de motivo no válido.");
  if (txt(nombre).length < 3) return err("Escribe el motivo.");
  const dup = duplicado(c.motivos, "nombre", nombre, id, (x) => x.tipo === tipo);
  if (dup) return err(`Ya existe el motivo «${dup.nombre}» en ${TIPOS_MOTIVO[tipo].toLowerCase()}.`);
  if (id) {
    const x = c.motivos.find((y) => y.id === id);
    if (!x) return err("Motivo no encontrado.");
    const antes = x.nombre;
    x.nombre = txt(nombre);
    auditar(d, "catalogo_motivo_editado", "motivo", id, `${TIPOS_MOTIVO[x.tipo]}: ${antes} → ${x.nombre}`);
    return ok({ motivo: x });
  }
  const x = { id: uid("MO"), tipo, nombre: txt(nombre), activo: true };
  c.motivos.push(x);
  auditar(d, "catalogo_motivo_alta", "motivo", x.id, `${TIPOS_MOTIVO[tipo]}: ${x.nombre}`);
  return ok({ motivo: x });
}
export function activarMotivo(d, id, activo) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const x = cats(d).motivos.find((y) => y.id === id);
  if (!x) return err("Motivo no encontrado.");
  if (!activo && cats(d).motivos.filter((y) => y.tipo === x.tipo && y.activo !== false).length <= 1) return err("Debe quedar al menos un motivo activo de ese tipo.");
  x.activo = !!activo;
  auditar(d, activo ? "catalogo_motivo_activado" : "catalogo_motivo_desactivado", "motivo", id, x.nombre);
  return ok();
}
export function guardarLaboratorio(d, { id = null, nombre, contacto = "", telefono = "", diasEntrega = 14 }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  if (txt(nombre).length < 3) return err("Escribe el nombre del laboratorio.");
  const dup = duplicado(d.laboratorios, "nombre", nombre, id);
  if (dup) return err(`Ya existe el laboratorio «${dup.nombre}».`);
  const dias = Math.round(num(diasEntrega));
  if (!(dias >= 1 && dias <= 90)) return err("Los días de entrega van de 1 a 90.");
  const datos = { nombre: txt(nombre), contacto: txt(contacto), telefono: txt(telefono), diasEntrega: dias };
  if (id) {
    const x = d.laboratorios.find((y) => y.id === id);
    if (!x) return err("Laboratorio no encontrado.");
    const antes = x.nombre;
    Object.assign(x, datos);
    auditar(d, "catalogo_laboratorio_editado", "laboratorio", id, `${antes} → ${x.nombre} · ${dias} días`);
    return ok({ laboratorio: x });
  }
  const n = d.laboratorios.reduce((m, s) => Math.max(m, Number(String(s.id).slice(2)) || 0), 0) + 1;
  const x = { id: `LB${n}`, ...datos, activo: true };
  d.laboratorios.push(x);
  auditar(d, "catalogo_laboratorio_alta", "laboratorio", x.id, `${x.nombre} · ${dias} días`);
  return ok({ laboratorio: x });
}
export function activarLaboratorio(d, id, activo) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  const x = d.laboratorios.find((y) => y.id === id);
  if (!x) return err("Laboratorio no encontrado.");
  const abiertas = d.ordenesLab.filter((o) => o.laboratorioId === id && !["entregada", "cancelada"].includes(o.estado)).length;
  if (!activo && abiertas) return err(`No se puede desactivar: tiene ${abiertas} orden(es) en proceso.`);
  x.activo = !!activo;
  auditar(d, activo ? "catalogo_laboratorio_activado" : "catalogo_laboratorio_desactivado", "laboratorio", id, x.nombre);
  return ok();
}
/** Categorías de gasto (colección del dominio de Finanzas: solo alta y cambio de nombre/tipo; no se borran). */
export function guardarCategoriaGasto(d, { id = null, nombre, fijo = false, recurrente = false }) {
  const u = editor(d);
  if (!u) return SOLO_CENTRAL;
  if (!d.fin) return err("El módulo de Finanzas no está disponible.");
  if (txt(nombre).length < 3) return err("Escribe el nombre de la categoría.");
  const lista = (d.fin.categorias ||= []);
  const dup = duplicado(lista, "nombre", nombre, id);
  if (dup) return err(`Ya existe la categoría de gasto «${dup.nombre}».`);
  if (id) {
    const x = lista.find((y) => y.id === id);
    if (!x) return err("Categoría no encontrada.");
    const antes = `${x.nombre}${x.fijo ? " · fijo" : ""}`;
    Object.assign(x, { nombre: txt(nombre), fijo: !!fijo, recurrente: !!recurrente });
    auditar(d, "catalogo_categoria_gasto_editada", "categoria_gasto", id, `${antes} → ${x.nombre}${x.fijo ? " · fijo" : ""}`);
    return ok({ categoria: x });
  }
  const x = { id: slug(nombre), nombre: txt(nombre), fijo: !!fijo, recurrente: !!recurrente };
  if (!x.id || lista.some((y) => y.id === x.id)) return err(`Ya existe una categoría con la clave «${x.id}».`);
  lista.push(x);
  auditar(d, "catalogo_categoria_gasto_alta", "categoria_gasto", x.id, x.nombre);
  return ok({ categoria: x });
}
/** Uso de cada registro (para mostrar «en uso» y explicar por qué no se puede desactivar). */
export function usoCatalogo(d) {
  const cuenta = (arr, f) => { const m = {}; (arr || []).forEach((x) => { const k = f(x); if (k != null) m[k] = (m[k] || 0) + 1; }); return m; };
  const partidas = { servicio: {}, producto: {} };
  d.ventas.forEach((v) => (v.partidas || []).forEach((p) => { if (partidas[p.tipo]) partidas[p.tipo][p.itemId] = (partidas[p.tipo][p.itemId] || 0) + p.cant; }));
  return {
    citasPorSucursal: cuenta(d.citas, (c) => c.sucursalId), usuariosPorSucursal: cuenta(d.usuarios.flatMap((u) => u.sucursales.map((s) => ({ s }))), (x) => x.s),
    vendidos: partidas, productosPorCategoria: cuenta(d.productos, (p) => p.categoria), ordenesPorLab: cuenta(d.ordenesLab, (o) => o.laboratorioId),
    gastosPorCategoria: cuenta((d.fin && d.fin.gastos) || [], (g) => g.categoria), pagosPorForma: cuenta(d.ventas.flatMap((v) => v.pagos || []), (p) => p.forma),
    pacientesPorConvenio: cuenta(d.pacientes, (p) => p.convenioId), ocPorProveedor: cuenta(d.oc, (o) => o.proveedorId),
  };
}

// ═════════════════════════ Validación de integridad (cuadres sobre el estado real)
const caso = (ref, descripcion, extra = {}) => ({ ref: String(ref), descripcion, ...extra });
const cerca = (a, b, tol = 0.01) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol;
const min = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const idx = (arr) => new Set((arr || []).map((x) => x.id));
const ROLES_VALIDOS = ["recepcion", "podologo", "asistente", "cajero", "almacen", "gerente", "admin", "direccion"];
export const GRUPOS_VALIDACION = ["Ventas y caja", "Inventario", "Cartera y apartados", "Agenda y clínica", "Organización y catálogos", "Finanzas y personas", "Plataforma"];

/** Reglas de validación. revisar(d) devuelve los CASOS que fallan: [{ref, descripcion, fecha?, sucursalId?, importe?}]. */
export const REGLAS_VALIDACION = [
  { id: "ventas_partidas", grupo: "Ventas y caja", severidad: "error", modulo: "reportes", titulo: "Subtotal del ticket = suma de sus partidas",
    que: "El subtotal de cada ticket debe ser la suma de los importes de sus partidas, y cada importe debe ser precio × cantidad.",
    como: "Revisa el ticket: si se editó a mano, cancélalo y vuelve a cobrarlo.",
    revisar: (d) => d.ventas.flatMap((v) => {
      const suma = r2((v.partidas || []).reduce((a, p) => a + (Number(p.importe) || 0), 0)), f = [];
      if (!cerca(suma, v.subtotal ?? suma)) f.push(caso(v.folio, `Subtotal ${dinero(v.subtotal)} ≠ suma de partidas ${dinero(suma)}`, { fecha: dia(v.fecha), sucursalId: v.sucursalId, importe: r2((v.subtotal || 0) - suma) }));
      (v.partidas || []).forEach((p) => { if (!cerca(p.importe, p.precio * p.cant)) f.push(caso(v.folio, `Partida «${p.nombre}»: importe ${dinero(p.importe)} ≠ ${p.cant} × ${dinero(p.precio)}`, { fecha: dia(v.fecha), sucursalId: v.sucursalId, importe: r2(p.importe - p.precio * p.cant) })); });
      return f;
    }) },
  { id: "ventas_total", grupo: "Ventas y caja", severidad: "error", modulo: "reportes", titulo: "Total del ticket = subtotal − descuento",
    que: "El total cobrado debe ser el subtotal menos el descuento, y nunca negativo ni mayor al subtotal.",
    como: "Un total que no cuadra altera ventas, comisiones y bonos: corrige el ticket con una cancelación y nuevo cobro.",
    revisar: (d) => d.ventas.filter((v) => !cerca(v.total, (v.subtotal ?? v.total) - (v.descuento || 0)) || v.total < 0 || !Number.isFinite(Number(v.total)))
      .map((v) => caso(v.folio, `Total ${dinero(v.total)} ≠ subtotal ${dinero(v.subtotal)} − descuento ${dinero(v.descuento || 0)}`, { fecha: dia(v.fecha), sucursalId: v.sucursalId, importe: r2(v.total - ((v.subtotal || 0) - (v.descuento || 0))) })) },
  { id: "ventas_pagos", grupo: "Ventas y caja", severidad: "error", modulo: "reportes", titulo: "Pagos del ticket = total",
    que: "En un ticket pagado, la suma de sus pagos (efectivo, tarjeta, transferencia) debe ser igual al total.",
    como: "Si falta o sobra dinero el corte de caja no cuadra: revisa el ticket con el cajero.",
    revisar: (d) => d.ventas.filter((v) => v.estado === "pagada").flatMap((v) => {
      const pagos = r2((v.pagos || []).reduce((a, p) => a + (Number(p.monto) || 0), 0));
      return cerca(pagos, v.total) ? [] : [caso(v.folio, `Pagos ${dinero(pagos)} ≠ total ${dinero(v.total)}`, { fecha: dia(v.fecha), sucursalId: v.sucursalId, importe: r2(pagos - v.total) })];
    }) },
  { id: "ventas_folios", grupo: "Ventas y caja", severidad: "error", modulo: "reportes", titulo: "Folios de ticket únicos",
    que: "No puede haber dos tickets con el mismo folio.", como: "Folios repetidos indican un problema en el consecutivo de la serie T (Configuración ▸ Folios).",
    revisar: (d) => { const v = new Map(); d.ventas.forEach((x) => v.set(x.folio, (v.get(x.folio) || 0) + 1)); return [...v].filter(([, n]) => n > 1).map(([f, n]) => caso(f, `El folio aparece ${n} veces`)); } },
  { id: "ventas_referencias", grupo: "Ventas y caja", severidad: "error", modulo: "consulta-bd", titulo: "Tickets con referencias válidas",
    que: "Cada ticket debe apuntar a una sucursal, un cajero, un paciente (si lo lleva) y artículos que existan.", como: "Una referencia rota suele venir de un registro borrado: restáuralo o corrige el ticket.",
    revisar: (d) => { const s = idx(d.sucursales), u = idx(d.usuarios), p = idx(d.pacientes), sv = idx(d.servicios), pr = idx(d.productos);
      return d.ventas.flatMap((v) => { const f = [], c = (t) => f.push(caso(v.folio, t, { fecha: dia(v.fecha), sucursalId: v.sucursalId }));
        if (!s.has(v.sucursalId)) c(`Sucursal inexistente (${v.sucursalId})`);
        if (!u.has(v.cajeroId)) c(`Cajero inexistente (${v.cajeroId})`);
        if (v.pacienteId && !p.has(v.pacienteId)) c(`Paciente inexistente (${v.pacienteId})`);
        (v.partidas || []).forEach((x) => { if ((x.tipo === "servicio" && !sv.has(x.itemId)) || (x.tipo === "producto" && !pr.has(x.itemId))) c(`Partida «${x.nombre}» apunta a un artículo que no existe (${x.itemId})`); });
        return f; }); } },
  { id: "devoluciones", grupo: "Ventas y caja", severidad: "error", modulo: "reportes", titulo: "Devoluciones ligadas a su ticket y sin exceder su total",
    que: "Lo devuelto de un ticket no puede ser mayor a lo cobrado, y la devolución debe apuntar a un ticket existente.", como: "Revisa la devolución con el gerente que la autorizó.",
    revisar: (d) => { const v = new Map(d.ventas.map((x) => [x.id, x])), acum = new Map(), f = [];
      (d.devoluciones || []).filter((x) => !["rechazada", "cancelada"].includes(x.estado)).forEach((x) => {
        const t = v.get(x.ventaId);
        if (!t) { f.push(caso(x.folio || x.id, `La devolución apunta a un ticket que no existe (${x.ventaId})`, { fecha: x.fecha, importe: x.monto })); return; }
        acum.set(t.id, (acum.get(t.id) || 0) + (Number(x.monto) || 0));
      });
      acum.forEach((m, id) => { const t = v.get(id); if (m > t.total + 0.01) f.push(caso(t.folio, `Devuelto ${dinero(m)} > total del ticket ${dinero(t.total)}`, { fecha: dia(t.fecha), sucursalId: t.sucursalId, importe: r2(m - t.total) })); });
      return f; } },
  { id: "turnos", grupo: "Ventas y caja", severidad: "advertencia", modulo: "reportes", titulo: "Turnos de caja coherentes",
    que: "Un cajero no puede tener dos turnos abiertos, un turno cerrado debe tener corte y no deben quedar turnos abiertos de días anteriores.", como: "Pide al cajero cerrar su turno con corte; el gerente resuelve las diferencias.",
    revisar: (d) => { const f = [], ab = new Map();
      d.turnos.forEach((t) => {
        if (t.estado === "abierto") { ab.set(t.cajeroId, (ab.get(t.cajeroId) || 0) + 1); if (dia(t.abiertoEn) < hoy()) f.push(caso(t.id, `Turno abierto desde ${dia(t.abiertoEn)} sin cerrar (${R.nombreUsuario(d, t.cajeroId)})`, { fecha: dia(t.abiertoEn), sucursalId: t.sucursalId })); }
        if (t.estado === "cerrado" && !t.corte) f.push(caso(t.id, "Turno cerrado sin corte de caja", { fecha: dia(t.cerradoEn || t.abiertoEn), sucursalId: t.sucursalId }));
        if (t.cerradoEn && t.cerradoEn < t.abiertoEn) f.push(caso(t.id, "El cierre es anterior a la apertura", { fecha: dia(t.abiertoEn), sucursalId: t.sucursalId }));
      });
      ab.forEach((n, c) => { if (n > 1) f.push(caso(c, `${R.nombreUsuario(d, c)} tiene ${n} turnos abiertos a la vez`)); });
      return f; } },
  { id: "cortes", grupo: "Ventas y caja", severidad: "error", modulo: "reportes", titulo: "Cortes de caja: diferencia = contado − esperado",
    que: "En cada renglón del corte la diferencia debe ser lo contado menos lo esperado; un corte «conforme» no puede traer diferencia y uno con diferencia debe estar justificado.", como: "Reabre el corte (autorización del gerente) y vuelve a capturar el arqueo.",
    revisar: (d) => d.turnos.filter((t) => t.corte && Array.isArray(t.corte.filas)).flatMap((t) => { const f = [], x = { fecha: t.corte.fecha || dia(t.cerradoEn || t.abiertoEn), sucursalId: t.sucursalId };
      t.corte.filas.forEach((q) => { if (!cerca(q.diferencia, q.contado - q.esperado)) f.push(caso(t.id, `${q.forma}: diferencia ${dinero(q.diferencia)} ≠ contado ${dinero(q.contado)} − esperado ${dinero(q.esperado)}`, { ...x, importe: r2(q.diferencia - (q.contado - q.esperado)) })); });
      const dif = r2(t.corte.filas.reduce((a, q) => a + (q.diferencia || 0), 0)), hay = t.corte.filas.some((q) => Math.abs(q.diferencia || 0) >= 0.005);
      if (hay && t.corte.estado === "conforme") f.push(caso(t.id, `Corte marcado «conforme» con diferencia de ${dinero(dif)}`, { ...x, importe: dif }));
      if (hay && !String(t.corte.justificacion || "").trim()) f.push(caso(t.id, `Diferencia de ${dinero(dif)} sin justificación`, { ...x, importe: dif }));
      return f; }) },
  { id: "cortes_pendientes", grupo: "Ventas y caja", severidad: "advertencia", modulo: "reportes", titulo: "Diferencias de corte pendientes de resolver",
    que: "Cortes con faltante o sobrante que el gerente aún no resuelve.", como: "Gerente ▸ Caja y cartera ▸ resolver la diferencia del corte.",
    revisar: (d) => d.turnos.filter((t) => t.corte && t.corte.estado === "diferencia_pendiente").map((t) => { const dif = Array.isArray(t.corte.filas) ? r2(t.corte.filas.reduce((a, q) => a + (q.diferencia || 0), 0)) : 0; return caso(t.id, `${R.nombreSucursal(d, t.sucursalId)} · ${t.turno}: ${dif < 0 ? "faltante" : "sobrante"} de ${dinero(Math.abs(dif))} por resolver`, { fecha: t.corte.fecha, sucursalId: t.sucursalId, importe: dif }); }) },

  { id: "stock_negativo", grupo: "Inventario", severidad: "error", modulo: "consulta-bd", titulo: "Existencias nunca negativas",
    que: "Ninguna capa ni la existencia total de un producto en un almacén puede ser negativa.", como: "Haz un conteo cíclico del producto y registra el ajuste autorizado.",
    revisar: (d) => { const f = [], t = new Map();
      d.capas.forEach((c) => { if (c.cant < 0) f.push(caso(c.id, `Capa negativa: ${c.cant} de ${R.nombreProducto(d, c.productoId)} en ${R.nombreAlmacen(d, c.almacenId)}`, { fecha: c.fecha, sucursalId: c.almacenId, importe: r2(c.cant * c.costo) })); const k = `${c.almacenId}|${c.productoId}`; t.set(k, (t.get(k) || 0) + c.cant); });
      t.forEach((n, k) => { if (n < 0) { const [a, p] = k.split("|"); f.push(caso(k, `Existencia total negativa: ${n} de ${R.nombreProducto(d, p)} en ${R.nombreAlmacen(d, a)}`, { sucursalId: a })); } });
      return f; } },
  { id: "capas_peps", grupo: "Inventario", severidad: "error", modulo: "consulta-bd", titulo: "Capas PEPS coherentes",
    que: "Cada capa debe tener producto y almacén existentes, cantidad mayor a cero, costo mayor a cero y fecha no futura (la fecha decide el orden de salida).", como: "Corrige la entrada de mercancía que generó la capa.",
    revisar: (d) => { const p = idx(d.productos), a = idx(d.almacenes), ids = new Map();
      return d.capas.flatMap((c) => { const f = [], x = (t) => f.push(caso(c.id, t, { fecha: c.fecha, sucursalId: c.almacenId, importe: r2((c.cant || 0) * (c.costo || 0)) }));
        ids.set(c.id, (ids.get(c.id) || 0) + 1);
        if (ids.get(c.id) === 2) x("Identificador de capa repetido");
        if (!p.has(c.productoId)) x(`Producto inexistente (${c.productoId})`);
        if (!a.has(c.almacenId)) x(`Almacén inexistente (${c.almacenId})`);
        if (c.cant === 0) x("Capa en cero que no se depuró");
        if (!(c.costo > 0)) x(`Costo no válido (${c.costo})`);
        if (!/^\d{4}-\d{2}-\d{2}/.test(String(c.fecha))) x("Sin fecha de entrada"); else if (dia(c.fecha) > hoy()) x(`Fecha de entrada futura (${c.fecha})`);
        return f; }); } },
  { id: "costo_capa", grupo: "Inventario", severidad: "advertencia", modulo: "consulta-bd", titulo: "Costo de capa contra costo de catálogo",
    que: "Capas cuyo costo se aleja más de 50 % del costo de referencia del producto (posible error de captura en la compra).", como: "Revisa la factura de compra de esa capa.",
    revisar: (d) => { const p = new Map(d.productos.map((x) => [x.id, x])); return d.capas.filter((c) => { const x = p.get(c.productoId); return x && x.costo > 0 && Math.abs(c.costo - x.costo) / x.costo > 0.5; }).map((c) => caso(c.id, `${R.nombreProducto(d, c.productoId)} en ${R.nombreAlmacen(d, c.almacenId)}: capa a ${dinero(c.costo)} contra catálogo ${dinero(p.get(c.productoId).costo)}`, { fecha: c.fecha, sucursalId: c.almacenId, importe: r2((c.costo - p.get(c.productoId).costo) * c.cant) })); } },
  { id: "apartados_stock", grupo: "Inventario", severidad: "advertencia", modulo: "consulta-bd", titulo: "Apartados respaldados con existencia",
    que: "Las piezas apartadas de un producto en una sucursal no deben superar su existencia.", como: "Surte la sucursal con un traspaso o libera los apartados vencidos.",
    revisar: (d) => { const k = new Map(); d.apartados.filter((a) => a.estado === "activo").forEach((a) => k.set(`${a.sucursalId}|${a.productoId}`, 1));
      return [...k.keys()].flatMap((x) => { const [s, p] = x.split("|"), res = R.apartadoReservado(d, s, p), st = R.stock(d, s, p); return res > st ? [caso(x, `${R.nombreProducto(d, p)} en ${R.nombreSucursal(d, s)}: ${res} apartada(s), ${st} en existencia`, { sucursalId: s })] : []; }); } },
  { id: "traspasos", grupo: "Inventario", severidad: "error", modulo: "consulta-bd", titulo: "Traspasos: lo recibido no supera lo enviado",
    que: "En cada partida de traspaso lo recibido no puede ser mayor a lo enviado, ni lo enviado mayor a lo solicitado sin registro.", como: "Revisa la recepción del traspaso en Almacén.",
    revisar: (d) => { const al = idx(d.almacenes), pr = idx(d.productos); return d.traspasos.flatMap((t) => { const f = [], x = (m) => f.push(caso(t.folio, m, { fecha: t.fecha, sucursalId: t.destinoId }));
      if (!al.has(t.origenId) || !al.has(t.destinoId)) x("Almacén de origen o destino inexistente");
      if (t.origenId === t.destinoId) x("El origen y el destino son el mismo almacén");
      (t.partidas || []).forEach((p) => { if (!pr.has(p.productoId)) x(`Producto inexistente (${p.productoId})`); if ((p.recibido || 0) > (p.enviado || 0)) x(`${R.nombreProducto(d, p.productoId)}: recibido ${p.recibido} > enviado ${p.enviado}`); });
      return f; }); } },

  { id: "planes_parcialidades", grupo: "Cartera y apartados", severidad: "advertencia", modulo: "consulta-bd", titulo: "Parcialidades = monto financiado",
    que: "La suma del capital de las parcialidades de un plan debe ser el monto menos el enganche.", como: "Diferencias de centavos o pesos vienen del redondeo al dividir; la última parcialidad debe absorber el residuo.",
    revisar: (d) => d.planes.flatMap((p) => { const s = r2(p.parcialidades.reduce((a, x) => a + (x.capital || 0), 0)), fin = r2(p.monto - (p.enganche || 0)); return cerca(s, fin) ? [] : [caso(p.folio, `Parcialidades ${dinero(s)} ≠ financiado ${dinero(fin)} (diferencia ${dinero(r2(s - fin))})`, { fecha: p.creado, sucursalId: p.sucursalId, importe: r2(s - fin) })]; }) },
  { id: "planes_pagos", grupo: "Cartera y apartados", severidad: "error", modulo: "consulta-bd", titulo: "Cartera contra abonos",
    que: "Lo pagado de cada parcialidad debe coincidir con la suma de los abonos registrados a esa parcialidad, y nunca exceder su capital.", como: "Un abono sin registro o duplicado descuadra la cartera: revisa los abonos del plan en caja.",
    revisar: (d) => { const ab = new Map(); (d.abonosCredito || []).forEach((a) => { const k = `${a.planId}|${a.parcialidad}`; ab.set(k, (ab.get(k) || 0) + (a.capital != null ? Number(a.capital) : Number(a.monto) || 0)); });
      const planes = idx(d.planes), f = [];
      d.planes.forEach((p) => p.parcialidades.forEach((x) => { const a = r2(ab.get(`${p.id}|${x.n}`) || 0);
        if (!cerca(a, x.pagado || 0)) f.push(caso(p.folio, `Parcialidad ${x.n}: pagado ${dinero(x.pagado || 0)} ≠ abonos registrados ${dinero(a)}`, { fecha: x.vence, sucursalId: p.sucursalId, importe: r2((x.pagado || 0) - a) }));
        if ((x.pagado || 0) > x.capital + 0.01) f.push(caso(p.folio, `Parcialidad ${x.n}: pagado ${dinero(x.pagado)} > capital ${dinero(x.capital)}`, { fecha: x.vence, sucursalId: p.sucursalId, importe: r2(x.pagado - x.capital) })); }));
      (d.abonosCredito || []).forEach((a) => { if (!planes.has(a.planId)) f.push(caso(a.id, `Abono a un plan que no existe (${a.planId})`, { fecha: a.fecha, sucursalId: a.sucursalId, importe: a.monto })); });
      return f; } },
  { id: "planes_estado", grupo: "Cartera y apartados", severidad: "error", modulo: "consulta-bd", titulo: "Estado del plan acorde a su saldo",
    que: "Un plan «liquidado» no puede tener saldo y uno «vigente» no puede estar totalmente pagado.", como: "Registra el abono faltante o corrige el estado del plan.",
    revisar: (d) => d.planes.flatMap((p) => { const saldo = r2(p.parcialidades.reduce((a, x) => a + Math.max(0, x.capital - (x.pagado || 0)), 0));
      if (p.estado === "liquidado" && saldo > 0.01) return [caso(p.folio, `Plan liquidado con saldo de ${dinero(saldo)}`, { fecha: p.creado, sucursalId: p.sucursalId, importe: saldo })];
      if (p.estado === "vigente" && saldo <= 0.01) return [caso(p.folio, "Plan vigente ya totalmente pagado (debería estar liquidado)", { fecha: p.creado, sucursalId: p.sucursalId })];
      return []; }) },
  { id: "credito_limite", grupo: "Cartera y apartados", severidad: "advertencia", modulo: "consulta-bd", titulo: "Saldo de crédito dentro del límite",
    que: "Pacientes con planes vigentes sin línea de crédito, o con saldo mayor a su límite.", como: "Amplía el límite con autorización o bloquea el crédito del paciente.",
    revisar: (d) => { const f = [], vistos = new Set();
      d.planes.filter((p) => p.estado === "vigente").forEach((p) => { if (vistos.has(p.pacienteId)) return; vistos.add(p.pacienteId);
        const c = R.credito(d, p.pacienteId), saldo = R.saldoCreditoPaciente(d, p.pacienteId);
        if (!c) f.push(caso(p.folio, `${R.nombrePaciente(d, p.pacienteId)} tiene un plan vigente sin línea de crédito`, { sucursalId: p.sucursalId, importe: saldo }));
        else if (saldo > c.limite + 0.01) f.push(caso(p.folio, `${R.nombrePaciente(d, p.pacienteId)}: saldo ${dinero(saldo)} > límite ${dinero(c.limite)}`, { sucursalId: p.sucursalId, importe: r2(saldo - c.limite) })); });
      return f; } },
  { id: "apartados", grupo: "Cartera y apartados", severidad: "error", modulo: "consulta-bd", titulo: "Apartados: abonos no exceden el precio",
    que: "Lo abonado a un apartado no puede ser mayor a su precio, y el vencimiento no puede ser anterior a su creación.", como: "Devuelve el excedente o corrige el abono duplicado.",
    revisar: (d) => d.apartados.flatMap((a) => { const pag = R.pagadoApartado(a), f = [];
      if (pag > a.precio + 0.01) f.push(caso(a.folio, `Abonado ${dinero(pag)} > precio ${dinero(a.precio)}`, { fecha: a.creado, sucursalId: a.sucursalId, importe: r2(pag - a.precio) }));
      if (a.vence < a.creado) f.push(caso(a.folio, `Vence (${a.vence}) antes de crearse (${a.creado})`, { fecha: a.creado, sucursalId: a.sucursalId }));
      return f; }) },
  { id: "apartados_vencidos", grupo: "Cartera y apartados", severidad: "advertencia", modulo: "consulta-bd", titulo: "Apartados vencidos sin liberar o con anticipo menor al mínimo",
    que: "Apartados activos cuya vigencia ya pasó (siguen reservando mercancía) o cuyo anticipo quedó por debajo del mínimo de la sucursal.", como: "Caja ▸ Apartados: libera el apartado (se aplica la política de anticipo) o gestiona la prórroga con el gerente.",
    revisar: (d) => d.apartados.filter((a) => a.estado === "activo").flatMap((a) => { const f = [], x = { fecha: a.vence, sucursalId: a.sucursalId, importe: R.pagadoApartado(a) };
      if (R.estadoApartado(a) === "vencido") f.push(caso(a.folio, `Venció el ${a.vence} y sigue activo (${a.nombre})`, x));
      const mn = d.params[a.sucursalId] ? R.anticipoMinimo(d, a.sucursalId, a.precio) : 0, prim = (a.abonos[0] || {}).monto || 0;
      if (prim + 0.01 < mn) f.push(caso(a.folio, `Anticipo ${dinero(prim)} menor al mínimo de ${dinero(mn)}`, x));
      return f; }) },

  { id: "citas_empalme", grupo: "Agenda y clínica", severidad: "error", modulo: "consulta-bd", titulo: "Citas sin empalme",
    que: "Dos citas activas no pueden ocupar el mismo consultorio al mismo tiempo, ni un podólogo atender dos citas a la vez.", como: "Reagenda una de las dos citas desde Recepción ▸ Agenda.",
    revisar: (d) => { const act = d.citas.filter((c) => !["cancelada", "no_asistio"].includes(c.estado)), f = [];
      const cruzar = (clave, texto) => { const g = new Map(); act.forEach((c) => { const k = clave(c); if (!g.has(k)) g.set(k, []); g.get(k).push(c); });
        g.forEach((l) => { l.sort((a, b) => a.inicio.localeCompare(b.inicio)); for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; if (min(b.inicio.slice(11, 16)) < min(a.inicio.slice(11, 16)) + (a.duracion || 0)) f.push(caso(`${a.id}/${b.id}`, texto(a, b), { fecha: dia(b.inicio), sucursalId: b.sucursalId })); } }); };
      cruzar((c) => `${c.sucursalId}|${c.consultorioId}|${dia(c.inicio)}`, (a, b) => `Consultorio ${b.consultorioId} de ${R.nombreSucursal(d, b.sucursalId)}: cita de ${a.inicio.slice(11, 16)} (${a.duracion} min) se empalma con la de ${b.inicio.slice(11, 16)}`);
      cruzar((c) => `${c.podologoId}|${dia(c.inicio)}`, (a, b) => `${R.nombreUsuario(d, b.podologoId)}: cita de ${a.inicio.slice(11, 16)} (${a.duracion} min, ${R.nombreSucursal(d, a.sucursalId)}) se empalma con la de ${b.inicio.slice(11, 16)} (${R.nombreSucursal(d, b.sucursalId)})`);
      return f; } },
  { id: "citas_referencias", grupo: "Agenda y clínica", severidad: "error", modulo: "consulta-bd", titulo: "Citas con referencias válidas",
    que: "Cada cita debe apuntar a un paciente, servicio, podólogo, sucursal y consultorio que existan.", como: "Reagenda la cita con datos válidos.",
    revisar: (d) => { const p = idx(d.pacientes), s = idx(d.servicios), u = new Map(d.usuarios.map((x) => [x.id, x])), su = new Map(d.sucursales.map((x) => [x.id, x]));
      return d.citas.flatMap((c) => { const f = [], x = (t) => f.push(caso(c.id, t, { fecha: dia(c.inicio), sucursalId: c.sucursalId }));
        if (!p.has(c.pacienteId)) x(`Paciente inexistente (${c.pacienteId})`);
        if (!s.has(c.servicioId)) x(`Servicio inexistente (${c.servicioId})`);
        const pod = u.get(c.podologoId); if (!pod) x(`Podólogo inexistente (${c.podologoId})`); else if (pod.rol !== "podologo") x(`${pod.nombre} no es podólogo`);
        const suc = su.get(c.sucursalId); if (!suc) x(`Sucursal inexistente (${c.sucursalId})`); else if (!(suc.consultorios || []).includes(c.consultorioId)) x(`El consultorio ${c.consultorioId} no existe en ${suc.nombre}`);
        return f; }); } },
  { id: "citas_rotacion", grupo: "Agenda y clínica", severidad: "advertencia", modulo: "rotacion", titulo: "Citas futuras en sucursales donde el podólogo no está asignado",
    que: "Citas programadas con un podólogo en una sucursal que no tiene asignada en su rotación.", como: "Administración ▸ Rotación de podólogos: asigna la sucursal o reagenda la cita.",
    revisar: (d) => { const u = new Map(d.usuarios.map((x) => [x.id, x])); return d.citas.filter((c) => dia(c.inicio) >= hoy() && !["cancelada", "no_asistio", "atendida"].includes(c.estado)).flatMap((c) => { const p = u.get(c.podologoId); return p && !p.sucursales.includes(c.sucursalId) ? [caso(c.id, `${p.nombre} tiene cita el ${dia(c.inicio)} en ${R.nombreSucursal(d, c.sucursalId)}, que no está en su rotación`, { fecha: dia(c.inicio), sucursalId: c.sucursalId })] : []; }); } },
  { id: "consultas_cobradas", grupo: "Agenda y clínica", severidad: "error", modulo: "consulta-bd", titulo: "Consultas cobradas con su ticket",
    que: "Toda consulta «cobrada» debe tener un ticket no cancelado que la referencie; un ticket no puede cobrar dos consultas ni una consulta tener dos tickets.", como: "Si el ticket se canceló, la consulta debe volver a «por cobrar».",
    revisar: (d) => { const v = new Map(d.ventas.map((x) => [x.id, x])), f = [], porConsulta = new Map();
      d.ventas.filter((x) => x.consultaId && x.estado !== "cancelada").forEach((x) => porConsulta.set(x.consultaId, (porConsulta.get(x.consultaId) || 0) + 1));
      d.consultas.forEach((c) => { const x = { fecha: dia(c.fecha), sucursalId: c.sucursalId };
        if (c.estado === "cobrada") { const t = v.get(c.ventaId);
          if (!t) f.push(caso(c.id, `Consulta cobrada sin ticket (ventaId ${c.ventaId || "vacío"})`, x));
          else if (t.estado === "cancelada") f.push(caso(c.id, `Consulta cobrada con el ticket ${t.folio} cancelado`, { ...x, importe: t.total }));
          else if (t.consultaId !== c.id) f.push(caso(c.id, `El ticket ${t.folio} no referencia a esta consulta`, x)); }
        else if (c.ventaId && v.get(c.ventaId) && v.get(c.ventaId).estado !== "cancelada") f.push(caso(c.id, `Consulta en estado «${c.estado}» pero ya tiene el ticket ${v.get(c.ventaId).folio}`, x));
        if ((porConsulta.get(c.id) || 0) > 1) f.push(caso(c.id, `La consulta tiene ${porConsulta.get(c.id)} tickets vigentes`, x)); });
      return f; } },
  { id: "consultas_citas", grupo: "Agenda y clínica", severidad: "advertencia", modulo: "consulta-bd", titulo: "Citas atendidas con su consulta",
    que: "Cada cita «atendida» debe tener su consulta clínica, y cada consulta su cita y su paciente.", como: "El podólogo debe cerrar la nota de la consulta.",
    revisar: (d) => { const porCita = new Set(d.consultas.map((c) => c.citaId)), citas = idx(d.citas), pac = idx(d.pacientes), f = [];
      d.citas.filter((c) => c.estado === "atendida" && !porCita.has(c.id)).forEach((c) => f.push(caso(c.id, `Cita atendida el ${dia(c.inicio)} sin consulta registrada`, { fecha: dia(c.inicio), sucursalId: c.sucursalId })));
      d.consultas.forEach((c) => { if (c.citaId && !citas.has(c.citaId)) f.push(caso(c.id, `Consulta de una cita que no existe (${c.citaId})`, { fecha: dia(c.fecha), sucursalId: c.sucursalId })); if (!pac.has(c.pacienteId)) f.push(caso(c.id, `Consulta de un paciente que no existe (${c.pacienteId})`, { fecha: dia(c.fecha), sucursalId: c.sucursalId })); });
      return f; } },
  { id: "consultas_por_cobrar", grupo: "Agenda y clínica", severidad: "advertencia", modulo: "reportes", titulo: "Consultas cerradas sin cobrar de días anteriores",
    que: "Consultas cerradas por el podólogo que no pasaron por caja el mismo día.", como: "Caja ▸ Por cobrar: cobra la consulta o documenta por qué no se cobró.",
    revisar: (d) => d.consultas.filter((c) => c.estado === "cerrada" && dia(c.fecha) < hoy()).map((c) => caso(c.id, `${R.nombrePaciente(d, c.pacienteId)} · consulta del ${dia(c.fecha)} en ${R.nombreSucursal(d, c.sucursalId)} sin cobrar`, { fecha: dia(c.fecha), sucursalId: c.sucursalId })) },
  { id: "laboratorio", grupo: "Agenda y clínica", severidad: "error", modulo: "consulta-bd", titulo: "Órdenes de laboratorio con referencias válidas",
    que: "Cada orden debe apuntar a paciente, podólogo, sucursal y laboratorio existentes, y la fecha prometida no puede ser anterior al envío.", como: "Corrige la orden desde el podólogo que la prescribió.",
    revisar: (d) => { const p = idx(d.pacientes), u = idx(d.usuarios), s = idx(d.sucursales), l = idx(d.laboratorios);
      return d.ordenesLab.flatMap((o) => { const f = [], x = (t) => f.push(caso(o.folio, t, { fecha: o.enviada, sucursalId: o.sucursalId }));
        if (!p.has(o.pacienteId)) x(`Paciente inexistente (${o.pacienteId})`); if (!u.has(o.podologoId)) x(`Podólogo inexistente (${o.podologoId})`);
        if (!s.has(o.sucursalId)) x(`Sucursal inexistente (${o.sucursalId})`); if (!l.has(o.laboratorioId)) x(`Laboratorio inexistente (${o.laboratorioId})`);
        if (o.enviada && o.prometida && o.prometida < o.enviada) x(`Prometida (${o.prometida}) antes del envío (${o.enviada})`);
        return f; }); } },

  { id: "usuarios", grupo: "Organización y catálogos", severidad: "error", modulo: "usuarios", titulo: "Usuarios y sucursales válidos",
    que: "Cada usuario debe tener un rol del sistema, al menos una sucursal existente, y correo único.", como: "Configuración ▸ Usuarios y roles.",
    revisar: (d) => { const s = idx(d.sucursales), correos = new Map(), f = [];
      d.usuarios.forEach((u) => { if (!ROLES_VALIDOS.includes(u.rol)) f.push(caso(u.id, `${u.nombre}: rol desconocido «${u.rol}»`));
        if (!Array.isArray(u.sucursales) || !u.sucursales.length) f.push(caso(u.id, `${u.nombre} no tiene sucursal asignada`));
        (u.sucursales || []).forEach((x) => { if (!s.has(x)) f.push(caso(u.id, `${u.nombre} está asignado a una sucursal que no existe (${x})`)); });
        if (u.correo) correos.set(u.correo.toLowerCase(), [...(correos.get(u.correo.toLowerCase()) || []), u.nombre]); });
      correos.forEach((l, c) => { if (l.length > 1) f.push(caso(c, `Correo repetido en ${l.length} usuarios: ${l.join(", ")}`)); });
      return f; } },
  { id: "sucursales", grupo: "Organización y catálogos", severidad: "error", modulo: "catalogos", titulo: "Sucursales completas",
    que: "Cada sucursal activa necesita parámetros, almacén, ajuste general de precio, al menos un consultorio y un gerente activo.", como: "Catálogos ▸ Sucursales y Configuración ▸ Parámetros por sucursal.",
    revisar: (d) => d.sucursales.filter((s) => s.activa !== false).flatMap((s) => { const f = [], x = (t) => f.push(caso(s.id, `${s.nombre}: ${t}`, { sucursalId: s.id }));
      if (!d.params[s.id]) x("sin parámetros de sucursal"); if (!d.almacenes.some((a) => a.id === s.id)) x("sin almacén");
      if (!d.ajustesPrecio.some((a) => a.sucursalId === s.id && a.tipo === "*")) x("sin ajuste general de precio"); if (!(s.consultorios || []).length) x("sin consultorios");
      if (!d.usuarios.some((u) => u.rol === "gerente" && u.activo !== false && u.sucursales.includes(s.id))) x("sin gerente activo");
      return f; }) },
  { id: "catalogo_duplicados", grupo: "Organización y catálogos", severidad: "error", modulo: "catalogos", titulo: "Catálogos sin duplicados",
    que: "No puede haber dos productos con la misma clave (SKU), ni dos productos, servicios o sucursales con el mismo nombre.", como: "Catálogos: renombra o desactiva el duplicado.",
    revisar: (d) => { const f = [], rep = (arr, campo, etq) => { const m = new Map(); (arr || []).forEach((x) => { const k = normaliza(x[campo]); m.set(k, [...(m.get(k) || []), x]); }); m.forEach((l) => { if (l.length > 1) f.push(caso(l.map((x) => x.id).join("/"), `${etq} repetido: «${l[0][campo]}» (${l.length} registros)`)); }); };
      rep(d.productos, "sku", "SKU"); rep(d.productos, "nombre", "Producto"); rep(d.servicios, "nombre", "Servicio"); rep(d.sucursales, "nombre", "Sucursal"); rep(d.laboratorios, "nombre", "Laboratorio"); rep(d.proveedores, "nombre", "Proveedor");
      return f; } },
  { id: "precios", grupo: "Organización y catálogos", severidad: "advertencia", modulo: "catalogos", titulo: "Precios con margen",
    que: "Productos de venta cuyo precio final en alguna sucursal queda igual o por debajo de su costo, y servicios sin precio.", como: "Administración ▸ Precios: corrige el precio de lista o el ajuste de la sucursal.",
    revisar: (d) => { const f = []; d.servicios.forEach((s) => { if (!(s.precioBase > 0)) f.push(caso(s.id, `Servicio «${s.nombre}» sin precio de lista`)); });
      d.productos.filter((p) => p.tipo === "venta").forEach((p) => d.sucursales.forEach((s) => { const pf = R.precioFinal(d, s.id, "producto", p.id); if (pf <= p.costo) f.push(caso(p.sku, `${p.nombre} en ${s.nombre}: precio ${dinero(pf)} ≤ costo ${dinero(p.costo)}`, { sucursalId: s.id, importe: r2(pf - p.costo) })); }));
      return f; } },
  { id: "huerfanos", grupo: "Organización y catálogos", severidad: "error", modulo: "consulta-bd", titulo: "Referencias huérfanas en compras, precios y recetas de servicio",
    que: "Órdenes de compra, cuentas por pagar, ajustes de precio, autorizaciones y consumos de servicio que apuntan a registros que ya no existen.", como: "Consulta a base de datos: localiza el registro y corrige la referencia.",
    revisar: (d) => { const pr = idx(d.productos), sv = idx(d.servicios), pv = idx(d.proveedores), su = idx(d.sucursales), us = idx(d.usuarios), oc = idx(d.oc), f = [];
      d.oc.forEach((o) => { if (!pv.has(o.proveedorId)) f.push(caso(o.folio, `Orden de compra con proveedor inexistente (${o.proveedorId})`, { fecha: o.fecha })); o.partidas.forEach((p) => { if (!pr.has(p.productoId)) f.push(caso(o.folio, `Orden de compra con producto inexistente (${p.productoId})`, { fecha: o.fecha })); }); });
      d.cxp.forEach((c) => { if (!pv.has(c.proveedorId)) f.push(caso(c.doc, `Cuenta por pagar con proveedor inexistente (${c.proveedorId})`, { fecha: c.vence, importe: c.saldo })); if (c.ocId && !oc.has(c.ocId)) f.push(caso(c.doc, `Cuenta por pagar de una orden de compra inexistente (${c.ocId})`, { fecha: c.vence, importe: c.saldo })); });
      d.ajustesPrecio.forEach((a) => { if (!su.has(a.sucursalId)) f.push(caso(`${a.sucursalId}/${a.itemId}`, `Ajuste de precio de una sucursal inexistente (${a.sucursalId})`)); if (a.tipo !== "*" && !(a.tipo === "servicio" ? sv : pr).has(a.itemId)) f.push(caso(`${a.sucursalId}/${a.itemId}`, `Ajuste de precio de un artículo inexistente (${a.itemId})`, { sucursalId: a.sucursalId })); });
      d.autorizaciones.forEach((a) => { if (!us.has(a.solicitanteId)) f.push(caso(a.id, `Autorización solicitada por un usuario inexistente (${a.solicitanteId})`, { fecha: a.fecha, sucursalId: a.sucursalId })); if (!su.has(a.sucursalId)) f.push(caso(a.id, `Autorización de una sucursal inexistente (${a.sucursalId})`, { fecha: a.fecha })); });
      d.servicios.forEach((s) => (s.consumo || []).forEach((c) => { if (!pr.has(c.productoId)) f.push(caso(s.id, `El servicio «${s.nombre}» consume un insumo inexistente (${c.productoId})`)); }));
      return f; } },

  { id: "gastos", grupo: "Finanzas y personas", severidad: "error", modulo: "gastos", requiere: (d) => !!d.fin, titulo: "Gastos válidos",
    que: "Cada gasto debe tener monto mayor a cero, fecha no futura, sucursal y categoría existentes, y quién lo registró.", como: "Finanzas ▸ Compras y gastos: corrige o elimina el gasto con motivo.",
    revisar: (d) => { const su = idx(d.sucursales), ca = idx(d.fin.categorias), us = idx(d.usuarios);
      return (d.fin.gastos || []).flatMap((g) => { const f = [], x = (t) => f.push(caso(g.id, `${g.concepto || "Gasto"}: ${t}`, { fecha: g.fecha, sucursalId: g.sucursalId, importe: g.monto }));
        if (!(g.monto > 0)) x(`monto no válido (${g.monto})`); if (!su.has(g.sucursalId)) x(`sucursal inexistente (${g.sucursalId})`); if (!ca.has(g.categoria)) x(`categoría inexistente (${g.categoria})`);
        if (g.fecha > hoy()) x(`fecha futura (${g.fecha})`); if (g.registradoPor && !us.has(g.registradoPor)) x(`registrado por un usuario inexistente (${g.registradoPor})`);
        return f; }); } },
  { id: "gastos_duplicados", grupo: "Finanzas y personas", severidad: "advertencia", modulo: "gastos", requiere: (d) => !!d.fin, titulo: "Posibles gastos duplicados",
    que: "Dos gastos de la misma sucursal, fecha, categoría, concepto y monto.", como: "Verifica con el comprobante; si es duplicado, elimina uno con motivo.",
    revisar: (d) => { const m = new Map(); (d.fin.gastos || []).forEach((g) => { const k = `${g.sucursalId}|${g.fecha}|${g.categoria}|${normaliza(g.concepto)}|${g.monto}`; m.set(k, [...(m.get(k) || []), g]); });
      return [...m.values()].filter((l) => l.length > 1).map((l) => caso(l.map((g) => g.id).join("/"), `${l[0].concepto} · ${dinero(l[0].monto)} aparece ${l.length} veces el ${l[0].fecha} en ${R.nombreSucursal(d, l[0].sucursalId)}`, { fecha: l[0].fecha, sucursalId: l[0].sucursalId, importe: r2(l[0].monto * (l.length - 1)) })); } },
  { id: "nomina", grupo: "Finanzas y personas", severidad: "error", modulo: "rh", requiere: (d) => !!(d.rh && d.rh.recibos), titulo: "Recibos de nómina: total = sueldo − descuentos",
    que: "En cada recibo el total debe ser el sueldo del periodo menos los descuentos, y los descuentos la suma de faltas y retardos.", como: "Recursos humanos ▸ Nómina: vuelve a generar el recibo.",
    revisar: (d) => { const em = idx(d.rh.empleados); return d.rh.recibos.flatMap((r) => { const f = [], x = (t) => f.push(caso(r.folio, t, { fecha: r.periodo && r.periodo.hasta, sucursalId: r.sucursalId, importe: r.total }));
      if (!em.has(r.empleadoId)) x(`Recibo de un empleado inexistente (${r.empleadoId})`);
      if (!cerca(r.descuentos, (r.descFaltas || 0) + (r.descRetardos || 0))) x(`Descuentos ${dinero(r.descuentos)} ≠ faltas ${dinero(r.descFaltas)} + retardos ${dinero(r.descRetardos)}`);
      if (!cerca(r.total, Math.max(0, r.sueldoPeriodo - r.descuentos))) x(`Total ${dinero(r.total)} ≠ sueldo ${dinero(r.sueldoPeriodo)} − descuentos ${dinero(r.descuentos)}`);
      return f; }); } },
  { id: "personal", grupo: "Finanzas y personas", severidad: "error", modulo: "rh", requiere: (d) => !!d.rh, titulo: "Empleados y asistencia coherentes",
    que: "Cada empleado activo con cuenta debe apuntar a un usuario existente (uno solo), y no puede haber dos registros de asistencia del mismo empleado el mismo día ni salidas anteriores a la entrada.", como: "Recursos humanos: corrige el expediente o el registro del checador.",
    revisar: (d) => { const us = idx(d.usuarios), su = idx(d.sucursales), em = idx(d.rh.empleados), porU = new Map(), porDia = new Map(), f = [];
      d.rh.empleados.forEach((e) => { if (e.usuarioId) { if (!us.has(e.usuarioId)) f.push(caso(e.id, `${e.nombre}: cuenta de usuario inexistente (${e.usuarioId})`)); porU.set(e.usuarioId, [...(porU.get(e.usuarioId) || []), e.nombre]); } if (e.sucursalBase && e.sucursalBase !== "CEN" && !su.has(e.sucursalBase)) f.push(caso(e.id, `${e.nombre}: sucursal base inexistente (${e.sucursalBase})`)); if (!(e.sueldoMensual > 0)) f.push(caso(e.id, `${e.nombre}: sueldo no válido (${e.sueldoMensual})`)); });
      porU.forEach((l, u) => { if (l.length > 1) f.push(caso(u, `La cuenta ${u} está ligada a ${l.length} empleados: ${l.join(", ")}`)); });
      (d.rh.asistencia || []).forEach((a) => { if (!em.has(a.empleadoId)) f.push(caso(a.id, `Asistencia de un empleado inexistente (${a.empleadoId})`, { fecha: a.fecha, sucursalId: a.sucursalId }));
        const k = `${a.empleadoId}|${a.fecha}`; porDia.set(k, (porDia.get(k) || 0) + 1); if (porDia.get(k) === 2) f.push(caso(a.id, `Dos registros de asistencia de ${a.empleadoId} el ${a.fecha}`, { fecha: a.fecha, sucursalId: a.sucursalId }));
        if (a.entrada && a.salida && min(a.salida) < min(a.entrada)) f.push(caso(a.id, `Salida ${a.salida} anterior a la entrada ${a.entrada}`, { fecha: a.fecha, sucursalId: a.sucursalId })); });
      return f; } },
  { id: "bonos", grupo: "Finanzas y personas", severidad: "error", modulo: "bonos", requiere: (d) => !!(d.bonos && d.bonos.pagados), titulo: "Bonos aprobados o pagados válidos",
    que: "Cada bono debe apuntar a un esquema existente, no ser negativo, no estar repetido para la misma persona/sucursal y periodo, y uno «pagado» debe tener quién y cuándo lo pagó.", como: "Personas ▸ Bonos y metas: revisa el periodo.",
    revisar: (d) => { const es = idx(d.bonos.esquemas), us = idx(d.usuarios), m = new Map();
      return d.bonos.pagados.flatMap((b) => { const f = [], x = (t) => f.push(caso(b.id, t, { fecha: (b.pagadoEn || b.aprobadoEn || "").slice(0, 10), sucursalId: b.sucursalId, importe: b.bono }));
        if (!es.has(b.esquemaId)) x(`Bono de un esquema inexistente (${b.esquemaId})`); if (b.usuarioId && !us.has(b.usuarioId)) x(`Bono de un usuario inexistente (${b.usuarioId})`);
        if (!(b.bono >= 0)) x(`Importe de bono no válido (${b.bono})`); if (b.estado === "pagado" && (!b.pagadoPor || !b.pagadoEn)) x("Bono pagado sin quién o cuándo");
        const k = `${b.esquemaId}|${b.periodoClave}|${b.usuarioId || ""}|${b.sucursalId || ""}`; m.set(k, (m.get(k) || 0) + 1); if (m.get(k) === 2) x(`Bono repetido para ${b.periodoClave}`);
        return f; }); } },
  { id: "pedidos_web", grupo: "Finanzas y personas", severidad: "error", modulo: "pedidos-web", requiere: (d) => Array.isArray(d.pedidosWeb), titulo: "Pedidos en línea cuadrados y con su ticket",
    que: "El total del pedido debe ser subtotal más envío; un pedido entregado debe tener su ticket de venta y ese ticket el mismo total.", como: "Operación ▸ Pedidos en línea: revisa la entrega del pedido.",
    revisar: (d) => { const v = new Map(d.ventas.filter((x) => x.pedidoWebId).map((x) => [x.pedidoWebId, x])), pr = idx(d.productos);
      return d.pedidosWeb.flatMap((p) => { const f = [], x = (t, imp) => f.push(caso(p.folio, t, { fecha: dia(p.fecha), sucursalId: p.sucursalId, importe: imp }));
        const sub = r2((p.partidas || []).reduce((a, q) => a + (q.importe || 0), 0));
        if (!cerca(sub, p.subtotal)) x(`Subtotal ${dinero(p.subtotal)} ≠ suma de partidas ${dinero(sub)}`, r2(p.subtotal - sub));
        if (!cerca(p.total, (p.subtotal || 0) + (p.envio || 0))) x(`Total ${dinero(p.total)} ≠ subtotal ${dinero(p.subtotal)} + envío ${dinero(p.envio || 0)}`, r2(p.total - (p.subtotal || 0) - (p.envio || 0)));
        (p.partidas || []).forEach((q) => { if (!pr.has(q.productoId)) x(`Producto inexistente (${q.productoId})`); });
        if (p.estado === "entregado") { const t = v.get(p.id); if (!t) x("Pedido entregado sin ticket de venta", p.total); else if (!cerca(t.total, p.total)) x(`Ticket ${t.folio} por ${dinero(t.total)} ≠ pedido ${dinero(p.total)}`, r2(t.total - p.total)); }
        return f; }); } },
  { id: "evaluaciones", grupo: "Finanzas y personas", severidad: "advertencia", modulo: "evaluaciones", requiere: (d) => Array.isArray(d.eval), titulo: "Encuestas ligadas a una cita atendida",
    que: "Cada evaluación de cliente debe corresponder a una cita existente y atendida, con calificaciones de 1 a 5 si fue respondida.", como: "Análisis ▸ Evaluación de clientes.",
    revisar: (d) => { const c = new Map(d.citas.map((x) => [x.id, x])); return d.eval.flatMap((e) => { const f = [], x = (t) => f.push(caso(e.id, t, { fecha: dia(e.fecha), sucursalId: e.sucursalId })), ci = c.get(e.citaId);
      if (!ci) x(`Encuesta de una cita que no existe (${e.citaId})`); else if (ci.estado !== "atendida") x(`Encuesta de una cita «${ci.estado}» (${e.citaId})`);
      if (e.estado === "respondida" && [e.califServicio, e.califPodologo, e.califSucursal].some((n) => !(n >= 1 && n <= 5))) x("Calificación fuera de 1 a 5");
      return f; }); } },

  { id: "dw_cuadre", grupo: "Plataforma", severidad: "advertencia", modulo: "control-etl", titulo: "Data warehouse al corriente con la operación",
    que: "Los totales cargados en el DW (ventas, pagos, gastos, citas, inventario) deben ser iguales a los operativos.", como: "Análisis ▸ Control de ETL ▸ «Ejecutar ahora».",
    revisar: (d) => { const c = DW.cuadreDW(d); if (c.sinCarga) return [caso("dw", "El data warehouse nunca se ha cargado")]; return c.filas.filter((x) => !x.ok).map((x) => caso(x.clave, `${x.etiqueta}: DW ${x.unidad === "MXN" ? dinero(x.dw) : x.dw} contra operación ${x.unidad === "MXN" ? dinero(x.operativo) : x.operativo}`, { fecha: dia(c.ts), importe: x.diferencia })); } },
  { id: "documentos_vigencia", grupo: "Plataforma", severidad: "advertencia", modulo: "documentos", requiere: (d) => Array.isArray(d.documentos), titulo: "Documentos vencidos o por vencer en 30 días",
    que: "Licencias, pólizas, contratos y permisos vencidos o que vencen en 30 días o menos.", como: "Cadena ▸ Documentos de la clínica: renueva el documento y sube la nueva versión.",
    revisar: (d) => d.documentos.filter((x) => x.estado !== "archivado").flatMap((x) => { const v = estadoVigencia(x); return ["vencido", "por_vencer_30"].includes(v.estado) ? [caso(x.folio, `${x.titulo}: ${v.etiqueta.toLowerCase()}`, { fecha: x.vigencia, sucursalId: x.sucursalId })] : []; }) },
  { id: "documentos_datos", grupo: "Plataforma", severidad: "error", modulo: "documentos", requiere: (d) => Array.isArray(d.documentos), titulo: "Documentos con sucursal y responsable válidos",
    que: "Cada documento debe tener un responsable activo y, si es de sucursal, una sucursal existente; la vigencia no puede ser anterior a la emisión.", como: "Cadena ▸ Documentos de la clínica: edita el documento.",
    revisar: (d) => { const su = idx(d.sucursales), us = new Map(d.usuarios.map((u) => [u.id, u])); return d.documentos.filter((x) => x.estado !== "archivado").flatMap((x) => { const f = [], c = (t) => f.push(caso(x.folio, `${x.titulo}: ${t}`, { fecha: x.vigencia || x.emision, sucursalId: x.sucursalId }));
      if (x.sucursalId && !su.has(x.sucursalId)) c(`sucursal inexistente (${x.sucursalId})`); const r = us.get(x.responsableId); if (!r) c("responsable inexistente"); else if (r.activo === false) c(`el responsable ${r.nombre} está desactivado`);
      if (x.vigencia && x.vigencia < x.emision) c("vigencia anterior a la emisión");
      return f; }); } },
  { id: "documentos_archivo", grupo: "Plataforma", severidad: "advertencia", modulo: "documentos", requiere: (d) => Array.isArray(d.documentos), titulo: "Documentos sin archivo digital",
    que: "Documentos registrados sin enlace ni imagen: existen en papel pero no se pueden consultar desde el sistema.", como: "Digitaliza el documento y edítalo para agregar el enlace o la imagen.",
    revisar: (d) => d.documentos.filter((x) => x.estado !== "archivado" && (!x.archivo || x.archivo.tipo === "ninguno")).map((x) => caso(x.folio, `${x.titulo}: sin archivo`, { fecha: x.emision, sucursalId: x.sucursalId })) },
  { id: "folios", grupo: "Plataforma", severidad: "error", modulo: "configuracion", titulo: "Consecutivos de folios por delante de lo emitido",
    que: "El contador de cada serie debe ser mayor o igual al folio más alto ya emitido (si no, el siguiente folio se repetiría).", como: "Configuración ▸ Folios y series: adelanta el consecutivo.",
    revisar: (d) => { const f = [], mayor = (arr, pref) => (arr || []).reduce((m, x) => { const r = new RegExp(`^${pref}-(\\d+)$`).exec(String(x.folio || "")); return r ? Math.max(m, Number(r[1])) : m; }, 0);
      [["T", d.ventas], ["AP", d.apartados], ["CR", d.planes], ["LAB", d.ordenesLab], ["PW", d.pedidosWeb], ["AF", d.auditorias], ["DOC", d.documentos], ["RN", d.rh && d.rh.recibos]].forEach(([s, arr]) => { const m = mayor(arr, s), c = (d.contadores || {})[s] || 0; if (m > c) f.push(caso(s, `Serie ${s}: contador en ${c} pero ya existe el folio ${s}-${String(m).padStart(4, "0")}`)); });
      return f; } },
];

/** Ejecuta todas las reglas sobre el estado. Pura. */
export function validarTodo(d, { ids = null } = {}) {
  const reglas = REGLAS_VALIDACION.filter((r) => !ids || ids.includes(r.id)).map((r) => {
    const base = { id: r.id, grupo: r.grupo, titulo: r.titulo, que: r.que, como: r.como, modulo: r.modulo, severidad: r.severidad };
    if (r.requiere && !r.requiere(d)) return { ...base, estado: "no_aplica", n: 0, importe: 0, casos: [] };
    let casos;
    try { casos = r.revisar(d); } catch (e) { return { ...base, estado: "error", n: 1, importe: 0, casos: [caso(r.id, `La regla no pudo ejecutarse: ${String((e && e.message) || e)}`)], fallo: true }; }
    return { ...base, estado: casos.length ? r.severidad : "ok", n: casos.length, importe: r2(casos.reduce((a, c) => a + Math.abs(Number(c.importe) || 0), 0)), casos };
  });
  const cuenta = (e) => reglas.filter((r) => r.estado === e).length;
  const aplican = reglas.filter((r) => r.estado !== "no_aplica").length;
  const resumen = { total: reglas.length, aplican, ok: cuenta("ok"), advertencia: cuenta("advertencia"), error: cuenta("error"), noAplica: cuenta("no_aplica"), casos: reglas.reduce((a, r) => a + r.n, 0), saludPct: aplican ? Math.round((cuenta("ok") / aplican) * 100) : 100 };
  return { fecha: ahoraLocal(), resumen, reglas, global: resumen.error ? "error" : resumen.advertencia ? "advertencia" : "ok" };
}
/** «Validar todo»: ejecuta, guarda el resumen como última corrida (con historial) y audita. Solo administración. */
export function registrarValidacion(d) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const r = validarTodo(d);
  const reg = { id: uid("VA"), fecha: r.fecha, usuarioId: u.id, sucursalId: d.sesion.sucursalId, resumen: r.resumen, global: r.global, porRegla: r.reglas.filter((x) => x.n).map((x) => ({ id: x.id, estado: x.estado, n: x.n })) };
  const v = (d.validacion ||= { ultima: null, historial: [] });
  v.ultima = reg; v.historial.unshift(reg);
  if (v.historial.length > 30) v.historial.length = 30;
  auditar(d, "validacion_ejecutada", "validacion", reg.id, `${r.resumen.ok} de ${r.resumen.aplican} reglas en orden · ${r.resumen.error} con error · ${r.resumen.advertencia} con advertencia · ${r.resumen.casos} caso(s)`);
  return ok({ resultado: r, registro: reg });
}
export const ETIQUETA_ESTADO_VAL = { ok: ["En orden", "ok"], advertencia: ["Advertencia", "warn"], error: ["Error", "bad"], no_aplica: ["No aplica", "neutral"] };
const COLS_VAL = [{ k: "grupo", l: "Grupo" }, { k: "regla", l: "Regla" }, { k: "estado", l: "Estado" }, { k: "ref", l: "Referencia" }, { k: "fecha", l: "Fecha" }, { k: "sucursal", l: "Sucursal" }, { k: "importe", l: "Importe" }, { k: "descripcion", l: "Qué pasa" }, { k: "como", l: "Cómo corregirlo" }];
export const csvDe = (columnas, filas) => { const esc = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return "﻿" + [columnas.map((c) => esc(c.l)).join(","), ...filas.map((f) => columnas.map((c) => esc(f[c.k])).join(","))].join("\r\n"); };
/** CSV del detalle (todas las reglas o una). */
export function csvValidacion(d, resultado, reglaId = null) {
  const filas = resultado.reglas.filter((r) => !reglaId || r.id === reglaId).flatMap((r) => (r.casos.length ? r.casos : [null]).map((c) => ({
    grupo: r.grupo, regla: r.titulo, estado: ETIQUETA_ESTADO_VAL[r.estado][0], ref: c ? c.ref : "", fecha: c ? c.fecha || "" : "", sucursal: c && c.sucursalId ? R.nombreSucursal(d, c.sucursalId) : "", importe: c && c.importe != null ? c.importe : "", descripcion: c ? c.descripcion : "Sin casos", como: r.como })));
  return csvDe(COLS_VAL, filas);
}

// ═════════════════════════ Consulta a base de datos (solo lectura)
/** Campos que NUNCA se muestran ni se exportan (credenciales y secretos). Hoy el estado no guarda ninguno; la lista queda como candado. */
export const CAMPOS_EXCLUIDOS = ["password", "contrasena", "contraseña", "clave", "clave_acceso", "pass", "pwd", "token", "access_token", "refresh_token", "secreto", "secret", "api_key", "apikey", "llave", "nip", "pin", "cvv", "numero_tarjeta", "service_role"];
const esExcluido = (k) => CAMPOS_EXCLUIDOS.includes(normaliza(k).replace(/[^a-z0-9_]/g, ""));
const esImagen = (v) => typeof v === "string" && v.startsWith("data:");
const NO_TABLAS = ["sesion", "version", "creado", "sinSenal"];
/** Colecciones (tablas) del estado: arreglos de primer nivel, arreglos dentro de un objeto (rh.empleados) y mapas (params). */
export function coleccionesBD(d) {
  const l = [];
  const poner = (ruta, filas, tipo) => l.push({ ruta, filas: filas.length, tipo });
  Object.keys(d).filter((k) => !NO_TABLAS.includes(k)).forEach((k) => {
    const v = d[k];
    if (Array.isArray(v)) poner(k, v, "tabla");
    else if (v && typeof v === "object") {
      const hijos = Object.keys(v).filter((j) => Array.isArray(v[j]) && (!v[j].length || typeof v[j][0] === "object"));
      hijos.forEach((j) => poner(`${k}.${j}`, v[j], "tabla"));
      const resto = Object.keys(v).filter((j) => !hijos.includes(j));
      if (resto.length) poner(k, filasDe(d, k), hijos.length ? "valores" : "mapa");
    }
  });
  return l.sort((a, b) => a.ruta.localeCompare(b.ruta));
}
/** Filas de una colección por su ruta («ventas», «rh.empleados», «params», «config»). */
export function filasDe(d, ruta) {
  const [a, b] = String(ruta).split(".");
  if (NO_TABLAS.includes(a) || !(a in d)) return [];
  const v = b ? (d[a] || {})[b] : d[a];
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? x : { valor: x }));
  if (!v || typeof v !== "object") return [];
  const claves = Object.keys(v).filter((k) => !(Array.isArray(v[k]) && (!v[k].length || typeof v[k][0] === "object")));
  const todosObjetos = claves.length > 0 && claves.every((k) => v[k] && typeof v[k] === "object" && !Array.isArray(v[k]));
  return todosObjetos ? claves.map((k) => ({ clave: k, ...v[k] })) : claves.map((k) => ({ clave: k, valor: v[k] }));
}
export function columnasDe(filas, max = 60) {
  const cols = [];
  for (let i = 0; i < filas.length && i < 300; i++) for (const k of Object.keys(filas[i])) if (!esExcluido(k) && !cols.includes(k)) cols.push(k);
  return cols.slice(0, max);
}
/** Valor de celda como texto plano (objetos → JSON; imágenes → marcador). */
export function celdaBD(v, largo = 80) {
  if (v === null || v === undefined) return "";
  if (esImagen(v)) return `[imagen ${Math.round(v.length / 1024)} KB]`;
  if (typeof v === "boolean") return v ? "sí" : "no";
  const s = typeof v === "object" ? JSON.stringify(v, (k, x) => (esExcluido(k) ? undefined : esImagen(x) ? "[imagen]" : x)) : String(v);
  return largo && s.length > largo ? `${s.slice(0, largo)}…` : s;
}
/** Copia de un registro sin campos excluidos (para verlo como JSON). */
export function registroSeguro(x) {
  return JSON.parse(JSON.stringify(x, (k, v) => (esExcluido(k) ? undefined : esImagen(v) ? `[imagen ${Math.round(v.length / 1024)} KB]` : v)));
}
/** Consulta de solo lectura con filtro por texto y por campo, orden y paginación. Solo admin/dirección. */
export function consultarBD(d, { coleccion, texto = "", campo = "", valor = "", orden = "", desc = false, pagina = 1, tam = 25 } = {}) {
  if (!central(d)) return SOLO_CENTRAL;
  if (!coleccionesBD(d).some((c) => c.ruta === coleccion)) return err("Colección no encontrada.");
  const todas = filasDe(d, coleccion), columnas = columnasDe(todas);
  const q = normaliza(texto), val = normaliza(valor);
  let filas = todas.filter((f) => (!q || columnas.some((c) => normaliza(celdaBD(f[c], 0)).includes(q))) && (!campo || !val || normaliza(celdaBD(f[campo], 0)).includes(val)));
  if (orden && columnas.includes(orden)) {
    filas = [...filas].sort((x, y) => { const a = x[orden], b = y[orden]; if (typeof a === "number" && typeof b === "number") return a - b; return celdaBD(a, 0).localeCompare(celdaBD(b, 0), "es", { numeric: true }); });
    if (desc) filas.reverse();
  }
  const paginas = Math.max(1, Math.ceil(filas.length / tam)), p = Math.min(Math.max(1, pagina), paginas);
  return ok({ coleccion, columnas, total: todas.length, coincidencias: filas.length, pagina: p, paginas, filas: filas.slice((p - 1) * tam, p * tam), todas: filas });
}
export const csvBD = (columnas, filas) => csvDe(columnas.map((c) => ({ k: c, l: c })), filas.map((f) => Object.fromEntries(columnas.map((c) => [c, celdaBD(f[c], 0)]))));
export function registrarExportBD(d, coleccion, n) {
  if (!central(d)) return SOLO_CENTRAL;
  auditar(d, "bd_exportada", "base_datos", coleccion, `${coleccion} · ${n} filas (CSV, solo lectura)`);
  return ok();
}

// ═════════════════════════ Entrega (metodología de la fábrica RANNIX, etapas E0–E8)
export const ESTADOS_PASO = { completado: ["Completado", "ok"], parcial: ["Parcial", "warn"], en_proceso: ["En proceso", "warn"], pendiente: ["Pendiente", "bad"], no_aplica: ["No aplica", "neutral"] };
export const ETAPAS_ENTREGA = [
  { id: "E0", nombre: "Prospección", desc: "¿Hay proyecto? Cómo lo hacen hoy, cuánto les cuesta y quién decide." },
  { id: "E1", nombre: "Requerimiento", desc: "REQUERIMIENTO.md: qué hacen hoy, quiénes, qué duele, qué no puede fallar, volumen y qué queda fuera." },
  { id: "E2", nombre: "Análisis visual", desc: "El modelo sale de las pantallas: mockups, diccionario, estados, roles, métricas y preguntas abiertas." },
  { id: "E3", nombre: "Reglas", compuerta: "COMPUERTA 1", desc: "REGLAS_NEGOCIO.md firmado por el cliente antes de escribir código." },
  { id: "E4", nombre: "Infraestructura", desc: "Repositorio, ambientes de QA y producción, esquema, permisos en el dato (RLS) y respaldo." },
  { id: "E5", nombre: "Construcción", desc: "Un módulo por perfil, métricas con su fórmula, casos borde y portal público." },
  { id: "E6", nombre: "QA", compuerta: "COMPUERTA 2", desc: "Contra los mockups, contra las reglas y contra los números; acta de QA firmada." },
  { id: "E7", nombre: "Producción", desc: "Migraciones, verificación, dominio, respaldo, reversión probada y autorización." },
  { id: "E8", nombre: "Operación", compuerta: "COMPUERTA DE ENTREGA", desc: "Documentación para operar sin quien lo construyó: diagnóstico, accesos y reglas actualizadas." },
];
/**
 * Entregables del checklist de la fábrica. `base` es el estado al corte de esta versión. Cuando el entregable es un archivo,
 * tests/plataforma.test.js comprueba contra el repositorio que NO se declare como existente algo que no existe. `auto(d)` lo calcula con los datos; los demás los confirma administración.
 */
export const ENTREGABLES = [
  { id: "e0_via", etapa: "E0", titulo: "Vía elegida: desarrollo a la medida", base: "completado", evidencia: "REQUERIMIENTO.md describe la operación actual y el alcance a la medida para la cadena de 7 sucursales." },
  { id: "e1_requerimiento", etapa: "E1", titulo: "REQUERIMIENTO.md", archivo: "REQUERIMIENTO.md", base: "completado", evidencia: "Requerimiento y decisiones del cliente en el repositorio." },
  { id: "e2_mockups", etapa: "E2", titulo: "Mockups en docs/mockups/", archivo: "docs/mockups", base: "completado", evidencia: "Pantallas por perfil (HTML) usadas como referencia de diseño." },
  { id: "e2_diccionario", etapa: "E2", titulo: "DICCIONARIO_DATOS.md", archivo: "DICCIONARIO_DATOS.md", base: "completado", evidencia: "Entidades, atributos y relaciones." },
  { id: "e2_estados", etapa: "E2", titulo: "MODELO_ESTADOS.md", archivo: "MODELO_ESTADOS.md", base: "completado", evidencia: "Estados y transiciones por entidad." },
  { id: "e2_roles", etapa: "E2", titulo: "MATRIZ_ROLES.md", archivo: "MATRIZ_ROLES.md", base: "completado", evidencia: "Perfil × entidad × permiso." },
  { id: "e2_metricas", etapa: "E2", titulo: "METRICAS.md", archivo: "METRICAS.md", base: "completado", evidencia: "Indicadores con fórmula y granularidad." },
  { id: "e2_preguntas", etapa: "E2", titulo: "PREGUNTAS_ABIERTAS.md", archivo: "PREGUNTAS_ABIERTAS.md", base: "parcial", evidencia: "Existe, pero las preguntas siguen ABIERTAS: varias reglas del sistema son supuestos por defecto (zona horaria, redondeos, comisiones, descuentos, enganche)." },
  { id: "e3_reglas", etapa: "E3", titulo: "REGLAS_NEGOCIO.md completo", archivo: "REGLAS_NEGOCIO.md", base: "parcial", evidencia: "El documento existe, pero las reglas se leyeron del código (no de una sesión con el cliente) y casi todas son decisiones por defecto, revisables." },
  { id: "e3_firma", etapa: "E3", titulo: "Reglas y mockups firmados por el cliente (nombre, cargo y fecha)", base: "pendiente", evidencia: "SIN FIRMA: nadie del cliente ha confirmado REGLAS_NEGOCIO.md. Se construyó antes de cerrar la compuerta (desviación registrada): lo construido puede cambiar al firmarse." },
  { id: "e4_repo", etapa: "E4", titulo: "Repositorio con ramas develop (QA) y master (producción)", base: "pendiente", evidencia: "El código está en una carpeta de trabajo; no hay repositorio propio del proyecto con sus ramas." },
  { id: "e4_esquema", etapa: "E4", titulo: "Esquema de base de datos en QA (docs/V2_ESQUEMA.md)", archivo: "docs/V2_ESQUEMA.md", base: "parcial", evidencia: "El esquema de la ampliación existe en la base compartida de QA (esquema piefirme, migraciones 064 a 072, según docs/V2_ESQUEMA.md). La aplicación todavía NO está conectada a él." },
  { id: "e4_ambientes", etapa: "E4", titulo: "Aplicación conectada a QA y ambiente de producción separado", base: "pendiente", evidencia: "La aplicación sigue leyendo y guardando en el almacenamiento del navegador (clave podologia.demo.v3). No hay ambiente de producción." },
  { id: "e4_migraciones", etapa: "E4", titulo: "Carpeta migraciones/ en este repositorio", archivo: "migraciones", base: "pendiente", evidencia: "Este repositorio no tiene carpeta migraciones/: las migraciones 064 a 072 viven en el repositorio del sistema hermano (base compartida de QA)." },
  { id: "e4_rls", etapa: "E4", titulo: "Permisos en el dato (RLS) probados desde esta aplicación", base: "pendiente", evidencia: "docs/V2_ESQUEMA.md declara RLS en las tablas nuevas de QA, pero esta aplicación aún valida los permisos dentro de sus acciones y no se ha corrido la prueba de RLS con sus roles." },
  { id: "e4_sitios", etapa: "E4", titulo: "Un sitio por ambiente (Netlify)", archivo: "netlify.toml", base: "parcial", evidencia: "Existe netlify.toml, pero no hay sitios de QA ni de producción publicados." },
  { id: "e4_respaldo", etapa: "E4", titulo: "Respaldo activo y verificado antes del primer dato real", base: "pendiente", evidencia: "Sin respaldo: no hay datos reales." },
  { id: "e5_modulos", etapa: "E5", titulo: "Un módulo por perfil (7 aplicaciones por rol)", archivo: "src/config/roles.js", base: "completado", evidencia: "Recepción, podólogo, asistente, cajero, almacén, gerente y administración/dirección." },
  { id: "e5_generales", etapa: "E5", titulo: "Módulos generales de la fábrica", archivo: "src/store/acciones_plataforma.js", base: "completado", evidencia: "Reportes, bitácora, usuarios, parámetros, mensajería, asistente, tablero DW, control de ETL, configuración, documentos, cálculos, validación, catálogos, consulta a base de datos, entrega y consulta asistente." },
  { id: "e5_portal", etapa: "E5", titulo: "Portal público con acceso a /app/", archivo: "portal/index.html", base: "completado", evidencia: "Portal con botón de acceso a la aplicación." },
  { id: "e5_pruebas", etapa: "E5", titulo: "Pruebas automáticas de la lógica", archivo: "tests", base: "completado", evidencia: "node --test tests/ (reglas y acciones de cada dominio)." },
  { id: "e5_datos", etapa: "E5", titulo: "Datos de demostración generados", base: "completado", auto: (d) => ({ estado: d.ventas.length && d.pacientes.length ? "completado" : "pendiente", evidencia: `${d.sucursales.length} sucursales, ${d.usuarios.length} usuarios, ${d.pacientes.length} pacientes, ${d.ventas.length} tickets y ${d.citas.length} citas ficticios.` }) },
  { id: "e5_integraciones", etapa: "E5", titulo: "Integraciones externas reales", base: "pendiente", auto: (d) => { const l = (d.config && d.config.integraciones) || []; return { estado: "pendiente", evidencia: `${l.length} integraciones, ninguna conectada: ${l.map((x) => `${x.nombre} (${ESTADOS_INTEGRACION[x.estado] ? ESTADOS_INTEGRACION[x.estado][0].toLowerCase() : x.estado})`).join(", ")}.` }; } },
  { id: "e6_validacion", etapa: "E6", titulo: "Validación de integridad sin errores", base: "pendiente", auto: (d) => { const v = d.validacion && d.validacion.ultima; if (!v) return { estado: "pendiente", evidencia: "Aún no se ejecuta «Validar todo»." }; return { estado: v.resumen.error ? "pendiente" : v.resumen.advertencia ? "parcial" : "completado", evidencia: `Última corrida ${v.fecha.replace("T", " ")}: ${v.resumen.ok} de ${v.resumen.aplican} reglas en orden, ${v.resumen.error} con error y ${v.resumen.advertencia} con advertencia.` }; } },
  { id: "e6_cuadre", etapa: "E6", titulo: "Cuadre del data warehouse en cero", base: "pendiente", auto: (d) => { const c = DW.cuadreDW(d); if (c.sinCarga) return { estado: "pendiente", evidencia: "El data warehouse no se ha cargado." }; return { estado: c.ok ? "completado" : "parcial", evidencia: c.ok ? `Carga del ${String(c.ts).replace("T", " ")}: ${c.filas.length} totales sin diferencia contra la operación.` : `Carga del ${String(c.ts).replace("T", " ")}: ${c.diferencias} total(es) con diferencia; falta ejecutar la carga.` }; } },
  { id: "e6_mockups", etapa: "E6", titulo: "Validación contra los mockups aprobados", base: "pendiente", evidencia: "No se ha hecho la revisión pantalla por pantalla contra una versión aprobada por el cliente." },
  { id: "e6_numeros", etapa: "E6", titulo: "Validación contra los números con datos reales", base: "pendiente", evidencia: "Solo hay datos ficticios; el cliente no ha confirmado cifras." },
  { id: "e6_metodologia", etapa: "E6", titulo: "docs/METODOLOGIA_QA.md", archivo: "docs/METODOLOGIA_QA.md", base: "parcial", evidencia: "Existe la adaptación de la metodología a este proyecto; los agentes de QA no están instalados y no se ha hecho ninguna corrida." },
  { id: "e6_corrida", etapa: "E6", titulo: "Corrida formal de QA con evidencia (escenarios y manifiesto)", archivo: "tests/escenarios", base: "pendiente", evidencia: "No existe tests/escenarios/ ni una corrida formal con evidencia." },
  { id: "e6_acta", etapa: "E6", titulo: "ACTA_QA.md firmada por el cliente", archivo: "ACTA_QA.md", base: "parcial", evidencia: "Existe solo como BORRADOR SIN FIRMAR y sin resultados de ejecución: no libera nada. La compuerta E6 no se ha cruzado." },
  { id: "e7_produccion", etapa: "E7", titulo: "Ambiente de producción publicado con dominio", base: "pendiente", evidencia: "No hay producción." },
  { id: "e7_reversion", etapa: "E7", titulo: "Respaldo verificado y reversión probada", base: "pendiente", evidencia: "No aplica hasta que exista producción." },
  { id: "e7_autorizacion", etapa: "E7", titulo: "Autorización explícita del responsable para liberar", base: "pendiente", evidencia: "Sin autorización: no se ha solicitado." },
  { id: "e8_claude", etapa: "E8", titulo: "CLAUDE.md del proyecto", archivo: "CLAUDE.md", base: "parcial", evidencia: "Existe con módulos, arquitectura, reglas y deuda; falta la tabla de ambientes (no hay ambientes)." },
  { id: "e8_diagnostico", etapa: "E8", titulo: "docs/DIAGNOSTICO.md", archivo: "docs/DIAGNOSTICO.md", base: "parcial", evidencia: "Existe para el modo demostración; las secciones de base de datos y producción quedan «cuando exista»." },
  { id: "e8_accesos", etapa: "E8", titulo: "docs/ACCESOS.md con la política de acceso a producción", archivo: "docs/ACCESOS.md", base: "parcial", evidencia: "Existe y describe el modo demostración (sin llaves). La política de acceso a producción no aplica todavía: no hay producción." },
  { id: "e8_reglas", etapa: "E8", titulo: "REGLAS_NEGOCIO.md actualizado con lo aprendido en QA", base: "pendiente", evidencia: "Depende de E3 y E6." },
];
export const PENDIENTES_CONOCIDOS = [
  "Compuerta E3 sin cerrar: las reglas marcadas como supuesto siguen en PREGUNTAS_ABIERTAS.md y no están firmadas.",
  "La aplicación no está conectada a la base de datos: hay esquema en QA (docs/V2_ESQUEMA.md), pero los datos siguen en el navegador de cada equipo, sin compartirse ni respaldarse.",
  "Permisos validados en las acciones de la app, no en el dato (RLS) todavía.",
  "Fechas como texto local sin zona horaria (pregunta abierta PA-T1).",
  "Facturación CFDI, terminal bancaria, WhatsApp, correo saliente, pasarela de pago, IA y visión: simulados o pendientes de llave.",
  "Nómina de demostración: sin ISR ni cuotas IMSS ni timbrado.",
  "El proyecto hermano Pie Firme (5 sedes) no se ha confirmado si es el mismo producto.",
];
const PESO_PASO = { completado: 1, no_aplica: null, parcial: 0.5, en_proceso: 0.5, pendiente: 0 };
/** Arma el checklist: estado base o automático, más lo que haya anotado administración (responsable, nota, estado confirmado). */
export function armarEntrega(d) {
  const guard = (d.entrega && d.entrega.pasos) || {};
  const items = ENTREGABLES.map((e) => {
    const a = e.auto ? e.auto(d) : null, g = guard[e.id] || null;
    const calculado = a ? a.estado : e.base;
    const manual = !e.auto && !e.archivo;
    const estado = manual && g && ESTADOS_PASO[g.estado] ? g.estado : calculado;
    return { id: e.id, etapa: e.etapa, titulo: e.titulo, archivo: e.archivo || null, origen: e.auto ? "datos" : e.archivo ? "repositorio" : "manual", estado, estadoBase: calculado, evidencia: a ? a.evidencia : e.evidencia, responsable: (g && g.responsable) || "", nota: (g && g.nota) || "", confirmadoPor: (g && g.usuarioId) || null, confirmadoEn: (g && g.fecha) || null, editable: manual };
  });
  const etapas = ETAPAS_ENTREGA.map((et) => {
    const its = items.filter((i) => i.etapa === et.id), cuentan = its.filter((i) => PESO_PASO[i.estado] !== null);
    const avance = cuentan.length ? cuentan.reduce((s, i) => s + PESO_PASO[i.estado], 0) / cuentan.length : 1;
    return { ...et, items: its, pct: Math.round(avance * 100), cerrada: cuentan.every((i) => i.estado === "completado") };
  });
  const cuentan = items.filter((i) => PESO_PASO[i.estado] !== null);
  const n = (e) => items.filter((i) => i.estado === e).length;
  const progreso = { total: items.length, completados: n("completado"), parciales: n("parcial") + n("en_proceso"), pendientes: n("pendiente"), noAplica: n("no_aplica"), pct: cuentan.length ? Math.round((cuentan.reduce((s, i) => s + PESO_PASO[i.estado], 0) / cuentan.length) * 100) : 100, listo: cuentan.every((i) => i.estado === "completado") };
  const primera = etapas.find((e) => !e.cerrada);
  return {
    version: (d.config && d.config.version) || VERSION_SISTEMA, cliente: (d.config && d.config.razonSocial) || "", nombre: (d.config && d.config.nombreComercial) || "Clínicas de Podología",
    etapas, items, progreso, etapaActual: primera ? primera.id : "E8", liberable: progreso.listo,
    integraciones: ((d.config && d.config.integraciones) || []).map((x) => ({ ...x, real: false })), pendientes: PENDIENTES_CONOCIDOS,
    validacion: (d.validacion && d.validacion.ultima) || null, cuadre: DW.cuadreDW(d), acta: (d.entrega && d.entrega.acta) || null,
  };
}
/** Anota un entregable manual (estado, responsable, nota). Los que salen del repositorio o de los datos no se pueden «palomear» a mano. */
export function guardarPasoEntrega(d, { id, estado, responsable = "", nota = "" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const e = ENTREGABLES.find((x) => x.id === id);
  if (!e) return err("Entregable no encontrado.");
  if (e.auto || e.archivo) return err("Este entregable se verifica contra el repositorio o los datos; no se marca a mano.");
  if (!["completado", "en_proceso", "pendiente", "no_aplica"].includes(estado)) return err("Estado no válido.");
  if (estado !== "pendiente" && txt(responsable).length < 3) return err("Indica quién es el responsable.");
  if (["completado", "no_aplica"].includes(estado) && txt(nota).length < 10) return err("Describe la evidencia (quién firmó, dónde quedó, fecha).");
  const en = (d.entrega ||= { pasos: {}, acta: null });
  const antes = (en.pasos[id] && en.pasos[id].estado) || e.base;
  en.pasos[id] = { estado, responsable: txt(responsable), nota: txt(nota), usuarioId: u.id, sucursalId: d.sesion.sucursalId, fecha: ahoraLocal() };
  auditar(d, "entrega_paso", "entrega", id, `${e.titulo}: ${antes} → ${estado}${txt(responsable) ? ` · ${txt(responsable)}` : ""}`);
  return ok();
}
/** Genera (registra) el acta de entrega con la foto del avance en ese momento. */
export function generarActa(d) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const e = armarEntrega(d);
  const en = (d.entrega ||= { pasos: {}, acta: null });
  const n = ((en.acta && en.acta.numero) || 0) + 1;
  en.acta = { numero: n, folio: `ACTA-${String(n).padStart(3, "0")}`, fecha: ahoraLocal(), usuarioId: u.id, sucursalId: d.sesion.sucursalId, version: e.version, pct: e.progreso.pct, completados: e.progreso.completados, pendientes: e.progreso.pendientes, etapaActual: e.etapaActual, liberable: e.liberable };
  auditar(d, "entrega_acta", "entrega", en.acta.folio, `Acta ${en.acta.folio} · versión ${e.version} · avance ${e.progreso.pct} % · ${e.liberable ? "liberable" : `no liberable (etapa ${e.etapaActual})`}`);
  return ok({ acta: en.acta, entrega: armarEntrega(d) });
}

// ═════════════════════════ Consulta asistente (bitácora de lo que se le pregunta al asistente inteligente)
const RESPONDIDA = ["respuesta", "propuesta", "recordar_pago", "traspaso"];
export const TIPO_RESPUESTA = { respuesta: ["Respondida", "ok"], propuesta: ["Respondida (propuso acción)", "ok"], recordar_pago: ["Respondida (propuso acción)", "ok"], traspaso: ["Respondida (propuso acción)", "ok"], no_entendi: ["No entendió", "bad"], sin_dato: ["Sin dato", "warn"], sin_permiso: ["Fuera de permiso", "warn"] };
/** Filas de la bitácora del asistente (d.asistenteLog, del dominio comercial) con su calificación (d.asistenteCalif). */
export function consultasAsistente(d, { texto = "", usuarioId = "", estado = "", mes = "" } = {}) {
  if (!central(d)) return SOLO_CENTRAL;
  const existe = Array.isArray(d.asistenteLog);
  const calif = new Map((d.asistenteCalif || []).map((c) => [c.entradaId, c]));
  const q = normaliza(texto);
  const todas = (d.asistenteLog || []).map((e) => { const tipo = (e.respuesta && e.respuesta.tipo) || "no_entendi"; return {
    id: e.id, ts: e.ts, usuarioId: e.usuarioId, sucursalId: e.sucursalId, pregunta: e.pregunta, intencion: e.intencion || null, tipo, respondida: RESPONDIDA.includes(tipo),
    titulo: (e.respuesta && e.respuesta.titulo) || "", respuesta: (e.respuesta && e.respuesta.texto) || "", cifra: (e.respuesta && e.respuesta.cifra) || null, acciones: (e.acciones || []).map((a) => ({ tipo: a.tipo, estado: a.estado })), calif: calif.get(e.id) || null }; })
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const filas = todas.filter((f) => (!usuarioId || f.usuarioId === usuarioId) && (!mes || String(f.ts).startsWith(mes)) && (!q || normaliza(`${f.pregunta} ${f.intencion || ""} ${f.titulo}`).includes(q))
    && (!estado || (estado === "respondidas" ? f.respondida : estado === "sin_respuesta" ? !f.respondida : estado === "sin_calificar" ? !f.calif : estado === "mal_calificadas" ? f.calif && f.calif.util === false : true)));
  const sinResp = new Map();
  todas.filter((f) => !f.respondida).forEach((f) => { const k = normaliza(f.pregunta).replace(/[¿?¡!.,]/g, "").trim(); const x = sinResp.get(k) || { pregunta: f.pregunta, veces: 0, tipo: f.tipo, ultima: f.ts, usuarios: new Set() }; x.veces += 1; x.usuarios.add(f.usuarioId); if (f.ts > x.ultima) x.ultima = f.ts; sinResp.set(k, x); });
  const intenciones = new Map();
  todas.forEach((f) => { const k = f.intencion || "(sin intención)"; intenciones.set(k, (intenciones.get(k) || 0) + 1); });
  const califs = todas.filter((f) => f.calif);
  return ok({ existe, filas, total: todas.length,
    resumen: { total: todas.length, respondidas: todas.filter((f) => f.respondida).length, sinRespuesta: todas.filter((f) => !f.respondida).length, calificadas: califs.length, utiles: califs.filter((f) => f.calif.util).length, noUtiles: califs.filter((f) => !f.calif.util).length, usuarios: new Set(todas.map((f) => f.usuarioId)).size },
    sinRespuesta: [...sinResp.values()].map((x) => ({ ...x, usuarios: x.usuarios.size })).sort((a, b) => b.veces - a.veces || String(b.ultima).localeCompare(String(a.ultima))),
    intenciones: [...intenciones].map(([intencion, n]) => ({ intencion, n })).sort((a, b) => b.n - a.n),
    usuarios: [...new Set(todas.map((f) => f.usuarioId))], meses: [...new Set(todas.map((f) => String(f.ts).slice(0, 7)))].sort().reverse() });
}
/** Califica una respuesta del asistente (útil / no útil, con nota para mejorar). Se guarda aparte del historial del asistente. */
export function calificarRespuesta(d, { entradaId, util, nota = "" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const e = (d.asistenteLog || []).find((x) => x.id === entradaId);
  if (!e) return err("Consulta no encontrada.");
  if (typeof util !== "boolean") return err("Indica si la respuesta fue útil o no.");
  if (!util && txt(nota).length < 5) return err("Explica qué debió responder, para mejorarlo.");
  const l = (d.asistenteCalif ||= []);
  const previo = l.find((x) => x.entradaId === entradaId);
  const reg = { entradaId, util, nota: txt(nota), usuarioId: u.id, sucursalId: d.sesion.sucursalId, ts: ahoraLocal() };
  if (previo) Object.assign(previo, reg); else l.push(reg);
  auditar(d, "asistente_calificado", "asistente", entradaId, `«${String(e.pregunta).slice(0, 80)}» · ${util ? "útil" : "no útil"}${txt(nota) ? ` · ${txt(nota).slice(0, 120)}` : ""}`);
  return ok();
}
