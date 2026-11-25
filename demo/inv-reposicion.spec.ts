// Video INV-3: reponer una sucursal con lo que sobra en otra (sugerir según mínimos del destino) antes de comprar.
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts inv-reposicion
import { test, expect } from '@playwright/test'
import { crearVideo } from './lib/video'

const ORIGEN = 'Pie Clinic Galerías', DESTINO = 'Pie Clinic Sendero'
const v = crearVideo('inv-reposicion')

test('Inventario: reponer según mínimos con un traspaso', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, DESTINO, 'Prueba de inventario de Pie Clinic. Caso tres: reponer una sucursal con lo que sobra en otra, antes de comprar.')
  await v.irA(page, /^Inventario$/)
  await v.narrar(page, 'Primero se revisa el inventario de la sucursal Sendero. Cada producto tiene su existencia y su mínimo por sucursal, y los que están por debajo del mínimo se marcan como bajos.')
  await v.irA(page, /^Traspasos$/)
  await v.narrar(page, 'Antes de comprar a un proveedor, se revisa si otra sucursal tiene de sobra. Galerías tiene existencia completa. Se crea un traspaso de Galerías hacia Sendero.', 0)

  await page.getByRole('button', { name: /Nuevo traspaso/ }).click()
  const modal = page.getByRole('dialog').last()
  await modal.getByLabel(/Sucursal origen/).selectOption({ label: ORIGEN })
  await page.waitForTimeout(800)
  await modal.getByLabel(/Sucursal destino/).selectOption({ label: DESTINO })
  await page.waitForTimeout(1000)
  await v.narrar(page, 'En lugar de capturar producto por producto, se pulsa Sugerir según mínimos del destino.', 0)
  await modal.getByRole('button', { name: /Sugerir según mínimos/ }).click()
  await page.waitForTimeout(1500)
  const n = await modal.locator('tbody tr').count()
  await v.narrar(page, `El sistema propone ${n} partidas: los productos de Sendero que están por debajo del mínimo y que Galerías puede surtir, con la cantidad que falta. La tabla muestra la existencia del origen, la del destino y el mínimo.`)
  await expect(modal.locator('tbody tr').first()).toBeVisible()
  await v.narrar(page, 'La persona puede ajustar cada cantidad antes de enviar. Se envía el traspaso tal como se sugirió.', 0)
  await modal.getByRole('button', { name: 'Enviar traspaso' }).click()
  const detalle = page.getByRole('dialog').last()
  await expect(detalle.getByText(/Enviado \(en tránsito\)/).first()).toBeVisible({ timeout: 45_000 })
  const folio = (await detalle.locator('h2, h3, [class*=title]').first().innerText()).replace('Traspaso', '').trim()
  await v.narrar(page, `El traspaso ${folio.replace(/-/g, ' ')} salió de Galerías y va en tránsito.`, 0)
  await detalle.getByRole('button', { name: 'Recibir en destino' }).click()
  await v.narrar(page, 'Llega a Sendero. Se cuenta la mercancía, coincide con lo enviado y se confirma la recepción completa.', 0)
  await page.getByRole('dialog').last().getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByRole('dialog').last().getByText(/Recibido completo/).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Recibido completo. Sendero quedó repuesto sin hacer una compra: se movió el producto que ya existía en la cadena. Fin del caso tres.')
  await v.terminar(page, { folio, partidas: n })
})
