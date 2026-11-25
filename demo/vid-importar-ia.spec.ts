// Video Importar datos con IA (simulada): subir un CSV de pacientes, revisar el mapeo, vista previa y confirmar.
// Correr: PW_LOTE=E BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-importar-ia
import { test, expect } from '@playwright/test'
import path from 'path'
import { iniciarGrabacion } from './lib/video-c'
import { crearVideo } from './lib/video'

test.use({ launchOptions: { slowMo: 250 }, video: 'off' })   // video propio por pantallazos: el webm de Playwright sale truncado con la máquina cargada
const v = crearVideo('vid-importar-ia')
const ARCHIVO = path.join(process.cwd(), 'demo', 'datos', 'importar-pacientes-E.csv')
const SEDE = 'Pie Clinic Centenario'

test('Importar pacientes con IA simulada', async ({ page, context }) => {
  test.setTimeout(1_500_000)
  await v.empezar(context)
  const rec = await iniciarGrabacion(page, v.SALIDA)
  await v.firmar(page, SEDE, 'Prueba de la importación de datos con inteligencia artificial de Pie Clinic. Se sube un archivo de pacientes, se revisa el mapeo, se valida y se confirma.', 'm@g.com', 'la persona de administración')
  await v.irA(page, /Importar datos/)
  await expect(page.getByRole('heading', { name: /Importar datos con IA/ })).toBeVisible({ timeout: 60_000 })
  const cuerpo = async () => await page.locator('main').first().innerText()
  const aviso = (await cuerpo()).match(/[^\n]*(simulad)[^\n]*/i)?.[0]?.trim() ?? ''
  await v.narrar(page, `La importación tiene cuatro pasos: subir, mapeo, vista previa y confirmar. Arriba hay un aviso claro: ${aviso || 'la IA está en modo simulado'}. Es decir, sin llave de inteligencia artificial, la propuesta de mapeo sale de reglas locales por nombre de columna, no de un modelo.`)
  await v.narrar(page, 'Se elige el tipo de datos, pacientes, la sede destino, y qué hacer si el registro ya existe. Se sube un archivo C S V con cinco filas: tres pacientes correctos, una fila sin nombre y una paciente que ya existe.', 0)
  await page.locator('input[type=file]').setInputFiles(ARCHIVO)
  await expect(page.getByText(/5 filas/)).toBeVisible({ timeout: 120_000 })
  const resumenArchivo = (await page.getByText(/5 filas/).first().innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `El sistema leyó el archivo: ${resumenArchivo}.`, 0)
  await page.getByRole('button', { name: /Subir y proponer mapeo/ }).click()
  await expect(page.getByRole('heading', { name: /Mapeo de columnas propuesto/ })).toBeVisible({ timeout: 90_000 })
  const porRev = (await cuerpo()).match(/(\d+) por revisar/)?.[1]
  await v.narrar(page, `Esta es la propuesta de mapeo: cada columna del archivo con su campo destino y su porcentaje de confianza. Quedan ${porRev} columnas por revisar. Los campos clínicos, como las alergias, y las columnas de baja confianza siempre exigen la revisión de una persona.`)
  await page.getByRole('button', { name: 'Aceptar las seguras' }).click()
  await page.waitForTimeout(2500)
  const restan = (await cuerpo()).match(/(\d+) por revisar/)?.[1]
  await v.narrar(page, `Con aceptar las seguras se aprueban de una vez las columnas ordinarias. Todavía quedan ${restan} por revisar: las clínicas se aceptan una por una.`, 0)
  for (let i = 0; i < 6; i++) {
    const b = page.locator('tbody').getByRole('button', { name: 'Aceptar', exact: true }).first()
    if (!(await b.count())) break
    await b.click()
    await page.waitForTimeout(1800)
  }
  await expect(page.getByText(/0 por revisar/)).toBeVisible({ timeout: 120_000 })
  await v.narrar(page, 'Todas las columnas están aceptadas. Se puede guardar este mapeo como plantilla para la próxima carga del mismo sistema de origen. Se genera la vista previa.', 0)
  await page.getByRole('button', { name: /Generar vista previa/ }).click()
  await expect(page.getByText('Posibles duplicados')).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(2000)
  const t = await cuerpo()
  const val = t.match(/Válidos\s*(\d+)/)?.[1], adv = t.match(/Con advertencia\s*(\d+)/)?.[1], err = t.match(/Con error\s*(\d+)/)?.[1], dup = t.match(/Posibles duplicados\s*(\d+)/)?.[1]
  await v.narrar(page, `La vista previa valida fila por fila sin guardar nada: ${val} válidas, ${adv} con advertencia, ${err} con error y ${dup} posibles duplicados. La fila sin nombre es el error y no se cargará; la paciente repetida se detecta por nombre completo y fecha de nacimiento, y se decide si se omite, se combina o se crea nueva.`)
  await page.getByRole('button', { name: /Continuar a confirmar/ }).click()
  await expect(page.getByRole('heading', { name: 'Confirmar y cargar' })).toBeVisible()
  const aCargar = (await cuerpo()).match(/Se cargarán (\d+) de (\d+) filas/)
  await v.narrar(page, `En el último paso se lee: se cargarán ${aCargar?.[1]} de ${aCargar?.[2]} filas. Solo un administrador puede confirmar, y los datos clínicos importados quedan marcados para revisión del podólogo.`, 0)
  await page.getByRole('button', { name: 'Confirmar y cargar' }).click()
  const dlg = page.getByRole('dialog').last()
  await expect(dlg).toBeVisible()
  await v.narrar(page, 'El sistema pide una confirmación explícita antes de cargar.', 0)
  await dlg.getByRole('button', { name: 'Confirmar y cargar' }).click()
  await page.waitForTimeout(6000)
  const final = (await cuerpo())
  const cargado = /Lote cargado/.test(final)
  const falla = final.match(/La carga no terminó:[^\n]*/)?.[0] ?? ''
  if (cargado) {
    const r = final.match(/Se cargaron (\d+) registros y se omitieron (\d+)/)
    await v.narrar(page, `Lote cargado: se cargaron ${r?.[1]} registros y se omitieron ${r?.[2]}. Quedan marcados como importados, y el lote se puede deshacer desde el historial.`)
  } else {
    await v.narrar(page, `La carga no terminó. El aviso dice: ${falla.replace('La carga no terminó: ', '')}. Esto es una limitación del ambiente de pruebas: la función de servidor que escribe los registros solo existe cuando se despliega en Netlify. Queda marcado como no corregido, requiere liberación del ambiente.`)
  }
  await page.getByRole('tab', { name: /Historial de lotes/ }).click()
  await page.waitForTimeout(3000)
  const fila = page.locator('tbody tr', { hasText: 'importar-pacientes-E.csv' }).first()
  await expect(fila).toBeVisible({ timeout: 120_000 })
  const est = (await fila.innerText()).replace(/\s+/g, ' ')
  await v.narrar(page, `El historial de lotes guarda cada importación con su estado y su modo de inteligencia artificial: ${est}. Fin del recorrido de importación.`)
  await rec.detener()
  await v.terminar(page, { val, adv, err, dup, cargado, falla, historial: est })
  rec.construir(path.join(v.SALIDA, 'pantalla.mp4'))
})
