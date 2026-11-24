// Demo Pie Clinic · almacén central (Centenario): entrada de compra con foto de factura, reparto sugerido por sucursal, envío y recepción
// con faltantes, alertas de mínimo y mensajes de WhatsApp SIMULADOS (d.whatsapp) que se ven en el celular de la pantalla.
// Reutiliza traspasos, PEPS y bitácora del almacén. Todo funciona sin internet: el estado vive en este navegador.
// INTEGRACIÓN: el envío real de WhatsApp (Meta Cloud API) sustituye a `wa()`; ver docs/WHATSAPP_REAL.md.
import { auditar, uid, folio } from "./core.js";
import * as R from "./reglas.js";
import { enviarTraspaso, recibirTraspaso } from "./acciones_almacen.js";
import { hoy, dia, sumarDias, ahoraLocal } from "../lib/format.js";
import { enviarReal } from "../datos/whatsapp_real.js";

const err = (error) => ({ ok: false, error });
const esCompras = (u) => !!u && ((u.rol === "almacen" && u.almacenCentral) || u.rol === "admin" || u.rol === "direccion");
const centralUser = (d) => d.usuarios.find((x) => x.almacenCentral);
const usuarioAlmacen = (d, sid) => d.usuarios.find((x) => x.rol === "almacen" && !x.almacenCentral && x.sucursales[0] === sid);
const nombreSuc = (d, sid) => (d.sucursales.find((s) => s.id === sid) || { nombre: sid }).nombre;
/** «25 plantillas de pelite»: cantidad y nombre en plural. */
export const plural = (n, nombre) => { const [w, ...r] = String(nombre).toLowerCase().split(" "); const pw = n === 1 || /s$/.test(w) ? w : /[aeiou]$/.test(w) ? w + "s" : w + "es"; return [n, pw, ...r].join(" "); };
const prod = (d, id) => d.productos.find((p) => p.id === id);

/** Mensaje de WhatsApp simulado: queda en d.whatsapp y aparece de inmediato en el celular dibujado. */
export function wa(d, tipo, texto, sucursalId = null, boton = null) {
  (d.whatsapp ||= []).push({ id: uid("WA"), ts: ahoraLocal(), hora: ahoraLocal().slice(11, 16), tipo, texto, sucursalId });
  if (d.whatsapp.length > 200) d.whatsapp.splice(0, d.whatsapp.length - 200);
  // Prioridad 5: con VITE_WHATSAPP_REAL=1 el mismo mensaje sale también por WhatsApp Cloud API (apagado por defecto).
  if (["compra", "envio", "recibido", "falta", "minimo"].includes(tipo)) enviarReal(tipo, texto, boton);
}

// ───────────────────────── Alertas de inventario mínimo
/** Productos de venta por debajo del mínimo, en el almacén central y en las sucursales. */
export function alertasMinimo(d) {
  const out = [];
  d.almacenes.forEach((a) => {
    d.productos.filter((p) => p.tipo === "venta" && p.minimo > 0).forEach((p) => {
      const stock = R.stock(d, a.id, p.id);
      const minimo = a.id === "CEN" ? p.minimo * 3 : p.minimo; // el central guarda 3 veces el mínimo de una sucursal
      if (stock < minimo) out.push({ almacenId: a.id, almacen: a.id === "CEN" ? "Almacén central" : nombreSuc(d, a.id), productoId: p.id, producto: p.nombre, stock, minimo, faltan: minimo - stock });
    });
  });
  return out.sort((x, y) => (x.almacenId === "CEN" ? -1 : 0) - (y.almacenId === "CEN" ? -1 : 0) || y.faltan - x.faltan);
}

// ───────────────────────── Entrada de compra en el almacén central
export function entradaCentral(d, { productoId, cant, costo, folioFactura, proveedor, foto }, u) {
  if (!esCompras(u)) return err("Solo compras y almacén central registran entradas.");
  const p = prod(d, productoId);
  const c = Number(cant);
  if (!p) return err("Elige el producto.");
  if (!Number.isInteger(c) || c <= 0) return err("La cantidad debe ser un entero mayor a cero.");
  if (!String(folioFactura || "").trim()) return err("Captura el folio de la factura.");
  const costoU = Number(costo) >= 0 && costo !== "" ? Number(costo) : p.costo;
  R.entradaCapa(d, "CEN", productoId, c, costoU, `FAC-${String(folioFactura).trim()}`);
  const e = { id: uid("EC"), folio: folio(d, "EC"), fecha: hoy(), productoId, cant: c, costo: costoU, folioFactura: String(folioFactura).trim(), proveedor: proveedor || "Proveedor", foto: foto || null, por: u.id };
  (d.entradasCentral ||= []).unshift(e);
  auditar(d, "entrada_central", "producto", productoId, `${e.folio} · ${c} × ${p.nombre} · factura ${e.folioFactura}`);
  wa(d, "compra", `Compra recibida en Centenario: ${plural(c, p.nombre)} (factura ${e.folioFactura}).`);
  return { ok: true, entrada: e };
}

// ───────────────────────── Reparto sugerido
/** Venta de las sucursales en los últimos 30 días (ventas registradas); si no hay, usa el peso del histórico mensual. */
function ventaMes(d, productoId) {
  const desde = sumarDias(hoy(), -30);
  const m = {};
  d.sucursales.forEach((s) => { m[s.id] = 0; });
  d.ventas.forEach((v) => {
    if (v.estado === "cancelada" || dia(v.fecha) < desde || m[v.sucursalId] == null) return;
    (v.partidas || []).forEach((p) => { if (p.tipo === "producto" && p.itemId === productoId) m[v.sucursalId] += p.cant || 0; });
  });
  return m;
}
const pesoHist = (d) => {
  const w = {}; const ult = [...new Set((d.hist || []).map((h) => h.mes))].sort().pop();
  d.sucursales.forEach((s) => { const h = (d.hist || []).find((x) => x.sucursalId === s.id && x.mes === ult); w[s.id] = h ? h.productos + h.plantillas : 1; });
  return w;
};

/**
 * Propone cuántas piezas mandar a cada sucursal: más a quien vende más y menos tiene (cobertura del último mes). Suma exactamente `total`.
 * Devuelve [{ sucursalId, nombre, existencia, minimo, venta, sugerido }].
 */
export function sugerirReparto(d, productoId, total) {
  const p = prod(d, productoId);
  const T = Math.max(0, Math.floor(Number(total) || 0));
  if (!p) return [];
  const venta = ventaMes(d, productoId);
  const base = pesoHist(d);
  const tot = Object.values(venta).reduce((a, b) => a + b, 0);
  const filas = d.sucursales.map((s) => {
    const existencia = R.stock(d, s.id, productoId);
    const ritmo = tot > 0 ? venta[s.id] : (base[s.id] / Object.values(base).reduce((a, b) => a + b, 1)) * p.minimo * 3; // piezas/mes
    const objetivo = Math.max(p.minimo * 1.5, ritmo * 1.2);
    return { sucursalId: s.id, nombre: s.nombre, existencia, minimo: p.minimo, venta: Math.round(tot > 0 ? venta[s.id] : ritmo), necesidad: Math.max(0, objetivo - existencia) };
  });
  const sumaN = filas.reduce((a, f) => a + f.necesidad, 0);
  const reparto = filas.map((f) => ({ ...f, exacto: sumaN > 0 ? (f.necesidad / sumaN) * T : T / filas.length }));
  reparto.forEach((f) => { f.sugerido = Math.floor(f.exacto); });
  let resto = T - reparto.reduce((a, f) => a + f.sugerido, 0);
  [...reparto].sort((a, b) => (b.exacto - Math.floor(b.exacto)) - (a.exacto - Math.floor(a.exacto))).forEach((f) => { if (resto > 0) { f.sugerido += 1; resto -= 1; } });
  return reparto.map(({ necesidad, exacto, ...f }) => f);
}

/** Aprueba el reparto ajustado y lo envía: un traspaso por sucursal desde el almacén central (sale por PEPS). */
export function aprobarReparto(d, { productoId, partidas }, u) {
  if (!esCompras(u)) return err("Solo compras aprueba el reparto.");
  const p = prod(d, productoId);
  if (!p) return err("Elige el producto.");
  const filas = (partidas || []).map((x) => ({ sucursalId: x.sucursalId, cant: Math.floor(Number(x.cant) || 0) })).filter((x) => x.cant > 0);
  if (!filas.length) return err("No hay nada que repartir.");
  const total = filas.reduce((a, x) => a + x.cant, 0);
  const hay = R.stock(d, "CEN", productoId);
  if (total > hay) return err(`El almacén central solo tiene ${hay} de ${p.nombre}; quieres repartir ${total}.`);
  const central = centralUser(d);
  const creados = [];
  for (const f of filas) {
    d.contadores.TR = Math.max(d.contadores.TR || 0, 457) + 1;
    const t = {
      id: uid("TR"), folio: `TR-${d.contadores.TR}`, origenId: "CEN", destinoId: f.sucursalId, solicitadoPor: u.id, fecha: hoy(), estado: "solicitado", reparto: true,
      partidas: [{ productoId, solicitado: f.cant, enviado: 0, recibido: 0 }],
    };
    d.traspasos.unshift(t);
    const r = enviarTraspaso(d, t.id, { [productoId]: f.cant }, central, "CEN");
    if (!r.ok) return err(r.error);
    wa(d, "envio", `Van en camino ${plural(f.cant, p.nombre)} a ${nombreSuc(d, f.sucursalId)} (${t.folio}).`, f.sucursalId, { id: `recibido:${t.id}`, titulo: "Recibido" });
    creados.push(t.id);
  }
  auditar(d, "reparto_aprobado", "producto", productoId, `${total} × ${p.nombre} a ${filas.length} sucursales`);
  const quedan = R.stock(d, "CEN", productoId);
  if (quedan < p.minimo * 3) wa(d, "minimo", `Inventario mínimo en almacén central: quedan ${plural(quedan, p.nombre)} (mínimo ${p.minimo * 3}). Hay que comprar.`);
  return { ok: true, traspasos: creados };
}

/** Traspasos de reparto en camino (para que la sucursal confirme). */
export const enCamino = (d) => d.traspasos.filter((t) => t.origenId === "CEN" && t.estado === "en_transito");

/** La sucursal confirma «recibido» (faltantes = 0) o captura los faltantes. Actualiza el inventario y deja la diferencia registrada. */
export function confirmarRecepcion(d, traspasoId, faltantes = 0) {
  const t = d.traspasos.find((x) => x.id === traspasoId);
  if (!t || t.estado !== "en_transito") return err("Ese envío ya no está en camino.");
  const falta = Math.max(0, Math.floor(Number(faltantes) || 0));
  const p0 = t.partidas[0];
  if (falta > p0.enviado) return err(`No pueden faltar más de las ${p0.enviado} enviadas.`);
  const actor = usuarioAlmacen(d, t.destinoId);
  if (!actor) return err("La sucursal no tiene encargado de almacén.");
  const recibidos = Object.fromEntries(t.partidas.map((p) => [p.productoId, p.enviado - (p === p0 ? falta : 0)]));
  const r = recibirTraspaso(d, t.id, recibidos, actor, t.destinoId, falta ? `Faltaron ${falta}` : "");
  if (!r.ok) return err(r.error);
  const nombre = nombreSuc(d, t.destinoId), pr = prod(d, p0.productoId);
  if (falta) wa(d, "falta", `Faltaron ${plural(falta, pr.nombre)} en ${nombre}: recibió ${p0.enviado - falta} de ${p0.enviado}. Diferencia registrada.`, t.destinoId);
  else wa(d, "recibido", `${nombre} recibió completo (${plural(p0.enviado, pr.nombre)}).`, t.destinoId);
  const bajo = R.stock(d, t.destinoId, p0.productoId) < pr.minimo;
  if (bajo) wa(d, "minimo", `Inventario mínimo en ${nombre}: ${pr.nombre.toLowerCase()}.`, t.destinoId);
  return { ok: true, estado: r.estado };
}
