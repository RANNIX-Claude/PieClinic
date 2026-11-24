// Pruebas de la lógica de almacén (src/store/acciones_almacen.js). node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as R from "../src/store/reglas.js";
import * as A from "../src/store/acciones_almacen.js";
import { hoy, sumarDias } from "../src/lib/format.js";

const central = (d) => d.usuarios.find((u) => u.almacenCentral);
const deSuc = (d, s) => d.usuarios.find((u) => u.rol === "almacen" && !u.almacenCentral && u.sucursales[0] === s);

test("OC: recepción parcial crea capas, estado parcial y CxP; segunda recepción la completa", () => {
  const d = crearSeed(); const u = central(d);
  const o = d.oc.find((x) => x.estado === "enviada"); const p0 = o.partidas[0];
  const antes = R.stock(d, "CEN", p0.productoId), nCxp = d.cxp.length;
  const r = A.recibirOC(d, o.id, [{ productoId: p0.productoId, recibir: 5, lote: "X1", caducidad: "2027-01-01", costo: 11 }], { folio: "F-1", vence: sumarDias(hoy(), 30) }, u);
  assert.equal(r.ok, true);
  assert.equal(o.estado, "recibida_parcial");
  assert.equal(R.stock(d, "CEN", p0.productoId), antes + 5);
  assert.equal(d.cxp.length, nCxp + 1);
  assert.equal(d.cxp.at(-1).saldo, 55);
  assert.ok(r.diferencias.length >= 1, "faltante marcado como diferencia");
  const resto = o.partidas.map((p) => ({ productoId: p.productoId, recibir: p.cant - p.recibido, costo: p.costo }));
  const r2 = A.recibirOC(d, o.id, resto, { folio: "F-1", vence: sumarDias(hoy(), 30) }, u);
  assert.equal(r2.ok, true);
  assert.equal(o.estado, "recibida");
  assert.equal(d.cxp.length, nCxp + 1, "misma factura suma al saldo, no duplica");
});

test("OC: solo el almacén central; sin vencimiento no se acepta factura", () => {
  const d = crearSeed(); const o = d.oc.find((x) => x.estado === "enviada");
  const l = [{ productoId: o.partidas[0].productoId, recibir: 1, costo: 1 }];
  assert.equal(A.recibirOC(d, o.id, l, null, deSuc(d, "S1")).ok, false);
  assert.equal(A.recibirOC(d, o.id, l, { folio: "F" }, central(d)).ok, false);
});

test("devolución a proveedor: salida PEPS, nota de crédito y validaciones", () => {
  const d = crearSeed(); const u = central(d);
  const o = d.oc.find((x) => x.estado === "recibida"); const p = o.partidas[0];
  const st = R.stock(d, "CEN", p.productoId);
  assert.equal(A.devolverProveedor(d, { ocId: o.id, productoId: p.productoId, cant: 2, motivo: "" }, u).ok, false);
  const r = A.devolverProveedor(d, { ocId: o.id, productoId: p.productoId, cant: 2, motivo: "Defecto" }, u);
  assert.equal(r.ok, true);
  assert.equal(R.stock(d, "CEN", p.productoId), st - 2);
  assert.equal(d.devolucionesProveedor.length, 1);
  assert.equal(A.devolverProveedor(d, { ocId: o.id, productoId: p.productoId, cant: 999, motivo: "x" }, u).ok, false);
});

test("traspaso: solicitar, enviar por PEPS con costo, recibir con diferencia", () => {
  const d = crearSeed(); const dest = deSuc(d, "S3"), cen = central(d);
  const pid = d.productos[0].id;
  const t = A.crearTraspaso(d, { origenId: "CEN", destinoId: "S3", partidas: [{ productoId: pid, solicitado: 6 }] }, dest).traspaso;
  assert.equal(t.estado, "solicitado");
  assert.equal(A.enviarTraspaso(d, t.id, {}, dest, "S3").ok, false, "el destino no puede enviar");
  const sCen = R.stock(d, "CEN", pid), sS3 = R.stock(d, "S3", pid);
  assert.equal(A.enviarTraspaso(d, t.id, {}, cen, "CEN").ok, true);
  assert.equal(t.estado, "en_transito"); assert.ok(t.partidas[0].costo > 0);
  assert.equal(R.stock(d, "CEN", pid), sCen - 6);
  assert.equal(A.recibirTraspaso(d, t.id, { [pid]: 7 }, dest, "S3").ok, false, "no recibe más de lo enviado");
  const r = A.recibirTraspaso(d, t.id, { [pid]: 5 }, dest, "S3");
  assert.equal(r.estado, "recibido_con_diferencia");
  assert.equal(R.stock(d, "S3", pid), sS3 + 5);
  const capa = d.capas.filter((c) => c.almacenId === "S3" && c.productoId === pid).at(-1);
  assert.equal(capa.costo, t.partidas[0].costo, "entra con el costo con que salió");
  assert.ok(A.kardex(d, "S3", pid).some((m) => m.tipo === "entrada" && m.concepto.includes(t.folio)));
});

test("traspaso: sin existencia suficiente no envía ni deja cambios", () => {
  const d = crearSeed(); const pid = d.productos[0].id;
  const t = A.crearTraspaso(d, { origenId: "S1", destinoId: "S2", partidas: [{ productoId: pid, solicitado: 9999 }] }, deSuc(d, "S2")).traspaso;
  const s = R.stock(d, "S1", pid);
  assert.equal(A.enviarTraspaso(d, t.id, {}, deSuc(d, "S1"), "S1").ok, false);
  assert.equal(R.stock(d, "S1", pid), s); assert.equal(t.estado, "solicitado");
});

test("inventario: conteo a ciegas, segundo conteo solo de diferencias, ajuste por autorización", () => {
  const d = crearSeed(); const u = deSuc(d, "S2");
  d.inventarios = [];
  const inv = A.iniciarInventario(d, { almacenId: "S2", tipo: "ciclico", categoria: "Bastones" }, u).inventario;
  assert.equal(inv.partidas.length, d.productos.filter((p) => p.categoria === "Bastones").length);
  assert.equal(A.iniciarInventario(d, { almacenId: "S2", tipo: "general" }, u).ok, false, "solo uno abierto");
  const [a, b, ...resto] = inv.partidas;
  A.capturarConteo(d, inv.id, a.productoId, a.sistema, u);
  A.capturarConteo(d, inv.id, b.productoId, b.sistema + 2, u);
  resto.forEach((x) => A.capturarConteo(d, inv.id, x.productoId, x.sistema, u));
  assert.equal(A.terminarConteo(d, inv.id, u).diferencias, 1);
  assert.equal(inv.estado, "segundo_conteo");
  assert.equal(A.capturarConteo(d, inv.id, a.productoId, 1, u).ok, false, "el conforme no se recuenta");
  A.capturarConteo(d, inv.id, b.productoId, b.sistema - 2, u);
  assert.equal(A.terminarConteo(d, inv.id, u).estado, "comparativo");
  const f = A.comparativo(d, inv).find((x) => x.productoId === b.productoId);
  assert.equal(f.dif, -2); assert.ok(f.valor < 0);
  assert.equal(A.cerrarInventario(d, inv.id, u).ok, false, "falta proponer ajuste");
  const r = A.proponerAjusteInv(d, inv.id, b.productoId, "merma", u);
  assert.equal(r.autorizacion.tipo, "ajuste_inventario");
  assert.equal(r.autorizacion.ref.cant, -2);
  assert.equal(A.cerrarInventario(d, inv.id, u).ok, true);
});

test("conteo sin señal encola la operación; el general congela movimientos", () => {
  const d = crearSeed(); const u = deSuc(d, "S2"); d.inventarios = []; d.sinSenal = true; d.sesion = { userId: u.id, sucursalId: "S2" };
  const inv = A.iniciarInventario(d, { almacenId: "S2", tipo: "general" }, u).inventario;
  assert.equal(inv.congelado, true);
  A.capturarConteo(d, inv.id, inv.partidas[0].productoId, 3, u);
  assert.equal(d.cola.length, 1);
  const t = d.traspasos.find((x) => x.estado === "en_transito" && x.destinoId === "S2");
  if (t) assert.equal(A.recibirTraspaso(d, t.id, {}, u, "S2").ok, false);
});

test("ajuste manual: motivo obligatorio, valida existencia y asigna nivel", () => {
  const d = crearSeed(); const u = deSuc(d, "S4"); const p = d.productos.find((x) => x.sku === "AND-001");
  assert.equal(A.solicitarAjuste(d, { almacenId: "S4", productoId: p.id, cant: -1, motivo: "" }, u).ok, false);
  assert.equal(A.solicitarAjuste(d, { almacenId: "S4", productoId: p.id, cant: -9999, motivo: "robo" }, u).ok, false);
  const r = A.solicitarAjuste(d, { almacenId: "S4", productoId: p.id, cant: 1, motivo: "merma" }, u);
  assert.equal(r.ok, true); assert.ok(["gerente", "admin"].includes(r.autorizacion.nivel));
});

test("laboratorio: calidad no ok → retrabajo y vuelve a enviada; entrega exige firma", () => {
  const d = crearSeed(); const o = d.ordenesLab.find((x) => x.estado === "enviada"); const u = deSuc(d, o.sucursalId);
  const nueva = sumarDias(hoy(), 5);
  assert.equal(A.recibirDeLaboratorio(d, o.id, { ok: false, motivo: "", prometida: nueva }, u, o.sucursalId).ok, false);
  A.recibirDeLaboratorio(d, o.id, { ok: false, motivo: "Talla errónea", prometida: nueva }, u, o.sucursalId);
  assert.equal(o.estado, "enviada"); assert.equal(o.prometida, nueva); assert.equal(o.retrabajos.length, 1);
  A.recibirDeLaboratorio(d, o.id, { ok: true }, u, o.sucursalId); assert.equal(o.estado, "recibida");
  assert.equal(A.entregarOrdenLab(d, o.id, {}, u, o.sucursalId).ok, false);
  assert.equal(A.entregarOrdenLab(d, o.id, { firma: "data:x" }, u, o.sucursalId).ok, true);
  assert.equal(o.estado, "entregada"); assert.equal(o.entregada, hoy());
});
