// Aplica migraciones de migraciones/*.sql a un ambiente y corre las pruebas RLS después.
//
//   node scripts/apply-migration.mjs qa   migraciones/001_esquema.sql
//   node scripts/apply-migration.mjs qa   --pendientes            # todas las que falten, en orden
//   node scripts/apply-migration.mjs prod migraciones/001_esquema.sql --confirmo-produccion
//   ... --sin-pruebas       # omite test-rls
//
// Reglas de la Fábrica:
//   · Nada de SQL suelto: todo cambio de esquema es un archivo numerado en migraciones/.
//   · Primero QA, después producción: prod rechaza una migración que no conste aplicada en QA.
//   · Cada archivo corre en una transacción; si falla, Postgres deshace todo.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { ROOT, ambiente, conectar, exigirConfirmacionProd, arg, posicionales } from "./lib/env.mjs";

const [amb, archivo] = posicionales();
if (!amb || (!archivo && !arg("--pendientes"))) { console.error("uso: node scripts/apply-migration.mjs qa|prod <archivo.sql> | --pendientes  [--sin-pruebas] [--confirmo-produccion]"); process.exit(2); }
exigirConfirmacionProd(amb);

const DIR = path.join(ROOT, "migraciones");
const TABLA = "piefirme._rannix_migraciones";   // base compartida: el registro vive en el esquema propio, nunca en public
const DDL = `create schema if not exists piefirme; create table if not exists ${TABLA} (nombre text primary key, sha256 text not null, aplicada_en timestamptz not null default now())`;

export async function aplicadas(cliente) {
  await cliente.query(DDL);
  return new Map((await cliente.query(`select nombre, sha256 from ${TABLA}`)).rows.map((r) => [r.nombre, r.sha256]));
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const listar = () => fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort() : [];

const cfg = ambiente(amb);
const c = await conectar(cfg);
const yaAqui = await aplicadas(c);

let yaEnQA = null;
if (amb === "prod") {
  const qa = await conectar(ambiente("qa"));
  yaEnQA = await aplicadas(qa);
  await qa.end();
}

const lote = arg("--pendientes") ? listar().filter((f) => !yaAqui.has(f)) : [path.basename(archivo)];
if (!lote.length) { console.log(`[${amb}] sin migraciones pendientes.`); await c.end(); process.exit(0); }

for (const nombre of lote) {
  const ruta = fs.existsSync(archivo ?? "") && !arg("--pendientes") ? archivo : path.join(DIR, nombre);
  const sql = fs.readFileSync(ruta, "utf8");
  const h = sha(sql);
  if (yaAqui.has(nombre)) {
    if (yaAqui.get(nombre) !== h) { console.error(`[${amb}] ${nombre} ya se aplicó con OTRO contenido. Una migración aplicada no se edita: crea una nueva.`); process.exit(1); }
    console.log(`[${amb}] ${nombre} ya aplicada — se omite.`); continue;
  }
  if (yaEnQA && yaEnQA.get(nombre) !== h) { console.error(`[prod] ${nombre} no consta aplicada en QA con este mismo contenido. Primero QA.`); process.exit(1); }

  console.log(`[${amb}] aplicando ${nombre} …`);
  const propio = /^\s*begin\b/im.test(sql);
  try {
    await c.query(propio ? sql : `begin;\n${sql}\ncommit;`);
    await c.query(`insert into ${TABLA}(nombre, sha256) values ($1,$2)`, [nombre, h]);
    console.log(`[${amb}] OK ${nombre}`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error(`[${amb}] ERROR en ${nombre}: ${e.message}${e.position ? ` (posición ${e.position})` : ""}`);
    if (e.position) { const p = Number(e.position); console.error("…" + sql.slice(Math.max(0, p - 200), p + 100) + "…"); }
    await c.end(); process.exit(1);
  }
}
await c.query("notify pgrst, 'reload schema'").catch(() => {});
await c.end();

if (!arg("--sin-pruebas")) {
  console.log(`\n[${amb}] corriendo pruebas RLS…`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "test-rls.mjs"), amb], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
