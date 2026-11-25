import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
p.setDefaultTimeout(120000)
p.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0, 300)) })
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)))
await p.goto('http://localhost:5174/app/login', { waitUntil: 'domcontentloaded', timeout: 150000 })
await p.locator('#pf-email').fill('m@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor(); await p.waitForTimeout(2500)
await p.goto('http://localhost:5174/app/importar'); await p.getByRole('heading', { name: /Importar datos/ }).waitFor()
await p.locator('input[type=file]').setInputFiles('demo/datos/importar-pacientes-E.csv')
for (const ms of [1000, 4000, 10000]) { await p.waitForTimeout(ms); console.log(ms, (await p.locator('main').innerText()).match(/[^\n]*filas[^\n]*/)?.[0], '| toasts:', (await p.locator('[role=status]').allInnerTexts()).join(' / ').slice(0, 200)) }
await b.close()
