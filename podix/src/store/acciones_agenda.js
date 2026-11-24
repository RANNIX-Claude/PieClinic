// Acciones del dominio «agenda» (porte de Pie Firme): horarios, bloqueos, festivos, sobrecupo, «No asistió», lista de espera,
// recordatorios y retención de horario. Funciones sobre el estado `d` (el borrador dentro de mutar()); todas validan el rol del
// usuario en sesión DENTRO de la acción y dejan bitácora. Devuelven { ok:true, … } o { ok:false, error }.
//
// ═════ API para las pantallas existentes (recepción/agenda, sala, pendientes, podólogo/hoy, gerente/agenda-sucursal) ═════
//   validarCita(d, cita, opts)                         → { ok, errores:[{codigo,texto}], avisos, textos }      (reglas_agenda.js)
//   huecosDisponibles(d, { sucursalId, podologoId, fecha, duracion, pacienteId?, ahora? }) → [{ hora, inicio, podologoId, consultorioId }]
//   agendarCita(d, { pacienteId, servicioId, podologoId, sucursalId, inicio, duracion?, consultorioId? })   crea la cita ya validada
//   marcarNoAsistio(d, citaId) · puedeMarcarNoAsistio(d, cita) (tolerancia de 15 min) · revertirNoAsistio(d, citaId) (solo Administración)
//   solicitarSobrecupo / resolverSobrecupo (solo Administración) / agendarSobrecupo                          (máx. 1 por podólogo y día)
//   altaEspera / notificarEspera / confirmarEspera / agendarDesdeEspera / candidatosParaHueco / huecosLiberados
//   marcarRecordatorio(d, citaId, "enviado"|"confirmo"|"reprogramo"|"sin_respuesta"|"cancelo") · colaRecordatorios · textoRecordatorio
import { auditar, uid } from "./core.js";
import { ahoraLocal, hoy, dia, hora, sumarDias } from "../lib/format.js";
import * as G from "./reglas_agenda.js";

export * from "./reglas_agenda.js";

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const txt = (s) => String(s ?? "").trim();
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FH = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

// ═════════════════════════ Roles
export const usuarioDe = (d) => d.usuarios.find((x) => x.id === d.sesion.userId && x.activo !== false) || null;
export const esCentral = (u) => !!u && (u.rol === "admin" || u.rol === "direccion");
/** Gerente de esa sucursal, Administración o Dirección: edita horarios y bloqueos. */
export const gestiona = (u, sucursalId) => esCentral(u) || (!!u && u.rol === "gerente" && u.sucursales.includes(sucursalId));
/** Quien opera la agenda del día: recepción en su sucursal ACTIVA, gerente de la sucursal y Administración. */
export const opera = (d, u, sucursalId) => gestiona(u, sucursalId) || (!!u && u.rol === "recepcion" && u.sucursales.includes(sucursalId) && d.sesion.sucursalId === sucursalId);
/** Puede consultar horarios (recepción y podólogo solo leen). */
export const consulta = (u) => !!u && ["recepcion", "podologo", "gerente", "admin", "direccion"].includes(u.rol);
/** Sucursales cuyos horarios puede ver el usuario: central todas; gerente las suyas; recepción la activa; podólogo las suyas. */
export function sucursalesVisibles(d, u) {
  if (!u) return [];
  if (esCentral(u)) return d.sucursales;
  if (u.rol === "recepcion") return d.sucursales.filter((s) => s.id === d.sesion.sucursalId && u.sucursales.includes(s.id));
  if (u.rol === "gerente" || u.rol === "podologo") return d.sucursales.filter((s) => u.sucursales.includes(s.id));
  return [];
}
const gestionaPodologo = (d, u, podologoId) => { const p = d.usuarios.find((x) => x.id === podologoId && x.rol === "podologo"); return !!p && (esCentral(u) || (!!u && u.rol === "gerente" && p.sucursales.some((s) => u.sucursales.includes(s)))); };
const A = (d) => (d.agenda ||= { params: { ...G.PARAMS_AGENDA }, horariosSucursal: [], horariosPodologo: [], rotacion: [], bloqueos: [], festivos: [], sobrecupos: [], recordatorios: [], huecosLiberados: [], esperaHist: [], retenciones: [], plantillas: {} });
const nomSuc = (d, id) => (d.sucursales.find((s) => s.id === id) || {}).nombre || id;
const nomPac = (d, id) => { const p = d.pacientes.find((x) => x.id === id); return p ? `${p.nombres} ${p.apellidos}` : "—"; };
const NO_GESTION = err("Solo el gerente de la sucursal, Administración o Dirección pueden cambiarlo.");
const NO_OPERA = err("Solo recepción (en su sucursal activa), el gerente de la sucursal o Administración.");

// ═════════════════════════ Horarios (P-047)
/** Citas pendientes a futuro que ya no caben en los horarios, la rotación, los festivos o los bloqueos vigentes. */
export function citasFueraDeHorario(d, { sucursalId = null, podologoId = null, desde = hoy() } = {}) {
  return d.citas.filter((c) => G.esPendiente(c) && dia(c.inicio) >= desde && (!sucursalId || c.sucursalId === sucursalId) && (!podologoId || c.podologoId === podologoId))
    .map((c) => ({ cita: c, v: G.validarCita(d, c, { existente: true }) })).filter((x) => !x.v.ok);
}
export function guardarHorarioSucursal(d, { sucursalId, dia: k, abre, cierra, cerrado = false }) {
  const u = usuarioDe(d);
  if (!gestiona(u, sucursalId)) return NO_GESTION;
  if (!d.sucursales.some((s) => s.id === sucursalId) || !(k >= 0 && k <= 6)) return err("Sucursal o día no válidos.");
  if (!cerrado && (!HHMM.test(abre) || !HHMM.test(cierra) || abre >= cierra)) return err("La hora de apertura debe ser anterior a la de cierre.");
  const l = A(d).horariosSucursal;
  let h = l.find((x) => x.sucursalId === sucursalId && x.dia === k);
  if (!h) { h = { sucursalId, dia: k, abre: "09:00", cierra: "18:00", cerrado: false }; l.push(h); }
  const antes = h.cerrado ? "cerrado" : `${h.abre}–${h.cierra}`;
  Object.assign(h, cerrado ? { cerrado: true } : { abre, cierra, cerrado: false });
  auditar(d, "horario_sucursal", "agenda", sucursalId, `${G.DIAS[k]}: ${antes} → ${cerrado ? "cerrado" : `${abre}–${cierra}`}`);
  return ok({ afectadas: citasFueraDeHorario(d, { sucursalId }).length });
}
export function guardarHorarioPodologo(d, { podologoId, dia: k, turnos = [], descanso = false }) {
  const u = usuarioDe(d);
  if (!gestionaPodologo(d, u, podologoId)) return NO_GESTION;
  if (!(k >= 0 && k <= 6)) return err("Día no válido.");
  const ts = descanso ? [] : turnos.map((t) => ({ de: t.de, a: t.a })).sort((a, b) => a.de.localeCompare(b.de));
  if (!descanso) {
    if (!ts.length) return err("Captura al menos un turno o marca el día como descanso.");
    for (let i = 0; i < ts.length; i++) {
      if (!HHMM.test(ts[i].de) || !HHMM.test(ts[i].a) || ts[i].de >= ts[i].a) return err("Cada turno necesita hora de inicio anterior a la de fin.");
      if (i && ts[i].de < ts[i - 1].a) return err("Los turnos del día se enciman.");
    }
  }
  const l = A(d).horariosPodologo;
  let h = l.find((x) => x.podologoId === podologoId && x.dia === k);
  if (!h) { h = { podologoId, dia: k, turnos: [], descanso: false }; l.push(h); }
  h.turnos = ts; h.descanso = !!descanso;
  auditar(d, "horario_podologo", "agenda", podologoId, `${G.DIAS[k]}: ${descanso ? "descanso" : ts.map((t) => `${t.de}–${t.a}`).join(" y ")}`);
  return ok({ afectadas: citasFueraDeHorario(d, { podologoId }).length });
}
/** Rotación del podólogo entre sus sucursales: "alterna" (un día en cada una desde `ancla`) o "fija" (sucursal por día de la semana). */
export function guardarRotacion(d, { podologoId, modo, sucursales = null, ancla = null, porDia = null }) {
  const u = usuarioDe(d);
  if (!gestionaPodologo(d, u, podologoId)) return NO_GESTION;
  const p = d.usuarios.find((x) => x.id === podologoId);
  if (!["alterna", "fija"].includes(modo)) return err("Modo de rotación no válido.");
  const l = A(d).rotacion;
  let r = l.find((x) => x.podologoId === podologoId);
  if (!r) { r = { podologoId, modo, ancla: hoy(), sucursales: [...p.sucursales] }; l.push(r); }
  if (modo === "alterna") {
    const ss = sucursales || r.sucursales || p.sucursales;
    if (!ss.length || ss.some((s) => !p.sucursales.includes(s))) return err("Solo se rota entre las sucursales asignadas al podólogo.");
    Object.assign(r, { modo, sucursales: [...ss], ancla: ancla && FECHA.test(ancla) ? ancla : r.ancla || hoy() });
  } else {
    const pd = {};
    for (let k = 0; k < 7; k++) { const s = porDia ? porDia[k] : null; if (s && !p.sucursales.includes(s)) return err("Solo se asignan sucursales del podólogo."); pd[k] = s || null; }
    Object.assign(r, { modo, porDia: pd });
  }
  auditar(d, "rotacion_podologo", "agenda", podologoId, modo === "alterna" ? `Días alternos: ${r.sucursales.map((s) => nomSuc(d, s)).join(" / ")} desde ${r.ancla}` : "Sucursal fija por día de la semana");
  return ok({ afectadas: citasFueraDeHorario(d, { podologoId }).length });
}
/** Parámetros de la agenda (margen, tolerancia, sobrecupo, ventanas): solo Administración o Dirección. */
export function guardarParams(d, cambios) {
  const u = usuarioDe(d);
  if (!esCentral(u)) return err("Los parámetros de la agenda los cambia Administración o Dirección.");
  const p = A(d).params ||= { ...G.PARAMS_AGENDA };
  const antes = [];
  for (const [k, v] of Object.entries(cambios || {})) {
    if (!(k in G.PARAMS_AGENDA)) continue;
    const n = Number(v);
    if (v === "" || !Number.isFinite(n) || n < 0 || (k === "pasoMin" && n < 5) || (k === "anticipoPortalPct" && n > 100)) return err(`Valor no válido en «${G.ETIQUETA_PARAM[k][0]}».`);
    if (p[k] !== n) { antes.push(`${k}: ${p[k]} → ${n}`); p[k] = n; }
  }
  if (antes.length) auditar(d, "parametros_agenda", "agenda", "params", antes.join(" · "));
  return ok({ cambios: antes.length });
}

// ═════════════════════════ Bloqueos (P-047)
function alcanceBloqueo(d, u, b) {
  if (esCentral(u)) return true;
  if (!u || u.rol !== "gerente") return false;
  if (b.ambito === "podologo") return gestionaPodologo(d, u, b.podologoId);
  return u.sucursales.includes(b.sucursalId);
}
/**
 * Crea un bloqueo. Administración y el gerente (en su sucursal) lo dejan autorizado; el podólogo solo SOLICITA el suyo
 * (vacaciones, permiso) y lo autoriza el gerente o Administración.
 */
export function crearBloqueo(d, { ambito, sucursalId = null, podologoId = null, consultorioId = null, tipo, inicio, fin, motivo = "" }) {
  const u = usuarioDe(d);
  if (!u) return err("Sin sesión.");
  if (!G.AMBITOS[ambito] || !G.TIPOS_BLOQUEO[tipo]) return err("Tipo o alcance de bloqueo no válido.");
  if (!FH.test(inicio) || !FH.test(fin) || fin <= inicio) return err("El fin debe ser posterior al inicio.");
  const b = { id: uid("BQ"), ambito, sucursalId, podologoId: null, consultorioId: null, tipo, inicio, fin, motivo: txt(motivo), solicitadoPor: u.id, solicitadoEn: ahoraLocal(), resueltoPor: null, resueltoEn: null, estado: "solicitado" };
  if (ambito === "podologo") {
    const p = d.usuarios.find((x) => x.id === podologoId && x.rol === "podologo");
    if (!p) return err("Elige al podólogo.");
    b.podologoId = p.id; b.sucursalId = sucursalId && p.sucursales.includes(sucursalId) ? sucursalId : p.sucursales[0];
  } else {
    const s = d.sucursales.find((x) => x.id === sucursalId);
    if (!s) return err("Elige la sucursal.");
    if (ambito === "consultorio") { if (!s.consultorios.includes(consultorioId)) return err("Elige el consultorio."); b.consultorioId = consultorioId; }
  }
  const propio = u.rol === "podologo" && ambito === "podologo" && b.podologoId === u.id;
  if (!alcanceBloqueo(d, u, b) && !propio) return err(u.rol === "podologo" ? "Solo puedes solicitar bloqueos de tu propia agenda." : "No puedes bloquear esa agenda.");
  if (propio && !b.motivo) return err("Escribe el motivo de la solicitud.");
  if (alcanceBloqueo(d, u, b)) Object.assign(b, { estado: "autorizado", resueltoPor: u.id, resueltoEn: ahoraLocal() });
  A(d).bloqueos.unshift(b);
  const afectadas = G.citasAfectadasPorBloqueo(d, b).length;
  auditar(d, b.estado === "autorizado" ? "crear_bloqueo" : "solicitar_bloqueo", "bloqueo", b.id, `${G.etiquetaBloqueo(d, b)} · ${inicio} → ${fin}${afectadas ? ` · ${afectadas} cita(s) por reprogramar` : ""}`);
  return ok({ id: b.id, estado: b.estado, afectadas });
}
/** Autoriza o rechaza un bloqueo solicitado: gerente de la sucursal (o del podólogo), Administración o Dirección. */
export function resolverBloqueo(d, id, decision, motivo = "") {
  const u = usuarioDe(d);
  const b = A(d).bloqueos.find((x) => x.id === id);
  if (!b) return err("Bloqueo no encontrado.");
  if (!alcanceBloqueo(d, u, b)) return err("Los bloqueos los autoriza el gerente de la sucursal, Administración o Dirección.");
  if (b.estado !== "solicitado") return err("Ese bloqueo ya fue resuelto.");
  if (!["autorizado", "rechazado"].includes(decision)) return err("Decisión no válida.");
  if (decision === "rechazado" && !txt(motivo)) return err("Escribe el motivo del rechazo.");
  Object.assign(b, { estado: decision, resueltoPor: u.id, resueltoEn: ahoraLocal(), motivoResolucion: txt(motivo) });
  const afectadas = decision === "autorizado" ? G.citasAfectadasPorBloqueo(d, b).length : 0;
  auditar(d, decision === "autorizado" ? "autorizar_bloqueo" : "rechazar_bloqueo", "bloqueo", id, `${G.etiquetaBloqueo(d, b)}${txt(motivo) ? ` · ${txt(motivo)}` : ""}${afectadas ? ` · ${afectadas} cita(s) por reprogramar` : ""}`);
  return ok({ afectadas });
}
/** Cancela un bloqueo vigente: quien lo solicitó o quien puede autorizarlo. */
export function cancelarBloqueo(d, id) {
  const u = usuarioDe(d);
  const b = A(d).bloqueos.find((x) => x.id === id);
  if (!b) return err("Bloqueo no encontrado.");
  if (!u || !(alcanceBloqueo(d, u, b) || b.solicitadoPor === u.id)) return err("No puedes cancelar ese bloqueo.");
  if (!["solicitado", "autorizado"].includes(b.estado)) return err("Ese bloqueo ya no está vigente.");
  b.estado = "cancelado"; b.canceladoPor = u.id; b.canceladoEn = ahoraLocal();
  auditar(d, "cancelar_bloqueo", "bloqueo", id, G.etiquetaBloqueo(d, b));
  return ok();
}

// ═════════════════════════ Festivos (P-047)
const puedeFestivo = (u, sucursalId) => esCentral(u) || (!!u && u.rol === "gerente" && !!sucursalId && u.sucursales.includes(sucursalId));
/** Alta o edición de un festivo. General (todas las sucursales): Administración; de una sucursal: también su gerente. */
export function guardarFestivo(d, { id = null, fecha, nombre, sucursalId = null, abre = false, nota = "" }) {
  const u = usuarioDe(d);
  const l = A(d).festivos;
  const f = id ? l.find((x) => x.id === id) : null;
  if (id && !f) return err("Festivo no encontrado.");
  if (!puedeFestivo(u, f ? f.sucursalId : sucursalId) || (f && !puedeFestivo(u, sucursalId))) return err("Los festivos generales los captura Administración; el gerente solo los de su sucursal.");
  if (!FECHA.test(fecha) || !txt(nombre)) return err("Captura la fecha y el nombre del festivo.");
  if (l.some((x) => x.id !== id && x.fecha === fecha && (x.sucursalId || null) === (sucursalId || null))) return err("Ya hay un festivo en esa fecha para ese alcance.");
  const datos = { fecha, nombre: txt(nombre), sucursalId: sucursalId || null, abre: !!abre, nota: txt(nota) };
  if (f) Object.assign(f, datos); else l.push({ id: uid("FE"), oficial: false, ...datos });
  l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const afectadas = abre ? 0 : d.citas.filter((c) => G.esPendiente(c) && dia(c.inicio) === fecha && (!sucursalId || c.sucursalId === sucursalId)).length;
  auditar(d, f ? "editar_festivo" : "agregar_festivo", "festivo", fecha, `${txt(nombre)} · ${sucursalId ? nomSuc(d, sucursalId) : "todas las sucursales"} · ${abre ? "abre" : "cierra"}${afectadas ? ` · ${afectadas} cita(s) por reprogramar` : ""}`);
  return ok({ afectadas });
}
export function quitarFestivo(d, id) {
  const u = usuarioDe(d);
  const l = A(d).festivos, f = l.find((x) => x.id === id);
  if (!f) return err("Festivo no encontrado.");
  if (!puedeFestivo(u, f.sucursalId)) return err("Los festivos generales los quita Administración; el gerente solo los de su sucursal.");
  d.agenda.festivos = l.filter((x) => x.id !== id);
  auditar(d, "quitar_festivo", "festivo", f.fecha, f.nombre);
  return ok();
}
/** Carga los días de descanso obligatorio de un año (art. 74 LFT) que falten. Solo Administración. */
export function cargarFestivosOficiales(d, anio) {
  const u = usuarioDe(d);
  if (!esCentral(u)) return err("Solo Administración carga el calendario oficial.");
  const l = A(d).festivos;
  let n = 0;
  for (const f of G.festivosMexico(Number(anio))) {
    if (l.some((x) => x.fecha === f.fecha && !x.sucursalId)) continue;
    l.push({ id: uid("FE"), fecha: f.fecha, nombre: f.nombre, oficial: f.oficial, sucursalId: null, abre: !f.oficial, nota: f.oficial ? "Descanso obligatorio (art. 74 LFT)." : "No es descanso obligatorio." }); n++;
  }
  l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  auditar(d, "cargar_festivos", "festivo", String(anio), `${n} festivo(s) agregados`);
  return ok({ agregados: n });
}

// ═════════════════════════ Citas: alta validada, «No asistió» y sobrecupo
function consultorioPara(d, base, opts) {
  const suc = d.sucursales.find((s) => s.id === base.sucursalId);
  return ((suc && suc.consultorios) || ["C1"]).find((cn) => G.validarCita(d, { ...base, consultorioId: cn }, opts).ok) || null;
}
function nuevaCita(d, base, extra = {}) {
  const c = { id: uid("CI"), pacienteId: base.pacienteId, servicioId: base.servicioId, podologoId: base.podologoId, consultorioId: base.consultorioId, sucursalId: base.sucursalId, inicio: base.inicio, duracion: base.duracion, estado: "agendada", recordatorio: "whatsapp", aDomicilio: false, serieId: null, ...extra };
  d.citas.push(c);
  return c;
}
/**
 * Agenda una cita ya validada contra horarios, rotación, festivos, bloqueos, empalmes y margen de 10 min.
 * Si no llega consultorio, toma el primero libre. Para las pantallas de recepción.
 */
export function agendarCita(d, { pacienteId, servicioId, podologoId, sucursalId, inicio, duracion = null, consultorioId = null }, { ahora = ahoraLocal() } = {}) {
  const u = usuarioDe(d);
  if (!opera(d, u, sucursalId)) return NO_OPERA;
  const sv = d.servicios.find((s) => s.id === servicioId);
  if (!d.pacientes.some((p) => p.id === pacienteId) || !sv || !FH.test(inicio)) return err("Faltan paciente, servicio u horario.");
  const base = { pacienteId, servicioId, podologoId, sucursalId, inicio, duracion: Number(duracion) || sv.duracion };
  const v = G.validarCita(d, { ...base, consultorioId }, { ahora });
  if (!v.ok) return { ok: false, error: v.textos[0], errores: v.errores };
  const cons = consultorioId || consultorioPara(d, base, { ahora });
  if (!cons) return err("No hay consultorio libre a esa hora (con el margen entre citas).");
  const c = nuevaCita(d, { ...base, consultorioId: cons });
  auditar(d, "crear_cita", "cita", c.id, `${nomPac(d, pacienteId)} · ${sv.nombre} · ${inicio}`);
  return ok({ id: c.id, consultorioId: cons, avisos: v.avisos });
}
/** Marca «No asistió» pasada la tolerancia de 15 min (P-045). Recepción de la sucursal, gerente o Administración. */
export function marcarNoAsistio(d, citaId, { ahora = ahoraLocal() } = {}) {
  const u = usuarioDe(d);
  const c = d.citas.find((x) => x.id === citaId);
  if (!c) return err("Cita no encontrada.");
  if (!opera(d, u, c.sucursalId)) return NO_OPERA;
  const p = G.puedeMarcarNoAsistio(d, c, ahora);
  if (!p.ok) return err(p.error);
  c.estadoAntes = c.estado; c.estado = "no_asistio"; c.noAsistioEn = ahora; c.noAsistioPor = u.id;
  auditar(d, "no_asistio", "cita", citaId, `${nomPac(d, c.pacienteId)} · cita de las ${hora(c.inicio)}`);
  return ok();
}
/** Revertir un «No asistió» es solo de Administración (P-045). */
export function revertirNoAsistio(d, citaId) {
  const u = usuarioDe(d);
  if (!esCentral(u)) return err("Revertir «No asistió» es solo de Administración o Dirección.");
  const c = d.citas.find((x) => x.id === citaId);
  if (!c || c.estado !== "no_asistio") return err("La cita no está marcada como «No asistió».");
  c.estado = "por_confirmar"; delete c.noAsistioEn; delete c.noAsistioPor;
  auditar(d, "revertir_no_asistio", "cita", citaId, nomPac(d, c.pacienteId));
  return ok();
}

/**
 * Sobrecupo (P-042): una cita encimada con otra del mismo podólogo. Máximo 1 por podólogo y día y lo autoriza Administración.
 * Recepción o el gerente lo SOLICITAN; si lo captura Administración queda autorizado.
 */
export function solicitarSobrecupo(d, { sucursalId, podologoId, fecha, hora: hh, pacienteId, servicioId, motivo }) {
  const u = usuarioDe(d);
  if (!opera(d, u, sucursalId)) return NO_OPERA;
  const sv = d.servicios.find((s) => s.id === servicioId);
  if (!FECHA.test(fecha) || !HHMM.test(hh) || !sv || !d.pacientes.some((p) => p.id === pacienteId) || !d.usuarios.some((x) => x.id === podologoId && x.rol === "podologo")) return err("Faltan datos del sobrecupo.");
  if (!txt(motivo)) return err("Escribe el motivo del sobrecupo.");
  const max = G.paramsAgenda(d).sobrecupoMaxDia;
  const vivos = A(d).sobrecupos.filter((s) => s.podologoId === podologoId && s.fecha === fecha && ["solicitado", "autorizado"].includes(s.estado)).length;
  const usados = d.citas.filter((c) => dia(c.inicio) === fecha && c.podologoId === podologoId && c.sobrecupo && G.ocupaAgenda(c)).length;
  if (vivos + usados >= max) return err(`El podólogo ya tiene ${max} sobrecupo(s) ese día (máximo ${max}, P-042).`);
  const s = { id: uid("SC"), sucursalId, podologoId, fecha, hora: hh, pacienteId, servicioId, motivo: txt(motivo), estado: "solicitado", solicitadoPor: u.id, solicitadoEn: ahoraLocal(), resueltoPor: null, resueltoEn: null, citaId: null, motivoResolucion: "" };
  const v = G.validarCita(d, { sucursalId, podologoId, pacienteId, inicio: `${fecha}T${hh}`, duracion: sv.duracion }, { sobrecupo: true, autorizadoPor: "pendiente", ahora: ahoraLocal() });
  if (!v.ok) return { ok: false, error: v.textos[0], errores: v.errores };
  if (esCentral(u)) Object.assign(s, { estado: "autorizado", resueltoPor: u.id, resueltoEn: ahoraLocal() });
  A(d).sobrecupos.unshift(s);
  auditar(d, s.estado === "autorizado" ? "autorizar_sobrecupo" : "solicitar_sobrecupo", "sobrecupo", s.id, `${nomPac(d, pacienteId)} · ${fecha} ${hh} · ${txt(motivo)}`);
  return ok({ id: s.id, estado: s.estado });
}
/** Autoriza o rechaza un sobrecupo: SOLO Administración o Dirección. */
export function resolverSobrecupo(d, id, decision, motivo = "") {
  const u = usuarioDe(d);
  if (!esCentral(u)) return err("El sobrecupo lo autoriza Administración o Dirección (P-042).");
  const s = A(d).sobrecupos.find((x) => x.id === id);
  if (!s || s.estado !== "solicitado") return err("Ese sobrecupo ya fue resuelto.");
  if (!["autorizado", "rechazado"].includes(decision)) return err("Decisión no válida.");
  if (decision === "rechazado" && !txt(motivo)) return err("Escribe el motivo del rechazo.");
  if (decision === "autorizado" && !G.sobrecupoDisponible(d, s.podologoId, s.fecha)) return err("El podólogo ya usó su sobrecupo de ese día.");
  Object.assign(s, { estado: decision, resueltoPor: u.id, resueltoEn: ahoraLocal(), motivoResolucion: txt(motivo) });
  auditar(d, decision === "autorizado" ? "autorizar_sobrecupo" : "rechazar_sobrecupo", "sobrecupo", id, `${nomPac(d, s.pacienteId)} · ${s.fecha} ${s.hora}${txt(motivo) ? ` · ${txt(motivo)}` : ""}`);
  return ok();
}
/** Agenda la cita de un sobrecupo ya autorizado. */
export function agendarSobrecupo(d, id, { ahora = ahoraLocal() } = {}) {
  const u = usuarioDe(d);
  const s = A(d).sobrecupos.find((x) => x.id === id);
  if (!s) return err("Sobrecupo no encontrado.");
  if (!opera(d, u, s.sucursalId)) return NO_OPERA;
  if (s.estado !== "autorizado") return err(s.estado === "solicitado" ? "Falta la autorización de Administración (P-042)." : "Ese sobrecupo ya no está disponible.");
  const sv = d.servicios.find((x) => x.id === s.servicioId);
  const base = { pacienteId: s.pacienteId, servicioId: s.servicioId, podologoId: s.podologoId, sucursalId: s.sucursalId, inicio: `${s.fecha}T${s.hora}`, duracion: sv ? sv.duracion : 30 };
  const opts = { sobrecupo: true, autorizadoPor: s.resueltoPor, ahora };
  const v = G.validarCita(d, base, opts);
  if (!v.ok) return { ok: false, error: v.textos[0], errores: v.errores };
  const cons = consultorioPara(d, base, opts);
  if (!cons) return err("No hay consultorio libre para el sobrecupo a esa hora.");
  const c = nuevaCita(d, { ...base, consultorioId: cons }, { sobrecupo: true, sobrecupoId: s.id, sobrecupoAutorizadoPor: s.resueltoPor, estado: "confirmada" });
  s.estado = "usado"; s.citaId = c.id;
  auditar(d, "agendar_sobrecupo", "cita", c.id, `${nomPac(d, s.pacienteId)} · ${base.inicio} · autorizó ${s.resueltoPor}`);
  return ok({ id: c.id, consultorioId: cons });
}

// ═════════════════════════ Lista de espera (P-041)
const vivaDe = (d, id) => (d.listaEspera ||= []).find((e) => e.id === id) || null;
function cerrarEspera(d, e, estado, motivo, extra = {}) {
  d.listaEspera = d.listaEspera.filter((x) => x.id !== e.id);
  A(d).esperaHist.unshift({ ...e, estado, cerradoEn: ahoraLocal(), motivoCierre: motivo, ...extra });
  if (d.agenda.esperaHist.length > 200) d.agenda.esperaHist.length = 200;
}
/** Alta a la lista de espera por servicio, podólogo (opcional), sucursal y franja. Vence a los 14 días. */
export function altaEspera(d, { pacienteId, servicioId, sucursalId, podologoId = null, preferencia = "cualquiera", prioridad = "media", origen = "llamada", notas = "" }) {
  const u = usuarioDe(d);
  if (!opera(d, u, sucursalId)) return NO_OPERA;
  if (!d.pacientes.some((p) => p.id === pacienteId) || !d.servicios.some((s) => s.id === servicioId)) return err("Elige al paciente y el servicio.");
  if (!G.FRANJAS[preferencia] || !G.PRIORIDADES[prioridad]) return err("Franja o prioridad no válida.");
  if (podologoId && !d.usuarios.some((x) => x.id === podologoId && x.rol === "podologo" && x.sucursales.includes(sucursalId))) return err("Ese podólogo no atiende en la sucursal.");
  if ((d.listaEspera ||= []).some((e) => e.pacienteId === pacienteId && e.servicioId === servicioId && e.sucursalId === sucursalId)) return err("El paciente ya está en la lista de espera para ese servicio.");
  const e = { id: uid("LE"), pacienteId, servicioId, preferencia, sucursalId, creado: hoy(), creadoEn: ahoraLocal(), vence: sumarDias(hoy(), G.paramsAgenda(d).esperaVenceDias), podologoId: podologoId || null, prioridad, origen: G.ORIGENES_ESPERA[origen] ? origen : "llamada", notas: txt(notas), estado: "esperando", intentos: 0, avisos: [], registradoPor: u.id };
  d.listaEspera.push(e);
  auditar(d, "alta_lista_espera", "listaEspera", e.id, `${nomPac(d, pacienteId)} · prioridad ${prioridad} · vence ${e.vence}`);
  return ok({ id: e.id, vence: e.vence });
}
/** Texto del aviso de hueco liberado con la plantilla vigente. */
export function textoEspera(d, e, hueco) {
  const pac = d.pacientes.find((p) => p.id === e.pacienteId), sv = d.servicios.find((s) => s.id === e.servicioId), pod = d.usuarios.find((x) => x.id === hueco.podologoId);
  return G.redactar((d.agenda && d.agenda.plantillas && d.agenda.plantillas.espera) || G.PLANTILLA_ESPERA, { nombre: pac ? pac.nombres : "", servicio: sv ? sv.nombre.toLowerCase() : "podología", fecha: G.fechaHablada(hueco.inicio), hora: hora(hueco.inicio), sucursal: nomSuc(d, hueco.sucursalId), podologo: pod ? pod.nombre : "", minutos: G.paramsAgenda(d).esperaVentanaMin });
}
/**
 * Ofrece un hueco a alguien de la lista: queda «notificado» con una ventana de 30 min para confirmar; si no responde,
 * el hueco pasa al siguiente candidato. El envío es MANUAL (wa.me / llamada): aquí solo se registra.
 */
export function notificarEspera(d, id, hueco, { ahora = ahoraLocal() } = {}) {
  const u = usuarioDe(d);
  const e = vivaDe(d, id);
  if (!e) return err("Esa solicitud ya no está en la lista.");
  if (!opera(d, u, e.sucursalId)) return NO_OPERA;
  const P = G.paramsAgenda(d), est = G.estadoEspera(e, ahora, P);
  if (est === "vencida") return err(`La solicitud venció a los ${P.esperaVenceDias} días: reactívala primero.`);
  if (est === "notificado") return err(`Ya fue notificado: su ventana de ${P.esperaVentanaMin} min sigue abierta.`);
  if (!hueco || hueco.sucursalId !== e.sucursalId || !FH.test(hueco.inicio)) return err("El hueco no corresponde a la sucursal de la solicitud.");
  const sv = d.servicios.find((s) => s.id === e.servicioId);
  const v = G.validarCita(d, { sucursalId: e.sucursalId, podologoId: hueco.podologoId, pacienteId: e.pacienteId, inicio: hueco.inicio, duracion: sv ? sv.duracion : 30 }, { ahora });
  if (!v.ok) return { ok: false, error: `El hueco ya no está disponible: ${v.textos[0]}`, errores: v.errores };
  const hasta = G.masMin(ahora, P.esperaVentanaMin);
  Object.assign(e, { estado: "notificado", notificadoEn: ahora, notificadoHasta: hasta, intentos: (e.intentos || 0) + 1, hueco: { sucursalId: hueco.sucursalId, podologoId: hueco.podologoId, inicio: hueco.inicio, duracion: hueco.duracion || (sv ? sv.duracion : 30) } });
  (e.avisos ||= []).push({ hueco: `${hueco.podologoId}|${hueco.inicio}`, en: ahora });
  auditar(d, "notificar_lista_espera", "listaEspera", id, `${nomPac(d, e.pacienteId)} · hueco ${hueco.inicio} · responde antes de ${hora(hasta)}`);
  return ok({ hasta, texto: textoEspera(d, e, hueco) });
}
function agendarEspera(d, u, e, hueco, ahora, accion) {
  const sv = d.servicios.find((s) => s.id === e.servicioId);
  const base = { pacienteId: e.pacienteId, servicioId: e.servicioId, podologoId: hueco.podologoId, sucursalId: e.sucursalId, inicio: hueco.inicio, duracion: sv ? sv.duracion : 30 };
  const v = G.validarCita(d, base, { ahora });
  if (!v.ok) return { ok: false, error: v.textos[0], errores: v.errores };
  const cons = consultorioPara(d, base, { ahora });
  if (!cons) return err("No hay consultorio libre a esa hora.");
  const c = nuevaCita(d, { ...base, consultorioId: cons }, { estado: "confirmada", confirmadaEn: ahora, origenEspera: e.id });
  cerrarEspera(d, e, "agendado", "Aceptó el hueco ofrecido", { citaId: c.id });
  auditar(d, accion, "cita", c.id, `${nomPac(d, e.pacienteId)} · ${hueco.inicio} · desde lista de espera`);
  return ok({ citaId: c.id, consultorioId: cons });
}
/** El paciente notificado CONFIRMA dentro de su ventana de 30 min: se agenda en el hueco ofrecido. Fuera de la ventana ya no. */
export function confirmarEspera(d, id, { ahora = ahoraLocal() } = {}) {
  const u = usuarioDe(d);
  const e = vivaDe(d, id);
  if (!e) return err("Esa solicitud ya no está en la lista.");
  if (!opera(d, u, e.sucursalId)) return NO_OPERA;
  const P = G.paramsAgenda(d), est = G.estadoEspera(e, ahora, P);
  if (est === "sin_respuesta") return err(`La ventana de ${P.esperaVentanaMin} min venció: el hueco pasa al siguiente candidato.`);
  if (est !== "notificado" || !e.hueco) return err("Primero hay que ofrecerle un hueco.");
  return agendarEspera(d, u, e, e.hueco, ahora, "confirmar_lista_espera");
}
/** Agenda directo desde la lista (el paciente está al teléfono o en mostrador), en un hueco disponible. */
export function agendarDesdeEspera(d, id, hueco, { ahora = ahoraLocal() } = {}) {
  const u = usuarioDe(d);
  const e = vivaDe(d, id);
  if (!e) return err("Esa solicitud ya no está en la lista.");
  if (!opera(d, u, e.sucursalId)) return NO_OPERA;
  if (!hueco || hueco.sucursalId !== e.sucursalId) return err("El hueco no corresponde a la sucursal de la solicitud.");
  return agendarEspera(d, u, e, hueco, ahora, "agendar_desde_espera");
}
/** La ventana venció (o el paciente declinó): la solicitud vuelve a «en espera» y el hueco queda para el siguiente. */
export function liberarVentana(d, id, { ahora = ahoraLocal(), declino = false } = {}) {
  const u = usuarioDe(d);
  const e = vivaDe(d, id);
  if (!e) return err("Esa solicitud ya no está en la lista.");
  if (!opera(d, u, e.sucursalId)) return NO_OPERA;
  if (e.estado !== "notificado") return err("La solicitud no tiene un aviso pendiente.");
  if (!declino && G.estadoEspera(e, ahora, G.paramsAgenda(d)) === "notificado") return err("Su ventana sigue abierta: espera a que venza o registra que declinó.");
  const hueco = e.hueco;
  Object.assign(e, { estado: "esperando", hueco: null, notificadoHasta: null, ultimoAviso: e.notificadoEn });
  auditar(d, "liberar_ventana_espera", "listaEspera", id, `${nomPac(d, e.pacienteId)} · ${declino ? "declinó" : "sin respuesta"} · hueco ${hueco ? hueco.inicio : ""}`);
  return ok({ hueco, siguientes: hueco ? G.candidatosParaHueco(d, hueco, ahora).length : 0 });
}
export function quitarEspera(d, id, motivo = "") {
  const u = usuarioDe(d);
  const e = vivaDe(d, id);
  if (!e) return err("Esa solicitud ya no está en la lista.");
  if (!opera(d, u, e.sucursalId)) return NO_OPERA;
  cerrarEspera(d, e, "quitado", txt(motivo) || "Retirado por recepción");
  auditar(d, "quitar_lista_espera", "listaEspera", id, `${nomPac(d, e.pacienteId)} · ${txt(motivo) || "sin motivo"}`);
  return ok();
}
/** Reactiva una solicitud vencida (viva o del histórico): otros 14 días. */
export function reactivarEspera(d, id) {
  const u = usuarioDe(d);
  let e = vivaDe(d, id);
  const hist = !e ? A(d).esperaHist.find((x) => x.id === id) : null;
  if (!e && !hist) return err("Solicitud no encontrada.");
  if (!opera(d, u, (e || hist).sucursalId)) return NO_OPERA;
  if (hist) {
    if (hist.estado !== "vencida") return err("Solo se reactivan solicitudes vencidas.");
    if (d.listaEspera.some((x) => x.pacienteId === hist.pacienteId && x.servicioId === hist.servicioId && x.sucursalId === hist.sucursalId)) return err("El paciente ya tiene una solicitud viva para ese servicio.");
    d.agenda.esperaHist = d.agenda.esperaHist.filter((x) => x.id !== id);
    e = { ...hist }; delete e.cerradoEn; delete e.motivoCierre;
    d.listaEspera.push(e);
  } else if (G.estadoEspera(e, ahoraLocal(), G.paramsAgenda(d)) !== "vencida") return err("La solicitud sigue vigente.");
  Object.assign(e, { estado: "esperando", vence: sumarDias(hoy(), G.paramsAgenda(d).esperaVenceDias), hueco: null, notificadoHasta: null, reactivadaEn: ahoraLocal() });
  auditar(d, "reactivar_lista_espera", "listaEspera", id, `${nomPac(d, e.pacienteId)} · vence ${e.vence}`);
  return ok({ vence: e.vence });
}
/** Pasa al histórico las solicitudes vencidas (14 días) de una sucursal. */
export function archivarVencidas(d, { sucursalId, ahora = ahoraLocal() }) {
  const u = usuarioDe(d);
  if (!opera(d, u, sucursalId)) return NO_OPERA;
  const P = G.paramsAgenda(d);
  const venc = (d.listaEspera || []).filter((e) => e.sucursalId === sucursalId && G.estadoEspera(e, ahora, P) === "vencida");
  for (const e of venc) cerrarEspera(d, e, "vencida", `Venció a los ${P.esperaVenceDias} días sin respuesta`);
  if (venc.length) auditar(d, "archivar_lista_espera", "listaEspera", sucursalId, `${venc.length} solicitud(es) vencidas`);
  return ok({ archivadas: venc.length });
}
export function cambiarPrioridad(d, id, prioridad) {
  const u = usuarioDe(d);
  const e = vivaDe(d, id);
  if (!e) return err("Esa solicitud ya no está en la lista.");
  if (!opera(d, u, e.sucursalId)) return NO_OPERA;
  if (!G.PRIORIDADES[prioridad]) return err("Prioridad no válida.");
  const antes = e.prioridad || "media";
  e.prioridad = prioridad;
  auditar(d, "prioridad_lista_espera", "listaEspera", id, `${nomPac(d, e.pacienteId)} · ${antes} → ${prioridad}`);
  return ok();
}

// ═════════════════════════ Recordatorios (P-039) — envío MANUAL; la automatización está simulada
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
/** Enlace wa.me con el texto listo (lo envía la persona desde su WhatsApp). */
export const waEnlace = (tel, texto = "") => { let t = soloDigitos(tel); if (t.length === 10) t = "52" + t; return `https://wa.me/${t}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`; };
export const telEnlace = (tel) => `tel:+52${soloDigitos(tel).slice(-10)}`;
/**
 * Registra el resultado del recordatorio de una cita: "enviado" | "confirmo" | "reprogramo" | "sin_respuesta" | "cancelo".
 * «Confirmó» además confirma la cita. Reprogramar o cancelar la cita se hace en la agenda de recepción: aquí solo queda el resultado.
 */
export function marcarRecordatorio(d, citaId, estado, { canal = null, ahora = ahoraLocal(), simulado = false } = {}) {
  const u = usuarioDe(d);
  const c = d.citas.find((x) => x.id === citaId);
  if (!c) return err("Cita no encontrada.");
  if (!opera(d, u, c.sucursalId)) return NO_OPERA;
  if (!G.ESTADOS_RECORDATORIO[estado] || estado === "pendiente") return err("Resultado no válido.");
  const l = A(d).recordatorios;
  let rec = l.find((x) => x.citaId === citaId);
  if (!rec) {
    if (!G.esPendiente(c)) return err("La cita ya no está pendiente: no hay nada que recordar.");
    const pac = d.pacientes.find((p) => p.id === c.pacienteId);
    rec = { id: uid("RC"), citaId, sucursalId: c.sucursalId, fecha: dia(c.inicio), estado: "enviado", canal: canal || (pac && pac.whatsapp ? "whatsapp" : "llamada"), enviadoEn: ahora, enviadoPor: u.id, respuestaEn: null };
    if (simulado) rec.simulado = true;
    l.unshift(rec);
  } else if (canal) rec.canal = canal;
  rec.estado = estado;
  rec.respuestaEn = ["confirmo", "reprogramo", "cancelo"].includes(estado) ? ahora : null;
  if (estado === "confirmo" && ["agendada", "por_confirmar"].includes(c.estado)) { c.estado = "confirmada"; c.confirmadaEn = ahora; }
  if (l.length > 1500) l.length = 1500;
  auditar(d, "recordatorio_cita", "cita", citaId, `${G.ESTADOS_RECORDATORIO[estado][0]} · ${nomPac(d, c.pacienteId)} · ${rec.canal}${simulado ? " · SIMULADO" : ""}`);
  return ok({ id: rec.id });
}
/** Plantilla del mensaje ("recordatorio" o "espera"): gerente, Administración o Dirección. */
export function guardarPlantilla(d, clave, texto) {
  const u = usuarioDe(d);
  if (!u || !(esCentral(u) || u.rol === "gerente")) return NO_GESTION;
  if (!["recordatorio", "espera"].includes(clave)) return err("Plantilla no válida.");
  const t = txt(texto);
  if (t.length < 20) return err("El mensaje es demasiado corto.");
  if (!t.includes("{fecha}") || !t.includes("{hora}")) return err("El mensaje debe incluir {fecha} y {hora}.");
  (A(d).plantillas ||= {})[clave] = t;
  auditar(d, "plantilla_agenda", "agenda", clave, t.slice(0, 80));
  return ok();
}
export function restaurarPlantilla(d, clave) { return guardarPlantilla(d, clave, clave === "espera" ? G.PLANTILLA_ESPERA : G.PLANTILLA_RECORDATORIO); }

// INTEGRACIÓN: WhatsApp Business API (envío automático de recordatorios 24 h antes y lectura de la respuesta 1/2 del paciente).
// Hoy NO hay proveedor contratado: esta función solo SIMULA el envío. No sale ningún mensaje; los registros quedan marcados
// `simulado:true` y la pantalla lo rotula. En producción aquí va la llamada al proveedor y un webhook que llame a marcarRecordatorio().
function enviarWhatsAppSimulado(/* telefono, texto */) { return { simulado: true, proveedor: null }; }
/** Simula el envío automático de la cola: marca «enviado (simulado)» los recordatorios que ya tocan (24 h antes). */
export function simularEnvioAutomatico(d, { sucursalId, fecha = null, ahora = ahoraLocal() }) {
  const u = usuarioDe(d);
  if (!opera(d, u, sucursalId)) return NO_OPERA;
  const cola = G.colaRecordatorios(d, { sucursalId, fecha, ahora }).filter((x) => x.toca);
  let n = 0;
  for (const x of cola) {
    const pac = d.pacientes.find((p) => p.id === x.cita.pacienteId);
    if (!pac || !pac.whatsapp) continue;
    const r = enviarWhatsAppSimulado(pac.telefono, G.textoRecordatorio(d, x.cita));
    if (marcarRecordatorio(d, x.cita.id, "enviado", { canal: "whatsapp", ahora, simulado: r.simulado }).ok) n++;
  }
  return ok({ enviados: n, sinWhatsApp: cola.length - n, simulado: true });
}

// ═════════════════════════ Reserva en línea: retención de horario y anticipo (P-034, P-036) — reglas listas para el portal
/** Retiene 10 min un horario mientras el paciente paga su anticipo (30 %). No requiere sesión (lo llamará el portal). */
export function retenerHorario(d, { sucursalId, podologoId, pacienteId = null, servicioId, inicio, precio = 0 }, { ahora = ahoraLocal() } = {}) {
  const sv = d.servicios.find((s) => s.id === servicioId);
  if (!sv || !FH.test(inicio)) return err("Faltan datos de la reserva.");
  const P = G.paramsAgenda(d);
  const v = G.validarCita(d, { sucursalId, podologoId, pacienteId, inicio, duracion: sv.duracion }, { ahora });
  if (!v.ok) return { ok: false, error: v.textos[0], errores: v.errores };
  const ret = { id: uid("RT"), sucursalId, podologoId, pacienteId, servicioId, inicio, duracion: sv.duracion, creadaEn: ahora, vence: G.masMin(ahora, P.retencionMin), anticipo: G.anticipoReserva(precio || sv.precioBase, sv, P.anticipoPortalPct), liberada: false };
  A(d).retenciones.push(ret);
  if (d.agenda.retenciones.length > 100) d.agenda.retenciones.splice(0, d.agenda.retenciones.length - 100);
  return ok({ id: ret.id, vence: ret.vence, anticipo: ret.anticipo });
}
/** Al pagarse el anticipo dentro de los 10 min la retención se vuelve cita; vencida, el horario ya se liberó. */
export function confirmarRetencion(d, id, { ahora = ahoraLocal(), pacienteId = null } = {}) {
  const P = G.paramsAgenda(d);
  const ret = A(d).retenciones.find((x) => x.id === id);
  if (!ret || ret.liberada) return err("La retención ya no existe.");
  if (!G.retencionVigente(ret, ahora, P.retencionMin)) { ret.liberada = true; return err(`La retención de ${P.retencionMin} min venció: el horario se liberó.`); }
  const base = { pacienteId: pacienteId || ret.pacienteId, servicioId: ret.servicioId, podologoId: ret.podologoId, sucursalId: ret.sucursalId, inicio: ret.inicio, duracion: ret.duracion };
  if (!base.pacienteId) return err("Falta el paciente de la reserva.");
  const opts = { ahora, retencionId: ret.id };
  const cons = G.validarCita(d, base, opts).ok ? consultorioPara(d, base, opts) : null;
  if (!cons) return err("El horario ya no está disponible.");
  const c = nuevaCita(d, { ...base, consultorioId: cons }, { estado: "confirmada", confirmadaEn: ahora, origen: "portal", anticipo: ret.anticipo, anticipoEstado: ret.anticipo > 0 ? "pagado" : "sin_anticipo", reprogramaciones: 0 });
  ret.liberada = true; ret.citaId = c.id;
  auditar(d, "reserva_en_linea", "cita", c.id, `${base.inicio} · anticipo ${ret.anticipo}`);
  return ok({ citaId: c.id, anticipo: ret.anticipo });
}
