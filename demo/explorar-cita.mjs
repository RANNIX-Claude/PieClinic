import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('r@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
for (const sede of ['Pie Clinic Centenario', 'Centenario', 'Galerías']) {
  await p.locator('header select').selectOption({ label: sede }); await p.waitForTimeout(1500)
  await p.goto('http://localhost:5174/app/agenda/nueva'); await p.waitForTimeout(5000)
  await p.getByLabel('Servicio', { exact: true }).selectOption({ label: 'Quiropodia · 30 min' })
  const pod = p.getByLabel('Podólogo', { exact: true })
  const ops = await pod.locator('option').allInnerTexts()
  for (const [i, t] of ops.entries()) {
    if (!i) continue
    await pod.selectOption({ index: i })
    for (const f of ['2026-11-30', '2026-12-02']) {
      await p.getByLabel('Fecha', { exact: true }).fill(f); await p.waitForTimeout(2200)
      const n = await p.locator('h3', { hasText: 'Disponibilidad' }).locator('xpath=following-sibling::div[1]//button').count()
      console.log(sede, '|', t, f, n)
    }
  }
}
await b.close()
