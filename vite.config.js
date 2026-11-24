import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const d = new Date()
const p2 = (n) => String(n).padStart(2, '0')
// Etiqueta de la versión liberada: V_AAMMDD_HHMM (hora de México: netlify.toml fija TZ=America/Mexico_City en la compilación)
const APP_VERSION = `V_${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`

// La app vive en /app/ ; el portal público en la raíz (portal/index.html)
export default defineConfig({
  base: '/app/',
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [react()],
  // En carpetas sincronizadas con OneDrive la caché de dependencias falla con EPERM: VITE_CACHE_DIR la manda a otra carpeta (solo desarrollo).
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  optimizeDeps: { include: ['jszip', 'recharts', 'exceljs'] },
  build: { outDir: 'dist/app', emptyOutDir: true, chunkSizeWarningLimit: 1000 }, // exceljs se carga bajo demanda
  server: { port: 5173 },
})
