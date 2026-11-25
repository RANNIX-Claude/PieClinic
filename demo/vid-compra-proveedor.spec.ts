// Video B1: orden de compra a proveedor (crear, autorizar por monto, enviar, recibir con factura → cuenta por pagar, verificar inventario).
// Correr: PW_LOTE=B BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-compra-proveedor
import { test, expect } from '@playwright/test'
import { crearVideo, escribir, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Galerías'
const v = crearVideo('vid-compra-proveedor')
const PRODUCTOS = [
  { sku: 'PF-PD-001', nombre: 'Calcetas para pie diabético', cantidad: 40 },
  { sku: 'PF-CC-001', nombre: 'Crema hidratante de talones', cantidad: 40 },
]

async function existencia(page: import('@playwright/test').Page, sku: string) {
  const fila = page.locator('tbody tr', { hasText: sku }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const celdas = await fila.locator('td').allInnerTexts()
  return Number(celdas[3].replace(/[^0-9.\-]/g, ''))
}

test('Compras: orden de compra a proveedor con factura y entrada de inventario', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de compras de Pie Clinic. Cómo se compra mercancía a un proveedor: de la orden de compra a la cuenta por pagar y la entrada al inventario.', 'm@g.com', 'la persona de Administración')

  // ───────── Inventario antes ─────────
  await v.irA(page, /^Inventario$/)
  const antes: Record<string, number> = {}
  for (const p of PRODUCTOS) antes[p.sku] = await existencia(page, p.sku)
  await v.narrar(page, `Antes de comprar se revisa el inventario de Galerías. Las calcetas para pie diabético tienen ${antes['PF-PD-001']} piezas y la crema hidratante de talones tiene ${antes['PF-CC-001']}: las dos están sin existencia, por eso se van a comprar.`)

  // ───────── Proveedores ─────────
  await v.irA(page, /^Proveedores$/)
  await v.narrar(page, 'El catálogo de proveedores guarda las condiciones de pago de cada uno. Se va a comprar a Podo Supply, que da crédito a quince días.')

  // ───────── Nueva orden ─────────
  await v.irA(page, /^Compras$/)
  await v.narrar(page, 'En Compras a proveedores se ven las órdenes, las recepciones y las cuentas por pagar. Se crea una nueva orden de compra.', 0)
  await page.getByRole('button', { name: /Nueva orden de compra/ }).click()
  const ed = page.getByRole('dialog').last()
  await expect(ed.getByLabel('Proveedor', { exact: true })).toBeVisible()
  const opciones = await ed.getByLabel('Proveedor', { exact: true }).locator('option').allInnerTexts()
  const prov = opciones.find(o => o.startsWith('Podo Supply'))!
  await ed.getByLabel('Proveedor', { exact: true }).selectOption({ label: prov })
  await page.waitForTimeout(800)
  await expect(ed.getByLabel('Sucursal que recibe')).toHaveValue(/.+/)
  await v.narrar(page, 'Se elige el proveedor Podo Supply. La sucursal que recibe es Pie Clinic Galerías, y las condiciones de pago se toman del proveedor.', 0)
  for (const p of PRODUCTOS) {
    const caja = ed.getByPlaceholder(/Agregar producto/)
    await caja.fill('')
    await escribir(caja, `${p.sku} · ${p.nombre}`)
    await page.waitForTimeout(700)
    const fila = ed.locator('tbody tr', { hasText: p.sku })
    await expect(fila).toBeVisible()
    await fila.locator('input[type=number]').first().fill(String(p.cantidad))
    await page.waitForTimeout(600)
  }
  const costos: number[] = []
  for (const p of PRODUCTOS) costos.push(Number(await ed.locator('tbody tr', { hasText: p.sku }).locator('input[type=number]').nth(1).inputValue()))
  const totalTxt = await ed.locator('b', { hasText: /^TOTAL/ }).innerText()
  const total = dinero(totalTxt)
  expect(total).toBeGreaterThan(5000)
  await v.narrar(page, `Se agregan dos productos, cuarenta piezas de cada uno. El costo unitario sale del último costo de ese proveedor: ${letras(costos[0])} pesos las calcetas y ${letras(costos[1])} pesos la crema. El total con IVA es ${letras(total)} pesos.`, 0)
  await expect(ed.getByText(/Administración debe autorizar la orden/)).toBeVisible()
  await v.narrar(page, 'Como pasa de cinco mil pesos, el sistema avisa que Administración debe autorizar la orden antes de enviarla al proveedor.', 0)
  await ed.getByRole('button', { name: 'Guardar borrador' }).click()

  // ───────── Detalle: autorizar y enviar ─────────
  const det = page.getByRole('dialog').last()
  await expect(det.getByText(/Pendiente de autorización/)).toBeVisible({ timeout: 45_000 })
  const folio = ((await det.getAttribute('aria-label')) ?? '').replace('Orden de compra', '').trim()
  await expect(det.getByRole('button', { name: 'Enviar al proveedor' })).toBeDisabled()
  await v.narrar(page, `La orden ${folio.replace(/-/g, ' ')} quedó como borrador, pendiente de autorización. El botón de enviar al proveedor está bloqueado hasta que se autorice.`, 0)
  await det.getByRole('button', { name: 'Autorizar', exact: true }).click()
  await v.narrar(page, 'Administración revisa el monto y autoriza la compra.', 0)
  await page.getByRole('dialog').last().getByRole('button', { name: 'Autorizar', exact: true }).click()
  await expect(page.getByRole('dialog').last().getByText('Autorizada', { exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('dialog').last().getByRole('button', { name: 'Enviar al proveedor' })).toBeEnabled()
  await v.narrar(page, 'La orden aparece como autorizada y ya se puede enviar al proveedor.', 0)
  await page.getByRole('dialog').last().getByRole('button', { name: 'Enviar al proveedor' }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Marcar como enviada' }).click()
  await expect(page.getByRole('dialog').last().getByText('Enviada', { exact: true }).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Se marca como enviada. A partir de aquí las partidas ya no se pueden modificar y la orden espera la mercancía.')

  // ───────── Recepción con factura ─────────
  await page.getByRole('dialog').last().getByRole('button', { name: 'Registrar recepción' }).click()
  const rec = page.getByRole('dialog').last()
  await expect(rec.getByLabel('Número de factura')).toBeVisible()
  await v.narrar(page, 'Llega la mercancía. En la recepción se captura lo que llegó de cada partida; llegaron completas las cuarenta piezas de los dos productos.', 0)
  const factura = `PS-${String(Date.now()).slice(-5)}`
  await escribir(rec.getByLabel('Número de factura'), factura)
  const sugerido = dinero((await rec.getByText(/Sugerido por lo recibido/).innerText()).replace('Sugerido por lo recibido:', ''))
  await rec.getByLabel('Importe de la factura').fill(String(sugerido))
  await page.waitForTimeout(800)
  await v.narrar(page, `Se captura la factura ${factura.replace('-', ' ')} del proveedor por ${letras(sugerido)} pesos, que coincide con lo recibido. Con la factura nace la cuenta por pagar, según la regla de compras.`, 0)
  await rec.getByRole('button', { name: 'Confirmar recepción' }).click()
  const det2 = page.getByRole('dialog').last()
  await expect(det2.getByText(/Cuenta por pagar generada/)).toBeVisible({ timeout: 60_000 })
  await expect(det2.getByText('Recibida', { exact: true }).first()).toBeVisible()
  const cxpTxt = (await det2.getByText(/Cuenta por pagar generada/).innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `La orden quedó recibida completa. Abajo aparece la cuenta por pagar generada: ${cxpTxt.replace('Cuenta por pagar generada:', '').trim()}.`)
  const saldoCxp = dinero(cxpTxt.match(/saldo \$?([\d,\.]+)/)![1])
  expect(Math.abs(saldoCxp - sugerido)).toBeLessThan(0.02)

  // ───────── Inventario después ─────────
  await page.keyboard.press('Escape').catch(() => {})
  await v.irA(page, /^Inventario$/)
  const despues: Record<string, number> = {}
  for (const p of PRODUCTOS) despues[p.sku] = await existencia(page, p.sku)
  for (const p of PRODUCTOS) expect(despues[p.sku]).toBe(antes[p.sku] + p.cantidad)
  await v.narrar(page, `En el inventario de Galerías las calcetas pasaron de ${antes['PF-PD-001']} a ${despues['PF-PD-001']} piezas, y la crema hidratante de ${antes['PF-CC-001']} a ${despues['PF-CC-001']}. La recepción sumó la mercancía y recalculó el costo promedio. Fin: la cuenta por pagar queda lista para que Administración la pague.`)
  await v.terminar(page, { folio, factura, total, sugerido, cuentaPorPagar: saldoCxp, antes, despues })
})
