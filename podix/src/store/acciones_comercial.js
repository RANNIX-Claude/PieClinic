// Dominio «comercial»: tienda en línea + pedidos en línea + auditoría de inventario a distancia.
// (El asistente inteligente vive en acciones_comercial_asistente.js.)
// Las funciones reciben el borrador `d` (se llaman dentro de mutar(d => …)) y devuelven { ok, error?, … }.
// Validan ANTES de modificar: si devuelven { ok:false } no dejaron ningún cambio a medias.
// El rol y la sucursal se validan aquí (en el dato), no solo escondiendo botones.
import { folio, auditar, registrarOp, uid } from "./core.js";
import * as R from "./reglas.js";
import { MOTIVOS_INV } from "./acciones_almacen.js";
import { redondear, hoy, ahoraLocal, dia, diasEntre, sumarDias, normaliza, dinero } from "../lib/format.js";

const err = (error, extra = {}) => ({ ok: false, error, ...extra });

// ───────────────────────── Parámetros (por demo; se editan en d.comercialCfg)
export const CFG_DEFECTO = {
  costoEnvio: 99,            // envío a domicilio (pendiente de validar con el cliente: PA-COM-1)
  envioPorValidar: true,
  envioGratisDesde: 0,       // 0 = nunca gratis
  auditoriaDiasMax: 7,       // días sin auditoría a distancia para marcar una sucursal en rojo
  toleranciaPct: 10,         // diferencia tolerada entre la estimación y el sistema (mínimo 1 pieza)
  maxFotos: 40,              // fotos de auditoría guardadas en total (se descartan las más viejas)
};
export const cfg = (d) => ({ ...CFG_DEFECTO, ...(d.comercialCfg || {}) });

export const ROLES_PEDIDOS = ["cajero", "almacen", "gerente", "admin", "direccion"];
export const ROLES_AUDITORIA = ["almacen", "gerente", "admin", "direccion"];
export const esCentral = (u) => !!u && (u.rol === "admin" || u.rol === "direccion");
const usuarioSesion = (d) => d.usuarios.find((x) => x.id === d.sesion.userId) || null;

// ═════════════════════════ 1. TIENDA EN LÍNEA ═════════════════════════

export const ESTADOS_PEDIDO = { nuevo: "Nuevo", preparando: "Preparando", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado" };
export const TONO_ESTADO = { nuevo: "info", preparando: "warn", listo: "ok", entregado: "neutral", cancelado: "bad" };
export const ACTIVOS = ["nuevo", "preparando", "listo"];
export const FORMAS_ENTREGA_PAGO = ["efectivo", "tarjeta", "transferencia"];

/** Productos de venta al público (la tienda no muestra insumos). */
export const catalogoTienda = (d) => d.productos.filter((p) => p.tipo === "venta");
export const precioTienda = (d, sucursalId, productoId) => R.precioFinal(d, sucursalId, "producto", productoId);

/** Piezas ya comprometidas por pedidos en línea activos (se liberan al cancelar o entregar). */
export function reservadoWeb(d, sucursalId, productoId, exceptoPedidoId = null) {
  return (d.pedidosWeb || [])
    .filter((p) => p.sucursalId === sucursalId && ACTIVOS.includes(p.estado) && p.id !== exceptoPedidoId)
    .reduce((s, p) => s + p.partidas.filter((x) => x.productoId === productoId).reduce((a, x) => a + x.cant, 0), 0);
}
/** Lo que realmente se puede ofrecer en línea: disponible del almacén (sin apartados) menos lo comprometido en pedidos. */
export function disponibleWeb(d, sucursalId, productoId, exceptoPedidoId = null) {
  return Math.max(0, R.disponible(d, sucursalId, productoId) - reservadoWeb(d, sucursalId, productoId, exceptoPedidoId));
}
/** "ok" | "pocas" | "agotado" para el rótulo de la tienda. */
export function nivelDisponibilidad(n, producto) {
  if (n <= 0) return "agotado";
  return n <= Math.max(2, Math.ceil((producto?.minimo || 0) / 2)) ? "pocas" : "ok";
}
export const ROTULO_DISP = { ok: "Disponible", pocas: "Pocas piezas", agotado: "Agotado en esta sucursal" };

export function costoEnvio(d, subtotal) {
  const c = cfg(d);
  return c.envioGratisDesde > 0 && subtotal >= c.envioGratisDesde ? 0 : redondear(c.costoEnvio);
}
/** Totales del carrito con el precio de la sucursal de recolección. items: [{productoId, cant}] */
export function totalesCarrito(d, sucursalId, items, entrega) {
  const lineas = items.map((it) => {
    const p = d.productos.find((x) => x.id === it.productoId);
    if (!p) return null;
    const precio = precioTienda(d, sucursalId, p.id);
    return { productoId: p.id, nombre: p.nombre, cant: it.cant, precio, importe: redondear(precio * it.cant), disponible: disponibleWeb(d, sucursalId, p.id), producto: p };
  }).filter(Boolean);
  const subtotal = redondear(lineas.reduce((a, l) => a + l.importe, 0));
  const envio = entrega === "domicilio" && subtotal > 0 ? costoEnvio(d, subtotal) : 0;
  return { lineas, subtotal, envio, total: redondear(subtotal + envio) };
}

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
export const telefonoValido = (s) => soloDigitos(s).length >= 10;
export const correoValido = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());

/**
 * Crea un pedido de la tienda pública (sin sesión de personal). Valida existencia real de la sucursal de recolección.
 * op: { sucursalId, cliente:{nombre,telefono,correo}, entrega:"sucursal"|"domicilio", direccion, partidas:[{productoId,cant}], pago:"en_linea"|"en_sucursal" }
 */
export function crearPedidoWeb(d, op) {
  const suc = d.sucursales.find((s) => s.id === op.sucursalId && s.activa !== false);
  if (!suc) return err("Elige una sucursal de recolección válida.");
  const c = op.cliente || {};
  if (String(c.nombre || "").trim().length < 3) return err("Escribe tu nombre completo.");
  if (!telefonoValido(c.telefono)) return err("Escribe un teléfono de 10 dígitos.");
  if (!correoValido(c.correo)) return err("Escribe un correo válido.");
  if (!["sucursal", "domicilio"].includes(op.entrega)) return err("Elige cómo quieres recibir tu pedido.");
  if (op.entrega === "domicilio" && String(op.direccion || "").trim().length < 8) return err("Escribe la dirección de entrega completa.");
  if (!["en_linea", "en_sucursal"].includes(op.pago)) return err("Elige la forma de pago.");
  const mapa = new Map();
  for (const it of op.partidas || []) {
    const n = Number(it.cant);
    if (!Number.isInteger(n) || n < 1 || n > 20) return err("La cantidad de cada producto debe ser un entero de 1 a 20.");
    mapa.set(it.productoId, (mapa.get(it.productoId) || 0) + n);
  }
  if (!mapa.size) return err("Tu carrito está vacío.");
  const partidas = [], faltan = [];
  for (const [productoId, cant] of mapa) {
    const p = d.productos.find((x) => x.id === productoId && x.tipo === "venta");
    if (!p) return err("Uno de los productos ya no está disponible.");
    const disp = disponibleWeb(d, suc.id, p.id);
    if (disp < cant) { faltan.push({ productoId, nombre: p.nombre, disponible: disp, pedido: cant }); continue; }
    const precio = precioTienda(d, suc.id, p.id);
    partidas.push({ productoId, nombre: p.nombre, cant, precioLista: p.precioBase, ajustePct: R.ajustePct(d, suc.id, "producto", p.id), precio, importe: redondear(precio * cant) });
  }
  if (faltan.length) return err(`No hay existencia suficiente en ${suc.nombre}: ${faltan.map((f) => `${f.nombre} (disponible ${f.disponible})`).join(", ")}.`, { faltan });
  const subtotal = redondear(partidas.reduce((a, p) => a + p.importe, 0));
  const envio = op.entrega === "domicilio" ? costoEnvio(d, subtotal) : 0;
  const ahora = ahoraLocal();
  const pedido = {
    id: uid("PW"), folio: folio(d, "PW"), fecha: ahora, sucursalId: suc.id,
    cliente: { nombre: c.nombre.trim(), telefono: soloDigitos(c.telefono).slice(-10), correo: c.correo.trim().toLowerCase() },
    entrega: op.entrega, direccion: op.entrega === "domicilio" ? op.direccion.trim() : "",
    partidas, subtotal, envio, envioPorValidar: op.entrega === "domicilio" ? !!cfg(d).envioPorValidar : false, total: redondear(subtotal + envio),
    // INTEGRACIÓN: pasarela de pago. En demo, "en línea" es una simulación: no se cobra nada real.
    pago: op.pago === "en_linea" ? { forma: "en_linea", estado: "pagado", ref: `SIM-${String(Date.now()).slice(-6)}`, simulado: true } : { forma: "en_sucursal", estado: "pendiente", ref: null },
    estado: "nuevo", historial: [{ ts: ahora, estado: "nuevo", usuarioId: null, nota: "Pedido recibido desde la tienda en línea" }], ventaId: null,
  };
  d.pedidosWeb.unshift(pedido);
  auditar(d, "pedido_web_creado", "pedido_web", pedido.id, `${pedido.folio} · ${dinero(pedido.total)} · ${suc.nombre} · ${pedido.pago.forma}`);
  return { ok: true, pedido };
}

/** Seguimiento público: solo con folio + teléfono. Devuelve una vista sin datos internos. */
export function buscarPedidoWeb(d, folioTxt, telefono) {
  const f = String(folioTxt || "").trim().toUpperCase();
  const t = soloDigitos(telefono).slice(-10);
  if (!f || t.length < 10) return null;
  const p = (d.pedidosWeb || []).find((x) => x.folio.toUpperCase() === f && x.cliente.telefono === t);
  if (!p) return null;
  return {
    folio: p.folio, fecha: p.fecha, estado: p.estado, entrega: p.entrega, direccion: p.direccion, sucursal: R.nombreSucursal(d, p.sucursalId),
    partidas: p.partidas.map((x) => ({ nombre: x.nombre, cant: x.cant, importe: x.importe })), subtotal: p.subtotal, envio: p.envio, total: p.total,
    pago: { forma: p.pago.forma, estado: p.pago.estado }, cliente: p.cliente.nombre,
    historial: p.historial.map((h) => ({ ts: h.ts, estado: h.estado, nota: h.estado === "cancelado" ? h.nota : "" })), // sin notas internas ni folios de venta
  };
}

// ═════════════════════════ 2. PEDIDOS EN LÍNEA (personal) ═════════════════════════

function ctxPedido(d, pedido) {
  const u = usuarioSesion(d);
  if (!u || !ROLES_PEDIDOS.includes(u.rol)) return { error: "Tu rol no atiende pedidos en línea." };
  if (pedido && !esCentral(u) && !u.sucursales.includes(pedido.sucursalId)) return { error: "Este pedido es de otra sucursal." };
  return { u };
}
const hallar = (d, id) => (d.pedidosWeb || []).find((x) => x.id === id);

/** Pedidos que el usuario puede ver: su sucursal activa (admin/dirección: todas). */
export function pedidosVisibles(d, u, sucursalId = null) {
  return (d.pedidosWeb || []).filter((p) => (esCentral(u) ? !sucursalId || p.sucursalId === sucursalId : u.sucursales.includes(p.sucursalId) && (!sucursalId || p.sucursalId === sucursalId)));
}

export function avanzarPedido(d, id, nota = "") {
  const p = hallar(d, id); if (!p) return err("El pedido no existe.");
  const c = ctxPedido(d, p); if (c.error) return err(c.error);
  const sig = { nuevo: "preparando", preparando: "listo" }[p.estado];
  if (!sig) return err(p.estado === "listo" ? "Para cerrar el pedido usa «Entregar»." : "Este pedido ya no se puede avanzar.");
  p.estado = sig;
  p.historial.push({ ts: ahoraLocal(), estado: sig, usuarioId: c.u.id, nota: nota.trim() });
  auditar(d, "pedido_web_estado", "pedido_web", p.id, `${p.folio} → ${ESTADOS_PEDIDO[sig]}`);
  return { ok: true, pedido: p };
}

/** Cancela y libera las piezas comprometidas. Si ya estaba pagado en línea, queda por reembolsar. */
export function cancelarPedido(d, id, motivo) {
  const p = hallar(d, id); if (!p) return err("El pedido no existe.");
  const c = ctxPedido(d, p); if (c.error) return err(c.error);
  if (!ACTIVOS.includes(p.estado)) return err("Solo se cancelan pedidos que aún no se entregan.");
  if (String(motivo || "").trim().length < 3) return err("Escribe el motivo de la cancelación.");
  p.estado = "cancelado";
  p.motivoCancelacion = motivo.trim();
  // INTEGRACIÓN: reembolso por la pasarela de pago. En demo solo se marca.
  if (p.pago.estado === "pagado") p.pago.estado = "por_reembolsar";
  p.historial.push({ ts: ahoraLocal(), estado: "cancelado", usuarioId: c.u.id, nota: motivo.trim() });
  auditar(d, "pedido_web_cancelado", "pedido_web", p.id, `${p.folio} · ${motivo.trim()}`);
  return { ok: true, pedido: p };
}

/**
 * Entrega: crea la venta (misma forma que cobrarVenta), descuenta con PEPS y cierra el pedido.
 * Todo o nada: si falta existencia física no cambia nada y avisa qué falta.
 * Pago ya hecho en línea → venta con forma "en_linea" (no pasa por el cajón, turnoId null).
 * Pago pendiente → lo cobra un cajero con turno abierto (formaPago: efectivo|tarjeta|transferencia).
 */
export function entregarPedido(d, id, { formaPago } = {}) {
  const p = hallar(d, id); if (!p) return err("El pedido no existe.");
  const c = ctxPedido(d, p); if (c.error) return err(c.error);
  if (p.estado !== "listo") return err("El pedido debe estar «Listo» para entregarse.");
  const sucursalId = d.sesion.sucursalId;
  if (sucursalId !== p.sucursalId) return err(`Cambia la sucursal activa a ${R.nombreSucursal(d, p.sucursalId)} para entregar este pedido.`);
  let turnoId = null, pagos;
  if (p.pago.estado === "pagado") pagos = [{ forma: "en_linea", monto: p.total }];
  else {
    if (!FORMAS_ENTREGA_PAGO.includes(formaPago)) return err("Elige con qué forma de pago se cobra el pedido.");
    const t = c.u.rol === "cajero" ? R.turnoAbierto(d, c.u.id) : null;
    if (!t || t.sucursalId !== sucursalId) return err("El cobro lo registra un cajero con turno abierto en esta sucursal.");
    turnoId = t.id; pagos = [{ forma: formaPago, monto: p.total }];
  }
  const faltan = p.partidas.filter((x) => R.disponible(d, sucursalId, x.productoId) < x.cant)
    .map((x) => ({ productoId: x.productoId, nombre: x.nombre, hay: Math.max(0, R.disponible(d, sucursalId, x.productoId)), necesita: x.cant }));
  if (faltan.length) return err(`Falta existencia para entregar: ${faltan.map((f) => `${f.nombre} (hay ${f.hay}, necesita ${f.necesita})`).join(", ")}. El pedido sigue en «Listo».`, { faltan });
  const partidas = p.partidas.map((x) => {
    const s = R.salidaPEPS(d, sucursalId, x.productoId, x.cant);
    return { tipo: "producto", itemId: x.productoId, nombre: x.nombre, cant: x.cant, precioLista: x.precioLista, ajustePct: x.ajustePct, precio: x.precio, importe: x.importe, costo: redondear(s.costo / x.cant) };
  });
  if (p.envio > 0) partidas.push({ tipo: "envio", itemId: "ENVIO", nombre: "Envío a domicilio", cant: 1, precioLista: p.envio, ajustePct: 0, precio: p.envio, importe: p.envio });
  const v = {
    id: uid("VE"), folio: folio(d, "T"), sucursalId, cajeroId: c.u.id, pacienteId: null, consultaId: null, tipo: "contado", fecha: ahoraLocal(),
    partidas, subtotal: redondear(partidas.reduce((a, x) => a + x.importe, 0)), descuento: 0, total: p.total, pagos, cambio: 0, estado: "pagada",
    facturar: false, factura: null, turnoId, vendedorId: c.u.id, origen: "pedido_web", pedidoWebId: p.id,
  };
  d.ventas.push(v);
  p.estado = "entregado"; p.ventaId = v.id; p.entregadoPor = c.u.id;
  if (p.pago.estado !== "pagado") { p.pago.estado = "pagado"; p.pago.forma = formaPago; }
  p.historial.push({ ts: ahoraLocal(), estado: "entregado", usuarioId: c.u.id, nota: `Venta ${v.folio}` });
  auditar(d, "pedido_web_entregado", "pedido_web", p.id, `${p.folio} · ${v.folio} · ${dinero(v.total)}`);
  registrarOp(d, "cobro", `${v.folio} · pedido ${p.folio}`);
  return { ok: true, pedido: p, venta: v };
}

// ═════════════════════════ 3. AUDITORÍA DE INVENTARIO A DISTANCIA ═════════════════════════

export const ORIGENES_AUDITORIA = { colaborador: "Colaborador (foto)", camara: "Cámara de seguridad" };
export const ZONAS_DEFECTO = ["Anaquel de bastones y andaderas", "Anaquel de plantillas", "Anaquel de calzado", "Exhibidor de cremas y calcetas", "Bodega"];
export const AVISO_VISION = "Simulación de demostración: en producción la cifra la calcula el servicio de visión; es una estimación y no sustituye el conteo físico periódico.";

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const huella = (foto) => (typeof foto === "string" && foto ? `${foto.length}:${foto.slice(-40)}:${foto.slice(Math.floor(foto.length / 2), Math.floor(foto.length / 2) + 24)}` : "sin-foto");

/** Tolerancia (en piezas) antes de considerar que hay diferencia. */
export const toleranciaPiezas = (sistema, pct = CFG_DEFECTO.toleranciaPct) => Math.max(1, Math.ceil((sistema * pct) / 100));

/**
 * INTEGRACIÓN: servicio de visión (conteo de producto en foto / cámara de seguridad).
 * SIMULACIÓN determinista: parte del stock del sistema (contexto.stock[productoId]) y aplica una desviación reproducible
 * (misma foto + producto + sucursal + día = misma cifra). Sin sesgo: ~62 % exacto, ~30 % ±pequeña (dentro de tolerancia),
 * ~8 % una diferencia mayor (más veces faltante que sobrante) para poder demostrar la alerta.
 * Devuelve [{ productoId, estimado, confianza }].
 */
export function estimarConteoConIA(foto, productos, contexto = {}) {
  const base = huella(foto);
  return productos.map((pr) => {
    const productoId = typeof pr === "string" ? pr : pr.id;
    const sistema = Math.max(0, Number((contexto.stock || {})[productoId]) || 0);
    const h = hash32(`${base}|${productoId}|${contexto.sucursalId || ""}|${contexto.fecha || ""}`);
    const k = h % 100, signo = (h >>> 8) % 10 < 7 ? -1 : 1;
    let dev = 0;
    if (k >= 92) dev = signo * Math.max(2, Math.round(sistema * (0.3 + ((h >>> 12) % 30) / 100)));
    else if (k >= 62) dev = (((h >>> 4) % 2) ? 1 : -1) * Math.max(1, Math.round(sistema * 0.04));
    if (sistema === 0 && dev < 0) dev = 0;
    const estimado = Math.max(0, sistema + dev);
    const confianza = Math.max(55, 96 - Math.abs(dev) * 3 - ((h >>> 16) % 6));
    return { productoId, estimado, confianza };
  });
}

function ctxAud(d, sucursalId) {
  const u = usuarioSesion(d);
  if (!u || !ROLES_AUDITORIA.includes(u.rol)) return { error: "Tu rol no puede operar auditorías de inventario." };
  if (!d.sucursales.some((s) => s.id === sucursalId)) return { error: "Elige una sucursal válida." };
  if (!esCentral(u) && !u.sucursales.includes(sucursalId)) return { error: "Solo puedes auditar tus sucursales." };
  if (u.rol === "almacen" && u.almacenCentral) return { error: "El almacén central no usa la auditoría de sucursal." };
  return { u };
}
export const auditoriasVisibles = (d, u) => (d.auditorias || []).filter((a) => esCentral(u) || u.sucursales.includes(a.sucursalId));

/** Estado de la auditoría derivado de sus diferencias y de cómo se resolvieron. */
export function estadoAuditoria(d, a) {
  const difs = a.items.filter((i) => i.estado === "diferencia");
  if (!difs.length) return "conforme";
  if (difs.some((i) => !i.resolucion)) return "con_alertas";
  if (difs.some((i) => i.resolucion.tipo === "investigacion" && (d.investigacionesInv || []).find((x) => x.id === i.resolucion.invId)?.estado === "abierta")) return "en_investigacion";
  return "resuelta";
}
export const ROTULO_AUD = { conforme: "Conforme", con_alertas: "Con alertas", en_investigacion: "En investigación", resuelta: "Resuelta" };
export const TONO_AUD = { conforme: "ok", con_alertas: "bad", en_investigacion: "warn", resuelta: "neutral" };

/** Compara estimado vs sistema. */
export function compararItem(sistema, estimado, pct = CFG_DEFECTO.toleranciaPct) {
  const dif = estimado - sistema;
  return { sistema, estimado, dif, estado: Math.abs(dif) > toleranciaPiezas(sistema, pct) ? "diferencia" : "ok" };
}

/** Deja como máximo cfg.maxFotos fotos en total; descarta primero las de las auditorías más viejas. */
export function podarFotos(d) {
  const max = cfg(d).maxFotos;
  const con = d.auditorias.filter((a) => (a.fotos || []).length).sort((a, b) => b.fecha.localeCompare(a.fecha));
  let total = 0;
  for (const a of con) {
    const sobra = total + a.fotos.length - max;
    if (sobra > 0) { const quita = Math.min(sobra, a.fotos.length); a.fotos = a.fotos.slice(0, a.fotos.length - quita); a.fotosDescartadas = (a.fotosDescartadas || 0) + quita; }
    total += a.fotos.length;
  }
  return total;
}
export const totalFotos = (d) => (d.auditorias || []).reduce((s, a) => s + (a.fotos || []).length, 0);

/** Existencia del sistema por producto en el almacén de la sucursal. */
export function stockSistema(d, sucursalId, productoIds) {
  return Object.fromEntries(productoIds.map((id) => [id, R.stock(d, sucursalId, id)]));
}

/**
 * Registra una auditoría. op: { sucursalId, zona, origen, camaraRef, productoIds[], fotos[], estimados?:{[productoId]:n}, nota }
 * Si no vienen `estimados`, se calculan con estimarConteoConIA. Una estimación corregida a mano queda marcada.
 */
export function registrarAuditoria(d, op) {
  const c = ctxAud(d, op.sucursalId); if (c.error) return err(c.error);
  if (!ORIGENES_AUDITORIA[op.origen]) return err("Elige el origen de la imagen.");
  if (op.origen === "camara" && !String(op.camaraRef || "").trim()) return err("Escribe el identificador o URL de la cámara.");
  const ids = [...new Set(op.productoIds || [])];
  if (!ids.length) return err("Elige al menos un producto a revisar.");
  if (ids.some((id) => !d.productos.some((p) => p.id === id))) return err("Hay un producto que no existe.");
  const fotos = (op.fotos || []).filter((f) => typeof f === "string" && f.startsWith("data:image/")).slice(0, 3);
  if (!fotos.length) return err("Toma o sube al menos una foto como evidencia.");
  const stock = stockSistema(d, op.sucursalId, ids);
  const fecha = ahoraLocal();
  const ia = estimarConteoConIA(fotos[0], ids, { stock, sucursalId: op.sucursalId, fecha: dia(fecha) });
  const pct = cfg(d).toleranciaPct;
  const items = ia.map((e) => {
    const manual = op.estimados && op.estimados[e.productoId] !== undefined && op.estimados[e.productoId] !== "";
    const est = manual ? Number(op.estimados[e.productoId]) : e.estimado;
    if (!Number.isInteger(est) || est < 0) return null;
    return { productoId: e.productoId, ...compararItem(stock[e.productoId], est, pct), estimadoIA: e.estimado, confianza: e.confianza, corregido: manual && est !== e.estimado, resolucion: null };
  });
  if (items.some((i) => !i)) return err("Las cantidades estimadas deben ser enteros de cero o más.");
  const a = {
    id: uid("AF"), folio: folio(d, "AF"), sucursalId: op.sucursalId, zona: String(op.zona || "").trim() || "Sin zona", origen: op.origen, camaraRef: op.origen === "camara" ? op.camaraRef.trim() : null,
    usuarioId: c.u.id, fecha, fotos, items, nota: String(op.nota || "").trim(), simulado: true,
  };
  d.auditorias.unshift(a);
  podarFotos(d);
  const n = items.filter((i) => i.estado === "diferencia").length;
  auditar(d, "auditoria_distancia", "auditoria", a.id, `${a.folio} · ${R.nombreSucursal(d, a.sucursalId)} · ${items.length} productos · ${n} con diferencia`);
  if (n) auditar(d, "alerta_inventario", "auditoria", a.id, `${a.folio} · ${n} diferencia(s) detectadas ${fecha.replace("T", " ")} por ${c.u.nombre}`);
  return { ok: true, auditoria: a, diferencias: n };
}

/**
 * Resolución de una diferencia: "ajuste" (pide autorización como acciones_almacen: nivel por monto) o "investigacion".
 * res: { tipo:"ajuste"|"investigacion", motivo, nota }
 */
export function resolverDiferencia(d, auditoriaId, productoId, res) {
  const a = (d.auditorias || []).find((x) => x.id === auditoriaId); if (!a) return err("La auditoría no existe.");
  const c = ctxAud(d, a.sucursalId); if (c.error) return err(c.error);
  const it = a.items.find((x) => x.productoId === productoId);
  if (!it || it.estado !== "diferencia") return err("Este producto no tiene diferencia que resolver.");
  if (it.resolucion) return err("Esta diferencia ya fue atendida.");
  const nombre = R.nombreProducto(d, productoId);
  if (res.tipo === "ajuste") {
    if (!MOTIVOS_INV.includes(res.motivo)) return err("Elige el motivo del ajuste.");
    const cant = it.estimado - R.stock(d, a.sucursalId, productoId);
    if (!cant) return err("El sistema ya coincide con la estimación; no hay nada que ajustar.");
    const prod = d.productos.find((x) => x.id === productoId);
    const monto = redondear(Math.abs(cant) * (prod?.costo || 0));
    const nivel = R.nivelAjuste(d, a.sucursalId, monto);
    const aut = R.pedirAutorizacion(d, { tipo: "ajuste_inventario", sucursalId: a.sucursalId, solicitanteId: c.u.id, detalle: `Auditoría ${a.folio} · ${res.motivo} · ${nombre} ${cant > 0 ? "+" : ""}${cant}`, monto, nivel, ref: { almacenId: a.sucursalId, productoId, cant } });
    it.resolucion = { tipo: "ajuste", autId: aut.id, motivo: res.motivo, por: c.u.id, fecha: ahoraLocal(), cant };
    auditar(d, "auditoria_ajuste_propuesto", "auditoria", a.id, `${a.folio} · ${nombre} ${cant} · nivel ${nivel}`);
    return { ok: true, autorizacion: aut };
  }
  if (res.tipo === "investigacion") {
    const nota = String(res.nota || "").trim();
    if (nota.length < 5) return err("Describe brevemente qué se va a investigar.");
    const inv = {
      id: uid("IN"), folio: folio(d, "INV"), auditoriaId: a.id, productoId, sucursalId: a.sucursalId, abiertaPor: c.u.id, fecha: ahoraLocal(), estado: "abierta",
      faltante: -it.dif, valor: redondear(Math.abs(it.dif) * (d.productos.find((x) => x.id === productoId)?.costo || 0)),
      notas: [{ ts: ahoraLocal(), usuarioId: c.u.id, texto: nota }], conclusion: null,
    };
    (d.investigacionesInv ||= []).unshift(inv);
    it.resolucion = { tipo: "investigacion", invId: inv.id, por: c.u.id, fecha: inv.fecha };
    auditar(d, "investigacion_abierta", "investigacion", inv.id, `${inv.folio} · ${nombre} · ${R.nombreSucursal(d, a.sucursalId)}`);
    return { ok: true, investigacion: inv };
  }
  return err("Elige cómo resolver la diferencia.");
}

export function notaInvestigacion(d, invId, texto) {
  const inv = (d.investigacionesInv || []).find((x) => x.id === invId); if (!inv) return err("La investigación no existe.");
  const c = ctxAud(d, inv.sucursalId); if (c.error) return err(c.error);
  if (inv.estado !== "abierta") return err("La investigación ya está cerrada.");
  if (String(texto || "").trim().length < 3) return err("Escribe la nota.");
  inv.notas.push({ ts: ahoraLocal(), usuarioId: c.u.id, texto: texto.trim() });
  auditar(d, "investigacion_nota", "investigacion", inv.id, inv.folio);
  return { ok: true };
}
export function cerrarInvestigacion(d, invId, conclusion) {
  const inv = (d.investigacionesInv || []).find((x) => x.id === invId); if (!inv) return err("La investigación no existe.");
  const c = ctxAud(d, inv.sucursalId); if (c.error) return err(c.error);
  if (c.u.rol === "almacen") return err("Solo gerente o administración cierran una investigación.");
  if (inv.estado !== "abierta") return err("La investigación ya está cerrada.");
  if (String(conclusion || "").trim().length < 5) return err("Escribe la conclusión.");
  inv.estado = "cerrada"; inv.conclusion = conclusion.trim(); inv.cerrada = ahoraLocal(); inv.cerradaPor = c.u.id;
  auditar(d, "investigacion_cerrada", "investigacion", inv.id, `${inv.folio} · ${conclusion.trim()}`);
  return { ok: true };
}

/**
 * Línea de tiempo de un producto en una sucursal (auditorías a distancia, de la más vieja a la más nueva) y
 * cuándo empezó a faltar: inicio de la última racha de faltantes y última auditoría conforme anterior.
 */
export function lineaTiempoProducto(d, sucursalId, productoId) {
  const puntos = (d.auditorias || []).filter((a) => a.sucursalId === sucursalId)
    .map((a) => ({ a, it: a.items.find((i) => i.productoId === productoId) })).filter((x) => x.it)
    .sort((x, y) => x.a.fecha.localeCompare(y.a.fecha))
    .map(({ a, it }) => ({ fecha: a.fecha, auditoriaId: a.id, folio: a.folio, origen: a.origen, usuarioId: a.usuarioId, sistema: it.sistema, estimado: it.estimado, dif: it.dif, estado: it.estado }));
  let i = puntos.length - 1;
  while (i >= 0 && puntos[i].estado === "diferencia" && puntos[i].dif < 0) i--;
  const racha = puntos.slice(i + 1);
  const faltaDesde = racha.length ? racha[0].fecha : null;
  const ultimoConforme = racha.length && i >= 0 ? puntos[i].fecha : null;
  return { puntos, faltaDesde, ultimoConforme, ventana: faltaDesde ? (ultimoConforme ? `entre ${ultimoConforme.replace("T", " ")} (último conteo conforme) y ${faltaDesde.replace("T", " ")} (primera vez que se detectó)` : `detectado por primera vez el ${faltaDesde.replace("T", " ")} (sin conteo conforme previo)`) : null };
}

/** Panel de cumplimiento: última auditoría por sucursal y cuáles llevan más de N días sin auditar. */
export function cumplimientoAuditoria(d, sucursalIds = null, ref = hoy(), dias = cfg(d).auditoriaDiasMax) {
  return d.sucursales.filter((s) => !sucursalIds || sucursalIds.includes(s.id)).map((s) => {
    const ult = (d.auditorias || []).filter((a) => a.sucursalId === s.id).sort((x, y) => y.fecha.localeCompare(x.fecha))[0] || null;
    const dd = ult ? diasEntre(dia(ult.fecha), ref) : null;
    return { sucursalId: s.id, nombre: s.nombre, ultima: ult ? ult.fecha : null, folio: ult ? ult.folio : null, dias: dd, estado: !ult ? "nunca" : dd > dias ? "vencida" : "al_dia", conAlertas: (d.auditorias || []).filter((a) => a.sucursalId === s.id && ["con_alertas", "en_investigacion"].includes(estadoAuditoria(d, a))).length };
  });
}

export { sumarDias, normaliza };
