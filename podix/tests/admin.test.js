import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as A from "../src/store/acciones_admin.js";
import { hoy } from "../src/lib/format.js";

const nuevo = (rol = "admin") => {
  const d = crearSeed();
  d.sesion = { userId: d.usuarios.find((u) => u.rol === rol).id, sucursalId: "S1" };
  return d;
};

test("periodos", () => {
  assert.equal(A.periodo("hoy", "2026-11-16").desde, "2026-11-16");
  assert.equal(A.periodo("semana", "2026-11-16").desde, "2026-11-10");
  assert.equal(A.periodo("mes", "2026-11-16").desde, "2026-10-18");
});

test("ventas netas restan devoluciones y excluyen canceladas", () => {
  const d = nuevo();
  const p = A.periodo("mes");
  const base = A.ventasNetas(d, p);
  assert.ok(base > 0);
  const v = d.ventas.find((x) => x.estado === "pagada");
  const antes = A.ventasNetas(d, p, v.sucursalId);
  d.devoluciones.push({ id: "D1", ventaId: v.id, fecha: hoy(), monto: 100 });
  assert.equal(A.ventasNetas(d, p, v.sucursalId), antes - 100);
  v.estado = "cancelada";
  assert.equal(A.ventasNetas(d, p, v.sucursalId), antes - v.total - 100);
});

test("el global es la suma de las sucursales", () => {
  const d = nuevo(), p = A.periodo("mes");
  const suma = d.sucursales.reduce((a, s) => a + A.ventasNetas(d, p, s.id), 0);
  assert.ok(Math.abs(suma - A.ventasNetas(d, p)) < 0.01);
});

test("ocupación: minutos ocupados / (8 h x podólogos presentes)", () => {
  const d = crearSeed();
  d.citas = [
    { id: "a", podologoId: "P1", sucursalId: "S1", inicio: "2026-11-10T09:00", duracion: 60, estado: "atendida" },
    { id: "b", podologoId: "P1", sucursalId: "S1", inicio: "2026-11-10T10:00", duracion: 60, estado: "confirmada" },
    { id: "c", podologoId: "P2", sucursalId: "S1", inicio: "2026-11-10T09:00", duracion: 60, estado: "agendada" },
    { id: "x", podologoId: "P2", sucursalId: "S1", inicio: "2026-11-10T11:00", duracion: 60, estado: "cancelada" },
  ];
  const o = A.ocupacionDetalle(d, { desde: "2026-11-10", hasta: "2026-11-10" }, "S1");
  assert.equal(o.min, 120); assert.equal(o.disp, 960); assert.equal(o.pct, 12.5);
});

test("diferencia de corte", () => {
  assert.equal(A.diferenciaCorte({ corte: { contado: { efectivo: 90 }, esperado: { efectivo: 100 } } }), -10);
  assert.equal(A.diferenciaCorte({ corte: null }), 0);
  const d = nuevo();
  d.turnos[0].corte = { diferencia: -50 }; d.turnos[0].cerradoEn = hoy() + "T20:00";
  assert.equal(A.cajaDiferencias(d, A.periodo("hoy")).faltante, 50);
});

test("ranking ordena y detalle trae top", () => {
  const d = nuevo(), p = A.periodo("mes");
  const r = A.rankingSucursales(d, p, "ventas");
  assert.equal(r.length, 7);
  for (let i = 1; i < 7; i++) assert.ok(r[i - 1].ventas >= r[i].ventas);
  const det = A.detalleSucursal(d, p, r[0].sucursalId);
  assert.ok(det.topServicios.length > 0);
});

test("precio base: motivo obligatorio, historial y auditoría; no toca ventas", () => {
  const d = nuevo();
  const it = d.productos.find((x) => x.tipo === "venta");
  const ventasAntes = JSON.stringify(d.ventas);
  assert.equal(A.cambiarPrecioBase(d, { tipo: "producto", itemId: it.id, nuevo: 999, motivo: "" }).ok, false);
  const r = A.cambiarPrecioBase(d, { tipo: "producto", itemId: it.id, nuevo: 999, motivo: "Aumento proveedor" });
  assert.ok(r.ok);
  assert.equal(it.precioBase, 999);
  assert.equal(d.listaPreciosHist[0].antes, r.antes);
  assert.equal(d.listaPreciosHist[0].despues, 999);
  assert.equal(d.bitacora[0].accion, "cambio_precio_base");
  assert.equal(JSON.stringify(d.ventas), ventasAntes);
});

test("ajuste %: general, específico y quitar", () => {
  const d = nuevo();
  assert.ok(A.cambiarAjuste(d, { sucursalId: "S3", pct: 4, motivo: "Ajuste zona" }).ok);
  assert.equal(d.ajustesPrecio.find((a) => a.sucursalId === "S3" && a.tipo === "*").pct, 4);
  assert.equal(A.cambiarAjuste(d, { sucursalId: "S3", pct: 500, motivo: "demasiado" }).ok, false);
  assert.ok(A.cambiarAjuste(d, { sucursalId: "S3", tipo: "servicio", itemId: "SV1", pct: 9, motivo: "Promoción" }).ok);
  assert.equal(A.matrizPrecios(d, "servicio", "SV1")[2].pct, 9);
  assert.ok(A.cambiarAjuste(d, { sucursalId: "S3", tipo: "servicio", itemId: "SV1", pct: null, motivo: "Fin promo" }).ok);
  assert.equal(A.matrizPrecios(d, "servicio", "SV1")[2].pct, 4);
});

test("OC continúa la serie en OC-1186", () => {
  const d = nuevo();
  const pr = d.productos[0];
  assert.equal(A.crearOC(d, { proveedorId: "PR1", partidas: [] }).ok, false);
  const r = A.crearOC(d, { proveedorId: "PR1", partidas: [{ productoId: pr.id, cant: 5, costo: 10 }] });
  assert.equal(r.oc.folio, "OC-1186");
  assert.equal(A.crearOC(d, { proveedorId: "PR1", partidas: [{ productoId: pr.id, cant: 1, costo: 10 }] }).oc.folio, "OC-1187");
  assert.equal(r.oc.estado, "por_aprobar");
  assert.ok(A.aprobarEnviarOC(d, r.oc.id).ok);
  assert.equal(d.oc.find((o) => o.id === r.oc.id).estado, "enviada");
});

test("pago de CxP parcial y total", () => {
  const d = nuevo();
  const c = d.cxp[0], s0 = c.saldo;
  assert.equal(A.registrarPagoCxp(d, { cxpId: c.id, monto: s0 + 1 }).ok, false);
  assert.equal(A.registrarPagoCxp(d, { cxpId: c.id, monto: 100 }).saldo, s0 - 100);
  assert.equal(A.registrarPagoCxp(d, { cxpId: c.id, monto: s0 - 100 }).saldo, 0);
  assert.equal(A.estadoCxp(c), "pagada");
  const orden = A.ordenarCxp(d);
  assert.equal(orden[orden.length - 1].saldo, 0);
});

test("permisos: un gerente no puede cambiar precios", () => {
  const d = nuevo("gerente");
  assert.equal(A.cambiarPrecioBase(d, { tipo: "servicio", itemId: "SV1", nuevo: 1, motivo: "intento malo" }).ok, false);
});

test("parámetros: validación y auditoría", () => {
  const d = nuevo();
  const v = { ...d.params.S1 };
  assert.deepEqual(A.validarParametros(v), {});
  assert.ok(A.validarParametros({ ...v, anticipoMinimoPct: 120 }).anticipoMinimoPct);
  assert.ok(A.validarParametros({ ...v, diasGracia: 2.5 }).diasGracia);
  assert.ok(A.validarParametros({ ...v, limiteCreditoGerente: 20000 }).limiteCreditoAdmin);
  assert.equal(A.guardarParametros(d, "S1", { diasGracia: -1 }).ok, false);
  const r = A.guardarParametros(d, "S1", { diasGracia: 15 });
  assert.ok(r.ok); assert.equal(d.params.S1.diasGracia, 15);
  assert.match(d.bitacora[0].detalle, /10 d → 15 d/);
  assert.equal(A.copiarParametros(d, "S1", ["S2", "S3"], ["diasGracia"]).destinos, 2);
  assert.equal(d.params.S3.diasGracia, 15);
});

test("usuarios: alta, límites de sucursales y desactivar", () => {
  const d = nuevo();
  assert.equal(A.guardarUsuario(d, { nombre: "X", correo: "mal", rol: "podologo", sucursales: ["S1"] }).ok, false);
  assert.equal(A.guardarUsuario(d, { nombre: "Dr. X", correo: "x@demo.mx", rol: "podologo", sucursales: ["S1", "S2", "S3", "S4"] }).ok, false);
  const r = A.guardarUsuario(d, { nombre: "Dr. X", correo: "x@demo.mx", rol: "podologo", sucursales: ["S1", "S2", "S3"] });
  assert.ok(r.ok); assert.equal(r.usuario.activo, true);
  assert.equal(A.guardarUsuario(d, { nombre: "Otro", correo: "X@demo.mx", rol: "cajero", sucursales: ["S1"] }).ok, false);
  assert.ok(A.cambiarActivo(d, r.usuario.id, false).ok);
  assert.equal(d.usuarios.find((u) => u.id === r.usuario.id).activo, false);
  assert.equal(A.cambiarActivo(d, d.sesion.userId, false).ok, false);
});

test("rotación: asignación 1-3 y conflictos", () => {
  const d = nuevo();
  const p = A.podologos(d)[0];
  assert.equal(A.asignarSucursales(d, p.id, []).ok, false);
  assert.equal(A.asignarSucursales(d, p.id, ["S1", "S2", "S3", "S4"]).ok, false);
  assert.ok(A.asignarSucursales(d, p.id, ["S5", "S6"]).ok);
  assert.deepEqual(d.usuarios.find((u) => u.id === p.id).sucursales, ["S5", "S6"]);
  d.citas = [
    { id: "a", podologoId: p.id, sucursalId: "S5", inicio: "2026-11-10T09:00", duracion: 60, estado: "confirmada" },
    { id: "b", podologoId: p.id, sucursalId: "S6", inicio: "2026-11-10T09:30", duracion: 30, estado: "confirmada" },
    { id: "c", podologoId: p.id, sucursalId: "S6", inicio: "2026-11-10T10:00", duracion: 30, estado: "confirmada" },
  ];
  const c = A.conflictosRotacion(d, "2026-11-10");
  assert.equal(c.length, 1); assert.equal(c[0].tipo, "sucursales");
  assert.equal(A.dondeEstaHoy(d, p.id, "2026-11-10", 9 * 60 + 10).sucursalId, "S5");
});

test("reportes y CSV", () => {
  const d = nuevo(), p = A.periodo("mes");
  for (const r of A.REPORTES) {
    const rep = A.generarReporte(d, r.id, p);
    assert.ok(rep.columnas.length > 1, r.id);
    assert.ok(Array.isArray(rep.filas));
  }
  assert.equal(A.generarReporte(d, "ventas_sucursal", p).filas.length, 7);
  assert.equal(A.generarReporte(d, "inventario", p).filas.length, 8);
  const cat = A.generarReporte(d, "ventas_categoria", p);
  assert.ok(Math.abs(cat.filas.reduce((a, f) => a + f.participacion, 0) - 100) < 0.5);
  const csv = A.aCSV([{ k: "nombre", l: "Sucursal" }, { k: "v", l: "Ventas" }], [{ nombre: 'Cen"tro, 1', v: 5 }]);
  assert.ok(csv.startsWith("﻿Sucursal,Ventas\r\n"));
  assert.ok(csv.includes('"Cen""tro, 1",5'));
});

test("mermas y esterilización", () => {
  const d = nuevo(), p = A.periodo("mes");
  d.ajustesInventario = []; d.ajustesInventario.push({ id: "J", almacenId: "S1", productoId: d.productos[0].id, cant: -3, fecha: hoy() });
  const m = A.generarReporte(d, "mermas", p).filas;
  assert.equal(m[0].unidades, 3); assert.equal(m[0].valor, 3 * d.productos[0].costo);
  const e = A.generarReporte(d, "esterilizacion", p).filas;
  assert.equal(e[0].cumplimiento, 100);
});

test("bitácora: filtros", () => {
  const d = nuevo();
  d.bitacora = [
    { id: 1, fecha: "2026-11-15T10:00", usuarioId: "U1", sucursalId: "S1", accion: "consulta_expediente", entidad: "paciente", ref: "PA1", detalle: "Ana" },
    { id: 2, fecha: "2026-11-16T10:00", usuarioId: "U2", sucursalId: "S1", accion: "cambio_precio_base", entidad: "precio", ref: "P01", detalle: "Bastón" },
  ];
  assert.equal(A.filtrarBitacora(d, { accion: "consulta_expediente" }).length, 1);
  assert.equal(A.filtrarBitacora(d, { texto: "baston" }).length, 1);
  assert.equal(A.filtrarBitacora(d, { desde: "2026-11-16" }).length, 1);
  assert.equal(A.filtrarBitacora(d, { usuarioId: "U1", entidad: "paciente" }).length, 1);
});
