// Verifica en la BASE (no en la interfaz) qué ve y qué puede hacer cada cuenta de prueba: entra con correo/clave por la API de auth y
// consulta/escribe con su propio token, así que aplica el RLS real. Sale con código 1 si algo no coincide con lo esperado.
//
//   node scripts/verificar-roles.mjs qa
//
// Solo ambiente de pruebas (usa las cuentas de scripts/qa-usuarios-prueba.mjs). Las escrituras de prueba se deshacen (insertan algo que debe
// ser rechazado; si por error se aceptara, lo borra y reporta el fallo).
import { ambiente, posicionales } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb || amb === "prod") { console.error("uso: node scripts/verificar-roles.mjs qa"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
const ESQ = cfg.env[`${amb.toUpperCase()}_DB_SCHEMA`] || "piefirme";
const ORG = "00000000-0000-0000-0000-00000000c0de";

async function entrar(correo) {
  const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: correo, password: "123456" }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${correo}: ${j.error_description ?? j.msg ?? r.status}`);
  return j;
}
const api = (token) => async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${cfg.url}/rest/v1/${ruta}`, {
    method: metodo, headers: { apikey: cfg.anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Accept-Profile": ESQ, "Content-Profile": ESQ, Prefer: "return=representation" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text(); let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data, total: Number((r.headers.get("content-range") ?? "").split("/")[1]) };
};

const CASOS = [
  { correo: "a@g.com", rol: "Superadministrador", soyRannix: true,  ve: { pacientes: ">0", dw_fact_citas: ">0", dw_kpi_resumen: ">0", bitacora: ">0", log_errores: ">=0" }, noPuede: [] },
  { correo: "m@g.com", rol: "Administrador",      soyRannix: false, ve: { pacientes: ">0", dw_fact_citas: ">0", dw_kpi_resumen: ">0", bitacora: ">0", log_errores: ">=0" }, noPuede: ["rannix_staff"] },
  { correo: "p@g.com", rol: "Podólogo",           soyRannix: false, ve: { pacientes: ">0", citas: ">0", dw_fact_citas: "=0", bitacora: "=0", gastos: "=0", ingresos: "=0" }, noPuede: ["gastos", "rannix_staff", "usuarios"] },
  // Recepción opera caja y fondo revolvente por diseño (matriz de permisos 4.2/4.4): ve los gastos del fondo, pero no ingresos, bitácora ni warehouse.
  { correo: "r@g.com", rol: "Recepción",          soyRannix: false, ve: { pacientes: ">0", citas: ">0", dw_fact_citas: "=0", bitacora: "=0", gastos: ">0", ingresos: "=0" }, noPuede: ["rannix_staff", "usuarios"] },
];
const cumple = (n, regla) => (regla === ">0" ? n > 0 : regla === ">=0" ? n >= 0 : n === Number(regla.slice(1)));

let fallos = 0;
const marca = (ok, txt) => { if (!ok) fallos++; console.log(`  ${ok ? "✓" : "✗"} ${txt}`); };
for (const c of CASOS) {
  console.log(`\n${c.correo} · ${c.rol}`);
  const s = await entrar(c.correo);
  const q = api(s.access_token);
  const rannix = await fetch(`${cfg.url}/rest/v1/rpc/soy_rannix`, { method: "POST", headers: { apikey: cfg.anon, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json", "Content-Profile": ESQ }, body: "{}" }).then((r) => r.json());
  marca(rannix === c.soyRannix, `soy_rannix() = ${rannix} (esperado ${c.soyRannix})`);
  const perfil = await q("GET", `perfiles?id=eq.${s.user.id}&select=rol,activo`);
  marca(perfil.data?.[0]?.activo === true, `perfil activo con rol ${perfil.data?.[0]?.rol}`);
  for (const [tabla, regla] of Object.entries(c.ve)) {
    // Sin count exacto (evalúa el RLS de toda la tabla y puede agotar el tiempo): basta con saber si devuelve al menos una fila.
    const r = await q("GET", `${tabla}?select=*&limit=1`);
    const n = r.ok && Array.isArray(r.data) ? r.data.length : 0;
    // «Sin filas» también se cumple si la base rechaza o agota el tiempo (la bitácora de 100 mil filas tarda en descartarlas para un no-administrador): lo que importa es que no entregue datos.
    const sinAcceso = regla === "=0" && !r.ok;
    marca(sinAcceso || (r.ok && cumple(n, regla)), `ve ${tabla}: ${r.ok ? (n ? "con filas" : "sin filas") : "HTTP " + r.status} (esperado ${regla === ">0" ? "con filas" : regla === "=0" ? "sin filas" : "cualquiera"})`);
  }
  for (const t of c.noPuede) {
    let r;
    if (t === "gastos") r = await q("POST", "gastos", { organizacion_id: ORG, fecha: "2026-10-01", total: 1, subtotal: 1, iva: 0, descripcion: "PRUEBA DE PERMISOS", estado: "guardado" });
    else if (t === "rannix_staff") r = await q("POST", "rannix_staff", { user_id: s.user.id, nombre: "intruso" });
    else if (t === "usuarios") r = await q("PATCH", `perfiles?id=eq.${s.user.id}`, { rol: "administrador" });
    const aceptado = r.ok && (Array.isArray(r.data) ? r.data.length > 0 : !!r.data);
    if (aceptado && t === "gastos") await q("DELETE", `gastos?id=eq.${r.data[0].id}`);
    if (aceptado && t === "usuarios") await q("PATCH", `perfiles?id=eq.${s.user.id}`, { rol: c.rol === "Podólogo" ? "podologo" : "recepcion" });
    marca(!aceptado, `NO puede escribir en ${t === "usuarios" ? "su propio rol (escalar privilegios)" : t} (${aceptado ? "ACEPTADO" : r.ok ? "sin efecto: el RLS no deja ninguna fila" : "rechazado " + r.status})`);
  }
}
console.log(fallos ? `\n✗ ${fallos} verificación(es) fallaron` : "\n✓ Todas las verificaciones pasaron");
process.exit(fallos ? 1 : 0);
