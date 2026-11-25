import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } })
const p = await ctx.newPage()
p.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200)))
await p.goto('http://localhost:5175/app/login', { timeout: 150000, waitUntil: 'domcontentloaded' })
await p.locator('#pf-email').waitFor({ timeout: 150000 })
await p.locator('#pf-email').fill('r@g.com'); await p.locator('#pf-pass').fill('123456')
await p.getByRole('button', { name: 'Iniciar sesión' }).click()
await p.locator('header').waitFor({ timeout: 90000 }); await p.waitForTimeout(2500)
await p.locator('header select').selectOption({ label: 'Pie Clinic Centenario' }); await p.waitForTimeout(1500)
await p.getByRole('link', { name: /Caja y tickets/ }).first().click(); await p.waitForTimeout(9000)
const info = await p.evaluate(async () => ({
  controlado: !!navigator.serviceWorker.controller,
  regs: (await navigator.serviceWorker.getRegistrations()).map(r => ({ scope: r.scope, activo: !!r.active })),
  caches: await Promise.all((await caches.keys()).map(async k => ({ k, n: (await (await caches.open(k)).keys()).length }))),
  arranque: !!localStorage.getItem('pf.arranque'),
}))
console.log(JSON.stringify(info))
p.on('requestfailed', r => console.log('FALLO', r.url().slice(0, 140), r.failure()?.errorText)); console.log('en cache:', JSON.stringify(await p.evaluate(async () => (await (await caches.open('pf-shell-v2')).keys()).map(r => r.url.replace(location.origin, '')))).slice(0, 900)); await ctx.setOffline(true)
await p.reload({ waitUntil: 'domcontentloaded' }).catch(e => console.log('reload error', String(e).slice(0, 150)))
await p.waitForTimeout(8000)
console.log('url:', p.url(), '| texto:', (await p.locator('body').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 200))
await p.screenshot({ path: process.env.TEMP + '/sw1.png' })
await b.close()
