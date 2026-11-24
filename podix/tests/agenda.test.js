// Pruebas del dominio «agenda» (porte de Pie Firme): P-039, P-041, P-042, P-043, P-045, P-047 y permisos por rol.
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as A from "../src/store/acciones_agenda.js";
import { hoy, sumarDias, dia } from "../src/lib/format.js";

/** Estado con un día de trabajo limpio (sin citas ni bloqueos) para un podólogo, 40+ días adelante, sin festivo. */
function escenario() {
  const d = crearSeed();
  const p = d.usuarios.find((u) => u.rol === "podologo");
  let f = sumarDias(hoy(), 40);
  for (let i = 0; i < 30; i++) {
    const j = A.jornadaPodologo(d, p.id, f);
    if (A.diaSemana(f) !== 0 && A.diaSemana(f) !== 6 && !j.descanso && j.sucursalId && !A.festivoDe(d, f, j.sucursalId)) break;
    f = sumarDias(f, 1);
  }
  const suc = A.sucursalDelPodologo(d, p.id, f);
  d.citas = d.citas.filter((c) => dia(c.inicio) !== f);
  d.agenda.bloqueos = d.agenda.bloqueos.filter((b) => !(dia(b.inicio) <= f && dia(b.fin) >= f));
  const usr = (rol, s = suc) => d.usuarios.find((u) => u.rol === rol && u.sucursales.includes(s));
  const como = (rol, s = suc) => { d.sesion = { userId: usr(rol, s).id, sucursalId: s }; return usr(rol, s); };
  const pac = d.pacientes[0], pac2 = d.pacientes[1], sv = d.servicios.find((s) => s.duracion === 60) || d.servicios[0];
  const cita = (h, o = {}) => { const c = { id: `T${h.replace(":", "")}${o.podologoId || ""}`, pacienteId: pac.id, servicioId: sv.id, podologoId: p.id, consultorioId: "C1", sucursalId: suc, inicio: `${f}T${h}`, duracion: 60, estado: "confirmada", ...o }; d.citas.push(c); return c; };
  return { d, p, f, suc, como, usr, pac, pac2, sv, cita, ahora: `${sumarDias(hoy(), 0)}T08:00` };
}
const codigos = (v) => v.errores.map((e) => e.codigo);

test("parámetros de la agenda (porte de Pie Firme)", () => {
  assert.equal(A.PARAMS_AGENDA.margenMin, 10);
  assert.equal(A.PARAMS_AGENDA.sobrecupoMaxDia, 1);
  assert.equal(A.PARAMS_AGENDA.toleranciaNoAsistioMin, 15);
  assert.equal(A.PARAMS_AGENDA.esperaVentanaMin, 30);
  assert.equal(A.PARAMS_AGENDA.esperaVenceDias, 14);
  assert.equal(A.PARAMS_AGENDA.recordatorioHorasAntes, 24);
  assert.equal(A.PARAMS_AGENDA.anticipoPortalPct, 30);
  assert.equal(A.PARAMS_AGENDA.retencionMin, 10);
  assert.equal(A.PARAMS_AGENDA.reprogMax, 2);
  assert.equal(A.PARAMS_AGENDA.reprogHorasAviso, 48);
});

test("margen de 10 min entre citas del mismo podólogo (P-043)", () => {
  const { d, p, f, suc, cita } = escenario();
  cita("10:00");
  const v1 = A.validarCita(d, { sucursalId: suc, podologoId: p.id, inicio: `${f}T11:00`, duracion: 30 });
  assert.ok(codigos(v1).includes("margen"), v1.textos.join());
  const v2 = A.validarCita(d, { sucursalId: suc, podologoId: p.id, inicio: `${f}T11:10`, duracion: 30 });
  assert.ok(v2.ok, v2.textos.join());
  const v3 = A.validarCita(d, { sucursalId: suc, podologoId: p.id, inicio: `${f}T08:50`, duracion: 60 });
  assert.ok(!v3.ok, "terminar a las 09:50 deja 10 min, pero 08:50 está fuera de la jornada");
  const v4 = A.validarCita(d, { sucursalId: suc, podologoId: p.id, inicio: `${f}T09:00`, duracion: 55 });
  assert.ok(codigos(v4).includes("margen"), "09:00–09:55 deja solo 5 min");
});

test("sobrecupo: máximo 1 por podólogo y día, lo autoriza Administración (P-042)", () => {
  const { d, p, f, suc, cita, como, pac2, sv } = escenario();
  cita("10:00");
  const base = { sucursalId: suc, podologoId: p.id, inicio: `${f}T10:00`, duracion: 30 };
  assert.ok(codigos(A.validarCita(d, base)).includes("empalme"));
  assert.ok(codigos(A.validarCita(d, base, { sobrecupo: true })).includes("sobrecupo_sin_autorizacion"));
  assert.ok(A.validarCita(d, base, { sobrecupo: true, autorizadoPor: "U2" }).ok);
  // Flujo completo con acciones y roles
  como("recepcion");
  const s = A.solicitarSobrecupo(d, { sucursalId: suc, podologoId: p.id, fecha: f, hora: "10:00", pacienteId: pac2.id, servicioId: sv.id, motivo: "Dolor agudo" });
  assert.ok(s.ok, s.error); assert.equal(s.estado, "solicitado");
  assert.equal(A.agendarSobrecupo(d, s.id).ok, false, "sin autorización no se agenda");
  assert.equal(A.resolverSobrecupo(d, s.id, "autorizado").ok, false, "recepción no autoriza");
  como("gerente");
  assert.equal(A.resolverSobrecupo(d, s.id, "autorizado").ok, false, "el gerente tampoco");
  d.sesion = { userId: d.usuarios.find((u) => u.rol === "admin").id, sucursalId: suc };
  assert.ok(A.resolverSobrecupo(d, s.id, "autorizado").ok);
  como("recepcion");
  const c = A.agendarSobrecupo(d, s.id);
  assert.ok(c.ok, c.error);
  assert.ok(d.citas.find((x) => x.id === c.id).sobrecupo);
  // Segundo sobrecupo del mismo día: rechazado
  const s2 = A.solicitarSobrecupo(d, { sucursalId: suc, podologoId: p.id, fecha: f, hora: "10:30", pacienteId: d.pacientes[3].id, servicioId: sv.id, motivo: "Otro" });
  assert.equal(s2.ok, false);
  assert.ok(codigos(A.validarCita(d, { ...base, inicio: `${f}T10:30` }, { sobrecupo: true, autorizadoPor: "U2" })).includes("sobrecupo_max"));
});

test("tolerancia de 15 min para «No asistió» (P-045)", () => {
  const { d, f, cita, como } = escenario();
  const c = cita("10:00");
  assert.equal(A.puedeMarcarNoAsistio(d, c, `${f}T10:10`).ok, false);
  assert.equal(A.puedeMarcarNoAsistio(d, c, `${f}T10:10`).faltanMin, 5);
  assert.equal(A.puedeMarcarNoAsistio(d, c, `${f}T10:15`).ok, true);
  como("recepcion");
  assert.equal(A.marcarNoAsistio(d, c.id, { ahora: `${f}T10:05` }).ok, false);
  assert.ok(A.marcarNoAsistio(d, c.id, { ahora: `${f}T10:16` }).ok);
  assert.equal(d.citas.find((x) => x.id === c.id).estado, "no_asistio");
  assert.equal(A.revertirNoAsistio(d, c.id).ok, false, "revertir es solo de Administración");
});

test("bloqueo autorizado y festivo impiden la cita (P-047)", () => {
  const { d, p, f, suc, como } = escenario();
  const cand = { sucursalId: suc, podologoId: p.id, inicio: `${f}T12:00`, duracion: 30 };
  assert.ok(A.validarCita(d, cand).ok);
  // El podólogo solicita: aún no bloquea
  d.sesion = { userId: p.id, sucursalId: suc };
  const sol = A.crearBloqueo(d, { ambito: "podologo", podologoId: p.id, sucursalId: suc, tipo: "permiso", inicio: `${f}T11:30`, fin: `${f}T13:00`, motivo: "Trámite" });
  assert.ok(sol.ok, sol.error); assert.equal(sol.estado, "solicitado");
  assert.ok(A.validarCita(d, cand).ok, "un bloqueo solicitado no cierra la agenda");
  como("gerente");
  assert.ok(A.resolverBloqueo(d, sol.id, "autorizado").ok);
  assert.ok(codigos(A.validarCita(d, cand)).includes("bloqueo"));
  assert.equal(A.huecosDisponibles(d, { sucursalId: suc, podologoId: p.id, fecha: f, duracion: 30 }).some((h) => h.hora === "12:00"), false);
  // Festivo general que cierra: solo Administración
  assert.equal(A.guardarFestivo(d, { fecha: f, nombre: "Prueba", sucursalId: null, abre: false }).ok, false, "el gerente no captura festivos generales");
  d.sesion = { userId: d.usuarios.find((u) => u.rol === "admin").id, sucursalId: suc };
  assert.ok(A.guardarFestivo(d, { fecha: f, nombre: "Festivo de prueba", sucursalId: null, abre: false }).ok);
  assert.ok(codigos(A.validarCita(d, { ...cand, inicio: `${f}T10:00` })).includes("festivo"));
  assert.deepEqual(A.huecosDisponibles(d, { sucursalId: suc, fecha: f, duracion: 30 }), []);
});

test("festivos oficiales de México del año en curso y el siguiente", () => {
  const d = crearSeed();
  const anio = Number(hoy().slice(0, 4));
  for (const y of [anio, anio + 1]) {
    const fs = d.agenda.festivos.filter((x) => x.fecha.startsWith(String(y)) && x.oficial).map((x) => x.fecha);
    for (const m of ["01-01", "05-01", "09-16", "12-25"]) assert.ok(fs.includes(`${y}-${m}`), `${y}-${m}`);
    assert.ok(fs.some((x) => x.startsWith(`${y}-02-`)) && fs.some((x) => x.startsWith(`${y}-03-`)) && fs.some((x) => x.startsWith(`${y}-11-`)));
  }
  const rev = A.festivosMexico(2026).find((x) => x.nombre.startsWith("Día de la Revolución"));
  assert.equal(rev.fecha, "2026-11-16");
  assert.equal(A.festivosMexico(2027).find((x) => x.nombre.startsWith("Día de la Constitución")).fecha, "2027-02-01");
});

test("lista de espera: vence a 14 días y ventana de 30 min (P-041)", () => {
  const { d, p, f, suc, como, pac2, sv } = escenario();
  como("recepcion");
  const r = A.altaEspera(d, { pacienteId: pac2.id, servicioId: sv.id, sucursalId: suc, preferencia: "cualquiera", prioridad: "alta" });
  assert.ok(r.ok, r.error);
  assert.equal(r.vence, sumarDias(hoy(), 14));
  const e = d.listaEspera.find((x) => x.id === r.id);
  assert.equal(A.estadoEspera(e, `${sumarDias(hoy(), 14)}T18:00`), "esperando");
  assert.equal(A.estadoEspera(e, `${sumarDias(hoy(), 15)}T09:00`), "vencida");
  assert.equal(A.altaEspera(d, { pacienteId: pac2.id, servicioId: sv.id, sucursalId: suc }).ok, false, "sin duplicados");
  // Hueco: candidatos y notificación
  const h = A.huecosDisponibles(d, { sucursalId: suc, podologoId: p.id, fecha: f, duracion: sv.duracion })[0];
  assert.ok(h);
  assert.ok(A.candidatosParaHueco(d, h).some((x) => x.id === e.id));
  const ahora = `${hoy()}T10:00`;
  const n = A.notificarEspera(d, e.id, h, { ahora });
  assert.ok(n.ok, n.error);
  assert.equal(n.hasta, `${hoy()}T10:30`);
  assert.equal(A.estadoEspera(e, `${hoy()}T10:29`), "notificado");
  assert.equal(A.estadoEspera(d.listaEspera.find((x) => x.id === e.id), `${hoy()}T10:31`), "sin_respuesta");
  assert.ok(!A.candidatosParaHueco(d, h, ahora).some((x) => x.id === e.id), "no se le vuelve a ofrecer el mismo hueco");
  assert.equal(A.confirmarEspera(d, e.id, { ahora: `${hoy()}T10:31` }).ok, false, "fuera de la ventana ya no");
  const ok = A.confirmarEspera(d, e.id, { ahora: `${hoy()}T10:20` });
  assert.ok(ok.ok, ok.error);
  assert.ok(!d.listaEspera.some((x) => x.id === e.id));
  assert.equal(d.agenda.esperaHist[0].estado, "agendado");
  assert.equal(d.citas.find((c) => c.id === ok.citaId).inicio, h.inicio);
});

test("recordatorio 24 h antes (P-039)", () => {
  const { d, f, suc, cita, como } = escenario();
  const c = cita("10:00", { estado: "por_confirmar" });
  const antes = sumarDias(f, -1);
  assert.equal(A.tocaRecordar(c, `${antes}T09:59`), false);
  assert.equal(A.tocaRecordar(c, `${antes}T10:00`), true);
  assert.equal(A.programadoPara(c), `${antes}T10:00`);
  const cola = A.colaRecordatorios(d, { sucursalId: suc, fecha: f, ahora: `${antes}T11:00` });
  const x = cola.find((y) => y.cita.id === c.id);
  assert.ok(x && x.toca && x.estado === "pendiente");
  assert.match(A.textoRecordatorio(d, c), /10:00/);
  como("recepcion");
  assert.ok(A.marcarRecordatorio(d, c.id, "confirmo", { ahora: `${antes}T11:00` }).ok);
  assert.equal(d.citas.find((y) => y.id === c.id).estado, "confirmada");
  const st = A.estadisticasRecordatorios(d, { sucursalId: suc, desde: f, hasta: f });
  assert.equal(st.confirmo, 1);
  assert.match(A.waEnlace("55 1234 5678", "hola"), /^https:\/\/wa\.me\/525512345678\?text=hola$/);
  const sim = A.simularEnvioAutomatico(d, { sucursalId: suc, fecha: f, ahora: `${antes}T11:00` });
  assert.ok(sim.ok && sim.simulado);
});

test("huecos disponibles respetan citas, margen, comida y rotación", () => {
  const { d, p, f, suc, cita } = escenario();
  cita("10:00");
  const hs = A.huecosDisponibles(d, { sucursalId: suc, podologoId: p.id, fecha: f, duracion: 30 }).map((h) => h.hora);
  assert.ok(hs.includes("09:00"), "09:00–09:30 deja 30 min antes de las 10:00: sí cabe");
  assert.ok(!hs.includes("09:30"), "09:30–10:00 no deja los 10 min de margen");
  assert.ok(!hs.includes("10:00") && !hs.includes("10:30") && !hs.includes("11:00"));
  assert.ok(hs.includes("11:30"));
  assert.ok(!hs.includes("14:00"), "hora de comida");
  const otra = p.sucursales.find((s) => s !== suc);
  if (otra) assert.deepEqual(A.huecosDisponibles(d, { sucursalId: otra, podologoId: p.id, fecha: f, duracion: 30 }), [], "ese día atiende en la otra sucursal");
});

test("permisos por rol en horarios, bloqueos y parámetros", () => {
  const { d, p, suc, como, f } = escenario();
  como("recepcion");
  assert.equal(A.guardarHorarioSucursal(d, { sucursalId: suc, dia: 1, abre: "08:00", cierra: "20:00" }).ok, false);
  assert.equal(A.crearBloqueo(d, { ambito: "sucursal", sucursalId: suc, tipo: "junta", inicio: `${f}T09:00`, fin: `${f}T10:00` }).ok, false);
  const otra = d.sucursales.find((s) => !d.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(suc)).sucursales.includes(s.id)).id;
  como("gerente");
  assert.ok(A.guardarHorarioSucursal(d, { sucursalId: suc, dia: 1, abre: "08:00", cierra: "20:00" }).ok);
  assert.equal(A.guardarHorarioSucursal(d, { sucursalId: otra, dia: 1, abre: "08:00", cierra: "20:00" }).ok, false, "gerente solo su sucursal");
  assert.equal(A.guardarParams(d, { margenMin: 5 }).ok, false);
  d.sesion = { userId: p.id, sucursalId: suc };
  const otroPod = d.usuarios.find((u) => u.rol === "podologo" && u.id !== p.id);
  assert.equal(A.crearBloqueo(d, { ambito: "podologo", podologoId: otroPod.id, tipo: "vacaciones", inicio: `${f}T00:00`, fin: `${f}T23:59`, motivo: "x" }).ok, false);
  assert.equal(A.guardarHorarioPodologo(d, { podologoId: p.id, dia: 1, turnos: [{ de: "09:00", a: "12:00" }] }).ok, false, "el podólogo no edita su jornada");
  d.sesion = { userId: d.usuarios.find((u) => u.rol === "direccion").id, sucursalId: suc };
  assert.ok(A.guardarParams(d, { margenMin: 15 }).ok);
  assert.equal(A.paramsAgenda(d).margenMin, 15);
  assert.ok(d.bitacora.some((b) => b.accion === "parametros_agenda"));
  assert.ok(d.bitacora.some((b) => b.accion === "horario_sucursal"));
});

test("la semilla base es coherente con horarios, festivos y bloqueos", () => {
  const d = crearSeed();
  const malas = d.citas.filter((c) => !A.validarCita(d, c, { existente: true }).ok);
  assert.equal(malas.length, 0, malas.slice(0, 3).map((c) => `${c.id} ${c.inicio}: ${A.validarCita(d, c, { existente: true }).textos[0]}`).join(" | "));
  assert.ok(d.listaEspera.length > 7 && d.listaEspera.every((e) => e.vence && e.sucursalId));
  assert.ok(d.agenda.bloqueos.some((b) => b.estado === "solicitado") && d.agenda.bloqueos.some((b) => b.estado === "autorizado"));
  assert.ok(d.agenda.recordatorios.length > 0);
  for (const b of d.agenda.bloqueos.filter((x) => x.estado === "autorizado")) assert.equal(A.citasAfectadasPorBloqueo(d, b).length, 0, b.id);
});
