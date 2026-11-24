// Reglas de negocio del requerimiento, como funciones puras sobre el estado (o su copia "draft").
// Las que dicen "decidido por defecto" aún dependen de PREGUNTAS_ABIERTAS.md (compuerta E3).
import { redondear, diasEntre, hoy, dia, sumarDias } from "../lib/format.js";
import { activarMinimo } from "./articulos_sicar.js";

// ───────── Precios: lista base + ajuste % por sucursal (decisión del cliente). Redondeo a centavos (PA-V1 abierta).
const indices = new WeakMap();
/** Busca por id con un índice por arreglo (el catálogo de productos tiene miles de artículos). */
export function porId(arr, id) {
  let m = indices.get(arr);
  if (!m) { m = new Map(arr.map((x, i) => [x.id, i])); indices.set(arr, m); }
  const x = arr[m.get(id)];
  return x && x.id === id ? x : arr.find((y) => y.id === id);
}
export function itemCatalogo(d, tipo, itemId) {
  return porId(tipo === "servicio" ? d.servicios : d.productos, itemId);
}
export function ajustePct(d, sucursalId, tipo, itemId) {
  const esp = d.ajustesPrecio.find((a) => a.sucursalId === sucursalId && a.tipo === tipo && a.itemId === itemId);
  if (esp) return esp.pct;
  const gen = d.ajustesPrecio.find((a) => a.sucursalId === sucursalId && a.tipo === "*");
  return gen ? gen.pct : 0;
}
export function precioFinal(d, sucursalId, tipo, itemId) {
  const it = itemCatalogo(d, tipo, itemId);
  if (!it) return 0;
  return redondear(it.precioBase * (1 + ajustePct(d, sucursalId, tipo, itemId) / 100));
}

// ───────── Inventario con costeo PEPS por capas (decisión del cliente)
export function stock(d, almacenId, productoId) {
  return d.capas.filter((c) => c.almacenId === almacenId && c.productoId === productoId).reduce((a, c) => a + c.cant, 0);
}
export function apartadoReservado(d, sucursalId, productoId) {
  return d.apartados.filter((a) => a.sucursalId === sucursalId && a.productoId === productoId && estadoApartado(a) !== "liberado" && ["activo"].includes(a.estado)).reduce((s, a) => s + a.cant, 0);
}
export function disponible(d, almacenId, productoId) {
  return stock(d, almacenId, productoId) - (almacenId === "CEN" ? 0 : apartadoReservado(d, almacenId, productoId));
}
export function entradaCapa(d, almacenId, productoId, cant, costo, lote = "") {
  if (cant <= 0) return;
  activarMinimo(d.productos.find((p) => p.id === productoId));
  d.capas.push({ id: `CP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, almacenId, productoId, fecha: hoy(), cant, costo: redondear(costo), lote });
}
/** Consume de las capas más antiguas. Devuelve { ok, costo, faltan }. Si no alcanza, no consume nada. */
export function salidaPEPS(d, almacenId, productoId, cant) {
  if (stock(d, almacenId, productoId) < cant) return { ok: false, costo: 0, faltan: cant - stock(d, almacenId, productoId) };
  const capas = d.capas.filter((c) => c.almacenId === almacenId && c.productoId === productoId && c.cant > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let resta = cant, costo = 0;
  for (const c of capas) {
    const t = Math.min(c.cant, resta);
    c.cant -= t; costo += t * c.costo; resta -= t;
    if (!resta) break;
  }
  d.capas = d.capas.filter((c) => c.cant > 0);
  return { ok: true, costo: redondear(costo), faltan: 0 };
}
/** Valor del inventario de un almacén a costo PEPS. */
export function valuacion(d, almacenId) {
  return redondear(d.capas.filter((c) => c.almacenId === almacenId).reduce((a, c) => a + c.cant * c.costo, 0));
}
export function bajoMinimo(d, almacenId) {
  if (almacenId === "CEN") return [];
  return d.productos.filter((p) => p.minimo > 0 && stock(d, almacenId, p.id) < p.minimo);
}

// ───────── Apartados (decisión del cliente: 10 días, anticipo 20 %, el anticipo no se devuelve, prórroga la autoriza el gerente)
export const pagadoApartado = (a) => a.abonos.reduce((s, x) => s + x.monto, 0);
export const saldoApartado = (a) => redondear(a.precio - pagadoApartado(a));
export function estadoApartado(a, ref = hoy()) {
  if (["liquidado", "entregado", "liberado", "cancelado"].includes(a.estado)) return a.estado;
  const dd = diasEntre(ref, a.vence);
  if (dd < 0) return "vencido";
  if (dd <= 2) return "por_vencer";
  return "vigente";
}
export const anticipoMinimo = (d, sucursalId, precio) => redondear(precio * d.params[sucursalId].anticipoMinimoPct / 100);

// ───────── Crédito, plazos y mora (decisión del cliente: interés mensual en crédito abierto, recargo único en plazos, gracia 10 días)
export function estadoParcialidad(p, params, ref = hoy()) {
  if (p.pagado >= p.capital) return "pagada";
  const venc = diasEntre(p.vence, ref); // días transcurridos desde el vencimiento
  if (venc <= 0) return "pendiente";
  if (venc <= params.diasGracia) return "en_gracia";
  return "vencida";
}
/** Interés (crédito abierto) y recargo (ventas a plazos) acumulados de una parcialidad. No se acumulan entre sí (CT1). */
export function moraParcialidad(plan, p, params, ref = hoy()) {
  if (estadoParcialidad(p, params, ref) !== "vencida") return { interes: 0, recargo: 0 };
  const pend = redondear(p.capital - p.pagado);
  const cobrada = p.moraCobrada || 0; // mora que ya se pagó en abonos anteriores
  if (plan.tipo === "plazos") return { interes: 0, recargo: Math.max(0, redondear(pend * params.recargoUnicoPct / 100 - cobrada)) };
  const meses = Math.max(1, Math.ceil((diasEntre(p.vence, ref) - params.diasGracia) / 30));
  return { interes: Math.max(0, redondear(pend * (params.interesMensualPct / 100) * meses - cobrada)), recargo: 0 };
}
export function saldoPlan(d, plan, ref = hoy()) {
  const params = d.params[plan.sucursalId];
  let capital = 0, mora = 0, vencido = 0;
  plan.parcialidades.forEach((p) => {
    const pend = redondear(p.capital - p.pagado);
    capital += pend;
    const m = moraParcialidad(plan, p, params, ref);
    mora += m.interes + m.recargo;
    if (estadoParcialidad(p, params, ref) === "vencida") vencido += pend + m.interes + m.recargo;
  });
  return { capital: redondear(capital), mora: redondear(mora), total: redondear(capital + mora), vencido: redondear(vencido) };
}
export function diasMoraPlan(d, plan, ref = hoy()) {
  const params = d.params[plan.sucursalId];
  const venc = plan.parcialidades.filter((p) => estadoParcialidad(p, params, ref) === "vencida").map((p) => diasEntre(p.vence, ref));
  return venc.length ? Math.max(...venc) : 0;
}
export function saldoCreditoPaciente(d, pacienteId, ref = hoy()) {
  return redondear(d.planes.filter((p) => p.pacienteId === pacienteId && !["liquidado", "cancelado"].includes(p.estado)).reduce((a, p) => a + saldoPlan(d, p, ref).capital, 0));
}
export const credito = (d, pacienteId) => d.creditos.find((c) => c.pacienteId === pacienteId);
export function creditoDisponible(d, pacienteId) {
  const c = credito(d, pacienteId);
  return c ? Math.max(0, redondear(c.limite - saldoCreditoPaciente(d, pacienteId))) : 0;
}

// ───────── Niveles de autorización (decisión del cliente, umbrales por parámetro de sucursal)
export function nivelCredito(d, sucursalId, monto) {
  const p = d.params[sucursalId];
  return monto <= p.limiteCreditoGerente ? "gerente" : monto <= p.limiteCreditoAdmin ? "admin" : "direccion";
}
export function nivelAjuste(d, sucursalId, monto) {
  return Math.abs(monto) <= d.params[sucursalId].limiteAjusteGerente ? "gerente" : "admin";
}
/** ¿Puede este usuario resolver una autorización de ese nivel? gerente < admin < direccion. */
export function puedeResolver(usuario, aut) {
  const rango = { gerente: 1, admin: 2, direccion: 3 };
  return (rango[usuario.rol] || 0) >= (rango[aut.nivel] || 9) && (usuario.rol !== "gerente" || usuario.sucursales.includes(aut.sucursalId));
}
export function pedirAutorizacion(d, { tipo, sucursalId, solicitanteId, detalle, monto = 0, nivel, ref = null }) {
  const a = { id: `AU${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, tipo, sucursalId, solicitanteId, detalle, monto, nivel, estado: "pendiente", fecha: hoy(), resueltoPor: null, motivo: "", ref };
  d.autorizaciones.unshift(a);
  return a;
}

// ───────── Caja
export function turnoAbierto(d, cajeroId) { return d.turnos.find((t) => t.cajeroId === cajeroId && t.estado === "abierto"); }
export function ventasDeTurno(d, turnoId) { return d.ventas.filter((v) => v.turnoId === turnoId && v.estado !== "cancelada"); }
/** Esperado por forma de pago: fondo (efectivo) + ventas + abonos − retiros/gastos. */
export function esperadoTurno(d, turno) {
  const e = { efectivo: turno.fondo, tarjeta: 0, transferencia: 0 };
  ventasDeTurno(d, turno.id).forEach((v) => v.pagos.forEach((p) => { e[p.forma] = (e[p.forma] || 0) + p.monto; }));
  turno.movimientos.forEach((m) => { e[m.forma || "efectivo"] = (e[m.forma || "efectivo"] || 0) + m.monto; }); // monto con signo
  Object.keys(e).forEach((k) => { e[k] = redondear(e[k]); });
  return e;
}
export function consultasPorCobrar(d, sucursalId) {
  return d.consultas.filter((c) => c.estado === "cerrada" && (!sucursalId || c.sucursalId === sucursalId));
}

export const nombrePaciente = (d, id) => { const p = d.pacientes.find((x) => x.id === id); return p ? `${p.nombres} ${p.apellidos}` : "—"; };
export const nombreUsuario = (d, id) => (d.usuarios.find((x) => x.id === id) || {}).nombre || "—";
export const nombreSucursal = (d, id) => (d.sucursales.find((x) => x.id === id) || d.almacenes.find((x) => x.id === id) || {}).nombre || id;
export const nombreAlmacen = (d, id) => (d.almacenes.find((x) => x.id === id) || {}).nombre || id;
export const nombreProducto = (d, id) => (d.productos.find((x) => x.id === id) || {}).nombre || id;
export const nombreServicio = (d, id) => (d.servicios.find((x) => x.id === id) || {}).nombre || id;
export const _sumarDias = sumarDias;
