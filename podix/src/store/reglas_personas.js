// Reglas PURAS del dominio «personas» (RH, checador, nómina, capacitación). Sin importar core.js:
// las usan la semilla (dominios/personas.js) y las acciones (acciones_personas.js) sin crear ciclos de módulos.
// Todo lo que dice «por validar con contador» es criterio de DEMOSTRACIÓN, no asesoría laboral ni fiscal.
import { hoy, sumarDias, parse, ymd, diasEntre } from "../lib/format.js";

export const ROLES_GESTION = ["gerente", "admin", "direccion"];
export const DEFAULTS_RH = {
  toleranciaMin: 10,      // minutos de tolerancia para marcar retardo (parametrizable)
  retardosPorFalta: 3,    // política interna de demostración: cada 3 retardos equivalen a 1 día de descuento (por validar)
  inicioControl: null,    // fecha desde la que hay control de asistencia ("sin registro" solo se cuenta desde aquí)
};
export const paramsRH = (d) => ({ ...DEFAULTS_RH, ...((d.rh && d.rh.params) || {}) });
export const NOMINAL = { quincenal: 15, mensual: 30 };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DIAS_SEM = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const NOMBRE_DIA = DIAS_SEM;

export const nombreSuc = (d, id) => (id === "CEN" ? "Almacén central" : ((d.sucursales || []).find((s) => s.id === id) || {}).nombre || id || "—");

// ───────── Antigüedad y vacaciones
export function antiguedad(ingreso, ref = hoy()) {
  const a = parse(ingreso), b = parse(ref);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) m--;
  m = Math.max(0, m);
  const anios = Math.floor(m / 12), meses = m % 12;
  const texto = anios ? `${anios} ${anios === 1 ? "año" : "años"}${meses ? ` ${meses} m` : ""}` : meses ? `${meses} ${meses === 1 ? "mes" : "meses"}` : "Menos de 1 mes";
  return { anios, meses, mesesTotales: m, dias: Math.max(0, diasEntre(ingreso, ref)), texto };
}

/**
 * Días de vacaciones por antigüedad — Ley Federal del Trabajo, art. 76 (reforma «vacaciones dignas», vigente desde 2023):
 * 1 año: 12 · 2: 14 · 3: 16 · 4: 18 · 5: 20 · 6 a 10: 22 · 11 a 15: 24 · 16 a 20: 26 · y así +2 cada 5 años.
 * La prima vacacional es del 25 % mínimo sobre el salario de esos días (art. 80).
 * POR VALIDAR CON CONTADOR antes de usarse en producción.
 */
export function diasVacacionesLFT(anios) {
  if (!(anios >= 1)) return 0;
  if (anios <= 5) return 10 + 2 * anios;
  return 22 + 2 * Math.floor((anios - 6) / 5);
}
export const PRIMA_VACACIONAL = 0.25;

/** Fecha del último aniversario cumplido (YYYY-MM-DD) o null si aún no cumple 1 año. */
export function ultimoAniversario(ingreso, ref = hoy()) {
  const { anios } = antiguedad(ingreso, ref);
  if (anios < 1) return null;
  const a = parse(ingreso);
  return ymd(new Date(a.getFullYear() + anios, a.getMonth(), a.getDate()));
}

/** ¿Trabaja esa fecha? (programación semanal o excepción por fecha; descanso = null). */
export function trabajaEseDia(d, empleadoId, fecha) { return sucursalHoy(d, empleadoId, fecha) != null; }

/** Días laborables (según su programación) entre dos fechas, inclusive. */
export function diasLaborables(d, empleadoId, desde, hasta) {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (trabajaEseDia(d, empleadoId, f)) n++;
  return n;
}

/** Saldo del año de servicio vigente: derecho − tomados (aprobadas) desde el último aniversario; las solicitadas se muestran aparte. */
export function saldoVacaciones(d, emp, ref = hoy()) {
  const a = antiguedad(emp.ingreso, ref);
  const aniv = ultimoAniversario(emp.ingreso, ref);
  const derecho = diasVacacionesLFT(a.anios);
  const mias = ((d.rh && d.rh.vacaciones) || []).filter((v) => v.empleadoId === emp.id);
  const tomados = aniv ? mias.filter((v) => v.estado === "aprobada" && v.desde >= aniv).reduce((s, v) => s + v.dias, 0) : 0;
  const pendientes = aniv ? mias.filter((v) => v.estado === "solicitada").reduce((s, v) => s + v.dias, 0) : 0;
  return { anios: a.anios, aniversario: aniv, derecho, tomados, pendientes, saldo: Math.max(0, derecho - tomados), disponible: Math.max(0, derecho - tomados - pendientes), prima: PRIMA_VACACIONAL };
}

// ───────── Asistencia
export function aMin(hhmm) { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); }
export const deMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Retardo: entrada posterior al horario + tolerancia (por omisión 10 min). */
export function clasificarEntrada(entrada, horarioEntrada, tolerancia = DEFAULTS_RH.toleranciaMin) {
  const tarde = aMin(entrada) - aMin(horarioEntrada);
  return tarde > tolerancia ? { estado: "retardo", minutosTarde: tarde } : { estado: "normal", minutosTarde: Math.max(0, tarde) };
}

/** Sucursal donde trabaja esa fecha (null = descanso). Excepción por fecha > programación semanal > sucursal base. */
export function sucursalHoy(d, empleadoId, fecha = hoy()) {
  const asg = (d.rh && d.rh.asignaciones) || [];
  const f = asg.find((x) => x.empleadoId === empleadoId && x.fecha === fecha);
  if (f) return f.sucursalId;
  const dow = parse(fecha).getDay();
  const w = asg.find((x) => x.empleadoId === empleadoId && x.fecha == null && x.dow === dow);
  if (w) return w.sucursalId;
  const e = ((d.rh && d.rh.empleados) || []).find((x) => x.id === empleadoId);
  return e ? e.sucursalBase : null;
}

export const estaEmpleado = (emp, fecha) => !!emp && emp.ingreso <= fecha && !(emp.bajaFecha && emp.bajaFecha < fecha);

const cubre = (x, fecha) => x.desde <= fecha && (x.hasta || x.desde) >= fecha;
/** Ausencia justificada que cubre la fecha: vacaciones aprobadas, incapacidad, permiso o falta justificada aprobados. */
export function ausenciaDe(d, empleadoId, fecha) {
  const v = ((d.rh && d.rh.vacaciones) || []).find((x) => x.empleadoId === empleadoId && x.estado === "aprobada" && cubre(x, fecha));
  if (v) return { estado: "vacaciones", ref: v };
  const i = ((d.rh && d.rh.incidencias) || []).find((x) => x.empleadoId === empleadoId && x.estado === "aprobada" && ["incapacidad", "permiso", "falta_justificada"].includes(x.tipo) && cubre(x, fecha));
  if (i) return { estado: i.tipo === "incapacidad" ? "incapacidad" : "permiso", ref: i };
  return null;
}

/**
 * Estado del empleado en una fecha. Devuelve { estado, registro, programada }.
 * estado: baja | vacaciones | incapacidad | permiso | normal | retardo | falta | descanso | pendiente (hoy, aún sin entrada) |
 *         sin_registro (día pasado con control y sin marca) | programado (futuro)
 */
export function estadoDia(d, emp, fecha, ref = hoy()) {
  const programada = sucursalHoy(d, emp.id, fecha);
  if (!estaEmpleado(emp, fecha)) return { estado: "baja", registro: null, programada: null };
  const aus = ausenciaDe(d, emp.id, fecha);
  if (aus) return { estado: aus.estado, registro: null, programada };
  const reg = ((d.rh && d.rh.asistencia) || []).find((a) => a.empleadoId === emp.id && a.fecha === fecha) || null;
  if (reg && reg.estado !== "vacaciones" && reg.estado !== "incapacidad") return { estado: reg.estado, registro: reg, programada };
  if (reg) return { estado: reg.estado, registro: reg, programada };
  if (programada == null) return { estado: "descanso", registro: null, programada };
  if (fecha > ref) return { estado: "programado", registro: null, programada };
  if (fecha === ref) return { estado: "pendiente", registro: null, programada };
  const ini = paramsRH(d).inicioControl;
  return { estado: ini && fecha >= ini ? "sin_registro" : "descanso", registro: null, programada };
}

export function resumenAsistencia(d, emp, desde, hasta, ref = hoy()) {
  const o = { normal: 0, retardo: 0, falta: 0, vacaciones: 0, incapacidad: 0, permiso: 0, sin_registro: 0, minutosTarde: 0 };
  for (let f = desde; f <= hasta && f <= ref; f = sumarDias(f, 1)) {
    const e = estadoDia(d, emp, f, ref);
    if (e.estado in o) o[e.estado]++;
    if (e.estado === "retardo" && e.registro && e.registro.minutosTarde) o.minutosTarde += e.registro.minutosTarde;
  }
  return o;
}

// ───────── Nómina (DEMOSTRACIÓN: no sustituye el timbrado CFDI de nómina; sin ISR/IMSS)
export function rangoPeriodo(tipo, mes, q = 1) {
  const [y, m] = mes.split("-").map(Number);
  const ult = new Date(y, m, 0).getDate();
  const p = (n) => String(n).padStart(2, "0");
  let desde = `${mes}-01`, hasta = `${mes}-${p(ult)}`, etiqueta = `Mes ${mes}`;
  if (tipo === "quincenal") {
    if (Number(q) === 1) { hasta = `${mes}-15`; etiqueta = `1.ª quincena ${mes}`; }
    else { desde = `${mes}-16`; etiqueta = `2.ª quincena ${mes}`; }
  }
  return { tipo, mes, q: tipo === "quincenal" ? Number(q) : null, desde, hasta, etiqueta, diasCalendario: diasEntre(desde, hasta) + 1 };
}
export const claveRecibo = (per) => `${per.tipo}|${per.mes}|${per.q || 0}`;

/** Cálculo de nómina de UN empleado en un periodo. Descuento por falta = 1 día de sueldo (sueldoMensual / 30). */
export function calcularNomina(d, emp, per, ref = hoy()) {
  const p = paramsRH(d);
  const sd = emp.sueldoMensual / 30;
  const ini = emp.ingreso > per.desde ? emp.ingreso : per.desde;
  const fin = emp.bajaFecha && emp.bajaFecha < per.hasta ? emp.bajaFecha : per.hasta;
  const overlap = ini > fin ? 0 : diasEntre(ini, fin) + 1;
  const nominal = NOMINAL[per.tipo];
  const diasPagados = overlap >= per.diasCalendario ? nominal : Math.min(nominal, overlap);
  const sueldoPeriodo = r2(sd * diasPagados);
  let faltas = 0, retardos = 0, sinRegistro = 0;
  for (let f = ini; f <= fin && f <= ref; f = sumarDias(f, 1)) {
    const e = estadoDia(d, emp, f, ref).estado;
    if (e === "falta") faltas++; else if (e === "retardo") retardos++; else if (e === "sin_registro") sinRegistro++;
  }
  const descFaltas = r2(faltas * sd);
  const descRetardos = r2(Math.floor(retardos / p.retardosPorFalta) * sd);
  const descuentos = r2(descFaltas + descRetardos);
  return { salarioDiario: r2(sd), diasPagados, sueldoPeriodo, faltas, retardos, sinRegistro, descFaltas, descRetardos, descuentos, total: Math.max(0, r2(sueldoPeriodo - descuentos)) };
}

/** Filas de nómina por sucursal (sucursalId null = todas). La sucursal de nómina es la sucursal base. */
export function nominaSucursal(d, { sucursalId = null, tipo = "quincenal", mes, q = 1 }, ref = hoy()) {
  const per = rangoPeriodo(tipo, mes, q);
  const emps = d.rh.empleados.filter((e) => (!sucursalId || e.sucursalBase === sucursalId) && e.ingreso <= per.hasta && !(e.bajaFecha && e.bajaFecha < per.desde));
  const filas = emps.map((e) => {
    const calc = calcularNomina(d, e, per, ref);
    const recibo = (d.rh.recibos || []).find((x) => x.empleadoId === e.id && claveRecibo(x.periodo) === claveRecibo(per)) || null;
    return { empleado: e, calc, recibo };
  });
  const sum = (k) => r2(filas.reduce((s, f) => s + f.calc[k], 0));
  return { periodo: per, filas, totales: { sueldo: sum("sueldoPeriodo"), descuentos: sum("descuentos"), total: sum("total"), faltas: filas.reduce((s, f) => s + f.calc.faltas, 0), retardos: filas.reduce((s, f) => s + f.calc.retardos, 0), firmados: filas.filter((f) => f.recibo && f.recibo.firmado).length } };
}

const csvCelda = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function nominaCSV(d, nom) {
  const cab = ["Empleado", "Puesto", "Sucursal base", "Sueldo mensual", "Días pagados", "Sueldo del periodo", "Faltas", "Retardos", "Desc. faltas", "Desc. retardos", "Total a pagar", "Recibo firmado"];
  const lin = nom.filas.map((f) => [f.empleado.nombre, f.empleado.puesto, nombreSuc(d, f.empleado.sucursalBase), f.empleado.sueldoMensual, f.calc.diasPagados, f.calc.sueldoPeriodo, f.calc.faltas, f.calc.retardos, f.calc.descFaltas, f.calc.descRetardos, f.calc.total, f.recibo ? (f.recibo.firmado ? "Sí" : "Pendiente") : "Sin generar"]);
  const pie = ["TOTAL", "", "", "", "", nom.totales.sueldo, nom.totales.faltas, nom.totales.retardos, "", "", nom.totales.total, ""];
  return "﻿" + [cab, ...lin, pie].map((l) => l.map(csvCelda).join(",")).join("\r\n");
}

// ───────── Expediente
export const DOCS_EXPEDIENTE = [
  { k: "acta", t: "Acta de nacimiento" }, { k: "curp", t: "CURP" }, { k: "rfc", t: "Constancia de situación fiscal (RFC)" },
  { k: "nss", t: "Número de seguridad social (NSS)" }, { k: "domicilio", t: "Comprobante de domicilio" }, { k: "ine", t: "INE vigente" },
  { k: "contrato", t: "Contrato firmado" }, { k: "cedula", t: "Cédula profesional", roles: ["podologo"] },
];
export const docsRequeridos = (emp) => DOCS_EXPEDIENTE.filter((x) => !x.roles || x.roles.includes(emp.rol));
export function avanceExpediente(emp) {
  const req = docsRequeridos(emp), ex = emp.expediente || {};
  const ok = req.filter((x) => ex[x.k] && ex[x.k].ok);
  return { entregados: ok.length, total: req.length, pct: req.length ? Math.round((ok.length / req.length) * 100) : 100, faltan: req.filter((x) => !(ex[x.k] && ex[x.k].ok)) };
}

// ───────── Finiquito de demostración (POR VALIDAR CON CONTADOR; no sustituye el cálculo legal ni el timbrado)
export function calcularFiniquito(emp, fechaBaja, d = null) {
  const sd = emp.sueldoMensual / 30;
  const a = antiguedad(emp.ingreso, fechaBaja);
  const aniv = ultimoAniversario(emp.ingreso, fechaBaja);
  const inicioAnio = aniv || emp.ingreso;
  const diasAnio = Math.max(0, diasEntre(inicioAnio, fechaBaja));
  // Vacaciones proporcionales del año de servicio en curso (derecho del año siguiente × fracción transcurrida), menos lo ya tomado.
  const derechoProx = diasVacacionesLFT(a.anios + 1) || diasVacacionesLFT(1);
  const tomados = d && aniv ? ((d.rh.vacaciones || []).filter((v) => v.empleadoId === emp.id && v.estado === "aprobada" && v.desde >= aniv).reduce((s, v) => s + v.dias, 0)) : 0;
  const vacDias = Math.max(0, r2((derechoProx * diasAnio) / 365 - tomados));
  const vacaciones = r2(vacDias * sd);
  const prima = r2(vacaciones * PRIMA_VACACIONAL);
  const inicioAnioCal = `${fechaBaja.slice(0, 4)}-01-01`;
  const desdeAg = emp.ingreso > inicioAnioCal ? emp.ingreso : inicioAnioCal;
  const aguinaldo = r2((15 * sd * Math.max(0, diasEntre(desdeAg, fechaBaja) + 1)) / 365); // 15 días mínimo (art. 87), proporcional
  return { salarioDiario: r2(sd), vacacionesDias: vacDias, vacaciones, prima, aguinaldo, total: r2(vacaciones + prima + aguinaldo), nota: "Estimación de demostración; por validar con contador. No incluye sueldo pendiente, ISR ni indemnizaciones." };
}

// ───────── YouTube y capacitación
const ID_YT = /^[A-Za-z0-9_-]{11}$/;
/** Extrae el id de un enlace de YouTube: watch?v=, youtu.be/, embed/, shorts/, live/. Devuelve null si no es válido (nunca inventa ids). */
export function extraerIdYoutube(entrada) {
  const s = String(entrada ?? "").trim();
  if (!s) return null;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  const h = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parte = (i) => u.pathname.split("/").filter(Boolean)[i];
  let id = null;
  if (h === "youtu.be") id = parte(0);
  else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    const p0 = parte(0);
    if (p0 === "watch") id = u.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(p0)) id = parte(1);
  }
  return id && ID_YT.test(id) ? id : null;
}
export const urlEmbedYoutube = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;

export const esPersonalNuevo = (emp, ref = hoy(), dias = 60) => !!emp && emp.estado === "activo" && diasEntre(emp.ingreso, ref) <= dias;

export function aplicaCurso(d, curso, u) {
  if (!u) return null;
  const a = curso.asignado || {};
  if ((a.roles || []).includes(u.rol)) return "obligatorio";
  if ((a.personas || []).includes(u.id)) return "asignado";
  if (a.nuevos) { const e = d.rh.empleados.find((x) => x.usuarioId === u.id); if (esPersonalNuevo(e)) return "nuevo"; }
  return null;
}
export const avanceDe = (d, usuarioId, cursoId) => ((d.cap && d.cap.avance) || []).find((a) => a.usuarioId === usuarioId && a.cursoId === cursoId) || null;

export function progresoCurso(d, usuarioId, curso) {
  const av = avanceDe(d, usuarioId, curso.id);
  const ids = curso.lecciones.map((l) => l.id);
  const vistas = av ? av.vistas.filter((x) => ids.includes(x)) : [];
  const total = ids.length;
  const tieneEval = !!(curso.evaluacion && curso.evaluacion.preguntas && curso.evaluacion.preguntas.length);
  const aprobado = !!(av && av.aprobado);
  const lecc = vistas.length === total && total > 0;
  const completo = lecc && (!tieneEval || aprobado);
  const unidades = total + (tieneEval ? 1 : 0);
  const hechas = vistas.length + (tieneEval && aprobado ? 1 : 0);
  return { vistas: vistas.length, total, pendientes: curso.lecciones.filter((l) => !vistas.includes(l.id)), pct: unidades ? Math.round((hechas / unidades) * 100) : 0, leccionesCompletas: lecc, tieneEval, aprobado, completo, ultimaCalif: av && av.evaluaciones && av.evaluaciones.length ? av.evaluaciones[av.evaluaciones.length - 1].calif : null, completado: av ? av.completado : null, constancia: av ? av.constancia : null };
}

/** Califica una evaluación: respuestas = índices elegidos. calif 0–100; aprobado si ≥ mínimo del curso. */
export function calificarEvaluacion(curso, respuestas) {
  const ps = (curso.evaluacion && curso.evaluacion.preguntas) || [];
  if (!ps.length) return null;
  const correctas = ps.filter((p, i) => Number(respuestas[i]) === p.correcta).length;
  const calif = Math.round((correctas / ps.length) * 100);
  return { correctas, total: ps.length, calif, minimo: curso.evaluacion.minimo, aprobado: calif >= curso.evaluacion.minimo };
}

/** Cursos que le tocan a un usuario (publicados), con el motivo; el resto queda como «opcional». */
export function cursosDeUsuario(d, u) {
  const pub = ((d.cap && d.cap.cursos) || []).filter((c) => c.estado === "publicado");
  const orden = { obligatorio: 0, nuevo: 1, asignado: 2, opcional: 3 };
  return pub.map((c) => ({ curso: c, motivo: aplicaCurso(d, c, u) || "opcional", prog: progresoCurso(d, u.id, c) })).sort((a, b) => orden[a.motivo] - orden[b.motivo] || Number(a.prog.completo) - Number(b.prog.completo));
}

/** Avance por persona de un curso (solo a quien le aplica), opcionalmente de una sucursal. */
export function avancePorPersona(d, curso, sucursalId = null) {
  return d.rh.empleados
    .filter((e) => e.estado === "activo" && e.usuarioId && (!sucursalId || e.sucursales.includes(sucursalId)))
    .map((e) => ({ e, u: d.usuarios.find((x) => x.id === e.usuarioId) }))
    .filter((x) => x.u && aplicaCurso(d, curso, x.u))
    .map(({ e, u }) => { const prog = progresoCurso(d, u.id, curso); return { empleado: e, motivo: aplicaCurso(d, curso, u), prog, estado: prog.completo ? "completo" : prog.vistas || prog.aprobado ? "en_curso" : "sin_iniciar" }; });
}

// ───────── Acervo
export function acervoVisible(d, u, sucursalId, { q = "", categoria = "todas", etiqueta = "", tipo = "todos", archivados = false } = {}) {
  const gestor = ROLES_GESTION.includes(u && u.rol);
  const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qq = n(q);
  return ((d.cap && d.cap.acervo) || []).filter((a) => {
    if (archivados) { if (!(gestor && a.estado === "archivado")) return false; } else if (a.estado === "archivado") return false;
    if (!gestor) {
      if (a.sucursalId && a.sucursalId !== sucursalId) return false;
      if (a.roles && a.roles.length && !a.roles.includes(u.rol)) return false;
    }
    if (categoria !== "todas" && a.categoria !== categoria) return false;
    if (tipo !== "todos" && a.tipo !== tipo) return false;
    if (etiqueta && !(a.etiquetas || []).includes(etiqueta)) return false;
    if (qq && !n(`${a.titulo} ${a.descripcion} ${(a.etiquetas || []).join(" ")} ${a.contenido || ""}`).includes(qq)) return false;
    return true;
  });
}
