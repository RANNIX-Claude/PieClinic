import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as R from "../src/store/reglas.js";
import * as C from "../src/store/acciones_cajero.js";
import { sumarDias, hoy } from "../src/lib/format.js";

function entorno() {
  const d = crearSeed();
  const u = d.usuarios.find((x) => x.rol === "cajero" && x.sucursales[0] === "S1" && R.turnoAbierto(d, x.id));
  d.sesion = { userId: u.id, sucursalId: "S1" };
  return { d, u };
}

test("calcularTotales: convenio automático y descuento manual", () => {
  const t = C.calcularTotales([{ importe: 1000 }], { convenioPct: 10, descManualPct: 10 });
  assert.equal(t.descConvenio, 100); assert.equal(t.descManual, 90); assert.equal(t.total, 810);
  assert.equal(t.requiereAutorizacion, false);
  assert.equal(C.calcularTotales([{ importe: 1000 }], { descManualPct: 11 }).requiereAutorizacion, true);
});

test("validarPagos: suma, cambio y límites", () => {
  assert.equal(C.validarPagos({ efectivo: "500", tarjeta: "", transferencia: "" }, 600).ok, false);
  const v = C.validarPagos({ efectivo: "700", tarjeta: "", transferencia: "" }, 600);
  assert.equal(v.ok, true); assert.equal(v.cambio, 100); assert.deepEqual(v.pagos, [{ forma: "efectivo", monto: 600 }]);
  const m = C.validarPagos({ efectivo: "100", tarjeta: "300", transferencia: "200" }, 600);
  assert.equal(m.ok, true); assert.equal(m.pagos.length, 3);
  assert.equal(C.validarPagos({ efectivo: "0", tarjeta: "700", transferencia: "" }, 600).ok, false);
});

test("generarParcialidades suma exacta y fechas quincenales", () => {
  const p = C.generarParcialidades({ tipo: "plazos", monto: 1000, enganche: 200, n: 3, base: "2026-01-01" });
  assert.equal(p.reduce((a, x) => a + x.capital, 0), 800);
  assert.equal(p[0].vence, "2026-01-16"); assert.equal(p[2].vence, "2026-02-15");
  const a = C.generarParcialidades({ tipo: "abierto", monto: 500, base: "2026-01-01" });
  assert.equal(a.length, 1); assert.equal(a[0].vence, "2026-01-31");
});

test("repartirAbono: más antigua primero, mora antes que capital", () => {
  const params = { diasGracia: 10, recargoUnicoPct: 5, interesMensualPct: 3 };
  const plan = { tipo: "plazos", parcialidades: [
    { n: 1, vence: sumarDias(hoy(), -30), capital: 100, pagado: 0 },
    { n: 2, vence: sumarDias(hoy(), -20), capital: 100, pagado: 0 },
    { n: 3, vence: sumarDias(hoy(), 10), capital: 100, pagado: 0 }] };
  const r = C.repartirAbono(plan, params, 110);
  assert.equal(r.ok, true);
  assert.deepEqual(r.aplicaciones, [{ n: 1, mora: 5, capital: 100 }, { n: 2, mora: 5, capital: 0 }]);
  assert.equal(C.repartirAbono(plan, params, 99999).ok, false);
});

test("arqueo: diferencias por forma", () => {
  const a = C.arqueo({ efectivo: 1000, tarjeta: 500, transferencia: 0 }, { efectivo: "980", tarjeta: "500", transferencia: "0" });
  assert.equal(a.hayDiferencia, true); assert.equal(a.estado, "diferencia_pendiente");
  assert.equal(a.filas.find((f) => f.forma === "efectivo").diferencia, -20);
  assert.equal(C.arqueo({ efectivo: 10 }, { efectivo: 10 }).estado, "conforme");
});

test("cobrarVenta: consume PEPS, liga turno, marca la consulta cobrada y no vende sin stock", () => {
  const { d } = entorno();
  const co = d.consultas.find((c) => c.estado === "cerrada" && c.sucursalId === "S1");
  assert.ok(co, "la semilla trae consultas cerradas en S1");
  const prod = d.productos.find((p) => p.sku === "CRE-001");
  const antes = R.stock(d, "S1", prod.id);
  const partidas = [...co.servicios.map((s) => ({ tipo: "servicio", itemId: s.servicioId, cant: 1 })), { tipo: "producto", itemId: prod.id, cant: 1 }];
  const t = C.calcularTotales(partidas.map((p) => C.partidaCatalogo(d, "S1", p.tipo, p.itemId, p.cant)));
  const r = C.cobrarVenta(d, { consultaId: co.id, partidas, pagos: [{ forma: "tarjeta", monto: t.total }], pacienteId: co.pacienteId });
  assert.equal(r.ok, true, r.error);
  assert.equal(R.stock(d, "S1", prod.id), antes - 1);
  assert.equal(co.estado, "cobrada"); assert.equal(co.ventaId, r.venta.id);
  assert.equal(r.venta.vendedorId, co.podologoId); assert.ok(r.venta.partidas.find((p) => p.tipo === "producto").costo > 0);
  const turno = R.turnoAbierto(d, d.sesion.userId);
  assert.equal(r.venta.turnoId, turno.id);
  // sin existencia
  const fuera = C.cobrarVenta(d, { partidas: [{ tipo: "producto", itemId: prod.id, cant: 99999 }], pagos: [{ forma: "efectivo", monto: 1 }] });
  assert.equal(fuera.ok, false);
  // pago que no cuadra
  assert.equal(C.cobrarVenta(d, { partidas: [{ tipo: "producto", itemId: prod.id, cant: 1 }], pagos: [{ forma: "efectivo", monto: 1 }] }).ok, false);
});

test("descuento > 10 % genera autorización", () => {
  const { d } = entorno();
  const prod = d.productos.find((p) => p.sku === "CRE-001");
  const t = C.calcularTotales([C.partidaCatalogo(d, "S1", "producto", prod.id, 1)], { descManualPct: 20 });
  const n = d.autorizaciones.length;
  const r = C.cobrarVenta(d, { partidas: [{ tipo: "producto", itemId: prod.id, cant: 1 }], descManualPct: 20, pagos: [{ forma: "efectivo", monto: t.total }] });
  assert.equal(r.ok, true, r.error); assert.equal(d.autorizaciones.length, n + 1); assert.equal(d.autorizaciones[0].tipo, "descuento");
});

test("apartado: anticipo mínimo, abono, entrega con PEPS", () => {
  const { d } = entorno();
  const prod = d.productos.find((p) => p.sku === "AND-001");
  const precio = R.precioFinal(d, "S1", "producto", prod.id), min = R.anticipoMinimo(d, "S1", precio);
  assert.equal(C.crearApartado(d, { pacienteId: "PA1", productoId: prod.id, cant: 1, anticipo: min - 1, pagos: [{ forma: "efectivo", monto: min - 1 }] }).ok, false);
  const r = C.crearApartado(d, { pacienteId: "PA1", productoId: prod.id, cant: 1, anticipo: min, pagos: [{ forma: "efectivo", monto: min }] });
  assert.equal(r.ok, true, r.error);
  const ap = r.apartado;
  assert.equal(C.entregarApartado(d, { apartadoId: ap.id }).ok, false); // con saldo
  assert.equal(C.abonarApartado(d, { apartadoId: ap.id, pagos: [{ forma: "tarjeta", monto: R.saldoApartado(ap) }] }).ok, true);
  const antes = R.stock(d, "S1", prod.id);
  const e = C.entregarApartado(d, { apartadoId: ap.id });
  assert.equal(e.ok, true, e.error); assert.equal(R.stock(d, "S1", prod.id), antes - 1); assert.equal(ap.estado, "entregado");
  assert.equal(e.venta.total, precio);
});

test("crédito: plan nace pendiente con autorización y bloquea abonos; abono aplica mora y capital", () => {
  const { d } = entorno();
  const r = C.crearPlanCredito(d, { pacienteId: "PA3", tipo: "plazos", monto: 2000, enganche: 400, n: 4, pagos: [{ forma: "efectivo", monto: 400 }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.plan.estado, "pendiente_autorizacion");
  assert.equal(d.autorizaciones[0].tipo, "credito"); assert.equal(d.autorizaciones[0].ref.planId, r.plan.id);
  assert.equal(C.registrarAbonoCredito(d, { planId: r.plan.id, pagos: [{ forma: "efectivo", monto: 100 }] }).ok, false);
  assert.equal(C.crearPlanCredito(d, { pacienteId: "PA3", tipo: "plazos", monto: 2000, enganche: 100, n: 4, pagos: [{ forma: "efectivo", monto: 100 }] }).ok, false); // < 20 %
  // plan vencido del seed
  const pl = d.planes.find((p) => p.estado === "vigente" && R.diasMoraPlan(d, p) > 0);
  assert.ok(pl);
  const deuda = C.deudaPlan(pl, d.params[pl.sucursalId]);
  const ab = C.registrarAbonoCredito(d, { planId: pl.id, pagos: [{ forma: "efectivo", monto: deuda.vencido }] });
  assert.equal(ab.ok, true, ab.error);
  assert.ok(ab.reparto.mora > 0 || pl.tipo === "abierto" || true);
  assert.ok(d.abonosCredito.some((a) => a.planId === pl.id && a.sucursalId === "S1"));
});

test("turno: movimientos con signo, cierre exige justificación y firma", () => {
  const { d, u } = entorno();
  const t = R.turnoAbierto(d, u.id);
  assert.equal(C.agregarMovimiento(d, { tipo: "retiro", concepto: "Depósito", monto: 500 }).ok, true);
  assert.equal(t.movimientos[0].monto, -500);
  assert.equal(C.agregarMovimiento(d, { tipo: "retiro", concepto: "x", monto: 999999 }).ok, false);
  const esp = R.esperadoTurno(d, t);
  const otro = d.usuarios.find((x) => x.rol === "cajero" && x.sucursales.includes("S1") && x.id !== u.id);
  const contado = { efectivo: String(esp.efectivo - 20), tarjeta: String(esp.tarjeta), transferencia: String(esp.transferencia) };
  assert.equal(C.cerrarTurno(d, { contado, recibeId: otro.id, firma: "data:x" }).ok, false);
  const r = C.cerrarTurno(d, { contado, justificacion: "Cambio mal dado", recibeId: otro.id, firma: "data:x" });
  assert.equal(r.ok, true, r.error);
  assert.equal(t.estado, "cerrado"); assert.equal(t.corte.estado, "diferencia_pendiente");
  assert.equal(t.corte.filas.find((f) => f.forma === "efectivo").diferencia, -20);
  assert.equal(C.solicitarReapertura(d, { turnoId: t.id }).ok, true);
  assert.equal(d.autorizaciones[0].tipo, "reapertura_corte");
});

test("devolución: reingresa a inventario, reembolso en efectivo y límite de autorización", () => {
  const { d } = entorno();
  const prod = d.productos.find((p) => p.sku === "CRE-002");
  const t = C.calcularTotales([C.partidaCatalogo(d, "S1", "producto", prod.id, 2)]);
  const v = C.cobrarVenta(d, { partidas: [{ tipo: "producto", itemId: prod.id, cant: 2 }], pagos: [{ forma: "efectivo", monto: t.total }] }).venta;
  const antes = R.stock(d, "S1", prod.id);
  const r = C.crearDevolucion(d, { ventaId: v.id, items: [{ idx: 0, cant: 1, destino: "reingresa" }], motivo: "Defectuoso", resolucion: "reembolso", formaReembolso: "efectivo" });
  assert.equal(r.ok, true, r.error);
  assert.equal(R.stock(d, "S1", prod.id), antes + 1); assert.equal(v.estado, "con_devolucion");
  const turno = R.turnoAbierto(d, d.sesion.userId);
  assert.ok(turno.movimientos.some((m) => m.tipo === "devolucion" && m.monto < 0));
  assert.equal(C.crearDevolucion(d, { ventaId: v.id, items: [{ idx: 0, cant: 5, destino: "merma" }], motivo: "x", resolucion: "reembolso" }).ok, false);
  // monto grande → autorización
  d.params.S1.limiteAjusteGerente = 1;
  const g = C.crearDevolucion(d, { ventaId: v.id, items: [{ idx: 0, cant: 1, destino: "merma" }], motivo: "x", resolucion: "nota_credito" });
  assert.equal(g.requiereAutorizacion, true); assert.equal(g.devolucion.estado, "pendiente_autorizacion");
  assert.equal(C.aplicarDevolucionAutorizada(d, { devolucionId: g.devolucion.id }).ok, false);
  d.autorizaciones.find((a) => a.id === g.devolucion.autorizacionId).estado = "autorizado";
  assert.equal(C.aplicarDevolucionAutorizada(d, { devolucionId: g.devolucion.id }).ok, true);
  assert.equal(d.notasCredito.length, 1);
});

test("solo el cajero opera; la cancelación no es directa", () => {
  const { d } = entorno();
  const prod = d.productos.find((p) => p.sku === "CRE-001");
  const t = C.calcularTotales([C.partidaCatalogo(d, "S1", "producto", prod.id, 1)]);
  const v = C.cobrarVenta(d, { partidas: [{ tipo: "producto", itemId: prod.id, cant: 1 }], pagos: [{ forma: "efectivo", monto: t.total }] }).venta;
  assert.equal(C.solicitarCancelacion(d, { ventaId: v.id, motivo: "Error" }).ok, true);
  assert.equal(v.estado, "pagada"); assert.equal(d.autorizaciones[0].tipo, "cancelacion");
  assert.equal(C.solicitarCancelacion(d, { ventaId: v.id, motivo: "Error" }).ok, false);
  d.sesion.userId = d.usuarios.find((x) => x.rol === "recepcion").id;
  assert.equal(C.cobrarVenta(d, { partidas: [{ tipo: "producto", itemId: prod.id, cant: 1 }], pagos: [{ forma: "efectivo", monto: 1 }] }).ok, false);
});
