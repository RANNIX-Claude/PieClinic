// Asistente inteligente (dominio «comercial»). Responde preguntas del negocio con DATOS REALES del estado.
//
// Arquitectura (la misma que tendría con un modelo de lenguaje; hoy el «entendimiento» es un motor de reglas):
//   1. Capa semántica: METRICAS (qué sabe responder, con sinónimos y definición) + entidades (sucursales, productos, periodos).
//   2. Motor DETERMINISTA: entender() → intención + entidades; cada intención es una consulta pura sobre el estado.
//   3. Respuesta: cifra, tabla corta, «cómo lo calculé» y supuestos. Nunca inventa cifras: si falta el dato, lo dice.
//   4. Acciones: se PROPONEN (quedan guardadas en d.asistenteLog) y solo se ejecutan con confirmación explícita y auditadas.
//   5. Permisos por rol: gerente solo ve su sucursal; admin/dirección todo. Lo que excede el permiso se dice.
import { auditar, uid } from "./core.js";
import * as R from "./reglas.js";
import { carteraVencida } from "./selectors.js";
import { crearTraspaso } from "./acciones_almacen.js";
import { hoy, dia, ahoraLocal, sumarDias, diasEntre, parse, ymd, normaliza, dinero, redondear } from "../lib/format.js";

export const AVISO_ASISTENTE = "Asistente de demostración con motor de reglas; en producción se conecta a un modelo de lenguaje (llave de servicio pendiente).";
export const ROLES_ASISTENTE = ["gerente", "admin", "direccion"];
const JORNADA_MIN = 8 * 60; // capacidad de un consultorio por día (supuesto: 8 h de atención)

/**
 * INTEGRACIÓN: modelo de lenguaje. En producción, esta función recibe la pregunta y el contexto (rol, sucursales, esquema semántico)
 * y devuelve la respuesta o la intención estructurada. En demo no hay llave de servicio: devuelve null y se usa el motor de reglas.
 */
// eslint-disable-next-line no-unused-vars
export async function responderConModelo(pregunta, contexto) { return null; }

// ───────────────────────── Capa semántica
export const METRICAS = {
  ventas: { titulo: "Ventas", sinonimos: ["vendió", "ventas", "ingresos", "facturación"], definicion: "Suma del total de tickets no cancelados (sin restar devoluciones). Meses cerrados completos salen del histórico mensual." },
  ticket: { titulo: "Ticket promedio", sinonimos: ["ticket", "promedio por venta"], definicion: "Ventas ÷ número de tickets no cancelados." },
  citas: { titulo: "Citas", sinonimos: ["citas", "agenda"], definicion: "Citas con inicio en el periodo, por estado." },
  podologo_top: { titulo: "Podólogo con más consultas", sinonimos: ["podólogo con más consultas", "quién atendió más"], definicion: "Consultas registradas (d.consultas) por podólogo." },
  faltante_caja: { titulo: "Faltante de caja", sinonimos: ["faltante de caja", "diferencia de corte"], definicion: "Suma de las diferencias negativas de los cortes de caja cerrados en el periodo (los positivos se informan como sobrante)." },
  cartera_vencida: { titulo: "Cartera vencida", sinonimos: ["cartera vencida", "cobranza"], definicion: "Capital pendiente de parcialidades vencidas (pasada la gracia), sin intereses ni recargos." },
  atraso_credito: { titulo: "Pacientes con atraso", sinonimos: ["pacientes con crédito atrasados", "morosos"], definicion: "Planes de crédito/plazos vigentes cuya parcialidad vencida más antigua supera N días." },
  utilidad: { titulo: "Utilidad por sucursal", sinonimos: ["utilidad", "ganancia", "rentabilidad"], definicion: "Ingresos − costo de producto y laboratorio − gastos − nómina (según lo que exista capturado)." },
  bono_meta: { titulo: "Avance de meta de bono", sinonimos: ["meta", "bono", "en meta"], definicion: "Ventas del mes ÷ meta mensual de la sucursal (d.bonos.metas; si falta, meta sugerida = promedio de los últimos 3 meses)." },
  agotarse: { titulo: "Productos por agotarse", sinonimos: ["por agotarse", "bajo mínimo"], definicion: "Existencia del almacén de la sucursal contra el mínimo del producto." },
  existencia: { titulo: "Existencia", sinonimos: ["cuántos hay", "existencia"], definicion: "Piezas en las capas PEPS del almacén de la sucursal." },
  pedidos_pendientes: { titulo: "Pedidos en línea pendientes", sinonimos: ["pedidos en línea", "pedidos web"], definicion: "Pedidos en estado nuevo, preparando o listo." },
  ocupacion: { titulo: "Ocupación de consultorios", sinonimos: ["ocupación", "agenda llena"], definicion: `Minutos de citas no canceladas ÷ (consultorios × ${JORNADA_MIN / 60} h × días del periodo).` },
  mas_vendidos: { titulo: "Productos más vendidos", sinonimos: ["más vendidos", "top de productos"], definicion: "Piezas e importe de partidas de producto por producto." },
};

export const SUGERENCIAS = {
  gerente: ["¿Cuánto he vendido hoy?", "¿Cuál es el ticket promedio de este mes?", "¿Qué productos están por agotarse?", "¿Cuánto fue el faltante de caja de esta semana?", "¿Qué pacientes con crédito llevan más de 30 días de atraso?", "¿Cuántas citas hay hoy?", "¿Cuál es la ocupación de hoy?", "¿Quién va en meta para el bono de este mes?"],
  admin: ["¿Qué sucursal vendió más plantillas este trimestre?", "¿Cuál es la utilidad de cada sucursal?", "¿Quién va en meta para el bono de este mes?", "¿Cuánto fue el faltante de caja de esta semana?", "¿Qué pacientes con crédito llevan más de 30 días de atraso?", "¿Qué producto está por agotarse en la sucursal Norte?", "¿Qué podólogo tuvo más consultas esta semana?", "¿Cuántos pedidos en línea hay pendientes?"],
};
const ACCIONES_SUGERIDAS = ["Solicita un traspaso de 5 bastones a la sucursal Norte", "Recuerda el pago a los pacientes con atraso"];

// ───────────────────────── Periodos
const dif = (a, b) => diasEntre(a, b);
const finMes = (ym) => { const [y, m] = ym.split("-").map(Number); return ymd(new Date(y, m, 0)); };
const mesDe = (f) => f.slice(0, 7);
const mesAnterior = (ym) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 2, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const NOM_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (ym) => `${NOM_MES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Periodos reconocidos: hoy, ayer, semana (lunes a hoy), semana_pasada, mes (1.º a hoy), mes_pasado, trimestre (natural, a hoy), dias:N. */
export function periodoDe(clave, ref = hoy()) {
  const lunes = sumarDias(ref, -((parse(ref).getDay() + 6) % 7));
  const [y, m] = [Number(ref.slice(0, 4)), Number(ref.slice(5, 7))];
  switch (clave) {
    case "hoy": return { clave, desde: ref, hasta: ref, etiqueta: "hoy" };
    case "ayer": { const a = sumarDias(ref, -1); return { clave, desde: a, hasta: a, etiqueta: "ayer" }; }
    case "semana": return { clave, desde: lunes, hasta: ref, etiqueta: "esta semana (lunes a hoy)" };
    case "semana_pasada": return { clave, desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1), etiqueta: "la semana pasada" };
    case "mes": return { clave, desde: `${ref.slice(0, 7)}-01`, hasta: ref, etiqueta: `${nombreMes(ref.slice(0, 7))} (del 1.º a hoy)` };
    case "mes_pasado": { const pm = mesAnterior(ref.slice(0, 7)); return { clave, desde: `${pm}-01`, hasta: finMes(pm), etiqueta: nombreMes(pm) }; }
    case "trimestre": { const q = Math.floor((m - 1) / 3) * 3 + 1; const ini = `${y}-${String(q).padStart(2, "0")}-01`; return { clave, desde: ini, hasta: ref, etiqueta: `el trimestre (${nombreMes(ini.slice(0, 7))} a hoy)` }; }
    default: { const n = /^dias:(\d+)$/.exec(clave || ""); if (n) return { clave, desde: sumarDias(ref, -(Number(n[1]) - 1)), hasta: ref, etiqueta: `los últimos ${n[1]} días` }; return null; }
  }
}
function detectarPeriodo(t) {
  if (/\bayer\b/.test(t)) return "ayer";
  if (/\bhoy\b/.test(t)) return "hoy";
  if (/ultimos?\s+(\d+)\s+dias/.exec(t)) return `dias:${/ultimos?\s+(\d+)\s+dias/.exec(t)[1]}`;
  if (/semana (pasada|anterior)/.test(t)) return "semana_pasada";
  if (/\bsemana\b|semanal/.test(t)) return "semana";
  if (/trimestre/.test(t)) return "trimestre";
  if (/mes (pasado|anterior)|ultimo mes cerrado/.test(t)) return "mes_pasado";
  if (/\bmes\b|mensual/.test(t)) return "mes";
  return null;
}

// ───────────────────────── Entidades
const CATEGORIAS = [["Plantillas", /\bplantilla/], ["Bastones", /\bbaston/], ["Andaderas", /\bandader/], ["Calzado", /\b(calzado|zapato|tenis)/], ["Cremas", /\bcrema/], ["Calcetas", /\b(calceta|calcetin)/]];

/** Convierte el texto libre en intención + entidades. Determinista: la misma frase siempre da lo mismo. */
export function entender(d, texto, ref = hoy()) {
  const t = normaliza(texto).replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  const q = { texto, t, ref, intencion: null, periodo: null, sucursalIds: [], categoria: null, productoId: null, comparativo: false, miSucursal: false, n: null, cant: null, accion: null };
  q.periodo = detectarPeriodo(t);
  // El nombre se escapa: los de sucursal pueden llevar paréntesis, p. ej. «Centro Tepozán (Los Reyes)»; y se acepta también sin ellos.
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  d.sucursales.forEach((s) => {
    const n = normaliza(s.nombre), corto = n.replace(/\s*\(.*\)\s*/, " ").trim();
    if ([n, corto].some((v) => new RegExp(`(^|[^a-z0-9])${esc(v)}(?![a-z0-9])`).test(t))) q.sucursalIds.push(s.id);
  });
  q.miSucursal = /\b(mi sucursal|esta sucursal|aqui|mi tienda)\b/.test(t);
  q.comparativo = /(que sucursal|cual sucursal|cada sucursal|por sucursal|todas las sucursales|ranking|mejor sucursal|peor sucursal|las sucursales|entre sucursales)/.test(t);
  const prod = d.productos.find((p) => t.includes(normaliza(p.nombre).replace(/\s*\d+\s*(ml|%)?\s*$/, "")) && normaliza(p.nombre).length > 8);
  if (prod) q.productoId = prod.id;
  const cat = CATEGORIAS.find(([, re]) => re.test(t));
  if (cat) q.categoria = cat[0];
  const nd = /(\d+)\s*dias/.exec(t); if (nd && !/ultimos?\s+\d+\s+dias/.test(t)) q.n = Number(nd[1]);
  const nc = /\b(\d+)\s*(piezas?|pzas?|unidades?)?\s*(de\s+)?(?=[a-z])/.exec(t.replace(/\b\d+\s*dias\b/, "")); if (nc) q.cant = Number(nc[1]);

  const has = (re) => re.test(t);
  // Acciones (primero: «solicita un traspaso…», «recuerda el pago…»)
  if (has(/\btraspas/) && has(/(solicit|pide|pedir|crea|crear|genera|generar|haz|hazme|manda|mandar|envia|enviar|necesito|quiero|prepara)/)) q.intencion = "accion_traspaso";
  else if (has(/(recuerd|recordatorio|recordar|avisa|notifica|cobra)/) && has(/(pago|atras|cobr|mora|adeud)/) && !has(/^(quien|cuanto|cuantos|que|cual)/)) q.intencion = "accion_recordar";
  // Consultas
  else if (has(/(faltante|sobrante|descuadre|diferencia)/) && has(/(caja|corte|efectivo|turno|cajer)/)) q.intencion = "faltante_caja";
  else if (has(/cartera/)) q.intencion = "cartera_vencida";
  else if (has(/(atras|moros|mora|vencid|adeud|deuda)/) && has(/(paciente|credito|plazo|cliente)/)) q.intencion = "atraso_credito";
  else if (has(/(utilidad|ganancia|rentabilidad|margen|resultado)/)) q.intencion = "utilidad";
  else if (has(/(bono|\bmeta\b|\bmetas\b|en meta|cumpl)/)) q.intencion = "bono_meta";
  else if (has(/(agot|acab|bajo (el )?minimo|poco (stock|inventario)|stock bajo|escas|reponer|resurtir|por terminarse)/)) q.intencion = "agotarse";
  else if (has(/(pedido|compras? en linea|tienda en linea|e-?commerce|\bweb\b)/)) q.intencion = "pedidos_pendientes";
  else if (has(/(ocupacion|ocupad|aprovechamiento)/)) q.intencion = "ocupacion";
  else if (has(/podolog|doctor|especialista/) && has(/(mas|mayor|top|mejor|quien|cual)/)) q.intencion = "podologo_top";
  else if (has(/quien (atendio|vio|tuvo)/)) q.intencion = "podologo_top";
  else if (has(/(mas vendid|top.*producto|producto.*mas vend|lo que mas se vende)/)) q.intencion = "mas_vendidos";
  else if (has(/(ticket|promedio)/)) q.intencion = "ticket";
  else if (has(/(vend|venta|ingres|factur|cobramos|facturamos)/)) q.intencion = "ventas";
  else if (has(/\bcita|\bagenda|agendad/)) q.intencion = "citas";
  else if (has(/(cuant[oa]s?|existencia|inventario|stock|quedan|tenemos|hay)/) && (q.productoId || q.categoria)) q.intencion = "existencia";
  return q;
}

// ───────────────────────── Permisos y alcance
function ambitoDe(d, u) {
  const ids = u.rol === "gerente" ? u.sucursales.filter((s) => d.sucursales.some((x) => x.id === s)) : d.sucursales.map((s) => s.id);
  return { ids, todas: ids.length === d.sucursales.length };
}
const nomSuc = (d, id) => R.nombreSucursal(d, id);
const sinPermiso = (d, q, texto, extra = {}) => ({ tipo: "sin_permiso", intencion: q.intencion, titulo: "Fuera de tu permiso", texto, como: [], supuestos: [], datos: {}, ...extra });
const sinDato = (q, texto, como = []) => ({ tipo: "sin_dato", intencion: q.intencion, titulo: "No tengo ese dato", texto, como, supuestos: [], datos: {} });

/** Sucursales sobre las que se responde; null si hay que negar por permiso (con la respuesta lista). */
function alcance(d, u, q, sucActiva) {
  const amb = ambitoDe(d, u);
  const nombradas = q.sucursalIds;
  const fuera = nombradas.filter((id) => !amb.ids.includes(id));
  if (fuera.length) return { negar: sinPermiso(d, q, `No tienes permiso para ver datos de ${fuera.map((id) => nomSuc(d, id)).join(", ")}. Como ${u.rol === "gerente" ? "gerente" : u.rol}, tu alcance es: ${amb.ids.map((id) => nomSuc(d, id)).join(", ")}.`) };
  if (q.comparativo && amb.ids.length === 1 && !nombradas.length) return { negar: sinPermiso(d, q, `Esa pregunta compara sucursales y tu alcance es solo ${nomSuc(d, amb.ids[0])}. La comparación entre sucursales la ve administración o dirección. Puedo responderla solo para tu sucursal si lo pides así.`) };
  let ids = nombradas.length ? nombradas : q.miSucursal && amb.ids.includes(sucActiva) ? [sucActiva] : amb.ids;
  return { ids, amb, nombradas: nombradas.length > 0 };
}

// ───────────────────────── Consultas puras (exportadas para pruebas)
const vigente = (v) => v.estado !== "cancelada";
const esCategoria = (d, p, cat) => (p.tipo === "producto" ? (d.productos.find((x) => x.id === p.itemId) || {}).categoria === cat : cat === "Plantillas" && p.tipo === "anticipo" && /plantilla/i.test(p.nombre));
const importeFiltro = (d, v, f) => {
  if (f.productoId) return v.partidas.filter((p) => p.tipo === "producto" && p.itemId === f.productoId).reduce((a, p) => a + p.importe, 0);
  if (f.categoria) return v.partidas.filter((p) => esCategoria(d, p, f.categoria)).reduce((a, p) => a + p.importe, 0);
  return v.total;
};
export function ventasDetalle(d, sucursalId, desde, hasta) {
  return d.ventas.filter((v) => vigente(v) && v.sucursalId === sucursalId && dia(v.fecha) >= desde && dia(v.fecha) <= hasta);
}
/**
 * Ventas de una sucursal en un rango. Para cada mes: si el rango lo cubre completo y existe en d.hist, usa el histórico mensual
 * (solo total o categoría "Plantillas": el histórico no desglosa más); si no, suma los tickets reales del rango.
 */
export function ventasSucursal(d, sucursalId, desde, hasta, filtro = {}) {
  let total = 0; const fuentes = []; const avisos = [];
  let m = mesDe(desde);
  while (m <= mesDe(hasta)) {
    const ini = `${m}-01`, fin = finMes(m), cubre = desde <= ini && hasta >= fin;
    const h = (d.hist || []).find((x) => x.sucursalId === sucursalId && x.mes === m);
    const sinFiltro = !filtro.categoria && !filtro.productoId;
    if (cubre && h && (sinFiltro || filtro.categoria === "Plantillas") && !filtro.productoId) {
      const imp = sinFiltro ? h.servicios + h.plantillas + h.productos : h.plantillas;
      total += imp; fuentes.push({ mes: m, fuente: "historico", importe: imp });
    } else {
      const a = desde > ini ? desde : ini, b = hasta < fin ? hasta : fin;
      const imp = redondear(ventasDetalle(d, sucursalId, a, b).reduce((s, v) => s + importeFiltro(d, v, filtro), 0));
      total += imp; fuentes.push({ mes: m, fuente: "ventas", importe: imp });
      if (cubre && h && !sinFiltro) avisos.push(`El histórico de ${nombreMes(m)} no desglosa ese producto/categoría: solo cuento tickets detallados (que pueden no existir para ese mes).`);
    }
    const [y, mm] = m.split("-").map(Number); const nx = new Date(y, mm, 1); m = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, "0")}`;
  }
  return { total: redondear(total), fuentes, avisos };
}
export const primeraVenta = (d) => d.ventas.reduce((mn, v) => (dia(v.fecha) < mn ? dia(v.fecha) : mn), "9999-99-99");
const notaCobertura = (d, desde, fuentes) => {
  if (!fuentes.some((f) => f.fuente === "ventas")) return null;
  const pv = primeraVenta(d);
  return pv > desde ? `Los tickets detallados del sistema empiezan el ${pv}; lo anterior a esa fecha solo existe como histórico mensual, así que el periodo puede estar incompleto.` : null;
};
export const vendedorDe = (v) => v.vendedorId ?? v.cajeroId;

export function faltanteCaja(d, ids, desde, hasta) {
  const filas = [];
  d.turnos.filter((t) => ids.includes(t.sucursalId) && t.corte).forEach((t) => {
    const f = t.corte.fecha || dia(t.cerradoEn || "");
    if (!f || f < desde || f > hasta) return;
    (t.corte.filas || []).forEach((x) => { if (x.diferencia) filas.push({ turnoId: t.id, sucursalId: t.sucursalId, fecha: f, cajeroId: t.cajeroId, forma: x.forma, diferencia: x.diferencia, justificacion: t.corte.justificacion || "" }); });
  });
  const faltante = redondear(-filas.filter((x) => x.diferencia < 0).reduce((a, x) => a + x.diferencia, 0));
  const sobrante = redondear(filas.filter((x) => x.diferencia > 0).reduce((a, x) => a + x.diferencia, 0));
  return { filas, faltante, sobrante };
}
export function planesConAtraso(d, ids, minDias, ref = hoy()) {
  return d.planes.filter((p) => ids.includes(p.sucursalId) && !["liquidado", "cancelado", "pendiente_autorizacion"].includes(p.estado))
    .map((p) => ({ plan: p, dias: R.diasMoraPlan(d, p, ref), saldo: R.saldoPlan(d, p, ref) }))
    .filter((x) => x.dias > minDias).sort((a, b) => b.dias - a.dias);
}
export function productosPorAgotarse(d, ids, filtro = {}) {
  const res = [];
  ids.forEach((sid) => d.productos.filter((p) => (p.tipo === "venta" || p.tipo === "insumo") && p.minimo > 0).forEach((p) => {
    if (filtro.productoId && p.id !== filtro.productoId) return;
    if (filtro.categoria && p.categoria !== filtro.categoria) return;
    const stock = R.stock(d, sid, p.id), ratio = p.minimo ? stock / p.minimo : 9;
    if (stock < p.minimo || stock <= Math.ceil(p.minimo * 1.25)) res.push({ sucursalId: sid, productoId: p.id, nombre: p.nombre, tipo: p.tipo, stock, minimo: p.minimo, ratio, nivel: stock < p.minimo ? "bajo_minimo" : "cerca" });
  }));
  return res.sort((a, b) => a.ratio - b.ratio || a.nombre.localeCompare(b.nombre) || a.sucursalId.localeCompare(b.sucursalId));
}
export function utilidadSucursal(d, sucursalId, mes, ref = hoy()) {
  const actual = mesDe(ref) === mes;
  let ingresos, costo, fuente;
  const h = (d.hist || []).find((x) => x.sucursalId === sucursalId && x.mes === mes);
  if (h && !actual) { ingresos = h.servicios + h.plantillas + h.productos; costo = h.costo; fuente = "historico"; }
  else {
    const vs = ventasDetalle(d, sucursalId, `${mes}-01`, finMes(mes));
    ingresos = redondear(vs.reduce((a, v) => a + v.total, 0));
    costo = redondear(vs.reduce((a, v) => a + v.partidas.reduce((s, p) => s + (p.costo || 0) * p.cant, 0), 0)); fuente = "ventas";
  }
  const gastosL = d.fin && Array.isArray(d.fin.gastos) ? d.fin.gastos.filter((g) => g.sucursalId === sucursalId && String(g.fecha).startsWith(mes)) : null;
  const gastos = gastosL ? redondear(gastosL.reduce((a, g) => a + g.monto, 0)) : null;
  const nominaEnGastos = gastosL ? gastosL.some((g) => /n[oó]mina|sueldo/i.test(g.categoria || "")) : false;
  const emps = d.rh && Array.isArray(d.rh.empleados) ? d.rh.empleados.filter((e) => e.estado !== "baja" && e.sucursalBase === sucursalId) : null;
  const nomina = emps && !nominaEnGastos ? redondear(emps.reduce((a, e) => a + (e.sueldoMensual || 0), 0)) : 0;
  const utilBruta = redondear(ingresos - costo);
  const completa = gastos !== null;
  return { sucursalId, mes, fuente, ingresos, costo, gastos, nomina, nominaEnGastos, nominaDisponible: emps !== null, utilidadBruta: utilBruta, utilidad: completa ? redondear(utilBruta - gastos - nomina) : null };
}
export function metaBono(d, sucursalId, mes) {
  const m = d.bonos && Array.isArray(d.bonos.metas) ? d.bonos.metas.find((x) => x.sucursalId === sucursalId && x.mes === mes) : null;
  if (m) return { meta: m.meta, origen: "capturada" };
  const h = (d.hist || []).filter((x) => x.sucursalId === sucursalId).sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 3);
  if (!h.length) return null;
  return { meta: redondear(h.reduce((a, x) => a + x.servicios + x.plantillas + x.productos, 0) / h.length), origen: "sugerida" };
}

// ───────────────────────── Armado de respuestas
const ok = (q, o) => ({ tipo: "respuesta", intencion: q.intencion, supuestos: [], como: [], datos: {}, ...o });
const sufijoPeriodo = (q, defecto) => { const clave = q.periodo || defecto; return { p: periodoDe(clave, q.ref), supuesto: q.periodo ? null : `No indicaste periodo: asumí ${periodoDe(defecto, q.ref).etiqueta}.` }; };
const filtroEt = (d, q) => (q.productoId ? R.nombreProducto(d, q.productoId) : q.categoria ? q.categoria.toLowerCase() : null);
const tabla = (cols, filas) => ({ cols, filas });
const diaEt = (f) => f.slice(8, 10) + "/" + f.slice(5, 7);

const INTENCIONES = {
  ventas(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "mes");
    const filtro = { productoId: q.productoId, categoria: q.categoria };
    const filas = al.ids.map((id) => ({ sucursalId: id, ...ventasSucursal(d, id, p.desde, p.hasta, filtro) }));
    const total = redondear(filas.reduce((a, x) => a + x.total, 0));
    const orden = [...filas].sort((a, b) => b.total - a.total);
    const et = filtroEt(d, q);
    const top = orden[0];
    const comparar = q.comparativo && al.ids.length > 1;
    const como = [`Sumé ${et ? `las partidas de ${et}` : "el total de los tickets"} no cancelados de ${al.ids.map((i) => nomSuc(d, i)).join(", ")} del ${p.desde} al ${p.hasta}.`];
    const fu = filas.flatMap((x) => x.fuentes.map((f) => `${nomSuc(d, x.sucursalId)} ${f.mes}: ${f.fuente === "historico" ? "histórico mensual" : "tickets registrados"}`));
    if (filas.some((x) => x.fuentes.some((f) => f.fuente === "historico"))) como.push("Los meses cerrados completos salen del histórico mensual; el mes en curso, de los tickets registrados.");
    const supuestos = [supuesto, ...filas.flatMap((x) => x.avisos), notaCobertura(d, p.desde, filas.flatMap((x) => x.fuentes))].filter(Boolean);
    const sinVentas = total === 0;
    return ok(q, {
      titulo: `${et ? `Ventas de ${et}` : "Ventas"} · ${p.etiqueta}`,
      texto: comparar && !sinVentas ? `${nomSuc(d, top.sucursalId)} vendió más ${et ? `de ${et} ` : ""}en ${p.etiqueta}: ${dinero(top.total)} (${redondear((top.total / total) * 100)} % del total de ${dinero(total)}).`
        : sinVentas ? `No hay ventas registradas ${et ? `de ${et} ` : ""}en ${p.etiqueta} para ${al.ids.length === 1 ? nomSuc(d, al.ids[0]) : "el alcance elegido"}.` : `Se vendió ${dinero(total)} ${et ? `de ${et} ` : ""}en ${p.etiqueta}${al.ids.length === 1 ? ` en ${nomSuc(d, al.ids[0])}` : ""}.`,
      cifra: { etiqueta: "Ventas", valor: dinero(total) }, tabla: al.ids.length > 1 ? tabla(["Sucursal", "Ventas"], orden.map((x) => [nomSuc(d, x.sucursalId), dinero(x.total)])) : null,
      como: [...como, ...(al.ids.length <= 3 ? fu : [])], supuestos, datos: { periodo: p, filtro, total, porSucursal: filas.map((x) => ({ sucursalId: x.sucursalId, total: x.total })), mejor: sinVentas ? null : top.sucursalId },
    });
  },

  ticket(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "mes");
    const filas = al.ids.map((id) => { const vs = ventasDetalle(d, id, p.desde, p.hasta); const t = redondear(vs.reduce((a, v) => a + v.total, 0)); return { sucursalId: id, n: vs.length, total: t, prom: vs.length ? redondear(t / vs.length) : null }; });
    const n = filas.reduce((a, x) => a + x.n, 0), t = redondear(filas.reduce((a, x) => a + x.total, 0));
    if (!n) return ok(q, { titulo: `Ticket promedio · ${p.etiqueta}`, texto: `No hay tickets registrados en ${p.etiqueta}, así que no hay promedio que calcular.`, como: ["Ticket promedio = ventas ÷ número de tickets no cancelados."], supuestos: [supuesto].filter(Boolean), datos: { periodo: p, n: 0, promedio: null } });
    return ok(q, {
      titulo: `Ticket promedio · ${p.etiqueta}`, texto: `El ticket promedio es ${dinero(redondear(t / n))} (${n} tickets por ${dinero(t)}).`, cifra: { etiqueta: "Ticket promedio", valor: dinero(redondear(t / n)) },
      tabla: al.ids.length > 1 ? tabla(["Sucursal", "Tickets", "Promedio"], filas.map((x) => [nomSuc(d, x.sucursalId), x.n, x.prom === null ? "—" : dinero(x.prom)])) : null,
      como: [`Ventas ${dinero(t)} ÷ ${n} tickets no cancelados del ${p.desde} al ${p.hasta}.`], supuestos: [supuesto, notaCobertura(d, p.desde, [{ fuente: "ventas" }])].filter(Boolean), datos: { periodo: p, n, total: t, promedio: redondear(t / n), porSucursal: filas.map((x) => ({ sucursalId: x.sucursalId, n: x.n, prom: x.prom })) },
    });
  },

  citas(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "hoy");
    const cs = d.citas.filter((c) => al.ids.includes(c.sucursalId) && dia(c.inicio) >= p.desde && dia(c.inicio) <= p.hasta);
    const por = (est) => cs.filter((c) => est.includes(c.estado)).length;
    const activas = cs.filter((c) => !["cancelada", "no_asistio"].includes(c.estado)).length;
    return ok(q, {
      titulo: `Citas · ${p.etiqueta}`, texto: `Hay ${cs.length} citas ${p.etiqueta}${al.ids.length === 1 ? ` en ${nomSuc(d, al.ids[0])}` : ""}: ${activas} vigentes o atendidas, ${por(["cancelada"])} canceladas y ${por(["no_asistio"])} no asistieron.`,
      cifra: { etiqueta: "Citas", valor: String(cs.length) },
      tabla: al.ids.length > 1 ? tabla(["Sucursal", "Citas"], al.ids.map((id) => [nomSuc(d, id), cs.filter((c) => c.sucursalId === id).length])) : null,
      como: [`Cuento las citas con inicio del ${p.desde} al ${p.hasta} en ${al.ids.map((i) => nomSuc(d, i)).join(", ")}.`], supuestos: [supuesto].filter(Boolean),
      datos: { periodo: p, total: cs.length, vigentes: activas, canceladas: por(["cancelada"]), noAsistio: por(["no_asistio"]), porSucursal: al.ids.map((id) => ({ sucursalId: id, n: cs.filter((c) => c.sucursalId === id).length })) },
    });
  },

  podologo_top(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "semana");
    const cs = d.consultas.filter((c) => al.ids.includes(c.sucursalId) && dia(c.fecha) >= p.desde && dia(c.fecha) <= p.hasta);
    const m = new Map(); cs.forEach((c) => m.set(c.podologoId, (m.get(c.podologoId) || 0) + 1));
    const rank = [...m].map(([id, n]) => ({ podologoId: id, n })).sort((a, b) => b.n - a.n || R.nombreUsuario(d, a.podologoId).localeCompare(R.nombreUsuario(d, b.podologoId)));
    if (!rank.length) return ok(q, { titulo: `Consultas por podólogo · ${p.etiqueta}`, texto: `No hay consultas registradas en ${p.etiqueta}.`, como: ["Cuento d.consultas por podólogo."], supuestos: [supuesto].filter(Boolean), datos: { periodo: p, ranking: [] } });
    return ok(q, {
      titulo: `Consultas por podólogo · ${p.etiqueta}`, texto: `${R.nombreUsuario(d, rank[0].podologoId)} tuvo más consultas en ${p.etiqueta}: ${rank[0].n}.`, cifra: { etiqueta: "Consultas del primero", valor: String(rank[0].n) },
      tabla: tabla(["Podólogo", "Consultas"], rank.slice(0, 6).map((x) => [R.nombreUsuario(d, x.podologoId), x.n])),
      como: [`Cuento las consultas (d.consultas) con fecha del ${p.desde} al ${p.hasta} en ${al.ids.map((i) => nomSuc(d, i)).join(", ")} y las agrupo por podólogo.`], supuestos: [supuesto].filter(Boolean), datos: { periodo: p, ranking: rank, primero: rank[0].podologoId },
    });
  },

  faltante_caja(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "semana");
    const r = faltanteCaja(d, al.ids, p.desde, p.hasta);
    const cortes = new Set(d.turnos.filter((t) => al.ids.includes(t.sucursalId) && t.corte && (t.corte.fecha || "") >= p.desde && (t.corte.fecha || "") <= p.hasta).map((t) => t.id)).size;
    return ok(q, {
      titulo: `Faltante de caja · ${p.etiqueta}`,
      texto: r.faltante === 0 && r.sobrante === 0 ? `No hubo diferencias de caja en ${p.etiqueta} (${cortes} cortes revisados).` : `El faltante de caja de ${p.etiqueta} fue ${dinero(r.faltante)}${r.sobrante ? ` y hubo ${dinero(r.sobrante)} de sobrante` : ""}.`,
      cifra: { etiqueta: "Faltante", valor: dinero(r.faltante) },
      tabla: r.filas.length ? tabla(["Sucursal", "Fecha", "Cajero", "Forma", "Diferencia"], r.filas.map((x) => [nomSuc(d, x.sucursalId), diaEt(x.fecha), R.nombreUsuario(d, x.cajeroId).replace(/ \(.*\)/, ""), x.forma, dinero(x.diferencia)])) : null,
      como: [`Sumo las diferencias negativas de los cortes de caja con fecha del ${p.desde} al ${p.hasta} (${cortes} cortes). Los positivos se informan aparte como sobrante.`], supuestos: [supuesto].filter(Boolean),
      datos: { periodo: p, faltante: r.faltante, sobrante: r.sobrante, filas: r.filas, cortes },
    });
  },

  cartera_vencida(d, u, q, al) {
    const filas = al.ids.map((id) => ({ sucursalId: id, monto: carteraVencida(d, id) }));
    const total = redondear(filas.reduce((a, x) => a + x.monto, 0));
    const cuantos = d.planes.filter((p) => al.ids.includes(p.sucursalId) && R.diasMoraPlan(d, p) > 0).length;
    return ok(q, {
      titulo: "Cartera vencida", texto: `La cartera vencida es ${dinero(total)} en ${cuantos} planes con parcialidades vencidas.`, cifra: { etiqueta: "Cartera vencida", valor: dinero(total) },
      tabla: al.ids.length > 1 ? tabla(["Sucursal", "Vencido"], [...filas].sort((a, b) => b.monto - a.monto).map((x) => [nomSuc(d, x.sucursalId), dinero(x.monto)])) : null,
      como: ["Sumo el capital pendiente de las parcialidades ya vencidas (pasados los días de gracia). No incluye intereses ni recargos."], datos: { total, planes: cuantos, porSucursal: filas },
    });
  },

  atraso_credito(d, u, q, al) {
    const n = q.n ?? 30;
    const lista = planesConAtraso(d, al.ids, n, q.ref);
    if (!lista.length) return ok(q, { titulo: `Atraso de más de ${n} días`, texto: `Ningún paciente con crédito lleva más de ${n} días de atraso.`, como: ["Reviso los planes vigentes y la parcialidad vencida más antigua de cada uno."], datos: { n, lista: [] } });
    const tot = redondear(lista.reduce((a, x) => a + x.saldo.vencido, 0));
    return ok(q, {
      titulo: `Pacientes con más de ${n} días de atraso`, texto: `${lista.length} paciente${lista.length === 1 ? "" : "s"} con crédito llevan más de ${n} días de atraso, con ${dinero(tot)} vencido en total.`, cifra: { etiqueta: "Pacientes", valor: String(lista.length) },
      tabla: tabla(["Paciente", "Plan", "Días", "Vencido"], lista.slice(0, 8).map((x) => [R.nombrePaciente(d, x.plan.pacienteId), x.plan.folio, x.dias, dinero(x.saldo.vencido)])),
      como: [`Tomo los planes vigentes (crédito y plazos) y calculo los días desde el vencimiento de su parcialidad vencida más antigua; muestro los de más de ${n} días. «Vencido» incluye capital y mora.`],
      acciones: [{ tipo: "recordar_pago", params: { planIds: lista.map((x) => x.plan.id), minDias: n }, resumen: `Registrar recordatorio de pago a ${lista.length} paciente(s) con atraso (${dinero(tot)} vencido)` }],
      datos: { n, lista: lista.map((x) => ({ planId: x.plan.id, pacienteId: x.plan.pacienteId, dias: x.dias, vencido: x.saldo.vencido })), total: tot },
    });
  },

  utilidad(d, u, q, al) {
    const clave = q.periodo || "mes_pasado";
    const p = periodoDe(clave, q.ref);
    const mes = mesDe(p.desde);
    const filas = al.ids.map((id) => utilidadSucursal(d, id, mes, q.ref));
    const falta = filas.some((x) => x.utilidad === null);
    const supuestos = [];
    if (!q.periodo) supuestos.push(`No indicaste periodo: usé ${nombreMes(mes)}, el último mes cerrado (el mes en curso está incompleto).`);
    if (mesDe(q.ref) === mes) supuestos.push("El mes en curso es parcial: solo hay tickets detallados de los últimos días, pero los gastos y la nómina son de todo el mes; la utilidad sale subestimada.");
    if (q.periodo && !["mes", "mes_pasado"].includes(clave)) supuestos.push("La utilidad se calcula por mes; usé el mes de inicio del periodo.");
    if (falta) supuestos.push("No hay gastos capturados (módulo de finanzas): muestro la utilidad bruta (ingresos − costo de producto y laboratorio), no la utilidad neta.");
    if (filas.some((x) => !x.nominaDisponible)) supuestos.push("No hay plantilla de personal capturada (módulo de personas): la nómina no entra al cálculo.");
    if (filas.some((x) => x.nominaEnGastos)) supuestos.push("La nómina ya viene dentro de los gastos capturados; no la sumé otra vez.");
    const campo = falta ? "utilidadBruta" : "utilidad";
    const orden = [...filas].sort((a, b) => b[campo] - a[campo]);
    const tot = redondear(filas.reduce((a, x) => a + x[campo], 0));
    return ok(q, {
      titulo: `${falta ? "Utilidad bruta" : "Utilidad"} por sucursal · ${nombreMes(mes)}`, texto: `${nomSuc(d, orden[0].sucursalId)} tuvo la mayor ${falta ? "utilidad bruta" : "utilidad"} en ${nombreMes(mes)}: ${dinero(orden[0][campo])}${filas.length > 1 ? `; el total de las ${filas.length} sucursales es ${dinero(tot)}` : ""}.`,
      cifra: { etiqueta: falta ? "Utilidad bruta" : "Utilidad", valor: dinero(tot) },
      tabla: tabla(["Sucursal", "Ingresos", "Costo", "Gastos", "Nómina", falta ? "Util. bruta" : "Utilidad"], orden.map((x) => [nomSuc(d, x.sucursalId), dinero(x.ingresos), dinero(x.costo), x.gastos === null ? "s/d" : dinero(x.gastos), dinero(x.nomina), dinero(x[campo])])),
      como: [`Ingresos y costo de ${nombreMes(mes)} ${filas.every((x) => x.fuente === "historico") ? "del histórico mensual (d.hist)" : "de los tickets registrados"}; gastos de d.fin.gastos${falta ? " (no disponible)" : ""}; nómina de d.rh.empleados activos por sucursal base.`, "Utilidad = ingresos − costo − gastos − nómina."],
      supuestos, datos: { mes, filas, tot, bruta: falta },
    });
  },

  bono_meta(d, u, q, al) {
    const mes = mesDe(q.ref), p = periodoDe("mes", q.ref);
    const diasMes = Number(finMes(mes).slice(8)), diaHoy = Number(q.ref.slice(8));
    const filas = al.ids.map((id) => {
      const mt = metaBono(d, id, mes), v = ventasSucursal(d, id, p.desde, p.hasta).total;
      const esperado = mt ? redondear((mt.meta * diaHoy) / diasMes) : null;
      return { sucursalId: id, ventas: v, meta: mt ? mt.meta : null, origen: mt ? mt.origen : null, avance: mt && mt.meta ? redondear((v / mt.meta) * 100) : null, esperado, enRitmo: mt ? v >= esperado : null };
    });
    if (filas.every((x) => x.meta === null)) return sinDato(q, `No encuentro metas de bono para ${nombreMes(mes)} ni histórico para sugerirlas. Te puedo decir las ventas del mes por sucursal si lo pides.`, ["Busqué d.bonos.metas y d.hist."]);
    const supuestos = [];
    if (!(d.bonos && d.bonos.metas)) supuestos.push("No hay metas capturadas (módulo de desempeño): usé una meta sugerida = promedio de ventas de los últimos 3 meses cerrados.");
    else if (filas.some((x) => x.origen === "sugerida")) supuestos.push("Para las sucursales sin meta capturada usé una meta sugerida = promedio de los últimos 3 meses.");
    const cob = notaCobertura(d, p.desde, [{ fuente: "ventas" }]); if (cob) supuestos.push(cob);
    const cuantos = filas.filter((x) => x.enRitmo).length;
    const orden = [...filas].sort((a, b) => (b.avance ?? -1) - (a.avance ?? -1));
    return ok(q, {
      titulo: `Avance de meta de bono · ${nombreMes(mes)}`, texto: `${cuantos} de ${filas.length} sucursal${filas.length === 1 ? "" : "es"} van en ritmo de meta al día ${diaHoy} de ${diasMes}.${orden[0].avance !== null ? ` El mayor avance es ${nomSuc(d, orden[0].sucursalId)} con ${orden[0].avance} % de su meta.` : ""}`,
      cifra: { etiqueta: "En ritmo", valor: `${cuantos}/${filas.length}` },
      tabla: tabla(["Sucursal", "Ventas", "Meta", "Avance", "Ritmo"], orden.map((x) => [nomSuc(d, x.sucursalId), dinero(x.ventas), x.meta === null ? "s/d" : dinero(x.meta), x.avance === null ? "—" : `${x.avance} %`, x.enRitmo === null ? "—" : x.enRitmo ? "En ritmo" : "Atrás"])),
      como: [`Ventas del ${p.desde} al ${p.hasta} ÷ meta mensual. «En ritmo» = ventas ≥ meta × (día ${diaHoy} ÷ ${diasMes} días del mes).`], supuestos, datos: { mes, filas },
    });
  },

  agotarse(d, u, q, al) {
    const lista = productosPorAgotarse(d, al.ids, { productoId: q.productoId, categoria: q.categoria });
    const donde = al.ids.length === 1 ? nomSuc(d, al.ids[0]) : "las sucursales";
    if (!lista.length) return ok(q, { titulo: "Productos por agotarse", texto: `Ningún producto${filtroEt(d, q) ? ` de ${filtroEt(d, q)}` : ""} está bajo su mínimo ni cerca de agotarse en ${donde}.`, como: ["Comparo la existencia del almacén contra el mínimo de cada producto."], datos: { lista: [] } });
    const bajo = lista.filter((x) => x.nivel === "bajo_minimo");
    const prim = lista[0];
    const traspaso = al.ids.length === 1 && lista.find((x) => x.tipo === "venta");
    return ok(q, {
      titulo: `Por agotarse en ${donde}`, texto: `${bajo.length} producto${bajo.length === 1 ? "" : "s"} bajo el mínimo en ${donde}${lista.length > bajo.length ? ` y ${lista.length - bajo.length} cerca de agotarse` : ""}. El más urgente: ${prim.nombre}${al.ids.length > 1 ? ` (${nomSuc(d, prim.sucursalId)})` : ""} con ${prim.stock} pieza${prim.stock === 1 ? "" : "s"} y mínimo ${prim.minimo}.`,
      cifra: { etiqueta: "Bajo mínimo", valor: String(bajo.length) },
      tabla: tabla(al.ids.length > 1 ? ["Sucursal", "Producto", "Existencia", "Mínimo"] : ["Producto", "Existencia", "Mínimo", "Nivel"], lista.slice(0, 8).map((x) => (al.ids.length > 1 ? [nomSuc(d, x.sucursalId), x.nombre, x.stock, x.minimo] : [x.nombre, x.stock, x.minimo, x.nivel === "bajo_minimo" ? "Bajo mínimo" : "Cerca"]))),
      como: ["Existencia = piezas en las capas PEPS del almacén de la sucursal. «Bajo mínimo»: existencia < mínimo; «cerca»: hasta 25 % arriba del mínimo."],
      acciones: traspaso ? [{ tipo: "traspaso", params: { destinoId: traspaso.sucursalId, productoId: traspaso.productoId, cant: Math.max(1, traspaso.minimo * 2 - traspaso.stock), origenId: "CEN" }, resumen: `Solicitar traspaso de ${Math.max(1, traspaso.minimo * 2 - traspaso.stock)} × ${traspaso.nombre} del Almacén central a ${nomSuc(d, traspaso.sucursalId)}` }] : [],
      datos: { lista },
    });
  },

  existencia(d, u, q, al) {
    const prods = d.productos.filter((p) => (q.productoId ? p.id === q.productoId : p.categoria === q.categoria));
    const filas = al.ids.map((id) => ({ sucursalId: id, piezas: prods.reduce((a, p) => a + R.stock(d, id, p.id), 0) }));
    const tot = filas.reduce((a, x) => a + x.piezas, 0);
    const et = filtroEt(d, q);
    return ok(q, {
      titulo: `Existencia de ${et}`, texto: `Hay ${tot} pieza${tot === 1 ? "" : "s"} de ${et}${al.ids.length === 1 ? ` en ${nomSuc(d, al.ids[0])}` : " entre las sucursales"}.`, cifra: { etiqueta: "Piezas", valor: String(tot) },
      tabla: al.ids.length > 1 ? tabla(["Sucursal", "Piezas"], filas.map((x) => [nomSuc(d, x.sucursalId), x.piezas])) : tabla(["Producto", "Piezas"], prods.map((p) => [p.nombre, R.stock(d, al.ids[0], p.id)])),
      como: ["Sumo las piezas de las capas PEPS del almacén de cada sucursal (no incluye el almacén central)."], datos: { total: tot, porSucursal: filas },
    });
  },

  pedidos_pendientes(d, u, q, al) {
    const ps = (d.pedidosWeb || []).filter((p) => al.ids.includes(p.sucursalId) && ["nuevo", "preparando", "listo"].includes(p.estado));
    const por = (e) => ps.filter((p) => p.estado === e).length;
    const monto = redondear(ps.reduce((a, p) => a + p.total, 0));
    return ok(q, {
      titulo: "Pedidos en línea pendientes", texto: ps.length ? `Hay ${ps.length} pedidos en línea pendientes por ${dinero(monto)}: ${por("nuevo")} nuevos, ${por("preparando")} preparándose y ${por("listo")} listos para entregar.` : "No hay pedidos en línea pendientes.",
      cifra: { etiqueta: "Pendientes", valor: String(ps.length) },
      tabla: ps.length ? tabla(["Folio", "Sucursal", "Estado", "Total"], ps.slice(0, 8).map((p) => [p.folio, nomSuc(d, p.sucursalId), p.estado, dinero(p.total)])) : null,
      como: ["Cuento los pedidos web en estado nuevo, preparando o listo (no entregados ni cancelados)."], datos: { total: ps.length, nuevo: por("nuevo"), preparando: por("preparando"), listo: por("listo"), monto, folios: ps.map((p) => p.folio) },
    });
  },

  ocupacion(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "hoy");
    const dias = dif(p.desde, p.hasta) + 1;
    const filas = al.ids.map((id) => {
      const cons = (d.sucursales.find((s) => s.id === id).consultorios || []).length;
      const min = d.citas.filter((c) => c.sucursalId === id && dia(c.inicio) >= p.desde && dia(c.inicio) <= p.hasta && !["cancelada", "no_asistio"].includes(c.estado)).reduce((a, c) => a + c.duracion, 0);
      const cap = cons * JORNADA_MIN * dias;
      return { sucursalId: id, minutos: min, capacidad: cap, pct: cap ? redondear((min / cap) * 100) : 0 };
    });
    const min = filas.reduce((a, x) => a + x.minutos, 0), cap = filas.reduce((a, x) => a + x.capacidad, 0), pct = cap ? redondear((min / cap) * 100) : 0;
    return ok(q, {
      titulo: `Ocupación de consultorios · ${p.etiqueta}`, texto: `La ocupación de consultorios en ${p.etiqueta} es ${pct} %${filas.length > 1 ? `; la más alta es ${nomSuc(d, [...filas].sort((a, b) => b.pct - a.pct)[0].sucursalId)}` : ""}.`, cifra: { etiqueta: "Ocupación", valor: `${pct} %` },
      tabla: filas.length > 1 ? tabla(["Sucursal", "Ocupación"], [...filas].sort((a, b) => b.pct - a.pct).map((x) => [nomSuc(d, x.sucursalId), `${x.pct} %`])) : null,
      como: [`Minutos de citas no canceladas ÷ (consultorios × ${JORNADA_MIN / 60} h × ${dias} día${dias === 1 ? "" : "s"}). La jornada de ${JORNADA_MIN / 60} h es un supuesto.`], supuestos: [supuesto].filter(Boolean), datos: { periodo: p, pct, minutos: min, capacidad: cap, porSucursal: filas },
    });
  },

  mas_vendidos(d, u, q, al) {
    const { p, supuesto } = sufijoPeriodo(q, "mes");
    const m = new Map();
    al.ids.forEach((id) => ventasDetalle(d, id, p.desde, p.hasta).forEach((v) => v.partidas.filter((x) => x.tipo === "producto").forEach((x) => { const a = m.get(x.itemId) || { cant: 0, importe: 0 }; a.cant += x.cant; a.importe += x.importe; m.set(x.itemId, a); })));
    const rank = [...m].map(([id, a]) => ({ productoId: id, ...a, importe: redondear(a.importe) })).sort((a, b) => b.cant - a.cant || b.importe - a.importe);
    if (!rank.length) return ok(q, { titulo: `Productos más vendidos · ${p.etiqueta}`, texto: `No hay ventas de producto registradas en ${p.etiqueta}.`, como: ["Agrupo las partidas de producto de los tickets no cancelados."], supuestos: [supuesto].filter(Boolean), datos: { rank: [] } });
    return ok(q, {
      titulo: `Productos más vendidos · ${p.etiqueta}`, texto: `El producto más vendido en ${p.etiqueta} es ${R.nombreProducto(d, rank[0].productoId)}: ${rank[0].cant} pieza${rank[0].cant === 1 ? "" : "s"} por ${dinero(rank[0].importe)}.`,
      tabla: tabla(["Producto", "Piezas", "Importe"], rank.slice(0, 6).map((x) => [R.nombreProducto(d, x.productoId), x.cant, dinero(x.importe)])),
      como: [`Agrupo por producto las partidas de los tickets no cancelados del ${p.desde} al ${p.hasta}.`], supuestos: [supuesto, notaCobertura(d, p.desde, [{ fuente: "ventas" }])].filter(Boolean), datos: { periodo: p, rank },
    });
  },

  accion_traspaso(d, u, q, al) {
    const amb = ambitoDe(d, u);
    let destinoId = q.sucursalIds[0] || (u.rol === "gerente" ? amb.ids[0] : null);
    if (!destinoId) return { tipo: "no_entendi", intencion: q.intencion, titulo: "Falta la sucursal", texto: "¿A qué sucursal debe llegar el traspaso? Por ejemplo: «solicita un traspaso de 5 bastones a la sucursal Norte».", como: [], supuestos: [], datos: {}, sugerencias: ACCIONES_SUGERIDAS };
    if (!amb.ids.includes(destinoId)) return sinPermiso(d, q, `No puedes solicitar traspasos hacia ${nomSuc(d, destinoId)}: solo hacia ${amb.ids.map((i) => nomSuc(d, i)).join(", ")}.`);
    let prod = q.productoId ? d.productos.find((p) => p.id === q.productoId) : null;
    if (!prod && q.categoria) {
      const enCat = d.productos.filter((p) => p.categoria === q.categoria && p.tipo === "venta").sort((a, b) => R.stock(d, destinoId, a.id) / a.minimo - R.stock(d, destinoId, b.id) / b.minimo);
      prod = enCat[0] || null;
    }
    if (!prod) return { tipo: "no_entendi", intencion: q.intencion, titulo: "Falta el producto", texto: "¿Qué producto quieres traspasar? Por ejemplo: «solicita un traspaso de 5 bastones a la sucursal Norte».", como: [], supuestos: [], datos: {}, sugerencias: ACCIONES_SUGERIDAS };
    const stockDest = R.stock(d, destinoId, prod.id);
    const cant = q.cant && q.cant > 0 ? q.cant : Math.max(1, prod.minimo * 2 - stockDest);
    const stockCen = R.stock(d, "CEN", prod.id);
    const supuestos = [];
    if (q.categoria && !q.productoId) supuestos.push(`«${q.categoria}» incluye varios productos: elegí ${prod.nombre}, el más bajo contra su mínimo en ${nomSuc(d, destinoId)}.`);
    if (!q.cant) supuestos.push(`No indicaste cantidad: propongo ${cant} (lo necesario para llegar a dos veces el mínimo de ${prod.minimo}).`);
    if (stockCen < cant) supuestos.push(`El almacén central solo tiene ${stockCen}: el traspaso podría surtirse parcial.`);
    const acc = { tipo: "traspaso", params: { destinoId, productoId: prod.id, cant, origenId: "CEN" }, resumen: `Solicitar traspaso de ${cant} × ${prod.nombre} del Almacén central a ${nomSuc(d, destinoId)}` };
    return { tipo: "propuesta", intencion: q.intencion, titulo: "Acción por confirmar", texto: `Puedo crear la solicitud de traspaso: ${acc.resumen}. No se ejecuta hasta que confirmes con el botón.`, como: ["La solicitud usa el flujo de traspasos de almacén (queda «solicitado» y la autoriza el almacén central)."], supuestos, acciones: [acc], datos: { ...acc.params } };
  },

  accion_recordar(d, u, q, al) {
    const lista = planesConAtraso(d, al.ids, 0, q.ref).filter((x) => x.dias > (q.n ?? 0));
    if (!lista.length) return ok(q, { titulo: "Recordatorio de pago", texto: "No hay pacientes con parcialidades vencidas a quienes recordar el pago.", como: ["Reviso los planes vigentes con parcialidades vencidas."], datos: { lista: [] } });
    const tot = redondear(lista.reduce((a, x) => a + x.saldo.vencido, 0));
    const acc = { tipo: "recordar_pago", params: { planIds: lista.map((x) => x.plan.id), minDias: q.n ?? 0 }, resumen: `Registrar recordatorio de pago a ${lista.length} paciente(s) con atraso (${dinero(tot)} vencido)` };
    return { tipo: "propuesta", intencion: q.intencion, titulo: "Acción por confirmar", texto: `${acc.resumen}. Queda registrado como seguimiento de cobranza; no se envía ningún mensaje real hasta que se conecte WhatsApp.`, como: ["Tomo los planes vigentes con parcialidades vencidas dentro de tu alcance."], supuestos: [], acciones: [acc], tabla: tabla(["Paciente", "Plan", "Días", "Vencido"], lista.slice(0, 8).map((x) => [R.nombrePaciente(d, x.plan.pacienteId), x.plan.folio, x.dias, dinero(x.saldo.vencido)])), datos: { lista: lista.map((x) => x.plan.id) } };
  },
};

const noEntendi = (d, u, q) => ({
  tipo: "no_entendi", intencion: null, titulo: "No entendí la pregunta",
  texto: "No pude relacionar tu pregunta con algo que sepa responder con los datos del sistema, y prefiero no inventar una cifra. Prueba con una de estas:",
  como: [], supuestos: [], datos: {}, sugerencias: (u.rol === "gerente" ? SUGERENCIAS.gerente : SUGERENCIAS.admin).slice(0, 5),
});

/** Responde una pregunta. Pura: no modifica d. u = usuario; sucActiva = sucursal en la que trabaja. */
export function responderAsistente(d, u, sucActiva, texto, ref = hoy()) {
  if (!u || !ROLES_ASISTENTE.includes(u.rol)) return sinPermiso(d, { intencion: null }, "El asistente está disponible para gerentes, administración y dirección.");
  const q = entender(d, texto, ref);
  const f = q.intencion && INTENCIONES[q.intencion];
  if (!f) return { ...noEntendi(d, u, q), q };
  const al = alcance(d, u, q, sucActiva);
  if (al.negar) return { ...al.negar, q };
  const r = f(d, u, q, al);
  return { ...r, q: { intencion: q.intencion, periodo: q.periodo, sucursalIds: q.sucursalIds }, alcance: al.ids, sugerencias: r.sugerencias || [] };
}

// ───────────────────────── Con estado: historial, acciones confirmadas y auditadas
const compacta = (r) => ({ tipo: r.tipo, titulo: r.titulo, texto: r.texto, cifra: r.cifra || null, tabla: r.tabla ? { cols: r.tabla.cols, filas: r.tabla.filas.slice(0, 8) } : null, como: r.como || [], supuestos: r.supuestos || [], sugerencias: r.sugerencias || [] });

/** Consulta + historial (d.asistenteLog). Devuelve la respuesta completa; las acciones propuestas quedan guardadas para confirmarse. */
export function consultarAsistente(d, texto, ref = hoy()) {
  const u = d.usuarios.find((x) => x.id === d.sesion.userId) || null;
  const t = String(texto || "").trim();
  if (t.length < 2) return { tipo: "no_entendi", titulo: "Escribe tu pregunta", texto: "Escribe una pregunta sobre el negocio.", como: [], supuestos: [], datos: {} };
  const r = responderAsistente(d, u, d.sesion.sucursalId, t, ref);
  const acciones = (r.acciones || []).map((a) => ({ id: uid("AA"), ...a, estado: "propuesta" }));
  const entrada = { id: uid("AL"), ts: ahoraLocal(), usuarioId: d.sesion.userId, sucursalId: d.sesion.sucursalId, pregunta: t, intencion: r.intencion || null, respuesta: compacta(r), acciones };
  (d.asistenteLog ||= []).push(entrada);
  if (d.asistenteLog.length > 150) d.asistenteLog.splice(0, d.asistenteLog.length - 150);
  return { ...r, acciones, entradaId: entrada.id };
}
export const historialAsistente = (d, usuarioId) => (d.asistenteLog || []).filter((x) => x.usuarioId === usuarioId);

function hallarAccion(d, accionId, usuarioId) {
  for (const e of d.asistenteLog || []) { const a = (e.acciones || []).find((x) => x.id === accionId); if (a) return { e, a }; }
  return null;
}
export function descartarAccionAsistente(d, accionId) {
  const h = hallarAccion(d, accionId, d.sesion.userId);
  if (!h || h.e.usuarioId !== d.sesion.userId) return { ok: false, error: "La acción no existe." };
  if (h.a.estado !== "propuesta") return { ok: false, error: "La acción ya fue atendida." };
  h.a.estado = "descartada";
  return { ok: true };
}

/**
 * Ejecuta una acción PROPUESTA (solo las guardadas en el historial del propio usuario, con sus parámetros originales) tras la
 * confirmación explícita. Revalida rol y alcance en el dato y deja bitácora de auditoría.
 */
export function ejecutarAccionAsistente(d, accionId) {
  const u = d.usuarios.find((x) => x.id === d.sesion.userId);
  if (!u || !ROLES_ASISTENTE.includes(u.rol)) return { ok: false, error: "Tu rol no puede ejecutar acciones del asistente." };
  const h = hallarAccion(d, accionId);
  if (!h || h.e.usuarioId !== u.id) return { ok: false, error: "La acción no existe o no es tuya." };
  const { a } = h;
  if (a.estado !== "propuesta") return { ok: false, error: "Esta acción ya fue atendida." };
  const amb = ambitoDe(d, u);
  let res;
  if (a.tipo === "traspaso") {
    const { destinoId, productoId, cant, origenId } = a.params;
    if (!amb.ids.includes(destinoId)) return { ok: false, error: "No tienes alcance sobre la sucursal de destino." };
    // Se reutiliza el flujo de traspasos de almacén (crearTraspaso exige rol de almacén de la sucursal destino): el permiso real
    // ya se validó arriba (gerente de esa sucursal o administración), por eso se invoca con el contexto de ese almacén.
    const comoAlmacen = { ...u, rol: "almacen", almacenCentral: false, sucursales: [destinoId] };
    res = crearTraspaso(d, { origenId, destinoId, partidas: [{ productoId, solicitado: cant }] }, comoAlmacen);
    if (!res.ok) return res;
    res.traspaso.solicitadoPor = u.id; res.traspaso.origenSolicitud = "asistente";
    a.resultado = { folio: res.traspaso.folio, id: res.traspaso.id };
  } else if (a.tipo === "recordar_pago") {
    const hechos = [];
    (d.seguimientosCobranza ||= []);
    for (const planId of a.params.planIds) {
      const p = d.planes.find((x) => x.id === planId);
      if (!p || !amb.ids.includes(p.sucursalId)) continue;
      const dias = R.diasMoraPlan(d, p);
      if (dias <= (a.params.minDias || 0)) continue;
      if (d.seguimientosCobranza.some((s) => s.planId === planId && dia(s.fecha) === hoy())) continue; // un recordatorio por plan y día
      const s = { id: uid("SC"), planId, pacienteId: p.pacienteId, sucursalId: p.sucursalId, fecha: ahoraLocal(), diasMora: dias, vencido: R.saldoPlan(d, p).vencido, canal: "pendiente_de_envio", estado: "recordatorio_registrado", usuarioId: u.id, origen: "asistente" };
      d.seguimientosCobranza.unshift(s); hechos.push(s);
    }
    if (!hechos.length) return { ok: false, error: "No se registró nada: ya había un recordatorio hoy o ya no hay atraso." };
    // INTEGRACIÓN: aquí se enviaría el recordatorio por WhatsApp/SMS. En demo solo queda como seguimiento.
    a.resultado = { registrados: hechos.length };
    res = { ok: true, registrados: hechos.length };
  } else return { ok: false, error: "Tipo de acción desconocido." };
  a.estado = "ejecutada"; a.ejecutadaPor = u.id; a.ejecutadaEn = ahoraLocal();
  auditar(d, "asistente_accion", "asistente", a.id, `${a.resumen}${a.resultado?.folio ? ` · ${a.resultado.folio}` : ""}`);
  return res;
}

export { sumarDias };
