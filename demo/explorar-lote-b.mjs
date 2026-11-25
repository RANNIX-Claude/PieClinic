import { chromium } from '@playwright/test'
const [,, email, sede, ruta, ...resto] = process.argv
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill(email); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
await p.locator('header select').selectOption({ label: sede }); await p.waitForTimeout(1500)
await p.goto('http://localhost:5174/app/' + ruta); await p.waitForTimeout(7000)
console.log((await p.locator('body').innerText()).slice(0, 3500))
await p.screenshot({ path: process.env.TEMP + '/lb.png' })
await b.close()
