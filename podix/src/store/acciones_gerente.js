// Lógica del gerente de sucursal: KPIs, cortes por aprobar, cartera vencida, bloqueo manual de crédito, alertas y equipo.
// Funciones puras sobre el estado (lectura) o sobre el borrador `d` dentro de mutar() (escritura, validan rol y sucursal).
import { auditar } from "./core.js";
import * as R from "./reglas.js";
import { carteraVencida } from "./selectors.js";
import { hoy, dia, sumarDias, redondear, diasEntre } from "../lib/format.js";

const err = (error) => ({ ok: false, error });
const MIN_DIA = 8 * 60; // jornada disponible por podólogo asignado ese día
export const ESTADOS_OCUPAN = ["atendida", "confirmada", "en_sala", "en_atencion"];

/** hoy = solo hoy; semana = últimos 7 días; mes = últimos 30 días (todos terminan en la fecha de referencia). */
export function rango(periodo, ref = hoy()) {
  const n = periodo === "hoy" ? 0 : periodo === "semana" ? 6 : 29;
  return { desde: sumarDias(ref, -n), hasta: ref };
}
const dentro = (f, r) => { const x = dia(f); return x >= r.desde && x <= r.hasta; };
const montoDev = (x) => Number(x.monto ?? x.total ?? x.reembolso ?? 0) || 0;

export function puedeGerenciar(u, sucursalId) { return !!u && u.rol === "gerente" && u.sucursales.includes(sucursalId); }

export function ventasPeriodo(d, sucursalId, r) {
  return d.ventas.filter((v) => v.sucursalId === sucursalId && v.estado !== "cancelada" && dentro(v.fecha, r));
}
export function ocupacionPorDia(d, sucursalId, r) {
  const filas = [];
  for (let f = r.desde; f <= r.hasta; f = sumarDias(f, 1)) {
    const cs = d.citas.filter((c) => c.sucursalId === sucursalId && dia(c.inicio) === f);
    const pods = new Set(cs.map((c) => c.podologoId));
    const disp = pods.size * MIN_DIA;
    const ocup = cs.filter((c) => ESTADOS_OCUPAN.includes(c.estado)).reduce((a, c) => a + c.duracion, 0);
    if (disp) filas.push({ fecha: f, podologos: pods.size, disponible: disp, ocupado: ocup });
  }
  return filas;
}
/** Todos los KPI del tablero + el detalle que abre cada tarjeta. */
export function kpisSucursal(d, sucursalId, periodo, ref = hoy()) {
  const r = rango(periodo, ref);
  const ventas = ventasPeriodo(d, sucursalId, r);
  const devs = (d.devoluciones || []).filter((x) => x.sucursalId === sucursalId && dentro(x.fecha || ref, r));
  const bruto = ventas.reduce((a, v) => a + v.total, 0);
  const devuelto = devs.reduce((a, x) => a + montoDev(x), 0);
  const consultas = d.consultas.filter((c) => c.sucursalId === sucursalId && ["cerrada", "cobrada"].includes(c.estado) && dentro(c.fecha, r));
  const ocu = ocupacionPorDia(d, sucursalId, r);
  const disp = ocu.reduce((a, x) => a + x.disponible, 0), ocup = ocu.reduce((a, x) => a + x.ocupado, 0);
  const citas = d.citas.filter((c) => c.sucursalId === sucursalId && dentro(c.inicio, r));
  const noShows = citas.filter((c) => c.estado === "no_asistio");
  const baseNS = citas.filter((c) => ["atendida", "no_asistio"].includes(c.estado)).length;
  const turnos = d.turnos.filter((t) => t.sucursalId === sucursalId && t.corte && dentro(t.corte.fecha || t.cerradoEn || ref, r));
  const difs = turnos.map((t) => ({ turno: t, dif: redondear(t.corte.filas.reduce((a, f) => a + (f.diferencia || 0), 0)) })).filter((x) => x.dif);
  const faltante = redondear(difs.filter((x) => x.dif < 0).reduce((a, x) => a + x.dif, 0));
  const sobrante = redondear(difs.filter((x) => x.dif > 0).reduce((a, x) => a + x.dif, 0));
  const bajo = R.bajoMinimo(d, sucursalId);
  const porConsulta = new Map(d.consultas.map((c) => [c.id, c.podologoId]));
  const prod = new Map();
  const fila = (id) => { if (!prod.has(id)) prod.set(id, { podologoId: id, consultas: 0, ingreso: 0 }); return prod.get(id); };
  consultas.forEach((c) => { fila(c.podologoId).consultas++; });
  ventas.forEach((v) => { const p = v.consultaId ? porConsulta.get(v.consultaId) : v.vendedorId; if (p) fila(p).ingreso += v.total; });
  return {
    rango: r,
    ventas: redondear(bruto - devuelto), ventasBrutas: redondear(bruto), devuelto: redondear(devuelto), nVentas: ventas.length,
    atendidos: consultas.length,
    ocupacionPct: disp ? Math.round((ocup / disp) * 100) : 0, minOcupados: ocup, minDisponibles: disp,
    noShowPct: baseNS ? Math.round((noShows.length / baseNS) * 1000) / 10 : 0, nNoShows: noShows.length, baseNoShow: baseNS,
    ticket: ventas.length ? redondear(bruto / ventas.length) : 0,
    cartera: carteraVencida(d, sucursalId),
    faltante, sobrante,
    bajoMinimo: bajo.length,
    productividad: [...prod.values()].map((p) => ({ ...p, ingreso: redondear(p.ingreso) })).sort((a, b) => b.ingreso - a.ingreso),
    det: { ventas, devs, consultas, ocupacion: ocu, noShows, difs, bajo },
  };
}

// ───────── Cortes de caja por aprobar
export const cortesPendientes = (d, sucursalId) => d.turnos.filter((t) => t.sucursalId === sucursalId && t.corte && t.corte.estado === "diferencia_pendiente");
export const turnosAbiertos = (d, sucursalId) => d.turnos.filter((t) => t.sucursalId === sucursalId && t.estado === "abierto");
export const difCorte = (t) => redondear(t.corte.filas.reduce((a, f) => a + (f.diferencia || 0), 0));

export function resolverCorte(d, turnoId, decision, motivo, u) {
  const t = d.turnos.find((x) => x.id === turnoId);
  if (!t || !t.corte) return err("El corte no existe.");
  if (!puedeGerenciar(u, t.sucursalId)) return err("Solo el gerente de la sucursal resuelve el corte.");
  if (t.corte.estado !== "diferencia_pendiente") return err("El corte ya fue resuelto.");
  if (!["aprobar", "rechazar"].includes(decision)) return err("Decisión inválida.");
  if (decision === "rechazar" && !String(motivo || "").trim()) return err("Escribe el motivo del rechazo.");
  t.corte.estado = decision === "aprobar" ? "aprobada" : "rechazada";
  t.corte.resueltoPor = u.id; t.corte.resueltoEn = hoy(); t.corte.motivoResolucion = String(motivo || "").trim();
  auditar(d, decision === "aprobar" ? "corte_aprobado" : "corte_rechazado", "turno", t.id, `Diferencia ${difCorte(t)}${motivo ? ` · ${motivo}` : ""}`);
  return { ok: true, estado: t.corte.estado };
}

// ───────── Cartera vencida por paciente
export function carteraPorPaciente(d, sucursalId, ref = hoy()) {
  const g = new Map();
  d.planes.filter((p) => p.sucursalId === sucursalId && p.estado !== "liquidado" && p.estado !== "cancelado").forEach((pl) => {
    const par = d.params[pl.sucursalId];
    const venc = pl.parcialidades.filter((x) => R.estadoParcialidad(x, par, ref) === "vencida");
    if (!venc.length) return;
    const s = R.saldoPlan(d, pl, ref);
    if (!g.has(pl.pacienteId)) g.set(pl.pacienteId, { pacienteId: pl.pacienteId, planes: [], vencido: 0, mora: 0, saldo: 0, diasMora: 0 });
    const x = g.get(pl.pacienteId);
    const dias = R.diasMoraPlan(d, pl, ref);
    x.planes.push({ plan: pl, saldo: s, diasMora: dias, vencidas: venc.length });
    x.vencido += s.vencido; x.mora += s.mora; x.saldo += s.capital; x.diasMora = Math.max(x.diasMora, dias);
  });
  return [...g.values()].map((x) => ({ ...x, vencido: redondear(x.vencido), mora: redondear(x.mora), saldo: redondear(x.saldo), credito: R.credito(d, x.pacienteId) || null }))
    .sort((a, b) => b.vencido - a.vencido);
}
/** Bloqueo manual del crédito (no hay bloqueo automático ni tope de mora). */
export function bloquearCredito(d, pacienteId, bloquear, motivo, u, sucursalId) {
  if (!puedeGerenciar(u, sucursalId)) return err("Solo el gerente de la sucursal bloquea el crédito.");
  const c = R.credito(d, pacienteId);
  if (!c) return err("El paciente no tiene línea de crédito.");
  if (bloquear && !String(motivo || "").trim()) return err("Escribe el motivo del bloqueo.");
  c.bloqueado = !!bloquear;
  if (bloquear) { c.bloqueadoPor = u.id; c.bloqueadoMotivo = motivo.trim(); c.bloqueadoEn = hoy(); }
  else { c.desbloqueadoPor = u.id; c.desbloqueadoEn = hoy(); }
  auditar(d, bloquear ? "credito_bloqueado" : "credito_desbloqueado", "credito", pacienteId, motivo || "");
  return { ok: true };
}

// ───────── Alertas priorizadas (1 alta, 2 media, 3 baja)
export function alertasSucursal(d, sucursalId, ref = hoy()) {
  const a = [];
  R.bajoMinimo(d, sucursalId).forEach((p) => {
    const s = R.stock(d, sucursalId, p.id);
    a.push({ id: `sb-${p.id}`, tipo: "stock", prioridad: s === 0 || s < p.minimo / 2 ? 1 : 2, titulo: p.nombre, dato: `Existencia ${s} de mínimo ${p.minimo}`, accion: s === 0 ? "Sin stock: pide traspaso urgente al almacén central." : "Solicita traspaso al almacén central." });
  });
  d.apartados.filter((x) => x.sucursalId === sucursalId).forEach((x) => {
    const e = R.estadoApartado(x, ref);
    if (e === "vencido") a.push({ id: `ap-${x.id}`, tipo: "apartado", prioridad: 1, titulo: `Apartado ${x.folio} vencido`, dato: `${x.nombre} · venció hace ${Math.abs(diasEntre(ref, x.vence))} d · saldo ${R.saldoApartado(x)}`, accion: "Libera el producto o autoriza una prórroga; el anticipo se aplica según la política." });
    if (e === "por_vencer") a.push({ id: `ap-${x.id}`, tipo: "apartado", prioridad: 2, titulo: `Apartado ${x.folio} por vencer`, dato: `${x.nombre} · vence en ${diasEntre(ref, x.vence)} d · saldo ${R.saldoApartado(x)}`, accion: "Llama al paciente para liquidar o solicita prórroga." });
  });
  d.ordenesLab.filter((o) => o.sucursalId === sucursalId && ["enviada", "retrasada"].includes(o.estado)).forEach((o) => {
    if (o.estado !== "retrasada" && o.prometida >= ref) return;
    const dias = Math.max(0, diasEntre(o.prometida, ref));
    a.push({ id: `lb-${o.id}`, tipo: "laboratorio", prioridad: dias > 5 ? 1 : 2, titulo: `Orden ${o.folio} retrasada`, dato: `${o.tipo} · prometida ${o.prometida} (${dias} d de retraso)`, accion: "Contacta al laboratorio y avisa al paciente de la nueva fecha." });
  });
  cortesPendientes(d, sucursalId).forEach((t) => {
    const dif = difCorte(t);
    a.push({ id: `cj-${t.id}`, tipo: "caja", prioridad: 1, titulo: `Corte con diferencia (${t.turno})`, dato: `Diferencia ${dif > 0 ? "sobrante" : "faltante"} de ${Math.abs(dif)}`, accion: "Revisa la justificación y aprueba o rechaza el corte en Caja y cartera." });
  });
  d.ciclos.filter((c) => c.sucursalId === sucursalId && c.indicadorBiologico === "pendiente").forEach((c) => {
    const dias = diasEntre(c.fecha, ref);
    a.push({ id: `es-${c.id}`, tipo: "esterilizacion", prioridad: dias >= 1 ? 1 : 2, titulo: `Ciclo ${c.folio}: biológico pendiente`, dato: `Lote ${c.lote} · ${dias >= 1 ? `hace ${dias} d` : "de hoy"}`, accion: "No uses los sets del ciclo hasta tener el resultado del indicador biológico." });
  });
  return a.sort((x, y) => x.prioridad - y.prioridad);
}

// ───────── Equipo y rotación
export function equipoSucursal(d, sucursalId) {
  return d.usuarios.filter((u) => u.rol !== "direccion" && u.rol !== "admin" && u.sucursales.includes(sucursalId) && !(u.almacenCentral));
}
/** Dónde está hoy un podólogo: sucursales con citas no canceladas hoy (y cuántas). */
export function ubicacionHoy(d, podologoId, ref = hoy()) {
  const m = new Map();
  d.citas.filter((c) => c.podologoId === podologoId && dia(c.inicio) === ref && !["cancelada", "no_asistio"].includes(c.estado)).forEach((c) => m.set(c.sucursalId, (m.get(c.sucursalId) || 0) + 1));
  return [...m].map(([sucursalId, citas]) => ({ sucursalId, citas }));
}
