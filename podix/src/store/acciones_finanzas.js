// Acciones y consultas del dominio «finanzas»: compras y gastos, captura de nota de compra con IA (simulada) y estado de resultados.
// Funciones puras sobre el estado `d` (o su copia "draft" dentro de mutar()). Las acciones validan el rol del usuario en sesión.
//
// ═════ API PÚBLICA PARA OTROS DOMINIOS (asistente, análisis…) — forma de salida ═════
// estadoResultados(d, { mes:"YYYY-MM", sucursalId: "S1".."S7" | null })      (null = consolidado de las 7 sucursales)
//   → { ok:true, mes, parcial:boolean, sinDatos:boolean, nominaEstimada:boolean, sucursalId, nombre,
//       bandas:[
//         { id:"ingresos",   titulo:"INGRESOS",                       filas:[Fila], total:Total },
//         { id:"variables",  titulo:"GASTOS VARIABLES",               filas:[Fila], total:Total },
//         { id:"bruta",      titulo:"UTILIDAD BRUTA",     resultado:true, monto, pct },
//         { id:"operacion",  titulo:"GASTOS DE OPERACIÓN (FIJOS)",    filas:[Fila], total:Total },
//         { id:"operativa",  titulo:"UTILIDAD OPERATIVA", resultado:true, monto, pct } ],
//       totales:{ ingresos, gastosVariables, utilidadBruta, gastosOperacion, nomina, utilidadOperativa, margen, margenBruto } }
//   Fila  = { id, etiqueta, monto, pct, detalle: null | [{ id, etiqueta, monto, pct }] }   (detalle = filas expandibles: sueldos por persona,
//           rentas/luz… por concepto, ingresos por partida en el mes en curso). pct = fracción (0.18 = 18 %) sobre ingresos.
//   Total = { id, etiqueta, monto, pct }.   Importes en pesos. Consolidado = suma exacta de las 7 sucursales.
//   Rol: admin/dirección ven todo; gerente solo su sucursal (con otra → { ok:false, error }); otros roles no. Sin sesión = cálculo libre.
//   Meses cerrados salen de d.hist; el mes en curso (parcial:true) de d.ventas, con nómina devengada a la fecha.
// resumenSucursales(d, mes) → { ok:true, mes, parcial, sucursales:[{ sucursalId, nombre, ingresos, gastosVariables, utilidadBruta, gastosOperacion,
//       nomina, utilidadOperativa, margen, posicion }], cadena:{…mismos campos}|null, mejor:{sucursalId,nombre,margen}|null, peor:{…}|null,
//       ranking:[…ordenado de mayor a menor margen] }       (el gerente solo recibe su sucursal y cadena:null)
// estadoResultadosComparativo(d, mes) → { ok:true, mes, parcial, columnas:[{id,nombre}…,{id:"CAD",nombre:"Cadena"}], bandas:[ igual que arriba pero
//       cada fila/total/resultado trae montos:{[columnaId]:monto}, pcts:{[columnaId]:fracción} y detalle con montos/pcts ] }
import { hoy, redondear, sumarDias, ahoraLocal, dia } from "../lib/format.js";
import * as R from "./reglas.js";
import { auditar, uid } from "./core.js";
import { aCSV } from "./acciones_admin.js";
import { puedeOperar } from "./acciones_almacen.js";
import {
  CATEGORIAS_BASE, COMISION_ESTIMADA_PCT, categoriasDe, crudoSucursal, sumarCrudos, armarEdr,
  mesActual, mesRelativo, mesesDisponibles, nombreMes, diasDelMes,
} from "./dominios/finanzas.js";

export { CATEGORIAS_BASE, COMISION_ESTIMADA_PCT, categoriasDe, mesActual, mesRelativo, mesesDisponibles, nombreMes };

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const num = (x) => (x === "" || x === null || x === undefined ? NaN : Number(x));
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f)) && !Number.isNaN(Date.parse(`${f}T00:00:00`)) && Number(String(f).slice(5, 7)) <= 12 && Number(String(f).slice(8, 10)) <= diasDelMes(String(f).slice(0, 7));

// ═════════════════════════ Roles
export const usuarioDe = (d) => d.usuarios.find((x) => x.id === d.sesion.userId && x.activo !== false) || null;
export const esCentral = (u) => !!u && (u.rol === "admin" || u.rol === "direccion");
/** ¿Puede este usuario capturar/ver gastos de esa sucursal? Admin y dirección todas; gerente la suya. */
export const puedeGastosDe = (u, sucursalId) => esCentral(u) || (!!u && u.rol === "gerente" && u.sucursales.includes(sucursalId));
/** Sucursales cuyo EDR/gastos puede ver el usuario. */
export function sucursalesVisibles(d, u) {
  if (esCentral(u)) return d.sucursales;
  if (u && u.rol === "gerente") return d.sucursales.filter((s) => u.sucursales.includes(s.id));
  return [];
}
const NO_GASTOS = err("Los gastos los capturan el gerente de su sucursal, Administración central o Dirección.");
const NO_COMPRAS = err("Las notas de compra las captura el almacén o Administración central.");

// ═════════════════════════ Estado de resultados
const sinPermisoEdr = (d, sucursalId) => {
  const u = usuarioDe(d);
  if (!d.sesion || !d.sesion.userId) return null; // sin sesión: cálculo libre (otros dominios, pruebas)
  if (esCentral(u)) return null;
  if (u && u.rol === "gerente" && sucursalId && u.sucursales.includes(sucursalId)) return null;
  return err(u && u.rol === "gerente" ? "El gerente solo ve el estado de resultados de su sucursal." : "El estado de resultados es para gerencia, Administración central y Dirección.");
};
const validarMes = (mes) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes)) ? null : err("Mes no válido (usa AAAA-MM)."));

export function estadoResultados(d, { mes, sucursalId = null } = {}) {
  const e = validarMes(mes); if (e) return e;
  const p = sinPermisoEdr(d, sucursalId); if (p) return p;
  if (sucursalId && !d.sucursales.some((s) => s.id === sucursalId)) return err("Sucursal no válida.");
  const crudo = sucursalId ? crudoSucursal(d, sucursalId, mes) : sumarCrudos(d.sucursales.map((s) => crudoSucursal(d, s.id, mes)));
  const nombre = sucursalId ? R.nombreSucursal(d, sucursalId) : "Cadena (las 7 sucursales)";
  return ok({ ...armarEdr(d, crudo, mes), sucursalId, nombre });
}

const filaResumen = (id, nombre, t) => ({ sucursalId: id, nombre, ingresos: t.ingresos, gastosVariables: t.gastosVariables, utilidadBruta: t.utilidadBruta, gastosOperacion: t.gastosOperacion, nomina: t.nomina, utilidadOperativa: t.utilidadOperativa, margen: t.margen });
export function resumenSucursales(d, mes) {
  const e = validarMes(mes); if (e) return e;
  const u = usuarioDe(d);
  const conSesion = !!(d.sesion && d.sesion.userId);
  if (conSesion && !esCentral(u) && !(u && u.rol === "gerente")) return err("El resumen por sucursal es para gerencia, Administración central y Dirección.");
  const visibles = conSesion ? sucursalesVisibles(d, u) : d.sucursales;
  const filas = visibles.map((s) => filaResumen(s.id, s.nombre, armarEdr(d, crudoSucursal(d, s.id, mes), mes).totales));
  const ranking = [...filas].sort((a, b) => b.margen - a.margen).map((f, i) => ({ ...f, posicion: i + 1 }));
  const pos = Object.fromEntries(ranking.map((f) => [f.sucursalId, f.posicion]));
  const lista = filas.map((f) => ({ ...f, posicion: pos[f.sucursalId] }));
  const todas = !conSesion || esCentral(u);
  const cadena = todas ? filaResumen("CAD", "Cadena", armarEdr(d, sumarCrudos(d.sucursales.map((s) => crudoSucursal(d, s.id, mes))), mes).totales) : null;
  const conIng = ranking.filter((f) => f.ingresos > 0);
  const m = (f) => (f ? { sucursalId: f.sucursalId, nombre: f.nombre, margen: f.margen } : null);
  return ok({ mes, parcial: mes === mesActual(), sucursales: lista, cadena, mejor: m(conIng[0]), peor: m(conIng[conIng.length - 1]), ranking });
}

/** Comparativo por sucursal: una columna por sucursal + «Cadena» (suma de las siete). */
export function estadoResultadosComparativo(d, mes) {
  const e = validarMes(mes); if (e) return e;
  const u = usuarioDe(d);
  const conSesion = !!(d.sesion && d.sesion.userId);
  if (conSesion && !esCentral(u) && !(u && u.rol === "gerente")) return err("El estado de resultados es para gerencia, Administración central y Dirección.");
  const suc = conSesion ? sucursalesVisibles(d, u) : d.sucursales;
  const crudos = d.sucursales.map((s) => crudoSucursal(d, s.id, mes));
  const cols = suc.map((s) => ({ id: s.id, nombre: s.nombre, edr: armarEdr(d, crudos[d.sucursales.indexOf(s)], mes) }));
  if (!conSesion || esCentral(u)) cols.push({ id: "CAD", nombre: "Cadena", edr: armarEdr(d, sumarCrudos(crudos), mes) });
  const base = cols[0].edr;
  const campos = (get) => Object.fromEntries(cols.map((c) => [c.id, get(c.edr)]));
  const buscar = (edr, bid, fid) => { const b = edr.bandas.find((x) => x.id === bid); return b.filas.find((x) => x.id === fid) || (b.total.id === fid ? b.total : null); };
  const bandas = base.bandas.map((b) => {
    if (b.resultado) return { id: b.id, titulo: b.titulo, resultado: true, tono: b.tono, montos: campos((e2) => e2.bandas.find((x) => x.id === b.id).monto), pcts: campos((e2) => e2.bandas.find((x) => x.id === b.id).pct) };
    const filas = b.filas.map((f) => {
      const ids = new Map();
      cols.forEach((c) => (buscar(c.edr, b.id, f.id).detalle || []).forEach((x) => ids.has(x.id) || ids.set(x.id, x.etiqueta)));
      const detalle = [...ids].map(([did, etiqueta]) => ({ id: did, etiqueta, montos: campos((e2) => ((buscar(e2, b.id, f.id).detalle || []).find((x) => x.id === did) || { monto: 0 }).monto), pcts: campos((e2) => ((buscar(e2, b.id, f.id).detalle || []).find((x) => x.id === did) || { pct: 0 }).pct) }))
        .sort((x, y) => (y.montos.CAD ?? Object.values(y.montos)[0]) - (x.montos.CAD ?? Object.values(x.montos)[0]));
      return { id: f.id, etiqueta: f.etiqueta, montos: campos((e2) => buscar(e2, b.id, f.id).monto), pcts: campos((e2) => buscar(e2, b.id, f.id).pct), detalle: detalle.length ? detalle : null };
    });
    return { id: b.id, titulo: b.titulo, filas, total: { id: b.total.id, etiqueta: b.total.etiqueta, montos: campos((e2) => e2.bandas.find((x) => x.id === b.id).total.monto), pcts: campos((e2) => e2.bandas.find((x) => x.id === b.id).total.pct) } };
  });
  return ok({ mes, parcial: mes === mesActual(), nominaEstimada: base.nominaEstimada, columnas: cols.map((c) => ({ id: c.id, nombre: c.nombre })), bandas });
}

/** { idFila: monto } de un estado de resultados (para el comparativo contra el mes anterior). */
export function mapaMontos(edr) {
  const m = {};
  edr.bandas.forEach((b) => {
    if (b.resultado) { m[b.id] = b.monto; return; }
    b.filas.forEach((f) => { m[f.id] = f.monto; (f.detalle || []).forEach((x) => { m[`${f.id}/${x.id}`] = x.monto; }); });
    m[b.total.id] = b.total.monto;
  });
  return m;
}

// ═════════════════════════ CSV
const pct1 = (x) => `${(x * 100).toFixed(1)} %`;
/** CSV de una sucursal (o la cadena) con % sobre ingresos y, si se manda, comparativo contra el mes anterior. */
export function csvEstadoResultados(edr, anterior = null) {
  const ant = anterior ? mapaMontos(anterior) : null;
  const filas = [];
  const push = (concepto, monto, pct, clave, nivel = 0) => filas.push({ concepto: `${"   ".repeat(nivel)}${concepto}`, monto, pct: pct1(pct), anterior: ant ? (ant[clave] ?? "") : "", variacion: ant && ant[clave] != null ? redondear(monto - ant[clave]) : "" });
  edr.bandas.forEach((b) => {
    if (b.resultado) { push(b.titulo, b.monto, b.pct, b.id); return; }
    filas.push({ concepto: b.titulo, monto: "", pct: "", anterior: "", variacion: "" });
    b.filas.forEach((f) => { push(f.etiqueta, f.monto, f.pct, f.id, 1); (f.detalle || []).forEach((x) => push(`› ${x.etiqueta}`, x.monto, x.pct, `${f.id}/${x.id}`, 2)); });
    push(b.total.etiqueta, b.total.monto, b.total.pct, b.total.id);
  });
  const cols = [{ k: "concepto", l: `Estado de resultados ${edr.nombre} ${nombreMes(edr.mes)}${edr.parcial ? " (parcial)" : ""}` }, { k: "monto", l: "Importe" }, { k: "pct", l: "% sobre ingresos" }];
  if (ant) cols.push({ k: "anterior", l: "Mes anterior" }, { k: "variacion", l: "Variación" });
  return aCSV(cols, filas);
}
export function csvComparativo(comp) {
  const cols = [{ k: "concepto", l: `Comparativo por sucursal ${nombreMes(comp.mes)}${comp.parcial ? " (parcial)" : ""}` }, ...comp.columnas.map((c) => ({ k: c.id, l: c.nombre }))];
  const filas = [];
  const linea = (concepto, montos) => filas.push({ concepto, ...Object.fromEntries(comp.columnas.map((c) => [c.id, montos ? montos[c.id] : ""])) });
  comp.bandas.forEach((b) => {
    if (b.resultado) { linea(b.titulo, b.montos); return; }
    linea(b.titulo, null);
    b.filas.forEach((f) => { linea(`   ${f.etiqueta}`, f.montos); (f.detalle || []).forEach((x) => linea(`      › ${x.etiqueta}`, x.montos)); });
    linea(b.total.etiqueta, b.total.montos);
  });
  return aCSV(cols, filas);
}

// ═════════════════════════ Gastos
export const FUENTES_GASTO = { manual: "Captura manual", nota_ia: "Nota de compra", recurrente: "Recurrente" };
export function filtrarGastos(d, { sucursalId = "", categoria = "", mes = "", texto = "" } = {}) {
  const t = String(texto).trim().toLowerCase();
  return ((d.fin && d.fin.gastos) || []).filter((g) =>
    (!sucursalId || g.sucursalId === sucursalId) && (!categoria || g.categoria === categoria) && (!mes || g.fecha.slice(0, 7) === mes)
    && (!t || `${g.concepto} ${g.acreedor || ""} ${proveedorNombre(d, g.proveedorId)}`.toLowerCase().includes(t)));
}
export const proveedorNombre = (d, id) => ((d.proveedores || []).find((p) => p.id === id) || {}).nombre || "";
export function totalesGastos(lista) {
  const porCategoria = {}, porSucursal = {};
  let total = 0;
  lista.forEach((g) => { total += g.monto; porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.monto; porSucursal[g.sucursalId] = (porSucursal[g.sucursalId] || 0) + g.monto; });
  return { total: redondear(total), porCategoria, porSucursal };
}
/**
 * Gastos fuera de patrón: en cada (sucursal, categoría, mes), si el total supera 1.6 veces la mediana de los demás meses
 * (y al menos $1,000 más), se marca el gasto de mayor monto de ese grupo. Devuelve Set de ids.
 */
export function gastosFueraDePatron(d) {
  const grupos = new Map();
  ((d.fin && d.fin.gastos) || []).forEach((g) => {
    const k = `${g.sucursalId}|${g.categoria}`;
    const mes = g.fecha.slice(0, 7);
    const m = grupos.get(k) || new Map();
    const x = m.get(mes) || { total: 0, mayor: null };
    x.total += g.monto; if (!x.mayor || g.monto > x.mayor.monto) x.mayor = g;
    m.set(mes, x); grupos.set(k, m);
  });
  const out = new Set();
  grupos.forEach((m) => {
    if (m.size < 5) return;
    m.forEach((x, mes) => {
      const otros = [...m].filter(([k]) => k !== mes && k < mesActual()).map(([, v]) => v.total).sort((a, b) => a - b);
      if (otros.length < 4) return;
      const med = otros[Math.floor(otros.length / 2)];
      if (x.total > med * 1.6 && x.total - med >= 1000) out.add(x.mayor.id);
    });
  });
  return out;
}

export function registrarGasto(d, { sucursalId, fecha, categoria, concepto, monto, proveedorId = null, acreedor = "", comprobante = null }) {
  const u = usuarioDe(d); if (!u) return err("Inicia sesión.");
  if (!d.sucursales.some((s) => s.id === sucursalId)) return err("Elige la sucursal del gasto.");
  if (!puedeGastosDe(u, sucursalId)) return u.rol === "gerente" ? err("El gerente solo captura gastos de su propia sucursal.") : NO_GASTOS;
  if (!categoriasDe(d).some((c) => c.id === categoria)) return err("Elige la categoría.");
  if (!fechaValida(fecha)) return err("La fecha no es válida.");
  if (fecha > hoy()) return err("La fecha del gasto no puede ser futura.");
  const m = num(monto);
  if (!Number.isFinite(m) || m <= 0) return err("El monto debe ser mayor que cero.");
  if (!String(concepto || "").trim()) return err("Escribe el concepto del gasto.");
  if (proveedorId && !(d.proveedores || []).some((p) => p.id === proveedorId)) return err("Proveedor no válido.");
  const g = { id: uid("GA"), sucursalId, fecha, categoria, concepto: String(concepto).trim(), monto: redondear(m), proveedorId: proveedorId || null, acreedor: String(acreedor || "").trim(), comprobante: comprobante || null, fuente: "manual", registradoPor: u.id, creadoEn: ahoraLocal() };
  ((d.fin ||= { categorias: CATEGORIAS_BASE, gastos: [], recurrentes: [], notasCompra: [] }).gastos ||= []).unshift(g);
  auditar(d, "gasto_registrado", "gasto", g.id, `${R.nombreSucursal(d, sucursalId)} · ${g.categoria} · ${g.concepto} · ${g.monto}`);
  return ok({ gasto: g });
}
export function eliminarGasto(d, gastoId, motivo = "") {
  const u = usuarioDe(d); if (!esCentral(u)) return err("Solo Administración central o Dirección eliminan gastos.");
  const i = d.fin.gastos.findIndex((x) => x.id === gastoId);
  if (i < 0) return err("No se encontró el gasto.");
  if (!String(motivo).trim()) return err("Escribe el motivo de la baja.");
  const [g] = d.fin.gastos.splice(i, 1);
  auditar(d, "gasto_eliminado", "gasto", g.id, `${g.concepto} · ${g.monto}. ${String(motivo).trim()}`);
  return ok();
}

// ───────── Gastos recurrentes
export function guardarRecurrente(d, { id = null, sucursalId, categoria, concepto, monto, diaMes, acreedor = "", activo = true }) {
  const u = usuarioDe(d); if (!u) return err("Inicia sesión.");
  if (!puedeGastosDe(u, sucursalId)) return NO_GASTOS;
  const cat = categoriasDe(d).find((c) => c.id === categoria);
  if (!cat) return err("Elige la categoría.");
  const m = num(monto), dm = num(diaMes);
  if (!Number.isFinite(m) || m <= 0) return err("El monto debe ser mayor que cero.");
  if (!Number.isInteger(dm) || dm < 1 || dm > 28) return err("El día del mes debe estar entre 1 y 28.");
  const fin = (d.fin ||= { categorias: CATEGORIAS_BASE, gastos: [], recurrentes: [], notasCompra: [] });
  let re = id && (fin.recurrentes ||= []).find((x) => x.id === id);
  if (id && !re) return err("No se encontró el gasto recurrente.");
  if (!re) { re = { id: uid("RE"), sucursalId, categoria, proveedorId: null }; fin.recurrentes.push(re); }
  Object.assign(re, { concepto: String(concepto || cat.nombre).trim(), monto: redondear(m), diaMes: dm, acreedor, activo: !!activo, categoria });
  auditar(d, id ? "recurrente_editado" : "recurrente_creado", "gasto_recurrente", re.id, `${R.nombreSucursal(d, sucursalId)} · ${re.concepto} · ${re.monto}`);
  return ok({ recurrente: re });
}
/** Recurrentes activos de una sucursal (o todas) que aún no tienen gasto en el mes. */
export function recurrentesPendientes(d, mes, sucursalId = null) {
  const hechos = new Set(((d.fin && d.fin.gastos) || []).filter((g) => g.recurrenteId && g.fecha.slice(0, 7) === mes).map((g) => g.recurrenteId));
  return ((d.fin && d.fin.recurrentes) || []).filter((r) => r.activo && !hechos.has(r.id) && (!sucursalId || r.sucursalId === sucursalId));
}
/** Genera los gastos recurrentes del mes que faltan. Idempotente: no duplica los ya generados. */
export function generarRecurrentes(d, { mes = mesActual(), sucursalId = null } = {}) {
  const u = usuarioDe(d); if (!u) return err("Inicia sesión.");
  if (sucursalId ? !puedeGastosDe(u, sucursalId) : !esCentral(u)) return u.rol === "gerente" ? err("El gerente solo genera los de su sucursal.") : NO_GASTOS;
  const e = validarMes(mes); if (e) return e;
  if (mes > mesActual()) return err("No se generan gastos de meses futuros.");
  const pend = recurrentesPendientes(d, mes, sucursalId).filter((r) => puedeGastosDe(u, r.sucursalId));
  const creados = pend.map((r) => {
    const f = `${mes}-${String(Math.min(r.diaMes, diasDelMes(mes))).padStart(2, "0")}`;
    const g = { id: uid("GA"), sucursalId: r.sucursalId, fecha: f > hoy() ? hoy() : f, categoria: r.categoria, concepto: `${r.concepto} ${nombreMes(mes)}`, monto: r.monto, proveedorId: r.proveedorId || null, acreedor: r.acreedor || "", comprobante: null, fuente: "recurrente", recurrenteId: r.id, registradoPor: u.id, creadoEn: ahoraLocal() };
    d.fin.gastos.unshift(g); return g;
  });
  if (creados.length) auditar(d, "recurrentes_generados", "gasto", mes, `${creados.length} gastos recurrentes de ${nombreMes(mes)}${sucursalId ? ` · ${R.nombreSucursal(d, sucursalId)}` : ""}`);
  return ok({ creados });
}

// ═════════════════════════ Cuentas por pagar y proveedores (resumen; las acciones de pago viven en acciones_admin.js)
export function resumenCxp(d, ref = hoy()) {
  const vivas = (d.cxp || []).filter((c) => c.saldo > 0);
  const venc = vivas.filter((c) => c.vence < ref), pronto = vivas.filter((c) => c.vence >= ref && c.vence <= sumarDias(ref, 7));
  const suma = (a) => redondear(a.reduce((s, c) => s + c.saldo, 0));
  const porProveedor = (d.proveedores || []).map((p) => ({ id: p.id, nombre: p.nombre, dias: p.dias, saldo: suma(vivas.filter((c) => c.proveedorId === p.id)), docs: vivas.filter((c) => c.proveedorId === p.id).length })).sort((a, b) => b.saldo - a.saldo);
  return { total: suma(vivas), vencido: suma(venc), nVencidas: venc.length, porVencer: suma(pronto), nPorVencer: pronto.length, porProveedor };
}

// ═════════════════════════ Captura de nota de compra con IA (SIMULADA)
const hash = (s) => { let h = 5381; const t = String(s || ""); const paso = Math.max(1, Math.floor(t.length / 3000)); for (let i = 0; i < t.length; i += paso) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h ^ t.length) >>> 0; };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const CATS_PROV = [[/ortomed/i, ["Bastones", "Andaderas", "Plantillas"]], [/insumos/i, ["Insumos"]], [/calzado/i, ["Calzado", "Calcetas"]], [/dermo/i, ["Cremas", "Insumos"]]];

/**
 * Arma el borrador a partir de plantillas verosímiles de proveedores y productos del sistema. Determinista por (foto, hora).
 * Cada campo trae { valor, confianza 0–1 }. Es la parte que en producción hace el servicio de visión/IA.
 */
export function armarBorrador(foto, { proveedores, productos }, ref = new Date()) {
  const rng = mulberry((hash(foto) ^ (ref.getHours() * 7919)) >>> 0);
  const pv = proveedores[Math.floor(rng() * proveedores.length)];
  const cats = (CATS_PROV.find(([re]) => re.test(pv.nombre)) || [null, null])[1];
  let pool = productos.filter((p) => !cats || cats.includes(p.categoria));
  if (pool.length < 2) pool = productos;
  const n = 2 + Math.floor(rng() * 3);
  const elegidos = [...pool].sort(() => rng() - 0.5).slice(0, Math.min(n, pool.length));
  const conf = (bajo) => (bajo ? 0.45 + rng() * 0.2 : 0.82 + rng() * 0.17);
  const bajoIdx = Math.floor(rng() * elegidos.length); // al menos una partida con algo dudoso, para que la persona revise
  const campoBajo = Math.floor(rng() * 3);
  const partidas = elegidos.map((p, i) => {
    const cant = p.tipo === "insumo" ? 20 + Math.floor(rng() * 61) : 4 + Math.floor(rng() * 21);
    const costo = redondear(p.costo * (0.94 + rng() * 0.14));
    return { productoId: p.id, nombreLeido: p.nombre, cant, costo, importe: redondear(cant * costo), confianza: { producto: conf(i === bajoIdx && campoBajo === 0), cant: conf(i === bajoIdx && campoBajo === 1), costo: conf(i === bajoIdx && campoBajo === 2) } };
  });
  const suma = redondear(partidas.reduce((a, x) => a + x.importe, 0));
  const descuadre = rng() < 0.25;
  const f = new Date(ref); f.setDate(f.getDate() - Math.floor(rng() * 5));
  return {
    simulado: true,
    proveedor: { valor: pv.id, confianza: conf(false) },
    folio: { valor: `${["A", "F", "B"][Math.floor(rng() * 3)]}-${70000 + Math.floor(rng() * 9999)}`, confianza: conf(rng() < 0.3) },
    fecha: { valor: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`, confianza: conf(rng() < 0.2) },
    partidas,
    total: { valor: descuadre ? redondear(suma + Math.round((rng() * 200 + 50))) : suma, confianza: descuadre ? 0.5 : 0.93 },
  };
}
/**
 * INTEGRACIÓN: aquí se conecta el servicio de visión/IA contratado (enviar la foto, recibir proveedor, folio, fecha y partidas con confianza).
 * Hoy NO existe tal servicio: devuelve una SIMULACIÓN de demostración. La salida nunca se registra sola: la persona revisa y confirma.
 */
export async function leerNotaConIA(foto, catalogo, ref = new Date()) {
  await new Promise((r) => setTimeout(r, 900)); // INTEGRACIÓN: latencia simulada de la lectura
  return armarBorrador(foto, catalogo, ref);
}

const limpiaFolio = (f) => String(f || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** ¿Ya existe una nota del mismo proveedor con el mismo folio? (también contra las cuentas por pagar). */
export function detectarDuplicado(d, proveedorId, folioProveedor) {
  const f = limpiaFolio(folioProveedor);
  if (!proveedorId || !f) return null;
  const n = ((d.fin && d.fin.notasCompra) || []).find((x) => x.proveedorId === proveedorId && limpiaFolio(x.folioProveedor) === f);
  if (n) return { origen: "nota", folio: n.folio, fecha: n.fecha, total: n.total };
  const c = (d.cxp || []).find((x) => x.proveedorId === proveedorId && limpiaFolio(x.doc) === f);
  return c ? { origen: "cxp", folio: c.doc, fecha: null, total: c.saldo } : null;
}

export function validarNota(d, datos) {
  const u = usuarioDe(d); if (!u) return err("Inicia sesión.");
  if (!(u.rol === "almacen" || esCentral(u))) return NO_COMPRAS;
  const pv = (d.proveedores || []).find((p) => p.id === datos.proveedorId);
  if (!pv) return err("Elige el proveedor.");
  if (!String(datos.folioProveedor || "").trim()) return err("Falta el folio de la nota o factura.");
  if (!fechaValida(datos.fecha)) return err("La fecha de la nota no es válida.");
  if (datos.fecha > hoy()) return err("La fecha de la nota no puede ser futura.");
  const tipo = datos.tipo === "gasto" ? "gasto" : "mercancia";
  let total = 0, partidas = [];
  if (tipo === "mercancia") {
    const vistos = new Set();
    for (const x of datos.partidas || []) {
      const cant = num(x.cant), costo = num(x.costo);
      if (!d.productos.some((p) => p.id === x.productoId)) return err("Hay una partida sin producto del catálogo. Elígelo antes de confirmar.");
      if (vistos.has(x.productoId)) return err("Hay un producto repetido: junta las cantidades en una sola partida.");
      vistos.add(x.productoId);
      if (!Number.isInteger(cant) || cant <= 0) return err("La cantidad de cada partida debe ser un entero mayor que cero.");
      if (!Number.isFinite(costo) || costo <= 0) return err("El costo de cada partida debe ser mayor que cero.");
      partidas.push({ productoId: x.productoId, cant, costo: redondear(costo), importe: redondear(cant * costo) });
    }
    if (!partidas.length) return err("Agrega al menos una partida.");
    total = redondear(partidas.reduce((a, x) => a + x.importe, 0));
  } else {
    total = redondear(num(datos.total));
    if (!(total > 0)) return err("Escribe el total de la nota.");
  }
  if (datos.almacenId) {
    if (tipo !== "mercancia") return err("Solo las notas de mercancía dan entrada al inventario.");
    if (!d.almacenes.some((a) => a.id === datos.almacenId)) return err("Almacén no válido.");
    if (u.rol === "almacen" && !puedeOperar(u, datos.almacenId)) return err("Solo puedes dar entrada a tu propio almacén.");
  }
  if (datos.gasto) {
    const g = datos.gasto;
    if (!d.sucursales.some((s) => s.id === g.sucursalId)) return err("Elige la sucursal del gasto de la nota.");
    if (u.rol === "almacen" ? !u.sucursales.includes(g.sucursalId) : false) return err("Solo puedes cargar gastos a tu propia sucursal.");
    if (!categoriasDe(d).some((c) => c.id === g.categoria)) return err("Elige la categoría del gasto.");
    if (!(num(g.monto) > 0)) return err("El monto del gasto debe ser mayor que cero.");
  }
  return ok({ u, pv, tipo, total, partidas });
}

/**
 * Confirma la captura: crea la nota de compra, la cuenta por pagar y, si se pide, la entrada al inventario (PEPS) y un gasto.
 * Exige `confirmado: true` (la persona revisó): la IA nunca registra sola. Rechaza duplicados salvo `permitirDuplicado`.
 */
export function confirmarNotaCompra(d, datos) {
  if (datos.confirmado !== true) return err("La lectura de la IA es solo una captura previa: revísala y confirma para registrarla.");
  const v = validarNota(d, datos); if (!v.ok) return v;
  const { u, pv, tipo, total, partidas } = v;
  const dup = detectarDuplicado(d, datos.proveedorId, datos.folioProveedor);
  if (dup && !datos.permitirDuplicado) return err(`Ya existe una nota de ${pv.nombre} con el folio ${datos.folioProveedor} (${dup.origen === "nota" ? `nota ${dup.folio}` : "cuenta por pagar"}). Si es otra, confirma el duplicado.`);
  const fin = (d.fin ||= { categorias: CATEGORIAS_BASE, gastos: [], recurrentes: [], notasCompra: [] });
  fin.notasCompra ||= [];
  const nc = { id: uid("NC"), folio: `NC-${String(fin.notasCompra.length + 1).padStart(4, "0")}`, tipo, proveedorId: pv.id, folioProveedor: String(datos.folioProveedor).trim(), fecha: datos.fecha, partidas, total, almacenId: datos.almacenId || null, cxpId: null, gastoId: null, foto: datos.foto || null, origen: datos.lectura && datos.lectura.simulado ? "ia_simulada" : "manual", duplicadoConfirmado: !!dup, registradoPor: u.id, sucursalId: d.sesion.sucursalId, creadoEn: ahoraLocal() };
  while (fin.notasCompra.some((x) => x.folio === nc.folio)) nc.folio = `NC-${String(Number(nc.folio.slice(3)) + 1).padStart(4, "0")}`;
  // Cuenta por pagar con vencimiento según los días de crédito del proveedor.
  const cx = { id: uid("CX"), proveedorId: pv.id, doc: nc.folioProveedor, ocId: null, notaId: nc.id, vence: sumarDias(datos.fecha, pv.dias || 0), saldo: total };
  (d.cxp ||= []).push(cx); nc.cxpId = cx.id;
  // Entrada al inventario por capas PEPS (opcional).
  if (nc.almacenId) partidas.forEach((p) => R.entradaCapa(d, nc.almacenId, p.productoId, p.cant, p.costo, nc.folio));
  // Gasto asociado (flete, nota de servicio…) cuando aplica.
  if (datos.gasto) {
    const g = datos.gasto;
    const gasto = { id: uid("GA"), sucursalId: g.sucursalId, fecha: datos.fecha, categoria: g.categoria, concepto: String(g.concepto || `Nota ${nc.folioProveedor} · ${pv.nombre}`).trim(), monto: redondear(num(g.monto)), proveedorId: pv.id, acreedor: "", comprobante: nc.foto, fuente: "nota_ia", notaId: nc.id, registradoPor: u.id, creadoEn: ahoraLocal() };
    fin.gastos.unshift(gasto); nc.gastoId = gasto.id;
  }
  fin.notasCompra.unshift(nc);
  auditar(d, "nota_compra_registrada", "nota_compra", nc.id, `${nc.folio} · ${pv.nombre} · ${nc.folioProveedor} · ${total}${nc.almacenId ? ` · entrada a ${R.nombreAlmacen(d, nc.almacenId)}` : ""}${dup ? " · duplicado confirmado" : ""}`);
  return ok({ nota: nc, cxp: cx });
}
