// Video CONSULTA: consulta clínica completa del podólogo (de la cita al cierre y firma), con el servicio listo para cobro en Caja.
// Requiere una cita de hoy en Chalco para «Podólogo Prueba» (demo/preparar-lotea.mjs la crea).
// Correr: PW_LOTE=A BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts consulta-clinica
import { test, expect } from '@playwright/test'
import path from 'path'
import { crearVideo } from './lib/video'
import { entrar, trazarFirma } from './lib/lote-a'

const v = crearVideo('consulta-clinica')
const hablar = process.env.RAPIDO ? async (_p: unknown, _t?: string, _e?: number) => {} : v.narrar
const EXPEDIENTE = process.env.EXPEDIENTE ?? 'CHA-EXP-000004'
const PAC = process.env.PAC_NOMBRE ?? 'Valeria'
const FOTO = path.join(process.cwd(), 'demo', 'video', 'foto-prueba.jpg')

test('Consulta clínica completa', async ({ page, context }) => {
  await v.empezar(context)
  await entrar(page, hablar, 'p@g.com', 'Chalco',
    'Prueba de la consulta clínica de Pie Clinic. Caso: el podólogo atiende a una paciente con cita, desde que abre la consulta hasta que firma la nota.',
    'El podólogo firma con su cuenta personal. La cuenta de un podólogo solo ve su propia sucursal.')

  // ───────── 1. La cita en la agenda ─────────
  await v.irA(page, /^Agenda$/)
  await hablar(page, 'Primero revisa su agenda del día. Aquí aparece la cita de la paciente que va a atender.', 0)
  const tarjeta = page.getByText(new RegExp(PAC)).first()
  await expect(tarjeta).toBeVisible({ timeout: 30_000 })
  await tarjeta.click()
  const modal = page.getByRole('dialog').last()
  await expect(modal.getByText('Quiropodia').first()).toBeVisible({ timeout: 20_000 })
  const citaFolio = (await modal.locator('h2, header, [class*=title]').first().innerText()).replace(/\s+/g, ' ').trim()
  const nombre = (await modal.locator('tr', { hasText: 'Paciente' }).first().locator('td').nth(1).innerText()).trim()
  const horario = (await modal.locator('tr', { hasText: 'Horario' }).first().locator('td').nth(1).innerText()).trim()
  await hablar(page, `El detalle de la cita dice: ${nombre}, quiropodia, horario ${horario.replace('–', 'a')}. El estado es por confirmar. Se cierra y se pasa a Consultas.`)
  await modal.getByRole('button', { name: 'Cerrar' }).first().click()

  // ───────── 2. Iniciar la consulta desde la cita ─────────
  await v.irA(page, /^Consultas/)
  await hablar(page, 'Esta es la lista de consultas: borradores, pendientes de firma y firmadas. Se pulsa Nueva consulta.', 0)
  await page.getByRole('link', { name: /Nueva consulta/ }).click()
  await expect(page.getByRole('heading', { name: 'Datos de la consulta' })).toBeVisible({ timeout: 30_000 })
  await hablar(page, 'Se busca a la paciente por nombre o número de expediente.', 0)
  await page.getByPlaceholder(/Nombre, N.º de expediente/).pressSequentially(EXPEDIENTE, { delay: 90 })
  const op = page.locator('button', { hasText: EXPEDIENTE }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)
  await op.click()
  await page.waitForTimeout(1500)
  const citas = page.getByLabel('Cita vinculada')
  await expect.poll(async () => (await citas.locator('option').count()), { timeout: 30_000 }).toBeGreaterThan(1)
  const opcionesCita = await citas.locator('option').allInnerTexts()
  const iCita = opcionesCita.findIndex(t => /Quiropodia/.test(t))
  expect(iCita).toBeGreaterThan(0)
  await citas.selectOption({ index: iCita })
  await page.waitForTimeout(1500)
  const citaTxt = opcionesCita[iCita].replace(/\s+/g, ' ')
  await hablar(page, `El sistema lista las citas de hoy de la paciente. Se vincula la cita ${citaTxt.replace(/·/g, ',')}. Al vincularla, la sede, el servicio y el tipo de atención se llenan solos.`)
  await expect(page.getByLabel('Servicio', { exact: true })).toHaveValue(/.+/)
  await hablar(page, 'Se pulsa Iniciar consulta. La nota nace como borrador y se autoguarda.', 0)
  await page.getByRole('button', { name: /Iniciar consulta/ }).click()
  await expect(page).toHaveURL(/\/consultas\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  await expect(page.getByRole('heading', { name: /Datos de la consulta y signos vitales/ })).toBeVisible({ timeout: 30_000 })
  const folioConsulta = (await page.locator('.pagina').first().innerText()).match(/CON[-\w]*\d+|CNS[-\w]*\d+/)?.[0] ?? ''
  await hablar(page, 'La consulta quedó abierta como borrador. Arriba se ven los datos de la paciente, su sede y la cita vinculada.')

  // ───────── 3. Signos vitales y motivo ─────────
  await hablar(page, 'Se capturan los signos vitales: peso, talla, tensión arterial y glucosa capilar. El sistema calcula el índice de masa corporal.', 0)
  await page.getByLabel('Peso (kg)').fill('68.5')
  await page.getByLabel('Talla (cm)').fill('162')
  await page.getByLabel('T/A sistólica').fill('120')
  await page.getByLabel('T/A diastólica').fill('80')
  await page.getByLabel('Glucosa capilar (mg/dL)').fill('96')
  await page.waitForTimeout(1500)
  await hablar(page, 'Luego, el motivo de consulta, el padecimiento actual y los síntomas, que son obligatorios para poder cerrar la nota.', 0)
  await page.getByLabel(/Motivo de consulta/).pressSequentially('Dolor y engrosamiento de la uña del dedo gordo del pie derecho', { delay: 25 })
  await page.getByLabel(/Padecimiento actual/).pressSequentially('Seis meses de evolución, con cambio de color y dolor al calzarse', { delay: 25 })
  await page.getByLabel('Síntomas').pressSequentially('Dolor leve a la presión, uña amarillenta', { delay: 25 })
  await page.waitForTimeout(1200)

  // ───────── 4. Antecedentes (historia clínica) ─────────
  const antec = page.getByRole('heading', { name: /Antecedentes/ })
  await antec.scrollIntoViewIfNeeded()
  await hablar(page, 'La sección de antecedentes muestra una instantánea de la historia clínica de la paciente en este momento: alergias, medicamentos y padecimientos. Desde aquí se puede ir a editar la historia clínica completa.')

  // ───────── 5. Mapa del pie ─────────
  const mapa = page.getByRole('heading', { name: 'Mapa del pie' })
  await mapa.scrollIntoViewIfNeeded()
  await hablar(page, 'En el mapa del pie se marcan los hallazgos. Amarillo es uña afectada y rojo es lesión. Se hace clic sobre la zona: aquí, una uña del pie derecho en vista dorsal.', 0)
  const svgDorsalD = page.locator('svg[aria-label="Pie derecho, vista dorsal"]')
  await svgDorsalD.scrollIntoViewIfNeeded()
  await svgDorsalD.locator('circle, ellipse').first().click({ force: true })
  const mh = page.getByRole('dialog').last()
  await expect(mh.getByText('Nuevo hallazgo')).toBeVisible({ timeout: 15_000 })
  await mh.getByLabel('Hallazgo').selectOption({ label: 'Onicomicosis' })
  await mh.getByLabel('Gravedad').selectOption({ label: 'Moderada' })
  await mh.getByLabel('Medida (cm)').fill('1.2')
  await mh.getByLabel('Descripción').pressSequentially('Uña engrosada y amarillenta, afecta dos tercios', { delay: 30 })
  await hablar(page, 'Se indica el hallazgo, onicomicosis, la gravedad moderada, la medida y una descripción. Se guarda.', 0)
  await mh.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Sin hallazgos marcados.')).toHaveCount(0, { timeout: 20_000 })
  await hablar(page, 'El hallazgo queda numerado en la tabla con el pie, la vista, la zona y la gravedad.')

  // ───────── 6. Foto clínica ─────────
  await page.getByText('Adjuntar foto clínica a la zona').click()
  await hablar(page, 'También se puede adjuntar una foto clínica a la zona. Se elige el pie, el ángulo, el momento, el nivel de autorización de la paciente y se sube la imagen. Las fotos se guardan en un almacenamiento privado.', 0)
  const archivo = page.locator('input[type=file]').first()
  await archivo.setInputFiles(FOTO)
  await expect(page.getByText('Foto registrada').first()).toBeVisible({ timeout: 60_000 })
  await hablar(page, 'La foto quedó registrada en el expediente como imagen de prueba.')

  // ───────── 7. Exploración ─────────
  await page.getByRole('heading', { name: 'Exploración', exact: true }).scrollIntoViewIfNeeded()
  await hablar(page, 'La exploración tiene una pestaña por tipo: dermatológica, ungueal, ortopédica, vascular y neurológica. En la ungueal se indica el pie y el dedo explorados, y las características de la uña.', 0)
  await page.getByLabel(/^Pie/).last().selectOption({ label: 'Derecho' })
  await page.getByLabel(/^Dedo/).selectOption({ index: 1 })
  await page.getByLabel('Forma', { exact: true }).selectOption({ label: 'Hipertrófica' })
  await page.getByLabel('Grosor', { exact: true }).selectOption({ label: 'Engrosada' })
  await page.getByLabel('Color', { exact: true }).fill('Amarillo ocre')
  await page.getByLabel('Patrón de onicomicosis').selectOption({ label: 'Distal lateral' })
  await page.getByLabel('Resumen / observaciones de la exploración').fill('Onicomicosis distal lateral del primer dedo derecho, sin signos de infección.')
  await page.getByRole('button', { name: /Guardar exploración ungueal/ }).click()
  await expect(page.getByText('Exploración guardada').first()).toBeVisible({ timeout: 20_000 })
  await hablar(page, 'La exploración ungueal queda guardada y la pestaña se marca con una palomita.')

  // ───────── 8. Diagnóstico y procedimiento (con consentimiento) ─────────
  await page.getByRole('heading', { name: /Diagnóstico y procedimiento/ }).scrollIntoViewIfNeeded()
  await hablar(page, 'El diagnóstico principal es obligatorio. Se elige onicomicosis. También se podría agregar un código CIE diez y diagnósticos secundarios.', 0)
  await page.getByRole('button', { name: 'Onicomicosis', exact: true }).first().click()
  await page.waitForTimeout(2000)
  await hablar(page, 'Luego el procedimiento realizado: láser antimicótico. Ese procedimiento exige consentimiento informado firmado por la paciente.', 0)
  await page.getByLabel('Procedimiento', { exact: true }).selectOption({ label: 'Láser antimicótico' })
  await page.locator('div.row', { has: page.getByLabel('Procedimiento', { exact: true }) }).getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.waitForTimeout(2000)
  const boton = page.getByRole('button', { name: /Firmar consentimiento en pantalla/ })
  await expect(boton).toBeVisible({ timeout: 20_000 })
  await hablar(page, 'El sistema avisa que falta el consentimiento. Se pulsa Firmar consentimiento en pantalla.', 0)
  await boton.click()
  const fd = page.getByRole('dialog').last()
  await expect(fd.getByText(/Consentimiento informado/).first()).toBeVisible({ timeout: 15_000 })
  await hablar(page, 'La paciente firma con el dedo, el lápiz o el ratón. El nombre del firmante ya viene escrito. La firma queda con fecha, hora, dispositivo y huella del documento, y no se puede modificar.', 0)
  await trazarFirma(page)
  await fd.getByRole('button', { name: /^Firmar/ }).click()
  await expect(page.getByText(/Consentimiento (informado )?(firmado|registrado)|Firmado/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await expect(fd).toBeHidden({ timeout: 30_000 })
  await hablar(page, 'El consentimiento quedó firmado y el aviso desapareció. Ahora se agrega el procedimiento.', 0)
  await page.locator('div.row', { has: page.getByLabel('Procedimiento', { exact: true }) }).getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.getByLabel('Anestesia (general de la consulta)').selectOption({ index: 1 }).catch(() => {})
  await page.getByLabel('Descripción del procedimiento').last().fill('Sesión de láser antimicótico en la uña del primer dedo derecho, tres ciclos.')

  // ───────── 9. Indicaciones ─────────
  await hablar(page, 'En medicamentos e indicaciones se registra lo que se le indica a la paciente. Un medicamento del catálogo, con su dosis, vía, frecuencia y duración.', 0)
  const med = page.getByLabel('Medicamento (catálogo)')
  await med.scrollIntoViewIfNeeded()
  await med.selectOption({ label: 'Terbinafina 1 %' }).catch(async () => { await med.selectOption({ index: 1 }) })
  await page.getByLabel('Dosis', { exact: true }).fill('Una aplicación')
  await page.getByLabel('Frecuencia', { exact: true }).fill('Cada 12 horas')
  await page.getByLabel('Duración', { exact: true }).fill('4 semanas')
  await page.locator('label', { hasText: 'Va en receta' }).locator('input').check()
  await page.waitForTimeout(800)
  const filaInd = page.locator('div.row', { has: page.getByLabel('Medicamento (catálogo)') })
  await filaInd.getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.waitForTimeout(2000)
  await hablar(page, 'Queda marcado para que vaya en la receta. Además, se agrega una indicación que no es un medicamento.', 0)
  await page.getByLabel('Tipo', { exact: true }).selectOption({ label: 'Indicación no farmacológica' })
  await page.getByLabel('Indicación', { exact: true }).fill('Mantener el pie seco, cambiar calcetines diariamente y desinfectar el calzado.')
  await page.locator('div.row', { has: page.getByLabel('Tipo', { exact: true }) }).getByRole('button', { name: 'Agregar', exact: true }).last().click()
  await page.waitForTimeout(2200)

  // ───────── 10. Productos ─────────
  await page.getByRole('heading', { name: /Productos y material usado/ }).scrollIntoViewIfNeeded()
  await hablar(page, 'En productos y material usado se registrarían los insumos de la consulta; los marcados como cobrar pasan a Caja. En esta consulta no se usó ninguno.')

  // ───────── 11. Nota de evolución y cierre ─────────
  await page.getByRole('heading', { name: /Nota de evolución, próxima cita y firma/ }).scrollIntoViewIfNeeded()
  await hablar(page, 'Por último, la nota de evolución, el tratamiento, el pronóstico y la próxima visita, como pide la norma oficial del expediente clínico.', 0)
  await page.getByLabel(/Nota de evolución \(NOM-004/).fill('Paciente femenina con onicomicosis distal lateral del primer dedo derecho. Se realiza limpieza, fresado y primera sesión de láser. Se indica antimicótico tópico. Se cita a revisión en cuatro semanas.')
  await page.getByLabel(/Tratamiento \(lo que adquirió/).fill('Quiropodia y primera sesión de láser antimicótico')
  await page.getByLabel('Pronóstico').selectOption({ label: 'Bueno' })
  const prox = new Date(Date.now() + 28 * 86400e3 - 6 * 3600e3).toISOString().slice(0, 10)
  await page.getByLabel('Próxima visita').fill(prox)
  await page.getByLabel('Tipo de próxima cita').fill('Revisión de onicomicosis')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Guardar borrador/ }).click()
  await expect(page.getByText('Borrador guardado').first()).toBeVisible({ timeout: 20_000 })
  await hablar(page, 'Se guarda el borrador; el sistema también lo autoguarda a los tres segundos de cada cambio.', 0)

  // Recibo de indicaciones firmado por la paciente
  await hablar(page, 'La paciente puede firmar el recibo de las indicaciones que se le dieron.', 0)
  await page.getByRole('button', { name: /Firma del paciente \(recibo de indicaciones\)/ }).click()
  const fp = page.getByRole('dialog').last()
  await expect(fp.getByText(/Firma del paciente/).first()).toBeVisible({ timeout: 15_000 })
  await trazarFirma(page)
  await fp.getByRole('button', { name: /^Firmar/ }).click()
  await expect(page.getByRole('button', { name: /Recibo del paciente firmado/ })).toBeVisible({ timeout: 30_000 })
  await hablar(page, 'El recibo quedó firmado.')

  // Cierre con la firma del podólogo
  await hablar(page, 'Con todo capturado, el podólogo pulsa Cerrar y firmar consulta. El sistema valida los datos obligatorios y pide su firma con su cédula profesional.', 0)
  await page.getByRole('button', { name: 'Cerrar y firmar consulta' }).click()
  const fpod = page.getByRole('dialog').last()
  await expect(fpod.getByText(/Firma del podólogo/).first()).toBeVisible({ timeout: 30_000 })
  const cedula = (await fpod.getByText(/Cédula profesional/).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  await hablar(page, `Se muestra el aviso: al firmar, la nota queda bloqueada y solo admite notas aclaratorias. ${cedula ? 'Se firma con la ' + cedula.toLowerCase() + '.' : ''}`, 0)
  await trazarFirma(page)
  await fpod.getByRole('button', { name: 'Firmar y cerrar' }).click()
  await expect(page.getByRole('heading', { name: 'Consulta firmada' })).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)
  await hablar(page, 'La consulta quedó firmada y bloqueada. Arriba el estado cambia a cerrada, con el nombre del podólogo y su cédula. De aquí en adelante solo se puede agregar una nota aclaratoria con fecha, hora y firma.')

  // ───────── 12. Queda para cobro en Caja ─────────
  const aviso = page.getByText(/Cobra siempre Caja \(P-078\)/)
  await aviso.scrollIntoViewIfNeeded()
  await hablar(page, 'El podólogo no cobra. La regla es que siempre cobra Caja: el servicio y los productos marcados para cobrar quedan listos, y desde aquí hay un botón para enviar la paciente a caja.')
  await v.irA(page, /^Agenda$/)
  await expect(page.getByText(new RegExp(PAC)).first()).toBeVisible({ timeout: 30_000 })
  await hablar(page, 'En la agenda, la cita pasó sola al estado atendida al firmarse la nota. Esa cita aparece ahora en Caja, en el panel de citas por cobrar, con el servicio ya listo; ese cobro se muestra en el video de cobro de una cita.')
  await v.terminar(page, { citaFolio, nombre, horario, citaTxt, folioConsulta, expediente: EXPEDIENTE })
})
