// Dominio «clínica» (porte de Pie Firme): reglas puras y acciones con permisos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as A from "../src/store/acciones_clinica.js";
import * as C from "../src/store/reglas_clinica.js";
import { hoy, sumarDias } from "../src/lib/format.js";

const D = crearSeed();
const clon = () => structuredClone(D);
const rol = (d, r, i = 0) => d.usuarios.filter((x) => x.rol === r)[i];
const sesion = (d, u, s) => { d.sesion = { userId: u.id, sucursalId: s || u.sucursales[0] }; return u; };

// ───────── Semilla
test("semilla: colecciones del dominio, abundantes y sin pisar d.planes", () => {
  const d = clon();
  for (const k of ["plantillasPlan", "planesTrat", "pieDiabetico", "plantillasOrto", "quejas", "arco"]) assert.ok(d[k].length >= 6, k);
  assert.ok(d.crm.contactos.length > 10 && d.crm.campanas.length >= 3);
  assert.ok(d.planes.every((p) => p.parcialidades), "d.planes sigue siendo de ventas a plazos");
  assert.ok(d.planesTrat.some((p) => p.estado === "abandonado") && d.planesTrat.some((p) => p.estado === "completado"));
  assert.ok(d.pieDiabetico.every((v) => v.itbI !== 0 && v.itbD !== 0), "ningún ITB sembrado vale 0");
  assert.ok(d.plantillasOrto.filter((p) => p.ordenLabId).every((p) => d.ordenesLab.find((o) => o.id === p.ordenLabId && o.plantillaOrtoId === p.id)), "plantillas enlazadas a su orden");
  assert.ok(d.ciclos.some((c) => A.estadoLote(c) === "bloqueado"));
});

// ───────── SINBAD y Wagner
test("SINBAD: 0 a 6, cada ítem vale 1 como máximo", () => {
  assert.equal(A.puntajeSinbad({}), 0);
  assert.equal(A.puntajeSinbad({ s: 1, i: 1, n: 1, b: 1, a: 1, d: 1 }), 6);
  assert.equal(A.puntajeSinbad({ s: 5, i: 2, n: true, b: "1", a: 0, d: null }), 2, "un valor distinto de 0/1 no suma");
  const sug = A.sugerirSinbad({ region: "talon", pulsos: { pedioI: "ausente", tibialI: "disminuido" }, sensProtectora: "ausente", infeccion: "leve", areaCm2: 1, profundidad: "hueso_articulacion" });
  assert.equal(A.puntajeSinbad(sug), 6);
  assert.equal(A.puntajeSinbad(A.sugerirSinbad({ region: "antepie", pulsos: { pedioI: "presente" }, sensProtectora: "intacta", infeccion: "sin_infeccion", areaCm2: 0.9, profundidad: "subcutaneo" })), 0);
});
test("Wagner: entero de 0 a 5; límites", () => {
  assert.ok(A.wagnerValido(0) && A.wagnerValido(5) && A.wagnerValido("3"));
  for (const v of [-1, 6, 2.5, "", null, undefined, true, "x"]) assert.equal(A.wagnerValido(v), false, String(v));
});

// ───────── ITB (P-011)
test("ITB: vacío = no evaluado; 0 se rechaza siempre", () => {
  assert.deepEqual(A.validarItb(""), { ok: true, valor: null });
  assert.equal(A.validarItb(0).ok, false);
  assert.equal(A.validarItb("0").ok, false);
  assert.equal(A.validarItb("0,00").ok, false);
  assert.equal(A.validarItb("0.95").valor, 0.95);
  assert.equal(A.validarItb(3).ok, false);
  assert.equal(A.lecturaItb(null), "No evaluado");
});
test("valoración: la acción rechaza ITB 0 y no guarda nada", () => {
  const d = clon();
  const u = sesion(d, rol(d, "podologo"));
  const pacienteId = [...A.pacientesDe(d, u)][0];
  const n = d.pieDiabetico.length;
  const base = { pacienteId, fecha: hoy(), wagner: 0, itbI: "", itbD: "", pulsos: {}, mono: {} };
  const r = A.guardarValoracion(d, { ...base, itbI: 0 }, u, d.sesion.sucursalId);
  assert.equal(r.ok, false); assert.match(r.errores.itbI, /nunca es 0/);
  assert.equal(d.pieDiabetico.length, n);
  const ok = A.guardarValoracion(d, { ...base, frecuencia: "cada_3_meses" }, u, d.sesion.sucursalId);
  assert.equal(ok.ok, true); assert.equal(ok.valoracion.itbI, null);
  assert.equal(ok.valoracion.proximaRevision, sumarDias(hoy(), 90));
  // Con úlcera activa Wagner ≥ 1 y SINBAD se guarda
  const ul = A.guardarValoracion(d, { ...base, wagner: 0, ulcera: { region: "talon", areaCm2: 2 }, sinbad: { s: 1, i: 0, n: 1, b: 0, a: 1, d: 0 } }, u, d.sesion.sucursalId);
  assert.equal(ul.ok, false);
  const ul2 = A.guardarValoracion(d, { ...base, wagner: 2, ulcera: { region: "talon", areaCm2: 2 }, sinbad: { s: 1, i: 0, n: 1, b: 0, a: 1, d: 0 } }, u, d.sesion.sucursalId);
  assert.equal(ul2.valoracion.sinbadTotal, 3);
  // Firmada: ya no se edita
  assert.equal(A.firmarValoracion(d, ul2.valoracion.id, u).ok, true);
  assert.equal(A.guardarValoracion(d, { ...base, id: ul2.valoracion.id, wagner: 1, ulcera: { region: "talon" }, sinbad: { s: 0, i: 0, n: 0, b: 0, a: 0, d: 0 } }, u, d.sesion.sucursalId).ok, false);
});
test("riesgo IWGDF: apagado por parámetro (P-010)", () => {
  const f = { lops: true, eap: true };
  assert.equal(A.sugerirRiesgo(f), null);
  assert.equal(A.sugerirRiesgo(f, { activo: true }), 2);
  assert.equal(A.sugerirRiesgo({ ulceraPrevia: true }, { activo: true }), 3);
  assert.equal(A.paramsClinica(clon()).riesgoIwgdfActivo, false);
  const d = clon();
  assert.equal(A.cambiarParamClinica(d, "riesgoIwgdfActivo", true, rol(d, "podologo")).ok, false);
  assert.equal(A.cambiarParamClinica(d, "riesgoIwgdfActivo", true, rol(d, "admin")).ok, true);
  assert.equal(A.paramsClinica(d).riesgoIwgdfActivo, true);
});

// ───────── Planes de tratamiento
const PL1 = A.PLANTILLAS_PLAN_BASE.find((p) => p.id === "PPL1");
test("plan: extracción + 4 curaciones incluidas a $0", () => {
  const ses = A.generarSesiones({ sesiones: PL1.sesiones, fechaInicio: "2026-11-16" }); // lunes
  assert.equal(ses.length, 5);
  assert.equal(A.totalPlan(ses), 1200);
  assert.equal(A.sesionesIncluidas(ses), 4);
  assert.deepEqual(ses.map((s) => s.fecha), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  const plan = { formaCobro: "por_sesion", sesiones: ses };
  assert.equal(A.cargoSesion(plan, ses[0]).monto, 1200);
  assert.equal(A.cargoSesion(plan, ses[3]).monto, 0);
  // Domingo cerrado: la sesión pasa al lunes y queda atrasada (P-028)
  const s2 = A.generarSesiones({ sesiones: PL1.sesiones, fechaInicio: "2026-11-20" });
  assert.equal(s2[2].fecha, "2026-11-23"); assert.equal(s2[2].atrasada, true);
  // Todo en la sesión 1
  const t = { formaCobro: "todo_primera", sesiones: ses };
  assert.equal(A.cargoSesion(t, ses[0]).monto, 1200); assert.equal(A.cargoSesion(t, ses[1]).monto, 0);
});
test("plan: alta, agenda, realización a $0 y cierre por acción", () => {
  const d = clon();
  const u = sesion(d, rol(d, "podologo", 1));
  const pacienteId = [...A.pacientesDe(d, u)][0];
  const r = A.crearPlanTrat(d, { pacienteId, plantillaId: "PPL1", nombre: PL1.nombre, fechaInicio: hoy(), formaCobro: "por_sesion", anticipo: 0, sesiones: PL1.sesiones }, u, d.sesion.sucursalId);
  assert.equal(r.ok, true);
  const p = r.plan;
  const ag = A.agendarSesion(d, p.id, 1, { fecha: hoy(), hora: "07:05", consultorioId: "C3" }, u);
  assert.equal(ag.ok, true);
  assert.ok(d.citas.find((c) => c.id === ag.cita.id && c.planTratId === p.id));
  assert.equal(A.realizarSesion(d, p.id, 1, u).cargo.monto, 1200);
  for (const n of [2, 3, 4]) assert.equal(A.realizarSesion(d, p.id, n, u).cargo.monto, 0);
  const fin = A.realizarSesion(d, p.id, 5, u);
  assert.equal(fin.cargo.monto, 0); assert.equal(fin.completado, true);
  assert.equal(d.planesTrat.find((x) => x.id === p.id).estado, "completado");
  // Otro podólogo no lo toca
  assert.equal(A.cancelarPlan(d, p.id, "prueba de permiso", rol(d, "podologo", 4)).ok, false);
  // Recepción no crea planes
  assert.equal(A.crearPlanTrat(d, { pacienteId, nombre: "x", fechaInicio: hoy(), sesiones: PL1.sesiones }, rol(d, "recepcion"), "S1").ok, false);
});
test("abandono a 30 días sin cita (P-026)", () => {
  const ref = "2026-12-31";
  const mk = (ult, extra = {}) => ({ estado: "activo", creado: "2026-10-01", sesiones: [{ n: 1, estado: "realizada", realizadaEn: ult, fecha: ult }, { n: 2, estado: "por_generar", fecha: sumarDias(ult, 7) }], ...extra });
  assert.equal(A.planAbandonable(mk(sumarDias(ref, -30)), ref), true);
  assert.equal(A.planAbandonable(mk(sumarDias(ref, -29)), ref), false);
  assert.equal(A.planPorAbandonar(mk(sumarDias(ref, -25)), ref), true);
  const conCita = mk(sumarDias(ref, -45)); conCita.sesiones[1] = { n: 2, estado: "agendada", fecha: sumarDias(ref, 2) };
  assert.equal(A.planAbandonable(conCita, ref), false);
  assert.equal(A.planAbandonable(mk(sumarDias(ref, -60), { estado: "completado" }), ref), false);
  // La acción los marca y deja nota
  const d = clon();
  const antes = d.planesTrat.filter((p) => A.planAbandonable(p)).length;
  assert.ok(antes > 0, "la semilla trae planes abandonables");
  const r = A.aplicarAbandonos(d, rol(d, "admin"));
  assert.equal(r.marcados.length, antes);
  assert.ok(r.marcados.every((id) => d.planesTrat.find((p) => p.id === id).estado === "abandonado"));
  assert.equal(A.aplicarAbandonos(d, rol(d, "cajero")).ok, false);
});
test("plan creado al cerrar consulta: se integra sin tocar d.planesTratamiento", () => {
  const d = clon();
  const u = sesion(d, rol(d, "podologo"));
  d.planesTratamiento = [{ id: "PT1", pacienteId: d.pacientes[0].id, podologoId: u.id, descripcion: "Láser", sesionesTotal: 4, frecuencia: "cada mes", sesionActual: 2, ultimaSesion: hoy(), estado: "activo", creado: sumarDias(hoy(), -30) }];
  const copia = JSON.stringify(d.planesTratamiento);
  assert.equal(A.planesDeConsulta(d, u).length, 1);
  const r = A.importarPlanConsulta(d, "PT1", u);
  assert.equal(r.ok, true);
  assert.equal(r.plan.sesiones.filter((s) => s.estado === "realizada").length, 2);
  assert.equal(JSON.stringify(d.planesTratamiento), copia);
  assert.equal(A.planesDeConsulta(d, u).length, 0);
  assert.equal(A.importarPlanConsulta(d, "PT1", u).ok, false);
});

// ───────── Plantillas ortopédicas (P-013)
test("días hábiles, garantía de 6 meses y anticipo del 50 %", () => {
  assert.equal(A.sumarDiasHabiles("2026-11-20", 1), "2026-11-23"); // viernes → lunes
  assert.equal(A.entregaEstimada("2026-12-01"), "2026-12-22"); // 15 hábiles; no hay festivo de por medio
  assert.equal(A.entregaEstimada("2026-11-10"), "2026-12-02"); // salta el 16-nov (festivo)
  assert.equal(A.garantiaHasta("2026-08-31"), "2027-02-28");
  assert.equal(A.enGarantia("2026-06-01", 6, "2026-12-01"), true);
  assert.equal(A.enGarantia("2026-06-01", 6, "2026-12-02"), false);
  assert.equal(A.anticipoPlantilla(900), 450);
});
test("plantilla: borrador → enviada crea UNA orden de laboratorio; la garantía se respeta", () => {
  const d = clon();
  const u = sesion(d, rol(d, "podologo", 2));
  const pacienteId = [...A.pacientesDe(d, u)][1];
  const estudio = { tipo: "escaner3d", tallaCalzado: 26, longI: 250, longD: 252, anchoI: 95, anchoD: 96, tipoArco: "Plano", retropie: "Valgo", dismetriaMm: 0, pesoKg: 70 };
  const r = A.crearPlantillaOrto(d, { pacienteId, estudio, orden: { modelo: "Plantilla a medida", precio: 900, laboratorioId: "LB1" } }, u, d.sesion.sucursalId);
  assert.equal(r.ok, true);
  const n = d.ordenesLab.length;
  const env = A.enviarPlantillaLab(d, r.plantilla.id, u);
  assert.equal(env.ok, true);
  assert.equal(d.ordenesLab.length, n + 1);
  assert.equal(env.orden.anticipoPendiente, 450);
  assert.equal(env.orden.prometida, A.entregaEstimada(hoy(), 15, A.festivosDe(d)));
  assert.equal(A.enviarPlantillaLab(d, r.plantilla.id, u).ok, false, "no se envía dos veces");
  const po = d.plantillasOrto.find((p) => p.id === r.plantilla.id);
  assert.equal(A.estadoPO(d, po), "enviada");
  // El almacén la entrega (pantalla Entrega de plantillas): el estado sigue a la orden
  Object.assign(d.ordenesLab.find((o) => o.id === po.ordenLabId), { estado: "entregada", entregada: sumarDias(hoy(), -200) });
  assert.equal(A.estadoPO(d, po), "entregada");
  assert.equal(A.reclamarGarantia(d, po.id, "Se despegó el forro", u).ok, false, "más de 6 meses: fuera de garantía");
  d.ordenesLab.find((o) => o.id === po.ordenLabId).entregada = sumarDias(hoy(), -20);
  assert.equal(A.reclamarGarantia(d, po.id, "Se despegó el forro", u).ok, true);
  // Estudio inválido
  assert.equal(A.crearPlantillaOrto(d, { pacienteId, estudio: { ...estudio, tallaCalzado: 50 } }, u, d.sesion.sucursalId).ok, false);
});

// ───────── Esterilización por lotes (P-023)
test("lote: estados por indicador y bloqueo con pacientes atendidos", () => {
  assert.equal(A.estadoLote({ indicadorQuimico: "conforme", indicadorBiologico: "pendiente" }), "liberado_condicionado");
  assert.equal(A.estadoLote({ indicadorQuimico: "conforme", indicadorBiologico: "conforme" }), "liberado");
  assert.equal(A.estadoLote({ indicadorQuimico: "no_conforme", indicadorBiologico: "pendiente" }), "rechazado");
  assert.equal(A.estadoLote({ indicadorQuimico: "conforme", indicadorBiologico: "no_conforme" }), "bloqueado");
  const d = clon();
  const asis = rol(d, "asistente");
  sesion(d, asis, asis.sucursales[0]);
  const s = d.sesion.sucursalId;
  const kits = d.sets.filter((x) => x.sucursalId === s).slice(0, 2).map((x) => x.id);
  const r = A.registrarLote(d, { lote: "L-TEST", autoclave: "AC-1", tipoCiclo: "instrumental_envuelto", indicadorQuimico: "conforme", indicadorBiologico: "pendiente", sets: kits }, asis, s);
  assert.equal(r.ok, true); assert.equal(r.estado, "liberado_condicionado");
  const cita = d.citas.find((c) => c.sucursalId === s);
  const kit = d.sets.find((x) => x.id === kits[0]);
  assert.equal(A.usarKit(d, { texto: A.textoQrKit(kit), citaId: cita.id }, asis).ok, true);
  assert.equal(A.usarKit(d, { texto: A.textoQrKit(kit), citaId: cita.id }, asis).ok, false, "usado = sucio, necesita nuevo ciclo");
  const b = A.registrarBiologico(d, r.ciclo.id, "no_conforme", asis);
  assert.equal(b.estado, "bloqueado");
  assert.deepEqual(b.pacientes.map((p) => p.pacienteId), [cita.pacienteId]);
  assert.ok(d.sets.filter((x) => kits.includes(x.id)).every((x) => x.estado === "sucio"));
  assert.equal(A.avisarPacienteLote(d, r.ciclo.id, cita.pacienteId, { canal: "telefono" }, asis).ok, true);
  assert.equal(A.pacientesDeLote(d, r.ciclo.id)[0].avisado, true);
  // Químico no viró: rechazado, no libera kits
  const k2 = d.sets.filter((x) => x.sucursalId === s).slice(2, 3).map((x) => x.id);
  assert.equal(A.registrarLote(d, { lote: "L-T2", autoclave: "AC-1", indicadorQuimico: "no_conforme", indicadorBiologico: "no_aplica", sets: k2 }, asis, s).estado, "rechazado");
  // Permisos: cajero no opera lotes; asistente no opera otra sucursal
  assert.equal(A.registrarLote(d, { lote: "L", autoclave: "AC-1", indicadorQuimico: "conforme", indicadorBiologico: "pendiente", sets: kits }, rol(d, "cajero"), s).ok, false);
  const otra = d.sucursales.find((x) => !asis.sucursales.includes(x.id)).id;
  assert.equal(A.registrarLote(d, { lote: "L", autoclave: "AC-1", indicadorQuimico: "conforme", indicadorBiologico: "pendiente", sets: d.sets.filter((x) => x.sucursalId === otra).map((x) => x.id) }, asis, otra).ok, false);
});
test("QR propio: matriz cuadrada de versión 1 a 3", () => {
  const m = A.qrMatriz("PODIX|KIT|SET-S1-1");
  assert.ok([21, 25, 29].includes(m.length));
  assert.ok(m.every((f) => f.length === m.length));
  assert.equal(m[0][0], true); // patrón de posición
  assert.deepEqual(A.rsCorreccion([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

// ───────── Quejas y ARCO
test("plazos: queja 3 días y ARCO 20 días con semáforo", () => {
  assert.equal(A.fechaLimite("2026-11-21T10:00", 3), "2026-11-24");
  assert.equal(A.fechaLimite("2026-11-21", 20), "2026-12-11");
  assert.equal(A.semaforo("2026-11-24", { ref: "2026-11-21" }).color, "verde");
  assert.equal(A.semaforo("2026-11-24", { ref: "2026-11-23" }).color, "ambar");
  assert.equal(A.semaforo("2026-11-24", { ref: "2026-11-24" }).texto, "Vence hoy");
  assert.equal(A.semaforo("2026-11-24", { ref: "2026-11-25" }).color, "rojo");
  assert.equal(A.semaforo("2026-11-24", { cerradaEn: "2026-11-26" }).texto, "Resuelta fuera de meta");
  assert.equal(A.semaforoArco({ estado: "recibida", limite: "2026-12-11" }, "2026-12-07").color, "ambar");
});
test("queja: recepción registra, gerente resuelve, Administración autoriza la compensación (P-022)", () => {
  const d = clon();
  const rec = sesion(d, rol(d, "recepcion"));
  const s = d.sesion.sucursalId;
  const co = d.consultas.find((c) => c.sucursalId === s);
  assert.equal(A.registrarQueja(d, { clase: "evento_adverso", tipo: "evento_adverso_infeccion", gravedad: "alta", descripcion: "Secreción en el canal ungueal", pacienteId: co.pacienteId }, rec, s).ok, false, "evento adverso exige sesión ligada");
  const r = A.registrarQueja(d, { clase: "evento_adverso", tipo: "evento_adverso_infeccion", gravedad: "alta", descripcion: "Secreción en el canal ungueal", pacienteId: co.pacienteId, consultaId: co.id }, rec, s);
  assert.equal(r.ok, true); assert.equal(r.queja.estado, "escalada"); assert.equal(r.queja.limite, sumarDias(hoy(), 3));
  assert.equal(A.registrarQueja(d, { clase: "administrativa", tipo: "tiempo_espera", gravedad: "baja", descripcion: "Esperó cuarenta minutos" }, rec, s).ok, true, "paciente opcional en administrativa");
  assert.equal(A.actualizarQueja(d, r.queja.id, { estado: "resuelta", resolucion: "Revisión sin costo" }, rec).ok, false, "recepción no resuelve");
  const g = d.usuarios.find((x) => x.rol === "gerente" && x.sucursales.includes(s));
  assert.equal(A.proponerCompensacion(d, r.queja.id, { tipo: "reembolso", monto: 700 }, g).estado, "propuesta");
  assert.equal(A.actualizarQueja(d, r.queja.id, { estado: "cerrada", resolucion: "Se atendió y se dio seguimiento clínico." }, g).ok, false, "no se cierra con compensación pendiente");
  assert.equal(A.resolverCompensacion(d, r.queja.id, true, g).ok, false, "el gerente no autoriza");
  assert.equal(A.resolverCompensacion(d, r.queja.id, true, rol(d, "admin")).ok, true);
  assert.equal(A.actualizarQueja(d, r.queja.id, { estado: "cerrada", resolucion: "Se atendió y se dio seguimiento clínico." }, g).ok, true);
  const q = d.quejas.find((x) => x.id === r.queja.id);
  assert.equal(A.semaforoQueja(q).texto, "Resuelta a tiempo");
  // Gerente de otra sucursal no la ve
  const g2 = d.usuarios.find((x) => x.rol === "gerente" && !x.sucursales.includes(s));
  assert.ok(!A.quejasVisibles(d, g2).some((x) => x.id === q.id));
  assert.ok(A.quejasVisibles(d, rol(d, "direccion")).some((x) => x.id === q.id));
  assert.equal(A.quejasVisibles(d, rol(d, "cajero")).length, 0);
});
test("ARCO: registra recepción, atiende solo Administración; cancelación excluye del CRM", () => {
  const d = clon();
  const rec = sesion(d, rol(d, "recepcion"));
  const p = d.pacientes[3];
  const r = A.registrarArco(d, { pacienteId: p.id, derecho: "cancelacion", descripcion: "Pide borrar sus datos de contacto" }, rec, d.sesion.sucursalId);
  assert.equal(r.ok, true); assert.equal(r.solicitud.limite, sumarDias(hoy(), 20));
  assert.equal(A.atenderArco(d, r.solicitud.id, { estado: "atendida", respuesta: "Se cancelaron sus datos de contacto." }, rol(d, "gerente")).ok, false);
  assert.equal(A.atenderArco(d, r.solicitud.id, { estado: "atendida", respuesta: "Se cancelaron sus datos de contacto." }, rol(d, "direccion")).ok, true);
  assert.ok(d.crm.noContactar.includes(p.id));
  assert.equal(A.registrarContacto(d, { pacienteId: p.id, canal: "whatsapp", resultado: "contactado" }, rec, d.sesion.sucursalId).ok, false);
});

// ───────── Seguimiento (CRM)
test("inactivos: 180 días o más desde la última visita", () => {
  assert.equal(A.esInactivo(180), true);
  assert.equal(A.esInactivo(179), false);
  assert.equal(A.esInactivo(null), false, "quien nunca vino no es inactivo");
  assert.equal(A.diasSinVenir(sumarDias(hoy(), -200)), 200);
  const d = clon();
  const lista = A.listaContacto(d, { segmento: "inactivos" });
  assert.ok(lista.length > 10);
  const uv = A.mapaUltimaVisita(d);
  assert.ok(lista.every((x) => A.diasSinVenir(uv.get(x.pacienteId)) >= 180));
  assert.ok(lista.some((x) => x.excluido) || d.crm.noContactar.every((id) => !lista.find((x) => x.pacienteId === id)));
});
test("CRM: enlaces manuales wa.me / tel: y permisos de campañas", () => {
  assert.equal(A.ligaWhatsApp("55 1234 5678", "Hola"), "https://wa.me/525512345678?text=Hola");
  assert.equal(A.ligaWhatsApp("521 55 1234 5678"), "https://wa.me/525512345678");
  assert.equal(A.ligaWhatsApp("1234"), null);
  assert.equal(A.ligaTel("55-1234-5678"), "tel:+525512345678");
  assert.equal(A.vistaPreviaMensaje("Hola {{nombre}} de {{sucursal}}", { nombre: "Ana" }), "Hola Ana de {{sucursal}}");
  const d = clon();
  // Un gerente cuya sucursal tenga pacientes inactivos: cuántos hay en cada sucursal depende de la hora en que se genera la semilla.
  const g = d.usuarios.filter((x) => x.rol === "gerente").find((x) => C.listaContacto(d, { segmento: "inactivos", sucursales: [x.sucursales[0]] }).some((r) => !r.excluido));
  assert.ok(g, "algún gerente con pacientes inactivos en su sucursal");
  assert.equal(A.crearCampana(d, { nombre: "Campaña ajena", segmento: "inactivos", sucursalId: d.sucursales.find((s) => !g.sucursales.includes(s.id)).id }, g).ok, false);
  const c = A.crearCampana(d, { nombre: "Reactivación de prueba", segmento: "inactivos", sucursalId: g.sucursales[0] }, g);
  assert.equal(c.ok, true); assert.equal(c.campana.estado, "borrador");
  assert.equal(A.aprobarCampana(d, c.campana.id, g).ok, false);
  assert.equal(A.aprobarCampana(d, c.campana.id, rol(d, "admin")).ok, true);
  assert.equal(A.crearCampana(d, { nombre: "Desde recepción", segmento: "inactivos" }, rol(d, "recepcion")).ok, false);
  const rec = sesion(d, d.usuarios.find((x) => x.rol === "recepcion" && x.sucursales.includes(g.sucursales[0])), g.sucursales[0]);
  const pid = c.campana.destinatarios[0];
  const ct = A.registrarContacto(d, { pacienteId: pid, canal: "whatsapp", resultado: "agendo", campanaId: c.campana.id }, rec, d.sesion.sucursalId);
  assert.equal(ct.ok, true);
  assert.equal(d.crm.campanas.find((x) => x.id === c.campana.id).estado, "en_curso");
  assert.equal(A.resumenCampana(d, d.crm.campanas.find((x) => x.id === c.campana.id)).agendaron, 1);
  assert.equal(A.registrarContacto(d, { pacienteId: pid, canal: "whatsapp", resultado: "agendo" }, rol(d, "cajero"), "S1").ok, false);
});

// ───────── Visibilidad clínica
test("visibilidad: podólogo ve sus pacientes; recepción no ve expedientes clínicos", () => {
  const d = clon();
  const u = rol(d, "podologo", 3);
  const mios = A.pacientesDe(d, u);
  assert.ok(A.planesVisibles(d, u).every((p) => p.podologoId === u.id || mios.has(p.pacienteId)));
  assert.equal(A.planesVisibles(d, rol(d, "recepcion")).length, 0);
  assert.equal(A.valoracionesVisibles(d, rol(d, "gerente")).length, 0);
  assert.equal(A.planesVisibles(d, rol(d, "admin")).length, d.planesTrat.length);
  assert.ok(A.lotesVisibles(d, rol(d, "asistente")).length > 0);
  assert.equal(A.lotesVisibles(d, rol(d, "podologo")).length, 0);
});
