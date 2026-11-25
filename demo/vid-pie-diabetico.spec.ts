// Video VID-C2: pie diabético — valoración de riesgo (monofilamento, vascular, úlcera SINBAD, categoría), firma y revisión; luego comparación de fotos de evolución.
// Correr: PW_LOTE=C BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-pie-diabetico
import { test, expect } from '@playwright/test'
import { crearVideo, escribir } from './lib/video'
import { firmarCon, trazarFirma, iniciarGrabacion } from './lib/video-c'
import path from 'path'

test.use({ launchOptions: { slowMo: 150 }, video: 'off' })   // video propio por pantallazos (ver iniciarGrabacion): el webm de Playwright salía truncado con la máquina cargada
const v = crearVideo('vid-pie-diabetico')
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Monofilamento: por sitio, [izquierdo, derecho]; true = siente
const MONO: Record<string, [boolean, boolean]> = {
  '1er dedo': [true, false], '3er dedo': [true, false], '5º dedo': [false, false], 'Cabeza MT 1': [false, false], 'Cabeza MT 3': [true, false],
  'Cabeza MT 5': [true, true], 'Medio pie medial': [true, true], 'Medio pie lateral': [true, true], 'Talón': [true, true], 'Dorso': [true, true],
}

test('Pie diabético: valoración, evolución y fotos', async ({ page, context }) => {
  await v.empezar(context)
  await firmarCon(page, v.narrar, 'podologo', null, 'Prueba de pie diabético de Pie Clinic. Caso: un paciente con diabetes tipo uno llega a consulta. El podólogo hace la valoración de riesgo del pie, la firma, y revisa la evolución con las fotos clínicas.')
  await v.irA(page, /^Pie diabético$/)
  await expect(page.getByRole('heading', { name: 'Pie diabético' })).toBeVisible()
  await v.narrar(page, 'Esta es la pantalla de pie diabético. Muestra la última valoración firmada de cada paciente, su categoría de riesgo y cuándo toca la próxima revisión; las revisiones vencidas se marcan en rojo y generan una alerta en el expediente. Un aviso recuerda que las categorías son una sugerencia que está apagada hasta que un podólogo asesor valide los criterios, y que el podólogo siempre decide.')
  await v.narrar(page, 'Se pulsa Nueva valoración.', 0)
  await page.getByRole('link', { name: /Nueva valoración/ }).click()
  await expect(page.getByRole('heading', { name: 'Valoración de pie diabético' })).toBeVisible({ timeout: 30_000 })

  // Paciente
  await escribir(page.getByPlaceholder(/Nombre, N.º de expediente/), 'ortega')
  const op = page.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).filter({ hasText: 'Juan' }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  const nombre = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1000)
  await op.click()
  await expect(page.getByText(nombre).first()).toBeVisible()
  await page.waitForTimeout(2500)
  await v.narrar(page, `Se elige a ${nombre}. El sistema precarga sus datos de diabetes desde los antecedentes del expediente, para no capturarlos otra vez.`)

  // Datos de diabetes
  await page.getByLabel('Tipo de diabetes', { exact: true }).selectOption({ label: 'Tipo 1' })
  await page.getByLabel('Años de evolución', { exact: true }).fill('12')
  await page.getByLabel('HbA1c (%)', { exact: true }).fill('8.3')
  await page.getByLabel('Fecha de HbA1c', { exact: true }).fill(hoy())
  await page.getByLabel('Tratamiento', { exact: true }).fill('Insulina basal y rápida')
  await page.getByLabel('Úlcera previa').check()
  await page.getByRole('button', { name: 'Hormigueo', exact: true }).click()
  await page.getByRole('button', { name: 'Pérdida de sensibilidad', exact: true }).click()
  await v.narrar(page, 'Diabetes tipo uno con doce años de evolución, hemoglobina glicosilada de 8.3 por ciento, en tratamiento con insulina. Tiene antecedente de úlcera y refiere hormigueo y pérdida de sensibilidad.', 0)

  // Monofilamento
  const mono = page.getByRole('heading', { name: /Neurológica/ })
  await mono.scrollIntoViewIfNeeded()
  await v.narrar(page, 'La exploración neurológica es con monofilamento de diez gramos. En cada sitio plantar se marca si el paciente siente o no siente, en el pie izquierdo y en el derecho.', 0)
  for (const [sitio, [izq, der]] of Object.entries(MONO)) {
    const fila = page.locator('tr', { has: page.locator('td', { hasText: new RegExp('^' + sitio + '$') }) }).first()
    const r = fila.getByRole('radio')
    await r.nth(izq ? 0 : 1).click()
    await r.nth(der ? 2 : 3).click()
  }
  const resultado = (await page.locator('tr', { hasText: 'Resultado' }).first().innerText()).replace(/\s+/g, ' ')
  await page.locator('tr', { hasText: 'Resultado' }).first().scrollIntoViewIfNeeded()
  await v.narrar(page, `El sistema cuenta solo los sitios sin sensibilidad. ${resultado.replace('Resultado', 'Resultado:')}.`)
  await page.getByLabel('Sensibilidad protectora', { exact: true }).scrollIntoViewIfNeeded()
  const sug = await page.getByText(/Sugerida por el monofilamento/).innerText().catch(() => '')
  await page.getByLabel('Sensibilidad protectora', { exact: true }).selectOption({ label: 'Ausente' })
  await page.getByLabel('Diapasón 128 Hz izq.').selectOption({ label: 'presente' })
  await page.getByLabel('Diapasón 128 Hz der.').selectOption({ label: 'disminuida' })
  await v.narrar(page, `Con el diapasón y el monofilamento, el podólogo concluye que la sensibilidad protectora está ausente. ${sug ? 'El sistema lo sugería así: ' + sug.toLowerCase() + '.' : ''}`, 0)

  // Vascular
  await page.getByRole('heading', { name: 'Vascular' }).scrollIntoViewIfNeeded()
  await page.getByLabel('Pulso pedio izq.').selectOption({ label: 'presente' })
  await page.getByLabel('Pulso pedio der.').selectOption({ label: 'disminuido' })
  await page.getByLabel('Pulso tibial posterior izq.').selectOption({ label: 'presente' })
  await page.getByLabel('Pulso tibial posterior der.').selectOption({ label: 'ausente' })
  await page.getByLabel('Llenado capilar izq. (s)').fill('2')
  await page.getByLabel('Llenado capilar der. (s)').fill('3.5')
  await page.getByLabel('ITB izq.').fill('1.05')
  await page.getByLabel('ITB der.').fill('0.82')
  const lecDer = (await page.getByLabel('ITB der.').locator('xpath=following-sibling::span[contains(@class,"hint")]').innerText().catch(() => '')).trim()
  await v.narrar(page, `En la parte vascular se registran los pulsos, el llenado capilar y el índice tobillo brazo. El del pie derecho es de 0.82${lecDer ? ': ' + lecDer.toLowerCase() : ''}. El pulso tibial derecho está ausente.`, 0)
  await page.getByRole('button', { name: 'Hallux valgus', exact: true }).click()
  await page.getByRole('button', { name: 'Callosidad', exact: true }).click()

  // Úlcera
  await page.getByRole('button', { name: '+ Agregar úlcera' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '+ Agregar úlcera' }).click()
  await page.getByLabel('Área (cm²)').fill('1.2')
  await page.getByLabel('Profundidad', { exact: true }).selectOption({ label: 'Tejido subcutáneo' })
  await page.getByLabel('Localización (texto)').fill('Cabeza del primer metatarsiano')
  await page.getByRole('button', { name: 'Proponer ítems con lo capturado' }).click()
  await page.waitForTimeout(800)
  const sinbad = (await page.locator('tr', { hasText: 'Puntaje SINBAD' }).innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `Como hay una úlcera activa, se registra en el pie derecho, de 1.2 centímetros cuadrados y profundidad en tejido subcutáneo. El botón Proponer ítems llena la escala SINBAD con lo ya capturado, y el sistema suma el puntaje: ${sinbad.replace('/', ' de ')}.`, 0)
  await page.getByLabel('Wagner (opcional)').selectOption({ label: 'Grado 1' })
  await page.getByLabel('Infección (IDSA/IWGDF)').selectOption({ label: 'Sin infección' })

  // Riesgo y seguimiento
  await page.getByRole('heading', { name: /Categoría de riesgo y seguimiento/ }).scrollIntoViewIfNeeded()
  await page.getByLabel('Categoría de riesgo confirmada').selectOption({ label: 'Categoría 3' })
  await page.getByLabel('Frecuencia de revisión').selectOption({ label: 'Cada mes' })
  await page.waitForTimeout(800)
  const prox = await page.getByLabel('Próxima revisión').inputValue()
  expect(prox).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await page.getByLabel('Educación al paciente y plan').fill('Revisar los pies todos los días, calzado cerrado con plantilla terapéutica, no caminar descalzo y acudir de inmediato ante cualquier herida.')
  await v.narrar(page, `Por último, el podólogo confirma la categoría de riesgo tres, por la úlcera previa y la sensibilidad ausente, y define la frecuencia de revisión, cada mes. El sistema calcula la próxima revisión: ${prox.split('-').reverse().join('/')}. Escribe el plan de educación para el paciente. Como la sugerencia automática está apagada, la categoría la decide siempre el podólogo.`, 0)

  // Firma
  await page.getByRole('button', { name: 'Firmar y cerrar' }).scrollIntoViewIfNeeded()
  await v.narrar(page, 'Se pulsa Firmar y cerrar. El sistema guarda la valoración y pide la firma del podólogo.', 0)
  await page.getByRole('button', { name: 'Firmar y cerrar' }).click()
  await expect(page).toHaveURL(/\/pie-diabetico\/[0-9a-f-]{36}/, { timeout: 60_000 })
  const dlg = page.getByRole('dialog').last()
  await expect(dlg.getByText('Firma de la valoración')).toBeVisible({ timeout: 30_000 })
  await trazarFirma(page)
  await dlg.getByRole('button', { name: 'Firmar', exact: true }).click()
  await expect(page.getByText(/Valoración firmada el/)).toBeVisible({ timeout: 45_000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await v.narrar(page, 'La valoración queda firmada y bloqueada: ya no se modifica. Para actualizarla se registra una nueva valoración, y así se conserva el historial.')

  // Lista
  await v.irA(page, /^Pie diabético$/)
  const fila = page.locator('tbody tr').filter({ hasText: nombre.split(' ')[0] + ' ' + nombre.split(' ')[1] }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const filaTxt = (await fila.innerText()).replace(/\s+/g, ' ')
  expect(filaTxt).toMatch(/Categoría 3/)
  await v.narrar(page, `En la lista aparece ${nombre} con la categoría tres, su próxima revisión, y el estado al corriente. Cuando la fecha pase sin una nueva valoración, el renglón se pondrá en rojo como vencida y el paciente aparecerá en el seguimiento de la clínica.`)

  // Fotos
  await v.narrar(page, 'Ahora la evolución con fotos clínicas. Se entra a Fotos clínicas y se busca al paciente.', 0)
  await v.irA(page, /^Fotos clínicas$/)
  await escribir(page.getByPlaceholder(/Nombre, N.º de expediente/), 'ortega')
  const op2 = page.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).filter({ hasText: 'Juan' }).first()
  await expect(op2).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await op2.click()
  await expect(page.getByRole('heading', { name: 'Comparar fotos de evolución' })).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)
  await expect(page.locator('img[alt="ANTES"]')).toBeVisible({ timeout: 30_000 })
  const antes = (await page.getByText(/^ANTES ·/).first().innerText()).trim()
  const despues = (await page.getByText(/^DESPUÉS 1 ·/).first().innerText()).trim()
  await v.narrar(page, `El comparador pone las fotos del paciente lado a lado: ${antes.toLowerCase()} a la izquierda, y ${despues.toLowerCase()} a su derecha. Debajo de cada foto están la consulta, el podólogo, el ángulo, la zona del pie y el nivel de autorización del paciente.`)
  await v.narrar(page, 'Se puede filtrar por pie y por zona, y elegir qué fotos van en cada columna, para comparar las fechas que interesen.', 0)
  await page.getByLabel('Pie', { exact: true }).selectOption({ label: 'Izquierdo' })
  await page.waitForTimeout(1500)
  await page.getByLabel('Pie', { exact: true }).selectOption({ label: 'Ambos' }).catch(async () => { await page.getByLabel('Pie', { exact: true }).selectOption('') })
  await page.waitForTimeout(1500)
  await page.locator('img[alt="ANTES"]').click()
  await expect(page.getByRole('heading', { name: 'Datos de la foto seleccionada' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('heading', { name: 'Datos de la foto seleccionada' }).scrollIntoViewIfNeeded()
  await v.narrar(page, 'Al abrir una foto se ven todos sus datos: la sesión, el pie y la zona, el momento, el ángulo, la autorización del paciente, quién la subió y cuándo. El podólogo puede marcar puntos sobre la imagen, y retirarla con un motivo; las fotos clínicas nunca se borran.', 0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('heading', { name: 'Línea de tiempo de evolución' }).scrollIntoViewIfNeeded()
  await v.narrar(page, 'Abajo está la línea de tiempo de evolución, con las fotos de cada consulta en orden. Con esto el podólogo ve de un vistazo cómo ha cambiado el pie del paciente entre una visita y otra. Fin del caso.')
  await v.terminar(page, { nombre, 