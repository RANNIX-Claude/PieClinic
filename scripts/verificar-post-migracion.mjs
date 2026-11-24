// Verificación posterior a una migración: (1) ¿quedó algo pendiente o con deriva? (2) pruebas de seguridad
// con reporte en docs/verificacion-rls-<amb>-<fecha>.md. Solo reporta; no corrige.
//
//   node scripts/verificar-post-migracion.mjs qa
//   node scripts/verificar-post-migracion.mjs prod
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { ROOT, ambiente, conectar, posicionales } from "./lib/env.mjs";

const amb = posicionales()[0] || "qa";
const c = await conectar(ambiente(amb), { soloLectura: true });
let aplicadas = new Map();
try { aplicadas = new Map((await c.query("select nombre, sha256 from piefirme._rannix_migraciones")).rows.map((r) => [r.nombre, r.sha256])); } catch { console.warn("(aún no hay registro de migraciones en este ambiente)"); }
await c.end();

const DIR = path.join(ROOT, "migraciones");
const archivos = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort() : [];
let problemas = 0;
for (const f of archivos) {
  const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(DIR, f), "utf8")).digest("hex");
  if (!aplicadas.has(f)) { console.log(`  ⏳ pendiente en ${amb}: ${f}`); problemas++; }
  else if (aplicadas.get(f) !== h) { console.log(`  ✗ DERIVA: ${f} cambió después de aplicarse en ${amb}`); problemas++; }
}
for (const n of aplicadas.keys()) if (!archivos.includes(n)) { console.log(`  ✗ aplicada en ${amb} pero ya no existe en migraciones/: ${n}`); problemas++; }
if (!problemas) console.log(`  ✓ ${archivos.length} migraciones al día en ${amb}`);

const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "test-rls.mjs"), amb, "--reporte"], { stdio: "inherit" });
process.exit(problemas || r.status ? 1 : 0);
