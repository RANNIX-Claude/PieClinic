// Video RH: asistencia, horarios, incidencias y vacaciones (solicitud + autorización) con la cuenta de administración.
// Correr: PW_LOTE=E BASE_URL=http://localhost:5174 npx playwright test -c playwright.caja.config.ts vid-rh-asistencia
import { test, expect } from '@playwright/test'
import { crearVideo, escribir } from './lib/video'

const v = crearVideo('vid-rh-asistencia')
const EMPLEADA = 'Sofía Lara Ortiz'      // vacaciones
const EMP_INC = 'Lucía Torres Gil'     // incidencia
const DESDE = '2026-12-07', HASTA = '2026-12-11'

test('RH: asistencia, horarios, incidencias y vacaciones', async ({ page, context }) => {
  await v.empezar(context)
  await v.firmar(page, 'Todas las sedes', 'Prueba de recursos humanos de Pie Clinic: asistencia, horarios, incidencias y vacaciones.', 'm@g.com', 'la persona de administración')
  await v.irA(page, /RH y nómina/)
  const cuerpo = async () => (await page.locator('main').first().innerText())
  const dato = async (re: RegExp) => { await expect.poll(async () => (await cuerpo()).match(re)?.[1], { timeout: 45_000 }).toBeTruthy(); return (await cuerpo()).match(re)![1] }
  const activos = await dato(/Empleados activos\s*(\d+)/)
  expect(activos).toBeTruthy()
  await v.narrar(page, `Esta es la pantalla de Recursos humanos. La clínica tiene ${activos} empleados activos. Las pestañas de arriba cubren el expediente, la asistencia, los horarios, las incidencias, las vacaciones, la nómina y los recibos.`)

  // ───── Asistencia ─────
  await page.getByRole('tab', { name: 'Asistencia', exact: true }).click()
  await page.waitForTimeout(3000)
  const pres = await dato(/Presentes hoy\s*(\d+)/)
  const ret = await dato(/Retardos hoy\s*(\d+)/)
  const fal = await dato(/Faltas hoy\s*(\d+)/)
  await v.narrar(page, `En Asistencia, la vista de semana marca cada día de cada empleado: presente, retardo, falta, justificada o descanso. Hoy hay ${pres} presentes, ${ret} retardos y ${fal} faltas.`)
  await page.getByRole('button', { name: 'Checadas', exact: true }).click()
  await page.waitForTimeout(3000)
  await v.narrar(page, 'La sub pestaña de checadas lista cada marcaje del reloj, con su origen. Desde aquí también se puede capturar una checada manual con su motivo, o importar el archivo del checador.')
  await page.getByRole('button', { name: 'Resumen mensual', exact: true }).click()
  await page.waitForTimeout(3000)
  await v.narrar(page, 'El resumen mensual concentra por empleado los días asistidos, los retardos, los minutos de retardo y las horas trabajadas. De ahí sale el descuento de la nómina.')

  // ───── Horarios ─────
  await page.getByRole('tab', { name: 'Horarios', exact: true }).click()
  await page.waitForTimeout(3000)
  await expect(page.getByRole('button', { name: /Editar/ }).first()).toBeVisible()
  await v.narrar(page, 'En Horarios se ve la jornada de cada empleado, de lunes a domingo, con su hora de entrada y de salida. Al editar, el cambio rige desde hoy y el horario anterior se conserva con su vigencia.')
  await page.getByRole('button', { name: /Editar/ }).first().click()
  await v.narrar(page, 'Así se ve la captura de un horario: entrada, salida y minutos de descanso por día. Se cierra sin cambios.', 0)
  await page.getByRole('button', { name: 'Cancelar' }).last().click()

  // ───── Incidencias ─────
  await page.getByRole('tab', { name: 'Incidencias', exact: true }).click()
  await page.waitForTimeout(3000)
  await v.narrar(page, 'En Incidencias se registran los eventos que afectan a la nómina, como permisos, faltas o incapacidades. Abajo está el catálogo de tipos, que define cuáles descuentan.')
  await page.getByRole('button', { name: /Nueva incidencia/ }).click()
  const inc = page.getByRole('dialog').last()
  await inc.getByLabel('Empleado').selectOption({ label: await etiqueta(inc.getByLabel('Empleado'), EMP_INC) })
  const selTipo = inc.getByLabel('Tipo')
  const tipoLabel = await etiquetaOpcion(selTipo, /permiso/i)
  await selTipo.selectOption({ label: tipoLabel })
  await inc.getByLabel('Motivo').fill('Trámite personal, aviso previo a administración')
  await v.narrar(page, `Se registra una incidencia para ${EMP_INC} del tipo ${tipoLabel}, con su motivo. La fecha inicial es hoy.`, 0)
  const pideMonto = await inc.getByLabel(/Monto/).count()
  if (pideMonto) await inc.getByLabel(/Monto/).fill('150')
  await inc.getByRole('button', { name: 'Guardar' }).click()
  await expect(inc).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('tr', { hasText: EMP_INC }).first()).toBeVisible({ timeout: 30_000 })
  await v.narrar(page, 'La incidencia aparece en la lista del mes con su estado registrada. Si descuenta, la nómina la prorratea o aplica su monto al calcularse.')

  // ───── Vacaciones ─────
  await page.getByRole('tab', { name: 'Vacaciones', exact: true }).click()
  await page.waitForTimeout(3500)
  const porAut = await dato(/Solicitudes por autorizar\s*(\d+)/)
  await v.narrar(page, `En Vacaciones, el sistema calcula los días de ley por antigüedad y lleva el saldo de cada empleado. Ahora hay ${porAut} solicitudes por autorizar.`)
  await page.getByRole('button', { name: /\+ Solicitar vacaciones/ }).click()
  const dlg = page.getByRole('dialog').last()
  await dlg.getByLabel('Empleado').selectOption({ label: await etiqueta(dlg.getByLabel('Empleado'), EMPLEADA) })
  await dlg.getByLabel('Desde').fill(DESDE)
  await dlg.getByLabel('Hasta').fill(HASTA)
  await page.waitForTimeout(800)
  const resumen = await dlg.getByText(/Días solicitados/).innerText()
  await v.narrar(page, `Se solicitan vacaciones para ${EMPLEADA} del siete al once de diciembre. El formulario calcula en vivo: ${resumen.replace(/\s+/g, ' ')}.`, 0)
  await dlg.getByLabel('Notas').fill('Vacaciones de fin de año')
  await dlg.getByRole('button', { name: 'Registrar solicitud' }).click()
  const fila = page.locator('tr', { hasText: EMPLEADA }).filter({ hasText: /Solicitada/ }).first()
  await expect(fila).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'La solicitud queda en estado solicitada, pendiente de autorización.')
  await fila.getByRole('button', { name: 'Autorizar' }).click()
  await expect(page.locator('tr', { hasText: EMPLEADA }).filter({ hasText: /Autorizada/ }).first()).toBeVisible({ timeout: 45_000 })
  await v.narrar(page, 'Administración autoriza la solicitud y pasa a autorizada. Con eso el sistema bloquea la agenda de ese podólogo en esos días, para que nadie le agende citas mientras está de vacaciones. Fin del recorrido de recursos humanos.')
  await v.terminar(page, { empleada: EMPLEADA, desde: DESDE, hasta: HASTA })
})

async function etiqueta(sel: import('@playwright/test').Locator, parte: string) {
  const ops = await sel.locator('option').allInnerTexts()
  const o = ops.find(t => t.includes(parte))
  if (!o) throw new Error(`No hay opción ${parte}: ${ops.slice(0, 5)}`)
  return o
}
async function etiquetaOpcion(sel: import('@playwright/test').Locator, re: RegExp) {
  const ops = await sel.locator('option').allInnerTexts()
  const o = ops.find(t => re.test(t)) ?? ops[1]
  return o
}
