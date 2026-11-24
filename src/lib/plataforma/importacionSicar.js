// Carga del catálogo de artículos exportado de SICAR (un Excel con una hoja por proveedor).
// PORTADO de PODIX (`podix/scripts/sicar_articulos.py`), con las reglas que el usuario decidió el 23-nov-2026. No se reinventa: es la misma lógica.
//
// Entrada: [{ nombre: 'Hoja', filas: [[celda, celda, …], …] }] (las filas ya leídas del .xlsx, en el orden del archivo).
// Salida:  { productos, proveedores, omitidos, repetidos, leidos, factorGeneral, resumen }
//
// Reglas:
//  - En varias hojas la columna «PRECIO 1» trae el 16 % del costo (el IVA), no el precio de venta. Un PRECIO 1 solo se toma como precio
//    cuando es al menos 1.2 veces el costo (o no hay costo). Si no, el precio se calcula con el margen típico del proveedor (mediana de
//    precio/costo de sus artículos con precio válido; si no tiene ninguno, la mediana general), redondeado hacia arriba a múltiplos de 5,
//    y se marca `precioSugerido`. Si hay precio y no costo, el costo se estima con el mismo factor y se marca `costoEstimado`.
//  - Artículos sin precio ni costo no se cargan: quedan en `omitidos`.
//  - El Excel no trae existencias: se cargan sin inventario, con su mínimo y máximo guardados aparte (`minimoSicar`, `maximoSicar`). La
//    base los activa con la primera entrada de inventario (migración 076).
//  - Los repetidos entre hojas se descartan. SICAR repite la clave alterna entre tallas y colores: la SKU final se hace única con un sufijo.

const limpio = s => String(s ?? '').replace(/\s+/g, ' ').trim()
const frase = s => { const t = limpio(s).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1) }
const norm = s => limpio(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const num = x => { const v = Number.parseFloat(x); return Number.isFinite(v) && v > 0 ? v : null }
const redondear = (x, d = 2) => Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d
const mediana = arr => { const a = [...arr].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }

export const ENCABEZADO_SICAR = 'SERVICIO (S/N)'
const COL_DESCRIPCION = 3          // la descripción va en la cuarta columna, aunque su encabezado venga vacío

/** ¿La hoja trae el encabezado de SICAR? */
export const esHojaSicar = filas => filas.some(r => Array.isArray(r) && r.includes(ENCABEZADO_SICAR))

/** Lee los renglones de artículo de una hoja. */
function leerHoja(hoja) {
  const filas = hoja.filas ?? []
  const hi = filas.findIndex(r => Array.isArray(r) && r.includes(ENCABEZADO_SICAR))
  if (hi < 0) return { artículos: [], sinEncabezado: true }
  const ix = {}
  filas[hi].forEach((k, i) => { if (k) ix[k] = i })
  let grupo = limpio(hoja.nombre)
  const artículos = []
  for (const r of filas.slice(hi + 1)) {
    if (!r || !r.some(c => c != null && c !== '')) continue
    if (r.includes(ENCABEZADO_SICAR)) continue             // encabezado repetido dentro de la hoja
    const desc = limpio(r[COL_DESCRIPCION])
    if (!desc) continue
    if ((r[ix['INV_MIN']] == null || r[ix['INV_MIN']] === '') && (r[ix['INV_MAX']] == null || r[ix['INV_MAX']] === '') && num(r[ix['PRECIO COMPRA']]) == null) { grupo = desc; continue }   // renglón de título de grupo
    const carac = limpio(r[ix['CARACTERISTICAS']])
    artículos.push({
      hoja: limpio(hoja.nombre), grupo,
      nombre: /^\d/.test(desc) && carac ? `${carac} talla ${desc}` : desc,
      clave: limpio(r[ix['CLAVE ALTERNA']]), barras: limpio(r[ix['CLAVE']]),
      costo: num(r[ix['PRECIO COMPRA']]), p1: num(r[ix['PRECIO 1']]),
      min: Math.trunc(num(r[ix['INV_MIN']]) ?? 0), max: Math.trunc(num(r[ix['INV_MAX']]) ?? 0),
      depto: limpio(r[ix['DEPARTAMENTO']]) || 'Ortopedia', marca: limpio(r[ix['CATEGORIA']]) || limpio(hoja.nombre),
    })
  }
  return { artículos, sinEncabezado: false }
}

/** Convierte las hojas de SICAR en productos listos para cargar. */
export function convertirCatalogoSicar(hojas) {
  const crudos = []
  const hojasSinEncabezado = []
  for (const h of hojas) { const r = leerHoja(h); if (r.sinEncabezado) hojasSinEncabezado.push(h.nombre); else crudos.push(...r.artículos) }

  // Quitar repetidos entre hojas
  const vistos = new Set(), arts = []
  let repetidos = 0
  for (const a of crudos) {
    const k = `${norm(a.nombre)}|${norm(a.clave)}|${a.costo}|${a.p1}`
    if (vistos.has(k)) { repetidos++; continue }
    vistos.add(k); arts.push(a)
  }

  // Margen típico por proveedor (marca) con los artículos de precio válido
  const valido = a => a.p1 && (!a.costo || a.p1 >= 1.2 * a.costo)
  const ratios = {}
  for (const a of arts) if (valido(a) && a.costo) (ratios[a.marca] ??= []).push(a.p1 / a.costo)
  const todos = Object.values(ratios).flat()
  const factorGeneral = todos.length ? mediana(todos) : 1
  const factor = Object.fromEntries(Object.entries(ratios).map(([m, l]) => [m, mediana(l)]))

  const out = [], omitidos = []
  const cont = { completo: 0, sugerido: 0, estimado: 0 }
  for (const a of arts) {
    const f = factor[a.marca] ?? factorGeneral
    let precio, costo, precioSugerido = false, costoEstimado = false
    if (valido(a)) {
      precio = redondear(a.p1)
      costo = a.costo ? redondear(a.costo) : redondear(precio / f)
      costoEstimado = !a.costo
    } else if (a.costo) {
      costo = redondear(a.costo)
      precio = Math.ceil((costo * f) / 5) * 5
      precioSugerido = true
    } else { omitidos.push(a); continue }
    cont[precioSugerido ? 'sugerido' : costoEstimado ? 'estimado' : 'completo']++
    out.push({ ...a, precio, costoF: costo, precioSugerido, costoEstimado })
  }

  // SKU y nombres únicos (SICAR repite la clave alterna entre tallas y colores)
  const skus = {}, nombres = {}
  for (const a of out) { skus[norm(a.clave)] = (skus[norm(a.clave)] ?? 0) + 1; nombres[norm(a.nombre)] = (nombres[norm(a.nombre)] ?? 0) + 1 }
  const usadosSku = {}
  const tomados = new Set(out.filter(x => x.clave && skus[norm(x.clave)] <= 1).map(x => norm(x.clave)))
  const productos = out.map((a, i) => {
    const n = i + 1
    const base = a.clave || `SIC-${String(n).padStart(4, '0')}`
    const k = norm(base)
    usadosSku[k] = (usadosSku[k] ?? 0) + 1
    let sku = base
    if (!(skus[k] <= 1 && a.clave)) {                       // clave repetida o vacía: lleva sufijo, que no puede chocar con una clave real («CA» + 2 = «CA-2»)
      sku = `${base}-${usadosSku[k]}`
      while (tomados.has(norm(sku))) { usadosSku[k]++; sku = `${base}-${usadosSku[k]}` }
    }                                                       // (el script de PODIX comparaba también la clave única contra sí misma y le agregaba «-2» a todas)
    tomados.add(norm(sku))
    let nombre = frase(a.nombre)
    if (nombres[norm(a.nombre)] > 1) nombre = `${nombre} (${sku})`
    return {
      sku, nombre, categoria: frase(a.grupo), tipo: 'venta', precio: a.precio, costo: a.costoF,
      minimoSicar: a.min, maximoSicar: a.max, marca: frase(a.marca), departamento: frase(a.depto), proveedor: frase(a.hoja),
      origen: 'sicar', claveAlterna: a.clave || null, codigoBarras: a.barras || null,
      precioSugerido: a.precioSugerido, costoEstimado: a.costoEstimado,
    }
  })

  const proveedores = [...new Set(productos.map(p => p.proveedor))]
  const departamentos = [...new Set(productos.map(p => p.departamento))]
  return {
    productos, proveedores, departamentos, omitidos, repetidos, leidos: crudos.length, factorGeneral, hojasSinEncabezado,
    resumen: { cargados: productos.length, ...cont, omitidos: omitidos.length, repetidos, leidos: crudos.length },
  }
}
