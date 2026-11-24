// Lógica de almacén (recepción de OC y traspasos, kardex, inventario físico, ajustes, laboratorio).
// Todas las funciones reciben el borrador `d` (se llaman dentro de mutar(d => …)) y devuelven { ok, error?, … }.
// Validan ANTES de modificar: si devuelven { ok:false } no dejaron ningún cambio a medias.
import { auditar, folio, registrarOp, uid } from "./core.js";
import * as R from "./reglas.js";
import { hoy, dia, redondear, normaliza, sumarDias } from "../lib/format.js";

const err = (error) => ({ ok: false, error });
const ent = (n) => Number.isInteger(n) && n >= 0;

/** ¿Este usuario opera ese almacén? (rol almacén; el central solo con almacenCentral). */
export function puedeOperar(u, almacenId) {
  if (!u || u.rol !== "almacen") return false;
  if (almacenId === "CEN") return !!u.almacenCentral;
  return u.sucursales.includes(almacenId);
}
export const inventarioCongelado = (d, almacenId) =>
  d.inventarios.some((i) => i.sucursalId === almacenId && i.congelado && i.estado !== "cerrado");
const nomP = (d, id) => R.nombreProducto(d, id);

/** Sucursal cuyos parámetros (umbrales) aplican a un almacén; el central usa la primera y exige nivel admin. */
const sucDeAlmacen = (d, almacenId) => (almacenId === "CEN" ? d.sucursales[0].id : almacenId);

// ───────────────────────── Kardex derivado (sin log propio)
/** Movimientos del producto en el almacén, más recientes primero: { fecha, tipo:"entrada"|"salida", concepto, cant, costo? }. */
export function kardex(d, almacenId, productoId) {
  const m = [];
  d.oc.filter((o) => o.almacenId === almacenId).forEach((o) => {
    const p = o.partidas.find((x) => x.productoId === productoId);
    if (!p || !(p.recibido > 0)) return;
    const recs = (o.recepciones || []).flatMap((r) => r.lineas.filter((l) => l.productoId === productoId && l.recibido > 0).map((l) => ({ fecha: r.fecha, cant: l.recibido, costo: l.costo })));
    if (recs.length) recs.forEach((r) => m.push({ fecha: r.fecha, tipo: "entrada", concepto: `Recepción OC ${o.folio}`, cant: r.cant, costo: r.costo }));
    else m.push({ fecha: o.fecha, tipo: "entrada", concepto: `Recepción OC ${o.folio}`, cant: p.recibido, costo: p.costo });
  });
  d.traspasos.forEach((t) => {
    const p = t.partidas.find((x) => x.productoId === productoId);
    if (!p) return;
    if (t.destinoId === almacenId && p.recibido > 0) m.push({ fecha: t.recibidoEn || t.fecha, tipo: "entrada", concepto: `Traspaso ${t.folio} desde ${R.nombreAlmacen(d, t.origenId)}`, cant: p.recibido, costo: p.costo });
    if (t.origenId === almacenId && p.enviado > 0 && ["en_transito", "recibido", "recibido_con_diferencia"].includes(t.estado))
      m.push({ fecha: t.enviadoEn || t.fecha, tipo: "salida", concepto: `Traspaso ${t.folio} hacia ${R.nombreAlmacen(d, t.destinoId)}`, cant: p.enviado, costo: p.costo });
  });
  d.ventas.filter((v) => v.sucursalId === almacenId && v.estado !== "cancelada").forEach((v) =>
    v.partidas.filter((p) => p.tipo === "producto" && p.itemId === productoId).forEach((p) => m.push({ fecha: v.fecha, tipo: "salida", concepto: `Venta ${v.folio}`, cant: p.cant, costo: p.costo })));
  d.consultas.filter((c) => c.sucursalId === almacenId).forEach((c) =>
    (c.consumo || []).filter((x) => x.productoId === productoId).forEach((x) => m.push({ fecha: c.fecha, tipo: "salida", concepto: "Consumo en consulta", cant: x.cant })));
  (d.devolucionesProveedor || []).filter((x) => x.almacenId === almacenId && x.productoId === productoId).forEach((x) =>
    m.push({ fecha: x.fecha, tipo: "salida", concepto: `Devolución a proveedor ${x.folio}`, cant: x.cant }));
  d.ajustesInventario.filter((a) => a.almacenId === almacenId && a.productoId === productoId).forEach((a) =>
    m.push({ fecha: a.fecha, tipo: a.cant < 0 ? "salida" : "entrada", concepto: `Ajuste de inventario · ${a.motivo || ""}`, cant: Math.abs(a.cant) }));
  return m.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// ───────────────────────── Órdenes de compra
export const pendienteOC = (o) => o.partidas.reduce((a, p) => a + Math.max(0, p.cant - (p.recibido || 0)), 0);
export const ocPorRecibir = (d) => d.oc.filter((o) => ["enviada", "recibida_parcial"].includes(o.estado));

/**
 * Recibe mercancía de una OC en el almacén central.
 * lineas: [{ productoId, recibir, lote, caducidad, costo }]; factura: { folio, vence } (opcional; con folio se crea la CxP).
 */
export function recibirOC(d, ocId, lineas, factura, u) {
  const o = d.oc.find((x) => x.id === ocId);
  if (!o) return err("La orden de compra no existe.");
  if (!puedeOperar(u, o.almacenId)) return err("Solo el almacén central recibe órdenes de compra.");
  if (!["enviada", "recibida_parcial"].includes(o.estado)) return err("Esta orden ya no está pendiente de recibir.");
  if (inventarioCongelado(d, o.almacenId)) return err("El almacén está congelado por un inventario general en curso.");
  const act = lineas.filter((l) => Number(l.recibir) > 0);
  if (!act.length) return err("Captura al menos una cantidad recibida.");
  for (const l of lineas) {
    if (!o.partidas.some((p) => p.productoId === l.productoId)) return err("Producto ajeno a la orden.");
    if (!ent(Number(l.recibir))) return err(`Cantidad inválida en ${nomP(d, l.productoId)}.`);
    if (Number(l.recibir) > 0 && !(Number(l.costo) >= 0)) return err(`Costo inválido en ${nomP(d, l.productoId)}.`);
  }
  const fol = factura && String(factura.folio || "").trim();
  if (fol && !factura.vence) return err("Captura la fecha de vencimiento de pago de la factura.");

  const reg = { id: uid("RC"), fecha: hoy(), por: u.id, factura: fol || null, lineas: [] };
  const difs = [];
  for (const p of o.partidas) {
    const l = lineas.find((x) => x.productoId === p.productoId);
    const rec = l ? Number(l.recibir) : 0;
    const pend = Math.max(0, p.cant - (p.recibido || 0));
    if (l) reg.lineas.push({ productoId: p.productoId, esperado: pend, recibido: rec, diferencia: rec - pend, lote: l.lote || `OC-${o.folio}`, caducidad: l.caducidad || null, costo: redondear(l.costo) });
    if (rec > 0) {
      R.entradaCapa(d, o.almacenId, p.productoId, rec, Number(l.costo), l.lote || `OC-${o.folio}`);
      if (l.caducidad) d.capas[d.capas.length - 1].caducidad = l.caducidad;
      p.recibido = (p.recibido || 0) + rec;
    }
    if (l && rec !== pend) difs.push({ productoId: p.productoId, diferencia: rec - pend });
  }
  // Las partidas no capturadas en esta recepción siguen pendientes.
  o.recepciones = [...(o.recepciones || []), reg];
  o.estado = o.partidas.every((p) => (p.recibido || 0) >= p.cant) ? "recibida" : "recibida_parcial";
  let cxp = null;
  if (fol) {
    const monto = redondear(reg.lineas.reduce((a, l) => a + l.recibido * l.costo, 0));
    o.factura = fol;
    const previa = d.cxp.find((c) => c.ocId === o.id && c.doc === fol);
    if (previa) { previa.saldo = redondear(previa.saldo + monto); cxp = previa; }
    else { cxp = { id: uid("CX"), proveedorId: o.proveedorId, doc: fol, ocId: o.id, vence: factura.vence, saldo: monto }; d.cxp.push(cxp); }
  }
  auditar(d, "oc_recibida", "oc", o.id, `${o.folio} · ${act.length} partidas${difs.length ? ` · ${difs.length} con diferencia` : ""}${fol ? ` · CFDI ${fol}` : ""}`);
  return { ok: true, estado: o.estado, diferencias: difs, cxp };
}

/** Devolución a proveedor: sale del central por PEPS y genera nota de crédito (reduce la CxP de la OC). */
export function devolverProveedor(d, { ocId, productoId, cant, motivo }, u) {
  const o = d.oc.find((x) => x.id === ocId);
  if (!o) return err("La orden de compra no existe.");
  if (!puedeOperar(u, o.almacenId)) return err("Solo el almacén central devuelve a proveedor.");
  const p = o.partidas.find((x) => x.productoId === productoId);
  cant = Number(cant);
  if (!p) return err("El producto no pertenece a la orden.");
  if (!String(motivo || "").trim()) return err("El motivo es obligatorio.");
  if (!ent(cant) || cant <= 0) return err("Cantidad inválida.");
  if (cant > (p.recibido || 0) - (p.devuelto || 0)) return err("No puedes devolver más de lo recibido en esta orden.");
  const sal = R.salidaPEPS(d, o.almacenId, productoId, cant);
  if (!sal.ok) return err(`Solo hay ${R.stock(d, o.almacenId, productoId)} en existencia; faltan ${sal.faltan}.`);
  p.devuelto = (p.devuelto || 0) + cant;
  d.devolucionesProveedor ||= [];
  const nc = { id: uid("DP"), folio: folio(d, "NC"), proveedorId: o.proveedorId, ocId: o.id, almacenId: o.almacenId, productoId, cant, monto: sal.costo, motivo: motivo.trim(), fecha: hoy(), por: u.id };
  d.devolucionesProveedor.unshift(nc);
  d.cxp.filter((c) => c.ocId === o.id).forEach((c, i) => { if (i === 0) c.saldo = Math.max(0, redondear(c.saldo - sal.costo)); });
  auditar(d, "devolucion_proveedor", "oc", o.id, `${nc.folio} · ${nomP(d, productoId)} ×${cant} · ${motivo.trim()}`);
  return { ok: true, nota: nc };
}

// ───────────────────────── Traspasos
export const ESTADOS_TRASPASO = { solicitado: "Solicitado", autorizado: "Autorizado", en_transito: "En tránsito", recibido: "Recibido", recibido_con_diferencia: "Recibido con diferencia" };

export function crearTraspaso(d, { origenId, destinoId, partidas }, u) {
  if (!puedeOperar(u, destinoId)) return err("Solo puedes solicitar traspasos hacia tu almacén.");
  if (destinoId === "CEN") return err("El almacén central se surte por compra, no por traspaso.");
  if (origenId === destinoId || !d.almacenes.some((a) => a.id === origenId)) return err("Elige un almacén de origen distinto al tuyo.");
  const mapa = new Map();
  for (const p of partidas) {
    const c = Number(p.solicitado);
    if (!ent(c) || c <= 0) return err("Cada partida necesita una cantidad entera mayor a cero.");
    mapa.set(p.productoId, (mapa.get(p.productoId) || 0) + c);
  }
  if (!mapa.size) return err("Agrega al menos un producto.");
  d.contadores.TR = Math.max(d.contadores.TR || 0, 457) + 1;
  const t = {
    id: uid("TR"), folio: `TR-${d.contadores.TR}`, origenId, destinoId, solicitadoPor: u.id, fecha: hoy(), estado: "solicitado",
    partidas: [...mapa].map(([productoId, solicitado]) => ({ productoId, solicitado, enviado: 0, recibido: 0 })),
  };
  d.traspasos.unshift(t);
  auditar(d, "traspaso_solicitado", "traspaso", t.id, `${t.folio} · ${R.nombreAlmacen(d, origenId)} → ${R.nombreAlmacen(d, destinoId)} · ${t.partidas.length} partidas`);
  return { ok: true, traspaso: t };
}

export function autorizarTraspaso(d, id, u, almacenId) {
  const t = d.traspasos.find((x) => x.id === id);
  if (!t) return err("El traspaso no existe.");
  if (t.origenId !== almacenId || !puedeOperar(u, t.origenId)) return err("Solo el almacén de origen autoriza el traspaso.");
  if (t.estado !== "solicitado") return err("El traspaso ya no está en estado solicitado.");
  t.estado = "autorizado"; t.autorizadoPor = u.id;
  auditar(d, "traspaso_autorizado", "traspaso", t.id, t.folio);
  return { ok: true };
}

/** Autoriza (si falta) y envía. cantidades: { productoId: cantidad a enviar } (por defecto lo solicitado). Sale por PEPS y guarda el costo medio. */
export function enviarTraspaso(d, id, cantidades, u, almacenId) {
  const t = d.traspasos.find((x) => x.id === id);
  if (!t) return err("El traspaso no existe.");
  if (t.origenId !== almacenId || !puedeOperar(u, t.origenId)) return err("Solo el almacén de origen envía el traspaso.");
  if (!["solicitado", "autorizado"].includes(t.estado)) return err("El traspaso ya fue enviado.");
  if (inventarioCongelado(d, t.origenId)) return err("El almacén está congelado por un inventario general en curso.");
  const env = t.partidas.map((p) => ({ p, c: Number((cantidades || {})[p.productoId] ?? p.solicitado) }));
  for (const { p, c } of env) {
    if (!ent(c)) return err(`Cantidad inválida en ${nomP(d, p.productoId)}.`);
    if (c > R.stock(d, t.origenId, p.productoId)) return err(`Sin existencia suficiente de ${nomP(d, p.productoId)} (hay ${R.stock(d, t.origenId, p.productoId)}).`);
  }
  if (!env.some((x) => x.c > 0)) return err("No hay nada que enviar.");
  env.forEach(({ p, c }) => {
    if (c > 0) { const s = R.salidaPEPS(d, t.origenId, p.productoId, c); p.costo = redondear(s.costo / c); }
    p.enviado = c; p.recibido = 0;
  });
  if (t.estado === "solicitado") t.autorizadoPor = u.id;
  t.estado = "en_transito"; t.enviadoPor = u.id; t.enviadoEn = hoy();
  auditar(d, "traspaso_enviado", "traspaso", t.id, `${t.folio} · ${env.filter((x) => x.c > 0).length} partidas`);
  return { ok: true };
}

/** Recibe un traspaso en tránsito. recibidos: { productoId: cantidad } (por defecto lo enviado). Entra con el costo con que salió. */
export function recibirTraspaso(d, id, recibidos, u, almacenId, nota = "") {
  const t = d.traspasos.find((x) => x.id === id);
  if (!t) return err("El traspaso no existe.");
  if (t.destinoId !== almacenId || !puedeOperar(u, t.destinoId)) return err("Solo el almacén de destino recibe el traspaso.");
  if (t.estado !== "en_transito") return err("El traspaso no está en tránsito.");
  if (inventarioCongelado(d, t.destinoId)) return err("El almacén está congelado por un inventario general en curso.");
  const rec = t.partidas.map((p) => ({ p, c: Number((recibidos || {})[p.productoId] ?? p.enviado) }));
  for (const { p, c } of rec) {
    if (!ent(c)) return err(`Cantidad inválida en ${nomP(d, p.productoId)}.`);
    if (c > p.enviado) return err(`No puedes recibir más de lo enviado de ${nomP(d, p.productoId)} (${p.enviado}).`);
  }
  const difs = [];
  rec.forEach(({ p, c }) => {
    const prod = d.productos.find((x) => x.id === p.productoId);
    R.entradaCapa(d, t.destinoId, p.productoId, c, p.costo ?? (prod ? prod.costo : 0), `TR-${t.folio}`);
    p.recibido = c;
    if (c !== p.enviado) difs.push({ productoId: p.productoId, enviado: p.enviado, recibido: c });
  });
  t.estado = difs.length ? "recibido_con_diferencia" : "recibido";
  t.recibidoPor = u.id; t.recibidoEn = hoy(); t.diferencias = difs; if (nota) t.notaRecepcion = nota;
  auditar(d, "traspaso_recibido", "traspaso", t.id, `${t.folio}${difs.length ? ` · ${difs.length} con diferencia` : " · conforme"}`);
  return { ok: true, estado: t.estado, diferencias: difs };
}

// ───────────────────────── Inventario físico
export const categoriasDe = (d) => [...new Set(d.productos.map((p) => p.categoria))];
const partidasInv = (d, almacenId, categorias) =>
  d.productos.filter((p) => !categorias || categorias.includes(p.categoria)).map((p) => ({ productoId: p.id, sistema: R.stock(d, almacenId, p.id), c1: null, c2: null, requiere2: false }));

export function iniciarInventario(d, { almacenId, tipo, categoria }, u) {
  if (!puedeOperar(u, almacenId)) return err("No operas este almacén.");
  if (d.inventarios.some((i) => i.sucursalId === almacenId && i.estado !== "cerrado")) return err("Ya hay un inventario abierto en este almacén; ciérralo primero.");
  if (!["ciclico", "general"].includes(tipo)) return err("Tipo de inventario inválido.");
  if (tipo === "ciclico" && !categoria) return err("Elige la categoría del conteo cíclico.");
  const cats = tipo === "ciclico" ? [categoria] : null;
  const inv = {
    id: uid("IV"), folio: folio(d, "CIC"), sucursalId: almacenId, tipo, alcance: tipo === "ciclico" ? categoria : "General", categorias: cats,
    congelado: tipo === "general", estado: "abierto", responsableId: u.id, fecha: hoy(), conteo: 1, partidas: partidasInv(d, almacenId, cats),
  };
  d.inventarios.unshift(inv);
  auditar(d, "inventario_iniciado", "inventario", inv.id, `${inv.folio} · ${tipo} · ${inv.alcance}${inv.congelado ? " · movimientos congelados" : ""}`);
  return { ok: true, inventario: inv };
}
/** Inventarios que vienen sin partidas (semilla): las arma según el alcance. */
export function asegurarPartidas(d, invId) {
  const inv = d.inventarios.find((x) => x.id === invId);
  if (!inv || inv.partidas.length) return;
  if (!inv.categorias) {
    const cats = categoriasDe(d).filter((c) => normaliza(inv.alcance || "").includes(normaliza(c)));
    inv.categorias = inv.tipo === "general" || !cats.length ? null : cats;
  }
  inv.partidas = partidasInv(d, inv.sucursalId, inv.categorias);
}
export const contadoFinal = (p) => (p.c2 != null ? p.c2 : p.c1);
export const progresoInv = (inv) => {
  const ps = inv.conteo === 2 ? inv.partidas.filter((p) => p.requiere2) : inv.partidas;
  const campo = inv.conteo === 2 ? "c2" : "c1";
  return { total: ps.length, hechos: ps.filter((p) => p[campo] != null).length };
};

/** Captura a ciegas. sumar:true agrega a lo ya contado (cada lectura del escáner suma 1). Funciona sin señal: encola con registrarOp. */
export function capturarConteo(d, invId, productoId, cant, u, { sumar = false } = {}) {
  const inv = d.inventarios.find((x) => x.id === invId);
  if (!inv) return err("El inventario no existe.");
  if (!puedeOperar(u, inv.sucursalId)) return err("No operas este almacén.");
  if (!["abierto", "segundo_conteo"].includes(inv.estado)) return err("El conteo ya está cerrado.");
  const p = inv.partidas.find((x) => x.productoId === productoId);
  if (!p) return err("El producto no es parte de este inventario.");
  const campo = inv.conteo === 2 ? "c2" : "c1";
  if (inv.conteo === 2 && !p.requiere2) return err("Este producto no requiere segundo conteo.");
  cant = Number(cant);
  if (!ent(cant)) return err("La cantidad debe ser un entero de cero o más.");
  p[campo] = sumar ? (p[campo] || 0) + cant : cant;
  registrarOp(d, "conteo", `${inv.folio} · ${nomP(d, productoId)}: ${p[campo]}`);
  return { ok: true, contado: p[campo] };
}
/** Marca en cero lo que no se contó (el almacenista confirma que no hay nada). */
export function completarEnCero(d, invId, u) {
  const inv = d.inventarios.find((x) => x.id === invId);
  if (!inv || !puedeOperar(u, inv.sucursalId)) return err("No operas este almacén.");
  const campo = inv.conteo === 2 ? "c2" : "c1";
  let n = 0;
  inv.partidas.forEach((p) => { if ((inv.conteo === 1 || p.requiere2) && p[campo] == null) { p[campo] = 0; n++; } });
  if (n) registrarOp(d, "conteo", `${inv.folio} · ${n} productos marcados en 0`);
  return { ok: true, n };
}
export function terminarConteo(d, invId, u) {
  const inv = d.inventarios.find((x) => x.id === invId);
  if (!inv) return err("El inventario no existe.");
  if (!puedeOperar(u, inv.sucursalId)) return err("No operas este almacén.");
  const { total, hechos } = progresoInv(inv);
  if (hechos < total) return err(`Faltan ${total - hechos} productos por capturar.`);
  if (inv.estado === "abierto") {
    const difs = inv.partidas.filter((p) => p.c1 !== p.sistema);
    difs.forEach((p) => { p.requiere2 = true; });
    if (difs.length) { inv.estado = "segundo_conteo"; inv.conteo = 2; }
    else inv.estado = "comparativo";
    auditar(d, "inventario_primer_conteo", "inventario", inv.id, `${inv.folio} · ${difs.length} con diferencia`);
    return { ok: true, estado: inv.estado, diferencias: difs.length };
  }
  if (inv.estado === "segundo_conteo") { inv.estado = "comparativo"; auditar(d, "inventario_segundo_conteo", "inventario", inv.id, inv.folio); return { ok: true, estado: inv.estado, diferencias: 0 }; }
  return err("El conteo no está en captura.");
}

/** Valor (con signo) de una diferencia a costo PEPS: faltante = costo de las capas más antiguas; sobrante = costo de la última capa o catálogo. */
export function valorDiferencia(d, almacenId, productoId, dif) {
  if (!dif) return 0;
  const capas = d.capas.filter((c) => c.almacenId === almacenId && c.productoId === productoId && c.cant > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const prod = d.productos.find((p) => p.id === productoId);
  if (dif > 0) return redondear(dif * (capas.length ? capas[capas.length - 1].costo : prod ? prod.costo : 0));
  let resta = -dif, v = 0;
  for (const c of capas) { const t = Math.min(c.cant, resta); v += t * c.costo; resta -= t; if (!resta) break; }
  if (resta) v += resta * (prod ? prod.costo : 0);
  return redondear(-v);
}
/** Comparativo del inventario: una fila por producto con sistema, contado, diferencia y valor. */
export function comparativo(d, inv) {
  return inv.partidas.filter((p) => contadoFinal(p) != null).map((p) => {
    const contado = contadoFinal(p), dif = contado - p.sistema;
    return { productoId: p.productoId, sistema: p.sistema, contado, dif, valor: valorDiferencia(d, inv.sucursalId, p.productoId, dif), partida: p };
  });
}
export const MOTIVOS_INV = ["merma", "robo", "daño", "caducidad", "error de captura", "sobrante"];

function pedirAjuste(d, { almacenId, productoId, cant, detalle, valor }, u) {
  const monto = Math.abs(redondear(valor));
  const central = almacenId === "CEN";
  const nivel = central ? "admin" : R.nivelAjuste(d, almacenId, monto);
  return R.pedirAutorizacion(d, { tipo: "ajuste_inventario", sucursalId: sucDeAlmacen(d, almacenId), solicitanteId: u.id, detalle, monto, nivel, ref: { almacenId, productoId, cant } });
}
export function proponerAjusteInv(d, invId, productoId, motivo, u) {
  const inv = d.inventarios.find((x) => x.id === invId);
  if (!inv) return err("El inventario no existe.");
  if (!puedeOperar(u, inv.sucursalId)) return err("No operas este almacén.");
  if (inv.estado !== "comparativo") return err("El inventario aún no está en comparativo.");
  if (!MOTIVOS_INV.includes(motivo)) return err("Elige el motivo del ajuste.");
  const f = comparativo(d, inv).find((x) => x.productoId === productoId);
  if (!f || !f.dif) return err("Este producto no tiene diferencia.");
  if (f.partida.ajusteAutId) return err("Ya se propuso el ajuste de este producto.");
  const a = pedirAjuste(d, { almacenId: inv.sucursalId, productoId, cant: f.dif, valor: f.valor, detalle: `Inventario ${inv.folio} · ${motivo} · ${nomP(d, productoId)} ${f.dif > 0 ? "+" : ""}${f.dif}` }, u);
  f.partida.ajusteAutId = a.id; f.partida.motivoAjuste = motivo;
  auditar(d, "inventario_ajuste_propuesto", "inventario", inv.id, `${nomP(d, productoId)} ${f.dif} · nivel ${a.nivel}`);
  return { ok: true, autorizacion: a };
}
export function cerrarInventario(d, invId, u) {
  const inv = d.inventarios.find((x) => x.id === invId);
  if (!inv) return err("El inventario no existe.");
  if (!puedeOperar(u, inv.sucursalId)) return err("No operas este almacén.");
  if (inv.estado !== "comparativo") return err("El inventario aún no está en comparativo.");
  const sin = comparativo(d, inv).filter((f) => f.dif && !f.partida.ajusteAutId);
  if (sin.length) return err(`Falta proponer el ajuste de ${sin.length} producto(s) con diferencia.`);
  inv.estado = "cerrado"; inv.cerrado = hoy(); inv.congelado = false;
  auditar(d, "inventario_cerrado", "inventario", inv.id, inv.folio);
  return { ok: true };
}

// ───────────────────────── Ajuste manual
export const MOTIVOS_AJUSTE = ["merma", "robo", "daño", "caducidad"];
export function solicitarAjuste(d, { almacenId, productoId, cant, motivo, nota = "" }, u) {
  if (!puedeOperar(u, almacenId)) return err("No operas este almacén.");
  cant = Number(cant);
  if (!Number.isInteger(cant) || cant === 0) return err("La cantidad debe ser un entero distinto de cero.");
  if (!MOTIVOS_AJUSTE.includes(motivo)) return err("El motivo es obligatorio.");
  if (!d.productos.some((p) => p.id === productoId)) return err("Elige un producto.");
  if (cant < 0 && -cant > R.stock(d, almacenId, productoId)) return err(`Solo hay ${R.stock(d, almacenId, productoId)} en existencia.`);
  const a = pedirAjuste(d, { almacenId, productoId, cant, valor: valorDiferencia(d, almacenId, productoId, cant), detalle: `${motivo[0].toUpperCase() + motivo.slice(1)} · ${nomP(d, productoId)} ${cant > 0 ? "+" : ""}${cant}${nota.trim() ? ` — ${nota.trim()}` : ""}` }, u);
  auditar(d, "ajuste_solicitado", "autorizacion", a.id, a.detalle);
  return { ok: true, autorizacion: a };
}

// ───────────────────────── Laboratorio: recepción con control de calidad y entrega
export const ESTADOS_LAB_SUC = ["enviada", "retrasada", "en_prueba", "recibida"];
export const labRetrasada = (o, ref = hoy()) => o.estado === "retrasada" || (o.estado === "enviada" && o.prometida < ref);

export function recibirDeLaboratorio(d, id, { ok, motivo = "", prometida }, u, sucursalId) {
  const o = d.ordenesLab.find((x) => x.id === id);
  if (!o) return err("La orden no existe.");
  if (!puedeOperar(u, sucursalId) || o.sucursalId !== sucursalId) return err("La orden es de otra sucursal.");
  if (!ESTADOS_LAB_SUC.includes(o.estado)) return err("La orden no está en un estado que permita esta acción.");
  if (ok) {
    o.estado = "recibida"; o.recibidaLab = hoy(); o.calidad = { ok: true, por: u.id, fecha: hoy() };
    auditar(d, "lab_recibida", "orden_lab", o.id, `${o.folio} · control de calidad OK`);
    return { ok: true, estado: o.estado };
  }
  if (!String(motivo).trim()) return err("Escribe el motivo del retrabajo.");
  if (!prometida || prometida <= hoy()) return err("La nueva fecha prometida debe ser posterior a hoy.");
  o.retrabajos = [...(o.retrabajos || []), { fecha: hoy(), motivo: motivo.trim(), prometidaAnterior: o.prometida, por: u.id }];
  o.calidad = { ok: false, por: u.id, fecha: hoy(), motivo: motivo.trim() };
  o.estado = "enviada"; o.prometida = prometida;
  auditar(d, "lab_retrabajo", "orden_lab", o.id, `${o.folio} · ${motivo.trim()} · nueva promesa ${prometida}`);
  return { ok: true, estado: o.estado };
}
export function entregarOrdenLab(d, id, { firma }, u, sucursalId) {
  const o = d.ordenesLab.find((x) => x.id === id);
  if (!o) return err("La orden no existe.");
  if (!puedeOperar(u, sucursalId) || o.sucursalId !== sucursalId) return err("La orden es de otra sucursal.");
  if (!["recibida", "en_prueba"].includes(o.estado)) return err("Solo se entregan órdenes ya recibidas del laboratorio.");
  if (!firma) return err("Falta la firma de recibido del paciente.");
  o.estado = "entregada"; o.entregada = hoy(); o.firmaRecibido = firma; o.entregadaPor = u.id;
  auditar(d, "lab_entregada", "orden_lab", o.id, `${o.folio} entregada al paciente`);
  return { ok: true };
}
export { sumarDias };
