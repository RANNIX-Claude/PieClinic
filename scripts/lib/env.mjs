// Utilidades compartidas por scripts/. Todo lo específico del proyecto sale de .env.local
// (o de variables de entorno en CI) — aquí no hay refs, hosts ni contraseñas.
//
// Ambientes:  qa → prefijo QA_   ·   prod → sin prefijo   ·   cualquier otro → NOMBRE_
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function cargarEnv() {
  const env = { ...process.env };
  try {
    for (const linea of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
      if (v && !env[m[1]]) env[m[1]] = v;
    }
  } catch { /* en CI no hay .env.local */ }
  return env;
}

export const prefijo = (amb) => (amb === "prod" ? "" : amb.toUpperCase() + "_");

export function ambiente(amb, { exigirBD = true } = {}) {
  if (!amb) { console.error("Falta el ambiente (qa | prod | <otro>)."); process.exit(2); }
  const env = cargarEnv();
  const p = prefijo(amb);
  const g = (k) => env[p + k];
  const ref = g("SUPABASE_REF");
  const cfg = {
    amb, ref, env,
    url: g("SUPABASE_URL") || (ref ? `https://${ref}.supabase.co` : undefined),
    anon: g("SUPABASE_ANON_KEY"),
    service: g("SUPABASE_SERVICE_ROLE_KEY"),
    site: g("SITE_URL"),
    netlifySiteId: g("NETLIFY_SITE_ID"),
    pg: {
      host: g("SUPABASE_DB_HOST") || (ref ? `db.${ref}.supabase.co` : undefined),
      user: g("SUPABASE_DB_USER") || "postgres",
      password: g("SUPABASE_DB_PASSWORD"),
      port: 5432, database: "postgres", ssl: { rejectUnauthorized: false },
    },
  };
  if (exigirBD && (!cfg.pg.host || !cfg.pg.password)) {
    console.error(`Faltan ${p}SUPABASE_REF (o ${p}SUPABASE_DB_HOST) y/o ${p}SUPABASE_DB_PASSWORD en .env.local para el ambiente "${amb}".`);
    process.exit(2);
  }
  return cfg;
}

export async function conectar(cfg, { soloLectura = false } = {}) {
  const c = new pg.Client(cfg.pg);
  await c.connect();
  if (soloLectura) await c.query("set default_transaction_read_only = on");
  return c;
}

// Producción solo se escribe con la bandera explícita (y el settings.json además pide confirmación).
export function exigirConfirmacionProd(amb, escribe = true) {
  if (amb === "prod" && escribe && !process.argv.includes("--confirmo-produccion")) {
    console.error("Escritura en PRODUCCIÓN bloqueada. Requiere autorización explícita del usuario y la bandera --confirmo-produccion.");
    process.exit(3);
  }
}

// Actualiza o agrega CLAVE=valor en .env.local sin tocar el resto del archivo.
export function guardarEnv(clave, valor) {
  const f = path.join(ROOT, ".env.local");
  let txt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  const re = new RegExp(`^${clave}=.*$`, "m");
  txt = re.test(txt) ? txt.replace(re, `${clave}=${valor}`) : txt + (txt && !txt.endsWith("\n") ? "\n" : "") + `${clave}=${valor}\n`;
  fs.writeFileSync(f, txt);
}

export const arg = (nombre) => process.argv.includes(nombre);
export const posicionales = () => process.argv.slice(2).filter((a) => !a.startsWith("--"));
export const hoy = () => new Date().toISOString().slice(0, 10);
