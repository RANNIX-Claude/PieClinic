import test from 'node:test'
import assert from 'node:assert/strict'
import {
  consultaEditable, transicionConsultaValida, puedeAgregarNotaAclaratoria, validarNotaAclaratoria, motivosBloqueoCierre,
  fusionDeshacible, validarRetiroFoto, fotoPublicable, transicionOrdenValida, anticipoOrdenCubierto, fotoExcedeLimiteBlando,
} from './inmutabilidad.js'

const podologo = { id: 'p1', rol: 'podologo', cedula: '9876543' }
const base = { id: 'c1', podologo_id: 'p1', estado: 'borrador', motivo_consulta: 'm', padecimiento_actual: 'p', nota_evolucion: 'n', pronostico: 'bueno' }
const dx = [{ tipo: 'principal' }]

test('nota firmada: no editable; borrador y pendiente sí (P-001)', () => {
  assert.equal(consultaEditable({ estado: 'cerrada' }), false)
  assert.equal(consultaEditable({ estado: 'borrador' }), true)
  assert.equal(consultaEditable({ estado: 'pendiente_firma' }), true)
  assert.equal(consultaEditable(null), false)
})
test('transiciones: cerrada es terminal', () => {
  assert.equal(transicionConsultaValida('borrador', 'cerrada'), true)
  assert.equal(transicionConsultaValida('borrador', 'pendiente_firma'), true)
  assert.equal(transicionConsultaValida('pendiente_firma', 'borrador'), true)
  assert.equal(transicionConsultaValida('cerrada', 'borrador'), false)
  assert.equal(transicionConsultaValida('cerrada', 'pendiente_firma'), false)
})
test('nota aclaratoria: solo sobre cerrada, autor podólogo y ≥ 5 caracteres', () => {
  assert.equal(puedeAgregarNotaAclaratoria(podologo, { ...base, estado: 'cerrada' }), true)
  assert.equal(puedeAgregarNotaAclaratoria(podologo, base), false)
  assert.equal(puedeAgregarNotaAclaratoria({ id: 'otro', rol: 'podologo' }, { ...base, estado: 'cerrada' }), false)
  assert.equal(puedeAgregarNotaAclaratoria({ id: 'p1', rol: 'administrador' }, { ...base, estado: 'cerrada' }), false)
  assert.ok(validarNotaAclaratoria('  hola '))
  assert.equal(validarNotaAclaratoria('Se corrige el lado'), null)
})
test('cierre completo sin motivos de bloqueo', () => {
  assert.deepEqual(motivosBloqueoCierre({ consulta: base, perfil: podologo, diagnosticos: dx }), [])
})
test('cierre: faltantes, cédula, menor sin tutor y aviso sin excepción', () => {
  const m = motivosBloqueoCierre({
    consulta: { ...base, nota_evolucion: ' ', pronostico: null }, perfil: { id: 'p1', rol: 'podologo', cedula: '' },
    diagnosticos: [{ tipo: 'secundario' }], esMenor: true, tutorVigente: false, avisoFirmado: false, firmaVacia: true,
  })
  assert.equal(m.length, 7)
  assert.ok(m.some(x => /cédula/.test(x)))
  assert.ok(m.some(x => /tutor/.test(x)))
  assert.ok(m.some(x => /excepción/.test(x)))
  assert.ok(m.some(x => /diagnóstico principal/.test(x)))
  assert.deepEqual(motivosBloqueoCierre({ consulta: { ...base, excepcion_autorizada_por: 'a1' }, perfil: podologo, diagnosticos: dx, avisoFirmado: false }), [])
})
test('cierre: otro podólogo no firma y la nota cerrada no vuelve a cerrarse', () => {
  assert.ok(motivosBloqueoCierre({ consulta: base, perfil: { id: 'x', cedula: '1' }, diagnosticos: dx }).some(x => /Solo el podólogo/.test(x)))
  assert.equal(motivosBloqueoCierre({ consulta: { ...base, estado: 'cerrada' }, perfil: podologo, diagnosticos: dx }).length, 1)
})
test('fusión: se deshace dentro de los 30 días y una sola vez (P-006)', () => {
  const f = { limite_deshacer: '2026-11-20T00:00:00Z', deshecha_en: null }
  assert.equal(fusionDeshacible(f, new Date('2026-11-01T00:00:00Z')), true)
  assert.equal(fusionDeshacible(f, new Date('2026-11-21T00:00:00Z')), false)
  assert.equal(fusionDeshacible({ ...f, deshecha_en: '2026-11-02' }, new Date('2026-11-03')), false)
})
test('fotos: retiro con motivo, límite blando y docencia', () => {
  assert.ok(validarRetiroFoto(''))
  assert.equal(validarRetiroFoto('Foto duplicada'), null)
  assert.equal(fotoExcedeLimiteBlando(10), true)
  assert.equal(fotoExcedeLimiteBlando(9), false)
  assert.equal(fotoPublicable({ nivel_autorizacion: 'clinico' }), true)
  assert.equal(fotoPublicable({ nivel_autorizacion: 'docencia', autorizacion_vigente: true, difuminada: false }), false)
  assert.equal(fotoPublicable({ nivel_autorizacion: 'docencia', autorizacion_vigente: true, difuminada: true }), true)
})
test('orden de plantilla y anticipo 50 % (P-075)', () => {
  assert.equal(transicionOrdenValida('borrador', 'enviada'), true)
  assert.equal(transicionOrdenValida('borrador', 'entregada'), false)
  assert.equal(transicionOrdenValida('entregada', 'cancelada'), false)
  assert.equal(anticipoOrdenCubierto(2100, 1000), false)
  assert.equal(anticipoOrdenCubierto(2100, 1050), true)
})
