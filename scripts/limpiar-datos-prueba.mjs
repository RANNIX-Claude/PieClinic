// Limpia los datos de PRUEBA: borra la organización marcada parametros.es_prueba = true (con todo lo que cuelga de ella por cascada).
//
//   node scripts/limpiar-datos-prueba.mjs qa             → vista previa: cuántas filas tiene cada tabla de esa organización (no borra nada)
//   node scripts/limpiar-datos-prueba.mjs qa --ejecutar  → borra de verdad (pide además --organizacion=<uuid> para evitar equivocaciones)
//
// Nunca corre contra producción y se niega a tocar una organización que no esté marcada como de prueba, así que no puede alcanzar datos reales.
// Las cuentas de auth (a@g.com, etc.) NO se borran: usa qa-usuarios-prueba.mjs --quitar para desactivarlas.
import { ambiente, posicionales, arg } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb || amb === "prod") { console.error("uso: node scripts/limpiar-datos-prueba.mjs qa [--ejecutar --organizacion=<uuid>]  (nunca producción)"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
const token = cfg.env.SUPABASE_ACCESS_TOKEN;
if (!token || !cfg.ref) { console.error("Faltan SUPABASE_ACCESS_TOKEN y QA_SUPABASE_REF en .env.local"); process.exit(2); }

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j;
};

const orgs = await sql(`select id, nombre from piefirme.organizaciones where coalesce((parametros ->> 'es_prueba')::boolean, false)`);
if (!orgs.length) { console.log("No hay organizaciones marcadas como de prueba. Nada que limpiar."); process.exit(0); }
for (const o of orgs) {
  const conteos = await sql(`select table_name t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from piefirme.%I where organizacion_id = %L', table_name, '${o.id}'), false, true, '')))[1]::text::int n
      from information_schema.columns where table_schema = 'piefirme' and column_name = 'organizacion_id' and table_name in (select table_name from information_schema.tables where table_schema = 'piefirme' and table_type = 'BASE TABLE') order by 2 desc`);
  const con = conteos.filter((c) => c.n > 0);
  console.log(`\n${o.nombre} (${o.id}): ${con.reduce((s, c) => s + c.n, 0)} filas en ${con.length} tablas`);
  console.log(con.slice(0, 15).map((c) => `  ${c.t.padEnd(32)} ${c.n}`).join("\n"));
  if (!arg("--ejecutar")) continue;
  if (process.argv.find((a) => a.startsWith("--organizacion=")) !== `--organizacion=${o.id}`) { console.log(`  → para borrar agrega --organizacion=${o.id}`); continue; }
  await sql(`delete from piefirme.organizaciones where id = '${o.id}' and coalesce((parametros ->> 'es_prueba')::boolean, false)`);
  console.log("  ✓ organización de prueba borrada");
}
if (!arg("--ejecutar")) console.log("\n(vista previa: no se borró nada)");
