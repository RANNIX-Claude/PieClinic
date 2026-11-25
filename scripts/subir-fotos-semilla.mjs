// Sube imágenes SINTÉTICAS de relleno a Storage para las fotos clínicas sembradas que solo existen como fila (sin archivo).
// Sin esto el comparador de fotos muestra imágenes rotas. Solo para QA/demo (organizaciones de prueba). Idempotente: no pisa archivos ya subidos.
// Uso: node scripts/subir-fotos-semilla.mjs qa [--paciente <uuid>]       (requiere ffmpeg en PATH y QA_SUPABASE_SERVICE_ROLE_KEY en .env.local)
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { ambiente, conectar } from "./lib/env.mjs";

const amb = process.argv[2];
if (amb !== "qa") { console.error("Solo QA: node scripts/subir-fotos-semilla.mjs qa [--paciente <uuid>]"); process.exit(2); }
const iPac = process.argv.indexOf("--paciente");
const soloPaciente = iPac > 0 ? process.argv[iPac + 1] : null;
const cfg = ambiente(amb);
if (!cfg.service) { console.error("Falta QA_SUPABASE_SERVICE_ROLE_KEY en .env.local"); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fotos-semilla-"));
const fuente = "C\\:/Windows/Fonts/arial.ttf";
function imagen(momento) {
  const f = path.join(tmp, `${momento}.jpg`);
  const antes = momento === "antes";
  const filtros = [
    `drawbox=x=300:y=250:w=${antes ? 220 : 90}:h=${antes ? 170 : 70}:color=${antes ? "0x9B2226" : "0xC97B6B"}:t=fill`,
    `drawtext=fontfile='${fuente}':text='FOTO SINTETICA - ${antes ? "ANTES" : "DESPUES"}':x=40:y=40:fontsize=36:fontcolor=0x4A3A32`,
  ].join(",");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xE8B79B:s=800x600", "-vf", filtros, "-frames:v", "1", f]);
  return fs.readFileSync(f);
}
const imgs = { antes: imagen("antes"), despues: imagen("despues") };

const c = await conectar(cfg, { soloLectura: true });
const { rows } = await c.query(
  `select f.archivo_path, f.momento from piefirme.fotos_clinicas f
    where not exists (select 1 from storage.objects o where o.bucket_id = 'pf-fotos-clinicas' and o.name = f.archivo_path)
      and ($1::uuid is null or f.paciente_id = $1::uuid)`, [soloPaciente]);
await c.end();
let ok = 0, fallos = 0;
for (const r of rows) {
  const res = await fetch(`${cfg.url}/storage/v1/object/pf-fotos-clinicas/${r.archivo_path}`, {
    method: "POST", headers: { Authorization: `Bearer ${cfg.service}`, apikey: cfg.service, "Content-Type": "image/jpeg", "x-upsert": "false" }, body: imgs[r.momento] ?? imgs.antes,
  });
  if (res.ok) ok++; else { fallos++; console.error(r.archivo_path, res.status, (await res.text()).slice(0, 120)); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${rows.length} fotos sin archivo · ${ok} subidas · ${fallos} fallos`);
