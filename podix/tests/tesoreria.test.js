import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as X from "../src/store/acciones_tesoreria.js";
import * as T from "../src/store/reglas_tesoreria.js";
import { mesActual, mesRelativo } from "../src/store/dominios/finanzas.js";
import { hoy, sumarDias, redondear } from "../src/lib/format.js";

const BASE = crearSeed();
const nuevo = (rol = null, sucursalId = "S1") => {
  const d = structuredClone(BASE);
  if (!rol) return d;
  const u = d.usuarios.find((x) => x.rol === rol && (rol !== "gerente" || x.sucursales.includes(sucursalId)));
  d.sesion = { userId: u.id, sucursalId };
  return d;
};
const como = (d, rol, sucursalId = "S1") => { const u = d.usuarios.find((x) => x.rol === rol && (rol !== "gerente" || x.sucursales.includes(sucursalId))); d.sesion = { userId: u.id, sucursalId }; return d; };
const cerca = (a, b, t = 0.011) => Math.abs(a - b) <= t;
const suma = (a, f) => redondear(a.reduce((s, x) => s + f(x), 0));

test("semilla: cuentas sintéticas, depósitos del efectivo cobrado, fondo con gastos reales de finanzas, cierres y conciliaciones", () => {
  const d = nuevo();
  const t = d.tes;
  assert.equal(t.cuentas.length, d.sucursales.length + 1);
  assert.ok(t.cuentas.every((c) => /Demostración|Ficticia/.test(c.banco) && /DEMO/.test(c.numero)));
  assert.ok(t.depositos.length > 20 && t.depositos.every((x) => x.monto > 0 && x.registradoPor && x.sucursalId && x.cuentaId === T.cuentaDeSucursal(d, x.sucursalId).id));
  const gastosFondo = t.fondoMovs.filter((m) => m.tipo === "gasto");
  assert.ok(gastosFondo.length > 0);
  gastosFondo.forEach((m) => { const g = d.fin.gastos.find((x) => x.id === m.gastoId); assert.ok(g && g.monto === -m.monto && g.sucursalId === m.sucursalId); });
  assert.ok(t.movimientos.some((m) => m.estado === "conciliado") && t.movimientos.some((m) => m.estado === "detectado"));
  assert.ok(t.cierres.some((c) => c.estado === "cerrado") && t.cierres.some((c) => c.estado === "reabierto"));
  assert.ok(t.fondos.every((f) => T.estadoFondo(d, f.id).saldo >= 0));
});

test("ingresos = pagos de ventas + abonos (apartado, crédito/plazos), enganches, pedidos en línea y cobros a convenios", () => {
  const d = nuevo();
  const desde = sumarDias(hoy(), -40), hasta = hoy();
  const en = (f) => f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta;
  const filas = T.ingresosDe(d, { desde, hasta });
  const ventas = suma(d.ventas.filter((v) => v.estado !== "cancelada" && v.estado !== "a_credito" && v.tipo !== "apartado" && !v.apartadoId && !v.planId && en(v.fecha)), (v) => suma(v.pagos || [], (p) => (p.monto > 0 ? p.monto : 0)));
  const apartados = suma(d.apartados, (ap) => suma(ap.abonos.filter((a) => en(a.fecha)), (a) => a.monto));
  const credito = suma((d.abonosCredito || []).filter((a) => en(a.fecha)), (a) => a.monto);
  const enganches = suma(d.planes.filter((p) => p.enganche > 0 && p.estado !== "cancelado" && en(p.creado)), (p) => p.enganche);
  const web = suma((d.pedidosWeb || []).filter((p) => !p.ventaId && p.pago && p.pago.forma === "en_linea" && p.pago.estado === "pagado" && en(p.fecha)), (p) => p.total);
  const conv = suma(d.tes.cxc, (c) => suma(c.pagos.filter((p) => en(p.fecha)), (p) => p.monto));
  const t = T.totalesIngresos(filas);
  assert.ok(cerca(t.total, redondear(ventas + apartados + credito + enganches + web + conv), 0.05), `${t.total} vs ${ventas + apartados + credito + enganches + web + conv}`);
  assert.ok(cerca(t.total, suma(Object.values(t.porForma), (x) => x)) && cerca(t.total, suma(Object.values(t.porSucursal), (x) => x)));
  assert.ok(filas.every((f) => f.sucursalId && f.monto > 0 && f.forma));
  // La pantalla consolida por sucursal: la suma de las sucursales es el total.
  const porSuc = d.sucursales.map((s) => T.totalesIngresos(T.ingresosDe(d, { desde, hasta, sucursalId: s.id })).total);
  assert.ok(cerca(t.total, suma(porSuc, (x) => x), 0.05));
});

test("semana de corte: sábado a viernes", () => {
  assert.deepEqual([T.semanaCorte("2026-11-19").inicio, T.semanaCorte("2026-11-19").fin], ["2026-11-14", "2026-11-20"]); // jueves
  assert.equal(T.semanaCorte("2026-11-21").inicio, "2026-11-21"); // sábado: empieza ese día
  assert.equal(T.semanaCorte("2026-11-20").fin, "2026-11-20");    // viernes: termina ese día
  const s = T.semanaCorte(hoy());
  assert.equal(T.diaSemana(s.inicio), 6); assert.equal(T.diaSemana(s.fin), 5);
  const ss = T.semanasRecientes(4);
  assert.equal(ss.length, 4); assert.equal(ss[1].fin, sumarDias(ss[0].inicio, -1));
  assert.match(s.etiqueta, /^S\d{2}$/);
});

test("conciliación: empareja por referencia y por monto/fecha, no duplica y deja partidas en tránsito y cargos por aclarar", () => {
  const d = nuevo("admin");
  const c = T.cuentaDeSucursal(d, "S1");
  const transito = T.partidasLibro(d, c.id, { desde: c.saldoFecha, hasta: hoy() }).filter((p) => !p.conciliada);
  assert.ok(transito.length >= 2, "debe haber partidas en tránsito sembradas");
  const quedan = transito[transito.length - 1];
  const filas = transito.slice(0, -1).map((p, i) => ({ fecha: p.fecha, descripcion: "MOVIMIENTO BANCO", referencia: i % 2 ? p.referencia : "", monto: p.monto }));
  filas.push({ fecha: hoy(), descripcion: "COMISION PRUEBA", referencia: "COM-T", monto: -99 });
  const im = X.importarEstadoCuenta(d, { cuentaId: c.id, archivo: "prueba.csv", filas });
  assert.ok(im.ok, im.error); assert.equal(im.importacion.filas, filas.length);
  assert.equal(X.importarEstadoCuenta(d, { cuentaId: c.id, filas }).importacion.duplicados, filas.length, "reimportar no duplica");
  const r = X.conciliarAuto(d, { cuentaId: c.id });
  assert.ok(r.ok);
  assert.ok(r.resultado.conciliados + r.resultado.ambiguos >= filas.length - 1, JSON.stringify(r.resultado));
  assert.ok(r.resultado.porReferencia > 0);
  const despues = T.partidasLibro(d, c.id, { desde: c.saldoFecha, hasta: hoy() });
  assert.ok(despues.some((p) => p.key === quedan.key && !p.conciliada), "la partida que el banco no trae sigue en tránsito");
  const usadas = d.tes.movimientos.flatMap((m) => (m.vinculos || []).map((v) => v.key));
  assert.equal(new Set(usadas).size, usadas.length, "una partida nunca se usa dos veces");
  const com = d.tes.movimientos.find((m) => m.referencia === "COM-T");
  assert.equal(com.estado, "detectado");
  const cl = X.clasificarMovimiento(d, { movId: com.id, estado: "es_gasto", nota: "Comisión bancaria", gasto: { categoria: "otros", concepto: "Comisión bancaria" } });
  assert.ok(cl.ok, cl.error); assert.equal(cl.gasto.monto, 99);
  const rc = T.resumenConciliacion(d, c.id, mesActual());
  assert.ok(rc.transitoAbonos.length + rc.transitoCargos.length >= 1);
  assert.ok(cerca(rc.saldoLibros, redondear(rc.saldoBanco + rc.totalTransitoAbonos - rc.totalTransitoCargos - rc.porAclarar)));
  // CSV: el ejemplo generado se lee y se mapea solo
  const csv = T.csvEjemplo(nuevo(), "CB2");
  const p = T.parsearCSV(csv); const mp = T.detectarMapeo(p.encabezados);
  const ap = T.aplicarMapeo(p, mp);
  assert.equal(ap.errores.length, 0); assert.ok(ap.filas.length >= 2);
  assert.equal(T.parsearMonto("(1,250.50)"), -1250.5); assert.equal(T.parsearFecha("31/12/2026"), "2026-12-31"); assert.equal(T.parsearFecha("31/02/2026"), null);
});

test("antigüedad de saldos: tramos, total = suma de cuentas y calendario de vencimientos", () => {
  const ref = "2026-11-21";
  assert.equal(T.tramoDe("2026-11-25", ref), "corriente"); assert.equal(T.tramoDe("2026-11-01", ref), "d30");
  assert.equal(T.tramoDe("2026-09-30", ref), "d60"); assert.equal(T.tramoDe("2026-08-30", ref), "d90"); assert.equal(T.tramoDe("2026-05-01", ref), "mas");
  const d = nuevo();
  const cxc = T.cuentasPorCobrar(d);
  const a = T.antiguedad(cxc);
  assert.ok(cerca(a.total, suma(cxc, (c) => c.saldo)) && cerca(a.total, a.corriente + a.vencido));
  assert.ok(a.mas > 0 && a.d60 > 0, "hay convenios con saldo vencido sembrados");
  assert.ok(cxc.some((c) => c.tipo === "convenio") && cxc.some((c) => c.tipo === "plazos" || c.tipo === "credito"));
  const cxp = T.cuentasPorPagar(d); assert.ok(cerca(T.antiguedad(cxp).total, suma(cxp, (c) => c.saldo)));
  const cal = T.calendarioVencimientos(d, { semanas: 4 });
  const totCal = suma(cal, (s) => s.cobrar + s.pagar);
  assert.ok(cerca(totCal, a.total + T.antiguedad(cxp).total, 0.05));
  // Cobro a convenio: baja el saldo y aparece como ingreso
  como(d, "admin");
  const doc = d.tes.cxc.find((c) => c.saldo > 1000);
  const r = X.registrarCobroConvenio(d, { cxcId: doc.id, monto: 1000, referencia: "SPEI-PRUEBA" });
  assert.ok(r.ok, r.error);
  assert.ok(T.ingresosDe(d, { desde: hoy(), hasta: hoy() }).some((f) => f.origen === "convenio" && f.referencia === "SPEI-PRUEBA"));
  assert.equal(X.registrarCobroConvenio(d, { cxcId: doc.id, monto: doc.saldo + 1, referencia: "X" }).ok, false);
});

test("fondo revolvente: gasto menor con comprobante, arqueo y reposición autorizada por Administración", () => {
  const d = nuevo("gerente", "S1");
  const f = T.fondoDe(d, "S1");
  const antes = T.estadoFondo(d, f.id);
  const nG = d.fin.gastos.length;
  assert.equal(X.gastoFondo(d, { sucursalId: "S1", categoria: "otros", concepto: "Agua", monto: 100 }).ok, false, "sin comprobante no");
  assert.equal(X.gastoFondo(d, { sucursalId: "S1", categoria: "otros", concepto: "Agua", monto: antes.saldo + 1, comprobanteFolio: "T1" }).ok, false, "no excede el saldo");
  assert.equal(X.gastoFondo(d, { sucursalId: "S2", categoria: "otros", concepto: "Agua", monto: 50, comprobanteFolio: "T1" }).ok, false, "otra sucursal no");
  const g = X.gastoFondo(d, { sucursalId: "S1", categoria: "otros", concepto: "Garrafones", monto: 150, comprobanteFolio: "Ticket 77" });
  assert.ok(g.ok, g.error);
  assert.equal(d.fin.gastos.length, nG + 1); assert.equal(g.gasto.fondoId, f.id);
  assert.ok(cerca(T.saldoFondo(d, f.id), antes.saldo - 150));
  // Arqueo: diferencia mayor a la tolerancia queda por revisar
  const ar = X.registrarArqueo(d, { fondoId: f.id, contado: T.saldoFondo(d, f.id) - 200, nota: "faltan" });
  assert.ok(ar.ok); assert.equal(ar.arqueo.estado, "por_revisar"); assert.equal(ar.arqueo.requiereRevision, true);
  assert.equal(T.arqueoFondo(1000, 1000).estado, "conforme"); assert.equal(T.arqueoFondo(1000, 980).estado, "diferencia_menor");
  // Reposición: la solicita el gerente; no la autoriza él; la autoriza Administración y el fondo vuelve a su base
  const sol = X.solicitarReposicion(d, { fondoId: f.id });
  assert.ok(sol.ok, sol.error); assert.ok(cerca(sol.reposicion.monto, f.montoBase - T.saldoFondo(d, f.id)));
  assert.equal(X.solicitarReposicion(d, { fondoId: f.id }).ok, false, "una a la vez");
  assert.equal(X.resolverReposicion(d, { reposicionId: sol.reposicion.id, autorizar: true, referencia: "R1" }).ok, false, "el gerente no autoriza");
  como(d, "admin");
  assert.equal(X.resolverReposicion(d, { reposicionId: sol.reposicion.id, autorizar: true }).ok, false, "exige referencia");
  assert.ok(X.resolverReposicion(d, { reposicionId: sol.reposicion.id, autorizar: true, referencia: "REP-PRUEBA" }).ok);
  assert.ok(cerca(T.saldoFondo(d, f.id), f.montoBase));
  assert.ok(T.partidasLibro(d, "CB0", { desde: hoy(), hasta: hoy() }).some((p) => p.tipo === "reposicion_fondo" && p.referencia === "REP-PRUEBA"), "la reposición se concilia en la concentradora");
  assert.ok(X.revisarArqueo(d, { arqueoId: ar.arqueo.id, aceptar: true, nota: "Faltante cubierto por la responsable" }).ok);
});

test("periodo cerrado es de solo lectura y solo Dirección lo reabre; cierre con lista de verificación", () => {
  const d = nuevo("gerente", "S1");
  const mesAnt = mesRelativo(mesActual(), -1);
  const fechaAnt = `${mesAnt}-15`;
  assert.equal(X.periodoCerrado(d, "S1", fechaAnt), true);
  assert.equal(X.periodoCerrado(d, "S1", hoy()), false);
  assert.equal(X.periodoCerrado(d, null, fechaAnt), false, "la cadena no está cerrada mientras S7 siga abierta");
  const g = X.gastoFondo(d, { sucursalId: "S1", fecha: fechaAnt, categoria: "otros", concepto: "x", monto: 10, comprobanteFolio: "T" });
  assert.equal(g.ok, false); assert.match(g.error, /cerrado/);
  assert.equal(X.registrarDeposito(d, { sucursalId: "S1", diaVenta: fechaAnt, fecha: hoy(), monto: 100 }).ok, false);
  assert.equal(X.reabrirPeriodo(d, { sucursalId: "S1", mes: mesAnt, motivo: "Ajuste de una factura tardía" }).ok, false, "el gerente no reabre");
  como(d, "admin");
  assert.equal(X.reabrirPeriodo(d, { sucursalId: "S1", mes: mesAnt, motivo: "Ajuste de una factura tardía" }).ok, false, "Administración no reabre");
  como(d, "direccion");
  assert.equal(X.reabrirPeriodo(d, { sucursalId: "S1", mes: mesAnt, motivo: "corto" }).ok, false, "exige motivo");
  assert.ok(X.reabrirPeriodo(d, { sucursalId: "S1", mes: mesAnt, motivo: "Ajuste de una factura tardía" }).ok);
  assert.equal(X.periodoCerrado(d, "S1", fechaAnt), false);
  assert.ok(d.bitacora.some((b) => b.accion === "periodo_reabierto"));
  // Cerrar S7 (pendiente): advertencias se aceptan expresamente; el mes en curso no se cierra
  como(d, "gerente", "S7");
  assert.equal(X.cerrarPeriodo(d, { sucursalId: "S7", mes: mesAnt, aceptarAdvertencias: true }).ok, false, "el gerente no cierra");
  como(d, "admin");
  const chk = T.checklistCierre(d, "S7", mesAnt);
  assert.ok(chk.find((x) => x.k === "terminado").ok);
  if (T.advertenciasChecklist(chk).length) assert.equal(X.cerrarPeriodo(d, { sucursalId: "S7", mes: mesAnt }).ok, false);
  const c = X.cerrarPeriodo(d, { sucursalId: "S7", mes: mesAnt, aceptarAdvertencias: true });
  assert.ok(c.ok, c.error); assert.ok(c.cierre.snapshot.ingresos > 0);
  assert.equal(X.periodoCerrado(d, "S7", fechaAnt), true);
  assert.equal(X.periodoCerrado(d, null, fechaAnt), d.sucursales.every((s) => X.periodoCerrado(d, s.id, fechaAnt)));
  assert.equal(X.cerrarPeriodo(d, { sucursalId: "S2", mes: mesActual(), aceptarAdvertencias: true }).ok, false, "el mes en curso no se cierra");
});

test("consolidado = suma de sucursales (resumen semanal y dashboard)", () => {
  const d = nuevo("admin");
  const ini = T.semanaCorte(sumarDias(hoy(), -7)).inicio;
  const r = T.resumenSemanaPorSucursal(d, ini);
  ["ingresos", "efectivo", "tarjeta", "transferencia", "gastos", "depositado", "neto"].forEach((k) => assert.ok(cerca(r.consolidado[k], suma(r.filas, (f) => f[k]), 0.05), k));
  const cad = T.resumenSemana(d, { inicio: ini });
  assert.ok(cerca(cad.ingresos.total, r.consolidado.ingresos, 0.05) && cad.ingresos.total > 0);
  const db = X.dashboardFinanciero(d, { mes: mesActual() });
  assert.ok(db.ok, db.error);
  assert.ok(cerca(db.totales.ingresos, suma(db.porSucursal, (s) => s.ingresos), 0.05));
  assert.ok(cerca(db.flujo.entradas, suma(db.porSucursal, (s) => s.cobrado), 0.05));
  assert.equal(db.kpis.metaOcupacion, 80);
  assert.equal(db.serie.length, 6);
  assert.ok(db.cxp && db.cartera.total > 0);
});

test("permisos: gerente solo su sucursal (dashboard, resumen, fondo); admin y dirección todo; otros roles nada", () => {
  const d = nuevo("gerente", "S1");
  assert.ok(X.dashboardFinanciero(d, { sucursalId: "S1" }).ok);
  assert.equal(X.dashboardFinanciero(d, { sucursalId: "S2" }).ok, false);
  assert.equal(X.dashboardFinanciero(d, { sucursalId: null }).ok, false, "el gerente no ve el consolidado");
  assert.ok(X.resumenSemanal(d, { sucursalId: "S1" }).ok);
  assert.equal(X.ingresos(d, { sucursalId: "S1" }).ok, false);
  assert.equal(X.conciliarAuto(d, { cuentaId: "CB1" }).ok, false);
  assert.equal(X.importarEstadoCuenta(d, { cuentaId: "CB1", filas: [{ fecha: hoy(), monto: 1 }] }).ok, false);
  const u = d.usuarios.find((x) => x.id === d.sesion.userId);
  assert.ok(X.puedeVer(u, "fondo", "S1") && !X.puedeVer(u, "cierres", "S1") && !X.puedeVer(u, "cuentas", "S1"));
  como(d, "cajero", "S1");
  assert.equal(X.dashboardFinanciero(d, { sucursalId: "S1" }).ok, false);
  assert.equal(X.gastoFondo(d, { sucursalId: "S1", categoria: "otros", concepto: "x", monto: 5, comprobanteFolio: "T" }).ok, false);
  como(d, "direccion");
  assert.ok(X.ingresos(d, {}).ok && X.dashboardFinanciero(d, {}).ok);
  const n = d.bitacora.length;
  assert.ok(X.registrarDeposito(d, { sucursalId: "S3", diaVenta: sumarDias(hoy(), -1), fecha: hoy(), monto: 500, referencia: "DEP-PRUEBA" }).ok);
  assert.equal(d.bitacora.length, n + 1, "toda acción audita");
  assert.equal(d.tes.depositos[d.tes.depositos.length - 1].registradoPor, d.sesion.userId);
});
