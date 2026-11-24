// Dominio «ventas» (incorporado de Pie Firme): reglas PURAS sobre el estado `d`. No importa core.js, así la semilla
// (dominios/ventas.js) puede usarlas sin ciclo de importación. Las acciones que escriben viven en acciones_ventas.js.
// Reglas de Pie Firme citadas por id (REGLAS_NEGOCIO.md de Pie Firme): P-055 a P-066 (ventas y facturación), P-070 a P-073
// (planes, membresías, gift cards), P-081 a P-086 (compras e inventario), P-106 a P-112 (comisiones y mantenimiento).
// NADA de esto es asesoría fiscal: el IVA por concepto y los catálogos SAT quedan «por validar con contador».
import { redondear, hoy, dia, sumarDias, diasEntre, parse, ymd } from "../lib/format.js";

// ═════════════════════════ Parámetros del dominio (valores iniciales de Pie Firme; editables en d.ventasCfg)
export const PARAMS_VENTAS = {
  descuentoLibrePct: 10,      // P-055: recepción/caja sin PIN hasta 10 %
  toleranciaCorte: 50,        // P-058: diferencia de corte tolerada sin autorización
  compraAutorizaDesde: 5000,  // P-081: compra que exige autorización (desde $5,000)
  mantUrgenteTope: 2000,      // P-112: gasto urgente de mantenimiento sin autorización previa
  vigenciaMeses: 12,          // P-070 / P-073
  avisoVencimientoDias: 30,
};
export const cfgVentas = (d) => ({ ...PARAMS_VENTAS, ...((d && d.ventasCfg) || {}) });
const suma = (arr) => redondear(arr.reduce((a, x) => a + (Number(x) || 0), 0));
export const mesDe = (f) => dia(f).slice(0, 7);
const pad = (n) => String(n).padStart(2, "0");

/** Suma meses a "YYYY-MM-DD" respetando el fin de mes (31 ene + 1 mes = 28/29 feb). */
export function sumarMesesFecha(fecha, n) {
  const x = parse(dia(fecha));
  const diaMes = x.getDate();
  const y = new Date(x.getFullYear(), x.getMonth() + n, 1);
  const tope = new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate();
  y.setDate(Math.min(diaMes, tope));
  return ymd(y);
}

// ═════════════════════════ Fiscal (CFDI 4.0 simulado)
export const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
export const RFC_PUBLICO = "XAXX010101000";
export const RFC_EXTRANJERO = "XEXX010101000";
const fechaRfcValida = (aammdd) => {
  const m = Number(aammdd.slice(2, 4)), dd = Number(aammdd.slice(4, 6));
  return m >= 1 && m <= 12 && dd >= 1 && dd <= 31;
};
export const limpiarRfc = (rfc) => String(rfc ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
/** RFC con forma válida (3 o 4 letras + fecha AAMMDD real + homoclave de 3). Los genéricos del SAT son válidos. */
export function validarRfc(rfc) {
  const x = limpiarRfc(rfc);
  if (!RFC_RE.test(x)) return false;
  return fechaRfcValida(x.slice(x.length - 9, x.length - 3));
}
export const tipoPersonaRfc = (rfc) => (limpiarRfc(rfc).length === 12 ? "moral" : "fisica");
export const esRfcGenerico = (rfc) => [RFC_PUBLICO, RFC_EXTRANJERO].includes(limpiarRfc(rfc));
export const validarCp = (cp) => /^[0-9]{5}$/.test(String(cp ?? "").trim());

// Catálogos SAT mínimos (sugerencias a validar con el contador, P-056).
export const REGIMENES = [
  ["601", "General de Ley Personas Morales", "moral"], ["603", "Personas Morales con Fines no Lucrativos", "moral"],
  ["605", "Sueldos y Salarios e Ingresos Asimilados", "fisica"], ["606", "Arrendamiento", "fisica"],
  ["612", "Personas Físicas con Actividades Empresariales y Profesionales", "fisica"], ["616", "Sin obligaciones fiscales", "ambas"],
  ["621", "Incorporación Fiscal", "fisica"], ["626", "Régimen Simplificado de Confianza", "ambas"],
];
export const USOS_CFDI = [
  ["G01", "Adquisición de mercancías"], ["G03", "Gastos en general"], ["D01", "Honorarios médicos, dentales y gastos hospitalarios"],
  ["D07", "Primas por seguros de gastos médicos"], ["S01", "Sin efectos fiscales"], ["CP01", "Pagos"],
];
export const FORMAS_PAGO_SAT = { efectivo: "01", transferencia: "03", tarjeta: "04", en_linea: "04", por_definir: "99" };
export const MOTIVOS_CANCELACION = [
  ["01", "Comprobante emitido con errores con relación"], ["02", "Comprobante emitido con errores sin relación"],
  ["03", "No se llevó a cabo la operación"], ["04", "Operación nominativa relacionada en una factura global"],
];
export const IVA_TIPOS = { exento: "Exento", 16: "16 %", tasa0: "Tasa 0 %" };
export const ESTADOS_FACTURA = {
  borrador: ["Borrador", "neutral"], timbrada: ["Timbrada (simulado)", "ok"], cancelacion_solicitada: ["Cancelación en proceso", "warn"], cancelada: ["Cancelada", "bad"],
};
export const TIPOS_FACTURA = { ingreso: "Ingreso", global: "Global", egreso: "Nota de crédito", pago: "Complemento de pago" };
export const AVISO_PAC = "Modo simulado: sin llave de PAC. Los CFDI que se timbran aquí NO tienen validez fiscal.";
export const MARCA_AGUA = "SIN VALIDEZ FISCAL — demostración";

export const receptorPublico = (cp) => ({ rfc: RFC_PUBLICO, nombre: "PÚBLICO EN GENERAL", regimen: "616", usoCfdi: "S01", cp: String(cp || "") });

/** Valida los datos fiscales del receptor. → { ok, errores:{campo:texto}, receptor (normalizado) } */
export function validarReceptor(r = {}) {
  const e = {};
  const rfc = limpiarRfc(r.rfc);
  if (!rfc) e.rfc = "Escribe el RFC."; else if (!validarRfc(rfc)) e.rfc = "RFC con formato inválido (12 o 13 caracteres).";
  const nombre = String(r.nombre || "").trim().toUpperCase();
  if (nombre.length < 3) e.nombre = "Escribe el nombre o razón social tal como aparece en la constancia.";
  const reg = REGIMENES.find((x) => x[0] === r.regimen);
  if (!reg) e.regimen = "Elige el régimen fiscal.";
  else if (!e.rfc && !esRfcGenerico(rfc) && reg[2] !== "ambas" && reg[2] !== tipoPersonaRfc(rfc)) e.regimen = `El régimen ${reg[0]} no corresponde a una persona ${tipoPersonaRfc(rfc) === "moral" ? "moral" : "física"}.`;
  if (!USOS_CFDI.some((x) => x[0] === r.usoCfdi)) e.usoCfdi = "Elige el uso del CFDI.";
  if (!validarCp(r.cp)) e.cp = "El código postal fiscal tiene 5 dígitos.";
  if (!e.rfc && esRfcGenerico(rfc) && r.usoCfdi && r.usoCfdi !== "S01") e.usoCfdi = "Con RFC genérico el uso es S01 (sin efectos fiscales).";
  return { ok: !Object.keys(e).length, errores: e, receptor: { rfc, nombre, regimen: r.regimen, usoCfdi: r.usoCfdi, cp: String(r.cp || "").trim(), correo: String(r.correo || "").trim() } };
}

/** IVA por concepto: servicios de salud EXENTOS; productos 16 % salvo lo que diga su ficha. «Por validar con contador». */
export function ivaTipoDe(d, tipo, itemId) {
  if (tipo === "servicio" || tipo === "paquete") return "exento";   // paquete/plan de sesiones = servicio de salud prepagado
  const f = d && d.inv && d.inv.fichas ? d.inv.fichas[itemId] : null;
  return String((f && f.ivaTipo) || "16");
}
/** Desglose de un precio CON IVA incluido. exento / 0 %: base = precio; 16 %: base = precio / 1.16. */
export function desglosarIva(precioConIva, ivaTipo = "exento") {
  const total = redondear(precioConIva);
  if (String(ivaTipo) === "16") { const base = redondear(total / 1.16); return { base, iva: redondear(total - base), total }; }
  return { base: total, iva: 0, total };
}
/** Reparte un descuento global entre líneas en proporción a su importe (la última absorbe los centavos). */
export function repartir(total, importes) {
  const s = importes.reduce((a, b) => a + b, 0);
  let resto = redondear(total);
  return importes.map((imp, i) => {
    const x = i === importes.length - 1 ? resto : s > 0 ? redondear(total * imp / s) : 0;
    resto = redondear(resto - x);
    return x;
  });
}
export function conceptoCfdi(d, { tipo, itemId, nombre, cant, bruto, desc }) {
  const ivaTipo = ivaTipoDe(d, tipo, itemId);
  const neto = redondear(bruto - desc);
  const { base, iva } = desglosarIva(neto, ivaTipo);
  const descSinIva = ivaTipo === "16" ? redondear(desc / 1.16) : desc;
  const importe = redondear(base + descSinIva);
  const f = d && d.inv && d.inv.fichas ? d.inv.fichas[itemId] : null;
  return {
    tipo, itemId: itemId || null, descripcion: nombre, cantidad: cant, claveSat: tipo !== "producto" ? "85121600" : (f && f.claveSat) || "42142900",
    unidadSat: tipo !== "producto" ? "E48" : (f && f.unidadSat) || "H87", valorUnitario: cant ? redondear(importe / cant) : importe,
    importe, descuento: descSinIva, base, objetoImp: "02", ivaTipo, ivaTasa: ivaTipo === "16" ? 0.16 : ivaTipo === "tasa0" ? 0 : null, iva,
  };
}
export function totalesCfdi(conceptos) {
  const subtotal = suma(conceptos.map((c) => c.importe)), descuento = suma(conceptos.map((c) => c.descuento));
  const iva = suma(conceptos.map((c) => c.iva));
  return {
    subtotal, descuento, iva, ivaBase16: suma(conceptos.filter((c) => c.ivaTipo === "16").map((c) => c.base)),
    exentoBase: suma(conceptos.filter((c) => c.ivaTipo === "exento").map((c) => c.base)), total: redondear(subtotal - descuento + iva),
  };
}
/** Conceptos del CFDI desde las partidas del ticket (P-057: el ticket y el CFDI dan el mismo total). */
export function conceptosDeVenta(d, v) {
  const partidas = (v.partidas || []).filter((p) => (p.importe || 0) > 0);
  const descs = repartir(v.descuento || 0, partidas.map((p) => p.importe));
  const conceptos = partidas.map((p, i) => conceptoCfdi(d, { tipo: p.tipo, itemId: p.itemId, nombre: p.nombre, cant: p.cant, bruto: p.importe, desc: descs[i] }));
  return { conceptos, ...totalesCfdi(conceptos) };
}
/** Conceptos de una venta a crédito / plazos (PPD). Sin partidas se factura un solo concepto de producto al 16 %. */
export function conceptosDePlan(d, plan) {
  const ps = (plan.partidas || []).filter((p) => (p.importe || 0) > 0);
  const sumaP = suma(ps.map((p) => p.importe));
  const conceptos = ps.length && Math.abs(sumaP - plan.monto) < 0.01
    ? ps.map((p) => conceptoCfdi(d, { tipo: p.tipo || "producto", itemId: p.itemId, nombre: p.nombre, cant: p.cant, bruto: p.importe, desc: 0 }))
    : [conceptoCfdi(d, { tipo: "producto", itemId: null, nombre: `Venta ${plan.tipo === "plazos" ? "a plazos" : "a crédito"} ${plan.folio}`, cant: 1, bruto: plan.monto, desc: 0 })];
  return { conceptos, ...totalesCfdi(conceptos) };
}

/** Forma de pago SAT de un ticket: la de mayor monto. */
export function formaPagoSat(pagos) {
  const p = [...(pagos || [])].sort((a, b) => b.monto - a.monto)[0];
  return (p && FORMAS_PAGO_SAT[p.forma]) || "99";
}
/** Comprobante en borrador con los datos del emisor y del receptor CONGELADOS (P-066). */
export function facturaBase(emisor, { id, folio, tipo, receptor, sucursalId, fecha, emitidaPor, conceptos = [], totales = {}, extra = {} }) {
  return {
    id, serie: String(folio).split("-")[0], folio, tipo, sucursalId: sucursalId || null, fecha,
    emisor: { rfc: emisor.rfc, razon: emisor.razon, regimen: emisor.regimen, cp: emisor.cp },
    receptor: { rfc: receptor.rfc, nombre: receptor.nombre, regimen: receptor.regimen, usoCfdi: receptor.usoCfdi, cp: receptor.cp },
    conceptos, subtotal: totales.subtotal || 0, descuento: totales.descuento || 0, iva: totales.iva || 0, ivaBase16: totales.ivaBase16 || 0, exentoBase: totales.exentoBase || 0, total: totales.total || 0,
    moneda: "MXN", metodoPago: "PUE", formaPago: "99", estado: "borrador", uuid: null, timbradaEn: null, simulado: true, emitidaPor: emitidaPor || null, ...extra,
  };
}

/** P-064: un ticket se factura hasta el cierre del mismo mes calendario. */
export const dentroDePlazo = (fechaVenta, ref = hoy()) => mesDe(fechaVenta) === mesDe(ref);
const bolsaFiscal = (d) => d.fiscal || { emisor: {}, receptores: [], facturas: [] };
const VIVAS = ["borrador", "timbrada", "cancelacion_solicitada"];
/** Factura que ampara un ticket (individual en cualquier estado vivo, o global ya timbrada). */
export function facturaVigenteDeVenta(d, ventaId) {
  return bolsaFiscal(d).facturas.find((f) =>
    (f.tipo === "ingreso" && f.ventaId === ventaId && VIVAS.includes(f.estado)) ||
    (f.tipo === "global" && (f.ventaIds || []).includes(ventaId) && ["timbrada", "cancelacion_solicitada"].includes(f.estado))) || null;
}
export const facturaVigenteDePlan = (d, planId) => bolsaFiscal(d).facturas.find((f) => f.tipo === "ingreso" && f.planId === planId && VIVAS.includes(f.estado)) || null;
export const esFacturable = (v) => !!v && v.estado === "pagada" && (v.total || 0) > 0 && !["anticipo_laboratorio", "gift_card"].includes(v.tipo);   // P-073: la gift card se factura al canjearse, no al venderse
/** Tickets cobrados sin factura. → [{ venta, enPlazo, solicitada }] más recientes primero. */
export function pendientesDeFacturar(d, { sucursalId = null, cajeroId = null, mes = null, ref = hoy() } = {}) {
  return d.ventas.filter((v) => esFacturable(v) && (!sucursalId || v.sucursalId === sucursalId) && (!cajeroId || v.cajeroId === cajeroId) && (!mes || mesDe(v.fecha) === mes) && !facturaVigenteDeVenta(d, v.id))
    .map((v) => ({ venta: v, enPlazo: dentroDePlazo(v.fecha, ref), solicitada: !!v.facturar }))
    .sort((a, b) => String(b.venta.fecha).localeCompare(String(a.venta.fecha)));
}
/** Importe ya acreditado con notas de crédito vivas, y lo que aún se puede acreditar (nota de crédito ≤ factura). */
export function acreditado(d, facturaId) {
  return suma(bolsaFiscal(d).facturas.filter((f) => f.tipo === "egreso" && f.relacionada && f.relacionada.facturaId === facturaId && f.estado !== "cancelada").map((f) => f.total));
}
export function saldoAcreditable(d, factura) { return redondear(factura.total - acreditado(d, factura.id)); }
/** Complementos de pago vivos de una factura PPD y su saldo insoluto. */
export function complementosDe(d, facturaId) {
  return bolsaFiscal(d).facturas.filter((f) => f.tipo === "pago" && f.relacionada && f.relacionada.facturaId === facturaId && f.estado !== "cancelada").sort((a, b) => (a.pago.parcialidad || 0) - (b.pago.parcialidad || 0));
}
export function saldoInsoluto(d, factura) {
  return redondear(factura.total - (factura.pagadoInicial || 0) - suma(complementosDe(d, factura.id).map((f) => f.pago.monto)));
}
/** Abonos del plan de una factura PPD que aún no tienen complemento de pago. */
export function abonosSinComplemento(d, factura) {
  if (!factura.planId) return [];
  const usados = new Set(complementosDe(d, factura.id).map((f) => f.pago.abonoId));
  return (d.abonosCredito || []).filter((a) => a.planId === factura.planId && !usados.has(a.id)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}
/** UUID SINTÉTICO (no es un folio fiscal del SAT): determinista a partir de un texto y con prefijo «SIM». */
export function uuidSintetico(texto) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193); h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) ^ (h2 >>> 13); }
  const hex = (n, l) => (n >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, l);
  const a = hex(h1, 8), b = hex(h2, 8), c = hex(Math.imul(h1, 31) ^ h2, 8), e = hex(Math.imul(h2, 17) ^ h1, 8);
  return `SIM${a.slice(0, 5)}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${c.slice(0, 3)}-${c.slice(3, 8)}${e.slice(0, 7)}`;
}
/** Cancelar en el mismo mes de emisión es directo; fuera del mes requiere aceptación del receptor (simulada). */
export const cancelacionDirecta = (factura, ref = hoy()) => factura.estado === "borrador" || mesDe(factura.fecha) === mesDe(ref);

// ═════════════════════════ Paquetes, planes de láser, membresías y gift cards
export const TIPOS_OFERTA = { paquete: "Paquete de sesiones", plan_laser: "Plan de láser", membresia: "Membresía", gift_card: "Gift card" };
export const ESTADOS_ADQ = { vigente: ["Vigente", "ok"], por_vencer: ["Por vencer", "warn"], consumido: ["Consumido", "neutral"], caducado: ["Caducado", "bad"], cancelado: ["Cancelado", "bad"] };
export const venceDe = (fechaCompra, meses = PARAMS_VENTAS.vigenciaMeses) => sumarMesesFecha(fechaCompra, meses);
export const sesionesRestantes = (a) => Math.max(0, (a.sesionesTotal || 0) - (a.sesionesUsadas || 0));
export const diasParaVencer = (x, ref = hoy()) => diasEntre(ref, x.vence);
/** P-070: al caducar se pierden las sesiones sin usar. Estado derivado de la fecha, no guardado. */
export function estadoAdquirido(a, ref = hoy()) {
  if (a.estado === "cancelado") return "cancelado";
  if (sesionesRestantes(a) <= 0) return "consumido";
  if (dia(ref) > a.vence) return "caducado";
  return "vigente";
}
/** Aviso a 30 días del vencimiento (solo lo que sigue vigente y con saldo). */
export const porVencer = (a, ref = hoy(), dias = PARAMS_VENTAS.avisoVencimientoDias) => estadoAdquirido(a, ref) === "vigente" && diasParaVencer(a, ref) <= dias;
export const estadoVisibleAdq = (a, ref = hoy()) => (porVencer(a, ref) ? "por_vencer" : estadoAdquirido(a, ref));
export function puedeConsumir(a, ref = hoy()) {
  const e = estadoAdquirido(a, ref);
  if (e === "cancelado") return { ok: false, error: "El paquete está cancelado." };
  if (e === "consumido") return { ok: false, error: "El paquete ya no tiene sesiones." };
  if (e === "caducado") return { ok: false, error: `El paquete caducó el ${a.vence}: las sesiones sin usar se perdieron (P-070).` };
  return { ok: true };
}
/** Valor de cada sesión (precio congelado al vender, P-068 / P-107: los planes se comisionan por sesión atendida). */
export const valorSesion = (a) => (a.sesionesTotal ? redondear(a.precioTotal / a.sesionesTotal) : 0);
export function estadoGift(g, ref = hoy()) {
  if (g.estado === "cancelada") return "cancelada";
  if ((g.saldo || 0) <= 0) return "canjeada";
  if (dia(ref) > g.vence) return "caducada";
  return "activa";
}
export function estadoMembresia(m, ref = hoy()) {
  if (["cancelada", "renovada"].includes(m.estado)) return m.estado;
  return dia(ref) > m.vence ? "vencida" : "vigente";
}
const bolsaPaq = (d) => d.paq || { ofertas: [], adquiridos: [], consumos: [], membresias: [], giftCards: [], giftMovs: [], transferencias: [] };
/** Paquetes y planes del paciente que hoy se pueden consumir (para la consulta y la caja). */
export function paquetesDisponibles(d, pacienteId, { servicioId = null, ref = hoy() } = {}) {
  return bolsaPaq(d).adquiridos.filter((a) => a.pacienteId === pacienteId && estadoAdquirido(a, ref) === "vigente" && (!servicioId || !a.servicioBaseId || a.servicioBaseId === servicioId));
}
export function resumenPaquetes(d, { sucursalId = null, ref = hoy() } = {}) {
  const b = bolsaPaq(d), de = (x) => !sucursalId || x.sucursalId === sucursalId;
  const adq = b.adquiridos.filter(de), vig = adq.filter((a) => estadoAdquirido(a, ref) === "vigente");
  const gifts = b.giftCards.filter((g) => estadoGift(g, ref) === "activa");
  return {
    vigentes: vig.length, porVencer: vig.filter((a) => porVencer(a, ref)).length, sesionesPendientes: vig.reduce((s, a) => s + sesionesRestantes(a), 0),
    porCobrar: suma(adq.filter((a) => a.estado !== "cancelado").map((a) => a.saldoPendiente || 0)),
    membresias: b.membresias.filter((m) => de(m) && estadoMembresia(m, ref) === "vigente").length,
    membresiasPorVencer: b.membresias.filter((m) => de(m) && estadoMembresia(m, ref) === "vigente" && diasParaVencer(m, ref) <= PARAMS_VENTAS.avisoVencimientoDias).length,
    giftActivas: gifts.length, pasivoGift: suma(gifts.map((g) => g.saldo)),   // P-073: la venta de gift card es pasivo hasta el canje
  };
}

// ═════════════════════════ Inventario: expediente de producto y de proveedor
export function costoPromedio(d, productoId, almacenId = null) {
  const cs = d.capas.filter((c) => c.productoId === productoId && (!almacenId || c.almacenId === almacenId));
  const n = cs.reduce((a, c) => a + c.cant, 0);
  return n ? redondear(cs.reduce((a, c) => a + c.cant * c.costo, 0) / n) : 0;
}
/** Existencia por almacén con sus capas PEPS (la más antigua primero: es la siguiente en salir). */
export function existenciasPorAlmacen(d, productoId) {
  return d.almacenes.map((a) => {
    const capas = d.capas.filter((c) => c.almacenId === a.id && c.productoId === productoId && c.cant > 0).sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
    return { almacenId: a.id, nombre: a.nombre, stock: capas.reduce((s, c) => s + c.cant, 0), valor: redondear(capas.reduce((s, c) => s + c.cant * c.costo, 0)), capas };
  });
}
export const existenciaTotal = (d, productoId) => d.capas.filter((c) => c.productoId === productoId).reduce((a, c) => a + c.cant, 0);
export const valorInventario = (d, productoId) => redondear(d.capas.filter((c) => c.productoId === productoId).reduce((a, c) => a + c.cant * c.costo, 0));
/**
 * Kardex con saldo corrido. `movs` = movimientos derivados ({fecha, tipo:"entrada"|"salida", cant}); `stockActual` = suma de capas.
 * El saldo de apertura es lo que había antes del primer movimiento registrado; cuadra si apertura + entradas − salidas = capas
 * y la apertura no es negativa (una apertura negativa significa movimientos sin capa que los respalde).
 */
export function kardexConSaldo(movs, stockActual) {
  const asc = [...movs].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const entradas = asc.filter((m) => m.tipo === "entrada").reduce((a, m) => a + m.cant, 0);
  const salidas = asc.filter((m) => m.tipo === "salida").reduce((a, m) => a + m.cant, 0);
  const saldoInicial = stockActual - entradas + salidas;
  let saldo = saldoInicial;
  const filas = asc.map((m) => { saldo += m.tipo === "entrada" ? m.cant : -m.cant; return { ...m, saldo }; });
  return { saldoInicial, entradas, salidas, saldoFinal: saldo, cuadra: saldo === stockActual && saldoInicial >= 0, filas: filas.reverse() };
}
/** Rotación: unidades vendidas en la ventana, promedio diario y días de inventario que quedan. */
export function rotacionProducto(d, productoId, { dias = 30, ref = hoy(), almacenId = null } = {}) {
  const desde = sumarDias(ref, -(dias - 1));
  let unidades = 0, importe = 0; const fechas = new Set();
  d.ventas.filter((v) => v.estado !== "cancelada" && dia(v.fecha) >= desde && dia(v.fecha) <= dia(ref) && (!almacenId || v.sucursalId === almacenId)).forEach((v) =>
    v.partidas.filter((p) => p.tipo === "producto" && p.itemId === productoId).forEach((p) => { unidades += p.cant; importe += p.importe || 0; fechas.add(dia(v.fecha)); }));
  d.consultas.filter((c) => dia(c.fecha) >= desde && dia(c.fecha) <= dia(ref) && (!almacenId || c.sucursalId === almacenId)).forEach((c) =>
    (c.consumo || []).filter((x) => x.productoId === productoId).forEach((x) => { unidades += x.cant; fechas.add(dia(c.fecha)); }));
  // La demo solo tiene tickets de los últimos días: el promedio usa los días con datos para no subestimar.
  const primer = [...fechas].sort()[0];
  const diasConDatos = primer ? Math.max(1, diasEntre(primer, ref) + 1) : dias;
  const diario = unidades / Math.min(dias, Math.max(diasConDatos, 1));
  const stock = almacenId ? d.capas.filter((c) => c.productoId === productoId && c.almacenId === almacenId).reduce((a, c) => a + c.cant, 0) : existenciaTotal(d, productoId);
  return { unidades, importe: redondear(importe), diario: Math.round(diario * 100) / 100, diasInventario: diario > 0 ? Math.round(stock / diario) : null, stock };
}
/** P-081: la orden de compra de $5,000 o más requiere autorización de Administración. */
export const requiereAutorizacionCompra = (total, d) => redondear(total) >= cfgVentas(d).compraAutorizaDesde;
export const totalPartidas = (partidas) => redondear((partidas || []).reduce((a, p) => a + (Number(p.cant) || 0) * (Number(p.costo) || 0), 0));
const bolsaInv = (d) => d.inv || { fichas: {}, provFichas: {}, provProductos: [], provEval: [], provDocs: [], mermas: [] };
export const CRITERIOS_EVAL = [["puntualidad", "Puntualidad de entrega"], ["calidad", "Calidad del producto"], ["precio", "Precio"], ["servicio", "Servicio y respuesta"]];
/** Evaluación del proveedor: promedio de calificaciones capturadas + cumplimiento medido en las órdenes de compra. */
export function evaluacionProveedor(d, proveedorId) {
  const ev = bolsaInv(d).provEval.filter((e) => e.proveedorId === proveedorId);
  const prom = (k) => (ev.length ? Math.round(ev.reduce((a, e) => a + (e[k] || 0), 0) / ev.length * 10) / 10 : null);
  const porCriterio = Object.fromEntries(CRITERIOS_EVAL.map(([k]) => [k, prom(k)]));
  const vals = Object.values(porCriterio).filter((x) => x != null);
  const ocs = d.oc.filter((o) => o.proveedorId === proveedorId && ["recibida", "recibida_parcial"].includes(o.estado));
  const completas = ocs.filter((o) => o.partidas.every((p) => (p.recibido || 0) >= p.cant)).length;
  const dev = (d.devolucionesProveedor || []).filter((x) => x.proveedorId === proveedorId).length;
  return { n: ev.length, porCriterio, general: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null, entregasCompletasPct: ocs.length ? Math.round(completas / ocs.length * 100) : null, ordenesRecibidas: ocs.length, devoluciones: dev };
}
export function resumenProveedor(d, proveedorId, ref = hoy()) {
  const ocs = d.oc.filter((o) => o.proveedorId === proveedorId);
  const total = (o) => redondear(o.partidas.reduce((a, x) => a + x.cant * x.costo, 0));
  const cxp = d.cxp.filter((c) => c.proveedorId === proveedorId);
  return {
    ordenes: ocs.length, comprado: suma(ocs.filter((o) => o.estado !== "por_aprobar").map(total)), ultimaCompra: ocs.map((o) => o.fecha).sort().pop() || null,
    saldo: suma(cxp.map((c) => c.saldo)), vencido: suma(cxp.filter((c) => c.saldo > 0 && c.vence < ref).map((c) => c.saldo)),
    pagado: suma(cxp.flatMap((c) => (c.pagos || []).map((p) => p.monto))), porAprobar: ocs.filter((o) => o.estado === "por_aprobar").length,
  };
}
export const ESTADOS_MERMA = { pendiente: ["Por autorizar", "warn"], autorizado: ["Autorizada", "ok"], rechazado: ["Rechazada", "bad"] };
/** Estado de una merma: el de su autorización si la tiene (P-086: el ajuste lo autoriza gerencia o administración). */
export function estadoMerma(d, m) {
  if (!m.autorizacionId) return m.estado || "autorizado";
  const a = (d.autorizaciones || []).find((x) => x.id === m.autorizacionId);
  return a ? a.estado : m.estado || "pendiente";
}

// ═════════════════════════ Mantenimiento de equipos (P-112)
export const TIPOS_EQUIPO = { autoclave: "Autoclave", laser: "Láser podológico", sillon: "Sillón podológico", escaner: "Escáner de huella", micromotor: "Micromotor", otro: "Otro equipo" };
export const TIPOS_OT = { preventivo: "Preventivo", normal: "Correctivo", urgente: "Urgente" };
export const ESTADOS_OT = { solicitado: ["Solicitado", "warn"], autorizado: ["Autorizado", "info"], en_proceso: ["En proceso", "info"], cerrado: ["Cerrado", "ok"], rechazado: ["Rechazado", "bad"] };
export const OT_ABIERTAS = ["solicitado", "autorizado", "en_proceso"];
export const proximoServicio = (eq) => (eq.periodicidadDias && eq.ultimoServicio ? sumarDias(eq.ultimoServicio, eq.periodicidadDias) : null);
export function estadoEquipo(eq, ref = hoy()) {
  if (["baja", "falla", "en_proceso"].includes(eq.estado)) return eq.estado;
  const p = proximoServicio(eq);
  if (!p) return "vigente";
  if (p < dia(ref)) return "vencido";
  return diasEntre(ref, p) <= 15 ? "por_vencer" : "vigente";
}
export const ESTADOS_EQUIPO = { vigente: ["Al corriente", "ok"], por_vencer: ["Servicio próximo", "warn"], vencido: ["Servicio vencido", "bad"], falla: ["Con falla", "bad"], en_proceso: ["En mantenimiento", "info"], baja: ["Baja", "neutral"] };
/** P-112: solo una OT urgente de hasta $2,000 puede atenderse antes de autorizarse (y se regulariza después). */
export function puedeIniciarSinAutorizar(ot, d) {
  return ot.tipo === "urgente" && ot.estado === "solicitado" && (Number(ot.costoEstimado) || 0) <= cfgVentas(d).mantUrgenteTope;
}
const bolsaMant = (d) => d.mant || { equipos: [], ordenes: [], presupuestos: [] };
/** Presupuesto del mes de una sucursal: ejercido (OT cerradas), comprometido (abiertas, a costo estimado) y disponible. */
export function presupuestoMes(d, sucursalId, mes) {
  const b = bolsaMant(d);
  const pr = b.presupuestos.find((p) => p.sucursalId === sucursalId && p.mes === mes);
  const ots = b.ordenes.filter((o) => o.sucursalId === sucursalId);
  const ejercido = suma(ots.filter((o) => o.estado === "cerrado" && mesDe(o.cerradoEn || o.fecha) === mes).map((o) => o.costoReal || 0));
  const comprometido = suma(ots.filter((o) => OT_ABIERTAS.includes(o.estado)).map((o) => o.costoEstimado || 0));
  const presupuesto = pr ? pr.monto : 0;
  return { presupuesto, ejercido, comprometido, disponible: redondear(presupuesto - ejercido - comprometido), excedido: presupuesto > 0 && ejercido + comprometido > presupuesto };
}
/** Equipos con servicio vencido o próximo que no tienen una orden abierta: candidatos del plan preventivo. */
export function preventivosPendientes(d, { sucursalId = null, ref = hoy() } = {}) {
  const b = bolsaMant(d);
  return b.equipos.filter((e) => (!sucursalId || e.sucursalId === sucursalId) && ["vencido", "por_vencer"].includes(estadoEquipo(e, ref)) && !b.ordenes.some((o) => o.equipoId === e.id && OT_ABIERTAS.includes(o.estado)))
    .sort((a, b2) => String(proximoServicio(a)).localeCompare(String(proximoServicio(b2))));
}

// ═════════════════════════ Comisiones por servicio y por podólogo (P-106 a P-109)
// Complementa a Bonos y metas (acciones_desempeno.js: escalones sobre venta y metas de sucursal) y a «Mi productividad»:
// aquí el % sale del esquema del podólogo y del SERVICIO realizado, por renglón del ticket, y se congela al cargarlo al periodo.
const bolsaComi = (d) => d.comi || { esquemas: [], periodos: [], detalle: [] };
/** Esquema vigente en la fecha del servicio (P-108): el propio del podólogo; si no tiene, el general. */
export function esquemaVigente(d, podologoId, fecha) {
  const f = dia(fecha);
  const vig = bolsaComi(d).esquemas.filter((e) => e.activo !== false && e.vigenteDesde <= f && (!e.vigenteHasta || e.vigenteHasta >= f));
  const mas = (arr) => arr.sort((a, b) => String(b.vigenteDesde).localeCompare(String(a.vigenteDesde)))[0] || null;
  return mas(vig.filter((e) => e.podologoId === podologoId)) || mas(vig.filter((e) => !e.podologoId));
}
/** % que aplica a un renglón: el del servicio si el esquema lo fija; si no, el general por tipo. */
export function pctComision(esq, { tipo, itemId }) {
  if (!esq) return 0;
  if (tipo === "servicio") { const p = (esq.porServicio || {})[itemId]; return p != null && p !== "" ? Number(p) : Number(esq.pctServicio) || 0; }
  if (tipo === "plan" || tipo === "paquete") return Number(esq.pctPlan) || 0;
  return Number(esq.pctProducto) || 0;
}
export const comisionDe = (base, pct) => redondear((Number(base) || 0) * (Number(pct) || 0) / 100);
const clave = (ventaId, i) => `${ventaId}|${i}`;
/**
 * Renglones comisionables de un rango: ventas cobradas y no canceladas atendidas por un podólogo (venta.vendedorId).
 * Base (P-107) = importe sin IVA, neto de descuentos y de devoluciones. Se excluye lo que ya está cargado en un periodo.
 * La demo no tiene conciliación bancaria en este dominio: «cobrado» se toma como «validado» (P-090) y se rotula.
 */
export function lineasComisionables(d, { desde, hasta, sucursalId = null, podologoId = null } = {}) {
  const ya = new Set(bolsaComi(d).detalle.filter((x) => x.tipo !== "ajuste").map((x) => x.clave));
  const dev = new Map();
  (d.devoluciones || []).forEach((x) => { if (x.ventaId && !["rechazada", "cancelada"].includes(x.estado)) dev.set(x.ventaId, (dev.get(x.ventaId) || 0) + (Number(x.monto) || 0)); });
  const pods = new Set(d.usuarios.filter((u) => u.rol === "podologo").map((u) => u.id));
  const out = [];
  d.ventas.forEach((v) => {
    const f = dia(v.fecha);
    if (v.estado !== "pagada" || !pods.has(v.vendedorId) || f < desde || f > hasta) return;
    if ((sucursalId && v.sucursalId !== sucursalId) || (podologoId && v.vendedorId !== podologoId)) return;
    const factor = v.total > 0 ? Math.max(0, v.total - (dev.get(v.id) || 0)) / v.total : 1;
    const esq = esquemaVigente(d, v.vendedorId, f);
    const { conceptos } = conceptosDeVenta(d, v);
    conceptos.forEach((c, i) => {
      if (ya.has(clave(v.id, i))) return;
      const base = redondear(c.base * factor), pct = pctComision(esq, c);
      out.push({ clave: clave(v.id, i), ventaId: v.id, folio: v.folio, fecha: f, sucursalId: v.sucursalId, podologoId: v.vendedorId, tipo: c.tipo === "paquete" ? "plan" : c.tipo, itemId: c.itemId, descripcion: c.descripcion, base, esquemaId: esq ? esq.id : null, pct, comision: comisionDe(base, pct), sinEsquema: !esq });
    });
  });
  // P-107: los paquetes y planes de láser se comisionan POR SESIÓN ATENDIDA (valor congelado de la sesión), no al venderse.
  const adq = new Map(((d.paq && d.paq.adquiridos) || []).map((a) => [a.id, a]));
  ((d.paq && d.paq.consumos) || []).forEach((c) => {
    const f = dia(c.fecha), a = adq.get(c.adquiridoId);
    if (!a || !pods.has(c.podologoId) || f < desde || f > hasta || ya.has(`pc|${c.id}`)) return;
    if ((sucursalId && c.sucursalId !== sucursalId) || (podologoId && c.podologoId !== podologoId)) return;
    const esq = esquemaVigente(d, c.podologoId, f), pct = pctComision(esq, { tipo: "plan" }), base = redondear(c.valor || 0);
    out.push({ clave: `pc|${c.id}`, ventaId: null, folio: a.folio, fecha: f, sucursalId: c.sucursalId, podologoId: c.podologoId, tipo: "plan", itemId: a.servicioBaseId, descripcion: `${a.nombre} · sesión ${c.n}`, base, esquemaId: esq ? esq.id : null, pct, comision: comisionDe(base, pct), sinEsquema: !esq });
  });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio.localeCompare(b.folio));
}
/** P-108: una venta cancelada después de haberse comisionado genera un ajuste negativo con referencia al renglón original. */
export function ajustesPorCancelacion(d) {
  const b = bolsaComi(d);
  const ref = new Set(b.detalle.filter((x) => x.tipo === "ajuste" && x.referenciaId).map((x) => x.referenciaId));
  const canceladas = new Set(d.ventas.filter((v) => v.estado === "cancelada").map((v) => v.id));
  return b.detalle.filter((x) => x.tipo !== "ajuste" && x.ventaId && canceladas.has(x.ventaId) && !ref.has(x.id))
    .map((x) => ({ clave: `aj|${x.id}`, tipo: "ajuste", referenciaId: x.id, ventaId: x.ventaId, folio: x.folio, fecha: hoy(), sucursalId: x.sucursalId, podologoId: x.podologoId, itemId: x.itemId, descripcion: `Cancelación de ${x.folio} · ${x.descripcion}`, base: -x.base, pct: x.pct, comision: -x.comision, esquemaId: x.esquemaId }));
}
/** Resumen del periodo por podólogo. En un periodo cerrado se devuelven los totales congelados. */
export function resumenComisiones(d, periodoId) {
  const b = bolsaComi(d), per = b.periodos.find((p) => p.id === periodoId);
  if (!per) return { filas: [], base: 0, comision: 0, total: 0 };
  if (per.estado === "cerrado" && per.totales) return per.totales;
  const por = new Map();
  b.detalle.filter((x) => x.periodoId === periodoId).forEach((x) => {
    const f = por.get(x.podologoId) || { podologoId: x.podologoId, base: 0, comision: 0, renglones: 0, porTipo: { servicio: 0, producto: 0, plan: 0, ajuste: 0 }, ventas: new Set(), esquemaId: x.esquemaId };
    f.base += x.base; f.comision += x.comision; f.renglones++; f.porTipo[x.tipo] = (f.porTipo[x.tipo] || 0) + x.comision;
    if (x.tipo === "servicio" && x.ventaId) f.ventas.add(x.ventaId);
    por.set(x.podologoId, f);
  });
  const filas = [...por.values()].map((f) => {
    const esq = b.esquemas.find((e) => e.id === f.esquemaId) || esquemaVigente(d, f.podologoId, per.hasta);
    const citas = f.ventas.size, viatico = redondear(citas * (Number(esq && esq.viaticoPorCita) || 0));
    const comision = redondear(f.comision), bruto = redondear(comision + viatico), piso = Number(esq && esq.pisoPeriodo) || 0;
    const porTipo = Object.fromEntries(Object.entries(f.porTipo).map(([k, v]) => [k, redondear(v)]));
    return { podologoId: f.podologoId, base: redondear(f.base), comision, renglones: f.renglones, citas, viatico, pisoAplicado: bruto < piso, total: Math.max(bruto, piso), porTipo };
  }).sort((a, b2) => b2.total - a.total);
  return { filas, base: suma(filas.map((f) => f.base)), comision: suma(filas.map((f) => f.comision)), total: suma(filas.map((f) => f.total)) };
}
/** Quincena que contiene una fecha: del 1 al 15, o del 16 al fin de mes. */
export function quincenaDe(fecha) {
  const f = dia(fecha), m = f.slice(0, 7), dd = Number(f.slice(8, 10));
  const fin = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  return dd <= 15 ? { desde: `${m}-01`, hasta: `${m}-15` } : { desde: `${m}-16`, hasta: `${m}-${pad(fin)}` };
}
export const periodosTraslapados = (d, desde, hasta, omitirId = null) => bolsaComi(d).periodos.filter((p) => p.id !== omitirId && !(p.hasta < desde || p.desde > hasta));

// ═════════════════════════ Caja: descuento con PIN y tolerancia de corte
/** P-055: hasta 10 % sin PIN; por arriba, PIN de gerente (o administración). Todo descuento exige motivo. */
export function evaluarDescuento(pct, d) {
  const p = Number(pct), libre = cfgVentas(d).descuentoLibrePct;
  if (!Number.isFinite(p) || p < 0 || p > 100) return { ok: false, requierePin: false, libre, error: "El descuento va de 0 a 100 %." };
  return { ok: true, requierePin: p > libre, libre };
}
/** ¿La diferencia supera la tolerancia ($50)? Solo entonces exige autorización (P-058). */
export const fueraDeTolerancia = (dif, tolerancia = PARAMS_VENTAS.toleranciaCorte) => Math.abs(Number(dif) || 0) > Number(tolerancia);
/**
 * Estado del cierre de caja: sin diferencia → listo; dentro de tolerancia → basta la justificación del cajero;
 * fuera de tolerancia → justificación + autorización con PIN (salvo que cierre un gerente o administración).
 */
export function evaluarCierreCaja({ contado, esperado, tolerancia = PARAMS_VENTAS.toleranciaCorte, justificacion = "", esAutorizador = false, autorizado = false }) {
  const dif = redondear((Number(contado) || 0) - (Number(esperado) || 0));
  if (dif === 0) return { dif, ok: true, requiere: [], fueraDeTolerancia: false };
  const requiere = [];
  if (!String(justificacion).trim()) requiere.push("justificacion");
  const fuera = fueraDeTolerancia(dif, tolerancia);
  if (fuera && !esAutorizador && !autorizado) requiere.push("autorizacion");
  return { dif, ok: requiere.length === 0, requiere, fueraDeTolerancia: fuera };
}
/** Diferencia en efectivo de un corte ya hecho (turno.corte.filas) y si quedó fuera de tolerancia. */
export function diferenciaDeCorte(turno, d) {
  const filas = (turno && turno.corte && turno.corte.filas) || [];
  const dif = redondear(filas.reduce((a, f) => a + (f.diferencia || 0), 0));
  const mayor = filas.reduce((a, f) => (Math.abs(f.diferencia || 0) > Math.abs(a) ? f.diferencia : a), 0);
  return { dif, mayor, fuera: fueraDeTolerancia(mayor, cfgVentas(d).toleranciaCorte), autorizada: !!(turno && turno.corte && turno.corte.autorizacionDiferencia) };
}
