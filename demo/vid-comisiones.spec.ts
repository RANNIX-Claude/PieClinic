// Video VID-D1: comisiones de los podólogos. Esquemas y metas, y cómo UNA venta de caja con un podólogo que atendió genera su comisión
// (caja → ingreso validado → carga del detalle en el periodo → comisión por esquema). Lote D.
// Correr: PW_LOTE=D BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-comisiones
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras, escribir } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const PODOLOGO = 'Julián Cano Soto'
const SERVICIO = 'Uña encarnada'
const v = crearVideo('vid-comisiones')

test('Comisiones: esquemas, metas y la comisión que nace de una venta de caja', async ({ page, context }) => {
  test.setTimeout(25 * 60_000)
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de comisiones de Pie Clinic. Caso: cómo se pagan las comisiones de los podólogos, a partir de los esquemas que fija la clínica y de las ventas de caja en las que el podólogo atendió.', 'm@g.com', 'la persona administradora')
  await v.irA(page, /^Comisiones$/)
  await v.narrar(page, 'Esta es la pantalla de comisiones y productividad por podólogo. El resumen muestra el periodo, la base comisionable, la comisión de cada podólogo y quién tuvo la mayor productividad. Todo se calcula solo de ingresos ya validados.', 0)

  // 1. Esquemas
  await page.getByRole('tab', { name: /Esquemas por podólogo/ }).or(page.getByRole('button', { name: /Esquemas por podólogo/ })).first().click()
  await page.waitForTimeout(3000)
  await expect(page.getByText('Los porcentajes los fija el cliente')).toBeVisible()
  const fila = page.locator('tr', { hasText: PODOLOGO }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const celdas = (await fila.locator('td').allInnerTexts()).map(s => s.trim())
  const [, esquema, tipo, pctServ, pctProd, pctPlan] = celdas
  await fila.scrollIntoViewIfNeeded()
  await v.narrar(page, `Primero los esquemas. Cada podólogo tiene su esquema con vigencia, y los porcentajes los define la clínica: el sistema no inventa ninguno. Por ejemplo ${PODOLOGO}: esquema ${esquema}, tipo ${tipo}; ${pctServ} sobre servicios, ${pctProd} sobre productos y ${pctPlan} sobre las sesiones de un plan.`, 0)
  await v.narrar(page, 'Un esquema nuevo cierra el anterior el día previo, y lo que ya se comisionó no se recalcula. Existen cuatro tipos: porcentaje sobre el servicio, porcentaje más viático por cita, sueldo más bono y renta de cabina; y puede llevar un piso mínimo por periodo.', 0)

  // 2. Metas
  await page.getByRole('tab', { name: /^Metas$/ }).or(page.getByRole('button', { name: /^Metas$/ })).first().click()
  await page.waitForTimeout(3000)
  const nMetas = await page.locator('tbody tr').count()
  await v.narrar(page, `En la pestaña Metas se fijan las metas de ocupación y de ingreso, por sede o por podólogo, con su periodo. Hoy hay ${nMetas} renglones en la tabla; el podólogo ve las suyas y las de su sede.`, 0)

  // 3. Venta de caja con el podólogo que atendió
  await v.narrar(page, 'Ahora, cómo nace una comisión. Todo empieza en la caja: una venta donde se indica qué podólogo atendió.', 0)
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(3500)
  await expect(page.getByText(/sede .* turno abierto|sin turno abierto/i).first()).toBeVisible({ timeout: 30_000 })
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false)) {
    await v.narrar(page, 'Esta cuenta todavía no tiene turno abierto. La Caja 1 ya la usa otra persona, así que se abre la Caja 2 con su fondo inicial.', 0)
    await page.getByLabel('Caja', { exact: true }).fill('Caja 2'); await page.getByLabel('Fondo inicial').fill('1000'); await abrir.click(); await page.waitForTimeout(3500)
  }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('F2')
  await page.locator('.cj-buscar-in').pressSequentially('uña encarn', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: SERVICIO }).first().click()
  await page.waitForTimeout(1500)
  const importe = dinero(await page.locator('.cj-linea .cj-imp b').first().innerText())
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  await v.narrar(page, `Se busca con F2 y se agrega el servicio ${SERVICIO}, por ${letras(total)} pesos. Ahora se indica qué podólogo atendió, en el panel de paciente, factura y descuento.`, 0)
  await page.getByRole('button', { name: /Paciente · factura · descuento/ }).click()
  await page.waitForTimeout(1200)
  await page.getByLabel('Podólogo que atendió').selectOption({ label: PODOLOGO })
  await v.narrar(page, `Se elige al podólogo que atendió: ${PODOLOGO}. El sistema guarda quién atendió en cada renglón de la venta, y de ahí sale su comisión. Se cobra en efectivo.`, 0)
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
  await v.narrar(page, `Se cobró el ticket ${folio.replace(/-/g, ' ')}. El cobro genera un ingreso, que nace por validar: la comisión solo se paga sobre dinero que administración ya validó.`)

  // 4. Validar el ingreso
  await v.irA(page, /^Ingresos$/)
  await page.waitForTimeout(2500)
  await page.getByPlaceholder(/Buscar paciente, concepto o folio/).pressSequentially(folio, { delay: 80 })
  await page.waitForTimeout(2000)
  let filaIng = page.locator('tbody tr').filter({ hasText: /Por validar/ }).first()
  if (!(await filaIng.isVisible().catch(() => false))) {
    // la búsqueda por folio no encuentra el ticket: se filtra por podólogo y por validar
    await page.getByPlaceholder(/Buscar paciente, concepto o folio/).fill('')
    await page.locator('select', { hasText: 'Podólogo: todos' }).selectOption({ label: PODOLOGO })
    await page.locator('select', { hasText: 'Validación: todas' }).selectOption({ label: 'Por validar' })
    await page.waitForTimeout(2000)
    filaIng = page.locator('tbody tr').filter({ hasText: /Por validar/ }).filter({ hasText: letras(total).split('.')[0] }).first()
  }
  await expect(filaIng).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, `En Ingresos aparece el cobro de ${letras(importe)} pesos del podólogo ${PODOLOGO}, con estatus por validar. Administración lo revisa y lo valida.`, 0)
  await filaIng.getByTitle('Validar').click()
  await expect(page.getByText(/Cobro actualizado|cobros actualizados/).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  await v.narrar(page, 'El ingreso queda validado. Un cobro validado ya no cambia de monto ni de fecha: es la base firme sobre la que se calcula la comisión.', 0)

  // 5. Periodo y carga del detalle
  await v.irA(page, /^Comisiones$/)
  await page.waitForTimeout(2500)
  await v.narrar(page, 'De vuelta en comisiones. La venta es de noviembre y todavía no existe un periodo de comisiones para este mes, así que se crea. El sistema propone el mes completo.', 0)
  await page.getByRole('button', { name: /Nuevo periodo/ }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg.getByLabel('Desde')).toHaveValue(/^2026-11-01$/)
  const hasta = await dlg.getByLabel('Hasta').inputValue()
  await page.waitForTimeout(1500)
  await dlg.getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByText('Periodo creado')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  await page.getByRole('tab', { name: /Cargar detalle/ }).or(page.getByRole('button', { name: /Cargar detalle/ })).first().click()
  await page.waitForTimeout(1500)
  await v.narrar(page, `Se abre Cargar detalle. Esta pantalla trae las ventas cobradas del primero de noviembre al ${hasta.slice(8)} atendidas por podólogos y con ingreso validado. Cada venta se registra una sola vez, y el porcentaje sale del esquema vigente a la fecha del servicio.`, 0)
  await page.getByRole('button', { name: 'Buscar ventas validadas' }).click()
  const tabla = page.locator('table').last()
  const filaCom = tabla.locator('tbody tr', { hasText: PODOLOGO }).first()
  await expect(filaCom).toBeVisible({ timeout: 60_000 })
  const tipoDet = (await filaCom.locator('td').nth(3).innerText()).trim()
  const conceptoDet = (await filaCom.locator('td').nth(4).innerText()).trim()
  const baseDet = (await filaCom.locator('td').nth(5).innerText()).trim()
  const aviso = (await filaCom.locator('td').nth(6).innerText()).trim()
  await filaCom.scrollIntoViewIfNeeded()
  await v.narrar(page, `Aparece la venta del ticket: podólogo ${PODOLOGO}, tipo ${tipoDet}, concepto ${conceptoDet}, con una base de ${baseDet} pesos, que es el cobrado sin IVA y neto de descuentos. El aviso dice: ${aviso}. Si el podólogo no tuviera un esquema vigente, el sistema bloquearía el registro.`, 0)
  const resumenSel = (await page.locator('div', { hasText: /renglón\(es\) · base/ }).last().innerText()).replace(/\s+/g, ' ')
  await page.getByRole('button', { name: 'Registrar en el periodo' }).click()
  await expect(page.getByText(/registrados; la comisión se recalculó/)).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Se pulsa Registrar en el periodo, y el sistema registra el renglón y recalcula la comisión.', 0)

  // 6. Resultado
  await page.getByRole('tab', { name: /^Resumen$/ }).or(page.getByRole('button', { name: /^Resumen$/ })).first().click()
  await page.waitForTimeout(3500)
  const filaRes = page.locator('tbody tr', { hasText: PODOLOGO }).first()
  await expect(filaRes).toBeVisible({ timeout: 30_000 })
  const c = (await filaRes.locator('td').allInnerTexts()).map(s => s.trim())
  // columnas: podólogo, sede, citas, ingreso servicios, venta productos, planes, base, esquema, ajustes, viático, comisión
  const [, sedeR, citasR, servR, , , baseR, esqR, , , comR] = c
  await v.narrar(page, `En el resumen del periodo, ${PODOLOGO} ya tiene su fila: ingreso por servicios de ${servR}, base comisionable de ${baseR}, esquema ${esqR}, y una comisión de ${comR} pesos.`, 0)
  await filaRes.click()
  await page.waitForTimeout(2500)
  const det = page.locator('.card', { hasText: `Detalle · ${PODOLOGO}` })
  await expect(det).toBeVisible()
  await det.scrollIntoViewIfNeeded()
  const d = (await det.locator('tbody tr').first().locator('td').allInnerTexts()).map(s => s.trim())
  const [fechaD, tipoD, conceptoD, baseD, pctD, comD] = d
  await v.narrar(page, `Al hacer clic en el podólogo se ve el detalle de dónde salió: el ${fechaD}, ${tipoD} ${conceptoD}, base de ${baseD} pesos, a ${pctD}, da una comisión de ${comD} pesos. Es la venta de caja que se cobró en este video.`, 0)
  expect(dinero(comD)).toBeCloseTo(dinero(baseD) * dinero(pctD) / 100, 1)
  await v.narrar(page, 'Mientras el periodo está por cerrar, se pueden cargar más ventas. Al cerrarlo, queda de solo lectura, entra a la nómina de la quincena, y los ajustes posteriores, como una cancelación, van al siguiente periodo con referencia. Fin del caso.')
  await v.terminar(page, { folio, total, importe, esquema, tipo, pctServ, pctProd, pctPlan, tipoDet, baseDet, comR, comD, pctD, resumenSel, hasta, sedeR, citasR })
})
