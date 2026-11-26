// Prepara las cuentas de QA para las pruebas e2e de la PWA de Auditoría: define el PIN (4827) de r@g.com y p@g.com y muestra su sucursal y puntos de control.
// Solo QA (usa la llave anon y las cuentas de prueba). Idempotente.   node scripts/qa-pwa-preparar.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
export const PIN = "4827";
for (const correo of ["r@g.com", "p@g.com"]) {
  const c = createClient(env.QA_SUPABASE_URL || env.VITE_SUPABASE_URL, env.QA_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, { db: { schema: "piefirme" }, auth: { persistSession: false }, realtime: { transport: class {} } });
  const { data: lg, error: e1 } = await c.auth.signInWithPassword({ email: correo, password: "123456" });
  if (e1) { console.log(correo, "login:", e1.message); continue; }
  const { error: e2 } = await c.rpc("definir_pin_personal", { p_pin: PIN });
  const { data: p } = await c.from("perfiles").select("rol,sedes,organizacion_id").eq("id", lg.user.id).maybeSingle();
  const { data: ss } = await c.from("sedes").select("id,nombre").eq("organizacion_id", p.organizacion_id);
  console.log(correo, "PIN:", e2 ? e2.message : "ok", "| rol", p.rol, "| sedes del perfil", JSON.stringify(p.sedes), "| sedes", ss.map((s) => s.nombre).join(", "));
  const suc = (p.sedes?.length ? p.sedes : ss.map((s) => s.id))[0];
  for (const t of ["apertura", "turno", "dia", "semanal"]) {
    const { data, error } = await c.rpc("ctl_cierre_plantilla", { p_sucursal: suc, p_tipo: t });
    console.log("  plantilla", t, error ? error.message : `${data.puntos.length} puntos, ${data.tomas.length} tomas, lado ${data.lado_largo}`, error ? "" : data.puntos.map((x) => x.tipo_captura + (x.obligatorio ? "*" : "")).join(","));
  }
}
