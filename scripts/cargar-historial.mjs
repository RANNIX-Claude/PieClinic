// Carga el historial sintético de citas/ventas/caja (semilla E_01) mes por mes en QA, para tener 12 meses de datos.
//
//   node scripts/cargar-historial.mjs qa [--desde=2025-11-01] [--hasta=2026-07-27]
//
// Usa la API de administración de Supabase (SUPABASE_ACCESS_TOKEN) porque cada mes tarda: la semilla simula sesiones de caja con
// funciones de la base. Cada mes es idempotente (si ya hay citas en el rango no hace nada), así que puede repetirse sin duplicar.
// Nunca corre contra producción.
import fs from "fs";
import path from "path";
import { ambiente, ROOT, posicionales } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb || amb === "prod") { console.error("uso: node scripts/cargar-historial.mjs qa [--desde=AAAA-MM-DD] [--hasta=AAAA-MM-DD]"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
const token = cfg.env.SUPABASE_ACCESS_TOKEN;
if (!token || !cfg.ref) { console.error("Faltan SUPABASE_ACCESS_TOKEN y QA_SUPABASE_REF en .env.local"); process.exit(2); }

const opt = (n, def) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? def;
const desde = new Date(opt("desde", "2025-11-01") + "T00:00:00Z");
const hasta = new Date(opt("hasta", "2026-07-27") + "T00:00:00Z");
const plantilla = fs.readFileSync(path.join(ROOT, "supabase", "semillas", "E_01_historial_citas_ventas.sql"), "utf8");
const iso = (d) => d.toISOString().slice(0, 10);

for (let ini = new Date(desde); ini < hasta;) {
  const sig = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 1));
  const fin = sig < hasta ? sig : hasta;
  const sql = plantilla.replaceAll("{{DESDE}}", iso(ini)).replaceAll("{{HASTA}}", iso(fin));
  const t0 = Date.now();
  const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  const txt = await r.text();
  console.log(`${iso(ini)} → ${iso(fin)}: ${r.ok ? "ok" : "ERROR " + r.status + " " + txt.slice(0, 400)} (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (!r.ok) process.exit(1);
  ini = sig;
}
