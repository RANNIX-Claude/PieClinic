// Foto de los objetos de seguridad (políticas, grants, funciones, vistas, buckets) con SQL de reversión.
// Se corre ANTES de migrar producción.
//
//   node scripts/snapshot-seguridad.mjs prod
//   node scripts/snapshot-seguridad.mjs qa
//
// Solo lectura. Escribe en supabase/backups/:
//   seguridad-<amb>-<fecha>.json            todo lo observado
//   rollback-seguridad-<amb>-<fecha>.sql    recrea políticas y grants de tablas tal como estaban
import fs from "fs";
import path from "path";
import { ROOT, ambiente, conectar, posicionales } from "./lib/env.mjs";

const amb = posicionales()[0] || "prod";
const cfg = ambiente(amb);
const esquemas = (cfg.env.DUMP_SCHEMAS || "piefirme,piefirme_app").split(",").map((s) => s.trim());
const c = await conectar(cfg, { soloLectura: true });
const q = async (s, p) => (await c.query(s, p)).rows;

const snap = {
  fecha: new Date().toISOString(), ambiente: amb, esquemas,
  policies: await q(`select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check from pg_policies where schemaname = any($1) or schemaname='storage' order by 1,2,3`, [esquemas]),
  rls: await q(`select n.nspname schema, c.relname tabla, c.relrowsecurity rls, c.relforcerowsecurity forzado from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname = any($1) order by 1,2`, [esquemas]),
  table_grants: await q(`select table_schema, table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where table_schema = any($1) and grantee in ('anon','authenticated','service_role') group by 1,2,3 order by 1,2,3`, [esquemas]),
  functions: await q(`select n.nspname schema, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef secdef, p.proacl::text acl, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname = any($1) and p.prokind='f' order by 1,2`, [esquemas]),
  views: await q(`select n.nspname schema, c.relname vista, c.reloptions::text opts from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname = any($1) and c.relkind='v' order by 1,2`, [esquemas]),
  buckets: await q(`select id, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`).catch(() => []),
};
await c.end();

const rb = [`-- Reversión de seguridad — ${amb} — foto ${snap.fecha}`, `-- Recrea RLS, políticas y grants de tablas tal como estaban. Funciones y vistas: ver el JSON.`, `BEGIN;`, ``];
const porTabla = new Map();
for (const p of snap.policies) { const k = `${p.schemaname}"."${p.tablename}`; (porTabla.get(k) ?? porTabla.set(k, []).get(k)).push(p); }
for (const [k, ps] of porTabla) {
  for (const p of ps) rb.push(`DROP POLICY IF EXISTS "${p.policyname}" ON "${k}";`);
  for (const p of ps) {
    const roles = p.roles.replace(/^\{|\}$/g, "") || "public";
    rb.push(`CREATE POLICY "${p.policyname}" ON "${k}" AS ${p.permissive} FOR ${p.cmd} TO ${roles}${p.qual ? ` USING (${p.qual})` : ""}${p.with_check ? ` WITH CHECK (${p.with_check})` : ""};`);
  }
}
for (const r of snap.rls) rb.push(`ALTER TABLE "${r.schema}"."${r.tabla}" ${r.rls ? "ENABLE" : "DISABLE"} ROW LEVEL SECURITY;`);
const revocadas = new Set();
for (const g of snap.table_grants) {
  const t = `"${g.table_schema}"."${g.table_name}"`;
  if (!revocadas.has(t)) { rb.push(`REVOKE ALL ON ${t} FROM anon, authenticated, service_role;`); revocadas.add(t); }
  rb.push(`GRANT ${g.privs} ON ${t} TO ${g.grantee};`);
}
rb.push(``, `COMMIT;`);

const dir = path.join(ROOT, "supabase", "backups"); fs.mkdirSync(dir, { recursive: true });
const sello = snap.fecha.replace(/[:T]/g, "-").slice(0, 19);
fs.writeFileSync(path.join(dir, `seguridad-${amb}-${sello}.json`), JSON.stringify(snap, null, 2));
fs.writeFileSync(path.join(dir, `rollback-seguridad-${amb}-${sello}.sql`), rb.join("\n"));
console.log(`Foto de seguridad (${amb}): ${snap.policies.length} políticas · ${snap.table_grants.length} grants · ${snap.functions.length} funciones · ${snap.views.length} vistas · ${snap.buckets.length} buckets`);
console.log(`→ supabase/backups/rollback-seguridad-${amb}-${sello}.sql`);
for (const b of snap.buckets) console.log(`  [ ] verificar manualmente bucket ${b.id} (${b.public ? "PÚBLICO" : "privado"})`);
