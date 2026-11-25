// Video CAJA-C: ticket que mezcla un producto especial a la medida (precio base cotizado + características que suman) con un producto de catálogo.
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts caja-especial
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const BASE = 1800
const v = crearVideo('especial')

test('Caja: ticket con producto especial a la medida y producto de catálogo', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de caja de Pie Clinic. Caso: un ticket con un producto especial hecho a la medida, cotizado en el momento, mezclado con un producto normal del catálogo, y un solo total.')
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(4000)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.isVisible().catch(() => false)) { await page.getByLabel('Fondo inicial').fill('1000'); await abrir.click(); await page.waitForTimeout(3500) }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 180_000 })
  // 0. Cliente obligatorio: se busca y elige a la paciente por nombre
  const buscador = page.getByPlaceholder(/Buscar paciente/)
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await expect(buscador).toBeVisible({ timeout: 90_000 })
  await buscador.pressSequentially('mar', { delay: 120 })
  const op = page.locator('button:not(.cj-tile)', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).first()
  await expect(op).toBeVisible({ timeout: 20_000 })
  const cliente = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1000)
  await op.click()
  await v.narrar(page, `Llega ${cliente} y pide unas plantillas ortopédicas hechas a la medida, que no existen en el catálogo con un precio fijo, y además se lleva una crema. En la caja el cliente es obligatorio: se busca a la paciente por su nombre y se elige.`, 0)
  await expect(page.locator('.cj-sub', { hasText: `Ticket · ${cliente}` })).toBeVisible()
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await page.waitForTimeout(800)

  // 1. Producto especial
  await page.keyboard.press('F2')
  await page.locator('.cj-buscar-in').pressSequentially('plantilla', { delay: 100 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Plantilla ortopédica a la medida' }).first().click()
  await page.waitForTimeout(1500)
  const lin = page.locator('.cj-linea', { hasText: 'Plantilla ortopédica a la medida' })
  await expect(lin.locator('.cj-carac')).toBeVisible()
  await v.narrar(page, 'Se busca con la tecla F2 y se agrega el producto especial: plantilla ortopédica a la medida. Como es un producto hecho a la medida, el renglón muestra un panel para cotizarlo: el precio base y las características.')

  await v.narrar(page, `Primero el precio base que se cotiza al cliente: ${BASE} pesos.`, 0)
  await lin.getByLabel('Precio base cotizado').fill(String(BASE))
  await page.waitForTimeout(1200)

  const elegir = async (grupo: string, nombre: string, valor?: string) => {
    const sel = lin.getByLabel('Característica', { exact: true })
    const opt = sel.locator(`optgroup[label="${grupo}"] option`, { hasText: nombre }).first()
    await sel.selectOption({ value: await opt.getAttribute('value') as string })
    if (valor) await lin.getByLabel('Valor', { exact: true }).fill(valor)
    await page.waitForTimeout(700)
    await lin.getByRole('button', { name: 'Agregar característica' }).click()
    await page.waitForTimeout(1300)
  }
  await v.narrar(page, 'Ahora las características, que se eligen de un catálogo. Primero el material: piel.', 0)
  await elegir('Material', 'Piel')
  await v.narrar(page, 'Una mayor altura de seis milímetros.', 0)
  await elegir('Altura y grosor', 'Mayor altura', '6')
  await v.narrar(page, 'Una adaptación de virón y cuña. Esta sí tiene costo: el sistema la suma al precio.', 0)
  await elegir('Adaptación', 'Virón y cuña')
  await v.narrar(page, 'Y una compensación por disimetría de dos centímetros. Se cobra por centímetro, así que el sistema multiplica.', 0)
  await elegir('Adaptación', 'Compensación por disimetría', '2')
  await v.narrar(page, 'Por último, que sean para ambos pies.', 0)
  await elegir('Lado', 'Ambos pies')
  const descripcion = (await lin.locator('.cj-linea-desc').innerText()).replace(/\s+/g, ' ').trim()
  const importeEsp = dinero(await lin.locator('.cj-imp b').innerText())
  await v.narrar(page, `El renglón ya trae su descripción completa, con todas las características, y su precio: ${BASE} de base, más cuatrocientos noventa por el virón y cuña, más novecientos por la compensación. En total ${letras(importeEsp)} pesos.`)
  expect(importeEsp).toBeCloseTo(BASE + 590 + 900, 1)

  // 2. Producto de catálogo
  await v.narrar(page, 'Ahora se agrega un producto normal del catálogo: una crema hidratante de talones.', 0)
  await page.keyboard.press('F3')
  await page.locator('.cj-buscar-in').pressSequentially('crema hidr', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Crema hidratante' }).first().click()
  await page.waitForTimeout(1500)
  await expect(page.locator('.cj-linea')).toHaveCount(2)
  const importes = (await page.locator('.cj-linea .cj-imp b').allInnerTexts()).map(dinero)
  const suma = importes.reduce((a, b) => a + b, 0)
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  expect(total).toBeCloseTo(suma, 1)
  await v.narrar(page, `El ticket mezcla los dos: el producto especial a ${letras(importes[0])} y la crema a ${letras(importes[1])}. El sistema suma todo en un solo total de ${letras(total)} pesos.`)

  // 3. Cobro con tarjeta
  await page.getByRole('button', { name: /Tarjeta/ }).first().click()
  await page.waitForTimeout(1000)
  await page.getByPlaceholder('Autorización').pressSequentially('AUT-771204', { delay: 80 })
  await page.getByPlaceholder('Últimos 4').pressSequentially('1881', { delay: 80 })
  await v.narrar(page, 'Paga con tarjeta, con su autorización y los últimos cuatro dígitos. El saldo queda en cero.', 0)
  const esperaPopup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  const pop = await esperaPopup
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  let ticketTexto = ''
  if (pop) {
    await pop.waitForLoadState('domcontentloaded').catch(() => {})
    await pop.waitForTimeout(600)
    const html = await pop.content()
    ticketTexto = await pop.locator('body').innerText().catch(() => '')
    await pop.close().catch(() => {})
    await page.evaluate(h => {
      const d = document.createElement('div'); d.id = 'vista-ticket'
      d.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px'
      d.innerHTML = '<div style="color:#fff;font:600 15px sans-serif">Ticket enviado a la impresora (vista previa, 80 mm)</div>'
      const f = document.createElement('iframe'); f.style.cssText = 'width:340px;height:640px;background:#fff;border:0;border-radius:6px'
      f.srcdoc = h; d.appendChild(f); document.body.appendChild(d)
    }, html)
  }
  expect(ticketTexto).toMatch(/piel/i)
  // El ticket imprime el nombre y el apellido paterno (vista prp_ventas_*): debe ser el cliente elegido, no «Cliente general».
  const clienteTicket = (ticketTexto.split(String.fromCharCode(10)).find(l => l.startsWith('Cliente:')) ?? '').replace('Cliente:', '').trim()
  expect(clienteTicket).not.toMatch(/general/i)
  expect(clienteTicket.length).toBeGreaterThan(2)
  expect(cliente.startsWith(clienteTicket)).toBe(true)
  await v.narrar(page, `Se cobró el ticket ${folio.replace(/-/g, ' ')}. En el ticket impreso, arriba se lee Cliente: ${clienteTicket}, la paciente elegida, y no Cliente general. El producto especial sale con todas sus características en la descripción: material, altura, adaptaciones y lado. Y abajo, el total.`)
  await page.evaluate(() => document.getElementById('vista-ticket')?.remove())
  await v.narrar(page, 'Así se mezclan productos de catálogo con productos especiales a la medida en un mismo ticket. Fin del caso.')
  await v.terminar(page, { folio, cliente, clienteTicket, total, suma, importes, descripcion, ticketTexto: ticketTexto.slice(0, 900) })
})
