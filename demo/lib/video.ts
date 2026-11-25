// Utilerías comunes de los videos de QA con voz (Playwright + SAPI + ffmpeg). Cada spec crea su "video" con crearVideo('<carpeta>').
// Salidas por video: demo/video/<carpeta>/marcas.json (guion con tiempos) y <carpeta>.webm; luego demo/narrar.ps1 y demo/mezclar.mjs.
import { expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

export const EMAIL_RECEPCION = 'r@g.com', CLAVE = '123456'      // cuenta de prueba de recepción (docs/ACCESOS.md), solo QA
export const dinero = (s: string) => Number(s.replace(/[^0-9.\-]/g, ''))
export const letras = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const escribir = (loc: ReturnType<Page['locator']>, texto: string) => loc.pressSequentially(texto, { delay: 90 })

export function crearVideo(carpeta: string) {
  const SALIDA = path.join(process.cwd(), 'demo', 'video', carpeta)
  fs.mkdirSync(SALIDA, { recursive: true })
  const marcas: { t: number; texto: string }[] = []
  let t0 = 0
  const duraciones: Record<string, number> = fs.existsSync(path.join(SALIDA, 'duraciones.json')) ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'duraciones.json'), 'utf8')) : {}
  /** Anota lo que se narra y espera lo que dura la voz (estimado; medido en la segunda pasada). */
  async function narrar(page: Page, texto: string, extraMs = 600) {
    marcas.push({ t: Date.now() - t0, texto })
    const medida = duraciones[String(marcas.length - 1)]
    const ms = medida ? medida * 1000 + 400 : (texto.length / 10.5) * 1000 + 1000
    await page.waitForTimeout(ms + extraMs)
  }
  async function empezar(context: BrowserContext) {
    // El diálogo de impresión del navegador bloquea la grabación: la impresión de ventanas emergentes se vuelve inocua.
    await context.addInitScript(() => { const abrir = window.open; window.open = (...a: any[]) => { const w = (abrir as any).apply(window, a); if (w) { try { (w as any).print = () => {} } catch {} } return w } })
    t0 = Date.now()
  }
  /** Firma con la cuenta de recepción y elige la sucursal de trabajo. */
  async function firmar(page: Page, sede: string, intro: string, email: string = EMAIL_RECEPCION, quien: string = 'la persona de recepción') {
    await page.goto('/app/login', { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.locator('#pf-email').waitFor({ timeout: 120_000 })
    await narrar(page, intro)
    await narrar(page, `Primero, ${quien} firma con su cuenta personal.`, 0)
    await escribir(page.locator('#pf-email'), email)
    await escribir(page.locator('#pf-pass'), CLAVE)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await cambiarSede(page, sede)
  }
  async function cambiarSede(page: Page, sede: string) {
    await page.locator('header select').selectOption({ label: sede })
    await page.waitForTimeout(1500)
  }
  async function irA(page: Page, enlace: RegExp) {
    await page.getByRole('link', { name: enlace }).first().click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
  }
  async function terminar(page: Page, extra: Record<string, unknown> = {}) {
    await page.waitForTimeout(1500)
    fs.writeFileSync(path.join(SALIDA, 'marcas.json'), JSON.stringify({ ...extra, marcas }, null, 2))
    const v = page.video()
    const ctx = page.context()
    await page.close()
    await ctx.close().catch(() => {})   // el video solo queda completo al cerrar el contexto (con la máquina cargada, saveAs a secas devolvía un archivo cortado)
    if (v) await v.saveAs(path.join(SALIDA, `${carpeta}.webm`))   // saveAs espera a que el video esté completamente escrito (copiar el archivo antes lo truncaba con la máquina cargada)
  }
  return { SALIDA, narrar, empezar, firmar, cambiarSede, irA, terminar }
}

/** Crea un traspaso con productos {sku, nombre, cantidad}, guarda y envía. Devuelve el folio. */
export async function crearTraspaso(page: Page, origen: string, destino: string, partidas: { sku: string; nombre: string; cantidad: number }[], hablar: (t: string, extra?: number) => Promise<void>) {
  await page.getByRole('button', { name: /Nuevo traspaso/ }).click()
  const modal = page.getByRole('dialog').last()
  await modal.getByLabel(/Sucursal origen/).selectOption({ label: origen })
  await page.waitForTimeout(800)
  await modal.getByLabel(/Sucursal destino/).selectOption({ label: destino })
  await page.waitForTimeout(800)
  await hablar(`El origen es ${origen} y el destino ${destino}. Se agregan los productos con su cantidad; la tabla muestra la existencia del origen, la del destino y el mínimo del destino.`, 0)
  for (const p of partidas) {
    const caja = modal.getByPlaceholder(/Agregar producto/)
    await caja.fill('')
    await escribir(caja, `${p.sku} · ${p.nombre}`)
    await modal.getByPlaceholder('Cantidad').fill(String(p.cantidad))
    await page.waitForTimeout(500)
    await modal.getByRole('button', { name: /\+ Agregar/ }).click()
    await page.waitForTimeout(900)
  }
  return modal
}
