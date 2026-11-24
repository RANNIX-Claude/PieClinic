// Reglas PURAS del dominio «tesorería» (porte de Pie Firme: src/lib/finanzas/{semana,ingresos,conciliacion,kpis,gastos}.js).
// Sin core.js: lo usan la semilla (dominios/tesoreria.js), las acciones (acciones_tesoreria.js) y las pruebas.
// Reglas de Pie Firme citadas: P-088 semana sábado→viernes · P-090/P-091 ingreso real = cobrado por fecha de pago; «validado» = conciliado ·
// P-094 conciliación con CSV y mapeo · P-095 fondo revolvente por sede · P-096 pago a proveedores se concilia · P-099 periodo cerrado = solo lectura.
//
// d.tes = { params, cuentas, estados, movimientos, conciliaciones, depositos, fondos, fondoMovs, arqueos, reposiciones, cierres, cxc }
import { hoy, redondear, sumarDias, diasEntre, dia, hora, parse } from "../lib/format.js";
import * as R from "./reglas.js";

export const PARAMS_TES = {
  semanaDow: 6,            // 6 = sábado (P-088)
  toleranciaDias: 3,       // conciliación: monto igual y fecha ± días (P-094)
  fondoAlertaPct: 80,      // alerta de uso del fondo (P-095)
  comprobanteDesde: 2000,  // foto del comprobante obligatoria desde este importe (P-093)
  toleranciaArqueo: 50,    // diferencia mayor la revisa Administración (P-058)
  metaOcupacion: 80,       // meta de ocupación de agenda (P-097)
  cxpDiasPorVencer: 7,
};
export const paramsTes = (d) => ({ ...PARAMS_TES, ...((d.tes && d.tes.params) || {}) });
const T = (d) => d.tes || {};
const lista = (d, k) => (d.tes && d.tes[k]) || [];
const sumar = (a, f = (x) => x) => redondear(a.reduce((s, x) => s + (Number(f(x)) || 0), 0));
const igual = (a, b) => Math.abs(a - b) < 0.01;

// ═════════════════════════ Semana de corte (sábado → viernes, P-088)
const MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const diaSemana = (f) => parse(dia(f)).getDay();
/** Inicio (sábado por defecto) de la semana que contiene la fecha. */
export function inicioSemana(f, dow = PARAMS_TES.semanaDow) { return sumarDias(dia(f), -((diaSemana(f) - dow + 7) % 7)); }
/** "S47": número de semana contado desde la primera semana de corte del año del inicio. */
export function etiquetaSemana(f, dow = PARAMS_TES.semanaDow) {
  const ini = inicioSemana(f, dow);
  const ini1 = inicioSemana(`${ini.slice(0, 4)}-01-01`, dow);
  return "S" + String(Math.floor(diasEntre(ini1, ini) / 7) + 1).padStart(2, "0");
}
export function semanaCorte(f = hoy(), dow = PARAMS_TES.semanaDow) {
  const inicio = inicioSemana(f, dow);
  return { inicio, fin: sumarDias(inicio, 6), etiqueta: etiquetaSemana(f, dow) };
}
export function semanasRecientes(n = 8, ref = hoy(), dow = PARAMS_TES.semanaDow) {
  const s0 = inicioSemana(ref, dow);
  return Array.from({ length: n }, (_, i) => semanaCorte(sumarDias(s0, -7 * i), dow));
}
export const enRango = (f, desde, hasta) => { const x = dia(f); return (!desde || x >= desde) && (!hasta || x <= hasta); };
export function etiquetaRango(inicio, fin) {
  const f = (iso) => `${Number(iso.slice(8, 10))} ${MES_C[Number(iso.slice(5, 7)) - 1]}`;
  return `${f(inicio)} – ${f(fin)}`;
}
export const finDeMes = (mes) => { const [y, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };
export const rangoMes = (mes) => ({ desde: `${mes}-01`, hasta: finDeMes(mes) });

// ═════════════════════════ Ingresos = todo lo cobrado, por fecha de pago (P-090, P-091)
export const FORMAS_TES = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", en_linea: "Pago en línea" };
export const ORIGENES = {
  venta: "Venta o consulta", anticipo_lab: "Anticipo de plantilla", apartado: "Abono de apartado", credito: "Abono de crédito o plazos",
  enganche: "Enganche", pedido_web: "Pedido en línea", convenio: "Cobro a convenio",
};
export const formaLabel = (f) => FORMAS_TES[f] || f || "—";

/**
 * Un renglón por pago recibido. Fuentes (sin duplicar): pagos de d.ventas (no canceladas; las ventas de apartado y a crédito no cuentan
 * porque su dinero entró como abonos/enganche), abonos de apartados, abonos de crédito y plazos, enganches, pedidos en línea ya pagados
 * que aún no se entregan (al entregarse el cobro vive en la venta) y cobros a convenios (d.tes.cxc).
 *   → [{ id, fecha, hora, sucursalId, origen, folio, pacienteId|null, cliente, concepto, forma, monto, usuarioId, referencia, cuenta:{tipo,id}|null, formaSupuesta? }]
 */
export function ingresosDe(d, { desde = null, hasta = null, sucursalId = null } = {}) {
  const out = [];
  const dentro = (f, s) => enRango(f, desde, hasta) && (!sucursalId || s === sucursalId);
  const pedidos = new Map((d.pedidosWeb || []).map((p) => [p.id, p]));
  (d.ventas || []).forEach((v) => {
    if (v.estado === "cancelada" || v.estado === "a_credito" || v.tipo === "apartado" || v.apartadoId || v.planId) return;
    if (!dentro(v.fecha, v.sucursalId)) return;
    const pw = v.pedidoWebId ? pedidos.get(v.pedidoWebId) : null;
    const p0 = (v.partidas || [])[0];
    const concepto = p0 ? `${p0.nombre}${v.partidas.length > 1 ? ` +${v.partidas.length - 1}` : ""}` : "Venta";
    (v.pagos || []).forEach((p, i) => {
      if (!(p.monto > 0)) return;
      out.push({
        id: `V:${v.id}:${i}`, fecha: dia(v.fecha), hora: hora(v.fecha), sucursalId: v.sucursalId,
        origen: v.tipo === "anticipo_laboratorio" ? "anticipo_lab" : v.origen === "pedido_web" ? "pedido_web" : "venta",
        folio: v.folio, pacienteId: v.pacienteId || null, cliente: pw ? pw.cliente.nombre : "", concepto, forma: p.forma, monto: redondear(p.monto),
        usuarioId: v.cajeroId, referencia: p.forma === "en_linea" && pw && pw.pago.ref ? pw.pago.ref : v.folio, cuenta: null,
      });
    });
  });
  (d.apartados || []).forEach((ap) => (ap.abonos || []).forEach((a, i) => {
    const suc = a.sucursalId || ap.sucursalId;
    if (!dentro(a.fecha, suc)) return;
    const pagos = a.pagos && a.pagos.length ? a.pagos : [{ forma: "efectivo", monto: a.monto }];
    pagos.forEach((p, j) => p.monto > 0 && out.push({
      id: `A:${ap.id}:${i}:${j}`, fecha: dia(a.fecha), hora: "", sucursalId: suc, origen: "apartado", folio: ap.folio, pacienteId: ap.pacienteId, cliente: "",
      concepto: `${i === 0 ? "Anticipo" : "Abono"} · ${ap.nombre}`, forma: p.forma, monto: redondear(p.monto), usuarioId: a.cajeroId || null, referencia: ap.folio,
      cuenta: { tipo: "apartado", id: ap.id }, formaSupuesta: !(a.pagos && a.pagos.length),
    }));
  }));
  const planes = new Map((d.planes || []).map((p) => [p.id, p]));
  (d.abonosCredito || []).forEach((ab) => {
    const pl = planes.get(ab.planId);
    const suc = ab.sucursalId || (pl && pl.sucursalId);
    if (!(ab.monto > 0) || !dentro(ab.fecha, suc)) return;
    out.push({
      id: `B:${ab.id}`, fecha: dia(ab.fecha), hora: "", sucursalId: suc, origen: "credito", folio: pl ? pl.folio : ab.planId, pacienteId: pl ? pl.pacienteId : null, cliente: "",
      concepto: `Parcialidad ${ab.parcialidad}${ab.mora ? " (con mora)" : ""}`, forma: ab.forma || "efectivo", monto: redondear(ab.monto), usuarioId: ab.cajeroId || null,
      referencia: pl ? pl.folio : "", cuenta: { tipo: "plan", id: ab.planId }, formaSupuesta: !ab.forma,
    });
  });
  (d.planes || []).forEach((pl) => {
    if (!(pl.enganche > 0) || pl.estado === "cancelado" || !dentro(pl.creado, pl.sucursalId)) return;
    const pagos = pl.enganchePagos && pl.enganchePagos.length ? pl.enganchePagos : [{ forma: "efectivo", monto: pl.enganche }];
    pagos.forEach((p, j) => p.monto > 0 && out.push({
      id: `E:${pl.id}:${j}`, fecha: dia(pl.creado), hora: "", sucursalId: pl.sucursalId, origen: "enganche", folio: pl.folio, pacienteId: pl.pacienteId, cliente: "",
      concepto: `Enganche de ${pl.tipo === "plazos" ? "venta a plazos" : "crédito"}`, forma: p.forma, monto: redondear(p.monto), usuarioId: pl.cajeroId || null, referencia: pl.folio,
      cuenta: { tipo: "plan", id: pl.id }, formaSupuesta: !(pl.enganchePagos && pl.enganchePagos.length),
    }));
  });
  (d.pedidosWeb || []).forEach((pw) => {
    if (pw.ventaId || !pw.pago || pw.pago.forma !== "en_linea" || pw.pago.estado !== "pagado" || !dentro(pw.fecha, pw.sucursalId)) return;
    out.push({
      id: `W:${pw.id}`, fecha: dia(pw.fecha), hora: hora(pw.fecha), sucursalId: pw.sucursalId, origen: "pedido_web", folio: pw.folio, pacienteId: null, cliente: pw.cliente.nombre,
      concepto: `Pedido en línea por entregar (${pw.estado})`, forma: "en_linea", monto: redondear(pw.total), usuarioId: null, referencia: pw.pago.ref || pw.folio, cuenta: null,
    });
  });
  lista(d, "cxc").forEach((c) => (c.pagos || []).forEach((p, i) => {
    if (!dentro(p.fecha, c.sucursalId)) return;
    out.push({
      id: `C:${c.id}:${i}`, fecha: dia(p.fecha), hora: "", sucursalId: c.sucursalId, origen: "convenio", folio: c.folio, pacienteId: null, cliente: nombreConvenio(d, c.convenioId),
      concepto: c.concepto, forma: p.forma, monto: redondear(p.monto), usuarioId: p.usuarioId || null, referencia: p.referencia || c.folio, cuenta: { tipo: "convenio", id: c.id },
    });
  }));
  return out.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora) || a.id.localeCompare(b.id));
}
export const nombreConvenio = (d, id) => ((d.convenios || []).find((c) => c.id === id) || {}).nombre || "Convenio";
export const quienPaga = (d, f) => (f.pacienteId ? R.nombrePaciente(d, f.pacienteId) : f.cliente || "Público en general");

/** Totales de una lista de ingresos: por forma, origen, sucursal y día. */
export function totalesIngresos(filas) {
  const t = { total: 0, n: filas.length, porForma: {}, porOrigen: {}, porSucursal: {}, porDia: {} };
  filas.forEach((f) => {
    t.total += f.monto;
    t.porForma[f.forma] = redondear((t.porForma[f.forma] || 0) + f.monto);
    t.porOrigen[f.origen] = redondear((t.porOrigen[f.origen] || 0) + f.monto);
    t.porSucursal[f.sucursalId] = redondear((t.porSucursal[f.sucursalId] || 0) + f.monto);
    t.porDia[f.fecha] = redondear((t.porDia[f.fecha] || 0) + f.monto);
  });
  t.total = redondear(t.total);
  return t;
}
/** Cuenta por cobrar ligada a un ingreso (apartado, plan de crédito/plazos o convenio) con su saldo de hoy. */
export function cuentaLigada(d, fila, ref = hoy()) {
  const c = fila && fila.cuenta;
  if (!c) return null;
  if (c.tipo === "apartado") {
    const ap = (d.apartados || []).find((x) => x.id === c.id);
    return ap ? { tipo: "Apartado", folio: ap.folio, total: ap.precio, saldo: R.saldoApartado(ap), estado: ap.estado === "activo" ? R.estadoApartado(ap, ref) : ap.estado, vence: ap.vence } : null;
  }
  if (c.tipo === "plan") {
    const pl = (d.planes || []).find((x) => x.id === c.id);
    if (!pl) return null;
    const s = R.saldoPlan(d, pl, ref);
    return { tipo: pl.tipo === "plazos" ? "Venta a plazos" : "Crédito abierto", folio: pl.folio, total: pl.monto, saldo: s.total, mora: s.mora, vencido: s.vencido, estado: pl.estado };
  }
  const x = lista(d, "cxc").find((y) => y.id === c.id);
  return x ? { tipo: "Convenio", folio: x.folio, total: x.monto, saldo: x.saldo, estado: x.saldo > 0 ? "abierta" : "cobrada", vence: x.vence } : null;
}

// ═════════════════════════ Cuentas por cobrar y por pagar: antigüedad de saldos y calendario
export const TRAMOS = [
  { k: "corriente", l: "Por vencer" }, { k: "d30", l: "1 a 30 días" }, { k: "d60", l: "31 a 60 días" }, { k: "d90", l: "61 a 90 días" }, { k: "mas", l: "Más de 90 días" },
];
/** Tramo de antigüedad según los días transcurridos desde el vencimiento. */
export function tramoDe(vence, ref = hoy()) {
  const n = diasEntre(vence, ref);
  return n <= 0 ? "corriente" : n <= 30 ? "d30" : n <= 60 ? "d60" : n <= 90 ? "d90" : "mas";
}
const tramosVacios = () => ({ corriente: 0, d30: 0, d60: 0, d90: 0, mas: 0 });
export const TIPOS_CXC = { credito: "Crédito abierto", plazos: "Venta a plazos", apartado: "Apartado", convenio: "Convenio / aseguradora" };

/**
 * Cuentas por cobrar vivas: planes de crédito y plazos (capital pendiente por parcialidad), apartados activos con saldo y
 * documentos a convenios/aseguradoras. → [{ id, tipo, folio, deudor, pacienteId, sucursalId, saldo, mora, vence, diasVencido, tramos, partes:[{vence, monto}] }]
 */
export function cuentasPorCobrar(d, { sucursalId = null, ref = hoy() } = {}) {
  const out = [];
  const fila = (base, partes) => {
    const tramos = tramosVacios();
    partes.forEach((p) => { tramos[tramoDe(p.vence, ref)] = redondear(tramos[tramoDe(p.vence, ref)] + p.monto); });
    const vence = partes.map((p) => p.vence).sort()[0];
    out.push({ ...base, saldo: sumar(partes, (p) => p.monto), vence, diasVencido: Math.max(0, diasEntre(vence, ref)), tramos, partes });
  };
  (d.planes || []).forEach((pl) => {
    if (pl.estado !== "vigente" || (sucursalId && pl.sucursalId !== sucursalId)) return;
    const partes = pl.parcialidades.filter((p) => p.capital - (p.pagado || 0) > 0.005).map((p) => ({ vence: p.vence, monto: redondear(p.capital - (p.pagado || 0)) }));
    if (!partes.length) return;
    fila({ id: `PL:${pl.id}`, refId: pl.id, tipo: pl.tipo === "plazos" ? "plazos" : "credito", folio: pl.folio, deudor: R.nombrePaciente(d, pl.pacienteId), pacienteId: pl.pacienteId, sucursalId: pl.sucursalId, mora: R.saldoPlan(d, pl, ref).mora }, partes);
  });
  (d.apartados || []).forEach((ap) => {
    if (ap.estado !== "activo" || (sucursalId && ap.sucursalId !== sucursalId)) return;
    const saldo = R.saldoApartado(ap);
    if (saldo > 0.005) fila({ id: `AP:${ap.id}`, refId: ap.id, tipo: "apartado", folio: ap.folio, deudor: R.nombrePaciente(d, ap.pacienteId), pacienteId: ap.pacienteId, sucursalId: ap.sucursalId, mora: 0 }, [{ vence: ap.vence, monto: saldo }]);
  });
  lista(d, "cxc").forEach((c) => {
    if (!(c.saldo > 0.005) || (sucursalId && c.sucursalId !== sucursalId)) return;
    fila({ id: `CV:${c.id}`, refId: c.id, tipo: "convenio", folio: c.folio, deudor: nombreConvenio(d, c.convenioId), pacienteId: null, sucursalId: c.sucursalId, mora: 0, concepto: c.concepto }, [{ vence: c.vence, monto: redondear(c.saldo) }]);
  });
  return out.sort((a, b) => a.vence.localeCompare(b.vence));
}
/** Cuentas por pagar vivas (d.cxp; son de la cadena: las compras son centralizadas). */
export function cuentasPorPagar(d, { ref = hoy() } = {}) {
  return (d.cxp || []).filter((c) => c.saldo > 0.005).map((c) => {
    const tramos = tramosVacios(); tramos[tramoDe(c.vence, ref)] = redondear(c.saldo);
    return {
      id: c.id, refId: c.id, tipo: "proveedor", folio: c.doc, deudor: ((d.proveedores || []).find((p) => p.id === c.proveedorId) || {}).nombre || "Proveedor",
      saldo: redondear(c.saldo), vence: c.vence, diasVencido: Math.max(0, diasEntre(c.vence, ref)), tramos, partes: [{ vence: c.vence, monto: redondear(c.saldo) }], pagos: c.pagos || [],
    };
  }).sort((a, b) => a.vence.localeCompare(b.vence));
}
/** Antigüedad de saldos de una lista de cuentas: { corriente, d30, d60, d90, mas, vencido, total }. */
export function antiguedad(filas) {
  const t = tramosVacios();
  filas.forEach((f) => TRAMOS.forEach(({ k }) => { t[k] = redondear(t[k] + (f.tramos[k] || 0)); }));
  const total = sumar(Object.values(t));
  return { ...t, vencido: redondear(total - t.corriente), total };
}
/** Calendario de vencimientos por semana de corte: lo vencido antes de hoy y las siguientes `semanas`. */
export function calendarioVencimientos(d, { sucursalId = null, ref = hoy(), semanas = 6 } = {}) {
  const dow = paramsTes(d).semanaDow;
  const cobrar = cuentasPorCobrar(d, { sucursalId, ref }).flatMap((c) => c.partes.map((p) => ({ ...p, lado: "cobrar", folio: c.folio, deudor: c.deudor, tipo: c.tipo, id: c.id })));
  const pagar = cuentasPorPagar(d, { ref }).flatMap((c) => c.partes.map((p) => ({ ...p, lado: "pagar", folio: c.folio, deudor: c.deudor, tipo: c.tipo, id: c.id })));
  const todo = [...cobrar, ...pagar];
  const s0 = inicioSemana(ref, dow);
  const armar = (items, base) => ({ ...base, items: items.sort((a, b) => a.vence.localeCompare(b.vence)), cobrar: sumar(items.filter((x) => x.lado === "cobrar"), (x) => x.monto), pagar: sumar(items.filter((x) => x.lado === "pagar"), (x) => x.monto) });
  const out = [armar(todo.filter((x) => x.vence < ref), { clave: "vencido", titulo: "Vencido", inicio: null, fin: null })];
  for (let i = 0; i < semanas; i++) {
    const ini = sumarDias(s0, 7 * i), fin = sumarDias(ini, 6);
    out.push(armar(todo.filter((x) => x.vence >= (i === 0 ? ref : ini) && x.vence <= fin), { clave: ini, titulo: `${etiquetaSemana(ini, dow)} · ${etiquetaRango(ini, fin)}`, inicio: ini, fin }));
  }
  const limite = sumarDias(s0, 7 * semanas - 1);
  out.push(armar(todo.filter((x) => x.vence > limite), { clave: "despues", titulo: "Después", inicio: null, fin: null }));
  return out;
}

// ═════════════════════════ Bancos y conciliación (P-094, P-096)
export const ESTADOS_MOV = {
  detectado: ["Sin conciliar", "warn"], sugerido: ["Sugerido", "info"], ambiguo: ["Ambiguo", "warn"],
  conciliado: ["Conciliado", "ok"], es_gasto: ["Es gasto", "neutral"], sin_cobro: ["No identificado", "bad"],
};
export const PENDIENTES_MOV = ["detectado", "sugerido", "ambiguo"];
export const TIPOS_PARTIDA = {
  transferencia: "Transferencia recibida", lote_tarjeta: "Liquidación de terminal", deposito_efectivo: "Depósito de efectivo", en_linea: "Pago en línea",
  pago_proveedor: "Pago a proveedor", reposicion_fondo: "Reposición de fondo", gasto: "Gasto registrado",
};
export const cuentaBancaria = (d, id) => lista(d, "cuentas").find((c) => c.id === id) || null;
export const cuentaDeSucursal = (d, sucursalId) => lista(d, "cuentas").find((c) => c.sucursalId === sucursalId && c.activa !== false) || null;
export const cuentaConcentradora = (d) => lista(d, "cuentas").find((c) => !c.sucursalId && c.activa !== false) || null;
const normRef = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const mmdd = (f) => f.slice(5, 7) + f.slice(8, 10);
export const refLote = (sucursalId, fecha) => `LIQ-${sucursalId}-${mmdd(fecha)}`;
export const refDeposito = (sucursalId, fecha) => `DEP-${sucursalId}-${mmdd(fecha)}`;

/** Clave de partida → id del movimiento bancario con el que está conciliada. */
export function clavesConciliadas(d) {
  const m = new Map();
  lista(d, "movimientos").forEach((x) => (x.vinculos || []).forEach((v) => m.set(v.key, x.id)));
  return m;
}
/** Gastos pagados en efectivo con el fondo revolvente (no pasan por el banco). */
export const gastosDeFondo = (d) => new Set(lista(d, "fondoMovs").filter((m) => m.gastoId).map((m) => m.gastoId));

/**
 * Partidas en libros que deben aparecer en el estado de cuenta de una cuenta bancaria, en un rango de fechas:
 *  · cuenta de sucursal: cada cobro por transferencia, la liquidación diaria de la terminal (suma de cobros con tarjeta) y los depósitos de efectivo;
 *  · cuenta concentradora: pagos en línea (pasarela), pagos a proveedores y reposiciones de fondo autorizadas.
 * Con `conGastos` agrega los gastos de la sucursal como candidatos para cargos (no cuentan como partidas en tránsito).
 *   → [{ key, tipo, fecha, monto (+ abono / − cargo), referencia, descripcion, conciliada, movId }]
 */
export function partidasLibro(d, cuentaId, { desde = null, hasta = null, conGastos = false } = {}) {
  const c = cuentaBancaria(d, cuentaId);
  if (!c) return [];
  const out = [];
  const ing = ingresosDe(d, { desde, hasta, sucursalId: c.sucursalId || null });
  if (c.sucursalId) {
    const lotes = new Map();
    ing.forEach((f) => {
      if (f.forma === "transferencia") out.push({ key: f.id, tipo: "transferencia", fecha: f.fecha, monto: f.monto, referencia: f.referencia || f.folio, descripcion: `${ORIGENES[f.origen]} ${f.folio}` });
      else if (f.forma === "tarjeta") { const l = lotes.get(f.fecha) || { monto: 0, n: 0 }; l.monto += f.monto; l.n++; lotes.set(f.fecha, l); }
    });
    lotes.forEach((l, fecha) => out.push({ key: `L:${c.sucursalId}:${fecha}`, tipo: "lote_tarjeta", fecha, monto: redondear(l.monto), referencia: refLote(c.sucursalId, fecha), descripcion: `Terminal del ${fecha.slice(8, 10)}/${fecha.slice(5, 7)} · ${l.n} cobros` }));
    lista(d, "depositos").forEach((x) => {
      if (x.sucursalId === c.sucursalId && enRango(x.fecha, desde, hasta)) out.push({ key: `D:${x.id}`, tipo: "deposito_efectivo", fecha: x.fecha, monto: redondear(x.monto), referencia: x.referencia, descripcion: `Depósito de efectivo${x.diaVenta ? ` del ${x.diaVenta.slice(8, 10)}/${x.diaVenta.slice(5, 7)}` : ""}` });
    });
    if (conGastos) {
      const fondo = gastosDeFondo(d);
      ((d.fin && d.fin.gastos) || []).forEach((g) => {
        if (g.sucursalId === c.sucursalId && !fondo.has(g.id) && enRango(g.fecha, desde, hasta)) out.push({ key: `G:${g.id}`, tipo: "gasto", fecha: g.fecha, monto: -redondear(g.monto), referencia: "", descripcion: g.concepto });
      });
    }
  } else {
    ing.forEach((f) => { if (f.forma === "en_linea") out.push({ key: f.id, tipo: "en_linea", fecha: f.fecha, monto: f.monto, referencia: f.referencia, descripcion: `${ORIGENES[f.origen]} ${f.folio}` }); });
    (d.cxp || []).forEach((x) => (x.pagos || []).forEach((p, i) => {
      if (enRango(p.fecha, desde, hasta)) out.push({ key: `P:${x.id}:${i}`, tipo: "pago_proveedor", fecha: dia(p.fecha), monto: -redondear(p.monto), referencia: p.referencia || "", descripcion: `Pago ${x.doc} · ${((d.proveedores || []).find((y) => y.id === x.proveedorId) || {}).nombre || ""}` });
    }));
    lista(d, "reposiciones").forEach((x) => {
      if (x.estado === "autorizada" && enRango(x.resueltaEn, desde, hasta)) out.push({ key: `R:${x.id}`, tipo: "reposicion_fondo", fecha: dia(x.resueltaEn), monto: -redondear(x.monto), referencia: x.referencia || "", descripcion: `Reposición del fondo de ${R.nombreSucursal(d, x.sucursalId)}` });
    });
  }
  const usadas = clavesConciliadas(d);
  out.forEach((x) => { x.movId = usadas.get(x.key) || null; x.conciliada = !!x.movId; });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.key.localeCompare(b.key));
}

/** Candidatos de un movimiento bancario: 1) referencia igual (o contenida en la descripción) y monto igual; 2) monto igual y fecha ± tolerancia. */
export function candidatosDe(mov, partidas, tol = PARAMS_TES.toleranciaDias) {
  const libres = partidas.filter((p) => !p.conciliada && igual(p.monto, mov.monto));
  const r = normRef(mov.referencia), de = normRef(mov.descripcion);
  const porRef = libres.filter((p) => { const x = normRef(p.referencia); return x.length >= 4 && (x === r || de.includes(x)); });
  if (porRef.length === 1) return { regla: "referencia", candidatos: porRef, estado: "sugerido" };
  const porMonto = libres.filter((p) => Math.abs(diasEntre(p.fecha, mov.fecha)) <= tol);
  if (porMonto.length === 1) return { regla: "monto_fecha", candidatos: porMonto, estado: "sugerido" };
  if (porMonto.length > 1) return { regla: "monto_fecha", candidatos: porMonto, estado: "ambiguo" };
  return { regla: null, candidatos: [], estado: "detectado" };
}

/**
 * Conciliación automática de una cuenta (función pura sobre d; la acción valida rol y audita).
 * Empareja lo que tiene un único candidato (primero por referencia, luego por monto y fecha), marca «ambiguo» lo que tiene varios
 * y deja «sin conciliar» lo que no encuentra. Una partida nunca se usa dos veces.
 */
export function conciliarAutomatico(d, cuentaId, { desde = null, hasta = null, usuarioId = null, ahora = "" } = {}) {
  const tol = paramsTes(d).toleranciaDias;
  const movs = lista(d, "movimientos").filter((m) => m.cuentaId === cuentaId && PENDIENTES_MOV.includes(m.estado) && enRango(m.fecha, desde, hasta) && !conciliacionCerrada(d, cuentaId, m.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const res = { revisados: movs.length, conciliados: 0, porReferencia: 0, porMontoFecha: 0, ambiguos: 0, sinPartida: 0 };
  if (!movs.length) return res;
  const fechas = movs.map((m) => m.fecha).sort();
  const partidas = partidasLibro(d, cuentaId, { desde: sumarDias(fechas[0], -tol), hasta: sumarDias(fechas[fechas.length - 1], tol), conGastos: true });
  const vincular = (m, p, regla) => {
    p.conciliada = true;
    Object.assign(m, { estado: "conciliado", vinculos: [{ key: p.key, tipo: p.tipo, monto: p.monto, descripcion: p.descripcion }], regla, conciliadoPor: usuarioId, conciliadoEn: ahora });
    res.conciliados++; res[regla === "referencia" ? "porReferencia" : "porMontoFecha"]++;
  };
  movs.forEach((m) => { const c = candidatosDe(m, partidas, tol); if (c.regla === "referencia") vincular(m, c.candidatos[0], "referencia"); });
  movs.forEach((m) => {
    if (m.estado === "conciliado") return;
    const c = candidatosDe(m, partidas, tol);
    if (c.estado === "sugerido") return vincular(m, c.candidatos[0], c.regla);
    m.estado = c.estado;
    if (c.estado === "ambiguo") res.ambiguos++; else res.sinPartida++;
  });
  return res;
}

/** Saldo en bancos, partidas en tránsito, diferencias por aclarar y saldo en libros de una cuenta al cierre de un mes. */
export function resumenConciliacion(d, cuentaId, mes) {
  const c = cuentaBancaria(d, cuentaId);
  if (!c) return null;
  const { desde, hasta } = rangoMes(mes);
  const todos = lista(d, "movimientos").filter((m) => m.cuentaId === cuentaId);
  const movs = todos.filter((m) => enRango(m.fecha, desde, hasta));
  const abonos = sumar(movs.filter((m) => m.monto > 0), (m) => m.monto), cargos = sumar(movs.filter((m) => m.monto < 0), (m) => -m.monto);
  const saldoInicial = redondear((c.saldoInicial || 0) + sumar(todos.filter((m) => m.fecha < desde && m.fecha >= (c.saldoFecha || "")), (m) => m.monto));
  const saldoBanco = redondear(saldoInicial + abonos - cargos);
  const transito = partidasLibro(d, cuentaId, { desde: c.saldoFecha || desde, hasta }).filter((p) => !p.conciliada);
  const transitoAbonos = transito.filter((p) => p.monto > 0), transitoCargos = transito.filter((p) => p.monto < 0);
  const pendientes = movs.filter((m) => PENDIENTES_MOV.includes(m.estado));
  const porAclarar = sumar(pendientes, (m) => m.monto);
  const totalTA = sumar(transitoAbonos, (p) => p.monto), totalTC = sumar(transitoCargos, (p) => -p.monto);
  const cierre = lista(d, "conciliaciones").find((x) => x.cuentaId === cuentaId && x.mes === mes && x.estado === "cerrada") || null;
  return {
    cuenta: c, mes, movimientos: movs, saldoInicial, abonos, cargos, saldoBanco,
    conciliados: movs.filter((m) => m.estado === "conciliado").length, pendientes, porAclarar,
    transitoAbonos, transitoCargos, totalTransitoAbonos: totalTA, totalTransitoCargos: totalTC,
    // Saldo en libros = banco + depósitos en tránsito − cargos en tránsito − lo que el banco trae y aún no se reconoce en libros.
    saldoLibros: redondear(saldoBanco + totalTA - totalTC - porAclarar), cierre, cerrada: !!cierre,
  };
}
export const conciliacionCerrada = (d, cuentaId, fecha) => lista(d, "conciliaciones").some((x) => x.cuentaId === cuentaId && x.mes === String(fecha).slice(0, 7) && x.estado === "cerrada");

// ───────── CSV del estado de cuenta (porte de lib/finanzas/conciliacion.js)
function partirLinea(l, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
export function parsearCSV(texto) {
  const lineas = String(texto ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { encabezados: [], filas: [], separador: "," };
  const sep = [",", ";", "\t"].map((s) => [s, lineas[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  return { encabezados: partirLinea(lineas[0], sep), filas: lineas.slice(1).map((l) => partirLinea(l, sep)), separador: sep };
}
/** '$1,234.50', '(500.00)', '-80' → número; vacío o inválido → null. */
export function parsearMonto(v) {
  if (v == null || v === "") return null;
  let s = String(v).trim(), neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s]/g, "");
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return neg ? -Number(s) : Number(s);
}
/** Fecha según formato 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' → 'YYYY-MM-DD' o null. */
export function parsearFecha(v, formato = "DD/MM/YYYY") {
  const p = String(v ?? "").trim().split(/[-/.]/).map((x) => x.trim());
  if (p.length !== 3 || p.some((x) => !/^\d+$/.test(x))) return null;
  let y, m, dd;
  const f = formato.toUpperCase();
  if (p[0].length === 4 || f.startsWith("YYYY")) [y, m, dd] = p; else if (f.startsWith("DD")) [dd, m, y] = p; else [m, dd, y] = p;
  if (y.length === 2) y = "20" + y;
  const iso = `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const t = new Date(Number(y), Number(m) - 1, Number(dd));
  return t.getFullYear() === Number(y) && t.getMonth() === Number(m) - 1 && t.getDate() === Number(dd) ? iso : null;
}
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Propone el mapeo de columnas a partir de los encabezados del archivo. */
export function detectarMapeo(encabezados) {
  const h = encabezados.map(sinAcentos);
  const buscar = (...claves) => { const i = h.findIndex((x) => claves.some((c) => x === c || x.startsWith(c))); return i >= 0 ? encabezados[i] : ""; };
  return {
    fecha: buscar("fecha", "dia", "date"), descripcion: buscar("descripcion", "concepto", "detalle", "movimiento"), referencia: buscar("referencia", "ref", "folio"),
    monto: buscar("monto", "importe"), cargo: buscar("cargo", "retiro", "debito"), abono: buscar("abono", "deposito", "credito"), formatoFecha: "DD/MM/YYYY",
  };
}
/** Aplica el mapeo → { filas:[{fecha, descripcion, monto, referencia}], errores:[{linea, motivo}] }. Con cargo/abono, monto = abono − cargo. */
export function aplicarMapeo({ encabezados, filas }, mapeo) {
  const idx = (n) => (n ? encabezados.findIndex((x) => sinAcentos(x) === sinAcentos(n)) : -1);
  const iF = idx(mapeo.fecha), iD = idx(mapeo.descripcion), iM = idx(mapeo.monto), iR = idx(mapeo.referencia), iC = idx(mapeo.cargo), iA = idx(mapeo.abono);
  const errores = [], out = [];
  if (iF < 0) errores.push({ linea: 1, motivo: "No se encontró la columna de fecha." });
  if (iM < 0 && iA < 0 && iC < 0) errores.push({ linea: 1, motivo: "No se encontró la columna de monto (ni cargo/abono)." });
  if (errores.length) return { filas: out, errores };
  filas.forEach((r, i) => {
    const fecha = parsearFecha(r[iF], mapeo.formatoFecha);
    const monto = iM >= 0 ? parsearMonto(r[iM]) : (parsearMonto(r[iA]) ?? 0) - (parsearMonto(r[iC]) ?? 0);
    if (!fecha) return errores.push({ linea: i + 2, motivo: "Fecha inválida." });
    if (monto == null || monto === 0) return errores.push({ linea: i + 2, motivo: "Monto vacío o inválido." });
    out.push({ fecha, descripcion: iD >= 0 ? r[iD] || "" : "", monto: redondear(monto), referencia: iR >= 0 ? r[iR] || "" : "" });
  });
  return { filas: out, errores };
}
const csvCelda = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/**
 * Estado de cuenta de EJEMPLO (demostración): toma las partidas en tránsito de la cuenta y las presenta como las traería el banco,
 * más una comisión y un depósito que nadie registró, para que la conciliación automática tenga qué emparejar y qué dejar por aclarar.
 */
export function csvEjemplo(d, cuentaId, ref = hoy()) {
  const c = cuentaBancaria(d, cuentaId);
  if (!c) return "";
  const mes = ref.slice(0, 7);
  const transito = partidasLibro(d, cuentaId, { desde: c.saldoFecha || `${mes}-01`, hasta: ref }).filter((p) => !p.conciliada).slice(-24);
  const fmx = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
  const lin = [["Fecha", "Descripción", "Referencia", "Cargo", "Abono"]];
  transito.forEach((p, i) => {
    const f = p.tipo === "lote_tarjeta" || p.tipo === "en_linea" ? (sumarDias(p.fecha, 1) > ref ? ref : sumarDias(p.fecha, 1)) : p.fecha;
    const desc = { transferencia: "SPEI RECIBIDO", lote_tarjeta: "LIQUIDACION TERMINAL PUNTO DE VENTA", deposito_efectivo: "DEPOSITO EN EFECTIVO VENTANILLA", en_linea: "LIQUIDACION PASARELA DE PAGOS", pago_proveedor: "SPEI ENVIADO PROVEEDOR", reposicion_fondo: "TRASPASO FONDO REVOLVENTE" }[p.tipo] || "MOVIMIENTO";
    lin.push([fmx(f), desc, i % 4 === 3 ? "" : p.referencia, p.monto < 0 ? (-p.monto).toFixed(2) : "", p.monto > 0 ? p.monto.toFixed(2) : ""]);
  });
  lin.push([fmx(ref), "COMISION POR MANEJO DE CUENTA", "COM-EJEMPLO", "185.00", ""]);
  lin.push([fmx(ref), "DEPOSITO NO IDENTIFICADO", "", "", "1250.00"]);
  return "﻿" + lin.map((l) => l.map(csvCelda).join(",")).join("\r\n");
}

// ═════════════════════════ Fondo revolvente (P-095)
export const fondoDe = (d, sucursalId) => lista(d, "fondos").find((f) => f.sucursalId === sucursalId && f.activo !== false) || null;
export const movsFondo = (d, fondoId) => lista(d, "fondoMovs").filter((m) => m.fondoId === fondoId);
/** Efectivo que debe haber en la caja chica = asignado − gastos + reposiciones ± ajustes. */
export const saldoFondo = (d, fondoId, hasta = null) => sumar(movsFondo(d, fondoId).filter((m) => !hasta || dia(m.fecha) <= hasta), (m) => m.monto);
export function usoFondo(montoBase, gastado, alertaPct = PARAMS_TES.fondoAlertaPct) {
  const pct = montoBase > 0 ? Math.round((gastado / montoBase) * 1000) / 10 : 0;
  return { pct, disponible: redondear(montoBase - gastado), alerta: pct >= alertaPct, agotado: gastado >= montoBase };
}
/** Arqueo: contado contra esperado. Una diferencia mayor a la tolerancia la revisa Administración. */
export function arqueoFondo(esperado, contado, tolerancia = PARAMS_TES.toleranciaArqueo) {
  const dif = redondear(Number(contado) - Number(esperado));
  return { esperado: redondear(esperado), contado: redondear(contado), diferencia: dif, requiereRevision: Math.abs(dif) > tolerancia, estado: Math.abs(dif) < 0.005 ? "conforme" : Math.abs(dif) > tolerancia ? "por_revisar" : "diferencia_menor" };
}
/** Estado del fondo de una sucursal: saldo, gastado por reponer, uso, último arqueo, reposición en trámite. */
export function estadoFondo(d, fondoId) {
  const f = lista(d, "fondos").find((x) => x.id === fondoId);
  if (!f) return null;
  const movs = movsFondo(d, fondoId).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const saldo = sumar(movs, (m) => m.monto);
  const porReponer = Math.max(0, redondear(f.montoBase - saldo));
  const repos = lista(d, "reposiciones").filter((x) => x.fondoId === fondoId);
  const arqueos = lista(d, "arqueos").filter((x) => x.fondoId === fondoId).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return {
    fondo: f, saldo, porReponer, uso: usoFondo(f.montoBase, porReponer, f.alertaPct || paramsTes(d).fondoAlertaPct), movimientos: movs.slice().reverse(),
    ultimaReposicion: repos.filter((x) => x.estado === "autorizada").sort((a, b) => String(b.resueltaEn).localeCompare(String(a.resueltaEn)))[0] || null,
    reposicionPendiente: repos.find((x) => x.estado === "solicitada") || null,
    ultimoArqueo: arqueos[0] || null, arqueos, reposiciones: repos.sort((a, b) => String(b.solicitadaEn).localeCompare(String(a.solicitadaEn))),
  };
}

// ═════════════════════════ Depósitos de efectivo y resumen semanal (P-088, P-059)
const difTurno = (t) => (t && t.corte && Array.isArray(t.corte.filas) ? redondear(t.corte.filas.reduce((a, f) => a + (f.diferencia || 0), 0)) : 0);
const fechaCorte = (t) => dia(t.cerradoEn || (t.corte && t.corte.fecha) || t.abiertoEn || "");
/** Efectivo a depositar de un turno con corte: lo contado en efectivo menos el fondo fijo de la caja (P-059). */
export function efectivoDeCorte(t) {
  const f = t && t.corte && (t.corte.filas || []).find((x) => x.forma === "efectivo");
  return f ? Math.max(0, redondear(f.contado - (t.fondo || 0))) : 0;
}
/** Cortes de caja cerrados que aún no tienen ficha de depósito registrada. */
export function cortesSinDeposito(d, sucursalId = null) {
  const con = new Set(lista(d, "depositos").map((x) => x.turnoId).filter(Boolean));
  return (d.turnos || []).filter((t) => t.corte && t.estado === "cerrado" && !con.has(t.id) && (!sucursalId || t.sucursalId === sucursalId) && efectivoDeCorte(t) > 0);
}

/**
 * Resumen de una semana de corte para una sucursal (o las que se indiquen): cobrado por forma de pago y origen, gastos por categoría,
 * depósitos de efectivo, diferencias de caja y pendientes. Todo es aditivo: el consolidado es la suma de las sucursales.
 */
export function resumenSemana(d, { inicio, sucursalId = null, ref = hoy() }) {
  const sem = semanaCorte(inicio, paramsTes(d).semanaDow);
  const filas = ingresosDe(d, { desde: sem.inicio, hasta: sem.fin, sucursalId });
  const ing = totalesIngresos(filas);
  const fondo = gastosDeFondo(d);
  const gastos = ((d.fin && d.fin.gastos) || []).filter((g) => enRango(g.fecha, sem.inicio, sem.fin) && (!sucursalId || g.sucursalId === sucursalId));
  const porCategoria = {};
  gastos.forEach((g) => { porCategoria[g.categoria] = redondear((porCategoria[g.categoria] || 0) + g.monto); });
  const totalGastos = sumar(gastos, (g) => g.monto), gastosFondo = sumar(gastos.filter((g) => fondo.has(g.id)), (g) => g.monto);
  const usadas = clavesConciliadas(d);
  // Los depósitos se atribuyen a la semana del efectivo que amparan (día de venta), no a la del día en que se llevó al banco.
  const deps = lista(d, "depositos").filter((x) => enRango(x.diaVenta || x.fecha, sem.inicio, sem.fin) && (!sucursalId || x.sucursalId === sucursalId));
  const depositado = sumar(deps, (x) => x.monto), enBanco = sumar(deps.filter((x) => usadas.has(`D:${x.id}`)), (x) => x.monto);
  const efectivo = ing.porForma.efectivo || 0;
  const turnos = (d.turnos || []).filter((t) => t.corte && enRango(fechaCorte(t), sem.inicio, sem.fin) && (!sucursalId || t.sucursalId === sucursalId));
  let faltante = 0, sobrante = 0;
  turnos.forEach((t) => { const x = difTurno(t); if (x < 0) faltante += -x; else sobrante += x; });
  const cortesPend = turnos.filter((t) => t.corte.estado === "diferencia_pendiente");
  const pendientes = [];
  const porDepositar = redondear(Math.max(0, efectivo - depositado));
  if (porDepositar > 0.5) pendientes.push({ tipo: "deposito", tono: "warn", texto: `Efectivo cobrado sin ficha de depósito: ${porDepositar.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}` });
  if (depositado - enBanco > 0.5) pendientes.push({ tipo: "transito", tono: "info", texto: `Depósitos registrados que el banco aún no refleja: ${redondear(depositado - enBanco).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}` });
  cortesPend.forEach((t) => pendientes.push({ tipo: "corte", tono: "bad", texto: `Corte con diferencia sin resolver en ${R.nombreSucursal(d, t.sucursalId)} (${difTurno(t)})` }));
  if (ref >= sem.inicio && ref <= sem.fin) {
    (d.turnos || []).filter((t) => t.estado === "abierto" && dia(t.abiertoEn) < ref && (!sucursalId || t.sucursalId === sucursalId)).forEach((t) => pendientes.push({ tipo: "turno", tono: "warn", texto: `Turno de caja abierto desde un día anterior en ${R.nombreSucursal(d, t.sucursalId)}` }));
    const aut = (d.autorizaciones || []).filter((a) => a.estado === "pendiente" && (!sucursalId || a.sucursalId === sucursalId)).length;
    if (aut) pendientes.push({ tipo: "autorizacion", tono: "warn", texto: `${aut} ${aut === 1 ? "autorización pendiente" : "autorizaciones pendientes"}` });
    lista(d, "reposiciones").filter((x) => x.estado === "solicitada" && (!sucursalId || x.sucursalId === sucursalId)).forEach((x) => pendientes.push({ tipo: "reposicion", tono: "info", texto: `Reposición de fondo por autorizar en ${R.nombreSucursal(d, x.sucursalId)}` }));
    lista(d, "arqueos").filter((x) => x.estado === "por_revisar" && (!sucursalId || x.sucursalId === sucursalId)).forEach((x) => pendientes.push({ tipo: "arqueo", tono: "bad", texto: `Arqueo de fondo con diferencia por revisar en ${R.nombreSucursal(d, x.sucursalId)}` }));
  }
  return {
    semana: sem, sucursalId, filas, gastosDet: gastos,
    ingresos: { total: ing.total, n: ing.n, porForma: ing.porForma, porOrigen: ing.porOrigen, porDia: ing.porDia },
    gastos: { total: totalGastos, n: gastos.length, porCategoria, fondo: gastosFondo },
    depositos: { n: deps.length, registrado: depositado, enBanco, enTransito: redondear(depositado - enBanco), efectivoCobrado: efectivo, porDepositar },
    caja: { cortes: turnos.length, faltante: redondear(faltante), sobrante: redondear(sobrante), pendientes: cortesPend.length },
    pendientes, neto: redondear(ing.total - totalGastos),
  };
}
/** Una fila por sucursal + el consolidado (suma exacta de las filas). */
export function resumenSemanaPorSucursal(d, inicio, sucursales = d.sucursales, ref = hoy()) {
  const filas = sucursales.map((s) => {
    const r = resumenSemana(d, { inicio, sucursalId: s.id, ref });
    return {
      sucursalId: s.id, nombre: s.nombre, ingresos: r.ingresos.total, efectivo: r.ingresos.porForma.efectivo || 0, tarjeta: r.ingresos.porForma.tarjeta || 0,
      transferencia: r.ingresos.porForma.transferencia || 0, enLinea: r.ingresos.porForma.en_linea || 0, gastos: r.gastos.total, depositado: r.depositos.registrado,
      porDepositar: r.depositos.porDepositar, diferencia: redondear(r.caja.sobrante - r.caja.faltante), pendientes: r.pendientes.length, neto: r.neto,
    };
  });
  const campos = ["ingresos", "efectivo", "tarjeta", "transferencia", "enLinea", "gastos", "depositado", "porDepositar", "diferencia", "pendientes", "neto"];
  const consolidado = { sucursalId: "CAD", nombre: "Consolidado" };
  campos.forEach((k) => { consolidado[k] = sumar(filas, (f) => f[k]); });
  return { filas, consolidado };
}

// ═════════════════════════ Cierres de periodo mensual por sucursal (P-099)
export const cierreDe = (d, sucursalId, mes) => lista(d, "cierres").find((c) => c.sucursalId === sucursalId && c.mes === mes) || null;
/**
 * ¿La fecha cae en un periodo CERRADO de esa sucursal? Un periodo cerrado es de solo lectura: ningún módulo debe crear, editar
 * ni borrar movimientos con fecha dentro de él (los ajustes van en el periodo vigente). Sin sucursal (movimientos de la cadena)
 * se considera cerrado cuando TODAS las sucursales tienen cerrado ese mes.
 */
export function periodoCerrado(d, sucursalId, fecha) {
  const mes = String(fecha || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) return false;
  const cerrado = (sid) => { const c = cierreDe(d, sid, mes); return !!c && c.estado === "cerrado"; };
  if (sucursalId && (d.sucursales || []).some((s) => s.id === sucursalId)) return cerrado(sucursalId);
  return (d.sucursales || []).length > 0 && d.sucursales.every((s) => cerrado(s.id));
}
export const MSG_PERIODO_CERRADO = "El periodo está cerrado: es de solo lectura. Registra el ajuste en el periodo vigente o pide a Dirección que lo reabra.";
export const ESTADOS_CIERRE = { abierto: ["Abierto", "neutral"], cerrado: ["Cerrado", "ok"], reabierto: ["Reabierto", "warn"] };
export const estadoCierre = (d, sucursalId, mes) => { const c = cierreDe(d, sucursalId, mes); return c ? c.estado : "abierto"; };

/** Recurrentes activos de la sucursal sin gasto generado en el mes (misma regla que finanzas, sin importar core). */
export function recurrentesFaltantes(d, sucursalId, mes) {
  const hechos = new Set(((d.fin && d.fin.gastos) || []).filter((g) => g.recurrenteId && g.fecha.slice(0, 7) === mes).map((g) => g.recurrenteId));
  return ((d.fin && d.fin.recurrentes) || []).filter((r) => r.activo && r.sucursalId === sucursalId && !hechos.has(r.id));
}

/**
 * Lista de verificación del cierre mensual de una sucursal (P-099). Cada punto: { k, texto, ok, bloquea, detalle }.
 * Los que «bloquean» impiden cerrar; los demás son advertencias que quien cierra debe aceptar expresamente (queda en el cierre).
 */
export function checklistCierre(d, sucursalId, mes, ref = hoy()) {
  const { desde, hasta } = rangoMes(mes);
  const dentroMes = (f) => enRango(f, desde, hasta);
  const turnos = (d.turnos || []).filter((t) => t.sucursalId === sucursalId);
  const difPend = turnos.filter((t) => t.corte && t.corte.estado === "diferencia_pendiente" && dentroMes(fechaCorte(t)));
  const abiertos = turnos.filter((t) => t.estado === "abierto" && dentroMes(t.abiertoEn));
  const ing = ingresosDe(d, { desde, hasta, sucursalId });
  const efectivo = sumar(ing.filter((f) => f.forma === "efectivo"), (f) => f.monto);
  const depositado = sumar(lista(d, "depositos").filter((x) => x.sucursalId === sucursalId && dentroMes(x.diaVenta || x.fecha)), (x) => x.monto);
  const porDepositar = redondear(Math.max(0, efectivo - depositado));
  const cta = cuentaDeSucursal(d, sucursalId);
  const conc = cta ? conciliacionCerrada(d, cta.id, desde) : false;
  const f = fondoDe(d, sucursalId);
  const repPend = f ? lista(d, "reposiciones").filter((x) => x.fondoId === f.id && x.estado === "solicitada") : [];
  const arqRev = f ? lista(d, "arqueos").filter((x) => x.fondoId === f.id && x.estado === "por_revisar" && dentroMes(x.fecha)) : [];
  const recs = recurrentesFaltantes(d, sucursalId, mes);
  const aut = (d.autorizaciones || []).filter((a) => a.estado === "pendiente" && a.sucursalId === sucursalId && dentroMes(a.fecha || a.creada || ref));
  const tol = paramsTes(d).toleranciaArqueo;
  return [
    { k: "terminado", texto: "El mes ya terminó", ok: hasta < ref, bloquea: true, detalle: hasta < ref ? "" : `Se puede cerrar a partir del ${sumarDias(hasta, 1)}.` },
    { k: "cortes", texto: "Cortes de caja sin diferencias por resolver", ok: !difPend.length, bloquea: true, detalle: difPend.length ? `${difPend.length} corte(s) con diferencia pendiente: el gerente debe resolverlos.` : "" },
    { k: "turnos", texto: "Sin turnos de caja abiertos del mes", ok: !abiertos.length, bloquea: true, detalle: abiertos.length ? `${abiertos.length} turno(s) abierto(s).` : "" },
    { k: "depositos", texto: "Efectivo cobrado depositado al banco", ok: porDepositar <= tol, bloquea: false, detalle: porDepositar > tol ? `Falta ficha de depósito por ${porDepositar.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}.` : "" },
    { k: "conciliacion", texto: "Conciliación bancaria del mes cerrada", ok: conc, bloquea: false, detalle: !cta ? "La sucursal no tiene cuenta bancaria registrada." : conc ? "" : `Cuenta ${cta.alias}: concilia y cierra el mes en Conciliación bancaria.` },
    { k: "fondo", texto: "Fondo revolvente sin reposiciones ni arqueos pendientes", ok: !repPend.length && !arqRev.length, bloquea: false, detalle: [repPend.length ? "reposición por autorizar" : "", arqRev.length ? "arqueo con diferencia por revisar" : ""].filter(Boolean).join(" · ") },
    { k: "recurrentes", texto: "Gastos recurrentes del mes generados", ok: !recs.length, bloquea: false, detalle: recs.length ? `Faltan: ${recs.map((r) => r.concepto).join(", ")}.` : "" },
    { k: "autorizaciones", texto: "Sin autorizaciones pendientes", ok: !aut.length, bloquea: false, detalle: aut.length ? `${aut.length} pendiente(s).` : "" },
  ];
}
export const puedeCerrarChecklist = (lst) => lst.every((x) => x.ok || !x.bloquea);
export const advertenciasChecklist = (lst) => lst.filter((x) => !x.ok && !x.bloquea);

// ═════════════════════════ KPIs (porte de lib/finanzas/kpis.js)
/** Variación porcentual contra el periodo anterior (null si no hay base). */
export const variacionPeriodo = (actual, anterior) => (Number(anterior) ? Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10 : null);
export const margenPct = (ingresos, gastos) => (ingresos > 0 ? Math.round(((ingresos - gastos) / ingresos) * 1000) / 10 : null);
export const ocupacionPct = (ocupado, disponible) => (disponible > 0 ? Math.min(100, Math.round((ocupado / disponible) * 1000) / 10) : null);
/** Agrupa y suma → [{ clave, total, n, pct }] de mayor a menor. */
export function agruparSuma(filas, clave, campo = "monto") {
  const m = new Map();
  (filas || []).forEach((f) => {
    const k = (typeof clave === "function" ? clave(f) : f[clave]) ?? "Sin dato";
    const a = m.get(k) || { clave: k, total: 0, n: 0 };
    a.total += Number(typeof campo === "function" ? campo(f) : f[campo]) || 0; a.n++; m.set(k, a);
  });
  const arr = [...m.values()].map((a) => ({ ...a, total: redondear(a.total) })).sort((a, b) => b.total - a.total);
  const t = arr.reduce((s, g) => s + g.total, 0);
  return arr.map((g) => ({ ...g, pct: t ? Math.round((g.total / t) * 1000) / 10 : 0 }));
}
