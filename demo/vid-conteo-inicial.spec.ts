// Video VID-I (formato MÓVIL 390x844): cargar inventario con el celular: Escanear → precio de venta → existencia → Guardar → siguiente producto → Resumen.
// Correr: PW_LOTE=I BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-conteo-inicial
// Mezcla en vertical: node demo/mezclar-movil.mjs demo/video/vid-conteo-inicial demo/video/vid-conteo-inicial/vid-conteo-inicial.webm demo/video/vid-conteo-inicial-narrado.mp4
import { test, expect as expectBase, type Page } from '@playwright/test'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { crearVideo, escribir } from './lib/video'

const SEDE = 'Xochimilco'                  // sucursal nueva, sin existencias ni conteos: el conteo inicial no pone en cero nada de otra clínica
const CONOCIDO = { codigo: '7500000000042', sku: 'PF-CC-002', nombre: 'Spray desodorante de pies' }
const NUEVO_CODIGO = `75099${String(Date.now()).slice(-8)}`   // inventado y único por corrida
const NUEVO_NOMBRE = 'Tobillera de neopreno (video)'
const NUEVO_PRECIO = 185, NUEVA_CANT = 10, CONOCIDO_CANT = 3
const SQLPG = 'C:/Users/asus/AppData/Local/Temp/claude/05b683f7303be1b6/1a097814-e8f1-411c-81da-65d3a9658f0a/scratchpad/sqlpg.mjs'
const sql = (q: string) => JSON.parse(execFileSync('node', [SQLPG, q], { encoding: 'utf8', maxBuffer: 1e7 }))
const v = crearVideo('vid-conteo-inicial')
const num = (s: string) => Number(s.replace(/[^0-9.\-]/g, ''))
const cifras = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const expect = expectBase.configure({ timeout: 60_000 })   // máquina saturada: esperas largas
const narrar0 = v.narrar
v.narrar = async (pg: Page, t: string, e?: number) => { fs.appendFileSync('C:/Users/asus/AppData/Local/Temp/vidI.prog', new Date().toISOString().slice(11, 19) + ' ' + t.slice(0, 70) + String.fromCharCode(10)); return narrar0(pg, t, e) }

// Celular vertical + cámara simulada del navegador (imagen de prueba) para mostrar la lectura con cámara.
test.use({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  video: { mode: 'on', size: { width: 390, height: 844 } },
  permissions: ['camera'],
  launchOptions: { slowMo: 250, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

async function escanearConLector(page: Page, codigo: string) {
  const c = page.getByLabel('Código de barras')
  await c.scrollIntoViewIfNeeded()
  await c.click()
  await escribir(c, codigo)
  await c.press('Enter')
}
async function confirmarDialogo(page: Page, boton: string) {
  const d = page.getByRole('dialog').last()
  await expect(d).toBeVisible()
  await page.waitForTimeout(1800)
  await d.getByRole('button', { name: boton, exact: true }).click()
  await page.waitForTimeout(1500)
}
async function resaltar(loc: ReturnType<Page['locator']>) {
  await loc.evaluate(el => { (el as HTMLElement).style.outline = '3px solid #e8590c'; (el as HTMLElement).style.background = '#fff3bf' }).catch(() => {})
}
async function irA(page: Page, ruta: string) {
  await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
}

test('Conteo inicial en el celular: escanear, precio, existencia y guardar', async ({ page, context }) => {
  test.setTimeout(90 * 60_000)
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de inventario de Pie Clinic, desde el celular. Caso: cargar el inventario de una sucursal nueva. Se escanea el producto, se pone el precio de venta, se dice cuántas piezas hay y se guarda. Después, el siguiente producto.', 'm@g.com', 'el administrador')

  // ───────── 1. Iniciar el conteo ─────────
  await irA(page, '/app/conteo-inicial')
  const iniciar = page.getByRole('button', { name: 'Iniciar conteo inicial' })
  await expect(iniciar.or(page.getByText(/Corte activo/))).toBeVisible({ timeout: 120_000 })
  if (await iniciar.isVisible().catch(() => false)) {
    await v.narrar(page, `Esta es la pantalla de conteo inicial de la sucursal ${SEDE}, que todavía no tiene inventario. Se inicia el conteo: es un corte, y mientras está abierto la sucursal no registra ventas ni traspasos.`, 0)
    await iniciar.click()
    await confirmarDialogo(page, 'Iniciar corte')
  }
  await expect(page.getByTestId('boton-escanear')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('zona-actual')).toHaveText('General', { timeout: 120_000 })
  await v.narrar(page, 'El conteo está abierto. No hay que preparar nada: el sistema abrió solo la zona General, que se ve arriba, y se puede cambiar de anaquel cuando se quiera. Lo único que sigue es el botón grande Escanear.')

  // ───────── 2. Cámara y lector ─────────
  await v.narrar(page, 'Se toca Escanear para abrir la cámara y apuntar al código de barras o al QR del empaque.', 0)
  await page.getByTestId('boton-escanear').click()
  await page.waitForTimeout(6000)
  const camaraVisible = await page.locator('[id^="cam-"] video').first().isVisible().catch(() => false)
  await v.narrar(page, camaraVisible
    ? 'Se abre la cámara con su visor. En esta grabación la cámara es de prueba y solo muestra una imagen de ejemplo, así que el código se simula con el lector de código de barras, que también funciona al mismo tiempo: escribe el código y manda Enter.'
    : 'La lectura con cámara pide permiso del navegador; en esta grabación no hay una cámara real conectada. El código se simula con el lector de código de barras, que escribe el código y manda Enter.')

  // ───────── 3. Producto nuevo: precio y 10 piezas ─────────
  await v.narrar(page, `Primer producto, uno que nunca se había dado de alta. Se lee su código ${NUEVO_CODIGO.split('').join(' ')}.`, 0)
  await escanearConLector(page, NUEVO_CODIGO)
  const hoja = page.getByTestId('hoja-captura')
  await expect(hoja).toBeVisible()
  await expect(hoja.getByText('Producto nuevo')).toBeVisible()
  await v.narrar(page, 'Al leer el código aparece la hoja de captura a pantalla completa. Como el código no está en el catálogo, dice Producto nuevo y pide el nombre, el precio de venta y las piezas.', 0)
  await escribir(hoja.getByLabel('Nombre del producto'), NUEVO_NOMBRE)
  await hoja.getByLabel('Precio de venta').click()
  await escribir(hoja.getByLabel('Precio de venta'), String(NUEVO_PRECIO))
  await v.narrar(page, `Se escribe el nombre, y el precio de venta: ${NUEVO_PRECIO} pesos, con IVA incluido. El campo es grande y abre el teclado numérico.`, 0)
  await hoja.getByLabel('Existencia en piezas').fill(String(NUEVA_CANT))
  await resaltar(hoja.getByLabel('Existencia en piezas'))
  const botonGuardar = hoja.getByRole('button', { name: /^Guardar/ })
  await expect(botonGuardar).toContainText(`${NUEVA_CANT} piezas`)
  await v.narrar(page, `Luego la existencia: ${NUEVA_CANT} piezas. Se puede teclear o usar los botones de menos y más. El botón Guardar, siempre visible abajo, ya dice ${NUEVA_CANT} piezas.`)
  await botonGuardar.click()
  await expect(hoja).toBeHidden()
  await expect(page.getByTestId('ultimo-guardado')).toContainText(NUEVO_NOMBRE)
  const aviso1 = (await page.getByTestId('ultimo-guardado').innerText()).replace(/\s+/g, ' ')
  await resaltar(page.getByTestId('ultimo-guardado'))
  expect(aviso1).toContain(`${cifras(NUEVO_PRECIO)}`)
  await v.narrar(page, `Se guardó el precio y las piezas en un solo paso, y la pantalla volvió a la cámara para el siguiente producto. El aviso verde confirma: ${NUEVO_NOMBRE}, ${NUEVA_CANT} piezas, ${NUEVO_PRECIO} pesos.`)

  // ───────── 4. Producto conocido: precio precargado, 3 piezas ─────────
  await v.narrar(page, `Segundo producto, uno que ya está en el catálogo. Se lee el código ${CONOCIDO.codigo.split('').join(' ')}.`, 0)
  await escanearConLector(page, CONOCIDO.codigo)
  await expect(hoja).toBeVisible()
  await expect(hoja.getByText(CONOCIDO.nombre)).toBeVisible()
  await expect(hoja.getByLabel('Precio de venta')).toHaveValue('150')
  await resaltar(hoja.getByLabel('Precio de venta'))
  await v.narrar(page, `Esta vez la hoja ya trae el nombre, ${CONOCIDO.nombre}, y el precio de venta vigente, 150 pesos, precargado. Se puede corregir; si se cambia, el sistema pide confirmación y deja el anterior en el histórico. Aquí se deja igual.`, 0)
  await hoja.getByLabel('Existencia en piezas').fill(String(CONOCIDO_CANT))
  await expect(botonGuardar).toContainText(`${CONOCIDO_CANT} piezas`)
  await v.narrar(page, `Se capturan ${CONOCIDO_CANT} piezas y se pulsa Guardar.`, 0)
  await botonGuardar.click()
  await expect(hoja).toBeHidden()
  await expect(page.getByTestId('ultimo-guardado')).toContainText(CONOCIDO.nombre)
  await resaltar(page.getByTestId('ultimo-guardado'))
  await v.narrar(page, `Guardado: ${CONOCIDO.nombre}, ${CONOCIDO_CANT} piezas, 150 pesos.`)

  // ───────── 5. Resumen ─────────
  await page.getByTestId('boton-escanear').click()    // apaga la cámara
  await page.getByTestId('boton-resumen').click()
  const resumen = page.getByTestId('resumen')
  await expect(resumen).toBeVisible()
  await resumen.scrollIntoViewIfNeeded()
  const kp = (await resumen.locator('.grid-kpis').innerText()).replace(/\s+/g, ' ')
  const g = (r: RegExp) => num(kp.match(r)?.[1] ?? 'NaN')
  const kProd = g(/Productos contados\s*([\d.,]+)/), kPz = g(/Piezas\s*([\d.,]+)/), kProv = g(/Provisionales\s*([\d.,]+)/)
  expect(kProd).toBe(2); expect(kPz).toBe(NUEVA_CANT + CONOCIDO_CANT); expect(kProv).toBe(1)
  await resaltar(resumen.locator('.grid-kpis'))
  await v.narrar(page, `Todo lo demás está en el botón Resumen. Muestra ${kProd} productos contados, ${kPz} piezas en total y ${kProv} producto provisional, que es el nuevo. Abajo, cada captura aparece como tarjeta, con su cantidad, y las zonas con sus totales.`)
  await resumen.getByText(NUEVO_NOMBRE).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(2500)

  // ───────── 6. Cerrar zona y aprobar ─────────
  const cerrar = resumen.getByRole('button', { name: /Cerrar zona «General»/ })
  await cerrar.scrollIntoViewIfNeeded()
  await v.narrar(page, 'Al terminar el anaquel se cierra la zona, con su total de productos y piezas.', 0)
  await cerrar.click()
  await confirmarDialogo(page, 'Cerrar zona')
  await expect(resumen.getByText(/Todas las zonas están cerradas/)).toBeVisible()
  const aprobar = resumen.getByRole('button', { name: /Aprobar inventario inicial/ })
  await aprobar.scrollIntoViewIfNeeded()
  await v.narrar(page, 'Con todas las zonas cerradas, Administración aprueba el inventario inicial. Lo contado se convierte en existencias y la sucursal vuelve a poder vender.', 0)
  await aprobar.click()
  await confirmarDialogo(page, 'Aprobar')
  await expect(page.getByText('Aprobado', { exact: true }).first()).toBeVisible({ timeout: 90_000 })
  await v.narrar(page, 'El inventario inicial quedó aprobado.')

  // ───────── 7. Inventario ─────────
  await irA(page, '/app/inventario')
  const buscar = page.getByPlaceholder(/Buscar SKU/).first()
  const filaTxt = async (texto: string) => {
    await buscar.fill(texto); await page.waitForTimeout(1500)
    const celda = page.getByText(texto, { exact: false }).first()
    await expect(celda).toBeVisible({ timeout: 60_000 })
    await celda.scrollIntoViewIfNeeded()
    const t = await celda.evaluate(el => ((el.closest('tr') ?? el.closest('[class*=card]') ?? el.parentElement?.parentElement) as HTMLElement).innerText.replace(/\s+/g, ' '))
    await resaltar(celda.locator('xpath=ancestor-or-self::*[self::tr or contains(@class,"card")][1]'))
    return t
  }
  const tNuevo = await filaTxt(`PROV-${NUEVO_CODIGO}`)
  expect(tNuevo).toMatch(new RegExp(`\\b${NUEVA_CANT}\\b`))
  await v.narrar(page, `En Inventario, ${NUEVO_NOMBRE} aparece con ${NUEVA_CANT} piezas en la sucursal ${SEDE}.`)
  const tConocido = await filaTxt(CONOCIDO.sku)
  expect(tConocido).toMatch(new RegExp(`\\b${CONOCIDO_CANT}\\b`))
  await v.narrar(page, `Y ${CONOCIDO.nombre} aparece con ${CONOCIDO_CANT} piezas.`)

  // ───────── Verificación SQL de solo lectura ─────────
  const r = sql(`select p.sku, p.estado, i.existencia, pr.precio, pr.motivo from piefirme.productos p join piefirme.inventario_sede i on i.producto_id=p.id join piefirme.sedes s on s.id=i.sede_id and s.nombre='${SEDE}' left join piefirme.precios pr on pr.producto_id=p.id and pr.vigente_hasta is null where p.codigo_barras='${NUEVO_CODIGO}'`)
  expect(Number(r[0].existencia)).toBe(NUEVA_CANT); expect(Number(r[0].precio)).toBe(NUEVO_PRECIO)
  await v.narrar(page, 'Una consulta de solo lectura a la base confirma las mismas cifras: las piezas contadas y el precio de venta guardado como alta inicial por conteo.', 0)
  await v.narrar(page, 'Pendiente por decidir: el producto nuevo queda provisional hasta que Administración le asigne categoría, y mientras tanto no aparece en Caja para venderse. Es una regla por defecto, revisable por el dueño.', 0)
  await v.terminar(page, { codigoNuevo: NUEVO_CODIGO, nombreNuevo: NUEVO_NOMBRE, precio: NUEVO_PRECIO, kpis: { kProd, kPz, kProv }, sql: r[0] })
})
