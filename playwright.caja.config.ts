// Configuración del video de CAJA (demo/caja.spec.ts). No es la suite de QA: graba un recorrido para presentarlo.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './demo',
  testMatch: /demo[\/](caja|inv|cita|consulta|vid)-[a-z0-9-]+.spec.ts$/,
  timeout: 10 * 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: process.env.TEMP + '/pw-res-' + (process.env.PW_LOTE ?? 'base'),
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    headless: true,
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    channel: 'chrome',
    viewport: { width: 1366, height: 768 },        // laptop de 11–14"
    video: { mode: 'on', size: { width: 1366, height: 768 } },
    launchOptions: { slowMo: 250 },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
})
