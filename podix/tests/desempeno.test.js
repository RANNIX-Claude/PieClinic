// Pruebas del dominio «desempeño» (bonos y metas, análisis, evaluación de clientes). node --test tests/desempeno.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import { mutar, getState } from "../src/store/core.js";
import * as D from "../src/store/acciones_desempeno.js";

const MES = D.mesActual();
const r2 = (n) => Math.round(n * 100) / 100;
const usuario = (d, rol, suc) => d.usuarios.find((u) => u.rol === rol && (!suc || u.sucursales.includes(suc)));
const entrar = (d, rol, suc = "S1") => { const u = usuario(d, rol, suc); d.sesion = { userId: u.id, sucursalId: suc }; return u; };
const prodVenta = (d) => d.productos.find((p) => p.tipo === "venta" && p.categoria === "Bastones");
let n = 0;
/** Venta de producto atribuible (fecha dentro del mes en curso). */
function venta(d, { suc, cajeroId, vendedorId = null, importe, dd = 3, estado = "pagada" }) {
  const p = prodVenta(d);
  const v = { id: `VT${++n}`, folio: `T-9${n}`, sucursalId: suc, cajeroId, vendedorId, pacienteId: d.pacientes[0].id, tipo: "contado", fecha: `${MES}-${String(dd).padStart(2, "0")}T10:00`,
    partidas: [{ tipo: "producto", itemId: p.id, nombre: p.nombre, cant: 1, precio: importe, importe }], subtotal: importe, descuento: 0, total: importe, pagos: [{ forma: "efectivo", monto: importe }], estado, turnoId: "hist" };
  d.ventas.push(v); return v;
}
/** Estado limpio: sin ventas, citas, turnos ni ciclos ni histórico por persona del mes; esquemas de demostración y metas de la semilla. */
function limpio() {
  const d = crearSeed();
  d.ventas = []; d.citas = []; d.turnos = []; d.ciclos = []; d.consultas = []; d.devoluciones = []; delete d.rh;
  d.bonos.hist = [];
  return d;
}
const cajeroDe = (d, suc) => usuario(d, "cajero", suc);

test("atribución: vendedorId manda; si no hay, el cajero", () => {
  const d = limpio();
  const cj = cajeroDe(d, "S1"), rp = usuario(d, "recepcion", "S1");
  venta(d, { suc: "S1", cajeroId: cj.id, vendedorId: rp.id, importe: 1000 });
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 500 });
  const r = D.ventasPorVendedor(d, { desde: `${MES}-01`, hasta: D.finDeMes(MES) });
  assert.equal(r.find((x) => x.usuarioId === rp.id).total, 1000);
  assert.equal(r.find((x) => x.usuarioId === cj.id).total, 500);
  assert.equal(r.find((x) => x.usuarioId === cj.id).ventas.length, 1);
});

test("las ventas canceladas no cuentan y las devoluciones se restan", () => {
  const d = limpio();
  const cj = cajeroDe(d, "S1");
  const v = venta(d, { suc: "S1", cajeroId: cj.id, importe: 1000 });
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 700, estado: "cancelada" });
  assert.equal(D.ventasPorVendedor(d, { desde: `${MES}-01`, hasta: `${MES}-28` })[0].total, 1000);
  d.devoluciones.push({ id: "D1", ventaId: v.id, monto: 400, fecha: `${MES}-04` });
  assert.equal(D.ventasPorVendedor(d, { desde: `${MES}-01`, hasta: `${MES}-28` })[0].total, 600);
});

test("una venta hecha en OTRA sucursal cuenta en la sucursal de la venta, no en la base del colaborador", () => {
  const d = limpio();
  const rot = d.usuarios.find((u) => u.rol === "cajero" && u.sucursales.length === 2);
  assert.ok(rot, "la semilla trae cajeros que rotan");
  const [base, otra] = rot.sucursales;
  const antesOtra = D.ventaSucursalMes(d, otra, MES), antesBase = D.ventaSucursalMes(d, base, MES);
  venta(d, { suc: otra, cajeroId: rot.id, importe: 12000 });
  assert.equal(D.ventaSucursalMes(d, otra, MES), antesOtra + 12000);
  assert.equal(D.ventaSucursalMes(d, base, MES), antesBase);
  const ps = D.ventasPorVendedor(d, { desde: `${MES}-01`, hasta: `${MES}-28` })[0].porSucursal;
  assert.deepEqual(Object.keys(ps), [otra]);
  // y el bono individual suma la venta aunque sea de otra sucursal
  const b = D.bonosDe(d, { usuarioId: rot.id, mes: MES }).items.find((x) => x.esquemaId === "BE2");
  assert.equal(b.base, 12000);
  assert.ok(b.porSucursal[otra]);
});

test("escalones individuales: sin escalón, escalón alcanzado, siguiente y tope", () => {
  const d = limpio();
  const cj = cajeroDe(d, "S1");
  const bono = () => D.bonosDe(d, { usuarioId: cj.id, mes: MES }).items.find((x) => x.esquemaId === "BE2");
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 9999 });
  assert.equal(bono().bono, 0);
  assert.equal(bono().faltante, 1);
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 1 }); // 10,000 → 1.5 %
  assert.equal(bono().numeroEscalon, 1);
  assert.equal(bono().bono, 150);
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 15000 }); // 25,000 → 2.5 %
  assert.equal(bono().bono, r2(25000 * 0.025));
  assert.equal(bono().faltante, 5000);
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 200000 }); // 3.5 % de 225,000 = 7,875 → tope 3,000
  assert.equal(bono().bono, 3000);
  assert.equal(bono().topado, true);
  assert.match(bono().formula, /tope/);
});

test("el esquema no aplica a roles no elegibles", () => {
  const d = limpio();
  const as = usuario(d, "asistente");
  const r = D.bonosDe(d, { usuarioId: as.id, mes: MES });
  assert.ok(!r.items.some((x) => x.tipo === "individual"));
  const alm = usuario(d, "almacen");
  const ra = D.bonosDe(d, { usuarioId: alm.id, mes: MES });
  assert.equal(ra.elegible, false);
  assert.equal(ra.items.length, 0);
});

test("trimestral = suma de los 3 meses", () => {
  const d = limpio();
  entrar(d, "admin");
  const cj = cajeroDe(d, "S1");
  const per = D.periodoDe("trimestral", D.sumarMeses(MES, -3));
  assert.equal(per.meses.length, 3);
  d.bonos.hist = per.meses.map((m, i) => ({ usuarioId: cj.id, sucursalId: "S1", mes: m, ventas: 10000 * (i + 1), producto: 10000 * (i + 1), plantillasCalzado: 0, nVentas: 5, dias: 10 }));
  const r = D.guardarEsquema(d, { nombre: "Mostrador trimestral", tipo: "individual", periodo: "trimestral", base: "producto", roles: ["cajero"], escalones: [{ desde: 50000, tipo: "pct", valor: 2 }], tope: "", condiciones: {} });
  assert.ok(r.ok, r.error);
  const esq = d.bonos.esquemas.find((e) => e.id === r.id);
  const it = D.evaluarIndividual(d, esq, cj.id, per);
  assert.equal(it.base, 60000); // 10k + 20k + 30k
  assert.equal(it.bono, 1200);
  // cada mes por separado suma lo mismo
  const mensual = per.meses.map((m) => D.filasAtribucion(d, m).filter((f) => f.usuarioId === cj.id).reduce((a, f) => a + f.producto, 0));
  assert.equal(mensual.reduce((a, b) => a + b, 0), it.base);
  // la semana del trimestre se identifica con su clave
  assert.match(per.clave, /^\d{4}-T[1-4]$/);
});

test("bono por sucursal: la bolsa se reparte solo entre quienes trabajaron, proporcional a días", () => {
  const d = limpio();
  const cj = cajeroDe(d, "S1");
  const rp = usuario(d, "recepcion", "S1");
  const ocioso = d.usuarios.find((u) => u.rol === "cajero" && u.sucursales.includes("S1") && u.id !== cj.id);
  // meta de S1 = 10,000; se vende 12,000 el día 3 y el día 4 → 24,000 = 240 % → escalón máximo (bolsa 5,000)
  d.bonos.metas = d.bonos.metas.filter((m) => !(m.sucursalId === "S1" && m.mes === MES)).concat({ sucursalId: "S1", mes: MES, meta: 10000, origen: "fijada" });
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 12000, dd: 3 });
  venta(d, { suc: "S1", cajeroId: cj.id, vendedorId: rp.id, importe: 12000, dd: 4 });
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 1000, dd: 5 }); // el cajero trabaja 2 días (3 y 5), recepción 1 (día 4)
  const esq = d.bonos.esquemas.find((e) => e.id === "BE3");
  const it = D.evaluarSucursal(d, esq, "S1", D.periodoDe("mensual", MES));
  assert.ok(it.pct > 110);
  assert.equal(it.bolsa, 5000);
  const ids = it.reparto.map((x) => x.usuarioId).sort();
  assert.deepEqual(ids, [cj.id, rp.id].sort());
  assert.ok(!ids.includes(ocioso.id), "quien no trabajó no recibe parte");
  assert.equal(r2(it.reparto.reduce((a, x) => a + x.monto, 0)), 5000);
  const mc = it.reparto.find((x) => x.usuarioId === cj.id), mr = it.reparto.find((x) => x.usuarioId === rp.id);
  assert.equal(mc.dias, 2); assert.equal(mr.dias, 1);
  assert.ok(Math.abs(mc.monto - 3333.33) < 0.02 && Math.abs(mr.monto - 1666.67) < 0.02);
  // el podólogo de S1 que no vendió ni atendió citas no entra
  assert.ok(!it.reparto.some((x) => x.rol === "podologo"));
  // y la persona ve su parte en bonosDe
  const mio = D.bonosDe(d, { usuarioId: rp.id, mes: MES }).items.find((x) => x.esquemaId === "BE3" && x.sucursalId === "S1");
  assert.ok(Math.abs(mio.monto - 1666.67) < 0.02);
});

test("condición de asistencia: quien no la cumple queda fuera del reparto", () => {
  const d = limpio();
  const cj = cajeroDe(d, "S1"), rp = usuario(d, "recepcion", "S1");
  d.bonos.metas = d.bonos.metas.filter((m) => !(m.sucursalId === "S1" && m.mes === MES)).concat({ sucursalId: "S1", mes: MES, meta: 10000, origen: "fijada" });
  venta(d, { suc: "S1", cajeroId: cj.id, vendedorId: rp.id, importe: 12000, dd: 3 });
  venta(d, { suc: "S1", cajeroId: cj.id, importe: 12000, dd: 4 });
  d.rh = { empleados: [{ id: "E1", usuarioId: cj.id }, { id: "E2", usuarioId: rp.id }], asistencia: [] };
  const hasta = Math.max(1, Math.min(10, Number(D.mesActual() && new Date().getDate())));
  for (let dd = 1; dd <= hasta; dd++) {
    d.rh.asistencia.push({ id: `a${dd}`, empleadoId: "E1", fecha: `${MES}-${String(dd).padStart(2, "0")}`, sucursalId: "S1", entrada: null, salida: null, estado: "falta" });
    d.rh.asistencia.push({ id: `b${dd}`, empleadoId: "E2", fecha: `${MES}-${String(dd).padStart(2, "0")}`, sucursalId: "S1", entrada: "09:00", salida: "18:00", estado: "normal" });
  }
  const it = D.evaluarSucursal(d, d.bonos.esquemas.find((e) => e.id === "BE3"), "S1", D.periodoDe("mensual", MES));
  assert.equal(it.reparto.find((x) => x.usuarioId === cj.id).excluido, true);
  assert.equal(it.reparto.find((x) => x.usuarioId === rp.id).monto, it.bolsa);
});

test("sugerencia de meta: dentro de límites en todas las sucursales y con método explicado", () => {
  const d = crearSeed();
  const sig = D.sumarMeses(MES, 1);
  d.sucursales.forEach((s) => {
    const sg = D.sugerirMeta(d, s.id, sig);
    assert.ok(sg.ok);
    assert.ok(sg.sugerida >= sg.limites.min - 500 && sg.sugerida <= sg.limites.max + 500, `${s.id}: ${sg.sugerida} fuera de ${sg.limites.min}-${sg.limites.max}`);
    assert.ok(sg.tendenciaMensualPct >= -3 && sg.tendenciaMensualPct <= 3);
    assert.ok(sg.factorEstacional >= 0.97 && sg.factorEstacional <= 1.04);
    assert.equal(sg.sugerida % 1000, 0);
    assert.equal(sg.pasos.length, 4);
  });
  // histórico extremo: un mes disparado no rompe los límites
  const h = d.hist.filter((x) => x.sucursalId === "S1" && x.mes < MES).sort((a, b) => a.mes.localeCompare(b.mes));
  h[h.length - 1].servicios *= 10;
  const sg = D.sugerirMeta(d, "S1", sig);
  assert.ok(sg.sugerida <= sg.limites.max + 500);
  // sin historia suficiente
  d.hist = d.hist.filter((x) => x.sucursalId !== "S2");
  assert.equal(D.sugerirMeta(d, "S2", sig).ok, false);
});

test("semilla de metas: 12 meses + actual + siguiente por sucursal, con cumplimientos variados", () => {
  const d = crearSeed();
  d.sucursales.forEach((s) => {
    const m = d.bonos.metas.filter((x) => x.sucursalId === s.id);
    assert.equal(m.length, 14);
    assert.ok(D.metaSucursal(d, s.id, MES) > 0 && D.metaSucursal(d, s.id, D.sumarMeses(MES, 1)) > 0);
  });
  const prom = (id) => { const h = D.historialMetas(d, id).filter((x) => !x.enCurso && !x.futuro); return h.reduce((a, x) => a + x.pct, 0) / h.length; };
  assert.ok(prom("S1") > 100, "S1 casi siempre cumple");
  assert.ok(prom("S3") < 100, "S3 casi siempre se queda abajo");
  // los pagados históricos son coherentes: cada bolsa de sucursal se reparte completa
  const bolsas = d.bonos.pagados.filter((p) => p.tipo === "sucursal");
  assert.ok(bolsas.length > 10);
  bolsas.forEach((p) => assert.ok(Math.abs(p.reparto.reduce((a, x) => a + x.monto, 0) - p.bono) < 0.02));
  assert.ok(d.bonos.pagados.every((p) => p.estado === "pagado" && p.bono > 0));
  assert.ok(d.bonos.pagados.some((p) => p.periodoClave.includes("T")), "hay bonos trimestrales pagados");
});

test("cumplimiento: porcentaje, proyección del mes en curso y mes sin meta", () => {
  const d = limpio();
  const cj = cajeroDe(d, "S4");
  d.bonos.metas = d.bonos.metas.filter((m) => !(m.sucursalId === "S4" && m.mes === MES)).concat({ sucursalId: "S4", mes: MES, meta: 20000, origen: "fijada" });
  venta(d, { suc: "S4", cajeroId: cj.id, importe: 5000 });
  const c = D.cumplimientoSucursal(d, "S4", MES);
  assert.equal(c.real, 5000); assert.equal(c.pct, 25); assert.equal(c.enCurso, true);
  assert.ok(c.proyectado >= 5000);
  d.bonos.metas = d.bonos.metas.filter((m) => !(m.sucursalId === "S4" && m.mes === MES));
  assert.equal(D.cumplimientoSucursal(d, "S4", MES).pct, null);
});

test("permisos por rol en esquemas y metas", () => {
  const d = limpio();
  for (const rol of ["gerente", "cajero", "recepcion", "podologo", "almacen"]) {
    entrar(d, rol);
    assert.equal(D.guardarEsquema(d, { nombre: "Intento", tipo: "individual", periodo: "mensual", base: "ventas", roles: ["cajero"], escalones: [{ desde: 1, tipo: "pct", valor: 1 }] }).ok, false, rol);
    assert.equal(D.fijarMeta(d, { sucursalId: "S1", mes: MES, meta: 50000 }).ok, false, rol);
    assert.equal(D.aprobarBono(d, { esquemaId: "BE2", mes: D.sumarMeses(MES, -1), usuarioId: cajeroDe(d, "S1").id }).ok, false, rol);
  }
  entrar(d, "admin");
  assert.equal(D.fijarMeta(d, { sucursalId: "S1", mes: D.sumarMeses(MES, 2), meta: 350000 }).ok, true);
  assert.equal(D.metaSucursal(d, "S1", D.sumarMeses(MES, 2)), 350000);
  assert.equal(D.fijarMeta(d, { sucursalId: "S1", mes: MES, meta: 12 }).ok, false, "meta absurda");
  assert.equal(D.guardarEsquema(d, { nombre: "x", tipo: "individual", periodo: "mensual", base: "ventas", roles: ["cajero"], escalones: [{ desde: 1, tipo: "pct", valor: 1 }] }).ok, false, "nombre muy corto");
  assert.equal(D.guardarEsquema(d, { nombre: "Cumplimiento individual", tipo: "individual", periodo: "mensual", base: "cumplimiento", roles: ["cajero"], escalones: [{ desde: 1, tipo: "pct", valor: 1 }] }).ok, false, "cumplimiento solo en sucursal");
  assert.equal(D.guardarEsquema(d, { nombre: "Escalones repetidos", tipo: "individual", periodo: "mensual", base: "ventas", roles: ["cajero"], escalones: [{ desde: 1, tipo: "pct", valor: 1 }, { desde: 1, tipo: "pct", valor: 2 }] }).ok, false);
});

test("el gerente propone la meta solo de su sucursal y administración la acepta", () => {
  const d = limpio();
  const g = entrar(d, "gerente", "S2");
  const sig = D.sumarMeses(MES, 1);
  assert.equal(D.proponerMeta(d, { sucursalId: "S3", mes: sig, meta: 200000 }).ok, false, "otra sucursal");
  assert.equal(D.proponerMeta(d, { sucursalId: "S2", mes: D.sumarMeses(MES, -1), meta: 200000 }).ok, false, "mes pasado");
  const antes = D.metaSucursal(d, "S2", sig);
  const p = D.proponerMeta(d, { sucursalId: "S2", mes: sig, meta: 222000, nota: "Más podólogos" });
  assert.ok(p.ok, p.error);
  assert.equal(D.metaSucursal(d, "S2", sig), antes, "proponer no cambia la meta vigente");
  assert.equal(D.resolverPropuestaMeta(d, { id: p.id, aceptar: true }).ok, false, "el gerente no resuelve");
  entrar(d, "admin");
  assert.ok(D.resolverPropuestaMeta(d, { id: p.id, aceptar: true }).ok);
  assert.equal(D.metaSucursal(d, "S2", sig), 222000);
  assert.ok(g);
  // aceptar sugerencia como gerente = propuesta; como admin = fija
  entrar(d, "gerente", "S2");
  const a = D.aceptarSugerencia(d, { sucursalId: "S2", mes: D.sumarMeses(MES, 2) });
  assert.ok(a.ok); assert.equal(d.bonos.propuestas.filter((x) => x.estado === "pendiente").length, 1);
});

test("flujo calculado → aprobado → pagado con auditoría; el monto aprobado queda congelado", () => {
  const d = crearSeed();
  const ant = D.sumarMeses(MES, -1);
  const cj = d.usuarios.find((u) => u.rol === "cajero" && D.evaluarIndividual(d, d.bonos.esquemas[1], u.id, D.periodoDe("mensual", ant)).bono > 0);
  assert.ok(cj, "hay al menos un cajero con bono en el mes cerrado");
  const clave = { esquemaId: "BE2", mes: ant, usuarioId: cj.id };
  const item = () => D.bonosDe(d, { usuarioId: cj.id, mes: ant }).items.find((x) => x.esquemaId === "BE2");
  assert.equal(item().estado, "calculado");
  // el mes en curso aún no se aprueba
  entrar(d, "admin");
  assert.equal(D.aprobarBono(d, { esquemaId: "BE2", mes: MES, usuarioId: cj.id }).ok, false);
  const monto = item().bono;
  const bit = d.bitacora.length;
  const a = D.aprobarBono(d, clave);
  assert.ok(a.ok, a.error);
  assert.equal(a.monto, monto);
  assert.equal(item().estado, "aprobado");
  assert.equal(d.bitacora.length, bit + 1);
  assert.equal(d.bitacora[0].accion, "bono_aprobar");
  assert.equal(D.aprobarBono(d, clave).ok, false, "no se aprueba dos veces");
  // cambiar el esquema ya no mueve el bono aprobado
  d.bonos.esquemas.find((e) => e.id === "BE2").escalones = [{ desde: 1, tipo: "pct", valor: 50 }];
  assert.equal(item().bono, monto);
  assert.equal(D.pagarBono(d, clave).ok, true);
  assert.equal(item().estado, "pagado");
  assert.equal(D.pagarBono(d, clave).ok, false);
  assert.equal(d.bitacora[0].accion, "bono_pagar");
  assert.ok(D.historialBonosDe(d, cj.id).some((h) => h.estado === "pagado" && h.periodoClave === ant));
  // el gerente no puede pagar
  entrar(d, "gerente");
  assert.equal(D.pagarBono(d, clave).ok, false);
});

test("procesarPeriodo aprueba en bloque y solo administración", () => {
  const d = crearSeed();
  const ant = D.sumarMeses(MES, -1);
  entrar(d, "gerente");
  assert.equal(D.procesarPeriodo(d, { mes: ant, periodo: "mensual" }).ok, false);
  entrar(d, "admin");
  const r = D.procesarPeriodo(d, { mes: ant, periodo: "mensual" });
  assert.ok(r.ok && r.n > 0);
  const res = D.resumenPeriodo(d, { mes: ant, periodo: "mensual" });
  assert.ok([...res.individuales, ...res.sucursales].filter((x) => (x.bono ?? x.bolsa) > 0).every((x) => x.estado === "aprobado"));
  assert.ok(D.procesarPeriodo(d, { mes: ant, periodo: "mensual", accion: "pagar" }).n === r.n);
});

test("resumen del periodo: gerente solo ve su sucursal", () => {
  const d = crearSeed();
  const todo = D.resumenPeriodo(d, { mes: MES, periodo: "mensual" });
  const s2 = D.resumenPeriodo(d, { mes: MES, periodo: "mensual", sucursalIds: ["S2"] });
  assert.equal(s2.sucursales.length, 1);
  assert.equal(todo.sucursales.length, d.sucursales.length);
  assert.ok(s2.individuales.length < todo.individuales.length);
});

// ───────── Evaluación de clientes
test("semilla de evaluaciones: respuestas sobre citas atendidas reales, mayoría 4-5, algunas bajas y pendientes", () => {
  const d = crearSeed();
  const resp = d.eval.filter((e) => e.estado === "respondida");
  assert.ok(resp.length >= 100 && resp.length <= 130, `respuestas: ${resp.length}`);
  assert.ok(d.eval.filter((e) => e.estado === "pendiente").length >= 10);
  d.eval.forEach((e) => {
    const c = d.citas.find((x) => x.id === e.citaId);
    assert.ok(c && c.estado === "atendida", "citaId válido y atendida");
    assert.equal(e.podologoId, c.podologoId); assert.equal(e.sucursalId, c.sucursalId);
  });
  assert.equal(new Set(d.eval.map((e) => e.citaId)).size, d.eval.length, "una encuesta por cita");
  const altas = resp.filter((e) => D.califGeneral(e) >= 4).length;
  assert.ok(altas / resp.length > 0.6, "la mayoría 4-5");
  const bajas = resp.filter(D.esBaja);
  assert.ok(bajas.length >= 3 && bajas.length < resp.length * 0.25);
  bajas.forEach((e) => assert.ok(e.comentario.length > 10 && e.seguimiento));
});

test("alertas ≤ 2: aparecen al responder, se atienden con nota y se cierran al resolver", () => {
  const d = limpio();
  d.eval = [];
  const ci = { id: "CIX", pacienteId: d.pacientes[0].id, servicioId: d.servicios[0].id, podologoId: usuario(d, "podologo", "S1").id, consultorioId: "C1", sucursalId: "S1", inicio: `${MES}-02T10:00`, duracion: 30, estado: "atendida" };
  d.citas.push(ci);
  entrar(d, "recepcion", "S1");
  const c = D.crearEncuesta(d, { citaId: "CIX" });
  assert.ok(c.ok);
  assert.equal(D.crearEncuesta(d, { citaId: "CIX" }).ok, false, "no se duplica");
  assert.equal(D.responderEncuesta(d, { evalId: c.id, califServicio: 6, califPodologo: 5, califSucursal: 5 }).ok, false, "rango 1-5");
  const e = d.eval[0];
  assert.match(D.mensajeEncuesta(d, e), /encuesta/);
  const env = D.enviarEncuesta(d, { evalId: c.id, canal: "whatsapp" });
  assert.ok(env.ok && env.simulado === true);
  const r = D.responderEncuesta(d, { evalId: c.id, califServicio: 5, califPodologo: 2, califSucursal: 4, comentario: "Me dolió y no avisaron." });
  assert.ok(r.ok && r.alerta);
  assert.equal(D.alertasEval(d.eval).length, 1);
  assert.equal(D.responderEncuesta(d, { evalId: c.id, califServicio: 5, califPodologo: 5, califSucursal: 5 }).ok, false, "ya respondida");
  assert.equal(D.seguimientoEval(d, { evalId: c.id, estado: "contactado", nota: "" }).ok, false, "pide nota");
  assert.ok(D.seguimientoEval(d, { evalId: c.id, estado: "contactado", nota: "Llamé al paciente" }).ok);
  assert.equal(D.alertasEval(d.eval).length, 1, "contactado sigue en alerta");
  assert.ok(D.seguimientoEval(d, { evalId: c.id, estado: "resuelto", nota: "Cita de cortesía agendada" }).ok);
  assert.equal(D.alertasEval(d.eval).length, 0);
  // una calificación de 3 no genera alerta ni seguimiento
  d.citas.push({ ...ci, id: "CIY" });
  const c2 = D.crearEncuesta(d, { citaId: "CIY" });
  assert.equal(D.responderEncuesta(d, { evalId: c2.id, califServicio: 3, califPodologo: 3, califSucursal: 3 }).alerta, false);
  assert.equal(D.seguimientoEval(d, { evalId: c2.id, estado: "resuelto", nota: "no aplica aquí" }).ok, false);
});

test("permisos de evaluación: el podólogo ve solo las suyas; recepción solo su sucursal; el podólogo no da seguimiento", () => {
  const d = crearSeed();
  const pod = d.usuarios.find((u) => u.rol === "podologo" && d.eval.some((e) => e.podologoId === u.id));
  const vis = D.evaluacionesVisibles(d, pod);
  assert.ok(vis.length > 0 && vis.every((e) => e.podologoId === pod.id));
  const rec = usuario(d, "recepcion", "S3");
  const v2 = D.evaluacionesVisibles(d, rec);
  assert.ok(v2.length > 0 && v2.every((e) => rec.sucursales.includes(e.sucursalId)));
  assert.equal(D.evaluacionesVisibles(d, usuario(d, "cajero")).length, 0);
  assert.equal(D.evaluacionesVisibles(d, usuario(d, "admin")).length, d.eval.length);
  const baja = d.eval.find(D.esBaja);
  d.sesion = { userId: pod.id, sucursalId: pod.sucursales[0] };
  assert.equal(D.seguimientoEval(d, { evalId: baja.id, estado: "contactado", nota: "Intento de podólogo" }).ok, false);
  const otraSuc = d.usuarios.find((u) => u.rol === "recepcion" && !u.sucursales.includes(baja.sucursalId));
  d.sesion = { userId: otraSuc.id, sucursalId: otraSuc.sucursales[0] };
  assert.equal(D.seguimientoEval(d, { evalId: baja.id, estado: "contactado", nota: "Otra sucursal" }).ok, false);
});

test("estadísticas de evaluación: promedios, NPS-like y agrupación", () => {
  const mk = (a, b, c, f) => ({ estado: "respondida", califServicio: a, califPodologo: b, califSucursal: c, fecha: f, podologoId: "U1", sucursalId: "S1" });
  const lista = [mk(5, 5, 5, "2026-11-01T10:00"), mk(5, 5, 5, "2026-11-02T10:00"), mk(4, 4, 4, "2026-11-03T10:00"), mk(3, 3, 3, "2026-11-04T10:00"), mk(1, 2, 2, "2026-11-05T10:00"), mk(5, 5, 4, "2026-11-06T10:00"), { estado: "pendiente" }];
  const s = D.estadisticasEval(lista);
  assert.equal(s.n, 6); assert.equal(s.pendientes, 1);
  assert.equal(s.promServicio, r2((5 + 5 + 4 + 3 + 1 + 5) / 6));
  assert.equal(s.promotores, 3); assert.equal(s.detractores, 2); // ≥4.5 y ≤3
  assert.equal(s.nps, Math.round(((3 - 2) / 6) * 100));
  assert.equal(s.bajas, 1);
  assert.equal(typeof s.tendencia, "number");
  const d = crearSeed();
  const g = D.agruparEval(d, d.eval, "sucursal");
  assert.equal(g.reduce((a, x) => a + x.n, 0), d.eval.filter((e) => e.estado === "respondida").length);
});

// ───────── Análisis de datos
test("análisis: serie mensual de 13 meses calculada del estado y consistente con las metas", () => {
  const d = crearSeed();
  const s = D.serieMensual(d);
  assert.equal(s.length, 13);
  assert.equal(s[12].mes, MES); assert.equal(s[12].enCurso, true);
  s.forEach((x) => assert.ok(Math.abs(x.total - d.sucursales.reduce((a, su) => a + D.ventaSucursalMes(d, su.id, x.mes), 0)) < d.sucursales.length));
  const una = D.serieMensual(d, { sucursalId: "S3" });
  assert.equal(una[0].total, d.hist.filter((h) => h.sucursalId === "S3" && h.mes === una[0].mes).map((h) => h.servicios + h.plantillas + h.productos)[0]);
  assert.ok(s[12].servicios + s[12].plantillas + s[12].productos > 0);
});

test("análisis: ranking de podólogos, ocupación, productos y comparativo salen de los datos", () => {
  const d = crearSeed();
  const per = D.periodoAnalisis(d, "mes");
  const rk = D.rankingPodologos(d, { desde: per.vivoDesde, hasta: per.hasta });
  assert.equal(rk.length, d.usuarios.filter((u) => u.rol === "podologo").length);
  for (let i = 1; i < rk.length; i++) assert.ok(rk[i - 1].ingreso >= rk[i].ingreso);
  const total = D.ventasPorVendedor(d, { desde: per.vivoDesde, hasta: per.hasta }).filter((x) => rk.some((r) => r.usuarioId === x.usuarioId)).reduce((a, x) => a + x.total, 0);
  assert.ok(Math.abs(rk.reduce((a, r) => a + r.ingreso, 0) - total) < 0.01);
  assert.equal(D.ocupacionPorSucursal(d, { desde: per.vivoDesde, hasta: per.hasta }).length, 7);
  const pr = D.analisisProductos(d, { desde: per.ventasDesde, hasta: per.hasta });
  assert.ok(pr.masVendidos.length > 0 && pr.menorRotacion.length > 0);
  for (let i = 1; i < pr.masVendidos.length; i++) assert.ok(pr.masVendidos[i - 1].importe >= pr.masVendidos[i].importe);
  const cmp = D.comparativoSucursales(d, per);
  assert.equal(cmp.filas.length, 7);
  assert.ok(Math.abs(cmp.filas.reduce((a, f) => a + f.difVentas, 0)) < 0.5, "las diferencias contra el promedio suman ~0");
  assert.equal(D.comparativoSucursales(d, per, { sucursalId: "S2" }).filas.length, 1);
  assert.equal(D.carteraPorSucursal(d).length, 7);
});

test("acciones dentro de mutar(): escriben en el estado y dejan la auditoría con usuario y sucursal", () => {
  const antes = getState();
  const adm = antes.usuarios.find((u) => u.rol === "admin");
  const r = mutar((d) => { d.sesion = { userId: adm.id, sucursalId: "S2" }; return D.fijarMeta(d, { sucursalId: "S5", mes: D.sumarMeses(MES, 3), meta: 280000 }); });
  assert.ok(r.ok);
  const d = getState();
  assert.equal(D.metaSucursal(d, "S5", D.sumarMeses(MES, 3)), 280000);
  assert.equal(d.bitacora[0].accion, "meta_fijar");
  assert.equal(d.bitacora[0].usuarioId, adm.id);
  assert.equal(d.bitacora[0].sucursalId, "S2");
});

test("gancho de cierre de cita: crea la encuesta pendiente una sola vez y solo de citas atendidas", () => {
  const d = limpio();
  d.eval = [];
  const pod = usuario(d, "podologo", "S1");
  const ci = { id: "CIZ", pacienteId: d.pacientes[0].id, servicioId: d.servicios[0].id, podologoId: pod.id, consultorioId: "C1", sucursalId: "S1", inicio: `${MES}-02T10:00`, duracion: 30, estado: "en_atencion" };
  d.citas.push(ci);
  entrar(d, "podologo", "S1");
  assert.equal(D.encuestaAlCerrarCita(d, "CIZ"), null, "aún no está atendida");
  ci.estado = "atendida";
  const id = D.encuestaAlCerrarCita(d, "CIZ");
  assert.ok(id);
  assert.equal(d.eval[0].estado, "pendiente"); assert.equal(d.eval[0].podologoId, pod.id); assert.equal(d.eval[0].sucursalId, "S1");
  assert.equal(D.encuestaAlCerrarCita(d, "CIZ"), null, "no duplica");
  assert.equal(d.bitacora[0].accion, "encuesta_crear");
});
