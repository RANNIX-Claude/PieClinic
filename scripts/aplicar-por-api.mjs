// Aplica migraciones a UN proyecto Supabase por la API de administración (sin necesitar la contraseña de la base).
// Misma disciplina que scripts/apply-migration.mjs: una transacción por archivo, registro en <esquema>._rannix_migraciones
// (nombre + sha256), idempotente y se detiene en el primer error. Una migración aplicada con otro contenido no se reaplica.
//
//   SB_TOKEN=<token de acceso personal> node scripts/aplicar-por-api.mjs <ref_del_proyecto> <carpeta_de_migraciones> <esquema>
//
// El token llega solo por variable de entorno (nunca se escribe en un archivo). Para una instancia nueva:
//   node scripts/clonar-esquema.mjs pieclinic <carpeta> && node scripts/aplicar-por-api.mjs <ref> <carpeta> pieclinic
import fs from "fs";
import path from "path";
import crypto from "crypto";

const [ref, dir, esquema] = process.argv.slice(2);
const token = process.env.SB_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
if (!token || !ref || !dir || !/^[a-z][a-z0-9_]{2,30}$/.test(esquema || "")) {
  console.error("uso: SB_TOKEN=… node scripts/aplicar-por-api.mjs <ref> <carpeta_de_migraciones> <esquema>");
  process.exit(2);
}
const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;
const h = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
async function sql(query) {
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify({ query }) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof j === "string" ? j.slice(0, 700) : JSON.stringify(j).slice(0, 700)}`);
  return j;
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const TABLA = `${esquema}._rannix_migraciones`;
await sql(`create schema if not exists ${esquema}; create table if not exists ${TABLA} (nombre text primary key, sha256 text not null, aplicada_en timestamptz not null default now())`);
const hechas = new Map((await sql(`select nombre, sha256 from ${TABLA}`)).map((r) => [r.nombre, r.sha256]));
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  const texto = fs.readFileSync(path.join(dir, f), "utf8");
  const hash = sha(texto);
  if (hechas.has(f)) {
    if (hechas.get(f) !== hash) { console.error(`${f}: ya aplicada con OTRO contenido. Una migración aplicada no se edita.`); process.exit(1); }
    console.log(`  = ${f} (ya aplicada)`); continue;
  }
  const propio = /^\s*begin\b/im.test(texto);
  const registro = `insert into ${TABLA}(nombre, sha256) values ('${f}', '${hash}');`;
  const t0 = Date.now();
  try {
    await sql(propio ? texto : `begin;\n${texto}\n${registro}\ncommit;`);
    if (propio) await sql(registro);
    n++; console.log(`  ✓ ${f} (${Math.round((Date.now() - t0) / 100) / 10} s)`);
  } catch (e) {
    console.error(`  ✗ ${f}: ${e.message}`);
    await sql("rollback").catch(() => {});
    process.exit(1);
  }
}
await sql("notify pgrst, 'reload schema'").catch(() => {});
console.log(`\n${n} migración(es) aplicada(s) en ${ref} (esquema ${esquema}).`);
// La tabla de registro no debe ser legible desde la API de datos.
await sql(`alter table ${TABLA} enable row level security; revoke all on ${TABLA} from anon, authenticated;`).catch(() => {});
