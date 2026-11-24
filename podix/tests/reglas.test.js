// Pruebas de las reglas de negocio del núcleo (src/store/reglas.js). Corren con: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as R from "../src/store/reglas.js";
import { sumarDias, hoy } from "../src/lib/format.js";

const d0 = () => crearSeed();

test("precio final = base × (1 + ajuste de la sucursal), a centavos", () => {
  const d = d0();
  const sv = d.servicios[1]; // Quiropodia 450
  assert.equal(R.precioFinal(d, "S1", "servicio", sv.id), 450);        // Centro 0 %
  assert.equal(R.precioFinal(d, "S3", "servicio", sv.id), 436.5);      // Sur −3 %
  assert.equal(R.precioFinal(d, "S2", "servicio", sv.id), 459);        // Norte: ajuste específico +2 %
});

test("PEPS consume primero la capa más antigua y regresa el costo real", () => {
  const d = d0();
  const p = d.productos[0].id;
  d.capas = [
    { id: "a", almacenId: "S1", productoId: p, fecha: "2026-01-01", cant: 3, costo: 10 },
    { id: "b", almacenId: "S1", productoId: p, fecha: "2026-02-01", cant: 5, costo: 20 },
  ];
  const r = R.salidaPEPS(d, "S1", p, 4);
  assert.equal(r.ok, true);
  assert.equal(r.costo, 3 * 10 + 1 * 20);
  assert.equal(R.stock(d, "S1", p), 4);
  assert.equal(R.salidaPEPS(d, "S1", p, 99).ok, false);
  assert.equal(R.stock(d, "S1", p), 4, "si no alcanza, no consume nada");
});

test("apartado: vigente, por vencer y vencido según la fecha", () => {
  const ap = { estado: "activo", vence: sumarDias(hoy(), 5) };
  assert.equal(R.estadoApartado(ap), "vigente");
  assert.equal(R.estadoApartado({ ...ap, vence: sumarDias(hoy(), 1) }), "por_vencer");
  assert.equal(R.estadoApartado({ ...ap, vence: sumarDias(hoy(), -1) }), "vencido");
  assert.equal(R.estadoApartado({ ...ap, estado: "entregado" }), "entregado");
});

test("anticipo mínimo = 20 % del precio por defecto", () => {
  assert.equal(R.anticipoMinimo(d0(), "S1", 1800), 360);
});

test("mora: 10 días de gracia; recargo único en plazos; interés mensual en crédito abierto", () => {
  const d = d0();
  const par = d.params.S1;
  const p = { n: 1, vence: sumarDias(hoy(), -5), capital: 1000, pagado: 0 };
  assert.equal(R.estadoParcialidad(p, par), "en_gracia");
  const venc = { ...p, vence: sumarDias(hoy(), -20) };
  assert.equal(R.estadoParcialidad(venc, par), "vencida");
  assert.deepEqual(R.moraParcialidad({ tipo: "plazos" }, venc, par), { interes: 0, recargo: 50 });
  assert.deepEqual(R.moraParcialidad({ tipo: "abierto" }, venc, par), { interes: 30, recargo: 0 });
  assert.deepEqual(R.moraParcialidad({ tipo: "plazos" }, p, par), { interes: 0, recargo: 0 });
  assert.equal(R.estadoParcialidad({ ...venc, pagado: 1000 }, par), "pagada");
});

test("niveles de autorización por monto", () => {
  const d = d0();
  assert.equal(R.nivelCredito(d, "S1", 1500), "gerente");
  assert.equal(R.nivelCredito(d, "S1", 4500), "admin");
  assert.equal(R.nivelCredito(d, "S1", 12000), "direccion");
  assert.equal(R.nivelAjuste(d, "S1", -210), "gerente");
  assert.equal(R.nivelAjuste(d, "S1", 570), "admin");
});

test("un gerente solo resuelve su nivel y su sucursal; admin resuelve gerente y admin", () => {
  const d = d0();
  const g = d.usuarios.find((u) => u.rol === "gerente" && u.sucursales[0] === "S1");
  const adm = d.usuarios.find((u) => u.rol === "admin");
  assert.equal(R.puedeResolver(g, { nivel: "gerente", sucursalId: "S1" }), true);
  assert.equal(R.puedeResolver(g, { nivel: "gerente", sucursalId: "S2" }), false);
  assert.equal(R.puedeResolver(g, { nivel: "admin", sucursalId: "S1" }), false);
  assert.equal(R.puedeResolver(adm, { nivel: "admin", sucursalId: "S4" }), true);
  assert.equal(R.puedeResolver(adm, { nivel: "direccion", sucursalId: "S4" }), false);
});

test("semilla: coherente y sin empalmes de agenda", () => {
  const d = d0();
  assert.equal(d.sucursales.length, 7);
  const k = new Set();
  for (const c of d.citas) {
    const clave = `${c.sucursalId}|${c.inicio}|${c.consultorioId}`;
    assert.ok(!k.has(clave), "empalme de consultorio " + clave);
    k.add(clave);
  }
  assert.ok(d.consultas.some((c) => c.estado === "cerrada"), "hay consultas por cobrar para la demo");
});
