// Autorizaciones de punta a punta y entrada del almacén central. node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { getState, mutar, entrar } from "../src/store/core.js";
import { resolverAutorizacion } from "../src/store/acciones.js";
import { crearSeed } from "../src/store/seed.js";

const LISTAS = { credito: ["planId", "planes"], prorroga: ["apartadoId", "apartados"], reapertura_corte: ["turnoId", "turnos"], ajuste_inventario: ["productoId", "productos"] };

test("semilla: cada autorización pendiente apunta a un registro real de su misma sucursal", () => {
  const d = crearSeed();
  const pendientes = d.autorizaciones.filter((a) => a.estado === "pendiente" && LISTAS[a.tipo]);
  assert.ok(pendientes.length >= 5);
  for (const a of pendientes) {
    const [campo, lista] = LISTAS[a.tipo];
    assert.ok(a.ref, `${a.id} (${a.tipo}) sin ref`);
    const x = d[lista].find((e) => e.id === a.ref[campo]);
    assert.ok(x, `${a.id}: el registro ${a.ref[campo]} no existe`);
    if (x.sucursalId) assert.equal(x.sucursalId, a.sucursalId, `${a.id}: registro de otra sucursal`);
    const sol = d.usuarios.find((u) => u.id === a.solicitanteId);
    assert.ok(sol.sucursales.includes(a.sucursalId), `${a.id}: solicitante de otra sucursal`);
  }
});

const entrarComo = (rol, sucursalId) => {
  const d = getState();
  const u = d.usuarios.find((x) => x.rol === rol && (!sucursalId || x.sucursales.includes(sucursalId)));
  entrar(u.id, sucursalId);
  return u;
};

test("autorizar una prórroga extiende de verdad el vencimiento del apartado", () => {
  mutar((d) => Object.assign(d, crearSeed()));
  const a = getState().autorizaciones.find((x) => x.tipo === "prorroga" && x.estado === "pendiente");
  entrarComo("gerente", a.sucursalId);
  const antes = getState().apartados.find((x) => x.id === a.ref.apartadoId).vence;
  assert.equal(resolverAutorizacion(a.id, "autorizar").ok, true);
  const ap = getState().apartados.find((x) => x.id === a.ref.apartadoId);
  assert.notEqual(ap.vence, antes);
  assert.equal(ap.prorrogas.length, 1);
  assert.equal(getState().autorizaciones.find((x) => x.id === a.id).estado, "autorizado");
});

test("autorizar un crédito pasa su plan a vigente; rechazarlo lo cancela", () => {
  mutar((d) => Object.assign(d, crearSeed()));
  const cr = getState().autorizaciones.filter((x) => x.tipo === "credito" && x.estado === "pendiente" && x.nivel === "gerente");
  assert.ok(cr.length >= 1);
  const a = cr[0];
  entrarComo("gerente", a.sucursalId);
  assert.equal(getState().planes.find((p) => p.id === a.ref.planId).estado, "pendiente_autorizacion");
  assert.equal(resolverAutorizacion(a.id, "autorizar").ok, true);
  assert.equal(getState().planes.find((p) => p.id === a.ref.planId).estado, "vigente");
});

test("no se puede autorizar sin su registro asociado: queda pendiente y avisa", () => {
  mutar((d) => Object.assign(d, crearSeed()));
  const a = getState().autorizaciones.find((x) => x.tipo === "prorroga" && x.estado === "pendiente");
  entrarComo("gerente", a.sucursalId);
  mutar((d) => { d.autorizaciones.find((x) => x.id === a.id).ref = null; });
  const r = resolverAutorizacion(a.id, "autorizar");
  assert.equal(r.ok, false);
  assert.match(r.error, /registro asociado/);
  assert.equal(getState().autorizaciones.find((x) => x.id === a.id).estado, "pendiente");
  assert.equal(resolverAutorizacion(a.id, "rechazar", "dato inválido").ok, true); // rechazar sí se permite
});

test("el almacén central entra directo a CEN (ahí están las órdenes de compra por recibir)", () => {
  mutar((d) => Object.assign(d, crearSeed()));
  const u = getState().usuarios.find((x) => x.rol === "almacen" && x.almacenCentral);
  entrar(u.id);
  assert.equal(getState().sesion.sucursalId, "CEN");
  const o = getState().usuarios.find((x) => x.rol === "almacen" && !x.almacenCentral);
  entrar(o.id);
  assert.equal(getState().sesion.sucursalId, o.sucursales[0]);
});
