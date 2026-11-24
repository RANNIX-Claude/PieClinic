// Carga o actualiza documentos Markdown en Utilerías → Documentación de UNA clínica (migración 075).
//
//   node scripts/cargar-documentacion.mjs qa <organizacion_id> <archivo.md> [<archivo.md> …]
//   node scripts/cargar-documentacion.mjs qa <organizacion_id> <archivo.md> … --solo-sql salida.sql    (no toca la base; solo escribe el SQL)
//
// La clave del documento es el nombre del archivo en minúsculas y sin extensión; el título, su primer encabezado «# …»; el orden, el
// de la línea de comandos. Es idempotente: repetirlo actualiza el contenido. Los documentos solo los lee el Administrador de esa clínica.
// Se ejecuta por la API de administración de Supabase, como cargar-semilla.mjs. Nunca corre contra producción.
import fs from "fs";
import path from "path";
import { ambiente } from "./lib/env.mjs";

const args = process.argv.slice(2);
const iSql = args.indexOf("--solo-sql");
const salidaSql = iSql >= 0 ? args[iSql + 1] : null;
const pos = args.filter((a, i) => !a.startsWith("--") && !(iSql >= 0 && i === iSql + 1));
const [amb, org, ...archivos] = pos;
if (!amb || amb === "prod" || !/^[0-9a-f-]{36}$/i.test(org || "") || !archivos.length) {
  console.error("uso: node scripts/cargar-documentacion.mjs qa <organizacion_id> <archivo.md> [...] [--solo-sql salida.sql]  (nunca producción)");
  process.exit(2);
}

const comillas = (texto) => { let n = 0, tag; do { tag = "$doc" + n++ + "$"; } while (texto.includes(tag)); return tag + texto + tag; };
const sentencias = archivos.map((a, orden) => {
  const md = fs.readFileSync(a, "utf8");
  const clave = path.basename(a, path.extname(a)).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const titulo = (md.match(/^#\s+(.*)$/m)?.[1] ?? clave).trim();
  return `insert into piefirme.documentacion (organizacion_id, clave, titulo, contenido, orden)
values ('${org}', '${clave}', ${comillas(titulo)}, ${comillas(md)}, ${(orden + 1) * 10})
on conflict (organizacion_id, clave) do update set titulo = excluded.titulo, contenido = excluded.contenido, orden = excluded.orden;`;
});
const sql = `begin;\n${sentencias.join("\n")}\ncommit;\n`;

if (salidaSql) { fs.writeFileSync(salidaSql, sql); console.log(`SQL escrito en ${salidaSql} (${archivos.length} documento(s))`); process.exit(0); }

const cfg = ambiente(amb, { exigirBD: false });
const token = cfg.env.SUPABASE_ACCESS_TOKEN;
if (!token || !cfg.ref) { console.error("Faltan SUPABASE_ACCESS_TOKEN y QA_SUPABASE_REF en .env.local"); process.exit(2); }
const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
});
const txt = await r.text();
console.log(`documentación: ${r.ok ? "ok" : "ERROR " + r.status + " " + txt.slice(0, 600)} (${archivos.length} documento(s))`);
process.exit(r.ok ? 0 : 1);
