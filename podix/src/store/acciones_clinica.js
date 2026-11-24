// Acciones del dominio «clínica» (porte de Pie Firme). Funciones sobre el draft `d` dentro de mutar(): validan el rol
// DENTRO de la acción (esconder un botón no es permiso), guardan usuarioId y sucursalId y dejan bitácora con auditar().
// Devuelven { ok: true, … } o { ok: false, error | errores }.
// Reglas puras en reglas_clinica.js (P-010, P-011, P-013, P-020 a P-023, P-026 a P-029, P-141).
import { auditar, uid, folio } from "./core.js";
import { siguienteFolioCiclo } from "./logica_recepcion.js";
import * as C from "./reglas_clinica.js";
import { hoy, dia, ahoraLocal, sumarDias, redondear } from "../lib/format.js";

export * from "./reglas_clinica.js";

const no = (error) => ({ ok: false, error });
const conErrores = (errores) => ({ ok: false, errores, error: Object.values(errores)[0] });
const sinPermiso = (que) => no(`Tu perfil no puede ${que}.`);
const vacio = (o) => !Object.keys(o).length;

// ═════════════════════════ Lo que ve cada quien
export function planesVisibles(d, u) { return C.visiblesClinicos(d, u, d.planesTrat || []); }
export function valoracionesVisibles(d, u) { return C.visiblesClinicos(d, u, d.pieDiabetico || []); }
export function plantillasVisibles(d, u) { return C.visiblesClinicos(d, u, d.plantillasOrto || []); }
export function quejasVisibles(d, u) { if (!C.puede(u, "quejas.ver")) return []; const s = C.sucursalesVisibles(d, u); return (d.quejas || []).filter((q) => s.includes(q.sucursalId)); }
export function arcoVisibles(d, u) { if (!C.puede(u, "quejas.ver")) return []; const s = C.sucursalesVisibles(d, u); return (d.arco || []).filter((a) => s.includes(a.sucursalId)); }
export function lotesVisibles(d, u) { if (!C.puede(u, "lotes.ver")) return []; const s = C.sucursalesVisibles(d, u); return d.ciclos.filter((c) => s.includes(c.sucursalId)); }
/** Planes creados al cerrar consulta (d.planesTratamiento) que aún no se han pasado a d.planesTrat; se muestran como «Desde consulta». */
export function planesDeConsulta(d, u) {
  const ya = new Set((d.planesTrat || []).map((p) => p.origenId).filter(Boolean));
  const lista = (d.planesTratamiento || []).filter((p) => !ya.has(p.id)).map((p) => ({ ...C.planDesdeConsulta(d, p), id: `LEG-${p.id}`, folio: "Desde consulta", legado: true }));
  return C.visiblesClinicos(d, u, lista);
}

const planDe = (d, id) => (d.planesTrat || []).find((p) => p.id === id);
const puedeEditarPlan = (u, pl) => C.puede(u, "planes.editar") && C.esSuyo(u, pl);

// ═════════════════════════ Plantillas de plan (P-027) — solo Administración
export function guardarPlantillaPlan(d, x, u) {
  if (!C.puede(u, "planes.plantillas")) return sinPermiso("editar plantillas de plan");
  const nombre = String(x.nombre || "").trim();
  const sesiones = (x.sesiones || []).map((s, i) => ({ n: i + 1, nombre: String(s.nombre || "").trim(), tipo: C.TIPOS_SESION[s.tipo] ? s.tipo : "sesion", intervaloDias: Number(s.intervaloDias) || 0, duracion: Number(s.duracion) || 30, precio: Number(s.precio), ventanaMin: s.ventanaMin === "" || s.ventanaMin == null ? null : Number(s.ventanaMin), ventanaMax: s.ventanaMax === "" || s.ventanaMax == null ? null : Number(s.ventanaMax) }));
  const e = {};
  if (!nombre) e.nombre = "Escribe el nombre de la plantilla";
  if (!sesiones.length) e.sesiones = "La plantilla necesita al menos una sesión";
  else if (sesiones.some((s) => !s.nombre)) e.sesiones = "Cada sesión necesita un nombre";
  else if (sesiones.some((s) => !(s.precio >= 0) || s.intervaloDias < 0)) e.sesiones = "Precio e intervalo no pueden ser negativos";
  else if (sesiones.some((s) => s.ventanaMin != null && s.ventanaMax != null && s.ventanaMin > s.ventanaMax)) e.sesiones = "La ventana mínima no puede ser mayor que la máxima";
  if (!vacio(e)) return conErrores(e);
  d.plantillasPlan ||= [];
  let p = x.id ? d.plantillasPlan.find((y) => y.id === x.id) : null;
  if (p) Object.assign(p, { nombre, descripcion: x.descripcion || "", servicioId: x.servicioId || p.servicioId, activa: x.activa !== false, sesiones, actualizada: hoy() });
  else { p = { id: uid("PPL"), nombre, descripcion: x.descripcion || "", servicioId: x.servicioId || "SV1", activa: true, sesiones, creadaPor: u.id, actualizada: hoy() }; d.plantillasPlan.push(p); }
  auditar(d, "plantilla_plan", "plantilla_plan", p.id, `${nombre} · ${sesiones.length} sesiones · $${C.totalPlan(sesiones.map((s) => ({ ...s, estado: "por_generar" })))}`);
  return { ok: true, plantilla: p };
}

// ═════════════════════════ Planes de tratamiento (P-026 a P-029)
/** x = { pacienteId, plantillaId?, nombre, diagnostico, fechaInicio, formaCobro, anticipo, sesiones (renglones de plantilla), podologoId? (solo admin) } */
export function crearPlanTrat(d, x, u, sucursalId) {
  if (!C.puede(u, "planes.editar")) return sinPermiso("crear planes de tratamiento");
  const e = C.validarPlan(d, x);
  if (!vacio(e)) return conErrores(e);
  const podologoId = u.rol === "podologo" ? u.id : x.podologoId;
  const pod = d.usuarios.find((y) => y.id === podologoId && y.rol === "podologo");
  if (!pod) return conErrores({ podologoId: "Elige al podólogo tratante" });
  if (u.rol === "podologo" && !C.pacientesDe(d, u).has(x.pacienteId)) return no("Solo puedes abrir planes a pacientes que atiendes o tienes citados.");
  const suc = d.sucursales.find((s) => s.id === sucursalId) ? sucursalId : pod.sucursales[0];
  const pl = x.plantillaId ? (d.plantillasPlan || []).find((p) => p.id === x.plantillaId) : null;
  const sesiones = C.generarSesiones({ sesiones: x.sesiones, fechaInicio: x.fechaInicio, festivos: C.festivosDe(d) });
  const plan = {
    id: uid("PTR"), folio: folio(d, "PTR"), pacienteId: x.pacienteId, podologoId, sucursalId: suc, plantillaId: pl ? pl.id : null, nombre: String(x.nombre).trim(),
    diagnostico: x.diagnostico || "", creado: hoy(), fechaInicio: dia(x.fechaInicio), estado: "activo", formaCobro: C.FORMAS_COBRO[x.formaCobro] ? x.formaCobro : "por_sesion",
    anticipo: redondear(Number(x.anticipo) || 0), servicioId: (pl && pl.servicioId) || x.servicioId || "SV1", sesiones, notas: [], creadoPor: u.id,
  };
  (d.planesTrat ||= []).unshift(plan);
  auditar(d, "crear_plan_tratamiento", "plan_tratamiento", plan.id, `${plan.folio} · ${plan.nombre} · ${sesiones.length} sesiones · $${C.totalPlan(sesiones)}`);
  return { ok: true, plan };
}

/** Pasa un plan creado al cerrar consulta (d.planesTratamiento) a d.planesTrat SIN tocar el original. */
export function importarPlanConsulta(d, origenId, u) {
  if (!C.puede(u, "planes.editar")) return sinPermiso("editar planes");
  const pl = (d.planesTratamiento || []).find((p) => p.id === origenId);
  if (!pl) return no("El plan de la consulta no existe.");
  if (!C.esSuyo(u, pl)) return no("El plan es de otro podólogo.");
  if ((d.planesTrat || []).some((p) => p.origenId === origenId)) return no("Ese plan ya se pasó a planes de tratamiento.");
  const plan = { ...C.planDesdeConsulta(d, pl), id: uid("PTR"), folio: folio(d, "PTR"), notas: [{ fecha: hoy(), por: u.id, texto: "Plan traído del cierre de consulta." }], creadoPor: u.id };
  (d.planesTrat ||= []).unshift(plan);
  auditar(d, "importar_plan_consulta", "plan_tratamiento", plan.id, `${plan.folio} desde ${origenId}`);
  return { ok: true, plan };
}

const sesionDe = (pl, n) => (pl.sesiones || []).find((s) => s.n === Number(n));
function cerrarSiTermina(d, pl, u) {
  const vivas = pl.sesiones.filter((s) => s.estado !== "cancelada");
  if (pl.estado === "activo" && vivas.length && vivas.every((s) => s.estado === "realizada")) {
    pl.estado = "completado"; pl.completadoEn = hoy();
    auditar(d, "completar_plan", "plan_tratamiento", pl.id, pl.folio);
  }
}

/** Agenda (o reprograma) una sesión: crea la cita en la agenda. Fuera de ventana solo avisa (P-029). */
export function agendarSesion(d, planId, n, { fecha, hora = "10:00", consultorioId = "C1" } = {}, u) {
  const pl = planDe(d, planId);
  if (!pl) return no("El plan no existe.");
  if (!puedeEditarPlan(u, pl)) return sinPermiso("agendar sesiones de este plan");
  if (pl.estado !== "activo") return no("El plan no está activo.");
  const s = sesionDe(pl, n);
  if (!s || !["por_generar", "agendada", "falta"].includes(s.estado)) return no("Esa sesión no se puede agendar.");
  if (!fecha || fecha < hoy()) return no("Elige una fecha de hoy en adelante.");
  if (!/^\d{2}:\d{2}$/.test(hora)) return no("Hora no válida.");
  const inicio = `${fecha}T${hora}`;
  const choque = d.citas.find((c) => c.sucursalId === pl.sucursalId && c.consultorioId === consultorioId && c.inicio === inicio && !["cancelada", "no_asistio"].includes(c.estado) && c.id !== s.citaId);
  if (choque) return no(`El consultorio ${consultorioId} ya está ocupado a las ${hora}.`);
  const reprograma = s.estado === "agendada" || s.estado === "falta";
  if (s.citaId) { const vieja = d.citas.find((c) => c.id === s.citaId); if (vieja && !["atendida", "en_atencion"].includes(vieja.estado)) vieja.estado = "cancelada"; }
  const cita = { id: uid("CI"), pacienteId: pl.pacienteId, servicioId: pl.servicioId || "SV1", podologoId: pl.podologoId, consultorioId, sucursalId: pl.sucursalId, inicio, duracion: s.duracion, estado: "agendada", recordatorio: "whatsapp", aDomicilio: false, serieId: null, planTratId: pl.id, sesionPlan: s.n, creadaPor: u.id };
  d.citas.push(cita);
  const fueraVentana = (s.ventanaDesde && fecha < s.ventanaDesde) || (s.ventanaHasta && fecha > s.ventanaHasta);
  Object.assign(s, { estado: "agendada", fecha, hora, citaId: cita.id, reprogramaciones: (s.reprogramaciones || 0) + (reprograma ? 1 : 0), atrasada: !!(s.ventanaHasta && fecha > s.ventanaHasta) });
  auditar(d, reprograma ? "reprogramar_sesion_plan" : "agendar_sesion_plan", "plan_tratamiento", pl.id, `${pl.folio} · sesión ${s.n} · ${inicio}${fueraVentana ? " · fuera de ventana" : ""}`);
  return { ok: true, cita, aviso: fueraVentana ? `Fuera de la ventana recomendada (${s.ventanaDesde} a ${s.ventanaHasta}): la sesión queda marcada como atrasada (P-029).` : null };
}

/** Marca la sesión realizada y fija su cargo: las incluidas van a $0 (P-027/P-028). El cobro lo hace caja. */
export function realizarSesion(d, planId, n, u, nota = "") {
  const pl = planDe(d, planId);
  if (!pl) return no("El plan no existe.");
  if (!puedeEditarPlan(u, pl)) return sinPermiso("registrar sesiones de este plan");
  if (pl.estado !== "activo") return no("El plan no está activo.");
  const s = sesionDe(pl, n);
  if (!s || !["por_generar", "agendada", "falta"].includes(s.estado)) return no("Esa sesión ya se cerró.");
  s.estado = "realizada"; s.realizadaEn = hoy(); s.realizadaPor = u.id; s.cargo = C.cargoSesion(pl, s);
  if (String(nota).trim()) s.nota = String(nota).trim();
  auditar(d, "realizar_sesion_plan", "plan_tratamiento", pl.id, `${pl.folio} · sesión ${s.n} · ${s.cargo.concepto} $${s.cargo.monto}`);
  cerrarSiTermina(d, pl, u);
  return { ok: true, cargo: s.cargo, completado: pl.estado === "completado" };
}
export function faltaSesion(d, planId, n, u) {
  const pl = planDe(d, planId);
  if (!pl || !puedeEditarPlan(u, pl)) return sinPermiso("registrar faltas en este plan");
  const s = sesionDe(pl, n);
  if (!s || s.estado !== "agendada") return no("Solo una sesión agendada puede marcarse como falta.");
  s.estado = "falta";
  if (s.citaId) { const c = d.citas.find((x) => x.id === s.citaId); if (c && !["atendida"].includes(c.estado)) c.estado = "no_asistio"; }
  auditar(d, "falta_sesion_plan", "plan_tratamiento", pl.id, `${pl.folio} · sesión ${s.n}`);
  return { ok: true };
}
export function cancelarSesion(d, planId, n, motivo, u) {
  const pl = planDe(d, planId);
  if (!pl || !puedeEditarPlan(u, pl)) return sinPermiso("cancelar sesiones de este plan");
  const s = sesionDe(pl, n);
  if (!s || s.estado === "realizada" || s.estado === "cancelada") return no("Esa sesión no se puede cancelar.");
  if (String(motivo || "").trim().length < 4) return no("Escribe el motivo.");
  if (s.citaId) { const c = d.citas.find((x) => x.id === s.citaId); if (c && !["atendida", "en_atencion"].includes(c.estado)) c.estado = "cancelada"; }
  s.estado = "cancelada"; s.motivoCancelacion = String(motivo).trim();
  auditar(d, "cancelar_sesion_plan", "plan_tratamiento", pl.id, `${pl.folio} · sesión ${s.n} · ${s.motivoCancelacion}`);
  cerrarSiTermina(d, pl, u);
  return { ok: true };
}
export function cancelarPlan(d, planId, motivo, u) {
  const pl = planDe(d, planId);
  if (!pl || !puedeEditarPlan(u, pl)) return sinPermiso("cancelar este plan");
  if (!["activo", "abandonado"].includes(pl.estado)) return no("El plan ya está cerrado.");
  if (String(motivo || "").trim().length < 4) return no("Escribe el motivo de la cancelación.");
  pl.sesiones.forEach((s) => {
    if (["por_generar", "agendada", "falta"].includes(s.estado)) {
      if (s.citaId) { const c = d.citas.find((x) => x.id === s.citaId); if (c && !["atendida", "en_atencion"].includes(c.estado)) c.estado = "cancelada"; }
      s.estado = "cancelada";
    }
  });
  pl.estado = "cancelado"; pl.canceladoEn = hoy(); pl.motivoCancelacion = String(motivo).trim();
  auditar(d, "cancelar_plan", "plan_tratamiento", pl.id, `${pl.folio} · ${pl.motivoCancelacion}`);
  return { ok: true };
}
export function reactivarPlan(d, planId, u) {
  const pl = planDe(d, planId);
  if (!pl || !puedeEditarPlan(u, pl)) return sinPermiso("reactivar este plan");
  if (pl.estado !== "abandonado") return no("Solo un plan abandonado se reactiva.");
  pl.estado = "activo"; pl.reactivadoEn = hoy();
  (pl.notas ||= []).push({ fecha: hoy(), por: u.id, texto: "Plan reactivado: el paciente retoma el tratamiento." });
  auditar(d, "reactivar_plan", "plan_tratamiento", pl.id, pl.folio);
  return { ok: true };
}
export function notaPlan(d, planId, texto, u) {
  const pl = planDe(d, planId);
  if (!pl || !puedeEditarPlan(u, pl)) return sinPermiso("anotar en este plan");
  const t = String(texto || "").trim();
  if (t.length < 3) return no("Escribe la nota.");
  (pl.notas ||= []).push({ fecha: hoy(), por: u.id, texto: t });
  auditar(d, "nota_plan", "plan_tratamiento", pl.id, t.slice(0, 60));
  return { ok: true };
}
/**
 * P-026: marca «Abandonado» los planes activos con 30 días (parámetro) sin sesión ni cita futura.
 * Con `u` revisa solo los planes que esa persona puede editar; sin `u` es el proceso del sistema.
 */
export function aplicarAbandonos(d, u = null, ref = hoy()) {
  if (u && !C.puede(u, "planes.editar")) return sinPermiso("aplicar la regla de abandono");
  const dias = C.paramsClinica(d).diasAbandono;
  const marcados = [];
  (d.planesTrat || []).forEach((pl) => {
    if (u && !C.esSuyo(u, pl)) return;
    if (C.planAbandonable(pl, ref, dias)) {
      pl.estado = "abandonado"; pl.abandonadoEn = ref;
      (pl.notas ||= []).push({ fecha: ref, por: u ? u.id : null, texto: `Regla de ${dias} días sin cita (P-026): plan marcado como abandonado.` });
      marcados.push(pl.id);
      auditar(d, "plan_abandonado", "plan_tratamiento", pl.id, `${pl.folio} · ${C.diasSinActividad(pl, ref)} días sin actividad`);
    }
  });
  return { ok: true, marcados };
}

// ═════════════════════════ Pie diabético (P-010, P-011)
/** Guarda (o corrige, si no está firmada) una valoración. ITB vacío = no evaluado; 0 se rechaza. */
export function guardarValoracion(d, x, u, sucursalId) {
  if (!C.puede(u, "pie.editar")) return sinPermiso("registrar valoraciones de pie diabético");
  const previa = x.id ? (d.pieDiabetico || []).find((v) => v.id === x.id) : null;
  if (x.id && !previa) return no("La valoración no existe.");
  if (previa && previa.firmada) return no("La valoración ya está firmada: no se edita. Registra una nueva.");
  if (previa && !C.esSuyo(u, previa)) return no("La valoración es de otro podólogo.");
  if (u.rol === "podologo" && !C.pacientesDe(d, u).has(x.pacienteId)) return no("Solo valoras a pacientes que atiendes o tienes citados.");
  const e = C.validarValoracion(d, x);
  if (!vacio(e)) return conErrores(e);
  const P = C.paramsClinica(d);
  const ulcera = x.ulcera ? { pie: x.ulcera.pie === "I" ? "I" : "D", region: C.REGIONES[x.ulcera.region] ? x.ulcera.region : "antepie", areaCm2: x.ulcera.areaCm2 === "" || x.ulcera.areaCm2 == null ? null : Number(x.ulcera.areaCm2), profundidad: C.PROFUNDIDADES[x.ulcera.profundidad] ? x.ulcera.profundidad : "piel", infeccion: C.INFECCION[x.ulcera.infeccion] ? x.ulcera.infeccion : "sin_infeccion", descripcion: String(x.ulcera.descripcion || "").trim() } : null;
  const sinbad = ulcera ? Object.fromEntries(["s", "i", "n", "b", "a", "d"].map((k) => [k, Number(x.sinbad[k]) ? 1 : 0])) : null;
  const riesgo = P.riesgoIwgdfActivo && x.riesgo !== "" && x.riesgo != null ? Number(x.riesgo) : null;
  const frecuencia = C.FRECUENCIAS_REVISION[x.frecuencia] ? x.frecuencia : "cada_3_meses";
  const fecha = dia(x.fecha);
  const datos = {
    pacienteId: x.pacienteId, fecha, pulsos: { ...(x.pulsos || {}) }, mono: x.mono || {}, sensProtectora: x.sensProtectora || C.sensProtectoraSugerida(x.mono) || null,
    itbI: C.normalizarItb(x.itbI), itbD: C.normalizarItb(x.itbD), hba1c: x.hba1c === "" || x.hba1c == null ? null : Number(x.hba1c),
    sintomas: [...(x.sintomas || [])], deformidades: [...(x.deformidades || [])], ulceraPrevia: !!x.ulceraPrevia, amputacionPrevia: !!x.amputacionPrevia,
    ulcera, sinbad, sinbadTotal: sinbad ? C.puntajeSinbad(sinbad) : null, wagner: Number(x.wagner), riesgo, frecuencia, proximaRevision: C.proximaRevision(fecha, frecuencia),
    notas: String(x.notas || "").trim(),
  };
  let v = previa;
  if (v) Object.assign(v, datos, { editadaEn: ahoraLocal() });
  else {
    v = { id: uid("PD"), folio: folio(d, "PD"), podologoId: u.rol === "podologo" ? u.id : x.podologoId || null, sucursalId, ...datos, firmada: false, firmadaEn: null, creadaPor: u.id };
    (d.pieDiabetico ||= []).unshift(v);
  }
  auditar(d, previa ? "editar_valoracion_pie" : "valoracion_pie", "pie_diabetico", v.id, `${v.folio} · Wagner ${v.wagner}${v.sinbadTotal != null ? ` · SINBAD ${v.sinbadTotal}` : ""}`);
  return { ok: true, valoracion: v };
}
/** Firma del podólogo tratante: a partir de aquí la valoración es inmutable. */
export function firmarValoracion(d, id, u) {
  if (!C.puede(u, "pie.firmar")) return sinPermiso("firmar valoraciones (solo el podólogo)");
  const v = (d.pieDiabetico || []).find((x) => x.id === id);
  if (!v) return no("La valoración no existe.");
  if (v.podologoId !== u.id) return no("Solo el podólogo que valoró la firma.");
  if (v.firmada) return no("Ya está firmada.");
  v.firmada = true; v.firmadaEn = ahoraLocal();
  auditar(d, "firmar_valoracion_pie", "pie_diabetico", v.id, v.folio);
  return { ok: true };
}
/** P-010: encender o apagar la sugerencia de categoría de riesgo IWGDF (APAGADA por defecto). */
export function cambiarParamClinica(d, clave, valor, u) {
  if (!C.puede(u, "clinica.parametros")) return sinPermiso("cambiar parámetros clínicos");
  if (!(clave in C.PARAMS_CLINICA)) return no("Parámetro desconocido.");
  const base = C.PARAMS_CLINICA[clave];
  const v = typeof base === "boolean" ? !!valor : Number(valor);
  if (typeof base === "number" && !(v > 0 && v <= 400)) return no("Valor fuera de rango.");
  d.clinica ||= { params: {} }; d.clinica.params ||= {};
  d.clinica.params[clave] = v;
  auditar(d, "parametro_clinica", "parametro", clave, String(v));
  return { ok: true };
}

// ═════════════════════════ Plantillas ortopédicas (P-013)
const poDe = (d, id) => (d.plantillasOrto || []).find((p) => p.id === id);
export function crearPlantillaOrto(d, x, u, sucursalId) {
  if (!C.puede(u, "plantillas.editar")) return sinPermiso("registrar estudios de pisada");
  if (!d.pacientes.find((p) => p.id === x.pacienteId)) return conErrores({ pacienteId: "Elige al paciente" });
  if (u.rol === "podologo" && !C.pacientesDe(d, u).has(x.pacienteId)) return no("Solo para pacientes que atiendes o tienes citados.");
  const e = C.validarEstudio(x.estudio || {});
  if (!vacio(e)) return conErrores(e);
  const modelo = (x.orden && x.orden.modelo) || "Plantilla a medida";
  const po = {
    id: uid("PO"), folio: folio(d, "PO"), pacienteId: x.pacienteId, podologoId: u.rol === "podologo" ? u.id : x.podologoId || null, sucursalId, creado: hoy(), estado: "borrador",
    estudio: { ...x.estudio }, orden: { modelo, material: C.MATERIALES_PO[0], cobertura: "completa", pares: 1, precio: C.MODELOS_PO[modelo] || 900, laboratorioId: (d.laboratorios[0] || {}).id, garantiaMeses: C.paramsClinica(d).garantiaMeses, correcciones: "", pie: "Ambos", ...(x.orden || {}) },
    ordenLabId: null, enviada: null, entregaEstimada: null, reclamos: [], ajusteRevisado: false, creadaPor: u.id,
  };
  (d.plantillasOrto ||= []).unshift(po);
  auditar(d, "estudio_pisada", "plantilla_orto", po.id, `${po.folio} · ${C.TIPOS_ESTUDIO[po.estudio.tipo]}`);
  return { ok: true, plantilla: po };
}
export function actualizarPlantillaOrto(d, id, { estudio, orden } = {}, u) {
  const po = poDe(d, id);
  if (!po) return no("La plantilla no existe.");
  if (!C.puede(u, "plantillas.editar") || !C.esSuyo(u, po)) return sinPermiso("editar esta plantilla");
  if (po.estado !== "borrador") return no("Solo se edita en borrador: ya se envió al laboratorio.");
  if (estudio) { const e = C.validarEstudio(estudio); if (!vacio(e)) return conErrores(e); po.estudio = { ...estudio }; }
  if (orden) po.orden = { ...po.orden, ...orden };
  auditar(d, "editar_plantilla_orto", "plantilla_orto", po.id, po.folio);
  return { ok: true };
}
/**
 * Envía al laboratorio: crea LA orden de laboratorio (d.ordenesLab, la misma que ven Órdenes, Caja y Entrega de plantillas),
 * con anticipo del 50 % y entrega estimada a 15 días hábiles (P-013). No se duplica: la plantilla guarda ordenLabId.
 */
export function enviarPlantillaLab(d, id, u) {
  const po = poDe(d, id);
  if (!po) return no("La plantilla no existe.");
  if (!C.puede(u, "plantillas.editar") || !C.esSuyo(u, po)) return sinPermiso("enviar esta plantilla");
  if (po.estado !== "borrador" || po.ordenLabId) return no("La plantilla ya se envió.");
  const e = { ...C.validarEstudio(po.estudio), ...C.validarOrdenPO(d, po.orden) };
  if (!vacio(e)) return conErrores(e);
  const P = C.paramsClinica(d);
  const enviada = hoy(), prometida = C.entregaEstimada(enviada, P.diasHabilesPlantilla, C.festivosDe(d));
  const precio = redondear(Number(po.orden.precio) * (Number(po.orden.pares) || 1));
  const anticipo = C.anticipoPlantilla(precio, P.anticipoPlantillaPct);
  const o = {
    id: uid("LB"), folio: folio(d, "LAB"), pacienteId: po.pacienteId, podologoId: po.podologoId, sucursalId: po.sucursalId, tipo: po.orden.modelo, pie: po.orden.pie || "Ambos",
    talla: String(po.estudio.tallaCalzado), toma: C.TOMA_LAB[po.estudio.tipo] || "Huella", correcciones: [po.orden.correcciones, `${po.orden.material} · ${C.COBERTURAS[po.orden.cobertura] || ""}`].filter(Boolean).join(" · "),
    laboratorioId: po.orden.laboratorioId, enviada, prometida, estado: "enviada", costoLab: 0, anticipoPct: P.anticipoPlantillaPct, anticipoPendiente: anticipo, anticipoPagado: 0, precio, plantillaOrtoId: po.id,
  };
  d.ordenesLab.unshift(o);
  Object.assign(po, { estado: "enviada", ordenLabId: o.id, enviada, entregaEstimada: prometida, enviadaPor: u.id });
  auditar(d, "enviar_plantilla_lab", "plantilla_orto", po.id, `${po.folio} → ${o.folio} · entrega ${prometida} · anticipo $${anticipo}`);
  return { ok: true, orden: o };
}
export function cancelarPlantillaOrto(d, id, motivo, u) {
  const po = poDe(d, id);
  if (!po || !C.puede(u, "plantillas.editar") || !C.esSuyo(u, po)) return sinPermiso("cancelar esta plantilla");
  if (po.estado !== "borrador") return no("Solo se cancela en borrador; si ya está en el laboratorio, trátalo con Almacén.");
  if (String(motivo || "").trim().length < 4) return no("Escribe el motivo.");
  po.estado = "cancelada"; po.motivoCancelacion = String(motivo).trim(); po.canceladaEn = hoy();
  auditar(d, "cancelar_plantilla_orto", "plantilla_orto", po.id, `${po.folio} · ${po.motivoCancelacion}`);
  return { ok: true };
}
/** Reclamo de garantía: solo dentro de los 6 meses desde la entrega (P-013). */
export function reclamarGarantia(d, id, texto, u, ref = hoy()) {
  const po = poDe(d, id);
  if (!po || !C.puede(u, "plantillas.editar") || !C.esSuyo(u, po)) return sinPermiso("registrar reclamos de esta plantilla");
  const f = C.fichaPO(d, po, ref);
  if (f.estado !== "entregada") return no("La plantilla aún no se entrega.");
  if (!f.enGarantia) return no(`Fuera de garantía: venció el ${f.garantiaHasta}.`);
  const t = String(texto || "").trim();
  if (t.length < 5) return no("Describe el problema.");
  (po.reclamos ||= []).push({ fecha: ref, por: u.id, texto: t, enGarantia: true });
  auditar(d, "reclamo_garantia_plantilla", "plantilla_orto", po.id, `${po.folio} · ${t.slice(0, 50)}`);
  return { ok: true };
}
export function marcarAjusteRevisado(d, id, u) {
  const po = poDe(d, id);
  if (!po || !C.puede(u, "plantillas.editar") || !C.esSuyo(u, po)) return sinPermiso("registrar la revisión de ajuste");
  if (C.estadoPO(d, po) !== "entregada") return no("La plantilla aún no se entrega.");
  po.ajusteRevisado = true; po.ajusteRevisadoEn = hoy();
  auditar(d, "ajuste_plantilla_revisado", "plantilla_orto", po.id, po.folio);
  return { ok: true };
}

// ═════════════════════════ Esterilización por lotes (P-023)
const cicloDe = (d, id) => d.ciclos.find((c) => c.id === id);
/** Compatibilidad con la pantalla del asistente: «resultado» = conforme si el lote es usable. */
const resultadoCompat = (c) => (["liberado", "liberado_condicionado"].includes(C.estadoLote(c)) ? "conforme" : "no_conforme");
export function registrarLote(d, x, u, sucursalId) {
  if (!C.puede(u, "lotes.operar")) return sinPermiso("registrar lotes de esterilización");
  if (!C.alcanza(d, u, sucursalId)) return no("No operas en esta sucursal.");
  const e = C.validarLote(d, x);
  const ajenos = (x.sets || []).filter((id) => !d.sets.find((s) => s.id === id && s.sucursalId === sucursalId));
  if (ajenos.length) e.sets = "Hay kits que no son de esta sucursal";
  if (!vacio(e)) return conErrores(e);
  const [, temp, presion, min] = C.CICLOS_AUTOCLAVE[x.tipoCiclo] || C.CICLOS_AUTOCLAVE.instrumental_envuelto;
  const fecha = ahoraLocal();
  const c = {
    id: uid("CC"), folio: siguienteFolioCiclo(d.ciclos), sucursalId, autoclave: String(x.autoclave).trim(), lote: String(x.lote).trim(), tipoCiclo: C.CICLOS_AUTOCLAVE[x.tipoCiclo] ? x.tipoCiclo : "instrumental_envuelto",
    temp: x.temp === "" || x.temp == null ? temp : Number(x.temp), presion, min: x.min === "" || x.min == null ? min : Number(x.min),
    indicadorQuimico: x.indicadorQuimico, indicadorBiologico: x.indicadorBiologico, responsableId: u.id, fecha, sets: [...x.sets],
    esterilHasta: C.esterilHasta(dia(fecha), C.paramsClinica(d).diasEsterilidad), pacientesAvisados: [], avisos: [],
  };
  c.resultado = resultadoCompat(c);
  d.ciclos.push(c);
  const usable = C.loteUsable(c);
  d.sets.forEach((s) => { if (c.sets.includes(s.id)) s.estado = usable ? "esterilizado" : "sucio"; });
  auditar(d, "registrar_lote", "ciclo", c.id, `${c.folio} · lote ${c.lote} · ${C.ESTADOS_LOTE[C.estadoLote(c)]} · ${c.sets.length} kit(s)`);
  return { ok: true, ciclo: c, estado: C.estadoLote(c) };
}
/** Resultado del indicador biológico (24 h). Positivo → lote BLOQUEADO: kits a cuarentena y lista de pacientes atendidos con el lote. */
export function registrarBiologico(d, cicloId, resultado, u) {
  if (!C.puede(u, "lotes.operar")) return sinPermiso("registrar el indicador biológico");
  const c = cicloDe(d, cicloId);
  if (!c) return no("El lote no existe.");
  if (!C.alcanza(d, u, c.sucursalId)) return no("El lote es de otra sucursal.");
  if (c.indicadorBiologico !== "pendiente") return no("El indicador biológico ya se registró.");
  if (!["conforme", "no_conforme"].includes(resultado)) return no("Resultado no válido.");
  c.indicadorBiologico = resultado; c.bioResultadoEn = ahoraLocal(); c.bioPor = u.id;
  c.resultado = resultadoCompat(c);
  let pacientes = [];
  if (resultado === "no_conforme") {
    c.bloqueadoEn = ahoraLocal();
    c.notaBloqueo = "Indicador biológico positivo: lote BLOQUEADO, kits retirados (P-023).";
    d.sets.forEach((s) => { if (c.sets.includes(s.id)) s.estado = "sucio"; });
    pacientes = C.pacientesDeLote(d, c.id);
  }
  auditar(d, resultado === "no_conforme" ? "lote_bloqueado" : "lote_liberado", "ciclo", c.id, `${c.folio} · biológico ${C.BIO_TXT[resultado]}${pacientes.length ? ` · ${pacientes.length} paciente(s) por avisar` : ""}`);
  return { ok: true, estado: C.estadoLote(c), pacientes };
}
export function avisarPacienteLote(d, cicloId, pacienteId, { canal = "telefono", nota = "" } = {}, u) {
  if (!C.puede(u, "lotes.operar")) return sinPermiso("registrar avisos del lote");
  const c = cicloDe(d, cicloId);
  if (!c || C.estadoLote(c) !== "bloqueado") return no("Solo se avisa a pacientes de un lote bloqueado.");
  if (!C.alcanza(d, u, c.sucursalId)) return no("El lote es de otra sucursal.");
  if (!C.pacientesDeLote(d, c.id).some((p) => p.pacienteId === pacienteId)) return no("Ese paciente no se atendió con este lote.");
  c.pacientesAvisados ||= []; c.avisos ||= [];
  if (!c.pacientesAvisados.includes(pacienteId)) c.pacientesAvisados.push(pacienteId);
  c.avisos.push({ pacienteId, fecha: ahoraLocal(), por: u.id, canal, nota: String(nota || "").trim() });
  auditar(d, "aviso_lote_bloqueado", "paciente", pacienteId, `${c.folio} · ${C.CANALES_CONTACTO[canal] || canal}`);
  return { ok: true };
}
/** Usa un kit (por QR o código) con un paciente de hoy. Se rechaza si el kit no está esterilizado o su lote no es usable. */
export function usarKit(d, { texto, citaId }, u) {
  if (!C.puede(u, "lotes.operar")) return sinPermiso("registrar el uso de kits");
  const kit = C.kitDeTexto(d, texto);
  if (!kit) return no("No se reconoce el código del kit.");
  if (!C.alcanza(d, u, kit.sucursalId)) return no("El kit es de otra sucursal.");
  const cita = d.citas.find((c) => c.id === citaId);
  if (!cita || cita.sucursalId !== kit.sucursalId) return no("Elige una cita de esta sucursal.");
  const lote = C.loteDeKit(d, kit.id);
  const ok = C.kitUsable(kit, lote);
  if (!ok.ok) return no(ok.motivo);
  (d.usoSets ||= []).push({ id: uid("US"), setId: kit.id, cicloId: lote.id, cicloFolio: lote.folio, pacienteId: cita.pacienteId, citaId: cita.id, consultorio: cita.consultorioId, fecha: ahoraLocal(), usuarioId: u.id, sucursalId: d.sesion.sucursalId });
  kit.estado = "sucio";
  auditar(d, "uso_kit", "set", kit.id, `${C.codigoKit(kit)} · ${C.nombrePac(d, cita.pacienteId)} · ${lote.folio}`);
  return { ok: true, kit, lote };
}
export function guardarKit(d, x, u, sucursalId) {
  if (!C.puede(u, "lotes.operar")) return sinPermiso("dar de alta kits");
  if (!C.alcanza(d, u, sucursalId)) return no("No operas en esta sucursal.");
  const nombre = String(x.nombre || "").trim();
  const contenido = (Array.isArray(x.contenido) ? x.contenido : String(x.contenido || "").split(/[\n,]/)).map((s) => s.trim()).filter(Boolean);
  if (!nombre) return conErrores({ nombre: "Escribe el nombre del kit" });
  if (!contenido.length) return conErrores({ contenido: "Lista el instrumental del kit" });
  let s = x.id ? d.sets.find((y) => y.id === x.id) : null;
  if (s) { if (s.sucursalId !== sucursalId && !C.esAdmin(u)) return no("El kit es de otra sucursal."); Object.assign(s, { nombre, contenido, tipoKit: x.tipoKit || s.tipoKit }); }
  else {
    const n = d.sets.filter((y) => y.sucursalId === sucursalId).length + 1;
    s = { id: `SET-${sucursalId}-${n}-${uid("K")}`, sucursalId, nombre, estado: "sucio", codigo: `KIT-${sucursalId}-${String(n).padStart(2, "0")}`, contenido, tipoKit: x.tipoKit || "Quiropodia" };
    d.sets.push(s);
  }
  auditar(d, x.id ? "editar_kit" : "alta_kit", "set", s.id, `${s.codigo} · ${contenido.length} piezas`);
  return { ok: true, kit: s };
}

// ═════════════════════════ Quejas, eventos adversos (P-020 a P-022) y ARCO (P-141)
const qDe = (d, id) => (d.quejas || []).find((q) => q.id === id);
export function registrarQueja(d, x, u, sucursalId) {
  if (!C.puede(u, "quejas.registrar")) return sinPermiso("registrar quejas");
  const datos = { ...x, sucursalId: x.sucursalId || sucursalId };
  const e = C.validarQueja(d, datos);
  if (!vacio(e)) return conErrores(e);
  if (!C.alcanza(d, u, datos.sucursalId)) return no("No operas en esa sucursal.");
  const fecha = ahoraLocal(), limite = C.fechaLimite(fecha, C.paramsClinica(d).diasQueja);
  const co = datos.consultaId ? d.consultas.find((c) => c.id === datos.consultaId) : null;
  const q = {
    id: uid("QJ"), folio: folio(d, "QJ"), fecha, sucursalId: datos.sucursalId, pacienteId: datos.pacienteId || null, consultaId: co ? co.id : null, podologoId: datos.podologoId || (co ? co.podologoId : null),
    clase: datos.clase, tipo: datos.tipo, gravedad: datos.gravedad, canal: C.CANALES_QUEJA[datos.canal] ? datos.canal : "presencial", descripcion: String(datos.descripcion).trim(),
    estado: datos.clase === "evento_adverso" && datos.gravedad === "alta" ? "escalada" : "nueva", responsableId: datos.responsableId || null, fechaCompromiso: datos.fechaCompromiso || limite, limite,
    registradaPor: u.id, resolucion: "", resueltaEn: null, cerradaEn: null, compensacion: null, seguimiento: [{ fecha, por: u.id, texto: "Queja registrada." }],
  };
  if (q.estado === "escalada") q.seguimiento.push({ fecha, por: u.id, texto: "Evento adverso de gravedad alta: escalado automáticamente a Administración." });
  (d.quejas ||= []).unshift(q);
  auditar(d, q.clase === "evento_adverso" ? "evento_adverso" : "registrar_queja", "queja", q.id, `${q.folio} · ${C.TIPOS_QUEJA[q.tipo]} · límite ${limite}`);
  return { ok: true, queja: q };
}
/** Seguimiento de la queja: responsable, compromiso, estado y resolución (gerente y Administración). */
export function actualizarQueja(d, id, patch, u) {
  const q = qDe(d, id);
  if (!q) return no("La queja no existe.");
  if (!C.puede(u, "quejas.resolver")) return sinPermiso("dar seguimiento a quejas");
  if (!C.alcanza(d, u, q.sucursalId)) return no("La queja es de otra sucursal.");
  if (q.estado === "cerrada") return no("La queja está cerrada.");
  const estado = patch.estado || q.estado;
  if (!C.ESTADOS_QUEJA[estado]) return no("Estado no válido.");
  const resolucion = patch.resolucion != null ? String(patch.resolucion).trim() : q.resolucion;
  if (["resuelta", "cerrada"].includes(estado) && resolucion.length < 10) return conErrores({ resolucion: "Describe la resolución o acción correctiva (mínimo 10 caracteres)" });
  if (estado === "cerrada" && q.compensacion && q.compensacion.estado === "propuesta") return no("Hay una compensación pendiente de autorizar por Administración.");
  if (patch.responsableId !== undefined) q.responsableId = patch.responsableId || null;
  if (patch.fechaCompromiso) q.fechaCompromiso = patch.fechaCompromiso;
  q.resolucion = resolucion;
  if (estado !== q.estado) {
    q.seguimiento.push({ fecha: ahoraLocal(), por: u.id, texto: `Estado: ${C.ESTADOS_QUEJA[q.estado]} → ${C.ESTADOS_QUEJA[estado]}` });
    if (estado === "resuelta" && !q.resueltaEn) q.resueltaEn = hoy();
    if (estado === "cerrada") { q.cerradaEn = hoy(); if (!q.resueltaEn) q.resueltaEn = hoy(); }
    if (["nueva", "en_proceso", "escalada"].includes(estado)) { q.resueltaEn = null; q.cerradaEn = null; }
    q.estado = estado;
  }
  if (String(patch.nota || "").trim()) q.seguimiento.push({ fecha: ahoraLocal(), por: u.id, texto: String(patch.nota).trim() });
  auditar(d, "seguimiento_queja", "queja", q.id, `${q.folio} · ${C.ESTADOS_QUEJA[q.estado]}`);
  return { ok: true };
}
export function notaQueja(d, id, texto, u) {
  const q = qDe(d, id);
  if (!q || !C.puede(u, "quejas.registrar") || !C.alcanza(d, u, q.sucursalId)) return sinPermiso("anotar en esta queja");
  const t = String(texto || "").trim();
  if (t.length < 3) return no("Escribe la nota.");
  q.seguimiento.push({ fecha: ahoraLocal(), por: u.id, texto: t });
  auditar(d, "nota_queja", "queja", q.id, t.slice(0, 60));
  return { ok: true };
}
/** P-022: la compensación con costo (reembolso, descuento, consulta sin costo) queda «propuesta» hasta que Administración la autoriza. */
export function proponerCompensacion(d, id, { tipo, monto = 0 }, u) {
  const q = qDe(d, id);
  if (!q) return no("La queja no existe.");
  if (!C.puede(u, "quejas.resolver") || !C.alcanza(d, u, q.sucursalId)) return sinPermiso("proponer compensaciones");
  if (!C.COMPENSACIONES[tipo] || tipo === "ninguna") return no("Elige la compensación.");
  const m = Number(monto) || 0;
  if (["reembolso", "descuento"].includes(tipo) && !(m > 0)) return conErrores({ monto: "Escribe el monto" });
  if (q.compensacion && q.compensacion.estado === "autorizada") return no("Ya hay una compensación autorizada.");
  const autoriza = !C.compensacionConCosto(tipo) || C.puede(u, "quejas.compensar");
  q.compensacion = { tipo, monto: ["reembolso", "descuento"].includes(tipo) ? redondear(m) : 0, estado: autoriza ? "autorizada" : "propuesta", propuestaPor: u.id, en: hoy(), ...(autoriza ? { autorizadaPor: u.id, autorizadaEn: hoy() } : {}) };
  q.seguimiento.push({ fecha: ahoraLocal(), por: u.id, texto: `Compensación ${autoriza ? "registrada" : "propuesta a Administración"}: ${C.COMPENSACIONES[tipo]}${q.compensacion.monto ? ` $${q.compensacion.monto}` : ""}` });
  auditar(d, autoriza ? "compensacion_autorizada" : "compensacion_propuesta", "queja", q.id, `${q.folio} · ${C.COMPENSACIONES[tipo]} $${q.compensacion.monto}`);
  return { ok: true, estado: q.compensacion.estado };
}
export function resolverCompensacion(d, id, aprobar, u, motivo = "") {
  const q = qDe(d, id);
  if (!q) return no("La queja no existe.");
  if (!C.puede(u, "quejas.compensar")) return sinPermiso("autorizar compensaciones (solo Administración)");
  if (!q.compensacion || q.compensacion.estado !== "propuesta") return no("No hay compensación por autorizar.");
  if (!aprobar && String(motivo).trim().length < 4) return no("Escribe por qué se rechaza.");
  Object.assign(q.compensacion, aprobar ? { estado: "autorizada", autorizadaPor: u.id, autorizadaEn: hoy() } : { estado: "rechazada", rechazadaPor: u.id, rechazadaEn: hoy(), motivoRechazo: String(motivo).trim() });
  q.seguimiento.push({ fecha: ahoraLocal(), por: u.id, texto: aprobar ? "Administración autorizó la compensación." : `Administración rechazó la compensación: ${String(motivo).trim()}` });
  auditar(d, aprobar ? "compensacion_autorizada" : "compensacion_rechazada", "queja", q.id, `${q.folio} · ${C.COMPENSACIONES[q.compensacion.tipo]} $${q.compensacion.monto}`);
  return { ok: true };
}
export function registrarArco(d, x, u, sucursalId) {
  if (!C.puede(u, "arco.registrar")) return sinPermiso("registrar solicitudes ARCO");
  const suc = x.sucursalId || sucursalId;
  const e = {};
  if (!d.pacientes.find((p) => p.id === x.pacienteId)) e.pacienteId = "Elige al titular de los datos";
  if (!C.DERECHOS_ARCO[x.derecho]) e.derecho = "Elige el derecho";
  if (String(x.descripcion || "").trim().length < 10) e.descripcion = "Describe la solicitud (mínimo 10 caracteres)";
  if (!d.sucursales.find((s) => s.id === suc)) e.sucursalId = "Elige la sucursal";
  if (!vacio(e)) return conErrores(e);
  if (!C.alcanza(d, u, suc)) return no("No operas en esa sucursal.");
  const fecha = ahoraLocal();
  const a = { id: uid("AR"), folio: folio(d, "ARCO"), fecha, sucursalId: suc, pacienteId: x.pacienteId, derecho: x.derecho, descripcion: String(x.descripcion).trim(), medio: x.medio || "presencial", identidadVerificada: !!x.identidadVerificada, estado: "recibida", limite: C.fechaLimite(fecha, C.paramsClinica(d).diasArco), registradaPor: u.id, atendidaEn: null, atendidaPor: null, respuesta: "" };
  (d.arco ||= []).unshift(a);
  auditar(d, "solicitud_arco", "arco", a.id, `${a.folio} · ${C.DERECHOS_ARCO[a.derecho]} · límite ${a.limite}`);
  return { ok: true, solicitud: a };
}
/** Atiende (o rechaza) una solicitud ARCO: solo Administración/Dirección (responsable de datos personales). */
export function atenderArco(d, id, { estado, respuesta }, u) {
  if (!C.puede(u, "arco.atender")) return sinPermiso("atender solicitudes ARCO (solo Administración)");
  const a = (d.arco || []).find((x) => x.id === id);
  if (!a) return no("La solicitud no existe.");
  if (!C.arcoAbierta(a)) return no("La solicitud ya se cerró.");
  if (!C.ESTADOS_ARCO[estado]) return no("Estado no válido.");
  const r = String(respuesta || "").trim();
  if (["atendida", "rechazada"].includes(estado) && r.length < 10) return conErrores({ respuesta: "Escribe la respuesta al titular (mínimo 10 caracteres)" });
  a.estado = estado; a.respuesta = r || a.respuesta;
  if (["atendida", "rechazada"].includes(estado)) { a.atendidaEn = hoy(); a.atendidaPor = u.id; }
  // Cancelación u oposición atendidas: el titular deja de recibir campañas
  if (estado === "atendida" && ["cancelacion", "oposicion"].includes(a.derecho)) { d.crm ||= {}; d.crm.noContactar ||= []; if (!d.crm.noContactar.includes(a.pacienteId)) d.crm.noContactar.push(a.pacienteId); }
  auditar(d, "atender_arco", "arco", a.id, `${a.folio} · ${C.ESTADOS_ARCO[estado]}`);
  return { ok: true };
}

// ═════════════════════════ Seguimiento de pacientes (CRM). El contacto es MANUAL (wa.me y tel:): aquí solo se anota.
const crmDe = (d) => { d.crm ||= {}; d.crm.contactos ||= []; d.crm.campanas ||= []; d.crm.noContactar ||= []; return d.crm; };
export function registrarContacto(d, x, u, sucursalId) {
  if (!C.puede(u, "crm.contactar")) return sinPermiso("registrar contactos");
  const p = d.pacientes.find((y) => y.id === x.pacienteId);
  if (!p) return no("El paciente no existe.");
  if (!C.CANALES_CONTACTO[x.canal]) return no("Elige el canal.");
  if (!C.RESULTADOS_CONTACTO[x.resultado]) return no("Elige el resultado.");
  const crm = crmDe(d);
  if (crm.noContactar.includes(p.id) && x.resultado !== "no_contactar") return no("El paciente pidió no ser contactado.");
  const vis = C.sucursalesVisibles(d, u);
  if (!C.esAdmin(u) && !vis.includes(p.sucursalAlta) && !d.citas.some((c) => c.pacienteId === p.id && vis.includes(c.sucursalId))) return no("El paciente no es de tu sucursal.");
  const c = { id: uid("CT"), pacienteId: p.id, fecha: ahoraLocal(), canal: x.canal, resultado: x.resultado, nota: String(x.nota || "").trim(), usuarioId: u.id, sucursalId, campanaId: x.campanaId || null, segmento: x.segmento || null };
  crm.contactos.unshift(c);
  if (x.resultado === "no_contactar" && !crm.noContactar.includes(p.id)) crm.noContactar.push(p.id);
  const camp = c.campanaId ? crm.campanas.find((y) => y.id === c.campanaId) : null;
  if (camp && camp.estado === "aprobada") camp.estado = "en_curso";
  auditar(d, "contacto_crm", "paciente", p.id, `${C.CANALES_CONTACTO[c.canal]} · ${C.RESULTADOS_CONTACTO[c.resultado]}`);
  return { ok: true, contacto: c };
}
/** Campaña: congela la lista de destinatarios del segmento (sin excluidos). La aprueba Administración; si la crea Administración nace aprobada. */
export function crearCampana(d, x, u) {
  if (!C.puede(u, "crm.campanas")) return sinPermiso("crear campañas");
  const nombre = String(x.nombre || "").trim();
  if (nombre.length < 4) return conErrores({ nombre: "Escribe el nombre de la campaña" });
  if (!C.SEGMENTOS[x.segmento]) return conErrores({ segmento: "Elige el segmento" });
  const suc = x.sucursalId || null;
  if (u.rol === "gerente" && (!suc || !u.sucursales.includes(suc))) return no("Como gerente, la campaña es de tu sucursal.");
  const destinatarios = C.listaContacto(d, { segmento: x.segmento, sucursales: suc ? [suc] : null }).filter((r) => !r.excluido).map((r) => r.pacienteId);
  if (!destinatarios.length) return no("El segmento no tiene pacientes que contactar.");
  const aprobada = C.puede(u, "crm.aprobar");
  const c = { id: uid("CA"), folio: folio(d, "CAM"), nombre, segmento: x.segmento, sucursalId: suc, mensaje: String(x.mensaje || "").trim() || null, estado: aprobada ? "aprobada" : "borrador", creadaPor: u.id, creada: hoy(), destinatarios, aprobadaPor: aprobada ? u.id : null, aprobadaEn: aprobada ? hoy() : null, terminadaEn: null };
  crmDe(d).campanas.unshift(c);
  auditar(d, "crear_campana", "campana", c.id, `${c.folio} · ${c.nombre} · ${destinatarios.length} pacientes`);
  return { ok: true, campana: c };
}
export function aprobarCampana(d, id, u) {
  if (!C.puede(u, "crm.aprobar")) return sinPermiso("aprobar campañas (solo Administración)");
  const c = crmDe(d).campanas.find((x) => x.id === id);
  if (!c || c.estado !== "borrador") return no("La campaña no está en borrador.");
  c.estado = "aprobada"; c.aprobadaPor = u.id; c.aprobadaEn = hoy();
  auditar(d, "aprobar_campana", "campana", c.id, c.folio);
  return { ok: true };
}
export function terminarCampana(d, id, u) {
  const c = crmDe(d).campanas.find((x) => x.id === id);
  if (!c) return no("La campaña no existe.");
  if (!C.puede(u, "crm.campanas") || (u.rol === "gerente" && c.sucursalId && !u.sucursales.includes(c.sucursalId))) return sinPermiso("terminar esta campaña");
  if (!["aprobada", "en_curso"].includes(c.estado)) return no("La campaña no está en curso.");
  c.estado = "terminada"; c.terminadaEn = hoy();
  auditar(d, "terminar_campana", "campana", c.id, c.folio);
  return { ok: true };
}
export function permitirContacto(d, pacienteId, u) {
  if (!C.puede(u, "crm.aprobar")) return sinPermiso("reactivar el contacto (solo Administración)");
  const crm = crmDe(d);
  crm.noContactar = crm.noContactar.filter((x) => x !== pacienteId);
  auditar(d, "permitir_contacto", "paciente", pacienteId, "Vuelve a recibir campañas");
  return { ok: true };
}
/** Contactos de un paciente, del más reciente al más antiguo. */
export const bitacoraContacto = (d, pacienteId) => ((d.crm && d.crm.contactos) || []).filter((c) => c.pacienteId === pacienteId).sort((a, b) => b.fecha.localeCompare(a.fecha));
export const ahoraMas = (dias) => sumarDias(hoy(), dias);
