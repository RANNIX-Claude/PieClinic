// Video VID-PACIENTE: alta de un paciente nuevo en recepción, su expediente, la historia clínica y los consentimientos con firma en pantalla.
// Correr: PW_LOTE=A BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-paciente-expediente
import { test, expect } from '@playwright/test'
import { crearVideo } from './lib/video'
import { entrar, trazarFirma } from './lib/lote-a'

const v = crearVideo('vid-paciente-expediente')
const hablar = process.env.RAPIDO ? async (_p: unknown, _t?: string, _e?: number) => {} : v.narrar
const SEDE = 'Chalco'
const NOMBRE = process.env.PAC_NOMBRE ?? 'Valeria', PATERNO = 'Montes', MATERNO = 'Villalobos'


test('Alta de paciente y expediente', async ({ page, context }) => {
  await v.empezar(context)
  await entrar(page, hablar, 'r@g.com', SEDE,
    'Prueba del alta de pacientes de Pie Clinic. Caso: llega una paciente nueva a la sucursal Chalco, se le abre su expediente y firma sus consentimientos en pantalla.',
    'Primero, la persona de recepción firma con su cuenta personal.')

  // ───────── 1. Registrar paciente ─────────
  await v.irA(page, /^Pacientes$/)
  await hablar(page, 'Esta es la lista de pacientes con su buscador. Antes de registrar a alguien nuevo, conviene buscarla por si ya tiene expediente. Para una paciente nueva se pulsa Registrar paciente.', 0)
  await page.getByRole('link', { name: /Registrar paciente/ }).click()
  await expect(page.getByRole('heading', { name: '1. Datos personales' })).toBeVisible({ timeout: 30_000 })
  const sedeReg = await page.getByLabel(/Sede de registro/).locator('option:checked').innerText()
  await hablar(page, `La ficha empieza con los datos personales. La sede de registro es ${sedeReg}, y el número de expediente se asigna solo, de forma consecutiva por sede.`, 0)
  await page.getByLabel(/Nombre\(s\)/).pressSequentially(NOMBRE, { delay: 80 })
  await page.getByLabel(/Apellido paterno/).pressSequentially(PATERNO, { delay: 80 })
  await page.getByLabel(/Apellido materno/).pressSequentially(MATERNO, { delay: 80 })
  await page.getByRole('button', { name: 'Mujer', exact: true }).click().catch(() => {})
  await page.getByLabel(/Fecha de nacimiento/).fill('1984-03-17')
  await page.waitForTimeout(800)
  await hablar(page, 'Se capturan el nombre, los apellidos y la fecha de nacimiento; la edad se calcula sola. Los datos mínimos son el nombre, el apellido paterno, la fecha de nacimiento y el celular, que es el medio de contacto por WhatsApp.', 0)
  await page.getByLabel(/Celular \(WhatsApp\)/).pressSequentially('5599887766', { delay: 70 })
  await page.getByLabel(/Correo electrónico/).pressSequentially('valeria.montes.prueba@example.com', { delay: 40 })
  await page.getByLabel(/Alergias conocidas/).pressSequentially('Ninguna conocida', { delay: 50 })
  await page.getByLabel(/¿Diabetes\?/).selectOption({ label: 'No' }).catch(() => {})
  await page.waitForTimeout(1000)
  await hablar(page, 'También se anotan las alergias conocidas y si la paciente tiene diabetes, porque eso activa alertas en la consulta.', 0)
  const emerg = page.getByRole('heading', { name: 'Contacto de emergencia' })
  await emerg.scrollIntoViewIfNeeded()
  await page.getByLabel('Nombre', { exact: true }).first().fill('Ricardo Montes')
  await page.getByLabel('Teléfono', { exact: true }).first().fill('5511223344')
  await page.waitForTimeout(800)

  // ───────── 2. Consentimientos y firma ─────────
  const sec5 = page.getByRole('heading', { name: /5\. Consentimientos y aviso de privacidad/ })
  await sec5.scrollIntoViewIfNeeded()
  await hablar(page, 'Abajo están los consentimientos. El aviso de privacidad y el consentimiento para datos de salud son obligatorios. Cada uno tiene un enlace para ver el texto que la paciente acepta.', 0)
  await page.getByRole('button', { name: 'ver texto' }).first().click()
  const txt = page.getByRole('dialog').last()
  await expect(txt).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(3000)
  await hablar(page, 'Este es el texto del aviso de privacidad vigente. Se puede leer en pantalla o imprimir.', 0)
  await txt.getByRole('button', { name: /Cerrar|Entendido/ }).first().click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(800)
  await page.getByText(/Leí el Aviso de privacidad/).click()
  await page.getByText(/Consentimiento expreso para tratamiento de datos de salud/).click()
  await page.getByText(/Autorización de fotografías clínicas/).click()
  await page.getByText(/Acepto recibir recordatorios de cita/).click().catch(() => {})
  await page.waitForTimeout(800)
  await hablar(page, 'La paciente acepta el aviso, los datos de salud y las fotografías clínicas dentro del expediente. Las promociones y la difusión son opcionales y quedan sin marcar.', 0)
  const pad = page.locator('canvas').last()
  await pad.scrollIntoViewIfNeeded()
  await hablar(page, 'Con una sola firma en pantalla, con el dedo, el lápiz o el ratón, queda firmado todo. La firma se guarda con fecha, hora y dispositivo, y no se puede alterar.', 0)
  await trazarFirma(page, pad)
  await page.waitForTimeout(1200)

  // ───────── 3. Guardar y abrir expediente ─────────
  await hablar(page, 'Se pulsa Guardar y abrir expediente.', 0)
  await page.getByRole('button', { name: 'Guardar y abrir expediente' }).click()
  await expect(page).toHaveURL(/\/pacientes\/[0-9a-f-]{36}$/, { timeout: 60_000 })
  await expect(page.getByText(new RegExp(`${NOMBRE} ${PATERNO}`)).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  const cuerpo = await page.locator('.pagina').first().innerText()
  const expediente = cuerpo.match(/[A-Z]{3}-EXP-\d{6}/)?.[0] ?? ''
  await hablar(page, `El paciente quedó registrado. Se abre su expediente, con el número ${expediente.replace(/-/g, ' ')}, asignado automáticamente.`)

  // ───────── 4. Expediente: resumen y documentos ─────────
  await hablar(page, 'El expediente tiene pestañas: resumen, historial de consultas, fotos clínicas, planes, documentos y consentimientos, y facturas. Como la paciente es nueva, todavía no tiene consultas.', 0)
  await page.getByRole('tab', { name: /Documentos y consentimientos/ }).click().catch(async () => { await page.getByText('Documentos y consentimientos', { exact: true }).first().click() })
  await expect(page.getByRole('heading', { name: 'Consentimientos firmados' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  const filas = await page.locator('table tbody tr').allInnerTexts()
  const tipos = filas.map(f => f.split('\t')[0].trim()).filter(Boolean)
  await hablar(page, `En documentos y consentimientos aparecen los consentimientos que firmó hoy en pantalla: ${tipos.join(', ') || 'aviso de privacidad y datos de salud'}. Cada uno con su versión, fecha y canal de firma.`)

  // ───────── 5. Lo que ve (y no ve) recepción ─────────
  await expect(page.getByText(/vista de recepción/)).toBeVisible()
  await hablar(page, 'Fíjate que la ficha dice vista de recepción, solo datos de contacto. Recepción no ve la historia clínica ni las notas de consulta: ese acceso es solo del podólogo. Por eso no hay botón de historia clínica en esta cuenta.')

  // ───────── 6. El podólogo abre la historia clínica ─────────
  await page.locator('header').getByRole('button', { name: /Recepción/ }).click()
  await page.waitForTimeout(1000)
  await hablar(page, 'Para ver la historia clínica, la recepcionista cierra su sesión y entra el podólogo con su cuenta.', 0)
  await page.getByRole('button', { name: /Cerrar sesión/ }).click()
  await entrar(page, hablar, 'p@g.com', null, '', 'El podólogo firma con su cuenta personal.')
  await v.irA(page, /^Pacientes$/)
  await hablar(page, 'Se busca a la paciente recién registrada por su nombre.', 0)
  const buscador = page.getByPlaceholder(/Nombre, N.º de expediente/).first()
  await buscador.pressSequentially(NOMBRE + ' ' + PATERNO, { delay: 80 })
  await page.waitForTimeout(2500)
  await page.getByRole('link', { name: new RegExp(NOMBRE + ' ' + PATERNO) }).first().click()
  await expect(page.getByRole('link', { name: /Historia clínica/ }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2000)
  await hablar(page, 'El expediente, visto por el podólogo, muestra más pestañas: historial de consultas, fotos clínicas y plantillas ortopédicas, además de los botones para iniciar una consulta, ver la historia clínica e imprimir.')
  await page.getByRole('link', { name: /Historia clínica/ }).first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)
  await hablar(page, 'La historia clínica reúne los datos generales, los antecedentes patológicos, heredo familiares y no patológicos, el motivo y síntomas, y la exploración física. Cada casilla admite sí, no o no sabe, porque no preguntado es distinto de no.')
  await page.getByRole('heading', { name: 'Alergias' }).scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(1500)
  await hablar(page, 'Más abajo están las alergias y los medicamentos actuales, y los consentimientos vigentes que la paciente firmó hoy en recepción: el aviso de privacidad, los datos de salud y las fotografías. La historia completa se puede imprimir en PDF o en blanco. Fin del caso.')
  await v.terminar(page, { nombre: `${NOMBRE} ${PATERNO} ${MATERNO}`, expediente, tipos })
})
