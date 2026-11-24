// Motor de cálculo del dominio «desempeño» (bonos, metas y su sugerencia). Funciones PURAS sobre el estado `d`:
// no importa core.js (así la semilla puede usarlas sin dependencias circulares). Las acciones que escriben viven en acciones_desempeno.js.
//
// Atribución: la persona que vende = venta.vendedorId ?? venta.cajeroId. Cuenta la sucursal de la VENTA (no la base del empleado).
// Meses cerrados: si existen filas en d.bonos.hist para ese mes se usan (resumen por persona); si no, se calculan de d.ventas (vivo).
import { hoy, dia, redondear, dinero } from "../lib/format.js";

const pad = (n) => String(n).padStart(2, "0");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ═════════════════════════ Meses y periodos
export const mesActual = () => hoy().slice(0, 7);
export function sumarMeses(mes, n) {
  const [y, m] = mes.split("-").map(Number);
  const x = new Date(y, m - 1 + n, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}
export const mesesEntre = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
export const diasDelMes = (mes) => { const [y, m] = mes.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const finDeMes = (mes) => `${mes}-${pad(diasDelMes(mes))}`;
export const rangoMes = (mes) => ({ desde: `${mes}-01`, hasta: finDeMes(mes) });
export const nombreMes = (mes) => { const [y, m] = mes.split("-").map(Number); return `${MESES[m - 1]} ${y}`; };
export const nombreMesCorto = (mes) => { const [y, m] = mes.split("-").map(Number); return `${MESES[m - 1].slice(0, 3)} ${String(y).slice(2)}`; };
export const esMesValido = (mes) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ""));

/** Periodo que contiene `mes`: mensual = el mes; trimestral = el trimestre calendario (ene-mar, abr-jun…). */
export function periodoDe(tipo, mes) {
  if (tipo !== "trimestral") return { tipo: "mensual", clave: mes, meses: [mes], etiqueta: nombreMes(mes) };
  const [y, m] = mes.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const meses = [0, 1, 2].map((i) => `${y}-${pad(q * 3 + i + 1)}`);
  return { tipo: "trimestral", clave: `${y}-T${q + 1}`, meses, etiqueta: `T${q + 1} ${y} (${MESES[q * 3].slice(0, 3)}–${MESES[q * 3 + 2].slice(0, 3)})` };
}
/** ¿Ya terminó el periodo? (solo los periodos terminados se aprueban y pagan). */
export const periodoTerminado = (per) => per.meses[per.meses.length - 1] < mesActual();

// ═════════════════════════ Atribución de ventas
export const vendedorDe = (v) => v.vendedorId ?? v.cajeroId;
const PLANTILLA_CALZADO = ["Plantillas", "Calzado"];
const bolsa = (d) => d.bonos || { esquemas: [], metas: [], pagados: [], hist: [], propuestas: [] };

function devueltoPorVenta(d) {
  const m = new Map();
  (d.devoluciones || []).forEach((x) => {
    if (!x.ventaId || ["rechazada", "cancelada"].includes(x.estado)) return;
    m.set(x.ventaId, (m.get(x.ventaId) || 0) + (Number(x.monto ?? x.total ?? x.importe ?? 0) || 0));
  });
  return m;
}
/** Detalle atribuible de una venta: neto de devoluciones, y cuánto es producto / plantillas+calzado. */
function detalleVenta(d, v, dev) {
  const neto = Math.max(0, redondear(v.total - (dev.get(v.id) || 0)));
  const esc = v.total > 0 ? neto / v.total : 1;
  let producto = 0, pc = 0;
  (v.partidas || []).forEach((p) => {
    if (p.tipo !== "producto") return;
    producto += p.importe || 0;
    const pr = d.productos.find((x) => x.id === p.itemId);
    if (pr && PLANTILLA_CALZADO.includes(pr.categoria)) pc += p.importe || 0;
  });
  return { id: v.id, folio: v.folio, fecha: v.fecha, sucursalId: v.sucursalId, importe: neto, producto: redondear(producto * esc), plantillasCalzado: redondear(pc * esc) };
}

/**
 * Ventas atribuidas por vendedor en un rango (solo ventas vivas de d.ventas, sin canceladas, netas de devoluciones).
 * → [{ usuarioId, nVentas, total, producto, plantillasCalzado, porSucursal:{S1:{total,n}}, ventas:[{id,folio,fecha,sucursalId,importe}] }] de mayor a menor.
 */
export function ventasPorVendedor(d, { desde, hasta, sucursalId } = {}) {
  const dev = devueltoPorVenta(d);
  const m = new Map();
  d.ventas.forEach((v) => {
    if (v.estado === "cancelada") return;
    const f = dia(v.fecha);
    if ((desde && f < desde) || (hasta && f > hasta) || (sucursalId && v.sucursalId !== sucursalId)) return;
    const u = vendedorDe(v);
    if (!u) return;
    const x = detalleVenta(d, v, dev);
    const o = m.get(u) || { usuarioId: u, nVentas: 0, total: 0, producto: 0, plantillasCalzado: 0, porSucursal: {}, ventas: [] };
    o.nVentas++; o.total = redondear(o.total + x.importe); o.producto = redondear(o.producto + x.producto); o.plantillasCalzado = redondear(o.plantillasCalzado + x.plantillasCalzado);
    const ps = o.porSucursal[v.sucursalId] || (o.porSucursal[v.sucursalId] = { total: 0, n: 0 });
    ps.total = redondear(ps.total + x.importe); ps.n++;
    o.ventas.push(x);
    m.set(u, o);
  });
  const r = [...m.values()];
  r.forEach((o) => o.ventas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))));
  return r.sort((a, b) => b.total - a.total);
}

/** Días trabajados por persona y sucursal: unión de ventas, citas atendidas, turnos de caja, ciclos de esterilización y asistencia (d.rh). */
export function diasTrabajados(d, rango) {
  const m = new Map();
  const marca = (u, s, f) => {
    if (!u || !s || !f) return;
    f = dia(f);
    if (f < rango.desde || f > rango.hasta) return;
    const k = `${u}|${s}`;
    (m.get(k) || m.set(k, new Set()).get(k)).add(f);
  };
  d.ventas.forEach((v) => { if (v.estado !== "cancelada") marca(vendedorDe(v), v.sucursalId, v.fecha); });
  d.citas.forEach((c) => { if (["atendida", "en_atencion"].includes(c.estado)) marca(c.podologoId, c.sucursalId, c.inicio); });
  (d.turnos || []).forEach((t) => marca(t.cajeroId, t.sucursalId, t.abiertoEn));
  (d.ciclos || []).forEach((c) => marca(c.responsableId, c.sucursalId, c.fecha));
  const rh = d.rh;
  if (rh && Array.isArray(rh.asistencia)) {
    const uDe = new Map((rh.empleados || []).map((e) => [e.id, e.usuarioId]));
    rh.asistencia.forEach((a) => { if (["normal", "retardo"].includes(a.estado)) marca(uDe.get(a.empleadoId), a.sucursalId, a.fecha); });
  }
  return m;
}

/**
 * Filas de atribución de UN mes: [{ usuarioId, sucursalId, ventas, producto, plantillasCalzado, nVentas, dias, detalle|null, fuente }].
 * Mes con histórico en d.bonos.hist → histórico; si no → vivo (d.ventas).
 */
export function filasAtribucion(d, mes) {
  const h = (bolsa(d).hist || []).filter((x) => x.mes === mes);
  if (h.length) return h.map((x) => ({ ...x, fuente: "historico", detalle: null }));
  const rango = rangoMes(mes);
  const dev = devueltoPorVenta(d);
  const m = new Map();
  const get = (u, s) => { const k = `${u}|${s}`; return m.get(k) || m.set(k, { usuarioId: u, sucursalId: s, mes, ventas: 0, producto: 0, plantillasCalzado: 0, nVentas: 0, dias: 0, detalle: [], fuente: "vivo" }).get(k); };
  d.ventas.forEach((v) => {
    if (v.estado === "cancelada") return;
    const f = dia(v.fecha);
    if (f < rango.desde || f > rango.hasta) return;
    const u = vendedorDe(v);
    if (!u) return;
    const x = detalleVenta(d, v, dev), o = get(u, v.sucursalId);
    o.ventas = redondear(o.ventas + x.importe); o.producto = redondear(o.producto + x.producto); o.plantillasCalzado = redondear(o.plantillasCalzado + x.plantillasCalzado);
    o.nVentas++; o.detalle.push(x);
  });
  const dias = diasTrabajados(d, rango);
  dias.forEach((set, k) => { const [u, s] = k.split("|"); get(u, s).dias = set.size; });
  m.forEach((o) => o.detalle.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))));
  return [...m.values()];
}
const filasPeriodo = (d, per) => per.meses.filter((x) => x <= mesActual()).flatMap((x) => filasAtribucion(d, x));

/** Venta neta de una sucursal en un mes: del histórico mensual (d.hist) si el mes está cerrado; si no, de las ventas vivas. */
export function ventaSucursalMes(d, sucursalId, mes) {
  const h = (d.hist || []).find((x) => x.sucursalId === sucursalId && x.mes === mes);
  if (h) return h.servicios + h.plantillas + h.productos;
  const dev = devueltoPorVenta(d), r = rangoMes(mes);
  let t = 0;
  d.ventas.forEach((v) => { if (v.sucursalId === sucursalId && v.estado !== "cancelada" && dia(v.fecha) >= r.desde && dia(v.fecha) <= r.hasta) t += Math.max(0, v.total - (dev.get(v.id) || 0)); });
  return redondear(t);
}

// ═════════════════════════ Metas
export function metaSucursal(d, sucursalId, mes) {
  const m = (bolsa(d).metas || []).find((x) => x.sucursalId === sucursalId && x.mes === mes);
  return m ? m.meta : null;
}
/** Avance de una sucursal en un mes frente a su meta. Si el mes está en curso, incluye el ritmo (proyección lineal al cierre). */
export function cumplimientoSucursal(d, sucursalId, mes) {
  const real = ventaSucursalMes(d, sucursalId, mes), meta = metaSucursal(d, sucursalId, mes);
  const enCurso = mes === mesActual();
  const dm = diasDelMes(mes), dt = enCurso ? Number(hoy().slice(8, 10)) : dm;
  const proyectado = enCurso ? redondear((real / Math.max(1, dt)) * dm) : real;
  const pct = (x) => (meta ? redondear((x / meta) * 100) : null);
  return { sucursalId, mes, real, meta, pct: pct(real), enCurso, diasTranscurridos: dt, diasMes: dm, proyectado, pctProyectado: pct(proyectado) };
}
/** Meses cerrados de una sucursal en d.hist, ordenados: [{mes,total}]. */
export function serieCerrada(d, sucursalId) {
  return (d.hist || []).filter((x) => x.sucursalId === sucursalId && x.mes < mesActual()).map((x) => ({ mes: x.mes, total: x.servicios + x.plantillas + x.productos, pacientes: x.pacientes })).sort((a, b) => a.mes.localeCompare(b.mes));
}
export const LIMITE_META_MIN = 0.85, LIMITE_META_MAX = 1.25;
/**
 * Meta sugerida para `mes`: promedio móvil de los 3 últimos meses cerrados × tendencia × estacionalidad (amortiguada), con límites.
 *  - tendencia: crecimiento mensual compuesto entre los 3 últimos meses y los 3 anteriores, acotado a ±3 % por mes; se proyecta al mes meta.
 *  - estacionalidad: índice del mismo mes del año anterior ÷ promedio mensual de los meses cerrados; se aplica la mitad, acotado a 0.97–1.04.
 *  - límites: entre 85 % y 125 % del promedio móvil. Se redondea al millar.
 */
export function sugerirMeta(d, sucursalId, mes) {
  const sc = serieCerrada(d, sucursalId).filter((x) => x.mes < mes);
  if (sc.length < 3) return { ok: false, motivo: "Se necesitan al menos 3 meses cerrados de historia para sugerir una meta." };
  const prom = (a) => a.reduce((s, x) => s + x.total, 0) / a.length;
  const ult3 = sc.slice(-3), ant3 = sc.slice(-6, -3);
  const pm3 = prom(ult3);
  let g = 0;
  if (ant3.length === 3 && prom(ant3) > 0) g = Math.pow(pm3 / prom(ant3), 1 / 3) - 1;
  g = Math.max(-0.03, Math.min(0.03, g));
  const ultimo = ult3[2].mes;
  const k = mesesEntre(ultimo, mes) + 1; // del centro de la ventana (mes anterior al último) al mes meta
  const conTendencia = pm3 * Math.pow(1 + g, k);
  const haceUnAnio = sc.find((x) => x.mes === sumarMeses(mes, -12));
  const media = prom(sc.slice(-12));
  const indice = haceUnAnio && media > 0 ? haceUnAnio.total / media : null;
  const factorEst = indice ? Math.max(0.97, Math.min(1.04, 1 + 0.5 * (indice - 1))) : 1;
  const crudo = conTendencia * factorEst;
  const minimo = pm3 * LIMITE_META_MIN, maximo = pm3 * LIMITE_META_MAX;
  const acotado = Math.max(minimo, Math.min(maximo, crudo));
  const sugerida = Math.max(1000, Math.round(acotado / 1000) * 1000);
  return {
    ok: true, sucursalId, mes, sugerida, pm3: r0(pm3), mesesBase: ult3.map((x) => x.mes), tendenciaMensualPct: redondear(g * 100), mesesProyectados: k,
    conTendencia: r0(conTendencia), indiceEstacional: indice ? redondear(indice) : null, factorEstacional: redondear(factorEst), conEstacionalidad: r0(crudo),
    limites: { min: r0(minimo), max: r0(maximo) }, acotada: acotado !== crudo,
    pasos: [
      `Promedio móvil de ${ult3.map((x) => nombreMesCorto(x.mes)).join(", ")}: ${dinero(r0(pm3))}.`,
      `Tendencia: ${redondear(g * 100) >= 0 ? "+" : ""}${redondear(g * 100)} % mensual (3 meses recientes frente a 3 anteriores), proyectada ${k} meses: ${dinero(r0(conTendencia))}.`,
      indice ? `Estacionalidad: ${nombreMesCorto(haceUnAnio.mes)} vendió ${redondear(indice)} veces el promedio mensual; se aplica la mitad (factor ${redondear(factorEst)}): ${dinero(r0(crudo))}.` : "Estacionalidad: no hay el mismo mes del año anterior; no se aplica.",
      `Límites: entre ${dinero(r0(minimo))} (85 %) y ${dinero(r0(maximo))} (125 %) del promedio móvil${acotado !== crudo ? "; el resultado se acotó" : ""}.`,
    ],
  };
}
export const r0 = (n) => Math.round(Number(n) || 0);

/** Historial de metas de una sucursal: de hace 12 meses al siguiente: [{mes, real, meta, pct, enCurso, futuro}]. */
export function historialMetas(d, sucursalId, { atras = 12, adelante = 1 } = {}) {
  const act = mesActual(), r = [];
  for (let i = -atras; i <= adelante; i++) {
    const mes = sumarMeses(act, i), c = cumplimientoSucursal(d, sucursalId, mes);
    r.push({ ...c, futuro: mes > act, real: mes > act ? null : c.real });
  }
  return r;
}

/** Factor para proyectar el mes en curso al cierre (días del mes ÷ días transcurridos). */
export const factorRitmo = () => diasDelMes(mesActual()) / Math.max(1, Number(hoy().slice(8, 10)));

// ═════════════════════════ Esquemas, escalones y condiciones
export const BASES = {
  ventas: "Ventas netas atribuidas",
  producto: "Ventas de producto",
  plantillas_calzado: "Plantillas + calzado",
  cumplimiento: "Cumplimiento de la meta de la sucursal",
};
export const ROLES_ELEGIBLES = ["podologo", "cajero", "recepcion", "asistente", "almacen", "gerente"];

/** Escalón alcanzado (el mayor con desde ≤ valor) y el siguiente. */
export function escalonPara(escalones, valor) {
  const e = [...(escalones || [])].sort((a, b) => a.desde - b.desde);
  let idx = -1;
  e.forEach((x, i) => { if (valor >= x.desde) idx = i; });
  return { escalon: idx >= 0 ? e[idx] : null, numero: idx + 1, total: e.length, siguiente: e[idx + 1] || null };
}
const fmtBase = (esq, v) => (esq.base === "cumplimiento" ? `${redondear(v)} %` : dinero(v));

function rangoPeriodo(per) { return { desde: `${per.meses[0]}-01`, hasta: finDeMes(per.meses[per.meses.length - 1]) }; }

/** Asistencia del periodo (% de días con entrada sobre días con registro, sin vacaciones/incapacidad); null si no hay datos de asistencia. */
export function asistenciaPct(d, usuarioId, per) {
  const rh = d.rh;
  if (!rh || !Array.isArray(rh.asistencia) || !rh.asistencia.length) return null;
  const emp = (rh.empleados || []).filter((e) => e.usuarioId === usuarioId).map((e) => e.id);
  if (!emp.length) return null;
  const r = rangoPeriodo(per);
  let ok = 0, falta = 0;
  rh.asistencia.forEach((a) => {
    if (!emp.includes(a.empleadoId) || a.fecha < r.desde || a.fecha > r.hasta || a.fecha > hoy()) return;
    if (["normal", "retardo"].includes(a.estado)) ok++; else if (a.estado === "falta") falta++;
  });
  return ok + falta ? redondear((ok / (ok + falta)) * 100) : null;
}
/** Calificación de clientes: podólogos = promedio de «califPodologo»; resto = «califSucursal» de sus sucursales. Null si hay menos de 3 respuestas. */
export function calificacionPersona(d, usuario, per) {
  if (!Array.isArray(d.eval) || !d.eval.length) return null;
  const r = rangoPeriodo(per);
  const rs = d.eval.filter((e) => e.estado === "respondida" && dia(e.fecha) >= r.desde && dia(e.fecha) <= r.hasta
    && (usuario.rol === "podologo" ? e.podologoId === usuario.id : usuario.sucursales.includes(e.sucursalId)));
  if (rs.length < 3) return null;
  const k = usuario.rol === "podologo" ? "califPodologo" : "califSucursal";
  return redondear(rs.reduce((a, e) => a + e[k], 0) / rs.length);
}
/** Evalúa las condiciones del esquema para una persona. → { ok, detalle:[{k,texto,ok,sinDato}] } */
export function condicionesDe(d, esq, usuario, per) {
  const c = esq.condiciones || {}, det = [];
  if (c.asistenciaMin) {
    const p = asistenciaPct(d, usuario.id, per);
    det.push(p == null ? { k: "asistencia", texto: `Asistencia mínima ${c.asistenciaMin} %: sin datos de asistencia (se considera cumplida)`, ok: true, sinDato: true }
      : { k: "asistencia", texto: `Asistencia mínima ${c.asistenciaMin} %: ${p} %`, ok: p >= c.asistenciaMin });
  }
  if (c.califMin) {
    const p = calificacionPersona(d, usuario, per);
    det.push(p == null ? { k: "calificacion", texto: `Calificación de clientes mínima ${c.califMin}: sin muestra suficiente (se considera cumplida)`, ok: true, sinDato: true }
      : { k: "calificacion", texto: `Calificación de clientes mínima ${c.califMin}: ${p}`, ok: p >= c.califMin });
  }
  return { ok: det.every((x) => x.ok), detalle: det };
}

const usuarioDe = (d, id) => d.usuarios.find((u) => u.id === id);
export const esquemasActivos = (d, tipo) => (bolsa(d).esquemas || []).filter((e) => e.activo !== false && (!tipo || e.tipo === tipo));

function valorBono(esq, escalon, base, ventasRef) {
  if (!escalon) return 0;
  return escalon.tipo === "pct" ? redondear((ventasRef ?? base) * escalon.valor / 100) : redondear(escalon.valor);
}

/** Bono INDIVIDUAL de una persona para un esquema y periodo (sin consultar el libro de pagos). */
export function evaluarIndividual(d, esq, usuarioId, per) {
  const u = usuarioDe(d, usuarioId);
  const filas = filasPeriodo(d, per).filter((f) => f.usuarioId === usuarioId);
  const campo = { ventas: "ventas", producto: "producto", plantillas_calzado: "plantillasCalzado" }[esq.base] || "ventas";
  const base = redondear(filas.reduce((a, f) => a + (f[campo] || 0), 0));
  const { escalon, numero, total, siguiente } = escalonPara(esq.escalones, base);
  const bruto = valorBono(esq, escalon, base);
  const topado = esq.tope != null && bruto > esq.tope;
  const calculado = topado ? esq.tope : bruto;
  const cond = u ? condicionesDe(d, esq, u, per) : { ok: true, detalle: [] };
  const bono = cond.ok ? calculado : 0;
  let proyeccion = null;
  if (per.meses.includes(mesActual()) && factorRitmo() > 1) {
    const parte = filas.filter((x) => x.mes === mesActual()).reduce((a, f) => a + (f[campo] || 0), 0);
    const bp = redondear(base + parte * (factorRitmo() - 1)), ep = escalonPara(esq.escalones, bp);
    let b = valorBono(esq, ep.escalon, bp);
    if (esq.tope != null) b = Math.min(b, esq.tope);
    proyeccion = { base: bp, numeroEscalon: ep.numero, bono: cond.ok ? b : 0 };
  }
  const porSucursal = {};
  filas.forEach((f) => { const o = porSucursal[f.sucursalId] || (porSucursal[f.sucursalId] = { ventas: 0, base: 0, nVentas: 0, dias: 0 }); o.ventas = redondear(o.ventas + f.ventas); o.base = redondear(o.base + (f[campo] || 0)); o.nVentas += f.nVentas; o.dias += f.dias; });
  const ventas = filas.flatMap((f) => f.detalle || []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const fuenteHistorica = filas.some((f) => f.fuente === "historico");
  let formula;
  if (!escalon) formula = `Sin escalón: la base ${fmtBase(esq, base)} no llega al primer escalón (${fmtBase(esq, (esq.escalones[0] || {}).desde || 0)}).`;
  else formula = `Escalón ${numero} de ${total} (desde ${fmtBase(esq, escalon.desde)}): ` + (escalon.tipo === "pct" ? `${escalon.valor} % × ${fmtBase(esq, base)} = ${dinero(bruto)}` : `monto fijo ${dinero(bruto)}`)
    + (topado ? `; tope ${dinero(esq.tope)}` : "") + (!cond.ok ? "; condición no cumplida: bono en $0" : "");
  return {
    esquemaId: esq.id, nombre: esq.nombre, tipo: "individual", periodo: per.tipo, periodoClave: per.clave, etiquetaPeriodo: per.etiqueta, usuarioId, base, baseEtiqueta: BASES[esq.base], nVentas: filas.reduce((a, f) => a + f.nVentas, 0),
    escalon, numeroEscalon: numero, totalEscalones: total, siguiente, faltante: siguiente ? redondear(siguiente.desde - base) : 0,
    bruto, topado, tope: esq.tope ?? null, condiciones: cond, bono, formula, ventas, fuenteHistorica, porSucursal, proyeccion,
  };
}

/** Bono de SUCURSAL (bolsa por cumplimiento de meta o por ventas) y su reparto entre quienes trabajaron en ella. */
export function evaluarSucursal(d, esq, sucursalId, per) {
  const meses = per.meses.filter((m) => m <= mesActual());
  const conMeta = meses.filter((m) => metaSucursal(d, sucursalId, m) != null);
  const venta = redondear(conMeta.reduce((a, m) => a + ventaSucursalMes(d, sucursalId, m), 0));
  const meta = redondear(conMeta.reduce((a, m) => a + metaSucursal(d, sucursalId, m), 0));
  const pct = meta ? redondear((venta / meta) * 100) : 0;
  const filasSuc = meses.flatMap((m) => filasAtribucion(d, m)).filter((f) => f.sucursalId === sucursalId);
  const ventasSuc = esq.base === "cumplimiento" || esq.base === "ventas" ? (esq.base === "ventas" ? redondear(meses.reduce((a, m) => a + ventaSucursalMes(d, sucursalId, m), 0)) : venta)
    : redondear(filasSuc.reduce((a, f) => a + (esq.base === "producto" ? f.producto : f.plantillasCalzado), 0));
  const base = esq.base === "cumplimiento" ? pct : ventasSuc;
  const { escalon, numero, total, siguiente } = escalonPara(esq.escalones, base);
  const bruto = valorBono(esq, escalon, base, esq.base === "cumplimiento" ? venta : ventasSuc);
  const topado = esq.tope != null && bruto > esq.tope;
  const bolsaTotal = topado ? esq.tope : bruto;
  let proyeccion = null;
  if (conMeta.includes(mesActual()) && factorRitmo() > 1) {
    const vAct = ventaSucursalMes(d, sucursalId, mesActual()), fv = factorRitmo() - 1;
    const ventaP = redondear(venta + vAct * fv), pctP = meta ? redondear((ventaP / meta) * 100) : 0;
    const baseP = esq.base === "cumplimiento" ? pctP : base + (esq.base === "ventas" ? vAct * fv : 0);
    const ep = escalonPara(esq.escalones, baseP);
    let b = valorBono(esq, ep.escalon, baseP, esq.base === "cumplimiento" ? ventaP : ventasSuc);
    if (esq.tope != null) b = Math.min(b, esq.tope);
    proyeccion = { venta: ventaP, pct: pctP, numeroEscalon: ep.numero, bolsa: b };
  }
  // Quiénes trabajaron: rol elegible y días trabajados en ESTA sucursal en el periodo (ventas, citas, caja, esterilización, asistencia).
  const dias = new Map();
  filasSuc.forEach((f) => dias.set(f.usuarioId, (dias.get(f.usuarioId) || 0) + (f.dias || 0)));
  const candidatos = [...dias.entries()].filter(([, n]) => n > 0).map(([id, n]) => ({ u: usuarioDe(d, id), dias: n })).filter((x) => x.u && esq.roles.includes(x.u.rol));
  const evaluados = candidatos.map((x) => ({ usuarioId: x.u.id, rol: x.u.rol, dias: x.dias, cond: condicionesDe(d, esq, x.u, per) }));
  const cumplen = evaluados.filter((x) => x.cond.ok), sumaDias = cumplen.reduce((a, x) => a + x.dias, 0);
  let reparto = evaluados.map((x) => ({ usuarioId: x.usuarioId, rol: x.rol, dias: x.dias, condiciones: x.cond, excluido: !x.cond.ok, monto: x.cond.ok && sumaDias ? redondear((bolsaTotal * x.dias) / sumaDias) : 0 }));
  const repartido = redondear(reparto.reduce((a, x) => a + x.monto, 0));
  if (sumaDias && reparto.length) { // el centavo que sobra va a quien más trabajó
    const m = reparto.filter((x) => !x.excluido).sort((a, b) => b.dias - a.dias)[0];
    if (m) m.monto = redondear(m.monto + (bolsaTotal - repartido));
  }
  reparto = reparto.sort((a, b) => b.dias - a.dias);
  let formula;
  if (!conMeta.length) formula = "Sin meta registrada en el periodo: no se puede evaluar el cumplimiento.";
  else if (!escalon) formula = `Sin escalón: ${fmtBase(esq, base)} no llega al primer escalón (${fmtBase(esq, (esq.escalones[0] || {}).desde || 0)}).`;
  else formula = `${esq.base === "cumplimiento" ? `Cumplimiento ${pct} % (${dinero(venta)} de ${dinero(meta)}). ` : ""}Escalón ${numero} de ${total}: ` + (escalon.tipo === "pct" ? `${escalon.valor} % × ${dinero(esq.base === "cumplimiento" ? venta : ventasSuc)} = ${dinero(bruto)}` : `bolsa fija ${dinero(bruto)}`) + (topado ? `; tope ${dinero(esq.tope)}` : "");
  return {
    esquemaId: esq.id, nombre: esq.nombre, tipo: "sucursal", periodo: per.tipo, periodoClave: per.clave, etiquetaPeriodo: per.etiqueta, sucursalId,
    venta, meta, pct, base, baseEtiqueta: BASES[esq.base], mesesConMeta: conMeta, escalon, numeroEscalon: numero, totalEscalones: total, siguiente, faltante: siguiente ? redondear(siguiente.desde - base) : 0,
    bruto, topado, tope: esq.tope ?? null, bolsa: conMeta.length ? bolsaTotal : 0, reparto, sinTrabajadores: !reparto.length, sinRepartible: reparto.length > 0 && !sumaDias, formula, proyeccion,
  };
}

// ═════════════════════════ Libro de bonos (calculado → aprobado → pagado)
export function registroBono(d, { esquemaId, periodoClave, usuarioId = null, sucursalId = null }) {
  return (bolsa(d).pagados || []).find((x) => x.esquemaId === esquemaId && x.periodoClave === periodoClave && (x.tipo === "individual" ? x.usuarioId === usuarioId : x.sucursalId === sucursalId)) || null;
}
/** Aplica el libro: si el bono ya fue aprobado/pagado, manda el monto congelado. */
function conEstado(d, item) {
  const reg = registroBono(d, { esquemaId: item.esquemaId, periodoClave: item.periodoClave, usuarioId: item.usuarioId, sucursalId: item.sucursalId });
  if (!reg) return { ...item, estado: "calculado", registro: null };
  const r = { ...item, estado: reg.estado, registro: reg };
  if (item.tipo === "individual") r.bonoCalculado = item.bono, r.bono = reg.bono;
  else r.bolsaCalculada = item.bolsa, r.bolsa = reg.bono, r.reparto = reg.reparto || item.reparto;
  return r;
}
export const evaluarIndividualConEstado = (d, esq, usuarioId, per) => conEstado(d, evaluarIndividual(d, esq, usuarioId, per));
export const evaluarSucursalConEstado = (d, esq, sucursalId, per) => conEstado(d, evaluarSucursal(d, esq, sucursalId, per));

/**
 * Bonos de una persona para el periodo que contiene `mes` (cada esquema en su propio periodo: mensual o trimestral).
 * → { usuarioId, mes, elegible, items:[…], total, totalPorPagar, totalPagado }
 *   items individuales: base, escalón, bono, faltante, condiciones, ventas atribuidas, fórmula, estado.
 *   items de sucursal: bolsa, cumplimiento y la parte que le toca (`monto`).
 */
export function bonosDe(d, { usuarioId, mes }) {
  const u = usuarioDe(d, usuarioId);
  if (!u) return { usuarioId, mes, elegible: false, items: [], total: 0, totalPorPagar: 0, totalPagado: 0 };
  const items = [];
  esquemasActivos(d).forEach((esq) => {
    if (!esq.roles.includes(u.rol)) return;
    const per = periodoDe(esq.periodo, mes);
    if (esq.tipo === "individual") items.push({ ...evaluarIndividualConEstado(d, esq, usuarioId, per), monto: undefined });
    else {
      d.sucursales.forEach((s) => {
        const it = evaluarSucursalConEstado(d, esq, s.id, per);
        const mio = it.reparto.find((x) => x.usuarioId === usuarioId);
        if (mio) items.push({ ...it, monto: mio.monto, miDias: mio.dias, miCondicion: mio.condiciones, excluido: !!mio.excluido });
      });
    }
  });
  items.forEach((x) => { x.bonoPersona = x.tipo === "individual" ? x.bono : x.monto; });
  const suma = (a) => redondear(a.reduce((s, x) => s + x.bonoPersona, 0));
  return { usuarioId, mes, elegible: items.length > 0 || esquemasActivos(d).some((e) => e.roles.includes(u.rol)), items, total: suma(items), totalPorPagar: suma(items.filter((x) => x.estado !== "pagado")), totalPagado: suma(items.filter((x) => x.estado === "pagado")) };
}

/** Resumen del periodo para administración/gerencia: individuales (por persona y esquema) y de sucursal. */
export function resumenPeriodo(d, { mes, periodo = "mensual", sucursalIds = null }) {
  const individuales = [], sucursales = [];
  const dentro = (u) => !sucursalIds || u.sucursales.some((s) => sucursalIds.includes(s));
  esquemasActivos(d).filter((e) => e.periodo === periodo).forEach((esq) => {
    const per = periodoDe(esq.periodo, mes);
    if (esq.tipo === "individual") {
      d.usuarios.filter((u) => u.activo !== false && esq.roles.includes(u.rol) && dentro(u)).forEach((u) => individuales.push(evaluarIndividualConEstado(d, esq, u.id, per)));
    } else {
      d.sucursales.filter((s) => !sucursalIds || sucursalIds.includes(s.id)).forEach((s) => sucursales.push(evaluarSucursalConEstado(d, esq, s.id, per)));
    }
  });
  const sum = (a, f) => redondear(a.reduce((s, x) => s + f(x), 0));
  return {
    mes, periodo, individuales, sucursales,
    totalIndividual: sum(individuales, (x) => x.bono), totalSucursal: sum(sucursales, (x) => x.bolsa),
    porEstado: ["calculado", "aprobado", "pagado"].map((e) => ({ estado: e, n: individuales.filter((x) => x.estado === e).length + sucursales.filter((x) => x.estado === e).length })),
  };
}

/** Historial de bonos PAGADOS (o aprobados) de una persona: individuales y su parte de bolsas de sucursal. */
export function historialBonosDe(d, usuarioId) {
  const r = [];
  (bolsa(d).pagados || []).forEach((x) => {
    const esq = (bolsa(d).esquemas || []).find((e) => e.id === x.esquemaId);
    if (x.tipo === "individual" && x.usuarioId === usuarioId) r.push({ id: x.id, esquemaId: x.esquemaId, nombre: esq ? esq.nombre : x.esquemaId, tipo: "individual", periodoClave: x.periodoClave, sucursalId: null, monto: x.bono, estado: x.estado, pagadoEn: x.pagadoEn || null, aprobadoEn: x.aprobadoEn || null });
    if (x.tipo === "sucursal") { const m = (x.reparto || []).find((y) => y.usuarioId === usuarioId); if (m && m.monto > 0) r.push({ id: x.id, esquemaId: x.esquemaId, nombre: esq ? esq.nombre : x.esquemaId, tipo: "sucursal", periodoClave: x.periodoClave, sucursalId: x.sucursalId, monto: m.monto, estado: x.estado, pagadoEn: x.pagadoEn || null, aprobadoEn: x.aprobadoEn || null }); }
  });
  return r.sort((a, b) => b.periodoClave.localeCompare(a.periodoClave));
}
