// Video VID-C4: esterilización — bitácora de lotes de autoclave, registro y liberación de un lote nuevo y trazabilidad inversa hacia las consultas.
// Correr: PW_LOTE=C BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-esterilizacion
import { test, expect as expectBase } from '@playwright/test'
import { crearVideo } from './lib/video'
import { firmarCon, iniciarGrabacion } from './lib/video-c'
import path from 'path'

const SEDE = 'Pie Clinic Patio'
test.use({ launchOptions: { slowMo: 150 }, video: 'off' })   // video propio por pantallazos (ver iniciarGrabacion): el webm de Playwright salía truncado con la máquina cargada
const expect = expectBase.configure({ timeout: 45_000 })   // la máquina compartida va lenta: las pantallas tardan en cargar
const v = crearVideo('vid-esterilizacion')

test('Esterilización: lote, liberación y trazabilidad', async ({ page, context }) => {
  test.setTimeout(40 * 60_000)   // la máquina compartida va lenta; la prueba espera la voz de cada marca
  await v.empezar(context)
  const rec = await iniciarGrabacion(page, v.SALIDA)
  await firmarCon(page, v.narrar, 'admin', SEDE, 'Prueba de esterilización de instrumental de Pie Clinic. Caso: se registra un lote de autoclave, se libera con sus indicadores y se consulta la trazabilidad hacia los pacientes atendidos con ese instrumental.')
  await v.irA(page, /^Esterilización$/)
  await expect(page.getByRole('heading', { name: 'Esterilización de instrumental' })).toBeVisible()
  await v.narrar(page, 'Esta es la bitácora de esterilización de la sucursal Pie Clinic Patio, que es la sucursal activa en la parte de arriba. Arriba están los lotes del mes, cuántos se aprobaron, los rechazados o bloqueados y los kits de instrumental en circulación. Abajo, cada lote con su autoclave, el ciclo, la temperatura, la presión y el tiempo, los indicadores y hasta cuándo es estéril.')
  await v.narrar(page, 'Se va a registrar el ciclo de esta mañana. Se pulsa Registrar lote de esterilización.', 0)
  await page.getByRole('button', { name: /Registrar lote de esterilización/ }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg.getByLabel('Autoclave')).toBeVisible({ timeout: 30_000 })

  // Datos del ciclo
  await dlg.getByLabel('Sede', { exact: true }).selectOption({ label: SEDE })
  await expect(dlg.getByLabel('Autoclave').locator('option')).toHaveCount(2)
  await dlg.getByLabel('Autoclave').selectOption({ index: 1 })
  const autoclave = (await dlg.getByLabel('Autoclave').locator('option:checked').innerText()).trim()
  await dlg.getByLabel('Ciclo', { exact: true }).selectOption({ label: 'Instrumental envuelto' })
  await dlg.getByLabel('Hora de inicio').fill('08:00')
  await dlg.getByLabel('Hora de fin').fill('08:35')
  await page.waitForTimeout(600)
  const temp = await dlg.getByLabel('Temperatura (°C)').inputValue(), bar = await dlg.getByLabel('Presión (bar)').inputValue(), min = await dlg.getByLabel('Tiempo (min)').inputValue()
  await v.narrar(page, `Se elige la autoclave ${autoclave.split(' · ')[0]} y el ciclo de instrumental envuelto. Al elegir el ciclo, el sistema propone los parámetros: ${temp} grados, ${bar} bar de presión y ${min} minutos. Se anotan la hora de inicio y la de fin.`, 0)
  await dlg.getByLabel('Indicador químico').selectOption({ label: 'Viró' })
  await dlg.getByLabel('Indicador biológico').selectOption({ label: 'Pendiente (24 h)' })
  const hasta = await dlg.getByLabel('Estéril hasta').inputValue()
  await v.narrar(page, `El indicador químico viró, y el biológico queda pendiente, porque su resultado tarda veinticuatro horas. La fecha hasta la que el instrumental se considera estéril se propone sola: el ${new Date(hasta + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}.`, 0)

  // Kits
  const kit = dlg.locator('.chip').first()
  await expect(kit).toBeVisible({ timeout: 20_000 })
  const kitTxt = (await kit.innerText()).trim()
  await kit.click()
  await dlg.getByLabel('Observaciones').fill('Ciclo normal, sin incidencias.')
  await v.narrar(page, `Se marcan los kits de instrumental que entraron al ciclo: ${kitTxt.split(' · ').join(', ')}. Aparecen los kits de esta sucursal que están por esterilizar o que ya se esterilizaron antes.`, 0)
  await dlg.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dlg).toBeHidden({ timeout: 45_000 })
  await page.waitForTimeout(3000)
  const fila = page.locator('tbody tr').filter({ hasText: autoclave.split(' · ')[0] }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const lote = (await fila.locator('b').first().innerText()).trim()
  expect(lote).toMatch(/-EST-\d+/)
  await v.narrar(page, `El lote queda registrado con el folio ${lote}, en estado registrado. Administración todavía debe liberarlo.`)

  // Detalle y liberación
  await v.narrar(page, 'Se abre el lote para revisarlo y liberarlo.', 0)
  await fila.click()
  await expect(page.getByRole('heading', { name: new RegExp('Detalle del lote ' + lote) })).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'El detalle muestra los parámetros del ciclo, los indicadores, el responsable y los kits del lote con las piezas de cada uno. El sistema indica el estado esperado según los indicadores: liberado condicionado, porque falta el biológico.')
  await page.getByRole('button', { name: 'Liberar condicionado' }).scrollIntoViewIfNeeded()
  await v.narrar(page, 'Mientras el biológico no tenga resultado solo se puede liberar de forma condicionada. Al día siguiente llega el resultado: se registra como negativo.', 0)
  await page.getByLabel('Resultado del indicador biológico').selectOption({ label: 'Negativo' })
  await page.getByRole('button', { name: 'Registrar resultado' }).click()
  await expect(page.getByRole('button', { name: 'Liberar lote' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await v.narrar(page, 'Con el químico virado y el biológico negativo ya se puede liberar el lote completo. Se pulsa Liberar lote.', 0)
  await page.getByRole('button', { name: 'Liberar lote' }).click()
  await expect(page.getByRole('button', { name: 'Liberar lote' })).toBeHidden({ timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.getByRole('heading', { name: new RegExp('Detalle del lote ' + lote) }).scrollIntoViewIfNeeded()
  const bloqueLib = page.locator('div', { has: page.locator('b', { hasText: 'Liberado:' }) }).last()
  const liberadoTxt = (await bloqueLib.innerText()).replace(/\s+/g, ' ')
  const quien = liberadoTxt.match(/por ([^·]+?)(?: Estado esperado|$)/)?.[1]?.trim(), esterilHasta = liberadoTxt.match(/Estéril hasta: ([\d/]+)/)?.[1]
  await v.narrar(page, `El lote queda liberado, por ${quien}, y es estéril hasta el ${esterilHasta}. Sus kits ya pueden usarse en consulta. Como todavía no se usan, la trazabilidad inversa dice que aún no hay pacientes atendidos con este lote.`)
  await expect(page.getByText(/Aún no se usó instrumental de este lote/)).toBeVisible()

  // Trazabilidad con un lote usado
  await v.narrar(page, 'Ahora la trazabilidad. Se cierra el detalle, y se busca un lote de un mes anterior que sí se usó en consultas.', 0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
  await page.locator('input[type=month]').fill('2026-09')
  await page.waitForTimeout(1500)
  await page.locator('select', { hasText: 'Estado: todos' }).selectOption({ label: 'bloqueado' })
  await page.waitForTimeout(1500)
  const bloq = page.locator('tbody tr').filter({ hasText: 'bloqueado' }).first()
  await expect(bloq).toBeVisible({ timeout: 20_000 })
  const loteB = (await bloq.locator('b').first().innerText()).trim()
  await expect(page.getByText(/Hay lotes bloqueados/)).toBeVisible()
  await v.narrar(page, `Al filtrar por estado bloqueado en septiembre aparece el lote ${loteB}. El sistema muestra un aviso en rojo: hay lotes bloqueados por biológico positivo.`)
  await bloq.click()
  await expect(page.getByRole('heading', { name: new RegExp('Detalle del lote ' + loteB) })).toBeVisible({ timeout: 30_000 })
  await page.getByText(/Trazabilidad inversa/).scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)
  const tit = (await page.getByText(/Trazabilidad inversa/).innerText()).trim()
  const npac = tit.match(/\((\d+)\)/)?.[1]
  const primera = (await page.locator('table').last().locator('tbody tr').first().locator('td').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim())
  await v.narrar(page, `La trazabilidad inversa lista a los pacientes atendidos con el instrumental de ese lote: son ${npac}. Cada renglón tiene el kit, la fecha y hora, la consulta y el expediente del paciente; por ejemplo, el kit ${primera[0]}, el ${primera[1]}, en la consulta ${primera[2]}, del expediente ${primera[3]}. Con esta lista la clínica puede contactar a los pacientes y revisar el incidente.`)
  await v.narrar(page, 'Se abre una de esas consultas para ver el instrumental ligado.', 0)
  await page.locator('table').last().locator('tbody tr a').first().click()
  await expect(page.getByRole('heading', { name: 'Instrumental y lote de autoclave (trazabilidad)' })).toBeVisible({ timeout: 180_000 })
  await page.getByRole('heading', { name: 'Instrumental y lote de autoclave (trazabilidad)' }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(2500)
  const kitUsado = (await page.locator('div', { hasText: /^Kit .* método/ }).last().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  const hay = kitUsado ? 1 : 0
  await v.narrar(page, hay ? `En la consulta, el apartado de instrumental y lote de autoclave muestra el kit que se usó: ${kitUsado}. De ahí sale la trazabilidad: consulta, kit, lote y autoclave. Fin del caso.` : 'En la consulta, el apartado de instrumental y lote de autoclave guarda el kit que se usó. De ahí sale la trazabilidad: consulta, kit, lote y autoclave. Fin del caso.')
  await rec.detener()
  await v.terminar(page, { autoclave, lote, kitTxt, loteB, tit, primera, hay, kitUsado })
  rec.construir(path.join(v.SALIDA, 'pantalla.mp4'))
})
