import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as F from "../src/store/acciones_finanzas.js";
import * as R from "../src/store/reglas.js";
import { hoy } from "../src/lib/format.js";

const nuevo = (rol = "admin", sucursalId = "S1") => {
  const d = crearSeed();
  const u = d.usuarios.find((x) => x.rol === rol && (!sucursalId || rol !== "gerente" || x.sucursales.includes(sucursalId)) && !(rol === "almacen" && x.almacenCentral));
  d.sesion = { userId: u.id, sucursalId: rol === "almacen" ? u.sucursales[0] : sucursalId };
  return d;
};
const cerrados = (d) => F.mesesDisponibles().slice(1);
const cerca = (a, b, t = 0.011) => Math.abs(a - b) <= t;

test("semilla: gastos de 12 meses + el actual por sucursal y categoría", () => {
  const d = crearSeed();
  assert.ok(d.fin.gastos.length > 500);
  for (const s of d.sucursales) for (const mes of F.mesesDisponibles()) {
    const g = d.fin.gastos.filter((x) => x.sucursalId === s.id && x.fecha.startsWith(mes));
    assert.ok(g.length >= 3, `${s.id} ${mes}`);
    assert.ok(g.every((x) => x.registradoPor && x.sucursalId && x.monto > 0));
  }
  ["renta", "luz", "agua", "internet", "limpieza", "mantenimiento", "publicidad", "papeleria", "otros"].forEach((c) => assert.ok(d.fin.categorias.some((x) => x.id === c)));
  assert.ok(d.fin.recurrentes.length >= 7 * 5 && d.fin.notasCompra.length > 0);
});

test("margen operativo de meses cerrados: rango verosímil, escenario de caída de la demo (S3 en pérdida) y mejor/peor sucursal", () => {
  // Escenario de la junta de dueños (dominios/pie_clinic.js, CAIDA): las ventas bajan en los últimos 4 meses con gastos fijos,
  // así que el margen cae y Pabellón (S3) llega a pérdida; las sucursales estables siguen entre 12 % y 24 %.
  const d = crearSeed();
  const mg = (s, mes) => F.estadoResultados(d, { mes, sucursalId: s }).totales.margen;
  for (const s of d.sucursales) for (const mes of cerrados(d)) {
    const m = mg(s.id, mes);
    assert.ok(m >= -0.3 && m <= 0.25, `${s.id} ${mes}: ${(m * 100).toFixed(1)} %`);
  }
  for (const s of ["S4", "S6", "S7"]) for (const mes of cerrados(d)) assert.ok(mg(s, mes) >= 0.12, `${s} ${mes} estable`);
  assert.ok(mg("S3", cerrados(d)[0]) < 0, "S3 en pérdida el último mes cerrado");
  const r = F.resumenSucursales(d, cerrados(d)[0]);
  assert.ok(r.mejor.margen > r.peor.margen + 0.03);
  assert.equal(r.ranking.length, 7);
  assert.equal(r.ranking[0].sucursalId, r.mejor.sucursalId);
});

test("consolidado = suma de las 7 sucursales en cada fila, detalle y total", () => {
  const d = crearSeed();
  for (const mes of [cerrados(d)[2], F.mesActual()]) {
    const cad = F.estadoResultados(d, { mes, sucursalId: null });
    const por = d.sucursales.map((s) => F.estadoResultados(d, { mes, sucursalId: s.id }));
    cad.bandas.forEach((b, i) => {
      const monto = (e) => (b.resultado ? e.bandas[i].monto : e.bandas[i].total.monto);
      assert.ok(cerca(monto(cad), por.reduce((a, e) => a + monto(e), 0)), `${mes} ${b.id}`);
      (b.filas || []).forEach((f, j) => {
        assert.ok(cerca(f.monto, por.reduce((a, e) => a + e.bandas[i].filas[j].monto, 0)), `${mes} ${f.id}`);
        if (f.detalle) assert.ok(cerca(f.detalle.reduce((a, x) => a + x.monto, 0), f.monto, 0.05), `detalle de ${f.id} suma la fila`);
      });
    });
  }
});

test("utilidad = ingresos − costos − gastos y las bandas cuadran", () => {
  const d = crearSeed();
  for (const mes of [cerrados(d)[0], cerrados(d)[7], F.mesActual()]) {
    const e = F.estadoResultados(d, { mes, sucursalId: "S3" });
    const [ing, vari, bruta, op, oper] = e.bandas;
    assert.ok(cerca(ing.total.monto, ing.filas.reduce((a, f) => a + f.monto, 0), 0.02));
    assert.ok(cerca(vari.total.monto, vari.filas.reduce((a, f) => a + f.monto, 0), 0.02));
    assert.ok(cerca(bruta.monto, ing.total.monto - vari.total.monto));
    assert.ok(cerca(op.total.monto, op.filas.reduce((a, f) => a + f.monto, 0), 0.02));
    assert.ok(cerca(oper.monto, ing.total.monto - vari.total.monto - op.total.monto));
    assert.ok(cerca(e.totales.margen, oper.monto / ing.total.monto, 1e-6));
  }
});

test("mes cerrado sale de d.hist y el mes en curso de las ventas reales", () => {
  const d = crearSeed();
  const mes = cerrados(d)[1];
  const h = d.hist.find((x) => x.sucursalId === "S2" && x.mes === mes);
  const e = F.estadoResultados(d, { mes, sucursalId: "S2" });
  assert.equal(e.bandas[0].filas[0].monto, h.servicios);
  assert.equal(e.bandas[0].filas[1].monto, h.plantillas);
  assert.equal(e.bandas[0].filas[2].monto, h.productos);
  assert.equal(e.bandas[1].filas[0].monto, h.costo);
  assert.equal(e.parcial, false);
  const actual = F.estadoResultados(d, { mes: F.mesActual(), sucursalId: "S1" });
  assert.equal(actual.parcial, true);
  const ventas = d.ventas.filter((v) => v.sucursalId === "S1" && v.estado !== "cancelada" && v.fecha.startsWith(F.mesActual()));
  assert.ok(cerca(actual.totales.ingresos, ventas.reduce((a, v) => a + v.total, 0), 0.5));
  // plantillas se clasifican por categoría del producto
  const pl = d.productos.find((p) => p.categoria === "Plantillas");
  d.ventas.push({ id: "VX", folio: "T-9", sucursalId: "S1", cajeroId: "U1", fecha: `${hoy()}T10:00`, estado: "pagada", subtotal: 450, descuento: 0, total: 450, pagos: [], partidas: [{ tipo: "producto", itemId: pl.id, nombre: pl.nombre, cant: 1, precio: 450, importe: 450, costo: 95 }] });
  const e2 = F.estadoResultados(d, { mes: F.mesActual(), sucursalId: "S1" });
  assert.ok(cerca(e2.bandas[0].filas[1].monto - actual.bandas[0].filas[1].monto, 450));
});

test("filas expandibles: sueldos por persona y rentas por concepto", () => {
  const d = crearSeed();
  const e = F.estadoResultados(d, { mes: cerrados(d)[0], sucursalId: "S1" });
  const op = e.bandas[3];
  const sueldos = op.filas.find((f) => f.id === "op_sueldos");
  assert.ok(sueldos.detalle.length >= 4 && sueldos.monto > 0);
  const renta = op.filas.find((f) => f.id === "op_renta");
  assert.ok(renta.detalle.length >= 1 && /renta/i.test(renta.detalle[0].etiqueta));
});

test("nómina: usa d.rh.empleados (sucursalBase, sueldoMensual, estado) cuando existe", () => {
  const d = crearSeed();
  d.rh = { empleados: [
    { id: "E1", nombre: "Ana", puesto: "Podóloga", sucursalBase: "S1", sueldoMensual: 20000, estado: "activo" },
    { id: "E2", nombre: "Beto", puesto: "Cajero", sucursalBase: "S1", sueldoMensual: 9000, estado: "baja" },
    { id: "E3", nombre: "Caro", puesto: "Recepción", sucursalBase: "S2", sueldoMensual: 8000, estado: "activo" },
  ] };
  const mes = cerrados(d)[0];
  assert.equal(F.estadoResultados(d, { mes, sucursalId: "S1" }).totales.nomina, 20000);
  assert.equal(F.estadoResultados(d, { mes, sucursalId: "S2" }).totales.nomina, 8000);
  assert.equal(F.estadoResultados(d, { mes, sucursalId: null }).totales.nomina, 28000);
});

test("comparativo por sucursal: 7 columnas + cadena y la cadena es la suma", () => {
  const d = crearSeed();
  const c = F.estadoResultadosComparativo(d, cerrados(d)[3]);
  assert.equal(c.columnas.length, 8);
  assert.equal(c.columnas[7].id, "CAD");
  c.bandas.forEach((b) => {
    const m = b.resultado ? b.montos : b.total.montos;
    assert.ok(cerca(m.CAD, d.sucursales.reduce((a, s) => a + m[s.id], 0)), b.id);
    (b.filas || []).forEach((f) => (f.detalle || []).forEach((x) => assert.ok(cerca(x.montos.CAD, d.sucursales.reduce((a, s) => a + x.montos[s.id], 0)))));
  });
  assert.ok(F.csvComparativo(c).includes("UTILIDAD OPERATIVA"));
  assert.ok(F.csvEstadoResultados(F.estadoResultados(d, { mes: c.mes, sucursalId: "S1" }), F.estadoResultados(d, { mes: F.mesRelativo(c.mes, -1), sucursalId: "S1" })).includes("Mes anterior"));
});

test("permisos del EDR: gerente solo su sucursal; admin y dirección todo; otros roles nada", () => {
  const mes = F.mesesDisponibles()[1];
  const g = nuevo("gerente", "S2");
  assert.equal(F.estadoResultados(g, { mes, sucursalId: "S2" }).ok, true);
  assert.equal(F.estadoResultados(g, { mes, sucursalId: "S3" }).ok, false);
  assert.equal(F.estadoResultados(g, { mes, sucursalId: null }).ok, false);
  const r = F.resumenSucursales(g, mes);
  assert.equal(r.sucursales.length, 1);
  assert.equal(r.cadena, null);
  const c = F.estadoResultadosComparativo(g, mes);
  assert.deepEqual(c.columnas.map((x) => x.id), ["S2"]);
  assert.equal(F.estadoResultados(nuevo("admin"), { mes, sucursalId: null }).ok, true);
  assert.equal(F.estadoResultados(nuevo("direccion"), { mes, sucursalId: "S5" }).ok, true);
  assert.equal(F.estadoResultados(nuevo("cajero"), { mes, sucursalId: "S1" }).ok, false);
  assert.equal(F.estadoResultados(nuevo("admin"), { mes: "2026-13", sucursalId: null }).ok, false);
});

test("gastos: el gerente captura en su sucursal, no en otra; guarda registradoPor y sucursalId; audita", () => {
  const d = nuevo("gerente", "S1");
  const base = { fecha: hoy(), categoria: "papeleria", concepto: "Toners", monto: 850 };
  assert.equal(F.registrarGasto(d, { ...base, sucursalId: "S2" }).ok, false);
  const r = F.registrarGasto(d, { ...base, sucursalId: "S1" });
  assert.ok(r.ok);
  assert.equal(r.gasto.registradoPor, d.sesion.userId);
  assert.equal(r.gasto.sucursalId, "S1");
  assert.equal(d.bitacora[0].accion, "gasto_registrado");
  assert.equal(F.registrarGasto(d, { ...base, sucursalId: "S1", monto: 0 }).ok, false);
  assert.equal(F.registrarGasto(d, { ...base, sucursalId: "S1", categoria: "x" }).ok, false);
  assert.equal(F.registrarGasto(d, { ...base, sucursalId: "S1", fecha: "2999-01-01" }).ok, false);
  assert.equal(F.registrarGasto(d, { ...base, sucursalId: "S1", concepto: " " }).ok, false);
  assert.equal(F.registrarGasto(nuevo("admin"), { ...base, sucursalId: "S6" }).ok, true);
  assert.equal(F.registrarGasto(nuevo("cajero"), { ...base, sucursalId: "S1" }).ok, false);
  assert.equal(F.registrarGasto(nuevo("almacen"), { ...base, sucursalId: "S1" }).ok, false);
});

test("un gasto nuevo baja la utilidad de su sucursal, no la de otra", () => {
  const d = nuevo("admin");
  const mes = F.mesActual();
  const antes = F.estadoResultados(d, { mes, sucursalId: "S1" }).totales.utilidadOperativa;
  const otra = F.estadoResultados(d, { mes, sucursalId: "S2" }).totales.utilidadOperativa;
  F.registrarGasto(d, { sucursalId: "S1", fecha: hoy(), categoria: "publicidad", concepto: "Campaña", monto: 1000 });
  assert.ok(cerca(F.estadoResultados(d, { mes, sucursalId: "S1" }).totales.utilidadOperativa, antes - 1000));
  assert.equal(F.estadoResultados(d, { mes, sucursalId: "S2" }).totales.utilidadOperativa, otra);
});

test("recurrentes: generar los del mes es idempotente y respeta la sucursal del gerente", () => {
  const d = nuevo("gerente", "S1");
  const pend = F.recurrentesPendientes(d, F.mesActual(), "S1");
  assert.ok(pend.length >= 3);
  assert.equal(F.generarRecurrentes(d, { sucursalId: "S2" }).ok, false);
  assert.equal(F.generarRecurrentes(d, { sucursalId: null }).ok, false);
  const r = F.generarRecurrentes(d, { sucursalId: "S1" });
  assert.equal(r.creados.length, pend.length);
  assert.ok(r.creados.every((g) => g.fecha <= hoy() && g.fuente === "recurrente" && g.sucursalId === "S1"));
  assert.equal(F.generarRecurrentes(d, { sucursalId: "S1" }).creados.length, 0);
  const a = nuevo("admin");
  const total = F.recurrentesPendientes(a, F.mesActual()).length;
  assert.equal(F.generarRecurrentes(a, {}).creados.length, total);
  assert.equal(F.recurrentesPendientes(a, F.mesActual()).length, 0);
});

test("gastos fuera de patrón se detectan y totales por categoría y sucursal cuadran", () => {
  const d = crearSeed();
  const fuera = F.gastosFueraDePatron(d);
  assert.ok(fuera.size >= 1);
  const lista = F.filtrarGastos(d, { mes: cerrados(d)[0] });
  const t = F.totalesGastos(lista);
  assert.ok(cerca(Object.values(t.porCategoria).reduce((a, b) => a + b, 0), t.total));
  assert.ok(cerca(Object.values(t.porSucursal).reduce((a, b) => a + b, 0), t.total));
  assert.ok(F.filtrarGastos(d, { texto: "renta", sucursalId: "S1" }).every((g) => g.sucursalId === "S1"));
  const x = nuevo("admin");
  F.registrarGasto(x, { sucursalId: "S4", fecha: hoy(), categoria: "luz", concepto: "Recibo extraordinario", monto: 90000 });
  assert.ok([...F.gastosFueraDePatron(x)].some((id) => x.fin.gastos.find((g) => g.id === id).monto === 90000));
});

// ───────── Captura de nota de compra con IA (simulada)
const catalogo = (d) => ({ proveedores: d.proveedores, productos: d.productos });
const datosNota = (d, extra = {}) => {
  const b = F.armarBorrador("foto-demo-123", catalogo(d), new Date(2026, 10, 20, 10));
  return { confirmado: true, tipo: "mercancia", proveedorId: b.proveedor.valor, folioProveedor: b.folio.valor, fecha: hoy(), partidas: b.partidas.map((p) => ({ productoId: p.productoId, cant: p.cant, costo: p.costo })), foto: null, lectura: { simulado: true }, ...extra };
};

test("borrador de IA: determinista por foto/hora, con confianza por campo y marcado como simulado", () => {
  const d = crearSeed();
  const f = new Date(2026, 10, 20, 10);
  const a = F.armarBorrador("foto-A", catalogo(d), f), a2 = F.armarBorrador("foto-A", catalogo(d), f);
  assert.deepEqual(a, a2);
  assert.notDeepEqual(a, F.armarBorrador("foto-B-distinta", catalogo(d), f));
  assert.equal(a.simulado, true);
  assert.ok(a.partidas.length >= 2 && a.partidas.every((p) => d.productos.some((x) => x.id === p.productoId) && p.cant > 0 && p.costo > 0));
  assert.ok(a.proveedor.confianza > 0 && a.folio.confianza > 0 && a.partidas[0].confianza.cant > 0);
  const bajas = [];
  for (let i = 0; i < 20; i++) F.armarBorrador(`f${i}`, catalogo(d), f).partidas.forEach((p) => Object.values(p.confianza).forEach((c) => bajas.push(c < 0.7)));
  assert.ok(bajas.some(Boolean) && bajas.some((x) => !x));
});

test("la IA no registra sola: sin confirmación no se crea nota, CxP ni inventario", async () => {
  const d = nuevo("admin");
  const b = await F.leerNotaConIA("foto-xyz", catalogo(d));
  assert.equal(b.simulado, true);
  const n = d.fin.notasCompra.length, c = d.cxp.length, capas = d.capas.length;
  const r = F.confirmarNotaCompra(d, { ...datosNota(d), confirmado: false });
  assert.equal(r.ok, false);
  assert.equal(F.confirmarNotaCompra(d, { ...datosNota(d), confirmado: undefined }).ok, false);
  assert.equal(d.fin.notasCompra.length, n); assert.equal(d.cxp.length, c); assert.equal(d.capas.length, capas);
});

test("confirmar crea nota, cuenta por pagar con vencimiento según días del proveedor y entrada PEPS al almacén", () => {
  const d = nuevo("almacen");
  const almacen = d.sesion.sucursalId;
  const datos = datosNota(d, { almacenId: almacen });
  const pv = d.proveedores.find((p) => p.id === datos.proveedorId);
  const stock0 = datos.partidas.map((p) => R.stock(d, almacen, p.productoId));
  const val0 = R.valuacion(d, almacen);
  const r = F.confirmarNotaCompra(d, datos);
  assert.ok(r.ok, r.error);
  const nota = r.nota;
  assert.equal(nota.registradoPor, d.sesion.userId);
  assert.ok(cerca(nota.total, datos.partidas.reduce((a, p) => a + p.cant * p.costo, 0), 0.02));
  assert.equal(d.fin.notasCompra[0].id, nota.id);
  const cx = d.cxp.find((c) => c.id === nota.cxpId);
  assert.equal(cx.saldo, nota.total);
  assert.equal(cx.proveedorId, pv.id);
  const venc = new Date(`${datos.fecha}T00:00:00`); venc.setDate(venc.getDate() + pv.dias);
  assert.equal(cx.vence, `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, "0")}-${String(venc.getDate()).padStart(2, "0")}`);
  datos.partidas.forEach((p, i) => assert.equal(R.stock(d, almacen, p.productoId), stock0[i] + p.cant));
  assert.ok(Math.abs(R.valuacion(d, almacen) - val0 - nota.total) < 0.05);
  // la entrada quedó como capa nueva con su costo: la salida PEPS consume primero la capa más antigua
  const p0 = datos.partidas[0];
  const capas = d.capas.filter((c) => c.almacenId === almacen && c.productoId === p0.productoId);
  assert.ok(capas.some((c) => c.costo === p0.costo && c.cant >= p0.cant));
  assert.equal(d.bitacora[0].accion, "nota_compra_registrada");
});

test("sin entrada al inventario no se tocan las capas", () => {
  const d = nuevo("admin");
  const capas = d.capas.length, val = R.valuacion(d, "CEN");
  assert.ok(F.confirmarNotaCompra(d, datosNota(d)).ok);
  assert.equal(d.capas.length, capas);
  assert.equal(R.valuacion(d, "CEN"), val);
});

test("duplicados: mismo proveedor + folio se rechaza, salvo confirmación expresa", () => {
  const d = nuevo("admin");
  const datos = datosNota(d);
  assert.ok(F.confirmarNotaCompra(d, datos).ok);
  assert.ok(F.detectarDuplicado(d, datos.proveedorId, datos.folioProveedor));
  assert.ok(F.detectarDuplicado(d, datos.proveedorId, ` ${datos.folioProveedor.toLowerCase()} `));
  const n = d.fin.notasCompra.length;
  const r = F.confirmarNotaCompra(d, datos);
  assert.equal(r.ok, false); assert.match(r.error, /Ya existe/);
  assert.equal(d.fin.notasCompra.length, n);
  const otro = d.proveedores.find((p) => p.id !== datos.proveedorId);
  assert.equal(F.detectarDuplicado(d, otro.id, datos.folioProveedor), null);
  assert.ok(F.confirmarNotaCompra(d, { ...datos, permitirDuplicado: true }).ok);
  // también contra las cuentas por pagar existentes de la semilla
  const c = d.cxp[0];
  assert.ok(F.detectarDuplicado(d, c.proveedorId, c.doc));
});

test("validaciones y permisos de la captura: rol, partidas, almacén ajeno, gasto asociado", () => {
  assert.equal(F.confirmarNotaCompra(nuevo("gerente"), datosNota(nuevo("gerente"))).ok, false);
  assert.equal(F.confirmarNotaCompra(nuevo("cajero"), datosNota(nuevo("cajero"))).ok, false);
  const d = nuevo("almacen");
  const dat = datosNota(d);
  assert.equal(F.confirmarNotaCompra(d, { ...dat, almacenId: "CEN" }).ok, false, "almacén de sucursal no da entrada al central");
  assert.equal(F.confirmarNotaCompra(d, { ...dat, almacenId: d.sesion.sucursalId === "S1" ? "S2" : "S1" }).ok, false);
  assert.equal(F.confirmarNotaCompra(d, { ...dat, partidas: [] }).ok, false);
  assert.equal(F.confirmarNotaCompra(d, { ...dat, partidas: [{ productoId: "ZZ", cant: 1, costo: 1 }] }).ok, false);
  assert.equal(F.confirmarNotaCompra(d, { ...dat, partidas: [{ ...dat.partidas[0], cant: 1.5 }] }).ok, false);
  assert.equal(F.confirmarNotaCompra(d, { ...dat, proveedorId: "PRX" }).ok, false);
  assert.equal(F.confirmarNotaCompra(d, { ...dat, fecha: "2999-01-01" }).ok, false);
  const a = nuevo("admin");
  const dg = datosNota(a, { gasto: { sucursalId: "S3", categoria: "otros", concepto: "Flete", monto: 600 } });
  const r = F.confirmarNotaCompra(a, dg);
  assert.ok(r.ok);
  const g = a.fin.gastos.find((x) => x.id === r.nota.gastoId);
  assert.equal(g.sucursalId, "S3"); assert.equal(g.fuente, "nota_ia"); assert.equal(g.notaId, r.nota.id);
  // nota de servicio (gasto): sin partidas ni inventario
  const s = F.confirmarNotaCompra(nuevo("admin"), { confirmado: true, tipo: "gasto", proveedorId: "PR1", folioProveedor: "SRV-1", fecha: hoy(), total: 1200, almacenId: null });
  assert.ok(s.ok && s.nota.partidas.length === 0 && s.cxp.saldo === 1200);
});

test("resumen de cuentas por pagar incluye lo capturado", () => {
  const d = nuevo("admin");
  const antes = F.resumenCxp(d).total;
  const r = F.confirmarNotaCompra(d, datosNota(d));
  assert.ok(Math.abs(F.resumenCxp(d).total - antes - r.nota.total) < 0.01);
  assert.equal(F.resumenCxp(d).porProveedor.length, d.proveedores.length);
});
