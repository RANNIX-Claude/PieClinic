// Copia portal/ a dist/ (la raíz del sitio). Corre después de `vite build`, que deja la app en dist/app.
//   package.json →  "build": "vite build && node scripts/build-portal.mjs"
import fs from "fs";
import path from "path";
import { ROOT } from "./lib/env.mjs";

const origen = path.join(ROOT, "portal");
const destino = path.join(ROOT, "dist");
if (!fs.existsSync(origen)) { console.error("No existe portal/ — todo producto lleva portal."); process.exit(1); }

const html = fs.readFileSync(path.join(origen, "index.html"), "utf8");
const huecos = [...new Set(html.match(/\{\{[^}]+\}\}/g) ?? [])];
if (huecos.length && process.argv.includes("--estricto")) {
  console.error(`El portal aún tiene ${huecos.length} placeholders sin llenar:\n  ` + huecos.slice(0, 12).join("\n  "));
  process.exit(1);
}
if (huecos.length) console.warn(`⚠ portal con ${huecos.length} placeholders sin llenar (usa --estricto para bloquear el build).`);

fs.mkdirSync(destino, { recursive: true });
fs.cpSync(origen, destino, { recursive: true });
console.log("Portal copiado a dist/ (app esperada en dist/app).");
