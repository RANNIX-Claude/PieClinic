import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
p.on('response', async r => { if (/fotos_clinicas|storage/.test(r.url()) && r.request().method() !== 'GET') console.log(r.request().method(), r.status(), r.url().slice(0, 150), (await r.text()).slice(0, 300)) })
await p.goto('http://localhost:5174/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('p@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(3000)
await p.goto('http://localhost:5174/app/consultas/b4fc747b-8535-4a15-a12c-270115618b4a'); await p.waitForTimeout(6000)
await p.getByText('Adjuntar foto clínica a la zona').click()
await p.locator('input[type=file]').first().setInputFiles('demo/video/foto-prueba.jpg')
for (let i = 0; i < 8; i++) { await p.waitForTimeout(800); console.log('toasts:', await p.locator('[role=status], .go3958317564, div[class*=toast]').allInnerTexts()) }
await b.close()
