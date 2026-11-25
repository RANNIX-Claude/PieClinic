// Video CAJA-D: la caja sigue operando SIN INTERNET (catálogo y clientes visibles, tickets provisionales) y sincroniza al volver la red.
// Requiere la app COMPILADA (el service worker solo corre en producción):
//   VITE_ENTORNO=prod npx vite build ; npx vite preview --outDir dist/app --port 5175
// Correr: BASE_URL=http://localhost:5175 npx playwright test -c playwright.caja.config.ts caja-offline
import { test, expect, type Page } from '@playwright/test'
import { crearVideo, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Centenario'
const v = crearVideo('offline')

async function vistaTicket(page: Page, titulo: string) {
  await page.waitForFunction(() => (window as any).__ultimoTicket, null, { timeout: 15_000 }).catch(() => {})
  const html = await page.evaluate(() => { const h = (window as any).__ultimoTicket as string | null; (window as any).__ultimoTicket = null; return h })
  if (!html) return ''
  await page.evaluate(([h, t]) => {
    const d = document.createElement('div'); d.id = 'vista-ticket'
    d.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,30,.55);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px'
    d.innerHTML = `<div style="color:#fff;font:600 15px sans-serif">${t}</div>`
    const f = document.createElement('iframe'); f.style.cssText = 'width:340px;height:620px;background:#fff;border:0;border-radius:6px'
    f.srcdoc = h; d.appendChild(f); document.body.appendChild(d)
  }, [html, titulo])
  return html
}

test('Caja: operación sin internet y sincronización', async ({ page, context }) => {
  await v.empezar(context)
  // La ventana del ticket es un iframe oculto: así no se abre otro destino en el navegador (el emulador de red lo reactivaría).
  await context.addInitScript(() => { window.open = () => { const f = document.createElement('iframe'); f.style.display = 'none'; document.body.appendChild(f); const w = f.contentWindow as any; w.print = () => { (window as any).__ultimoTicket = f.contentDocument!.documentElement.outerHTML }; return w } })
  await v.firmar(page, SEDE, 'Prueba de caja de Pie Clinic. Caso: el internet se cae en plena jornada. La caja debe seguir cobrando y, al volver la conexión, sincronizar los tickets sin perder ni duplicar nada.')
  await v.irA(page, /Caja y tickets/)
  await page.waitForTimeout(4000)
  const abrir = page.getByRole('button', { name: 'Abrir turno' })
  if (await abrir.isVisible().catch(() => false)) {
    await v.narrar(page, 'La recepcionista abre su turno de caja con el fondo inicial.', 0)
    await page.getByLabel('Fondo inicial').fill('1000'); await abrir.click(); await page.waitForTimeout(3500)
  }
  await expect(page.locator('.cj-buscar-in')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(6000)
  await v.narrar(page, 'Mientras hay internet, la caja guarda en el equipo una copia del catálogo de servicios y productos, de las características y de los datos mínimos de los clientes.')

  // ───────── Se cae el internet ─────────
  await v.narrar(page, 'De pronto, se cae el internet.', 0)
  await context.setOffline(true)
  await expect(page.locator('.cj-offline')).toContainText('Sin conexión', { timeout: 20_000 })
  await v.narrar(page, 'La pantalla avisa con una banda amarilla: sin conexión. Se puede seguir cobrando en efectivo, tarjeta o transferencia, y los tickets se guardan en el equipo.')

  // Ticket 1 · servicio + producto, efectivo, con cliente
  await v.narrar(page, 'Llega una paciente. Se busca su nombre en la lista de clientes, que sigue disponible sin internet.', 0)
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await page.getByPlaceholder(/Buscar paciente/).pressSequentially('mar', { delay: 120 })
  const op = page.locator('button', { hasText: /· .*·/ }).filter({ has: page.locator('b') }).first()
  await expect(op).toBeVisible({ timeout: 20_000 })
  const cliente = (await op.locator('b').innerText()).trim()
  await page.waitForTimeout(1000)
  await op.click()
  await v.narrar(page, `Se elige a ${cliente}.`, 0)
  await page.locator('.cj-tile', { hasText: 'Paciente' }).click()
  await page.keyboard.press('F2')
  await page.locator('.cj-buscar-in').pressSequentially('quirop', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Quiropodia' }).first().click()
  await page.waitForTimeout(1200)
  await v.narrar(page, 'El catálogo responde igual: se agrega una quiropodia con el precio guardado en el equipo.', 0)
  await page.keyboard.press('F3')
  await page.locator('.cj-buscar-in').pressSequentially('crema hidr', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Crema hidratante' }).first().click()
  await page.waitForTimeout(1200)
  const total1 = dinero(await page.locator('.cj-total span').last().innerText())
  await page.getByRole('button', { name: /Efectivo/ }).first().click()
  await page.waitForTimeout(800)
  const billete = [100, 200, 500, 1000].find(b => b >= total1) ?? 1000
  await page.locator('.cj-billetes button', { hasText: `$${billete}` }).click()
  await page.waitForTimeout(800)
  await v.narrar(page, `El total es ${letras(total1)} pesos y paga en efectivo. Se pulsa Cobrar e imprimir.`, 0)
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 30_000 })
  const folio1 = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  const htmlT1 = await vistaTicket(page, 'Ticket PROVISIONAL enviado a la impresora (80 mm)')
  expect(htmlT1).toContain('PROVISIONAL')
  await v.narrar(page, `Se cobró y se imprimió el ticket con el folio provisional ${folio1.replace(/-/g, ' ')}. El folio oficial se asignará al sincronizar. La pantalla lo recuerda con un aviso.`)
  await page.evaluate(() => document.getElementById('vista-ticket')?.remove())
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)

  // Ticket 2 · producto, tarjeta
  await v.narrar(page, 'Llega otro cliente. Segundo ticket, también sin internet: un antimicótico en crema, pagado con tarjeta.', 0)
  await page.keyboard.press('F3')
  await page.locator('.cj-buscar-in').pressSequentially('antimic', { delay: 90 })
  await page.waitForTimeout(1500)
  await page.locator('.cj-res button', { hasText: 'Antimicótico' }).first().click()
  await page.waitForTimeout(1200)
  const total2 = dinero(await page.locator('.cj-total span').last().innerText())
  await page.getByRole('button', { name: /Tarjeta/ }).first().click()
  await page.waitForTimeout(800)
  await page.getByPlaceholder('Autorización').pressSequentially('AUT-330981', { delay: 80 })
  await page.getByPlaceholder('Últimos 4').pressSequentially('5599', { delay: 80 })
  await page.getByRole('button', { name: /COBRAR E IMPRIMIR/ }).click()
  await expect(page.locator('.cj-hecho')).toBeVisible({ timeout: 30_000 })
  const folio2 = (await page.locator('.cj-hecho-folio b').innerText()).trim()
  await vistaTicket(page, 'Ticket PROVISIONAL')
  await page.evaluate(() => document.getElementById('vista-ticket')?.remove())
  await v.narrar(page, `El segundo ticket, ${folio2.replace(/-/g, ' ')}, por ${letras(total2)} pesos, también queda guardado en el equipo.`, 0)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  await expect(page.locator('.cj-offline')).toContainText('2 tickets por sincronizar')
  await v.narrar(page, 'La banda indica que hay dos tickets por sincronizar, con su folio provisional y su importe.')

  // ───────── Reinicio sin internet ─────────
  await v.narrar(page, 'Aun si se recarga la página sin internet, la aplicación abre desde el equipo y los tickets siguen ahí.', 0)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await expect(page.locator('.cj-offline')).toContainText('2 tickets por sincronizar', { timeout: 60_000 })
  await v.narrar(page, 'La caja volvió a abrir sin internet y conserva los dos tickets pendientes.')

  // ───────── Vuelve el internet ─────────
  await v.narrar(page, 'Vuelve el internet.', 0)
  await context.setOffline(false)
  await expect(page.locator('.cj-offline')).toContainText('Sincronizado', { timeout: 90_000 })
  const reporte = (await page.locator('.cj-offline').innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, 'El sistema sincroniza solo, en el orden en que se cobraron. Cada ticket provisional recibe su folio oficial, y no se duplicó ninguno.')
  await expect(page.locator('.cj-offline .bd.v')).toHaveCount(2)

  await page.getByText('Tickets del día').first().click()
  await page.waitForTimeout(3500)
  const oficial1 = (await page.locator('.cj-offline .bd.v').nth(0).innerText()).split('→')[1].trim()
  await expect(page.locator('tr', { hasText: oficial1 })).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'En Tickets del día aparecen los dos con su folio oficial y el estado cobrado. El corte de turno ya los incluye. Fin del caso.')
  await v.terminar(page, { folio1, folio2, total1, total2, reporte, cliente })
})
