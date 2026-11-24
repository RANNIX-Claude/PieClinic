// Catálogo real de artículos de Pie Clinic (exportado de Sicar; ver docs/CARGA_ARTICULOS_SICAR.md).
// Son ~2,900 artículos: se agregan al catálogo del demo sin existencias y, para no llenar localStorage, se guardan solo
// como diferencias contra el catálogo base (un artículo que nadie tocó ocupa unos cuantos bytes).
import BASE, { PROVEEDORES_SICAR } from "../datos/articulos_sicar.js";

const POR_ID = new Map(BASE.map((p) => [p.id, p]));

/** Agrega proveedores y artículos de Sicar si el estado aún no los tiene (semilla nueva o estado guardado antes de la carga). */
export function cargarArticulosSicar(d) {
  d.proveedores = d.proveedores || [];
  const provs = new Set(d.proveedores.map((x) => x.id));
  PROVEEDORES_SICAR.forEach((x) => { if (!provs.has(x.id)) d.proveedores.push({ ...x }); });
  const ya = new Set(d.productos.map((p) => p.id));
  BASE.forEach((p) => { if (!ya.has(p.id)) d.productos.push({ ...p }); });
  return d;
}

const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Para guardar: cada artículo de Sicar se reduce a { id, $s:1, …campos cambiados, $del:[campos borrados] }. */
export function compactarProductos(productos) {
  return productos.map((p) => {
    const b = POR_ID.get(p.id);
    if (!b || p.origen !== "sicar") return p;
    const o = { id: p.id, $s: 1 };
    for (const k of Object.keys(p)) if (!igual(p[k], b[k])) o[k] = p[k];
    const del = Object.keys(b).filter((k) => !(k in p));
    if (del.length) o.$del = del;
    return o;
  });
}

/** Inverso de compactarProductos. */
export function expandirProductos(productos) {
  return productos.map((p) => {
    if (!p || p.$s !== 1) return p;
    const b = POR_ID.get(p.id);
    if (!b) return null;
    const { $s, $del, ...cambios } = p;
    const o = { ...b, ...cambios };
    ($del || []).forEach((k) => delete o[k]);
    return o;
  }).filter(Boolean);
}

/** Primera entrada de inventario de un artículo de Sicar: activa el mínimo que traía de Sicar. */
export function activarMinimo(p) {
  if (p && p.origen === "sicar" && !p.minimo && p.minimoSicar) p.minimo = p.minimoSicar;
}
