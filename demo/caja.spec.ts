// Video del módulo de CAJA (Pie Clinic): de la firma (inicio de sesión) hasta el ticket impreso. Caso 1: cobro en efectivo.
// Correr: npx playwright test -c playwright.caja.config.ts   ·   Salidas: demo/video/caja-efectivo.webm, demo/video/marcas.json (guion con tiempos para la narración)
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const DEMO = path.resolve(process.cwd(), 'demo')
const SALIDA = path.join(DEMO, 'video')
const EMAIL = 'r@g.com', CLAVE = '123456'            // cuenta de prueba de recepción (docs/ACCESOS.md), solo QA
const SEDE = 'Pie Clinic Centenario'
const marcas: { t: number; texto: string }[] = []
let t0 = 0
const duraciones: Record<string, number> = fs.existsSync(path.join(SALIDA, 'duraciones.json')) ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'duraciones.json'), 'utf8')) : {}

/** Anota lo que se narra en este momento y espera lo que dura la voz (estimado, o medido si ya hay duraciones.json). */
async function narrar(page: Page, texto: string, extraMs = 600) {
  marcas.push({ t: Date.now() - t0, texto })
  const medida = duraciones[String(marcas.length - 1)]
  const ms = medida ? medida * 1000 + 400 : (texto.length / 13) * 1000 + 700
  await page.waitForTimeout(ms + extraMs)
}
const escribir = (loc: ReturnType<Page['locator']>, texto: string) => loc.pressSequentially(texto, { delay: 110 })
const dinero = (s: string) => Number(s.replace(/[^0-9.]/g, ''))
const letras = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

test('Caja: cobro en efectivo, de la firma al ticket', async ({ page, context }) => {
  fs.mkdirSync(SALIDA, { recursive: true })
  // La ventana de impresión del navegador bloquea la grabación: la llamada a imprimir de la ventana del ticket se vuelve inocua (el ticket sí se arma y se abre).
  await context.addInitScript(() => { const abrir = window.open; window.open = (...a) => { const w = abrir.apply(window, a as any); if (w) { try { (w as any).print = () => {} } catch {} } return w } })
  t0 = Date.now()

  // ───────── 1. Firma (inicio de sesión) ─────────
  await page.goto('/app/login', { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  await narrar(page, 'Prueba de caja de Pie Clinic. Caso uno: cobro en efectivo, desde que la recepcionista firma hasta que imprime el ticket.')
  await narrar(page, 'Primero, la recepcionista firma con su cuenta personal.', 0)
  await escribir(page.locator('#pf-email'), EMAIL)
  await escribir(page.locator('#pf-pass'), CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  // ───────── 2. Sucursal y caja ─────────
  await narrar(page, 'Elige la sucursal donde trabaja hoy. Todo lo que cobre quedará con su nombre y esa sucursal.')
  await page.locator('header select').selectOption({ label: SEDE })
  await page.waitForTimeout(1500)
  await page.getByRole('link', { name: /Caja y tickets/ }).first().click()
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  await page.waitForTimeout(6000)
  if (await abrir.isVisible().catch(() => false)) {
    await narrar(page, 'Para cobrar necesita abrir su turno de caja, con el fondo inicial.')
    await page.getByLabel('Fondo inicial').fill('1000')
    await abrir.click()
    await page.waitForTimeout(3500)
  }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await narrar(page, 'Esta es la pantalla de cobro. Arriba se ve la sucursal, la caja y el turno abierto. A la izquierda se elige lo que se vende; a la derecha se arma el ticket y se cobra.')

  // ───────── 3. Producto: 2 cremas ─────────
  await narrar(page, 'Se busca el producto por nombre o con el lector de código de barras. Con la tecla F3 se buscan productos.', 0)
  await page.keyboard.press('F3')
  await escribir(page.locator('.cj-buscar-in'), 'crema hidr')
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Crema hidratante' }).first().click()
  await page.waitForTimeout(1200)
  await narrar(page, 'Se agrega la crema hidratante de talones. El cliente lleva dos, así que se sube la cantidad con el botón más.', 0)
  await page.locator('.cj-cant button[aria-label="Más"]').first().click()
  await expect(page.locator('.cj-cant input').first()).toHaveValue('2')
  await page.waitForTimeout(1200)

  // ───────── 4. Servicio: quiropodia ─────────
  await narrar(page, 'Ahora el servicio. Con F2 se buscan servicios. Se agrega una quiropodia.', 0)
  await page.keyboard.press('F2')
  await escribir(page.locator('.cj-buscar-in'), 'quirop')
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Quiropodia' }).first().click()
  await page.waitForTimeout(1500)
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  const iva = dinero(await page.locator('.cj-iva span').last().innerText())
  await narrar(page, `El ticket muestra los conceptos, cantidades e importes. El total a cobrar es ${letras(total)} pesos, con ${letras(iva)} de IVA incluido.`)

  // ───────── 5. Pago en efectivo ─────────
  await narrar(page, 'Ahora, ¿cómo paga? En efectivo. Se pulsa el botón Efectivo, o la tecla F7.', 0)
  await page.getByRole('button', { name: /Efectivo/ }).first().click()
  await page.waitForTimeout(1000)
  const billete = [100, 200, 500, 1000, 2000].find(b => b >= total) ?? 2000
  await narrar(page, `El cliente entrega un billete de ${billete} pesos. Se toca el billete y el sistema calcula el cambio.`, 0)
  await page.locator('.cj-billetes button', { hasText: `$${billete}` }).click()
  await page.waitForTimeout(1200)
  const cambio = dinero(await page.locator('.cj-cambio b').innerText())
  await narrar(page, `El cambio que se debe entregar es ${letras(cambio)} pesos. El saldo queda en cero, y el botón de cobrar está listo.`)

  // ───────── 6. Cobrar e imprimir ─────────
  await narrar(page, 'Se pulsa Cobrar e imprimir, o la tecla F9.', 0)
  const esperaPopup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  const pop = await esperaPopup
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  if (pop) {
    await pop.waitForLoadState('domcontentloaded').catch(() => {})
    await pop.waitForTimeout(600)
    const html = await pop.content()
    await pop.close().catch(() => {})
    // La ventana de impresión del navegador no sale en el video; se muestra el mismo ticket de 80 mm como vista previa.
    await page.evaluate(h => {
      const d = document.createElement('div')
      d.id = 'vista-ticket'
      d.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px'
      d.innerHTML = '<div style="color:#fff;font:600 15px sans-serif">Ticket enviado a la impresora (vista previa, 80 mm)</div>'
      const f = document.createElement('iframe')
      f.style.cssText = 'width:340px;height:600px;background:#fff;border:0;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.5)'
      f.srcdoc = h
      d.appendChild(f); document.body.appendChild(d)
    }, html)
  }
  await narrar(page, `El cobro quedó registrado con el folio ${folio.replace(/-/g, ' ')}, y el ticket sale por la impresora con el folio, la sucursal, los conceptos, el I V A, la forma de pago y el cambio.`)
  await page.evaluate(() => document.getElementById('vista-ticket')?.remove())
  await narrar(page, `La pantalla confirma el cobro por ${letras(total)} pesos y el cambio entregado. Con Enter se empieza una nueva venta. Fin de la prueba.`)
  await page.waitForTimeout(1500)

  fs.writeFileSync(path.join(SALIDA, 'marcas.json'), JSON.stringify({ folio, total, iva, billete, cambio, marcas }, null, 2))
  await page.close()
  const v = page.video()
  if (v) fs.copyFileSync(await v.path(), path.join(SALIDA, 'caja-efectivo.webm'))
})
