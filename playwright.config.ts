// Configuración de la DEMO en video (demo/recorrido.spec.ts). No es la suite de QA: solo graba el recorrido para los dueños.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './demo',
  testMatch: /recorrido\.spec\.ts/,
  timeout: 12 * 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: process.env.TEMP + '/pw-piefirme-resultados',
  use: {
    baseURL: 'http://localhost:5173',
    headless: false,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    channel: 'chrome',
    viewport: { width: 1920, height: 1080 },
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    launchOptions: { slowMo: 600 },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
  webServer: {
    // VITE_ENTORNO=prod oculta el panel «Accesos de prueba» del login (no sale en el video). Las llaves de QA vienen de .env.local.
    command: 'npm run dev',
    url: 'http://localhost:5173/app/',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_ENTORNO: 'prod', VITE_CACHE_DIR: process.env.TEMP + '/vite-cache-piefirme' },
  },
})
