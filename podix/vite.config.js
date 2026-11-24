import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Una puerta (HTML) por rol: en iPhone el nombre y el ícono del acceso directo salen del <head>,
// no del manifiesto. Todas comparten el mismo bundle (src/main.jsx).
const ROLES = ["recepcion", "podologo", "asistente", "cajero", "almacen", "gerente", "admin"];
const input = { main: resolve(__dirname, "index.html") };
for (const r of ROLES) input[r] = resolve(__dirname, `${r}.html`);

export default defineConfig({
  base: "/app/",
  // En carpetas de OneDrive la caché de dependencias falla con EPERM: VITE_CACHE_DIR la manda a otra carpeta (solo desarrollo).
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
  plugins: [react()],
  build: { outDir: "dist/app", emptyOutDir: true, rollupOptions: { input } },
});
