import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
const T = process.env.TEMP
await p.goto('http://localhost:5184/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill(process.argv[2] ?? 'm@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
await p.locator('header select').selectOption({ label: 'Pie Clinic Centenario' }); await p.waitForTimeout(1500)
await p.getByRole('link', { name: /Caja y tickets/ }).first().click(); await p.waitForTimeout(5000)
console.log((await p.locator('.pagina').first().innerText()).slice(0, 800))
const ab = p.getByRole('button', { name: 'Abrir turno' })
if (await ab.isVisible()) {
  await p.getByLabel('Caja', { exact: true }).fill('Caja 2'); await p.getByLabel('Fondo inicial').fill('1000')
  await ab.click(); await p.waitForTimeout(4000)
  console.log('--- tras abrir:\n' + (await p.locator('body').innerText()).slice(0, 600))
  await p.screenshot({ path: T + '/d4_a.png' })
}
await b.close()
