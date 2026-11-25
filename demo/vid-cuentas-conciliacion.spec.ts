// Video B4: cuenta por pagar (nacida de la compra del video B1), registro del pago por Administración y conciliación con el estado de cuenta bancario.
// Requiere haber grabado antes vid-compra-proveedor (lee su marcas.json para saber la factura).
// Correr: PW_LOTE=B BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-cuentas-conciliacion
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { crearVideo, escribir, dinero, letras } from './lib/video'

const SEDE = 'Pie Clinic Galerías'
const v = crearVideo('vid-cuentas-conciliacion')
const compra = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'demo', 'video', 'vid-compra-proveedor', 'marcas.json'), 'utf8'))
const FACTURA: string = compra.factura

test('Finanzas: pagar una cuenta por pagar y conciliarla con el banco', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, SEDE, 'Prueba de finanzas de Pie Clinic. Cómo se paga una cuenta por pagar a un proveedor y cómo ese pago se concilia con el estado de cuenta del banco.', 'm@g.com', 'la persona de Administración')

  // ───────── Cuenta por pagar ─────────
  await v.irA(page, /^Cuentas por pagar y cobrar$/)
  const fila = page.locator('tbody tr', { hasText: FACTURA }).first()
  await escribir(page.getByPlaceholder(/Buscar folio, proveedor/), FACTURA)
  await expect(fila).toBeVisible({ timeout: 45_000 })
  const celdas = (await fila.locator('td').allInnerTexts()).map(t => t.trim())
  const importe = dinero(celdas[6]), saldo = dinero(celdas[8])
  expect(saldo).toBe(importe)
  await expect(fila.getByText('Programada', { exact: true })).toBeVisible()
  await v.narrar(page, `La cuenta por pagar de la factura ${FACTURA.replace('-', ' ')} de Podo Supply nació sola al recibir la compra. Importe ${letras(importe)} pesos, saldo ${letras(saldo)}, sin pagos, en estado programada, con vencimiento ${celdas[5]}.`, 0)
  await fila.getByRole('button', { name: /Registrar pago/ }).click()
  const pago = page.getByRole('dialog').last()
  await expect(pago.getByText(/Solo Administración autoriza pagos \(P-096\)/)).toBeVisible()
  await expect(pago.getByLabel('Monto')).toHaveValue(String(saldo))
  const opcionesCta = await pago.getByLabel(/Cuenta bancaria/).locator('option').allInnerTexts()
  const cuentaTxt = opcionesCta.find(o => o.includes('BBVA'))!
  await pago.getByLabel(/Cuenta bancaria/).selectOption({ label: cuentaTxt })
  const referencia = `SPEI-${FACTURA.slice(3)}`
  await escribir(pago.getByLabel('Referencia'), referencia)
  await v.narrar(page, `Solo Administración autoriza y registra los pagos a proveedores. El monto propuesto es el saldo completo. La forma de pago es transferencia, desde la cuenta ${cuentaTxt.replace('···', 'terminación ')}, con la referencia ${referencia.replace('-', ' ')}.`, 0)
  await pago.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(fila.getByText('Pagada', { exact: true })).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'La cuenta quedó pagada y su saldo en cero. Al pagar, el sistema también generó el gasto correspondiente, base caja.', 0)
  await page.getByRole('tab', { name: /Pagos a proveedores/ }).click()
  const filaPago = page.locator('tbody tr', { hasText: referencia }).first()
  await expect(filaPago).toBeVisible({ timeout: 45_000 })
  await expect(filaPago.getByText('No', { exact: true })).toBeVisible()
  await v.narrar(page, 'En la pestaña de pagos a proveedores aparece el pago con su referencia, y todavía figura como no conciliado: falta cruzarlo con el banco.')

  // ───────── Estado de cuenta ─────────
  const hoyIso = new Date().toISOString().slice(0, 10)
  const csv = path.join(v.SALIDA, 'estado_cuenta_bbva.csv')
  fs.writeFileSync(csv, `fecha,descripcion,monto,referencia\n${hoyIso},SPEI ENVIADO PODO SUPPLY,-${saldo.toFixed(2)},${referencia}\n`)
  await v.irA(page, /^Conciliación bancaria$/)
  const cuentas = await page.getByLabel('Cuenta bancaria', { exact: true }).locator('option').allInnerTexts()
  await page.getByLabel('Cuenta bancaria', { exact: true }).selectOption({ label: cuentas.find(o => o.includes('BBVA'))! })
  await page.waitForTimeout(2000)
  await v.narrar(page, 'En Conciliación bancaria se elige la cuenta del banco, y el mes. Los movimientos del banco se cruzan contra cobros, gastos y pagos a proveedores. Para este mes todavía no se ha cargado el estado de cuenta.', 0)
  await page.getByRole('button', { name: /Cargar estado de cuenta/ }).click()
  const carga = page.getByRole('dialog').last()
  await carga.locator('input[type=file]').setInputFiles(csv)
  await expect(carga.getByText(/Vista previa \(1 filas válidas\)/)).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'Se carga el archivo CSV que descargó el banco. El sistema usa el mapeo de columnas de la cuenta, y la vista previa muestra una fila válida: el cargo de la transferencia al proveedor, con la misma referencia del pago.', 0)
  await carga.getByRole('button', { name: /Importar 1 movimientos/ }).click()
  const mov = page.locator('tbody tr', { hasText: referencia }).first()
  await expect(mov).toBeVisible({ timeout: 60_000 })
  await expect(mov.getByText('Conciliado', { exact: true })).toBeVisible({ timeout: 60_000 })
  await v.narrar(page, 'Al importar, el sistema corre la conciliación automática: el cargo coincide por referencia y monto con el pago al proveedor, y el movimiento queda conciliado sin intervención.', 0)

  // ───────── Verificación en cuentas ─────────
  await v.irA(page, /^Cuentas por pagar y cobrar$/)
  await page.getByRole('tab', { name: /Pagos a proveedores/ }).click()
  const filaPago2 = page.locator('tbody tr', { hasText: referencia }).first()
  await expect(filaPago2).toBeVisible({ timeout: 45_000 })
  await expect(filaPago2.getByText('Sí', { exact: true })).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'De regreso en cuentas por pagar, el pago ya figura como conciliado. Así se cierra el ciclo: compra, cuenta por pagar, pago y banco. Fin de la prueba.')
  await v.terminar(page, { factura: FACTURA, importe, referencia, cuentaTxt, csv: path.basename(csv) })
})
