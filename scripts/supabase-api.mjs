// Operaciones de Supabase por la API de gestión, con SUPABASE_ACCESS_TOKEN (variable de usuario).
// Sirve para crear los ambientes y correr SQL SIN pedirle al usuario que pegue nada en el SQL Editor.
//
//   node scripts/supabase-api.mjs orgs
//   node scripts/supabase-api.mjs crear qa   [--org=<id>] [--region=us-west-1]
//   node scripts/supabase-api.mjs crear prod [--org=<id>] [--region=us-west-1]
//   node scripts/supabase-api.mjs llaves qa                 (re-lee anon/service_role y las guarda)
//   node scripts/supabase-api.mjs sql qa migraciones/001_x.sql     (o:  sql qa --q "select 1")
//
// NOTA: los endpoints son los de la API pública de Supabase (https://api.supabase.com/v1). Validar en el
// primer proyecto nuevo; si Supabase cambia un campo, ajustar aquí y en ningún otro lugar.
import fs from "fs";
import crypto from "crypto";
import { cargarEnv, guardarEnv, prefijo, exigirConfirmacionProd, posicionales } from "./lib/env.mjs";

const env = cargarEnv();
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error("Falta SUPABASE_ACCESS_TOKEN (variable de entorno de usuario). Ver docs/ACCESOS.md"); process.exit(2); }
const API = "https://api.supabase.com/v1";
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(API + ruta, { method: metodo, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!r.ok) { console.error(`API ${metodo} ${ruta} → ${r.status}`, typeof j === "string" ? j : JSON.stringify(j)); process.exit(1); }
  return j;
};
const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const [cmd, amb, archivo] = posicionales();

async function guardarLlaves(amb, ref) {
  const p = prefijo(amb);
  const llaves = await api("GET", `/projects/${ref}/api-keys`);
  const anon = llaves.find((k) => k.name === "anon")?.api_key, service = llaves.find((k) => k.name === "service_role")?.api_key;
  guardarEnv(`${p}SUPABASE_REF`, ref); guardarEnv(`${p}SUPABASE_URL`, `https://${ref}.supabase.co`);
  if (anon) guardarEnv(`${p}SUPABASE_ANON_KEY`, anon); if (service) guardarEnv(`${p}SUPABASE_SERVICE_ROLE_KEY`, service);
  if (amb === "qa") { guardarEnv("VITE_SUPABASE_URL", `https://${ref}.supabase.co`); if (anon) guardarEnv("VITE_SUPABASE_ANON_KEY", anon); }
  console.log(`Llaves de ${amb} guardadas en .env.local (anon${service ? " + service_role" : ""}).`);
}

if (cmd === "orgs") {
  const orgs = await api("GET", "/organizations");
  if (!orgs.length) console.error("El token es válido pero no ve ninguna organización: puede ser el token de otra cuenta de Supabase.");
  for (const o of orgs) console.log(`${o.id}\t${o.name}`);
} else if (cmd === "crear") {
  if (!["qa", "prod"].includes(amb)) { console.error("uso: crear qa|prod"); process.exit(2); }
  const p = prefijo(amb);
  if (env[`${p}SUPABASE_REF`]) { console.error(`Ya existe ${p}SUPABASE_REF en .env.local. No se crea otro.`); process.exit(1); }
  const proyecto = env.PROYECTO; if (!proyecto) { console.error("Define PROYECTO en .env.local."); process.exit(2); }
  const orgs = await api("GET", "/organizations");
  const org = flag("org") || (orgs.length === 1 ? orgs[0].id : null);
  if (!org) { console.error("Hay varias organizaciones; elige con --org=<id>:\n" + orgs.map((o) => `  ${o.id}  ${o.name}`).join("\n")); process.exit(2); }
  const password = crypto.randomBytes(18).toString("base64url");
  const nuevo = await api("POST", "/projects", { name: `${proyecto}-${amb}`, organization_id: org, db_pass: password, region: flag("region") || "us-west-1" });
  guardarEnv(`${p}SUPABASE_DB_PASSWORD`, password);
  console.log(`Proyecto ${nuevo.name} creado (ref ${nuevo.id ?? nuevo.ref}). Esperando a que esté activo…`);
  const ref = nuevo.id ?? nuevo.ref;
  for (let i = 0; i < 60; i++) {
    const est = (await api("GET", `/projects/${ref}`)).status;
    if (String(est).startsWith("ACTIVE")) break;
    await new Promise((r) => setTimeout(r, 10000));
  }
  await guardarLlaves(amb, ref);
  console.log("Listo. Respaldo/PITR en producción: verificarlo en el panel antes del primer dato real.");
} else if (cmd === "llaves") {
  const ref = env[`${prefijo(amb)}SUPABASE_REF`]; if (!ref) { console.error(`Falta ${prefijo(amb)}SUPABASE_REF`); process.exit(2); }
  await guardarLlaves(amb, ref);
} else if (cmd === "sql") {
  exigirConfirmacionProd(amb);
  const ref = env[`${prefijo(amb)}SUPABASE_REF`]; if (!ref) { console.error(`Falta ${prefijo(amb)}SUPABASE_REF`); process.exit(2); }
  const qi = process.argv.indexOf("--q");
  const query = qi > 0 ? process.argv[qi + 1] : fs.readFileSync(archivo, "utf8");
  console.log(JSON.stringify(await api("POST", `/projects/${ref}/database/query`, { query }), null, 2));
} else {
  console.error("comandos: orgs | crear qa|prod | llaves qa|prod | sql qa|prod <archivo | --q \"sql\">"); process.exit(2);
}
