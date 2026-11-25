// Video CITA-A: agendar una cita (paciente, servicio, podólogo, horario libre) y verla en la agenda.
// Correr: BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts cita-agendar
import { test, expect } from '@playwright/test'
import { crearVideo } from './lib/video'

const SEDE = 'Centenario'
const v = crearVideo('cita-agendar')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('Agenda: agendar una cita', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de agenda de Pie Clinic. Caso: agendar una cita nueva para una paciente que llama por teléfono.')
  await v.irA(page, /^Agenda$/)
  await v.narrar(page, 'Esta es la agenda del día de la sucursal Centenario: una columna por podólogo, con las citas de cada uno y su estado por color.')
  await v.narrar(page, 'Una paciente llama para pedir cita. Se pulsa Nueva cita.', 0)
  await page.getByRole('button', { name: /Nueva cita/ }).click()
  await expect(page.getByRole('heading', { name: 'Datos de la cita' })).toBeVisible({ timeout: 30_000 })

  // Paciente
  await v.narrar(page, 'Primero se busca a la paciente, por nombre, teléfono o número de expediente.', 0)
  await page.getByPlaceholder(/Buscar paciente/).pressSequentially('mar', { delay: 120 })
  const op = page.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).first()
  await expect(op).toBeVisible({ timeout: 30_000 })
  const nombre = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1200)
  await op.click()
  await v.narrar(page, `Se elige a ${nombre}. El sistema muestra su expediente y su teléfono.`)

  // Servicio
  const servicio = page.getByLabel('Servicio', { exact: true })
  await servicio.selectOption({ label: 'Quiropodia · 30 min' })
  const servTxt = (await servicio.locator('option:checked').innerText()).trim()
  await v.narrar(page, `El servicio solicitado es: ${servTxt.replace('·', ', ')}. Al elegirlo, el sistema llena la duración y el precio vigente de esta sucursal.`)
  const precio = await page.getByLabel('Precio del servicio').inputValue()

  // Podólogo
  const pod = page.getByLabel('Podólogo', { exact: true })
  const opciones = await pod.locator('option').allInnerTexts()
  const iPod = opciones.findIndex((t, i) => i > 0 && /Paulina Soto/.test(t))
  await pod.selectOption({ index: iPod })
  const podTxt = (await pod.locator('option:checked').innerText()).trim()
  await v.narrar(page, `Se asigna al podólogo ${podTxt}. El precio del servicio es de ${precio} pesos.`, 0)

  // Fecha con horarios libres
  await v.narrar(page, 'Ahora la fecha. A la derecha, el sistema muestra solo los horarios realmente libres: respeta la agenda del podólogo, los bloqueos y los días festivos.', 0)
  let hay = 0, fecha = ''
  for (let d = 1; d <= 8 && !hay; d++) {
    const f = new Date(); f.setDate(f.getDate() + d); fecha = iso(f)
    await page.getByLabel('Fecha', { exact: true }).fill(fecha)
    await page.waitForTimeout(2500)
    hay = await page.locator('h3', { hasText: 'Disponibilidad' }).locator('xpath=following-sibling::div[1]//button').count()
  }
  await v.narrar(page, `Para el ${new Date(fecha + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} hay ${hay} horarios libres.`)
  const slot = page.locator('h3', { hasText: 'Disponibilidad' }).locator('xpath=following-sibling::div[1]//button').nth(1)
  const hora = (await slot.innerText()).trim()
  await slot.click()
  await page.waitForTimeout(1200)
  await v.narrar(page, `Se elige el horario de las ${hora}. El campo de hora se llena solo.`, 0)
  await expect(page.getByRole('button', { name: 'Agendar cita' })).toBeEnabled()
  await v.narrar(page, 'Abajo se puede agregar una nota para el podólogo. Se escribe que la paciente tiene uñas encarnadas.', 0)
  await page.getByLabel(/Notas de la cita/).pressSequentially('Paciente con molestia por uña encarnada en el dedo gordo', { delay: 60 })
  await v.narrar(page, 'El botón Agendar cita ya está habilitado: no hay empalmes ni bloqueos. Se pulsa.', 0)
  await page.getByRole('button', { name: 'Agendar cita' }).click()
  await expect(page).toHaveURL(/\/agenda\?dia=/, { timeout: 45_000 })
  await page.waitForTimeout(4000)
  await v.narrar(page, 'La cita quedó registrada, y la agenda se abre en ese día.')
  await expect(page.getByText(nombre.split(' ')[0]).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, `Ahí aparece la cita de ${nombre} a las ${hora}, en la columna de ${podTxt}, en estado por confirmar. Después, el sistema le envía el recordatorio. Fin del caso.`)
  await v.terminar(page, { nombre, servTxt, podTxt, fecha, hora, precio })
})
