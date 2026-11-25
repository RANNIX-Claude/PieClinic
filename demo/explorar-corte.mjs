import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('r@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
await p.locator('header select').selectOption({ label: 'Pie Clinic Centenario' }); await p.waitForTimeout(1500)
await p.goto('http://localhost:5174/app/caja?tab=corte'); await p.waitForTimeout(8000)
await p.getByLabel(/Efectivo contado/).fill('8800'); await p.waitForTimeout(800)
await p.getByLabel(/Justificación/).fill('Faltante de cambio'); 
p.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 300)))
await p.getByRole('button', { name: 'Cerrar turno' }).click()
for (let i = 0; i < 8; i++) { await p.waitForTimeout(700); console.log('toast:', await p.locator('[role=status]').allInnerTexts()) }
console.log(await p.locator('main').innerText().then(t => t.slice(0, 300)))
await b.close()
