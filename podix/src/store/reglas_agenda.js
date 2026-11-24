// Reglas PURAS del dominio «agenda» (porte de Pie Firme: src/lib/comercial/agenda.js + anticipo.js). Sin core.js ni React:
// las usan la semilla, las acciones, las pantallas y las pruebas.
//   P-034 anticipo 30 % en reserva del portal · P-036 retención de horario 10 min · P-038 reprogramar 2 veces con ≥ 48 h
//   P-039 recordatorio 24 h antes · P-041 lista de espera (ventana 30 min, vence a 14 días) · P-042 sobrecupo máx. 1 por podólogo y día
//   P-043 margen de 10 min entre citas · P-045 tolerancia de 15 min para «No asistió» · P-047 horarios, bloqueos y festivos
// Fechas: texto local "YYYY-MM-DD" y "YYYY-MM-DDTHH:mm" (igual que el resto del sistema).
import { parse, dia, hora, sumarDias, diasEntre, ymd, ahoraLocal } from "../lib/format.js";

// ═════════════════════════ Parámetros
export const PARAMS_AGENDA = {
  margenMin: 10,               // P-043
  sobrecupoMaxDia: 1,          // P-042
  toleranciaNoAsistioMin: 15,  // P-045
  esperaVentanaMin: 30,        // P-041
  esperaVenceDias: 14,         // P-041
  recordatorioHorasAntes: 24,  // P-039
  anticipoPortalPct: 30,       // P-034
  retencionMin: 10,            // P-036
  reprogMax: 2,                // P-038
  reprogHorasAviso: 48,        // P-038
  pasoMin: 30,                 // franja con que se ofrecen horarios
};
export const ETIQUETA_PARAM = {
  margenMin: ["Margen entre citas (min)", "P-043"], sobrecupoMaxDia: ["Sobrecupos por podólogo y día", "P-042"],
  toleranciaNoAsistioMin: ["Tolerancia para «No asistió» (min)", "P-045"], esperaVentanaMin: ["Lista de espera: ventana para confirmar (min)", "P-041"],
  esperaVenceDias: ["Lista de espera: vence a los (días)", "P-041"], recordatorioHorasAntes: ["Recordatorio: horas antes de la cita", "P-039"],
  anticipoPortalPct: ["Anticipo en reserva en línea (%)", "P-034"], retencionMin: ["Retención de horario mientras se paga (min)", "P-036"],
  reprogMax: ["Reprogramaciones sin costo por cita", "P-038"], reprogHorasAviso: ["Aviso mínimo para reprogramar (h)", "P-038"], pasoMin: ["Franja de la agenda (min)", "P-043"],
};
export const paramsAgenda = (d) => ({ ...PARAMS_AGENDA, ...((d && d.agenda && d.agenda.params) || {}) });

// ═════════════════════════ Tiempo
const pad = (n) => String(n).padStart(2, "0");
export const aMin = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const aHora = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
/** Minutos absolutos de un "YYYY-MM-DDTHH:mm" (o "YYYY-MM-DD"). */
export const abs = (s) => Math.round(parse(s).getTime() / 60000);
export const masMin = (s, min) => ahoraLocal(new Date(parse(s).getTime() + min * 60000));
export const diaSemana = (fecha) => parse(dia(fecha)).getDay(); // 0 = domingo
export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
/** Lunes de la semana de una fecha y sus 7 días. */
export function semanaDe(fecha) {
  const k = diaSemana(fecha);
  const lunes = sumarDias(dia(fecha), k === 0 ? -6 : 1 - k);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

export const INACTIVAS = ["cancelada", "no_asistio"];
/** Cita que ocupa agenda (ni cancelada ni «no asistió»). */
export const ocupaAgenda = (c) => !INACTIVAS.includes(c.estado);
const PENDIENTES = ["agendada", "por_confirmar", "confirmada"];
export const esPendiente = (c) => PENDIENTES.includes(c.estado);

// ═════════════════════════ Festivos (P-047)
function nLunes(anio, mes, n) {
  const x = new Date(anio, mes - 1, 1);
  const corr = (8 - x.getDay()) % 7; // días hasta el primer lunes
  return `${anio}-${pad(mes)}-${pad(1 + corr + (n - 1) * 7)}`;
}
function primerDomingo(anio, mes) { const x = new Date(anio, mes - 1, 1); return `${anio}-${pad(mes)}-${pad(1 + ((7 - x.getDay()) % 7))}`; }
/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function pascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), di = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${pad(mes)}-${pad(di)}`;
}
/**
 * Días de descanso obligatorio en México (art. 74 de la Ley Federal del Trabajo) de un año, más los de costumbre (no oficiales).
 * → [{ fecha, nombre, oficial }]
 */
export function festivosMexico(anio) {
  const f = [
    [`${anio}-01-01`, "Año Nuevo", true],
    [nLunes(anio, 2, 1), "Día de la Constitución (primer lunes de febrero)", true],
    [nLunes(anio, 3, 3), "Natalicio de Benito Juárez (tercer lunes de marzo)", true],
    [sumarDias(pascua(anio), -3), "Jueves Santo (costumbre, no oficial)", false],
    [sumarDias(pascua(anio), -2), "Viernes Santo (costumbre, no oficial)", false],
    [`${anio}-05-01`, "Día del Trabajo", true],
    [`${anio}-09-16`, "Día de la Independencia", true],
    [`${anio}-11-02`, "Día de Muertos (costumbre, no oficial)", false],
    [nLunes(anio, 11, 3), "Día de la Revolución (tercer lunes de noviembre)", true],
    [`${anio}-12-12`, "Día de la Virgen de Guadalupe (costumbre, no oficial)", false],
    [`${anio}-12-25`, "Navidad", true],
  ];
  if ((anio - 2024) % 6 === 0) f.push([`${anio}-10-01`, "Transmisión del Poder Ejecutivo Federal", true]);
  if ((anio - 2024) % 3 === 0) f.push([primerDomingo(anio, 6), "Jornada electoral federal", true]);
  return f.map(([fecha, nombre, oficial]) => ({ fecha, nombre, oficial })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
/** Festivo que aplica a una sucursal en una fecha (el de la sucursal manda sobre el general). */
export function festivoDe(d, fecha, sucursalId = null) {
  const l = ((d.agenda && d.agenda.festivos) || []).filter((f) => f.fecha === dia(fecha) && (!f.sucursalId || f.sucursalId === sucursalId));
  return l.find((f) => f.sucursalId) || l[0] || null;
}

// ═════════════════════════ Horarios (P-047)
const HORARIO_DEFECTO = { abre: "09:00", cierra: "18:00" };
/** Horario de la sucursal un día (sin considerar festivos): { abre, cierra } en minutos, o null si no abre. */
export function horarioSucursal(d, sucursalId, fecha) {
  const lista = (d.agenda && d.agenda.horariosSucursal) || null;
  if (!lista) return { abre: aMin(HORARIO_DEFECTO.abre), cierra: aMin(HORARIO_DEFECTO.cierra) };
  const h = lista.find((x) => x.sucursalId === sucursalId && x.dia === diaSemana(fecha));
  if (!h || h.cerrado) return null;
  return { abre: aMin(h.abre), cierra: aMin(h.cierra) };
}
/** Sucursal donde atiende el podólogo ese día según su rotación; null = sin rotación definida (cualquiera de las suyas). */
export function sucursalDelPodologo(d, podologoId, fecha) {
  const r = ((d.agenda && d.agenda.rotacion) || []).find((x) => x.podologoId === podologoId);
  if (!r) return null;
  if (r.modo === "fija") return (r.porDia && r.porDia[diaSemana(fecha)]) || null;
  if (!r.sucursales || !r.sucursales.length) return null;
  const n = diasEntre(r.ancla, dia(fecha)), k = r.sucursales.length;
  return r.sucursales[((n % k) + k) % k];
}
/**
 * Jornada del podólogo en una fecha: { sucursalId|null, turnos:[{de,a}] (minutos), descanso }.
 * Sin horario capturado usa el de la sucursal (podólogo recién dado de alta).
 */
export function jornadaPodologo(d, podologoId, fecha, sucursalRef = null) {
  const sucursalId = sucursalDelPodologo(d, podologoId, fecha);
  const lista = (d.agenda && d.agenda.horariosPodologo) || [];
  const h = lista.find((x) => x.podologoId === podologoId && x.dia === diaSemana(fecha));
  if (!h) {
    const u = d.usuarios.find((x) => x.id === podologoId);
    const hs = horarioSucursal(d, sucursalId || sucursalRef || (u && u.sucursales[0]) || null, fecha);
    return { sucursalId, turnos: hs ? [{ de: hs.abre, a: hs.cierra }] : [], descanso: !hs, sinHorario: true };
  }
  if (h.descanso) return { sucursalId, turnos: [], descanso: true };
  return { sucursalId, turnos: (h.turnos || []).map((t) => ({ de: aMin(t.de), a: aMin(t.a) })).filter((t) => t.a > t.de).sort((a, b) => a.de - b.de), descanso: false };
}

// ═════════════════════════ Bloqueos (P-047)
export const TIPOS_BLOQUEO = { vacaciones: "Vacaciones", junta: "Junta", mantenimiento: "Mantenimiento", capacitacion: "Capacitación", permiso: "Permiso", otro: "Otro" };
export const AMBITOS = { sucursal: "Toda la sucursal", podologo: "Un podólogo", consultorio: "Un consultorio" };
export const ESTADOS_BLOQUEO = { solicitado: ["Solicitado", "warn"], autorizado: ["Autorizado", "ok"], rechazado: ["Rechazado", "bad"], cancelado: ["Cancelado", "neutral"] };
const tocaBloqueo = (b, c) =>
  (b.ambito === "sucursal" && b.sucursalId === c.sucursalId) ||
  (b.ambito === "podologo" && !!b.podologoId && b.podologoId === c.podologoId) ||
  (b.ambito === "consultorio" && b.sucursalId === c.sucursalId && !!b.consultorioId && b.consultorioId === c.consultorioId);
/** Bloqueos AUTORIZADOS que tocan a una cita (o candidata). */
export function bloqueosQueAfectan(d, c) {
  const a1 = abs(c.inicio), a2 = a1 + Number(c.duracion || 30);
  return ((d.agenda && d.agenda.bloqueos) || []).filter((b) => b.estado === "autorizado" && tocaBloqueo(b, c) && a1 < abs(b.fin) && abs(b.inicio) < a2);
}
/** Citas pendientes que un bloqueo (aunque aún esté solicitado) dejaría sin horario: hay que reprogramarlas. */
export function citasAfectadasPorBloqueo(d, b) {
  const b1 = abs(b.inicio), b2 = abs(b.fin);
  return d.citas.filter((c) => esPendiente(c) && tocaBloqueo(b, c) && abs(c.inicio) < b2 && b1 < abs(c.inicio) + Number(c.duracion || 30)).sort((x, y) => x.inicio.localeCompare(y.inicio));
}
export function etiquetaBloqueo(d, b) {
  const suc = d.sucursales.find((s) => s.id === b.sucursalId);
  const pod = d.usuarios.find((u) => u.id === b.podologoId);
  const quien = b.ambito === "podologo" ? (pod ? pod.nombre : "Podólogo") : b.ambito === "consultorio" ? `Consultorio ${b.consultorioId} · ${suc ? suc.nombre : ""}` : `Sucursal ${suc ? suc.nombre : ""}`;
  return `${TIPOS_BLOQUEO[b.tipo] || b.tipo} · ${quien}`;
}

// ═════════════════════════ Retención de horario (P-036)
export const retencionVigente = (ret, ahora, minutos = PARAMS_AGENDA.retencionMin) => !!ret && !ret.liberada && abs(ahora) < abs(ret.creadaEn) + minutos;

// ═════════════════════════ Validación de una cita (P-037, P-042, P-043, P-047)
function validarCon(d, cita, opts, citasDia) {
  const P = paramsAgenda(d);
  const { existente = false, ahora = null, ignorarIds = [] } = opts;
  const sobrecupo = opts.sobrecupo ?? !!cita.sobrecupo;
  const errores = [], avisos = [];
  const E = (codigo, texto) => errores.push({ codigo, texto });
  const A = (codigo, texto) => avisos.push({ codigo, texto });
  const fecha = dia(cita.inicio), ini = aMin(hora(cita.inicio)), dur = Number(cita.duracion) || 30, fin = ini + dur;
  const nomSuc = (id) => (d.sucursales.find((s) => s.id === id) || {}).nombre || id;

  if (!existente && ahora && abs(cita.inicio) < abs(ahora)) E("pasado", "No se puede agendar en el pasado.");

  const fest = festivoDe(d, fecha, cita.sucursalId);
  if (fest && !fest.abre) E("festivo", `Día festivo: ${fest.nombre}. La sucursal no abre.`);
  else if (fest) A("festivo_abre", `Día festivo (${fest.nombre}): la sucursal sí abre.`);

  const hs = horarioSucursal(d, cita.sucursalId, fecha);
  if (!hs) E("sucursal_cerrada", `${nomSuc(cita.sucursalId)} no abre los ${DIAS[diaSemana(fecha)].toLowerCase()}.`);
  else if (ini < hs.abre || fin > hs.cierra) E("fuera_horario_sucursal", `Fuera del horario de ${nomSuc(cita.sucursalId)} (${aHora(hs.abre)}–${aHora(hs.cierra)}).`);

  if (cita.podologoId) {
    const j = jornadaPodologo(d, cita.podologoId, fecha, cita.sucursalId);
    if (j.descanso) E("podologo_descansa", "El podólogo no atiende ese día.");
    else if (j.sucursalId && j.sucursalId !== cita.sucursalId) E("podologo_otra_sucursal", `Ese día el podólogo atiende en ${nomSuc(j.sucursalId)}.`);
    else if (!j.turnos.some((t) => ini >= t.de && fin <= t.a)) E("fuera_horario_podologo", `Fuera del horario del podólogo (${j.turnos.map((t) => `${aHora(t.de)}–${aHora(t.a)}`).join(" y ")}).`);
  }

  for (const b of bloqueosQueAfectan(d, { ...cita, duracion: dur })) E("bloqueo", `Horario bloqueado: ${etiquetaBloqueo(d, b)}${b.motivo ? ` (${b.motivo})` : ""}.`);

  if (!existente && ahora && cita.podologoId) {
    const a1 = abs(cita.inicio), a2 = a1 + dur;
    const ret = ((d.agenda && d.agenda.retenciones) || []).find((r) => r.id !== opts.retencionId && r.podologoId === cita.podologoId && retencionVigente(r, ahora, P.retencionMin) && a1 < abs(r.inicio) + r.duracion && abs(r.inicio) < a2);
    if (ret) E("retenido", `Horario retenido ${P.retencionMin} min por una reserva en línea que está pagando su anticipo.`);
  }

  const m = P.margenMin;
  const ign = new Set([...ignorarIds, cita.id].filter(Boolean));
  let empalmePod = false;
  for (const c of citasDia) {
    if (ign.has(c.id) || !ocupaAgenda(c)) continue;
    const b1 = aMin(hora(c.inicio)), b2 = b1 + Number(c.duracion || 30);
    const traslapa = ini < b2 && b1 < fin;
    const cerca = !traslapa && ini < b2 + m && b1 < fin + m;
    if (!traslapa && !cerca) continue;
    if (cita.podologoId && c.podologoId === cita.podologoId) {
      if (traslapa) { empalmePod = true; if (!sobrecupo) E("empalme", `El podólogo ya tiene cita a las ${hora(c.inicio)}. Solo cabe como sobrecupo autorizado por Administración (P-042).`); }
      else if (existente || sobrecupo) A("margen", `Menos de ${m} min de margen con la cita de las ${hora(c.inicio)}.`);
      else E("margen", `Falta el margen de ${m} min con la cita de las ${hora(c.inicio)} (P-043).`);
    }
    if (cita.consultorioId && c.consultorioId === cita.consultorioId && c.sucursalId === cita.sucursalId && c.podologoId !== cita.podologoId) {
      if (traslapa) E("empalme_consultorio", `El consultorio ${cita.consultorioId} está ocupado a las ${hora(c.inicio)}.`);
      else if (existente) A("margen_consultorio", `Menos de ${m} min de margen en el consultorio ${cita.consultorioId}.`);
      else E("margen_consultorio", `Falta el margen de ${m} min en el consultorio ${cita.consultorioId} (P-043).`);
    }
    if (traslapa && cita.pacienteId && c.pacienteId === cita.pacienteId && c.podologoId !== cita.podologoId) {
      if (existente) A("empalme_paciente", `El paciente tiene otra cita a las ${hora(c.inicio)}.`);
      else E("empalme_paciente", `El paciente ya tiene otra cita a las ${hora(c.inicio)}.`);
    }
  }
  if (sobrecupo) {
    if (!empalmePod && !existente) A("sobrecupo_innecesario", "El horario está libre: no hace falta sobrecupo.");
    const usados = citasDia.filter((c) => !ign.has(c.id) && c.sobrecupo && ocupaAgenda(c) && c.podologoId === cita.podologoId).length;
    if (usados >= P.sobrecupoMaxDia) E("sobrecupo_max", `El podólogo ya tiene ${usados} sobrecupo(s) ese día (máximo ${P.sobrecupoMaxDia}, P-042).`);
    if (!existente && !(opts.autorizadoPor || cita.sobrecupoAutorizadoPor)) E("sobrecupo_sin_autorizacion", "El sobrecupo debe autorizarlo Administración (P-042).");
  }
  return { ok: errores.length === 0, errores, avisos, textos: errores.map((e) => e.texto) };
}
/**
 * Valida una cita { sucursalId, podologoId, consultorioId?, pacienteId?, inicio:"YYYY-MM-DDTHH:mm", duracion, sobrecupo? } contra
 * festivos, horario de la sucursal, jornada y rotación del podólogo, bloqueos autorizados, empalmes, margen y sobrecupo.
 *   opts: { existente (cita ya agendada: el margen y el empalme del paciente pasan a ser avisos), ahora, ignorarIds, sobrecupo, autorizadoPor }
 *   → { ok, errores:[{codigo, texto}], avisos:[{codigo, texto}], textos:[…] }
 */
export function validarCita(d, cita, opts = {}) {
  const fecha = dia(cita.inicio);
  return validarCon(d, cita, opts, d.citas.filter((c) => dia(c.inicio) === fecha));
}
export const podologosDe = (d, sucursalId) => d.usuarios.filter((u) => u.rol === "podologo" && u.activo !== false && (!sucursalId || u.sucursales.includes(sucursalId)));

/**
 * Huecos disponibles de un día: respetan horarios, rotación, festivos, bloqueos, margen entre citas y consultorio libre.
 *   huecosDisponibles(d, { sucursalId, podologoId|null (null = todos los que atienden ahí ese día), fecha, duracion, pacienteId?, ahora?, pasoMin?, ignorarIds? })
 *   → [{ hora, inicio, fin, podologoId, consultorioId, sucursalId, duracion }] ordenados por hora.
 */
export function huecosDisponibles(d, { sucursalId, podologoId = null, fecha, duracion = 30, pacienteId = null, ahora = null, pasoMin = null, ignorarIds = [] }) {
  const P = paramsAgenda(d);
  const paso = pasoMin || P.pasoMin, dur = Number(duracion) || 30;
  const fest = festivoDe(d, fecha, sucursalId);
  if (fest && !fest.abre) return [];
  const hs = horarioSucursal(d, sucursalId, fecha);
  const suc = d.sucursales.find((s) => s.id === sucursalId);
  if (!hs || !suc) return [];
  const citasDia = d.citas.filter((c) => dia(c.inicio) === fecha);
  const pods = podologoId ? [podologoId] : podologosDe(d, sucursalId).map((u) => u.id);
  const out = [];
  for (const pid of pods) {
    const j = jornadaPodologo(d, pid, fecha, sucursalId);
    if (j.descanso || (j.sucursalId && j.sucursalId !== sucursalId)) continue;
    for (const t of j.turnos) {
      for (let mm = Math.max(t.de, hs.abre); mm + dur <= Math.min(t.a, hs.cierra); mm += paso) {
        const inicio = `${fecha}T${aHora(mm)}`;
        if (ahora && abs(inicio) < abs(ahora)) continue;
        const base = { sucursalId, podologoId: pid, pacienteId, inicio, duracion: dur };
        if (!validarCon(d, base, { ahora, ignorarIds }, citasDia).ok) continue;
        const cons = (suc.consultorios || ["C1"]).find((cn) => validarCon(d, { ...base, consultorioId: cn }, { ahora, ignorarIds }, citasDia).ok);
        if (cons) out.push({ hora: aHora(mm), inicio, fin: aHora(mm + dur), podologoId: pid, consultorioId: cons, sucursalId, duracion: dur });
      }
    }
  }
  return out.sort((a, b) => a.hora.localeCompare(b.hora) || a.podologoId.localeCompare(b.podologoId));
}

/** Sobrecupo disponible para el podólogo ese día (P-042). */
export function sobrecupoDisponible(d, podologoId, fecha) {
  const usados = d.citas.filter((c) => dia(c.inicio) === dia(fecha) && c.podologoId === podologoId && c.sobrecupo && ocupaAgenda(c)).length;
  return usados < paramsAgenda(d).sobrecupoMaxDia;
}

// ═════════════════════════ «No asistió» (P-045)
/** ¿Ya se puede marcar «No asistió»? Solo citas pendientes y pasada la tolerancia. → { ok, error?, faltanMin } */
export function puedeMarcarNoAsistio(d, cita, ahora = ahoraLocal()) {
  const tol = paramsAgenda(d).toleranciaNoAsistioMin;
  if (!cita || !esPendiente(cita)) return { ok: false, error: "Solo se marca «No asistió» en citas agendadas o confirmadas.", faltanMin: 0 };
  const faltan = abs(cita.inicio) + tol - abs(ahora);
  if (faltan > 0) return { ok: false, error: `Aún corre la tolerancia de ${tol} min: faltan ${faltan} min.`, faltanMin: faltan };
  return { ok: true, faltanMin: 0 };
}
export const posibleNoAsistio = (d, cita, ahora = ahoraLocal()) => puedeMarcarNoAsistio(d, cita, ahora).ok;

// ═════════════════════════ Reglas de reserva del portal (P-034, P-036, P-038)
/** Anticipo de una reserva en línea: 30 % del precio (o monto fijo del servicio); $0, «a valorar» y curaciones incluidas no piden anticipo. */
export function anticipoReserva(precio, servicio = null, pct = PARAMS_AGENDA.anticipoPortalPct) {
  const p = Number(precio) || 0;
  if (p <= 0 || (servicio && (servicio.aValorar || servicio.curacionIncluida))) return 0;
  const base = servicio && servicio.anticipoFijo != null ? Number(servicio.anticipoFijo) : Math.round(p * pct) / 100;
  return Math.min(base, p);
}
/** ¿Se puede reprogramar sin costo? Menos de N reprogramaciones y ≥ 48 h de aviso; si no, cuenta como cancelación. */
export function puedeReprogramar({ inicio, ahora = ahoraLocal(), reprogramaciones = 0, max = PARAMS_AGENDA.reprogMax, horasAviso = PARAMS_AGENDA.reprogHorasAviso }) {
  const horas = (abs(inicio) - abs(ahora)) / 60;
  if (horas < horasAviso) return { permitido: false, motivo: `Con menos de ${horasAviso} h de aviso cuenta como cancelación`, horas };
  if (reprogramaciones >= max) return { permitido: false, motivo: `Ya se reprogramó ${max} veces sin costo`, horas };
  return { permitido: true, motivo: null, horas, restantes: max - reprogramaciones };
}
/** Reprogramaciones que lleva una cita (las pantallas de recepción guardan `historialReprog`). */
export const reprogramacionesDe = (cita) => (cita.reprogramaciones ?? (cita.historialReprog ? cita.historialReprog.length : 0));

// ═════════════════════════ Lista de espera (P-041)
export const PRIORIDADES = { alta: ["Alta", "bad"], media: ["Media", "warn"], baja: ["Baja", "neutral"] };
export const FRANJAS = { cualquiera: "Cualquier horario", manana: "Mañana (antes de 13:00)", tarde: "Tarde (13:00 en adelante)" };
export const ORIGENES_ESPERA = { llamada: "Llamada", mostrador: "Mostrador", whatsapp: "WhatsApp", portal: "Portal", referido: "Referido" };
export const ESTADOS_ESPERA = { esperando: ["En espera", "warn"], notificado: ["Notificado", "info"], sin_respuesta: ["Sin respuesta", "bad"], vencida: ["Vencida", "neutral"], agendado: ["Agendado", "ok"], quitado: ["Quitado", "neutral"] };
const PESO = { alta: 0, media: 1, baja: 2 };
export const venceEspera = (e, dias = PARAMS_AGENDA.esperaVenceDias) => e.vence || sumarDias(e.creado, dias);
/** Estado vigente de una entrada: la ventana de 30 min y el vencimiento a 14 días se calculan contra el reloj. */
export function estadoEspera(e, ahora = ahoraLocal(), P = PARAMS_AGENDA) {
  if (e.estado === "agendado" || e.estado === "quitado" || e.estado === "vencida") return e.estado;
  if (e.estado === "notificado" && e.notificadoHasta) return abs(ahora) > abs(e.notificadoHasta) ? "sin_respuesta" : "notificado";
  if (dia(ahora) > venceEspera(e, P.esperaVenceDias)) return "vencida";
  return "esperando";
}
/** Minutos que quedan de la ventana de confirmación (0 si ya venció). */
export const minutosVentana = (e, ahora = ahoraLocal()) => (e.notificadoHasta ? Math.max(0, abs(e.notificadoHasta) - abs(ahora)) : 0);
/** Orden de la lista: prioridad clínica antes que antigüedad. */
export const ordenarEspera = (lista) => [...lista].sort((a, b) => (PESO[a.prioridad || "media"] - PESO[b.prioridad || "media"]) || String(a.creadoEn || a.creado).localeCompare(String(b.creadoEn || b.creado)));
export const coincideFranja = (preferencia, hhmm) => (preferencia === "manana" ? hhmm < "13:00" : preferencia === "tarde" ? hhmm >= "13:00" : true);
const claveHueco = (h) => `${h.podologoId}|${h.inicio}`;
/**
 * Candidatos de la lista de espera para un hueco { sucursalId, podologoId, inicio, duracion, consultorioId? }:
 * misma sucursal, podólogo preferido (o cualquiera), franja, el servicio cabe y pasa la validación; en orden de prioridad.
 * No repite a quien ya se le avisó de ese mismo hueco.
 */
export function candidatosParaHueco(d, hueco, ahora = ahoraLocal()) {
  const P = paramsAgenda(d);
  const out = [];
  for (const e of ordenarEspera(d.listaEspera || [])) {
    if (estadoEspera(e, ahora, P) !== "esperando" || e.sucursalId !== hueco.sucursalId) continue;
    if (e.podologoId && e.podologoId !== hueco.podologoId) continue;
    if (!coincideFranja(e.preferencia, hora(hueco.inicio))) continue;
    if ((e.avisos || []).some((a) => a.hueco === claveHueco(hueco))) continue;
    const sv = d.servicios.find((s) => s.id === e.servicioId);
    const dur = sv ? sv.duracion : 30;
    if (hueco.duracion && dur > hueco.duracion) continue;
    const v = validarCita(d, { sucursalId: hueco.sucursalId, podologoId: hueco.podologoId, consultorioId: hueco.consultorioId || null, pacienteId: e.pacienteId, inicio: hueco.inicio, duracion: dur }, { ahora });
    if (v.ok) out.push(e);
  }
  return out;
}
/**
 * Huecos liberados a futuro: citas canceladas cuyo horario sigue libre, más los registrados a mano (d.agenda.huecosLiberados).
 * → [{ id, sucursalId, podologoId, consultorioId, inicio, duracion, origen, candidatos:[entradas] }]
 */
export function huecosLiberados(d, { sucursalId = null, ahora = ahoraLocal() } = {}) {
  const vistos = new Set(), out = [];
  const meter = (h) => {
    if (sucursalId && h.sucursalId !== sucursalId) return;
    if (abs(h.inicio) <= abs(ahora) || vistos.has(claveHueco(h))) return;
    const libre = validarCita(d, { sucursalId: h.sucursalId, podologoId: h.podologoId, inicio: h.inicio, duracion: h.duracion }, { ahora });
    if (!libre.ok) return;
    vistos.add(claveHueco(h));
    out.push({ ...h, candidatos: candidatosParaHueco(d, h, ahora) });
  };
  for (const c of d.citas) if (c.estado === "cancelada" && abs(c.inicio) > abs(ahora)) meter({ id: `H-${c.id}`, sucursalId: c.sucursalId, podologoId: c.podologoId, consultorioId: null, inicio: c.inicio, duracion: Number(c.duracion) || 30, origen: "Cancelación" });
  for (const h of (d.agenda && d.agenda.huecosLiberados) || []) meter({ ...h, consultorioId: null });
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// ═════════════════════════ Recordatorios (P-039)
export const ESTADOS_RECORDATORIO = { pendiente: ["Por enviar", "warn"], enviado: ["Enviado", "info"], confirmo: ["Confirmó", "ok"], reprogramo: ["Reprogramó", "neutral"], sin_respuesta: ["Sin respuesta", "bad"], cancelo: ["Canceló", "bad"] };
export const PLANTILLA_RECORDATORIO = "Hola {nombre}, te recordamos tu cita de {servicio} el {fecha} a las {hora} en Pie Clinic {sucursal} con {podologo}. Responde 1 para CONFIRMAR o 2 para REPROGRAMAR. ¡Te esperamos!";
export const PLANTILLA_ESPERA = "Hola {nombre}, se liberó un horario para {servicio} el {fecha} a las {hora} en Pie Clinic {sucursal}. Responde en los próximos {minutos} minutos para apartarlo.";
export const VARIABLES_PLANTILLA = ["nombre", "servicio", "fecha", "hora", "sucursal", "podologo", "minutos"];
export const redactar = (plantilla, datos) => String(plantilla || "").replace(/\{(\w+)\}/g, (_, k) => (datos[k] != null ? String(datos[k]) : `{${k}}`));
const DSEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const fechaHablada = (s) => { const x = parse(dia(s)); return `${DSEM[x.getDay()]} ${x.getDate()} de ${MES[x.getMonth()]}`; };
/** Momento en que toca el recordatorio (24 h antes) y si ya toca enviarlo. */
export const programadoPara = (cita, horas = PARAMS_AGENDA.recordatorioHorasAntes) => masMin(cita.inicio, -horas * 60);
export function tocaRecordar(cita, ahora = ahoraLocal(), horas = PARAMS_AGENDA.recordatorioHorasAntes) {
  return esPendiente(cita) && abs(ahora) >= abs(cita.inicio) - horas * 60 && abs(ahora) < abs(cita.inicio);
}
export const recordatorioDe = (d, citaId) => ((d.agenda && d.agenda.recordatorios) || []).find((r) => r.citaId === citaId) || null;
/** Texto del recordatorio de una cita con la plantilla vigente. */
export function textoRecordatorio(d, cita) {
  const pac = d.pacientes.find((p) => p.id === cita.pacienteId), sv = d.servicios.find((s) => s.id === cita.servicioId);
  const pod = d.usuarios.find((u) => u.id === cita.podologoId), suc = d.sucursales.find((s) => s.id === cita.sucursalId);
  const plantilla = (d.agenda && d.agenda.plantillas && d.agenda.plantillas.recordatorio) || PLANTILLA_RECORDATORIO;
  return redactar(plantilla, { nombre: pac ? pac.nombres : "", servicio: sv ? sv.nombre.toLowerCase() : "podología", fecha: fechaHablada(cita.inicio), hora: hora(cita.inicio), sucursal: suc ? suc.nombre : "", podologo: pod ? pod.nombre.replace(/\s*\(.*\)/, "") : "tu podólogo", minutos: paramsAgenda(d).esperaVentanaMin });
}
/**
 * Cola de recordatorios de una fecha de cita (por omisión, mañana): citas pendientes de la sucursal con su recordatorio.
 * → [{ cita, rec|null, estado, toca, programado }]
 */
export function colaRecordatorios(d, { sucursalId = null, fecha = null, ahora = ahoraLocal() } = {}) {
  const P = paramsAgenda(d), f = fecha || sumarDias(dia(ahora), 1);
  return d.citas.filter((c) => dia(c.inicio) === f && (!sucursalId || c.sucursalId === sucursalId) && (esPendiente(c) || recordatorioDe(d, c.id)))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((cita) => { const rec = recordatorioDe(d, cita.id); return { cita, rec, estado: rec ? rec.estado : "pendiente", toca: !rec && tocaRecordar(cita, ahora, P.recordatorioHorasAntes), programado: programadoPara(cita, P.recordatorioHorasAntes) }; });
}
/** Estadísticas de confirmación de un periodo de fechas de cita. */
export function estadisticasRecordatorios(d, { sucursalId = null, desde, hasta }) {
  const recs = ((d.agenda && d.agenda.recordatorios) || []).filter((r) => (!sucursalId || r.sucursalId === sucursalId) && r.fecha >= desde && r.fecha <= hasta);
  const n = (e) => recs.filter((r) => r.estado === e).length;
  const enviados = recs.length, confirmo = n("confirmo"), reprogramo = n("reprogramo"), sinRespuesta = n("sin_respuesta"), cancelo = n("cancelo"), enEspera = n("enviado");
  const estadoCita = (r) => (d.citas.find((c) => c.id === r.citaId) || {}).estado;
  const asis = (lista) => { const fin = lista.filter((r) => ["atendida", "no_asistio"].includes(estadoCita(r))); return { total: fin.length, noAsistio: fin.filter((r) => estadoCita(r) === "no_asistio").length }; };
  const conf = asis(recs.filter((r) => r.estado === "confirmo")), sinc = asis(recs.filter((r) => r.estado !== "confirmo"));
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return { enviados, confirmo, reprogramo, sinRespuesta, cancelo, enEspera, tasaConfirmacion: pct(confirmo, enviados), tasaRespuesta: pct(confirmo + reprogramo + cancelo, enviados),
    inasistenciaConfirmados: pct(conf.noAsistio, conf.total), inasistenciaSinConfirmar: pct(sinc.noAsistio, sinc.total), simulados: recs.filter((r) => r.simulado).length };
}

// ═════════════════════════ Mi agenda (podólogo en todas sus sucursales)
/** Intervalos libres de la jornada del podólogo (descontando citas y bloqueos). → [{ de, a, min }] */
export function libresDelDia(d, podologoId, fecha) {
  const j = jornadaPodologo(d, podologoId, fecha);
  const fest = festivoDe(d, fecha, j.sucursalId);
  if (j.descanso || (fest && !fest.abre)) return [];
  const ocup = [];
  for (const c of d.citas) if (c.podologoId === podologoId && dia(c.inicio) === fecha && ocupaAgenda(c)) { const a = aMin(hora(c.inicio)); ocup.push([a, a + Number(c.duracion || 30)]); }
  const d0 = abs(`${fecha}T00:00`);
  for (const b of (d.agenda && d.agenda.bloqueos) || []) {
    if (b.estado !== "autorizado") continue;
    if (!((b.ambito === "podologo" && b.podologoId === podologoId) || (b.ambito === "sucursal" && j.sucursalId && b.sucursalId === j.sucursalId))) continue;
    const a = Math.max(0, abs(b.inicio) - d0), z = Math.min(1440, abs(b.fin) - d0);
    if (z > a) ocup.push([a, z]);
  }
  ocup.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const t of j.turnos) {
    let cur = t.de;
    for (const [a, z] of ocup) {
      if (z <= cur || a >= t.a) continue;
      if (a > cur) out.push({ de: cur, a: Math.min(a, t.a) });
      cur = Math.max(cur, z);
    }
    if (cur < t.a) out.push({ de: cur, a: t.a });
  }
  return out.map((x) => ({ de: aHora(x.de), a: aHora(x.a), min: x.a - x.de })).filter((x) => x.min >= 15);
}
/**
 * Agenda del podólogo en una fecha, en TODAS sus sucursales.
 * → { fecha, sucursalId (rotación), jornada, festivo, citas, bloqueos (propios y de su sucursal del día, cualquier estado vigente), libres }
 */
export function agendaPodologo(d, podologoId, fecha) {
  const j = jornadaPodologo(d, podologoId, fecha);
  const d0 = abs(`${fecha}T00:00`), d1 = d0 + 1440;
  const bloqueos = ((d.agenda && d.agenda.bloqueos) || []).filter((b) => ["autorizado", "solicitado"].includes(b.estado) && abs(b.inicio) < d1 && abs(b.fin) > d0 &&
    ((b.ambito === "podologo" && b.podologoId === podologoId) || (b.ambito === "sucursal" && b.estado === "autorizado" && j.sucursalId && b.sucursalId === j.sucursalId)));
  return {
    fecha, sucursalId: j.sucursalId, jornada: j, festivo: festivoDe(d, fecha, j.sucursalId),
    citas: d.citas.filter((c) => c.podologoId === podologoId && dia(c.inicio) === fecha).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    bloqueos, libres: libresDelDia(d, podologoId, fecha),
  };
}
export { ymd };
