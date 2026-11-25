// Video Nómina y recibos: calcular la prenómina de un periodo, revisar totales y abrir el recibo de un empleado.
// Correr: PW_LOTE=E BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-nomina-recibos
import { test, expect } from '@playwright/test'
import { crearVideo, escribir } from './lib/video'

const v = crearVideo('vid-nomina-recibos')
const EMPLEADO = 'Karen Montes Lira'

test('Nómina: calcular periodo y ver recibo', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, 'Todas las sedes', 'Prueba de nómina y recibos de Pie Clinic: calcular la nómina de un periodo y consultar el recibo de un empleado.', 'm@g.com', 'la persona de administración')
  await v.irA(page, /RH y nómina/)
  await page.getByRole('tab', { name: 'Nómina', exact: true }).click()
  await page.waitForTimeout(3500)
  const cuerpo = async () => await page.locator('main').first().innerText()
  const dato = async (re: RegExp) => { await expect.poll(async () => (await cuerpo()).match(re)?.[1], { timeout: 45_000 }).toBeTruthy(); return (await cuerpo()).match(re)![1] }
  await v.narrar(page, 'En la pestaña de nómina se trabaja por periodos: semanal, quincenal o mensual. El periodo pasa por los estados creado, calculado, autorizado y pagado.')

  // Elegir el periodo creado (sin calcular) 16–31 de octubre
  const selPeriodo = page.getByLabel('Periodo', { exact: true })
  const ops = await selPeriodo.locator('option').allInnerTexts()
  const creado = ops.find(o => /creado/.test(o))
  expect(creado, `Periodo creado entre ${ops}`).toBeTruthy()
  await selPeriodo.selectOption({ label: creado! })
  await page.waitForTimeout(2000)
  await expect(page.getByText(/Prenómina vacía/)).toBeVisible()
  await v.narrar(page, `El periodo ${creado!.replace(' · creado', '')} está creado pero todavía sin calcular: la prenómina aparece vacía y los totales en cero.`, 0)
  await v.narrar(page, 'Al pulsar calcular, el sistema toma el salario de cada empleado, las comisiones de los periodos cerrados, la asistencia y las incidencias que descuentan.', 0)
  await page.getByRole('button', { name: /Calcular/ }).click()
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(3000)
  const empleados = await dato(/Empleados\s*(\d+)/)
  const neto = await dato(/Neto a pagar\s*(\$[\d,]+\.\d\d)/)
  const percep = await dato(/Percepciones\s*(\$[\d,]+\.\d\d)/)
  const deduc = await dato(/Deducciones\s*(\$[\d,]+\.\d\d)/)
  expect(empleados && Number(empleados) > 0).toBeTruthy()
  await v.narrar(page, `La prenómina quedó calculada para ${empleados} empleados. Percepciones por ${percep}, deducciones por ${deduc} y un neto a pagar de ${neto}.`)
  await v.narrar(page, 'Cada renglón desglosa salario, comisión, bono, subsidio, descuento por incidencias, IMSS, ISR y neto. El IMSS, el ISR y el subsidio se capturan a mano mientras no se timbre la nómina, y el CFDI de nómina no aplica en esta fase.')
  const estado = await page.getByText(/^calculada$/i).first().isVisible().catch(() => false)
  await v.narrar(page, `El periodo ${estado ? 'cambió a calculada' : 'queda calculado'} y se puede exportar para el contador. Para esta prueba no se autoriza, porque al autorizar los montos se congelan y ya no se puede recalcular.`, 0)

  // Recibos de un periodo autorizado
  await page.getByRole('tab', { name: 'Recibos firmados', exact: true }).click()
  await page.waitForTimeout(3500)
  const rec = await dato(/Reciboss*(d+)/), sin = await dato(/Sin firmars*(d+)/), fir = await dato(/Firmadoss*(d+)/)
  await v.narrar(page, `Los recibos se generan cuando la nómina de un periodo se autoriza. Aquí administración ve ${rec} recibos: ${sin} sin firmar y ${fir} firmados. Cada empleado firma el suyo de conformidad desde su cuenta.`)
  await page.getByPlaceholder('Buscar…').fill('Karen')
  await page.waitForTimeout(1500)
  const fila = page.locator('tr', { hasText: EMPLEADO }).first()
  await expect(fila).toBeVisible()
  const resumen = (await fila.innerText()).replace(/\s+/g, ' ').replace('Ver', '').trim()
  await v.narrar(page, `Se busca a ${EMPLEADO}. Su recibo más reciente dice: ${resumen}. Se abre con el botón ver.`, 0)
  await fila.getByRole('button', { name: 'Ver' }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg.getByText('NETO A PAGAR')).toBeVisible()
  const txtRec = (await dlg.innerText())
  const netoRec = txtRec.match(/NETO A PAGAR\s*(\$[\d,]+\.\d\d)/)?.[1]
  const totPer = txtRec.match(/Total percepciones\s*(\$[\d,]+\.\d\d)/)?.[1]
  const totDed = txtRec.match(/Total deducciones\s*(\$[\d,]+\.\d\d)/)?.[1]
  await v.narrar(page, `El recibo muestra los datos del empleado, el periodo y los días trabajados, luego las percepciones, con un total de ${totPer}, las deducciones, con un total de ${totDed}, y el neto a pagar de ${netoRec}. Tiene el botón de imprimir y aclara que es una prenómina informativa, no un CFDI.`)
  await expect(dlg.getByText(/no es un CFDI/)).toBeVisible()
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByRole('button', { name: 'Cerrar' }).last().click().catch(() => {})
  // Vista del empleado: cuenta de podólogo
  await v.narrar(page, 'Ahora la vista del empleado. Se cierra la sesión de administración y firma una podóloga con su cuenta.', 0)
  await context.clearCookies()
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await page.goto('/app/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  await escribir(page.locator('#pf-email'), 'p@g.com')
  await escribir(page.locator('#pf-pass'), '123456')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await v.irA(page, /Mis recibos/)
  await expect(page.getByText(/Aún no tienes recibos/)).toBeVisible()
  await v.narrar(page, 'La pantalla de mis recibos muestra solo los recibos propios, con el RLS de la base de datos. En esta prueba aparece vacía, porque la cuenta de prueba de podólogo no está ligada a un expediente de empleado. Limitación de los datos de prueba: para ver y firmar un recibo, el usuario debe estar ligado a su empleado. Fin del recorrido.')
  await v.terminar(page, { periodo: creado, empleados, percep, deduc, neto, recibo: resumen, netoRec })
})
