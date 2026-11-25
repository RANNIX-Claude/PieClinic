// Video Asistente de IA y dictado clínico (ambos SIMULADOS, sin llave): consulta al asistente y dictado de una nota.
// Correr: PW_LOTE=E BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-asistente-dictado
import { test, expect } from '@playwright/test'
import path from 'path'
import { iniciarGrabacion } from './lib/video-c'
import { crearVideo, escribir } from './lib/video'
import { trazarFirma } from './lib/lote-a'

test.use({ launchOptions: { slowMo: 250, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['microphone'], video: 'off', actionTimeout: 120_000 })

const v = crearVideo('vid-asistente-dictado')
const SEDE = 'Pie Clinic Chalco'
const PACIENTE = 'Raúl'
const NOTA = 'Paciente refiere dolor leve en el primer ortejo derecho; se realiza quiropodia sin complicaciones y se indica seguimiento en cuatro semanas.'

test('Asistente de IA y dictado clínico', async ({ page, context }) => {
  test.setTimeout(1_500_000)
  await v.empezar(context)
  const rec = await iniciarGrabacion(page, v.SALIDA)
  await v.firmar(page, SEDE, 'Prueba del asistente de inteligencia artificial y del dictado clínico de Pie Clinic. Las dos funciones están en modo simulado, porque todavía no hay llave de inteligencia artificial.', 'm@g.com', 'la persona de administración')
  const cuerpo = async () => await page.locator('main').first().innerText()

  // ───── Asistente ─────
  await v.irA(page, /Asistente de IA/)
  await expect(page.getByRole('heading', { name: 'Asistente de IA' })).toBeVisible({ timeout: 60_000 })
  const banner = (await cuerpo()).match(/[^\n]*simulad[^\n]*/i)?.[0]?.trim() ?? ''
  await expect(page.getByText('¿Qué quieres saber?')).toBeVisible({ timeout: 45_000 })
  const sugs = await page.locator('main button.btn.o.sm').allInnerTexts()
  await v.narrar(page, `El asistente responde sobre los datos administrativos de la clínica, solo con vistas agregadas permitidas, y cada consulta queda registrada. El aviso de arriba dice: ${banner || 'modo simulado, sin llave de IA'}. Hay ${sugs.length} preguntas sugeridas.`)
  const pregunta = sugs.find(s => /mantenimiento/i.test(s)) ?? sugs[0]
  expect(pregunta).toBeTruthy()
  await v.narrar(page, `Se escribe una pregunta: ${pregunta}`, 0)
  await escribir(page.getByPlaceholder('Escribe tu pregunta…'), pregunta)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText(/Respuesta simulada|No pude completar/).first()).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(2500)
  const resp = (await page.getByText(/Respuesta simulada|No pude completar/).first().innerText()).replace(/\s+/g, ' ')
  const fuente = (await cuerpo()).match(/Fuente: ([^·\n]*)/)?.[1]?.trim()
  await v.narrar(page, `La respuesta llega marcada como simulada: ${resp.slice(0, 260)}. ${fuente ? `La fuente consultada fue ${fuente}, y abajo se muestra la tabla con los datos reales.` : 'No se consultó ninguna vista.'} El asistente no inventa cifras: sin llave de inteligencia artificial solo resume qué vistas devolvieron datos.`)
  const segunda = '¿Cómo va la asistencia y los retardos del mes?'
  await escribir(page.getByPlaceholder('Escribe tu pregunta…'), segunda)
  await v.narrar(page, `Una segunda pregunta: ${segunda}`, 0)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText(/Respuesta simulada|No pude completar/).nth(1)).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(2500)
  await v.narrar(page, 'La conversación queda guardada en la lista de la izquierda, y se puede retomar después. Limitación: la respuesta con razonamiento de verdad requiere la llave de inteligencia artificial, y queda marcada como no corregida, requiere llave.')

  // ───── Cambio de cuenta: podólogo ─────
  await v.narrar(page, 'Ahora el dictado clínico, que es del podólogo. Se cierra la sesión de administración y firma el podólogo de la sede Chalco.', 0)
  await context.clearCookies()
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await page.goto('/app/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  await escribir(page.locator('#pf-email'), 'p@g.com')
  await escribir(page.locator('#pf-pass'), '123456')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await v.irA(page, /^Consultas/)
  await page.getByRole('link', { name: /Nueva consulta/ }).click()
  await expect(page.getByRole('heading', { name: 'Datos de la consulta' })).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'El dictado se hace dentro de una consulta abierta. Se abre una consulta nueva y se busca a la paciente.', 0)
  await page.getByPlaceholder(/Nombre, N.º de expediente/).pressSequentially(PACIENTE, { delay: 90 })
  const op = page.locator('button', { hasText: PACIENTE }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  const nomPac = (await op.innerText()).replace(/\s+/g, ' ').trim()
  await op.click()
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: /Iniciar consulta/ }).click()
  await expect(page).toHaveURL(/\/consultas\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  const folio = (await page.locator('.pagina').first().innerText()).match(/[A-Z]{3}-CON-\d+/)?.[0] ?? ''
  await v.narrar(page, `Quedó abierta la consulta ${folio.replace(/-/g, ' ')} de la paciente ${nomPac.slice(0, 60)}. En la nota hay un botón para dictar por voz.`, 0)
  await page.getByRole('link', { name: /Dictar nota por voz/ }).click()
  await expect(page.getByRole('heading', { name: 'Dictar nota por voz' })).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'La pantalla de dictado avisa que está en modo simulado. Para grabar, la paciente debe firmar antes su consentimiento para grabar su consulta y usar inteligencia artificial. Mientras no lo firme, el botón de grabar está bloqueado.')
  if (await page.getByRole('button', { name: /Registrar firma del paciente/ }).count()) {
    await expect(page.getByRole('button', { name: /Iniciar grabación/ })).toBeDisabled()
    await page.getByRole('button', { name: /Registrar firma del paciente/ }).click()
    await v.narrar(page, 'La paciente firma en pantalla su consentimiento. La firma queda como evidencia inmutable, con fecha, hora y dispositivo.', 0)
    await trazarFirma(page)
    await page.getByRole('dialog').last().getByRole('button', { name: 'Firmar', exact: true }).click()
    await expect(page.getByText(/Informado y firmado/)).toBeVisible({ timeout: 45_000 })
    await v.narrar(page, 'Con el consentimiento firmado se habilita la grabación.', 0)
  } else {
    await v.narrar(page, 'Esta paciente ya firmó antes su consentimiento de dictado, y el sistema lo reconoce con su fecha: por eso el botón de grabar ya está habilitado.', 0)
  }
  await page.getByRole('button', { name: /Iniciar grabación/ }).click()
  await expect(page.getByRole('button', { name: /Detener y transcribir/ })).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'El podólogo dicta su nota. Aquí el micrófono es un dispositivo de prueba que genera un tono, pero el contador y los controles de pausa y detener son los reales.', 3000)
  await page.getByRole('button', { name: /Detener y transcribir/ }).click()
  await expect(page.getByText('Transcripción (editable)')).toBeVisible({ timeout: 45_000 })
  const caja = page.locator('textarea').first()
  const textoSim = await caja.inputValue()
  await v.narrar(page, 'Al detener, la transcripción aparece en un cuadro editable. En modo simulado el texto trae una marca roja que dice que no es una transcripción real, y el sistema no deja pasar esa marca a la nota.', 0)
  await expect(page.getByText(/contiene la marca/)).toBeVisible()
  await page.getByRole('button', { name: /Aceptar y pasar a la nota/ }).click()
  await v.narrar(page, 'Si se intenta aceptar con la marca, el sistema lo rechaza. El podólogo debe escribir lo que realmente dictó.', 0)
  await caja.fill('')
  await caja.pressSequentially(NOTA, { delay: 25 })
  await page.getByLabel('Motivo de consulta').fill('Dolor en el primer ortejo derecho')
  await page.getByLabel('Motivo de consulta').locator('xpath=ancestor::div[1]/following-sibling::button[1]').click()
  await page.getByLabel('Próxima cita').fill('Seguimiento en cuatro semanas')
  await page.getByLabel('Próxima cita').locator('xpath=ancestor::div[1]/following-sibling::button[1]').click()
  await v.narrar(page, 'El texto se corrige a mano. Además, el podólogo estructura campos de la nota, como el motivo de consulta y la próxima cita, y decide campo por campo si los acepta. El diagnóstico nunca se propone: lo elige siempre el podólogo.', 0)
  await page.getByRole('button', { name: /Aceptar y pasar a la nota/ }).click()
  await expect(page).toHaveURL(/\/consultas\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  await expect(page.locator('textarea', { hasText: 'quiropodia sin complicaciones' }).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'La nota vuelve a la consulta con el texto dictado y revisado, marcada como originada por dictado. Nada queda firmado hasta que el podólogo firme la consulta. Limitación: la transcripción automática real requiere la llave de inteligencia artificial, y queda marcada como no corregida, requiere llave. Fin del recorrido.')
  await rec.detener()
  await v.terminar(page, { folio, paciente: nomPac, pregunta, segunda, textoSim: textoSim.slice(0, 120), nota: NOTA })
  rec.construir(path.join(v.SALIDA, 'pantalla.mp4'))
})
