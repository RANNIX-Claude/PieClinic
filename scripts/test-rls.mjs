// Pruebas de seguridad (RLS y permisos) — genéricas, sin conocer el esquema del proyecto.
//
//   node scripts/test-rls.mjs qa
//   node scripts/test-rls.mjs prod            # solo lectura
//   node scripts/test-rls.mjs qa --reporte    # además escribe docs/verificacion-rls-<amb>-<fecha>.md
//
// Verificaciones estructurales (todas de solo lectura):
//   1 tablas sin RLS · 2 políticas abiertas (USING true) · 3 vistas sin security_invoker
//   4 grants de anon · 5 funciones ejecutables por anon/PUBLIC · 6 buckets públicos
//   7 sondeo REST con la clave anon (lo que ve quien tenga el bundle del frontend)
//   8 aserciones por rol declaradas en tests/rls.config.json (SET LOCAL ROLE + claims JWT, ROLLBACK)
//
// Lo permitido a propósito se declara en tests/rls.config.json: nada se excusa en silencio.
import fs from "fs";
import path from "path";
import { ROOT, ambiente, conectar, arg, posicionales, hoy } from "./lib/env.mjs";

const amb = posicionales()[0] || "qa";
const cfg = ambiente(amb);
let conf = {};
try { conf = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "rls.config.json"), "utf8")); } catch { console.warn("(sin tests/rls.config.json: se aplican reglas estrictas sin excepciones)"); }
const A = (k) => new Set(conf[k] ?? []);
const esquemas = conf.esquemas ?? ["piefirme", "piefirme_app"];
const sinRls = A("sin_rls_permitidas"), abiertas = A("politicas_abiertas_permitidas"), anonOk = A("anon_permitido"),
      fnAnonOk = A("funciones_anon_permitidas"), bucketsOk = A("buckets_publicos_permitidos");

const c = await conectar(cfg, { soloLectura: true });
const q = async (s, p) => (await c.query(s, p)).rows;
const R = []; let fallas = 0;
const check = (bloque, prueba, ok, detalle = "") => { if (!ok) fallas++; R.push({ bloque, prueba, ok, detalle }); console.log(`  ${ok ? "✓" : "✗"} [${bloque}] ${prueba}${detalle ? " → " + detalle : ""}`); };

console.log(`\nPruebas de seguridad — ambiente ${amb}\n`);

// 1 · tablas sin RLS
for (const t of await q(`select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname = any($1) and not c.relrowsecurity and c.relname <> '_rannix_migraciones' order by 1,2`, [esquemas])) {
  const id = `${t.s}.${t.t}`; check("RLS", `RLS activo en ${id}`, sinRls.has(id), sinRls.has(id) ? "excepción declarada" : "RLS DESACTIVADO");
}
if (!R.some((r) => r.bloque === "RLS")) check("RLS", "todas las tablas tienen RLS", true);

// 2 · políticas abiertas
const pols = await q(`select schemaname s, tablename t, policyname p, roles::text r, cmd, qual, with_check from pg_policies where schemaname = any($1)`, [esquemas]);
let abiertasN = 0;
for (const p of pols) {
  const abierta = (p.qual ?? "").trim() === "true" || (p.cmd !== "SELECT" && (p.with_check ?? "").trim() === "true");
  const alcance = /anon|authenticated|public/.test(p.r) || p.r === "{}";
  if (abierta && alcance) { abiertasN++; const id = `${p.s}.${p.t}:${p.p}`; check("POLÍTICAS", `política abierta ${id} (${p.cmd})`, abiertas.has(id) || abiertas.has(`${p.s}.${p.t}`), "USING/CHECK true para " + p.r); }
}
if (!abiertasN) check("POLÍTICAS", "ninguna política USING (true)", true);

// 3 · vistas sin security_invoker
const vistas = await q(`select n.nspname s, c.relname v, coalesce(c.reloptions::text,'') o from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='v' and n.nspname = any($1)`, [esquemas]);
for (const v of vistas) check("VISTAS", `${v.s}.${v.v} con security_invoker`, /security_invoker=(true|on)/.test(v.o), v.o || "sin opciones");
if (!vistas.length) check("VISTAS", "sin vistas que revisar", true);

// 4 · grants de anon sobre tablas/vistas
for (const g of await q(`select table_schema s, table_name t, string_agg(privilege_type, ',') p from information_schema.role_table_grants
    where grantee='anon' and table_schema = any($1) group by 1,2 order by 1,2`, [esquemas])) {
  const id = `${g.s}.${g.t}`; check("ANON", `anon sin acceso a ${id}`, anonOk.has(id), `anon tiene ${g.p}`);
}
if (!R.some((r) => r.bloque === "ANON")) check("ANON", "anon no tiene grants en las tablas", true);

// 5 · funciones ejecutables por anon
for (const f of await q(`select n.nspname s, p.proname f, p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname = any($1) and p.prokind='f' and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`, [esquemas])) {
  const ok = (await q(`select has_function_privilege('anon', $1::oid, 'EXECUTE') x`, [f.oid]))[0].x === false;
  if (!ok) check("FUNCIONES", `anon no ejecuta ${f.s}.${f.f}`, fnAnonOk.has(`${f.s}.${f.f}`), "EXECUTE heredado de PUBLIC o concedido");
}
if (!R.some((r) => r.bloque === "FUNCIONES")) check("FUNCIONES", "anon no ejecuta funciones", true);

// 6 · buckets públicos
try {
  for (const b of await q(`select id, public from storage.buckets order by id`)) check("STORAGE", `bucket ${b.id} ${b.public ? "PÚBLICO" : "privado"}`, !b.public || bucketsOk.has(b.id), b.public ? "público" : "");
} catch { console.log("  (sin esquema storage)"); }

// 7 · sondeo REST con anon
if (cfg.url && cfg.anon) {
  const tablas = await q(`select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','v','p') and n.nspname='piefirme' and left(c.relname,1) <> '_' order by 1 limit 300`);
  let expuestas = 0;
  for (const { t } of tablas) {
    if (anonOk.has(`piefirme.${t}`)) continue;
    try {
      const r = await fetch(`${cfg.url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${cfg.anon}`, "Accept-Profile": "piefirme" } });
      const cuerpo = r.ok ? await r.json().catch(() => null) : null;
      if (Array.isArray(cuerpo) && cuerpo.length) { expuestas++; check("REST-ANON", `anon NO debe leer piefirme.${t}`, false, "devolvió filas"); }
    } catch { /* red */ }
  }
  if (!expuestas) check("REST-ANON", `anon no lee filas de ${tablas.length} tablas/vistas`, true);
} else console.log("  (sondeo REST omitido: faltan URL o clave anon del ambiente)");

// 8 · aserciones por rol
for (const a of conf.aserciones ?? []) {
  const etiqueta = `${a.rol ?? "authenticated"} → ${a.tabla} espera ${a.esperado}`;
  try {
    const total = Number((await q(`select count(*) n from ${a.tabla}`))[0].n);
    await c.query("begin");
    await c.query("set transaction read write").catch(() => {});
    const uid = a.usuario_sql ? (await q(a.usuario_sql))[0]?.id : (a.usuario ?? null);
    await c.query(`set local role ${a.rol_pg ?? "authenticated"}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: a.rol_pg ?? "authenticated", ...(a.claims ?? {}) })]);
    const n = Number((await q(`select count(*) n from ${a.tabla}`))[0].n);
    await c.query("rollback");
    const ok = a.esperado === "todas" ? n === total : a.esperado === "ninguna" ? n === 0 : n === Number(a.esperado);
    check("ROLES", etiqueta, ok, `obtuvo ${n} de ${total}`);
  } catch (e) { await c.query("rollback").catch(() => {}); check("ROLES", etiqueta, false, e.message.split("\n")[0]); }
}
await c.end();

console.log(`\n${R.length} pruebas · ${fallas} fallas`);
if (arg("--reporte")) {
  const f = path.join(ROOT, "docs", `verificacion-rls-${amb}-${hoy()}.md`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `# Verificación de seguridad — ${amb} — ${hoy()}\n\n${R.length} pruebas · **${fallas} fallas**\n\n| Bloque | Prueba | Resultado | Detalle |\n|---|---|---|---|\n` +
    R.map((r) => `| ${r.bloque} | ${r.prueba} | ${r.ok ? "✓" : "✗"} | ${r.detalle} |`).join("\n") + "\n");
  console.log("Reporte:", path.relative(ROOT, f));
}
process.exit(fallas ? 1 : 0);
