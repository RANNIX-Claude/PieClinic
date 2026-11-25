// Video CITA-COBRAR: cobrar en Caja una cita ya atendida (de la agenda al ticket impreso).
// Requiere una cita atendida y sin cobro en Chalco (la deja demo/consulta-clinica.spec.ts al firmar la consulta).
// Correr: PW_LOTE=A BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts cita-cobrar
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras, escribir } from './lib/video'
import { entrar, verTicket, quitarTicket } from './lib/lote-a'

const v = crearVideo('cita-cobrar')
const hablar = process.env.RAPIDO ? async (_p: unknown, _t?: string, _e?: number) => {} : v.narrar
const SEDE = 'Chalco'
const PAC = process.env.PAC_NOMBRE ?? 'Valeria'

test('Cobrar una cita desde la caja', async ({ page, context }) => {
  await v.empezar(context)
  await entrar(page, hablar, 'r@g.com', SEDE,
    'Prueba de caja de Pie Clinic. Caso: cobrar una cita que el podólogo ya atendió, desde la agenda hasta el ticket impreso.',
    'Primero, la recepcionista firma con su cuenta personal y elige la sucursal Chalco, que es donde está su caja.')

  // ───────── 1. La cita atendida en la agenda ─────────
  await v.irA(page, /^Agenda$/)
  await hablar(page, 'En la agenda del día aparece la cita que el podólogo acaba de atender. Al firmar su nota, el sistema la pasó sola al estado atendida.', 0)
  const tarjeta = page.getByText(new RegExp(PAC)).first()
  await expect(tarjeta).toBeVisible({ timeout: 30_000 })
  await tarjeta.click()
  const modal = page.getByRole('dialog').last()
  await expect(modal.getByText('Quiropodia').first()).toBeVisible({ timeout: 20_000 })
  const dato = async (k: string) => (await modal.locator('tr', { hasText: k }).first().locator('td').nth(1).innerText()).trim()
  const paciente = await dato('Paciente'), servicio = await dato('Servicio'), podologo = await dato('Podólogo'), precio = await dato('Precio'), horario = await dato('Horario')
  const estado = (await modal.locator('.bd, [class*=badge]').first().innerText().catch(() => '')).trim()
  await expect(modal.getByText(/Atendida/i).first()).toBeVisible()
  await hablar(page, `El detalle de la cita muestra a ${paciente}, servicio ${servicio}, con ${podologo}, horario ${horario.replace('–', 'a')}, precio ${precio.replace('$', '')} pesos y estado atendida. Aquí está el botón Cobrar.`, 0)
  await page.waitForTimeout(500)
  await hablar(page, 'Se pulsa Cobrar y la cita pasa a la pantalla de Caja.', 0)
  await modal.getByRole('button', { name: /Cobrar/ }).click()
  await expect(page).toHaveURL(/\/caja\?cita=/, { timeout: 30_000 })

  // ───────── 2. Turno de caja ─────────
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(5000)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.isVisible().catch(() => false)) {
    await hablar(page, 'Para cobrar necesita abrir su turno de caja, con el fondo inicial.', 0)
    await page.getByLabel('Fondo inicial').fill('1000')
    await abrir.click()
    await page.waitForTimeout(3500)
  }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 40_000 })
  const barra = (await page.locator('.cj-barra').innerText().catch(() => '')).replace(/\s+/g, ' ')
  await hablar(page, 'La barra superior confirma la sucursal Chalco, la caja y el turno abierto. Esta es la pantalla de cobro de la sucursal.', 0)

  // ───────── 3. Ticket precargado con la cita ─────────
  await expect(page.locator('.cj-total')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Cita\s+[A-Z]{3}-CIT-\d+/).first()).toBeVisible({ timeout: 30_000 })
  const citaFolio = (await page.getByText(/[A-Z]{3}-CIT-\d+/).first().innerText()).match(/[A-Z]{3}-CIT-\d+/)?.[0] ?? ''
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  const iva = dinero(await page.locator('.cj-iva span').last().innerText())
  await hablar(page, `La cita ${citaFolio.replace(/-/g, ' ')} ya viene cargada en el ticket: la paciente, el servicio y su precio. El total a cobrar es ${letras(total)} pesos, con ${letras(iva)} de I V A incluido.`)
  await hablar(page, 'Si la paciente se lleva además un producto, se agrega aquí mismo con F3. En este caso solo se cobra el servicio.', 0)

  // ───────── 4. Panel de citas por cobrar (F4) ─────────
  await hablar(page, 'Con la tecla F4 se abre el panel de citas por cobrar, que lista las citas atendidas que todavía no tienen ticket. Es la forma de encontrarlas sin pasar por la agenda.', 0)
  await page.keyboard.press('F4')
  await page.waitForTimeout(2500)
  const pendientes = await page.locator('.cj-fila-btn').count()
  await hablar(page, pendientes ? `El panel muestra ${pendientes} cita${pendientes === 1 ? '' : 's'} por cobrar de esta sucursal. Se cierra y se sigue con el cobro.` : 'La cita que se está cobrando ya no aparece como pendiente porque está en el ticket abierto. Se cierra el panel.', 0)
  await page.keyboard.press('F4')
  await page.waitForTimeout(1200)

  // ───────── 5. Forma de pago ─────────
  await hablar(page, 'Ahora, ¿cómo paga? En efectivo. Se pulsa el botón Efectivo, o la tecla F7.', 0)
  await page.getByRole('button', { name: /Efectivo/ }).first().click()
  await page.waitForTimeout(1000)
  const billete = [100, 200, 500, 1000, 2000].find(b => b >= total) ?? 2000
  await hablar(page, `La paciente entrega un billete de ${billete} pesos. Se toca el billete y el sistema calcula el cambio.`, 0)
  await page.locator('.cj-billetes button', { hasText: `$${billete}` }).click()
  await page.waitForTimeout(1200)
  const cambio = dinero(await page.locator('.cj-cambio b').innerText())
  await hablar(page, `El cambio que se debe entregar es ${letras(cambio)} pesos. El saldo queda en cero y el botón de cobrar está listo.`)

  // ───────── 6. Cobrar e imprimir ─────────
  await hablar(page, 'Se pulsa Cobrar e imprimir, o la tecla F9.', 0)
  const esperaPopup = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  const pop = await esperaPopup
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  await verTicket(page, pop)
  await hablar(page, `El cobro quedó registrado con el folio ${folio.replace(/-/g, ' ')}. El ticket sale por la impresora con el folio, la sucursal, el servicio, el I V A, la forma de pago en efectivo y el cambio.`)
  await quitarTicket(page)
  await hablar(page, `La pantalla confirma el cobro por ${letras(total)} pesos y el cambio entregado.`)

  // ───────── 7. La cita queda cobrada ─────────
  await v.irA(page, /^Agenda$/)
  await expect(page.getByText(new RegExp(PAC)).first()).toBeVisible({ timeout: 30_000 })
  await hablar(page, 'De regreso en la agenda, la cita sigue atendida y ya no aparecerá en el panel de citas por cobrar de Caja, porque tiene su ticket. Fin de la prueba.')
  await v.terminar(page, { paciente, servicio, podologo, precio, horario, citaFolio, folio, total, iva, billete, cambio, barra, estado })
})
