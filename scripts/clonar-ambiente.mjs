// Clona un ambiente a otro (típico: qa → nuevo, prod → qa para pruebas con datos realistas).
//
//   node scripts/clonar-ambiente.mjs qa demo                # todos los pasos
//   node scripts/clonar-ambiente.mjs qa demo schema         # solo un paso
//   pasos: schema | data | auth | grants | storage
//
// Ambientes por prefijo en .env.local (qa → QA_*, demo → DEMO_*, prod → sin prefijo).
// SEGURIDAD: el DESTINO nunca puede ser prod (el script lo rechaza siempre). Si el ORIGEN es prod
// los datos son reales: anonimizar antes de dárselos a un agente de QA o a un tercero.
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { ROOT, ambiente, conectar, posicionales } from "./lib/env.mjs";

const [origen, destino, paso] = posicionales();
if (!origen || !destino) { console.error("uso: node scripts/clonar-ambiente.mjs <origen> <destino> [schema|data|auth|grants|storage]"); process.exit(2); }
if (destino === "prod") { console.error("El destino de una clonación no puede ser producción."); process.exit(3); }
if (origen === destino) { console.error("Origen y destino son el mismo."); process.exit(2); }

const src = ambiente(origen), dst = ambiente(destino);
const SCHEMAS = (src.env.DUMP_SCHEMAS || "piefirme,piefirme_app").split(",").map((s) => s.trim());
if (origen === "prod") console.warn("⚠ Origen = PRODUCCIÓN: se copiarán datos reales.");

async function aplicarSchema() {
  console.log("\n— Esquema");
  const f = path.join(ROOT, "supabase", "bootstrap", `schema-${origen}.sql`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "dump-schema.mjs"), origen, `--salida=${f}`], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
  const db = await conectar(dst);
  try { await db.query(fs.readFileSync(f, "utf8")); console.log("  ✓ esquema aplicado"); }
  finally { await db.end(); }
}

async function copiarDatos() {
  console.log("\n— Datos");
  const a = await conectar(src, { soloLectura: true }), b = await conectar(dst);
  await b.query("set session_replication_role = replica");
  const tablas = (await a.query(`select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname = any($1) and c.relname <> '_rannix_migraciones' order by 1,2`, [SCHEMAS])).rows;
  for (const { s, t } of tablas) {
    const id = `"${s}"."${t}"`;
    try {
      const filas = (await a.query(`select * from ${id}`)).rows;
      if (!filas.length) continue;
      const gen = new Set((await b.query(`select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and (is_generated='ALWAYS' or identity_generation='ALWAYS')`, [s, t])).rows.map((r) => r.column_name));
      const enDestino = new Set((await b.query(`select column_name from information_schema.columns where table_schema=$1 and table_name=$2`, [s, t])).rows.map((r) => r.column_name));
      const cols = Object.keys(filas[0]).filter((k) => enDestino.has(k) && !gen.has(k));
      await b.query(`delete from ${id}`);
      for (let i = 0; i < filas.length; i += 200) {
        const lote = filas.slice(i, i + 200);
        const ph = lote.map((_, ri) => "(" + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",") + ")").join(",");
        await b.query(`insert into ${id} (${cols.map((k) => `"${k}"`).join(",")}) values ${ph}`, lote.flatMap((r) => cols.map((k) => r[k])));
      }
      console.log(`  ✓ ${id.padEnd(42)} ${String(filas.length).padStart(6)} filas`);
    } catch (e) { console.error(`  ✗ ${id}: ${e.message.split("\n")[0]}`); }
  }
  await b.query(`do $$ declare r record; begin
    for r in select n.nspname s, t.relname tb, a.attname col, pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(t.relname), a.attname) sq
      from pg_attribute a join pg_class t on a.attrelid=t.oid join pg_namespace n on t.relnamespace=n.oid
      where a.attnum>0 and not a.attisdropped and n.nspname = any(string_to_array('${SCHEMAS.join(",")}', ','))
        and pg_get_serial_sequence(quote_ident(n.nspname)||'.'||quote_ident(t.relname), a.attname) is not null
    loop execute format('select setval(%L, coalesce((select max(%I) from %I.%I), 1))', r.sq, r.col, r.s, r.tb); end loop; end $$`);
  await b.query("set session_replication_role = default");
  await a.end(); await b.end();
}

async function copiarAuth() {
  console.log("\n— Usuarios (auth)");
  const a = await conectar(src, { soloLectura: true }), b = await conectar(dst);
  for (const tabla of ["users", "identities"]) {
    const filas = (await a.query(`select * from auth.${tabla}`)).rows;
    if (tabla === "users") { await b.query("truncate auth.identities cascade"); await b.query("truncate auth.users cascade"); }
    const ok = new Set((await b.query(`select column_name from information_schema.columns where table_schema='auth' and table_name=$1 and is_generated='NEVER'`, [tabla])).rows.map((r) => r.column_name));
    let n = 0;
    for (const f of filas) {
      const cols = Object.keys(f).filter((k) => ok.has(k));
      try { await b.query(`insert into auth.${tabla} (${cols.map((k) => `"${k}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) on conflict do nothing`, cols.map((k) => f[k])); n++; }
      catch (e) { console.error(`  ✗ ${tabla}: ${e.message.split("\n")[0]}`); }
    }
    console.log(`  ✓ ${n}/${filas.length} ${tabla}`);
  }
  await a.end(); await b.end();
}

// Réplica exacta de los grants del origen (no se otorga "ALL a anon": se copia lo que el origen decidió).
async function copiarGrants() {
  console.log("\n— Grants");
  const a = await conectar(src, { soloLectura: true }), b = await conectar(dst);
  for (const s of SCHEMAS) await b.query(`grant usage on schema "${s}" to anon, authenticated, service_role`);
  const g = (await a.query(`select table_schema s, table_name t, grantee, string_agg(privilege_type, ',') p from information_schema.role_table_grants where table_schema = any($1) and grantee in ('anon','authenticated','service_role') group by 1,2,3`, [SCHEMAS])).rows;
  let n = 0;
  for (const r of g) { try { await b.query(`grant ${r.p} on "${r.s}"."${r.t}" to ${r.grantee}`); n++; } catch { /* tabla no existe en destino */ } }
  await b.query(`grant all on all sequences in schema piefirme to authenticated, service_role`);
  await b.query(`notify pgrst, 'reload schema'`);
  console.log(`  ✓ ${n} grants replicados`);
  await a.end(); await b.end();
}

async function copiarStorage() {
  if (!src.service || !dst.service) { console.log("\n— Storage omitido: faltan SERVICE_ROLE_KEY de origen o destino."); return; }
  console.log("\n— Storage");
  const H = (k) => ({ Authorization: `Bearer ${k}`, apikey: k });
  const buckets = await (await fetch(`${src.url}/storage/v1/bucket`, { headers: H(src.service) })).json();
  for (const bk of Array.isArray(buckets) ? buckets : []) {
    await fetch(`${dst.url}/storage/v1/bucket`, { method: "POST", headers: { ...H(dst.service), "Content-Type": "application/json" }, body: JSON.stringify({ id: bk.id, name: bk.name, public: bk.public, file_size_limit: bk.file_size_limit, allowed_mime_types: bk.allowed_mime_types }) });
    const listar = async (prefix) => {
      const items = await (await fetch(`${src.url}/storage/v1/object/list/${bk.id}`, { method: "POST", headers: { ...H(src.service), "Content-Type": "application/json" }, body: JSON.stringify({ limit: 1000, offset: 0, prefix }) })).json();
      const r = [];
      for (const it of Array.isArray(items) ? items : []) { const p = prefix ? `${prefix}/${it.name}` : it.name; if (it.id) r.push(p); else r.push(...await listar(p)); }
      return r;
    };
    let ok = 0; const archivos = await listar("");
    for (const p of archivos) {
      try {
        const dl = await fetch(`${src.url}/storage/v1/object/${bk.id}/${p}`, { headers: H(src.service) });
        if (!dl.ok) continue;
        const up = await fetch(`${dst.url}/storage/v1/object/${bk.id}/${p}`, { method: "POST", headers: { ...H(dst.service), "Content-Type": dl.headers.get("content-type") || "application/octet-stream", "x-upsert": "true" }, body: Buffer.from(await dl.arrayBuffer()) });
        if (up.ok) ok++;
      } catch { /* siguiente */ }
    }
    console.log(`  ✓ ${bk.id}: ${ok}/${archivos.length} archivos`);
  }
}

const PASOS = { schema: aplicarSchema, data: copiarDatos, auth: copiarAuth, grants: copiarGrants, storage: copiarStorage };
console.log(`Clonando ${origen} → ${destino}`);
if (paso && !PASOS[paso]) { console.error(`Paso desconocido: ${paso}`); process.exit(2); }
try { for (const p of paso ? [paso] : Object.keys(PASOS)) await PASOS[p](); }
catch (e) { console.error("\nError:", e.message); process.exit(1); }
console.log("\nClonación completada.");
