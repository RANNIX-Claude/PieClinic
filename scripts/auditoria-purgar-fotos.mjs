// Purga de fotos de evidencia por retención (Control y Auditoría · datos personales de empleados). HOY NO HAY PLANIFICADOR: se corre a mano (o con cron).
//   node scripts/auditoria-purgar-fotos.mjs qa                    # SIMULACRO: solo lista lo que venció, no borra nada
//   node scripts/auditoria-purgar-fotos.mjs qa --ejecutar         # borra los objetos del bucket pf-auditoria y anota la purga
//   node scripts/auditoria-purgar-fotos.mjs qa --org=<uuid> --limite=500 --ejecutar
//   node scripts/auditoria-purgar-fotos.mjs prod --ejecutar --confirmo-produccion
// Cómo decide: lee ctl_config (retencion_fotos_dias por sucursal: 90 por omisión, tope 365) mediante la función ctl_fotos_por_purgar (solo service_role). NO purga la foto adjunta a
// un caso abierto ni la última foto de cada toma fija (es la guía de la siguiente). El borrado de objetos de storage lo hace ESTE script con la service_role (la app no puede);
// después anota cada foto en ctl_evidencia_purga con ctl_fotos_marcar_purgadas. La fila de ctl_evidencia (con su hash, para seguir detectando fotos repetidas) se CONSERVA: la
// evidencia es solo-inserción. Si un objeto no se pudo borrar queda anotado con objeto_borrado = false y se reintenta en la siguiente corrida.
// Variables (.env.local): <AMB>_SUPABASE_URL (o _REF) y <AMB>_SUPABASE_SERVICE_ROLE_KEY. La llave nunca se imprime.
import { ambiente, exigirConfirmacionProd, posicionales, arg } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb) { console.error("uso: node scripts/auditoria-purgar-fotos.mjs qa|prod [--ejecutar] [--org=uuid] [--limite=500] [--confirmo-produccion]"); process.exit(2); }
const ejecutar = arg("--ejecutar");
exigirConfirmacionProd(amb, ejecutar);
const val = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const cfg = ambiente(amb, { exigirBD: false });
if (!cfg.url || !cfg.service) { console.error(`Faltan ${amb === "prod" ? "" : amb.toUpperCase() + "_"}SUPABASE_URL (o REF) y SUPABASE_SERVICE_ROLE_KEY en .env.local`); process.exit(2); }
const BUCKET = "pf-auditoria";
const h = { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "application/json", "Accept-Profile": "piefirme", "Content-Profile": "piefirme" };

async function rpc(nombre, args) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${nombre}`, { method: "POST", headers: h, body: JSON.stringify(args) });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw new Error(`${nombre}: ${d?.message ?? t}`);
  return d;
}

const limite = Number(val("limite") ?? 500);
const { fotos } = await rpc("ctl_fotos_por_purgar", { p_org: val("org") ?? null, p_limite: limite });
console.log(`Fotos vencidas según la retención configurada: ${fotos.length}${fotos.length >= limite ? " (tope por corrida; vuelva a correr)" : ""}.`);
if (fotos.length === 0) process.exit(0);
const porOrg = new Map();
for (const f of fotos) { if (!porOrg.has(f.organizacion_id)) porOrg.set(f.organizacion_id, []); porOrg.get(f.organizacion_id).push(f); }
for (const [o, lista] of porOrg) {
  console.log(`· organización ${o}: ${lista.length} foto(s); la más antigua del ${String(lista.map((x) => x.capturado_en).sort()[0]).slice(0, 10)}`);
  if (!ejecutar) { for (const f of lista.slice(0, 10)) console.log(`   (simulacro) ${f.ruta}  [retención ${f.retencion_dias} días]`); continue; }
  const marcas = [];
  for (let i = 0; i < lista.length; i += 100) {   // el almacenamiento borra por lotes
    const lote = lista.slice(i, i + 100);
    const r = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: lote.map((f) => f.ruta) }) });
    const ok = r.ok;
    if (!ok) console.error(`   lote ${i / 100 + 1}: el almacenamiento respondió ${r.status} (se anota como no borrado y se reintenta)`);
    for (const f of lote) marcas.push({ evidencia_id: f.evidencia_id, objeto_borrado: ok });
  }
  const res = await rpc("ctl_fotos_marcar_purgadas", { p_org: o, p_items: marcas });
  console.log(`   anotadas ${res.anotadas}; borradas ${marcas.filter((m) => m.objeto_borrado).length}.`);
}
if (!ejecutar) console.log("\nSimulacro: no se borró nada. Agregue --ejecutar para purgar.");
