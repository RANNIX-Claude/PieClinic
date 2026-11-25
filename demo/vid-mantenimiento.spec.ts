// Video Mantenimiento: alta de equipo, solicitud (OT), autorización, atención, cierre con costo real y presupuesto del mes.
// Correr: PW_LOTE=E BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-mantenimiento
import { test, expect } from '@playwright/test'
import { crearVideo } from './lib/video'

const v = crearVideo('vid-mantenimiento')
const SEDE = 'Pie Clinic Centenario'
const EQUIPO = 'Autoclave de vapor QA-E'
const FALLA = 'La autoclave no alcanza la presión de esterilización (video QA)'

test('Mantenimiento: equipo, orden de trabajo, presupuesto y cierre', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de mantenimiento de Pie Clinic: del alta de un equipo al cierre de su orden de trabajo.', 'm@g.com', 'la persona de administración')
  await v.irA(page, /^Mantenimiento$/)
  const cuerpo = async () => await page.locator('main').first().innerText()
  const dato = async (re: RegExp) => { await expect.poll(async () => (await cuerpo()).match(re)?.[1], { timeout: 45_000 }).toBeTruthy(); return (await cuerpo()).match(re)![1] }
  const abiertas = await dato(/Abiertas\s*(\d+)/)
  await v.narrar(page, `Esta es la pantalla de mantenimiento de la sede ${SEDE}. Arriba están las cifras: hay ${abiertas} órdenes abiertas, las urgentes, el costo del mes y los equipos con servicio vencido.`)

  // ───── Alta de equipo ─────
  await page.getByRole('tab', { name: 'Equipo e instrumental' }).click()
  await page.waitForTimeout(2500)
  await v.narrar(page, 'En la pestaña de equipo e instrumental se lleva el calendario de servicio de cada aparato. Vamos a dar de alta una autoclave.', 0)
  await page.getByRole('button', { name: /Nuevo equipo/ }).click()
  const eq = page.getByRole('dialog').last()
  await eq.getByLabel('Nombre').fill(EQUIPO)
  const cat = eq.getByLabel('Categoría')
  const cats = await cat.locator('option').allInnerTexts()
  const catEq = cats.find(c => /equipo|esteril|instrum/i.test(c)) ?? cats[1]
  await cat.selectOption({ label: catEq })
  await eq.getByLabel('Marca').fill('Tuttnauer')
  await eq.getByLabel('Modelo').fill('3870EA')
  await eq.getByLabel('Serie').fill('QA-E-0001')
  await eq.getByLabel('Último servicio').fill('2026-09-01')
  await eq.getByLabel('Periodicidad (días)').fill('90')
  await v.narrar(page, `Se captura el nombre, la categoría ${catEq}, marca, modelo y serie. Con el último servicio del primero de septiembre y una periodicidad de noventa días, el sistema calcula solo el próximo servicio.`, 0)
  await eq.getByRole('button', { name: 'Guardar' }).click()
  const filaEq = page.locator('tr', { hasText: EQUIPO }).first()
  await expect(filaEq).toBeVisible({ timeout: 45_000 })
  const proximo = (await filaEq.innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, 'El equipo queda registrado. En la tabla aparece con su próximo servicio y su estado vigente.')
  expect(proximo).toMatch(/vigente/i)

  // ───── Solicitud ─────
  await page.getByRole('tab', { name: /Solicitudes y órdenes/ }).click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: /Nueva solicitud/ }).click()
  const ot = page.getByRole('dialog').last()
  await v.narrar(page, 'Ahora la autoclave presenta una falla. Cualquier persona de la clínica puede levantar una solicitud; aquí se hace con la cuenta de administración.', 0)
  const catOt = ot.getByLabel('Categoría')
  const catsOt = await catOt.locator('option').allInnerTexts()
  const catOtSel = catsOt.find(c => /equipo|esteril|instrum/i.test(c)) ?? catsOt[1]
  await catOt.selectOption({ label: catOtSel })
  await ot.getByLabel('Equipo ligado (opcional)').selectOption({ label: EQUIPO })
  await ot.getByLabel('Qué reparar').fill(FALLA)
  await ot.getByLabel('Costo estimado (MXN, opcional)').fill('2500')
  await v.narrar(page, `Se elige la categoría ${catOtSel}, se liga el equipo recién dado de alta, se describe la falla y se estima un costo de dos mil quinientos pesos. El tipo es normal.`, 0)
  await ot.getByRole('button', { name: 'Enviar solicitud' }).click()
  const filaOt = page.locator('tr', { hasText: FALLA }).first()
  await expect(filaOt).toBeVisible({ timeout: 45_000 })
  const folio = (await filaOt.locator('b').first().innerText()).trim()
  await v.narrar(page, `La base de datos asigna el folio ${folio.replace(/-/g, ' ')} y la orden queda en estado solicitado, esperando autorización.`)

  // ───── Autorizar, iniciar, cerrar ─────
  await filaOt.click()
  const det = page.getByRole('dialog').last()
  await expect(det.getByRole('button', { name: 'Autorizar' })).toBeVisible()
  await v.narrar(page, 'Al abrir la orden se ve su detalle, las evidencias y el historial. Solo administración puede autorizar o rechazar. Se autoriza.', 0)
  await det.getByRole('button', { name: 'Autorizar' }).click()
  await expect(det.getByRole('button', { name: 'Iniciar atención' })).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'Autorizada. Ahora se inicia la atención, y el historial va registrando cada cambio de estado con su fecha.', 0)
  await det.getByRole('button', { name: 'Iniciar atención' }).click()
  await expect(det.getByRole('button', { name: 'Cerrar orden' }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await v.narrar(page, 'La orden está en proceso. Cuando el técnico termina, se cierra con el costo real, que es obligatorio.', 0)
  await det.getByRole('button', { name: 'Cerrar orden' }).first().click()
  const cierre = page.getByRole('dialog').last()
  await cierre.getByLabel('Costo real (MXN)').fill('2850')
  await cierre.getByLabel('Resultado').fill('Se cambió el empaque de la puerta y se calibró la presión')
  await v.narrar(page, 'Costo real de dos mil ochocientos cincuenta pesos, y el resultado: se cambió el empaque y se calibró la presión. Al cerrar, el equipo vuelve a vigente y se recalcula su próximo servicio.', 0)
  await cierre.getByRole('button', { name: 'Cerrar orden' }).click()
  await expect(page.getByText(/Orden cerrada/).first()).toBeVisible({ timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Cerradas', exact: false }).first().click()
  await expect(page.locator('tr', { hasText: FALLA }).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, `En el filtro de cerradas aparece la orden ${folio.replace(/-/g, ' ')} con su costo real de dos mil ochocientos cincuenta pesos.`)

  // ───── Presupuesto ─────
  await page.getByRole('tab', { name: /^Presupuesto/ }).click()
  await page.waitForTimeout(2500)
  await v.narrar(page, 'En la pestaña de presupuesto se compara, por sede y por mes, el costo real de las órdenes cerradas contra lo presupuestado.', 0)
  await page.getByRole('button', { name: /Presupuesto del mes/ }).click()
  const pr = page.getByRole('dialog').last()
  await pr.getByLabel('Sede').selectOption({ label: SEDE })
  await pr.getByLabel('Monto (MXN)').fill('5000')
  await pr.getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(3000)
  const filaPr = page.locator('tr', { hasText: SEDE }).first()
  await expect(filaPr).toBeVisible({ timeout: 30_000 })
  const txt = (await filaPr.innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `Se fija un presupuesto de cinco mil pesos para ${SEDE}. La fila del mes muestra: ${txt}. La diferencia se pinta en rojo si el costo rebasa el presupuesto. Fin del recorrido de mantenimiento.`)
  await v.terminar(page, { folio, equipo: EQUIPO, fila: txt })
})
