// Video VID-D1: comisiones de los podólogos. Esquemas y metas, y cómo UNA venta de caja con un podólogo que atendió genera su comisión
// (caja → ingreso validado → carga del detalle en el periodo → comisión por esquema). Lote D.
// Correr: PW_LOTE=D BASE_URL=http://localhost:5184 npx playwright test -c playwright.caja.config.ts vid-comisiones
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const PODOLOGO = 'Julián Cano Soto'
const SERVICIO = 'Uña encarnada'
const v = crearVideo('vid-comisiones')

test('Comisiones: esquemas, metas y la comisión que nace de una venta de caja', async ({ page, context }) => {
  test.setTimeout(70 * 60_000)
  const T0 = Date.now()
  const N = (texto: string, extra = 0) => { console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${texto.slice(0, 60)}`); return v.narrar(page, texto, extra) }
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de comisiones de Pie Clinic. Caso: cómo se calcula la comisión de un podólogo a partir de su esquema y de una venta de caja en la que él atendió.', 'm@g.com', 'la persona administradora')
  await v.irA(page, /^Comisiones$/)
  await N('Esta es la pantalla de comisiones por podólogo. Todo se calcula solo de ingresos ya validados.')

  // 1. Esquemas
  await page.getByRole('tab', { name: /Esquemas por podólogo/ }).click()
  await page.waitForTimeout(3000)
  const fila = page.locator('tr', { hasText: PODOLOGO }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const celdas = (await fila.locator('td').allInnerTexts()).map(s => s.trim())
  const [, esquema, tipo, pctServ, pctProd, pctPlan] = celdas
  await fila.scrollIntoViewIfNeeded()
  await N(`Primero los esquemas, que fija la clínica: el sistema no inventa porcentajes. Julián Cano Soto tiene el esquema ${esquema}, de tipo ${tipo}: ${pctServ} sobre servicios, ${pctProd} sobre productos y ${pctPlan} sobre sesiones de un plan. Un esquema nuevo cierra el anterior y no recalcula lo ya comisionado.`)

  // 2. Metas
  await page.getByRole('tab', { name: /^Metas$/ }).click()
  await page.waitForTimeout(3000)
  const nMetas = await page.locator('tbody tr').count()
  await N(`En Metas se fijan las metas de ocupación e ingreso por sede o por podólogo. Hoy hay ${nMetas} registros.`)

  // 3. Venta de caja con el podólogo que atendió
  await N('Ahora, cómo nace una comisión. Todo empieza en la caja, con una venta donde se indica qué podólogo atendió.')
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(3500)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false)) {
    await N('Esta cuenta todavía no tiene turno abierto. La Caja 1 ya la usa otra persona, así que se abre la Caja 2 con su fondo inicial.')
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
  await N(`Se agrega el servicio ${SERVICIO}, por ${letras(total)} pesos. Y en el panel de paciente se elige el podólogo que atendió.`)
  await page.getByRole('button', { name: /Paciente · factura · descuento/ }).click()
  await page.waitForTimeout(1200)
  await page.getByLabel('Podólogo que atendió').selectOption({ label: PODOLOGO })
  await page.getByLabel(/Cliente general/).check()
  await N(`Atendió ${PODOLOGO}. El sistema guarda quién atendió en cada renglón de la venta, y de ahí sale su comisión. El cliente no quiere dar su nombre, así que se marca cliente general. Se cobra en efectivo.`)
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
  await N(`Se cobró el ticket ${folio.replace(/-/g, ' ')}. El cobro genera un ingreso que nace por validar: la comisión solo se paga sobre dinero que administración ya validó.`)

  // 4. Validar el ingreso
  await v.irA(page, /^Ingresos$/)
  await page.waitForTimeout(2500)
  await page.getByPlaceholder(/Buscar paciente, concepto o folio/).pressSequentially(folio, { delay: 70 })
  await page.waitForTimeout(2500)
  const filaIng = page.locator('tbody tr').filter({ hasText: `Ticket ${folio}` }).first()
  await expect(filaIng).toBeVisible({ timeout: 40_000 })
  await expect(filaIng.getByText('Por validar')).toBeVisible()
  await N(`En Ingresos se busca el folio del ticket y aparece su cobro de ${letras(importe)} pesos, con estatus por validar. Administración lo valida.`)
  await filaIng.getByTitle('Validar').click()
  await expect(page.getByText(/Cobro actualizado|cobros actualizados/).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  await N('Queda validado. Un cobro validado ya no cambia de monto ni de fecha: es la base firme de la comisión.')

  // 5. Periodo y carga del detalle
  await v.irA(page, /^Comisiones$/)
  await page.waitForTimeout(2500)
  const periodoOpts = await page.locator('select', { hasText: /por cerrar|cerrado/ }).first().locator('option').allInnerTexts()
  const hayPeriodo = periodoOpts.some(t => /01\/11\/2026/.test(t))
  if (!hayPeriodo) {
    await N('La venta es de noviembre y todavía no existe el periodo de comisiones de este mes. Se crea, y el sistema propone el mes completo.')
    await page.getByRole('button', { name: /Nuevo periodo/ }).click()
    const dlg = page.getByRole('dialog').last()
    await expect(dlg.getByLabel('Desde')).toHaveValue(/^2026-11-01$/)
    await page.waitForTimeout(1500)
    await dlg.getByRole('button', { name: 'Crear' }).click()
    await expect(page.getByText('Periodo creado')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(2500)
  } else {
    await page.locator('select', { hasText: /por cerrar|cerrado/ }).first().selectOption({ index: periodoOpts.findIndex(t => /01\/11\/2026/.test(t)) })
    await page.waitForTimeout(2500)
    await N('El periodo de noviembre ya existe, abierto y por cerrar. Se elige en el selector de periodo.')
  }
  await page.getByRole('tab', { name: /Cargar detalle/ }).click()
  await page.waitForTimeout(1500)
  await N('En Cargar detalle, el sistema trae las ventas cobradas del periodo, atendidas por podólogos y con ingreso validado. Cada venta se registra una sola vez, y el porcentaje sale del esquema vigente a la fecha del servicio.')
  await page.getByRole('button', { name: 'Buscar ventas validadas' }).click()
  const filaCom = page.locator('table').last().locator('tbody tr', { hasText: PODOLOGO }).first()
  await expect(filaCom).toBeVisible({ timeout: 60_000 })
  const tipoDet = (await filaCom.locator('td').nth(3).innerText()).trim()
  const conceptoDet = (await filaCom.locator('td').nth(4).innerText()).trim()
  const baseDet = (await filaCom.locator('td').nth(5).innerText()).trim()
  const aviso = (await filaCom.locator('td').nth(6).innerText()).trim()
  await filaCom.scrollIntoViewIfNeeded()
  await N(`Aparece la venta del ticket: ${PODOLOGO}, ${tipoDet}, ${conceptoDet}, con una base de ${baseDet} pesos, que es lo cobrado sin IVA y neto de descuentos. El aviso dice: ${aviso}. Sin esquema vigente, el sistema bloquearía el registro.`)
  await page.getByRole('button', { name: 'Registrar en el periodo' }).click()
  await expect(page.getByText(/registrados; la comisión se recalculó/)).toBeVisible({ timeout: 45_000 })
  await N('Se registra en el periodo, y el sistema recalcula la comisión.')

  // 6. Resultado
  await page.getByRole('tab', { name: /^Resumen$/ }).click()
  await page.waitForTimeout(3500)
  const filaRes = page.locator('tbody tr', { hasText: PODOLOGO }).first()
  await expect(filaRes).toBeVisible({ timeout: 30_000 })
  const c = (await filaRes.locator('td').allInnerTexts()).map(s => s.trim())
  const [, , , servR, , , baseR, esqR, , , comR] = c
  await N(`En el resumen, ${PODOLOGO} tiene ya su fila: ingreso por servicios de ${servR}, base comisionable de ${baseR}, esquema ${esqR}, y comisión de ${comR} pesos.`)
  await filaRes.click()
  await page.waitForTimeout(2500)
  const det = page.locator('.card', { hasText: `Detalle · ${PODOLOGO}` })
  await expect(det).toBeVisible()
  await det.scrollIntoViewIfNeeded()
  const renglones = await det.locator('tbody tr').count()
  const d = (await det.locator('tbody tr').last().locator('td').allInnerTexts()).map(s => s.trim())
  const [fechaD, tipoD, conceptoD, baseD, pctD, comD] = d
  await N(`Al hacer clic en el podólogo se ve de dónde salió, renglón por renglón. Por ejemplo, el ${fechaD}: ${tipoD} ${conceptoD}, base de ${baseD} pesos, a ${pctD}, da ${comD} pesos de comisión.`)
  expect(dinero(comD)).toBeCloseTo(dinero(baseD) * dinero(pctD) / 100, 1)
  await N('Mientras el periodo está por cerrar se pueden cargar más ventas. Al cerrarlo queda de solo lectura y entra a la nómina; los ajustes posteriores, como una cancelación, van al siguiente periodo con referencia. Fin del caso.')
  await v.terminar(page, { folio, total, importe, esquema, tipo, pctServ, pctProd, pctPlan, tipoDet, baseDet, comR, comD, pctD, baseR, renglones, hayPeriodo })
})
