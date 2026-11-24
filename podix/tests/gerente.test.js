// Pruebas de la lógica del gerente (src/store/acciones_gerente.js). node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as R from "../src/store/reglas.js";
import * as G from "../src/store/acciones_gerente.js";
import { hoy } from "../src/lib/format.js";

const gerente = (d, s) => d.usuarios.find((u) => u.rol === "gerente" && u.sucursales[0] === s);
const r2 = (n) => Math.round(n * 100) / 100;

test("KPI de ventas: no canceladas del periodo menos devoluciones; ticket = ventas / n", () => {
  const d = crearSeed(); const s = "S1";
  const hoyV = d.ventas.filter((v) => v.sucursalId === s && v.fecha.slice(0, 10) === hoy() && v.estado !== "cancelada");
  const k = G.kpisSucursal(d, s, "hoy");
  assert.equal(k.ventasBrutas, r2(hoyV.reduce((a, v) => a + v.total, 0)));
  d.devoluciones = [{ sucursalId: s, fecha: hoy(), monto: 50 }];
  assert.equal(G.kpisSucursal(d, s, "hoy").ventas, r2(k.ventasBrutas - 50));
  if (hoyV.length) assert.equal(k.ticket, r2(k.ventasBrutas / hoyV.length));
  hoyV.forEach((v) => { v.estado = "cancelada"; });
  assert.equal(G.kpisSucursal(d, s, "hoy").nVentas, 0);
});

test("ocupación = minutos atendidos+confirmados / (8 h x podólogos del día); no-shows", () => {
  const d = crearSeed(); const f = hoy();
  d.citas = [
    { id: "a", sucursalId: "S1", podologoId: "P1", inicio: f + "T09:00", duracion: 60, estado: "atendida" },
    { id: "b", sucursalId: "S1", podologoId: "P1", inicio: f + "T10:00", duracion: 60, estado: "confirmada" },
    { id: "c", sucursalId: "S1", podologoId: "P2", inicio: f + "T10:00", duracion: 60, estado: "cancelada" },
    { id: "d", sucursalId: "S1", podologoId: "P2", inicio: f + "T11:00", duracion: 60, estado: "no_asistio" },
  ];
  const k = G.kpisSucursal(d, "S1", "hoy");
  assert.equal(k.minDisponibles, 960); assert.equal(k.minOcupados, 120); assert.equal(k.ocupacionPct, 13);
  assert.equal(k.noShowPct, 50);
});

test("periodos: hoy 1 día, semana 7, mes 30", () => {
  assert.deepEqual(G.rango("hoy", "2026-11-16"), { desde: "2026-11-16", hasta: "2026-11-16" });
  assert.equal(G.rango("semana", "2026-11-16").desde, "2026-11-10");
  assert.equal(G.rango("mes", "2026-11-16").desde, "2026-10-18");
});

test("corte con diferencia: aprobar, rechazar exige motivo, solo el gerente de la sucursal", () => {
  const d = crearSeed(); const g = gerente(d, "S1"); const t = d.turnos.find((x) => x.sucursalId === "S1");
  t.corte = { fecha: hoy(), filas: [{ forma: "efectivo", esperado: 100, contado: 90, diferencia: -10 }], justificacion: "x", estado: "diferencia_pendiente" };
  assert.equal(G.cortesPendientes(d, "S1").length, 1);
  assert.equal(G.resolverCorte(d, t.id, "aprobar", "", gerente(d, "S2")).ok, false);
  assert.equal(G.resolverCorte(d, t.id, "rechazar", "", g).ok, false);
  assert.equal(G.kpisSucursal(d, "S1", "hoy").faltante, -10);
  assert.equal(G.resolverCorte(d, t.id, "aprobar", "", g).ok, true);
  assert.equal(t.corte.estado, "aprobada");
  assert.equal(G.resolverCorte(d, t.id, "aprobar", "", g).ok, false, "ya resuelto");
});

test("cartera vencida por paciente y bloqueo manual de crédito", () => {
  const d = crearSeed();
  const suc = d.planes.map((p) => p.sucursalId).find((s) => G.carteraPorPaciente(d, s).length);
  if (!suc) return; // la semilla puede no traer mora según la fecha
  const c = G.carteraPorPaciente(d, suc)[0];
  assert.ok(c.vencido > 0 && c.diasMora > 10);
  const g = gerente(d, suc);
  assert.equal(G.bloquearCredito(d, c.pacienteId, true, "", g, suc).ok, false);
  assert.equal(G.bloquearCredito(d, c.pacienteId, true, "Atraso", gerente(d, suc === "S1" ? "S2" : "S1"), suc).ok, false);
  assert.equal(G.bloquearCredito(d, c.pacienteId, true, "Atraso", g, suc).ok, true);
  assert.equal(R.credito(d, c.pacienteId).bloqueado, true);
  G.bloquearCredito(d, c.pacienteId, false, "", g, suc);
  assert.equal(R.credito(d, c.pacienteId).bloqueado, false);
});

test("alertas: stock y biológico pendiente, ordenadas por prioridad", () => {
  const d = crearSeed();
  const a = G.alertasSucursal(d, "S1");
  assert.ok(a.some((x) => x.tipo === "stock")); assert.ok(a.some((x) => x.tipo === "esterilizacion"));
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].prioridad <= a[i].prioridad);
});

test("ubicación de podólogo hoy según citas", () => {
  const d = crearSeed(); const c = d.citas.find((x) => x.inicio.slice(0, 10) === hoy() && x.estado !== "cancelada");
  assert.ok(G.ubicacionHoy(d, c.podologoId).some((u) => u.sucursalId === c.sucursalId));
  assert.deepEqual(G.ubicacionHoy(d, "nadie"), []);
});
