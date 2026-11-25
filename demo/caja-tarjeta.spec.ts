// Video del módulo de CAJA (Pie Clinic), caso 2: cobro con tarjeta (autorización y últimos 4 dígitos), de la firma al ticket.
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts caja-tarjeta   ·   Salidas: demo/video/tarjeta/
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const DEMO = path.resolve(process.cwd(), 'demo')
const SALIDA = path.join(DEMO, 'video', 'tarjeta')
const EMAIL = 'r@g.com', CLAVE = '123456'            // cuenta de prueba de recepción (docs/ACCESOS.md), solo QA
const SEDE = 'Pie Clinic Centenario'
const AUTORIZACION = 'AUT-482913', ULTIMOS4 = '4242'    // datos ficticios de prueba (voucher de la terminal)
const marcas: { t: number; texto: string }[] = []
let t0 = 0
const duraciones: Record<string, number> = fs.existsSync(path.join(SALIDA, 'duraciones.json')) ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'duraciones.json'), 'utf8')) : {}

async function narrar(page: Page, texto: string, extraMs = 600) {
  marcas.push({ t: Date.now() - t0, texto })
  const medida = duraciones[String(marcas.length - 1)]
  const ms = medida ? medida * 1000 + 400 : (texto.length / 13) * 1000 + 700
  await page.waitForTimeout(ms + extraMs)
}
const escribir = (loc: ReturnType<Page['locator']>, texto: string) => loc.pressSequentially(texto, { delay: 110 })
const dinero = (s: string) => Number(s.replace(/[^0-9.]/g, ''))
const letras = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

test('Caja: cobro con tarjeta, de la firma al ticket', async ({ page, context }) => {
  fs.mkdirSync(SALIDA, { recursive: true })
  // La ventana de impresión del navegador bloquea la grabación: la llamada a imprimir de la ventana del ticket se vuelve inocua.
  await context.addInitScript(() => { const abrir = window.open; window.open = (...a) => { const w = abrir.apply(window, a as any); if (w) { try { (w as any).print = () => {} } catch {} } return w } })
  t0 = Date.now()

  // ───────── 1. Firma ─────────
  await page.goto('/app/login', { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  await narrar(page, 'Prueba de caja de Pie Clinic. Caso dos: cobro con tarjeta, desde que la recepcionista firma hasta que imprime el ticket.')
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

  // ───────── 3. Servicio y producto ─────────
  await narrar(page, 'La paciente se lleva una quiropodia. Con la tecla F2 se buscan servicios.', 0)
  await page.keyboard.press('F2')
  await escribir(page.locator('.cj-buscar-in'), 'quirop')
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Quiropodia' }).first().click()
  await page.waitForTimeout(1500)
  await narrar(page, 'Y también un antimicótico en crema. Con F3 se buscan productos.', 0)
  await page.keyboard.press('F3')
  await escribir(page.locator('.cj-buscar-in'), 'antimic')
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Antimicótico' }).first().click()
  await page.waitForTimeout(1500)
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  const iva = dinero(await page.locator('.cj-iva span').last().innerText())
  await narrar(page, `El ticket muestra los dos conceptos con su importe. El total a cobrar es ${letras(total)} pesos, con ${letras(iva)} de IVA incluido.`)

  // ───────── 4. Pago con tarjeta ─────────
  await narrar(page, 'Ahora, ¿cómo paga? Con tarjeta. Se pulsa el botón Tarjeta, o la tecla F8.', 0)
  await page.getByRole('button', { name: /^Tarjeta/ }).first().click()
  await page.waitForTimeout(1200)
  await narrar(page, 'El monto se llena solo con el total. La recepcionista cobra en la terminal bancaria y captura el número de autorización y los últimos cuatro dígitos de la tarjeta, como comprobante.', 0)
  await escribir(page.getByPlaceholder('Autorización'), AUTORIZACION)
  await escribir(page.getByPlaceholder('Últimos 4'), ULTIMOS4)
  await page.waitForTimeout(1500)
  await narrar(page, 'El saldo queda en cero y el botón de cobrar está listo.')

  // ───────── 5. Cobrar e imprimir ─────────
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
  await narrar(page, `El cobro quedó registrado con el folio ${folio.replace(/-/g, ' ')}, y el ticket sale por la impresora con el folio, la sucursal, los conceptos, el I V A y la forma de pago con tarjeta.`)
  await page.evaluate(() => document.getElementById('vista-ticket')?.remove())
  await narrar(page, `La pantalla confirma el cobro por ${letras(total)} pesos. Con Enter se empieza una nueva venta. Fin de la prueba.`)
  await page.waitForTimeout(1500)

  fs.writeFileSync(path.join(SALIDA, 'marcas.json'), JSON.stringify({ folio, total, iva, marcas }, null, 2))
  await page.close()
  const v = page.video()
  if (v) fs.copyFileSync(await v.path(), path.join(SALIDA, 'caja-tarjeta.webm'))
})
