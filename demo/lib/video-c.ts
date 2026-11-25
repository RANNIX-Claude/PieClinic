// Utilerías del lote C de videos de QA: firma con cualquier cuenta de prueba (video.ts solo firma con recepción), cierre de sesión y trazo de firma.
import { expect, type Page } from '@playwright/test'
import { CLAVE, escribir } from './video'

export const CUENTAS = {
  podologo: { email: 'p@g.com', quien: 'el podólogo' },
  recepcion: { email: 'r@g.com', quien: 'la persona de recepción' },
  admin: { email: 'm@g.com', quien: 'la administradora' },
} as const
export type Cuenta = keyof typeof CUENTAS

type Voz = (page: Page, texto: string, extraMs?: number) => Promise<void>

/** Inicia sesión con la cuenta indicada (y elige sucursal si se indica). */
export async function firmarCon(page: Page, narrar: Voz, cuenta: Cuenta, sede: string | null, intro?: string) {
  await page.goto('/app/login', { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#pf-email').waitFor({ timeout: 120_000 })
  if (intro) await narrar(page, intro)
  await narrar(page, `Primero, ${CUENTAS[cuenta].quien} firma con su cuenta personal.`, 0)
  await escribir(page.locator('#pf-email'), CUENTAS[cuenta].email)
  await escribir(page.locator('#pf-pass'), CLAVE)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.locator('header')).toBeVisible({ timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  if (sede) {
    const sel = page.locator('header select')
    await sel.waitFor({ timeout: 90_000 })   // el selector de sede aparece cuando termina de cargar el perfil (con la máquina lenta puede tardar)
    await sel.selectOption({ label: sede }); await page.waitForTimeout(1500)
  }
}

/** Cierra la sesión desde el menú del usuario. */
export async function cerrarSesion(page: Page) {
  await page.locator('header button[aria-haspopup="menu"]').click()
  await page.waitForTimeout(700)
  await page.getByRole('menuitem', { name: /Cerrar sesión/ }).or(page.getByRole('button', { name: /Cerrar sesión/ })).first().click()
  await page.locator('#pf-email').waitFor({ timeout: 60_000 })
}

/** Dibuja un trazo en el lienzo de firma del diálogo abierto. */
export async function trazarFirma(page: Page) {
  const lienzo = page.getByLabel('Área de firma').last()
  await lienzo.scrollIntoViewIfNeeded()
  const b = (await lienzo.boundingBox())!
  const x = b.x, y = b.y
  await page.mouse.move(x + b.width * 0.15, y + b.height * 0.6)
  await page.mouse.down()
  const pts: [number, number][] = [[0.25, 0.3], [0.35, 0.7], [0.45, 0.35], [0.55, 0.65], [0.7, 0.4], [0.85, 0.55]]
  for (const [px, py] of pts) await page.mouse.move(x + b.width * px, y + b.height * py, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(600)
}


// ── Grabación propia por pantallazos (CDP screencast) ──────────────────────────────────────────────────────────
// El codificador de video de Playwright es un proceso ffmpeg vivo durante toda la prueba; con la máquina cargada (varios lotes grabando a la vez)
// se queda atrás o lo matan y el webm sale truncado a la mitad. Aquí solo se guardan JPEG en disco durante la prueba y el video se arma al final.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

export async function iniciarGrabacion(page: Page, dirSalida: string) {
  const dirFrames = path.join(os.tmpdir(), 'pf-frames-' + path.basename(dirSalida))   // fuera de OneDrive: miles de JPEG sincronizándose frenan la prueba
  fs.rmSync(dirFrames, { recursive: true, force: true })
  fs.mkdirSync(dirFrames, { recursive: true })
  const sesion = await page.context().newCDPSession(page)
  const frames: { t: number; archivo: string }[] = []
  const inicio = Date.now()
  let n = 0
  sesion.on('Page.screencastFrame', (ev: any) => {
    const t = Math.max(0, ev.metadata.timestamp * 1000 - inicio)
    const archivo = path.join(dirFrames, String(n++).padStart(6, '0') + '.jpg')
    fs.writeFileSync(archivo, Buffer.from(ev.data, 'base64'))
    frames.push({ t, archivo })
    sesion.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {})
  })
  await sesion.send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: 1366, maxHeight: 768, everyNthFrame: 2 })
  let fin = 0
  return {
    /** Detiene la captura (antes de v.terminar); el último cuadro se sostiene `relleno` ms para cubrir la espera de terminar(). */
    async detener(relleno = 1500) {
      await sesion.send('Page.stopScreencast').catch(() => {})
      fin = Date.now() - inicio + relleno
    },
    /** Arma el MP4 de pantalla (cuadros con su duración real) y devuelve su ruta; úsalo como «video» de demo/mezclar.mjs. */
    construir(salida: string) {
      if (!frames.length) throw new Error('No se capturó ningún cuadro')
      frames.sort((a, b) => a.t - b.t)
      const lista = frames.map((f, i) => {
        const dur = Math.max(0.04, ((i + 1 < frames.length ? frames[i + 1].t : fin) - f.t) / 1000)
        return `file '${f.archivo.split(path.sep).join('/')}'\nduration ${dur.toFixed(3)}`
      })
      lista.push(`file '${frames[frames.length - 1].archivo.split(path.sep).join('/')}'`)
      const txt = path.join(dirFrames, 'frames.txt')
      fs.writeFileSync(txt, lista.join('\n'))
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', txt, '-vf', 'fps=12,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-movflags', '+faststart', salida])
      fs.rmSync(dirFrames, { recursive: true, force: true })
      return salida
    },
  }
}
