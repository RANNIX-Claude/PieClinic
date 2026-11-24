// Lógica de Administración central y Dirección (consolidado, precios, compras, parámetros, usuarios, rotación,
// reportes y bitácora). Funciones puras sobre el estado `d` (o su copia "draft" dentro de mutar()).
// Las pantallas llaman: mutar((d) => cambiarPrecioBase(d, {...})). Las acciones validan el rol del usuario en sesión.
import { hoy, dia, hora, redondear, sumarDias, ahoraLocal, normaliza } from "../lib/format.js";
import * as R from "./reglas.js";
import { carteraVencida } from "./selectors.js";
import { auditar, folio, uid } from "./core.js";

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const num = (x) => (x === "" || x === null || x === undefined ? NaN : Number(x));

/** Usuario en sesión si es administración central o dirección; si no, null. */
export function actorAdmin(d) {
  const u = d.usuarios.find((x) => x.id === d.sesion.userId);
  return u && (u.rol === "admin" || u.rol === "direccion") && u.activo !== false ? u : null;
}
const NO_PERMITIDO = err("Esta acción es solo de Administración central o Dirección.");

// ═════════════════════════ Periodos
export const PERIODOS = [{ v: "hoy", l: "Hoy" }, { v: "semana", l: "Semana" }, { v: "mes", l: "Mes" }];
/** Hoy = el día; Semana = últimos 7 días (con hoy); Mes = últimos 30 días (con hoy). */
export function periodo(tipo, ref = hoy()) {
  if (tipo === "hoy") return { tipo, desde: ref, hasta: ref, etiqueta: "Hoy" };
  if (tipo === "semana") return { tipo, desde: sumarDias(ref, -6), hasta: ref, etiqueta: "Últimos 7 días" };
  return { tipo: "mes", desde: sumarDias(ref, -29), hasta: ref, etiqueta: "Últimos 30 días" };
}
const enRango = (f, p) => { const x = dia(f); return x >= p.desde && x <= p.hasta; };

// ═════════════════════════ Métricas (METRICAS.md)
/** Ventas no canceladas del periodo (y sucursal, si se indica). */
export function ventasValidas(d, p, sucursalId) {
  return d.ventas.filter((v) => v.estado !== "cancelada" && enRango(v.fecha, p) && (!sucursalId || v.sucursalId === sucursalId));
}
/** Devoluciones del periodo (se restan el día en que ocurren: decisión por defecto de PA-V2). */
export function devolucionesDe(d, p, sucursalId) {
  return (d.devoluciones || []).filter((x) => {
    if (["rechazada", "cancelada"].includes(x.estado) || !x.fecha || !enRango(x.fecha, p)) return false;
    if (!sucursalId) return true;
    const v = x.ventaId ? d.ventas.find((y) => y.id === x.ventaId) : null;
    return (x.sucursalId || (v && v.sucursalId)) === sucursalId;
  });
}
const montoDev = (x) => Number(x.monto ?? x.total ?? x.importe ?? 0) || 0;
/** M1: Σ venta.total no canceladas − devoluciones. */
export function ventasNetas(d, p, sucursalId) {
  const bruto = ventasValidas(d, p, sucursalId).reduce((a, v) => a + v.total, 0);
  const dev = devolucionesDe(d, p, sucursalId).reduce((a, x) => a + montoDev(x), 0);
  return redondear(bruto - dev);
}
/** M2: pacientes distintos con consulta cerrada o cobrada. */
export function pacientesAtendidos(d, p, sucursalId) {
  const s = new Set();
  d.consultas.forEach((c) => { if (["cerrada", "cobrada"].includes(c.estado) && enRango(c.fecha, p) && (!sucursalId || c.sucursalId === sucursalId)) s.add(c.pacienteId); });
  return s.size;
}
/** M5: ventas netas ÷ número de ventas. */
export function ticketPromedio(d, p, sucursalId) {
  const n = ventasValidas(d, p, sucursalId).length;
  return n ? redondear(ventasNetas(d, p, sucursalId) / n) : 0;
}
const OCUPAN = ["atendida", "confirmada", "en_atencion", "en_sala"];
export const MIN_JORNADA = 8 * 60;
/** M3: minutos de citas atendidas+confirmadas (y en curso) ÷ (8 h × podólogos presentes ese día en la sucursal). */
export function ocupacionDetalle(d, p, sucursalId) {
  const porDia = new Map();
  d.citas.forEach((c) => {
    if ((sucursalId && c.sucursalId !== sucursalId) || !enRango(c.inicio, p) || c.estado === "cancelada") return;
    const k = `${c.sucursalId}|${dia(c.inicio)}`;
    const o = porDia.get(k) || { min: 0, pods: new Set() };
    o.pods.add(c.podologoId);
    if (OCUPAN.includes(c.estado)) o.min += c.duracion || 0;
    porDia.set(k, o);
  });
  let min = 0, disp = 0;
  porDia.forEach((o) => { min += o.min; disp += MIN_JORNADA * o.pods.size; });
  return { min, disp, pct: disp ? redondear((min / disp) * 100) : 0 };
}
/** Diferencia (contado − esperado) de un turno con corte; 0 si no hay corte o no hay datos. */
export function diferenciaCorte(t) {
  const c = t && t.corte;
  if (!c) return 0;
  const suma = (x) => (typeof x === "number" ? x : x && typeof x === "object" ? Object.values(x).reduce((a, b) => a + (Number(b) || 0), 0) : NaN);
  if (typeof c.diferencia === "number" || (c.diferencia && typeof c.diferencia === "object")) return redondear(suma(c.diferencia) || 0);
  const a = suma(c.contado), b = suma(c.esperado);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : redondear(a - b);
}
/** M7: faltantes (diferencias negativas, en positivo) y sobrantes de los cortes del periodo. */
export function cajaDiferencias(d, p, sucursalId) {
  let faltante = 0, sobrante = 0, cortes = 0;
  d.turnos.forEach((t) => {
    if (!t.corte || (sucursalId && t.sucursalId !== sucursalId)) return;
    const f = t.cerradoEn || t.corte.fecha || t.abiertoEn;
    if (!f || !enRango(f, p)) return;
    cortes++;
    const x = diferenciaCorte(t);
    if (x < 0) faltante += -x; else sobrante += x;
  });
  return { faltante: redondear(faltante), sobrante: redondear(sobrante), cortes };
}

export function resumenSucursal(d, p, sucursalId) {
  const s = sucursalId ? d.sucursales.find((x) => x.id === sucursalId) : null;
  return {
    sucursalId: sucursalId || null,
    nombre: s ? s.nombre : "Las 7 sucursales",
    ventas: ventasNetas(d, p, sucursalId),
    nVentas: ventasValidas(d, p, sucursalId).length,
    pacientes: pacientesAtendidos(d, p, sucursalId),
    ticket: ticketPromedio(d, p, sucursalId),
    ocupacion: ocupacionDetalle(d, p, sucursalId).pct,
    cartera: carteraVencida(d, sucursalId),
    faltantes: cajaDiferencias(d, p, sucursalId).faltante,
  };
}
export const ORDENES_RANKING = [{ v: "ventas", l: "Ventas" }, { v: "pacientes", l: "Pacientes" }, { v: "ticket", l: "Ticket" }, { v: "ocupacion", l: "Ocupación" }];
/** Ranking de las sucursales (mayor a menor) por la métrica elegida. */
export function rankingSucursales(d, p, orden = "ventas") {
  return d.sucursales.map((s) => resumenSucursal(d, p, s.id)).sort((a, b) => b[orden] - a[orden] || a.nombre.localeCompare(b.nombre));
}
function agrupar(partidas, clave, nombre) {
  const m = new Map();
  partidas.forEach((x) => {
    const k = clave(x);
    const o = m.get(k) || { id: k, nombre: nombre(x), cant: 0, importe: 0 };
    o.cant += x.cant || 0; o.importe = redondear(o.importe + (x.importe || 0));
    m.set(k, o);
  });
  return [...m.values()].sort((a, b) => b.importe - a.importe);
}
/** Detalle de una sucursal: top servicios, top productos y podólogos. */
export function detalleSucursal(d, p, sucursalId, top = 5) {
  const vs = ventasValidas(d, p, sucursalId);
  const partidas = vs.flatMap((v) => v.partidas);
  const topServicios = agrupar(partidas.filter((x) => x.tipo === "servicio"), (x) => x.itemId, (x) => x.nombre).slice(0, top);
  const topProductos = agrupar(partidas.filter((x) => x.tipo === "producto"), (x) => x.itemId, (x) => x.nombre).slice(0, top);
  const pods = new Map();
  const get = (id) => { if (!pods.has(id)) pods.set(id, { id, nombre: R.nombreUsuario(d, id), consultas: 0, ingresos: 0, citas: 0 }); return pods.get(id); };
  d.consultas.forEach((c) => { if (c.sucursalId === sucursalId && ["cerrada", "cobrada"].includes(c.estado) && enRango(c.fecha, p)) get(c.podologoId).consultas++; });
  vs.forEach((v) => { const u = d.usuarios.find((x) => x.id === v.vendedorId); if (u && u.rol === "podologo") get(v.vendedorId).ingresos = redondear(get(v.vendedorId).ingresos + v.total); });
  d.citas.forEach((c) => { if (c.sucursalId === sucursalId && enRango(c.inicio, p) && c.estado !== "cancelada") get(c.podologoId).citas++; });
  return { topServicios, topProductos, podologos: [...pods.values()].sort((a, b) => b.ingresos - a.ingresos || b.consultas - a.consultas) };
}

// ═════════════════════════ Reportes (cada uno: columnas + filas; sirven para tarjetas y CSV)
export const REPORTES = [
  { id: "ventas_sucursal", nombre: "Ventas por sucursal" },
  { id: "ventas_categoria", nombre: "Ventas por categoría" },
  { id: "ventas_vendedor", nombre: "Ventas por vendedor" },
  { id: "margen_producto", nombre: "Margen por producto" },
  { id: "inventario", nombre: "Rotación e inventario valuado" },
  { id: "cartera", nombre: "Cartera vencida por sucursal" },
  { id: "planes", nombre: "Cumplimiento de planes de tratamiento" },
  { id: "esterilizacion", nombre: "Cumplimiento de esterilización" },
  { id: "mermas", nombre: "Mermas" },
];
const C = (k, l, tipo = "num") => ({ k, l, tipo });
const pct = (a, b) => (b ? redondear((a / b) * 100) : 0);

export function generarReporte(d, id, p) {
  let columnas = [], filas = [], nota = "";
  if (id === "ventas_sucursal") {
    columnas = [C("nombre", "Sucursal", "texto"), C("ventas", "Ventas netas", "dinero"), C("tickets", "Tickets"), C("ticket", "Ticket promedio", "dinero"), C("devoluciones", "Devoluciones", "dinero")];
    filas = d.sucursales.map((s) => ({ id: s.id, nombre: s.nombre, ventas: ventasNetas(d, p, s.id), tickets: ventasValidas(d, p, s.id).length, ticket: ticketPromedio(d, p, s.id), devoluciones: redondear(devolucionesDe(d, p, s.id).reduce((a, x) => a + montoDev(x), 0)) }));
    nota = "Ventas netas = ventas no canceladas − devoluciones del periodo.";
  } else if (id === "ventas_categoria") {
    const partidas = ventasValidas(d, p).flatMap((v) => v.partidas);
    const cat = (x) => (x.tipo === "servicio" ? "Servicios" : ((d.productos.find((y) => y.id === x.itemId) || {}).categoria || "Otros"));
    const g = agrupar(partidas, cat, cat);
    const total = g.reduce((a, x) => a + x.importe, 0);
    columnas = [C("nombre", "Categoría", "texto"), C("unidades", "Unidades"), C("importe", "Importe", "dinero"), C("participacion", "Participación %", "pct")];
    filas = g.map((x) => ({ id: x.id, nombre: x.nombre, unidades: x.cant, importe: x.importe, participacion: pct(x.importe, total) }));
    nota = "Importe de partidas antes de devoluciones.";
  } else if (id === "ventas_vendedor") {
    const m = new Map();
    ventasValidas(d, p).forEach((v) => {
      const k = v.vendedorId || v.cajeroId || "—";
      const o = m.get(k) || { id: k, nombre: k === "—" ? "Sin vendedor" : R.nombreUsuario(d, k), tickets: 0, ventas: 0 };
      o.tickets++; o.ventas = redondear(o.ventas + v.total); m.set(k, o);
    });
    columnas = [C("nombre", "Vendedor", "texto"), C("tickets", "Tickets"), C("ventas", "Ventas", "dinero"), C("ticket", "Ticket promedio", "dinero")];
    filas = [...m.values()].map((o) => ({ ...o, ticket: o.tickets ? redondear(o.ventas / o.tickets) : 0 }));
  } else if (id === "margen_producto") {
    const m = new Map();
    ventasValidas(d, p).forEach((v) => v.partidas.forEach((x) => {
      if (x.tipo !== "producto" || typeof x.costo !== "number") return;
      const o = m.get(x.itemId) || { id: x.itemId, nombre: x.nombre, unidades: 0, ingreso: 0, costo: 0 };
      o.unidades += x.cant; o.ingreso = redondear(o.ingreso + x.importe); o.costo = redondear(o.costo + x.costo * x.cant); m.set(x.itemId, o);
    }));
    columnas = [C("nombre", "Producto", "texto"), C("unidades", "Unidades"), C("ingreso", "Ingreso neto", "dinero"), C("costo", "Costo PEPS", "dinero"), C("margen", "Margen $", "dinero"), C("margenPct", "Margen %", "pct")];
    filas = [...m.values()].map((o) => ({ ...o, margen: redondear(o.ingreso - o.costo), margenPct: pct(o.ingreso - o.costo, o.ingreso) }));
    nota = "Margen = precio neto − costo PEPS de la partida (partida.costo).";
  } else if (id === "inventario") {
    const dias = Math.max(1, Math.round((new Date(p.hasta) - new Date(p.desde)) / 86400000) + 1);
    columnas = [C("nombre", "Almacén", "texto"), C("valuacion", "Inventario valuado", "dinero"), C("costoVentas", "Costo de ventas", "dinero"), C("rotacion", "Rotación (veces)"), C("diasInv", "Días de inventario"), C("bajoMinimo", "Productos bajo mínimo")];
    filas = d.almacenes.map((a) => {
      const val = R.valuacion(d, a.id);
      const cv = redondear(ventasValidas(d, p, a.id).flatMap((v) => v.partidas).reduce((s, x) => s + (typeof x.costo === "number" ? x.costo * x.cant : 0), 0));
      const rot = val ? redondear(cv / val) : 0;
      return { id: a.id, nombre: a.nombre, valuacion: val, costoVentas: cv, rotacion: rot, diasInv: cv ? Math.round(val / (cv / dias)) : 0, bajoMinimo: R.bajoMinimo(d, a.id).length };
    });
    nota = "Rotación = costo de ventas del periodo ÷ inventario valuado a hoy (PEPS). 0 = sin ventas de producto en el periodo.";
  } else if (id === "cartera") {
    columnas = [C("nombre", "Sucursal", "texto"), C("vencido", "Capital vencido", "dinero"), C("conMora", "Vencido con mora", "dinero"), C("planesMora", "Planes en mora"), C("diasMax", "Máx. días de atraso"), C("porCobrar", "Capital por cobrar", "dinero")];
    filas = d.sucursales.map((s) => {
      const pl = d.planes.filter((x) => x.sucursalId === s.id && x.estado !== "liquidado" && x.estado !== "cancelado");
      const sal = pl.map((x) => ({ s: R.saldoPlan(d, x), dm: R.diasMoraPlan(d, x) }));
      return { id: s.id, nombre: s.nombre, vencido: carteraVencida(d, s.id), conMora: redondear(sal.reduce((a, x) => a + x.s.vencido, 0)), planesMora: sal.filter((x) => x.dm > 0).length, diasMax: Math.max(0, ...sal.map((x) => x.dm)), porCobrar: redondear(sal.reduce((a, x) => a + x.s.capital, 0)) };
    });
    nota = "Cartera a la fecha de hoy (no depende del periodo). Vencido = más allá de los días de gracia.";
  } else if (id === "planes") {
    columnas = [C("nombre", "Sucursal", "texto"), C("agendadas", "Sesiones vencidas"), C("atendidas", "Atendidas"), C("noAsistio", "No asistió"), C("canceladas", "Canceladas"), C("cumplimiento", "Cumplimiento %", "pct")];
    filas = d.sucursales.map((s) => {
      const cs = d.citas.filter((c) => c.sucursalId === s.id && enRango(c.inicio, p) && ["atendida", "no_asistio", "cancelada"].includes(c.estado));
      const at = cs.filter((c) => c.estado === "atendida").length;
      return { id: s.id, nombre: s.nombre, agendadas: cs.length, atendidas: at, noAsistio: cs.filter((c) => c.estado === "no_asistio").length, canceladas: cs.filter((c) => c.estado === "cancelada").length, cumplimiento: pct(at, cs.length) };
    });
    nota = "Sesiones atendidas ÷ sesiones agendadas ya vencidas (atendidas + no asistió + canceladas).";
  } else if (id === "esterilizacion") {
    columnas = [C("nombre", "Sucursal", "texto"), C("ciclos", "Ciclos"), C("conformes", "Conformes"), C("noConformes", "No conformes"), C("biologicoPend", "Biológico pendiente"), C("cumplimiento", "Cumplimiento %", "pct")];
    filas = d.sucursales.map((s) => {
      const cs = d.ciclos.filter((c) => c.sucursalId === s.id && enRango(c.fecha, p));
      const conf = cs.filter((c) => c.resultado === "conforme").length;
      return { id: s.id, nombre: s.nombre, ciclos: cs.length, conformes: conf, noConformes: cs.length - conf, biologicoPend: cs.filter((c) => c.indicadorBiologico === "pendiente").length, cumplimiento: pct(conf, cs.length) };
    });
    nota = "Cumplimiento = ciclos conformes ÷ ciclos del periodo.";
  } else if (id === "mermas") {
    const m = new Map();
    (d.ajustesInventario || []).forEach((a) => {
      if (!(a.cant < 0) || !a.fecha || !enRango(a.fecha, p)) return;
      const k = `${a.almacenId}|${a.productoId}`;
      const pr = d.productos.find((x) => x.id === a.productoId);
      const o = m.get(k) || { id: k, nombre: `${R.nombreProducto(d, a.productoId)}`, almacen: R.nombreAlmacen(d, a.almacenId), ajustes: 0, unidades: 0, valor: 0 };
      o.ajustes++; o.unidades += -a.cant; o.valor = redondear(o.valor + -a.cant * (pr ? pr.costo : 0)); m.set(k, o);
    });
    columnas = [C("nombre", "Producto", "texto"), C("almacen", "Almacén", "texto"), C("ajustes", "Ajustes"), C("unidades", "Unidades"), C("valor", "Valor a costo", "dinero")];
    filas = [...m.values()];
    nota = "Ajustes de inventario autorizados con salida (merma, daño, caducidad, robo) valuados al costo base del producto.";
  }
  return { id, columnas, filas, nota };
}
export function ordenarFilas(filas, clave, desc = true) {
  const f = [...filas];
  f.sort((a, b) => (typeof a[clave] === "string" ? a[clave].localeCompare(b[clave]) : (a[clave] - b[clave]) * (desc ? -1 : 1)));
  return f;
}
/** CSV con BOM UTF-8 y nombres de columna en español. */
export function aCSV(columnas, filas) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const enc = columnas.map((c) => esc(c.l)).join(",");
  const cuerpo = filas.map((f) => columnas.map((c) => esc(f[c.k])).join(","));
  return "﻿" + [enc, ...cuerpo].join("\r\n");
}

// ═════════════════════════ Precios
export function itemsPrecio(d, { texto = "", tipo = "todo" } = {}) {
  const q = normaliza(texto);
  const sv = d.servicios.map((x) => ({ tipo: "servicio", id: x.id, nombre: x.nombre, categoria: "Servicio", base: x.precioBase }));
  const pr = d.productos.filter((x) => x.tipo === "venta").map((x) => ({ tipo: "producto", id: x.id, nombre: x.nombre, categoria: x.categoria, base: x.precioBase, sku: x.sku }));
  return [...sv, ...pr].filter((x) => (tipo === "todo" || x.tipo === tipo) && (!q || normaliza(`${x.nombre} ${x.categoria} ${x.sku || ""}`).includes(q)));
}
/** Matriz: base y precio final en cada sucursal. `especifico` = el ajuste viene de una regla propia del ítem. */
export function matrizPrecios(d, tipo, itemId) {
  return d.sucursales.map((s) => ({
    sucursalId: s.id, nombre: s.nombre,
    pct: R.ajustePct(d, s.id, tipo, itemId),
    final: R.precioFinal(d, s.id, tipo, itemId),
    especifico: d.ajustesPrecio.some((a) => a.sucursalId === s.id && a.tipo === tipo && a.itemId === itemId),
  }));
}
const motivoValido = (m) => String(m || "").trim().length >= 5;
/** Tipo de cambio de precio (catálogo por validar con el cliente, PREGUNTAS_ABIERTAS V2-38). */
export const TIPOS_CAMBIO_PRECIO = [
  { v: "costo_compra", l: "Nuevo costo de compra" }, { v: "ajuste_anual", l: "Ajuste anual" },
  { v: "promocion", l: "Promoción" }, { v: "correccion", l: "Corrección" }, { v: "otro", l: "Otro" },
];
const tipoCambioValido = (t) => (TIPOS_CAMBIO_PRECIO.some((x) => x.v === t) ? t : "otro");
function anotarHist(d, u, h) {
  (d.listaPreciosHist ||= []).unshift({ id: uid("LP"), fecha: ahoraLocal(), vigenteDesde: hoy(), usuarioId: u.id, ...h });
}
export function cambiarPrecioBase(d, { tipo, itemId, nuevo, motivo, tipoCambio, compraRef }) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const it = R.itemCatalogo(d, tipo, itemId);
  if (!it) return err("No se encontró el producto o servicio.");
  const n = num(nuevo);
  if (!Number.isFinite(n) || n <= 0) return err("Escribe un precio base mayor que cero.");
  if (!motivoValido(motivo)) return err("El motivo es obligatorio (mínimo 5 caracteres).");
  const antes = it.precioBase, despues = redondear(n);
  if (antes === despues) return err("El precio nuevo es igual al actual.");
  it.precioBase = despues;
  anotarHist(d, u, { itemTipo: tipo, itemId, sucursalId: "*", campo: "precioBase", antes, despues, motivo: motivo.trim(), tipoCambio: tipoCambioValido(tipoCambio), compraRef: String(compraRef || "").trim() || null });
  auditar(d, "cambio_precio_base", "precio", itemId, `${it.nombre}: ${antes} → ${despues}. ${motivo.trim()}`);
  return ok({ antes, despues });
}
/** Ajuste % de una sucursal. tipo "*" e itemId "*" = ajuste general. pct = null en un ítem quita su regla propia. */
export function cambiarAjuste(d, { sucursalId, tipo = "*", itemId = "*", pct: nuevo, motivo, tipoCambio, compraRef }) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  if (!motivoValido(motivo)) return err("El motivo es obligatorio (mínimo 5 caracteres).");
  const general = tipo === "*" || itemId === "*";
  const quitar = nuevo === null && !general;
  const n = quitar ? null : num(nuevo);
  if (!quitar && (!Number.isFinite(n) || n < -90 || n > 200)) return err("El ajuste debe estar entre −90 % y +200 %.");
  const t = general ? "*" : tipo, i = general ? "*" : itemId;
  const antes = R.ajustePct(d, sucursalId, t, i);
  let reg = d.ajustesPrecio.find((a) => a.sucursalId === sucursalId && a.tipo === t && a.itemId === i);
  if (quitar) { if (!reg) return err("Ese ítem no tiene un ajuste propio."); d.ajustesPrecio = d.ajustesPrecio.filter((a) => a !== reg && !(a.sucursalId === sucursalId && a.tipo === t && a.itemId === i)); }
  else { if (!reg) { reg = { sucursalId, tipo: t, itemId: i, pct: 0 }; d.ajustesPrecio.push(reg); } reg.pct = n; }
  const despues = R.ajustePct(d, sucursalId, t, i);
  if (antes === despues && !quitar) return err("El ajuste nuevo es igual al actual.");
  anotarHist(d, u, { itemTipo: t, itemId: i, sucursalId, campo: "ajustePct", antes, despues, motivo: motivo.trim(), tipoCambio: tipoCambioValido(tipoCambio), compraRef: String(compraRef || "").trim() || null });
  auditar(d, "cambio_ajuste_precio", "precio", `${sucursalId}:${i}`, `${R.nombreSucursal(d, sucursalId)} ${general ? "(general)" : i}: ${antes} % → ${despues} %. ${motivo.trim()}`);
  return ok({ antes, despues });
}

// ═════════════════════════ Compras
export const ESTADOS_OC = { por_aprobar: ["Por aprobar", "warn"], enviada: ["Enviada", "info"], recibida_parcial: ["Recibida parcial", "warn"], recibida: ["Recibida", "ok"] };
export const totalOC = (o) => redondear(o.partidas.reduce((a, x) => a + x.cant * x.costo, 0));
/** La serie OC de la semilla llega a OC-1185 sin contador: se inicializa para continuar en OC-1186. */
export function siguienteFolioOC(d) {
  const maxExistente = Math.max(1185, ...d.oc.map((o) => Number(String(o.folio).replace(/\D/g, "")) || 0));
  if ((d.contadores.OC || 0) < maxExistente) d.contadores.OC = maxExistente;
  return folio(d, "OC", 4);
}
export function crearOC(d, { proveedorId, partidas, almacenId = "CEN" }) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  if (!d.proveedores.some((p) => p.id === proveedorId)) return err("Elige un proveedor.");
  if (!d.almacenes.some((a) => a.id === almacenId)) return err("Almacén destino no válido.");
  const m = new Map();
  for (const x of partidas || []) {
    const cant = num(x.cant), costo = num(x.costo);
    if (!d.productos.some((p) => p.id === x.productoId)) return err("Hay una partida con producto no válido.");
    if (!Number.isInteger(cant) || cant <= 0) return err("La cantidad debe ser un entero mayor que cero.");
    if (!Number.isFinite(costo) || costo <= 0) return err("El costo debe ser mayor que cero.");
    const o = m.get(x.productoId);
    if (o) { o.cant += cant; o.costo = redondear(costo); } else m.set(x.productoId, { productoId: x.productoId, cant, costo: redondear(costo), recibido: 0 });
  }
  if (!m.size) return err("Agrega al menos una partida.");
  const o = { id: uid("OC"), folio: siguienteFolioOC(d), proveedorId, almacenId, fecha: hoy(), estado: "por_aprobar", partidas: [...m.values()], factura: null, creadaPor: u.id };
  d.oc.unshift(o);
  auditar(d, "oc_creada", "oc", o.id, `${o.folio} · ${R.nombreAlmacen(d, almacenId)} · ${totalOC(o)}`);
  return ok({ oc: o });
}
export function aprobarEnviarOC(d, ocId) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const o = d.oc.find((x) => x.id === ocId);
  if (!o) return err("No se encontró la orden.");
  if (o.estado !== "por_aprobar") return err("Solo se aprueban órdenes por aprobar.");
  o.estado = "enviada"; o.aprobadaPor = u.id; o.enviadaEn = ahoraLocal();
  auditar(d, "oc_aprobada_enviada", "oc", o.id, `${o.folio} aprobada y enviada`);
  return ok();
}
export const saldoCxp = (c) => redondear(c.saldo || 0);
export function estadoCxp(c, ref = hoy()) {
  if (saldoCxp(c) <= 0) return "pagada";
  if (c.vence < ref) return "vencida";
  return c.vence <= sumarDias(ref, 7) ? "por_vencer" : "vigente";
}
/** Vencidas arriba (más antiguas primero), luego por vencer, vigentes y pagadas. */
export function ordenarCxp(d, ref = hoy()) {
  const rango = { vencida: 0, por_vencer: 1, vigente: 2, pagada: 3 };
  return [...d.cxp].sort((a, b) => rango[estadoCxp(a, ref)] - rango[estadoCxp(b, ref)] || a.vence.localeCompare(b.vence));
}
export function registrarPagoCxp(d, { cxpId, monto, referencia = "" }) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const c = d.cxp.find((x) => x.id === cxpId);
  if (!c) return err("No se encontró la cuenta por pagar.");
  const m = num(monto);
  if (!Number.isFinite(m) || m <= 0) return err("Escribe un monto mayor que cero.");
  if (m > saldoCxp(c) + 0.001) return err("El pago no puede exceder el saldo.");
  const antes = saldoCxp(c);
  c.saldo = redondear(antes - m);
  (c.pagos ||= []).push({ fecha: ahoraLocal(), monto: redondear(m), referencia: String(referencia).trim(), usuarioId: u.id });
  auditar(d, c.saldo === 0 ? "cxp_pago_total" : "cxp_pago_parcial", "cxp", c.id, `${c.doc}: pago ${redondear(m)} · saldo ${antes} → ${c.saldo}`);
  return ok({ saldo: c.saldo });
}

// ═════════════════════════ Parámetros por sucursal
const ROLES_PRORROGA = [["gerente", "Gerente de sucursal"], ["admin", "Administración central"]];
const POLITICAS = [["no_devuelve", "No se devuelve"], ["devuelve", "Se devuelve"], ["saldo_a_favor", "Queda como saldo a favor"]];
export const PARAMETROS = [
  { k: "vigenciaApartadoDias", l: "Vigencia del apartado", tipo: "dias", u: "días", ayuda: "Días que se reserva el producto desde el apartado. Vencido el plazo, el producto se libera. Decisión del cliente: 10 días." },
  { k: "anticipoMinimoPct", l: "Anticipo mínimo del apartado", tipo: "pct", u: "% del precio", ayuda: "Porcentaje mínimo del precio que el paciente deja para apartar. Decisión del cliente: 20 %." },
  { k: "politicaAnticipoVencido", l: "Anticipo de un apartado vencido", tipo: "enum", opciones: POLITICAS, ayuda: "Qué pasa con el anticipo cuando el apartado vence. Por defecto no se devuelve; puede devolverse o quedar como saldo a favor." },
  { k: "prorrogaAutorizaRol", l: "Quién autoriza la prórroga", tipo: "enum", opciones: ROLES_PRORROGA, ayuda: "Rol que resuelve la ampliación de vigencia de un apartado. Por defecto, el gerente de tienda." },
  { k: "interesMensualPct", l: "Interés mensual (crédito abierto)", tipo: "pct", u: "% al mes", ayuda: "Se cobra por cada mes de atraso en crédito abierto, después de los días de gracia. No se acumula con el recargo único." },
  { k: "recargoUnicoPct", l: "Recargo único (ventas a plazos)", tipo: "pct", u: "% del saldo vencido", ayuda: "Recargo por pago tardío en ventas a plazos; se cobra una sola vez por parcialidad vencida." },
  { k: "diasGracia", l: "Días de gracia", tipo: "dias", u: "días", ayuda: "Días después del vencimiento en que todavía no se cobra interés ni recargo. Por defecto 10." },
  { k: "limiteCreditoGerente", l: "Crédito: límite del gerente", tipo: "monto", u: "MXN", ayuda: "Hasta este monto el gerente de sucursal autoriza el crédito. Debe ser menor que el límite de Administración central." },
  { k: "limiteCreditoAdmin", l: "Crédito: límite de Administración", tipo: "monto", u: "MXN", ayuda: "Hasta este monto autoriza Administración central; por encima, Dirección." },
  { k: "limiteAjusteGerente", l: "Ajuste de inventario: límite del gerente", tipo: "monto", u: "MXN", ayuda: "Hasta este valor el gerente autoriza un ajuste de inventario; por encima, Administración central." },
];
/** Valida un conjunto de parámetros; devuelve { clave: mensaje } (vacío si todo está bien). */
export function validarParametros(v) {
  const e = {};
  PARAMETROS.forEach((p) => {
    const x = v[p.k];
    if (p.tipo === "enum") { if (!p.opciones.some(([k]) => k === x)) e[p.k] = "Elige una opción."; return; }
    const n = num(x);
    if (!Number.isFinite(n)) { e[p.k] = "Escribe un número."; return; }
    if (p.tipo === "pct" && (n < 0 || n > 100)) e[p.k] = "Debe estar entre 0 y 100.";
    else if (p.tipo === "dias" && (!Number.isInteger(n) || n < 0)) e[p.k] = "Debe ser un número entero de días, 0 o más.";
    else if (p.tipo === "monto" && n < 0) e[p.k] = "No puede ser negativo.";
  });
  if (!e.limiteCreditoGerente && !e.limiteCreditoAdmin && num(v.limiteCreditoGerente) >= num(v.limiteCreditoAdmin)) e.limiteCreditoAdmin = "Debe ser mayor que el límite del gerente.";
  return e;
}
const normalizarParam = (p, x) => (p.tipo === "enum" ? x : Number(x));
const etiquetaValor = (p, x) => (p.tipo === "enum" ? (p.opciones.find(([k]) => k === x) || [, x])[1] : `${x}${p.tipo === "pct" ? " %" : p.tipo === "dias" ? " d" : ""}`);
export function guardarParametros(d, sucursalId, nuevos) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const act = d.params[sucursalId];
  if (!act) return err("Sucursal no válida.");
  const completo = { ...act, ...nuevos };
  const e = validarParametros(completo);
  if (Object.keys(e).length) return err("Corrige los campos marcados.");
  const cambios = [];
  PARAMETROS.forEach((p) => {
    const nv = normalizarParam(p, completo[p.k]);
    if (act[p.k] !== nv) { cambios.push(`${p.l}: ${etiquetaValor(p, act[p.k])} → ${etiquetaValor(p, nv)}`); act[p.k] = nv; }
  });
  if (!cambios.length) return err("No hay cambios por guardar.");
  auditar(d, "parametros_modificados", "parametros", sucursalId, `${R.nombreSucursal(d, sucursalId)}. ${cambios.join("; ")}`);
  return ok({ cambios });
}
/** Copia los parámetros indicados (claves) de una sucursal a otras. */
export function copiarParametros(d, origenId, destinos, claves) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const o = d.params[origenId];
  if (!o) return err("Sucursal de origen no válida.");
  const ks = (claves && claves.length ? claves : PARAMETROS.map((p) => p.k)).filter((k) => PARAMETROS.some((p) => p.k === k));
  const dest = (destinos || []).filter((s) => s !== origenId && d.params[s]);
  if (!dest.length) return err("Elige al menos una sucursal destino.");
  for (const s of dest) { // validar todo antes de aplicar
    const e = validarParametros({ ...d.params[s], ...Object.fromEntries(ks.map((k) => [k, o[k]])) });
    if (Object.keys(e).length) return err(`La copia dejaría parámetros inválidos en ${R.nombreSucursal(d, s)}.`);
  }
  dest.forEach((s) => {
    const cambios = [];
    ks.forEach((k) => { const p = PARAMETROS.find((x) => x.k === k); if (d.params[s][k] !== o[k]) { cambios.push(`${p.l}: ${etiquetaValor(p, d.params[s][k])} → ${etiquetaValor(p, o[k])}`); d.params[s][k] = o[k]; } });
    auditar(d, "parametros_copiados", "parametros", s, `Desde ${R.nombreSucursal(d, origenId)}. ${cambios.join("; ") || "Sin diferencias"}`);
  });
  return ok({ destinos: dest.length });
}

// ═════════════════════════ Usuarios y roles
export const ROLES_USUARIO = [
  { v: "direccion", l: "Dirección" }, { v: "admin", l: "Administración central" }, { v: "gerente", l: "Gerente de sucursal" },
  { v: "podologo", l: "Podólogo" }, { v: "recepcion", l: "Recepción" }, { v: "cajero", l: "Cajero" },
  { v: "almacen", l: "Almacén" }, { v: "asistente", l: "Asistente clínico" },
];
export const DESCRIPCION_ROL = {
  direccion: "Ve las 7 sucursales y resuelve autorizaciones de nivel alto. No opera caja ni registra consultas.",
  admin: "Ve las 7 sucursales; edita precios, parámetros, usuarios, compras y reportes. No opera caja ni registra consultas.",
  gerente: "Ve y autoriza en su sucursal (hasta su nivel); caja y cartera, alertas, equipo. No cambia la lista base ni parámetros.",
  podologo: "Agenda y expediente único (todas las sucursales); consulta, órdenes de laboratorio. Rota hasta en 3 sucursales.",
  recepcion: "Agenda, alta de pacientes, sala y confirmaciones de su sucursal. Sin cobros ni reportes.",
  cajero: "Cobros, apartados, abonos y turnos de caja de su sucursal. No cambia precios; solicita autorizaciones.",
  almacen: "Existencias, recepción, traspasos y conteos de su almacén (o del central). Sin precios ni caja.",
  asistente: "Esterilización, insumos y bitácoras de su sucursal. Sin expediente clínico completo ni caja.",
};
const UNA_SUCURSAL = ["gerente", "recepcion", "cajero", "almacen", "asistente"];
export const maxSucursalesRol = (rol) => (rol === "podologo" ? 3 : UNA_SUCURSAL.includes(rol) ? 1 : 99);
const correoOk = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
/** Valida los datos de un usuario; devuelve { campo: mensaje }. */
export function validarUsuario(d, datos) {
  const e = {};
  if (!String(datos.nombre || "").trim()) e.nombre = "Escribe el nombre.";
  const c = String(datos.correo || "").trim().toLowerCase();
  if (!correoOk(c)) e.correo = "Escribe un correo válido.";
  else if (d.usuarios.some((x) => x.id !== datos.id && String(x.correo).toLowerCase() === c)) e.correo = "Ese correo ya está en uso.";
  if (!ROLES_USUARIO.some((r) => r.v === datos.rol)) e.rol = "Elige un rol.";
  else if (!["admin", "direccion"].includes(datos.rol)) {
    const n = (datos.sucursales || []).length, max = maxSucursalesRol(datos.rol);
    if (n < 1) e.sucursales = "Asigna al menos una sucursal.";
    else if (n > max) e.sucursales = max === 1 ? "Este rol trabaja en una sola sucursal." : `Máximo ${max} sucursales.`;
    else if ((datos.sucursales || []).some((s) => !d.sucursales.some((x) => x.id === s))) e.sucursales = "Sucursal no válida.";
  }
  return e;
}
const nActivosAltos = (d) => d.usuarios.filter((x) => ["admin", "direccion"].includes(x.rol) && x.activo !== false).length;
export function guardarUsuario(d, datos) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const e = validarUsuario(d, datos);
  if (Object.keys(e).length) return err(Object.values(e)[0]);
  const todas = d.sucursales.map((s) => s.id);
  const previo = datos.id ? d.usuarios.find((x) => x.id === datos.id) : null;
  if (datos.id && !previo) return err("No se encontró el usuario.");
  if (previo && previo.id === u.id && previo.rol !== datos.rol) return err("No puedes cambiar tu propio rol.");
  if (previo && ["admin", "direccion"].includes(previo.rol) && !["admin", "direccion"].includes(datos.rol) && previo.activo !== false && nActivosAltos(d) <= 1) return err("Debe quedar al menos un usuario de Administración o Dirección activo.");
  const sucs = ["admin", "direccion"].includes(datos.rol) || (previo && previo.almacenCentral && datos.rol === "almacen") ? todas : [...datos.sucursales];
  const campos = { nombre: datos.nombre.trim(), correo: datos.correo.trim().toLowerCase(), rol: datos.rol, sucursales: sucs };
  if (previo) {
    const cambios = Object.keys(campos).filter((k) => JSON.stringify(previo[k]) !== JSON.stringify(campos[k])).map((k) => `${k}: ${[].concat(previo[k]).join("/")} → ${[].concat(campos[k]).join("/")}`);
    Object.assign(previo, campos);
    auditar(d, "usuario_editado", "usuario", previo.id, cambios.join("; ") || "Sin cambios");
    return ok({ usuario: previo });
  }
  const sig = Math.max(0, ...d.usuarios.map((x) => Number(String(x.id).replace(/\D/g, "")) || 0)) + 1;
  const nuevo = { id: `U${sig}`, ...campos, activo: true };
  d.usuarios.push(nuevo);
  auditar(d, "usuario_creado", "usuario", nuevo.id, `${nuevo.nombre} · ${nuevo.rol} · ${nuevo.sucursales.join(",")}`);
  return ok({ usuario: nuevo });
}
/** Activa o desactiva. Un usuario inactivo (activo === false) no debe poder entrar: el Login debe respetarlo. */
export function cambiarActivo(d, usuarioId, activo) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const t = d.usuarios.find((x) => x.id === usuarioId);
  if (!t) return err("No se encontró el usuario.");
  if (!activo && t.id === u.id) return err("No puedes desactivarte a ti mismo.");
  if (!activo && ["admin", "direccion"].includes(t.rol) && t.activo !== false && nActivosAltos(d) <= 1) return err("Debe quedar al menos un usuario de Administración o Dirección activo.");
  t.activo = !!activo;
  auditar(d, activo ? "usuario_activado" : "usuario_desactivado", "usuario", t.id, t.nombre);
  return ok();
}

// ═════════════════════════ Rotación de podólogos
export const podologos = (d) => d.usuarios.filter((x) => x.rol === "podologo");
const ACTIVA = (c) => c.estado !== "cancelada";
const minutos = (s) => { const h = hora(s); return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)); };
export const citasFuturasEn = (d, podologoId, sucursalId, desde = hoy()) =>
  d.citas.filter((c) => c.podologoId === podologoId && c.sucursalId === sucursalId && dia(c.inicio) >= desde && ["agendada", "por_confirmar", "confirmada"].includes(c.estado)).length;
export function asignarSucursales(d, podologoId, sucursales) {
  const u = actorAdmin(d); if (!u) return NO_PERMITIDO;
  const p = d.usuarios.find((x) => x.id === podologoId && x.rol === "podologo");
  if (!p) return err("No se encontró el podólogo.");
  const s = [...new Set(sucursales || [])];
  if (s.length < 1 || s.length > 3) return err("Un podólogo rota entre 1 y 3 sucursales.");
  if (s.some((x) => !d.sucursales.some((y) => y.id === x))) return err("Sucursal no válida.");
  const antes = p.sucursales.join(",");
  p.sucursales = s;
  const sesion = d.sesion.userId === p.id && !s.includes(d.sesion.sucursalId);
  if (sesion) d.sesion.sucursalId = s[0];
  auditar(d, "rotacion_modificada", "usuario", p.id, `${p.nombre}: ${antes} → ${s.join(",")}`);
  return ok();
}
/** Dónde está hoy: sucursal de la cita en curso o de la próxima (si no, la última del día). */
export function dondeEstaHoy(d, podologoId, fecha = hoy(), ahoraMin = new Date().getHours() * 60 + new Date().getMinutes()) {
  const cs = d.citas.filter((c) => c.podologoId === podologoId && dia(c.inicio) === fecha && ACTIVA(c)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (!cs.length) return { sucursalId: null, citas: 0, sucursales: [] };
  const enCurso = cs.find((c) => ["en_atencion", "en_sala"].includes(c.estado));
  const prox = cs.find((c) => minutos(c.inicio) + c.duracion > ahoraMin);
  const ref = enCurso || prox || cs[cs.length - 1];
  return { sucursalId: ref.sucursalId, citas: cs.length, sucursales: [...new Set(cs.map((c) => c.sucursalId))] };
}
/** Conflictos del día: citas del mismo podólogo que se traslapan (en sucursales distintas o doble reserva en la misma). */
export function conflictosRotacion(d, fecha = hoy()) {
  const out = [];
  podologos(d).forEach((p) => {
    const cs = d.citas.filter((c) => c.podologoId === p.id && dia(c.inicio) === fecha && ACTIVA(c)).sort((a, b) => a.inicio.localeCompare(b.inicio));
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      if (minutos(b.inicio) < minutos(a.inicio) + a.duracion) out.push({ podologoId: p.id, a, b, tipo: a.sucursalId !== b.sucursalId ? "sucursales" : "doble" });
    }
  });
  return out;
}

// ═════════════════════════ Bitácora
export function filtrarBitacora(d, { texto = "", accion = "", entidad = "", usuarioId = "", desde = "", hasta = "" } = {}) {
  const q = normaliza(texto);
  return d.bitacora.filter((b) => {
    if (accion && b.accion !== accion) return false;
    if (entidad && b.entidad !== entidad) return false;
    if (usuarioId && b.usuarioId !== usuarioId) return false;
    const f = dia(b.fecha);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    if (q && !normaliza(`${b.accion} ${b.entidad} ${b.ref || ""} ${b.detalle || ""} ${R.nombreUsuario(d, b.usuarioId)}`).includes(q)) return false;
    return true;
  });
}
export const valoresUnicos = (arr, k) => [...new Set(arr.map((x) => x[k]).filter(Boolean))].sort();
