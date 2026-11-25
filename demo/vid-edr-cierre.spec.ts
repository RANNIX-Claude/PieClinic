// Video B5: estado de resultados del periodo (ingresos − gastos − fijos, proy_ manual vs real_ automático) y cierre de periodos.
// Solo LEE y recalcula el real_ (automático); NUNCA escribe proy_.
// Correr: PW_LOTE=B BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-edr-cierre
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Patio'
const v = crearVideo('vid-edr-cierre')

test('Finanzas: estado de resultados y cierre de periodos', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de finanzas de Pie Clinic. El estado de resultados del mes, con lo proyectado contra lo real, y el cierre de periodos.', 'm@g.com', 'la persona de Administración')

  // ───────── EDR del mes anterior, consolidado ─────────
  await v.irA(page, /^Estado de resultados$/)
  await page.getByLabel('Sede', { exact: true }).selectOption({ label: 'Todas las sedes' })
  await page.getByRole('button', { name: /Mes anterior/ }).click()
  await page.waitForTimeout(3500)
  await expect(page.getByText('Utilidad (sin impuestos)').first()).toBeVisible({ timeout: 45_000 })
  const kpi = async (titulo: string) => dinero(await page.getByText(titulo, { exact: true }).first().locator('xpath=../following-sibling::div[1]').innerText())
  const ing = await kpi('Ingresos reales'), gas = await kpi('Gastos reales'), uti = await kpi('Utilidad (sin impuestos)')
  expect(Math.abs(ing - gas - uti)).toBeLessThan(1)
  await v.narrar(page, `El estado de resultados de octubre, de todas las sedes. Los ingresos reales fueron ${letras(ing)} pesos, los gastos reales ${letras(gas)}, y la utilidad sin impuestos ${letras(uti)}: ingresos menos gastos y costos. Es utilidad gerencial; los impuestos se ven aparte con el contador.`)

  // ───────── Proyectado vs real ─────────
  await v.narrar(page, 'La tabla compara cada renglón: a la izquierda lo proyectado, que es de captura manual de Administración, y a la derecha lo real, que el sistema calcula solo desde los ingresos, los gastos y el fondo. El real nunca se teclea; si hay que corregirlo, se agrega un ajuste con motivo.', 0)
  const primerReal = page.locator('table button[title="Ver desglose"]').first()
  await primerReal.click()
  const des = page.getByRole('dialog').last()
  await expect(des.getByText(/Registros que integran el importe real/)).toBeVisible()
  await v.narrar(page, 'Al hacer clic en cualquier cifra real se abre el desglose con los registros que la integran: cada cobro o gasto con su fecha y su sede.')
  await des.locator('button.btn', { hasText: /^Cerrar$/ }).click()

  // ───────── Mes actual con el real recalculado ─────────
  await page.getByRole('button', { name: /Mes actual/ }).click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Recalcular real/ }).click()
  await expect(page.getByText(/Real recalculado desde ingresos, gastos y fondo/)).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(3000)
  const ingN = await kpi('Ingresos reales'), gasN = await kpi('Gastos reales'), utiN = await kpi('Utilidad (sin impuestos)')
  expect(Math.abs(ingN - gasN - utiN)).toBeLessThan(1)
  await v.narrar(page, `En el mes en curso se recalcula el real. Hasta hoy: ingresos ${letras(ingN)} pesos, gastos ${letras(gasN)} y utilidad ${letras(utiN)}. Ahí ya cuentan los gastos y pagos a proveedores capturados en las pruebas anteriores.`, 0)
  await page.getByLabel('Sede', { exact: true }).selectOption({ label: SEDE })
  await page.waitForTimeout(2500)
  await page.getByRole('tab', { name: /En elaboración/ }).click()
  await page.waitForTimeout(2500)
  await expect(page.getByText(/Proyección manual/)).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'En la pestaña de elaboración, la proyección se captura a mano por sede y mes. La columna de real automático y la de ajustes son solo de lectura. En esta prueba no se captura ninguna proyección: lo proyectado nunca lo sobrescribe el código.')

  // ───────── Cierre de periodos ─────────
  await v.irA(page, /^Cierre de periodos$/)
  await expect(page.getByText('Semanas terminadas')).toBeVisible()
  const filaSem = page.locator('.card', { hasText: 'Semanas terminadas' }).locator('tbody tr').first()
  await expect(filaSem).toBeVisible({ timeout: 45_000 })
  const etiqueta = (await filaSem.locator('td').first().innerText()).trim()
  await v.narrar(page, `En Cierre de periodos aparecen las semanas terminadas que todavía no se cierran, de sábado a viernes, para la sucursal ${SEDE}. La más reciente es ${etiqueta.replace('·', ', ')}. Un periodo cerrado queda en solo lectura: no se crean, editan ni borran registros con fecha dentro de él.`, 0)
  await filaSem.getByRole('button', { name: /Cerrar semana/ }).click()
  await v.narrar(page, 'Cerrar congela los totales, y solo Administración puede reabrirlo, con un motivo que queda en la bitácora.', 0)
  await page.getByRole('dialog').last().getByRole('button', { name: 'Cerrar periodo' }).click()
  await expect(page.getByText('Periodo cerrado').first()).toBeVisible({ timeout: 45_000 }).catch(() => {})
  await page.getByRole('tab', { name: /Historial/ }).click()
  await page.waitForTimeout(2000)
  const cerrada = page.locator('tbody tr', { hasText: etiqueta.split('·')[0].trim() }).filter({ hasText: SEDE }).first()
  await expect(cerrada.getByText(/Cerrado/i).first()).toBeVisible({ timeout: 45_000 })
  const t = (await cerrada.locator('td').allInnerTexts()).map(x => x.trim())
  await v.narrar(page, `En el historial queda la semana cerrada, con sus ingresos, gastos y neto congelados. Fin de la prueba.`)
  await v.terminar(page, { semana: etiqueta, sede: SEDE, octubre: { ing, gas, uti }, noviembre: { ingN, gasN, utiN }, fila: t })
})
