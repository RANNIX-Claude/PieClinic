// Alta (idempotente) de los usuarios de PRUEBA por rol: correo de una letra @g.com, contraseña 123456.
//
//   node scripts/qa-usuarios-prueba.mjs qa            → crea/actualiza las cuentas y sus perfiles
//   node scripts/qa-usuarios-prueba.mjs qa --quitar   → desactiva las cuentas de prueba (antes de producción)
//
// ⚠ SOLO AMBIENTE DE PRUEBAS. Estas claves son públicas (están en docs/ACCESOS.md y en la pantalla de acceso de QA):
//   cámbialas o ejecuta --quitar antes de producción. El script se niega a correr contra "prod".
// Usa la API de administración de GoTrue con la service_role (jamás se imprime) y escribe en el esquema piefirme vía PostgREST.
import { ambiente, arg, posicionales } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb || amb === "prod") { console.error("uso: node scripts/qa-usuarios-prueba.mjs qa [--quitar]  (nunca producción)"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
if (!cfg.url || !cfg.service) { console.error("Faltan QA_SUPABASE_URL / QA_SUPABASE_SERVICE_ROLE_KEY en .env.local"); process.exit(2); }

const ORG = "00000000-0000-0000-0000-00000000c0de";
const SEDE_CHALCO = "5e000000-0000-0000-0000-000000000001";
const CLAVE = "123456";
const ESQUEMA = cfg.env[`${amb.toUpperCase()}_DB_SCHEMA`] || "piefirme";

// letra → rol. Superadministrador = perfil administrador + fila en rannix_staff (panel RANNIX y vista total).
export const USUARIOS = [
  { email: "a@g.com", nombre: "Superadmin", apellidos: "Prueba", rol: "administrador", superadmin: true, sedes: [] },
  { email: "m@g.com", nombre: "Administrador", apellidos: "Prueba", rol: "administrador", sedes: [] },
  { email: "p@g.com", nombre: "Podólogo", apellidos: "Prueba", rol: "podologo", cedula: "CED-PRUEBA-0001", sedes: [SEDE_CHALCO] },
  { email: "r@g.com", nombre: "Recepción", apellidos: "Prueba", rol: "recepcion", sedes: [] },
];

const h = { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "application/json" };
async function http(metodo, ruta, cuerpo, extra = {}) {
  const r = await fetch(cfg.url + ruta, { method: metodo, headers: { ...h, ...extra }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const txt = await r.text();
  let j; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
  return { ok: r.ok, status: r.status, data: j };
}

async function buscarUsuario(email) {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await http("GET", `/auth/v1/admin/users?page=${pagina}&per_page=200`);
    const lista = r.data?.users ?? [];
    const u = lista.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (lista.length < 200) return null;
  }
  return null;
}

async function asegurarUsuario(u) {
  const cuerpo = { email: u.email, password: CLAVE, email_confirm: true, user_metadata: { prueba: true, rol_prueba: u.rol } };
  let r = await http("POST", "/auth/v1/admin/users", cuerpo);
  if (r.ok) return r.data.id;
  const existente = await buscarUsuario(u.email);
  if (!existente) throw new Error(`No se pudo crear ${u.email}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  r = await http("PUT", `/auth/v1/admin/users/${existente.id}`, { password: CLAVE, email_confirm: true, user_metadata: { prueba: true, rol_prueba: u.rol } });
  if (!r.ok) throw new Error(`No se pudo actualizar ${u.email}: ${r.status}`);
  return existente.id;
}

const rest = (metodo, ruta, cuerpo, prefer) =>
  http(metodo, `/rest/v1/${ruta}`, cuerpo, { "Content-Profile": ESQUEMA, "Accept-Profile": ESQUEMA, ...(prefer ? { Prefer: prefer } : {}) });

if (arg("--quitar")) {
  for (const u of USUARIOS) {
    const x = await buscarUsuario(u.email);
    if (!x) { console.log(`· ${u.email}: no existe`); continue; }
    await rest("DELETE", `rannix_staff?user_id=eq.${x.id}`);
    await rest("PATCH", `perfiles?id=eq.${x.id}`, { activo: false });
    await http("PUT", `/auth/v1/admin/users/${x.id}`, { ban_duration: "876000h" });
    console.log(`✓ ${u.email}: desactivado`);
  }
  process.exit(0);
}

for (const u of USUARIOS) {
  const id = await asegurarUsuario(u);
  // Desbloquea la cuenta si una corrida previa de --quitar la bloqueó.
  await http("PUT", `/auth/v1/admin/users/${id}`, { ban_duration: "none" });
  const p = await rest("POST", "perfiles?on_conflict=id", [{
    id, organizacion_id: ORG, rol: u.rol, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
    cedula: u.cedula ?? null, sedes: u.sedes, activo: true,
  }], "resolution=merge-duplicates,return=minimal");
  if (!p.ok) throw new Error(`perfil ${u.email}: ${p.status} ${JSON.stringify(p.data).slice(0, 300)}`);
  if (u.superadmin) {
    const s = await rest("POST", "rannix_staff?on_conflict=user_id", [{ user_id: id, nombre: `${u.nombre} ${u.apellidos}` }], "resolution=merge-duplicates,return=minimal");
    if (!s.ok) throw new Error(`rannix_staff ${u.email}: ${s.status} ${JSON.stringify(s.data).slice(0, 300)}`);
  }
  console.log(`✓ ${u.email.padEnd(10)} ${u.superadmin ? "superadministrador" : u.rol.padEnd(13)} id ${id}`);
}
console.log(`\nClave de todas: ${CLAVE}  (SOLO PRUEBAS: cambiar o ejecutar --quitar antes de producción)`);
