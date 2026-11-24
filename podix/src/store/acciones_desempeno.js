// Acciones y consultas del dominio «desempeño»: bonos y metas, análisis de datos y evaluación de clientes.
// El cálculo puro (atribución, escalones, reparto, sugerencia de meta) vive en desempeno_motor.js y se re-exporta aquí.
// Las acciones validan el rol del usuario en sesión, escriben usuario+sucursal y llaman auditar(). Se usan dentro de mutar((d) => …).
import * as M from "./desempeno_motor.js";
import * as R from "./reglas.js";
import { auditar, uid } from "./core.js";
import { carteraVencida } from "./selectors.js";
import { ocupacionDetalle, pacientesAtendidos, MIN_JORNADA } from "./acciones_admin.js";
import { hoy, dia, redondear, ahoraLocal, dinero, normaliza } from "../lib/format.js";

export * from "./desempeno_motor.js";
export { aCSV } from "./acciones_admin.js";

const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error) => ({ ok: false, error });
const ADMIN = ["admin", "direccion"];
export const actor = (d) => { const u = d.usuarios.find((x) => x.id === d.sesion.userId); return u && u.activo !== false ? u : null; };
export const esAdmin = (u) => !!u && ADMIN.includes(u.rol);
/** Sucursales que el usuario puede ver en bonos/análisis/evaluación: admin y dirección todas; los demás las suyas. */
export const sucursalesVisibles = (d, u) => (esAdmin(u) ? d.sucursales.map((s) => s.id) : u ? u.sucursales.filter((s) => d.sucursales.some((x) => x.id === s)) : []);
export const puedeVerBonos = (u) => esAdmin(u) || (!!u && u.rol === "gerente");

// ═════════════════════════ Esquemas de bono
export const TIPOS_ESCALON = { pct: "Porcentaje", monto: "Monto fijo" };
/** Valida un esquema (editable por administración o dirección). Devuelve { ok, error?, esquema? } con el esquema normalizado. */
export function validarEsquema(x) {
  const nombre = String(x.nombre || "").trim();
  if (nombre.length < 3) return err("Escribe un nombre para el esquema (mínimo 3 letras).");
  if (!["individual", "sucursal"].includes(x.tipo)) return err("El tipo debe ser individual o sucursal.");
  if (!["mensual", "trimestral"].includes(x.periodo)) return err("El periodo debe ser mensual o trimestral.");
  if (!M.BASES[x.base]) return err("Elige la base de cálculo.");
  if (x.base === "cumplimiento" && x.tipo !== "sucursal") return err("La base «cumplimiento de meta» solo aplica a esquemas por sucursal.");
  const roles = [...new Set(x.roles || [])].filter((r) => M.ROLES_ELEGIBLES.includes(r));
  if (!roles.length) return err("Elige al menos un rol elegible.");
  const esc = (x.escalones || []).map((e) => ({ desde: Number(e.desde), tipo: e.tipo, valor: Number(e.valor) }));
  if (!esc.length) return err("Agrega al menos un escalón.");
  for (const e of esc) {
    if (!Number.isFinite(e.desde) || e.desde < 0) return err("Cada escalón necesita un «desde» numérico mayor o igual a 0.");
    if (!["pct", "monto"].includes(e.tipo)) return err("Cada escalón es de porcentaje o de monto fijo.");
    if (!Number.isFinite(e.valor) || e.valor <= 0) return err("El valor de cada escalón debe ser mayor que 0.");
    if (e.tipo === "pct" && e.valor > 100) return err("Un porcentaje no puede pasar de 100.");
  }
  const orden = [...esc].sort((a, b) => a.desde - b.desde);
  if (orden.some((e, i) => i && e.desde === orden[i - 1].desde)) return err("Dos escalones no pueden empezar en el mismo valor.");
  const tope = x.tope === "" || x.tope == null ? null : Number(x.tope);
  if (tope != null && (!Number.isFinite(tope) || tope <= 0)) return err("El tope debe ser un número mayor que 0 (o vacío para no poner tope).");
  const c = x.condiciones || {};
  const asist = c.asistenciaMin === "" || c.asistenciaMin == null ? null : Number(c.asistenciaMin);
  const calif = c.califMin === "" || c.califMin == null ? null : Number(c.califMin);
  if (asist != null && (!(asist > 0) || asist > 100)) return err("La asistencia mínima va de 1 a 100 %.");
  if (calif != null && (!(calif >= 1) || calif > 5)) return err("La calificación mínima va de 1 a 5.");
  return ok({ esquema: { nombre, tipo: x.tipo, periodo: x.periodo, base: x.base, roles, escalones: orden, tope, condiciones: { asistenciaMin: asist, califMin: calif }, nota: String(x.nota || "").trim() } });
}
/** Crea o edita un esquema. Los bonos ya aprobados o pagados conservan su monto congelado. Solo administración o dirección. */
export function guardarEsquema(d, datos) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección puede editar los esquemas de bono.");
  const v = validarEsquema(datos);
  if (!v.ok) return v;
  d.bonos ||= { esquemas: [], metas: [], propuestas: [], pagados: [], hist: [] };
  const hora = ahoraLocal();
  let e = datos.id ? d.bonos.esquemas.find((x) => x.id === datos.id) : null;
  if (datos.id && !e) return err("No existe ese esquema.");
  if (!e) { e = { id: `BE${d.bonos.esquemas.length + 1}${uid("").slice(-3)}`, activo: true, creadoPor: u.id }; d.bonos.esquemas.push(e); }
  Object.assign(e, v.esquema, { porValidar: false, actualizado: hora, actualizadoPor: u.id, sucursalId: d.sesion.sucursalId });
  auditar(d, datos.id ? "bono_esquema_editar" : "bono_esquema_crear", "bono_esquema", e.id, `${e.nombre} · ${e.tipo} ${e.periodo}`);
  return ok({ id: e.id });
}
export function activarEsquema(d, id, activo) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección puede activar o archivar esquemas.");
  const e = (d.bonos?.esquemas || []).find((x) => x.id === id);
  if (!e) return err("No existe ese esquema.");
  e.activo = !!activo; e.actualizado = ahoraLocal();
  auditar(d, activo ? "bono_esquema_activar" : "bono_esquema_archivar", "bono_esquema", id, e.nombre);
  return ok();
}

// ═════════════════════════ Aprobación y pago (calculado → aprobado → pagado)
function evaluar(d, { esquemaId, mes, usuarioId, sucursalId }) {
  const esq = (d.bonos?.esquemas || []).find((x) => x.id === esquemaId);
  if (!esq) return { error: "No existe ese esquema." };
  const per = M.periodoDe(esq.periodo, mes);
  const it = esq.tipo === "individual" ? M.evaluarIndividual(d, esq, usuarioId, per) : M.evaluarSucursal(d, esq, sucursalId, per);
  return { esq, per, it };
}
/** Aprueba un bono: congela el monto calculado en el libro. Solo administración o dirección y solo periodos terminados. */
export function aprobarBono(d, { esquemaId, mes, usuarioId = null, sucursalId = null }) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección aprueba bonos.");
  const e = evaluar(d, { esquemaId, mes, usuarioId, sucursalId });
  if (e.error) return err(e.error);
  const { esq, per, it } = e;
  if (!M.periodoTerminado(per)) return err(`El periodo ${per.etiqueta} aún no termina; el bono se aprueba al cierre.`);
  if (M.registroBono(d, { esquemaId, periodoClave: per.clave, usuarioId, sucursalId })) return err("Este bono ya fue aprobado.");
  const monto = esq.tipo === "individual" ? it.bono : it.bolsa;
  if (!(monto > 0)) return err("El monto del bono es $0: no hay nada que aprobar.");
  d.bonos.pagados ||= [];
  const reg = {
    id: uid("BP"), esquemaId, periodoClave: per.clave, tipo: esq.tipo, usuarioId: esq.tipo === "individual" ? usuarioId : null, sucursalId: esq.tipo === "sucursal" ? sucursalId : null,
    base: it.base, bono: monto, estado: "aprobado", aprobadoPor: u.id, aprobadoEn: ahoraLocal(), registradoEn: d.sesion.sucursalId,
    ...(esq.tipo === "sucursal" ? { reparto: it.reparto.map((x) => ({ usuarioId: x.usuarioId, dias: x.dias, monto: x.monto })) } : {}),
  };
  d.bonos.pagados.push(reg);
  auditar(d, "bono_aprobar", "bono", reg.id, `${esq.nombre} · ${per.clave} · ${esq.tipo === "individual" ? R.nombreUsuario(d, usuarioId) : R.nombreSucursal(d, sucursalId)} · ${dinero(monto)}`);
  return ok({ id: reg.id, monto });
}
/** Marca como pagado un bono ya aprobado. Solo administración o dirección. */
export function pagarBono(d, { esquemaId, mes, usuarioId = null, sucursalId = null }) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección registra el pago de bonos.");
  const esq = (d.bonos?.esquemas || []).find((x) => x.id === esquemaId);
  if (!esq) return err("No existe ese esquema.");
  const per = M.periodoDe(esq.periodo, mes);
  const reg = M.registroBono(d, { esquemaId, periodoClave: per.clave, usuarioId, sucursalId });
  if (!reg) return err("El bono todavía no está aprobado.");
  if (reg.estado === "pagado") return err("Este bono ya estaba pagado.");
  reg.estado = "pagado"; reg.pagadoPor = u.id; reg.pagadoEn = ahoraLocal();
  auditar(d, "bono_pagar", "bono", reg.id, `${esq.nombre} · ${per.clave} · ${dinero(reg.bono)}`);
  return ok({ id: reg.id });
}
/** Aprueba (o paga) en bloque los bonos con monto del periodo; devuelve cuántos se procesaron. */
export function procesarPeriodo(d, { mes, periodo, accion = "aprobar", sucursalIds = null }) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección aprueba o paga bonos.");
  const r = M.resumenPeriodo(d, { mes, periodo, sucursalIds });
  let n = 0;
  const fn = accion === "pagar" ? pagarBono : aprobarBono;
  const objetivo = accion === "pagar" ? "aprobado" : "calculado";
  [...r.individuales, ...r.sucursales].filter((x) => x.estado === objetivo && (x.tipo === "individual" ? x.bono : x.bolsa) > 0).forEach((x) => {
    const res = fn(d, { esquemaId: x.esquemaId, mes, usuarioId: x.usuarioId || null, sucursalId: x.sucursalId || null });
    if (res.ok) n++;
  });
  return ok({ n });
}

// ═════════════════════════ Metas por sucursal
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function validarMeta(d, { sucursalId, mes, meta }) {
  if (!d.sucursales.some((s) => s.id === sucursalId)) return "Elige una sucursal.";
  if (!MES_RE.test(String(mes || ""))) return "Mes no válido.";
  const n = Number(meta);
  if (!Number.isFinite(n) || n < 1000) return "La meta debe ser un importe de al menos $1,000.";
  if (n > 5000000) return "La meta parece demasiado alta (máximo $5,000,000 por sucursal y mes).";
  return null;
}
const hayBonosCerrados = (d, sucursalId, mes) => (d.bonos?.pagados || []).some((r) => {
  const esq = d.bonos.esquemas.find((e) => e.id === r.esquemaId);
  return esq && esq.tipo === "sucursal" && r.sucursalId === sucursalId && M.periodoDe(esq.periodo, mes).clave === r.periodoClave;
});
/** Fija la meta de una sucursal en un mes. Solo administración o dirección; no se toca una meta cuyo bono ya fue aprobado. */
export function fijarMeta(d, { sucursalId, mes, meta, origen = "fijada" }) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección fija las metas; el gerente propone.");
  const e = validarMeta(d, { sucursalId, mes, meta });
  if (e) return err(e);
  if (hayBonosCerrados(d, sucursalId, mes)) return err("Ya hay bonos aprobados con esta meta; no se puede cambiar.");
  d.bonos ||= { esquemas: [], metas: [], propuestas: [], pagados: [], hist: [] };
  const n = Math.round(Number(meta));
  const prev = d.bonos.metas.find((x) => x.sucursalId === sucursalId && x.mes === mes);
  if (prev) Object.assign(prev, { meta: n, origen, por: u.id, fecha: ahoraLocal() });
  else d.bonos.metas.push({ sucursalId, mes, meta: n, origen, por: u.id, fecha: ahoraLocal() });
  auditar(d, "meta_fijar", "meta", `${sucursalId}|${mes}`, `${R.nombreSucursal(d, sucursalId)} · ${mes} · ${dinero(n)}${prev ? ` (antes ${dinero(prev.meta)})` : ""}`);
  return ok({ meta: n });
}
/** El gerente propone la meta de SU sucursal para este mes o los siguientes; administración la acepta o la rechaza. */
export function proponerMeta(d, { sucursalId, mes, meta, nota = "", origen = "propuesta" }) {
  const u = actor(d);
  if (!u || u.rol !== "gerente") return err("Solo el gerente propone metas (administración las fija).");
  if (!u.sucursales.includes(sucursalId)) return err("Solo puedes proponer la meta de tu sucursal.");
  const e = validarMeta(d, { sucursalId, mes, meta });
  if (e) return err(e);
  if (mes < M.mesActual()) return err("Solo se proponen metas del mes en curso o de meses siguientes.");
  d.bonos ||= { esquemas: [], metas: [], propuestas: [], pagados: [], hist: [] };
  d.bonos.propuestas ||= [];
  d.bonos.propuestas = d.bonos.propuestas.filter((p) => !(p.sucursalId === sucursalId && p.mes === mes && p.estado === "pendiente"));
  const p = { id: uid("MP"), sucursalId, mes, meta: Math.round(Number(meta)), nota: String(nota).trim(), origen, porId: u.id, fecha: ahoraLocal(), estado: "pendiente" };
  d.bonos.propuestas.push(p);
  auditar(d, "meta_proponer", "meta", `${sucursalId}|${mes}`, `${R.nombreSucursal(d, sucursalId)} · ${mes} · ${dinero(p.meta)}`);
  return ok({ id: p.id });
}
export function resolverPropuestaMeta(d, { id, aceptar }) {
  const u = actor(d);
  if (!esAdmin(u)) return err("Solo Administración central o Dirección resuelve propuestas de meta.");
  const p = (d.bonos?.propuestas || []).find((x) => x.id === id);
  if (!p || p.estado !== "pendiente") return err("La propuesta ya no está pendiente.");
  if (aceptar) { const r = fijarMeta(d, { sucursalId: p.sucursalId, mes: p.mes, meta: p.meta, origen: "propuesta_aprobada" }); if (!r.ok) return r; }
  p.estado = aceptar ? "aprobada" : "rechazada"; p.resueltoPor = u.id; p.resueltoEn = ahoraLocal();
  auditar(d, aceptar ? "meta_propuesta_aceptar" : "meta_propuesta_rechazar", "meta", `${p.sucursalId}|${p.mes}`, dinero(p.meta));
  return ok();
}
/** «Aceptar sugerencia»: administración fija la meta sugerida; el gerente la envía como propuesta. */
export function aceptarSugerencia(d, { sucursalId, mes }) {
  const sg = M.sugerirMeta(d, sucursalId, mes);
  if (!sg.ok) return err(sg.motivo);
  const u = actor(d);
  return u && u.rol === "gerente" ? proponerMeta(d, { sucursalId, mes, meta: sg.sugerida, nota: "Sugerencia del sistema aceptada.", origen: "sugerida" }) : fijarMeta(d, { sucursalId, mes, meta: sg.sugerida, origen: "sugerida" });
}

// ═════════════════════════ Análisis de datos
export const PERIODOS_ANALISIS = [{ v: "mes", l: "Mes en curso" }, { v: "3m", l: "Últimos 3 meses" }, { v: "12m", l: "Últimos 12 meses" }];
/** Meses del periodo de análisis y rango de fechas operativas (con datos de ventas/citas vivos). */
export function periodoAnalisis(d, tipo) {
  const act = M.mesActual();
  const n = tipo === "12m" ? 12 : tipo === "3m" ? 3 : 1;
  const meses = Array.from({ length: n }, (_, i) => M.sumarMeses(act, i - (n - 1)));
  const minDe = (fs) => fs.map(dia).sort()[0] || hoy();
  const minCitas = minDe(d.citas.map((c) => c.inicio)), minVentas = minDe(d.ventas.map((v) => v.fecha));
  const desde = `${meses[0]}-01`;
  // vivoDesde: desde cuándo hay citas y consultas (ocupación y ranking); ventasDesde: desde cuándo hay tickets (productos y ticket promedio).
  return { tipo, meses, desde, hasta: hoy(), vivoDesde: minCitas > desde ? minCitas : desde, ventasDesde: minVentas > desde ? minVentas : desde, limitado: minCitas > desde || minVentas > desde };
}
const claseProducto = (d, p) => {
  if (p.tipo === "servicio") return "servicios";
  if (p.tipo === "anticipo") return "plantillas";
  const pr = d.productos.find((x) => x.id === p.itemId);
  return pr && pr.categoria === "Plantillas" ? "plantillas" : "productos";
};
/** Serie mensual de ventas (12 meses cerrados de d.hist + mes en curso de d.ventas): [{mes, servicios, plantillas, productos, total, pacientes, porSucursal}] */
export function serieMensual(d, { sucursalId = null, atras = 12 } = {}) {
  const act = M.mesActual(), out = [];
  const sucs = sucursalId ? [sucursalId] : d.sucursales.map((s) => s.id);
  for (let i = -atras; i <= 0; i++) {
    const mes = M.sumarMeses(act, i), fila = { mes, servicios: 0, plantillas: 0, productos: 0, total: 0, pacientes: 0, porSucursal: {}, enCurso: i === 0 };
    const hs = (d.hist || []).filter((h) => h.mes === mes && sucs.includes(h.sucursalId));
    if (hs.length) {
      hs.forEach((h) => { fila.servicios += h.servicios; fila.plantillas += h.plantillas; fila.productos += h.productos; fila.pacientes += h.pacientes; fila.porSucursal[h.sucursalId] = h.servicios + h.plantillas + h.productos; });
    } else {
      const r = M.rangoMes(mes);
      d.ventas.forEach((v) => {
        if (v.estado === "cancelada" || !sucs.includes(v.sucursalId)) return;
        const f = dia(v.fecha);
        if (f < r.desde || f > r.hasta) return;
        (v.partidas || []).forEach((p) => { fila[claseProducto(d, p)] += p.importe || 0; });
      });
      sucs.forEach((s) => { fila.porSucursal[s] = M.ventaSucursalMes(d, s, mes); });
      fila.pacientes = pacientesAtendidos(d, r, sucursalId || undefined);
    }
    fila.servicios = Math.round(fila.servicios); fila.plantillas = Math.round(fila.plantillas); fila.productos = Math.round(fila.productos);
    fila.total = Math.round(Object.values(fila.porSucursal).reduce((a, b) => a + b, 0));
    out.push(fila);
  }
  return out;
}
/** Ranking de podólogos del rango: consultas, ingreso atribuido, ticket y ocupación. */
export function rankingPodologos(d, { desde, hasta, sucursalId = null }) {
  const ventas = new Map(M.ventasPorVendedor(d, { desde, hasta, sucursalId }).map((x) => [x.usuarioId, x]));
  return d.usuarios.filter((u) => u.rol === "podologo" && u.activo !== false && (!sucursalId || u.sucursales.includes(sucursalId))).map((u) => {
    const consultas = d.consultas.filter((c) => c.podologoId === u.id && ["cerrada", "cobrada"].includes(c.estado) && dia(c.fecha) >= desde && dia(c.fecha) <= hasta && (!sucursalId || c.sucursalId === sucursalId)).length;
    const citas = d.citas.filter((c) => c.podologoId === u.id && c.estado !== "cancelada" && dia(c.inicio) >= desde && dia(c.inicio) <= hasta && (!sucursalId || c.sucursalId === sucursalId));
    const dias = new Set(citas.map((c) => `${c.sucursalId}|${dia(c.inicio)}`)).size;
    const min = citas.filter((c) => ["atendida", "confirmada", "en_atencion", "en_sala"].includes(c.estado)).reduce((a, c) => a + (c.duracion || 0), 0);
    const v = ventas.get(u.id);
    return { usuarioId: u.id, nombre: u.nombre, consultas, ingreso: v ? v.total : 0, nVentas: v ? v.nVentas : 0, ticket: v && v.nVentas ? redondear(v.total / v.nVentas) : 0, ocupacion: dias ? redondear((min / (dias * MIN_JORNADA)) * 100) : 0 };
  }).sort((a, b) => b.ingreso - a.ingreso);
}
/** Ocupación de agenda por sucursal en el rango. */
export function ocupacionPorSucursal(d, { desde, hasta, sucursalId = null }) {
  return d.sucursales.filter((s) => !sucursalId || s.id === sucursalId).map((s) => ({ sucursalId: s.id, nombre: s.nombre, ...ocupacionDetalle(d, { desde, hasta }, s.id) }));
}
/** Productos más vendidos y de menor rotación (unidades vendidas frente a existencia) en el rango. */
export function analisisProductos(d, { desde, hasta, sucursalId = null, top = 8 }) {
  const m = new Map();
  d.ventas.forEach((v) => {
    if (v.estado === "cancelada" || (sucursalId && v.sucursalId !== sucursalId)) return;
    const f = dia(v.fecha);
    if (f < desde || f > hasta) return;
    (v.partidas || []).forEach((p) => {
      if (p.tipo !== "producto") return;
      const o = m.get(p.itemId) || { id: p.itemId, nombre: p.nombre, cant: 0, importe: 0 };
      o.cant += p.cant || 0; o.importe = redondear(o.importe + (p.importe || 0)); m.set(p.itemId, o);
    });
  });
  const almacenes = sucursalId ? [sucursalId] : d.sucursales.map((s) => s.id);
  const dias = Math.max(1, Math.round((new Date(`${hasta}T00:00`) - new Date(`${desde}T00:00`)) / 86400000) + 1);
  const todos = d.productos.filter((p) => p.tipo === "venta").map((p) => {
    const o = m.get(p.id) || { cant: 0, importe: 0 };
    const existencia = almacenes.reduce((a, al) => a + R.stock(d, al, p.id), 0);
    return { id: p.id, nombre: p.nombre, categoria: p.categoria, cant: o.cant, importe: o.importe, existencia, coberturaDias: o.cant > 0 ? Math.round(existencia / (o.cant / dias)) : null };
  });
  return {
    dias,
    masVendidos: [...todos].filter((x) => x.cant > 0).sort((a, b) => b.importe - a.importe).slice(0, top),
    menorRotacion: [...todos].filter((x) => x.existencia > 0).sort((a, b) => (a.cant / a.existencia) - (b.cant / b.existencia) || b.existencia - a.existencia).slice(0, top),
  };
}
/** Comparativo de cada sucursal contra el promedio de la cadena (ventas del periodo, ticket, pacientes, ocupación, cartera). */
export function comparativoSucursales(d, per, { sucursalId = null } = {}) {
  const act = M.mesActual();
  const filas = d.sucursales.map((s) => {
    const ventas = per.meses.reduce((a, m) => a + M.ventaSucursalMes(d, s.id, m), 0);
    const vivo = { desde: per.vivoDesde, hasta: hoy() };
    const vs = d.ventas.filter((v) => v.sucursalId === s.id && v.estado !== "cancelada" && dia(v.fecha) >= per.ventasDesde && dia(v.fecha) <= vivo.hasta);
    const ticket = vs.length ? redondear(vs.reduce((a, v) => a + v.total, 0) / vs.length) : 0;
    const hs = (d.hist || []).filter((h) => h.sucursalId === s.id && per.meses.includes(h.mes)).reduce((a, h) => a + h.pacientes, 0);
    const pacientes = hs + (per.meses.includes(act) ? pacientesAtendidos(d, M.rangoMes(act), s.id) : 0);
    return { sucursalId: s.id, nombre: s.nombre, ventas: Math.round(ventas), ticket, pacientes, ocupacion: ocupacionDetalle(d, vivo, s.id).pct, cartera: carteraVencida(d, s.id) };
  });
  const prom = (k) => filas.reduce((a, x) => a + x[k], 0) / (filas.length || 1);
  const medias = { ventas: prom("ventas"), ticket: prom("ticket"), pacientes: prom("pacientes"), ocupacion: prom("ocupacion"), cartera: prom("cartera") };
  const dif = (v, m) => (m ? redondear(((v - m) / m) * 100) : 0);
  const r = filas.map((x) => ({ ...x, difVentas: dif(x.ventas, medias.ventas), difTicket: dif(x.ticket, medias.ticket), difPacientes: dif(x.pacientes, medias.pacientes), difOcupacion: dif(x.ocupacion, medias.ocupacion) }));
  return { filas: sucursalId ? r.filter((x) => x.sucursalId === sucursalId) : r, medias };
}
export const carteraPorSucursal = (d, sucursalId = null) => d.sucursales.filter((s) => !sucursalId || s.id === sucursalId).map((s) => ({ sucursalId: s.id, nombre: s.nombre, monto: carteraVencida(d, s.id) }));

// ═════════════════════════ Evaluación de clientes
export const califGeneral = (e) => redondear((e.califServicio + e.califPodologo + e.califSucursal) / 3);
export const esBaja = (e) => e.estado === "respondida" && Math.min(e.califServicio, e.califPodologo, e.califSucursal) <= 2;
export const ESTADOS_SEGUIMIENTO = { nuevo: ["Por atender", "bad"], contactado: ["Contactado", "warn"], resuelto: ["Resuelto", "ok"] };
/** Evaluaciones que el usuario puede ver: dirección/administración todas; gerente y recepción las de sus sucursales; el podólogo solo las suyas. */
export function evaluacionesVisibles(d, u) {
  const ev = d.eval || [];
  if (!u) return [];
  if (esAdmin(u)) return ev;
  if (u.rol === "gerente" || u.rol === "recepcion") return ev.filter((e) => u.sucursales.includes(e.sucursalId));
  if (u.rol === "podologo") return ev.filter((e) => e.podologoId === u.id);
  return [];
}
export function estadisticasEval(lista) {
  const rs = lista.filter((e) => e.estado === "respondida");
  const prom = (k) => (rs.length ? redondear(rs.reduce((a, e) => a + e[k], 0) / rs.length) : null);
  const gen = rs.map(califGeneral);
  const pro = gen.filter((x) => x >= 4.5).length, det = gen.filter((x) => x <= 3).length;
  const ordenadas = [...rs].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let tendencia = null;
  if (ordenadas.length >= 6) {
    const h = Math.floor(ordenadas.length / 2), a = ordenadas.slice(0, h).map(califGeneral), b = ordenadas.slice(h).map(califGeneral);
    const p = (x) => x.reduce((s, y) => s + y, 0) / x.length;
    tendencia = redondear(p(b) - p(a));
  }
  return {
    n: rs.length, pendientes: lista.filter((e) => e.estado === "pendiente").length, promServicio: prom("califServicio"), promPodologo: prom("califPodologo"), promSucursal: prom("califSucursal"),
    promGeneral: gen.length ? redondear(gen.reduce((a, b) => a + b, 0) / gen.length) : null,
    promotores: pro, detractores: det, nps: rs.length ? Math.round(((pro - det) / rs.length) * 100) : null, bajas: rs.filter(esBaja).length, tendencia,
  };
}
export function agruparEval(d, lista, por) {
  const m = new Map();
  lista.forEach((e) => { const k = por === "podologo" ? e.podologoId : e.sucursalId; (m.get(k) || m.set(k, []).get(k)).push(e); });
  return [...m.entries()].map(([id, l]) => ({ id, nombre: por === "podologo" ? R.nombreUsuario(d, id) : R.nombreSucursal(d, id), ...estadisticasEval(l) })).sort((a, b) => (b.promGeneral ?? 0) - (a.promGeneral ?? 0));
}
/** Calificaciones ≤ 2 sin resolver (la alerta inmediata). */
export const alertasEval = (lista) => lista.filter((e) => esBaja(e) && (!e.seguimiento || e.seguimiento.estado !== "resuelto")).sort((a, b) => b.fecha.localeCompare(a.fecha));

const puedeGestionarEval = (u) => !!u && (esAdmin(u) || ["gerente", "recepcion"].includes(u.rol));
const enAlcance = (u, e) => esAdmin(u) || u.sucursales.includes(e.sucursalId);
export function enlaceEncuesta(evalId, citaId) { return `https://clinicas.example/encuesta/${String(evalId).toLowerCase()}-${String(citaId).toLowerCase()}`; }
/** Texto del mensaje que se enviaría al paciente. */
export function mensajeEncuesta(d, e) {
  const p = d.pacientes.find((x) => x.id === e.pacienteId);
  return `Hola ${p ? p.nombres : ""}, gracias por visitarnos en ${R.nombreSucursal(d, e.sucursalId)}. Cuéntanos cómo te fue con ${R.nombreUsuario(d, e.podologoId)}; son 3 preguntas y menos de un minuto: ${e.enlace}`;
}
/**
 * INTEGRACIÓN: el envío real por WhatsApp (API de Meta) o correo saliente aún no está contratado. Esta función es el ÚNICO punto
 * que habría que sustituir; hoy solo simula el envío y lo declara.
 */
export function enviarPorCanal(canal, destino, mensaje) {
  return { ok: true, simulado: true, canal, destino, mensaje };
}
function nuevaEncuesta(d, c, creadaPor) {
  d.eval ||= [];
  const id = `EV${d.eval.length + 1}${uid("").slice(-3)}`;
  d.eval.push({ id, citaId: c.id, pacienteId: c.pacienteId, sucursalId: c.sucursalId, podologoId: c.podologoId, fecha: c.inicio, califServicio: null, califPodologo: null, califSucursal: null, comentario: "", estado: "pendiente", canal: null, enviadaEn: null, enlace: enlaceEncuesta(id, c.id), seguimiento: null, creadaPor });
  auditar(d, "encuesta_crear", "encuesta", id, `Cita ${c.id}`);
  return id;
}
/**
 * Gancho para el cierre de la cita (lo llama el flujo del podólogo al marcarla atendida): deja lista la encuesta pendiente.
 * Es un disparo del sistema, no valida rol; no duplica. Devuelve el id de la encuesta o null.
 */
export function encuestaAlCerrarCita(d, citaId) {
  const c = d.citas.find((x) => x.id === citaId);
  if (!c || c.estado !== "atendida" || (d.eval || []).some((e) => e.citaId === citaId)) return null;
  return nuevaEncuesta(d, c, d.sesion.userId);
}
/** Crea a mano la encuesta pendiente de una cita atendida (recepción, gerencia, administración). */
export function crearEncuesta(d, { citaId }) {
  const u = actor(d);
  if (!puedeGestionarEval(u)) return err("Tu rol no puede generar encuestas.");
  const c = d.citas.find((x) => x.id === citaId);
  if (!c) return err("La cita no existe.");
  if (c.estado !== "atendida") return err("Solo se envía encuesta de citas atendidas.");
  if (!esAdmin(u) && !u.sucursales.includes(c.sucursalId)) return err("Esa cita es de otra sucursal.");
  if ((d.eval || []).some((e) => e.citaId === citaId)) return err("Esa cita ya tiene encuesta.");
  return ok({ id: nuevaEncuesta(d, c, u.id) });
}
/** Genera las encuestas de las citas atendidas de los últimos 7 días que aún no tienen. */
export function generarEncuestasFaltantes(d) {
  const u = actor(d);
  if (!puedeGestionarEval(u)) return err("Tu rol no puede generar encuestas.");
  const desde = R._sumarDias(hoy(), -7);
  const ya = new Set((d.eval || []).map((e) => e.citaId));
  let n = 0;
  d.citas.filter((c) => c.estado === "atendida" && dia(c.inicio) >= desde && !ya.has(c.id) && (esAdmin(u) || u.sucursales.includes(c.sucursalId))).forEach((c) => { if (crearEncuesta(d, { citaId: c.id }).ok) n++; });
  return ok({ n });
}
/** SIMULACIÓN rotulada: marca la encuesta como enviada por el canal elegido (WhatsApp o correo) y devuelve el mensaje. */
export function enviarEncuesta(d, { evalId, canal }) {
  const u = actor(d);
  if (!puedeGestionarEval(u)) return err("Tu rol no puede enviar encuestas.");
  const e = (d.eval || []).find((x) => x.id === evalId);
  if (!e) return err("La encuesta no existe.");
  if (!enAlcance(u, e)) return err("Esa encuesta es de otra sucursal.");
  if (e.estado !== "pendiente") return err("La encuesta ya fue respondida.");
  if (!["whatsapp", "correo"].includes(canal)) return err("Elige WhatsApp o correo.");
  const p = d.pacientes.find((x) => x.id === e.pacienteId);
  if (canal === "correo" && !(p && p.correo)) return err("El paciente no tiene correo registrado.");
  const mensaje = mensajeEncuesta(d, e);
  const r = enviarPorCanal(canal, canal === "correo" ? p.correo : p && p.telefono, mensaje);
  e.canal = canal; e.enviadaEn = ahoraLocal();
  auditar(d, "encuesta_enviar", "encuesta", e.id, `${canal} (simulación)`);
  return ok({ mensaje, simulado: r.simulado });
}
/** Simula que el paciente contesta (en producción responde desde el enlace, sin sesión). */
export function responderEncuesta(d, { evalId, califServicio, califPodologo, califSucursal, comentario = "" }) {
  const u = actor(d);
  if (!puedeGestionarEval(u)) return err("Tu rol no puede registrar respuestas de encuesta.");
  const e = (d.eval || []).find((x) => x.id === evalId);
  if (!e) return err("La encuesta no existe.");
  if (!enAlcance(u, e)) return err("Esa encuesta es de otra sucursal.");
  if (e.estado !== "pendiente") return err("La encuesta ya fue respondida.");
  const cs = [califServicio, califPodologo, califSucursal].map(Number);
  if (cs.some((x) => !Number.isInteger(x) || x < 1 || x > 5)) return err("Las tres calificaciones van de 1 a 5.");
  const com = String(comentario || "").trim().slice(0, 500);
  Object.assign(e, { califServicio: cs[0], califPodologo: cs[1], califSucursal: cs[2], comentario: com, estado: "respondida", fecha: ahoraLocal(), respondidaDesde: d.sesion.sucursalId });
  if (Math.min(...cs) <= 2) e.seguimiento = { estado: "nuevo", nota: "", por: null, fecha: null };
  auditar(d, "encuesta_responder", "encuesta", e.id, `Respuesta simulada · ${cs.join("/")}`);
  return ok({ alerta: Math.min(...cs) <= 2 });
}
/** Seguimiento de una calificación baja: contactado o resuelto, con nota. Recepción y gerente de la sucursal, administración y dirección. */
export function seguimientoEval(d, { evalId, estado, nota = "" }) {
  const u = actor(d);
  if (!puedeGestionarEval(u)) return err("Solo recepción, gerencia y administración dan seguimiento a las quejas.");
  const e = (d.eval || []).find((x) => x.id === evalId);
  if (!e) return err("La encuesta no existe.");
  if (!enAlcance(u, e)) return err("Esa respuesta es de otra sucursal.");
  if (!esBaja(e)) return err("Solo las calificaciones de 2 o menos llevan seguimiento.");
  if (!["nuevo", "contactado", "resuelto"].includes(estado)) return err("Estado no válido.");
  const n = String(nota || "").trim();
  if (estado !== "nuevo" && n.length < 5) return err("Escribe una nota breve del seguimiento (mínimo 5 letras).");
  e.seguimiento = { estado, nota: estado === "nuevo" ? "" : n, por: u.id, fecha: ahoraLocal() };
  auditar(d, "encuesta_seguimiento", "encuesta", e.id, `${estado}${n ? ` · ${n.slice(0, 60)}` : ""}`);
  return ok();
}
export const buscarEval = (d, lista, texto) => {
  const t = normaliza(texto);
  if (!t) return lista;
  return lista.filter((e) => normaliza(`${e.comentario} ${R.nombrePaciente(d, e.pacienteId)} ${R.nombreUsuario(d, e.podologoId)} ${R.nombreSucursal(d, e.sucursalId)}`).includes(t));
};

// ═════════════════════════ Vista personal («Mis bonos»)
/** Posición de la persona entre sus compañeros del mismo rol en una sucursal (por venta atribuida; si no vende, por días trabajados). No expone importes ajenos. */
export function posicionEnSucursal(d, { usuarioId, mes, sucursalId }) {
  const u = d.usuarios.find((x) => x.id === usuarioId);
  if (!u) return null;
  const filas = M.filasAtribucion(d, mes).filter((f) => f.sucursalId === sucursalId && (f.ventas > 0 || f.dias > 0));
  const pares = filas.filter((f) => { const p = d.usuarios.find((x) => x.id === f.usuarioId); return p && p.rol === u.rol; });
  const criterio = pares.some((f) => f.ventas > 0) ? "ventas" : "dias";
  const orden = [...pares].sort((a, b) => (criterio === "ventas" ? b.ventas - a.ventas : b.dias - a.dias));
  const i = orden.findIndex((f) => f.usuarioId === usuarioId);
  return i < 0 ? null : { pos: i + 1, de: orden.length, criterio };
}
/** Ventas atribuidas a la persona por mes (histórico resumido + mes en curso): [{mes, ventas, producto, nVentas}]. */
export function serieVentasPersona(d, usuarioId, { atras = 6 } = {}) {
  const act = M.mesActual(), r = [];
  for (let i = -atras; i <= 0; i++) {
    const mes = M.sumarMeses(act, i), f = M.filasAtribucion(d, mes).filter((x) => x.usuarioId === usuarioId);
    r.push({ mes, ventas: Math.round(f.reduce((a, x) => a + x.ventas, 0)), producto: Math.round(f.reduce((a, x) => a + x.producto, 0)), nVentas: f.reduce((a, x) => a + x.nVentas, 0), enCurso: i === 0 });
  }
  return r;
}
