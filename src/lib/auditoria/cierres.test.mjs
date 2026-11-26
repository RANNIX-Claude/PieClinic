// Pruebas de la lógica de cierres (Etapa 4):  node --test src/lib/auditoria
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DENOMINACIONES, totalDenominaciones, validarDesglose, validarCapturaPunto, resolverPuntos, instantanea, puntosDeCierre, progresoRecorrido, siguientePendiente,
  toleranciaPunto, evaluarDiferencia, cuadreKits, aplicaToma, tipoCasoDeFormula, entregaCuadra, puedeAceptarEntrega, estadoAlCerrar, tieneCamposEsperado,
} from './cierres.js'
import { escalaFoto, mismaImagen, hashDeFoto, rutaFotoCierre, LADO_LARGO_POR_OMISION } from './foto.js'

const P = (o) => ({ id: o.id ?? o.nombre, grupo_id: o.grupo_id ?? o.nombre, version: 1, activo: true, vigente_hasta: null, sucursales: null, orden: 100,
  aplica_apertura: false, aplica_turno: true, aplica_dia: false, aplica_semanal: false, obligatorio: true, ...o })

test('denominaciones: el total es la suma del desglose, en centavos exactos', () => {
  assert.equal(totalDenominaciones([{ denominacion: 500, cantidad: 2 }, { denominacion: 0.5, cantidad: 3 }, { denominacion: 20, cantidad: 1 }]), 1021.5)
  assert.equal(totalDenominaciones([]), 0)
  assert.equal(totalDenominaciones(DENOMINACIONES.map(d => ({ denominacion: d, cantidad: 1 }))), 1888.5)
})

test('denominaciones SIN campo de total: un total tecleado se rechaza (como el servidor)', () => {
  const d = [{ denominacion: 100, cantidad: 3 }]
  assert.equal(validarCapturaPunto('denominaciones', { denominaciones: d }).ok, true)
  const r = validarCapturaPunto('denominaciones', { valor: 300, denominaciones: d })
  assert.equal(r.ok, false)
  assert.match(r.error, /no existe un campo de total/)
  assert.equal(validarCapturaPunto('denominaciones', {}).ok, false)
  assert.equal(validarDesglose([{ denominacion: 7, cantidad: 1 }]).ok, false)
  assert.equal(validarDesglose([{ denominacion: 100, cantidad: -1 }]).ok, false)
  assert.equal(validarDesglose([{ denominacion: 100, cantidad: 1.5 }]).ok, false)
  assert.equal(validarDesglose([{ denominacion: 100, cantidad: 1 }, { denominacion: 100, cantidad: 2 }]).ok, false)
})

test('tipos de captura: número, piezas, número y foto, solo foto', () => {
  assert.equal(validarCapturaPunto('numero', { valor: 1250.5 }).ok, true)
  assert.equal(validarCapturaPunto('numero', { valor: '' }).ok, false)
  assert.equal(validarCapturaPunto('numero', { valor: -1 }).ok, false)
  assert.equal(validarCapturaPunto('conteo_piezas', { valor: 0 }).ok, true)
  assert.equal(validarCapturaPunto('numero_y_foto', { valor: 10 }).ok, true)
  assert.equal(validarCapturaPunto('solo_foto', {}).ok, true)
  assert.equal(validarCapturaPunto('solo_foto', { valor: 5 }).ok, false)
  assert.equal(validarCapturaPunto('numero', { valor: 5, denominaciones: [{ denominacion: 5, cantidad: 1 }] }).ok, false)
})

test('resolver puntos: activos, vigentes, de la sucursal y del tipo, ordenados (agregar un control es configuración)', () => {
  const puntos = [
    P({ nombre: 'Efectivo', orden: 10, aplica_dia: true }),
    P({ nombre: 'Terminal', orden: 20 }),
    P({ nombre: 'Solo día', orden: 5, aplica_turno: false, aplica_dia: true }),
    P({ nombre: 'Inactivo', activo: false }),
    P({ nombre: 'Vieja versión', vigente_hasta: '2026-01-01' }),
    P({ nombre: 'Solo Chalco', sucursales: ['A'], orden: 30 }),
    P({ nombre: 'Apertura', aplica_turno: false, aplica_apertura: true }),
  ]
  assert.deepEqual(resolverPuntos(puntos, { sucursalId: 'B', tipo: 'turno' }).map(p => p.nombre), ['Efectivo', 'Terminal'])
  assert.deepEqual(resolverPuntos(puntos, { sucursalId: 'A', tipo: 'turno' }).map(p => p.nombre), ['Efectivo', 'Terminal', 'Solo Chalco'])
  assert.deepEqual(resolverPuntos(puntos, { sucursalId: 'B', tipo: 'dia' }).map(p => p.nombre), ['Solo día', 'Efectivo'])
  assert.deepEqual(resolverPuntos(puntos, { sucursalId: 'B', tipo: 'apertura' }).map(p => p.nombre), ['Apertura'])
  assert.deepEqual(resolverPuntos(puntos, { sucursalId: 'B', tipo: 'semanal' }), [])
  assert.deepEqual(resolverPuntos(puntos, { sucursalId: 'B', tipo: 'desconocido' }), [])
})

test('versionado (criterio 22): un cierre viejo se consulta con la versión de su fecha, no con la vigente', () => {
  const v1 = P({ id: 'p1', grupo_id: 'g', nombre: 'Efectivo', version: 1, vigente_hasta: '2026-09-01', tolerancia: 20 })
  const v2 = P({ id: 'p2', grupo_id: 'g', nombre: 'Efectivo y vales', version: 2, tolerancia: 50 })
  const cierreAgosto = instantanea(resolverPuntos([{ ...v1, vigente_hasta: null }], { sucursalId: 'A', tipo: 'turno' }))
  assert.deepEqual(cierreAgosto, [{ punto_id: 'p1', grupo_id: 'g', version: 1 }])
  const visto = puntosDeCierre(cierreAgosto, [v1, v2])
  assert.equal(visto[0].version, 1)
  assert.equal(visto[0].nombre, 'Efectivo')
  assert.equal(visto[0].tolerancia, 20)
})

test('progreso: no se cierra sin completar los obligatorios; se retoma donde se iba', () => {
  const puntos = [
    { nombre: 'Efectivo', obligatorio: true, completo: true }, { nombre: 'Terminal', obligatorio: true, completo: false },
    { nombre: 'Foto extra', obligatorio: false, completo: false }, { nombre: 'Kits', obligatorio: true, completo: false },
  ]
  const p = progresoRecorrido(puntos)
  assert.equal(p.puedeCerrar, false)
  assert.deepEqual(p.faltan, ['Terminal', 'Kits'])
  assert.equal(p.porcentaje, 25)
  assert.equal(siguientePendiente(puntos), 1)
  puntos[1].completo = true; puntos[3].completo = true
  assert.equal(progresoRecorrido(puntos).puedeCerrar, true)
})

test('tolerancia: ±$20 en efectivo por omisión, 0 en kits y la del punto en el resto', () => {
  assert.equal(toleranciaPunto({ formula_esperado: 'efectivo_esperado', tolerancia: 99 }), 20)
  assert.equal(toleranciaPunto({ formula_esperado: 'efectivo_esperado' }, { tolerancia_efectivo: 35 }), 35)
  assert.equal(toleranciaPunto({ formula_esperado: 'kits_usados', tolerancia: 5 }), 0)
  assert.equal(toleranciaPunto({ formula_esperado: 'tarjeta_esperada', tolerancia: 7 }), 7)
  assert.deepEqual(evaluarDiferencia(1000, 1015, 20), { diferencia: -15, dentro: true })
  assert.deepEqual(evaluarDiferencia(1000, 1020, 20), { diferencia: -20, dentro: true })
  assert.deepEqual(evaluarDiferencia(1000, 1020.01, 20), { diferencia: -20.01, dentro: false })
  assert.deepEqual(evaluarDiferencia(1050, 1000, 20), { diferencia: 50, dentro: false })
  assert.deepEqual(evaluarDiferencia(100, null, 20), { diferencia: null, dentro: null })
  assert.equal(evaluarDiferencia(0.1 + 0.2, 0.3, 0).dentro, true, 'sin errores de punto flotante')
})

test('cuadre de kits (criterio 20): 12 kits usados y 10 tickets son dos servicios sin cobro', () => {
  const r = cuadreKits({ anterior: 50, recibido: 0, quedan: 38, serviciosCobrados: 10 })
  assert.equal(r.usados, 12)
  assert.equal(r.esperado, 10)
  assert.equal(r.sinCobro, 2)
  assert.equal(r.dentro, false)
  assert.match(r.alerta, /2 servicio/)
  const ok = cuadreKits({ anterior: 50, recibido: 20, quedan: 60, serviciosCobrados: 10 })
  assert.equal(ok.dentro, true)
  assert.equal(ok.alerta, null)
  assert.equal(cuadreKits({ anterior: 10, recibido: 0, quedan: 4, serviciosCobrados: 3, kitsPorServicio: 2 }).dentro, true)
  assert.equal(tipoCasoDeFormula('kits_usados'), 'diferencia_kits')
  assert.equal(tipoCasoDeFormula('efectivo_esperado'), 'diferencia_efectivo')
})

test('entrega con doble firma: cuadra solo si es exactamente el mismo monto; quien entrega no acepta', () => {
  assert.equal(entregaCuadra(1520.5, 1520.5), true)
  assert.equal(entregaCuadra(1520.5, 1520), false)
  assert.equal(entregaCuadra(0.1 + 0.2, 0.3), true)
  assert.equal(puedeAceptarEntrega('u1', 'u2'), true)
  assert.equal(puedeAceptarEntrega('u1', 'u1'), false)
  assert.equal(puedeAceptarEntrega('u1', null), false)
  assert.equal(estadoAlCerrar({ tipo: 'turno' }), 'entrega_no_aceptada')
  assert.equal(estadoAlCerrar({ tipo: 'turno', conEntrega: false }), 'cerrado')
  assert.equal(estadoAlCerrar({ tipo: 'dia' }), 'cerrado')
})

test('tomas fijas: a qué tipo de cierre aplica cada una', () => {
  assert.equal(aplicaToma('cierre_apertura', 'apertura'), true)
  assert.equal(aplicaToma('cierre_apertura', 'dia'), true)
  assert.equal(aplicaToma('cierre_apertura', 'semanal'), false)
  assert.equal(aplicaToma('semanal', 'semanal'), true)
  assert.equal(aplicaToma('semanal', 'turno'), false)
  assert.equal(aplicaToma('ambos', 'semanal'), true)
})

test('captura a ciegas: la respuesta al que captura no trae esperado, diferencia, tolerancia ni corte', () => {
  const respuesta = { ok: true, folio: 'CIE-2026-00001', estado: 'entrega_no_aceptada', entrega_id: 'x' }
  assert.equal(tieneCamposEsperado(respuesta), false)
  const recorrido = { cierre: { id: 'c' }, puntos: [{ nombre: 'Efectivo', captura: { id: 'k', valor: 100, denominaciones: [{ denominacion: 100, cantidad: 1 }] }, completo: true }], progreso: {} }
  assert.equal(tieneCamposEsperado(recorrido), false)
  assert.equal(tieneCamposEsperado({ puntos: [{ captura: { valor_esperado: 5 } }] }), true)
  assert.equal(tieneCamposEsperado({ corte: {} }), true)
})

test('foto: el lado largo se reduce a 1,600 px por omisión y nunca pasa del tope de 2,400; no agranda', () => {
  assert.deepEqual(escalaFoto(4000, 3000), { ancho: 1600, alto: 1200, escala: 0.4 })
  assert.deepEqual(escalaFoto(3000, 4000), { ancho: 1200, alto: 1600, escala: 0.4 })
  assert.equal(escalaFoto(1000, 800).escala, 1)
  assert.equal(escalaFoto(6000, 3000, 9999).ancho, 2400)
  assert.equal(escalaFoto(4000, 3000, 100).ancho, 320)
  assert.equal(LADO_LARGO_POR_OMISION, 1600)
})

test('foto: sha256 en el cliente; la misma imagen produce el mismo hash y una distinta no (criterio 6)', async () => {
  const a = await hashDeFoto(new Uint8Array([1, 2, 3, 4]))
  const b = await hashDeFoto(new Uint8Array([1, 2, 3, 4]))
  const c = await hashDeFoto(new Uint8Array([1, 2, 3, 5]))
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.equal(mismaImagen(a, b), true)
  assert.equal(mismaImagen(a, c), false)
  assert.equal(mismaImagen(a, null), false)
  assert.equal(rutaFotoCierre('org', 'suc', 'id1'), 'org/ctl/suc/id1.jpg')
})
