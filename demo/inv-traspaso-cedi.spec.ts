// Video INV-CEDI: Centenario (CEDI) surte a una sucursal con un traspaso de varias partidas; cifras de origen y destino antes/después.
// Correr: PW_LOTE=T BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts inv-traspaso-cedi
import { test, expect, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { crearVideo, crearTraspaso } from './lib/video'

const ORIGEN = 'Pie Clinic Centenario', DESTINO = 'Pie Clinic Galerías'
const SQLPG = 'C:/Users/asus/AppData/Local/Temp/claude/05b683f7303be1b6/1a097814-e8f1-411c-81da-65d3a9658f0a/scratchpad/sqlpg.mjs'
const PARTIDAS = [
  { sku: 'PF-PD-001', nombre: 'Calcetas para pie diabético', cantidad: 3 },
  { sku: 'PF-OR-002', nombre: 'Talonera de gel', cantidad: 3 },
  { sku: 'PF-IN-001', nombre: 'Guantes de nitrilo (caja)', cantidad: 4 },
]
const v = crearVideo('inv-traspaso-cedi')

const num = (s: string) => Number(s.replace(/[^0-9.\-]/g, ''))
/** Lee de la tabla de Existencias la cifra de la sucursal activa (columna 4) para cada SKU y resalta las filas. */
async function leerExistencias(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  await page.getByPlaceholder(/Buscar SKU/).first().fill('PF-')
  await page.waitForTimeout(1200)
  for (const p of PARTIDAS) {
    const fila = page.locator('tbody tr', { hasText: p.sku }).first()
    await expect(fila).toBeVisible()
    out[p.sku] = num(await fila.locator('td').nth(3).innerText())
    await fila.evaluate(el => { (el as HTMLElement).style.outline = '3px solid #e8590c'; (el as HTMLElement).style.background = '#fff3bf' })
  }
  return out
}
const lista = (m: Record<string, number>) => PARTIDAS.map(p => `${p.nombre}, ${m[p.sku]}`).join('; ')
async function irAInventario(page: Page) {
  await v.irA(page, /^Inventario$/)
  await page.waitForTimeout(1500)
}
/** KPI «En tránsito» de la pantalla de traspasos: [cantidad, valor]. */
async function leerTransito(page: Page): Promise<{ n: number; valor: number; txt: string }> {
  const txt = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(e => e.children.length === 0 && e.textContent?.trim() === 'En tránsito')
    let p = el?.parentElement
    for (let i = 0; i < 4 && p && !/\$/.test(p.innerText); i++) p = p.parentElement
    return (p?.innerText ?? '').replace(/\s+/g, ' ')
  })
  const m = txt.match(/En tránsito\s*(\d+)[^$]*\$\s*([\d,]+(?:\.\d+)?)/)
  return { n: m ? Number(m[1]) : NaN, valor: m ? num(m[2]) : NaN, txt }
}
const sql = (q: string) => JSON.parse(execFileSync('node', [SQLPG, q], { encoding: 'utf8', maxBuffer: 1e7 }))

test('Inventario: Centenario como CEDI surte a una sucursal con un traspaso de varias partidas', async ({ page, context }) => {
  test.setTimeout(25 * 60_000)
  await v.empezar(context)
  await v.firmar(page, ORIGEN, 'Prueba de inventario de Pie Clinic. Caso: Centenario es el centro de distribución que surte a las demás sucursales. Se arma un paquete con varias partidas, se genera la orden de traspaso, se envía, se recibe y se revisan los números del inventario en las dos sucursales.', 'm@g.com', 'el administrador')

  // ───────── 1. Existencia en el origen ANTES ─────────
  await irAInventario(page)
  const origenAntes = await leerExistencias(page)
  await v.narrar(page, `Primero, el inventario del CEDI, Pie Clinic Centenario. Se eligen tres productos para el paquete. Existencia actual en Centenario: ${lista(origenAntes)}.`)

  // ───────── 2. Existencia en el destino ANTES ─────────
  await v.cambiarSede(page, DESTINO)
  await page.waitForTimeout(1500)
  const destinoAntes = await leerExistencias(page)
  await v.narrar(page, `Ahora la sucursal que se va a surtir, Pie Clinic Galerías. Sus existencias antes del traspaso: ${lista(destinoAntes)}.`)

  // ───────── 3. Crear el traspaso en el CEDI ─────────
  await v.cambiarSede(page, ORIGEN)
  await v.irA(page, /^Traspasos$/)
  const tr0 = await leerTransito(page)
  await v.narrar(page, `Esta es la pantalla de traspasos de Centenario. Antes de empezar hay ${Number.isNaN(tr0.n) ? 'cero' : tr0.n} traspasos en tránsito. Se crea la orden de traspaso hacia Galerías.`, 0)
  const modal = await crearTraspaso(page, ORIGEN, DESTINO, PARTIDAS, (t, e) => v.narrar(page, t, e))
  await expect(modal.locator('tbody tr')).toHaveCount(PARTIDAS.length)
  const total = PARTIDAS.reduce((s, p) => s + p.cantidad, 0)
  const resumen = (await modal.locator('div', { hasText: /^Partidas/ }).last().innerText()).replace(/\s+/g, ' ')
  const costo = resumen.match(/\$\s*([\d,]+\.\d\d)/)?.[1] ?? ''
  expect(resumen).toContain(`Partidas ${PARTIDAS.length}`)
  expect(resumen).toContain(`Unidades ${total}`)
  await v.narrar(page, `El paquete queda con ${PARTIDAS.length} partidas: ${PARTIDAS.map(p => p.cantidad + " de " + p.nombre).join(", ")}, ${total} piezas en total. El sistema calcula el costo del traspaso a costo promedio: ${costo} pesos.`)

  // ───────── 4. Enviar ─────────
  await v.narrar(page, 'Se envía la orden. Al enviar, las piezas salen del inventario de Centenario y quedan en tránsito.', 0)
  await modal.getByRole('button', { name: 'Enviar traspaso' }).click()
  const detalle = page.getByRole('dialog').last()
  await expect(detalle.getByText(/Enviado \(en tránsito\)/).first()).toBeVisible({ timeout: 45_000 })
  const folio = (await detalle.locator('h2, h3, [class*=title]').first().innerText()).replace('Traspaso', '').trim()
  await v.narrar(page, `La orden de traspaso ${folio.replace(/-/g, ' ')} quedó enviada, en tránsito, de Centenario a Galerías.`)
  await detalle.getByRole('button', { name: 'Cerrar' }).first().click().catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(2500)
  const tr1 = await leerTransito(page)
  expect(tr1.n).toBe((Number.isNaN(tr0.n) ? 0 : tr0.n) + 1)
  await page.getByText('En tránsito', { exact: true }).first().evaluate(el => { const c = el.closest('div')!.parentElement as HTMLElement; c.style.outline = '3px solid #e8590c' }).catch(() => {})
  await v.narrar(page, `En el tablero, la mercancía en tránsito pasó de ${Number.isNaN(tr0.n) ? 0 : tr0.n} a ${tr1.n} traspasos, con un valor en tránsito de ${tr1.valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })} pesos.`)
  await irAInventario(page)
  const origenDespues = await leerExistencias(page)
  for (const p of PARTIDAS) expect(origenDespues[p.sku]).toBe(origenAntes[p.sku] - p.cantidad)
  await v.narrar(page, `Inventario de Centenario después de enviar: ${lista(origenDespues)}. Cada producto bajó exactamente lo enviado.`)
  await v.cambiarSede(page, DESTINO)
  await page.waitForTimeout(1500)
  const destinoTransito = await leerExistencias(page)
  for (const p of PARTIDAS) expect(destinoTransito[p.sku]).toBe(destinoAntes[p.sku])
  await v.narrar(page, 'En Galerías las existencias siguen igual: la mercancía todavía no llega, solo está en tránsito.')

  // ───────── 5. Recibir en destino ─────────
  await v.narrar(page, 'La mercancía llega a Galerías. Quien recibe abre la orden de traspaso en esa sucursal.', 0)
  await v.irA(page, /^Traspasos$/)
  await page.getByText(folio, { exact: false }).first().click()
  const det2 = page.getByRole('dialog').last()
  await det2.getByRole('button', { name: 'Recibir en destino' }).click()
  const recep = page.getByRole('dialog').last()
  await expect(recep.locator('tbody tr')).toHaveCount(PARTIDAS.length)
  await v.narrar(page, `La pantalla de recepción lista las ${PARTIDAS.length} partidas con lo enviado. Se cuenta la mercancía física y se captura lo recibido. Aquí llegó todo completo, así que las cantidades se dejan como vienen. Si faltara una pieza, el sistema pide el motivo y genera una reclamación.`)
  await recep.getByRole('button', { name: 'Confirmar recepción' }).click()
  await expect(page.getByRole('dialog').last().getByText(/Recibido completo/).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, `La orden ${folio.replace(/-/g, ' ')} queda en estado recibido completo.`)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(2500)
  const tr2 = await leerTransito(page)
  expect(tr2.n).toBe(tr0.n || 0)
  await v.narrar(page, `La mercancía en tránsito vuelve a ${tr2.n} traspasos.`)

  // ───────── 6. Existencias finales ─────────
  await irAInventario(page)
  const destinoDespues = await leerExistencias(page)
  for (const p of PARTIDAS) expect(destinoDespues[p.sku]).toBe(destinoAntes[p.sku] + p.cantidad)
  await v.narrar(page, `Inventario de Galerías después de recibir: ${lista(destinoDespues)}. Cada producto subió lo recibido.`)
  await v.cambiarSede(page, ORIGEN)
  await page.waitForTimeout(1500)
  const origenFinal = await leerExistencias(page)
  for (const p of PARTIDAS) expect(origenFinal[p.sku]).toBe(origenDespues[p.sku])

  // ───────── Tabla resumen ─────────
  const filas = PARTIDAS.map(p => ({ producto: p.nombre, sku: p.sku, enviado: p.cantidad, oa: origenAntes[p.sku], od: origenFinal[p.sku], da: destinoAntes[p.sku], dd: destinoDespues[p.sku] }))
  for (const f of filas) expect(f.oa + f.da).toBe(f.od + f.dd)
  await page.evaluate(({ filas, folio, costo }) => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;inset:70px 120px;background:#fff;border:3px solid #1b3f7a;border-radius:10px;padding:20px;z-index:99999;font:16px sans-serif;box-shadow:0 8px 40px #0008'
    d.innerHTML = `<h2 style="margin:0 0 10px">Resumen del traspaso ${folio} · Centenario → Galerías · costo $${costo}</h2><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#1b3f7a;color:#fff"><th style="padding:8px;text-align:left">Producto</th><th>Enviado</th><th>Centenario antes → después</th><th>Galerías antes → después</th><th>Suma antes → después</th></tr></thead><tbody>${filas.map((f: any) => `<tr style="border-bottom:1px solid #ccc;text-align:center"><td style="padding:8px;text-align:left">${f.producto} (${f.sku})</td><td>${f.enviado}</td><td>${f.oa} → ${f.od}</td><td>${f.da} → ${f.dd}</td><td>${f.oa + f.da} → ${f.od + f.dd}</td></tr>`).join('')}</tbody></table>`
    document.body.appendChild(d)
  }, { filas, folio, costo })
  const resTxt = filas.map(f => `${f.producto}: Centenario ${f.oa} a ${f.od}, Galerías ${f.da} a ${f.dd}`).join('. ')
  await v.narrar(page, `Resumen del traspaso. ${resTxt}. En cada producto, la suma de las dos sucursales es la misma antes y después: el inventario se conserva.`)

  // ───────── Verificación SQL de solo lectura ─────────
  const rows = sql(`select p.sku, s.nombre sede, i.existencia from piefirme.inventario_sede i join piefirme.productos p on p.id=i.producto_id join piefirme.sedes s on s.id=i.sede_id where s.nombre in ('${ORIGEN}','${DESTINO}') and p.sku in (${PARTIDAS.map(p => `'${p.sku}'`).join(',')})`)
  for (const f of filas) {
    const o = Number(rows.find((r: any) => r.sku === f.sku && r.sede === ORIGEN).existencia), d = Number(rows.find((r: any) => r.sku === f.sku && r.sede === DESTINO).existencia)
    expect(o).toBe(f.od); expect(d).toBe(f.dd); expect(o + d).toBe(f.oa + f.da)
  }
  const est = sql(`select estado, unidades, valor_total from piefirme.prp_traspasos where folio='${folio}'`)
  expect(est[0].estado).toBe('recibido_completo'); expect(Number(est[0].unidades)).toBe(total)
  await v.narrar(page, 'Además, una consulta de solo lectura a la base de datos confirma las mismas cifras, y que la orden quedó recibida completa.', 0)
  await v.terminar(page, { folio, costo, filas, transito: { antes: tr0, enviado: tr1, final: tr2 } })
})
