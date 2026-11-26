// Pruebas end-to-end de la PWA de Auditoría (Etapa 5) en viewport móvil 390×844 con cámara falsa, contra QA.
//   npm run build:aud && npx playwright test -c playwright.aud.config.mjs      (sirve dist/aud con `vite preview` en el puerto 5175)
// Antes, una vez: node scripts/qa-pwa-preparar.mjs  (define el PIN de r@g.com y p@g.com).
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/pwa-aud',
  testMatch: /.*\.spec\.mjs/,
  timeout: 12 * 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: (process.env.TEMP || '.') + '/pw-pwa-aud',
  use: {
    baseURL: 'http://localhost:5175',
    headless: true, screenshot: 'only-on-failure',
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    permissions: ['camera'],
    locale: 'es-MX', timezoneId: 'America/Mexico_City',
    actionTimeout: 20_000, navigationTimeout: 45_000,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: { command: 'npx vite preview -c vite.config.aud.js --port 5175 --strictPort', url: 'http://localhost:5175/aud/', reuseExistingServer: true, timeout: 120_000 },
})
