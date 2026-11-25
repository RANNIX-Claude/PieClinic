import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
const T = process.env.TEMP
await p.goto('http://localhost:5184/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('m@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
await p.locator('header select').selectOption({ label: 'Pie Clinic Centenario' }); await p.waitForTimeout(1500)
await p.getByRole('link', { name: /^Ingresos$/ }).first().click(); await p.waitForTimeout(6000)
console.log((await p.locator('.pagina').first().innerText()).slice(0, 3500))
await p.screenshot({ path: T + '/d3_a.png' })
await b.close()
