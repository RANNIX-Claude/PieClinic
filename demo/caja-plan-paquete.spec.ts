// Video CAJA-F3: vender un plan multisesión a una paciente en Caja, verlo en Paquetes y membresías, y cobrar una sesión con el saldo del plan.
// Correr: PW_LOTE=F BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts caja-plan-paquete
import { test, expect } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const v = crearVideo('plan-paquete')

async function elegirPaciente(page: any, busca: string, nombre: RegExp) {
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await page.getByPlaceholder(/Buscar paciente/).pressSequentially(busca, { delay: 100 })
  const op = page.locator('.cj-panel button', { hasText: nombre }).first()
  await expect(op).toBeVisible({ timeout: 20_000 })
  const cliente = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(900)
  await op.click()
  await page.waitForTimeout(900)
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await page.waitForTimeout(500)
  return cliente
}
async function cobrarEfectivo(page: any, total: number) {
  await page.getByRole('button', { name: /Efectivo/ }).first().click()
  await page.waitForTimeout(800)
  const billete = [100, 200, 500, 1000, 2000, 5000].find(b => b >= total) ?? 5000
  await page.locator('.cj-billetes button', { hasText: `$${billete}` }).click().catch(async () => { await page.waitForTimeout(500) })
  await page.waitForTimeout(800)
}

test('Caja: venta de un plan multisesión y cobro de una sesión con el saldo del plan', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de planes y paquetes de Pie Clinic. Caso: una paciente compra un plan de seis sesiones de láser para hongo en la uña, y en su siguiente visita se cobra una sesión con el saldo del plan, sin pagar de nuevo.')

  // 1. Catálogo de ofertas
  await v.irA(page, /Paquetes y membresías/)
  await expect(page.getByRole('tab', { name: /Planes multisesión/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: /Planes multisesión/ }).click()
  await page.waitForTimeout(2000)
  const filaOferta = page.locator('tbody tr', { hasText: 'Plan láser 6 sesiones' }).first()
  await expect(filaOferta).toBeVisible({ timeout: 30_000 })
  const txtOferta = (await filaOferta.innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `Primero, el catálogo de paquetes y membresías. En planes multisesión está el plan láser de seis sesiones: ${txtOferta.replace(/\s+/g, ' ').includes('3,600') ? 'tres mil seiscientos pesos en total' : 'con su precio total'}, con vigencia de doce meses para usar las sesiones. El valor de cada sesión es el precio del plan entre las seis sesiones.`)

  // 2. Venta del plan en caja
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(3500)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.isVisible().catch(() => false)) { await page.getByLabel('Fondo inicial').fill('1000'); await abrir.click(); await page.waitForTimeout(3500) }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'En caja, la paciente quiere comprar el plan. Un plan se vende siempre a un paciente identificado, así que primero se elige a la paciente.', 0)
  const cliente = await elegirPaciente(page, 'Mendoza', /Laura Ramírez Mendoza/)
  await v.narrar(page, `Se elige a ${cliente}.`, 0)
  await page.keyboard.press('F5')
  await page.locator('.cj-buscar-in').pressSequentially('plan l', { delay: 100 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Plan láser 6 sesiones' }).first().click()
  await page.waitForTimeout(1500)
  const lin = page.locator('.cj-linea', { hasText: 'Plan láser' })
  await expect(lin).toBeVisible()
  const total = dinero(await page.locator('.cj-total span').last().innerText())
  await v.narrar(page, `Con la tecla F5 se buscan paquetes y planes, y se agrega el plan láser. El renglón queda con el tipo plan y el total del ticket es ${letras(total)} pesos.`, 0)
  await cobrarEfectivo(page, total)
  await v.narrar(page, 'Paga en efectivo y se cobra el ticket.', 0)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio1 = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  await v.narrar(page, `Cobro registrado con el folio ${folio1.replace(/-/g, ' ')}. Al cobrar, el sistema genera el plan de la paciente, con su propio folio, sus seis sesiones disponibles y su fecha de caducidad.`)

  // 3. El plan vendido
  await v.irA(page, /Paquetes y membresías/)
  await page.getByRole('tab', { name: 'Vendidos' }).click()
  await page.waitForTimeout(2500)
  const planes = page.locator('div.card', { hasText: 'Planes de pacientes' }).first()
  const mejor = page.locator('tbody tr', { hasText: 'Plan láser 6 sesiones' })
  const n = await mejor.count()
  expect(n).toBeGreaterThan(0)
  // el plan recién vendido: 0/6 sesiones
  const fnuevo = page.locator('tbody tr', { hasText: /Plan láser 6 sesiones/ }).filter({ hasText: /0\/6/ }).first()
  await expect(fnuevo).toBeVisible({ timeout: 30_000 })
  await fnuevo.scrollIntoViewIfNeeded()
  const folioPlan = ((await fnuevo.innerText()).match(/[A-Z]{3}-LP-\d+/) ?? [''])[0]
  expect(folioPlan).not.toBe('')
  const txtNuevo = (await fnuevo.innerText()).replace(/\s+/g, ' ')
  void planes
  await v.narrar(page, `En la pestaña Vendidos, la lista de planes de pacientes muestra el plan ${folioPlan.replace(/-/g, ' ')}, con cero de seis sesiones usadas, el valor de cada sesión, lo que falta por cobrar, que es cero porque se pagó completo, y su fecha de caducidad.`)

  // 4. Cobro de una sesión con el saldo
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(3000)
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'Una semana después, la paciente regresa a su primera sesión de láser. En caja se elige otra vez a la paciente.', 0)
  await elegirPaciente(page, 'Mendoza', /Laura Ramírez Mendoza/)
  await page.keyboard.press('F2')
  await page.locator('.cj-buscar-in').pressSequentially('onicomic', { delay: 100 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Tratamiento de onicomicosis' }).first().click()
  await page.waitForTimeout(1500)
  const botonPlan = page.getByRole('button', { name: new RegExp(`Usar saldo del plan ${folioPlan}`) })
  await expect(botonPlan).toBeVisible({ timeout: 20_000 })
  const totalAntes = dinero(await page.locator('.cj-total span').last().innerText())
  await v.narrar(page, `Se agrega el tratamiento de onicomicosis con láser, a ${letras(totalAntes)} pesos. Como la paciente tiene un plan con saldo, el renglón ofrece un botón: Usar saldo del plan ${folioPlan.replace(/-/g, ' ')}, con las sesiones que le quedan.`, 0)
  await botonPlan.click()
  await page.waitForTimeout(1500)
  const totalDespues = dinero(await page.locator('.cj-total span').last().innerText())
  expect(totalDespues).toBe(0)
  await v.narrar(page, 'Al usarlo, el precio del renglón queda en cero, porque la sesión ya está pagada con el plan, y el total del ticket es cero pesos.')
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 60_000 })
  const folio2 = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  await v.narrar(page, `El ticket ${folio2.replace(/-/g, ' ')} se cobra con saldo del plan, sin que la paciente pague otra vez. El sistema descuenta una sesión del plan.`)

  // 5. Plan con una sesión usada
  await v.irA(page, /Paquetes y membresías/)
  await page.getByRole('tab', { name: 'Vendidos' }).click()
  await page.waitForTimeout(2500)
  const fusado = page.locator('tbody tr', { hasText: folioPlan }).first()
  await expect(fusado).toBeVisible({ timeout: 30_000 })
  await fusado.scrollIntoViewIfNeeded()
  const txtUsado = (await fusado.innerText()).replace(/\s+/g, ' ')
  expect(txtUsado).toMatch(/1\/6/)
  await v.narrar(page, `La lista de planes ahora muestra el plan ${folioPlan.replace(/-/g, ' ')} con una de seis sesiones usadas. Quedan cinco.`)

  // 6. Planes de tratamiento (clínico)
  await v.irA(page, /Planes de tratamiento/)
  await expect(page.getByRole('heading', { name: /Planes de tratamiento/ }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2500)
  await v.narrar(page, 'Aparte, en Planes de tratamiento, el podólogo da seguimiento clínico a los planes con su avance, las faltas y los días sin actividad. Este módulo clínico es distinto del plan comercial que se acaba de vender: el comercial cuida el saldo de sesiones pagadas, y el clínico cuida que la paciente no abandone su tratamiento.')
  await v.narrar(page, 'Así se vende un plan y se cobra una sesión con su saldo. Fin del caso.')
  await v.terminar(page, { cliente, folio1, total, folioPlan, folio2, txtOferta, txtNuevo, txtUsado })
})
