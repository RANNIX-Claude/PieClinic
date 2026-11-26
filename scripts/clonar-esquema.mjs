// Genera las migraciones de OTRO esquema (otra instancia del sistema en la misma base) a partir de migraciones/*.sql.
// Mismo contenido; solo cambian los nombres, para poder convivir con `piefirme` en la misma base compartida:
//   piefirme_app → <esquema>_app      piefirme → <esquema>
//   pf_stg_*     → <prefijo>_stg_*    buckets pf-* → <prefijo>-*   (los buckets y las políticas de storage son globales en la base)
//
//   node scripts/clonar-esquema.mjs pieclinic <carpeta_de_salida> [--prefijo pc]
//
// Ejemplo de la instancia de Pie Clinic: esquema `pieclinic`, buckets `pc-*`. Cada migración nueva de `migraciones/` se vuelve a generar
// con este mismo comando y se aplica a las dos instancias. Los archivos generados no se editan a mano.
import fs from "fs";
import path from "path";
import { ROOT, posicionales } from "./lib/env.mjs";

const [esquema, salida] = posicionales();
const iPref = process.argv.indexOf("--prefijo");
const prefijo = iPref >= 0 ? process.argv[iPref + 1] : "pc";
if (!/^[a-z][a-z0-9_]{2,30}$/.test(esquema || "") || esquema === "piefirme" || !salida) {
  console.error("uso: node scripts/clonar-esquema.mjs <esquema en minúsculas, distinto de piefirme> <carpeta_de_salida> [--prefijo pc]");
  process.exit(2);
}
if (!/^[a-z]{2,6}$/.test(prefijo) || prefijo === "pf") { console.error("el prefijo de buckets debe ser de 2 a 6 letras minúsculas y distinto de «pf»"); process.exit(2); }

const BUCKETS = "(acervo|auditorias|auditoria|catalogo|comprobantes|documentos|equipo|expedientes|fotos-clinicas|importaciones|logos)";
const dirEntrada = path.join(ROOT, "migraciones");
fs.mkdirSync(salida, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(dirEntrada).filter((x) => /^\d+_.*\.sql$/.test(x)).sort()) {
  const original = fs.readFileSync(path.join(dirEntrada, f), "utf8");
  const nuevo = original
    .replace(/piefirme_app/g, `${esquema}_app`)
    .replace(/piefirme/g, esquema)
    .replace(/pf_stg_/g, `${prefijo}_stg_`)
    .replace(new RegExp(`pf-${BUCKETS}`, "g"), `${prefijo}-$1`);
  fs.writeFileSync(path.join(salida, f), `-- GENERADO por scripts/clonar-esquema.mjs desde migraciones/${f} (esquema ${esquema}). No editar a mano.\n${nuevo}`);
  n++;
}
console.log(`${n} migraciones generadas en ${salida} para el esquema «${esquema}» (buckets ${prefijo}-*).`);
