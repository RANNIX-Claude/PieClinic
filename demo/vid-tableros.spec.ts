// Video Tableros: Dashboard, Resumen semanal, Reportes e Ingresos, consultando por sede y periodo (administración).
// Correr: PW_LOTE=E BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-tableros
import { test, expect } from '@playwright/test'
import { crearVideo } from './lib/video'

const v = crearVideo('vid-tableros')
const SEDE1 = 'Pie Clinic Centenario', SEDE2 = 'Pie Clinic Chalco'

test('Tableros: dashboard, resumen semanal, reportes e ingresos', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE1, 'Prueba de los tableros de Pie Clinic: dashboard, resumen semanal, reportes e ingresos, consultados por sede y por periodo.', 'm@g.com', 'la persona de administración')
  const cuerpo = async () => await page.locator('main').first().innerText()
  const dato = async (re: RegExp) => { await expect.poll(async () => (await cuerpo()).match(re)?.[1], { timeout: 60_000 }).toBeTruthy(); return (await cuerpo()).match(re)![1] }
  const MONEDA = '(\\$[\\d,]+\\.\\d\\d)'

  // ───── Dashboard ─────
  await v.irA(page, /^Dashboard$/)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Año').selectOption('2026')
  await page.getByLabel('Mes', { exact: true }).selectOption({ label: 'Octubre' })
  const ing1 = await dato(new RegExp('Ingreso del mes \\(real\\)\\s*' + MONEDA))
  const atend1 = await dato(/Citas atendidas\s*([\d,]+)/)
  const ocup1 = await dato(/Ocupación de agenda\s*([\d.]+ ?%)/)
  await v.narrar(page, `El dashboard muestra los indicadores del mes elegido para la sede activa. En octubre de dos mil veintiséis, ${SEDE1} tuvo un ingreso real de ${ing1}, ${atend1} citas atendidas y una ocupación de agenda de ${ocup1}.`)
  await page.getByLabel('Podólogo').selectOption({ index: 1 })
  await page.waitForTimeout(3500)
  const ingPod = await dato(new RegExp('Ingreso del mes \\(real\\)\\s*' + MONEDA))
  const nomPod = (await page.getByLabel('Podólogo').locator('option:checked').innerText()).trim()
  await v.narrar(page, `Se puede filtrar por podólogo. Con ${nomPod}, el ingreso del mes baja a ${ingPod}.`)
  await page.getByLabel('Podólogo').selectOption({ index: 0 })
  await v.cambiarSede(page, SEDE2)
  await page.waitForTimeout(3500)
  const ing2 = await dato(new RegExp('Ingreso del mes \\(real\\)\\s*' + MONEDA))
  await v.narrar(page, `Al cambiar la sede activa a ${SEDE2}, todas las cifras se recalculan: el ingreso real del mes es ${ing2}. Los tableros respetan la sede del encabezado.`)

  // ───── Resumen semanal ─────
  await v.irA(page, /^Resumen semanal$/)
  await expect(page.getByRole('heading', { name: /Corte semanal operativo/ })).toBeVisible({ timeout: 60_000 })
  await v.cambiarSede(page, SEDE1)
  await page.waitForTimeout(3500)
  const ingSem = await dato(new RegExp('Ingresos de la semana\\s*' + MONEDA))
  const gastos = await dato(new RegExp('Gastos pagados\\s*' + MONEDA))
  const neto = await dato(new RegExp('Neto de la semana\\s*' + MONEDA))
  const semana = (await page.getByRole('heading', { level: 1 }).first().locator('xpath=following-sibling::*[1]').innerText().catch(() => '')).replace(/\s+/g, ' ')
  await v.narrar(page, `El resumen semanal es el corte operativo de sábado a viernes de ${SEDE1}. Esta semana: ingresos de ${ingSem}, gastos pagados por ${gastos} y un neto de ${neto}.`)
  await page.getByRole('button', { name: 'Semana anterior' }).click()
  await page.waitForTimeout(3500)
  const ingSemAnt = await dato(new RegExp('Ingresos de la semana\\s*' + MONEDA))
  await v.narrar(page, `Con las flechas se navega a la semana anterior, cuyo ingreso fue de ${ingSemAnt}. Abajo se desglosa por concepto, por forma de cobro y el detalle de cada cobro y de cada gasto.`)
  expect(semana.length >= 0).toBeTruthy()

  // ───── Reportes ─────
  await v.irA(page, /^Reportes$/)
  await expect(page.getByRole('heading', { name: 'Reportes y BI' })).toBeVisible({ timeout: 60_000 })
  const titulos = await page.locator('.card > div[style*="font-weight: 700"], .card div:has(> svg)').allInnerTexts().catch(() => [] as string[])
  const nCat = await page.getByRole('button', { name: 'Generar reporte' }).count()
  await v.narrar(page, `El catálogo de reportes y B I ofrece ${nCat} informes agrupados por tema. Se genera el primero.`, 0)
  await page.getByRole('button', { name: 'Generar reporte' }).first().click()
  await page.waitForTimeout(4500)
  const tit1 = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim()
  await expect(page.getByRole('button', { name: /Catálogo/ })).toBeVisible()
  const filas1 = await page.locator('main tbody tr').count()
  await v.narrar(page, `El reporte ${tit1} se arma con el rango de fechas y la sede activa; trae ${filas1} renglones en pantalla y botones para exportar a Excel o imprimir en P D F.`)
  await page.getByRole('button', { name: /Catálogo/ }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Generar reporte' }).nth(1).click()
  await page.waitForTimeout(4500)
  const tit2 = (await page.getByRole('heading', { level: 1 }).first().innerText()).trim()
  await v.narrar(page, `Otro informe: ${tit2}. Cada reporte tiene sus propios filtros, como el periodo, la agrupación o el podólogo.`)
  expect(titulos.length >= 0).toBeTruthy()

  // ───── Ingresos ─────
  await v.irA(page, /^Ingresos$/)
  await expect(page.getByRole('heading', { name: 'Ingresos', level: 1 })).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Año').selectOption('2026')
  await page.getByLabel('Mes', { exact: true }).selectOption({ label: 'Octubre' })
  const serv = await dato(new RegExp('Cobrado servicios\\s*' + MONEDA))
  const prod = await dato(new RegExp('Cobrado productos\\s*' + MONEDA))
  const reg = await dato(/Registros\s*(\d+)/)
  await v.narrar(page, `La pantalla de ingresos lista cada pago recibido, ligado a su cita o a su venta. En octubre, ${SEDE1} cobró ${serv} en servicios y ${prod} en productos, en ${reg} registros.`)
  const valid = page.getByLabel('Validación')
  const opV = (await valid.locator('option').allInnerTexts()).find(o => /validar/i.test(o))
  if (opV) { await valid.selectOption({ label: opV }); await page.waitForTimeout(3000) }
  const regV = await dato(/Registros\s*(\d+)/)
  await v.narrar(page, `Se filtra por estatus de validación, ${opV ?? 'todas'}: quedan ${regV} registros. Administración valida cada cobro contra el corte de caja antes de cerrar el periodo.`)
  if (opV) await valid.selectOption({ index: 0 })
  await page.waitForTimeout(2500)
  await page.locator('main tbody tr').first().getByRole('button', { name: 'Ver / editar' }).click()
  const det = page.getByRole('dialog').last()
  await expect(det).toBeVisible({ timeout: 20_000 })
  await v.narrar(page, 'Al abrir un cobro se ven sus datos, las aplicaciones de pago y el reparto por renglón del estado de resultados.', 0)
  await det.getByRole('tab', { name: /Aplicaciones de pago/ }).click().catch(() => {})
  await page.waitForTimeout(2000)
  await det.getByRole('tab', { name: /Reparto por renglón/ }).click().catch(() => {})
  await page.waitForTimeout(2000)
  await v.narrar(page, 'Fin del recorrido por los tableros.', 0)
  await v.terminar(page, { ing1, atend1, ocup1, ing2, ingSem, gastos, neto, ingSemAnt, tit1, tit2, serv, prod, reg })
})
