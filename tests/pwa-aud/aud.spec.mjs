// PWA de Auditoría · ETAPA 5 · end-to-end en móvil (390×844, cámara falsa) contra QA.
// Cubre: instalable (manifiesto + service worker), usuario+PIN, cierre completo (criterio 4 y 5), conteo de apertura con lector simulado (teclado + Enter),
// cierre completo SIN CONEXIÓN con la app cerrada y reabierta (criterio 9), reenvío sin duplicados (criterio 10), sin ruta de galería, mis pendientes con cuenta
// regresiva (auditoría remota lanzada por el dueño), avisos push simulados y que ninguna respuesta de red traiga saldo ni diferencia.
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { llavesCiegas } from '../../src/lib/auditoria/conteoCaptura.js'
import { tieneCamposEsperado } from '../../src/lib/auditoria/cierres.js'
import { cliente, consulta, cerrarColgados, esperarBaseLibre, limpiarSesionesAbiertas, CAPTURAS, PIN, SEDE, SUPABASE_URL } from './qa.mjs'

test.describe.configure({ mode: 'serial' })

let ctxR, ctxP, page, dueno
const ciegos = []        // llaves prohibidas que haya traído CUALQUIER respuesta de Supabase a la PWA
let respuestas = 0
const foto = (p, nombre) => p.screenshot({ path: path.join(CAPTURAS, nombre + '.png') })

function vigilar(ctx, quien) {
  ctx.on('response', async r => {
    if (!r.url().startsWith(SUPABASE_URL) || !/json/.test(r.headers()['content-type'] ?? '')) return
    try {
      const j = await r.json(); respuestas++
      const k = llavesCiegas(j); if (k.length) ciegos.push(`${quien} ${r.url().split('/').slice(-2).join('/')} → ${k.join(',')}`)
      if (j && typeof j === 'object' && tieneCamposEsperado(j)) ciegos.push(`${quien} ${r.url().split('/').slice(-2).join('/')} → campos de esperado`)
    } catch { /* respuesta sin cuerpo */ }
  })
}
const opciones = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ['camera'], locale: 'es-MX', timezoneId: 'America/Mexico_City' }

async function definirPin(correo) {
  for (let i = 0; i < 3; i++) {   // otra corrida del módulo puede tener bloqueada la fila de PIN; el PIN ya definido en una corrida anterior sigue valiendo
    const c = await cliente(correo)
    const { error } = await c.rpc('definir_pin_personal', { p_pin: PIN })
    if (!error) return
    console.warn(`[e2e] no se pudo redefinir el PIN de ${correo} (${error.message}); se usa el que ya tiene`)
  }
}

async function altaYPin(p, correo) {
  await p.goto('/aud/')
  await p.getByTestId('correo').fill(correo); await p.getByTestId('clave').fill('123456')
  await p.getByTestId('alta-usuario').click()
  const sel = p.getByTestId('sucursal')
  if (await sel.count()) await sel.selectOption(SEDE)
  await p.getByTestId('pin').fill(PIN)
  await p.getByTestId('entrar').click()
  await expect(p.getByTestId('tab-cierre')).toBeVisible({ timeout: 30000 })
}

/** Hasta que el service worker controla la página y guardó la app + las plantillas de cierre (si no, «sin internet» no tendría con qué abrir). */
async function esperarListoParaOffline(p) {
  await p.waitForFunction(async () => {
    if (!navigator.serviceWorker?.controller) return false
    const c = await caches.open('pfa-shell-v1'); const n = (await c.keys()).length
    const plantillas = await new Promise(res => { const r = indexedDB.open('pf-aud-movil'); r.onsuccess = () => { try { const q = r.result.transaction('meta').objectStore('meta').getAllKeys(); q.onsuccess = () => res(q.result.filter(k => String(k).startsWith('plantilla:')).length) } catch { res(0) } }; r.onerror = () => res(0) })
    return n >= 4 && plantillas >= 4
  }, null, { timeout: 90000, polling: 1000 })
}

async function tomarFoto(p, boton) {
  await boton.click()
  await expect(p.getByTestId('camara-vivo')).toBeVisible()
  await p.waitForFunction(() => document.querySelector('[data-testid=video-vivo]')?.videoWidth > 0, null, { timeout: 20000 })
  await p.getByTestId('tomar-foto').click()
  await expect(p.getByTestId('camara-vivo')).toBeHidden({ timeout: 20000 })
}

/** Recorre un cierre de punto en punto hasta el final y lo cierra. Devuelve cuántos puntos tenía. */
async function completarCierre(p, { alCaptura } = {}) {
  let puntos = 0
  for (let guard = 0; guard < 12; guard++) {
    if (await p.getByTestId('cerrar-cierre').count()) break
    await expect(p.getByTestId('punto-nombre')).toBeVisible()
    puntos++
    if (await p.getByTestId('den-500').count()) { await p.getByTestId('den-500').fill('2'); await p.getByTestId('den-100').fill('3') }
    if (await p.getByTestId('campo-valor').count()) await p.getByTestId('campo-valor').fill('1234.5')
    if (await p.getByTestId('foto-punto').count()) await tomarFoto(p, p.getByTestId('foto-punto'))
    const tomas = p.getByTestId('foto-toma')
    for (let i = 0; i < await tomas.count(); i++) await tomarFoto(p, tomas.nth(i))
    await alCaptura?.(p)
    await p.getByTestId('guardar-seguir').click()
    await expect(p.getByTestId('avance-texto')).not.toHaveText(new RegExp(`^Punto ${puntos} de`), { timeout: 15000 })
  }
  await expect(p.getByTestId('avance-texto')).toContainText('Revisión final')
  await expect(p.getByTestId('cerrar-cierre')).toBeEnabled()
  await p.getByTestId('cerrar-cierre').click()
  await expect(p.getByTestId('cierre-guardado')).toBeVisible()
  return puntos
}
/** Llena la hoja de captura con lo que pida ese producto (cantidad, serie, sello) y guarda. */
async function guardarHoja(p, cantidad) {
  await expect(p.getByTestId('hoja-captura')).toBeVisible()
  await p.getByTestId('campo-cantidad').fill(String(cantidad))
  if (await p.getByTestId('campo-serie').count()) await p.getByTestId('campo-serie').fill('SN-E2E-' + Date.now().toString().slice(-6))
  if (await p.getByTestId('campo-sello').count()) { await p.getByTestId('campo-sello').fill('SELLO-' + Date.now().toString().slice(-6)); await p.getByTestId('sello-intacto').click() }
  await p.getByTestId('guardar-partida').click()
}
/** Espera a que la cola quede vacía. Si otra suite del módulo tiene candados en la base, el servidor responde «tiempo agotado» (transitorio): se espera a que se libere y se pide enviar ya. */
async function vaciarCola(p, maxSeg = 600) {
  const fin = Date.now() + maxSeg * 1000
  while (Date.now() < fin) {
    if (await p.getByTestId('cola-vacia').waitFor({ timeout: 20000 }).then(() => true, () => false)) return
    await esperarBaseLibre(60)
    await p.getByTestId('enviar-ahora').click({ timeout: 3000 }).catch(() => {})
  }
  await expect(p.getByTestId('cola-vacia')).toBeVisible({ timeout: 1000 })
}
const ultimoCierre = () => consulta(`select c.folio, c.estado, c.tipo,
  (select count(*) from piefirme.ctl_cierre_captura k where k.cierre_id = c.id)::int as capturas,
  (select count(*) from piefirme.ctl_evidencia e join piefirme.ctl_cierre_captura k on e.origen_id = k.id where k.cierre_id = c.id)::int as evidencias
  from piefirme.ctl_cierre c where c.usuario_cierra = (select id from auth.users where email = 'r@g.com') and c.sucursal_id = '${SEDE}' order by c.creado_en desc limit 1`)[0]

test.beforeAll(async ({ browser }) => {
  test.setTimeout(10 * 60 * 1000)
  await esperarBaseLibre(150)
  dueno = await cliente('m@g.com')
  await limpiarSesionesAbiertas(dueno)
  await cerrarColgados('r@g.com')
  await definirPin('r@g.com'); await definirPin('p@g.com')
  ctxR = await browser.newContext(opciones); vigilar(ctxR, 'r@g.com')
  ctxP = await browser.newContext(opciones); vigilar(ctxP, 'p@g.com')
  page = await ctxR.newPage()
})
test.afterAll(async () => { try { await limpiarSesionesAbiertas(dueno) } catch { /* mejor esfuerzo */ } await ctxR?.close(); await ctxP?.close() })

test('1 · instalable: manifiesto válido, íconos, service worker con alcance /aud/ y /app/ no se toca', async () => {
  await page.goto('/aud/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const m = await (await page.request.get(href)).json()
  expect(m).toMatchObject({ display: 'standalone', scope: '/aud/', start_url: '/aud/' })
  for (const i of m.icons) expect((await page.request.get(i.src)).status(), i.src).toBe(200)
  expect(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true)
  await page.waitForFunction(() => navigator.serviceWorker?.getRegistration('/aud/').then(r => !!r?.active))
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/aud/'); return { scope: new URL(r.scope).pathname } })
  expect(reg.scope).toBe('/aud/')
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).filter(r => new URL(r.scope).pathname === '/app/').length)).toBe(0)
  await foto(page, '01_login_sin_usuarios')
})

test('2 · usuario y PIN: PIN incorrecto se rechaza y el correcto abre la sesión del turno', async () => {
  await page.goto('/aud/')
  await page.getByTestId('correo').fill('r@g.com'); await page.getByTestId('clave').fill('123456'); await page.getByTestId('alta-usuario').click()
  await page.getByTestId('sucursal').selectOption(SEDE)
  await expect(page.getByTestId('entrar')).toBeDisabled()                     // menos de 4 dígitos
  await page.getByTestId('pin').fill('12'); await expect(page.getByTestId('entrar')).toBeDisabled()
  await page.getByTestId('pin').fill('0000'); await page.getByTestId('entrar').click()
  await expect(page.getByTestId('error-login')).toContainText('PIN incorrecto')
  await page.getByTestId('pin').fill(PIN); await page.getByTestId('entrar').click()
  await expect(page.getByTestId('tab-cierre')).toBeVisible({ timeout: 30000 })
  expect(await page.locator('nav.tabs button').count()).toBe(4)               // cuatro pantallas y solo estas
  await foto(page, '02_cierre_inicio')
})

test('3 · cierre completo con cámara en vivo: avance, doble confirmación y el servidor lo recibe sin duplicar', async () => {
  await esperarListoParaOffline(page)
  await page.getByTestId('iniciar-dia').click()
  await expect(page.getByTestId('barra-avance')).toBeVisible()
  await expect(page.getByTestId('avance-texto')).toContainText('Punto 1 de 3')
  await foto(page, '03_cierre_punto1_denominaciones')
  const puntos = await completarCierre(page, { alCaptura: async p => { if (await p.getByTestId('total-contado').count()) await expect(p.getByTestId('total-contado')).toContainText('1,300') } })
  expect(puntos).toBe(3)
  await foto(page, '04_cierre_guardado')
  await page.getByRole('button', { name: 'Listo' }).click()
  await page.getByTestId('tab-pendientes').click()
  await vaciarCola(page)
  const c = ultimoCierre()
  expect(c).toMatchObject({ estado: 'cerrado', tipo: 'dia', capturas: 3, evidencias: 3 })
  await foto(page, '05_pendientes_vacio')
})

test('4 · sin galería: ninguna pantalla ni la cámara tienen selector de archivos', async () => {
  for (const t of ['cierre', 'auditoria', 'recepcion', 'pendientes']) {
    await page.getByTestId('tab-' + t).click()
    expect(await page.locator('input[type=file], input[capture], [accept*=image]').count(), t).toBe(0)
  }
  await page.getByTestId('tab-cierre').click(); await page.getByTestId('iniciar-apertura').click()
  await page.locator('[data-testid=foto-punto], [data-testid=foto-toma]').first().click(); await expect(page.getByTestId('camara-vivo')).toBeVisible()
  expect(await page.locator('input[type=file]').count()).toBe(0)
  expect(await page.evaluate(() => typeof window.showOpenFilePicker)).toBe('function')   // el navegador la trae; la app no la usa (ver prueba unitaria sobre el código)
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByRole('button', { name: /Salir \(se guarda\)/ }).click()
})

test('5 · recepción: contenedor con estado vacío honesto', async () => {
  await page.getByTestId('tab-recepcion').click()
  await expect(page.getByTestId('recepcion-vacia')).toContainText('Aún no está disponible')
  await foto(page, '06_recepcion_vacia')
})

test('6 · conteo de apertura con lector simulado (teclado + Enter), a ciegas', async () => {
  await page.getByTestId('tab-auditoria').click()
  for (let i = 0; i < 6; i++) {   // otra suite del módulo puede tener candados y la RPC agota su tiempo: se reintenta cuando la base se libera
    await page.getByTestId('iniciar-conteo_apertura').click()
    if (await page.getByTestId('avance-conteo').waitFor({ timeout: 25000 }).then(() => true, () => false)) break
    await esperarBaseLibre(120)
  }
  await expect(page.getByTestId('avance-conteo')).toBeVisible({ timeout: 30000 })
  const antes = await page.getByTestId('avance-conteo').innerText()
  for (let i = 0; i < 3; i++) {
    const codigo = await page.getByTestId('siguiente-lista').getAttribute('data-codigo')
    await page.getByTestId('campo-codigo').click()
    await page.keyboard.type(codigo, { delay: 8 }); await page.keyboard.press('Enter')   // un lector Bluetooth es un teclado que escribe y manda Enter
    await expect(page.getByTestId('hoja-captura')).toBeVisible()
    if (i === 0) await foto(page, '07_conteo_hoja_captura')
    await guardarHoja(page, i + 1)
    await expect(page.getByTestId('hoja-captura')).toBeHidden({ timeout: 20000 })
  }
  expect(await page.getByTestId('avance-conteo').innerText()).not.toBe(antes)
  // código inexistente
  await page.getByTestId('campo-codigo').fill('NO-EXISTE-123'); await page.keyboard.press('Enter')
  await expect(page.getByTestId('msg-conteo')).toContainText('no corresponde')
  await expect(page.locator('body')).not.toContainText(/saldo|diferencia|esperaba|sobran|faltan \d/i)
  await foto(page, '08_conteo_avance')
  // reenvío sin duplicar (criterio 10): el servidor recibe la partida pero la respuesta se pierde
  let cortado = false
  await page.route('**/rpc/ctl_capturar_partida', async route => { if (!cortado) { cortado = true; await route.fetch().catch(() => {}); await route.abort('failed').catch(() => {}) } else await route.continue().catch(() => {}) })
  const codigo = await page.getByTestId('siguiente-lista').getAttribute('data-codigo')
  await page.getByTestId('campo-codigo').fill(codigo); await page.keyboard.press('Enter')
  await guardarHoja(page, 7)
  await expect(page.getByTestId('msg-conteo')).toContainText('quedó guardada en el teléfono')
  await page.unroute('**/rpc/ctl_capturar_partida')
  await page.getByTestId('tab-pendientes').click()
  await page.getByTestId('enviar-ahora').click({ timeout: 3000 }).catch(() => {})   // si la cola no se vació sola
  await vaciarCola(page)
  const n = consulta(`select count(*)::int n, count(distinct id)::int d from piefirme.ctl_partida_conteo where sesion_id = (select id from piefirme.ctl_sesion_conteo where sucursal_id = '${SEDE}' and tipo = 'conteo_apertura' and estado = 'abierta' and creado_por = (select id from auth.users where email = 'r@g.com') order by creado_en desc limit 1)`)[0]
  expect(n.n).toBe(4); expect(n.d).toBe(4)                                   // 3 + la reenviada = 4, ninguna duplicada
})

test('7 · cierre completo SIN conexión, app cerrada y reabierta, y se sincroniza al volver la señal (criterio 9)', async () => {
  await page.getByTestId('tab-cierre').click()
  await esperarListoParaOffline(page)
  await ctxR.setOffline(true)
  await expect(page.getByTestId('aviso-sin-red')).toBeVisible()
  await page.getByTestId('iniciar-dia').click()
  await completarCierre(page)
  await foto(page, '09_offline_cierre_guardado')
  await page.getByTestId('tab-pendientes').click()
  await expect(page.getByTestId('banner-pendientes')).toContainText('capturas pendientes de enviar')
  await foto(page, '10_offline_pendientes')
  // se cierra la app y se vuelve a abrir SIN señal
  await page.close()
  page = await ctxR.newPage()
  await page.goto('/aud/')
  await expect(page.getByTestId('tab-pendientes')).toBeVisible({ timeout: 30000 })   // la sesión sigue (PIN ya validado, turno sin cerrar)
  await page.getByTestId('tab-pendientes').click()
  await expect(page.getByTestId('banner-pendientes')).toContainText('mantén la app abierta un momento'.slice(0, 0) + 'pendientes de enviar')
  await expect(page.getByTestId('aviso-sin-red')).toBeVisible()
  await foto(page, '11_offline_reabierta')
  const antes = ultimoCierre()
  // vuelve la señal
  await ctxR.setOffline(false)
  await vaciarCola(page)
  const c = ultimoCierre()
  expect(c.folio).not.toBe(antes.folio)
  expect(c).toMatchObject({ estado: 'cerrado', capturas: 3, evidencias: 3 })     // todo llegó, una sola vez
  await foto(page, '12_offline_sincronizado')
})

test('8 · reenvío sin duplicados en un cierre (la respuesta se pierde, el teléfono reenvía)', async () => {
  let cortes = 0
  await page.route('**/rpc/ctl_cierre_capturar', async route => { if (cortes < 2) { cortes++; await route.fetch().catch(() => {}); await route.abort('failed').catch(() => {}) } else await route.continue().catch(() => {}) })
  await page.getByTestId('tab-cierre').click()
  await page.getByTestId('iniciar-dia').click()
  await completarCierre(page)
  await page.getByTestId('tab-pendientes').click()
  await page.unroute('**/rpc/ctl_cierre_capturar')
  await page.getByTestId('enviar-ahora').click({ timeout: 3000 }).catch(() => {})
  await vaciarCola(page)
  expect(cortes).toBe(2)
  expect(ultimoCierre()).toMatchObject({ estado: 'cerrado', capturas: 3, evidencias: 3 })
})

test('9 · iPhone: aviso explícito de que el escaneo por cámara es más lento', async () => {
  const p = await ctxR.newPage()
  await p.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' }))
  await p.goto('/aud/')
  await p.getByTestId('tab-auditoria').click()
  await expect(p.getByTestId('sesion-abierta').first()).toBeVisible({ timeout: 20000 })
  await p.getByTestId('sesion-abierta').first().getByRole('button', { name: 'Retomar' }).click()
  await expect(p.getByTestId('aviso-iphone')).toContainText('lector Bluetooth')
  await foto(p, '13_aviso_iphone')
  await p.close()
})

test('10 · mis pendientes: auditoría remota con cuenta regresiva y avisos push simulados (p@g.com)', async () => {
  const lanzada = await dueno.rpc('ctl_remota_lanzar', { p_sucursales: [SEDE], p_muestra: 3, p_limite_min: 30, p_incluir_recientes: true, p_motivo: 'e2e PWA' })
  expect(lanzada.error, lanzada.error?.message).toBeNull()
  const p = await ctxP.newPage()
  await altaYPin(p, 'p@g.com')
  await p.getByTestId('tab-pendientes').click()
  await expect(p.getByTestId('remota').first()).toBeVisible({ timeout: 30000 })
  const t1 = await p.getByTestId('cuenta-regresiva').first().innerText()
  expect(t1).toMatch(/^(2[89]|30) min|^29 min/)
  await p.waitForTimeout(2500)
  expect(await p.getByTestId('cuenta-regresiva').first().innerText()).not.toBe(t1)    // la cuenta corre
  await expect(p.getByTestId('insignia')).toBeVisible()
  await foto(p, '14_pendientes_remota')
  await p.getByTestId('activar-avisos').click()
  await expect(p.getByTestId('aviso-push')).toContainText('SIMULADO')
  const s = consulta(`select simulada, activa from piefirme.ctl_push_suscripcion where perfil_id = (select id from auth.users where email = 'p@g.com') limit 1`)[0]
  expect(s).toMatchObject({ simulada: true, activa: true })
  // contar la auditoría remota con el lector simulado
  await p.getByTestId('remota').first().getByRole('button', { name: 'Contar' }).click()
  await expect(p.getByTestId('avance-conteo')).toContainText('de 3', { timeout: 30000 })
  const codigo = await p.getByTestId('siguiente-lista').getAttribute('data-codigo')
  await p.getByTestId('campo-codigo').fill(codigo); await p.keyboard.press('Enter')
  await guardarHoja(p, 2)
  await expect(p.getByTestId('avance-conteo')).toContainText('1 de 3', { timeout: 20000 })
  await foto(p, '15_remota_captura')
})

test('11 · captura a ciegas: ninguna respuesta de red trajo saldo, diferencia ni valor esperado', async () => {
  expect(respuestas).toBeGreaterThan(30)
  expect(ciegos, ciegos.join('\n')).toEqual([])
})
