// Video VID-C1: plantilla ortopédica — estudio de pisada con medidas, orden al laboratorio, envío, recepción y entrega con firma de conformidad.
// Correr: PW_LOTE=C BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-plantilla-ortopedica
import { test, expect as expectBase } from '@playwright/test'
import { crearVideo, escribir } from './lib/video'
import { firmarCon, trazarFirma, iniciarGrabacion } from './lib/video-c'
import path from 'path'

test.use({ launchOptions: { slowMo: 150 }, video: 'off' })   // video propio por pantallazos (ver iniciarGrabacion): el webm de Playwright salía truncado con la máquina cargada
const expect = expectBase.configure({ timeout: 45_000 })   // la máquina compartida va lenta: las pantallas tardan en cargar
const v = crearVideo('vid-plantilla-ortopedica')

test('Plantilla ortopédica: orden, fabricación y entrega', async ({ page, context }) => {
  test.setTimeout(40 * 60_000)   // la máquina compartida va lenta; la prueba espera la voz de cada marca
  await v.empezar(context)
  const rec = await iniciarGrabacion(page, v.SALIDA)
  await firmarCon(page, v.narrar, 'podologo', null, 'Prueba de plantillas ortopédicas de Pie Clinic. Caso: un paciente con pie plano necesita plantillas a la medida. Se captura el estudio de pisada, se manda a fabricar y se entrega.')
  await v.irA(page, /^Plantillas ortopédicas$/)
  await expect(page.getByRole('heading', { name: 'Plantillas ortopédicas' })).toBeVisible()
  const enLab = (await page.locator('.kpi, [class*=kpi]').filter({ hasText: 'En laboratorio' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  await v.narrar(page, 'Esta es la pantalla de plantillas ortopédicas. Arriba están los indicadores: órdenes en laboratorio, retrasadas, garantías vigentes, revisiones de ajuste y renovaciones. Abajo, todas las órdenes con su estado.')
  await v.narrar(page, 'Para empezar una nueva se pulsa Estudio de pisada y orden.', 0)
  await page.getByRole('link', { name: /Estudio de pisada y orden/ }).click()
  await expect(page.getByRole('heading', { name: 'Estudio de pisada' })).toBeVisible({ timeout: 30_000 })

  // Paciente
  await v.narrar(page, 'Primero se busca al paciente por nombre, expediente o celular.', 0)
  await escribir(page.getByPlaceholder(/Nombre, N.º de expediente/), 'mar')
  const op = page.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  const nombre = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1000)
  await op.click()
  await expect(page.getByText(nombre).first()).toBeVisible()
  await v.narrar(page, `Se elige a ${nombre}. La orden queda ligada a su expediente.`)

  // Estudio
  await page.getByLabel('Tipo de estudio', { exact: true }).selectOption({ label: 'Baropodometría' })
  await page.getByLabel('Equipo', { exact: true }).fill('Baropodómetro de plataforma')
  await page.getByLabel('Tipo de arco', { exact: true }).selectOption({ label: 'Plano' })
  await page.getByLabel('Retropié', { exact: true }).selectOption({ label: 'Valgo' })
  await v.narrar(page, 'En el estudio de pisada se indica el tipo de estudio, baropodometría, el equipo utilizado, el tipo de arco, plano, y el retropié, en valgo.', 0)
  await v.narrar(page, 'Ahora las medidas. Longitud de cada pie en milímetros, ancho metatarsal, altura del arco, ángulo del retropié y la dismetría entre ambas piernas.', 0)
  const medidas: [string, string][] = [['Talla de calzado (MX)', '26'], ['Longitud izq. (mm)', '262'], ['Longitud der. (mm)', '265'], ['Ancho metatarsal izq. (mm)', '98'], ['Ancho metatarsal der. (mm)', '99'],
    ['Altura de arco izq. (mm)', '9'], ['Altura de arco der. (mm)', '8'], ['Ángulo retropié izq. (°)', '7'], ['Ángulo retropié der. (°)', '8'], ['Dismetría de miembros (mm)', '6']]
  for (const [l, val] of medidas) { const c = page.getByLabel(l, { exact: true }); await c.scrollIntoViewIfNeeded(); await c.fill(val); await page.waitForTimeout(250) }
  await page.getByLabel('Lado corto', { exact: true }).selectOption({ label: 'Izquierdo' })
  await page.getByLabel('Patrón de marcha', { exact: true }).fill('Pronación excesiva en la fase de apoyo')
  await page.getByLabel('Diagnóstico (CIE-10)').fill('M21.4')
  await page.getByLabel('Peso (kg)', { exact: true }).fill('78')
  await v.narrar(page, 'Se registra la longitud de 262 milímetros en el pie izquierdo y 265 en el derecho, una dismetría de 6 milímetros con el lado izquierdo más corto, y el diagnóstico CIE-10 M21.4, pie plano adquirido.', 0)

  // Orden
  const orden = page.getByRole('heading', { name: 'Orden de fabricación' })
  await orden.scrollIntoViewIfNeeded()
  await v.narrar(page, 'Más abajo, la orden de fabricación. Se indica el modelo, el material, la cuña o realce, la cobertura, el número de pares y el laboratorio que la fabrica.', 0)
  await page.getByLabel('Modelo', { exact: true }).fill('Soporte de arco con taloneras')
  await page.getByLabel('Material', { exact: true }).fill('Polipropileno flexible con EVA')
  await page.getByLabel('Cuña / realce', { exact: true }).fill('Realce de 6 mm en el pie izquierdo')
  await page.getByLabel('Cobertura', { exact: true }).selectOption({ label: '3/4' })
  await page.getByLabel('Laboratorio / fabricante').selectOption({ index: 1 })
  const lab = (await page.getByLabel('Laboratorio / fabricante').locator('option:checked').innerText()).trim()
  await page.waitForTimeout(800)
  const entrega = await page.getByLabel('Entrega estimada').inputValue()
  await v.narrar(page, `El laboratorio es ${lab}. El sistema calcula la entrega estimada: ${entrega}.`, 0)
  await page.getByLabel('Precio plantillas', { exact: true }).fill('1800')
  await page.getByLabel('Anticipo', { exact: true }).fill('900')
  await page.getByLabel('Forma del anticipo', { exact: true }).selectOption({ label: 'efectivo' })
  await page.getByLabel('Indicaciones al laboratorio').fill('Respetar el realce de 6 mm en el pie izquierdo. Cubierta de piel sintética.')
  await v.narrar(page, 'El precio es de 1,800 pesos. La regla de la clínica exige un anticipo de al menos el cincuenta por ciento para mandar la orden a fabricar: se capturan 900 pesos en efectivo.', 0)
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(page).toHaveURL(/\/plantillas-ortopedicas\/[0-9a-f-]{36}/, { timeout: 45_000 })
  await page.waitForTimeout(2500)
  const folio = await page.getByLabel('Folio de orden').inputValue()
  expect(folio).toMatch(/-ORT-\d+/)
  await page.evaluate(() => window.scrollTo(0, 0))
  await v.narrar(page, `Se guarda como borrador y el sistema asigna el folio ${folio}. Arriba se ve el avance de la orden: borrador, enviada, recibida y entregada.`)

  // Firmar estudio
  await v.narrar(page, 'Antes de enviar, el podólogo debe firmar el estudio de pisada. Con la firma, el estudio ya no se puede modificar.', 0)
  await page.getByRole('button', { name: 'Firmar estudio' }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg).toBeVisible()
  await trazarFirma(page)
  await v.narrar(page, 'Se firma en la pantalla con el mouse o el dedo, y el sistema guarda la firma con fecha, hora y el podólogo responsable.', 0)
  await dlg.getByRole('button', { name: 'Firmar', exact: true }).click()
  await expect(page.getByText(/Firmado .* acreditable hasta/)).toBeVisible({ timeout: 45_000 })
  await page.waitForTimeout(1500)
  await v.narrar(page, 'El estudio queda firmado y bloqueado.')

  // Enviar
  await v.narrar(page, 'Ahora se envía la orden al laboratorio. El sistema valida que el anticipo cubra el cincuenta por ciento, que estén completos el laboratorio, el modelo y el material, y que el estudio esté firmado.', 0)
  await page.getByRole('button', { name: 'Enviar orden al laboratorio' }).click()
  await expect(page.getByText(/Orden enviada|enviada/i).first()).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: 'Marcar recibida' })).toBeVisible({ timeout: 45_000 })
  await page.waitForTimeout(1500)
  await v.narrar(page, 'La orden pasó a enviada. El laboratorio ya la tiene y la entrega estimada queda registrada.')

  // Recibida
  await v.narrar(page, 'Cuando las plantillas llegan del laboratorio, se marca la orden como recibida.', 0)
  await page.getByRole('button', { name: 'Marcar recibida' }).click()
  await expect(page.getByRole('button', { name: 'Entregar al paciente' })).toBeVisible({ timeout: 45_000 })
  await page.waitForTimeout(1500)

  // Entrega
  await v.narrar(page, 'El día de la entrega se marca que se hizo el ajuste de las plantillas dentro del calzado, y se pulsa Entregar al paciente.', 0)
  await page.getByLabel('Ajuste de entrega realizado').check()
  await page.getByRole('button', { name: 'Entregar al paciente' }).click()
  const dlg2 = page.getByRole('dialog').last()
  await expect(dlg2.getByText(/Conformidad del paciente/)).toBeVisible()
  await v.narrar(page, 'El paciente firma su conformidad de recibido en la pantalla.', 0)
  await trazarFirma(page)
  await page.waitForTimeout(800)
  await dlg2.getByRole('button', { name: 'Firmar conformidad y entregar' }).click()
  await expect(page.getByText(/Garantía hasta/).first()).toBeVisible({ timeout: 45_000 })
  await page.waitForTimeout(1500)
  const bloque = page.locator('div', { has: page.locator('b', { hasText: 'Entrega:' }) }).last()
  const resumen = (await bloque.innerText()).replace(/\s+/g, ' ').replace('Cubre defectos de fabricación y ajustes sin costo.', '').trim()
  await bloque.scrollIntoViewIfNeeded()
  const garantia = resumen.match(/Garantía hasta: ([\d/]+)/)?.[1], revision = resumen.match(/Revisión de ajuste: ([\d/]+)/)?.[1]
  await v.narrar(page, `La orden queda entregada, con garantía hasta el ${garantia} y revisión de ajuste el ${revision}.`)

  // Lista
  await v.narrar(page, 'Se regresa a la lista de órdenes.', 0)
  await page.getByRole('link', { name: /Volver/ }).first().click().catch(async () => { await v.irA(page, /^Plantillas ortopédicas$/) })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
  await expect(page.getByText(folio).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, `Ahí aparece la orden ${folio} de ${nombre}, en estado entregada, con su garantía. Fin del caso.`)
  await rec.detener()
  await v.terminar(page, { nombre, folio, lab, entrega, resumen, enLab })
  rec.construir(path.join(v.SALIDA, 'pantalla.mp4'))
})
