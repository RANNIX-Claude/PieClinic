// Carga una semilla de datos de operación (datos/F_xx_*.sql) en QA por la API de administración de Supabase.
//
//   node datos/cargar-datos.mjs qa F_01 --ensayo     # corre todo y hace ROLLBACK (la semilla termina con una excepción controlada)
//   node datos/cargar-datos.mjs qa F_01              # confirma
//   opciones: --n=1400 (pacientes de F_01)
//
// Nunca corre contra producción. Las semillas son deterministas (sin random()), idempotentes y marcadas ('SINT-F:' en pacientes) para purgarse.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ambiente, posicionales } from "../scripts/lib/env.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const [amb, cual] = posicionales();
if (amb !== "qa" || !cual) { console.error("uso: node datos/cargar-datos.mjs qa F_01 [--ensayo] [--n=1400]"); process.exit(2); }
const cfg = ambiente("qa", { exigirBD: false });
// El token del proyecto vive en .env.local; la variable de entorno del usuario puede ser de otra cuenta (da 403), así que .env.local manda.
const local = Object.fromEntries(fs.existsSync(path.join(aqui, "..", ".env.local"))
  ? fs.readFileSync(path.join(aqui, "..", ".env.local"), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  : []);
const token = local.SUPABASE_ACCESS_TOKEN || cfg.env.SUPABASE_ACCESS_TOKEN;
if (!token || !cfg.ref) { console.error("Faltan SUPABASE_ACCESS_TOKEN y QA_SUPABASE_REF en .env.local"); process.exit(2); }

const opt = (n, def) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? def;
const ensayo = process.argv.includes("--ensayo");
const archivo = fs.readdirSync(aqui).find((f) => f.startsWith(cual + "_") && f.endsWith(".sql"));
if (!archivo) { console.error("No existe datos/" + cual + "_*.sql"); process.exit(2); }

let sql = fs.readFileSync(path.join(aqui, archivo), "utf8").replaceAll("{{N}}", opt("n", "1400"));
const resumen = fs.readFileSync(path.join(aqui, archivo), "utf8").match(/--@resumen:(.*)/)?.[1]?.trim() ?? "select 1";
sql = sql.replaceAll("{{FIN}}", ensayo ? `raise exception 'ENSAYO_OK %', (${resumen});` : "");

const t0 = Date.now();
const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
});
const txt = await r.text();
const seg = Math.round((Date.now() - t0) / 1000);
if (ensayo && txt.includes("ENSAYO_OK")) { console.log(`ENSAYO correcto en ${seg} s (nada se guardó): ` + JSON.parse(txt).message.replace(/\\"/g,"")); process.exit(0); }
console.log(`${archivo}: ${r.ok ? "ok" : "ERROR " + r.status} (${seg} s) ${r.ok ? "" : txt.slice(0, 900)}`);
process.exit(r.ok ? 0 : 1);
