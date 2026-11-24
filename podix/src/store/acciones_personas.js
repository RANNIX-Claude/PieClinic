// Acciones del dominio «personas»: RH, checador, horarios, incidencias, vacaciones, nómina, capacitación y acervo.
// Cada acción tiene una versión *D(d, …) pura sobre el borrador (probada en tests/personas.test.js) y su envoltura que corre dentro de mutar().
// Los permisos se validan DENTRO de la acción (no solo escondiendo botones) y toda acción sensible llama auditar().
// Las reglas puras (retardo, saldo de vacaciones, nómina, YouTube, progreso…) viven en reglas_personas.js y se re-exportan aquí.
import { mutar, auditar, folio, uid } from "./core.js";
import * as P from "./reglas_personas.js";
import { hoy, ahoraLocal, dia, hora, sumarDias, diasEntre } from "../lib/format.js";

export * from "./reglas_personas.js";

const err = (error) => ({ ok: false, error });
const ok = (x = {}) => ({ ok: true, ...x });
const usuarioActual = (d) => d.usuarios.find((u) => u.id === d.sesion.userId) || null;
const esAdmin = (u) => !!u && ["admin", "direccion"].includes(u.rol);
const esGerente = (u) => !!u && u.rol === "gerente";
const esGestor = (u) => esAdmin(u) || esGerente(u);
export const empleadoDeUsuario = (d, usuarioId) => d.rh.empleados.find((e) => e.usuarioId === usuarioId) || null;
const empleadoPorId = (d, id) => d.rh.empleados.find((e) => e.id === id) || null;
/** ¿El usuario puede gestionar a este empleado? Admin/dirección: todos. Gerente: quien trabaje en alguna de sus sucursales. */
export function puedeGestionarEmpleado(u, emp) {
  if (!u || !emp) return false;
  if (esAdmin(u)) return true;
  return esGerente(u) && emp.sucursales.some((s) => u.sucursales.includes(s));
}
/** Un gestor no puede aprobar lo propio. */
const esPropio = (u, emp) => !!u && !!emp && emp.usuarioId === u.id;

/** Empleados activos que pueden trabajar en la sucursal (o todos si sucursalId es null). Lo usan otros dominios (bonos, etc.). */
export function empleadosActivos(d, sucursalId = null) {
  return d.rh.empleados.filter((e) => e.estado === "activo" && (!sucursalId || e.sucursales.includes(sucursalId)));
}
/** Sucursales que el usuario ve en RH: admin/dirección todas; gerente las suyas. */
export const sucursalesVisibles = (d, u) => (esAdmin(u) ? d.sucursales.map((s) => s.id) : u ? u.sucursales.filter((s) => d.sucursales.some((x) => x.id === s)) : []);

const envolver = (fn) => (...a) => mutar((d) => fn(d, ...a));

// ═════════════════════════ CHECADOR
function prepararChecada(d, ahora) {
  const u = usuarioActual(d);
  if (!u) return err("No hay sesión iniciada.");
  const e = empleadoDeUsuario(d, u.id);
  if (!e) return err("Tu cuenta no tiene ficha de empleado.");
  if (e.estado !== "activo") return err("Tu ficha de empleado está dada de baja.");
  const sucursalId = d.sesion.sucursalId;
  if (!sucursalId) return err("Elige primero la sucursal donde trabajas hoy.");
  const ts = ahora || ahoraLocal();
  return { u, e, sucursalId, fecha: dia(ts), h: hora(ts) };
}
/** Registra la entrada del usuario actual en la sucursal activa. Una sola entrada por día. */
export function registrarEntradaD(d, ahora) {
  const c = prepararChecada(d, ahora);
  if (c.ok === false) return c;
  const { u, e, sucursalId, fecha, h } = c;
  const aus = P.ausenciaDe(d, e.id, fecha);
  if (aus && aus.estado !== "permiso") return err(`Hoy tienes ${aus.estado === "vacaciones" ? "vacaciones" : "una incapacidad"} aprobada: no se registra entrada.`);
  const previo = d.rh.asistencia.find((a) => a.empleadoId === e.id && a.fecha === fecha);
  if (previo && previo.entrada) return err(`Ya registraste tu entrada hoy a las ${previo.entrada}.`);
  const cl = P.clasificarEntrada(h, e.horario.entrada, P.paramsRH(d).toleranciaMin);
  const programada = P.sucursalHoy(d, e.id, fecha);
  const dato = { entrada: h, salida: null, estado: cl.estado, minutosTarde: cl.minutosTarde, sucursalId, programada, usuarioId: u.id };
  if (previo) Object.assign(previo, dato); // un día marcado como falta que sí se presentó
  else d.rh.asistencia.push({ id: uid("AT"), empleadoId: e.id, fecha, ...dato });
  auditar(d, "checador_entrada", "asistencia", e.id, `${h} en ${P.nombreSuc(d, sucursalId)}${cl.estado === "retardo" ? ` (retardo ${cl.minutosTarde} min)` : ""}`);
  return ok({ estado: cl.estado, hora: h, minutosTarde: cl.minutosTarde, fueraDeAsignacion: programada !== sucursalId });
}
export function registrarSalidaD(d, ahora) {
  const c = prepararChecada(d, ahora);
  if (c.ok === false) return c;
  const { e, sucursalId, fecha, h } = c;
  const reg = d.rh.asistencia.find((a) => a.empleadoId === e.id && a.fecha === fecha && a.entrada);
  if (!reg) return err("Primero registra tu entrada.");
  if (reg.salida) return err(`Ya registraste tu salida hoy a las ${reg.salida}.`);
  if (P.aMin(h) < P.aMin(reg.entrada)) return err("La salida no puede ser anterior a la entrada.");
  reg.salida = h; reg.sucursalSalida = sucursalId;
  auditar(d, "checador_salida", "asistencia", e.id, `${h} en ${P.nombreSuc(d, sucursalId)}`);
  return ok({ hora: h });
}
export const registrarEntrada = envolver(registrarEntradaD);
export const registrarSalida = envolver(registrarSalidaD);

/** Tablero de asistencia de un día: por sucursal (null = todas). Quién debía venir, quién entró/salió, retardos y faltas. */
export function asistenciaDia(d, { fecha = hoy(), sucursalId = null } = {}) {
  const filas = [];
  d.rh.empleados.forEach((e) => {
    const st = P.estadoDia(d, e, fecha);
    if (st.estado === "baja") return;
    const rSuc = st.registro ? st.registro.sucursalId : null;
    const aqui = !sucursalId || st.programada === sucursalId || rSuc === sucursalId;
    if (!aqui) return;
    if (st.estado === "descanso" && !st.registro) return;
    filas.push({ empleado: e, estado: st.estado, registro: st.registro, programada: st.programada });
  });
  const cuenta = (k) => filas.filter((f) => f.estado === k).length;
  const dentro = filas.filter((f) => f.registro && f.registro.entrada && !f.registro.salida).length;
  return { filas, resumen: { esperados: filas.length, presentes: filas.filter((f) => f.registro && f.registro.entrada).length, dentro, retardos: cuenta("retardo"), faltas: cuenta("falta"), sinRegistro: cuenta("sin_registro") + cuenta("pendiente"), ausentesJustificados: cuenta("vacaciones") + cuenta("incapacidad") + cuenta("permiso") } };
}
/** Quién está en la sucursal en este momento (entró y no ha salido). */
export function quienEstaHoy(d, sucursalId, fecha = hoy()) {
  return d.rh.asistencia.filter((a) => a.fecha === fecha && a.entrada && !a.salida && (!sucursalId || a.sucursalId === sucursalId)).map((a) => ({ empleado: empleadoPorId(d, a.empleadoId), registro: a })).filter((x) => x.empleado);
}
/** Marca como falta a quien debía venir y no tiene marca (día pasado). Solo gestor de la sucursal. */
export function marcarFaltasDiaD(d, { fecha, sucursalId }) {
  const u = usuarioActual(d);
  if (!esGestor(u) || (esGerente(u) && !u.sucursales.includes(sucursalId))) return err("Solo el gerente de la sucursal o administración pueden marcar faltas.");
  if (fecha >= hoy()) return err("Solo se pueden marcar faltas de días anteriores a hoy.");
  let n = 0;
  d.rh.empleados.forEach((e) => {
    const st = P.estadoDia(d, e, fecha);
    if (st.estado === "sin_registro" && st.programada === sucursalId) {
      d.rh.asistencia.push({ id: uid("AT"), empleadoId: e.id, fecha, sucursalId, entrada: null, salida: null, estado: "falta", minutosTarde: 0, usuarioId: u.id });
      n++;
    }
  });
  auditar(d, "marcar_faltas", "asistencia", sucursalId, `${fecha}: ${n} falta(s)`);
  return ok({ n });
}
export const marcarFaltasDia = envolver(marcarFaltasDiaD);

export function guardarParametrosRHD(d, { toleranciaMin, retardosPorFalta }) {
  const u = usuarioActual(d);
  if (!esAdmin(u)) return err("Solo administración o dirección pueden cambiar los parámetros de RH.");
  const t = Number(toleranciaMin), k = Number(retardosPorFalta);
  if (!(t >= 0 && t <= 60)) return err("La tolerancia debe estar entre 0 y 60 minutos.");
  if (!(k >= 1 && k <= 10)) return err("Los retardos por falta deben estar entre 1 y 10.");
  d.rh.params = { ...P.paramsRH(d), toleranciaMin: t, retardosPorFalta: k };
  auditar(d, "parametros_rh", "rh", "params", `tolerancia ${t} min; ${k} retardos = 1 falta`);
  return ok();
}
export const guardarParametrosRH = envolver(guardarParametrosRHD);

// ═════════════════════════ HORARIOS / ASIGNACIONES
/** Define dónde trabaja una persona un día de la semana (dow 0=domingo…6) o una fecha concreta. sucursalId null = descanso. */
export function asignarSucursalD(d, { empleadoId, dow = null, fecha = null, sucursalId }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!e) return err("Empleado no encontrado.");
  if (!puedeGestionarEmpleado(u, e)) return err("No tienes permiso para programar a esta persona.");
  if (e.estado !== "activo") return err("El empleado está dado de baja.");
  if (sucursalId != null && !e.sucursales.includes(sucursalId)) return err(`${e.nombre} no tiene autorizada esa sucursal.`);
  if (fecha == null && !(dow >= 0 && dow <= 6)) return err("Indica un día de la semana o una fecha.");
  d.rh.asignaciones = d.rh.asignaciones.filter((a) => !(a.empleadoId === empleadoId && (fecha ? a.fecha === fecha : a.fecha == null && a.dow === dow)));
  d.rh.asignaciones.push(fecha ? { id: uid("AS"), empleadoId, fecha, sucursalId, usuarioId: u.id } : { id: uid("AS"), empleadoId, dow, sucursalId, usuarioId: u.id });
  auditar(d, "asignar_sucursal", "empleado", empleadoId, `${fecha || P.NOMBRE_DIA[dow]}: ${sucursalId ? P.nombreSuc(d, sucursalId) : "descanso"}`);
  return ok();
}
/** Quita la excepción de una fecha concreta (vuelve a regir la programación semanal). */
export function quitarExcepcionD(d, { empleadoId, fecha }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!e) return err("Empleado no encontrado.");
  if (!puedeGestionarEmpleado(u, e)) return err("No tienes permiso para programar a esta persona.");
  const antes = d.rh.asignaciones.length;
  d.rh.asignaciones = d.rh.asignaciones.filter((a) => !(a.empleadoId === empleadoId && a.fecha === fecha));
  if (d.rh.asignaciones.length === antes) return err("Esa fecha no tiene excepción.");
  auditar(d, "quitar_excepcion", "empleado", empleadoId, fecha);
  return ok();
}
export const asignarSucursal = envolver(asignarSucursalD);
export const quitarExcepcion = envolver(quitarExcepcionD);

// ═════════════════════════ INCIDENCIAS
export const TIPOS_INCIDENCIA = [
  { v: "permiso", l: "Permiso con goce", justifica: true }, { v: "incapacidad", l: "Incapacidad IMSS", justifica: true }, { v: "falta_justificada", l: "Falta justificada", justifica: true },
  { v: "llamada", l: "Llamada de atención" }, { v: "acta", l: "Acta administrativa" }, { v: "otro", l: "Otra" },
];
/** Alta de incidencia. El gestor la deja aprobada/registrada; el propio empleado solo puede SOLICITAR permiso o avisar incapacidad. */
export function registrarIncidenciaD(d, { empleadoId, tipo, desde, hasta, detalle }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!u || !e) return err("Empleado no encontrado.");
  if (!TIPOS_INCIDENCIA.some((t) => t.v === tipo)) return err("Tipo de incidencia no válido.");
  if (!desde) return err("Indica la fecha.");
  hasta = hasta || desde;
  if (hasta < desde) return err("La fecha final no puede ser anterior a la inicial.");
  if (!String(detalle || "").trim()) return err("Describe brevemente la incidencia.");
  const propio = e.usuarioId === u.id;
  const gestor = puedeGestionarEmpleado(u, e);
  if (!gestor && !(propio && ["permiso", "incapacidad"].includes(tipo))) return err("No tienes permiso para registrar esta incidencia.");
  const justifica = TIPOS_INCIDENCIA.find((t) => t.v === tipo).justifica;
  const estado = !justifica ? "registrada" : gestor && !propio ? "aprobada" : "solicitada";
  const x = { id: uid("IN"), empleadoId, tipo, desde, hasta, detalle: String(detalle).trim(), estado, usuarioId: u.id, sucursalId: d.sesion.sucursalId, ts: ahoraLocal() };
  d.rh.incidencias.unshift(x);
  if (estado === "aprobada") materializarAusencia(d, e, desde, hasta, tipo === "incapacidad" ? "incapacidad" : null, u);
  auditar(d, "incidencia_alta", "empleado", empleadoId, `${tipo} ${desde}${hasta !== desde ? ` a ${hasta}` : ""} (${estado})`);
  return ok({ incidencia: x });
}
export function resolverIncidenciaD(d, { id, decision }) {
  const u = usuarioActual(d);
  const x = d.rh.incidencias.find((i) => i.id === id), e = x && empleadoPorId(d, x.empleadoId);
  if (!x) return err("Incidencia no encontrada.");
  if (x.estado !== "solicitada") return err("La solicitud ya fue resuelta.");
  if (!puedeGestionarEmpleado(u, e)) return err("Solo el gerente de la sucursal o administración pueden resolverla.");
  if (esPropio(u, e)) return err("No puedes aprobar tu propia solicitud: lo hace otra persona.");
  if (!["aprobada", "rechazada"].includes(decision)) return err("Decisión no válida.");
  x.estado = decision; x.resueltoPor = u.id; x.resueltoEn = ahoraLocal();
  if (decision === "aprobada") materializarAusencia(d, e, x.desde, x.hasta, x.tipo === "incapacidad" ? "incapacidad" : null, u);
  auditar(d, "incidencia_resuelta", "empleado", e.id, `${x.tipo}: ${decision}`);
  return ok();
}
export const registrarIncidencia = envolver(registrarIncidenciaD);
export const resolverIncidencia = envolver(resolverIncidenciaD);

/** Escribe en la asistencia las ausencias justificadas de días ya transcurridos (la asistencia las infiere además de las incidencias). */
function materializarAusencia(d, e, desde, hasta, estado, u) {
  if (!estado) return;
  for (let f = desde; f <= hasta && f <= hoy(); f = sumarDias(f, 1)) {
    if (!P.trabajaEseDia(d, e.id, f)) continue;
    const prev = d.rh.asistencia.find((a) => a.empleadoId === e.id && a.fecha === f);
    if (prev && prev.entrada) continue;
    if (prev) { prev.estado = estado; continue; }
    d.rh.asistencia.push({ id: uid("AT"), empleadoId: e.id, fecha: f, sucursalId: P.sucursalHoy(d, e.id, f), entrada: null, salida: null, estado, minutosTarde: 0, usuarioId: u ? u.id : null });
  }
}

// ═════════════════════════ VACACIONES
export function solicitarVacacionesD(d, { empleadoId = null, desde, hasta, nota = "" }) {
  const u = usuarioActual(d);
  const e = empleadoId ? empleadoPorId(d, empleadoId) : u && empleadoDeUsuario(d, u.id);
  if (!u || !e) return err("No se encontró al empleado.");
  const propio = e.usuarioId === u.id;
  if (!propio && !puedeGestionarEmpleado(u, e)) return err("No tienes permiso para solicitar vacaciones de esta persona.");
  if (e.estado !== "activo") return err("El empleado está dado de baja.");
  if (!desde || !hasta || hasta < desde) return err("Revisa las fechas: la final no puede ser anterior a la inicial.");
  if (desde < hoy() && !esGestor(u)) return err("Las vacaciones se solicitan con fecha de hoy en adelante.");
  const dias = P.diasLaborables(d, e.id, desde, hasta);
  if (dias < 1) return err("Ese periodo no incluye días laborables para esta persona.");
  const s = P.saldoVacaciones(d, e);
  if (s.anios < 1) return err("Aún no cumple un año de antigüedad: no tiene días de vacaciones.");
  if (dias > s.disponible) return err(`Solo hay ${s.disponible} día(s) disponibles (derecho ${s.derecho}, tomados ${s.tomados}, por aprobar ${s.pendientes}).`);
  const choca = d.rh.vacaciones.find((v) => v.empleadoId === e.id && ["solicitada", "aprobada"].includes(v.estado) && v.desde <= hasta && v.hasta >= desde);
  if (choca) return err(`Se empalma con otra solicitud (${choca.desde} a ${choca.hasta}).`);
  const x = { id: uid("V"), empleadoId: e.id, desde, hasta, dias, estado: "solicitada", usuarioId: u.id, sucursalId: d.sesion.sucursalId, solicitadoEn: hoy(), resueltoPor: null, resueltoEn: null, motivo: "", nota };
  d.rh.vacaciones.unshift(x);
  auditar(d, "vacaciones_solicitud", "empleado", e.id, `${desde} a ${hasta} (${dias} días)`);
  return ok({ vacacion: x });
}
export function resolverVacacionesD(d, { id, decision, motivo = "" }) {
  const u = usuarioActual(d);
  const x = d.rh.vacaciones.find((v) => v.id === id), e = x && empleadoPorId(d, x.empleadoId);
  if (!x) return err("Solicitud no encontrada.");
  if (x.estado !== "solicitada") return err("La solicitud ya fue resuelta.");
  if (!puedeGestionarEmpleado(u, e)) return err("Solo el gerente de la sucursal o administración pueden aprobar vacaciones.");
  if (esPropio(u, e)) return err("No puedes aprobar tus propias vacaciones: lo hace otra persona.");
  if (!["aprobada", "rechazada"].includes(decision)) return err("Decisión no válida.");
  if (decision === "rechazada" && !String(motivo).trim()) return err("Escribe el motivo del rechazo.");
  if (decision === "aprobada") {
    const s = P.saldoVacaciones(d, e);
    if (x.dias > s.saldo) return err(`El saldo (${s.saldo} días) ya no alcanza para ${x.dias} días.`);
  }
  x.estado = decision; x.resueltoPor = u.id; x.resueltoEn = hoy(); x.motivo = motivo;
  if (decision === "aprobada") materializarAusencia(d, e, x.desde, x.hasta, "vacaciones", u);
  auditar(d, "vacaciones_resuelta", "empleado", e.id, `${x.desde} a ${x.hasta}: ${decision}`);
  return ok();
}
export function cancelarVacacionesD(d, { id }) {
  const u = usuarioActual(d);
  const x = d.rh.vacaciones.find((v) => v.id === id), e = x && empleadoPorId(d, x.empleadoId);
  if (!x) return err("Solicitud no encontrada.");
  if (x.estado !== "solicitada") return err("Solo se pueden cancelar solicitudes pendientes.");
  if (!(esPropio(u, e) || puedeGestionarEmpleado(u, e))) return err("No tienes permiso para cancelar esta solicitud.");
  d.rh.vacaciones = d.rh.vacaciones.filter((v) => v.id !== id);
  auditar(d, "vacaciones_cancelada", "empleado", e.id, `${x.desde} a ${x.hasta}`);
  return ok();
}
export const solicitarVacaciones = envolver(solicitarVacacionesD);
export const resolverVacaciones = envolver(resolverVacacionesD);
export const cancelarVacaciones = envolver(cancelarVacacionesD);

// ═════════════════════════ EMPLEADOS, EXPEDIENTE Y MOVIMIENTOS
const CAMPOS_CONTACTO = ["telefono", "correo", "domicilio", "emergencia", "foto", "nacimiento", "curp", "rfc", "nss", "horario"];
const CAMPOS_ADMIN = ["nombre", "puesto", "sucursalBase", "sucursales", "sueldoMensual", "contrato"];
function movimiento(d, e, tipo, detalle, extra = {}) {
  d.rh.movimientos.unshift({ id: uid("MV"), empleadoId: e.id, fecha: extra.fecha || hoy(), tipo, detalle, motivo: extra.motivo || "", finiquito: extra.finiquito || null,
    imss: extra.imss === null ? { estado: "no_aplica" } : { estado: "pendiente_envio", aviso: tipo === "alta" || tipo === "reingreso" ? "Alta" : tipo === "baja" ? "Baja" : "Modificación de salario" },
    usuarioId: d.sesion.userId, sucursalId: d.sesion.sucursalId });
}
/** Edita la ficha. Contacto/foto/horario: el gestor de la persona (o ella misma: foto, teléfono, domicilio, emergencia). Sueldo, puesto, sucursales y contrato: solo administración. */
export function actualizarEmpleadoD(d, { id, cambios }) {
  const u = usuarioActual(d), e = empleadoPorId(d, id);
  if (!e) return err("Empleado no encontrado.");
  const propio = esPropio(u, e), gestor = puedeGestionarEmpleado(u, e);
  const permitidos = esAdmin(u) ? [...CAMPOS_CONTACTO, ...CAMPOS_ADMIN] : gestor ? CAMPOS_CONTACTO : propio ? ["foto", "telefono", "domicilio", "emergencia"] : [];
  if (!permitidos.length) return err("No tienes permiso para editar esta ficha.");
  const campos = Object.keys(cambios);
  const vetado = campos.find((k) => !permitidos.includes(k));
  if (vetado) return err(`No tienes permiso para cambiar «${vetado}».`);
  if ("sueldoMensual" in cambios && !(Number(cambios.sueldoMensual) > 0)) return err("El sueldo debe ser mayor a cero.");
  if ("horario" in cambios && !(cambios.horario && cambios.horario.entrada && cambios.horario.salida && P.aMin(cambios.horario.salida) > P.aMin(cambios.horario.entrada))) return err("La salida debe ser posterior a la entrada.");
  if ("sucursales" in cambios) {
    if (!cambios.sucursales.length) return err("Debe tener al menos una sucursal.");
    if ("sucursalBase" in cambios ? !cambios.sucursales.includes(cambios.sucursalBase) : !cambios.sucursales.includes(e.sucursalBase)) return err("La sucursal base debe estar entre las sucursales donde puede trabajar.");
  }
  const antes = { sueldo: e.sueldoMensual, puesto: e.puesto, base: e.sucursalBase };
  campos.forEach((k) => { e[k] = k === "sueldoMensual" ? Number(cambios[k]) : cambios[k]; });
  if (e.usuarioId && "sucursales" in cambios && e.sucursalBase !== "CEN") { const us = d.usuarios.find((x) => x.id === e.usuarioId); if (us) us.sucursales = [...cambios.sucursales]; }
  if (e.sueldoMensual !== antes.sueldo) movimiento(d, e, "cambio", `Sueldo mensual de $${antes.sueldo.toLocaleString("es-MX")} a $${e.sueldoMensual.toLocaleString("es-MX")}`);
  else if (e.puesto !== antes.puesto || e.sucursalBase !== antes.base) movimiento(d, e, "cambio", `Cambio de puesto o sucursal base (${antes.puesto} → ${e.puesto})`, { imss: null });
  auditar(d, "empleado_editado", "empleado", id, campos.join(", "));
  return ok();
}
export function marcarDocumentoD(d, { empleadoId, doc, ok: entregado }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!e) return err("Empleado no encontrado.");
  if (!puedeGestionarEmpleado(u, e)) return err("Solo el gerente de la sucursal o administración actualizan el expediente.");
  if (!P.docsRequeridos(e).some((x) => x.k === doc)) return err("Documento no válido para este puesto.");
  e.expediente = e.expediente || {};
  if (entregado) e.expediente[doc] = { ok: true, fecha: hoy(), usuarioId: u.id }; else delete e.expediente[doc];
  if (doc === "contrato") e.contrato = { ...e.contrato, firmado: !!entregado };
  auditar(d, "expediente", "empleado", empleadoId, `${doc}: ${entregado ? "entregado" : "pendiente"}`);
  return ok({ avance: P.avanceExpediente(e) });
}
export function altaEmpleadoD(d, datos) {
  const u = usuarioActual(d);
  if (!esAdmin(u)) return err("Solo administración o dirección dan de alta personal.");
  const nombre = String(datos.nombre || "").trim();
  if (nombre.length < 5) return err("Escribe el nombre completo.");
  if (!P.ROLES_GESTION.concat(["recepcion", "podologo", "asistente", "cajero", "almacen"]).includes(datos.rol)) return err("Rol no válido.");
  if (!d.sucursales.some((s) => s.id === datos.sucursalBase)) return err("Elige la sucursal base.");
  if (!(Number(datos.sueldoMensual) > 0)) return err("El sueldo debe ser mayor a cero.");
  if (!datos.ingreso) return err("Indica la fecha de ingreso.");
  if (datos.usuarioId && d.rh.empleados.some((x) => x.usuarioId === datos.usuarioId)) return err("Ese usuario ya tiene ficha de empleado.");
  const id = `E${d.rh.empleados.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, "")) || 0), 0) + 1}`;
  const sucursales = (datos.sucursales && datos.sucursales.length ? datos.sucursales : [datos.sucursalBase]);
  const e = { id, usuarioId: datos.usuarioId || null, nombre, rol: datos.rol, puesto: datos.puesto || datos.rol, sucursalBase: datos.sucursalBase, sucursales, sueldoMensual: Number(datos.sueldoMensual), ingreso: datos.ingreso, estado: "activo", foto: null,
    nacimiento: datos.nacimiento || "", telefono: datos.telefono || "", correo: datos.correo || "", domicilio: datos.domicilio || "", curp: "", rfc: "", nss: "", emergencia: { nombre: "", parentesco: "", telefono: "" },
    contrato: { tipo: "A prueba (30 días)", inicio: datos.ingreso, fin: sumarDias(datos.ingreso, 30), firmado: false }, horario: datos.horario || { entrada: "09:00", salida: "18:00" }, expediente: {} };
  d.rh.empleados.push(e);
  movimiento(d, e, "alta", `Alta como ${e.puesto}`, { fecha: datos.ingreso });
  auditar(d, "empleado_alta", "empleado", id, nombre);
  return ok({ empleado: e });
}
export function bajaEmpleadoD(d, { empleadoId, fecha = hoy(), motivo }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!e) return err("Empleado no encontrado.");
  if (!esAdmin(u)) return err("Solo administración o dirección registran bajas.");
  if (e.estado !== "activo") return err("El empleado ya está dado de baja.");
  if (!String(motivo || "").trim()) return err("El motivo de la baja es obligatorio.");
  if (e.usuarioId === u.id) return err("No puedes darte de baja a ti mismo.");
  const fin = P.calcularFiniquito(e, fecha, d);
  e.estado = "baja"; e.bajaFecha = fecha; e.bajaMotivo = String(motivo).trim();
  if (e.usuarioId) { const us = d.usuarios.find((x) => x.id === e.usuarioId); if (us) us.activo = false; } // sin acceso al sistema
  d.rh.vacaciones = d.rh.vacaciones.filter((v) => !(v.empleadoId === e.id && v.estado === "solicitada"));
  movimiento(d, e, "baja", `Baja: ${e.bajaMotivo}`, { fecha, motivo: e.bajaMotivo, finiquito: { estado: "por_pagar", ...fin } });
  auditar(d, "empleado_baja", "empleado", e.id, `${e.nombre}: ${e.bajaMotivo}; finiquito estimado $${fin.total}`);
  return ok({ finiquito: fin });
}
export function reingresoEmpleadoD(d, { empleadoId, fecha = hoy(), sueldoMensual = null }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!e) return err("Empleado no encontrado.");
  if (!esAdmin(u)) return err("Solo administración o dirección registran reingresos.");
  if (e.estado !== "baja") return err("El empleado está activo.");
  if (fecha < e.bajaFecha) return err("El reingreso no puede ser anterior a la baja.");
  e.ingresoOriginal = e.ingresoOriginal || e.ingreso;
  e.estado = "activo"; e.ingreso = fecha; delete e.bajaFecha; delete e.bajaMotivo;
  if (sueldoMensual && Number(sueldoMensual) > 0) e.sueldoMensual = Number(sueldoMensual);
  e.contrato = { tipo: "A prueba (30 días)", inicio: fecha, fin: sumarDias(fecha, 30), firmado: false };
  if (e.usuarioId) { const us = d.usuarios.find((x) => x.id === e.usuarioId); if (us) us.activo = true; }
  movimiento(d, e, "reingreso", "Reingreso", { fecha });
  auditar(d, "empleado_reingreso", "empleado", e.id, e.nombre);
  return ok();
}
export const actualizarEmpleado = envolver(actualizarEmpleadoD);
export const marcarDocumento = envolver(marcarDocumentoD);
export const altaEmpleado = envolver(altaEmpleadoD);
export const bajaEmpleado = envolver(bajaEmpleadoD);
export const reingresoEmpleado = envolver(reingresoEmpleadoD);

// ═════════════════════════ NÓMINA (demostración; el timbrado CFDI de nómina está pendiente)
export function generarReciboD(d, { empleadoId, tipo, mes, q = 1 }) {
  const u = usuarioActual(d), e = empleadoPorId(d, empleadoId);
  if (!e) return err("Empleado no encontrado.");
  if (!puedeGestionarEmpleado(u, e)) return err("Solo el gerente de la sucursal o administración generan recibos.");
  const per = P.rangoPeriodo(tipo, mes, q);
  const prev = (d.rh.recibos ||= []).find((x) => x.empleadoId === e.id && P.claveRecibo(x.periodo) === P.claveRecibo(per));
  if (prev && prev.firmado) return err("El recibo ya está firmado; no se recalcula.");
  const c = P.calcularNomina(d, e, per);
  const datos = { empleadoId: e.id, sucursalId: e.sucursalBase, periodo: per, ...c, firmado: false, generado: hoy(), usuarioId: u.id, sucursalGen: d.sesion.sucursalId };
  let rec = prev;
  if (prev) Object.assign(prev, datos); else { const f = folio(d, "RN"); rec = { id: f, folio: f, ...datos }; d.rh.recibos.push(rec); }
  auditar(d, "recibo_generado", "empleado", e.id, `${rec.folio} ${per.etiqueta}: $${c.total}`);
  return ok({ recibo: rec });
}
export function generarRecibosSucursalD(d, { sucursalId, tipo, mes, q = 1 }) {
  const u = usuarioActual(d);
  if (!esGestor(u) || (esGerente(u) && !u.sucursales.includes(sucursalId))) return err("Solo el gerente de la sucursal o administración generan recibos.");
  const nom = P.nominaSucursal(d, { sucursalId, tipo, mes, q });
  let n = 0;
  nom.filas.forEach((f) => { if (f.recibo && f.recibo.firmado) return; const r = generarReciboD(d, { empleadoId: f.empleado.id, tipo, mes, q }); if (r.ok) n++; });
  return ok({ n });
}
export function firmarReciboD(d, { id, firmado = true }) {
  const u = usuarioActual(d);
  const x = (d.rh.recibos || []).find((r) => r.id === id), e = x && empleadoPorId(d, x.empleadoId);
  if (!x) return err("Recibo no encontrado.");
  if (!puedeGestionarEmpleado(u, e)) return err("Solo el gerente de la sucursal o administración marcan recibos firmados.");
  x.firmado = !!firmado; x.firmadoEn = firmado ? hoy() : null;
  auditar(d, "recibo_firmado", "empleado", e.id, `${x.folio}: ${firmado ? "firmado" : "sin firma"}`);
  return ok();
}
export const generarRecibo = envolver(generarReciboD);
export const generarRecibosSucursal = envolver(generarRecibosSucursalD);
export const firmarRecibo = envolver(firmarReciboD);

// ═════════════════════════ CAPACITACIÓN
const puedeGestionarCap = (u) => esGestor(u);
function avanceDeUsuario(d, usuarioId, cursoId, crear = false) {
  let a = d.cap.avance.find((x) => x.usuarioId === usuarioId && x.cursoId === cursoId);
  if (!a && crear) { a = { id: uid("AV"), usuarioId, cursoId, sucursalId: d.sesion.sucursalId, vistas: [], evaluaciones: [], aprobado: false, completado: null, constancia: null, ult: hoy() }; d.cap.avance.push(a); }
  return a;
}
function cerrarSiCompleto(d, curso, a) {
  const prog = P.progresoCurso(d, a.usuarioId, curso);
  if (prog.completo && !a.completado) { a.completado = hoy(); a.constancia = folio(d, "CT"); return true; }
  return false;
}
export function marcarLeccionVistaD(d, { cursoId, leccionId }) {
  const u = usuarioActual(d);
  if (!u) return err("No hay sesión iniciada.");
  const c = d.cap.cursos.find((x) => x.id === cursoId);
  if (!c || c.estado !== "publicado") return err("El curso no está disponible.");
  if (!c.lecciones.some((l) => l.id === leccionId)) return err("Lección no encontrada.");
  const a = avanceDeUsuario(d, u.id, cursoId, true);
  if (!a.vistas.includes(leccionId)) a.vistas.push(leccionId);
  a.ult = hoy(); a.sucursalId = d.sesion.sucursalId;
  const terminado = cerrarSiCompleto(d, c, a);
  if (terminado) auditar(d, "curso_completado", "curso", cursoId, `constancia ${a.constancia}`);
  return ok({ completado: terminado, constancia: a.constancia });
}
export function evaluarCursoD(d, { cursoId, respuestas }) {
  const u = usuarioActual(d);
  if (!u) return err("No hay sesión iniciada.");
  const c = d.cap.cursos.find((x) => x.id === cursoId);
  if (!c || c.estado !== "publicado") return err("El curso no está disponible.");
  if (!c.evaluacion || !c.evaluacion.preguntas.length) return err("Este curso no tiene evaluación.");
  const a = avanceDeUsuario(d, u.id, cursoId, true);
  const prog = P.progresoCurso(d, u.id, c);
  if (!prog.leccionesCompletas) return err("Termina todas las lecciones antes de presentar la evaluación.");
  if ((respuestas || []).length < c.evaluacion.preguntas.length || respuestas.some((x) => x == null)) return err("Contesta todas las preguntas.");
  const res = P.calificarEvaluacion(c, respuestas);
  a.evaluaciones.push({ fecha: hoy(), calif: res.calif });
  if (res.aprobado) a.aprobado = true;
  const terminado = cerrarSiCompleto(d, c, a);
  auditar(d, "curso_evaluacion", "curso", cursoId, `${res.calif} de 100, ${res.aprobado ? "aprobado" : "no aprobado"}`);
  return ok({ ...res, completado: terminado, constancia: a.constancia });
}
export const marcarLeccionVista = envolver(marcarLeccionVistaD);
export const evaluarCurso = envolver(evaluarCursoD);

function validarLeccion(l, i) {
  if (!String(l.titulo || "").trim()) return `La lección ${i + 1} necesita título.`;
  if (l.youtubeUrl != null && String(l.youtubeUrl).trim()) {
    const id = P.extraerIdYoutube(l.youtubeUrl);
    if (!id) return `Lección ${i + 1}: el enlace de YouTube no es válido (usa watch, youtu.be, embed o shorts).`;
    return { youtube: id };
  }
  return {};
}
/** Crea o edita un curso (solo gerente/admin/dirección). Valida lecciones, enlaces de YouTube y evaluación (3 a 5 preguntas). */
export function guardarCursoD(d, curso) {
  const u = usuarioActual(d);
  if (!puedeGestionarCap(u)) return err("Solo gerentes y administración gestionan los cursos.");
  if (!String(curso.titulo || "").trim()) return err("El curso necesita un título.");
  if (!curso.lecciones || !curso.lecciones.length) return err("Agrega al menos una lección.");
  const nuevo = !curso.id;
  const id = curso.id || `C${d.cap.cursos.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, "")) || 0), 0) + 1}`;
  const lecciones = [];
  for (let i = 0; i < curso.lecciones.length; i++) {
    const l = curso.lecciones[i], v = validarLeccion(l, i);
    if (typeof v === "string") return err(v);
    const { youtubeUrl, ...resto } = l;
    lecciones.push({ id: l.id || uid("L"), minutos: 5, texto: "", pasos: [], checklist: [], docTitulo: "", docUrl: null, video: false, ...resto, ...(v.youtube ? { youtube: v.youtube, video: true } : { youtube: l.youtube || null }) });
  }
  let evaluacion = null;
  if (curso.evaluacion && curso.evaluacion.preguntas && curso.evaluacion.preguntas.length) {
    const ps = curso.evaluacion.preguntas;
    if (ps.length < 3 || ps.length > 5) return err("La evaluación debe tener entre 3 y 5 preguntas.");
    for (const [i, p] of ps.entries()) {
      if (!String(p.p || "").trim() || !p.opciones || p.opciones.filter((o) => String(o).trim()).length < 2) return err(`Pregunta ${i + 1}: escribe el texto y al menos 2 opciones.`);
      if (!(p.correcta >= 0 && p.correcta < p.opciones.length)) return err(`Pregunta ${i + 1}: marca la opción correcta.`);
    }
    const minimo = Number(curso.evaluacion.minimo);
    if (!(minimo >= 50 && minimo <= 100)) return err("La calificación mínima debe estar entre 50 y 100.");
    evaluacion = { minimo, preguntas: ps.map((p) => ({ p: p.p.trim(), opciones: p.opciones.filter((o) => String(o).trim()), correcta: p.correcta })) };
  }
  const nueva = { categoria: "General", resumen: "", asignado: { roles: [], personas: [], nuevos: false }, ruta: 0, estado: "borrador", borrador: true, ...curso, id, lecciones, evaluacion, titulo: curso.titulo.trim(),
    creadoPor: nuevo ? u.id : (d.cap.cursos.find((x) => x.id === id) || {}).creadoPor || u.id, fecha: nuevo ? hoy() : (d.cap.cursos.find((x) => x.id === id) || {}).fecha || hoy(), revision: hoy(), version: curso.version || "1.0" };
  const i = d.cap.cursos.findIndex((x) => x.id === id);
  if (i >= 0) d.cap.cursos[i] = nueva; else d.cap.cursos.push(nueva);
  auditar(d, nuevo ? "curso_creado" : "curso_editado", "curso", id, nueva.titulo);
  return ok({ curso: nueva });
}
export function estadoCursoD(d, { cursoId, estado }) {
  const u = usuarioActual(d);
  if (!puedeGestionarCap(u)) return err("Solo gerentes y administración gestionan los cursos.");
  const c = d.cap.cursos.find((x) => x.id === cursoId);
  if (!c) return err("Curso no encontrado.");
  if (!["publicado", "borrador", "archivado"].includes(estado)) return err("Estado no válido.");
  c.estado = estado;
  auditar(d, "curso_estado", "curso", cursoId, estado);
  return ok();
}
export function asignarCursoD(d, { cursoId, roles = [], personas = [], nuevos = false }) {
  const u = usuarioActual(d);
  if (!puedeGestionarCap(u)) return err("Solo gerentes y administración asignan cursos.");
  const c = d.cap.cursos.find((x) => x.id === cursoId);
  if (!c) return err("Curso no encontrado.");
  c.asignado = { roles: [...roles], personas: [...personas], nuevos: !!nuevos };
  auditar(d, "curso_asignado", "curso", cursoId, `roles: ${roles.join(",") || "—"}; personas: ${personas.length}; nuevos: ${nuevos ? "sí" : "no"}`);
  return ok();
}
export const guardarCurso = envolver(guardarCursoD);
export const estadoCurso = envolver(estadoCursoD);
export const asignarCurso = envolver(asignarCursoD);

// ═════════════════════════ ACERVO
export const CATEGORIAS_ACERVO = ["Operación diaria", "Caja y cobro", "Clínico", "Bioseguridad", "Atención al paciente", "Inventario", "Ventas", "Formatos", "Cultura", "Sistema"];
export const TIPOS_ACERVO = [{ v: "video", l: "Video" }, { v: "foto", l: "Fotos" }, { v: "guia", l: "Guía" }, { v: "procedimiento", l: "Procedimiento" }, { v: "formato", l: "Formato" }];
export function guardarAcervoD(d, e) {
  const u = usuarioActual(d);
  if (!puedeGestionarCap(u)) return err("Solo gerentes y administración publican en el acervo.");
  if (!String(e.titulo || "").trim()) return err("Escribe un título.");
  if (!TIPOS_ACERVO.some((t) => t.v === e.tipo)) return err("Elige el tipo de material.");
  if (!String(e.categoria || "").trim()) return err("Elige una categoría.");
  let youtube = e.youtube || null;
  if (e.youtubeUrl != null && String(e.youtubeUrl).trim()) { youtube = P.extraerIdYoutube(e.youtubeUrl); if (!youtube) return err("El enlace de YouTube no es válido (usa watch, youtu.be, embed o shorts)."); }
  if (esGerente(u) && e.sucursalId && !u.sucursales.includes(e.sucursalId)) return err("Solo puedes dirigir material a tu sucursal.");
  const { youtubeUrl, ...resto } = e;
  const prev = e.id && d.cap.acervo.find((x) => x.id === e.id);
  const bump = (v) => { const [a, b] = String(v || "1.0").split(".").map(Number); return `${a}.${(b || 0) + 1}`; };
  const x = { descripcion: "", etiquetas: [], contenido: "", imagenes: [], docUrl: null, roles: [], sucursalId: null, estado: "publicado", borrador: true, ...resto, youtube,
    id: prev ? prev.id : `AC${d.cap.acervo.reduce((m, y) => Math.max(m, Number(String(y.id).replace(/\D/g, "")) || 0), 0) + 1}`,
    subidoPor: prev ? prev.subidoPor : u.id, fecha: prev ? prev.fecha : hoy(), version: prev ? bump(prev.version) : "1.0", revision: { fecha: hoy(), responsable: u.id } };
  if (prev) Object.assign(prev, x); else d.cap.acervo.unshift(x);
  auditar(d, prev ? "acervo_editado" : "acervo_publicado", "acervo", x.id, x.titulo);
  return ok({ entrada: x });
}
export function archivarAcervoD(d, { id, archivar = true }) {
  const u = usuarioActual(d);
  if (!puedeGestionarCap(u)) return err("Solo gerentes y administración archivan material.");
  const x = d.cap.acervo.find((y) => y.id === id);
  if (!x) return err("Material no encontrado.");
  x.estado = archivar ? "archivado" : "publicado";
  auditar(d, archivar ? "acervo_archivado" : "acervo_restaurado", "acervo", id, x.titulo);
  return ok();
}
/** Marca el material como revisado hoy por el usuario actual (fecha de revisión y responsable). */
export function revisarAcervoD(d, { id }) {
  const u = usuarioActual(d);
  if (!puedeGestionarCap(u)) return err("Solo gerentes y administración revisan material.");
  const x = d.cap.acervo.find((y) => y.id === id);
  if (!x) return err("Material no encontrado.");
  x.revision = { fecha: hoy(), responsable: u.id };
  auditar(d, "acervo_revisado", "acervo", id, x.titulo);
  return ok();
}
export const guardarAcervo = envolver(guardarAcervoD);
export const archivarAcervo = envolver(archivarAcervoD);
export const revisarAcervo = envolver(revisarAcervoD);

export { esAdmin, esGerente, esGestor, diasEntre };
