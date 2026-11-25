// Video VID-C3: quejas e incidencias — recepción registra una queja, la asigna y le da seguimiento; administración la resuelve y la cierra.
// Correr: PW_LOTE=C BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-quejas
import { test, expect as expectBase } from '@playwright/test'
import { crearVideo, escribir } from './lib/video'
import { firmarCon, cerrarSesion, iniciarGrabacion } from './lib/video-c'
import path from 'path'

const SEDE = 'Pie Clinic Centenario'
test.use({ launchOptions: { slowMo: 150 }, video: 'off' })   // video propio por pantallazos (ver iniciarGrabacion): el webm de Playwright salía truncado con la máquina cargada
const expect = expectBase.configure({ timeout: 45_000 })   // la máquina compartida va lenta: las pantallas tardan en cargar
const v = crearVideo('vid-quejas')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DESC = 'Esperó 40 minutos en sala pasada su hora de cita y nadie le avisó del retraso.'

test('Quejas: registrar, dar seguimiento y cerrar', async ({ page, context }) => {
  test.setTimeout(40 * 60_000)   // la máquina compartida va lenta; la prueba espera la voz de cada marca
  await v.empezar(context)
  const rec = await iniciarGrabacion(page, v.SALIDA)
  await firmarCon(page, v.narrar, 'recepcion', SEDE, 'Prueba de quejas e incidencias de Pie Clinic. Caso: una paciente se queja del tiempo de espera. Recepción la registra, y administración le da seguimiento, la resuelve y la cierra.')
  await v.irA(page, /^Quejas e incidencias$/)
  await expect(page.getByRole('heading', { name: 'Quejas e incidencias' })).toBeVisible()
  const abiertasAntes = (await page.locator('.kpi, [class*=kpi]').filter({ hasText: 'Quejas abiertas' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  await v.narrar(page, 'Esta es la pantalla de quejas e incidencias. Arriba están las quejas abiertas, las del mes, el tiempo medio de resolución, con meta de tres días, y la satisfacción de los pacientes después de resolver. Abajo, la lista de quejas con su gravedad y su estado.')
  await v.narrar(page, 'Una paciente llama para quejarse. Recepción pulsa Registrar queja o incidencia.', 0)
  await page.getByRole('button', { name: /Registrar queja o incidencia/ }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg.getByText('Registrar queja o incidencia').first()).toBeVisible({ timeout: 30_000 })

  // Paciente
  await v.narrar(page, 'La paciente se busca por nombre, expediente o celular. Es opcional, salvo en los eventos adversos clínicos.', 0)
  await escribir(dlg.getByPlaceholder(/Nombre, N.º de expediente/), 'mar')
  const op = dlg.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  const nombre = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1000)
  await op.click()
  await v.narrar(page, `Se elige a ${nombre}.`)

  // Clasificación
  await dlg.getByLabel('Tipo', { exact: true }).selectOption({ label: 'Tiempo de espera excesivo' })
  await dlg.getByLabel('Gravedad', { exact: true }).selectOption({ label: 'Media' })
  await dlg.getByLabel('Canal', { exact: true }).selectOption({ label: 'Llamada' })
  await v.narrar(page, 'Se clasifica: clase administrativa, tipo tiempo de espera excesivo, gravedad media, y llegó por llamada. Las quejas de un procedimiento clínico se marcan como evento adverso y exigen ligar la sesión.', 0)
  await dlg.getByLabel('Sede', { exact: true }).selectOption({ label: SEDE })
  await dlg.getByLabel('Descripción de la queja').scrollIntoViewIfNeeded()
  await escribir(dlg.getByLabel('Descripción de la queja'), DESC)
  await v.narrar(page, 'Se describe lo que pasó con las palabras de la paciente: esperó cuarenta minutos en sala y nadie le avisó del retraso.', 0)
  const resp = dlg.getByLabel('Responsable de seguimiento')
  const nOp = await resp.locator('option').count()
  let responsable = ''
  if (nOp > 1) { await resp.selectOption({ index: 1 }); responsable = (await resp.locator('option:checked').innerText()).trim() }
  const compromiso = new Date(); compromiso.setDate(compromiso.getDate() + 3)
  await dlg.getByLabel('Fecha compromiso').fill(iso(compromiso))
  await v.narrar(page, `Se asigna un responsable de seguimiento${responsable ? ', ' + responsable : ''}, y una fecha compromiso a tres días, que es la meta de la clínica.`, 0)
  await dlg.getByRole('button', { name: 'Registrar', exact: true }).click()
  await expect(dlg).toBeHidden({ timeout: 45_000 })
  await page.waitForTimeout(3000)
  const fila = page.locator('tbody tr').filter({ hasText: nombre }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const folio = (await fila.locator('b').first().innerText()).trim()
  expect(folio).toMatch(/-QJ-\d+/)
  await v.narrar(page, `La queja queda registrada con el folio ${folio}, en estado nueva, y aparece al principio de la lista.`)

  // Recepción consulta el detalle (solo lectura)
  await v.narrar(page, 'Se abre la queja para ver su detalle.', 0)
  await fila.click()
  await expect(page.getByRole('heading', { name: new RegExp('Detalle ' + folio) })).toBeVisible()
  await expect(page.getByText(/Recepción registra y consulta la queja/)).toBeVisible()
  await v.narrar(page, 'El detalle muestra quién la registró, el canal, la fecha y hora, la gravedad, la paciente y la descripción. Un aviso recuerda que Recepción registra y consulta la queja, pero el seguimiento, la resolución y el cierre los hace Administración o el responsable asignado.')
  await v.narrar(page, 'Se cierra la sesión de recepción, y entra la administradora.', 0)
  await cerrarSesion(page)

  // Administración: seguimiento
  await firmarCon(page, v.narrar, 'admin', SEDE)
  await v.irA(page, /^Quejas e incidencias$/)
  const fila2 = page.locator('tbody tr').filter({ hasText: folio }).first()
  await expect(fila2).toBeVisible()
  await v.narrar(page, `La administradora encuentra la queja ${folio} en la lista, en estado nueva. La abre para darle seguimiento.`, 0)
  await fila2.click()
  await expect(page.getByRole('heading', { name: new RegExp('Detalle ' + folio) })).toBeVisible()
  await page.getByLabel('Estado', { exact: true }).scrollIntoViewIfNeeded()
  await page.getByLabel('Estado', { exact: true }).selectOption({ label: 'en revision' })
  await v.narrar(page, 'Ya habló con la responsable asignada y cambia el estado a en revisión. Los estados siguen un orden: nueva, en revisión, escalada, resuelta y cerrada.', 0)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Queja actualizada').first()).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Registrar notificación al paciente' }).click()
  await expect(page.getByText('Queja actualizada').first()).toBeVisible()
  await page.waitForTimeout(1500)
  await v.narrar(page, 'Además registra que ya se avisó a la paciente que su queja se está atendiendo. El envío automático de mensajes necesita el proveedor de mensajería, que todavía no está configurado.')

  // Resolución
  await page.getByLabel('Resolución / acción correctiva').scrollIntoViewIfNeeded()
  await escribir(page.getByLabel('Resolución / acción correctiva'), 'Se ofreció una disculpa a la paciente. Se reforzó el aviso de retrasos desde recepción.')
  await page.getByLabel('Compensación', { exact: true }).selectOption({ label: 'Disculpa' })
  await v.narrar(page, 'Administración escribe la resolución y la acción correctiva: se ofreció una disculpa y se reforzó el aviso de retrasos desde recepción. La compensación es una disculpa, que no tiene costo. Las compensaciones con costo las autoriza solo Administración.', 0)
  await page.getByRole('button', { name: 'Marcar resuelta' }).click()
  await expect(page.getByRole('button', { name: 'Cerrar', exact: true }).last()).toBeVisible()
  await page.waitForTimeout(2000)
  await v.narrar(page, 'La queja queda resuelta. El sistema cuenta los días que estuvo abierta para el tiempo medio de resolución.', 0)
  await v.narrar(page, 'Se crea la encuesta de satisfacción de la paciente.', 0)
  await page.getByRole('button', { name: 'Crear encuesta de satisfacción' }).click()
  await expect(page.getByText(/Encuesta creada/).first()).toBeVisible()
  await page.waitForTimeout(2500)
  await v.narrar(page, 'El envío real de la encuesta queda pendiente del proveedor de mensajes, y así lo avisa el sistema.')
  await v.narrar(page, 'Con la queja resuelta y la paciente atendida, se pulsa Cerrar.', 0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await page.waitForTimeout(2500)

  // Verificar en lista
  await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click().catch(() => {})
  await page.locator('select', { hasText: 'Estado: abiertas' }).selectOption({ label: 'cerrada' })
  await page.waitForTimeout(2000)
  const filaC = page.locator('tbody tr').filter({ hasText: folio }).first()
  await expect(filaC).toBeVisible()
  await expect(filaC).toContainText(/cerrada/i)
  await filaC.scrollIntoViewIfNeeded()
  await v.narrar(page, `Al filtrar por estado cerrada aparece la queja ${folio} de ${nombre}, con su resolución y los días que estuvo abierta. Así termina el caso: registrada por recepción, atendida y cerrada por administración.`)
  await rec.detener()
  await v.terminar(page, { nombre, folio, responsable, abiertasAntes })
  rec.construir(path.join(v.SALIDA, 'pantalla.mp4'))
})
