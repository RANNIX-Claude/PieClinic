// Dominio «expediente» (porte de Pie Firme: src/lib/clinico/{pacientes,edad,impresos,mapaPie,inmutabilidad}.js).
// Reglas PURAS: no importan core.js (las usa también la semilla). Los ids P-0xx / N-0x son los de REGLAS_NEGOCIO.md de Pie Firme.

// ───────── Texto y edad (P-005)
/** Minúsculas, sin acentos ni signos, espacios colapsados. */
export const normalizarTexto = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
export const nombreCompleto = (p) => [p?.nombres, p?.apellidos].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

const partes = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : [v.getFullYear(), v.getMonth() + 1, v.getDate()];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
/** Edad en años cumplidos, o null si la fecha no es válida o es futura. */
export function calcularEdad(nacimiento, hoy = new Date()) {
  const n = partes(nacimiento), h = partes(hoy);
  if (!n || !h) return null;
  let e = h[0] - n[0];
  if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) e--;
  return e < 0 ? null : e;
}
export function calcularMeses(nacimiento, hoy = new Date()) {
  const n = partes(nacimiento), h = partes(hoy);
  if (!n || !h) return null;
  let m = (h[0] - n[0]) * 12 + (h[1] - n[1]);
  if (h[2] < n[2]) m--;
  return m < 0 ? null : m;
}
export const esMenorDeEdad = (nacimiento, hoy) => { const e = calcularEdad(nacimiento, hoy); return e !== null && e < 18; };
/** «51 años», «1 año», «8 meses»; «—» si no hay fecha. */
export function textoEdad(nacimiento, hoy) {
  const e = calcularEdad(nacimiento, hoy);
  if (e === null) return "—";
  if (e >= 1) return `${e} ${e === 1 ? "año" : "años"}`;
  const m = calcularMeses(nacimiento, hoy) ?? 0;
  return `${m} ${m === 1 ? "mes" : "meses"}`;
}
/** dd/mm/aaaa desde "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm". */
export function fechaPapel(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// ───────── Alta y duplicados (P-003, P-006, N-08)
/** Clave de duplicado: nombre completo normalizado + fecha de nacimiento (P-006). */
export const claveDuplicado = (p) => `${normalizarTexto(nombreCompleto(p))}|${p?.nacimiento ?? ""}`;
const diezDigitos = (t) => String(t ?? "").replace(/\D/g, "").slice(-10);
/** Compara dos pacientes: "bloquea" (nombre completo + nacimiento iguales), "avisa" (mismo teléfono) o null. */
export function coincidencia(a, b) {
  if (!a || !b) return null;
  if (a.nacimiento && normalizarTexto(nombreCompleto(a)) && claveDuplicado(a) === claveDuplicado(b)) return "bloquea";
  const ta = diezDigitos(a.telefono), tb = diezDigitos(b.telefono);
  return ta.length === 10 && ta === tb ? "avisa" : null;
}
/** Posibles duplicados de `f` en la lista: [{ paciente, tipo }], los que bloquean primero. */
export function buscarDuplicados(pacientes, f, exceptoId = null) {
  return (pacientes || []).filter((p) => p.id !== exceptoId && p.estado !== "fusionado")
    .map((p) => ({ paciente: p, tipo: coincidencia(f, p) })).filter((x) => x.tipo)
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "bloquea" ? -1 : 1));
}
const CURP = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
export const curpValida = (v) => !v || CURP.test(String(v).toUpperCase());
/** Número de expediente manual (migración N-08): se conserva el vigente; vacío = lo asigna el sistema. */
export const expedienteManualValido = (v) => !v || /^[A-Za-z0-9][A-Za-z0-9\-_/.]{1,39}$/.test(String(v).trim());

/**
 * Valida el alta. `rapida` = alta rápida (nombre + celular; el resto antes de la primera consulta, P-003).
 * @returns {Record<string,string>} errores por campo (vacío = válido)
 */
export function validarAlta(f, { rapida = false, hoy = new Date() } = {}) {
  const e = {};
  const vacio = (v) => !String(v ?? "").trim();
  if (vacio(f.nombres)) e.nombres = "Escribe el nombre.";
  if (diezDigitos(f.telefono).length < 10) e.telefono = "Escribe un celular de 10 dígitos.";
  if (rapida) return e;
  if (vacio(f.apellidos)) e.apellidos = "Escribe los apellidos.";
  const h = partes(hoy), n = partes(f.nacimiento);
  if (!n) e.nacimiento = "Captura la fecha de nacimiento.";
  else if (n[0] * 10000 + n[1] * 100 + n[2] > h[0] * 10000 + h[1] * 100 + h[2]) e.nacimiento = "La fecha de nacimiento no puede ser futura.";
  if (vacio(f.sucursalAlta)) e.sucursalAlta = "Elige la sucursal de registro.";
  if (f.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo)) e.correo = "Correo no válido.";
  if (!curpValida(f.curp)) e.curp = "CURP no válida (18 caracteres).";
  if (!expedienteManualValido(f.folioManual)) e.folioManual = "Número de expediente no válido.";
  if (n && !e.nacimiento && esMenorDeEdad(f.nacimiento, hoy)) {
    if (vacio(f.tutor?.nombre)) e.tutor = "Es menor de 18 años: captura al tutor (P-005).";
    else if (vacio(f.tutor?.parentesco)) e.tutor = "Captura el parentesco del tutor.";
  }
  return e;
}
/** ¿Qué consentimientos faltan para guardar el alta completa? (aviso + datos de salud, P-003). */
export function consentimientosFaltantes({ aviso, datosSalud, firmaVacia }) {
  const f = [];
  if (!aviso) f.push("Aviso de privacidad");
  if (!datosSalud) f.push("Consentimiento de tratamiento de datos de salud");
  if (firmaVacia) f.push("Firma en pantalla");
  return f;
}

// ───────── Permisos por rol (se validan DENTRO de cada acción)
const CLINICOS = ["podologo", "admin", "direccion"];
const es = (u, roles) => !!u && roles.includes(u.rol);
export const esAdministracion = (u) => es(u, ["admin", "direccion"]);
export const puedeAbrirExpediente = (u) => es(u, ["podologo", "recepcion", "gerente", "admin", "direccion"]);
/** Notas, antecedentes, exploración, mapa del pie y seguimiento: Recepción y Gerencia NO. */
export const puedeVerClinico = (u) => es(u, CLINICOS);
export const puedeEditarDatos = (u) => es(u, ["recepcion", "podologo", "admin", "direccion"]);
export const puedeAltaPaciente = (u) => es(u, ["recepcion", "podologo", "admin", "direccion"]);
export const puedeEditarClinico = (u) => es(u, CLINICOS);
export const puedeVerFotos = (u) => es(u, CLINICOS);
export const puedeSubirFotos = (u) => es(u, CLINICOS);
export const puedeVerRetiradas = (u) => esAdministracion(u);
export const puedeFirmarDocumentos = (u) => es(u, ["recepcion", "podologo", "admin", "direccion"]);
export const puedeGestionarPlantillas = (u) => esAdministracion(u);
export const puedeVerBitacoraAperturas = (u) => esAdministracion(u);

/** ¿El podólogo ha atendido (o tiene agendado) a este paciente? */
export const esTratante = (d, u, pacienteId) => !!u && u.rol === "podologo"
  && ((d.consultas || []).some((c) => c.pacienteId === pacienteId && c.podologoId === u.id) || (d.citas || []).some((c) => c.pacienteId === pacienteId && c.podologoId === u.id));
/** ¿El paciente es de esta sucursal? (se registró ahí o tiene visitas ahí). */
export const esDeSucursal = (d, pac, sucursalId) => !!pac && !!sucursalId
  && (pac.sucursalAlta === sucursalId || (d.citas || []).some((c) => c.pacienteId === pac.id && c.sucursalId === sucursalId) || (d.consultas || []).some((c) => c.pacienteId === pac.id && c.sucursalId === sucursalId));
/**
 * Alcance con el que un usuario abre un expediente (P-002):
 *   "total" Administración/Dirección · "propio" podólogo tratante · "sucursal" paciente de la sucursal activa ·
 *   "otra" podólogo sin relación (debe registrar motivo; se avisa a Administración) · "datos" Recepción/Gerencia · null sin acceso.
 */
export function alcanceExpediente(d, u, sucursalId, pac) {
  if (!puedeAbrirExpediente(u) || !pac) return null;
  if (esAdministracion(u)) return "total";
  if (u.rol !== "podologo") return "datos";
  if (esTratante(d, u, pac.id)) return "propio";
  return esDeSucursal(d, pac, sucursalId) ? "sucursal" : "otra";
}
export function validarMotivo(texto, min = 5) {
  return String(texto ?? "").trim().length >= min ? null : `Escribe el motivo (mínimo ${min} caracteres); queda en la bitácora.`;
}
/** N-04: VIH solo Podología y Administración; el podólogo que NO es tratante debe registrar motivo. */
export function accesoVih(d, u, pacienteId) {
  if (!puedeVerClinico(u)) return { permitido: false, requiereMotivo: false };
  return { permitido: true, requiereMotivo: u.rol === "podologo" && !esTratante(d, u, pacienteId) };
}

// ───────── Nota clínica firmada, inmutable, con adenda (P-001, P-004, P-030)
/** "borrador" (consulta abierta) · "firma_pendiente" (cerrada sin firma del podólogo) · "firmada" (bloqueada). */
export function estadoNota(co) {
  if (!co) return null;
  if (co.estado === "abierta") return "borrador";
  return co.firma ? "firmada" : "firma_pendiente";
}
export const ETIQUETA_NOTA = { borrador: "Borrador", firma_pendiente: "Firma pendiente", firmada: "Firmada" };
export const TONO_NOTA = { borrador: "neutral", firma_pendiente: "warn", firmada: "ok" };
/** Antes de firmar se edita libremente; una nota firmada está bloqueada (P-001). */
export const notaEditable = (co) => !!co && !co.firma;
export const esAutorDeLaNota = (u, co) => !!u && !!co && u.id === co.podologoId;
/** ¿Falta el aviso de privacidad y nadie autorizó la excepción? (P-004: se atiende, pero no se firma). */
export const requiereExcepcionAviso = (pac, co) => !pac?.avisoFirmado && !co?.excepcionAviso;
/**
 * Motivos que impiden firmar la nota (espejo del trigger consulta_bi de Pie Firme).
 * @returns {string[]} lista vacía = se puede firmar
 */
export function motivosBloqueoFirma({ consulta, usuario, paciente, cedula, firmaVacia = false, hoy = new Date() }) {
  if (!consulta) return ["No hay consulta."];
  if (consulta.firma) return ["La nota ya está firmada y bloqueada (solo admite adenda)."];
  const m = [];
  if (consulta.estado === "abierta") m.push("La consulta sigue abierta: ciérrala en «Consulta» antes de firmar.");
  if (!usuario || usuario.rol !== "podologo" || !esAutorDeLaNota(usuario, consulta)) m.push("Solo el podólogo que atendió firma la nota.");
  if (!String(cedula ?? "").trim()) m.push("Tu perfil no tiene cédula profesional: pide a Administración que la capture.");
  if (firmaVacia) m.push("Falta tu firma en pantalla.");
  if (!String(consulta.nota ?? "").trim()) m.push("Falta la nota de evolución.");
  if (!String(consulta.diagnostico ?? "").trim()) m.push("Falta el diagnóstico.");
  if (paciente && esMenorDeEdad(paciente.nacimiento, hoy) && !String(paciente.tutor?.nombre ?? "").trim()) m.push("El paciente es menor de 18 años y no tiene tutor registrado (P-005).");
  if (paciente && requiereExcepcionAviso(paciente, consulta)) m.push("Falta el aviso de privacidad firmado: fírmalo en Documentos o pide a Administración que autorice la excepción (P-004).");
  return m;
}
export function validarAdenda(texto) {
  return String(texto ?? "").trim().length >= 5 ? null : "La adenda necesita al menos 5 caracteres.";
}
/** Adenda: solo sobre nota firmada y solo su autor (podólogo). */
export const puedeAgregarAdenda = (u, co) => !!co && !!co.firma && !!u && u.rol === "podologo" && esAutorDeLaNota(u, co);

/** Huella corta (FNV-1a de 64 bits simulado con dos pasadas) para fijar QUÉ texto se firmó. No es criptográfica. */
export function huella(texto) {
  const t = String(texto ?? "");
  const paso = (semilla) => { let h = semilla >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, "0"); };
  return paso(2166136261) + paso(374761393);
}
/** Texto canónico de la nota: lo que queda sellado al firmar. */
export const textoNota = (co) => [co?.fecha, co?.diagnostico, co?.nota, co?.indicaciones].map((x) => String(x ?? "")).join("\n");
/** ¿La nota firmada sigue idéntica a lo que se firmó? */
export const notaIntegra = (co) => !co?.firma || co.firma.huella === huella(textoNota(co));

// ───────── Menores y firmas (P-005)
/** Documentos firmados VIGENTES de un paciente (no revocados), más reciente primero. */
export const firmadosDe = (d, pacienteId) => ((d.exp?.firmados) || []).filter((x) => x.pacienteId === pacienteId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
export const firmadoVigente = (d, pacienteId, codigo) => firmadosDe(d, pacienteId).find((x) => x.codigo === codigo && x.estado === "firmado") || null;
/**
 * A los 18 años se pide nueva firma del propio paciente: es mayor de edad y sus consentimientos vigentes los firmó el tutor.
 * @returns {string[]} códigos de documento que hay que volver a firmar
 */
export function firmasPorMayoriaDeEdad(d, pac, hoy = new Date()) {
  const e = calcularEdad(pac?.nacimiento, hoy);
  if (e === null || e < 18) return [];
  const vistos = new Set(), faltan = [];
  for (const x of firmadosDe(d, pac.id)) {
    if (x.estado !== "firmado" || vistos.has(x.codigo)) continue;
    vistos.add(x.codigo);
    if (x.firmanteTipo === "tutor") faltan.push(x.codigo);
  }
  return faltan;
}
export const requiereFirmaPropia = (d, pac, hoy) => firmasPorMayoriaDeEdad(d, pac, hoy).length > 0;

// ───────── Fotos clínicas (P-007, P-008, P-009)
export const MAX_FOTOS_SESION = 10;
export const LADO_FOTO = 900;      // en producción ≤ 2048 px en almacenamiento privado; aquí miniatura por el límite del navegador
export const MOMENTOS_FOTO = [["antes", "Antes"], ["despues_inmediato", "Después inmediato"], ["despues", "Después"], ["seguimiento", "Seguimiento"]];
export const VISTAS_FOTO = [["dorsal", "Dorsal"], ["plantar", "Plantar"], ["medial", "Medial"], ["lateral", "Lateral"], ["posterior", "Posterior"]];
export const NIVELES_AUTORIZACION = [["clinico", "Solo expediente clínico"], ["docencia", "Docencia / difusión"]];
export const etiquetaDe = (lista, v) => (lista.find((x) => x[0] === v) || [v, v || "—"])[1];
/** La sesión de fotos es la consulta; sin consulta, el día de la toma. */
export const claveSesion = (f) => f.consultaId || `${f.pacienteId}|${String(f.tomada || "").slice(0, 10)}`;
export const fotosDeSesion = (fotos, clave) => (fotos || []).filter((x) => claveSesion(x) === clave && !x.retirada);
/** Foto 11 en la sesión: límite blando, requiere confirmar (P-007). */
export const fotoExcedeLimite = (enSesion, limite = MAX_FOTOS_SESION) => enSesion >= limite;
/** Foto clínica: nunca se borra; se retira con motivo (P-008). */
export function validarRetiroFoto(motivo) {
  return String(motivo ?? "").trim().length >= 3 ? null : "Indica el motivo del retiro (queda en la bitácora).";
}
/** ¿El paciente tiene autorización de docencia vigente (firmada y no revocada)? */
export const docenciaVigente = (d, pacienteId) => !!firmadoVigente(d, pacienteId, "autorizacion_fotos_docencia");
/** Docencia/difusión: solo con autorización vigente y difuminado (P-009). */
export function fotoPublicable(foto, autorizacionVigente) {
  return foto?.nivel === "docencia" ? !!autorizacionVigente && !!foto.difuminada : true;
}
/** Fotos que un usuario puede ver: las retiradas solo Administración; docencia sin autorización vigente se ocultan. */
export function fotosVisibles(d, u, pacienteId, { incluirRetiradas = false } = {}) {
  if (!puedeVerFotos(u)) return [];
  const vig = docenciaVigente(d, pacienteId);
  return ((d.exp?.fotos) || []).filter((x) => x.pacienteId === pacienteId)
    .filter((x) => !x.retirada || (incluirRetiradas && puedeVerRetiradas(u)))
    .filter((x) => x.nivel !== "docencia" || vig || esAdministracion(u))
    .sort((a, b) => String(a.tomada).localeCompare(String(b.tomada)));
}

// ───────── Mapa del pie (4 vistas: D/I × dorsal/plantar). Lienzo de 100 × 220.
// Se dibuja el pie derecho en vista dorsal con el primer dedo a la izquierda; las demás vistas se obtienen espejando.
export const ANCHO = 100;
export const ALTO = 220;
export const CONTORNO = "M22 40 C16 62 20 100 28 130 C30 150 26 182 38 200 C50 214 70 212 74 190 C78 160 82 120 82 80 C82 62 78 50 72 47 C60 44 40 38 22 40 Z";
const dedos = [
  { codigo: "dedo1", nombre: "1.er dedo (hallux)", f: "c", cx: 28, cy: 31, r: 9.5 },
  { codigo: "dedo2", nombre: "2.º dedo", f: "c", cx: 44, cy: 24, r: 6.5 },
  { codigo: "dedo3", nombre: "3.er dedo", f: "c", cx: 55, cy: 28, r: 6 },
  { codigo: "dedo4", nombre: "4.º dedo", f: "c", cx: 65, cy: 34, r: 5.5 },
  { codigo: "dedo5", nombre: "5.º dedo", f: "c", cx: 74, cy: 42, r: 5 },
];
const unas = dedos.map((x) => ({ codigo: x.codigo.replace("dedo", "una"), nombre: `Uña ${x.codigo.slice(4)}.º dedo`, f: "e", cx: x.cx, cy: x.cy - x.r * 0.35, rx: x.r * 0.55, ry: x.r * 0.4 }));
export const ZONAS_DORSAL = [
  { codigo: "dorso_pie", nombre: "Dorso del pie", f: "r", x: 18, y: 46, w: 70, h: 110 },
  { codigo: "antepie_dorsal", nombre: "Antepié dorsal", f: "r", x: 18, y: 46, w: 70, h: 48 },
  { codigo: "mediopie_medial", nombre: "Medio pie medial (arco)", f: "r", x: 18, y: 94, w: 30, h: 56 },
  { codigo: "mediopie_lateral", nombre: "Medio pie lateral", f: "r", x: 48, y: 94, w: 40, h: 56 },
  { codigo: "talon_posterior", nombre: "Talón posterior", f: "r", x: 22, y: 150, w: 56, h: 66 },
  { codigo: "tobillo", nombre: "Tobillo", f: "r", x: 22, y: 208, w: 56, h: 10, fuera: true },
  ...dedos, ...unas,
];
export const ZONAS_PLANTAR = [
  { codigo: "antepie_plantar", nombre: "Antepié plantar (cabezas metatarsianas)", f: "r", x: 18, y: 46, w: 70, h: 48 },
  { codigo: "mt1", nombre: "Cabeza MT 1", f: "c", cx: 30, cy: 66, r: 6.5 },
  { codigo: "mt2", nombre: "Cabeza MT 2", f: "c", cx: 42, cy: 62, r: 5.5 },
  { codigo: "mt3", nombre: "Cabeza MT 3", f: "c", cx: 53, cy: 63, r: 5.5 },
  { codigo: "mt4", nombre: "Cabeza MT 4", f: "c", cx: 63, cy: 66, r: 5.5 },
  { codigo: "mt5", nombre: "Cabeza MT 5", f: "c", cx: 72, cy: 70, r: 5.5 },
  { codigo: "mediopie_medial", nombre: "Medio pie medial (arco)", f: "r", x: 18, y: 94, w: 30, h: 56 },
  { codigo: "mediopie_lateral", nombre: "Medio pie lateral", f: "r", x: 48, y: 94, w: 40, h: 56 },
  { codigo: "talon", nombre: "Talón", f: "r", x: 22, y: 150, w: 56, h: 66 },
  ...dedos,
];
export const zonasDeVista = (vista) => (vista === "plantar" ? ZONAS_PLANTAR : ZONAS_DORSAL);
export const NOMBRES_ZONA = Object.fromEntries([...ZONAS_DORSAL, ...ZONAS_PLANTAR].map((z) => [z.codigo, z.nombre]));
export const nombreZona = (codigo) => NOMBRES_ZONA[codigo] ?? codigo ?? "—";
/** Dorsal-D es la base; I dorsal y D plantar se espejan; I plantar vuelve a la base. */
export const espejar = (pie, vista) => (vista === "dorsal" ? pie === "I" : pie === "D");
/** Combinaciones (pie, vista) en el orden del formato en papel. */
export const VISTAS_FORMATO = [["D", "dorsal"], ["I", "dorsal"], ["D", "plantar"], ["I", "plantar"]];
export const MARCAS = [["ungueal", "Uña afectada"], ["lesion", "Lesión"]];
/** Centro de una zona en coordenadas normalizadas (0–1) ya en pantalla (aplica el espejo). */
export function centroZona(pie, vista, codigo) {
  const z = zonasDeVista(vista).find((x) => x.codigo === codigo);
  if (!z) return { x: 0.5, y: 0.5 };
  const cx = z.f === "r" ? z.x + z.w / 2 : z.cx, cy = z.f === "r" ? z.y + z.h / 2 : z.cy;
  return { x: Number(((espejar(pie, vista) ? ANCHO - cx : cx) / ANCHO).toFixed(4)), y: Number((cy / ALTO).toFixed(4)) };
}
export const siguienteNumero = (hallazgos) => (hallazgos || []).reduce((m, h) => Math.max(m, Number(h.numero) || 0), 0) + 1;
export const hallazgosDe = (d, pacienteId, { incluirRetirados = false } = {}) => ((d.exp?.hallazgos) || []).filter((h) => h.pacienteId === pacienteId && (incluirRetirados || !h.retirado));

// ───────── Antecedentes e impresos fieles al papel (N-02, N-04, N-06)
export const TRI = [["si", "Sí"], ["no", "No"], ["no_sabe", "No sabe"]];
export const etiquetaTri = (v) => ({ si: "SÍ", no: "NO", no_sabe: "NO SABE" })[v] ?? "—";
export const casillaTri = (valor) => ({ si: valor === "si", no: valor === "no", noSabe: valor === "no_sabe" });
/** [clave, etiqueta, claveDetalle?, etiquetaDetalle?] en el orden del formato en papel. */
export const TRI_PATOLOGICOS = [
  ["diabetes", "Diabetes"], ["hipertension", "Hipertensión"], ["alergicos", "Alérgicos", "alergicos_detalle", "¿A qué?"], ["artritis", "Artritis"], ["obesidad", "Obesidad"],
  ["traumaticos", "Traumáticos", "traumaticos_detalle", "Especifique"], ["varices", "Várices"], ["vih", "VIH (restringido)"], ["otras_enfermedades", "Otras", "otras_enfermedades_detalle", "Especifique"],
  ["toma_medicamentos", "Toma algún medicamento", "medicamentos_texto", "¿Cuál?"],
];
export const TRI_CLINICOS = [["insuficiencia_venosa", "Insuficiencia venosa"], ["insuficiencia_arterial", "Insuficiencia arterial"], ["neuropatia", "Neuropatía"], ["psoriasis", "Psoriasis"], ["inmunosupresion", "Inmunosupresión"],
  ["anticoagulacion", "Anticoagulación"], ["ulcera_previa", "Úlcera previa"], ["amputacion_previa", "Amputación previa"], ["embarazo", "Embarazo"]];
export const TRI_NO_PAT = [["tabaquismo", "Tabaquismo"], ["alcoholismo", "Alcoholismo"], ["toxicomanias", "Toxicomanías", "toxicomanias_detalle", "Especifique"], ["deporte", "¿Practica algún deporte?", "deporte_detalle", "¿Cuál?"]];
export const PARENTESCOS = [["hf_padre", "Padre"], ["hf_madre", "Madre"], ["hf_hermanos", "Hermanos"], ["hf_esposo", "Esposa(o)"], ["hf_hijos", "Hijos"]];
export const DIABETES_TIPO = [["tipo1", "Tipo 1"], ["tipo2", "Tipo 2"], ["prediabetes", "Prediabetes"], ["gestacional", "Gestacional"], ["otra", "Otra"]];
export const ESTADOS_CIVILES = [["soltero", "Soltero(a)"], ["casado", "Casado(a)"], ["union_libre", "Unión libre"], ["divorciado", "Divorciado(a)"], ["viudo", "Viudo(a)"], ["separado", "Separado(a)"], ["otro", "Otro"]];
/** Campos de la ficha de antecedentes (todo lo que no sea `vih`, que vive aparte: N-04). */
export const CAMPOS_ANTECEDENTES = [
  "diabetes", "diabetes_tipo", "diabetes_anios_evolucion", "hba1c", "hba1c_fecha", "diabetes_tratamiento", "medico_tratante", "medico_especialidad",
  "hipertension", "alergicos", "alergicos_detalle", "artritis", "obesidad", "traumaticos", "traumaticos_detalle", "varices", "otras_enfermedades", "otras_enfermedades_detalle",
  "toma_medicamentos", "medicamentos_texto", "ultima_glucosa_fecha", "ultima_glucosa_texto",
  ...TRI_CLINICOS.map((x) => x[0]), "cirugia_previa_pie", ...PARENTESCOS.map((x) => x[0]),
  "tabaquismo", "alcoholismo", "toxicomanias", "toxicomanias_detalle", "deporte", "deporte_detalle", "tipo_calzado", "numero_calzado", "calzado_actividad",
  "motivo_consulta_inicial", "sintomas_iniciales", "notas",
];
/** Deja solo campos conocidos de antecedentes: `vih` JAMÁS entra por aquí. */
export function limpiarAntecedentes(patch = {}) {
  const o = {};
  for (const k of CAMPOS_ANTECEDENTES) if (k in patch) o[k] = patch[k] === "" ? null : patch[k];
  return o;
}
export function ultimaGlucosa(a) {
  const f = fechaPapel(a?.ultima_glucosa_fecha), t = a?.ultima_glucosa_texto;
  if (f && t) return `${f} (${t})`;
  return f || t || "";
}
/** Patológicos en el orden del papel. `vih === undefined` → se imprime «dato restringido» (N-04). */
export function patologicosImpreso(a = {}, vih = undefined) {
  const fila = (clave, etiqueta, valor, detalle) => ({ clave, etiqueta, valor, detalle: detalle ?? "", ...casillaTri(valor) });
  const tipo = a?.diabetes_tipo ? `(${etiquetaDe(DIABETES_TIPO, a.diabetes_tipo)})` : "";
  const filas = [
    fila("diabetes", "Diabetes", a?.diabetes, tipo), fila("hipertension", "Hipertensión", a?.hipertension), fila("alergicos", "Alérgicos", a?.alergicos, a?.alergicos_detalle),
    fila("artritis", "Artritis", a?.artritis), fila("obesidad", "Obesidad", a?.obesidad), fila("traumaticos", "Traumáticos", a?.traumaticos, a?.traumaticos_detalle), fila("varices", "Várices", a?.varices),
  ];
  filas.push(vih === undefined ? { clave: "vih", etiqueta: "VIH", valor: null, detalle: "", restringido: true, si: false, no: false, noSabe: false } : fila("vih", "VIH", vih));
  filas.push(fila("otras", "Otras", a?.otras_enfermedades, a?.otras_enfermedades_detalle));
  return filas;
}
export const noPatologicosImpreso = (a = {}) => [
  { clave: "tabaquismo", etiqueta: "Tabaquismo", ...casillaTri(a?.tabaquismo) },
  { clave: "alcoholismo", etiqueta: "Alcoholismo", ...casillaTri(a?.alcoholismo) },
  { clave: "toxicomanias", etiqueta: "Toxicomanías", ...casillaTri(a?.toxicomanias) },
];
/** Las 5 siluetas de miembro inferior por pierna (N-02). */
export const SILUETAS = [["genu_valgum", "Genu valgum"], ["genu_varum", "Genu varum"], ["normal", "Normal"], ["genu_recurvatum", "Genu recurvatum"], ["genu_flexum", "Genu flexum"]];
export const ROTACIONES = [["neutra", "Neutra"], ["interna", "Interna"], ["externa", "Externa"]];
export const TIPOS_PIE = [["normal", "Normal"], ["varo", "Varo"], ["valgo", "Valgo"], ["plano", "Plano"], ["cavo", "Cavo"]];
export const EXPLORACION_VACIA = { siluetas: [], rotacion: "", talalgias: "", tipo_pie: "", huella_plantar: "", notas: "" };
export function exploracionImpresa(mi = {}) {
  const por = (pierna) => mi?.[pierna]?.siluetas ?? [];
  return SILUETAS.map(([clave, etiqueta]) => ({ clave, etiqueta, D: por("D").includes(clave), I: por("I").includes(clave) }));
}
/** Casillas del diagnóstico del formato 3, deducidas de los diagnósticos CIE-10 de las consultas. */
export const CASILLAS_DIAGNOSTICO = [["onicomicosis", "ONICOMICOSIS", /B35\.1|onicomicosis|ti[ñn]a de las u/i], ["papiloma_plantar", "PAPILOMA PLANTAR", /B07|verruga|papiloma/i], ["pie_atleta", "PIE DE ATLETA", /B35\.3|pie de atleta/i],
  ["micosis", "MICOSIS", /B35(?!\.[13])|B36|micosis/i], ["hiperqueratosis", "HIPERQUERATOSIS", /L84|callo|hiperqueratosis/i]];
export function diagnosticoImpreso(diagnosticos = []) {
  const textos = [...new Set(diagnosticos.map((x) => String(x || "").trim()).filter(Boolean))];
  const marcadas = new Set(), otros = [];
  for (const t of textos) { const c = CASILLAS_DIAGNOSTICO.find((x) => x[2].test(t)); if (c) marcadas.add(c[0]); else otros.push(t); }
  if (otros.length) marcadas.add("otros");
  return { marcadas, otros: otros.join("; "), casillas: [...CASILLAS_DIAGNOSTICO.map(([k, e]) => ({ clave: k, etiqueta: e, marcada: marcadas.has(k) })), { clave: "otros", etiqueta: "OTROS", marcada: marcadas.has("otros") }] };
}
/** Resumen de «Antecedentes» del formato 3 en una frase. */
export function resumenAntecedentesTexto(a = {}, alergias = []) {
  const p = [];
  if (a?.diabetes === "si") p.push(`Diabetes${a.diabetes_tipo ? ` ${etiquetaDe(DIABETES_TIPO, a.diabetes_tipo).toLowerCase()}` : ""}`);
  if (a?.hipertension === "si") p.push("hipertensión");
  if (a?.varices === "si") p.push("várices");
  if (a?.artritis === "si") p.push("artritis");
  if (a?.obesidad === "si") p.push("obesidad");
  const heredo = PARENTESCOS.filter(([k]) => a?.[k]).map(([k, e]) => `${e.toLowerCase()}: ${a[k]}`);
  if (heredo.length) p.push(`heredofamiliares (${heredo.join("; ")})`);
  const al = alergias.map((x) => x.sustancia).filter(Boolean);
  if (al.length) p.push(`alérgica(o) a ${al.join(", ")}`);
  return p.join(" · ");
}
/**
 * Visitas para la tabla de seguimiento (Fecha / Atendió / Servicio / Observaciones / Próx. visita): salen de las consultas cerradas.
 * `conNotas = false` (Recepción/Gerencia) deja las observaciones en blanco.
 */
export function visitasSeguimiento(d, pacienteId, { conNotas = true } = {}) {
  const usuarios = Object.fromEntries((d.usuarios || []).map((u) => [u.id, u.nombre]));
  const servicios = Object.fromEntries((d.servicios || []).map((s) => [s.id, s.nombre]));
  const citas = (d.citas || []).filter((c) => c.pacienteId === pacienteId && !["cancelada", "no_asistio"].includes(c.estado)).map((c) => String(c.inicio)).sort();
  return (d.consultas || []).filter((c) => c.pacienteId === pacienteId && c.estado !== "abierta").sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map((c) => ({
    id: c.id, fecha: c.fecha, atendio: usuarios[c.podologoId] ?? "", sucursalId: c.sucursalId,
    servicio: (c.servicios || []).map((s) => servicios[s.servicioId]).filter(Boolean).join(", "),
    observaciones: conNotas ? String(c.nota ?? "") : "", diagnostico: conNotas ? String(c.diagnostico ?? "") : "",
    proxima: c.proximaVisita ?? citas.find((x) => x.slice(0, 10) > String(c.fecha).slice(0, 10)) ?? "", estadoNota: estadoNota(c),
  }));
}
/** Tabla de visitas: páginas de `porPagina` renglones, siempre con renglones en blanco para completar a mano. */
export function paginarVisitas(visitas = [], { porPagina = 10, minimo = 10 } = {}) {
  const filas = visitas.map((v) => ({ fecha: fechaPapel(v.fecha), atendio: v.atendio ?? "", servicio: v.servicio ?? "", observaciones: v.observaciones ?? "", proxima: fechaPapel(v.proxima) }));
  const total = Math.max(minimo, Math.ceil(filas.length / porPagina) * porPagina);
  while (filas.length < total) filas.push({ fecha: "", atendio: "", servicio: "", observaciones: "", proxima: "", vacia: true });
  const paginas = [];
  for (let i = 0; i < filas.length; i += porPagina) paginas.push(filas.slice(i, i + porPagina));
  return paginas;
}
/** Pie de página de cada hoja: «Expediente X · impreso dd/mm/aaaa por Y · versión N del expediente [· COPIA]». */
export function piePagina({ expediente, fecha, impresoPor, version, esCopia, enBlanco }) {
  if (enBlanco) return "Formato en blanco";
  return [`Expediente ${expediente || "—"}`, `impreso ${fechaPapel(fecha)}${impresoPor ? ` por ${impresoPor}` : ""}`, version != null ? `versión ${version} del expediente` : null, esCopia ? "COPIA" : null].filter(Boolean).join(" · ");
}
/** Sustituye {{variable}} en el texto de una plantilla (N-06). Lo no encontrado queda como raya para llenar a mano. */
export function sustituirVariables(texto, vars = {}) {
  return String(texto ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== "" ? String(vars[k]) : (k in vars ? "" : "________")));
}
export function variablesConsentimiento({ paciente, podologo, cedula, fecha, clinica, hoy }) {
  const menor = paciente ? esMenorDeEdad(paciente.nacimiento, hoy) : false;
  const nombre = nombreCompleto(paciente), tutor = paciente?.tutor;
  return {
    paciente: nombre || "________", nombre_paciente: nombre,
    tutor: menor && tutor?.nombre ? `, representado(a) por su ${String(tutor.parentesco || "tutor").toLowerCase()} ${tutor.nombre}` : "",
    nombre_tutor: menor ? (tutor?.nombre ?? "") : "— no aplica —",
    podologo: podologo || "________", nombre_podologo: podologo ?? "", cedula_podologo: cedula ?? "", clinica: clinica || "________", fecha: fechaPapel(fecha),
    horas_cancelacion: 24,
  };
}
export const TIPOS_IMPRESO = {
  consentimiento: "Consentimiento informado para Tratamiento Podológico",
  antecedentes: "Antecedentes personales",
  seguimiento: "Seguimiento clínico",
  historia_completa: "Historia clínica completa",
  en_blanco: "Formato en blanco",
};

// ───────── Plantillas de documento con versión (N-06, P-139)
export const FORMAS_ACEPTACION = [["firma_pantalla", "Firma en pantalla"], ["casilla", "Casilla"], ["ninguna", "Ninguna"]];
/** Plantillas base (las de Pie Firme): textos editables por clínica, PENDIENTES de validación de un abogado. */
export const PLANTILLAS_BASE = [
  ["aviso_privacidad", "Aviso de privacidad", "Aviso de privacidad integral de {{clinica}}. Tratamos sus datos personales y de salud para integrar su expediente clínico, agendar citas, cobrar y facturar. Puede ejercer sus derechos de acceso, rectificación, cancelación y oposición (ARCO) ante la clínica.\n\n[Texto final pendiente de redacción por abogado.]", "firma_pantalla"],
  ["consentimiento_datos_salud", "Consentimiento para tratamiento de datos de salud", "Autorizo a {{clinica}} a tratar mis datos personales sensibles de salud para fines de diagnóstico y tratamiento podológico.", "firma_pantalla"],
  ["consentimiento_procedimiento_podologico", "Consentimiento informado para tratamiento podológico", "Yo, {{paciente}}{{tutor}}, autorizo al podólogo {{podologo}} a llevar a cabo un tratamiento podológico en mis pies, que incluye:\n\n- Examen físico de los pies.\n- Tratamiento de callosidades, durezas y verrugas plantares.\n- Extracción de espícula en uña encarnada con curación diaria por 4 días consecutivos hasta lograr una adecuada cicatrización.\n- Información de cuidado e higiene.\n- Corrección de la marcha y postura ungueal.\n- Recomendaciones de cuidado en casa.\n\nSe me dio oportunidad de preguntar; los resultados pueden variar; el tratamiento no está exento de riesgos; tengo derecho a una segunda opinión y a retirar mi consentimiento.", "firma_pantalla"],
  ["autorizacion_fotos_clinicas", "Autorización de fotografías clínicas", "Autorizo que se tomen fotografías de mis pies para integrarlas únicamente a mi expediente clínico.", "firma_pantalla"],
  ["autorizacion_fotos_docencia", "Autorización de fotografías para docencia o difusión", "Autorizo el uso de fotografías de mis pies con rostro e identificadores difuminados para docencia o difusión. Puedo revocar esta autorización en cualquier momento.", "firma_pantalla"],
  ["consentimiento_telemedicina", "Consentimiento de telemedicina", "Acepto recibir atención podológica a distancia por videoconsulta y entiendo sus limitaciones.\n\n[Pendiente de revisión legal.]", "firma_pantalla"],
  ["consentimiento_dictado_ia", "Consentimiento para dictado por voz con IA", "Autorizo que mi consulta sea dictada por el podólogo con apoyo de IA. El audio se elimina al confirmarse la transcripción.", "firma_pantalla"],
  ["terminos_reserva", "Términos de reserva y cancelación", "Cancelaciones con al menos {{horas_cancelacion}} horas de aviso. Pasado ese plazo el anticipo no es reembolsable.", "casilla"],
  ["carta_referencia", "Carta de referencia", "Se refiere al paciente {{paciente}} a {{especialidad}} por: {{motivo}}.", "ninguna"],
];
export const variablesDe = (texto) => [...new Set([...String(texto ?? "").matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
export const plantillasDe = (d, codigo) => ((d.exp?.plantillas) || []).filter((p) => p.codigo === codigo).sort((a, b) => b.version - a.version);
export const plantillaActiva = (d, codigo) => plantillasDe(d, codigo).find((p) => p.estado === "activa") || null;
/** Una plantilla activa o archivada no se edita: se crea una nueva versión. */
export const plantillaEditable = (p) => !!p && p.estado === "borrador";
/** Folio de expediente de un paciente y versión del expediente (sube con cada cambio clínico). */
export const versionExpediente = (d, pacienteId) => (d.exp?.versiones?.[pacienteId]) || 1;
