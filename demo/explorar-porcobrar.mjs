import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('r@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
for (const sede of ['Pie Clinic Centenario', 'Centenario']) {
  await p.locator('header select').selectOption({ label: sede }); await p.waitForTimeout(1500)
  await p.goto('http://localhost:5174/app/caja'); await p.waitForTimeout(7000)
  console.log(sede, 'turno:', (await p.locator('.cj-barra').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 120), '| abrir:', await p.getByRole('button', { name: 'Abrir turno' }).isVisible().catch(() => false))
  await p.keyboard.press('F4'); await p.waitForTimeout(2000)
  console.log(' por cobrar:', (await p.locator('.cj-fila-btn').allInnerTexts()).map(t => t.replace(/\n/g, ' | ')).slice(0, 6))
}
await b.close()
