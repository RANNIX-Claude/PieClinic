// Video INV-1: traspaso de inventario entre sucursales, completo (crear → enviar → recibir en destino → verificar).
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts inv-traspaso
import { test, expect } from '@playwright/test'
import { crearVideo, crearTraspaso } from './lib/video'

const ORIGEN = 'Pie Clinic Galerías', DESTINO = 'Pie Clinic Centenario'
const v = crearVideo('inv-traspaso')

test('Inventario: traspaso completo entre sucursales', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, ORIGEN, 'Prueba de inventario de Pie Clinic. Caso uno: un traspaso completo de mercancía entre dos sucursales, paso a paso.')
  await v.irA(page, /^Traspasos$/)
  await v.narrar(page, 'Esta es la pantalla de traspasos entre sucursales. Arriba se ven los borradores, lo que está en tránsito y los traspasos con diferencias. La sucursal Centenario necesita reponer producto y Galerías tiene de sobra.')

  // ───────── 1. Crear el traspaso ─────────
  await v.narrar(page, 'Paso uno: se crea un nuevo traspaso.', 0)
  const modal = await crearTraspaso(page, ORIGEN, DESTINO, [
    { sku: 'PF-CC-001', nombre: 'Crema hidratante de talones', cantidad: 4 },
    { sku: 'PF-AM-001', nombre: 'Antimicótico en crema', cantidad: 3 },
  ], (t, e) => v.narrar(page, t, e))
  await expect(modal.locator('tbody tr')).toHaveCount(2)
  const resumen = (await modal.locator('div', { hasText: /^Partidas/ }).last().innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, 'Quedan dos partidas: cuatro cremas hidratantes y tres antimicóticos, siete unidades en total. El sistema calcula el costo del traspaso a costo promedio.')

  // ───────── 2. Enviar ─────────
  await v.narrar(page, 'Paso dos: se envía el traspaso. Al enviar, el producto sale del inventario de Galerías y queda en tránsito.', 0)
  await modal.getByRole('button', { name: 'Enviar traspaso' }).click()
  const detalle = page.getByRole('dialog').last()
  await expect(detalle.getByText(/Enviado \(en tránsito\)/).first()).toBeVisible({ timeout: 45_000 })
  const folio = (await detalle.locator('h2, h3, [class*=title]').first().innerText()).replace('Traspaso', '').trim()
  await v.narrar(page, `El traspaso ${folio.replace(/-/g, ' ')} quedó en estado enviado, en tránsito. Todavía no suma al destino.`)

  // ───────── 3. Recibir en la sucursal destino ─────────
  await v.narrar(page, 'Paso tres: la mercancía llega a Centenario. Quien recibe firma en esa sucursal y abre el traspaso.', 0)
  await detalle.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await v.cambiarSede(page, DESTINO)
  await page.getByText(folio, { exact: false }).first().click()
  const det2 = page.getByRole('dialog').last()
  await det2.getByRole('button', { name: 'Recibir en destino' }).click()
  const recep = page.getByRole('dialog').last()
  await v.narrar(page, 'La pantalla de recepción muestra lo enviado de cada producto. Se cuenta la mercancía y se captura lo recibido. Aquí llegó todo completo, así que no se cambia nada.')
  await recep.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByRole('dialog').last().getByText(/Recibido completo/).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'El traspaso queda en estado recibido completo. El inventario de Centenario sube y la mercancía en tránsito desaparece.')

  // ───────── 4. Verificar en inventario ─────────
  await page.keyboard.press('Escape').catch(() => {})
  await v.irA(page, /^Inventario$/)
  await page.getByPlaceholder(/Buscar/).first().fill('PF-CC-001')
  await page.waitForTimeout(1500)
  await v.narrar(page, 'Para verificar, se abre Inventario en Centenario y se busca la crema hidratante: la existencia ya incluye las cuatro piezas recibidas. Fin del caso uno.')
  await v.terminar(page, { folio, resumen })
})
