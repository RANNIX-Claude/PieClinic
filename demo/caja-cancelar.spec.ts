// Video CAJA-A: cancelar un ticket cobrado (motivo obligatorio, el ticket no se borra, queda anulado).
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts caja-cancelar
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const v = crearVideo('cancelar')

test('Caja: cancelar un ticket cobrado', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de caja de Pie Clinic. Caso: cancelar un ticket que ya se cobró, con motivo y sin borrar nada.')
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(4000)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.isVisible().catch(() => false)) {
    await v.narrar(page, 'Se abre el turno de caja con el fondo inicial.')
    await page.getByLabel('Fondo inicial').fill('1000'); await abrir.click(); await page.waitForTimeout(3500)
  }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'Primero se hace una venta pequeña, para tener un ticket que cancelar. Un antimicótico en crema, pagado en efectivo.', 0)
  await page.keyboard.press('F3')
  await page.locator('.cj-buscar-in').pressSequentially('antimic', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Antimicótico' }).first().click()
  await page.waitForTimeout(1200)
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  await page.getByRole('button', { name: /Efectivo/ }).first().click()
  await page.waitForTimeout(800)
  const billete = [100, 200, 500, 1000].find(b => b >= total) ?? 1000
  await page.locator('.cj-billetes button', { hasText: `$${billete}` }).click()
  await page.waitForTimeout(800)
  const esperaPopup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  const pop = await esperaPopup; await pop?.close().catch(() => {})
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  await v.narrar(page, `Se cobró el ticket ${folio.replace(/-/g, ' ')} por ${letras(total)} pesos. Ahora la clienta regresa: se equivocó de producto y pide que se cancele la compra.`)

  await v.narrar(page, 'Se abre la pestaña Tickets del día, donde están todos los tickets de hoy con su estado.', 0)
  await page.getByText('Tickets del día').first().click()
  await page.waitForTimeout(3000)
  const fila = page.locator('tr', { hasText: folio })
  await expect(fila).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'Se localiza el ticket por su folio. A la derecha están las acciones: reimprimir una copia, facturar o cancelar.')
  await fila.getByRole('button', { name: 'Cancelar' }).click()
  const dlg = page.getByRole('dialog').last()
  await v.narrar(page, 'El sistema pide confirmar y advierte que el ticket no se borra: queda cancelado con su motivo, y se revierten el inventario y las comisiones. El motivo es obligatorio.', 0)
  await expect(dlg.getByRole('button', { name: 'Cancelar ticket' })).toBeDisabled()
  await v.narrar(page, 'Mientras no se escriba el motivo, el botón de cancelar sigue bloqueado.', 0)
  await dlg.locator('textarea').pressSequentially('La clienta se equivocó de producto', { delay: 70 })
  await v.narrar(page, 'Se escribe el motivo: la clienta se equivocó de producto. Ahora sí se confirma.', 0)
  await dlg.getByRole('button', { name: 'Cancelar ticket' }).click()
  await expect(page.locator('tr', { hasText: folio }).getByText(/cancelad/i).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'El ticket queda en estado cancelado, con el motivo a la vista. Sigue en la lista: nada se borra, para que haya rastro.')
  await v.narrar(page, 'Y en el corte de turno, esta cancelación se descuenta del efectivo esperado. Fin del caso.')
  await v.terminar(page, { folio, total })
})
