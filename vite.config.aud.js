// PWA móvil de captura de Control y Auditoría (Etapa 5). Segunda entrada de Vite, INDEPENDIENTE de /app/:
// base /aud/, raíz auditoria-movil/, su propio index.html, manifiesto, íconos y service worker (alcance /aud/), salida dist/aud.
// Reutiliza src/lib/** pero no el shell de escritorio. Compilar: `npm run build:aud` (el `build` general ya la incluye). Vista previa: `npm run preview:aud` (puerto 5175).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.dirname(fileURLToPath(import.meta.url))
const d = new Date()
const p2 = n => String(n).padStart(2, '0')
const APP_VERSION = `A_${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`

export default defineConfig({
  root: path.join(raiz, 'auditoria-movil'),
  base: '/aud/',
  publicDir: path.join(raiz, 'auditoria-movil', 'public'),
  envDir: raiz,   // lee .env.local de la raíz (llaves de QA)
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION), 'import.meta.env.VITE_AUTH_STORAGE_KEY': JSON.stringify('pf-aud-auth') },
  plugins: [react()],
  cacheDir: process.env.VITE_CACHE_DIR || path.join(raiz, 'node_modules/.vite-aud'),
  build: { outDir: path.join(raiz, 'dist/aud'), emptyOutDir: true, chunkSizeWarningLimit: 1000 },
  server: { port: 5176, fs: { allow: [raiz] } },
  preview: { port: 5175 },
})
