// Video B2: mermas, conteo físico con diferencia, ajuste autorizado y resolución de la reclamación del traspaso GALERIAS-TRA-000002.
// Correr: PW_LOTE=B BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-mermas-conteo
import { test, expect } from '@playwright/test'
import { crearVideo, escribir, crearTraspaso } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const v = crearVideo('vid-mermas-conteo')

async function existencia(page: import('@playwright/test').Page, sku: string) {
  const fila = page.locator('tbody tr', { hasText: sku }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const celdas = await fila.locator('td').allInnerTexts()
  return Number(celdas[3].replace(/[^0-9.\-]/g, ''))
}

test('Inventario: mermas, conteo físico y reclamación de traspaso', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de inventario de Pie Clinic. Mermas, conteo físico con diferencia, y la reclamación de un traspaso que llegó con faltante.', 'm@g.com', 'la persona de Administración')

  // ───────── Existencias de partida ─────────
  await v.irA(page, /^Inventario$/)
  const sku1 = 'PF-IN-002', sku2 = 'PF-OR-001'
  const e1 = await existencia(page, sku1)
  const e2 = await existencia(page, sku2)
  await v.narrar(page, `Se parte del inventario de Centenario: hay ${e1} paquetes de fresas desechables y ${e2} separadores de dedos de silicona.`)

  // ───────── Merma ─────────
  await v.irA(page, /^Mermas y conteos$/)
  await expect(page.getByText(/Reclamaciones de traspaso/).first()).toBeVisible()
  await v.narrar(page, 'En Mermas y conteos están las bajas de inventario. Arriba se ven los pendientes de autorizar y las reclamaciones de traspaso. Primero se registra una merma: un paquete de fresas se dañó.', 0)
  await page.getByRole('button', { name: /Registrar merma/ }).click()
  const m = page.getByRole('dialog').last()
  await escribir(m.getByPlaceholder('SKU o nombre del producto…'), `${sku1} · Fresas desechables (paquete)`)
  await m.getByLabel('Cantidad').fill('1')
  await m.getByLabel('Tipo').selectOption({ label: 'Daño' })
  await escribir(m.getByLabel('Motivo'), 'Paquete roto al abrir la caja')
  await v.narrar(page, 'Se elige el producto, una pieza, tipo daño, y el motivo es obligatorio: paquete roto al abrir la caja.', 0)
  await m.getByRole('button', { name: 'Registrar', exact: true }).click()
  const filaMerma = page.locator('tbody tr', { hasText: 'Paquete roto al abrir la caja' }).first()
  await expect(filaMerma).toBeVisible({ timeout: 45_000 })
  const folioMerma = (await filaMerma.locator('td').first().innerText()).trim()
  await expect(filaMerma.getByText('Pendiente', { exact: true })).toBeVisible()
  await v.narrar(page, `Quedó la merma ${folioMerma.replace(/-/g, ' ')} en estado pendiente: todavía no descuenta inventario, hasta que Administración la autorice.`, 0)
  await filaMerma.getByRole('button', { name: 'Autorizar' }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Autorizar', exact: true }).click()
  await expect(filaMerma.getByText('Autorizada', { exact: true })).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Administración la autoriza y ahora sí se descuenta del inventario de la sucursal.')

  // ───────── Conteo físico ─────────
  await page.getByRole('tab', { name: /Conteos físicos/ }).click().catch(async () => { await page.getByText('Conteos físicos', { exact: true }).click() })
  await page.waitForTimeout(1500)
  await v.narrar(page, 'En la pestaña de conteos físicos se compara lo que hay en los estantes contra lo que dice el sistema. Se crea un conteo nuevo.', 0)
  await page.getByRole('button', { name: /Nuevo conteo/ }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Crear' }).click()
  const c = page.getByRole('dialog').last()
  await expect(c.getByText('Borrador', { exact: true }).first()).toBeVisible({ timeout: 45_000 })
  const folioConteo = ((await c.getAttribute('aria-label')) ?? '').replace('Conteo', '').split('·')[0].trim()
  await v.narrar(page, `Se crea el conteo ${folioConteo.replace(/-/g, ' ')} en borrador. Se agregan los productos que se contaron.`, 0)
  const esperadoSep = e2
  const contadoSep = e2 - 2
  await escribir(c.getByPlaceholder('Agregar producto a contar…'), `${sku2} · Separador de dedos de silicona`)
  await c.getByPlaceholder('Contado').fill(String(contadoSep))
  await c.getByRole('button', { name: '+ Agregar' }).click()
  await expect(c.locator('tbody tr', { hasText: sku2 })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  const fila = c.locator('tbody tr', { hasText: sku2 })
  const celdas = await fila.locator('td').allInnerTexts()
  expect(Number(celdas[2])).toBe(esperadoSep)
  expect(celdas[4].replace(/\s/g, '')).toBe('-2')
  await v.narrar(page, `Los separadores de silicona: el sistema esperaba ${esperadoSep} y en el estante se contaron ${contadoSep}. La diferencia es de menos dos y aparece en rojo.`, 0)
  await c.getByRole('button', { name: 'Marcar capturado' }).click()
  await expect(c.getByText('Capturado', { exact: true }).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Quien cuenta marca el conteo como capturado. El ajuste todavía no se aplica: lo autoriza Administración.', 0)
  await c.getByRole('button', { name: 'Autorizar ajuste' }).click()
  await v.narrar(page, 'Administración autoriza el ajuste: el sistema genera movimientos en el kardex para igualar la existencia con lo contado. No se puede deshacer; se corrige con otro conteo.', 0)
  await page.getByRole('dialog').last().getByRole('button', { name: 'Autorizar y ajustar' }).click()
  await expect(page.getByText(folioConteo).first()).toBeVisible({ timeout: 45_000 })
  await page.waitForTimeout(2000)
  const filaConteo = page.locator('tbody tr', { hasText: folioConteo }).first()
  await expect(filaConteo.getByText('Autorizado', { exact: true })).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'El conteo aparece como autorizado.')

  // ───────── Reclamación del traspaso ─────────
  // La reclamación de GALERIAS-TRA-000002 (CENTENARIO-MER-000001) ya se resolvió en la primera toma de esta prueba (quedó guardada y autorizada, verificado en BD);
  // aquí se muestra ya resuelta y se resuelve en cámara una reclamación nueva, generada por otro traspaso con faltante.
  await page.getByText('Mermas y reclamaciones', { exact: true }).click()
  await page.waitForTimeout(1500)
  const filaRecl = page.locator('tbody tr', { hasText: 'Faltante: llegaron 5 piezas' }).first()
  await expect(filaRecl).toBeVisible({ timeout: 30_000 })
  const folioRecl = (await filaRecl.locator('td').first().innerText()).trim()
  await expect(filaRecl.getByText('GALERIAS-TRA-000002')).toBeVisible()
  await expect(filaRecl.getByText('Autorizada', { exact: true })).toBeVisible()
  await v.narrar(page, `Ahora las reclamaciones de traspaso. Aquí está ${folioRecl.replace(/-/g, ' ')}: la pieza que faltó cuando el traspaso Galerías T R A cero cero cero cero cero dos llegó a Centenario con una pieza de menos. Una columna dice de qué traspaso viene, y como Administración ya la resolvió aparece autorizada. Quedó guardada con su motivo y su traspaso. Para ver cómo se resuelve una pendiente, se genera una nueva.`, 0)
  await v.cambiarSede(page, 'Pie Clinic Galerías')
  await v.irA(page, /^Traspasos$/)
  const modal = await crearTraspaso(page, 'Pie Clinic Galerías', 'Pie Clinic Centenario', [{ sku: 'PF-AM-002', nombre: 'Esmalte antimicótico', cantidad: 2 }], (t, e) => v.narrar(page, t, e))
  await modal.getByRole('button', { name: 'Enviar traspaso' }).click()
  const detalle = page.getByRole('dialog').last()
  await expect(detalle.getByText(/Enviado \(en tránsito\)/).first()).toBeVisible({ timeout: 45_000 })
  const folioTra = (await detalle.locator('h2, h3, [class*=title]').first().innerText()).replace('Traspaso', '').trim()
  await v.narrar(page, `Se envían dos esmaltes de Galerías a Centenario en el traspaso ${folioTra.replace(/-/g, ' ')}.`, 0)
  await page.keyboard.press('Escape').catch(() => {})
  await v.cambiarSede(page, SEDE)
  await page.getByText(folioTra, { exact: false }).first().click()
  await page.getByRole('dialog').last().getByRole('button', { name: 'Recibir en destino' }).click()
  const recep = page.getByRole('dialog').last()
  await recep.locator('tbody tr').first().locator('input[type=number]').fill('1')
  await escribir(recep.locator('tbody tr').first().locator('input:not([type=number])'), 'Faltante: llegó 1 pieza, falta 1 en la caja')
  await v.narrar(page, 'En Centenario llega una sola pieza. Se captura uno como cantidad recibida, con el motivo del faltante, y se confirma con diferencia.', 0)
  await recep.getByRole('button', { name: /Confirmar y reportar diferencia/ }).click()
  await expect(page.getByRole('dialog').last().getByText(/Recibido con diferencias/).first()).toBeVisible({ timeout: 45_000 })
  await page.keyboard.press('Escape').catch(() => {})
  await v.irA(page, /^Mermas y conteos$/)
  const filaPend = page.locator('tbody tr', { hasText: folioTra }).first()
  await expect(filaPend).toBeVisible({ timeout: 45_000 })
  await expect(filaPend.getByText('Pendiente', { exact: true })).toBeVisible()
  const folioPend = (await filaPend.locator('td').first().innerText()).trim()
  await v.narrar(page, `Apareció la reclamación ${folioPend.replace(/-/g, ' ')}, de ese traspaso, pendiente.`, 0)
  await filaPend.getByRole('button', { name: 'Autorizar' }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg.getByText(/no vuelve a descontar inventario/)).toBeVisible()
  await v.narrar(page, 'Al resolverla, el sistema avisa que se reconoce la reclamación y que no vuelve a descontar inventario, porque la pieza nunca llegó a entrar.', 0)
  await dlg.getByRole('button', { name: 'Autorizar', exact: true }).click()
  await expect(page.locator('tbody tr', { hasText: folioTra }).getByText('Autorizada', { exact: true })).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'La reclamación queda resuelta y autorizada.', 0)

  // ───────── Inventario después ─────────
  await v.irA(page, /^Inventario$/)
  const d1 = await existencia(page, sku1), d2 = await existencia(page, sku2)
  expect(d1).toBe(e1 - 1)
  expect(d2).toBe(contadoSep)
  await v.narrar(page, `En el inventario, las fresas bajaron de ${e1} a ${d1} por la merma, y los separadores de silicona quedaron en ${d2} por el conteo físico. La reclamación del traspaso no movió el inventario. Fin de la prueba.`)
  await v.terminar(page, { folioMerma, folioConteo, folioRecl, folioPend, folioTra, fresas: [e1, d1], separadores: [e2, d2] })
})
