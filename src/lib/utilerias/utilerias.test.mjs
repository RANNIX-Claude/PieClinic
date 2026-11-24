import test from 'node:test'
import assert from 'node:assert/strict'
import { CALCULOS, verificarTodos, ejecutarCalculo, leerParametro, parametrosVigentes, diaInicioSemana, parametroModificado, GRUPOS_CALCULO } from './calculos.js'
import { CHEQUEOS, semaforoChequeo, resumenChequeos, totalesValidacion, saludPct, filasExportables } from './validacion.js'
import { validarConsulta, aFiltrosLeer, esVistaPermitida, VISTAS_PERMITIDAS, LIMITE_FILAS, tipoColumna, detalleBitacora } from './consulta.js'
import { armarEntrega, progresoEntrega, PASOS } from './entrega.js'
import { filtrarFilas, columnasDe, textoCelda } from './catalogos.js'
import { filtrarAccesos, resumenAccesos, agruparPorDia, mesesDe } from './asistente.js'

test('los casos de referencia de todos los cálculos pasan', () => {
  const r = verificarTodos()
  assert.ok(r.total >= 20)
  assert.equal(r.fallan, 0, JSON.stringify(Object.values(r.detalle).flat().filter(x => !x.ok)))
})

test('todo cálculo declara grupo conocido, fórmula, campos y casos', () => {
  for (const c of CALCULOS) {
    assert.ok(GRUPOS_CALCULO.includes(c.grupo), c.id)
    assert.ok(c.formula && c.descripcion && c.campos.length && c.casos.length, c.id)
    assert.ok(ejecutarCalculo(c, {}, {}).length > 0, c.id)
  }
})

test('parámetros de la clínica: ruta con puntos, defectos y modificación', () => {
  assert.equal(leerParametro({ iva: { tasa_general: 8 } }, 'iva.tasa_general', 16), 8)
  assert.equal(leerParametro({}, 'iva.tasa_general', 16), 16)
  const P = parametrosVigentes({ anticipo_pct: 40, semana_corte: { inicio: 'lunes' } })
  assert.equal(P.anticipo_pct.valor, 40)
  assert.ok(parametroModificado(P.anticipo_pct))
  assert.ok(!parametroModificado(parametrosVigentes({}).anticipo_pct))
  assert.ok(!parametroModificado(parametrosVigentes({}).semana_inicio))
  assert.equal(diaInicioSemana({ semana_corte: { inicio: 'lunes' } }), 1)
  assert.equal(diaInicioSemana({}), 6)
})

test('el probador respeta los parámetros de la clínica', () => {
  const anticipo = CALCULOS.find(c => c.id === 'anticipo')
  const r = ejecutarCalculo(anticipo, { precio: 1000, tipo_precio: 'fijo', horas: 100, clip: 0, repro: 0 }, { anticipo_pct: 50 })
  assert.equal(r.find(x => x.label === 'Anticipo requerido').valor, 500)
  const semana = CALCULOS.find(c => c.id === 'semana')
  const s = ejecutarCalculo(semana, { fecha: '2026-10-26' }, { semana_corte: { inicio: 'lunes' } })
  assert.equal(s.find(x => x.label === 'Inicio de la semana').valor, '2026-10-26')
})

test('semáforo de chequeos por severidad', () => {
  assert.equal(semaforoChequeo(0, 'critica'), 'v')
  assert.equal(semaforoChequeo(1, 'critica'), 'r')
  assert.equal(semaforoChequeo(3, 'alta'), 'a')
  assert.equal(semaforoChequeo(10, 'alta'), 'r')
  assert.equal(semaforoChequeo(500, 'media'), 'a')
})

test('resumen de chequeos: agrega sedes, rellena ceros y calcula salud', () => {
  const filas = [
    { clave: 'inventario_negativo', sede_id: 's1', n: 2, importe: 0, desde: '2026-10-01', hasta: '2026-10-05' },
    { clave: 'inventario_negativo', sede_id: 's2', n: 1, importe: 0, desde: '2026-09-20', hasta: '2026-10-10' },
    { clave: 'cuadre_edr_ingresos', sede_id: 's1', n: 1, importe: -150.5, desde: '2026-09-01', hasta: '2026-09-01' },
    { clave: 'cuadre_edr_gastos', sede_id: null, n: 1, importe: 20, desde: '2026-09-01', hasta: '2026-09-01' },
  ]
  const r = resumenChequeos(filas)
  assert.equal(r.length, CHEQUEOS.length)
  const inv = r.find(c => c.clave === 'inventario_negativo')
  assert.equal(inv.n, 3); assert.equal(inv.sedes, 2); assert.equal(inv.desde, '2026-09-20'); assert.equal(inv.semaforo, 'a')
  assert.equal(r.find(c => c.clave === 'cuadre_edr_ingresos').semaforo, 'r')
  assert.equal(r.find(c => c.clave === 'notas_sin_firmar').n, 0)
  const t = totalesValidacion(r)
  assert.equal(t.global, 'r'); assert.equal(t.problemas, 5); assert.equal(t.v + t.a + t.r, CHEQUEOS.length)
  assert.equal(saludPct(t), Math.round((t.v / t.total) * 100))
  // filtrar por sede: s2 solo ve su inventario y las filas sin sede
  const s2 = resumenChequeos(filas, { sedeId: 's2' })
  assert.equal(s2.find(c => c.clave === 'inventario_negativo').n, 1)
  assert.equal(s2.find(c => c.clave === 'cuadre_edr_ingresos').n, 0)
  assert.equal(s2.find(c => c.clave === 'cuadre_edr_gastos').n, 1)
})

test('exportación de detalle con etiquetas en español', () => {
  const f = filasExportables([{ clave: 'notas_sin_firmar', referencia: 'S1-CON-1', fecha: '2026-10-20', importe: null, descripcion: 'x' }])
  assert.equal(f[0].chequeo, 'Notas clínicas sin firmar')
})

test('consulta: solo vistas de la lista blanca, sin vistas de pacientes', () => {
  assert.ok(esVistaPermitida('prp_ingresos'))
  assert.ok(!esVistaPermitida('prp_pacientes'))
  assert.ok(!esVistaPermitida('pacientes'))
  assert.ok(!esVistaPermitida('prp_ingresos; drop table x'))
  assert.ok(!esVistaPermitida('constructor'))
  for (const v of VISTAS_PERMITIDAS) assert.match(v.vista, /^prp_[a-z_]+$/)
  for (const prohibida of ['prp_pacientes', 'prp_expediente_resumen', 'prp_seguimiento_clinico', 'prp_ventas', 'prp_recibos_nomina', 'prp_empleados']) assert.ok(!esVistaPermitida(prohibida), prohibida)
})

test('consulta: valida columnas, operadores y limita filas', () => {
  const ok = validarConsulta({ vista: 'prp_ingresos', columnas: ['importe', 'fecha_pago'], filtros: [{ columna: 'importe', op: 'gte', valor: '100' }, { columna: 'concepto', op: 'ilike', valor: 'ticket' }], limite: 99999 }, ['importe', 'fecha_pago', 'concepto'])
  assert.ok(ok.ok); assert.equal(ok.consulta.limite, LIMITE_FILAS)
  const mala = validarConsulta({ vista: 'prp_ingresos', filtros: [{ columna: 'importe; drop', op: 'gte', valor: '1' }, { columna: 'importe', op: 'sql', valor: '1' }] })
  assert.ok(!mala.ok); assert.equal(mala.consulta.filtros.length, 0)
  assert.ok(!validarConsulta({ vista: 'prp_pacientes' }).ok)
  assert.ok(!validarConsulta({ vista: 'prp_ingresos', columnas: ['no_existe'] }, ['importe']).ok)
  assert.equal(validarConsulta({ vista: 'prp_ingresos', limite: 0 }).consulta.limite, 500)
  assert.ok(!validarConsulta({ vista: 'prp_ingresos', orden: { columna: 'x y' } }).ok)
  const vacio = validarConsulta({ vista: 'prp_ingresos', filtros: [{ columna: 'importe', op: 'eq', valor: '' }] })
  assert.equal(vacio.consulta.filtros.length, 0)
})

test('consulta: filtros estructurados → formato de leer()', () => {
  const f = aFiltrosLeer([{ columna: 'estado', op: 'eq', valor: 'cobrada' }, { columna: 'fecha_pago', op: 'gte', valor: '2026-10-01' }, { columna: 'fecha_pago', op: 'lte', valor: '2026-10-31' }, { columna: 'concepto', op: 'ilike', valor: 'a,b(%)' }])
  assert.equal(f.estado, 'cobrada')
  assert.deepEqual(f.fecha_pago, { gte: '2026-10-01', lte: '2026-10-31' })
  assert.deepEqual(f.concepto, { ilike: '%a b%' })
  assert.equal(tipoColumna([{ a: 1 }], 'a'), 'numero'); assert.equal(tipoColumna([{ a: '2026-10-01' }], 'a'), 'fecha'); assert.equal(tipoColumna([{ a: null }], 'a'), 'texto')
})

test('consulta: la bitácora no guarda los valores de los filtros', () => {
  const d = detalleBitacora({ vista: 'prp_gastos', columnas: [], filtros: [{ columna: 'proveedor_texto', op: 'ilike', valor: 'secreto' }], limite: 100 }, 12)
  assert.ok(!JSON.stringify(d).includes('secreto'))
  assert.equal(d.filas, 12); assert.equal(d.columnas, 'todas')
})

test('entrega: pasos con datos objetivos, avisos y progreso', () => {
  const vacio = armarEntrega({}, [])
  assert.equal(vacio.length, PASOS.length)
  assert.ok(vacio.every(p => p.estado === 'pendiente'))
  assert.equal(progresoEntrega(vacio).pct, 0)
  const ind = { sedes_activas: 2, cabinas_activas: 4, horarios_activos: 20, administradores: 1, podologos: 3, recepcion: 2, servicios: 10, servicios_con_precio: 10, plantillas_activas: 5, aviso_activo: 1, emisores_fiscales: 1, csd_cargado: true, csd_vigencia: '2099-01-01', pac_modo: 'produccion', importaciones_cargadas: 1, pacientes: 400 }
  const lleno = armarEntrega(ind, [])
  assert.ok(lleno.filter(p => p.clave !== 'capacitacion').every(p => p.auto === true && /puedes marcarlo/.test(p.aviso)))
  assert.equal(lleno.find(p => p.clave === 'capacitacion').auto, null)
  const marcado = armarEntrega({}, [{ clave: 'sedes', estado: 'completado' }])
  assert.match(marcado[0].aviso, /no lo respaldan/)
  const todos = PASOS.map(p => ({ clave: p.clave, estado: p.clave === 'importacion' ? 'no_aplica' : 'completado' }))
  const pr = progresoEntrega(armarEntrega(ind, todos))
  assert.equal(pr.pct, 100); assert.ok(pr.listo); assert.equal(pr.noAplica, 1)
  assert.equal(progresoEntrega(armarEntrega(ind, [{ clave: 'sedes', estado: 'completado' }, { clave: 'usuarios', estado: 'en_proceso' }])).pct, 14)
  const cfdiVencido = armarEntrega({ ...ind, csd_vigencia: '2020-01-01' }, []).find(p => p.clave === 'cfdi')
  assert.equal(cfdiVencido.auto, false); assert.match(cfdiVencido.detalle, /vencido/)
})

test('catálogos: columnas técnicas ocultas y búsqueda', () => {
  const filas = [{ id: 'x', organizacion_id: 'o', catalogo: 'estado_civil', nombre: 'Soltero(a)', editable: true, created_at: 't' }, { id: 'y', catalogo: 'parentesco', nombre: 'Madre / Padre', editable: false }]
  assert.deepEqual(columnasDe(filas), ['catalogo', 'nombre', 'editable'])
  assert.ok(columnasDe(filas, { tecnicas: true }).includes('id'))
  assert.equal(filtrarFilas(filas, 'madre').length, 1)
  assert.equal(filtrarFilas(filas, '').length, 2)
  assert.equal(textoCelda(true), 'Sí'); assert.equal(textoCelda(['a', 'b']), 'a, b'); assert.equal(textoCelda(null), '')
})

test('asistente: filtros, agrupación y resumen de accesos', () => {
  const a = [
    { vista: 'prp_nps_mensual', created_at: '2026-10-20T10:00:00Z', filas_devueltas: 12, identifica_paciente: false, permitido: true },
    { vista: 'prp_pacientes', created_at: '2026-10-20T11:00:00Z', filas_devueltas: 0, identifica_paciente: true, permitido: false, motivo_bloqueo: 'sin permiso de expediente' },
    { vista: 'prp_nps_mensual', created_at: '2026-09-02T09:00:00Z', filas_devueltas: 3, identifica_paciente: false, permitido: true },
  ]
  assert.equal(filtrarAccesos(a, { mes: '2026-10' }).length, 2)
  assert.equal(filtrarAccesos(a, { soloBloqueados: true }).length, 1)
  assert.equal(filtrarAccesos(a, { soloPaciente: true })[0].vista, 'prp_pacientes')
  assert.equal(filtrarAccesos(a, { texto: 'expediente' }).length, 1)
  assert.deepEqual(mesesDe(a), ['2026-10', '2026-09'])
  assert.equal(agruparPorDia(a)[0][0], '2026-10-20')
  const r = resumenAccesos(a)
  assert.equal(r.total, 3); assert.equal(r.bloqueados, 1); assert.equal(r.filas, 15); assert.equal(r.vistaTop.vista, 'prp_nps_mensual')
})
