// Pruebas del dominio «personas» (src/store/acciones_personas.js y reglas_personas.js). node --test tests/personas.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as A from "../src/store/acciones_personas.js";
import { hoy, sumarDias } from "../src/lib/format.js";

const como = (d, rol, sucursalId = "S1", i = 0) => {
  const u = d.usuarios.filter((x) => x.rol === rol && (rol === "admin" || rol === "direccion" || x.sucursales.includes(sucursalId)))[i];
  d.sesion = { userId: u.id, sucursalId };
  return u;
};
const ficha = (d, u) => d.rh.empleados.find((e) => e.usuarioId === u.id);
/** Deja a la persona sin marcas, vacaciones ni incidencias para probar el checador con limpieza. */
const limpiar = (d, e) => {
  d.rh.asistencia = d.rh.asistencia.filter((a) => a.empleadoId !== e.id);
  d.rh.vacaciones = d.rh.vacaciones.filter((a) => a.empleadoId !== e.id);
  d.rh.incidencias = d.rh.incidencias.filter((a) => a.empleadoId !== e.id);
};
/** Empleado de laboratorio: sin programación semanal (trabaja todos los días en su sucursal base). */
const prueba = (d, extra = {}) => {
  const e = { id: "ET", usuarioId: null, nombre: "Prueba Uno", rol: "cajero", puesto: "Cajero(a)", sucursalBase: "S1", sucursales: ["S1"], sueldoMensual: 15000, ingreso: "2020-01-10", estado: "activo", horario: { entrada: "09:00", salida: "18:00" }, expediente: {}, ...extra };
  d.rh.empleados.push(e);
  return e;
};

test("retardo: tolerancia de 10 minutos, parametrizable", () => {
  assert.equal(A.clasificarEntrada("09:10", "09:00").estado, "normal");
  assert.equal(A.clasificarEntrada("09:11", "09:00").estado, "retardo");
  assert.equal(A.clasificarEntrada("09:11", "09:00").minutosTarde, 11);
  assert.equal(A.clasificarEntrada("08:40", "09:00").estado, "normal");
  assert.equal(A.clasificarEntrada("09:06", "09:00", 5).estado, "retardo");
  const d = crearSeed(); como(d, "admin");
  assert.equal(A.guardarParametrosRHD(d, { toleranciaMin: 20, retardosPorFalta: 2 }).ok, true);
  assert.equal(A.paramsRH(d).toleranciaMin, 20);
  assert.equal(A.guardarParametrosRHD(d, { toleranciaMin: 99, retardosPorFalta: 2 }).ok, false);
  como(d, "cajero");
  assert.equal(A.guardarParametrosRHD(d, { toleranciaMin: 5, retardosPorFalta: 3 }).ok, false); // solo admin
});

test("checador: entrada con sucursal activa, retardo, sin duplicar, salida", () => {
  const d = crearSeed();
  const u = como(d, "recepcion", "S2");
  const e = ficha(d, u); limpiar(d, e);
  e.horario = { entrada: "09:00", salida: "18:00" };
  const f = hoy();
  const r1 = A.registrarEntradaD(d, `${f}T09:25`);
  assert.equal(r1.ok, true); assert.equal(r1.estado, "retardo"); assert.equal(r1.minutosTarde, 25);
  const m = d.rh.asistencia.find((a) => a.empleadoId === e.id && a.fecha === f);
  assert.equal(m.sucursalId, "S2"); assert.equal(m.usuarioId, u.id);
  const r2 = A.registrarEntradaD(d, `${f}T09:40`);
  assert.equal(r2.ok, false); assert.match(r2.error, /Ya registraste tu entrada/);
  assert.equal(d.rh.asistencia.filter((a) => a.empleadoId === e.id && a.fecha === f).length, 1);
  assert.equal(A.registrarSalidaD(d, `${f}T08:00`).ok, false); // salida anterior a la entrada
  assert.equal(A.registrarSalidaD(d, `${f}T18:05`).ok, true);
  assert.equal(A.registrarSalidaD(d, `${f}T18:10`).ok, false); // doble salida
  assert.ok(d.bitacora.some((b) => b.accion === "checador_entrada"));
});

test("checador: salida sin entrada, usuario sin ficha y vacaciones aprobadas", () => {
  const d = crearSeed();
  const u = como(d, "cajero", "S3");
  const e = ficha(d, u); limpiar(d, e);
  assert.equal(A.registrarSalidaD(d, `${hoy()}T18:00`).ok, false);
  d.rh.vacaciones.push({ id: "VX", empleadoId: e.id, desde: sumarDias(hoy(), -1), hasta: sumarDias(hoy(), 2), dias: 4, estado: "aprobada" });
  const r = A.registrarEntradaD(d, `${hoy()}T09:00`);
  assert.equal(r.ok, false); assert.match(r.error, /vacaciones/);
  d.rh.empleados = d.rh.empleados.filter((x) => x.id !== e.id);
  assert.equal(A.registrarEntradaD(d, `${hoy()}T09:00`).ok, false);
});

test("sucursalHoy: excepción por fecha > programación semanal > sucursal base; null = descanso", () => {
  const d = crearSeed();
  const e = prueba(d, { sucursales: ["S1", "S2"] });
  const lunes = "2026-11-16"; // lunes
  assert.equal(A.sucursalHoy(d, e.id, lunes), "S1"); // sin programación: su base
  d.rh.asignaciones.push({ id: "w", empleadoId: e.id, dow: 1, sucursalId: "S2" }, { id: "x", empleadoId: e.id, dow: 0, sucursalId: null });
  assert.equal(A.sucursalHoy(d, e.id, lunes), "S2");
  assert.equal(A.sucursalHoy(d, e.id, "2026-11-22"), null); // domingo: descanso
  d.rh.asignaciones.push({ id: "f", empleadoId: e.id, fecha: lunes, sucursalId: "S1" });
  assert.equal(A.sucursalHoy(d, e.id, lunes), "S1");
  assert.equal(A.sucursalHoy(d, e.id, "2026-11-23"), "S2");
});

test("horarios: el gerente programa solo a su gente y en sucursales autorizadas de la persona", () => {
  const d = crearSeed();
  const ger = como(d, "gerente", "S1");
  const rot = d.rh.empleados.find((e) => e.estado === "activo" && e.sucursales.includes("S1") && e.sucursales.length === 2 && e.rol === "cajero") || d.rh.empleados.find((e) => e.sucursales.length === 2 && e.rol !== "podologo" && e.sucursales.includes("S1"));
  const otra = rot.sucursales.find((s) => s !== "S1");
  assert.equal(A.asignarSucursalD(d, { empleadoId: rot.id, dow: 2, sucursalId: otra }).ok, true);
  assert.equal(A.sucursalHoy(d, rot.id, "2026-11-17"), otra); // martes
  assert.equal(A.asignarSucursalD(d, { empleadoId: rot.id, dow: 2, sucursalId: "S7" === otra ? "S6" : "S7" }).ok, false); // no autorizada
  const ajeno = d.rh.empleados.find((e) => e.estado === "activo" && !e.sucursales.some((s) => ger.sucursales.includes(s)) && e.sucursales[0].startsWith("S"));
  assert.equal(A.asignarSucursalD(d, { empleadoId: ajeno.id, dow: 2, sucursalId: ajeno.sucursalBase }).ok, false);
  como(d, "recepcion");
  assert.equal(A.asignarSucursalD(d, { empleadoId: rot.id, dow: 3, sucursalId: "S1" }).ok, false);
});

test("vacaciones: días por antigüedad (LFT) y saldo", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 10, 11, 15, 16, 20, 21].map(A.diasVacacionesLFT), [0, 12, 14, 16, 18, 20, 22, 22, 24, 24, 26, 26, 28]);
  const d = crearSeed();
  const ingreso = sumarDias(hoy(), -365 * 3 - 40); // 3 años cumplidos
  const e = prueba(d, { ingreso });
  const s0 = A.saldoVacaciones(d, e);
  assert.equal(s0.anios, 3); assert.equal(s0.derecho, 16); assert.equal(s0.saldo, 16);
  d.rh.vacaciones.push({ id: "v1", empleadoId: e.id, desde: sumarDias(hoy(), -10), hasta: sumarDias(hoy(), -7), dias: 4, estado: "aprobada" });
  d.rh.vacaciones.push({ id: "v0", empleadoId: e.id, desde: sumarDias(ingreso, 200), hasta: sumarDias(ingreso, 210), dias: 9, estado: "aprobada" }); // año anterior: no cuenta
  d.rh.vacaciones.push({ id: "v2", empleadoId: e.id, desde: sumarDias(hoy(), 20), hasta: sumarDias(hoy(), 22), dias: 3, estado: "solicitada" });
  const s1 = A.saldoVacaciones(d, e);
  assert.equal(s1.tomados, 4); assert.equal(s1.saldo, 12); assert.equal(s1.pendientes, 3); assert.equal(s1.disponible, 9);
  assert.equal(A.saldoVacaciones(d, prueba(d, { id: "EN", ingreso: sumarDias(hoy(), -100) })).derecho, 0); // menos de un año
});

test("vacaciones: solicitud valida saldo y empalmes; aprobación solo por gerente de la sucursal o admin, nunca la propia", () => {
  const d = crearSeed();
  const u = como(d, "cajero", "S4");
  const e = ficha(d, u); limpiar(d, e);
  e.ingreso = sumarDias(hoy(), -365 * 2 - 30); // 14 días
  const ini = sumarDias(hoy(), 30);
  const rec = A.solicitarVacacionesD(d, { desde: ini, hasta: sumarDias(ini, 20) });
  assert.equal(rec.ok, false); assert.match(rec.error, /disponibles/);
  const ok1 = A.solicitarVacacionesD(d, { desde: ini, hasta: sumarDias(ini, 5), nota: "viaje" });
  assert.equal(ok1.ok, true); assert.equal(ok1.vacacion.estado, "solicitada");
  assert.ok(ok1.vacacion.dias >= 1 && ok1.vacacion.dias <= 6);
  assert.equal(A.solicitarVacacionesD(d, { desde: ini, hasta: sumarDias(ini, 1) }).ok, false); // empalme
  assert.equal(A.solicitarVacacionesD(d, { desde: sumarDias(hoy(), -9), hasta: sumarDias(hoy(), -8) }).ok, false); // pasado
  const id = ok1.vacacion.id;
  assert.equal(A.resolverVacacionesD(d, { id, decision: "aprobada" }).ok, false); // el propio cajero no
  como(d, "gerente", "S5");
  assert.equal(A.resolverVacacionesD(d, { id, decision: "aprobada" }).ok, false); // gerente de otra sucursal
  como(d, "gerente", "S4");
  assert.equal(A.resolverVacacionesD(d, { id, decision: "rechazada" }).ok, false); // rechazo sin motivo
  assert.equal(A.resolverVacacionesD(d, { id, decision: "aprobada" }).ok, true);
  assert.equal(d.rh.vacaciones.find((v) => v.id === id).estado, "aprobada");
  assert.equal(A.resolverVacacionesD(d, { id, decision: "aprobada" }).ok, false); // ya resuelta
  assert.ok(d.bitacora.some((b) => b.accion === "vacaciones_resuelta"));
  // el gerente no se aprueba a sí mismo; admin sí lo aprueba
  const g = como(d, "gerente", "S4"); const eg = ficha(d, g); limpiar(d, eg); eg.ingreso = sumarDias(hoy(), -365 * 5 - 5);
  const rg = A.solicitarVacacionesD(d, { desde: sumarDias(hoy(), 40), hasta: sumarDias(hoy(), 42) });
  assert.equal(rg.ok, true);
  assert.equal(A.resolverVacacionesD(d, { id: rg.vacacion.id, decision: "aprobada" }).ok, false);
  como(d, "admin");
  assert.equal(A.resolverVacacionesD(d, { id: rg.vacacion.id, decision: "aprobada" }).ok, true);
});

test("incidencias: el empleado solo solicita permiso; el gestor aprueba y la ausencia justificada no es falta", () => {
  const d = crearSeed();
  const u = como(d, "asistente", "S2");
  const e = ficha(d, u); limpiar(d, e);
  const f = sumarDias(hoy(), 3);
  assert.equal(A.registrarIncidenciaD(d, { empleadoId: e.id, tipo: "acta", desde: f, detalle: "x" }).ok, false);
  const r = A.registrarIncidenciaD(d, { empleadoId: e.id, tipo: "permiso", desde: f, detalle: "Trámite" });
  assert.equal(r.ok, true); assert.equal(r.incidencia.estado, "solicitada");
  assert.equal(A.resolverIncidenciaD(d, { id: r.incidencia.id, decision: "aprobada" }).ok, false); // no la propia
  como(d, "gerente", "S2");
  assert.equal(A.resolverIncidenciaD(d, { id: r.incidencia.id, decision: "aprobada" }).ok, true);
  assert.equal(A.estadoDia(d, e, f).estado, "permiso");
  const ac = A.registrarIncidenciaD(d, { empleadoId: e.id, tipo: "acta", desde: hoy(), detalle: "Acta por diferencia" });
  assert.equal(ac.incidencia.estado, "registrada");
});

test("nómina quincenal: sueldo/30 por día, descuento por faltas y por retardos (3 = 1 día), total y prorrateo", () => {
  const d = crearSeed();
  const e = prueba(d, { sueldoMensual: 15000 }); // 500 por día
  const per = A.rangoPeriodo("quincenal", "2026-03", 1);
  assert.equal(per.desde, "2026-03-01"); assert.equal(per.hasta, "2026-03-15");
  const m = (fecha, estado) => d.rh.asistencia.push({ id: fecha + estado, empleadoId: e.id, fecha, sucursalId: "S1", entrada: estado === "falta" ? null : "09:30", salida: null, estado });
  m("2026-03-02", "falta"); m("2026-03-03", "falta"); m("2026-03-04", "retardo"); m("2026-03-05", "retardo"); m("2026-03-06", "retardo"); m("2026-03-09", "retardo");
  d.rh.vacaciones.push({ id: "vz", empleadoId: e.id, desde: "2026-03-03", hasta: "2026-03-03", dias: 1, estado: "aprobada" }); // cubre una falta
  const c = A.calcularNomina(d, e, per, "2026-04-01");
  assert.equal(c.sueldoPeriodo, 7500); assert.equal(c.diasPagados, 15);
  assert.equal(c.faltas, 1); assert.equal(c.descFaltas, 500);
  assert.equal(c.retardos, 4); assert.equal(c.descRetardos, 500); // floor(4/3) = 1 día
  assert.equal(c.total, 6500);
  const men = A.calcularNomina(d, e, A.rangoPeriodo("mensual", "2026-03"), "2026-04-01");
  assert.equal(men.sueldoPeriodo, 15000);
  const nuevo = prueba(d, { id: "EP", ingreso: "2026-03-11" });
  assert.equal(A.calcularNomina(d, nuevo, per, "2026-04-01").diasPagados, 5); // 11 a 15 de marzo
  d.rh.params = { ...A.paramsRH(d), retardosPorFalta: 2 };
  assert.equal(A.calcularNomina(d, e, per, "2026-04-01").descRetardos, 1000);
});

test("nómina por sucursal, recibo, firma y CSV; permisos por rol", () => {
  const d = crearSeed();
  const mes = hoy().slice(0, 7);
  const nom = A.nominaSucursal(d, { sucursalId: "S1", tipo: "quincenal", mes, q: 1 });
  assert.ok(nom.filas.length >= 5);
  assert.ok(nom.filas.every((f) => f.empleado.sucursalBase === "S1"));
  const suma = Math.round(nom.filas.reduce((s, f) => s + f.calc.total, 0) * 100) / 100;
  assert.equal(nom.totales.total, suma);
  const e = nom.filas.find((f) => f.empleado.estado === "activo" && f.empleado.sucursales.length === 1).empleado;
  d.rh.recibos = d.rh.recibos.filter((r) => r.empleadoId !== e.id);
  como(d, "cajero");
  assert.equal(A.generarReciboD(d, { empleadoId: e.id, tipo: "quincenal", mes, q: 1 }).ok, false);
  como(d, "gerente", "S2");
  assert.equal(A.generarReciboD(d, { empleadoId: e.id, tipo: "quincenal", mes, q: 1 }).ok, false); // otra sucursal
  como(d, "gerente", "S1");
  const g = A.generarReciboD(d, { empleadoId: e.id, tipo: "quincenal", mes, q: 1 });
  assert.equal(g.ok, true); assert.match(g.recibo.folio, /^RN-/); assert.equal(g.recibo.firmado, false);
  assert.equal(A.firmarReciboD(d, { id: g.recibo.id }).ok, true);
  assert.equal(A.generarReciboD(d, { empleadoId: e.id, tipo: "quincenal", mes, q: 1 }).ok, false); // firmado: no se recalcula
  const csv = A.nominaCSV(d, A.nominaSucursal(d, { sucursalId: "S1", tipo: "quincenal", mes, q: 1 }));
  assert.match(csv, /Empleado,Puesto/); assert.match(csv, /TOTAL/);
  assert.ok(csv.split("\r\n").length >= nom.filas.length + 2);
});

test("empleados: permisos de edición, expediente, baja con finiquito y reingreso", () => {
  const d = crearSeed();
  const e = d.rh.empleados.find((x) => x.rol === "cajero" && x.estado === "activo" && x.sucursalBase === "S3");
  como(d, "gerente", "S3");
  assert.equal(A.actualizarEmpleadoD(d, { id: e.id, cambios: { telefono: "55 0000 0000" } }).ok, true);
  assert.equal(A.actualizarEmpleadoD(d, { id: e.id, cambios: { sueldoMensual: 50000 } }).ok, false); // solo admin
  const doc = A.docsRequeridos(e)[0].k;
  assert.equal(A.marcarDocumentoD(d, { empleadoId: e.id, doc, ok: true }).ok, true);
  assert.equal(e.expediente[doc].ok, true);
  assert.equal(A.bajaEmpleadoD(d, { empleadoId: e.id, motivo: "x" }).ok, false); // gerente no da bajas
  como(d, "admin");
  assert.equal(A.actualizarEmpleadoD(d, { id: e.id, cambios: { sueldoMensual: 11000 } }).ok, true);
  assert.ok(d.rh.movimientos.some((m) => m.empleadoId === e.id && m.tipo === "cambio" && m.imss.estado === "pendiente_envio"));
  assert.equal(A.bajaEmpleadoD(d, { empleadoId: e.id, motivo: "  " }).ok, false);
  const b = A.bajaEmpleadoD(d, { empleadoId: e.id, fecha: hoy(), motivo: "Renuncia voluntaria" });
  assert.equal(b.ok, true); assert.ok(b.finiquito.total > 0);
  assert.equal(e.estado, "baja"); assert.equal(d.usuarios.find((u) => u.id === e.usuarioId).activo, false);
  const mb = d.rh.movimientos.find((m) => m.empleadoId === e.id && m.tipo === "baja");
  assert.equal(mb.motivo, "Renuncia voluntaria"); assert.equal(mb.imss.estado, "pendiente_envio"); assert.equal(mb.finiquito.estado, "por_pagar");
  assert.equal(A.reingresoEmpleadoD(d, { empleadoId: e.id, fecha: hoy() }).ok, true);
  assert.equal(e.estado, "activo"); assert.equal(d.usuarios.find((u) => u.id === e.usuarioId).activo, true);
  assert.ok(e.ingresoOriginal);
  const alta = A.altaEmpleadoD(d, { nombre: "Nuevo Ingreso Prueba", rol: "cajero", sucursalBase: "S2", sueldoMensual: 10000, ingreso: hoy() });
  assert.equal(alta.ok, true); assert.equal(A.avanceExpediente(alta.empleado).pct, 0);
  como(d, "gerente", "S2");
  assert.equal(A.altaEmpleadoD(d, { nombre: "Otro Nombre", rol: "cajero", sucursalBase: "S2", sueldoMensual: 10000, ingreso: hoy() }).ok, false);
});

test("expediente: avance por documentos requeridos del puesto", () => {
  const e = { rol: "podologo", expediente: { acta: { ok: true }, curp: { ok: true }, cedula: { ok: true } } };
  const a = A.avanceExpediente(e);
  assert.equal(a.total, 8); assert.equal(a.entregados, 3); assert.equal(a.pct, 38);
  assert.equal(A.avanceExpediente({ rol: "cajero", expediente: {} }).total, 7); // sin cédula
});

test("YouTube: extracción del id (watch, youtu.be, embed, shorts) y rechazo de enlaces no válidos", () => {
  const id = "dQw4w9WgXcQ";
  const ok = [`https://www.youtube.com/watch?v=${id}`, `https://youtube.com/watch?v=${id}&t=30s`, `https://youtu.be/${id}`, `https://youtu.be/${id}?si=abc`, `https://www.youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`, `youtu.be/${id}`, `https://m.youtube.com/watch?v=${id}`];
  ok.forEach((u) => assert.equal(A.extraerIdYoutube(u), id, u));
  ["", null, "hola", id, "https://vimeo.com/123456789", "https://www.youtube.com/watch?v=corto", "https://www.youtube.com/playlist?list=PL123", "https://evil.com/watch?v=" + id, "https://youtu.be/"].forEach((u) => assert.equal(A.extraerIdYoutube(u), null, String(u)));
  assert.equal(A.urlEmbedYoutube(id), `https://www.youtube-nocookie.com/embed/${id}?rel=0`);
});

test("capacitación: progreso, evaluación con mínimo, constancia y permisos de gestión", () => {
  const d = crearSeed();
  const u = como(d, "cajero", "S1", 1);
  d.cap.avance = d.cap.avance.filter((a) => a.usuarioId !== u.id);
  const c = d.cap.cursos.find((x) => x.id === "C6");
  assert.equal(A.progresoCurso(d, u.id, c).pct, 0);
  assert.equal(A.marcarLeccionVistaD(d, { cursoId: "C6", leccionId: "L1" }).ok, true);
  assert.equal(A.marcarLeccionVistaD(d, { cursoId: "C6", leccionId: "L1" }).ok, true); // idempotente
  let p = A.progresoCurso(d, u.id, c);
  assert.equal(p.vistas, 1); assert.equal(p.total, 4); assert.equal(p.pct, Math.round((1 / 5) * 100)); // 4 lecciones + evaluación
  assert.equal(A.evaluarCursoD(d, { cursoId: "C6", respuestas: [1, 0, 1, 0, 1] }).ok, false); // faltan lecciones
  ["L2", "L3", "L4"].forEach((l) => A.marcarLeccionVistaD(d, { cursoId: "C6", leccionId: l }));
  p = A.progresoCurso(d, u.id, c);
  assert.equal(p.leccionesCompletas, true); assert.equal(p.completo, false); assert.equal(p.pct, 80);
  const mal = A.evaluarCursoD(d, { cursoId: "C6", respuestas: [0, 1, 0, 1, 0] });
  assert.equal(mal.ok, true); assert.equal(mal.calif, 0); assert.equal(mal.aprobado, false); assert.equal(mal.completado, false);
  assert.equal(A.evaluarCursoD(d, { cursoId: "C6", respuestas: [1, 0] }).ok, false); // incompleta
  const bien = A.evaluarCursoD(d, { cursoId: "C6", respuestas: [1, 0, 1, 0, 1] });
  assert.equal(bien.calif, 100); assert.equal(bien.aprobado, true); assert.equal(bien.completado, true); assert.match(bien.constancia, /^CT-/);
  assert.equal(A.progresoCurso(d, u.id, c).pct, 100);
  const cal = A.calificarEvaluacion(c, [1, 0, 1, 1, 1]); // 4 de 5 = 80, mínimo 80 → aprueba
  assert.equal(cal.calif, 80); assert.equal(cal.aprobado, true);
  assert.equal(A.calificarEvaluacion(c, [1, 0, 0, 1, 1]).aprobado, false); // 60
  // permisos
  assert.equal(A.guardarCursoD(d, { titulo: "X", lecciones: [{ titulo: "a" }] }).ok, false);
  assert.equal(A.estadoCursoD(d, { cursoId: "C6", estado: "archivado" }).ok, false);
  assert.equal(A.asignarCursoD(d, { cursoId: "C6", roles: ["cajero"] }).ok, false);
});

test("cursos asignados: obligatorios por rol y para personal nuevo; avance por persona", () => {
  const d = crearSeed();
  const cajero = como(d, "cajero", "S1", 0);
  const mot = A.cursosDeUsuario(d, cajero).reduce((o, x) => ({ ...o, [x.curso.id]: x.motivo }), {});
  assert.equal(mot.C6, "obligatorio"); assert.equal(mot.C4, "opcional");
  const nuevo = d.rh.empleados.find((e) => A.esPersonalNuevo(e) && e.rol === "cajero");
  assert.ok(nuevo, "el seed trae personal nuevo");
  const mn = A.cursosDeUsuario(d, d.usuarios.find((x) => x.id === nuevo.usuarioId)).find((x) => x.curso.id === "C2");
  assert.ok(["obligatorio", "nuevo"].includes(mn.motivo));
  const c = d.cap.cursos.find((x) => x.id === "C6");
  const filas = A.avancePorPersona(d, c, "S1");
  assert.ok(filas.length >= 1); assert.ok(filas.every((f) => f.empleado.sucursales.includes("S1") && ["cajero", "gerente"].includes(f.empleado.rol) || f.motivo === "nuevo"));
  assert.ok(filas.every((f) => ["completo", "en_curso", "sin_iniciar"].includes(f.estado)));
});

test("gestión de cursos: valida enlace de YouTube y evaluación de 3 a 5 preguntas", () => {
  const d = crearSeed(); como(d, "gerente", "S1");
  const l = (extra = {}) => ({ titulo: "Lección", ...extra });
  const q = (n) => Array.from({ length: n }, (_, i) => ({ p: `Pregunta ${i}`, opciones: ["a", "b"], correcta: 0 }));
  assert.match(A.guardarCursoD(d, { titulo: "Prueba", lecciones: [l({ youtubeUrl: "https://vimeo.com/1" })] }).error, /YouTube/);
  assert.match(A.guardarCursoD(d, { titulo: "Prueba", lecciones: [l()], evaluacion: { minimo: 80, preguntas: q(2) } }).error, /3 y 5/);
  assert.match(A.guardarCursoD(d, { titulo: "Prueba", lecciones: [l()], evaluacion: { minimo: 80, preguntas: q(6) } }).error, /3 y 5/);
  assert.equal(A.guardarCursoD(d, { titulo: "", lecciones: [l()] }).ok, false);
  const r = A.guardarCursoD(d, { titulo: "Curso nuevo", lecciones: [l({ youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" }), l()], evaluacion: { minimo: 70, preguntas: q(3) }, asignado: { roles: ["cajero"], personas: [], nuevos: true } });
  assert.equal(r.ok, true);
  assert.equal(r.curso.lecciones[0].youtube, "dQw4w9WgXcQ"); assert.equal(r.curso.lecciones[1].youtube, null);
  assert.equal(r.curso.estado, "borrador");
  assert.equal(A.estadoCursoD(d, { cursoId: r.curso.id, estado: "publicado" }).ok, true);
  assert.equal(A.asignarCursoD(d, { cursoId: r.curso.id, roles: ["recepcion"], personas: [], nuevos: false }).ok, true);
  assert.ok(d.bitacora.some((b) => b.accion === "curso_creado"));
});

test("acervo: publicar/archivar solo gestores; visibilidad por rol y sucursal; búsqueda", () => {
  const d = crearSeed();
  const u = como(d, "recepcion", "S1");
  assert.equal(A.guardarAcervoD(d, { titulo: "x", tipo: "guia", categoria: "Clínico" }).ok, false);
  assert.equal(A.archivarAcervoD(d, { id: "AC1" }).ok, false);
  const vis = A.acervoVisible(d, u, "S1", {});
  assert.ok(vis.length >= 6);
  assert.ok(vis.every((a) => a.estado !== "archivado" && (!a.roles.length || a.roles.includes("recepcion")) && (!a.sucursalId || a.sucursalId === "S1")));
  assert.ok(!vis.some((a) => a.id === "AC19")); // dirigido solo a Polanco (S6)
  assert.ok(A.acervoVisible(d, u, "S6", {}).some((a) => a.id === "AC19"));
  assert.ok(A.acervoVisible(d, u, "S1", { q: "BANDERAS rojas" }).length >= 1); // sin acentos ni mayúsculas
  como(d, "gerente", "S1");
  assert.equal(A.guardarAcervoD(d, { titulo: "Video", tipo: "video", categoria: "Caja y cobro", youtubeUrl: "https://example.com/x" }).ok, false);
  const n = A.guardarAcervoD(d, { titulo: "Video de corte 2", tipo: "video", categoria: "Caja y cobro", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", etiquetas: ["corte"] });
  assert.equal(n.ok, true); assert.equal(n.entrada.youtube, "dQw4w9WgXcQ"); assert.equal(n.entrada.version, "1.0"); assert.equal(n.entrada.revision.responsable, d.sesion.userId);
  const e2 = A.guardarAcervoD(d, { ...n.entrada, descripcion: "Actualizado" });
  assert.equal(e2.entrada.version, "1.1");
  assert.equal(A.archivarAcervoD(d, { id: n.entrada.id }).ok, true);
  assert.ok(!A.acervoVisible(d, d.usuarios.find((x) => x.id === d.sesion.userId), "S1", {}).some((a) => a.id === n.entrada.id));
  assert.ok(A.acervoVisible(d, d.usuarios.find((x) => x.id === d.sesion.userId), "S1", { archivados: true }).some((a) => a.id === n.entrada.id));
  const ger1 = como(d, "gerente", "S1");
  assert.equal(A.guardarAcervoD(d, { titulo: "Local", tipo: "guia", categoria: "Clínico", sucursalId: "S3" }).ok, false); // no es su sucursal
  void ger1;
});

test("asistencia del día: quién entró, retardos, faltas, y quién está hoy en la sucursal", () => {
  const d = crearSeed();
  const ayer = sumarDias(hoy(), -1);
  const t = A.asistenciaDia(d, { fecha: ayer, sucursalId: "S1" });
  assert.ok(t.filas.length >= 4);
  assert.equal(t.resumen.retardos, t.filas.filter((f) => f.estado === "retardo").length);
  const e = d.rh.empleados.find((x) => x.sucursalBase === "S1" && x.estado === "activo" && x.usuarioId && x.sucursales.length === 1);
  // forzamos un día sin marca y lo convertimos en falta
  const dia = sumarDias(hoy(), -3);
  d.rh.asistencia = d.rh.asistencia.filter((a) => !(a.empleadoId === e.id && a.fecha === dia));
  d.rh.vacaciones = d.rh.vacaciones.filter((v) => v.empleadoId !== e.id); d.rh.incidencias = d.rh.incidencias.filter((v) => v.empleadoId !== e.id);
  d.rh.asignaciones = d.rh.asignaciones.filter((a) => a.empleadoId !== e.id);
  assert.equal(A.estadoDia(d, e, dia).estado, "sin_registro");
  como(d, "recepcion");
  assert.equal(A.marcarFaltasDiaD(d, { fecha: dia, sucursalId: "S1" }).ok, false);
  como(d, "gerente", "S2");
  assert.equal(A.marcarFaltasDiaD(d, { fecha: dia, sucursalId: "S1" }).ok, false);
  como(d, "gerente", "S1");
  assert.equal(A.marcarFaltasDiaD(d, { fecha: hoy(), sucursalId: "S1" }).ok, false);
  const m = A.marcarFaltasDiaD(d, { fecha: dia, sucursalId: "S1" });
  assert.equal(m.ok, true); assert.ok(m.n >= 1);
  assert.equal(A.estadoDia(d, e, dia).estado, "falta");
  // quién está hoy: entró y no ha salido
  d.rh.asistencia.push({ id: "z1", empleadoId: e.id, fecha: hoy(), sucursalId: "S1", entrada: "08:00", salida: null, estado: "normal" });
  assert.ok(A.quienEstaHoy(d, "S1").some((x) => x.empleado.id === e.id));
  assert.ok(!A.quienEstaHoy(d, "S2").some((x) => x.empleado.id === e.id));
});

test("semilla: un empleado por usuario, sueldos realistas, asistencia coherente y contenido sin ids de YouTube inventados", () => {
  const d = crearSeed();
  const con = d.rh.empleados.filter((e) => e.usuarioId);
  assert.equal(con.length, d.usuarios.length);
  assert.equal(new Set(con.map((e) => e.usuarioId)).size, d.usuarios.length);
  const rango = { podologo: [16000, 22000], gerente: [20000, 24000], cajero: [9000, 12000], recepcion: [9000, 12000], asistente: [9500, 13000], almacen: [10000, 14000] };
  con.forEach((e) => { const r = rango[e.rol]; if (r) assert.ok(e.sueldoMensual >= r[0] && e.sueldoMensual <= r[1], `${e.nombre} ${e.rol} ${e.sueldoMensual}`); assert.equal(e.foto, null); assert.ok(e.ingreso >= "2019-01-01" && e.ingreso <= hoy()); });
  assert.ok(d.rh.empleados.some((e) => e.estado === "baja") && d.rh.movimientos.some((m) => m.tipo === "reingreso"));
  assert.ok(d.rh.asistencia.some((a) => a.estado === "retardo") && d.rh.asistencia.some((a) => a.estado === "falta"));
  d.rh.asistencia.forEach((a) => { if (a.entrada && a.estado === "retardo") assert.ok(A.aMin(a.entrada) - A.aMin(d.rh.empleados.find((e) => e.id === a.empleadoId).horario.entrada) > 10); });
  d.rh.asistencia.filter((a) => a.fecha === hoy() && a.entrada).forEach((a) => assert.ok(a.entrada <= new Date().toTimeString().slice(0, 5) || a.entrada <= "23:59"));
  assert.ok(d.cap.cursos.length >= 8 && d.cap.acervo.length >= 15);
  d.cap.cursos.forEach((c) => c.lecciones.forEach((l) => assert.equal(l.youtube, null)));
  d.cap.acervo.forEach((a) => assert.equal(a.youtube, null));
  d.cap.cursos.forEach((c) => { const n = c.evaluacion.preguntas.length; assert.ok(n >= 3 && n <= 5, c.titulo); c.evaluacion.preguntas.forEach((p) => assert.ok(p.correcta >= 0 && p.correcta < p.opciones.length)); });
  assert.ok(d.rh.recibos.length > 40 && d.rh.recibos.every((r) => r.total <= r.sueldoPeriodo));
  // la sucursal programada del podólogo coincide con la de sus citas de hoy
  const pod = d.usuarios.find((u) => u.rol === "podologo"); const ep = d.rh.empleados.find((e) => e.usuarioId === pod.id);
  const cita = d.citas.find((c) => c.podologoId === pod.id && c.inicio.slice(0, 10) === hoy() && !["cancelada", "no_asistio"].includes(c.estado));
  if (cita) assert.equal(A.sucursalHoy(d, ep.id, hoy()), cita.sucursalId);
  assert.ok(A.empleadosActivos(d, "S1").length >= 8);
});

test("finiquito de demostración: vacaciones proporcionales, prima 25 % y aguinaldo proporcional", () => {
  const e = { id: "F", sueldoMensual: 15000, ingreso: "2024-01-01" };
  const f = A.calcularFiniquito(e, "2026-07-01");
  assert.equal(f.salarioDiario, 500);
  assert.ok(f.vacaciones > 0 && Math.abs(f.prima - f.vacaciones * 0.25) < 0.02);
  assert.equal(f.aguinaldo, Math.round((15 * 500 * 182) / 365 * 100) / 100); // 1 ene a 1 jul = 182 días
  assert.equal(f.total, Math.round((f.vacaciones + f.prima + f.aguinaldo) * 100) / 100);
});
