import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as A from "../src/store/acciones_podologo.js";
import * as R from "../src/store/reglas.js";
import { hoy, sumarDias } from "../src/lib/format.js";

const nuevo = () => {
  const d = crearSeed();
  const u = d.usuarios.find((x) => x.rol === "podologo");
  d.sesion = { userId: u.id, sucursalId: u.sucursales[0] };
  return { d, u };
};
const citaPara = (d, u) => {
  const pac = d.pacientes[0];
  const cita = { id: "CITA_T", pacienteId: pac.id, servicioId: "SV2", podologoId: u.id, consultorioId: "C1", sucursalId: u.sucursales[0], inicio: hoy() + "T10:00", duracion: 45, estado: "confirmada" };
  d.citas.push(cita); return cita;
};

test("CIE-10: busca por código y por palabra", () => {
  assert.equal(A.buscarCie10("B35.1")[0].codigo, "B35.1");
  assert.ok(A.buscarCie10("hongos").some((c) => c.codigo === "B35.1"));
  assert.ok(A.buscarCie10("fascitis").some((c) => c.codigo === "M72.2"));
  assert.equal(A.buscarCie10("zzzz").length, 0);
});

test("exploración: rangos, presión y avisos", () => {
  assert.equal(A.validarExploracion({ peso: "70", talla: "1.65", glucosa: "120", presion: "120/80", itb: "1.0" }).ok, true);
  const v = A.validarExploracion({ peso: "900", talla: "165", presion: "80/120", glucosa: "abc" });
  assert.deepEqual(Object.keys(v.errores).sort(), ["glucosa", "peso", "presion", "talla"]);
  assert.ok(A.validarExploracion({ itb: "0.7" }).avisos.some((a) => a.includes("ITB")));
  assert.ok(A.validarExploracion({}, { diabetico: true }).avisos.length >= 3);
  assert.equal(A.validarExploracion({ presion: "190/115" }).avisos.length, 1);
});

test("alertas: anticoagulado y alergia primero; diabético por alerta o CIE-10", () => {
  const al = A.alertasClinicas({ alertas: ["Diabetes tipo 2", "Anticoagulado"] });
  assert.equal(al[0].texto, "Anticoagulado"); assert.equal(al[0].tono, "bad");
  assert.ok(A.esDiabetico({ alertas: ["Diabetes tipo 2"] }));
  assert.ok(A.esDiabetico({ alertas: [] }, "E11.5 Pie diabético"));
  assert.ok(!A.esDiabetico({ alertas: [] }, "L60.0 Uña encarnada"));
});

test("comisión = ingreso × 10 %", () => {
  assert.equal(A.COMISION_PCT, 10);
  assert.equal(A.comisionEstimada(1234.5), 123.45);
  assert.equal(A.comisionEstimada(0), 0);
});

test("consulta: abrir, borrador, cerrar descuenta PEPS, deja faltantes y cita atendida", () => {
  const { d, u } = nuevo(); const cita = citaPara(d, u);
  const co = A.abrirConsulta(d, cita.id, u);
  assert.equal(co.estado, "abierta"); assert.equal(cita.estado, "en_atencion");
  assert.equal(A.abrirConsulta(d, cita.id, u).id, co.id); // sin duplicar
  assert.ok(co.consumo.length > 0);
  const antes = R.stock(d, cita.sucursalId, co.consumo[0].productoId);
  const [c0, c1] = co.consumo;
  // intento de cierre incompleto
  assert.equal(A.cerrarConsulta(d, co.id, u).ok, false);
  A.guardarBorrador(d, co.id, { diagnostico: "B35.1 Tiña de las uñas", nota: "Ok", exploracion: { peso: "70" }, consumo: [{ productoId: c0.productoId, cant: 1 }, { productoId: c1.productoId, cant: 9999 }] }, u);
  const r = A.cerrarConsulta(d, co.id, u);
  assert.equal(r.ok, true);
  assert.equal(R.stock(d, cita.sucursalId, c0.productoId), antes - 1);
  assert.equal(r.faltantes.length, 1); assert.ok(r.faltantes[0].cant > 0);
  assert.equal(R.stock(d, cita.sucursalId, c1.productoId), 0);
  assert.equal(co.estado, "cerrada"); assert.equal(cita.estado, "atendida");
  assert.ok(R.consultasPorCobrar(d, cita.sucursalId).some((x) => x.id === co.id));
  assert.equal(A.guardarBorrador(d, co.id, { nota: "cambio" }, u), false); // cerrada no se edita
  assert.notEqual(co.nota, "cambio");
  assert.ok(d.bitacora.some((b) => b.accion === "cerrar_consulta"));
});

test("adenda: solo en cerrada, con autor y fecha", () => {
  const { d, u } = nuevo(); const cita = citaPara(d, u);
  const co = A.abrirConsulta(d, cita.id, u);
  assert.equal(A.agregarAdenda(d, co.id, "texto largo", u).ok, false); // sigue abierta
  A.guardarBorrador(d, co.id, { diagnostico: "L84 Callosidades y callos", nota: "x" }, u); A.cerrarConsulta(d, co.id, u);
  assert.equal(A.agregarAdenda(d, co.id, "abc", u).ok, false);
  assert.equal(A.agregarAdenda(d, co.id, "Se corrige la indicación", u).ok, true);
  assert.equal(co.adendas[0].autorId, u.id); assert.ok(co.adendas[0].fecha);
  const otro = d.usuarios.find((x) => x.rol === "cajero");
  assert.equal(A.agregarAdenda(d, co.id, "Se corrige la indicación", otro).ok, false);
});

test("permisos: otro rol o podólogo ajeno no abre ni cierra", () => {
  const { d, u } = nuevo(); const cita = citaPara(d, u);
  assert.throws(() => A.abrirConsulta(d, cita.id, d.usuarios.find((x) => x.rol === "recepcion")));
  const otro = d.usuarios.filter((x) => x.rol === "podologo")[1];
  assert.throws(() => A.abrirConsulta(d, cita.id, otro));
});

test("plan de tratamiento: crea plan, avanza sesiones y completa", () => {
  const { d, u } = nuevo(); const cita = citaPara(d, u);
  A.asegurarPlanesDemo(d); d.planesTratamiento = [];
  const co = A.abrirConsulta(d, cita.id, u);
  A.guardarBorrador(d, co.id, { diagnostico: "B35.1 Tiña de las uñas", nota: "x", plan: { descripcion: "Láser", sesionesTotal: 2, frecuencia: "cada 2 semanas" } }, u);
  A.cerrarConsulta(d, co.id, u);
  const pl = A.planActivo(d, cita.pacienteId);
  assert.equal(pl.sesionActual, 1); assert.equal(A.textoSesion(pl), "2/2");
  const c2 = { ...cita, id: "CITA_T2" }; d.citas.push(c2);
  const co2 = A.abrirConsulta(d, c2.id, u);
  assert.equal(co2.sesion, "2/2");
  A.guardarBorrador(d, co2.id, { diagnostico: "B35.1 Tiña de las uñas", nota: "x" }, u); A.cerrarConsulta(d, co2.id, u);
  assert.equal(pl.estado, "completado");
});

test("plan en riesgo según frecuencia", () => {
  const pl = { estado: "activo", frecuencia: "cada semana", ultimaSesion: sumarDias(hoy(), -12) };
  assert.equal(A.planEnRiesgo(pl), true);
  assert.equal(A.planEnRiesgo({ ...pl, ultimaSesion: sumarDias(hoy(), -8) }), false);
});

test("orden de laboratorio: anticipo 50 %, folio LAB-, estado enviada", () => {
  const { d, u } = nuevo();
  const base = { pacienteId: d.pacientes[0].id, tipo: "Plantilla termoformada diabético", pie: "Ambos", talla: "25.5", toma: "Escáner 3D", correcciones: "x", laboratorioId: "LB1", prometida: sumarDias(hoy(), 14) };
  const r = A.crearOrdenLab(d, base, u, "S1");
  assert.equal(r.ok, true);
  const o = r.orden;
  assert.match(o.folio, /^LAB-\d{4}$/); assert.equal(o.estado, "enviada"); assert.equal(o.enviada, hoy());
  assert.equal(o.anticipoPendiente, 390); assert.equal(o.anticipoPagado, 0); assert.equal(o.costoLab, 0); assert.equal(o.podologoId, u.id);
  assert.equal(A.anticipoDe("Plantilla confort"), 225); assert.equal(A.anticipoDe("Plantilla a medida"), 450);
  assert.equal(A.crearOrdenLab(d, { ...base, talla: "99" }, u, "S1").ok, false);
  assert.equal(A.crearOrdenLab(d, { ...base, prometida: sumarDias(hoy(), -1) }, u, "S1").ok, false);
  assert.equal(A.crearOrdenLab(d, base, d.usuarios.find((x) => x.rol === "cajero"), "S1").ok, false);
});

test("órdenes: retrasadas primero (por fecha prometida vencida)", () => {
  const l = [{ id: 1, estado: "enviada", prometida: sumarDias(hoy(), 5) }, { id: 2, estado: "enviada", prometida: sumarDias(hoy(), -3) }, { id: 3, estado: "entregada", prometida: sumarDias(hoy(), -9) }];
  const o = A.ordenarOrdenes(l);
  assert.equal(o[0].id, 2); assert.equal(o[2].id, 3);
  assert.equal(A.estadoOrden(l[1]), "retrasada");
});

test("productividad: ventas con vendedorId, por periodo y sucursal", () => {
  const { d } = nuevo();
  const pid = d.ventas[0].vendedorId;
  const p = A.productividad(d, pid, { desde: sumarDias(hoy(), -30), hasta: hoy() });
  const esperado = d.ventas.filter((v) => v.vendedorId === pid && v.estado !== "cancelada").reduce((a, v) => a + v.total, 0);
  assert.equal(p.ingreso, Math.round(esperado * 100) / 100);
  assert.equal(p.comision, A.comisionEstimada(p.ingreso));
  assert.equal(p.porSucursal.reduce((a, s) => a + s.consultas, 0), p.consultas);
  const vacio = A.productividad(d, pid, { desde: "2000-01-01", hasta: "2000-01-02" });
  assert.equal(vacio.consultas, 0); assert.equal(vacio.ingreso, 0);
});

test("recetas: alergia coincidente, alta y WhatsApp", () => {
  const { d, u } = nuevo();
  const pac = { alertas: ["Alergia: látex"] };
  assert.equal(A.coincideAlergia(pac, "Guantes de latex"), "látex".normalize("NFD").replace(/[̀-ͯ]/g, ""));
  assert.equal(A.coincideAlergia(pac, "Terbinafina"), null);
  assert.equal(A.coincideAlergia({ alertas: ["Alergia a penicilina"] }, "Amoxicilina y penicilina"), "penicilina");
  assert.equal(A.coincideAlergia({ alertas: ["Diabetes tipo 2"] }, "lo que sea"), null);
  const p = d.pacientes[0];
  assert.equal(A.crearReceta(d, { pacienteId: p.id, medicamento: "", dosis: "1", duracion: "1" }, u, "S1").ok, false);
  const r = A.crearReceta(d, { pacienteId: p.id, medicamento: "Terbinafina 250 mg", dosis: "1 al día", duracion: "12 semanas" }, u, "S1");
  assert.equal(r.ok, true); assert.equal(d.recetas.length, 1); assert.match(r.receta.folio, /^RX-/);
  assert.ok(A.textoReceta(d, r.receta).includes("Terbinafina"));
  assert.ok(A.urlWhatsApp("55 1234 5678", "hola").startsWith("https://wa.me/525512345678?text="));
});
