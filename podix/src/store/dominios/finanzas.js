// Dominio «finanzas»: semilla de datos de demostración + cálculo puro del estado de resultados (EDR).
// Exporta seed(base, util) → { fin: { categorias, gastos, recurrentes, notasCompra } } y las funciones PURAS de cálculo
// (sin core.js, para evitar import circular: core → seed → dominios → este archivo). Las acciones y la API pública
// viven en src/store/acciones_finanzas.js, que re-exporta lo necesario.
import { hoy, redondear } from "../../lib/format.js";

// ───────── Categorías de gasto de operación (unidad de costo = sucursal)
export const CATEGORIAS_BASE = [
  { id: "renta", nombre: "Rentas", fijo: true, recurrente: true },
  { id: "luz", nombre: "Luz", fijo: true, recurrente: true },
  { id: "agua", nombre: "Agua", fijo: true, recurrente: true },
  { id: "internet", nombre: "Internet y teléfono", fijo: true, recurrente: true },
  { id: "limpieza", nombre: "Limpieza", fijo: true, recurrente: true },
  { id: "mantenimiento", nombre: "Mantenimiento", fijo: false, recurrente: false },
  { id: "publicidad", nombre: "Publicidad", fijo: false, recurrente: false },
  { id: "papeleria", nombre: "Papelería y oficina", fijo: false, recurrente: false },
  { id: "otros", nombre: "Otros gastos", fijo: false, recurrente: false },
];
/** Comisiones y bonos: se estiman como % de los ingresos mientras el dominio «desempeño» no entregue el real. */
export const COMISION_ESTIMADA_PCT = 0.02;
/** Sueldo mensual estimado por rol, solo si el dominio «personas» no sembró d.rh.empleados. */
export const SUELDO_ESTIMADO = { gerente: 20000, cajero: 8000, recepcion: 8000, almacen: 8500, asistente: 8500, podologo: 16000 };

/** Personal de oficina central: no es costo de una sucursal (la unidad de costo es la sucursal con su personal). */
export const ROLES_CENTRALES = ["direccion", "admin"];

export const mesActual = (ref = hoy()) => String(ref).slice(0, 7);
export function mesRelativo(mes, n) {
  const [y, m] = mes.split("-").map(Number);
  const x = new Date(y, m - 1 + n, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}
export const diasDelMes = (mes) => { const [y, m] = mes.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (mes) => { const [y, m] = mes.split("-").map(Number); return `${MESES[m - 1]} ${y}`; };
/** El mes en curso y luego los 12 meses cerrados (más reciente primero). */
export function mesesDisponibles(ref = hoy()) {
  const a = mesActual(ref);
  return [a, ...Array.from({ length: 12 }, (_, i) => mesRelativo(a, -(i + 1)))];
}

export const categoriasDe = (d) => (d.fin && d.fin.categorias && d.fin.categorias.length ? d.fin.categorias : CATEGORIAS_BASE);

// ───────── Nómina por sucursal (unidad de costo = sucursal + el personal que tiene)
/** Detalle de nómina mensual de una sucursal. Usa d.rh.empleados (sucursalBase, sueldoMensual, estado); si no existe, estima por usuarios. */
export function nominaDeSucursal(d, sucursalId, fraccion = 1) {
  const emp = d.rh && Array.isArray(d.rh.empleados) ? d.rh.empleados : null;
  let det = [];
  if (emp && emp.length) {
    det = emp.filter((e) => e.estado !== "baja" && e.sucursalBase === sucursalId && !ROLES_CENTRALES.includes(e.rol) && Number(e.sueldoMensual) > 0)
      .map((e) => ({ id: `sueldo:${e.id}`, etiqueta: `${e.nombre}${e.puesto ? ` · ${e.puesto}` : e.rol ? ` · ${e.rol}` : ""}`, monto: Number(e.sueldoMensual) }));
  } else {
    d.usuarios.forEach((u) => {
      if (u.activo === false || u.almacenCentral || ROLES_CENTRALES.includes(u.rol) || !SUELDO_ESTIMADO[u.rol] || !u.sucursales.includes(sucursalId)) return;
      det.push({ id: `sueldo:${u.id}`, etiqueta: `${u.nombre} · ${u.rol} (estimado)`, monto: SUELDO_ESTIMADO[u.rol] / u.sucursales.length });
    });
  }
  return det.map((x) => ({ ...x, monto: redondear(x.monto * fraccion) }));
}

// ───────── Ingresos y costo del mes
const enMes = (f, mes) => String(f).slice(0, 7) === mes;
/** Ingresos y costo de un mes para una sucursal. Meses cerrados: d.hist. Mes en curso: ventas reales. */
export function ingresosDeMes(d, sucursalId, mes) {
  const r = { servicios: 0, plantillas: 0, productos: 0, costoProducto: 0, costoLab: 0, det: { servicios: {}, plantillas: {}, productos: {} } };
  if (mes < mesActual()) {
    (d.hist || []).filter((h) => h.sucursalId === sucursalId && h.mes === mes).forEach((h) => {
      r.servicios += h.servicios; r.plantillas += h.plantillas; r.productos += h.productos; r.costoProducto += h.costo;
    });
    return r;
  }
  d.ventas.filter((v) => v.sucursalId === sucursalId && v.estado !== "cancelada" && enMes(v.fecha, mes)).forEach((v) => {
    const k = v.subtotal > 0 && v.descuento > 0 ? 1 - v.descuento / v.subtotal : 1; // el descuento reduce el ingreso
    (v.partidas || []).forEach((p) => {
      const imp = (p.importe != null ? p.importe : p.precio * p.cant) * k;
      let tipo = "servicios", costo = 0;
      if (p.tipo === "producto") {
        const prod = d.productos.find((x) => x.id === p.itemId);
        tipo = prod && prod.categoria === "Plantillas" ? "plantillas" : "productos";
        costo = (p.costo != null ? p.costo : prod ? prod.costo : 0) * (p.cant || 1); // sin costo PEPS guardado: costo de catálogo
      }
      r[tipo] += imp; r.costoProducto += costo;
      r.det[tipo][p.nombre] = (r.det[tipo][p.nombre] || 0) + imp;
    });
  });
  (d.ordenesLab || []).filter((o) => o.sucursalId === sucursalId && enMes(o.enviada, mes)).forEach((o) => { r.costoLab += Number(o.costoLab) || 0; });
  return r;
}

/** Gastos de operación registrados de una sucursal en un mes: { categoria: { clave: {id, etiqueta, monto} } }. */
export function gastosDeMes(d, sucursalId, mes) {
  const ids = new Set(categoriasDe(d).map((c) => c.id));
  const out = {};
  ((d.fin && d.fin.gastos) || []).filter((g) => g.sucursalId === sucursalId && enMes(g.fecha, mes)).forEach((g) => {
    const cat = ids.has(g.categoria) ? g.categoria : "otros";
    const clave = `${cat}:${String(g.concepto).trim().toLowerCase()}`;
    ((out[cat] ||= {})[clave] ||= { id: clave, etiqueta: String(g.concepto).trim(), monto: 0 }).monto += Number(g.monto) || 0;
  });
  return out;
}

// ───────── Estructura cruda (sumable) y armado del estado de resultados
/** Cruda y aditiva: la del consolidado es la suma de las crudas de las sucursales. */
export function crudoSucursal(d, sucursalId, mes) {
  const parcial = mes === mesActual();
  const fr = parcial ? Math.min(1, Number(hoy().slice(8, 10)) / diasDelMes(mes)) : 1; // nómina devengada a la fecha
  const ing = ingresosDeMes(d, sucursalId, mes);
  const total = ing.servicios + ing.plantillas + ing.productos;
  const lista = (o) => Object.entries(o).map(([k, v]) => ({ id: `i:${k}`, etiqueta: k, monto: redondear(v) }));
  const gas = gastosDeMes(d, sucursalId, mes);
  return {
    ingresos: { servicios: ing.servicios, plantillas: ing.plantillas, productos: ing.productos },
    ingresosDet: { servicios: lista(ing.det.servicios), plantillas: lista(ing.det.plantillas), productos: lista(ing.det.productos) },
    costoProducto: ing.costoProducto, costoLab: ing.costoLab, comisiones: total * COMISION_ESTIMADA_PCT,
    nomina: nominaDeSucursal(d, sucursalId, fr),
    gastos: Object.fromEntries(Object.entries(gas).map(([c, m]) => [c, Object.values(m).map((x) => ({ ...x, monto: redondear(x.monto) }))])),
    nominaEstimada: !(d.rh && d.rh.empleados && d.rh.empleados.length),
  };
}
const mezclaLista = (a, b) => {
  const m = new Map();
  [...a, ...b].forEach((x) => { const o = m.get(x.id); if (o) o.monto = redondear(o.monto + x.monto); else m.set(x.id, { ...x }); });
  return [...m.values()];
};
export function sumarCrudos(lista) {
  const z = { ingresos: { servicios: 0, plantillas: 0, productos: 0 }, ingresosDet: { servicios: [], plantillas: [], productos: [] }, costoProducto: 0, costoLab: 0, comisiones: 0, nomina: [], gastos: {}, nominaEstimada: false };
  lista.forEach((c) => {
    ["servicios", "plantillas", "productos"].forEach((k) => { z.ingresos[k] += c.ingresos[k]; z.ingresosDet[k] = mezclaLista(z.ingresosDet[k], c.ingresosDet[k]); });
    z.costoProducto += c.costoProducto; z.costoLab += c.costoLab; z.comisiones += c.comisiones;
    z.nomina = mezclaLista(z.nomina, c.nomina);
    Object.entries(c.gastos).forEach(([k, v]) => { z.gastos[k] = mezclaLista(z.gastos[k] || [], v); });
    z.nominaEstimada = z.nominaEstimada || c.nominaEstimada;
  });
  return z;
}

const suma = (a) => a.reduce((s, x) => s + x.monto, 0);
/** Arma bandas, filas, totales y porcentajes sobre ingresos a partir de una estructura cruda. */
export function armarEdr(d, crudo, mes) {
  const f = (id, etiqueta, monto, detalle = []) => ({ id, etiqueta, monto: redondear(monto), detalle: detalle.length ? detalle : null });
  const i = crudo.ingresos;
  const filasIng = [
    f("ing_servicios", "Servicios", i.servicios, crudo.ingresosDet.servicios),
    f("ing_plantillas", "Plantillas", i.plantillas, crudo.ingresosDet.plantillas),
    f("ing_productos", "Productos (bastones, andaderas, calzado, cremas)", i.productos, crudo.ingresosDet.productos),
  ];
  const totIng = redondear(filasIng.reduce((s, x) => s + x.monto, 0));
  const costoDet = [];
  if (crudo.costoLab || crudo.costoProducto) costoDet.push({ id: "c:prod", etiqueta: "Producto vendido (costo PEPS)", monto: redondear(crudo.costoProducto) }, { id: "c:lab", etiqueta: "Laboratorio externo", monto: redondear(crudo.costoLab) });
  const filasVar = [
    f("var_producto", "Producto y laboratorio", crudo.costoProducto + crudo.costoLab, costoDet),
    f("var_comisiones", "Comisiones y bonos (estimado)", crudo.comisiones),
  ];
  const totVar = redondear(filasVar.reduce((s, x) => s + x.monto, 0));
  const bruta = redondear(totIng - totVar);
  const filasOp = [f("op_sueldos", "Sueldos y nómina del personal", suma(crudo.nomina), crudo.nomina)];
  categoriasDe(d).forEach((c) => filasOp.push(f(`op_${c.id}`, c.nombre, suma(crudo.gastos[c.id] || []), crudo.gastos[c.id] || [])));
  const totOp = redondear(filasOp.reduce((s, x) => s + x.monto, 0));
  const oper = redondear(bruta - totOp);
  const pct = (m) => (totIng ? m / totIng : 0);
  const cerrar = (fs) => fs.map((x) => ({ ...x, pct: pct(x.monto), detalle: x.detalle && x.detalle.map((y) => ({ ...y, pct: pct(y.monto) })) }));
  return {
    mes, parcial: mes === mesActual(), sinDatos: totIng === 0, nominaEstimada: crudo.nominaEstimada,
    bandas: [
      { id: "ingresos", titulo: "INGRESOS", filas: cerrar(filasIng), total: { id: "total_ingresos", etiqueta: "Total ingresos", monto: totIng, pct: pct(totIng) } },
      { id: "variables", titulo: "GASTOS VARIABLES", filas: cerrar(filasVar), total: { id: "total_variables", etiqueta: "Total gastos variables", monto: totVar, pct: pct(totVar) } },
      { id: "bruta", titulo: "UTILIDAD BRUTA", resultado: true, tono: "bruta", monto: bruta, pct: pct(bruta) },
      { id: "operacion", titulo: "GASTOS DE OPERACIÓN (FIJOS)", filas: cerrar(filasOp), total: { id: "total_operacion", etiqueta: "Total gastos de operación", monto: totOp, pct: pct(totOp) } },
      { id: "operativa", titulo: "UTILIDAD OPERATIVA", resultado: true, tono: "operativa", monto: oper, pct: pct(oper) },
    ],
    totales: { ingresos: totIng, gastosVariables: totVar, utilidadBruta: bruta, gastosOperacion: totOp, nomina: redondear(suma(crudo.nomina)), utilidadOperativa: oper, margen: pct(oper), margenBruto: pct(bruta) },
  };
}

// ═════════════════════════ Semilla
const CAT_PESO = { renta: 0.36, luz: 0.07, agua: 0.03, internet: 0.03, limpieza: 0.07, mantenimiento: 0.08, publicidad: 0.2, papeleria: 0.04, otros: 0.12 };
const RENTA_FACTOR = [1.05, 0.95, 0.9, 0.92, 0.88, 1.2, 1.0]; // peso de la renta por sucursal (Polanco, la más cara)
// Margen operativo objetivo por sucursal en meses cerrados (historia: Polanco la mejor, Sur y Poniente las más flojas).
const MARGEN_OBJ = [0.19, 0.165, 0.135, 0.175, 0.15, 0.225, 0.2];
const DIA_CAT = { renta: 2, luz: 14, agua: 16, internet: 5, limpieza: 28, mantenimiento: 18, publicidad: 10, papeleria: 12, otros: 20 };
const ACREEDOR = { renta: "Arrendadora", luz: "CFE", agua: "Sistema de aguas", internet: "Telmex / Totalplay", limpieza: "Servicios de limpieza" };
const CONCEPTOS = {
  mantenimiento: ["Reparación de aire acondicionado", "Mantenimiento de autoclave", "Pintura y resanes", "Plomería", "Cambio de luminarias"],
  publicidad: ["Anuncios en redes sociales", "Volantes y lonas", "Campaña de Google Ads", "Patrocinio en club deportivo"],
  papeleria: ["Papelería y toners", "Material de recepción", "Formatos impresos"],
  otros: ["Mensajería y paquetería", "Uniformes", "Agua purificada y café", "Gastos menores de caja", "Cuotas y licencias"],
};

export function seed(base, util) {
  const { r, id } = util;
  const hoyS = hoy();
  const ma = mesActual();
  const categorias = CATEGORIAS_BASE.map((c) => ({ ...c }));
  const gastos = [], recurrentes = [];
  const gerente = (sid) => (base.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(sid)) || base.usuarios[1]).id;
  const admin = (base.usuarios.find((u) => u.rol === "admin") || base.usuarios[0]).id;
  const mk = (sid, mes, cat, dia, concepto, monto, extra = {}) => {
    const fecha = `${mes}-${String(Math.min(dia, diasDelMes(mes))).padStart(2, "0")}`;
    if (monto <= 0 || fecha > hoyS) return null;
    const g = { id: id("GA"), sucursalId: sid, fecha, categoria: cat, concepto, monto: Math.round(monto), proveedorId: null, comprobante: null, fuente: "manual", registradoPor: r() < 0.7 ? gerente(sid) : admin, ...extra };
    gastos.push(g); return g;
  };

  const cierres = Array.from({ length: 12 }, (_, i) => mesRelativo(ma, -(12 - i)));
  const ult = {}; // sucursal → categoría → montos de los últimos 3 cierres
  base.sucursales.forEach((s, si) => {
    const dTmp = { ...base, fin: { categorias, gastos: [] } };
    // Gasto de operación (sin nómina) que deja el margen objetivo, dados ingresos, costo, comisiones y la nómina real/estimada.
    const objetivoOperacion = (mes, margen) => {
      const c = crudoSucursal(dTmp, s.id, mes);
      const ing = c.ingresos.servicios + c.ingresos.plantillas + c.ingresos.productos;
      const bruta = ing - c.costoProducto - c.costoLab - c.comisiones;
      const nom = c.nomina.reduce((a, x) => a + x.monto, 0);
      return Math.max(ing * 0.03, bruta - nom - margen * ing); // piso: una sucursal siempre tiene algún gasto
    };
    const reparto = (G, spike) => {
      const w = {};
      categorias.forEach((c) => { w[c.id] = CAT_PESO[c.id] * (c.id === "renta" ? RENTA_FACTOR[si] : 1) * (0.9 + r() * 0.2) * (spike && spike.cat === c.id ? spike.f : 1); });
      const t = Object.values(w).reduce((a, b) => a + b, 0);
      const m = {}; let acum = 0;
      categorias.slice(0, -1).forEach((c) => { m[c.id] = Math.round((G * w[c.id]) / t / 100) * 100; acum += m[c.id]; });
      m.otros = Math.max(0, Math.round((G - acum) / 100) * 100);
      return m;
    };
    ult[s.id] = {};
    cierres.forEach((mes, k) => {
      const margen = MARGEN_OBJ[si] + (r() - 0.5) * 0.02;
      const spike = r() < 0.12 ? { cat: r() < 0.5 ? "mantenimiento" : "publicidad", f: 2.8 } : null; // gasto fuera de patrón
      const m = reparto(objetivoOperacion(mes, margen), spike);
      categorias.forEach((c) => {
        const monto = m[c.id];
        if (!(monto > 0)) return;
        if (c.recurrente) {
          mk(s.id, mes, c.id, DIA_CAT[c.id], `${c.id === "renta" ? "Renta del local" : c.nombre} ${nombreMes(mes)}`, monto, { acreedor: ACREEDOR[c.id], recurrenteKey: c.id });
        } else {
          const n = (c.id === "mantenimiento" || c.id === "otros") && monto > 6000 ? 2 : 1;
          let resto = monto;
          for (let j = 0; j < n; j++) {
            const parte = j === n - 1 ? resto : Math.round((monto * (0.4 + r() * 0.2)) / 100) * 100;
            resto -= parte;
            const lista = CONCEPTOS[c.id];
            mk(s.id, mes, c.id, DIA_CAT[c.id] + j * 4, lista[Math.floor(r() * lista.length)], parte);
          }
        }
        if (k >= 9) (ult[s.id][c.id] ||= []).push(monto);
      });
    });
    // Mes en curso: lo devengado hasta hoy. Luz, agua y limpieza quedan pendientes para «Generar los del mes».
    const prom = (cat) => { const a = ult[s.id][cat] || [0]; return Math.round(a.reduce((x, y) => x + y, 0) / a.length / 100) * 100; };
    categorias.forEach((c) => {
      const monto = prom(c.id);
      if (c.recurrente) {
        recurrentes.push({ id: id("RE"), sucursalId: s.id, categoria: c.id, concepto: c.id === "renta" ? "Renta del local" : c.nombre, monto, proveedorId: null, acreedor: ACREEDOR[c.id], diaMes: DIA_CAT[c.id], activo: true });
        if (c.id === "renta" || c.id === "internet") mk(s.id, ma, c.id, DIA_CAT[c.id], `${c.id === "renta" ? "Renta del local" : c.nombre} ${nombreMes(ma)}`, monto, { acreedor: ACREEDOR[c.id], recurrenteKey: c.id });
      } else if (c.id !== "otros" || r() < 0.6) {
        const lista = CONCEPTOS[c.id];
        mk(s.id, ma, c.id, Math.min(DIA_CAT[c.id], Number(hoyS.slice(8, 10))), lista[Math.floor(r() * lista.length)], monto * (0.25 + r() * 0.35));
      }
    });
  });
  // Enlaza los gastos recurrentes sembrados con su recurrente (idempotencia de «Generar los del mes»).
  gastos.forEach((g) => {
    if (g.recurrenteKey) { const re = recurrentes.find((x) => x.sucursalId === g.sucursalId && x.categoria === g.recurrenteKey); if (re) g.recurrenteId = re.id; delete g.recurrenteKey; }
  });
  gastos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Notas de compra históricas: las facturas ya capturadas de las órdenes de compra recibidas.
  const notasCompra = (base.cxp || []).map((c, i) => {
    const o = (base.oc || []).find((x) => x.id === c.ocId);
    const partidas = o ? o.partidas.map((p) => ({ productoId: p.productoId, cant: p.recibido || p.cant, costo: p.costo, importe: redondear((p.recibido || p.cant) * p.costo) })) : [];
    return { id: id("NC"), folio: `NC-${String(i + 1).padStart(4, "0")}`, tipo: "mercancia", proveedorId: c.proveedorId, folioProveedor: c.doc, fecha: o ? o.fecha : util.F(-10), partidas, total: redondear(partidas.reduce((a, p) => a + p.importe, 0)), almacenId: o ? o.almacenId : null, cxpId: c.id, gastoId: null, foto: null, origen: "orden_de_compra", registradoPor: admin, sucursalId: null, creadoEn: o ? o.fecha : util.F(-10) };
  });
  return { fin: { categorias, gastos, recurrentes, notasCompra } };
}
