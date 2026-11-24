// Dominio «clínica» (incorporado de Pie Firme): reglas PURAS. No importa core.js (lo usa la semilla; evita el ciclo seed ↔ core).
// Planes de tratamiento (P-026 a P-029), pie diabético (P-010, P-011), plantillas ortopédicas (P-013),
// esterilización por lotes (P-023), quejas y ARCO (P-020 a P-022, P-141) y seguimiento de pacientes (CRM).
// Las reglas son «decididas por defecto, revisables por el dueño» en REGLAS_NEGOCIO.md de Pie Firme: ninguna está confirmada por el cliente.
import { sumarDias, diasEntre, dia, parse, ymd, hoy, normaliza, redondear } from "../lib/format.js";

// ═════════════════════════ Parámetros de la clínica
export const PARAMS_CLINICA = {
  riesgoIwgdfActivo: false,   // P-010: la sugerencia de categoría de riesgo está APAGADA hasta que un podólogo asesor valide los criterios
  diasAbandono: 30,           // P-026
  diasQueja: 3,               // P-020 (días naturales)
  diasArco: 20,               // P-141 (días naturales)
  diasInactivo: 180,          // CRM
  diasHabilesPlantilla: 15,   // P-013
  garantiaMeses: 6,           // P-013
  anticipoPlantillaPct: 50,   // requerimiento 04
  diasEsterilidad: 30,        // vigencia de esterilidad del lote
};
export const paramsClinica = (d) => ({ ...PARAMS_CLINICA, ...((d && d.clinica && d.clinica.params) || {}) });

// ═════════════════════════ Permisos (se validan dentro de cada acción)
const ADM = ["admin", "direccion"];
const PERMISOS = {
  "planes.ver": ["podologo", ...ADM], "planes.editar": ["podologo", ...ADM], "planes.plantillas": ADM,
  "pie.ver": ["podologo", ...ADM], "pie.editar": ["podologo", ...ADM], "pie.firmar": ["podologo"], "clinica.parametros": ADM,
  "plantillas.ver": ["podologo", ...ADM], "plantillas.editar": ["podologo", ...ADM],
  "lotes.ver": ["asistente", "gerente", ...ADM], "lotes.operar": ["asistente", "gerente", ...ADM],
  "quejas.ver": ["recepcion", "gerente", ...ADM], "quejas.registrar": ["recepcion", "gerente", ...ADM], "quejas.resolver": ["gerente", ...ADM], "quejas.compensar": ADM,
  "arco.registrar": ["recepcion", "gerente", ...ADM], "arco.atender": ADM,
  "crm.ver": ["recepcion", "gerente", ...ADM], "crm.contactar": ["recepcion", "gerente", ...ADM], "crm.campanas": ["gerente", ...ADM], "crm.aprobar": ADM,
};
export const esAdmin = (u) => !!u && ADM.includes(u.rol);
export const puede = (u, permiso) => !!u && u.activo !== false && (PERMISOS[permiso] || []).includes(u.rol);
/** Sucursales que la persona puede ver: admin/dirección todas; gerente las suyas; el resto solo la sucursal activa. */
export function sucursalesVisibles(d, u) {
  if (!u) return [];
  if (esAdmin(u)) return d.sucursales.map((s) => s.id);
  if (u.rol === "gerente") return [...u.sucursales];
  const act = d.sesion && d.sesion.sucursalId;
  return u.sucursales.includes(act) ? [act] : [...u.sucursales];
}
export const alcanza = (d, u, sucursalId) => sucursalesVisibles(d, u).includes(sucursalId);
/** Registro clínico propio del podólogo (o cualquiera para admin/dirección). */
export const esSuyo = (u, reg) => !!u && !!reg && (esAdmin(u) || (u.rol === "podologo" && reg.podologoId === u.id));
/** Pacientes del podólogo: los que ha atendido o tiene citados. */
export function pacientesDe(d, u) {
  const s = new Set();
  d.citas.forEach((c) => { if (c.podologoId === u.id) s.add(c.pacienteId); });
  d.consultas.forEach((c) => { if (c.podologoId === u.id) s.add(c.pacienteId); });
  return s;
}
/** Lo que ve cada quien de una colección clínica con podologoId. */
export function visiblesClinicos(d, u, lista) {
  if (!u) return [];
  if (esAdmin(u)) return lista;
  if (u.rol !== "podologo") return [];
  const mios = pacientesDe(d, u);
  return lista.filter((x) => x.podologoId === u.id || mios.has(x.pacienteId));
}
export const nombrePac = (d, id) => { const p = d.pacientes.find((x) => x.id === id); return p ? `${p.nombres} ${p.apellidos}` : "—"; };
export const nombreCorto = (d, id) => String((d.usuarios.find((x) => x.id === id) || {}).nombre || "—").replace(/\s*\(.*\)/, "");

// ═════════════════════════ Fechas hábiles
/** Días de descanso obligatorio (LFT) 2026–2028. Si el dominio agenda siembra d.festivos, se usan esos. */
export const FESTIVOS_MX = ["2026-01-01", "2026-02-02", "2026-03-16", "2026-05-01", "2026-09-16", "2026-11-16", "2026-12-25",
  "2027-01-01", "2027-02-01", "2027-03-15", "2027-05-01", "2027-09-16", "2027-11-15", "2027-12-25", "2028-01-01", "2028-02-07", "2028-03-20", "2028-05-01"];
export function festivosDe(d) {
  const f = d && Array.isArray(d.festivos) ? d.festivos.map((x) => (typeof x === "string" ? x : x && x.fecha)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x))) : [];
  return f.length ? f : FESTIVOS_MX;
}
/** Día ISO: lunes = 1 … domingo = 7. */
export const diaIso = (fecha) => { const w = parse(dia(fecha)).getDay(); return w === 0 ? 7 : w; };
/** Día hábil de laboratorio/oficina: lunes a viernes y no festivo. */
export const esHabil = (fecha, festivos = FESTIVOS_MX) => diaIso(fecha) <= 5 && !festivos.includes(dia(fecha));
/** Suma N días hábiles (no cuenta el día de partida). */
export function sumarDiasHabiles(fecha, n, festivos = FESTIVOS_MX) {
  let f = dia(fecha), k = 0;
  while (k < n) { f = sumarDias(f, 1); if (esHabil(f, festivos)) k++; }
  return f;
}
/** Primer día en que la sede abre a partir de `fecha` (máx. 15 saltos). diasCerrados: [7] = domingo. */
export function diaAbierto(fecha, diasCerrados = [7], festivos = []) {
  let f = dia(fecha);
  for (let i = 0; i < 15; i++) { if (!diasCerrados.includes(diaIso(f)) && !festivos.includes(f)) return f; f = sumarDias(f, 1); }
  return f;
}
/** Suma meses conservando el día (31-ago + 6 meses = 28-feb). */
export function sumarMeses(fecha, n) {
  const x = parse(dia(fecha)); const d0 = x.getDate();
  x.setDate(1); x.setMonth(x.getMonth() + n);
  const ult = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d0, ult));
  return ymd(x);
}

// ═════════════════════════ Planes de tratamiento (P-026 a P-029)
export const ESTADOS_PLAN = { activo: "Activo", completado: "Completado", abandonado: "Abandonado", cancelado: "Cancelado" };
export const TONO_PLAN = { activo: "info", completado: "ok", abandonado: "bad", cancelado: "neutral" };
export const ESTADOS_SESION = { por_generar: "Por agendar", agendada: "Agendada", realizada: "Realizada", falta: "Falta", cancelada: "Cancelada" };
export const TONO_SESION = { por_generar: "neutral", agendada: "info", realizada: "ok", falta: "bad", cancelada: "neutral" };
export const TIPOS_SESION = { procedimiento: "Procedimiento", curacion: "Curación", sesion: "Sesión", revision: "Revisión" };
export const FORMAS_COBRO = { todo_primera: "Todo en la sesión 1", por_sesion: "Por sesión" };

const ses = (n, nombre, tipo, intervaloDias, duracion, precio, ventanaMin = null, ventanaMax = null) => ({ n, nombre, tipo, intervaloDias, duracion, precio, ventanaMin, ventanaMax });
/** Plantillas base que RANNIX entrega y la clínica edita (P-027). Los cambios no afectan planes ya vendidos: el plan copia sus sesiones. */
export const PLANTILLAS_PLAN_BASE = [
  { id: "PPL1", nombre: "Extracción de uña + 4 curaciones", descripcion: "Extracción y 4 curaciones diarias consecutivas de 15 min incluidas a $0 (P-028).", servicioId: "SV4", activa: true,
    sesiones: [ses(1, "Extracción de uña", "procedimiento", 0, 60, 1200), ...[1, 2, 3, 4].map((k) => ses(k + 1, `Curación ${k}/4`, "curacion", 1, 15, 0))] },
  { id: "PPL2", nombre: "Láser para hongos · 6 sesiones", descripcion: "Una sesión cada 30 a 35 días (ventana recomendada, P-029).", servicioId: "SV6", activa: true,
    sesiones: [1, 2, 3, 4, 5, 6].map((k) => ses(k, `Láser ${k}/6`, "sesion", k === 1 ? 0 : 30, 30, 800, k === 1 ? null : 30, k === 1 ? null : 35)) },
  { id: "PPL3", nombre: "Verruga plantar · 4 aplicaciones", descripcion: "Aplicación de ácido cada 14 días y revisión final sin costo.", servicioId: "SV5", activa: true,
    sesiones: [...[1, 2, 3, 4].map((k) => ses(k, `Aplicación ${k}/4`, "sesion", k === 1 ? 0 : 14, 30, 650, k === 1 ? null : 12, k === 1 ? null : 16)), ses(5, "Revisión de alta", "revision", 14, 15, 0)] },
  { id: "PPL4", nombre: "Curaciones de pie diabético · 8 semanas", descripcion: "Curación semanal con valoración de la herida.", servicioId: "SV7", activa: true,
    sesiones: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => ses(k, `Curación semanal ${k}/8`, "curacion", k === 1 ? 0 : 7, 40, 500, k === 1 ? null : 6, k === 1 ? null : 9)) },
  { id: "PPL5", nombre: "Ortonixia · colocación y 3 ajustes", descripcion: "Colocación del corrector y ajuste mensual.", servicioId: "SV9", activa: true,
    sesiones: [ses(1, "Colocación del corrector", "procedimiento", 0, 45, 900), ...[1, 2, 3].map((k) => ses(k + 1, `Ajuste ${k}/3`, "sesion", 30, 30, 350, 28, 35))] },
  { id: "PPL6", nombre: "Onicocriptosis · espiculotomía y 2 curaciones", descripcion: "Procedimiento y dos curaciones incluidas a $0 a las 48 h y a la semana.", servicioId: "SV3", activa: true,
    sesiones: [ses(1, "Espiculotomía", "procedimiento", 0, 45, 700), ses(2, "Curación 1/2", "curacion", 2, 15, 0), ses(3, "Curación 2/2", "curacion", 5, 15, 0)] },
];

/**
 * Genera las sesiones de un plan desde su plantilla: cada sesión cae a `intervaloDias` de la anterior; si la sede no abre ese día
 * pasa al siguiente día hábil y queda «atrasada» (P-028). La ventana se cuenta desde la sesión anterior (P-029).
 */
export function generarSesiones({ sesiones = [], fechaInicio, diasCerrados = [7], festivos = [] }) {
  if (!fechaInicio) return [];
  let prev = dia(fechaInicio);
  return [...sesiones].sort((a, b) => a.n - b.n).map((r) => {
    const tentativa = sumarDias(prev, Number(r.intervaloDias) || 0);
    const fecha = diaAbierto(tentativa, diasCerrados, festivos);
    const s = {
      n: r.n, nombre: r.nombre, tipo: r.tipo || "sesion", fecha, duracion: Number(r.duracion) || 30, precio: Math.max(0, Number(r.precio) || 0),
      ventanaDesde: r.ventanaMin != null ? sumarDias(prev, r.ventanaMin) : null, ventanaHasta: r.ventanaMax != null ? sumarDias(prev, r.ventanaMax) : null,
      atrasada: fecha > tentativa, estado: "por_generar", reprogramaciones: 0,
    };
    prev = fecha;
    return s;
  });
}
export const totalPlan = (sesiones = []) => redondear(sesiones.filter((s) => s.estado !== "cancelada").reduce((a, s) => a + (Number(s.precio) || 0), 0));
export const sesionesIncluidas = (sesiones = []) => sesiones.filter((s) => s.estado !== "cancelada" && (Number(s.precio) || 0) === 0 && s.precio !== null).length;
/** P-029: fuera de ventana (o de su fecha si no hay ventana) solo marca «atrasada». */
export function sesionAtrasada(s, ref = hoy()) {
  if (s.estado === "cancelada") return false;
  const limite = s.ventanaHasta || s.fecha;
  if (s.estado === "realizada") return !!s.realizadaEn && !!limite && dia(s.realizadaEn) > limite;
  return !!s.atrasada || (!!limite && limite < ref);
}
export function resumenCumplimiento(sesiones = [], ref = hoy()) {
  const vivas = sesiones.filter((s) => s.estado !== "cancelada");
  const realizadas = vivas.filter((s) => s.estado === "realizada").length;
  return {
    total: vivas.length, realizadas, faltas: vivas.filter((s) => s.estado === "falta").length,
    agendadas: vivas.filter((s) => s.estado === "agendada").length,
    reprogramaciones: vivas.reduce((a, s) => a + (s.reprogramaciones || 0), 0),
    atrasadas: vivas.filter((s) => s.estado !== "realizada" && sesionAtrasada(s, ref)).length,
    avancePct: vivas.length ? Math.round((realizadas / vivas.length) * 100) : 0,
  };
}
export const siguienteSesion = (plan) => (plan.sesiones || []).find((s) => ["por_generar", "agendada", "falta"].includes(s.estado)) || null;
/** Última actividad del plan: la sesión realizada más reciente o, si no hay, el alta del plan. */
export function ultimaActividad(plan) {
  const fs = (plan.sesiones || []).filter((s) => s.estado === "realizada" && s.realizadaEn).map((s) => dia(s.realizadaEn));
  return fs.length ? fs.sort().pop() : dia(plan.creado || plan.fechaInicio);
}
export const diasSinActividad = (plan, ref = hoy()) => Math.max(0, diasEntre(ultimaActividad(plan), ref));
const tieneCitaFutura = (plan, ref) => (plan.sesiones || []).some((s) => s.estado === "agendada" && s.fecha >= ref);
/** P-026: «Abandonado» tras 30 días sin cita (sin sesión realizada ni cita futura agendada). */
export function planAbandonable(plan, ref = hoy(), dias = PARAMS_CLINICA.diasAbandono) {
  return plan.estado === "activo" && !tieneCitaFutura(plan, ref) && diasSinActividad(plan, ref) >= dias;
}
/** Aviso previo: le falta una semana o menos para darse por abandonado. */
export function planPorAbandonar(plan, ref = hoy(), dias = PARAMS_CLINICA.diasAbandono) {
  const n = diasSinActividad(plan, ref);
  return plan.estado === "activo" && !tieneCitaFutura(plan, ref) && n >= dias - 7 && n < dias;
}
export function saldoPlan(plan) {
  const total = totalPlan(plan.sesiones), cobrado = redondear((plan.sesiones || []).reduce((a, s) => a + (s.cargo ? Number(s.cargo.monto) || 0 : 0), 0));
  const anticipo = Math.min(Number(plan.anticipo) || 0, total);
  return { total, anticipo, devengado: cobrado, porDevengar: redondear(Math.max(0, total - cobrado)) };
}
/** Importe que genera una sesión al realizarse: las incluidas van a $0 (P-027); «todo en la sesión 1» carga el plan completo en la primera. */
export function cargoSesion(plan, s) {
  if (s.precio === null) return { monto: 0, concepto: "Se cobra en caja con la consulta" };
  if (plan.formaCobro === "todo_primera") {
    const primera = (plan.sesiones || []).filter((x) => x.estado !== "cancelada").sort((a, b) => a.n - b.n)[0];
    return primera && primera.n === s.n ? { monto: totalPlan(plan.sesiones), concepto: "Plan completo en la sesión 1" } : { monto: 0, concepto: "Incluida en el plan" };
  }
  return (Number(s.precio) || 0) === 0 ? { monto: 0, concepto: "Incluida en el plan ($0)" } : { monto: redondear(s.precio), concepto: "Sesión del plan" };
}
const FREC_LEGADO = { "cada semana": 7, "cada 2 semanas": 14, "cada mes": 30 };
/** Convierte un plan creado al cerrar la consulta (d.planesTratamiento) a la forma de d.planesTrat, sin tocar el original. */
export function planDesdeConsulta(d, pl) {
  const cada = FREC_LEGADO[pl.frecuencia] || 14;
  const cons = d.consultas.filter((c) => c.pacienteId === pl.pacienteId && c.podologoId === pl.podologoId).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  const pod = d.usuarios.find((x) => x.id === pl.podologoId);
  const ult = pl.ultimaSesion || pl.creado || hoy();
  const total = Math.max(1, Number(pl.sesionesTotal) || 1), hechas = Math.min(total, Math.max(0, Number(pl.sesionActual) || 0));
  const sesiones = Array.from({ length: total }, (_, i) => {
    const n = i + 1, hecha = n <= hechas;
    const fecha = hecha ? sumarDias(ult, -(hechas - n) * cada) : sumarDias(ult, (n - hechas) * cada);
    return { n, nombre: `Sesión ${n}/${total}`, tipo: "sesion", fecha, duracion: 30, precio: null, ventanaDesde: null, ventanaHasta: null, atrasada: false, estado: hecha ? "realizada" : "por_generar", reprogramaciones: 0, ...(hecha ? { realizadaEn: fecha } : {}) };
  });
  return {
    origenId: pl.id, pacienteId: pl.pacienteId, podologoId: pl.podologoId, sucursalId: (cons && cons.sucursalId) || (pod && pod.sucursales[0]) || d.sucursales[0].id,
    plantillaId: null, nombre: pl.descripcion || "Plan de tratamiento", diagnostico: (cons && cons.diagnostico) || "", creado: pl.creado || ult, fechaInicio: pl.creado || ult,
    estado: pl.estado === "completado" ? "completado" : "activo", formaCobro: "por_sesion", anticipo: 0, frecuencia: pl.frecuencia || "cada 2 semanas", sesiones,
  };
}
export function validarPlan(d, x) {
  const e = {};
  if (!d.pacientes.find((p) => p.id === x.pacienteId)) e.pacienteId = "Elige al paciente";
  if (!x.fechaInicio) e.fechaInicio = "Elige la fecha de inicio";
  const s = x.sesiones || [];
  if (!s.length) e.sesiones = "El plan necesita al menos una sesión";
  else if (s.some((r) => !String(r.nombre || "").trim())) e.sesiones = "Cada sesión necesita un nombre";
  else if (s.some((r) => !(Number(r.precio) >= 0) || !(Number(r.intervaloDias) >= 0))) e.sesiones = "Precio e intervalo no pueden ser negativos";
  if (!String(x.nombre || "").trim()) e.nombre = "Escribe el nombre del plan";
  if (x.anticipo !== "" && x.anticipo != null && !(Number(x.anticipo) >= 0)) e.anticipo = "Anticipo no válido";
  return e;
}

// ═════════════════════════ Pie diabético (P-010, P-011)
export const ITEMS_SINBAD = [
  ["s", "Sitio", "antepié = 0 · medio o retropié = 1"], ["i", "Isquemia", "al menos un pulso pedal palpable = 0"], ["n", "Neuropatía", "sensibilidad protectora intacta = 0"],
  ["b", "Infección bacteriana", "ausente = 0"], ["a", "Área", "menor de 1 cm² = 0"], ["d", "Profundidad", "piel o subcutáneo = 0"],
];
export const WAGNER = ["0 · Pie en riesgo, sin úlcera", "1 · Úlcera superficial", "2 · Úlcera profunda (tendón o cápsula)", "3 · Profunda con absceso u osteomielitis", "4 · Gangrena localizada", "5 · Gangrena extensa"];
export const PROFUNDIDADES = { piel: "Piel", subcutaneo: "Tejido subcutáneo", musculo_tendon: "Músculo o tendón", hueso_articulacion: "Hueso o articulación" };
export const REGIONES = { dedo: "Dedo", antepie: "Antepié", mediopie: "Medio pie", talon: "Talón" };
export const INFECCION = { sin_infeccion: "Sin infección", leve: "Leve", moderada: "Moderada", grave: "Grave" };
export const PULSO = { presente: "Presente", disminuido: "Disminuido", ausente: "Ausente", no_evaluado: "No evaluado" };
export const PULSOS = [["pedioI", "Pedio izq."], ["pedioD", "Pedio der."], ["tibialI", "Tibial post. izq."], ["tibialD", "Tibial post. der."]];
export const SITIOS_MONO = [["dedo1", "1er dedo"], ["dedo3", "3er dedo"], ["dedo5", "5º dedo"], ["mt1", "Cabeza MT 1"], ["mt3", "Cabeza MT 3"], ["mt5", "Cabeza MT 5"], ["mpm", "Medio pie medial"], ["mpl", "Medio pie lateral"], ["talon", "Talón"], ["dorso", "Dorso"]];
export const SINTOMAS = { hormigueo: "Hormigueo", ardor: "Ardor", calambres: "Calambres", dolor_reposo: "Dolor en reposo", claudicacion: "Claudicación", perdida_sensibilidad: "Pérdida de sensibilidad" };
export const DEFORMIDADES = { hallux_valgus: "Hallux valgus", garra: "Dedos en garra", charcot: "Pie de Charcot", callosidad: "Callosidad", fisura: "Fisura", maceracion: "Maceración interdigital", onicomicosis: "Onicomicosis" };
const DEFORMIDAD_ESTRUCTURAL = ["hallux_valgus", "garra", "charcot"];
export const FRECUENCIAS_REVISION = { cada_1_mes: ["Cada mes", 30], cada_2_meses: ["Cada 2 meses", 60], cada_3_meses: ["Cada 3 meses", 90], cada_6_meses: ["Cada 6 meses", 180], anual: ["Anual", 365] };
export const FRECUENCIA_POR_RIESGO = { 0: "anual", 1: "cada_6_meses", 2: "cada_3_meses", 3: "cada_1_mes" };
export const RIESGO_TXT = ["0 · Muy bajo", "1 · Bajo", "2 · Moderado", "3 · Alto"];

const bit = (v) => (v === 1 || v === true || v === "1" ? 1 : 0);
/** Puntaje SINBAD: suma 0–6 de los seis ítems (cada uno 0 o 1). Un ítem vacío cuenta 0. */
export const puntajeSinbad = ({ s, i, n, b, a, d } = {}) => bit(s) + bit(i) + bit(n) + bit(b) + bit(a) + bit(d);
/** Propone los seis ítems a partir de lo capturado; el podólogo puede corregirlos. */
export function sugerirSinbad({ region, pulsos = {}, sensProtectora, infeccion, areaCm2, profundidad } = {}) {
  const ev = Object.values(pulsos).filter((p) => p && p !== "no_evaluado");
  return {
    s: region === "mediopie" || region === "talon" ? 1 : 0,
    i: ev.length > 0 && !ev.includes("presente") ? 1 : 0,
    n: sensProtectora === "ausente" ? 1 : 0,
    b: infeccion && infeccion !== "sin_infeccion" ? 1 : 0,
    a: Number(areaCm2) >= 1 ? 1 : 0,
    d: profundidad === "musculo_tendon" || profundidad === "hueso_articulacion" ? 1 : 0,
  };
}
/** Wagner: entero de 0 a 5. */
export function wagnerValido(v) {
  if (v === "" || v === null || v === undefined || typeof v === "boolean") return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 5;
}
/** ITB (P-011): opcional. Vacío = «no evaluado» (null). 0 JAMÁS se guarda: se rechaza en la captura. */
export function validarItb(v) {
  if (v === "" || v === null || v === undefined) return { ok: true, valor: null };
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: "ITB no válido" };
  if (n === 0) return { ok: false, error: "El ITB nunca es 0: si no se midió, déjalo vacío (no evaluado)" };
  if (n < 0 || n > 2.5) return { ok: false, error: "ITB fuera de rango (0.1 a 2.5)" };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}
export const normalizarItb = (v) => { const r = validarItb(v); return r.ok ? r.valor : null; };
/** Lectura orientativa del ITB (apoyo, no diagnóstico). */
export function lecturaItb(v) {
  const n = normalizarItb(v);
  if (n === null) return "No evaluado";
  if (n > 1.4) return "Posible calcificación arterial (> 1.40)";
  if (n >= 0.9) return "Normal (0.90–1.40)";
  if (n >= 0.7) return "Enfermedad arterial leve (0.70–0.89)";
  if (n >= 0.4) return "Enfermedad arterial moderada (0.40–0.69)";
  return "Enfermedad arterial grave (< 0.40)";
}
/** Monofilamento: mono = { D: { ev, fallan: [sitio] }, I: {…} }. */
export function resumenMono(mono = {}) {
  const r = {};
  ["D", "I"].forEach((p) => { const x = mono[p] || {}; r[p] = { evaluados: Number(x.ev) || 0, sinSensibilidad: (x.fallan || []).length }; });
  return r;
}
/** Sensibilidad protectora sugerida: ausente si falla ≥ 1 sitio evaluado en algún pie (criterio práctico; el podólogo confirma). */
export function sensProtectoraSugerida(mono = {}) {
  const r = resumenMono(mono);
  if (!(r.D.evaluados + r.I.evaluados)) return null;
  return r.D.sinSensibilidad + r.I.sinSensibilidad > 0 ? "ausente" : "intacta";
}
export const proximaRevision = (fecha, frecuencia) => (FRECUENCIAS_REVISION[frecuencia] ? sumarDias(fecha, FRECUENCIAS_REVISION[frecuencia][1]) : null);
/** Datos de riesgo que salen de una valoración (con lo disponible: un ITB no evaluado no cuenta, P-011). */
export function factoresRiesgo(v = {}) {
  const itb = [normalizarItb(v.itbI), normalizarItb(v.itbD)].filter((x) => x !== null);
  const ev = Object.values(v.pulsos || {}).filter((p) => p && p !== "no_evaluado");
  return {
    lops: v.sensProtectora === "ausente",
    eap: itb.some((x) => x < 0.9) || (ev.length > 0 && !ev.includes("presente")),
    deformidad: (v.deformidades || []).some((x) => DEFORMIDAD_ESTRUCTURAL.includes(x)),
    ulceraPrevia: !!v.ulceraPrevia || !!v.ulcera, amputacionPrevia: !!v.amputacionPrevia,
  };
}
/**
 * Categoría de riesgo sugerida (IWGDF 2023). SOLO si la clínica activó el parámetro (P-010): apagada devuelve null.
 * 0 sin LOPS ni EAP · 1 LOPS o EAP · 2 dos de (LOPS, EAP, deformidad) · 3 úlcera o amputación previa.
 */
export function sugerirRiesgo({ lops, eap, deformidad, ulceraPrevia, amputacionPrevia } = {}, { activo = false } = {}) {
  if (!activo) return null;
  if (ulceraPrevia || amputacionPrevia) return 3;
  if ([lops, eap, deformidad].filter(Boolean).length >= 2) return 2;
  return lops || eap ? 1 : 0;
}
export function validarValoracion(d, x) {
  const e = {};
  if (!d.pacientes.find((p) => p.id === x.pacienteId)) e.pacienteId = "Elige al paciente";
  if (!x.fecha) e.fecha = "Falta la fecha";
  else if (dia(x.fecha) > hoy()) e.fecha = "La fecha no puede ser futura";
  if (!wagnerValido(x.wagner)) e.wagner = "Wagner es un entero de 0 a 5";
  ["itbI", "itbD"].forEach((k) => { const r = validarItb(x[k]); if (!r.ok) e[k] = r.error; });
  if (x.ulcera) {
    const sb = x.sinbad || {};
    if (["s", "i", "n", "b", "a", "d"].some((k) => ![0, 1].includes(Number(sb[k])))) e.sinbad = "Cada ítem de SINBAD vale 0 o 1";
    if (x.ulcera.areaCm2 !== "" && x.ulcera.areaCm2 != null && !(Number(x.ulcera.areaCm2) >= 0)) e.area = "Área no válida";
    if (wagnerValido(x.wagner) && Number(x.wagner) === 0) e.wagner = "Con úlcera activa Wagner es 1 o mayor";
  }
  if (x.hba1c !== "" && x.hba1c != null && !(Number(x.hba1c) >= 3 && Number(x.hba1c) <= 20)) e.hba1c = "HbA1c entre 3 y 20 %";
  if (x.riesgo !== "" && x.riesgo != null && ![0, 1, 2, 3].includes(Number(x.riesgo))) e.riesgo = "Categoría de riesgo de 0 a 3";
  return e;
}
/** Alertas de una valoración (y contra la anterior del mismo paciente). */
export function alertasValoracion(v, previa = null, ref = hoy()) {
  const a = [];
  if (Number(v.wagner) >= 3) a.push({ tono: "bad", texto: `Wagner ${v.wagner}: valorar referencia urgente.` });
  if (v.sinbadTotal != null && v.sinbadTotal >= 3) a.push({ tono: "bad", texto: `SINBAD ${v.sinbadTotal}/6: úlcera de mal pronóstico, seguimiento estrecho.` });
  [["itbI", "izquierdo"], ["itbD", "derecho"]].forEach(([k, lado]) => {
    const n = normalizarItb(v[k]);
    if (n !== null && n < 0.9) a.push({ tono: n < 0.7 ? "bad" : "warn", texto: `ITB ${lado} ${n.toFixed(2)}: ${lecturaItb(n).toLowerCase()}.` });
    if (n !== null && n > 1.4) a.push({ tono: "warn", texto: `ITB ${lado} ${n.toFixed(2)}: arterias poco compresibles, interpretar con cautela.` });
  });
  if (v.sensProtectora === "ausente") a.push({ tono: "warn", texto: "Sensibilidad protectora ausente (monofilamento)." });
  if (v.ulcera && v.ulcera.infeccion && v.ulcera.infeccion !== "sin_infeccion") a.push({ tono: v.ulcera.infeccion === "leve" ? "warn" : "bad", texto: `Infección ${INFECCION[v.ulcera.infeccion].toLowerCase()} en la úlcera.` });
  if (previa) {
    if (Number(v.wagner) > Number(previa.wagner)) a.push({ tono: "bad", texto: `Empeoró: Wagner ${previa.wagner} → ${v.wagner}.` });
    if (v.sinbadTotal != null && previa.sinbadTotal != null && v.sinbadTotal > previa.sinbadTotal) a.push({ tono: "bad", texto: `Empeoró: SINBAD ${previa.sinbadTotal} → ${v.sinbadTotal}.` });
  }
  if (v.proximaRevision && v.proximaRevision < ref) a.push({ tono: "warn", texto: `Revisión vencida desde ${v.proximaRevision}.` });
  return a;
}
/** Historial del paciente, de la más antigua a la más reciente. */
export const historialPie = (d, pacienteId) => (d.pieDiabetico || []).filter((v) => v.pacienteId === pacienteId).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
/** Última valoración por paciente con sus alertas y tendencia. */
export function resumenPie(d, lista, ref = hoy()) {
  const por = new Map();
  [...lista].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).forEach((v) => por.set(v.pacienteId, [...(por.get(v.pacienteId) || []), v]));
  return [...por.entries()].map(([pacienteId, vs]) => {
    const ult = vs[vs.length - 1], prev = vs.length > 1 ? vs[vs.length - 2] : null;
    const alertas = alertasValoracion(ult, prev, ref);
    const tendencia = !prev ? "inicial" : Number(ult.wagner) > Number(prev.wagner) || (ult.sinbadTotal ?? 0) > (prev.sinbadTotal ?? 0) ? "empeora" : Number(ult.wagner) < Number(prev.wagner) || (ult.sinbadTotal ?? 0) < (prev.sinbadTotal ?? 0) ? "mejora" : "estable";
    return { id: pacienteId, pacienteId, ultima: ult, previa: prev, n: vs.length, alertas, tendencia, vencida: !!ult.proximaRevision && ult.proximaRevision < ref };
  });
}

// ═════════════════════════ Plantillas ortopédicas (P-013)
export const ESTADOS_PO = { borrador: "Borrador", enviada: "En laboratorio", recibida: "Recibida", entregada: "Entregada", cancelada: "Cancelada" };
export const TONO_PO = { borrador: "neutral", enviada: "info", recibida: "warn", entregada: "ok", cancelada: "neutral" };
export const PASOS_PO = ["borrador", "enviada", "recibida", "entregada"];
export const TIPOS_ESTUDIO = { baropodometria: "Baropodometría", plantigrafia: "Plantigrafía (huella)", escaner3d: "Escáner 3D", molde: "Molde de espuma fenólica" };
export const TOMA_LAB = { baropodometria: "Huella", plantigrafia: "Huella", escaner3d: "Escáner 3D", molde: "Molde" };
export const TIPOS_ARCO = ["Normal", "Plano", "Cavo"];
export const RETROPIE = ["Neutro", "Valgo", "Varo"];
export const COBERTURAS = { completa: "Completa", tres_cuartos: "Tres cuartos", media: "Media" };
export const MODELOS_PO = { "Plantilla a medida": 900, "Plantilla termoformada diabético": 780, "Plantilla deportiva a medida": 1100, "Plantilla confort a medida": 450, "Ortesis de silicona": 650 };
export const MATERIALES_PO = ["EVA termoformable", "Polipropileno 3 mm", "Plastazote (diabético)", "Resina con forro de piel", "Silicona médica"];
export const anticipoPlantilla = (precio, pct = PARAMS_CLINICA.anticipoPlantillaPct) => redondear((Number(precio) || 0) * pct / 100);
/** Entrega estimada: 15 días hábiles tras el envío al laboratorio. */
export const entregaEstimada = (enviada, diasHabiles = PARAMS_CLINICA.diasHabilesPlantilla, festivos = FESTIVOS_MX) => sumarDiasHabiles(enviada, diasHabiles, festivos);
/** Garantía: 6 meses desde la entrega al paciente. */
export const garantiaHasta = (entregada, meses = PARAMS_CLINICA.garantiaMeses) => (entregada ? sumarMeses(entregada, Number(meses) || 0) : null);
export const enGarantia = (entregada, meses, ref = hoy()) => !!entregada && ref <= garantiaHasta(entregada, meses);
export const ordenLabDe = (d, po) => (po && po.ordenLabId ? d.ordenesLab.find((o) => o.id === po.ordenLabId) || null : null);
/** Estado vigente: si la plantilla ya tiene orden de laboratorio, manda lo que pase con esa orden (almacén la recibe y entrega en «Entrega de plantillas»). */
export function estadoPO(d, po) {
  if (po.estado === "cancelada" || po.estado === "borrador") return po.estado;
  const o = ordenLabDe(d, po);
  if (!o) return po.estado;
  if (o.estado === "entregada") return "entregada";
  if (["recibida", "en_prueba"].includes(o.estado)) return "recibida";
  return "enviada";
}
/** Fechas y dinero vigentes de la plantilla (mezcla la plantilla con su orden de laboratorio). */
export function fichaPO(d, po, ref = hoy()) {
  const o = ordenLabDe(d, po), estado = estadoPO(d, po);
  const meses = (po.orden && po.orden.garantiaMeses) ?? PARAMS_CLINICA.garantiaMeses;
  const enviada = (o && o.enviada) || po.enviada || null, prometida = (o && o.prometida) || po.entregaEstimada || null;
  const entregada = estado === "entregada" ? (o && o.entregada) || po.entregada || null : null;
  const precio = Number((po.orden && po.orden.precio) || (o && o.precio) || 0);
  return {
    estado, enviada, prometida, recibida: (o && o.recibidaLab) || po.recibida || null, entregada,
    retrasada: estado === "enviada" && !!prometida && prometida < ref, retrabajo: !!o && o.estado === "retrabajo",
    garantiaHasta: garantiaHasta(entregada, meses), enGarantia: enGarantia(entregada, meses, ref),
    revisionAjuste: entregada ? sumarDias(entregada, 15) : null, renovacionDesde: entregada ? sumarMeses(entregada, 12) : null,
    precio, anticipoRequerido: anticipoPlantilla(precio, (o && o.anticipoPct) || undefined),
    anticipoPendiente: o ? Number(o.anticipoPendiente) || 0 : null, anticipoPagado: o ? Number(o.anticipoPagado) || 0 : 0, folioLab: o ? o.folio : null,
  };
}
const enRango = (v, a, b) => v === "" || v == null || (Number(v) >= a && Number(v) <= b);
export function validarEstudio(e = {}) {
  const r = {};
  if (!TIPOS_ESTUDIO[e.tipo]) r.tipo = "Elige el tipo de estudio";
  if (!(Number(e.tallaCalzado) >= 15 && Number(e.tallaCalzado) <= 34)) r.tallaCalzado = "Talla MX entre 15 y 34";
  if (!enRango(e.longI, 120, 340) || !enRango(e.longD, 120, 340)) r.long = "Longitud del pie entre 120 y 340 mm";
  if (!enRango(e.anchoI, 40, 140) || !enRango(e.anchoD, 40, 140)) r.ancho = "Ancho metatarsal entre 40 y 140 mm";
  if (!enRango(e.dismetriaMm, 0, 60)) r.dismetriaMm = "Dismetría entre 0 y 60 mm";
  if (!enRango(e.pesoKg, 5, 300)) r.pesoKg = "Peso entre 5 y 300 kg";
  if (!TIPOS_ARCO.includes(e.tipoArco)) r.tipoArco = "Elige el tipo de arco";
  return r;
}
export function validarOrdenPO(d, o = {}) {
  const r = {};
  if (!String(o.modelo || "").trim()) r.modelo = "Elige el modelo";
  if (!(Number(o.precio) > 0)) r.precio = "Escribe el precio";
  if (!(Number(o.pares) >= 1 && Number(o.pares) <= 4)) r.pares = "Pares entre 1 y 4";
  if (!d.laboratorios.find((l) => l.id === o.laboratorioId)) r.laboratorioId = "Elige el laboratorio";
  if (!(Number(o.garantiaMeses) >= 0 && Number(o.garantiaMeses) <= 36)) r.garantiaMeses = "Garantía entre 0 y 36 meses";
  return r;
}

// ═════════════════════════ Esterilización por lotes (P-023)
export const ESTADOS_LOTE = { registrado: "Registrado", liberado_condicionado: "Liberado condicionado", liberado: "Liberado", bloqueado: "BLOQUEADO", rechazado: "Rechazado" };
export const TONO_LOTE = { registrado: "neutral", liberado_condicionado: "warn", liberado: "ok", bloqueado: "bad", rechazado: "bad" };
export const BIO_TXT = { pendiente: "Pendiente (24 h)", conforme: "Negativo", no_conforme: "Positivo", no_aplica: "No aplica" };
export const QUIM_TXT = { conforme: "Viró", no_conforme: "No viró" };
export const CICLOS_AUTOCLAVE = { instrumental_envuelto: ["Instrumental envuelto", 134, 2.1, 4], textil_curacion: ["Textil / curación", 121, 1.1, 15], instrumental_sin_envolver: ["Instrumental sin envolver", 134, 2.1, 3] };
/**
 * Estado del lote (= ciclo de autoclave) a partir de sus indicadores. Vocabulario de este sistema: químico conforme = viró;
 * biológico conforme = negativo, no_conforme = positivo.
 * químico no viró o falla reportada → rechazado · biológico positivo → BLOQUEADO · pendiente → liberado condicionado · negativo → liberado.
 */
export function estadoLote(c) {
  if (!c) return "registrado";
  if (c.indicadorBiologico === "no_conforme") return "bloqueado";
  if (c.indicadorQuimico === "no_conforme" || c.falla) return "rechazado";
  if (c.indicadorBiologico === "pendiente") return "liberado_condicionado";
  return c.indicadorQuimico === "conforme" ? "liberado" : "registrado";
}
export const loteUsable = (c, ref = hoy()) => ["liberado", "liberado_condicionado"].includes(estadoLote(c)) && (!c.esterilHasta || c.esterilHasta >= ref);
/** El resultado biológico se espera a las 24 h. */
export const biologicoVencido = (c, ahora = new Date()) => !!c && c.indicadorBiologico === "pendiente" && parse(c.fecha).getTime() < ahora.getTime() - 24 * 3600 * 1000;
export const esterilHasta = (fecha, dias = PARAMS_CLINICA.diasEsterilidad) => sumarDias(fecha, dias);
/** Último lote en el que se esterilizó el kit. */
export const loteDeKit = (d, setId) => d.ciclos.filter((c) => (c.sets || []).includes(setId)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0] || null;
/** Un kit solo se usa si está esterilizado y su lote es usable; después requiere un nuevo ciclo. */
export function kitUsable(kit, lote, ref = hoy()) {
  if (!kit || kit.estado !== "esterilizado") return { ok: false, motivo: "El kit no está esterilizado: necesita un nuevo ciclo de autoclave." };
  if (!lote) return { ok: false, motivo: "El kit no tiene lote de esterilización registrado." };
  if (!loteUsable(lote, ref)) return { ok: false, motivo: estadoLote(lote) === "bloqueado" ? "El lote está BLOQUEADO (indicador biológico positivo)." : "El lote no está liberado o su esterilidad venció." };
  return { ok: true, motivo: null };
}
/** Trazabilidad inversa: pacientes atendidos con instrumental de un lote. */
export function pacientesDeLote(d, cicloId) {
  const c = d.ciclos.find((x) => x.id === cicloId);
  const por = new Map();
  (d.usoSets || []).filter((x) => x.cicloId === cicloId).forEach((x) => {
    const p = d.pacientes.find((y) => y.id === x.pacienteId), cita = x.citaId ? d.citas.find((y) => y.id === x.citaId) : null;
    const r = por.get(x.pacienteId) || { id: x.pacienteId, pacienteId: x.pacienteId, nombre: nombrePac(d, x.pacienteId), telefono: p ? p.telefono : "", whatsapp: !!(p && p.whatsapp), usos: [], avisado: !!(c && (c.pacientesAvisados || []).includes(x.pacienteId)) };
    r.usos.push({ fecha: x.fecha, setId: x.setId, kit: (d.sets.find((s) => s.id === x.setId) || {}).nombre || x.setId, consultorio: x.consultorio, podologoId: cita ? cita.podologoId : null });
    por.set(x.pacienteId, r);
  });
  return [...por.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
export const codigoKit = (set) => (set && set.codigo) || `KIT-${set ? set.id : ""}`;
/** Texto que lleva el código QR del kit. */
export const textoQrKit = (set) => `PODIX|KIT|${set.id}`;
export function kitDeTexto(d, texto) {
  const t = String(texto || "").trim();
  const id = t.startsWith("PODIX|KIT|") ? t.slice(10) : t.replace(/^KIT-/i, "");
  return d.sets.find((s) => s.id === id || codigoKit(s).toLowerCase() === t.toLowerCase() || s.nombre.toLowerCase() === t.toLowerCase()) || null;
}
export function validarLote(d, x) {
  const e = {};
  if (!String(x.lote || "").trim()) e.lote = "Escribe el número de lote";
  if (!String(x.autoclave || "").trim()) e.autoclave = "Elige la autoclave";
  if (!["conforme", "no_conforme"].includes(x.indicadorQuimico)) e.indicadorQuimico = "Registra el indicador químico";
  if (!["pendiente", "conforme", "no_conforme", "no_aplica"].includes(x.indicadorBiologico)) e.indicadorBiologico = "Registra el indicador biológico";
  if (!(x.sets || []).length) e.sets = "Incluye al menos un kit";
  if (x.temp !== "" && x.temp != null && !(Number(x.temp) >= 100 && Number(x.temp) <= 140)) e.temp = "Temperatura entre 100 y 140 °C";
  if (x.min !== "" && x.min != null && !(Number(x.min) >= 1 && Number(x.min) <= 90)) e.min = "Tiempo entre 1 y 90 min";
  return e;
}

// ── Código QR propio (ISO/IEC 18004): modo byte, nivel de corrección M, versiones 1 a 3, máscara 0. Sin dependencias.
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; })();
const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);
/** Bytes de corrección Reed-Solomon (GF(256), polinomio 0x11D). */
export function rsCorreccion(datos, n) {
  let g = [1];
  for (let i = 0; i < n; i++) { const nx = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { nx[j] ^= g[j]; nx[j + 1] ^= gfMul(g[j], GF_EXP[i]); } g = nx; }
  const res = new Array(n).fill(0);
  for (const b of datos) { const f = b ^ res.shift(); res.push(0); for (let j = 0; j < n; j++) res[j] ^= gfMul(g[j + 1], f); }
  return res;
}
const QR_VERSIONES = [null, { datos: 16, ec: 10 }, { datos: 28, ec: 16 }, { datos: 44, ec: 26 }];
export function qrBytes(texto) {
  const out = [];
  for (const ch of String(texto)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
/** Palabras de datos (con relleno) para la versión más chica que quepa. Devuelve { version, datos }. */
export function qrDatos(texto) {
  const bytes = qrBytes(texto);
  const version = [1, 2, 3].find((v) => bytes.length <= QR_VERSIONES[v].datos - 2);
  if (!version) throw new Error("El texto no cabe en un código QR de versión 3 (máx. 42 bytes).");
  const cap = QR_VERSIONES[version].datos, bits = [];
  const poner = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  poner(4, 4); poner(bytes.length, 8); bytes.forEach((b) => poner(b, 8));
  poner(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let k = 0; datos.length < cap; k++) datos.push(k % 2 ? 0x11 : 0xec);
  return { version, datos };
}
/** Matriz de módulos (true = oscuro) del código QR de `texto`. */
export function qrMatriz(texto) {
  const { version, datos } = qrDatos(texto);
  const N = 17 + 4 * version, cw = [...datos, ...rsCorreccion(datos, QR_VERSIONES[version].ec)];
  const m = Array.from({ length: N }, () => new Array(N).fill(false)), fn = Array.from({ length: N }, () => new Array(N).fill(false));
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < N && y < N) { m[y][x] = !!v; fn[y][x] = true; } };
  for (let i = 0; i < N; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  [[3, 3], [N - 4, 3], [3, N - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const k = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, k !== 2 && k !== 4); } });
  if (version >= 2) { const c = N - 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
  // Información de formato: nivel M (00) + máscara 0 (000), con BCH(15,5) y XOR 0x5412
  const d5 = 0; let rem = d5;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const fmt = ((d5 << 10) | rem) ^ 0x5412, fb = (i) => ((fmt >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, fb(i));
  set(8, 7, fb(6)); set(8, 8, fb(7)); set(7, 8, fb(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, fb(i));
  for (let i = 0; i < 8; i++) set(N - 1 - i, 8, fb(i));
  for (let i = 8; i < 15; i++) set(8, N - 15 + i, fb(i));
  set(8, N - 8, true);
  // Datos en zigzag desde la esquina inferior derecha, con máscara 0: (x + y) par invierte
  let i = 0; const total = cw.length * 8;
  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, arriba = ((right + 1) & 2) === 0, y = arriba ? N - 1 - vert : vert;
      if (fn[y][x]) continue;
      const b = i < total ? ((cw[i >> 3] >> (7 - (i & 7))) & 1) === 1 : false; i++;
      m[y][x] = b !== ((x + y) % 2 === 0);
    }
  }
  return m;
}

// ═════════════════════════ Quejas, eventos adversos y solicitudes ARCO (P-020 a P-022, P-141)
export const TIPOS_QUEJA = { dolor_posterior: "Dolor posterior al procedimiento", tiempo_espera: "Tiempo de espera excesivo", cobro_incorrecto: "Cobro o ticket incorrecto", evento_adverso_infeccion: "Evento adverso / infección", trato_personal: "Trato del personal", instrumental_higiene: "Instrumental o higiene", otro: "Otro" };
export const CLASES_QUEJA = { administrativa: "Administrativa", evento_adverso: "Evento adverso clínico" };
export const GRAVEDADES = { baja: "Baja", media: "Media", alta: "Alta" };
export const TONO_GRAVEDAD = { baja: "neutral", media: "warn", alta: "bad" };
export const CANALES_QUEJA = { presencial: "Presencial", llamada: "Llamada", whatsapp: "WhatsApp", correo: "Correo", portal: "Portal", otro: "Otro" };
export const ESTADOS_QUEJA = { nueva: "Nueva", en_proceso: "En proceso", escalada: "Escalada", resuelta: "Resuelta", cerrada: "Cerrada" };
export const TONO_QUEJA = { nueva: "info", en_proceso: "warn", escalada: "bad", resuelta: "ok", cerrada: "neutral" };
export const COMPENSACIONES = { ninguna: "Ninguna", disculpa: "Disculpa formal", consulta_sin_costo: "Consulta sin costo", reembolso: "Reembolso", descuento: "Descuento" };
/** P-022: reembolso, descuento y consulta gratis tienen costo y los autoriza siempre Administración. */
export const compensacionConCosto = (tipo) => ["consulta_sin_costo", "reembolso", "descuento"].includes(tipo);
export const quejaAbierta = (q) => !["resuelta", "cerrada"].includes(q.estado);
export const DERECHOS_ARCO = { acceso: "Acceso", rectificacion: "Rectificación", cancelacion: "Cancelación", oposicion: "Oposición" };
export const ESTADOS_ARCO = { recibida: "Recibida", en_proceso: "En proceso", atendida: "Atendida", rechazada: "Rechazada" };
export const TONO_ARCO = { recibida: "info", en_proceso: "warn", atendida: "ok", rechazada: "neutral" };
export const arcoAbierta = (a) => ["recibida", "en_proceso"].includes(a.estado);
/** Fecha límite en días NATURALES desde la recepción: 3 para quejas (P-020), 20 para ARCO (P-141). */
export const fechaLimite = (fecha, dias) => sumarDias(dia(fecha), dias);
/**
 * Semáforo del plazo. Abierta: verde · ámbar (vence en `avisar` días o menos, incluido hoy) · rojo (vencida).
 * Cerrada: «a tiempo» o «fuera de meta» según cuándo se cerró.
 */
export function semaforo(limite, { ref = hoy(), cerradaEn = null, avisar = 1 } = {}) {
  if (cerradaEn) { const a = dia(cerradaEn) <= limite; return { color: a ? "verde" : "rojo", tono: a ? "ok" : "bad", texto: a ? "Resuelta a tiempo" : "Resuelta fuera de meta", dias: diasEntre(dia(cerradaEn), limite), cerrada: true }; }
  const n = diasEntre(ref, limite);
  if (n < 0) return { color: "rojo", tono: "bad", texto: `Vencida hace ${-n} ${-n === 1 ? "día" : "días"}`, dias: n, cerrada: false };
  if (n <= avisar) return { color: "ambar", tono: "warn", texto: n === 0 ? "Vence hoy" : `Vence en ${n} ${n === 1 ? "día" : "días"}`, dias: n, cerrada: false };
  return { color: "verde", tono: "ok", texto: `Quedan ${n} días`, dias: n, cerrada: false };
}
export const semaforoQueja = (q, ref = hoy()) => semaforo(q.limite, { ref, cerradaEn: quejaAbierta(q) ? null : q.resueltaEn || q.cerradaEn || q.limite, avisar: 1 });
export const semaforoArco = (a, ref = hoy()) => semaforo(a.limite, { ref, cerradaEn: arcoAbierta(a) ? null : a.atendidaEn || a.limite, avisar: 5 });
export function validarQueja(d, x) {
  const e = {};
  // Paciente opcional (una queja anónima o de un acompañante), salvo en evento adverso clínico (P-021)
  if (x.pacienteId && !d.pacientes.find((p) => p.id === x.pacienteId)) e.pacienteId = "El paciente no existe";
  if (x.clase === "evento_adverso" && !x.pacienteId) e.pacienteId = "Un evento adverso clínico necesita al paciente";
  if (!CLASES_QUEJA[x.clase]) e.clase = "Elige la clase";
  if (!d.sucursales.find((s) => s.id === x.sucursalId)) e.sucursalId = "Elige la sucursal";
  if (!TIPOS_QUEJA[x.tipo]) e.tipo = "Elige el tipo";
  if (!GRAVEDADES[x.gravedad]) e.gravedad = "Elige la gravedad";
  if (String(x.descripcion || "").trim().length < 10) e.descripcion = "Describe lo ocurrido (mínimo 10 caracteres)";
  // P-021: la sesión ligada es opcional salvo en eventos adversos clínicos
  if (x.clase === "evento_adverso" && !d.consultas.find((c) => c.id === x.consultaId && c.pacienteId === x.pacienteId)) e.consultaId = "Un evento adverso clínico debe ligarse a la sesión del paciente";
  return e;
}
export function resumenQuejas(lista, ref = hoy()) {
  const ab = lista.filter(quejaAbierta), ce = lista.filter((q) => !quejaAbierta(q) && q.resueltaEn);
  const dias = ce.map((q) => Math.max(0, diasEntre(dia(q.fecha), dia(q.resueltaEn))));
  return {
    abiertas: ab.length, vencidas: ab.filter((q) => semaforoQueja(q, ref).color === "rojo").length, porVencer: ab.filter((q) => semaforoQueja(q, ref).color === "ambar").length,
    eventosAdversos: ab.filter((q) => q.clase === "evento_adverso").length, tiempoMedio: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null,
    aTiempoPct: ce.length ? Math.round((ce.filter((q) => dia(q.resueltaEn) <= q.limite).length / ce.length) * 100) : null,
    compensacionesPendientes: lista.filter((q) => q.compensacion && q.compensacion.estado === "propuesta").length,
  };
}

// ═════════════════════════ Seguimiento de pacientes (CRM)
export const SEGMENTOS = { inactivos: "Inactivos (180 días)", revision_pie: "Revisión de pie diabético vencida", plan_abandonado: "Plan abandonado o por abandonar", cumpleanos: "Cumpleaños de la semana", garantia: "Revisión de ajuste de plantilla" };
export const CANALES_CONTACTO = { whatsapp: "WhatsApp", telefono: "Llamada", presencial: "Presencial", correo: "Correo" };
export const RESULTADOS_CONTACTO = { agendo: "Agendó cita", contactado: "Contactado, lo piensa", sin_respuesta: "Sin respuesta", no_interesado: "No le interesa", numero_equivocado: "Número equivocado", no_contactar: "Pidió no ser contactado" };
export const TONO_RESULTADO = { agendo: "ok", contactado: "info", sin_respuesta: "warn", no_interesado: "neutral", numero_equivocado: "bad", no_contactar: "bad" };
export const ESTADOS_CAMPANA = { borrador: "Borrador", aprobada: "Aprobada", en_curso: "En curso", terminada: "Terminada" };
export const TONO_CAMPANA = { borrador: "neutral", aprobada: "info", en_curso: "warn", terminada: "ok" };
/** Última visita por paciente: consultas cerradas/cobradas, citas atendidas e historial previo a la demostración (d.crm.visitasPrevias). */
export function mapaUltimaVisita(d) {
  const m = new Map(Object.entries((d.crm && d.crm.visitasPrevias) || {}));
  const sube = (id, f) => { const x = dia(f); if (!m.has(id) || m.get(id) < x) m.set(id, x); };
  d.consultas.forEach((c) => { if (["cerrada", "cobrada"].includes(c.estado)) sube(c.pacienteId, c.fecha); });
  d.citas.forEach((c) => { if (c.estado === "atendida") sube(c.pacienteId, c.inicio); });
  return m;
}
export const diasSinVenir = (ultimaVisita, ref = hoy()) => (ultimaVisita ? Math.max(0, diasEntre(dia(ultimaVisita), ref)) : null);
/** Inactivo: 180 días o más desde su última visita. Quien nunca ha venido no es «inactivo» (no hay visita que contar). */
export const esInactivo = (dias, umbral = PARAMS_CLINICA.diasInactivo) => dias !== null && dias !== undefined && dias >= umbral;
export function diasParaCumple(nacimiento, ref = hoy()) {
  if (!nacimiento) return null;
  const r = parse(dia(ref)), [, m, dd] = String(nacimiento).split("-").map(Number);
  let c = new Date(r.getFullYear(), m - 1, dd);
  if (c < r) c = new Date(r.getFullYear() + 1, m - 1, dd);
  return Math.round((c - r) / 86400000);
}
/** Enlace wa.me para envío MANUAL (no hay proveedor de WhatsApp conectado). null si el teléfono no tiene 10 dígitos. */
export function ligaWhatsApp(telefono, texto = "") {
  const t = String(telefono ?? "").replace(/\D/g, "").replace(/^(521|52)(?=\d{10}$)/, "");
  return t.length === 10 ? `https://wa.me/52${t}${texto ? `?text=${encodeURIComponent(texto)}` : ""}` : null;
}
export function ligaTel(telefono) {
  const t = String(telefono ?? "").replace(/\D/g, "").slice(-10);
  return t.length === 10 ? `tel:+52${t}` : null;
}
/** Sustituye {{nombre}}, {{sucursal}}, {{dias}} y {{telefono}} en el mensaje de una campaña. */
export const vistaPreviaMensaje = (mensaje, vars = {}) => String(mensaje ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
export const MENSAJES_BASE = {
  inactivos: "Hola {{nombre}}, te saludamos de Pie Clinic {{sucursal}}. Hace tiempo que no te vemos y nos gustaría saber cómo siguen tus pies. ¿Te agendamos una revisión?",
  revision_pie: "Hola {{nombre}}, en Pie Clinic {{sucursal}} tenemos pendiente tu revisión de pie diabético. Es una revisión corta y muy importante. ¿Qué día te acomoda?",
  plan_abandonado: "Hola {{nombre}}, vimos que tu tratamiento en Pie Clinic {{sucursal}} quedó a medias. Retomarlo a tiempo evita empezar de nuevo. ¿Te ayudamos a agendar?",
  cumpleanos: "¡Feliz cumpleaños, {{nombre}}! Todo el equipo de Pie Clinic {{sucursal}} te manda un abrazo.",
  garantia: "Hola {{nombre}}, ¿cómo te has sentido con tus plantillas? Te esperamos en Pie Clinic {{sucursal}} para tu revisión de ajuste sin costo.",
};
/**
 * Lista de contacto de un segmento. Cada renglón: paciente, motivo, detalle, última visita, último contacto, si ya tiene cita futura
 * y si está excluido (pidió no ser contactado). `sucursales` limita por sucursal de alta del paciente.
 */
export function listaContacto(d, { segmento = "inactivos", sucursales = null, ref = hoy(), umbral = null } = {}) {
  const P = paramsClinica(d), dias0 = umbral ?? P.diasInactivo;
  const uv = mapaUltimaVisita(d), crm = d.crm || {};
  const noContactar = new Set(crm.noContactar || []);
  const ultContacto = new Map();
  (crm.contactos || []).forEach((c) => { if (!ultContacto.has(c.pacienteId) || ultContacto.get(c.pacienteId).fecha < c.fecha) ultContacto.set(c.pacienteId, c); });
  const futura = new Set(d.citas.filter((c) => dia(c.inicio) >= ref && !["cancelada", "no_asistio", "atendida"].includes(c.estado)).map((c) => c.pacienteId));
  const motivos = new Map();
  if (segmento === "inactivos") d.pacientes.forEach((p) => { const n = diasSinVenir(uv.get(p.id), ref); if (esInactivo(n, dias0)) motivos.set(p.id, { detalle: `${n} días sin venir`, peso: n }); });
  if (segmento === "revision_pie") resumenPie(d, d.pieDiabetico || [], ref).filter((x) => x.vencida).forEach((x) => motivos.set(x.pacienteId, { detalle: `Revisión vencida desde ${x.ultima.proximaRevision}`, peso: diasEntre(x.ultima.proximaRevision, ref) }));
  if (segmento === "plan_abandonado") (d.planesTrat || []).forEach((pl) => {
    if (pl.estado === "abandonado" || planPorAbandonar(pl, ref, P.diasAbandono) || planAbandonable(pl, ref, P.diasAbandono)) motivos.set(pl.pacienteId, { detalle: `${pl.nombre}: ${diasSinActividad(pl, ref)} días sin actividad`, peso: diasSinActividad(pl, ref) });
  });
  if (segmento === "cumpleanos") d.pacientes.forEach((p) => { const n = diasParaCumple(p.nacimiento, ref); if (n !== null && n >= 0 && n < 7) motivos.set(p.id, { detalle: n === 0 ? "Cumple hoy" : `Cumple en ${n} ${n === 1 ? "día" : "días"}`, peso: 7 - n }); });
  if (segmento === "garantia") (d.plantillasOrto || []).forEach((po) => { const f = fichaPO(d, po, ref); if (f.entregada && f.revisionAjuste <= ref && diasEntre(f.revisionAjuste, ref) <= 30 && !po.ajusteRevisado) motivos.set(po.pacienteId, { detalle: `Plantilla entregada el ${f.entregada}: toca revisión de ajuste`, peso: diasEntre(f.revisionAjuste, ref) }); });
  return d.pacientes.filter((p) => motivos.has(p.id) && p.activo !== false && (!sucursales || sucursales.includes(p.sucursalAlta))).map((p) => {
    const m = motivos.get(p.id), uc = ultContacto.get(p.id) || null;
    return { id: p.id, pacienteId: p.id, nombre: `${p.nombres} ${p.apellidos}`, telefono: p.telefono, whatsapp: !!p.whatsapp, sucursalId: p.sucursalAlta, motivo: segmento, detalle: m.detalle, peso: m.peso,
      ultimaVisita: uv.get(p.id) || null, ultimoContacto: uc, tieneCita: futura.has(p.id), excluido: noContactar.has(p.id) };
  }).sort((a, b) => b.peso - a.peso);
}
export function resumenCampana(d, c) {
  const cs = ((d.crm && d.crm.contactos) || []).filter((x) => x.campanaId === c.id);
  const pacs = new Set(cs.map((x) => x.pacienteId));
  const total = (c.destinatarios || []).length;
  return { total, contactados: pacs.size, agendaron: new Set(cs.filter((x) => x.resultado === "agendo").map((x) => x.pacienteId)).size, avancePct: total ? Math.round((pacs.size / total) * 100) : 0 };
}
export const buscarTexto = (q, ...campos) => { const n = normaliza(q).trim(); return !n || normaliza(campos.join(" ")).includes(n); };
