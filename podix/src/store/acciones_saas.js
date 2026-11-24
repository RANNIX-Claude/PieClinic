// Dominio «saas» (porte de Pie Firme): importación de datos por lotes reversibles, exportación, salud del sistema, datos de prueba,
// suscripción por módulos y panel RANNIX multi-clínica. Acciones puras sobre `d` (o su copia dentro de mutar()); TODAS validan que
// quien está en sesión sea Administración central o Dirección y dejan bitácora con usuarioId + sucursalId.
// Reglas de Pie Firme citadas: P-113 a P-117 (suscripción), P-121 (soporte sin suplantación), P-122/P-123 (importación),
// P-127 (la bitácora no se borra), P-128 (aislamiento entre clínicas: aquí NO existe, es una demostración en un solo navegador), P-132.
import { hoy, ahoraLocal, redondear, sumarDias, diasEntre } from "../lib/format.js";
import { auditar, uid, folio } from "./core.js";
import { crearSeed } from "./seed.js";
import { actor, esCentral, csvBD, columnasDe, registroSeguro, filasDe, coleccionesBD, validarTodo, VERSION_SISTEMA } from "./acciones_plataforma.js";
import * as IM from "./saas_importacion.js";
import { MODULOS_SUSCRIPCION, DIAS_PRUEBA, DIAS_GRACIA, ESTADOS_CLINICA, seed as sembrarSaas } from "./dominios/saas.js";

export { MODULOS_SUSCRIPCION, DIAS_PRUEBA, DIAS_GRACIA, ESTADOS_CLINICA };
export * from "./saas_importacion.js";

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const SOLO_CENTRAL = err("Esta función es solo de Administración central o Dirección.");
const central = (d) => { const u = actor(d); return esCentral(u) ? u : null; };
const txt = (s) => String(s ?? "").trim();
const suc = (d) => (d.sesion && d.sesion.sucursalId) || null;
/** ¿Puede este usuario usar las utilerías SaaS? Solo admin y dirección (la acción lo vuelve a validar). */
export const puedeSaas = (u) => esCentral(u);

// ═════════════════════════ Datos del dominio en estados guardados antes de que existiera
export const faltaSaas = (d) => !d.saas || !d.saas.suscripcion || !Array.isArray(d.clinicas);
/** Siembra (solo si falta) la parte «saas» con la misma semilla determinista. Devuelve true si agregó algo. */
export function asegurarSaas(d) {
  if (!faltaSaas(d)) return false;
  let a = 20261121;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const F = (n) => sumarDias(hoy(), n);
  const util = { r, int: (x, y) => x + Math.floor(r() * (y - x + 1)), pick: (l) => l[Math.floor(r() * l.length)], F, DT: (n, h = 9, m = 0) => `${F(n)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
  d.contadores ||= {};
  const extra = sembrarSaas(d, util);
  if (!Array.isArray(d.clinicas)) d.clinicas = extra.clinicas;
  if (!d.saas || !d.saas.suscripcion) d.saas = { ...extra.saas, ...(d.saas || {}), suscripcion: extra.saas.suscripcion };
  return true;
}
const saas = (d) => { if (faltaSaas(d)) asegurarSaas(d); return d.saas; };

// ═════════════════════════ IMPORTACIÓN (P-122, P-123)
/** Archivo (CSV / tabla pegada) o texto libre → columnas, filas y mapeo heurístico propuesto. Pura. */
export function analizarArchivo(texto, tipo, { textoLibre = false } = {}) {
  const p = textoLibre ? IM.interpretarTextoLibre(texto) : IM.parsearCSV(texto);
  const mapeos = IM.mapearColumnas(p.columnas, p.filas, tipo);
  return { columnas: p.columnas, filas: p.filas, avisos: p.avisos || [], delimitador: p.delimitador || null, simulada: !!p.simulada, mapeos, estado: IM.estadoMapeo(mapeos, tipo) };
}
/** Vista previa: valida cada fila contra lo que ya existe (no modifica nada). */
export const vistaPreviaImportacion = (d, { tipo, filas, mapeos, almacenId = null }) => IM.validarLote(filas, mapeos, tipo, IM.contextoImportacion(d, { almacenId }));
export const TAM_BLOQUE = 200;
/** Huella de un registro: si cambia, alguien lo modificó después de importarlo (y el lote ya no se puede deshacer). */
export const huella = (x) => { const s = JSON.stringify(x); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const COLECCION = { pacientes: (d) => d.pacientes, productos: (d) => d.productos, servicios: (d) => d.servicios, capas: (d) => d.capas, planes: (d) => d.planes };
const NEGATIVO = new Set(["no", "0", "negativo", "ninguna", "ninguno", "n", "false", "sin"]);

function siguienteExpediente(d) {
  let max = 0;
  for (const p of d.pacientes || []) { const n = Number(String(p.folio || "").replace(/\D/g, "")); if (n > max) max = n; }
  return () => `EXP-${String(++max).padStart(6, "0")}`;
}

/**
 * Carga las filas válidas y con aviso como un LOTE con identificador. Revalida aquí (no confía en la vista previa); los errores y los
 * duplicados se rechazan (en conflicto gana el dato existente, P-123). Se aplica por bloques de TAM_BLOQUE filas y devuelve el reporte.
 */
export function importarLote(d, { tipo, archivo = "datos.csv", filas, mapeos, almacenId = null, deEjemplo = false }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (!IM.CAMPOS_DESTINO[tipo]) return err("Tipo de importación no válido.");
  if (!Array.isArray(filas) || !filas.length) return err("El archivo no tiene filas.");
  const est = IM.estadoMapeo(mapeos, tipo);
  if (!est.listo) return err(est.porRevisar.length ? `Falta confirmar ${est.porRevisar.length} columna(s) con confianza menor a ${IM.UMBRAL_CONFIANZA} % o con dato clínico (P-123).` : est.faltan.length ? `Falta mapear: ${est.faltan.join(", ")}.` : est.duplicados.length ? "Dos columnas apuntan al mismo campo." : "El mapeo no está listo.");
  const alm = almacenId || (tipo === "productos" ? suc(d) || "CEN" : null);
  if (alm && !(d.almacenes || []).some((a) => a.id === alm)) return err("Almacén destino no válido.");
  const val = IM.validarLote(filas, mapeos, tipo, IM.contextoImportacion(d, { almacenId: alm }));
  const acept = IM.filasAceptables(val.filas);
  if (!acept.length) return err("Ninguna fila se puede cargar: todas tienen error o están duplicadas.");
  const s = saas(d);
  const loteId = uid("LI"), folioL = folio(d, "LI"), fecha = ahoraLocal(), dia = hoy();
  const sucursalId = suc(d) || (d.sucursales[0] && d.sucursales[0].id);
  const creados = [];
  const marca = (n) => ({ loteId, folio: folioL, archivo, fila: n, fecha, usuarioId: u.id });
  const pon = (col, x) => { COLECCION[col](d).push(x); creados.push({ col, id: x.id }); };
  const expediente = siguienteExpediente(d);
  const bloques = [];
  for (let i = 0; i < acept.length; i += TAM_BLOQUE) {
    const bloque = acept.slice(i, i + TAM_BLOQUE);
    for (const f of bloque) {
      const v = f.valores, m = marca(f.n), pr = deEjemplo ? { prueba: true } : {};
      if (tipo === "pacientes") {
        const alertas = [];
        if (v.alergias && !NEGATIVO.has(IM.norm(v.alergias))) alertas.push(`Alergia: ${v.alergias}`);
        if (v.diabetes && !NEGATIVO.has(IM.norm(v.diabetes))) alertas.push(/tipo\s*1/i.test(v.diabetes) ? "Diabetes tipo 1" : /tipo\s*2/i.test(v.diabetes) ? "Diabetes tipo 2" : "Diabetes");
        pon("pacientes", { id: uid("PA"), folio: expediente(), nombres: v.nombres, apellidos: v.apellidos || "", nacimiento: v.nacimiento || null, sexo: v.sexo || null,
          telefono: v.telefono || "", whatsapp: !!v.telefono, correo: v.correo || "", domicilio: v.domicilio || "", ocupacion: v.ocupacion || "", emergencia: null, origen: "Importación",
          convenioId: null, alertas, sucursalAlta: sucursalId, avisoFirmado: false, consentimientoFirmado: false, tutor: null, activo: true, notas: v.notas || "",
          // Lo clínico entra MARCADO como importado con su origen (P-123); el podólogo lo valida en el expediente.
          importado: { ...m, folioAnterior: v.folio_anterior || null, clinico: v.alergias || v.diabetes || v.notas_clinicas ? { alergias: v.alergias || null, diabetes: v.diabetes || null, antecedentes: v.notas_clinicas || null, validado: false } : null }, ...pr });
      } else if (tipo === "productos") {
        const p = { id: uid("P"), sku: v.sku, nombre: v.nombre, categoria: v.categoria || "Sin categoría", tipo: "venta", precioBase: v.precio ?? 0, costo: v.costo ?? 0, minimo: v.minimo ?? 0, importado: m, ...pr };
        pon("productos", p);
        if (v.existencia > 0) pon("capas", { id: uid("CP"), almacenId: alm, productoId: p.id, fecha: dia, cant: v.existencia, costo: v.costo ?? 0, lote: folioL, importado: m, ...pr });
      } else if (tipo === "servicios") {
        pon("servicios", { id: uid("SV"), nombre: v.nombre, duracion: v.duracion ?? 30, precioBase: v.precio, consumo: [], importado: m, ...pr });
      } else if (tipo === "existencias") {
        pon("capas", { id: uid("CP"), almacenId: v.almacenId, productoId: v.productoId, fecha: dia, cant: v.cantidad, costo: v.costo ?? 0, lote: v.lote || folioL, importado: m, ...pr });
      } else if (tipo === "cartera") {
        pon("planes", { id: uid("PL"), folio: folio(d, "CR"), pacienteId: v.pacienteId, sucursalId, tipo: "abierto", monto: v.saldo, enganche: 0,
          parcialidades: [{ n: 1, vence: v.vence || sumarDias(v.fecha, 30), capital: v.saldo, pagado: 0 }], creado: v.fecha, estado: "vigente", concepto: v.concepto || "Saldo importado del sistema anterior", importado: m, ...pr });
      }
    }
    bloques.push({ n: bloques.length + 1, desde: bloque[0].n, hasta: bloque[bloque.length - 1].n, filas: bloque.length });
  }
  // La huella se toma al final: así incluye todo lo que el lote dejó (p. ej. la capa de existencia de un producto).
  creados.forEach((c) => { c.h = huella(COLECCION[c.col](d).find((x) => x.id === c.id)); });
  const rechazadas = IM.filasRechazadas(val.filas);
  const lote = {
    id: loteId, folio: folioL, tipo, archivo, fecha, usuarioId: u.id, sucursalId, almacenId: alm, deEjemplo, estado: "cargado",
    resumen: val.resumen, cargados: acept.length, rechazados: rechazadas.length, bloques, creados,
    rechazadas: rechazadas.slice(0, 300).map((f) => ({ n: f.n, resultado: f.resultado, motivo: f.mensajes.map((x) => x.motivo).join("; ") })),
    mapeo: mapeos.filter((x) => x.campo).map((x) => ({ columna: x.columna, campo: x.campo, confianza: x.confianza, origen: x.origen })),
  };
  s.importaciones.unshift(lote);
  if (s.importaciones.length > 40) s.importaciones.length = 40;
  auditar(d, "importacion_lote", "importacion", folioL, `${tipo} · ${acept.length} cargada(s) en ${bloques.length} bloque(s) · ${rechazadas.length} rechazada(s) · ${archivo}`);
  return ok({ lote });
}

/** ¿Se puede deshacer? Solo si el lote está cargado, todo lo que creó sigue igual y nadie lo usó en un movimiento (P-122). */
export function puedeDeshacer(d, lote) {
  if (!lote) return { ok: false, motivo: "Lote no encontrado." };
  if (lote.estado !== "cargado") return { ok: false, motivo: "El lote ya se deshizo." };
  const faltan = [], cambiados = [];
  for (const c of lote.creados) {
    const x = (COLECCION[c.col](d) || []).find((y) => y.id === c.id);
    if (!x) faltan.push(c.id); else if (huella(x) !== c.h) cambiados.push(c.id);
  }
  if (faltan.length) return { ok: false, motivo: `${faltan.length} registro(s) del lote ya no existen.` };
  if (cambiados.length) return { ok: false, motivo: `${cambiados.length} registro(s) se modificaron después de importarlos.`, cambiados };
  const ids = (col) => new Set(lote.creados.filter((c) => c.col === col).map((c) => c.id));
  const P = ids("pacientes"), PR = ids("productos"), SV = ids("servicios"), PL = ids("planes"), CP = ids("capas");
  const usa = [];
  if (P.size) {
    const refs = [["citas", d.citas], ["consultas", d.consultas], ["ventas", d.ventas], ["apartados", d.apartados], ["órdenes de laboratorio", d.ordenesLab], ["lista de espera", d.listaEspera], ["evaluaciones", d.eval],
      ["créditos", (d.planes || []).filter((p) => !PL.has(p.id))]];
    refs.forEach(([n, arr]) => { const k = (arr || []).filter((x) => P.has(x.pacienteId)).length; if (k) usa.push(`${k} en ${n}`); });
  }
  if (PR.size) {
    const v = (d.ventas || []).filter((x) => (x.partidas || []).some((p) => p.tipo === "producto" && PR.has(p.itemId))).length; if (v) usa.push(`${v} venta(s) con productos del lote`);
    const c = (d.capas || []).filter((x) => PR.has(x.productoId) && !CP.has(x.id)).length; if (c) usa.push(`${c} entrada(s) de inventario de esos productos`);
    const t = (d.traspasos || []).filter((x) => (x.partidas || []).some((p) => PR.has(p.productoId))).length; if (t) usa.push(`${t} traspaso(s)`);
  }
  if (SV.size) {
    const c = (d.citas || []).filter((x) => SV.has(x.servicioId)).length; if (c) usa.push(`${c} cita(s) con servicios del lote`);
    const v = (d.ventas || []).filter((x) => (x.partidas || []).some((p) => p.tipo === "servicio" && SV.has(p.itemId))).length; if (v) usa.push(`${v} venta(s) con servicios del lote`);
  }
  if (PL.size) { const a = (d.abonosCredito || []).filter((x) => PL.has(x.planId)).length; if (a) usa.push(`${a} abono(s) a saldos del lote`); }
  if (usa.length) return { ok: false, motivo: `Ya se usaron registros del lote: ${usa.join(", ")}.` };
  return { ok: true };
}
/** Deshace el lote completo: elimina lo que creó. Solo admin/dirección. Los folios usados NO se reutilizan (P-133). */
export function deshacerLote(d, loteId, motivo = "") {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const lote = saas(d).importaciones.find((x) => x.id === loteId);
  const p = puedeDeshacer(d, lote);
  if (!p.ok) return err(`No se puede deshacer: ${p.motivo}`);
  const porCol = {};
  lote.creados.forEach((c) => { (porCol[c.col] ||= new Set()).add(c.id); });
  Object.entries(porCol).forEach(([col, set]) => { const arr = COLECCION[col](d); for (let i = arr.length - 1; i >= 0; i--) if (set.has(arr[i].id)) arr.splice(i, 1); });
  Object.assign(lote, { estado: "revertido", revertidoEn: ahoraLocal(), revertidoPor: u.id, motivoReversa: txt(motivo) });
  auditar(d, "importacion_deshecha", "importacion", lote.folio, `${lote.creados.length} registro(s) eliminados${motivo ? ` · ${txt(motivo)}` : ""}`);
  return ok({ eliminados: lote.creados.length });
}

// ═════════════════════════ EXPORTACIÓN (Pie Firme: ExportarDatos + migración 059)
export const MODULOS_EXPORTACION = [
  { id: "pacientes", nombre: "Pacientes", rutas: ["pacientes"], sensible: true },
  { id: "agenda", nombre: "Agenda", rutas: ["citas", "listaEspera"] },
  { id: "clinico", nombre: "Clínico", rutas: ["consultas", "ordenesLab", "eval"], sensible: true },
  { id: "ventas", nombre: "Ventas y cartera", rutas: ["ventas", "devoluciones", "apartados", "planes", "abonosCredito", "turnos"] },
  { id: "inventario", nombre: "Inventario y compras", rutas: ["capas", "traspasos", "ajustesInventario", "oc", "cxp"] },
  { id: "catalogos", nombre: "Catálogos", rutas: ["productos", "servicios", "sucursales", "convenios", "proveedores", "laboratorios"] },
  { id: "finanzas", nombre: "Gastos", rutas: ["fin.gastos", "fin.recurrentes"] },
  { id: "personal", nombre: "Personal", rutas: ["rh.empleados", "rh.asistencia"], sensible: true },
  { id: "documentos", nombre: "Documentos de la clínica", rutas: ["documentos"] },
  { id: "bitacora", nombre: "Bitácora", rutas: ["bitacora"] },
];
const CAMPOS_FECHA = ["fecha", "inicio", "creado", "emision", "ts", "enviada", "ingreso", "abiertoEn", "periodo"];
const CAMPOS_SUCURSAL = ["sucursalId", "sucursalAlta", "almacenId", "sucursalBase"];
const fechaDe = (x) => { for (const k of CAMPOS_FECHA) if (x && x[k]) return String(x[k]).slice(0, 10); return null; };
/** ¿El registro entra en el filtro de sucursal y fechas? Los registros sin sucursal o sin fecha (catálogos) siempre entran. */
export function enFiltro(ruta, x, { sucursalId = "", desde = "", hasta = "" } = {}) {
  if (sucursalId) {
    if (ruta === "sucursales") { if (x.id !== sucursalId) return false; }
    else if (Array.isArray(x.sucursales) && !x.sucursalId) { if (!x.sucursales.includes(sucursalId)) return false; }
    else if (x.origenId || x.destinoId) { if (x.origenId !== sucursalId && x.destinoId !== sucursalId) return false; }
    else { const k = CAMPOS_SUCURSAL.find((c) => x[c]); if (k && x[k] !== sucursalId) return false; }
  }
  if (desde || hasta) {
    const f = fechaDe(x);
    if (f) { if (desde && f < desde.slice(0, f.length)) return false; if (hasta && f > hasta.slice(0, f.length)) return false; }
  }
  return true;
}
const PERSONAS = new Set(["pacientes", "usuarios", "rh.empleados"]);
const SIEMPRE = new Set(["telefono", "celular", "movil", "correo", "email", "domicilio", "curp", "rfc", "nss", "clabe", "cuentaBancaria", "foto", "firma", "emergencia", "tutor", "contactoEmergencia"]);
const NOMBRES = new Set(["nombre", "nombres", "apellidos", "apellido", "nombreCompleto"]);
const TEXTO_LIBRE = new Set(["comentario", "nota", "notas", "observaciones"]);
/** Anonimiza un registro: quita contacto e identificadores, nombre → «Paciente EXP-…», nacimiento → solo el año, texto libre omitido. */
export function anonimizarRegistro(ruta, x) {
  const etiqueta = `${ruta === "pacientes" ? "Paciente" : "Persona"} ${x.folio || x.id || ""}`.trim();
  const campo = (k, v, persona) => {
    if (v === null || v === undefined || v === "") return v;
    if (SIEMPRE.has(k) || (k === "direccion" && ruta !== "sucursales")) return typeof v === "object" ? null : "[anonimizado]";
    if (k === "nacimiento" && typeof v === "string") return `${v.slice(0, 4)}-01-01`;
    if (TEXTO_LIBRE.has(k) && typeof v === "string") return "[texto omitido]";
    if (typeof v === "string" && (k === "cliente" || k === "paciente")) return "[anonimizado]";
    if (typeof v === "string" && NOMBRES.has(k) && persona) return k === "apellidos" || k === "apellido" ? "" : etiqueta;
    if (v && typeof v === "object") return recorre(v, persona || ["cliente", "paciente", "contacto"].includes(k));
    return v;
  };
  const recorre = (v, persona) => {
    if (Array.isArray(v)) return v.map((e) => (e && typeof e === "object" ? recorre(e, persona) : e));
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = campo(k, val, persona);
    return o;
  };
  return recorre(x, PERSONAS.has(ruta));
}
/**
 * Arma la exportación (no descarga ni registra: eso lo hace la pantalla con registrarExportacion). JSON = un archivo con manifiesto y
 * todas las colecciones; CSV = un archivo por colección, con los encabezados del sistema (el de pacientes se puede volver a importar).
 * Nunca incluye los campos de la lista de exclusión ni imágenes (registroSeguro de plataforma). Solo admin/dirección.
 */
export function exportarDatos(d, { modulos = [], formato = "json", sucursalId = "", desde = "", hasta = "", anonimizar = false } = {}) {
  if (!central(d)) return SOLO_CENTRAL;
  const defs = MODULOS_EXPORTACION.filter((m) => modulos.includes(m.id));
  if (!defs.length) return err("Elige al menos un módulo.");
  if (!["json", "csv"].includes(formato)) return err("Formato no válido.");
  if (sucursalId && !d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  if (desde && hasta && desde > hasta) return err("La fecha inicial es posterior a la final.");
  const rutas = [...new Set(defs.flatMap((m) => m.rutas))];
  const filtro = { sucursalId, desde, hasta };
  const datos = {};
  rutas.forEach((ruta) => {
    const filas = filasDe(d, ruta).filter((x) => enFiltro(ruta, x, filtro)).map(registroSeguro);
    datos[ruta] = anonimizar ? filas.map((x) => anonimizarRegistro(ruta, x)) : filas;
  });
  const conteo = Object.fromEntries(rutas.map((r) => [r, datos[r].length]));
  const registros = Object.values(conteo).reduce((a, n) => a + n, 0);
  const dia = hoy(), meta = { formato, modulos: defs.map((m) => m.id), sucursalId: sucursalId || null, desde: desde || null, hasta: hasta || null, anonimizado: !!anonimizar, registros, conteo };
  let archivos;
  if (formato === "json") {
    archivos = [{ nombre: `exportacion_${dia}${anonimizar ? "_anonimizada" : ""}.json`, tipo: "application/json", texto: JSON.stringify({ ...meta, formato: "podix-export-1", archivo: "json", generado: ahoraLocal(), clinica: (d.config && d.config.nombreComercial) || "", version: VERSION_SISTEMA, datos }, null, 1) }];
  } else {
    archivos = rutas.filter((r) => datos[r].length).map((r) => ({ nombre: `${r.replace(/\./g, "_")}_${dia}${anonimizar ? "_anon" : ""}.csv`, tipo: "text/csv;charset=utf-8", texto: csvBD(columnasDe(datos[r], 80), datos[r]), ruta: r, filas: datos[r].length }));
  }
  return ok({ archivos, meta, datos });
}
/** Deja constancia de una exportación (bitácora + historial del dominio). */
export function registrarExportacion(d, meta) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const s = saas(d);
  const reg = { id: uid("EX"), fecha: ahoraLocal(), usuarioId: u.id, sucursalId: suc(d), ...meta };
  s.exportaciones.unshift(reg);
  if (s.exportaciones.length > 60) s.exportaciones.length = 60;
  auditar(d, "exportacion_datos", "exportacion", reg.id, `${meta.formato.toUpperCase()} · ${meta.modulos.join(", ")} · ${meta.registros} registro(s)${meta.anonimizado ? " · anonimizada" : ""}${meta.sucursalId ? ` · ${meta.sucursalId}` : ""}${meta.desde || meta.hasta ? ` · ${meta.desde || "…"} a ${meta.hasta || "…"}` : ""}`);
  return ok({ registro: reg });
}

// ═════════════════════════ SALUD (Pie Firme: Salud.jsx + migración 062)
export const LIMITE_ALMACENAMIENTO = 5000000; // caracteres que admite localStorage (aprox. 5 MB)
export const TOPE_ERRORES = 50;
/** Agrega un error al registro acotado (el más reciente primero; repetidos consecutivos se cuentan). Pura. */
export function agregarError(lista, e, { tope = TOPE_ERRORES, ts = ahoraLocal() } = {}) {
  const l = Array.isArray(lista) ? [...lista] : [];
  const mensaje = String((e && e.mensaje) || "Error sin mensaje").slice(0, 300), ruta = String((e && e.ruta) || "");
  if (l[0] && l[0].mensaje === mensaje && l[0].ruta === ruta && !l[0].resuelto) { l[0] = { ...l[0], veces: (l[0].veces || 1) + 1, ts }; return l; }
  l.unshift({ id: `ER${Date.now().toString(36)}${l.length}`, ts, origen: (e && e.origen) || "manual", mensaje, detalle: String((e && e.detalle) || "").slice(0, 1500), ruta, usuarioId: (e && e.usuarioId) || null, rol: (e && e.rol) || null, veces: 1, resuelto: false });
  if (l.length > tope) l.length = tope;
  return l;
}
/** Tamaño del estado guardado en el navegador y las colecciones que más pesan. */
export function tamanoEstado(d) {
  const bytes = JSON.stringify(d).length;
  const porColeccion = Object.keys(d).map((k) => ({ k, bytes: JSON.stringify(d[k] ?? null).length })).sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  const pct = bytes / LIMITE_ALMACENAMIENTO;
  return { bytes, mb: redondear(bytes / 1048576), pct: Math.round(pct * 1000) / 10, alerta: pct >= 0.8, critico: pct >= 0.95, porColeccion };
}
/** Resumen para la pantalla de salud. errores = registro de errores del navegador. */
export function resumenSalud(d, errores = []) {
  const ahora = ahoraLocal(), ayer = `${sumarDias(hoy(), -1)}${ahora.slice(10)}`;
  const activos = (d.usuarios || []).filter((u) => u.activo !== false);
  const porRol = activos.reduce((a, u) => ({ ...a, [u.rol]: (a[u.rol] || 0) + 1 }), {});
  return {
    version: VERSION_SISTEMA, generado: ahora, tamano: tamanoEstado(d),
    validacion: (d.validacion && d.validacion.ultima) || null, etl: (d.dw && d.dw.corridas && d.dw.corridas[0]) || null,
    integraciones: (d.config && d.config.integraciones) || [],
    errores: { total: errores.length, sinResolver: errores.filter((e) => !e.resuelto).length, ult24h: errores.filter((e) => e.ts >= ayer).length },
    bitacora24h: (d.bitacora || []).filter((b) => b.fecha >= ayer).length, usuariosActivos: activos.length, porRol,
    pendientesSync: (d.cola || []).filter((q) => q.estado === "pendiente").length,
  };
}
const reloj = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
/** Pruebas de humo en vivo sobre los datos actuales. Solo leen (trabajan sobre una copia cuando hace falta). */
export function pruebasHumo(d) {
  const pruebas = [
    ["sesion", "Sesión válida", () => { const u = actor(d); if (!u) throw new Error("No hay usuario activo en sesión."); return `${u.nombre} · ${d.sesion.sucursalId || "sin sucursal"}`; }],
    ["catalogos", "Catálogos base con datos", () => { const v = ["sucursales", "usuarios", "productos", "servicios", "pacientes"].filter((k) => !(d[k] || []).length); if (v.length) throw new Error(`Vacíos: ${v.join(", ")}`); return `${d.sucursales.length} sucursales · ${d.productos.length} productos · ${d.pacientes.length} pacientes`; }],
    ["csv", "Analizador CSV (ida y vuelta)", () => { const filas = [{ a: 'Pérez, "Juan"', b: "línea 1\nlínea 2" }, { a: "x", b: "" }]; const p = IM.parsearCSV(IM.aCSV(["a", "b"], filas)); if (JSON.stringify(p.filas) !== JSON.stringify(filas)) throw new Error("El CSV no regresa igual."); return "Comillas, comas y saltos de línea"; }],
    ["mapeo", "Mapeo heurístico de columnas", () => { const m = IM.mapearColumnas(["Nombre completo", "Cel", "F. Nac."], [], "pacientes"); const c = m.map((x) => x.campo).join(","); if (c !== "nombre_completo,telefono,nacimiento") throw new Error(`Mapeo inesperado: ${c}`); return m.map((x) => `${x.columna}→${x.campo} ${x.confianza} %`).join(" · "); }],
    ["validacion", "Reglas de integridad ejecutan", () => { const r = validarTodo(d); const fallas = r.reglas.filter((x) => x.fallo); if (fallas.length) throw new Error(`${fallas.length} regla(s) no pudieron ejecutarse`); return `${r.resumen.ok} de ${r.resumen.aplican} en orden`; }],
    ["etl", "Última carga del DW", () => { const c = d.dw && d.dw.corridas && d.dw.corridas[0]; if (!c) throw new Error("Sin cargas registradas."); if (c.estado === "error") throw new Error(`La carga ${c.ts} terminó con error.`); return `${c.ts} · ${c.estado} · ${c.filas} filas`; }],
    ["folios", "Contadores de folio al día", () => { const max = Math.max(0, ...(d.ventas || []).map((v) => Number(String(v.folio || "").replace(/\D/g, "")) || 0)); if (((d.contadores || {}).T || 0) < max) throw new Error(`Serie T en ${(d.contadores || {}).T} con folio ${max} emitido`); return `Serie T en ${(d.contadores || {}).T}`; }],
    ["exportacion", "Exportación reimportable", () => { const e = exportarDatos(d, { modulos: ["pacientes"], formato: "csv" }); if (!e.ok) throw new Error(e.error); const a = analizarArchivo(e.archivos[0].texto, "pacientes"); if (!a.mapeos.some((m) => m.campo === "nombres")) throw new Error("No se reconocen las columnas exportadas."); return `${e.meta.registros} pacientes · ${a.mapeos.filter((m) => m.campo).length} columnas reconocidas`; }],
    ["almacen", "Espacio del navegador", () => { const t = tamanoEstado(d); if (t.alerta) throw new Error(`Uso de ${t.pct} % del tope (aviso al 80 %)`); return `${t.mb} MB · ${t.pct} % del tope`; }],
    ["modulos", "Suscripción: Paquete Clínico activo", () => { if (!moduloActivo(d, "clinico")) throw new Error("La clínica está suspendida o sin Paquete Clínico."); return "Activo"; }],
  ];
  return pruebas.map(([id, nombre, fn]) => { const t0 = reloj(); try { const detalle = fn(); return { id, nombre, ok: true, detalle, ms: Math.round(reloj() - t0) }; } catch (e) { return { id, nombre, ok: false, detalle: String((e && e.message) || e), ms: Math.round(reloj() - t0) }; } });
}

// ═════════════════════════ DATOS DE PRUEBA (Pie Firme: DatosPrueba.jsx; P-132)
const ID_SEMILLA = /^[A-Za-z]{1,6}-?\d{1,7}$/;
/**
 * ¿Es dato de prueba? Lo marcado `prueba:true` (generado aquí o importado desde un archivo de ejemplo) y lo que sembró la semilla
 * (identificador consecutivo PREFIJO+número). Lo capturado por personas lleva identificador con marca de tiempo y NO es de prueba.
 * Con base de datos: columna `es_prueba` por registro (en Pie Firme cuelga de la clínica marcada es_prueba).
 */
export const esDePrueba = (x) => !!x && typeof x === "object" && (x.prueba === true || (!x.importado && typeof x.id === "string" && ID_SEMILLA.test(x.id)));
export const MODULOS_LIMPIEZA = [
  { id: "agenda", nombre: "Agenda", rutas: ["citas", "listaEspera"] },
  { id: "clinico", nombre: "Consultas y laboratorio", rutas: ["consultas", "ordenesLab", "eval"] },
  { id: "caja", nombre: "Ventas, caja y cartera", rutas: ["abonosCredito", "ventas", "devoluciones", "apartados", "planes", "turnos", "pedidosWeb"] },
  { id: "inventario", nombre: "Movimientos de inventario y compras", rutas: ["traspasos", "inventarios", "ajustesInventario", "oc", "cxp", "auditorias", "investigacionesInv"] },
  { id: "finanzas", nombre: "Gastos", rutas: ["fin.gastos", "fin.notasCompra"] },
  { id: "personal", nombre: "Asistencia e incidencias", rutas: ["rh.asistencia", "rh.incidencias", "rh.vacaciones"] },
  { id: "comunicacion", nombre: "Mensajes, correo y feed", rutas: ["com.hilos", "com.correos", "com.feed"] },
  { id: "pacientes", nombre: "Pacientes sin movimientos", rutas: ["pacientes"] },
];
export const CONFIRMA_LIMPIAR = "BORRAR", CONFIRMA_SEMILLA = "REGENERAR";
const arreglo = (d, ruta) => { const [a, b] = ruta.split("."); const v = b ? (d[a] || {})[b] : d[a]; return Array.isArray(v) ? v : null; };
/** Conteo, cuántos son de prueba y rango de fechas por colección. */
export function resumenDatos(d) {
  const moduloDe = (ruta) => (MODULOS_LIMPIEZA.find((m) => m.rutas.includes(ruta)) || {}).id || null;
  return coleccionesBD(d).filter((c) => c.tipo === "tabla").map((c) => {
    const filas = filasDe(d, c.ruta);
    let min = null, max = null, prueba = 0;
    for (const x of filas) { if (esDePrueba(x)) prueba += 1; const f = fechaDe(x); if (f) { if (!min || f < min) min = f; if (!max || f > max) max = f; } }
    return { id: c.ruta, ruta: c.ruta, registros: filas.length, prueba, desde: min, hasta: max, modulo: moduloDe(c.ruta) };
  });
}
/** Limpia SOLO los datos de prueba de un módulo. Exige escribir «BORRAR». La bitácora nunca se limpia (P-127). */
export function limpiarDatosPrueba(d, { modulo, confirmacion = "" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const m = MODULOS_LIMPIEZA.find((x) => x.id === modulo);
  if (!m) return err("Módulo no válido.");
  if (txt(confirmacion).toUpperCase() !== CONFIRMA_LIMPIAR) return err(`Para confirmar escribe ${CONFIRMA_LIMPIAR}.`);
  const eliminados = {};
  let conservados = 0;
  if (m.id === "pacientes") {
    const usados = new Set();
    [d.citas, d.consultas, d.ventas, d.apartados, d.planes, d.ordenesLab, d.listaEspera, d.eval, d.pedidosWeb].forEach((arr) => (arr || []).forEach((x) => x && x.pacienteId && usados.add(x.pacienteId)));
    const antes = d.pacientes.length;
    const quedan = d.pacientes.filter((p) => { if (!esDePrueba(p)) return true; if (usados.has(p.id)) { conservados += 1; return true; } return false; });
    d.pacientes.splice(0, d.pacientes.length, ...quedan);
    eliminados.pacientes = antes - quedan.length;
  } else {
    m.rutas.forEach((ruta) => {
      const arr = arreglo(d, ruta);
      if (!arr) return;
      const antes = arr.length, quedan = arr.filter((x) => !esDePrueba(x));
      arr.splice(0, arr.length, ...quedan);
      eliminados[ruta] = antes - quedan.length;
    });
  }
  const total = Object.values(eliminados).reduce((a, n) => a + n, 0);
  auditar(d, "datos_prueba_limpiados", "datos_prueba", m.id, `${m.nombre}: ${total} registro(s) de prueba eliminados${conservados ? ` · ${conservados} conservados por tener movimientos` : ""}`);
  return ok({ eliminados, total, conservados });
}
/** Vuelve a sembrar todos los datos (conserva la sesión). Exige escribir «REGENERAR». Lo capturado se pierde. */
export function regenerarSemilla(d, { confirmacion = "" } = {}) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (txt(confirmacion).toUpperCase() !== CONFIRMA_SEMILLA) return err(`Para confirmar escribe ${CONFIRMA_SEMILLA}.`);
  const sesion = { ...d.sesion }, nuevo = crearSeed();
  Object.keys(d).forEach((k) => { delete d[k]; });
  Object.assign(d, nuevo);
  d.sesion = nuevo.usuarios.some((x) => x.id === sesion.userId) ? sesion : { userId: null, sucursalId: null };
  auditar(d, "semilla_regenerada", "datos_prueba", "semilla", `Datos de demostración regenerados por ${u.nombre}`);
  return ok();
}
const NOMBRES_F = ["Adriana", "Beatriz", "Carolina", "Daniela", "Elena", "Fernanda", "Gabriela", "Irene", "Julieta", "Lorena", "Marisol", "Natalia", "Olga", "Paola", "Rocío", "Silvia", "Teresa", "Verónica"];
const NOMBRES_M = ["Alberto", "Bernardo", "César", "Diego", "Emilio", "Felipe", "Gerardo", "Héctor", "Ignacio", "Jorge", "Leonardo", "Manuel", "Néstor", "Óscar", "Pablo", "Raúl", "Sergio", "Tomás"];
const APELLIDOS = ["Aguilar", "Barrios", "Cárdenas", "Domínguez", "Escobar", "Figueroa", "Galindo", "Herrera", "Ibáñez", "Juárez", "Lara", "Mendoza", "Navarro", "Ortega", "Pineda", "Quiroz", "Rosales", "Salinas", "Trujillo", "Valdez", "Zavala"];
const CONCEPTOS = [["papeleria", "Papelería y consumibles de oficina"], ["limpieza", "Material de limpieza"], ["mantenimiento", "Mantenimiento menor del local"], ["otros", "Mensajería y paquetería"], ["publicidad", "Volantes y publicidad local"]];
/** Genera más datos de prueba (marcados prueba:true), deterministas según el contador. tipo: "pacientes" | "gastos". */
export function generarDatosPrueba(d, { tipo, n = 20 }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const k = Math.round(Number(n));
  if (!(k >= 1 && k <= 200)) return err("Indica entre 1 y 200 registros.");
  d.contadores ||= {};
  let a = 7919 * ((d.contadores.GENP = (d.contadores.GENP || 0) + 1));
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (x, y) => x + Math.floor(r() * (y - x + 1)), pick = (l) => l[Math.floor(r() * l.length)], pad = (x) => String(x).padStart(2, "0");
  const sucs = d.sucursales.filter((s) => s.activa !== false);
  if (tipo === "pacientes") {
    const exp = siguienteExpediente(d);
    for (let i = 0; i < k; i++) {
      const f = r() > 0.5, nombres = pick(f ? NOMBRES_F : NOMBRES_M);
      d.pacientes.push({ id: uid("PA"), folio: exp(), nombres, apellidos: `${pick(APELLIDOS)} ${pick(APELLIDOS)}`, nacimiento: `${int(1940, 2008)}-${pad(int(1, 12))}-${pad(int(1, 28))}`, sexo: f ? "F" : "M",
        telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}`, whatsapp: true, correo: "", domicilio: `Calle ${int(1, 60)} #${int(1, 300)}`, ocupacion: pick(["Docente", "Comerciante", "Hogar", "Oficinista", "Jubilado/a"]),
        emergencia: null, origen: "Datos de prueba", convenioId: null, alertas: [], sucursalAlta: pick(sucs).id, avisoFirmado: true, consentimientoFirmado: true, tutor: null, activo: true, prueba: true });
    }
  } else if (tipo === "gastos") {
    if (!d.fin || !Array.isArray(d.fin.gastos)) return err("El módulo de gastos no está en los datos.");
    const cats = new Set((d.fin.categorias || []).map((c) => c.id));
    for (let i = 0; i < k; i++) {
      const [cat, concepto] = pick(CONCEPTOS);
      d.fin.gastos.push({ id: uid("GA"), sucursalId: pick(sucs).id, fecha: sumarDias(hoy(), -int(0, 29)), categoria: cats.has(cat) ? cat : "otros", concepto, monto: int(15, 250) * 10, proveedorId: null, comprobante: null,
        fuente: "manual", registradoPor: u.id, usuarioId: u.id, prueba: true });
    }
  } else return err("Tipo no válido.");
  auditar(d, "datos_prueba_generados", "datos_prueba", tipo, `${k} registro(s) de prueba de ${tipo}`);
  return ok({ n: k });
}

// ═════════════════════════ SUSCRIPCIÓN (Pie Firme: Suscripcion.jsx + migración 056; P-113 a P-117)
export const moduloDef = (clave) => MODULOS_SUSCRIPCION.find((m) => m.clave === clave) || null;
const mesDe = (f) => String(f).slice(0, 7);
const mesSiguiente = (p) => { const [y, m] = p.split("-").map(Number); const t = new Date(y, m, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
/**
 * ¿Está activo el módulo para esta clínica? Lo pueden consultar otros dominios: moduloActivo(d, "asistente_ia").
 * Sin datos de suscripción (estado anterior) no bloquea nada. Suspendida o baja → nada activo (solo lectura y exportación, P-114).
 */
export function moduloActivo(d, clave, ref = hoy()) {
  const s = d && d.saas && d.saas.suscripcion;
  if (!s) return true;
  if (s.estado === "suspendida" || s.estado === "baja") return false;
  const def = moduloDef(clave);
  if (!def) return false;
  if (def.base) return true;
  const m = (s.modulos || {})[clave];
  if (!m) return false;
  if (m.estado === "contratado") return true;
  if (m.estado === "prueba") return !!m.pruebaHasta && ref <= m.pruebaHasta;
  return false;
}
/** Estado mostrado de un módulo: contratado | prueba (con días restantes) | prueba_vencida | no_contratado. */
export function estadoModulo(d, clave, ref = hoy()) {
  const m = ((d.saas && d.saas.suscripcion && d.saas.suscripcion.modulos) || {})[clave] || { estado: "no_contratado" };
  if (m.estado === "prueba") { const dias = diasEntre(ref, m.pruebaHasta); return dias >= 0 ? { estado: "prueba", dias, ...m } : { ...m, estado: "prueba_vencida", dias: 0 }; }
  return { ...m };
}
export const ETIQUETA_MODULO = { contratado: ["Contratado", "ok"], prueba: ["En prueba", "info"], prueba_vencida: ["Prueba terminada", "warn"], no_contratado: ["No contratado", "neutral"] };
export function precioModulo(d, clave) {
  const def = moduloDef(clave), s = d.saas && d.saas.suscripcion;
  const p = (s && s.precios && s.precios[clave]) || { lista: def.lista, fundador: def.fundador, porValidar: true };
  return { ...p, aplica: s && s.fundador ? p.fundador : p.lista };
}
/** Cargo mensual del periodo: Σ módulos contratados × precio (fundador si aplica) × sucursales activas (si es por sucursal). + IVA. */
export function cargoMensual(d, periodo = mesDe(hoy())) {
  const s = saas(d);
  const sucursales = d.sucursales.filter((x) => x.activa !== false).length;
  const usuarios = (d.usuarios || []).filter((x) => x.activo !== false).length;
  const lineas = MODULOS_SUSCRIPCION.filter((m) => { const e = s.suscripcion.modulos[m.clave]; return e && e.estado === "contratado" && (!e.cobroDesde || e.cobroDesde <= periodo); }).map((m) => {
    const p = precioModulo(d, m.clave), unidades = m.unidad === "sucursal" ? sucursales : 1;
    return { clave: m.clave, nombre: m.nombre, unidad: m.unidad, unidades, precio: p.aplica, importe: redondear(p.aplica * unidades), porValidar: p.porValidar };
  });
  const subtotal = redondear(lineas.reduce((a, l) => a + l.importe, 0)), iva = redondear(subtotal * (s.ivaPct ?? 16) / 100);
  return { periodo, lineas, subtotal, iva, total: redondear(subtotal + iva), sucursales, usuarios };
}
const historialSus = (d, u, accion, detalle) => { const s = saas(d).suscripcion; s.historial.unshift({ id: uid("SH"), ts: ahoraLocal(), usuarioId: u.id, accion, detalle }); if (s.historial.length > 80) s.historial.length = 80; };
/** Prueba de 14 días de un módulo (una sola vez por módulo, P-114). */
export function iniciarPrueba(d, clave) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const def = moduloDef(clave), s = saas(d).suscripcion;
  if (!def || def.base) return err("Ese módulo no tiene prueba.");
  const m = (s.modulos[clave] ||= { estado: "no_contratado" });
  if (m.estado === "contratado") return err("El módulo ya está contratado.");
  if (m.pruebaUsada) return err("La prueba de este módulo ya se usó.");
  Object.assign(m, { estado: "prueba", desde: hoy(), pruebaHasta: sumarDias(hoy(), DIAS_PRUEBA), pruebaUsada: true });
  historialSus(d, u, "prueba", `Inicio de prueba de ${DIAS_PRUEBA} días: ${def.nombre}.`);
  auditar(d, "suscripcion_prueba", "suscripcion", clave, `${def.nombre} · hasta ${m.pruebaHasta}`);
  return ok({ hasta: m.pruebaHasta });
}
/** Contrata un módulo: se activa hoy; el cargo aplica desde el siguiente periodo, sin prorrateo (P-116). */
export function contratarModulo(d, clave) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const def = moduloDef(clave), s = saas(d).suscripcion;
  if (!def) return err("Módulo no válido.");
  const m = (s.modulos[clave] ||= { estado: "no_contratado" });
  if (m.estado === "contratado") return err("El módulo ya está contratado.");
  Object.assign(m, { estado: "contratado", desde: hoy(), pruebaHasta: null, cobroDesde: mesSiguiente(mesDe(hoy())) });
  const p = precioModulo(d, clave);
  historialSus(d, u, "contratacion", `Contratado: ${def.nombre} (${p.aplica} ${def.unidad === "sucursal" ? "por sucursal" : "por clínica"} al mes + IVA; cobra desde ${m.cobroDesde}).`);
  auditar(d, "suscripcion_contratar", "suscripcion", clave, `${def.nombre} · cobra desde ${m.cobroDesde}`);
  return ok();
}
export function cancelarModulo(d, clave, motivo = "") {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const def = moduloDef(clave), s = saas(d).suscripcion;
  if (!def) return err("Módulo no válido.");
  if (def.base) return err("El Paquete Clínico es la base del sistema: no se cancela por separado.");
  const m = s.modulos[clave];
  if (!m || (m.estado !== "contratado" && m.estado !== "prueba")) return err("El módulo no está activo.");
  Object.assign(m, { estado: "no_contratado", hasta: hoy() });
  historialSus(d, u, "cancelacion", `Cancelado: ${def.nombre}${motivo ? ` — ${txt(motivo)}` : ""}. Los datos se conservan.`);
  auditar(d, "suscripcion_cancelar", "suscripcion", clave, def.nombre);
  return ok();
}
/** Edita los PARÁMETROS de precio (de lista y de cliente fundador) de un módulo; se pueden marcar como validados con el dueño. */
export function guardarPrecioModulo(d, clave, { lista, fundador, validado = false }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const def = moduloDef(clave);
  if (!def) return err("Módulo no válido.");
  const L = Number(lista), F = Number(fundador);
  if (!(L >= 0) || !(F >= 0) || lista === "" || fundador === "") return err("Los precios deben ser números iguales o mayores a cero.");
  if (F > L) return err("El precio de fundador no puede ser mayor que el de lista.");
  const s = saas(d).suscripcion, antes = s.precios[clave] || {};
  s.precios[clave] = { lista: redondear(L), fundador: redondear(F), porValidar: !validado };
  historialSus(d, u, "precio", `${def.nombre}: lista ${antes.lista ?? "—"} → ${redondear(L)}, fundador ${antes.fundador ?? "—"} → ${redondear(F)}${validado ? " (validado)" : " (por validar)"}.`);
  auditar(d, "suscripcion_precio", "suscripcion", clave, `lista ${redondear(L)} · fundador ${redondear(F)}${validado ? " · validado" : ""}`);
  return ok();
}
/**
 * Pago SIMULADO del periodo. // INTEGRACIÓN: pasarela de pago (o registro manual de RANNIX, P-113). Hoy no se cobra nada: se genera
 * una referencia SIM-… y el cobro queda «pagado» en la demostración. Un pago al corriente reactiva la suscripción vencida.
 */
export function pagarSuscripcionSimulado(d, { periodo = mesDe(hoy()), metodo = "tarjeta" } = {}) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (!/^\d{4}-\d{2}$/.test(periodo)) return err("Periodo no válido.");
  if (!["tarjeta", "transferencia", "deposito"].includes(metodo)) return err("Método no válido.");
  const s = saas(d).suscripcion;
  let c = s.cobros.find((x) => x.periodo === periodo);
  if (c && c.estado === "pagado") return err(`El periodo ${periodo} ya está pagado.`);
  if (!c) { const k = cargoMensual(d, periodo); c = { id: uid("SC"), periodo, importe: k.subtotal, iva: k.iva, total: k.total, simulado: true }; s.cobros.push(c); s.cobros.sort((a, b) => a.periodo.localeCompare(b.periodo)); }
  Object.assign(c, { estado: "pagado", metodo, referencia: referenciaSimulada(periodo), fecha: hoy(), usuarioId: u.id, sucursalId: suc(d) });
  if (s.estado === "vencida") s.estado = "activa";
  const cl = (d.clinicas || []).find((x) => x.propia); if (cl && cl.estado === "vencida") cl.estado = "activa";
  historialSus(d, u, "pago", `Pago simulado de ${periodo}: ${c.total} (${metodo}) · ${c.referencia}.`);
  auditar(d, "suscripcion_pago_simulado", "suscripcion", c.referencia, `${periodo} · ${c.total} · ${metodo} · SIMULADO`);
  return ok({ cobro: c });
}
// INTEGRACIÓN: aquí la pasarela devolvería su referencia de cargo; la demo arma una con fecha y un consecutivo.
const referenciaSimulada = (periodo) => `SIM-${periodo.replace("-", "")}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
/** Guarda los datos de facturación de la suscripción (RANNIX emite el CFDI cuando tenga timbrado, P-117). */
export function guardarFacturacionSus(d, { razonSocial, rfc, correo }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const R = txt(rfc).toUpperCase();
  if (R && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(R)) return err("RFC inválido.");
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(txt(correo))) return err("Correo inválido.");
  saas(d).suscripcion.facturacion = { razonSocial: txt(razonSocial), rfc: R, correo: txt(correo) };
  historialSus(d, u, "facturacion", "Datos de facturación actualizados.");
  auditar(d, "suscripcion_facturacion", "suscripcion", R || "—", txt(razonSocial));
  return ok();
}

// ═════════════════════════ PANEL RANNIX multi-clínica (Pie Firme: RannixPanel + RannixSoporte; migraciones 059 y 062)
// Demostración SIN aislamiento real (P-128): las clínicas ficticias viven en este mismo navegador. En producción el panel solo
// recibe metadatos de uso y cobro (nunca datos de salud) desde una función de servidor que verifica al personal de RANNIX.
export const ESTADOS_TICKET = { abierto: ["Abierto", "bad"], en_atencion: ["En atención", "warn"], esperando_clinica: ["Esperando a la clínica", "info"], resuelto: ["Resuelto", "ok"], cerrado: ["Cerrado", "neutral"] };
const ticketAbierto = (t) => t.estado !== "resuelto" && t.estado !== "cerrado";
/** Clínicas con su uso (la propia, en vivo), resumen y lo que hay que decidir. */
export function panelRannix(d, { errores = [] } = {}) {
  const s = saas(d), dia = hoy(), mes = mesDe(dia);
  const tickets = s.soporte.tickets;
  const clinicas = (d.clinicas || []).map((c) => {
    const t = tickets.filter((x) => x.clinicaId === c.id);
    const base = { ...c, ticketsAbiertos: t.filter(ticketAbierto).length, ticketsUrgentes: t.filter((x) => ticketAbierto(x) && x.prioridad === "urgente").length };
    if (!c.propia) return base;
    const ult = (d.bitacora || []).find((b) => b.accion === "inicio_sesion");
    const v = d.validacion && d.validacion.ultima;
    return { ...base, estado: s.suscripcion.estado, sucursales: d.sucursales.filter((x) => x.activa !== false).length, usuarios: (d.usuarios || []).filter((x) => x.activo !== false).length,
      citasMes: (d.citas || []).filter((x) => String(x.inicio).startsWith(mes)).length, almacenamientoMB: tamanoEstado(d).mb, mrr: cargoMensual(d).subtotal,
      salud: { pct: v ? v.resumen.saludPct : null, errores24h: errores.filter((e) => e.ts >= `${sumarDias(dia, -1)}T${ahoraLocal().slice(11)}`).length }, ultimoAcceso: ult ? ult.fecha : null };
  });
  const cuenta = (e) => clinicas.filter((c) => c.estado === e).length;
  const porDecidir = clinicas.filter((c) => (c.estado === "prueba" && c.pruebaHasta && c.pruebaHasta < dia) || (c.estado === "vencida" && c.graciaHasta && c.graciaHasta < dia))
    .map((c) => ({ id: c.id, nombre: c.nombre, motivo: c.estado === "prueba" ? "Prueba terminada" : "Periodo de gracia terminado", desde: c.estado === "prueba" ? c.pruebaHasta : c.graciaHasta }));
  return {
    clinicas, porDecidir,
    resumen: { activas: cuenta("activa"), enPrueba: cuenta("prueba"), vencidas: cuenta("vencida"), suspendidas: cuenta("suspendida"), baja: cuenta("baja"),
      mrr: redondear(clinicas.filter((c) => c.estado === "activa" || c.estado === "vencida").reduce((a, c) => a + (c.mrr || 0), 0)),
      ticketsAbiertos: tickets.filter(ticketAbierto).length, urgentes: tickets.filter((x) => ticketAbierto(x) && x.prioridad === "urgente").length },
  };
}
/** Cambia el estado de una clínica (exige motivo, P-114). En la propia se refleja en la suscripción (suspendida = solo lectura). */
export function cambiarEstadoClinica(d, { clinicaId, estado, motivo = "" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const c = (d.clinicas || []).find((x) => x.id === clinicaId);
  if (!c) return err("Clínica no encontrada.");
  if (!ESTADOS_CLINICA[estado]) return err("Estado no válido.");
  if (txt(motivo).length < 5) return err("El cambio de estado exige motivo (mínimo 5 caracteres).");
  const antes = c.propia ? saas(d).suscripcion.estado : c.estado;
  if (antes === estado) return err("La clínica ya está en ese estado.");
  c.estado = estado;
  if (estado === "vencida") c.graciaHasta = sumarDias(hoy(), DIAS_GRACIA);
  if (c.propia) saas(d).suscripcion.estado = estado;
  (c.historial ||= []).unshift({ ts: ahoraLocal(), usuarioId: u.id, de: antes, a: estado, motivo: txt(motivo) });
  auditar(d, "rannix_estado_clinica", "clinica", c.id, `${c.nombre}: ${antes} → ${estado} · ${txt(motivo)}`);
  return ok();
}
export function crearTicket(d, { clinicaId = "CL1", asunto, descripcion = "", prioridad = "normal" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (!(d.clinicas || []).some((x) => x.id === clinicaId)) return err("Clínica no encontrada.");
  if (txt(asunto).length < 4) return err("Escribe el asunto.");
  if (!["normal", "urgente"].includes(prioridad)) return err("Prioridad no válida.");
  const ts = ahoraLocal(), id = uid("TK");
  const t = { id, folio: folio(d, "SOP"), clinicaId, asunto: txt(asunto), descripcion: txt(descripcion), prioridad, estado: "abierto", creado: ts, usuarioId: u.id, sucursalId: suc(d),
    mensajes: txt(descripcion) ? [{ id: `${id}M1`, de: "clinica", usuarioId: u.id, ts, texto: txt(descripcion) }] : [] };
  saas(d).soporte.tickets.unshift(t);
  auditar(d, "soporte_ticket", "ticket", t.folio, `${t.asunto} · ${prioridad}`);
  return ok({ ticket: t });
}
/** Responde un ticket como clínica o como RANNIX (demo: la misma persona puede hacer ambos papeles) y opcionalmente cambia el estado. */
export function responderTicket(d, { ticketId, texto = "", de = "rannix", estado = "" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const t = saas(d).soporte.tickets.find((x) => x.id === ticketId);
  if (!t) return err("Ticket no encontrado.");
  if (!["rannix", "clinica"].includes(de)) return err("Autor no válido.");
  if (!txt(texto) && !estado) return err("Escribe la respuesta.");
  if (estado && !ESTADOS_TICKET[estado]) return err("Estado no válido.");
  if (t.estado === "cerrado" && txt(texto)) return err("El ticket está cerrado.");
  if (txt(texto)) t.mensajes.push({ id: uid("TM"), de, usuarioId: u.id, ts: ahoraLocal(), texto: txt(texto) });
  if (estado) t.estado = estado;
  else if (txt(texto) && t.estado === "abierto" && de === "rannix") t.estado = "en_atencion";
  auditar(d, "soporte_respuesta", "ticket", t.folio, `${de === "rannix" ? "RANNIX" : "Clínica"}${estado ? ` · estado ${estado}` : ""}`);
  return ok();
}
export function publicarAviso(d, { titulo, texto, alcance = "todas", nivel = "info" }) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  if (txt(titulo).length < 3 || txt(texto).length < 5) return err("Escribe título y texto del aviso.");
  if (alcance !== "todas" && !(d.clinicas || []).some((x) => x.id === alcance)) return err("Clínica no encontrada.");
  if (!["info", "importante"].includes(nivel)) return err("Nivel no válido.");
  const a = { id: uid("AV"), ts: ahoraLocal(), titulo: txt(titulo), texto: txt(texto), alcance, nivel, activo: true, usuarioId: u.id };
  saas(d).soporte.avisos.unshift(a);
  auditar(d, "rannix_aviso", "aviso", a.id, `${a.titulo} · ${alcance}`);
  return ok({ aviso: a });
}
export function retirarAviso(d, id) {
  const u = central(d);
  if (!u) return SOLO_CENTRAL;
  const a = saas(d).soporte.avisos.find((x) => x.id === id);
  if (!a || !a.activo) return err("Aviso no encontrado.");
  a.activo = false;
  auditar(d, "rannix_aviso_retirado", "aviso", a.id, a.titulo);
  return ok();
}
/** Avisos vigentes para una clínica (la propia por omisión). */
export const avisosPara = (d, clinicaId = "CL1") => (((d.saas && d.saas.soporte && d.saas.soporte.avisos) || [])).filter((a) => a.activo && (a.alcance === "todas" || a.alcance === clinicaId));
