// Carga el catálogo de artículos exportado de SICAR (Excel, una hoja por proveedor) a una instancia de Pie Firme.
// Usa las reglas de src/lib/plataforma/importacionSicar.js (portadas de PODIX): precio 1 que solo trae el IVA, precio sugerido con el margen
// del proveedor, costo estimado, omitidos, repetidos y SKU únicas.
//
//   node scripts/cargar-catalogo-sicar.mjs <archivo.xlsx> <esquema> <organizacion_id> --solo-sql <carpeta>      (solo genera el SQL)
//   SB_TOKEN=… node scripts/cargar-catalogo-sicar.mjs <archivo.xlsx> <esquema> <organizacion_id> --ref <proyecto> (lo carga por la API)
//
// Idempotente: una SKU que ya existe no se toca (no pisa precios ni cambios hechos a mano). Carga producto, precio de lista 1, proveedor y
// su vínculo; NO carga existencias (el Excel no las trae): el inventario inicial se hace con un conteo de tipo «inicial». IMPUESTO = «N» en
// todo el archivo, así que los productos entran como exentos; confirmar con los dueños.
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { convertirCatalogoSicar } from "../src/lib/plataforma/importacionSicar.js";

const [archivo, esquema, org] = process.argv.slice(2);
const val = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const carpeta = val("--solo-sql"), ref = val("--ref");
if (!archivo || !/^[a-z][a-z0-9_]{2,30}$/.test(esquema || "") || !/^[0-9a-f-]{36}$/i.test(org || "") || (!carpeta && !ref)) {
  console.error("uso: node scripts/cargar-catalogo-sicar.mjs <archivo.xlsx> <esquema> <organizacion_id> (--solo-sql <carpeta> | --ref <proyecto>)");
  process.exit(2);
}

// 1) Leer el libro
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(archivo);
const celda = (c) => (c && typeof c === "object" ? (c.result ?? c.text ?? (c.richText ? c.richText.map((t) => t.text).join("") : null)) : c);
const hojas = wb.worksheets.map((ws) => {
  const filas = [];
  ws.eachRow({ includeEmpty: true }, (row) => { const v = row.values; filas.push(Array.from({ length: Math.max(0, (v.length || 1) - 1) }, (_, i) => celda(v[i + 1]) ?? null)); });
  return { nombre: ws.name, filas };
});
const r = convertirCatalogoSicar(hojas);
console.log("resumen:", JSON.stringify(r.resumen), "| hojas sin encabezado:", r.hojasSinEncabezado.join(", ") || "ninguna");

// 2) SQL
const q = (s) => (s == null || s === "" ? "null" : "'" + String(s).replace(/'/g, "''") + "'");
const n = (x) => (x == null ? "null" : String(x));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const DEPTOS = { podologia: ["podologia", "Podología", 1], ortopedia: ["ortopedia", "Ortopedia", 2], "salud y bienestar del pie": ["salud_bienestar_pie", "Salud y bienestar del pie", 4] };
const claveDepto = (d) => (DEPTOS[norm(d)] ?? [norm(d).replace(/[^a-z0-9]+/g, "_").slice(0, 40) || "otro", d, 9])[0];
const dep = new Map(Object.values(DEPTOS).map(([c, nom, o]) => [c, [c, nom, o]]));
for (const d of r.departamentos) if (!DEPTOS[norm(d)]) dep.set(claveDepto(d), [claveDepto(d), d, 9]);

const lotes = [`begin;
insert into ${esquema}.departamentos (organizacion_id, clave, nombre, orden) values
${[...dep.values()].map(([c, nom, o]) => `  ('${org}', ${q(c)}, ${q(nom)}, ${o})`).join(",\n")}
on conflict (organizacion_id, clave) do nothing;
insert into ${esquema}.proveedores (organizacion_id, clave, nombre, dias_credito) values
${r.proveedores.map((p, i) => `  ('${org}', 'SIC-${String(i + 1).padStart(2, "0")}', ${q(p)}, 30)`).join(",\n")}
on conflict do nothing;
commit;
`];
for (let i = 0; i < r.productos.length; i += 150) {
  const vals = r.productos.slice(i, i + 150).map((p) => `(${q(p.sku)}, ${q(p.codigoBarras)}, ${q(p.nombre)}, ${q(p.categoria)}, ${q(p.marca)}, ${q(claveDepto(p.departamento))}, ${q(p.proveedor)}, ${n(p.costo)}, ${n(p.precio)}, ${n(p.minimoSicar)}, ${n(p.maximoSicar)}, ${q(p.claveAlterna)}, ${p.precioSugerido}, ${p.costoEstimado})`).join(",\n  ");
  lotes.push(`begin;
with d(sku, codigo_barras, nombre, categoria, marca, depto, proveedor, costo, precio, min_s, max_s, clave_alt, p_sug, c_est) as (values
  ${vals}
), ins as (
  insert into ${esquema}.productos (organizacion_id, sku, codigo_barras, nombre, categoria, marca, tipo, costo_promedio, iva_tipo, estado,
      clave_alterna, departamento_id, origen, precio_sugerido, costo_estimado, minimo_sicar, maximo_sicar)
  select '${org}', d.sku, d.codigo_barras, d.nombre, d.categoria, d.marca, 'venta', d.costo, 'exento', 'activo',
      d.clave_alt, dp.id, 'sicar', d.p_sug, d.c_est, d.min_s, d.max_s
    from d left join ${esquema}.departamentos dp on dp.organizacion_id = '${org}' and dp.clave = d.depto
  on conflict (organizacion_id, sku) do nothing
  returning id, sku
), pr as (
  insert into ${esquema}.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio, motivo)
  select '${org}', 'producto', ins.id, current_date, d.precio, 'fijo', 'Alta inicial (carga de SICAR)' from ins join d on d.sku = ins.sku
  returning 1
)
insert into ${esquema}.proveedor_productos (organizacion_id, proveedor_id, producto_id, sku_proveedor, ultimo_costo)
select '${org}', pv.id, ins.id, d.clave_alt, d.costo
  from ins join d on d.sku = ins.sku join ${esquema}.proveedores pv on pv.organizacion_id = '${org}' and lower(pv.nombre) = lower(d.proveedor)
on conflict do nothing;
commit;
`);
}

if (carpeta) {
  fs.mkdirSync(carpeta, { recursive: true });
  lotes.forEach((s, i) => fs.writeFileSync(path.join(carpeta, `catalogo_${String(i).padStart(2, "0")}.sql`), s));
  console.log(`${lotes.length} archivos SQL escritos en ${carpeta}`);
  process.exit(0);
}

// 3) Cargar por la API de administración
const token = process.env.SB_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error("falta SB_TOKEN"); process.exit(2); }
for (let i = 0; i < lotes.length; i++) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query: lotes[i] }) });
  if (!resp.ok) { console.error(`lote ${i} falló: ${resp.status} ${(await resp.text()).slice(0, 300)}`); process.exit(1); }
  process.stdout.write(i === 0 ? "base " : ".");
}
console.log(`\nlisto: ${r.productos.length} productos revisados (los que ya existían no se tocaron).`);
