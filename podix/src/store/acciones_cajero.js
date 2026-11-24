// Lógica del cajero: cálculo de totales, pago mixto, planes, abonos con mora, arqueo y las operaciones de caja.
// Las funciones "puras" no tocan el estado. Las operaciones reciben el borrador `d` y se llaman DENTRO de mutar():
//   const r = mutar((d) => cobrarVenta(d, op));   →  { ok, error?, ... }
// Todas validan el rol (solo cajero) y la sucursal activa; las de cobro exigen turno abierto.
import { folio, auditar, registrarOp, uid } from "./core.js";
import * as R from "./reglas.js";
import { pedirAutorizacion } from "./reglas.js";
import { redondear, hoy, ahoraLocal, sumarDias, dinero } from "../lib/format.js";

export const FORMAS = ["efectivo", "tarjeta", "transferencia"];
export const FORMA_LABEL = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", en_linea: "Pago en línea" };
export const DESCUENTO_LIBRE_PCT = 10;          // descuento manual libre; mayor pide autorización (pendiente PA-V6)
export const ENGANCHE_MIN_PCT = 20;             // enganche mínimo en ventas a plazos (supuesto, pendiente CR4)
export const INTERVALO_DIAS = 15;               // parcialidades quincenales
export const DIAS_CREDITO_ABIERTO = 30;
const RANGO_NIVEL = { gerente: 1, admin: 2, direccion: 3 };
const hhmm = () => ahoraLocal().slice(11, 16);
export const num = (s) => { const n = parseFloat(String(s ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
export const nivelMax = (a, b) => ((RANGO_NIVEL[a] || 0) >= (RANGO_NIVEL[b] || 0) ? a : b);

// ───────────────────────── Puras ─────────────────────────

/** Partida de catálogo con precio de la sucursal (lista base + ajuste). */
export function partidaCatalogo(d, sucursalId, tipo, itemId, cant = 1) {
  const it = R.itemCatalogo(d, tipo, itemId);
  if (!it) return null;
  const precio = R.precioFinal(d, sucursalId, tipo, itemId);
  return { tipo, itemId, nombre: it.nombre, cant, precioLista: it.precioBase, ajustePct: R.ajustePct(d, sucursalId, tipo, itemId), precio, importe: redondear(precio * cant) };
}

/** Subtotal, descuento de convenio (automático) y manual (libre hasta 10 %), total. */
export function calcularTotales(partidas, { convenioPct = 0, descManualPct = 0 } = {}) {
  const subtotal = redondear(partidas.reduce((a, p) => a + (p.importe ?? p.precio * p.cant), 0));
  const cPct = Math.min(100, Math.max(0, Number(convenioPct) || 0));
  const mPct = Math.min(100, Math.max(0, Number(descManualPct) || 0));
  const descConvenio = redondear(subtotal * cPct / 100);
  const descManual = redondear((subtotal - descConvenio) * mPct / 100);
  const descuento = redondear(descConvenio + descManual);
  return { subtotal, descConvenio, descManual, descuento, total: redondear(subtotal - descuento), requiereAutorizacion: mPct > DESCUENTO_LIBRE_PCT, convenioPct: cPct, manualPct: mPct };
}

/** Valida pago mixto. pagos = { efectivo, tarjeta, transferencia } (números o texto). Devuelve pagos netos y cambio. */
export function validarPagos(pagos, total) {
  const e = redondear(num(pagos.efectivo)), t = redondear(num(pagos.tarjeta)), x = redondear(num(pagos.transferencia));
  const val = { efectivo: e, tarjeta: t, transferencia: x };
  if (e < 0 || t < 0 || x < 0) return { ok: false, error: "Los montos no pueden ser negativos.", suma: 0, falta: total, cambio: 0, pagos: [] };
  const suma = redondear(e + t + x);
  const falta = redondear(Math.max(0, total - suma));
  if (!(total > 0)) return { ok: false, error: "No hay nada que cobrar.", suma, falta: 0, cambio: 0, pagos: [] };
  if (suma + 0.0001 < total) return { ok: false, error: `Faltan ${dinero(falta)} para completar el total.`, suma, falta, cambio: 0, pagos: [] };
  if (redondear(t + x) > total + 0.0001) return { ok: false, error: "Tarjeta y transferencia no pueden exceder el total (solo el efectivo da cambio).", suma, falta: 0, cambio: 0, pagos: [] };
  const cambio = redondear(Math.max(0, suma - total));
  const netos = FORMAS.map((f) => ({ forma: f, monto: f === "efectivo" ? redondear(val.efectivo - cambio) : val[f] })).filter((p) => p.monto > 0);
  return { ok: true, suma, falta: 0, cambio, pagos: netos };
}

const sumaPagos = (pagos) => redondear((pagos || []).reduce((a, p) => a + (Number(p.monto) || 0), 0));
const pagosOk = (pagos, monto) => Array.isArray(pagos) && pagos.length > 0 && pagos.every((p) => FORMAS.includes(p.forma) && p.monto > 0) && Math.abs(sumaPagos(pagos) - monto) < 0.005;

/** Parcialidades de un plan. plazos: n quincenas; abierto: una sola, a 30 días. La última absorbe el residuo de centavos. */
export function generarParcialidades({ tipo, monto, enganche = 0, n = 1, base = hoy() }) {
  const fin = redondear(monto - enganche);
  if (tipo === "abierto") return [{ n: 1, vence: sumarDias(base, DIAS_CREDITO_ABIERTO), capital: fin, pagado: 0 }];
  const cap = Math.floor((fin / n) * 100) / 100;
  return Array.from({ length: n }, (_, k) => ({ n: k + 1, vence: sumarDias(base, INTERVALO_DIAS * (k + 1)), capital: k === n - 1 ? redondear(fin - cap * (n - 1)) : cap, pagado: 0 }));
}
export const enganchaMinimo = (monto) => redondear(monto * ENGANCHE_MIN_PCT / 100);

/** Simulación del plan con los parámetros de la sucursal (recargo único o interés mensual, días de gracia). */
export function simularPlan(params, { tipo, monto, enganche = 0, n = 1, base = hoy() }) {
  const parcialidades = generarParcialidades({ tipo, monto, enganche, n, base });
  const financiado = redondear(monto - enganche);
  return {
    financiado, parcialidades,
    recargoPorParcialidad: tipo === "plazos" ? parcialidades.map((p) => redondear(p.capital * params.recargoUnicoPct / 100)) : [],
    interesMensual: tipo === "abierto" ? redondear(financiado * params.interesMensualPct / 100) : 0,
    diasGracia: params.diasGracia,
  };
}

/** Deuda de una parcialidad: capital pendiente + mora aún no cobrada (la mora cobrada se descuenta: el recargo es único). */
export function deudaParcialidad(plan, p, params, ref = hoy()) {
  const capital = redondear(p.capital - (p.pagado || 0));
  if (capital <= 0) return { capital: 0, mora: 0, total: 0, estado: "pagada" };
  const m = R.moraParcialidad(plan, p, params, ref);
  const mora = Math.max(0, redondear(m.interes + m.recargo - (p.moraCobrada || 0)));
  return { capital, mora, total: redondear(capital + mora), estado: R.estadoParcialidad(p, params, ref), interes: m.interes, recargo: m.recargo };
}
export function deudaPlan(plan, params, ref = hoy()) {
  let capital = 0, mora = 0, vencido = 0;
  plan.parcialidades.forEach((p) => {
    const x = deudaParcialidad(plan, p, params, ref);
    capital += x.capital; mora += x.mora;
    if (x.estado === "vencida") vencido += x.total;
  });
  return { capital: redondear(capital), mora: redondear(mora), total: redondear(capital + mora), vencido: redondear(vencido) };
}

/** Reparte un abono: parcialidades más antiguas primero; en cada una primero la mora y luego el capital (supuesto, pendiente CR3). */
export function repartirAbono(plan, params, monto, ref = hoy()) {
  const deuda = deudaPlan(plan, params, ref);
  if (!(monto > 0)) return { ok: false, error: "Captura un monto mayor a cero.", aplicaciones: [], mora: 0, capital: 0, deuda };
  if (monto > deuda.total + 0.005) return { ok: false, error: `El abono excede la deuda (${dinero(deuda.total)}).`, aplicaciones: [], mora: 0, capital: 0, deuda };
  let resta = redondear(monto), mora = 0, capital = 0;
  const aplicaciones = [];
  const orden = [...plan.parcialidades].sort((a, b) => a.vence.localeCompare(b.vence) || a.n - b.n);
  for (const p of orden) {
    if (resta <= 0) break;
    const x = deudaParcialidad(plan, p, params, ref);
    if (x.total <= 0) continue;
    const m = Math.min(resta, x.mora); resta = redondear(resta - m);
    const c = Math.min(resta, x.capital); resta = redondear(resta - c);
    if (m + c > 0) { aplicaciones.push({ n: p.n, mora: redondear(m), capital: redondear(c) }); mora += m; capital += c; }
  }
  return { ok: true, aplicaciones, mora: redondear(mora), capital: redondear(capital), deuda };
}

/** Arqueo por forma de pago: esperado vs contado. */
export function arqueo(esperado, contado) {
  const formas = [...new Set([...FORMAS, ...Object.keys(esperado || {})])];
  const filas = formas.map((forma) => {
    const e = redondear(esperado?.[forma] || 0), c = redondear(num(contado?.[forma]));
    return { forma, esperado: e, contado: c, diferencia: redondear(c - e) };
  });
  const hayDiferencia = filas.some((f) => Math.abs(f.diferencia) >= 0.005);
  return { filas, hayDiferencia, estado: hayDiferencia ? "diferencia_pendiente" : "conforme" };
}

/** IVA (16 %) contenido en los productos del ticket, con descuento prorrateado. Supuesto de la demo: precios de producto con IVA incluido; servicios médicos sin IVA. */
export function ivaIncluido(v) {
  const prod = (v.partidas || []).filter((p) => p.tipo === "producto").reduce((a, p) => a + (Number(p.importe) || 0), 0);
  const base = (v.partidas || []).reduce((a, p) => a + (Number(p.importe) || 0), 0);
  if (!prod || !base) return 0;
  const neto = prod * (1 - (Number(v.descuento) || 0) / base);
  return Math.round((neto - neto / 1.16) * 100) / 100;
}

export function textoTicket(d, v) {
  const suc = R.nombreSucursal(d, v.sucursalId);
  const sd = d.sucursales.find((s) => s.id === v.sucursalId);
  const iva = ivaIncluido(v);
  const L = [`*Pie Clinic · ${suc}*`, ...(sd?.direccion ? [sd.direccion] : []), ...(sd?.telefono ? [`Tel. ${sd.telefono}${sd.movil ? ` · Móvil ${sd.movil}` : ""}`] : []), `Ticket ${v.folio} · ${String(v.fecha).replace("T", " ")}`, v.pacienteId ? `Paciente: ${R.nombrePaciente(d, v.pacienteId)}` : "Público general", ""];
  v.partidas.forEach((p) => L.push(`${p.cant} × ${p.nombre} — ${dinero(p.importe)}`));
  if (v.descuento) L.push(`Descuento: -${dinero(v.descuento)}`);
  if (iva) L.push(`IVA 16 % incluido (productos): ${dinero(iva)}`);
  L.push(`*Total: ${dinero(v.total)}*`, ...v.pagos.map((p) => `${FORMA_LABEL[p.forma]}: ${dinero(p.monto)}`));
  if (v.cambio) L.push(`Cambio: ${dinero(v.cambio)}`);
  L.push("", "¡Gracias por su visita!");
  return L.join("\n");
}

// ───────────────────────── Operaciones (dentro de mutar) ─────────────────────────

function ctx(d, { turno = true } = {}) {
  const u = d.usuarios.find((x) => x.id === d.sesion.userId);
  if (!u || u.rol !== "cajero") return { error: "Solo el cajero puede realizar esta operación." };
  const sucursalId = d.sesion.sucursalId;
  if (!sucursalId || !u.sucursales.includes(sucursalId)) return { error: "Sucursal no válida para este usuario." };
  const t = R.turnoAbierto(d, u.id);
  if (turno && (!t || t.sucursalId !== sucursalId)) return { error: "Abre tu turno en Caja antes de cobrar." };
  return { u, sucursalId, turno: t };
}
const falla = (error) => ({ ok: false, error });
function movs(d, turno, u, tipo, concepto, pagos) {
  pagos.forEach((p) => turno.movimientos.push({ id: uid("MV"), tipo, concepto, monto: redondear(p.monto), forma: p.forma, hora: hhmm(), por: u.id }));
}
function crearVenta(d, c, o) {
  const subtotal = redondear(o.partidas.reduce((a, p) => a + p.importe, 0));
  const v = {
    id: uid("VE"), folio: folio(d, "T"), sucursalId: c.sucursalId, cajeroId: c.u.id, pacienteId: o.pacienteId || null, consultaId: o.consultaId || null,
    tipo: o.tipo || "contado", fecha: ahoraLocal(), partidas: o.partidas, subtotal, descuento: o.descuento || 0, total: o.total ?? redondear(subtotal - (o.descuento || 0)),
    pagos: o.pagos.map((p) => ({ forma: p.forma, monto: redondear(p.monto) })), cambio: o.cambio || 0, estado: o.estado || "pagada",
    facturar: !!o.factura, factura: o.factura ? { ...o.factura, estado: "pendiente_timbrar" } : null,
    turnoId: o.turnoId === undefined ? c.turno.id : o.turnoId, vendedorId: o.vendedorId || null, ...(o.extra || {}),
  };
  d.ventas.push(v);
  return v;
}
function consumirProductos(d, sucursalId, partidas) {
  const need = {};
  partidas.filter((p) => p.tipo === "producto").forEach((p) => { need[p.itemId] = (need[p.itemId] || 0) + p.cant; });
  for (const [pid, n] of Object.entries(need)) {
    const disp = R.disponible(d, sucursalId, pid);
    if (disp < n) return { error: `Sin existencia de ${R.nombreProducto(d, pid)} (disponible: ${Math.max(0, disp)}).` };
  }
  return { ok: true };
}

/** Cobro de caja: consulta cerrada y/o venta de mostrador. */
export function cobrarVenta(d, op) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const consulta = op.consultaId ? d.consultas.find((x) => x.id === op.consultaId) : null;
  if (op.consultaId && (!consulta || consulta.estado !== "cerrada" || consulta.sucursalId !== c.sucursalId)) return falla("La consulta ya no está pendiente de cobro en esta sucursal.");
  const partidas = (op.partidas || []).filter((p) => p.cant > 0).map((p) => partidaCatalogo(d, c.sucursalId, p.tipo, p.itemId, p.cant)).filter(Boolean);
  if (!partidas.length) return falla("Agrega al menos una partida.");
  const t = calcularTotales(partidas, { convenioPct: op.convenioPct, descManualPct: op.descManualPct });
  if (!(t.total > 0)) return falla("El total debe ser mayor a cero.");
  if (!pagosOk(op.pagos, t.total)) return falla("El pago no coincide con el total.");
  const st = consumirProductos(d, c.sucursalId, partidas); if (st.error) return falla(st.error);
  const salidas = partidas.map((p) => {
    if (p.tipo !== "producto") return p;
    const r = R.salidaPEPS(d, c.sucursalId, p.itemId, p.cant);
    return { ...p, costo: redondear(r.costo / p.cant) }; // costo unitario PEPS
  });
  const v = crearVenta(d, c, {
    partidas: salidas, descuento: t.descuento, total: t.total, pagos: op.pagos, cambio: op.cambio, pacienteId: op.pacienteId, consultaId: consulta?.id,
    factura: op.facturar ? { rfc: String(op.facturar.rfc || "").toUpperCase(), usoCfdi: op.facturar.usoCfdi || "G03" } : null,
    vendedorId: consulta ? consulta.podologoId : null,
    extra: { descuentoDetalle: { convenioPct: t.convenioPct, convenio: t.descConvenio, manualPct: t.manualPct, manual: t.descManual } },
  });
  if (consulta) { consulta.estado = "cobrada"; consulta.ventaId = v.id; }
  if (t.requiereAutorizacion) {
    const a = pedirAutorizacion(d, { tipo: "descuento", sucursalId: c.sucursalId, solicitanteId: c.u.id, detalle: `Descuento ${t.manualPct}% en ${v.folio}`, monto: t.descManual, nivel: "gerente", ref: { ventaId: v.id, pct: t.manualPct } });
    v.autorizacionDescuentoId = a.id; v.pendiente = "PA-V6";
  }
  auditar(d, "venta_cobrada", "venta", v.id, `${v.folio} · ${dinero(v.total)}${t.requiereAutorizacion ? " · descuento por autorizar" : ""}`);
  registrarOp(d, "cobro", `${v.folio} · ${dinero(v.total)}`);
  return { ok: true, venta: v };
}

/** Anticipo de plantilla (orden de laboratorio): venta tipo anticipo_laboratorio ligada al turno. */
export function cobrarAnticipoLab(d, { ordenId, pagos }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const o = d.ordenesLab.find((x) => x.id === ordenId);
  if (!o || o.sucursalId !== c.sucursalId || !(o.anticipoPendiente > 0)) return falla("La orden no tiene anticipo pendiente en esta sucursal.");
  const monto = redondear(o.anticipoPendiente);
  if (!pagosOk(pagos, monto)) return falla("El pago no coincide con el anticipo.");
  const partida = { tipo: "anticipo", itemId: o.id, nombre: `Anticipo ${o.tipo} · ${o.folio}`, cant: 1, precioLista: monto, ajustePct: 0, precio: monto, importe: monto };
  const v = crearVenta(d, c, { partidas: [partida], total: monto, pagos, pacienteId: o.pacienteId, tipo: "anticipo_laboratorio", vendedorId: o.podologoId, extra: { ordenId: o.id } });
  o.anticipoPagado = redondear((o.anticipoPagado || 0) + monto); o.anticipoPendiente = 0;
  auditar(d, "anticipo_laboratorio", "orden_lab", o.id, `${o.folio} · ${dinero(monto)} · ${v.folio}`);
  registrarOp(d, "cobro", `${v.folio} anticipo ${o.folio}`);
  return { ok: true, venta: v };
}

// ── Apartados
export function crearApartado(d, { pacienteId, productoId, cant, anticipo, pagos }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const pac = d.pacientes.find((x) => x.id === pacienteId); if (!pac) return falla("Elige al paciente.");
  const prod = d.productos.find((x) => x.id === productoId && x.tipo === "venta"); if (!prod) return falla("Elige un producto de venta.");
  if (!(cant >= 1)) return falla("La cantidad debe ser al menos 1.");
  const disp = R.disponible(d, c.sucursalId, productoId);
  if (disp < cant) return falla(`Solo hay ${Math.max(0, disp)} disponibles en esta sucursal.`);
  const unit = R.precioFinal(d, c.sucursalId, "producto", productoId), precio = redondear(unit * cant);
  const min = R.anticipoMinimo(d, c.sucursalId, precio);
  if (anticipo + 0.005 < min) return falla(`El anticipo mínimo es ${dinero(min)} (${d.params[c.sucursalId].anticipoMinimoPct} %).`);
  if (anticipo > precio + 0.005) return falla("El anticipo no puede exceder el precio.");
  if (!pagosOk(pagos, anticipo)) return falla("El pago no coincide con el anticipo.");
  const ap = {
    id: uid("AP"), folio: folio(d, "AP"), pacienteId, sucursalId: c.sucursalId, productoId, nombre: prod.nombre, cant, precio, precioUnit: unit,
    abonos: [{ fecha: hoy(), monto: redondear(anticipo), pagos: pagos.map((p) => ({ ...p })), cajeroId: c.u.id }],
    creado: hoy(), vence: sumarDias(hoy(), d.params[c.sucursalId].vigenciaApartadoDias), estado: "activo", prorrogas: [],
  };
  d.apartados.unshift(ap);
  movs(d, c.turno, c.u, "anticipo", `Anticipo ${ap.folio}`, pagos);
  auditar(d, "apartado_creado", "apartado", ap.id, `${ap.folio} · ${prod.nombre} · anticipo ${dinero(anticipo)}`);
  registrarOp(d, "anticipo", `${ap.folio} anticipo ${dinero(anticipo)}`);
  return { ok: true, apartado: ap };
}
export function abonarApartado(d, { apartadoId, pagos }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const ap = d.apartados.find((x) => x.id === apartadoId);
  if (!ap || ap.estado !== "activo") return falla("El apartado ya no está activo.");
  if (R.estadoApartado(ap) === "vencido") return falla("El apartado está vencido: solicita prórroga o libéralo.");
  const monto = sumaPagos(pagos), saldo = R.saldoApartado(ap);
  if (!(monto > 0) || monto > saldo + 0.005) return falla(`El abono debe ser mayor a cero y no exceder el saldo (${dinero(saldo)}).`);
  ap.abonos.push({ fecha: hoy(), monto, pagos: pagos.map((p) => ({ ...p })), cajeroId: c.u.id, sucursalId: c.sucursalId });
  movs(d, c.turno, c.u, "abono_apartado", `Abono ${ap.folio}`, pagos);
  auditar(d, "apartado_abono", "apartado", ap.id, `${ap.folio} · ${dinero(monto)}`);
  registrarOp(d, "abono", `${ap.folio} abono ${dinero(monto)}`);
  return { ok: true, saldo: R.saldoApartado(ap) };
}
/** Entrega: solo con saldo en cero. Descuenta stock PEPS y crea la venta (los pagos ya entraron en los turnos como anticipo/abono). */
export function entregarApartado(d, { apartadoId }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const ap = d.apartados.find((x) => x.id === apartadoId);
  if (!ap || ap.estado !== "activo") return falla("El apartado ya no está activo.");
  if (ap.sucursalId !== c.sucursalId) return falla("El producto está apartado en otra sucursal: entrégalo ahí.");
  if (R.saldoApartado(ap) > 0.005) return falla("Aún hay saldo por liquidar.");
  const r = R.salidaPEPS(d, ap.sucursalId, ap.productoId, ap.cant);
  if (!r.ok) return falla("No hay existencia física para entregar (revisa inventario).");
  const prod = d.productos.find((x) => x.id === ap.productoId);
  const porForma = {};
  ap.abonos.forEach((a) => (a.pagos || [{ forma: "efectivo", monto: a.monto }]).forEach((p) => { porForma[p.forma] = redondear((porForma[p.forma] || 0) + p.monto); }));
  const pagos = Object.entries(porForma).map(([forma, monto]) => ({ forma, monto }));
  const partida = { tipo: "producto", itemId: ap.productoId, nombre: ap.nombre, cant: ap.cant, precioLista: prod ? prod.precioBase : ap.precio, ajustePct: R.ajustePct(d, ap.sucursalId, "producto", ap.productoId), precio: redondear(ap.precio / ap.cant), importe: ap.precio, costo: redondear(r.costo / ap.cant) };
  const v = crearVenta(d, { u: c.u, sucursalId: ap.sucursalId, turno: c.turno }, { partidas: [partida], total: ap.precio, pagos, pacienteId: ap.pacienteId, tipo: "apartado", turnoId: null, extra: { apartadoId: ap.id } });
  ap.estado = "entregado"; ap.ventaId = v.id; ap.entregado = hoy();
  auditar(d, "apartado_entregado", "apartado", ap.id, `${ap.folio} → ${v.folio}`);
  registrarOp(d, "entrega", `${ap.folio} entregado (${v.folio})`);
  return { ok: true, venta: v };
}
export function solicitarProrroga(d, { apartadoId }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const ap = d.apartados.find((x) => x.id === apartadoId);
  if (!ap || ap.estado !== "activo") return falla("El apartado ya no está activo.");
  if (d.autorizaciones.some((a) => a.tipo === "prorroga" && a.estado === "pendiente" && a.ref?.apartadoId === ap.id)) return falla("Ya hay una prórroga pendiente de autorizar.");
  const nivel = d.params[ap.sucursalId].prorrogaAutorizaRol || "gerente";
  const a = pedirAutorizacion(d, { tipo: "prorroga", sucursalId: ap.sucursalId, solicitanteId: c.u.id, detalle: `Prórroga apartado ${ap.folio}`, monto: 0, nivel, ref: { apartadoId: ap.id, dias: 5 } });
  auditar(d, "prorroga_solicitada", "apartado", ap.id, ap.folio);
  return { ok: true, autorizacion: a };
}
/** Después de liberarApartado(): aplica la política del anticipo (por defecto no se devuelve). */
export function aplicarPoliticaAnticipo(d, { apartadoId }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const ap = d.apartados.find((x) => x.id === apartadoId);
  if (!ap || ap.estado !== "liberado") return falla("El apartado no está liberado.");
  const pol = d.params[ap.sucursalId].politicaAnticipoVencido, monto = R.pagadoApartado(ap);
  if (pol === "devuelve" && monto > 0) {
    if (!c.turno) return falla("Abre turno para devolver el anticipo en caja.");
    movs(d, c.turno, c.u, "devolucion_anticipo", `Devolución anticipo ${ap.folio}`, [{ forma: "efectivo", monto: -monto }]);
    ap.anticipoResolucion = "devuelto";
  } else if (pol === "saldo_a_favor" && monto > 0) {
    (d.notasCredito ||= []).push({ id: uid("NC"), folio: folio(d, "NC"), pacienteId: ap.pacienteId, monto, saldo: monto, origen: ap.folio, fecha: hoy(), sucursalId: ap.sucursalId });
    ap.anticipoResolucion = "saldo_a_favor";
  } else ap.anticipoResolucion = "perdido";
  auditar(d, "apartado_anticipo_politica", "apartado", ap.id, `${pol} · ${dinero(monto)}`);
  return { ok: true, resolucion: ap.anticipoResolucion };
}

// ── Crédito y plazos
export function registrarAbonoCredito(d, { planId, pagos }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const plan = d.planes.find((x) => x.id === planId);
  if (!plan) return falla("Plan no encontrado.");
  if (plan.estado !== "vigente") return falla(plan.estado === "pendiente_autorizacion" ? "El plan está pendiente de autorización." : "El plan no admite abonos.");
  const monto = sumaPagos(pagos);
  const rep = repartirAbono(plan, d.params[plan.sucursalId], monto);
  if (!rep.ok) return falla(rep.error);
  rep.aplicaciones.forEach((a) => {
    const p = plan.parcialidades.find((x) => x.n === a.n);
    p.pagado = redondear((p.pagado || 0) + a.capital); p.moraCobrada = redondear((p.moraCobrada || 0) + a.mora);
    (d.abonosCredito ||= []).push({ id: uid("AB"), planId: plan.id, parcialidad: a.n, monto: redondear(a.capital + a.mora), capital: a.capital, mora: a.mora, sucursalId: c.sucursalId, fecha: hoy(), cajeroId: c.u.id });
  });
  if (plan.parcialidades.every((p) => p.pagado >= p.capital)) plan.estado = "liquidado";
  movs(d, c.turno, c.u, "abono_credito", `Abono ${plan.folio}`, pagos);
  auditar(d, "abono_credito", "plan", plan.id, `${plan.folio} · ${dinero(monto)} (mora ${dinero(rep.mora)}, capital ${dinero(rep.capital)})`);
  registrarOp(d, "abono", `${plan.folio} abono ${dinero(monto)}`);
  return { ok: true, reparto: rep, liquidado: plan.estado === "liquidado" };
}
/** Venta a plazos / crédito abierto: el plan nace "pendiente_autorizacion" y SIEMPRE pasa por autorización; el enganche se cobra. */
export function crearPlanCredito(d, { pacienteId, tipo, monto, partidas = [], enganche = 0, n = 1, pagos = [] }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const pac = d.pacientes.find((x) => x.id === pacienteId); if (!pac) return falla("Elige al paciente.");
  if (!["plazos", "abierto"].includes(tipo)) return falla("Tipo de venta no válido.");
  if (!(monto > 0)) return falla("Captura el monto.");
  enganche = redondear(enganche || 0);
  if (enganche < 0 || enganche >= monto) return falla("El enganche debe ser menor al monto.");
  if (tipo === "plazos") {
    if (enganche + 0.005 < enganchaMinimo(monto)) return falla(`El enganche mínimo es ${dinero(enganchaMinimo(monto))} (${ENGANCHE_MIN_PCT} %).`);
    if (!(n >= 2 && n <= 24)) return falla("Elige entre 2 y 24 parcialidades.");
  }
  if (enganche > 0 && !pagosOk(pagos, enganche)) return falla("El pago no coincide con el enganche.");
  d.creditos ||= [];
  let cr = R.credito(d, pacienteId);
  if (!cr) { cr = { pacienteId, limite: 0, bloqueado: false }; d.creditos.push(cr); }
  if (cr.bloqueado) return falla("El crédito del paciente está bloqueado por el gerente.");
  const fin = redondear(monto - enganche);
  const disponible = R.creditoDisponible(d, pacienteId), excede = fin > disponible;
  const conAtraso = d.planes.some((p) => p.pacienteId === pacienteId && p.estado === "vigente" && R.diasMoraPlan(d, p) > 0);
  let nivel = R.nivelCredito(d, c.sucursalId, fin);
  if (excede) nivel = nivelMax(nivel, "admin");        // supuesto: exceder el límite sube un nivel (pendiente)
  if (conAtraso) nivel = "direccion";                  // requerimiento B: paciente con atraso → dirección
  const items = partidas.map((p) => partidaCatalogo(d, c.sucursalId, "producto", p.itemId, p.cant)).filter(Boolean);
  const plan = {
    id: uid("PL"), folio: folio(d, "CR"), pacienteId, sucursalId: c.sucursalId, tipo, monto: redondear(monto), enganche,
    parcialidades: generarParcialidades({ tipo, monto, enganche, n }), creado: hoy(), estado: "pendiente_autorizacion",
    partidas: items, enganchePagos: pagos.map((p) => ({ ...p })), entregado: !items.length, cajeroId: c.u.id,
  };
  d.planes.unshift(plan);
  const a = pedirAutorizacion(d, {
    tipo: "credito", sucursalId: c.sucursalId, solicitanteId: c.u.id, nivel, monto: fin, ref: { planId: plan.id },
    detalle: `${tipo === "plazos" ? "Venta a plazos" : "Crédito abierto"} ${plan.folio} — ${R.nombrePaciente(d, pacienteId)}${excede ? " · excede límite" : ""}${conAtraso ? " · con atraso" : ""}`,
  });
  plan.autorizacionId = a.id;
  if (enganche > 0) movs(d, c.turno, c.u, "enganche", `Enganche ${plan.folio}`, pagos);
  auditar(d, "plan_credito_solicitado", "plan", plan.id, `${plan.folio} · ${dinero(fin)} financiado · nivel ${nivel}`);
  registrarOp(d, "enganche", `${plan.folio} solicitado${enganche ? ` · enganche ${dinero(enganche)}` : ""}`);
  return { ok: true, plan, autorizacion: a, nivel, excede, conAtraso, disponible };
}
/** Entrega de producto de un plan ya autorizado: descuenta stock PEPS y crea la venta a crédito. */
export function entregarPlan(d, { planId }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const pl = d.planes.find((x) => x.id === planId);
  if (!pl || pl.estado === "pendiente_autorizacion" || pl.estado === "cancelado") return falla("El plan no está autorizado.");
  if (pl.entregado || !(pl.partidas || []).length) return falla("No hay producto pendiente de entrega.");
  if (pl.sucursalId !== c.sucursalId) return falla("Entrega el producto en la sucursal donde se vendió.");
  const st = consumirProductos(d, c.sucursalId, pl.partidas); if (st.error) return falla(st.error);
  const partidas = pl.partidas.map((p) => { const r = R.salidaPEPS(d, c.sucursalId, p.itemId, p.cant); return { ...p, costo: redondear(r.costo / p.cant) }; });
  const v = crearVenta(d, { u: c.u, sucursalId: c.sucursalId, turno: c.turno }, { partidas, total: pl.monto, descuento: 0, pagos: pl.enganchePagos?.length ? pl.enganchePagos : [{ forma: "efectivo", monto: 0.01 }], pacienteId: pl.pacienteId, tipo: pl.tipo, estado: "a_credito", turnoId: null, extra: { planId: pl.id } });
  v.total = pl.monto; pl.entregado = true; pl.ventaId = v.id;
  auditar(d, "plan_entregado", "plan", pl.id, `${pl.folio} → ${v.folio}`);
  return { ok: true, venta: v };
}

// ── Caja y turnos
export function abrirTurno(d, { fondo, turno }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  if (c.turno) return falla("Ya tienes un turno abierto.");
  const f = redondear(num(fondo));
  if (!(f >= 0)) return falla("Captura el fondo inicial.");
  if (!["Matutino", "Vespertino"].includes(turno)) return falla("Elige el turno.");
  const t = { id: uid("TU"), sucursalId: c.sucursalId, cajeroId: c.u.id, turno, fondo: f, abiertoEn: ahoraLocal(), cerradoEn: null, estado: "abierto", movimientos: [], corte: null };
  d.turnos.push(t);
  auditar(d, "turno_abierto", "turno", t.id, `${turno} · fondo ${dinero(f)}`);
  registrarOp(d, "apertura", `Turno ${turno} · fondo ${dinero(f)}`);
  return { ok: true, turno: t };
}
export function agregarMovimiento(d, { tipo, concepto, monto }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  if (!["retiro", "deposito", "gasto"].includes(tipo)) return falla("Tipo de movimiento no válido.");
  const m = redondear(num(monto));
  if (!(m > 0)) return falla("Captura un monto mayor a cero.");
  if (!String(concepto || "").trim()) return falla("Escribe el concepto.");
  if (tipo !== "deposito" && m > R.esperadoTurno(d, c.turno).efectivo + 0.005) return falla("No hay tanto efectivo esperado en caja.");
  c.turno.movimientos.push({ id: uid("MV"), tipo, concepto: concepto.trim(), monto: tipo === "deposito" ? m : -m, forma: "efectivo", hora: hhmm(), por: c.u.id });
  auditar(d, `caja_${tipo}`, "turno", c.turno.id, `${concepto} · ${dinero(m)}`);
  registrarOp(d, "movimiento_caja", `${tipo} ${dinero(m)}`);
  return { ok: true };
}
/** Cambio de turno y corte. `contado` = { efectivo, tarjeta, transferencia } capturado a ciegas. */
export function cerrarTurno(d, { contado, justificacion = "", recibeId, firma }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const a = arqueo(R.esperadoTurno(d, c.turno), contado);
  if (a.hayDiferencia && !String(justificacion).trim()) return falla("Hay diferencias: escribe la justificación.");
  const rec = d.usuarios.find((x) => x.id === recibeId && x.rol === "cajero" && x.sucursales.includes(c.sucursalId) && x.id !== c.u.id);
  if (!rec) return falla("Elige al cajero que recibe (distinto a ti).");
  if (!firma) return falla("Falta la firma de quien entrega.");
  c.turno.estado = "cerrado"; c.turno.cerradoEn = ahoraLocal();
  c.turno.corte = { fecha: ahoraLocal(), filas: a.filas, justificacion: String(justificacion).trim(), entregaId: c.u.id, recibeId: rec.id, firma, estado: a.estado };
  auditar(d, "turno_cerrado", "turno", c.turno.id, `${a.estado} · recibe ${rec.nombre}`);
  registrarOp(d, "corte", `Corte ${c.turno.turno} · ${a.estado}`);
  return { ok: true, corte: c.turno.corte };
}
export function solicitarReapertura(d, { turnoId }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const t = d.turnos.find((x) => x.id === turnoId && x.cajeroId === c.u.id);
  if (!t || t.estado !== "cerrado") return falla("Solo se reabre un corte cerrado propio.");
  if (d.autorizaciones.some((a) => a.tipo === "reapertura_corte" && a.estado === "pendiente" && a.ref?.turnoId === t.id)) return falla("Ya hay una reapertura pendiente.");
  pedirAutorizacion(d, { tipo: "reapertura_corte", sucursalId: t.sucursalId, solicitanteId: c.u.id, detalle: `Reabrir corte ${t.turno} del ${t.abiertoEn.slice(0, 10)}`, monto: 0, nivel: "gerente", ref: { turnoId: t.id } });
  auditar(d, "reapertura_solicitada", "turno", t.id, "");
  return { ok: true };
}

// ── Ventas del turno y devoluciones
export function solicitarCancelacion(d, { ventaId, motivo }) {
  const c = ctx(d); if (c.error) return falla(c.error);
  const v = d.ventas.find((x) => x.id === ventaId);
  if (!v || v.turnoId !== c.turno.id || v.estado !== "pagada") return falla("Solo se cancelan ventas pagadas de tu turno abierto.");
  if (!String(motivo || "").trim()) return falla("Escribe el motivo.");
  if (d.autorizaciones.some((a) => a.tipo === "cancelacion" && a.estado === "pendiente" && a.ref?.ventaId === v.id)) return falla("Ya hay una cancelación pendiente.");
  pedirAutorizacion(d, { tipo: "cancelacion", sucursalId: c.sucursalId, solicitanteId: c.u.id, detalle: `Cancelar ticket ${v.folio} — ${String(motivo).trim()}`, monto: v.total, nivel: "gerente", ref: { ventaId: v.id } });
  auditar(d, "cancelacion_solicitada", "venta", v.id, `${v.folio} · ${motivo}`);
  return { ok: true };
}

/** Monto devolvible de una venta por partida (proporcional al descuento de la venta). */
export function montoDevolucion(venta, items) {
  const ratio = venta.subtotal > 0 ? venta.total / venta.subtotal : 1;
  return redondear(items.reduce((a, it) => { const p = venta.partidas[it.idx]; return a + (p ? (p.precio ?? p.importe / p.cant) * it.cant * ratio : 0); }, 0));
}
export const devueltoDe = (venta, idx) => (venta.devueltoPartidas || {})[idx] || 0;

function aplicarDevolucion(d, c, dev) {
  const v = d.ventas.find((x) => x.id === dev.ventaId);
  const turno = c.turno;
  if (dev.resolucion === "reembolso") {
    if (!turno) return falla("Abre turno para registrar el reembolso en caja.");
    if (dev.formaReembolso === "efectivo" && dev.monto > R.esperadoTurno(d, turno).efectivo + 0.005) return falla("No hay suficiente efectivo esperado en caja para el reembolso.");
  }
  dev.partidas.forEach((it) => {
    const p = v.partidas[it.idx];
    if (p.tipo === "producto" && it.destino === "reingresa") R.entradaCapa(d, dev.sucursalId, p.itemId, it.cant, p.costo || 0, "DEV");
    if (p.tipo === "producto" && it.destino === "merma") dev.mermaCosto = redondear((dev.mermaCosto || 0) + (p.costo || 0) * it.cant);
    v.devueltoPartidas = { ...(v.devueltoPartidas || {}), [it.idx]: devueltoDe(v, it.idx) + it.cant };
  });
  v.estado = "con_devolucion";
  if (dev.resolucion === "reembolso") movs(d, turno, c.u, "devolucion", `Devolución ${dev.folio}`, [{ forma: dev.formaReembolso, monto: -dev.monto }]);
  else (d.notasCredito ||= []).push({ id: uid("NC"), folio: folio(d, "NC"), pacienteId: v.pacienteId, monto: dev.monto, saldo: dev.monto, origen: dev.folio, uso: dev.resolucion === "cambio" ? "cambio" : "nota_credito", fecha: hoy(), sucursalId: dev.sucursalId });
  dev.estado = "aplicada";
  auditar(d, "devolucion_aplicada", "devolucion", dev.id, `${dev.folio} · ${v.folio} · ${dinero(dev.monto)} · ${dev.resolucion}`);
  registrarOp(d, "devolucion", `${dev.folio} ${dinero(dev.monto)}`);
  return { ok: true };
}
/** op: { ventaId, items:[{idx,cant,destino}], motivo, resolucion, formaReembolso } */
export function crearDevolucion(d, op) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const v = d.ventas.find((x) => x.id === op.ventaId);
  if (!v || !["pagada", "con_devolucion", "a_credito"].includes(v.estado)) return falla("La venta no admite devoluciones.");
  const items = (op.items || []).filter((i) => i.cant > 0);
  if (!items.length) return falla("Elige al menos una partida.");
  for (const it of items) {
    const p = v.partidas[it.idx];
    if (!p || p.tipo === "anticipo") return falla("Partida no devolvible.");
    if (it.cant > p.cant - devueltoDe(v, it.idx)) return falla(`${p.nombre}: no puedes devolver más de lo vendido.`);
  }
  if (!String(op.motivo || "").trim()) return falla("Escribe el motivo.");
  if (!["reembolso", "cambio", "nota_credito"].includes(op.resolucion)) return falla("Elige la resolución.");
  const monto = montoDevolucion(v, items);
  if (!(monto > 0)) return falla("El monto de la devolución es cero.");
  const dev = {
    id: uid("DV"), folio: folio(d, "DV"), ventaId: v.id, partidas: items.map((i) => ({ idx: i.idx, cant: i.cant, nombre: v.partidas[i.idx].nombre, destino: v.partidas[i.idx].tipo === "producto" ? i.destino || "reingresa" : "n/a" })),
    motivo: String(op.motivo).trim(), resolucion: op.resolucion, destino: items.some((i) => i.destino === "merma") ? "merma" : "inventario", formaReembolso: op.formaReembolso || "efectivo",
    monto, fecha: ahoraLocal(), cajeroId: c.u.id, sucursalId: c.sucursalId, estado: "pendiente",
  };
  d.devoluciones.unshift(dev);
  const limite = d.params[c.sucursalId].limiteAjusteGerente;
  if (monto > limite) {
    const a = pedirAutorizacion(d, { tipo: "devolucion", sucursalId: c.sucursalId, solicitanteId: c.u.id, detalle: `Devolución ${dev.folio} de ${v.folio} (${op.resolucion})`, monto, nivel: R.nivelAjuste(d, c.sucursalId, monto), ref: { devolucionId: dev.id, ventaId: v.id } });
    dev.estado = "pendiente_autorizacion"; dev.autorizacionId = a.id; dev.pendiente = "PA-V2";
    auditar(d, "devolucion_solicitada", "devolucion", dev.id, `${dev.folio} · ${dinero(monto)} requiere autorización`);
    return { ok: true, devolucion: dev, requiereAutorizacion: true };
  }
  const r = aplicarDevolucion(d, ctx(d), dev);
  if (!r.ok) { d.devoluciones = d.devoluciones.filter((x) => x.id !== dev.id); return r; }
  return { ok: true, devolucion: dev };
}
/** Aplica una devolución cuya autorización ya fue concedida. */
export function aplicarDevolucionAutorizada(d, { devolucionId }) {
  const c = ctx(d, { turno: false }); if (c.error) return falla(c.error);
  const dev = d.devoluciones.find((x) => x.id === devolucionId);
  if (!dev || dev.estado !== "pendiente_autorizacion") return falla("La devolución no está pendiente.");
  const a = d.autorizaciones.find((x) => x.id === dev.autorizacionId);
  if (!a || a.estado !== "autorizado") return falla(a && a.estado === "rechazado" ? "La autorización fue rechazada." : "Aún no está autorizada.");
  if (dev.sucursalId !== c.sucursalId) return falla("Aplícala en la sucursal donde se solicitó.");
  return aplicarDevolucion(d, c, dev);
}
