// Video B3: gastos con comprobante (recepción), carga en grupo con lectura simulada del ticket (administración), cierre semanal del fondo revolvente y reposición.
// Correr: PW_LOTE=B BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-gastos-fondo   (PW_SEDE=... para otra sede si la semana ya se cerró)
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { crearVideo, escribir, dinero, letras, CLAVE } from './lib/video'

const SEDE = process.env.PW_SEDE ?? 'Pie Clinic Sendero'
const v = crearVideo('vid-gastos-fondo')

/** Dibuja un ticket de papelería en un canvas y lo guarda como PNG (es la «foto» que se sube). */
async function crearTicketPng(page: Page, destino: string, lineas: string[]) {
  const b64 = await page.evaluate((ls) => {
    const c = document.createElement('canvas'); c.width = 420; c.height = 560
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, 420, 560); g.fillStyle = '#111'; g.font = '20px monospace'
    ls.forEach((l, i) => g.fillText(l, 24, 50 + i * 34))
    return c.toDataURL('image/png').split(',')[1]
  }, lineas)
  fs.writeFileSync(destino, Buffer.from(b64, 'base64'))
}

async function reingresar(page: Page, email: string, sede: string, texto: string) {
  await page.context().clearCookies()
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await page.goto('/app/login', { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  await v.narrar(page, texto, 0)
  await escribir(page.locator('#pf-email'), email)
  await escribir(page.locator('#pf-pass'), CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await v.cambiarSede(page, sede)
}

test('Finanzas: gastos con comprobante, fondo revolvente, cierre semanal y reposición', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de finanzas de Pie Clinic. Cómo se capturan los gastos con su comprobante y cómo se cierra y repone el fondo revolvente de una sucursal.')
  const ticket = path.join(v.SALIDA, 'ticket.png')
  await crearTicketPng(page, ticket, ['PAPELERIA CENTRAL', 'Ticket 004517', '', 'Cuaderno profesional   2', 'Plumas negras caja     1', 'Folders carta paq      3', '', 'TOTAL           $ 380.00'])

  // ───────── Fondo antes ─────────
  await v.irA(page, /^Fondo revolvente$/)
  const base = dinero(await page.getByText('Fondo base').locator('xpath=following-sibling::div').first().innerText())
  await expect(page.getByText('Semana en curso')).toBeVisible()
  expect(dinero(await page.getByText(/^Gastado \(/).locator('xpath=following-sibling::div').first().innerText())).toBe(0)
  await v.narrar(page, `El fondo revolvente es la caja chica de la sucursal. ${SEDE.replace('Pie Clinic ', '')} tiene un fondo base de ${letras(base)} pesos y la semana va de sábado a viernes. Todavía no se ha gastado nada.`, 0)

  // ───────── Gasto con comprobante (recepción) ─────────
  await v.irA(page, /^Gastos$/)
  await v.narrar(page, 'Recepción captura los gastos en efectivo del fondo. Se registra un nuevo ticket de la papelería.', 0)
  await page.getByRole('button', { name: /Nuevo ticket/ }).click()
  const g = page.getByRole('dialog').last()
  await expect(g.getByLabel('Total (con IVA)')).toBeVisible()
  const opcionesProv = await g.getByLabel('Proveedor (catálogo)').locator('option').allInnerTexts()
  await g.getByLabel('Proveedor (catálogo)').selectOption({ label: opcionesProv.find(o => o.startsWith('Papelería Central'))! })
  await g.getByLabel('Categoría / grupo').selectOption({ label: 'Papelería' })
  await g.getByLabel('Total (con IVA)').fill('380')
  await escribir(g.getByLabel('Descripción'), 'Papelería para recepción')
  await expect(g.getByText(/Fondo: Fondo/)).toBeVisible()
  await v.narrar(page, 'Se elige el proveedor del catálogo, el rubro papelería, y el total del ticket: trescientos ochenta pesos con IVA. El método de pago es efectivo del fondo; recepción no puede elegir otro.', 0)
  await g.locator('input[type=file]').first().setInputFiles(ticket)
  await expect(g.getByRole('button', { name: /Ver/ }).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Se sube la foto del ticket como comprobante. Debajo del formulario el sistema rotula que la lectura automática del ticket está en modo simulado.', 0)
  await g.getByRole('button', { name: 'Guardar gasto' }).click()
  const filaG = page.locator('tbody tr', { hasText: 'Papelería para recepción' }).first()
  await expect(filaG).toBeVisible({ timeout: 45_000 })
  await expect(filaG.getByRole('button', { name: /Ticket/ })).toBeVisible()
  await v.narrar(page, 'El gasto quedó guardado con el botón para ver su ticket. Un gasto guardado ya no se borra: solo se puede anular con motivo.')

  // ───────── Fondo después del gasto ─────────
  await v.irA(page, /^Fondo revolvente$/)
  const gastado1 = dinero(await page.getByText(/^Gastado \(/).locator('xpath=following-sibling::div').first().innerText())
  expect(gastado1).toBe(380)
  await v.narrar(page, `En el fondo revolvente ya aparece lo gastado: ${letras(gastado1)} pesos, y el disponible bajó en la misma cantidad. El cierre de la semana lo hace Administración.`, 0)

  // ───────── Administración: carga en grupo con lectura simulada ─────────
  await reingresar(page, 'm@g.com', SEDE, 'Ahora Administración firma con su cuenta. Administración tiene además la carga en grupo de comprobantes.')
  await v.irA(page, /^Gastos$/)
  await page.getByRole('button', { name: /Carga en grupo/ }).click()
  const cg = page.getByRole('dialog').last()
  await expect(cg.getByText(/Modo simulado/).first()).toBeVisible()
  await cg.getByLabel('Grupo para todos').selectOption({ label: 'Papelería' })
  await v.narrar(page, 'En la carga en grupo se suben varios tickets a la vez y la inteligencia artificial propone los datos. Aquí no hay llave de inteligencia artificial, así que el sistema lo rotula como modo simulado y no inventa nada: guarda el ticket y la persona captura los datos.', 0)
  await cg.locator('input[type=file]').setInputFiles(ticket)
  const fila = cg.locator('tbody tr').first()
  await expect(fila).toBeVisible({ timeout: 60_000 })
  await v.narrar(page, 'El ticket subido aparece listo para revisar, con el proveedor, la fecha y el total vacíos, porque la lectura es simulada.', 0)
  const hoyIso = new Date().toISOString().slice(0, 10)
  await escribir(fila.locator('input').nth(0), 'Papelería Central')
  await fila.locator('input[type=date]').fill(hoyIso)
  await fila.locator('input').nth(2).fill('004517')
  await fila.locator('input[type=number]').fill('215.50')
  await v.narrar(page, 'La persona captura el proveedor, la fecha, el folio y el total del ticket, que son doscientos quince pesos con cincuenta centavos, y confirma. La inteligencia artificial propone y una persona confirma.', 0)
  await cg.getByRole('button', { name: /Guardar 1 listos/ }).click()
  await expect(cg.getByText(/Aún no hay comprobantes cargados/)).toBeVisible({ timeout: 60_000 })
  await cg.locator('button.btn', { hasText: /^Cerrar$/ }).click()
  await v.narrar(page, 'El gasto se guardó con el método tarjeta de la clínica, por lo que no sale del fondo revolvente.')

  // ───────── Cierre semanal del fondo ─────────
  await v.irA(page, /^Fondo revolvente$/)
  const gastado = dinero(await page.getByText(/^Gastado \(/).locator('xpath=following-sibling::div').first().innerText())
  expect(gastado).toBe(380)
  const esperado = base - gastado
  await v.narrar(page, 'Al terminar la semana se cierra el fondo. Se cuenta el efectivo que queda en la caja chica.', 0)
  await page.getByRole('button', { name: /Cerrar semana/ }).click()
  const cierre = page.getByRole('dialog').last()
  await expect(cierre.getByText(/efectivo esperado en caja/)).toBeVisible()
  await cierre.getByLabel(/Efectivo contado/).fill(String(esperado - 10))
  await expect(cierre.getByText(/dentro de la tolerancia/)).toBeVisible()
  await v.narrar(page, `Según el sistema deben quedar ${letras(esperado)} pesos en la caja. Se contaron diez pesos menos. Es una diferencia dentro de la tolerancia de cincuenta pesos, pero el sistema exige explicarla.`, 0)
  await escribir(cierre.getByLabel('Nota de la diferencia'), 'Faltan 10 pesos de cambio')
  await cierre.getByRole('button', { name: 'Cerrar semana' }).click()
  await expect(page.getByText('Cerrada · por reponer')).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'La semana quedó cerrada, por reponer. Los gastos de esa semana ya no se pueden modificar.', 0)

  // ───────── Reposición ─────────
  await page.getByRole('button', { name: /Reponer fondo/ }).click()
  const rep = page.getByRole('dialog').last()
  await expect(rep.getByLabel('Monto repuesto')).toHaveValue(String(gastado))
  await v.narrar(page, `Administración autoriza la reposición. El monto sugerido es lo gastado en la semana: ${letras(gastado)} pesos. La reposición queda en bitácora.`, 0)
  await rep.getByRole('button', { name: 'Autorizar reposición' }).click()
  await expect(page.getByText('Cerrada y repuesta')).toBeVisible({ timeout: 45_000 })
  await page.getByRole('tab', { name: /Cierres semanales/ }).click()
  await page.waitForTimeout(1500)
  await v.narrar(page, 'La semana aparece como cerrada y repuesta. En la pestaña de cierres semanales queda el historial con el fondo base, lo gastado y la reposición. Fin de la prueba.')
  await v.terminar(page, { sede: SEDE, base, gastado, esperado, contado: esperado - 10 })
})
