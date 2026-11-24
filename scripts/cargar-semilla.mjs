// Ejecuta un archivo de supabase/semillas/ contra QA por la API de administración de Supabase (las semillas simulan sesiones y omiten RLS).
//
//   node scripts/cargar-semilla.mjs qa E_02_historial_gastos_asistencia.sql
//
// Nunca corre contra producción. Las semillas son idempotentes: repetirlas no duplica datos.
import fs from "fs";
import path from "path";
import { ambiente, ROOT, posicionales } from "./lib/env.mjs";

const [amb, archivo] = posicionales();
if (!amb || amb === "prod" || !archivo) { console.error("uso: node scripts/cargar-semilla.mjs qa <archivo.sql dentro de supabase/semillas>  (nunca producción)"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
const token = cfg.env.SUPABASE_ACCESS_TOKEN;
if (!token || !cfg.ref) { console.error("Faltan SUPABASE_ACCESS_TOKEN y QA_SUPABASE_REF en .env.local"); process.exit(2); }

const ruta = path.join(ROOT, "supabase", "semillas", path.basename(archivo));
const sql = fs.readFileSync(ruta, "utf8");
const t0 = Date.now();
const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
});
const txt = await r.text();
console.log(`${path.basename(ruta)}: ${r.ok ? "ok" : "ERROR " + r.status + " " + txt.slice(0, 600)} (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(r.ok ? 0 : 1);
