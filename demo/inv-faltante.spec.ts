// Video INV-2: el traspaso llega con piezas de menos (recepción con diferencias → reclamación).
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts inv-faltante
import { test, expect } from '@playwright/test'
import { crearVideo, crearTraspaso } from './lib/video'

const ORIGEN = 'Pie Clinic Galerías', DESTINO = 'Pie Clinic Centenario'
const v = crearVideo('inv-faltante')

test('Inventario: traspaso que llega con piezas de menos', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, ORIGEN, 'Prueba de inventario de Pie Clinic. Caso dos: qué hacer cuando un traspaso llega con piezas de menos.')
  await v.irA(page, /^Traspasos$/)
  await v.narrar(page, 'Se parte de la pantalla de traspasos. Vamos a enviar seis esmaltes antimicóticos de la sucursal Galerías a Centenario.')

  const modal = await crearTraspaso(page, ORIGEN, DESTINO, [{ sku: 'PF-AM-002', nombre: 'Esmalte antimicótico', cantidad: 6 }], (t, e) => v.narrar(page, t, e))
  await expect(modal.locator('tbody tr')).toHaveCount(1)
  await v.narrar(page, 'Una partida: seis piezas de esmalte antimicótico. Se envía el traspaso y el producto sale del inventario de Galerías.', 0)
  await modal.getByRole('button', { name: 'Enviar traspaso' }).click()
  const detalle = page.getByRole('dialog').last()
  await expect(detalle.getByText(/Enviado \(en tránsito\)/).first()).toBeVisible({ timeout: 45_000 })
  const folio = (await detalle.locator('h2, h3, [class*=title]').first().innerText()).replace('Traspaso', '').trim()
  await v.narrar(page, `El traspaso ${folio.replace(/-/g, ' ')} quedó en tránsito con seis piezas enviadas.`)

  // ───────── Recepción con faltante ─────────
  await page.keyboard.press('Escape').catch(() => {})
  await v.cambiarSede(page, DESTINO)
  await page.getByText(folio, { exact: false }).first().click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Recibir en destino' }).click()
  const recep = page.getByRole('dialog').last()
  await v.narrar(page, 'La mercancía llega a Centenario. Al abrir la recepción, el sistema muestra seis piezas enviadas. Quien recibe cuenta físicamente la caja, y solo hay cinco.', 0)
  await recep.locator('tbody tr').first().locator('input[type=number]').fill('5')
  await page.waitForTimeout(1000)
  await v.narrar(page, 'Se captura cinco como cantidad recibida. La diferencia de menos uno aparece en rojo, y el sistema exige un motivo: sin motivo no deja confirmar.', 0)
  await expect(recep.getByRole('button', { name: /Confirmar y reportar diferencia/ })).toBeDisabled()
  await v.narrar(page, 'El botón de confirmar sigue bloqueado hasta que se escriba el motivo del faltante.', 0)
  await escribirMotivo(recep)
  await v.narrar(page, 'Se escribe el motivo: llegaron cinco piezas, falta una en la caja. Ahora el botón permite confirmar y reportar la diferencia.')
  await recep.getByRole('button', { name: /Confirmar y reportar diferencia/ }).click()
  await expect(page.getByRole('dialog').last().getByText(/Recibido con diferencias/).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'El traspaso queda en estado recibido con diferencias. Se sumaron al inventario de Centenario solo las cinco piezas que llegaron, y la pieza faltante no se pierde: quedan registradas como una reclamación pendiente.')

  // ───────── Reclamación ─────────
  await page.keyboard.press('Escape').catch(() => {})
  await v.irA(page, /^Mermas y conteos$/)
  await v.narrar(page, 'En Mermas y conteos aparece la reclamación del traspaso, con la pieza faltante y el motivo. Administración la resuelve: o el origen confirma el error, o se registra como merma. No vuelve a descontar inventario. Fin del caso dos.')
  await v.terminar(page, { folio })
})

async function escribirMotivo(recep: import('@playwright/test').Locator) {
  const motivo = recep.locator('tbody tr').first().locator('input:not([type=number])')
  await motivo.pressSequentially('Faltante: llegaron 5 piezas, falta 1 en la caja', { delay: 70 })
}
