import { chromium } from '@playwright/test'
const T = process.env.TEMP
const b = await chromium.launch({ channel: 'chrome', headless: true })
async function sesion(viewport, archivo, tabs) {
  const p = await (await b.newContext({ viewport })).newPage()
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)))
  await p.goto('http://localhost:5174/app/login', { timeout: 200000, waitUntil: 'domcontentloaded' })
  await p.locator('#pf-email').waitFor({ timeout: 200000 })
  await p.locator('#pf-email').fill('m@g.com'); await p.locator('#pf-pass').fill('123456')
  await p.getByRole('button', { name: 'Iniciar sesión' }).click()
  await p.locator('header').waitFor({ timeout: 120000 }); await p.waitForTimeout(2500)
  await p.goto('http://localhost:5174/app/inventario/analisis', { waitUntil: 'domcontentloaded' })
  await p.getByText('Piezas totales').waitFor({ timeout: 120000 }); await p.waitForTimeout(6000)
  console.log(archivo, 'KPI', (await p.locator('.grid-kpis').innerText()).replace(/\n+/g, ' | ').slice(0, 700))
  await p.screenshot({ path: `${T}/${archivo}.png`, fullPage: true })
  for (const [id, nombre] of tabs) {
    await p.getByRole('tab', { name: nombre }).click(); await p.waitForTimeout(1500)
    console.log(archivo, id, (await p.locator('.pagina').innerText()).replace(/\n+/g, ' | ').slice(900, 1500))
    await p.screenshot({ path: `${T}/${archivo}_${id}.png`, fullPage: true })
  }
  await p.close()
}
await sesion({ width: 1366, height: 900 }, 'analisis_escritorio', [['sucursal', 'Por sucursal'], ['matriz', 'Producto × sucursal'], ['bajo', 'Bajo mínimo']])
await sesion({ width: 390, height: 844 }, 'analisis_movil', [['matriz', 'Producto × sucursal']])
await b.close()
