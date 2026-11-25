// Video CAJA-F1: vender con «¿Requiere factura?» a un paciente con datos fiscales y facturar el ticket desde Facturación (PAC SIMULADO).
// Correr: PW_LOTE=F BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts caja-facturar
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const v = crearVideo('facturar')

test('Caja: ticket que requiere factura y su timbrado simulado', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de facturación de Pie Clinic. Caso: una paciente pide factura al pagar. Se cobra el ticket en caja marcando que requiere factura y después se factura desde el módulo de Facturación. El timbrado con el proveedor fiscal está simulado, y el video lo dice con claridad.')
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(4000)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.isVisible().catch(() => false)) { await page.getByLabel('Fondo inicial').fill('1000'); await abrir.click(); await page.waitForTimeout(3500) }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })

  // 1. Paciente con datos fiscales y casilla de factura
  await v.narrar(page, 'Llega una paciente que pide factura. Primero se abre el panel de paciente y factura, y se busca su nombre.', 0)
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await page.getByPlaceholder(/Buscar paciente/).pressSequentially('Navarro', { delay: 100 })
  const op = page.locator('.cj-panel button', { hasText: /Guadalupe González Navarro/ }).first()
  await expect(op).toBeVisible({ timeout: 20_000 })
  const cliente = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(900)
  await op.click()
  await page.waitForTimeout(1000)
  const casilla = page.getByLabel(/Requiere factura/)
  await casilla.check()
  const rotulo = (await page.locator('label', { hasText: /Requiere factura/ }).innerText()).replace(/\s+/g, ' ')
  const conDatos = /datos fiscales/.test(rotulo)
  expect(conDatos).toBe(true)
  await v.narrar(page, `Se elige a ${cliente}. Al marcar «¿Requiere factura?», la pantalla confirma que la paciente ya tiene datos fiscales guardados, con una palomita.`)
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()

  // 2. Servicio y cobro en efectivo
  await page.keyboard.press('F2')
  await page.locator('.cj-buscar-in').pressSequentially('quirop', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Quiropodia' }).first().click()
  await page.waitForTimeout(1500)
  await page.keyboard.press('F3')
  await page.locator('.cj-buscar-in').pressSequentially('crema hidr', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Crema hidratante' }).first().click()
  await page.waitForTimeout(1500)
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  await v.narrar(page, `Se agregan una quiropodia, que es un servicio exento de I V A, y una crema hidratante, que sí lleva I V A. El total del ticket es ${letras(total)} pesos.`, 0)
  await page.getByRole('button', { name: /Efectivo/ }).first().click()
  await page.waitForTimeout(800)
  const billete = [100, 200, 500, 1000].find(b => b >= total) ?? 1000
  await page.locator('.cj-billetes button', { hasText: `$${billete}` }).click()
  await page.waitForTimeout(800)
  await v.narrar(page, 'Paga en efectivo y se pulsa Cobrar e imprimir.', 0)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  await expect(page.getByRole('button', { name: /Facturar este ticket/ })).toBeVisible()
  await v.narrar(page, `El cobro quedó con el folio ${folio.replace(/-/g, ' ')}. Como se marcó que requiere factura, la pantalla ofrece el botón Facturar este ticket, y el ticket queda en estado por facturar.`)

  // 3. Facturar
  await page.getByRole('button', { name: /Facturar este ticket/ }).click()
  const modal = page.getByRole('dialog').last()
  await expect(modal).toContainText('Nueva factura', { timeout: 30_000 })
  await expect(modal.locator('table tbody tr').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const rfc = await modal.getByLabel('RFC', { exact: true }).inputValue()
  const razon = await modal.getByLabel(/Nombre o razón social/).inputValue()
  const totalCfdi = dinero(await modal.locator('text=TOTAL CFDI 4.0').locator('xpath=following-sibling::span').innerText())
  expect(totalCfdi).toBeCloseTo(total, 1)
  await v.narrar(page, `Se abre la factura del ticket. Los datos fiscales de la paciente ya vienen cargados: R F C ${rfc.split('').join(' ')}, a nombre de ${razon.toLowerCase()}. A la derecha están los conceptos que el sistema calcula del ticket, con la regla de I V A por concepto, y el total del C F D I es ${letras(totalCfdi)} pesos, igual al ticket.`)
  await v.narrar(page, 'Aviso importante: el timbrado está en modo simulado. Todavía no hay llave del proveedor autorizado de certificación, así que este C F D I no tiene validez fiscal y la pantalla lo rotula así.', 0)
  await modal.getByRole('button', { name: /Timbrar y enviar/ }).click()
  await expect(page.getByRole('tab', { name: /Timbradas/ })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 })
  await page.waitForTimeout(3000)
  const fila = page.locator('tbody tr', { hasText: razon.toUpperCase() }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const filaTxt = (await fila.innerText()).replace(/\s+/g, ' ')
  expect(filaTxt).toMatch(/Simulado/i)
  await v.narrar(page, 'La factura se timbró y aparece en la lista de timbradas con su serie y folio, su U U I D, el total, el estatus vigente y la etiqueta Simulado.')

  // 4. Representación impresa del CFDI
  const esperaPopup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null)
  await fila.getByRole('button', { name: /PDF/ }).click()
  const pop = await esperaPopup
  let cfdiTexto = ''
  if (pop) {
    await pop.waitForLoadState('domcontentloaded').catch(() => {})
    await pop.waitForTimeout(600)
    const html = await pop.content()
    cfdiTexto = await pop.locator('body').innerText().catch(() => '')
    await pop.close().catch(() => {})
    await page.evaluate(h => {
      const d = document.createElement('div'); d.id = 'vista-cfdi'
      d.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px'
      d.innerHTML = '<div style="color:#fff;font:600 15px sans-serif">Representación impresa del CFDI (vista previa)</div>'
      const f = document.createElement('iframe'); f.style.cssText = 'width:900px;height:560px;background:#fff;border:0;border-radius:6px'
      f.srcdoc = h; d.appendChild(f); document.body.appendChild(d)
    }, html)
  }
  expect(cfdiTexto).toMatch(/SIMULADO/)
  await v.narrar(page, 'El botón P D F genera la representación impresa del C F D I cuatro punto cero, con el emisor, el receptor, los conceptos, el desglose de I V A y una marca de agua que dice simulado, sin validez fiscal.')
  await page.evaluate(() => document.getElementById('vista-cfdi')?.remove())

  // 5. Estado del ticket
  await page.getByRole('link', { name: /Caja y tickets/ }).first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
  await page.getByRole('tab', { name: /Tickets del día/ }).click()
  await page.waitForTimeout(3000)
  const tk = page.locator('tr', { hasText: folio }).first()
  await expect(tk).toBeVisible({ timeout: 30_000 })
  const tkTxt = (await tk.innerText()).replace(/\s+/g, ' ')
  expect(tkTxt).toMatch(/facturada/i)
  await v.narrar(page, `En Tickets del día, el ticket ${folio.replace(/-/g, ' ')} ya aparece como facturada. Antes estaba por facturar.`)
  await v.narrar(page, 'Así se factura un ticket cobrado. Limitación: el timbrado es simulado hasta que se contrate y configure el proveedor fiscal; está marcado como no corregido, requiere llave y decisión. Fin del caso.')
  await v.terminar(page, { folio, total, totalCfdi, cliente, rfc, razon, filaTxt, tkTxt, cfdiTexto: cfdiTexto.slice(0, 800) })
})
