// Valida las migraciones en una BD Postgres local desechable (PGlite) con un esquema "auth" simulado.
//   node scripts/validar-sql-local.mjs              → aplica todas las migraciones/*.sql en orden
//   node scripts/validar-sql-local.mjs 005          → hasta la 005 inclusive
// No toca Supabase. Sirve para detectar errores de sintaxis, dependencias y reglas básicas de RLS antes de QA.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ROOT } from "./lib/env.mjs";

//   node scripts/validar-sql-local.mjs --archivos 001,010,030 [--stubs ruta/stub.sql]
//        aplica solo esos prefijos (más, antes de ellos, el stub opcional con tablas simuladas de otras migraciones)
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const solo = val("--archivos")?.split(",");
const stubs = val("--stubs");
const hasta = args.find((a) => /^\d+$/.test(a));
const dir = path.join(ROOT, "migraciones");
const archivos = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
  .filter((f) => (solo ? solo.some((p) => f.startsWith(p + "_")) : (!hasta || f.slice(0, hasta.length) <= hasta)));

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
`);
if (stubs) { await db.exec(fs.readFileSync(stubs, "utf8")); console.log("  · stub aplicado:", stubs); }
let ok = 0;
for (const f of archivos) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, "");
  try { await db.exec(sql); console.log("  ✓", f); ok++; }
  catch (e) { console.error("  ✗", f, "→", e.message); process.exitCode = 1; break; }
}
// Semillas sintéticas (opcional, lento: B_02 tarda minutos en PGlite). Orden que respeta sus dependencias.
if ((args.includes("--semillas") || val("--solo-semillas")) && !process.exitCode) {
  const todas = ["D_01", "A_01", "A_02", "B_00", "B_01", "B_02", "A_03", "C_01", "C_02", "C_03", "C_04", "D_02", "D_03", "D_04"];
  const orden = val("--solo-semillas") ? val("--solo-semillas").split(",") : todas;   // --solo-semillas D_01,A_01,B_00 (B_02 tarda ~11 min)
  const sd = path.join(ROOT, "supabase", "semillas");
  for (const pre of orden) {
    const f = fs.readdirSync(sd).find((x) => x.startsWith(pre + "_"));
    if (!f) continue;
    const t0 = Date.now();
    try { await db.exec(fs.readFileSync(path.join(sd, f), "utf8")); console.log(`  ✓ semilla ${f} (${Math.round((Date.now() - t0) / 1000)} s)`); }
    catch (e) { console.error("  ✗ semilla", f, "→", e.message); process.exitCode = 1; break; }
  }
}
// Revisión estructural mínima: tablas sin RLS y políticas abiertas en public
const sinRls = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='piefirme' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`)).rows;
const abiertas = (await db.query(`select tablename, policyname from pg_policies where schemaname='piefirme' and (trim(coalesce(qual,''))='true' or trim(coalesce(with_check,''))='true')`)).rows;
const vistas = (await db.query(`select c.relname, coalesce(c.reloptions::text,'') o from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='piefirme' and c.relkind='v'`)).rows.filter((v) => !/security_invoker=(true|on)/.test(v.o));
console.log(`\n${ok}/${archivos.length} migraciones aplicadas.`);
console.log(`Tablas sin RLS: ${sinRls.length ? sinRls.map((r) => r.relname).join(", ") : "ninguna"}`);
console.log(`Políticas abiertas: ${abiertas.length ? abiertas.map((r) => r.tablename + ":" + r.policyname).join(", ") : "ninguna"}`);
console.log(`Vistas sin security_invoker: ${vistas.length ? vistas.map((r) => r.relname).join(", ") : "ninguna"}`);
if (sinRls.length || abiertas.length || vistas.length) process.exitCode = 1;
// BASE COMPARTIDA: nada de Pie Firme debe quedar fuera de sus esquemas (ni en public ni en auth/storage salvo buckets y políticas pf-/pf_)
const fuera = (await db.query(`select n.nspname||'.'||c.relname as o from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','v','p','S') and c.relname not in ('users')
  union all select 'public.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select 'storage.policy:'||policyname from pg_policies where schemaname='storage' and policyname not like 'pf\_%'
  union all select 'storage.bucket:'||id from storage.buckets where id not like 'pf-%'`)).rows.map((r) => r.o);
console.log(`Objetos fuera de piefirme/piefirme_app: ${fuera.length ? fuera.join(", ") : "ninguno"}`);
if (fuera.length) process.exitCode = 1;
// Funciones ejecutables por anon (deben estar declaradas en tests/rls.config.json → funciones_anon_permitidas)
const anonFn = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='piefirme' and has_function_privilege('anon', p.oid, 'execute') and p.prokind='f' order by 1`)).rows.map((r) => r.proname);
let permitidas = [];
try { permitidas = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "rls.config.json"), "utf8")).funciones_anon_permitidas ?? []; } catch {}
const noDecl = anonFn.filter((f) => !permitidas.includes(f));
console.log(`Funciones anon: ${anonFn.join(", ") || "ninguna"}${noDecl.length ? "\n  ✗ NO declaradas en rls.config.json: " + noDecl.join(", ") : ""}`);
if (noDecl.length) process.exitCode = 1;
