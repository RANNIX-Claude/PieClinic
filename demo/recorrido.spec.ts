// Recorrido de DEMO de Pie Firme (un día normal en la clínica) grabado en video para presentarlo a los dueños.
// Antes: node demo/sembrar-demo.mjs (datos realistas en QA). Correr: npx playwright test
// Salidas: demo/capturas/*.png · demo/video/recorrido-pie-firme.webm · demo/avisos.json (pantallas saltadas o con falla).
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const DEMO = path.resolve(process.cwd(), 'demo')
const estado = JSON.parse(fs.readFileSync(path.join(DEMO, 'estado.json'), 'utf8'))
const CLAVE: string = estado.clave
const CUENTA = estado.cuentas
const DIA: string = estado.diaDemo           // día hábil de la demo (YYYY-MM-DD)
const PACIENTE = 'Sofía Hernández'
const avisos: { pantalla: string; motivo: string }[] = []
let n = 0

const pausa = (page: Page, ms = 2000) => page.waitForTimeout(ms)
async function captura(page: Page, nombre: string) {
  n += 1
  await page.screenshot({ path: path.join(DEMO, 'capturas', `${String(n).padStart(2, '0')}-${nombre}.png`) })
}
/** Pantalla importante: espera a que cargue, pausa de 2 s y captura PNG. */
async function mostrar(page: Page, nombre: string) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await pausa(page)
  await captura(page, nombre)
}
const escribir = (loc: ReturnType<Page['locator']>, texto: string) => loc.pressSequentially(texto, { delay: 80 })

async function iniciarSesion(page: Page, quien: 'recepcion' | 'pod1' | 'dueno') {
  await page.goto('/app/login')
  await page.locator('#pf-email').waitFor()
  await mostrar(page, `login-${quien}`)
  await escribir(page.locator('#pf-email'), CUENTA[quien].email)
  await escribir(page.locator('#pf-pass'), CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}
async function cerrarSesion(page: Page) {
  await page.locator('header button[aria-haspopup="menu"]').click()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.locator('#pf-email').waitFor({ timeout: 20_000 })
}
const ENV: Record<string, string> = {}
for (const linea of fs.readFileSync(path.join(DEMO, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) ENV[m[1]] = m[2].trim()
}
/** Consulta a la API con la sesión del usuario ya iniciado (para ubicar ids sin salir de la pantalla). */
async function api(page: Page, ruta: string) {
  return page.evaluate(async ([r, base, anon]) => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))!
    const token = JSON.parse(localStorage.getItem(k)!).access_token
    const resp = await fetch(`${base}/rest/v1/${r}`, { headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Accept-Profile': 'piefirme' } })
    return resp.json()
  }, [ruta, ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY])
}
/** Elige en un <select> la opción cuyo texto contiene `texto`. */
async function elegir(sel: ReturnType<Page['locator']>, texto: string) {
  const op = sel.locator('option', { hasText: texto }).first()
  await sel.selectOption({ value: (await op.getAttribute('value'))! })
}
async function intentar(nombre: string, f: () => Promise<void>) {
  try { await f() } catch (e: any) { avisos.push({ pantalla: nombre, motivo: String(e?.message ?? e).split('\n')[0] }); console.log(`⚠ ${nombre}: ${avisos.at(-1)!.motivo}`) }
}

test.afterAll(() => fs.writeFileSync(path.join(DEMO, 'avisos.json'), JSON.stringify(avisos, null, 2)))

test('Un día en la clínica Pie Firme', async ({ page }) => {
  fs.rmSync(path.join(DEMO, 'capturas'), { recursive: true, force: true }); fs.mkdirSync(path.join(DEMO, 'capturas'), { recursive: true })
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/rest/v1/consultas')) console.log('POST consultas', r.postData()?.slice(0, 300)) })
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('→', f.url().replace('http://localhost:5173', '')) })

  // ───────── 1. Recepción: login y agenda ─────────
  await test.step('Login recepcionista', async () => {
    await iniciarSesion(page, 'recepcion')
    await mostrar(page, 'inicio-recepcion')
  })
  await test.step('Agenda: crear cita nueva', async () => {
    await page.goto(`/app/agenda?dia=${DIA}`)
    await mostrar(page, 'agenda-dia')
    await page.getByRole('button', { name: /Nueva cita/ }).click()
    await expect(page.getByRole('heading', { name: 'Nueva cita' })).toBeVisible()
    await escribir(page.getByPlaceholder(/Buscar paciente/), 'Sofía')
    await page.getByRole('button', { name: new RegExp(PACIENTE) }).first().click()
    await elegir(page.getByLabel('Servicio', { exact: true }), 'Quiropodia')
    await elegir(page.getByLabel('Podólogo', { exact: true }), 'Mariana')
    await page.getByLabel('Fecha', { exact: true }).fill(DIA)
    await page.getByText('Buscando horarios…').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {})
    await pausa(page, 1000)
    // primer horario libre ofrecido por el sistema
    await page.locator('.card:has(h3:has-text("Disponibilidad")) button.btn').first().click()
    await escribir(page.getByLabel('Notas de la cita (visibles al podólogo)'), 'Dolor en el dedo gordo del pie derecho. Viene por primera vez.')
    await mostrar(page, 'cita-nueva-formulario')
    await page.getByRole('button', { name: 'Agendar cita', exact: true }).click()
    await expect(page.getByText(/Cita .* agendada/)).toBeVisible({ timeout: 20_000 })
    await mostrar(page, 'agenda-con-cita-nueva')
  })

  // ───────── 2. Recepción: llegada del paciente ─────────
  await test.step('Recepción: llegada del paciente', async () => {
    await intentar('Recepción › registrar llegada del paciente', async () => {
      // No existe una pantalla de «llegada»: la agenda solo ofrece Confirmar / En camino / No asistió / Cancelar.
      throw new Error('No existe pantalla ni botón para registrar la llegada (la columna citas.llegada_en no tiene interfaz). Se usa «Confirmar» de la agenda como aviso de presencia.')
    })
    await page.getByText(PACIENTE).first().click().catch(() => {})
    const confirmar = page.getByRole('button', { name: 'Confirmar', exact: true })
    if (await confirmar.isVisible().catch(() => false)) {
      await pausa(page, 1000); await captura(page, 'cita-detalle')
      await confirmar.click()
      await pausa(page, 1500)
    } else await page.keyboard.press('Escape')
    await mostrar(page, 'agenda-cita-confirmada')
  })
  await cerrarSesion(page)

  // ───────── 3. Podólogo: expediente y consulta ─────────
  let citaId = '', pacienteId = ''
  await test.step('Login podólogo', async () => {
    await iniciarSesion(page, 'pod1')
    await mostrar(page, 'inicio-podologo')
  })
  await test.step('Podólogo: agenda y expediente', async () => {
    await page.goto(`/app/mi-agenda`)
    await mostrar(page, 'mi-agenda')
    const filas = await api(page, 'prp_agenda?notas=ilike.*dedo%20gordo*&limit=1&select=id,paciente_id')
    citaId = filas?.[0]?.id; pacienteId = filas?.[0]?.paciente_id
    if (!citaId) throw new Error('No se encontró la cita recién creada')
    await page.goto(`/app/pacientes/${pacienteId}`)
    await mostrar(page, 'expediente-paciente')
  })
  await test.step('Consulta: diagnóstico y tratamiento', async () => {
    await page.goto(`/app/consultas/nueva?paciente=${pacienteId}&cita=${citaId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await pausa(page, 1000)
    await captura(page, 'consulta-nueva')
    await page.getByRole('button', { name: /Iniciar consulta/ }).click()
    await page.waitForURL(/\/consultas\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await mostrar(page, 'consulta-abierta')
    await page.getByLabel('Peso (kg)').fill('72').catch(() => {})
    await escribir(page.getByLabel('Motivo de consulta'), 'Dolor y enrojecimiento en la uña del dedo gordo derecho desde hace dos semanas.')
    await escribir(page.getByLabel('Padecimiento actual'), 'Uña encarnada en borde externo con callosidad dolorosa; refiere calzado cerrado por trabajo.')
    await page.getByRole('button', { name: 'Hiperqueratosis', exact: true }).click()
    await pausa(page, 800)
    await captura(page, 'consulta-diagnostico')
    // tratamiento: procedimiento + indicación
    const proc = page.getByLabel('Procedimiento', { exact: true })
    const opciones = await proc.locator('option').allTextContents()
    const objetivo = opciones.find((t) => /quiropodia|onicocriptosis|desbridamiento|corte/i.test(t)) ?? opciones[1]
    await proc.selectOption({ label: objetivo })
    await escribir(page.getByLabel('Descripción del procedimiento', { exact: true }).first(), 'Corte y fresado de la uña con retiro de callosidad; aplicación de antiséptico.')
    await page.locator('.row', { has: page.getByLabel('Procedimiento', { exact: true }) }).getByRole('button', { name: 'Agregar', exact: true }).click()
    await pausa(page, 1000)
    await page.getByLabel('Pronóstico', { exact: true }).selectOption('bueno')
    await escribir(page.getByLabel(/Nota de evolución/), 'Paciente cooperador. Se realiza quiropodia sin complicaciones. Pronóstico bueno; revisión en 4 semanas, calzado amplio y limpieza diaria.')
    await mostrar(page, 'consulta-tratamiento-y-nota')
    await page.getByRole('button', { name: /Guardar borrador/ }).click()
    await pausa(page, 1500)
  })
  await test.step('Consulta: cerrar y firmar', async () => {
    await intentar('Consulta › firma del podólogo en pantalla', async () => {
      await page.getByRole('button', { name: 'Cerrar y firmar consulta' }).click()
      const lienzo = page.locator('canvas').first()
      await lienzo.waitFor({ timeout: 10_000 })
      const b = (await lienzo.boundingBox())!
      await page.mouse.move(b.x + 30, b.y + b.height / 2); await page.mouse.down()
      for (let i = 0; i < 12; i++) await page.mouse.move(b.x + 30 + i * (b.width - 60) / 12, b.y + b.height / 2 + Math.sin(i) * 25)
      await page.mouse.up()
      await captura(page, 'consulta-firma')
      await page.getByRole('button', { name: /^Firmar/ }).last().click()
      await pausa(page, 2000)
      await captura(page, 'consulta-cerrada')
    })
  })
  await cerrarSesion(page)

  // ───────── 4. Recepción: caja ─────────
  await test.step('Caja: cobrar la consulta', async () => {
    await iniciarSesion(page, 'recepcion')
    await page.goto('/app/caja')
    await mostrar(page, 'caja')
    const abrir = page.getByRole('button', { name: 'Abrir turno' })
    if (await abrir.isVisible().catch(() => false)) {
      await page.getByLabel('Turno').fill('Matutino')
      await page.getByLabel('Fondo inicial').fill('1000')
      await abrir.click()
      await pausa(page, 1500)
    }
    await page.getByLabel('Citas atendidas sin cobro').selectOption({ index: 1 }).catch(() => { throw new Error('La consulta no aparece como cita atendida por cobrar') })
    await pausa(page, 1000)
    await page.getByRole('button', { name: /Efectivo/ }).first().click()
    await page.getByRole('button', { name: 'Completar' }).first().click()
    await mostrar(page, 'caja-cobro')
    await page.getByRole('button', { name: 'Cobrar sin ticket' }).click()
    await pausa(page, 2500)
    await captura(page, 'caja-cobrado')
  })
  await cerrarSesion(page)

  // ───────── 5. Dueño: dashboard de sucursales ─────────
  await test.step('Dueño: dashboard y reporte de sucursales', async () => {
    await iniciarSesion(page, 'dueno')
    await mostrar(page, 'inicio-dueno')
    await page.goto('/app/dashboard')
    await mostrar(page, 'dashboard')
    await page.mouse.wheel(0, 700); await pausa(page, 2000); await captura(page, 'dashboard-abajo')
    await page.goto('/app/analisis/ejecutivo')
    await mostrar(page, 'tablero-ejecutivo-sucursales')
    await page.mouse.wheel(0, 700); await pausa(page, 2000); await captura(page, 'tablero-ejecutivo-abajo')
    await page.goto('/app/estado-resultados')
    await mostrar(page, 'estado-de-resultados')
  })

  expect(errores, 'errores de JavaScript en la página').toEqual([])
})
