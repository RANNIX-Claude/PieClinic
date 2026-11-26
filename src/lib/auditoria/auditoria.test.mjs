// node --test src/lib/auditoria  ·  reglas duras de roles, captura a ciegas, topes de configuración, tope de custodia, hora y huella.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MATRIZ_AUDITORIA, CAPS_AUDITORIA, rolAuditoria, puedeAuditoria, CAMPOS_CIEGOS, limpiarParaSucursal, esCampoCiego } from './roles.js'
import { validarParametro, puedeAgregarCustodia, TOPE_CUSTODIA, DEFINICIONES } from './config.js'
import { diferenciaSegundos, hayDiscrepancia } from './hora.js'
import { sha256Hex, esHashValido } from './hash.js'

test('mapeo de roles de Pie Firme al módulo', () => {
  assert.equal(rolAuditoria('administrador'), 'dueno')
  assert.equal(rolAuditoria('supervisor'), 'supervisor')
  assert.equal(rolAuditoria('recepcion'), 'sucursal')
  assert.equal(rolAuditoria('podologo'), 'sucursal')
  assert.equal(rolAuditoria('administrador', true), 'soporte', 'superadmin RANNIX = soporte')
  assert.equal(rolAuditoria('otro'), null)
})

test('matriz de la especificación: quién captura, ve diferencias, investiga, autoriza y configura', () => {
  const quien = cap => ['dueno', 'supervisor', 'sucursal', 'soporte'].filter(r => MATRIZ_AUDITORIA[r].includes(cap))
  assert.deepEqual(quien('capturar'), ['dueno', 'supervisor', 'sucursal'], 'el soporte no captura')
  assert.deepEqual(quien('ver_diferencias'), ['dueno', 'supervisor', 'soporte'], 'encargado/cajero NUNCA ven la diferencia')
  assert.deepEqual(quien('investigar'), ['dueno', 'supervisor'])
  assert.deepEqual(quien('autorizar'), ['dueno'], 'solo el dueño autoriza ajustes')
  assert.deepEqual(quien('configurar'), ['dueno', 'soporte'], 'el supervisor no configura')
  assert.deepEqual(quien('ver_directo'), ['dueno', 'supervisor'], 'el soporte lee por RPC con bitácora, no directo')
  for (const cap of CAPS_AUDITORIA) assert.ok(quien(cap).length > 0)
})

test('reglas duras: ningún rol de sucursal ve saldo o diferencia; nadie salvo el dueño autoriza', () => {
  for (const rol of ['recepcion', 'podologo']) {
    assert.equal(puedeAuditoria(rol, 'ver_diferencias'), false)
    assert.equal(puedeAuditoria(rol, 'ver_directo'), false)
    assert.equal(puedeAuditoria(rol, 'investigar'), false)
    assert.equal(puedeAuditoria(rol, 'autorizar'), false)
    assert.equal(puedeAuditoria(rol, 'configurar'), false)
    assert.equal(puedeAuditoria(rol, 'capturar'), true)
  }
  assert.equal(puedeAuditoria('supervisor', 'autorizar'), false)
  assert.equal(puedeAuditoria('supervisor', 'configurar'), false)
  assert.equal(puedeAuditoria('administrador', 'autorizar'), true)
  assert.equal(puedeAuditoria('administrador', 'autorizar', true), false, 'la cuenta de soporte no autoriza aunque sea administradora de la clínica')
  assert.equal(puedeAuditoria('administrador', 'capturar', true), false)
  assert.equal(puedeAuditoria('administrador', 'configurar', true), true)
})

test('captura a ciegas: el serializador quita saldo, diferencia y valor esperado, a cualquier profundidad', () => {
  const sucio = { id: 1, producto: 'x', cantidad_fisica: 3, saldo_sistema: 5, diferencia_piezas: -2, diferencia_valor: -20, valor_esperado: 100,
    partidas: [{ id: 2, saldo_sistema: 1, nota: 'ok', anidado: { precio_catalogo: 9, codigo: 'a' } }], valor_diferencia: 4 }
  const limpio = limpiarParaSucursal(sucio)
  assert.deepEqual(limpio, { id: 1, producto: 'x', cantidad_fisica: 3, partidas: [{ id: 2, nota: 'ok', anidado: { codigo: 'a' } }] })
  assert.ok(!JSON.stringify(limpio).match(/saldo|diferencia|esperado|catalogo/))
  for (const k of CAMPOS_CIEGOS) assert.ok(esCampoCiego(k))
})

test('topes de configuración (espejo de la base)', () => {
  assert.equal(validarParametro('muestra_aleatoria', 100).ok, true)
  assert.equal(validarParametro('muestra_aleatoria', 101).ok, false)
  assert.match(validarParametro('muestra_aleatoria', 101).error, /tope/i)
  assert.equal(validarParametro('descuento_sin_clave_pct', 15).ok, true)
  assert.equal(validarParametro('descuento_sin_clave_pct', 16).ok, false)
  assert.equal(validarParametro('dias_gracia_precio', 90).ok, true)
  assert.equal(validarParametro('dias_gracia_precio', 91).ok, false)
  assert.equal(validarParametro('retencion_fotos_dias', 365).ok, true)
  assert.equal(validarParametro('retencion_fotos_dias', 366).ok, false)
  assert.equal(validarParametro('foto_lado_largo_px', 2400).ok, true)
  assert.equal(validarParametro('foto_lado_largo_px', 2401).ok, false)
  assert.equal(validarParametro('muestra_aleatoria', 0).ok, false)
  assert.equal(validarParametro('muestra_aleatoria', 'abc').ok, false)
  assert.equal(validarParametro('frecuencia_conteo_completo', 'semanal').ok, true)
  assert.equal(validarParametro('frecuencia_conteo_completo', 'cada_hora').ok, false)
  assert.equal(validarParametro('inventado', 1).ok, false)
})

test('tolerancia de kits mayor a 0 exige confirmación del dueño', () => {
  assert.deepEqual(validarParametro('tolerancia_kits', 0), { ok: true })
  assert.deepEqual(validarParametro('tolerancia_kits', 1), { ok: true, requiereConfirmacion: true })
  assert.equal(validarParametro('tolerancia_efectivo', 50).requiereConfirmacion, undefined)
})

test('omisiones de la especificación', () => {
  assert.equal(DEFINICIONES.muestra_aleatoria.omision, 20)
  assert.equal(DEFINICIONES.tolerancia_efectivo.omision, 20)
  assert.equal(DEFINICIONES.tolerancia_kits.omision, 0)
  assert.equal(DEFINICIONES.descuento_sin_clave_pct.omision, 0)
  assert.equal(DEFINICIONES.dias_gracia_precio.omision, 30)
  assert.equal(DEFINICIONES.retencion_fotos_dias.omision, 90)
  assert.equal(DEFINICIONES.foto_lado_largo_px.omision, 1600)
  assert.equal(DEFINICIONES.auditoria_remota_limite_min.omision, 120)
  assert.equal(DEFINICIONES.ocupacion_min_min.omision, 5)
})

test('custodia: tope duro de 30 activos por sucursal', () => {
  assert.equal(TOPE_CUSTODIA, 30)
  assert.equal(puedeAgregarCustodia(29).ok, true)
  const r = puedeAgregarCustodia(30)
  assert.equal(r.ok, false)
  assert.match(r.error, /30/)
  assert.match(r.error, /evidencia falsa/)
  assert.equal(puedeAgregarCustodia(200).ok, false)
})

test('hora: discrepancia mayor a 5 minutos', () => {
  const t = Date.UTC(2026, 10, 26, 12, 0, 0)
  assert.equal(hayDiscrepancia(t + 299_000, t), false)
  assert.equal(hayDiscrepancia(t + 301_000, t), true)
  assert.equal(hayDiscrepancia(t - 3_600_000, t), true)
  assert.equal(diferenciaSegundos(t - 60_000, t), -60)
})

test('sha256 de fotos: estable y de 64 hex', async () => {
  const h = await sha256Hex('abc')
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.ok(esHashValido(h))
  assert.equal(esHashValido('ABC'), false)
  assert.equal(await sha256Hex(new Uint8Array([97, 98, 99])), h)
  assert.notEqual(await sha256Hex('abd'), h)
})
