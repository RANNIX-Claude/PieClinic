// Video VID-D4: lista de espera y recordatorios. Una paciente pide cita y no hay lugar: se da de alta en la lista de espera,
// luego se agenda desde la lista y se programa/reenvía su recordatorio (mensajería simulada). Lote D.
// Correr: PW_LOTE=D BASE_URL=http://localhost:5184 npx playwright test -c playwright.caja.config.ts vid-lista-espera
import { test, expect } from '@playwright/test'
import { crearVideo } from './lib/video'

const SEDE = 'Centenario'
const v = crearVideo('vid-lista-espera')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const largo = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

test('Lista de espera y recordatorios', async ({ page, context }) => {
  test.setTimeout(25 * 60_000)
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de lista de espera y recordatorios de Pie Clinic. Caso: una paciente pide cita y no hay lugar; se da de alta en la lista de espera, se agenda desde la lista y se programa su recordatorio.')
  await v.irA(page, /^Agenda$/)
  await v.narrar(page, 'La paciente llama y pide una quiropodia con la podóloga Paulina Soto, pero para el domingo. Se pulsa Nueva cita para buscarle lugar.', 0)
  await page.getByRole('button', { name: /Nueva cita/ }).click()
  await expect(page.getByRole('heading', { name: 'Datos de la cita' })).toBeVisible({ timeout: 30_000 })

  await page.getByPlaceholder(/Buscar paciente/).pressSequentially('arace', { delay: 120 })
  const op = page.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  const nombre = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1200)
  await op.click()
  await page.getByLabel('Servicio', { exact: true }).selectOption({ label: 'Quiropodia · 30 min' })
  const pod = page.getByLabel('Podólogo', { exact: true })
  const opciones = await pod.locator('option').allInnerTexts()
  await pod.selectOption({ index: opciones.findIndex((t, i) => i > 0 && /Paulina Soto/.test(t)) })
  const podTxt = (await pod.locator('option:checked').innerText()).trim()
  const dom = new Date(); dom.setDate(dom.getDate() + ((7 - dom.getDay()) % 7 || 7))
  await page.getByLabel('Fecha', { exact: true }).fill(iso(dom))
  await page.waitForTimeout(3500)
  await expect(page.getByText('No hay horarios libres ese día')).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, `Se busca a ${nombre}, se elige el servicio quiropodia y la podóloga ${podTxt}. Para el ${largo(iso(dom))} el sistema responde que no hay horarios libres ese día: la podóloga no trabaja los domingos.`, 0)
  await v.narrar(page, 'En lugar de decirle que no, recepción pulsa el botón: Si no hay lugar, agregar a lista de espera.', 0)
  await page.getByRole('button', { name: /agregar a lista de espera/ }).click()
  await expect(page).toHaveURL(/lista-espera/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)

  // Lista de espera
  const fila = page.locator('tbody tr', { hasText: nombre }).first()
  await expect(fila).toBeVisible({ timeout: 30_000 })
  const kpi = (await page.locator('.kpi, [class*=kpi]').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  const celdas = (await fila.locator('td').allInnerTexts()).map(s => s.trim())
  await fila.scrollIntoViewIfNeeded()
  await v.narrar(page, `La paciente queda en la lista de espera: ${celdas[1]}, servicio ${celdas[3]}, podólogo preferido ${celdas[4]}, de la sede ${celdas[5]}, con prioridad ${celdas[0]} y estado ${celdas[10].toLowerCase()}. Los indicadores de arriba cuentan cuántos esperan, cuántos huecos liberados coinciden y cuántos ya se agendaron.`, 0)
  await v.narrar(page, 'Recepción asigna la prioridad con criterio clínico, y la lista respeta la prioridad antes que la antigüedad. Cada solicitud vence a los catorce días, y se puede reactivar.', 0)

  // Hueco: se libera lugar -> se agenda desde la lista
  await v.narrar(page, 'Pasa el tiempo y se libera un lugar con la podóloga. Se pulsa Agendar en el renglón de la paciente, y el sistema abre la cita con el paciente, el servicio y la podóloga ya capturados.', 0)
  await fila.getByRole('button', { name: 'Agendar' }).click()
  await expect(page.getByRole('heading', { name: 'Datos de la cita' })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  await expect(page.getByLabel('Servicio', { exact: true }).locator('option:checked')).toContainText('Quiropodia')
  let hay = 0, fecha = ''
  for (let d = 1; d <= 9 && !hay; d++) {
    const f = new Date(); f.setDate(f.getDate() + d); fecha = iso(f)
    await page.getByLabel('Fecha', { exact: true }).fill(fecha)
    await page.waitForTimeout(2500)
    hay = await page.locator('h3', { hasText: 'Disponibilidad' }).locator('xpath=following-sibling::div[1]//button').count()
  }
  const slot = page.locator('h3', { hasText: 'Disponibilidad' }).locator('xpath=following-sibling::div[1]//button').nth(3)
  const hora = (await slot.innerText()).trim()
  await slot.click()
  await page.waitForTimeout(1200)
  await v.narrar(page, `Esta vez sí hay horarios: el ${largo(fecha)}. Se elige el de las ${hora}. La confirmación con liga queda activada, para que la paciente pueda confirmar o reprogramar por su cuenta.`, 0)
  await page.getByRole('button', { name: 'Agendar cita' }).click()
  await expect(page).toHaveURL(/\/agenda\?dia=/, { timeout: 45_000 })
  await page.waitForTimeout(3500)
  await expect(page.getByText(nombre.split(' ')[0]).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, `La cita queda agendada en la agenda del ${largo(fecha)}, a las ${hora}.`, 0)

  // Estado en la lista
  await v.irA(page, /Lista de espera/)
  await page.locator('select', { hasText: 'Estado: todos' }).selectOption({ label: 'Agendado' })
  await page.waitForTimeout(2000)
  const filaAg = page.locator('tbody tr', { hasText: nombre }).first()
  await expect(filaAg).toBeVisible({ timeout: 30_000 })
  const estadoAg = (await filaAg.locator('td').nth(10).innerText()).trim()
  await v.narrar(page, `Al volver a la lista y filtrar por estado Agendado, la paciente aparece como ${estadoAg.toLowerCase()}, con un botón para ver su cita. Sale de la fila de espera sin que nadie la tenga que quitar a mano.`, 0)

  // Recordatorio: reenviar desde la cita
  await v.irA(page, /^Agenda$/)
  await page.goto(`/app/agenda?dia=${fecha}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)
  const cita = page.getByText(nombre.split(' ')[0]).first()
  await expect(cita).toBeVisible({ timeout: 45_000 })
  await cita.click()
  const dlg = page.getByRole('dialog').last()
  const folio = (await dlg.getByRole('heading').first().innerText()).replace('Cita ', '').trim()
  await v.narrar(page, `Ahora el recordatorio. En el detalle de la cita ${folio}, el botón Reenviar recordatorio programa un mensaje para la paciente.`, 0)
  await dlg.getByRole('button', { name: /Reenviar recordatorio/ }).click()
  await expect(page.getByText(/Recordatorio programado/)).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'El sistema avisa: recordatorio programado, con envío simulado, porque la clínica todavía no tiene proveedor de mensajería. No sale ningún mensaje real.', 0)
  await dlg.getByRole('button', { name: 'Cerrar' }).click()
  await v.irA(page, /Recordatorios/)
  await page.waitForTimeout(2500)
  await expect(page.getByText(/Modo simulado/).first()).toBeVisible()
  await v.narrar(page, 'En Recordatorios y notificaciones está la cola de mensajes. El aviso amarillo repite que el envío es simulado.', 0)
  const buscador = page.getByPlaceholder(/Buscar/).first()
  if (await buscador.isVisible().catch(() => false)) { await buscador.pressSequentially(folio, { delay: 60 }); await page.waitForTimeout(1500) }
  const filaRec = page.locator('tbody tr', { hasText: folio }).first()
  await expect(filaRec).toBeVisible({ timeout: 30_000 })
  const r = (await filaRec.locator('td').allInnerTexts()).map(s => s.trim())
  await filaRec.scrollIntoViewIfNeeded()
  await v.narrar(page, `Ahí está el mensaje de la cita ${folio}: tipo ${r[0]}, para ${r[1]}, por el canal ${r[3]}, con destino ${r[4]}, programado para ${r[5]}, en estado ${r[7].toLowerCase()}. Los mensajes fallidos u omitidos muestran un botón Reenviar.`, 0)
  await page.getByRole('tab', { name: /Reglas/ }).or(page.getByRole('button', { name: /^Reglas$/ })).first().click()
  await page.waitForTimeout(1500)
  const horas = await page.getByLabel(/Primer aviso/).inputValue()
  await v.narrar(page, `En la pestaña Reglas, el administrador define cuántas horas antes se avisa, ahora ${horas}, el canal por defecto y un segundo aviso opcional; ahí mismo están la ventana de la lista de espera y los días de vencimiento. Fin del caso.`)
  await v.terminar(page, { nombre, podTxt, fecha, hora, folio, domingo: iso(dom), celdas, r, estadoAg, kpi })
})
