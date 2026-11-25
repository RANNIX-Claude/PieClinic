// Video CAJA-B: corte y cierre de turno (resumen por método, retiro de caja, efectivo contado, diferencia, justificación, cierre).
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts caja-corte
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const v = crearVideo('corte')

test('Caja: corte y cierre de turno', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de caja de Pie Clinic. Caso: el corte y cierre del turno al final del día.')
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(4000)
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'La recepcionista termina su jornada. Para cerrar el turno entra a la pestaña Corte de turno.', 0)
  await page.getByText('Corte de turno').first().click()
  await expect(page.getByText('Efectivo esperado en caja')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  await v.narrar(page, 'El sistema ya calculó el resumen del turno: el fondo inicial, las ventas por cada forma de pago, las cancelaciones y los retiros. Abajo queda el efectivo que debe haber físicamente en la caja.')

  // Retiro de caja
  await v.narrar(page, 'Antes de contar, se registra un gasto menor que salió de la caja durante el día: cien pesos de papelería.', 0)
  if (await page.getByText('Papelería para recepción').count() === 0) {
  await page.getByRole('button', { name: /Registrar retiro/ }).click()
  const mov = page.getByRole('dialog').last()
  await mov.getByLabel('Tipo').selectOption('gasto')
  await mov.getByLabel('Monto').fill('100')
  await mov.getByLabel('Concepto').pressSequentially('Papelería para recepción', { delay: 70 })
  await page.waitForTimeout(800)
  await mov.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Papelería para recepción').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2000)
  }
  const esperado = dinero(await page.locator('tr', { hasText: 'Efectivo esperado en caja' }).locator('td').last().innerText())
  await v.narrar(page, `El movimiento quedó registrado y el efectivo esperado ya considera el retiro y la cancelación del ticket que se canceló en este turno: el sistema espera ${letras(esperado)} pesos en la caja.`)

  // Conteo con diferencia
  const contado = Math.round((esperado - 20) * 100) / 100
  await v.narrar(page, 'Se cuentan los billetes y las monedas, uno por uno. Hay veinte pesos menos de lo esperado.', 0)
  await page.getByLabel(/Efectivo contado/).pressSequentially(String(contado), { delay: 90 })
  await page.waitForTimeout(1500)
  await expect(page.getByText(/Diferencia:/)).toBeVisible()
  await v.narrar(page, `Se captura ${letras(contado)} pesos. La diferencia de veinte pesos aparece en la pantalla, y como está dentro de la tolerancia de cincuenta pesos, no se necesita el PIN del administrador. Pero sí se exige una justificación.`, 0)
  await expect(page.getByRole('button', { name: 'Cerrar turno' })).toBeEnabled()
  await page.getByLabel(/Justificación/).pressSequentially('Faltante de cambio en una venta de la tarde', { delay: 70 })
  await v.narrar(page, 'Se escribe la justificación: faltante de cambio en una venta de la tarde.')
  await v.narrar(page, 'Se pulsa Cerrar turno. El sistema guarda el corte y manda a imprimir el comprobante.', 0)
  const esperaPopup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null)
  await page.getByRole('button', { name: 'Cerrar turno' }).click()
  const pop = await esperaPopup
  await expect(page.getByText(/No tienes un turno abierto|Abrir turno/).first()).toBeVisible({ timeout: 45_000 })
  if (pop) {
    await pop.waitForLoadState('domcontentloaded').catch(() => {})
    await pop.waitForTimeout(600)
    const html = await pop.content()
    await pop.close().catch(() => {})
    await page.evaluate(h => {
      const d = document.createElement('div'); d.id = 'vista-ticket'
      d.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px'
      d.innerHTML = '<div style="color:#fff;font:600 15px sans-serif">Corte enviado a la impresora (vista previa)</div>'
      const f = document.createElement('iframe'); f.style.cssText = 'width:340px;height:600px;background:#fff;border:0;border-radius:6px'
      f.srcdoc = h; d.appendChild(f); document.body.appendChild(d)
    }, html)
  }
  await v.narrar(page, 'El turno quedó cerrado. Sale el comprobante del corte con las ventas, el efectivo esperado, el contado y la diferencia justificada.')
  await page.evaluate(() => document.getElementById('vista-ticket')?.remove())
  await page.waitForTimeout(1500)
  await v.narrar(page, 'En Cortes anteriores aparece este cierre, listo para que el administrador lo revise. La recepcionista ya no puede cobrar hasta abrir otro turno. Fin del caso.')
  await v.terminar(page, { esperado, contado })
})
