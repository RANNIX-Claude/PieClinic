// Recalcula las instantáneas del data warehouse (tablas dw_kpi_*) de la clínica de pruebas, entrando como administrador de prueba (m@g.com).
//
//   node scripts/refrescar-dw.mjs qa
//
// Es lo mismo que el botón «Actualizar datos» del tablero ejecutivo: llama a la RPC piefirme.dw_refrescar() con un token de administrador.
// Solo ambiente de pruebas (usa las cuentas de scripts/qa-usuarios-prueba.mjs). Correrlo después de cargar semillas o historial.
import { ambiente, posicionales } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb || amb === "prod") { console.error("uso: node scripts/refrescar-dw.mjs qa"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
const ESQ = cfg.env[`${amb.toUpperCase()}_DB_SCHEMA`] || "piefirme";
const login = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: "m@g.com", password: "123456" }),
}).then((r) => r.json());
if (!login.access_token) { console.error("No se pudo entrar como m@g.com (¿corriste qa-usuarios-prueba.mjs?)"); process.exit(1); }
const t0 = Date.now();
const r = await fetch(`${cfg.url}/rest/v1/rpc/dw_refrescar`, {
  method: "POST", headers: { apikey: cfg.anon, Authorization: `Bearer ${login.access_token}`, "Content-Type": "application/json", "Content-Profile": ESQ }, body: "{}",
});
const j = await r.json().catch(() => null);
console.log(r.ok ? `✓ Warehouse actualizado en ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(j)}` : `✗ ${r.status} ${JSON.stringify(j)}`);
process.exit(r.ok ? 0 : 1);
