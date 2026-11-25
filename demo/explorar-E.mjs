// Explorador del lote E: node demo/explorar-E.mjs <email> <sede|-> <ruta>#<clic>|<clic> [...] (cada arg = ruta y clics)
import { chromium } from '@playwright/test'
const [email, sede, ...pasos] = process.argv.slice(2)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill(email); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
if (sede !== '-') { await p.locator('header select').selectOption({ label: sede }); await p.waitForTimeout(1500) }
console.log('SEDES:', (await p.locator('header select option').allInnerTexts()).join(' | '))
for (const paso of pasos) {
  const [ruta, ...clics] = paso.split('#')
  await p.goto('http://localhost:5174/app' + ruta); await p.waitForTimeout(4000)
  for (const c of clics) { await (await p.getByRole('tab', { name: c, exact: true }).count() ? p.getByRole('tab', { name: c, exact: true }) : p.getByText(c, { exact: false })).first().click().catch(e => console.log('NOCLIC', c)); await p.waitForTimeout(2500) }
  console.log('\n=========', paso)
  console.log((await p.locator('main, .pagina').first().innerText().catch(() => '')).slice(0, 2500))
  console.log('BOTONES:', (await p.locator('button:visible').allInnerTexts()).join(' | '))
  console.log('CAMPOS:', await p.locator('input:visible,select:visible,textarea:visible').evaluateAll(es => es.map(e => (e.getAttribute('aria-label') || e.placeholder || e.name || e.id || e.type) + ':' + e.tagName)).then(a => a.join(' | ')))
}
await b.close()
