// Acciones del dominio «ventas» (incorporado de Pie Firme): facturación CFDI 4.0 SIMULADA, paquetes / membresías / gift cards,
// expedientes de producto y de proveedor, mantenimiento de equipos, comisiones por servicio y por podólogo, y las piezas de caja
// (descuento con PIN de gerente y tolerancia de corte) que la pantalla de cobro conectará.
// Todas reciben el borrador `d` (se llaman dentro de mutar(d => …)), validan el ROL en el dato, VALIDAN ANTES de modificar
// y devuelven { ok, error?, … }. Toda escritura deja bitácora con auditar() y guarda usuarioId / sucursalId de la sesión.
// Reglas puras en reglas_ventas.js (P-055 a P-112 de Pie Firme). Nada de esto es asesoría fiscal: «por validar con contador».
import { auditar, folio, uid } from "./core.js";
import * as R from "./reglas.js";
import * as V from "./reglas_ventas.js";
import { kardex, puedeOperar, solicitarAjuste, MOTIVOS_AJUSTE } from "./acciones_almacen.js";
import { aprobarEnviarOC, registrarPagoCxp, siguienteFolioOC, totalOC, ESTADOS_OC, estadoCxp } from "./acciones_admin.js";
import { registrarGasto } from "./acciones_finanzas.js";
import { hoy, dia, redondear, ahoraLocal, sumarDias, normaliza } from "../lib/format.js";

export * from "./reglas_ventas.js";
export { ESTADOS_OC, totalOC, estadoCxp, MOTIVOS_AJUSTE };

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const num = (x) => (x === "" || x === null || x === undefined ? NaN : Number(x));
const txt = (x) => String(x ?? "").trim();

// ═════════════════════════ Roles y permisos (se validan EN la acción; esconder un botón no es permiso)
export const actor = (d) => { const u = d.usuarios.find((x) => x.id === d.sesion.userId); return u && u.activo !== false ? u : null; };
export const esCentral = (u) => !!u && ["admin", "direccion"].includes(u.rol);
const deSucursal = (u, s) => !!u && (esCentral(u) || (u.sucursales || []).includes(s));
/** Qué puede hacer el usuario en este dominio. La pantalla lo usa para mostrar; las acciones lo vuelven a revisar. */
export function permisosVentas(u) {
  const r = u ? u.rol : null, central = esCentral(u);
  return {
    facturar: central || r === "cajero",             // cajero: solo sus tickets
    fiscal: central,                                  // global, notas de crédito, complementos, cancelación, emisor
    verFacturas: central || ["cajero", "gerente"].includes(r),
    paquetes: central || ["cajero", "recepcion", "gerente"].includes(r),
    paquetesGestion: central || r === "gerente",      // cancelar, transferir
    ofertas: central,                                 // catálogo de paquetes y membresías
    inventario: central || r === "almacen",           // fichas, mermas, evaluación
    inventarioVer: central || ["almacen", "gerente"].includes(r),
    compras: central || (r === "almacen" && !!u.almacenCentral),
    pagos: central,
    mantenimiento: central || r === "gerente",
    mantAutoriza: central,
    comisiones: central,
    comisionesVer: central || r === "gerente",
  };
}
const pv = (d) => permisosVentas(actor(d));
const sesSuc = (d) => d.sesion.sucursalId;

// ═════════════════════════ INTEGRACIÓN: PAC (proveedor autorizado de certificación)
// Hoy NO hay PAC ni certificado de sello digital (CSD): el «timbrado» es una simulación determinista y rotulada.
// En producción estas dos funciones llaman al servidor (función de Netlify / Supabase Edge) que firma el XML con el CSD
// y lo envía al PAC; la llave del PAC jamás vive en el navegador. Ver src/lib/adaptadores/pac.js de Pie Firme.
export const PAC = {
  modo: "simulado",
  // INTEGRACIÓN: PAC.timbrar → POST /api/cfdi/timbrar { xml } → { uuid, fechaTimbrado, selloSat, cadenaOriginal }
  timbrar(f, ahora = ahoraLocal()) {
    return { ok: true, uuid: V.uuidSintetico(`${f.folio}|${f.receptor.rfc}|${f.total}|${ahora}`), timbradaEn: ahora, selloSat: `SIM-SELLO-${V.uuidSintetico(f.folio).slice(3, 15)}`, simulado: true };
  },
  // INTEGRACIÓN: PAC.cancelar → POST /api/cfdi/cancelar { uuid, motivo, folioSustitucion } → { acuse, estatus }
  cancelar(f, motivo, directa) {
    return { ok: true, acuse: V.uuidSintetico(`acuse|${f.uuid}|${motivo}`), estado: directa ? "aceptada" : "esperando_aceptacion", simulado: true };
  },
};
const bolsaFiscal = (d) => (d.fiscal ||= { emisor: {}, pac: { modo: "simulado" }, receptores: [], facturas: [] });
const timbrar = (f) => { const t = PAC.timbrar(f); f.estado = "timbrada"; f.uuid = t.uuid; f.timbradaEn = t.timbradaEn; f.selloSat = t.selloSat; f.simulado = true; return f; };

// ═════════════════════════ Facturación
/** ¿Este usuario puede facturar ESTE ticket? Cajero: los que él cobró; administración y dirección: todos. */
export function puedeFacturarVenta(u, v) {
  if (!u || !v) return false;
  if (esCentral(u)) return true;
  return u.rol === "cajero" && v.cajeroId === u.id;
}
/** Facturas que ve el usuario: cajero las suyas, gerente las de su sucursal, central todas. */
export function facturasVisibles(d, u, { tipo = "", estado = "", texto = "", sucursalId = "", mes = "" } = {}) {
  if (!u) return [];
  const n = normaliza(texto);
  return bolsaFiscal(d).facturas.filter((f) => {
    if (u.rol === "cajero" && f.emitidaPor !== u.id && !(f.ventaId && (d.ventas.find((v) => v.id === f.ventaId) || {}).cajeroId === u.id)) return false;
    if (u.rol === "gerente" && !(u.sucursales || []).includes(f.sucursalId)) return false;
    if (!["cajero", "gerente"].includes(u.rol) && !esCentral(u)) return false;
    if (tipo && f.tipo !== tipo) return false;
    if (estado && f.estado !== estado) return false;
    if (sucursalId && f.sucursalId !== sucursalId) return false;
    if (mes && V.mesDe(f.fecha) !== mes) return false;
    if (n && !normaliza(`${f.folio} ${f.receptor.rfc} ${f.receptor.nombre} ${f.ventaFolio || ""} ${f.uuid || ""}`).includes(n)) return false;
    return true;
  });
}
export function receptoresDePaciente(d, pacienteId) { return bolsaFiscal(d).receptores.filter((r) => r.pacienteId === pacienteId); }

/** Alta o actualización de datos fiscales de un receptor (constancia de situación fiscal). */
export function guardarReceptor(d, datos) {
  const p = pv(d); if (!p.facturar) return err("Los datos fiscales los capturan caja, Administración o Dirección.");
  const v = V.validarReceptor(datos);
  if (!v.ok) return { ok: false, error: Object.values(v.errores)[0], errores: v.errores };
  const b = bolsaFiscal(d);
  let r = datos.id ? b.receptores.find((x) => x.id === datos.id) : b.receptores.find((x) => x.rfc === v.receptor.rfc && (x.pacienteId || null) === (datos.pacienteId || null));
  if (V.esRfcGenerico(v.receptor.rfc) && !datos.id) return ok({ receptor: v.receptor });   // los genéricos no se guardan por paciente
  if (!r) { r = { id: uid("RF"), pacienteId: datos.pacienteId || null, creado: hoy(), automatica: false }; b.receptores.unshift(r); }
  Object.assign(r, v.receptor, { validado: true, actualizadoPor: d.sesion.userId });
  auditar(d, "receptor_guardado", "receptor", r.id, `${r.rfc} · ${r.nombre}`);
  return ok({ receptor: r });
}

/**
 * Factura un ticket cobrado (P-057 a P-066). Valida: permiso del cajero sobre su ticket, que sea facturable, que no esté ya
 * facturado (individual vigente o incluido en una global timbrada), plazo del MISMO MES calendario y datos del receptor.
 */
export function facturarVenta(d, { ventaId, receptor, ref = hoy() }) {
  const u = actor(d);
  const v = d.ventas.find((x) => x.id === ventaId);
  if (!v) return err("No se encontró el ticket.");
  if (!puedeFacturarVenta(u, v)) return err(u && u.rol === "cajero" ? "Solo puedes facturar los tickets que tú cobraste." : "Facturar es de caja, Administración central o Dirección.");
  if (!V.esFacturable(v)) return err(v.tipo === "gift_card" ? "La gift card se factura cuando se canjea (P-073)." : "Solo se facturan tickets pagados y con importe.");
  const ya = V.facturaVigenteDeVenta(d, v.id);
  if (ya) return err(`El ticket ${v.folio} ya está amparado por la factura ${ya.folio}. No se factura dos veces.`);
  if (!V.dentroDePlazo(v.fecha, ref)) return err(`Fuera de plazo: el ticket es de ${V.mesDe(v.fecha)} y solo se factura dentro del mismo mes (P-064). Queda en la factura global de ese mes.`);
  const val = V.validarReceptor(receptor || {});
  if (!val.ok) return { ok: false, error: Object.values(val.errores)[0], errores: val.errores };
  const b = bolsaFiscal(d);
  const c = V.conceptosDeVenta(d, v);
  if (Math.abs(c.total - v.total) > 0.05) return err("El total del CFDI no coincide con el ticket; revisa las partidas.");
  const f = V.facturaBase(b.emisor, { id: uid("FC"), folio: folio(d, "FA"), tipo: "ingreso", receptor: val.receptor, sucursalId: v.sucursalId, fecha: ahoraLocal(), emitidaPor: u.id,
    conceptos: c.conceptos, totales: c, extra: { ventaId: v.id, ventaFolio: v.folio, pacienteId: v.pacienteId, formaPago: V.formaPagoSat(v.pagos), sucursalEmision: sesSuc(d) } });
  timbrar(f);
  b.facturas.unshift(f);
  v.facturaId = f.id; v.facturar = true;
  auditar(d, "factura_timbrada_sim", "factura", f.id, `${f.folio} · ticket ${v.folio} · ${f.receptor.rfc} · ${f.total} (SIMULADO)`);
  return ok({ factura: f });
}

/** Factura de un plan a plazos / crédito: método PPD, forma 99; los abonos se amparan con complementos de pago. */
export function facturarPlan(d, { planId, receptor }) {
  const u = actor(d); if (!esCentral(u)) return err("Las ventas a plazos las factura Administración central o Dirección.");
  const pl = d.planes.find((x) => x.id === planId);
  if (!pl || !["vigente", "liquidado"].includes(pl.estado)) return err("Solo se facturan planes vigentes o liquidados.");
  if (V.facturaVigenteDePlan(d, pl.id)) return err("Ese plan ya tiene factura vigente.");
  const val = V.validarReceptor(receptor || {});
  if (!val.ok) return { ok: false, error: Object.values(val.errores)[0], errores: val.errores };
  const b = bolsaFiscal(d), c = V.conceptosDePlan(d, pl);
  const f = V.facturaBase(b.emisor, { id: uid("FC"), folio: folio(d, "FA"), tipo: "ingreso", receptor: val.receptor, sucursalId: pl.sucursalId, fecha: ahoraLocal(), emitidaPor: u.id, conceptos: c.conceptos, totales: c,
    extra: { planId: pl.id, planFolio: pl.folio, pacienteId: pl.pacienteId, metodoPago: "PPD", formaPago: "99", pagadoInicial: pl.enganche || 0 } });
  timbrar(f); b.facturas.unshift(f);
  auditar(d, "factura_ppd_sim", "factura", f.id, `${f.folio} · plan ${pl.folio} · ${f.total}`);
  return ok({ factura: f });
}

/** Tickets del mes que irían en la factura global (público en general): pagados, sin factura propia. */
export function candidatosGlobal(d, { mes, sucursalId = null }) {
  return V.pendientesDeFacturar(d, { mes, sucursalId, ref: `${mes}-01` }).map((x) => x.venta);
}
/** Factura global mensual (periodicidad 04). Un concepto por ticket y tipo de IVA (clave 01010101, unidad ACT). */
export function facturaGlobal(d, { mes, sucursalId = null, ref = hoy() }) {
  const u = actor(d); if (!esCentral(u)) return err("La factura global la emite Administración central o Dirección.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) return err("Mes no válido.");
  if (mes > V.mesDe(ref)) return err("No se factura un mes futuro.");
  const ventas = candidatosGlobal(d, { mes, sucursalId });
  if (!ventas.length) return err("No hay tickets pendientes de facturar en ese mes.");
  const b = bolsaFiscal(d), conceptos = [];
  ventas.forEach((v) => {
    const c = V.conceptosDeVenta(d, v), grupos = new Map();
    c.conceptos.forEach((x) => { const g = grupos.get(x.ivaTipo) || []; g.push(x); grupos.set(x.ivaTipo, g); });
    grupos.forEach((g, iva) => {
      const s = (k) => redondear(g.reduce((a, x) => a + x[k], 0));
      conceptos.push({ ...g[0], tipo: g[0].tipo, itemId: null, descripcion: `Ticket ${v.folio}${grupos.size > 1 ? (iva === "16" ? " · productos" : " · servicios") : ""}`, cantidad: 1, claveSat: "01010101", unidadSat: "ACT",
        importe: s("importe"), descuento: s("descuento"), base: s("base"), iva: s("iva"), valorUnitario: s("importe"), noIdentificacion: v.folio });
    });
  });
  const tot = V.totalesCfdi(conceptos);
  const f = V.facturaBase(b.emisor, { id: uid("FC"), folio: folio(d, "FG"), tipo: "global", receptor: V.receptorPublico(b.emisor.cp), sucursalId, fecha: ahoraLocal(), emitidaPor: u.id, conceptos, totales: tot,
    extra: { ventaIds: ventas.map((v) => v.id), global: { periodicidad: "04", mes, tickets: ventas.length }, formaPago: "01" } });
  timbrar(f); b.facturas.unshift(f);
  auditar(d, "factura_global_sim", "factura", f.id, `${f.folio} · ${mes} · ${ventas.length} tickets · ${f.total}`);
  return ok({ factura: f });
}

/** Nota de crédito (CFDI de egreso, relación 01). Su monto no puede exceder lo que falta por acreditar de la factura. */
export function notaCredito(d, { facturaId, monto, motivo, devolucionId = null }) {
  const u = actor(d); if (!esCentral(u)) return err("Las notas de crédito las emite Administración central o Dirección.");
  const b = bolsaFiscal(d), f = b.facturas.find((x) => x.id === facturaId);
  if (!f || !["ingreso", "global"].includes(f.tipo)) return err("Elige una factura de ingreso.");
  if (f.estado !== "timbrada") return err("Solo se acreditan facturas timbradas y vigentes.");
  const m = redondear(num(monto));
  if (!Number.isFinite(m) || m <= 0) return err("El monto debe ser mayor que cero.");
  const disp = V.saldoAcreditable(d, f);
  if (m > disp + 0.001) return err(`La nota de crédito no puede exceder lo pendiente de acreditar (${disp}).`);
  if (txt(motivo).length < 5) return err("Escribe el motivo (devolución, descuento, bonificación…).");
  const brutos = f.conceptos.map((c) => c.base + c.iva);
  const partes = V.repartir(m, brutos);
  const conceptos = f.conceptos.map((c, i) => partes[i] > 0 ? { ...V.conceptoCfdi(d, { tipo: c.tipo, itemId: c.itemId, nombre: `${txt(motivo)} · ${c.descripcion}`, cant: 1, bruto: partes[i], desc: 0 }), ivaTipo: c.ivaTipo, ...(c.ivaTipo === "16" ? (() => { const x = V.desglosarIva(partes[i], "16"); return { base: x.base, importe: x.base, valorUnitario: x.base, iva: x.iva, ivaTasa: 0.16 }; })() : { base: partes[i], importe: partes[i], valorUnitario: partes[i], iva: 0, ivaTasa: c.ivaTipo === "tasa0" ? 0 : null }) } : null).filter(Boolean);
  const nc = V.facturaBase(b.emisor, { id: uid("FC"), folio: folio(d, "NCR"), tipo: "egreso", receptor: f.receptor, sucursalId: f.sucursalId, fecha: ahoraLocal(), emitidaPor: u.id, conceptos, totales: V.totalesCfdi(conceptos),
    extra: { relacionada: { facturaId: f.id, folio: f.folio, uuid: f.uuid, tipoRelacion: "01" }, motivo: txt(motivo), devolucionId, formaPago: f.formaPago } });
  timbrar(nc); b.facturas.unshift(nc);
  auditar(d, "nota_credito_sim", "factura", nc.id, `${nc.folio} → ${f.folio} · ${nc.total} · ${txt(motivo)}`);
  return ok({ factura: nc });
}

/** Complemento de pago (CFDI tipo P) por un abono a una factura PPD. */
export function complementoPago(d, { facturaId, abonoId = null, monto, fecha = hoy(), forma = "efectivo" }) {
  const u = actor(d); if (!esCentral(u)) return err("Los complementos de pago los emite Administración central o Dirección.");
  const b = bolsaFiscal(d), f = b.facturas.find((x) => x.id === facturaId);
  if (!f || f.tipo !== "ingreso" || f.metodoPago !== "PPD") return err("El complemento aplica a facturas con método PPD (pago en parcialidades).");
  if (f.estado !== "timbrada") return err("La factura no está vigente.");
  const ab = abonoId ? (d.abonosCredito || []).find((a) => a.id === abonoId) : null;
  if (abonoId && (!ab || ab.planId !== f.planId)) return err("El abono no pertenece al plan de esta factura.");
  if (abonoId && V.complementosDe(d, f.id).some((c) => c.pago.abonoId === abonoId)) return err("Ese abono ya tiene complemento de pago.");
  const m = redondear(ab ? ab.monto : num(monto));
  const saldo = V.saldoInsoluto(d, f);
  if (!Number.isFinite(m) || m <= 0) return err("El monto debe ser mayor que cero.");
  if (m > saldo + 0.001) return err(`El pago excede el saldo insoluto (${saldo}).`);
  const parcialidad = V.complementosDe(d, f.id).length + 1;
  const cp = V.facturaBase(b.emisor, { id: uid("FC"), folio: folio(d, "CP"), tipo: "pago", receptor: { ...f.receptor, usoCfdi: "CP01" }, sucursalId: f.sucursalId, fecha: ahoraLocal(), emitidaPor: u.id,
    extra: { relacionada: { facturaId: f.id, folio: f.folio, uuid: f.uuid }, pago: { abonoId, monto: m, fecha: ab ? ab.fecha : dia(fecha), forma: V.FORMAS_PAGO_SAT[ab ? ab.forma || "efectivo" : forma] || "01", parcialidad, saldoAnterior: saldo, saldoInsoluto: redondear(saldo - m) }, metodoPago: null, formaPago: V.FORMAS_PAGO_SAT[forma] || "01" } });
  timbrar(cp); b.facturas.unshift(cp);
  auditar(d, "complemento_pago_sim", "factura", cp.id, `${cp.folio} → ${f.folio} · parcialidad ${parcialidad} · ${m}`);
  return ok({ factura: cp });
}

/**
 * Cancelación con motivo SAT. En el mismo mes de emisión es directa; después requiere aceptación del receptor (simulada).
 * Motivo 01 (con errores con relación) re-emite en el mismo acto la factura sustituta con los datos corregidos.
 */
export function cancelarFactura(d, { facturaId, motivo, comentario = "", receptorNuevo = null, ref = hoy() }) {
  const u = actor(d); if (!esCentral(u)) return err("La cancelación la hace Administración central o Dirección.");
  const b = bolsaFiscal(d), f = b.facturas.find((x) => x.id === facturaId);
  if (!f) return err("No se encontró la factura.");
  if (f.estado !== "timbrada") return err(f.estado === "cancelada" ? "La factura ya está cancelada." : "La cancelación ya está en proceso.");
  if (!V.MOTIVOS_CANCELACION.some((m) => m[0] === motivo)) return err("Elige el motivo de cancelación del SAT.");
  if (txt(comentario).length < 5) return err("Explica brevemente por qué se cancela.");
  const vivas = b.facturas.filter((x) => x.relacionada && x.relacionada.facturaId === f.id && x.estado !== "cancelada" && x.tipo !== "ingreso");
  if (vivas.length) return err(`Primero cancela sus CFDI relacionados: ${vivas.map((x) => x.folio).join(", ")}.`);
  let sustituta = null;
  if (motivo === "01") {
    if (f.tipo !== "ingreso" || !f.ventaId) return err("La sustitución automática aplica a facturas de un ticket. Usa el motivo 02 o 03.");
    const val = V.validarReceptor(receptorNuevo || {});
    if (!val.ok) return { ok: false, error: `Datos de la factura sustituta: ${Object.values(val.errores)[0]}`, errores: val.errores };
    const v = d.ventas.find((x) => x.id === f.ventaId), c = V.conceptosDeVenta(d, v);
    sustituta = V.facturaBase(b.emisor, { id: uid("FC"), folio: folio(d, "FA"), tipo: "ingreso", receptor: val.receptor, sucursalId: f.sucursalId, fecha: ahoraLocal(), emitidaPor: u.id, conceptos: c.conceptos, totales: c,
      extra: { ventaId: v.id, ventaFolio: v.folio, pacienteId: v.pacienteId, formaPago: f.formaPago, sustituyeA: { facturaId: f.id, folio: f.folio, uuid: f.uuid, tipoRelacion: "04" } } });
  }
  const directa = V.cancelacionDirecta(f, ref) || f.receptor.rfc === V.RFC_PUBLICO;
  const r = PAC.cancelar(f, motivo, directa);
  f.cancelacion = { motivo, comentario: txt(comentario), fecha: ahoraLocal(), por: u.id, directa, estado: r.estado, acuse: r.acuse, sustitutaId: sustituta ? sustituta.id : null };
  f.estado = directa ? "cancelada" : "cancelacion_solicitada";
  if (sustituta) { timbrar(sustituta); b.facturas.unshift(sustituta); const v = d.ventas.find((x) => x.id === f.ventaId); if (v) v.facturaId = sustituta.id; }
  else if (f.estado === "cancelada" && f.ventaId) { const v = d.ventas.find((x) => x.id === f.ventaId); if (v && v.facturaId === f.id) v.facturaId = null; }
  auditar(d, "factura_cancelacion_sim", "factura", f.id, `${f.folio} · motivo ${motivo} · ${directa ? "directa" : "espera aceptación"}${sustituta ? ` · sustituta ${sustituta.folio}` : ""}`);
  return ok({ factura: f, sustituta, directa });
}
/** Respuesta (simulada) del receptor a una cancelación fuera del mes. */
export function resolverCancelacion(d, { facturaId, aceptada }) {
  const u = actor(d); if (!esCentral(u)) return err("Solo Administración central o Dirección.");
  const f = bolsaFiscal(d).facturas.find((x) => x.id === facturaId);
  if (!f || f.estado !== "cancelacion_solicitada") return err("La factura no tiene cancelación en proceso.");
  f.cancelacion.estado = aceptada ? "aceptada" : "rechazada";
  f.estado = aceptada ? "cancelada" : "timbrada";
  if (aceptada && f.ventaId) { const v = d.ventas.find((x) => x.id === f.ventaId); if (v && v.facturaId === f.id) v.facturaId = null; }
  auditar(d, aceptada ? "cancelacion_aceptada_sim" : "cancelacion_rechazada_sim", "factura", f.id, f.folio);
  return ok();
}
/** Datos del emisor (razón social, régimen, CP). Ficticios en la demo. */
export function guardarEmisor(d, datos) {
  const u = actor(d); if (!esCentral(u)) return err("Solo Administración central o Dirección.");
  const rfc = V.limpiarRfc(datos.rfc);
  if (!V.validarRfc(rfc) || V.esRfcGenerico(rfc)) return err("RFC del emisor no válido.");
  if (!V.validarCp(datos.cp)) return err("CP de expedición de 5 dígitos.");
  if (!V.REGIMENES.some((r) => r[0] === datos.regimen)) return err("Elige el régimen fiscal.");
  if (txt(datos.razon).length < 3) return err("Escribe la razón social.");
  Object.assign(bolsaFiscal(d).emisor, { rfc, razon: txt(datos.razon).toUpperCase(), regimen: datos.regimen, cp: txt(datos.cp) });
  auditar(d, "emisor_actualizado", "fiscal", rfc, "Datos del emisor");
  return ok();
}
export function resumenFacturacion(d, u, { mes = V.mesDe(hoy()), sucursalId = null } = {}) {
  const fs = facturasVisibles(d, u, { mes, sucursalId: sucursalId || "" });
  const viva = (f) => f.estado !== "cancelada";
  const s = (arr) => redondear(arr.reduce((a, f) => a + f.total, 0));
  const pend = V.pendientesDeFacturar(d, { mes, sucursalId, cajeroId: u && u.rol === "cajero" ? u.id : null });
  return {
    emitidas: fs.filter((f) => f.tipo !== "pago" && viva(f)).length, facturado: s(fs.filter((f) => ["ingreso", "global"].includes(f.tipo) && viva(f))),
    notas: s(fs.filter((f) => f.tipo === "egreso" && viva(f))), canceladas: fs.filter((f) => f.estado === "cancelada").length,
    enProceso: fs.filter((f) => f.estado === "cancelacion_solicitada").length, pendientes: pend.length, solicitadas: pend.filter((p) => p.solicitada).length,
    ivaTrasladado: redondear(fs.filter((f) => ["ingreso", "global"].includes(f.tipo) && viva(f)).reduce((a, f) => a + f.iva, 0)),
  };
}

// ═════════════════════════ Paquetes, planes de láser, membresías y gift cards
const bolsaPaq = (d) => (d.paq ||= { ofertas: [], adquiridos: [], consumos: [], membresias: [], giftCards: [], giftMovs: [], transferencias: [] });
const validarPagos = (pagos) => {
  const ps = (pagos || []).map((p) => ({ forma: p.forma, monto: redondear(num(p.monto)) })).filter((p) => p.monto > 0);
  if (ps.some((p) => !["efectivo", "tarjeta", "transferencia"].includes(p.forma))) return { error: "Forma de pago no válida." };
  return { pagos: ps, total: redondear(ps.reduce((a, p) => a + p.monto, 0)) };
};
/** Ticket de caja de la venta del paquete (para que entre al corte del turno). La gift card es pasivo: ticket tipo gift_card. */
function ticketDeVenta(d, u, { pacienteId, oferta, pagos, total }) {
  const t = R.turnoAbierto(d, u.id);
  const v = { id: uid("VE"), folio: folio(d, "T"), sucursalId: sesSuc(d), cajeroId: u.id, usuarioId: u.id, pacienteId, consultaId: null, tipo: oferta.tipo === "gift_card" ? "gift_card" : "paquete", fecha: ahoraLocal(),
    partidas: [{ tipo: oferta.tipo === "gift_card" ? "gift_card" : "paquete", itemId: oferta.id, nombre: oferta.nombre, cant: 1, precioLista: oferta.precio, precio: oferta.precio, importe: total }],
    subtotal: total, descuento: 0, total, pagos, estado: "pagada", facturar: false, turnoId: t ? t.id : null, origen: "paquetes" };
  d.ventas.unshift(v);
  return v;
}
export function ofertasActivas(d, tipo = "") { return bolsaPaq(d).ofertas.filter((o) => o.estado === "activa" && (!tipo || o.tipo === tipo)); }

/**
 * Vende una oferta. Paquete / plan: se puede dejar saldo (anticipo ≥ 50 %); membresía y gift card se pagan completas.
 * Vigencia 12 meses desde la compra (P-070); la membresía liga el convenio de descuento al paciente (pantalla Convenios).
 */
export function venderOferta(d, { ofertaId, pacienteId, pagos, beneficiario = "", ref = hoy() }) {
  const u = actor(d);
  if (!pv(d).paquetes) return err("Los paquetes los venden caja, recepción, gerencia o Administración.");
  const b = bolsaPaq(d), o = b.ofertas.find((x) => x.id === ofertaId);
  if (!o || o.estado !== "activa") return err("Elige una oferta activa.");
  const pac = d.pacientes.find((p) => p.id === pacienteId);
  if (!pac && o.tipo !== "gift_card") return err("Elige al paciente.");
  const pg = validarPagos(pagos); if (pg.error) return err(pg.error);
  if (pg.total > o.precio + 0.001) return err("El pago excede el precio.");
  const completo = ["membresia", "gift_card"].includes(o.tipo);
  if (completo && Math.abs(pg.total - o.precio) > 0.001) return err(`${V.TIPOS_OFERTA[o.tipo]}: se paga completa (${o.precio}).`);
  if (!completo && pg.total < redondear(o.precio * 0.5)) return err(`Anticipo mínimo del 50 % (${redondear(o.precio * 0.5)}).`);
  const suc = sesSuc(d), fecha = dia(ref), vence = V.venceDe(fecha, o.caducidadMeses || 12);
  const v = ticketDeVenta(d, u, { pacienteId: pac ? pac.id : null, oferta: o, pagos: pg.pagos, total: pg.total });
  const pagosReg = pg.pagos.map((p) => ({ fecha, ...p, usuarioId: u.id, sucursalId: suc, ventaId: v.id }));
  let reg;
  if (o.tipo === "membresia") {
    reg = { id: uid("MB"), folio: folio(d, "MB"), ofertaId: o.id, nombre: o.nombre, pacienteId: pac.id, sucursalId: suc, inicio: fecha, vence, descuentoPct: o.descuentoPct, beneficios: o.beneficios, convenioId: o.convenioId, precio: o.precio, estado: "vigente", vendidoPor: u.id, pagos: pagosReg };
    b.membresias.unshift(reg);
    if (o.convenioId) pac.convenioId = o.convenioId;
  } else if (o.tipo === "gift_card") {
    const base = V.uuidSintetico(`${o.id}|${ahoraLocal()}|${b.giftCards.length}`).replace(/[^A-Z0-9]/g, "");
    reg = { id: uid("GC"), codigo: `GC-${base.slice(3, 7)}-${base.slice(7, 11)}`, ofertaId: o.id, compradorId: pac ? pac.id : null, beneficiario: txt(beneficiario), montoInicial: o.montoSaldo, saldo: o.montoSaldo, emitida: fecha, vence, sucursalId: suc, estado: "activa", vendidoPor: u.id };
    b.giftCards.unshift(reg);
    b.giftMovs.unshift({ id: uid("GM"), giftId: reg.id, tipo: "emision", monto: o.montoSaldo, fecha, sucursalId: suc, usuarioId: u.id, ref: `Ticket ${v.folio}` });
  } else {
    reg = { id: uid("PQ"), folio: folio(d, "PQ"), ofertaId: o.id, tipo: o.tipo, nombre: o.nombre, pacienteId: pac.id, sucursalId: suc, vendidoPor: u.id, fechaCompra: fecha, vence, sesionesTotal: o.sesionesTotal, sesionesUsadas: 0,
      servicioBaseId: o.servicioBaseId, intervaloDias: o.intervaloDias, precioTotal: o.precio, pagado: pg.total, saldoPendiente: redondear(o.precio - pg.total), pagos: pagosReg, estado: "vigente", transferible: o.transferible };
    b.adquiridos.unshift(reg);
  }
  v.refPaquete = reg.id;
  auditar(d, "oferta_vendida", o.tipo, reg.id, `${o.nombre} · ${pac ? R.nombrePaciente(d, pac.id) : txt(beneficiario) || "sin paciente"} · ${pg.total} · ticket ${v.folio}`);
  return ok({ registro: reg, venta: v });
}
export function abonarPaquete(d, { adquiridoId, monto, forma = "efectivo" }) {
  const u = actor(d); if (!pv(d).paquetes) return err("Sin permiso para cobrar paquetes.");
  const a = bolsaPaq(d).adquiridos.find((x) => x.id === adquiridoId);
  if (!a || a.estado === "cancelado") return err("Paquete no válido.");
  const m = redondear(num(monto));
  if (!Number.isFinite(m) || m <= 0) return err("Escribe un monto mayor que cero.");
  if (m > a.saldoPendiente + 0.001) return err(`El abono excede el saldo (${a.saldoPendiente}).`);
  const pg = validarPagos([{ forma, monto: m }]); if (pg.error) return err(pg.error);
  const o = bolsaPaq(d).ofertas.find((x) => x.id === a.ofertaId) || { id: a.ofertaId, nombre: a.nombre, precio: a.precioTotal, tipo: a.tipo };
  const v = ticketDeVenta(d, u, { pacienteId: a.pacienteId, oferta: { ...o, nombre: `Abono ${a.folio} · ${a.nombre}` }, pagos: pg.pagos, total: m });
  a.pagado = redondear(a.pagado + m); a.saldoPendiente = redondear(a.precioTotal - a.pagado);
  a.pagos.push({ fecha: hoy(), forma, monto: m, usuarioId: u.id, sucursalId: sesSuc(d), ventaId: v.id });
  auditar(d, "paquete_abono", "paquete", a.id, `${a.folio} · ${m} · saldo ${a.saldoPendiente}`);
  return ok({ saldo: a.saldoPendiente });
}
/** Sesiones que ya están pagadas (con saldo pendiente no se consumen sesiones sin pagar). */
export const sesionesPagadas = (a) => (a.saldoPendiente > 0 ? Math.floor((a.pagado + 0.001) / (V.valorSesion(a) || 1)) : a.sesionesTotal);
/** Registra el consumo de una sesión. Se puede usar en cualquier sucursal (P-071). */
export function consumirSesion(d, { adquiridoId, podologoId, consultaId = null, nota = "", ref = hoy() }) {
  const u = actor(d);
  if (!(pv(d).paquetes || (u && u.rol === "podologo"))) return err("Sin permiso para registrar sesiones.");
  const a = bolsaPaq(d).adquiridos.find((x) => x.id === adquiridoId);
  if (!a) return err("Paquete no encontrado.");
  const p = V.puedeConsumir(a, ref); if (!p.ok) return p;
  if (a.sesionesUsadas + 1 > sesionesPagadas(a)) return err(`Hay saldo pendiente (${a.saldoPendiente}): solo están pagadas ${sesionesPagadas(a)} sesión(es).`);
  const pod = d.usuarios.find((x) => x.id === podologoId && x.rol === "podologo");
  if (!pod) return err("Elige al podólogo que atendió.");
  a.sesionesUsadas++;
  const c = { id: uid("PC"), adquiridoId: a.id, n: a.sesionesUsadas, fecha: dia(ref), sucursalId: sesSuc(d), podologoId: pod.id, consultaId, valor: V.valorSesion(a), registradoPor: u.id, nota: txt(nota) };
  bolsaPaq(d).consumos.unshift(c);
  auditar(d, "paquete_sesion", "paquete", a.id, `${a.folio} · sesión ${c.n}/${a.sesionesTotal} · ${pod.nombre}`);
  return ok({ consumo: c, restantes: V.sesionesRestantes(a) });
}
export function transferirPaquete(d, { adquiridoId, aPacienteId, motivo }) {
  const u = actor(d); if (!pv(d).paquetesGestion) return err("Transferir un paquete lo autoriza gerencia o Administración.");
  const a = bolsaPaq(d).adquiridos.find((x) => x.id === adquiridoId);
  if (!a) return err("Paquete no encontrado.");
  if (u.rol === "gerente" && !u.sucursales.includes(a.sucursalId)) return err("El gerente solo gestiona paquetes vendidos en su sucursal.");
  if (!a.transferible) return err("Este paquete no es transferible.");
  if (V.estadoAdquirido(a) !== "vigente") return err("Solo se transfieren paquetes vigentes con sesiones.");
  if (!d.pacientes.some((p) => p.id === aPacienteId) || aPacienteId === a.pacienteId) return err("Elige a otro paciente.");
  if (txt(motivo).length < 3) return err("Escribe el motivo.");
  bolsaPaq(d).transferencias.unshift({ id: uid("PT"), adquiridoId: a.id, dePacienteId: a.pacienteId, aPacienteId, fecha: hoy(), motivo: txt(motivo), por: u.id, sucursalId: sesSuc(d) });
  const de = a.pacienteId; a.pacienteId = aPacienteId;
  auditar(d, "paquete_transferido", "paquete", a.id, `${a.folio}: ${R.nombrePaciente(d, de)} → ${R.nombrePaciente(d, aPacienteId)}`);
  return ok();
}
/** Cancela un paquete; el reembolso sugerido es lo pagado menos las sesiones usadas a su valor congelado. */
export function cancelarPaquete(d, { adquiridoId, motivo }) {
  const u = actor(d); if (!pv(d).paquetesGestion) return err("Cancelar un paquete lo autoriza gerencia o Administración.");
  const a = bolsaPaq(d).adquiridos.find((x) => x.id === adquiridoId);
  if (!a || a.estado === "cancelado") return err("Paquete no válido.");
  if (u.rol === "gerente" && !u.sucursales.includes(a.sucursalId)) return err("El gerente solo gestiona paquetes vendidos en su sucursal.");
  if (txt(motivo).length < 5) return err("Escribe el motivo de la cancelación.");
  const reembolso = Math.max(0, redondear(a.pagado - a.sesionesUsadas * V.valorSesion(a)));
  a.estado = "cancelado"; a.canceladoEl = hoy(); a.motivoCancelacion = txt(motivo); a.reembolsoSugerido = reembolso; a.canceladoPor = u.id;
  auditar(d, "paquete_cancelado", "paquete", a.id, `${a.folio} · reembolso sugerido ${reembolso} · ${txt(motivo)}`);
  return ok({ reembolso });
}
export const buscarGift = (d, codigo) => bolsaPaq(d).giftCards.find((g) => normaliza(g.codigo).replace(/[^a-z0-9]/g, "") === normaliza(codigo).replace(/[^a-z0-9]/g, "")) || null;
/** Canje parcial o total de una gift card (no se combina con promociones, P-073). */
export function canjearGift(d, { codigo, monto, concepto = "" , ref = hoy() }) {
  const u = actor(d); if (!pv(d).paquetes) return err("Sin permiso para canjear gift cards.");
  const g = buscarGift(d, codigo);
  if (!g) return err("No existe una gift card con ese código.");
  const e = V.estadoGift(g, ref);
  if (e !== "activa") return err(e === "caducada" ? `La gift card venció el ${g.vence}.` : e === "canjeada" ? "La gift card ya no tiene saldo." : "La gift card está cancelada.");
  const m = redondear(num(monto));
  if (!Number.isFinite(m) || m <= 0) return err("Escribe el monto a canjear.");
  if (m > g.saldo + 0.001) return err(`El canje excede el saldo (${g.saldo}).`);
  g.saldo = redondear(g.saldo - m);
  bolsaPaq(d).giftMovs.unshift({ id: uid("GM"), giftId: g.id, tipo: "canje", monto: -m, fecha: dia(ref), sucursalId: sesSuc(d), usuarioId: u.id, ref: txt(concepto) || "Canje en caja" });
  auditar(d, "gift_canje", "gift_card", g.id, `${g.codigo} · ${m} · saldo ${g.saldo}`);
  return ok({ saldo: g.saldo });
}
export function renovarMembresia(d, { membresiaId, pagos, ref = hoy() }) {
  const u = actor(d); if (!pv(d).paquetes) return err("Sin permiso para renovar membresías.");
  const b = bolsaPaq(d), m = b.membresias.find((x) => x.id === membresiaId);
  if (!m || ["cancelada", "renovada"].includes(m.estado)) return err("Membresía no válida.");
  const o = b.ofertas.find((x) => x.id === m.ofertaId) || { id: m.ofertaId, nombre: m.nombre, precio: m.precio, tipo: "membresia", convenioId: m.convenioId };
  const pg = validarPagos(pagos); if (pg.error) return err(pg.error);
  if (Math.abs(pg.total - o.precio) > 0.001) return err(`La renovación se paga completa (${o.precio}).`);
  const inicio = m.vence >= dia(ref) ? sumarDias(m.vence, 1) : dia(ref);
  const v = ticketDeVenta(d, u, { pacienteId: m.pacienteId, oferta: { ...o, nombre: `Renovación ${o.nombre}` }, pagos: pg.pagos, total: pg.total });
  const n = { ...m, id: uid("MB"), folio: folio(d, "MB"), inicio, vence: V.venceDe(inicio, 12), estado: "vigente", vendidoPor: u.id, sucursalId: sesSuc(d), renuevaA: m.id, pagos: pg.pagos.map((p) => ({ fecha: dia(ref), ...p, usuarioId: u.id, ventaId: v.id })) };
  m.estado = "renovada";
  b.membresias.unshift(n);
  auditar(d, "membresia_renovada", "membresia", n.id, `${m.folio} → ${n.folio} · vence ${n.vence}`);
  return ok({ membresia: n });
}
/** Alta / edición del catálogo de paquetes y membresías (Administración). */
export function guardarOferta(d, datos) {
  const u = actor(d); if (!pv(d).ofertas) return err("El catálogo de paquetes lo administra Administración central o Dirección.");
  const b = bolsaPaq(d);
  if (!V.TIPOS_OFERTA[datos.tipo]) return err("Elige el tipo.");
  if (txt(datos.nombre).length < 3) return err("Escribe el nombre.");
  const precio = redondear(num(datos.precio));
  if (!Number.isFinite(precio) || precio <= 0) return err("Precio mayor que cero.");
  const ses = num(datos.sesionesTotal);
  if (["paquete", "plan_laser"].includes(datos.tipo) && (!Number.isInteger(ses) || ses < 2 || ses > 40)) return err("Número de sesiones entre 2 y 40.");
  if (["paquete", "plan_laser"].includes(datos.tipo) && !d.servicios.some((s) => s.id === datos.servicioBaseId)) return err("Elige el servicio que cubre.");
  const desc = num(datos.descuentoPct);
  if (datos.tipo === "membresia" && (!Number.isFinite(desc) || desc <= 0 || desc > 50)) return err("Descuento de la membresía entre 1 % y 50 %.");
  let o = datos.id ? b.ofertas.find((x) => x.id === datos.id) : null;
  if (!o) { o = { id: uid("OF"), codigo: txt(datos.codigo) || `OF-${b.ofertas.length + 1}`, creado: hoy(), estado: "activa", componentes: [], beneficios: [], caducidadMeses: 12, transferible: true, todasSedes: true }; b.ofertas.push(o); }
  Object.assign(o, { tipo: datos.tipo, nombre: txt(datos.nombre), descripcion: txt(datos.descripcion), precio, sesionesTotal: Number.isInteger(ses) ? ses : null, servicioBaseId: datos.servicioBaseId || null,
    intervaloDias: num(datos.intervaloDias) || null, descuentoPct: datos.tipo === "membresia" ? desc : null, montoSaldo: datos.tipo === "gift_card" ? precio : null, transferible: datos.transferible !== false, estado: datos.estado || o.estado });
  if (o.tipo === "membresia" && !o.convenioId) {
    const cv = { id: uid("CVM"), nombre: o.nombre, tipo: "membresia", descuentoPct: o.descuentoPct };
    d.convenios.push(cv); o.convenioId = cv.id;
  } else if (o.tipo === "membresia") { const cv = d.convenios.find((c) => c.id === o.convenioId); if (cv) cv.descuentoPct = o.descuentoPct; }
  auditar(d, "oferta_guardada", "oferta", o.id, `${o.nombre} · ${precio}`);
  return ok({ oferta: o });
}
/** Avisos a 30 días: paquetes, membresías y gift cards por vencer (para la recepción y la caja). */
export function avisosVencimiento(d, { sucursalId = null, ref = hoy(), dias = V.PARAMS_VENTAS.avisoVencimientoDias } = {}) {
  const b = bolsaPaq(d), de = (x) => !sucursalId || x.sucursalId === sucursalId;
  const out = [];
  b.adquiridos.filter((a) => de(a) && V.porVencer(a, ref, dias)).forEach((a) => out.push({ id: a.id, tipo: a.tipo, nombre: a.nombre, pacienteId: a.pacienteId, vence: a.vence, dias: V.diasParaVencer(a, ref), detalle: `${V.sesionesRestantes(a)} sesión(es) sin usar` }));
  b.membresias.filter((m) => de(m) && V.estadoMembresia(m, ref) === "vigente" && V.diasParaVencer(m, ref) <= dias).forEach((m) => out.push({ id: m.id, tipo: "membresia", nombre: m.nombre, pacienteId: m.pacienteId, vence: m.vence, dias: V.diasParaVencer(m, ref), detalle: "Ofrecer renovación" }));
  b.giftCards.filter((g) => de(g) && V.estadoGift(g, ref) === "activa" && V.diasParaVencer(g, ref) <= dias).forEach((g) => out.push({ id: g.id, tipo: "gift_card", nombre: g.codigo, pacienteId: g.compradorId, vence: g.vence, dias: V.diasParaVencer(g, ref), detalle: `Saldo ${g.saldo}` }));
  return out.sort((a, b2) => a.dias - b2.dias);
}

// ═════════════════════════ Inventario: expediente de producto
const bolsaInv = (d) => (d.inv ||= { fichas: {}, provFichas: {}, provProductos: [], provEval: [], provDocs: [], mermas: [] });
export function guardarFichaProducto(d, productoId, datos) {
  const u = actor(d); if (!pv(d).inventario) return err("La ficha del producto la edita el almacén o Administración.");
  const p = d.productos.find((x) => x.id === productoId); if (!p) return err("Producto no encontrado.");
  if (datos.ivaTipo && !["16", "exento", "tasa0"].includes(String(datos.ivaTipo))) return err("Tipo de IVA no válido.");
  if (datos.claveSat && !/^\d{8}$/.test(txt(datos.claveSat))) return err("La clave de producto SAT tiene 8 dígitos.");
  if (datos.codigoBarras && !/^\d{8,14}$/.test(txt(datos.codigoBarras))) return err("Código de barras de 8 a 14 dígitos.");
  const fotos = datos.fotos || (bolsaInv(d).fichas[productoId] || {}).fotos || [];
  if (fotos.some((f) => String(f).length > 120000)) return err("La foto es muy grande: se guarda reducida (usa reducirImagen).");
  const f = (bolsaInv(d).fichas[productoId] ||= { fotos: [] });
  ["descripcion", "marca", "claveSat", "unidadSat", "ubicacion", "codigoBarras"].forEach((k) => { if (datos[k] !== undefined) f[k] = txt(datos[k]); });
  if (datos.ivaTipo) f.ivaTipo = String(datos.ivaTipo);
  f.fotos = fotos.slice(0, 3); f.actualizado = hoy(); f.actualizadoPor = u.id;
  auditar(d, "ficha_producto", "producto", productoId, `${p.nombre}${datos.ivaTipo ? ` · IVA ${datos.ivaTipo}` : ""}`);
  return ok();
}
/** Merma con evidencia: crea la solicitud de ajuste (la autoriza gerencia o administración, P-086) y la ficha de la merma. */
export function registrarMerma(d, { almacenId, productoId, cant, motivo, nota = "", foto = null }) {
  const u = actor(d);
  if (!u || u.rol !== "almacen") return err("Las mermas las registra el almacén (la autoriza gerencia o administración).");
  const n = num(cant);
  if (!Number.isInteger(n) || n <= 0) return err("Cantidad entera mayor que cero.");
  if (foto && String(foto).length > 120000) return err("La foto es muy grande.");
  const r = solicitarAjuste(d, { almacenId, productoId, cant: -n, motivo, nota }, u);
  if (!r.ok) return r;
  const pr = d.productos.find((p) => p.id === productoId);
  const m = { id: uid("MR"), folio: folio(d, "MR"), almacenId, productoId, cant: n, motivo, nota: txt(nota), fecha: hoy(), registradoPor: u.id, sucursalId: sesSuc(d), estado: "pendiente", valor: redondear(n * V.costoPromedio(d, productoId, almacenId) || n * pr.costo), foto, autorizacionId: r.autorizacion.id };
  bolsaInv(d).mermas.unshift(m);
  return ok({ merma: m });
}
/** Todo el expediente de un producto en un objeto (la pantalla solo pinta). */
export function expedienteProducto(d, productoId, { almacenId = null, ref = hoy() } = {}) {
  const p = d.productos.find((x) => x.id === productoId); if (!p) return null;
  const inv = bolsaInv(d), ficha = inv.fichas[productoId] || {};
  const existencias = V.existenciasPorAlmacen(d, productoId);
  const almacenes = almacenId ? [almacenId] : d.almacenes.map((a) => a.id);
  const movs = almacenes.flatMap((a) => kardex(d, a, productoId).map((m) => ({ ...m, almacenId: a })));
  const stockSel = almacenId ? existencias.find((e) => e.almacenId === almacenId).stock : V.existenciaTotal(d, productoId);
  const k = V.kardexConSaldo(movs, stockSel);
  const precios = d.sucursales.map((s) => ({ sucursalId: s.id, nombre: s.nombre, precio: R.precioFinal(d, s.id, "producto", productoId), ajuste: R.ajustePct(d, s.id, "producto", productoId) }));
  const hist = (d.listaPreciosHist || []).filter((h) => h.itemId === productoId || (h.itemId === "*" && h.campo === "ajustePct")).slice(0, 40);
  const proveedores = inv.provProductos.filter((x) => x.productoId === productoId).map((x) => {
    const ultima = d.oc.filter((o) => o.proveedorId === x.proveedorId && o.partidas.some((pp) => pp.productoId === productoId)).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    return { ...x, nombre: (inv.provFichas[x.proveedorId] || {}).razon || (d.proveedores.find((pp) => pp.id === x.proveedorId) || {}).nombre, ultimaCompra: ultima ? ultima.fecha : null, ultimoCosto: ultima ? ultima.partidas.find((pp) => pp.productoId === productoId).costo : null };
  });
  const mermas = inv.mermas.filter((m) => m.productoId === productoId && (!almacenId || m.almacenId === almacenId)).map((m) => ({ ...m, estadoActual: V.estadoMerma(d, m) }));
  return {
    producto: p, ficha, existencias, stock: stockSel, valor: almacenId ? existencias.find((e) => e.almacenId === almacenId).valor : V.valorInventario(d, productoId),
    costoPromedio: V.costoPromedio(d, productoId, almacenId), kardex: k, precios, hist, proveedores, mermas,
    rotacion30: V.rotacionProducto(d, productoId, { dias: 30, ref, almacenId }), rotacion90: V.rotacionProducto(d, productoId, { dias: 90, ref, almacenId }),
    bajoMinimo: existencias.filter((e) => e.almacenId !== "CEN" && e.stock < p.minimo).map((e) => e.almacenId),
  };
}
/** Catálogo para el mosaico / renglones. */
export function catalogoProductos(d, { texto = "", categoria = "", almacenId = null } = {}) {
  const n = normaliza(texto), inv = bolsaInv(d);
  return d.productos.filter((p) => (!categoria || p.categoria === categoria) && (!n || normaliza(`${p.nombre} ${p.sku} ${(inv.fichas[p.id] || {}).marca || ""} ${(inv.fichas[p.id] || {}).codigoBarras || ""}`).includes(n)))
    .map((p) => {
      const stock = almacenId ? R.stock(d, almacenId, p.id) : V.existenciaTotal(d, p.id);
      const valor = almacenId ? redondear(d.capas.filter((c) => c.productoId === p.id && c.almacenId === almacenId).reduce((a, c) => a + c.cant * c.costo, 0)) : V.valorInventario(d, p.id);
      return { ...p, ficha: inv.fichas[p.id] || {}, stock, valor, bajo: almacenId && almacenId !== "CEN" ? stock < p.minimo : false };
    });
}

// ═════════════════════════ Inventario: expediente de proveedor
export function guardarFichaProveedor(d, proveedorId, datos) {
  const u = actor(d); if (!pv(d).inventario) return err("El expediente del proveedor lo edita el almacén o Administración.");
  const p = d.proveedores.find((x) => x.id === proveedorId); if (!p) return err("Proveedor no encontrado.");
  if (datos.rfc && !V.validarRfc(datos.rfc)) return err("RFC del proveedor no válido.");
  if (datos.cp && !V.validarCp(datos.cp)) return err("CP de 5 dígitos.");
  if (datos.diasCredito !== undefined && (!Number.isInteger(num(datos.diasCredito)) || num(datos.diasCredito) < 0 || num(datos.diasCredito) > 120)) return err("Días de crédito entre 0 y 120.");
  if (datos.clabe && !/^\d{18}$/.test(txt(datos.clabe))) return err("La CLABE tiene 18 dígitos.");
  const f = (bolsaInv(d).provFichas[proveedorId] ||= { banco: {} });
  ["razon", "contacto", "telefono", "correo", "domicilio", "condiciones", "categoria", "notas", "regimen", "cp"].forEach((k) => { if (datos[k] !== undefined) f[k] = txt(datos[k]); });
  if (datos.rfc) f.rfc = V.limpiarRfc(datos.rfc);
  if (datos.diasCredito !== undefined) { f.diasCredito = num(datos.diasCredito); p.dias = f.diasCredito; }
  ["entregaDias", "minimoCompra"].forEach((k) => { if (datos[k] !== undefined && Number.isFinite(num(datos[k]))) f[k] = num(datos[k]); });
  if (datos.estado) f.estado = datos.estado === "inactivo" ? "inactivo" : "activo";
  if (datos.clabe !== undefined || datos.banco !== undefined) {
    if (!esCentral(u)) return err("Los datos bancarios solo los cambia Administración central (control de pagos).");
    f.banco = { ...(f.banco || {}), banco: txt(datos.banco ?? f.banco.banco), clabe: txt(datos.clabe ?? f.banco.clabe), titular: f.razon || p.nombre };
  }
  f.actualizado = hoy();
  auditar(d, "ficha_proveedor", "proveedor", proveedorId, `${f.razon || p.nombre}${datos.clabe ? " · cambio de CLABE" : ""}`);
  return ok();
}
export function evaluarProveedor(d, { proveedorId, puntualidad, calidad, precio, servicio, comentario = "" }) {
  const u = actor(d); if (!pv(d).inventario) return err("Evalúa el almacén o Administración.");
  if (!d.proveedores.some((p) => p.id === proveedorId)) return err("Proveedor no encontrado.");
  const vals = { puntualidad: num(puntualidad), calidad: num(calidad), precio: num(precio), servicio: num(servicio) };
  if (Object.values(vals).some((x) => !Number.isInteger(x) || x < 1 || x > 5)) return err("Califica cada criterio de 1 a 5.");
  const e = { id: uid("PE"), proveedorId, fecha: hoy(), ...vals, comentario: txt(comentario), evaluadoPor: u.id, sucursalId: sesSuc(d) };
  bolsaInv(d).provEval.unshift(e);
  auditar(d, "proveedor_evaluado", "proveedor", proveedorId, Object.values(vals).join("/"));
  return ok({ evaluacion: e });
}
export function agregarDocumentoProveedor(d, { proveedorId, nombre, tipo = "otro", vigenteHasta = null, miniatura = null }) {
  const u = actor(d); if (!pv(d).inventario) return err("Sin permiso.");
  if (!d.proveedores.some((p) => p.id === proveedorId)) return err("Proveedor no encontrado.");
  if (txt(nombre).length < 3) return err("Nombre del documento.");
  if (miniatura && String(miniatura).length > 120000) return err("La imagen es muy grande.");
  const doc = { id: uid("PD"), proveedorId, nombre: txt(nombre), tipo, vigenteHasta: vigenteHasta || null, subido: hoy(), subidoPor: u.id, miniatura, nota: miniatura ? "" : "Sin archivo: en producción se adjunta al almacenamiento de archivos." };
  bolsaInv(d).provDocs.unshift(doc);
  auditar(d, "documento_proveedor", "proveedor", proveedorId, doc.nombre);
  return ok({ documento: doc });
}
/**
 * Orden de compra desde el expediente del proveedor. P-081: menos de $5,000 sale aprobada (enviada); desde $5,000 queda
 * «por aprobar» hasta que Administración la autorice. El almacén central o Administración la crean.
 */
export function solicitarCompra(d, { proveedorId, partidas, almacenId = "CEN" }) {
  const u = actor(d); if (!pv(d).compras) return err("Las órdenes de compra las crea el almacén central o Administración.");
  if (!d.proveedores.some((p) => p.id === proveedorId)) return err("Elige un proveedor.");
  if (!d.almacenes.some((a) => a.id === almacenId)) return err("Almacén destino no válido.");
  const ficha = bolsaInv(d).provFichas[proveedorId] || {};
  if (ficha.estado === "inactivo") return err("El proveedor está inactivo.");
  const m = new Map();
  for (const x of partidas || []) {
    const cant = num(x.cant), costo = num(x.costo);
    if (!d.productos.some((p) => p.id === x.productoId)) return err("Hay una partida con producto no válido.");
    if (!Number.isInteger(cant) || cant <= 0) return err("Cantidad entera mayor que cero.");
    if (!Number.isFinite(costo) || costo <= 0) return err("Costo mayor que cero.");
    const o = m.get(x.productoId);
    if (o) o.cant += cant; else m.set(x.productoId, { productoId: x.productoId, cant, costo: redondear(costo), recibido: 0 });
  }
  if (!m.size) return err("Agrega al menos una partida.");
  const total = V.totalPartidas([...m.values()]);
  if (ficha.minimoCompra && total < ficha.minimoCompra) return err(`El proveedor pide un mínimo de compra de ${ficha.minimoCompra}.`);
  const requiere = V.requiereAutorizacionCompra(total, d);
  const o = { id: uid("OC"), folio: siguienteFolioOC(d), proveedorId, almacenId, fecha: hoy(), estado: "por_aprobar", partidas: [...m.values()], factura: null, creadaPor: u.id, sucursalId: sesSuc(d), requiereAutorizacion: requiere };
  if (!requiere || esCentral(u)) { o.estado = "enviada"; o.aprobadaPor = requiere ? u.id : null; o.autoAprobada = !requiere; o.enviadaEn = ahoraLocal(); }
  d.oc.unshift(o);
  auditar(d, "oc_creada", "oc", o.id, `${o.folio} · ${total}${requiere ? (esCentral(u) ? " · autorizada por Administración" : " · requiere autorización (≥ $5,000)") : " · menor a $5,000, sale aprobada"}`);
  return ok({ oc: o, requiereAutorizacion: requiere, total });
}
export const aprobarCompra = (d, ocId) => aprobarEnviarOC(d, ocId);
export const pagarCxp = (d, datos) => registrarPagoCxp(d, datos);
export function expedienteProveedor(d, proveedorId, ref = hoy()) {
  const p = d.proveedores.find((x) => x.id === proveedorId); if (!p) return null;
  const inv = bolsaInv(d);
  const ordenes = d.oc.filter((o) => o.proveedorId === proveedorId).sort((a, b) => b.fecha.localeCompare(a.fecha)).map((o) => ({ ...o, total: totalOC(o) }));
  const cxp = d.cxp.filter((c) => c.proveedorId === proveedorId).map((c) => ({ ...c, estadoActual: estadoCxp(c, ref) })).sort((a, b) => a.vence.localeCompare(b.vence));
  const notas = ((d.fin && d.fin.notasCompra) || []).filter((n) => n.proveedorId === proveedorId);
  const devoluciones = (d.devolucionesProveedor || []).filter((x) => x.proveedorId === proveedorId);
  const productos = inv.provProductos.filter((x) => x.proveedorId === proveedorId).map((x) => ({ ...x, producto: d.productos.find((pp) => pp.id === x.productoId) }));
  const docs = inv.provDocs.filter((x) => x.proveedorId === proveedorId).map((x) => ({ ...x, vencido: !!x.vigenteHasta && x.vigenteHasta < ref, porVencer: !!x.vigenteHasta && x.vigenteHasta >= ref && x.vigenteHasta <= sumarDias(ref, 30) }));
  return { proveedor: p, ficha: inv.provFichas[proveedorId] || {}, resumen: V.resumenProveedor(d, proveedorId, ref), evaluacion: V.evaluacionProveedor(d, proveedorId), evaluaciones: inv.provEval.filter((e) => e.proveedorId === proveedorId), ordenes, cxp, notas, hayNotas: !!(d.fin && d.fin.notasCompra), devoluciones, productos, docs };
}

// ═════════════════════════ Mantenimiento de equipos
const bolsaMant = (d) => (d.mant ||= { equipos: [], ordenes: [], presupuestos: [], tecnicos: [] });
const puedeMantDe = (u, sucursalId) => esCentral(u) || (!!u && u.rol === "gerente" && u.sucursales.includes(sucursalId));
export const sucursalesMant = (d, u) => (esCentral(u) ? d.sucursales : u && u.rol === "gerente" ? d.sucursales.filter((s) => u.sucursales.includes(s.id)) : []);
const histOT = (o, de, a, por, nota = "") => o.historial.push({ fecha: ahoraLocal(), de, a, por, nota });
export function guardarEquipo(d, datos) {
  const u = actor(d);
  if (!puedeMantDe(u, datos.sucursalId)) return err("Los equipos los administra el gerente de la sucursal o Administración.");
  if (!V.TIPOS_EQUIPO[datos.tipo]) return err("Elige el tipo de equipo.");
  if (txt(datos.nombre).length < 3) return err("Escribe el nombre del equipo.");
  const per = num(datos.periodicidadDias);
  if (!Number.isInteger(per) || per < 15 || per > 730) return err("Periodicidad del preventivo entre 15 y 730 días.");
  const b = bolsaMant(d);
  let e = datos.id ? b.equipos.find((x) => x.id === datos.id) : null;
  if (datos.id && !e) return err("Equipo no encontrado.");
  if (e && !puedeMantDe(u, e.sucursalId)) return err("Ese equipo es de otra sucursal.");
  if (!e) { e = { id: uid("EQ"), codigo: `${datos.tipo.slice(0, 3).toUpperCase()}-${datos.sucursalId}-${b.equipos.filter((x) => x.sucursalId === datos.sucursalId).length + 1}`, estado: "vigente", compra: hoy(), notas: "" }; b.equipos.push(e); }
  Object.assign(e, { sucursalId: datos.sucursalId, tipo: datos.tipo, nombre: txt(datos.nombre), marca: txt(datos.marca), modelo: txt(datos.modelo), serie: txt(datos.serie), ubicacion: txt(datos.ubicacion), periodicidadDias: per, ultimoServicio: datos.ultimoServicio || e.ultimoServicio || hoy(), valor: num(datos.valor) || e.valor || 0, responsableId: e.responsableId || u.id });
  if (datos.estado === "baja") e.estado = "baja";
  auditar(d, "equipo_guardado", "equipo", e.id, `${e.codigo} · ${e.nombre}`);
  return ok({ equipo: e });
}
/** Nueva orden de trabajo. Urgente de hasta $2,000 puede iniciarse sin autorización (P-112); el resto la autoriza Administración. */
export function crearOT(d, { equipoId, tipo, descripcion, costoEstimado, proveedor = "", programada = null }) {
  const u = actor(d), b = bolsaMant(d);
  const eq = b.equipos.find((x) => x.id === equipoId); if (!eq) return err("Elige el equipo.");
  if (!puedeMantDe(u, eq.sucursalId)) return err("Las órdenes las levanta el gerente de la sucursal o Administración.");
  if (!V.TIPOS_OT[tipo]) return err("Elige el tipo de orden.");
  if (txt(descripcion).length < 5) return err("Describe el trabajo o la falla.");
  const c = redondear(num(costoEstimado));
  if (!Number.isFinite(c) || c < 0) return err("Costo estimado no válido.");
  if (b.ordenes.some((o) => o.equipoId === eq.id && V.OT_ABIERTAS.includes(o.estado) && o.tipo === tipo)) return err("Ese equipo ya tiene una orden abierta de ese tipo.");
  const o = { id: uid("OT"), folio: folio(d, "OT"), equipoId: eq.id, sucursalId: eq.sucursalId, tipo, descripcion: txt(descripcion), fecha: hoy(), solicitadoPor: u.id, costoEstimado: c, costoReal: null, estado: "solicitado", proveedor: txt(proveedor), programada,
    asignadoA: null, autorizadoPor: null, autorizadoEn: null, autorizacionPendiente: false, iniciadoEn: null, cerradoEn: null, resultado: "", motivoRechazo: "", gastoId: null, evidencias: [], historial: [] };
  histOT(o, null, "solicitado", u.id, "Solicitud registrada");
  if (esCentral(u)) { o.estado = "autorizado"; o.autorizadoPor = u.id; o.autorizadoEn = ahoraLocal(); histOT(o, "solicitado", "autorizado", u.id, "Levantada y autorizada por Administración"); }
  if (tipo !== "preventivo" && eq.estado === "vigente") eq.estado = "falla";
  b.ordenes.unshift(o);
  auditar(d, "ot_creada", "ot", o.id, `${o.folio} · ${eq.codigo} · ${V.TIPOS_OT[tipo]} · ${c}`);
  return ok({ orden: o, sinAutorizar: V.puedeIniciarSinAutorizar(o, d) });
}
export function autorizarOT(d, { otId, aprobar = true, motivo = "" }) {
  const u = actor(d); if (!pv(d).mantAutoriza) return err("Las órdenes de mantenimiento las autoriza Administración central o Dirección.");
  const o = bolsaMant(d).ordenes.find((x) => x.id === otId); if (!o) return err("Orden no encontrada.");
  const regulariza = o.estado === "en_proceso" && o.autorizacionPendiente;
  if (o.estado !== "solicitado" && !regulariza) return err("La orden no está pendiente de autorización.");
  if (!aprobar && txt(motivo).length < 5) return err("Escribe el motivo del rechazo.");
  if (!aprobar && regulariza) return err("Una urgente ya atendida no se rechaza: se regulariza y se documenta.");
  if (regulariza) { o.autorizacionPendiente = false; o.autorizadoPor = u.id; o.autorizadoEn = ahoraLocal(); histOT(o, "en_proceso", "en_proceso", u.id, "Regularizada (urgente atendida antes de autorizar)"); }
  else if (aprobar) { o.estado = "autorizado"; o.autorizadoPor = u.id; o.autorizadoEn = ahoraLocal(); histOT(o, "solicitado", "autorizado", u.id, txt(motivo) || "Autorizada"); }
  else {
    o.estado = "rechazado"; o.motivoRechazo = txt(motivo); histOT(o, "solicitado", "rechazado", u.id, o.motivoRechazo);
    const eq = bolsaMant(d).equipos.find((x) => x.id === o.equipoId);
    if (eq && eq.estado === "falla" && !bolsaMant(d).ordenes.some((x) => x.equipoId === eq.id && V.OT_ABIERTAS.includes(x.estado))) eq.estado = "vigente";
  }
  auditar(d, regulariza ? "ot_regularizada" : aprobar ? "ot_autorizada" : "ot_rechazada", "ot", o.id, o.folio);
  return ok();
}
export function iniciarOT(d, { otId, asignadoA = "" }) {
  const u = actor(d), o = bolsaMant(d).ordenes.find((x) => x.id === otId); if (!o) return err("Orden no encontrada.");
  if (!puedeMantDe(u, o.sucursalId)) return err("Sin permiso sobre esta sucursal.");
  const sinAut = V.puedeIniciarSinAutorizar(o, d);
  if (o.estado !== "autorizado" && !sinAut) return err(o.estado === "solicitado" ? `Requiere autorización de Administración (solo una urgente de hasta $${V.cfgVentas(d).mantUrgenteTope.toLocaleString("es-MX")} se atiende antes).` : "La orden no se puede iniciar.");
  const de = o.estado;
  o.estado = "en_proceso"; o.iniciadoEn = ahoraLocal(); o.asignadoA = txt(asignadoA) || o.proveedor || "Técnico interno"; o.autorizacionPendiente = de === "solicitado";
  histOT(o, de, "en_proceso", u.id, o.autorizacionPendiente ? "Urgente atendida antes de autorizar (P-112): falta regularizar" : "Inicia atención");
  const eq = bolsaMant(d).equipos.find((x) => x.id === o.equipoId); if (eq && eq.estado !== "baja" && o.tipo !== "preventivo") eq.estado = "en_proceso";
  auditar(d, "ot_iniciada", "ot", o.id, `${o.folio}${o.autorizacionPendiente ? " · sin autorización previa (urgente ≤ tope)" : ""}`);
  return ok();
}
export function notaOT(d, { otId, nota, evidencia = null }) {
  const u = actor(d), o = bolsaMant(d).ordenes.find((x) => x.id === otId); if (!o) return err("Orden no encontrada.");
  if (!puedeMantDe(u, o.sucursalId)) return err("Sin permiso sobre esta sucursal.");
  if (txt(nota).length < 3 && !evidencia) return err("Escribe la nota de bitácora.");
  if (evidencia && String(evidencia).length > 120000) return err("La imagen es muy grande.");
  if (evidencia) { if (o.evidencias.length >= 4) return err("Máximo 4 evidencias por orden."); o.evidencias.push({ fecha: ahoraLocal(), por: u.id, img: evidencia }); }
  histOT(o, o.estado, o.estado, u.id, txt(nota) || "Evidencia agregada");
  auditar(d, "ot_bitacora", "ot", o.id, txt(nota).slice(0, 80));
  return ok();
}
/** Cierra la orden con costo real. Si es urgente sin regularizar y el costo real rebasa el tope, primero se autoriza. */
export function cerrarOT(d, { otId, costoReal, resultado, registrarComoGasto = false }) {
  const u = actor(d), b = bolsaMant(d), o = b.ordenes.find((x) => x.id === otId); if (!o) return err("Orden no encontrada.");
  if (!puedeMantDe(u, o.sucursalId)) return err("Sin permiso sobre esta sucursal.");
  if (o.estado !== "en_proceso") return err("Solo se cierran órdenes en proceso.");
  const c = redondear(num(costoReal));
  if (!Number.isFinite(c) || c < 0) return err("Costo real no válido.");
  if (txt(resultado).length < 5) return err("Describe el resultado del trabajo.");
  if (o.autorizacionPendiente && c > V.cfgVentas(d).mantUrgenteTope) return err(`El costo real rebasa los $${V.cfgVentas(d).mantUrgenteTope.toLocaleString("es-MX")} sin autorización: Administración debe regularizarla antes de cerrar.`);
  let gasto = null;
  if (registrarComoGasto && c > 0) {
    if (!d.fin) return err("El módulo de gastos no está disponible.");
    const eq0 = b.equipos.find((x) => x.id === o.equipoId);
    const g = registrarGasto(d, { sucursalId: o.sucursalId, fecha: hoy(), categoria: "mantenimiento", concepto: `${o.folio} · ${eq0 ? eq0.nombre : "Equipo"} · ${o.descripcion}`.slice(0, 120), monto: c, acreedor: o.asignadoA || o.proveedor });
    if (!g.ok) return g;
    gasto = g.gasto; gasto.otId = o.id;
  }
  o.estado = "cerrado"; o.costoReal = c; o.resultado = txt(resultado); o.cerradoEn = ahoraLocal(); o.gastoId = gasto ? gasto.id : null;
  histOT(o, "en_proceso", "cerrado", u.id, o.resultado);
  const eq = b.equipos.find((x) => x.id === o.equipoId);
  if (eq) { if (o.tipo === "preventivo" || eq.estado !== "baja") eq.ultimoServicio = o.tipo === "preventivo" ? hoy() : eq.ultimoServicio; if (eq.estado !== "baja" && !b.ordenes.some((x) => x.equipoId === eq.id && V.OT_ABIERTAS.includes(x.estado))) eq.estado = "vigente"; }
  auditar(d, "ot_cerrada", "ot", o.id, `${o.folio} · costo ${c}${gasto ? ` · gasto ${gasto.id}` : ""}`);
  return ok({ gasto });
}
export function fijarPresupuestoMant(d, { sucursalId, mes, monto }) {
  const u = actor(d); if (!esCentral(u)) return err("El presupuesto de mantenimiento lo fija Administración central o Dirección.");
  if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) return err("Mes no válido.");
  const m = redondear(num(monto)); if (!Number.isFinite(m) || m < 0) return err("Monto no válido.");
  const b = bolsaMant(d);
  let p = b.presupuestos.find((x) => x.sucursalId === sucursalId && x.mes === mes);
  if (!p) { p = { id: uid("MP"), sucursalId, mes, monto: 0 }; b.presupuestos.push(p); }
  const antes = p.monto; p.monto = m; p.fijadoPor = u.id;
  auditar(d, "presupuesto_mant", "presupuesto", p.id, `${sucursalId} ${mes}: ${antes} → ${m}`);
  return ok();
}
/** Levanta de una vez las órdenes preventivas de los equipos con servicio vencido o próximo. */
export function programarPreventivos(d, { sucursalId }) {
  const u = actor(d); if (!puedeMantDe(u, sucursalId)) return err("Sin permiso sobre esta sucursal.");
  const pend = V.preventivosPendientes(d, { sucursalId });
  if (!pend.length) return err("No hay preventivos pendientes.");
  const creadas = [];
  for (const e of pend) {
    const r = crearOT(d, { equipoId: e.id, tipo: "preventivo", descripcion: `Servicio preventivo programado (cada ${e.periodicidadDias} días)`, costoEstimado: Math.round((e.valor || 10000) * 0.03 / 10) * 10, programada: V.proximoServicio(e) < hoy() ? hoy() : V.proximoServicio(e) });
    if (r.ok) creadas.push(r.orden.folio);
  }
  return ok({ creadas });
}

// ═════════════════════════ Comisiones por servicio y por podólogo
const bolsaComi = (d) => (d.comi ||= { esquemas: [], periodos: [], detalle: [] });
export function guardarEsquemaComision(d, datos) {
  const u = actor(d); if (!pv(d).comisiones) return err("Los esquemas de comisión los define Administración central o Dirección.");
  const b = bolsaComi(d);
  if (txt(datos.nombre).length < 3) return err("Escribe el nombre del esquema.");
  if (datos.podologoId && !d.usuarios.some((x) => x.id === datos.podologoId && x.rol === "podologo")) return err("Podólogo no válido.");
  const pct = (x) => { const n = num(x); return Number.isFinite(n) && n >= 0 && n <= 100; };
  if (!["pctServicio", "pctProducto", "pctPlan"].every((k) => pct(datos[k]))) return err("Los porcentajes van de 0 a 100.");
  const porServicio = {};
  for (const [k, v] of Object.entries(datos.porServicio || {})) { if (v === "" || v == null) continue; if (!pct(v)) return err("Porcentaje por servicio de 0 a 100."); if (!d.servicios.some((s) => s.id === k)) return err("Servicio no válido."); porServicio[k] = num(v); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datos.vigenteDesde))) return err("Fecha de inicio de vigencia.");
  if (datos.vigenteHasta && datos.vigenteHasta < datos.vigenteDesde) return err("La vigencia termina antes de empezar.");
  // Un esquema nuevo cierra la vigencia del anterior del mismo podólogo (los periodos cerrados conservan su esquema congelado).
  let e = datos.id ? b.esquemas.find((x) => x.id === datos.id) : null;
  if (!e) {
    b.esquemas.filter((x) => (x.podologoId || null) === (datos.podologoId || null) && x.activo !== false && !x.vigenteHasta && x.vigenteDesde < datos.vigenteDesde).forEach((x) => { x.vigenteHasta = sumarDias(datos.vigenteDesde, -1); });
    e = { id: uid("EC"), creadoPor: u.id, activo: true }; b.esquemas.push(e);
  }
  Object.assign(e, { podologoId: datos.podologoId || null, nombre: txt(datos.nombre), tipo: num(datos.viaticoPorCita) > 0 ? "porcentaje_viatico" : "porcentaje", pctServicio: num(datos.pctServicio), pctProducto: num(datos.pctProducto), pctPlan: num(datos.pctPlan),
    porServicio, viaticoPorCita: num(datos.viaticoPorCita) || 0, pisoPeriodo: num(datos.pisoPeriodo) || 0, vigenteDesde: datos.vigenteDesde, vigenteHasta: datos.vigenteHasta || null, nota: txt(datos.nota) });
  auditar(d, "esquema_comision", "esquema", e.id, `${e.nombre} · ${e.pctServicio}/${e.pctProducto}/${e.pctPlan}`);
  return ok({ esquema: e });
}
export function crearPeriodoComision(d, { desde, hasta }) {
  const u = actor(d); if (!pv(d).comisiones) return err("Solo Administración central o Dirección.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(hasta)) || hasta < desde) return err("Rango de fechas no válido.");
  if (V.periodosTraslapados(d, desde, hasta).length) return err("El rango se traslapa con otro periodo.");
  const p = { id: uid("PCM"), folio: folio(d, "PCM"), desde, hasta, estado: "por_cerrar", creadoPor: u.id, creado: hoy(), cerradoPor: null, cerradoEn: null, totales: null, nota: "" };
  bolsaComi(d).periodos.unshift(p);
  auditar(d, "periodo_comision", "periodo", p.id, `${desde} a ${hasta}`);
  return ok({ periodo: p });
}
/** Carga al periodo los renglones comisionables aún no cargados y los ajustes negativos por cancelaciones. */
export function cargarDetalleComision(d, periodoId) {
  const u = actor(d); if (!pv(d).comisiones) return err("Solo Administración central o Dirección.");
  const b = bolsaComi(d), p = b.periodos.find((x) => x.id === periodoId);
  if (!p) return err("Periodo no encontrado.");
  if (p.estado === "cerrado") return err("El periodo está cerrado: sus comisiones no se recalculan.");
  const lineas = V.lineasComisionables(d, { desde: p.desde, hasta: p.hasta > hoy() ? hoy() : p.hasta });
  const ajustes = V.ajustesPorCancelacion(d);
  [...lineas, ...ajustes].forEach((l) => b.detalle.push({ id: uid("CD"), periodoId: p.id, ...l, cargadoPor: u.id, cargadoEn: hoy() }));
  auditar(d, "comision_detalle", "periodo", p.id, `${lineas.length} renglones · ${ajustes.length} ajustes`);
  return ok({ renglones: lineas.length, ajustes: ajustes.length });
}
export function cerrarPeriodoComision(d, periodoId) {
  const u = actor(d); if (!pv(d).comisiones) return err("Solo Administración central o Dirección.");
  const b = bolsaComi(d), p = b.periodos.find((x) => x.id === periodoId);
  if (!p) return err("Periodo no encontrado.");
  if (p.estado === "cerrado") return err("El periodo ya está cerrado.");
  if (!b.detalle.some((x) => x.periodoId === p.id)) return err("Carga el detalle antes de cerrar.");
  if (p.hasta >= hoy()) return err("El periodo aún no termina.");
  p.totales = V.resumenComisiones(d, p.id);
  p.estado = "cerrado"; p.cerradoPor = u.id; p.cerradoEn = ahoraLocal();
  auditar(d, "periodo_comision_cerrado", "periodo", p.id, `${p.folio} · total ${p.totales.total}`);
  return ok({ totales: p.totales });
}
/** Lo que ve el gerente: solo los podólogos que atendieron en su sucursal (lectura). */
export function comisionesVisibles(d, u, periodoId) {
  const r = V.resumenComisiones(d, periodoId);
  if (esCentral(u)) return r;
  if (!u || u.rol !== "gerente") return { filas: [], base: 0, comision: 0, total: 0 };
  const det = bolsaComi(d).detalle.filter((x) => x.periodoId === periodoId && u.sucursales.includes(x.sucursalId));
  const ids = new Set(det.map((x) => x.podologoId));
  const filas = r.filas.filter((f) => ids.has(f.podologoId));
  return { filas, base: redondear(filas.reduce((a, f) => a + f.base, 0)), comision: redondear(filas.reduce((a, f) => a + f.comision, 0)), total: redondear(filas.reduce((a, f) => a + f.total, 0)), parcial: true };
}
/** Comisión que le tocaría a un renglón de ticket (para la simulación de la pantalla). */
export function simularComision(d, { podologoId, tipo, itemId, importe, fecha = hoy() }) {
  const esq = V.esquemaVigente(d, podologoId, fecha), ivaT = V.ivaTipoDe(d, tipo, itemId), base = V.desglosarIva(importe, ivaT).base, pct = V.pctComision(esq, { tipo, itemId });
  return { esquema: esq, base, pct, comision: V.comisionDe(base, pct) };
}

// ═════════════════════════ Caja: descuento con PIN y tolerancia de corte (para conectar en cobrar.jsx / caja.jsx)
/** Usuario autorizador dueño del PIN: gerente de esa sucursal, Administración o Dirección. DEMO: en producción, en el servidor. */
export function validarPin(d, pin, sucursalId) {
  const pines = (d.ventasCfg && d.ventasCfg.pines) || {};
  const id = Object.keys(pines).find((k) => pines[k] === String(pin || "").trim());
  const a = id ? d.usuarios.find((x) => x.id === id && x.activo !== false) : null;
  if (!a) return null;
  if (a.rol === "gerente" && !a.sucursales.includes(sucursalId)) return null;
  return ["gerente", "admin", "direccion"].includes(a.rol) ? a : null;
}
/**
 * P-055: descuento manual hasta 10 % sin PIN (recepción o caja); más de 10 %, PIN de gerente. Siempre con motivo.
 * → { ok, requierePin, autorizadoPor|null }. Deja bitácora; no toca la venta (la pantalla de cobro aplica el % ya validado).
 */
export function autorizarDescuento(d, { pct, motivo, pin = "", ventaRef = null }) {
  const u = actor(d);
  if (!u || !["cajero", "recepcion", "gerente", "admin", "direccion"].includes(u.rol)) return err("Los descuentos los aplican caja, recepción o gerencia.");
  const e = V.evaluarDescuento(pct, d); if (!e.ok) return err(e.error);
  if (Number(pct) > 0 && txt(motivo).length < 3) return err("Todo descuento lleva motivo.");
  let autorizadoPor = null;
  if (e.requierePin && !["gerente", "admin", "direccion"].includes(u.rol)) {
    const a = validarPin(d, pin, sesSuc(d));
    if (!a) { auditar(d, "pin_descuento_invalido", "venta", ventaRef || "-", `${pct} %`); return err(`Más de ${e.libre} % requiere el PIN del gerente de la sucursal.`); }
    autorizadoPor = a.id;
  } else if (e.requierePin) autorizadoPor = u.id;
  if (Number(pct) > 0) auditar(d, e.requierePin ? "descuento_autorizado_pin" : "descuento_libre", "venta", ventaRef || "-", `${pct} % · ${txt(motivo)}${autorizadoPor ? ` · autoriza ${autorizadoPor}` : ""}`);
  return ok({ requierePin: e.requierePin, autorizadoPor });
}
/**
 * P-058: tolerancia de corte de $50. Dentro de la tolerancia basta la justificación; fuera, PIN de gerente (salvo que cierre
 * gerencia). Si se autoriza, deja turno.corte.autorizacionDiferencia (campo opcional) y bitácora.
 */
export function autorizarDiferenciaCorte(d, { turnoId, justificacion = "", pin = "" }) {
  const u = actor(d); if (!u) return err("Inicia sesión.");
  const t = d.turnos.find((x) => x.id === turnoId);
  if (!t || !t.corte) return err("El turno no tiene corte capturado.");
  if (u.rol === "cajero" && t.cajeroId !== u.id) return err("Solo el cajero del turno o gerencia.");
  const { mayor } = V.diferenciaDeCorte(t, d);
  const esAut = ["gerente", "admin", "direccion"].includes(u.rol) && (esCentral(u) || u.sucursales.includes(t.sucursalId));
  const a = !esAut && V.fueraDeTolerancia(mayor, V.cfgVentas(d).toleranciaCorte) ? validarPin(d, pin, t.sucursalId) : null;
  const ev = V.evaluarCierreCaja({ contado: mayor, esperado: 0, tolerancia: V.cfgVentas(d).toleranciaCorte, justificacion, esAutorizador: esAut, autorizado: !!a });
  if (!ev.ok) return { ok: false, error: ev.requiere.includes("justificacion") ? "Escribe la justificación de la diferencia." : `La diferencia (${mayor}) rebasa la tolerancia de $${V.cfgVentas(d).toleranciaCorte}: requiere PIN del gerente.`, requiere: ev.requiere };
  if (ev.fueraDeTolerancia) t.corte.autorizacionDiferencia = { por: a ? a.id : u.id, fecha: ahoraLocal(), monto: mayor, justificacion: txt(justificacion) };
  if (txt(justificacion)) t.corte.justificacion = t.corte.justificacion || txt(justificacion);
  auditar(d, ev.fueraDeTolerancia ? "corte_diferencia_autorizada" : "corte_diferencia_tolerada", "turno", t.id, `${mayor} · ${txt(justificacion)}`);
  return ok({ fueraDeTolerancia: ev.fueraDeTolerancia, dif: mayor });
}
