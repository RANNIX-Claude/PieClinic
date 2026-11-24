// Dominio «plataforma» · Cálculos del sistema. Documentación VIVA: cada cálculo trae su fórmula en español, los parámetros
// vigentes, un simulador con entradas editables y casos de referencia. El simulador NO reimplementa nada: llama a las funciones
// reales de reglas.js y de los archivos acciones_*.js. Esos módulos se cargan con import dinámico: si alguno no existe o falla,
// el cálculo se muestra como «módulo no disponible» en lugar de romper la pantalla.
import { hoy, redondear, diasEntre, sumarDias } from "../lib/format.js";
import * as R from "./reglas.js";

const CARGADORES = {
  cajero: () => import("./acciones_cajero.js"),
  admin: () => import("./acciones_admin.js"),
  podologo: () => import("./acciones_podologo.js"),
  personas: () => import("./acciones_personas.js"),
  finanzas: () => import("./acciones_finanzas.js"),
  desempeno: () => import("./acciones_desempeno.js"),
  comercial: () => import("./acciones_comercial.js"),
};
export const NOMBRE_MODULO = { reglas: "reglas.js", cajero: "acciones_cajero.js", admin: "acciones_admin.js", podologo: "acciones_podologo.js", personas: "acciones_personas.js", finanzas: "acciones_finanzas.js", desempeno: "acciones_desempeno.js", comercial: "acciones_comercial.js" };
/** Carga los módulos de cálculo. Devuelve { reglas, cajero, …, errores: { modulo: mensaje } }; los que fallan quedan en null. */
export async function cargarModulos(cargadores = CARGADORES) {
  const M = { reglas: R, errores: {} };
  await Promise.all(Object.entries(cargadores).map(async ([k, f]) => {
    try { M[k] = await f(); } catch (e) { M[k] = null; M.errores[k] = String((e && e.message) || e); }
  }));
  return M;
}

const n = (x) => { const v = parseFloat(String(x ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : 0; };
const fila = (label, valor, fmt = "texto") => ({ label, valor, fmt });
const opSuc = (d) => d.sucursales.map((s) => [s.id, s.nombre]);
const mesAct = () => hoy().slice(0, 7);
const PARAM_L = { vigenciaApartadoDias: "Vigencia del apartado (días)", anticipoMinimoPct: "Anticipo mínimo (%)", politicaAnticipoVencido: "Política de anticipo vencido", interesMensualPct: "Interés mensual, crédito abierto (%)", recargoUnicoPct: "Recargo único, ventas a plazos (%)", diasGracia: "Días de gracia", limiteCreditoGerente: "Límite de crédito que autoriza el gerente", limiteCreditoAdmin: "Límite de crédito que autoriza administración", limiteAjusteGerente: "Límite de ajuste que autoriza el gerente" };
export const etiquetaParametro = (k) => PARAM_L[k] || k;
export const GRUPOS_CALCULO = ["Precios y venta", "Inventario", "Apartados y crédito", "Caja", "Personas", "Finanzas y metas", "Operación"];

/**
 * Cada cálculo: { id, grupo, titulo, modulo, origen, formula, descripcion, parametros[], campos(d) → [{k,label,tipo,def,opciones?}],
 *   calcular(d, M, v) → [{label, valor, fmt}], ejemplo(d, M) → { texto, valores } | null, casos: [{ nombre, valores, espera: {label: valor} }] }
 * `modulo` es el archivo del que dependen las funciones (si no cargó, el cálculo queda «no disponible»).
 */
export const CALCULOS = [
  { id: "precio_final", grupo: "Precios y venta", titulo: "Precio final por sucursal", modulo: "reglas", origen: "reglas.js · precioFinal(), ajustePct()",
    formula: "precio final = precio de lista × (1 + ajuste % ÷ 100), redondeado a centavos",
    descripcion: "El ajuste es el específico del artículo en la sucursal; si no existe, el ajuste general de la sucursal; si tampoco, 0 %.",
    parametros: [],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: opSuc(d), def: "S2" }, { k: "tipo", label: "Tipo", tipo: "select", opciones: [["servicio", "Servicio"], ["producto", "Producto"]], def: "servicio" },
      { k: "item", label: "Artículo", tipo: "select", depende: "tipo", opciones: (v) => (v.tipo === "producto" ? d.productos.filter((p) => p.tipo === "venta") : d.servicios).map((x) => [x.id, x.nombre]), def: "SV2" }],
    calcular: (d, M, v) => { const it = R.itemCatalogo(d, v.tipo, v.item); if (!it) throw new Error("Elige un artículo del tipo seleccionado."); const esp = d.ajustesPrecio.some((a) => a.sucursalId === v.suc && a.tipo === v.tipo && a.itemId === v.item);
      return [fila("Precio de lista", it.precioBase, "dinero"), fila("Ajuste aplicado", R.ajustePct(d, v.suc, v.tipo, v.item), "pct"), fila("Origen del ajuste", esp ? "Específico del artículo en la sucursal" : "General de la sucursal"), fila("Precio final", R.precioFinal(d, v.suc, v.tipo, v.item), "dinero")]; },
    ejemplo: (d) => { const a = d.ajustesPrecio.find((x) => x.tipo !== "*"); return a ? { texto: `Ajuste específico de ${R.nombreSucursal(d, a.sucursalId)} para ${a.tipo === "servicio" ? R.nombreServicio(d, a.itemId) : R.nombreProducto(d, a.itemId)} (${a.pct} %)`, valores: { suc: a.sucursalId, tipo: a.tipo, item: a.itemId } } : null; },
    casos: [] },
  { id: "totales_venta", grupo: "Precios y venta", titulo: "Total del ticket con descuentos", modulo: "cajero", origen: "acciones_cajero.js · calcularTotales()",
    formula: "descuento de convenio = subtotal × convenio % · descuento manual = (subtotal − convenio) × manual % · total = subtotal − ambos",
    descripcion: "El descuento manual se aplica sobre lo que queda después del convenio (no se suman los porcentajes). Un descuento manual mayor a 10 % pide autorización del gerente.",
    parametros: [],
    campos: () => [{ k: "subtotal", label: "Subtotal", tipo: "number", def: 1000 }, { k: "convenio", label: "Descuento de convenio (%)", tipo: "number", def: 10 }, { k: "manual", label: "Descuento manual (%)", tipo: "number", def: 5 }],
    calcular: (d, M, v) => { const t = M.cajero.calcularTotales([{ importe: n(v.subtotal) }], { convenioPct: n(v.convenio), descManualPct: n(v.manual) });
      return [fila("Subtotal", t.subtotal, "dinero"), fila("Descuento de convenio", t.descConvenio, "dinero"), fila("Descuento manual", t.descManual, "dinero"), fila("Descuento total", t.descuento, "dinero"), fila("Total", t.total, "dinero"), fila("Requiere autorización", t.requiereAutorizacion, "bool")]; },
    ejemplo: (d) => { const v = d.ventas.find((x) => x.descuento > 0) || d.ventas[0]; return v ? { texto: `Ticket ${v.folio}: subtotal ${v.subtotal}, descuento ${v.descuento}, total ${v.total}`, valores: { subtotal: v.subtotal, convenio: v.descuentoDetalle ? v.descuentoDetalle.convenioPct : 0, manual: v.descuentoDetalle ? v.descuentoDetalle.manualPct : 0 } } : null; },
    casos: [{ nombre: "$1,000 con convenio 10 % y manual 5 % → $855", valores: { subtotal: 1000, convenio: 10, manual: 5 }, espera: { "Total": 855, "Descuento manual": 45 } }, { nombre: "Descuento manual de 15 % pide autorización", valores: { subtotal: 500, convenio: 0, manual: 15 }, espera: { "Total": 425, "Requiere autorización": true } }] },
  { id: "pago_mixto", grupo: "Precios y venta", titulo: "Pago mixto y cambio", modulo: "cajero", origen: "acciones_cajero.js · validarPagos()",
    formula: "cambio = (efectivo + tarjeta + transferencia) − total · solo el efectivo da cambio",
    descripcion: "Tarjeta y transferencia no pueden exceder el total. El efectivo que se registra en caja es el recibido menos el cambio.",
    parametros: [],
    campos: () => [{ k: "total", label: "Total a cobrar", tipo: "number", def: 870 }, { k: "efectivo", label: "Efectivo recibido", tipo: "number", def: 500 }, { k: "tarjeta", label: "Tarjeta", tipo: "number", def: 400 }, { k: "transferencia", label: "Transferencia", tipo: "number", def: 0 }],
    calcular: (d, M, v) => { const r = M.cajero.validarPagos({ efectivo: v.efectivo, tarjeta: v.tarjeta, transferencia: v.transferencia }, n(v.total)); if (!r.ok) return [fila("Resultado", r.error), fila("Falta", r.falta, "dinero")];
      return [fila("Recibido", r.suma, "dinero"), fila("Cambio", r.cambio, "dinero"), ...r.pagos.map((p) => fila(`Entra a caja · ${p.forma}`, p.monto, "dinero"))]; },
    ejemplo: () => null,
    casos: [{ nombre: "$870 con $500 efectivo y $400 tarjeta → cambio $30", valores: { total: 870, efectivo: 500, tarjeta: 400, transferencia: 0 }, espera: { "Cambio": 30, "Entra a caja · efectivo": 470 } }] },

  { id: "costo_peps", grupo: "Inventario", titulo: "Costo de salida PEPS", modulo: "reglas", origen: "reglas.js · salidaPEPS(), stock()",
    formula: "costo de la salida = Σ (piezas tomadas de cada capa × costo de esa capa), empezando por la capa más antigua",
    descripcion: "Primeras entradas, primeras salidas: se consumen las capas por fecha de entrada. Si no alcanza la existencia no se consume nada. El simulador trabaja sobre una copia: no mueve el inventario.",
    parametros: [],
    campos: (d) => [{ k: "alm", label: "Almacén", tipo: "select", opciones: d.almacenes.map((a) => [a.id, a.nombre]), def: "S1" }, { k: "prod", label: "Producto", tipo: "select", opciones: d.productos.map((p) => [p.id, `${p.sku} · ${p.nombre}`]), def: d.productos[0].id }, { k: "cant", label: "Piezas que salen", tipo: "number", def: 1 }],
    calcular: (d, M, v) => { const cant = Math.max(0, Math.round(n(v.cant))), copia = { capas: d.capas.map((c) => ({ ...c })) };
      const antes = copia.capas.filter((c) => c.almacenId === v.alm && c.productoId === v.prod).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((c) => ({ ...c }));
      const ex = R.stock(copia, v.alm, v.prod), r = R.salidaPEPS(copia, v.alm, v.prod, cant);
      const out = [fila("Existencia antes", ex, "num"), fila("Capas disponibles", antes.length, "num")];
      if (!r.ok) return [...out, fila("Resultado", `No alcanza: faltan ${r.faltan} pieza(s). No se consume nada.`)];
      antes.forEach((c) => { const queda = (copia.capas.find((x) => x.id === c.id) || { cant: 0 }).cant, tom = c.cant - queda; if (tom > 0) out.push(fila(`Capa del ${c.fecha} a ${c.costo}`, `${tom} de ${c.cant} pieza(s)`)); });
      return [...out, fila("Costo total de la salida", r.costo, "dinero"), fila("Costo unitario", cant ? redondear(r.costo / cant) : 0, "dinero"), fila("Existencia después", R.stock(copia, v.alm, v.prod), "num")]; },
    ejemplo: (d) => { const g = {}; d.capas.forEach((c) => { const k = `${c.almacenId}|${c.productoId}`; (g[k] ||= []).push(c); }); const k = Object.keys(g).find((x) => g[x].length > 1 && new Set(g[x].map((c) => c.costo)).size > 1);
      if (!k) return null; const [alm, prod] = k.split("|"), l = g[k].sort((a, b) => a.fecha.localeCompare(b.fecha)); return { texto: `${R.nombreProducto(d, prod)} en ${R.nombreAlmacen(d, alm)}: ${l.length} capas con costos distintos`, valores: { alm, prod, cant: l[0].cant + 1 } }; },
    casos: [] },
  { id: "valuacion", grupo: "Inventario", titulo: "Valuación del inventario", modulo: "reglas", origen: "reglas.js · valuacion(), bajoMinimo()",
    formula: "valuación = Σ (cantidad de cada capa × costo de esa capa)",
    descripcion: "Se valúa a costo PEPS, capa por capa (no a costo promedio ni al costo de catálogo).",
    parametros: [],
    campos: (d) => [{ k: "alm", label: "Almacén", tipo: "select", opciones: d.almacenes.map((a) => [a.id, a.nombre]), def: "CEN" }],
    calcular: (d, M, v) => [fila("Capas", d.capas.filter((c) => c.almacenId === v.alm).length, "num"), fila("Piezas", d.capas.filter((c) => c.almacenId === v.alm).reduce((a, c) => a + c.cant, 0), "num"), fila("Valuación", R.valuacion(d, v.alm), "dinero"), fila("Productos bajo mínimo", R.bajoMinimo(d, v.alm).length, "num")],
    ejemplo: () => null, casos: [] },

  { id: "anticipo_apartado", grupo: "Apartados y crédito", titulo: "Anticipo y vigencia de un apartado", modulo: "reglas", origen: "reglas.js · anticipoMinimo(), estadoApartado()",
    formula: "anticipo mínimo = precio × anticipo mínimo % · vence = fecha de creación + días de vigencia",
    descripcion: "El apartado está «por vencer» cuando le quedan 2 días o menos y «vencido» al pasar su fecha. El anticipo de un apartado vencido se trata según la política de la sucursal.",
    parametros: ["anticipoMinimoPct", "vigenciaApartadoDias", "politicaAnticipoVencido"],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: opSuc(d), def: "S1" }, { k: "precio", label: "Precio del producto", tipo: "number", def: 1800 }, { k: "creado", label: "Fecha del apartado", tipo: "date", def: hoy() }, { k: "ref", label: "Consultar al día", tipo: "date", def: hoy() }],
    calcular: (d, M, v) => { const p = d.params[v.suc], vence = sumarDias(v.creado, p.vigenciaApartadoDias);
      return [fila("Anticipo mínimo", R.anticipoMinimo(d, v.suc, n(v.precio)), "dinero"), fila("Vence", vence, "fecha"), fila("Días que le quedan", diasEntre(v.ref, vence), "num"), fila("Estado ese día", R.estadoApartado({ estado: "activo", vence }, v.ref))]; },
    ejemplo: (d) => { const a = d.apartados[0]; return a ? { texto: `Apartado ${a.folio}: ${a.nombre}, creado el ${a.creado}`, valores: { suc: a.sucursalId, precio: a.precio, creado: a.creado, ref: hoy() } } : null; },
    casos: [] },
  { id: "mora", grupo: "Apartados y crédito", titulo: "Mora: interés (crédito abierto) y recargo (ventas a plazos)", modulo: "reglas", origen: "reglas.js · estadoParcialidad(), moraParcialidad()",
    formula: "crédito abierto: interés = pendiente × interés mensual % × meses vencidos · plazos: recargo = pendiente × recargo único % (una sola vez)",
    descripcion: "No hay mora durante los días de gracia. Los meses vencidos se cuentan después de la gracia, redondeando hacia arriba (mínimo 1). Lo que ya se cobró de mora se descuenta.",
    parametros: ["interesMensualPct", "recargoUnicoPct", "diasGracia"],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: opSuc(d), def: "S1" }, { k: "tipo", label: "Tipo de plan", tipo: "select", opciones: [["abierto", "Crédito abierto"], ["plazos", "Venta a plazos"]], def: "abierto" },
      { k: "capital", label: "Capital de la parcialidad", tipo: "number", def: 1000 }, { k: "pagado", label: "Ya pagado", tipo: "number", def: 0 }, { k: "vence", label: "Vencía el", tipo: "date", def: sumarDias(hoy(), -45) }, { k: "ref", label: "Calcular al día", tipo: "date", def: hoy() }],
    calcular: (d, M, v) => { const p = d.params[v.suc], par = { n: 1, vence: v.vence, capital: n(v.capital), pagado: n(v.pagado) }, m = R.moraParcialidad({ tipo: v.tipo }, par, p, v.ref), est = R.estadoParcialidad(par, p, v.ref), dv = diasEntre(v.vence, v.ref);
      return [fila("Estado", est), fila("Días desde el vencimiento", dv, "num"), fila("Días de mora (después de la gracia)", Math.max(0, dv - p.diasGracia), "num"), fila("Pendiente de capital", redondear(par.capital - par.pagado), "dinero"), fila("Interés", m.interes, "dinero"), fila("Recargo", m.recargo, "dinero"), fila("Total a pagar", redondear(par.capital - par.pagado + m.interes + m.recargo), "dinero")]; },
    ejemplo: (d) => { for (const pl of d.planes.filter((x) => x.estado === "vigente")) { const par = pl.parcialidades.find((x) => R.estadoParcialidad(x, d.params[pl.sucursalId]) === "vencida"); if (par) return { texto: `Plan ${pl.folio} de ${R.nombrePaciente(d, pl.pacienteId)}: parcialidad ${par.n} vencida el ${par.vence}`, valores: { suc: pl.sucursalId, tipo: pl.tipo, capital: par.capital, pagado: par.pagado || 0, vence: par.vence, ref: hoy() } }; } return null; },
    casos: [] },
  { id: "plan_plazos", grupo: "Apartados y crédito", titulo: "Parcialidades de una venta a plazos", modulo: "cajero", origen: "acciones_cajero.js · simularPlan(), generarParcialidades(), enganchaMinimo()",
    formula: "financiado = monto − enganche · parcialidad = financiado ÷ n (la última absorbe los centavos) · vencen cada 15 días",
    descripcion: "El crédito abierto es una sola parcialidad a 30 días. El enganche mínimo de plazos es 20 % (supuesto pendiente de firma).",
    parametros: ["recargoUnicoPct", "interesMensualPct", "diasGracia"],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: opSuc(d), def: "S1" }, { k: "tipo", label: "Tipo", tipo: "select", opciones: [["plazos", "Venta a plazos"], ["abierto", "Crédito abierto"]], def: "plazos" }, { k: "monto", label: "Monto", tipo: "number", def: 2900 }, { k: "enganche", label: "Enganche", tipo: "number", def: 580 }, { k: "n", label: "Parcialidades", tipo: "number", def: 6 }],
    calcular: (d, M, v) => { const s = M.cajero.simularPlan(d.params[v.suc], { tipo: v.tipo, monto: n(v.monto), enganche: v.tipo === "abierto" ? 0 : n(v.enganche), n: Math.max(1, Math.round(n(v.n))) });
      return [fila("Enganche mínimo (20 %)", M.cajero.enganchaMinimo(n(v.monto)), "dinero"), fila("Financiado", s.financiado, "dinero"), ...s.parcialidades.map((p, i) => fila(`Parcialidad ${p.n} · vence ${p.vence}`, `${p.capital}${s.recargoPorParcialidad[i] != null ? ` (recargo si se atrasa: ${s.recargoPorParcialidad[i]})` : ""}`)),
        fila("Suma de parcialidades", redondear(s.parcialidades.reduce((a, p) => a + p.capital, 0)), "dinero"), fila("Interés mensual si se atrasa (abierto)", s.interesMensual, "dinero"), fila("Nivel que lo autoriza", R.nivelCredito(d, v.suc, n(v.monto)))]; },
    ejemplo: (d) => { const p = d.planes.find((x) => x.tipo === "plazos"); return p ? { texto: `Plan ${p.folio}: ${p.monto} con enganche ${p.enganche} en ${p.parcialidades.length} parcialidades`, valores: { suc: p.sucursalId, tipo: "plazos", monto: p.monto, enganche: p.enganche, n: p.parcialidades.length } } : null; },
    casos: [{ nombre: "$2,900 − $580 en 6 parcialidades suman exactamente $2,320", valores: { suc: "S1", tipo: "plazos", monto: 2900, enganche: 580, n: 6 }, espera: { "Financiado": 2320, "Suma de parcialidades": 2320 } }] },
  { id: "niveles", grupo: "Apartados y crédito", titulo: "Nivel de autorización", modulo: "reglas", origen: "reglas.js · nivelCredito(), nivelAjuste()",
    formula: "crédito: monto ≤ límite del gerente → gerente; ≤ límite de administración → administración; mayor → dirección · ajuste: |monto| ≤ límite del gerente → gerente; mayor → administración",
    descripcion: "Los umbrales son parámetros de cada sucursal.",
    parametros: ["limiteCreditoGerente", "limiteCreditoAdmin", "limiteAjusteGerente"],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: opSuc(d), def: "S1" }, { k: "monto", label: "Monto", tipo: "number", def: 4500 }],
    calcular: (d, M, v) => [fila("Crédito por ese monto lo autoriza", R.nivelCredito(d, v.suc, n(v.monto))), fila("Ajuste de inventario por ese valor lo autoriza", R.nivelAjuste(d, v.suc, n(v.monto)))],
    ejemplo: (d) => { const a = d.autorizaciones.find((x) => x.tipo === "credito"); return a ? { texto: `Solicitud «${a.detalle}» por ${a.monto} (nivel registrado: ${a.nivel})`, valores: { suc: a.sucursalId, monto: a.monto } } : null; },
    casos: [] },

  { id: "corte_caja", grupo: "Caja", titulo: "Corte de caja (arqueo)", modulo: "cajero", origen: "reglas.js · esperadoTurno() · acciones_cajero.js · arqueo()",
    formula: "esperado en efectivo = fondo + ventas en efectivo + abonos − retiros y gastos · diferencia = contado − esperado",
    descripcion: "Tarjeta y transferencia no llevan fondo. Con cualquier diferencia el corte queda «diferencia pendiente» hasta que el gerente la resuelva.",
    parametros: [],
    campos: (d) => { const t = d.turnos.find((x) => x.estado === "abierto") || d.turnos[0], e = t ? R.esperadoTurno(d, t) : { efectivo: 0, tarjeta: 0, transferencia: 0 };
      return [{ k: "turno", label: "Turno", tipo: "select", opciones: d.turnos.map((x) => [x.id, `${R.nombreSucursal(d, x.sucursalId)} · ${x.turno} · ${String(x.abiertoEn).slice(0, 10)} (${x.estado})`]), def: t ? t.id : "" },
        { k: "efectivo", label: "Efectivo contado", tipo: "number", def: e.efectivo }, { k: "tarjeta", label: "Tarjeta contada", tipo: "number", def: e.tarjeta }, { k: "transferencia", label: "Transferencia contada", tipo: "number", def: e.transferencia }]; },
    calcular: (d, M, v) => { const t = d.turnos.find((x) => x.id === v.turno); if (!t) throw new Error("Elige un turno."); const e = R.esperadoTurno(d, t), a = M.cajero.arqueo(e, { efectivo: v.efectivo, tarjeta: v.tarjeta, transferencia: v.transferencia });
      return [fila("Fondo", t.fondo, "dinero"), fila("Tickets del turno", R.ventasDeTurno(d, t.id).length, "num"), ...a.filas.flatMap((f) => [fila(`Esperado · ${f.forma}`, f.esperado, "dinero"), fila(`Diferencia · ${f.forma}`, f.diferencia, "dinero")]), fila("Estado del corte", a.estado)]; },
    ejemplo: (d) => { const t = d.turnos.find((x) => x.corte && x.corte.estado === "diferencia_pendiente" && Array.isArray(x.corte.filas)); if (!t) return null; const c = Object.fromEntries(t.corte.filas.map((f) => [f.forma, f.contado])); return { texto: `Corte de ${R.nombreSucursal(d, t.sucursalId)} (${t.turno}) con diferencia pendiente: ${t.corte.justificacion || "sin justificar"}`, valores: { turno: t.id, efectivo: c.efectivo, tarjeta: c.tarjeta, transferencia: c.transferencia } }; },
    casos: [] },

  { id: "retardo", grupo: "Personas", titulo: "Retardo de asistencia", modulo: "personas", origen: "reglas_personas.js · clasificarEntrada(), paramsRH()",
    formula: "minutos tarde = hora de entrada − hora del horario · es retardo si minutos tarde > tolerancia",
    descripcion: "Llegar dentro de la tolerancia cuenta como entrada normal. Cada cierto número de retardos se descuenta un día en la nómina.",
    parametros: [],
    campos: (d, M) => { const p = M.personas ? M.personas.paramsRH(d) : { toleranciaMin: 10 }; return [{ k: "horario", label: "Hora de entrada del horario", tipo: "time", def: "08:00" }, { k: "entrada", label: "Hora en que checó", tipo: "time", def: "08:15" }, { k: "tol", label: "Tolerancia (min)", tipo: "number", def: p.toleranciaMin }]; },
    calcular: (d, M, v) => { const r = M.personas.clasificarEntrada(v.entrada, v.horario, n(v.tol)), p = M.personas.paramsRH(d); return [fila("Minutos tarde", r.minutosTarde, "num"), fila("Clasificación", r.estado), fila("Tolerancia vigente (min)", p.toleranciaMin, "num"), fila("Retardos que equivalen a una falta", p.retardosPorFalta, "num")]; },
    ejemplo: (d) => { const a = d.rh && d.rh.asistencia.find((x) => x.estado === "retardo"); if (!a) return null; const e = d.rh.empleados.find((x) => x.id === a.empleadoId); return { texto: `${e ? e.nombre : a.empleadoId} checó a las ${a.entrada} el ${a.fecha} (horario ${e && e.horario ? e.horario.entrada : "—"})`, valores: { horario: e && e.horario ? e.horario.entrada : "08:00", entrada: a.entrada, tol: d.rh.params ? d.rh.params.toleranciaMin : 10 } }; },
    casos: [{ nombre: "Entrar 08:15 con horario 08:00 y tolerancia 10 → retardo de 15 min", valores: { horario: "08:00", entrada: "08:15", tol: 10 }, espera: { "Minutos tarde": 15, "Clasificación": "retardo" } }, { nombre: "Entrar 08:10 con tolerancia 10 → normal", valores: { horario: "08:00", entrada: "08:10", tol: 10 }, espera: { "Clasificación": "normal" } }] },
  { id: "nomina", grupo: "Personas", titulo: "Nómina del periodo", modulo: "personas", origen: "reglas_personas.js · calcularNomina(), rangoPeriodo()",
    formula: "salario diario = sueldo mensual ÷ 30 · total = salario diario × días pagados − faltas × salario diario − ⌊retardos ÷ retardos por falta⌋ × salario diario",
    descripcion: "Cálculo de demostración: sin ISR, sin cuotas del IMSS y sin timbrado. La quincena paga 15 días y el mes 30.",
    parametros: [],
    campos: (d) => [{ k: "emp", label: "Empleado", tipo: "select", opciones: ((d.rh && d.rh.empleados) || []).filter((e) => e.estado === "activo").map((e) => [e.id, `${e.nombre} · ${e.puesto}`]), def: d.rh && d.rh.empleados[10] ? d.rh.empleados[10].id : "" },
      { k: "tipo", label: "Periodo", tipo: "select", opciones: [["quincenal", "Quincenal"], ["mensual", "Mensual"]], def: "quincenal" }, { k: "mes", label: "Mes", tipo: "month", def: mesAct() }, { k: "q", label: "Quincena", tipo: "select", opciones: [["1", "Primera"], ["2", "Segunda"]], def: "1" }],
    calcular: (d, M, v) => { const e = d.rh.empleados.find((x) => x.id === v.emp); if (!e) throw new Error("Elige un empleado."); const per = M.personas.rangoPeriodo(v.tipo, v.mes, Number(v.q)), r = M.personas.calcularNomina(d, e, per);
      return [fila("Periodo", `${per.desde} a ${per.hasta}`), fila("Sueldo mensual", e.sueldoMensual, "dinero"), fila("Salario diario", r.salarioDiario, "dinero"), fila("Días pagados", r.diasPagados, "num"), fila("Sueldo del periodo", r.sueldoPeriodo, "dinero"), fila("Faltas", r.faltas, "num"), fila("Retardos", r.retardos, "num"), fila("Descuento por faltas", r.descFaltas, "dinero"), fila("Descuento por retardos", r.descRetardos, "dinero"), fila("Total a pagar", r.total, "dinero")]; },
    ejemplo: (d) => { const r = d.rh && (d.rh.recibos || []).find((x) => x.descuentos > 0); if (!r) return null; const e = d.rh.empleados.find((x) => x.id === r.empleadoId); return { texto: `Recibo ${r.folio} de ${e ? e.nombre : r.empleadoId}: ${r.faltas} falta(s) y ${r.retardos} retardo(s)`, valores: { emp: r.empleadoId, tipo: r.periodo.tipo, mes: r.periodo.mes, q: String(r.periodo.q || 1) } }; },
    casos: [] },
  { id: "vacaciones", grupo: "Personas", titulo: "Días de vacaciones por antigüedad", modulo: "personas", origen: "reglas_personas.js · diasVacacionesLFT(), antiguedad()",
    formula: "1 año: 12 días · 2: 14 · 3: 16 · 4: 18 · 5: 20 · de 6 a 10: 22 · y +2 cada 5 años",
    descripcion: "Tabla de la Ley Federal del Trabajo (artículo 76). Por validar con el contador antes de producción.",
    parametros: [],
    campos: () => [{ k: "ingreso", label: "Fecha de ingreso", tipo: "date", def: sumarDias(hoy(), -365 * 4 - 30) }, { k: "ref", label: "Calcular al día", tipo: "date", def: hoy() }],
    calcular: (d, M, v) => { const a = M.personas.antiguedad(v.ingreso, v.ref); return [fila("Antigüedad", a.texto), fila("Años cumplidos", a.anios, "num"), fila("Días de vacaciones que le corresponden", M.personas.diasVacacionesLFT(a.anios), "num"), fila("Prima vacacional", M.personas.PRIMA_VACACIONAL * 100, "pct")]; },
    ejemplo: (d) => { const e = d.rh && d.rh.empleados.find((x) => x.estado === "activo"); return e ? { texto: `${e.nombre}, ingreso ${e.ingreso}`, valores: { ingreso: e.ingreso, ref: hoy() } } : null; },
    casos: [{ nombre: "4 años cumplidos → 18 días", valores: { ingreso: "2020-01-15", ref: "2024-06-01" }, espera: { "Años cumplidos": 4, "Días de vacaciones que le corresponden": 18 } }] },
  { id: "comision", grupo: "Personas", titulo: "Comisión estimada del podólogo", modulo: "podologo", origen: "acciones_podologo.js · comisionEstimada(), productividad()",
    formula: "comisión = ingreso atribuido × comisión %",
    descripcion: "El porcentaje (10 %) es un SUPUESTO pendiente de la pregunta abierta PA-V5: base, porcentaje por rol y momento en que se genera.",
    parametros: [],
    campos: (d, M) => [{ k: "ingreso", label: "Ingreso atribuido", tipo: "number", def: 42000 }, { k: "pct", label: "Comisión (%)", tipo: "number", def: M.podologo ? M.podologo.COMISION_PCT : 10 }],
    calcular: (d, M, v) => [fila("Comisión", M.podologo.comisionEstimada(n(v.ingreso), n(v.pct)), "dinero"), fila("Porcentaje del sistema (supuesto)", M.podologo.COMISION_PCT, "pct")],
    ejemplo: (d, M) => { const p = d.usuarios.find((u) => u.rol === "podologo"); if (!p || !M.podologo) return null; const x = M.podologo.productividad(d, p.id, { desde: `${mesAct()}-01`, hasta: hoy() }); const ing = x && (x.ingreso ?? x.ingresos ?? x.total); return ing != null ? { texto: `${p.nombre}: ingreso atribuido de ${mesAct()} a hoy`, valores: { ingreso: ing, pct: M.podologo.COMISION_PCT } } : null; },
    casos: [{ nombre: "$42,000 al 10 % → $4,200", valores: { ingreso: 42000, pct: 10 }, espera: { "Comisión": 4200 } }] },
  { id: "bono", grupo: "Personas", titulo: "Bono por escalones", modulo: "desempeno", origen: "desempeno_motor.js · escalonPara(), bonosDe()",
    formula: "se toma el escalón más alto cuyo «desde» sea ≤ a la base · bono = base × % del escalón (o el monto fijo del escalón)",
    descripcion: "La base depende del esquema (ventas de la persona, de la sucursal o cumplimiento de meta). Los esquemas sembrados son de demostración y están por validar con el cliente.",
    parametros: [],
    campos: (d) => { const es = (d.bonos && d.bonos.esquemas) || []; return [{ k: "esq", label: "Esquema", tipo: "select", opciones: es.map((e) => [e.id, e.nombre]), def: es[0] ? es[0].id : "" }, { k: "base", label: "Base alcanzada", tipo: "number", def: 82000 }]; },
    calcular: (d, M, v) => { const e = ((d.bonos && d.bonos.esquemas) || []).find((x) => x.id === v.esq); if (!e) throw new Error("Elige un esquema."); const r = M.desempeno.escalonPara(e.escalones, n(v.base)), x = r.escalon;
      return [fila("Base del esquema", e.base), fila("Escalones", e.escalones.map((s) => `${s.desde}→${s.valor}${s.tipo === "pct" ? " %" : ""}`).join(" · ")), fila("Escalón alcanzado", x ? `${r.numero} de ${r.total} (desde ${x.desde})` : "Ninguno"),
        fila("Bono", x ? (x.tipo === "pct" ? redondear(n(v.base) * x.valor / 100) : x.valor) : 0, "dinero"), fila("Siguiente escalón desde", r.siguiente ? r.siguiente.desde : "Ya es el máximo")]; },
    ejemplo: (d, M) => { if (!M.desempeno || !d.bonos) return null; const p = d.usuarios.find((u) => u.rol === "podologo"), b = M.desempeno.bonosDe(d, { usuarioId: p.id, mes: mesAct() }), it = b.items.find((x) => x.tipo === "individual"); return it ? { texto: `${p.nombre} en ${mesAct()}: base ${it.base ?? it.valor ?? "—"}, bono ${it.bono}`, valores: { esq: it.esquemaId || (it.esquema && it.esquema.id) || d.bonos.esquemas[0].id, base: it.base ?? it.valor ?? 0 } } : null; },
    casos: [] },

  { id: "margen_edr", grupo: "Finanzas y metas", titulo: "Margen del estado de resultados", modulo: "finanzas", origen: "acciones_finanzas.js · estadoResultados()",
    formula: "utilidad bruta = ingresos − costo de producto y laboratorio − comisiones · utilidad de operación = utilidad bruta − nómina − gastos · margen = utilidad ÷ ingresos",
    descripcion: "Los meses cerrados salen del histórico mensual; el mes en curso, de los tickets. Las comisiones y la nómina del mes en curso son estimadas.",
    parametros: [],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: [["", "Cadena (todas)"], ...opSuc(d)], def: "" }, { k: "mes", label: "Mes", tipo: "month", def: mesAct() }],
    calcular: (d, M, v) => { const e = M.finanzas.estadoResultados({ ...d, sesion: { userId: null, sucursalId: null } }, { mes: v.mes, sucursalId: v.suc || null }); if (!e.ok) throw new Error(e.error);
      const L = { ingresos: "Ingresos", gastosVariables: "Costo y gastos variables", utilidadBruta: "Utilidad bruta", gastosOperacion: "Gastos de operación (con nómina)", nomina: "Nómina (incluida arriba)", utilidadOperativa: "Utilidad de operación", margen: "Margen de operación" };
      const out = [fila("Alcance", e.nombre), fila("Mes parcial", !!e.parcial, "bool")];
      if (e.totales) Object.keys(L).forEach((k) => { if (k in e.totales) out.push(fila(L[k], k === "margen" ? redondear(e.totales[k] * 100) : e.totales[k], k === "margen" ? "pct" : "dinero")); });
      else (e.bandas || []).forEach((x) => { if (x.total) out.push(fila(x.total.etiqueta, x.total.monto, "dinero")); });
      return out; },
    ejemplo: (d) => ({ texto: `Sucursal ${d.sucursales[0].nombre}, mes anterior cerrado`, valores: { suc: d.sucursales[0].id, mes: (() => { const [y, m] = mesAct().split("-").map(Number); const x = new Date(y, m - 2, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; })() } }),
    casos: [] },
  { id: "meta", grupo: "Finanzas y metas", titulo: "Cumplimiento de meta y proyección", modulo: "desempeno", origen: "desempeno_motor.js · cumplimientoSucursal(), metaSucursal()",
    formula: "avance % = venta del mes ÷ meta · proyección = (venta ÷ días transcurridos) × días del mes",
    descripcion: "La proyección es lineal: supone que el resto del mes se vende al mismo ritmo diario.",
    parametros: [],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: opSuc(d), def: "S1" }, { k: "mes", label: "Mes", tipo: "month", def: mesAct() }],
    calcular: (d, M, v) => { const c = M.desempeno.cumplimientoSucursal(d, v.suc, v.mes); return [fila("Venta del mes", c.real, "dinero"), fila("Meta", c.meta, "dinero"), fila("Avance", c.pct, "pct"), fila("Días transcurridos", `${c.diasTranscurridos} de ${c.diasMes}`), fila("Proyección al cierre", c.proyectado, "dinero"), fila("Avance proyectado", c.pctProyectado, "pct")]; },
    ejemplo: () => null, casos: [] },
  { id: "ventas_netas", grupo: "Finanzas y metas", titulo: "Ventas netas, ticket promedio y ocupación", modulo: "admin", origen: "acciones_admin.js · ventasNetas(), ticketPromedio(), ocupacionDetalle()",
    formula: "ventas netas = Σ total de tickets no cancelados − devoluciones · ticket promedio = ventas ÷ tickets · ocupación = minutos de citas ÷ (8 h × podólogos presentes)",
    descripcion: "Las devoluciones restan el día en que ocurren. La ocupación cuenta citas atendidas, confirmadas y en curso.",
    parametros: [],
    campos: (d) => [{ k: "suc", label: "Sucursal", tipo: "select", opciones: [["", "Todas"], ...opSuc(d)], def: "" }, { k: "per", label: "Periodo", tipo: "select", opciones: [["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"]], def: "semana" }],
    calcular: (d, M, v) => { const p = M.admin.periodo(v.per), s = v.suc || undefined, o = v.suc ? M.admin.ocupacionDetalle(d, p, v.suc) : null;
      return [fila("Periodo", `${p.desde} a ${p.hasta}`), fila("Tickets", M.admin.ventasValidas(d, p, s).length, "num"), fila("Devoluciones", redondear(M.admin.devolucionesDe(d, p, s).reduce((a, x) => a + (x.monto || 0), 0)), "dinero"), fila("Ventas netas", M.admin.ventasNetas(d, p, s), "dinero"), fila("Ticket promedio", M.admin.ticketPromedio(d, p, s), "dinero"),
        ...(o ? [fila("Minutos ocupados", o.min, "num"), fila("Minutos disponibles", o.disp, "num"), fila("Ocupación", o.pct, "pct")] : [fila("Ocupación", "Elige una sucursal para calcularla")])]; },
    ejemplo: () => null, casos: [] },

  { id: "envio", grupo: "Operación", titulo: "Costo de envío de la tienda en línea", modulo: "comercial", origen: "acciones_comercial.js · costoEnvio(), cfg()",
    formula: "envío = 0 si hay «envío gratis desde» y el subtotal lo alcanza; si no, el costo fijo de envío",
    descripcion: "El costo de envío es un valor por validar con el cliente.",
    parametros: [],
    campos: () => [{ k: "subtotal", label: "Subtotal del pedido", tipo: "number", def: 700 }],
    calcular: (d, M, v) => { const c = M.comercial.cfg(d); return [fila("Costo fijo de envío", c.costoEnvio, "dinero"), fila("Envío gratis desde", c.envioGratisDesde > 0 ? c.envioGratisDesde : "No configurado", c.envioGratisDesde > 0 ? "dinero" : "texto"), fila("Envío de este pedido", M.comercial.costoEnvio(d, n(v.subtotal)), "dinero"), fila("Total con envío", redondear(n(v.subtotal) + M.comercial.costoEnvio(d, n(v.subtotal))), "dinero")]; },
    ejemplo: (d) => { const p = (d.pedidosWeb || []).find((x) => x.envio > 0); return p ? { texto: `Pedido ${p.folio}: subtotal ${p.subtotal}, envío ${p.envio}`, valores: { subtotal: p.subtotal } } : null; },
    casos: [] },
  { id: "tolerancia", grupo: "Operación", titulo: "Tolerancia de la auditoría de inventario por foto", modulo: "comercial", origen: "acciones_comercial.js · toleranciaPiezas(), compararItem()",
    formula: "tolerancia = máximo entre 1 pieza y ⌈existencia del sistema × tolerancia %⌉ · hay diferencia si |estimado − sistema| > tolerancia",
    descripcion: "La cifra estimada viene de una simulación de visión; no sustituye el conteo físico.",
    parametros: [],
    campos: (d, M) => [{ k: "sistema", label: "Existencia en sistema", tipo: "number", def: 24 }, { k: "estimado", label: "Estimado en la foto", tipo: "number", def: 20 }, { k: "pct", label: "Tolerancia (%)", tipo: "number", def: M.comercial ? M.comercial.cfg(d).toleranciaPct : 10 }],
    calcular: (d, M, v) => { const r = M.comercial.compararItem(n(v.sistema), n(v.estimado), n(v.pct)); return [fila("Tolerancia en piezas", M.comercial.toleranciaPiezas(n(v.sistema), n(v.pct)), "num"), fila("Diferencia", r.dif, "num"), fila("Resultado", r.estado === "ok" ? "Dentro de tolerancia" : "Diferencia: se investiga")]; },
    ejemplo: (d) => { for (const a of d.auditorias || []) { const it = (a.items || []).find((x) => x.dif); if (it) return { texto: `Auditoría ${a.folio}: ${R.nombreProducto(d, it.productoId)}, sistema ${it.sistema}, estimado ${it.estimado}`, valores: { sistema: it.sistema, estimado: it.estimado, pct: 10 } }; } return null; },
    casos: [{ nombre: "24 en sistema, 20 estimado, 10 % → tolerancia 3, hay diferencia", valores: { sistema: 24, estimado: 20, pct: 10 }, espera: { "Tolerancia en piezas": 3, "Diferencia": -4 } }] },
  { id: "anticipo_lab", grupo: "Operación", titulo: "Anticipo de una plantilla u ortesis", modulo: "podologo", origen: "acciones_podologo.js · anticipoDe(), PRECIO_ORTESIS",
    formula: "anticipo = precio de la ortesis × anticipo % (50 %)",
    descripcion: "La orden no se envía al laboratorio hasta cobrar el anticipo en caja.",
    parametros: [],
    campos: (d, M) => [{ k: "tipo", label: "Tipo de ortesis", tipo: "select", opciones: Object.keys(M.podologo ? M.podologo.PRECIO_ORTESIS : {}).map((k) => [k, k]), def: M.podologo ? Object.keys(M.podologo.PRECIO_ORTESIS)[0] : "" }],
    calcular: (d, M, v) => [fila("Precio", M.podologo.PRECIO_ORTESIS[v.tipo], "dinero"), fila("Anticipo requerido", M.podologo.anticipoDe(v.tipo), "dinero"), fila("Porcentaje", M.podologo.ANTICIPO_LAB_PCT, "pct"), fila("Días prometidos de entrega", M.podologo.DIAS_PROMETIDA, "num")],
    ejemplo: () => null, casos: [] },
];

export const disponible = (c, M) => c.modulo === "reglas" || !!M[c.modulo];
export const camposDe = (c, d, M) => { try { return c.campos(d, M); } catch { return []; } };
export const valoresIniciales = (c, d, M) => Object.fromEntries(camposDe(c, d, M).map((f) => [f.k, f.def]));
/** Ejecuta el cálculo con las funciones reales. Devuelve { ok, filas } o { ok:false, error }. */
export function ejecutarCalculo(c, d, M, valores) {
  if (!disponible(c, M)) return { ok: false, error: `Módulo no disponible: ${NOMBRE_MODULO[c.modulo]}${M.errores && M.errores[c.modulo] ? ` (${M.errores[c.modulo]})` : ""}`, noDisponible: true };
  try { return { ok: true, filas: c.calcular(d, M, valores) }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
export function ejemploDe(c, d, M) {
  if (!disponible(c, M)) return null;
  try { return c.ejemplo(d, M); } catch { return null; }
}
/** Corre los casos de referencia: si una fórmula cambia en el código y deja de dar lo documentado, aquí se nota. */
export function verificarCalculo(c, d, M) {
  return (c.casos || []).map((k) => {
    const r = ejecutarCalculo(c, d, M, k.valores);
    if (!r.ok) return { nombre: k.nombre, ok: false, error: r.error, fallas: [] };
    const fallas = Object.entries(k.espera).flatMap(([label, esperado]) => { const f = r.filas.find((x) => x.label === label); const obtenido = f ? f.valor : undefined; return obtenido === esperado ? [] : [{ label, esperado, obtenido }]; });
    return { nombre: k.nombre, ok: !fallas.length, fallas };
  });
}
export function verificarTodos(d, M) {
  const todos = CALCULOS.flatMap((c) => verificarCalculo(c, d, M));
  return { total: todos.length, ok: todos.filter((x) => x.ok).length, fallan: todos.filter((x) => !x.ok).length };
}
/** Parámetros vigentes de la sucursal para un cálculo, con su valor de fábrica. */
export function parametrosVigentes(c, d, sucursalId, defecto) {
  const p = d.params[sucursalId] || {};
  return (c.parametros || []).map((k) => ({ k, label: etiquetaParametro(k), valor: p[k], defecto: defecto ? defecto[k] : undefined, modificado: defecto ? String(p[k]) !== String(defecto[k]) : false }));
}
