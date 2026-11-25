// Utilerías propias del lote A de videos (firma con cualquier cuenta, trazo de firma en pantalla, ticket en vista previa).
import { expect, type Page, type BrowserContext } from '@playwright/test'
import { CLAVE, escribir } from './video'

type Hablar = (page: Page, texto: string, extraMs?: number) => Promise<void>

/** Firma con la cuenta indicada. Si hay selector de sucursal, elige la que se pide. */
export async function entrar(page: Page, narrar: Hablar, email: string, sede: string | null, intro: string, quien: string) {
  await page.goto('/app/login', { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  if (intro) await narrar(page, intro)
  await narrar(page, quien, 0)
  await escribir(page.locator('#pf-email'), email)
  await escribir(page.locator('#pf-pass'), CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  const sel = page.locator('header select')
  if (sede && (await sel.count())) {
    await sel.selectOption({ label: sede })
    await page.waitForTimeout(1500)
  }
}

/** Dibuja un garabato de firma con el ratón sobre el canvas del diálogo de firma. */
export async function trazarFirma(page: Page, canvas?: ReturnType<Page['locator']>) {
  const c = canvas ?? page.getByRole('dialog').last().locator('canvas').first()
  await c.scrollIntoViewIfNeeded()
  const b = (await c.boundingBox())!
  const x = (f: number) => b.x + b.width * f, y = (f: number) => b.y + b.height * f
  await page.mouse.move(x(0.15), y(0.6)); await page.mouse.down()
  for (const [fx, fy] of [[0.25, 0.3], [0.35, 0.7], [0.45, 0.3], [0.55, 0.7], [0.7, 0.4], [0.85, 0.55]]) await page.mouse.move(x(fx), y(fy), { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(800)
}

/** Muestra el ticket impreso (ventana emergente) como vista previa sobre la pantalla. Devuelve false si no se abrió. */
export async function verTicket(page: Page, pop: Page | null, titulo = 'Ticket enviado a la impresora (vista previa, 80 mm)') {
  if (!pop) return false
  await pop.waitForLoadState('domcontentloaded').catch(() => {})
  await pop.waitForTimeout(600)
  const html = await pop.content()
  await pop.close().catch(() => {})
  await page.evaluate(([h, t]) => {
    const d = document.createElement('div')
    d.id = 'vista-ticket'
    d.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px'
    d.innerHTML = `<div style="color:#fff;font:600 15px sans-serif">${t}</div>`
    const f = document.createElement('iframe')
    f.style.cssText = 'width:340px;height:600px;background:#fff;border:0;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.5)'
    f.srcdoc = h
    d.appendChild(f); document.body.appendChild(d)
  }, [html, titulo])
  return true
}
export const quitarTicket = (page: Page) => page.evaluate(() => document.getElementById('vista-ticket')?.remove())
export type { BrowserContext }
