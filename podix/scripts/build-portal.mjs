// Copia portal/ a dist/ (raíz del sitio). Corre después de `vite build`, que deja la app en dist/app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origen = path.join(RAIZ, "portal"), destino = path.join(RAIZ, "dist");
if (!fs.existsSync(origen)) { console.error("No existe portal/ — todo producto lleva portal."); process.exit(1); }
fs.mkdirSync(destino, { recursive: true });
fs.cpSync(origen, destino, { recursive: true });
console.log("Portal copiado a dist/ (app en dist/app).");
