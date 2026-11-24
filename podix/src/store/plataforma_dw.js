// Dominio «plataforma» · motor del data warehouse (DW). Funciones PURAS sobre el estado `d`, sin core.js
// (lo usa también la semilla: core → seed → dominios → plataforma; importar core aquí crearía un ciclo).
//
// Modelo dimensional en estrella calculado en JavaScript:
//   dw_dim_*   dimensiones (tiempo, sucursal, servicio, producto, podólogo, paciente ANONIMIZADO, forma de pago, categoría de gasto)
//   dw_fact_*  hechos (ventas por partida, pagos, devoluciones, citas, consultas, gastos, asistencia, inventario, histórico mensual)
//   dw_kpi_*   tableros ya agregados (mensual por sucursal, diario, servicio, producto, podólogo, forma de pago, gasto, inventario, pacientes)
// Cada vista es `vista(d, o)` con o = { sucursalIds?: string[]|null, desde?: "YYYY-MM-DD", hasta?: "YYYY-MM-DD" }.
// La carga (ETL) materializa conteos, totales y el tablero mensual en d.dw y los cuadra contra la operación.
// Al migrar a Supabase estas funciones se vuelven vistas SQL con security_invoker; el contrato (nombres y columnas) no cambia.
import { hoy, dia, redondear, diasEntre, sumarDias, parse, ymd, ahoraLocal } from "../lib/format.js";
import * as R from "./reglas.js";

const r2 = redondear;
const pad = (n) => String(n).padStart(2, "0");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const fechaKey = (f) => { const s = String(f); return Number(s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 10)); };
export const mesDe = (f) => String(f).slice(0, 7);
export const mesActualDW = (ref = hoy()) => ref.slice(0, 7);
export function sumarMesesDW(mes, n) {
  const [y, m] = mes.split("-").map(Number);
  const x = new Date(y, m - 1 + n, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}
export const diasDelMesDW = (mes) => { const [y, m] = mes.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const nombreMesDW = (mes) => { const [y, m] = mes.split("-").map(Number); return `${MESES[m - 1]} ${y}`; };

/** Llave anónima estable de un paciente (FNV-1a de su id). El DW nunca expone nombre, teléfono, correo ni domicilio. */
export function claveAnonima(id) {
  let h = 0x811c9dc5;
  const s = `paciente:${id}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `AN-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
export function grupoEdad(nacimiento, ref = hoy()) {
  if (!nacimiento) return "Sin dato";
  const n = parse(nacimiento), r = parse(ref);
  let e = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) e--;
  if (e < 18) return "0-17";
  if (e < 30) return "18-29";
  if (e < 45) return "30-44";
  if (e < 60) return "45-59";
  if (e < 75) return "60-74";
  return "75 o más";
}

const enAlcance = (o, sucursalId, fecha) => {
  if (o && o.sucursalIds && !o.sucursalIds.includes(sucursalId)) return false;
  if (fecha != null && o) {
    const f = dia(fecha);
    if (o.desde && f < o.desde) return false;
    if (o.hasta && f > o.hasta) return false;
  }
  return true;
};
const sucOk = (o, sucursalId) => !(o && o.sucursalIds) || o.sucursalIds.includes(sucursalId);
const rolDe = (d) => { const m = new Map(); (d.usuarios || []).forEach((u) => m.set(u.id, u.rol)); return m; };
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

// ═════════════════════════ Dimensiones
export function dw_dim_tiempo(d, o = {}) {
  const fechas = [];
  (d.ventas || []).forEach((v) => fechas.push(dia(v.fecha)));
  (d.citas || []).forEach((c) => fechas.push(dia(c.inicio)));
  ((d.fin && d.fin.gastos) || []).forEach((g) => fechas.push(dia(g.fecha)));
  (d.hist || []).forEach((h) => fechas.push(`${h.mes}-01`));
  let min = o.desde || fechas.reduce((a, f) => (f < a ? f : a), hoy());
  let max = o.hasta || fechas.reduce((a, f) => (f > a ? f : a), hoy());
  if (max < min) [min, max] = [max, min];
  const filas = [];
  const n = Math.min(1500, diasEntre(min, max));
  for (let i = 0; i <= n; i++) {
    const f = sumarDias(min, i), x = parse(f);
    const jueves = new Date(x); jueves.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));
    const semana = 1 + Math.round(((jueves - new Date(jueves.getFullYear(), 0, 4)) / 86400000 - 3 + ((new Date(jueves.getFullYear(), 0, 4).getDay() + 6) % 7)) / 7);
    filas.push({
      fecha_key: fechaKey(f), fecha: f, anio: x.getFullYear(), trimestre: Math.floor(x.getMonth() / 3) + 1, mes: x.getMonth() + 1, anio_mes: f.slice(0, 7),
      nombre_mes: MESES[x.getMonth()], semana_iso: semana, dia_mes: x.getDate(), dia_semana: ((x.getDay() + 6) % 7) + 1, nombre_dia: DIAS[x.getDay()], fin_de_semana: x.getDay() === 0 || x.getDay() === 6,
    });
  }
  return filas;
}
export function dw_dim_sucursal(d, o = {}) {
  return (d.sucursales || []).filter((s) => sucOk(o, s.id)).map((s) => ({
    sucursal_id: s.id, nombre: s.nombre, activa: s.activa !== false, consultorios: (s.consultorios || []).length,
    ajuste_precio_pct: R.ajustePct(d, s.id, "*", "*"), direccion: s.direccion || "",
  }));
}
export function dw_dim_servicio(d) {
  return (d.servicios || []).map((s) => ({ servicio_id: s.id, nombre: s.nombre, duracion_min: s.duracion, precio_base: s.precioBase, insumos: (s.consumo || []).length, activo: s.activo !== false }));
}
export function dw_dim_producto(d) {
  return (d.productos || []).map((p) => ({ producto_id: p.id, sku: p.sku, nombre: p.nombre, categoria: p.categoria, tipo: p.tipo, precio_base: p.precioBase, costo: p.costo, minimo: p.minimo, activo: p.activo !== false }));
}
export function dw_dim_podologo(d, o = {}) {
  return (d.usuarios || []).filter((u) => u.rol === "podologo" && (!o.sucursalIds || u.sucursales.some((s) => o.sucursalIds.includes(s))))
    .map((u) => ({ podologo_id: u.id, nombre: u.nombre, sucursales: u.sucursales.join(" "), n_sucursales: u.sucursales.length, activo: u.activo !== false }));
}
/** Paciente ANONIMIZADO: sin nombre, teléfono, correo, domicilio ni fecha de nacimiento exacta. */
export function dw_dim_paciente(d, o = {}) {
  return (d.pacientes || []).filter((p) => sucOk(o, p.sucursalAlta)).map((p) => ({
    paciente_key: claveAnonima(p.id), sexo: p.sexo || "", grupo_edad: grupoEdad(p.nacimiento),
    diabetes: (p.alertas || []).some((a) => /diabet/i.test(a)), con_alertas: (p.alertas || []).length > 0, origen: p.origen || "",
    con_convenio: !!p.convenioId, sucursal_alta: p.sucursalAlta || "", menor_con_tutor: !!p.tutor, activo: p.activo !== false,
  }));
}
export function dw_dim_forma_pago(d) {
  const base = ["efectivo", "tarjeta", "transferencia"];
  const vistas = new Set(base);
  (d.ventas || []).forEach((v) => (v.pagos || []).forEach((p) => vistas.add(p.forma)));
  return [...vistas].map((f) => ({ forma_pago: f, nombre: f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, " "), es_caja: f === "efectivo" }));
}
export function dw_dim_categoria_gasto(d) {
  return ((d.fin && d.fin.categorias) || []).map((c) => ({ categoria_id: c.id, nombre: c.nombre, fijo: !!c.fijo, recurrente: !!c.recurrente }));
}

// ═════════════════════════ Hechos
/** Renglón de ticket NO cancelado. El descuento del ticket se prorratea entre sus partidas; la última absorbe los centavos. */
export function dw_fact_ventas(d, o = {}) {
  const rol = rolDe(d), cat = new Map((d.productos || []).map((p) => [p.id, p.categoria]));
  const filas = [];
  const ventas = d.ventas || [];
  for (let k = 0; k < ventas.length; k++) {
    const v = ventas[k];
    if (v.estado === "cancelada" || !enAlcance(o, v.sucursalId, v.fecha)) continue;
    const total = num(v.total), partidas = v.partidas || [];
    let bruto = 0;
    for (let i = 0; i < partidas.length; i++) bruto += num(partidas[i].importe ?? partidas[i].precio * partidas[i].cant);
    const fecha = dia(v.fecha), fk = fechaKey(v.fecha), mes = mesDe(v.fecha);
    const vendedor = v.vendedorId ?? v.cajeroId ?? null, podologo = rol.get(v.vendedorId) === "podologo" ? v.vendedorId : null;
    const pac = v.pacienteId ? claveAnonima(v.pacienteId) : null, tipoVenta = v.tipo || "contado", origen = v.origen || "caja";
    const fila = (renglon, tipo, servicio, producto, categoria, cantidad, b, imp, costo) => ({
      venta_id: v.id, folio: v.folio, renglon, fecha_key: fk, fecha, anio_mes: mes, sucursal_id: v.sucursalId, tipo_partida: tipo, servicio_id: servicio, producto_id: producto, categoria,
      vendedor_id: vendedor, podologo_id: podologo, cajero_id: v.cajeroId ?? null, paciente_key: pac, tipo_venta: tipoVenta, origen,
      cantidad, importe_bruto: b, descuento: r2(b - imp), importe: imp, costo, margen: r2(imp - costo),
    });
    if (!partidas.length || !(bruto > 0)) { filas.push(fila(1, "otro", null, null, "Otros", 1, r2(total), r2(total), 0)); continue; }
    const factor = total / bruto;
    let acum = 0;
    for (let i = 0; i < partidas.length; i++) {
      const p = partidas[i];
      const b = r2(num(p.importe ?? p.precio * p.cant));
      const imp = i === partidas.length - 1 ? r2(total - acum) : r2(b * factor);
      acum = r2(acum + imp);
      const costo = p.tipo === "producto" ? r2(num(p.costo) * num(p.cant)) : 0;
      const categoria = p.tipo === "servicio" ? "Servicios" : p.tipo === "producto" ? cat.get(p.itemId) || "Sin categoría" : p.tipo === "envio" ? "Envíos" : "Otros";
      filas.push(fila(i + 1, p.tipo, p.tipo === "servicio" ? p.itemId : null, p.tipo === "producto" ? p.itemId : null, categoria, num(p.cant), b, imp, costo));
    }
  }
  return filas;
}
export function dw_fact_pagos(d, o = {}) {
  const filas = [];
  (d.ventas || []).forEach((v) => {
    if (v.estado === "cancelada" || !enAlcance(o, v.sucursalId, v.fecha)) return;
    (v.pagos || []).forEach((p, i) => filas.push({ venta_id: v.id, renglon: i + 1, fecha_key: fechaKey(v.fecha), fecha: dia(v.fecha), anio_mes: mesDe(v.fecha), sucursal_id: v.sucursalId, forma_pago: p.forma, monto: r2(num(p.monto)) }));
  });
  return filas;
}
/** Devoluciones vigentes (no rechazadas ni canceladas); se restan el día en que ocurren (misma regla que el consolidado). */
export function dw_fact_devoluciones(d, o = {}) {
  const suc = new Map((d.ventas || []).map((v) => [v.id, v.sucursalId]));
  return (d.devoluciones || []).filter((x) => !["rechazada", "cancelada"].includes(x.estado) && x.fecha)
    .map((x) => ({ devolucion_id: x.id, folio: x.folio || x.id, fecha_key: fechaKey(x.fecha), fecha: dia(x.fecha), anio_mes: mesDe(x.fecha), sucursal_id: x.sucursalId || suc.get(x.ventaId) || null, venta_id: x.ventaId || null, motivo: x.motivo || "", monto: r2(num(x.monto ?? x.total ?? x.importe)) }))
    .filter((x) => enAlcance(o, x.sucursal_id, x.fecha));
}
export function dw_fact_citas(d, o = {}) {
  return (d.citas || []).filter((c) => enAlcance(o, c.sucursalId, c.inicio)).map((c) => ({
    cita_id: c.id, fecha_key: fechaKey(c.inicio), fecha: dia(c.inicio), anio_mes: mesDe(c.inicio), hora: String(c.inicio).slice(11, 13), sucursal_id: c.sucursalId, servicio_id: c.servicioId,
    podologo_id: c.podologoId, paciente_key: c.pacienteId ? claveAnonima(c.pacienteId) : null, estado: c.estado, a_domicilio: !!c.aDomicilio,
    citas: 1, atendidas: c.estado === "atendida" ? 1 : 0, no_asistio: c.estado === "no_asistio" ? 1 : 0, canceladas: c.estado === "cancelada" ? 1 : 0, duracion_min: num(c.duracion),
  }));
}
/** Consulta clínica. Sin texto clínico: el diagnóstico solo cuenta como «con diagnóstico». */
export function dw_fact_consultas(d, o = {}) {
  return (d.consultas || []).filter((c) => enAlcance(o, c.sucursalId, c.fecha)).map((c) => ({
    consulta_id: c.id, fecha_key: fechaKey(c.fecha), fecha: dia(c.fecha), anio_mes: mesDe(c.fecha), sucursal_id: c.sucursalId, podologo_id: c.podologoId,
    paciente_key: c.pacienteId ? claveAnonima(c.pacienteId) : null, estado: c.estado, consultas: 1, cobrada: c.estado === "cobrada" ? 1 : 0,
    con_diagnostico: c.diagnostico ? 1 : 0, servicios: (c.servicios || []).reduce((a, s) => a + num(s.cant || 1), 0), insumos: (c.consumo || []).reduce((a, s) => a + num(s.cant), 0),
  }));
}
export function dw_fact_gastos(d, o = {}) {
  return ((d.fin && d.fin.gastos) || []).filter((g) => g.estado !== "eliminado" && !g.eliminado && enAlcance(o, g.sucursalId, g.fecha)).map((g) => ({
    gasto_id: g.id, fecha_key: fechaKey(g.fecha), fecha: dia(g.fecha), anio_mes: mesDe(g.fecha), sucursal_id: g.sucursalId, categoria_id: g.categoria, fuente: g.fuente || "manual", proveedor_id: g.proveedorId || null, monto: r2(num(g.monto)),
  }));
}
const aMin = (h) => { const [a, b] = String(h || "0:0").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
export function dw_fact_asistencia(d, o = {}) {
  const emp = new Map(((d.rh && d.rh.empleados) || []).map((e) => [e.id, e]));
  return ((d.rh && d.rh.asistencia) || []).filter((a) => enAlcance(o, a.sucursalId, a.fecha)).map((a) => ({
    asistencia_id: a.id, fecha_key: fechaKey(a.fecha), fecha: a.fecha, anio_mes: mesDe(a.fecha), sucursal_id: a.sucursalId, empleado_id: a.empleadoId, rol: (emp.get(a.empleadoId) || {}).rol || "",
    estado: a.estado, registros: 1, presentes: a.entrada ? 1 : 0, retardos: a.estado === "retardo" ? 1 : 0, faltas: a.estado === "falta" ? 1 : 0, minutos_tarde: num(a.minutosTarde),
    minutos_trabajados: a.entrada && a.salida ? Math.max(0, aMin(a.salida) - aMin(a.entrada)) : 0,
  }));
}
/** Foto de existencias (no tiene historia): una fila por almacén × producto con existencia. Valuación a costo PEPS de sus capas. */
export function dw_fact_inventario(d, o = {}) {
  const prod = new Map((d.productos || []).map((p) => [p.id, p])), g = new Map();
  (d.capas || []).forEach((c) => {
    if (o.sucursalIds && !o.sucursalIds.includes(c.almacenId)) return;
    const k = `${c.almacenId}|${c.productoId}`;
    const x = g.get(k) || { almacen_id: c.almacenId, producto_id: c.productoId, capas: 0, existencia: 0, valuacion: 0 };
    x.capas += 1; x.existencia += num(c.cant); x.valuacion += num(c.cant) * num(c.costo);
    g.set(k, x);
  });
  return [...g.values()].map((x) => {
    const p = prod.get(x.producto_id) || {};
    return { ...x, categoria: p.categoria || "Sin categoría", tipo: p.tipo || "", minimo: x.almacen_id === "CEN" ? 0 : num(p.minimo), valuacion: r2(x.valuacion), costo_promedio: x.existencia ? r2(x.valuacion / x.existencia) : 0, bajo_minimo: x.almacen_id !== "CEN" && x.existencia < num(p.minimo) ? 1 : 0 };
  });
}
/** Meses cerrados (d.hist): no hay tickets de esos meses, solo el resumen mensual por sucursal. */
export function dw_fact_historico(d, o = {}) {
  return (d.hist || []).filter((h) => sucOk(o, h.sucursalId)).map((h) => ({
    anio_mes: h.mes, sucursal_id: h.sucursalId, servicios: num(h.servicios), plantillas: num(h.plantillas), productos: num(h.productos),
    ingresos: r2(num(h.servicios) + num(h.plantillas) + num(h.productos)), costo: num(h.costo), pacientes: num(h.pacientes),
  }));
}

// ═════════════════════════ Agregación
const agrupar = (filas, clave, ini, sumar) => {
  const m = new Map();
  filas.forEach((f) => { const k = clave(f); let x = m.get(k); if (!x) { x = ini(f); m.set(k, x); } sumar(x, f); });
  return [...m.values()];
};
const pct = (a, b) => (b ? r2((a / b) * 100) : 0);

/** Construye TODAS las tablas del DW de una sola pasada (dimensiones, hechos y tableros). */
export function construirDW(d, o = {}) {
  const T = {};
  T.dw_dim_tiempo = dw_dim_tiempo(d, o);
  T.dw_dim_sucursal = dw_dim_sucursal(d, o);
  T.dw_dim_servicio = dw_dim_servicio(d);
  T.dw_dim_producto = dw_dim_producto(d);
  T.dw_dim_podologo = dw_dim_podologo(d, o);
  T.dw_dim_paciente = dw_dim_paciente(d, o);
  T.dw_dim_forma_pago = dw_dim_forma_pago(d);
  if (d.fin) T.dw_dim_categoria_gasto = dw_dim_categoria_gasto(d);
  T.dw_fact_ventas = dw_fact_ventas(d, o);
  T.dw_fact_pagos = dw_fact_pagos(d, o);
  T.dw_fact_devoluciones = dw_fact_devoluciones(d, o);
  T.dw_fact_citas = dw_fact_citas(d, o);
  T.dw_fact_consultas = dw_fact_consultas(d, o);
  if (d.fin) T.dw_fact_gastos = dw_fact_gastos(d, o);
  if (d.rh) T.dw_fact_asistencia = dw_fact_asistencia(d, o);
  T.dw_fact_inventario = dw_fact_inventario(d, o);
  T.dw_fact_historico = dw_fact_historico(d, o);
  Object.assign(T, construirKPIs(d, T));
  return T;
}

/** Tableros (dw_kpi_*) a partir de los hechos ya construidos. */
export function construirKPIs(d, T) {
  const K = {};
  const nomSuc = new Map((d.sucursales || []).map((s) => [s.id, s.nombre]));
  const nomSv = new Map((d.servicios || []).map((s) => [s.id, s.nombre]));
  const prod = new Map((d.productos || []).map((p) => [p.id, p]));
  const nomUsr = new Map((d.usuarios || []).map((u) => [u.id, u.nombre]));
  const V = T.dw_fact_ventas, C = T.dw_fact_citas, G = T.dw_fact_gastos || [], DV = T.dw_fact_devoluciones, CO = T.dw_fact_consultas;

  // dw_kpi_diario: día × sucursal
  const diario = new Map();
  const dd = (fecha, suc) => { const k = `${fecha}|${suc}`; let x = diario.get(k); if (!x) { x = { fecha, fecha_key: fechaKey(fecha), anio_mes: fecha.slice(0, 7), sucursal_id: suc, ventas: 0, devoluciones: 0, costo: 0, tickets: new Set(), citas: 0, atendidas: 0, no_asistio: 0, canceladas: 0, consultas: 0, gastos: 0 }; diario.set(k, x); } return x; };
  V.forEach((f) => { const x = dd(f.fecha, f.sucursal_id); x.ventas += f.importe; x.costo += f.costo; x.tickets.add(f.venta_id); });
  DV.forEach((f) => { dd(f.fecha, f.sucursal_id).devoluciones += f.monto; });
  C.forEach((f) => { const x = dd(f.fecha, f.sucursal_id); x.citas += 1; x.atendidas += f.atendidas; x.no_asistio += f.no_asistio; x.canceladas += f.canceladas; });
  CO.forEach((f) => { dd(f.fecha, f.sucursal_id).consultas += 1; });
  G.forEach((f) => { dd(f.fecha, f.sucursal_id).gastos += f.monto; });
  K.dw_kpi_diario = [...diario.values()];
  K.dw_kpi_diario.forEach((x) => { x.ventas = r2(x.ventas); x.devoluciones = r2(x.devoluciones); x.ventas_netas = r2(x.ventas - x.devoluciones); x.costo = r2(x.costo); x.gastos = r2(x.gastos); x.tickets = x.tickets.size; });
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  K.dw_kpi_diario.sort((a, b) => cmp(a.fecha, b.fecha) || cmp(String(a.sucursal_id), String(b.sucursal_id)));

  // dw_kpi_mensual_sucursal: mes × sucursal. Meses cerrados: del histórico (d.hist). Meses con tickets: de los hechos.
  const mens = new Map();
  const mm = (mes, suc) => { const k = `${mes}|${suc}`; let x = mens.get(k); if (!x) { x = { anio_mes: mes, sucursal_id: suc, sucursal: nomSuc.get(suc) || suc, fuente: "operación", ventas: 0, devoluciones: 0, costo: 0, tickets: 0, citas: 0, atendidas: 0, no_asistio: 0, canceladas: 0, consultas: 0, gastos: 0, pacientes: 0 }; mens.set(k, x); } return x; };
  const pacMes = new Map();
  K.dw_kpi_diario.forEach((f) => { if (!f.sucursal_id) return; const x = mm(f.anio_mes, f.sucursal_id); ["ventas", "devoluciones", "costo", "tickets", "citas", "atendidas", "no_asistio", "canceladas", "consultas", "gastos"].forEach((k) => { x[k] += f[k]; }); });
  CO.forEach((f) => { const k = `${f.anio_mes}|${f.sucursal_id}`; (pacMes.get(k) || pacMes.set(k, new Set()).get(k)).add(f.paciente_key); });
  pacMes.forEach((s, k) => { const [mes, suc] = k.split("|"); mm(mes, suc).pacientes = s.size; });
  T.dw_fact_historico.forEach((h) => {
    const x = mm(h.anio_mes, h.sucursal_id);
    if (x.tickets) return; // si ya hay tickets de ese mes, mandan los tickets (no se suma dos veces)
    x.fuente = "histórico"; x.ventas = h.ingresos; x.costo = h.costo; x.pacientes = h.pacientes;
  });
  K.dw_kpi_mensual_sucursal = [...mens.values()].map((x) => {
    const netas = r2(x.ventas - x.devoluciones);
    return { ...x, ventas: r2(x.ventas), devoluciones: r2(x.devoluciones), ventas_netas: netas, costo: r2(x.costo), gastos: r2(x.gastos), ticket_promedio: x.tickets ? r2(x.ventas / x.tickets) : 0,
      no_show_pct: pct(x.no_asistio, x.citas - x.canceladas), margen_bruto: r2(netas - x.costo), resultado: r2(netas - x.costo - x.gastos) };
  }).sort((a, b) => a.anio_mes.localeCompare(b.anio_mes) || a.sucursal_id.localeCompare(b.sucursal_id));

  K.dw_kpi_servicio = agrupar(V.filter((f) => f.servicio_id), (f) => `${f.anio_mes}|${f.sucursal_id}|${f.servicio_id}`,
    (f) => ({ anio_mes: f.anio_mes, sucursal_id: f.sucursal_id, servicio_id: f.servicio_id, servicio: nomSv.get(f.servicio_id) || f.servicio_id, unidades: 0, ventas: 0, descuentos: 0 }),
    (x, f) => { x.unidades += f.cantidad; x.ventas = r2(x.ventas + f.importe); x.descuentos = r2(x.descuentos + f.descuento); });
  K.dw_kpi_producto = agrupar(V.filter((f) => f.producto_id), (f) => `${f.anio_mes}|${f.sucursal_id}|${f.producto_id}`,
    (f) => ({ anio_mes: f.anio_mes, sucursal_id: f.sucursal_id, producto_id: f.producto_id, producto: (prod.get(f.producto_id) || {}).nombre || f.producto_id, categoria: f.categoria, unidades: 0, ventas: 0, costo: 0, margen: 0 }),
    (x, f) => { x.unidades += f.cantidad; x.ventas = r2(x.ventas + f.importe); x.costo = r2(x.costo + f.costo); x.margen = r2(x.margen + f.margen); });
  const pod = new Map();
  const pp = (mes, id) => { const k = `${mes}|${id}`; let x = pod.get(k); if (!x) { x = { anio_mes: mes, podologo_id: id, podologo: nomUsr.get(id) || id, citas: 0, atendidas: 0, no_asistio: 0, minutos: 0, ventas: 0, tickets: new Set() }; pod.set(k, x); } return x; };
  C.forEach((f) => { const x = pp(f.anio_mes, f.podologo_id); x.citas += 1; x.atendidas += f.atendidas; x.no_asistio += f.no_asistio; if (f.atendidas) x.minutos += f.duracion_min; });
  V.forEach((f) => { if (!f.podologo_id) return; const x = pp(f.anio_mes, f.podologo_id); x.ventas += f.importe; x.tickets.add(f.venta_id); });
  K.dw_kpi_podologo = [...pod.values()].map((x) => ({ ...x, ventas: r2(x.ventas), tickets: x.tickets.size, no_show_pct: pct(x.no_asistio, x.citas), venta_por_atendida: x.atendidas ? r2(x.ventas / x.atendidas) : 0 }));
  K.dw_kpi_forma_pago = agrupar(T.dw_fact_pagos, (f) => `${f.anio_mes}|${f.sucursal_id}|${f.forma_pago}`,
    (f) => ({ anio_mes: f.anio_mes, sucursal_id: f.sucursal_id, forma_pago: f.forma_pago, pagos: 0, monto: 0 }), (x, f) => { x.pagos += 1; x.monto = r2(x.monto + f.monto); });
  if (T.dw_fact_gastos) {
    const nomCat = new Map((T.dw_dim_categoria_gasto || []).map((c) => [c.categoria_id, c.nombre]));
    K.dw_kpi_gasto_categoria = agrupar(G, (f) => `${f.anio_mes}|${f.sucursal_id}|${f.categoria_id}`,
      (f) => ({ anio_mes: f.anio_mes, sucursal_id: f.sucursal_id, categoria_id: f.categoria_id, categoria: nomCat.get(f.categoria_id) || f.categoria_id, gastos: 0, monto: 0 }), (x, f) => { x.gastos += 1; x.monto = r2(x.monto + f.monto); });
  }
  if (T.dw_fact_asistencia) {
    K.dw_kpi_asistencia = agrupar(T.dw_fact_asistencia, (f) => `${f.anio_mes}|${f.sucursal_id}`,
      (f) => ({ anio_mes: f.anio_mes, sucursal_id: f.sucursal_id, registros: 0, presentes: 0, retardos: 0, faltas: 0, minutos_tarde: 0, horas_trabajadas: 0 }),
      (x, f) => { x.registros += 1; x.presentes += f.presentes; x.retardos += f.retardos; x.faltas += f.faltas; x.minutos_tarde += f.minutos_tarde; x.horas_trabajadas = r2(x.horas_trabajadas + f.minutos_trabajados / 60); })
      .map((x) => ({ ...x, puntualidad_pct: pct(x.presentes - x.retardos, x.presentes) }));
  }
  K.dw_kpi_inventario = agrupar(T.dw_fact_inventario, (f) => `${f.almacen_id}|${f.categoria}`,
    (f) => ({ almacen_id: f.almacen_id, categoria: f.categoria, productos: 0, existencia: 0, valuacion: 0, bajo_minimo: 0 }),
    (x, f) => { x.productos += 1; x.existencia += f.existencia; x.valuacion = r2(x.valuacion + f.valuacion); x.bajo_minimo += f.bajo_minimo; });
  K.dw_kpi_pacientes = agrupar(T.dw_dim_paciente, (f) => `${f.grupo_edad}|${f.sexo}|${f.diabetes}|${f.origen}`,
    (f) => ({ grupo_edad: f.grupo_edad, sexo: f.sexo, diabetes: f.diabetes, origen: f.origen, pacientes: 0 }), (x) => { x.pacientes += 1; });
  return K;
}

// ═════════════════════════ Diccionario del DW (consultable en pantalla; es el contrato para BI)
export const DW_CATALOGO = [
  { objeto: "dw_dim_tiempo", tipo: "dimensión", grano: "día", llaves: "fecha_key (AAAAMMDD)", descripcion: "Calendario: año, trimestre, mes, semana ISO, día de la semana y fin de semana.", columnas: [["fecha_key", "Llave entera AAAAMMDD; une con todos los hechos"], ["anio_mes", "AAAA-MM"], ["semana_iso", "Semana ISO 8601"], ["dia_semana", "1 = lunes … 7 = domingo"], ["fin_de_semana", "Sábado o domingo"]] },
  { objeto: "dw_dim_sucursal", tipo: "dimensión", grano: "sucursal", llaves: "sucursal_id", descripcion: "Las sucursales de la cadena, con su ajuste general de precio.", columnas: [["sucursal_id", "S1…S7"], ["consultorios", "Número de consultorios"], ["ajuste_precio_pct", "Ajuste % general sobre la lista base"]] },
  { objeto: "dw_dim_servicio", tipo: "dimensión", grano: "servicio", llaves: "servicio_id", descripcion: "Catálogo de servicios clínicos con duración y precio de lista.", columnas: [["duracion_min", "Duración estándar en minutos"], ["precio_base", "Precio de lista (antes del ajuste de sucursal)"], ["insumos", "Insumos que consume por receta"]] },
  { objeto: "dw_dim_producto", tipo: "dimensión", grano: "producto", llaves: "producto_id", descripcion: "Catálogo de productos de venta e insumos.", columnas: [["tipo", "venta | insumo"], ["costo", "Costo de catálogo (el costo real de salida es PEPS por capa)"], ["minimo", "Existencia mínima por sucursal"]] },
  { objeto: "dw_dim_podologo", tipo: "dimensión", grano: "podólogo", llaves: "podologo_id", descripcion: "Podólogos y las sucursales entre las que rotan.", columnas: [["sucursales", "Sucursales asignadas"], ["n_sucursales", "Cuántas"]] },
  { objeto: "dw_dim_paciente", tipo: "dimensión", grano: "paciente (ANONIMIZADO)", llaves: "paciente_key", descripcion: "Perfil sin datos personales: no trae nombre, teléfono, correo, domicilio ni fecha de nacimiento; la edad va en rangos y la llave es un seudónimo irreversible.", columnas: [["paciente_key", "Seudónimo estable (no es el expediente)"], ["grupo_edad", "0-17, 18-29, 30-44, 45-59, 60-74, 75 o más"], ["diabetes", "Tiene alerta de diabetes"], ["origen", "Canal por el que llegó"], ["con_convenio", "Pertenece a un convenio"]] },
  { objeto: "dw_dim_forma_pago", tipo: "dimensión", grano: "forma de pago", llaves: "forma_pago", descripcion: "Efectivo, tarjeta, transferencia y las que aparezcan en los tickets.", columnas: [["es_caja", "Es dinero físico de caja"]] },
  { objeto: "dw_dim_categoria_gasto", tipo: "dimensión", grano: "categoría de gasto", llaves: "categoria_id", requiere: "fin", descripcion: "Rubros de gasto de operación (del módulo de Finanzas).", columnas: [["fijo", "Gasto fijo"], ["recurrente", "Se genera cada mes"]] },
  { objeto: "dw_fact_ventas", tipo: "hecho", grano: "renglón de ticket no cancelado", llaves: "venta_id + renglon · fecha_key · sucursal_id · servicio_id · producto_id · podologo_id · paciente_key", descripcion: "Ventas por partida. El descuento del ticket se prorratea entre sus partidas, así Σ importe = Σ total de los tickets.", columnas: [["importe_bruto", "Precio × cantidad antes de descuento"], ["descuento", "Parte del descuento del ticket que le toca al renglón"], ["importe", "Importe neto del renglón"], ["costo", "Costo PEPS del producto vendido (0 en servicios)"], ["margen", "importe − costo"], ["podologo_id", "Solo si quien vendió es podólogo"], ["origen", "caja | pedido_web"]] },
  { objeto: "dw_fact_pagos", tipo: "hecho", grano: "pago de un ticket", llaves: "venta_id + renglon · fecha_key · sucursal_id · forma_pago", descripcion: "Cada pago (un ticket puede tener pago mixto).", columnas: [["monto", "Importe pagado con esa forma, ya sin el cambio"]] },
  { objeto: "dw_fact_devoluciones", tipo: "hecho", grano: "devolución vigente", llaves: "devolucion_id · fecha_key · sucursal_id · venta_id", descripcion: "Devoluciones no rechazadas; restan a la venta el día en que ocurren.", columnas: [["monto", "Importe devuelto"]] },
  { objeto: "dw_fact_citas", tipo: "hecho", grano: "cita", llaves: "cita_id · fecha_key · sucursal_id · servicio_id · podologo_id · paciente_key", descripcion: "Agenda: cada cita con su estado.", columnas: [["atendidas", "1 si se atendió"], ["no_asistio", "1 si el paciente no llegó"], ["canceladas", "1 si se canceló"], ["duracion_min", "Duración programada"]] },
  { objeto: "dw_fact_consultas", tipo: "hecho", grano: "consulta clínica", llaves: "consulta_id · fecha_key · sucursal_id · podologo_id · paciente_key", descripcion: "Consultas atendidas. No trae texto clínico: el diagnóstico solo cuenta.", columnas: [["cobrada", "1 si ya pasó por caja"], ["con_diagnostico", "1 si tiene diagnóstico capturado"], ["insumos", "Piezas de insumo consumidas"]] },
  { objeto: "dw_fact_gastos", tipo: "hecho", grano: "gasto de operación", llaves: "gasto_id · fecha_key · sucursal_id · categoria_id", requiere: "fin", descripcion: "Gastos capturados por sucursal (Finanzas).", columnas: [["monto", "Importe del gasto"], ["fuente", "manual | nota_ia | recurrente"]] },
  { objeto: "dw_fact_asistencia", tipo: "hecho", grano: "persona × día", llaves: "asistencia_id · fecha_key · sucursal_id · empleado_id", requiere: "rh", descripcion: "Registro del checador (Personas).", columnas: [["retardos", "1 si llegó después de la tolerancia"], ["faltas", "1 si faltó"], ["minutos_trabajados", "Salida − entrada"]] },
  { objeto: "dw_fact_inventario", tipo: "hecho", grano: "almacén × producto (foto actual)", llaves: "almacen_id · producto_id", descripcion: "Existencias de hoy a costo PEPS. Es una foto: no guarda historia.", columnas: [["existencia", "Piezas en las capas"], ["valuacion", "Σ cantidad × costo de cada capa"], ["bajo_minimo", "1 si la existencia es menor al mínimo"]] },
  { objeto: "dw_fact_historico", tipo: "hecho", grano: "sucursal × mes cerrado", llaves: "anio_mes · sucursal_id", descripcion: "Resumen mensual de los 12 meses anteriores (no hay tickets de esos meses).", columnas: [["ingresos", "servicios + plantillas + productos"], ["costo", "Producto vendido + laboratorio"], ["pacientes", "Pacientes atendidos en el mes"]] },
  { objeto: "dw_kpi_mensual_sucursal", tipo: "tablero", grano: "mes × sucursal", llaves: "anio_mes · sucursal_id", descripcion: "Consolidado mensual: ventas, devoluciones, tickets, citas, no-show, gastos y resultado. Meses cerrados salen del histórico.", columnas: [["ventas_netas", "ventas − devoluciones"], ["ticket_promedio", "ventas ÷ tickets"], ["no_show_pct", "100 × no asistió ÷ (citas − canceladas)"], ["margen_bruto", "ventas netas − costo"], ["resultado", "margen bruto − gastos (sin nómina; el formal es el Estado de resultados)"], ["fuente", "operación | histórico"]] },
  { objeto: "dw_kpi_diario", tipo: "tablero", grano: "día × sucursal", llaves: "fecha_key · sucursal_id", descripcion: "Serie diaria de ventas, tickets, citas, consultas y gastos.", columnas: [["ventas_netas", "ventas − devoluciones del día"]] },
  { objeto: "dw_kpi_servicio", tipo: "tablero", grano: "mes × sucursal × servicio", llaves: "anio_mes · sucursal_id · servicio_id", descripcion: "Unidades y venta por servicio.", columnas: [["descuentos", "Descuento prorrateado"]] },
  { objeto: "dw_kpi_producto", tipo: "tablero", grano: "mes × sucursal × producto", llaves: "anio_mes · sucursal_id · producto_id", descripcion: "Unidades, venta, costo y margen por producto.", columnas: [["margen", "ventas − costo PEPS"]] },
  { objeto: "dw_kpi_podologo", tipo: "tablero", grano: "mes × podólogo", llaves: "anio_mes · podologo_id", descripcion: "Productividad: citas, atendidas, no-show y venta atribuida.", columnas: [["venta_por_atendida", "ventas ÷ citas atendidas"]] },
  { objeto: "dw_kpi_forma_pago", tipo: "tablero", grano: "mes × sucursal × forma de pago", llaves: "anio_mes · sucursal_id · forma_pago", descripcion: "Mezcla de medios de pago.", columnas: [["monto", "Σ pagos"]] },
  { objeto: "dw_kpi_gasto_categoria", tipo: "tablero", grano: "mes × sucursal × categoría", llaves: "anio_mes · sucursal_id · categoria_id", requiere: "fin", descripcion: "Gasto por rubro.", columnas: [["monto", "Σ gastos"]] },
  { objeto: "dw_kpi_asistencia", tipo: "tablero", grano: "mes × sucursal", llaves: "anio_mes · sucursal_id", requiere: "rh", descripcion: "Puntualidad y horas trabajadas.", columnas: [["puntualidad_pct", "100 × (presentes − retardos) ÷ presentes"]] },
  { objeto: "dw_kpi_inventario", tipo: "tablero", grano: "almacén × categoría", llaves: "almacen_id · categoria", descripcion: "Existencia, valuación y productos bajo mínimo.", columnas: [["valuacion", "A costo PEPS"]] },
  { objeto: "dw_kpi_pacientes", tipo: "tablero", grano: "perfil", llaves: "grupo_edad · sexo · diabetes · origen", descripcion: "Pacientes por perfil anónimo.", columnas: [["pacientes", "Conteo"]] },
];
export const DW_METRICAS = [
  { metrica: "ventas", formula: "Σ importe de los renglones de tickets no cancelados", fuente: "dw_fact_ventas", unidad: "MXN" },
  { metrica: "ventas_netas", formula: "ventas − devoluciones vigentes del periodo", fuente: "dw_fact_ventas, dw_fact_devoluciones", unidad: "MXN" },
  { metrica: "tickets", formula: "conteo distinto de venta_id", fuente: "dw_fact_ventas", unidad: "tickets" },
  { metrica: "ticket_promedio", formula: "ventas ÷ tickets", fuente: "dw_kpi_mensual_sucursal", unidad: "MXN" },
  { metrica: "margen_bruto", formula: "ventas netas − costo PEPS del producto vendido", fuente: "dw_fact_ventas", unidad: "MXN" },
  { metrica: "gastos", formula: "Σ monto de gastos de operación", fuente: "dw_fact_gastos", unidad: "MXN" },
  { metrica: "resultado", formula: "margen bruto − gastos (no incluye nómina ni comisiones)", fuente: "dw_kpi_mensual_sucursal", unidad: "MXN" },
  { metrica: "citas / atendidas / no_asistio", formula: "conteo por estado de la cita", fuente: "dw_fact_citas", unidad: "citas" },
  { metrica: "no_show_pct", formula: "100 × no asistió ÷ (citas − canceladas)", fuente: "dw_fact_citas", unidad: "%" },
  { metrica: "consultas", formula: "conteo de consultas clínicas", fuente: "dw_fact_consultas", unidad: "consultas" },
  { metrica: "puntualidad_pct", formula: "100 × (presentes − retardos) ÷ presentes", fuente: "dw_fact_asistencia", unidad: "%" },
  { metrica: "valuacion", formula: "Σ cantidad × costo de cada capa PEPS", fuente: "dw_fact_inventario", unidad: "MXN" },
  { metrica: "bajo_minimo", formula: "productos con existencia < mínimo (no aplica al almacén central)", fuente: "dw_fact_inventario", unidad: "productos" },
];
export const objetosDW = (d) => DW_CATALOGO.filter((o) => !o.requiere || !!d[o.requiere]);

// ═════════════════════════ ETL: carga, totales y cuadre
export const PROCESOS_ETL = [
  { id: "dimensiones", nombre: "Dimensiones", descripcion: "Tiempo, sucursal, servicio, producto, podólogo, paciente anonimizado, forma de pago y categoría de gasto.", prefijo: "dw_dim_" },
  { id: "hechos", nombre: "Hechos", descripcion: "Ventas por partida, pagos, devoluciones, citas, consultas, gastos, asistencia, inventario e histórico mensual.", prefijo: "dw_fact_" },
  { id: "kpis", nombre: "Tableros (KPIs)", descripcion: "Agregados mensuales, diarios y por servicio, producto, podólogo, forma de pago, gasto e inventario.", prefijo: "dw_kpi_" },
  { id: "cuadre", nombre: "Cuadre contra la operación", descripcion: "Totales del DW recién cargado contra los totales operativos (tickets, pagos, gastos, citas, inventario).", prefijo: null },
];
const suma = (a, k) => r2(a.reduce((s, x) => s + num(x[k]), 0));
const hasta = (f, corte) => !corte || dia(f) <= corte;

/** Totales que el DW dice tener (sumando sus tablas de hechos). */
export function totalesDW(T) {
  const t = {
    ventas: suma(T.dw_fact_ventas, "importe"), tickets: new Set(T.dw_fact_ventas.map((f) => f.venta_id)).size, pagos: suma(T.dw_fact_pagos, "monto"),
    devoluciones: suma(T.dw_fact_devoluciones, "monto"), citas: T.dw_fact_citas.length, consultas: T.dw_fact_consultas.length,
    valuacion: suma(T.dw_fact_inventario, "valuacion"), existencia: suma(T.dw_fact_inventario, "existencia"),
  };
  if (T.dw_fact_gastos) t.gastos = suma(T.dw_fact_gastos, "monto");
  if (T.dw_fact_asistencia) t.asistencia = T.dw_fact_asistencia.length;
  return t;
}
/** Totales OPERATIVOS: sumas directas sobre las colecciones de `d` (camino independiente del que arma los hechos). */
export function totalesOperativos(d, corte = null) {
  const vv = (d.ventas || []).filter((v) => v.estado !== "cancelada" && hasta(v.fecha, corte));
  const t = {
    ventas: r2(vv.reduce((a, v) => a + num(v.total), 0)), tickets: vv.length,
    pagos: r2(vv.reduce((a, v) => a + (v.pagos || []).reduce((b, p) => b + num(p.monto), 0), 0)),
    devoluciones: r2((d.devoluciones || []).filter((x) => !["rechazada", "cancelada"].includes(x.estado) && x.fecha && hasta(x.fecha, corte)).reduce((a, x) => a + num(x.monto ?? x.total ?? x.importe), 0)),
    citas: (d.citas || []).filter((c) => hasta(c.inicio, corte)).length, consultas: (d.consultas || []).filter((c) => hasta(c.fecha, corte)).length,
    valuacion: r2((d.almacenes || []).reduce((a, al) => a + R.valuacion(d, al.id), 0)),
    existencia: r2((d.capas || []).reduce((a, c) => a + num(c.cant), 0)),
  };
  if (d.fin) t.gastos = r2((d.fin.gastos || []).filter((g) => g.estado !== "eliminado" && !g.eliminado && hasta(g.fecha, corte)).reduce((a, g) => a + num(g.monto), 0));
  if (d.rh) t.asistencia = (d.rh.asistencia || []).filter((a) => hasta(a.fecha, corte)).length;
  return t;
}
export const ETIQUETAS_CUADRE = {
  ventas: ["Ventas (Σ total de tickets no cancelados)", "MXN"], tickets: ["Tickets", "n"], pagos: ["Pagos recibidos en tickets", "MXN"], devoluciones: ["Devoluciones", "MXN"],
  gastos: ["Gastos de operación", "MXN"], citas: ["Citas", "n"], consultas: ["Consultas", "n"], valuacion: ["Valuación de inventario (PEPS)", "MXN"], existencia: ["Piezas en inventario", "n"], asistencia: ["Registros de asistencia", "n"],
};
/** Compara dos juegos de totales. diferencia = DW − operativo. */
export function compararTotales(dw, op) {
  return Object.keys(ETIQUETAS_CUADRE).filter((k) => k in dw || k in op).map((k) => {
    const a = num(dw[k]), b = num(op[k]), dif = r2(a - b);
    return { clave: k, etiqueta: ETIQUETAS_CUADRE[k][0], unidad: ETIQUETAS_CUADRE[k][1], dw: a, operativo: b, diferencia: dif, ok: Math.abs(dif) < 0.005 };
  });
}

/**
 * Ejecuta la carga completa del DW sobre `d` (lo MUTA: d.dw). Recalcula de verdad todas las tablas, mide la duración de cada
 * proceso, guarda conteos, totales y el tablero mensual, cuadra contra la operación y registra la corrida.
 *   o = { origen: "manual"|"semilla", corte: "YYYY-MM-DD"|null (carga con corte histórico), ts, usuarioId, sucursalId }
 */
export function ejecutarETL(d, o = {}) {
  const reloj = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const corte = o.corte || null, filtro = corte ? { hasta: corte } : {};
  const dw = (d.dw ||= { corridas: [], tablas: {}, resumen: null });
  const procesos = [], ts = o.ts || ahoraLocal();
  const medir = (id, fn) => {
    const t0 = reloj();
    let estado = "ok", error = null, r = null;
    try { r = fn(); } catch (e) { estado = "error"; error = String((e && e.message) || e); }
    const p = PROCESOS_ETL.find((x) => x.id === id);
    procesos.push({ id, nombre: p.nombre, estado, error, ms: Math.max(0, Math.round((reloj() - t0) * 10) / 10), filas: 0, tablas: [] });
    return r;
  };
  const cerrar = (id, tablas) => { const p = procesos.find((x) => x.id === id); p.tablas = Object.entries(tablas || {}).map(([nombre, filas]) => ({ nombre, filas: filas.length })); p.filas = p.tablas.reduce((a, x) => a + x.filas, 0); };
  const T = {};
  const dims = medir("dimensiones", () => ({
    dw_dim_tiempo: dw_dim_tiempo(d, filtro), dw_dim_sucursal: dw_dim_sucursal(d), dw_dim_servicio: dw_dim_servicio(d), dw_dim_producto: dw_dim_producto(d), dw_dim_podologo: dw_dim_podologo(d),
    dw_dim_paciente: dw_dim_paciente(d), dw_dim_forma_pago: dw_dim_forma_pago(d), ...(d.fin ? { dw_dim_categoria_gasto: dw_dim_categoria_gasto(d) } : {}),
  }));
  Object.assign(T, dims); cerrar("dimensiones", dims);
  const hechos = medir("hechos", () => ({
    dw_fact_ventas: dw_fact_ventas(d, filtro), dw_fact_pagos: dw_fact_pagos(d, filtro), dw_fact_devoluciones: dw_fact_devoluciones(d, filtro), dw_fact_citas: dw_fact_citas(d, filtro),
    dw_fact_consultas: dw_fact_consultas(d, filtro), ...(d.fin ? { dw_fact_gastos: dw_fact_gastos(d, filtro) } : {}), ...(d.rh ? { dw_fact_asistencia: dw_fact_asistencia(d, filtro) } : {}),
    dw_fact_inventario: dw_fact_inventario(d), dw_fact_historico: dw_fact_historico(d),
  }));
  Object.assign(T, hechos); cerrar("hechos", hechos);
  const kpis = hechos && dims ? medir("kpis", () => construirKPIs(d, T)) : (medir("kpis", () => { throw new Error("No se cargaron los hechos."); }), null);
  Object.assign(T, kpis); cerrar("kpis", kpis);
  let cuadre = [], totales = null;
  medir("cuadre", () => { totales = totalesDW(T); cuadre = compararTotales(totales, totalesOperativos(d, corte)); });
  const pc = procesos.find((x) => x.id === "cuadre"); pc.filas = cuadre.length;
  const falla = procesos.some((p) => p.estado === "error"), descuadre = cuadre.some((c) => !c.ok);
  if (descuadre && pc.estado === "ok") pc.estado = "alerta";
  const corrida = {
    id: `ETL${String(ts).replace(/\D/g, "")}${dw.corridas.length}`, ts, origen: o.origen || "manual", corte, usuarioId: o.usuarioId ?? null, sucursalId: o.sucursalId ?? null,
    estado: falla ? "error" : descuadre ? "con_alertas" : "ok", duracionMs: Math.round(procesos.reduce((a, p) => a + p.ms, 0) * 10) / 10,
    filas: procesos.filter((p) => p.id !== "cuadre").reduce((a, p) => a + p.filas, 0), procesos, cuadre,
  };
  dw.corridas.unshift(corrida);
  if (dw.corridas.length > 40) dw.corridas.length = 40;
  if (!falla) {
    dw.tablas = {};
    Object.entries(T).forEach(([nombre, filas]) => { dw.tablas[nombre] = { filas: filas.length, actualizado: ts }; });
    dw.resumen = { ts, corte, totales, kpiMensual: T.dw_kpi_mensual_sucursal };
  }
  return corrida;
}

/** Cuadre VIVO: lo que el DW tiene cargado (última corrida) contra la operación de este momento. */
export function cuadreDW(d) {
  const res = d.dw && d.dw.resumen;
  if (!res || !res.totales) return { sinCarga: true, filas: [], ok: false, ts: null, diferencias: 0 };
  const filas = compararTotales(res.totales, totalesOperativos(d, res.corte || null));
  const diferencias = filas.filter((f) => !f.ok).length;
  return { sinCarga: false, filas, ok: diferencias === 0, ts: res.ts, corte: res.corte || null, diferencias };
}
export const ultimaCorrida = (d) => (d.dw && d.dw.corridas && d.dw.corridas[0]) || null;
/** Estado de cada proceso según la última corrida. */
export function estadoProcesos(d) {
  const u = ultimaCorrida(d);
  return PROCESOS_ETL.map((p) => {
    const x = u ? u.procesos.find((y) => y.id === p.id) : null;
    return { ...p, ultima: u ? u.ts : null, estado: x ? x.estado : "sin_corrida", ms: x ? x.ms : null, filas: x ? x.filas : null, tablas: x ? x.tablas : [], error: x ? x.error : null };
  });
}

// ═════════════════════════ Tablero ejecutivo
export const PERIODOS_DW = [{ v: "7d", l: "Últimos 7 días" }, { v: "mes", l: "Mes en curso" }];
export function rangoDW(periodo, ref = hoy()) {
  if (periodo === "mes") {
    const mes = ref.slice(0, 7), ant = sumarMesesDW(mes, -1), n = Number(ref.slice(8, 10));
    return { periodo, desde: `${mes}-01`, hasta: ref, dias: n, etiqueta: `${nombreMesDW(mes)} (al día ${n})`,
      anterior: { desde: `${ant}-01`, hasta: `${ant}-${pad(Math.min(n, diasDelMesDW(ant)))}`, mes: ant, etiqueta: `mismos ${n} días de ${nombreMesDW(ant)}` } };
  }
  return { periodo: "7d", desde: sumarDias(ref, -6), hasta: ref, dias: 7, etiqueta: "Últimos 7 días", anterior: { desde: sumarDias(ref, -13), hasta: sumarDias(ref, -7), mes: null, etiqueta: "7 días anteriores" } };
}
const variacion = (a, b) => (b == null || !b ? null : r2(((a - b) / Math.abs(b)) * 100));

function medidas(T) {
  const V = T.dw_fact_ventas, C = T.dw_fact_citas;
  const ventas = suma(V, "importe"), dev = suma(T.dw_fact_devoluciones, "monto"), costo = suma(V, "costo");
  const tickets = new Set(V.map((f) => f.venta_id)).size, citas = C.length;
  const atendidas = C.reduce((a, f) => a + f.atendidas, 0), noShow = C.reduce((a, f) => a + f.no_asistio, 0), canc = C.reduce((a, f) => a + f.canceladas, 0);
  const A = T.dw_fact_asistencia || [];
  const pres = A.reduce((a, f) => a + f.presentes, 0), ret = A.reduce((a, f) => a + f.retardos, 0);
  return {
    ventas, devoluciones: dev, ventasNetas: r2(ventas - dev), tickets, ticket: tickets ? r2(ventas / tickets) : 0, costo, margenBruto: r2(ventas - dev - costo),
    citas, atendidas, noShowPct: pct(noShow, citas - canc), consultas: T.dw_fact_consultas.length,
    gastos: T.dw_fact_gastos ? suma(T.dw_fact_gastos, "monto") : null, puntualidadPct: A.length ? pct(pres - ret, pres) : null,
  };
}
const top = (filas, clave, nombre, campo, n = 8) => {
  const m = new Map();
  filas.forEach((f) => { const k = f[clave]; const x = m.get(k) || { id: k, nombre: f[nombre], valor: 0, unidades: 0 }; x.valor = r2(x.valor + num(f[campo])); x.unidades += num(f.unidades); m.set(k, x); });
  return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, n);
};

const CON_FECHA = ["dw_fact_ventas", "dw_fact_pagos", "dw_fact_devoluciones", "dw_fact_citas", "dw_fact_consultas", "dw_fact_gastos", "dw_fact_asistencia"];
/** Recorta por fecha un DW ya construido (los hechos con fecha) y recalcula sus tableros. Inventario, histórico y dimensiones no cambian. */
export function recortarDW(d, T, desde, hasta) {
  const R2 = {};
  Object.keys(T).forEach((k) => { if (!k.startsWith("dw_kpi_")) R2[k] = CON_FECHA.includes(k) ? T[k].filter((f) => f.fecha >= desde && f.fecha <= hasta) : T[k]; });
  return Object.assign(R2, construirKPIs(d, R2));
}

/**
 * Datos del tablero para un alcance ya validado. o = { sucursalIds: string[]|null, periodo: "7d"|"mes", ref }.
 * Comparativo: periodo anterior de la misma duración. Si del periodo anterior no hay tickets (meses cerrados solo tienen resumen
 * mensual), la venta anterior se estima prorrateando el histórico a los mismos días y se marca como `estimado`.
 */
export function datosTablero(d, o = {}) {
  const ref = o.ref || hoy(), rg = rangoDW(o.periodo || "7d", ref), sucursalIds = o.sucursalIds || null;
  const completo = o.tablas || construirDW(d, { sucursalIds });
  const act = recortarDW(d, completo, rg.desde, rg.hasta), ant = recortarDW(d, completo, rg.anterior.desde, rg.anterior.hasta);
  const A = medidas(act), B = medidas(ant);
  const hayAnt = ant.dw_fact_ventas.length > 0;
  let ventasAnt = hayAnt ? B.ventasNetas : null, estimado = false;
  if (!hayAnt && rg.anterior.mes) {
    const h = dw_fact_historico(d, { sucursalIds }).filter((x) => x.anio_mes === rg.anterior.mes);
    if (h.length) { ventasAnt = r2(suma(h, "ingresos") * (rg.dias / diasDelMesDW(rg.anterior.mes))); estimado = true; }
  }
  const hayCitasAnt = ant.dw_fact_citas.length > 0;
  const kpi = (k, label, valor, anterior, fmt, mejor = "sube", nota = "") => ({ k, label, valor, anterior, varPct: variacion(valor, anterior), fmt, mejor, nota });
  const kpis = [
    kpi("ventasNetas", "Ventas netas", A.ventasNetas, ventasAnt, "dinero", "sube", estimado ? "Anterior estimado: histórico mensual prorrateado a los mismos días" : ""),
    kpi("tickets", "Tickets", A.tickets, hayAnt ? B.tickets : null, "num"),
    kpi("ticket", "Ticket promedio", A.ticket, hayAnt ? B.ticket : null, "dinero"),
    kpi("margenBruto", "Margen bruto", A.margenBruto, hayAnt ? B.margenBruto : null, "dinero", "sube", "Ventas netas − costo PEPS del producto vendido"),
    kpi("atendidas", "Citas atendidas", A.atendidas, hayCitasAnt ? B.atendidas : null, "num"),
    kpi("noShowPct", "No-show", A.noShowPct, hayCitasAnt ? B.noShowPct : null, "pct", "baja"),
  ];
  if (A.gastos != null) kpis.push(kpi("gastos", "Gastos de operación", A.gastos, B.gastos, "dinero", "baja"));
  if (A.puntualidadPct != null) kpis.push(kpi("puntualidadPct", "Puntualidad", A.puntualidadPct, B.puntualidadPct, "pct"));

  // Serie diaria del periodo (todas las fechas, aunque no haya ventas)
  const porDia = new Map();
  act.dw_kpi_diario.forEach((f) => { const x = porDia.get(f.fecha) || { fecha: f.fecha, ventas: 0, tickets: 0, citas: 0, gastos: 0 }; x.ventas = r2(x.ventas + f.ventas_netas); x.tickets += f.tickets; x.citas += f.citas; x.gastos = r2(x.gastos + f.gastos); porDia.set(f.fecha, x); });
  const serieDiaria = [];
  for (let f = rg.desde; f <= rg.hasta; f = sumarDias(f, 1)) serieDiaria.push(porDia.get(f) || { fecha: f, ventas: 0, tickets: 0, citas: 0, gastos: 0 });

  // Serie mensual (12 meses cerrados + el mes en curso), del tablero mensual completo
  const mesAct = ref.slice(0, 7), pm = new Map();
  completo.dw_kpi_mensual_sucursal.forEach((f) => {
    if (f.anio_mes > mesAct || f.anio_mes < sumarMesesDW(mesAct, -12)) return;
    const x = pm.get(f.anio_mes) || { mes: f.anio_mes, ventas: 0, gastos: 0, costo: 0, fuente: f.fuente };
    x.ventas = r2(x.ventas + f.ventas_netas); x.gastos = r2(x.gastos + f.gastos); x.costo = r2(x.costo + f.costo); if (f.fuente === "operación") x.fuente = "operación"; pm.set(f.anio_mes, x);
  });
  const serieMensual = [...pm.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => ({ ...x, resultado: r2(x.ventas - x.costo - x.gastos), parcial: x.mes === mesAct }));

  const nomSuc = new Map((d.sucursales || []).map((s) => [s.id, s.nombre]));
  const porSucursal = agrupar(act.dw_kpi_diario.filter((f) => f.sucursal_id && nomSuc.has(f.sucursal_id)), (f) => f.sucursal_id, (f) => ({ id: f.sucursal_id, nombre: nomSuc.get(f.sucursal_id), ventas: 0, tickets: 0, citas: 0, atendidas: 0, gastos: 0 }),
    (x, f) => { x.ventas = r2(x.ventas + f.ventas_netas); x.tickets += f.tickets; x.citas += f.citas; x.atendidas += f.atendidas; x.gastos = r2(x.gastos + f.gastos); }).sort((a, b) => b.ventas - a.ventas);
  const mezcla = agrupar(act.dw_fact_ventas, (f) => f.categoria, (f) => ({ id: f.categoria, nombre: f.categoria, valor: 0 }), (x, f) => { x.valor = r2(x.valor + f.importe); }).sort((a, b) => b.valor - a.valor);
  const inv = agrupar(act.dw_fact_inventario, (f) => f.categoria, (f) => ({ id: f.categoria, nombre: f.categoria, valor: 0, existencia: 0, bajo: 0 }), (x, f) => { x.valor = r2(x.valor + f.valuacion); x.existencia += f.existencia; x.bajo += f.bajo_minimo; }).sort((a, b) => b.valor - a.valor);
  const pac = act.dw_dim_paciente;
  const cuenta = (campo) => agrupar(pac, (f) => String(f[campo]), (f) => ({ id: String(f[campo]), nombre: String(f[campo]) || "Sin dato", valor: 0 }), (x) => { x.valor += 1; }).sort((a, b) => b.valor - a.valor);
  return {
    rango: rg, sucursalIds, kpis, medidas: A, anterior: B, serieDiaria, serieMensual, porSucursal, mezcla,
    servicios: top(act.dw_kpi_servicio, "servicio_id", "servicio", "ventas"), productos: top(act.dw_kpi_producto, "producto_id", "producto", "ventas"),
    podologos: top(act.dw_kpi_podologo.map((x) => ({ ...x, unidades: x.atendidas })), "podologo_id", "podologo", "ventas"),
    formasPago: top(act.dw_kpi_forma_pago.map((x) => ({ ...x, unidades: x.pagos })), "forma_pago", "forma_pago", "monto"),
    gastosCategoria: act.dw_kpi_gasto_categoria ? top(act.dw_kpi_gasto_categoria.map((x) => ({ ...x, unidades: x.gastos })), "categoria_id", "categoria", "monto") : null,
    inventario: { categorias: inv, valuacion: suma(act.dw_fact_inventario, "valuacion"), bajoMinimo: act.dw_fact_inventario.reduce((a, f) => a + f.bajo_minimo, 0) },
    pacientes: { total: pac.length, edad: cuenta("grupo_edad").sort((a, b) => a.id.localeCompare(b.id)), origen: cuenta("origen"), diabetes: pac.filter((p) => p.diabetes).length },
    tablas: completo,
  };
}

/** CSV (con BOM) de una tabla del DW: columnas = llaves de la primera fila. */
export function csvTabla(filas) {
  if (!filas || !filas.length) return "﻿";
  const cols = Object.keys(filas[0]);
  const esc = (v) => { const s = v == null ? "" : v instanceof Set ? String(v.size) : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\r\n");
}
export { ymd };
