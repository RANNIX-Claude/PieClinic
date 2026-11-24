// Acciones y consultas del dominio «tesorería» (porte de Pie Firme: Dashboard, ResumenSemanal, Ingresos, Conciliación, FondoRevolvente,
// CuentasPagarCobrar y Cierres). Las reglas puras viven en reglas_tesoreria.js; aquí se valida el rol, el periodo cerrado y se audita.
// Cada sucursal es una unidad de costo (como cada local de una plaza en IRP); el consolidado es la suma de las sucursales.
//
// API para otros dominios:
//   periodoCerrado(d, sucursalId, fecha) → boolean   (P-099: un periodo cerrado es de solo lectura; sin sucursal = toda la cadena cerrada)
//   ingresosDe(d, { desde, hasta, sucursalId })     → cobros consolidados (ventas, anticipos, abonos, enganches, pedidos en línea, convenios)
// Permisos: gerente → dashboard, resumen semanal y fondo de SU sucursal; admin y dirección → todo; cerrar periodos admin/dirección;
// reabrir un periodo solo Dirección, con motivo.
import { hoy, redondear, sumarDias, ahoraLocal, dia } from "../lib/format.js";
import * as R from "./reglas.js";
import * as T from "./reglas_tesoreria.js";
import { auditar, uid } from "./core.js";
import * as F from "./acciones_finanzas.js";
import { aCSV, registrarPagoCxp, ocupacionDetalle, ticketPromedio, pacientesAtendidos } from "./acciones_admin.js";

export * from "./reglas_tesoreria.js";
export { periodoCerrado } from "./reglas_tesoreria.js";

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const num = (x) => (x === "" || x === null || x === undefined ? NaN : Number(String(x).replace(/[$,\s]/g, "")));
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f)) && !Number.isNaN(Date.parse(`${f}T00:00:00`));
const lista = (d, k) => ((d.tes ||= {})[k] ||= []);
const dinero = (n) => (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

// ═════════════════════════ Permisos
export const usuarioDe = F.usuarioDe;
export const esCentral = F.esCentral;
export const esDireccion = (u) => !!u && u.rol === "direccion";
/** Pantallas del dominio y quién las ve. */
export const PANTALLAS_TES = {
  dashboard: ["gerente", "admin", "direccion"], "resumen-semanal": ["gerente", "admin", "direccion"], fondo: ["gerente", "admin", "direccion"],
  ingresos: ["admin", "direccion"], cuentas: ["admin", "direccion"], conciliacion: ["admin", "direccion"], cierres: ["admin", "direccion"],
};
/** ¿Puede el usuario ver esa pantalla (y esa sucursal; null = consolidado)? */
export function puedeVer(u, pantalla, sucursalId = null) {
  if (!u || !(PANTALLAS_TES[pantalla] || []).includes(u.rol)) return false;
  if (esCentral(u)) return true;
  return !!sucursalId && u.sucursales.includes(sucursalId); // el gerente: solo su sucursal, nunca el consolidado
}
export function sucursalesTes(d, u, pantalla) {
  if (!u || !(PANTALLAS_TES[pantalla] || []).includes(u.rol)) return [];
  return esCentral(u) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
}
const MSG_ROL = {
  gerente: "El gerente solo ve la información de su propia sucursal.",
  otro: "Esta información es para la gerencia de la sucursal, Administración central y Dirección.",
  central: "Esta acción es de Administración central o Dirección.",
};
function permiso(d, pantalla, sucursalId) {
  if (!d.sesion || !d.sesion.userId) return ok({ u: null }); // sin sesión: cálculo libre (pruebas, otros dominios)
  const u = usuarioDe(d);
  if (puedeVer(u, pantalla, sucursalId)) return ok({ u });
  return err(u && u.rol === "gerente" && (PANTALLAS_TES[pantalla] || []).includes("gerente") ? MSG_ROL.gerente : (PANTALLAS_TES[pantalla] || []).includes("gerente") ? MSG_ROL.otro : MSG_ROL.central);
}
const central = (d) => { const u = usuarioDe(d); return esCentral(u) ? ok({ u }) : err(MSG_ROL.central); };
const deSucursal = (d, sucursalId) => {
  const u = usuarioDe(d); if (!u) return err("Inicia sesión.");
  if (esCentral(u) || (u.rol === "gerente" && u.sucursales.includes(sucursalId))) return ok({ u });
  return err(u.rol === "gerente" ? MSG_ROL.gerente : MSG_ROL.otro);
};
const cerrado = (d, sucursalId, fecha) => (T.periodoCerrado(d, sucursalId, fecha) ? err(T.MSG_PERIODO_CERRADO) : null);

// ═════════════════════════ Dashboard financiero (ingresos, gastos, utilidad, flujo, cartera, CxP, KPIs)
/**
 * Tablero de un mes para una sucursal o el consolidado (null). Ingresos y utilidad salen del estado de resultados de finanzas
 * (no se duplican); el flujo es lo efectivamente cobrado (ingresosDe) contra lo pagado (gastos y pagos a proveedores).
 */
export function dashboardFinanciero(d, { mes = F.mesActual(), sucursalId = null, ref = hoy() } = {}) {
  const p = permiso(d, "dashboard", sucursalId); if (!p.ok) return p;
  const edr = F.estadoResultados(d, { mes, sucursalId }); if (!edr.ok) return edr;
  const tot = (m) => { const e = F.estadoResultados(d, { mes: m, sucursalId }); return e.ok && !e.sinDatos ? e.totales : null; };
  const ant = tot(F.mesRelativo(mes, -1)), anioAnt = tot(F.mesRelativo(mes, -12));
  const gastosDe = (t) => (t ? redondear(t.gastosVariables + t.gastosOperacion) : 0);
  const serie = [-5, -4, -3, -2, -1, 0].map((k) => { const m = F.mesRelativo(mes, k); const t = k === 0 ? edr.totales : tot(m); return { mes: m, ingresos: t ? t.ingresos : 0, gastos: gastosDe(t), utilidad: t ? t.utilidadOperativa : 0 }; });
  const r = T.rangoMes(mes); const hasta = r.hasta > ref ? ref : r.hasta;
  const filas = r.desde <= hasta ? T.ingresosDe(d, { desde: r.desde, hasta, sucursalId }) : [];
  const ti = T.totalesIngresos(filas);
  const gastos = ((d.fin && d.fin.gastos) || []).filter((g) => T.enRango(g.fecha, r.desde, hasta) && (!sucursalId || g.sucursalId === sucursalId));
  const pagosProv = sucursalId ? [] : (d.cxp || []).flatMap((c) => (c.pagos || []).filter((x) => T.enRango(x.fecha, r.desde, hasta)).map((x) => ({ fecha: dia(x.fecha), monto: x.monto })));
  const salidasG = redondear(gastos.reduce((a, g) => a + g.monto, 0)), salidasP = redondear(pagosProv.reduce((a, x) => a + x.monto, 0));
  const diario = [];
  for (let f = r.desde; f <= hasta; f = sumarDias(f, 1)) {
    diario.push({ fecha: f, entradas: ti.porDia[f] || 0, salidas: redondear(gastos.filter((g) => g.fecha === f).reduce((a, g) => a + g.monto, 0) + pagosProv.filter((x) => x.fecha === f).reduce((a, x) => a + x.monto, 0)) });
  }
  const cxc = T.cuentasPorCobrar(d, { sucursalId, ref });
  const cxpTodas = sucursalId ? [] : T.cuentasPorPagar(d, { ref });
  const lim = sumarDias(ref, T.paramsTes(d).cxpDiasPorVencer);
  const per = { desde: r.desde, hasta };
  const ocup = ocupacionDetalle(d, per, sucursalId);
  const meta = T.paramsTes(d).metaOcupacion;
  const sucs = d.sucursales.filter((s) => !sucursalId || s.id === sucursalId);
  const rs = F.resumenSucursales(d, mes);
  const porSucursal = sucs.map((s) => {
    const x = (rs.ok ? rs.sucursales : []).find((y) => y.sucursalId === s.id) || {};
    const o = ocupacionDetalle(d, per, s.id);
    const fo = T.fondoDe(d, s.id); const ef = fo ? T.estadoFondo(d, fo.id) : null;
    const ag = T.antiguedad(T.cuentasPorCobrar(d, { sucursalId: s.id, ref }));
    return {
      sucursalId: s.id, nombre: s.nombre, ingresos: x.ingresos || 0, gastos: redondear((x.gastosVariables || 0) + (x.gastosOperacion || 0)), utilidad: x.utilidadOperativa || 0, margen: x.margen || 0,
      cobrado: T.totalesIngresos(filas.filter((f) => f.sucursalId === s.id)).total, ocupacion: o.pct, cumpleMeta: o.pct >= meta, carteraVencida: ag.vencido, fondoUso: ef ? ef.uso.pct : 0,
    };
  });
  const fondos = sucs.map((s) => T.fondoDe(d, s.id)).filter(Boolean).map((f) => T.estadoFondo(d, f.id));
  return ok({
    mes, parcial: edr.parcial, sucursalId, nombre: edr.nombre,
    totales: { ...edr.totales, gastos: gastosDe(edr.totales) },
    comparativo: {
      mesAnterior: ant ? { ingresos: ant.ingresos, gastos: gastosDe(ant), utilidad: ant.utilidadOperativa, varIngresos: T.variacionPeriodo(edr.totales.ingresos, ant.ingresos), varUtilidad: T.variacionPeriodo(edr.totales.utilidadOperativa, ant.utilidadOperativa) } : null,
      anioAnterior: anioAnt ? { ingresos: anioAnt.ingresos, utilidad: anioAnt.utilidadOperativa, varIngresos: T.variacionPeriodo(edr.totales.ingresos, anioAnt.ingresos) } : null,
    },
    serie,
    flujo: { entradas: ti.total, porForma: ti.porForma, porOrigen: ti.porOrigen, gastos: salidasG, pagosProveedores: salidasP, salidas: redondear(salidasG + salidasP), neto: redondear(ti.total - salidasG - salidasP), diario },
    cartera: { ...T.antiguedad(cxc), n: cxc.length, mayores: [...cxc].sort((a, b) => b.diasVencido - a.diasVencido || b.saldo - a.saldo).slice(0, 5) },
    cxp: sucursalId ? null : { total: redondear(cxpTodas.reduce((a, c) => a + c.saldo, 0)), proximas: cxpTodas.filter((c) => c.vence <= lim), vencido: redondear(cxpTodas.filter((c) => c.vence < ref).reduce((a, c) => a + c.saldo, 0)) },
    kpis: {
      ocupacion: ocup.pct, metaOcupacion: meta, cumpleMeta: ocup.pct >= meta, ticket: ticketPromedio(d, per, sucursalId), pacientes: pacientesAtendidos(d, per, sucursalId),
      margen: edr.totales.margen, cobros: ti.n,
    },
    porSucursal,
    fondo: { saldo: redondear(fondos.reduce((a, f) => a + f.saldo, 0)), porReponer: redondear(fondos.reduce((a, f) => a + f.porReponer, 0)), alertas: fondos.filter((f) => f.uso.alerta).length },
    pendientes: T.resumenSemana(d, { inicio: ref, sucursalId, ref }).pendientes,
  });
}

// ═════════════════════════ Resumen semanal (sábado → viernes)
export function resumenSemanal(d, { inicio = hoy(), sucursalId = null, ref = hoy() } = {}) {
  const p = permiso(d, "resumen-semanal", sucursalId); if (!p.ok) return p;
  const r = T.resumenSemana(d, { inicio, sucursalId, ref });
  return ok({ ...r, porSucursal: sucursalId ? null : T.resumenSemanaPorSucursal(d, r.semana.inicio, d.sucursales, ref), cortesSinDeposito: T.cortesSinDeposito(d, sucursalId), semanaCerrada: sucursalId ? T.periodoCerrado(d, sucursalId, r.semana.fin) : false });
}
export function csvResumenSemanal(res) {
  const cols = [{ k: "nombre", l: `Resumen semanal ${res.semana.etiqueta} ${res.semana.inicio} a ${res.semana.fin}` }, { k: "ingresos", l: "Cobrado" }, { k: "efectivo", l: "Efectivo" }, { k: "tarjeta", l: "Tarjeta" }, { k: "transferencia", l: "Transferencia" }, { k: "enLinea", l: "En línea" }, { k: "gastos", l: "Gastos" }, { k: "depositado", l: "Depositado" }, { k: "porDepositar", l: "Por depositar" }, { k: "diferencia", l: "Diferencias de caja" }, { k: "neto", l: "Neto" }];
  const filas = res.porSucursal ? [...res.porSucursal.filas, res.porSucursal.consolidado] : [];
  return aCSV(cols, filas);
}

// ═════════════════════════ Ingresos consolidados
export function ingresos(d, { desde = null, hasta = null, sucursalId = null, forma = "", origen = "", texto = "" } = {}) {
  const p = permiso(d, "ingresos", sucursalId); if (!p.ok) return p;
  const t = String(texto || "").trim().toLowerCase();
  const filas = T.ingresosDe(d, { desde, hasta, sucursalId }).filter((f) => (!forma || f.forma === forma) && (!origen || f.origen === origen)
    && (!t || `${f.folio} ${f.concepto} ${T.quienPaga(d, f)} ${f.referencia}`.toLowerCase().includes(t)));
  return ok({ filas, totales: T.totalesIngresos(filas) });
}
export function csvIngresos(d, filas) {
  return aCSV([
    { k: "fecha", l: "Fecha" }, { k: "hora", l: "Hora" }, { k: "suc", l: "Sucursal" }, { k: "origen", l: "Origen" }, { k: "folio", l: "Folio" }, { k: "quien", l: "Paga" },
    { k: "concepto", l: "Concepto" }, { k: "forma", l: "Forma de pago" }, { k: "monto", l: "Importe" }, { k: "referencia", l: "Referencia" }, { k: "usuario", l: "Registró" },
  ], filas.map((f) => ({ ...f, suc: R.nombreSucursal(d, f.sucursalId), origen: T.ORIGENES[f.origen] || f.origen, quien: T.quienPaga(d, f), forma: T.formaLabel(f.forma), usuario: f.usuarioId ? R.nombreUsuario(d, f.usuarioId) : "" })));
}

// ═════════════════════════ Depósitos de efectivo (ficha de depósito por corte o por día)
export function registrarDeposito(d, { sucursalId, diaVenta, fecha = hoy(), monto, referencia = "", turnoId = null }) {
  const pr = deSucursal(d, sucursalId); if (!pr.ok) return pr;
  if (!fechaOk(diaVenta) || !fechaOk(fecha)) return err("Fecha no válida.");
  if (fecha > hoy() || diaVenta > fecha) return err("La fecha del depósito no puede ser futura ni anterior al día de venta.");
  const e = cerrado(d, sucursalId, diaVenta); if (e) return e;
  const m = redondear(num(monto));
  if (!(m > 0)) return err("El monto del depósito debe ser mayor que cero.");
  const ref = String(referencia || "").trim() || T.refDeposito(sucursalId, diaVenta);
  if (turnoId) {
    const t = (d.turnos || []).find((x) => x.id === turnoId);
    if (!t || t.sucursalId !== sucursalId || !t.corte) return err("El corte no es de esta sucursal o no está cerrado.");
    if (lista(d, "depositos").some((x) => x.turnoId === turnoId)) return err("Ese corte ya tiene ficha de depósito.");
  }
  const cta = T.cuentaDeSucursal(d, sucursalId);
  const dp = { id: uid("DP"), sucursalId, fecha, diaVenta, monto: m, referencia: ref, turnoId: turnoId || null, cuentaId: cta ? cta.id : null, registradoPor: pr.u.id, registradoEn: ahoraLocal() };
  lista(d, "depositos").push(dp);
  auditar(d, "deposito_registrado", "deposito", dp.id, `${R.nombreSucursal(d, sucursalId)} · ${dinero(m)} · ${ref}`);
  return ok({ deposito: dp });
}

// ═════════════════════════ Bancos y conciliación (P-094, P-096) — solo Administración central y Dirección
export function guardarCuenta(d, { id = null, alias, banco, numero, sucursalId = null, saldoInicial = 0, saldoFecha = hoy(), activa = true }) {
  const pr = central(d); if (!pr.ok) return pr;
  if (!String(alias || "").trim() || !String(banco || "").trim() || !String(numero || "").trim()) return err("Escribe alias, banco y número de cuenta.");
  if (sucursalId && !d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  if (!fechaOk(saldoFecha)) return err("Fecha del saldo inicial no válida.");
  const si = redondear(num(saldoInicial)); if (!Number.isFinite(si)) return err("Saldo inicial no válido.");
  const cuentas = lista(d, "cuentas");
  let c = id && cuentas.find((x) => x.id === id);
  if (id && !c) return err("No se encontró la cuenta.");
  if (activa && cuentas.some((x) => x.id !== id && x.activa !== false && (x.sucursalId || null) === (sucursalId || null))) return err(sucursalId ? "La sucursal ya tiene una cuenta activa." : "Ya existe una cuenta concentradora activa.");
  if (!c) { c = { id: uid("CB"), moneda: "MXN" }; cuentas.push(c); }
  Object.assign(c, { alias: String(alias).trim(), banco: String(banco).trim(), numero: String(numero).trim(), sucursalId: sucursalId || null, saldoInicial: si, saldoFecha, activa: !!activa });
  auditar(d, id ? "cuenta_bancaria_editada" : "cuenta_bancaria_creada", "cuenta_bancaria", c.id, `${c.alias} · ${c.banco}`);
  return ok({ cuenta: c });
}

/** Importa las filas ya mapeadas de un estado de cuenta (aplicarMapeo). No duplica movimientos ya importados. */
export function importarEstadoCuenta(d, { cuentaId, archivo = "estado_de_cuenta.csv", filas = [], errores = 0 }) {
  const pr = central(d); if (!pr.ok) return pr;
  const c = T.cuentaBancaria(d, cuentaId); if (!c) return err("Elige la cuenta bancaria.");
  if (!filas.length) return err("El archivo no trae movimientos válidos.");
  const movs = lista(d, "movimientos");
  const clave = (m) => `${m.fecha}|${redondear(m.monto)}|${String(m.referencia || "").trim().toUpperCase()}|${String(m.descripcion || "").trim().toUpperCase()}`;
  const ya = new Set(movs.filter((m) => m.cuentaId === cuentaId).map(clave));
  const imp = { id: uid("EC"), cuentaId, archivo: String(archivo).slice(0, 120), importadoEn: ahoraLocal(), importadoPor: pr.u.id, desde: null, hasta: null, filas: 0, errores: Number(errores) || 0, duplicados: 0, cerradas: 0 };
  filas.forEach((f) => {
    if (!fechaOk(f.fecha) || !(Math.abs(Number(f.monto)) > 0)) { imp.errores++; return; }
    if (T.conciliacionCerrada(d, cuentaId, f.fecha)) { imp.cerradas++; return; }
    const m = { id: uid("MB"), cuentaId, fecha: f.fecha, descripcion: String(f.descripcion || "").trim(), referencia: String(f.referencia || "").trim(), monto: redondear(f.monto), importacionId: imp.id, estado: "detectado", vinculos: [], regla: null, conciliadoPor: null, conciliadoEn: null };
    const k = clave(m);
    if (ya.has(k)) { imp.duplicados++; return; }
    ya.add(k); movs.push(m); imp.filas++;
    if (!imp.desde || m.fecha < imp.desde) imp.desde = m.fecha;
    if (!imp.hasta || m.fecha > imp.hasta) imp.hasta = m.fecha;
  });
  lista(d, "estados").unshift(imp);
  auditar(d, "estado_cuenta_importado", "cuenta_bancaria", cuentaId, `${imp.archivo}: ${imp.filas} nuevos, ${imp.duplicados} duplicados, ${imp.errores} con error${imp.cerradas ? `, ${imp.cerradas} en mes cerrado` : ""}`);
  return ok({ importacion: imp });
}

export function conciliarAuto(d, { cuentaId, desde = null, hasta = null }) {
  const pr = central(d); if (!pr.ok) return pr;
  if (!T.cuentaBancaria(d, cuentaId)) return err("Elige la cuenta bancaria.");
  const res = T.conciliarAutomatico(d, cuentaId, { desde, hasta, usuarioId: pr.u.id, ahora: ahoraLocal() }); // no toca meses ya cerrados
  auditar(d, "conciliacion_automatica", "cuenta_bancaria", cuentaId, `${res.conciliados} conciliados (${res.porReferencia} por referencia, ${res.porMontoFecha} por monto y fecha), ${res.ambiguos} ambiguos, ${res.sinPartida} sin partida`);
  return ok({ resultado: res });
}

/** Partidas en libros que pueden casar con un movimiento (mes del movimiento ± tolerancia). */
export function partidasParaMovimiento(d, movId) {
  const m = lista(d, "movimientos").find((x) => x.id === movId); if (!m) return [];
  const tol = T.paramsTes(d).toleranciaDias;
  return T.partidasLibro(d, m.cuentaId, { desde: sumarDias(m.fecha, -31), hasta: sumarDias(m.fecha, tol), conGastos: true }).filter((p) => !p.conciliada && Math.sign(p.monto) === Math.sign(m.monto));
}
/** Conciliación manual: una o varias partidas cuya suma es exactamente el monto del movimiento. */
export function conciliarManual(d, { movId, keys = [] }) {
  const pr = central(d); if (!pr.ok) return pr;
  const m = lista(d, "movimientos").find((x) => x.id === movId); if (!m) return err("No se encontró el movimiento.");
  if (T.conciliacionCerrada(d, m.cuentaId, m.fecha)) return err("La conciliación de ese mes está cerrada.");
  if (m.estado === "conciliado") return err("El movimiento ya está conciliado.");
  if (!keys.length) return err("Elige al menos una partida.");
  const libres = partidasParaMovimiento(d, movId);
  const sel = keys.map((k) => libres.find((p) => p.key === k));
  if (sel.some((x) => !x)) return err("Alguna partida ya está conciliada o no corresponde a esta cuenta.");
  const suma = redondear(sel.reduce((a, p) => a + p.monto, 0));
  if (Math.abs(suma - m.monto) > 0.009) return err(`Las partidas suman ${dinero(suma)} y el banco trae ${dinero(m.monto)}: deben ser iguales.`);
  Object.assign(m, { estado: "conciliado", vinculos: sel.map((p) => ({ key: p.key, tipo: p.tipo, monto: p.monto, descripcion: p.descripcion })), regla: "manual", conciliadoPor: pr.u.id, conciliadoEn: ahoraLocal() });
  auditar(d, "conciliacion_manual", "movimiento_bancario", m.id, `${m.descripcion} ${dinero(m.monto)} ↔ ${sel.length} partida(s)`);
  return ok({ movimiento: m });
}
export function desconciliar(d, { movId, motivo = "" }) {
  const pr = central(d); if (!pr.ok) return pr;
  const m = lista(d, "movimientos").find((x) => x.id === movId); if (!m) return err("No se encontró el movimiento.");
  if (T.conciliacionCerrada(d, m.cuentaId, m.fecha)) return err("La conciliación de ese mes está cerrada.");
  if (!String(motivo).trim()) return err("Escribe el motivo.");
  const antes = m.estado;
  Object.assign(m, { estado: "detectado", vinculos: [], regla: null, conciliadoPor: null, conciliadoEn: null, nota: "" });
  auditar(d, "conciliacion_deshecha", "movimiento_bancario", m.id, `${antes} → sin conciliar. ${String(motivo).trim()}`);
  return ok();
}
/**
 * Clasifica lo que el banco trae y no está en libros: «es_gasto» (comisión, cargo bancario; en cuenta de sucursal puede crear el gasto
 * con la acción de finanzas) o «sin_cobro» (depósito no identificado, se investiga).
 */
export function clasificarMovimiento(d, { movId, estado, nota = "", gasto = null }) {
  const pr = central(d); if (!pr.ok) return pr;
  const m = lista(d, "movimientos").find((x) => x.id === movId); if (!m) return err("No se encontró el movimiento.");
  if (!["es_gasto", "sin_cobro"].includes(estado)) return err("Clasificación no válida.");
  if (T.conciliacionCerrada(d, m.cuentaId, m.fecha)) return err("La conciliación de ese mes está cerrada.");
  if (m.estado === "conciliado") return err("El movimiento ya está conciliado.");
  if (estado === "es_gasto" && m.monto > 0) return err("Un abono no puede ser gasto: clasifícalo como no identificado.");
  if (!String(nota).trim()) return err("Escribe una nota que explique la clasificación.");
  const c = T.cuentaBancaria(d, m.cuentaId);
  let g = null;
  if (estado === "es_gasto" && gasto && c.sucursalId) {
    const e = cerrado(d, c.sucursalId, m.fecha); if (e) return e;
    const rg = F.registrarGasto(d, { sucursalId: c.sucursalId, fecha: m.fecha, categoria: gasto.categoria || "otros", concepto: gasto.concepto || m.descripcion, monto: -m.monto, acreedor: c.banco });
    if (!rg.ok) return rg;
    g = rg.gasto; g.movimientoBancarioId = m.id;
  }
  Object.assign(m, { estado, nota: String(nota).trim(), vinculos: g ? [{ key: `G:${g.id}`, tipo: "gasto", monto: -g.monto, descripcion: g.concepto }] : [], conciliadoPor: pr.u.id, conciliadoEn: ahoraLocal() });
  auditar(d, "movimiento_clasificado", "movimiento_bancario", m.id, `${T.ESTADOS_MOV[estado][0]} · ${m.descripcion} ${dinero(m.monto)}${g ? ` · gasto ${g.id}` : ""}`);
  return ok({ movimiento: m, gasto: g });
}
/** Cierra la conciliación de un mes: exige mes terminado y ningún movimiento del banco sin conciliar ni clasificar. */
export function cerrarConciliacion(d, { cuentaId, mes, ref = hoy() }) {
  const pr = central(d); if (!pr.ok) return pr;
  const res = T.resumenConciliacion(d, cuentaId, mes); if (!res) return err("Elige la cuenta bancaria.");
  if (res.cerrada) return err("Esa conciliación ya está cerrada.");
  if (T.finDeMes(mes) >= ref) return err("Solo se cierra un mes terminado.");
  if (res.pendientes.length) return err(`Quedan ${res.pendientes.length} movimientos del banco sin conciliar o clasificar.`);
  const x = { id: uid("CN"), cuentaId, mes, estado: "cerrada", saldoBanco: res.saldoBanco, saldoLibros: res.saldoLibros, transito: redondear(res.totalTransitoAbonos - res.totalTransitoCargos), porAclarar: res.porAclarar, cerradaEn: ahoraLocal(), cerradaPor: pr.u.id };
  lista(d, "conciliaciones").push(x);
  auditar(d, "conciliacion_cerrada", "cuenta_bancaria", cuentaId, `${mes} · banco ${dinero(x.saldoBanco)} · libros ${dinero(x.saldoLibros)}`);
  return ok({ conciliacion: x });
}
export function reabrirConciliacion(d, { cuentaId, mes, motivo = "" }) {
  const pr = central(d); if (!pr.ok) return pr;
  const x = lista(d, "conciliaciones").find((c) => c.cuentaId === cuentaId && c.mes === mes && c.estado === "cerrada");
  if (!x) return err("Esa conciliación no está cerrada.");
  if (String(motivo).trim().length < 10) return err("Escribe el motivo de la reapertura (al menos 10 caracteres).");
  x.estado = "reabierta"; x.reabiertaEn = ahoraLocal(); x.reabiertaPor = pr.u.id; x.motivo = String(motivo).trim();
  auditar(d, "conciliacion_reabierta", "cuenta_bancaria", cuentaId, `${mes} · ${x.motivo}`);
  return ok();
}

// ═════════════════════════ Fondo revolvente (caja chica por sucursal, P-095)
export function configurarFondo(d, { sucursalId, montoBase, responsableId = null, alertaPct = 80 }) {
  const pr = central(d); if (!pr.ok) return pr;
  if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  const m = redondear(num(montoBase)); if (!(m > 0)) return err("El monto base debe ser mayor que cero.");
  const ap = Number(alertaPct); if (!(ap >= 50 && ap <= 100)) return err("La alerta de uso va de 50 % a 100 %.");
  if (responsableId && !d.usuarios.some((u) => u.id === responsableId && u.sucursales.includes(sucursalId))) return err("El responsable debe trabajar en esa sucursal.");
  let f = T.fondoDe(d, sucursalId);
  const nuevo = !f;
  const antes = f ? f.montoBase : 0;
  if (!f) { f = { id: uid("FR"), sucursalId, activo: true, creadoEn: ahoraLocal(), creadoPor: pr.u.id }; lista(d, "fondos").push(f); }
  Object.assign(f, { montoBase: m, responsableId: responsableId || null, alertaPct: ap });
  if (m !== antes) lista(d, "fondoMovs").push({ id: uid("FM"), fondoId: f.id, sucursalId, fecha: ahoraLocal(), tipo: nuevo ? "asignacion" : "ajuste", monto: redondear(m - antes), concepto: nuevo ? "Asignación inicial del fondo" : `${m > antes ? "Ampliación" : "Reducción"} del monto base (${dinero(antes)} → ${dinero(m)})`, usuarioId: pr.u.id, gastoId: null });
  auditar(d, nuevo ? "fondo_creado" : "fondo_configurado", "fondo", f.id, `${R.nombreSucursal(d, sucursalId)} · base ${dinero(m)}`);
  return ok({ fondo: f });
}
/** Gasto menor pagado con la caja chica: crea el gasto con la acción de finanzas (alimenta el EDR) y descuenta el fondo. */
export function gastoFondo(d, { sucursalId, fecha = hoy(), categoria, concepto, monto, comprobante = null, comprobanteFolio = "" }) {
  const pr = deSucursal(d, sucursalId); if (!pr.ok) return pr;
  const f = T.fondoDe(d, sucursalId); if (!f) return err("La sucursal no tiene fondo revolvente.");
  const e = cerrado(d, sucursalId, fecha); if (e) return e;
  const m = redondear(num(monto)); if (!(m > 0)) return err("El monto debe ser mayor que cero.");
  const saldo = T.saldoFondo(d, f.id);
  if (m > saldo + 0.005) return err(`El fondo solo tiene ${dinero(saldo)} disponibles: solicita la reposición.`);
  const folioC = String(comprobanteFolio || "").trim();
  if (!comprobante && !folioC) return err("Adjunta la foto del comprobante o escribe el folio del ticket.");
  if (m >= T.paramsTes(d).comprobanteDesde && !comprobante) return err(`Desde ${dinero(T.paramsTes(d).comprobanteDesde)} se exige la foto del comprobante fiscal (P-093).`);
  const rg = F.registrarGasto(d, { sucursalId, fecha, categoria, concepto, monto: m, comprobante });
  if (!rg.ok) return rg;
  const g = rg.gasto; g.fondoId = f.id; g.comprobanteFolio = folioC;
  const mov = { id: uid("FM"), fondoId: f.id, sucursalId, fecha: `${fecha}T${ahoraLocal().slice(11)}`, tipo: "gasto", monto: -m, concepto: g.concepto, usuarioId: pr.u.id, gastoId: g.id, comprobanteFolio: folioC };
  lista(d, "fondoMovs").push(mov);
  auditar(d, "fondo_gasto", "fondo", f.id, `${R.nombreSucursal(d, sucursalId)} · ${g.concepto} · ${dinero(m)}`);
  const ef = T.estadoFondo(d, f.id);
  return ok({ gasto: g, movimiento: mov, alerta: ef.uso.alerta });
}
/** Arqueo de la caja chica: diferencia menor a la tolerancia se ajusta sola; mayor queda por revisar (Administración). */
export function registrarArqueo(d, { fondoId, contado, nota = "" }) {
  const f = lista(d, "fondos").find((x) => x.id === fondoId); if (!f) return err("No se encontró el fondo.");
  const pr = deSucursal(d, f.sucursalId); if (!pr.ok) return pr;
  const c = num(contado); if (!Number.isFinite(c) || c < 0) return err("Captura lo contado (0 o más).");
  const a = T.arqueoFondo(T.saldoFondo(d, f.id), c, T.paramsTes(d).toleranciaArqueo);
  if (a.estado !== "conforme" && !String(nota).trim()) return err("Hay diferencia: escribe una nota.");
  const arq = { id: uid("AQ"), fondoId, sucursalId: f.sucursalId, fecha: ahoraLocal(), ...a, usuarioId: pr.u.id, nota: String(nota).trim(), revisadoPor: null };
  lista(d, "arqueos").push(arq);
  if (a.estado === "diferencia_menor") lista(d, "fondoMovs").push({ id: uid("FM"), fondoId, sucursalId: f.sucursalId, fecha: arq.fecha, tipo: "ajuste", monto: a.diferencia, concepto: "Ajuste por arqueo (diferencia menor a la tolerancia)", usuarioId: pr.u.id, gastoId: null, arqueoId: arq.id });
  auditar(d, "fondo_arqueo", "fondo", fondoId, `${R.nombreSucursal(d, f.sucursalId)} · esperado ${dinero(a.esperado)} · contado ${dinero(a.contado)} · ${a.estado}`);
  return ok({ arqueo: arq });
}
export function revisarArqueo(d, { arqueoId, aceptar = true, nota = "" }) {
  const pr = central(d); if (!pr.ok) return pr;
  const a = lista(d, "arqueos").find((x) => x.id === arqueoId); if (!a) return err("No se encontró el arqueo.");
  if (a.estado !== "por_revisar") return err("Ese arqueo no está por revisar.");
  if (!String(nota).trim()) return err("Escribe la resolución.");
  a.estado = aceptar ? "revisado" : "rechazado"; a.revisadoPor = pr.u.id; a.revisadoEn = ahoraLocal(); a.resolucion = String(nota).trim();
  if (aceptar) lista(d, "fondoMovs").push({ id: uid("FM"), fondoId: a.fondoId, sucursalId: a.sucursalId, fecha: ahoraLocal(), tipo: "ajuste", monto: a.diferencia, concepto: `Ajuste autorizado por arqueo: ${a.resolucion}`, usuarioId: pr.u.id, gastoId: null, arqueoId: a.id });
  auditar(d, aceptar ? "arqueo_aceptado" : "arqueo_rechazado", "fondo", a.fondoId, `${dinero(a.diferencia)} · ${a.resolucion}`);
  return ok();
}
/** Gastos del fondo aún no amparados por una reposición autorizada. */
export function gastosPorReponer(d, fondoId) {
  const repuestos = new Set(lista(d, "reposiciones").filter((x) => x.fondoId === fondoId && x.estado !== "rechazada").flatMap((x) => x.gastos || []));
  return T.movsFondo(d, fondoId).filter((m) => m.tipo === "gasto" && m.gastoId && !repuestos.has(m.gastoId));
}
export function solicitarReposicion(d, { fondoId, nota = "" }) {
  const f = lista(d, "fondos").find((x) => x.id === fondoId); if (!f) return err("No se encontró el fondo.");
  const pr = deSucursal(d, f.sucursalId); if (!pr.ok) return pr;
  if (lista(d, "reposiciones").some((x) => x.fondoId === fondoId && x.estado === "solicitada")) return err("Ya hay una reposición por autorizar.");
  const ef = T.estadoFondo(d, fondoId);
  if (!(ef.porReponer > 0)) return err("El fondo está completo: no hay nada que reponer.");
  const rp = { id: uid("RP"), fondoId, sucursalId: f.sucursalId, monto: ef.porReponer, gastos: gastosPorReponer(d, fondoId).map((m) => m.gastoId), estado: "solicitada", solicitadaEn: ahoraLocal(), solicitadaPor: pr.u.id, resueltaEn: null, resueltaPor: null, referencia: "", motivo: String(nota).trim() };
  lista(d, "reposiciones").push(rp);
  auditar(d, "fondo_reposicion_solicitada", "fondo", fondoId, `${R.nombreSucursal(d, f.sucursalId)} · ${dinero(rp.monto)}`);
  return ok({ reposicion: rp });
}
/** Administración autoriza (con referencia de la transferencia, se concilia en la cuenta concentradora) o rechaza con motivo. */
export function resolverReposicion(d, { reposicionId, autorizar, referencia = "", motivo = "" }) {
  const pr = central(d); if (!pr.ok) return pr;
  const rp = lista(d, "reposiciones").find((x) => x.id === reposicionId); if (!rp) return err("No se encontró la reposición.");
  if (rp.estado !== "solicitada") return err("Esa reposición ya se resolvió.");
  if (rp.solicitadaPor === pr.u.id) return err("Quien solicita la reposición no la autoriza.");
  if (autorizar && !String(referencia).trim()) return err("Escribe la referencia de la transferencia o del retiro.");
  if (!autorizar && !String(motivo).trim()) return err("Escribe el motivo del rechazo.");
  Object.assign(rp, { estado: autorizar ? "autorizada" : "rechazada", resueltaEn: ahoraLocal(), resueltaPor: pr.u.id, referencia: String(referencia).trim(), motivo: String(motivo).trim() || rp.motivo });
  if (autorizar) lista(d, "fondoMovs").push({ id: uid("FM"), fondoId: rp.fondoId, sucursalId: rp.sucursalId, fecha: rp.resueltaEn, tipo: "reposicion", monto: rp.monto, concepto: `Reposición ${rp.referencia}`, usuarioId: pr.u.id, gastoId: null, reposicionId: rp.id });
  auditar(d, autorizar ? "fondo_reposicion_autorizada" : "fondo_reposicion_rechazada", "fondo", rp.fondoId, `${R.nombreSucursal(d, rp.sucursalId)} · ${dinero(rp.monto)}${autorizar ? ` · ${rp.referencia}` : ` · ${rp.motivo}`}`);
  return ok({ reposicion: rp });
}

// ═════════════════════════ Cuentas por cobrar a convenios y pagos a proveedores
export function registrarCxcConvenio(d, { convenioId, sucursalId, concepto, monto, emitido = hoy(), dias = 30 }) {
  const pr = central(d); if (!pr.ok) return pr;
  if (!(d.convenios || []).some((c) => c.id === convenioId)) return err("Elige el convenio o aseguradora.");
  if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Elige la sucursal que prestó los servicios.");
  if (!String(concepto || "").trim()) return err("Escribe el concepto (p. ej. relación de servicios del mes).");
  const m = redondear(num(monto)); if (!(m > 0)) return err("El monto debe ser mayor que cero.");
  if (!fechaOk(emitido) || emitido > hoy()) return err("Fecha de emisión no válida.");
  const e = cerrado(d, sucursalId, emitido); if (e) return e;
  const n = Number(dias); if (!(Number.isInteger(n) && n >= 0 && n <= 180)) return err("Días de crédito entre 0 y 180.");
  const cx = lista(d, "cxc");
  const c = { id: uid("CC"), folio: `CC-${String(cx.length + 1).padStart(4, "0")}`, convenioId, sucursalId, concepto: String(concepto).trim(), emitido, vence: sumarDias(emitido, n), monto: m, saldo: m, pagos: [], creadoPor: pr.u.id };
  while (cx.some((x) => x.folio === c.folio)) c.folio = `CC-${String(Number(c.folio.slice(3)) + 1).padStart(4, "0")}`;
  cx.push(c);
  auditar(d, "cxc_convenio_creada", "cxc", c.id, `${c.folio} · ${T.nombreConvenio(d, convenioId)} · ${dinero(m)}`);
  return ok({ cxc: c });
}
export function registrarCobroConvenio(d, { cxcId, monto, forma = "transferencia", referencia = "", fecha = hoy() }) {
  const pr = central(d); if (!pr.ok) return pr;
  const c = lista(d, "cxc").find((x) => x.id === cxcId); if (!c) return err("No se encontró la cuenta por cobrar.");
  if (!["transferencia", "efectivo", "tarjeta"].includes(forma)) return err("Forma de pago no válida.");
  if (!fechaOk(fecha) || fecha > hoy()) return err("Fecha no válida.");
  const e = cerrado(d, c.sucursalId, fecha); if (e) return e;
  const m = redondear(num(monto));
  if (!(m > 0) || m > c.saldo + 0.005) return err(`El cobro debe ser mayor que cero y no exceder el saldo (${dinero(c.saldo)}).`);
  if (forma === "transferencia" && !String(referencia).trim()) return err("Escribe la referencia de la transferencia.");
  c.pagos.push({ fecha, monto: m, forma, referencia: String(referencia).trim(), usuarioId: pr.u.id, registradoEn: ahoraLocal() });
  c.saldo = redondear(c.saldo - m);
  auditar(d, "cxc_convenio_cobro", "cxc", c.id, `${c.folio} · ${dinero(m)} · saldo ${dinero(c.saldo)}`);
  return ok({ cxc: c });
}
/** Pago a proveedor (P-096): reutiliza la acción de Administración y respeta el periodo cerrado de la cadena. */
export function pagarProveedor(d, { cxpId, monto, referencia = "" }) {
  const pr = central(d); if (!pr.ok) return pr;
  if (!String(referencia).trim()) return err("Escribe la referencia del pago (se concilia con el banco).");
  const e = cerrado(d, null, hoy()); if (e) return e;
  return registrarPagoCxp(d, { cxpId, monto, referencia });
}

// ═════════════════════════ Cierres de periodo mensual por sucursal (P-099)
export function fotoCierre(d, sucursalId, mes) {
  const e = F.estadoResultados({ ...d, sesion: { userId: null, sucursalId: null } }, { mes, sucursalId });
  const { desde, hasta } = T.rangoMes(mes);
  const ing = T.totalesIngresos(T.ingresosDe(d, { desde, hasta, sucursalId }));
  const gs = ((d.fin && d.fin.gastos) || []).filter((g) => g.sucursalId === sucursalId && g.fecha.slice(0, 7) === mes);
  const t = e.ok ? e.totales : {};
  return {
    ingresos: t.ingresos || 0, gastosVariables: t.gastosVariables || 0, gastosOperacion: t.gastosOperacion || 0, nomina: t.nomina || 0, utilidadOperativa: t.utilidadOperativa || 0, margen: t.margen || 0,
    gastosRegistrados: redondear(gs.reduce((a, g) => a + g.monto, 0)), nGastos: gs.length, cobrado: ing.total, cobradoPorForma: ing.porForma,
    depositado: redondear(lista(d, "depositos").filter((x) => x.sucursalId === sucursalId && (x.diaVenta || x.fecha).slice(0, 7) === mes).reduce((a, x) => a + x.monto, 0)),
  };
}
export function cerrarPeriodo(d, { sucursalId, mes, aceptarAdvertencias = false, ref = hoy() }) {
  const pr = central(d); if (!pr.ok) return err("Solo Administración central o Dirección cierran periodos.");
  if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) return err("Mes no válido.");
  const prev = T.cierreDe(d, sucursalId, mes);
  if (prev && prev.estado === "cerrado") return err("Ese periodo ya está cerrado.");
  const chk = T.checklistCierre(d, sucursalId, mes, ref);
  const bloq = chk.filter((x) => !x.ok && x.bloquea);
  if (bloq.length) return err(`No se puede cerrar: ${bloq.map((x) => `${x.texto.toLowerCase()} (${x.detalle})`).join("; ")}`);
  const adv = T.advertenciasChecklist(chk);
  if (adv.length && !aceptarAdvertencias) return err(`Hay ${adv.length} advertencia(s): revísalas y acéptalas para cerrar.`);
  const ahora = ahoraLocal();
  const c = prev || { id: uid("CI"), sucursalId, mes, historial: [] };
  Object.assign(c, { estado: "cerrado", cerradoEn: ahora, cerradoPor: pr.u.id, snapshot: fotoCierre(d, sucursalId, mes), advertencias: adv.map((x) => ({ k: x.k, texto: x.texto, detalle: x.detalle })) });
  c.historial.push({ accion: "cerrado", por: pr.u.id, en: ahora, motivo: adv.length ? `Con ${adv.length} advertencia(s) aceptadas` : "" });
  if (!prev) lista(d, "cierres").push(c);
  auditar(d, "periodo_cerrado", "cierre", c.id, `${R.nombreSucursal(d, sucursalId)} · ${mes}${adv.length ? ` · ${adv.length} advertencias aceptadas` : ""}`);
  return ok({ cierre: c });
}
export function reabrirPeriodo(d, { sucursalId, mes, motivo = "" }) {
  const u = usuarioDe(d);
  if (!esDireccion(u)) return err("Solo Dirección reabre un periodo cerrado.");
  const c = T.cierreDe(d, sucursalId, mes);
  if (!c || c.estado !== "cerrado") return err("Ese periodo no está cerrado.");
  if (String(motivo).trim().length < 10) return err("Escribe el motivo de la reapertura (al menos 10 caracteres).");
  const ahora = ahoraLocal();
  Object.assign(c, { estado: "reabierto", reabiertoEn: ahora, reabiertoPor: u.id, motivoReapertura: String(motivo).trim() });
  c.historial.push({ accion: "reabierto", por: u.id, en: ahora, motivo: c.motivoReapertura });
  auditar(d, "periodo_reabierto", "cierre", c.id, `${R.nombreSucursal(d, sucursalId)} · ${mes} · ${c.motivoReapertura}`);
  return ok({ cierre: c });
}
/** Matriz de cierres: últimos `n` meses × sucursales con su estado. */
export function matrizCierres(d, n = 12, ref = hoy()) {
  const meses = Array.from({ length: n }, (_, i) => F.mesRelativo(F.mesActual(ref), -i));
  return meses.map((mes) => ({ mes, terminado: T.finDeMes(mes) < ref, celdas: d.sucursales.map((s) => ({ sucursalId: s.id, estado: T.estadoCierre(d, s.id, mes), cierre: T.cierreDe(d, s.id, mes) })) }));
}
