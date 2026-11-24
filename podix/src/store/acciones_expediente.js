// Dominio «expediente» (porte de Pie Firme): acciones sobre el estado `d` (o su copia dentro de mutar()).
// Cada acción valida el rol DENTRO de la acción y deja bitácora (auditar). Reglas puras en reglas_expediente.js.
// Devuelven { ok:true, ... } o { ok:false, error } — nunca lanzan — para que la pantalla muestre el motivo.
import { auditar, uid, folio } from "./core.js";
import { ahoraLocal, hoy } from "../lib/format.js";
import * as X from "./reglas_expediente.js";

export * from "./reglas_expediente.js";

const no = (error) => ({ ok: false, error });
const exp = (d) => (d.exp ||= { antecedentes: {}, sensibles: {}, alergias: [], medicamentos: [], exploracionMI: {}, hallazgos: [], fotos: [], plantillas: [], firmados: [], emitidos: [], aperturas: [], fusiones: [], cedulas: {}, versiones: {} });
const pac = (d, id) => (d.pacientes || []).find((p) => p.id === id) || null;
const suc = (d) => d.sesion?.sucursalId || null;
/** Cada cambio clínico sube la versión del expediente (sale en el pie de los impresos). */
const subirVersion = (d, pacienteId) => { const e = exp(d); e.versiones[pacienteId] = (e.versiones[pacienteId] || 1) + 1; };
const nombreUsuario = (d, id) => (d.usuarios || []).find((u) => u.id === id)?.nombre ?? "—";
export const cedulaDe = (d, usuarioId) => (d.exp?.cedulas || {})[usuarioId] || "";

// ───────── Lectura (selectores del dominio)
/** Lista del buscador: Recepción/Gerencia ven todos (datos de contacto); el podólogo ve todos los de la clínica (P-002). */
export function buscarPacientes(d, q = "", { max = 120, sucursalId = null, soloMios = null } = {}) {
  const t = X.normalizarTexto(q);
  const dig = String(q).replace(/\D/g, "");
  let l = (d.pacientes || []).filter((p) => p.estado !== "fusionado");
  if (sucursalId) l = l.filter((p) => X.esDeSucursal(d, p, sucursalId));
  if (soloMios) l = l.filter((p) => (d.consultas || []).some((c) => c.pacienteId === p.id && c.podologoId === soloMios) || (d.citas || []).some((c) => c.pacienteId === p.id && c.podologoId === soloMios));
  if (t) l = l.filter((p) => X.normalizarTexto(`${X.nombreCompleto(p)} ${p.folio} ${p.folioManual || ""} ${p.correo || ""}`).includes(t) || (dig.length >= 4 && String(p.telefono).replace(/\D/g, "").includes(dig)));
  return l.slice(0, max);
}
export function ultimaVisita(d, pacienteId) {
  return (d.consultas || []).filter((c) => c.pacienteId === pacienteId).map((c) => c.fecha).sort().at(-1) || null;
}
export const consultasPaciente = (d, pacienteId) => (d.consultas || []).filter((c) => c.pacienteId === pacienteId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
/** Consultas que un usuario puede leer: sin nota/diagnóstico para Recepción y Gerencia. */
export function consultasVisibles(d, u, pacienteId) {
  const cs = consultasPaciente(d, pacienteId);
  if (X.puedeVerClinico(u)) return cs;
  return cs.map((c) => ({ id: c.id, fecha: c.fecha, podologoId: c.podologoId, sucursalId: c.sucursalId, estado: c.estado, servicios: c.servicios, restringida: true, firmada: !!c.firma }));
}
export const planesDe = (d, pacienteId) => [...(d.planesTratamiento || []), ...(d.planesTrat || [])].filter((p) => p.pacienteId === pacienteId);
export const ordenesDe = (d, pacienteId) => (d.ordenesLab || []).filter((o) => o.pacienteId === pacienteId);
export const alergiasDe = (d, pacienteId) => (d.exp?.alergias || []).filter((a) => a.pacienteId === pacienteId && a.vigente !== false);
export const medicamentosDe = (d, pacienteId) => (d.exp?.medicamentos || []).filter((a) => a.pacienteId === pacienteId && a.vigente !== false);
export const aperturasDe = (d, pacienteId) => (d.exp?.aperturas || []).filter((a) => a.pacienteId === pacienteId);
export const emitidosDe = (d, pacienteId) => (d.exp?.emitidos || []).filter((a) => a.pacienteId === pacienteId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
/** Pendientes del expediente que se muestran como avisos arriba (P-003, P-004, P-005). */
export function pendientesPaciente(d, p, ref = new Date()) {
  const l = [];
  if (!p) return l;
  if (p.altaRapida) l.push({ tono: "warn", texto: "Alta rápida: completa la ficha antes de la primera consulta clínica (P-003)." });
  if (!p.avisoFirmado) l.push({ tono: "bad", texto: "Falta el aviso de privacidad firmado: se puede atender, pero la nota no se firma sin excepción de Administración (P-004)." });
  if (X.esMenorDeEdad(p.nacimiento, ref) && !p.tutor?.nombre) l.push({ tono: "bad", texto: "Menor de 18 años sin tutor registrado (P-005)." });
  const re = X.firmasPorMayoriaDeEdad(d, p, ref);
  if (re.length) l.push({ tono: "warn", texto: `Ya cumplió 18 años: pide su propia firma de ${re.length} documento(s) que firmó su tutor (P-005).`, codigos: re });
  const pend = (d.consultas || []).filter((c) => c.pacienteId === p.id && X.estadoNota(c) === "firma_pendiente").length;
  if (pend) l.push({ tono: "warn", texto: `${pend} nota(s) con firma pendiente.` });
  return l;
}

// ───────── Apertura del expediente (P-002) — toda apertura queda en bitácora
/**
 * Registra la apertura. `motivo` es obligatorio si el podólogo no tiene relación con el paciente ni es de su sucursal («otra»):
 * se marca para Administración. Recepción/Gerencia abren solo datos.
 */
export function abrirExpediente(d, pacienteId, u, { motivo = "", origen = "expediente" } = {}) {
  const p = pac(d, pacienteId);
  if (!p) return no("Paciente no encontrado.");
  const alcance = X.alcanceExpediente(d, u, suc(d), p);
  if (!alcance) return no("Tu rol no abre expedientes.");
  if (alcance === "otra") { const e = X.validarMotivo(motivo); if (e) return { ok: false, error: e, requiereMotivo: true, alcance }; }
  const notificaAdmin = alcance === "otra";
  exp(d).aperturas.unshift({ id: uid("AX"), pacienteId, usuarioId: u.id, rol: u.rol, sucursalId: suc(d), fecha: ahoraLocal(), alcance, origen, motivo: String(motivo).trim(), notificaAdmin });
  if (d.exp.aperturas.length > 600) d.exp.aperturas.length = 600;
  auditar(d, "consulta_expediente", "paciente", pacienteId, `${alcance}${motivo ? ` · ${String(motivo).trim().slice(0, 60)}` : ""}`);
  return { ok: true, alcance, notificaAdmin };
}
/** ¿Ya abrió hoy este expediente? (para no pedir el motivo en cada render). */
export const abiertoHoy = (d, u, pacienteId) => !!u && (d.exp?.aperturas || []).some((a) => a.pacienteId === pacienteId && a.usuarioId === u.id && String(a.fecha).slice(0, 10) === hoy() && a.origen === "expediente");
/** Bitácora de aperturas: solo Administración/Dirección (o el propio usuario sus aperturas). */
export function bitacoraAperturas(d, u, { pacienteId = null, soloNotificadas = false } = {}) {
  let l = d.exp?.aperturas || [];
  if (!X.puedeVerBitacoraAperturas(u)) l = l.filter((a) => a.usuarioId === u?.id);
  if (pacienteId) l = l.filter((a) => a.pacienteId === pacienteId);
  if (soloNotificadas) l = l.filter((a) => a.notificaAdmin);
  return l;
}

// ───────── Alta y datos del paciente (P-003, P-005, P-006, N-08)
const CAMPOS_DATOS = ["nombres", "apellidos", "nacimiento", "sexo", "telefono", "whatsapp", "correo", "domicilio", "colonia", "ocupacion", "estadoCivil", "lugarOrigen", "curp", "emergencia", "origen", "convenioId", "tallaCalzado", "folioManual"];
function siguienteFolio(d) {
  const n = (d.pacientes || []).reduce((m, p) => Math.max(m, Number(/EXP-(\d+)/.exec(p.folio || "")?.[1] || 0)), 0) + 1;
  return `EXP-${String(n).padStart(6, "0")}`;
}
/**
 * Alta de paciente. Bloquea si hay posible duplicado por nombre completo + fecha de nacimiento, salvo que quien captura
 * confirme «no es la misma persona» (`noEsDuplicado` con motivo; queda en bitácora). El teléfono compartido solo avisa.
 * Alta completa: exige aviso de privacidad y consentimiento de datos de salud con firma (P-003); menor → tutor (P-005).
 */
export function altaPaciente(d, f, u, { rapida = false, noEsDuplicado = null, aviso = false, datosSalud = false, firma = "", firmanteTipo = null, hoyRef = new Date() } = {}) {
  if (!X.puedeAltaPaciente(u)) return no("Tu rol no da de alta pacientes.");
  const datos = { ...f, sucursalAlta: f.sucursalAlta || suc(d) };
  const errores = X.validarAlta(datos, { rapida, hoy: hoyRef });
  if (Object.keys(errores).length) return { ok: false, error: Object.values(errores)[0], errores };
  const dups = X.buscarDuplicados(d.pacientes, datos);
  const bloquea = dups.filter((x) => x.tipo === "bloquea");
  if (bloquea.length && !(noEsDuplicado && String(noEsDuplicado).trim().length >= 5)) return { ok: false, error: "Posible duplicado: ya existe un paciente con el mismo nombre completo y fecha de nacimiento (P-006).", duplicados: dups };
  if (!rapida) {
    const falta = X.consentimientosFaltantes({ aviso, datosSalud, firmaVacia: !firma });
    if (falta.length) return { ok: false, error: `Falta: ${falta.join(", ")}.`, faltan: falta };
  }
  if (datos.folioManual && (d.pacientes || []).some((p) => (p.folioManual || p.folio) === String(datos.folioManual).trim())) return no("Ese número de expediente ya está asignado (N-08).");
  const menor = X.esMenorDeEdad(datos.nacimiento, hoyRef);
  const p = {
    id: uid("PA"), folio: siguienteFolio(d), folioManual: datos.folioManual ? String(datos.folioManual).trim() : null,
    nombres: String(datos.nombres).trim(), apellidos: String(datos.apellidos || "").trim(), nacimiento: datos.nacimiento || "", sexo: datos.sexo || "",
    telefono: String(datos.telefono).trim(), whatsapp: datos.whatsapp !== false, correo: datos.correo || "", domicilio: datos.domicilio || "", colonia: datos.colonia || "",
    ocupacion: datos.ocupacion || "", estadoCivil: datos.estadoCivil || "", lugarOrigen: datos.lugarOrigen || "", curp: datos.curp ? String(datos.curp).toUpperCase() : "",
    emergencia: datos.emergencia || { nombre: "", telefono: "" }, origen: datos.origen || "", convenioId: datos.convenioId || null,
    alertas: [], sucursalAlta: datos.sucursalAlta, avisoFirmado: !rapida && !!aviso, consentimientoFirmado: !rapida && !!datosSalud,
    tutor: menor ? { nombre: String(datos.tutor?.nombre || "").trim(), parentesco: datos.tutor?.parentesco || "", identificacion: datos.tutor?.identificacion || "", telefono: datos.tutor?.telefono || "" } : null,
    activo: true, altaRapida: !!rapida, creadoPor: u.id, creado: ahoraLocal(),
  };
  d.pacientes.push(p);
  exp(d).versiones[p.id] = 1;
  if (!rapida) {
    const tipo = firmanteTipo || (menor ? "tutor" : "paciente");
    for (const codigo of ["aviso_privacidad", "consentimiento_datos_salud"]) registrarFirma(d, p, codigo, { imagen: firma, firmanteTipo: tipo, nombreFirmante: tipo === "tutor" ? p.tutor?.nombre : X.nombreCompleto(p), parentesco: tipo === "tutor" ? p.tutor?.parentesco : null }, u);
  }
  if (bloquea.length) auditar(d, "alta_no_duplicado", "paciente", p.id, `Coincidía con ${bloquea.map((x) => x.paciente.folio).join(", ")}: ${String(noEsDuplicado).trim().slice(0, 60)}`);
  auditar(d, rapida ? "alta_rapida_paciente" : "alta_paciente", "paciente", p.id, `${p.folio} ${X.nombreCompleto(p)}`);
  return { ok: true, paciente: p, avisos: dups.filter((x) => x.tipo === "avisa") };
}
/** Edición de la ficha (datos de contacto e identificación). Recepción, podólogo y Administración. */
export function editarDatosPaciente(d, pacienteId, patch, u, { hoyRef = new Date() } = {}) {
  if (!X.puedeEditarDatos(u)) return no("Tu rol no edita la ficha del paciente.");
  const p = pac(d, pacienteId);
  if (!p) return no("Paciente no encontrado.");
  const nuevo = { ...p };
  for (const k of CAMPOS_DATOS) if (k in patch) nuevo[k] = patch[k];
  if ("tutor" in patch) nuevo.tutor = patch.tutor;
  const completar = p.altaRapida && patch.completar;
  const errores = X.validarAlta({ ...nuevo, sucursalAlta: p.sucursalAlta }, { rapida: p.altaRapida && !completar, hoy: hoyRef });
  if (Object.keys(errores).length) return { ok: false, error: Object.values(errores)[0], errores };
  const dups = X.buscarDuplicados(d.pacientes, nuevo, p.id).filter((x) => x.tipo === "bloquea");
  if (dups.length) return { ok: false, error: `Quedaría duplicado de ${dups[0].paciente.folio} (P-006).`, duplicados: dups };
  const cambios = Object.keys(patch).filter((k) => k !== "completar" && JSON.stringify(p[k]) !== JSON.stringify(nuevo[k]));
  Object.assign(p, nuevo);
  if (!X.esMenorDeEdad(p.nacimiento, hoyRef) && !("tutor" in patch)) { /* se conserva el tutor histórico */ }
  if (completar) p.altaRapida = false;
  auditar(d, "edicion_ficha_paciente", "paciente", p.id, cambios.join(", ") || "sin cambios");
  return { ok: true, cambios };
}

// ───────── Antecedentes y dato sensible (P-030, N-04)
export function guardarAntecedentes(d, pacienteId, patch, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración capturan antecedentes.");
  if (!pac(d, pacienteId)) return no("Paciente no encontrado.");
  if ("vih" in patch) return no("El dato de VIH se captura aparte, con acceso restringido (N-04).");
  const limpio = X.limpiarAntecedentes(patch);
  const e = exp(d);
  e.antecedentes[pacienteId] = { ...(e.antecedentes[pacienteId] || {}), ...limpio, actualizado: hoy(), actualizadoPor: u.id };
  subirVersion(d, pacienteId);
  auditar(d, "antecedentes_actualizados", "paciente", pacienteId, Object.keys(limpio).slice(0, 8).join(", "));
  return { ok: true };
}
/** Lee el dato de VIH (N-04): Recepción/Gerencia nunca; podólogo no tratante con motivo. Cada lectura va a bitácora. */
export function leerVih(d, pacienteId, u, motivo = "") {
  const acc = X.accesoVih(d, u, pacienteId);
  if (!acc.permitido) { auditar(d, "dato_sensible_denegado", "paciente", pacienteId, u?.rol || ""); return no("Dato restringido: solo Podología y Administración (N-04)."); }
  if (acc.requiereMotivo) { const e = X.validarMotivo(motivo); if (e) return { ok: false, error: e, requiereMotivo: true }; }
  exp(d).aperturas.unshift({ id: uid("AX"), pacienteId, usuarioId: u.id, rol: u.rol, sucursalId: suc(d), fecha: ahoraLocal(), alcance: acc.requiereMotivo ? "otra" : X.esAdministracion(u) ? "total" : "propio", origen: "dato_sensible", motivo: String(motivo).trim(), notificaAdmin: acc.requiereMotivo });
  auditar(d, "lectura_dato_sensible", "paciente", pacienteId, motivo ? String(motivo).slice(0, 60) : "");
  const s = d.exp.sensibles[pacienteId] || null;
  return { ok: true, vih: s?.vih ?? null, nota: s?.nota ?? "", fecha: s?.fecha ?? null };
}
export function guardarVih(d, pacienteId, valor, u, { nota = "", motivo = "" } = {}) {
  const acc = X.accesoVih(d, u, pacienteId);
  if (!acc.permitido) return no("Dato restringido: solo Podología y Administración (N-04).");
  if (acc.requiereMotivo) { const e = X.validarMotivo(motivo); if (e) return { ok: false, error: e, requiereMotivo: true }; }
  if (!["si", "no", "no_sabe", null].includes(valor)) return no("Valor no válido.");
  exp(d).sensibles[pacienteId] = { vih: valor, nota: String(nota || ""), actualizadoPor: u.id, fecha: hoy() };
  subirVersion(d, pacienteId);
  auditar(d, "dato_sensible_actualizado", "paciente", pacienteId, motivo ? String(motivo).slice(0, 60) : "");
  return { ok: true };
}
export function agregarAlergia(d, pacienteId, { sustancia, reaccion = "", gravedad = "leve" }, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración.");
  if (!String(sustancia || "").trim()) return no("Escribe la sustancia.");
  exp(d).alergias.push({ id: uid("AL"), pacienteId, sustancia: String(sustancia).trim(), reaccion, gravedad, vigente: true, porId: u.id, fecha: hoy() });
  const p = pac(d, pacienteId);
  if (p && !(p.alertas || []).some((a) => a === `Alergia: ${sustancia}`)) (p.alertas ||= []).push(`Alergia: ${String(sustancia).trim()}`);
  subirVersion(d, pacienteId);
  auditar(d, "alergia_registrada", "paciente", pacienteId, sustancia);
  return { ok: true };
}
export function agregarMedicamento(d, pacienteId, { nombre_dosis, anticoagulante = false }, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración.");
  if (!String(nombre_dosis || "").trim()) return no("Escribe el medicamento y la dosis.");
  exp(d).medicamentos.push({ id: uid("ME"), pacienteId, nombre_dosis: String(nombre_dosis).trim(), anticoagulante: !!anticoagulante, vigente: true, porId: u.id, fecha: hoy() });
  subirVersion(d, pacienteId);
  auditar(d, "medicamento_registrado", "paciente", pacienteId, nombre_dosis);
  return { ok: true };
}
export function suspenderRegistro(d, coleccion, idReg, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración.");
  const x = (exp(d)[coleccion] || []).find((a) => a.id === idReg);
  if (!x) return no("Registro no encontrado.");
  x.vigente = false; x.suspendido = { porId: u.id, fecha: hoy() };
  auditar(d, "registro_suspendido", coleccion, idReg, "");
  return { ok: true };
}

// ───────── Exploración de miembro inferior y mapa del pie (N-02)
export function guardarExploracionMI(d, pacienteId, datos, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración.");
  const limpia = (x = {}) => ({ siluetas: (x.siluetas || []).filter((s) => X.SILUETAS.some((y) => y[0] === s)), rotacion: x.rotacion || "", talalgias: x.talalgias || "", tipo_pie: x.tipo_pie || "", huella_plantar: x.huella_plantar || "", notas: x.notas || "" });
  exp(d).exploracionMI[pacienteId] = { D: limpia(datos.D), I: limpia(datos.I), fecha: ahoraLocal(), porId: u.id };
  subirVersion(d, pacienteId);
  auditar(d, "exploracion_mi", "paciente", pacienteId, "");
  return { ok: true };
}
export function marcarHallazgo(d, pacienteId, { pie, vista, zona, marca = "lesion", nota = "" }, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración marcan el mapa del pie.");
  if (!["D", "I"].includes(pie) || !["dorsal", "plantar"].includes(vista)) return no("Vista no válida.");
  if (!X.zonasDeVista(vista).some((z) => z.codigo === zona)) return no("Zona no válida.");
  const h = { id: uid("HZ"), pacienteId, numero: X.siguienteNumero(X.hallazgosDe(d, pacienteId, { incluirRetirados: true })), pie, vista, zona, marca, ...X.centroZona(pie, vista, zona), nota: String(nota || ""), fecha: ahoraLocal(), porId: u.id };
  exp(d).hallazgos.push(h);
  subirVersion(d, pacienteId);
  auditar(d, "hallazgo_mapa_pie", "paciente", pacienteId, `${h.numero} ${X.nombreZona(zona)}`);
  return { ok: true, hallazgo: h };
}
export function retirarHallazgo(d, hallazgoId, motivo, u) {
  if (!X.puedeEditarClinico(u)) return no("Solo Podología y Administración.");
  const h = (exp(d).hallazgos || []).find((x) => x.id === hallazgoId);
  if (!h) return no("Marca no encontrada.");
  const e = X.validarRetiroFoto(motivo); if (e) return no(e);
  h.retirado = { porId: u.id, fecha: ahoraLocal(), motivo: String(motivo).trim() };
  subirVersion(d, h.pacienteId);
  auditar(d, "hallazgo_retirado", "paciente", h.pacienteId, `${h.numero}: ${motivo}`);
  return { ok: true };
}

// ───────── Nota clínica: firma, inmutabilidad y adenda (P-001, P-004)
/** Edición de la nota ANTES de firmar (firma pendiente). Una nota firmada no se edita nunca: solo adenda. */
export function editarNota(d, consultaId, patch, u) {
  const co = (d.consultas || []).find((c) => c.id === consultaId);
  if (!co) return no("Consulta no encontrada.");
  if (!X.notaEditable(co)) { auditar(d, "intento_editar_nota_firmada", "consulta", co.id, ""); return no("La nota está firmada y bloqueada: agrega una adenda (P-001)."); }
  if (!u || u.rol !== "podologo" || !X.esAutorDeLaNota(u, co)) return no("Solo el podólogo que atendió edita su nota.");
  const campos = ["diagnostico", "nota", "indicaciones"];
  const cambios = campos.filter((k) => k in patch && patch[k] !== co[k]);
  for (const k of cambios) co[k] = String(patch[k] ?? "");
  if (cambios.length) auditar(d, "nota_editada_antes_de_firma", "consulta", co.id, cambios.join(", "));
  return { ok: true, cambios };
}
/** Firma la nota: queda sellada (huella del texto) y ya no admite cambios. */
export function firmarNota(d, consultaId, u, { firma = "", hoyRef = new Date() } = {}) {
  const co = (d.consultas || []).find((c) => c.id === consultaId);
  if (!co) return no("Consulta no encontrada.");
  const m = X.motivosBloqueoFirma({ consulta: co, usuario: u, paciente: pac(d, co.pacienteId), cedula: cedulaDe(d, u?.id), firmaVacia: !firma, hoy: hoyRef });
  if (m.length) return { ok: false, error: m[0], motivos: m };
  co.firma = { porId: u.id, cedula: cedulaDe(d, u.id), fecha: ahoraLocal(), huella: X.huella(X.textoNota(co)), imagen: firma, canal: "firma_pantalla", sucursalId: suc(d) };
  subirVersion(d, co.pacienteId);
  auditar(d, "nota_firmada", "consulta", co.id, co.firma.huella);
  return { ok: true };
}
/** Adenda: fecha, hora y autor; la nota original se conserva visible e intacta (P-001). */
export function agregarAdendaNota(d, consultaId, texto, u) {
  const co = (d.consultas || []).find((c) => c.id === consultaId);
  if (!co) return no("Consulta no encontrada.");
  if (!co.firma) return no("La nota aún no está firmada: corrígela directamente antes de firmar.");
  if (!X.puedeAgregarAdenda(u, co)) return no("Solo el podólogo autor de la nota agrega adendas.");
  const e = X.validarAdenda(texto); if (e) return no(e);
  const a = { id: uid("AD"), fecha: ahoraLocal(), autorId: u.id, autor: u.nombre, texto: String(texto).trim(), firmada: true, cedula: cedulaDe(d, u.id) };
  (co.adendas ||= []).push(a);
  subirVersion(d, co.pacienteId);
  auditar(d, "adenda_nota_firmada", "consulta", co.id, a.texto.slice(0, 60));
  return { ok: true, adenda: a };
}
/** P-004: Administración autoriza firmar sin aviso de privacidad (queda en bitácora). */
export function autorizarExcepcionAviso(d, consultaId, motivo, u) {
  if (!X.esAdministracion(u)) return no("Solo Administración autoriza la excepción.");
  const co = (d.consultas || []).find((c) => c.id === consultaId);
  if (!co) return no("Consulta no encontrada.");
  const e = X.validarMotivo(motivo, 10); if (e) return no(e);
  co.excepcionAviso = { porId: u.id, fecha: ahoraLocal(), motivo: String(motivo).trim() };
  auditar(d, "excepcion_aviso_privacidad", "consulta", co.id, String(motivo).slice(0, 60));
  return { ok: true };
}
/** Pendientes de firma del podólogo (para su tablero). */
export const notasPorFirmar = (d, u) => (d.consultas || []).filter((c) => c.podologoId === u?.id && X.estadoNota(c) === "firma_pendiente");

// ───────── Fotos clínicas (P-007, P-008, P-009)
export function subirFoto(d, f, u, { confirmarExceso = false } = {}) {
  if (!X.puedeSubirFotos(u)) return no("Solo Podología y Administración suben fotos clínicas.");
  const p = pac(d, f.pacienteId);
  if (!p) return no("Paciente no encontrado.");
  if (!X.firmadoVigente(d, p.id, "autorizacion_fotos_clinicas") && !f.sinAutorizacionOk) return { ok: false, error: "Falta la autorización de fotografías clínicas firmada (Documentos).", requiereAutorizacion: true };
  if (f.nivel === "docencia" && !X.docenciaVigente(d, p.id)) return no("Sin autorización de docencia vigente: la foto solo puede ser de nivel clínico (P-009).");
  if (!f.data) return no("Elige una imagen.");
  const tomada = f.tomada || ahoraLocal();
  const clave = X.claveSesion({ consultaId: f.consultaId || null, pacienteId: p.id, tomada });
  const enSesion = X.fotosDeSesion(d.exp?.fotos, clave).length;
  if (X.fotoExcedeLimite(enSesion) && !confirmarExceso) return { ok: false, error: `Esta sesión ya tiene ${enSesion} fotos (máximo ${X.MAX_FOTOS_SESION}). Confirma para agregar otra (P-007).`, requiereConfirmar: true, enSesion };
  const x = { id: uid("FO"), pacienteId: p.id, consultaId: f.consultaId || null, sucursalId: suc(d), pie: f.pie || "D", vista: f.vista || "dorsal", zona: f.zona || "", momento: f.momento || "antes",
    nivel: f.nivel === "docencia" ? "docencia" : "clinico", difuminada: f.nivel === "docencia" ? !!f.difuminada : false, comentario: String(f.comentario || ""), tomada, subidaPor: u.id, data: f.data, demo: null, retirada: null, excesoConfirmado: X.fotoExcedeLimite(enSesion) };
  if (x.nivel === "docencia" && !x.difuminada) return no("Para docencia la foto debe ir con rostro e identificadores difuminados (P-009).");
  exp(d).fotos.push(x);
  auditar(d, "foto_clinica", "paciente", p.id, `${x.momento} ${x.pie}/${x.vista}${x.excesoConfirmado ? " (excede límite, confirmado)" : ""}`);
  return { ok: true, foto: x };
}
/** Nunca se borra: se retira con motivo, autor y fecha (P-008). */
export function retirarFoto(d, fotoId, motivo, u) {
  if (!X.puedeSubirFotos(u)) return no("Solo Podología y Administración.");
  const x = (exp(d).fotos || []).find((f) => f.id === fotoId);
  if (!x) return no("Foto no encontrada.");
  if (x.retirada) return no("La foto ya está retirada.");
  const e = X.validarRetiroFoto(motivo); if (e) return no(e);
  x.retirada = { motivo: String(motivo).trim(), porId: u.id, fecha: ahoraLocal() };
  auditar(d, "foto_retirada", "foto", x.id, String(motivo).slice(0, 60));
  return { ok: true };
}
export function restaurarFoto(d, fotoId, u) {
  if (!X.esAdministracion(u)) return no("Solo Administración restaura fotos retiradas.");
  const x = (exp(d).fotos || []).find((f) => f.id === fotoId);
  if (!x || !x.retirada) return no("La foto no está retirada.");
  (x.historialRetiro ||= []).push(x.retirada); x.retirada = null;
  auditar(d, "foto_restaurada", "foto", x.id, "");
  return { ok: true };
}
/** Cambia el nivel de una foto a docencia (requiere autorización vigente y difuminado) o la regresa a clínico. */
export function cambiarNivelFoto(d, fotoId, nivel, u, { difuminada = false } = {}) {
  if (!X.puedeSubirFotos(u)) return no("Solo Podología y Administración.");
  const x = (exp(d).fotos || []).find((f) => f.id === fotoId);
  if (!x) return no("Foto no encontrada.");
  if (nivel === "docencia") {
    if (!X.docenciaVigente(d, x.pacienteId)) return no("El paciente no tiene autorización de docencia vigente (P-009).");
    if (!difuminada && !x.difuminada) return no("Confirma que rostro e identificadores están difuminados (P-009).");
    x.nivel = "docencia"; x.difuminada = true;
  } else { x.nivel = "clinico"; }
  auditar(d, "foto_nivel", "foto", x.id, x.nivel);
  return { ok: true };
}
/** Pares para comparar antes/después: la primera y la última foto de la misma vista. */
export function parComparacion(fotos, { pie, vista } = {}) {
  const l = fotos.filter((f) => (!pie || f.pie === pie) && (!vista || f.vista === vista)).sort((a, b) => String(a.tomada).localeCompare(String(b.tomada)));
  return l.length >= 2 ? [l[0], l.at(-1)] : null;
}
/** Sesiones de fotos (agrupadas por consulta o por día), la más reciente primero. */
export function sesionesFotos(fotos) {
  const m = new Map();
  for (const f of fotos) { const k = X.claveSesion(f); if (!m.has(k)) m.set(k, { clave: k, fecha: f.tomada, consultaId: f.consultaId, fotos: [] }); const s = m.get(k); s.fotos.push(f); if (String(f.tomada) < String(s.fecha)) s.fecha = f.tomada; }
  return [...m.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// ───────── Documentos firmados y plantillas con versión (N-06, P-139, P-005)
function registrarFirma(d, p, codigo, { imagen, firmanteTipo = "paciente", nombreFirmante, parentesco = null, motivoRepresentante = "", canal = "firma_pantalla", dispositivo = "Pantalla del sistema" }, u) {
  const pl = X.plantillaActiva(d, codigo);
  const x = { id: uid("FD"), folio: folio(d, "DOC"), pacienteId: p.id, codigo, nombre: pl?.nombre || codigo, version: pl?.version ?? null, huella: pl ? X.huella(pl.contenido) : null, fecha: ahoraLocal(),
    canal, firmanteTipo, nombreFirmante: nombreFirmante || X.nombreCompleto(p), parentesco, motivoRepresentante: motivoRepresentante || "", imagen: imagen || null,
    registradoPor: u.id, sucursalId: suc(d), dispositivo, estado: "firmado" };
  // la versión anterior del mismo documento queda «sustituida» (no se borra)
  for (const y of exp(d).firmados) if (y.pacienteId === p.id && y.codigo === codigo && y.estado === "firmado") { y.estado = "sustituido"; y.sustituidoPor = x.id; }
  d.exp.firmados.push(x);
  if (codigo === "aviso_privacidad") p.avisoFirmado = true;
  if (codigo === "consentimiento_datos_salud") p.consentimientoFirmado = true;
  auditar(d, "documento_firmado", "paciente", p.id, `${x.folio} ${x.nombre} v${x.version ?? "—"} (${firmanteTipo})`);
  return x;
}
/**
 * Firma de un documento en pantalla con evidencia (imagen del trazo, versión y huella del texto, quién registró, sucursal, dispositivo).
 * Menor de 18 → firma el tutor. Adulto que no puede firmar → representante con motivo (P-005).
 */
export function firmarDocumento(d, { pacienteId, codigo, imagen = "", firmanteTipo = null, nombreFirmante = "", parentesco = "", motivoRepresentante = "", casilla = false, hoyRef = new Date() }, u) {
  if (!X.puedeFirmarDocumentos(u)) return no("Tu rol no registra firmas de documentos.");
  const p = pac(d, pacienteId);
  if (!p) return no("Paciente no encontrado.");
  const pl = X.plantillaActiva(d, codigo);
  if (!pl) return no("No hay versión activa de ese documento: actívala en «Formatos y consentimientos».");
  if (pl.forma === "firma_pantalla" && !imagen) return no("Falta la firma en pantalla.");
  if (pl.forma === "casilla" && !casilla && !imagen) return no("Marca la casilla de aceptación.");
  const menor = X.esMenorDeEdad(p.nacimiento, hoyRef);
  const tipo = firmanteTipo || (menor ? "tutor" : "paciente");
  if (menor && tipo === "paciente") return no("Es menor de 18 años: firma su madre, padre o tutor (P-005).");
  if (tipo === "tutor" && !String(nombreFirmante || p.tutor?.nombre || "").trim()) return no("Captura el nombre del tutor.");
  if (tipo === "representante" && (!String(nombreFirmante).trim() || X.validarMotivo(motivoRepresentante))) return no("Representante: captura su nombre y el motivo por el que el paciente no firma (P-005).");
  if (tipo === "tutor" && !menor) return no("El paciente ya es mayor de edad: debe firmar él mismo (P-005).");
  const x = registrarFirma(d, p, codigo, { imagen: imagen || null, firmanteTipo: tipo, nombreFirmante: tipo === "tutor" ? (nombreFirmante || p.tutor?.nombre) : tipo === "representante" ? nombreFirmante : X.nombreCompleto(p), parentesco: tipo === "paciente" ? null : (parentesco || p.tutor?.parentesco || ""), motivoRepresentante, canal: pl.forma === "casilla" && !imagen ? "casilla" : "firma_pantalla" }, u);
  return { ok: true, documento: x };
}
/** Revocar (p. ej. autorización de docencia): no se borra; las fotos de docencia dejan de mostrarse (P-009). */
export function revocarDocumento(d, firmadoId, motivo, u) {
  if (!X.puedeFirmarDocumentos(u)) return no("Tu rol no revoca documentos.");
  const x = (exp(d).firmados || []).find((f) => f.id === firmadoId);
  if (!x) return no("Documento no encontrado.");
  if (x.estado !== "firmado") return no("El documento no está vigente.");
  const e = X.validarMotivo(motivo); if (e) return no(e);
  x.estado = "revocado"; x.revocado = { fecha: ahoraLocal(), porId: u.id, motivo: String(motivo).trim() };
  const p = pac(d, x.pacienteId);
  if (p && x.codigo === "aviso_privacidad") p.avisoFirmado = false;
  if (p && x.codigo === "consentimiento_datos_salud") p.consentimientoFirmado = false;
  auditar(d, "documento_revocado", "paciente", x.pacienteId, `${x.folio}: ${String(motivo).slice(0, 50)}`);
  return { ok: true };
}
/** Crea una versión nueva (borrador) a partir de la activa o de un texto dado. */
export function nuevaVersionPlantilla(d, codigo, u, { contenido = null, nombre = null, forma = null } = {}) {
  if (!X.puedeGestionarPlantillas(u)) return no("Solo Administración gestiona plantillas.");
  const todas = X.plantillasDe(d, codigo);
  if (todas.some((p) => p.estado === "borrador")) return no("Ya hay un borrador de este documento: edítalo o actívalo.");
  const base = todas[0] || X.PLANTILLAS_BASE.map(([c, n, t, f]) => ({ codigo: c, nombre: n, contenido: t, forma: f })).find((p) => p.codigo === codigo);
  if (!base) return no("Documento desconocido.");
  const texto = contenido ?? base.contenido;
  const p = { id: uid("PD"), codigo, nombre: nombre || base.nombre, version: (todas[0]?.version || 0) + 1, estado: "borrador", contenido: texto, variables: X.variablesDe(texto), forma: forma || base.forma, pendienteLegal: true, vigenteDesde: null, creadaPor: u.id, creada: hoy() };
  exp(d).plantillas.push(p);
  auditar(d, "plantilla_nueva_version", "plantilla", p.id, `${codigo} v${p.version}`);
  return { ok: true, plantilla: p };
}
export function editarPlantilla(d, plantillaId, { contenido, nombre, forma }, u) {
  if (!X.puedeGestionarPlantillas(u)) return no("Solo Administración gestiona plantillas.");
  const p = (exp(d).plantillas || []).find((x) => x.id === plantillaId);
  if (!p) return no("Plantilla no encontrada.");
  if (!X.plantillaEditable(p)) return no("Una versión activa o archivada no se edita: crea una versión nueva (N-06).");
  if (contenido !== undefined) { if (String(contenido).trim().length < 20) return no("El texto es demasiado corto."); p.contenido = String(contenido); p.variables = X.variablesDe(p.contenido); }
  if (nombre) p.nombre = nombre;
  if (forma) p.forma = forma;
  auditar(d, "plantilla_editada", "plantilla", p.id, `${p.codigo} v${p.version}`);
  return { ok: true };
}
/** Activa el borrador; la versión activa anterior queda archivada (las firmas conservan la versión que aceptaron). */
export function activarPlantilla(d, plantillaId, u) {
  if (!X.puedeGestionarPlantillas(u)) return no("Solo Administración gestiona plantillas.");
  const p = (exp(d).plantillas || []).find((x) => x.id === plantillaId);
  if (!p) return no("Plantilla no encontrada.");
  if (p.estado !== "borrador") return no("Solo se activa un borrador.");
  for (const x of d.exp.plantillas) if (x.codigo === p.codigo && x.estado === "activa") x.estado = "archivada";
  p.estado = "activa"; p.vigenteDesde = hoy();
  auditar(d, "plantilla_activada", "plantilla", p.id, `${p.codigo} v${p.version}`);
  return { ok: true };
}
export function descartarBorrador(d, plantillaId, u) {
  if (!X.puedeGestionarPlantillas(u)) return no("Solo Administración gestiona plantillas.");
  const i = (exp(d).plantillas || []).findIndex((x) => x.id === plantillaId && x.estado === "borrador");
  if (i < 0) return no("Solo se descarta un borrador.");
  const [p] = d.exp.plantillas.splice(i, 1);
  auditar(d, "plantilla_borrador_descartado", "plantilla", p.id, `${p.codigo} v${p.version}`);
  return { ok: true };
}
/** ¿Cuántos pacientes firmaron cada versión? */
export const usoPlantilla = (d, p) => (d.exp?.firmados || []).filter((f) => f.codigo === p.codigo && f.version === p.version).length;

// ───────── Impresos (bitácora de emisión)
/**
 * Registra la impresión (folio IMP). `incluyeSensibles` solo si quien imprime es Podología o Administración (N-04).
 * Recepción/Gerencia solo imprimen formatos en blanco, consentimiento y antecedentes sin el dato restringido.
 */
export function registrarImpresion(d, { pacienteId = null, tipo, esCopia = false, incluyeSensibles = false }, u) {
  if (!X.TIPOS_IMPRESO[tipo]) return no("Tipo de impreso no válido.");
  if (!X.puedeAbrirExpediente(u)) return no("Tu rol no imprime documentos clínicos.");
  if (["seguimiento", "historia_completa"].includes(tipo) && !X.puedeVerClinico(u)) return no("La hoja de seguimiento y la historia completa solo las imprime Podología o Administración.");
  if (tipo !== "en_blanco" && !pac(d, pacienteId)) return no("Elige un paciente.");
  const sens = !!incluyeSensibles && X.puedeVerClinico(u);
  const prev = (d.exp?.emitidos || []).some((e) => e.pacienteId === pacienteId && e.tipo === tipo);
  const e = { id: uid("EM"), folio: folio(d, "IMP"), pacienteId: tipo === "en_blanco" ? null : pacienteId, tipo, fecha: ahoraLocal(), porId: u.id, sucursalId: suc(d),
    versionExpediente: pacienteId ? X.versionExpediente(d, pacienteId) : null, esCopia: !!esCopia || prev, incluyeSensibles: sens, plantillaVersion: tipo === "consentimiento" ? X.plantillaActiva(d, "consentimiento_procedimiento_podologico")?.version ?? null : null };
  exp(d).emitidos.unshift(e);
  auditar(d, "impresion_expediente", "paciente", pacienteId || "-", `${e.folio} ${X.TIPOS_IMPRESO[tipo]}${e.esCopia ? " (copia)" : ""}${sens ? " con dato restringido" : ""}`);
  return { ok: true, emitido: e };
}
/** Datos para las hojas impresas. El VIH solo se incluye si quien imprime tiene acceso (N-04). */
export function datosImpreso(d, pacienteId, u) {
  const p = pac(d, pacienteId);
  if (!p) return null;
  const clin = X.puedeVerClinico(u);
  const ultima = consultasPaciente(d, pacienteId)[0];
  const pod = ultima ? (d.usuarios || []).find((x) => x.id === ultima.podologoId) : u?.rol === "podologo" ? u : null;
  return {
    paciente: p, sucursal: (d.sucursales || []).find((s) => s.id === (ultima?.sucursalId || p.sucursalAlta)) || null,
    antecedentes: clin ? (d.exp?.antecedentes?.[pacienteId] || {}) : {}, vih: clin ? (d.exp?.sensibles?.[pacienteId]?.vih ?? null) : undefined,
    alergias: clin ? alergiasDe(d, pacienteId) : [], medicamentos: clin ? medicamentosDe(d, pacienteId) : [],
    exploracion: clin ? d.exp?.exploracionMI?.[pacienteId] || null : null, hallazgos: clin ? X.hallazgosDe(d, pacienteId) : [],
    visitas: X.visitasSeguimiento(d, pacienteId, { conNotas: clin }), diagnosticos: clin ? consultasPaciente(d, pacienteId).map((c) => c.diagnostico) : [],
    podologo: pod?.nombre || "", cedula: pod ? cedulaDe(d, pod.id) : "", version: X.versionExpediente(d, pacienteId),
    tratamiento: [...new Set((d.ventas || []).filter((v) => v.pacienteId === pacienteId).flatMap((v) => v.partidas.filter((x) => x.tipo === "producto").map((x) => x.nombre)))].join(" · "),
    consentimiento: X.plantillaActiva(d, "consentimiento_procedimiento_podologico"),
    firmaConsentimiento: X.firmadoVigente(d, pacienteId, "consentimiento_procedimiento_podologico"),
  };
}
export { nombreUsuario };
