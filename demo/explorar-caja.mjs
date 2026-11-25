import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('r@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
await p.locator('header select').selectOption({ label: 'Pie Clinic Centenario' }); await p.waitForTimeout(1500)
await p.goto('http://localhost:5174/app/caja'); await p.waitForTimeout(8000)
const vistos = new Set()
for (const q of ['al', 'ci', 'ra', 'on', 'pi', 'un', 'sp', 'zap', 'sol', 'gel', 'fa', 'pl']) {
  await p.locator('.cj-buscar-in').fill(q); await p.waitForTimeout(900)
  for (const t of await p.locator('.cj-res button').allInnerTexts()) vistos.add(t.replace(/\n/g, ' | '))
}
console.log([...vistos].join('\n'))
await b.close()
