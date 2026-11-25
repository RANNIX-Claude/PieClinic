// Video VID-D2: el paciente reserva su cita por el portal SIN cuenta (sede, servicio, podólogo, horario, datos, anticipo con pago simulado)
// y la recepción la ve en la agenda. Lote D.
// Correr: PW_LOTE=D BASE_URL=http://localhost:5184 npx playwright test -c playwright.caja.config.ts vid-portal-reservar
// (5184 = demo/vite.funciones.config.mjs: Vite + la función simulada de Clip, que el servidor de desarrollo normal no atiende)
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { crearVideo, escribir, CLAVE, EMAIL_RECEPCION } from './lib/video'

const SLUG = 'pie-clinic-sintetico'
const v = crearVideo('vid-portal-reservar')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Paciente de la reserva (se guarda para que el video del enlace personal lo reutilice)
const PAC = { nombre: 'Marisol', apellidos: 'Archundia Téllez', nacimiento: '1985-04-12', celular: '5512340077', correo: 'marisol.archundia@example.com' }

test('Portal: el paciente reserva su cita sin cuenta y recepción la ve en la agenda', async ({ page, context }) => {
  test.setTimeout(25 * 60_000)
  await v.empezar(context)
  await page.goto(`/app/reservar/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await expect(page.getByRole('heading', { name: /Elige la sede/ })).toBeVisible({ timeout: 120_000 })
  await v.narrar(page, 'Prueba del portal del paciente de Pie Clinic. Caso: una paciente reserva su cita desde su celular o su computadora, sin crear cuenta ni iniciar sesión, y la recepción de la clínica la ve en la agenda.')
  await v.narrar(page, 'La liga pública de la clínica abre el portal de reservas. Arriba, los cinco pasos: sede, servicio, podólogo, horario, y datos y pago. Primero se elige la sede.', 0)
  await page.getByRole('button', { name: /^Centenario/ }).first().click()
  await expect(page.getByRole('heading', { name: /Elige el servicio/ })).toBeVisible()
  await v.narrar(page, 'Se elige la sede Centenario. Ahora aparece el catálogo de servicios que la clínica publica en línea, con su duración y su precio.', 0)
  const quiro = page.getByRole('button', { name: /^Quiropodia/ }).first()
  const textoQ = (await quiro.innerText()).replace(/\s+/g, ' ')
  const precio = textoQ.match(/\$([\d,]+\.\d\d)/)?.[1] ?? ''
  await v.narrar(page, `La paciente elige Quiropodia, de treinta minutos, con un precio de ${precio} pesos.`, 0)
  await quiro.click()
  await expect(page.getByRole('heading', { name: /Elige a tu podólogo/ })).toBeVisible()
  await v.narrar(page, 'Puede escoger a un podólogo en particular o dejar que el sistema le asigne el primer horario libre. Elige: cualquiera disponible.', 0)
  await page.getByRole('button', { name: /Cualquiera disponible/ }).click()
  await expect(page.getByRole('heading', { name: /Elige día y horario/ })).toBeVisible()
  await page.waitForTimeout(3000)

  // Primer día futuro con horarios
  await v.narrar(page, 'El portal muestra la semana con los horarios realmente libres: respeta la agenda de los podólogos, las citas ya tomadas y los días festivos.', 0)
  const hoyN = new Date()
  let dia = '', horaTxt = '', slotBtn = page.locator('button.btn').first()
  for (let intento = 0; intento < 2 && !dia; intento++) {
    for (let d = 1; d <= 7 && !dia; d++) {
      const f = new Date(hoyN); f.setDate(f.getDate() + d)
      const tarjeta = page.locator('div.card', { has: page.locator(`div:text-matches("^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom) ${String(f.getDate()).padStart(2, '0')}$")`) }).first()
      const btns = tarjeta.locator('button.btn')
      if (await btns.count() >= 3) { dia = iso(f); slotBtn = btns.nth(4 < (await btns.count()) ? 4 : 2); horaTxt = (await slotBtn.innerText()).trim() }
    }
    if (!dia) { await page.getByRole('button', { name: 'Semana siguiente' }).click(); await page.waitForTimeout(2500) }
  }
  expect(dia).not.toBe('')
  const fechaLarga = new Date(dia + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  await slotBtn.scrollIntoViewIfNeeded()
  await v.narrar(page, `Se elige el ${fechaLarga} a las ${horaTxt}.`, 0)
  await slotBtn.click()
  await expect(page.getByText('Resumen de tu cita')).toBeVisible()
  const anticipoTxt = (await page.locator('tr', { hasText: 'Anticipo para apartar' }).innerText()).replace(/\s+/g, ' ')
  const anticipo = anticipoTxt.match(/\$([\d,]+\.\d\d)/)?.[1] ?? ''
  await v.narrar(page, `Aparece el resumen de la cita: sede, servicio, fecha, duración, el precio de ${precio} pesos y un anticipo para apartar el lugar de ${anticipo} pesos. Se continúa a los datos y al pago.`, 0)
  await page.getByRole('button', { name: /Continuar a tus datos y pago/ }).click()
  await expect(page.getByRole('heading', { name: /Tus datos y pago/ })).toBeVisible()

  // Datos
  await v.narrar(page, 'Ahora los datos de la paciente. No necesita contraseña: solo nombre, fecha de nacimiento, celular y correo.', 0)
  await escribir(page.getByLabel(/Nombre\(s\)/), PAC.nombre)
  await escribir(page.getByLabel(/Apellidos/), PAC.apellidos)
  await page.getByLabel(/Fecha de nacimiento/).fill(PAC.nacimiento)
  await page.getByLabel(/^Sexo/).selectOption({ label: 'Mujer' })
  await escribir(page.getByLabel(/Celular/), PAC.celular)
  await escribir(page.getByLabel(/Correo electrónico/), PAC.correo)
  await page.getByLabel('Sí', { exact: true }).check()
  await escribir(page.getByLabel(/Motivo de la consulta/), 'Callosidad dolorosa en el talón derecho')
  await v.narrar(page, 'Indica que es su primera vez en la clínica y el motivo de la consulta. Al final, los consentimientos: el aviso de privacidad y los términos de la reserva son obligatorios; los recordatorios y las fotos son opcionales.', 0)
  await page.getByLabel(/Leí y acepto el/).check()
  await page.getByLabel(/Acepto los/).check()
  await page.waitForTimeout(1200)
  const anticipoHoy = (await page.locator('tr', { hasText: 'Anticipo hoy' }).innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `A la derecha, el resumen: ${anticipoHoy.replace('Anticipo hoy', 'el anticipo de hoy es de').replace('$', '').trim()} pesos, y el resto se paga en la clínica. Al pulsar Continuar al pago, el horario queda apartado unos minutos.`, 0)
  await page.getByRole('button', { name: /Continuar al pago/ }).click()
  await expect(page.getByRole('heading', { name: /Pago del anticipo/ })).toBeVisible({ timeout: 60_000 })

  // Pago simulado
  const reloj = (await page.getByText(/Tu horario está apartado/).innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `Esta es la pantalla de pago del anticipo. Un reloj muestra cuánto tiempo queda para pagar: ${reloj.replace('Tu horario está apartado: ', 'quedan ')}. Si se agota, el horario se libera.`, 0)
  await v.narrar(page, 'El aviso amarillo dice que el cobro es simulado: la clínica todavía no tiene su llave de Clip, así que no se cobra ninguna tarjeta real. Se usa la tarjeta de prueba aprobada.', 0)
  await escribir(page.getByLabel(/Número de tarjeta/), '4242 4242 4242 4242')
  await escribir(page.getByLabel(/Vigencia/), '12/28')
  await page.getByLabel(/CVV/).fill('123')
  await escribir(page.getByLabel(/Nombre en la tarjeta/), 'MARISOL ARCHUNDIA')
  await v.narrar(page, `Se captura la tarjeta, su vigencia, el código de seguridad y el nombre. Se pulsa Pagar ${anticipo} pesos y reservar.`, 0)
  await page.getByRole('button', { name: /Pagar .* y reservar/ }).click()
  await expect(page.getByRole('heading', { name: /Cita confirmada/ })).toBeVisible({ timeout: 90_000 })
  const folio = (await page.locator('p', { hasText: /^Folio/ }).locator('b').innerText()).trim()
  await v.narrar(page, `La cita queda confirmada con el folio ${folio}. La pantalla repite el servicio, la fecha y la sede, indica que el anticipo está pagado y entrega la liga personal para que la paciente confirme, reprograme o cancele sin cuenta.`)
  const ligaHref = await page.getByRole('link', { name: 'Administrar mi cita' }).getAttribute('href')
  expect(ligaHref).toMatch(/\/cita\//)
  await v.narrar(page, 'Abajo se aclara que los correos y mensajes salen hasta que la clínica active su proveedor de mensajería; por ahora la mensajería también es simulada.', 0)

  // Recepción la ve en la agenda
  await v.narrar(page, 'Ahora, del lado de la clínica. La recepcionista inicia sesión con su cuenta.', 0)
  await page.goto('/app/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#pf-email').waitFor({ timeout: 60_000 })
  await escribir(page.locator('#pf-email'), EMAIL_RECEPCION)
  await escribir(page.locator('#pf-pass'), CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await v.cambiarSede(page, 'Centenario')
  await v.irA(page, /^Agenda$/)
  await page.goto(`/app/agenda?dia=${dia}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)
  await v.narrar(page, `Abre la agenda de la sede Centenario en el día de la cita, el ${fechaLarga}.`, 0)
  const cita = page.getByText(PAC.nombre).first()
  await expect(cita).toBeVisible({ timeout: 45_000 })
  await cita.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await v.narrar(page, `Ahí está la reserva de ${PAC.nombre} ${PAC.apellidos}, a las ${horaTxt}, en la columna del podólogo que el sistema le asignó. La paciente quedó dada de alta como paciente nueva sin que nadie capturara nada.`, 0)
  await cita.click()
  await expect(page.getByRole('dialog').getByText(`Cita ${folio}`).or(page.getByText(folio).first())).toBeVisible({ timeout: 30_000 })
  const podTxt = (await page.getByRole('dialog').locator('tr', { hasText: 'Podólogo' }).first().innerText()).replace(/\s+/g, ' ').replace('Podólogo ', '').trim()
  const origenTxt = (await page.getByRole('dialog').locator('tr', { hasText: 'Origen' }).first().innerText()).replace(/\s+/g, ' ')
  const antTxt = (await page.getByRole('dialog').locator('div.card', { hasText: 'Anticipo' }).first().innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `En el detalle de la cita ${folio}: el podólogo asignado es ${podTxt}; el ${origenTxt.toLowerCase().replace('origen', 'origen de la cita:')}. Y el cuadro de anticipo muestra el pago de la reserva: ${antTxt}.`, 0)
  await v.narrar(page, 'Con esto termina el caso: la paciente reservó y pagó su anticipo sin cuenta, y la recepción ya la tiene en la agenda. Fin del caso.')
  fs.writeFileSync(path.join(v.SALIDA, 'datos-reserva.json'), JSON.stringify({ folio, dia, horaTxt, ligaHref, PAC, podTxt }, null, 2))
  await v.terminar(page, { folio, dia, horaTxt, podTxt, precio, anticipo, ligaHref })
})
