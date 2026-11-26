// node --test src/lib/auditoria  ·  Casos (Etapa 3): qué puede hacer cada rol con un caso, validaciones del cierre, signo del ajuste, par de sustitución y reportes.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  accionesCaso, validarCierre, validarTexto, validarFechaCompromiso, sumarDias, deltaDelAjuste, tieneAjusteDeInventario, esContraparte, esPrincipalDePar, rolDePar,
  causasParaGrafica, totalesPorCausa, fraseRecurrencia, antiguedadTexto, cuboAntiguedad, mensajeAutorizacion, esAbierto, NOMBRE_RESPONSABLE, AVISO_EMPLEADO,
  RESPONSABLES_COSTO, TOPE_FECHA_COMPROMISO_DIAS,
} from './casoReglas.js'

const caso = (o = {}) => ({ estado: 'en_investigacion', producto_id: 'p1', cantidad: -2, causa_id: 'c1', responsable_costo: 'empresa', monto_costo: 10, contexto: {}, ...o })

test('el signo del ajuste: faltante negativo, sobrante positivo, nada sin diferencia', () => {
  assert.equal(deltaDelAjuste(-2).tipo, 'faltante'); assert.equal(deltaDelAjuste(-2).delta, -2)
  assert.equal(deltaDelAjuste('3').tipo, 'sobrante'); assert.equal(deltaDelAjuste(3).delta, 3)
  assert.equal(deltaDelAjuste(0).tipo, 'ninguno'); assert.equal(deltaDelAjuste(null).tipo, 'ninguno')
  assert.equal(tieneAjusteDeInventario(caso()), true)
  assert.equal(tieneAjusteDeInventario(caso({ cantidad: null })), false, 'un caso de precio o «no reportado» no lleva ajuste')
  assert.equal(tieneAjusteDeInventario(caso({ producto_id: null })), false, 'un caso de efectivo tampoco')
})

test('solo investigan dueño y supervisor; sucursal no ve nada y soporte solo lee', () => {
  for (const rol of ['dueno', 'supervisor']) {
    const a = accionesCaso({ caso: caso(), rolAud: rol, yo: {} })
    assert.equal(a.puedeComentar, true, rol); assert.equal(a.puedeAdjuntar, true, rol); assert.equal(a.puedeAsignar, true, rol); assert.equal(a.puedeProponerCierre, true, rol)
  }
  const s = accionesCaso({ caso: caso(), rolAud: 'sucursal', yo: {} })
  assert.equal(s.puedeVer, false); assert.equal(s.puedeComentar, false); assert.equal(s.puedeTomar, false); assert.equal(s.puedeAutorizar, false)
  const so = accionesCaso({ caso: caso(), rolAud: 'soporte', yo: {} })
  assert.equal(so.puedeVer, true); assert.equal(so.soloLectura, true)
  for (const k of ['puedeComentar', 'puedeAdjuntar', 'puedeTomar', 'puedeAsignar', 'puedeProponerCierre', 'puedeCerrarSinAjuste', 'puedeRechazar', 'puedeAutorizar', 'puedeReintentar']) assert.equal(so[k], false, `soporte no ${k}`)
})

test('autoriza SOLO el dueño y distinto de quien capturó (criterio 2); el supervisor recibe el porqué', () => {
  assert.equal(accionesCaso({ caso: caso(), rolAud: 'dueno', yo: { capture: false } }).puedeAutorizar, true)
  const propio = accionesCaso({ caso: caso(), rolAud: 'dueno', yo: { capture: true } })
  assert.equal(propio.puedeAutorizar, false); assert.match(propio.motivos.autorizar, /capturó/); assert.match(propio.motivos.autorizar, /otra persona/)
  const sup = accionesCaso({ caso: caso(), rolAud: 'supervisor', yo: { investigue: true } })
  assert.equal(sup.puedeAutorizar, false); assert.match(sup.motivos.autorizar, /solo del dueño/)
  // el dueño que investigó SÍ puede (la regla de investigó≠autoriza exceptúa al dueño)
  assert.equal(accionesCaso({ caso: caso(), rolAud: 'dueno', yo: { investigue: true } }).puedeAutorizar, true)
})

test('autorizar exige propuesta completa y un ajuste de inventario; reintentar solo en ajuste fallido', () => {
  const sinCausa = accionesCaso({ caso: caso({ causa_id: null }), rolAud: 'dueno', yo: {} })
  assert.equal(sinCausa.puedeAutorizar, false); assert.match(sinCausa.motivos.autorizar, /propuesta de cierre/)
  assert.equal(accionesCaso({ caso: caso({ monto_costo: null }), rolAud: 'dueno', yo: {} }).puedeAutorizar, false)
  const precio = accionesCaso({ caso: caso({ cantidad: null }), rolAud: 'dueno', yo: {} })
  assert.equal(precio.puedeAutorizar, false); assert.match(precio.motivos.autorizar, /no tiene un ajuste/)
  const fallido = accionesCaso({ caso: caso({ estado: 'ajuste_fallido' }), rolAud: 'dueno', yo: {} })
  assert.equal(fallido.puedeReintentar, true); assert.equal(fallido.puedeAutorizar, false); assert.equal(fallido.puedeVolverAInvestigar, true)
  assert.equal(accionesCaso({ caso: caso({ estado: 'ajuste_fallido' }), rolAud: 'supervisor', yo: {} }).puedeReintentar, false)
  const cerrada = accionesCaso({ caso: caso({ estado: 'cerrada_con_ajuste' }), rolAud: 'dueno', yo: {} })
  for (const k of ['puedeComentar', 'puedeAdjuntar', 'puedeTomar', 'puedeAsignar', 'puedeAutorizar', 'puedeReintentar', 'puedeCerrarSinAjuste', 'puedeRechazar']) assert.equal(cerrada[k], false, `un caso cerrado no admite ${k}`)
})

test('quien capturó no cierra ni rechaza su propio caso; abierta pide tomarlo antes de cerrar', () => {
  const propio = accionesCaso({ caso: caso(), rolAud: 'supervisor', yo: { capture: true } })
  assert.equal(propio.puedeCerrarSinAjuste, false); assert.equal(propio.puedeRechazar, false); assert.match(propio.motivos.cerrar, /no puede cerrar ni rechazar su propio caso/)
  const ajeno = accionesCaso({ caso: caso(), rolAud: 'supervisor', yo: {} })
  assert.equal(ajeno.puedeCerrarSinAjuste, true); assert.equal(ajeno.puedeRechazar, true)
  const abierta = accionesCaso({ caso: caso({ estado: 'abierta' }), rolAud: 'supervisor', yo: {} })
  assert.equal(abierta.puedeTomar, true); assert.equal(abierta.puedeCerrarSinAjuste, false); assert.equal(abierta.puedeRechazar, false); assert.equal(abierta.puedeProponerCierre, false)
})

test('sustitución de código: la acción es del principal; la contraparte solo comenta', () => {
  const principal = caso({ contexto: { sustitucion: { rol: 'faltante_caro' } } }), contra = caso({ cantidad: 1, contexto: { sustitucion: { rol: 'sobrante_barato' } } })
  assert.equal(rolDePar(principal), 'faltante_caro'); assert.equal(esPrincipalDePar(principal), true); assert.equal(esContraparte(contra), true); assert.equal(esContraparte(caso()), false)
  const a = accionesCaso({ caso: contra, rolAud: 'dueno', yo: {} })
  assert.equal(a.puedeComentar, true); for (const k of ['puedeTomar', 'puedeAsignar', 'puedeProponerCierre', 'puedeCerrarSinAjuste', 'puedeRechazar', 'puedeAutorizar']) assert.equal(a[k], false, k)
  assert.ok(a.motivos.contraparte)
  assert.equal(accionesCaso({ caso: principal, rolAud: 'dueno', yo: {} }).puedeAutorizar, true)
})

test('cierre: causa de catálogo, quién absorbe, monto con tope y nota donde la causa la exige', () => {
  assert.equal(validarCierre({ causaId: 'c1', responsable: 'empresa', monto: 0 }).ok, true)
  const vacio = validarCierre({ causaId: '', responsable: '', monto: '' })
  assert.deepEqual(Object.keys(vacio.errores).sort(), ['causa', 'monto', 'responsable'])
  assert.equal(validarCierre({ causaId: 'c', causaRequiereNota: true, responsable: 'seguro', monto: 5, nota: 'corta' }).errores.nota !== undefined, true)
  assert.equal(validarCierre({ causaId: 'c', causaRequiereNota: true, responsable: 'seguro', monto: 5, nota: 'una nota suficiente' }).ok, true)
  assert.equal(validarCierre({ causaId: 'c', responsable: 'banco', monto: 1 }).errores.responsable !== undefined, true)
  assert.equal(validarCierre({ causaId: 'c', responsable: 'empresa', monto: -1 }).errores.monto !== undefined, true)
  assert.match(validarCierre({ causaId: 'c', responsable: 'empresa', monto: 500, tope: 100 }).errores.monto, /mayor al valor al costo/)
  assert.equal(validarCierre({ causaId: 'c', responsable: 'empresa', monto: 100, tope: 100 }).ok, true)
  assert.deepEqual(RESPONSABLES_COSTO, ['empresa', 'proveedor', 'empleado', 'seguro'])
})

test('«empleado» es registro de control interno, sin nada que sugiera nómina', () => {
  assert.match(NOMBRE_RESPONSABLE.empleado, /registro de control interno/i)
  assert.match(AVISO_EMPLEADO, /no es una instrucción de descuento a nómina/i)
  assert.match(AVISO_EMPLEADO, /Ley Federal del Trabajo/)
  for (const t of Object.values(NOMBRE_RESPONSABLE)) assert.doesNotMatch(t, /descontar|descuento a|nómina de/i)
})

test('fecha compromiso: hoy en adelante, tope 180 días; resolución y motivo ≥ 10 caracteres', () => {
  assert.equal(validarFechaCompromiso('2026-12-01', '2026-11-26').ok, true)
  assert.equal(validarFechaCompromiso('2026-11-26', '2026-11-26').ok, true)
  assert.equal(validarFechaCompromiso('2026-11-25', '2026-11-26').ok, false)
  assert.equal(validarFechaCompromiso('', '2026-11-26').ok, false)
  assert.equal(validarFechaCompromiso(sumarDias('2026-11-26', TOPE_FECHA_COMPROMISO_DIAS), '2026-11-26').ok, true)
  assert.equal(validarFechaCompromiso(sumarDias('2026-11-26', TOPE_FECHA_COMPROMISO_DIAS + 1), '2026-11-26').ok, false)
  assert.equal(validarTexto('muy corto').ok, false); assert.equal(validarTexto('Apareció la pieza').ok, true)
})

test('estados abiertos, antigüedad y mensajes de autorización', () => {
  assert.deepEqual(['abierta', 'en_investigacion', 'ajuste_fallido', 'cerrada_con_ajuste', 'cerrada_sin_ajuste', 'rechazada'].map(esAbierto), [true, true, true, false, false, false])
  assert.equal(antiguedadTexto(0), 'hoy'); assert.equal(antiguedadTexto(1), '1 día'); assert.equal(antiguedadTexto(12), '12 días'); assert.equal(antiguedadTexto(null), '—')
  assert.deepEqual([0, 5, 10, 20].map(cuboAntiguedad), ['v', 'b', 'a', 'r'])
  assert.match(mensajeAutorizacion({ ok: false, error: 'contrasena_incorrecta' }), /contraseña completa/)
  assert.match(mensajeAutorizacion({ ok: false, estado: 'ajuste_fallido', mensaje: 'producto de otra clínica' }), /se puede reintentar/)
  assert.match(mensajeAutorizacion({ ok: true, idempotente: true }), /no se duplicó/)
  assert.match(mensajeAutorizacion({ ok: true, par: true }), /dos movimientos/)
})

test('reportes: la gráfica de causas agrupa por sucursal y la recurrencia se presenta como indicador, no como conclusión', () => {
  const rows = [{ sucursal: 'B', causa: 'Robo', casos: 2 }, { sucursal: 'A', causa: 'Robo', casos: 1 }, { sucursal: 'A', causa: 'Error en el conteo', casos: 4 }]
  const g = causasParaGrafica(rows)
  assert.deepEqual(g.causas, ['Error en el conteo', 'Robo']); assert.deepEqual(g.filas.map(f => f.sucursal), ['A', 'B'])
  assert.equal(g.filas[0]['Error en el conteo'], 4); assert.equal(g.filas[1].Robo, 2)
  assert.deepEqual(totalesPorCausa(rows), [{ causa: 'Error en el conteo', casos: 4 }, { causa: 'Robo', casos: 3 }])
  const f = fraseRecurrencia({ nombre: 'Persona X', relevos_con_diferencia: 3, relevos_totales: 20 })
  assert.match(f, /indicador para investigar/); assert.match(f, /de 20 relevos/); assert.doesNotMatch(f, /culpable|sospechos|robó/i)
})
